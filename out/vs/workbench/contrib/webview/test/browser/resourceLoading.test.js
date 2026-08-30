import assert from "assert";
import { isWindows } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentityService.js";
import { getResourceToLoad } from "../../browser/resourceLoading.js";
suite("Webview Resource Loading - getResourceToLoad", () => {
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  let uriIdentityService;
  setup(() => {
    const instantiationService = disposableStore.add(new TestInstantiationService());
    instantiationService.stub(ILogService, NullLogService);
    const fileService = disposableStore.add(new FileService(instantiationService.get(ILogService)));
    uriIdentityService = instantiationService.stub(IUriIdentityService, disposableStore.add(new UriIdentityService(fileService)));
  });
  test("Returns resource when file is under root", () => {
    const root = URI.file("/home/user/project");
    const resource = URI.file("/home/user/project/file.txt");
    const result = getResourceToLoad(resource, [root], uriIdentityService);
    assert.strictEqual(result?.toString(), resource.toString());
  });
  test("Returns resource when file is in nested directory", () => {
    const root = URI.file("/home/user/project");
    const resource = URI.file("/home/user/project/subdir/nested/file.txt");
    const result = getResourceToLoad(resource, [root], uriIdentityService);
    assert.strictEqual(result?.toString(), resource.toString());
  });
  test("Fails when file is outside root", () => {
    const root = URI.file("/home/user/project");
    const resource = URI.file("/home/user/other/file.txt");
    const result = getResourceToLoad(resource, [root], uriIdentityService);
    assert.strictEqual(result, void 0);
  });
  test("Fails when file is root", () => {
    const root = URI.file("/home/user/project");
    const result = getResourceToLoad(root, [root], uriIdentityService);
    assert.strictEqual(result, void 0);
  });
  test("Fails when file is sibling of root directory", () => {
    const root = URI.file("/home/user/project");
    {
      const resource = URI.file("/home/user/projectOther/file.txt");
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result, void 0);
    }
    {
      const resource = URI.file("/home/user/project.txt");
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result, void 0);
    }
  });
  test("Returns resource when root ends with /", () => {
    const root = URI.file("/home/user/project/");
    const resource = URI.file("/home/user/project/file.txt");
    const result = getResourceToLoad(resource, [root], uriIdentityService);
    assert.strictEqual(result?.toString(), resource.toString());
  });
  test("Fails for sibling when root ends with / ", () => {
    const root = URI.file("/home/user/project/");
    const resource = URI.file("/home/user/projectOther/file.txt");
    const result = getResourceToLoad(resource, [root], uriIdentityService);
    assert.strictEqual(result, void 0);
  });
  (!isWindows ? suite.skip : suite)("UNC paths", () => {
    test("Returns resource when file is under UNC root", () => {
      const root = URI.file("\\\\server\\share\\folder");
      const resource = URI.file("\\\\server\\share\\folder\\file.txt");
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result?.toString(), resource.toString());
    });
    test("Returns resource with case-insensitive comparison for UNC paths", () => {
      const root = URI.file("\\\\SERVER\\SHARE\\folder");
      const resource = URI.file("\\\\server\\share\\folder\\file.txt");
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result?.toString(), resource.toString());
    });
    test("Fails when file is outside UNC root", () => {
      const root = URI.file("\\\\server\\share\\folder");
      const resource = URI.file("\\\\server\\share\\other\\file.txt");
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result, void 0);
    });
    test("Fails when UNC server differs", () => {
      const root = URI.file("\\\\server1\\share\\folder");
      const resource = URI.file("\\\\server2\\share\\folder\\file.txt");
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result, void 0);
    });
  });
  suite("Different authorities", () => {
    test("Returns resource when authorities match", () => {
      const root = URI.from({ scheme: "test-scheme", authority: "ssh-remote+myserver", path: "/home/user/project" });
      const resource = URI.from({ scheme: "test-scheme", authority: "ssh-remote+myserver", path: "/home/user/project/file.txt" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.ok(result);
    });
    test("Fails when authorities differ", () => {
      const root = URI.from({ scheme: "test-scheme", authority: "ssh-remote+server1", path: "/home/user/project" });
      const resource = URI.from({ scheme: "test-scheme", authority: "ssh-remote+server2", path: "/home/user/project/file.txt" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result, void 0);
    });
    test("handles empty authority", () => {
      const root = URI.from({ scheme: "test-scheme", authority: "", path: "/home/user/project" });
      const resource = URI.from({ scheme: "test-scheme", authority: "", path: "/home/user/project/file.txt" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result?.toString(), resource.toString());
    });
  });
  suite("Different schemes", () => {
    test("Fails when schemes differ", () => {
      const root = URI.from({ scheme: "file", path: "/home/user/project" });
      const resource = URI.from({ scheme: "http", path: "/home/user/project/file.txt" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result, void 0);
    });
    test("Returns resource when schemes match", () => {
      const root = URI.from({ scheme: "custom-scheme", path: "/home/user/project" });
      const resource = URI.from({ scheme: "custom-scheme", path: "/home/user/project/file.txt" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result?.toString(), resource.toString());
    });
    test("normalizes vscode-remote scheme", () => {
      const root = URI.from({ scheme: "vscode-remote", authority: "test", path: "/home/user/project" });
      const resource = URI.from({ scheme: "vscode-remote", authority: "test", path: "/home/user/project/file.txt" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.ok(result);
      assert.strictEqual(result.scheme, "vscode-remote");
      assert.strictEqual(result.authority, "test");
      assert.strictEqual(result.path, "/vscode-resource");
      const query = JSON.parse(result.query);
      assert.strictEqual(query.requestResourcePath, "/home/user/project/file.txt");
    });
  });
  suite("Fragment and query strings", () => {
    test("preserves fragment in returned URI", () => {
      const root = URI.file("/home/user/project");
      const resource = URI.file("/home/user/project/file.txt").with({ fragment: "section1" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result?.fragment, "section1");
    });
    test("preserves query in returned URI", () => {
      const root = URI.file("/home/user/project");
      const resource = URI.file("/home/user/project/file.txt").with({ query: "version=2" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result?.query, "version=2");
    });
    test("preserves both fragment and query", () => {
      const root = URI.file("/home/user/project");
      const resource = URI.file("/home/user/project/file.txt").with({ fragment: "section1", query: "version=2" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result?.fragment, "section1");
      assert.strictEqual(result?.query, "version=2");
    });
    test("still validates path containment with query params", () => {
      const root = URI.file("/home/user/project");
      const resource = URI.file("/home/user/other/file.txt").with({ query: "version=2" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result, void 0);
    });
    test("still validates path containment with fragment", () => {
      const root = URI.file("/home/user/project");
      const resource = URI.file("/home/user/other/file.txt").with({ fragment: "section1" });
      const result = getResourceToLoad(resource, [root], uriIdentityService);
      assert.strictEqual(result, void 0);
    });
  });
  suite("Multiple roots", () => {
    test("Returns resource when file is under one of multiple roots", () => {
      const roots = [
        URI.file("/home/user/project1"),
        URI.file("/home/user/project2"),
        URI.file("/home/user/project3")
      ];
      const resource = URI.file("/home/user/project2/file.txt");
      const result = getResourceToLoad(resource, roots, uriIdentityService);
      assert.strictEqual(result?.toString(), resource.toString());
    });
    test("Fails when file is not under any root", () => {
      const roots = [
        URI.file("/home/user/project1"),
        URI.file("/home/user/project2")
      ];
      const resource = URI.file("/home/user/other/file.txt");
      const result = getResourceToLoad(resource, roots, uriIdentityService);
      assert.strictEqual(result, void 0);
    });
    test("Returns resource matching first valid root", () => {
      const roots = [
        URI.file("/home/user/project"),
        URI.file("/home/user/project/subdir")
      ];
      const resource = URI.file("/home/user/project/subdir/file.txt");
      const result = getResourceToLoad(resource, roots, uriIdentityService);
      assert.strictEqual(result?.toString(), resource.toString());
    });
    test("handles empty roots array", () => {
      const resource = URI.file("/home/user/project/file.txt");
      const result = getResourceToLoad(resource, [], uriIdentityService);
      assert.strictEqual(result, void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlYnZpZXdcXHRlc3RcXGJyb3dzZXJcXHJlc291cmNlTG9hZGluZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFJlc291cmNlVG9Mb2FkIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9yZXNvdXJjZUxvYWRpbmcuanMnO1xuXG5zdWl0ZSgnV2VidmlldyBSZXNvdXJjZSBMb2FkaW5nIC0gZ2V0UmVzb3VyY2VUb0xvYWQnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEZpbGVTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpKTtcblx0XHR1cmlJZGVudGl0eVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVyaUlkZW50aXR5U2VydmljZShmaWxlU2VydmljZSkpKTtcblx0fSk7XG5cblx0dGVzdCgnUmV0dXJucyByZXNvdXJjZSB3aGVuIGZpbGUgaXMgdW5kZXIgcm9vdCcsICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnR4dCcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCBbcm9vdF0sIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JldHVybnMgcmVzb3VyY2Ugd2hlbiBmaWxlIGlzIGluIG5lc3RlZCBkaXJlY3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QnKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3Qvc3ViZGlyL25lc3RlZC9maWxlLnR4dCcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCBbcm9vdF0sIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZhaWxzIHdoZW4gZmlsZSBpcyBvdXRzaWRlIHJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QnKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvaG9tZS91c2VyL290aGVyL2ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIFtyb290XSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdGYWlscyB3aGVuIGZpbGUgaXMgcm9vdCcsICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJvb3QsIFtyb290XSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdGYWlscyB3aGVuIGZpbGUgaXMgc2libGluZyBvZiByb290IGRpcmVjdG9yeScsICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdE90aGVyL2ZpbGUudHh0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXNvdXJjZVRvTG9hZChyZXNvdXJjZSwgW3Jvb3RdLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9wcm9qZWN0LnR4dCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIFtyb290XSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdSZXR1cm5zIHJlc291cmNlIHdoZW4gcm9vdCBlbmRzIHdpdGggLycsICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdC8nKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QvZmlsZS50eHQnKTtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXNvdXJjZVRvTG9hZChyZXNvdXJjZSwgW3Jvb3RdLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGYWlscyBmb3Igc2libGluZyB3aGVuIHJvb3QgZW5kcyB3aXRoIC8gJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3QgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9wcm9qZWN0LycpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdE90aGVyL2ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIFtyb290XSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHQoIWlzV2luZG93cyAvKiBVTkMgaXMgd2luZG93cyBvbmx5ICovID8gc3VpdGUuc2tpcCA6IHN1aXRlKSgnVU5DIHBhdGhzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ1JldHVybnMgcmVzb3VyY2Ugd2hlbiBmaWxlIGlzIHVuZGVyIFVOQyByb290JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFxmb2xkZXInKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXGZvbGRlclxcXFxmaWxlLnR4dCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIFtyb290XSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUmV0dXJucyByZXNvdXJjZSB3aXRoIGNhc2UtaW5zZW5zaXRpdmUgY29tcGFyaXNvbiBmb3IgVU5DIHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCdcXFxcXFxcXFNFUlZFUlxcXFxTSEFSRVxcXFxmb2xkZXInKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXGZvbGRlclxcXFxmaWxlLnR4dCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIFtyb290XSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRmFpbHMgd2hlbiBmaWxlIGlzIG91dHNpZGUgVU5DIHJvb3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXGZvbGRlcicpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcb3RoZXJcXFxcZmlsZS50eHQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCBbcm9vdF0sIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRmFpbHMgd2hlbiBVTkMgc2VydmVyIGRpZmZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJ1xcXFxcXFxcc2VydmVyMVxcXFxzaGFyZVxcXFxmb2xkZXInKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ1xcXFxcXFxcc2VydmVyMlxcXFxzaGFyZVxcXFxmb2xkZXJcXFxcZmlsZS50eHQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCBbcm9vdF0sIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRGlmZmVyZW50IGF1dGhvcml0aWVzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ1JldHVybnMgcmVzb3VyY2Ugd2hlbiBhdXRob3JpdGllcyBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3Qtc2NoZW1lJywgYXV0aG9yaXR5OiAnc3NoLXJlbW90ZStteXNlcnZlcicsIHBhdGg6ICcvaG9tZS91c2VyL3Byb2plY3QnIH0pO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3Qtc2NoZW1lJywgYXV0aG9yaXR5OiAnc3NoLXJlbW90ZStteXNlcnZlcicsIHBhdGg6ICcvaG9tZS91c2VyL3Byb2plY3QvZmlsZS50eHQnIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIFtyb290XSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRmFpbHMgd2hlbiBhdXRob3JpdGllcyBkaWZmZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0LXNjaGVtZScsIGF1dGhvcml0eTogJ3NzaC1yZW1vdGUrc2VydmVyMScsIHBhdGg6ICcvaG9tZS91c2VyL3Byb2plY3QnIH0pO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3Qtc2NoZW1lJywgYXV0aG9yaXR5OiAnc3NoLXJlbW90ZStzZXJ2ZXIyJywgcGF0aDogJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnR4dCcgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXNvdXJjZVRvTG9hZChyZXNvdXJjZSwgW3Jvb3RdLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgYXV0aG9yaXR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdC1zY2hlbWUnLCBhdXRob3JpdHk6ICcnLCBwYXRoOiAnL2hvbWUvdXNlci9wcm9qZWN0JyB9KTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0LXNjaGVtZScsIGF1dGhvcml0eTogJycsIHBhdGg6ICcvaG9tZS91c2VyL3Byb2plY3QvZmlsZS50eHQnIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIFtyb290XSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRGlmZmVyZW50IHNjaGVtZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnRmFpbHMgd2hlbiBzY2hlbWVzIGRpZmZlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiAnL2hvbWUvdXNlci9wcm9qZWN0JyB9KTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgcGF0aDogJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnR4dCcgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXNvdXJjZVRvTG9hZChyZXNvdXJjZSwgW3Jvb3RdLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JldHVybnMgcmVzb3VyY2Ugd2hlbiBzY2hlbWVzIG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY3VzdG9tLXNjaGVtZScsIHBhdGg6ICcvaG9tZS91c2VyL3Byb2plY3QnIH0pO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2N1c3RvbS1zY2hlbWUnLCBwYXRoOiAnL2hvbWUvdXNlci9wcm9qZWN0L2ZpbGUudHh0JyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCBbcm9vdF0sIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vcm1hbGl6ZXMgdnNjb2RlLXJlbW90ZSBzY2hlbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiAndGVzdCcsIHBhdGg6ICcvaG9tZS91c2VyL3Byb2plY3QnIH0pO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6ICd0ZXN0JywgcGF0aDogJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnR4dCcgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXNvdXJjZVRvTG9hZChyZXNvdXJjZSwgW3Jvb3RdLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2NoZW1lLCAndnNjb2RlLXJlbW90ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hdXRob3JpdHksICd0ZXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnBhdGgsICcvdnNjb2RlLXJlc291cmNlJyk7XG5cdFx0XHRjb25zdCBxdWVyeSA9IEpTT04ucGFyc2UocmVzdWx0LnF1ZXJ5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5yZXF1ZXN0UmVzb3VyY2VQYXRoLCAnL2hvbWUvdXNlci9wcm9qZWN0L2ZpbGUudHh0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdGcmFnbWVudCBhbmQgcXVlcnkgc3RyaW5ncycsICgpID0+IHtcblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgZnJhZ21lbnQgaW4gcmV0dXJuZWQgVVJJJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QnKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnR4dCcpLndpdGgoeyBmcmFnbWVudDogJ3NlY3Rpb24xJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCBbcm9vdF0sIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5mcmFnbWVudCwgJ3NlY3Rpb24xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgcXVlcnkgaW4gcmV0dXJuZWQgVVJJJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QnKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnR4dCcpLndpdGgoeyBxdWVyeTogJ3ZlcnNpb249MicgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXNvdXJjZVRvTG9hZChyZXNvdXJjZSwgW3Jvb3RdLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8ucXVlcnksICd2ZXJzaW9uPTInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBib3RoIGZyYWdtZW50IGFuZCBxdWVyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9wcm9qZWN0Jyk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QvZmlsZS50eHQnKS53aXRoKHsgZnJhZ21lbnQ6ICdzZWN0aW9uMScsIHF1ZXJ5OiAndmVyc2lvbj0yJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCBbcm9vdF0sIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5mcmFnbWVudCwgJ3NlY3Rpb24xJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5xdWVyeSwgJ3ZlcnNpb249MicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RpbGwgdmFsaWRhdGVzIHBhdGggY29udGFpbm1lbnQgd2l0aCBxdWVyeSBwYXJhbXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9vdGhlci9maWxlLnR4dCcpLndpdGgoeyBxdWVyeTogJ3ZlcnNpb249MicgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXNvdXJjZVRvTG9hZChyZXNvdXJjZSwgW3Jvb3RdLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0aWxsIHZhbGlkYXRlcyBwYXRoIGNvbnRhaW5tZW50IHdpdGggZnJhZ21lbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9vdGhlci9maWxlLnR4dCcpLndpdGgoeyBmcmFnbWVudDogJ3NlY3Rpb24xJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCBbcm9vdF0sIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTXVsdGlwbGUgcm9vdHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnUmV0dXJucyByZXNvdXJjZSB3aGVuIGZpbGUgaXMgdW5kZXIgb25lIG9mIG11bHRpcGxlIHJvb3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdHMgPSBbXG5cdFx0XHRcdFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QxJyksXG5cdFx0XHRcdFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QyJyksXG5cdFx0XHRcdFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QzJylcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QyL2ZpbGUudHh0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRSZXNvdXJjZVRvTG9hZChyZXNvdXJjZSwgcm9vdHMsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0ZhaWxzIHdoZW4gZmlsZSBpcyBub3QgdW5kZXIgYW55IHJvb3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290cyA9IFtcblx0XHRcdFx0VVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdDEnKSxcblx0XHRcdFx0VVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdDInKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvb3RoZXIvZmlsZS50eHQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc291cmNlVG9Mb2FkKHJlc291cmNlLCByb290cywgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSZXR1cm5zIHJlc291cmNlIG1hdGNoaW5nIGZpcnN0IHZhbGlkIHJvb3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290cyA9IFtcblx0XHRcdFx0VVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdCcpLFxuXHRcdFx0XHRVUkkuZmlsZSgnL2hvbWUvdXNlci9wcm9qZWN0L3N1YmRpcicpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9wcm9qZWN0L3N1YmRpci9maWxlLnR4dCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIHJvb3RzLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0Ly8gU2hvdWxkIG1hdGNoIGZpcnN0IHJvb3QgaW4gdGhlIGxpc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBlbXB0eSByb290cyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnR4dCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzb3VyY2VUb0xvYWQocmVzb3VyY2UsIFtdLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLGdEQUFnRCxNQUFNO0FBQzNELFFBQU0sa0JBQWtCLHdDQUF3QztBQUVoRSxNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsVUFBTSx1QkFBdUIsZ0JBQWdCLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMvRSx5QkFBcUIsS0FBSyxhQUFhLGNBQWM7QUFDckQsVUFBTSxjQUFjLGdCQUFnQixJQUFJLElBQUksWUFBWSxxQkFBcUIsSUFBSSxXQUFXLENBQUMsQ0FBQztBQUM5Rix5QkFBcUIscUJBQXFCLEtBQUsscUJBQXFCLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLFdBQVcs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
