import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { LanguageFeaturesService } from "../../../../../../editor/common/services/languageFeaturesService.js";
import { createTextModel } from "../../../../../../editor/test/common/testTextModel.js";
import { RenameTool } from "../../../browser/tools/renameTool.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
function getTextContent(result) {
  const part = result.content.find((p) => p.kind === "text");
  return part?.value ?? "";
}
suite("RenameTool", () => {
  const disposables = new DisposableStore();
  let langFeatures;
  const testUri = URI.parse("file:///test/file.ts");
  const testContent = [
    'import { MyClass } from "./myClass";',
    "",
    "function doSomething() {",
    "	const instance = new MyClass();",
    "	instance.run();",
    "}"
  ].join("\n");
  function makeEdit(resource, range, text) {
    return { resource, versionId: void 0, textEdit: { range, text } };
  }
  function createMockTextModelService(model) {
    return {
      _serviceBrand: void 0,
      createModelReference: async () => ({
        object: { textEditorModel: model },
        dispose: () => {
        }
      }),
      registerTextModelContentProvider: () => ({ dispose: () => {
      } }),
      canHandleResource: () => false
    };
  }
  function createMockWorkspaceService() {
    const folderUri = URI.parse("file:///test");
    const folder = {
      uri: folderUri,
      toResource: (relativePath) => URI.parse(`file:///test/${relativePath}`)
    };
    return {
      _serviceBrand: void 0,
      getWorkspace: () => ({ folders: [folder] }),
      getWorkspaceFolder: (uri) => {
        if (uri.toString().startsWith(folderUri.toString())) {
          return folder;
        }
        return null;
      }
    };
  }
  function createMockChatService() {
    return {
      _serviceBrand: void 0,
      getSession: () => void 0
    };
  }
  function createMockBulkEditService() {
    const appliedEdits = [];
    return {
      _serviceBrand: void 0,
      apply: async (edit) => {
        appliedEdits.push(edit);
        return { ariaSummary: "", isApplied: true };
      },
      appliedEdits
    };
  }
  function createInvocation(parameters) {
    return { parameters };
  }
  const noopCountTokens = async () => 0;
  const noopProgress = { report() {
  } };
  function createTool(textModelService, options) {
    return new RenameTool(
      langFeatures,
      textModelService,
      createMockWorkspaceService(),
      createMockChatService(),
      options?.bulkEditService ?? createMockBulkEditService()
    );
  }
  setup(() => {
    langFeatures = new LanguageFeaturesService();
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getToolData", () => {
    test("returns tool data when no providers are registered", () => {
      const tool = disposables.add(createTool(createMockTextModelService(null)));
      assert.ok(tool.getToolData());
    });
    test("description does not include a per-language list", () => {
      const model = disposables.add(createTextModel("", "typescript", void 0, testUri));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      const data = tool.getToolData();
      assert.ok(
        !data.modelDescription.includes("Currently supported for"),
        `expected modelDescription to not list languages, got: ${data.modelDescription}`
      );
      assert.ok(
        !data.modelDescription.includes("typescript"),
        "expected modelDescription to not include any specific language id"
      );
      assert.ok(
        !data.modelDescription.includes("all languages"),
        'expected modelDescription to not mention "all languages"'
      );
    });
    test("description is identical regardless of which providers are registered", () => {
      const tool1 = disposables.add(createTool(createMockTextModelService(null)));
      const data1 = tool1.getToolData();
      const model = disposables.add(createTextModel("", "typescript", void 0, testUri));
      const tool2 = disposables.add(createTool(createMockTextModelService(model)));
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      disposables.add(langFeatures.renameProvider.register("python", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      const data2 = tool2.getToolData();
      assert.strictEqual(
        data1.modelDescription,
        data2.modelDescription,
        "expected modelDescription to be byte-stable across provider registrations"
      );
    });
  });
  suite("invoke", () => {
    test("returns error when no uri or filePath provided", async () => {
      const tool = disposables.add(createTool(createMockTextModelService(null)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", lineContent: "MyClass" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Provide either"));
    });
    test("returns error when no rename provider available", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("No rename provider"));
    });
    test("returns error when line content not found", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "nonexistent line" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Could not find line content"));
    });
    test("returns error when symbol not found in line", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "NotHere", newName: "Something", uri: testUri.toString(), lineContent: "function doSomething" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Could not find symbol"));
    });
    test("returns error when rename is rejected", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const provider = {
        provideRenameEdits: () => ({
          edits: [],
          rejectReason: "Cannot rename this symbol"
        })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Rename rejected"));
      assert.ok(getTextContent(result).includes("Cannot rename this symbol"));
    });
    test("returns error when rename produces no edits", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const provider = {
        provideRenameEdits: () => ({
          edits: []
        })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("no edits"));
    });
    test("successful rename applies edits via bulk edit and reports result", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const otherUri = URI.parse("file:///test/other.ts");
      const edits = [
        makeEdit(testUri, new Range(1, 10, 1, 17), "MyNewClass"),
        makeEdit(testUri, new Range(4, 23, 4, 30), "MyNewClass"),
        makeEdit(otherUri, new Range(5, 14, 5, 21), "MyNewClass")
      ];
      const provider = {
        provideRenameEdits: () => ({ edits })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const bulkEditService = createMockBulkEditService();
      const tool = disposables.add(createTool(createMockTextModelService(model), { bulkEditService }));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes("Renamed"));
      assert.ok(text.includes("MyClass"));
      assert.ok(text.includes("MyNewClass"));
      assert.ok(text.includes("3 edits"));
      assert.ok(text.includes("2 files"));
      assert.strictEqual(bulkEditService.appliedEdits.length, 1);
      assert.strictEqual(bulkEditService.appliedEdits[0].edits.length, 3);
    });
    test("successful rename with single edit reports singular message", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const edits = [
        makeEdit(testUri, new Range(1, 10, 1, 17), "MyNewClass")
      ];
      const provider = {
        provideRenameEdits: () => ({ edits })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes("1 edit"));
      assert.ok(text.includes("1 file"));
    });
    test("resolves filePath via workspace folders", async () => {
      const fileUri = URI.parse("file:///test/src/file.ts");
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, fileUri));
      const edits = [
        makeEdit(fileUri, new Range(1, 10, 1, 17), "MyNewClass")
      ];
      const provider = {
        provideRenameEdits: () => ({ edits })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", filePath: "src/file.ts", lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Renamed"));
    });
    test("rejects filePath that escapes the session working directory", async () => {
      const outsideUri = URI.parse("file:///outside.ts");
      const outsideModel = disposables.add(createTextModel("const OutsideSecretMarker = 1;", "typescript", void 0, outsideUri));
      const requestedUris = [];
      const textModelService = {
        _serviceBrand: void 0,
        createModelReference: async (uri) => {
          requestedUris.push(uri);
          return { object: { textEditorModel: outsideModel }, dispose: () => {
          } };
        },
        registerTextModelContentProvider: () => ({ dispose: () => {
        } }),
        canHandleResource: () => false
      };
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [makeEdit(outsideUri, new Range(1, 7, 1, 26), "RenamedSecretMarker")] })
      }));
      const bulkEditService = createMockBulkEditService();
      const tool = disposables.add(createTool(textModelService, { bulkEditService }));
      const result = await tool.invoke(
        {
          parameters: { symbol: "OutsideSecretMarker", newName: "RenamedSecretMarker", filePath: "../outside.ts", lineContent: "const OutsideSecretMarker = 1;" },
          context: { workingDirectory: URI.parse("file:///session-dir") }
        },
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Provide either"));
      assert.strictEqual(requestedUris.length, 0);
      assert.strictEqual(bulkEditService.appliedEdits.length, 0);
    });
    test("result includes toolResultMessage", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const edits = [
        makeEdit(testUri, new Range(1, 10, 1, 17), "MyNewClass")
      ];
      const provider = {
        provideRenameEdits: () => ({ edits })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(result.toolResultMessage);
      const msg = result.toolResultMessage;
      assert.ok(msg.value.includes("Renamed"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHRvb2xzXFxyZW5hbWVUb29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFJlbmFtZVByb3ZpZGVyLCBXb3Jrc3BhY2VFZGl0LCBSZWplY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlLCBJQnVsa0VkaXRSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVuYW1lVG9vbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdG9vbHMvcmVuYW1lVG9vbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbFJlc3VsdCwgSVRvb2xSZXN1bHRUZXh0UGFydCwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmZ1bmN0aW9uIGdldFRleHRDb250ZW50KHJlc3VsdDogSVRvb2xSZXN1bHQpOiBzdHJpbmcge1xuXHRjb25zdCBwYXJ0ID0gcmVzdWx0LmNvbnRlbnQuZmluZCgocCk6IHAgaXMgSVRvb2xSZXN1bHRUZXh0UGFydCA9PiBwLmtpbmQgPT09ICd0ZXh0Jyk7XG5cdHJldHVybiBwYXJ0Py52YWx1ZSA/PyAnJztcbn1cblxuc3VpdGUoJ1JlbmFtZVRvb2wnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBsYW5nRmVhdHVyZXM6IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlO1xuXG5cdGNvbnN0IHRlc3RVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9maWxlLnRzJyk7XG5cdGNvbnN0IHRlc3RDb250ZW50ID0gW1xuXHRcdCdpbXBvcnQgeyBNeUNsYXNzIH0gZnJvbSBcIi4vbXlDbGFzc1wiOycsXG5cdFx0JycsXG5cdFx0J2Z1bmN0aW9uIGRvU29tZXRoaW5nKCkgeycsXG5cdFx0J1xcdGNvbnN0IGluc3RhbmNlID0gbmV3IE15Q2xhc3MoKTsnLFxuXHRcdCdcXHRpbnN0YW5jZS5ydW4oKTsnLFxuXHRcdCd9Jyxcblx0XS5qb2luKCdcXG4nKTtcblxuXHRmdW5jdGlvbiBtYWtlRWRpdChyZXNvdXJjZTogVVJJLCByYW5nZTogUmFuZ2UsIHRleHQ6IHN0cmluZykge1xuXHRcdHJldHVybiB7IHJlc291cmNlLCB2ZXJzaW9uSWQ6IHVuZGVmaW5lZCwgdGV4dEVkaXQ6IHsgcmFuZ2UsIHRleHQgfSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWw6IHVua25vd24pOiBJVGV4dE1vZGVsU2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGNyZWF0ZU1vZGVsUmVmZXJlbmNlOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRvYmplY3Q6IHsgdGV4dEVkaXRvck1vZGVsOiBtb2RlbCB9LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRjYW5IYW5kbGVSZXNvdXJjZTogKCkgPT4gZmFsc2UsXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXh0TW9kZWxTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpO1xuXHRcdGNvbnN0IGZvbGRlciA9IHtcblx0XHRcdHVyaTogZm9sZGVyVXJpLFxuXHRcdFx0dG9SZXNvdXJjZTogKHJlbGF0aXZlUGF0aDogc3RyaW5nKSA9PiBVUkkucGFyc2UoYGZpbGU6Ly8vdGVzdC8ke3JlbGF0aXZlUGF0aH1gKSxcblx0XHR9IGFzIHVua25vd24gYXMgSVdvcmtzcGFjZUZvbGRlcjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0V29ya3NwYWNlOiAoKSA9PiAoeyBmb2xkZXJzOiBbZm9sZGVyXSB9KSxcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlcjogKHVyaTogVVJJKSA9PiB7XG5cdFx0XHRcdGlmICh1cmkudG9TdHJpbmcoKS5zdGFydHNXaXRoKGZvbGRlclVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdHJldHVybiBmb2xkZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrQ2hhdFNlcnZpY2UoKTogSUNoYXRTZXJ2aWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrQnVsa0VkaXRTZXJ2aWNlKCk6IElCdWxrRWRpdFNlcnZpY2UgJiB7IGFwcGxpZWRFZGl0czogV29ya3NwYWNlRWRpdFtdIH0ge1xuXHRcdGNvbnN0IGFwcGxpZWRFZGl0czogV29ya3NwYWNlRWRpdFtdID0gW107XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGFwcGx5OiBhc3luYyAoZWRpdDogV29ya3NwYWNlRWRpdCk6IFByb21pc2U8SUJ1bGtFZGl0UmVzdWx0PiA9PiB7XG5cdFx0XHRcdGFwcGxpZWRFZGl0cy5wdXNoKGVkaXQpO1xuXHRcdFx0XHRyZXR1cm4geyBhcmlhU3VtbWFyeTogJycsIGlzQXBwbGllZDogdHJ1ZSB9O1xuXHRcdFx0fSxcblx0XHRcdGFwcGxpZWRFZGl0cyxcblx0XHR9IGFzIHVua25vd24gYXMgSUJ1bGtFZGl0U2VydmljZSAmIHsgYXBwbGllZEVkaXRzOiBXb3Jrc3BhY2VFZGl0W10gfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUludm9jYXRpb24ocGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBJVG9vbEludm9jYXRpb24ge1xuXHRcdHJldHVybiB7IHBhcmFtZXRlcnMgfSBhcyB1bmtub3duIGFzIElUb29sSW52b2NhdGlvbjtcblx0fVxuXG5cdGNvbnN0IG5vb3BDb3VudFRva2VucyA9IGFzeW5jICgpID0+IDA7XG5cdGNvbnN0IG5vb3BQcm9ncmVzczogVG9vbFByb2dyZXNzID0geyByZXBvcnQoKSB7IH0gfTtcblxuXHRmdW5jdGlvbiBjcmVhdGVUb29sKHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLCBvcHRpb25zPzogeyBidWxrRWRpdFNlcnZpY2U/OiBJQnVsa0VkaXRTZXJ2aWNlIH0pOiBSZW5hbWVUb29sIHtcblx0XHRyZXR1cm4gbmV3IFJlbmFtZVRvb2woXG5cdFx0XHRsYW5nRmVhdHVyZXMsXG5cdFx0XHR0ZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZU1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0b3B0aW9ucz8uYnVsa0VkaXRTZXJ2aWNlID8/IGNyZWF0ZU1vY2tCdWxrRWRpdFNlcnZpY2UoKSxcblx0XHQpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGxhbmdGZWF0dXJlcyA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldFRvb2xEYXRhJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyB0b29sIGRhdGEgd2hlbiBubyBwcm92aWRlcnMgYXJlIHJlZ2lzdGVyZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobnVsbCEpKSk7XG5cdFx0XHRhc3NlcnQub2sodG9vbC5nZXRUb29sRGF0YSgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlc2NyaXB0aW9uIGRvZXMgbm90IGluY2x1ZGUgYSBwZXItbGFuZ3VhZ2UgbGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnJywgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVuYW1lUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCkgPT4gKHsgZWRpdHM6IFtdIH0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRvb2wuZ2V0VG9vbERhdGEoKTtcblx0XHRcdGFzc2VydC5vayghZGF0YS5tb2RlbERlc2NyaXB0aW9uLmluY2x1ZGVzKCdDdXJyZW50bHkgc3VwcG9ydGVkIGZvcicpLFxuXHRcdFx0XHRgZXhwZWN0ZWQgbW9kZWxEZXNjcmlwdGlvbiB0byBub3QgbGlzdCBsYW5ndWFnZXMsIGdvdDogJHtkYXRhLm1vZGVsRGVzY3JpcHRpb259YCk7XG5cdFx0XHRhc3NlcnQub2soIWRhdGEubW9kZWxEZXNjcmlwdGlvbi5pbmNsdWRlcygndHlwZXNjcmlwdCcpLFxuXHRcdFx0XHQnZXhwZWN0ZWQgbW9kZWxEZXNjcmlwdGlvbiB0byBub3QgaW5jbHVkZSBhbnkgc3BlY2lmaWMgbGFuZ3VhZ2UgaWQnKTtcblx0XHRcdGFzc2VydC5vayghZGF0YS5tb2RlbERlc2NyaXB0aW9uLmluY2x1ZGVzKCdhbGwgbGFuZ3VhZ2VzJyksXG5cdFx0XHRcdCdleHBlY3RlZCBtb2RlbERlc2NyaXB0aW9uIHRvIG5vdCBtZW50aW9uIFwiYWxsIGxhbmd1YWdlc1wiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXNjcmlwdGlvbiBpcyBpZGVudGljYWwgcmVnYXJkbGVzcyBvZiB3aGljaCBwcm92aWRlcnMgYXJlIHJlZ2lzdGVyZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sMSA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG51bGwhKSkpO1xuXHRcdFx0Y29uc3QgZGF0YTEgPSB0b29sMS5nZXRUb29sRGF0YSgpO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoJycsICd0eXBlc2NyaXB0JywgdW5kZWZpbmVkLCB0ZXN0VXJpKSk7XG5cdFx0XHRjb25zdCB0b29sMiA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKSA9PiAoeyBlZGl0czogW10gfSksXG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKCdweXRob24nLCB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCkgPT4gKHsgZWRpdHM6IFtdIH0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgZGF0YTIgPSB0b29sMi5nZXRUb29sRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YTEubW9kZWxEZXNjcmlwdGlvbiwgZGF0YTIubW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdFx0J2V4cGVjdGVkIG1vZGVsRGVzY3JpcHRpb24gdG8gYmUgYnl0ZS1zdGFibGUgYWNyb3NzIHByb3ZpZGVyIHJlZ2lzdHJhdGlvbnMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ludm9rZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgZXJyb3Igd2hlbiBubyB1cmkgb3IgZmlsZVBhdGggcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobnVsbCEpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBuZXdOYW1lOiAnTXlOZXdDbGFzcycsIGxpbmVDb250ZW50OiAnTXlDbGFzcycgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ1Byb3ZpZGUgZWl0aGVyJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIG5vIHJlbmFtZSBwcm92aWRlciBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwodGVzdENvbnRlbnQsICd0eXBlc2NyaXB0JywgdW5kZWZpbmVkLCB0ZXN0VXJpKSk7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpKSk7XG5cdFx0XHQvLyBObyByZW5hbWUgcHJvdmlkZXIgcmVnaXN0ZXJlZFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdNeUNsYXNzJywgbmV3TmFtZTogJ015TmV3Q2xhc3MnLCB1cmk6IHRlc3RVcmkudG9TdHJpbmcoKSwgbGluZUNvbnRlbnQ6ICdpbXBvcnQgeyBNeUNsYXNzIH0nIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCdObyByZW5hbWUgcHJvdmlkZXInKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVycm9yIHdoZW4gbGluZSBjb250ZW50IG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVuYW1lUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCkgPT4gKHsgZWRpdHM6IFtdIH0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdNeUNsYXNzJywgbmV3TmFtZTogJ015TmV3Q2xhc3MnLCB1cmk6IHRlc3RVcmkudG9TdHJpbmcoKSwgbGluZUNvbnRlbnQ6ICdub25leGlzdGVudCBsaW5lJyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnQ291bGQgbm90IGZpbmQgbGluZSBjb250ZW50JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIHN5bWJvbCBub3QgZm91bmQgaW4gbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVuYW1lUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCkgPT4gKHsgZWRpdHM6IFtdIH0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdOb3RIZXJlJywgbmV3TmFtZTogJ1NvbWV0aGluZycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2Z1bmN0aW9uIGRvU29tZXRoaW5nJyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnQ291bGQgbm90IGZpbmQgc3ltYm9sJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIHJlbmFtZSBpcyByZWplY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBSZW5hbWVQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKTogV29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbiA9PiAoe1xuXHRcdFx0XHRcdGVkaXRzOiBbXSxcblx0XHRcdFx0XHRyZWplY3RSZWFzb246ICdDYW5ub3QgcmVuYW1lIHRoaXMgc3ltYm9sJyxcblx0XHRcdFx0fSksXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHByb3ZpZGVyKSk7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBuZXdOYW1lOiAnTXlOZXdDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ1JlbmFtZSByZWplY3RlZCcpKTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCdDYW5ub3QgcmVuYW1lIHRoaXMgc3ltYm9sJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIHJlbmFtZSBwcm9kdWNlcyBubyBlZGl0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBSZW5hbWVQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKTogV29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbiA9PiAoe1xuXHRcdFx0XHRcdGVkaXRzOiBbXSxcblx0XHRcdFx0fSksXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHByb3ZpZGVyKSk7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBuZXdOYW1lOiAnTXlOZXdDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ25vIGVkaXRzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3VjY2Vzc2Z1bCByZW5hbWUgYXBwbGllcyBlZGl0cyB2aWEgYnVsayBlZGl0IGFuZCByZXBvcnRzIHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IG90aGVyVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3Qvb3RoZXIudHMnKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gW1xuXHRcdFx0XHRtYWtlRWRpdCh0ZXN0VXJpLCBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE3KSwgJ015TmV3Q2xhc3MnKSxcblx0XHRcdFx0bWFrZUVkaXQodGVzdFVyaSwgbmV3IFJhbmdlKDQsIDIzLCA0LCAzMCksICdNeU5ld0NsYXNzJyksXG5cdFx0XHRcdG1ha2VFZGl0KG90aGVyVXJpLCBuZXcgUmFuZ2UoNSwgMTQsIDUsIDIxKSwgJ015TmV3Q2xhc3MnKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBwcm92aWRlcjogUmVuYW1lUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCk6IFdvcmtzcGFjZUVkaXQgJiBSZWplY3Rpb24gPT4gKHsgZWRpdHMgfSksXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHByb3ZpZGVyKSk7XG5cblx0XHRcdGNvbnN0IGJ1bGtFZGl0U2VydmljZSA9IGNyZWF0ZU1vY2tCdWxrRWRpdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIHsgYnVsa0VkaXRTZXJ2aWNlIH0pKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdNeUNsYXNzJywgbmV3TmFtZTogJ015TmV3Q2xhc3MnLCB1cmk6IHRlc3RVcmkudG9TdHJpbmcoKSwgbGluZUNvbnRlbnQ6ICdpbXBvcnQgeyBNeUNsYXNzIH0nIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdGV4dCA9IGdldFRleHRDb250ZW50KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnUmVuYW1lZCcpKTtcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdNeUNsYXNzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ015TmV3Q2xhc3MnKSk7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnMyBlZGl0cycpKTtcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCcyIGZpbGVzJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bGtFZGl0U2VydmljZS5hcHBsaWVkRWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWxrRWRpdFNlcnZpY2UuYXBwbGllZEVkaXRzWzBdLmVkaXRzLmxlbmd0aCwgMyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWNjZXNzZnVsIHJlbmFtZSB3aXRoIHNpbmdsZSBlZGl0IHJlcG9ydHMgc2luZ3VsYXIgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gW1xuXHRcdFx0XHRtYWtlRWRpdCh0ZXN0VXJpLCBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE3KSwgJ015TmV3Q2xhc3MnKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBwcm92aWRlcjogUmVuYW1lUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCk6IFdvcmtzcGFjZUVkaXQgJiBSZWplY3Rpb24gPT4gKHsgZWRpdHMgfSksXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHByb3ZpZGVyKSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIG5ld05hbWU6ICdNeU5ld0NsYXNzJywgdXJpOiB0ZXN0VXJpLnRvU3RyaW5nKCksIGxpbmVDb250ZW50OiAnaW1wb3J0IHsgTXlDbGFzcyB9JyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHRleHQgPSBnZXRUZXh0Q29udGVudChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJzEgZWRpdCcpKTtcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCcxIGZpbGUnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyBmaWxlUGF0aCB2aWEgd29ya3NwYWNlIGZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3Qvc3JjL2ZpbGUudHMnKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIGZpbGVVcmkpKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gW1xuXHRcdFx0XHRtYWtlRWRpdChmaWxlVXJpLCBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE3KSwgJ015TmV3Q2xhc3MnKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBwcm92aWRlcjogUmVuYW1lUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCk6IFdvcmtzcGFjZUVkaXQgJiBSZWplY3Rpb24gPT4gKHsgZWRpdHMgfSksXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHByb3ZpZGVyKSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIG5ld05hbWU6ICdNeU5ld0NsYXNzJywgZmlsZVBhdGg6ICdzcmMvZmlsZS50cycsIGxpbmVDb250ZW50OiAnaW1wb3J0IHsgTXlDbGFzcyB9JyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCdSZW5hbWVkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBmaWxlUGF0aCB0aGF0IGVzY2FwZXMgdGhlIHNlc3Npb24gd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRzaWRlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL291dHNpZGUudHMnKTtcblx0XHRcdGNvbnN0IG91dHNpZGVNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoJ2NvbnN0IE91dHNpZGVTZWNyZXRNYXJrZXIgPSAxOycsICd0eXBlc2NyaXB0JywgdW5kZWZpbmVkLCBvdXRzaWRlVXJpKSk7XG5cdFx0XHRjb25zdCByZXF1ZXN0ZWRVcmlzOiBVUklbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjcmVhdGVNb2RlbFJlZmVyZW5jZTogYXN5bmMgKHVyaTogVVJJKSA9PiB7XG5cdFx0XHRcdFx0cmVxdWVzdGVkVXJpcy5wdXNoKHVyaSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgb2JqZWN0OiB7IHRleHRFZGl0b3JNb2RlbDogb3V0c2lkZU1vZGVsIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0XHRjYW5IYW5kbGVSZXNvdXJjZTogKCkgPT4gZmFsc2UsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSVRleHRNb2RlbFNlcnZpY2U7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0Jywge1xuXHRcdFx0XHRwcm92aWRlUmVuYW1lRWRpdHM6ICgpOiBXb3Jrc3BhY2VFZGl0ICYgUmVqZWN0aW9uID0+ICh7IGVkaXRzOiBbbWFrZUVkaXQob3V0c2lkZVVyaSwgbmV3IFJhbmdlKDEsIDcsIDEsIDI2KSwgJ1JlbmFtZWRTZWNyZXRNYXJrZXInKV0gfSksXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGJ1bGtFZGl0U2VydmljZSA9IGNyZWF0ZU1vY2tCdWxrRWRpdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbCh0ZXh0TW9kZWxTZXJ2aWNlLCB7IGJ1bGtFZGl0U2VydmljZSB9KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHsgc3ltYm9sOiAnT3V0c2lkZVNlY3JldE1hcmtlcicsIG5ld05hbWU6ICdSZW5hbWVkU2VjcmV0TWFya2VyJywgZmlsZVBhdGg6ICcuLi9vdXRzaWRlLnRzJywgbGluZUNvbnRlbnQ6ICdjb25zdCBPdXRzaWRlU2VjcmV0TWFya2VyID0gMTsnIH0sXG5cdFx0XHRcdFx0Y29udGV4dDogeyB3b3JraW5nRGlyZWN0b3J5OiBVUkkucGFyc2UoJ2ZpbGU6Ly8vc2Vzc2lvbi1kaXInKSB9LFxuXHRcdFx0XHR9IGFzIHVua25vd24gYXMgSVRvb2xJbnZvY2F0aW9uLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ1Byb3ZpZGUgZWl0aGVyJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RlZFVyaXMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWxrRWRpdFNlcnZpY2UuYXBwbGllZEVkaXRzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN1bHQgaW5jbHVkZXMgdG9vbFJlc3VsdE1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwodGVzdENvbnRlbnQsICd0eXBlc2NyaXB0JywgdW5kZWZpbmVkLCB0ZXN0VXJpKSk7XG5cdFx0XHRjb25zdCBlZGl0cyA9IFtcblx0XHRcdFx0bWFrZUVkaXQodGVzdFVyaSwgbmV3IFJhbmdlKDEsIDEwLCAxLCAxNyksICdNeU5ld0NsYXNzJyksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IFJlbmFtZVByb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlUmVuYW1lRWRpdHM6ICgpOiBXb3Jrc3BhY2VFZGl0ICYgUmVqZWN0aW9uID0+ICh7IGVkaXRzIH0pLFxuXHRcdFx0fTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVuYW1lUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCBwcm92aWRlcikpO1xuXG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBuZXdOYW1lOiAnTXlOZXdDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlKTtcblx0XHRcdGNvbnN0IG1zZyA9IHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmc7XG5cdFx0XHRhc3NlcnQub2sobXNnLnZhbHVlLmluY2x1ZGVzKCdSZW5hbWVkJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLGFBQWE7QUFHdEIsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyx1QkFBdUI7QUFHaEMsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxlQUFlLFFBQTZCO0FBQ3BELFFBQU0sT0FBTyxPQUFPLFFBQVEsS0FBSyxDQUFDLE1BQWdDLEVBQUUsU0FBUyxNQUFNO0FBQ25GLFNBQU8sTUFBTSxTQUFTO0FBQ3ZCO0FBRUEsTUFBTSxjQUFjLE1BQU07QUFFekIsUUFBTSxjQUFjLElB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
