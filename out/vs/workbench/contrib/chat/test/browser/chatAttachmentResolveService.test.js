import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { BrowserViewSharingState, IBrowserViewWorkbenchService } from "../../../browserView/common/browserView.js";
import { BrowserEditorInput } from "../../../browserView/common/browserEditorInput.js";
import { BrowserViewUri } from "../../../../../platform/browserView/common/browserViewUri.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { ChatAttachmentResolveService } from "../../browser/attachments/chatAttachmentResolveService.js";
import { createFileStat } from "../../../../test/common/workbenchTestServices.js";
suite("ChatAttachmentResolveService", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let service;
  let directoryTree;
  let imageFileUris;
  let knownBrowserViews;
  let fileStatCalls;
  setup(() => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    directoryTree = /* @__PURE__ */ new Map();
    imageFileUris = /* @__PURE__ */ new Set();
    knownBrowserViews = /* @__PURE__ */ new Map();
    fileStatCalls = 0;
    instantiationService.stub(IFileService, {
      stat: async (resource) => {
        fileStatCalls++;
        return createFileStat(resource, false, true, false);
      },
      resolve: async (resource) => {
        const children = directoryTree.get(resource.toString());
        if (children !== void 0) {
          return createFileStat(resource, false, false, true, false, children);
        }
        return createFileStat(resource, false, true, false);
      }
    });
    instantiationService.stub(IEditorService, {});
    instantiationService.stub(ITextModelService, {});
    instantiationService.stub(IExtensionService, {});
    instantiationService.stub(IDialogService, {});
    instantiationService.stub(IBrowserViewWorkbenchService, { getKnownBrowserViews: () => knownBrowserViews });
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IThemeService, new TestThemeService());
    service = instantiationService.createInstance(ChatAttachmentResolveService);
    service.resolveImageEditorAttachContext = async (resource) => {
      if (imageFileUris.has(resource.toString())) {
        return {
          id: resource.toString(),
          name: resource.path.split("/").pop(),
          value: new Uint8Array([1, 2, 3]),
          kind: "image"
        };
      }
      return void 0;
    };
  });
  test("resolves associated browser editor inputs through the live browser", async () => {
    const browserId = "browser-id";
    const associatedResource = URI.file("/workspace/index.html");
    const browserEditor = testDisposables.add(instantiationService.createInstance(BrowserEditorInput, {
      id: browserId,
      associatedResource
    }, async () => {
      throw new Error("Unexpected browser editor resolution.");
    }));
    knownBrowserViews.set(browserId, browserEditor);
    let resolvedBrowserId;
    service.resolveBrowserViewAttachContext = async (id) => {
      resolvedBrowserId = id;
      return void 0;
    };
    await service.resolveEditorAttachContext({
      resource: associatedResource,
      options: { override: BrowserEditorInput.EDITOR_ID }
    });
    assert.deepStrictEqual({
      resolvedBrowserId,
      fileStatCalls
    }, {
      resolvedBrowserId: browserId,
      fileStatCalls: 0
    });
  });
  test("does not treat an unknown transferred browser editor as a file", async () => {
    const result = await service.resolveEditorAttachContext({
      resource: URI.file("/workspace/index.html"),
      options: { override: BrowserEditorInput.EDITOR_ID }
    });
    assert.deepStrictEqual({
      result,
      fileStatCalls
    }, {
      result: void 0,
      fileStatCalls: 0
    });
  });
  test("returns empty array for empty directory", async () => {
    const dirUri = URI.file("/test/empty-dir");
    directoryTree.set(dirUri.toString(), []);
    const result = await service.resolveDirectoryImages(dirUri);
    assert.deepStrictEqual(result, []);
  });
  test("returns image entries for image files in directory", async () => {
    const dirUri = URI.file("/test/images-dir");
    const pngUri = URI.file("/test/images-dir/photo.png");
    const jpgUri = URI.file("/test/images-dir/photo.jpg");
    const txtUri = URI.file("/test/images-dir/readme.txt");
    directoryTree.set(dirUri.toString(), [
      { resource: pngUri, isFile: true, isDirectory: false },
      { resource: jpgUri, isFile: true, isDirectory: false },
      { resource: txtUri, isFile: true, isDirectory: false }
    ]);
    imageFileUris.add(pngUri.toString());
    imageFileUris.add(jpgUri.toString());
    const result = await service.resolveDirectoryImages(dirUri);
    assert.strictEqual(result.length, 2);
    assert.ok(result.every((e) => e.kind === "image"));
    const names = result.map((e) => e.name).sort();
    assert.deepStrictEqual(names, ["photo.jpg", "photo.png"]);
  });
  test("ignores non-image files", async () => {
    const dirUri = URI.file("/test/text-dir");
    const txtUri = URI.file("/test/text-dir/file.txt");
    const tsUri = URI.file("/test/text-dir/index.ts");
    directoryTree.set(dirUri.toString(), [
      { resource: txtUri, isFile: true, isDirectory: false },
      { resource: tsUri, isFile: true, isDirectory: false }
    ]);
    const result = await service.resolveDirectoryImages(dirUri);
    assert.deepStrictEqual(result, []);
  });
  test("recursively discovers images in subdirectories", async () => {
    const rootUri = URI.file("/test/root");
    const subDirUri = URI.file("/test/root/subdir");
    const deepDirUri = URI.file("/test/root/subdir/deep");
    const rootPng = URI.file("/test/root/logo.png");
    const subPng = URI.file("/test/root/subdir/banner.webp");
    const deepJpg = URI.file("/test/root/subdir/deep/photo.jpeg");
    const deepTxt = URI.file("/test/root/subdir/deep/notes.txt");
    directoryTree.set(rootUri.toString(), [
      { resource: rootPng, isFile: true, isDirectory: false },
      { resource: subDirUri, isFile: false, isDirectory: true }
    ]);
    directoryTree.set(subDirUri.toString(), [
      { resource: subPng, isFile: true, isDirectory: false },
      { resource: deepDirUri, isFile: false, isDirectory: true }
    ]);
    directoryTree.set(deepDirUri.toString(), [
      { resource: deepJpg, isFile: true, isDirectory: false },
      { resource: deepTxt, isFile: true, isDirectory: false }
    ]);
    imageFileUris.add(rootPng.toString());
    imageFileUris.add(subPng.toString());
    imageFileUris.add(deepJpg.toString());
    const result = await service.resolveDirectoryImages(rootUri);
    assert.strictEqual(result.length, 3);
    assert.ok(result.every((e) => e.kind === "image"));
    const names = result.map((e) => e.name).sort();
    assert.deepStrictEqual(names, ["banner.webp", "logo.png", "photo.jpeg"]);
  });
  test("handles unreadable directory gracefully", async () => {
    const dirUri = URI.file("/test/unreadable");
    instantiationService.stub(IFileService, {
      resolve: async (resource) => {
        if (resource.toString() === dirUri.toString()) {
          throw new Error("Permission denied");
        }
        return createFileStat(resource, false, true, false);
      }
    });
    service = instantiationService.createInstance(ChatAttachmentResolveService);
    service.resolveImageEditorAttachContext = async (resource) => {
      if (imageFileUris.has(resource.toString())) {
        return {
          id: resource.toString(),
          name: resource.path.split("/").pop(),
          value: new Uint8Array([1, 2, 3]),
          kind: "image"
        };
      }
      return void 0;
    };
    const result = await service.resolveDirectoryImages(dirUri);
    assert.deepStrictEqual(result, []);
  });
  test("handles mixed directory with images and non-images", async () => {
    const dirUri = URI.file("/test/mixed");
    const gifUri = URI.file("/test/mixed/animation.gif");
    const jsUri = URI.file("/test/mixed/script.js");
    const bmpUri = URI.file("/test/mixed/icon.bmp");
    directoryTree.set(dirUri.toString(), [
      { resource: gifUri, isFile: true, isDirectory: false },
      { resource: jsUri, isFile: true, isDirectory: false },
      { resource: bmpUri, isFile: true, isDirectory: false }
    ]);
    imageFileUris.add(gifUri.toString());
    imageFileUris.add(bmpUri.toString());
    const result = await service.resolveDirectoryImages(dirUri);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "animation.gif");
  });
});
suite("ChatAttachmentResolveService - resolveBrowserViewAttachContext", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let service;
  let browserViews;
  setup(() => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    browserViews = /* @__PURE__ */ new Map();
    instantiationService.stub(IFileService, {
      resolve: async (resource) => createFileStat(resource, false, true, false)
    });
    instantiationService.stub(IEditorService, {});
    instantiationService.stub(ITextModelService, {});
    instantiationService.stub(IExtensionService, {});
    instantiationService.stub(IDialogService, {});
    instantiationService.stub(IBrowserViewWorkbenchService, {
      getKnownBrowserViews: () => browserViews
    });
    service = instantiationService.createInstance(ChatAttachmentResolveService);
  });
  function makeMockEditor(id, opts) {
    const resource = BrowserViewUri.forId(id);
    const model = {
      sharingState: opts.sharingState,
      setSharedWithAgent: async () => opts.setSharedResult ?? true
    };
    return {
      id,
      resource,
      model,
      getName: () => `Page ${id}`,
      getTitle: () => `Title ${id}`,
      resolve: async () => model
    };
  }
  test("returns undefined for unknown browser id", async () => {
    const result = await service.resolveBrowserViewAttachContext("nonexistent");
    assert.strictEqual(result, void 0);
  });
  test("returns entry when already shared", async () => {
    const editor = makeMockEditor("b1", { sharingState: BrowserViewSharingState.Shared });
    browserViews.set("b1", editor);
    const result = await service.resolveBrowserViewAttachContext("b1");
    assert.ok(result);
    assert.strictEqual(result.kind, "browserView");
    assert.strictEqual(result.browserId, "b1");
    assert.strictEqual(result.name, "Page b1");
  });
  test("prompts for sharing when NotShared and user accepts", async () => {
    const editor = makeMockEditor("b2", { sharingState: BrowserViewSharingState.NotShared, setSharedResult: true });
    browserViews.set("b2", editor);
    const result = await service.resolveBrowserViewAttachContext("b2");
    assert.ok(result);
    assert.strictEqual(result.kind, "browserView");
    assert.strictEqual(result.browserId, "b2");
  });
  test("returns undefined when NotShared and user denies", async () => {
    const editor = makeMockEditor("b3", { sharingState: BrowserViewSharingState.NotShared, setSharedResult: false });
    browserViews.set("b3", editor);
    const result = await service.resolveBrowserViewAttachContext("b3");
    assert.strictEqual(result, void 0);
  });
  test("resolves model if not yet resolved", async () => {
    const resource = BrowserViewUri.forId("b4");
    const model = {
      sharingState: BrowserViewSharingState.Shared,
      setSharedWithAgent: async () => true
    };
    let resolved = false;
    const editor = {
      id: "b4",
      resource,
      model: void 0,
      // model not yet resolved
      getName: () => "Unresolved Page",
      getTitle: () => "Unresolved Title",
      resolve: async () => {
        resolved = true;
        editor.model = model;
        return model;
      }
    };
    browserViews.set("b4", editor);
    const result = await service.resolveBrowserViewAttachContext("b4");
    assert.ok(resolved, "resolve() should have been called");
    assert.ok(result);
    assert.strictEqual(result.kind, "browserView");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZSwgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSwgSUJyb3dzZXJWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld1VyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlld1VyaS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5cbnN1aXRlKCdDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHNlcnZpY2U6IENoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2U7XG5cblx0LyoqXG5cdCAqIE1hcCBmcm9tIGRpcmVjdG9yeSBVUkkgc3RyaW5nIHRvIGNoaWxkcmVuLCBzaW11bGF0aW5nIGEgZmlsZSB0cmVlLlxuXHQgKiBQb3B1bGF0ZWQgcGVyLXRlc3QgdG8gY29udHJvbCB0aGUgbW9jayBkaXJlY3Rvcnkgc3RydWN0dXJlLlxuXHQgKi9cblx0bGV0IGRpcmVjdG9yeVRyZWU6IE1hcDxzdHJpbmcsIHsgcmVzb3VyY2U6IFVSSTsgaXNGaWxlOiBib29sZWFuOyBpc0RpcmVjdG9yeTogYm9vbGVhbiB9W10+O1xuXG5cdC8qKlxuXHQgKiBTZXQgb2YgZmlsZSBVUkkgc3RyaW5ncyB0aGF0IHNob3VsZCBiZSB0cmVhdGVkIGFzIHZhbGlkIGltYWdlc1xuXHQgKiBieSB0aGUgbW9ja2VkIHJlc29sdmVJbWFnZUVkaXRvckF0dGFjaENvbnRleHQuXG5cdCAqL1xuXHRsZXQgaW1hZ2VGaWxlVXJpczogU2V0PHN0cmluZz47XG5cdGxldCBrbm93bkJyb3dzZXJWaWV3czogTWFwPHN0cmluZywgQnJvd3NlckVkaXRvcklucHV0Pjtcblx0bGV0IGZpbGVTdGF0Q2FsbHM6IG51bWJlcjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0ZGlyZWN0b3J5VHJlZSA9IG5ldyBNYXAoKTtcblx0XHRpbWFnZUZpbGVVcmlzID0gbmV3IFNldCgpO1xuXHRcdGtub3duQnJvd3NlclZpZXdzID0gbmV3IE1hcCgpO1xuXHRcdGZpbGVTdGF0Q2FsbHMgPSAwO1xuXG5cdFx0Ly8gU3R1YiBJRmlsZVNlcnZpY2Ugd2l0aCByZXNvbHZlKCkgdGhhdCB1c2VzIHRoZSBkaXJlY3RvcnlUcmVlIG1hcFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7XG5cdFx0XHRzdGF0OiBhc3luYyAocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiA9PiB7XG5cdFx0XHRcdGZpbGVTdGF0Q2FsbHMrKztcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmU6IGFzeW5jIChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+ID0+IHtcblx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBkaXJlY3RvcnlUcmVlLmdldChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKGNoaWxkcmVuICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gY3JlYXRlRmlsZVN0YXQocmVzb3VyY2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UsIGNoaWxkcmVuKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBUcmVhdCBhcyBhIGZpbGVcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRleHRNb2RlbFNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSwgeyBnZXRLbm93bkJyb3dzZXJWaWV3czogKCkgPT4ga25vd25Ccm93c2VyVmlld3MgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRoZW1lU2VydmljZSwgbmV3IFRlc3RUaGVtZVNlcnZpY2UoKSk7XG5cblx0XHRzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSk7XG5cblx0XHQvLyBPdmVycmlkZSByZXNvbHZlSW1hZ2VFZGl0b3JBdHRhY2hDb250ZXh0IHRvIGF2b2lkIERPTSBkZXBlbmRlbmNpZXMgKGNhbnZhcywgSW1hZ2UsIGV0Yy4pXG5cdFx0Ly8gYW5kIHJldHVybiBhIHByZWRpY3RhYmxlIGltYWdlIGVudHJ5IGZvciBmaWxlcyBpbiB0aGUgaW1hZ2VGaWxlVXJpcyBzZXQuXG5cdFx0c2VydmljZS5yZXNvbHZlSW1hZ2VFZGl0b3JBdHRhY2hDb250ZXh0ID0gYXN5bmMgKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdGlmIChpbWFnZUZpbGVVcmlzLmhhcyhyZXNvdXJjZS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6IHJlc291cmNlLnBhdGguc3BsaXQoJy8nKS5wb3AoKSEsXG5cdFx0XHRcdFx0dmFsdWU6IG5ldyBVaW50OEFycmF5KFsxLCAyLCAzXSksXG5cdFx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgYXNzb2NpYXRlZCBicm93c2VyIGVkaXRvciBpbnB1dHMgdGhyb3VnaCB0aGUgbGl2ZSBicm93c2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJyb3dzZXJJZCA9ICdicm93c2VyLWlkJztcblx0XHRjb25zdCBhc3NvY2lhdGVkUmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbmRleC5odG1sJyk7XG5cdFx0Y29uc3QgYnJvd3NlckVkaXRvciA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlckVkaXRvcklucHV0LCB7XG5cdFx0XHRpZDogYnJvd3NlcklkLFxuXHRcdFx0YXNzb2NpYXRlZFJlc291cmNlXG5cdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGJyb3dzZXIgZWRpdG9yIHJlc29sdXRpb24uJyk7XG5cdFx0fSkpO1xuXHRcdGtub3duQnJvd3NlclZpZXdzLnNldChicm93c2VySWQsIGJyb3dzZXJFZGl0b3IpO1xuXHRcdGxldCByZXNvbHZlZEJyb3dzZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHNlcnZpY2UucmVzb2x2ZUJyb3dzZXJWaWV3QXR0YWNoQ29udGV4dCA9IGFzeW5jIGlkID0+IHtcblx0XHRcdHJlc29sdmVkQnJvd3NlcklkID0gaWQ7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3JBdHRhY2hDb250ZXh0KHtcblx0XHRcdHJlc291cmNlOiBhc3NvY2lhdGVkUmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiB7IG92ZXJyaWRlOiBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lEIH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb2x2ZWRCcm93c2VySWQsXG5cdFx0XHRmaWxlU3RhdENhbGxzXG5cdFx0fSwge1xuXHRcdFx0cmVzb2x2ZWRCcm93c2VySWQ6IGJyb3dzZXJJZCxcblx0XHRcdGZpbGVTdGF0Q2FsbHM6IDBcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgdHJlYXQgYW4gdW5rbm93biB0cmFuc2ZlcnJlZCBicm93c2VyIGVkaXRvciBhcyBhIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yQXR0YWNoQ29udGV4dCh7XG5cdFx0XHRyZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvaW5kZXguaHRtbCcpLFxuXHRcdFx0b3B0aW9uczogeyBvdmVycmlkZTogQnJvd3NlckVkaXRvcklucHV0LkVESVRPUl9JRCB9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdCxcblx0XHRcdGZpbGVTdGF0Q2FsbHNcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTdGF0Q2FsbHM6IDBcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBhcnJheSBmb3IgZW1wdHkgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpclVyaSA9IFVSSS5maWxlKCcvdGVzdC9lbXB0eS1kaXInKTtcblx0XHRkaXJlY3RvcnlUcmVlLnNldChkaXJVcmkudG9TdHJpbmcoKSwgW10pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRGlyZWN0b3J5SW1hZ2VzKGRpclVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBpbWFnZSBlbnRyaWVzIGZvciBpbWFnZSBmaWxlcyBpbiBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyVXJpID0gVVJJLmZpbGUoJy90ZXN0L2ltYWdlcy1kaXInKTtcblx0XHRjb25zdCBwbmdVcmkgPSBVUkkuZmlsZSgnL3Rlc3QvaW1hZ2VzLWRpci9waG90by5wbmcnKTtcblx0XHRjb25zdCBqcGdVcmkgPSBVUkkuZmlsZSgnL3Rlc3QvaW1hZ2VzLWRpci9waG90by5qcGcnKTtcblx0XHRjb25zdCB0eHRVcmkgPSBVUkkuZmlsZSgnL3Rlc3QvaW1hZ2VzLWRpci9yZWFkbWUudHh0Jyk7XG5cblx0XHRkaXJlY3RvcnlUcmVlLnNldChkaXJVcmkudG9TdHJpbmcoKSwgW1xuXHRcdFx0eyByZXNvdXJjZTogcG5nVXJpLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSB9LFxuXHRcdFx0eyByZXNvdXJjZToganBnVXJpLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSB9LFxuXHRcdFx0eyByZXNvdXJjZTogdHh0VXJpLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSB9LFxuXHRcdF0pO1xuXHRcdGltYWdlRmlsZVVyaXMuYWRkKHBuZ1VyaS50b1N0cmluZygpKTtcblx0XHRpbWFnZUZpbGVVcmlzLmFkZChqcGdVcmkudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVEaXJlY3RvcnlJbWFnZXMoZGlyVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ldmVyeShlID0+IGUua2luZCA9PT0gJ2ltYWdlJykpO1xuXHRcdGNvbnN0IG5hbWVzID0gcmVzdWx0Lm1hcChlID0+IGUubmFtZSkuc29ydCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmFtZXMsIFsncGhvdG8uanBnJywgJ3Bob3RvLnBuZyddKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBub24taW1hZ2UgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyVXJpID0gVVJJLmZpbGUoJy90ZXN0L3RleHQtZGlyJyk7XG5cdFx0Y29uc3QgdHh0VXJpID0gVVJJLmZpbGUoJy90ZXN0L3RleHQtZGlyL2ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgdHNVcmkgPSBVUkkuZmlsZSgnL3Rlc3QvdGV4dC1kaXIvaW5kZXgudHMnKTtcblxuXHRcdGRpcmVjdG9yeVRyZWUuc2V0KGRpclVyaS50b1N0cmluZygpLCBbXG5cdFx0XHR7IHJlc291cmNlOiB0eHRVcmksIGlzRmlsZTogdHJ1ZSwgaXNEaXJlY3Rvcnk6IGZhbHNlIH0sXG5cdFx0XHR7IHJlc291cmNlOiB0c1VyaSwgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UgfSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZURpcmVjdG9yeUltYWdlcyhkaXJVcmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY3Vyc2l2ZWx5IGRpc2NvdmVycyBpbWFnZXMgaW4gc3ViZGlyZWN0b3JpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdFVyaSA9IFVSSS5maWxlKCcvdGVzdC9yb290Jyk7XG5cdFx0Y29uc3Qgc3ViRGlyVXJpID0gVVJJLmZpbGUoJy90ZXN0L3Jvb3Qvc3ViZGlyJyk7XG5cdFx0Y29uc3QgZGVlcERpclVyaSA9IFVSSS5maWxlKCcvdGVzdC9yb290L3N1YmRpci9kZWVwJyk7XG5cblx0XHRjb25zdCByb290UG5nID0gVVJJLmZpbGUoJy90ZXN0L3Jvb3QvbG9nby5wbmcnKTtcblx0XHRjb25zdCBzdWJQbmcgPSBVUkkuZmlsZSgnL3Rlc3Qvcm9vdC9zdWJkaXIvYmFubmVyLndlYnAnKTtcblx0XHRjb25zdCBkZWVwSnBnID0gVVJJLmZpbGUoJy90ZXN0L3Jvb3Qvc3ViZGlyL2RlZXAvcGhvdG8uanBlZycpO1xuXHRcdGNvbnN0IGRlZXBUeHQgPSBVUkkuZmlsZSgnL3Rlc3Qvcm9vdC9zdWJkaXIvZGVlcC9ub3Rlcy50eHQnKTtcblxuXHRcdGRpcmVjdG9yeVRyZWUuc2V0KHJvb3RVcmkudG9TdHJpbmcoKSwgW1xuXHRcdFx0eyByZXNvdXJjZTogcm9vdFBuZywgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UgfSxcblx0XHRcdHsgcmVzb3VyY2U6IHN1YkRpclVyaSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRdKTtcblx0XHRkaXJlY3RvcnlUcmVlLnNldChzdWJEaXJVcmkudG9TdHJpbmcoKSwgW1xuXHRcdFx0eyByZXNvdXJjZTogc3ViUG5nLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSB9LFxuXHRcdFx0eyByZXNvdXJjZTogZGVlcERpclVyaSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRdKTtcblx0XHRkaXJlY3RvcnlUcmVlLnNldChkZWVwRGlyVXJpLnRvU3RyaW5nKCksIFtcblx0XHRcdHsgcmVzb3VyY2U6IGRlZXBKcGcsIGlzRmlsZTogdHJ1ZSwgaXNEaXJlY3Rvcnk6IGZhbHNlIH0sXG5cdFx0XHR7IHJlc291cmNlOiBkZWVwVHh0LCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSB9LFxuXHRcdF0pO1xuXG5cdFx0aW1hZ2VGaWxlVXJpcy5hZGQocm9vdFBuZy50b1N0cmluZygpKTtcblx0XHRpbWFnZUZpbGVVcmlzLmFkZChzdWJQbmcudG9TdHJpbmcoKSk7XG5cdFx0aW1hZ2VGaWxlVXJpcy5hZGQoZGVlcEpwZy50b1N0cmluZygpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZURpcmVjdG9yeUltYWdlcyhyb290VXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ldmVyeShlID0+IGUua2luZCA9PT0gJ2ltYWdlJykpO1xuXHRcdGNvbnN0IG5hbWVzID0gcmVzdWx0Lm1hcChlID0+IGUubmFtZSkuc29ydCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmFtZXMsIFsnYmFubmVyLndlYnAnLCAnbG9nby5wbmcnLCAncGhvdG8uanBlZyddKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyB1bnJlYWRhYmxlIGRpcmVjdG9yeSBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpclVyaSA9IFVSSS5maWxlKCcvdGVzdC91bnJlYWRhYmxlJyk7XG5cdFx0Ly8gT3ZlcnJpZGUgcmVzb2x2ZSB0byB0aHJvdyBmb3IgdGhpcyBVUklcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0cmVzb2x2ZTogYXN5bmMgKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4gPT4ge1xuXHRcdFx0XHRpZiAocmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gZGlyVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Blcm1pc3Npb24gZGVuaWVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdC8vIFJlLWNyZWF0ZSBzZXJ2aWNlIHdpdGggdGhlIG5ldyBzdHViXG5cdFx0c2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2UucmVzb2x2ZUltYWdlRWRpdG9yQXR0YWNoQ29udGV4dCA9IGFzeW5jIChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRpZiAoaW1hZ2VGaWxlVXJpcy5oYXMocmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiByZXNvdXJjZS5wYXRoLnNwbGl0KCcvJykucG9wKCkhLFxuXHRcdFx0XHRcdHZhbHVlOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pLFxuXHRcdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVEaXJlY3RvcnlJbWFnZXMoZGlyVXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG1peGVkIGRpcmVjdG9yeSB3aXRoIGltYWdlcyBhbmQgbm9uLWltYWdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXJVcmkgPSBVUkkuZmlsZSgnL3Rlc3QvbWl4ZWQnKTtcblx0XHRjb25zdCBnaWZVcmkgPSBVUkkuZmlsZSgnL3Rlc3QvbWl4ZWQvYW5pbWF0aW9uLmdpZicpO1xuXHRcdGNvbnN0IGpzVXJpID0gVVJJLmZpbGUoJy90ZXN0L21peGVkL3NjcmlwdC5qcycpO1xuXHRcdGNvbnN0IGJtcFVyaSA9IFVSSS5maWxlKCcvdGVzdC9taXhlZC9pY29uLmJtcCcpO1xuXG5cdFx0ZGlyZWN0b3J5VHJlZS5zZXQoZGlyVXJpLnRvU3RyaW5nKCksIFtcblx0XHRcdHsgcmVzb3VyY2U6IGdpZlVyaSwgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UgfSxcblx0XHRcdHsgcmVzb3VyY2U6IGpzVXJpLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSB9LFxuXHRcdFx0eyByZXNvdXJjZTogYm1wVXJpLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSB9LFxuXHRcdF0pO1xuXHRcdGltYWdlRmlsZVVyaXMuYWRkKGdpZlVyaS50b1N0cmluZygpKTtcblx0XHRpbWFnZUZpbGVVcmlzLmFkZChibXBVcmkudG9TdHJpbmcoKSk7XG5cdFx0Ly8gYm1wIGlzIE5PVCBpbiBDSEFUX0FUVEFDSEFCTEVfSU1BR0VfTUlNRV9UWVBFUyAob25seSBwbmcsIGpwZywganBlZywgZ2lmLCB3ZWJwKVxuXHRcdC8vIHNvIGl0IHNob3VsZCBiZSBza2lwcGVkIGJ5IHRoZSByZWdleCBldmVuIHRob3VnaCBpdCB3b3VsZCByZXNvbHZlIHN1Y2Nlc3NmdWxseVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRGlyZWN0b3J5SW1hZ2VzKGRpclVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZSwgJ2FuaW1hdGlvbi5naWYnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgLSByZXNvbHZlQnJvd3NlclZpZXdBdHRhY2hDb250ZXh0JywgKCkgPT4ge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHNlcnZpY2U6IENoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2U7XG5cdGxldCBicm93c2VyVmlld3M6IE1hcDxzdHJpbmcsIFBhcnRpYWw8QnJvd3NlckVkaXRvcklucHV0Pj47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGJyb3dzZXJWaWV3cyA9IG5ldyBNYXAoKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7XG5cdFx0XHRyZXNvbHZlOiBhc3luYyAocmVzb3VyY2U6IFVSSSkgPT4gY3JlYXRlRmlsZVN0YXQocmVzb3VyY2UsIGZhbHNlLCB0cnVlLCBmYWxzZSksXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRleHRNb2RlbFNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSwge1xuXHRcdFx0Z2V0S25vd25Ccm93c2VyVmlld3M6ICgpID0+IGJyb3dzZXJWaWV3cyBhcyBNYXA8c3RyaW5nLCBCcm93c2VyRWRpdG9ySW5wdXQ+LFxuXHRcdH0pO1xuXG5cdFx0c2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBtYWtlTW9ja0VkaXRvcihpZDogc3RyaW5nLCBvcHRzOiB7IHNoYXJpbmdTdGF0ZTogQnJvd3NlclZpZXdTaGFyaW5nU3RhdGU7IHNldFNoYXJlZFJlc3VsdD86IGJvb2xlYW4gfSk6IFBhcnRpYWw8QnJvd3NlckVkaXRvcklucHV0PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBCcm93c2VyVmlld1VyaS5mb3JJZChpZCk7XG5cdFx0Y29uc3QgbW9kZWw6IFBhcnRpYWw8SUJyb3dzZXJWaWV3TW9kZWw+ID0ge1xuXHRcdFx0c2hhcmluZ1N0YXRlOiBvcHRzLnNoYXJpbmdTdGF0ZSxcblx0XHRcdHNldFNoYXJlZFdpdGhBZ2VudDogYXN5bmMgKCkgPT4gb3B0cy5zZXRTaGFyZWRSZXN1bHQgPz8gdHJ1ZSxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bW9kZWw6IG1vZGVsIGFzIElCcm93c2VyVmlld01vZGVsLFxuXHRcdFx0Z2V0TmFtZTogKCkgPT4gYFBhZ2UgJHtpZH1gLFxuXHRcdFx0Z2V0VGl0bGU6ICgpID0+IGBUaXRsZSAke2lkfWAsXG5cdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiBtb2RlbCBhcyBJQnJvd3NlclZpZXdNb2RlbCxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHVua25vd24gYnJvd3NlciBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVCcm93c2VyVmlld0F0dGFjaENvbnRleHQoJ25vbmV4aXN0ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbnRyeSB3aGVuIGFscmVhZHkgc2hhcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IG1ha2VNb2NrRWRpdG9yKCdiMScsIHsgc2hhcmluZ1N0YXRlOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQgfSk7XG5cdFx0YnJvd3NlclZpZXdzLnNldCgnYjEnLCBlZGl0b3IpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlQnJvd3NlclZpZXdBdHRhY2hDb250ZXh0KCdiMScpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQua2luZCwgJ2Jyb3dzZXJWaWV3Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5icm93c2VySWQsICdiMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubmFtZSwgJ1BhZ2UgYjEnKTtcblx0fSk7XG5cblx0dGVzdCgncHJvbXB0cyBmb3Igc2hhcmluZyB3aGVuIE5vdFNoYXJlZCBhbmQgdXNlciBhY2NlcHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IG1ha2VNb2NrRWRpdG9yKCdiMicsIHsgc2hhcmluZ1N0YXRlOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5Ob3RTaGFyZWQsIHNldFNoYXJlZFJlc3VsdDogdHJ1ZSB9KTtcblx0XHRicm93c2VyVmlld3Muc2V0KCdiMicsIGVkaXRvcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVCcm93c2VyVmlld0F0dGFjaENvbnRleHQoJ2IyJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5raW5kLCAnYnJvd3NlclZpZXcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJyb3dzZXJJZCwgJ2IyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gTm90U2hhcmVkIGFuZCB1c2VyIGRlbmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBtYWtlTW9ja0VkaXRvcignYjMnLCB7IHNoYXJpbmdTdGF0ZTogQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuTm90U2hhcmVkLCBzZXRTaGFyZWRSZXN1bHQ6IGZhbHNlIH0pO1xuXHRcdGJyb3dzZXJWaWV3cy5zZXQoJ2IzJywgZWRpdG9yKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUJyb3dzZXJWaWV3QXR0YWNoQ29udGV4dCgnYjMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBtb2RlbCBpZiBub3QgeWV0IHJlc29sdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gQnJvd3NlclZpZXdVcmkuZm9ySWQoJ2I0Jyk7XG5cdFx0Y29uc3QgbW9kZWw6IFBhcnRpYWw8SUJyb3dzZXJWaWV3TW9kZWw+ID0ge1xuXHRcdFx0c2hhcmluZ1N0YXRlOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQsXG5cdFx0XHRzZXRTaGFyZWRXaXRoQWdlbnQ6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0fTtcblx0XHRsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBlZGl0b3I6IFBhcnRpYWw8QnJvd3NlckVkaXRvcklucHV0PiA9IHtcblx0XHRcdGlkOiAnYjQnLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRtb2RlbDogdW5kZWZpbmVkLCAvLyBtb2RlbCBub3QgeWV0IHJlc29sdmVkXG5cdFx0XHRnZXROYW1lOiAoKSA9PiAnVW5yZXNvbHZlZCBQYWdlJyxcblx0XHRcdGdldFRpdGxlOiAoKSA9PiAnVW5yZXNvbHZlZCBUaXRsZScsXG5cdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0KGVkaXRvciBhcyBQYXJ0aWFsPEJyb3dzZXJFZGl0b3JJbnB1dD4pLm1vZGVsID0gbW9kZWwgYXMgSUJyb3dzZXJWaWV3TW9kZWw7XG5cdFx0XHRcdHJldHVybiBtb2RlbCBhcyBJQnJvd3NlclZpZXdNb2RlbDtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRicm93c2VyVmlld3Muc2V0KCdiNCcsIGVkaXRvcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVCcm93c2VyVmlld0F0dGFjaENvbnRleHQoJ2I0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkLCAncmVzb2x2ZSgpIHNob3VsZCBoYXZlIGJlZW4gY2FsbGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5raW5kLCAnYnJvd3NlclZpZXcnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBMkM7QUFDcEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUIsb0NBQXVEO0FBQ3pGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsc0JBQXNCO0FBRy9CLE1BQU0sZ0NBQWdDLE1BQU07QUFDM0MsUUFBTSxrQkFBa0Isd0NBQXdDO0FBRWhFLE1BQUk7QUFDSixNQUFJO0FBTUosTUFBSTtBQU1KLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLDJCQUF1QixnQkFBZ0IsSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQ3pFLG9CQUFnQixvQkFBSSxJQUFJO0FBQ3hCLG9CQUFnQixvQkFBSSxJQUFJO0FBQ3hCLHdCQUFvQixvQkFBSSxJQUFJO0FBQzVCLG9CQUFnQjtBQUdoQix5QkFBcUIsS0FBSyxjQUFjO0FBQUEsTUFDdkMsTUFBTSxPQUFPLGFBQWtEO0FBQzlEO0FBQ0EsZUFBTyxlQUFlLFVBQVUsT0FBTyxNQUFNLEtBQUs7QUFBQSxNQUNuRDtBQUFBLE1BQ0EsU0FBUyxPQUFPLGFBQWtEO0FBQ2pFLGNBQU0sV0FBVyxjQUFjLElBQUksU0FBUyxTQUFTLENBQUM7QUFDdEQsWUFBSSxhQUFhLFFBQVc7QUFDM0IsaUJBQU8sZUFBZSxVQUFVLE9BQU8sT0FBTyxNQUFNLE9BQU8sUUFBUTtBQUFBLFFBQ3BFO0FBRUEsZUFBTyxlQUFlLFVBQVUsT0FBTyxNQUFNLEtBQUs7QUFBQSxNQUNuRDtBQUFBLElBQ0QsQ0FBQztBQUVELHlCQUFxQixLQUFLLGdCQUFnQixDQUFDLENBQUM7QUFDNUMseUJBQXFCLEtBQUssbUJBQW1CLENBQUMsQ0FBQztBQUMvQyx5QkFBcUIsS0FBSyxtQkFBbUIsQ0FBQyxDQUFDO0FBQy9DLHlCQUFxQixLQUFLLGdCQUFnQixDQUFDLENBQUM7QUFDNUMseUJBQXFCLEtBQUssOEJBQThCLEVBQUUsc0JBQXNCLE1BQU0sa0JBQWtCLENBQUM7QUFDekcseUJBQXFCLEtBQUssbUJBQW1CLG9CQUFvQjtBQUNqRSx5QkFBcUIsS0FBSyxlQUFlLElBQUksaUJBQWlCLENBQUM7QUFFL0QsY0FBVSxxQkFBcUIsZUFBZSw0QkFBNEI7QUFJMUUsWUFBUSxrQ0FBa0MsT0FBTyxhQUFrRTtBQUNsSCxVQUFJLGNBQWMsSUFBSSxTQUFTLFNBQVMsQ0FBQyxHQUFHO0FBQzNDLGVBQU87QUFBQSxVQUNOLElBQUksU0FBUyxTQUFTO0FBQUEsVUFDdEIsTUFBTSxTQUFTLEtBQUssTUFBTSxHQUFHLEVBQUUsSUFBSTtBQUFBLFVBQ25DLE9BQU8sSUFBSSxXQUFXLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQy9CLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLFlBQVk7QUFDbEIsVUFBTSxxQkFBcUIsSUFBSSxLQUFLLHVCQUF1QjtBQUMzRCxVQUFNLGdCQUFnQixnQkFBZ0IsSUFBSSxxQkFBcUIsZUFBZSxvQkFBb0I7QUFBQSxNQUNqRyxJQUFJO0FBQUEsTUFDSjtBQUFBLElBQ0QsR0FBRyxZQUFZO0FBQ2QsWUFBTSxJQUFJLE1BQU0sdUNBQXVDO0FBQUEsSUFDeEQsQ0FBQyxDQUFDO0FBQ0Ysc0JBQWtCLElBQUksV0FBVyxhQUFhO0FBQzlDLFFBQUk7QUFDSixZQUFRLGtDQUFrQyxPQUFNLE9BQU07QUFDckQsMEJBQW9CO0FBQ3BCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxRQUFRLDJCQUEyQjtBQUFBLE1BQ3hDLFVBQVU7QUFBQSxNQUNWLFNBQVMsRUFBRSxVQUFVLG1CQUFtQixVQUFVO0FBQUEsSUFDbkQsQ0FBQztBQUVELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixtQkFBbUI7QUFBQSxNQUNuQixlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0VBQWtFLFlBQVk7QUFDbEYsVUFBTSxTQUFTLE1BQU0sUUFBUSwyQkFBMkI7QUFBQSxNQUN2RCxVQUFVLElBQUksS0FBSyx1QkFBdUI7QUFBQSxNQUMxQyxTQUFTLEVBQUUsVUFBVSxtQkFBbUIsVUFBVTtBQUFBLElBQ25ELENBQUM7QUFFRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsUUFBUTtBQUFBLE1BQ1IsZUFBZTtBQUFBLElBQ2hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxZQUFZO0FBQzNELFVBQU0sU0FBUyxJQUFJLEtBQUssaUJBQWlCO0FBQ3pDLGtCQUFjLElBQUksT0FBTyxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBRXZDLFVBQU0sU0FBUyxNQUFNLFFBQVEsdUJBQXVCLE1BQU07QUFDMUQsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNsQyxDQUFDO0FBRUQsT0FBSyxzREFBc0QsWUFBWTtBQUN0RSxVQUFNLFNBQVMsSUFBSSxLQUFLLGtCQUFrQjtBQUMxQyxVQUFNLFNBQVMsSUFBSSxLQUFLLDRCQUE0QjtBQUNwRCxVQUFNLFNBQVMsSUFBSSxLQUFLLDRCQUE0QjtBQUNwRCxVQUFNLFNBQVMsSUFBSSxLQUFLLDZCQUE2QjtBQUVyRCxrQkFBYyxJQUFJLE9BQU8sU0FBUyxHQUFHO0FBQUEsTUFDcEMsRUFBRSxVQUFVLFFBQVEsUUFBUSxNQUFNLGFBQWEsTUFBTTtBQUFBLE1BQ3JELEVBQUUsVUFBVSxRQUFRLFFBQVEsTUFBTSxhQUFhLE1BQU07QUFBQSxNQUNyRCxFQUFFLFVBQVUsUUFBUSxRQUFRLE1BQU0sYUFBYSxNQUFNO0FBQUEsSUFDdEQsQ0FBQztBQUNELGtCQUFjLElBQUksT0FBTyxTQUFTLENBQUM7QUFDbkMsa0JBQWMsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUVuQyxVQUFNLFNBQVMsTUFBTSxRQUFRLHVCQUF1QixNQUFNO0FBQzFELFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLEdBQUcsT0FBTyxNQUFNLE9BQUssRUFBRSxTQUFTLE9BQU8sQ0FBQztBQUMvQyxVQUFNLFFBQVEsT0FBTyxJQUFJLE9BQUssRUFBRSxJQUFJLEVBQUUsS0FBSztBQUMzQyxXQUFPLGdCQUFnQixPQUFPLENBQUMsYUFBYSxXQUFXLENBQUM7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSywyQkFBMkIsWUFBWTtBQUMzQyxVQUFNLFNBQVMsSUFBSSxLQUFLLGdCQUFnQjtBQUN4QyxVQUFNLFNBQVMsSUFBSSxLQUFLLHlCQUF5QjtBQUNqRCxVQUFNLFFBQVEsSUFBSSxLQUFLLHlCQUF5QjtBQUVoRCxrQkFBYyxJQUFJLE9BQU8sU0FBUyxHQUFHO0FBQUEsTUFDcEMsRUFBRSxVQUFVLFFBQVEsUUFBUSxNQUFNLGFBQWEsTUFBTTtBQUFBLE1BQ3JELEVBQUUsVUFBVSxPQUFPLFFBQVEsTUFBTSxhQUFhLE1BQU07QUFBQSxJQUNyRCxDQUFDO0FBRUQsVUFBTSxTQUFTLE1BQU0sUUFBUSx1QkFBdUIsTUFBTTtBQUMxRCxXQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLGtEQUFrRCxZQUFZO0FBQ2xFLFVBQU0sVUFBVSxJQUFJLEtBQUssWUFBWTtBQUNyQyxVQUFNLFlBQVksSUFBSSxLQUFLLG1CQUFtQjtBQUM5QyxVQUFNLGFBQWEsSUFBSSxLQUFLLHdCQUF3QjtBQUVwRCxVQUFNLFVBQVUsSUFBSSxLQUFLLHFCQUFxQjtBQUM5QyxVQUFNLFNBQVMsSUFBSSxLQUFLLCtCQUErQjtBQUN2RCxVQUFNLFVBQVUsSUFBSSxLQUFLLG1DQUFtQztBQUM1RCxVQUFNLFVBQVUsSUFBSSxLQUFLLGtDQUFrQztBQUUzRCxrQkFBYyxJQUFJLFFBQVEsU0FBUyxHQUFHO0FBQUEsTUFDckMsRUFBRSxVQUFVLFNBQVMsUUFBUSxNQUFNLGFBQWEsTUFBTTtBQUFBLE1BQ3RELEVBQUUsVUFBVSxXQUFXLFFBQVEsT0FBTyxhQUFhLEtBQUs7QUFBQSxJQUN6RCxDQUFDO0FBQ0Qsa0JBQWMsSUFBSSxVQUFVLFNBQVMsR0FBRztBQUFBLE1BQ3ZDLEVBQUUsVUFBVSxRQUFRLFFBQVEsTUFBTSxhQUFhLE1BQU07QUFBQSxNQUNyRCxFQUFFLFVBQVUsWUFBWSxRQUFRLE9BQU8sYUFBYSxLQUFLO0FBQUEsSUFDMUQsQ0FBQztBQUNELGtCQUFjLElBQUksV0FBVyxTQUFTLEdBQUc7QUFBQSxNQUN4QyxFQUFFLFVBQVUsU0FBUyxRQUFRLE1BQU0sYUFBYSxNQUFNO0FBQUEsTUFDdEQsRUFBRSxVQUFVLFNBQVMsUUFBUSxNQUFNLGFBQWEsTUFBTTtBQUFBLElBQ3ZELENBQUM7QUFFRCxrQkFBYyxJQUFJLFFBQVEsU0FBUyxDQUFDO0FBQ3BDLGtCQUFjLElBQUksT0FBTyxTQUFTLENBQUM7QUFDbkMsa0JBQWMsSUFBSSxRQUFRLFNBQVMsQ0FBQztBQUVwQyxVQUFNLFNBQVMsTUFBTSxRQUFRLHVCQUF1QixPQUFPO0FBQzNELFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLEdBQUcsT0FBTyxNQUFNLE9BQUssRUFBRSxTQUFTLE9BQU8sQ0FBQztBQUMvQyxVQUFNLFFBQVEsT0FBTyxJQUFJLE9BQUssRUFBRSxJQUFJLEVBQUUsS0FBSztBQUMzQyxXQUFPLGdCQUFnQixPQUFPLENBQUMsZUFBZSxZQUFZLFlBQVksQ0FBQztBQUFBLEVBQ3hFLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxZQUFZO0FBQzNELFVBQU0sU0FBUyxJQUFJLEtBQUssa0JBQWtCO0FBRTFDLHlCQUFxQixLQUFLLGNBQWM7QUFBQSxNQUN2QyxTQUFTLE9BQU8sYUFBa0Q7QUFDakUsWUFBSSxTQUFTLFNBQVMsTUFBTSxPQUFPLFNBQVMsR0FBRztBQUM5QyxnQkFBTSxJQUFJLE1BQU0sbUJBQW1CO0FBQUEsUUFDcEM7QUFDQSxlQUFPLGVBQWUsVUFBVSxPQUFPLE1BQU0sS0FBSztBQUFBLE1BQ25EO0FBQUEsSUFDRCxDQUFDO0FBRUQsY0FBVSxxQkFBcUIsZUFBZSw0QkFBNEI7QUFDMUUsWUFBUSxrQ0FBa0MsT0FBTyxhQUFrRTtBQUNsSCxVQUFJLGNBQWMsSUFBSSxTQUFTLFNBQVMsQ0FBQyxHQUFHO0FBQzNDLGVBQU87QUFBQSxVQUNOLElBQUksU0FBUyxTQUFTO0FBQUEsVUFDdEIsTUFBTSxTQUFTLEtBQUssTUFBTSxHQUFHLEVBQUUsSUFBSTtBQUFBLFVBQ25DLE9BQU8sSUFBSSxXQUFXLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQy9CLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxTQUFTLE1BQU0sUUFBUSx1QkFBdUIsTUFBTTtBQUMxRCxXQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxZQUFZO0FBQ3RFLFVBQU0sU0FBUyxJQUFJLEtBQUssYUFBYTtBQUNyQyxVQUFNLFNBQVMsSUFBSSxLQUFLLDJCQUEyQjtBQUNuRCxVQUFNLFFBQVEsSUFBSSxLQUFLLHVCQUF1QjtBQUM5QyxVQUFNLFNBQVMsSUFBSSxLQUFLLHNCQUFzQjtBQUU5QyxrQkFBYyxJQUFJLE9BQU8sU0FBUyxHQUFHO0FBQUEsTUFDcEMsRUFBRSxVQUFVLFFBQVEsUUFBUSxNQUFNLGFBQWEsTUFBTTtBQUFBLE1BQ3JELEVBQUUsVUFBVSxPQUFPLFFBQVEsTUFBTSxhQUFhLE1BQU07QUFBQSxNQUNwRCxFQUFFLFVBQVUsUUFBUSxRQUFRLE1BQU0sYUFBYSxNQUFNO0FBQUEsSUFDdEQsQ0FBQztBQUNELGtCQUFjLElBQUksT0FBTyxTQUFTLENBQUM7QUFDbkMsa0JBQWMsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUluQyxVQUFNLFNBQVMsTUFBTSxRQUFRLHVCQUF1QixNQUFNO0FBQzFELFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxlQUFlO0FBQUEsRUFDbkQsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGtFQUFrRSxNQUFNO0FBQzdFLFFBQU0sa0JBQWtCLHdDQUF3QztBQUVoRSxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCwyQkFBdUIsZ0JBQWdCLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUN6RSxtQkFBZSxvQkFBSSxJQUFJO0FBRXZCLHlCQUFxQixLQUFLLGNBQWM7QUFBQSxNQUN2QyxTQUFTLE9BQU8sYUFBa0IsZUFBZSxVQUFVLE9BQU8sTUFBTSxLQUFLO0FBQUEsSUFDOUUsQ0FBQztBQUNELHlCQUFxQixLQUFLLGdCQUFnQixDQUFDLENBQUM7QUFDNUMseUJBQXFCLEtBQUssbUJBQW1CLENBQUMsQ0FBQztBQUMvQyx5QkFBcUIsS0FBSyxtQkFBbUIsQ0FBQyxDQUFDO0FBQy9DLHlCQUFxQixLQUFLLGdCQUFnQixDQUFDLENBQUM7QUFDNUMseUJBQXFCLEtBQUssOEJBQThCO0FBQUEsTUFDdkQsc0JBQXNCLE1BQU07QUFBQSxJQUM3QixDQUFDO0FBRUQsY0FBVSxxQkFBcUIsZUFBZSw0QkFBNEI7QUFBQSxFQUMzRSxDQUFDO0FBRUQsV0FBUyxlQUFlLElBQVksTUFBeUc7QUFDNUksVUFBTSxXQUFXLGVBQWUsTUFBTSxFQUFFO0FBQ3hDLFVBQU0sUUFBb0M7QUFBQSxNQUN6QyxjQUFjLEtBQUs7QUFBQSxNQUNuQixvQkFBb0IsWUFBWSxLQUFLLG1CQUFtQjtBQUFBLElBQ3pEO0FBQ0EsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsU0FBUyxNQUFNLFFBQVEsRUFBRTtBQUFBLE1BQ3pCLFVBQVUsTUFBTSxTQUFTLEVBQUU7QUFBQSxNQUMzQixTQUFTLFlBQVk7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFFQSxPQUFLLDRDQUE0QyxZQUFZO0FBQzVELFVBQU0sU0FBUyxNQUFNLFFBQVEsZ0NBQWdDLGFBQWE7QUFDMUUsV0FBTyxZQUFZLFFBQVEsTUFBUztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxZQUFZO0FBQ3JELFVBQU0sU0FBUyxlQUFlLE1BQU0sRUFBRSxjQUFjLHdCQUF3QixPQUFPLENBQUM7QUFDcEYsaUJBQWEsSUFBSSxNQUFNLE1BQU07QUFFN0IsVUFBTSxTQUFTLE1BQU0sUUFBUSxnQ0FBZ0MsSUFBSTtBQUNqRSxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLFlBQVksT0FBTyxNQUFNLGFBQWE7QUFDN0MsV0FBTyxZQUFZLE9BQU8sV0FBVyxJQUFJO0FBQ3pDLFdBQU8sWUFBWSxPQUFPLE1BQU0sU0FBUztBQUFBLEVBQzFDLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFVBQU0sU0FBUyxlQUFlLE1BQU0sRUFBRSxjQUFjLHdCQUF3QixXQUFXLGlCQUFpQixLQUFLLENBQUM7QUFDOUcsaUJBQWEsSUFBSSxNQUFNLE1BQU07QUFFN0IsVUFBTSxTQUFTLE1BQU0sUUFBUSxnQ0FBZ0MsSUFBSTtBQUNqRSxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLFlBQVksT0FBTyxNQUFNLGFBQWE7QUFDN0MsV0FBTyxZQUFZLE9BQU8sV0FBVyxJQUFJO0FBQUEsRUFDMUMsQ0FBQztBQUVELE9BQUssb0RBQW9ELFlBQVk7QUFDcEUsVUFBTSxTQUFTLGVBQWUsTUFBTSxFQUFFLGNBQWMsd0JBQXdCLFdBQVcsaUJBQWlCLE1BQU0sQ0FBQztBQUMvRyxpQkFBYSxJQUFJLE1BQU0sTUFBTTtBQUU3QixVQUFNLFNBQVMsTUFBTSxRQUFRLGdDQUFnQyxJQUFJO0FBQ2pFLFdBQU8sWUFBWSxRQUFRLE1BQVM7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsWUFBWTtBQUN0RCxVQUFNLFdBQVcsZUFBZSxNQUFNLElBQUk7QUFDMUMsVUFBTSxRQUFvQztBQUFBLE1BQ3pDLGNBQWMsd0JBQXdCO0FBQUEsTUFDdEMsb0JBQW9CLFlBQVk7QUFBQSxJQUNqQztBQUNBLFFBQUksV0FBVztBQUNmLFVBQU0sU0FBc0M7QUFBQSxNQUMzQyxJQUFJO0FBQUEsTUFDSjtBQUFBLE1BQ0EsT0FBTztBQUFBO0FBQUEsTUFDUCxTQUFTLE1BQU07QUFBQSxNQUNmLFVBQVUsTUFBTTtBQUFBLE1BQ2hCLFNBQVMsWUFBWTtBQUNwQixtQkFBVztBQUNYLFFBQUMsT0FBdUMsUUFBUTtBQUNoRCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxpQkFBYSxJQUFJLE1BQU0sTUFBTTtBQUU3QixVQUFNLFNBQVMsTUFBTSxRQUFRLGdDQUFnQyxJQUFJO0FBQ2pFLFdBQU8sR0FBRyxVQUFVLG1DQUFtQztBQUN2RCxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLFlBQVksT0FBTyxNQUFNLGFBQWE7QUFBQSxFQUM5QyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
