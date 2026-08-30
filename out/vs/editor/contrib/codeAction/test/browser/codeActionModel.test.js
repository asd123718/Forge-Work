import assert from "assert";
import { promiseWithResolvers } from "../../../../../base/common/async.js";
import { assertType } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { MarkerService } from "../../../../../platform/markers/common/markerService.js";
import { LanguageFeatureRegistry } from "../../../../common/languageFeatureRegistry.js";
import * as languages from "../../../../common/languages.js";
import { createTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { CodeActionModel, CodeActionsState } from "../../browser/codeActionModel.js";
import { CodeActionTriggerSource } from "../../common/types.js";
const testProvider = {
  provideCodeActions() {
    return {
      actions: [
        { title: "test", command: { id: "test-command", title: "test", arguments: [] } }
      ],
      dispose() {
      }
    };
  }
};
suite("CodeActionModel", () => {
  const languageId = "foo-lang";
  const uri = URI.parse("untitled:path");
  let model;
  let markerService;
  let editor;
  let registry;
  setup(() => {
    markerService = new MarkerService();
    model = createTextModel("foobar  foo bar\nfarboo far boo", languageId, void 0, uri);
    editor = createTestCodeEditor(model);
    editor.setPosition({ lineNumber: 1, column: 1 });
    registry = new LanguageFeatureRegistry();
  });
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => {
    editor.dispose();
    model.dispose();
    markerService.dispose();
  });
  test("Oracle -> marker added", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    await runWithFakedTimers({ useFakeTimers: true }, () => {
      const reg = registry.register(languageId, testProvider);
      store.add(reg);
      const contextKeys = new MockContextKeyService();
      const model2 = store.add(new CodeActionModel(editor, registry, markerService, contextKeys, void 0));
      store.add(model2.onDidChangeState((e) => {
        assertType(e.type === CodeActionsState.Type.Triggered);
        assert.strictEqual(e.trigger.type, languages.CodeActionTriggerType.Auto);
        assert.ok(e.actions);
        e.actions.then((fixes) => {
          model2.dispose();
          assert.strictEqual(fixes.validActions.length, 1);
          done();
        }, done);
      }));
      markerService.changeOne("fake", uri, [{
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 6,
        message: "error",
        severity: 1,
        code: "",
        source: ""
      }]);
      return donePromise;
    });
  });
  test("Oracle -> position changed", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, () => {
      const reg = registry.register(languageId, testProvider);
      store.add(reg);
      markerService.changeOne("fake", uri, [{
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 6,
        message: "error",
        severity: 1,
        code: "",
        source: ""
      }]);
      editor.setPosition({ lineNumber: 2, column: 1 });
      return new Promise((resolve, reject) => {
        const contextKeys = new MockContextKeyService();
        const model2 = store.add(new CodeActionModel(editor, registry, markerService, contextKeys, void 0));
        store.add(model2.onDidChangeState((e) => {
          assertType(e.type === CodeActionsState.Type.Triggered);
          assert.strictEqual(e.trigger.type, languages.CodeActionTriggerType.Auto);
          assert.ok(e.actions);
          e.actions.then((fixes) => {
            model2.dispose();
            assert.strictEqual(fixes.validActions.length, 1);
            resolve(void 0);
          }, reject);
        }));
        editor.setPosition({ lineNumber: 1, column: 1 });
      });
    });
  });
  test("Oracle -> should only auto trigger once for cursor and marker update right after each other", async () => {
    const { promise: donePromise, resolve: done } = promiseWithResolvers();
    await runWithFakedTimers({ useFakeTimers: true }, () => {
      const reg = registry.register(languageId, testProvider);
      store.add(reg);
      let triggerCount = 0;
      const contextKeys = new MockContextKeyService();
      const model2 = store.add(new CodeActionModel(editor, registry, markerService, contextKeys, void 0));
      store.add(model2.onDidChangeState(
        (e) => {
          assertType(e.type === CodeActionsState.Type.Triggered);
          assert.strictEqual(e.trigger.type, languages.CodeActionTriggerType.Auto);
          ++triggerCount;
          setTimeout(() => {
            model2.dispose();
            assert.strictEqual(triggerCount, 1);
            done();
          }, 0);
        },
        5
        /*delay*/
      ));
      markerService.changeOne("fake", uri, [{
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 6,
        message: "error",
        severity: 1,
        code: "",
        source: ""
      }]);
      editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 });
      return donePromise;
    });
  });
  test("disposes manually triggered code actions when the editor model is cleared", async () => {
    let disposeCount = 0;
    store.add(registry.register(languageId, {
      provideCodeActions(_model, _range, context) {
        if (context.trigger !== languages.CodeActionTriggerType.Invoke) {
          return void 0;
        }
        return {
          actions: [
            { title: "test", command: { id: "test-command", title: "test", arguments: [] } }
          ],
          dispose() {
            disposeCount++;
          }
        };
      }
    }));
    const contextKeys = new MockContextKeyService();
    const codeActionModel = store.add(new CodeActionModel(editor, registry, markerService, contextKeys, void 0));
    const { promise, resolve } = promiseWithResolvers();
    store.add(codeActionModel.onDidChangeState((state2) => {
      if (state2.type !== CodeActionsState.Type.Triggered || state2.trigger.type !== languages.CodeActionTriggerType.Invoke) {
        return;
      }
      resolve(state2);
    }));
    codeActionModel.trigger({
      type: languages.CodeActionTriggerType.Invoke,
      triggerAction: CodeActionTriggerSource.Default
    });
    const state = await promise;
    await state.actions;
    editor.setModel(null);
    assert.strictEqual(disposeCount, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvZGVBY3Rpb25cXHRlc3RcXGJyb3dzZXJcXGNvZGVBY3Rpb25Nb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcHJvbWlzZVdpdGhSZXNvbHZlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uTW9kZWwsIENvZGVBY3Rpb25zU3RhdGUgfSBmcm9tICcuLi8uLi9icm93c2VyL2NvZGVBY3Rpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNvbnN0IHRlc3RQcm92aWRlciA9IHtcblx0cHJvdmlkZUNvZGVBY3Rpb25zKCk6IGxhbmd1YWdlcy5Db2RlQWN0aW9uTGlzdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjdGlvbnM6IFtcblx0XHRcdFx0eyB0aXRsZTogJ3Rlc3QnLCBjb21tYW5kOiB7IGlkOiAndGVzdC1jb21tYW5kJywgdGl0bGU6ICd0ZXN0JywgYXJndW1lbnRzOiBbXSB9IH1cblx0XHRcdF0sXG5cdFx0XHRkaXNwb3NlKCkgeyAvKiBub29wKi8gfVxuXHRcdH07XG5cdH1cbn07XG5cbnN1aXRlKCdDb2RlQWN0aW9uTW9kZWwnLCAoKSA9PiB7XG5cblx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdmb28tbGFuZyc7XG5cdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndW50aXRsZWQ6cGF0aCcpO1xuXHRsZXQgbW9kZWw6IFRleHRNb2RlbDtcblx0bGV0IG1hcmtlclNlcnZpY2U6IE1hcmtlclNlcnZpY2U7XG5cdGxldCBlZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRsZXQgcmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PGxhbmd1YWdlcy5Db2RlQWN0aW9uUHJvdmlkZXI+O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtYXJrZXJTZXJ2aWNlID0gbmV3IE1hcmtlclNlcnZpY2UoKTtcblx0XHRtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnZm9vYmFyICBmb28gYmFyXFxuZmFyYm9vIGZhciBib28nLCBsYW5ndWFnZUlkLCB1bmRlZmluZWQsIHVyaSk7XG5cdFx0ZWRpdG9yID0gY3JlYXRlVGVzdENvZGVFZGl0b3IobW9kZWwpO1xuXHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMSB9KTtcblx0XHRyZWdpc3RyeSA9IG5ldyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSgpO1xuXHR9KTtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRlZGl0b3IuZGlzcG9zZSgpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRtYXJrZXJTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnT3JhY2xlIC0+IG1hcmtlciBhZGRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb21pc2U6IGRvbmVQcm9taXNlLCByZXNvbHZlOiBkb25lIH0gPSBwcm9taXNlV2l0aFJlc29sdmVyczx2b2lkPigpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWcgPSByZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCB0ZXN0UHJvdmlkZXIpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZyk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHRLZXlzID0gbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IENvZGVBY3Rpb25Nb2RlbChlZGl0b3IsIHJlZ2lzdHJ5LCBtYXJrZXJTZXJ2aWNlLCBjb250ZXh0S2V5cywgdW5kZWZpbmVkKSk7XG5cdFx0XHRzdG9yZS5hZGQobW9kZWwub25EaWRDaGFuZ2VTdGF0ZSgoZTogQ29kZUFjdGlvbnNTdGF0ZS5TdGF0ZSkgPT4ge1xuXHRcdFx0XHRhc3NlcnRUeXBlKGUudHlwZSA9PT0gQ29kZUFjdGlvbnNTdGF0ZS5UeXBlLlRyaWdnZXJlZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUudHJpZ2dlci50eXBlLCBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8pO1xuXHRcdFx0XHRhc3NlcnQub2soZS5hY3Rpb25zKTtcblxuXHRcdFx0XHRlLmFjdGlvbnMudGhlbihmaXhlcyA9PiB7XG5cdFx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXhlcy52YWxpZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdH0sIGRvbmUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBzdGFydCBoZXJlXG5cdFx0XHRtYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZSgnZmFrZScsIHVyaSwgW3tcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA2LFxuXHRcdFx0XHRtZXNzYWdlOiAnZXJyb3InLFxuXHRcdFx0XHRzZXZlcml0eTogMSxcblx0XHRcdFx0Y29kZTogJycsXG5cdFx0XHRcdHNvdXJjZTogJydcblx0XHRcdH1dKTtcblx0XHRcdHJldHVybiBkb25lUHJvbWlzZTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnT3JhY2xlIC0+IHBvc2l0aW9uIGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWcgPSByZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCB0ZXN0UHJvdmlkZXIpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZyk7XG5cblx0XHRcdG1hcmtlclNlcnZpY2UuY2hhbmdlT25lKCdmYWtlJywgdXJpLCBbe1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDYsXG5cdFx0XHRcdG1lc3NhZ2U6ICdlcnJvcicsXG5cdFx0XHRcdHNldmVyaXR5OiAxLFxuXHRcdFx0XHRjb2RlOiAnJyxcblx0XHRcdFx0c291cmNlOiAnJ1xuXHRcdFx0fV0pO1xuXG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAyLCBjb2x1bW46IDEgfSk7XG5cblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHRLZXlzID0gbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgQ29kZUFjdGlvbk1vZGVsKGVkaXRvciwgcmVnaXN0cnksIG1hcmtlclNlcnZpY2UsIGNvbnRleHRLZXlzLCB1bmRlZmluZWQpKTtcblx0XHRcdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlU3RhdGUoKGU6IENvZGVBY3Rpb25zU3RhdGUuU3RhdGUpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRUeXBlKGUudHlwZSA9PT0gQ29kZUFjdGlvbnNTdGF0ZS5UeXBlLlRyaWdnZXJlZCk7XG5cblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS50cmlnZ2VyLnR5cGUsIGxhbmd1YWdlcy5Db2RlQWN0aW9uVHJpZ2dlclR5cGUuQXV0byk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGUuYWN0aW9ucyk7XG5cdFx0XHRcdFx0ZS5hY3Rpb25zLnRoZW4oZml4ZXMgPT4ge1xuXHRcdFx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpeGVzLnZhbGlkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0sIHJlamVjdCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0Ly8gc3RhcnQgaGVyZVxuXHRcdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnT3JhY2xlIC0+IHNob3VsZCBvbmx5IGF1dG8gdHJpZ2dlciBvbmNlIGZvciBjdXJzb3IgYW5kIG1hcmtlciB1cGRhdGUgcmlnaHQgYWZ0ZXIgZWFjaCBvdGhlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb21pc2U6IGRvbmVQcm9taXNlLCByZXNvbHZlOiBkb25lIH0gPSBwcm9taXNlV2l0aFJlc29sdmVyczx2b2lkPigpO1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVnID0gcmVnaXN0cnkucmVnaXN0ZXIobGFuZ3VhZ2VJZCwgdGVzdFByb3ZpZGVyKTtcblx0XHRcdHN0b3JlLmFkZChyZWcpO1xuXG5cdFx0XHRsZXQgdHJpZ2dlckNvdW50ID0gMDtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXlzID0gbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IENvZGVBY3Rpb25Nb2RlbChlZGl0b3IsIHJlZ2lzdHJ5LCBtYXJrZXJTZXJ2aWNlLCBjb250ZXh0S2V5cywgdW5kZWZpbmVkKSk7XG5cdFx0XHRzdG9yZS5hZGQobW9kZWwub25EaWRDaGFuZ2VTdGF0ZSgoZTogQ29kZUFjdGlvbnNTdGF0ZS5TdGF0ZSkgPT4ge1xuXHRcdFx0XHRhc3NlcnRUeXBlKGUudHlwZSA9PT0gQ29kZUFjdGlvbnNTdGF0ZS5UeXBlLlRyaWdnZXJlZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUudHJpZ2dlci50eXBlLCBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8pO1xuXHRcdFx0XHQrK3RyaWdnZXJDb3VudDtcblxuXHRcdFx0XHQvLyBnaXZlIHRpbWUgZm9yIHNlY29uZCB0cmlnZ2VyIGJlZm9yZSBjb21wbGV0aW5nIHRlc3Rcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmlnZ2VyQ291bnQsIDEpO1xuXHRcdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0fSwgMCk7XG5cdFx0XHR9LCA1IC8qZGVsYXkqLykpO1xuXG5cdFx0XHRtYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZSgnZmFrZScsIHVyaSwgW3tcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA2LFxuXHRcdFx0XHRtZXNzYWdlOiAnZXJyb3InLFxuXHRcdFx0XHRzZXZlcml0eTogMSxcblx0XHRcdFx0Y29kZTogJycsXG5cdFx0XHRcdHNvdXJjZTogJydcblx0XHRcdH1dKTtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbih7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDQsIGVuZENvbHVtbjogMSB9KTtcblxuXHRcdFx0cmV0dXJuIGRvbmVQcm9taXNlO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlcyBtYW51YWxseSB0cmlnZ2VyZWQgY29kZSBhY3Rpb25zIHdoZW4gdGhlIGVkaXRvciBtb2RlbCBpcyBjbGVhcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBkaXNwb3NlQ291bnQgPSAwO1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoX21vZGVsLCBfcmFuZ2UsIGNvbnRleHQpOiBsYW5ndWFnZXMuQ29kZUFjdGlvbkxpc3QgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRpZiAoY29udGV4dC50cmlnZ2VyICE9PSBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHRpdGxlOiAndGVzdCcsIGNvbW1hbmQ6IHsgaWQ6ICd0ZXN0LWNvbW1hbmQnLCB0aXRsZTogJ3Rlc3QnLCBhcmd1bWVudHM6IFtdIH0gfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0XHRcdGRpc3Bvc2VDb3VudCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5cyA9IG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKTtcblx0XHRjb25zdCBjb2RlQWN0aW9uTW9kZWwgPSBzdG9yZS5hZGQobmV3IENvZGVBY3Rpb25Nb2RlbChlZGl0b3IsIHJlZ2lzdHJ5LCBtYXJrZXJTZXJ2aWNlLCBjb250ZXh0S2V5cywgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgeyBwcm9taXNlLCByZXNvbHZlIH0gPSBwcm9taXNlV2l0aFJlc29sdmVyczxDb2RlQWN0aW9uc1N0YXRlLlRyaWdnZXJlZD4oKTtcblx0XHRzdG9yZS5hZGQoY29kZUFjdGlvbk1vZGVsLm9uRGlkQ2hhbmdlU3RhdGUoc3RhdGUgPT4ge1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IENvZGVBY3Rpb25zU3RhdGUuVHlwZS5UcmlnZ2VyZWQgfHwgc3RhdGUudHJpZ2dlci50eXBlICE9PSBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlKHN0YXRlKTtcblx0XHR9KSk7XG5cblx0XHRjb2RlQWN0aW9uTW9kZWwudHJpZ2dlcih7XG5cdFx0XHR0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSxcblx0XHRcdHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBwcm9taXNlO1xuXHRcdGF3YWl0IHN0YXRlLmFjdGlvbnM7XG5cdFx0ZWRpdG9yLnNldE1vZGVsKG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnQsIDEpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsNEJBQTRC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
