import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { join } from "../../../../../base/common/path.js";
import { workbenchInstantiationService, TestServiceAccessor, TestEditorInput } from "../../../../test/browser/workbenchTestServices.js";
import { snapshotToString } from "../../../textfile/common/textfiles.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { UntitledTextEditorInput } from "../../common/untitledTextEditorInput.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { EditorInputCapabilities } from "../../../../common/editor.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { isReadable, isReadableStream } from "../../../../../base/common/stream.js";
import { readableToBuffer, streamToBuffer } from "../../../../../base/common/buffer.js";
import { LanguageDetectionLanguageEventSource } from "../../../languageDetection/common/languageDetectionWorkerService.js";
import { Schemas } from "../../../../../base/common/network.js";
import { UntitledTextEditorWorkingCopyEditorHandler } from "../../common/untitledTextEditorHandler.js";
import { NO_TYPE_ID } from "../../../workingCopy/common/workingCopy.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { timeout } from "../../../../../base/common/async.js";
suite("Untitled text editors", () => {
  class TestUntitledTextEditorInput extends UntitledTextEditorInput {
    getModel() {
      return this.model;
    }
  }
  const disposables = new DisposableStore();
  let instantiationService;
  let accessor;
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    disposables.add(accessor.untitledTextEditorService);
  });
  teardown(() => {
    disposables.clear();
  });
  test("basics", async () => {
    const service = accessor.untitledTextEditorService;
    const workingCopyService = accessor.workingCopyService;
    const events = [];
    disposables.add(service.onDidCreate((model2) => {
      events.push(model2);
    }));
    const input1 = instantiationService.createInstance(TestUntitledTextEditorInput, service.create());
    await input1.resolve();
    assert.strictEqual(service.get(input1.resource), input1.getModel());
    assert.ok(!accessor.untitledTextEditorService.isUntitledWithAssociatedResource(input1.resource));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].resource.toString(), input1.getModel().resource.toString());
    assert.ok(service.get(input1.resource));
    assert.ok(!service.get(URI.file("testing")));
    assert.ok(input1.hasCapability(EditorInputCapabilities.Untitled));
    assert.ok(!input1.hasCapability(EditorInputCapabilities.Readonly));
    assert.ok(!input1.isReadonly());
    assert.ok(!input1.hasCapability(EditorInputCapabilities.Singleton));
    assert.ok(!input1.hasCapability(EditorInputCapabilities.RequiresTrust));
    assert.ok(!input1.hasCapability(EditorInputCapabilities.Scratchpad));
    const input2 = instantiationService.createInstance(TestUntitledTextEditorInput, service.create());
    assert.strictEqual(service.get(input2.resource), input2.getModel());
    const untypedInput = input1.toUntyped({ preserveViewState: 0 });
    assert.strictEqual(untypedInput.forceUntitled, true);
    assert.strictEqual(service.get(input1.resource), input1.getModel());
    assert.strictEqual(service.get(input2.resource), input2.getModel());
    await input1.revert(0);
    assert.ok(input1.isDisposed());
    assert.ok(!service.get(input1.resource));
    const model = await input2.resolve();
    assert.strictEqual(await service.resolve({ untitledResource: input2.resource }), model);
    assert.ok(service.get(model.resource));
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].resource.toString(), input2.resource.toString());
    assert.ok(!input2.isDirty());
    const resourcePromise = awaitDidChangeDirty(accessor.untitledTextEditorService);
    model.textEditorModel?.setValue("foo bar");
    const resource = await resourcePromise;
    assert.strictEqual(resource.toString(), input2.resource.toString());
    assert.ok(input2.isDirty());
    const dirtyUntypedInput = input2.toUntyped({ preserveViewState: 0 });
    assert.strictEqual(dirtyUntypedInput.contents, "foo bar");
    assert.strictEqual(dirtyUntypedInput.resource, void 0);
    const dirtyUntypedInputWithResource = input2.toUntyped({ preserveViewState: 0, preserveResource: true });
    assert.strictEqual(dirtyUntypedInputWithResource.contents, "foo bar");
    assert.strictEqual(dirtyUntypedInputWithResource?.resource?.toString(), input2.resource.toString());
    const dirtyUntypedInputWithoutContent = input2.toUntyped();
    assert.strictEqual(dirtyUntypedInputWithoutContent.resource?.toString(), input2.resource.toString());
    assert.strictEqual(dirtyUntypedInputWithoutContent.contents, void 0);
    assert.ok(workingCopyService.isDirty(input2.resource));
    assert.strictEqual(workingCopyService.dirtyCount, 1);
    await input1.revert(0);
    await input2.revert(0);
    assert.ok(!service.get(input1.resource));
    assert.ok(!service.get(input2.resource));
    assert.ok(!input2.isDirty());
    assert.ok(!model.isDirty());
    assert.ok(!workingCopyService.isDirty(input2.resource));
    assert.strictEqual(workingCopyService.dirtyCount, 0);
    await input1.revert(0);
    assert.ok(input1.isDisposed());
    assert.ok(!service.get(input1.resource));
    input2.dispose();
    assert.ok(!service.get(input2.resource));
  });
  function awaitDidChangeDirty(service) {
    return new Promise((resolve) => {
      const listener = service.onDidChangeDirty(async (model) => {
        listener.dispose();
        resolve(model.resource);
      });
    });
  }
  test("associated resource is dirty", async () => {
    const service = accessor.untitledTextEditorService;
    const file = URI.file(join("C:\\", "/foo/file.txt"));
    let onDidChangeDirtyModel = void 0;
    disposables.add(service.onDidChangeDirty((model2) => {
      onDidChangeDirtyModel = model2;
    }));
    const model = disposables.add(service.create({ associatedResource: file }));
    assert.ok(accessor.untitledTextEditorService.isUntitledWithAssociatedResource(model.resource));
    const untitled = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, model));
    assert.ok(untitled.isDirty());
    assert.strictEqual(model, onDidChangeDirtyModel);
    const resolvedModel = await untitled.resolve();
    assert.ok(resolvedModel.hasAssociatedFilePath);
    assert.strictEqual(untitled.isDirty(), true);
  });
  test("no longer dirty when content gets empty (not with associated resource)", async () => {
    const service = accessor.untitledTextEditorService;
    const workingCopyService = accessor.workingCopyService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    const model = disposables.add(await input.resolve());
    model.textEditorModel?.setValue("foo bar");
    assert.ok(model.isDirty());
    assert.ok(workingCopyService.isDirty(model.resource, model.typeId));
    model.textEditorModel?.setValue("");
    assert.ok(!model.isDirty());
    assert.ok(!workingCopyService.isDirty(model.resource, model.typeId));
  });
  test("via create options", async () => {
    const service = accessor.untitledTextEditorService;
    const input1 = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    const model1 = disposables.add(await input1.resolve());
    model1.textEditorModel.setValue("foo bar");
    assert.ok(model1.isDirty());
    model1.textEditorModel.setValue("");
    assert.ok(!model1.isDirty());
    const input2 = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create({ initialValue: "Hello World" })));
    const model2 = disposables.add(await input2.resolve());
    assert.strictEqual(snapshotToString(model2.createSnapshot()), "Hello World");
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, disposables.add(service.create())));
    const input3 = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create({ untitledResource: input.resource })));
    const model3 = disposables.add(await input3.resolve());
    assert.strictEqual(model3.resource.toString(), input.resource.toString());
    const file = URI.file(join("C:\\", "/foo/file44.txt"));
    const input4 = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create({ associatedResource: file })));
    const model4 = disposables.add(await input4.resolve());
    assert.ok(model4.hasAssociatedFilePath);
    assert.ok(model4.isDirty());
  });
  test("associated path remains dirty when content gets empty", async () => {
    const service = accessor.untitledTextEditorService;
    const file = URI.file(join("C:\\", "/foo/file.txt"));
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create({ associatedResource: file })));
    const model = disposables.add(await input.resolve());
    model.textEditorModel?.setValue("foo bar");
    assert.ok(model.isDirty());
    model.textEditorModel?.setValue("");
    assert.ok(model.isDirty());
  });
  test("initial content is dirty", async () => {
    const service = accessor.untitledTextEditorService;
    const workingCopyService = accessor.workingCopyService;
    const untitled = disposables.add(instantiationService.createInstance(TestUntitledTextEditorInput, service.create({ initialValue: "Hello World" })));
    assert.ok(untitled.isDirty());
    const backup = (await untitled.getModel().backup(CancellationToken.None)).content;
    if (isReadableStream(backup)) {
      const value = await streamToBuffer(backup);
      assert.strictEqual(value.toString(), "Hello World");
    } else if (isReadable(backup)) {
      const value = readableToBuffer(backup);
      assert.strictEqual(value.toString(), "Hello World");
    } else {
      assert.fail("Missing untitled backup");
    }
    const model = disposables.add(await untitled.resolve());
    assert.ok(model.isDirty());
    assert.strictEqual(workingCopyService.dirtyCount, 1);
  });
  test("created with files.defaultLanguage setting", () => {
    const defaultLanguage = "javascript";
    const config = accessor.testConfigurationService;
    config.setUserConfiguration("files", { "defaultLanguage": defaultLanguage });
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(service.create());
    assert.strictEqual(input.getLanguageId(), defaultLanguage);
    config.setUserConfiguration("files", { "defaultLanguage": void 0 });
  });
  test("created with files.defaultLanguage setting (${activeEditorLanguage})", async () => {
    const config = accessor.testConfigurationService;
    config.setUserConfiguration("files", { "defaultLanguage": "${activeEditorLanguage}" });
    accessor.editorService.activeTextEditorLanguageId = "typescript";
    const service = accessor.untitledTextEditorService;
    const model = disposables.add(service.create());
    assert.strictEqual(model.getLanguageId(), "typescript");
    config.setUserConfiguration("files", { "defaultLanguage": void 0 });
    accessor.editorService.activeTextEditorLanguageId = void 0;
  });
  test("created with language overrides files.defaultLanguage setting", () => {
    const language = "typescript";
    const defaultLanguage = "javascript";
    const config = accessor.testConfigurationService;
    config.setUserConfiguration("files", { "defaultLanguage": defaultLanguage });
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(service.create({ languageId: language }));
    assert.strictEqual(input.getLanguageId(), language);
    config.setUserConfiguration("files", { "defaultLanguage": void 0 });
  });
  test("can change language afterwards", async () => {
    const languageId = "untitled-input-test";
    disposables.add(accessor.languageService.registerLanguage({
      id: languageId
    }));
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create({ languageId })));
    assert.strictEqual(input.getLanguageId(), languageId);
    const model = disposables.add(await input.resolve());
    assert.strictEqual(model.getLanguageId(), languageId);
    input.setLanguageId(PLAINTEXT_LANGUAGE_ID);
    assert.strictEqual(input.getLanguageId(), PLAINTEXT_LANGUAGE_ID);
  });
  test("remembers that language was set explicitly", async () => {
    const language = "untitled-input-test";
    disposables.add(accessor.languageService.registerLanguage({
      id: language
    }));
    const service = accessor.untitledTextEditorService;
    const model = disposables.add(service.create());
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, model));
    assert.ok(!input.hasLanguageSetExplicitly);
    input.setLanguageId(PLAINTEXT_LANGUAGE_ID);
    assert.ok(input.hasLanguageSetExplicitly);
    assert.strictEqual(input.getLanguageId(), PLAINTEXT_LANGUAGE_ID);
  });
  test("remembers that language was set explicitly if set by another source (i.e. ModelService)", async () => {
    const language = "untitled-input-test";
    disposables.add(accessor.languageService.registerLanguage({
      id: language
    }));
    const service = accessor.untitledTextEditorService;
    const model = disposables.add(service.create());
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, model));
    disposables.add(await input.resolve());
    assert.ok(!input.hasLanguageSetExplicitly);
    model.textEditorModel.setLanguage(accessor.languageService.createById(language));
    assert.ok(input.hasLanguageSetExplicitly);
    assert.strictEqual(model.getLanguageId(), language);
  });
  test("Language is not set explicitly if set by language detection source", async () => {
    const language = "untitled-input-test";
    disposables.add(accessor.languageService.registerLanguage({
      id: language
    }));
    const service = accessor.untitledTextEditorService;
    const model = disposables.add(service.create());
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, model));
    await input.resolve();
    assert.ok(!input.hasLanguageSetExplicitly);
    model.textEditorModel.setLanguage(
      accessor.languageService.createById(language),
      // This is really what this is testing
      LanguageDetectionLanguageEventSource
    );
    assert.ok(!input.hasLanguageSetExplicitly);
    assert.strictEqual(model.getLanguageId(), language);
  });
  test("service#onDidChangeEncoding", async () => {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    let counter = 0;
    disposables.add(service.onDidChangeEncoding((model2) => {
      counter++;
      assert.strictEqual(model2.resource.toString(), input.resource.toString());
    }));
    const model = disposables.add(await input.resolve());
    await model.setEncoding("utf16");
    assert.strictEqual(counter, 1);
  });
  test("service#onDidChangeLabel", async () => {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    let counter = 0;
    disposables.add(service.onDidChangeLabel((model2) => {
      counter++;
      assert.strictEqual(model2.resource.toString(), input.resource.toString());
    }));
    const model = disposables.add(await input.resolve());
    model.textEditorModel?.setValue("Foo Bar");
    assert.strictEqual(counter, 1);
  });
  test("service#onWillDispose", async () => {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    let counter = 0;
    disposables.add(service.onWillDispose((model2) => {
      counter++;
      assert.strictEqual(model2.resource.toString(), input.resource.toString());
    }));
    const model = disposables.add(await input.resolve());
    assert.strictEqual(counter, 0);
    model.dispose();
    assert.strictEqual(counter, 1);
  });
  test("service#getValue", async () => {
    const service = accessor.untitledTextEditorService;
    const input1 = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    const model1 = disposables.add(await input1.resolve());
    model1.textEditorModel.setValue("foo bar");
    assert.strictEqual(service.getValue(model1.resource), "foo bar");
    model1.dispose();
    assert.strictEqual(service.getValue(URI.parse("https://www.microsoft.com")), void 0);
  });
  test("model#onDidChangeContent", async function() {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    let counter = 0;
    const model = disposables.add(await input.resolve());
    disposables.add(model.onDidChangeContent(() => counter++));
    model.textEditorModel?.setValue("foo");
    assert.strictEqual(counter, 1, "Dirty model should trigger event");
    model.textEditorModel?.setValue("bar");
    assert.strictEqual(counter, 2, "Content change when dirty should trigger event");
    model.textEditorModel?.setValue("");
    assert.strictEqual(counter, 3, "Manual revert should trigger event");
    model.textEditorModel?.setValue("foo");
    assert.strictEqual(counter, 4, "Dirty model should trigger event");
  });
  test("model#onDidRevert and input disposed when reverted", async function() {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    let counter = 0;
    const model = disposables.add(await input.resolve());
    disposables.add(model.onDidRevert(() => counter++));
    model.textEditorModel?.setValue("foo");
    await model.revert();
    assert.ok(input.isDisposed());
    assert.ok(counter === 1);
  });
  test("model#onDidChangeName and input name", async function() {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    let counter = 0;
    let model = disposables.add(await input.resolve());
    disposables.add(model.onDidChangeName(() => counter++));
    model.textEditorModel?.setValue("foo");
    assert.strictEqual(input.getName(), "foo");
    assert.strictEqual(model.name, "foo");
    assert.strictEqual(counter, 1);
    model.textEditorModel?.setValue("bar");
    assert.strictEqual(input.getName(), "bar");
    assert.strictEqual(model.name, "bar");
    assert.strictEqual(counter, 2);
    model.textEditorModel?.setValue("");
    assert.strictEqual(input.getName(), "Untitled-1");
    assert.strictEqual(model.name, "Untitled-1");
    model.textEditorModel?.setValue("        ");
    assert.strictEqual(input.getName(), "Untitled-1");
    assert.strictEqual(model.name, "Untitled-1");
    model.textEditorModel?.setValue("([]}");
    assert.strictEqual(input.getName(), "Untitled-1");
    assert.strictEqual(model.name, "Untitled-1");
    model.textEditorModel?.setValue("([]}hello   ");
    assert.strictEqual(input.getName(), "([]}hello");
    assert.strictEqual(model.name, "([]}hello");
    model.textEditorModel?.setValue("12345678901234567890123456789012345678901234567890");
    assert.strictEqual(input.getName(), "1234567890123456789012345678901234567890");
    assert.strictEqual(model.name, "1234567890123456789012345678901234567890");
    model.textEditorModel?.setValue("123456789012345678901234567890123456789\u{1F31E}");
    assert.strictEqual(input.getName(), "123456789012345678901234567890123456789");
    assert.strictEqual(model.name, "123456789012345678901234567890123456789");
    model.textEditorModel?.setValue("hello\u202Eworld");
    assert.strictEqual(input.getName(), "helloworld");
    assert.strictEqual(model.name, "helloworld");
    assert.strictEqual(counter, 7);
    model.textEditorModel?.setValue("Hello\nWorld");
    assert.strictEqual(counter, 8);
    function createSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
      const range = new Range(
        selectionLineNumber,
        selectionColumn,
        positionLineNumber,
        positionColumn
      );
      return {
        range,
        text,
        forceMoveMarkers: false
      };
    }
    model.textEditorModel?.applyEdits([createSingleEditOp("hello", 2, 2)]);
    assert.strictEqual(counter, 8);
    input.dispose();
    model.dispose();
    const inputWithContents = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create({ initialValue: "Foo" })));
    model = disposables.add(await inputWithContents.resolve());
    assert.strictEqual(inputWithContents.getName(), "Foo");
  });
  test("model#onDidChangeDirty", async function() {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    let counter = 0;
    const model = disposables.add(await input.resolve());
    disposables.add(model.onDidChangeDirty(() => counter++));
    model.textEditorModel?.setValue("foo");
    assert.strictEqual(counter, 1, "Dirty model should trigger event");
    model.textEditorModel?.setValue("bar");
    assert.strictEqual(counter, 1, "Another change does not fire event");
  });
  test("model#onDidChangeEncoding", async function() {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    let counter = 0;
    const model = disposables.add(await input.resolve());
    disposables.add(model.onDidChangeEncoding(() => counter++));
    await model.setEncoding("utf16");
    assert.strictEqual(counter, 1, "Dirty model should trigger event");
    await model.setEncoding("utf16");
    assert.strictEqual(counter, 1, "Another change to same encoding does not fire event");
  });
  test("canDispose with dirty model", async function() {
    const service = accessor.untitledTextEditorService;
    const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, service.create()));
    const model = disposables.add(await input.resolve());
    model.textEditorModel?.setValue("foo");
    const canDisposePromise = service.canDispose(model);
    assert.ok(canDisposePromise instanceof Promise);
    let canDispose = false;
    (async () => {
      canDispose = await canDisposePromise;
    })();
    assert.strictEqual(canDispose, false);
    model.revert({ soft: true });
    await timeout(0);
    assert.strictEqual(canDispose, true);
    const canDispose2 = service.canDispose(model);
    assert.strictEqual(canDispose2, true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("UntitledTextEditorWorkingCopyEditorHandler", () => {
  const disposables = new DisposableStore();
  let instantiationService;
  let handler;
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    disposables.add(accessor.untitledTextEditorService);
    handler = disposables.add(instantiationService.createInstance(UntitledTextEditorWorkingCopyEditorHandler));
  });
  teardown(() => {
    disposables.clear();
  });
  test("handles only untitled working copies with no type id", () => {
    const untitledResource = URI.from({ scheme: Schemas.untitled, path: "Untitled-1" });
    assert.strictEqual(handler.handles({ resource: untitledResource, typeId: NO_TYPE_ID }), true);
    assert.strictEqual(handler.handles({ resource: untitledResource, typeId: "someTypeId" }), false);
    assert.strictEqual(handler.handles({ resource: URI.file("/test.txt"), typeId: NO_TYPE_ID }), false);
  });
  test("isOpen matches UntitledTextEditorInput with same resource", () => {
    const untitledResource = URI.from({ scheme: Schemas.untitled, path: "Untitled-1" });
    const workingCopy = { resource: untitledResource, typeId: NO_TYPE_ID };
    const untitledInput = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, instantiationService.createInstance(TestServiceAccessor).untitledTextEditorService.create({ untitledResource })));
    assert.strictEqual(handler.isOpen(workingCopy, untitledInput), true);
  });
  test("isOpen matches non-UntitledTextEditorInput editors with same untitled resource", () => {
    const untitledResource = URI.from({ scheme: Schemas.untitled, path: "Untitled-1" });
    const workingCopy = { resource: untitledResource, typeId: NO_TYPE_ID };
    const customEditorInput = disposables.add(new TestEditorInput(untitledResource, "customEditorType"));
    assert.strictEqual(handler.isOpen(workingCopy, customEditorInput), true);
  });
  test("isOpen does not match editors with different resource", () => {
    const untitledResource1 = URI.from({ scheme: Schemas.untitled, path: "Untitled-1" });
    const untitledResource2 = URI.from({ scheme: Schemas.untitled, path: "Untitled-2" });
    const workingCopy = { resource: untitledResource1, typeId: NO_TYPE_ID };
    const otherInput = disposables.add(new TestEditorInput(untitledResource2, "customEditorType"));
    assert.strictEqual(handler.isOpen(workingCopy, otherInput), false);
  });
  test("isOpen returns false for non-untitled working copies", () => {
    const fileResource = URI.file("/test.txt");
    const workingCopy = { resource: fileResource, typeId: NO_TYPE_ID };
    const editor = disposables.add(new TestEditorInput(fileResource, "testType"));
    assert.strictEqual(handler.isOpen(workingCopy, editor), false);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx1bnRpdGxlZFxcdGVzdFxcYnJvd3NlclxcdW50aXRsZWRUZXh0RWRpdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSwgVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlLCBUZXN0U2VydmljZUFjY2Vzc29yLCBUZXN0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IHNuYXBzaG90VG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVW50aXRsZWRUZXh0RWRpdG9yTW9kZWwsIFVudGl0bGVkVGV4dEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNSZWFkYWJsZSwgaXNSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyByZWFkYWJsZVRvQnVmZmVyLCBzdHJlYW1Ub0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZURldGVjdGlvbkxhbmd1YWdlRXZlbnRTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9sYW5ndWFnZURldGVjdGlvbi9jb21tb24vbGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVudGl0bGVkVGV4dEVkaXRvcldvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciB9IGZyb20gJy4uLy4uL2NvbW1vbi91bnRpdGxlZFRleHRFZGl0b3JIYW5kbGVyLmpzJztcbmltcG9ydCB7IE5PX1RZUEVfSUQgfSBmcm9tICcuLi8uLi8uLi93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5zdWl0ZSgnVW50aXRsZWQgdGV4dCBlZGl0b3JzJywgKCkgPT4ge1xuXG5cdGNsYXNzIFRlc3RVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCBleHRlbmRzIFVudGl0bGVkVGV4dEVkaXRvcklucHV0IHtcblx0XHRnZXRNb2RlbCgpIHsgcmV0dXJuIHRoaXMubW9kZWw7IH1cblx0fVxuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGFjY2Vzc29yOiBUZXN0U2VydmljZUFjY2Vzc29yO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGFjY2Vzc29yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3Nvcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UgYXMgVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXNpY3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlTZXJ2aWNlID0gYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJVW50aXRsZWRUZXh0RWRpdG9yTW9kZWxbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ3JlYXRlKG1vZGVsID0+IHtcblx0XHRcdGV2ZW50cy5wdXNoKG1vZGVsKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKCkpO1xuXHRcdGF3YWl0IGlucHV0MS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0KGlucHV0MS5yZXNvdXJjZSksIGlucHV0MS5nZXRNb2RlbCgpKTtcblx0XHRhc3NlcnQub2soIWFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuaXNVbnRpdGxlZFdpdGhBc3NvY2lhdGVkUmVzb3VyY2UoaW5wdXQxLnJlc291cmNlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5yZXNvdXJjZS50b1N0cmluZygpLCBpbnB1dDEuZ2V0TW9kZWwoKS5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldChpbnB1dDEucmVzb3VyY2UpKTtcblx0XHRhc3NlcnQub2soIXNlcnZpY2UuZ2V0KFVSSS5maWxlKCd0ZXN0aW5nJykpKTtcblxuXHRcdGFzc2VydC5vayhpbnB1dDEuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkpO1xuXHRcdGFzc2VydC5vayghaW5wdXQxLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHkpKTtcblx0XHRhc3NlcnQub2soIWlucHV0MS5pc1JlYWRvbmx5KCkpO1xuXHRcdGFzc2VydC5vayghaW5wdXQxLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2luZ2xldG9uKSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dDEuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZXF1aXJlc1RydXN0KSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dDEuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TY3JhdGNocGFkKSk7XG5cblx0XHRjb25zdCBpbnB1dDIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldChpbnB1dDIucmVzb3VyY2UpLCBpbnB1dDIuZ2V0TW9kZWwoKSk7XG5cblx0XHQvLyB0b1VudHlwZWQoKVxuXHRcdGNvbnN0IHVudHlwZWRJbnB1dCA9IGlucHV0MS50b1VudHlwZWQoeyBwcmVzZXJ2ZVZpZXdTdGF0ZTogMCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50eXBlZElucHV0LmZvcmNlVW50aXRsZWQsIHRydWUpO1xuXG5cdFx0Ly8gZ2V0KClcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXQoaW5wdXQxLnJlc291cmNlKSwgaW5wdXQxLmdldE1vZGVsKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldChpbnB1dDIucmVzb3VyY2UpLCBpbnB1dDIuZ2V0TW9kZWwoKSk7XG5cblx0XHQvLyByZXZlcnQoKVxuXHRcdGF3YWl0IGlucHV0MS5yZXZlcnQoMCk7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0MS5pc0Rpc3Bvc2VkKCkpO1xuXHRcdGFzc2VydC5vayghc2VydmljZS5nZXQoaW5wdXQxLnJlc291cmNlKSk7XG5cblx0XHQvLyBkaXJ0eVxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgaW5wdXQyLnJlc29sdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlKHsgdW50aXRsZWRSZXNvdXJjZTogaW5wdXQyLnJlc291cmNlIH0pLCBtb2RlbCk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0KG1vZGVsLnJlc291cmNlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1sxXS5yZXNvdXJjZS50b1N0cmluZygpLCBpbnB1dDIucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRhc3NlcnQub2soIWlucHV0Mi5pc0RpcnR5KCkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VQcm9taXNlID0gYXdhaXREaWRDaGFuZ2VEaXJ0eShhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ2ZvbyBiYXInKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gYXdhaXQgcmVzb3VyY2VQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc291cmNlLnRvU3RyaW5nKCksIGlucHV0Mi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5vayhpbnB1dDIuaXNEaXJ0eSgpKTtcblxuXHRcdGNvbnN0IGRpcnR5VW50eXBlZElucHV0ID0gaW5wdXQyLnRvVW50eXBlZCh7IHByZXNlcnZlVmlld1N0YXRlOiAwIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eVVudHlwZWRJbnB1dC5jb250ZW50cywgJ2ZvbyBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHlVbnR5cGVkSW5wdXQucmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBkaXJ0eVVudHlwZWRJbnB1dFdpdGhSZXNvdXJjZSA9IGlucHV0Mi50b1VudHlwZWQoeyBwcmVzZXJ2ZVZpZXdTdGF0ZTogMCwgcHJlc2VydmVSZXNvdXJjZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHlVbnR5cGVkSW5wdXRXaXRoUmVzb3VyY2UuY29udGVudHMsICdmb28gYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5VW50eXBlZElucHV0V2l0aFJlc291cmNlPy5yZXNvdXJjZT8udG9TdHJpbmcoKSwgaW5wdXQyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgZGlydHlVbnR5cGVkSW5wdXRXaXRob3V0Q29udGVudCA9IGlucHV0Mi50b1VudHlwZWQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHlVbnR5cGVkSW5wdXRXaXRob3V0Q29udGVudC5yZXNvdXJjZT8udG9TdHJpbmcoKSwgaW5wdXQyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eVVudHlwZWRJbnB1dFdpdGhvdXRDb250ZW50LmNvbnRlbnRzLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdvcmtpbmdDb3B5U2VydmljZS5pc0RpcnR5KGlucHV0Mi5yZXNvdXJjZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weVNlcnZpY2UuZGlydHlDb3VudCwgMSk7XG5cblx0XHRhd2FpdCBpbnB1dDEucmV2ZXJ0KDApO1xuXHRcdGF3YWl0IGlucHV0Mi5yZXZlcnQoMCk7XG5cdFx0YXNzZXJ0Lm9rKCFzZXJ2aWNlLmdldChpbnB1dDEucmVzb3VyY2UpKTtcblx0XHRhc3NlcnQub2soIXNlcnZpY2UuZ2V0KGlucHV0Mi5yZXNvdXJjZSkpO1xuXHRcdGFzc2VydC5vayghaW5wdXQyLmlzRGlydHkoKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtb2RlbC5pc0RpcnR5KCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKCF3b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eShpbnB1dDIucmVzb3VyY2UpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5Q291bnQsIDApO1xuXG5cdFx0YXdhaXQgaW5wdXQxLnJldmVydCgwKTtcblx0XHRhc3NlcnQub2soaW5wdXQxLmlzRGlzcG9zZWQoKSk7XG5cdFx0YXNzZXJ0Lm9rKCFzZXJ2aWNlLmdldChpbnB1dDEucmVzb3VyY2UpKTtcblxuXHRcdGlucHV0Mi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0Lm9rKCFzZXJ2aWNlLmdldChpbnB1dDIucmVzb3VyY2UpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXdhaXREaWRDaGFuZ2VEaXJ0eShzZXJ2aWNlOiBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSk6IFByb21pc2U8VVJJPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBzZXJ2aWNlLm9uRGlkQ2hhbmdlRGlydHkoYXN5bmMgbW9kZWwgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdFx0cmVzb2x2ZShtb2RlbC5yZXNvdXJjZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ2Fzc29jaWF0ZWQgcmVzb3VyY2UgaXMgZGlydHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3QgZmlsZSA9IFVSSS5maWxlKGpvaW4oJ0M6XFxcXCcsICcvZm9vL2ZpbGUudHh0JykpO1xuXG5cdFx0bGV0IG9uRGlkQ2hhbmdlRGlydHlNb2RlbDogSVVudGl0bGVkVGV4dEVkaXRvck1vZGVsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlRGlydHkobW9kZWwgPT4ge1xuXHRcdFx0b25EaWRDaGFuZ2VEaXJ0eU1vZGVsID0gbW9kZWw7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5jcmVhdGUoeyBhc3NvY2lhdGVkUmVzb3VyY2U6IGZpbGUgfSkpO1xuXHRcdGFzc2VydC5vayhhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmlzVW50aXRsZWRXaXRoQXNzb2NpYXRlZFJlc291cmNlKG1vZGVsLnJlc291cmNlKSk7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIG1vZGVsKSk7XG5cdFx0YXNzZXJ0Lm9rKHVudGl0bGVkLmlzRGlydHkoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLCBvbkRpZENoYW5nZURpcnR5TW9kZWwpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWRNb2RlbCA9IGF3YWl0IHVudGl0bGVkLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5vayhyZXNvbHZlZE1vZGVsLmhhc0Fzc29jaWF0ZWRGaWxlUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkLmlzRGlydHkoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIGxvbmdlciBkaXJ0eSB3aGVuIGNvbnRlbnQgZ2V0cyBlbXB0eSAobm90IHdpdGggYXNzb2NpYXRlZCByZXNvdXJjZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlTZXJ2aWNlID0gYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBzZXJ2aWNlLmNyZWF0ZSgpKSk7XG5cblx0XHQvLyBkaXJ0eVxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0LnJlc29sdmUoKSk7XG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnZm9vIGJhcicpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXHRcdGFzc2VydC5vayh3b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eShtb2RlbC5yZXNvdXJjZSwgbW9kZWwudHlwZUlkKSk7XG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnJyk7XG5cdFx0YXNzZXJ0Lm9rKCFtb2RlbC5pc0RpcnR5KCkpO1xuXHRcdGFzc2VydC5vayghd29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkobW9kZWwucmVzb3VyY2UsIG1vZGVsLnR5cGVJZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd2aWEgY3JlYXRlIG9wdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKCkpKTtcblx0XHRjb25zdCBtb2RlbDEgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQxLnJlc29sdmUoKSk7XG5cblx0XHRtb2RlbDEudGV4dEVkaXRvck1vZGVsIS5zZXRWYWx1ZSgnZm9vIGJhcicpO1xuXHRcdGFzc2VydC5vayhtb2RlbDEuaXNEaXJ0eSgpKTtcblxuXHRcdG1vZGVsMS50ZXh0RWRpdG9yTW9kZWwhLnNldFZhbHVlKCcnKTtcblx0XHRhc3NlcnQub2soIW1vZGVsMS5pc0RpcnR5KCkpO1xuXG5cdFx0Y29uc3QgaW5wdXQyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBzZXJ2aWNlLmNyZWF0ZSh7IGluaXRpYWxWYWx1ZTogJ0hlbGxvIFdvcmxkJyB9KSkpO1xuXHRcdGNvbnN0IG1vZGVsMiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dDIucmVzb2x2ZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3RUb1N0cmluZyhtb2RlbDIuY3JlYXRlU25hcHNob3QoKSEpLCAnSGVsbG8gV29ybGQnKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5jcmVhdGUoKSkpKTtcblxuXHRcdGNvbnN0IGlucHV0MyA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCwgc2VydmljZS5jcmVhdGUoeyB1bnRpdGxlZFJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSB9KSkpO1xuXHRcdGNvbnN0IG1vZGVsMyA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dDMucmVzb2x2ZSgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDMucmVzb3VyY2UudG9TdHJpbmcoKSwgaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCBmaWxlID0gVVJJLmZpbGUoam9pbignQzpcXFxcJywgJy9mb28vZmlsZTQ0LnR4dCcpKTtcblx0XHRjb25zdCBpbnB1dDQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKHsgYXNzb2NpYXRlZFJlc291cmNlOiBmaWxlIH0pKSk7XG5cdFx0Y29uc3QgbW9kZWw0ID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0NC5yZXNvbHZlKCkpO1xuXHRcdGFzc2VydC5vayhtb2RlbDQuaGFzQXNzb2NpYXRlZEZpbGVQYXRoKTtcblx0XHRhc3NlcnQub2sobW9kZWw0LmlzRGlydHkoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fzc29jaWF0ZWQgcGF0aCByZW1haW5zIGRpcnR5IHdoZW4gY29udGVudCBnZXRzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnN0IGZpbGUgPSBVUkkuZmlsZShqb2luKCdDOlxcXFwnLCAnL2Zvby9maWxlLnR4dCcpKTtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCwgc2VydmljZS5jcmVhdGUoeyBhc3NvY2lhdGVkUmVzb3VyY2U6IGZpbGUgfSkpKTtcblxuXHRcdC8vIGRpcnR5XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQucmVzb2x2ZSgpKTtcblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdmb28gYmFyJyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzRGlydHkoKSk7XG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnJyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzRGlydHkoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWwgY29udGVudCBpcyBkaXJ0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gYWNjZXNzb3IudW50aXRsZWRUZXh0RWRpdG9yU2VydmljZTtcblx0XHRjb25zdCB3b3JraW5nQ29weVNlcnZpY2UgPSBhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2U7XG5cblx0XHRjb25zdCB1bnRpdGxlZCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKHsgaW5pdGlhbFZhbHVlOiAnSGVsbG8gV29ybGQnIH0pKSk7XG5cdFx0YXNzZXJ0Lm9rKHVudGl0bGVkLmlzRGlydHkoKSk7XG5cblx0XHRjb25zdCBiYWNrdXAgPSAoYXdhaXQgdW50aXRsZWQuZ2V0TW9kZWwoKS5iYWNrdXAoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmNvbnRlbnQ7XG5cdFx0aWYgKGlzUmVhZGFibGVTdHJlYW0oYmFja3VwKSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBzdHJlYW1Ub0J1ZmZlcihiYWNrdXAgYXMgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0fSBlbHNlIGlmIChpc1JlYWRhYmxlKGJhY2t1cCkpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gcmVhZGFibGVUb0J1ZmZlcihiYWNrdXAgYXMgVlNCdWZmZXJSZWFkYWJsZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCdNaXNzaW5nIHVudGl0bGVkIGJhY2t1cCcpO1xuXHRcdH1cblxuXHRcdC8vIGRpcnR5XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgdW50aXRsZWQucmVzb2x2ZSgpKTtcblx0XHRhc3NlcnQub2sobW9kZWwuaXNEaXJ0eSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5Q291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVkIHdpdGggZmlsZXMuZGVmYXVsdExhbmd1YWdlIHNldHRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmYXVsdExhbmd1YWdlID0gJ2phdmFzY3JpcHQnO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGFjY2Vzc29yLnRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2ZpbGVzJywgeyAnZGVmYXVsdExhbmd1YWdlJzogZGVmYXVsdExhbmd1YWdlIH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5jcmVhdGUoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuZ2V0TGFuZ3VhZ2VJZCgpLCBkZWZhdWx0TGFuZ3VhZ2UpO1xuXG5cdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdmaWxlcycsIHsgJ2RlZmF1bHRMYW5ndWFnZSc6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlZCB3aXRoIGZpbGVzLmRlZmF1bHRMYW5ndWFnZSBzZXR0aW5nICgke2FjdGl2ZUVkaXRvckxhbmd1YWdlfSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gYWNjZXNzb3IudGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMnLCB7ICdkZWZhdWx0TGFuZ3VhZ2UnOiAnJHthY3RpdmVFZGl0b3JMYW5ndWFnZX0nIH0pO1xuXG5cdFx0YWNjZXNzb3IuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZCA9ICd0eXBlc2NyaXB0JztcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UuY3JlYXRlKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExhbmd1YWdlSWQoKSwgJ3R5cGVzY3JpcHQnKTtcblxuXHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMnLCB7ICdkZWZhdWx0TGFuZ3VhZ2UnOiB1bmRlZmluZWQgfSk7XG5cdFx0YWNjZXNzb3IuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZCA9IHVuZGVmaW5lZDtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlZCB3aXRoIGxhbmd1YWdlIG92ZXJyaWRlcyBmaWxlcy5kZWZhdWx0TGFuZ3VhZ2Ugc2V0dGluZycsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZSA9ICd0eXBlc2NyaXB0Jztcblx0XHRjb25zdCBkZWZhdWx0TGFuZ3VhZ2UgPSAnamF2YXNjcmlwdCc7XG5cdFx0Y29uc3QgY29uZmlnID0gYWNjZXNzb3IudGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMnLCB7ICdkZWZhdWx0TGFuZ3VhZ2UnOiBkZWZhdWx0TGFuZ3VhZ2UgfSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gYWNjZXNzb3IudW50aXRsZWRUZXh0RWRpdG9yU2VydmljZTtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLmNyZWF0ZSh7IGxhbmd1YWdlSWQ6IGxhbmd1YWdlIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXRMYW5ndWFnZUlkKCksIGxhbmd1YWdlKTtcblxuXHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMnLCB7ICdkZWZhdWx0TGFuZ3VhZ2UnOiB1bmRlZmluZWQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgbGFuZ3VhZ2UgYWZ0ZXJ3YXJkcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ3VudGl0bGVkLWlucHV0LXRlc3QnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHtcblx0XHRcdGlkOiBsYW5ndWFnZUlkLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBzZXJ2aWNlLmNyZWF0ZSh7IGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWQgfSkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXRMYW5ndWFnZUlkKCksIGxhbmd1YWdlSWQpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQucmVzb2x2ZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBsYW5ndWFnZUlkKTtcblxuXHRcdGlucHV0LnNldExhbmd1YWdlSWQoUExBSU5URVhUX0xBTkdVQUdFX0lEKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXRMYW5ndWFnZUlkKCksIFBMQUlOVEVYVF9MQU5HVUFHRV9JRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbWVtYmVycyB0aGF0IGxhbmd1YWdlIHdhcyBzZXQgZXhwbGljaXRseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZSA9ICd1bnRpdGxlZC1pbnB1dC10ZXN0JztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5sYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdFx0XHRpZDogbGFuZ3VhZ2UsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5jcmVhdGUoKSk7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIG1vZGVsKSk7XG5cblx0XHRhc3NlcnQub2soIWlucHV0Lmhhc0xhbmd1YWdlU2V0RXhwbGljaXRseSk7XG5cdFx0aW5wdXQuc2V0TGFuZ3VhZ2VJZChQTEFJTlRFWFRfTEFOR1VBR0VfSUQpO1xuXHRcdGFzc2VydC5vayhpbnB1dC5oYXNMYW5ndWFnZVNldEV4cGxpY2l0bHkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0LmdldExhbmd1YWdlSWQoKSwgUExBSU5URVhUX0xBTkdVQUdFX0lEKTtcblx0fSk7XG5cblx0Ly8gSXNzdWUgIzE1OTIwMlxuXHR0ZXN0KCdyZW1lbWJlcnMgdGhhdCBsYW5ndWFnZSB3YXMgc2V0IGV4cGxpY2l0bHkgaWYgc2V0IGJ5IGFub3RoZXIgc291cmNlIChpLmUuIE1vZGVsU2VydmljZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSAndW50aXRsZWQtaW5wdXQtdGVzdCc7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IubGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2Uoe1xuXHRcdFx0aWQ6IGxhbmd1YWdlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UuY3JlYXRlKCkpO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBtb2RlbCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dC5yZXNvbHZlKCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5oYXNMYW5ndWFnZVNldEV4cGxpY2l0bHkpO1xuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbCEuc2V0TGFuZ3VhZ2UoYWNjZXNzb3IubGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQobGFuZ3VhZ2UpKTtcblx0XHRhc3NlcnQub2soaW5wdXQuaGFzTGFuZ3VhZ2VTZXRFeHBsaWNpdGx5KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMYW5ndWFnZUlkKCksIGxhbmd1YWdlKTtcblx0fSk7XG5cblx0dGVzdCgnTGFuZ3VhZ2UgaXMgbm90IHNldCBleHBsaWNpdGx5IGlmIHNldCBieSBsYW5ndWFnZSBkZXRlY3Rpb24gc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gJ3VudGl0bGVkLWlucHV0LXRlc3QnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHtcblx0XHRcdGlkOiBsYW5ndWFnZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gYWNjZXNzb3IudW50aXRsZWRUZXh0RWRpdG9yU2VydmljZTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLmNyZWF0ZSgpKTtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCwgbW9kZWwpKTtcblx0XHRhd2FpdCBpbnB1dC5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQub2soIWlucHV0Lmhhc0xhbmd1YWdlU2V0RXhwbGljaXRseSk7XG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsIS5zZXRMYW5ndWFnZShcblx0XHRcdGFjY2Vzc29yLmxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKGxhbmd1YWdlKSxcblx0XHRcdC8vIFRoaXMgaXMgcmVhbGx5IHdoYXQgdGhpcyBpcyB0ZXN0aW5nXG5cdFx0XHRMYW5ndWFnZURldGVjdGlvbkxhbmd1YWdlRXZlbnRTb3VyY2UpO1xuXHRcdGFzc2VydC5vayghaW5wdXQuaGFzTGFuZ3VhZ2VTZXRFeHBsaWNpdGx5KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMYW5ndWFnZUlkKCksIGxhbmd1YWdlKTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmljZSNvbkRpZENoYW5nZUVuY29kaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBzZXJ2aWNlLmNyZWF0ZSgpKSk7XG5cblx0XHRsZXQgY291bnRlciA9IDA7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZUVuY29kaW5nKG1vZGVsID0+IHtcblx0XHRcdGNvdW50ZXIrKztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpLCBpbnB1dC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9KSk7XG5cblx0XHQvLyBlbmNvZGluZ1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0LnJlc29sdmUoKSk7XG5cdFx0YXdhaXQgbW9kZWwuc2V0RW5jb2RpbmcoJ3V0ZjE2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2aWNlI29uRGlkQ2hhbmdlTGFiZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKCkpKTtcblxuXHRcdGxldCBjb3VudGVyID0gMDtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlTGFiZWwobW9kZWwgPT4ge1xuXHRcdFx0Y291bnRlcisrO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCksIGlucHV0LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIGxhYmVsXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQucmVzb2x2ZSgpKTtcblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdGb28gQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2aWNlI29uV2lsbERpc3Bvc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKCkpKTtcblxuXHRcdGxldCBjb3VudGVyID0gMDtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uV2lsbERpc3Bvc2UobW9kZWwgPT4ge1xuXHRcdFx0Y291bnRlcisrO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCksIGlucHV0LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0LnJlc29sdmUoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDApO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgMSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnc2VydmljZSNnZXRWYWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gYWNjZXNzb3IudW50aXRsZWRUZXh0RWRpdG9yU2VydmljZTtcblx0XHRjb25zdCBpbnB1dDEgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKCkpKTtcblx0XHRjb25zdCBtb2RlbDEgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQxLnJlc29sdmUoKSk7XG5cblx0XHRtb2RlbDEudGV4dEVkaXRvck1vZGVsIS5zZXRWYWx1ZSgnZm9vIGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFZhbHVlKG1vZGVsMS5yZXNvdXJjZSksICdmb28gYmFyJyk7XG5cdFx0bW9kZWwxLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFdoZW4gYSBtb2RlbCBkb2Vzbid0IGV4aXN0LCBpdCBzaG91bGQgcmV0dXJuIHVuZGVmaW5lZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFZhbHVlKFVSSS5wYXJzZSgnaHR0cHM6Ly93d3cubWljcm9zb2Z0LmNvbScpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwjb25EaWRDaGFuZ2VDb250ZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBzZXJ2aWNlLmNyZWF0ZSgpKSk7XG5cblx0XHRsZXQgY291bnRlciA9IDA7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dC5yZXNvbHZlKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gY291bnRlcisrKSk7XG5cblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdmb28nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLCAxLCAnRGlydHkgbW9kZWwgc2hvdWxkIHRyaWdnZXIgZXZlbnQnKTtcblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdiYXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLCAyLCAnQ29udGVudCBjaGFuZ2Ugd2hlbiBkaXJ0eSBzaG91bGQgdHJpZ2dlciBldmVudCcpO1xuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDMsICdNYW51YWwgcmV2ZXJ0IHNob3VsZCB0cmlnZ2VyIGV2ZW50Jyk7XG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnZm9vJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgNCwgJ0RpcnR5IG1vZGVsIHNob3VsZCB0cmlnZ2VyIGV2ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsI29uRGlkUmV2ZXJ0IGFuZCBpbnB1dCBkaXNwb3NlZCB3aGVuIHJldmVydGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBzZXJ2aWNlLmNyZWF0ZSgpKSk7XG5cblx0XHRsZXQgY291bnRlciA9IDA7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dC5yZXNvbHZlKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZFJldmVydCgoKSA9PiBjb3VudGVyKyspKTtcblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ2ZvbycpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmV2ZXJ0KCk7XG5cblx0XHRhc3NlcnQub2soaW5wdXQuaXNEaXNwb3NlZCgpKTtcblx0XHRhc3NlcnQub2soY291bnRlciA9PT0gMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsI29uRGlkQ2hhbmdlTmFtZSBhbmQgaW5wdXQgbmFtZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXJ2aWNlID0gYWNjZXNzb3IudW50aXRsZWRUZXh0RWRpdG9yU2VydmljZTtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCwgc2VydmljZS5jcmVhdGUoKSkpO1xuXG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXG5cdFx0bGV0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0LnJlc29sdmUoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlTmFtZSgoKSA9PiBjb3VudGVyKyspKTtcblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXROYW1lKCksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubmFtZSwgJ2ZvbycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDEpO1xuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXROYW1lKCksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubmFtZSwgJ2JhcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDIpO1xuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXROYW1lKCksICdVbnRpdGxlZC0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5hbWUsICdVbnRpdGxlZC0xJyk7XG5cblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCcgICAgICAgICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXROYW1lKCksICdVbnRpdGxlZC0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5hbWUsICdVbnRpdGxlZC0xJyk7XG5cblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCcoW119Jyk7IC8vIHJlcXVpcmUgYWN0dWFsIHdvcmRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0LmdldE5hbWUoKSwgJ1VudGl0bGVkLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubmFtZSwgJ1VudGl0bGVkLTEnKTtcblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJyhbXX1oZWxsbyAgICcpOyAvLyByZXF1aXJlIGFjdHVhbCB3b3Jkc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXROYW1lKCksICcoW119aGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubmFtZSwgJyhbXX1oZWxsbycpO1xuXG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAnKTsgLy8gdHJpbW1lZCBhdCA0MGNoYXJzIG1heFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXROYW1lKCksICcxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5hbWUsICcxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwJyk7XG5cblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCcxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODlcdUQ4M0NcdURGMUUnKTsgLy8gZG8gbm90IGJyZWFrIGdyYXBlaGVtcyAoIzExMTIzNSlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuZ2V0TmFtZSgpLCAnMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5hbWUsICcxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODknKTtcblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ2hlbGxvXFx1MjAyRXdvcmxkJyk7IC8vIGRvIG5vdCBhbGxvdyBSVEwgaW4gbmFtZXMgKCMxOTAxMzMpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0LmdldE5hbWUoKSwgJ2hlbGxvd29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubmFtZSwgJ2hlbGxvd29ybGQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLCA3KTtcblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ0hlbGxvXFxuV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgOCk7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVTaW5nbGVFZGl0T3AodGV4dDogc3RyaW5nLCBwb3NpdGlvbkxpbmVOdW1iZXI6IG51bWJlciwgcG9zaXRpb25Db2x1bW46IG51bWJlciwgc2VsZWN0aW9uTGluZU51bWJlcjogbnVtYmVyID0gcG9zaXRpb25MaW5lTnVtYmVyLCBzZWxlY3Rpb25Db2x1bW46IG51bWJlciA9IHBvc2l0aW9uQ29sdW1uKTogSVNpbmdsZUVkaXRPcGVyYXRpb24ge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRcdHNlbGVjdGlvbkxpbmVOdW1iZXIsXG5cdFx0XHRcdHNlbGVjdGlvbkNvbHVtbixcblx0XHRcdFx0cG9zaXRpb25MaW5lTnVtYmVyLFxuXHRcdFx0XHRwb3NpdGlvbkNvbHVtblxuXHRcdFx0KTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdHRleHQsXG5cdFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uYXBwbHlFZGl0cyhbY3JlYXRlU2luZ2xlRWRpdE9wKCdoZWxsbycsIDIsIDIpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDgpOyAvLyBjaGFuZ2Ugd2FzIG5vdCBvbiBmaXJzdCBsaW5lXG5cblx0XHRpbnB1dC5kaXNwb3NlKCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgaW5wdXRXaXRoQ29udGVudHMgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKHsgaW5pdGlhbFZhbHVlOiAnRm9vJyB9KSkpO1xuXHRcdG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0V2l0aENvbnRlbnRzLnJlc29sdmUoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXRXaXRoQ29udGVudHMuZ2V0TmFtZSgpLCAnRm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsI29uRGlkQ2hhbmdlRGlydHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKCkpKTtcblxuXHRcdGxldCBjb3VudGVyID0gMDtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0LnJlc29sdmUoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4gY291bnRlcisrKSk7XG5cblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdmb28nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLCAxLCAnRGlydHkgbW9kZWwgc2hvdWxkIHRyaWdnZXIgZXZlbnQnKTtcblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdiYXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLCAxLCAnQW5vdGhlciBjaGFuZ2UgZG9lcyBub3QgZmlyZSBldmVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCNvbkRpZENoYW5nZUVuY29kaW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnN0IGlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBzZXJ2aWNlLmNyZWF0ZSgpKSk7XG5cblx0XHRsZXQgY291bnRlciA9IDA7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dC5yZXNvbHZlKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZUVuY29kaW5nKCgpID0+IGNvdW50ZXIrKykpO1xuXG5cdFx0YXdhaXQgbW9kZWwuc2V0RW5jb2RpbmcoJ3V0ZjE2Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgMSwgJ0RpcnR5IG1vZGVsIHNob3VsZCB0cmlnZ2VyIGV2ZW50Jyk7XG5cdFx0YXdhaXQgbW9kZWwuc2V0RW5jb2RpbmcoJ3V0ZjE2Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgMSwgJ0Fub3RoZXIgY2hhbmdlIHRvIHNhbWUgZW5jb2RpbmcgZG9lcyBub3QgZmlyZSBldmVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5EaXNwb3NlIHdpdGggZGlydHkgbW9kZWwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIHNlcnZpY2UuY3JlYXRlKCkpKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0LnJlc29sdmUoKSk7XG5cblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdmb28nKTtcblxuXHRcdGNvbnN0IGNhbkRpc3Bvc2VQcm9taXNlID0gc2VydmljZS5jYW5EaXNwb3NlKG1vZGVsIGFzIFVudGl0bGVkVGV4dEVkaXRvck1vZGVsKTtcblx0XHRhc3NlcnQub2soY2FuRGlzcG9zZVByb21pc2UgaW5zdGFuY2VvZiBQcm9taXNlKTtcblxuXHRcdGxldCBjYW5EaXNwb3NlID0gZmFsc2U7XG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdGNhbkRpc3Bvc2UgPSBhd2FpdCBjYW5EaXNwb3NlUHJvbWlzZTtcblx0XHR9KSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkRpc3Bvc2UsIGZhbHNlKTtcblx0XHRtb2RlbC5yZXZlcnQoeyBzb2Z0OiB0cnVlIH0pO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5EaXNwb3NlLCB0cnVlKTtcblxuXHRcdGNvbnN0IGNhbkRpc3Bvc2UyID0gc2VydmljZS5jYW5EaXNwb3NlKG1vZGVsIGFzIFVudGl0bGVkVGV4dEVkaXRvck1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuRGlzcG9zZTIsIHRydWUpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuXG5zdWl0ZSgnVW50aXRsZWRUZXh0RWRpdG9yV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGhhbmRsZXI6IFVudGl0bGVkVGV4dEVkaXRvcldvcmtpbmdDb3B5RWRpdG9ySGFuZGxlcjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBhY2Nlc3NvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTZXJ2aWNlQWNjZXNzb3IpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlIGFzIFVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UpO1xuXHRcdGhhbmRsZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9yV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG9ubHkgdW50aXRsZWQgd29ya2luZyBjb3BpZXMgd2l0aCBubyB0eXBlIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVudGl0bGVkUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCwgcGF0aDogJ1VudGl0bGVkLTEnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZXIuaGFuZGxlcyh7IHJlc291cmNlOiB1bnRpdGxlZFJlc291cmNlLCB0eXBlSWQ6IE5PX1RZUEVfSUQgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYW5kbGVyLmhhbmRsZXMoeyByZXNvdXJjZTogdW50aXRsZWRSZXNvdXJjZSwgdHlwZUlkOiAnc29tZVR5cGVJZCcgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlci5oYW5kbGVzKHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvdGVzdC50eHQnKSwgdHlwZUlkOiBOT19UWVBFX0lEIH0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzT3BlbiBtYXRjaGVzIFVudGl0bGVkVGV4dEVkaXRvcklucHV0IHdpdGggc2FtZSByZXNvdXJjZScsICgpID0+IHtcblx0XHRjb25zdCB1bnRpdGxlZFJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQsIHBhdGg6ICdVbnRpdGxlZC0xJyB9KTtcblx0XHRjb25zdCB3b3JraW5nQ29weSA9IHsgcmVzb3VyY2U6IHVudGl0bGVkUmVzb3VyY2UsIHR5cGVJZDogTk9fVFlQRV9JRCB9O1xuXG5cdFx0Y29uc3QgdW50aXRsZWRJbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3NvcikudW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5jcmVhdGUoeyB1bnRpdGxlZFJlc291cmNlIH0pKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZXIuaXNPcGVuKHdvcmtpbmdDb3B5LCB1bnRpdGxlZElucHV0KSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzT3BlbiBtYXRjaGVzIG5vbi1VbnRpdGxlZFRleHRFZGl0b3JJbnB1dCBlZGl0b3JzIHdpdGggc2FtZSB1bnRpdGxlZCByZXNvdXJjZScsICgpID0+IHtcblx0XHRjb25zdCB1bnRpdGxlZFJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQsIHBhdGg6ICdVbnRpdGxlZC0xJyB9KTtcblx0XHRjb25zdCB3b3JraW5nQ29weSA9IHsgcmVzb3VyY2U6IHVudGl0bGVkUmVzb3VyY2UsIHR5cGVJZDogTk9fVFlQRV9JRCB9O1xuXG5cdFx0Ly8gQSBjdXN0b20gZWRpdG9yIChvciBhbnkgb3RoZXIgZWRpdG9yIHR5cGUpIHNoYXJpbmcgdGhlIHNhbWUgdW50aXRsZWQgcmVzb3VyY2Vcblx0XHQvLyBzaG91bGQgYmUgcmVjb2duaXplZCBhcyByZXByZXNlbnRpbmcgdGhpcyB3b3JraW5nIGNvcHkgdG8gcHJldmVudCBkdXBsaWNhdGVcblx0XHQvLyB0YWJzIG9uIGJhY2t1cCByZXN0b3JhdGlvbi5cblx0XHRjb25zdCBjdXN0b21FZGl0b3JJbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvcklucHV0KHVudGl0bGVkUmVzb3VyY2UsICdjdXN0b21FZGl0b3JUeXBlJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYW5kbGVyLmlzT3Blbih3b3JraW5nQ29weSwgY3VzdG9tRWRpdG9ySW5wdXQpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNPcGVuIGRvZXMgbm90IG1hdGNoIGVkaXRvcnMgd2l0aCBkaWZmZXJlbnQgcmVzb3VyY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdW50aXRsZWRSZXNvdXJjZTEgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCwgcGF0aDogJ1VudGl0bGVkLTEnIH0pO1xuXHRcdGNvbnN0IHVudGl0bGVkUmVzb3VyY2UyID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQsIHBhdGg6ICdVbnRpdGxlZC0yJyB9KTtcblx0XHRjb25zdCB3b3JraW5nQ29weSA9IHsgcmVzb3VyY2U6IHVudGl0bGVkUmVzb3VyY2UxLCB0eXBlSWQ6IE5PX1RZUEVfSUQgfTtcblxuXHRcdGNvbnN0IG90aGVySW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JJbnB1dCh1bnRpdGxlZFJlc291cmNlMiwgJ2N1c3RvbUVkaXRvclR5cGUnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZXIuaXNPcGVuKHdvcmtpbmdDb3B5LCBvdGhlcklucHV0KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc09wZW4gcmV0dXJucyBmYWxzZSBmb3Igbm9uLXVudGl0bGVkIHdvcmtpbmcgY29waWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVSZXNvdXJjZSA9IFVSSS5maWxlKCcvdGVzdC50eHQnKTtcblx0XHRjb25zdCB3b3JraW5nQ29weSA9IHsgcmVzb3VyY2U6IGZpbGVSZXNvdXJjZSwgdHlwZUlkOiBOT19UWVBFX0lEIH07XG5cblx0XHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JJbnB1dChmaWxlUmVzb3VyY2UsICd0ZXN0VHlwZScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlci5pc09wZW4od29ya2luZ0NvcHksIGVkaXRvciksIGZhbHNlKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBR3JCLFNBQVMsK0JBQStCLHFCQUFxQix1QkFBdUI7QUFDcEYsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMseUJBQXlCO0FBQ2xDLFNB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Q0FBQyxHQUFHLEtBQUs7QUFBQSxFQUNuRyxDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFNLG1CQUFtQixJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLGFBQWEsQ0FBQztBQUNsRixVQUFNLGNBQWMsRUFBRSxVQUFVLGtCQUFrQixRQUFRLFdBQVc7QUFFckUsVUFBTSxnQkFBZ0IsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixxQkFBcUIsZUFBZSxtQkFBbUIsRUFBRSwwQkFBMEIsT0FBTyxFQUFFLGlCQUFpQixDQUFDLENBQUMsQ0FBQztBQUNuTixXQUFPLFlBQVksUUFBUSxPQUFPLGFBQWEsYUFBYSxHQUFHLElBQUk7QUFBQSxFQUNwRSxDQUFDO0FBRUQsT0FBSyxrRkFBa0YsTUFBTTtBQUM1RixVQUFNLG1CQUFtQixJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLGFBQWEsQ0FBQztBQUNsRixVQUFNLGNBQWMsRUFBRSxVQUFVLGtCQUFrQixRQUFRLFdBQVc7QUFLckUsVUFBTSxvQkFBb0IsWUFBWSxJQUFJLElBQUksZ0JBQWdCLGtCQUFrQixrQkFBa0IsQ0FBQztBQUNuRyxXQUFPLFlBQVksUUFBUSxPQUFPLGFBQWEsaUJBQWlCLEdBQUcsSUFBSTtBQUFBLEVBQ3hFLENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFVBQU0sb0JBQW9CLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sYUFBYSxDQUFDO0FBQ25GLFVBQU0sb0JBQW9CLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sYUFBYSxDQUFDO0FBQ25GLFVBQU0sY0FBYyxFQUFFLFVBQVUsbUJBQW1CLFFBQVEsV0FBVztBQUV0RSxVQUFNLGFBQWEsWUFBWSxJQUFJLElBQUksZ0JBQWdCLG1CQUFtQixrQkFBa0IsQ0FBQztBQUM3RixXQUFPLFlBQVksUUFBUSxPQUFPLGFBQWEsVUFBVSxHQUFHLEtBQUs7QUFBQSxFQUNsRSxDQUFDO0FBRUQsT0FBSyx3REFBd0QsTUFBTTtBQUNsRSxVQUFNLGVBQWUsSUFBSSxLQUFLLFdBQVc7QUFDekMsVUFBTSxjQUFjLEVBQUUsVUFBVSxjQUFjLFFBQVEsV0FBVztBQUVqRSxVQUFNLFNBQVMsWUFBWSxJQUFJLElBQUksZ0JBQWdCLGNBQWMsVUFBVSxDQUFDO0FBQzVFLFdBQU8sWUFBWSxRQUFRLE9BQU8sYUFBYSxNQUFNLEdBQUcsS0FBSztBQUFBLEVBQzlELENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFsibW9kZWwiXQp9Cg==
