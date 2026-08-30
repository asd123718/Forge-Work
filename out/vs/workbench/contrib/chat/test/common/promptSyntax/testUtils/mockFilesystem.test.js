import assert from "assert";
import { mockFiles, MockFilesystem } from "./mockFilesystem.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { assertDefined } from "../../../../../../../base/common/types.js";
import { FileService } from "../../../../../../../platform/files/common/fileService.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { InMemoryFileSystemProvider } from "../../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
async function validateFile(filePath, expectedFile, fileService) {
  let readFile;
  try {
    readFile = await fileService.resolve(URI.file(filePath));
  } catch (error) {
    throw new Error(`Failed to read file '${filePath}': ${error}.`);
  }
  assert.strictEqual(
    readFile.name,
    expectedFile.name,
    `File '${filePath}' must have correct 'name'.`
  );
  assert.deepStrictEqual(
    readFile.resource,
    expectedFile.resource,
    `File '${filePath}' must have correct 'URI'.`
  );
  assert.strictEqual(
    readFile.isFile,
    expectedFile.isFile,
    `File '${filePath}' must have correct 'isFile' value.`
  );
  assert.strictEqual(
    readFile.isDirectory,
    expectedFile.isDirectory,
    `File '${filePath}' must have correct 'isDirectory' value.`
  );
  assert.strictEqual(
    readFile.isSymbolicLink,
    expectedFile.isSymbolicLink,
    `File '${filePath}' must have correct 'isSymbolicLink' value.`
  );
  assert.strictEqual(
    readFile.children,
    void 0,
    `File '${filePath}' must not have children.`
  );
  const fileContents = await fileService.readFile(readFile.resource);
  assert.strictEqual(
    fileContents.value.toString(),
    expectedFile.contents,
    `File '${expectedFile.resource.fsPath}' must have correct contents.`
  );
}
async function validateFolder(folderPath, expectedFolder, fileService) {
  let readFolder;
  try {
    readFolder = await fileService.resolve(URI.file(folderPath));
  } catch (error) {
    throw new Error(`Failed to read folder '${folderPath}': ${error}.`);
  }
  assert.strictEqual(
    readFolder.name,
    expectedFolder.name,
    `Folder '${folderPath}' must have correct 'name'.`
  );
  assert.deepStrictEqual(
    readFolder.resource,
    expectedFolder.resource,
    `Folder '${folderPath}' must have correct 'URI'.`
  );
  assert.strictEqual(
    readFolder.isFile,
    expectedFolder.isFile,
    `Folder '${folderPath}' must have correct 'isFile' value.`
  );
  assert.strictEqual(
    readFolder.isDirectory,
    expectedFolder.isDirectory,
    `Folder '${folderPath}' must have correct 'isDirectory' value.`
  );
  assert.strictEqual(
    readFolder.isSymbolicLink,
    expectedFolder.isSymbolicLink,
    `Folder '${folderPath}' must have correct 'isSymbolicLink' value.`
  );
  assertDefined(
    readFolder.children,
    `Folder '${folderPath}' must have children.`
  );
  assert.strictEqual(
    readFolder.children.length,
    expectedFolder.children.length,
    `Folder '${folderPath}' must have correct number of children.`
  );
  for (const expectedChild of expectedFolder.children) {
    const childPath = URI.joinPath(expectedFolder.resource, expectedChild.name).fsPath;
    if ("children" in expectedChild) {
      await validateFolder(
        childPath,
        expectedChild,
        fileService
      );
      continue;
    }
    await validateFile(
      childPath,
      expectedChild,
      fileService
    );
  }
}
suite("MockFilesystem", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let fileService;
  setup(async () => {
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    fileService = disposables.add(instantiationService.createInstance(FileService));
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    instantiationService.stub(IFileService, fileService);
  });
  test("mocks file structure using new simplified format", async () => {
    const mockFilesystem = instantiationService.createInstance(MockFilesystem, [
      {
        path: "/root/folder/file.txt",
        contents: ["contents"]
      },
      {
        path: "/root/folder/Subfolder/test.ts",
        contents: ["other contents"]
      },
      {
        path: "/root/folder/Subfolder/file.test.ts",
        contents: ["hello test"]
      },
      {
        path: "/root/folder/Subfolder/.file-2.TEST.ts",
        contents: ["test hello"]
      }
    ]);
    await mockFilesystem.mock();
    await validateFolder(
      "/root/folder",
      {
        resource: URI.file("/root/folder"),
        name: "folder",
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        children: [
          {
            resource: URI.file("/root/folder/file.txt"),
            name: "file.txt",
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
            contents: "contents"
          },
          {
            resource: URI.file("/root/folder/Subfolder"),
            name: "Subfolder",
            isFile: false,
            isDirectory: true,
            isSymbolicLink: false,
            children: [
              {
                resource: URI.file("/root/folder/Subfolder/test.ts"),
                name: "test.ts",
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                contents: "other contents"
              },
              {
                resource: URI.file("/root/folder/Subfolder/file.test.ts"),
                name: "file.test.ts",
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                contents: "hello test"
              },
              {
                resource: URI.file("/root/folder/Subfolder/.file-2.TEST.ts"),
                name: ".file-2.TEST.ts",
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                contents: "test hello"
              }
            ]
          }
        ]
      },
      fileService
    );
  });
  test("can be created using static factory method", async () => {
    await mockFiles(fileService, [
      {
        path: "/simple/test.txt",
        contents: ["line 1", "line 2", "line 3"]
      }
    ]);
    await validateFile(
      "/simple/test.txt",
      {
        resource: URI.file("/simple/test.txt"),
        name: "test.txt",
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
        contents: "line 1\nline 2\nline 3"
      },
      fileService
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFx0ZXN0VXRpbHNcXG1vY2tGaWxlc3lzdGVtLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtb2NrRmlsZXMsIE1vY2tGaWxlc3lzdGVtIH0gZnJvbSAnLi9tb2NrRmlsZXN5c3RlbS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYXNzZXJ0RGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuXG4vKipcbiAqIEJhc2UgYXR0cmlidXRlIGZvciBhbiBleHBlY3RlZCBmaWxlc3lzdGVtIG5vZGUgKGEgZmlsZSBvciBhIGZvbGRlcikuXG4gKi9cbmludGVyZmFjZSBJRXhwZWN0ZWRGaWxlc3lzdGVtTm9kZSBleHRlbmRzIFBpY2s8XG5cdElGaWxlU3RhdCxcblx0J3Jlc291cmNlJyB8ICduYW1lJyB8ICdpc0ZpbGUnIHwgJ2lzRGlyZWN0b3J5JyB8ICdpc1N5bWJvbGljTGluaydcbj4geyB9XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBleHBlY3RlZCBgZmlsZWAgaW5mby5cbiAqL1xuaW50ZXJmYWNlIElFeHBlY3RlZEZpbGUgZXh0ZW5kcyBJRXhwZWN0ZWRGaWxlc3lzdGVtTm9kZSB7XG5cdC8qKlxuXHQgKiBFeHBlY3RlZCBmaWxlIGNvbnRlbnRzLlxuXHQgKi9cblx0Y29udGVudHM6IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGFuIGV4cGVjdGVkIGBmb2xkZXJgIGluZm8uXG4gKi9cbmludGVyZmFjZSBJRXhwZWN0ZWRGb2xkZXIgZXh0ZW5kcyBJRXhwZWN0ZWRGaWxlc3lzdGVtTm9kZSB7XG5cdC8qKlxuXHQgKiBFeHBlY3RlZCBmb2xkZXIgY2hpbGRyZW4uXG5cdCAqL1xuXHRjaGlsZHJlbjogKElFeHBlY3RlZEZvbGRlciB8IElFeHBlY3RlZEZpbGUpW107XG59XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoYXQgZmlsZSBhdCB7QGxpbmsgZmlsZVBhdGh9IGhhcyBleHBlY3RlZCBhdHRyaWJ1dGVzLlxuICovXG5hc3luYyBmdW5jdGlvbiB2YWxpZGF0ZUZpbGUoXG5cdGZpbGVQYXRoOiBzdHJpbmcsXG5cdGV4cGVjdGVkRmlsZTogSUV4cGVjdGVkRmlsZSxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcbikge1xuXHRsZXQgcmVhZEZpbGU6IElGaWxlU3RhdCB8IHVuZGVmaW5lZDtcblx0dHJ5IHtcblx0XHRyZWFkRmlsZSA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoZmlsZVBhdGgpKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byByZWFkIGZpbGUgJyR7ZmlsZVBhdGh9JzogJHtlcnJvcn0uYCk7XG5cdH1cblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZpbGUubmFtZSxcblx0XHRleHBlY3RlZEZpbGUubmFtZSxcblx0XHRgRmlsZSAnJHtmaWxlUGF0aH0nIG11c3QgaGF2ZSBjb3JyZWN0ICduYW1lJy5gLFxuXHQpO1xuXG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZpbGUucmVzb3VyY2UsXG5cdFx0ZXhwZWN0ZWRGaWxlLnJlc291cmNlLFxuXHRcdGBGaWxlICcke2ZpbGVQYXRofScgbXVzdCBoYXZlIGNvcnJlY3QgJ1VSSScuYCxcblx0KTtcblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZpbGUuaXNGaWxlLFxuXHRcdGV4cGVjdGVkRmlsZS5pc0ZpbGUsXG5cdFx0YEZpbGUgJyR7ZmlsZVBhdGh9JyBtdXN0IGhhdmUgY29ycmVjdCAnaXNGaWxlJyB2YWx1ZS5gLFxuXHQpO1xuXG5cdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRyZWFkRmlsZS5pc0RpcmVjdG9yeSxcblx0XHRleHBlY3RlZEZpbGUuaXNEaXJlY3RvcnksXG5cdFx0YEZpbGUgJyR7ZmlsZVBhdGh9JyBtdXN0IGhhdmUgY29ycmVjdCAnaXNEaXJlY3RvcnknIHZhbHVlLmAsXG5cdCk7XG5cblx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdHJlYWRGaWxlLmlzU3ltYm9saWNMaW5rLFxuXHRcdGV4cGVjdGVkRmlsZS5pc1N5bWJvbGljTGluayxcblx0XHRgRmlsZSAnJHtmaWxlUGF0aH0nIG11c3QgaGF2ZSBjb3JyZWN0ICdpc1N5bWJvbGljTGluaycgdmFsdWUuYCxcblx0KTtcblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZpbGUuY2hpbGRyZW4sXG5cdFx0dW5kZWZpbmVkLFxuXHRcdGBGaWxlICcke2ZpbGVQYXRofScgbXVzdCBub3QgaGF2ZSBjaGlsZHJlbi5gLFxuXHQpO1xuXG5cdGNvbnN0IGZpbGVDb250ZW50cyA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlYWRGaWxlLnJlc291cmNlKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdGZpbGVDb250ZW50cy52YWx1ZS50b1N0cmluZygpLFxuXHRcdGV4cGVjdGVkRmlsZS5jb250ZW50cyxcblx0XHRgRmlsZSAnJHtleHBlY3RlZEZpbGUucmVzb3VyY2UuZnNQYXRofScgbXVzdCBoYXZlIGNvcnJlY3QgY29udGVudHMuYCxcblx0KTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhhdCBmb2xkZXIgYXQge0BsaW5rIGZvbGRlclBhdGh9IGhhcyBleHBlY3RlZCBhdHRyaWJ1dGVzLlxuICovXG5hc3luYyBmdW5jdGlvbiB2YWxpZGF0ZUZvbGRlcihcblx0Zm9sZGVyUGF0aDogc3RyaW5nLFxuXHRleHBlY3RlZEZvbGRlcjogSUV4cGVjdGVkRm9sZGVyLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGxldCByZWFkRm9sZGVyOiBJRmlsZVN0YXQgfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0cmVhZEZvbGRlciA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoZm9sZGVyUGF0aCkpO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHJlYWQgZm9sZGVyICcke2ZvbGRlclBhdGh9JzogJHtlcnJvcn0uYCk7XG5cdH1cblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZvbGRlci5uYW1lLFxuXHRcdGV4cGVjdGVkRm9sZGVyLm5hbWUsXG5cdFx0YEZvbGRlciAnJHtmb2xkZXJQYXRofScgbXVzdCBoYXZlIGNvcnJlY3QgJ25hbWUnLmAsXG5cdCk7XG5cblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRyZWFkRm9sZGVyLnJlc291cmNlLFxuXHRcdGV4cGVjdGVkRm9sZGVyLnJlc291cmNlLFxuXHRcdGBGb2xkZXIgJyR7Zm9sZGVyUGF0aH0nIG11c3QgaGF2ZSBjb3JyZWN0ICdVUkknLmAsXG5cdCk7XG5cblx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdHJlYWRGb2xkZXIuaXNGaWxlLFxuXHRcdGV4cGVjdGVkRm9sZGVyLmlzRmlsZSxcblx0XHRgRm9sZGVyICcke2ZvbGRlclBhdGh9JyBtdXN0IGhhdmUgY29ycmVjdCAnaXNGaWxlJyB2YWx1ZS5gLFxuXHQpO1xuXG5cdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRyZWFkRm9sZGVyLmlzRGlyZWN0b3J5LFxuXHRcdGV4cGVjdGVkRm9sZGVyLmlzRGlyZWN0b3J5LFxuXHRcdGBGb2xkZXIgJyR7Zm9sZGVyUGF0aH0nIG11c3QgaGF2ZSBjb3JyZWN0ICdpc0RpcmVjdG9yeScgdmFsdWUuYCxcblx0KTtcblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZvbGRlci5pc1N5bWJvbGljTGluayxcblx0XHRleHBlY3RlZEZvbGRlci5pc1N5bWJvbGljTGluayxcblx0XHRgRm9sZGVyICcke2ZvbGRlclBhdGh9JyBtdXN0IGhhdmUgY29ycmVjdCAnaXNTeW1ib2xpY0xpbmsnIHZhbHVlLmAsXG5cdCk7XG5cblx0YXNzZXJ0RGVmaW5lZChcblx0XHRyZWFkRm9sZGVyLmNoaWxkcmVuLFxuXHRcdGBGb2xkZXIgJyR7Zm9sZGVyUGF0aH0nIG11c3QgaGF2ZSBjaGlsZHJlbi5gLFxuXHQpO1xuXG5cdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRyZWFkRm9sZGVyLmNoaWxkcmVuLmxlbmd0aCxcblx0XHRleHBlY3RlZEZvbGRlci5jaGlsZHJlbi5sZW5ndGgsXG5cdFx0YEZvbGRlciAnJHtmb2xkZXJQYXRofScgbXVzdCBoYXZlIGNvcnJlY3QgbnVtYmVyIG9mIGNoaWxkcmVuLmAsXG5cdCk7XG5cblx0Zm9yIChjb25zdCBleHBlY3RlZENoaWxkIG9mIGV4cGVjdGVkRm9sZGVyLmNoaWxkcmVuKSB7XG5cdFx0Y29uc3QgY2hpbGRQYXRoID0gVVJJLmpvaW5QYXRoKGV4cGVjdGVkRm9sZGVyLnJlc291cmNlLCBleHBlY3RlZENoaWxkLm5hbWUpLmZzUGF0aDtcblxuXHRcdGlmICgnY2hpbGRyZW4nIGluIGV4cGVjdGVkQ2hpbGQpIHtcblx0XHRcdGF3YWl0IHZhbGlkYXRlRm9sZGVyKFxuXHRcdFx0XHRjaGlsZFBhdGgsXG5cdFx0XHRcdGV4cGVjdGVkQ2hpbGQsXG5cdFx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdmFsaWRhdGVGaWxlKFxuXHRcdFx0Y2hpbGRQYXRoLFxuXHRcdFx0ZXhwZWN0ZWRDaGlsZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdCk7XG5cdH1cbn1cblxuc3VpdGUoJ01vY2tGaWxlc3lzdGVtJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZVNlcnZpY2UpKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2NrcyBmaWxlIHN0cnVjdHVyZSB1c2luZyBuZXcgc2ltcGxpZmllZCBmb3JtYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9ja0ZpbGVzeXN0ZW0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2NrRmlsZXN5c3RlbSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL3Jvb3QvZm9sZGVyL2ZpbGUudHh0Jyxcblx0XHRcdFx0Y29udGVudHM6IFsnY29udGVudHMnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9yb290L2ZvbGRlci9TdWJmb2xkZXIvdGVzdC50cycsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ290aGVyIGNvbnRlbnRzJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvcm9vdC9mb2xkZXIvU3ViZm9sZGVyL2ZpbGUudGVzdC50cycsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ2hlbGxvIHRlc3QnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9yb290L2ZvbGRlci9TdWJmb2xkZXIvLmZpbGUtMi5URVNULnRzJyxcblx0XHRcdFx0Y29udGVudHM6IFsndGVzdCBoZWxsbyddXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHRhd2FpdCBtb2NrRmlsZXN5c3RlbS5tb2NrKCk7XG5cblx0XHQvKipcblx0XHQgKiBWYWxpZGF0ZSBmaWxlcyBhbmQgZm9sZGVycyBuZXh0LlxuXHRcdCAqL1xuXG5cdFx0YXdhaXQgdmFsaWRhdGVGb2xkZXIoXG5cdFx0XHQnL3Jvb3QvZm9sZGVyJyxcblx0XHRcdHtcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5maWxlKCcvcm9vdC9mb2xkZXInKSxcblx0XHRcdFx0bmFtZTogJ2ZvbGRlcicsXG5cdFx0XHRcdGlzRmlsZTogZmFsc2UsXG5cdFx0XHRcdGlzRGlyZWN0b3J5OiB0cnVlLFxuXHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5maWxlKCcvcm9vdC9mb2xkZXIvZmlsZS50eHQnKSxcblx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlLnR4dCcsXG5cdFx0XHRcdFx0XHRpc0ZpbGU6IHRydWUsXG5cdFx0XHRcdFx0XHRpc0RpcmVjdG9yeTogZmFsc2UsXG5cdFx0XHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdFx0XHRjb250ZW50czogJ2NvbnRlbnRzJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkuZmlsZSgnL3Jvb3QvZm9sZGVyL1N1YmZvbGRlcicpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ1N1YmZvbGRlcicsXG5cdFx0XHRcdFx0XHRpc0ZpbGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IHRydWUsXG5cdFx0XHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5maWxlKCcvcm9vdC9mb2xkZXIvU3ViZm9sZGVyL3Rlc3QudHMnKSxcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAndGVzdC50cycsXG5cdFx0XHRcdFx0XHRcdFx0aXNGaWxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6ICdvdGhlciBjb250ZW50cycsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLmZpbGUoJy9yb290L2ZvbGRlci9TdWJmb2xkZXIvZmlsZS50ZXN0LnRzJyksXG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZpbGUudGVzdC50cycsXG5cdFx0XHRcdFx0XHRcdFx0aXNGaWxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6ICdoZWxsbyB0ZXN0Jyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkuZmlsZSgnL3Jvb3QvZm9sZGVyL1N1YmZvbGRlci8uZmlsZS0yLlRFU1QudHMnKSxcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnLmZpbGUtMi5URVNULnRzJyxcblx0XHRcdFx0XHRcdFx0XHRpc0ZpbGU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdGlzU3ltYm9saWNMaW5rOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50czogJ3Rlc3QgaGVsbG8nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGJlIGNyZWF0ZWQgdXNpbmcgc3RhdGljIGZhY3RvcnkgbWV0aG9kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL3NpbXBsZS90ZXN0LnR4dCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ2xpbmUgMScsICdsaW5lIDInLCAnbGluZSAzJ11cblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGF3YWl0IHZhbGlkYXRlRmlsZShcblx0XHRcdCcvc2ltcGxlL3Rlc3QudHh0Jyxcblx0XHRcdHtcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5maWxlKCcvc2ltcGxlL3Rlc3QudHh0JyksXG5cdFx0XHRcdG5hbWU6ICd0ZXN0LnR4dCcsXG5cdFx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdFx0aXNEaXJlY3Rvcnk6IGZhbHNlLFxuXHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdGNvbnRlbnRzOiAnbGluZSAxXFxubGluZSAyXFxubGluZSAzJyxcblx0XHRcdH0sXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVyxzQkFBc0I7QUFDMUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsb0JBQStCO0FBQ3hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsZ0NBQWdDO0FBaUN6QyxlQUFlLGFBQ2QsVUFDQSxjQUNBLGFBQ0M7QUFDRCxNQUFJO0FBQ0osTUFBSTtBQUNILGVBQVcsTUFBTSxZQUFZLFFBQVEsSUFBSSxLQUFLLFFBQVEsQ0FBQztBQUFBLEVBQ3hELFNBQVMsT0FBTztBQUNmLFVBQU0sSUFBSSxNQUFNLHdCQUF3QixRQUFRLE1BQU0sS0FBSyxHQUFHO0FBQUEsRUFDL0Q7QUFFQSxTQUFPO0FBQUEsSUFDTixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixTQUFTLFFBQVE7QUFBQSxFQUNsQjtBQUVBLFNBQU87QUFBQSxJQUNOLFNBQVM7QUFBQSxJQUNULGFBQWE7QUFBQSxJQUNiLFNBQVMsUUFBUTtBQUFBLEVBQ2xCO0FBRUEsU0FBTztBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsU0FBUyxRQUFRO0FBQUEsRUFDbEI7QUFFQSxTQUFPO0FBQUEsSUFDTixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixTQUFTLFFBQVE7QUFBQSxFQUNsQjtBQUVBLFNBQU87QUFBQSxJQUNOLFNBQVM7QUFBQSxJQUNULGFBQWE7QUFBQSxJQUNiLFNBQVMsUUFBUTtBQUFBLEVBQ2xCO0FBRUEsU0FBTztBQUFBLElBQ04sU0FBUztBQUFBLElBQ1Q7QUFB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
