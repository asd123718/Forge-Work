import assert from "assert";
import { Barrier, timeout } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Range } from "../../../../common/core/range.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { LanguageFeatureDebounceService } from "../../../../common/services/languageFeatureDebounce.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { LanguageService } from "../../../../common/services/languageService.js";
import { ModelService } from "../../../../common/services/modelService.js";
import { SemanticTokensStylingService } from "../../../../common/services/semanticTokensStylingService.js";
import { DocumentSemanticTokensFeature } from "../../browser/documentSemanticTokens.js";
import { getDocumentSemanticTokens, isSemanticTokens } from "../../common/getSemanticTokens.js";
import { TestLanguageConfigurationService } from "../../../../test/common/modes/testLanguageConfigurationService.js";
import { TestTextResourcePropertiesService } from "../../../../test/common/services/testTextResourcePropertiesService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestDialogService } from "../../../../../platform/dialogs/test/common/testDialogService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { ColorScheme } from "../../../../../platform/theme/common/theme.js";
import { TestColorTheme, TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { UndoRedoService } from "../../../../../platform/undoRedo/common/undoRedoService.js";
import { ITreeSitterLibraryService } from "../../../../common/services/treeSitter/treeSitterLibraryService.js";
import { TestTreeSitterLibraryService } from "../../../../test/common/services/testTreeSitterLibraryService.js";
suite("ModelSemanticColoring", () => {
  const disposables = new DisposableStore();
  let modelService;
  let languageService;
  let languageFeaturesService;
  setup(() => {
    const configService = new TestConfigurationService({ editor: { semanticHighlighting: true } });
    const themeService = new TestThemeService();
    themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK, true));
    const logService = new NullLogService();
    languageFeaturesService = new LanguageFeaturesService();
    languageService = disposables.add(new LanguageService(false));
    const semanticTokensStylingService = disposables.add(new SemanticTokensStylingService(themeService, logService, languageService));
    const instantiationService = new TestInstantiationService();
    instantiationService.set(ILanguageService, languageService);
    instantiationService.set(ILanguageConfigurationService, new TestLanguageConfigurationService());
    instantiationService.set(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
    modelService = disposables.add(new ModelService(
      configService,
      new TestTextResourcePropertiesService(configService),
      new UndoRedoService(new TestDialogService(), new TestNotificationService()),
      instantiationService
    ));
    const envService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.isBuilt = true;
        this.isExtensionDevelopment = false;
      }
    }();
    disposables.add(new DocumentSemanticTokensFeature(semanticTokensStylingService, modelService, themeService, configService, new LanguageFeatureDebounceService(logService, envService), languageFeaturesService));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("DocumentSemanticTokens should be fetched when the result is empty if there are pending changes", async () => {
    await runWithFakedTimers({}, async () => {
      disposables.add(languageService.registerLanguage({ id: "testMode" }));
      const inFirstCall = new Barrier();
      const delayFirstResult = new Barrier();
      const secondResultProvided = new Barrier();
      let callCount = 0;
      disposables.add(languageFeaturesService.documentSemanticTokensProvider.register("testMode", new class {
        getLegend() {
          return { tokenTypes: ["class"], tokenModifiers: [] };
        }
        async provideDocumentSemanticTokens(model, lastResultId, token) {
          callCount++;
          if (callCount === 1) {
            assert.ok("called once");
            inFirstCall.open();
            await delayFirstResult.wait();
            await timeout(0);
            return null;
          }
          if (callCount === 2) {
            assert.ok("called twice");
            secondResultProvided.open();
            return null;
          }
          assert.fail("Unexpected call");
        }
        releaseDocumentSemanticTokens(resultId) {
        }
      }()));
      const textModel = disposables.add(modelService.createModel("Hello world", languageService.createById("testMode")));
      textModel.onBeforeAttached();
      await inFirstCall.wait();
      textModel.applyEdits([{ range: new Range(1, 1, 1, 1), text: "x" }]);
      delayFirstResult.open();
      await secondResultProvided.wait();
      assert.strictEqual(callCount, 2);
    });
  });
  test("issue #149412: VS Code hangs when bad semantic token data is received", async () => {
    await runWithFakedTimers({}, async () => {
      disposables.add(languageService.registerLanguage({ id: "testMode" }));
      let lastResult = null;
      disposables.add(languageFeaturesService.documentSemanticTokensProvider.register("testMode", new class {
        getLegend() {
          return { tokenTypes: ["class"], tokenModifiers: [] };
        }
        async provideDocumentSemanticTokens(model, lastResultId, token) {
          if (!lastResultId) {
            lastResult = {
              resultId: "1",
              data: new Uint32Array([4294967293, 0, 7, 16, 0, 1, 4, 3, 11, 1])
            };
          } else {
            lastResult = {
              resultId: "2",
              edits: [{
                start: 4294967276,
                deleteCount: 0,
                data: new Uint32Array([2, 0, 3, 11, 0])
              }]
            };
          }
          return lastResult;
        }
        releaseDocumentSemanticTokens(resultId) {
        }
      }()));
      const textModel = disposables.add(modelService.createModel("", languageService.createById("testMode")));
      textModel.onBeforeAttached();
      await Event.toPromise(textModel.onDidChangeTokens);
      assert.strictEqual(lastResult.resultId, "1");
      textModel.applyEdits([{ range: new Range(1, 1, 1, 1), text: "foo" }]);
      await Event.toPromise(textModel.onDidChangeTokens);
      assert.strictEqual(lastResult.resultId, "2");
    });
  });
  test("issue #161573: onDidChangeSemanticTokens doesn't consistently trigger provideDocumentSemanticTokens", async () => {
    await runWithFakedTimers({}, async () => {
      disposables.add(languageService.registerLanguage({ id: "testMode" }));
      const emitter = new Emitter();
      let requestCount = 0;
      disposables.add(languageFeaturesService.documentSemanticTokensProvider.register("testMode", new class {
        constructor() {
          this.onDidChange = emitter.event;
        }
        getLegend() {
          return { tokenTypes: ["class"], tokenModifiers: [] };
        }
        async provideDocumentSemanticTokens(model, lastResultId, token) {
          requestCount++;
          if (requestCount === 1) {
            await timeout(1e3);
            emitter.fire();
            await timeout(1e3);
            return null;
          }
          return null;
        }
        releaseDocumentSemanticTokens(resultId) {
        }
      }()));
      const textModel = disposables.add(modelService.createModel("", languageService.createById("testMode")));
      textModel.onBeforeAttached();
      await timeout(5e3);
      assert.deepStrictEqual(requestCount, 2);
    });
  });
  test("DocumentSemanticTokens should be pick the token provider with actual items", async () => {
    await runWithFakedTimers({}, async () => {
      let callCount = 0;
      disposables.add(languageService.registerLanguage({ id: "testMode2" }));
      disposables.add(languageFeaturesService.documentSemanticTokensProvider.register("testMode2", new class {
        getLegend() {
          return { tokenTypes: ["class1"], tokenModifiers: [] };
        }
        async provideDocumentSemanticTokens(model, lastResultId, token) {
          callCount++;
          if (lastResultId) {
            return {
              data: new Uint32Array([2, 1, 1, 1, 1, 0, 2, 1, 1, 1])
            };
          }
          return {
            resultId: "1",
            data: new Uint32Array([0, 1, 1, 1, 1, 0, 2, 1, 1, 1])
          };
        }
        releaseDocumentSemanticTokens(resultId) {
        }
      }()));
      disposables.add(languageFeaturesService.documentSemanticTokensProvider.register("testMode2", new class {
        getLegend() {
          return { tokenTypes: ["class2"], tokenModifiers: [] };
        }
        async provideDocumentSemanticTokens(model, lastResultId, token) {
          callCount++;
          return null;
        }
        releaseDocumentSemanticTokens(resultId) {
        }
      }()));
      function toArr(arr) {
        const result = [];
        for (let i = 0; i < arr.length; i++) {
          result[i] = arr[i];
        }
        return result;
      }
      const textModel = modelService.createModel("Hello world 2", languageService.createById("testMode2"));
      try {
        let result = await getDocumentSemanticTokens(languageFeaturesService.documentSemanticTokensProvider, textModel, null, null, CancellationToken.None);
        assert.ok(result, `We should have tokens (1)`);
        assert.ok(result.tokens, `Tokens are found from multiple providers (1)`);
        assert.ok(isSemanticTokens(result.tokens), `Tokens are full (1)`);
        assert.ok(result.tokens.resultId, `Token result id found from multiple providers (1)`);
        assert.deepStrictEqual(toArr(result.tokens.data), [0, 1, 1, 1, 1, 0, 2, 1, 1, 1], `Token data returned for multiple providers (1)`);
        assert.deepStrictEqual(callCount, 2, `Called both token providers (1)`);
        assert.deepStrictEqual(result.provider.getLegend(), { tokenTypes: ["class1"], tokenModifiers: [] }, `Legend matches the tokens (1)`);
        result = await getDocumentSemanticTokens(languageFeaturesService.documentSemanticTokensProvider, textModel, result.provider, result.tokens.resultId, CancellationToken.None);
        assert.ok(result, `We should have tokens (2)`);
        assert.ok(result.tokens, `Tokens are found from multiple providers (2)`);
        assert.ok(isSemanticTokens(result.tokens), `Tokens are full (2)`);
        assert.ok(!result.tokens.resultId, `Token result id found from multiple providers (2)`);
        assert.deepStrictEqual(toArr(result.tokens.data), [2, 1, 1, 1, 1, 0, 2, 1, 1, 1], `Token data returned for multiple providers (2)`);
        assert.deepStrictEqual(callCount, 4, `Called both token providers (2)`);
        assert.deepStrictEqual(result.provider.getLegend(), { tokenTypes: ["class1"], tokenModifiers: [] }, `Legend matches the tokens (2)`);
      } finally {
        disposables.clear();
        await timeout(0);
        textModel.dispose();
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNlbWFudGljVG9rZW5zXFx0ZXN0XFxicm93c2VyXFxkb2N1bWVudFNlbWFudGljVG9rZW5zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBCYXJyaWVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciwgU2VtYW50aWNUb2tlbnMsIFNlbWFudGljVG9rZW5zRWRpdHMsIFNlbWFudGljVG9rZW5zTGVnZW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VtYW50aWNUb2tlbnNTdHlsaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9zZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERvY3VtZW50U2VtYW50aWNUb2tlbnNGZWF0dXJlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9kb2N1bWVudFNlbWFudGljVG9rZW5zLmpzJztcbmltcG9ydCB7IGdldERvY3VtZW50U2VtYW50aWNUb2tlbnMsIGlzU2VtYW50aWNUb2tlbnMgfSBmcm9tICcuLi8uLi9jb21tb24vZ2V0U2VtYW50aWNUb2tlbnMuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9zZXJ2aWNlcy90ZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdERpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL3Rlc3QvY29tbW9uL3Rlc3REaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2xvclNjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29sb3JUaGVtZSwgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9zZXJ2aWNlcy90ZXN0VHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ01vZGVsU2VtYW50aWNDb2xvcmluZycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZTtcblx0bGV0IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblx0bGV0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgZWRpdG9yOiB7IHNlbWFudGljSGlnaGxpZ2h0aW5nOiB0cnVlIH0gfSk7XG5cdFx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gbmV3IFRlc3RUaGVtZVNlcnZpY2UoKTtcblx0XHR0aGVtZVNlcnZpY2Uuc2V0VGhlbWUobmV3IFRlc3RDb2xvclRoZW1lKHt9LCBDb2xvclNjaGVtZS5EQVJLLCB0cnVlKSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gbmV3IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKCk7XG5cdFx0bGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoZmFsc2UpKTtcblx0XHRjb25zdCBzZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlKHRoZW1lU2VydmljZSwgbG9nU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElMYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UsIG5ldyBUZXN0VHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlKCkpO1xuXHRcdG1vZGVsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9kZWxTZXJ2aWNlKFxuXHRcdFx0Y29uZmlnU2VydmljZSxcblx0XHRcdG5ldyBUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UoY29uZmlnU2VydmljZSksXG5cdFx0XHRuZXcgVW5kb1JlZG9TZXJ2aWNlKG5ldyBUZXN0RGlhbG9nU2VydmljZSgpLCBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSksXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZVxuXHRcdCkpO1xuXHRcdGNvbnN0IGVudlNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFbnZpcm9ubWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgaXNCdWlsdDogYm9vbGVhbiA9IHRydWU7XG5cdFx0XHRvdmVycmlkZSBpc0V4dGVuc2lvbkRldmVsb3BtZW50OiBib29sZWFuID0gZmFsc2U7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IERvY3VtZW50U2VtYW50aWNUb2tlbnNGZWF0dXJlKHNlbWFudGljVG9rZW5zU3R5bGluZ1NlcnZpY2UsIG1vZGVsU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlLCBuZXcgTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlKGxvZ1NlcnZpY2UsIGVudlNlcnZpY2UpLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnRG9jdW1lbnRTZW1hbnRpY1Rva2VucyBzaG91bGQgYmUgZmV0Y2hlZCB3aGVuIHRoZSByZXN1bHQgaXMgZW1wdHkgaWYgdGhlcmUgYXJlIHBlbmRpbmcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6ICd0ZXN0TW9kZScgfSkpO1xuXG5cdFx0XHRjb25zdCBpbkZpcnN0Q2FsbCA9IG5ldyBCYXJyaWVyKCk7XG5cdFx0XHRjb25zdCBkZWxheUZpcnN0UmVzdWx0ID0gbmV3IEJhcnJpZXIoKTtcblx0XHRcdGNvbnN0IHNlY29uZFJlc3VsdFByb3ZpZGVkID0gbmV3IEJhcnJpZXIoKTtcblx0XHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLnJlZ2lzdGVyKCd0ZXN0TW9kZScsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciB7XG5cdFx0XHRcdGdldExlZ2VuZCgpOiBTZW1hbnRpY1Rva2Vuc0xlZ2VuZCB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9rZW5UeXBlczogWydjbGFzcyddLCB0b2tlbk1vZGlmaWVyczogW10gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3luYyBwcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2Vucyhtb2RlbDogSVRleHRNb2RlbCwgbGFzdFJlc3VsdElkOiBzdHJpbmcgfCBudWxsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNlbWFudGljVG9rZW5zIHwgU2VtYW50aWNUb2tlbnNFZGl0cyB8IG51bGw+IHtcblx0XHRcdFx0XHRjYWxsQ291bnQrKztcblx0XHRcdFx0XHRpZiAoY2FsbENvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soJ2NhbGxlZCBvbmNlJyk7XG5cdFx0XHRcdFx0XHRpbkZpcnN0Q2FsbC5vcGVuKCk7XG5cdFx0XHRcdFx0XHRhd2FpdCBkZWxheUZpcnN0UmVzdWx0LndhaXQoKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIHdhaXQgZm9yIHRoZSBzaW1wbGUgc2NoZWR1bGVyIHRvIGZpcmUgdG8gY2hlY2sgdGhhdCB3ZSBkbyBhY3R1YWxseSBnZXQgcmVzY2hlZHVsZWRcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY2FsbENvdW50ID09PSAyKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soJ2NhbGxlZCB0d2ljZScpO1xuXHRcdFx0XHRcdFx0c2Vjb25kUmVzdWx0UHJvdmlkZWQub3BlbigpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIGNhbGwnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZWxlYXNlRG9jdW1lbnRTZW1hbnRpY1Rva2VucyhyZXN1bHRJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnSGVsbG8gd29ybGQnLCBsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZCgndGVzdE1vZGUnKSkpO1xuXHRcdFx0Ly8gcHJldGVuZCB0aGUgdGV4dCBtb2RlbCBpcyBhdHRhY2hlZCB0byBhbiBlZGl0b3IgKHNvIHRoYXQgc2VtYW50aWMgdG9rZW5zIGFyZSBjb21wdXRlZClcblx0XHRcdHRleHRNb2RlbC5vbkJlZm9yZUF0dGFjaGVkKCk7XG5cblx0XHRcdC8vIHdhaXQgZm9yIHRoZSBwcm92aWRlciB0byBiZSBjYWxsZWRcblx0XHRcdGF3YWl0IGluRmlyc3RDYWxsLndhaXQoKTtcblxuXHRcdFx0Ly8gdGhlIHByb3ZpZGVyIGlzIG5vdyBpbiB0aGUgcHJvdmlkZSBjYWxsXG5cdFx0XHQvLyBjaGFuZ2UgdGhlIHRleHQgYnVmZmVyIHdoaWxlIHRoZSBwcm92aWRlciBpcyBydW5uaW5nXG5cdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAneCcgfV0pO1xuXG5cdFx0XHQvLyBsZXQgdGhlIHByb3ZpZGVyIGZpbmlzaCBpdHMgZmlyc3QgcmVzdWx0XG5cdFx0XHRkZWxheUZpcnN0UmVzdWx0Lm9wZW4oKTtcblxuXHRcdFx0Ly8gd2UgbmVlZCB0byBjaGVjayB0aGF0IHRoZSBwcm92aWRlciBpcyBjYWxsZWQgYWdhaW4sIGV2ZW4gaWYgaXQgcmV0dXJucyBudWxsXG5cdFx0XHRhd2FpdCBzZWNvbmRSZXN1bHRQcm92aWRlZC53YWl0KCk7XG5cblx0XHRcdC8vIGFzc2VydCB0aGF0IGl0IGdvdCBjYWxsZWQgdHdpY2Vcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTQ5NDEyOiBWUyBDb2RlIGhhbmdzIHdoZW4gYmFkIHNlbWFudGljIHRva2VuIGRhdGEgaXMgcmVjZWl2ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiAndGVzdE1vZGUnIH0pKTtcblxuXHRcdFx0bGV0IGxhc3RSZXN1bHQ6IFNlbWFudGljVG9rZW5zIHwgU2VtYW50aWNUb2tlbnNFZGl0cyB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLnJlZ2lzdGVyKCd0ZXN0TW9kZScsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciB7XG5cdFx0XHRcdGdldExlZ2VuZCgpOiBTZW1hbnRpY1Rva2Vuc0xlZ2VuZCB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9rZW5UeXBlczogWydjbGFzcyddLCB0b2tlbk1vZGlmaWVyczogW10gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3luYyBwcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2Vucyhtb2RlbDogSVRleHRNb2RlbCwgbGFzdFJlc3VsdElkOiBzdHJpbmcgfCBudWxsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNlbWFudGljVG9rZW5zIHwgU2VtYW50aWNUb2tlbnNFZGl0cyB8IG51bGw+IHtcblx0XHRcdFx0XHRpZiAoIWxhc3RSZXN1bHRJZCkge1xuXHRcdFx0XHRcdFx0Ly8gdGhpcyBpcyB0aGUgZmlyc3QgY2FsbFxuXHRcdFx0XHRcdFx0bGFzdFJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0SWQ6ICcxJyxcblx0XHRcdFx0XHRcdFx0ZGF0YTogbmV3IFVpbnQzMkFycmF5KFs0Mjk0OTY3MjkzLCAwLCA3LCAxNiwgMCwgMSwgNCwgMywgMTEsIDFdKVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gdGhpcyBpcyB0aGUgc2Vjb25kIGNhbGxcblx0XHRcdFx0XHRcdGxhc3RSZXN1bHQgPSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdElkOiAnMicsXG5cdFx0XHRcdFx0XHRcdGVkaXRzOiBbe1xuXHRcdFx0XHRcdFx0XHRcdHN0YXJ0OiA0Mjk0OTY3Mjc2LFxuXHRcdFx0XHRcdFx0XHRcdGRlbGV0ZUNvdW50OiAwLFxuXHRcdFx0XHRcdFx0XHRcdGRhdGE6IG5ldyBVaW50MzJBcnJheShbMiwgMCwgMywgMTEsIDBdKVxuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGxhc3RSZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVsZWFzZURvY3VtZW50U2VtYW50aWNUb2tlbnMocmVzdWx0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIGxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCd0ZXN0TW9kZScpKSk7XG5cdFx0XHQvLyBwcmV0ZW5kIHRoZSB0ZXh0IG1vZGVsIGlzIGF0dGFjaGVkIHRvIGFuIGVkaXRvciAoc28gdGhhdCBzZW1hbnRpYyB0b2tlbnMgYXJlIGNvbXB1dGVkKVxuXHRcdFx0dGV4dE1vZGVsLm9uQmVmb3JlQXR0YWNoZWQoKTtcblxuXHRcdFx0Ly8gd2FpdCBmb3IgdGhlIHNlbWFudGljIHRva2VucyB0byBiZSBmZXRjaGVkXG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGV4dE1vZGVsLm9uRGlkQ2hhbmdlVG9rZW5zKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0UmVzdWx0IS5yZXN1bHRJZCwgJzEnKTtcblxuXHRcdFx0Ly8gZWRpdCB0aGUgdGV4dFxuXHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2ZvbycgfV0pO1xuXG5cdFx0XHQvLyB3YWl0IGZvciB0aGUgc2VtYW50aWMgdG9rZW5zIHRvIGJlIGZldGNoZWQgYWdhaW5cblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0ZXh0TW9kZWwub25EaWRDaGFuZ2VUb2tlbnMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RSZXN1bHQhLnJlc3VsdElkLCAnMicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTYxNTczOiBvbkRpZENoYW5nZVNlbWFudGljVG9rZW5zIGRvZXNuXFwndCBjb25zaXN0ZW50bHkgdHJpZ2dlciBwcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2VucycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6ICd0ZXN0TW9kZScgfSkpO1xuXG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdGxldCByZXF1ZXN0Q291bnQgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlci5yZWdpc3RlcigndGVzdE1vZGUnLCBuZXcgY2xhc3MgaW1wbGVtZW50cyBEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIge1xuXHRcdFx0XHRvbkRpZENoYW5nZSA9IGVtaXR0ZXIuZXZlbnQ7XG5cdFx0XHRcdGdldExlZ2VuZCgpOiBTZW1hbnRpY1Rva2Vuc0xlZ2VuZCB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9rZW5UeXBlczogWydjbGFzcyddLCB0b2tlbk1vZGlmaWVyczogW10gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3luYyBwcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2Vucyhtb2RlbDogSVRleHRNb2RlbCwgbGFzdFJlc3VsdElkOiBzdHJpbmcgfCBudWxsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNlbWFudGljVG9rZW5zIHwgU2VtYW50aWNUb2tlbnNFZGl0cyB8IG51bGw+IHtcblx0XHRcdFx0XHRyZXF1ZXN0Q291bnQrKztcblx0XHRcdFx0XHRpZiAocmVxdWVzdENvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXHRcdFx0XHRcdFx0Ly8gc2VuZCBhIGNoYW5nZSBldmVudFxuXHRcdFx0XHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlbGVhc2VEb2N1bWVudFNlbWFudGljVG9rZW5zKHJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZCgndGVzdE1vZGUnKSkpO1xuXHRcdFx0Ly8gcHJldGVuZCB0aGUgdGV4dCBtb2RlbCBpcyBhdHRhY2hlZCB0byBhbiBlZGl0b3IgKHNvIHRoYXQgc2VtYW50aWMgdG9rZW5zIGFyZSBjb21wdXRlZClcblx0XHRcdHRleHRNb2RlbC5vbkJlZm9yZUF0dGFjaGVkKCk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3RDb3VudCwgMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RvY3VtZW50U2VtYW50aWNUb2tlbnMgc2hvdWxkIGJlIHBpY2sgdGhlIHRva2VuIHByb3ZpZGVyIHdpdGggYWN0dWFsIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiAndGVzdE1vZGUyJyB9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLnJlZ2lzdGVyKCd0ZXN0TW9kZTInLCBuZXcgY2xhc3MgaW1wbGVtZW50cyBEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIge1xuXHRcdFx0XHRnZXRMZWdlbmQoKTogU2VtYW50aWNUb2tlbnNMZWdlbmQge1xuXHRcdFx0XHRcdHJldHVybiB7IHRva2VuVHlwZXM6IFsnY2xhc3MxJ10sIHRva2VuTW9kaWZpZXJzOiBbXSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzeW5jIHByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zKG1vZGVsOiBJVGV4dE1vZGVsLCBsYXN0UmVzdWx0SWQ6IHN0cmluZyB8IG51bGwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U2VtYW50aWNUb2tlbnMgfCBTZW1hbnRpY1Rva2Vuc0VkaXRzIHwgbnVsbD4ge1xuXHRcdFx0XHRcdGNhbGxDb3VudCsrO1xuXHRcdFx0XHRcdC8vIEZvciBhIHNlY29uZGFyeSByZXF1ZXN0IHJldHVybiBhIGRpZmZlcmVudCB2YWx1ZVxuXHRcdFx0XHRcdGlmIChsYXN0UmVzdWx0SWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGRhdGE6IG5ldyBVaW50MzJBcnJheShbMiwgMSwgMSwgMSwgMSwgMCwgMiwgMSwgMSwgMV0pXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0cmVzdWx0SWQ6ICcxJyxcblx0XHRcdFx0XHRcdGRhdGE6IG5ldyBVaW50MzJBcnJheShbMCwgMSwgMSwgMSwgMSwgMCwgMiwgMSwgMSwgMV0pXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZWxlYXNlRG9jdW1lbnRTZW1hbnRpY1Rva2VucyhyZXN1bHRJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIucmVnaXN0ZXIoJ3Rlc3RNb2RlMicsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciB7XG5cdFx0XHRcdGdldExlZ2VuZCgpOiBTZW1hbnRpY1Rva2Vuc0xlZ2VuZCB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9rZW5UeXBlczogWydjbGFzczInXSwgdG9rZW5Nb2RpZmllcnM6IFtdIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0YXN5bmMgcHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnMobW9kZWw6IElUZXh0TW9kZWwsIGxhc3RSZXN1bHRJZDogc3RyaW5nIHwgbnVsbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTZW1hbnRpY1Rva2VucyB8IFNlbWFudGljVG9rZW5zRWRpdHMgfCBudWxsPiB7XG5cdFx0XHRcdFx0Y2FsbENvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVsZWFzZURvY3VtZW50U2VtYW50aWNUb2tlbnMocmVzdWx0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGZ1bmN0aW9uIHRvQXJyKGFycjogVWludDMyQXJyYXkpOiBudW1iZXJbXSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRyZXN1bHRbaV0gPSBhcnJbaV07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCdIZWxsbyB3b3JsZCAyJywgbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoJ3Rlc3RNb2RlMicpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxldCByZXN1bHQgPSBhd2FpdCBnZXREb2N1bWVudFNlbWFudGljVG9rZW5zKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciwgdGV4dE1vZGVsLCBudWxsLCBudWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgYFdlIHNob3VsZCBoYXZlIHRva2VucyAoMSlgKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC50b2tlbnMsIGBUb2tlbnMgYXJlIGZvdW5kIGZyb20gbXVsdGlwbGUgcHJvdmlkZXJzICgxKWApO1xuXHRcdFx0XHRhc3NlcnQub2soaXNTZW1hbnRpY1Rva2VucyhyZXN1bHQudG9rZW5zKSwgYFRva2VucyBhcmUgZnVsbCAoMSlgKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC50b2tlbnMucmVzdWx0SWQsIGBUb2tlbiByZXN1bHQgaWQgZm91bmQgZnJvbSBtdWx0aXBsZSBwcm92aWRlcnMgKDEpYCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnIocmVzdWx0LnRva2Vucy5kYXRhKSwgWzAsIDEsIDEsIDEsIDEsIDAsIDIsIDEsIDEsIDFdLCBgVG9rZW4gZGF0YSByZXR1cm5lZCBmb3IgbXVsdGlwbGUgcHJvdmlkZXJzICgxKWApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxDb3VudCwgMiwgYENhbGxlZCBib3RoIHRva2VuIHByb3ZpZGVycyAoMSlgKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQucHJvdmlkZXIuZ2V0TGVnZW5kKCksIHsgdG9rZW5UeXBlczogWydjbGFzczEnXSwgdG9rZW5Nb2RpZmllcnM6IFtdIH0sIGBMZWdlbmQgbWF0Y2hlcyB0aGUgdG9rZW5zICgxKWApO1xuXG5cdFx0XHRcdC8vIE1ha2UgYSBzZWNvbmQgcmVxdWVzdC4gTWFrZSBzdXJlIHdlIGdldCB0aGUgc2Vjb25kYXJ5IHZhbHVlXG5cdFx0XHRcdHJlc3VsdCA9IGF3YWl0IGdldERvY3VtZW50U2VtYW50aWNUb2tlbnMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLCB0ZXh0TW9kZWwsIHJlc3VsdC5wcm92aWRlciwgcmVzdWx0LnRva2Vucy5yZXN1bHRJZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQsIGBXZSBzaG91bGQgaGF2ZSB0b2tlbnMgKDIpYCk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQudG9rZW5zLCBgVG9rZW5zIGFyZSBmb3VuZCBmcm9tIG11bHRpcGxlIHByb3ZpZGVycyAoMilgKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGlzU2VtYW50aWNUb2tlbnMocmVzdWx0LnRva2VucyksIGBUb2tlbnMgYXJlIGZ1bGwgKDIpYCk7XG5cdFx0XHRcdGFzc2VydC5vayghcmVzdWx0LnRva2Vucy5yZXN1bHRJZCwgYFRva2VuIHJlc3VsdCBpZCBmb3VuZCBmcm9tIG11bHRpcGxlIHByb3ZpZGVycyAoMilgKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycihyZXN1bHQudG9rZW5zLmRhdGEpLCBbMiwgMSwgMSwgMSwgMSwgMCwgMiwgMSwgMSwgMV0sIGBUb2tlbiBkYXRhIHJldHVybmVkIGZvciBtdWx0aXBsZSBwcm92aWRlcnMgKDIpYCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbENvdW50LCA0LCBgQ2FsbGVkIGJvdGggdG9rZW4gcHJvdmlkZXJzICgyKWApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5wcm92aWRlci5nZXRMZWdlbmQoKSwgeyB0b2tlblR5cGVzOiBbJ2NsYXNzMSddLCB0b2tlbk1vZGlmaWVyczogW10gfSwgYExlZ2VuZCBtYXRjaGVzIHRoZSB0b2tlbnMgKDIpYCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRcdC8vIFdhaXQgZm9yIHNjaGVkdWxlciB0byBmaW5pc2hcblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0XHQvLyBOb3cgZGlzcG9zZSB0aGUgdGV4dCBtb2RlbFxuXHRcdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWTtBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFFdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFFOUMsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUywyQkFBMkIsd0JBQXdCO0FBQzVELFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCLHdCQUF3QjtBQUNqRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9DQUFvQztBQUU3QyxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxVQUFNLGdCQUFnQixJQUFJLHlCQUF5QixFQUFFLFFBQVEsRUFBRSxzQkFBc0IsS0FBSyxFQUFFLENBQUM7QUFDN0YsVUFBTSxlQUFlLElBQUksaUJBQWlCO0FBQzFDLGlCQUFhLFNBQVMsSUFBSSxlQUFlLENBQUMsR0FBRyxZQUFZLE1BQU0sSUFBSSxDQUFDO0FBQ3BFLFVBQU0sYUFBYSxJQUFJLGVBQWU7QUFDdEMsOEJBQTBCLElBQUksd0JBQXdCO0FBQ3RELHNCQUFrQixZQUFZLElBQUksSUFBSSxnQkFBZ0IsS0FBSyxDQUFDO0FBQzVELFVBQU0sK0JBQStCLFlBQVksSUFBSSxJQUFJLDZCQUE2QixjQUFjLFlBQVksZUFBZSxDQUFDO0FBQ2hJLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQzFELHlCQUFxQixJQUFJLGtCQUFrQixlQUFlO0FBQzFELHlCQUFxQixJQUFJLCtCQUErQixJQUFJLGlDQUFpQyxDQUFDO0FBQzlGLHlCQUFxQixJQUFJLDJCQUEyQixJQUFJLDZCQUE2QixDQUFDO0FBQ3RGLG1CQUFlLFlBQVksSUFBSSxJQUFJO0FBQUEsTUFDbEM7QUFBQSxNQUNBLElBQUksa0NBQWtDLGFBQWE7QUFBQSxNQUNuRCxJQUFJLGdCQUFnQixJQUFJLGtCQUFrQixHQUFHLElBQUksd0JBQXdCLENBQUM7QUFBQSxNQUMxRTtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sYUFBYSxJQUFJLGNBQWMsS0FBMEIsRUFBRTtBQUFBLE1BQTFDO0FBQUE7QUFDdEIsYUFBUyxVQUFtQjtBQUM1QixhQUFTLHlCQUFrQztBQUFBO0FBQUEsSUFDNUM7QUFDQSxnQkFBWSxJQUFJLElBQUksOEJBQThCLDhCQUE4QixjQUFjLGNBQWMsZUFBZSxJQUFJLCtCQUErQixZQUFZLFVBQVUsR0FBRyx1QkFBdUIsQ0FBQztBQUFBLEVBQ2hOLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxnQkFBWSxNQUFNO0FBQUEsRUFDbkIsQ0FBQztBQUVELDBDQUF3QztBQUV4QyxPQUFLLGtHQUFrRyxZQUFZO0FBQ2xILFVBQU0sbUJBQW1CLENBQUMsR0FBRyxZQUFZO0FBRXhDLGtCQUFZLElBQUksZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksV0FBVyxDQUFDLENBQUM7QUFFcEUsWUFBTSxjQUFjLElBQUksUUFBUTtBQUNoQyxZQUFNLG1CQUFtQixJQUFJLFFBQVE7QUFDckMsWUFBTSx1QkFBdUIsSUFBSSxRQUFRO0FBQ3pDLFVBQUksWUFBWTtBQUVoQixrQkFBWSxJQUFJLHdCQUF3QiwrQkFBK0IsU0FBUyxZQUFZLElBQUksTUFBZ0Q7QUFBQSxRQUMvSSxZQUFrQztBQUNqQyxpQkFBTyxFQUFFLFlBQVksQ0FBQyxPQUFPLEdBQUcsZ0JBQWdCLENBQUMsRUFBRTtBQUFBLFFBQ3BEO0FBQUEsUUFDQSxNQUFNLDhCQUE4QixPQUFtQixjQUE2QixPQUFnRjtBQUNuSztBQUNBLGNBQUksY0FBYyxHQUFHO0FBQ3BCLG1CQUFPLEdBQUcsYUFBYTtBQUN2Qix3QkFBWSxLQUFLO0FBQ2pCLGtCQUFNLGlCQUFpQixLQUFLO0FBQzVCLGtCQUFNLFFBQVEsQ0FBQztBQUNmLG1CQUFPO0FBQUEsVUFDUjtBQUNBLGNBQUksY0FBYyxHQUFHO0FBQ3BCLG1CQUFPLEdBQUcsY0FBYztBQUN4QixpQ0FBcUIsS0FBSztBQUMxQixtQkFBTztBQUFBLFVBQ1I7QUFDQSxpQkFBTyxLQUFLLGlCQUFpQjtBQUFBLFFBQzlCO0FBQUEsUUFDQSw4QkFBOEIsVUFBb0M7QUFBQSxRQUNsRTtBQUFBLE1BQ0QsR0FBQyxDQUFDO0FBRUYsWUFBTSxZQUFZLFlBQVksSUFBSSxhQUFhLFlBQVksZUFBZSxnQkFBZ0IsV0FBVyxVQUFVLENBQUMsQ0FBQztBQUVqSCxnQkFBVSxpQkFBaUI7QUFHM0IsWUFBTSxZQUFZLEtBQUs7QUFJdkIsZ0JBQVUsV0FBVyxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFHbEUsdUJBQWlCLEtBQUs7QUFHdEIsWUFBTSxxQkFBcUIsS0FBSztBQUdoQyxhQUFPLFlBQVksV0FBVyxDQUFDO0FBQUEsSUFDaEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUVBQXlFLFlBQVk7QUFDekYsVUFBTSxtQkFBbUIsQ0FBQyxHQUFHLFlBQVk7QUFFeEMsa0JBQVksSUFBSSxnQkFBZ0IsaUJBQWlCLEVBQUUsSUFBSSxXQUFXLENBQUMsQ0FBQztBQUVwRSxVQUFJLGFBQTBEO0FBRTlELGtCQUFZLElBQUksd0JBQXdCLCtCQUErQixTQUFTLFlBQVksSUFBSSxNQUFnRDtBQUFBLFFBQy9JLFlBQWtDO0FBQ2pDLGlCQUFPLEVBQUUsWUFBWSxDQUFDLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQyxFQUFFO0FBQUEsUUFDcEQ7QUFBQSxRQUNBLE1BQU0sOEJBQThCLE9BQW1CLGNBQTZCLE9BQWdGO0FBQ25LLGNBQUksQ0FBQyxjQUFjO0FBRWxCLHlCQUFhO0FBQUEsY0FDWixVQUFVO0FBQUEsY0FDVixNQUFNLElBQUksWUFBWSxDQUFDLFlBQVksR0FBRyxHQUFHLElBQUksR0FBRyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUFBLFlBQ2hFO0FBQUEsVUFDRCxPQUFPO0FBRU4seUJBQWE7QUFBQSxjQUNaLFVBQVU7QUFBQSxjQUNWLE9BQU8sQ0FBQztBQUFBLGdCQUNQLE9BQU87QUFBQSxnQkFDUCxhQUFhO0FBQUEsZ0JBQ2IsTUFBTSxJQUFJLFlBQVksQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUFBLGNBQ3ZDLENBQUM7QUFBQSxZQUNGO0FBQUEsVUFDRDtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0EsOEJBQThCLFVBQW9DO0FBQUEsUUFDbEU7QUFBQSxNQUNELEdBQUMsQ0FBQztBQUVGLFlBQU0sWUFBWSxZQUFZLElBQUksYUFBYSxZQUFZLElBQUksZ0JBQWdCLFdBQVcsVUFBVSxDQUFDLENBQUM7QUFFdEcsZ0JBQVUsaUJBQWlCO0FBRzNCLFlBQU0sTUFBTSxVQUFVLFVBQVUsaUJBQWlCO0FBQ2pELGFBQU8sWUFBWSxXQUFZLFVBQVUsR0FBRztBQUc1QyxnQkFBVSxXQUFXLENBQUMsRUFBRSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUdwRSxZQUFNLE1BQU0sVUFBVSxVQUFVLGlCQUFpQjtBQUNqRCxhQUFPLFlBQVksV0FBWSxVQUFVLEdBQUc7QUFBQSxJQUM3QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1R0FBd0csWUFBWTtBQUN4SCxVQUFNLG1CQUFtQixDQUFDLEdBQUcsWUFBWTtBQUV4QyxrQkFBWSxJQUFJLGdCQUFnQixpQkFBaUIsRUFBRSxJQUFJLFdBQVcsQ0FBQyxDQUFDO0FBRXBFLFlBQU0sVUFBVSxJQUFJLFFBQWM7QUFDbEMsVUFBSSxlQUFlO0FBQ25CLGtCQUFZLElBQUksd0JBQXdCLCtCQUErQixTQUFTLFlBQVksSUFBSSxNQUFnRDtBQUFBLFFBQWhEO0FBQy9GLDZCQUFjLFFBQVE7QUFBQTtBQUFBLFFBQ3RCLFlBQWtDO0FBQ2pDLGlCQUFPLEVBQUUsWUFBWSxDQUFDLE9BQU8sR0FBRyxnQkFBZ0IsQ0FBQyxFQUFFO0FBQUEsUUFDcEQ7QUFBQSxRQUNBLE1BQU0sOEJBQThCLE9BQW1CLGNBQTZCLE9BQWdGO0FBQ25LO0FBQ0EsY0FBSSxpQkFBaUIsR0FBRztBQUN2QixrQkFBTSxRQUFRLEdBQUk7QUFFbEIsb0JBQVEsS0FBSztBQUNiLGtCQUFNLFFBQVEsR0FBSTtBQUNsQixtQkFBTztBQUFBLFVBQ1I7QUFDQSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxRQUNBLDhCQUE4QixVQUFvQztBQUFBLFFBQ2xFO0FBQUEsTUFDRCxHQUFDLENBQUM7QUFFRixZQUFNLFlBQVksWUFBWSxJQUFJLGFBQWEsWUFBWSxJQUFJLGdCQUFnQixXQUFXLFVBQVUsQ0FBQyxDQUFDO0FBRXRHLGdCQUFVLGlCQUFpQjtBQUUzQixZQUFNLFFBQVEsR0FBSTtBQUNsQixhQUFPLGdCQUFnQixjQUFjLENBQUM7QUFBQSxJQUN2QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4RUFBOEUsWUFBWTtBQUM5RixVQUFNLG1CQUFtQixDQUFDLEdBQUcsWUFBWTtBQUV4QyxVQUFJLFlBQVk7QUFDaEIsa0JBQVksSUFBSSxnQkFBZ0IsaUJBQWlCLEVBQUUsSUFBSSxZQUFZLENBQUMsQ0FBQztBQUNyRSxrQkFBWSxJQUFJLHdCQUF3QiwrQkFBK0IsU0FBUyxhQUFhLElBQUksTUFBZ0Q7QUFBQSxRQUNoSixZQUFrQztBQUNqQyxpQkFBTyxFQUFFLFlBQVksQ0FBQyxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsRUFBRTtBQUFBLFFBQ3JEO0FBQUEsUUFDQSxNQUFNLDhCQUE4QixPQUFtQixjQUE2QixPQUFnRjtBQUNuSztBQUVBLGNBQUksY0FBYztBQUNqQixtQkFBTztBQUFBLGNBQ04sTUFBTSxJQUFJLFlBQVksQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRDtBQUFBLFVBQ0Q7QUFDQSxpQkFBTztBQUFBLFlBQ04sVUFBVTtBQUFBLFlBQ1YsTUFBTSxJQUFJLFlBQVksQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUNyRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLDhCQUE4QixVQUFvQztBQUFBLFFBQ2xFO0FBQUEsTUFDRCxHQUFDLENBQUM7QUFDRixrQkFBWSxJQUFJLHdCQUF3QiwrQkFBK0IsU0FBUyxhQUFhLElBQUksTUFBZ0Q7QUFBQSxRQUNoSixZQUFrQztBQUNqQyxpQkFBTyxFQUFFLFlBQVksQ0FBQyxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsRUFBRTtBQUFBLFFBQ3JEO0FBQUEsUUFDQSxNQUFNLDhCQUE4QixPQUFtQixjQUE2QixPQUFnRjtBQUNuSztBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0EsOEJBQThCLFVBQW9DO0FBQUEsUUFDbEU7QUFBQSxNQUNELEdBQUMsQ0FBQztBQUVGLGVBQVMsTUFBTSxLQUE0QjtBQUMxQyxjQUFNLFNBQW1CLENBQUM7QUFDMUIsaUJBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxRQUFRLEtBQUs7QUFDcEMsaUJBQU8sQ0FBQyxJQUFJLElBQUksQ0FBQztBQUFBLFFBQ2xCO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLFlBQVksYUFBYSxZQUFZLGlCQUFpQixnQkFBZ0IsV0FBVyxXQUFXLENBQUM7QUFDbkcsVUFBSTtBQUNILFlBQUksU0FBUyxNQUFNLDBCQUEwQix3QkFBd0IsZ0NBQWdDLFdBQVcsTUFBTSxNQUFNLGtCQUFrQixJQUFJO0FBQ2xKLGVBQU8sR0FBRyxRQUFRLDJCQUEyQjtBQUM3QyxlQUFPLEdBQUcsT0FBTyxRQUFRLDhDQUE4QztBQUN2RSxlQUFPLEdBQUcsaUJBQWlCLE9BQU8sTUFBTSxHQUFHLHFCQUFxQjtBQUNoRSxlQUFPLEdBQUcsT0FBTyxPQUFPLFVBQVUsbURBQW1EO0FBQ3JGLGVBQU8sZ0JBQWdCLE1BQU0sT0FBTyxPQUFPLElBQUksR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxnREFBZ0Q7QUFDbEksZUFBTyxnQkFBZ0IsV0FBVyxHQUFHLGlDQUFpQztBQUN0RSxlQUFPLGdCQUFnQixPQUFPLFNBQVMsVUFBVSxHQUFHLEVBQUUsWUFBWSxDQUFDLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxFQUFFLEdBQUcsK0JBQStCO0FBR25JLGlCQUFTLE1BQU0sMEJBQTBCLHdCQUF3QixnQ0FBZ0MsV0FBVyxPQUFPLFVBQVUsT0FBTyxPQUFPLFVBQVUsa0JBQWtCLElBQUk7QUFDM0ssZUFBTyxHQUFHLFFBQVEsMkJBQTJCO0FBQzdDLGVBQU8sR0FBRyxPQUFPLFFBQVEsOENBQThDO0FBQ3ZFLGVBQU8sR0FBRyxpQkFBaUIsT0FBTyxNQUFNLEdBQUcscUJBQXFCO0FBQ2hFLGVBQU8sR0FBRyxDQUFDLE9BQU8sT0FBTyxVQUFVLG1EQUFtRDtBQUN0RixlQUFPLGdCQUFnQixNQUFNLE9BQU8sT0FBTyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsZ0RBQWdEO0FBQ2xJLGVBQU8sZ0JBQWdCLFdBQVcsR0FBRyxpQ0FBaUM7QUFDdEUsZUFBTyxnQkFBZ0IsT0FBTyxTQUFTLFVBQVUsR0FBRyxFQUFFLFlBQVksQ0FBQyxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsRUFBRSxHQUFHLCtCQUErQjtBQUFBLE1BQ3BJLFVBQUU7QUFDRCxvQkFBWSxNQUFNO0FBR2xCLGNBQU0sUUFBUSxDQUFDO0FBR2Ysa0JBQVUsUUFBUTtBQUFBLE1BQ25CO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
