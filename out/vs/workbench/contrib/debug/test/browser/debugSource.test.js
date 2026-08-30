import assert from "assert";
import { isWindows } from "../../../../../base/common/platform.js";
import { URI as uri } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { Source } from "../../common/debugSource.js";
import { mockUriIdentityService } from "./mockDebugModel.js";
suite("Debug - Source", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("from raw source", () => {
    const source = new Source({
      name: "zz",
      path: "/xx/yy/zz",
      sourceReference: 0,
      presentationHint: "emphasize"
    }, "aDebugSessionId", mockUriIdentityService, new NullLogService());
    assert.strictEqual(source.presentationHint, "emphasize");
    assert.strictEqual(source.name, "zz");
    assert.strictEqual(source.inMemory, false);
    assert.strictEqual(source.reference, 0);
    assert.strictEqual(source.uri.toString(), uri.file("/xx/yy/zz").toString());
  });
  test("from raw internal source", () => {
    const source = new Source({
      name: "internalModule.js",
      sourceReference: 11,
      presentationHint: "deemphasize"
    }, "aDebugSessionId", mockUriIdentityService, new NullLogService());
    assert.strictEqual(source.presentationHint, "deemphasize");
    assert.strictEqual(source.name, "internalModule.js");
    assert.strictEqual(source.inMemory, true);
    assert.strictEqual(source.reference, 11);
    assert.strictEqual(source.uri.toString(), "debug:internalModule.js?session%3DaDebugSessionId%26ref%3D11");
  });
  test("get encoded debug data", () => {
    const checkData = (uri2, expectedName, expectedPath, expectedSourceReference, expectedSessionId) => {
      const { name, path, sourceReference, sessionId } = Source.getEncodedDebugData(uri2);
      assert.strictEqual(name, expectedName);
      assert.strictEqual(path, expectedPath);
      assert.strictEqual(sourceReference, expectedSourceReference);
      assert.strictEqual(sessionId, expectedSessionId);
    };
    checkData(uri.file("a/b/c/d"), "d", isWindows ? "\\a\\b\\c\\d" : "/a/b/c/d", void 0, void 0);
    checkData(uri.from({ scheme: "file", path: "/my/path/test.js", query: "ref=1&session=2" }), "test.js", isWindows ? "\\my\\path\\test.js" : "/my/path/test.js", void 0, void 0);
    checkData(uri.from({ scheme: "http", authority: "www.example.com", path: "/my/path" }), "path", "http://www.example.com/my/path", void 0, void 0);
    checkData(uri.from({ scheme: "debug", authority: "www.example.com", path: "/my/path", query: "ref=100" }), "path", "/my/path", 100, void 0);
    checkData(uri.from({ scheme: "debug", path: "a/b/c/d.js", query: "session=100" }), "d.js", "a/b/c/d.js", void 0, "100");
    checkData(uri.from({ scheme: "debug", path: "a/b/c/d/foo.txt", query: "session=100&ref=10" }), "foo.txt", "a/b/c/d/foo.txt", 10, "100");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxicm93c2VyXFxkZWJ1Z1NvdXJjZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlYnVnU291cmNlLmpzJztcbmltcG9ydCB7IG1vY2tVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuL21vY2tEZWJ1Z01vZGVsLmpzJztcblxuc3VpdGUoJ0RlYnVnIC0gU291cmNlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Zyb20gcmF3IHNvdXJjZScsICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXcgU291cmNlKHtcblx0XHRcdG5hbWU6ICd6eicsXG5cdFx0XHRwYXRoOiAnL3h4L3l5L3p6Jyxcblx0XHRcdHNvdXJjZVJlZmVyZW5jZTogMCxcblx0XHRcdHByZXNlbnRhdGlvbkhpbnQ6ICdlbXBoYXNpemUnXG5cdFx0fSwgJ2FEZWJ1Z1Nlc3Npb25JZCcsIG1vY2tVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2UucHJlc2VudGF0aW9uSGludCwgJ2VtcGhhc2l6ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2UubmFtZSwgJ3p6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5pbk1lbW9yeSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2UucmVmZXJlbmNlLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlLnVyaS50b1N0cmluZygpLCB1cmkuZmlsZSgnL3h4L3l5L3p6JykudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zyb20gcmF3IGludGVybmFsIHNvdXJjZScsICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXcgU291cmNlKHtcblx0XHRcdG5hbWU6ICdpbnRlcm5hbE1vZHVsZS5qcycsXG5cdFx0XHRzb3VyY2VSZWZlcmVuY2U6IDExLFxuXHRcdFx0cHJlc2VudGF0aW9uSGludDogJ2RlZW1waGFzaXplJ1xuXHRcdH0sICdhRGVidWdTZXNzaW9uSWQnLCBtb2NrVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlLnByZXNlbnRhdGlvbkhpbnQsICdkZWVtcGhhc2l6ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2UubmFtZSwgJ2ludGVybmFsTW9kdWxlLmpzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5pbk1lbW9yeSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5yZWZlcmVuY2UsIDExKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlLnVyaS50b1N0cmluZygpLCAnZGVidWc6aW50ZXJuYWxNb2R1bGUuanM/c2Vzc2lvbiUzRGFEZWJ1Z1Nlc3Npb25JZCUyNnJlZiUzRDExJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldCBlbmNvZGVkIGRlYnVnIGRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hlY2tEYXRhID0gKHVyaTogdXJpLCBleHBlY3RlZE5hbWU6IHN0cmluZywgZXhwZWN0ZWRQYXRoOiBzdHJpbmcsIGV4cGVjdGVkU291cmNlUmVmZXJlbmNlOiBudW1iZXIgfCB1bmRlZmluZWQsIGV4cGVjdGVkU2Vzc2lvbklkPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCB7IG5hbWUsIHBhdGgsIHNvdXJjZVJlZmVyZW5jZSwgc2Vzc2lvbklkIH0gPSBTb3VyY2UuZ2V0RW5jb2RlZERlYnVnRGF0YSh1cmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hbWUsIGV4cGVjdGVkTmFtZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aCwgZXhwZWN0ZWRQYXRoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2VSZWZlcmVuY2UsIGV4cGVjdGVkU291cmNlUmVmZXJlbmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uSWQsIGV4cGVjdGVkU2Vzc2lvbklkKTtcblx0XHR9O1xuXG5cdFx0Y2hlY2tEYXRhKHVyaS5maWxlKCdhL2IvYy9kJyksICdkJywgaXNXaW5kb3dzID8gJ1xcXFxhXFxcXGJcXFxcY1xcXFxkJyA6ICcvYS9iL2MvZCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRjaGVja0RhdGEodXJpLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogJy9teS9wYXRoL3Rlc3QuanMnLCBxdWVyeTogJ3JlZj0xJnNlc3Npb249MicgfSksICd0ZXN0LmpzJywgaXNXaW5kb3dzID8gJ1xcXFxteVxcXFxwYXRoXFxcXHRlc3QuanMnIDogJy9teS9wYXRoL3Rlc3QuanMnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRjaGVja0RhdGEodXJpLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnd3d3LmV4YW1wbGUuY29tJywgcGF0aDogJy9teS9wYXRoJyB9KSwgJ3BhdGgnLCAnaHR0cDovL3d3dy5leGFtcGxlLmNvbS9teS9wYXRoJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGNoZWNrRGF0YSh1cmkuZnJvbSh7IHNjaGVtZTogJ2RlYnVnJywgYXV0aG9yaXR5OiAnd3d3LmV4YW1wbGUuY29tJywgcGF0aDogJy9teS9wYXRoJywgcXVlcnk6ICdyZWY9MTAwJyB9KSwgJ3BhdGgnLCAnL215L3BhdGgnLCAxMDAsIHVuZGVmaW5lZCk7XG5cdFx0Y2hlY2tEYXRhKHVyaS5mcm9tKHsgc2NoZW1lOiAnZGVidWcnLCBwYXRoOiAnYS9iL2MvZC5qcycsIHF1ZXJ5OiAnc2Vzc2lvbj0xMDAnIH0pLCAnZC5qcycsICdhL2IvYy9kLmpzJywgdW5kZWZpbmVkLCAnMTAwJyk7XG5cdFx0Y2hlY2tEYXRhKHVyaS5mcm9tKHsgc2NoZW1lOiAnZGVidWcnLCBwYXRoOiAnYS9iL2MvZC9mb28udHh0JywgcXVlcnk6ICdzZXNzaW9uPTEwMCZyZWY9MTAnIH0pLCAnZm9vLnR4dCcsICdhL2IvYy9kL2Zvby50eHQn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
