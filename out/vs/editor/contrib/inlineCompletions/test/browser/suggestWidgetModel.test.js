import { timeout } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { Range } from "../../../../common/core/range.js";
import { CompletionItemKind } from "../../../../common/languages.js";
import { IEditorWorkerService } from "../../../../common/services/editorWorker.js";
import { GhostTextContext } from "./utils.js";
import { SnippetController2 } from "../../../snippet/browser/snippetController2.js";
import { SuggestController } from "../../../suggest/browser/suggestController.js";
import { ISuggestMemoryService } from "../../../suggest/browser/suggestMemory.js";
import { withAsyncTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { MockKeybindingService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import assert from "assert";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { InlineCompletionsController } from "../../browser/controller/inlineCompletionsController.js";
import { autorun } from "../../../../../base/common/observable.js";
import { setUnexpectedErrorHandler } from "../../../../../base/common/errors.js";
import { IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { ModifierKeyEmitter } from "../../../../../base/browser/dom.js";
import { InlineSuggestionsView } from "../../browser/view/inlineSuggestionsView.js";
suite("Suggest Widget Model", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    setUnexpectedErrorHandler(function(err) {
      throw err;
    });
  });
  test.skip("Active", async () => {
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, context, model }) => {
        let last = void 0;
        const history = new Array();
        const d = autorun((reader) => {
          const selectedSuggestItem = !!model.debugGetSelectedSuggestItem().read(reader);
          if (last !== selectedSuggestItem) {
            last = selectedSuggestItem;
            history.push(last);
          }
        });
        context.keyboardType("h");
        const suggestController = editor.getContribution(SuggestController.ID);
        suggestController.triggerSuggest();
        await timeout(1e3);
        assert.deepStrictEqual(history.splice(0), [false, true]);
        context.keyboardType(".");
        await timeout(1e3);
        assert.deepStrictEqual(history.splice(0), []);
        suggestController.cancelSuggestWidget();
        await timeout(1e3);
        assert.deepStrictEqual(history.splice(0), [false]);
        d.dispose();
      }
    );
  });
  test("Ghost Text", async () => {
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider, suggest: { preview: true }, quickSuggestions: { other: "on", comments: "off", strings: "off" } },
      async ({ editor, editorViewModel, context, model }) => {
        context.keyboardType("h");
        const suggestController = editor.getContribution(SuggestController.ID);
        suggestController.triggerSuggest();
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["", "h[ello]"]);
        context.keyboardType(".");
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["h", "hello.[hello]"]);
        suggestController.cancelSuggestWidget();
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["hello."]);
      }
    );
  });
  test("offWhenInlineCompletions: conflicting inline completion does not render over the suggest widget", async () => {
    const inlineProvider = {
      provideInlineCompletions: () => ({ items: [{ insertText: "hi there", range: new Range(1, 1, 1, 2) }] }),
      disposeInlineCompletions: () => {
      }
    };
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      {
        fakeClock: true,
        provider,
        inlineProvider,
        quickSuggestions: { other: "offWhenInlineCompletions", comments: "off", strings: "off" }
      },
      async ({ editor, context, model }) => {
        context.keyboardType("h");
        const suggestController = editor.getContribution(SuggestController.ID);
        suggestController.triggerSuggest();
        model.triggerExplicitly();
        await timeout(1e3);
        assert.strictEqual(!!model.debugGetSelectedSuggestItem().get(), true);
        assert.deepStrictEqual(context.getAndClearViewStates(), [""]);
      }
    );
  });
});
const provider = {
  _debugDisplayName: "test",
  triggerCharacters: ["."],
  async provideCompletionItems(model, pos) {
    const word = model.getWordAtPosition(pos);
    const range = word ? { startLineNumber: 1, startColumn: word.startColumn, endLineNumber: 1, endColumn: word.endColumn } : Range.fromPositions(pos);
    return {
      suggestions: [{
        insertText: "hello",
        kind: CompletionItemKind.Text,
        label: "hello",
        range,
        commitCharacters: ["."]
      }]
    };
  }
};
async function withAsyncTestCodeEditorAndInlineCompletionsModel(text, options, callback) {
  await runWithFakedTimers({ useFakeTimers: options.fakeClock }, async () => {
    const disposableStore = new DisposableStore();
    try {
      const serviceCollection = new ServiceCollection(
        [ITelemetryService, NullTelemetryService],
        [ILogService, new NullLogService()],
        [IStorageService, disposableStore.add(new InMemoryStorageService())],
        [IKeybindingService, new MockKeybindingService()],
        [IEditorWorkerService, new class extends mock() {
          computeWordRanges() {
            return Promise.resolve({});
          }
        }()],
        [ISuggestMemoryService, new class extends mock() {
          memorize() {
          }
          select() {
            return 0;
          }
        }()],
        [IMenuService, new class extends mock() {
          createMenu() {
            return new class extends mock() {
              constructor() {
                super(...arguments);
                this.onDidChange = Event.None;
              }
              dispose() {
              }
            }();
          }
        }()],
        [ILabelService, new class extends mock() {
        }()],
        [IWorkspaceContextService, new class extends mock() {
        }()],
        // eslint-disable-next-line local/code-no-any-casts
        [IAccessibilitySignalService, {
          playSignal: async () => {
          },
          isSoundEnabled(signal) {
            return false;
          }
        }],
        [IDefaultAccountService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeDefaultAccount = Event.None;
            this.getDefaultAccount = async () => null;
            this.setDefaultAccountProvider = () => {
            };
          }
        }()]
      );
      if (options.provider || options.inlineProvider) {
        const languageFeaturesService = new LanguageFeaturesService();
        serviceCollection.set(ILanguageFeaturesService, languageFeaturesService);
        if (options.provider) {
          disposableStore.add(languageFeaturesService.completionProvider.register({ pattern: "**" }, options.provider));
        }
        if (options.inlineProvider) {
          disposableStore.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: "**" }, options.inlineProvider));
        }
      }
      await withAsyncTestCodeEditor(text, { ...options, serviceCollection }, async (editor, editorViewModel, instantiationService) => {
        instantiationService.stubInstance(InlineSuggestionsView, {
          dispose: () => {
          }
        });
        editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
        editor.registerAndInstantiateContribution(SuggestController.ID, SuggestController);
        editor.registerAndInstantiateContribution(InlineCompletionsController.ID, InlineCompletionsController);
        const model = InlineCompletionsController.get(editor)?.model.get();
        const context = new GhostTextContext(model, editor);
        await callback({ editor, editorViewModel, model, context });
        context.dispose();
      });
    } finally {
      disposableStore.dispose();
      ModifierKeyEmitter.disposeInstance();
    }
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFx0ZXN0XFxicm93c2VyXFxzdWdnZXN0V2lkZ2V0TW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld01vZGVsSW1wbC5qcyc7XG5pbXBvcnQgeyBHaG9zdFRleHRDb250ZXh0IH0gZnJvbSAnLi91dGlscy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElTdWdnZXN0TWVtb3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0TWVtb3J5LmpzJztcbmltcG9ydCB7IElUZXN0Q29kZUVkaXRvciwgVGVzdENvZGVFZGl0b3JJbnN0YW50aWF0aW9uT3B0aW9ucywgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IE1vY2tLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tb2RlbC9pbmxpbmVDb21wbGV0aW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IE1vZGlmaWVyS2V5RW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdGlvbnNWaWV3IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3L2lubGluZVN1Z2dlc3Rpb25zVmlldy5qcyc7XG5cbnN1aXRlKCdTdWdnZXN0IFdpZGdldCBNb2RlbCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoZnVuY3Rpb24gKGVycikge1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBUaGlzIHRlc3QgaXMgc2tpcHBlZCBiZWNhdXNlIHRoZSBmaXggZm9yIHRoaXMgY2F1c2VzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNjYwMjNcblx0dGVzdC5za2lwKCdBY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyLCB9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIGNvbnRleHQsIG1vZGVsIH0pID0+IHtcblx0XHRcdFx0bGV0IGxhc3Q6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnkgPSBuZXcgQXJyYXk8Ym9vbGVhbj4oKTtcblx0XHRcdFx0Y29uc3QgZCA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIGRlYnVnICovXG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRTdWdnZXN0SXRlbSA9ICEhbW9kZWwuZGVidWdHZXRTZWxlY3RlZFN1Z2dlc3RJdGVtKCkucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGlmIChsYXN0ICE9PSBzZWxlY3RlZFN1Z2dlc3RJdGVtKSB7XG5cdFx0XHRcdFx0XHRsYXN0ID0gc2VsZWN0ZWRTdWdnZXN0SXRlbTtcblx0XHRcdFx0XHRcdGhpc3RvcnkucHVzaChsYXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdoJyk7XG5cdFx0XHRcdGNvbnN0IHN1Z2dlc3RDb250cm9sbGVyID0gKGVkaXRvci5nZXRDb250cmlidXRpb24oU3VnZ2VzdENvbnRyb2xsZXIuSUQpIGFzIFN1Z2dlc3RDb250cm9sbGVyKTtcblx0XHRcdFx0c3VnZ2VzdENvbnRyb2xsZXIudHJpZ2dlclN1Z2dlc3QoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoaXN0b3J5LnNwbGljZSgwKSwgW2ZhbHNlLCB0cnVlXSk7XG5cblx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJy4nKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblxuXHRcdFx0XHQvLyBObyBmbGlja2VyIGhlcmVcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoaXN0b3J5LnNwbGljZSgwKSwgW10pO1xuXHRcdFx0XHRzdWdnZXN0Q29udHJvbGxlci5jYW5jZWxTdWdnZXN0V2lkZ2V0KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoaXN0b3J5LnNwbGljZSgwKSwgW2ZhbHNlXSk7XG5cblx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnR2hvc3QgVGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIsIHN1Z2dlc3Q6IHsgcHJldmlldzogdHJ1ZSB9LCBxdWlja1N1Z2dlc3Rpb25zOiB7IG90aGVyOiAnb24nLCBjb21tZW50czogJ29mZicsIHN0cmluZ3M6ICdvZmYnIH0gfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBjb250ZXh0LCBtb2RlbCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdoJyk7XG5cdFx0XHRcdGNvbnN0IHN1Z2dlc3RDb250cm9sbGVyID0gKGVkaXRvci5nZXRDb250cmlidXRpb24oU3VnZ2VzdENvbnRyb2xsZXIuSUQpIGFzIFN1Z2dlc3RDb250cm9sbGVyKTtcblx0XHRcdFx0c3VnZ2VzdENvbnRyb2xsZXIudHJpZ2dlclN1Z2dlc3QoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbJycsICdoW2VsbG9dJ10pO1xuXG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCcuJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWydoJywgJ2hlbGxvLltoZWxsb10nXSk7XG5cblx0XHRcdFx0c3VnZ2VzdENvbnRyb2xsZXIuY2FuY2VsU3VnZ2VzdFdpZGdldCgpO1xuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWydoZWxsby4nXSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zOiBjb25mbGljdGluZyBpbmxpbmUgY29tcGxldGlvbiBkb2VzIG5vdCByZW5kZXIgb3ZlciB0aGUgc3VnZ2VzdCB3aWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQW4gaW5saW5lIGNvbXBsZXRpb24gdGhhdCBkb2VzIG5vdCBhdWdtZW50IHRoZSBzdWdnZXN0IGl0ZW0gKFwiaGVsbG9cIikgPT4gYSBjb25mbGljdC5cblx0XHRjb25zdCBpbmxpbmVQcm92aWRlcjogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVJbmxpbmVDb21wbGV0aW9uczogKCkgPT4gKHsgaXRlbXM6IFt7IGluc2VydFRleHQ6ICdoaSB0aGVyZScsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMikgfV0gfSksXG5cdFx0XHRkaXNwb3NlSW5saW5lQ29tcGxldGlvbnM6ICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdHtcblx0XHRcdFx0ZmFrZUNsb2NrOiB0cnVlLFxuXHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0aW5saW5lUHJvdmlkZXIsXG5cdFx0XHRcdHF1aWNrU3VnZ2VzdGlvbnM6IHsgb3RoZXI6ICdvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMnLCBjb21tZW50czogJ29mZicsIHN0cmluZ3M6ICdvZmYnIH0sXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBjb250ZXh0LCBtb2RlbCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdoJyk7XG5cdFx0XHRcdGNvbnN0IHN1Z2dlc3RDb250cm9sbGVyID0gKGVkaXRvci5nZXRDb250cmlidXRpb24oU3VnZ2VzdENvbnRyb2xsZXIuSUQpIGFzIFN1Z2dlc3RDb250cm9sbGVyKTtcblx0XHRcdFx0c3VnZ2VzdENvbnRyb2xsZXIudHJpZ2dlclN1Z2dlc3QoKTtcblx0XHRcdFx0bW9kZWwudHJpZ2dlckV4cGxpY2l0bHkoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblxuXHRcdFx0XHQvLyBSZWdyZXNzaW9uIGd1YXJkOiB0aGUgZm9jdXNlZCBzdWdnZXN0IGl0ZW0gbXVzdCBiZSBleHBvc2VkIHRvIHRoZSBpbmxpbmUgbW9kZWxcblx0XHRcdFx0Ly8gZXZlbiB3aGVuIHF1aWNrU3VnZ2VzdGlvbnMgaXMgb2ZmV2hlbklubGluZUNvbXBsZXRpb25zLi4uXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCghIW1vZGVsLmRlYnVnR2V0U2VsZWN0ZWRTdWdnZXN0SXRlbSgpLmdldCgpLCB0cnVlKTtcblx0XHRcdFx0Ly8gLi4uc28gdGhlIGNvbmZsaWN0aW5nIGlubGluZSBjb21wbGV0aW9uIGlzIHN1cHByZXNzZWQgaW5zdGVhZCBvZiByZW5kZXJlZCBvdmVyIHRoZVxuXHRcdFx0XHQvLyB3aWRnZXQ6IG5vIGdob3N0IHRleHQgZXZlciBzaG93cywgc28gdGhlIHZpZXcgc3RheXMgYXQgaXRzIGluaXRpYWwgZW1wdHkgc3RhdGUuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWycnXSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcblxuY29uc3QgcHJvdmlkZXI6IENvbXBsZXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdHRyaWdnZXJDaGFyYWN0ZXJzOiBbJy4nXSxcblx0YXN5bmMgcHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgcG9zKSB7XG5cdFx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHBvcyk7XG5cdFx0Y29uc3QgcmFuZ2UgPSB3b3JkXG5cdFx0XHQ/IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogd29yZC5zdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiB3b3JkLmVuZENvbHVtbiB9XG5cdFx0XHQ6IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0aW5zZXJ0VGV4dDogJ2hlbGxvJyxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdGxhYmVsOiAnaGVsbG8nLFxuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0Y29tbWl0Q2hhcmFjdGVyczogWycuJ10sXG5cdFx0XHR9XVxuXHRcdH07XG5cdH0sXG59O1xuXG5hc3luYyBmdW5jdGlvbiB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoXG5cdHRleHQ6IHN0cmluZyxcblx0b3B0aW9uczogVGVzdENvZGVFZGl0b3JJbnN0YW50aWF0aW9uT3B0aW9ucyAmIHsgcHJvdmlkZXI/OiBDb21wbGV0aW9uSXRlbVByb3ZpZGVyOyBpbmxpbmVQcm92aWRlcj86IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXI7IGZha2VDbG9jaz86IGJvb2xlYW47IHNlcnZpY2VDb2xsZWN0aW9uPzogbmV2ZXIgfSxcblx0Y2FsbGJhY2s6IChhcmdzOiB7IGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yOyBlZGl0b3JWaWV3TW9kZWw6IFZpZXdNb2RlbDsgbW9kZWw6IElubGluZUNvbXBsZXRpb25zTW9kZWw7IGNvbnRleHQ6IEdob3N0VGV4dENvbnRleHQgfSkgPT4gUHJvbWlzZTx2b2lkPlxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IG9wdGlvbnMuZmFrZUNsb2NrIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2VydmljZUNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRcdFtJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2VdLFxuXHRcdFx0XHRbSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpXSxcblx0XHRcdFx0W0lTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKV0sXG5cdFx0XHRcdFtJS2V5YmluZGluZ1NlcnZpY2UsIG5ldyBNb2NrS2V5YmluZGluZ1NlcnZpY2UoKV0sXG5cdFx0XHRcdFtJRWRpdG9yV29ya2VyU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yV29ya2VyU2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgY29tcHV0ZVdvcmRSYW5nZXMoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRbSVN1Z2dlc3RNZW1vcnlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTdWdnZXN0TWVtb3J5U2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgbWVtb3JpemUoKTogdm9pZCB7IH1cblx0XHRcdFx0XHRvdmVycmlkZSBzZWxlY3QoKTogbnVtYmVyIHsgcmV0dXJuIDA7IH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdFtJTWVudVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1lbnVTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBjcmVhdGVNZW51KCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1lbnU+KCkge1xuXHRcdFx0XHRcdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdFx0XHRcdG92ZXJyaWRlIGRpc3Bvc2UoKSB7IH1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0W0lMYWJlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhYmVsU2VydmljZT4oKSB7IH1dLFxuXHRcdFx0XHRbSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7IH1dLFxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0W0lBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSwge1xuXHRcdFx0XHRcdHBsYXlTaWduYWw6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0XHRpc1NvdW5kRW5hYmxlZChzaWduYWw6IHVua25vd24pIHsgcmV0dXJuIGZhbHNlOyB9LFxuXHRcdFx0XHR9IGFzIGFueV0sXG5cdFx0XHRcdFtJRGVmYXVsdEFjY291bnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEZWZhdWx0QWNjb3VudFNlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRcdG92ZXJyaWRlIGdldERlZmF1bHRBY2NvdW50ID0gYXN5bmMgKCkgPT4gbnVsbDtcblx0XHRcdFx0XHRvdmVycmlkZSBzZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyID0gKCkgPT4geyB9O1xuXHRcdFx0XHR9XSxcblx0XHRcdCk7XG5cblx0XHRcdGlmIChvcHRpb25zLnByb3ZpZGVyIHx8IG9wdGlvbnMuaW5saW5lUHJvdmlkZXIpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKTtcblx0XHRcdFx0c2VydmljZUNvbGxlY3Rpb24uc2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdFx0XHRpZiAob3B0aW9ucy5wcm92aWRlcikge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgcGF0dGVybjogJyoqJyB9LCBvcHRpb25zLnByb3ZpZGVyKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wdGlvbnMuaW5saW5lUHJvdmlkZXIpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIucmVnaXN0ZXIoeyBwYXR0ZXJuOiAnKionIH0sIG9wdGlvbnMuaW5saW5lUHJvdmlkZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcih0ZXh0LCB7IC4uLm9wdGlvbnMsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IsIGVkaXRvclZpZXdNb2RlbCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKElubGluZVN1Z2dlc3Rpb25zVmlldywge1xuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oU25pcHBldENvbnRyb2xsZXIyLklELCBTbmlwcGV0Q29udHJvbGxlcjIpO1xuXHRcdFx0XHRlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihTdWdnZXN0Q29udHJvbGxlci5JRCwgU3VnZ2VzdENvbnRyb2xsZXIpO1xuXHRcdFx0XHRlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuSUQsIElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlcik7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChlZGl0b3IpPy5tb2RlbC5nZXQoKSE7XG5cblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IG5ldyBHaG9zdFRleHRDb250ZXh0KG1vZGVsLCBlZGl0b3IpO1xuXHRcdFx0XHRhd2FpdCBjYWxsYmFjayh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KTtcblx0XHRcdFx0Y29udGV4dC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdE1vZGlmaWVyS2V5RW1pdHRlci5kaXNwb3NlSW5zdGFuY2UoKTtcblx0XHR9XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQTZFO0FBQ3RGLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQThELCtCQUErQjtBQUM3RixTQUFnQixvQkFBb0I7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHdCQUF3Qix1QkFBdUI7QUFDeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsT0FBTyxZQUFZO0FBQ25CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDhC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
