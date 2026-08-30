import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { withTestCodeEditor } from "../testCodeEditor.js";
suite("CodeEditorWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("onDidChangeModelDecorations", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      let invoked = false;
      disposables.add(editor.onDidChangeModelDecorations((e) => {
        invoked = true;
      }));
      viewModel.model.deltaDecorations([], [{ range: new Range(1, 1, 1, 1), options: { description: "test" } }]);
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("onDidChangeModelLanguage", () => {
    withTestCodeEditor("", {}, (editor, viewModel, instantiationService) => {
      const languageService = instantiationService.get(ILanguageService);
      const disposables = new DisposableStore();
      disposables.add(languageService.registerLanguage({ id: "testMode" }));
      let invoked = false;
      disposables.add(editor.onDidChangeModelLanguage((e) => {
        invoked = true;
      }));
      viewModel.model.setLanguage("testMode");
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("onDidChangeModelLanguageConfiguration", () => {
    withTestCodeEditor("", {}, (editor, viewModel, instantiationService) => {
      const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
      const languageService = instantiationService.get(ILanguageService);
      const disposables = new DisposableStore();
      disposables.add(languageService.registerLanguage({ id: "testMode" }));
      viewModel.model.setLanguage("testMode");
      let invoked = false;
      disposables.add(editor.onDidChangeModelLanguageConfiguration((e) => {
        invoked = true;
      }));
      disposables.add(languageConfigurationService.register("testMode", {
        brackets: [["(", ")"]]
      }));
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("onDidChangeModelContent", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      let invoked = false;
      disposables.add(editor.onDidChangeModelContent((e) => {
        invoked = true;
      }));
      viewModel.type("hello", "test");
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("onDidChangeModelOptions", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      let invoked = false;
      disposables.add(editor.onDidChangeModelOptions((e) => {
        invoked = true;
      }));
      viewModel.model.updateOptions({
        tabSize: 3
      });
      assert.deepStrictEqual(invoked, true);
      disposables.dispose();
    });
  });
  test("issue #145872 - Model change events are emitted before the selection updates", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      let observedSelection = null;
      disposables.add(editor.onDidChangeModelContent((e) => {
        observedSelection = editor.getSelection();
      }));
      viewModel.type("hello", "test");
      assert.deepStrictEqual(observedSelection, new Selection(1, 6, 1, 6));
      disposables.dispose();
    });
  });
  test("monaco-editor issue #2774 - Wrong order of events onDidChangeModelContent and onDidChangeCursorSelection on redo", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      const calls = [];
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      viewModel.type("a", "test");
      viewModel.model.undo();
      viewModel.model.redo();
      assert.deepStrictEqual(calls, [
        "contentchange(a, 0, 0)",
        "cursorchange(1, 2)",
        "contentchange(, 0, 1)",
        "cursorchange(1, 1)",
        "contentchange(a, 0, 0)",
        "cursorchange(1, 2)"
      ]);
      disposables.dispose();
    });
  });
  test("issue #146174: Events delivered out of order when adding decorations in content change listener (1 of 2)", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      const calls = [];
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`listener1 - contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`listener1 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`listener2 - contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`listener2 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      viewModel.type("a", "test");
      assert.deepStrictEqual(calls, [
        "listener1 - contentchange(a, 0, 0)",
        "listener2 - contentchange(a, 0, 0)",
        "listener1 - cursorchange(1, 2)",
        "listener2 - cursorchange(1, 2)"
      ]);
      disposables.dispose();
    });
  });
  test("issue #146174: Events delivered out of order when adding decorations in content change listener (2 of 2)", () => {
    withTestCodeEditor("", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      const calls = [];
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`listener1 - contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
        editor.changeDecorations((changeAccessor) => {
          changeAccessor.deltaDecorations([], [{ range: new Range(1, 1, 1, 1), options: { description: "test" } }]);
        });
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`listener1 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      disposables.add(editor.onDidChangeModelContent((e) => {
        calls.push(`listener2 - contentchange(${e.changes.reduce((aggr, c) => [...aggr, c.text, c.rangeOffset, c.rangeLength], []).join(", ")})`);
      }));
      disposables.add(editor.onDidChangeCursorSelection((e) => {
        calls.push(`listener2 - cursorchange(${e.selection.positionLineNumber}, ${e.selection.positionColumn})`);
      }));
      viewModel.type("a", "test");
      assert.deepStrictEqual(calls, [
        "listener1 - contentchange(a, 0, 0)",
        "listener2 - contentchange(a, 0, 0)",
        "listener1 - cursorchange(1, 2)",
        "listener2 - cursorchange(1, 2)"
      ]);
      disposables.dispose();
    });
  });
  test("getBottomForLineNumber should handle invalid line numbers gracefully", () => {
    withTestCodeEditor("line1\nline2\nline3", {}, (editor, viewModel) => {
      const result1 = editor.getBottomForLineNumber(100);
      assert.ok(result1 >= 0, "Should return a valid position for out-of-bounds line number");
      const result2 = editor.getBottomForLineNumber(0);
      assert.ok(result2 >= 0, "Should return a valid position for line number 0");
      const result3 = editor.getBottomForLineNumber(-5);
      assert.ok(result3 >= 0, "Should return a valid position for negative line number");
      const result4 = editor.getBottomForLineNumber(2);
      assert.ok(result4 > 0, "Should return a valid position for valid line number");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY29kZUVkaXRvcldpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHdpdGhUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uL3Rlc3RDb2RlRWRpdG9yLmpzJztcblxuc3VpdGUoJ0NvZGVFZGl0b3JXaWRnZXQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VNb2RlbERlY29yYXRpb25zJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcignJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGxldCBpbnZva2VkID0gZmFsc2U7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9ucygoZSkgPT4ge1xuXHRcdFx0XHRpbnZva2VkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dmlld01vZGVsLm1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JyB9IH1dKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnZva2VkLCB0cnVlKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCcnLCB7fSwgKGVkaXRvciwgdmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogJ3Rlc3RNb2RlJyB9KSk7XG5cblx0XHRcdGxldCBpbnZva2VkID0gZmFsc2U7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoZSkgPT4ge1xuXHRcdFx0XHRpbnZva2VkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dmlld01vZGVsLm1vZGVsLnNldExhbmd1YWdlKCd0ZXN0TW9kZScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGludm9rZWQsIHRydWUpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCcnLCB7fSwgKGVkaXRvciwgdmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiAndGVzdE1vZGUnIH0pKTtcblx0XHRcdHZpZXdNb2RlbC5tb2RlbC5zZXRMYW5ndWFnZSgndGVzdE1vZGUnKTtcblxuXHRcdFx0bGV0IGludm9rZWQgPSBmYWxzZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRpbnZva2VkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIoJ3Rlc3RNb2RlJywge1xuXHRcdFx0XHRicmFja2V0czogW1snKCcsICcpJ11dXG5cdFx0XHR9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2tlZCwgdHJ1ZSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VNb2RlbENvbnRlbnQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCcnLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0bGV0IGludm9rZWQgPSBmYWxzZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0aW52b2tlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdoZWxsbycsICd0ZXN0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2tlZCwgdHJ1ZSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VNb2RlbE9wdGlvbnMnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCcnLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0bGV0IGludm9rZWQgPSBmYWxzZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbE9wdGlvbnMoKGUpID0+IHtcblx0XHRcdFx0aW52b2tlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHZpZXdNb2RlbC5tb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0dGFiU2l6ZTogM1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2tlZCwgdHJ1ZSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0NTg3MiAtIE1vZGVsIGNoYW5nZSBldmVudHMgYXJlIGVtaXR0ZWQgYmVmb3JlIHRoZSBzZWxlY3Rpb24gdXBkYXRlcycsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJycsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRsZXQgb2JzZXJ2ZWRTZWxlY3Rpb246IFNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0XHRvYnNlcnZlZFNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2hlbGxvJywgJ3Rlc3QnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvYnNlcnZlZFNlbGVjdGlvbiwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW9uYWNvLWVkaXRvciBpc3N1ZSAjMjc3NCAtIFdyb25nIG9yZGVyIG9mIGV2ZW50cyBvbkRpZENoYW5nZU1vZGVsQ29udGVudCBhbmQgb25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24gb24gcmVkbycsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJycsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgY29udGVudGNoYW5nZSgke2UuY2hhbmdlcy5yZWR1Y2U8YW55W10+KChhZ2dyLCBjKSA9PiBbLi4uYWdnciwgYy50ZXh0LCBjLnJhbmdlT2Zmc2V0LCBjLnJhbmdlTGVuZ3RoXSwgW10pLmpvaW4oJywgJyl9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKGBjdXJzb3JjaGFuZ2UoJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXJ9LCAke2Uuc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1ufSlgKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2EnLCAndGVzdCcpO1xuXHRcdFx0dmlld01vZGVsLm1vZGVsLnVuZG8oKTtcblx0XHRcdHZpZXdNb2RlbC5tb2RlbC5yZWRvKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtcblx0XHRcdFx0J2NvbnRlbnRjaGFuZ2UoYSwgMCwgMCknLFxuXHRcdFx0XHQnY3Vyc29yY2hhbmdlKDEsIDIpJyxcblx0XHRcdFx0J2NvbnRlbnRjaGFuZ2UoLCAwLCAxKScsXG5cdFx0XHRcdCdjdXJzb3JjaGFuZ2UoMSwgMSknLFxuXHRcdFx0XHQnY29udGVudGNoYW5nZShhLCAwLCAwKScsXG5cdFx0XHRcdCdjdXJzb3JjaGFuZ2UoMSwgMiknXG5cdFx0XHRdKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTQ2MTc0OiBFdmVudHMgZGVsaXZlcmVkIG91dCBvZiBvcmRlciB3aGVuIGFkZGluZyBkZWNvcmF0aW9ucyBpbiBjb250ZW50IGNoYW5nZSBsaXN0ZW5lciAoMSBvZiAyKScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJycsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgbGlzdGVuZXIxIC0gY29udGVudGNoYW5nZSgke2UuY2hhbmdlcy5yZWR1Y2U8YW55W10+KChhZ2dyLCBjKSA9PiBbLi4uYWdnciwgYy50ZXh0LCBjLnJhbmdlT2Zmc2V0LCBjLnJhbmdlTGVuZ3RoXSwgW10pLmpvaW4oJywgJyl9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKGBsaXN0ZW5lcjEgLSBjdXJzb3JjaGFuZ2UoJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXJ9LCAke2Uuc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1ufSlgKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgbGlzdGVuZXIyIC0gY29udGVudGNoYW5nZSgke2UuY2hhbmdlcy5yZWR1Y2U8YW55W10+KChhZ2dyLCBjKSA9PiBbLi4uYWdnciwgYy50ZXh0LCBjLnJhbmdlT2Zmc2V0LCBjLnJhbmdlTGVuZ3RoXSwgW10pLmpvaW4oJywgJyl9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKGBsaXN0ZW5lcjIgLSBjdXJzb3JjaGFuZ2UoJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXJ9LCAke2Uuc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1ufSlgKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2EnLCAndGVzdCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCAoW1xuXHRcdFx0XHQnbGlzdGVuZXIxIC0gY29udGVudGNoYW5nZShhLCAwLCAwKScsXG5cdFx0XHRcdCdsaXN0ZW5lcjIgLSBjb250ZW50Y2hhbmdlKGEsIDAsIDApJyxcblx0XHRcdFx0J2xpc3RlbmVyMSAtIGN1cnNvcmNoYW5nZSgxLCAyKScsXG5cdFx0XHRcdCdsaXN0ZW5lcjIgLSBjdXJzb3JjaGFuZ2UoMSwgMiknLFxuXHRcdFx0XSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDYxNzQ6IEV2ZW50cyBkZWxpdmVyZWQgb3V0IG9mIG9yZGVyIHdoZW4gYWRkaW5nIGRlY29yYXRpb25zIGluIGNvbnRlbnQgY2hhbmdlIGxpc3RlbmVyICgyIG9mIDIpJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcignJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKGBsaXN0ZW5lcjEgLSBjb250ZW50Y2hhbmdlKCR7ZS5jaGFuZ2VzLnJlZHVjZTxhbnlbXT4oKGFnZ3IsIGMpID0+IFsuLi5hZ2dyLCBjLnRleHQsIGMucmFuZ2VPZmZzZXQsIGMucmFuZ2VMZW5ndGhdLCBbXSkuam9pbignLCAnKX0pYCk7XG5cdFx0XHRcdGVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0XHRjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKFtdLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcgfSB9XSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKGBsaXN0ZW5lcjEgLSBjdXJzb3JjaGFuZ2UoJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXJ9LCAke2Uuc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1ufSlgKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgbGlzdGVuZXIyIC0gY29udGVudGNoYW5nZSgke2UuY2hhbmdlcy5yZWR1Y2U8YW55W10+KChhZ2dyLCBjKSA9PiBbLi4uYWdnciwgYy50ZXh0LCBjLnJhbmdlT2Zmc2V0LCBjLnJhbmdlTGVuZ3RoXSwgW10pLmpvaW4oJywgJyl9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKGBsaXN0ZW5lcjIgLSBjdXJzb3JjaGFuZ2UoJHtlLnNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXJ9LCAke2Uuc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1ufSlgKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2EnLCAndGVzdCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCAoW1xuXHRcdFx0XHQnbGlzdGVuZXIxIC0gY29udGVudGNoYW5nZShhLCAwLCAwKScsXG5cdFx0XHRcdCdsaXN0ZW5lcjIgLSBjb250ZW50Y2hhbmdlKGEsIDAsIDApJyxcblx0XHRcdFx0J2xpc3RlbmVyMSAtIGN1cnNvcmNoYW5nZSgxLCAyKScsXG5cdFx0XHRcdCdsaXN0ZW5lcjIgLSBjdXJzb3JjaGFuZ2UoMSwgMiknLFxuXHRcdFx0XSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEJvdHRvbUZvckxpbmVOdW1iZXIgc2hvdWxkIGhhbmRsZSBpbnZhbGlkIGxpbmUgbnVtYmVycyBncmFjZWZ1bGx5JywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcignbGluZTFcXG5saW5lMlxcbmxpbmUzJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCB3aXRoIGxpbmVOdW1iZXIgZ3JlYXRlciB0aGFuIGxpbmUgY291bnRcblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBlZGl0b3IuZ2V0Qm90dG9tRm9yTGluZU51bWJlcigxMDApO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDEgPj0gMCwgJ1Nob3VsZCByZXR1cm4gYSB2YWxpZCBwb3NpdGlvbiBmb3Igb3V0LW9mLWJvdW5kcyBsaW5lIG51bWJlcicpO1xuXG5cdFx0XHQvLyBUZXN0IHdpdGggbGluZU51bWJlciBsZXNzIHRoYW4gMVxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IGVkaXRvci5nZXRCb3R0b21Gb3JMaW5lTnVtYmVyKDApO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDIgPj0gMCwgJ1Nob3VsZCByZXR1cm4gYSB2YWxpZCBwb3NpdGlvbiBmb3IgbGluZSBudW1iZXIgMCcpO1xuXG5cdFx0XHQvLyBUZXN0IHdpdGggbmVnYXRpdmUgbGluZU51bWJlclxuXHRcdFx0Y29uc3QgcmVzdWx0MyA9IGVkaXRvci5nZXRCb3R0b21Gb3JMaW5lTnVtYmVyKC01KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQzID49IDAsICdTaG91bGQgcmV0dXJuIGEgdmFsaWQgcG9zaXRpb24gZm9yIG5lZ2F0aXZlIGxpbmUgbnVtYmVyJyk7XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCB2YWxpZCBsaW5lTnVtYmVyIHNob3VsZCBzdGlsbCB3b3JrXG5cdFx0XHRjb25zdCByZXN1bHQ0ID0gZWRpdG9yLmdldEJvdHRvbUZvckxpbmVOdW1iZXIoMik7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0NCA+IDAsICdTaG91bGQgcmV0dXJuIGEgdmFsaWQgcG9zaXRpb24gZm9yIHZhbGlkIGxpbmUgbnVtYmVyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUywwQkFBMEI7QUFFbkMsTUFBTSxvQkFBb0IsTUFBTTtBQUUvQiwwQ0FBd0M7QUFFeEMsT0FBSywrQkFBK0IsTUFBTTtBQUN6Qyx1QkFBbUIsSUFB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
