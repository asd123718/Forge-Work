import * as resources from "../../../../../base/common/resources.js";
import assert from "assert";
import { TestEnvironmentService, TestLifecycleService, TestPathService, TestRemoteAgentService } from "../../../../test/browser/workbenchTestServices.js";
import { URI } from "../../../../../base/common/uri.js";
import { LabelService } from "../../common/labelService.js";
import { TestContextService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { WorkspaceFolder } from "../../../../../platform/workspace/common/workspace.js";
import { TestWorkspace, Workspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { Memento } from "../../../../common/memento.js";
import { sep } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
suite("URI Label", () => {
  let labelService;
  let storageService;
  setup(() => {
    storageService = new TestStorageService();
    labelService = new LabelService(TestEnvironmentService, new TestContextService(), new TestPathService(URI.file("/foobar")), new TestRemoteAgentService(), storageService, new TestLifecycleService());
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("custom scheme", function() {
    labelService.registerFormatter({
      scheme: "vscode",
      formatting: {
        label: "LABEL/${path}/${authority}/END",
        separator: "/",
        tildify: true,
        normalizeDriveLetter: true
      }
    });
    const uri1 = URI.parse("vscode://microsoft.com/1/2/3/4/5");
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), "LABEL//1/2/3/4/5/microsoft.com/END");
    assert.strictEqual(labelService.getUriBasenameLabel(uri1), "END");
  });
  test("file scheme", function() {
    labelService.registerFormatter({
      scheme: "file",
      formatting: {
        label: "${path}",
        separator: sep,
        tildify: !isWindows,
        normalizeDriveLetter: isWindows
      }
    });
    const uri1 = TestWorkspace.folders[0].uri.with({ path: TestWorkspace.folders[0].uri.path.concat("/a/b/c/d") });
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: true }), isWindows ? "a\\b\\c\\d" : "a/b/c/d");
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), isWindows ? "C:\\testWorkspace\\a\\b\\c\\d" : "/testWorkspace/a/b/c/d");
    assert.strictEqual(labelService.getUriBasenameLabel(uri1), "d");
    const uri2 = URI.file("c:\\1/2/3");
    assert.strictEqual(labelService.getUriLabel(uri2, { relative: false }), isWindows ? "C:\\1\\2\\3" : "/c:\\1/2/3");
    assert.strictEqual(labelService.getUriBasenameLabel(uri2), "3");
  });
  test("separator", function() {
    labelService.registerFormatter({
      scheme: "vscode",
      formatting: {
        label: "LABEL\\${path}\\${authority}\\END",
        separator: "\\",
        tildify: true,
        normalizeDriveLetter: true
      }
    });
    const uri1 = URI.parse("vscode://microsoft.com/1/2/3/4/5");
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), "LABEL\\\\1\\2\\3\\4\\5\\microsoft.com\\END");
    assert.strictEqual(labelService.getUriBasenameLabel(uri1), "END");
  });
  test("custom authority", function() {
    labelService.registerFormatter({
      scheme: "vscode",
      authority: "micro*",
      formatting: {
        label: "LABEL/${path}/${authority}/END",
        separator: "/"
      }
    });
    const uri1 = URI.parse("vscode://microsoft.com/1/2/3/4/5");
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), "LABEL//1/2/3/4/5/microsoft.com/END");
    assert.strictEqual(labelService.getUriBasenameLabel(uri1), "END");
  });
  test("mulitple authority", function() {
    labelService.registerFormatter({
      scheme: "vscode",
      authority: "not_matching_but_long",
      formatting: {
        label: "first",
        separator: "/"
      }
    });
    labelService.registerFormatter({
      scheme: "vscode",
      authority: "microsof*",
      formatting: {
        label: "second",
        separator: "/"
      }
    });
    labelService.registerFormatter({
      scheme: "vscode",
      authority: "mi*",
      formatting: {
        label: "third",
        separator: "/"
      }
    });
    const uri1 = URI.parse("vscode://microsoft.com/1/2/3/4/5");
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), "second");
    assert.strictEqual(labelService.getUriBasenameLabel(uri1), "second");
  });
  test("custom query", function() {
    labelService.registerFormatter({
      scheme: "vscode",
      formatting: {
        label: "LABEL${query.prefix}: ${query.path}/END",
        separator: "/",
        tildify: true,
        normalizeDriveLetter: true
      }
    });
    const uri1 = URI.parse(`vscode://microsoft.com/1/2/3/4/5?${encodeURIComponent(JSON.stringify({ prefix: "prefix", path: "path" }))}`);
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), "LABELprefix: path/END");
  });
  test("custom query without value", function() {
    labelService.registerFormatter({
      scheme: "vscode",
      formatting: {
        label: "LABEL${query.prefix}: ${query.path}/END",
        separator: "/",
        tildify: true,
        normalizeDriveLetter: true
      }
    });
    const uri1 = URI.parse(`vscode://microsoft.com/1/2/3/4/5?${encodeURIComponent(JSON.stringify({ path: "path" }))}`);
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), "LABEL: path/END");
  });
  test("custom query without query json", function() {
    labelService.registerFormatter({
      scheme: "vscode",
      formatting: {
        label: "LABEL${query.prefix}: ${query.path}/END",
        separator: "/",
        tildify: true,
        normalizeDriveLetter: true
      }
    });
    const uri1 = URI.parse("vscode://microsoft.com/1/2/3/4/5?path=foo");
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), "LABEL: /END");
  });
  test("custom query without query", function() {
    labelService.registerFormatter({
      scheme: "vscode",
      formatting: {
        label: "LABEL${query.prefix}: ${query.path}/END",
        separator: "/",
        tildify: true,
        normalizeDriveLetter: true
      }
    });
    const uri1 = URI.parse("vscode://microsoft.com/1/2/3/4/5");
    assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), "LABEL: /END");
  });
  test("label caching", () => {
    const m = new Memento("cachedResourceLabelFormatters2", storageService).getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    const makeFormatter = (scheme) => ({ formatting: { label: `\${path} (${scheme})`, separator: "/" }, scheme });
    assert.deepStrictEqual(m, {});
    labelService.registerCachedFormatter(makeFormatter("a"));
    assert.deepStrictEqual(m, { formatters: [makeFormatter("a")] });
    labelService.registerCachedFormatter(makeFormatter("b"));
    assert.deepStrictEqual(m, { formatters: [makeFormatter("b"), makeFormatter("a")] });
    labelService.registerCachedFormatter(makeFormatter("a"));
    assert.deepStrictEqual(m, { formatters: [makeFormatter("a"), makeFormatter("b")] });
    labelService.registerCachedFormatter(makeFormatter("a"));
    assert.deepStrictEqual(m, { formatters: [makeFormatter("a"), makeFormatter("b")] });
    for (let i = 0; i < 100; i++) {
      labelService.registerCachedFormatter(makeFormatter(`i${i}`));
    }
    const expected = [];
    for (let i = 50; i < 100; i++) {
      expected.unshift(makeFormatter(`i${i}`));
    }
    assert.deepStrictEqual(m, { formatters: expected });
    delete m.formatters;
  });
});
suite("multi-root workspace", () => {
  let labelService;
  const disposables = new DisposableStore();
  setup(() => {
    const sources = URI.file("folder1/src");
    const tests = URI.file("folder1/test");
    const other = URI.file("folder2");
    labelService = disposables.add(new LabelService(
      TestEnvironmentService,
      new TestContextService(
        new Workspace("test-workspace", [
          new WorkspaceFolder({ uri: sources, index: 0, name: "Sources" }),
          new WorkspaceFolder({ uri: tests, index: 1, name: "Tests" }),
          new WorkspaceFolder({ uri: other, index: 2, name: resources.basename(other) })
        ])
      ),
      new TestPathService(),
      new TestRemoteAgentService(),
      disposables.add(new TestStorageService()),
      disposables.add(new TestLifecycleService())
    ));
  });
  teardown(() => {
    disposables.clear();
  });
  test("labels of files in multiroot workspaces are the foldername followed by offset from the folder", () => {
    labelService.registerFormatter({
      scheme: "file",
      formatting: {
        label: "${authority}${path}",
        separator: "/",
        tildify: false,
        normalizeDriveLetter: false,
        authorityPrefix: "//",
        workspaceSuffix: ""
      }
    });
    const tests = {
      "folder1/src/file": "Sources \u2022 file",
      "folder1/src/folder/file": "Sources \u2022 folder/file",
      "folder1/src": "Sources",
      "folder1/other": "/folder1/other",
      "folder2/other": "folder2 \u2022 other"
    };
    Object.entries(tests).forEach(([path, label]) => {
      const generated = labelService.getUriLabel(URI.file(path), { relative: true });
      assert.strictEqual(generated, label);
    });
  });
  test("labels with context after path", () => {
    labelService.registerFormatter({
      scheme: "file",
      formatting: {
        label: "${path} (${scheme})",
        separator: "/"
      }
    });
    const tests = {
      "folder1/src/file": "Sources \u2022 file (file)",
      "folder1/src/folder/file": "Sources \u2022 folder/file (file)",
      "folder1/src": "Sources",
      "folder1/other": "/folder1/other (file)",
      "folder2/other": "folder2 \u2022 other (file)"
    };
    Object.entries(tests).forEach(([path, label]) => {
      const generated = labelService.getUriLabel(URI.file(path), { relative: true });
      assert.strictEqual(generated, label, path);
    });
  });
  test("stripPathStartingSeparator", () => {
    labelService.registerFormatter({
      scheme: "file",
      formatting: {
        label: "${path}",
        separator: "/",
        stripPathStartingSeparator: true
      }
    });
    const tests = {
      "folder1/src/file": "Sources \u2022 file",
      "other/blah": "other/blah"
    };
    Object.entries(tests).forEach(([path, label]) => {
      const generated = labelService.getUriLabel(URI.file(path), { relative: true });
      assert.strictEqual(generated, label, path);
    });
  });
  test("stripPathSegments strips leading path segments", () => {
    labelService.registerFormatter({
      scheme: "vscode-agent-host",
      formatting: {
        label: "${path}",
        separator: "/",
        stripPathSegments: 2
      }
    });
    const uri = URI.from({ scheme: "vscode-agent-host", authority: "my-server", path: "/file//home/user/project/file.ts" });
    const generated = labelService.getUriLabel(uri, { relative: false });
    assert.strictEqual(generated, "/home/user/project/file.ts");
  });
  test("stripPathSegments combined with stripPathStartingSeparator", () => {
    labelService.registerFormatter({
      scheme: "vscode-agent-host",
      formatting: {
        label: "${path}",
        separator: "/",
        stripPathSegments: 2,
        stripPathStartingSeparator: true
      }
    });
    const uri = URI.from({ scheme: "vscode-agent-host", authority: "my-server", path: "/file//home/user/file.ts" });
    const generated = labelService.getUriLabel(uri, { relative: false });
    assert.strictEqual(generated, "home/user/file.ts");
  });
  test("stripPathSegments with fewer segments than requested", () => {
    labelService.registerFormatter({
      scheme: "test-strip",
      formatting: {
        label: "${path}",
        separator: "/",
        stripPathSegments: 5
      }
    });
    const uri = URI.from({ scheme: "test-strip", path: "/a/b" });
    const generated = labelService.getUriLabel(uri, { relative: false });
    assert.strictEqual(generated, "/b");
  });
  test("relative label without formatter", () => {
    const rootFolder = URI.parse("myscheme://myauthority/");
    labelService = disposables.add(new LabelService(
      TestEnvironmentService,
      new TestContextService(
        new Workspace("test-workspace", [
          new WorkspaceFolder({ uri: rootFolder, index: 0, name: "FSProotFolder" })
        ])
      ),
      new TestPathService(void 0, rootFolder.scheme),
      new TestRemoteAgentService(),
      disposables.add(new TestStorageService()),
      disposables.add(new TestLifecycleService())
    ));
    const generated = labelService.getUriLabel(URI.parse("myscheme://myauthority/some/folder/test.txt"), { relative: true });
    if (isWindows) {
      assert.strictEqual(generated, "some\\folder\\test.txt");
    } else {
      assert.strictEqual(generated, "some/folder/test.txt");
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("workspace at FSP root", () => {
  let labelService;
  setup(() => {
    const rootFolder = URI.parse("myscheme://myauthority/");
    labelService = new LabelService(
      TestEnvironmentService,
      new TestContextService(
        new Workspace("test-workspace", [
          new WorkspaceFolder({ uri: rootFolder, index: 0, name: "FSProotFolder" })
        ])
      ),
      new TestPathService(),
      new TestRemoteAgentService(),
      new TestStorageService(),
      new TestLifecycleService()
    );
    labelService.registerFormatter({
      scheme: "myscheme",
      formatting: {
        label: "${scheme}://${authority}${path}",
        separator: "/",
        tildify: false,
        normalizeDriveLetter: false,
        workspaceSuffix: "",
        authorityPrefix: "",
        stripPathStartingSeparator: false
      }
    });
  });
  test("non-relative label", () => {
    const tests = {
      "myscheme://myauthority/myFile1.txt": "myscheme://myauthority/myFile1.txt",
      "myscheme://myauthority/folder/myFile2.txt": "myscheme://myauthority/folder/myFile2.txt"
    };
    Object.entries(tests).forEach(([uriString, label]) => {
      const generated = labelService.getUriLabel(URI.parse(uriString), { relative: false });
      assert.strictEqual(generated, label);
    });
  });
  test("relative label", () => {
    const tests = {
      "myscheme://myauthority/myFile1.txt": "myFile1.txt",
      "myscheme://myauthority/folder/myFile2.txt": "folder/myFile2.txt"
    };
    Object.entries(tests).forEach(([uriString, label]) => {
      const generated = labelService.getUriLabel(URI.parse(uriString), { relative: true });
      assert.strictEqual(generated, label);
    });
  });
  test("relative label with explicit path separator", () => {
    let generated = labelService.getUriLabel(URI.parse("myscheme://myauthority/some/folder/test.txt"), { relative: true, separator: "/" });
    assert.strictEqual(generated, "some/folder/test.txt");
    generated = labelService.getUriLabel(URI.parse("myscheme://myauthority/some/folder/test.txt"), { relative: true, separator: "\\" });
    assert.strictEqual(generated, "some\\folder\\test.txt");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxsYWJlbFxcdGVzdFxcYnJvd3NlclxcbGFiZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVGVzdEVudmlyb25tZW50U2VydmljZSwgVGVzdExpZmVjeWNsZVNlcnZpY2UsIFRlc3RQYXRoU2VydmljZSwgVGVzdFJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IExhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVGVzdFdvcmtzcGFjZSwgV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL3Rlc3QvY29tbW9uL3Rlc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbEZvcm1hdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBzZXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuc3VpdGUoJ1VSSSBMYWJlbCcsICgpID0+IHtcblx0bGV0IGxhYmVsU2VydmljZTogTGFiZWxTZXJ2aWNlO1xuXHRsZXQgc3RvcmFnZVNlcnZpY2U6IFRlc3RTdG9yYWdlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c3RvcmFnZVNlcnZpY2UgPSBuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCk7XG5cdFx0bGFiZWxTZXJ2aWNlID0gbmV3IExhYmVsU2VydmljZShUZXN0RW52aXJvbm1lbnRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksIG5ldyBUZXN0UGF0aFNlcnZpY2UoVVJJLmZpbGUoJy9mb29iYXInKSksIG5ldyBUZXN0UmVtb3RlQWdlbnRTZXJ2aWNlKCksIHN0b3JhZ2VTZXJ2aWNlLCBuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2N1c3RvbSBzY2hlbWUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogJ3ZzY29kZScsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnTEFCRUwvJHtwYXRofS8ke2F1dGhvcml0eX0vRU5EJyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLycsXG5cdFx0XHRcdHRpbGRpZnk6IHRydWUsXG5cdFx0XHRcdG5vcm1hbGl6ZURyaXZlTGV0dGVyOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKCd2c2NvZGU6Ly9taWNyb3NvZnQuY29tLzEvMi8zLzQvNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpMSwgeyByZWxhdGl2ZTogZmFsc2UgfSksICdMQUJFTC8vMS8yLzMvNC81L21pY3Jvc29mdC5jb20vRU5EJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHVyaTEpLCAnRU5EJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUgc2NoZW1lJywgZnVuY3Rpb24gKCkge1xuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6ICdmaWxlJyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICcke3BhdGh9Jyxcblx0XHRcdFx0c2VwYXJhdG9yOiBzZXAsXG5cdFx0XHRcdHRpbGRpZnk6ICFpc1dpbmRvd3MsXG5cdFx0XHRcdG5vcm1hbGl6ZURyaXZlTGV0dGVyOiBpc1dpbmRvd3Ncblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHVyaTEgPSBUZXN0V29ya3NwYWNlLmZvbGRlcnNbMF0udXJpLndpdGgoeyBwYXRoOiBUZXN0V29ya3NwYWNlLmZvbGRlcnNbMF0udXJpLnBhdGguY29uY2F0KCcvYS9iL2MvZCcpIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpMSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSwgaXNXaW5kb3dzID8gJ2FcXFxcYlxcXFxjXFxcXGQnIDogJ2EvYi9jL2QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaTEsIHsgcmVsYXRpdmU6IGZhbHNlIH0pLCBpc1dpbmRvd3MgPyAnQzpcXFxcdGVzdFdvcmtzcGFjZVxcXFxhXFxcXGJcXFxcY1xcXFxkJyA6ICcvdGVzdFdvcmtzcGFjZS9hL2IvYy9kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHVyaTEpLCAnZCcpO1xuXG5cdFx0Y29uc3QgdXJpMiA9IFVSSS5maWxlKCdjOlxcXFwxLzIvMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpMiwgeyByZWxhdGl2ZTogZmFsc2UgfSksIGlzV2luZG93cyA/ICdDOlxcXFwxXFxcXDJcXFxcMycgOiAnL2M6XFxcXDEvMi8zJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHVyaTIpLCAnMycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXBhcmF0b3InLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogJ3ZzY29kZScsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnTEFCRUxcXFxcJHtwYXRofVxcXFwke2F1dGhvcml0eX1cXFxcRU5EJyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnXFxcXCcsXG5cdFx0XHRcdHRpbGRpZnk6IHRydWUsXG5cdFx0XHRcdG5vcm1hbGl6ZURyaXZlTGV0dGVyOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKCd2c2NvZGU6Ly9taWNyb3NvZnQuY29tLzEvMi8zLzQvNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpMSwgeyByZWxhdGl2ZTogZmFsc2UgfSksICdMQUJFTFxcXFxcXFxcMVxcXFwyXFxcXDNcXFxcNFxcXFw1XFxcXG1pY3Jvc29mdC5jb21cXFxcRU5EJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHVyaTEpLCAnRU5EJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1c3RvbSBhdXRob3JpdHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogJ3ZzY29kZScsXG5cdFx0XHRhdXRob3JpdHk6ICdtaWNybyonLFxuXHRcdFx0Zm9ybWF0dGluZzoge1xuXHRcdFx0XHRsYWJlbDogJ0xBQkVMLyR7cGF0aH0vJHthdXRob3JpdHl9L0VORCcsXG5cdFx0XHRcdHNlcGFyYXRvcjogJy8nXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKCd2c2NvZGU6Ly9taWNyb3NvZnQuY29tLzEvMi8zLzQvNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpMSwgeyByZWxhdGl2ZTogZmFsc2UgfSksICdMQUJFTC8vMS8yLzMvNC81L21pY3Jvc29mdC5jb20vRU5EJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHVyaTEpLCAnRU5EJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bGl0cGxlIGF1dGhvcml0eScsIGZ1bmN0aW9uICgpIHtcblx0XHRsYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiAndnNjb2RlJyxcblx0XHRcdGF1dGhvcml0eTogJ25vdF9tYXRjaGluZ19idXRfbG9uZycsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnZmlyc3QnLFxuXHRcdFx0XHRzZXBhcmF0b3I6ICcvJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6ICd2c2NvZGUnLFxuXHRcdFx0YXV0aG9yaXR5OiAnbWljcm9zb2YqJyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICdzZWNvbmQnLFxuXHRcdFx0XHRzZXBhcmF0b3I6ICcvJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6ICd2c2NvZGUnLFxuXHRcdFx0YXV0aG9yaXR5OiAnbWkqJyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICd0aGlyZCcsXG5cdFx0XHRcdHNlcGFyYXRvcjogJy8nXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBNYWtlIHN1cmUgdGhlIG1vc3Qgc3BlY2lmaWMgYXV0aG9yaXR5IGlzIHBpY2tlZFxuXHRcdGNvbnN0IHVyaTEgPSBVUkkucGFyc2UoJ3ZzY29kZTovL21pY3Jvc29mdC5jb20vMS8yLzMvNC81Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh1cmkxLCB7IHJlbGF0aXZlOiBmYWxzZSB9KSwgJ3NlY29uZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbCh1cmkxKSwgJ3NlY29uZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXN0b20gcXVlcnknLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogJ3ZzY29kZScsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnTEFCRUwke3F1ZXJ5LnByZWZpeH06ICR7cXVlcnkucGF0aH0vRU5EJyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLycsXG5cdFx0XHRcdHRpbGRpZnk6IHRydWUsXG5cdFx0XHRcdG5vcm1hbGl6ZURyaXZlTGV0dGVyOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKGB2c2NvZGU6Ly9taWNyb3NvZnQuY29tLzEvMi8zLzQvNT8ke2VuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh7IHByZWZpeDogJ3ByZWZpeCcsIHBhdGg6ICdwYXRoJyB9KSl9YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh1cmkxLCB7IHJlbGF0aXZlOiBmYWxzZSB9KSwgJ0xBQkVMcHJlZml4OiBwYXRoL0VORCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXN0b20gcXVlcnkgd2l0aG91dCB2YWx1ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRsYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiAndnNjb2RlJyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICdMQUJFTCR7cXVlcnkucHJlZml4fTogJHtxdWVyeS5wYXRofS9FTkQnLFxuXHRcdFx0XHRzZXBhcmF0b3I6ICcvJyxcblx0XHRcdFx0dGlsZGlmeTogdHJ1ZSxcblx0XHRcdFx0bm9ybWFsaXplRHJpdmVMZXR0ZXI6IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHVyaTEgPSBVUkkucGFyc2UoYHZzY29kZTovL21pY3Jvc29mdC5jb20vMS8yLzMvNC81PyR7ZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHsgcGF0aDogJ3BhdGgnIH0pKX1gKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaTEsIHsgcmVsYXRpdmU6IGZhbHNlIH0pLCAnTEFCRUw6IHBhdGgvRU5EJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1c3RvbSBxdWVyeSB3aXRob3V0IHF1ZXJ5IGpzb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogJ3ZzY29kZScsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnTEFCRUwke3F1ZXJ5LnByZWZpeH06ICR7cXVlcnkucGF0aH0vRU5EJyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLycsXG5cdFx0XHRcdHRpbGRpZnk6IHRydWUsXG5cdFx0XHRcdG5vcm1hbGl6ZURyaXZlTGV0dGVyOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKCd2c2NvZGU6Ly9taWNyb3NvZnQuY29tLzEvMi8zLzQvNT9wYXRoPWZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpMSwgeyByZWxhdGl2ZTogZmFsc2UgfSksICdMQUJFTDogL0VORCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXN0b20gcXVlcnkgd2l0aG91dCBxdWVyeScsIGZ1bmN0aW9uICgpIHtcblx0XHRsYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiAndnNjb2RlJyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICdMQUJFTCR7cXVlcnkucHJlZml4fTogJHtxdWVyeS5wYXRofS9FTkQnLFxuXHRcdFx0XHRzZXBhcmF0b3I6ICcvJyxcblx0XHRcdFx0dGlsZGlmeTogdHJ1ZSxcblx0XHRcdFx0bm9ybWFsaXplRHJpdmVMZXR0ZXI6IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHVyaTEgPSBVUkkucGFyc2UoJ3ZzY29kZTovL21pY3Jvc29mdC5jb20vMS8yLzMvNC81Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh1cmkxLCB7IHJlbGF0aXZlOiBmYWxzZSB9KSwgJ0xBQkVMOiAvRU5EJyk7XG5cdH0pO1xuXG5cblx0dGVzdCgnbGFiZWwgY2FjaGluZycsICgpID0+IHtcblx0XHRjb25zdCBtID0gbmV3IE1lbWVudG8oJ2NhY2hlZFJlc291cmNlTGFiZWxGb3JtYXR0ZXJzMicsIHN0b3JhZ2VTZXJ2aWNlKS5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGNvbnN0IG1ha2VGb3JtYXR0ZXIgPSAoc2NoZW1lOiBzdHJpbmcpOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyID0+ICh7IGZvcm1hdHRpbmc6IHsgbGFiZWw6IGBcXCR7cGF0aH0gKCR7c2NoZW1lfSlgLCBzZXBhcmF0b3I6ICcvJyB9LCBzY2hlbWUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLCB7fSk7XG5cblx0XHQvLyByZWdpc3RlcnMgYSBuZXcgZm9ybWF0dGVyOlxuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckNhY2hlZEZvcm1hdHRlcihtYWtlRm9ybWF0dGVyKCdhJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobSwgeyBmb3JtYXR0ZXJzOiBbbWFrZUZvcm1hdHRlcignYScpXSB9KTtcblxuXHRcdC8vIHJlZ2lzdGVycyBhIDJuZCBmb3JtYXR0ZXI6XG5cdFx0bGFiZWxTZXJ2aWNlLnJlZ2lzdGVyQ2FjaGVkRm9ybWF0dGVyKG1ha2VGb3JtYXR0ZXIoJ2InKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLCB7IGZvcm1hdHRlcnM6IFttYWtlRm9ybWF0dGVyKCdiJyksIG1ha2VGb3JtYXR0ZXIoJ2EnKV0gfSk7XG5cblx0XHQvLyBwcm9tb3RlcyBhIGZvcm1hdHRlciBvbiByZS1yZWdpc3Rlcjpcblx0XHRsYWJlbFNlcnZpY2UucmVnaXN0ZXJDYWNoZWRGb3JtYXR0ZXIobWFrZUZvcm1hdHRlcignYScpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0sIHsgZm9ybWF0dGVyczogW21ha2VGb3JtYXR0ZXIoJ2EnKSwgbWFrZUZvcm1hdHRlcignYicpXSB9KTtcblxuXHRcdC8vIG5vLW9wcyBpZiBhbHJlYWR5IGluIGZpcnN0IHBsYWNlOlxuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckNhY2hlZEZvcm1hdHRlcihtYWtlRm9ybWF0dGVyKCdhJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobSwgeyBmb3JtYXR0ZXJzOiBbbWFrZUZvcm1hdHRlcignYScpLCBtYWtlRm9ybWF0dGVyKCdiJyldIH0pO1xuXG5cdFx0Ly8gbGltaXRzIHRoZSBjYWNoZTpcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRsYWJlbFNlcnZpY2UucmVnaXN0ZXJDYWNoZWRGb3JtYXR0ZXIobWFrZUZvcm1hdHRlcihgaSR7aX1gKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4cGVjdGVkOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gNTA7IGkgPCAxMDA7IGkrKykge1xuXHRcdFx0ZXhwZWN0ZWQudW5zaGlmdChtYWtlRm9ybWF0dGVyKGBpJHtpfWApKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLCB7IGZvcm1hdHRlcnM6IGV4cGVjdGVkIH0pO1xuXG5cdFx0ZGVsZXRlIChtIGFzIHsgZm9ybWF0dGVyczogdW5rbm93biB9KS5mb3JtYXR0ZXJzO1xuXHR9KTtcbn0pO1xuXG5cbnN1aXRlKCdtdWx0aS1yb290IHdvcmtzcGFjZScsICgpID0+IHtcblx0bGV0IGxhYmVsU2VydmljZTogTGFiZWxTZXJ2aWNlO1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlcyA9IFVSSS5maWxlKCdmb2xkZXIxL3NyYycpO1xuXHRcdGNvbnN0IHRlc3RzID0gVVJJLmZpbGUoJ2ZvbGRlcjEvdGVzdCcpO1xuXHRcdGNvbnN0IG90aGVyID0gVVJJLmZpbGUoJ2ZvbGRlcjInKTtcblxuXHRcdGxhYmVsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFiZWxTZXJ2aWNlKFxuXHRcdFx0VGVzdEVudmlyb25tZW50U2VydmljZSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoXG5cdFx0XHRcdG5ldyBXb3Jrc3BhY2UoJ3Rlc3Qtd29ya3NwYWNlJywgW1xuXHRcdFx0XHRcdG5ldyBXb3Jrc3BhY2VGb2xkZXIoeyB1cmk6IHNvdXJjZXMsIGluZGV4OiAwLCBuYW1lOiAnU291cmNlcycgfSksXG5cdFx0XHRcdFx0bmV3IFdvcmtzcGFjZUZvbGRlcih7IHVyaTogdGVzdHMsIGluZGV4OiAxLCBuYW1lOiAnVGVzdHMnIH0pLFxuXHRcdFx0XHRcdG5ldyBXb3Jrc3BhY2VGb2xkZXIoeyB1cmk6IG90aGVyLCBpbmRleDogMiwgbmFtZTogcmVzb3VyY2VzLmJhc2VuYW1lKG90aGVyKSB9KSxcblx0XHRcdFx0XSkpLFxuXHRcdFx0bmV3IFRlc3RQYXRoU2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RSZW1vdGVBZ2VudFNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKVxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVzdCgnbGFiZWxzIG9mIGZpbGVzIGluIG11bHRpcm9vdCB3b3Jrc3BhY2VzIGFyZSB0aGUgZm9sZGVybmFtZSBmb2xsb3dlZCBieSBvZmZzZXQgZnJvbSB0aGUgZm9sZGVyJywgKCkgPT4ge1xuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6ICdmaWxlJyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICcke2F1dGhvcml0eX0ke3BhdGh9Jyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLycsXG5cdFx0XHRcdHRpbGRpZnk6IGZhbHNlLFxuXHRcdFx0XHRub3JtYWxpemVEcml2ZUxldHRlcjogZmFsc2UsXG5cdFx0XHRcdGF1dGhvcml0eVByZWZpeDogJy8vJyxcblx0XHRcdFx0d29ya3NwYWNlU3VmZml4OiAnJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGVzdHMgPSB7XG5cdFx0XHQnZm9sZGVyMS9zcmMvZmlsZSc6ICdTb3VyY2VzIFx1MjAyMiBmaWxlJyxcblx0XHRcdCdmb2xkZXIxL3NyYy9mb2xkZXIvZmlsZSc6ICdTb3VyY2VzIFx1MjAyMiBmb2xkZXIvZmlsZScsXG5cdFx0XHQnZm9sZGVyMS9zcmMnOiAnU291cmNlcycsXG5cdFx0XHQnZm9sZGVyMS9vdGhlcic6ICcvZm9sZGVyMS9vdGhlcicsXG5cdFx0XHQnZm9sZGVyMi9vdGhlcic6ICdmb2xkZXIyIFx1MjAyMiBvdGhlcicsXG5cdFx0fTtcblxuXHRcdE9iamVjdC5lbnRyaWVzKHRlc3RzKS5mb3JFYWNoKChbcGF0aCwgbGFiZWxdKSA9PiB7XG5cdFx0XHRjb25zdCBnZW5lcmF0ZWQgPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoVVJJLmZpbGUocGF0aCksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2VuZXJhdGVkLCBsYWJlbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhYmVscyB3aXRoIGNvbnRleHQgYWZ0ZXIgcGF0aCcsICgpID0+IHtcblx0XHRsYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiAnZmlsZScsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnJHtwYXRofSAoJHtzY2hlbWV9KScsXG5cdFx0XHRcdHNlcGFyYXRvcjogJy8nLFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGVzdHMgPSB7XG5cdFx0XHQnZm9sZGVyMS9zcmMvZmlsZSc6ICdTb3VyY2VzIFx1MjAyMiBmaWxlIChmaWxlKScsXG5cdFx0XHQnZm9sZGVyMS9zcmMvZm9sZGVyL2ZpbGUnOiAnU291cmNlcyBcdTIwMjIgZm9sZGVyL2ZpbGUgKGZpbGUpJyxcblx0XHRcdCdmb2xkZXIxL3NyYyc6ICdTb3VyY2VzJyxcblx0XHRcdCdmb2xkZXIxL290aGVyJzogJy9mb2xkZXIxL290aGVyIChmaWxlKScsXG5cdFx0XHQnZm9sZGVyMi9vdGhlcic6ICdmb2xkZXIyIFx1MjAyMiBvdGhlciAoZmlsZSknLFxuXHRcdH07XG5cblx0XHRPYmplY3QuZW50cmllcyh0ZXN0cykuZm9yRWFjaCgoW3BhdGgsIGxhYmVsXSkgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhdGVkID0gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKFVSSS5maWxlKHBhdGgpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdlbmVyYXRlZCwgbGFiZWwsIHBhdGgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcFBhdGhTdGFydGluZ1NlcGFyYXRvcicsICgpID0+IHtcblx0XHRsYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiAnZmlsZScsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnJHtwYXRofScsXG5cdFx0XHRcdHNlcGFyYXRvcjogJy8nLFxuXHRcdFx0XHRzdHJpcFBhdGhTdGFydGluZ1NlcGFyYXRvcjogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGVzdHMgPSB7XG5cdFx0XHQnZm9sZGVyMS9zcmMvZmlsZSc6ICdTb3VyY2VzIFx1MjAyMiBmaWxlJyxcblx0XHRcdCdvdGhlci9ibGFoJzogJ290aGVyL2JsYWgnLFxuXHRcdH07XG5cblx0XHRPYmplY3QuZW50cmllcyh0ZXN0cykuZm9yRWFjaCgoW3BhdGgsIGxhYmVsXSkgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhdGVkID0gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKFVSSS5maWxlKHBhdGgpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdlbmVyYXRlZCwgbGFiZWwsIHBhdGgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcFBhdGhTZWdtZW50cyBzdHJpcHMgbGVhZGluZyBwYXRoIHNlZ21lbnRzJywgKCkgPT4ge1xuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6ICd2c2NvZGUtYWdlbnQtaG9zdCcsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnJHtwYXRofScsXG5cdFx0XHRcdHNlcGFyYXRvcjogJy8nLFxuXHRcdFx0XHRzdHJpcFBhdGhTZWdtZW50czogMlxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtYWdlbnQtaG9zdCcsIGF1dGhvcml0eTogJ215LXNlcnZlcicsIHBhdGg6ICcvZmlsZS8vaG9tZS91c2VyL3Byb2plY3QvZmlsZS50cycgfSk7XG5cdFx0Y29uc3QgZ2VuZXJhdGVkID0gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaSwgeyByZWxhdGl2ZTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdlbmVyYXRlZCwgJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnRzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwUGF0aFNlZ21lbnRzIGNvbWJpbmVkIHdpdGggc3RyaXBQYXRoU3RhcnRpbmdTZXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0bGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogJ3ZzY29kZS1hZ2VudC1ob3N0Jyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICcke3BhdGh9Jyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLycsXG5cdFx0XHRcdHN0cmlwUGF0aFNlZ21lbnRzOiAyLFxuXHRcdFx0XHRzdHJpcFBhdGhTdGFydGluZ1NlcGFyYXRvcjogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtYWdlbnQtaG9zdCcsIGF1dGhvcml0eTogJ215LXNlcnZlcicsIHBhdGg6ICcvZmlsZS8vaG9tZS91c2VyL2ZpbGUudHMnIH0pO1xuXHRcdGNvbnN0IGdlbmVyYXRlZCA9IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh1cmksIHsgcmVsYXRpdmU6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZW5lcmF0ZWQsICdob21lL3VzZXIvZmlsZS50cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcFBhdGhTZWdtZW50cyB3aXRoIGZld2VyIHNlZ21lbnRzIHRoYW4gcmVxdWVzdGVkJywgKCkgPT4ge1xuXHRcdGxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6ICd0ZXN0LXN0cmlwJyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICcke3BhdGh9Jyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLycsXG5cdFx0XHRcdHN0cmlwUGF0aFNlZ21lbnRzOiA1XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3Qtc3RyaXAnLCBwYXRoOiAnL2EvYicgfSk7XG5cdFx0Y29uc3QgZ2VuZXJhdGVkID0gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaSwgeyByZWxhdGl2ZTogZmFsc2UgfSk7XG5cdFx0Ly8gU2hvdWxkIHN0cmlwIGFzIG1hbnkgYXMgcG9zc2libGUgd2l0aG91dCBjcmFzaGluZ1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZW5lcmF0ZWQsICcvYicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxhdGl2ZSBsYWJlbCB3aXRob3V0IGZvcm1hdHRlcicsICgpID0+IHtcblx0XHRjb25zdCByb290Rm9sZGVyID0gVVJJLnBhcnNlKCdteXNjaGVtZTovL215YXV0aG9yaXR5LycpO1xuXG5cdFx0bGFiZWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYWJlbFNlcnZpY2UoXG5cdFx0XHRUZXN0RW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZShcblx0XHRcdFx0bmV3IFdvcmtzcGFjZSgndGVzdC13b3Jrc3BhY2UnLCBbXG5cdFx0XHRcdFx0bmV3IFdvcmtzcGFjZUZvbGRlcih7IHVyaTogcm9vdEZvbGRlciwgaW5kZXg6IDAsIG5hbWU6ICdGU1Byb290Rm9sZGVyJyB9KSxcblx0XHRcdFx0XSkpLFxuXHRcdFx0bmV3IFRlc3RQYXRoU2VydmljZSh1bmRlZmluZWQsIHJvb3RGb2xkZXIuc2NoZW1lKSxcblx0XHRcdG5ldyBUZXN0UmVtb3RlQWdlbnRTZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IGdlbmVyYXRlZCA9IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChVUkkucGFyc2UoJ215c2NoZW1lOi8vbXlhdXRob3JpdHkvc29tZS9mb2xkZXIvdGVzdC50eHQnKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2VuZXJhdGVkLCAnc29tZVxcXFxmb2xkZXJcXFxcdGVzdC50eHQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdlbmVyYXRlZCwgJ3NvbWUvZm9sZGVyL3Rlc3QudHh0Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuXG5zdWl0ZSgnd29ya3NwYWNlIGF0IEZTUCByb290JywgKCkgPT4ge1xuXHRsZXQgbGFiZWxTZXJ2aWNlOiBMYWJlbFNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBVUkkucGFyc2UoJ215c2NoZW1lOi8vbXlhdXRob3JpdHkvJyk7XG5cblx0XHRsYWJlbFNlcnZpY2UgPSBuZXcgTGFiZWxTZXJ2aWNlKFxuXHRcdFx0VGVzdEVudmlyb25tZW50U2VydmljZSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoXG5cdFx0XHRcdG5ldyBXb3Jrc3BhY2UoJ3Rlc3Qtd29ya3NwYWNlJywgW1xuXHRcdFx0XHRcdG5ldyBXb3Jrc3BhY2VGb2xkZXIoeyB1cmk6IHJvb3RGb2xkZXIsIGluZGV4OiAwLCBuYW1lOiAnRlNQcm9vdEZvbGRlcicgfSksXG5cdFx0XHRcdF0pKSxcblx0XHRcdG5ldyBUZXN0UGF0aFNlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0UmVtb3RlQWdlbnRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKVxuXHRcdCk7XG5cdFx0bGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogJ215c2NoZW1lJyxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICcke3NjaGVtZX06Ly8ke2F1dGhvcml0eX0ke3BhdGh9Jyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLycsXG5cdFx0XHRcdHRpbGRpZnk6IGZhbHNlLFxuXHRcdFx0XHRub3JtYWxpemVEcml2ZUxldHRlcjogZmFsc2UsXG5cdFx0XHRcdHdvcmtzcGFjZVN1ZmZpeDogJycsXG5cdFx0XHRcdGF1dGhvcml0eVByZWZpeDogJycsXG5cdFx0XHRcdHN0cmlwUGF0aFN0YXJ0aW5nU2VwYXJhdG9yOiBmYWxzZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdub24tcmVsYXRpdmUgbGFiZWwnLCAoKSA9PiB7XG5cblx0XHRjb25zdCB0ZXN0cyA9IHtcblx0XHRcdCdteXNjaGVtZTovL215YXV0aG9yaXR5L215RmlsZTEudHh0JzogJ215c2NoZW1lOi8vbXlhdXRob3JpdHkvbXlGaWxlMS50eHQnLFxuXHRcdFx0J215c2NoZW1lOi8vbXlhdXRob3JpdHkvZm9sZGVyL215RmlsZTIudHh0JzogJ215c2NoZW1lOi8vbXlhdXRob3JpdHkvZm9sZGVyL215RmlsZTIudHh0Jyxcblx0XHR9O1xuXG5cdFx0T2JqZWN0LmVudHJpZXModGVzdHMpLmZvckVhY2goKFt1cmlTdHJpbmcsIGxhYmVsXSkgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhdGVkID0gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKFVSSS5wYXJzZSh1cmlTdHJpbmcpLCB7IHJlbGF0aXZlOiBmYWxzZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZW5lcmF0ZWQsIGxhYmVsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUgbGFiZWwnLCAoKSA9PiB7XG5cblx0XHRjb25zdCB0ZXN0cyA9IHtcblx0XHRcdCdteXNjaGVtZTovL215YXV0aG9yaXR5L215RmlsZTEudHh0JzogJ215RmlsZTEudHh0Jyxcblx0XHRcdCdteXNjaGVtZTovL215YXV0aG9yaXR5L2ZvbGRlci9teUZpbGUyLnR4dCc6ICdmb2xkZXIvbXlGaWxlMi50eHQnLFxuXHRcdH07XG5cblx0XHRPYmplY3QuZW50cmllcyh0ZXN0cykuZm9yRWFjaCgoW3VyaVN0cmluZywgbGFiZWxdKSA9PiB7XG5cdFx0XHRjb25zdCBnZW5lcmF0ZWQgPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoVVJJLnBhcnNlKHVyaVN0cmluZyksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2VuZXJhdGVkLCBsYWJlbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF0aXZlIGxhYmVsIHdpdGggZXhwbGljaXQgcGF0aCBzZXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0bGV0IGdlbmVyYXRlZCA9IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChVUkkucGFyc2UoJ215c2NoZW1lOi8vbXlhdXRob3JpdHkvc29tZS9mb2xkZXIvdGVzdC50eHQnKSwgeyByZWxhdGl2ZTogdHJ1ZSwgc2VwYXJhdG9yOiAnLycgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdlbmVyYXRlZCwgJ3NvbWUvZm9sZGVyL3Rlc3QudHh0Jyk7XG5cblx0XHRnZW5lcmF0ZWQgPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoVVJJLnBhcnNlKCdteXNjaGVtZTovL215YXV0aG9yaXR5L3NvbWUvZm9sZGVyL3Rlc3QudHh0JyksIHsgcmVsYXRpdmU6IHRydWUsIHNlcGFyYXRvcjogJ1xcXFwnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZW5lcmF0ZWQsICdzb21lXFxcXGZvbGRlclxcXFx0ZXN0LnR4dCcpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxlQUFlO0FBQzNCLE9BQU8sWUFBWTtBQUNuQixTQUFTLHdCQUF3QixzQkFBc0IsaUJBQWlCLDhCQUE4QjtBQUN0RyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0IsMEJBQTBCO0FBQ3ZELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZSxpQkFBaUI7QUFDekMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFjLHFCQUFxQjtBQUM1QyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sYUFBYSxNQUFNO0FBQ3hCLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gscUJBQWlCLElBQUksbUJBQW1CO0FBQ3hDLG1CQUFlLElBQUksYUFBYSx3QkFBd0IsSUFBSSxtQkFBbUIsR0FBRyxJQUFJLGdCQUFnQixJQUFJLEtBQUssU0FBUyxDQUFDLEdBQUcsSUFBSSx1QkFBdUIsR0FBRyxnQkFBZ0IsSUFBSSxxQkFBcUIsQ0FBQztBQUFBLEVBQ3JNLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsT0FBSyxpQkFBaUIsV0FBWTtBQUNqQyxpQkFBYSxrQkFBa0I7QUFBQSxNQUM5QixRQUFRO0FBQUEsTUFDUixZQUFZO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxXQUFXO0FBQUEsUUFDWCxTQUFTO0FBQUEsUUFDVCxzQkFBc0I7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sT0FBTyxJQUFJLE1BQU0sa0NBQWtDO0FBQ3pELFdBQU8sWUFBWSxhQUFhLFlBQVksTUFBTSxFQUFFLFVBQVUsTUFBTSxDQUFDLEdBQUcsb0NBQW9D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
