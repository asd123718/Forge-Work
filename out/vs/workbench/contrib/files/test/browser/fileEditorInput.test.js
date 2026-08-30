import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from "../../../../../base/test/common/utils.js";
import { FileEditorInput } from "../../browser/editors/fileEditorInput.js";
import { workbenchInstantiationService, TestServiceAccessor, getLastResolvedFileStat } from "../../../../test/browser/workbenchTestServices.js";
import { Verbosity, EditorExtensions, EditorInputCapabilities } from "../../../../common/editor.js";
import { EncodingMode, TextFileOperationError, TextFileOperationResult } from "../../../../services/textfile/common/textfiles.js";
import { FileOperationResult, NotModifiedSinceFileOperationError, TooLargeFileOperationError } from "../../../../../platform/files/common/files.js";
import { TextFileEditorModel } from "../../../../services/textfile/common/textFileEditorModel.js";
import { timeout } from "../../../../../base/common/async.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { BinaryEditorModel } from "../../../../common/editor/binaryEditorModel.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { FileEditorInputSerializer } from "../../browser/editors/fileEditorHandler.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TextEditorService } from "../../../../services/textfile/common/textEditorService.js";
suite("Files - FileEditorInput", () => {
  const disposables = new DisposableStore();
  let instantiationService;
  let accessor;
  function createFileInput(resource, preferredResource, preferredLanguageId, preferredName, preferredDescription, preferredContents) {
    return disposables.add(instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, void 0, preferredLanguageId, preferredContents));
  }
  class TestTextEditorService extends TextEditorService {
    createTextEditor(input) {
      return createFileInput(input.resource);
    }
    async resolveTextEditor(input) {
      return createFileInput(input.resource);
    }
  }
  setup(() => {
    instantiationService = workbenchInstantiationService({
      textEditorService: (instantiationService2) => instantiationService2.createInstance(TestTextEditorService)
    }, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
  });
  teardown(() => {
    disposables.clear();
  });
  test("Basics", async function() {
    let input = createFileInput(toResource.call(this, "/foo/bar/file.js"));
    const otherInput = createFileInput(toResource.call(this, "foo/bar/otherfile.js"));
    const otherInputSame = createFileInput(toResource.call(this, "foo/bar/file.js"));
    assert(input.matches(input));
    assert(input.matches(otherInputSame));
    assert(!input.matches(otherInput));
    assert.ok(input.getName());
    assert.ok(input.getDescription());
    assert.ok(input.getTitle(Verbosity.SHORT));
    assert.ok(!input.hasCapability(EditorInputCapabilities.Untitled));
    assert.ok(!input.hasCapability(EditorInputCapabilities.Readonly));
    assert.ok(!input.isReadonly());
    assert.ok(!input.hasCapability(EditorInputCapabilities.Singleton));
    assert.ok(!input.hasCapability(EditorInputCapabilities.RequiresTrust));
    const untypedInput = input.toUntyped({ preserveViewState: 0 });
    assert.strictEqual(untypedInput.resource.toString(), input.resource.toString());
    assert.strictEqual("file.js", input.getName());
    assert.strictEqual(toResource.call(this, "/foo/bar/file.js").fsPath, input.resource.fsPath);
    assert(input.resource instanceof URI);
    input = createFileInput(toResource.call(this, "/foo/bar.html"));
    const inputToResolve = createFileInput(toResource.call(this, "/foo/bar/file.js"));
    const sameOtherInput = createFileInput(toResource.call(this, "/foo/bar/file.js"));
    let resolved = await inputToResolve.resolve();
    assert.ok(inputToResolve.isResolved());
    const resolvedModelA = resolved;
    resolved = await inputToResolve.resolve();
    assert(resolvedModelA === resolved);
    try {
      DisposableStore.DISABLE_DISPOSED_WARNING = true;
      const otherResolved = await sameOtherInput.resolve();
      assert(otherResolved === resolvedModelA);
      inputToResolve.dispose();
      resolved = await inputToResolve.resolve();
      assert(resolvedModelA === resolved);
      inputToResolve.dispose();
      sameOtherInput.dispose();
      resolvedModelA.dispose();
      resolved = await inputToResolve.resolve();
      assert(resolvedModelA !== resolved);
      const stat = getLastResolvedFileStat(resolved);
      resolved = await inputToResolve.resolve();
      await timeout(0);
      assert(stat !== getLastResolvedFileStat(resolved));
    } finally {
      DisposableStore.DISABLE_DISPOSED_WARNING = false;
    }
  });
  test("reports as untitled without supported file scheme", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/file.js").with({ scheme: "someTestingScheme" }));
    assert.ok(input.hasCapability(EditorInputCapabilities.Untitled));
    assert.ok(!input.hasCapability(EditorInputCapabilities.Readonly));
    assert.ok(!input.isReadonly());
  });
  test("reports as readonly with readonly file scheme", async function() {
    const inMemoryFilesystemProvider = disposables.add(new InMemoryFileSystemProvider());
    inMemoryFilesystemProvider.setReadOnly(true);
    disposables.add(accessor.fileService.registerProvider("someTestingReadonlyScheme", inMemoryFilesystemProvider));
    const input = createFileInput(toResource.call(this, "/foo/bar/file.js").with({ scheme: "someTestingReadonlyScheme" }));
    assert.ok(!input.hasCapability(EditorInputCapabilities.Untitled));
    assert.ok(input.hasCapability(EditorInputCapabilities.Readonly));
    assert.ok(input.isReadonly());
  });
  test("preferred resource", function() {
    const resource = toResource.call(this, "/foo/bar/updatefile.js");
    const preferredResource = toResource.call(this, "/foo/bar/UPDATEFILE.js");
    const inputWithoutPreferredResource = createFileInput(resource);
    assert.strictEqual(inputWithoutPreferredResource.resource.toString(), resource.toString());
    assert.strictEqual(inputWithoutPreferredResource.preferredResource.toString(), resource.toString());
    const inputWithPreferredResource = createFileInput(resource, preferredResource);
    assert.strictEqual(inputWithPreferredResource.resource.toString(), resource.toString());
    assert.strictEqual(inputWithPreferredResource.preferredResource.toString(), preferredResource.toString());
    let didChangeLabel = false;
    disposables.add(inputWithPreferredResource.onDidChangeLabel((e) => {
      didChangeLabel = true;
    }));
    assert.strictEqual(inputWithPreferredResource.getName(), "UPDATEFILE.js");
    const otherPreferredResource = toResource.call(this, "/FOO/BAR/updateFILE.js");
    inputWithPreferredResource.setPreferredResource(otherPreferredResource);
    assert.strictEqual(inputWithPreferredResource.resource.toString(), resource.toString());
    assert.strictEqual(inputWithPreferredResource.preferredResource.toString(), otherPreferredResource.toString());
    assert.strictEqual(inputWithPreferredResource.getName(), "updateFILE.js");
    assert.strictEqual(didChangeLabel, true);
  });
  test("preferred language", async function() {
    const languageId = "file-input-test";
    disposables.add(accessor.languageService.registerLanguage({
      id: languageId
    }));
    const input = createFileInput(toResource.call(this, "/foo/bar/file.js"), void 0, languageId);
    assert.strictEqual(input.getPreferredLanguageId(), languageId);
    const model = disposables.add(await input.resolve());
    assert.strictEqual(model.textEditorModel.getLanguageId(), languageId);
    input.setLanguageId("text");
    assert.strictEqual(input.getPreferredLanguageId(), "text");
    assert.strictEqual(model.textEditorModel.getLanguageId(), PLAINTEXT_LANGUAGE_ID);
    const input2 = createFileInput(toResource.call(this, "/foo/bar/file.js"));
    input2.setPreferredLanguageId(languageId);
    const model2 = disposables.add(await input2.resolve());
    assert.strictEqual(model2.textEditorModel.getLanguageId(), languageId);
  });
  test("preferred contents", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/file.js"), void 0, void 0, void 0, void 0, "My contents");
    const model = disposables.add(await input.resolve());
    assert.strictEqual(model.textEditorModel.getValue(), "My contents");
    assert.strictEqual(input.isDirty(), true);
    const untypedInput = input.toUntyped({ preserveViewState: 0 });
    assert.strictEqual(untypedInput.contents, "My contents");
    const untypedInputWithoutContents = input.toUntyped();
    assert.strictEqual(untypedInputWithoutContents.contents, void 0);
    input.setPreferredContents("Other contents");
    await input.resolve();
    assert.strictEqual(model.textEditorModel.getValue(), "Other contents");
    model.textEditorModel?.setValue("Changed contents");
    await input.resolve();
    assert.strictEqual(model.textEditorModel.getValue(), "Changed contents");
    const input2 = createFileInput(toResource.call(this, "/foo/bar/file.js"));
    input2.setPreferredContents("My contents");
    const model2 = await input2.resolve();
    assert.strictEqual(model2.textEditorModel.getValue(), "My contents");
    assert.strictEqual(input2.isDirty(), true);
  });
  test("matches", function() {
    const input1 = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    const input2 = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    const input3 = createFileInput(toResource.call(this, "/foo/bar/other.js"));
    const input2Upper = createFileInput(toResource.call(this, "/foo/bar/UPDATEFILE.js"));
    assert.strictEqual(input1.matches(input1), true);
    assert.strictEqual(input1.matches(input2), true);
    assert.strictEqual(input1.matches(input3), false);
    assert.strictEqual(input1.matches(input2Upper), false);
  });
  test("getEncoding/setEncoding", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    await input.setEncoding("utf16", EncodingMode.Encode);
    assert.strictEqual(input.getEncoding(), "utf16");
    const resolved = disposables.add(await input.resolve());
    assert.strictEqual(input.getEncoding(), resolved.getEncoding());
  });
  test("save", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    const resolved = disposables.add(await input.resolve());
    resolved.textEditorModel.setValue("changed");
    assert.ok(input.isDirty());
    assert.ok(input.isModified());
    await input.save(0);
    assert.ok(!input.isDirty());
    assert.ok(!input.isModified());
  });
  test("revert", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    const resolved = disposables.add(await input.resolve());
    resolved.textEditorModel.setValue("changed");
    assert.ok(input.isDirty());
    assert.ok(input.isModified());
    await input.revert(0);
    assert.ok(!input.isDirty());
    assert.ok(!input.isModified());
    input.dispose();
    assert.ok(input.isDisposed());
  });
  test("resolve handles binary files", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    accessor.textFileService.setReadStreamErrorOnce(new TextFileOperationError("error", TextFileOperationResult.FILE_IS_BINARY));
    const resolved = disposables.add(await input.resolve());
    assert.ok(resolved);
  });
  test("resolve throws for too large files", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    let e = void 0;
    accessor.textFileService.setReadStreamErrorOnce(new TooLargeFileOperationError("error", FileOperationResult.FILE_TOO_LARGE, 1e3));
    try {
      await input.resolve();
    } catch (error) {
      e = error;
    }
    assert.ok(e);
  });
  test("attaches to model when created and reports dirty", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    let listenerCount = 0;
    disposables.add(input.onDidChangeDirty(() => {
      listenerCount++;
    }));
    const model = disposables.add(await accessor.textFileService.files.resolve(input.resource));
    model.textEditorModel?.setValue("hello world");
    assert.strictEqual(listenerCount, 1);
    assert.ok(input.isDirty());
  });
  test("force open text/binary", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    input.setForceOpenAsBinary();
    let resolved = disposables.add(await input.resolve());
    assert.ok(resolved instanceof BinaryEditorModel);
    input.setForceOpenAsText();
    resolved = disposables.add(await input.resolve());
    assert.ok(resolved instanceof TextFileEditorModel);
  });
  test("file editor serializer", async function() {
    instantiationService.invokeFunction((accessor2) => Registry.as(EditorExtensions.EditorFactory).start(accessor2));
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    disposables.add(Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer("workbench.editors.files.fileEditorInput", FileEditorInputSerializer));
    const editorSerializer = Registry.as(EditorExtensions.EditorFactory).getEditorSerializer(input.typeId);
    if (!editorSerializer) {
      assert.fail("File Editor Input Serializer missing");
    }
    assert.strictEqual(editorSerializer.canSerialize(input), true);
    const inputSerialized = editorSerializer.serialize(input);
    if (!inputSerialized) {
      assert.fail("Unexpected serialized file input");
    }
    const inputDeserialized = editorSerializer.deserialize(instantiationService, inputSerialized);
    assert.strictEqual(inputDeserialized ? input.matches(inputDeserialized) : false, true);
    const preferredResource = toResource.call(this, "/foo/bar/UPDATEfile.js");
    const inputWithPreferredResource = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"), preferredResource);
    const inputWithPreferredResourceSerialized = editorSerializer.serialize(inputWithPreferredResource);
    if (!inputWithPreferredResourceSerialized) {
      assert.fail("Unexpected serialized file input");
    }
    const inputWithPreferredResourceDeserialized = editorSerializer.deserialize(instantiationService, inputWithPreferredResourceSerialized);
    assert.strictEqual(inputWithPreferredResource.resource.toString(), inputWithPreferredResourceDeserialized.resource.toString());
    assert.strictEqual(inputWithPreferredResource.preferredResource.toString(), inputWithPreferredResourceDeserialized.preferredResource.toString());
  });
  test("preferred name/description", async function() {
    const customFileInput = createFileInput(toResource.call(this, "/foo/bar/updatefile.js").with({ scheme: "test-custom" }), void 0, void 0, "My Name", "My Description");
    let didChangeLabelCounter = 0;
    disposables.add(customFileInput.onDidChangeLabel(() => {
      didChangeLabelCounter++;
    }));
    assert.strictEqual(customFileInput.getName(), "My Name");
    assert.strictEqual(customFileInput.getDescription(), "My Description");
    customFileInput.setPreferredName("My Name 2");
    customFileInput.setPreferredDescription("My Description 2");
    assert.strictEqual(customFileInput.getName(), "My Name 2");
    assert.strictEqual(customFileInput.getDescription(), "My Description 2");
    assert.strictEqual(didChangeLabelCounter, 2);
    customFileInput.dispose();
    const fileInput = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"), void 0, void 0, "My Name", "My Description");
    didChangeLabelCounter = 0;
    disposables.add(fileInput.onDidChangeLabel(() => {
      didChangeLabelCounter++;
    }));
    assert.notStrictEqual(fileInput.getName(), "My Name");
    assert.notStrictEqual(fileInput.getDescription(), "My Description");
    fileInput.setPreferredName("My Name 2");
    fileInput.setPreferredDescription("My Description 2");
    assert.notStrictEqual(fileInput.getName(), "My Name 2");
    assert.notStrictEqual(fileInput.getDescription(), "My Description 2");
    assert.strictEqual(didChangeLabelCounter, 0);
  });
  test("reports readonly changes", async function() {
    const input = createFileInput(toResource.call(this, "/foo/bar/updatefile.js"));
    let listenerCount = 0;
    disposables.add(input.onDidChangeCapabilities(() => {
      listenerCount++;
    }));
    const model = disposables.add(await accessor.textFileService.files.resolve(input.resource));
    assert.strictEqual(model.isReadonly(), false);
    assert.strictEqual(input.hasCapability(EditorInputCapabilities.Readonly), false);
    assert.strictEqual(input.isReadonly(), false);
    const stat = await accessor.fileService.resolve(input.resource, { resolveMetadata: true });
    try {
      accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError("file not modified since", { ...stat, readonly: true });
      await input.resolve();
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
    assert.strictEqual(!!model.isReadonly(), true);
    assert.strictEqual(input.hasCapability(EditorInputCapabilities.Readonly), true);
    assert.strictEqual(!!input.isReadonly(), true);
    assert.strictEqual(listenerCount, 1);
    try {
      accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError("file not modified since", { ...stat, readonly: false });
      await input.resolve();
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
    assert.strictEqual(model.isReadonly(), false);
    assert.strictEqual(input.hasCapability(EditorInputCapabilities.Readonly), false);
    assert.strictEqual(input.isReadonly(), false);
    assert.strictEqual(listenerCount, 2);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFx0ZXN0XFxicm93c2VyXFxmaWxlRWRpdG9ySW5wdXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUsIHRvUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZWRpdG9ycy9maWxlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UsIFRlc3RTZXJ2aWNlQWNjZXNzb3IsIGdldExhc3RSZXNvbHZlZEZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIFZlcmJvc2l0eSwgRWRpdG9yRXh0ZW5zaW9ucywgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVuY29kaW5nTW9kZSwgVGV4dEZpbGVPcGVyYXRpb25FcnJvciwgVGV4dEZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25SZXN1bHQsIE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IsIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFRleHRGaWxlRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEZpbGVFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQmluYXJ5RWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2JpbmFyeUVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRvcklucHV0U2VyaWFsaXplciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZWRpdG9ycy9maWxlRWRpdG9ySGFuZGxlci5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0RWRpdG9yU2VydmljZS5qcyc7XG5cbnN1aXRlKCdGaWxlcyAtIEZpbGVFZGl0b3JJbnB1dCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBhY2Nlc3NvcjogVGVzdFNlcnZpY2VBY2Nlc3NvcjtcblxuXHRmdW5jdGlvbiBjcmVhdGVGaWxlSW5wdXQocmVzb3VyY2U6IFVSSSwgcHJlZmVycmVkUmVzb3VyY2U/OiBVUkksIHByZWZlcnJlZExhbmd1YWdlSWQ/OiBzdHJpbmcsIHByZWZlcnJlZE5hbWU/OiBzdHJpbmcsIHByZWZlcnJlZERlc2NyaXB0aW9uPzogc3RyaW5nLCBwcmVmZXJyZWRDb250ZW50cz86IHN0cmluZyk6IEZpbGVFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlRWRpdG9ySW5wdXQsIHJlc291cmNlLCBwcmVmZXJyZWRSZXNvdXJjZSwgcHJlZmVycmVkTmFtZSwgcHJlZmVycmVkRGVzY3JpcHRpb24sIHVuZGVmaW5lZCwgcHJlZmVycmVkTGFuZ3VhZ2VJZCwgcHJlZmVycmVkQ29udGVudHMpKTtcblx0fVxuXG5cdGNsYXNzIFRlc3RUZXh0RWRpdG9yU2VydmljZSBleHRlbmRzIFRleHRFZGl0b3JTZXJ2aWNlIHtcblx0XHRvdmVycmlkZSBjcmVhdGVUZXh0RWRpdG9yKGlucHV0OiBJUmVzb3VyY2VFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIGNyZWF0ZUZpbGVJbnB1dChpbnB1dC5yZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZVRleHRFZGl0b3IoaW5wdXQ6IElSZXNvdXJjZUVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlRmlsZUlucHV0KGlucHV0LnJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHR0ZXh0RWRpdG9yU2VydmljZTogaW5zdGFudGlhdGlvblNlcnZpY2UgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRleHRFZGl0b3JTZXJ2aWNlKVxuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblxuXHRcdGFjY2Vzc29yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3Nvcik7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZXN0KCdCYXNpY3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGlucHV0ID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL2Zvby9iYXIvZmlsZS5qcycpKTtcblx0XHRjb25zdCBvdGhlcklucHV0ID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnZm9vL2Jhci9vdGhlcmZpbGUuanMnKSk7XG5cdFx0Y29uc3Qgb3RoZXJJbnB1dFNhbWUgPSBjcmVhdGVGaWxlSW5wdXQodG9SZXNvdXJjZS5jYWxsKHRoaXMsICdmb28vYmFyL2ZpbGUuanMnKSk7XG5cblx0XHRhc3NlcnQoaW5wdXQubWF0Y2hlcyhpbnB1dCkpO1xuXHRcdGFzc2VydChpbnB1dC5tYXRjaGVzKG90aGVySW5wdXRTYW1lKSk7XG5cdFx0YXNzZXJ0KCFpbnB1dC5tYXRjaGVzKG90aGVySW5wdXQpKTtcblx0XHRhc3NlcnQub2soaW5wdXQuZ2V0TmFtZSgpKTtcblx0XHRhc3NlcnQub2soaW5wdXQuZ2V0RGVzY3JpcHRpb24oKSk7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0LmdldFRpdGxlKFZlcmJvc2l0eS5TSE9SVCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlYWRvbmx5KSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5pc1JlYWRvbmx5KCkpO1xuXHRcdGFzc2VydC5vayghaW5wdXQuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TaW5nbGV0b24pKTtcblx0XHRhc3NlcnQub2soIWlucHV0Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVxdWlyZXNUcnVzdCkpO1xuXG5cdFx0Y29uc3QgdW50eXBlZElucHV0ID0gaW5wdXQudG9VbnR5cGVkKHsgcHJlc2VydmVWaWV3U3RhdGU6IDAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudHlwZWRJbnB1dC5yZXNvdXJjZS50b1N0cmluZygpLCBpbnB1dC5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnZmlsZS5qcycsIGlucHV0LmdldE5hbWUoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvZm9vL2Jhci9maWxlLmpzJykuZnNQYXRoLCBpbnB1dC5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydChpbnB1dC5yZXNvdXJjZSBpbnN0YW5jZW9mIFVSSSk7XG5cblx0XHRpbnB1dCA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyLmh0bWwnKSk7XG5cblx0XHRjb25zdCBpbnB1dFRvUmVzb2x2ZTogRmlsZUVkaXRvcklucHV0ID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL2Zvby9iYXIvZmlsZS5qcycpKTtcblx0XHRjb25zdCBzYW1lT3RoZXJJbnB1dDogRmlsZUVkaXRvcklucHV0ID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL2Zvby9iYXIvZmlsZS5qcycpKTtcblxuXHRcdGxldCByZXNvbHZlZCA9IGF3YWl0IGlucHV0VG9SZXNvbHZlLnJlc29sdmUoKTtcblx0XHRhc3NlcnQub2soaW5wdXRUb1Jlc29sdmUuaXNSZXNvbHZlZCgpKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkTW9kZWxBID0gcmVzb2x2ZWQ7XG5cdFx0cmVzb2x2ZWQgPSBhd2FpdCBpbnB1dFRvUmVzb2x2ZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0KHJlc29sdmVkTW9kZWxBID09PSByZXNvbHZlZCk7IC8vIE9LOiBSZXNvbHZlZCBNb2RlbCBjYWNoZWQgZ2xvYmFsbHkgcGVyIGlucHV0XG5cblx0XHR0cnkge1xuXHRcdFx0RGlzcG9zYWJsZVN0b3JlLkRJU0FCTEVfRElTUE9TRURfV0FSTklORyA9IHRydWU7IC8vIHByZXZlbnQgdW53YW50ZWQgd2FybmluZyBvdXRwdXQgZnJvbSBvY2N1cnJpbmdcblxuXHRcdFx0Y29uc3Qgb3RoZXJSZXNvbHZlZCA9IGF3YWl0IHNhbWVPdGhlcklucHV0LnJlc29sdmUoKTtcblx0XHRcdGFzc2VydChvdGhlclJlc29sdmVkID09PSByZXNvbHZlZE1vZGVsQSk7IC8vIE9LOiBSZXNvbHZlZCBNb2RlbCBjYWNoZWQgZ2xvYmFsbHkgcGVyIGlucHV0XG5cdFx0XHRpbnB1dFRvUmVzb2x2ZS5kaXNwb3NlKCk7XG5cblx0XHRcdHJlc29sdmVkID0gYXdhaXQgaW5wdXRUb1Jlc29sdmUucmVzb2x2ZSgpO1xuXHRcdFx0YXNzZXJ0KHJlc29sdmVkTW9kZWxBID09PSByZXNvbHZlZCk7IC8vIE1vZGVsIGlzIHN0aWxsIHRoZSBzYW1lIGJlY2F1c2Ugd2UgaGFkIDIgY2xpZW50c1xuXHRcdFx0aW5wdXRUb1Jlc29sdmUuZGlzcG9zZSgpO1xuXHRcdFx0c2FtZU90aGVySW5wdXQuZGlzcG9zZSgpO1xuXHRcdFx0cmVzb2x2ZWRNb2RlbEEuZGlzcG9zZSgpO1xuXG5cdFx0XHRyZXNvbHZlZCA9IGF3YWl0IGlucHV0VG9SZXNvbHZlLnJlc29sdmUoKTtcblx0XHRcdGFzc2VydChyZXNvbHZlZE1vZGVsQSAhPT0gcmVzb2x2ZWQpOyAvLyBEaWZmZXJlbnQgaW5zdGFuY2UsIGJlY2F1c2UgaW5wdXQgZ290IGRpc3Bvc2VkXG5cblx0XHRcdGNvbnN0IHN0YXQgPSBnZXRMYXN0UmVzb2x2ZWRGaWxlU3RhdChyZXNvbHZlZCk7XG5cdFx0XHRyZXNvbHZlZCA9IGF3YWl0IGlucHV0VG9SZXNvbHZlLnJlc29sdmUoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQoc3RhdCAhPT0gZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQocmVzb2x2ZWQpKTsgLy8gRGlmZmVyZW50IHN0YXQsIGJlY2F1c2UgcmVzb2x2ZSBhbHdheXMgZ29lcyB0byB0aGUgc2VydmVyIGZvciByZWZyZXNoXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdERpc3Bvc2FibGVTdG9yZS5ESVNBQkxFX0RJU1BPU0VEX1dBUk5JTkcgPSBmYWxzZTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgYXMgdW50aXRsZWQgd2l0aG91dCBzdXBwb3J0ZWQgZmlsZSBzY2hlbWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVGaWxlSW5wdXQodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvZm9vL2Jhci9maWxlLmpzJykud2l0aCh7IHNjaGVtZTogJ3NvbWVUZXN0aW5nU2NoZW1lJyB9KSk7XG5cblx0XHRhc3NlcnQub2soaW5wdXQuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkpO1xuXHRcdGFzc2VydC5vayghaW5wdXQuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seSkpO1xuXHRcdGFzc2VydC5vayghaW5wdXQuaXNSZWFkb25seSgpKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhcyByZWFkb25seSB3aXRoIHJlYWRvbmx5IGZpbGUgc2NoZW1lJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGluTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRpbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5zZXRSZWFkT25seSh0cnVlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5maWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdzb21lVGVzdGluZ1JlYWRvbmx5U2NoZW1lJywgaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIpKTtcblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL2ZpbGUuanMnKS53aXRoKHsgc2NoZW1lOiAnc29tZVRlc3RpbmdSZWFkb25seVNjaGVtZScgfSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSk7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHkpKTtcblx0XHRhc3NlcnQub2soaW5wdXQuaXNSZWFkb25seSgpKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycmVkIHJlc291cmNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvZm9vL2Jhci91cGRhdGVmaWxlLmpzJyk7XG5cdFx0Y29uc3QgcHJlZmVycmVkUmVzb3VyY2UgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL1VQREFURUZJTEUuanMnKTtcblxuXHRcdGNvbnN0IGlucHV0V2l0aG91dFByZWZlcnJlZFJlc291cmNlID0gY3JlYXRlRmlsZUlucHV0KHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXRXaXRob3V0UHJlZmVycmVkUmVzb3VyY2UucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0V2l0aG91dFByZWZlcnJlZFJlc291cmNlLnByZWZlcnJlZFJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2UgPSBjcmVhdGVGaWxlSW5wdXQocmVzb3VyY2UsIHByZWZlcnJlZFJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFdpdGhQcmVmZXJyZWRSZXNvdXJjZS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2UucHJlZmVycmVkUmVzb3VyY2UudG9TdHJpbmcoKSwgcHJlZmVycmVkUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRsZXQgZGlkQ2hhbmdlTGFiZWwgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2Uub25EaWRDaGFuZ2VMYWJlbChlID0+IHtcblx0XHRcdGRpZENoYW5nZUxhYmVsID0gdHJ1ZTtcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2UuZ2V0TmFtZSgpLCAnVVBEQVRFRklMRS5qcycpO1xuXG5cdFx0Y29uc3Qgb3RoZXJQcmVmZXJyZWRSZXNvdXJjZSA9IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL0ZPTy9CQVIvdXBkYXRlRklMRS5qcycpO1xuXHRcdGlucHV0V2l0aFByZWZlcnJlZFJlc291cmNlLnNldFByZWZlcnJlZFJlc291cmNlKG90aGVyUHJlZmVycmVkUmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0V2l0aFByZWZlcnJlZFJlc291cmNlLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFdpdGhQcmVmZXJyZWRSZXNvdXJjZS5wcmVmZXJyZWRSZXNvdXJjZS50b1N0cmluZygpLCBvdGhlclByZWZlcnJlZFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFdpdGhQcmVmZXJyZWRSZXNvdXJjZS5nZXROYW1lKCksICd1cGRhdGVGSUxFLmpzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZENoYW5nZUxhYmVsLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycmVkIGxhbmd1YWdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAnZmlsZS1pbnB1dC10ZXN0Jztcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IubGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2Uoe1xuXHRcdFx0aWQ6IGxhbmd1YWdlSWQsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVGaWxlSW5wdXQodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvZm9vL2Jhci9maWxlLmpzJyksIHVuZGVmaW5lZCwgbGFuZ3VhZ2VJZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0LmdldFByZWZlcnJlZExhbmd1YWdlSWQoKSwgbGFuZ3VhZ2VJZCk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dC5yZXNvbHZlKCkgYXMgVGV4dEZpbGVFZGl0b3JNb2RlbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnRleHRFZGl0b3JNb2RlbCEuZ2V0TGFuZ3VhZ2VJZCgpLCBsYW5ndWFnZUlkKTtcblxuXHRcdGlucHV0LnNldExhbmd1YWdlSWQoJ3RleHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuZ2V0UHJlZmVycmVkTGFuZ3VhZ2VJZCgpLCAndGV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50ZXh0RWRpdG9yTW9kZWwhLmdldExhbmd1YWdlSWQoKSwgUExBSU5URVhUX0xBTkdVQUdFX0lEKTtcblxuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL2ZpbGUuanMnKSk7XG5cdFx0aW5wdXQyLnNldFByZWZlcnJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cblx0XHRjb25zdCBtb2RlbDIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQyLnJlc29sdmUoKSBhcyBUZXh0RmlsZUVkaXRvck1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwyLnRleHRFZGl0b3JNb2RlbCEuZ2V0TGFuZ3VhZ2VJZCgpLCBsYW5ndWFnZUlkKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycmVkIGNvbnRlbnRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL2Zvby9iYXIvZmlsZS5qcycpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdNeSBjb250ZW50cycpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQucmVzb2x2ZSgpIGFzIFRleHRGaWxlRWRpdG9yTW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50ZXh0RWRpdG9yTW9kZWwhLmdldFZhbHVlKCksICdNeSBjb250ZW50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0Y29uc3QgdW50eXBlZElucHV0ID0gaW5wdXQudG9VbnR5cGVkKHsgcHJlc2VydmVWaWV3U3RhdGU6IDAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudHlwZWRJbnB1dC5jb250ZW50cywgJ015IGNvbnRlbnRzJyk7XG5cblx0XHRjb25zdCB1bnR5cGVkSW5wdXRXaXRob3V0Q29udGVudHMgPSBpbnB1dC50b1VudHlwZWQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50eXBlZElucHV0V2l0aG91dENvbnRlbnRzLmNvbnRlbnRzLCB1bmRlZmluZWQpO1xuXG5cdFx0aW5wdXQuc2V0UHJlZmVycmVkQ29udGVudHMoJ090aGVyIGNvbnRlbnRzJyk7XG5cdFx0YXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50ZXh0RWRpdG9yTW9kZWwhLmdldFZhbHVlKCksICdPdGhlciBjb250ZW50cycpO1xuXG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnQ2hhbmdlZCBjb250ZW50cycpO1xuXHRcdGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwudGV4dEVkaXRvck1vZGVsIS5nZXRWYWx1ZSgpLCAnQ2hhbmdlZCBjb250ZW50cycpOyAvLyBwcmVmZXJyZWQgY29udGVudHMgb25seSB1c2VkIG9uY2VcblxuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL2ZpbGUuanMnKSk7XG5cdFx0aW5wdXQyLnNldFByZWZlcnJlZENvbnRlbnRzKCdNeSBjb250ZW50cycpO1xuXG5cdFx0Y29uc3QgbW9kZWwyID0gYXdhaXQgaW5wdXQyLnJlc29sdmUoKSBhcyBUZXh0RmlsZUVkaXRvck1vZGVsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDIudGV4dEVkaXRvck1vZGVsIS5nZXRWYWx1ZSgpLCAnTXkgY29udGVudHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQyLmlzRGlydHkoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL2Zvby9iYXIvdXBkYXRlZmlsZS5qcycpKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVGaWxlSW5wdXQodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvZm9vL2Jhci91cGRhdGVmaWxlLmpzJykpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL290aGVyLmpzJykpO1xuXHRcdGNvbnN0IGlucHV0MlVwcGVyID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL2Zvby9iYXIvVVBEQVRFRklMRS5qcycpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dDEubWF0Y2hlcyhpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQxLm1hdGNoZXMoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0MS5tYXRjaGVzKGlucHV0MyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dDEubWF0Y2hlcyhpbnB1dDJVcHBlciksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RW5jb2Rpbmcvc2V0RW5jb2RpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVGaWxlSW5wdXQodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvZm9vL2Jhci91cGRhdGVmaWxlLmpzJykpO1xuXG5cdFx0YXdhaXQgaW5wdXQuc2V0RW5jb2RpbmcoJ3V0ZjE2JywgRW5jb2RpbmdNb2RlLkVuY29kZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0LmdldEVuY29kaW5nKCksICd1dGYxNicpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQucmVzb2x2ZSgpIGFzIFRleHRGaWxlRWRpdG9yTW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5nZXRFbmNvZGluZygpLCByZXNvbHZlZC5nZXRFbmNvZGluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL3VwZGF0ZWZpbGUuanMnKSk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dC5yZXNvbHZlKCkgYXMgVGV4dEZpbGVFZGl0b3JNb2RlbCk7XG5cdFx0cmVzb2x2ZWQudGV4dEVkaXRvck1vZGVsIS5zZXRWYWx1ZSgnY2hhbmdlZCcpO1xuXHRcdGFzc2VydC5vayhpbnB1dC5pc0RpcnR5KCkpO1xuXHRcdGFzc2VydC5vayhpbnB1dC5pc01vZGlmaWVkKCkpO1xuXG5cdFx0YXdhaXQgaW5wdXQuc2F2ZSgwKTtcblx0XHRhc3NlcnQub2soIWlucHV0LmlzRGlydHkoKSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5pc01vZGlmaWVkKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZlcnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVGaWxlSW5wdXQodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvZm9vL2Jhci91cGRhdGVmaWxlLmpzJykpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQucmVzb2x2ZSgpIGFzIFRleHRGaWxlRWRpdG9yTW9kZWwpO1xuXHRcdHJlc29sdmVkLnRleHRFZGl0b3JNb2RlbCEuc2V0VmFsdWUoJ2NoYW5nZWQnKTtcblx0XHRhc3NlcnQub2soaW5wdXQuaXNEaXJ0eSgpKTtcblx0XHRhc3NlcnQub2soaW5wdXQuaXNNb2RpZmllZCgpKTtcblxuXHRcdGF3YWl0IGlucHV0LnJldmVydCgwKTtcblx0XHRhc3NlcnQub2soIWlucHV0LmlzRGlydHkoKSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5pc01vZGlmaWVkKCkpO1xuXG5cdFx0aW5wdXQuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayhpbnB1dC5pc0Rpc3Bvc2VkKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGhhbmRsZXMgYmluYXJ5IGZpbGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL2Zvby9iYXIvdXBkYXRlZmlsZS5qcycpKTtcblxuXHRcdGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5zZXRSZWFkU3RyZWFtRXJyb3JPbmNlKG5ldyBUZXh0RmlsZU9wZXJhdGlvbkVycm9yKCdlcnJvcicsIFRleHRGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfSVNfQklOQVJZKSk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dC5yZXNvbHZlKCkpO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgdGhyb3dzIGZvciB0b28gbGFyZ2UgZmlsZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVGaWxlSW5wdXQodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvZm9vL2Jhci91cGRhdGVmaWxlLmpzJykpO1xuXG5cdFx0bGV0IGU6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5zZXRSZWFkU3RyZWFtRXJyb3JPbmNlKG5ldyBUb29MYXJnZUZpbGVPcGVyYXRpb25FcnJvcignZXJyb3InLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFLCAxMDAwKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZSA9IGVycm9yO1xuXHRcdH1cblx0XHRhc3NlcnQub2soZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dGFjaGVzIHRvIG1vZGVsIHdoZW4gY3JlYXRlZCBhbmQgcmVwb3J0cyBkaXJ0eScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL3VwZGF0ZWZpbGUuanMnKSk7XG5cblx0XHRsZXQgbGlzdGVuZXJDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXJDb3VudCsrO1xuXHRcdH0pKTtcblxuXHRcdC8vIGluc3RlYWQgb2YgZ29pbmcgdGhyb3VnaCBmaWxlIGlucHV0IHJlc29sdmUgbWV0aG9kXG5cdFx0Ly8gd2UgcmVzb2x2ZSB0aGUgbW9kZWwgZGlyZWN0bHkgdGhyb3VnaCB0aGUgc2VydmljZVxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5yZXNvbHZlKGlucHV0LnJlc291cmNlKSk7XG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnaGVsbG8gd29ybGQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0ZW5lckNvdW50LCAxKTtcblx0XHRhc3NlcnQub2soaW5wdXQuaXNEaXJ0eSgpKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yY2Ugb3BlbiB0ZXh0L2JpbmFyeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL3VwZGF0ZWZpbGUuanMnKSk7XG5cdFx0aW5wdXQuc2V0Rm9yY2VPcGVuQXNCaW5hcnkoKTtcblxuXHRcdGxldCByZXNvbHZlZCA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBpbnB1dC5yZXNvbHZlKCkpO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZCBpbnN0YW5jZW9mIEJpbmFyeUVkaXRvck1vZGVsKTtcblxuXHRcdGlucHV0LnNldEZvcmNlT3BlbkFzVGV4dCgpO1xuXG5cdFx0cmVzb2x2ZWQgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgaW5wdXQucmVzb2x2ZSgpKTtcblx0XHRhc3NlcnQub2socmVzb2x2ZWQgaW5zdGFuY2VvZiBUZXh0RmlsZUVkaXRvck1vZGVsKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSBlZGl0b3Igc2VyaWFsaXplcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnN0YXJ0KGFjY2Vzc29yKSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL3VwZGF0ZWZpbGUuanMnKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoJ3dvcmtiZW5jaC5lZGl0b3JzLmZpbGVzLmZpbGVFZGl0b3JJbnB1dCcsIEZpbGVFZGl0b3JJbnB1dFNlcmlhbGl6ZXIpKTtcblxuXHRcdGNvbnN0IGVkaXRvclNlcmlhbGl6ZXIgPSBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLmdldEVkaXRvclNlcmlhbGl6ZXIoaW5wdXQudHlwZUlkKTtcblx0XHRpZiAoIWVkaXRvclNlcmlhbGl6ZXIpIHtcblx0XHRcdGFzc2VydC5mYWlsKCdGaWxlIEVkaXRvciBJbnB1dCBTZXJpYWxpemVyIG1pc3NpbmcnKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU2VyaWFsaXplci5jYW5TZXJpYWxpemUoaW5wdXQpLCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0U2VyaWFsaXplZCA9IGVkaXRvclNlcmlhbGl6ZXIuc2VyaWFsaXplKGlucHV0KTtcblx0XHRpZiAoIWlucHV0U2VyaWFsaXplZCkge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1VuZXhwZWN0ZWQgc2VyaWFsaXplZCBmaWxlIGlucHV0Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXREZXNlcmlhbGl6ZWQgPSBlZGl0b3JTZXJpYWxpemVyLmRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBpbnB1dFNlcmlhbGl6ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dERlc2VyaWFsaXplZCA/IGlucHV0Lm1hdGNoZXMoaW5wdXREZXNlcmlhbGl6ZWQpIDogZmFsc2UsIHRydWUpO1xuXG5cdFx0Y29uc3QgcHJlZmVycmVkUmVzb3VyY2UgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL1VQREFURWZpbGUuanMnKTtcblx0XHRjb25zdCBpbnB1dFdpdGhQcmVmZXJyZWRSZXNvdXJjZSA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL3VwZGF0ZWZpbGUuanMnKSwgcHJlZmVycmVkUmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2VTZXJpYWxpemVkID0gZWRpdG9yU2VyaWFsaXplci5zZXJpYWxpemUoaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2UpO1xuXHRcdGlmICghaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2VTZXJpYWxpemVkKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCBzZXJpYWxpemVkIGZpbGUgaW5wdXQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dFdpdGhQcmVmZXJyZWRSZXNvdXJjZURlc2VyaWFsaXplZCA9IGVkaXRvclNlcmlhbGl6ZXIuZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2UsIGlucHV0V2l0aFByZWZlcnJlZFJlc291cmNlU2VyaWFsaXplZCkgYXMgRmlsZUVkaXRvcklucHV0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFdpdGhQcmVmZXJyZWRSZXNvdXJjZS5yZXNvdXJjZS50b1N0cmluZygpLCBpbnB1dFdpdGhQcmVmZXJyZWRSZXNvdXJjZURlc2VyaWFsaXplZC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2UucHJlZmVycmVkUmVzb3VyY2UudG9TdHJpbmcoKSwgaW5wdXRXaXRoUHJlZmVycmVkUmVzb3VyY2VEZXNlcmlhbGl6ZWQucHJlZmVycmVkUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZlcnJlZCBuYW1lL2Rlc2NyaXB0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gV29ya3Mgd2l0aCBjdXN0b20gZmlsZSBpbnB1dFxuXHRcdGNvbnN0IGN1c3RvbUZpbGVJbnB1dCA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL3VwZGF0ZWZpbGUuanMnKS53aXRoKHsgc2NoZW1lOiAndGVzdC1jdXN0b20nIH0pLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ015IE5hbWUnLCAnTXkgRGVzY3JpcHRpb24nKTtcblxuXHRcdGxldCBkaWRDaGFuZ2VMYWJlbENvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjdXN0b21GaWxlSW5wdXQub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB7XG5cdFx0XHRkaWRDaGFuZ2VMYWJlbENvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VzdG9tRmlsZUlucHV0LmdldE5hbWUoKSwgJ015IE5hbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VzdG9tRmlsZUlucHV0LmdldERlc2NyaXB0aW9uKCksICdNeSBEZXNjcmlwdGlvbicpO1xuXG5cdFx0Y3VzdG9tRmlsZUlucHV0LnNldFByZWZlcnJlZE5hbWUoJ015IE5hbWUgMicpO1xuXHRcdGN1c3RvbUZpbGVJbnB1dC5zZXRQcmVmZXJyZWREZXNjcmlwdGlvbignTXkgRGVzY3JpcHRpb24gMicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbUZpbGVJbnB1dC5nZXROYW1lKCksICdNeSBOYW1lIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VzdG9tRmlsZUlucHV0LmdldERlc2NyaXB0aW9uKCksICdNeSBEZXNjcmlwdGlvbiAyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkQ2hhbmdlTGFiZWxDb3VudGVyLCAyKTtcblxuXHRcdGN1c3RvbUZpbGVJbnB1dC5kaXNwb3NlKCk7XG5cblx0XHQvLyBEaXNhbGxvd2VkIHdpdGggbG9jYWwgZmlsZSBpbnB1dFxuXHRcdGNvbnN0IGZpbGVJbnB1dCA9IGNyZWF0ZUZpbGVJbnB1dCh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9mb28vYmFyL3VwZGF0ZWZpbGUuanMnKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdNeSBOYW1lJywgJ015IERlc2NyaXB0aW9uJyk7XG5cblx0XHRkaWRDaGFuZ2VMYWJlbENvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlSW5wdXQub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB7XG5cdFx0XHRkaWRDaGFuZ2VMYWJlbENvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZmlsZUlucHV0LmdldE5hbWUoKSwgJ015IE5hbWUnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZmlsZUlucHV0LmdldERlc2NyaXB0aW9uKCksICdNeSBEZXNjcmlwdGlvbicpO1xuXG5cdFx0ZmlsZUlucHV0LnNldFByZWZlcnJlZE5hbWUoJ015IE5hbWUgMicpO1xuXHRcdGZpbGVJbnB1dC5zZXRQcmVmZXJyZWREZXNjcmlwdGlvbignTXkgRGVzY3JpcHRpb24gMicpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZpbGVJbnB1dC5nZXROYW1lKCksICdNeSBOYW1lIDInKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZmlsZUlucHV0LmdldERlc2NyaXB0aW9uKCksICdNeSBEZXNjcmlwdGlvbiAyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkQ2hhbmdlTGFiZWxDb3VudGVyLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyByZWFkb25seSBjaGFuZ2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlRmlsZUlucHV0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL2Zvby9iYXIvdXBkYXRlZmlsZS5qcycpKTtcblxuXHRcdGxldCBsaXN0ZW5lckNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXJDb3VudCsrO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5yZXNvbHZlKGlucHV0LnJlc291cmNlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXNSZWFkb25seSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0LmlzUmVhZG9ubHkoKSwgZmFsc2UpO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlc29sdmUoaW5wdXQucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlYWRTaG91bGRUaHJvd0Vycm9yID0gbmV3IE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IoJ2ZpbGUgbm90IG1vZGlmaWVkIHNpbmNlJywgeyAuLi5zdGF0LCByZWFkb25seTogdHJ1ZSB9KTtcblx0XHRcdGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UucmVhZFNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCEhbW9kZWwuaXNSZWFkb25seSgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCghIWlucHV0LmlzUmVhZG9ubHkoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RlbmVyQ291bnQsIDEpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlYWRTaG91bGRUaHJvd0Vycm9yID0gbmV3IE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IoJ2ZpbGUgbm90IG1vZGlmaWVkIHNpbmNlJywgeyAuLi5zdGF0LCByZWFkb25seTogZmFsc2UgfSk7XG5cdFx0XHRhd2FpdCBpbnB1dC5yZXNvbHZlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlYWRTaG91bGRUaHJvd0Vycm9yID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pc1JlYWRvbmx5KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuaXNSZWFkb25seSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RlbmVyQ291bnQsIDIpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLHlDQUF5QyxrQkFBa0I7QUFDcEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQkFBK0IscUJBQXFCLCtCQUErQjtBQUU1RixTQUFpQyxXQUFXLGtCQUFrQiwrQkFBK0I7QUFDN0YsU0FBUyxjQUFjLHdCQUF3QiwrQkFBK0I7QUFDOUUsU0FBUyxxQkFBcUIsb0NBQW9DLGtDQUFrQztBQUNwRyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSwyQkFBMkIsTUFBTTtBQUV0QyxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsTUFBSTtBQUNKLE1BQUk7QUFFSixXQUFTLGdCQUFnQixVQUFlLG1CQUF5QixxQkFBOEIsZUFBd0Isc0JBQStCLG1CQUE2QztBQUNsTSxXQUFPLFlBQVksSUFBSSxxQkFBcUIsZUFBZSxpQkFBaUIsVUFBVSxtQkFBbUIsZUFBZSxzQkFBc0IsUUFBVyxxQkFBcUIsaUJBQWlCLENBQUM7QUFBQSxFQUNqTTtBQUFBLEVBRUEsTUFBTSw4QkFBOEIsa0JBQWtCO0FBQUEsSUFDNUMsaUJBQWlCLE9BQTZCO0FBQ3RELGFBQU8sZ0JBQWdCLE1BQU0sUUFBUTtBQUFBLElBQ3RDO0FBQUEsSUFFQSxNQUFlLGtCQUFrQixPQUE2QjtBQUM3RCxhQUFPLGdCQUFnQixNQUFNLFFBQVE7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFFQSxRQUFNLE1BQU07QUFDWCwyQkFBdUIsOEJBQThCO0FBQUEsTUFDcEQsbUJBQW1CLENBQUFBLDBCQUF3QkEsc0JBQXFCLGVBQWUscUJBQXFCO0FBQUEsSUFDckcsR0FBRyxXQUFXO0FBRWQsZUFBVyxxQkFBcUIsZUFBZSxtQkFBbUI7QUFBQSxFQUNuRSxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksTUFBTTtBQUFBLEVBQ25CLENBQUM7QUFFRCxPQUFLLFVBQVUsaUJBQWtCO0FBQ2hDLFFBQUksUUFBUSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sa0JBQWtCLENBQUM7QUFDckUsVUFBTSxhQUFhLGdCQUFnQixXQUFXLEtBQUssTUFBTSxzQkFBc0IsQ0FBQztBQUNoRixVQUFNLGlCQUFpQixnQkFBZ0IsV0FBVyxLQUFLLE1BQU0saUJBQWlCLENBQUM7QUFFL0UsV0FBTyxNQUFNLFFBQVEsS0FBSyxDQUFDO0FBQzNCLFdBQU8sTUFBTSxRQUFRLGNBQWMsQ0FBQztBQUNwQyxXQUFPLENBQUMsTUFBTSxRQUFRLFVBQVUsQ0FBQztBQUNqQyxXQUFPLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFDekIsV0FBTyxHQUFHLE1BQU0sZUFBZSxDQUFDO0FBQ2hDLFdBQU8sR0FBRyxNQUFNLFNBQVMsVUFBVSxLQUFLLENBQUM7QUFFekMsV0FBTyxHQUFHLENBQUMsTUFBTSxjQUFjLHdCQUF3QixRQUFRLENBQUM7QUFDaEUsV0FBTyxHQUFHLENBQUMsTUFBTSxjQUFjLHdCQUF3QixRQUFRLENBQUM7QUFDaEUsV0FBTyxHQUFHLENBQUMsTUFBTSxXQUFXLENBQUM7QUFDN0IsV0FBTyxHQUFHLENBQUMsTUFBTSxjQUFjLHdCQUF3QixTQUFTLENBQUM7QUFDakUsV0FBTyxHQUFHLENBQUMsTUFBTSxjQUFjLHdCQUF3QixhQUFhLENBQUM7QUFFckUsVUFBTSxlQUFlLE1BQU0sVUFBVSxFQUFFLG1CQUFtQixFQUFFLENBQUM7QUFDN0QsV0FBTyxZQUFZLGFBQWEsU0FBUyxTQUFTLEdBQUcsTUFBTSxTQUFTLFNBQVMsQ0FBQztBQUU5RSxXQUFPLFlBQVksV0FBVyxNQUFNLFFBQVEsQ0FBQztBQUU3QyxXQUFPLFlBQVksV0FBVyxLQUFLLE1BQU0sa0JBQWtCLEVBQUUsUUFBUSxNQUFNLFNBQVMsTUFBTTtBQUMxRixXQUFPLE1BQU0sb0JBQW9CLEdBQUc7QUFFcEMsWUFBUSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sZUFBZSxDQUFDO0FBRTlELFVBQU0saUJBQWtDLGdCQUFnQixXQUFXLEtBQUssTUFBTSxrQkFBa0IsQ0FBQztBQUNqRyxVQUFNLGlCQUFrQyxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sa0JBQWtCLENBQUM7QUFFakcsUUFBSSxXQUFXLE1BQU0sZUFBZSxRQUFRO0FBQzVDLFdBQU8sR0FBRyxlQUFlLFdBQVcsQ0FBQztBQUVyQyxVQUFNLGlCQUFpQjtBQUN2QixlQUFXLE1BQU0sZUFBZSxRQUFRO0FBQ3hDLFdBQU8sbUJBQW1CLFFBQVE7QUFFbEMsUUFBSTtBQUNILHNCQUFnQiwyQkFBMkI7QUFFM0MsWUFBTSxnQkFBZ0IsTUFBTSxlQUFlLFFBQVE7QUFDbkQsYUFBTyxrQkFBa0IsY0FBYztBQUN2QyxxQkFBZSxRQUFRO0FBRXZCLGlCQUFXLE1BQU0sZUFBZSxRQUFRO0FBQ3hDLGFBQU8sbUJBQW1CLFFBQVE7QUFDbEMscUJBQWUsUUFBUTtBQUN2QixxQkFBZSxRQUFRO0FBQ3ZCLHFCQUFlLFFBQVE7QUFFdkIsaUJBQVcsTUFBTSxlQUFlLFFBQVE7QUFDeEMsYUFBTyxtQkFBbUIsUUFBUTtBQUVsQyxZQUFNLE9BQU8sd0JBQXdCLFFBQVE7QUFDN0MsaUJBQVcsTUFBTSxlQUFlLFFBQVE7QUFDeEMsWUFBTSxRQUFRLENBQUM7QUFDZixhQUFPLFNBQVMsd0JBQXdCLFFBQVEsQ0FBQztBQUFBLElBQ2xELFVBQUU7QUFDRCxzQkFBZ0IsMkJBQTJCO0FBQUEsSUFDNUM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHFEQUFxRCxpQkFBa0I7QUFDM0UsVUFBTSxRQUFRLGdCQUFnQixXQUFXLEtBQUssTUFBTSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsUUFBUSxvQkFBb0IsQ0FBQyxDQUFDO0FBRTdHLFdBQU8sR0FBRyxNQUFNLGNBQWMsd0JBQXdCLFFBQVEsQ0FBQztBQUMvRCxXQUFPLEdBQUcsQ0FBQyxNQUFNLGNBQWMsd0JBQXdCLFFBQVEsQ0FBQztBQUNoRSxXQUFPLEdBQUcsQ0FBQyxNQUFNLFdBQVcsQ0FBQztBQUFBLEVBQzlCLENBQUM7QUFFRCxPQUFLLGlEQUFpRCxpQkFBa0I7QUFDdkUsVUFBTSw2QkFBNkIsWUFBWSxJQUFJLElBQUksMkJBQTJCLENBQUM7QUFDbkYsK0JBQTJCLFlBQVksSUFBSTtBQUUzQyxnQkFBWSxJQUFJLFNBQVMsWUFBWSxpQkFBaUIsNkJBQTZCLDBCQUEwQixDQUFDO0FBQzlHLFVBQU0sUUFBUSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sa0JBQWtCLEVBQUUsS0FBSyxFQUFFLFFBQVEsNEJBQTRCLENBQUMsQ0FBQztBQUVySCxXQUFPLEdBQUcsQ0FBQyxNQUFNLGNBQWMsd0JBQXdCLFFBQVEsQ0FBQztBQUNoRSxXQUFPLEdBQUcsTUFBTSxjQUFjLHdCQUF3QixRQUFRLENBQUM7QUFDL0QsV0FBTyxHQUFHLE1BQU0sV0FBVyxDQUFDO0FBQUEsRUFDN0IsQ0FBQztBQUVELE9BQUssc0JBQXNCLFdBQVk7QUFDdEMsVUFBTSxXQUFXLFdBQVcsS0FBSyxNQUFNLHdCQUF3QjtBQUMvRCxVQUFNLG9CQUFvQixXQUFXLEtBQUssTUFBTSx3QkFBd0I7QUFFeEUsVUFBTSxnQ0FBZ0MsZ0JBQWdCLFFBQVE7QUFDOUQsV0FBTyxZQUFZLDhCQUE4QixTQUFTLFNBQVMsR0FBRyxTQUFTLFNBQVMsQ0FBQztBQUN6RixXQUFPLFlBQVksOEJBQThCLGtCQUFrQixTQUFTLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFFbEcsVUFBTSw2QkFBNkIsZ0JBQWdCLFVBQVUsaUJBQWlCO0FBRTlFLFdBQU8sWUFBWSwyQkFBMkIsU0FBUyxTQUFTLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFDdEYsV0FBTyxZQUFZLDJCQUEyQixrQkFBa0IsU0FBUyxHQUFHLGtCQUFrQixTQUFTLENBQUM7QUFFeEcsUUFBSSxpQkFBaUI7QUFDckIsZ0JBQVksSUFBSSwyQkFBMkIsaUJBQWlCLE9BQUs7QUFDaEUsdUJBQWlCO0FBQUEsSUFDbEIsQ0FBQyxDQUFDO0FBRUYsV0FBTyxZQUFZLDJCQUEyQixRQUFRLEdBQUcsZUFBZTtBQUV4RSxVQUFNLHlCQUF5QixXQUFXLEtBQUssTUFBTSx3QkFBd0I7QUFDN0UsK0JBQTJCLHFCQUFxQixzQkFBc0I7QUFFdEUsV0FBTyxZQUFZLDJCQUEyQixTQUFTLFNBQVMsR0FBRyxTQUFTLFNBQVMsQ0FBQztBQUN0RixXQUFPLFlBQVksMkJBQTJCLGtCQUFrQixTQUFTLEdBQUcsdUJBQXVCLFNBQVMsQ0FBQztBQUM3RyxXQUFPLFlBQVksMkJBQTJCLFFBQVEsR0FBRyxlQUFlO0FBQ3hFLFdBQU8sWUFBWSxnQkFBZ0IsSUFBSTtBQUFBLEVBQ3hDLENBQUM7QUFFRCxPQUFLLHNCQUFzQixpQkFBa0I7QUFDNUMsVUFBTSxhQUFhO0FBQ25CLGdCQUFZLElBQUksU0FBUyxnQkFBZ0IsaUJBQWlCO0FBQUEsTUFDekQsSUFBSTtBQUFBLElBQ0wsQ0FBQyxDQUFDO0FBRUYsVUFBTSxRQUFRLGdCQUFnQixXQUFXLEtBQUssTUFBTSxrQkFBa0IsR0FBRyxRQUFXLFVBQVU7QUFDOUYsV0FBTyxZQUFZLE1BQU0sdUJBQXVCLEdBQUcsVUFBVTtBQUU3RCxVQUFNLFFBQVEsWUFBWSxJQUFJLE1BQU0sTUFBTSxRQUFRLENBQXdCO0FBQzFFLFdBQU8sWUFBWSxNQUFNLGdCQUFpQixjQUFjLEdBQUcsVUFBVTtBQUVyRSxVQUFNLGNBQWMsTUFBTTtBQUMxQixXQUFPLFlBQVksTUFBTSx1QkFBdUIsR0FBRyxNQUFNO0FBQ3pELFdBQU8sWUFBWSxNQUFNLGdCQUFpQixjQUFjLEdBQUcscUJBQXFCO0FBRWhGLFVBQU0sU0FBUyxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sa0JBQWtCLENBQUM7QUFDeEUsV0FBTyx1QkFBdUIsVUFBVTtBQUV4QyxVQUFNLFNBQVMsWUFBWSxJQUFJLE1BQU0sT0FBTyxRQUFRLENBQXdCO0FBQzVFLFdBQU8sWUFBWSxPQUFPLGdCQUFpQixjQUFjLEdBQUcsVUFBVTtBQUFBLEVBQ3ZFLENBQUM7QUFFRCxPQUFLLHNCQUFzQixpQkFBa0I7QUFDNUMsVUFBTSxRQUFRLGdCQUFnQixXQUFXLEtBQUssTUFBTSxrQkFBa0IsR0FBRyxRQUFXLFFBQVcsUUFBVyxRQUFXLGFBQWE7QUFFbEksVUFBTSxRQUFRLFlBQVksSUFBSSxNQUFNLE1BQU0sUUFBUSxDQUF3QjtBQUMxRSxXQUFPLFlBQVksTUFBTSxnQkFBaUIsU0FBUyxHQUFHLGFBQWE7QUFDbkUsV0FBTyxZQUFZLE1BQU0sUUFBUSxHQUFHLElBQUk7QUFFeEMsVUFBTSxlQUFlLE1BQU0sVUFBVSxFQUFFLG1CQUFtQixFQUFFLENBQUM7QUFDN0QsV0FBTyxZQUFZLGFBQWEsVUFBVSxhQUFhO0FBRXZELFVBQU0sOEJBQThCLE1BQU0sVUFBVTtBQUNwRCxXQUFPLFlBQVksNEJBQTRCLFVBQVUsTUFBUztBQUVsRSxVQUFNLHFCQUFxQixnQkFBZ0I7QUFDM0MsVUFBTSxNQUFNLFFBQVE7QUFDcEIsV0FBTyxZQUFZLE1BQU0sZ0JBQWlCLFNBQVMsR0FBRyxnQkFBZ0I7QUFFdEUsVUFBTSxpQkFBaUIsU0FBUyxrQkFBa0I7QUFDbEQsVUFBTSxNQUFNLFFBQVE7QUFDcEIsV0FBTyxZQUFZLE1BQU0sZ0JBQWlCLFNBQVMsR0FBRyxrQkFBa0I7QUFFeEUsVUFBTSxTQUFTLGdCQUFnQixXQUFXLEtBQUssTUFBTSxrQkFBa0IsQ0FBQztBQUN4RSxXQUFPLHFCQUFxQixhQUFhO0FBRXpDLFVBQU0sU0FBUyxNQUFNLE9BQU8sUUFBUTtBQUNwQyxXQUFPLFlBQVksT0FBTyxnQkFBaUIsU0FBUyxHQUFHLGFBQWE7QUFDcEUsV0FBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLElBQUk7QUFBQSxFQUMxQyxDQUFDO0FBRUQsT0FBSyxXQUFXLFdBQVk7QUFDM0IsVUFBTSxTQUFTLGdCQUFnQixXQUFXLEtBQUssTUFBTSx3QkFBd0IsQ0FBQztBQUM5RSxVQUFNLFNBQVMsZ0JBQWdCLFdBQVcsS0FBSyxNQUFNLHdCQUF3QixDQUFDO0FBQzlFLFVBQU0sU0FBUyxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sbUJBQW1CLENBQUM7QUFDekUsVUFBTSxjQUFjLGdCQUFnQixXQUFXLEtBQUssTUFBTSx3QkFBd0IsQ0FBQztBQUVuRixXQUFPLFlBQVksT0FBTyxRQUFRLE1BQU0sR0FBRyxJQUFJO0FBQy9DLFdBQU8sWUFBWSxPQUFPLFFBQVEsTUFBTSxHQUFHLElBQUk7QUFDL0MsV0FBTyxZQUFZLE9BQU8sUUFBUSxNQUFNLEdBQUcsS0FBSztBQUVoRCxXQUFPLFlBQVksT0FBTyxRQUFRLFdBQVcsR0FBRyxLQUFLO0FBQUEsRUFDdEQsQ0FBQztBQUVELE9BQUssMkJBQTJCLGlCQUFrQjtBQUNqRCxVQUFNLFFBQVEsZ0JBQWdCLFdBQVcsS0FBSyxNQUFNLHdCQUF3QixDQUFDO0FBRTdFLFVBQU0sTUFBTSxZQUFZLFNBQVMsYUFBYSxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLFlBQVksR0FBRyxPQUFPO0FBRS9DLFVBQU0sV0FBVyxZQUFZLElBQUksTUFBTSxNQUFNLFFBQVEsQ0FBd0I7QUFDN0UsV0FBTyxZQUFZLE1BQU0sWUFBWSxHQUFHLFNBQVMsWUFBWSxDQUFDO0FBQUEsRUFDL0QsQ0FBQztBQUVELE9BQUssUUFBUSxpQkFBa0I7QUFDOUIsVUFBTSxRQUFRLGdCQUFnQixXQUFXLEtBQUssTUFBTSx3QkFBd0IsQ0FBQztBQUU3RSxVQUFNLFdBQVcsWUFBWSxJQUFJLE1BQU0sTUFBTSxRQUFRLENBQXdCO0FBQzdFLGFBQVMsZ0JBQWlCLFNBQVMsU0FBUztBQUM1QyxXQUFPLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFDekIsV0FBTyxHQUFHLE1BQU0sV0FBVyxDQUFDO0FBRTVCLFVBQU0sTUFBTSxLQUFLLENBQUM7QUFDbEIsV0FBTyxHQUFHLENBQUMsTUFBTSxRQUFRLENBQUM7QUFDMUIsV0FBTyxHQUFHLENBQUMsTUFBTSxXQUFXLENBQUM7QUFBQSxFQUM5QixDQUFDO0FBRUQsT0FBSyxVQUFVLGlCQUFrQjtBQUNoQyxVQUFNLFFBQVEsZ0JBQWdCLFdBQVcsS0FBSyxNQUFNLHdCQUF3QixDQUFDO0FBRTdFLFVBQU0sV0FBVyxZQUFZLElBQUksTUFBTSxNQUFNLFFBQVEsQ0FBd0I7QUFDN0UsYUFBUyxnQkFBaUIsU0FBUyxTQUFTO0FBQzVDLFdBQU8sR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUN6QixXQUFPLEdBQUcsTUFBTSxXQUFXLENBQUM7QUFFNUIsVUFBTSxNQUFNLE9BQU8sQ0FBQztBQUNwQixXQUFPLEdBQUcsQ0FBQyxNQUFNLFFBQVEsQ0FBQztBQUMxQixXQUFPLEdBQUcsQ0FBQyxNQUFNLFdBQVcsQ0FBQztBQUU3QixVQUFNLFFBQVE7QUFDZCxXQUFPLEdBQUcsTUFBTSxXQUFXLENBQUM7QUFBQSxFQUM3QixDQUFDO0FBRUQsT0FBSyxnQ0FBZ0MsaUJBQWtCO0FBQ3RELFVBQU0sUUFBUSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sd0JBQXdCLENBQUM7QUFFN0UsYUFBUyxnQkFBZ0IsdUJBQXVCLElBQUksdUJBQXVCLFNBQVMsd0JBQXdCLGNBQWMsQ0FBQztBQUUzSCxVQUFNLFdBQVcsWUFBWSxJQUFJLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDdEQsV0FBTyxHQUFHLFFBQVE7QUFBQSxFQUNuQixDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsaUJBQWtCO0FBQzVELFVBQU0sUUFBUSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sd0JBQXdCLENBQUM7QUFFN0UsUUFBSSxJQUF1QjtBQUMzQixhQUFTLGdCQUFnQix1QkFBdUIsSUFBSSwyQkFBMkIsU0FBUyxvQkFBb0IsZ0JBQWdCLEdBQUksQ0FBQztBQUNqSSxRQUFJO0FBQ0gsWUFBTSxNQUFNLFFBQVE7QUFBQSxJQUNyQixTQUFTLE9BQU87QUFDZixVQUFJO0FBQUEsSUFDTDtBQUNBLFdBQU8sR0FBRyxDQUFDO0FBQUEsRUFDWixDQUFDO0FBRUQsT0FBSyxvREFBb0QsaUJBQWtCO0FBQzFFLFVBQU0sUUFBUSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sd0JBQXdCLENBQUM7QUFFN0UsUUFBSSxnQkFBZ0I7QUFDcEIsZ0JBQVksSUFBSSxNQUFNLGlCQUFpQixNQUFNO0FBQzVDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFJRixVQUFNLFFBQVEsWUFBWSxJQUFJLE1BQU0sU0FBUyxnQkFBZ0IsTUFBTSxRQUFRLE1BQU0sUUFBUSxDQUFDO0FBQzFGLFVBQU0saUJBQWlCLFNBQVMsYUFBYTtBQUU3QyxXQUFPLFlBQVksZUFBZSxDQUFDO0FBQ25DLFdBQU8sR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQzFCLENBQUM7QUFFRCxPQUFLLDBCQUEwQixpQkFBa0I7QUFDaEQsVUFBTSxRQUFRLGdCQUFnQixXQUFXLEtBQUssTUFBTSx3QkFBd0IsQ0FBQztBQUM3RSxVQUFNLHFCQUFxQjtBQUUzQixRQUFJLFdBQVcsWUFBWSxJQUFJLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDcEQsV0FBTyxHQUFHLG9CQUFvQixpQkFBaUI7QUFFL0MsVUFBTSxtQkFBbUI7QUFFekIsZUFBVyxZQUFZLElBQUksTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNoRCxXQUFPLEdBQUcsb0JBQW9CLG1CQUFtQjtBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLDBCQUEwQixpQkFBa0I7QUFDaEQseUJBQXFCLGVBQWUsQ0FBQUMsY0FBWSxTQUFTLEdBQTJCLGlCQUFpQixhQUFhLEVBQUUsTUFBTUEsU0FBUSxDQUFDO0FBRW5JLFVBQU0sUUFBUSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sd0JBQXdCLENBQUM7QUFFN0UsZ0JBQVksSUFBSSxTQUFTLEdBQTJCLGlCQUFpQixhQUFhLEVBQUUseUJBQXlCLDJDQUEyQyx5QkFBeUIsQ0FBQztBQUVsTCxVQUFNLG1CQUFtQixTQUFTLEdBQTJCLGlCQUFpQixhQUFhLEVBQUUsb0JBQW9CLE1BQU0sTUFBTTtBQUM3SCxRQUFJLENBQUMsa0JBQWtCO0FBQ3RCLGFBQU8sS0FBSyxzQ0FBc0M7QUFBQSxJQUNuRDtBQUVBLFdBQU8sWUFBWSxpQkFBaUIsYUFBYSxLQUFLLEdBQUcsSUFBSTtBQUU3RCxVQUFNLGtCQUFrQixpQkFBaUIsVUFBVSxLQUFLO0FBQ3hELFFBQUksQ0FBQyxpQkFBaUI7QUFDckIsYUFBTyxLQUFLLGtDQUFrQztBQUFBLElBQy9DO0FBRUEsVUFBTSxvQkFBb0IsaUJBQWlCLFlBQVksc0JBQXNCLGVBQWU7QUFDNUYsV0FBTyxZQUFZLG9CQUFvQixNQUFNLFFBQVEsaUJBQWlCLElBQUksT0FBTyxJQUFJO0FBRXJGLFVBQU0sb0JBQW9CLFdBQVcsS0FBSyxNQUFNLHdCQUF3QjtBQUN4RSxVQUFNLDZCQUE2QixnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sd0JBQXdCLEdBQUcsaUJBQWlCO0FBRXJILFVBQU0sdUNBQXVDLGlCQUFpQixVQUFVLDBCQUEwQjtBQUNsRyxRQUFJLENBQUMsc0NBQXNDO0FBQzFDLGFBQU8sS0FBSyxrQ0FBa0M7QUFBQSxJQUMvQztBQUVBLFVBQU0seUNBQXlDLGlCQUFpQixZQUFZLHNCQUFzQixvQ0FBb0M7QUFDdEksV0FBTyxZQUFZLDJCQUEyQixTQUFTLFNBQVMsR0FBRyx1Q0FBdUMsU0FBUyxTQUFTLENBQUM7QUFDN0gsV0FBTyxZQUFZLDJCQUEyQixrQkFBa0IsU0FBUyxHQUFHLHVDQUF1QyxrQkFBa0IsU0FBUyxDQUFDO0FBQUEsRUFDaEosQ0FBQztBQUVELE9BQUssOEJBQThCLGlCQUFrQjtBQUdwRCxVQUFNLGtCQUFrQixnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sd0JBQXdCLEVBQUUsS0FBSyxFQUFFLFFBQVEsY0FBYyxDQUFDLEdBQUcsUUFBVyxRQUFXLFdBQVcsZ0JBQWdCO0FBRTFLLFFBQUksd0JBQXdCO0FBQzVCLGdCQUFZLElBQUksZ0JBQWdCLGlCQUFpQixNQUFNO0FBQ3REO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixXQUFPLFlBQVksZ0JBQWdCLFFBQVEsR0FBRyxTQUFTO0FBQ3ZELFdBQU8sWUFBWSxnQkFBZ0IsZUFBZSxHQUFHLGdCQUFnQjtBQUVyRSxvQkFBZ0IsaUJBQWlCLFdBQVc7QUFDNUMsb0JBQWdCLHdCQUF3QixrQkFBa0I7QUFFMUQsV0FBTyxZQUFZLGdCQUFnQixRQUFRLEdBQUcsV0FBVztBQUN6RCxXQUFPLFlBQVksZ0JBQWdCLGVBQWUsR0FBRyxrQkFBa0I7QUFFdkUsV0FBTyxZQUFZLHVCQUF1QixDQUFDO0FBRTNDLG9CQUFnQixRQUFRO0FBR3hCLFVBQU0sWUFBWSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sd0JBQXdCLEdBQUcsUUFBVyxRQUFXLFdBQVcsZ0JBQWdCO0FBRXBJLDRCQUF3QjtBQUN4QixnQkFBWSxJQUFJLFVBQVUsaUJBQWlCLE1BQU07QUFDaEQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFdBQU8sZUFBZSxVQUFVLFFBQVEsR0FBRyxTQUFTO0FBQ3BELFdBQU8sZUFBZSxVQUFVLGVBQWUsR0FBRyxnQkFBZ0I7QUFFbEUsY0FBVSxpQkFBaUIsV0FBVztBQUN0QyxjQUFVLHdCQUF3QixrQkFBa0I7QUFFcEQsV0FBTyxlQUFlLFVBQVUsUUFBUSxHQUFHLFdBQVc7QUFDdEQsV0FBTyxlQUFlLFVBQVUsZUFBZSxHQUFHLGtCQUFrQjtBQUVwRSxXQUFPLFlBQVksdUJBQXVCLENBQUM7QUFBQSxFQUM1QyxDQUFDO0FBRUQsT0FBSyw0QkFBNEIsaUJBQWtCO0FBQ2xELFVBQU0sUUFBUSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sd0JBQXdCLENBQUM7QUFFN0UsUUFBSSxnQkFBZ0I7QUFDcEIsZ0JBQVksSUFBSSxNQUFNLHdCQUF3QixNQUFNO0FBQ25EO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFFBQVEsWUFBWSxJQUFJLE1BQU0sU0FBUyxnQkFBZ0IsTUFBTSxRQUFRLE1BQU0sUUFBUSxDQUFDO0FBRTFGLFdBQU8sWUFBWSxNQUFNLFdBQVcsR0FBRyxLQUFLO0FBQzVDLFdBQU8sWUFBWSxNQUFNLGNBQWMsd0JBQXdCLFFBQVEsR0FBRyxLQUFLO0FBQy9FLFdBQU8sWUFBWSxNQUFNLFdBQVcsR0FBRyxLQUFLO0FBRTVDLFVBQU0sT0FBTyxNQUFNLFNBQVMsWUFBWSxRQUFRLE1BQU0sVUFBVSxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFFekYsUUFBSTtBQUNILGVBQVMsWUFBWSx1QkFBdUIsSUFBSSxtQ0FBbUMsMkJBQTJCLEVBQUUsR0FBRyxNQUFNLFVBQVUsS0FBSyxDQUFDO0FBQ3pJLFlBQU0sTUFBTSxRQUFRO0FBQUEsSUFDckIsVUFBRTtBQUNELGVBQVMsWUFBWSx1QkFBdUI7QUFBQSxJQUM3QztBQUVBLFdBQU8sWUFBWSxDQUFDLENBQUMsTUFBTSxXQUFXLEdBQUcsSUFBSTtBQUM3QyxXQUFPLFlBQVksTUFBTSxjQUFjLHdCQUF3QixRQUFRLEdBQUcsSUFBSTtBQUM5RSxXQUFPLFlBQVksQ0FBQyxDQUFDLE1BQU0sV0FBVyxHQUFHLElBQUk7QUFDN0MsV0FBTyxZQUFZLGVBQWUsQ0FBQztBQUVuQyxRQUFJO0FBQ0gsZUFBUyxZQUFZLHVCQUF1QixJQUFJLG1DQUFtQywyQkFBMkIsRUFBRSxHQUFHLE1BQU0sVUFBVSxNQUFNLENBQUM7QUFDMUksWUFBTSxNQUFNLFFBQVE7QUFBQSxJQUNyQixVQUFFO0FBQ0QsZUFBUyxZQUFZLHVCQUF1QjtBQUFBLElBQzdDO0FBRUEsV0FBTyxZQUFZLE1BQU0sV0FBVyxHQUFHLEtBQUs7QUFDNUMsV0FBTyxZQUFZLE1BQU0sY0FBYyx3QkFBd0IsUUFBUSxHQUFHLEtBQUs7QUFDL0UsV0FBTyxZQUFZLE1BQU0sV0FBVyxHQUFHLEtBQUs7QUFDNUMsV0FBTyxZQUFZLGVBQWUsQ0FBQztBQUFBLEVBQ3BDLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFsiaW5zdGFudGlhdGlvblNlcnZpY2UiLCAiYWNjZXNzb3IiXQp9Cg==
