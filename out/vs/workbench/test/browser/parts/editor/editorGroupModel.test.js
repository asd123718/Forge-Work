import assert from "assert";
import { EditorGroupModel, isGroupEditorChangeEvent, isGroupEditorCloseEvent, isGroupEditorMoveEvent, isGroupEditorOpenEvent } from "../../../../common/editor/editorGroupModel.js";
import { EditorExtensions, CloseDirection, EditorsOrder, SideBySideEditor, EditorCloseContext, GroupModelChangeKind } from "../../../../common/editor.js";
import { URI } from "../../../../../base/common/uri.js";
import { TestLifecycleService, workbenchInstantiationService } from "../../workbenchTestServices.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { TestContextService, TestStorageService } from "../../../common/workbenchTestServices.js";
import { EditorInput } from "../../../../common/editor/editorInput.js";
import { SideBySideEditorInput } from "../../../../common/editor/sideBySideEditorInput.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("EditorGroupModel", () => {
  let testInstService;
  suiteTeardown(() => {
    testInstService?.dispose();
    testInstService = void 0;
  });
  function inst() {
    if (!testInstService) {
      testInstService = new TestInstantiationService();
    }
    const inst2 = testInstService;
    inst2.stub(IStorageService, disposables.add(new TestStorageService()));
    inst2.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    inst2.stub(IWorkspaceContextService, new TestContextService());
    inst2.stub(ITelemetryService, NullTelemetryService);
    const config = new TestConfigurationService();
    config.setUserConfiguration("workbench", { editor: { openPositioning: "right", focusRecentEditorAfterClose: true } });
    inst2.stub(IConfigurationService, config);
    return inst2;
  }
  function createEditorGroupModel(serialized) {
    const group = disposables.add(inst().createInstance(EditorGroupModel, serialized));
    disposables.add(toDisposable(() => {
      for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
        group.closeEditor(editor);
      }
    }));
    return group;
  }
  function closeAllEditors(group) {
    for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL)) {
      group.closeEditor(editor, void 0, false);
    }
  }
  function closeEditors(group, except, direction) {
    const index2 = group.indexOf(except);
    if (index2 === -1) {
      return;
    }
    if (direction === CloseDirection.LEFT) {
      for (let i = index2 - 1; i >= 0; i--) {
        group.closeEditor(group.getEditorByIndex(i));
      }
    } else if (direction === CloseDirection.RIGHT) {
      for (let i = group.getEditors(EditorsOrder.SEQUENTIAL).length - 1; i > index2; i--) {
        group.closeEditor(group.getEditorByIndex(i));
      }
    } else {
      group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).filter((editor) => !editor.matches(except)).forEach((editor) => group.closeEditor(editor));
    }
  }
  function groupListener(group) {
    const groupEvents = {
      active: [],
      index: [],
      label: [],
      locked: [],
      opened: [],
      closed: [],
      activated: [],
      pinned: [],
      unpinned: [],
      sticky: [],
      unsticky: [],
      transient: [],
      moved: [],
      disposed: []
    };
    disposables.add(group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LOCKED) {
        groupEvents.locked.push(group.id);
        return;
      } else if (e.kind === GroupModelChangeKind.GROUP_ACTIVE) {
        groupEvents.active.push(group.id);
        return;
      } else if (e.kind === GroupModelChangeKind.GROUP_INDEX) {
        groupEvents.index.push(group.id);
        return;
      } else if (e.kind === GroupModelChangeKind.GROUP_LABEL) {
        groupEvents.label.push(group.id);
        return;
      }
      if (!e.editor) {
        return;
      }
      switch (e.kind) {
        case GroupModelChangeKind.EDITOR_OPEN:
          if (isGroupEditorOpenEvent(e)) {
            groupEvents.opened.push(e);
          }
          break;
        case GroupModelChangeKind.EDITOR_CLOSE:
          if (isGroupEditorCloseEvent(e)) {
            groupEvents.closed.push(e);
          }
          break;
        case GroupModelChangeKind.EDITOR_ACTIVE:
          if (isGroupEditorChangeEvent(e)) {
            groupEvents.activated.push(e);
          }
          break;
        case GroupModelChangeKind.EDITOR_PIN:
          if (isGroupEditorChangeEvent(e)) {
            group.isPinned(e.editor) ? groupEvents.pinned.push(e) : groupEvents.unpinned.push(e);
          }
          break;
        case GroupModelChangeKind.EDITOR_STICKY:
          if (isGroupEditorChangeEvent(e)) {
            group.isSticky(e.editor) ? groupEvents.sticky.push(e) : groupEvents.unsticky.push(e);
          }
          break;
        case GroupModelChangeKind.EDITOR_TRANSIENT:
          if (isGroupEditorChangeEvent(e)) {
            groupEvents.transient.push(e);
          }
          break;
        case GroupModelChangeKind.EDITOR_MOVE:
          if (isGroupEditorMoveEvent(e)) {
            groupEvents.moved.push(e);
          }
          break;
        case GroupModelChangeKind.EDITOR_WILL_DISPOSE:
          if (isGroupEditorChangeEvent(e)) {
            groupEvents.disposed.push(e);
          }
          break;
      }
    }));
    return groupEvents;
  }
  let index = 0;
  class TestEditorInput extends EditorInput {
    constructor(id) {
      super();
      this.id = id;
      this.resource = void 0;
    }
    get typeId() {
      return "testEditorInputForGroups";
    }
    async resolve() {
      return null;
    }
    matches(other) {
      return other && this.id === other.id && other instanceof TestEditorInput;
    }
    setDirty() {
      this._onDidChangeDirty.fire();
    }
    setLabel() {
      this._onDidChangeLabel.fire();
    }
  }
  class NonSerializableTestEditorInput extends EditorInput {
    constructor(id) {
      super();
      this.id = id;
      this.resource = void 0;
    }
    get typeId() {
      return "testEditorInputForGroups-nonSerializable";
    }
    async resolve() {
      return null;
    }
    matches(other) {
      return other && this.id === other.id && other instanceof NonSerializableTestEditorInput;
    }
  }
  class TestFileEditorInput extends EditorInput {
    constructor(id, resource) {
      super();
      this.id = id;
      this.resource = resource;
      this.preferredResource = this.resource;
    }
    get typeId() {
      return "testFileEditorInputForGroups";
    }
    get editorId() {
      return this.id;
    }
    async resolve() {
      return null;
    }
    setPreferredName(name) {
    }
    setPreferredDescription(description) {
    }
    setPreferredResource(resource) {
    }
    async setEncoding(encoding) {
    }
    getEncoding() {
      return void 0;
    }
    setPreferredEncoding(encoding) {
    }
    setForceOpenAsBinary() {
    }
    setPreferredContents(contents) {
    }
    setLanguageId(languageId) {
    }
    setPreferredLanguageId(languageId) {
    }
    isResolved() {
      return false;
    }
    matches(other) {
      if (super.matches(other)) {
        return true;
      }
      if (other instanceof TestFileEditorInput) {
        return isEqual(other.resource, this.resource);
      }
      return false;
    }
  }
  function input(id = String(index++), nonSerializable, resource) {
    if (resource) {
      return disposables.add(new TestFileEditorInput(id, resource));
    }
    return nonSerializable ? disposables.add(new NonSerializableTestEditorInput(id)) : disposables.add(new TestEditorInput(id));
  }
  const _TestEditorInputSerializer = class _TestEditorInputSerializer {
    canSerialize(editorInput) {
      return true;
    }
    serialize(editorInput) {
      if (_TestEditorInputSerializer.disableSerialize) {
        return void 0;
      }
      const testEditorInput = editorInput;
      const testInput = {
        id: testEditorInput.id
      };
      return JSON.stringify(testInput);
    }
    deserialize(instantiationService, serializedEditorInput) {
      if (_TestEditorInputSerializer.disableDeserialize) {
        return void 0;
      }
      const testInput = JSON.parse(serializedEditorInput);
      return disposables.add(new TestEditorInput(testInput.id));
    }
  };
  _TestEditorInputSerializer.disableSerialize = false;
  _TestEditorInputSerializer.disableDeserialize = false;
  let TestEditorInputSerializer = _TestEditorInputSerializer;
  const disposables = new DisposableStore();
  setup(() => {
    TestEditorInputSerializer.disableSerialize = false;
    TestEditorInputSerializer.disableDeserialize = false;
    disposables.add(Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer("testEditorInputForGroups", TestEditorInputSerializer));
  });
  teardown(() => {
    disposables.clear();
    index = 1;
  });
  test("Clone Group", function() {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: false, active: true });
    group.stick(input2);
    assert.ok(group.isSticky(input2));
    assert.strictEqual(group.isLocked, false);
    group.lock(true);
    assert.strictEqual(group.isLocked, true);
    const clone = disposables.add(group.clone());
    assert.notStrictEqual(group.id, clone.id);
    assert.strictEqual(clone.count, 3);
    assert.strictEqual(clone.isLocked, false);
    let didEditorLabelChange = false;
    const toDispose = clone.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
        didEditorLabelChange = true;
      }
    });
    input1.setLabel();
    assert.ok(didEditorLabelChange);
    assert.strictEqual(clone.isPinned(input1), true);
    assert.strictEqual(clone.isActive(input1), false);
    assert.strictEqual(clone.isSticky(input1), false);
    assert.strictEqual(clone.isPinned(input2), true);
    assert.strictEqual(clone.isActive(input2), false);
    assert.strictEqual(clone.isSticky(input2), true);
    assert.strictEqual(clone.isPinned(input3), false);
    assert.strictEqual(clone.isActive(input3), true);
    assert.strictEqual(clone.isSticky(input3), false);
    toDispose.dispose();
  });
  test("isActive - untyped", () => {
    const group = createEditorGroupModel();
    const input2 = disposables.add(new TestFileEditorInput("testInput", URI.file("fake")));
    const input22 = disposables.add(new TestFileEditorInput("testInput2", URI.file("fake2")));
    const untypedInput = { resource: URI.file("/fake"), options: { override: "testInput" } };
    const untypedNonActiveInput = { resource: URI.file("/fake2"), options: { override: "testInput2" } };
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input22, { active: false });
    assert.ok(group.isActive(input2));
    assert.ok(group.isActive(untypedInput));
    assert.ok(!group.isActive(untypedNonActiveInput));
  });
  test("openEditor - prefers existing side by side editor if same", () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const group = createEditorGroupModel();
    const input1 = disposables.add(new TestFileEditorInput("testInput", URI.file("fake1")));
    const input2 = disposables.add(new TestFileEditorInput("testInput", URI.file("fake2")));
    const sideBySideInputSame = instantiationService.createInstance(SideBySideEditorInput, void 0, void 0, input1, input1);
    const sideBySideInputDifferent = instantiationService.createInstance(SideBySideEditorInput, void 0, void 0, input1, input2);
    let res = group.openEditor(sideBySideInputSame, { pinned: true, active: true });
    assert.strictEqual(res.editor, sideBySideInputSame);
    assert.strictEqual(res.isNew, true);
    res = group.openEditor(input1, { pinned: true, active: true, supportSideBySide: SideBySideEditor.BOTH });
    assert.strictEqual(res.editor, sideBySideInputSame);
    assert.strictEqual(res.isNew, false);
    group.closeEditor(sideBySideInputSame);
    res = group.openEditor(sideBySideInputDifferent, { pinned: true, active: true });
    assert.strictEqual(res.editor, sideBySideInputDifferent);
    assert.strictEqual(res.isNew, true);
    res = group.openEditor(input1, { pinned: true, active: true });
    assert.strictEqual(res.editor, input1);
    assert.strictEqual(res.isNew, true);
  });
  test("indexOf() - prefers direct matching editor over side by side matching one", () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const group = createEditorGroupModel();
    const input1 = disposables.add(new TestFileEditorInput("testInput", URI.file("fake1")));
    const sideBySideInput = instantiationService.createInstance(SideBySideEditorInput, void 0, void 0, input1, input1);
    group.openEditor(sideBySideInput, { pinned: true, active: true });
    assert.strictEqual(group.indexOf(sideBySideInput), 0);
    assert.strictEqual(group.indexOf(input1), -1);
    assert.strictEqual(group.indexOf(input1, void 0, { supportSideBySide: SideBySideEditor.BOTH }), 0);
    assert.strictEqual(group.indexOf(input1, void 0, { supportSideBySide: SideBySideEditor.ANY }), 0);
    group.openEditor(input1, { pinned: true, active: true });
    assert.strictEqual(group.indexOf(input1), 1);
    assert.strictEqual(group.indexOf(input1, void 0, { supportSideBySide: SideBySideEditor.BOTH }), 1);
    assert.strictEqual(group.indexOf(input1, void 0, { supportSideBySide: SideBySideEditor.ANY }), 1);
  });
  test("contains() - untyped", function() {
    const group = createEditorGroupModel();
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const input1 = input("input1", false, URI.file("/input1"));
    const input2 = input("input2", false, URI.file("/input2"));
    const untypedInput1 = { resource: URI.file("/input1"), options: { override: "input1" } };
    const untypedInput2 = { resource: URI.file("/input2"), options: { override: "input2" } };
    const diffInput1 = instantiationService.createInstance(DiffEditorInput, "name", "description", input1, input2, void 0);
    const diffInput2 = instantiationService.createInstance(DiffEditorInput, "name", "description", input2, input1, void 0);
    const untypedDiffInput1 = {
      original: untypedInput1,
      modified: untypedInput2
    };
    const untypedDiffInput2 = {
      original: untypedInput2,
      modified: untypedInput1
    };
    const sideBySideInputSame = instantiationService.createInstance(SideBySideEditorInput, "name", void 0, input1, input1);
    const sideBySideInputDifferent = instantiationService.createInstance(SideBySideEditorInput, "name", void 0, input1, input2);
    const untypedSideBySideInputSame = {
      primary: untypedInput1,
      secondary: untypedInput1
    };
    const untypedSideBySideInputDifferent = {
      primary: untypedInput2,
      secondary: untypedInput1
    };
    group.openEditor(input1, { pinned: true, active: true });
    assert.strictEqual(group.contains(untypedInput1), true);
    assert.strictEqual(group.contains(untypedInput1, { strictEquals: true }), false);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH }), true);
    assert.strictEqual(group.contains(untypedInput2), false);
    assert.strictEqual(group.contains(untypedInput2, { strictEquals: true }), false);
    assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.ANY }), false);
    assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.BOTH }), false);
    assert.strictEqual(group.contains(untypedDiffInput1), false);
    assert.strictEqual(group.contains(untypedDiffInput2), false);
    group.openEditor(input2, { pinned: true, active: true });
    assert.strictEqual(group.contains(untypedInput1), true);
    assert.strictEqual(group.contains(untypedInput2), true);
    assert.strictEqual(group.contains(untypedDiffInput1), false);
    assert.strictEqual(group.contains(untypedDiffInput2), false);
    group.openEditor(diffInput1, { pinned: true, active: true });
    assert.strictEqual(group.contains(untypedInput1), true);
    assert.strictEqual(group.contains(untypedInput2), true);
    assert.strictEqual(group.contains(untypedDiffInput1), true);
    assert.strictEqual(group.contains(untypedDiffInput2), false);
    group.openEditor(diffInput2, { pinned: true, active: true });
    assert.strictEqual(group.contains(untypedInput1), true);
    assert.strictEqual(group.contains(untypedInput2), true);
    assert.strictEqual(group.contains(untypedDiffInput1), true);
    assert.strictEqual(group.contains(untypedDiffInput2), true);
    group.closeEditor(input1);
    assert.strictEqual(group.contains(untypedInput1), false);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH }), false);
    assert.strictEqual(group.contains(untypedInput2), true);
    assert.strictEqual(group.contains(untypedDiffInput1), true);
    assert.strictEqual(group.contains(untypedDiffInput2), true);
    group.closeEditor(input2);
    assert.strictEqual(group.contains(untypedInput1), false);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(untypedInput2), false);
    assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(untypedDiffInput1), true);
    assert.strictEqual(group.contains(untypedDiffInput2), true);
    group.closeEditor(diffInput1);
    assert.strictEqual(group.contains(untypedInput1), false);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(untypedInput2), false);
    assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(untypedDiffInput1), false);
    assert.strictEqual(group.contains(untypedDiffInput2), true);
    group.closeEditor(diffInput2);
    assert.strictEqual(group.contains(untypedInput1), false);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), false);
    assert.strictEqual(group.contains(untypedInput2), false);
    assert.strictEqual(group.contains(untypedInput2, { supportSideBySide: SideBySideEditor.ANY }), false);
    assert.strictEqual(group.contains(untypedDiffInput1), false);
    assert.strictEqual(group.contains(untypedDiffInput2), false);
    assert.strictEqual(group.count, 0);
    group.openEditor(sideBySideInputSame, { pinned: true, active: true });
    assert.strictEqual(group.contains(untypedSideBySideInputSame), true);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH }), true);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY, strictEquals: true }), false);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH, strictEquals: true }), false);
    group.closeEditor(sideBySideInputSame);
    assert.strictEqual(group.count, 0);
    group.openEditor(sideBySideInputDifferent, { pinned: true, active: true });
    assert.strictEqual(group.contains(untypedSideBySideInputDifferent), true);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(untypedInput1, { supportSideBySide: SideBySideEditor.BOTH }), false);
  });
  test("contains()", () => {
    const group = createEditorGroupModel();
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const input1 = input();
    const input2 = input();
    const diffInput1 = instantiationService.createInstance(DiffEditorInput, "name", "description", input1, input2, void 0);
    const diffInput2 = instantiationService.createInstance(DiffEditorInput, "name", "description", input2, input1, void 0);
    const sideBySideInputSame = instantiationService.createInstance(SideBySideEditorInput, "name", void 0, input1, input1);
    const sideBySideInputDifferent = instantiationService.createInstance(SideBySideEditorInput, "name", void 0, input1, input2);
    group.openEditor(input1, { pinned: true, active: true });
    assert.strictEqual(group.contains(input1), true);
    assert.strictEqual(group.contains(input1, { strictEquals: true }), true);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(input2), false);
    assert.strictEqual(group.contains(input2, { strictEquals: true }), false);
    assert.strictEqual(group.contains(input2, { supportSideBySide: SideBySideEditor.ANY }), false);
    assert.strictEqual(group.contains(diffInput1), false);
    assert.strictEqual(group.contains(diffInput2), false);
    group.openEditor(input2, { pinned: true, active: true });
    assert.strictEqual(group.contains(input1), true);
    assert.strictEqual(group.contains(input2), true);
    assert.strictEqual(group.contains(diffInput1), false);
    assert.strictEqual(group.contains(diffInput2), false);
    group.openEditor(diffInput1, { pinned: true, active: true });
    assert.strictEqual(group.contains(input1), true);
    assert.strictEqual(group.contains(input2), true);
    assert.strictEqual(group.contains(diffInput1), true);
    assert.strictEqual(group.contains(diffInput2), false);
    group.openEditor(diffInput2, { pinned: true, active: true });
    assert.strictEqual(group.contains(input1), true);
    assert.strictEqual(group.contains(input2), true);
    assert.strictEqual(group.contains(diffInput1), true);
    assert.strictEqual(group.contains(diffInput2), true);
    group.closeEditor(input1);
    assert.strictEqual(group.contains(input1), false);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(input2), true);
    assert.strictEqual(group.contains(diffInput1), true);
    assert.strictEqual(group.contains(diffInput2), true);
    group.closeEditor(input2);
    assert.strictEqual(group.contains(input1), false);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(input2), false);
    assert.strictEqual(group.contains(input2, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(diffInput1), true);
    assert.strictEqual(group.contains(diffInput2), true);
    group.closeEditor(diffInput1);
    assert.strictEqual(group.contains(input1), false);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(input2), false);
    assert.strictEqual(group.contains(input2, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(diffInput1), false);
    assert.strictEqual(group.contains(diffInput2), true);
    group.closeEditor(diffInput2);
    assert.strictEqual(group.contains(input1), false);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), false);
    assert.strictEqual(group.contains(input2), false);
    assert.strictEqual(group.contains(input2, { supportSideBySide: SideBySideEditor.ANY }), false);
    assert.strictEqual(group.contains(diffInput1), false);
    assert.strictEqual(group.contains(diffInput2), false);
    const input3 = input(void 0, true, URI.parse("foo://bar"));
    const input4 = input(void 0, true, URI.parse("foo://barsomething"));
    group.openEditor(input3, { pinned: true, active: true });
    assert.strictEqual(group.contains(input4), false);
    assert.strictEqual(group.contains(input3), true);
    group.closeEditor(input3);
    assert.strictEqual(group.contains(input3), false);
    assert.strictEqual(group.count, 0);
    group.openEditor(sideBySideInputSame, { pinned: true, active: true });
    assert.strictEqual(group.contains(sideBySideInputSame), true);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.BOTH }), true);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY, strictEquals: true }), true);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.BOTH, strictEquals: true }), true);
    group.closeEditor(sideBySideInputSame);
    assert.strictEqual(group.count, 0);
    group.openEditor(sideBySideInputDifferent, { pinned: true, active: true });
    assert.strictEqual(group.contains(sideBySideInputDifferent), true);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY }), true);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.ANY, strictEquals: true }), true);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.BOTH }), false);
    assert.strictEqual(group.contains(input1, { supportSideBySide: SideBySideEditor.BOTH, strictEquals: true }), false);
  });
  test("group serialization", function() {
    inst().invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: false, active: true });
    let deserialized = createEditorGroupModel(group.serialize());
    assert.strictEqual(group.id, deserialized.id);
    assert.strictEqual(deserialized.count, 3);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 3);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 3);
    assert.strictEqual(deserialized.isPinned(input1), true);
    assert.strictEqual(deserialized.isPinned(input2), true);
    assert.strictEqual(deserialized.isPinned(input3), false);
    assert.strictEqual(deserialized.isActive(input3), true);
    TestEditorInputSerializer.disableSerialize = true;
    deserialized = createEditorGroupModel(group.serialize());
    assert.strictEqual(group.id, deserialized.id);
    assert.strictEqual(deserialized.count, 0);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    TestEditorInputSerializer.disableSerialize = false;
    TestEditorInputSerializer.disableDeserialize = true;
    deserialized = createEditorGroupModel(group.serialize());
    assert.strictEqual(group.id, deserialized.id);
    assert.strictEqual(deserialized.count, 0);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
  });
  test("group serialization (sticky editor)", function() {
    inst().invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: false, active: true });
    group.stick(input2);
    assert.ok(group.isSticky(input2));
    let deserialized = createEditorGroupModel(group.serialize());
    assert.strictEqual(group.id, deserialized.id);
    assert.strictEqual(deserialized.count, 3);
    assert.strictEqual(deserialized.isPinned(input1), true);
    assert.strictEqual(deserialized.isActive(input1), false);
    assert.strictEqual(deserialized.isSticky(input1), false);
    assert.strictEqual(deserialized.isPinned(input2), true);
    assert.strictEqual(deserialized.isActive(input2), false);
    assert.strictEqual(deserialized.isSticky(input2), true);
    assert.strictEqual(deserialized.isPinned(input3), false);
    assert.strictEqual(deserialized.isActive(input3), true);
    assert.strictEqual(deserialized.isSticky(input3), false);
    TestEditorInputSerializer.disableSerialize = true;
    deserialized = createEditorGroupModel(group.serialize());
    assert.strictEqual(group.id, deserialized.id);
    assert.strictEqual(deserialized.count, 0);
    assert.strictEqual(deserialized.stickyCount, 0);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    TestEditorInputSerializer.disableSerialize = false;
    TestEditorInputSerializer.disableDeserialize = true;
    deserialized = createEditorGroupModel(group.serialize());
    assert.strictEqual(group.id, deserialized.id);
    assert.strictEqual(deserialized.count, 0);
    assert.strictEqual(deserialized.stickyCount, 0);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(deserialized.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
  });
  test("group serialization (locked group)", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    assert.strictEqual(events.locked.length, 0);
    group.lock(true);
    group.lock(true);
    assert.strictEqual(events.locked.length, 1);
    group.lock(false);
    group.lock(false);
    assert.strictEqual(events.locked.length, 2);
  });
  test("locked group", function() {
    const group = createEditorGroupModel();
    group.lock(true);
    let deserialized = createEditorGroupModel(group.serialize());
    assert.strictEqual(group.id, deserialized.id);
    assert.strictEqual(deserialized.count, 0);
    assert.strictEqual(deserialized.isLocked, true);
    group.lock(false);
    deserialized = createEditorGroupModel(group.serialize());
    assert.strictEqual(group.id, deserialized.id);
    assert.strictEqual(deserialized.count, 0);
    assert.strictEqual(deserialized.isLocked, false);
  });
  test("index", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    assert.strictEqual(events.index.length, 0);
    group.setIndex(4);
    assert.strictEqual(events.index.length, 1);
  });
  test("label", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    assert.strictEqual(events.label.length, 0);
    group.setLabel("Window 1");
    assert.strictEqual(events.label.length, 1);
  });
  test("active", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    assert.strictEqual(events.active.length, 0);
    group.setActive(void 0);
    assert.strictEqual(events.active.length, 1);
  });
  test("One Editor", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    assert.strictEqual(group.count, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    const input1 = input();
    const { editor: openedEditor, isNew } = group.openEditor(input1, { active: true, pinned: true });
    assert.strictEqual(openedEditor, input1);
    assert.strictEqual(isNew, true);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
    assert.strictEqual(group.findEditor(input1)[0], input1);
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isPinned(input1), true);
    assert.strictEqual(group.isPinned(0), true);
    assert.strictEqual(group.isFirst(input1), true);
    assert.strictEqual(group.isLast(input1), true);
    assert.strictEqual(events.opened[0].editor, input1);
    assert.strictEqual(events.opened[0].editorIndex, 0);
    assert.strictEqual(events.activated[0].editor, input1);
    assert.strictEqual(events.activated[0].editorIndex, 0);
    const index2 = group.indexOf(input1);
    assert.strictEqual(group.findEditor(input1)[1], index2);
    let event = group.closeEditor(input1, EditorCloseContext.UNPIN);
    assert.strictEqual(event?.editor, input1);
    assert.strictEqual(event?.editorIndex, index2);
    assert.strictEqual(group.count, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(group.activeEditor, null);
    assert.strictEqual(group.isFirst(input1), false);
    assert.strictEqual(group.isLast(input1), false);
    assert.strictEqual(events.closed[0].editor, input1);
    assert.strictEqual(events.closed[0].editorIndex, 0);
    assert.strictEqual(events.closed[0].context === EditorCloseContext.UNPIN, true);
    const input2 = input();
    group.openEditor(input2, { active: true, pinned: false });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
    assert.strictEqual(group.activeEditor, input2);
    assert.strictEqual(group.isActive(input2), true);
    assert.strictEqual(group.isPinned(input2), false);
    assert.strictEqual(group.isPinned(0), false);
    assert.strictEqual(events.opened[1].editor, input2);
    assert.strictEqual(events.opened[1].editorIndex, 0);
    assert.strictEqual(events.activated[1].editor, input2);
    assert.strictEqual(events.activated[1].editorIndex, 0);
    group.closeEditor(input2);
    assert.strictEqual(group.count, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(group.activeEditor, null);
    assert.strictEqual(events.closed[1].editor, input2);
    assert.strictEqual(events.closed[1].editorIndex, 0);
    assert.strictEqual(events.closed[1].context === EditorCloseContext.REPLACE, false);
    event = group.closeEditor(input2);
    assert.ok(!event);
    assert.strictEqual(group.count, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(group.activeEditor, null);
    assert.strictEqual(events.closed[1].editor, input2);
    const input3 = input();
    group.openEditor(input3, { active: false, pinned: true });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.isActive(input3), true);
    assert.strictEqual(group.isPinned(input3), true);
    assert.strictEqual(group.isPinned(0), true);
    assert.strictEqual(events.opened[2].editor, input3);
    assert.strictEqual(events.activated[2].editor, input3);
    group.closeEditor(input3);
    assert.strictEqual(group.count, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(group.activeEditor, null);
    assert.strictEqual(events.closed[2].editor, input3);
    assert.strictEqual(events.opened[2].editor, input3);
    assert.strictEqual(events.activated[2].editor, input3);
    group.closeEditor(input3);
    assert.strictEqual(group.count, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(group.activeEditor, null);
    assert.strictEqual(events.closed[2].editor, input3);
    const input4 = input();
    group.openEditor(input4);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
    assert.strictEqual(group.activeEditor, input4);
    assert.strictEqual(group.isActive(input4), true);
    assert.strictEqual(group.isPinned(input4), false);
    assert.strictEqual(group.isPinned(0), false);
    assert.strictEqual(events.opened[3].editor, input4);
    assert.strictEqual(events.activated[3].editor, input4);
    group.closeEditor(input4);
    assert.strictEqual(group.count, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(group.activeEditor, null);
    assert.strictEqual(events.closed[3].editor, input4);
  });
  test("Multiple Editors - Pinned and Active", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    const input1 = input("1");
    const input1Copy = input("1");
    const input2 = input("2");
    const input3 = input("3");
    let openedEditorResult = group.openEditor(input1, { pinned: true, active: true });
    assert.strictEqual(openedEditorResult.editor, input1);
    assert.strictEqual(openedEditorResult.isNew, true);
    openedEditorResult = group.openEditor(input1Copy, { pinned: true, active: true });
    assert.strictEqual(openedEditorResult.editor, input1);
    assert.strictEqual(openedEditorResult.isNew, false);
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: true, active: true });
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 3);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.isActive(input1), false);
    assert.strictEqual(group.isPinned(input1), true);
    assert.strictEqual(group.isActive(input2), false);
    assert.strictEqual(group.isPinned(input2), true);
    assert.strictEqual(group.isActive(input3), true);
    assert.strictEqual(group.isPinned(input3), true);
    assert.strictEqual(group.isFirst(input1), true);
    assert.strictEqual(group.isFirst(input2), false);
    assert.strictEqual(group.isFirst(input3), false);
    assert.strictEqual(group.isLast(input1), false);
    assert.strictEqual(group.isLast(input2), false);
    assert.strictEqual(group.isLast(input3), true);
    assert.strictEqual(events.opened[0].editor, input1);
    assert.strictEqual(events.opened[1].editor, input2);
    assert.strictEqual(events.opened[2].editor, input3);
    assert.strictEqual(events.activated[0].editor, input1);
    assert.strictEqual(events.activated[0].editorIndex, 0);
    assert.strictEqual(events.activated[1].editor, input2);
    assert.strictEqual(events.activated[1].editorIndex, 1);
    assert.strictEqual(events.activated[2].editor, input3);
    assert.strictEqual(events.activated[2].editorIndex, 2);
    const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru[0], input3);
    assert.strictEqual(mru[1], input2);
    assert.strictEqual(mru[2], input1);
    const sameInput1 = input("1");
    group.openEditor(sameInput1, { pinned: true, active: true });
    assert.strictEqual(events.activated[3].editor, input1);
    assert.strictEqual(events.activated[3].editorIndex, 0);
    group.unpin(sameInput1);
    assert.strictEqual(events.unpinned[0].editor, input1);
    assert.strictEqual(events.unpinned[0].editorIndex, 0);
    group.pin(sameInput1);
    assert.strictEqual(events.pinned[0].editor, input1);
    assert.strictEqual(events.pinned[0].editorIndex, 0);
    group.stick(sameInput1);
    assert.strictEqual(events.sticky[0].editor, input1);
    assert.strictEqual(events.sticky[0].editorIndex, 0);
    group.unstick(sameInput1);
    assert.strictEqual(events.unsticky[0].editor, input1);
    assert.strictEqual(events.unsticky[0].editorIndex, 0);
    group.moveEditor(sameInput1, 1);
    assert.strictEqual(events.moved[0].editor, input1);
    assert.strictEqual(events.moved[0].oldEditorIndex, 0);
    assert.strictEqual(events.moved[0].editorIndex, 1);
    group.closeEditor(sameInput1);
    assert.strictEqual(events.closed[0].editor, input1);
    assert.strictEqual(events.closed[0].editorIndex, 1);
    closeAllEditors(group);
    assert.strictEqual(events.closed.length, 3);
    assert.strictEqual(group.count, 0);
  });
  test("Multiple Editors - Preview editor moves to the side of the active one", function() {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: false, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: true, active: true });
    assert.strictEqual(input3, group.getEditors(EditorsOrder.SEQUENTIAL)[2]);
    const input4 = input();
    group.openEditor(input4, { pinned: false, active: true });
    assert.strictEqual(input4, group.getEditors(EditorsOrder.SEQUENTIAL)[2]);
  });
  test("Multiple Editors - Pinned and Active (DEFAULT_OPEN_EDITOR_DIRECTION = Direction.LEFT)", function() {
    const inst2 = new TestInstantiationService();
    inst2.stub(IStorageService, disposables.add(new TestStorageService()));
    inst2.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    inst2.stub(IWorkspaceContextService, new TestContextService());
    inst2.stub(ITelemetryService, NullTelemetryService);
    const config = new TestConfigurationService();
    inst2.stub(IConfigurationService, config);
    config.setUserConfiguration("workbench", { editor: { openPositioning: "left" } });
    const group = disposables.add(inst2.createInstance(EditorGroupModel, void 0));
    const events = groupListener(group);
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: true, active: true });
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input3);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input1);
    closeAllEditors(group);
    assert.strictEqual(events.closed.length, 3);
    assert.strictEqual(group.count, 0);
    inst2.dispose();
  });
  test("Multiple Editors - Pinned and Not Active", function() {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true });
    group.openEditor(input2, { pinned: true });
    group.openEditor(input3, { pinned: true });
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 3);
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isPinned(input1), true);
    assert.strictEqual(group.isPinned(0), true);
    assert.strictEqual(group.isActive(input2), false);
    assert.strictEqual(group.isPinned(input2), true);
    assert.strictEqual(group.isPinned(1), true);
    assert.strictEqual(group.isActive(input3), false);
    assert.strictEqual(group.isPinned(input3), true);
    assert.strictEqual(group.isPinned(2), true);
    assert.strictEqual(group.isPinned(input3), true);
    const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru[0], input1);
    assert.strictEqual(mru[1], input3);
    assert.strictEqual(mru[2], input2);
  });
  test("Multiple Editors - Preview gets overwritten", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1);
    group.openEditor(input2);
    group.openEditor(input3);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.isActive(input3), true);
    assert.strictEqual(group.isPinned(input3), false);
    assert.strictEqual(!group.isPinned(input3), true);
    assert.strictEqual(events.opened[0].editor, input1);
    assert.strictEqual(events.opened[1].editor, input2);
    assert.strictEqual(events.opened[2].editor, input3);
    assert.strictEqual(events.closed[0].editor, input1);
    assert.strictEqual(events.closed[1].editor, input2);
    assert.strictEqual(events.closed[0].context === EditorCloseContext.REPLACE, true);
    assert.strictEqual(events.closed[1].context === EditorCloseContext.REPLACE, true);
    const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru[0], input3);
    assert.strictEqual(mru.length, 1);
  });
  test("Multiple Editors - set active", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: false, active: true });
    assert.strictEqual(group.activeEditor, input3);
    let mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru[0], input3);
    assert.strictEqual(mru[1], input2);
    assert.strictEqual(mru[2], input1);
    group.setActive(input3);
    assert.strictEqual(events.activated.length, 3);
    group.setActive(input1);
    assert.strictEqual(events.activated[3].editor, input1);
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isActive(input2), false);
    assert.strictEqual(group.isActive(input3), false);
    mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru[0], input1);
    assert.strictEqual(mru[1], input3);
    assert.strictEqual(mru[2], input2);
  });
  test("Multiple Editors - pin and unpin", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: false, active: true });
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.count, 3);
    group.pin(input3);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.isPinned(input3), true);
    assert.strictEqual(group.isActive(input3), true);
    assert.strictEqual(events.pinned[0].editor, input3);
    assert.strictEqual(group.count, 3);
    group.unpin(input1);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.isPinned(input1), false);
    assert.strictEqual(group.isActive(input1), false);
    assert.strictEqual(events.unpinned[0].editor, input1);
    assert.strictEqual(group.count, 3);
    group.unpin(input2);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input3);
    assert.strictEqual(events.closed[0].editor, input1);
    assert.strictEqual(group.count, 2);
    group.unpin(input3);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input3);
    assert.strictEqual(events.closed[1].editor, input2);
    assert.strictEqual(group.count, 1);
  });
  test("Multiple Editors - closing picks next from MRU list", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    const input1 = input();
    const input2 = input();
    const input3 = input();
    const input4 = input();
    const input5 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: true, active: true });
    group.openEditor(input4, { pinned: true, active: true });
    group.openEditor(input5, { pinned: true, active: true });
    assert.strictEqual(group.activeEditor, input5);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input5);
    assert.strictEqual(group.count, 5);
    group.closeEditor(input5);
    assert.strictEqual(group.activeEditor, input4);
    assert.strictEqual(events.activated[5].editor, input4);
    assert.strictEqual(group.count, 4);
    group.setActive(input1);
    group.setActive(input4);
    group.closeEditor(input4);
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.count, 3);
    group.closeEditor(input1);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.count, 2);
    group.setActive(input2);
    group.closeEditor(input2);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.count, 1);
    group.closeEditor(input3);
    assert.ok(!group.activeEditor);
    assert.strictEqual(group.count, 0);
  });
  test("Multiple Editors - closing picks next to the right", function() {
    const inst2 = new TestInstantiationService();
    inst2.stub(IStorageService, disposables.add(new TestStorageService()));
    inst2.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    inst2.stub(IWorkspaceContextService, new TestContextService());
    inst2.stub(ITelemetryService, NullTelemetryService);
    const config = new TestConfigurationService();
    config.setUserConfiguration("workbench", { editor: { focusRecentEditorAfterClose: false } });
    inst2.stub(IConfigurationService, config);
    const group = disposables.add(inst2.createInstance(EditorGroupModel, void 0));
    const events = groupListener(group);
    const input1 = input();
    const input2 = input();
    const input3 = input();
    const input4 = input();
    const input5 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: true, active: true });
    group.openEditor(input4, { pinned: true, active: true });
    group.openEditor(input5, { pinned: true, active: true });
    assert.strictEqual(group.activeEditor, input5);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input5);
    assert.strictEqual(group.count, 5);
    group.closeEditor(input5);
    assert.strictEqual(group.activeEditor, input4);
    assert.strictEqual(events.activated[5].editor, input4);
    assert.strictEqual(group.count, 4);
    group.setActive(input1);
    group.closeEditor(input1);
    assert.strictEqual(group.activeEditor, input2);
    assert.strictEqual(group.count, 3);
    group.setActive(input3);
    group.closeEditor(input3);
    assert.strictEqual(group.activeEditor, input4);
    assert.strictEqual(group.count, 2);
    group.closeEditor(input4);
    assert.strictEqual(group.activeEditor, input2);
    assert.strictEqual(group.count, 1);
    group.closeEditor(input2);
    assert.ok(!group.activeEditor);
    assert.strictEqual(group.count, 0);
    inst2.dispose();
  });
  test("Multiple Editors - move editor", function() {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    const input1 = input();
    const input2 = input();
    const input3 = input();
    const input4 = input();
    const input5 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.moveEditor(input1, 1);
    assert.strictEqual(events.moved[0].editor, input1);
    assert.strictEqual(events.moved[0].oldEditorIndex, 0);
    assert.strictEqual(events.moved[0].editorIndex, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input1);
    group.setActive(input1);
    group.openEditor(input3, { pinned: true, active: true });
    group.openEditor(input4, { pinned: true, active: true });
    group.openEditor(input5, { pinned: true, active: true });
    group.moveEditor(input4, 0);
    assert.strictEqual(events.moved[1].editor, input4);
    assert.strictEqual(events.moved[1].oldEditorIndex, 3);
    assert.strictEqual(events.moved[1].editorIndex, 0);
    assert.strictEqual(events.moved[1].editor, input4);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input4);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[3], input3);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[4], input5);
    group.moveEditor(input4, 3);
    group.moveEditor(input2, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input3);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[3], input4);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[4], input5);
    assert.strictEqual(events.moved.length, 4);
    group.moveEditor(input1, 0);
    assert.strictEqual(events.moved.length, 4);
    group.moveEditor(input1, -1);
    assert.strictEqual(events.moved.length, 4);
    group.moveEditor(input5, 4);
    assert.strictEqual(events.moved.length, 4);
    group.moveEditor(input5, 100);
    assert.strictEqual(events.moved.length, 4);
    group.moveEditor(input5, -1);
    assert.strictEqual(events.moved.length, 5);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input5);
    group.moveEditor(input1, 100);
    assert.strictEqual(events.moved.length, 6);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[4], input1);
  });
  test("Multiple Editors - move editor across groups", function() {
    const group1 = createEditorGroupModel();
    const group2 = createEditorGroupModel();
    const g1_input1 = input();
    const g1_input2 = input();
    const g2_input1 = input();
    group1.openEditor(g1_input1, { active: true, pinned: true });
    group1.openEditor(g1_input2, { active: true, pinned: true });
    group2.openEditor(g2_input1, { active: true, pinned: true });
    group2.closeEditor(g2_input1);
    group1.openEditor(g2_input1, { active: true, pinned: true, index: 1 });
    assert.strictEqual(group1.count, 3);
    assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[0], g1_input1);
    assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[1], g2_input1);
    assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[2], g1_input2);
  });
  test("Multiple Editors - move editor across groups (input already exists in group 1)", function() {
    const group1 = createEditorGroupModel();
    const group2 = createEditorGroupModel();
    const g1_input1 = input();
    const g1_input2 = input();
    const g1_input3 = input();
    const g2_input1 = g1_input2;
    group1.openEditor(g1_input1, { active: true, pinned: true });
    group1.openEditor(g1_input2, { active: true, pinned: true });
    group1.openEditor(g1_input3, { active: true, pinned: true });
    group2.openEditor(g2_input1, { active: true, pinned: true });
    group2.closeEditor(g2_input1);
    group1.openEditor(g2_input1, { active: true, pinned: true, index: 0 });
    assert.strictEqual(group1.count, 3);
    assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[0], g1_input2);
    assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[1], g1_input1);
    assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[2], g1_input3);
  });
  test("Multiple Editors - Pinned & Non Active", function() {
    const group = createEditorGroupModel();
    const input1 = input();
    group.openEditor(input1);
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.previewEditor, input1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
    assert.strictEqual(group.count, 1);
    const input2 = input();
    group.openEditor(input2, { pinned: true, active: false });
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.previewEditor, input1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
    assert.strictEqual(group.count, 2);
    const input3 = input();
    group.openEditor(input3, { pinned: true, active: false });
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.previewEditor, input1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input3);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input2);
    assert.strictEqual(group.isPinned(input1), false);
    assert.strictEqual(group.isPinned(input2), true);
    assert.strictEqual(group.isPinned(input3), true);
    assert.strictEqual(group.count, 3);
  });
  test("Multiple Editors - Close Others, Close Left, Close Right", function() {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    const input4 = input();
    const input5 = input();
    group.openEditor(input1, { active: true, pinned: true });
    group.openEditor(input2, { active: true, pinned: true });
    group.openEditor(input3, { active: true, pinned: true });
    group.openEditor(input4, { active: true, pinned: true });
    group.openEditor(input5, { active: true, pinned: true });
    closeEditors(group, group.activeEditor);
    assert.strictEqual(group.activeEditor, input5);
    assert.strictEqual(group.count, 1);
    closeAllEditors(group);
    group.openEditor(input1, { active: true, pinned: true });
    group.openEditor(input2, { active: true, pinned: true });
    group.openEditor(input3, { active: true, pinned: true });
    group.openEditor(input4, { active: true, pinned: true });
    group.openEditor(input5, { active: true, pinned: true });
    group.setActive(input3);
    assert.strictEqual(group.activeEditor, input3);
    closeEditors(group, group.activeEditor, CloseDirection.LEFT);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input3);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input4);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input5);
    closeAllEditors(group);
    group.openEditor(input1, { active: true, pinned: true });
    group.openEditor(input2, { active: true, pinned: true });
    group.openEditor(input3, { active: true, pinned: true });
    group.openEditor(input4, { active: true, pinned: true });
    group.openEditor(input5, { active: true, pinned: true });
    group.setActive(input3);
    assert.strictEqual(group.activeEditor, input3);
    closeEditors(group, group.activeEditor, CloseDirection.RIGHT);
    assert.strictEqual(group.activeEditor, input3);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], input2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[2], input3);
  });
  test("Multiple Editors - real user example", function() {
    const group = createEditorGroupModel();
    const indexHtml = input("index.html");
    let openedEditor = group.openEditor(indexHtml).editor;
    assert.strictEqual(openedEditor, indexHtml);
    assert.strictEqual(group.activeEditor, indexHtml);
    assert.strictEqual(group.previewEditor, indexHtml);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], indexHtml);
    assert.strictEqual(group.count, 1);
    const sameIndexHtml = input("index.html");
    openedEditor = group.openEditor(sameIndexHtml).editor;
    assert.strictEqual(openedEditor, indexHtml);
    assert.strictEqual(group.activeEditor, indexHtml);
    assert.strictEqual(group.previewEditor, indexHtml);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], indexHtml);
    assert.strictEqual(group.count, 1);
    const styleCss = input("style.css");
    openedEditor = group.openEditor(styleCss).editor;
    assert.strictEqual(openedEditor, styleCss);
    assert.strictEqual(group.activeEditor, styleCss);
    assert.strictEqual(group.previewEditor, styleCss);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], styleCss);
    assert.strictEqual(group.count, 1);
    const testJs = input("test.js");
    openedEditor = group.openEditor(testJs, { active: true, pinned: true }).editor;
    assert.strictEqual(openedEditor, testJs);
    assert.strictEqual(group.previewEditor, styleCss);
    assert.strictEqual(group.activeEditor, testJs);
    assert.strictEqual(group.isPinned(styleCss), false);
    assert.strictEqual(group.isPinned(testJs), true);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], styleCss);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], testJs);
    assert.strictEqual(group.count, 2);
    const indexHtml2 = input("index.html");
    group.openEditor(indexHtml2, { active: true });
    assert.strictEqual(group.activeEditor, indexHtml2);
    assert.strictEqual(group.previewEditor, indexHtml2);
    assert.strictEqual(group.isPinned(indexHtml2), false);
    assert.strictEqual(group.isPinned(testJs), true);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[0], testJs);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], indexHtml2);
    assert.strictEqual(group.count, 2);
    const testJs2 = input("test.js");
    group.setActive(testJs2);
    assert.strictEqual(group.activeEditor, testJs);
    assert.strictEqual(group.isActive(testJs2), true);
    assert.strictEqual(group.count, 2);
    const indexHtml3 = input("index.html");
    group.pin(indexHtml3);
    assert.strictEqual(group.isPinned(indexHtml3), true);
    assert.strictEqual(group.activeEditor, testJs);
    const fileTs = input("file.ts");
    group.openEditor(fileTs, { active: true, pinned: true });
    assert.strictEqual(group.isPinned(fileTs), true);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.activeEditor, fileTs);
    group.unpin(fileTs);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.isPinned(fileTs), false);
    assert.strictEqual(group.activeEditor, fileTs);
    const otherTs = input("other.ts");
    group.openEditor(otherTs, { active: true });
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.activeEditor, otherTs);
    assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(testJs));
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], otherTs);
    assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[2].matches(indexHtml));
    const indexHtml4 = input("index.html");
    group.setActive(indexHtml4);
    assert.strictEqual(group.activeEditor, indexHtml2);
    group.closeEditor(indexHtml);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.activeEditor, otherTs);
    assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(testJs));
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL)[1], otherTs);
    group.closeEditor(otherTs);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.activeEditor, testJs);
    assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(testJs));
    group.unpin(testJs);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.activeEditor, testJs);
    assert.ok(group.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(testJs));
    assert.strictEqual(group.isPinned(testJs), false);
    group.closeEditor(testJs);
    assert.strictEqual(group.count, 0);
    assert.strictEqual(group.activeEditor, null);
    assert.strictEqual(group.previewEditor, null);
  });
  test("Single Group, Single Editor - persist", function() {
    const inst2 = new TestInstantiationService();
    inst2.stub(IStorageService, disposables.add(new TestStorageService()));
    inst2.stub(IWorkspaceContextService, new TestContextService());
    const lifecycle = disposables.add(new TestLifecycleService());
    inst2.stub(ILifecycleService, lifecycle);
    inst2.stub(ITelemetryService, NullTelemetryService);
    const config = new TestConfigurationService();
    config.setUserConfiguration("workbench", { editor: { openPositioning: "right" } });
    inst2.stub(IConfigurationService, config);
    inst2.invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    let group = createEditorGroupModel();
    const input1 = input();
    group.openEditor(input1);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.activeEditor.matches(input1), true);
    assert.strictEqual(group.previewEditor.matches(input1), true);
    assert.strictEqual(group.isActive(input1), true);
    group = disposables.add(inst2.createInstance(EditorGroupModel, group.serialize()));
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.activeEditor.matches(input1), true);
    assert.strictEqual(group.previewEditor.matches(input1), true);
    assert.strictEqual(group.isActive(input1), true);
    inst2.dispose();
  });
  test("Multiple Groups, Multiple editors - persist", function() {
    const inst2 = new TestInstantiationService();
    inst2.stub(IStorageService, disposables.add(new TestStorageService()));
    inst2.stub(IWorkspaceContextService, new TestContextService());
    const lifecycle = disposables.add(new TestLifecycleService());
    inst2.stub(ILifecycleService, lifecycle);
    inst2.stub(ITelemetryService, NullTelemetryService);
    const config = new TestConfigurationService();
    config.setUserConfiguration("workbench", { editor: { openPositioning: "right" } });
    inst2.stub(IConfigurationService, config);
    inst2.invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    let group1 = createEditorGroupModel();
    const g1_input1 = input();
    const g1_input2 = input();
    const g1_input3 = input();
    group1.openEditor(g1_input1, { active: true, pinned: true });
    group1.openEditor(g1_input2, { active: true, pinned: false });
    group1.openEditor(g1_input3, { active: false, pinned: true });
    let group2 = createEditorGroupModel();
    const g2_input1 = input();
    const g2_input2 = input();
    const g2_input3 = input();
    group2.openEditor(g2_input1, { active: true, pinned: true });
    group2.openEditor(g2_input2, { active: false, pinned: false });
    group2.openEditor(g2_input3, { active: false, pinned: true });
    assert.strictEqual(group1.count, 3);
    assert.strictEqual(group2.count, 3);
    assert.strictEqual(group1.activeEditor.matches(g1_input2), true);
    assert.strictEqual(group2.activeEditor.matches(g2_input1), true);
    assert.strictEqual(group1.previewEditor.matches(g1_input2), true);
    assert.strictEqual(group2.previewEditor.matches(g2_input2), true);
    assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(g1_input2), true);
    assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(g1_input3), true);
    assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(g1_input1), true);
    assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(g2_input1), true);
    assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(g2_input3), true);
    assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(g2_input2), true);
    group1 = disposables.add(inst2.createInstance(EditorGroupModel, group1.serialize()));
    group2 = disposables.add(inst2.createInstance(EditorGroupModel, group2.serialize()));
    assert.strictEqual(group1.count, 3);
    assert.strictEqual(group2.count, 3);
    assert.strictEqual(group1.activeEditor.matches(g1_input2), true);
    assert.strictEqual(group2.activeEditor.matches(g2_input1), true);
    assert.strictEqual(group1.previewEditor.matches(g1_input2), true);
    assert.strictEqual(group2.previewEditor.matches(g2_input2), true);
    assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(g1_input2), true);
    assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(g1_input3), true);
    assert.strictEqual(group1.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(g1_input1), true);
    assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(g2_input1), true);
    assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(g2_input3), true);
    assert.strictEqual(group2.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(g2_input2), true);
    inst2.dispose();
  });
  test("Single group, multiple editors - persist (some not persistable)", function() {
    const inst2 = new TestInstantiationService();
    inst2.stub(IStorageService, disposables.add(new TestStorageService()));
    inst2.stub(IWorkspaceContextService, new TestContextService());
    const lifecycle = disposables.add(new TestLifecycleService());
    inst2.stub(ILifecycleService, lifecycle);
    inst2.stub(ITelemetryService, NullTelemetryService);
    const config = new TestConfigurationService();
    config.setUserConfiguration("workbench", { editor: { openPositioning: "right" } });
    inst2.stub(IConfigurationService, config);
    inst2.invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    let group = createEditorGroupModel();
    const serializableInput1 = input();
    const nonSerializableInput2 = input("3", true);
    const serializableInput2 = input();
    group.openEditor(serializableInput1, { active: true, pinned: true });
    group.openEditor(nonSerializableInput2, { active: true, pinned: false });
    group.openEditor(serializableInput2, { active: false, pinned: true });
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.activeEditor.matches(nonSerializableInput2), true);
    assert.strictEqual(group.previewEditor.matches(nonSerializableInput2), true);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(nonSerializableInput2), true);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(serializableInput2), true);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[2].matches(serializableInput1), true);
    group = disposables.add(inst2.createInstance(EditorGroupModel, group.serialize()));
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.activeEditor.matches(serializableInput2), true);
    assert.strictEqual(group.previewEditor, null);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].matches(serializableInput2), true);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].matches(serializableInput1), true);
    inst2.dispose();
  });
  test("Single group, multiple editors - persist (some not persistable, sticky editors)", function() {
    const inst2 = new TestInstantiationService();
    inst2.stub(IStorageService, disposables.add(new TestStorageService()));
    inst2.stub(IWorkspaceContextService, new TestContextService());
    const lifecycle = disposables.add(new TestLifecycleService());
    inst2.stub(ILifecycleService, lifecycle);
    inst2.stub(ITelemetryService, NullTelemetryService);
    const config = new TestConfigurationService();
    config.setUserConfiguration("workbench", { editor: { openPositioning: "right" } });
    inst2.stub(IConfigurationService, config);
    inst2.invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    let group = createEditorGroupModel();
    const serializableInput1 = input();
    const nonSerializableInput2 = input("3", true);
    const serializableInput2 = input();
    group.openEditor(serializableInput1, { active: true, pinned: true });
    group.openEditor(nonSerializableInput2, { active: true, pinned: true, sticky: true });
    group.openEditor(serializableInput2, { active: false, pinned: true });
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    group = disposables.add(inst2.createInstance(EditorGroupModel, group.serialize()));
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.stickyCount, 0);
    inst2.dispose();
  });
  test("Multiple groups, multiple editors - persist (some not persistable, causes empty group)", function() {
    const inst2 = new TestInstantiationService();
    inst2.stub(IStorageService, disposables.add(new TestStorageService()));
    inst2.stub(IWorkspaceContextService, new TestContextService());
    const lifecycle = disposables.add(new TestLifecycleService());
    inst2.stub(ILifecycleService, lifecycle);
    inst2.stub(ITelemetryService, NullTelemetryService);
    const config = new TestConfigurationService();
    config.setUserConfiguration("workbench", { editor: { openPositioning: "right" } });
    inst2.stub(IConfigurationService, config);
    inst2.invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    let group1 = createEditorGroupModel();
    let group2 = createEditorGroupModel();
    const serializableInput1 = input();
    const serializableInput2 = input();
    const nonSerializableInput = input("2", true);
    group1.openEditor(serializableInput1, { pinned: true });
    group1.openEditor(serializableInput2);
    group2.openEditor(nonSerializableInput);
    group1 = disposables.add(inst2.createInstance(EditorGroupModel, group1.serialize()));
    group2 = disposables.add(inst2.createInstance(EditorGroupModel, group2.serialize()));
    assert.strictEqual(group1.count, 2);
    assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[0].matches(serializableInput1), true);
    assert.strictEqual(group1.getEditors(EditorsOrder.SEQUENTIAL)[1].matches(serializableInput2), true);
    inst2.dispose();
  });
  test("Multiple Editors - Editor Dispose", function() {
    const group1 = createEditorGroupModel();
    const group2 = createEditorGroupModel();
    const group1Listener = groupListener(group1);
    const group2Listener = groupListener(group2);
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group1.openEditor(input1, { pinned: true, active: true });
    group1.openEditor(input2, { pinned: true, active: true });
    group1.openEditor(input3, { pinned: true, active: true });
    group2.openEditor(input1, { pinned: true, active: true });
    group2.openEditor(input2, { pinned: true, active: true });
    input1.dispose();
    assert.strictEqual(group1Listener.disposed.length, 1);
    assert.strictEqual(group1Listener.disposed[0].editorIndex, 0);
    assert.strictEqual(group2Listener.disposed.length, 1);
    assert.strictEqual(group2Listener.disposed[0].editorIndex, 0);
    assert.ok(group1Listener.disposed[0].editor.matches(input1));
    assert.ok(group2Listener.disposed[0].editor.matches(input1));
    input3.dispose();
    assert.strictEqual(group1Listener.disposed.length, 2);
    assert.strictEqual(group1Listener.disposed[1].editorIndex, 2);
    assert.strictEqual(group2Listener.disposed.length, 1);
    assert.ok(group1Listener.disposed[1].editor.matches(input3));
  });
  test("Preview tab does not have a stable position (https://github.com/microsoft/vscode/issues/8245)", function() {
    const group1 = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group1.openEditor(input1, { pinned: true, active: true });
    group1.openEditor(input2, { active: true });
    group1.setActive(input1);
    group1.openEditor(input3, { active: true });
    assert.strictEqual(group1.indexOf(input3), 1);
  });
  test("Multiple Editors - Editor Emits Dirty and Label Changed", function() {
    const group1 = createEditorGroupModel();
    const group2 = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    group1.openEditor(input1, { pinned: true, active: true });
    group2.openEditor(input2, { pinned: true, active: true });
    let dirty1Counter = 0;
    disposables.add(group1.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
        dirty1Counter++;
      }
    }));
    let dirty2Counter = 0;
    disposables.add(group2.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
        dirty2Counter++;
      }
    }));
    let label1ChangeCounter = 0;
    disposables.add(group1.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
        label1ChangeCounter++;
      }
    }));
    let label2ChangeCounter = 0;
    disposables.add(group2.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
        label2ChangeCounter++;
      }
    }));
    input1.setDirty();
    input1.setLabel();
    assert.strictEqual(dirty1Counter, 1);
    assert.strictEqual(label1ChangeCounter, 1);
    input2.setDirty();
    input2.setLabel();
    assert.strictEqual(dirty2Counter, 1);
    assert.strictEqual(label2ChangeCounter, 1);
    closeAllEditors(group2);
    input2.setDirty();
    input2.setLabel();
    assert.strictEqual(dirty2Counter, 1);
    assert.strictEqual(label2ChangeCounter, 1);
    assert.strictEqual(dirty1Counter, 1);
    assert.strictEqual(label1ChangeCounter, 1);
  });
  test("Sticky Editors", function() {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    const input4 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: false, active: true });
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 3);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 3);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 3);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 3);
    group.stick(input3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: false }).length, 3);
    assert.strictEqual(group.isSticky(input1), false);
    assert.strictEqual(group.isSticky(input2), false);
    assert.strictEqual(group.isSticky(input3), true);
    assert.strictEqual(group.isPinned(input3), true);
    assert.strictEqual(group.indexOf(input1), 1);
    assert.strictEqual(group.indexOf(input2), 2);
    assert.strictEqual(group.indexOf(input3), 0);
    let sequentialAllEditors = group.getEditors(EditorsOrder.SEQUENTIAL);
    assert.strictEqual(sequentialAllEditors.length, 3);
    let sequentialEditorsExcludingSticky = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
    assert.strictEqual(sequentialEditorsExcludingSticky.length, 2);
    assert.ok(sequentialEditorsExcludingSticky.indexOf(input1) >= 0);
    assert.ok(sequentialEditorsExcludingSticky.indexOf(input2) >= 0);
    let mruAllEditors = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mruAllEditors.length, 3);
    let mruEditorsExcludingSticky = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
    assert.strictEqual(mruEditorsExcludingSticky.length, 2);
    assert.ok(mruEditorsExcludingSticky.indexOf(input1) >= 0);
    assert.ok(mruEditorsExcludingSticky.indexOf(input2) >= 0);
    group.stick(input3);
    assert.strictEqual(group.isSticky(input3), true);
    group.stick(input2);
    assert.strictEqual(group.stickyCount, 2);
    assert.strictEqual(group.isSticky(input1), false);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), true);
    assert.strictEqual(group.indexOf(input1), 2);
    assert.strictEqual(group.indexOf(input2), 1);
    assert.strictEqual(group.indexOf(input3), 0);
    sequentialAllEditors = group.getEditors(EditorsOrder.SEQUENTIAL);
    assert.strictEqual(sequentialAllEditors.length, 3);
    sequentialEditorsExcludingSticky = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
    assert.strictEqual(sequentialEditorsExcludingSticky.length, 1);
    assert.ok(sequentialEditorsExcludingSticky.indexOf(input1) >= 0);
    mruAllEditors = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mruAllEditors.length, 3);
    mruEditorsExcludingSticky = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
    assert.strictEqual(mruEditorsExcludingSticky.length, 1);
    assert.ok(mruEditorsExcludingSticky.indexOf(input1) >= 0);
    group.stick(input1);
    assert.strictEqual(group.stickyCount, 3);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), true);
    assert.strictEqual(group.indexOf(input1), 2);
    assert.strictEqual(group.indexOf(input2), 1);
    assert.strictEqual(group.indexOf(input3), 0);
    sequentialAllEditors = group.getEditors(EditorsOrder.SEQUENTIAL);
    assert.strictEqual(sequentialAllEditors.length, 3);
    sequentialEditorsExcludingSticky = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
    assert.strictEqual(sequentialEditorsExcludingSticky.length, 0);
    mruAllEditors = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mruAllEditors.length, 3);
    mruEditorsExcludingSticky = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
    assert.strictEqual(mruEditorsExcludingSticky.length, 0);
    group.unstick(input3);
    assert.strictEqual(group.stickyCount, 2);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 1);
    assert.strictEqual(group.indexOf(input2), 0);
    assert.strictEqual(group.indexOf(input3), 2);
    group.unstick(input1);
    group.unstick(input2);
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.isSticky(input1), false);
    assert.strictEqual(group.isSticky(input2), false);
    assert.strictEqual(group.isSticky(input3), false);
    group.moveEditor(input1, 0);
    group.moveEditor(input2, 1);
    group.moveEditor(input3, 2);
    group.stick(input1);
    group.stick(input2);
    group.setActive(input1);
    const events = groupListener(group);
    group.openEditor(input4, { pinned: true, active: true });
    assert.strictEqual(group.indexOf(input4), 2);
    group.closeEditor(input4);
    assert.strictEqual(events.closed[0].sticky, false);
    group.setActive(input2);
    group.openEditor(input4, { pinned: true, active: true });
    assert.strictEqual(group.indexOf(input4), 2);
    group.closeEditor(input4);
    assert.strictEqual(events.closed[1].sticky, false);
    assert.strictEqual(group.stickyCount, 2);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 0);
    assert.strictEqual(group.indexOf(input2), 1);
    assert.strictEqual(group.indexOf(input3), 2);
    group.moveEditor(input1, 1);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 1);
    assert.strictEqual(group.indexOf(input2), 0);
    assert.strictEqual(group.indexOf(input3), 2);
    group.moveEditor(input1, 0);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 0);
    assert.strictEqual(group.indexOf(input2), 1);
    assert.strictEqual(group.indexOf(input3), 2);
    group.moveEditor(input1, 2);
    assert.strictEqual(group.isSticky(input1), false);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 2);
    assert.strictEqual(group.indexOf(input2), 0);
    assert.strictEqual(group.indexOf(input3), 1);
    group.moveEditor(input2, 2);
    assert.strictEqual(group.isSticky(input1), false);
    assert.strictEqual(group.isSticky(input2), false);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 1);
    assert.strictEqual(group.indexOf(input2), 2);
    assert.strictEqual(group.indexOf(input3), 0);
    group.moveEditor(input1, 0);
    group.moveEditor(input2, 1);
    group.moveEditor(input3, 2);
    group.stick(input1);
    group.unstick(input2);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), false);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 0);
    assert.strictEqual(group.indexOf(input2), 1);
    assert.strictEqual(group.indexOf(input3), 2);
    group.moveEditor(input3, 1);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), false);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 0);
    assert.strictEqual(group.indexOf(input2), 2);
    assert.strictEqual(group.indexOf(input3), 1);
    group.moveEditor(input3, 2);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), false);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.indexOf(input1), 0);
    assert.strictEqual(group.indexOf(input2), 1);
    assert.strictEqual(group.indexOf(input3), 2);
    group.moveEditor(input3, 0);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), false);
    assert.strictEqual(group.isSticky(input3), true);
    assert.strictEqual(group.indexOf(input1), 1);
    assert.strictEqual(group.indexOf(input2), 2);
    assert.strictEqual(group.indexOf(input3), 0);
    group.moveEditor(input2, 0);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), true);
    assert.strictEqual(group.indexOf(input1), 2);
    assert.strictEqual(group.indexOf(input2), 0);
    assert.strictEqual(group.indexOf(input3), 1);
    group.stick(input1);
    group.stick(input2);
    group.unstick(input3);
    assert.strictEqual(group.stickyCount, 2);
    group.closeEditor(input1);
    assert.strictEqual(events.closed[2].sticky, true);
    assert.strictEqual(group.stickyCount, 1);
    group.closeEditor(input2);
    assert.strictEqual(events.closed[3].sticky, true);
    assert.strictEqual(group.stickyCount, 0);
    closeAllEditors(group);
    assert.strictEqual(group.stickyCount, 0);
    group.openEditor(input1, { sticky: true });
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(input1), true);
    group.openEditor(input2, { pinned: true, active: true });
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), false);
    group.openEditor(input2, { sticky: true });
    assert.strictEqual(group.stickyCount, 2);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), true);
    group.openEditor(input3, { pinned: true, active: true });
    group.openEditor(input4, { pinned: false, active: true, sticky: true });
    assert.strictEqual(group.stickyCount, 3);
    assert.strictEqual(group.isSticky(input1), true);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.isSticky(input4), true);
    assert.strictEqual(group.isPinned(input4), true);
    assert.strictEqual(group.indexOf(input1), 0);
    assert.strictEqual(group.indexOf(input2), 1);
    assert.strictEqual(group.indexOf(input3), 3);
    assert.strictEqual(group.indexOf(input4), 2);
  });
  test("Sticky/Unsticky Editors sends correct editor index", function() {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true });
    group.openEditor(input2, { pinned: true, active: true });
    group.openEditor(input3, { pinned: false, active: true });
    assert.strictEqual(group.stickyCount, 0);
    const events = groupListener(group);
    group.stick(input3);
    assert.strictEqual(events.sticky[0].editorIndex, 0);
    assert.strictEqual(group.isSticky(input3), true);
    assert.strictEqual(group.stickyCount, 1);
    group.stick(input2);
    assert.strictEqual(events.sticky[1].editorIndex, 1);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.stickyCount, 2);
    group.unstick(input3);
    assert.strictEqual(events.unsticky[0].editorIndex, 1);
    assert.strictEqual(group.isSticky(input3), false);
    assert.strictEqual(group.isSticky(input2), true);
    assert.strictEqual(group.stickyCount, 1);
  });
  test("onDidMoveEditor Event", () => {
    const group1 = createEditorGroupModel();
    const group2 = createEditorGroupModel();
    const input1group1 = input();
    const input2group1 = input();
    const input1group2 = input();
    const input2group2 = input();
    group1.openEditor(input1group1, { pinned: true, active: true, index: 0 });
    group1.openEditor(input2group1, { pinned: true, active: false, index: 1 });
    group2.openEditor(input1group2, { pinned: true, active: true, index: 0 });
    group2.openEditor(input2group2, { pinned: true, active: false, index: 1 });
    const group1Events = groupListener(group1);
    const group2Events = groupListener(group2);
    group1.moveEditor(input1group1, 1);
    assert.strictEqual(group1Events.moved[0].editor, input1group1);
    assert.strictEqual(group1Events.moved[0].oldEditorIndex, 0);
    assert.strictEqual(group1Events.moved[0].editorIndex, 1);
    group2.moveEditor(input1group2, 1);
    assert.strictEqual(group2Events.moved[0].editor, input1group2);
    assert.strictEqual(group2Events.moved[0].oldEditorIndex, 0);
    assert.strictEqual(group2Events.moved[0].editorIndex, 1);
  });
  test("onDidOpeneditor Event", () => {
    const group1 = createEditorGroupModel();
    const group2 = createEditorGroupModel();
    const group1Events = groupListener(group1);
    const group2Events = groupListener(group2);
    const input1group1 = input();
    const input2group1 = input();
    const input1group2 = input();
    const input2group2 = input();
    group1.openEditor(input1group1, { pinned: true, active: true, index: 0 });
    group1.openEditor(input2group1, { pinned: true, active: false, index: 1 });
    group2.openEditor(input1group2, { pinned: true, active: true, index: 0 });
    group2.openEditor(input2group2, { pinned: true, active: false, index: 1 });
    assert.strictEqual(group1Events.opened.length, 2);
    assert.strictEqual(group1Events.opened[0].editor, input1group1);
    assert.strictEqual(group1Events.opened[0].editorIndex, 0);
    assert.strictEqual(group1Events.opened[1].editor, input2group1);
    assert.strictEqual(group1Events.opened[1].editorIndex, 1);
    assert.strictEqual(group2Events.opened.length, 2);
    assert.strictEqual(group2Events.opened[0].editor, input1group2);
    assert.strictEqual(group2Events.opened[0].editorIndex, 0);
    assert.strictEqual(group2Events.opened[1].editor, input2group2);
    assert.strictEqual(group2Events.opened[1].editorIndex, 1);
  });
  test("moving editor sends sticky event when sticky changes", () => {
    const group1 = createEditorGroupModel();
    const input1group1 = input();
    const input2group1 = input();
    const input3group1 = input();
    group1.openEditor(input1group1, { pinned: true, active: true, index: 0, sticky: true });
    group1.openEditor(input2group1, { pinned: true, active: false, index: 1 });
    group1.openEditor(input3group1, { pinned: true, active: false, index: 2 });
    const group1Events = groupListener(group1);
    group1.moveEditor(input2group1, 0);
    assert.strictEqual(group1Events.sticky[0].editor, input2group1);
    assert.strictEqual(group1Events.sticky[0].editorIndex, 0);
    const group2 = createEditorGroupModel();
    const input1group2 = input();
    const input2group2 = input();
    const input3group2 = input();
    group2.openEditor(input1group2, { pinned: true, active: true, index: 0, sticky: true });
    group2.openEditor(input2group2, { pinned: true, active: false, index: 1 });
    group2.openEditor(input3group2, { pinned: true, active: false, index: 2 });
    const group2Events = groupListener(group2);
    group2.moveEditor(input1group2, 1);
    assert.strictEqual(group2Events.unsticky[0].editor, input1group2);
    assert.strictEqual(group2Events.unsticky[0].editorIndex, 1);
  });
  function assertSelection(group, activeEditor, selectedEditors) {
    assert.strictEqual(group.activeEditor, activeEditor);
    assert.strictEqual(group.selectedEditors.length, selectedEditors.length);
    for (let i = 0; i < selectedEditors.length; i++) {
      assert.strictEqual(group.selectedEditors[i], selectedEditors[i]);
    }
  }
  test("editor selection: selectedEditors", () => {
    const group = createEditorGroupModel();
    const activeEditor = group.activeEditor;
    const selectedEditors = group.selectedEditors;
    assert.strictEqual(activeEditor, null);
    assert.strictEqual(selectedEditors.length, 0);
    const input1 = input();
    group.openEditor(input1, { pinned: true, active: true, index: 0 });
    assertSelection(group, input1, [input1]);
    const input2 = input();
    const input3 = input();
    group.openEditor(input2, { pinned: true, active: true, index: 1 });
    group.openEditor(input3, { pinned: true, active: true, index: 2 });
    assertSelection(group, input3, [input3]);
    group.setSelection(input2, [input1]);
    assertSelection(group, input2, [input1, input2]);
  });
  test("editor selection: openEditor with inactive selection", () => {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true, index: 0 });
    group.openEditor(input2, { pinned: true, active: true, index: 1 });
    group.openEditor(input3, { pinned: true, active: true, index: 2 });
    group.openEditor(input2, { active: true, inactiveSelection: [input3, input1] });
    assertSelection(group, input2, [input1, input2, input3]);
    group.openEditor(input1, { active: true, inactiveSelection: [input3, input1, input3] });
    assertSelection(group, input1, [input1, input3]);
    const input4 = input();
    group.openEditor(input4, { pinned: true, active: false, inactiveSelection: [input2], index: 3 });
    assertSelection(group, input1, [input1, input2]);
    const input5 = input();
    group.openEditor(input5, { pinned: true, active: true, inactiveSelection: [input4], index: 4 });
    assertSelection(group, input5, [input4, input5]);
  });
  test("editor selection: closeEditor keeps selection", () => {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true, index: 0 });
    group.openEditor(input2, { pinned: true, active: true, index: 1 });
    group.openEditor(input3, { pinned: true, active: true, index: 2 });
    group.setSelection(input2, [input3, input1]);
    group.closeEditor(input3);
    assertSelection(group, input2, [input1, input2]);
  });
  test("editor selection: setSeletion", () => {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true, index: 0 });
    group.openEditor(input2, { pinned: true, active: true, index: 1 });
    group.openEditor(input3, { pinned: true, active: true, index: 2 });
    group.setSelection(input2, [input3, input1]);
    assertSelection(group, input2, [input1, input2, input3]);
    group.setSelection(input3, []);
    assertSelection(group, input3, [input3]);
    group.setSelection(input2, [input1, input2, input1]);
    assertSelection(group, input2, [input1, input2]);
  });
  test("editor selection: isSelected", () => {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    const input3 = input();
    group.openEditor(input1, { pinned: true, active: true, index: 0 });
    group.openEditor(input2, { pinned: true, active: true, index: 1 });
    group.openEditor(input3, { pinned: true, active: true, index: 2 });
    group.setSelection(input2, [input3, input1]);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), true);
    assert.strictEqual(group.isSelected(input3), true);
    group.setSelection(input3, []);
    assert.strictEqual(group.isSelected(input1), false);
    assert.strictEqual(group.isSelected(input2), false);
    assert.strictEqual(group.isSelected(input3), true);
    assert.strictEqual(group.isSelected(0), false);
    assert.strictEqual(group.isSelected(1), false);
    assert.strictEqual(group.isSelected(2), true);
  });
  test("editor selection: select invalid editor", () => {
    const group = createEditorGroupModel();
    const input1 = input();
    const input2 = input();
    group.openEditor(input1, { pinned: true, active: true, index: 0 });
    group.setSelection(input2, [input1]);
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.selectedEditors.length, 1);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), false);
    group.setSelection(input1, [input2]);
    assert.strictEqual(group.activeEditor, input1);
    assert.strictEqual(group.selectedEditors.length, 1);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), false);
  });
  test("editor transient: basics", () => {
    const group = createEditorGroupModel();
    const events = groupListener(group);
    const input1 = input();
    const input2 = input();
    group.openEditor(input1, { pinned: true, active: true });
    assert.strictEqual(group.isTransient(input1), false);
    assert.strictEqual(events.transient.length, 0);
    group.openEditor(input2, { pinned: true, active: true, transient: true });
    assert.strictEqual(events.transient[0].editor, input2);
    assert.strictEqual(group.isTransient(input2), true);
    group.setTransient(input1, true);
    assert.strictEqual(group.isTransient(input1), true);
    assert.strictEqual(events.transient[1].editor, input1);
    group.setTransient(input2, false);
    assert.strictEqual(group.isTransient(input2), false);
    assert.strictEqual(events.transient[2].editor, input2);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvckdyb3VwTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVkaXRvckdyb3VwTW9kZWwsIElHcm91cEVkaXRvckNoYW5nZUV2ZW50LCBJR3JvdXBFZGl0b3JDbG9zZUV2ZW50LCBJR3JvdXBFZGl0b3JNb3ZlRXZlbnQsIElHcm91cEVkaXRvck9wZW5FdmVudCwgSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsLCBpc0dyb3VwRWRpdG9yQ2hhbmdlRXZlbnQsIGlzR3JvdXBFZGl0b3JDbG9zZUV2ZW50LCBpc0dyb3VwRWRpdG9yTW92ZUV2ZW50LCBpc0dyb3VwRWRpdG9yT3BlbkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JHcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIElGaWxlRWRpdG9ySW5wdXQsIElFZGl0b3JTZXJpYWxpemVyLCBDbG9zZURpcmVjdGlvbiwgRWRpdG9yc09yZGVyLCBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIElSZXNvdXJjZVNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgU2lkZUJ5U2lkZUVkaXRvciwgRWRpdG9yQ2xvc2VDb250ZXh0LCBHcm91cE1vZGVsQ2hhbmdlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRlc3RMaWZlY3ljbGVTZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdFZGl0b3JHcm91cE1vZGVsJywgKCkgPT4ge1xuXG5cdGxldCB0ZXN0SW5zdFNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHRzdWl0ZVRlYXJkb3duKCgpID0+IHtcblx0XHR0ZXN0SW5zdFNlcnZpY2U/LmRpc3Bvc2UoKTtcblx0XHR0ZXN0SW5zdFNlcnZpY2UgPSB1bmRlZmluZWQ7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGluc3QoKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHRpZiAoIXRlc3RJbnN0U2VydmljZSkge1xuXHRcdFx0dGVzdEluc3RTZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpbnN0ID0gdGVzdEluc3RTZXJ2aWNlO1xuXHRcdGluc3Quc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0LnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXHRcdGluc3Quc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSk7XG5cdFx0aW5zdC5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnLCB7IGVkaXRvcjogeyBvcGVuUG9zaXRpb25pbmc6ICdyaWdodCcsIGZvY3VzUmVjZW50RWRpdG9yQWZ0ZXJDbG9zZTogdHJ1ZSB9IH0pO1xuXHRcdGluc3Quc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZyk7XG5cblx0XHRyZXR1cm4gaW5zdDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoc2VyaWFsaXplZD86IElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCk6IEVkaXRvckdyb3VwTW9kZWwge1xuXHRcdGNvbnN0IGdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKGluc3QoKS5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCBzZXJpYWxpemVkKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0XHRncm91cC5jbG9zZUVkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBncm91cDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNsb3NlQWxsRWRpdG9ycyhncm91cDogRWRpdG9yR3JvdXBNb2RlbCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpKSB7XG5cdFx0XHRncm91cC5jbG9zZUVkaXRvcihlZGl0b3IsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNsb3NlRWRpdG9ycyhncm91cDogRWRpdG9yR3JvdXBNb2RlbCwgZXhjZXB0OiBFZGl0b3JJbnB1dCwgZGlyZWN0aW9uPzogQ2xvc2VEaXJlY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IGdyb3VwLmluZGV4T2YoZXhjZXB0KTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdCBmb3VuZFxuXHRcdH1cblxuXHRcdC8vIENsb3NlIHRvIHRoZSBsZWZ0XG5cdFx0aWYgKGRpcmVjdGlvbiA9PT0gQ2xvc2VEaXJlY3Rpb24uTEVGVCkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IGluZGV4IC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0Z3JvdXAuY2xvc2VFZGl0b3IoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleChpKSEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENsb3NlIHRvIHRoZSByaWdodFxuXHRcdGVsc2UgaWYgKGRpcmVjdGlvbiA9PT0gQ2xvc2VEaXJlY3Rpb24uUklHSFQpIHtcblx0XHRcdGZvciAobGV0IGkgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGggLSAxOyBpID4gaW5kZXg7IGktLSkge1xuXHRcdFx0XHRncm91cC5jbG9zZUVkaXRvcihncm91cC5nZXRFZGl0b3JCeUluZGV4KGkpISk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQm90aCBkaXJlY3Rpb25zXG5cdFx0ZWxzZSB7XG5cdFx0XHRncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkuZmlsdGVyKGVkaXRvciA9PiAhZWRpdG9yLm1hdGNoZXMoZXhjZXB0KSkuZm9yRWFjaChlZGl0b3IgPT4gZ3JvdXAuY2xvc2VFZGl0b3IoZWRpdG9yKSk7XG5cdFx0fVxuXHR9XG5cblx0aW50ZXJmYWNlIEdyb3VwRXZlbnRzIHtcblx0XHRsb2NrZWQ6IG51bWJlcltdO1xuXHRcdGFjdGl2ZTogbnVtYmVyW107XG5cdFx0aW5kZXg6IG51bWJlcltdO1xuXHRcdGxhYmVsOiBudW1iZXJbXTtcblx0XHRvcGVuZWQ6IElHcm91cEVkaXRvck9wZW5FdmVudFtdO1xuXHRcdGFjdGl2YXRlZDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnRbXTtcblx0XHRjbG9zZWQ6IElHcm91cEVkaXRvckNsb3NlRXZlbnRbXTtcblx0XHRwaW5uZWQ6IElHcm91cEVkaXRvckNoYW5nZUV2ZW50W107XG5cdFx0dW5waW5uZWQ6IElHcm91cEVkaXRvckNoYW5nZUV2ZW50W107XG5cdFx0c3RpY2t5OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudFtdO1xuXHRcdHVuc3RpY2t5OiBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudFtdO1xuXHRcdHRyYW5zaWVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnRbXTtcblx0XHRtb3ZlZDogSUdyb3VwRWRpdG9yTW92ZUV2ZW50W107XG5cdFx0ZGlzcG9zZWQ6IElHcm91cEVkaXRvckNoYW5nZUV2ZW50W107XG5cdH1cblxuXHRmdW5jdGlvbiBncm91cExpc3RlbmVyKGdyb3VwOiBFZGl0b3JHcm91cE1vZGVsKTogR3JvdXBFdmVudHMge1xuXHRcdGNvbnN0IGdyb3VwRXZlbnRzOiBHcm91cEV2ZW50cyA9IHtcblx0XHRcdGFjdGl2ZTogW10sXG5cdFx0XHRpbmRleDogW10sXG5cdFx0XHRsYWJlbDogW10sXG5cdFx0XHRsb2NrZWQ6IFtdLFxuXHRcdFx0b3BlbmVkOiBbXSxcblx0XHRcdGNsb3NlZDogW10sXG5cdFx0XHRhY3RpdmF0ZWQ6IFtdLFxuXHRcdFx0cGlubmVkOiBbXSxcblx0XHRcdHVucGlubmVkOiBbXSxcblx0XHRcdHN0aWNreTogW10sXG5cdFx0XHR1bnN0aWNreTogW10sXG5cdFx0XHR0cmFuc2llbnQ6IFtdLFxuXHRcdFx0bW92ZWQ6IFtdLFxuXHRcdFx0ZGlzcG9zZWQ6IFtdXG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChncm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTE9DS0VEKSB7XG5cdFx0XHRcdGdyb3VwRXZlbnRzLmxvY2tlZC5wdXNoKGdyb3VwLmlkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0FDVElWRSkge1xuXHRcdFx0XHRncm91cEV2ZW50cy5hY3RpdmUucHVzaChncm91cC5pZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9JTkRFWCkge1xuXHRcdFx0XHRncm91cEV2ZW50cy5pbmRleC5wdXNoKGdyb3VwLmlkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0xBQkVMKSB7XG5cdFx0XHRcdGdyb3VwRXZlbnRzLmxhYmVsLnB1c2goZ3JvdXAuaWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWUuZWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU46XG5cdFx0XHRcdFx0aWYgKGlzR3JvdXBFZGl0b3JPcGVuRXZlbnQoZSkpIHtcblx0XHRcdFx0XHRcdGdyb3VwRXZlbnRzLm9wZW5lZC5wdXNoKGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0U6XG5cdFx0XHRcdFx0aWYgKGlzR3JvdXBFZGl0b3JDbG9zZUV2ZW50KGUpKSB7XG5cdFx0XHRcdFx0XHRncm91cEV2ZW50cy5jbG9zZWQucHVzaChlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0FDVElWRTpcblx0XHRcdFx0XHRpZiAoaXNHcm91cEVkaXRvckNoYW5nZUV2ZW50KGUpKSB7XG5cdFx0XHRcdFx0XHRncm91cEV2ZW50cy5hY3RpdmF0ZWQucHVzaChlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1BJTjpcblx0XHRcdFx0XHRpZiAoaXNHcm91cEVkaXRvckNoYW5nZUV2ZW50KGUpKSB7XG5cdFx0XHRcdFx0XHRncm91cC5pc1Bpbm5lZChlLmVkaXRvcikgPyBncm91cEV2ZW50cy5waW5uZWQucHVzaChlKSA6IGdyb3VwRXZlbnRzLnVucGlubmVkLnB1c2goZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9TVElDS1k6XG5cdFx0XHRcdFx0aWYgKGlzR3JvdXBFZGl0b3JDaGFuZ2VFdmVudChlKSkge1xuXHRcdFx0XHRcdFx0Z3JvdXAuaXNTdGlja3koZS5lZGl0b3IpID8gZ3JvdXBFdmVudHMuc3RpY2t5LnB1c2goZSkgOiBncm91cEV2ZW50cy51bnN0aWNreS5wdXNoKGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfVFJBTlNJRU5UOlxuXHRcdFx0XHRcdGlmIChpc0dyb3VwRWRpdG9yQ2hhbmdlRXZlbnQoZSkpIHtcblx0XHRcdFx0XHRcdGdyb3VwRXZlbnRzLnRyYW5zaWVudC5wdXNoKGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTU9WRTpcblx0XHRcdFx0XHRpZiAoaXNHcm91cEVkaXRvck1vdmVFdmVudChlKSkge1xuXHRcdFx0XHRcdFx0Z3JvdXBFdmVudHMubW92ZWQucHVzaChlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1dJTExfRElTUE9TRTpcblx0XHRcdFx0XHRpZiAoaXNHcm91cEVkaXRvckNoYW5nZUV2ZW50KGUpKSB7XG5cdFx0XHRcdFx0XHRncm91cEV2ZW50cy5kaXNwb3NlZC5wdXNoKGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZ3JvdXBFdmVudHM7XG5cdH1cblxuXHRsZXQgaW5kZXggPSAwO1xuXHRjbGFzcyBUZXN0RWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCB7XG5cblx0XHRyZWFkb25seSByZXNvdXJjZSA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0cnVjdG9yKHB1YmxpYyBpZDogc3RyaW5nKSB7XG5cdFx0XHRzdXBlcigpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXQgdHlwZUlkKCkgeyByZXR1cm4gJ3Rlc3RFZGl0b3JJbnB1dEZvckdyb3Vwcyc7IH1cblx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlKCk6IFByb21pc2U8SURpc3Bvc2FibGU+IHsgcmV0dXJuIG51bGwhOyB9XG5cblx0XHRvdmVycmlkZSBtYXRjaGVzKG90aGVyOiBUZXN0RWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiBvdGhlciAmJiB0aGlzLmlkID09PSBvdGhlci5pZCAmJiBvdGhlciBpbnN0YW5jZW9mIFRlc3RFZGl0b3JJbnB1dDtcblx0XHR9XG5cblx0XHRzZXREaXJ0eSgpOiB2b2lkIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdH1cblxuXHRcdHNldExhYmVsKCk6IHZvaWQge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgTm9uU2VyaWFsaXphYmxlVGVzdEVkaXRvcklucHV0IGV4dGVuZHMgRWRpdG9ySW5wdXQge1xuXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdHJ1Y3RvcihwdWJsaWMgaWQ6IHN0cmluZykge1xuXHRcdFx0c3VwZXIoKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpIHsgcmV0dXJuICd0ZXN0RWRpdG9ySW5wdXRGb3JHcm91cHMtbm9uU2VyaWFsaXphYmxlJzsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTxJRGlzcG9zYWJsZSB8IG51bGw+IHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdG92ZXJyaWRlIG1hdGNoZXMob3RoZXI6IE5vblNlcmlhbGl6YWJsZVRlc3RFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIG90aGVyICYmIHRoaXMuaWQgPT09IG90aGVyLmlkICYmIG90aGVyIGluc3RhbmNlb2YgTm9uU2VyaWFsaXphYmxlVGVzdEVkaXRvcklucHV0O1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIFRlc3RGaWxlRWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCBpbXBsZW1lbnRzIElGaWxlRWRpdG9ySW5wdXQge1xuXG5cdFx0cmVhZG9ubHkgcHJlZmVycmVkUmVzb3VyY2U7XG5cblx0XHRjb25zdHJ1Y3RvcihwdWJsaWMgaWQ6IHN0cmluZywgcHVibGljIHJlc291cmNlOiBVUkkpIHtcblx0XHRcdHN1cGVyKCk7XG5cblx0XHRcdHRoaXMucHJlZmVycmVkUmVzb3VyY2UgPSB0aGlzLnJlc291cmNlO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXQgdHlwZUlkKCkgeyByZXR1cm4gJ3Rlc3RGaWxlRWRpdG9ySW5wdXRGb3JHcm91cHMnOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGVkaXRvcklkKCkgeyByZXR1cm4gdGhpcy5pZDsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTxJRGlzcG9zYWJsZSB8IG51bGw+IHsgcmV0dXJuIG51bGw7IH1cblx0XHRzZXRQcmVmZXJyZWROYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQgeyB9XG5cdFx0c2V0UHJlZmVycmVkRGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZyk6IHZvaWQgeyB9XG5cdFx0c2V0UHJlZmVycmVkUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IHZvaWQgeyB9XG5cdFx0YXN5bmMgc2V0RW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZykgeyB9XG5cdFx0Z2V0RW5jb2RpbmcoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRzZXRQcmVmZXJyZWRFbmNvZGluZyhlbmNvZGluZzogc3RyaW5nKSB7IH1cblx0XHRzZXRGb3JjZU9wZW5Bc0JpbmFyeSgpOiB2b2lkIHsgfVxuXHRcdHNldFByZWZlcnJlZENvbnRlbnRzKGNvbnRlbnRzOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRcdHNldExhbmd1YWdlSWQobGFuZ3VhZ2VJZDogc3RyaW5nKSB7IH1cblx0XHRzZXRQcmVmZXJyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZykgeyB9XG5cdFx0aXNSZXNvbHZlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHRvdmVycmlkZSBtYXRjaGVzKG90aGVyOiBUZXN0RmlsZUVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0XHRpZiAoc3VwZXIubWF0Y2hlcyhvdGhlcikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvdGhlciBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuIGlzRXF1YWwob3RoZXIucmVzb3VyY2UsIHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaW5wdXQoaWQgPSBTdHJpbmcoaW5kZXgrKyksIG5vblNlcmlhbGl6YWJsZT86IGJvb2xlYW4sIHJlc291cmNlPzogVVJJKTogRWRpdG9ySW5wdXQge1xuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dChpZCwgcmVzb3VyY2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm9uU2VyaWFsaXphYmxlID8gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb25TZXJpYWxpemFibGVUZXN0RWRpdG9ySW5wdXQoaWQpKSA6IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvcklucHV0KGlkKSk7XG5cdH1cblxuXHRpbnRlcmZhY2UgSVNlcmlhbGl6ZWRUZXN0SW5wdXQge1xuXHRcdGlkOiBzdHJpbmc7XG5cdH1cblxuXHRjbGFzcyBUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXG5cdFx0c3RhdGljIGRpc2FibGVTZXJpYWxpemUgPSBmYWxzZTtcblx0XHRzdGF0aWMgZGlzYWJsZURlc2VyaWFsaXplID0gZmFsc2U7XG5cblx0XHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRzZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmIChUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyLmRpc2FibGVTZXJpYWxpemUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGVzdEVkaXRvcklucHV0ID0gPFRlc3RFZGl0b3JJbnB1dD5lZGl0b3JJbnB1dDtcblx0XHRcdGNvbnN0IHRlc3RJbnB1dDogSVNlcmlhbGl6ZWRUZXN0SW5wdXQgPSB7XG5cdFx0XHRcdGlkOiB0ZXN0RWRpdG9ySW5wdXQuaWRcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh0ZXN0SW5wdXQpO1xuXHRcdH1cblxuXHRcdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcmlhbGl6ZWRFZGl0b3JJbnB1dDogc3RyaW5nKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdFx0aWYgKFRlc3RFZGl0b3JJbnB1dFNlcmlhbGl6ZXIuZGlzYWJsZURlc2VyaWFsaXplKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRlc3RJbnB1dDogSVNlcmlhbGl6ZWRUZXN0SW5wdXQgPSBKU09OLnBhcnNlKHNlcmlhbGl6ZWRFZGl0b3JJbnB1dCk7XG5cblx0XHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JJbnB1dCh0ZXN0SW5wdXQuaWQpKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0VGVzdEVkaXRvcklucHV0U2VyaWFsaXplci5kaXNhYmxlU2VyaWFsaXplID0gZmFsc2U7XG5cdFx0VGVzdEVkaXRvcklucHV0U2VyaWFsaXplci5kaXNhYmxlRGVzZXJpYWxpemUgPSBmYWxzZTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcigndGVzdEVkaXRvcklucHV0Rm9yR3JvdXBzJywgVGVzdEVkaXRvcklucHV0U2VyaWFsaXplcikpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGluZGV4ID0gMTtcblx0fSk7XG5cblx0dGVzdCgnQ2xvbmUgR3JvdXAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpIGFzIFRlc3RFZGl0b3JJbnB1dDtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cblx0XHQvLyBQaW5uZWQgYW5kIEFjdGl2ZVxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogZmFsc2UsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdC8vIFN0aWNreVxuXHRcdGdyb3VwLnN0aWNrKGlucHV0Mik7XG5cdFx0YXNzZXJ0Lm9rKGdyb3VwLmlzU3RpY2t5KGlucHV0MikpO1xuXG5cdFx0Ly8gTG9ja2VkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzTG9ja2VkLCBmYWxzZSk7XG5cdFx0Z3JvdXAubG9jayh0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNMb2NrZWQsIHRydWUpO1xuXG5cdFx0Y29uc3QgY2xvbmUgPSBkaXNwb3NhYmxlcy5hZGQoZ3JvdXAuY2xvbmUoKSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGdyb3VwLmlkLCBjbG9uZS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUuaXNMb2NrZWQsIGZhbHNlKTsgLy8gbG9ja2luZyBkb2VzIG5vdCBjbG9uZSBvdmVyXG5cblx0XHRsZXQgZGlkRWRpdG9yTGFiZWxDaGFuZ2UgPSBmYWxzZTtcblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBjbG9uZS5vbkRpZE1vZGVsQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTEFCRUwpIHtcblx0XHRcdFx0ZGlkRWRpdG9yTGFiZWxDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlucHV0MS5zZXRMYWJlbCgpO1xuXHRcdGFzc2VydC5vayhkaWRFZGl0b3JMYWJlbENoYW5nZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUuaXNQaW5uZWQoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmlzQWN0aXZlKGlucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUuaXNTdGlja3koaW5wdXQxKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmlzUGlubmVkKGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZS5pc0FjdGl2ZShpbnB1dDIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmlzU3RpY2t5KGlucHV0MiksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmlzUGlubmVkKGlucHV0MyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUuaXNBY3RpdmUoaW5wdXQzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmlzU3RpY2t5KGlucHV0MyksIGZhbHNlKTtcblxuXHRcdHRvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzQWN0aXZlIC0gdW50eXBlZCcsICgpID0+IHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dCgndGVzdElucHV0JywgVVJJLmZpbGUoJ2Zha2UnKSkpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dCgndGVzdElucHV0MicsIFVSSS5maWxlKCdmYWtlMicpKSk7XG5cdFx0Y29uc3QgdW50eXBlZElucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJy9mYWtlJyksIG9wdGlvbnM6IHsgb3ZlcnJpZGU6ICd0ZXN0SW5wdXQnIH0gfTtcblx0XHRjb25zdCB1bnR5cGVkTm9uQWN0aXZlSW5wdXQgPSB7IHJlc291cmNlOiBVUkkuZmlsZSgnL2Zha2UyJyksIG9wdGlvbnM6IHsgb3ZlcnJpZGU6ICd0ZXN0SW5wdXQyJyB9IH07XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IGFjdGl2ZTogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQub2soZ3JvdXAuaXNBY3RpdmUoaW5wdXQpKTtcblx0XHRhc3NlcnQub2soZ3JvdXAuaXNBY3RpdmUodW50eXBlZElucHV0KSk7XG5cdFx0YXNzZXJ0Lm9rKCFncm91cC5pc0FjdGl2ZSh1bnR5cGVkTm9uQWN0aXZlSW5wdXQpKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvciAtIHByZWZlcnMgZXhpc3Rpbmcgc2lkZSBieSBzaWRlIGVkaXRvciBpZiBzYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBpbnB1dDEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoJ3Rlc3RJbnB1dCcsIFVSSS5maWxlKCdmYWtlMScpKSk7XG5cdFx0Y29uc3QgaW5wdXQyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KCd0ZXN0SW5wdXQnLCBVUkkuZmlsZSgnZmFrZTInKSkpO1xuXG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZUlucHV0U2FtZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGlucHV0MSwgaW5wdXQxKTtcblx0XHRjb25zdCBzaWRlQnlTaWRlSW5wdXREaWZmZXJlbnQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBpbnB1dDEsIGlucHV0Mik7XG5cblx0XHRsZXQgcmVzID0gZ3JvdXAub3BlbkVkaXRvcihzaWRlQnlTaWRlSW5wdXRTYW1lLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZWRpdG9yLCBzaWRlQnlTaWRlSW5wdXRTYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmlzTmV3LCB0cnVlKTtcblxuXHRcdHJlcyA9IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZWRpdG9yLCBzaWRlQnlTaWRlSW5wdXRTYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmlzTmV3LCBmYWxzZSk7XG5cblx0XHRncm91cC5jbG9zZUVkaXRvcihzaWRlQnlTaWRlSW5wdXRTYW1lKTtcblx0XHRyZXMgPSBncm91cC5vcGVuRWRpdG9yKHNpZGVCeVNpZGVJbnB1dERpZmZlcmVudCwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmVkaXRvciwgc2lkZUJ5U2lkZUlucHV0RGlmZmVyZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmlzTmV3LCB0cnVlKTtcblxuXHRcdHJlcyA9IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuaXNOZXcsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmRleE9mKCkgLSBwcmVmZXJzIGRpcmVjdCBtYXRjaGluZyBlZGl0b3Igb3ZlciBzaWRlIGJ5IHNpZGUgbWF0Y2hpbmcgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBpbnB1dDEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoJ3Rlc3RJbnB1dCcsIFVSSS5maWxlKCdmYWtlMScpKSk7XG5cblx0XHRjb25zdCBzaWRlQnlTaWRlSW5wdXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBpbnB1dDEsIGlucHV0MSk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKHNpZGVCeVNpZGVJbnB1dCwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihzaWRlQnlTaWRlSW5wdXQpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDEpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQxLCB1bmRlZmluZWQsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCB9KSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQxLCB1bmRlZmluZWQsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCAwKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MSwgdW5kZWZpbmVkLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEggfSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MSwgdW5kZWZpbmVkLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSB9KSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRhaW5zKCkgLSB1bnR5cGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGdyb3VwID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgnaW5wdXQxJywgZmFsc2UsIFVSSS5maWxlKCcvaW5wdXQxJykpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCdpbnB1dDInLCBmYWxzZSwgVVJJLmZpbGUoJy9pbnB1dDInKSk7XG5cblx0XHRjb25zdCB1bnR5cGVkSW5wdXQxID0geyByZXNvdXJjZTogVVJJLmZpbGUoJy9pbnB1dDEnKSwgb3B0aW9uczogeyBvdmVycmlkZTogJ2lucHV0MScgfSB9O1xuXHRcdGNvbnN0IHVudHlwZWRJbnB1dDIgPSB7IHJlc291cmNlOiBVUkkuZmlsZSgnL2lucHV0MicpLCBvcHRpb25zOiB7IG92ZXJyaWRlOiAnaW5wdXQyJyB9IH07XG5cblx0XHRjb25zdCBkaWZmSW5wdXQxID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlmZkVkaXRvcklucHV0LCAnbmFtZScsICdkZXNjcmlwdGlvbicsIGlucHV0MSwgaW5wdXQyLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGRpZmZJbnB1dDIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9ySW5wdXQsICduYW1lJywgJ2Rlc2NyaXB0aW9uJywgaW5wdXQyLCBpbnB1dDEsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB1bnR5cGVkRGlmZklucHV0MTogSVJlc291cmNlRGlmZkVkaXRvcklucHV0ID0ge1xuXHRcdFx0b3JpZ2luYWw6IHVudHlwZWRJbnB1dDEsXG5cdFx0XHRtb2RpZmllZDogdW50eXBlZElucHV0MlxuXHRcdH07XG5cdFx0Y29uc3QgdW50eXBlZERpZmZJbnB1dDI6IElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCA9IHtcblx0XHRcdG9yaWdpbmFsOiB1bnR5cGVkSW5wdXQyLFxuXHRcdFx0bW9kaWZpZWQ6IHVudHlwZWRJbnB1dDFcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZUlucHV0U2FtZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgJ25hbWUnLCB1bmRlZmluZWQsIGlucHV0MSwgaW5wdXQxKTtcblx0XHRjb25zdCBzaWRlQnlTaWRlSW5wdXREaWZmZXJlbnQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaWRlQnlTaWRlRWRpdG9ySW5wdXQsICduYW1lJywgdW5kZWZpbmVkLCBpbnB1dDEsIGlucHV0Mik7XG5cblx0XHRjb25zdCB1bnR5cGVkU2lkZUJ5U2lkZUlucHV0U2FtZTogSVJlc291cmNlU2lkZUJ5U2lkZUVkaXRvcklucHV0ID0ge1xuXHRcdFx0cHJpbWFyeTogdW50eXBlZElucHV0MSxcblx0XHRcdHNlY29uZGFyeTogdW50eXBlZElucHV0MVxuXHRcdH07XG5cdFx0Y29uc3QgdW50eXBlZFNpZGVCeVNpZGVJbnB1dERpZmZlcmVudDogSVJlc291cmNlU2lkZUJ5U2lkZUVkaXRvcklucHV0ID0ge1xuXHRcdFx0cHJpbWFyeTogdW50eXBlZElucHV0Mixcblx0XHRcdHNlY29uZGFyeTogdW50eXBlZElucHV0MVxuXHRcdH07XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkSW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEsIHsgc3RyaWN0RXF1YWxzOiB0cnVlIH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiwgeyBzdHJpY3RFcXVhbHM6IHRydWUgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWREaWZmSW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkRGlmZklucHV0MiksIGZhbHNlKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkRGlmZklucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZERpZmZJbnB1dDIpLCBmYWxzZSk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGRpZmZJbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkSW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWREaWZmSW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWREaWZmSW5wdXQyKSwgZmFsc2UpO1xuXG5cdFx0Z3JvdXAub3BlbkVkaXRvcihkaWZmSW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkRGlmZklucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkRGlmZklucHV0MiksIHRydWUpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkSW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkSW5wdXQxLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkSW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWREaWZmSW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWREaWZmSW5wdXQyKSwgdHJ1ZSk7XG5cblx0XHRncm91cC5jbG9zZUVkaXRvcihpbnB1dDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkRGlmZklucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkRGlmZklucHV0MiksIHRydWUpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoZGlmZklucHV0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkSW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkSW5wdXQyLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWREaWZmSW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkRGlmZklucHV0MiksIHRydWUpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoZGlmZklucHV0Mik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MiwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZERpZmZJbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWREaWZmSW5wdXQyKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAwKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKHNpZGVCeVNpZGVJbnB1dFNhbWUsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRTaWRlQnlTaWRlSW5wdXRTYW1lKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlksIHN0cmljdEVxdWFsczogdHJ1ZSB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkSW5wdXQxLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEgsIHN0cmljdEVxdWFsczogdHJ1ZSB9KSwgZmFsc2UpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3Ioc2lkZUJ5U2lkZUlucHV0U2FtZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3Ioc2lkZUJ5U2lkZUlucHV0RGlmZmVyZW50LCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyh1bnR5cGVkU2lkZUJ5U2lkZUlucHV0RGlmZmVyZW50KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKHVudHlwZWRJbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnModW50eXBlZElucHV0MSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRhaW5zKCknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblxuXHRcdGNvbnN0IGRpZmZJbnB1dDEgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9ySW5wdXQsICduYW1lJywgJ2Rlc2NyaXB0aW9uJywgaW5wdXQxLCBpbnB1dDIsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgZGlmZklucHV0MiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpZmZFZGl0b3JJbnB1dCwgJ25hbWUnLCAnZGVzY3JpcHRpb24nLCBpbnB1dDIsIGlucHV0MSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHNpZGVCeVNpZGVJbnB1dFNhbWUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaWRlQnlTaWRlRWRpdG9ySW5wdXQsICduYW1lJywgdW5kZWZpbmVkLCBpbnB1dDEsIGlucHV0MSk7XG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZUlucHV0RGlmZmVyZW50ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2lkZUJ5U2lkZUVkaXRvcklucHV0LCAnbmFtZScsIHVuZGVmaW5lZCwgaW5wdXQxLCBpbnB1dDIpO1xuXG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0MSwgeyBzdHJpY3RFcXVhbHM6IHRydWUgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDIsIHsgc3RyaWN0RXF1YWxzOiB0cnVlIH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0MiwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MiksIGZhbHNlKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MiksIGZhbHNlKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoZGlmZklucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGRpZmZJbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MiksIGZhbHNlKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoZGlmZklucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGRpZmZJbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MiksIHRydWUpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0MSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhkaWZmSW5wdXQyKSwgdHJ1ZSk7XG5cblx0XHRncm91cC5jbG9zZUVkaXRvcihpbnB1dDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQxLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQyLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGRpZmZJbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MiksIHRydWUpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoZGlmZklucHV0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDIsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoZGlmZklucHV0MiksIHRydWUpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoZGlmZklucHV0Mik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQyLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhkaWZmSW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhkaWZmSW5wdXQyKSwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQodW5kZWZpbmVkLCB0cnVlLCBVUkkucGFyc2UoJ2ZvbzovL2JhcicpKTtcblxuXHRcdGNvbnN0IGlucHV0NCA9IGlucHV0KHVuZGVmaW5lZCwgdHJ1ZSwgVVJJLnBhcnNlKCdmb286Ly9iYXJzb21ldGhpbmcnKSk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQ0KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDMpLCB0cnVlKTtcblxuXHRcdGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0Myk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQzKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAwKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKHNpZGVCeVNpZGVJbnB1dFNhbWUsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoc2lkZUJ5U2lkZUlucHV0U2FtZSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoaW5wdXQxLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEggfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZLCBzdHJpY3RFcXVhbHM6IHRydWUgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCwgc3RyaWN0RXF1YWxzOiB0cnVlIH0pLCB0cnVlKTtcblxuXHRcdGdyb3VwLmNsb3NlRWRpdG9yKHNpZGVCeVNpZGVJbnB1dFNhbWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAwKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKHNpZGVCeVNpZGVJbnB1dERpZmZlcmVudCwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY29udGFpbnMoc2lkZUJ5U2lkZUlucHV0RGlmZmVyZW50KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0MSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZLCBzdHJpY3RFcXVhbHM6IHRydWUgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dDEsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCwgc3RyaWN0RXF1YWxzOiB0cnVlIH0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyb3VwIHNlcmlhbGl6YXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0aW5zdCgpLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkuc3RhcnQoYWNjZXNzb3IpKTtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgpO1xuXG5cdFx0Ly8gQ2FzZSAxOiBpbnB1dHMgY2FuIGJlIHNlcmlhbGl6ZWQgYW5kIGRlc2VyaWFsaXplZFxuXG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiBmYWxzZSwgYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0bGV0IGRlc2VyaWFsaXplZCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoZ3JvdXAuc2VyaWFsaXplKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pZCwgZGVzZXJpYWxpemVkLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmlzUGlubmVkKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuaXNQaW5uZWQoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5pc1Bpbm5lZChpbnB1dDMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5pc0FjdGl2ZShpbnB1dDMpLCB0cnVlKTtcblxuXHRcdC8vIENhc2UgMjogaW5wdXRzIGNhbm5vdCBiZSBzZXJpYWxpemVkXG5cdFx0VGVzdEVkaXRvcklucHV0U2VyaWFsaXplci5kaXNhYmxlU2VyaWFsaXplID0gdHJ1ZTtcblxuXHRcdGRlc2VyaWFsaXplZCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoZ3JvdXAuc2VyaWFsaXplKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pZCwgZGVzZXJpYWxpemVkLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblxuXHRcdC8vIENhc2UgMzogaW5wdXRzIGNhbm5vdCBiZSBkZXNlcmlhbGl6ZWRcblx0XHRUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyLmRpc2FibGVTZXJpYWxpemUgPSBmYWxzZTtcblx0XHRUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyLmRpc2FibGVEZXNlcmlhbGl6ZSA9IHRydWU7XG5cblx0XHRkZXNlcmlhbGl6ZWQgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKGdyb3VwLnNlcmlhbGl6ZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaWQsIGRlc2VyaWFsaXplZC5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyb3VwIHNlcmlhbGl6YXRpb24gKHN0aWNreSBlZGl0b3IpJywgZnVuY3Rpb24gKCkge1xuXHRcdGluc3QoKS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnN0YXJ0KGFjY2Vzc29yKSk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblxuXHRcdC8vIENhc2UgMTogaW5wdXRzIGNhbiBiZSBzZXJpYWxpemVkIGFuZCBkZXNlcmlhbGl6ZWRcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogZmFsc2UsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGdyb3VwLnN0aWNrKGlucHV0Mik7XG5cdFx0YXNzZXJ0Lm9rKGdyb3VwLmlzU3RpY2t5KGlucHV0MikpO1xuXG5cdFx0bGV0IGRlc2VyaWFsaXplZCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoZ3JvdXAuc2VyaWFsaXplKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pZCwgZGVzZXJpYWxpemVkLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmNvdW50LCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuaXNQaW5uZWQoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5pc0FjdGl2ZShpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5pc1N0aWNreShpbnB1dDEpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmlzUGlubmVkKGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuaXNBY3RpdmUoaW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuaXNTdGlja3koaW5wdXQyKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmlzUGlubmVkKGlucHV0MyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmlzQWN0aXZlKGlucHV0MyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuaXNTdGlja3koaW5wdXQzKSwgZmFsc2UpO1xuXG5cdFx0Ly8gQ2FzZSAyOiBpbnB1dHMgY2Fubm90IGJlIHNlcmlhbGl6ZWRcblx0XHRUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyLmRpc2FibGVTZXJpYWxpemUgPSB0cnVlO1xuXG5cdFx0ZGVzZXJpYWxpemVkID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbChncm91cC5zZXJpYWxpemUoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlkLCBkZXNlcmlhbGl6ZWQuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuc3RpY2t5Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXNlcmlhbGl6ZWQuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDApO1xuXG5cdFx0Ly8gQ2FzZSAzOiBpbnB1dHMgY2Fubm90IGJlIGRlc2VyaWFsaXplZFxuXHRcdFRlc3RFZGl0b3JJbnB1dFNlcmlhbGl6ZXIuZGlzYWJsZVNlcmlhbGl6ZSA9IGZhbHNlO1xuXHRcdFRlc3RFZGl0b3JJbnB1dFNlcmlhbGl6ZXIuZGlzYWJsZURlc2VyaWFsaXplID0gdHJ1ZTtcblxuXHRcdGRlc2VyaWFsaXplZCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoZ3JvdXAuc2VyaWFsaXplKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pZCwgZGVzZXJpYWxpemVkLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLnN0aWNreUNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVkLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZ3JvdXAgc2VyaWFsaXphdGlvbiAobG9ja2VkIGdyb3VwKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubG9ja2VkLmxlbmd0aCwgMCk7XG5cblx0XHRncm91cC5sb2NrKHRydWUpO1xuXHRcdGdyb3VwLmxvY2sodHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxvY2tlZC5sZW5ndGgsIDEpO1xuXG5cdFx0Z3JvdXAubG9jayhmYWxzZSk7XG5cdFx0Z3JvdXAubG9jayhmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxvY2tlZC5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NrZWQgZ3JvdXAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Z3JvdXAubG9jayh0cnVlKTtcblxuXHRcdGxldCBkZXNlcmlhbGl6ZWQgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKGdyb3VwLnNlcmlhbGl6ZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaWQsIGRlc2VyaWFsaXplZC5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5pc0xvY2tlZCwgdHJ1ZSk7XG5cblx0XHRncm91cC5sb2NrKGZhbHNlKTtcblx0XHRkZXNlcmlhbGl6ZWQgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKGdyb3VwLnNlcmlhbGl6ZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaWQsIGRlc2VyaWFsaXplZC5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2VyaWFsaXplZC5pc0xvY2tlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmRleCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuaW5kZXgubGVuZ3RoLCAwKTtcblxuXHRcdGdyb3VwLnNldEluZGV4KDQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5pbmRleC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYWJlbCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGFiZWwubGVuZ3RoLCAwKTtcblxuXHRcdGdyb3VwLnNldExhYmVsKCdXaW5kb3cgMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sYWJlbC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Y29uc3QgZXZlbnRzID0gZ3JvdXBMaXN0ZW5lcihncm91cCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmFjdGl2ZS5sZW5ndGgsIDApO1xuXG5cdFx0Z3JvdXAuc2V0QWN0aXZlKHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmFjdGl2ZS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdPbmUgRWRpdG9yJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGdyb3VwID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXHRcdGNvbnN0IGV2ZW50cyA9IGdyb3VwTGlzdGVuZXIoZ3JvdXApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMCk7XG5cblx0XHQvLyBBY3RpdmUgJiYgUGlubmVkXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCB7IGVkaXRvcjogb3BlbmVkRWRpdG9yLCBpc05ldyB9ID0gZ3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgYWN0aXZlOiB0cnVlLCBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZEVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNOZXcsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmZpbmRFZGl0b3IoaW5wdXQxKSFbMF0sIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzUGlubmVkKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZCgwKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRmlyc3QoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzTGFzdChpbnB1dDEpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMub3BlbmVkWzBdLmVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm9wZW5lZFswXS5lZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5hY3RpdmF0ZWRbMF0uZWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuYWN0aXZhdGVkWzBdLmVkaXRvckluZGV4LCAwKTtcblxuXHRcdGNvbnN0IGluZGV4ID0gZ3JvdXAuaW5kZXhPZihpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5maW5kRWRpdG9yKGlucHV0MSkhWzFdLCBpbmRleCk7XG5cdFx0bGV0IGV2ZW50ID0gZ3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQxLCBFZGl0b3JDbG9zZUNvbnRleHQuVU5QSU4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uZWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uZWRpdG9ySW5kZXgsIGluZGV4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNGaXJzdChpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzTGFzdChpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5jbG9zZWRbMF0uZWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuY2xvc2VkWzBdLmVkaXRvckluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFswXS5jb250ZXh0ID09PSBFZGl0b3JDbG9zZUNvbnRleHQuVU5QSU4sIHRydWUpO1xuXG5cdFx0Ly8gQWN0aXZlICYmIFByZXZpZXdcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzUGlubmVkKDApLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm9wZW5lZFsxXS5lZGl0b3IsIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5vcGVuZWRbMV0uZWRpdG9ySW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuYWN0aXZhdGVkWzFdLmVkaXRvciwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmFjdGl2YXRlZFsxXS5lZGl0b3JJbmRleCwgMCk7XG5cblx0XHRncm91cC5jbG9zZUVkaXRvcihpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuY2xvc2VkWzFdLmVkaXRvciwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFsxXS5lZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5jbG9zZWRbMV0uY29udGV4dCA9PT0gRWRpdG9yQ2xvc2VDb250ZXh0LlJFUExBQ0UsIGZhbHNlKTtcblxuXHRcdGV2ZW50ID0gZ3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQyKTtcblx0XHRhc3NlcnQub2soIWV2ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFsxXS5lZGl0b3IsIGlucHV0Mik7XG5cblx0XHQvLyBOb25hY3RpdmUgJiYgUGlubmVkID0+IGdldHMgYWN0aXZlIGJlY2F1c2UgaXRzIGZpcnN0IGVkaXRvclxuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgYWN0aXZlOiBmYWxzZSwgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzUGlubmVkKGlucHV0MyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZCgwKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm9wZW5lZFsyXS5lZGl0b3IsIGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5hY3RpdmF0ZWRbMl0uZWRpdG9yLCBpbnB1dDMpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFsyXS5lZGl0b3IsIGlucHV0Myk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm9wZW5lZFsyXS5lZGl0b3IsIGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5hY3RpdmF0ZWRbMl0uZWRpdG9yLCBpbnB1dDMpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFsyXS5lZGl0b3IsIGlucHV0Myk7XG5cblx0XHQvLyBOb25hY3RpdmUgJiYgUHJldmlldyA9PiBnZXRzIGFjdGl2ZSBiZWNhdXNlIGl0cyBmaXJzdCBlZGl0b3Jcblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0NCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0NCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzUGlubmVkKDApLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm9wZW5lZFszXS5lZGl0b3IsIGlucHV0NCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5hY3RpdmF0ZWRbM10uZWRpdG9yLCBpbnB1dDQpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFszXS5lZGl0b3IsIGlucHV0NCk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcGxlIEVkaXRvcnMgLSBQaW5uZWQgYW5kIEFjdGl2ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCcxJyk7XG5cdFx0Y29uc3QgaW5wdXQxQ29weSA9IGlucHV0KCcxJyk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoJzInKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgnMycpO1xuXG5cdFx0Ly8gUGlubmVkIGFuZCBBY3RpdmVcblx0XHRsZXQgb3BlbmVkRWRpdG9yUmVzdWx0ID0gZ3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZEVkaXRvclJlc3VsdC5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZEVkaXRvclJlc3VsdC5pc05ldywgdHJ1ZSk7XG5cblx0XHRvcGVuZWRFZGl0b3JSZXN1bHQgPSBncm91cC5vcGVuRWRpdG9yKGlucHV0MUNvcHksIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7IC8vIG9wZW5pbmcgY29weSBvZiBlZGl0b3Igc2hvdWxkIHN0aWxsIHJldHVybiBleGlzdGluZyBvbmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkRWRpdG9yUmVzdWx0LmVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkRWRpdG9yUmVzdWx0LmlzTmV3LCBmYWxzZSk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNGaXJzdChpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNGaXJzdChpbnB1dDIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRmlyc3QoaW5wdXQzKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0xhc3QoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0xhc3QoaW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0xhc3QoaW5wdXQzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm9wZW5lZFswXS5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5vcGVuZWRbMV0uZWRpdG9yLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMub3BlbmVkWzJdLmVkaXRvciwgaW5wdXQzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuYWN0aXZhdGVkWzBdLmVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmFjdGl2YXRlZFswXS5lZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5hY3RpdmF0ZWRbMV0uZWRpdG9yLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuYWN0aXZhdGVkWzFdLmVkaXRvckluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmFjdGl2YXRlZFsyXS5lZGl0b3IsIGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5hY3RpdmF0ZWRbMl0uZWRpdG9ySW5kZXgsIDIpO1xuXG5cdFx0Y29uc3QgbXJ1ID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMF0sIGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsxXSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzJdLCBpbnB1dDEpO1xuXG5cdFx0Ly8gQWRkIHNvbWUgdGVzdHMgd2hlcmUgYSBtYXRjaGluZyBpbnB1dCBpcyB1c2VkXG5cdFx0Ly8gYW5kIHZlcmlmeSB0aGF0IGV2ZW50cyBjYXJyeSB0aGUgb3JpZ2luYWwgaW5wdXRcblx0XHRjb25zdCBzYW1lSW5wdXQxID0gaW5wdXQoJzEnKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKHNhbWVJbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5hY3RpdmF0ZWRbM10uZWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuYWN0aXZhdGVkWzNdLmVkaXRvckluZGV4LCAwKTtcblxuXHRcdGdyb3VwLnVucGluKHNhbWVJbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMudW5waW5uZWRbMF0uZWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMudW5waW5uZWRbMF0uZWRpdG9ySW5kZXgsIDApO1xuXG5cdFx0Z3JvdXAucGluKHNhbWVJbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMucGlubmVkWzBdLmVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLnBpbm5lZFswXS5lZGl0b3JJbmRleCwgMCk7XG5cblx0XHRncm91cC5zdGljayhzYW1lSW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLnN0aWNreVswXS5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5zdGlja3lbMF0uZWRpdG9ySW5kZXgsIDApO1xuXG5cdFx0Z3JvdXAudW5zdGljayhzYW1lSW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLnVuc3RpY2t5WzBdLmVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLnVuc3RpY2t5WzBdLmVkaXRvckluZGV4LCAwKTtcblxuXHRcdGdyb3VwLm1vdmVFZGl0b3Ioc2FtZUlucHV0MSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5tb3ZlZFswXS5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5tb3ZlZFswXS5vbGRFZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5tb3ZlZFswXS5lZGl0b3JJbmRleCwgMSk7XG5cblx0XHRncm91cC5jbG9zZUVkaXRvcihzYW1lSW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFswXS5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5jbG9zZWRbMF0uZWRpdG9ySW5kZXgsIDEpO1xuXG5cdFx0Y2xvc2VBbGxFZGl0b3JzKGdyb3VwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuY2xvc2VkLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgRWRpdG9ycyAtIFByZXZpZXcgZWRpdG9yIG1vdmVzIHRvIHRoZSBzaWRlIG9mIHRoZSBhY3RpdmUgb25lJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGdyb3VwID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IGZhbHNlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQzLCBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsyXSk7XG5cblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IHBpbm5lZDogZmFsc2UsIGFjdGl2ZTogdHJ1ZSB9KTsgLy8gdGhpcyBzaG91bGQgY2F1c2UgdGhlIHByZXZpZXcgZWRpdG9yIHRvIG1vdmUgYWZ0ZXIgaW5wdXQzXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQ0LCBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsyXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcGxlIEVkaXRvcnMgLSBQaW5uZWQgYW5kIEFjdGl2ZSAoREVGQVVMVF9PUEVOX0VESVRPUl9ESVJFQ1RJT04gPSBEaXJlY3Rpb24uTEVGVCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5zdCA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0LnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdC5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblx0XHRpbnN0LnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCkpO1xuXHRcdGluc3Quc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGluc3Quc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZyk7XG5cdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnLCB7IGVkaXRvcjogeyBvcGVuUG9zaXRpb25pbmc6ICdsZWZ0JyB9IH0pO1xuXG5cdFx0Y29uc3QgZ3JvdXA6IEVkaXRvckdyb3VwTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdC5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGdyb3VwTGlzdGVuZXIoZ3JvdXApO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cblx0XHQvLyBQaW5uZWQgYW5kIEFjdGl2ZVxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsxXSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMl0sIGlucHV0MSk7XG5cblx0XHRjbG9zZUFsbEVkaXRvcnMoZ3JvdXApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5jbG9zZWQubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHRcdGluc3QuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBFZGl0b3JzIC0gUGlubmVkIGFuZCBOb3QgQWN0aXZlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGdyb3VwID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cblx0XHQvLyBQaW5uZWQgYW5kIEFjdGl2ZVxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzUGlubmVkKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZCgwKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzUGlubmVkKDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQzKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoMiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDMpLCB0cnVlKTtcblxuXHRcdGNvbnN0IG1ydSA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzBdLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMV0sIGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsyXSwgaW5wdXQyKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgRWRpdG9ycyAtIFByZXZpZXcgZ2V0cyBvdmVyd3JpdHRlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgpO1xuXG5cdFx0Ly8gTm9uIGFjdGl2ZSwgcHJldmlld1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxKTsgLy8gYmVjb21lcyBhY3RpdmUsIHByZXZpZXdcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0Mik7IC8vIG92ZXJ3cml0ZXMgcHJldmlld1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzKTsgLy8gb3ZlcndyaXRlcyBwcmV2aWV3XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0FjdGl2ZShpbnB1dDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXQzKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCghZ3JvdXAuaXNQaW5uZWQoaW5wdXQzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm9wZW5lZFswXS5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5vcGVuZWRbMV0uZWRpdG9yLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMub3BlbmVkWzJdLmVkaXRvciwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFswXS5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5jbG9zZWRbMV0uZWRpdG9yLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuY2xvc2VkWzBdLmNvbnRleHQgPT09IEVkaXRvckNsb3NlQ29udGV4dC5SRVBMQUNFLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFsxXS5jb250ZXh0ID09PSBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBtcnUgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVswXSwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1Lmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcGxlIEVkaXRvcnMgLSBzZXQgYWN0aXZlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGdyb3VwID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXHRcdGNvbnN0IGV2ZW50cyA9IGdyb3VwTGlzdGVuZXIoZ3JvdXApO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IGZhbHNlLCBhY3RpdmU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDMpO1xuXG5cdFx0bGV0IG1ydSA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzBdLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMV0sIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsyXSwgaW5wdXQxKTtcblxuXHRcdGdyb3VwLnNldEFjdGl2ZShpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuYWN0aXZhdGVkLmxlbmd0aCwgMyk7XG5cblx0XHRncm91cC5zZXRBY3RpdmUoaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmFjdGl2YXRlZFszXS5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQzKSwgZmFsc2UpO1xuXG5cdFx0bXJ1ID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMF0sIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsxXSwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzJdLCBpbnB1dDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBFZGl0b3JzIC0gcGluIGFuZCB1bnBpbicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgpO1xuXG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiBmYWxzZSwgYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDMpO1xuXG5cdFx0Z3JvdXAucGluKGlucHV0Myk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5waW5uZWRbMF0uZWRpdG9yLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cblx0XHRncm91cC51bnBpbihpbnB1dDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0FjdGl2ZShpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy51bnBpbm5lZFswXS5lZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblxuXHRcdGdyb3VwLnVucGluKGlucHV0Mik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7IC8vIDIgcHJldmlld3MgZ290IG1lcmdlZCBpbnRvIG9uZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMV0sIGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5jbG9zZWRbMF0uZWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cblx0XHRncm91cC51bnBpbihpbnB1dDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDEpOyAvLyBwaW5uaW5nIHJlcGxhY2VkIHRoZSBwcmV2aWV3XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuY2xvc2VkWzFdLmVkaXRvciwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBFZGl0b3JzIC0gY2xvc2luZyBwaWNrcyBuZXh0IGZyb20gTVJVIGxpc3QnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Y29uc3QgZXZlbnRzID0gZ3JvdXBMaXN0ZW5lcihncm91cCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0NSA9IGlucHV0KCk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NCwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0NSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVswXSwgaW5wdXQ1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDUpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQ1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuYWN0aXZhdGVkWzVdLmVkaXRvciwgaW5wdXQ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDQpO1xuXG5cdFx0Z3JvdXAuc2V0QWN0aXZlKGlucHV0MSk7XG5cdFx0Z3JvdXAuc2V0QWN0aXZlKGlucHV0NCk7XG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQ0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblxuXHRcdGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cblx0XHRncm91cC5zZXRBY3RpdmUoaW5wdXQyKTtcblx0XHRncm91cC5jbG9zZUVkaXRvcihpbnB1dDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDEpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQzKTtcblxuXHRcdGFzc2VydC5vayghZ3JvdXAuYWN0aXZlRWRpdG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBFZGl0b3JzIC0gY2xvc2luZyBwaWNrcyBuZXh0IHRvIHRoZSByaWdodCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnN0ID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXHRcdGluc3Quc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0LnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXHRcdGluc3Quc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSk7XG5cdFx0aW5zdC5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnLCB7IGVkaXRvcjogeyBmb2N1c1JlY2VudEVkaXRvckFmdGVyQ2xvc2U6IGZhbHNlIH0gfSk7XG5cdFx0aW5zdC5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKGluc3QuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBNb2RlbCwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgZXZlbnRzID0gZ3JvdXBMaXN0ZW5lcihncm91cCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0NSA9IGlucHV0KCk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NCwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0NSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVswXSwgaW5wdXQ1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDUpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQ1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuYWN0aXZhdGVkWzVdLmVkaXRvciwgaW5wdXQ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDQpO1xuXG5cdFx0Z3JvdXAuc2V0QWN0aXZlKGlucHV0MSk7XG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblxuXHRcdGdyb3VwLnNldEFjdGl2ZShpbnB1dDMpO1xuXHRcdGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0Myk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cblx0XHRncm91cC5jbG9zZUVkaXRvcihpbnB1dDQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDEpO1xuXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQyKTtcblxuXHRcdGFzc2VydC5vayghZ3JvdXAuYWN0aXZlRWRpdG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHRcdGluc3QuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBFZGl0b3JzIC0gbW92ZSBlZGl0b3InLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Y29uc3QgZXZlbnRzID0gZ3JvdXBMaXN0ZW5lcihncm91cCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0NSA9IGlucHV0KCk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGdyb3VwLm1vdmVFZGl0b3IoaW5wdXQxLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWRbMF0uZWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWRbMF0ub2xkRWRpdG9ySW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWRbMF0uZWRpdG9ySW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMV0sIGlucHV0MSk7XG5cblx0XHRncm91cC5zZXRBY3RpdmUoaW5wdXQxKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NCwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGdyb3VwLm1vdmVFZGl0b3IoaW5wdXQ0LCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWRbMV0uZWRpdG9yLCBpbnB1dDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWRbMV0ub2xkRWRpdG9ySW5kZXgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWRbMV0uZWRpdG9ySW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWRbMV0uZWRpdG9yLCBpbnB1dDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXSwgaW5wdXQ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMV0sIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzJdLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVszXSwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbNF0sIGlucHV0NSk7XG5cblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0NCwgMyk7XG5cdFx0Z3JvdXAubW92ZUVkaXRvcihpbnB1dDIsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsxXSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMl0sIGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzNdLCBpbnB1dDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVs0XSwgaW5wdXQ1KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWQubGVuZ3RoLCA0KTtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5tb3ZlZC5sZW5ndGgsIDQpO1xuXHRcdGdyb3VwLm1vdmVFZGl0b3IoaW5wdXQxLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5tb3ZlZC5sZW5ndGgsIDQpO1xuXG5cdFx0Z3JvdXAubW92ZUVkaXRvcihpbnB1dDUsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWQubGVuZ3RoLCA0KTtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0NSwgMTAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm1vdmVkLmxlbmd0aCwgNCk7XG5cblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0NSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubW92ZWQubGVuZ3RoLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMF0sIGlucHV0NSk7XG5cblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MSwgMTAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLm1vdmVkLmxlbmd0aCwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzRdLCBpbnB1dDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBFZGl0b3JzIC0gbW92ZSBlZGl0b3IgYWNyb3NzIGdyb3VwcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBncm91cDEgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Y29uc3QgZ3JvdXAyID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3QgZzFfaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBnMV9pbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGcyX2lucHV0MSA9IGlucHV0KCk7XG5cblx0XHRncm91cDEub3BlbkVkaXRvcihnMV9pbnB1dDEsIHsgYWN0aXZlOiB0cnVlLCBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoZzFfaW5wdXQyLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwMi5vcGVuRWRpdG9yKGcyX2lucHV0MSwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdC8vIEEgbW92ZSBhY3Jvc3MgZ3JvdXBzIGlzIGEgY2xvc2UgaW4gdGhlIG9uZSBncm91cCBhbmQgYW4gb3BlbiBpbiB0aGUgb3RoZXIgZ3JvdXAgYXQgYSBzcGVjaWZpYyBpbmRleFxuXHRcdGdyb3VwMi5jbG9zZUVkaXRvcihnMl9pbnB1dDEpO1xuXHRcdGdyb3VwMS5vcGVuRWRpdG9yKGcyX2lucHV0MSwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSwgaW5kZXg6IDEgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBnMV9pbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMV0sIGcyX2lucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsyXSwgZzFfaW5wdXQyKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgRWRpdG9ycyAtIG1vdmUgZWRpdG9yIGFjcm9zcyBncm91cHMgKGlucHV0IGFscmVhZHkgZXhpc3RzIGluIGdyb3VwIDEpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGdyb3VwMSA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBncm91cDIgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBnMV9pbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGcxX2lucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgZzFfaW5wdXQzID0gaW5wdXQoKTtcblx0XHRjb25zdCBnMl9pbnB1dDEgPSBnMV9pbnB1dDI7XG5cblx0XHRncm91cDEub3BlbkVkaXRvcihnMV9pbnB1dDEsIHsgYWN0aXZlOiB0cnVlLCBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoZzFfaW5wdXQyLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwMS5vcGVuRWRpdG9yKGcxX2lucHV0MywgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cDIub3BlbkVkaXRvcihnMl9pbnB1dDEsIHsgYWN0aXZlOiB0cnVlLCBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHQvLyBBIG1vdmUgYWNyb3NzIGdyb3VwcyBpcyBhIGNsb3NlIGluIHRoZSBvbmUgZ3JvdXAgYW5kIGFuIG9wZW4gaW4gdGhlIG90aGVyIGdyb3VwIGF0IGEgc3BlY2lmaWMgaW5kZXhcblx0XHRncm91cDIuY2xvc2VFZGl0b3IoZzJfaW5wdXQxKTtcblx0XHRncm91cDEub3BlbkVkaXRvcihnMl9pbnB1dDEsIHsgYWN0aXZlOiB0cnVlLCBwaW5uZWQ6IHRydWUsIGluZGV4OiAwIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXSwgZzFfaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzFdLCBnMV9pbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMl0sIGcxX2lucHV0Myk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcGxlIEVkaXRvcnMgLSBQaW5uZWQgJiBOb24gQWN0aXZlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGdyb3VwID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAucHJldmlld0VkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMF0sIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblxuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnByZXZpZXdFZGl0b3IsIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsxXSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDIpO1xuXG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAucHJldmlld0VkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMF0sIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzFdLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsyXSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXQzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgRWRpdG9ycyAtIENsb3NlIE90aGVycywgQ2xvc2UgTGVmdCwgQ2xvc2UgUmlnaHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0NSA9IGlucHV0KCk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NCwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NSwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdC8vIENsb3NlIE90aGVyc1xuXHRcdGNsb3NlRWRpdG9ycyhncm91cCwgZ3JvdXAuYWN0aXZlRWRpdG9yISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQ1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDEpO1xuXG5cdFx0Y2xvc2VBbGxFZGl0b3JzKGdyb3VwKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NCwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NSwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5zZXRBY3RpdmUoaW5wdXQzKTtcblxuXHRcdC8vIENsb3NlIExlZnRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDMpO1xuXHRcdGNsb3NlRWRpdG9ycyhncm91cCwgZ3JvdXAuYWN0aXZlRWRpdG9yLCBDbG9zZURpcmVjdGlvbi5MRUZUKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsxXSwgaW5wdXQ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMl0sIGlucHV0NSk7XG5cblx0XHRjbG9zZUFsbEVkaXRvcnMoZ3JvdXApO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ1LCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwLnNldEFjdGl2ZShpbnB1dDMpO1xuXG5cdFx0Ly8gQ2xvc2UgUmlnaHRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDMpO1xuXHRcdGNsb3NlRWRpdG9ycyhncm91cCwgZ3JvdXAuYWN0aXZlRWRpdG9yLCBDbG9zZURpcmVjdGlvbi5SSUdIVCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMV0sIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzJdLCBpbnB1dDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBFZGl0b3JzIC0gcmVhbCB1c2VyIGV4YW1wbGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHQvLyBbXSAtPiAvaW5kZXguaHRtbC9cblx0XHRjb25zdCBpbmRleEh0bWwgPSBpbnB1dCgnaW5kZXguaHRtbCcpO1xuXHRcdGxldCBvcGVuZWRFZGl0b3IgPSBncm91cC5vcGVuRWRpdG9yKGluZGV4SHRtbCkuZWRpdG9yO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVuZWRFZGl0b3IsIGluZGV4SHRtbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5kZXhIdG1sKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAucHJldmlld0VkaXRvciwgaW5kZXhIdG1sKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMF0sIGluZGV4SHRtbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblxuXHRcdC8vIC9pbmRleC5odG1sLyAtPiAvaW5kZXguaHRtbC9cblx0XHRjb25zdCBzYW1lSW5kZXhIdG1sID0gaW5wdXQoJ2luZGV4Lmh0bWwnKTtcblx0XHRvcGVuZWRFZGl0b3IgPSBncm91cC5vcGVuRWRpdG9yKHNhbWVJbmRleEh0bWwpLmVkaXRvcjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkRWRpdG9yLCBpbmRleEh0bWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGluZGV4SHRtbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnByZXZpZXdFZGl0b3IsIGluZGV4SHRtbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBpbmRleEh0bWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cblx0XHQvLyAvaW5kZXguaHRtbC8gLT4gL3N0eWxlLmNzcy9cblx0XHRjb25zdCBzdHlsZUNzcyA9IGlucHV0KCdzdHlsZS5jc3MnKTtcblx0XHRvcGVuZWRFZGl0b3IgPSBncm91cC5vcGVuRWRpdG9yKHN0eWxlQ3NzKS5lZGl0b3I7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZEVkaXRvciwgc3R5bGVDc3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIHN0eWxlQ3NzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAucHJldmlld0VkaXRvciwgc3R5bGVDc3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXSwgc3R5bGVDc3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cblx0XHQvLyAvc3R5bGUuY3NzLyAtPiBbL3N0eWxlLmNzcy8sIHRlc3QuanNdXG5cdFx0Y29uc3QgdGVzdEpzID0gaW5wdXQoJ3Rlc3QuanMnKTtcblx0XHRvcGVuZWRFZGl0b3IgPSBncm91cC5vcGVuRWRpdG9yKHRlc3RKcywgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KS5lZGl0b3I7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZEVkaXRvciwgdGVzdEpzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAucHJldmlld0VkaXRvciwgc3R5bGVDc3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIHRlc3RKcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzUGlubmVkKHN0eWxlQ3NzKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZCh0ZXN0SnMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMF0sIHN0eWxlQ3NzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMV0sIHRlc3RKcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblxuXHRcdC8vIFsvc3R5bGUuY3NzLywgdGVzdC5qc10gLT4gW3Rlc3QuanMsIC9pbmRleC5odG1sL11cblx0XHRjb25zdCBpbmRleEh0bWwyID0gaW5wdXQoJ2luZGV4Lmh0bWwnKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGluZGV4SHRtbDIsIHsgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGluZGV4SHRtbDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5wcmV2aWV3RWRpdG9yLCBpbmRleEh0bWwyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5kZXhIdG1sMiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQodGVzdEpzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCB0ZXN0SnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsxXSwgaW5kZXhIdG1sMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblxuXHRcdC8vIG1ha2UgdGVzdC5qcyBhY3RpdmVcblx0XHRjb25zdCB0ZXN0SnMyID0gaW5wdXQoJ3Rlc3QuanMnKTtcblx0XHRncm91cC5zZXRBY3RpdmUodGVzdEpzMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgdGVzdEpzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUodGVzdEpzMiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cblx0XHQvLyBbdGVzdC5qcywgL2luZGV4SHRtbC9dIC0+IFt0ZXN0LmpzLCBpbmRleC5odG1sXVxuXHRcdGNvbnN0IGluZGV4SHRtbDMgPSBpbnB1dCgnaW5kZXguaHRtbCcpO1xuXHRcdGdyb3VwLnBpbihpbmRleEh0bWwzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5kZXhIdG1sMyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIHRlc3RKcyk7XG5cblx0XHQvLyBbdGVzdC5qcywgaW5kZXguaHRtbF0gLT4gW3Rlc3QuanMsIGZpbGUudHMsIGluZGV4Lmh0bWxdXG5cdFx0Y29uc3QgZmlsZVRzID0gaW5wdXQoJ2ZpbGUudHMnKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGZpbGVUcywgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoZmlsZVRzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBmaWxlVHMpO1xuXG5cdFx0Ly8gW3Rlc3QuanMsIGluZGV4Lmh0bWwsIGZpbGUudHNdIC0+IFt0ZXN0LmpzLCAvZmlsZS50cy8sIGluZGV4Lmh0bWxdXG5cdFx0Z3JvdXAudW5waW4oZmlsZVRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChmaWxlVHMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgZmlsZVRzKTtcblxuXHRcdC8vIFt0ZXN0LmpzLCAvZmlsZS50cy8sIGluZGV4Lmh0bWxdIC0+IFt0ZXN0LmpzLCAvb3RoZXIudHMvLCBpbmRleC5odG1sXVxuXHRcdGNvbnN0IG90aGVyVHMgPSBpbnB1dCgnb3RoZXIudHMnKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKG90aGVyVHMsIHsgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgb3RoZXJUcyk7XG5cdFx0YXNzZXJ0Lm9rKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLm1hdGNoZXModGVzdEpzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzFdLCBvdGhlclRzKTtcblx0XHRhc3NlcnQub2soZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMl0ubWF0Y2hlcyhpbmRleEh0bWwpKTtcblxuXHRcdC8vIG1ha2UgaW5kZXguaHRtbCBhY3RpdmVcblx0XHRjb25zdCBpbmRleEh0bWw0ID0gaW5wdXQoJ2luZGV4Lmh0bWwnKTtcblx0XHRncm91cC5zZXRBY3RpdmUoaW5kZXhIdG1sNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5kZXhIdG1sMik7XG5cblx0XHQvLyBbdGVzdC5qcywgL290aGVyLnRzLywgaW5kZXguaHRtbF0gLT4gW3Rlc3QuanMsIC9vdGhlci50cy9dXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5kZXhIdG1sKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIG90aGVyVHMpO1xuXHRcdGFzc2VydC5vayhncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXS5tYXRjaGVzKHRlc3RKcykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsxXSwgb3RoZXJUcyk7XG5cblx0XHQvLyBbdGVzdC5qcywgL290aGVyLnRzL10gLT4gW3Rlc3QuanNdXG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3Iob3RoZXJUcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCB0ZXN0SnMpO1xuXHRcdGFzc2VydC5vayhncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXS5tYXRjaGVzKHRlc3RKcykpO1xuXG5cdFx0Ly8gW3Rlc3QuanNdIC0+IC90ZXN0LmpzL1xuXHRcdGdyb3VwLnVucGluKHRlc3RKcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCB0ZXN0SnMpO1xuXHRcdGFzc2VydC5vayhncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXS5tYXRjaGVzKHRlc3RKcykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZCh0ZXN0SnMpLCBmYWxzZSk7XG5cblx0XHQvLyAvdGVzdC5qcy8gLT4gW11cblx0XHRncm91cC5jbG9zZUVkaXRvcih0ZXN0SnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnByZXZpZXdFZGl0b3IsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdTaW5nbGUgR3JvdXAsIFNpbmdsZSBFZGl0b3IgLSBwZXJzaXN0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGluc3QgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cblx0XHRpbnN0LnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdC5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSgpKTtcblx0XHRjb25zdCBsaWZlY3ljbGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpO1xuXHRcdGluc3Quc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgbGlmZWN5Y2xlKTtcblx0XHRpbnN0LnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaCcsIHsgZWRpdG9yOiB7IG9wZW5Qb3NpdGlvbmluZzogJ3JpZ2h0JyB9IH0pO1xuXHRcdGluc3Quc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZyk7XG5cblx0XHRpbnN0Lmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkuc3RhcnQoYWNjZXNzb3IpKTtcblxuXHRcdGxldCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yIS5tYXRjaGVzKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5wcmV2aWV3RWRpdG9yIS5tYXRjaGVzKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0FjdGl2ZShpbnB1dDEpLCB0cnVlKTtcblxuXHRcdC8vIENyZWF0ZSBtb2RlbCBhZ2FpbiAtIHNob3VsZCBsb2FkIGZyb20gc3RvcmFnZVxuXHRcdGdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKGluc3QuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBNb2RlbCwgZ3JvdXAuc2VyaWFsaXplKCkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciEubWF0Y2hlcyhpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAucHJldmlld0VkaXRvciEubWF0Y2hlcyhpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0aW5zdC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcGxlIEdyb3VwcywgTXVsdGlwbGUgZWRpdG9ycyAtIHBlcnNpc3QnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5zdCA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblxuXHRcdGluc3Quc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0LnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxpZmVjeWNsZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdFx0aW5zdC5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBsaWZlY3ljbGUpO1xuXHRcdGluc3Quc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoJywgeyBlZGl0b3I6IHsgb3BlblBvc2l0aW9uaW5nOiAncmlnaHQnIH0gfSk7XG5cdFx0aW5zdC5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnKTtcblxuXHRcdGluc3QuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5zdGFydChhY2Nlc3NvcikpO1xuXG5cdFx0bGV0IGdyb3VwMSA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IGcxX2lucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgZzFfaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBnMV9pbnB1dDMgPSBpbnB1dCgpO1xuXG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoZzFfaW5wdXQxLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwMS5vcGVuRWRpdG9yKGcxX2lucHV0MiwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogZmFsc2UgfSk7XG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoZzFfaW5wdXQzLCB7IGFjdGl2ZTogZmFsc2UsIHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGxldCBncm91cDIgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBnMl9pbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGcyX2lucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgZzJfaW5wdXQzID0gaW5wdXQoKTtcblxuXHRcdGdyb3VwMi5vcGVuRWRpdG9yKGcyX2lucHV0MSwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cDIub3BlbkVkaXRvcihnMl9pbnB1dDIsIHsgYWN0aXZlOiBmYWxzZSwgcGlubmVkOiBmYWxzZSB9KTtcblx0XHRncm91cDIub3BlbkVkaXRvcihnMl9pbnB1dDMsIHsgYWN0aXZlOiBmYWxzZSwgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMi5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5hY3RpdmVFZGl0b3IhLm1hdGNoZXMoZzFfaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMi5hY3RpdmVFZGl0b3IhLm1hdGNoZXMoZzJfaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5wcmV2aWV3RWRpdG9yIS5tYXRjaGVzKGcxX2lucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDIucHJldmlld0VkaXRvciEubWF0Y2hlcyhnMl9pbnB1dDIpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzBdLm1hdGNoZXMoZzFfaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSlbMV0ubWF0Y2hlcyhnMV9pbnB1dDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVsyXS5tYXRjaGVzKGcxX2lucHV0MSksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMi5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSlbMF0ubWF0Y2hlcyhnMl9pbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVsxXS5tYXRjaGVzKGcyX2lucHV0MyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDIuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzJdLm1hdGNoZXMoZzJfaW5wdXQyKSwgdHJ1ZSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWwgYWdhaW4gLSBzaG91bGQgbG9hZCBmcm9tIHN0b3JhZ2Vcblx0XHRncm91cDEgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdC5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCBncm91cDEuc2VyaWFsaXplKCkpKTtcblx0XHRncm91cDIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdC5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCBncm91cDIuc2VyaWFsaXplKCkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuY291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDIuY291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuYWN0aXZlRWRpdG9yIS5tYXRjaGVzKGcxX2lucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDIuYWN0aXZlRWRpdG9yIS5tYXRjaGVzKGcyX2lucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEucHJldmlld0VkaXRvciEubWF0Y2hlcyhnMV9pbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyLnByZXZpZXdFZGl0b3IhLm1hdGNoZXMoZzJfaW5wdXQyKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVswXS5tYXRjaGVzKGcxX2lucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzFdLm1hdGNoZXMoZzFfaW5wdXQzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSlbMl0ubWF0Y2hlcyhnMV9pbnB1dDEpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDIuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzBdLm1hdGNoZXMoZzJfaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMi5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSlbMV0ubWF0Y2hlcyhnMl9pbnB1dDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVsyXS5tYXRjaGVzKGcyX2lucHV0MiksIHRydWUpO1xuXHRcdGluc3QuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdTaW5nbGUgZ3JvdXAsIG11bHRpcGxlIGVkaXRvcnMgLSBwZXJzaXN0IChzb21lIG5vdCBwZXJzaXN0YWJsZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5zdCA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblxuXHRcdGluc3Quc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0LnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxpZmVjeWNsZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdFx0aW5zdC5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBsaWZlY3ljbGUpO1xuXHRcdGluc3Quc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoJywgeyBlZGl0b3I6IHsgb3BlblBvc2l0aW9uaW5nOiAncmlnaHQnIH0gfSk7XG5cdFx0aW5zdC5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnKTtcblxuXHRcdGluc3QuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5zdGFydChhY2Nlc3NvcikpO1xuXG5cdFx0bGV0IGdyb3VwID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3Qgc2VyaWFsaXphYmxlSW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBub25TZXJpYWxpemFibGVJbnB1dDIgPSBpbnB1dCgnMycsIHRydWUpO1xuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZUlucHV0MiA9IGlucHV0KCk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKHNlcmlhbGl6YWJsZUlucHV0MSwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKG5vblNlcmlhbGl6YWJsZUlucHV0MiwgeyBhY3RpdmU6IHRydWUsIHBpbm5lZDogZmFsc2UgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihzZXJpYWxpemFibGVJbnB1dDIsIHsgYWN0aXZlOiBmYWxzZSwgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yIS5tYXRjaGVzKG5vblNlcmlhbGl6YWJsZUlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5wcmV2aWV3RWRpdG9yIS5tYXRjaGVzKG5vblNlcmlhbGl6YWJsZUlucHV0MiksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVswXS5tYXRjaGVzKG5vblNlcmlhbGl6YWJsZUlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSlbMV0ubWF0Y2hlcyhzZXJpYWxpemFibGVJbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzJdLm1hdGNoZXMoc2VyaWFsaXphYmxlSW5wdXQxKSwgdHJ1ZSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWwgYWdhaW4gLSBzaG91bGQgbG9hZCBmcm9tIHN0b3JhZ2Vcblx0XHRncm91cCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0LmNyZWF0ZUluc3RhbmNlKEVkaXRvckdyb3VwTW9kZWwsIGdyb3VwLnNlcmlhbGl6ZSgpKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IhLm1hdGNoZXMoc2VyaWFsaXphYmxlSW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnByZXZpZXdFZGl0b3IsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVswXS5tYXRjaGVzKHNlcmlhbGl6YWJsZUlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSlbMV0ubWF0Y2hlcyhzZXJpYWxpemFibGVJbnB1dDEpLCB0cnVlKTtcblx0XHRpbnN0LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnU2luZ2xlIGdyb3VwLCBtdWx0aXBsZSBlZGl0b3JzIC0gcGVyc2lzdCAoc29tZSBub3QgcGVyc2lzdGFibGUsIHN0aWNreSBlZGl0b3JzKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnN0ID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXG5cdFx0aW5zdC5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3Quc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGlmZWN5Y2xlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKTtcblx0XHRpbnN0LnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGxpZmVjeWNsZSk7XG5cdFx0aW5zdC5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnLCB7IGVkaXRvcjogeyBvcGVuUG9zaXRpb25pbmc6ICdyaWdodCcgfSB9KTtcblx0XHRpbnN0LnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWcpO1xuXG5cdFx0aW5zdC5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnN0YXJ0KGFjY2Vzc29yKSk7XG5cblx0XHRsZXQgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzZXJpYWxpemFibGVJbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IG5vblNlcmlhbGl6YWJsZUlucHV0MiA9IGlucHV0KCczJywgdHJ1ZSk7XG5cdFx0Y29uc3Qgc2VyaWFsaXphYmxlSW5wdXQyID0gaW5wdXQoKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3Ioc2VyaWFsaXphYmxlSW5wdXQxLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3Iobm9uU2VyaWFsaXphYmxlSW5wdXQyLCB7IGFjdGl2ZTogdHJ1ZSwgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihzZXJpYWxpemFibGVJbnB1dDIsIHsgYWN0aXZlOiBmYWxzZSwgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVsIGFnYWluIC0gc2hvdWxkIGxvYWQgZnJvbSBzdG9yYWdlXG5cdFx0Z3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdC5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCBncm91cC5zZXJpYWxpemUoKSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXHRcdGluc3QuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBncm91cHMsIG11bHRpcGxlIGVkaXRvcnMgLSBwZXJzaXN0IChzb21lIG5vdCBwZXJzaXN0YWJsZSwgY2F1c2VzIGVtcHR5IGdyb3VwKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnN0ID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXG5cdFx0aW5zdC5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3Quc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGlmZWN5Y2xlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKTtcblx0XHRpbnN0LnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGxpZmVjeWNsZSk7XG5cdFx0aW5zdC5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnLCB7IGVkaXRvcjogeyBvcGVuUG9zaXRpb25pbmc6ICdyaWdodCcgfSB9KTtcblx0XHRpbnN0LnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWcpO1xuXG5cdFx0aW5zdC5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnN0YXJ0KGFjY2Vzc29yKSk7XG5cblx0XHRsZXQgZ3JvdXAxID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXHRcdGxldCBncm91cDIgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzZXJpYWxpemFibGVJbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZUlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3Qgbm9uU2VyaWFsaXphYmxlSW5wdXQgPSBpbnB1dCgnMicsIHRydWUpO1xuXG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3Ioc2VyaWFsaXphYmxlSW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRncm91cDEub3BlbkVkaXRvcihzZXJpYWxpemFibGVJbnB1dDIpO1xuXG5cdFx0Z3JvdXAyLm9wZW5FZGl0b3Iobm9uU2VyaWFsaXphYmxlSW5wdXQpO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVsIGFnYWluIC0gc2hvdWxkIGxvYWQgZnJvbSBzdG9yYWdlXG5cdFx0Z3JvdXAxID0gZGlzcG9zYWJsZXMuYWRkKGluc3QuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBNb2RlbCwgZ3JvdXAxLnNlcmlhbGl6ZSgpKSk7XG5cdFx0Z3JvdXAyID0gZGlzcG9zYWJsZXMuYWRkKGluc3QuY3JlYXRlSW5zdGFuY2UoRWRpdG9yR3JvdXBNb2RlbCwgZ3JvdXAyLnNlcmlhbGl6ZSgpKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLm1hdGNoZXMoc2VyaWFsaXphYmxlSW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVsxXS5tYXRjaGVzKHNlcmlhbGl6YWJsZUlucHV0MiksIHRydWUpO1xuXHRcdGluc3QuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBFZGl0b3JzIC0gRWRpdG9yIERpc3Bvc2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAxID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXHRcdGNvbnN0IGdyb3VwMiA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IGdyb3VwMUxpc3RlbmVyID0gZ3JvdXBMaXN0ZW5lcihncm91cDEpO1xuXHRcdGNvbnN0IGdyb3VwMkxpc3RlbmVyID0gZ3JvdXBMaXN0ZW5lcihncm91cDIpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cblx0XHRncm91cDEub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwMS5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGdyb3VwMi5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cDIub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cblx0XHRpbnB1dDEuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUxpc3RlbmVyLmRpc3Bvc2VkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUxpc3RlbmVyLmRpc3Bvc2VkWzBdLmVkaXRvckluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyTGlzdGVuZXIuZGlzcG9zZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyTGlzdGVuZXIuZGlzcG9zZWRbMF0uZWRpdG9ySW5kZXgsIDApO1xuXHRcdGFzc2VydC5vayhncm91cDFMaXN0ZW5lci5kaXNwb3NlZFswXS5lZGl0b3IubWF0Y2hlcyhpbnB1dDEpKTtcblx0XHRhc3NlcnQub2soZ3JvdXAyTGlzdGVuZXIuZGlzcG9zZWRbMF0uZWRpdG9yLm1hdGNoZXMoaW5wdXQxKSk7XG5cblx0XHRpbnB1dDMuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFMaXN0ZW5lci5kaXNwb3NlZC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFMaXN0ZW5lci5kaXNwb3NlZFsxXS5lZGl0b3JJbmRleCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkxpc3RlbmVyLmRpc3Bvc2VkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKGdyb3VwMUxpc3RlbmVyLmRpc3Bvc2VkWzFdLmVkaXRvci5tYXRjaGVzKGlucHV0MykpO1xuXHR9KTtcblxuXHR0ZXN0KCdQcmV2aWV3IHRhYiBkb2VzIG5vdCBoYXZlIGEgc3RhYmxlIHBvc2l0aW9uIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODI0NSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAxID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cblx0XHRncm91cDEub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQyLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRncm91cDEuc2V0QWN0aXZlKGlucHV0MSk7XG5cblx0XHRncm91cDEub3BlbkVkaXRvcihpbnB1dDMsIHsgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuaW5kZXhPZihpbnB1dDMpLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgRWRpdG9ycyAtIEVkaXRvciBFbWl0cyBEaXJ0eSBhbmQgTGFiZWwgQ2hhbmdlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBncm91cDEgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Y29uc3QgZ3JvdXAyID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwMi5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGxldCBkaXJ0eTFDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZ3JvdXAxLm9uRGlkTW9kZWxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9ESVJUWSkge1xuXHRcdFx0XHRkaXJ0eTFDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGRpcnR5MkNvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChncm91cDIub25EaWRNb2RlbENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0RJUlRZKSB7XG5cdFx0XHRcdGRpcnR5MkNvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgbGFiZWwxQ2hhbmdlQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGdyb3VwMS5vbkRpZE1vZGVsQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTEFCRUwpIHtcblx0XHRcdFx0bGFiZWwxQ2hhbmdlQ291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBsYWJlbDJDaGFuZ2VDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZ3JvdXAyLm9uRGlkTW9kZWxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9MQUJFTCkge1xuXHRcdFx0XHRsYWJlbDJDaGFuZ2VDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0KDxUZXN0RWRpdG9ySW5wdXQ+aW5wdXQxKS5zZXREaXJ0eSgpO1xuXHRcdCg8VGVzdEVkaXRvcklucHV0PmlucHV0MSkuc2V0TGFiZWwoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eTFDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWwxQ2hhbmdlQ291bnRlciwgMSk7XG5cblx0XHQoPFRlc3RFZGl0b3JJbnB1dD5pbnB1dDIpLnNldERpcnR5KCk7XG5cdFx0KDxUZXN0RWRpdG9ySW5wdXQ+aW5wdXQyKS5zZXRMYWJlbCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5MkNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbDJDaGFuZ2VDb3VudGVyLCAxKTtcblxuXHRcdGNsb3NlQWxsRWRpdG9ycyhncm91cDIpO1xuXG5cdFx0KDxUZXN0RWRpdG9ySW5wdXQ+aW5wdXQyKS5zZXREaXJ0eSgpO1xuXHRcdCg8VGVzdEVkaXRvcklucHV0PmlucHV0Mikuc2V0TGFiZWwoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eTJDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWwyQ2hhbmdlQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5MUNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbDFDaGFuZ2VDb3VudGVyLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5IEVkaXRvcnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiBmYWxzZSwgYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAzKTtcblxuXHRcdC8vIFN0aWNrIGxhc3QgZWRpdG9yIHNob3VsZCBtb3ZlIGl0IGZpcnN0IGFuZCBwaW5cblx0XHRncm91cC5zdGljayhpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUsIHsgZXhjbHVkZVN0aWNreTogZmFsc2UgfSkubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDEpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDIpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDMpLCAwKTtcblxuXHRcdGxldCBzZXF1ZW50aWFsQWxsRWRpdG9ycyA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXF1ZW50aWFsQWxsRWRpdG9ycy5sZW5ndGgsIDMpO1xuXHRcdGxldCBzZXF1ZW50aWFsRWRpdG9yc0V4Y2x1ZGluZ1N0aWNreSA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxdWVudGlhbEVkaXRvcnNFeGNsdWRpbmdTdGlja3kubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2soc2VxdWVudGlhbEVkaXRvcnNFeGNsdWRpbmdTdGlja3kuaW5kZXhPZihpbnB1dDEpID49IDApO1xuXHRcdGFzc2VydC5vayhzZXF1ZW50aWFsRWRpdG9yc0V4Y2x1ZGluZ1N0aWNreS5pbmRleE9mKGlucHV0MikgPj0gMCk7XG5cdFx0bGV0IG1ydUFsbEVkaXRvcnMgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydUFsbEVkaXRvcnMubGVuZ3RoLCAzKTtcblx0XHRsZXQgbXJ1RWRpdG9yc0V4Y2x1ZGluZ1N0aWNreSA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydUVkaXRvcnNFeGNsdWRpbmdTdGlja3kubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2sobXJ1RWRpdG9yc0V4Y2x1ZGluZ1N0aWNreS5pbmRleE9mKGlucHV0MSkgPj0gMCk7XG5cdFx0YXNzZXJ0Lm9rKG1ydUVkaXRvcnNFeGNsdWRpbmdTdGlja3kuaW5kZXhPZihpbnB1dDIpID49IDApO1xuXG5cdFx0Ly8gU3RpY2tpbmcgc2FtZSBlZGl0b3IgYWdhaW4gaXMgYSBuby1vcFxuXHRcdGdyb3VwLnN0aWNrKGlucHV0Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MyksIHRydWUpO1xuXG5cdFx0Ly8gU3RpY2tpbmcgbGFzdCBlZGl0b3Igbm93IHNob3VsZCBtb3ZlIGl0IGFmdGVyIHN0aWNreSBvbmVcblx0XHRncm91cC5zdGljayhpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MSksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MiksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MyksIDApO1xuXG5cdFx0c2VxdWVudGlhbEFsbEVkaXRvcnMgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxdWVudGlhbEFsbEVkaXRvcnMubGVuZ3RoLCAzKTtcblx0XHRzZXF1ZW50aWFsRWRpdG9yc0V4Y2x1ZGluZ1N0aWNreSA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxdWVudGlhbEVkaXRvcnNFeGNsdWRpbmdTdGlja3kubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2soc2VxdWVudGlhbEVkaXRvcnNFeGNsdWRpbmdTdGlja3kuaW5kZXhPZihpbnB1dDEpID49IDApO1xuXHRcdG1ydUFsbEVkaXRvcnMgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydUFsbEVkaXRvcnMubGVuZ3RoLCAzKTtcblx0XHRtcnVFZGl0b3JzRXhjbHVkaW5nU3RpY2t5ID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1RWRpdG9yc0V4Y2x1ZGluZ1N0aWNreS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayhtcnVFZGl0b3JzRXhjbHVkaW5nU3RpY2t5LmluZGV4T2YoaW5wdXQxKSA+PSAwKTtcblxuXHRcdC8vIFN0aWNraW5nIHJlbWFpbmluZyBlZGl0b3IgYWxzbyB3b3Jrc1xuXHRcdGdyb3VwLnN0aWNrKGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDEpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDMpLCAwKTtcblxuXHRcdHNlcXVlbnRpYWxBbGxFZGl0b3JzID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcXVlbnRpYWxBbGxFZGl0b3JzLmxlbmd0aCwgMyk7XG5cdFx0c2VxdWVudGlhbEVkaXRvcnNFeGNsdWRpbmdTdGlja3kgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcXVlbnRpYWxFZGl0b3JzRXhjbHVkaW5nU3RpY2t5Lmxlbmd0aCwgMCk7XG5cdFx0bXJ1QWxsRWRpdG9ycyA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1QWxsRWRpdG9ycy5sZW5ndGgsIDMpO1xuXHRcdG1ydUVkaXRvcnNFeGNsdWRpbmdTdGlja3kgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVFZGl0b3JzRXhjbHVkaW5nU3RpY2t5Lmxlbmd0aCwgMCk7XG5cblx0XHQvLyBVbnN0aWNraW5nIG1vdmVzIGVkaXRvciBhZnRlciBzdGlja3kgb25lc1xuXHRcdGdyb3VwLnVuc3RpY2soaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDEpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDIpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDMpLCAyKTtcblxuXHRcdC8vIFVuc3RpY2tpbmcgYWxsIHdvcmtzXG5cdFx0Z3JvdXAudW5zdGljayhpbnB1dDEpO1xuXHRcdGdyb3VwLnVuc3RpY2soaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQzKSwgZmFsc2UpO1xuXG5cdFx0Z3JvdXAubW92ZUVkaXRvcihpbnB1dDEsIDApO1xuXHRcdGdyb3VwLm1vdmVFZGl0b3IoaW5wdXQyLCAxKTtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MywgMik7XG5cblx0XHQvLyBPcGVuaW5nIGEgbmV3IGVkaXRvciBhbHdheXMgb3BlbnMgYWZ0ZXIgc3RpY2t5IGVkaXRvcnNcblx0XHRncm91cC5zdGljayhpbnB1dDEpO1xuXHRcdGdyb3VwLnN0aWNrKGlucHV0Mik7XG5cdFx0Z3JvdXAuc2V0QWN0aXZlKGlucHV0MSk7XG5cblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0NCksIDIpO1xuXHRcdGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0NCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmNsb3NlZFswXS5zdGlja3ksIGZhbHNlKTtcblxuXHRcdGdyb3VwLnNldEFjdGl2ZShpbnB1dDIpO1xuXG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDQsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQ0KSwgMik7XG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQ0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMuY2xvc2VkWzFdLnN0aWNreSwgZmFsc2UpO1xuXG5cdFx0Ly8gUmVzZXRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDEpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDMpLCAyKTtcblxuXHRcdC8vIE1vdmluZyBhIHN0aWNreSBlZGl0b3Igd29ya3Ncblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MSwgMSk7IC8vIHN0aWxsIG1vdmVkIHdpdGhpbiBzdGlja3kgcmFuZ2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQxKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQyKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQzKSwgMik7XG5cblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MSwgMCk7IC8vIHN0aWxsIG1vdmVkIHdpdGhpbiBzdGlja3kgcmFuZ2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQxKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQyKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQzKSwgMik7XG5cblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MSwgMik7IC8vIG1vdmVkIG91dCBvZiBzdGlja3kgcmFuZ2UvL1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQxKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQyKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQzKSwgMSk7XG5cblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MiwgMik7IC8vIG1vdmVkIG91dCBvZiBzdGlja3kgcmFuZ2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDEpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDIpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDMpLCAwKTtcblxuXHRcdC8vIFJlc2V0XG5cdFx0Z3JvdXAubW92ZUVkaXRvcihpbnB1dDEsIDApO1xuXHRcdGdyb3VwLm1vdmVFZGl0b3IoaW5wdXQyLCAxKTtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MywgMik7XG5cdFx0Z3JvdXAuc3RpY2soaW5wdXQxKTtcblx0XHRncm91cC51bnN0aWNrKGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQzKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MiksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pbmRleE9mKGlucHV0MyksIDIpO1xuXG5cdFx0Ly8gTW92aW5nIGEgdW5zdGlja3kgZWRpdG9yIGluIHdvcmtzXG5cdFx0Z3JvdXAubW92ZUVkaXRvcihpbnB1dDMsIDEpOyAvLyBzdGlsbCBtb3ZlZCB3aXRoaW4gdW5zdGlja2VkIHJhbmdlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDEpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDIpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDMpLCAxKTtcblxuXHRcdGdyb3VwLm1vdmVFZGl0b3IoaW5wdXQzLCAyKTsgLy8gc3RpbGwgbW92ZWQgd2l0aGluIHVuc3RpY2tlZCByYW5nZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQxKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQyKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQzKSwgMik7XG5cblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MywgMCk7IC8vIG1vdmVkIGludG8gc3RpY2t5IHJhbmdlLy9cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQxKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQyKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQzKSwgMCk7XG5cblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0MiwgMCk7IC8vIG1vdmVkIGludG8gc3RpY2t5IHJhbmdlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQxKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQyKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmluZGV4T2YoaW5wdXQzKSwgMSk7XG5cblx0XHQvLyBDbG9zaW5nIGEgc3RpY2t5IGVkaXRvciB1cGRhdGVzIHN0YXRlIHByb3Blcmx5XG5cdFx0Z3JvdXAuc3RpY2soaW5wdXQxKTtcblx0XHRncm91cC5zdGljayhpbnB1dDIpO1xuXHRcdGdyb3VwLnVuc3RpY2soaW5wdXQzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDIpO1xuXHRcdGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5jbG9zZWRbMl0uc3RpY2t5LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5jbG9zZWRbM10uc3RpY2t5LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXG5cdFx0Y2xvc2VBbGxFZGl0b3JzKGdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXG5cdFx0Ly8gT3BlbiBzdGlja3lcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBzdGlja3k6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQxKSwgdHJ1ZSk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQyKSwgZmFsc2UpO1xuXG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgc3RpY2t5OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDIpLCB0cnVlKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IHBpbm5lZDogZmFsc2UsIGFjdGl2ZTogdHJ1ZSwgc3RpY2t5OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQzKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXQ0KSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDEpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDMpLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaW5kZXhPZihpbnB1dDQpLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5L1Vuc3RpY2t5IEVkaXRvcnMgc2VuZHMgY29ycmVjdCBlZGl0b3IgaW5kZXgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogZmFsc2UsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMCk7XG5cblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGdyb3VwLnN0aWNrKGlucHV0Myk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLnN0aWNreVswXS5lZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMSk7XG5cblx0XHRncm91cC5zdGljayhpbnB1dDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5zdGlja3lbMV0uZWRpdG9ySW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDIpO1xuXG5cdFx0Z3JvdXAudW5zdGljayhpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMudW5zdGlja3lbMF0uZWRpdG9ySW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dDMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkTW92ZUVkaXRvciBFdmVudCcsICgpID0+IHtcblx0XHRjb25zdCBncm91cDEgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Y29uc3QgZ3JvdXAyID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxZ3JvdXAxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDJncm91cDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MWdyb3VwMiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyZ3JvdXAyID0gaW5wdXQoKTtcblxuXHRcdC8vIE9wZW4gYWxsIHRoZSBlZGl0b3JzXG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQxZ3JvdXAxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCBpbmRleDogMCB9KTtcblx0XHRncm91cDEub3BlbkVkaXRvcihpbnB1dDJncm91cDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IGZhbHNlLCBpbmRleDogMSB9KTtcblx0XHRncm91cDIub3BlbkVkaXRvcihpbnB1dDFncm91cDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAwIH0pO1xuXHRcdGdyb3VwMi5vcGVuRWRpdG9yKGlucHV0Mmdyb3VwMiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogZmFsc2UsIGluZGV4OiAxIH0pO1xuXG5cdFx0Y29uc3QgZ3JvdXAxRXZlbnRzID0gZ3JvdXBMaXN0ZW5lcihncm91cDEpO1xuXHRcdGNvbnN0IGdyb3VwMkV2ZW50cyA9IGdyb3VwTGlzdGVuZXIoZ3JvdXAyKTtcblxuXHRcdGdyb3VwMS5tb3ZlRWRpdG9yKGlucHV0MWdyb3VwMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUV2ZW50cy5tb3ZlZFswXS5lZGl0b3IsIGlucHV0MWdyb3VwMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUV2ZW50cy5tb3ZlZFswXS5vbGRFZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUV2ZW50cy5tb3ZlZFswXS5lZGl0b3JJbmRleCwgMSk7XG5cblx0XHRncm91cDIubW92ZUVkaXRvcihpbnB1dDFncm91cDIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDJFdmVudHMubW92ZWRbMF0uZWRpdG9yLCBpbnB1dDFncm91cDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDJFdmVudHMubW92ZWRbMF0ub2xkRWRpdG9ySW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDJFdmVudHMubW92ZWRbMF0uZWRpdG9ySW5kZXgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZE9wZW5lZGl0b3IgRXZlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3JvdXAxID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXHRcdGNvbnN0IGdyb3VwMiA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IGdyb3VwMUV2ZW50cyA9IGdyb3VwTGlzdGVuZXIoZ3JvdXAxKTtcblx0XHRjb25zdCBncm91cDJFdmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwMik7XG5cblx0XHRjb25zdCBpbnB1dDFncm91cDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0Mmdyb3VwMSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQxZ3JvdXAyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDJncm91cDIgPSBpbnB1dCgpO1xuXG5cdFx0Ly8gT3BlbiBhbGwgdGhlIGVkaXRvcnNcblx0XHRncm91cDEub3BlbkVkaXRvcihpbnB1dDFncm91cDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAwIH0pO1xuXHRcdGdyb3VwMS5vcGVuRWRpdG9yKGlucHV0Mmdyb3VwMSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogZmFsc2UsIGluZGV4OiAxIH0pO1xuXHRcdGdyb3VwMi5vcGVuRWRpdG9yKGlucHV0MWdyb3VwMiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgaW5kZXg6IDAgfSk7XG5cdFx0Z3JvdXAyLm9wZW5FZGl0b3IoaW5wdXQyZ3JvdXAyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiBmYWxzZSwgaW5kZXg6IDEgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxRXZlbnRzLm9wZW5lZC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFFdmVudHMub3BlbmVkWzBdLmVkaXRvciwgaW5wdXQxZ3JvdXAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxRXZlbnRzLm9wZW5lZFswXS5lZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUV2ZW50cy5vcGVuZWRbMV0uZWRpdG9yLCBpbnB1dDJncm91cDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFFdmVudHMub3BlbmVkWzFdLmVkaXRvckluZGV4LCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDJFdmVudHMub3BlbmVkLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkV2ZW50cy5vcGVuZWRbMF0uZWRpdG9yLCBpbnB1dDFncm91cDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDJFdmVudHMub3BlbmVkWzBdLmVkaXRvckluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyRXZlbnRzLm9wZW5lZFsxXS5lZGl0b3IsIGlucHV0Mmdyb3VwMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkV2ZW50cy5vcGVuZWRbMV0uZWRpdG9ySW5kZXgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZpbmcgZWRpdG9yIHNlbmRzIHN0aWNreSBldmVudCB3aGVuIHN0aWNreSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGdyb3VwMSA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IGlucHV0MWdyb3VwMSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyZ3JvdXAxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDNncm91cDEgPSBpbnB1dCgpO1xuXG5cdFx0Ly8gT3BlbiBhbGwgdGhlIGVkaXRvcnNcblx0XHRncm91cDEub3BlbkVkaXRvcihpbnB1dDFncm91cDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAwLCBzdGlja3k6IHRydWUgfSk7XG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQyZ3JvdXAxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiBmYWxzZSwgaW5kZXg6IDEgfSk7XG5cdFx0Z3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQzZ3JvdXAxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiBmYWxzZSwgaW5kZXg6IDIgfSk7XG5cblx0XHRjb25zdCBncm91cDFFdmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwMSk7XG5cblx0XHRncm91cDEubW92ZUVkaXRvcihpbnB1dDJncm91cDEsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFFdmVudHMuc3RpY2t5WzBdLmVkaXRvciwgaW5wdXQyZ3JvdXAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxRXZlbnRzLnN0aWNreVswXS5lZGl0b3JJbmRleCwgMCk7XG5cblx0XHRjb25zdCBncm91cDIgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBpbnB1dDFncm91cDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0Mmdyb3VwMiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzZ3JvdXAyID0gaW5wdXQoKTtcblxuXHRcdC8vIE9wZW4gYWxsIHRoZSBlZGl0b3JzXG5cdFx0Z3JvdXAyLm9wZW5FZGl0b3IoaW5wdXQxZ3JvdXAyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCBpbmRleDogMCwgc3RpY2t5OiB0cnVlIH0pO1xuXHRcdGdyb3VwMi5vcGVuRWRpdG9yKGlucHV0Mmdyb3VwMiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogZmFsc2UsIGluZGV4OiAxIH0pO1xuXHRcdGdyb3VwMi5vcGVuRWRpdG9yKGlucHV0M2dyb3VwMiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogZmFsc2UsIGluZGV4OiAyIH0pO1xuXG5cdFx0Y29uc3QgZ3JvdXAyRXZlbnRzID0gZ3JvdXBMaXN0ZW5lcihncm91cDIpO1xuXG5cdFx0Z3JvdXAyLm1vdmVFZGl0b3IoaW5wdXQxZ3JvdXAyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyRXZlbnRzLnVuc3RpY2t5WzBdLmVkaXRvciwgaW5wdXQxZ3JvdXAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyRXZlbnRzLnVuc3RpY2t5WzBdLmVkaXRvckluZGV4LCAxKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0U2VsZWN0aW9uKGdyb3VwOiBFZGl0b3JHcm91cE1vZGVsLCBhY3RpdmVFZGl0b3I6IEVkaXRvcklucHV0LCBzZWxlY3RlZEVkaXRvcnM6IEVkaXRvcklucHV0W10pOiB2b2lkIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBhY3RpdmVFZGl0b3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zZWxlY3RlZEVkaXRvcnMubGVuZ3RoLCBzZWxlY3RlZEVkaXRvcnMubGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlbGVjdGVkRWRpdG9ycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnNlbGVjdGVkRWRpdG9yc1tpXSwgc2VsZWN0ZWRFZGl0b3JzW2ldKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdlZGl0b3Igc2VsZWN0aW9uOiBzZWxlY3RlZEVkaXRvcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBncm91cC5hY3RpdmVFZGl0b3I7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRFZGl0b3JzID0gZ3JvdXAuc2VsZWN0ZWRFZGl0b3JzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVFZGl0b3IsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWxlY3RlZEVkaXRvcnMubGVuZ3RoLCAwKTtcblxuXHRcdC8vIGFjdGl2ZSBlZGl0b3I6IGlucHV0MSwgc2VsZWN0aW9uOiBbaW5wdXQxXVxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAwIH0pO1xuXHRcdGFzc2VydFNlbGVjdGlvbihncm91cCwgaW5wdXQxLCBbaW5wdXQxXSk7XG5cblx0XHQvLyBhY3RpdmUgZWRpdG9yOiBpbnB1dDMsIHNlbGVjdGlvbjogW2lucHV0M11cblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAxIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCBpbmRleDogMiB9KTtcblx0XHRhc3NlcnRTZWxlY3Rpb24oZ3JvdXAsIGlucHV0MywgW2lucHV0M10pO1xuXG5cdFx0Ly8gYWN0aXZlIGVkaXRvcjogaW5wdXQyLCBzZWxlY3Rpb246IFtpbnB1dDEsIGlucHV0Ml0gKGluIHNlcXVlbnRpYWwgb3JkZXIpXG5cdFx0Z3JvdXAuc2V0U2VsZWN0aW9uKGlucHV0MiwgW2lucHV0MV0pO1xuXHRcdGFzc2VydFNlbGVjdGlvbihncm91cCwgaW5wdXQyLCBbaW5wdXQxLCBpbnB1dDJdKTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdG9yIHNlbGVjdGlvbjogb3BlbkVkaXRvciB3aXRoIGluYWN0aXZlIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdC8vIGFjdGl2ZSBlZGl0b3I6IGlucHV0Mywgc2VsZWN0aW9uOiBbaW5wdXQzXVxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgpO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCBpbmRleDogMCB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgaW5kZXg6IDEgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAyIH0pO1xuXG5cdFx0Ly8gYWN0aXZlIGVkaXRvcjogaW5wdXQyLCBzZWxlY3Rpb246IFtpbnB1dDEsIGlucHV0MiwgaW5wdXQzXSAoaW4gc2VxdWVudGlhbCBvcmRlcilcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBhY3RpdmU6IHRydWUsIGluYWN0aXZlU2VsZWN0aW9uOiBbaW5wdXQzLCBpbnB1dDFdIH0pO1xuXHRcdGFzc2VydFNlbGVjdGlvbihncm91cCwgaW5wdXQyLCBbaW5wdXQxLCBpbnB1dDIsIGlucHV0M10pO1xuXG5cdFx0Ly8gYWN0aXZlIGVkaXRvcjogaW5wdXQxLCBzZWxlY3Rpb246IFtpbnB1dDEsIGlucHV0M10gKGluIHNlcXVlbnRpYWwgb3JkZXIpXG5cdFx0Ly8gdGVzdCBkdXBsaWNhdGUgZW50cmllc1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IGFjdGl2ZTogdHJ1ZSwgaW5hY3RpdmVTZWxlY3Rpb246IFtpbnB1dDMsIGlucHV0MSwgaW5wdXQzXSB9KTtcblx0XHRhc3NlcnRTZWxlY3Rpb24oZ3JvdXAsIGlucHV0MSwgW2lucHV0MSwgaW5wdXQzXSk7XG5cblx0XHQvLyBhY3RpdmUgZWRpdG9yOiBpbnB1dDEsIHNlbGVjdGlvbjogW2lucHV0MSwgaW5wdXQyXSAoaW4gc2VxdWVudGlhbCBvcmRlcilcblx0XHQvLyBvcGVuIG5ldyBFZGl0b3IgYXMgaW5hY3RpdmUgd2l0aCBzZWxlY3Rpb25cblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiBmYWxzZSwgaW5hY3RpdmVTZWxlY3Rpb246IFtpbnB1dDJdLCBpbmRleDogMyB9KTtcblx0XHRhc3NlcnRTZWxlY3Rpb24oZ3JvdXAsIGlucHV0MSwgW2lucHV0MSwgaW5wdXQyXSk7XG5cblx0XHQvLyBhY3RpdmUgZWRpdG9yOiBpbnB1dDUsIHNlbGVjdGlvbjogW2lucHV0NCwgaW5wdXQ1XSAoaW4gc2VxdWVudGlhbCBvcmRlcilcblx0XHQvLyBvcGVuIG5ldyBFZGl0b3IgYXMgYWN0aXZlIHdpdGggc2VsZWN0aW9uXG5cdFx0Y29uc3QgaW5wdXQ1ID0gaW5wdXQoKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0NSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgaW5hY3RpdmVTZWxlY3Rpb246IFtpbnB1dDRdLCBpbmRleDogNCB9KTtcblx0XHRhc3NlcnRTZWxlY3Rpb24oZ3JvdXAsIGlucHV0NSwgW2lucHV0NCwgaW5wdXQ1XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBzZWxlY3Rpb246IGNsb3NlRWRpdG9yIGtlZXBzIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdC8vIGFjdGl2ZSBlZGl0b3I6IGlucHV0Mywgc2VsZWN0aW9uOiBbaW5wdXQzXVxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgpO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCBpbmRleDogMCB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgaW5kZXg6IDEgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAyIH0pO1xuXG5cdFx0Z3JvdXAuc2V0U2VsZWN0aW9uKGlucHV0MiwgW2lucHV0MywgaW5wdXQxXSk7XG5cdFx0Z3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQzKTtcblx0XHRhc3NlcnRTZWxlY3Rpb24oZ3JvdXAsIGlucHV0MiwgW2lucHV0MSwgaW5wdXQyXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBzZWxlY3Rpb246IHNldFNlbGV0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGdyb3VwID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Ly8gYWN0aXZlIGVkaXRvcjogaW5wdXQzLCBzZWxlY3Rpb246IFtpbnB1dDNdXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAwIH0pO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCBpbmRleDogMSB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgaW5kZXg6IDIgfSk7XG5cblx0XHQvLyBhY3RpdmUgZWRpdG9yOiBpbnB1dDIsIHNlbGVjdGlvbjogW2lucHV0MSwgaW5wdXQyLCBpbnB1dDNdIChpbiBzZXF1ZW50aWFsIG9yZGVyKVxuXHRcdGdyb3VwLnNldFNlbGVjdGlvbihpbnB1dDIsIFtpbnB1dDMsIGlucHV0MV0pO1xuXHRcdGFzc2VydFNlbGVjdGlvbihncm91cCwgaW5wdXQyLCBbaW5wdXQxLCBpbnB1dDIsIGlucHV0M10pO1xuXG5cdFx0Ly8gYWN0aXZlIGVkaXRvcjogaW5wdXQzLCBzZWxlY3Rpb246IFtpbnB1dDNdXG5cdFx0Z3JvdXAuc2V0U2VsZWN0aW9uKGlucHV0MywgW10pO1xuXHRcdGFzc2VydFNlbGVjdGlvbihncm91cCwgaW5wdXQzLCBbaW5wdXQzXSk7XG5cblx0XHQvLyBhY3RpdmUgZWRpdG9yOiBpbnB1dDIsIHNlbGVjdGlvbjogW2lucHV0MSwgaW5wdXQyXVxuXHRcdC8vIHRlc3QgZHVwbGljYXRlIGVudHJpZXNcblx0XHRncm91cC5zZXRTZWxlY3Rpb24oaW5wdXQyLCBbaW5wdXQxLCBpbnB1dDIsIGlucHV0MV0pO1xuXHRcdGFzc2VydFNlbGVjdGlvbihncm91cCwgaW5wdXQyLCBbaW5wdXQxLCBpbnB1dDJdKTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdG9yIHNlbGVjdGlvbjogaXNTZWxlY3RlZCcsICgpID0+IHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdC8vIGFjdGl2ZSBlZGl0b3I6IGlucHV0Mywgc2VsZWN0aW9uOiBbaW5wdXQzXVxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgpO1xuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCBpbmRleDogMCB9KTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgaW5kZXg6IDEgfSk7XG5cdFx0Z3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIGluZGV4OiAyIH0pO1xuXG5cdFx0Ly8gYWN0aXZlIGVkaXRvcjogaW5wdXQyLCBzZWxlY3Rpb246IFtpbnB1dDEsIGlucHV0MiwgaW5wdXQzXSAoaW4gc2VxdWVudGlhbCBvcmRlcilcblx0XHRncm91cC5zZXRTZWxlY3Rpb24oaW5wdXQyLCBbaW5wdXQzLCBpbnB1dDFdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MyksIHRydWUpO1xuXG5cdFx0Ly8gYWN0aXZlIGVkaXRvcjogaW5wdXQzLCBzZWxlY3Rpb246IFtpbnB1dDNdXG5cdFx0Z3JvdXAuc2V0U2VsZWN0aW9uKGlucHV0MywgW10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDMpLCB0cnVlKTtcblxuXHRcdC8vIHVzZSBpbmRleFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKDApLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoMSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZCgyKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBzZWxlY3Rpb246IHNlbGVjdCBpbnZhbGlkIGVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgaW5kZXg6IDAgfSk7XG5cblx0XHRncm91cC5zZXRTZWxlY3Rpb24oaW5wdXQyLCBbaW5wdXQxXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zZWxlY3RlZEVkaXRvcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDIpLCBmYWxzZSk7XG5cblx0XHRncm91cC5zZXRTZWxlY3Rpb24oaW5wdXQxLCBbaW5wdXQyXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zZWxlY3RlZEVkaXRvcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDIpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciB0cmFuc2llbnQ6IGJhc2ljcycsICgpID0+IHtcblx0XHRjb25zdCBncm91cCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblx0XHRjb25zdCBldmVudHMgPSBncm91cExpc3RlbmVyKGdyb3VwKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1RyYW5zaWVudChpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy50cmFuc2llbnQubGVuZ3RoLCAwKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlLCB0cmFuc2llbnQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy50cmFuc2llbnRbMF0uZWRpdG9yLCBpbnB1dDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzVHJhbnNpZW50KGlucHV0MiksIHRydWUpO1xuXG5cdFx0Z3JvdXAuc2V0VHJhbnNpZW50KGlucHV0MSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzVHJhbnNpZW50KGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMudHJhbnNpZW50WzFdLmVkaXRvciwgaW5wdXQxKTtcblxuXHRcdGdyb3VwLnNldFRyYW5zaWVudChpbnB1dDIsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNUcmFuc2llbnQoaW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMudHJhbnNpZW50WzJdLmVkaXRvciwgaW5wdXQyKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUE4SSwwQkFBMEIseUJBQXlCLHdCQUF3Qiw4QkFBOEI7QUFDaFEsU0FBUyxrQkFBK0UsZ0JBQWdCLGNBQXdFLGtCQUFrQixvQkFBb0IsNEJBQTRCO0FBQ2xQLFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQixxQ0FBcUM7QUFDcEUsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBOEIsb0JBQW9CO0FBQzNELFNBQVMsb0JBQW9CLDBCQUEwQjtBQUN2RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxvQkFBb0IsTUFBTTtBQUUvQixNQUFJO0FBRUosZ0JBQWMsTUFBTTtBQUNuQixxQkFBaUIsUUFBUTtBQUN6QixzQkFBa0I7QUFBQSxFQUNuQixDQUFDO0FBRUQsV0FBUyxPQUE4QjtBQUN0QyxRQUFJLENBQUMsaUJBQWlCO0FBQ3JCLHdCQUFrQixJQUFJLHlCQUF5QjtBQUFBLElBQ2hEO0FBQ0EsVUFBTUEsUUFBTztB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
