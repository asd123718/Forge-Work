import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { createTextModel } from "../../../../../../editor/test/common/testTextModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { resolveSymbolToolFileUri, findLineNumber, findSymbolColumn, errorResult, getChatPermissionLevelForToolInvocation, getSandboxPrecheckInputsForToolInvocation } from "../../../browser/tools/toolHelpers.js";
import { ChatPermissionLevel } from "../../../common/constants.js";
suite("Tool Helpers", () => {
  const disposables = new DisposableStore();
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockWorkspaceService(folderUri) {
    const uri = folderUri ?? URI.parse("file:///workspace");
    const folder = {
      uri,
      toResource: (relativePath) => URI.joinPath(uri, relativePath)
    };
    return {
      _serviceBrand: void 0,
      getWorkspace: () => ({ folders: [folder] }),
      getWorkspaceFolder: (u) => {
        if (u.toString().startsWith(uri.toString())) {
          return folder;
        }
        return null;
      }
    };
  }
  function createMockChatService(requests) {
    return {
      _serviceBrand: void 0,
      getSession: () => requests ? { getRequests: () => requests } : void 0
    };
  }
  function createMockChatWidgetService(permissionLevel) {
    return {
      _serviceBrand: void 0,
      getWidgetBySessionResource: () => permissionLevel === void 0 ? void 0 : { input: { currentModeInfo: { permissionLevel } } }
    };
  }
  suite("resolveSymbolToolFileUri", () => {
    test("resolves full URI string", () => {
      const ws = createMockWorkspaceService();
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", uri: "file:///test/file.ts" }, ws);
      assert.strictEqual(result?.toString(), "file:///test/file.ts");
    });
    test("resolves workspace-relative filePath", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///project"));
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "src/index.ts" }, ws);
      assert.strictEqual(result?.toString(), "file:///project/src/index.ts");
    });
    test("prefers uri over filePath", () => {
      const ws = createMockWorkspaceService();
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", uri: "file:///explicit.ts", filePath: "other.ts" }, ws);
      assert.strictEqual(result?.toString(), "file:///explicit.ts");
    });
    test("returns undefined when neither provided", () => {
      const ws = createMockWorkspaceService();
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x" }, ws);
      assert.strictEqual(result, void 0);
    });
    test("resolves filePath against workingDirectory when provided", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///other-workspace"));
      const workingDirectory = URI.parse("file:///session-dir");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "src/index.ts" }, ws, workingDirectory);
      assert.strictEqual(result?.toString(), "file:///session-dir/src/index.ts");
    });
    test("workingDirectory takes precedence over workspace folders", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///workspace"));
      const workingDirectory = URI.parse("file:///my-project");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "file.ts" }, ws, workingDirectory);
      assert.strictEqual(result?.toString(), "file:///my-project/file.ts");
    });
    test("uri field ignores workingDirectory", () => {
      const ws = createMockWorkspaceService();
      const workingDirectory = URI.parse("file:///session-dir");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", uri: "file:///absolute/path.ts" }, ws, workingDirectory);
      assert.strictEqual(result?.toString(), "file:///absolute/path.ts");
    });
    test("rejects filePath that escapes the workingDirectory via parent segments", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///workspace"));
      const workingDirectory = URI.parse("file:///my-project");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "../outside.ts" }, ws, workingDirectory);
      assert.strictEqual(result, void 0);
    });
    test("rejects filePath that escapes the workingDirectory via nested parent segments", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///workspace"));
      const workingDirectory = URI.parse("file:///my-project");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "src/../../outside.ts" }, ws, workingDirectory);
      assert.strictEqual(result, void 0);
    });
    test("allows filePath with interior parent segments that stays within the workingDirectory", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///workspace"));
      const workingDirectory = URI.parse("file:///my-project");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "src/../file.ts" }, ws, workingDirectory);
      assert.strictEqual(result?.toString(), "file:///my-project/file.ts");
    });
    test("rejects filePath that escapes the workspace folder via parent segments", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///project/sub"));
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "../../outside.ts" }, ws);
      assert.strictEqual(result, void 0);
    });
  });
  suite("getChatPermissionLevelForToolInvocation", () => {
    test("returns undefined when there is no chat session resource", () => {
      const result = getChatPermissionLevelForToolInvocation(void 0, void 0, createMockChatWidgetService(ChatPermissionLevel.Default), createMockChatService([]));
      assert.strictEqual(result, void 0);
    });
    test("prefers the request permission level for the provided request id", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      const result = getChatPermissionLevelForToolInvocation(
        sessionResource,
        "request-2",
        createMockChatWidgetService(ChatPermissionLevel.Default),
        createMockChatService([
          { id: "request-1", modeInfo: { permissionLevel: ChatPermissionLevel.Default } },
          { id: "request-2", modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } }
        ])
      );
      assert.strictEqual(result, ChatPermissionLevel.AutoApprove);
    });
    test("falls back to the live widget permission level when the request is not found", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      const result = getChatPermissionLevelForToolInvocation(
        sessionResource,
        "missing-request",
        createMockChatWidgetService(ChatPermissionLevel.Autopilot),
        createMockChatService([{ id: "request-1", modeInfo: { permissionLevel: ChatPermissionLevel.Default } }])
      );
      assert.strictEqual(result, ChatPermissionLevel.Autopilot);
    });
    test("falls back to the latest request permission level when there is no widget", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      const result = getChatPermissionLevelForToolInvocation(
        sessionResource,
        void 0,
        createMockChatWidgetService(void 0),
        createMockChatService([
          { id: "request-1", modeInfo: { permissionLevel: ChatPermissionLevel.Default } },
          { id: "request-2", modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } }
        ])
      );
      assert.strictEqual(result, ChatPermissionLevel.AutoApprove);
    });
  });
  suite("getSandboxPrecheckInputsForToolInvocation", () => {
    test("returns undefined when there is no chat permission level", () => {
      const result = getSandboxPrecheckInputsForToolInvocation(void 0, void 0, createMockChatWidgetService(ChatPermissionLevel.AutoApprove), createMockChatService([]));
      assert.strictEqual(result, void 0);
    });
    test("returns undefined for the default chat permission level", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      const result = getSandboxPrecheckInputsForToolInvocation(sessionResource, void 0, createMockChatWidgetService(ChatPermissionLevel.Default), createMockChatService([]));
      assert.deepStrictEqual(result, { isDefaultApprovalPermissionEnabled: true });
    });
    test("disables default approval permission for auto-approve chat permission levels", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      assert.deepStrictEqual(
        getSandboxPrecheckInputsForToolInvocation(sessionResource, void 0, createMockChatWidgetService(ChatPermissionLevel.AutoApprove), createMockChatService([])),
        { isDefaultApprovalPermissionEnabled: false }
      );
      assert.deepStrictEqual(
        getSandboxPrecheckInputsForToolInvocation(sessionResource, void 0, createMockChatWidgetService(ChatPermissionLevel.Autopilot), createMockChatService([])),
        { isDefaultApprovalPermissionEnabled: false }
      );
    });
  });
  suite("findLineNumber", () => {
    test("finds exact match", () => {
      const model = disposables.add(createTextModel("line one\nline two\nline three"));
      assert.strictEqual(findLineNumber(model, "line two"), 2);
    });
    test("handles whitespace normalization", () => {
      const model = disposables.add(createTextModel("function   doSomething(x:  number) {}"));
      assert.strictEqual(findLineNumber(model, "function doSomething(x: number)"), 1);
    });
    test("returns undefined when not found", () => {
      const model = disposables.add(createTextModel("hello world"));
      assert.strictEqual(findLineNumber(model, "not here"), void 0);
    });
    test("handles regex special characters in content", () => {
      const model = disposables.add(createTextModel("const arr = [1, 2, 3];"));
      assert.strictEqual(findLineNumber(model, "[1, 2, 3]"), 1);
    });
    test("finds partial line match", () => {
      const model = disposables.add(createTextModel('import { MyClass } from "./myModule";'));
      assert.strictEqual(findLineNumber(model, "MyClass"), 1);
    });
    test("trims leading and trailing whitespace from input", () => {
      const model = disposables.add(createTextModel("const x = 42;"));
      assert.strictEqual(findLineNumber(model, "  const x = 42;  "), 1);
    });
  });
  suite("findSymbolColumn", () => {
    test("finds symbol with word boundaries", () => {
      assert.strictEqual(findSymbolColumn("const myVar = 42;", "myVar"), 7);
    });
    test("returns 1-based column", () => {
      assert.strictEqual(findSymbolColumn("x = 1", "x"), 1);
    });
    test("does not match partial words", () => {
      assert.strictEqual(findSymbolColumn("const myVariable = 42;", "myVar"), void 0);
    });
    test("returns undefined when not found", () => {
      assert.strictEqual(findSymbolColumn("hello world", "missing"), void 0);
    });
    test("handles regex special characters in symbol name", () => {
      assert.strictEqual(findSymbolColumn("arr[0] = 1", "arr"), 1);
    });
    test("finds first occurrence", () => {
      assert.strictEqual(findSymbolColumn("foo + foo", "foo"), 1);
    });
  });
  suite("errorResult", () => {
    test("creates result with text content", () => {
      const result = errorResult("something went wrong");
      const textPart = result.content.find((p) => p.kind === "text");
      assert.ok(textPart);
      assert.strictEqual(textPart.value, "something went wrong");
    });
    test("sets toolResultMessage", () => {
      const result = errorResult("error message");
      assert.ok(result.toolResultMessage);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHRvb2xzXFx0b29sSGVscGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSwgZmluZExpbmVOdW1iZXIsIGZpbmRTeW1ib2xDb2x1bW4sIGVycm9yUmVzdWx0LCBnZXRDaGF0UGVybWlzc2lvbkxldmVsRm9yVG9vbEludm9jYXRpb24sIGdldFNhbmRib3hQcmVjaGVja0lucHV0c0ZvclRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci90b29scy90b29sSGVscGVycy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5cbnN1aXRlKCdUb29sIEhlbHBlcnMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKGZvbGRlclVyaT86IFVSSSk6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB7XG5cdFx0Y29uc3QgdXJpID0gZm9sZGVyVXJpID8/IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UnKTtcblx0XHRjb25zdCBmb2xkZXIgPSB7XG5cdFx0XHR1cmksXG5cdFx0XHR0b1Jlc291cmNlOiAocmVsYXRpdmVQYXRoOiBzdHJpbmcpID0+IFVSSS5qb2luUGF0aCh1cmksIHJlbGF0aXZlUGF0aCksXG5cdFx0fSBhcyB1bmtub3duIGFzIElXb3Jrc3BhY2VGb2xkZXI7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGdldFdvcmtzcGFjZTogKCkgPT4gKHsgZm9sZGVyczogW2ZvbGRlcl0gfSksXG5cdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXI6ICh1OiBVUkkpID0+IHtcblx0XHRcdFx0aWYgKHUudG9TdHJpbmcoKS5zdGFydHNXaXRoKHVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdHJldHVybiBmb2xkZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrQ2hhdFNlcnZpY2UocmVxdWVzdHM6IHJlYWRvbmx5IHsgaWQ6IHN0cmluZzsgbW9kZUluZm8/OiB7IHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWwgfSB9W10gfCB1bmRlZmluZWQpOiBJQ2hhdFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiByZXF1ZXN0cyA/IHsgZ2V0UmVxdWVzdHM6ICgpID0+IHJlcXVlc3RzIH0gOiB1bmRlZmluZWQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0U2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tDaGF0V2lkZ2V0U2VydmljZShwZXJtaXNzaW9uTGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwgfCB1bmRlZmluZWQpOiBJQ2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZTogKCkgPT4gcGVybWlzc2lvbkxldmVsID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB7IGlucHV0OiB7IGN1cnJlbnRNb2RlSW5mbzogeyBwZXJtaXNzaW9uTGV2ZWwgfSB9IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZTtcblx0fVxuXG5cdHN1aXRlKCdyZXNvbHZlU3ltYm9sVG9vbEZpbGVVcmknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyBmdWxsIFVSSSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlU3ltYm9sVG9vbEZpbGVVcmkoeyBzeW1ib2w6ICd4JywgbGluZUNvbnRlbnQ6ICd4JywgdXJpOiAnZmlsZTovLy90ZXN0L2ZpbGUudHMnIH0sIHdzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksICdmaWxlOi8vL3Rlc3QvZmlsZS50cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgd29ya3NwYWNlLXJlbGF0aXZlIGZpbGVQYXRoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZShVUkkucGFyc2UoJ2ZpbGU6Ly8vcHJvamVjdCcpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCBmaWxlUGF0aDogJ3NyYy9pbmRleC50cycgfSwgd3MpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vcHJvamVjdC9zcmMvaW5kZXgudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZWZlcnMgdXJpIG92ZXIgZmlsZVBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlU3ltYm9sVG9vbEZpbGVVcmkoeyBzeW1ib2w6ICd4JywgbGluZUNvbnRlbnQ6ICd4JywgdXJpOiAnZmlsZTovLy9leHBsaWNpdC50cycsIGZpbGVQYXRoOiAnb3RoZXIudHMnIH0sIHdzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksICdmaWxlOi8vL2V4cGxpY2l0LnRzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5laXRoZXIgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlU3ltYm9sVG9vbEZpbGVVcmkoeyBzeW1ib2w6ICd4JywgbGluZUNvbnRlbnQ6ICd4JyB9LCB3cyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgZmlsZVBhdGggYWdhaW5zdCB3b3JraW5nRGlyZWN0b3J5IHdoZW4gcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKFVSSS5wYXJzZSgnZmlsZTovLy9vdGhlci13b3Jrc3BhY2UnKSk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Nlc3Npb24tZGlyJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlU3ltYm9sVG9vbEZpbGVVcmkoeyBzeW1ib2w6ICd4JywgbGluZUNvbnRlbnQ6ICd4JywgZmlsZVBhdGg6ICdzcmMvaW5kZXgudHMnIH0sIHdzLCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksICdmaWxlOi8vL3Nlc3Npb24tZGlyL3NyYy9pbmRleC50cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd29ya2luZ0RpcmVjdG9yeSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgd29ya3NwYWNlIGZvbGRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UnKSk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLnBhcnNlKCdmaWxlOi8vL215LXByb2plY3QnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCBmaWxlUGF0aDogJ2ZpbGUudHMnIH0sIHdzLCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksICdmaWxlOi8vL215LXByb2plY3QvZmlsZS50cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXJpIGZpZWxkIGlnbm9yZXMgd29ya2luZ0RpcmVjdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vc2Vzc2lvbi1kaXInKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCB1cmk6ICdmaWxlOi8vL2Fic29sdXRlL3BhdGgudHMnIH0sIHdzLCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksICdmaWxlOi8vL2Fic29sdXRlL3BhdGgudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgZmlsZVBhdGggdGhhdCBlc2NhcGVzIHRoZSB3b3JraW5nRGlyZWN0b3J5IHZpYSBwYXJlbnQgc2VnbWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UnKSk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLnBhcnNlKCdmaWxlOi8vL215LXByb2plY3QnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCBmaWxlUGF0aDogJy4uL291dHNpZGUudHMnIH0sIHdzLCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGZpbGVQYXRoIHRoYXQgZXNjYXBlcyB0aGUgd29ya2luZ0RpcmVjdG9yeSB2aWEgbmVzdGVkIHBhcmVudCBzZWdtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpKTtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbXktcHJvamVjdCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpKHsgc3ltYm9sOiAneCcsIGxpbmVDb250ZW50OiAneCcsIGZpbGVQYXRoOiAnc3JjLy4uLy4uL291dHNpZGUudHMnIH0sIHdzLCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGxvd3MgZmlsZVBhdGggd2l0aCBpbnRlcmlvciBwYXJlbnQgc2VnbWVudHMgdGhhdCBzdGF5cyB3aXRoaW4gdGhlIHdvcmtpbmdEaXJlY3RvcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UnKSk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLnBhcnNlKCdmaWxlOi8vL215LXByb2plY3QnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCBmaWxlUGF0aDogJ3NyYy8uLi9maWxlLnRzJyB9LCB3cywgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py50b1N0cmluZygpLCAnZmlsZTovLy9teS1wcm9qZWN0L2ZpbGUudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgZmlsZVBhdGggdGhhdCBlc2NhcGVzIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIHZpYSBwYXJlbnQgc2VnbWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKFVSSS5wYXJzZSgnZmlsZTovLy9wcm9qZWN0L3N1YicpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCBmaWxlUGF0aDogJy4uLy4uL291dHNpZGUudHMnIH0sIHdzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRDaGF0UGVybWlzc2lvbkxldmVsRm9yVG9vbEludm9jYXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRoZXJlIGlzIG5vIGNoYXQgc2Vzc2lvbiByZXNvdXJjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGb3JUb29sSW52b2NhdGlvbih1bmRlZmluZWQsIHVuZGVmaW5lZCwgY3JlYXRlTW9ja0NoYXRXaWRnZXRTZXJ2aWNlKENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCksIGNyZWF0ZU1vY2tDaGF0U2VydmljZShbXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZWZlcnMgdGhlIHJlcXVlc3QgcGVybWlzc2lvbiBsZXZlbCBmb3IgdGhlIHByb3ZpZGVkIHJlcXVlc3QgaWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vc2Vzc2lvbi90ZXN0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRDaGF0UGVybWlzc2lvbkxldmVsRm9yVG9vbEludm9jYXRpb24oXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0J3JlcXVlc3QtMicsXG5cdFx0XHRcdGNyZWF0ZU1vY2tDaGF0V2lkZ2V0U2VydmljZShDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpLFxuXHRcdFx0XHRjcmVhdGVNb2NrQ2hhdFNlcnZpY2UoW1xuXHRcdFx0XHRcdHsgaWQ6ICdyZXF1ZXN0LTEnLCBtb2RlSW5mbzogeyBwZXJtaXNzaW9uTGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCB9IH0sXG5cdFx0XHRcdFx0eyBpZDogJ3JlcXVlc3QtMicsIG1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSB9IH0sXG5cdFx0XHRcdF0pLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBsaXZlIHdpZGdldCBwZXJtaXNzaW9uIGxldmVsIHdoZW4gdGhlIHJlcXVlc3QgaXMgbm90IGZvdW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdDovL3Nlc3Npb24vdGVzdCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0Q2hhdFBlcm1pc3Npb25MZXZlbEZvclRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdCdtaXNzaW5nLXJlcXVlc3QnLFxuXHRcdFx0XHRjcmVhdGVNb2NrQ2hhdFdpZGdldFNlcnZpY2UoQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QpLFxuXHRcdFx0XHRjcmVhdGVNb2NrQ2hhdFNlcnZpY2UoW3sgaWQ6ICdyZXF1ZXN0LTEnLCBtb2RlSW5mbzogeyBwZXJtaXNzaW9uTGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCB9IH1dKSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIGxhdGVzdCByZXF1ZXN0IHBlcm1pc3Npb24gbGV2ZWwgd2hlbiB0aGVyZSBpcyBubyB3aWRnZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vc2Vzc2lvbi90ZXN0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRDaGF0UGVybWlzc2lvbkxldmVsRm9yVG9vbEludm9jYXRpb24oXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRjcmVhdGVNb2NrQ2hhdFdpZGdldFNlcnZpY2UodW5kZWZpbmVkKSxcblx0XHRcdFx0Y3JlYXRlTW9ja0NoYXRTZXJ2aWNlKFtcblx0XHRcdFx0XHR7IGlkOiAncmVxdWVzdC0xJywgbW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQgfSB9LFxuXHRcdFx0XHRcdHsgaWQ6ICdyZXF1ZXN0LTInLCBtb2RlSW5mbzogeyBwZXJtaXNzaW9uTGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUgfSB9LFxuXHRcdFx0XHRdKSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0U2FuZGJveFByZWNoZWNrSW5wdXRzRm9yVG9vbEludm9jYXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRoZXJlIGlzIG5vIGNoYXQgcGVybWlzc2lvbiBsZXZlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNhbmRib3hQcmVjaGVja0lucHV0c0ZvclRvb2xJbnZvY2F0aW9uKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjcmVhdGVNb2NrQ2hhdFdpZGdldFNlcnZpY2UoQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSksIGNyZWF0ZU1vY2tDaGF0U2VydmljZShbXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB0aGUgZGVmYXVsdCBjaGF0IHBlcm1pc3Npb24gbGV2ZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vc2Vzc2lvbi90ZXN0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRTYW5kYm94UHJlY2hlY2tJbnB1dHNGb3JUb29sSW52b2NhdGlvbihzZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCwgY3JlYXRlTW9ja0NoYXRXaWRnZXRTZXJ2aWNlKENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCksIGNyZWF0ZU1vY2tDaGF0U2VydmljZShbXSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgaXNEZWZhdWx0QXBwcm92YWxQZXJtaXNzaW9uRW5hYmxlZDogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc2FibGVzIGRlZmF1bHQgYXBwcm92YWwgcGVybWlzc2lvbiBmb3IgYXV0by1hcHByb3ZlIGNoYXQgcGVybWlzc2lvbiBsZXZlbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vc2Vzc2lvbi90ZXN0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFNhbmRib3hQcmVjaGVja0lucHV0c0ZvclRvb2xJbnZvY2F0aW9uKHNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkLCBjcmVhdGVNb2NrQ2hhdFdpZGdldFNlcnZpY2UoQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSksIGNyZWF0ZU1vY2tDaGF0U2VydmljZShbXSkpLFxuXHRcdFx0XHR7IGlzRGVmYXVsdEFwcHJvdmFsUGVybWlzc2lvbkVuYWJsZWQ6IGZhbHNlIH1cblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRTYW5kYm94UHJlY2hlY2tJbnB1dHNGb3JUb29sSW52b2NhdGlvbihzZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCwgY3JlYXRlTW9ja0NoYXRXaWRnZXRTZXJ2aWNlKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90KSwgY3JlYXRlTW9ja0NoYXRTZXJ2aWNlKFtdKSksXG5cdFx0XHRcdHsgaXNEZWZhdWx0QXBwcm92YWxQZXJtaXNzaW9uRW5hYmxlZDogZmFsc2UgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRMaW5lTnVtYmVyJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZmluZHMgZXhhY3QgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d29cXG5saW5lIHRocmVlJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRMaW5lTnVtYmVyKG1vZGVsLCAnbGluZSB0d28nKSwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHdoaXRlc3BhY2Ugbm9ybWFsaXphdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnZnVuY3Rpb24gICBkb1NvbWV0aGluZyh4OiAgbnVtYmVyKSB7fScpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTGluZU51bWJlcihtb2RlbCwgJ2Z1bmN0aW9uIGRvU29tZXRoaW5nKHg6IG51bWJlciknKSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vdCBmb3VuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZExpbmVOdW1iZXIobW9kZWwsICdub3QgaGVyZScpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyByZWdleCBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnY29uc3QgYXJyID0gWzEsIDIsIDNdOycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTGluZU51bWJlcihtb2RlbCwgJ1sxLCAyLCAzXScpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIHBhcnRpYWwgbGluZSBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnaW1wb3J0IHsgTXlDbGFzcyB9IGZyb20gXCIuL215TW9kdWxlXCI7JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRMaW5lTnVtYmVyKG1vZGVsLCAnTXlDbGFzcycpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyaW1zIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2UgZnJvbSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnY29uc3QgeCA9IDQyOycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTGluZU51bWJlcihtb2RlbCwgJyAgY29uc3QgeCA9IDQyOyAgJyksIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZFN5bWJvbENvbHVtbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2ZpbmRzIHN5bWJvbCB3aXRoIHdvcmQgYm91bmRhcmllcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3ltYm9sQ29sdW1uKCdjb25zdCBteVZhciA9IDQyOycsICdteVZhcicpLCA3KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgMS1iYXNlZCBjb2x1bW4nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN5bWJvbENvbHVtbigneCA9IDEnLCAneCcpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG1hdGNoIHBhcnRpYWwgd29yZHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN5bWJvbENvbHVtbignY29uc3QgbXlWYXJpYWJsZSA9IDQyOycsICdteVZhcicpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBub3QgZm91bmQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN5bWJvbENvbHVtbignaGVsbG8gd29ybGQnLCAnbWlzc2luZycpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyByZWdleCBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gc3ltYm9sIG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN5bWJvbENvbHVtbignYXJyWzBdID0gMScsICdhcnInKSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBmaXJzdCBvY2N1cnJlbmNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTeW1ib2xDb2x1bW4oJ2ZvbyArIGZvbycsICdmb28nKSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlcnJvclJlc3VsdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NyZWF0ZXMgcmVzdWx0IHdpdGggdGV4dCBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXJyb3JSZXN1bHQoJ3NvbWV0aGluZyB3ZW50IHdyb25nJyk7XG5cdFx0XHRjb25zdCB0ZXh0UGFydCA9IHJlc3VsdC5jb250ZW50LmZpbmQocCA9PiBwLmtpbmQgPT09ICd0ZXh0Jyk7XG5cdFx0XHRhc3NlcnQub2sodGV4dFBhcnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0ZXh0UGFydCBhcyB7IGtpbmQ6ICd0ZXh0JzsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZSwgJ3NvbWV0aGluZyB3ZW50IHdyb25nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRzIHRvb2xSZXN1bHRNZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXJyb3JSZXN1bHQoJ2Vycm9yIG1lc3NhZ2UnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUVwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQixnQkFBZ0Isa0JBQWtCLGFBQWEseUNBQXlDLGlEQUFpRDtBQUU1SyxTQUFTLDJCQUEyQjtBQUdwQyxNQUFNLGdCQUFnQixNQUFNO0FBRTNCLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxXQUFTLE1BQU07QUFDZCxnQkFBWSxNQUFNO0FBQUEsRUFDbkIsQ0FBQztBQUVELDBDQUF3QztBQUV4QyxXQUFTLDJCQUEyQixXQUEyQztBQUM5RSxVQUFNLE1BQU0sYUFBYSxJQUFJLE1BQU0sbUJBQW1CO0FBQ3RELFVBQU0sU0FBUztBQUFBLE1BQ2Q7QUFBQSxNQUNBLFlBQVksQ0FBQyxpQkFBeUIsSUFBSSxTQUFTLEtBQUssWUFBWTtBQUFBLElBQ3JFO0FBQ0EsV0FBTztBQUFBLE1BQ04sZUFBZTtBQUFBLE1BQ2YsY0FBYyxPQUFPLEVBQUUsU0FBUyxDQUFDLE1BQU0sRUFBRTtBQUFBLE1BQ3pDLG9CQUFvQixDQUFDLE1BQVc7QUFDL0IsWUFBSSxFQUFFLFNBQVMsRUFBRSxXQUFXLElBQUksU0FBUyxDQUFDLEdBQUc7QUFDNUMsaUJBQU87QUFBQSxRQUNSO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFdBQVMsc0JBQXNCLFVBQXFIO0FBQ25KLFdBQU87QUFBQSxNQUNOLGVBQWU7QUFBQSxNQUNmLFlBQVksTUFBTSxXQUFXLEVBQUUsYUFBYSxNQUFNLFNBQVMsSUFB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
