import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { LanguageFeaturesService } from "../../../../../../editor/common/services/languageFeaturesService.js";
import { createTextModel } from "../../../../../../editor/test/common/testTextModel.js";
import { FileMatch, OneLineRange, TextSearchMatch } from "../../../../../services/search/common/search.js";
import { UsagesTool } from "../../../browser/tools/usagesTool.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
function getTextContent(result) {
  const part = result.content.find((p) => p.kind === "text");
  return part?.value ?? "";
}
suite("UsagesTool", () => {
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
  function createMockModelService(models) {
    return {
      _serviceBrand: void 0,
      getModel: (uri) => models?.find((m) => m.uri.toString() === uri.toString()) ?? null
    };
  }
  function createMockSearchService(searchImpl) {
    return {
      _serviceBrand: void 0,
      textSearch: async (query) => searchImpl?.(query) ?? { results: [], messages: [] }
    };
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
  function createInvocation(parameters) {
    return { parameters };
  }
  const noopCountTokens = async () => 0;
  const noopProgress = { report() {
  } };
  function createTool(textModelService, workspaceService, options) {
    return new UsagesTool(langFeatures, options?.modelService ?? createMockModelService(), options?.searchService ?? createMockSearchService(), textModelService, workspaceService);
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
      const tool = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
      assert.ok(tool.getToolData());
    });
    test("description does not include a per-language list", () => {
      const model = disposables.add(createTextModel("", "typescript", void 0, testUri));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      disposables.add(langFeatures.referenceProvider.register("typescript", { provideReferences: () => [] }));
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
      const tool1 = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
      const data1 = tool1.getToolData();
      const model = disposables.add(createTextModel("", "typescript", void 0, testUri));
      const tool2 = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      disposables.add(langFeatures.referenceProvider.register("typescript", { provideReferences: () => [] }));
      disposables.add(langFeatures.referenceProvider.register("python", { provideReferences: () => [] }));
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
      const tool = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", lineContent: "MyClass" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Provide either"));
    });
    test("returns error when line content not found", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", { provideReferences: () => [] }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", uri: testUri.toString(), lineContent: "nonexistent line" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Could not find line content"));
    });
    test("returns error when symbol not found in line", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", { provideReferences: () => [] }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "NotHere", uri: testUri.toString(), lineContent: "function doSomething" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Could not find symbol"));
    });
    test("finds references and classifies them with usage tags", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const otherUri = URI.parse("file:///test/other.ts");
      const refProvider = {
        provideReferences: (_model) => [
          { uri: testUri, range: new Range(1, 10, 1, 17) },
          { uri: testUri, range: new Range(4, 23, 4, 30) },
          { uri: otherUri, range: new Range(5, 1, 5, 8) }
        ]
      };
      const defProvider = {
        provideDefinition: () => [{ uri: testUri, range: new Range(1, 10, 1, 17) }]
      };
      const implProvider = {
        provideImplementation: () => [{ uri: otherUri, range: new Range(5, 1, 5, 8) }]
      };
      disposables.add(langFeatures.referenceProvider.register("typescript", refProvider));
      disposables.add(langFeatures.definitionProvider.register("typescript", defProvider));
      disposables.add(langFeatures.implementationProvider.register("typescript", implProvider));
      const searchCalled = [];
      const searchService = createMockSearchService((query) => {
        searchCalled.push(query);
        const fileMatch = new FileMatch(otherUri);
        fileMatch.results = [new TextSearchMatch(
          "export class MyClass implements IMyClass {",
          new OneLineRange(4, 0, 7)
          // 0-based line 4 = 1-based line 5
        )];
        return { results: [fileMatch], messages: [] };
      });
      const modelService = createMockModelService([model]);
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { modelService, searchService }));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes("3 usages of `MyClass`"));
      assert.ok(text.includes(`<usage type="definition" uri="${testUri.toString()}" line="1">`));
      assert.ok(text.includes(`<usage type="reference" uri="${testUri.toString()}" line="4">`));
      assert.ok(text.includes(`<usage type="implementation" uri="${otherUri.toString()}" line="5">`));
      assert.ok(text.includes('import { MyClass } from "./myClass"'));
      assert.ok(text.includes("const instance = new MyClass()"));
      assert.ok(text.includes("export class MyClass implements IMyClass {"));
      assert.ok(text.includes("</usage>"));
      assert.strictEqual(searchCalled.length, 1);
      assert.ok(searchCalled[0].contentPattern.pattern.includes("MyClass"));
      assert.ok(searchCalled[0].contentPattern.isWordMatch);
    });
    test("uses self-closing tag when no preview available", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const otherUri = URI.parse("file:///test/other.ts");
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: otherUri, range: new Range(10, 5, 10, 12) }
        ]
      }));
      const searchService = createMockSearchService(() => ({ results: [], messages: [] }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { searchService }));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes(`<usage type="reference" uri="${otherUri.toString()}" line="10" />`));
    });
    test("does not call search service for files already open in model service", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: testUri, range: new Range(1, 10, 1, 17) }
        ]
      }));
      let searchCalled = false;
      const searchService = createMockSearchService(() => {
        searchCalled = true;
        return { results: [], messages: [] };
      });
      const modelService = createMockModelService([model]);
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { modelService, searchService }));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("1 usages"));
      assert.strictEqual(searchCalled, false, "search service should not be called when all files are open");
    });
    test("handles whitespace normalization in lineContent", async () => {
      const content = "function   doSomething(x:  number) {}";
      const model = disposables.add(createTextModel(content, "typescript", void 0, testUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: testUri, range: new Range(1, 12, 1, 23) }
        ]
      }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "doSomething", uri: testUri.toString(), lineContent: "function doSomething(x: number)" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("1 usages"));
    });
    test("resolves filePath via workspace folders", async () => {
      const fileUri = URI.parse("file:///test/src/file.ts");
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, fileUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: fileUri, range: new Range(1, 10, 1, 17) }
        ]
      }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", filePath: "src/file.ts", lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("1 usages"));
    });
    test("rejects filePath that escapes the session working directory", async () => {
      const outsideUri = URI.parse("file:///outside.ts");
      const outsideContent = "export const OutsideSecretMarker = 1;";
      const outsideModel = disposables.add(createTextModel(outsideContent, "typescript", void 0, outsideUri));
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
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: outsideUri, range: new Range(1, 14, 1, 33) }
        ]
      }));
      const tool = disposables.add(createTool(textModelService, createMockWorkspaceService(), { modelService: createMockModelService([outsideModel]) }));
      const result = await tool.invoke(
        {
          parameters: { symbol: "OutsideSecretMarker", filePath: "../outside.ts", lineContent: outsideContent },
          context: { workingDirectory: URI.parse("file:///session-dir") }
        },
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes("Provide either"));
      assert.ok(!text.includes(outsideContent));
      assert.strictEqual(requestedUris.length, 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHRvb2xzXFx1c2FnZXNUb29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERlZmluaXRpb25Qcm92aWRlciwgSW1wbGVtZW50YXRpb25Qcm92aWRlciwgTG9jYXRpb24sIFJlZmVyZW5jZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRmlsZU1hdGNoLCBJU2VhcmNoQ29tcGxldGUsIElTZWFyY2hTZXJ2aWNlLCBJVGV4dFF1ZXJ5LCBPbmVMaW5lUmFuZ2UsIFRleHRTZWFyY2hNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFVzYWdlc1Rvb2wgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rvb2xzL3VzYWdlc1Rvb2wuanMnO1xuaW1wb3J0IHsgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbFJlc3VsdCwgSVRvb2xSZXN1bHRUZXh0UGFydCwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmZ1bmN0aW9uIGdldFRleHRDb250ZW50KHJlc3VsdDogSVRvb2xSZXN1bHQpOiBzdHJpbmcge1xuXHRjb25zdCBwYXJ0ID0gcmVzdWx0LmNvbnRlbnQuZmluZCgocCk6IHAgaXMgSVRvb2xSZXN1bHRUZXh0UGFydCA9PiBwLmtpbmQgPT09ICd0ZXh0Jyk7XG5cdHJldHVybiBwYXJ0Py52YWx1ZSA/PyAnJztcbn1cblxuc3VpdGUoJ1VzYWdlc1Rvb2wnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBsYW5nRmVhdHVyZXM6IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlO1xuXG5cdGNvbnN0IHRlc3RVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9maWxlLnRzJyk7XG5cdGNvbnN0IHRlc3RDb250ZW50ID0gW1xuXHRcdCdpbXBvcnQgeyBNeUNsYXNzIH0gZnJvbSBcIi4vbXlDbGFzc1wiOycsXG5cdFx0JycsXG5cdFx0J2Z1bmN0aW9uIGRvU29tZXRoaW5nKCkgeycsXG5cdFx0J1xcdGNvbnN0IGluc3RhbmNlID0gbmV3IE15Q2xhc3MoKTsnLFxuXHRcdCdcXHRpbnN0YW5jZS5ydW4oKTsnLFxuXHRcdCd9Jyxcblx0XS5qb2luKCdcXG4nKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrTW9kZWxTZXJ2aWNlKG1vZGVscz86IElUZXh0TW9kZWxbXSk6IElNb2RlbFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRnZXRNb2RlbDogKHVyaTogVVJJKSA9PiBtb2RlbHM/LmZpbmQobSA9PiBtLnVyaS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkgPz8gbnVsbCxcblx0XHR9IGFzIHVua25vd24gYXMgSU1vZGVsU2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tTZWFyY2hTZXJ2aWNlKHNlYXJjaEltcGw/OiAocXVlcnk6IElUZXh0UXVlcnkpID0+IElTZWFyY2hDb21wbGV0ZSk6IElTZWFyY2hTZXJ2aWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0dGV4dFNlYXJjaDogYXN5bmMgKHF1ZXJ5OiBJVGV4dFF1ZXJ5KSA9PiBzZWFyY2hJbXBsPy4ocXVlcnkpID8/IHsgcmVzdWx0czogW10sIG1lc3NhZ2VzOiBbXSB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJU2VhcmNoU2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsOiBJVGV4dE1vZGVsKTogSVRleHRNb2RlbFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRjcmVhdGVNb2RlbFJlZmVyZW5jZTogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0b2JqZWN0OiB7IHRleHRFZGl0b3JNb2RlbDogbW9kZWwgfSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRyZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0Y2FuSGFuZGxlUmVzb3VyY2U6ICgpID0+IGZhbHNlLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGV4dE1vZGVsU2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCk6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKTtcblx0XHRjb25zdCBmb2xkZXIgPSB7XG5cdFx0XHR1cmk6IGZvbGRlclVyaSxcblx0XHRcdHRvUmVzb3VyY2U6IChyZWxhdGl2ZVBhdGg6IHN0cmluZykgPT4gVVJJLnBhcnNlKGBmaWxlOi8vL3Rlc3QvJHtyZWxhdGl2ZVBhdGh9YCksXG5cdFx0fSBhcyB1bmtub3duIGFzIElXb3Jrc3BhY2VGb2xkZXI7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGdldFdvcmtzcGFjZTogKCkgPT4gKHsgZm9sZGVyczogW2ZvbGRlcl0gfSksXG5cdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXI6ICh1cmk6IFVSSSkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnRvU3RyaW5nKCkuc3RhcnRzV2l0aChmb2xkZXJVcmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZm9sZGVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSW52b2NhdGlvbihwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IElUb29sSW52b2NhdGlvbiB7XG5cdFx0cmV0dXJuIHsgcGFyYW1ldGVycyB9IGFzIHVua25vd24gYXMgSVRvb2xJbnZvY2F0aW9uO1xuXHR9XG5cblx0Y29uc3Qgbm9vcENvdW50VG9rZW5zID0gYXN5bmMgKCkgPT4gMDtcblx0Y29uc3Qgbm9vcFByb2dyZXNzOiBUb29sUHJvZ3Jlc3MgPSB7IHJlcG9ydCgpIHsgfSB9O1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRvb2wodGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsIHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgb3B0aW9ucz86IHsgbW9kZWxTZXJ2aWNlPzogSU1vZGVsU2VydmljZTsgc2VhcmNoU2VydmljZT86IElTZWFyY2hTZXJ2aWNlIH0pOiBVc2FnZXNUb29sIHtcblx0XHRyZXR1cm4gbmV3IFVzYWdlc1Rvb2wobGFuZ0ZlYXR1cmVzLCBvcHRpb25zPy5tb2RlbFNlcnZpY2UgPz8gY3JlYXRlTW9ja01vZGVsU2VydmljZSgpLCBvcHRpb25zPy5zZWFyY2hTZXJ2aWNlID8/IGNyZWF0ZU1vY2tTZWFyY2hTZXJ2aWNlKCksIHRleHRNb2RlbFNlcnZpY2UsIHdvcmtzcGFjZVNlcnZpY2UpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGxhbmdGZWF0dXJlcyA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldFRvb2xEYXRhJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyB0b29sIGRhdGEgd2hlbiBubyBwcm92aWRlcnMgYXJlIHJlZ2lzdGVyZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobnVsbCEpLCBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpKSk7XG5cdFx0XHRhc3NlcnQub2sodG9vbC5nZXRUb29sRGF0YSgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlc2NyaXB0aW9uIGRvZXMgbm90IGluY2x1ZGUgYSBwZXItbGFuZ3VhZ2UgbGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnJywgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVmZXJlbmNlUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7IHByb3ZpZGVSZWZlcmVuY2VzOiAoKSA9PiBbXSB9KSk7XG5cdFx0XHRjb25zdCBkYXRhID0gdG9vbC5nZXRUb29sRGF0YSgpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFkYXRhLm1vZGVsRGVzY3JpcHRpb24uaW5jbHVkZXMoJ0N1cnJlbnRseSBzdXBwb3J0ZWQgZm9yJyksXG5cdFx0XHRcdGBleHBlY3RlZCBtb2RlbERlc2NyaXB0aW9uIHRvIG5vdCBsaXN0IGxhbmd1YWdlcywgZ290OiAke2RhdGEubW9kZWxEZXNjcmlwdGlvbn1gKTtcblx0XHRcdGFzc2VydC5vayghZGF0YS5tb2RlbERlc2NyaXB0aW9uLmluY2x1ZGVzKCd0eXBlc2NyaXB0JyksXG5cdFx0XHRcdCdleHBlY3RlZCBtb2RlbERlc2NyaXB0aW9uIHRvIG5vdCBpbmNsdWRlIGFueSBzcGVjaWZpYyBsYW5ndWFnZSBpZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFkYXRhLm1vZGVsRGVzY3JpcHRpb24uaW5jbHVkZXMoJ2FsbCBsYW5ndWFnZXMnKSxcblx0XHRcdFx0J2V4cGVjdGVkIG1vZGVsRGVzY3JpcHRpb24gdG8gbm90IG1lbnRpb24gXCJhbGwgbGFuZ3VhZ2VzXCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlc2NyaXB0aW9uIGlzIGlkZW50aWNhbCByZWdhcmRsZXNzIG9mIHdoaWNoIHByb3ZpZGVycyBhcmUgcmVnaXN0ZXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wxID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobnVsbCEpLCBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBkYXRhMSA9IHRvb2wxLmdldFRvb2xEYXRhKCk7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnJywgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IHRvb2wyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpLCBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgeyBwcm92aWRlUmVmZXJlbmNlczogKCkgPT4gW10gfSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigncHl0aG9uJywgeyBwcm92aWRlUmVmZXJlbmNlczogKCkgPT4gW10gfSkpO1xuXHRcdFx0Y29uc3QgZGF0YTIgPSB0b29sMi5nZXRUb29sRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YTEubW9kZWxEZXNjcmlwdGlvbiwgZGF0YTIubW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdFx0J2V4cGVjdGVkIG1vZGVsRGVzY3JpcHRpb24gdG8gYmUgYnl0ZS1zdGFibGUgYWNyb3NzIHByb3ZpZGVyIHJlZ2lzdHJhdGlvbnMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ludm9rZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgZXJyb3Igd2hlbiBubyB1cmkgb3IgZmlsZVBhdGggcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobnVsbCEpLCBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBsaW5lQ29udGVudDogJ015Q2xhc3MnIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCdQcm92aWRlIGVpdGhlcicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZXJyb3Igd2hlbiBsaW5lIGNvbnRlbnQgbm90IGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHsgcHJvdmlkZVJlZmVyZW5jZXM6ICgpID0+IFtdIH0pKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ25vbmV4aXN0ZW50IGxpbmUnIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCdDb3VsZCBub3QgZmluZCBsaW5lIGNvbnRlbnQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVycm9yIHdoZW4gc3ltYm9sIG5vdCBmb3VuZCBpbiBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHsgcHJvdmlkZVJlZmVyZW5jZXM6ICgpID0+IFtdIH0pKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTm90SGVyZScsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2Z1bmN0aW9uIGRvU29tZXRoaW5nJyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnQ291bGQgbm90IGZpbmQgc3ltYm9sJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluZHMgcmVmZXJlbmNlcyBhbmQgY2xhc3NpZmllcyB0aGVtIHdpdGggdXNhZ2UgdGFncycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IG90aGVyVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3Qvb3RoZXIudHMnKTtcblxuXHRcdFx0Y29uc3QgcmVmUHJvdmlkZXI6IFJlZmVyZW5jZVByb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlUmVmZXJlbmNlczogKF9tb2RlbDogSVRleHRNb2RlbCk6IExvY2F0aW9uW10gPT4gW1xuXHRcdFx0XHRcdHsgdXJpOiB0ZXN0VXJpLCByYW5nZTogbmV3IFJhbmdlKDEsIDEwLCAxLCAxNykgfSxcblx0XHRcdFx0XHR7IHVyaTogdGVzdFVyaSwgcmFuZ2U6IG5ldyBSYW5nZSg0LCAyMywgNCwgMzApIH0sXG5cdFx0XHRcdFx0eyB1cmk6IG90aGVyVXJpLCByYW5nZTogbmV3IFJhbmdlKDUsIDEsIDUsIDgpIH0sXG5cdFx0XHRcdF1cblx0XHRcdH07XG5cdFx0XHRjb25zdCBkZWZQcm92aWRlcjogRGVmaW5pdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlRGVmaW5pdGlvbjogKCkgPT4gW3sgdXJpOiB0ZXN0VXJpLCByYW5nZTogbmV3IFJhbmdlKDEsIDEwLCAxLCAxNykgfV1cblx0XHRcdH07XG5cdFx0XHRjb25zdCBpbXBsUHJvdmlkZXI6IEltcGxlbWVudGF0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVJbXBsZW1lbnRhdGlvbjogKCkgPT4gW3sgdXJpOiBvdGhlclVyaSwgcmFuZ2U6IG5ldyBSYW5nZSg1LCAxLCA1LCA4KSB9XVxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHJlZlByb3ZpZGVyKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLmRlZmluaXRpb25Qcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIGRlZlByb3ZpZGVyKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLmltcGxlbWVudGF0aW9uUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCBpbXBsUHJvdmlkZXIpKTtcblxuXHRcdFx0Ly8gTW9kZWwgaXMgb3BlbiBmb3IgdGVzdFVyaSBzbyBJTW9kZWxTZXJ2aWNlIHJldHVybnMgaXQ7IG90aGVyVXJpIG5lZWRzIHNlYXJjaFxuXHRcdFx0Y29uc3Qgc2VhcmNoQ2FsbGVkOiBJVGV4dFF1ZXJ5W10gPSBbXTtcblx0XHRcdGNvbnN0IHNlYXJjaFNlcnZpY2UgPSBjcmVhdGVNb2NrU2VhcmNoU2VydmljZShxdWVyeSA9PiB7XG5cdFx0XHRcdHNlYXJjaENhbGxlZC5wdXNoKHF1ZXJ5KTtcblx0XHRcdFx0Y29uc3QgZmlsZU1hdGNoID0gbmV3IEZpbGVNYXRjaChvdGhlclVyaSk7XG5cdFx0XHRcdGZpbGVNYXRjaC5yZXN1bHRzID0gW25ldyBUZXh0U2VhcmNoTWF0Y2goXG5cdFx0XHRcdFx0J2V4cG9ydCBjbGFzcyBNeUNsYXNzIGltcGxlbWVudHMgSU15Q2xhc3MgeycsXG5cdFx0XHRcdFx0bmV3IE9uZUxpbmVSYW5nZSg0LCAwLCA3KSAvLyAwLWJhc2VkIGxpbmUgNCA9IDEtYmFzZWQgbGluZSA1XG5cdFx0XHRcdCldO1xuXHRcdFx0XHRyZXR1cm4geyByZXN1bHRzOiBbZmlsZU1hdGNoXSwgbWVzc2FnZXM6IFtdIH07XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGNyZWF0ZU1vY2tNb2RlbFNlcnZpY2UoW21vZGVsXSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCksIHsgbW9kZWxTZXJ2aWNlLCBzZWFyY2hTZXJ2aWNlIH0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gZ2V0VGV4dENvbnRlbnQocmVzdWx0KTtcblxuXHRcdFx0Ly8gQ2hlY2sgb3ZlcmFsbCBzdHJ1Y3R1cmVcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCczIHVzYWdlcyBvZiBgTXlDbGFzc2AnKSk7XG5cblx0XHRcdC8vIENoZWNrIHVzYWdlIHRhZyBmb3JtYXRcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKGA8dXNhZ2UgdHlwZT1cImRlZmluaXRpb25cIiB1cmk9XCIke3Rlc3RVcmkudG9TdHJpbmcoKX1cIiBsaW5lPVwiMVwiPmApKTtcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKGA8dXNhZ2UgdHlwZT1cInJlZmVyZW5jZVwiIHVyaT1cIiR7dGVzdFVyaS50b1N0cmluZygpfVwiIGxpbmU9XCI0XCI+YCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoYDx1c2FnZSB0eXBlPVwiaW1wbGVtZW50YXRpb25cIiB1cmk9XCIke290aGVyVXJpLnRvU3RyaW5nKCl9XCIgbGluZT1cIjVcIj5gKSk7XG5cblx0XHRcdC8vIENoZWNrIHRoYXQgcHJldmlld3MgZnJvbSBvcGVuIG1vZGVsIGFyZSBpbmNsdWRlZCAodGVzdFVyaSBsaW5lcylcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdpbXBvcnQgeyBNeUNsYXNzIH0gZnJvbSBcIi4vbXlDbGFzc1wiJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ2NvbnN0IGluc3RhbmNlID0gbmV3IE15Q2xhc3MoKScpKTtcblxuXHRcdFx0Ly8gQ2hlY2sgdGhhdCBwcmV2aWV3IGZyb20gc2VhcmNoIHNlcnZpY2UgaXMgaW5jbHVkZWQgKG90aGVyVXJpKVxuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ2V4cG9ydCBjbGFzcyBNeUNsYXNzIGltcGxlbWVudHMgSU15Q2xhc3MgeycpKTtcblxuXHRcdFx0Ly8gQ2hlY2sgY2xvc2luZyB0YWdzXG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnPC91c2FnZT4nKSk7XG5cblx0XHRcdC8vIFZlcmlmeSBzZWFyY2ggc2VydmljZSB3YXMgY2FsbGVkIGZvciB0aGUgbm9uLW9wZW4gZmlsZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlYXJjaENhbGxlZC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlYXJjaENhbGxlZFswXS5jb250ZW50UGF0dGVybi5wYXR0ZXJuLmluY2x1ZGVzKCdNeUNsYXNzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlYXJjaENhbGxlZFswXS5jb250ZW50UGF0dGVybi5pc1dvcmRNYXRjaCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHNlbGYtY2xvc2luZyB0YWcgd2hlbiBubyBwcmV2aWV3IGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IG90aGVyVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3Qvb3RoZXIudHMnKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHtcblx0XHRcdFx0cHJvdmlkZVJlZmVyZW5jZXM6ICgpOiBMb2NhdGlvbltdID0+IFtcblx0XHRcdFx0XHR7IHVyaTogb3RoZXJVcmksIHJhbmdlOiBuZXcgUmFuZ2UoMTAsIDUsIDEwLCAxMikgfSxcblx0XHRcdFx0XVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBTZWFyY2ggcmV0dXJucyBubyByZXN1bHRzIGZvciB0aGlzIGZpbGUgKHN5bWJvbCByZW5hbWVkL2FsaWFzZWQpXG5cdFx0XHRjb25zdCBzZWFyY2hTZXJ2aWNlID0gY3JlYXRlTW9ja1NlYXJjaFNlcnZpY2UoKCkgPT4gKHsgcmVzdWx0czogW10sIG1lc3NhZ2VzOiBbXSB9KSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCksIHsgc2VhcmNoU2VydmljZSB9KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCB1cmk6IHRlc3RVcmkudG9TdHJpbmcoKSwgbGluZUNvbnRlbnQ6ICdpbXBvcnQgeyBNeUNsYXNzIH0nIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdGV4dCA9IGdldFRleHRDb250ZW50KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcyhgPHVzYWdlIHR5cGU9XCJyZWZlcmVuY2VcIiB1cmk9XCIke290aGVyVXJpLnRvU3RyaW5nKCl9XCIgbGluZT1cIjEwXCIgLz5gKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjYWxsIHNlYXJjaCBzZXJ2aWNlIGZvciBmaWxlcyBhbHJlYWR5IG9wZW4gaW4gbW9kZWwgc2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHtcblx0XHRcdFx0cHJvdmlkZVJlZmVyZW5jZXM6ICgpOiBMb2NhdGlvbltdID0+IFtcblx0XHRcdFx0XHR7IHVyaTogdGVzdFVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMCwgMSwgMTcpIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0pKTtcblxuXHRcdFx0bGV0IHNlYXJjaENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc2VhcmNoU2VydmljZSA9IGNyZWF0ZU1vY2tTZWFyY2hTZXJ2aWNlKCgpID0+IHtcblx0XHRcdFx0c2VhcmNoQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHsgcmVzdWx0czogW10sIG1lc3NhZ2VzOiBbXSB9O1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBtb2RlbFNlcnZpY2UgPSBjcmVhdGVNb2NrTW9kZWxTZXJ2aWNlKFttb2RlbF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpLCBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpLCB7IG1vZGVsU2VydmljZSwgc2VhcmNoU2VydmljZSB9KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCB1cmk6IHRlc3RVcmkudG9TdHJpbmcoKSwgbGluZUNvbnRlbnQ6ICdpbXBvcnQgeyBNeUNsYXNzIH0nIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJzEgdXNhZ2VzJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlYXJjaENhbGxlZCwgZmFsc2UsICdzZWFyY2ggc2VydmljZSBzaG91bGQgbm90IGJlIGNhbGxlZCB3aGVuIGFsbCBmaWxlcyBhcmUgb3BlbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB3aGl0ZXNwYWNlIG5vcm1hbGl6YXRpb24gaW4gbGluZUNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gJ2Z1bmN0aW9uICAgZG9Tb21ldGhpbmcoeDogIG51bWJlcikge30nO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGNvbnRlbnQsICd0eXBlc2NyaXB0JywgdW5kZWZpbmVkLCB0ZXN0VXJpKSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVmZXJlbmNlUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7XG5cdFx0XHRcdHByb3ZpZGVSZWZlcmVuY2VzOiAoKTogTG9jYXRpb25bXSA9PiBbXG5cdFx0XHRcdFx0eyB1cmk6IHRlc3RVcmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTIsIDEsIDIzKSB9LFxuXHRcdFx0XHRdXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnZG9Tb21ldGhpbmcnLCB1cmk6IHRlc3RVcmkudG9TdHJpbmcoKSwgbGluZUNvbnRlbnQ6ICdmdW5jdGlvbiBkb1NvbWV0aGluZyh4OiBudW1iZXIpJyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCcxIHVzYWdlcycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIGZpbGVQYXRoIHZpYSB3b3Jrc3BhY2UgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9zcmMvZmlsZS50cycpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgZmlsZVVyaSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0Jywge1xuXHRcdFx0XHRwcm92aWRlUmVmZXJlbmNlczogKCk6IExvY2F0aW9uW10gPT4gW1xuXHRcdFx0XHRcdHsgdXJpOiBmaWxlVXJpLCByYW5nZTogbmV3IFJhbmdlKDEsIDEwLCAxLCAxNykgfSxcblx0XHRcdFx0XVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpLCBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBmaWxlUGF0aDogJ3NyYy9maWxlLnRzJywgbGluZUNvbnRlbnQ6ICdpbXBvcnQgeyBNeUNsYXNzIH0nIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJzEgdXNhZ2VzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBmaWxlUGF0aCB0aGF0IGVzY2FwZXMgdGhlIHNlc3Npb24gd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRzaWRlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL291dHNpZGUudHMnKTtcblx0XHRcdGNvbnN0IG91dHNpZGVDb250ZW50ID0gJ2V4cG9ydCBjb25zdCBPdXRzaWRlU2VjcmV0TWFya2VyID0gMTsnO1xuXHRcdFx0Y29uc3Qgb3V0c2lkZU1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChvdXRzaWRlQ29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIG91dHNpZGVVcmkpKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RlZFVyaXM6IFVSSVtdID0gW107XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWxTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNyZWF0ZU1vZGVsUmVmZXJlbmNlOiBhc3luYyAodXJpOiBVUkkpID0+IHtcblx0XHRcdFx0XHRyZXF1ZXN0ZWRVcmlzLnB1c2godXJpKTtcblx0XHRcdFx0XHRyZXR1cm4geyBvYmplY3Q6IHsgdGV4dEVkaXRvck1vZGVsOiBvdXRzaWRlTW9kZWwgfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRcdGNhbkhhbmRsZVJlc291cmNlOiAoKSA9PiBmYWxzZSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJVGV4dE1vZGVsU2VydmljZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVmZXJlbmNlUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7XG5cdFx0XHRcdHByb3ZpZGVSZWZlcmVuY2VzOiAoKTogTG9jYXRpb25bXSA9PiBbXG5cdFx0XHRcdFx0eyB1cmk6IG91dHNpZGVVcmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTQsIDEsIDMzKSB9LFxuXHRcdFx0XHRdXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbCh0ZXh0TW9kZWxTZXJ2aWNlLCBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpLCB7IG1vZGVsU2VydmljZTogY3JlYXRlTW9ja01vZGVsU2VydmljZShbb3V0c2lkZU1vZGVsXSkgfSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHN5bWJvbDogJ091dHNpZGVTZWNyZXRNYXJrZXInLCBmaWxlUGF0aDogJy4uL291dHNpZGUudHMnLCBsaW5lQ29udGVudDogb3V0c2lkZUNvbnRlbnQgfSxcblx0XHRcdFx0XHRjb250ZXh0OiB7IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5wYXJzZSgnZmlsZTovLy9zZXNzaW9uLWRpcicpIH0sXG5cdFx0XHRcdH0gYXMgdW5rbm93biBhcyBJVG9vbEludm9jYXRpb24sXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gZ2V0VGV4dENvbnRlbnQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdQcm92aWRlIGVpdGhlcicpKTtcblx0XHRcdGFzc2VydC5vayghdGV4dC5pbmNsdWRlcyhvdXRzaWRlQ29udGVudCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RlZFVyaXMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxhQUFhO0FBR3RCLFNBQVMsK0JBQStCO0FBR3hDLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsV0FBd0QsY0FBYyx1QkFBdUI7QUFDdEcsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxlQUFlLFFBQTZCO0FBQ3BELFFBQU0sT0FBTyxPQUFPLFFBQVEsS0FBSyxDQUFDLE1BQWdDLEVBQUUsU0FBUyxNQUFNO0FBQ25GLFNBQU8sTUFBTSxTQUFTO0FBQ3ZCO0FBRUEsTUFBTSxjQUFjLE1BQU07QUFFekIsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLE1BQUk7QUFFSixRQUFNLFVBQVUsSUFBSSxNQUFNLHNCQUFzQjtBQUNoRCxRQUFNLGNBQWM7QUFBQSxJQUNuQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRCxFQUFFLEtBQUssSUFBSTtBQUVYLFdBQVMsdUJBQXVCLFFBQXNDO0FBQ3JFLFdBQU87QUFBQSxNQUNOLGVBQWU7QUFBQSxNQUNmLFVBQVUsQ0FBQyxRQUFhLFFBQVEsS0FBSyxPQUFLLEVBQUUsSUFBSSxTQUFTLE1BQU0sSUFBSSxTQUFTLENBQUMsS0FBSztBQUFBLElBQ25GO0FBQUEsRUFDRDtBQUVBLFdBQVMsd0JBQXdCLFlBQXFFO0FBQ3JHLFdBQU87QUFBQSxNQUNOLGVBQWU7QUFBQSxNQUNmLFlBQVksT0FBTyxVQUFzQixhQUFhLEtBQUssS0FBSyxFQUFFLFNB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
