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
import { EditorPane, EditorMemento } from "../../../../browser/parts/editor/editorPane.js";
import { WorkspaceTrustRequiredPlaceholderEditor } from "../../../../browser/parts/editor/editorPlaceholder.js";
import { EditorExtensions, EditorInputCapabilities } from "../../../../common/editor.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { workbenchInstantiationService, TestEditorGroupView, TestEditorGroupsService, registerTestResourceEditor, TestEditorInput, createEditorPart, TestTextResourceConfigurationService } from "../../workbenchTestServices.js";
import { TextResourceEditorInput } from "../../../../common/editor/textResourceEditorInput.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { URI } from "../../../../../base/common/uri.js";
import { EditorPaneDescriptor } from "../../../../browser/editor.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { TestStorageService, TestWorkspaceTrustManagementService } from "../../../common/workbenchTestServices.js";
import { extUri } from "../../../../../base/common/resources.js";
import { EditorService } from "../../../../services/editor/browser/editorService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { EditorInput } from "../../../../common/editor/editorInput.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const NullThemeService = new TestThemeService();
const editorRegistry = Registry.as(EditorExtensions.EditorPane);
const editorInputRegistry = Registry.as(EditorExtensions.EditorFactory);
class TestEditor extends EditorPane {
  constructor(group) {
    const disposables = new DisposableStore();
    super("TestEditor", group, NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));
    this._register(disposables);
  }
  getId() {
    return "testEditor";
  }
  layout() {
  }
  createEditor() {
  }
}
class OtherTestEditor extends EditorPane {
  constructor(group) {
    const disposables = new DisposableStore();
    super("testOtherEditor", group, NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));
    this._register(disposables);
  }
  getId() {
    return "testOtherEditor";
  }
  layout() {
  }
  createEditor() {
  }
}
class TestInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(input) {
    return input.toString();
  }
  deserialize(instantiationService, raw) {
    return {};
  }
}
class TestInput extends EditorInput {
  constructor() {
    super(...arguments);
    this.resource = void 0;
  }
  prefersEditorPane(editors) {
    return editors[1];
  }
  get typeId() {
    return "testInput";
  }
  resolve() {
    return null;
  }
}
class OtherTestInput extends EditorInput {
  constructor() {
    super(...arguments);
    this.resource = void 0;
  }
  get typeId() {
    return "otherTestInput";
  }
  resolve() {
    return null;
  }
}
class TestResourceEditorInput extends TextResourceEditorInput {
}
suite("EditorPane", () => {
  const disposables = new DisposableStore();
  teardown(() => {
    disposables.clear();
  });
  test("EditorPane API", async () => {
    const group = new TestEditorGroupView(1);
    const editor = new TestEditor(group);
    assert.ok(editor.group);
    const input = disposables.add(new OtherTestInput());
    const options = {};
    assert(!editor.isVisible());
    assert(!editor.input);
    await editor.setInput(input, options, /* @__PURE__ */ Object.create(null), CancellationToken.None);
    assert.strictEqual(input, editor.input);
    editor.setVisible(true);
    assert(editor.isVisible());
    editor.dispose();
    editor.clearInput();
    editor.setVisible(false);
    assert(!editor.isVisible());
    assert(!editor.input);
    assert(!editor.getControl());
  });
  test("EditorPaneDescriptor", () => {
    const editorDescriptor = EditorPaneDescriptor.create(TestEditor, "id", "name");
    assert.strictEqual(editorDescriptor.typeId, "id");
    assert.strictEqual(editorDescriptor.name, "name");
  });
  test("Editor Pane Registration", function() {
    const editorDescriptor1 = EditorPaneDescriptor.create(TestEditor, "id1", "name");
    const editorDescriptor2 = EditorPaneDescriptor.create(OtherTestEditor, "id2", "name");
    const oldEditorsCnt = editorRegistry.getEditorPanes().length;
    const oldInputCnt = editorRegistry.getEditors().length;
    disposables.add(editorRegistry.registerEditorPane(editorDescriptor1, [new SyncDescriptor(TestInput)]));
    disposables.add(editorRegistry.registerEditorPane(editorDescriptor2, [new SyncDescriptor(TestInput), new SyncDescriptor(OtherTestInput)]));
    assert.strictEqual(editorRegistry.getEditorPanes().length, oldEditorsCnt + 2);
    assert.strictEqual(editorRegistry.getEditors().length, oldInputCnt + 3);
    assert.strictEqual(editorRegistry.getEditorPane(disposables.add(new TestInput())), editorDescriptor2);
    assert.strictEqual(editorRegistry.getEditorPane(disposables.add(new OtherTestInput())), editorDescriptor2);
    assert.strictEqual(editorRegistry.getEditorPaneByType("id1"), editorDescriptor1);
    assert.strictEqual(editorRegistry.getEditorPaneByType("id2"), editorDescriptor2);
    assert(!editorRegistry.getEditorPaneByType("id3"));
  });
  test("Editor Pane Lookup favors specific class over superclass (match on specific class)", function() {
    const d1 = EditorPaneDescriptor.create(TestEditor, "id1", "name");
    disposables.add(registerTestResourceEditor());
    disposables.add(editorRegistry.registerEditorPane(d1, [new SyncDescriptor(TestResourceEditorInput)]));
    const inst = workbenchInstantiationService(void 0, disposables);
    const group = new TestEditorGroupView(1);
    const editor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TestResourceEditorInput, URI.file("/fake"), "fake", "", void 0, void 0))).instantiate(inst, group));
    assert.strictEqual(editor.getId(), "testEditor");
    const otherEditor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TextResourceEditorInput, URI.file("/fake"), "fake", "", void 0, void 0))).instantiate(inst, group));
    assert.strictEqual(otherEditor.getId(), "workbench.editors.textResourceEditor");
  });
  test("Editor Pane Lookup favors specific class over superclass (match on super class)", function() {
    const inst = workbenchInstantiationService(void 0, disposables);
    const group = new TestEditorGroupView(1);
    disposables.add(registerTestResourceEditor());
    const editor = disposables.add(editorRegistry.getEditorPane(disposables.add(inst.createInstance(TestResourceEditorInput, URI.file("/fake"), "fake", "", void 0, void 0))).instantiate(inst, group));
    assert.strictEqual("workbench.editors.textResourceEditor", editor.getId());
  });
  test("Editor Input Serializer", function() {
    const testInput = disposables.add(new TestEditorInput(URI.file("/fake"), "testTypeId"));
    workbenchInstantiationService(void 0, disposables).invokeFunction((accessor) => editorInputRegistry.start(accessor));
    disposables.add(editorInputRegistry.registerEditorSerializer(testInput.typeId, TestInputSerializer));
    let factory = editorInputRegistry.getEditorSerializer("testTypeId");
    assert(factory);
    factory = editorInputRegistry.getEditorSerializer(testInput);
    assert(factory);
    assert.throws(() => editorInputRegistry.registerEditorSerializer(testInput.typeId, TestInputSerializer));
  });
  test("EditorMemento - basics", function() {
    const testGroup0 = new TestEditorGroupView(0);
    const testGroup1 = new TestEditorGroupView(1);
    const testGroup4 = new TestEditorGroupView(4);
    const configurationService = new TestTextResourceConfigurationService();
    const editorGroupService = new TestEditorGroupsService([
      testGroup0,
      testGroup1,
      new TestEditorGroupView(2)
    ]);
    const rawMemento = /* @__PURE__ */ Object.create(null);
    let memento = disposables.add(new EditorMemento("id", "key", rawMemento, 3, editorGroupService, configurationService));
    let res = memento.loadEditorState(testGroup0, URI.file("/A"));
    assert.ok(!res);
    memento.saveEditorState(testGroup0, URI.file("/A"), { line: 3 });
    res = memento.loadEditorState(testGroup0, URI.file("/A"));
    assert.ok(res);
    assert.strictEqual(res.line, 3);
    memento.saveEditorState(testGroup1, URI.file("/A"), { line: 5 });
    res = memento.loadEditorState(testGroup1, URI.file("/A"));
    assert.ok(res);
    assert.strictEqual(res.line, 5);
    memento.saveEditorState(testGroup0, URI.file("/B"), { line: 1 });
    memento.saveEditorState(testGroup0, URI.file("/C"), { line: 1 });
    memento.saveEditorState(testGroup0, URI.file("/D"), { line: 1 });
    memento.saveEditorState(testGroup0, URI.file("/E"), { line: 1 });
    assert.ok(!memento.loadEditorState(testGroup0, URI.file("/A")));
    assert.ok(!memento.loadEditorState(testGroup0, URI.file("/B")));
    assert.ok(memento.loadEditorState(testGroup0, URI.file("/C")));
    assert.ok(memento.loadEditorState(testGroup0, URI.file("/D")));
    assert.ok(memento.loadEditorState(testGroup0, URI.file("/E")));
    memento.saveEditorState(testGroup4, URI.file("/E"), { line: 1 });
    assert.ok(memento.loadEditorState(testGroup4, URI.file("/E")));
    memento.saveEditorState(testGroup4, URI.file("/C"), { line: 1 });
    assert.ok(memento.loadEditorState(testGroup4, URI.file("/C")));
    memento.saveState();
    memento = disposables.add(new EditorMemento("id", "key", rawMemento, 3, editorGroupService, configurationService));
    assert.ok(memento.loadEditorState(testGroup0, URI.file("/C")));
    assert.ok(memento.loadEditorState(testGroup0, URI.file("/D")));
    assert.ok(memento.loadEditorState(testGroup0, URI.file("/E")));
    assert.ok(!memento.loadEditorState(testGroup4, URI.file("/E")));
    assert.ok(!memento.loadEditorState(testGroup4, URI.file("/C")));
    memento.clearEditorState(URI.file("/C"), testGroup4);
    memento.clearEditorState(URI.file("/E"));
    assert.ok(!memento.loadEditorState(testGroup4, URI.file("/C")));
    assert.ok(memento.loadEditorState(testGroup0, URI.file("/D")));
    assert.ok(!memento.loadEditorState(testGroup0, URI.file("/E")));
  });
  test("EditorMemento - move", function() {
    const testGroup0 = new TestEditorGroupView(0);
    const configurationService = new TestTextResourceConfigurationService();
    const editorGroupService = new TestEditorGroupsService([testGroup0]);
    const rawMemento = /* @__PURE__ */ Object.create(null);
    const memento = disposables.add(new EditorMemento("id", "key", rawMemento, 3, editorGroupService, configurationService));
    memento.saveEditorState(testGroup0, URI.file("/some/folder/file-1.txt"), { line: 1 });
    memento.saveEditorState(testGroup0, URI.file("/some/folder/file-2.txt"), { line: 2 });
    memento.saveEditorState(testGroup0, URI.file("/some/other/file.txt"), { line: 3 });
    memento.moveEditorState(URI.file("/some/folder/file-1.txt"), URI.file("/some/folder/file-moved.txt"), extUri);
    let res = memento.loadEditorState(testGroup0, URI.file("/some/folder/file-1.txt"));
    assert.ok(!res);
    res = memento.loadEditorState(testGroup0, URI.file("/some/folder/file-moved.txt"));
    assert.strictEqual(res?.line, 1);
    memento.moveEditorState(URI.file("/some/folder"), URI.file("/some/folder-moved"), extUri);
    res = memento.loadEditorState(testGroup0, URI.file("/some/folder-moved/file-moved.txt"));
    assert.strictEqual(res?.line, 1);
    res = memento.loadEditorState(testGroup0, URI.file("/some/folder-moved/file-2.txt"));
    assert.strictEqual(res?.line, 2);
  });
  test("EditoMemento - use with editor input", function() {
    const testGroup0 = new TestEditorGroupView(0);
    class TestEditorInput2 extends EditorInput {
      constructor(resource, id = "testEditorInputForMementoTest") {
        super();
        this.resource = resource;
        this.id = id;
      }
      get typeId() {
        return "testEditorInputForMementoTest";
      }
      async resolve() {
        return null;
      }
      matches(other) {
        return other && this.id === other.id && other instanceof TestEditorInput2;
      }
    }
    const rawMemento = /* @__PURE__ */ Object.create(null);
    const memento = disposables.add(new EditorMemento("id", "key", rawMemento, 3, new TestEditorGroupsService(), new TestTextResourceConfigurationService()));
    const testInputA = disposables.add(new TestEditorInput2(URI.file("/A")));
    let res = memento.loadEditorState(testGroup0, testInputA);
    assert.ok(!res);
    memento.saveEditorState(testGroup0, testInputA, { line: 3 });
    res = memento.loadEditorState(testGroup0, testInputA);
    assert.ok(res);
    assert.strictEqual(res.line, 3);
    testInputA.dispose();
    res = memento.loadEditorState(testGroup0, testInputA);
    assert.ok(!res);
  });
  test("EditoMemento - clear on editor dispose", function() {
    const testGroup0 = new TestEditorGroupView(0);
    class TestEditorInput2 extends EditorInput {
      constructor(resource, id = "testEditorInputForMementoTest") {
        super();
        this.resource = resource;
        this.id = id;
      }
      get typeId() {
        return "testEditorInputForMementoTest";
      }
      async resolve() {
        return null;
      }
      matches(other) {
        return other && this.id === other.id && other instanceof TestEditorInput2;
      }
    }
    const rawMemento = /* @__PURE__ */ Object.create(null);
    const memento = disposables.add(new EditorMemento("id", "key", rawMemento, 3, new TestEditorGroupsService(), new TestTextResourceConfigurationService()));
    const testInputA = disposables.add(new TestEditorInput2(URI.file("/A")));
    let res = memento.loadEditorState(testGroup0, testInputA);
    assert.ok(!res);
    memento.saveEditorState(testGroup0, testInputA.resource, { line: 3 });
    res = memento.loadEditorState(testGroup0, testInputA);
    assert.ok(res);
    assert.strictEqual(res.line, 3);
    testInputA.dispose();
    res = memento.loadEditorState(testGroup0, testInputA);
    assert.ok(res);
    const testInputB = disposables.add(new TestEditorInput2(URI.file("/B")));
    res = memento.loadEditorState(testGroup0, testInputB);
    assert.ok(!res);
    memento.saveEditorState(testGroup0, testInputB.resource, { line: 3 });
    res = memento.loadEditorState(testGroup0, testInputB);
    assert.ok(res);
    assert.strictEqual(res.line, 3);
    memento.clearEditorStateOnDispose(testInputB.resource, testInputB);
    testInputB.dispose();
    res = memento.loadEditorState(testGroup0, testInputB);
    assert.ok(!res);
  });
  test("EditorMemento - workbench.editor.sharedViewState", function() {
    const testGroup0 = new TestEditorGroupView(0);
    const testGroup1 = new TestEditorGroupView(1);
    const configurationService = new TestTextResourceConfigurationService(new TestConfigurationService({
      workbench: {
        editor: {
          sharedViewState: true
        }
      }
    }));
    const editorGroupService = new TestEditorGroupsService([testGroup0]);
    const rawMemento = /* @__PURE__ */ Object.create(null);
    const memento = disposables.add(new EditorMemento("id", "key", rawMemento, 3, editorGroupService, configurationService));
    const resource = URI.file("/some/folder/file-1.txt");
    memento.saveEditorState(testGroup0, resource, { line: 1 });
    let res = memento.loadEditorState(testGroup0, resource);
    assert.strictEqual(res.line, 1);
    res = memento.loadEditorState(testGroup1, resource);
    assert.strictEqual(res.line, 1);
    memento.saveEditorState(testGroup0, resource, { line: 3 });
    res = memento.loadEditorState(testGroup1, resource);
    assert.strictEqual(res.line, 3);
    memento.saveEditorState(testGroup1, resource, { line: 1 });
    res = memento.loadEditorState(testGroup1, resource);
    assert.strictEqual(res.line, 1);
    memento.clearEditorState(resource, testGroup0);
    memento.clearEditorState(resource, testGroup1);
    res = memento.loadEditorState(testGroup1, resource);
    assert.strictEqual(res.line, 1);
    memento.clearEditorState(resource);
    res = memento.loadEditorState(testGroup1, resource);
    assert.ok(!res);
  });
  test("WorkspaceTrustRequiredEditor", async function() {
    let TrustRequiredTestEditor = class extends EditorPane {
      constructor(group2, telemetryService) {
        super("TestEditor", group2, NullTelemetryService, NullThemeService, disposables.add(new TestStorageService()));
      }
      getId() {
        return "trustRequiredTestEditor";
      }
      layout() {
      }
      createEditor() {
      }
    };
    TrustRequiredTestEditor = __decorateClass([
      __decorateParam(1, ITelemetryService)
    ], TrustRequiredTestEditor);
    class TrustRequiredTestInput extends EditorInput {
      constructor() {
        super(...arguments);
        this.resource = void 0;
      }
      get typeId() {
        return "trustRequiredTestInput";
      }
      get capabilities() {
        return EditorInputCapabilities.RequiresTrust;
      }
      resolve() {
        return null;
      }
    }
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const workspaceTrustService = disposables.add(instantiationService.createInstance(TestWorkspaceTrustManagementService));
    instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
    workspaceTrustService.setWorkspaceTrust(false);
    const editorPart = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, editorPart);
    const editorService = disposables.add(instantiationService.createInstance(EditorService, void 0));
    instantiationService.stub(IEditorService, editorService);
    const group = editorPart.activeGroup;
    const editorDescriptor = EditorPaneDescriptor.create(TrustRequiredTestEditor, "id1", "name");
    disposables.add(editorRegistry.registerEditorPane(editorDescriptor, [new SyncDescriptor(TrustRequiredTestInput)]));
    const testInput = disposables.add(new TrustRequiredTestInput());
    await group.openEditor(testInput);
    assert.strictEqual(group.activeEditorPane?.getId(), WorkspaceTrustRequiredPlaceholderEditor.ID);
    const getEditorPaneIdAsync = () => new Promise((resolve) => {
      disposables.add(editorService.onDidActiveEditorChange(() => {
        resolve(group.activeEditorPane?.getId());
      }));
    });
    workspaceTrustService.setWorkspaceTrust(true);
    assert.strictEqual(await getEditorPaneIdAsync(), "trustRequiredTestEditor");
    workspaceTrustService.setWorkspaceTrust(false);
    assert.strictEqual(await getEditorPaneIdAsync(), WorkspaceTrustRequiredPlaceholderEditor.ID);
    await group.closeAllEditors();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvclBhbmUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVkaXRvclBhbmUsIEVkaXRvck1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVRydXN0UmVxdWlyZWRQbGFjZWhvbGRlckVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBsYWNlaG9sZGVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJpYWxpemVyLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBFZGl0b3JFeHRlbnNpb25zLCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgSUVkaXRvckRlc2NyaXB0b3IsIElFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UsIFRlc3RFZGl0b3JHcm91cFZpZXcsIFRlc3RFZGl0b3JHcm91cHNTZXJ2aWNlLCByZWdpc3RlclRlc3RSZXNvdXJjZUVkaXRvciwgVGVzdEVkaXRvcklucHV0LCBjcmVhdGVFZGl0b3JQYXJ0LCBUZXN0VGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRlc3RUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS90ZXN0L2NvbW1vbi90ZXN0VGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lRGVzY3JpcHRvciwgRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UsIFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9icm93c2VyL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5jb25zdCBOdWxsVGhlbWVTZXJ2aWNlID0gbmV3IFRlc3RUaGVtZVNlcnZpY2UoKTtcblxuY29uc3QgZWRpdG9yUmVnaXN0cnk6IEVkaXRvclBhbmVSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzKEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSk7XG5jb25zdCBlZGl0b3JJbnB1dFJlZ2lzdHJ5OiBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXMoRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KTtcblxuY2xhc3MgVGVzdEVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdGNvbnN0cnVjdG9yKGdyb3VwOiBJRWRpdG9yR3JvdXAsKSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3VwZXIoJ1Rlc3RFZGl0b3InLCBncm91cCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIE51bGxUaGVtZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldElkKCk6IHN0cmluZyB7IHJldHVybiAndGVzdEVkaXRvcic7IH1cblx0bGF5b3V0KCk6IHZvaWQgeyB9XG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IoKTogYW55IHsgfVxufVxuXG5jbGFzcyBPdGhlclRlc3RFZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblxuXHRjb25zdHJ1Y3Rvcihncm91cDogSUVkaXRvckdyb3VwLCkge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN1cGVyKCd0ZXN0T3RoZXJFZGl0b3InLCBncm91cCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIE51bGxUaGVtZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldElkKCk6IHN0cmluZyB7IHJldHVybiAndGVzdE90aGVyRWRpdG9yJzsgfVxuXG5cdGxheW91dCgpOiB2b2lkIHsgfVxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKCk6IGFueSB7IH1cbn1cblxuY2xhc3MgVGVzdElucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblxuXHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXJpYWxpemUoaW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaW5wdXQudG9TdHJpbmcoKTtcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJhdzogc3RyaW5nKTogRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiB7fSBhcyBFZGl0b3JJbnB1dDtcblx0fVxufVxuXG5jbGFzcyBUZXN0SW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCB7XG5cblx0cmVhZG9ubHkgcmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgcHJlZmVyc0VkaXRvclBhbmU8VCBleHRlbmRzIElFZGl0b3JEZXNjcmlwdG9yPElFZGl0b3JQYW5lPj4oZWRpdG9yczogVFtdKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGVkaXRvcnNbMV07XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICd0ZXN0SW5wdXQnO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVzb2x2ZSgpOiBhbnkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmNsYXNzIE90aGVyVGVzdElucHV0IGV4dGVuZHMgRWRpdG9ySW5wdXQge1xuXG5cdHJlYWRvbmx5IHJlc291cmNlID0gdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ290aGVyVGVzdElucHV0Jztcblx0fVxuXG5cdG92ZXJyaWRlIHJlc29sdmUoKTogYW55IHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuY2xhc3MgVGVzdFJlc291cmNlRWRpdG9ySW5wdXQgZXh0ZW5kcyBUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB7IH1cblxuc3VpdGUoJ0VkaXRvclBhbmUnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvclBhbmUgQVBJJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdyb3VwID0gbmV3IFRlc3RFZGl0b3JHcm91cFZpZXcoMSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gbmV3IFRlc3RFZGl0b3IoZ3JvdXApO1xuXHRcdGFzc2VydC5vayhlZGl0b3IuZ3JvdXApO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPdGhlclRlc3RJbnB1dCgpKTtcblx0XHRjb25zdCBvcHRpb25zID0ge307XG5cblx0XHRhc3NlcnQoIWVkaXRvci5pc1Zpc2libGUoKSk7XG5cdFx0YXNzZXJ0KCFlZGl0b3IuaW5wdXQpO1xuXG5cdFx0YXdhaXQgZWRpdG9yLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBPYmplY3QuY3JlYXRlKG51bGwpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoPGFueT5pbnB1dCwgZWRpdG9yLmlucHV0KTtcblx0XHRlZGl0b3Iuc2V0VmlzaWJsZSh0cnVlKTtcblx0XHRhc3NlcnQoZWRpdG9yLmlzVmlzaWJsZSgpKTtcblx0XHRlZGl0b3IuZGlzcG9zZSgpO1xuXHRcdGVkaXRvci5jbGVhcklucHV0KCk7XG5cdFx0ZWRpdG9yLnNldFZpc2libGUoZmFsc2UpO1xuXHRcdGFzc2VydCghZWRpdG9yLmlzVmlzaWJsZSgpKTtcblx0XHRhc3NlcnQoIWVkaXRvci5pbnB1dCk7XG5cdFx0YXNzZXJ0KCFlZGl0b3IuZ2V0Q29udHJvbCgpKTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yUGFuZURlc2NyaXB0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yRGVzY3JpcHRvciA9IEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShUZXN0RWRpdG9yLCAnaWQnLCAnbmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JEZXNjcmlwdG9yLnR5cGVJZCwgJ2lkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckRlc2NyaXB0b3IubmFtZSwgJ25hbWUnKTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yIFBhbmUgUmVnaXN0cmF0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGVkaXRvckRlc2NyaXB0b3IxID0gRWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFRlc3RFZGl0b3IsICdpZDEnLCAnbmFtZScpO1xuXHRcdGNvbnN0IGVkaXRvckRlc2NyaXB0b3IyID0gRWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKE90aGVyVGVzdEVkaXRvciwgJ2lkMicsICduYW1lJyk7XG5cblx0XHRjb25zdCBvbGRFZGl0b3JzQ250ID0gZWRpdG9yUmVnaXN0cnkuZ2V0RWRpdG9yUGFuZXMoKS5sZW5ndGg7XG5cdFx0Y29uc3Qgb2xkSW5wdXRDbnQgPSBlZGl0b3JSZWdpc3RyeS5nZXRFZGl0b3JzKCkubGVuZ3RoO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclJlZ2lzdHJ5LnJlZ2lzdGVyRWRpdG9yUGFuZShlZGl0b3JEZXNjcmlwdG9yMSwgW25ldyBTeW5jRGVzY3JpcHRvcihUZXN0SW5wdXQpXSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JSZWdpc3RyeS5yZWdpc3RlckVkaXRvclBhbmUoZWRpdG9yRGVzY3JpcHRvcjIsIFtuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdElucHV0KSwgbmV3IFN5bmNEZXNjcmlwdG9yKE90aGVyVGVzdElucHV0KV0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JSZWdpc3RyeS5nZXRFZGl0b3JQYW5lcygpLmxlbmd0aCwgb2xkRWRpdG9yc0NudCArIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JSZWdpc3RyeS5nZXRFZGl0b3JzKCkubGVuZ3RoLCBvbGRJbnB1dENudCArIDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclJlZ2lzdHJ5LmdldEVkaXRvclBhbmUoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5wdXQoKSkpLCBlZGl0b3JEZXNjcmlwdG9yMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclJlZ2lzdHJ5LmdldEVkaXRvclBhbmUoZGlzcG9zYWJsZXMuYWRkKG5ldyBPdGhlclRlc3RJbnB1dCgpKSksIGVkaXRvckRlc2NyaXB0b3IyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JSZWdpc3RyeS5nZXRFZGl0b3JQYW5lQnlUeXBlKCdpZDEnKSwgZWRpdG9yRGVzY3JpcHRvcjEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JSZWdpc3RyeS5nZXRFZGl0b3JQYW5lQnlUeXBlKCdpZDInKSwgZWRpdG9yRGVzY3JpcHRvcjIpO1xuXHRcdGFzc2VydCghZWRpdG9yUmVnaXN0cnkuZ2V0RWRpdG9yUGFuZUJ5VHlwZSgnaWQzJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3IgUGFuZSBMb29rdXAgZmF2b3JzIHNwZWNpZmljIGNsYXNzIG92ZXIgc3VwZXJjbGFzcyAobWF0Y2ggb24gc3BlY2lmaWMgY2xhc3MpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGQxID0gRWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFRlc3RFZGl0b3IsICdpZDEnLCAnbmFtZScpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyVGVzdFJlc291cmNlRWRpdG9yKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JSZWdpc3RyeS5yZWdpc3RlckVkaXRvclBhbmUoZDEsIFtuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdFJlc291cmNlRWRpdG9ySW5wdXQpXSkpO1xuXG5cdFx0Y29uc3QgaW5zdCA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBuZXcgVGVzdEVkaXRvckdyb3VwVmlldygxKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGRpc3Bvc2FibGVzLmFkZChlZGl0b3JSZWdpc3RyeS5nZXRFZGl0b3JQYW5lKGRpc3Bvc2FibGVzLmFkZChpbnN0LmNyZWF0ZUluc3RhbmNlKFRlc3RSZXNvdXJjZUVkaXRvcklucHV0LCBVUkkuZmlsZSgnL2Zha2UnKSwgJ2Zha2UnLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpKSkhLmluc3RhbnRpYXRlKGluc3QsIGdyb3VwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRJZCgpLCAndGVzdEVkaXRvcicpO1xuXG5cdFx0Y29uc3Qgb3RoZXJFZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoZWRpdG9yUmVnaXN0cnkuZ2V0RWRpdG9yUGFuZShkaXNwb3NhYmxlcy5hZGQoaW5zdC5jcmVhdGVJbnN0YW5jZShUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgVVJJLmZpbGUoJy9mYWtlJyksICdmYWtlJywgJycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSkpIS5pbnN0YW50aWF0ZShpbnN0LCBncm91cCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdGhlckVkaXRvci5nZXRJZCgpLCAnd29ya2JlbmNoLmVkaXRvcnMudGV4dFJlc291cmNlRWRpdG9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvciBQYW5lIExvb2t1cCBmYXZvcnMgc3BlY2lmaWMgY2xhc3Mgb3ZlciBzdXBlcmNsYXNzIChtYXRjaCBvbiBzdXBlciBjbGFzcyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5zdCA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBuZXcgVGVzdEVkaXRvckdyb3VwVmlldygxKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRlc3RSZXNvdXJjZUVkaXRvcigpKTtcblx0XHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoZWRpdG9yUmVnaXN0cnkuZ2V0RWRpdG9yUGFuZShkaXNwb3NhYmxlcy5hZGQoaW5zdC5jcmVhdGVJbnN0YW5jZShUZXN0UmVzb3VyY2VFZGl0b3JJbnB1dCwgVVJJLmZpbGUoJy9mYWtlJyksICdmYWtlJywgJycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSkpIS5pbnN0YW50aWF0ZShpbnN0LCBncm91cCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCd3b3JrYmVuY2guZWRpdG9ycy50ZXh0UmVzb3VyY2VFZGl0b3InLCBlZGl0b3IuZ2V0SWQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvciBJbnB1dCBTZXJpYWxpemVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RJbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvcklucHV0KFVSSS5maWxlKCcvZmFrZScpLCAndGVzdFR5cGVJZCcpKTtcblx0XHR3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBlZGl0b3JJbnB1dFJlZ2lzdHJ5LnN0YXJ0KGFjY2Vzc29yKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvcklucHV0UmVnaXN0cnkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKHRlc3RJbnB1dC50eXBlSWQsIFRlc3RJbnB1dFNlcmlhbGl6ZXIpKTtcblxuXHRcdGxldCBmYWN0b3J5ID0gZWRpdG9ySW5wdXRSZWdpc3RyeS5nZXRFZGl0b3JTZXJpYWxpemVyKCd0ZXN0VHlwZUlkJyk7XG5cdFx0YXNzZXJ0KGZhY3RvcnkpO1xuXG5cdFx0ZmFjdG9yeSA9IGVkaXRvcklucHV0UmVnaXN0cnkuZ2V0RWRpdG9yU2VyaWFsaXplcih0ZXN0SW5wdXQpO1xuXHRcdGFzc2VydChmYWN0b3J5KTtcblxuXHRcdC8vIHRocm93cyB3aGVuIHJlZ2lzdGVyaW5nIHNlcmlhbGl6ZXIgZm9yIHNhbWUgdHlwZVxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZWRpdG9ySW5wdXRSZWdpc3RyeS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIodGVzdElucHV0LnR5cGVJZCwgVGVzdElucHV0U2VyaWFsaXplcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JNZW1lbnRvIC0gYmFzaWNzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RHcm91cDAgPSBuZXcgVGVzdEVkaXRvckdyb3VwVmlldygwKTtcblx0XHRjb25zdCB0ZXN0R3JvdXAxID0gbmV3IFRlc3RFZGl0b3JHcm91cFZpZXcoMSk7XG5cdFx0Y29uc3QgdGVzdEdyb3VwNCA9IG5ldyBUZXN0RWRpdG9yR3JvdXBWaWV3KDQpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdFRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBuZXcgVGVzdEVkaXRvckdyb3Vwc1NlcnZpY2UoW1xuXHRcdFx0dGVzdEdyb3VwMCxcblx0XHRcdHRlc3RHcm91cDEsXG5cdFx0XHRuZXcgVGVzdEVkaXRvckdyb3VwVmlldygyKVxuXHRcdF0pO1xuXG5cdFx0aW50ZXJmYWNlIFRlc3RWaWV3U3RhdGUge1xuXHRcdFx0bGluZTogbnVtYmVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd01lbWVudG8gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGxldCBtZW1lbnRvID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0b3JNZW1lbnRvPFRlc3RWaWV3U3RhdGU+KCdpZCcsICdrZXknLCByYXdNZW1lbnRvLCAzLCBlZGl0b3JHcm91cFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cblx0XHRsZXQgcmVzID0gbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgVVJJLmZpbGUoJy9BJykpO1xuXHRcdGFzc2VydC5vayghcmVzKTtcblxuXHRcdG1lbWVudG8uc2F2ZUVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvQScpLCB7IGxpbmU6IDMgfSk7XG5cdFx0cmVzID0gbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgVVJJLmZpbGUoJy9BJykpO1xuXHRcdGFzc2VydC5vayhyZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGluZSwgMyk7XG5cblx0XHRtZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAxLCBVUkkuZmlsZSgnL0EnKSwgeyBsaW5lOiA1IH0pO1xuXHRcdHJlcyA9IG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDEsIFVSSS5maWxlKCcvQScpKTtcblx0XHRhc3NlcnQub2socmVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxpbmUsIDUpO1xuXG5cdFx0Ly8gRW5zdXJlIGNhcHBlZCBhdCAzIGVsZW1lbnRzXG5cdFx0bWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgVVJJLmZpbGUoJy9CJyksIHsgbGluZTogMSB9KTtcblx0XHRtZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCBVUkkuZmlsZSgnL0MnKSwgeyBsaW5lOiAxIH0pO1xuXHRcdG1lbWVudG8uc2F2ZUVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvRCcpLCB7IGxpbmU6IDEgfSk7XG5cdFx0bWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgVVJJLmZpbGUoJy9FJyksIHsgbGluZTogMSB9KTtcblxuXHRcdGFzc2VydC5vayghbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgVVJJLmZpbGUoJy9BJykpKTtcblx0XHRhc3NlcnQub2soIW1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvQicpKSk7XG5cdFx0YXNzZXJ0Lm9rKG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvQycpKSk7XG5cdFx0YXNzZXJ0Lm9rKG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvRCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvRScpKSk7XG5cblx0XHQvLyBTYXZlIGF0IGFuIHVua25vd24gZ3JvdXBcblx0XHRtZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0ZXN0R3JvdXA0LCBVUkkuZmlsZSgnL0UnKSwgeyBsaW5lOiAxIH0pO1xuXHRcdGFzc2VydC5vayhtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXA0LCBVUkkuZmlsZSgnL0UnKSkpOyAvLyBvbmx5IGdldHMgcmVtb3ZlZCB3aGVuIG1lbWVudG8gaXMgc2F2ZWRcblx0XHRtZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0ZXN0R3JvdXA0LCBVUkkuZmlsZSgnL0MnKSwgeyBsaW5lOiAxIH0pO1xuXHRcdGFzc2VydC5vayhtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXA0LCBVUkkuZmlsZSgnL0MnKSkpOyAvLyBvbmx5IGdldHMgcmVtb3ZlZCB3aGVuIG1lbWVudG8gaXMgc2F2ZWRcblxuXHRcdG1lbWVudG8uc2F2ZVN0YXRlKCk7XG5cblx0XHRtZW1lbnRvID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0b3JNZW1lbnRvKCdpZCcsICdrZXknLCByYXdNZW1lbnRvLCAzLCBlZGl0b3JHcm91cFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0Lm9rKG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvQycpKSk7XG5cdFx0YXNzZXJ0Lm9rKG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvRCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvRScpKSk7XG5cblx0XHQvLyBDaGVjayBvbiBlbnRyaWVzIG5vIGxvbmdlciB0aGVyZSBmcm9tIGludmFsaWQgZ3JvdXBzXG5cdFx0YXNzZXJ0Lm9rKCFtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXA0LCBVUkkuZmlsZSgnL0UnKSkpO1xuXHRcdGFzc2VydC5vayghbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwNCwgVVJJLmZpbGUoJy9DJykpKTtcblxuXHRcdG1lbWVudG8uY2xlYXJFZGl0b3JTdGF0ZShVUkkuZmlsZSgnL0MnKSwgdGVzdEdyb3VwNCk7XG5cdFx0bWVtZW50by5jbGVhckVkaXRvclN0YXRlKFVSSS5maWxlKCcvRScpKTtcblxuXHRcdGFzc2VydC5vayghbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwNCwgVVJJLmZpbGUoJy9DJykpKTtcblx0XHRhc3NlcnQub2sobWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgVVJJLmZpbGUoJy9EJykpKTtcblx0XHRhc3NlcnQub2soIW1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvRScpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvck1lbWVudG8gLSBtb3ZlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RHcm91cDAgPSBuZXcgVGVzdEVkaXRvckdyb3VwVmlldygwKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IG5ldyBUZXN0RWRpdG9yR3JvdXBzU2VydmljZShbdGVzdEdyb3VwMF0pO1xuXG5cdFx0aW50ZXJmYWNlIFRlc3RWaWV3U3RhdGUgeyBsaW5lOiBudW1iZXIgfVxuXG5cdFx0Y29uc3QgcmF3TWVtZW50byA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Y29uc3QgbWVtZW50byA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdG9yTWVtZW50bzxUZXN0Vmlld1N0YXRlPignaWQnLCAna2V5JywgcmF3TWVtZW50bywgMywgZWRpdG9yR3JvdXBTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXG5cdFx0bWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgVVJJLmZpbGUoJy9zb21lL2ZvbGRlci9maWxlLTEudHh0JyksIHsgbGluZTogMSB9KTtcblx0XHRtZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCBVUkkuZmlsZSgnL3NvbWUvZm9sZGVyL2ZpbGUtMi50eHQnKSwgeyBsaW5lOiAyIH0pO1xuXHRcdG1lbWVudG8uc2F2ZUVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvc29tZS9vdGhlci9maWxlLnR4dCcpLCB7IGxpbmU6IDMgfSk7XG5cblx0XHRtZW1lbnRvLm1vdmVFZGl0b3JTdGF0ZShVUkkuZmlsZSgnL3NvbWUvZm9sZGVyL2ZpbGUtMS50eHQnKSwgVVJJLmZpbGUoJy9zb21lL2ZvbGRlci9maWxlLW1vdmVkLnR4dCcpLCBleHRVcmkpO1xuXG5cdFx0bGV0IHJlcyA9IG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIFVSSS5maWxlKCcvc29tZS9mb2xkZXIvZmlsZS0xLnR4dCcpKTtcblx0XHRhc3NlcnQub2soIXJlcyk7XG5cblx0XHRyZXMgPSBtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCBVUkkuZmlsZSgnL3NvbWUvZm9sZGVyL2ZpbGUtbW92ZWQudHh0JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM/LmxpbmUsIDEpO1xuXG5cdFx0bWVtZW50by5tb3ZlRWRpdG9yU3RhdGUoVVJJLmZpbGUoJy9zb21lL2ZvbGRlcicpLCBVUkkuZmlsZSgnL3NvbWUvZm9sZGVyLW1vdmVkJyksIGV4dFVyaSk7XG5cblx0XHRyZXMgPSBtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCBVUkkuZmlsZSgnL3NvbWUvZm9sZGVyLW1vdmVkL2ZpbGUtbW92ZWQudHh0JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM/LmxpbmUsIDEpO1xuXG5cdFx0cmVzID0gbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgVVJJLmZpbGUoJy9zb21lL2ZvbGRlci1tb3ZlZC9maWxlLTIudHh0JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM/LmxpbmUsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b01lbWVudG8gLSB1c2Ugd2l0aCBlZGl0b3IgaW5wdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdEdyb3VwMCA9IG5ldyBUZXN0RWRpdG9yR3JvdXBWaWV3KDApO1xuXG5cdFx0aW50ZXJmYWNlIFRlc3RWaWV3U3RhdGUge1xuXHRcdFx0bGluZTogbnVtYmVyO1xuXHRcdH1cblxuXHRcdGNsYXNzIFRlc3RFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IHtcblx0XHRcdGNvbnN0cnVjdG9yKHB1YmxpYyByZXNvdXJjZTogVVJJLCBwcml2YXRlIGlkID0gJ3Rlc3RFZGl0b3JJbnB1dEZvck1lbWVudG9UZXN0Jykge1xuXHRcdFx0XHRzdXBlcigpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpIHsgcmV0dXJuICd0ZXN0RWRpdG9ySW5wdXRGb3JNZW1lbnRvVGVzdCc7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTxJRGlzcG9zYWJsZSB8IG51bGw+IHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdFx0b3ZlcnJpZGUgbWF0Y2hlcyhvdGhlcjogVGVzdEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiBvdGhlciAmJiB0aGlzLmlkID09PSBvdGhlci5pZCAmJiBvdGhlciBpbnN0YW5jZW9mIFRlc3RFZGl0b3JJbnB1dDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByYXdNZW1lbnRvID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRjb25zdCBtZW1lbnRvID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0b3JNZW1lbnRvPFRlc3RWaWV3U3RhdGU+KCdpZCcsICdrZXknLCByYXdNZW1lbnRvLCAzLCBuZXcgVGVzdEVkaXRvckdyb3Vwc1NlcnZpY2UoKSwgbmV3IFRlc3RUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCB0ZXN0SW5wdXRBID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RWRpdG9ySW5wdXQoVVJJLmZpbGUoJy9BJykpKTtcblxuXHRcdGxldCByZXMgPSBtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCB0ZXN0SW5wdXRBKTtcblx0XHRhc3NlcnQub2soIXJlcyk7XG5cblx0XHRtZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCB0ZXN0SW5wdXRBLCB7IGxpbmU6IDMgfSk7XG5cdFx0cmVzID0gbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgdGVzdElucHV0QSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCAzKTtcblxuXHRcdC8vIFN0YXRlIHJlbW92ZWQgd2hlbiBpbnB1dCBnZXRzIGRpc3Bvc2VkXG5cdFx0dGVzdElucHV0QS5kaXNwb3NlKCk7XG5cdFx0cmVzID0gbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgdGVzdElucHV0QSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b01lbWVudG8gLSBjbGVhciBvbiBlZGl0b3IgZGlzcG9zZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0R3JvdXAwID0gbmV3IFRlc3RFZGl0b3JHcm91cFZpZXcoMCk7XG5cblx0XHRpbnRlcmZhY2UgVGVzdFZpZXdTdGF0ZSB7XG5cdFx0XHRsaW5lOiBudW1iZXI7XG5cdFx0fVxuXG5cdFx0Y2xhc3MgVGVzdEVkaXRvcklucHV0IGV4dGVuZHMgRWRpdG9ySW5wdXQge1xuXHRcdFx0Y29uc3RydWN0b3IocHVibGljIHJlc291cmNlOiBVUkksIHByaXZhdGUgaWQgPSAndGVzdEVkaXRvcklucHV0Rm9yTWVtZW50b1Rlc3QnKSB7XG5cdFx0XHRcdHN1cGVyKCk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXQgdHlwZUlkKCkgeyByZXR1cm4gJ3Rlc3RFZGl0b3JJbnB1dEZvck1lbWVudG9UZXN0JzsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgbnVsbD4geyByZXR1cm4gbnVsbDsgfVxuXG5cdFx0XHRvdmVycmlkZSBtYXRjaGVzKG90aGVyOiBUZXN0RWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIG90aGVyICYmIHRoaXMuaWQgPT09IG90aGVyLmlkICYmIG90aGVyIGluc3RhbmNlb2YgVGVzdEVkaXRvcklucHV0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJhd01lbWVudG8gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGNvbnN0IG1lbWVudG8gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRvck1lbWVudG88VGVzdFZpZXdTdGF0ZT4oJ2lkJywgJ2tleScsIHJhd01lbWVudG8sIDMsIG5ldyBUZXN0RWRpdG9yR3JvdXBzU2VydmljZSgpLCBuZXcgVGVzdFRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IHRlc3RJbnB1dEEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JJbnB1dChVUkkuZmlsZSgnL0EnKSkpO1xuXG5cdFx0bGV0IHJlcyA9IG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIHRlc3RJbnB1dEEpO1xuXHRcdGFzc2VydC5vayghcmVzKTtcblxuXHRcdG1lbWVudG8uc2F2ZUVkaXRvclN0YXRlKHRlc3RHcm91cDAsIHRlc3RJbnB1dEEucmVzb3VyY2UsIHsgbGluZTogMyB9KTtcblx0XHRyZXMgPSBtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCB0ZXN0SW5wdXRBKTtcblx0XHRhc3NlcnQub2socmVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxpbmUsIDMpO1xuXG5cdFx0Ly8gU3RhdGUgbm90IHlldCByZW1vdmVkIHdoZW4gaW5wdXQgZ2V0cyBkaXNwb3NlZFxuXHRcdC8vIGJlY2F1c2Ugd2UgdXNlZCByZXNvdXJjZVxuXHRcdHRlc3RJbnB1dEEuZGlzcG9zZSgpO1xuXHRcdHJlcyA9IG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDAsIHRlc3RJbnB1dEEpO1xuXHRcdGFzc2VydC5vayhyZXMpO1xuXG5cdFx0Y29uc3QgdGVzdElucHV0QiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvcklucHV0KFVSSS5maWxlKCcvQicpKSk7XG5cblx0XHRyZXMgPSBtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCB0ZXN0SW5wdXRCKTtcblx0XHRhc3NlcnQub2soIXJlcyk7XG5cblx0XHRtZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCB0ZXN0SW5wdXRCLnJlc291cmNlLCB7IGxpbmU6IDMgfSk7XG5cdFx0cmVzID0gbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgdGVzdElucHV0Qik7XG5cdFx0YXNzZXJ0Lm9rKHJlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCAzKTtcblxuXHRcdG1lbWVudG8uY2xlYXJFZGl0b3JTdGF0ZU9uRGlzcG9zZSh0ZXN0SW5wdXRCLnJlc291cmNlLCB0ZXN0SW5wdXRCKTtcblxuXHRcdC8vIFN0YXRlIHJlbW92ZWQgd2hlbiBpbnB1dCBnZXRzIGRpc3Bvc2VkXG5cdFx0dGVzdElucHV0Qi5kaXNwb3NlKCk7XG5cdFx0cmVzID0gbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgdGVzdElucHV0Qik7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JNZW1lbnRvIC0gd29ya2JlbmNoLmVkaXRvci5zaGFyZWRWaWV3U3RhdGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdEdyb3VwMCA9IG5ldyBUZXN0RWRpdG9yR3JvdXBWaWV3KDApO1xuXHRcdGNvbnN0IHRlc3RHcm91cDEgPSBuZXcgVGVzdEVkaXRvckdyb3VwVmlldygxKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZShuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdHdvcmtiZW5jaDoge1xuXHRcdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0XHRzaGFyZWRWaWV3U3RhdGU6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBuZXcgVGVzdEVkaXRvckdyb3Vwc1NlcnZpY2UoW3Rlc3RHcm91cDBdKTtcblxuXHRcdGludGVyZmFjZSBUZXN0Vmlld1N0YXRlIHsgbGluZTogbnVtYmVyIH1cblxuXHRcdGNvbnN0IHJhd01lbWVudG8gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGNvbnN0IG1lbWVudG8gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRvck1lbWVudG88VGVzdFZpZXdTdGF0ZT4oJ2lkJywgJ2tleScsIHJhd01lbWVudG8sIDMsIGVkaXRvckdyb3VwU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9zb21lL2ZvbGRlci9maWxlLTEudHh0Jyk7XG5cdFx0bWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGVzdEdyb3VwMCwgcmVzb3VyY2UsIHsgbGluZTogMSB9KTtcblxuXHRcdGxldCByZXMgPSBtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCByZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcyEubGluZSwgMSk7XG5cblx0XHRyZXMgPSBtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAxLCByZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcyEubGluZSwgMSk7XG5cblx0XHRtZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAwLCByZXNvdXJjZSwgeyBsaW5lOiAzIH0pO1xuXG5cdFx0cmVzID0gbWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGVzdEdyb3VwMSwgcmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMhLmxpbmUsIDMpO1xuXG5cdFx0bWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGVzdEdyb3VwMSwgcmVzb3VyY2UsIHsgbGluZTogMSB9KTtcblxuXHRcdHJlcyA9IG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDEsIHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzIS5saW5lLCAxKTtcblxuXHRcdG1lbWVudG8uY2xlYXJFZGl0b3JTdGF0ZShyZXNvdXJjZSwgdGVzdEdyb3VwMCk7XG5cdFx0bWVtZW50by5jbGVhckVkaXRvclN0YXRlKHJlc291cmNlLCB0ZXN0R3JvdXAxKTtcblxuXHRcdHJlcyA9IG1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRlc3RHcm91cDEsIHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzIS5saW5lLCAxKTtcblxuXHRcdG1lbWVudG8uY2xlYXJFZGl0b3JTdGF0ZShyZXNvdXJjZSk7XG5cblx0XHRyZXMgPSBtZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0ZXN0R3JvdXAxLCByZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdXb3Jrc3BhY2VUcnVzdFJlcXVpcmVkRWRpdG9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y2xhc3MgVHJ1c3RSZXF1aXJlZFRlc3RFZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblx0XHRcdGNvbnN0cnVjdG9yKGdyb3VwOiBJRWRpdG9yR3JvdXAsIEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSkge1xuXHRcdFx0XHRzdXBlcignVGVzdEVkaXRvcicsIGdyb3VwLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRoZW1lU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBnZXRJZCgpOiBzdHJpbmcgeyByZXR1cm4gJ3RydXN0UmVxdWlyZWRUZXN0RWRpdG9yJzsgfVxuXHRcdFx0bGF5b3V0KCk6IHZvaWQgeyB9XG5cdFx0XHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKCk6IGFueSB7IH1cblx0XHR9XG5cblx0XHRjbGFzcyBUcnVzdFJlcXVpcmVkVGVzdElucHV0IGV4dGVuZHMgRWRpdG9ySW5wdXQge1xuXG5cdFx0XHRyZWFkb25seSByZXNvdXJjZSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gJ3RydXN0UmVxdWlyZWRUZXN0SW5wdXQnO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIHtcblx0XHRcdFx0cmV0dXJuIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlcXVpcmVzVHJ1c3Q7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHJlc29sdmUoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VUcnVzdFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCB3b3Jrc3BhY2VUcnVzdFNlcnZpY2UpO1xuXHRcdHdvcmtzcGFjZVRydXN0U2VydmljZS5zZXRXb3Jrc3BhY2VUcnVzdChmYWxzZSk7XG5cblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0gYXdhaXQgY3JlYXRlRWRpdG9yUGFydChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvckdyb3Vwc1NlcnZpY2UsIGVkaXRvclBhcnQpO1xuXG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JTZXJ2aWNlLCB1bmRlZmluZWQpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gZWRpdG9yUGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGVkaXRvckRlc2NyaXB0b3IgPSBFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoVHJ1c3RSZXF1aXJlZFRlc3RFZGl0b3IsICdpZDEnLCAnbmFtZScpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JSZWdpc3RyeS5yZWdpc3RlckVkaXRvclBhbmUoZWRpdG9yRGVzY3JpcHRvciwgW25ldyBTeW5jRGVzY3JpcHRvcihUcnVzdFJlcXVpcmVkVGVzdElucHV0KV0pKTtcblxuXHRcdGNvbnN0IHRlc3RJbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVHJ1c3RSZXF1aXJlZFRlc3RJbnB1dCgpKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IodGVzdElucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0SWQoKSwgV29ya3NwYWNlVHJ1c3RSZXF1aXJlZFBsYWNlaG9sZGVyRWRpdG9yLklEKTtcblxuXHRcdGNvbnN0IGdldEVkaXRvclBhbmVJZEFzeW5jID0gKCkgPT4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUoZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0SWQoKSk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHR3b3Jrc3BhY2VUcnVzdFNlcnZpY2Uuc2V0V29ya3NwYWNlVHJ1c3QodHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZ2V0RWRpdG9yUGFuZUlkQXN5bmMoKSwgJ3RydXN0UmVxdWlyZWRUZXN0RWRpdG9yJyk7XG5cblx0XHR3b3Jrc3BhY2VUcnVzdFNlcnZpY2Uuc2V0V29ya3NwYWNlVHJ1c3QoZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBnZXRFZGl0b3JQYW5lSWRBc3luYygpLCBXb3Jrc3BhY2VUcnVzdFJlcXVpcmVkUGxhY2Vob2xkZXJFZGl0b3IuSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVkscUJBQXFCO0FBQzFDLFNBQVMsK0NBQStDO0FBQ3hELFNBQW9ELGtCQUFrQiwrQkFBK0Q7QUFFckksU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0IscUJBQXFCLHlCQUF5Qiw0QkFBNEIsaUJBQWlCLGtCQUFrQiw0Q0FBNEM7QUFDak0sU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxXQUFXO0FB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
