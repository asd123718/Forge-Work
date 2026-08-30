import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
import { EditorResolverService } from "../../browser/editorResolverService.js";
import { IEditorGroupsService } from "../../common/editorGroupsService.js";
import { diffEditorsAssociationsAgentsWindowDefault, IEditorResolverService, ResolvedStatus, RegisteredEditorPriority, diffEditorsAssociationsSettingId, editorsAssociationsSettingId } from "../../common/editorResolverService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { createEditorPart, TestFileEditorInput, TestServiceAccessor, workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
suite("EditorResolverService", () => {
  test("Agents window diff editor default follows the Markdown editor setting", () => {
    assert.deepStrictEqual({
      enabled: diffEditorsAssociationsAgentsWindowDefault({ markdownDefaultEditor: true }),
      disabled: diffEditorsAssociationsAgentsWindowDefault({ markdownDefaultEditor: false })
    }, {
      enabled: { "*.md": "vscode.markdown.editor" },
      disabled: { "*.md": "vscode.markdown.preview.editor" }
    });
  });
  const TEST_EDITOR_INPUT_ID = "testEditorInputForEditorResolverService";
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  async function createEditorResolverService(instantiationService = workbenchInstantiationService(void 0, disposables)) {
    const part = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, part);
    const editorResolverService = instantiationService.createInstance(EditorResolverService);
    instantiationService.stub(IEditorResolverService, editorResolverService);
    disposables.add(editorResolverService);
    return [part, editorResolverService, instantiationService.createInstance(TestServiceAccessor)];
  }
  function constructDisposableFileEditorInput(uri, typeId, store) {
    const editor = new TestFileEditorInput(uri, typeId);
    store.add(editor);
    return editor;
  }
  function constructDisposableDiffEditorInput(accessor, original, modified, typeId) {
    return accessor.instantiationService.createInstance(
      DiffEditorInput,
      "name",
      "description",
      constructDisposableFileEditorInput(original.resource ?? URI.from({ scheme: Schemas.untitled }), typeId, disposables),
      constructDisposableFileEditorInput(modified.resource ?? URI.from({ scheme: Schemas.untitled }), typeId, disposables),
      void 0
    );
  }
  test("Simple Resolve", async () => {
    const [part, service] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
      }
    );
    const resultingResolution = await service.resolveEditor({ resource: URI.file("my://resource-basics.test") }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, TEST_EDITOR_INPUT_ID);
      resultingResolution.editor.dispose();
    }
    registeredEditor.dispose();
  });
  test("singlePerResource finds editors by preferred resource", async () => {
    const [part, service] = await createEditorResolverService();
    const resource = URI.file("/workspace/index.test");
    const editorId = "TEST_EDITOR";
    const existingEditor = constructDisposableFileEditorInput(URI.from({ scheme: Schemas.vscodeBrowser, path: "browser-id" }), editorId, disposables);
    Object.defineProperty(existingEditor, "preferredResource", { value: resource });
    await part.activeGroup.openEditor(existingEditor);
    let createCount = 0;
    disposables.add(service.registerEditor(
      "*.test",
      {
        id: editorId,
        label: "Test Editor Label",
        priority: RegisteredEditorPriority.default
      },
      {
        singlePerResource: true
      },
      {
        createEditorInput: () => {
          createCount++;
          return { editor: constructDisposableFileEditorInput(resource, editorId, disposables) };
        }
      }
    ));
    const result = await service.resolveEditor({ resource, options: { override: editorId } }, part.activeGroup);
    assert.ok(result && result !== ResolvedStatus.ABORT && result !== ResolvedStatus.NONE);
    assert.deepStrictEqual({
      reusedExistingEditor: result.editor === existingEditor,
      createCount
    }, {
      reusedExistingEditor: true,
      createCount: 0
    });
  });
  test("Untitled Resolve", async () => {
    const UNTITLED_TEST_EDITOR_INPUT_ID = "UNTITLED_TEST_INPUT";
    const [part, service] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
        createUntitledEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(resource ? resource : URI.from({ scheme: Schemas.untitled }), UNTITLED_TEST_EDITOR_INPUT_ID) })
      }
    );
    let resultingResolution = await service.resolveEditor({ resource: void 0 }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.strictEqual(typeof resultingResolution, "number");
    resultingResolution = await service.resolveEditor({ resource: URI.from({ scheme: Schemas.untitled, path: "foo.test" }) }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
      resultingResolution.editor.dispose();
    }
    resultingResolution = await service.resolveEditor({ resource: URI.file("/fake.test"), forceUntitled: true }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
      resultingResolution.editor.dispose();
    }
    registeredEditor.dispose();
  });
  test("Side by side Resolve", async () => {
    const [part, service] = await createEditorResolverService();
    const registeredEditorPrimary = service.registerEditor(
      "*.test-primary",
      {
        id: "TEST_EDITOR_PRIMARY",
        label: "Test Editor Label Primary",
        detail: "Test Editor Details Primary",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) })
      }
    );
    const registeredEditorSecondary = service.registerEditor(
      "*.test-secondary",
      {
        id: "TEST_EDITOR_SECONDARY",
        label: "Test Editor Label Secondary",
        detail: "Test Editor Details Secondary",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) })
      }
    );
    const resultingResolution = await service.resolveEditor({
      primary: { resource: URI.file("my://resource-basics.test-primary") },
      secondary: { resource: URI.file("my://resource-basics.test-secondary") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editorinputs.sidebysideEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    registeredEditorPrimary.dispose();
    registeredEditorSecondary.dispose();
  });
  test("Diff editor Resolve", async () => {
    const [part, service, accessor] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test-diff",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original, options }, group) => ({
          editor: accessor.instantiationService.createInstance(
            DiffEditorInput,
            "name",
            "description",
            constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
            constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
            void 0
          )
        })
      }
    );
    const resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-diff") },
      modified: { resource: URI.file("my://resource-basics.test-diff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    registeredEditor.dispose();
  });
  test("Diff editor Resolve - Falls back to editor associations", async () => {
    const CUSTOM_EDITOR_INPUT_ID = "testCustomEditorInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.test-diff-association": "TEST_EDITOR"
        }
      })
    }, disposables);
    const [part, service, accessor] = await createEditorResolverService(instantiationService);
    let customDiffCounter = 0;
    let defaultDiffCounter = 0;
    const defaultRegisteredEditor = service.registerEditor(
      "*",
      {
        id: "default",
        label: "Default Editor",
        detail: "Default",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          defaultDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, TEST_EDITOR_INPUT_ID) };
        }
      }
    );
    const customRegisteredEditor = service.registerEditor(
      "*.test-diff-association",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, CUSTOM_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          customDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, CUSTOM_EDITOR_INPUT_ID) };
        }
      }
    );
    const resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("resource-basics.test-diff-association") },
      modified: { resource: URI.file("resource-basics.test-diff-association") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(customDiffCounter, 1);
      assert.strictEqual(defaultDiffCounter, 0);
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    defaultRegisteredEditor.dispose();
    customRegisteredEditor.dispose();
  });
  test("Diff editor Resolve - Diff associations override editor associations", async () => {
    const EDITOR_ASSOCIATION_INPUT_ID = "testEditorAssociationInput";
    const DIFF_ASSOCIATION_INPUT_ID = "testDiffAssociationInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.test-diff-association": "TEST_EDITOR"
        },
        [diffEditorsAssociationsSettingId]: {
          "*.test-diff-association": "TEST_DIFF_EDITOR"
        }
      })
    }, disposables);
    const [part, service, accessor] = await createEditorResolverService(instantiationService);
    let editorAssociationDiffCounter = 0;
    let diffAssociationDiffCounter = 0;
    const editorAssociationRegisteredEditor = service.registerEditor(
      "*.test-diff-association",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, EDITOR_ASSOCIATION_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          editorAssociationDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, EDITOR_ASSOCIATION_INPUT_ID) };
        }
      }
    );
    const diffAssociationRegisteredEditor = service.registerEditor(
      "*.test-diff-association",
      {
        id: "TEST_DIFF_EDITOR",
        label: "Test Diff Editor Label",
        detail: "Test Diff Editor Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, DIFF_ASSOCIATION_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          diffAssociationDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, DIFF_ASSOCIATION_INPUT_ID) };
        }
      }
    );
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("resource-basics.test-diff-association") },
      modified: { resource: URI.file("resource-basics.test-diff-association") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    assert.notStrictEqual(typeof diffResolution, "number");
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(editorAssociationDiffCounter, 0);
      assert.strictEqual(diffAssociationDiffCounter, 1);
      diffResolution.editor.dispose();
    } else {
      assert.fail();
    }
    const editorResolution = await service.resolveEditor({ resource: URI.file("resource-basics.test-diff-association") }, part.activeGroup);
    assert.ok(editorResolution);
    assert.notStrictEqual(typeof editorResolution, "number");
    if (editorResolution !== ResolvedStatus.ABORT && editorResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(editorResolution.editor.typeId, EDITOR_ASSOCIATION_INPUT_ID);
      editorResolution.editor.dispose();
    } else {
      assert.fail();
    }
    editorAssociationRegisteredEditor.dispose();
    diffAssociationRegisteredEditor.dispose();
  });
  test("Editor Resolve - editorAssociations only select an `explicit` editor in the associated mode", async () => {
    const DEFAULT_DIFF_INPUT_ID = "testDefaultDiffInput";
    const EXPLICIT_DIFF_INPUT_ID = "testExplicitDiffInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.test-explicit-diff": "EXPLICIT_DIFF_EDITOR"
        }
      })
    }, disposables);
    const [part, service, accessor] = await createEditorResolverService(instantiationService);
    let defaultDiffCounter = 0;
    let explicitDiffCounter = 0;
    const defaultRegisteredEditor = service.registerEditor(
      "*",
      {
        id: "default",
        label: "Default Editor",
        detail: "Default",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          defaultDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, DEFAULT_DIFF_INPUT_ID) };
        }
      }
    );
    const explicitDiffRegisteredEditor = service.registerEditor(
      "*.test-explicit-diff",
      {
        id: "EXPLICIT_DIFF_EDITOR",
        label: "Explicit Diff Editor Label",
        detail: "Explicit Diff Editor Details",
        priority: {
          editor: RegisteredEditorPriority.explicit,
          diff: RegisteredEditorPriority.explicit
        }
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, EXPLICIT_DIFF_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          explicitDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, EXPLICIT_DIFF_INPUT_ID) };
        }
      }
    );
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("resource-basics.test-explicit-diff") },
      modified: { resource: URI.file("resource-basics.test-explicit-diff") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    assert.notStrictEqual(typeof diffResolution, "number");
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(explicitDiffCounter, 0);
      assert.strictEqual(defaultDiffCounter, 1);
      diffResolution.editor.dispose();
    } else {
      assert.fail();
    }
    const editorResolution = await service.resolveEditor({ resource: URI.file("resource-basics.test-explicit-diff") }, part.activeGroup);
    assert.ok(editorResolution);
    assert.notStrictEqual(typeof editorResolution, "number");
    if (editorResolution !== ResolvedStatus.ABORT && editorResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(editorResolution.editor.typeId, EXPLICIT_DIFF_INPUT_ID);
      editorResolution.editor.dispose();
    } else {
      assert.fail();
    }
    defaultRegisteredEditor.dispose();
    explicitDiffRegisteredEditor.dispose();
  });
  test("Diff editor Resolve - diffEditorAssociations select an `explicit` diff editor", async () => {
    const DEFAULT_DIFF_INPUT_ID = "testDefaultDiffInput";
    const EXPLICIT_DIFF_INPUT_ID = "testExplicitDiffInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [diffEditorsAssociationsSettingId]: {
          "*.test-explicit-diff": "EXPLICIT_DIFF_EDITOR"
        }
      })
    }, disposables);
    const [part, service, accessor] = await createEditorResolverService(instantiationService);
    let defaultDiffCounter = 0;
    let explicitDiffCounter = 0;
    const defaultRegisteredEditor = service.registerEditor(
      "*",
      {
        id: "default",
        label: "Default Editor",
        detail: "Default",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          defaultDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, DEFAULT_DIFF_INPUT_ID) };
        }
      }
    );
    const explicitDiffRegisteredEditor = service.registerEditor(
      "*.test-explicit-diff",
      {
        id: "EXPLICIT_DIFF_EDITOR",
        label: "Explicit Diff Editor Label",
        detail: "Explicit Diff Editor Details",
        priority: {
          editor: RegisteredEditorPriority.option,
          diff: RegisteredEditorPriority.explicit
        }
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, EXPLICIT_DIFF_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          explicitDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, EXPLICIT_DIFF_INPUT_ID) };
        }
      }
    );
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("resource-basics.test-explicit-diff") },
      modified: { resource: URI.file("resource-basics.test-explicit-diff") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    assert.notStrictEqual(typeof diffResolution, "number");
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(defaultDiffCounter, 0);
      assert.strictEqual(explicitDiffCounter, 1);
      diffResolution.editor.dispose();
    } else {
      assert.fail();
    }
    defaultRegisteredEditor.dispose();
    explicitDiffRegisteredEditor.dispose();
  });
  test("getBinaryDiffFallbackEditor returns a diff-capable `explicit` editor and ignores non-diff editors", async () => {
    const [, service] = await createEditorResolverService();
    const explicitWithDiff = service.registerEditor(
      "*.bin",
      {
        id: "BINARY_EDITOR",
        label: "Binary Editor",
        detail: "Binary Editor Details",
        priority: {
          editor: RegisteredEditorPriority.default,
          diff: RegisteredEditorPriority.explicit
        }
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, "binaryInput", disposables) }),
        createDiffEditorInput: ({ modified, original }) => ({ editor: constructDisposableFileEditorInput(modified.resource ?? original.resource, "binaryDiffInput", disposables) })
      }
    );
    const noDiff = service.registerEditor(
      "*.noDiff",
      {
        id: "NO_DIFF_EDITOR",
        label: "No Diff Editor",
        detail: "No Diff Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, "noDiffInput", disposables) })
      }
    );
    assert.strictEqual(service.getBinaryDiffFallbackEditor(URI.file("file.bin")), "BINARY_EDITOR");
    assert.strictEqual(service.getBinaryDiffFallbackEditor(URI.file("file.noDiff")), void 0);
    assert.strictEqual(service.getBinaryDiffFallbackEditor(URI.file("file.unrelated")), void 0);
    explicitWithDiff.dispose();
    noDiff.dispose();
  });
  test("Diff editor Resolve - Different Types", async () => {
    const [part, service, accessor] = await createEditorResolverService();
    let diffOneCounter = 0;
    let diffTwoCounter = 0;
    let defaultDiffCounter = 0;
    const registeredEditor = service.registerEditor(
      "*.test-diff",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original, options }, group) => {
          diffOneCounter++;
          return {
            editor: accessor.instantiationService.createInstance(
              DiffEditorInput,
              "name",
              "description",
              constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
              constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
              void 0
            )
          };
        }
      }
    );
    const secondRegisteredEditor = service.registerEditor(
      "*.test-secondDiff",
      {
        id: "TEST_EDITOR_2",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
        createDiffEditorInput: ({ modified, original, options }, group) => {
          diffTwoCounter++;
          return {
            editor: accessor.instantiationService.createInstance(
              DiffEditorInput,
              "name",
              "description",
              constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
              constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
              void 0
            )
          };
        }
      }
    );
    const defaultRegisteredEditor = service.registerEditor(
      "*",
      {
        id: "default",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
        createDiffEditorInput: ({ modified, original, options }, group) => {
          defaultDiffCounter++;
          return {
            editor: accessor.instantiationService.createInstance(
              DiffEditorInput,
              "name",
              "description",
              constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
              constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
              void 0
            )
          };
        }
      }
    );
    let resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-diff") },
      modified: { resource: URI.file("my://resource-basics.test-diff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 1);
      assert.strictEqual(diffTwoCounter, 0);
      assert.strictEqual(defaultDiffCounter, 0);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-secondDiff") },
      modified: { resource: URI.file("my://resource-basics.test-secondDiff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 1);
      assert.strictEqual(diffTwoCounter, 1);
      assert.strictEqual(defaultDiffCounter, 0);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-secondDiff") },
      modified: { resource: URI.file("my://resource-basics.test-diff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 1);
      assert.strictEqual(diffTwoCounter, 1);
      assert.strictEqual(defaultDiffCounter, 1);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-diff") },
      modified: { resource: URI.file("my://resource-basics.test-secondDiff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 1);
      assert.strictEqual(diffTwoCounter, 1);
      assert.strictEqual(defaultDiffCounter, 2);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-secondDiff") },
      modified: { resource: URI.file("my://resource-basics.test-diff") },
      options: { override: "TEST_EDITOR" }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 2);
      assert.strictEqual(diffTwoCounter, 1);
      assert.strictEqual(defaultDiffCounter, 2);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    registeredEditor.dispose();
    secondRegisteredEditor.dispose();
    defaultRegisteredEditor.dispose();
  });
  test("Registry & Events", async () => {
    const [, service] = await createEditorResolverService();
    let eventCounter = 0;
    disposables.add(service.onDidChangeEditorRegistrations(() => {
      eventCounter++;
    }));
    const editors = service.getEditors();
    const registeredEditor = service.registerEditor(
      "*.test",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
      }
    );
    assert.strictEqual(eventCounter, 1);
    assert.strictEqual(service.getEditors().length, editors.length + 1);
    assert.strictEqual(service.getEditors().some((editor) => editor.id === "TEST_EDITOR"), true);
    registeredEditor.dispose();
    assert.strictEqual(eventCounter, 2);
    assert.strictEqual(service.getEditors().length, editors.length);
    assert.strictEqual(service.getEditors().some((editor) => editor.id === "TEST_EDITOR"), false);
  });
  test("getEditors excludes exclusive registrations before deduplicating editor IDs", async () => {
    const [, service] = await createEditorResolverService();
    const factory = {
      createEditorInput: ({ resource }) => ({ editor: new TestFileEditorInput(resource, TEST_EDITOR_INPUT_ID) })
    };
    disposables.add(service.registerEditor("exclusive:/**", {
      id: "test.multiPriority",
      label: "Multi-Priority Editor",
      priority: RegisteredEditorPriority.exclusive
    }, {}, factory));
    disposables.add(service.registerEditor("file:/**/*.html", {
      id: "test.multiPriority",
      label: "Multi-Priority Editor",
      priority: RegisteredEditorPriority.option
    }, {}, factory));
    assert.deepStrictEqual({
      all: service.getEditors().filter((editor) => editor.id === "test.multiPriority"),
      associationCandidates: service.getEditors({ excludeExclusiveEditors: true }).filter((editor) => editor.id === "test.multiPriority")
    }, {
      all: [{
        id: "test.multiPriority",
        label: "Multi-Priority Editor",
        detail: void 0,
        priority: {
          editor: RegisteredEditorPriority.exclusive,
          diff: RegisteredEditorPriority.exclusive,
          merge: RegisteredEditorPriority.exclusive
        }
      }],
      associationCandidates: [{
        id: "test.multiPriority",
        label: "Multi-Priority Editor",
        detail: void 0,
        priority: {
          editor: RegisteredEditorPriority.option,
          diff: RegisteredEditorPriority.option,
          merge: RegisteredEditorPriority.option
        }
      }]
    });
  });
  test("editor associations only apply where the registered editor supports the resource", async () => {
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.html": "test.fileOnly"
        }
      })
    }, disposables);
    const [part, service] = await createEditorResolverService(instantiationService);
    disposables.add(service.registerEditor("*", {
      id: "test.default",
      label: "Default Editor",
      priority: RegisteredEditorPriority.builtin
    }, {}, {
      createEditorInput: ({ resource }) => ({ editor: new TestFileEditorInput(resource, "test.defaultInput") })
    }));
    disposables.add(service.registerEditor("file:/**/*.html", {
      id: "test.fileOnly",
      label: "File-Only Editor",
      priority: RegisteredEditorPriority.option
    }, {
      canSupportResource: (resource) => resource.scheme === Schemas.file
    }, {
      createEditorInput: ({ resource }) => ({ editor: new TestFileEditorInput(resource, "test.fileOnlyInput") })
    }));
    const fileResult = await service.resolveEditor({ resource: URI.file("/workspace/index.html") }, part.activeGroup);
    const remoteResource = URI.parse("vscode-remote://host/workspace/index.html");
    const remoteCandidates = service.getEditors(remoteResource).map((editor) => editor.id);
    const remoteResult = await service.resolveEditor({ resource: remoteResource }, part.activeGroup);
    assert.ok(fileResult !== ResolvedStatus.ABORT && fileResult !== ResolvedStatus.NONE);
    assert.ok(remoteResult !== ResolvedStatus.ABORT && remoteResult !== ResolvedStatus.NONE);
    assert.deepStrictEqual({
      file: fileResult.editor.typeId,
      remote: remoteResult.editor.typeId,
      remoteCandidates
    }, {
      file: "test.fileOnlyInput",
      remote: "test.defaultInput",
      remoteCandidates: ["test.default"]
    });
    fileResult.editor.dispose();
    remoteResult.editor.dispose();
  });
  test("getEditors excludes inactive universal optional editors when requested", async () => {
    const [, service] = await createEditorResolverService();
    const resource = URI.file("/workspace/index.html");
    const factory = {
      createEditorInput: ({ resource: resource2 }) => ({ editor: new TestFileEditorInput(resource2, TEST_EDITOR_INPUT_ID) })
    };
    disposables.add(service.registerEditor("*", {
      id: "test.universalOptional",
      label: "Universal Optional",
      priority: RegisteredEditorPriority.option
    }, {}, factory));
    disposables.add(service.registerEditor("*.html", {
      id: "test.specificOptional",
      label: "Specific Optional",
      priority: RegisteredEditorPriority.option
    }, {}, factory));
    const relevantIds = (currentEditorId) => service.getEditors(resource, {
      excludeUnconfiguredUniversalOptionalEditors: true,
      currentEditorId
    }).map((editor) => editor.id).filter((id) => id.startsWith("test."));
    assert.deepStrictEqual({
      all: service.getEditors(resource).map((editor) => editor.id).filter((id) => id.startsWith("test.")),
      filtered: relevantIds(),
      currentUniversal: relevantIds("test.universalOptional"),
      diff: service.getEditors(resource, {
        excludeUnconfiguredUniversalOptionalEditors: true,
        isDiffEditor: true
      }).map((editor) => editor.id).filter((id) => id.startsWith("test."))
    }, {
      all: ["test.specificOptional", "test.universalOptional"],
      filtered: ["test.specificOptional"],
      currentUniversal: ["test.specificOptional", "test.universalOptional"],
      diff: []
    });
  });
  test("getEditors uses the effective diff priority", async () => {
    const [, service] = await createEditorResolverService();
    const resource = URI.file("/workspace/index.html");
    disposables.add(service.registerEditor("*.html", {
      id: "test.exclusiveDiff",
      label: "Exclusive Diff",
      priority: {
        editor: RegisteredEditorPriority.option,
        diff: RegisteredEditorPriority.exclusive
      }
    }, {}, {
      createEditorInput: ({ resource: resource2 }) => ({ editor: new TestFileEditorInput(resource2, TEST_EDITOR_INPUT_ID) }),
      createDiffEditorInput: () => {
        throw new Error("Unexpected diff editor creation.");
      }
    }));
    assert.deepStrictEqual({
      editor: service.getEditors(resource).map((editor) => editor.id).filter((id) => id.startsWith("test.")),
      diff: service.getEditors(resource, { isDiffEditor: true }).map((editor) => editor.id).filter((id) => id.startsWith("test."))
    }, {
      editor: ["test.exclusiveDiff"],
      diff: []
    });
  });
  test("getEditors preserves configured universal optional editors", async () => {
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.html": "test.universalOptional"
        }
      })
    }, disposables);
    const [, service] = await createEditorResolverService(instantiationService);
    const resource = URI.file("/workspace/index.html");
    disposables.add(service.registerEditor("*", {
      id: "test.universalOptional",
      label: "Universal Optional",
      priority: RegisteredEditorPriority.option
    }, {}, {
      createEditorInput: ({ resource: resource2 }) => ({ editor: new TestFileEditorInput(resource2, TEST_EDITOR_INPUT_ID) })
    }));
    assert.deepStrictEqual(
      service.getEditors(resource, { excludeUnconfiguredUniversalOptionalEditors: true }).map((editor) => editor.id).filter((id) => id.startsWith("test.")),
      ["test.universalOptional"]
    );
  });
  test("Multiple registrations to same glob and id #155859", async () => {
    const [part, service, accessor] = await createEditorResolverService();
    const testEditorInfo = {
      id: "TEST_EDITOR",
      label: "Test Editor Label",
      detail: "Test Editor Details",
      priority: RegisteredEditorPriority.default
    };
    const registeredSingleEditor = service.registerEditor(
      "*.test",
      testEditorInfo,
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
      }
    );
    const registeredDiffEditor = service.registerEditor(
      "*.test",
      testEditorInfo,
      {},
      {
        createDiffEditorInput: ({ modified, original, options }, group) => ({
          editor: accessor.instantiationService.createInstance(
            DiffEditorInput,
            "name",
            "description",
            constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
            constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
            void 0
          )
        })
      }
    );
    let resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test") },
      modified: { resource: URI.file("my://resource-basics.test") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    registeredDiffEditor.dispose();
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test") },
      modified: { resource: URI.file("my://resource-basics.test") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.strictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.NONE) {
      assert.fail();
    }
    registeredSingleEditor.dispose();
  });
  test("User-configured editor association resolves on first startup with empty cache #244597", async () => {
    const CUSTOM_EDITOR_INPUT_ID = "testCustomEditorInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.md": "CUSTOM_MD_EDITOR"
        }
      })
    }, disposables);
    const part = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, part);
    const editorResolverService = instantiationService.createInstance(EditorResolverService);
    disposables.add(editorResolverService);
    const defaultEditor = editorResolverService.registerEditor(
      "*",
      {
        id: "default",
        label: "Default Editor",
        detail: "Default",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
      }
    );
    const customEditor = editorResolverService.registerEditor(
      "*.md",
      {
        id: "CUSTOM_MD_EDITOR",
        label: "Markdown Preview",
        detail: "Markdown Preview Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), CUSTOM_EDITOR_INPUT_ID) })
      }
    );
    const resultingResolution = await editorResolverService.resolveEditor(
      { resource: URI.file("test.md") },
      part.activeGroup
    );
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(
        resultingResolution.editor.typeId,
        CUSTOM_EDITOR_INPUT_ID,
        "Should resolve to custom editor when user has configured editor association"
      );
      resultingResolution.editor.dispose();
    } else {
      assert.fail("Expected editor to resolve successfully");
    }
    defaultEditor.dispose();
    customEditor.dispose();
  });
  test("Diff editor Resolve - priority.diff overrides priority.editor for diffs", async () => {
    const CUSTOM_EDITOR_INPUT_ID = "testCustomEditorForDiffPriority";
    const [part, service, accessor] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test-diff-priority",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: {
          editor: RegisteredEditorPriority.default,
          diff: RegisteredEditorPriority.option,
          merge: RegisteredEditorPriority.default
        }
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), CUSTOM_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original, options }, group) => ({
          editor: accessor.instantiationService.createInstance(
            DiffEditorInput,
            "name",
            "description",
            constructDisposableFileEditorInput(URI.parse(original.toString()), CUSTOM_EDITOR_INPUT_ID, disposables),
            constructDisposableFileEditorInput(URI.parse(modified.toString()), CUSTOM_EDITOR_INPUT_ID, disposables),
            void 0
          )
        })
      }
    );
    const editorResolution = await service.resolveEditor({ resource: URI.file("my://resource.test-diff-priority") }, part.activeGroup);
    assert.ok(editorResolution);
    assert.notStrictEqual(typeof editorResolution, "number");
    if (editorResolution !== ResolvedStatus.ABORT && editorResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(editorResolution.editor.typeId, CUSTOM_EDITOR_INPUT_ID);
      editorResolution.editor.dispose();
    } else {
      assert.fail("Expected editor to resolve successfully");
    }
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource.test-diff-priority") },
      modified: { resource: URI.file("my://resource.test-diff-priority") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.notStrictEqual(
        diffResolution.editor.typeId,
        CUSTOM_EDITOR_INPUT_ID,
        "Custom editor with priority.diff:option should not be used for diffs"
      );
      diffResolution.editor.dispose();
    }
    registeredEditor.dispose();
  });
  test("Diff editor Resolve - string priority expands to diff priority", async () => {
    const CUSTOM_EDITOR_INPUT_ID = "testCustomEditorNoDiffPriority";
    const [part, service, accessor] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test-no-diff-priority",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), CUSTOM_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original, options }, group) => ({
          editor: accessor.instantiationService.createInstance(
            DiffEditorInput,
            "name",
            "description",
            constructDisposableFileEditorInput(URI.parse(original.toString()), CUSTOM_EDITOR_INPUT_ID, disposables),
            constructDisposableFileEditorInput(URI.parse(modified.toString()), CUSTOM_EDITOR_INPUT_ID, disposables),
            void 0
          )
        })
      }
    );
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource.test-no-diff-priority") },
      modified: { resource: URI.file("my://resource.test-no-diff-priority") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    assert.notStrictEqual(typeof diffResolution, "number");
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffResolution.editor.typeId, "workbench.editors.diffEditorInput");
      diffResolution.editor.dispose();
    } else {
      assert.fail("Expected diff editor to resolve successfully");
    }
    registeredEditor.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGVkaXRvclJlc29sdmVyU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRvclBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNBZ2VudHNXaW5kb3dEZWZhdWx0LCBFZGl0b3JJbnB1dEZhY3RvcnlPYmplY3QsIElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIFJlc29sdmVkU3RhdHVzLCBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHksIGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkLCBlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFZGl0b3JQYXJ0LCBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLCBUZXN0RmlsZUVkaXRvcklucHV0LCBUZXN0U2VydmljZUFjY2Vzc29yLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5zdWl0ZSgnRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlJywgKCkgPT4ge1xuXHR0ZXN0KCdBZ2VudHMgd2luZG93IGRpZmYgZWRpdG9yIGRlZmF1bHQgZm9sbG93cyB0aGUgTWFya2Rvd24gZWRpdG9yIHNldHRpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbmFibGVkOiBkaWZmRWRpdG9yc0Fzc29jaWF0aW9uc0FnZW50c1dpbmRvd0RlZmF1bHQoeyBtYXJrZG93bkRlZmF1bHRFZGl0b3I6IHRydWUgfSksXG5cdFx0XHRkaXNhYmxlZDogZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNBZ2VudHNXaW5kb3dEZWZhdWx0KHsgbWFya2Rvd25EZWZhdWx0RWRpdG9yOiBmYWxzZSB9KSxcblx0XHR9LCB7XG5cdFx0XHRlbmFibGVkOiB7ICcqLm1kJzogJ3ZzY29kZS5tYXJrZG93bi5lZGl0b3InIH0sXG5cdFx0XHRkaXNhYmxlZDogeyAnKi5tZCc6ICd2c2NvZGUubWFya2Rvd24ucHJldmlldy5lZGl0b3InIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0Y29uc3QgVEVTVF9FRElUT1JfSU5QVVRfSUQgPSAndGVzdEVkaXRvcklucHV0Rm9yRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlJztcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpOiBQcm9taXNlPFtFZGl0b3JQYXJ0LCBFZGl0b3JSZXNvbHZlclNlcnZpY2UsIFRlc3RTZXJ2aWNlQWNjZXNzb3JdPiB7XG5cdFx0Y29uc3QgcGFydCA9IGF3YWl0IGNyZWF0ZUVkaXRvclBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JHcm91cHNTZXJ2aWNlLCBwYXJ0KTtcblxuXHRcdGNvbnN0IGVkaXRvclJlc29sdmVyU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclJlc29sdmVyU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCBlZGl0b3JSZXNvbHZlclNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JSZXNvbHZlclNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIFtwYXJ0LCBlZGl0b3JSZXNvbHZlclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTZXJ2aWNlQWNjZXNzb3IpXTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQodXJpOiBVUkksIHR5cGVJZDogc3RyaW5nLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogVGVzdEZpbGVFZGl0b3JJbnB1dCB7XG5cdFx0Y29uc3QgZWRpdG9yID0gbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQodXJpLCB0eXBlSWQpO1xuXHRcdHN0b3JlLmFkZChlZGl0b3IpO1xuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRmdW5jdGlvbiBjb25zdHJ1Y3REaXNwb3NhYmxlRGlmZkVkaXRvcklucHV0KGFjY2Vzc29yOiBUZXN0U2VydmljZUFjY2Vzc29yLCBvcmlnaW5hbDogeyByZWFkb25seSByZXNvdXJjZT86IFVSSSB9LCBtb2RpZmllZDogeyByZWFkb25seSByZXNvdXJjZT86IFVSSSB9LCB0eXBlSWQ6IHN0cmluZyk6IERpZmZFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIGFjY2Vzc29yLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0RGlmZkVkaXRvcklucHV0LFxuXHRcdFx0J25hbWUnLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJyxcblx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQob3JpZ2luYWwucmVzb3VyY2UgPz8gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQgfSksIHR5cGVJZCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChtb2RpZmllZC5yZXNvdXJjZSA/PyBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCB9KSwgdHlwZUlkLCBkaXNwb3NhYmxlcyksXG5cdFx0XHR1bmRlZmluZWQpO1xuXHR9XG5cblx0dGVzdCgnU2ltcGxlIFJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdCcsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfSksXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdGluZ1Jlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3IoeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QnKSB9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZVBlclJlc291cmNlIGZpbmRzIGVkaXRvcnMgYnkgcHJlZmVycmVkIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvaW5kZXgudGVzdCcpO1xuXHRcdGNvbnN0IGVkaXRvcklkID0gJ1RFU1RfRURJVE9SJztcblx0XHRjb25zdCBleGlzdGluZ0VkaXRvciA9IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQnJvd3NlciwgcGF0aDogJ2Jyb3dzZXItaWQnIH0pLCBlZGl0b3JJZCwgZGlzcG9zYWJsZXMpO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleGlzdGluZ0VkaXRvciwgJ3ByZWZlcnJlZFJlc291cmNlJywgeyB2YWx1ZTogcmVzb3VyY2UgfSk7XG5cdFx0YXdhaXQgcGFydC5hY3RpdmVHcm91cC5vcGVuRWRpdG9yKGV4aXN0aW5nRWRpdG9yKTtcblx0XHRsZXQgY3JlYXRlQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogZWRpdG9ySWQsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHNpbmdsZVBlclJlc291cmNlOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKCkgPT4ge1xuXHRcdFx0XHRcdGNyZWF0ZUNvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHJlc291cmNlLCBlZGl0b3JJZCwgZGlzcG9zYWJsZXMpIH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBvdmVycmlkZTogZWRpdG9ySWQgfSB9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQgJiYgcmVzdWx0ICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiByZXN1bHQgIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmV1c2VkRXhpc3RpbmdFZGl0b3I6IHJlc3VsdC5lZGl0b3IgPT09IGV4aXN0aW5nRWRpdG9yLFxuXHRcdFx0Y3JlYXRlQ291bnRcblx0XHR9LCB7XG5cdFx0XHRyZXVzZWRFeGlzdGluZ0VkaXRvcjogdHJ1ZSxcblx0XHRcdGNyZWF0ZUNvdW50OiAwXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VudGl0bGVkIFJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgVU5USVRMRURfVEVTVF9FRElUT1JfSU5QVVRfSUQgPSAnVU5USVRMRURfVEVTVF9JTlBVVCc7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdCcsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfSksXG5cdFx0XHRcdGNyZWF0ZVVudGl0bGVkRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KChyZXNvdXJjZSA/IHJlc291cmNlIDogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQgfSkpLCBVTlRJVExFRF9URVNUX0VESVRPUl9JTlBVVF9JRCkgfSksXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIFVudHlwZWQgdW50aXRsZWQgLSBubyByZXNvdXJjZVxuXHRcdGxldCByZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHsgcmVzb3VyY2U6IHVuZGVmaW5lZCB9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0Ly8gV2UgZG9uJ3QgZXhwZWN0IHVudGl0bGVkIHRvIG1hdGNoIHRoZSAqLnRlc3QgZ2xvYlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0aW5nUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXG5cdFx0Ly8gVW50eXBlZCB1bnRpdGxlZCAtIHdpdGggdW50aXRsZWQgcmVzb3VyY2Vcblx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiAnZm9vLnRlc3QnIH0pIH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgVU5USVRMRURfVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdFx0cmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIFVudHlwZWQgdW50aXRsZWQgLSBmaWxlIHJlc291cmNlIHdpdGggZm9yY2VVbnRpdGxlZFxuXHRcdHJlc3VsdGluZ1Jlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3IoeyByZXNvdXJjZTogVVJJLmZpbGUoJy9mYWtlLnRlc3QnKSwgZm9yY2VVbnRpdGxlZDogdHJ1ZSB9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsIFVOVElUTEVEX1RFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRyZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnU2lkZSBieSBzaWRlIFJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvclByaW1hcnkgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QtcHJpbWFyeScsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1JfUFJJTUFSWScsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwgUHJpbWFyeScsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMgUHJpbWFyeScsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UocmVzb3VyY2UudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3JTZWNvbmRhcnkgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3Qtc2Vjb25kYXJ5Jyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdURVNUX0VESVRPUl9TRUNPTkRBUlknLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsIFNlY29uZGFyeScsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMgU2Vjb25kYXJ5Jyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0XG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSwgb3B0aW9ucyB9LCBncm91cCkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRwcmltYXJ5OiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1wcmltYXJ5JykgfSxcblx0XHRcdHNlY29uZGFyeTogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3Qtc2Vjb25kYXJ5JykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgJ3dvcmtiZW5jaC5lZGl0b3JpbnB1dHMuc2lkZWJ5c2lkZUVkaXRvcklucHV0Jyk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXHRcdHJlZ2lzdGVyZWRFZGl0b3JQcmltYXJ5LmRpc3Bvc2UoKTtcblx0XHRyZWdpc3RlcmVkRWRpdG9yU2Vjb25kYXJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRGlmZiBlZGl0b3IgUmVzb2x2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdC1kaWZmJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdURVNUX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0XG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSwgb3B0aW9ucyB9LCBncm91cCkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7XG5cdFx0XHRcdFx0ZWRpdG9yOiBhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdERpZmZFZGl0b3JJbnB1dCxcblx0XHRcdFx0XHRcdCduYW1lJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShvcmlnaW5hbC50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG1vZGlmaWVkLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkKVxuXHRcdFx0XHR9KVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmJykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgJ3dvcmtiZW5jaC5lZGl0b3JzLmRpZmZFZGl0b3JJbnB1dCcpO1xuXHRcdFx0cmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgpO1xuXHRcdH1cblx0XHRyZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRGlmZiBlZGl0b3IgUmVzb2x2ZSAtIEZhbGxzIGJhY2sgdG8gZWRpdG9yIGFzc29jaWF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBDVVNUT01fRURJVE9SX0lOUFVUX0lEID0gJ3Rlc3RDdXN0b21FZGl0b3JJbnB1dCc7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRcdFtlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkXToge1xuXHRcdFx0XHRcdCcqLnRlc3QtZGlmZi1hc3NvY2lhdGlvbic6ICdURVNUX0VESVRPUidcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHR9LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0bGV0IGN1c3RvbURpZmZDb3VudGVyID0gMDtcblx0XHRsZXQgZGVmYXVsdERpZmZDb3VudGVyID0gMDtcblxuXHRcdGNvbnN0IGRlZmF1bHRSZWdpc3RlcmVkRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnZGVmYXVsdCcsXG5cdFx0XHRcdGxhYmVsOiAnRGVmYXVsdCBFZGl0b3InLFxuXHRcdFx0XHRkZXRhaWw6ICdEZWZhdWx0Jyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5idWlsdGluXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9KSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsIH0pID0+IHtcblx0XHRcdFx0XHRkZWZhdWx0RGlmZkNvdW50ZXIrKztcblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVEaWZmRWRpdG9ySW5wdXQoYWNjZXNzb3IsIG9yaWdpbmFsLCBtb2RpZmllZCwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgY3VzdG9tUmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdC1kaWZmLWFzc29jaWF0aW9uJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdURVNUX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb25cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCB9KSA9PiB7XG5cdFx0XHRcdFx0Y3VzdG9tRGlmZkNvdW50ZXIrKztcblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVEaWZmRWRpdG9ySW5wdXQoYWNjZXNzb3IsIG9yaWdpbmFsLCBtb2RpZmllZCwgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZi1hc3NvY2lhdGlvbicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ3Jlc291cmNlLWJhc2ljcy50ZXN0LWRpZmYtYXNzb2NpYXRpb24nKSB9XG5cdFx0fSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdGluZ1Jlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0aW5nUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXHRcdGlmIChyZXN1bHRpbmdSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiByZXN1bHRpbmdSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VzdG9tRGlmZkNvdW50ZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHREaWZmQ291bnRlciwgMCk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0ZGVmYXVsdFJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHRcdGN1c3RvbVJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdEaWZmIGVkaXRvciBSZXNvbHZlIC0gRGlmZiBhc3NvY2lhdGlvbnMgb3ZlcnJpZGUgZWRpdG9yIGFzc29jaWF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBFRElUT1JfQVNTT0NJQVRJT05fSU5QVVRfSUQgPSAndGVzdEVkaXRvckFzc29jaWF0aW9uSW5wdXQnO1xuXHRcdGNvbnN0IERJRkZfQVNTT0NJQVRJT05fSU5QVVRfSUQgPSAndGVzdERpZmZBc3NvY2lhdGlvbklucHV0Jztcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0W2VkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWRdOiB7XG5cdFx0XHRcdFx0JyoudGVzdC1kaWZmLWFzc29jaWF0aW9uJzogJ1RFU1RfRURJVE9SJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRbZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWRdOiB7XG5cdFx0XHRcdFx0JyoudGVzdC1kaWZmLWFzc29jaWF0aW9uJzogJ1RFU1RfRElGRl9FRElUT1InXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0fSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JSZXNvbHZlclNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGxldCBlZGl0b3JBc3NvY2lhdGlvbkRpZmZDb3VudGVyID0gMDtcblx0XHRsZXQgZGlmZkFzc29jaWF0aW9uRGlmZkNvdW50ZXIgPSAwO1xuXG5cdFx0Y29uc3QgZWRpdG9yQXNzb2NpYXRpb25SZWdpc3RlcmVkRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0LWRpZmYtYXNzb2NpYXRpb24nLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1RFU1RfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvblxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHJlc291cmNlLCBFRElUT1JfQVNTT0NJQVRJT05fSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwgfSkgPT4ge1xuXHRcdFx0XHRcdGVkaXRvckFzc29jaWF0aW9uRGlmZkNvdW50ZXIrKztcblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVEaWZmRWRpdG9ySW5wdXQoYWNjZXNzb3IsIG9yaWdpbmFsLCBtb2RpZmllZCwgRURJVE9SX0FTU09DSUFUSU9OX0lOUFVUX0lEKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGRpZmZBc3NvY2lhdGlvblJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QtZGlmZi1hc3NvY2lhdGlvbicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9ESUZGX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBEaWZmIEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRGlmZiBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9KSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIERJRkZfQVNTT0NJQVRJT05fSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwgfSkgPT4ge1xuXHRcdFx0XHRcdGRpZmZBc3NvY2lhdGlvbkRpZmZDb3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRGlmZkVkaXRvcklucHV0KGFjY2Vzc29yLCBvcmlnaW5hbCwgbW9kaWZpZWQsIERJRkZfQVNTT0NJQVRJT05fSU5QVVRfSUQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgZGlmZlJlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdyZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmLWFzc29jaWF0aW9uJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZi1hc3NvY2lhdGlvbicpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2soZGlmZlJlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgZGlmZlJlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAoZGlmZlJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIGRpZmZSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yQXNzb2NpYXRpb25EaWZmQ291bnRlciwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkFzc29jaWF0aW9uRGlmZkNvdW50ZXIsIDEpO1xuXHRcdFx0ZGlmZlJlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5maWxlKCdyZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmLWFzc29jaWF0aW9uJykgfSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKGVkaXRvclJlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgZWRpdG9yUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXHRcdGlmIChlZGl0b3JSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiBlZGl0b3JSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCBFRElUT1JfQVNTT0NJQVRJT05fSU5QVVRfSUQpO1xuXHRcdFx0ZWRpdG9yUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgpO1xuXHRcdH1cblxuXHRcdGVkaXRvckFzc29jaWF0aW9uUmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0ZGlmZkFzc29jaWF0aW9uUmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvciBSZXNvbHZlIC0gZWRpdG9yQXNzb2NpYXRpb25zIG9ubHkgc2VsZWN0IGFuIGBleHBsaWNpdGAgZWRpdG9yIGluIHRoZSBhc3NvY2lhdGVkIG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgREVGQVVMVF9ESUZGX0lOUFVUX0lEID0gJ3Rlc3REZWZhdWx0RGlmZklucHV0Jztcblx0XHRjb25zdCBFWFBMSUNJVF9ESUZGX0lOUFVUX0lEID0gJ3Rlc3RFeHBsaWNpdERpZmZJbnB1dCc7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRcdFtlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkXToge1xuXHRcdFx0XHRcdCcqLnRlc3QtZXhwbGljaXQtZGlmZic6ICdFWFBMSUNJVF9ESUZGX0VESVRPUidcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHR9LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0bGV0IGRlZmF1bHREaWZmQ291bnRlciA9IDA7XG5cdFx0bGV0IGV4cGxpY2l0RGlmZkNvdW50ZXIgPSAwO1xuXG5cdFx0Y29uc3QgZGVmYXVsdFJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0bGFiZWw6ICdEZWZhdWx0IEVkaXRvcicsXG5cdFx0XHRcdGRldGFpbDogJ0RlZmF1bHQnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmJ1aWx0aW5cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwgfSkgPT4ge1xuXHRcdFx0XHRcdGRlZmF1bHREaWZmQ291bnRlcisrO1xuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZURpZmZFZGl0b3JJbnB1dChhY2Nlc3Nvciwgb3JpZ2luYWwsIG1vZGlmaWVkLCBERUZBVUxUX0RJRkZfSU5QVVRfSUQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgZXhwbGljaXREaWZmUmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdC1leHBsaWNpdC1kaWZmJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdFWFBMSUNJVF9ESUZGX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnRXhwbGljaXQgRGlmZiBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdFeHBsaWNpdCBEaWZmIEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IHtcblx0XHRcdFx0XHRlZGl0b3I6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leHBsaWNpdCxcblx0XHRcdFx0XHRkaWZmOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhwbGljaXRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHJlc291cmNlLCBFWFBMSUNJVF9ESUZGX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsIH0pID0+IHtcblx0XHRcdFx0XHRleHBsaWNpdERpZmZDb3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRGlmZkVkaXRvcklucHV0KGFjY2Vzc29yLCBvcmlnaW5hbCwgbW9kaWZpZWQsIEVYUExJQ0lUX0RJRkZfSU5QVVRfSUQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Ly8gVGhlIHRleHQtbW9kZSBhc3NvY2lhdGlvbiBkb2VzIG5vdCBvcHQgdGhlIGVkaXRvciBpbnRvIGRpZmYgbW9kZS5cblx0XHRjb25zdCBkaWZmUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ3Jlc291cmNlLWJhc2ljcy50ZXN0LWV4cGxpY2l0LWRpZmYnKSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdyZXNvdXJjZS1iYXNpY3MudGVzdC1leHBsaWNpdC1kaWZmJykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhkaWZmUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiBkaWZmUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXHRcdGlmIChkaWZmUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgZGlmZlJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdERpZmZDb3VudGVyLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZhdWx0RGlmZkNvdW50ZXIsIDEpO1xuXHRcdFx0ZGlmZlJlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5maWxlKCdyZXNvdXJjZS1iYXNpY3MudGVzdC1leHBsaWNpdC1kaWZmJykgfSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKGVkaXRvclJlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgZWRpdG9yUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXHRcdGlmIChlZGl0b3JSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiBlZGl0b3JSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCBFWFBMSUNJVF9ESUZGX0lOUFVUX0lEKTtcblx0XHRcdGVkaXRvclJlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRkZWZhdWx0UmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0ZXhwbGljaXREaWZmUmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RpZmYgZWRpdG9yIFJlc29sdmUgLSBkaWZmRWRpdG9yQXNzb2NpYXRpb25zIHNlbGVjdCBhbiBgZXhwbGljaXRgIGRpZmYgZWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IERFRkFVTFRfRElGRl9JTlBVVF9JRCA9ICd0ZXN0RGVmYXVsdERpZmZJbnB1dCc7XG5cdFx0Y29uc3QgRVhQTElDSVRfRElGRl9JTlBVVF9JRCA9ICd0ZXN0RXhwbGljaXREaWZmSW5wdXQnO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRbZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWRdOiB7XG5cdFx0XHRcdFx0JyoudGVzdC1leHBsaWNpdC1kaWZmJzogJ0VYUExJQ0lUX0RJRkZfRURJVE9SJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRsZXQgZGVmYXVsdERpZmZDb3VudGVyID0gMDtcblx0XHRsZXQgZXhwbGljaXREaWZmQ291bnRlciA9IDA7XG5cblx0XHRjb25zdCBkZWZhdWx0UmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyonLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ2RlZmF1bHQnLFxuXHRcdFx0XHRsYWJlbDogJ0RlZmF1bHQgRWRpdG9yJyxcblx0XHRcdFx0ZGV0YWlsOiAnRGVmYXVsdCcsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuYnVpbHRpblxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHJlc291cmNlLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCB9KSA9PiB7XG5cdFx0XHRcdFx0ZGVmYXVsdERpZmZDb3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRGlmZkVkaXRvcklucHV0KGFjY2Vzc29yLCBvcmlnaW5hbCwgbW9kaWZpZWQsIERFRkFVTFRfRElGRl9JTlBVVF9JRCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCBleHBsaWNpdERpZmZSZWdpc3RlcmVkRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0LWV4cGxpY2l0LWRpZmYnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ0VYUExJQ0lUX0RJRkZfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdFeHBsaWNpdCBEaWZmIEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ0V4cGxpY2l0IERpZmYgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eToge1xuXHRcdFx0XHRcdGVkaXRvcjogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvbixcblx0XHRcdFx0XHRkaWZmOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhwbGljaXRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHJlc291cmNlLCBFWFBMSUNJVF9ESUZGX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsIH0pID0+IHtcblx0XHRcdFx0XHRleHBsaWNpdERpZmZDb3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRGlmZkVkaXRvcklucHV0KGFjY2Vzc29yLCBvcmlnaW5hbCwgbW9kaWZpZWQsIEVYUExJQ0lUX0RJRkZfSU5QVVRfSUQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgZGlmZlJlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdyZXNvdXJjZS1iYXNpY3MudGVzdC1leHBsaWNpdC1kaWZmJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2UtYmFzaWNzLnRlc3QtZXhwbGljaXQtZGlmZicpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2soZGlmZlJlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgZGlmZlJlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAoZGlmZlJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIGRpZmZSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdERpZmZDb3VudGVyLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdERpZmZDb3VudGVyLCAxKTtcblx0XHRcdGRpZmZSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0ZGVmYXVsdFJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHRcdGV4cGxpY2l0RGlmZlJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRCaW5hcnlEaWZmRmFsbGJhY2tFZGl0b3IgcmV0dXJucyBhIGRpZmYtY2FwYWJsZSBgZXhwbGljaXRgIGVkaXRvciBhbmQgaWdub3JlcyBub24tZGlmZiBlZGl0b3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFssIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBleHBsaWNpdFdpdGhEaWZmID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi5iaW4nLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ0JJTkFSWV9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ0JpbmFyeSBFZGl0b3InLFxuXHRcdFx0XHRkZXRhaWw6ICdCaW5hcnkgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eToge1xuXHRcdFx0XHRcdGVkaXRvcjogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHQsXG5cdFx0XHRcdFx0ZGlmZjogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4cGxpY2l0XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgJ2JpbmFyeUlucHV0JywgZGlzcG9zYWJsZXMpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCB9KSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQobW9kaWZpZWQucmVzb3VyY2UgPz8gb3JpZ2luYWwucmVzb3VyY2UhLCAnYmluYXJ5RGlmZklucHV0JywgZGlzcG9zYWJsZXMpIH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIEEgY3VzdG9tIGVkaXRvciB0aGF0IHByb3ZpZGVzIG5vIGRpZmYgZmFjdG9yeSBtdXN0IG5ldmVyIGJlIHVzZWQgYXMgYSBiaW5hcnkgZGlmZiBmYWxsYmFjay5cblx0XHRjb25zdCBub0RpZmYgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLm5vRGlmZicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnTk9fRElGRl9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ05vIERpZmYgRWRpdG9yJyxcblx0XHRcdFx0ZGV0YWlsOiAnTm8gRGlmZiBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHJlc291cmNlLCAnbm9EaWZmSW5wdXQnLCBkaXNwb3NhYmxlcykgfSlcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0QmluYXJ5RGlmZkZhbGxiYWNrRWRpdG9yKFVSSS5maWxlKCdmaWxlLmJpbicpKSwgJ0JJTkFSWV9FRElUT1InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRCaW5hcnlEaWZmRmFsbGJhY2tFZGl0b3IoVVJJLmZpbGUoJ2ZpbGUubm9EaWZmJykpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEJpbmFyeURpZmZGYWxsYmFja0VkaXRvcihVUkkuZmlsZSgnZmlsZS51bnJlbGF0ZWQnKSksIHVuZGVmaW5lZCk7XG5cblx0XHRleHBsaWNpdFdpdGhEaWZmLmRpc3Bvc2UoKTtcblx0XHRub0RpZmYuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdEaWZmIGVkaXRvciBSZXNvbHZlIC0gRGlmZmVyZW50IFR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JSZXNvbHZlclNlcnZpY2UoKTtcblx0XHRsZXQgZGlmZk9uZUNvdW50ZXIgPSAwO1xuXHRcdGxldCBkaWZmVHdvQ291bnRlciA9IDA7XG5cdFx0bGV0IGRlZmF1bHREaWZmQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdC1kaWZmJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdURVNUX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0XG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSwgb3B0aW9ucyB9LCBncm91cCkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwsIG9wdGlvbnMgfSwgZ3JvdXApID0+IHtcblx0XHRcdFx0XHRkaWZmT25lQ291bnRlcisrO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRlZGl0b3I6IGFjY2Vzc29yLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0XHREaWZmRWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0XHRcdCduYW1lJyxcblx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2Uob3JpZ2luYWwudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG1vZGlmaWVkLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCBzZWNvbmRSZWdpc3RlcmVkRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0LXNlY29uZERpZmYnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1RFU1RfRURJVE9SXzInLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsLCBvcHRpb25zIH0sIGdyb3VwKSA9PiB7XG5cdFx0XHRcdFx0ZGlmZlR3b0NvdW50ZXIrKztcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZWRpdG9yOiBhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdFx0RGlmZkVkaXRvcklucHV0LFxuXHRcdFx0XHRcdFx0XHQnbmFtZScsXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG9yaWdpbmFsLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShtb2RpZmllZC50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdFJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvblxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsLCBvcHRpb25zIH0sIGdyb3VwKSA9PiB7XG5cdFx0XHRcdFx0ZGVmYXVsdERpZmZDb3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVkaXRvcjogYWNjZXNzb3IuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0XHRcdERpZmZFZGl0b3JJbnB1dCxcblx0XHRcdFx0XHRcdFx0J25hbWUnLFxuXHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShvcmlnaW5hbC50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UobW9kaWZpZWQudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZClcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGxldCByZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmJykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZPbmVDb3VudGVyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVHdvQ291bnRlciwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdERpZmZDb3VudGVyLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsICd3b3JrYmVuY2guZWRpdG9ycy5kaWZmRWRpdG9ySW5wdXQnKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1zZWNvbmREaWZmJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1zZWNvbmREaWZmJykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZPbmVDb3VudGVyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVHdvQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdERpZmZDb3VudGVyLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsICd3b3JrYmVuY2guZWRpdG9ycy5kaWZmRWRpdG9ySW5wdXQnKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1zZWNvbmREaWZmJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmJykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZPbmVDb3VudGVyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVHdvQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdERpZmZDb3VudGVyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsICd3b3JrYmVuY2guZWRpdG9ycy5kaWZmRWRpdG9ySW5wdXQnKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1zZWNvbmREaWZmJykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZPbmVDb3VudGVyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVHdvQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdERpZmZDb3VudGVyLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsICd3b3JrYmVuY2guZWRpdG9ycy5kaWZmRWRpdG9ySW5wdXQnKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1zZWNvbmREaWZmJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmJykgfSxcblx0XHRcdG9wdGlvbnM6IHsgb3ZlcnJpZGU6ICdURVNUX0VESVRPUicgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZPbmVDb3VudGVyLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVHdvQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdERpZmZDb3VudGVyLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsICd3b3JrYmVuY2guZWRpdG9ycy5kaWZmRWRpdG9ySW5wdXQnKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRyZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRzZWNvbmRSZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRkZWZhdWx0UmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JlZ2lzdHJ5ICYgRXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFssIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cblx0XHRsZXQgZXZlbnRDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZUVkaXRvclJlZ2lzdHJhdGlvbnMoKCkgPT4ge1xuXHRcdFx0ZXZlbnRDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZWRpdG9ycyA9IHNlcnZpY2UuZ2V0RWRpdG9ycygpO1xuXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdCcsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfSlcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWRpdG9ycygpLmxlbmd0aCwgZWRpdG9ycy5sZW5ndGggKyAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFZGl0b3JzKCkuc29tZShlZGl0b3IgPT4gZWRpdG9yLmlkID09PSAnVEVTVF9FRElUT1InKSwgdHJ1ZSk7XG5cblx0XHRyZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVkaXRvcnMoKS5sZW5ndGgsIGVkaXRvcnMubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFZGl0b3JzKCkuc29tZShlZGl0b3IgPT4gZWRpdG9yLmlkID09PSAnVEVTVF9FRElUT1InKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRFZGl0b3JzIGV4Y2x1ZGVzIGV4Y2x1c2l2ZSByZWdpc3RyYXRpb25zIGJlZm9yZSBkZWR1cGxpY2F0aW5nIGVkaXRvciBJRHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgWywgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JSZXNvbHZlclNlcnZpY2UoKTtcblx0XHRjb25zdCBmYWN0b3J5OiBFZGl0b3JJbnB1dEZhY3RvcnlPYmplY3QgPSB7XG5cdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pXG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlckVkaXRvcignZXhjbHVzaXZlOi8qKicsIHtcblx0XHRcdGlkOiAndGVzdC5tdWx0aVByaW9yaXR5Jyxcblx0XHRcdGxhYmVsOiAnTXVsdGktUHJpb3JpdHkgRWRpdG9yJyxcblx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlXG5cdFx0fSwge30sIGZhY3RvcnkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlckVkaXRvcignZmlsZTovKiovKi5odG1sJywge1xuXHRcdFx0aWQ6ICd0ZXN0Lm11bHRpUHJpb3JpdHknLFxuXHRcdFx0bGFiZWw6ICdNdWx0aS1Qcmlvcml0eSBFZGl0b3InLFxuXHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb25cblx0XHR9LCB7fSwgZmFjdG9yeSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhbGw6IHNlcnZpY2UuZ2V0RWRpdG9ycygpLmZpbHRlcihlZGl0b3IgPT4gZWRpdG9yLmlkID09PSAndGVzdC5tdWx0aVByaW9yaXR5JyksXG5cdFx0XHRhc3NvY2lhdGlvbkNhbmRpZGF0ZXM6IHNlcnZpY2UuZ2V0RWRpdG9ycyh7IGV4Y2x1ZGVFeGNsdXNpdmVFZGl0b3JzOiB0cnVlIH0pLmZpbHRlcihlZGl0b3IgPT4gZWRpdG9yLmlkID09PSAndGVzdC5tdWx0aVByaW9yaXR5Jylcblx0XHR9LCB7XG5cdFx0XHRhbGw6IFt7XG5cdFx0XHRcdGlkOiAndGVzdC5tdWx0aVByaW9yaXR5Jyxcblx0XHRcdFx0bGFiZWw6ICdNdWx0aS1Qcmlvcml0eSBFZGl0b3InLFxuXHRcdFx0XHRkZXRhaWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJpb3JpdHk6IHtcblx0XHRcdFx0XHRlZGl0b3I6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmUsXG5cdFx0XHRcdFx0ZGlmZjogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSxcblx0XHRcdFx0XHRtZXJnZTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHRcdGFzc29jaWF0aW9uQ2FuZGlkYXRlczogW3tcblx0XHRcdFx0aWQ6ICd0ZXN0Lm11bHRpUHJpb3JpdHknLFxuXHRcdFx0XHRsYWJlbDogJ011bHRpLVByaW9yaXR5IEVkaXRvcicsXG5cdFx0XHRcdGRldGFpbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwcmlvcml0eToge1xuXHRcdFx0XHRcdGVkaXRvcjogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvbixcblx0XHRcdFx0XHRkaWZmOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uLFxuXHRcdFx0XHRcdG1lcmdlOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uXG5cdFx0XHRcdH1cblx0XHRcdH1dXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBhc3NvY2lhdGlvbnMgb25seSBhcHBseSB3aGVyZSB0aGUgcmVnaXN0ZXJlZCBlZGl0b3Igc3VwcG9ydHMgdGhlIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRbZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZF06IHtcblx0XHRcdFx0XHQnKi5odG1sJzogJ3Rlc3QuZmlsZU9ubHknXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0fSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyonLCB7XG5cdFx0XHRpZDogJ3Rlc3QuZGVmYXVsdCcsXG5cdFx0XHRsYWJlbDogJ0RlZmF1bHQgRWRpdG9yJyxcblx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuYnVpbHRpblxuXHRcdH0sIHt9LCB7XG5cdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgJ3Rlc3QuZGVmYXVsdElucHV0JykgfSlcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJ2ZpbGU6LyoqLyouaHRtbCcsIHtcblx0XHRcdGlkOiAndGVzdC5maWxlT25seScsXG5cdFx0XHRsYWJlbDogJ0ZpbGUtT25seSBFZGl0b3InLFxuXHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb25cblx0XHR9LCB7XG5cdFx0XHRjYW5TdXBwb3J0UmVzb3VyY2U6IHJlc291cmNlID0+IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsICd0ZXN0LmZpbGVPbmx5SW5wdXQnKSB9KVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGZpbGVSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3IoeyByZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvaW5kZXguaHRtbCcpIH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGNvbnN0IHJlbW90ZVJlc291cmNlID0gVVJJLnBhcnNlKCd2c2NvZGUtcmVtb3RlOi8vaG9zdC93b3Jrc3BhY2UvaW5kZXguaHRtbCcpO1xuXHRcdGNvbnN0IHJlbW90ZUNhbmRpZGF0ZXMgPSBzZXJ2aWNlLmdldEVkaXRvcnMocmVtb3RlUmVzb3VyY2UpLm1hcChlZGl0b3IgPT4gZWRpdG9yLmlkKTtcblx0XHRjb25zdCByZW1vdGVSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3IoeyByZXNvdXJjZTogcmVtb3RlUmVzb3VyY2UgfSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKGZpbGVSZXN1bHQgIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIGZpbGVSZXN1bHQgIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpO1xuXHRcdGFzc2VydC5vayhyZW1vdGVSZXN1bHQgIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlbW90ZVJlc3VsdCAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpbGU6IGZpbGVSZXN1bHQuZWRpdG9yLnR5cGVJZCxcblx0XHRcdHJlbW90ZTogcmVtb3RlUmVzdWx0LmVkaXRvci50eXBlSWQsXG5cdFx0XHRyZW1vdGVDYW5kaWRhdGVzXG5cdFx0fSwge1xuXHRcdFx0ZmlsZTogJ3Rlc3QuZmlsZU9ubHlJbnB1dCcsXG5cdFx0XHRyZW1vdGU6ICd0ZXN0LmRlZmF1bHRJbnB1dCcsXG5cdFx0XHRyZW1vdGVDYW5kaWRhdGVzOiBbJ3Rlc3QuZGVmYXVsdCddXG5cdFx0fSk7XG5cdFx0ZmlsZVJlc3VsdC5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdHJlbW90ZVJlc3VsdC5lZGl0b3IuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRFZGl0b3JzIGV4Y2x1ZGVzIGluYWN0aXZlIHVuaXZlcnNhbCBvcHRpb25hbCBlZGl0b3JzIHdoZW4gcmVxdWVzdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFssIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbmRleC5odG1sJyk7XG5cdFx0Y29uc3QgZmFjdG9yeTogRWRpdG9ySW5wdXRGYWN0b3J5T2JqZWN0ID0ge1xuXHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9KVxuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyonLCB7XG5cdFx0XHRpZDogJ3Rlc3QudW5pdmVyc2FsT3B0aW9uYWwnLFxuXHRcdFx0bGFiZWw6ICdVbml2ZXJzYWwgT3B0aW9uYWwnLFxuXHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb25cblx0XHR9LCB7fSwgZmFjdG9yeSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLmh0bWwnLCB7XG5cdFx0XHRpZDogJ3Rlc3Quc3BlY2lmaWNPcHRpb25hbCcsXG5cdFx0XHRsYWJlbDogJ1NwZWNpZmljIE9wdGlvbmFsJyxcblx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uXG5cdFx0fSwge30sIGZhY3RvcnkpKTtcblxuXHRcdGNvbnN0IHJlbGV2YW50SWRzID0gKGN1cnJlbnRFZGl0b3JJZD86IHN0cmluZykgPT4gc2VydmljZS5nZXRFZGl0b3JzKHJlc291cmNlLCB7XG5cdFx0XHRleGNsdWRlVW5jb25maWd1cmVkVW5pdmVyc2FsT3B0aW9uYWxFZGl0b3JzOiB0cnVlLFxuXHRcdFx0Y3VycmVudEVkaXRvcklkXG5cdFx0fSkubWFwKGVkaXRvciA9PiBlZGl0b3IuaWQpLmZpbHRlcihpZCA9PiBpZC5zdGFydHNXaXRoKCd0ZXN0LicpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWxsOiBzZXJ2aWNlLmdldEVkaXRvcnMocmVzb3VyY2UpLm1hcChlZGl0b3IgPT4gZWRpdG9yLmlkKS5maWx0ZXIoaWQgPT4gaWQuc3RhcnRzV2l0aCgndGVzdC4nKSksXG5cdFx0XHRmaWx0ZXJlZDogcmVsZXZhbnRJZHMoKSxcblx0XHRcdGN1cnJlbnRVbml2ZXJzYWw6IHJlbGV2YW50SWRzKCd0ZXN0LnVuaXZlcnNhbE9wdGlvbmFsJyksXG5cdFx0XHRkaWZmOiBzZXJ2aWNlLmdldEVkaXRvcnMocmVzb3VyY2UsIHtcblx0XHRcdFx0ZXhjbHVkZVVuY29uZmlndXJlZFVuaXZlcnNhbE9wdGlvbmFsRWRpdG9yczogdHJ1ZSxcblx0XHRcdFx0aXNEaWZmRWRpdG9yOiB0cnVlXG5cdFx0XHR9KS5tYXAoZWRpdG9yID0+IGVkaXRvci5pZCkuZmlsdGVyKGlkID0+IGlkLnN0YXJ0c1dpdGgoJ3Rlc3QuJykpXG5cdFx0fSwge1xuXHRcdFx0YWxsOiBbJ3Rlc3Quc3BlY2lmaWNPcHRpb25hbCcsICd0ZXN0LnVuaXZlcnNhbE9wdGlvbmFsJ10sXG5cdFx0XHRmaWx0ZXJlZDogWyd0ZXN0LnNwZWNpZmljT3B0aW9uYWwnXSxcblx0XHRcdGN1cnJlbnRVbml2ZXJzYWw6IFsndGVzdC5zcGVjaWZpY09wdGlvbmFsJywgJ3Rlc3QudW5pdmVyc2FsT3B0aW9uYWwnXSxcblx0XHRcdGRpZmY6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEVkaXRvcnMgdXNlcyB0aGUgZWZmZWN0aXZlIGRpZmYgcHJpb3JpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgWywgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JSZXNvbHZlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2luZGV4Lmh0bWwnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlckVkaXRvcignKi5odG1sJywge1xuXHRcdFx0aWQ6ICd0ZXN0LmV4Y2x1c2l2ZURpZmYnLFxuXHRcdFx0bGFiZWw6ICdFeGNsdXNpdmUgRGlmZicsXG5cdFx0XHRwcmlvcml0eToge1xuXHRcdFx0XHRlZGl0b3I6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb24sXG5cdFx0XHRcdGRpZmY6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmVcblx0XHRcdH1cblx0XHR9LCB7fSwge1xuXHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9KSxcblx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZGlmZiBlZGl0b3IgY3JlYXRpb24uJyk7IH1cblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvcjogc2VydmljZS5nZXRFZGl0b3JzKHJlc291cmNlKS5tYXAoZWRpdG9yID0+IGVkaXRvci5pZCkuZmlsdGVyKGlkID0+IGlkLnN0YXJ0c1dpdGgoJ3Rlc3QuJykpLFxuXHRcdFx0ZGlmZjogc2VydmljZS5nZXRFZGl0b3JzKHJlc291cmNlLCB7IGlzRGlmZkVkaXRvcjogdHJ1ZSB9KS5tYXAoZWRpdG9yID0+IGVkaXRvci5pZCkuZmlsdGVyKGlkID0+IGlkLnN0YXJ0c1dpdGgoJ3Rlc3QuJykpXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yOiBbJ3Rlc3QuZXhjbHVzaXZlRGlmZiddLFxuXHRcdFx0ZGlmZjogW11cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RWRpdG9ycyBwcmVzZXJ2ZXMgY29uZmlndXJlZCB1bml2ZXJzYWwgb3B0aW9uYWwgZWRpdG9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0W2VkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWRdOiB7XG5cdFx0XHRcdFx0JyouaHRtbCc6ICd0ZXN0LnVuaXZlcnNhbE9wdGlvbmFsJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBbLCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbmRleC5odG1sJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyonLCB7XG5cdFx0XHRpZDogJ3Rlc3QudW5pdmVyc2FsT3B0aW9uYWwnLFxuXHRcdFx0bGFiZWw6ICdVbml2ZXJzYWwgT3B0aW9uYWwnLFxuXHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb25cblx0XHR9LCB7fSwge1xuXHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9KVxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXJ2aWNlLmdldEVkaXRvcnMocmVzb3VyY2UsIHsgZXhjbHVkZVVuY29uZmlndXJlZFVuaXZlcnNhbE9wdGlvbmFsRWRpdG9yczogdHJ1ZSB9KS5tYXAoZWRpdG9yID0+IGVkaXRvci5pZCkuZmlsdGVyKGlkID0+IGlkLnN0YXJ0c1dpdGgoJ3Rlc3QuJykpLFxuXHRcdFx0Wyd0ZXN0LnVuaXZlcnNhbE9wdGlvbmFsJ11cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSByZWdpc3RyYXRpb25zIHRvIHNhbWUgZ2xvYiBhbmQgaWQgIzE1NTg1OScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdGVzdEVkaXRvckluZm8gPSB7XG5cdFx0XHRpZDogJ1RFU1RfRURJVE9SJyxcblx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHR9O1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRTaW5nbGVFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QnLFxuXHRcdFx0dGVzdEVkaXRvckluZm8sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyZWREaWZmRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0Jyxcblx0XHRcdHRlc3RFZGl0b3JJbmZvLFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoe1xuXHRcdFx0XHRcdGVkaXRvcjogYWNjZXNzb3IuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0XHREaWZmRWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0XHQnbmFtZScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2Uob3JpZ2luYWwudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShtb2RpZmllZC50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZClcblx0XHRcdFx0fSlcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Ly8gUmVzb2x2ZSBhIGRpZmZcblx0XHRsZXQgcmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QnKSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLWJhc2ljcy50ZXN0JykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgJ3dvcmtiZW5jaC5lZGl0b3JzLmRpZmZFZGl0b3JJbnB1dCcpO1xuXHRcdFx0cmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgpO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBkaWZmIHJlZ2lzdHJhdGlvblxuXHRcdHJlZ2lzdGVyZWREaWZmRWRpdG9yLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFJlc29sdmUgYSBkaWZmIGFnYWluLCBleHBlY3RlZCBmYWlsdXJlXG5cdFx0cmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QnKSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLWJhc2ljcy50ZXN0JykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRyZWdpc3RlcmVkU2luZ2xlRWRpdG9yLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnVXNlci1jb25maWd1cmVkIGVkaXRvciBhc3NvY2lhdGlvbiByZXNvbHZlcyBvbiBmaXJzdCBzdGFydHVwIHdpdGggZW1wdHkgY2FjaGUgIzI0NDU5NycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBDVVNUT01fRURJVE9SX0lOUFVUX0lEID0gJ3Rlc3RDdXN0b21FZGl0b3JJbnB1dCc7XG5cblx0XHQvLyBTZXQgdXAgYSBjb25maWd1cmF0aW9uIHdpdGggYSB1c2VyLWNvbmZpZ3VyZWQgZWRpdG9yIGFzc29jaWF0aW9uXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRcdFtlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkXToge1xuXHRcdFx0XHRcdCcqLm1kJzogJ0NVU1RPTV9NRF9FRElUT1InXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0fSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgcGFydCA9IGF3YWl0IGNyZWF0ZUVkaXRvclBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JHcm91cHNTZXJ2aWNlLCBwYXJ0KTtcblxuXHRcdGNvbnN0IGVkaXRvclJlc29sdmVyU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclJlc29sdmVyU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclJlc29sdmVyU2VydmljZSk7XG5cblx0XHQvLyBSZWdpc3RlciBib3RoIHRoZSBkZWZhdWx0IHRleHQgZWRpdG9yIGFuZCB0aGUgY3VzdG9tIG1hcmtkb3duIGVkaXRvciB3aXRoICdvcHRpb24nIHByaW9yaXR5XG5cdFx0Ly8gKG1hdGNoaW5nIGhvdyBtYXJrZG93biBwcmV2aWV3IGlzIHJlZ2lzdGVyZWQgaW4gcGFja2FnZS5qc29uKVxuXHRcdGNvbnN0IGRlZmF1bHRFZGl0b3IgPSBlZGl0b3JSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyonLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ2RlZmF1bHQnLFxuXHRcdFx0XHRsYWJlbDogJ0RlZmF1bHQgRWRpdG9yJyxcblx0XHRcdFx0ZGV0YWlsOiAnRGVmYXVsdCcsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfSlcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgY3VzdG9tRWRpdG9yID0gZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLm1kJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdDVVNUT01fTURfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdNYXJrZG93biBQcmV2aWV3Jyxcblx0XHRcdFx0ZGV0YWlsOiAnTWFya2Rvd24gUHJldmlldyBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb25cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCkgfSlcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Ly8gUmVzb2x2ZSBhIC5tZCBmaWxlIC0gc2hvdWxkIHVzZSB0aGUgY3VzdG9tIGVkaXRvciBkdWUgdG8gdXNlciBhc3NvY2lhdGlvblxuXHRcdGNvbnN0IHJlc3VsdGluZ1Jlc29sdXRpb24gPSBhd2FpdCBlZGl0b3JSZXNvbHZlclNlcnZpY2UucmVzb2x2ZUVkaXRvcihcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCd0ZXN0Lm1kJykgfSxcblx0XHRcdHBhcnQuYWN0aXZlR3JvdXBcblx0XHQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCxcblx0XHRcdFx0J1Nob3VsZCByZXNvbHZlIHRvIGN1c3RvbSBlZGl0b3Igd2hlbiB1c2VyIGhhcyBjb25maWd1cmVkIGVkaXRvciBhc3NvY2lhdGlvbicpO1xuXHRcdFx0cmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgZWRpdG9yIHRvIHJlc29sdmUgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0fVxuXG5cdFx0ZGVmYXVsdEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0Y3VzdG9tRWRpdG9yLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRGlmZiBlZGl0b3IgUmVzb2x2ZSAtIHByaW9yaXR5LmRpZmYgb3ZlcnJpZGVzIHByaW9yaXR5LmVkaXRvciBmb3IgZGlmZnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCA9ICd0ZXN0Q3VzdG9tRWRpdG9yRm9yRGlmZlByaW9yaXR5Jztcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdC1kaWZmLXByaW9yaXR5Jyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdURVNUX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IHtcblx0XHRcdFx0XHRlZGl0b3I6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0LFxuXHRcdFx0XHRcdGRpZmY6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb24sXG5cdFx0XHRcdFx0bWVyZ2U6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UocmVzb3VyY2UudG9TdHJpbmcoKSksIENVU1RPTV9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7XG5cdFx0XHRcdFx0ZWRpdG9yOiBhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdERpZmZFZGl0b3JJbnB1dCxcblx0XHRcdFx0XHRcdCduYW1lJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShvcmlnaW5hbC50b1N0cmluZygpKSwgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UobW9kaWZpZWQudG9TdHJpbmcoKSksIENVU1RPTV9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZClcblx0XHRcdFx0fSlcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Ly8gUmVndWxhciBlZGl0b3Igc2hvdWxkIHVzZSBjdXN0b20gZWRpdG9yIChwcmlvcml0eS5lZGl0b3I6IGRlZmF1bHQpXG5cdFx0Y29uc3QgZWRpdG9yUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS50ZXN0LWRpZmYtcHJpb3JpdHknKSB9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2soZWRpdG9yUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiBlZGl0b3JSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKGVkaXRvclJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIGVkaXRvclJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsIENVU1RPTV9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdFx0ZWRpdG9yUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgZWRpdG9yIHRvIHJlc29sdmUgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlmZiBlZGl0b3Igc2hvdWxkIE5PVCB1c2UgY3VzdG9tIGVkaXRvciAocHJpb3JpdHkuZGlmZjogb3B0aW9uKVxuXHRcdGNvbnN0IGRpZmZSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS50ZXN0LWRpZmYtcHJpb3JpdHknKSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLnRlc3QtZGlmZi1wcmlvcml0eScpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2soZGlmZlJlc29sdXRpb24pO1xuXHRcdC8vIFdpdGggcHJpb3JpdHkuZGlmZjogb3B0aW9uLCB0aGUgY3VzdG9tIGVkaXRvciBzaG91bGQgbm90IGJlIHNlbGVjdGVkIGFzIGRlZmF1bHRcblx0XHRpZiAoZGlmZlJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIGRpZmZSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZGlmZlJlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCxcblx0XHRcdFx0J0N1c3RvbSBlZGl0b3Igd2l0aCBwcmlvcml0eS5kaWZmOm9wdGlvbiBzaG91bGQgbm90IGJlIHVzZWQgZm9yIGRpZmZzJyk7XG5cdFx0XHRkaWZmUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdEaWZmIGVkaXRvciBSZXNvbHZlIC0gc3RyaW5nIHByaW9yaXR5IGV4cGFuZHMgdG8gZGlmZiBwcmlvcml0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBDVVNUT01fRURJVE9SX0lOUFVUX0lEID0gJ3Rlc3RDdXN0b21FZGl0b3JOb0RpZmZQcmlvcml0eSc7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3Qtbm8tZGlmZi1wcmlvcml0eScsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdCxcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBDVVNUT01fRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoe1xuXHRcdFx0XHRcdGVkaXRvcjogYWNjZXNzb3IuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0XHREaWZmRWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0XHQnbmFtZScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2Uob3JpZ2luYWwudG9TdHJpbmcoKSksIENVU1RPTV9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG1vZGlmaWVkLnRvU3RyaW5nKCkpLCBDVVNUT01fRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQpXG5cdFx0XHRcdH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIERpZmYgZWRpdG9yIHNob3VsZCB1c2UgY3VzdG9tIGVkaXRvciBzaW5jZSBzdHJpbmcgcHJpb3JpdHkgZXhwYW5kcyB0byBwcmlvcml0eS5kaWZmOiBkZWZhdWx0XG5cdFx0Y29uc3QgZGlmZlJlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLnRlc3Qtbm8tZGlmZi1wcmlvcml0eScpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UudGVzdC1uby1kaWZmLXByaW9yaXR5JykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhkaWZmUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiBkaWZmUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXHRcdGlmIChkaWZmUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgZGlmZlJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCAnd29ya2JlbmNoLmVkaXRvcnMuZGlmZkVkaXRvcklucHV0Jyk7XG5cdFx0XHRkaWZmUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgZGlmZiBlZGl0b3IgdG8gcmVzb2x2ZSBzdWNjZXNzZnVsbHknKTtcblx0XHR9XG5cblx0XHRyZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FB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
