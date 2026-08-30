import assert from "assert";
import { EditorGroupModel } from "../../../../common/editor/editorGroupModel.js";
import { EditorExtensions, EditorsOrder, GroupModelChangeKind } from "../../../../common/editor.js";
import { TestLifecycleService } from "../../workbenchTestServices.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { TestContextService, TestStorageService } from "../../../common/workbenchTestServices.js";
import { EditorInput } from "../../../../common/editor/editorInput.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from "../../../../common/editor/filteredEditorGroupModel.js";
suite("FilteredEditorGroupModel", () => {
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
  function closeAllEditors(group) {
    for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL)) {
      group.closeEditor(editor, void 0, false);
    }
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
  test("Sticky/Unsticky count", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.count, 2);
    assert.strictEqual(unstickyFilteredEditorGroup.count, 0);
    model.unstick(input1);
    assert.strictEqual(stickyFilteredEditorGroup.count, 1);
    assert.strictEqual(unstickyFilteredEditorGroup.count, 1);
    model.unstick(input2);
    assert.strictEqual(stickyFilteredEditorGroup.count, 0);
    assert.strictEqual(unstickyFilteredEditorGroup.count, 2);
  });
  test("Sticky/Unsticky stickyCount", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 2);
    assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);
    model.unstick(input1);
    assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 1);
    assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);
    model.unstick(input2);
    assert.strictEqual(stickyFilteredEditorGroup.stickyCount, 0);
    assert.strictEqual(unstickyFilteredEditorGroup.stickyCount, 0);
  });
  test("Sticky/Unsticky isEmpty", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: false });
    model.openEditor(input2, { pinned: true, sticky: false });
    assert.strictEqual(stickyFilteredEditorGroup.count === 0, true);
    assert.strictEqual(unstickyFilteredEditorGroup.count === 0, false);
    model.stick(input1);
    assert.strictEqual(stickyFilteredEditorGroup.count === 0, false);
    assert.strictEqual(unstickyFilteredEditorGroup.count === 0, false);
    model.stick(input2);
    assert.strictEqual(stickyFilteredEditorGroup.count === 0, false);
    assert.strictEqual(unstickyFilteredEditorGroup.count === 0, true);
  });
  test("Sticky/Unsticky editors", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    model.unstick(input1);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 1);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 1);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input2);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
    model.unstick(input2);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
  });
  test("Sticky/Unsticky activeEditor", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true, active: true });
    assert.strictEqual(stickyFilteredEditorGroup.activeEditor, input1);
    assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, null);
    model.openEditor(input2, { pinned: true, sticky: false, active: true });
    assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
    assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, input2);
    model.closeEditor(input1);
    assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
    assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, input2);
    model.closeEditor(input2);
    assert.strictEqual(stickyFilteredEditorGroup.activeEditor, null);
    assert.strictEqual(unstickyFilteredEditorGroup.activeEditor, null);
  });
  test("Sticky/Unsticky previewEditor", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1);
    assert.strictEqual(stickyFilteredEditorGroup.previewEditor, null);
    assert.strictEqual(unstickyFilteredEditorGroup.previewEditor, input1);
    model.openEditor(input2, { sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.previewEditor, null);
    assert.strictEqual(unstickyFilteredEditorGroup.previewEditor, input1);
  });
  test("Sticky/Unsticky isSticky()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.isSticky(input1), true);
    assert.strictEqual(stickyFilteredEditorGroup.isSticky(input2), true);
    model.unstick(input1);
    model.closeEditor(input1);
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(unstickyFilteredEditorGroup.isSticky(input1), false);
    assert.strictEqual(unstickyFilteredEditorGroup.isSticky(input2), false);
  });
  test("Sticky/Unsticky isPinned()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    const input3 = input();
    const input4 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    model.openEditor(input2, { pinned: true, sticky: false });
    model.openEditor(input3, { pinned: false, sticky: true });
    model.openEditor(input4, { pinned: false, sticky: false });
    assert.strictEqual(stickyFilteredEditorGroup.isPinned(input1), true);
    assert.strictEqual(unstickyFilteredEditorGroup.isPinned(input2), true);
    assert.strictEqual(stickyFilteredEditorGroup.isPinned(input3), true);
    assert.strictEqual(unstickyFilteredEditorGroup.isPinned(input4), false);
  });
  test("Sticky/Unsticky isActive()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true, active: true });
    assert.strictEqual(stickyFilteredEditorGroup.isActive(input1), true);
    model.openEditor(input2, { pinned: true, sticky: false, active: true });
    assert.strictEqual(stickyFilteredEditorGroup.isActive(input1), false);
    assert.strictEqual(unstickyFilteredEditorGroup.isActive(input2), true);
    model.unstick(input1);
    assert.strictEqual(unstickyFilteredEditorGroup.isActive(input1), false);
    assert.strictEqual(unstickyFilteredEditorGroup.isActive(input2), true);
  });
  test("Sticky/Unsticky getEditors()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true, active: true });
    model.openEditor(input2, { pinned: true, sticky: true, active: true });
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 0);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: false }).length, 2);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 0);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: false }).length, 0);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input2);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1], input1);
    model.unstick(input1);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 1);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 1);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input2);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input1);
    model.unstick(input2);
    assert.strictEqual(stickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0], input2);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1], input1);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[0], input2);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditors(EditorsOrder.SEQUENTIAL)[1], input1);
  });
  test("Sticky/Unsticky getEditorByIndex()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    const input3 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input1);
    assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), input2);
    assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(2), void 0);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), void 0);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), void 0);
    model.openEditor(input3, { pinned: true, sticky: false });
    assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input1);
    assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), input2);
    assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(2), void 0);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), input3);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), void 0);
    model.unstick(input1);
    assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(0), input2);
    assert.strictEqual(stickyFilteredEditorGroup.getEditorByIndex(1), void 0);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(0), input1);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(1), input3);
    assert.strictEqual(unstickyFilteredEditorGroup.getEditorByIndex(2), void 0);
  });
  test("Sticky/Unsticky indexOf()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    const input3 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), 0);
    assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 1);
    assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), -1);
    assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);
    model.openEditor(input3, { pinned: true, sticky: false });
    assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), 0);
    assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 1);
    assert.strictEqual(stickyFilteredEditorGroup.indexOf(input3), -1);
    assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), -1);
    assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);
    assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input3), 0);
    model.unstick(input1);
    assert.strictEqual(stickyFilteredEditorGroup.indexOf(input1), -1);
    assert.strictEqual(stickyFilteredEditorGroup.indexOf(input2), 0);
    assert.strictEqual(stickyFilteredEditorGroup.indexOf(input3), -1);
    assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input1), 0);
    assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input2), -1);
    assert.strictEqual(unstickyFilteredEditorGroup.indexOf(input3), 1);
  });
  test("Sticky/Unsticky isFirst()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.isFirst(input1), true);
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.isFirst(input1), true);
    assert.strictEqual(stickyFilteredEditorGroup.isFirst(input2), false);
    model.unstick(input1);
    assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), true);
    assert.strictEqual(stickyFilteredEditorGroup.isFirst(input2), true);
    model.unstick(input2);
    assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), false);
    assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input2), true);
    model.moveEditor(input2, 1);
    assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input1), true);
    assert.strictEqual(unstickyFilteredEditorGroup.isFirst(input2), false);
  });
  test("Sticky/Unsticky isLast()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.isLast(input1), true);
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.isLast(input1), false);
    assert.strictEqual(stickyFilteredEditorGroup.isLast(input2), true);
    model.unstick(input1);
    assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), true);
    assert.strictEqual(stickyFilteredEditorGroup.isLast(input2), true);
    model.unstick(input2);
    assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), true);
    assert.strictEqual(unstickyFilteredEditorGroup.isLast(input2), false);
    model.moveEditor(input2, 1);
    assert.strictEqual(unstickyFilteredEditorGroup.isLast(input1), false);
    assert.strictEqual(unstickyFilteredEditorGroup.isLast(input2), true);
  });
  test("Sticky/Unsticky contains()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    model.openEditor(input1, { pinned: true, sticky: true });
    model.openEditor(input2, { pinned: true, sticky: true });
    assert.strictEqual(stickyFilteredEditorGroup.contains(input1), true);
    assert.strictEqual(stickyFilteredEditorGroup.contains(input2), true);
    assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), false);
    assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), false);
    model.unstick(input1);
    assert.strictEqual(stickyFilteredEditorGroup.contains(input1), false);
    assert.strictEqual(stickyFilteredEditorGroup.contains(input2), true);
    assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), true);
    assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), false);
    model.unstick(input2);
    assert.strictEqual(stickyFilteredEditorGroup.contains(input1), false);
    assert.strictEqual(stickyFilteredEditorGroup.contains(input2), false);
    assert.strictEqual(unstickyFilteredEditorGroup.contains(input1), true);
    assert.strictEqual(unstickyFilteredEditorGroup.contains(input2), true);
  });
  test("Sticky/Unsticky group information", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    assert.strictEqual(stickyFilteredEditorGroup.id, model.id);
    assert.strictEqual(unstickyFilteredEditorGroup.id, model.id);
    assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
    assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);
    model.lock(true);
    assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
    assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);
    model.lock(false);
    assert.strictEqual(stickyFilteredEditorGroup.isLocked, model.isLocked);
    assert.strictEqual(unstickyFilteredEditorGroup.isLocked, model.isLocked);
  });
  test("Multiple Editors - Editor Emits Dirty and Label Changed", function() {
    const model1 = createEditorGroupModel();
    const model2 = createEditorGroupModel();
    const stickyFilteredEditorGroup1 = disposables.add(new StickyEditorGroupModel(model1));
    const unstickyFilteredEditorGroup1 = disposables.add(new UnstickyEditorGroupModel(model1));
    const stickyFilteredEditorGroup2 = disposables.add(new StickyEditorGroupModel(model2));
    const unstickyFilteredEditorGroup2 = disposables.add(new UnstickyEditorGroupModel(model2));
    const input1 = input();
    const input2 = input();
    model1.openEditor(input1, { pinned: true, active: true });
    model2.openEditor(input2, { pinned: true, active: true, sticky: true });
    let dirty1CounterSticky = 0;
    disposables.add(stickyFilteredEditorGroup1.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
        dirty1CounterSticky++;
      }
    }));
    let dirty1CounterUnsticky = 0;
    disposables.add(unstickyFilteredEditorGroup1.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
        dirty1CounterUnsticky++;
      }
    }));
    let dirty2CounterSticky = 0;
    disposables.add(stickyFilteredEditorGroup2.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
        dirty2CounterSticky++;
      }
    }));
    let dirty2CounterUnsticky = 0;
    disposables.add(unstickyFilteredEditorGroup2.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_DIRTY) {
        dirty2CounterUnsticky++;
      }
    }));
    let label1ChangeCounterSticky = 0;
    disposables.add(stickyFilteredEditorGroup1.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
        label1ChangeCounterSticky++;
      }
    }));
    let label1ChangeCounterUnsticky = 0;
    disposables.add(unstickyFilteredEditorGroup1.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
        label1ChangeCounterUnsticky++;
      }
    }));
    let label2ChangeCounterSticky = 0;
    disposables.add(stickyFilteredEditorGroup2.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
        label2ChangeCounterSticky++;
      }
    }));
    let label2ChangeCounterUnsticky = 0;
    disposables.add(unstickyFilteredEditorGroup2.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_LABEL) {
        label2ChangeCounterUnsticky++;
      }
    }));
    input1.setDirty();
    input1.setLabel();
    assert.strictEqual(dirty1CounterSticky, 0);
    assert.strictEqual(dirty1CounterUnsticky, 1);
    assert.strictEqual(label1ChangeCounterSticky, 0);
    assert.strictEqual(label1ChangeCounterUnsticky, 1);
    input2.setDirty();
    input2.setLabel();
    assert.strictEqual(dirty2CounterSticky, 1);
    assert.strictEqual(dirty2CounterUnsticky, 0);
    assert.strictEqual(label2ChangeCounterSticky, 1);
    assert.strictEqual(label2ChangeCounterUnsticky, 0);
    closeAllEditors(model2);
    input2.setDirty();
    input2.setLabel();
    assert.strictEqual(dirty2CounterSticky, 1);
    assert.strictEqual(dirty2CounterUnsticky, 0);
    assert.strictEqual(label2ChangeCounterSticky, 1);
    assert.strictEqual(label2ChangeCounterUnsticky, 0);
    assert.strictEqual(dirty1CounterSticky, 0);
    assert.strictEqual(dirty1CounterUnsticky, 1);
    assert.strictEqual(label1ChangeCounterSticky, 0);
    assert.strictEqual(label1ChangeCounterUnsticky, 1);
  });
  test("Sticky/Unsticky isTransient()", async () => {
    const model = createEditorGroupModel();
    const stickyFilteredEditorGroup = disposables.add(new StickyEditorGroupModel(model));
    const unstickyFilteredEditorGroup = disposables.add(new UnstickyEditorGroupModel(model));
    const input1 = input();
    const input2 = input();
    const input3 = input();
    const input4 = input();
    model.openEditor(input1, { pinned: true, transient: false });
    model.openEditor(input2, { pinned: true });
    model.openEditor(input3, { pinned: true, transient: true });
    model.openEditor(input4, { pinned: false, transient: true });
    assert.strictEqual(stickyFilteredEditorGroup.isTransient(input1), false);
    assert.strictEqual(unstickyFilteredEditorGroup.isTransient(input2), false);
    assert.strictEqual(stickyFilteredEditorGroup.isTransient(input3), true);
    assert.strictEqual(unstickyFilteredEditorGroup.isTransient(input4), true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGZpbHRlcmVkRWRpdG9yR3JvdXBNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBNb2RlbCwgSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JHcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIElGaWxlRWRpdG9ySW5wdXQsIElFZGl0b3JTZXJpYWxpemVyLCBFZGl0b3JzT3JkZXIsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVGVzdExpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU3RpY2t5RWRpdG9yR3JvdXBNb2RlbCwgVW5zdGlja3lFZGl0b3JHcm91cE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9maWx0ZXJlZEVkaXRvckdyb3VwTW9kZWwuanMnO1xuXG5zdWl0ZSgnRmlsdGVyZWRFZGl0b3JHcm91cE1vZGVsJywgKCkgPT4ge1xuXG5cdGxldCB0ZXN0SW5zdFNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHRzdWl0ZVRlYXJkb3duKCgpID0+IHtcblx0XHR0ZXN0SW5zdFNlcnZpY2U/LmRpc3Bvc2UoKTtcblx0XHR0ZXN0SW5zdFNlcnZpY2UgPSB1bmRlZmluZWQ7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGluc3QoKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHRpZiAoIXRlc3RJbnN0U2VydmljZSkge1xuXHRcdFx0dGVzdEluc3RTZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpbnN0ID0gdGVzdEluc3RTZXJ2aWNlO1xuXHRcdGluc3Quc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0LnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXHRcdGluc3Quc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSk7XG5cdFx0aW5zdC5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnLCB7IGVkaXRvcjogeyBvcGVuUG9zaXRpb25pbmc6ICdyaWdodCcsIGZvY3VzUmVjZW50RWRpdG9yQWZ0ZXJDbG9zZTogdHJ1ZSB9IH0pO1xuXHRcdGluc3Quc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZyk7XG5cblx0XHRyZXR1cm4gaW5zdDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoc2VyaWFsaXplZD86IElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCk6IEVkaXRvckdyb3VwTW9kZWwge1xuXHRcdGNvbnN0IGdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKGluc3QoKS5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCBzZXJpYWxpemVkKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0XHRncm91cC5jbG9zZUVkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBncm91cDtcblx0fVxuXG5cdGxldCBpbmRleCA9IDA7XG5cdGNsYXNzIFRlc3RFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IHtcblxuXHRcdHJlYWRvbmx5IHJlc291cmNlID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3RydWN0b3IocHVibGljIGlkOiBzdHJpbmcpIHtcblx0XHRcdHN1cGVyKCk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldCB0eXBlSWQoKSB7IHJldHVybiAndGVzdEVkaXRvcklucHV0Rm9yR3JvdXBzJzsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTxJRGlzcG9zYWJsZT4geyByZXR1cm4gbnVsbCE7IH1cblxuXHRcdG92ZXJyaWRlIG1hdGNoZXMob3RoZXI6IFRlc3RFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIG90aGVyICYmIHRoaXMuaWQgPT09IG90aGVyLmlkICYmIG90aGVyIGluc3RhbmNlb2YgVGVzdEVkaXRvcklucHV0O1xuXHRcdH1cblxuXHRcdHNldERpcnR5KCk6IHZvaWQge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0fVxuXG5cdFx0c2V0TGFiZWwoKTogdm9pZCB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBOb25TZXJpYWxpemFibGVUZXN0RWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCB7XG5cblx0XHRyZWFkb25seSByZXNvdXJjZSA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0cnVjdG9yKHB1YmxpYyBpZDogc3RyaW5nKSB7XG5cdFx0XHRzdXBlcigpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXQgdHlwZUlkKCkgeyByZXR1cm4gJ3Rlc3RFZGl0b3JJbnB1dEZvckdyb3Vwcy1ub25TZXJpYWxpemFibGUnOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgbnVsbD4geyByZXR1cm4gbnVsbDsgfVxuXG5cdFx0b3ZlcnJpZGUgbWF0Y2hlcyhvdGhlcjogTm9uU2VyaWFsaXphYmxlVGVzdEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gb3RoZXIgJiYgdGhpcy5pZCA9PT0gb3RoZXIuaWQgJiYgb3RoZXIgaW5zdGFuY2VvZiBOb25TZXJpYWxpemFibGVUZXN0RWRpdG9ySW5wdXQ7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgVGVzdEZpbGVFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IGltcGxlbWVudHMgSUZpbGVFZGl0b3JJbnB1dCB7XG5cblx0XHRyZWFkb25seSBwcmVmZXJyZWRSZXNvdXJjZTtcblxuXHRcdGNvbnN0cnVjdG9yKHB1YmxpYyBpZDogc3RyaW5nLCBwdWJsaWMgcmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0c3VwZXIoKTtcblx0XHRcdHRoaXMucHJlZmVycmVkUmVzb3VyY2UgPSB0aGlzLnJlc291cmNlO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXQgdHlwZUlkKCkgeyByZXR1cm4gJ3Rlc3RGaWxlRWRpdG9ySW5wdXRGb3JHcm91cHMnOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGVkaXRvcklkKCkgeyByZXR1cm4gdGhpcy5pZDsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTxJRGlzcG9zYWJsZSB8IG51bGw+IHsgcmV0dXJuIG51bGw7IH1cblx0XHRzZXRQcmVmZXJyZWROYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQgeyB9XG5cdFx0c2V0UHJlZmVycmVkRGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZyk6IHZvaWQgeyB9XG5cdFx0c2V0UHJlZmVycmVkUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IHZvaWQgeyB9XG5cdFx0YXN5bmMgc2V0RW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZykgeyB9XG5cdFx0Z2V0RW5jb2RpbmcoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRzZXRQcmVmZXJyZWRFbmNvZGluZyhlbmNvZGluZzogc3RyaW5nKSB7IH1cblx0XHRzZXRGb3JjZU9wZW5Bc0JpbmFyeSgpOiB2b2lkIHsgfVxuXHRcdHNldFByZWZlcnJlZENvbnRlbnRzKGNvbnRlbnRzOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRcdHNldExhbmd1YWdlSWQobGFuZ3VhZ2VJZDogc3RyaW5nKSB7IH1cblx0XHRzZXRQcmVmZXJyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZykgeyB9XG5cdFx0aXNSZXNvbHZlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHRvdmVycmlkZSBtYXRjaGVzKG90aGVyOiBUZXN0RmlsZUVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0XHRpZiAoc3VwZXIubWF0Y2hlcyhvdGhlcikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvdGhlciBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuIGlzRXF1YWwob3RoZXIucmVzb3VyY2UsIHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaW5wdXQoaWQgPSBTdHJpbmcoaW5kZXgrKyksIG5vblNlcmlhbGl6YWJsZT86IGJvb2xlYW4sIHJlc291cmNlPzogVVJJKTogRWRpdG9ySW5wdXQge1xuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dChpZCwgcmVzb3VyY2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm9uU2VyaWFsaXphYmxlID8gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb25TZXJpYWxpemFibGVUZXN0RWRpdG9ySW5wdXQoaWQpKSA6IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvcklucHV0KGlkKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjbG9zZUFsbEVkaXRvcnMoZ3JvdXA6IEVkaXRvckdyb3VwTW9kZWwpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKSkge1xuXHRcdFx0Z3JvdXAuY2xvc2VFZGl0b3IoZWRpdG9yLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRpbnRlcmZhY2UgSVNlcmlhbGl6ZWRUZXN0SW5wdXQge1xuXHRcdGlkOiBzdHJpbmc7XG5cdH1cblxuXHRjbGFzcyBUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXG5cdFx0c3RhdGljIGRpc2FibGVTZXJpYWxpemUgPSBmYWxzZTtcblx0XHRzdGF0aWMgZGlzYWJsZURlc2VyaWFsaXplID0gZmFsc2U7XG5cblx0XHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRzZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmIChUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyLmRpc2FibGVTZXJpYWxpemUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGVzdEVkaXRvcklucHV0ID0gPFRlc3RFZGl0b3JJbnB1dD5lZGl0b3JJbnB1dDtcblx0XHRcdGNvbnN0IHRlc3RJbnB1dDogSVNlcmlhbGl6ZWRUZXN0SW5wdXQgPSB7XG5cdFx0XHRcdGlkOiB0ZXN0RWRpdG9ySW5wdXQuaWRcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh0ZXN0SW5wdXQpO1xuXHRcdH1cblxuXHRcdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcmlhbGl6ZWRFZGl0b3JJbnB1dDogc3RyaW5nKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdFx0aWYgKFRlc3RFZGl0b3JJbnB1dFNlcmlhbGl6ZXIuZGlzYWJsZURlc2VyaWFsaXplKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRlc3RJbnB1dDogSVNlcmlhbGl6ZWRUZXN0SW5wdXQgPSBKU09OLnBhcnNlKHNlcmlhbGl6ZWRFZGl0b3JJbnB1dCk7XG5cblx0XHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JJbnB1dCh0ZXN0SW5wdXQuaWQpKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0VGVzdEVkaXRvcklucHV0U2VyaWFsaXplci5kaXNhYmxlU2VyaWFsaXplID0gZmFsc2U7XG5cdFx0VGVzdEVkaXRvcklucHV0U2VyaWFsaXplci5kaXNhYmxlRGVzZXJpYWxpemUgPSBmYWxzZTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcigndGVzdEVkaXRvcklucHV0Rm9yR3JvdXBzJywgVGVzdEVkaXRvcklucHV0U2VyaWFsaXplcikpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGluZGV4ID0gMTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5L1Vuc3RpY2t5IGNvdW50JywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cdFx0Y29uc3QgdW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblxuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiB0cnVlIH0pO1xuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiB0cnVlIH0pO1xuXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb3VudCwgMCk7XG5cblx0XHRtb2RlbC51bnN0aWNrKGlucHV0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb3VudCwgMSk7XG5cblx0XHRtb2RlbC51bnN0aWNrKGlucHV0Mik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb3VudCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0aWNreS9VbnN0aWNreSBzdGlja3lDb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblx0XHRjb25zdCB1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVuc3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLnN0aWNreUNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLnN0aWNreUNvdW50LCAwKTtcblxuXHRcdG1vZGVsLnVuc3RpY2soaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLnN0aWNreUNvdW50LCAwKTtcblxuXHRcdG1vZGVsLnVuc3RpY2soaW5wdXQyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLnN0aWNreUNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLnN0aWNreUNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5L1Vuc3RpY2t5IGlzRW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cdFx0Y29uc3QgdW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblxuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiBmYWxzZSB9KTtcblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogZmFsc2UgfSk7XG5cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmNvdW50ID09PSAwLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmNvdW50ID09PSAwLCBmYWxzZSk7XG5cblx0XHRtb2RlbC5zdGljayhpbnB1dDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuY291bnQgPT09IDAsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmNvdW50ID09PSAwLCBmYWxzZSk7XG5cblx0XHRtb2RlbC5zdGljayhpbnB1dDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuY291bnQgPT09IDAsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmNvdW50ID09PSAwLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5L1Vuc3RpY2t5IGVkaXRvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cdFx0Y29uc3QgdW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblxuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiB0cnVlIH0pO1xuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMCk7XG5cblx0XHRtb2RlbC51bnN0aWNrKGlucHV0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubGVuZ3RoLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMF0sIGlucHV0MSk7XG5cblx0XHRtb2RlbC51bnN0aWNrKGlucHV0Mik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5L1Vuc3RpY2t5IGFjdGl2ZUVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblx0XHRjb25zdCB1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVuc3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmFjdGl2ZUVkaXRvciwgbnVsbCk7XG5cblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogZmFsc2UsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmFjdGl2ZUVkaXRvciwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5hY3RpdmVFZGl0b3IsIGlucHV0Mik7XG5cblx0XHRtb2RlbC5jbG9zZUVkaXRvcihpbnB1dDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuYWN0aXZlRWRpdG9yLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQyKTtcblxuXHRcdG1vZGVsLmNsb3NlRWRpdG9yKGlucHV0Mik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5hY3RpdmVFZGl0b3IsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuYWN0aXZlRWRpdG9yLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5L1Vuc3RpY2t5IHByZXZpZXdFZGl0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cdFx0Y29uc3QgdW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblxuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLnByZXZpZXdFZGl0b3IsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAucHJldmlld0VkaXRvciwgaW5wdXQxKTtcblxuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHN0aWNreTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5wcmV2aWV3RWRpdG9yLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLnByZXZpZXdFZGl0b3IsIGlucHV0MSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0aWNreS9VbnN0aWNreSBpc1N0aWNreSgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3Qgc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXHRcdGNvbnN0IHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVW5zdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzU3RpY2t5KGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzU3RpY2t5KGlucHV0MiksIHRydWUpO1xuXG5cdFx0bW9kZWwudW5zdGljayhpbnB1dDEpO1xuXHRcdG1vZGVsLmNsb3NlRWRpdG9yKGlucHV0MSk7XG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzU3RpY2t5KGlucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzU3RpY2t5KGlucHV0MiksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5L1Vuc3RpY2t5IGlzUGlubmVkKCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cdFx0Y29uc3QgdW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0NCA9IGlucHV0KCk7XG5cblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogZmFsc2UgfSk7XG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiBmYWxzZSwgc3RpY2t5OiB0cnVlIH0pO1xuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IHBpbm5lZDogZmFsc2UsIHN0aWNreTogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc1Bpbm5lZChpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzUGlubmVkKGlucHV0MiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzUGlubmVkKGlucHV0MyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNQaW5uZWQoaW5wdXQ0KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdTdGlja3kvVW5zdGlja3kgaXNBY3RpdmUoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblx0XHRjb25zdCB1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVuc3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzQWN0aXZlKGlucHV0MSksIHRydWUpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IGZhbHNlLCBhY3RpdmU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0FjdGl2ZShpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0FjdGl2ZShpbnB1dDIpLCB0cnVlKTtcblxuXHRcdG1vZGVsLnVuc3RpY2soaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNBY3RpdmUoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNBY3RpdmUoaW5wdXQyKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0aWNreS9VbnN0aWNreSBnZXRFZGl0b3JzKCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cdFx0Y29uc3QgdW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblxuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiB0cnVlLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdC8vIGFsbCBzdGlja3kgZWRpdG9yc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMik7XG5cblx0XHQvLyBubyB1bnN0aWNreSBlZGl0b3JzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMCk7XG5cblx0XHQvLyBvcHRpb25zOiBleGNsdWRlU3RpY2t5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCwgeyBleGNsdWRlU3RpY2t5OiBmYWxzZSB9KS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMLCB7IGV4Y2x1ZGVTdGlja3k6IGZhbHNlIH0pLmxlbmd0aCwgMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSlbMF0sIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzFdLCBpbnB1dDEpO1xuXG5cdFx0bW9kZWwudW5zdGljayhpbnB1dDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzBdLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMF0sIGlucHV0MSk7XG5cblx0XHRtb2RlbC51bnN0aWNrKGlucHV0Mik7XG5cblx0XHQvLyBhbGwgdW5zdGlja3kgZWRpdG9yc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAyKTtcblxuXHRcdC8vIG9yZGVyOiBNT1NUX1JFQ0VOVExZX0FDVElWRVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzBdLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzFdLCBpbnB1dDEpO1xuXG5cdFx0Ly8gb3JkZXI6IFNFUVVFTlRJQUxcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzBdLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMV0sIGlucHV0MSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0aWNreS9VbnN0aWNreSBnZXRFZGl0b3JCeUluZGV4KCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cblx0XHRjb25zdCBzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cdFx0Y29uc3QgdW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDMgPSBpbnB1dCgpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCB1bmRlZmluZWQpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgdW5kZWZpbmVkKTtcblxuXHRcdG1vZGVsLnVuc3RpY2soaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnU3RpY2t5L1Vuc3RpY2t5IGluZGV4T2YoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblx0XHRjb25zdCB1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVuc3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGlucHV0KCk7XG5cblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmluZGV4T2YoaW5wdXQxKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaW5kZXhPZihpbnB1dDIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmluZGV4T2YoaW5wdXQxKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaW5kZXhPZihpbnB1dDIpLCAtMSk7XG5cblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pbmRleE9mKGlucHV0MSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmluZGV4T2YoaW5wdXQyKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaW5kZXhPZihpbnB1dDMpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pbmRleE9mKGlucHV0MSksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmluZGV4T2YoaW5wdXQyKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaW5kZXhPZihpbnB1dDMpLCAwKTtcblxuXHRcdG1vZGVsLnVuc3RpY2soaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmluZGV4T2YoaW5wdXQxKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmluZGV4T2YoaW5wdXQyKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaW5kZXhPZihpbnB1dDMpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pbmRleE9mKGlucHV0MSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaW5kZXhPZihpbnB1dDIpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pbmRleE9mKGlucHV0MyksIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdTdGlja3kvVW5zdGlja3kgaXNGaXJzdCgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3Qgc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXHRcdGNvbnN0IHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVW5zdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzRmlyc3QoaW5wdXQxKSwgdHJ1ZSk7XG5cblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzRmlyc3QoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNGaXJzdChpbnB1dDIpLCBmYWxzZSk7XG5cblx0XHRtb2RlbC51bnN0aWNrKGlucHV0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzRmlyc3QoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNGaXJzdChpbnB1dDIpLCB0cnVlKTtcblxuXHRcdG1vZGVsLnVuc3RpY2soaW5wdXQyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNGaXJzdChpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0ZpcnN0KGlucHV0MiksIHRydWUpO1xuXG5cdFx0bW9kZWwubW92ZUVkaXRvcihpbnB1dDIsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0ZpcnN0KGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNGaXJzdChpbnB1dDIpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0aWNreS9VbnN0aWNreSBpc0xhc3QoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblx0XHRjb25zdCB1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVuc3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0xhc3QoaW5wdXQxKSwgdHJ1ZSk7XG5cblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzTGFzdChpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNMYXN0KGlucHV0MiksIHRydWUpO1xuXG5cdFx0bW9kZWwudW5zdGljayhpbnB1dDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0xhc3QoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNMYXN0KGlucHV0MiksIHRydWUpO1xuXG5cdFx0bW9kZWwudW5zdGljayhpbnB1dDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0xhc3QoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0xhc3QoaW5wdXQyKSwgZmFsc2UpO1xuXG5cdFx0bW9kZWwubW92ZUVkaXRvcihpbnB1dDIsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0xhc3QoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNMYXN0KGlucHV0MiksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdTdGlja3kvVW5zdGlja3kgY29udGFpbnMoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblx0XHRjb25zdCB1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVuc3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDIgPSBpbnB1dCgpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb250YWlucyhpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb250YWlucyhpbnB1dDIpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuY29udGFpbnMoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuY29udGFpbnMoaW5wdXQyKSwgZmFsc2UpO1xuXG5cdFx0bW9kZWwudW5zdGljayhpbnB1dDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuY29udGFpbnMoaW5wdXQxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmNvbnRhaW5zKGlucHV0MiksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb250YWlucyhpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmNvbnRhaW5zKGlucHV0MiksIGZhbHNlKTtcblxuXHRcdG1vZGVsLnVuc3RpY2soaW5wdXQyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmNvbnRhaW5zKGlucHV0MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5jb250YWlucyhpbnB1dDIpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmNvbnRhaW5zKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuY29udGFpbnMoaW5wdXQyKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0aWNreS9VbnN0aWNreSBncm91cCBpbmZvcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUVkaXRvckdyb3VwTW9kZWwoKTtcblxuXHRcdGNvbnN0IHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwpKTtcblx0XHRjb25zdCB1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVuc3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXG5cdFx0Ly8gc2FtZSBpZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlkLCBtb2RlbC5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pZCwgbW9kZWwuaWQpO1xuXG5cdFx0Ly8gZ3JvdXAgbG9ja2luZyBzYW1lIGJlaGF2aW91clxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzTG9ja2VkLCBtb2RlbC5pc0xvY2tlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0xvY2tlZCwgbW9kZWwuaXNMb2NrZWQpO1xuXG5cdFx0bW9kZWwubG9jayh0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwLmlzTG9ja2VkLCBtb2RlbC5pc0xvY2tlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0xvY2tlZCwgbW9kZWwuaXNMb2NrZWQpO1xuXG5cdFx0bW9kZWwubG9jayhmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc0xvY2tlZCwgbW9kZWwuaXNMb2NrZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNMb2NrZWQsIG1vZGVsLmlzTG9ja2VkKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgRWRpdG9ycyAtIEVkaXRvciBFbWl0cyBEaXJ0eSBhbmQgTGFiZWwgQ2hhbmdlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDEgPSBjcmVhdGVFZGl0b3JHcm91cE1vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWwyID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3Qgc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cDEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0aWNreUVkaXRvckdyb3VwTW9kZWwobW9kZWwxKSk7XG5cdFx0Y29uc3QgdW5zdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwMSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVW5zdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsMSkpO1xuXHRcdGNvbnN0IHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsMikpO1xuXHRcdGNvbnN0IHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cDIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVuc3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbDIpKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gaW5wdXQoKTtcblxuXHRcdG1vZGVsMS5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRtb2RlbDIub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdC8vIERJUlRZXG5cdFx0bGV0IGRpcnR5MUNvdW50ZXJTdGlja3kgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwMS5vbkRpZE1vZGVsQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfRElSVFkpIHtcblx0XHRcdFx0ZGlydHkxQ291bnRlclN0aWNreSsrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBkaXJ0eTFDb3VudGVyVW5zdGlja3kgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAxLm9uRGlkTW9kZWxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9ESVJUWSkge1xuXHRcdFx0XHRkaXJ0eTFDb3VudGVyVW5zdGlja3krKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgZGlydHkyQ291bnRlclN0aWNreSA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAyLm9uRGlkTW9kZWxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9ESVJUWSkge1xuXHRcdFx0XHRkaXJ0eTJDb3VudGVyU3RpY2t5Kys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGRpcnR5MkNvdW50ZXJVbnN0aWNreSA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cDIub25EaWRNb2RlbENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0RJUlRZKSB7XG5cdFx0XHRcdGRpcnR5MkNvdW50ZXJVbnN0aWNreSsrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIExBQkVMXG5cdFx0bGV0IGxhYmVsMUNoYW5nZUNvdW50ZXJTdGlja3kgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdGlja3lGaWx0ZXJlZEVkaXRvckdyb3VwMS5vbkRpZE1vZGVsQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTEFCRUwpIHtcblx0XHRcdFx0bGFiZWwxQ2hhbmdlQ291bnRlclN0aWNreSsrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBsYWJlbDFDaGFuZ2VDb3VudGVyVW5zdGlja3kgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh1bnN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAxLm9uRGlkTW9kZWxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9MQUJFTCkge1xuXHRcdFx0XHRsYWJlbDFDaGFuZ2VDb3VudGVyVW5zdGlja3krKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgbGFiZWwyQ2hhbmdlQ291bnRlclN0aWNreSA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAyLm9uRGlkTW9kZWxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9MQUJFTCkge1xuXHRcdFx0XHRsYWJlbDJDaGFuZ2VDb3VudGVyU3RpY2t5Kys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGxhYmVsMkNoYW5nZUNvdW50ZXJVbnN0aWNreSA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cDIub25EaWRNb2RlbENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0xBQkVMKSB7XG5cdFx0XHRcdGxhYmVsMkNoYW5nZUNvdW50ZXJVbnN0aWNreSsrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdCg8VGVzdEVkaXRvcklucHV0PmlucHV0MSkuc2V0RGlydHkoKTtcblx0XHQoPFRlc3RFZGl0b3JJbnB1dD5pbnB1dDEpLnNldExhYmVsKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHkxQ291bnRlclN0aWNreSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5MUNvdW50ZXJVbnN0aWNreSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsMUNoYW5nZUNvdW50ZXJTdGlja3ksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbDFDaGFuZ2VDb3VudGVyVW5zdGlja3ksIDEpO1xuXG5cdFx0KDxUZXN0RWRpdG9ySW5wdXQ+aW5wdXQyKS5zZXREaXJ0eSgpO1xuXHRcdCg8VGVzdEVkaXRvcklucHV0PmlucHV0Mikuc2V0TGFiZWwoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eTJDb3VudGVyU3RpY2t5LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHkyQ291bnRlclVuc3RpY2t5LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWwyQ2hhbmdlQ291bnRlclN0aWNreSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsMkNoYW5nZUNvdW50ZXJVbnN0aWNreSwgMCk7XG5cblx0XHRjbG9zZUFsbEVkaXRvcnMobW9kZWwyKTtcblxuXHRcdCg8VGVzdEVkaXRvcklucHV0PmlucHV0Mikuc2V0RGlydHkoKTtcblx0XHQoPFRlc3RFZGl0b3JJbnB1dD5pbnB1dDIpLnNldExhYmVsKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHkyQ291bnRlclN0aWNreSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5MkNvdW50ZXJVbnN0aWNreSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsMkNoYW5nZUNvdW50ZXJTdGlja3ksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbDJDaGFuZ2VDb3VudGVyVW5zdGlja3ksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eTFDb3VudGVyU3RpY2t5LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHkxQ291bnRlclVuc3RpY2t5LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWwxQ2hhbmdlQ291bnRlclN0aWNreSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsMUNoYW5nZUNvdW50ZXJVbnN0aWNreSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0aWNreS9VbnN0aWNreSBpc1RyYW5zaWVudCgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlRWRpdG9yR3JvdXBNb2RlbCgpO1xuXG5cdFx0Y29uc3Qgc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3RpY2t5RWRpdG9yR3JvdXBNb2RlbChtb2RlbCkpO1xuXHRcdGNvbnN0IHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVW5zdGlja3lFZGl0b3JHcm91cE1vZGVsKG1vZGVsKSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnB1dCgpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGlucHV0KCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gaW5wdXQoKTtcblx0XHRjb25zdCBpbnB1dDQgPSBpbnB1dCgpO1xuXG5cdFx0bW9kZWwub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCB0cmFuc2llbnQ6IGZhbHNlIH0pO1xuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUsIHRyYW5zaWVudDogdHJ1ZSB9KTtcblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0NCwgeyBwaW5uZWQ6IGZhbHNlLCB0cmFuc2llbnQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc1RyYW5zaWVudChpbnB1dDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc1RyYW5zaWVudChpbnB1dDIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0aWNreUZpbHRlcmVkRWRpdG9yR3JvdXAuaXNUcmFuc2llbnQoaW5wdXQzKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3RpY2t5RmlsdGVyZWRFZGl0b3JHcm91cC5pc1RyYW5zaWVudChpbnB1dDQpLCB0cnVlKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHdCQUFxRDtBQUM5RCxTQUFTLGtCQUErRSxjQUFjLDRCQUE0QjtBQUVsSSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUE4QixvQkFBb0I7QUFDM0QsU0FBUyxvQkFBb0IsMEJBQTBCO0FBQ3ZELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QixnQ0FBZ0M7QUFFakUsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QyxNQUFJO0FBRUosZ0JBQWMsTUFBTTtBQUNuQixxQkFBaUIsUUFBUTtBQUN6QixzQkFBa0I7QUFBQSxFQUNuQixDQUFDO0FBRUQsV0FBUyxPQUE4QjtBQUN0QyxRQUFJLENBQUMsaUJBQWlCO0FBQ3JCLHdCQUFrQixJQUFJLHlCQUF5QjtBQUFBLElBQ2hEO0FBQ0EsVUFBTUEsUUFBTztBQUNiLElBQUFBLE1BQUssS0FBSyxpQkFBaUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLENBQUMsQ0FBQztBQUNwRSxJQUFBQSxNQUFLLEtB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eUIsS0FBSyxDQUFDO0FBRXZGLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFVBQU0sU0FBUyxNQUFNO0FBRXJCLFVBQU0sV0FBVyxRQUFRLEVBQUUsUUFBUSxNQUFNLFFBQVEsS0FBSyxDQUFDO0FBQ3ZELFVBQU0sV0FBVyxRQUFRLEVBQUUsUUFBUSxNQUFNLFFBQVEsS0FBSyxDQUFDO0FBRXZELFdBQU8sWUFBWSwwQkFBMEIsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3hFLFdBQU8sWUFBWSwwQkFBMEIsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3hFLFdBQU8sWUFBWSwwQkFBMEIsaUJBQWlCLENBQUMsR0FBRyxNQUFTO0FBQzNFLFdBQU8sWUFBWSw0QkFBNEIsaUJBQWlCLENBQUMsR0FBRyxNQUFTO0FBQzdFLFdBQU8sWUFBWSw0QkFBNEIsaUJBQWlCLENBQUMsR0FBRyxNQUFTO0FBRTdFLFVBQU0sV0FBVyxRQUFRLEVBQUUsUUFBUSxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBRXhELFdBQU8sWUFBWSwwQkFBMEIsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3hFLFdBQU8sWUFBWSwwQkFBMEIsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3hFLFdBQU8sWUFBWSwwQkFBMEIsaUJBQWlCLENBQUMsR0FBRyxNQUFTO0FBQzNFLFdBQU8sWUFBWSw0QkFBNEIsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQzFFLFdBQU8sWUFBWSw0QkFBNEIsaUJBQWlCLENBQUMsR0FBRyxNQUFTO0FBRTdFLFVBQU0sUUFBUSxNQUFNO0FBRXBCLFdBQU8sWUFBWSwwQkFBMEIsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3hFLFdBQU8sWUFBWSwwQkFBMEIsaUJBQWlCLENBQUMsR0FBRyxNQUFTO0FBQzNFLFdBQU8sWUFBWSw0QkFBNEIsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQzFFLFdBQU8sWUFBWSw0QkFBNEIsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQzFFLFdBQU8sWUFBWSw0QkFB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
