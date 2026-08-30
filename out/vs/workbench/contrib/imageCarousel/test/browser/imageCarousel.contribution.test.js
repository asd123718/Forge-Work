import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { NullFilesConfigurationService, createFileStat } from "../../../../test/common/workbenchTestServices.js";
import { IExplorerService } from "../../../files/browser/files.js";
import { ExplorerItem } from "../../../files/common/explorerModel.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ImageCarouselEditorInput } from "../../browser/imageCarouselEditorInput.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import "../../browser/imageCarousel.contribution.js";
function createExplorerItem(path, isFolder, fileService, configService, parent) {
  return new ExplorerItem(
    URI.file(path),
    fileService,
    configService,
    NullFilesConfigurationService,
    parent,
    isFolder
  );
}
suite("OpenImagesInCarouselFromExplorerAction", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configService;
  let openedInputs;
  let infoMessages;
  let errorMessages;
  setup(() => {
    openedInputs = [];
    infoMessages = [];
    errorMessages = [];
    configService = new TestConfigurationService();
    instantiationService = workbenchInstantiationService(void 0, disposables);
  });
  function stubFileService(resolveMap, fileContents) {
    instantiationService.stub(IFileService, "resolve", async (resource) => {
      const stat = resolveMap.get(resource.path);
      if (!stat) {
        throw new Error(`File not found: ${resource.path}`);
      }
      return stat;
    });
    instantiationService.stub(IFileService, "readFile", async (resource) => {
      const content = fileContents.get(resource.path);
      if (!content) {
        throw new Error(`Cannot read: ${resource.path}`);
      }
      return { resource, value: content };
    });
  }
  function stubExplorerService(items) {
    instantiationService.stub(IExplorerService, {
      getContext: () => items
    });
  }
  function stubEditorService() {
    instantiationService.stub(IEditorService, "openEditor", async (input, _options, group) => {
      if (input instanceof ImageCarouselEditorInput) {
        openedInputs.push({ input, group });
        disposables.add(input);
      }
      return void 0;
    });
  }
  function stubNotificationService() {
    instantiationService.stub(INotificationService, "info", (message) => {
      infoMessages.push(message);
    });
    instantiationService.stub(INotificationService, "error", (message) => {
      errorMessages.push(message);
    });
  }
  test("single image file opens carousel with sibling images", async () => {
    const fileService = instantiationService.get(IFileService);
    const parent = createExplorerItem("/workspace/images", true, fileService, configService);
    const imageItem = createExplorerItem("/workspace/images/photo.png", false, fileService, configService, parent);
    const pngData = VSBuffer.fromString("fake-png");
    const jpgData = VSBuffer.fromString("fake-jpg");
    const txtData = VSBuffer.fromString("text file");
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set("/workspace/images", createFileStat(
      URI.file("/workspace/images"),
      false,
      false,
      true,
      false,
      [
        { resource: URI.file("/workspace/images/photo.png"), isFile: true },
        { resource: URI.file("/workspace/images/other.jpg"), isFile: true },
        { resource: URI.file("/workspace/images/readme.txt"), isFile: true },
        { resource: URI.file("/workspace/images/subfolder"), isDirectory: true, isFile: false }
      ]
    ));
    const fileContents = /* @__PURE__ */ new Map();
    fileContents.set("/workspace/images/photo.png", pngData);
    fileContents.set("/workspace/images/other.jpg", jpgData);
    fileContents.set("/workspace/images/readme.txt", txtData);
    stubFileService(resolveMap, fileContents);
    stubExplorerService([imageItem]);
    stubEditorService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command, "Command should be registered");
    await instantiationService.invokeFunction(command.handler);
    assert.strictEqual(openedInputs.length, 1, "Should open one editor");
    const input = openedInputs[0].input;
    assert.strictEqual(input.collection.sections.length, 1);
    const images = input.collection.sections[0].images;
    assert.strictEqual(images.length, 2, "Should include 2 image siblings (png + jpg), not txt");
    assert.strictEqual(images[0].name, "other.jpg");
    assert.strictEqual(images[1].name, "photo.png");
    assert.strictEqual(input.startIndex, 1);
  });
  test("folder opens carousel with all contained images", async () => {
    const fileService = instantiationService.get(IFileService);
    const folderItem = createExplorerItem("/workspace/images", true, fileService, configService);
    const gifData = VSBuffer.fromString("fake-gif");
    const webpData = VSBuffer.fromString("fake-webp");
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set("/workspace/images", createFileStat(
      URI.file("/workspace/images"),
      false,
      false,
      true,
      false,
      [
        { resource: URI.file("/workspace/images/anim.gif"), isFile: true },
        { resource: URI.file("/workspace/images/photo.webp"), isFile: true },
        { resource: URI.file("/workspace/images/script.js"), isFile: true }
      ]
    ));
    const fileContents = /* @__PURE__ */ new Map();
    fileContents.set("/workspace/images/anim.gif", gifData);
    fileContents.set("/workspace/images/photo.webp", webpData);
    stubFileService(resolveMap, fileContents);
    stubExplorerService([folderItem]);
    stubEditorService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler);
    assert.strictEqual(openedInputs.length, 1);
    const images = openedInputs[0].input.collection.sections[0].images;
    assert.strictEqual(images.length, 2, "Should include 2 images (gif + webp), not js");
    assert.strictEqual(images[0].name, "anim.gif");
    assert.strictEqual(images[1].name, "photo.webp");
  });
  test("multiple selected images open in carousel", async () => {
    const fileService = instantiationService.get(IFileService);
    const img1 = createExplorerItem("/workspace/a.png", false, fileService, configService);
    const img2 = createExplorerItem("/workspace/b.svg", false, fileService, configService);
    const txtFile = createExplorerItem("/workspace/notes.txt", false, fileService, configService);
    const pngData = VSBuffer.fromString("fake-png");
    const svgData = VSBuffer.fromString("<svg></svg>");
    const resolveMap = /* @__PURE__ */ new Map();
    const fileContents = /* @__PURE__ */ new Map();
    fileContents.set("/workspace/a.png", pngData);
    fileContents.set("/workspace/b.svg", svgData);
    stubFileService(resolveMap, fileContents);
    stubExplorerService([img1, img2, txtFile]);
    stubEditorService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler);
    assert.strictEqual(openedInputs.length, 1);
    const images = openedInputs[0].input.collection.sections[0].images;
    assert.strictEqual(images.length, 2, "Should include only image files");
    assert.strictEqual(images[0].name, "a.png");
    assert.strictEqual(images[1].name, "b.svg");
  });
  test("empty selection with resource argument opens carousel from that folder", async () => {
    const pngData = VSBuffer.fromString("fake-png");
    const jpgData = VSBuffer.fromString("fake-jpg");
    const folderUri = URI.file("/workspace/photos");
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set("/workspace/photos", createFileStat(
      folderUri,
      false,
      false,
      true,
      false,
      [
        { resource: URI.file("/workspace/photos/sunset.png"), isFile: true },
        { resource: URI.file("/workspace/photos/mountain.jpg"), isFile: true },
        { resource: URI.file("/workspace/photos/notes.txt"), isFile: true }
      ]
    ));
    const fileContents = /* @__PURE__ */ new Map();
    fileContents.set("/workspace/photos/sunset.png", pngData);
    fileContents.set("/workspace/photos/mountain.jpg", jpgData);
    stubFileService(resolveMap, fileContents);
    stubExplorerService([]);
    stubEditorService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler, folderUri);
    assert.strictEqual(openedInputs.length, 1, "Should open carousel using resource argument fallback");
    const images = openedInputs[0].input.collection.sections[0].images;
    assert.strictEqual(images.length, 2, "Should include 2 images from the folder");
  });
  test("empty selection without resource falls back to first workspace folder", async () => {
    const pngData = VSBuffer.fromString("fake-png");
    const contextService = instantiationService.get(IWorkspaceContextService);
    const wsRoot = contextService.getWorkspace().folders[0].uri;
    const logoUri = URI.joinPath(wsRoot, "logo.png");
    const readmeUri = URI.joinPath(wsRoot, "readme.md");
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set(wsRoot.path, createFileStat(
      wsRoot,
      false,
      false,
      true,
      false,
      [
        { resource: logoUri, isFile: true },
        { resource: readmeUri, isFile: true }
      ]
    ));
    const fileContents = /* @__PURE__ */ new Map();
    fileContents.set(logoUri.path, pngData);
    stubFileService(resolveMap, fileContents);
    stubExplorerService([]);
    stubEditorService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler);
    assert.strictEqual(openedInputs.length, 1, "Should open carousel using workspace root fallback");
    const images = openedInputs[0].input.collection.sections[0].images;
    assert.strictEqual(images.length, 1, "Should include image from workspace root");
    assert.strictEqual(images[0].name, "logo.png");
  });
  test("empty selection with no images shows notification", async () => {
    const folderUri = URI.file("/workspace/docs");
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set("/workspace/docs", createFileStat(
      folderUri,
      false,
      false,
      true,
      false,
      [
        { resource: URI.file("/workspace/docs/readme.md"), isFile: true }
      ]
    ));
    stubFileService(resolveMap, /* @__PURE__ */ new Map());
    stubExplorerService([]);
    stubEditorService();
    stubNotificationService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler, folderUri);
    assert.strictEqual(openedInputs.length, 0, "Should not open carousel when folder has no images");
    assert.strictEqual(infoMessages.length, 1, "Should show notification");
  });
  test("folder with no images shows notification", async () => {
    const fileService = instantiationService.get(IFileService);
    const folderItem = createExplorerItem("/workspace/docs", true, fileService, configService);
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set("/workspace/docs", createFileStat(
      URI.file("/workspace/docs"),
      false,
      false,
      true,
      false,
      [
        { resource: URI.file("/workspace/docs/readme.md"), isFile: true },
        { resource: URI.file("/workspace/docs/notes.txt"), isFile: true }
      ]
    ));
    stubFileService(resolveMap, /* @__PURE__ */ new Map());
    stubExplorerService([folderItem]);
    stubEditorService();
    stubNotificationService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler);
    assert.strictEqual(openedInputs.length, 0, "Should not open carousel when folder has no images");
    assert.strictEqual(infoMessages.length, 1, "Should show notification about no images");
  });
  test("folder read error shows error notification", async () => {
    const fileService = instantiationService.get(IFileService);
    const folderItem = createExplorerItem("/workspace/restricted", true, fileService, configService);
    const resolveMap = /* @__PURE__ */ new Map();
    stubFileService(resolveMap, /* @__PURE__ */ new Map());
    stubExplorerService([folderItem]);
    stubEditorService();
    stubNotificationService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler);
    assert.strictEqual(openedInputs.length, 0, "Should not open carousel on folder read error");
    assert.strictEqual(errorMessages.length, 1, "Should show error notification");
    assert.strictEqual(infoMessages.length, 0, "Should not show info notification");
  });
  test("images with URIs are passed lazily without reading file contents", async () => {
    const folderUri = URI.file("/workspace/broken");
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set("/workspace/broken", createFileStat(
      folderUri,
      false,
      false,
      true,
      false,
      [
        { resource: URI.file("/workspace/broken/corrupt.png"), isFile: true },
        { resource: URI.file("/workspace/broken/missing.jpg"), isFile: true }
      ]
    ));
    let readFileCallCount = 0;
    stubFileService(resolveMap, /* @__PURE__ */ new Map());
    instantiationService.stub(IFileService, "readFile", async () => {
      readFileCallCount++;
      throw new Error("readFile should not be called");
    });
    stubExplorerService([]);
    stubEditorService();
    stubNotificationService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler, folderUri);
    assert.strictEqual(readFileCallCount, 0, "readFile should not be called during action");
    assert.strictEqual(openedInputs.length, 1, "Should open carousel with lazy image entries");
    const images = openedInputs[0].input.collection.sections[0].images;
    assert.strictEqual(images.length, 2, "Should include 2 lazy image entries");
    assert.strictEqual(images[0].data, void 0, "Image data should not be loaded eagerly");
    assert.ok(images[0].uri, "Image should have a URI for lazy loading");
  });
  test("folder includes video files alongside images", async () => {
    const fileService = instantiationService.get(IFileService);
    const folderItem = createExplorerItem("/workspace/media", true, fileService, configService);
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set("/workspace/media", createFileStat(
      URI.file("/workspace/media"),
      false,
      false,
      true,
      false,
      [
        { resource: URI.file("/workspace/media/clip.mp4"), isFile: true },
        { resource: URI.file("/workspace/media/photo.png"), isFile: true },
        { resource: URI.file("/workspace/media/demo.webm"), isFile: true },
        { resource: URI.file("/workspace/media/intro.mov"), isFile: true },
        { resource: URI.file("/workspace/media/readme.txt"), isFile: true }
      ]
    ));
    stubFileService(resolveMap, /* @__PURE__ */ new Map());
    stubExplorerService([folderItem]);
    stubEditorService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler);
    assert.strictEqual(openedInputs.length, 1);
    const images = openedInputs[0].input.collection.sections[0].images;
    assert.strictEqual(images.length, 4, "Should include mp4 + webm + mov + png, not txt");
    assert.strictEqual(images[0].name, "clip.mp4");
    assert.strictEqual(images[1].name, "demo.webm");
    assert.strictEqual(images[2].name, "intro.mov");
    assert.strictEqual(images[3].name, "photo.png");
  });
  test("single video file opens carousel with sibling media", async () => {
    const fileService = instantiationService.get(IFileService);
    const parent = createExplorerItem("/workspace/media", true, fileService, configService);
    const videoItem = createExplorerItem("/workspace/media/clip.mp4", false, fileService, configService, parent);
    const resolveMap = /* @__PURE__ */ new Map();
    resolveMap.set("/workspace/media", createFileStat(
      URI.file("/workspace/media"),
      false,
      false,
      true,
      false,
      [
        { resource: URI.file("/workspace/media/clip.mp4"), isFile: true },
        { resource: URI.file("/workspace/media/photo.png"), isFile: true },
        { resource: URI.file("/workspace/media/notes.txt"), isFile: true }
      ]
    ));
    stubFileService(resolveMap, /* @__PURE__ */ new Map());
    stubExplorerService([videoItem]);
    stubEditorService();
    const { CommandsRegistry } = await import("../../../../../platform/commands/common/commands.js");
    const command = CommandsRegistry.getCommand("workbench.action.openImagesInCarousel");
    assert.ok(command);
    await instantiationService.invokeFunction(command.handler);
    assert.strictEqual(openedInputs.length, 1);
    const input = openedInputs[0].input;
    const images = input.collection.sections[0].images;
    assert.strictEqual(images.length, 2, "Should include mp4 + png siblings");
    assert.strictEqual(images[0].name, "clip.mp4");
    assert.strictEqual(images[1].name, "photo.png");
    assert.strictEqual(input.startIndex, 0, "Start index should point to the selected video");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGltYWdlQ2Fyb3VzZWxcXHRlc3RcXGJyb3dzZXJcXGltYWdlQ2Fyb3VzZWwuY29udHJpYnV0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTnVsbEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIGNyZWF0ZUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9icm93c2VyL2ZpbGVzLmpzJztcbmltcG9ydCB7IEV4cGxvcmVySXRlbSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9leHBsb3Jlck1vZGVsLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTdGF0LCBJRmlsZUNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIE1PREFMX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG4vLyBJbXBvcnRpbmcgdGhlIGNvbnRyaWJ1dGlvbiByZWdpc3RlcnMgdGhlIGFjdGlvbnNcbmltcG9ydCAnLi4vLi4vYnJvd3Nlci9pbWFnZUNhcm91c2VsLmNvbnRyaWJ1dGlvbi5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUV4cGxvcmVySXRlbShcblx0cGF0aDogc3RyaW5nLFxuXHRpc0ZvbGRlcjogYm9vbGVhbixcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0Y29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRwYXJlbnQ/OiBFeHBsb3Jlckl0ZW0sXG4pOiBFeHBsb3Jlckl0ZW0ge1xuXHRyZXR1cm4gbmV3IEV4cGxvcmVySXRlbShcblx0XHRVUkkuZmlsZShwYXRoKSxcblx0XHRmaWxlU2VydmljZSxcblx0XHRjb25maWdTZXJ2aWNlLFxuXHRcdE51bGxGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHBhcmVudCxcblx0XHRpc0ZvbGRlcixcblx0KTtcbn1cblxuc3VpdGUoJ09wZW5JbWFnZXNJbkNhcm91c2VsRnJvbUV4cGxvcmVyQWN0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgb3BlbmVkSW5wdXRzOiB7IGlucHV0OiBJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQ7IGdyb3VwOiB0eXBlb2YgTU9EQUxfR1JPVVAgfVtdO1xuXHRsZXQgaW5mb01lc3NhZ2VzOiBzdHJpbmdbXTtcblx0bGV0IGVycm9yTWVzc2FnZXM6IHN0cmluZ1tdO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRvcGVuZWRJbnB1dHMgPSBbXTtcblx0XHRpbmZvTWVzc2FnZXMgPSBbXTtcblx0XHRlcnJvck1lc3NhZ2VzID0gW107XG5cdFx0Y29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBzdHViRmlsZVNlcnZpY2UocmVzb2x2ZU1hcDogTWFwPHN0cmluZywgSUZpbGVTdGF0PiwgZmlsZUNvbnRlbnRzOiBNYXA8c3RyaW5nLCBWU0J1ZmZlcj4pOiB2b2lkIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgJ3Jlc29sdmUnLCBhc3luYyAocmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IHJlc29sdmVNYXAuZ2V0KHJlc291cmNlLnBhdGgpO1xuXHRcdFx0aWYgKCFzdGF0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRmlsZSBub3QgZm91bmQ6ICR7cmVzb3VyY2UucGF0aH1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzdGF0O1xuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsICdyZWFkRmlsZScsIGFzeW5jIChyZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gZmlsZUNvbnRlbnRzLmdldChyZXNvdXJjZS5wYXRoKTtcblx0XHRcdGlmICghY29udGVudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZWFkOiAke3Jlc291cmNlLnBhdGh9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyByZXNvdXJjZSwgdmFsdWU6IGNvbnRlbnQgfSBhcyBJRmlsZUNvbnRlbnQ7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzdHViRXhwbG9yZXJTZXJ2aWNlKGl0ZW1zOiBFeHBsb3Jlckl0ZW1bXSk6IHZvaWQge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4cGxvcmVyU2VydmljZSwge1xuXHRcdFx0Z2V0Q29udGV4dDogKCkgPT4gaXRlbXMsXG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzdHViRWRpdG9yU2VydmljZSgpOiB2b2lkIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCAnb3BlbkVkaXRvcicsIGFzeW5jIChpbnB1dDogdW5rbm93biwgX29wdGlvbnM6IHVua25vd24sIGdyb3VwOiB1bmtub3duKSA9PiB7XG5cdFx0XHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0b3BlbmVkSW5wdXRzLnB1c2goeyBpbnB1dCwgZ3JvdXA6IGdyb3VwIGFzIHR5cGVvZiBNT0RBTF9HUk9VUCB9KTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzdHViTm90aWZpY2F0aW9uU2VydmljZSgpOiB2b2lkIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCAnaW5mbycsIChtZXNzYWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdGluZm9NZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsICdlcnJvcicsIChtZXNzYWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdGVycm9yTWVzc2FnZXMucHVzaChtZXNzYWdlKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ3NpbmdsZSBpbWFnZSBmaWxlIG9wZW5zIGNhcm91c2VsIHdpdGggc2libGluZyBpbWFnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBwYXJlbnQgPSBjcmVhdGVFeHBsb3Jlckl0ZW0oJy93b3Jrc3BhY2UvaW1hZ2VzJywgdHJ1ZSwgZmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGltYWdlSXRlbSA9IGNyZWF0ZUV4cGxvcmVySXRlbSgnL3dvcmtzcGFjZS9pbWFnZXMvcGhvdG8ucG5nJywgZmFsc2UsIGZpbGVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlLCBwYXJlbnQpO1xuXG5cdFx0Y29uc3QgcG5nRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UtcG5nJyk7XG5cdFx0Y29uc3QganBnRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UtanBnJyk7XG5cdFx0Y29uc3QgdHh0RGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3RleHQgZmlsZScpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBJRmlsZVN0YXQ+KCk7XG5cdFx0cmVzb2x2ZU1hcC5zZXQoJy93b3Jrc3BhY2UvaW1hZ2VzJywgY3JlYXRlRmlsZVN0YXQoXG5cdFx0XHRVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbWFnZXMnKSwgZmFsc2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgW1xuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvaW1hZ2VzL3Bob3RvLnBuZycpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL2ltYWdlcy9vdGhlci5qcGcnKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbWFnZXMvcmVhZG1lLnR4dCcpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL2ltYWdlcy9zdWJmb2xkZXInKSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzRmlsZTogZmFsc2UgfSxcblx0XHRdXG5cdFx0KSk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudHMgPSBuZXcgTWFwPHN0cmluZywgVlNCdWZmZXI+KCk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCgnL3dvcmtzcGFjZS9pbWFnZXMvcGhvdG8ucG5nJywgcG5nRGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCgnL3dvcmtzcGFjZS9pbWFnZXMvb3RoZXIuanBnJywganBnRGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCgnL3dvcmtzcGFjZS9pbWFnZXMvcmVhZG1lLnR4dCcsIHR4dERhdGEpO1xuXG5cdFx0c3R1YkZpbGVTZXJ2aWNlKHJlc29sdmVNYXAsIGZpbGVDb250ZW50cyk7XG5cdFx0c3R1YkV4cGxvcmVyU2VydmljZShbaW1hZ2VJdGVtXSk7XG5cdFx0c3R1YkVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHsgQ29tbWFuZHNSZWdpc3RyeSB9ID0gYXdhaXQgaW1wb3J0KCcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnKTtcblx0XHRjb25zdCBjb21tYW5kID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5JbWFnZXNJbkNhcm91c2VsJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbW1hbmQsICdDb21tYW5kIHNob3VsZCBiZSByZWdpc3RlcmVkJyk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjb21tYW5kLmhhbmRsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZElucHV0cy5sZW5ndGgsIDEsICdTaG91bGQgb3BlbiBvbmUgZWRpdG9yJyk7XG5cdFx0Y29uc3QgaW5wdXQgPSBvcGVuZWRJbnB1dHNbMF0uaW5wdXQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0LmNvbGxlY3Rpb24uc2VjdGlvbnMubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IGltYWdlcyA9IGlucHV0LmNvbGxlY3Rpb24uc2VjdGlvbnNbMF0uaW1hZ2VzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbWFnZXMubGVuZ3RoLCAyLCAnU2hvdWxkIGluY2x1ZGUgMiBpbWFnZSBzaWJsaW5ncyAocG5nICsganBnKSwgbm90IHR4dCcpO1xuXHRcdC8vIEltYWdlcyBhcmUgc29ydGVkIGJ5IGJhc2VuYW1lOiBvdGhlci5qcGcgYmVmb3JlIHBob3RvLnBuZ1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbWFnZXNbMF0ubmFtZSwgJ290aGVyLmpwZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbWFnZXNbMV0ubmFtZSwgJ3Bob3RvLnBuZycpO1xuXG5cdFx0Ly8gU3RhcnQgaW5kZXggc2hvdWxkIGJlIHRoZSBzZWxlY3RlZCBpbWFnZSAocGhvdG8ucG5nID0gaW5kZXggMSBhZnRlciBzb3J0aW5nKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5zdGFydEluZGV4LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyIG9wZW5zIGNhcm91c2VsIHdpdGggYWxsIGNvbnRhaW5lZCBpbWFnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2xkZXJJdGVtID0gY3JlYXRlRXhwbG9yZXJJdGVtKCcvd29ya3NwYWNlL2ltYWdlcycsIHRydWUsIGZpbGVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGdpZkRhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmYWtlLWdpZicpO1xuXHRcdGNvbnN0IHdlYnBEYXRhID0gVlNCdWZmZXIuZnJvbVN0cmluZygnZmFrZS13ZWJwJyk7XG5cblx0XHRjb25zdCByZXNvbHZlTWFwID0gbmV3IE1hcDxzdHJpbmcsIElGaWxlU3RhdD4oKTtcblx0XHRyZXNvbHZlTWFwLnNldCgnL3dvcmtzcGFjZS9pbWFnZXMnLCBjcmVhdGVGaWxlU3RhdChcblx0XHRcdFVSSS5maWxlKCcvd29ya3NwYWNlL2ltYWdlcycpLCBmYWxzZSwgZmFsc2UsIHRydWUsIGZhbHNlLCBbXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbWFnZXMvYW5pbS5naWYnKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbWFnZXMvcGhvdG8ud2VicCcpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL2ltYWdlcy9zY3JpcHQuanMnKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gbmV3IE1hcDxzdHJpbmcsIFZTQnVmZmVyPigpO1xuXHRcdGZpbGVDb250ZW50cy5zZXQoJy93b3Jrc3BhY2UvaW1hZ2VzL2FuaW0uZ2lmJywgZ2lmRGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCgnL3dvcmtzcGFjZS9pbWFnZXMvcGhvdG8ud2VicCcsIHdlYnBEYXRhKTtcblxuXHRcdHN0dWJGaWxlU2VydmljZShyZXNvbHZlTWFwLCBmaWxlQ29udGVudHMpO1xuXHRcdHN0dWJFeHBsb3JlclNlcnZpY2UoW2ZvbGRlckl0ZW1dKTtcblx0XHRzdHViRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkltYWdlc0luQ2Fyb3VzZWwnKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjb21tYW5kLmhhbmRsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZElucHV0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGltYWdlcyA9IG9wZW5lZElucHV0c1swXS5pbnB1dC5jb2xsZWN0aW9uLnNlY3Rpb25zWzBdLmltYWdlcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1hZ2VzLmxlbmd0aCwgMiwgJ1Nob3VsZCBpbmNsdWRlIDIgaW1hZ2VzIChnaWYgKyB3ZWJwKSwgbm90IGpzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltYWdlc1swXS5uYW1lLCAnYW5pbS5naWYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1hZ2VzWzFdLm5hbWUsICdwaG90by53ZWJwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHNlbGVjdGVkIGltYWdlcyBvcGVuIGluIGNhcm91c2VsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgaW1nMSA9IGNyZWF0ZUV4cGxvcmVySXRlbSgnL3dvcmtzcGFjZS9hLnBuZycsIGZhbHNlLCBmaWxlU2VydmljZSwgY29uZmlnU2VydmljZSk7XG5cdFx0Y29uc3QgaW1nMiA9IGNyZWF0ZUV4cGxvcmVySXRlbSgnL3dvcmtzcGFjZS9iLnN2ZycsIGZhbHNlLCBmaWxlU2VydmljZSwgY29uZmlnU2VydmljZSk7XG5cdFx0Y29uc3QgdHh0RmlsZSA9IGNyZWF0ZUV4cGxvcmVySXRlbSgnL3dvcmtzcGFjZS9ub3Rlcy50eHQnLCBmYWxzZSwgZmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcG5nRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UtcG5nJyk7XG5cdFx0Y29uc3Qgc3ZnRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJzxzdmc+PC9zdmc+Jyk7XG5cblx0XHRjb25zdCByZXNvbHZlTWFwID0gbmV3IE1hcDxzdHJpbmcsIElGaWxlU3RhdD4oKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBWU0J1ZmZlcj4oKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KCcvd29ya3NwYWNlL2EucG5nJywgcG5nRGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCgnL3dvcmtzcGFjZS9iLnN2ZycsIHN2Z0RhdGEpO1xuXG5cdFx0c3R1YkZpbGVTZXJ2aWNlKHJlc29sdmVNYXAsIGZpbGVDb250ZW50cyk7XG5cdFx0c3R1YkV4cGxvcmVyU2VydmljZShbaW1nMSwgaW1nMiwgdHh0RmlsZV0pO1xuXHRcdHN0dWJFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB7IENvbW1hbmRzUmVnaXN0cnkgfSA9IGF3YWl0IGltcG9ydCgnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJyk7XG5cdFx0Y29uc3QgY29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuSW1hZ2VzSW5DYXJvdXNlbCcpO1xuXHRcdGFzc2VydC5vayhjb21tYW5kKTtcblxuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNvbW1hbmQuaGFuZGxlcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkSW5wdXRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgaW1hZ2VzID0gb3BlbmVkSW5wdXRzWzBdLmlucHV0LmNvbGxlY3Rpb24uc2VjdGlvbnNbMF0uaW1hZ2VzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbWFnZXMubGVuZ3RoLCAyLCAnU2hvdWxkIGluY2x1ZGUgb25seSBpbWFnZSBmaWxlcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbWFnZXNbMF0ubmFtZSwgJ2EucG5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltYWdlc1sxXS5uYW1lLCAnYi5zdmcnKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgc2VsZWN0aW9uIHdpdGggcmVzb3VyY2UgYXJndW1lbnQgb3BlbnMgY2Fyb3VzZWwgZnJvbSB0aGF0IGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbmdEYXRhID0gVlNCdWZmZXIuZnJvbVN0cmluZygnZmFrZS1wbmcnKTtcblx0XHRjb25zdCBqcGdEYXRhID0gVlNCdWZmZXIuZnJvbVN0cmluZygnZmFrZS1qcGcnKTtcblxuXHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3Bob3RvcycpO1xuXHRcdGNvbnN0IHJlc29sdmVNYXAgPSBuZXcgTWFwPHN0cmluZywgSUZpbGVTdGF0PigpO1xuXHRcdHJlc29sdmVNYXAuc2V0KCcvd29ya3NwYWNlL3Bob3RvcycsIGNyZWF0ZUZpbGVTdGF0KFxuXHRcdFx0Zm9sZGVyVXJpLCBmYWxzZSwgZmFsc2UsIHRydWUsIGZhbHNlLCBbXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9waG90b3Mvc3Vuc2V0LnBuZycpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL3Bob3Rvcy9tb3VudGFpbi5qcGcnKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9waG90b3Mvbm90ZXMudHh0JyksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdF1cblx0XHQpKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBWU0J1ZmZlcj4oKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KCcvd29ya3NwYWNlL3Bob3Rvcy9zdW5zZXQucG5nJywgcG5nRGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCgnL3dvcmtzcGFjZS9waG90b3MvbW91bnRhaW4uanBnJywganBnRGF0YSk7XG5cblx0XHRzdHViRmlsZVNlcnZpY2UocmVzb2x2ZU1hcCwgZmlsZUNvbnRlbnRzKTtcblx0XHRzdHViRXhwbG9yZXJTZXJ2aWNlKFtdKTtcblx0XHRzdHViRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkltYWdlc0luQ2Fyb3VzZWwnKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCk7XG5cblx0XHQvLyBQYXNzIHRoZSBmb2xkZXIgVVJJIGFzIHRoZSByZXNvdXJjZSBhcmd1bWVudCAoYXMgZXhwbG9yZXIgZG9lcyBmb3IgZW1wdHktc3BhY2UgY2xpY2spXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY29tbWFuZC5oYW5kbGVyLCBmb2xkZXJVcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZElucHV0cy5sZW5ndGgsIDEsICdTaG91bGQgb3BlbiBjYXJvdXNlbCB1c2luZyByZXNvdXJjZSBhcmd1bWVudCBmYWxsYmFjaycpO1xuXHRcdGNvbnN0IGltYWdlcyA9IG9wZW5lZElucHV0c1swXS5pbnB1dC5jb2xsZWN0aW9uLnNlY3Rpb25zWzBdLmltYWdlcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1hZ2VzLmxlbmd0aCwgMiwgJ1Nob3VsZCBpbmNsdWRlIDIgaW1hZ2VzIGZyb20gdGhlIGZvbGRlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBzZWxlY3Rpb24gd2l0aG91dCByZXNvdXJjZSBmYWxscyBiYWNrIHRvIGZpcnN0IHdvcmtzcGFjZSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcG5nRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UtcG5nJyk7XG5cblx0XHQvLyBEZXJpdmUgdGhlIHdvcmtzcGFjZSByb290IGZyb20gSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHNvIHRoZSB0ZXN0XG5cdFx0Ly8gd29ya3Mgb24gYWxsIHBsYXRmb3JtcyAodGhlIHBhdGggZGlmZmVycyBvbiBXaW5kb3dzIHZzIFVuaXgpLlxuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3Qgd3NSb290ID0gY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXS51cmk7XG5cdFx0Y29uc3QgbG9nb1VyaSA9IFVSSS5qb2luUGF0aCh3c1Jvb3QsICdsb2dvLnBuZycpO1xuXHRcdGNvbnN0IHJlYWRtZVVyaSA9IFVSSS5qb2luUGF0aCh3c1Jvb3QsICdyZWFkbWUubWQnKTtcblxuXHRcdGNvbnN0IHJlc29sdmVNYXAgPSBuZXcgTWFwPHN0cmluZywgSUZpbGVTdGF0PigpO1xuXHRcdHJlc29sdmVNYXAuc2V0KHdzUm9vdC5wYXRoLCBjcmVhdGVGaWxlU3RhdChcblx0XHRcdHdzUm9vdCwgZmFsc2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgW1xuXHRcdFx0eyByZXNvdXJjZTogbG9nb1VyaSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHR7IHJlc291cmNlOiByZWFkbWVVcmksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdF1cblx0XHQpKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBWU0J1ZmZlcj4oKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KGxvZ29VcmkucGF0aCwgcG5nRGF0YSk7XG5cblx0XHRzdHViRmlsZVNlcnZpY2UocmVzb2x2ZU1hcCwgZmlsZUNvbnRlbnRzKTtcblx0XHRzdHViRXhwbG9yZXJTZXJ2aWNlKFtdKTtcblx0XHRzdHViRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkltYWdlc0luQ2Fyb3VzZWwnKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCk7XG5cblx0XHQvLyBObyByZXNvdXJjZSBhcmd1bWVudCBcdTIwMTQgc2hvdWxkIGZhbGwgYmFjayB0byB3b3Jrc3BhY2Ugcm9vdFxuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNvbW1hbmQuaGFuZGxlcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkSW5wdXRzLmxlbmd0aCwgMSwgJ1Nob3VsZCBvcGVuIGNhcm91c2VsIHVzaW5nIHdvcmtzcGFjZSByb290IGZhbGxiYWNrJyk7XG5cdFx0Y29uc3QgaW1hZ2VzID0gb3BlbmVkSW5wdXRzWzBdLmlucHV0LmNvbGxlY3Rpb24uc2VjdGlvbnNbMF0uaW1hZ2VzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbWFnZXMubGVuZ3RoLCAxLCAnU2hvdWxkIGluY2x1ZGUgaW1hZ2UgZnJvbSB3b3Jrc3BhY2Ugcm9vdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbWFnZXNbMF0ubmFtZSwgJ2xvZ28ucG5nJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IHNlbGVjdGlvbiB3aXRoIG5vIGltYWdlcyBzaG93cyBub3RpZmljYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZG9jcycpO1xuXHRcdGNvbnN0IHJlc29sdmVNYXAgPSBuZXcgTWFwPHN0cmluZywgSUZpbGVTdGF0PigpO1xuXHRcdHJlc29sdmVNYXAuc2V0KCcvd29ya3NwYWNlL2RvY3MnLCBjcmVhdGVGaWxlU3RhdChcblx0XHRcdGZvbGRlclVyaSwgZmFsc2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgW1xuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvZG9jcy9yZWFkbWUubWQnKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XVxuXHRcdCkpO1xuXG5cdFx0c3R1YkZpbGVTZXJ2aWNlKHJlc29sdmVNYXAsIG5ldyBNYXAoKSk7XG5cdFx0c3R1YkV4cGxvcmVyU2VydmljZShbXSk7XG5cdFx0c3R1YkVkaXRvclNlcnZpY2UoKTtcblx0XHRzdHViTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkltYWdlc0luQ2Fyb3VzZWwnKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjb21tYW5kLmhhbmRsZXIsIGZvbGRlclVyaSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkSW5wdXRzLmxlbmd0aCwgMCwgJ1Nob3VsZCBub3Qgb3BlbiBjYXJvdXNlbCB3aGVuIGZvbGRlciBoYXMgbm8gaW1hZ2VzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm9NZXNzYWdlcy5sZW5ndGgsIDEsICdTaG91bGQgc2hvdyBub3RpZmljYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyIHdpdGggbm8gaW1hZ2VzIHNob3dzIG5vdGlmaWNhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGZvbGRlckl0ZW0gPSBjcmVhdGVFeHBsb3Jlckl0ZW0oJy93b3Jrc3BhY2UvZG9jcycsIHRydWUsIGZpbGVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc29sdmVNYXAgPSBuZXcgTWFwPHN0cmluZywgSUZpbGVTdGF0PigpO1xuXHRcdHJlc29sdmVNYXAuc2V0KCcvd29ya3NwYWNlL2RvY3MnLCBjcmVhdGVGaWxlU3RhdChcblx0XHRcdFVSSS5maWxlKCcvd29ya3NwYWNlL2RvY3MnKSwgZmFsc2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgW1xuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvZG9jcy9yZWFkbWUubWQnKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9kb2NzL25vdGVzLnR4dCcpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRdXG5cdFx0KSk7XG5cblx0XHRzdHViRmlsZVNlcnZpY2UocmVzb2x2ZU1hcCwgbmV3IE1hcCgpKTtcblx0XHRzdHViRXhwbG9yZXJTZXJ2aWNlKFtmb2xkZXJJdGVtXSk7XG5cdFx0c3R1YkVkaXRvclNlcnZpY2UoKTtcblx0XHRzdHViTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkltYWdlc0luQ2Fyb3VzZWwnKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjb21tYW5kLmhhbmRsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZElucHV0cy5sZW5ndGgsIDAsICdTaG91bGQgbm90IG9wZW4gY2Fyb3VzZWwgd2hlbiBmb2xkZXIgaGFzIG5vIGltYWdlcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvTWVzc2FnZXMubGVuZ3RoLCAxLCAnU2hvdWxkIHNob3cgbm90aWZpY2F0aW9uIGFib3V0IG5vIGltYWdlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xkZXIgcmVhZCBlcnJvciBzaG93cyBlcnJvciBub3RpZmljYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2xkZXJJdGVtID0gY3JlYXRlRXhwbG9yZXJJdGVtKCcvd29ya3NwYWNlL3Jlc3RyaWN0ZWQnLCB0cnVlLCBmaWxlU2VydmljZSwgY29uZmlnU2VydmljZSk7XG5cblx0XHQvLyByZXNvbHZlIHRocm93cyB0byBzaW11bGF0ZSBhIHBlcm1pc3Npb24gZXJyb3Jcblx0XHRjb25zdCByZXNvbHZlTWFwID0gbmV3IE1hcDxzdHJpbmcsIElGaWxlU3RhdD4oKTtcblx0XHRzdHViRmlsZVNlcnZpY2UocmVzb2x2ZU1hcCwgbmV3IE1hcCgpKTtcblx0XHRzdHViRXhwbG9yZXJTZXJ2aWNlKFtmb2xkZXJJdGVtXSk7XG5cdFx0c3R1YkVkaXRvclNlcnZpY2UoKTtcblx0XHRzdHViTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkltYWdlc0luQ2Fyb3VzZWwnKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjb21tYW5kLmhhbmRsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZElucHV0cy5sZW5ndGgsIDAsICdTaG91bGQgbm90IG9wZW4gY2Fyb3VzZWwgb24gZm9sZGVyIHJlYWQgZXJyb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JNZXNzYWdlcy5sZW5ndGgsIDEsICdTaG91bGQgc2hvdyBlcnJvciBub3RpZmljYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5mb01lc3NhZ2VzLmxlbmd0aCwgMCwgJ1Nob3VsZCBub3Qgc2hvdyBpbmZvIG5vdGlmaWNhdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbWFnZXMgd2l0aCBVUklzIGFyZSBwYXNzZWQgbGF6aWx5IHdpdGhvdXQgcmVhZGluZyBmaWxlIGNvbnRlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2Jyb2tlbicpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBJRmlsZVN0YXQ+KCk7XG5cdFx0cmVzb2x2ZU1hcC5zZXQoJy93b3Jrc3BhY2UvYnJva2VuJywgY3JlYXRlRmlsZVN0YXQoXG5cdFx0XHRmb2xkZXJVcmksIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UsIFtcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL2Jyb2tlbi9jb3JydXB0LnBuZycpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL2Jyb2tlbi9taXNzaW5nLmpwZycpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRdXG5cdFx0KSk7XG5cblx0XHQvLyBObyBmaWxlIGNvbnRlbnRzIFx1MjAxNCB3aXRoIGxhenkgbG9hZGluZywgbm8gcmVhZEZpbGUgc2hvdWxkIGJlIGNhbGxlZCBhdCBhY3Rpb24gdGltZVxuXHRcdGxldCByZWFkRmlsZUNhbGxDb3VudCA9IDA7XG5cdFx0c3R1YkZpbGVTZXJ2aWNlKHJlc29sdmVNYXAsIG5ldyBNYXAoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsICdyZWFkRmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJlYWRGaWxlQ2FsbENvdW50Kys7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3JlYWRGaWxlIHNob3VsZCBub3QgYmUgY2FsbGVkJyk7XG5cdFx0fSk7XG5cdFx0c3R1YkV4cGxvcmVyU2VydmljZShbXSk7XG5cdFx0c3R1YkVkaXRvclNlcnZpY2UoKTtcblx0XHRzdHViTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkltYWdlc0luQ2Fyb3VzZWwnKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjb21tYW5kLmhhbmRsZXIsIGZvbGRlclVyaSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVDYWxsQ291bnQsIDAsICdyZWFkRmlsZSBzaG91bGQgbm90IGJlIGNhbGxlZCBkdXJpbmcgYWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZElucHV0cy5sZW5ndGgsIDEsICdTaG91bGQgb3BlbiBjYXJvdXNlbCB3aXRoIGxhenkgaW1hZ2UgZW50cmllcycpO1xuXHRcdGNvbnN0IGltYWdlcyA9IG9wZW5lZElucHV0c1swXS5pbnB1dC5jb2xsZWN0aW9uLnNlY3Rpb25zWzBdLmltYWdlcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1hZ2VzLmxlbmd0aCwgMiwgJ1Nob3VsZCBpbmNsdWRlIDIgbGF6eSBpbWFnZSBlbnRyaWVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltYWdlc1swXS5kYXRhLCB1bmRlZmluZWQsICdJbWFnZSBkYXRhIHNob3VsZCBub3QgYmUgbG9hZGVkIGVhZ2VybHknKTtcblx0XHRhc3NlcnQub2soaW1hZ2VzWzBdLnVyaSwgJ0ltYWdlIHNob3VsZCBoYXZlIGEgVVJJIGZvciBsYXp5IGxvYWRpbmcnKTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyIGluY2x1ZGVzIHZpZGVvIGZpbGVzIGFsb25nc2lkZSBpbWFnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2xkZXJJdGVtID0gY3JlYXRlRXhwbG9yZXJJdGVtKCcvd29ya3NwYWNlL21lZGlhJywgdHJ1ZSwgZmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBJRmlsZVN0YXQ+KCk7XG5cdFx0cmVzb2x2ZU1hcC5zZXQoJy93b3Jrc3BhY2UvbWVkaWEnLCBjcmVhdGVGaWxlU3RhdChcblx0XHRcdFVSSS5maWxlKCcvd29ya3NwYWNlL21lZGlhJyksIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UsIFtcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL21lZGlhL2NsaXAubXA0JyksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvbWVkaWEvcGhvdG8ucG5nJyksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvbWVkaWEvZGVtby53ZWJtJyksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvbWVkaWEvaW50cm8ubW92JyksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvbWVkaWEvcmVhZG1lLnR4dCcpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRdXG5cdFx0KSk7XG5cblx0XHRzdHViRmlsZVNlcnZpY2UocmVzb2x2ZU1hcCwgbmV3IE1hcCgpKTtcblx0XHRzdHViRXhwbG9yZXJTZXJ2aWNlKFtmb2xkZXJJdGVtXSk7XG5cdFx0c3R1YkVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHsgQ29tbWFuZHNSZWdpc3RyeSB9ID0gYXdhaXQgaW1wb3J0KCcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnKTtcblx0XHRjb25zdCBjb21tYW5kID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5JbWFnZXNJbkNhcm91c2VsJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbW1hbmQpO1xuXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY29tbWFuZC5oYW5kbGVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVuZWRJbnB1dHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBpbWFnZXMgPSBvcGVuZWRJbnB1dHNbMF0uaW5wdXQuY29sbGVjdGlvbi5zZWN0aW9uc1swXS5pbWFnZXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltYWdlcy5sZW5ndGgsIDQsICdTaG91bGQgaW5jbHVkZSBtcDQgKyB3ZWJtICsgbW92ICsgcG5nLCBub3QgdHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltYWdlc1swXS5uYW1lLCAnY2xpcC5tcDQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1hZ2VzWzFdLm5hbWUsICdkZW1vLndlYm0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1hZ2VzWzJdLm5hbWUsICdpbnRyby5tb3YnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1hZ2VzWzNdLm5hbWUsICdwaG90by5wbmcnKTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlIHZpZGVvIGZpbGUgb3BlbnMgY2Fyb3VzZWwgd2l0aCBzaWJsaW5nIG1lZGlhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgcGFyZW50ID0gY3JlYXRlRXhwbG9yZXJJdGVtKCcvd29ya3NwYWNlL21lZGlhJywgdHJ1ZSwgZmlsZVNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZGVvSXRlbSA9IGNyZWF0ZUV4cGxvcmVySXRlbSgnL3dvcmtzcGFjZS9tZWRpYS9jbGlwLm1wNCcsIGZhbHNlLCBmaWxlU2VydmljZSwgY29uZmlnU2VydmljZSwgcGFyZW50KTtcblxuXHRcdGNvbnN0IHJlc29sdmVNYXAgPSBuZXcgTWFwPHN0cmluZywgSUZpbGVTdGF0PigpO1xuXHRcdHJlc29sdmVNYXAuc2V0KCcvd29ya3NwYWNlL21lZGlhJywgY3JlYXRlRmlsZVN0YXQoXG5cdFx0XHRVUkkuZmlsZSgnL3dvcmtzcGFjZS9tZWRpYScpLCBmYWxzZSwgZmFsc2UsIHRydWUsIGZhbHNlLCBbXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9tZWRpYS9jbGlwLm1wNCcpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL21lZGlhL3Bob3RvLnBuZycpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvd29ya3NwYWNlL21lZGlhL25vdGVzLnR4dCcpLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRdXG5cdFx0KSk7XG5cblx0XHRzdHViRmlsZVNlcnZpY2UocmVzb2x2ZU1hcCwgbmV3IE1hcCgpKTtcblx0XHRzdHViRXhwbG9yZXJTZXJ2aWNlKFt2aWRlb0l0ZW1dKTtcblx0XHRzdHViRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcycpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkltYWdlc0luQ2Fyb3VzZWwnKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjb21tYW5kLmhhbmRsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZElucHV0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGlucHV0ID0gb3BlbmVkSW5wdXRzWzBdLmlucHV0O1xuXHRcdGNvbnN0IGltYWdlcyA9IGlucHV0LmNvbGxlY3Rpb24uc2VjdGlvbnNbMF0uaW1hZ2VzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbWFnZXMubGVuZ3RoLCAyLCAnU2hvdWxkIGluY2x1ZGUgbXA0ICsgcG5nIHNpYmxpbmdzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGltYWdlc1swXS5uYW1lLCAnY2xpcC5tcDQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW1hZ2VzWzFdLm5hbWUsICdwaG90by5wbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuc3RhcnRJbmRleCwgMCwgJ1N0YXJ0IGluZGV4IHNob3VsZCBwb2ludCB0byB0aGUgc2VsZWN0ZWQg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
