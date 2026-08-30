import assert from "assert";
import { withAsyncTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { StickyScrollController } from "../../browser/stickyScrollController.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { SymbolKind } from "../../../../common/languages.js";
import { StickyLineCandidate, StickyLineCandidateProvider } from "../../browser/stickyScrollProvider.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from "../../../../common/services/languageFeatureDebounce.js";
import { TestLanguageConfigurationService } from "../../../../test/common/modes/testLanguageConfigurationService.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
suite("Sticky Scroll Tests", () => {
  const disposables = new DisposableStore();
  const serviceCollection = new ServiceCollection(
    [ILanguageFeaturesService, new LanguageFeaturesService()],
    [ILogService, new NullLogService()],
    [IContextMenuService, new class extends mock() {
    }()],
    [ILanguageConfigurationService, new TestLanguageConfigurationService()],
    [IEnvironmentService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.isBuilt = true;
        this.isExtensionDevelopment = false;
      }
    }()],
    [ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService)]
  );
  const text = [
    "function foo() {",
    "",
    "}",
    "/* comment related to TestClass",
    " end of the comment */",
    "@classDecorator",
    "class TestClass {",
    "// comment related to the function functionOfClass",
    "functionOfClass(){",
    "function function1(){",
    "}",
    "}}",
    "function bar() { function insideBar() {}",
    "}"
  ].join("\n");
  setup(() => {
    disposables.clear();
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function documentSymbolProviderForTestModel() {
    return {
      provideDocumentSymbols() {
        return [
          {
            name: "foo",
            detail: "foo",
            kind: SymbolKind.Function,
            tags: [],
            range: { startLineNumber: 1, endLineNumber: 3, startColumn: 1, endColumn: 1 },
            selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 }
          },
          {
            name: "TestClass",
            detail: "TestClass",
            kind: SymbolKind.Class,
            tags: [],
            range: { startLineNumber: 4, endLineNumber: 12, startColumn: 1, endColumn: 1 },
            selectionRange: { startLineNumber: 7, endLineNumber: 7, startColumn: 1, endColumn: 1 },
            children: [
              {
                name: "functionOfClass",
                detail: "functionOfClass",
                kind: SymbolKind.Function,
                tags: [],
                range: { startLineNumber: 8, endLineNumber: 12, startColumn: 1, endColumn: 1 },
                selectionRange: { startLineNumber: 9, endLineNumber: 9, startColumn: 1, endColumn: 1 },
                children: [
                  {
                    name: "function1",
                    detail: "function1",
                    kind: SymbolKind.Function,
                    tags: [],
                    range: { startLineNumber: 10, endLineNumber: 11, startColumn: 1, endColumn: 1 },
                    selectionRange: { startLineNumber: 10, endLineNumber: 10, startColumn: 1, endColumn: 1 }
                  }
                ]
              }
            ]
          },
          {
            name: "bar",
            detail: "bar",
            kind: SymbolKind.Function,
            tags: [],
            range: { startLineNumber: 13, endLineNumber: 14, startColumn: 1, endColumn: 1 },
            selectionRange: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 },
            children: [
              {
                name: "insideBar",
                detail: "insideBar",
                kind: SymbolKind.Function,
                tags: [],
                range: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 },
                selectionRange: { startLineNumber: 13, endLineNumber: 13, startColumn: 1, endColumn: 1 }
              }
            ]
          }
        ];
      }
    };
  }
  test("Testing the function getCandidateStickyLinesIntersecting", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const model = createTextModel(text);
      await withAsyncTestCodeEditor(model, {
        stickyScroll: {
          enabled: true,
          maxLineCount: 5,
          defaultModel: "outlineModel"
        },
        envConfig: {
          outerHeight: 500
        },
        serviceCollection
      }, async (editor, _viewModel, instantiationService) => {
        const languageService = instantiationService.get(ILanguageFeaturesService);
        const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        disposables.add(languageService.documentSymbolProvider.register("*", documentSymbolProviderForTestModel()));
        const provider = new StickyLineCandidateProvider(editor, languageService, languageConfigurationService);
        await provider.update();
        assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 1, endLineNumber: 4 }), [new StickyLineCandidate(1, 2, 0, 19)]);
        assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 8, endLineNumber: 10 }), [new StickyLineCandidate(7, 11, 0, 19), new StickyLineCandidate(9, 11, 19, 19)]);
        assert.deepStrictEqual(provider.getCandidateStickyLinesIntersecting({ startLineNumber: 10, endLineNumber: 13 }), [new StickyLineCandidate(7, 11, 0, 19), new StickyLineCandidate(9, 11, 19, 19)]);
        provider.dispose();
        model.dispose();
      });
    });
  });
  test("issue #157180: Render the correct line corresponding to the scope definition", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const model = createTextModel(text);
      await withAsyncTestCodeEditor(model, {
        stickyScroll: {
          enabled: true,
          maxLineCount: 5,
          defaultModel: "outlineModel"
        },
        envConfig: {
          outerHeight: 500
        },
        serviceCollection
      }, async (editor, _viewModel, instantiationService) => {
        const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
        const lineHeight = editor.getOption(EditorOption.lineHeight);
        const languageService = instantiationService.get(ILanguageFeaturesService);
        disposables.add(languageService.documentSymbolProvider.register("*", documentSymbolProviderForTestModel()));
        await stickyScrollController.stickyScrollCandidateProvider.update();
        let state;
        editor.setScrollTop(1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [1]);
        editor.setScrollTop(lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [1]);
        editor.setScrollTop(4 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, []);
        editor.setScrollTop(8 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [7, 9]);
        editor.setScrollTop(9 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [7, 9]);
        editor.setScrollTop(10 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [7]);
        stickyScrollController.dispose();
        stickyScrollController.stickyScrollCandidateProvider.dispose();
        model.dispose();
      });
    });
  });
  test("issue #156268 : Do not reveal sticky lines when they are in a folded region ", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const model = createTextModel(text);
      await withAsyncTestCodeEditor(model, {
        stickyScroll: {
          enabled: true,
          maxLineCount: 5,
          defaultModel: "outlineModel"
        },
        envConfig: {
          outerHeight: 500
        },
        serviceCollection
      }, async (editor, viewModel, instantiationService) => {
        const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
        const lineHeight = editor.getOption(EditorOption.lineHeight);
        const languageService = instantiationService.get(ILanguageFeaturesService);
        disposables.add(languageService.documentSymbolProvider.register("*", documentSymbolProviderForTestModel()));
        await stickyScrollController.stickyScrollCandidateProvider.update();
        editor.setHiddenAreas([{ startLineNumber: 2, endLineNumber: 2, startColumn: 1, endColumn: 1 }, { startLineNumber: 10, endLineNumber: 11, startColumn: 1, endColumn: 1 }]);
        let state;
        editor.setScrollTop(1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [1]);
        editor.setScrollTop(lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, []);
        editor.setScrollTop(6 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [7, 9]);
        editor.setScrollTop(7 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [7]);
        editor.setScrollTop(10 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, []);
        stickyScrollController.dispose();
        stickyScrollController.stickyScrollCandidateProvider.dispose();
        model.dispose();
      });
    });
  });
  const textWithScopesWithSameStartingLines = [
    "class TestClass { foo() {",
    "function bar(){",
    "",
    "}}",
    "}",
    ""
  ].join("\n");
  function documentSymbolProviderForSecondTestModel() {
    return {
      provideDocumentSymbols() {
        return [
          {
            name: "TestClass",
            detail: "TestClass",
            kind: SymbolKind.Class,
            tags: [],
            range: { startLineNumber: 1, endLineNumber: 5, startColumn: 1, endColumn: 1 },
            selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 },
            children: [
              {
                name: "foo",
                detail: "foo",
                kind: SymbolKind.Function,
                tags: [],
                range: { startLineNumber: 1, endLineNumber: 4, startColumn: 1, endColumn: 1 },
                selectionRange: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 },
                children: [
                  {
                    name: "bar",
                    detail: "bar",
                    kind: SymbolKind.Function,
                    tags: [],
                    range: { startLineNumber: 2, endLineNumber: 4, startColumn: 1, endColumn: 1 },
                    selectionRange: { startLineNumber: 2, endLineNumber: 2, startColumn: 1, endColumn: 1 },
                    children: []
                  }
                ]
              }
            ]
          }
        ];
      }
    };
  }
  test("issue #159271 : render the correct widget state when the child scope starts on the same line as the parent scope", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const model = createTextModel(textWithScopesWithSameStartingLines);
      await withAsyncTestCodeEditor(model, {
        stickyScroll: {
          enabled: true,
          maxLineCount: 5,
          defaultModel: "outlineModel"
        },
        envConfig: {
          outerHeight: 500
        },
        serviceCollection
      }, async (editor, _viewModel, instantiationService) => {
        const stickyScrollController = editor.registerAndInstantiateContribution(StickyScrollController.ID, StickyScrollController);
        await stickyScrollController.stickyScrollCandidateProvider.update();
        const lineHeight = editor.getOption(EditorOption.lineHeight);
        const languageService = instantiationService.get(ILanguageFeaturesService);
        disposables.add(languageService.documentSymbolProvider.register("*", documentSymbolProviderForSecondTestModel()));
        await stickyScrollController.stickyScrollCandidateProvider.update();
        let state;
        editor.setScrollTop(1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [1, 2]);
        editor.setScrollTop(lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [1, 2]);
        editor.setScrollTop(2 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [1]);
        editor.setScrollTop(3 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, [1]);
        editor.setScrollTop(4 * lineHeight + 1);
        state = stickyScrollController.findScrollWidgetState();
        assert.deepStrictEqual(state.startLineNumbers, []);
        stickyScrollController.dispose();
        stickyScrollController.stickyScrollCandidateProvider.dispose();
        model.dispose();
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN0aWNreVNjcm9sbFxcdGVzdFxcYnJvd3Nlclxcc3RpY2t5U2Nyb2xsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgU3RpY2t5U2Nyb2xsQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRTeW1ib2wsIFN5bWJvbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFN0aWNreUxpbmVDYW5kaWRhdGUsIFN0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3RpY2t5U2Nyb2xsUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsIExhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL21vZGVzL3Rlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5zdWl0ZSgnU3RpY2t5IFNjcm9sbCBUZXN0cycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdCBzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRbSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKV0sXG5cdFx0W0lMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKV0sXG5cdFx0W0lDb250ZXh0TWVudVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNvbnRleHRNZW51U2VydmljZT4oKSB7IH1dLFxuXHRcdFtJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCldLFxuXHRcdFtJRW52aXJvbm1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFbnZpcm9ubWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgaXNCdWlsdDogYm9vbGVhbiA9IHRydWU7XG5cdFx0XHRvdmVycmlkZSBpc0V4dGVuc2lvbkRldmVsb3BtZW50OiBib29sZWFuID0gZmFsc2U7XG5cdFx0fV0sXG5cdFx0W0lMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UpXSxcblx0KTtcblxuXHRjb25zdCB0ZXh0ID0gW1xuXHRcdCdmdW5jdGlvbiBmb28oKSB7Jyxcblx0XHQnJyxcblx0XHQnfScsXG5cdFx0Jy8qIGNvbW1lbnQgcmVsYXRlZCB0byBUZXN0Q2xhc3MnLFxuXHRcdCcgZW5kIG9mIHRoZSBjb21tZW50ICovJyxcblx0XHQnQGNsYXNzRGVjb3JhdG9yJyxcblx0XHQnY2xhc3MgVGVzdENsYXNzIHsnLFxuXHRcdCcvLyBjb21tZW50IHJlbGF0ZWQgdG8gdGhlIGZ1bmN0aW9uIGZ1bmN0aW9uT2ZDbGFzcycsXG5cdFx0J2Z1bmN0aW9uT2ZDbGFzcygpeycsXG5cdFx0J2Z1bmN0aW9uIGZ1bmN0aW9uMSgpeycsXG5cdFx0J30nLFxuXHRcdCd9fScsXG5cdFx0J2Z1bmN0aW9uIGJhcigpIHsgZnVuY3Rpb24gaW5zaWRlQmFyKCkge30nLFxuXHRcdCd9J1xuXHRdLmpvaW4oJ1xcbicpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGRvY3VtZW50U3ltYm9sUHJvdmlkZXJGb3JUZXN0TW9kZWwoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoKSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bmFtZTogJ2ZvbycsXG5cdFx0XHRcdFx0XHRkZXRhaWw6ICdmb28nLFxuXHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5GdW5jdGlvbixcblx0XHRcdFx0XHRcdHRhZ3M6IFtdLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBlbmRMaW5lTnVtYmVyOiAzLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiAxIH0sXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25SYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIGVuZExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfVxuXHRcdFx0XHRcdH0gYXMgRG9jdW1lbnRTeW1ib2wsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bmFtZTogJ1Rlc3RDbGFzcycsXG5cdFx0XHRcdFx0XHRkZXRhaWw6ICdUZXN0Q2xhc3MnLFxuXHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5DbGFzcyxcblx0XHRcdFx0XHRcdHRhZ3M6IFtdLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiA0LCBlbmRMaW5lTnVtYmVyOiAxMiwgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMSB9LFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uUmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiA3LCBlbmRMaW5lTnVtYmVyOiA3LCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiAxIH0sXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2Z1bmN0aW9uT2ZDbGFzcycsXG5cdFx0XHRcdFx0XHRcdFx0ZGV0YWlsOiAnZnVuY3Rpb25PZkNsYXNzJyxcblx0XHRcdFx0XHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkZ1bmN0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdHRhZ3M6IFtdLFxuXHRcdFx0XHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogOCwgZW5kTGluZU51bWJlcjogMTIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdFx0XHRzZWxlY3Rpb25SYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDksIGVuZExpbmVOdW1iZXI6IDksIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZnVuY3Rpb24xJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGV0YWlsOiAnZnVuY3Rpb24xJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5GdW5jdGlvbixcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMTAsIGVuZExpbmVOdW1iZXI6IDExLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiAxIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHNlbGVjdGlvblJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMTAsIGVuZExpbmVOdW1iZXI6IDEwLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiAxIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9IGFzIERvY3VtZW50U3ltYm9sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSBhcyBEb2N1bWVudFN5bWJvbCxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnYmFyJyxcblx0XHRcdFx0XHRcdGRldGFpbDogJ2JhcicsXG5cdFx0XHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkZ1bmN0aW9uLFxuXHRcdFx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEzLCBlbmRMaW5lTnVtYmVyOiAxNCwgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMSB9LFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uUmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxMywgZW5kTGluZU51bWJlcjogMTMsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnaW5zaWRlQmFyJyxcblx0XHRcdFx0XHRcdFx0XHRkZXRhaWw6ICdpbnNpZGVCYXInLFxuXHRcdFx0XHRcdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuRnVuY3Rpb24sXG5cdFx0XHRcdFx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxMywgZW5kTGluZU51bWJlcjogMTMsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdFx0XHRzZWxlY3Rpb25SYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEzLCBlbmRMaW5lTnVtYmVyOiAxMywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMSB9LFxuXHRcdFx0XHRcdFx0XHR9IGFzIERvY3VtZW50U3ltYm9sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSBhcyBEb2N1bWVudFN5bWJvbFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdUZXN0aW5nIHRoZSBmdW5jdGlvbiBnZXRDYW5kaWRhdGVTdGlja3lMaW5lc0ludGVyc2VjdGluZycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0KTtcblx0XHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKG1vZGVsLCB7XG5cdFx0XHRcdHN0aWNreVNjcm9sbDoge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0bWF4TGluZUNvdW50OiA1LFxuXHRcdFx0XHRcdGRlZmF1bHRNb2RlbDogJ291dGxpbmVNb2RlbCdcblx0XHRcdFx0fSxcblx0XHRcdFx0ZW52Q29uZmlnOiB7XG5cdFx0XHRcdFx0b3V0ZXJIZWlnaHQ6IDUwMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXJ2aWNlQ29sbGVjdGlvbjogc2VydmljZUNvbGxlY3Rpb25cblx0XHRcdH0sIGFzeW5jIChlZGl0b3IsIF92aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLnJlZ2lzdGVyKCcqJywgZG9jdW1lbnRTeW1ib2xQcm92aWRlckZvclRlc3RNb2RlbCgpKSk7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyOiBTdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXIgPSBuZXcgU3RpY2t5TGluZUNhbmRpZGF0ZVByb3ZpZGVyKGVkaXRvciwgbGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIudXBkYXRlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Q2FuZGlkYXRlU3RpY2t5TGluZXNJbnRlcnNlY3RpbmcoeyBzdGFydExpbmVOdW1iZXI6IDEsIGVuZExpbmVOdW1iZXI6IDQgfSksIFtuZXcgU3RpY2t5TGluZUNhbmRpZGF0ZSgxLCAyLCAwLCAxOSldKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRDYW5kaWRhdGVTdGlja3lMaW5lc0ludGVyc2VjdGluZyh7IHN0YXJ0TGluZU51bWJlcjogOCwgZW5kTGluZU51bWJlcjogMTAgfSksIFtuZXcgU3RpY2t5TGluZUNhbmRpZGF0ZSg3LCAxMSwgMCwgMTkpLCBuZXcgU3RpY2t5TGluZUNhbmRpZGF0ZSg5LCAxMSwgMTksIDE5KV0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldENhbmRpZGF0ZVN0aWNreUxpbmVzSW50ZXJzZWN0aW5nKHsgc3RhcnRMaW5lTnVtYmVyOiAxMCwgZW5kTGluZU51bWJlcjogMTMgfSksIFtuZXcgU3RpY2t5TGluZUNhbmRpZGF0ZSg3LCAxMSwgMCwgMTkpLCBuZXcgU3RpY2t5TGluZUNhbmRpZGF0ZSg5LCAxMSwgMTksIDE5KV0pO1xuXG5cdFx0XHRcdHByb3ZpZGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTcxODA6IFJlbmRlciB0aGUgY29ycmVjdCBsaW5lIGNvcnJlc3BvbmRpbmcgdG8gdGhlIHNjb3BlIGRlZmluaXRpb24nLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGV4dCk7XG5cdFx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihtb2RlbCwge1xuXHRcdFx0XHRzdGlja3lTY3JvbGw6IHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdG1heExpbmVDb3VudDogNSxcblx0XHRcdFx0XHRkZWZhdWx0TW9kZWw6ICdvdXRsaW5lTW9kZWwnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVudkNvbmZpZzoge1xuXHRcdFx0XHRcdG91dGVySGVpZ2h0OiA1MDBcblx0XHRcdFx0fSxcblx0XHRcdFx0c2VydmljZUNvbGxlY3Rpb25cblx0XHRcdH0sIGFzeW5jIChlZGl0b3IsIF92aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cblx0XHRcdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsQ29udHJvbGxlcjogU3RpY2t5U2Nyb2xsQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFN0aWNreVNjcm9sbENvbnRyb2xsZXIuSUQsIFN0aWNreVNjcm9sbENvbnRyb2xsZXIpO1xuXHRcdFx0XHRjb25zdCBsaW5lSGVpZ2h0OiBudW1iZXIgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLnJlZ2lzdGVyKCcqJywgZG9jdW1lbnRTeW1ib2xQcm92aWRlckZvclRlc3RNb2RlbCgpKSk7XG5cdFx0XHRcdGF3YWl0IHN0aWNreVNjcm9sbENvbnRyb2xsZXIuc3RpY2t5U2Nyb2xsQ2FuZGlkYXRlUHJvdmlkZXIudXBkYXRlKCk7XG5cdFx0XHRcdGxldCBzdGF0ZTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKDEpO1xuXHRcdFx0XHRzdGF0ZSA9IHN0aWNreVNjcm9sbENvbnRyb2xsZXIuZmluZFNjcm9sbFdpZGdldFN0YXRlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuc3RhcnRMaW5lTnVtYmVycywgWzFdKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKGxpbmVIZWlnaHQgKyAxKTtcblx0XHRcdFx0c3RhdGUgPSBzdGlja3lTY3JvbGxDb250cm9sbGVyLmZpbmRTY3JvbGxXaWRnZXRTdGF0ZSgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnN0YXJ0TGluZU51bWJlcnMsIFsxXSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCg0ICogbGluZUhlaWdodCArIDEpO1xuXHRcdFx0XHRzdGF0ZSA9IHN0aWNreVNjcm9sbENvbnRyb2xsZXIuZmluZFNjcm9sbFdpZGdldFN0YXRlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuc3RhcnRMaW5lTnVtYmVycywgW10pO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTY3JvbGxUb3AoOCAqIGxpbmVIZWlnaHQgKyAxKTtcblx0XHRcdFx0c3RhdGUgPSBzdGlja3lTY3JvbGxDb250cm9sbGVyLmZpbmRTY3JvbGxXaWRnZXRTdGF0ZSgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnN0YXJ0TGluZU51bWJlcnMsIFs3LCA5XSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCg5ICogbGluZUhlaWdodCArIDEpO1xuXHRcdFx0XHRzdGF0ZSA9IHN0aWNreVNjcm9sbENvbnRyb2xsZXIuZmluZFNjcm9sbFdpZGdldFN0YXRlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuc3RhcnRMaW5lTnVtYmVycywgWzcsIDldKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKDEwICogbGluZUhlaWdodCArIDEpO1xuXHRcdFx0XHRzdGF0ZSA9IHN0aWNreVNjcm9sbENvbnRyb2xsZXIuZmluZFNjcm9sbFdpZGdldFN0YXRlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuc3RhcnRMaW5lTnVtYmVycywgWzddKTtcblxuXHRcdFx0XHRzdGlja3lTY3JvbGxDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0c3RpY2t5U2Nyb2xsQ29udHJvbGxlci5zdGlja3lTY3JvbGxDYW5kaWRhdGVQcm92aWRlci5kaXNwb3NlKCk7XG5cdFx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTU2MjY4IDogRG8gbm90IHJldmVhbCBzdGlja3kgbGluZXMgd2hlbiB0aGV5IGFyZSBpbiBhIGZvbGRlZCByZWdpb24gJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKHRleHQpO1xuXHRcdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IobW9kZWwsIHtcblx0XHRcdFx0c3RpY2t5U2Nyb2xsOiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRtYXhMaW5lQ291bnQ6IDUsXG5cdFx0XHRcdFx0ZGVmYXVsdE1vZGVsOiAnb3V0bGluZU1vZGVsJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbnZDb25maWc6IHtcblx0XHRcdFx0XHRvdXRlckhlaWdodDogNTAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNlcnZpY2VDb2xsZWN0aW9uXG5cdFx0XHR9LCBhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cblx0XHRcdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsQ29udHJvbGxlcjogU3RpY2t5U2Nyb2xsQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFN0aWNreVNjcm9sbENvbnRyb2xsZXIuSUQsIFN0aWNreVNjcm9sbENvbnRyb2xsZXIpO1xuXHRcdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5yZWdpc3RlcignKicsIGRvY3VtZW50U3ltYm9sUHJvdmlkZXJGb3JUZXN0TW9kZWwoKSkpO1xuXHRcdFx0XHRhd2FpdCBzdGlja3lTY3JvbGxDb250cm9sbGVyLnN0aWNreVNjcm9sbENhbmRpZGF0ZVByb3ZpZGVyLnVwZGF0ZSgpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0SGlkZGVuQXJlYXMoW3sgc3RhcnRMaW5lTnVtYmVyOiAyLCBlbmRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiAxIH0sIHsgc3RhcnRMaW5lTnVtYmVyOiAxMCwgZW5kTGluZU51bWJlcjogMTEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfV0pO1xuXHRcdFx0XHRsZXQgc3RhdGU7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCgxKTtcblx0XHRcdFx0c3RhdGUgPSBzdGlja3lTY3JvbGxDb250cm9sbGVyLmZpbmRTY3JvbGxXaWRnZXRTdGF0ZSgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnN0YXJ0TGluZU51bWJlcnMsIFsxXSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcChsaW5lSGVpZ2h0ICsgMSk7XG5cdFx0XHRcdHN0YXRlID0gc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5maW5kU2Nyb2xsV2lkZ2V0U3RhdGUoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5zdGFydExpbmVOdW1iZXJzLCBbXSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCg2ICogbGluZUhlaWdodCArIDEpO1xuXHRcdFx0XHRzdGF0ZSA9IHN0aWNreVNjcm9sbENvbnRyb2xsZXIuZmluZFNjcm9sbFdpZGdldFN0YXRlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuc3RhcnRMaW5lTnVtYmVycywgWzcsIDldKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKDcgKiBsaW5lSGVpZ2h0ICsgMSk7XG5cdFx0XHRcdHN0YXRlID0gc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5maW5kU2Nyb2xsV2lkZ2V0U3RhdGUoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5zdGFydExpbmVOdW1iZXJzLCBbN10pO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTY3JvbGxUb3AoMTAgKiBsaW5lSGVpZ2h0ICsgMSk7XG5cdFx0XHRcdHN0YXRlID0gc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5maW5kU2Nyb2xsV2lkZ2V0U3RhdGUoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5zdGFydExpbmVOdW1iZXJzLCBbXSk7XG5cblx0XHRcdFx0c3RpY2t5U2Nyb2xsQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHRcdHN0aWNreVNjcm9sbENvbnRyb2xsZXIuc3RpY2t5U2Nyb2xsQ2FuZGlkYXRlUHJvdmlkZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uc3QgdGV4dFdpdGhTY29wZXNXaXRoU2FtZVN0YXJ0aW5nTGluZXMgPSBbXG5cdFx0J2NsYXNzIFRlc3RDbGFzcyB7IGZvbygpIHsnLFxuXHRcdCdmdW5jdGlvbiBiYXIoKXsnLFxuXHRcdCcnLFxuXHRcdCd9fScsXG5cdFx0J30nLFxuXHRcdCcnXG5cdF0uam9pbignXFxuJyk7XG5cblx0ZnVuY3Rpb24gZG9jdW1lbnRTeW1ib2xQcm92aWRlckZvclNlY29uZFRlc3RNb2RlbCgpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50U3ltYm9scygpIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnVGVzdENsYXNzJyxcblx0XHRcdFx0XHRcdGRldGFpbDogJ1Rlc3RDbGFzcycsXG5cdFx0XHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIGVuZExpbmVOdW1iZXI6IDUsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdHNlbGVjdGlvblJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgZW5kTGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMSB9LFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmb28nLFxuXHRcdFx0XHRcdFx0XHRcdGRldGFpbDogJ2ZvbycsXG5cdFx0XHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5GdW5jdGlvbixcblx0XHRcdFx0XHRcdFx0XHR0YWdzOiBbXSxcblx0XHRcdFx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIGVuZExpbmVOdW1iZXI6IDQsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdFx0XHRzZWxlY3Rpb25SYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIGVuZExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnYmFyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGV0YWlsOiAnYmFyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5GdW5jdGlvbixcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMiwgZW5kTGluZU51bWJlcjogNCwgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMSB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRzZWxlY3Rpb25SYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIsIGVuZExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtdXG5cdFx0XHRcdFx0XHRcdFx0XHR9IGFzIERvY3VtZW50U3ltYm9sXG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9IGFzIERvY3VtZW50U3ltYm9sLFxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0gYXMgRG9jdW1lbnRTeW1ib2xcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnaXNzdWUgIzE1OTI3MSA6IHJlbmRlciB0aGUgY29ycmVjdCB3aWRnZXQgc3RhdGUgd2hlbiB0aGUgY2hpbGQgc2NvcGUgc3RhcnRzIG9uIHRoZSBzYW1lIGxpbmUgYXMgdGhlIHBhcmVudCBzY29wZScsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0V2l0aFNjb3Blc1dpdGhTYW1lU3RhcnRpbmdMaW5lcyk7XG5cdFx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihtb2RlbCwge1xuXHRcdFx0XHRzdGlja3lTY3JvbGw6IHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdG1heExpbmVDb3VudDogNSxcblx0XHRcdFx0XHRkZWZhdWx0TW9kZWw6ICdvdXRsaW5lTW9kZWwnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVudkNvbmZpZzoge1xuXHRcdFx0XHRcdG91dGVySGVpZ2h0OiA1MDBcblx0XHRcdFx0fSxcblx0XHRcdFx0c2VydmljZUNvbGxlY3Rpb25cblx0XHRcdH0sIGFzeW5jIChlZGl0b3IsIF92aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cblx0XHRcdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsQ29udHJvbGxlcjogU3RpY2t5U2Nyb2xsQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFN0aWNreVNjcm9sbENvbnRyb2xsZXIuSUQsIFN0aWNreVNjcm9sbENvbnRyb2xsZXIpO1xuXHRcdFx0XHRhd2FpdCBzdGlja3lTY3JvbGxDb250cm9sbGVyLnN0aWNreVNjcm9sbENhbmRpZGF0ZVByb3ZpZGVyLnVwZGF0ZSgpO1xuXHRcdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5yZWdpc3RlcignKicsIGRvY3VtZW50U3ltYm9sUHJvdmlkZXJGb3JTZWNvbmRUZXN0TW9kZWwoKSkpO1xuXHRcdFx0XHRhd2FpdCBzdGlja3lTY3JvbGxDb250cm9sbGVyLnN0aWNreVNjcm9sbENhbmRpZGF0ZVByb3ZpZGVyLnVwZGF0ZSgpO1xuXHRcdFx0XHRsZXQgc3RhdGU7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCgxKTtcblx0XHRcdFx0c3RhdGUgPSBzdGlja3lTY3JvbGxDb250cm9sbGVyLmZpbmRTY3JvbGxXaWRnZXRTdGF0ZSgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnN0YXJ0TGluZU51bWJlcnMsIFsxLCAyXSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcChsaW5lSGVpZ2h0ICsgMSk7XG5cdFx0XHRcdHN0YXRlID0gc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5maW5kU2Nyb2xsV2lkZ2V0U3RhdGUoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5zdGFydExpbmVOdW1iZXJzLCBbMSwgMl0pO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTY3JvbGxUb3AoMiAqIGxpbmVIZWlnaHQgKyAxKTtcblx0XHRcdFx0c3RhdGUgPSBzdGlja3lTY3JvbGxDb250cm9sbGVyLmZpbmRTY3JvbGxXaWRnZXRTdGF0ZSgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnN0YXJ0TGluZU51bWJlcnMsIFsxXSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCgzICogbGluZUhlaWdodCArIDEpO1xuXHRcdFx0XHRzdGF0ZSA9IHN0aWNreVNjcm9sbENvbnRyb2xsZXIuZmluZFNjcm9sbFdpZGdldFN0YXRlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuc3RhcnRMaW5lTnVtYmVycywgWzFdKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKDQgKiBsaW5lSGVpZ2h0ICsgMSk7XG5cdFx0XHRcdHN0YXRlID0gc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5maW5kU2Nyb2xsV2lkZ2V0U3RhdGUoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5zdGFydExpbmVOdW1iZXJzLCBbXSk7XG5cblx0XHRcdFx0c3RpY2t5U2Nyb2xsQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHRcdHN0aWNreVNjcm9sbENvbnRyb2xsZXIuc3RpY2t5U2Nyb2xsQ2FuZGlkYXRlUHJvdmlkZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUF5QixrQkFBa0I7QUFDM0MsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUNBQWlDLHNDQUFzQztBQUNoRixTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLHVCQUF1QixNQUFNO0FBRWxDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxRQUFNLG9CQUFvQixJQUFJO0FBQUEsSUFDN0IsQ0FBQywwQkFBMEIsSUFBSSx3QkFBd0IsQ0FBQztBQUFBLElBQ3hELENBQUMsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUFBLElBQ2xDLENBQUMscUJBQXFCLElBQUksY0FBYyxLQUEwQixFQUFFO0FBQUEsSUFB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
