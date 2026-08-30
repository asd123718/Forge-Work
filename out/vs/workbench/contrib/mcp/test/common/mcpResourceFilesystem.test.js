import * as assert from "assert";
import { Barrier, timeout } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { FileChangeType, FileSystemProviderErrorCode, FileType, IFileService, toFileSystemProviderErrorCode } from "../../../../../platform/files/common/files.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILoggerService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IAllowedMcpServersService } from "../../../../../platform/mcp/common/mcpManagement.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { TestContextService, TestLoggerService, TestProductService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { IMcpRegistry } from "../../common/mcpRegistryTypes.js";
import { McpResourceFilesystem } from "../../common/mcpResourceFilesystem.js";
import { McpService } from "../../common/mcpService.js";
import { IMcpService } from "../../common/mcpTypes.js";
import { TestMcpMessageTransport, TestMcpRegistry } from "./mcpRegistryTypes.js";
suite("Workbench - MCP - ResourceFilesystem", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let transport;
  let fs;
  setup(() => {
    const storageService = ds.add(new TestStorageService());
    const services = new ServiceCollection(
      [IFileService, { registerProvider: () => {
      } }],
      [IStorageService, storageService],
      [ILoggerService, ds.add(new TestLoggerService())],
      [IWorkspaceContextService, new TestContextService()],
      [IWorkbenchEnvironmentService, {}],
      [ITelemetryService, NullTelemetryService],
      [IProductService, TestProductService],
      [IAllowedMcpServersService, { _serviceBrand: void 0, onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowed: () => true }]
    );
    const parentInsta1 = ds.add(new TestInstantiationService(services));
    const registry = new TestMcpRegistry(parentInsta1);
    const parentInsta2 = ds.add(parentInsta1.createChild(new ServiceCollection([IMcpRegistry, registry])));
    const mcpService = ds.add(new McpService(parentInsta2, registry, new NullLogService(), new TestConfigurationService(), storageService));
    mcpService.updateCollectedServers();
    const instaService = ds.add(parentInsta2.createChild(new ServiceCollection(
      [IMcpRegistry, registry],
      [IMcpService, mcpService]
    )));
    fs = ds.add(instaService.createInstance(McpResourceFilesystem));
    transport = ds.add(new TestMcpMessageTransport());
    registry.makeTestTransport = () => transport;
  });
  test("reads a basic file", async () => {
    transport.setResponder("resources/read", (msg) => {
      const request = msg;
      assert.strictEqual(request.params.uri, "custom://hello/world.txt");
      return {
        id: request.id,
        jsonrpc: "2.0",
        result: {
          contents: [{ uri: request.params.uri, text: "Hello World" }]
        }
      };
    });
    const response = await fs.readFile(URI.parse("mcp-resource://746573742D736572766572/custom/hello/world.txt"));
    assert.strictEqual(new TextDecoder().decode(response), "Hello World");
  });
  test("stat returns file information", async () => {
    transport.setResponder("resources/read", (msg) => {
      const request = msg;
      assert.strictEqual(request.params.uri, "custom://hello/world.txt");
      return {
        id: request.id,
        jsonrpc: "2.0",
        result: {
          contents: [{ uri: request.params.uri, text: "Hello World" }]
        }
      };
    });
    const fileStats = await fs.stat(URI.parse("mcp-resource://746573742D736572766572/custom/hello/world.txt"));
    assert.strictEqual(fileStats.type, FileType.File);
    assert.strictEqual(fileStats.size, "Hello World".length);
  });
  test("stat returns directory information", async () => {
    transport.setResponder("resources/read", (msg) => {
      const request = msg;
      assert.strictEqual(request.params.uri, "custom://hello");
      return {
        id: request.id,
        jsonrpc: "2.0",
        result: {
          contents: [
            { uri: "custom://hello/file1.txt", text: "File 1" },
            { uri: "custom://hello/file2.txt", text: "File 2" }
          ]
        }
      };
    });
    const dirStats = await fs.stat(URI.parse("mcp-resource://746573742D736572766572/custom/hello/"));
    assert.strictEqual(dirStats.type, FileType.Directory);
    assert.strictEqual(dirStats.size, "File 1".length + "File 2".length);
  });
  test("stat throws FileNotFound for nonexistent resources", async () => {
    transport.setResponder("resources/read", (msg) => {
      const request = msg;
      return {
        id: request.id,
        jsonrpc: "2.0",
        result: {
          contents: []
        }
      };
    });
    await assert.rejects(
      () => fs.stat(URI.parse("mcp-resource://746573742D736572766572/custom/nonexistent.txt")),
      (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotFound
    );
  });
  test("readdir returns directory contents", async () => {
    transport.setResponder("resources/read", (msg) => {
      const request = msg;
      assert.strictEqual(request.params.uri, "custom://hello/dir");
      return {
        id: request.id,
        jsonrpc: "2.0",
        result: {
          contents: [
            { uri: "custom://hello/dir/file1.txt", text: "File 1" },
            { uri: "custom://hello/dir/file2.txt", text: "File 2" },
            { uri: "custom://hello/dir/subdir/file3.txt", text: "File 3" }
          ]
        }
      };
    });
    const dirEntries = await fs.readdir(URI.parse("mcp-resource://746573742D736572766572/custom/hello/dir/"));
    assert.deepStrictEqual(dirEntries, [
      ["file1.txt", FileType.File],
      ["file2.txt", FileType.File],
      ["subdir", FileType.Directory]
    ]);
  });
  test("readdir throws when reading a file as directory", async () => {
    transport.setResponder("resources/read", (msg) => {
      const request = msg;
      return {
        id: request.id,
        jsonrpc: "2.0",
        result: {
          contents: [{ uri: request.params.uri, text: "This is a file" }]
        }
      };
    });
    await assert.rejects(
      () => fs.readdir(URI.parse("mcp-resource://746573742D736572766572/custom/hello/file.txt")),
      (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotADirectory
    );
  });
  test("watch file emits change events", async () => {
    transport.setResponder("resources/read", (msg) => {
      const request = msg;
      return {
        id: request.id,
        jsonrpc: "2.0",
        result: {
          contents: [{ uri: request.params.uri, text: "File content" }]
        }
      };
    });
    const didSubscribe = new Barrier();
    transport.setResponder("resources/subscribe", (msg) => {
      const request = msg;
      didSubscribe.open();
      return {
        id: request.id,
        jsonrpc: "2.0",
        result: {}
      };
    });
    const uri = URI.parse("mcp-resource://746573742D736572766572/custom/hello/file.txt");
    const fileChanges = [];
    const disposable = fs.onDidChangeFile((events) => {
      fileChanges.push(...events);
    });
    const watchDisposable = fs.watch(uri, { excludes: [], recursive: false });
    await didSubscribe.wait();
    await timeout(10);
    transport.simulateReceiveMessage({
      jsonrpc: "2.0",
      method: "notifications/resources/updated",
      params: {
        uri: "custom://hello/file.txt"
      }
    });
    transport.simulateReceiveMessage({
      jsonrpc: "2.0",
      method: "notifications/resources/updated",
      params: {
        uri: "custom://hello/unrelated.txt"
      }
    });
    assert.strictEqual(fileChanges.length, 1);
    assert.strictEqual(fileChanges[0].type, FileChangeType.UPDATED);
    assert.strictEqual(fileChanges[0].resource.toString(), uri.toString());
    disposable.dispose();
    watchDisposable.dispose();
  });
  test("read blob resource", async () => {
    const blobBase64 = "SGVsbG8gV29ybGQgYXMgQmxvYg==";
    transport.setResponder("resources/read", (msg) => {
      const params = msg;
      assert.strictEqual(params.params.uri, "custom://hello/blob.bin");
      return {
        id: params.id,
        jsonrpc: "2.0",
        result: {
          contents: [{ uri: params.params.uri, blob: blobBase64 }]
        }
      };
    });
    const response = await fs.readFile(URI.parse("mcp-resource://746573742D736572766572/custom/hello/blob.bin"));
    assert.strictEqual(new TextDecoder().decode(response), "Hello World as Blob");
  });
  test("throws error for write operations", async () => {
    const uri = URI.parse("mcp-resource://746573742D736572766572/custom/hello/file.txt");
    await assert.rejects(
      async () => fs.writeFile(uri, new Uint8Array(), { create: true, overwrite: true, atomic: false, unlock: false }),
      (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions
    );
    await assert.rejects(
      async () => fs.delete(uri, { recursive: false, useTrash: false, atomic: false }),
      (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions
    );
    await assert.rejects(
      async () => fs.mkdir(uri),
      (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions
    );
    await assert.rejects(
      async () => fs.rename(uri, URI.parse("mcp-resource://746573742D736572766572/custom/hello/newfile.txt"), { overwrite: false }),
      (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BSZXNvdXJjZUZpbGVzeXN0ZW0udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQmFycmllciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZVR5cGUsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgRmlsZVR5cGUsIElGaWxlQ2hhbmdlLCBJRmlsZVNlcnZpY2UsIHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSwgVGVzdExvZ2dlclNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSwgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IE1jcFJlc291cmNlRmlsZXN5c3RlbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BSZXNvdXJjZUZpbGVzeXN0ZW0uanMnO1xuaW1wb3J0IHsgTWNwU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBUZXN0TWNwTWVzc2FnZVRyYW5zcG9ydCwgVGVzdE1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcblxuXG5zdWl0ZSgnV29ya2JlbmNoIC0gTUNQIC0gUmVzb3VyY2VGaWxlc3lzdGVtJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHRyYW5zcG9ydDogVGVzdE1jcE1lc3NhZ2VUcmFuc3BvcnQ7XG5cdGxldCBmczogTWNwUmVzb3VyY2VGaWxlc3lzdGVtO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lGaWxlU2VydmljZSwgeyByZWdpc3RlclByb3ZpZGVyOiAoKSA9PiB7IH0gfV0sXG5cdFx0XHRbSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZV0sXG5cdFx0XHRbSUxvZ2dlclNlcnZpY2UsIGRzLmFkZChuZXcgVGVzdExvZ2dlclNlcnZpY2UoKSldLFxuXHRcdFx0W0lXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSgpXSxcblx0XHRcdFtJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLCB7fV0sXG5cdFx0XHRbSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlXSxcblx0XHRcdFtJUHJvZHVjdFNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZV0sXG5cdFx0XHRbSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlQWxsb3dlZE1jcFNlcnZlcnM6IEV2ZW50Lk5vbmUsIGlzQWxsb3dlZDogKCkgPT4gdHJ1ZSwgaXNTZXJ2ZXJBbGxvd2VkOiAoKSA9PiB0cnVlIH1dLFxuXHRcdCk7XG5cblx0XHRjb25zdCBwYXJlbnRJbnN0YTEgPSBkcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IFRlc3RNY3BSZWdpc3RyeShwYXJlbnRJbnN0YTEpO1xuXG5cdFx0Y29uc3QgcGFyZW50SW5zdGEyID0gZHMuYWRkKHBhcmVudEluc3RhMS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lNY3BSZWdpc3RyeSwgcmVnaXN0cnldKSkpO1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBkcy5hZGQobmV3IE1jcFNlcnZpY2UocGFyZW50SW5zdGEyLCByZWdpc3RyeSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgc3RvcmFnZVNlcnZpY2UpKTtcblx0XHRtY3BTZXJ2aWNlLnVwZGF0ZUNvbGxlY3RlZFNlcnZlcnMoKTtcblxuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IGRzLmFkZChwYXJlbnRJbnN0YTIuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lNY3BSZWdpc3RyeSwgcmVnaXN0cnldLFxuXHRcdFx0W0lNY3BTZXJ2aWNlLCBtY3BTZXJ2aWNlXSxcblx0XHQpKSk7XG5cblx0XHRmcyA9IGRzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwUmVzb3VyY2VGaWxlc3lzdGVtKSk7XG5cblx0XHR0cmFuc3BvcnQgPSBkcy5hZGQobmV3IFRlc3RNY3BNZXNzYWdlVHJhbnNwb3J0KCkpO1xuXHRcdHJlZ2lzdHJ5Lm1ha2VUZXN0VHJhbnNwb3J0ID0gKCkgPT4gdHJhbnNwb3J0O1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkcyBhIGJhc2ljIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJhbnNwb3J0LnNldFJlc3BvbmRlcigncmVzb3VyY2VzL3JlYWQnLCBtc2cgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1zZyBhcyB7IGlkOiBzdHJpbmcgfCBudW1iZXI7IHBhcmFtczogeyB1cmk6IHN0cmluZyB9IH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdC5wYXJhbXMudXJpLCAnY3VzdG9tOi8vaGVsbG8vd29ybGQudHh0Jyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcmVxdWVzdC5pZCxcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdGNvbnRlbnRzOiBbeyB1cmk6IHJlcXVlc3QucGFyYW1zLnVyaSwgdGV4dDogJ0hlbGxvIFdvcmxkJyB9XSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgTUNQLlJlYWRSZXNvdXJjZVJlc3VsdFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZnMucmVhZEZpbGUoVVJJLnBhcnNlKCdtY3AtcmVzb3VyY2U6Ly83NDY1NzM3NDJENzM2NTcyNzY2NTcyL2N1c3RvbS9oZWxsby93b3JsZC50eHQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShyZXNwb25zZSksICdIZWxsbyBXb3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0IHJldHVybnMgZmlsZSBpbmZvcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHR0cmFuc3BvcnQuc2V0UmVzcG9uZGVyKCdyZXNvdXJjZXMvcmVhZCcsIG1zZyA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gbXNnIGFzIHsgaWQ6IHN0cmluZyB8IG51bWJlcjsgcGFyYW1zOiB7IHVyaTogc3RyaW5nIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0LnBhcmFtcy51cmksICdjdXN0b206Ly9oZWxsby93b3JsZC50eHQnKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiByZXF1ZXN0LmlkLFxuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0Y29udGVudHM6IFt7IHVyaTogcmVxdWVzdC5wYXJhbXMudXJpLCB0ZXh0OiAnSGVsbG8gV29ybGQnIH1dLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBNQ1AuUmVhZFJlc291cmNlUmVzdWx0XG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlsZVN0YXRzID0gYXdhaXQgZnMuc3RhdChVUkkucGFyc2UoJ21jcC1yZXNvdXJjZTovLzc0NjU3Mzc0MkQ3MzY1NzI3NjY1NzIvY3VzdG9tL2hlbGxvL3dvcmxkLnR4dCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVN0YXRzLnR5cGUsIEZpbGVUeXBlLkZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlU3RhdHMuc2l6ZSwgJ0hlbGxvIFdvcmxkJy5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0IHJldHVybnMgZGlyZWN0b3J5IGluZm9ybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdHRyYW5zcG9ydC5zZXRSZXNwb25kZXIoJ3Jlc291cmNlcy9yZWFkJywgbXNnID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtc2cgYXMgeyBpZDogc3RyaW5nIHwgbnVtYmVyOyBwYXJhbXM6IHsgdXJpOiBzdHJpbmcgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3QucGFyYW1zLnVyaSwgJ2N1c3RvbTovL2hlbGxvJyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcmVxdWVzdC5pZCxcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogJ2N1c3RvbTovL2hlbGxvL2ZpbGUxLnR4dCcsIHRleHQ6ICdGaWxlIDEnIH0sXG5cdFx0XHRcdFx0XHR7IHVyaTogJ2N1c3RvbTovL2hlbGxvL2ZpbGUyLnR4dCcsIHRleHQ6ICdGaWxlIDInIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgTUNQLlJlYWRSZXNvdXJjZVJlc3VsdFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpclN0YXRzID0gYXdhaXQgZnMuc3RhdChVUkkucGFyc2UoJ21jcC1yZXNvdXJjZTovLzc0NjU3Mzc0MkQ3MzY1NzI3NjY1NzIvY3VzdG9tL2hlbGxvLycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlyU3RhdHMudHlwZSwgRmlsZVR5cGUuRGlyZWN0b3J5KTtcblx0XHQvLyBTaXplIHNob3VsZCBiZSBzdW0gb2YgYWxsIGZpbGUgY29udGVudHMgaW4gdGhlIGRpcmVjdG9yeVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJTdGF0cy5zaXplLCAnRmlsZSAxJy5sZW5ndGggKyAnRmlsZSAyJy5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0IHRocm93cyBGaWxlTm90Rm91bmQgZm9yIG5vbmV4aXN0ZW50IHJlc291cmNlcycsIGFzeW5jICgpID0+IHtcblx0XHR0cmFuc3BvcnQuc2V0UmVzcG9uZGVyKCdyZXNvdXJjZXMvcmVhZCcsIG1zZyA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gbXNnIGFzIHsgaWQ6IHN0cmluZyB8IG51bWJlciB9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRjb250ZW50czogW10sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIE1DUC5SZWFkUmVzb3VyY2VSZXN1bHRcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGZzLnN0YXQoVVJJLnBhcnNlKCdtY3AtcmVzb3VyY2U6Ly83NDY1NzM3NDJENzM2NTcyNzY2NTcyL2N1c3RvbS9ub25leGlzdGVudC50eHQnKSksXG5cdFx0XHQoZXJyOiBFcnJvcikgPT4gdG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyKSA9PT0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRkaXIgcmV0dXJucyBkaXJlY3RvcnkgY29udGVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJhbnNwb3J0LnNldFJlc3BvbmRlcigncmVzb3VyY2VzL3JlYWQnLCBtc2cgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1zZyBhcyB7IGlkOiBzdHJpbmcgfCBudW1iZXI7IHBhcmFtczogeyB1cmk6IHN0cmluZyB9IH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdC5wYXJhbXMudXJpLCAnY3VzdG9tOi8vaGVsbG8vZGlyJyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcmVxdWVzdC5pZCxcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogJ2N1c3RvbTovL2hlbGxvL2Rpci9maWxlMS50eHQnLCB0ZXh0OiAnRmlsZSAxJyB9LFxuXHRcdFx0XHRcdFx0eyB1cmk6ICdjdXN0b206Ly9oZWxsby9kaXIvZmlsZTIudHh0JywgdGV4dDogJ0ZpbGUgMicgfSxcblx0XHRcdFx0XHRcdHsgdXJpOiAnY3VzdG9tOi8vaGVsbG8vZGlyL3N1YmRpci9maWxlMy50eHQnLCB0ZXh0OiAnRmlsZSAzJyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIE1DUC5SZWFkUmVzb3VyY2VSZXN1bHRcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaXJFbnRyaWVzID0gYXdhaXQgZnMucmVhZGRpcihVUkkucGFyc2UoJ21jcC1yZXNvdXJjZTovLzc0NjU3Mzc0MkQ3MzY1NzI3NjY1NzIvY3VzdG9tL2hlbGxvL2Rpci8nKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXJFbnRyaWVzLCBbXG5cdFx0XHRbJ2ZpbGUxLnR4dCcsIEZpbGVUeXBlLkZpbGVdLFxuXHRcdFx0WydmaWxlMi50eHQnLCBGaWxlVHlwZS5GaWxlXSxcblx0XHRcdFsnc3ViZGlyJywgRmlsZVR5cGUuRGlyZWN0b3J5XSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZGRpciB0aHJvd3Mgd2hlbiByZWFkaW5nIGEgZmlsZSBhcyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJhbnNwb3J0LnNldFJlc3BvbmRlcigncmVzb3VyY2VzL3JlYWQnLCBtc2cgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1zZyBhcyB7IGlkOiBzdHJpbmcgfCBudW1iZXI7IHBhcmFtczogeyB1cmk6IHN0cmluZyB9IH07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcmVxdWVzdC5pZCxcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdGNvbnRlbnRzOiBbeyB1cmk6IHJlcXVlc3QucGFyYW1zLnVyaSwgdGV4dDogJ1RoaXMgaXMgYSBmaWxlJyB9XSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgTUNQLlJlYWRSZXNvdXJjZVJlc3VsdFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gZnMucmVhZGRpcihVUkkucGFyc2UoJ21jcC1yZXNvdXJjZTovLzc0NjU3Mzc0MkQ3MzY1NzI3NjY1NzIvY3VzdG9tL2hlbGxvL2ZpbGUudHh0JykpLFxuXHRcdFx0KGVycjogRXJyb3IpID0+IHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVycikgPT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90QURpcmVjdG9yeVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIGZpbGUgZW1pdHMgY2hhbmdlIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXQgdXAgdGhlIHJlc3BvbmRlciBmb3IgcmVzb3VyY2UgcmVhZGluZ1xuXHRcdHRyYW5zcG9ydC5zZXRSZXNwb25kZXIoJ3Jlc291cmNlcy9yZWFkJywgbXNnID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtc2cgYXMgeyBpZDogc3RyaW5nIHwgbnVtYmVyOyBwYXJhbXM6IHsgdXJpOiBzdHJpbmcgfSB9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRjb250ZW50czogW3sgdXJpOiByZXF1ZXN0LnBhcmFtcy51cmksIHRleHQ6ICdGaWxlIGNvbnRlbnQnIH1dLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBNQ1AuUmVhZFJlc291cmNlUmVzdWx0XG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlkU3Vic2NyaWJlID0gbmV3IEJhcnJpZXIoKTtcblxuXHRcdC8vIFNldCB1cCB0aGUgcmVzcG9uZGVyIGZvciByZXNvdXJjZSBzdWJzY3JpcHRpb25cblx0XHR0cmFuc3BvcnQuc2V0UmVzcG9uZGVyKCdyZXNvdXJjZXMvc3Vic2NyaWJlJywgbXNnID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtc2cgYXMgeyBpZDogc3RyaW5nIHwgbnVtYmVyIH07XG5cdFx0XHRkaWRTdWJzY3JpYmUub3BlbigpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRyZXN1bHQ6IHt9LFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnbWNwLXJlc291cmNlOi8vNzQ2NTczNzQyRDczNjU3Mjc2NjU3Mi9jdXN0b20vaGVsbG8vZmlsZS50eHQnKTtcblx0XHRjb25zdCBmaWxlQ2hhbmdlczogSUZpbGVDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgbGlzdGVuZXIgZm9yIGZpbGUgY2hhbmdlIGV2ZW50c1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBmcy5vbkRpZENoYW5nZUZpbGUoZXZlbnRzID0+IHtcblx0XHRcdGZpbGVDaGFuZ2VzLnB1c2goLi4uZXZlbnRzKTtcblx0XHR9KTtcblxuXHRcdC8vIFN0YXJ0IHdhdGNoaW5nIHRoZSBmaWxlXG5cdFx0Y29uc3Qgd2F0Y2hEaXNwb3NhYmxlID0gZnMud2F0Y2godXJpLCB7IGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9KTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgZmlsZSB1cGRhdGUgbm90aWZpY2F0aW9uIGZyb20gdGhlIHNlcnZlclxuXHRcdGF3YWl0IGRpZFN1YnNjcmliZS53YWl0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7IC8vIHdhaXQgZm9yIGxpc3RlbmVycyB0byBhdHRhY2hcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZVJlY2VpdmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0bWV0aG9kOiAnbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCcsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0dXJpOiAnY3VzdG9tOi8vaGVsbG8vZmlsZS50eHQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVSZWNlaXZlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQnLFxuXHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdHVyaTogJ2N1c3RvbTovL2hlbGxvL3VucmVsYXRlZC50eHQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vIENoZWNrIHRoYXQgd2UgcmVjZWl2ZWQgYSBmaWxlIGNoYW5nZSBldmVudFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ2hhbmdlc1swXS50eXBlLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNoYW5nZXNbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gQ2xlYW4gdXBcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR3YXRjaERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIGJsb2IgcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmxvYkJhc2U2NCA9ICdTR1ZzYkc4Z1YyOXliR1FnWVhNZ1FteHZZZz09JzsgLy8gXCJIZWxsbyBXb3JsZCBhcyBCbG9iXCIgaW4gYmFzZTY0XG5cblx0XHR0cmFuc3BvcnQuc2V0UmVzcG9uZGVyKCdyZXNvdXJjZXMvcmVhZCcsIG1zZyA9PiB7XG5cdFx0XHRjb25zdCBwYXJhbXMgPSAobXNnIGFzIHsgaWQ6IHN0cmluZyB8IG51bWJlcjsgcGFyYW1zOiB7IHVyaTogc3RyaW5nIH0gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyYW1zLnBhcmFtcy51cmksICdjdXN0b206Ly9oZWxsby9ibG9iLmJpbicpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHBhcmFtcy5pZCxcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdGNvbnRlbnRzOiBbeyB1cmk6IHBhcmFtcy5wYXJhbXMudXJpLCBibG9iOiBibG9iQmFzZTY0IH1dLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBNQ1AuUmVhZFJlc291cmNlUmVzdWx0XG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmcy5yZWFkRmlsZShVUkkucGFyc2UoJ21jcC1yZXNvdXJjZTovLzc0NjU3Mzc0MkQ3MzY1NzI3NjY1NzIvY3VzdG9tL2hlbGxvL2Jsb2IuYmluJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUocmVzcG9uc2UpLCAnSGVsbG8gV29ybGQgYXMgQmxvYicpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aHJvd3MgZXJyb3IgZm9yIHdyaXRlIG9wZXJhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdtY3AtcmVzb3VyY2U6Ly83NDY1NzM3NDJENzM2NTcyNzY2NTcyL2N1c3RvbS9oZWxsby9maWxlLnR4dCcpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRhc3luYyAoKSA9PiBmcy53cml0ZUZpbGUodXJpLCBuZXcgVWludDhBcnJheSgpLCB7IGNyZWF0ZTogdHJ1ZSwgb3ZlcndyaXRlOiB0cnVlLCBhdG9taWM6IGZhbHNlLCB1bmxvY2s6IGZhbHNlIH0pLFxuXHRcdFx0KGVycjogRXJyb3IpID0+IHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVycikgPT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zXG5cdFx0KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0YXN5bmMgKCkgPT4gZnMuZGVsZXRlKHVyaSwgeyByZWN1cnNpdmU6IGZhbHNlLCB1c2VUcmFzaDogZmFsc2UsIGF0b21pYzogZmFsc2UgfSksXG5cdFx0XHQoZXJyOiBFcnJvcikgPT4gdG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyKSA9PT0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnNcblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRhc3luYyAoKSA9PiBmcy5ta2Rpcih1cmkpLFxuXHRcdFx0KGVycjogRXJyb3IpID0+IHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVycikgPT09IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zXG5cdFx0KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0YXN5bmMgKCkgPT4gZnMucmVuYW1lKHVyaSwgVVJJLnBhcnNlKCdtY3AtcmVzb3VyY2U6Ly83NDY1NzM3NDJENzM2NTcyNzY2NTcyL2N1c3RvbS9oZWxsby9uZXdmaWxlLnR4dCcpLCB7IG92ZXJ3cml0ZTogZmFsc2UgfSksXG5cdFx0XHQoZXJyOiBFcnJvcikgPT4gdG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyKSA9PT0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnNcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0IsNkJBQTZCLFVBQXVCLGNBQWMscUNBQXFDO0FBQ2hJLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCLHNCQUFzQjtBQUMvQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG9CQUFvQixtQkFBbUIsb0JBQW9CLDBCQUEwQjtBQUM5RixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUU1QixTQUFTLHlCQUF5Qix1QkFBdUI7QUFHekQsTUFBTSx3Q0FBd0MsTUFBTTtBQUVuRCxRQUFNLEtBQUssd0NBQXdDO0FBRW5ELE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsVUFBTSxpQkFBaUIsR0FBRyxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFDdEQsVUFBTSxXQUFXLElBQUk7QUFBQSxNQUNwQixDQUFDLGNBQWMs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
