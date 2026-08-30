import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { CompletionItemInsertTextRule, CompletionItemKind } from "../../../../common/languages.js";
import { IEditorWorkerService } from "../../../../common/services/editorWorker.js";
import { SnippetController2 } from "../../../snippet/browser/snippetController2.js";
import { SuggestController } from "../../browser/suggestController.js";
import { ISuggestMemoryService } from "../../browser/suggestMemory.js";
import { createTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { MockKeybindingService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { DeleteLinesAction } from "../../../linesOperations/browser/linesOperations.js";
suite("SuggestController", function() {
  const disposables = new DisposableStore();
  let controller;
  let editor;
  let model;
  const languageFeaturesService = new LanguageFeaturesService();
  teardown(function() {
    disposables.clear();
  });
  setup(function() {
    const serviceCollection = new ServiceCollection(
      [ILanguageFeaturesService, languageFeaturesService],
      [ITelemetryService, NullTelemetryService],
      [ILogService, new NullLogService()],
      [IStorageService, disposables.add(new InMemoryStorageService())],
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
      [IEnvironmentService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isBuilt = true;
          this.isExtensionDevelopment = false;
        }
      }()]
    );
    model = disposables.add(createTextModel("", void 0, void 0, URI.from({ scheme: "test-ctrl", path: "/path.tst" })));
    editor = disposables.add(createTestCodeEditor(model, { serviceCollection }));
    editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
    controller = editor.registerAndInstantiateContribution(SuggestController.ID, SuggestController);
  });
  test("postfix completion reports incorrect position #86984", async function() {
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Snippet,
            label: "let",
            insertText: "let ${1:name} = foo$0",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            range: { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 11 },
            additionalTextEdits: [{
              text: "",
              range: { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 9 }
            }]
          }]
        };
      }
    }));
    editor.setValue("    foo.le");
    editor.setSelection(new Selection(1, 11, 1, 11));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    controller.acceptSelectedSuggestion(false, false);
    await p2;
    assert.strictEqual(editor.getValue(), "    let name = foo");
  });
  test("use additionalTextEdits sync when possible", async function() {
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Snippet,
            label: "let",
            insertText: "hello",
            range: Range.fromPositions(pos),
            additionalTextEdits: [{
              text: "I came sync",
              range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
            }]
          }]
        };
      },
      async resolveCompletionItem(item) {
        return item;
      }
    }));
    editor.setValue("hello\nhallo");
    editor.setSelection(new Selection(2, 6, 2, 6));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    controller.acceptSelectedSuggestion(false, false);
    await p2;
    assert.strictEqual(editor.getValue(), "I came synchello\nhallohello");
  });
  test("resolve additionalTextEdits async when needed", async function() {
    let resolveCallCount = 0;
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Snippet,
            label: "let",
            insertText: "hello",
            range: Range.fromPositions(pos)
          }]
        };
      },
      async resolveCompletionItem(item) {
        resolveCallCount += 1;
        await timeout(10);
        item.additionalTextEdits = [{
          text: "I came late",
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
        }];
        return item;
      }
    }));
    editor.setValue("hello\nhallo");
    editor.setSelection(new Selection(2, 6, 2, 6));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    controller.acceptSelectedSuggestion(false, false);
    await p2;
    assert.strictEqual(editor.getValue(), "hello\nhallohello");
    assert.strictEqual(resolveCallCount, 1);
    await timeout(20);
    assert.strictEqual(editor.getValue(), "I came latehello\nhallohello");
    editor.getModel()?.undo();
    assert.strictEqual(editor.getValue(), "hello\nhallo");
  });
  test("resolve additionalTextEdits async when needed (typing)", async function() {
    let resolveCallCount = 0;
    let resolve = () => {
    };
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Snippet,
            label: "let",
            insertText: "hello",
            range: Range.fromPositions(pos)
          }]
        };
      },
      async resolveCompletionItem(item) {
        resolveCallCount += 1;
        await new Promise((_resolve) => resolve = _resolve);
        item.additionalTextEdits = [{
          text: "I came late",
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
        }];
        return item;
      }
    }));
    editor.setValue("hello\nhallo");
    editor.setSelection(new Selection(2, 6, 2, 6));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    controller.acceptSelectedSuggestion(false, false);
    await p2;
    assert.strictEqual(editor.getValue(), "hello\nhallohello");
    assert.strictEqual(resolveCallCount, 1);
    assert.ok(editor.getSelection()?.equalsSelection(new Selection(2, 11, 2, 11)));
    editor.trigger("test", "type", { text: "TYPING" });
    assert.strictEqual(editor.getValue(), "hello\nhallohelloTYPING");
    resolve();
    await timeout(10);
    assert.strictEqual(editor.getValue(), "I came latehello\nhallohelloTYPING");
    assert.ok(editor.getSelection()?.equalsSelection(new Selection(2, 17, 2, 17)));
  });
  test("resolve additionalTextEdits async when needed (simple conflict)", async function() {
    let resolveCallCount = 0;
    let resolve = () => {
    };
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Snippet,
            label: "let",
            insertText: "hello",
            range: Range.fromPositions(pos)
          }]
        };
      },
      async resolveCompletionItem(item) {
        resolveCallCount += 1;
        await new Promise((_resolve) => resolve = _resolve);
        item.additionalTextEdits = [{
          text: "I came late",
          range: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 6 }
        }];
        return item;
      }
    }));
    editor.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    controller.acceptSelectedSuggestion(false, false);
    await p2;
    assert.strictEqual(editor.getValue(), "hello");
    assert.strictEqual(resolveCallCount, 1);
    resolve();
    await timeout(10);
    assert.strictEqual(editor.getValue(), "hello");
  });
  test("resolve additionalTextEdits async when needed (conflict)", async function() {
    let resolveCallCount = 0;
    let resolve = () => {
    };
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Snippet,
            label: "let",
            insertText: "hello",
            range: Range.fromPositions(pos)
          }]
        };
      },
      async resolveCompletionItem(item) {
        resolveCallCount += 1;
        await new Promise((_resolve) => resolve = _resolve);
        item.additionalTextEdits = [{
          text: "I came late",
          range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 }
        }];
        return item;
      }
    }));
    editor.setValue("hello\nhallo");
    editor.setSelection(new Selection(2, 6, 2, 6));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    controller.acceptSelectedSuggestion(false, false);
    await p2;
    assert.strictEqual(editor.getValue(), "hello\nhallohello");
    assert.strictEqual(resolveCallCount, 1);
    editor.setSelection(new Selection(1, 1, 1, 1));
    editor.trigger("test", "type", { text: "TYPING" });
    assert.strictEqual(editor.getValue(), "TYPINGhello\nhallohello");
    resolve();
    await timeout(10);
    assert.strictEqual(editor.getValue(), "TYPINGhello\nhallohello");
    assert.ok(editor.getSelection()?.equalsSelection(new Selection(1, 7, 1, 7)));
  });
  test("resolve additionalTextEdits async when needed (cancel)", async function() {
    const resolve = [];
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Snippet,
            label: "let",
            insertText: "hello",
            range: Range.fromPositions(pos)
          }, {
            kind: CompletionItemKind.Snippet,
            label: "let",
            insertText: "hallo",
            range: Range.fromPositions(pos)
          }]
        };
      },
      async resolveCompletionItem(item) {
        await new Promise((_resolve) => resolve.push(_resolve));
        item.additionalTextEdits = [{
          text: "additionalTextEdits",
          range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 }
        }];
        return item;
      }
    }));
    editor.setValue("abc");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    controller.acceptSelectedSuggestion(true, false);
    await p2;
    assert.strictEqual(editor.getValue(), "helloabc");
    controller.acceptNextSuggestion();
    resolve.forEach((fn) => fn);
    resolve.length = 0;
    await timeout(10);
    assert.strictEqual(editor.getValue(), "halloabc");
  });
  test("Completion edits are applied inconsistently when additionalTextEdits and textEdit start at the same offset #143888", async function() {
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Text,
            label: "MyClassName",
            insertText: "MyClassName",
            range: Range.fromPositions(pos),
            additionalTextEdits: [{
              range: Range.fromPositions(pos),
              text: 'import "my_class.txt";\n'
            }]
          }]
        };
      }
    }));
    editor.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    controller.acceptSelectedSuggestion(true, false);
    await p2;
    assert.strictEqual(editor.getValue(), 'import "my_class.txt";\nMyClassName');
  });
  test("Pressing enter on autocomplete should always apply the selected dropdown completion, not a different, hidden one #161883", async function() {
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        const word = doc.getWordUntilPosition(pos);
        const range = new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);
        return {
          suggestions: [{
            kind: CompletionItemKind.Text,
            label: "filterBankSize",
            insertText: "filterBankSize",
            sortText: "a",
            range
          }, {
            kind: CompletionItemKind.Text,
            label: "filter",
            insertText: "filter",
            sortText: "b",
            range
          }]
        };
      }
    }));
    editor.setValue("filte");
    editor.setSelection(new Selection(1, 6, 1, 6));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    const { completionModel } = await p1;
    assert.strictEqual(completionModel.items.length, 2);
    const [first, second] = completionModel.items;
    assert.strictEqual(first.textLabel, "filterBankSize");
    assert.strictEqual(second.textLabel, "filter");
    assert.deepStrictEqual(editor.getSelection(), new Selection(1, 6, 1, 6));
    editor.trigger("keyboard", "type", { text: "r" });
    assert.deepStrictEqual(editor.getSelection(), new Selection(1, 7, 1, 7));
    controller.acceptSelectedSuggestion(false, false);
    assert.strictEqual(editor.getValue(), "filter");
  });
  test("Fast autocomple typing selects the previous autocomplete suggestion, #71795", async function() {
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        const word = doc.getWordUntilPosition(pos);
        const range = new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);
        return {
          suggestions: [{
            kind: CompletionItemKind.Text,
            label: "false",
            insertText: "false",
            range
          }, {
            kind: CompletionItemKind.Text,
            label: "float",
            insertText: "float",
            range
          }, {
            kind: CompletionItemKind.Text,
            label: "for",
            insertText: "for",
            range
          }, {
            kind: CompletionItemKind.Text,
            label: "foreach",
            insertText: "foreach",
            range
          }]
        };
      }
    }));
    editor.setValue("f");
    editor.setSelection(new Selection(1, 2, 1, 2));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    const { completionModel } = await p1;
    assert.strictEqual(completionModel.items.length, 4);
    const [first, second, third, fourth] = completionModel.items;
    assert.strictEqual(first.textLabel, "false");
    assert.strictEqual(second.textLabel, "float");
    assert.strictEqual(third.textLabel, "for");
    assert.strictEqual(fourth.textLabel, "foreach");
    assert.deepStrictEqual(editor.getSelection(), new Selection(1, 2, 1, 2));
    editor.trigger("keyboard", "type", { text: "o" });
    assert.deepStrictEqual(editor.getSelection(), new Selection(1, 3, 1, 3));
    controller.acceptSelectedSuggestion(false, false);
    assert.strictEqual(editor.getValue(), "for");
  });
  test.skip("Suggest widget gets orphaned in editor #187779", async function() {
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        const word = doc.getLineContent(pos.lineNumber);
        const range = new Range(pos.lineNumber, 1, pos.lineNumber, pos.column);
        return {
          suggestions: [{
            kind: CompletionItemKind.Text,
            label: word,
            insertText: word,
            range
          }]
        };
      }
    }));
    editor.setValue(`console.log(example.)
console.log(EXAMPLE.not)`);
    editor.setSelection(new Selection(1, 21, 1, 21));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    await p1;
    const p2 = Event.toPromise(controller.model.onDidCancel);
    new DeleteLinesAction().run(null, editor);
    await p2;
  });
  test("Ranges where additionalTextEdits are applied are not appropriate when characters are typed #177591", async function() {
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Snippet,
            label: "aaa",
            insertText: "aaa",
            range: Range.fromPositions(pos),
            additionalTextEdits: [{
              range: Range.fromPositions(pos.delta(0, 10)),
              text: "aaa"
            }]
          }]
        };
      }
    }));
    {
      editor.setValue(`123456789123456789`);
      editor.setSelection(new Selection(1, 1, 1, 1));
      const p1 = Event.toPromise(controller.model.onDidSuggest);
      controller.triggerSuggest();
      const e = await p1;
      assert.strictEqual(e.completionModel.items.length, 1);
      assert.strictEqual(e.completionModel.items[0].textLabel, "aaa");
      controller.acceptSelectedSuggestion(false, false);
      assert.strictEqual(editor.getValue(), "aaa1234567891aaa23456789");
    }
    {
      editor.setValue(`123456789123456789`);
      editor.setSelection(new Selection(1, 1, 1, 1));
      const p1 = Event.toPromise(controller.model.onDidSuggest);
      controller.triggerSuggest();
      const e = await p1;
      assert.strictEqual(e.completionModel.items.length, 1);
      assert.strictEqual(e.completionModel.items[0].textLabel, "aaa");
      editor.trigger("keyboard", "type", { text: "aa" });
      controller.acceptSelectedSuggestion(false, false);
      assert.strictEqual(editor.getValue(), "aaa1234567891aaa23456789");
    }
  });
  test.skip('[Bug] "No suggestions" persists while typing if the completion helper is set to return an empty list for empty content#3557', async function() {
    let requestCount = 0;
    disposables.add(languageFeaturesService.completionProvider.register({ scheme: "test-ctrl" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        requestCount += 1;
        if (requestCount === 1) {
          return void 0;
        }
        return {
          suggestions: [{
            kind: CompletionItemKind.Text,
            label: "foo",
            insertText: "foo",
            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
          }]
        };
      }
    }));
    const p1 = Event.toPromise(controller.model.onDidSuggest);
    controller.triggerSuggest();
    const e1 = await p1;
    assert.strictEqual(e1.completionModel.items.length, 0);
    assert.strictEqual(requestCount, 1);
    const p2 = Event.toPromise(controller.model.onDidSuggest);
    editor.trigger("keyboard", "type", { text: "f" });
    const e2 = await p2;
    assert.strictEqual(e2.completionModel.items.length, 1);
    assert.strictEqual(requestCount, 2);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXHRlc3RcXGJyb3dzZXJcXHN1Z2dlc3RDb250cm9sbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLCBDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJU3VnZ2VzdE1lbW9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3N1Z2dlc3RNZW1vcnkuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdENvZGVFZGl0b3IsIElUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNb2NrS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBEZWxldGVMaW5lc0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2xpbmVzT3BlcmF0aW9ucy9icm93c2VyL2xpbmVzT3BlcmF0aW9ucy5qcyc7XG5cbnN1aXRlKCdTdWdnZXN0Q29udHJvbGxlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRsZXQgY29udHJvbGxlcjogU3VnZ2VzdENvbnRyb2xsZXI7XG5cdGxldCBlZGl0b3I6IElUZXN0Q29kZUVkaXRvcjtcblx0bGV0IG1vZGVsOiBUZXh0TW9kZWw7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gbmV3IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKCk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0Ly8gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qgc2VydmljZUNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZV0sXG5cdFx0XHRbSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlXSxcblx0XHRcdFtJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCldLFxuXHRcdFx0W0lTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpXSxcblx0XHRcdFtJS2V5YmluZGluZ1NlcnZpY2UsIG5ldyBNb2NrS2V5YmluZGluZ1NlcnZpY2UoKV0sXG5cdFx0XHRbSUVkaXRvcldvcmtlclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvcldvcmtlclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBjb21wdXRlV29yZFJhbmdlcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0XHRbSVN1Z2dlc3RNZW1vcnlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTdWdnZXN0TWVtb3J5U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG1lbW9yaXplKCk6IHZvaWQgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIHNlbGVjdCgpOiBudW1iZXIgeyByZXR1cm4gMDsgfVxuXHRcdFx0fV0sXG5cdFx0XHRbSU1lbnVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNZW51U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGNyZWF0ZU1lbnUoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1lbnU+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgZGlzcG9zZSgpIHsgfVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdFx0W0lMYWJlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhYmVsU2VydmljZT4oKSB7IH1dLFxuXHRcdFx0W0lXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkgeyB9XSxcblx0XHRcdFtJRW52aXJvbm1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFbnZpcm9ubWVudFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBpc0J1aWx0OiBib29sZWFuID0gdHJ1ZTtcblx0XHRcdFx0b3ZlcnJpZGUgaXNFeHRlbnNpb25EZXZlbG9wbWVudDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0fV0sXG5cdFx0KTtcblxuXHRcdG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdC1jdHJsJywgcGF0aDogJy9wYXRoLnRzdCcgfSkpKTtcblx0XHRlZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgc2VydmljZUNvbGxlY3Rpb24gfSkpO1xuXG5cdFx0ZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oU25pcHBldENvbnRyb2xsZXIyLklELCBTbmlwcGV0Q29udHJvbGxlcjIpO1xuXHRcdGNvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihTdWdnZXN0Q29udHJvbGxlci5JRCwgU3VnZ2VzdENvbnRyb2xsZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3N0Zml4IGNvbXBsZXRpb24gcmVwb3J0cyBpbmNvcnJlY3QgcG9zaXRpb24gIzg2OTg0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0LWN0cmwnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnbGV0Jyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdsZXQgJHsxOm5hbWV9ID0gZm9vJDAnLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dFJ1bGVzOiBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLkluc2VydEFzU25pcHBldCxcblx0XHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDksIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMTEgfSxcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxUZXh0RWRpdHM6IFt7XG5cdFx0XHRcdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiA1LCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDkgfVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGVkaXRvci5zZXRWYWx1ZSgnICAgIGZvby5sZScpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgMTEpKTtcblxuXHRcdC8vIHRyaWdnZXJcblx0XHRjb25zdCBwMSA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkU3VnZ2VzdCk7XG5cdFx0Y29udHJvbGxlci50cmlnZ2VyU3VnZ2VzdCgpO1xuXHRcdGF3YWl0IHAxO1xuXG5cdFx0Ly9cblx0XHRjb25zdCBwMiA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkQ2FuY2VsKTtcblx0XHRjb250cm9sbGVyLmFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbihmYWxzZSwgZmFsc2UpO1xuXHRcdGF3YWl0IHAyO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnICAgIGxldCBuYW1lID0gZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZSBhZGRpdGlvbmFsVGV4dEVkaXRzIHN5bmMgd2hlbiBwb3NzaWJsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0LWN0cmwnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnbGV0Jyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdoZWxsbycsXG5cdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3MpLFxuXHRcdFx0XHRcdFx0YWRkaXRpb25hbFRleHRFZGl0czogW3tcblx0XHRcdFx0XHRcdFx0dGV4dDogJ0kgY2FtZSBzeW5jJyxcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyByZXNvbHZlQ29tcGxldGlvbkl0ZW0oaXRlbSkge1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRlZGl0b3Iuc2V0VmFsdWUoJ2hlbGxvXFxuaGFsbG8nKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNiwgMiwgNikpO1xuXG5cdFx0Ly8gdHJpZ2dlclxuXHRcdGNvbnN0IHAxID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIubW9kZWwub25EaWRTdWdnZXN0KTtcblx0XHRjb250cm9sbGVyLnRyaWdnZXJTdWdnZXN0KCk7XG5cdFx0YXdhaXQgcDE7XG5cblx0XHQvL1xuXHRcdGNvbnN0IHAyID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIubW9kZWwub25EaWRDYW5jZWwpO1xuXHRcdGNvbnRyb2xsZXIuYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uKGZhbHNlLCBmYWxzZSk7XG5cdFx0YXdhaXQgcDI7XG5cblx0XHQvLyBpbnNlcnRUZXh0IGhhcHBlbnMgc3luYyFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFZhbHVlKCksICdJIGNhbWUgc3luY2hlbGxvXFxuaGFsbG9oZWxsbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGFkZGl0aW9uYWxUZXh0RWRpdHMgYXN5bmMgd2hlbiBuZWVkZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgcmVzb2x2ZUNhbGxDb3VudCA9IDA7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdC1jdHJsJyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ2xldCcsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnaGVsbG8nLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zKVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcmVzb2x2ZUNvbXBsZXRpb25JdGVtKGl0ZW0pIHtcblx0XHRcdFx0cmVzb2x2ZUNhbGxDb3VudCArPSAxO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0aXRlbS5hZGRpdGlvbmFsVGV4dEVkaXRzID0gW3tcblx0XHRcdFx0XHR0ZXh0OiAnSSBjYW1lIGxhdGUnLFxuXHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9XG5cdFx0XHRcdH1dO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRlZGl0b3Iuc2V0VmFsdWUoJ2hlbGxvXFxuaGFsbG8nKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNiwgMiwgNikpO1xuXG5cdFx0Ly8gdHJpZ2dlclxuXHRcdGNvbnN0IHAxID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIubW9kZWwub25EaWRTdWdnZXN0KTtcblx0XHRjb250cm9sbGVyLnRyaWdnZXJTdWdnZXN0KCk7XG5cdFx0YXdhaXQgcDE7XG5cblx0XHQvL1xuXHRcdGNvbnN0IHAyID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIubW9kZWwub25EaWRDYW5jZWwpO1xuXHRcdGNvbnRyb2xsZXIuYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uKGZhbHNlLCBmYWxzZSk7XG5cdFx0YXdhaXQgcDI7XG5cblx0XHQvLyBpbnNlcnRUZXh0IGhhcHBlbnMgc3luYyFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFZhbHVlKCksICdoZWxsb1xcbmhhbGxvaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUNhbGxDb3VudCwgMSk7XG5cblx0XHQvLyBhZGRpdGlvbmFsIGVkaXRzIGhhcHBlbmVkIGFmdGVyIGEgbGl0dGUgd2FpdFxuXHRcdGF3YWl0IHRpbWVvdXQoMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJ0kgY2FtZSBsYXRlaGVsbG9cXG5oYWxsb2hlbGxvJyk7XG5cblx0XHQvLyBzaW5nbGUgdW5kbyBzdG9wXG5cdFx0ZWRpdG9yLmdldE1vZGVsKCk/LnVuZG8oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFZhbHVlKCksICdoZWxsb1xcbmhhbGxvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgYWRkaXRpb25hbFRleHRFZGl0cyBhc3luYyB3aGVuIG5lZWRlZCAodHlwaW5nKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCByZXNvbHZlQ2FsbENvdW50ID0gMDtcblx0XHRsZXQgcmVzb2x2ZTogRnVuY3Rpb24gPSAoKSA9PiB7IH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QtY3RybCcgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICd0ZXN0Jyxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoZG9jLCBwb3MpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0LFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdsZXQnLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ2hlbGxvJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcylcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHJlc29sdmVDb21wbGV0aW9uSXRlbShpdGVtKSB7XG5cdFx0XHRcdHJlc29sdmVDYWxsQ291bnQgKz0gMTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UoX3Jlc29sdmUgPT4gcmVzb2x2ZSA9IF9yZXNvbHZlKTtcblx0XHRcdFx0aXRlbS5hZGRpdGlvbmFsVGV4dEVkaXRzID0gW3tcblx0XHRcdFx0XHR0ZXh0OiAnSSBjYW1lIGxhdGUnLFxuXHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9XG5cdFx0XHRcdH1dO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRlZGl0b3Iuc2V0VmFsdWUoJ2hlbGxvXFxuaGFsbG8nKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNiwgMiwgNikpO1xuXG5cdFx0Ly8gdHJpZ2dlclxuXHRcdGNvbnN0IHAxID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIubW9kZWwub25EaWRTdWdnZXN0KTtcblx0XHRjb250cm9sbGVyLnRyaWdnZXJTdWdnZXN0KCk7XG5cdFx0YXdhaXQgcDE7XG5cblx0XHQvL1xuXHRcdGNvbnN0IHAyID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIubW9kZWwub25EaWRDYW5jZWwpO1xuXHRcdGNvbnRyb2xsZXIuYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uKGZhbHNlLCBmYWxzZSk7XG5cdFx0YXdhaXQgcDI7XG5cblx0XHQvLyBpbnNlcnRUZXh0IGhhcHBlbnMgc3luYyFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFZhbHVlKCksICdoZWxsb1xcbmhhbGxvaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUNhbGxDb3VudCwgMSk7XG5cblx0XHQvLyBhZGRpdGlvbmFsIGVkaXRzIGhhcHBlbmVkIGFmdGVyIGEgbGl0dGUgd2FpdFxuXHRcdGFzc2VydC5vayhlZGl0b3IuZ2V0U2VsZWN0aW9uKCk/LmVxdWFsc1NlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDExLCAyLCAxMSkpKTtcblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnVFlQSU5HJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJ2hlbGxvXFxuaGFsbG9oZWxsb1RZUElORycpO1xuXG5cdFx0cmVzb2x2ZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJ0kgY2FtZSBsYXRlaGVsbG9cXG5oYWxsb2hlbGxvVFlQSU5HJyk7XG5cdFx0YXNzZXJ0Lm9rKGVkaXRvci5nZXRTZWxlY3Rpb24oKT8uZXF1YWxzU2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMTcsIDIsIDE3KSkpO1xuXHR9KTtcblxuXHQvLyBhZGRpdGlvbmFsIGVkaXQgY29tZSBsYXRlIGFuZCBhcmUgQUZURVIgdGhlIHNlbGVjdGlvbiAtPiBjYW5jZWxcblx0dGVzdCgncmVzb2x2ZSBhZGRpdGlvbmFsVGV4dEVkaXRzIGFzeW5jIHdoZW4gbmVlZGVkIChzaW1wbGUgY29uZmxpY3QpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHJlc29sdmVDYWxsQ291bnQgPSAwO1xuXHRcdGxldCByZXNvbHZlOiBGdW5jdGlvbiA9ICgpID0+IHsgfTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdC1jdHJsJyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ2xldCcsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnaGVsbG8nLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zKVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcmVzb2x2ZUNvbXBsZXRpb25JdGVtKGl0ZW0pIHtcblx0XHRcdFx0cmVzb2x2ZUNhbGxDb3VudCArPSAxO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShfcmVzb2x2ZSA9PiByZXNvbHZlID0gX3Jlc29sdmUpO1xuXHRcdFx0XHRpdGVtLmFkZGl0aW9uYWxUZXh0RWRpdHMgPSBbe1xuXHRcdFx0XHRcdHRleHQ6ICdJIGNhbWUgbGF0ZScsXG5cdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogNiwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA2IH1cblx0XHRcdFx0fV07XG5cdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGVkaXRvci5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdC8vIHRyaWdnZXJcblx0XHRjb25zdCBwMSA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkU3VnZ2VzdCk7XG5cdFx0Y29udHJvbGxlci50cmlnZ2VyU3VnZ2VzdCgpO1xuXHRcdGF3YWl0IHAxO1xuXG5cdFx0Ly9cblx0XHRjb25zdCBwMiA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkQ2FuY2VsKTtcblx0XHRjb250cm9sbGVyLmFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbihmYWxzZSwgZmFsc2UpO1xuXHRcdGF3YWl0IHAyO1xuXG5cdFx0Ly8gaW5zZXJ0VGV4dCBoYXBwZW5zIHN5bmMhXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUNhbGxDb3VudCwgMSk7XG5cblx0XHRyZXNvbHZlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnaGVsbG8nKTtcblx0fSk7XG5cblx0Ly8gYWRkaXRpb25hbCBlZGl0IGNvbWUgbGF0ZSBhbmQgYXJlIEFGVEVSIHRoZSBwb3NpdGlvbiBhdCB3aGljaCB0aGUgdXNlciB0eXBlZCAtPiBjYW5jZWxsZWRcblx0dGVzdCgncmVzb2x2ZSBhZGRpdGlvbmFsVGV4dEVkaXRzIGFzeW5jIHdoZW4gbmVlZGVkIChjb25mbGljdCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgcmVzb2x2ZUNhbGxDb3VudCA9IDA7XG5cdFx0bGV0IHJlc29sdmU6IEZ1bmN0aW9uID0gKCkgPT4geyB9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0LWN0cmwnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnbGV0Jyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdoZWxsbycsXG5cdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3MpXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyByZXNvbHZlQ29tcGxldGlvbkl0ZW0oaXRlbSkge1xuXHRcdFx0XHRyZXNvbHZlQ2FsbENvdW50ICs9IDE7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKF9yZXNvbHZlID0+IHJlc29sdmUgPSBfcmVzb2x2ZSk7XG5cdFx0XHRcdGl0ZW0uYWRkaXRpb25hbFRleHRFZGl0cyA9IFt7XG5cdFx0XHRcdFx0dGV4dDogJ0kgY2FtZSBsYXRlJyxcblx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAyLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDIgfVxuXHRcdFx0XHR9XTtcblx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZWRpdG9yLnNldFZhbHVlKCdoZWxsb1xcbmhhbGxvJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDYsIDIsIDYpKTtcblxuXHRcdC8vIHRyaWdnZXJcblx0XHRjb25zdCBwMSA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkU3VnZ2VzdCk7XG5cdFx0Y29udHJvbGxlci50cmlnZ2VyU3VnZ2VzdCgpO1xuXHRcdGF3YWl0IHAxO1xuXG5cdFx0Ly9cblx0XHRjb25zdCBwMiA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkQ2FuY2VsKTtcblx0XHRjb250cm9sbGVyLmFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbihmYWxzZSwgZmFsc2UpO1xuXHRcdGF3YWl0IHAyO1xuXG5cdFx0Ly8gaW5zZXJ0VGV4dCBoYXBwZW5zIHN5bmMhXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnaGVsbG9cXG5oYWxsb2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDYWxsQ291bnQsIDEpO1xuXG5cdFx0Ly8gYWRkaXRpb25hbCBlZGl0cyBoYXBwZW5lZCBhZnRlciBhIGxpdHRlIHdhaXRcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdUWVBJTkcnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnVFlQSU5HaGVsbG9cXG5oYWxsb2hlbGxvJyk7XG5cblx0XHRyZXNvbHZlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnVFlQSU5HaGVsbG9cXG5oYWxsb2hlbGxvJyk7XG5cdFx0YXNzZXJ0Lm9rKGVkaXRvci5nZXRTZWxlY3Rpb24oKT8uZXF1YWxzU2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSBhZGRpdGlvbmFsVGV4dEVkaXRzIGFzeW5jIHdoZW4gbmVlZGVkIChjYW5jZWwpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcmVzb2x2ZTogRnVuY3Rpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0LWN0cmwnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnbGV0Jyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdoZWxsbycsXG5cdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3MpXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ2xldCcsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnaGFsbG8nLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zKVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcmVzb2x2ZUNvbXBsZXRpb25JdGVtKGl0ZW0pIHtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UoX3Jlc29sdmUgPT4gcmVzb2x2ZS5wdXNoKF9yZXNvbHZlKSk7XG5cdFx0XHRcdGl0ZW0uYWRkaXRpb25hbFRleHRFZGl0cyA9IFt7XG5cdFx0XHRcdFx0dGV4dDogJ2FkZGl0aW9uYWxUZXh0RWRpdHMnLFxuXHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDIsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMiB9XG5cdFx0XHRcdH1dO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRlZGl0b3Iuc2V0VmFsdWUoJ2FiYycpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cblx0XHQvLyB0cmlnZ2VyXG5cdFx0Y29uc3QgcDEgPSBFdmVudC50b1Byb21pc2UoY29udHJvbGxlci5tb2RlbC5vbkRpZFN1Z2dlc3QpO1xuXHRcdGNvbnRyb2xsZXIudHJpZ2dlclN1Z2dlc3QoKTtcblx0XHRhd2FpdCBwMTtcblxuXHRcdC8vXG5cdFx0Y29uc3QgcDIgPSBFdmVudC50b1Byb21pc2UoY29udHJvbGxlci5tb2RlbC5vbkRpZENhbmNlbCk7XG5cdFx0Y29udHJvbGxlci5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24odHJ1ZSwgZmFsc2UpO1xuXHRcdGF3YWl0IHAyO1xuXG5cdFx0Ly8gaW5zZXJ0VGV4dCBoYXBwZW5zIHN5bmMhXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnaGVsbG9hYmMnKTtcblxuXHRcdC8vIG5leHRcblx0XHRjb250cm9sbGVyLmFjY2VwdE5leHRTdWdnZXN0aW9uKCk7XG5cblx0XHQvLyByZXNvbHZlIGFkZGl0aW9uYWwgZWRpdHMgKE1VU1QgYmUgY2FuY2VsbGVkKVxuXHRcdHJlc29sdmUuZm9yRWFjaChmbiA9PiBmbik7XG5cdFx0cmVzb2x2ZS5sZW5ndGggPSAwO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Ly8gbmV4dCBzdWdnZXN0aW9uIHVzZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFZhbHVlKCksICdoYWxsb2FiYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb21wbGV0aW9uIGVkaXRzIGFyZSBhcHBsaWVkIGluY29uc2lzdGVudGx5IHdoZW4gYWRkaXRpb25hbFRleHRFZGl0cyBhbmQgdGV4dEVkaXQgc3RhcnQgYXQgdGhlIHNhbWUgb2Zmc2V0ICMxNDM4ODgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0LWN0cmwnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnTXlDbGFzc05hbWUnLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ015Q2xhc3NOYW1lJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcyksXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsVGV4dEVkaXRzOiBbe1xuXHRcdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3MpLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnaW1wb3J0IFwibXlfY2xhc3MudHh0XCI7XFxuJ1xuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGVkaXRvci5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdC8vIHRyaWdnZXJcblx0XHRjb25zdCBwMSA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkU3VnZ2VzdCk7XG5cdFx0Y29udHJvbGxlci50cmlnZ2VyU3VnZ2VzdCgpO1xuXHRcdGF3YWl0IHAxO1xuXG5cdFx0Ly9cblx0XHRjb25zdCBwMiA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkQ2FuY2VsKTtcblx0XHRjb250cm9sbGVyLmFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbih0cnVlLCBmYWxzZSk7XG5cdFx0YXdhaXQgcDI7XG5cblx0XHQvLyBpbnNlcnRUZXh0IGhhcHBlbnMgc3luYyFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFZhbHVlKCksICdpbXBvcnQgXCJteV9jbGFzcy50eHRcIjtcXG5NeUNsYXNzTmFtZScpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ1ByZXNzaW5nIGVudGVyIG9uIGF1dG9jb21wbGV0ZSBzaG91bGQgYWx3YXlzIGFwcGx5IHRoZSBzZWxlY3RlZCBkcm9wZG93biBjb21wbGV0aW9uLCBub3QgYSBkaWZmZXJlbnQsIGhpZGRlbiBvbmUgIzE2MTg4MycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdC1jdHJsJyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcykge1xuXG5cdFx0XHRcdGNvbnN0IHdvcmQgPSBkb2MuZ2V0V29yZFVudGlsUG9zaXRpb24ocG9zKTtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zLmxpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIHBvcy5saW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbik7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdmaWx0ZXJCYW5rU2l6ZScsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnZmlsdGVyQmFua1NpemUnLFxuXHRcdFx0XHRcdFx0c29ydFRleHQ6ICdhJyxcblx0XHRcdFx0XHRcdHJhbmdlXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ2ZpbHRlcicsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnZmlsdGVyJyxcblx0XHRcdFx0XHRcdHNvcnRUZXh0OiAnYicsXG5cdFx0XHRcdFx0XHRyYW5nZVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZWRpdG9yLnNldFZhbHVlKCdmaWx0ZScpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cblx0XHRjb25zdCBwMSA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkU3VnZ2VzdCk7XG5cdFx0Y29udHJvbGxlci50cmlnZ2VyU3VnZ2VzdCgpO1xuXG5cdFx0Y29uc3QgeyBjb21wbGV0aW9uTW9kZWwgfSA9IGF3YWl0IHAxO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAyKTtcblxuXHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGNvbXBsZXRpb25Nb2RlbC5pdGVtcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dExhYmVsLCAnZmlsdGVyQmFua1NpemUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnRleHRMYWJlbCwgJ2ZpbHRlcicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNikpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsICd0eXBlJywgeyB0ZXh0OiAncicgfSk7IC8vIG5vdyBmaWx0ZXIgXCJvdmVydGFrZXNcIiBmaWx0ZXJCYW5rU2l6ZSBiZWNhdXNlIGl0IGlzIGZ1bGx5IG1hdGNoZWRcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSk7XG5cblx0XHRjb250cm9sbGVyLmFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbihmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJ2ZpbHRlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdGYXN0IGF1dG9jb21wbGUgdHlwaW5nIHNlbGVjdHMgdGhlIHByZXZpb3VzIGF1dG9jb21wbGV0ZSBzdWdnZXN0aW9uLCAjNzE3OTUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QtY3RybCcgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICd0ZXN0Jyxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoZG9jLCBwb3MpIHtcblxuXHRcdFx0XHRjb25zdCB3b3JkID0gZG9jLmdldFdvcmRVbnRpbFBvc2l0aW9uKHBvcyk7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCBwb3MubGluZU51bWJlciwgd29yZC5lbmRDb2x1bW4pO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnZmFsc2UnLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ2ZhbHNlJyxcblx0XHRcdFx0XHRcdHJhbmdlXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ2Zsb2F0Jyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdmbG9hdCcsXG5cdFx0XHRcdFx0XHRyYW5nZVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdmb3InLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ2ZvcicsXG5cdFx0XHRcdFx0XHRyYW5nZVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdmb3JlYWNoJyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdmb3JlYWNoJyxcblx0XHRcdFx0XHRcdHJhbmdlXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRlZGl0b3Iuc2V0VmFsdWUoJ2YnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMikpO1xuXG5cdFx0Y29uc3QgcDEgPSBFdmVudC50b1Byb21pc2UoY29udHJvbGxlci5tb2RlbC5vbkRpZFN1Z2dlc3QpO1xuXHRcdGNvbnRyb2xsZXIudHJpZ2dlclN1Z2dlc3QoKTtcblxuXHRcdGNvbnN0IHsgY29tcGxldGlvbk1vZGVsIH0gPSBhd2FpdCBwMTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgNCk7XG5cblx0XHRjb25zdCBbZmlyc3QsIHNlY29uZCwgdGhpcmQsIGZvdXJ0aF0gPSBjb21wbGV0aW9uTW9kZWwuaXRlbXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHRMYWJlbCwgJ2ZhbHNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC50ZXh0TGFiZWwsICdmbG9hdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlyZC50ZXh0TGFiZWwsICdmb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91cnRoLnRleHRMYWJlbCwgJ2ZvcmVhY2gnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpKTtcblx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAndHlwZScsIHsgdGV4dDogJ28nIH0pOyAvLyBmaWx0ZXJzYGZhbHNlYCBhbmQgYGZsb2F0YFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpKTtcblxuXHRcdGNvbnRyb2xsZXIuYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uKGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnZm9yJyk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnU3VnZ2VzdCB3aWRnZXQgZ2V0cyBvcnBoYW5lZCBpbiBlZGl0b3IgIzE4Nzc3OScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0LWN0cmwnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cblx0XHRcdFx0Y29uc3Qgd29yZCA9IGRvYy5nZXRMaW5lQ29udGVudChwb3MubGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCAxLCBwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbik7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0bGFiZWw6IHdvcmQsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiB3b3JkLFxuXHRcdFx0XHRcdFx0cmFuZ2Vcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGVkaXRvci5zZXRWYWx1ZShgY29uc29sZS5sb2coZXhhbXBsZS4pXFxuY29uc29sZS5sb2coRVhBTVBMRS5ub3QpYCk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDIxLCAxLCAyMSkpO1xuXG5cdFx0Y29uc3QgcDEgPSBFdmVudC50b1Byb21pc2UoY29udHJvbGxlci5tb2RlbC5vbkRpZFN1Z2dlc3QpO1xuXHRcdGNvbnRyb2xsZXIudHJpZ2dlclN1Z2dlc3QoKTtcblxuXHRcdGF3YWl0IHAxO1xuXG5cdFx0Y29uc3QgcDIgPSBFdmVudC50b1Byb21pc2UoY29udHJvbGxlci5tb2RlbC5vbkRpZENhbmNlbCk7XG5cdFx0bmV3IERlbGV0ZUxpbmVzQWN0aW9uKCkucnVuKG51bGwhLCBlZGl0b3IpO1xuXG5cdFx0YXdhaXQgcDI7XG5cdH0pO1xuXG5cdHRlc3QoJ1JhbmdlcyB3aGVyZSBhZGRpdGlvbmFsVGV4dEVkaXRzIGFyZSBhcHBsaWVkIGFyZSBub3QgYXBwcm9wcmlhdGUgd2hlbiBjaGFyYWN0ZXJzIGFyZSB0eXBlZCAjMTc3NTkxJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0LWN0cmwnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnYWFhJyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdhYWEnLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zKSxcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxUZXh0RWRpdHM6IFt7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcy5kZWx0YSgwLCAxMCkpLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnYWFhJ1xuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHsgLy8gUEFSVDEgLSBubyB0eXBpbmdcblx0XHRcdGVkaXRvci5zZXRWYWx1ZShgMTIzNDU2Nzg5MTIzNDU2Nzg5YCk7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdFx0Y29uc3QgcDEgPSBFdmVudC50b1Byb21pc2UoY29udHJvbGxlci5tb2RlbC5vbkRpZFN1Z2dlc3QpO1xuXHRcdFx0Y29udHJvbGxlci50cmlnZ2VyU3VnZ2VzdCgpO1xuXG5cdFx0XHRjb25zdCBlID0gYXdhaXQgcDE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmNvbXBsZXRpb25Nb2RlbC5pdGVtc1swXS50ZXh0TGFiZWwsICdhYWEnKTtcblxuXHRcdFx0Y29udHJvbGxlci5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24oZmFsc2UsIGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnYWFhMTIzNDU2Nzg5MWFhYTIzNDU2Nzg5Jyk7XG5cdFx0fVxuXG5cdFx0eyAvLyBQQVJUMiAtIHR5cGluZ1xuXHRcdFx0ZWRpdG9yLnNldFZhbHVlKGAxMjM0NTY3ODkxMjM0NTY3ODlgKTtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0XHRjb25zdCBwMSA9IEV2ZW50LnRvUHJvbWlzZShjb250cm9sbGVyLm1vZGVsLm9uRGlkU3VnZ2VzdCk7XG5cdFx0XHRjb250cm9sbGVyLnRyaWdnZXJTdWdnZXN0KCk7XG5cblx0XHRcdGNvbnN0IGUgPSBhd2FpdCBwMTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuY29tcGxldGlvbk1vZGVsLml0ZW1zWzBdLnRleHRMYWJlbCwgJ2FhYScpO1xuXG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAndHlwZScsIHsgdGV4dDogJ2FhJyB9KTtcblxuXHRcdFx0Y29udHJvbGxlci5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24oZmFsc2UsIGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnYWFhMTIzNDU2Nzg5MWFhYTIzNDU2Nzg5Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ1tCdWddIFwiTm8gc3VnZ2VzdGlvbnNcIiBwZXJzaXN0cyB3aGlsZSB0eXBpbmcgaWYgdGhlIGNvbXBsZXRpb24gaGVscGVyIGlzIHNldCB0byByZXR1cm4gYW4gZW1wdHkgbGlzdCBmb3IgZW1wdHkgY29udGVudCMzNTU3JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCByZXF1ZXN0Q291bnQgPSAwO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QtY3RybCcgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICd0ZXN0Jyxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoZG9jLCBwb3MpIHtcblx0XHRcdFx0cmVxdWVzdENvdW50ICs9IDE7XG5cblx0XHRcdFx0aWYgKHJlcXVlc3RDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ2ZvbycsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnZm9vJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zLmxpbmVOdW1iZXIsIDEsIHBvcy5saW5lTnVtYmVyLCBwb3MuY29sdW1uKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHAxID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIubW9kZWwub25EaWRTdWdnZXN0KTtcblx0XHRjb250cm9sbGVyLnRyaWdnZXJTdWdnZXN0KCk7XG5cblx0XHRjb25zdCBlMSA9IGF3YWl0IHAxO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlMS5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdENvdW50LCAxKTtcblxuXHRcdGNvbnN0IHAyID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIubW9kZWwub25EaWRTdWdnZXN0KTtcblx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAndHlwZScsIHsgdGV4dDogJ2YnIH0pO1xuXG5cdFx0Y29uc3QgZTIgPSBhd2FpdCBwMjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZTIuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RDb3VudCwgMik7XG5cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsOEJBQThCLDBCQUEwQjtBQUNqRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE2QztBQUN0RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFnQixvQkFBb0I7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHdCQUF3Qix1QkFBdUI7QUFDeEQsU0FBUyx5QkFBeUI7QUFD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
