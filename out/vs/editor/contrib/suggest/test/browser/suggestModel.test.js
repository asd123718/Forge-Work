var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import assert from "assert";
import { ModifierKeyEmitter } from "../../../../../base/browser/dom.js";
import { timeout } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { MockKeybindingService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { CoreEditingCommands } from "../../../../browser/coreCommands.js";
import { EditOperation } from "../../../../common/core/editOperation.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { Handler } from "../../../../common/editorCommon.js";
import { MetadataConsts } from "../../../../common/encodedTokenAttributes.js";
import { CompletionItemKind, CompletionTriggerKind, EncodedTokenizationResult, TokenizationRegistry } from "../../../../common/languages.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../../common/languages/nullTokenize.js";
import { IEditorWorkerService } from "../../../../common/services/editorWorker.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { createTestCodeEditor, withAsyncTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { createModelServices, createTextModel, instantiateTextModel } from "../../../../test/common/testTextModel.js";
import { InlineCompletionsController } from "../../../inlineCompletions/browser/controller/inlineCompletionsController.js";
import { InlineSuggestionsView } from "../../../inlineCompletions/browser/view/inlineSuggestionsView.js";
import { SnippetController2 } from "../../../snippet/browser/snippetController2.js";
import { getSnippetSuggestSupport, setSnippetSuggestSupport } from "../../browser/suggest.js";
import { SuggestController } from "../../browser/suggestController.js";
import { ISuggestMemoryService } from "../../browser/suggestMemory.js";
import { LineContext, SuggestModel } from "../../browser/suggestModel.js";
function createMockEditor(model, languageFeaturesService) {
  const storeService = new InMemoryStorageService();
  const editor = createTestCodeEditor(model, {
    serviceCollection: new ServiceCollection(
      [ILanguageFeaturesService, languageFeaturesService],
      [ITelemetryService, NullTelemetryService],
      [IStorageService, storeService],
      [IKeybindingService, new MockKeybindingService()],
      [ISuggestMemoryService, new class {
        memorize() {
        }
        select() {
          return -1;
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
    )
  });
  const ctrl = editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
  editor.hasWidgetFocus = () => true;
  editor.registerDisposable(ctrl);
  editor.registerDisposable(storeService);
  return editor;
}
suite("SuggestModel - Context", function() {
  const OUTER_LANGUAGE_ID = "outerMode";
  const INNER_LANGUAGE_ID = "innerMode";
  let OuterMode = class extends Disposable {
    constructor(languageService, languageConfigurationService) {
      super();
      this.languageId = OUTER_LANGUAGE_ID;
      this._register(languageService.registerLanguage({ id: this.languageId }));
      this._register(languageConfigurationService.register(this.languageId, {}));
      this._register(TokenizationRegistry.register(this.languageId, {
        getInitialState: () => NullState,
        tokenize: void 0,
        tokenizeEncoded: (line, hasEOL, state) => {
          const tokensArr = [];
          let prevLanguageId = void 0;
          for (let i = 0; i < line.length; i++) {
            const languageId = line.charAt(i) === "x" ? INNER_LANGUAGE_ID : OUTER_LANGUAGE_ID;
            const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
            if (prevLanguageId !== languageId) {
              tokensArr.push(i);
              tokensArr.push(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET);
            }
            prevLanguageId = languageId;
          }
          const tokens = new Uint32Array(tokensArr.length);
          for (let i = 0; i < tokens.length; i++) {
            tokens[i] = tokensArr[i];
          }
          return new EncodedTokenizationResult(tokens, [], state);
        }
      }));
    }
  };
  OuterMode = __decorateClass([
    __decorateParam(0, ILanguageService),
    __decorateParam(1, ILanguageConfigurationService)
  ], OuterMode);
  let InnerMode = class extends Disposable {
    constructor(languageService, languageConfigurationService) {
      super();
      this.languageId = INNER_LANGUAGE_ID;
      this._register(languageService.registerLanguage({ id: this.languageId }));
      this._register(languageConfigurationService.register(this.languageId, {}));
    }
  };
  InnerMode = __decorateClass([
    __decorateParam(0, ILanguageService),
    __decorateParam(1, ILanguageConfigurationService)
  ], InnerMode);
  const assertAutoTrigger = (model, offset, expected, message) => {
    const pos = model.getPositionAt(offset);
    const editor = createMockEditor(model, new LanguageFeaturesService());
    editor.setPosition(pos);
    assert.strictEqual(LineContext.shouldAutoTrigger(editor), expected, message);
    editor.dispose();
  };
  let disposables;
  setup(() => {
    disposables = new DisposableStore();
  });
  teardown(function() {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Context - shouldAutoTrigger", function() {
    const model = createTextModel("Das Pferd frisst keinen Gurkensalat - Philipp Reis 1861.\nWer hat's erfunden?");
    disposables.add(model);
    assertAutoTrigger(model, 3, true, "end of word, Das|");
    assertAutoTrigger(model, 4, false, "no word Das |");
    assertAutoTrigger(model, 1, true, "typing a single character before a word: D|as");
    assertAutoTrigger(model, 55, false, "number, 1861|");
    model.dispose();
  });
  test("shouldAutoTrigger at embedded language boundaries", () => {
    const disposables2 = new DisposableStore();
    const instantiationService = createModelServices(disposables2);
    const outerMode = disposables2.add(instantiationService.createInstance(OuterMode));
    disposables2.add(instantiationService.createInstance(InnerMode));
    const model = disposables2.add(instantiateTextModel(instantiationService, "a<xx>a<x>", outerMode.languageId));
    assertAutoTrigger(model, 1, true, "a|<x \u2014 should trigger at end of word");
    assertAutoTrigger(model, 2, false, "a<|x \u2014 should NOT trigger at start of word");
    assertAutoTrigger(model, 3, true, "a<x|x \u2014  should trigger after typing a single character before a word");
    assertAutoTrigger(model, 4, true, "a<xx|> \u2014 should trigger at boundary between languages");
    assertAutoTrigger(model, 5, false, "a<xx>|a \u2014 should NOT trigger at start of word");
    assertAutoTrigger(model, 6, true, "a<xx>a|< \u2014 should trigger at end of word");
    assertAutoTrigger(model, 8, true, "a<xx>a<x|> \u2014 should trigger at end of word at boundary");
    disposables2.dispose();
  });
});
suite("SuggestModel - TriggerAndCancelOracle", function() {
  function getDefaultSuggestRange(model2, position) {
    const wordUntil = model2.getWordUntilPosition(position);
    return new Range(position.lineNumber, wordUntil.startColumn, position.lineNumber, wordUntil.endColumn);
  }
  const alwaysEmptySupport = {
    _debugDisplayName: "test",
    provideCompletionItems(doc, pos) {
      return {
        incomplete: false,
        suggestions: []
      };
    }
  };
  const alwaysSomethingSupport = {
    _debugDisplayName: "test",
    provideCompletionItems(doc, pos) {
      return {
        incomplete: false,
        suggestions: [{
          label: doc.getWordUntilPosition(pos).word,
          kind: CompletionItemKind.Property,
          insertText: "foofoo",
          range: getDefaultSuggestRange(doc, pos)
        }]
      };
    }
  };
  let disposables;
  let model;
  const languageFeaturesService = new LanguageFeaturesService();
  const registry = languageFeaturesService.completionProvider;
  setup(function() {
    disposables = new DisposableStore();
    model = createTextModel("abc def", void 0, void 0, URI.parse("test:somefile.ttt"));
    disposables.add(model);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function withOracle(callback) {
    return new Promise((resolve, reject) => {
      const editor = createMockEditor(model, languageFeaturesService);
      const oracle = editor.invokeWithinContext((accessor) => accessor.get(IInstantiationService).createInstance(SuggestModel, editor));
      disposables.add(oracle);
      disposables.add(editor);
      try {
        resolve(callback(oracle, editor));
      } catch (err) {
        reject(err);
      }
    });
  }
  function assertEvent(event, action, assert2) {
    return new Promise((resolve, reject) => {
      const sub = event((e) => {
        sub.dispose();
        try {
          resolve(assert2(e));
        } catch (err) {
          reject(err);
        }
      });
      try {
        action();
      } catch (err) {
        sub.dispose();
        reject(err);
      }
    });
  }
  test("events - cancel/trigger", function() {
    return withOracle((model2) => {
      return Promise.all([
        assertEvent(model2.onDidTrigger, function() {
          model2.trigger({ auto: true });
        }, function(event) {
          assert.strictEqual(event.auto, true);
          return assertEvent(model2.onDidCancel, function() {
            model2.cancel();
          }, function(event2) {
            assert.strictEqual(event2.retrigger, false);
          });
        }),
        assertEvent(model2.onDidTrigger, function() {
          model2.trigger({ auto: true });
        }, function(event) {
          assert.strictEqual(event.auto, true);
        }),
        assertEvent(model2.onDidTrigger, function() {
          model2.trigger({ auto: false });
        }, function(event) {
          assert.strictEqual(event.auto, false);
        })
      ]);
    });
  });
  test("events - suggest/empty", function() {
    disposables.add(registry.register({ scheme: "test" }, alwaysEmptySupport));
    return withOracle((model2) => {
      return Promise.all([
        assertEvent(model2.onDidCancel, function() {
          model2.trigger({ auto: true });
        }, function(event) {
          assert.strictEqual(event.retrigger, false);
        }),
        assertEvent(model2.onDidSuggest, function() {
          model2.trigger({ auto: false });
        }, function(event) {
          assert.strictEqual(event.triggerOptions.auto, false);
          assert.strictEqual(event.isFrozen, false);
          assert.strictEqual(event.completionModel.items.length, 0);
        })
      ]);
    });
  });
  test("trigger - on type", function() {
    disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
    return withOracle((model2, editor) => {
      return assertEvent(model2.onDidSuggest, () => {
        editor.setPosition({ lineNumber: 1, column: 4 });
        editor.trigger("keyboard", Handler.Type, { text: "d" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        const [first] = event.completionModel.items;
        assert.strictEqual(first.provider, alwaysSomethingSupport);
      });
    });
  });
  test("#17400: Keep filtering suggestModel.ts after space", function() {
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          incomplete: false,
          suggestions: [{
            label: "My Table",
            kind: CompletionItemKind.Property,
            insertText: "My Table",
            range: getDefaultSuggestRange(doc, pos)
          }]
        };
      }
    }));
    model.setValue("");
    return withOracle((model2, editor) => {
      return assertEvent(model2.onDidSuggest, () => {
        model2.trigger({ auto: true });
      }, (event) => {
        return assertEvent(model2.onDidSuggest, () => {
          editor.setPosition({ lineNumber: 1, column: 1 });
          editor.trigger("keyboard", Handler.Type, { text: "My" });
        }, (event2) => {
          assert.strictEqual(event2.triggerOptions.auto, true);
          assert.strictEqual(event2.completionModel.items.length, 1);
          const [first] = event2.completionModel.items;
          assert.strictEqual(first.completion.label, "My Table");
          return assertEvent(model2.onDidSuggest, () => {
            editor.setPosition({ lineNumber: 1, column: 3 });
            editor.trigger("keyboard", Handler.Type, { text: " " });
          }, (event3) => {
            assert.strictEqual(event3.triggerOptions.auto, true);
            assert.strictEqual(event3.completionModel.items.length, 1);
            const [first2] = event3.completionModel.items;
            assert.strictEqual(first2.completion.label, "My Table");
          });
        });
      });
    });
  });
  test("#21484: Trigger character always force a new completion session", function() {
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          incomplete: false,
          suggestions: [{
            label: "foo.bar",
            kind: CompletionItemKind.Property,
            insertText: "foo.bar",
            range: Range.fromPositions(pos.with(void 0, 1), pos)
          }]
        };
      }
    }));
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      triggerCharacters: ["."],
      provideCompletionItems(doc, pos) {
        return {
          incomplete: false,
          suggestions: [{
            label: "boom",
            kind: CompletionItemKind.Property,
            insertText: "boom",
            range: Range.fromPositions(
              pos.delta(0, doc.getLineContent(pos.lineNumber)[pos.column - 2] === "." ? 0 : -1),
              pos
            )
          }]
        };
      }
    }));
    model.setValue("");
    return withOracle(async (model2, editor) => {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setPosition({ lineNumber: 1, column: 1 });
        editor.trigger("keyboard", Handler.Type, { text: "foo" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        const [first] = event.completionModel.items;
        assert.strictEqual(first.completion.label, "foo.bar");
      });
      await assertEvent(model2.onDidSuggest, () => {
        editor.trigger("keyboard", Handler.Type, { text: "." });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        const [first] = event.completionModel.items;
        assert.strictEqual(first.completion.label, "foo.bar");
      });
      await assertEvent(model2.onDidSuggest, () => {
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 2);
        const [first, second] = event.completionModel.items;
        assert.strictEqual(first.completion.label, "foo.bar");
        assert.strictEqual(second.completion.label, "boom");
      });
    });
  });
  test("Intellisense Completion doesn't respect space after equal sign (.html file), #29353 [1/2]", function() {
    disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
    return withOracle((model2, editor) => {
      editor.getModel().setValue("fo");
      editor.setPosition({ lineNumber: 1, column: 3 });
      return assertEvent(model2.onDidSuggest, () => {
        model2.trigger({ auto: false });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, false);
        assert.strictEqual(event.isFrozen, false);
        assert.strictEqual(event.completionModel.items.length, 1);
        return assertEvent(model2.onDidCancel, () => {
          editor.trigger("keyboard", Handler.Type, { text: "+" });
        }, (event2) => {
          assert.strictEqual(event2.retrigger, false);
        });
      });
    });
  });
  test("Intellisense Completion doesn't respect space after equal sign (.html file), #29353 [2/2]", function() {
    disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
    return withOracle((model2, editor) => {
      editor.getModel().setValue("fo");
      editor.setPosition({ lineNumber: 1, column: 3 });
      return assertEvent(model2.onDidSuggest, () => {
        model2.trigger({ auto: false });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, false);
        assert.strictEqual(event.isFrozen, false);
        assert.strictEqual(event.completionModel.items.length, 1);
        return assertEvent(model2.onDidCancel, () => {
          editor.trigger("keyboard", Handler.Type, { text: " " });
        }, (event2) => {
          assert.strictEqual(event2.retrigger, false);
        });
      });
    });
  });
  test("Incomplete suggestion results cause re-triggering when typing w/o further context, #28400 (1/2)", function() {
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          incomplete: true,
          suggestions: [{
            label: "foo",
            kind: CompletionItemKind.Property,
            insertText: "foo",
            range: Range.fromPositions(pos.with(void 0, 1), pos)
          }]
        };
      }
    }));
    return withOracle((model2, editor) => {
      editor.getModel().setValue("foo");
      editor.setPosition({ lineNumber: 1, column: 4 });
      return assertEvent(model2.onDidSuggest, () => {
        model2.trigger({ auto: false });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, false);
        assert.strictEqual(event.completionModel.getIncompleteProvider().size, 1);
        assert.strictEqual(event.completionModel.items.length, 1);
        return assertEvent(model2.onDidCancel, () => {
          editor.trigger("keyboard", Handler.Type, { text: ";" });
        }, (event2) => {
          assert.strictEqual(event2.retrigger, false);
        });
      });
    });
  });
  test("Incomplete suggestion results cause re-triggering when typing w/o further context, #28400 (2/2)", function() {
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          incomplete: true,
          suggestions: [{
            label: "foo;",
            kind: CompletionItemKind.Property,
            insertText: "foo",
            range: Range.fromPositions(pos.with(void 0, 1), pos)
          }]
        };
      }
    }));
    return withOracle((model2, editor) => {
      editor.getModel().setValue("foo");
      editor.setPosition({ lineNumber: 1, column: 4 });
      return assertEvent(model2.onDidSuggest, () => {
        model2.trigger({ auto: false });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, false);
        assert.strictEqual(event.completionModel.getIncompleteProvider().size, 1);
        assert.strictEqual(event.completionModel.items.length, 1);
        return assertEvent(model2.onDidSuggest, () => {
          editor.trigger("keyboard", Handler.Type, { text: ";" });
        }, (event2) => {
          assert.strictEqual(event2.triggerOptions.auto, false);
          assert.strictEqual(event2.completionModel.getIncompleteProvider().size, 1);
          assert.strictEqual(event2.completionModel.items.length, 1);
        });
      });
    });
  });
  test("Trigger character is provided in suggest context", function() {
    let triggerCharacter = "";
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      triggerCharacters: ["."],
      provideCompletionItems(doc, pos, context) {
        assert.strictEqual(context.triggerKind, CompletionTriggerKind.TriggerCharacter);
        triggerCharacter = context.triggerCharacter;
        return {
          incomplete: false,
          suggestions: [
            {
              label: "foo.bar",
              kind: CompletionItemKind.Property,
              insertText: "foo.bar",
              range: Range.fromPositions(pos.with(void 0, 1), pos)
            }
          ]
        };
      }
    }));
    model.setValue("");
    return withOracle((model2, editor) => {
      return assertEvent(model2.onDidSuggest, () => {
        editor.setPosition({ lineNumber: 1, column: 1 });
        editor.trigger("keyboard", Handler.Type, { text: "foo." });
      }, (event) => {
        assert.strictEqual(triggerCharacter, ".");
      });
    });
  });
  test("Mac press and hold accent character insertion does not update suggestions, #35269", function() {
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          incomplete: true,
          suggestions: [{
            label: "abc",
            kind: CompletionItemKind.Property,
            insertText: "abc",
            range: Range.fromPositions(pos.with(void 0, 1), pos)
          }, {
            label: "\xE4bc",
            kind: CompletionItemKind.Property,
            insertText: "\xE4bc",
            range: Range.fromPositions(pos.with(void 0, 1), pos)
          }]
        };
      }
    }));
    model.setValue("");
    return withOracle((model2, editor) => {
      return assertEvent(model2.onDidSuggest, () => {
        editor.setPosition({ lineNumber: 1, column: 1 });
        editor.trigger("keyboard", Handler.Type, { text: "a" });
      }, (event) => {
        assert.strictEqual(event.completionModel.items.length, 1);
        assert.strictEqual(event.completionModel.items[0].completion.label, "abc");
        return assertEvent(model2.onDidSuggest, () => {
          editor.executeEdits("test", [EditOperation.replace(new Range(1, 1, 1, 2), "\xE4")]);
        }, (event2) => {
          assert.strictEqual(event2.completionModel.items.length, 1);
          assert.strictEqual(event2.completionModel.items[0].completion.label, "\xE4bc");
        });
      });
    });
  });
  test("Backspace should not always cancel code completion, #36491", function() {
    disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
    return withOracle(async (model2, editor) => {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setPosition({ lineNumber: 1, column: 4 });
        editor.trigger("keyboard", Handler.Type, { text: "d" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        const [first] = event.completionModel.items;
        assert.strictEqual(first.provider, alwaysSomethingSupport);
      });
      await assertEvent(model2.onDidSuggest, () => {
        editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        const [first] = event.completionModel.items;
        assert.strictEqual(first.provider, alwaysSomethingSupport);
      });
    });
  });
  test("Text changes for completion CodeAction are affected by the completion #39893", function() {
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          incomplete: true,
          suggestions: [{
            label: "bar",
            kind: CompletionItemKind.Property,
            insertText: "bar",
            range: Range.fromPositions(pos.delta(0, -2), pos),
            additionalTextEdits: [{
              text: ", bar",
              range: { startLineNumber: 1, endLineNumber: 1, startColumn: 17, endColumn: 17 }
            }]
          }]
        };
      }
    }));
    model.setValue('ba; import { foo } from "./b"');
    return withOracle(async (sugget, editor) => {
      class TestCtrl extends SuggestController {
        _insertSuggestion_publicForTest(item, flags = 0) {
          super._insertSuggestion(item, flags);
        }
      }
      const ctrl = editor.registerAndInstantiateContribution(TestCtrl.ID, TestCtrl);
      editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
      await assertEvent(sugget.onDidSuggest, () => {
        editor.setPosition({ lineNumber: 1, column: 3 });
        sugget.trigger({ auto: false });
      }, (event) => {
        assert.strictEqual(event.completionModel.items.length, 1);
        const [first] = event.completionModel.items;
        assert.strictEqual(first.completion.label, "bar");
        ctrl._insertSuggestion_publicForTest({ item: first, index: 0, model: event.completionModel });
      });
      assert.strictEqual(
        model.getValue(),
        'bar; import { foo, bar } from "./b"'
      );
    });
  });
  test("Completion unexpectedly triggers on second keypress of an edit group in a snippet #43523", function() {
    disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
    return withOracle((model2, editor) => {
      return assertEvent(model2.onDidSuggest, () => {
        editor.setValue("d");
        editor.setSelection(new Selection(1, 1, 1, 2));
        editor.trigger("keyboard", Handler.Type, { text: "e" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        const [first] = event.completionModel.items;
        assert.strictEqual(first.provider, alwaysSomethingSupport);
      });
    });
  });
  test("Fails to render completion details #47988", function() {
    let disposeA = 0;
    let disposeB = 0;
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          incomplete: true,
          suggestions: [{
            kind: CompletionItemKind.Folder,
            label: "CompleteNot",
            insertText: "Incomplete",
            sortText: "a",
            range: getDefaultSuggestRange(doc, pos)
          }],
          dispose() {
            disposeA += 1;
          }
        };
      }
    }));
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          incomplete: false,
          suggestions: [{
            kind: CompletionItemKind.Folder,
            label: "Complete",
            insertText: "Complete",
            sortText: "z",
            range: getDefaultSuggestRange(doc, pos)
          }],
          dispose() {
            disposeB += 1;
          }
        };
      },
      resolveCompletionItem(item) {
        return item;
      }
    }));
    return withOracle(async (model2, editor) => {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setValue("");
        editor.setSelection(new Selection(1, 1, 1, 1));
        editor.trigger("keyboard", Handler.Type, { text: "c" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 2);
        assert.strictEqual(disposeA, 0);
        assert.strictEqual(disposeB, 0);
      });
      await assertEvent(model2.onDidSuggest, () => {
        editor.trigger("keyboard", Handler.Type, { text: "o" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 2);
        model2.clear();
        assert.strictEqual(disposeA, 2);
        assert.strictEqual(disposeB, 1);
      });
    });
  });
  test("Trigger (full) completions when (incomplete) completions are already active #99504", function() {
    let countA = 0;
    let countB = 0;
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        countA += 1;
        return {
          incomplete: false,
          // doesn't matter if incomplete or not
          suggestions: [{
            kind: CompletionItemKind.Class,
            label: "Z aaa",
            insertText: "Z aaa",
            range: new Range(1, 1, pos.lineNumber, pos.column)
          }]
        };
      }
    }));
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        countB += 1;
        if (!doc.getWordUntilPosition(pos).word.startsWith("a")) {
          return;
        }
        return {
          incomplete: false,
          suggestions: [{
            kind: CompletionItemKind.Folder,
            label: "aaa",
            insertText: "aaa",
            range: getDefaultSuggestRange(doc, pos)
          }]
        };
      }
    }));
    return withOracle(async (model2, editor) => {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setValue("");
        editor.setSelection(new Selection(1, 1, 1, 1));
        editor.trigger("keyboard", Handler.Type, { text: "Z" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        assert.strictEqual(event.completionModel.items[0].textLabel, "Z aaa");
      });
      await assertEvent(model2.onDidSuggest, () => {
        editor.trigger("keyboard", Handler.Type, { text: " a" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 2);
        assert.strictEqual(event.completionModel.items[0].textLabel, "Z aaa");
        assert.strictEqual(event.completionModel.items[1].textLabel, "aaa");
        assert.strictEqual(countA, 1);
        assert.strictEqual(countB, 2);
      });
    });
  });
  test("registerCompletionItemProvider with letters as trigger characters block other completion items to show up #127815", async function() {
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Class,
            label: "AAAA",
            insertText: "WordTriggerA",
            range: new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
          }]
        };
      }
    }));
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      triggerCharacters: ["a", "."],
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Class,
            label: "AAAA",
            insertText: "AutoTriggerA",
            range: new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
          }]
        };
      }
    }));
    return withOracle(async (model2, editor) => {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setValue("");
        editor.setSelection(new Selection(1, 1, 1, 1));
        editor.trigger("keyboard", Handler.Type, { text: "." });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
      });
      editor.getModel().setValue("");
      await assertEvent(model2.onDidSuggest, () => {
        editor.setValue("");
        editor.setSelection(new Selection(1, 1, 1, 1));
        editor.trigger("keyboard", Handler.Type, { text: "a" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 2);
      });
    });
  });
  test("Unexpected suggest scoring #167242", async function() {
    disposables.add(registry.register("*", {
      // word-based
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        const word = doc.getWordUntilPosition(pos);
        return {
          suggestions: [{
            kind: CompletionItemKind.Text,
            label: "pull",
            insertText: "pull",
            range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn)
          }]
        };
      }
    }));
    disposables.add(registry.register({ scheme: "test" }, {
      // JSON-based
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        return {
          suggestions: [{
            kind: CompletionItemKind.Class,
            label: "git.pull",
            insertText: "git.pull",
            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
          }]
        };
      }
    }));
    return withOracle(async function(model2, editor) {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setValue("gi");
        editor.setSelection(new Selection(1, 3, 1, 3));
        editor.trigger("keyboard", Handler.Type, { text: "t" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        assert.strictEqual(event.completionModel.items[0].textLabel, "git.pull");
      });
      editor.trigger("keyboard", Handler.Type, { text: "." });
      await assertEvent(model2.onDidSuggest, () => {
        editor.trigger("keyboard", Handler.Type, { text: "p" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 1);
        assert.strictEqual(event.completionModel.items[0].textLabel, "git.pull");
      });
    });
  });
  test("Completion list closes unexpectedly when typing a digit after a word separator #169390", function() {
    const requestCounts = [0, 0];
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos) {
        requestCounts[0] += 1;
        return {
          suggestions: [{
            kind: CompletionItemKind.Text,
            label: "foo-20",
            insertText: "foo-20",
            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
          }, {
            kind: CompletionItemKind.Text,
            label: "foo-hello",
            insertText: "foo-hello",
            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
          }]
        };
      }
    }));
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      triggerCharacters: ["2"],
      provideCompletionItems(doc, pos, ctx) {
        requestCounts[1] += 1;
        if (ctx.triggerKind !== CompletionTriggerKind.TriggerCharacter) {
          return;
        }
        return {
          suggestions: [{
            kind: CompletionItemKind.Class,
            label: "foo-210",
            insertText: "foo-210",
            range: new Range(pos.lineNumber, 1, pos.lineNumber, pos.column)
          }]
        };
      }
    }));
    return withOracle(async function(model2, editor) {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setValue("foo");
        editor.setSelection(new Selection(1, 4, 1, 4));
        model2.trigger({ auto: false });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, false);
        assert.strictEqual(event.completionModel.items.length, 2);
        assert.strictEqual(event.completionModel.items[0].textLabel, "foo-20");
        assert.strictEqual(event.completionModel.items[1].textLabel, "foo-hello");
      });
      editor.trigger("keyboard", Handler.Type, { text: "-" });
      await assertEvent(model2.onDidSuggest, () => {
        editor.trigger("keyboard", Handler.Type, { text: "2" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 2);
        assert.strictEqual(event.completionModel.items[0].textLabel, "foo-20");
        assert.strictEqual(event.completionModel.items[1].textLabel, "foo-210");
        assert.deepStrictEqual(requestCounts, [1, 2]);
      });
    });
  });
  test("Set refilter-flag, keep triggerKind", function() {
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      triggerCharacters: ["."],
      provideCompletionItems(doc, pos, ctx) {
        return {
          suggestions: [{
            label: doc.getWordUntilPosition(pos).word || "hello",
            kind: CompletionItemKind.Property,
            insertText: "foofoo",
            range: getDefaultSuggestRange(doc, pos)
          }]
        };
      }
    }));
    return withOracle(async function(model2, editor) {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setValue("foo");
        editor.setSelection(new Selection(1, 4, 1, 4));
        editor.trigger("keyboard", Handler.Type, { text: "o" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.triggerOptions.triggerCharacter, void 0);
        assert.strictEqual(event.triggerOptions.triggerKind, void 0);
        assert.strictEqual(event.completionModel.items.length, 1);
      });
      await assertEvent(model2.onDidSuggest, () => {
        editor.trigger("keyboard", Handler.Type, { text: "." });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.triggerOptions.refilter, void 0);
        assert.strictEqual(event.triggerOptions.triggerCharacter, ".");
        assert.strictEqual(event.triggerOptions.triggerKind, CompletionTriggerKind.TriggerCharacter);
        assert.strictEqual(event.completionModel.items.length, 1);
      });
      await assertEvent(model2.onDidSuggest, () => {
        editor.trigger("keyboard", Handler.Type, { text: "h" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.triggerOptions.refilter, true);
        assert.strictEqual(event.triggerOptions.triggerCharacter, ".");
        assert.strictEqual(event.triggerOptions.triggerKind, CompletionTriggerKind.TriggerCharacter);
        assert.strictEqual(event.completionModel.items.length, 1);
      });
    });
  });
  test("Snippets gone from IntelliSense #173244", function() {
    const snippetProvider = {
      _debugDisplayName: "test",
      provideCompletionItems(doc, pos, ctx) {
        return {
          suggestions: [{
            label: "log",
            kind: CompletionItemKind.Snippet,
            insertText: "log",
            range: getDefaultSuggestRange(doc, pos)
          }]
        };
      }
    };
    const old = setSnippetSuggestSupport(snippetProvider);
    disposables.add(toDisposable(() => {
      if (getSnippetSuggestSupport() === snippetProvider) {
        setSnippetSuggestSupport(old);
      }
    }));
    disposables.add(registry.register({ scheme: "test" }, {
      _debugDisplayName: "test",
      triggerCharacters: ["."],
      provideCompletionItems(doc, pos, ctx) {
        return {
          suggestions: [{
            label: "locals",
            kind: CompletionItemKind.Property,
            insertText: "locals",
            range: getDefaultSuggestRange(doc, pos)
          }],
          incomplete: true
        };
      }
    }));
    return withOracle(async function(model2, editor) {
      await assertEvent(model2.onDidSuggest, () => {
        editor.setValue("");
        editor.setSelection(new Selection(1, 1, 1, 1));
        editor.trigger("keyboard", Handler.Type, { text: "l" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.triggerOptions.triggerCharacter, void 0);
        assert.strictEqual(event.triggerOptions.triggerKind, void 0);
        assert.strictEqual(event.completionModel.items.length, 2);
        assert.strictEqual(event.completionModel.items[0].textLabel, "locals");
        assert.strictEqual(event.completionModel.items[1].textLabel, "log");
      });
      await assertEvent(model2.onDidSuggest, () => {
        editor.trigger("keyboard", Handler.Type, { text: "o" });
      }, (event) => {
        assert.strictEqual(event.triggerOptions.triggerKind, CompletionTriggerKind.TriggerForIncompleteCompletions);
        assert.strictEqual(event.triggerOptions.auto, true);
        assert.strictEqual(event.completionModel.items.length, 2);
        assert.strictEqual(event.completionModel.items[0].textLabel, "locals");
        assert.strictEqual(event.completionModel.items[1].textLabel, "log");
      });
    });
  });
  test("offWhenInlineCompletions - allows quick suggest when inline provider returns empty results", function() {
    disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
    const inlineProvider = {
      provideInlineCompletions: () => ({ items: [] }),
      disposeInlineCompletions: () => {
      }
    };
    disposables.add(languageFeaturesService.inlineCompletionsProvider.register({ scheme: "test" }, inlineProvider));
    return withOracle((suggestOracle, editor) => {
      editor.updateOptions({ quickSuggestions: { comments: "off", strings: "off", other: "offWhenInlineCompletions" } });
      return assertEvent(suggestOracle.onDidSuggest, () => {
        editor.setPosition({ lineNumber: 1, column: 4 });
        editor.trigger("keyboard", Handler.Type, { text: "d" });
      }, (suggestEvent) => {
        assert.strictEqual(suggestEvent.triggerOptions.auto, true);
      });
    });
  });
  test("offWhenInlineCompletions - allows quick suggest when no inline provider exists", function() {
    disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
    return withOracle((suggestOracle, editor) => {
      editor.updateOptions({ quickSuggestions: { comments: "off", strings: "off", other: "offWhenInlineCompletions" } });
      return assertEvent(suggestOracle.onDidSuggest, () => {
        editor.setPosition({ lineNumber: 1, column: 4 });
        editor.trigger("keyboard", Handler.Type, { text: "d" });
      }, (suggestEvent) => {
        assert.strictEqual(suggestEvent.triggerOptions.auto, true);
        assert.strictEqual(suggestEvent.completionModel.items.length, 1);
      });
    });
  });
  test("offWhenInlineCompletions - allows quick suggest when inlineSuggest is disabled", function() {
    return runWithFakedTimers({ useFakeTimers: true }, () => {
      disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
      const inlineProvider = {
        provideInlineCompletions: () => ({ items: [] }),
        disposeInlineCompletions: () => {
        }
      };
      disposables.add(languageFeaturesService.inlineCompletionsProvider.register({ scheme: "test" }, inlineProvider));
      return withOracle((suggestOracle, editor) => {
        editor.updateOptions({
          quickSuggestions: { comments: "off", strings: "off", other: "offWhenInlineCompletions" },
          inlineSuggest: { enabled: false }
        });
        return assertEvent(suggestOracle.onDidSuggest, () => {
          editor.setPosition({ lineNumber: 1, column: 4 });
          editor.trigger("keyboard", Handler.Type, { text: "d" });
        }, (suggestEvent) => {
          assert.strictEqual(suggestEvent.triggerOptions.auto, true);
          assert.strictEqual(suggestEvent.completionModel.items.length, 1);
        });
      });
    });
  });
  test('string shorthand - "off" disables quick suggestions for all token types', function() {
    return runWithFakedTimers({ useFakeTimers: true }, () => {
      disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
      return withOracle((suggestOracle, editor) => {
        editor.updateOptions({ quickSuggestions: "off" });
        return new Promise((resolve, reject) => {
          const sub = suggestOracle.onDidSuggest(() => {
            sub.dispose();
            reject(new Error('Quick suggestions should have been suppressed by string shorthand "off"'));
          });
          editor.setPosition({ lineNumber: 1, column: 4 });
          editor.trigger("keyboard", Handler.Type, { text: "d" });
          setTimeout(() => {
            sub.dispose();
            resolve();
          }, 200);
        });
      });
    });
  });
  test('string shorthand - "offWhenInlineCompletions" allows quick suggest when inline provider returns empty', function() {
    return runWithFakedTimers({ useFakeTimers: true }, () => {
      disposables.add(registry.register({ scheme: "test" }, alwaysSomethingSupport));
      const inlineProvider = {
        provideInlineCompletions: () => ({ items: [] }),
        disposeInlineCompletions: () => {
        }
      };
      disposables.add(languageFeaturesService.inlineCompletionsProvider.register({ scheme: "test" }, inlineProvider));
      return withOracle((suggestOracle, editor) => {
        editor.updateOptions({ quickSuggestions: "offWhenInlineCompletions" });
        return assertEvent(suggestOracle.onDidSuggest, () => {
          editor.setPosition({ lineNumber: 1, column: 4 });
          editor.trigger("keyboard", Handler.Type, { text: "d" });
        }, (suggestEvent) => {
          assert.strictEqual(suggestEvent.triggerOptions.auto, true);
        });
      });
    });
  });
});
suite("SuggestModel - offWhenInlineCompletions with InlineCompletionsController", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  const completionProvider = {
    _debugDisplayName: "test",
    provideCompletionItems(doc, pos) {
      const wordUntil = doc.getWordUntilPosition(pos);
      return {
        incomplete: false,
        suggestions: [{
          label: doc.getWordUntilPosition(pos).word,
          kind: CompletionItemKind.Property,
          insertText: "foofoo",
          range: new Range(pos.lineNumber, wordUntil.startColumn, pos.lineNumber, wordUntil.endColumn)
        }]
      };
    }
  };
  async function withSuggestModelAndInlineCompletions(text, inlineProvider, callback) {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const disposableStore = new DisposableStore();
      try {
        const languageFeaturesService = new LanguageFeaturesService();
        disposableStore.add(languageFeaturesService.completionProvider.register({ pattern: "**" }, completionProvider));
        disposableStore.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: "**" }, inlineProvider));
        const serviceCollection = new ServiceCollection(
          [ILanguageFeaturesService, languageFeaturesService],
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
          [IEnvironmentService, new class extends mock() {
            constructor() {
              super(...arguments);
              this.isBuilt = true;
              this.isExtensionDevelopment = false;
            }
          }()],
          [IAccessibilitySignalService, new class extends mock() {
            async playSignal() {
            }
            isSoundEnabled() {
              return false;
            }
          }()],
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
        await withAsyncTestCodeEditor(text, { serviceCollection }, async (editor, _editorViewModel, instantiationService) => {
          instantiationService.stubInstance(InlineSuggestionsView, {
            dispose: () => {
            }
          });
          editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
          editor.registerAndInstantiateContribution(InlineCompletionsController.ID, InlineCompletionsController);
          editor.hasWidgetFocus = () => true;
          editor.updateOptions({
            quickSuggestions: { comments: "off", strings: "off", other: "offWhenInlineCompletions" }
          });
          const suggestModel = disposableStore.add(
            editor.invokeWithinContext((accessor) => accessor.get(IInstantiationService).createInstance(SuggestModel, editor))
          );
          await callback(suggestModel, editor);
        });
      } finally {
        disposableStore.dispose();
        ModifierKeyEmitter.disposeInstance();
      }
    });
  }
  test("suppresses quick suggest when inline completions are showing ghost text", async function() {
    const inlineProvider = {
      provideInlineCompletions: (model, pos) => {
        const word = model.getWordAtPosition(pos);
        if (!word) {
          return { items: [] };
        }
        return {
          items: [{
            insertText: word.word + "Suffix",
            range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn)
          }]
        };
      },
      disposeInlineCompletions: () => {
      }
    };
    await withSuggestModelAndInlineCompletions("abc def", inlineProvider, async (suggestModel, editor) => {
      let didSuggest = false;
      const sub = suggestModel.onDidSuggest(() => {
        didSuggest = true;
      });
      editor.setPosition({ lineNumber: 1, column: 4 });
      editor.trigger("keyboard", Handler.Type, { text: "d" });
      await timeout(200);
      sub.dispose();
      assert.strictEqual(didSuggest, false, "Quick suggestions should have been suppressed when inline completions are showing");
    });
  });
  test("allows quick suggest when inline completions resolve with no results", async function() {
    const inlineProvider = {
      provideInlineCompletions: () => ({ items: [] }),
      disposeInlineCompletions: () => {
      }
    };
    await withSuggestModelAndInlineCompletions("abc def", inlineProvider, async (suggestModel, editor) => {
      let didSuggest = false;
      const sub = suggestModel.onDidSuggest((e) => {
        didSuggest = true;
        assert.strictEqual(e.triggerOptions.auto, true);
      });
      editor.setPosition({ lineNumber: 1, column: 4 });
      editor.trigger("keyboard", Handler.Type, { text: "d" });
      await timeout(200);
      sub.dispose();
      assert.strictEqual(didSuggest, true, "Quick suggestions should have been triggered after inline completions resolved empty");
    });
  });
  test("allows quick suggest when inlineSuggest is disabled even with provider", async function() {
    const inlineProvider = {
      provideInlineCompletions: (model, pos) => {
        const word = model.getWordAtPosition(pos);
        if (!word) {
          return { items: [] };
        }
        return {
          items: [{
            insertText: word.word + "Suffix",
            range: new Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn)
          }]
        };
      },
      disposeInlineCompletions: () => {
      }
    };
    await withSuggestModelAndInlineCompletions("abc def", inlineProvider, async (suggestModel, editor) => {
      editor.updateOptions({ inlineSuggest: { enabled: false } });
      let didSuggest = false;
      const sub = suggestModel.onDidSuggest((e) => {
        didSuggest = true;
        assert.strictEqual(e.triggerOptions.auto, true);
      });
      editor.setPosition({ lineNumber: 1, column: 4 });
      editor.trigger("keyboard", Handler.Type, { text: "d" });
      await timeout(200);
      sub.dispose();
      assert.strictEqual(didSuggest, true, "Quick suggestions should have been triggered when inlineSuggest is disabled");
    });
  });
  test("does not trigger after the inline model is disposed mid-wait (e.g., readonly toggled)", async function() {
    const inlineProvider = {
      provideInlineCompletions: (_model, _pos, _ctx, token) => new Promise((resolve) => {
        const d = token.onCancellationRequested(() => {
          d.dispose();
          resolve({ items: [] });
        });
      }),
      disposeInlineCompletions: () => {
      }
    };
    await withSuggestModelAndInlineCompletions("abc def", inlineProvider, async (suggestModel, editor) => {
      let didSuggest = false;
      const sub = suggestModel.onDidSuggest(() => {
        didSuggest = true;
      });
      editor.setPosition({ lineNumber: 1, column: 4 });
      editor.trigger("keyboard", Handler.Type, { text: "d" });
      await timeout(50);
      editor.updateOptions({ readOnly: true });
      await timeout(1e3);
      sub.dispose();
      assert.strictEqual(
        didSuggest,
        false,
        "Quick suggest should not fire after the inline model is disposed mid-wait"
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXHRlc3RcXGJyb3dzZXJcXHN1Z2dlc3RNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IE1vZGlmaWVyS2V5RW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNb2NrS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ29yZUVkaXRpbmdDb21tYW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25JdGVtUHJvdmlkZXIsIENvbXBsZXRpb25MaXN0LCBDb21wbGV0aW9uVHJpZ2dlcktpbmQsIEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQsIElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIsIElTdGF0ZSwgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RDb2RlRWRpdG9yLCBJVGVzdENvZGVFZGl0b3IsIHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vZGVsU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCwgaW5zdGFudGlhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdGlvbnNWaWV3IH0gZnJvbSAnLi4vLi4vLi4vaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZVN1Z2dlc3Rpb25zVmlldy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IGdldFNuaXBwZXRTdWdnZXN0U3VwcG9ydCwgc2V0U25pcHBldFN1Z2dlc3RTdXBwb3J0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zdWdnZXN0LmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJU3VnZ2VzdE1lbW9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3N1Z2dlc3RNZW1vcnkuanMnO1xuaW1wb3J0IHsgTGluZUNvbnRleHQsIFN1Z2dlc3RNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3VnZ2VzdE1vZGVsLmpzJztcbmltcG9ydCB7IElTZWxlY3RlZFN1Z2dlc3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3N1Z2dlc3RXaWRnZXQuanMnO1xuXG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tFZGl0b3IobW9kZWw6IFRleHRNb2RlbCwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk6IElUZXN0Q29kZUVkaXRvciB7XG5cblx0Y29uc3Qgc3RvcmVTZXJ2aWNlID0gbmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKTtcblx0Y29uc3QgZWRpdG9yID0gY3JlYXRlVGVzdENvZGVFZGl0b3IobW9kZWwsIHtcblx0XHRzZXJ2aWNlQ29sbGVjdGlvbjogbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2VdLFxuXHRcdFx0W0lUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZV0sXG5cdFx0XHRbSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZVNlcnZpY2VdLFxuXHRcdFx0W0lLZXliaW5kaW5nU2VydmljZSwgbmV3IE1vY2tLZXliaW5kaW5nU2VydmljZSgpXSxcblx0XHRcdFtJU3VnZ2VzdE1lbW9yeVNlcnZpY2UsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIElTdWdnZXN0TWVtb3J5U2VydmljZSB7XG5cdFx0XHRcdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0XHRtZW1vcml6ZSgpOiB2b2lkIHtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxlY3QoKTogbnVtYmVyIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdFx0W0lMYWJlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhYmVsU2VydmljZT4oKSB7IH1dLFxuXHRcdFx0W0lXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkgeyB9XSxcblx0XHRcdFtJRW52aXJvbm1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFbnZpcm9ubWVudFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBpc0J1aWx0OiBib29sZWFuID0gdHJ1ZTtcblx0XHRcdFx0b3ZlcnJpZGUgaXNFeHRlbnNpb25EZXZlbG9wbWVudDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0fV0sXG5cdFx0KSxcblx0fSk7XG5cdGNvbnN0IGN0cmwgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihTbmlwcGV0Q29udHJvbGxlcjIuSUQsIFNuaXBwZXRDb250cm9sbGVyMik7XG5cdGVkaXRvci5oYXNXaWRnZXRGb2N1cyA9ICgpID0+IHRydWU7XG5cblx0ZWRpdG9yLnJlZ2lzdGVyRGlzcG9zYWJsZShjdHJsKTtcblx0ZWRpdG9yLnJlZ2lzdGVyRGlzcG9zYWJsZShzdG9yZVNlcnZpY2UpO1xuXHRyZXR1cm4gZWRpdG9yO1xufVxuXG5zdWl0ZSgnU3VnZ2VzdE1vZGVsIC0gQ29udGV4dCcsIGZ1bmN0aW9uICgpIHtcblx0Y29uc3QgT1VURVJfTEFOR1VBR0VfSUQgPSAnb3V0ZXJNb2RlJztcblx0Y29uc3QgSU5ORVJfTEFOR1VBR0VfSUQgPSAnaW5uZXJNb2RlJztcblxuXHRjbGFzcyBPdXRlck1vZGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZCA9IE9VVEVSX0xBTkdVQUdFX0lEO1xuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCkge1xuXHRcdFx0c3VwZXIoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IHRoaXMubGFuZ3VhZ2VJZCB9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VJZCwge30pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7XG5cdFx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCk6IElTdGF0ZSA9PiBOdWxsU3RhdGUsXG5cdFx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IElTdGF0ZSk6IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRva2Vuc0FycjogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0XHRsZXQgcHJldkxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAobGluZS5jaGFyQXQoaSkgPT09ICd4JyA/IElOTkVSX0xBTkdVQUdFX0lEIDogT1VURVJfTEFOR1VBR0VfSUQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdFx0XHRpZiAocHJldkxhbmd1YWdlSWQgIT09IGxhbmd1YWdlSWQpIHtcblx0XHRcdFx0XHRcdFx0dG9rZW5zQXJyLnB1c2goaSk7XG5cdFx0XHRcdFx0XHRcdHRva2Vuc0Fyci5wdXNoKChlbmNvZGVkTGFuZ3VhZ2VJZCA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cHJldkxhbmd1YWdlSWQgPSBsYW5ndWFnZUlkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheSh0b2tlbnNBcnIubGVuZ3RoKTtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0dG9rZW5zW2ldID0gdG9rZW5zQXJyW2ldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgc3RhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgSW5uZXJNb2RlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdFx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQgPSBJTk5FUl9MQU5HVUFHRV9JRDtcblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdCkge1xuXHRcdFx0c3VwZXIoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IHRoaXMubGFuZ3VhZ2VJZCB9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VJZCwge30pKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBhc3NlcnRBdXRvVHJpZ2dlciA9IChtb2RlbDogVGV4dE1vZGVsLCBvZmZzZXQ6IG51bWJlciwgZXhwZWN0ZWQ6IGJvb2xlYW4sIG1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRjb25zdCBwb3MgPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0Y29uc3QgZWRpdG9yID0gY3JlYXRlTW9ja0VkaXRvcihtb2RlbCwgbmV3IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKCkpO1xuXHRcdGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChMaW5lQ29udGV4dC5zaG91bGRBdXRvVHJpZ2dlcihlZGl0b3IpLCBleHBlY3RlZCwgbWVzc2FnZSk7XG5cdFx0ZWRpdG9yLmRpc3Bvc2UoKTtcblx0fTtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0NvbnRleHQgLSBzaG91bGRBdXRvVHJpZ2dlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnRGFzIFBmZXJkIGZyaXNzdCBrZWluZW4gR3Vya2Vuc2FsYXQgLSBQaGlsaXBwIFJlaXMgMTg2MS5cXG5XZXIgaGF0XFwncyBlcmZ1bmRlbj8nKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0YXNzZXJ0QXV0b1RyaWdnZXIobW9kZWwsIDMsIHRydWUsICdlbmQgb2Ygd29yZCwgRGFzfCcpO1xuXHRcdGFzc2VydEF1dG9UcmlnZ2VyKG1vZGVsLCA0LCBmYWxzZSwgJ25vIHdvcmQgRGFzIHwnKTtcblx0XHRhc3NlcnRBdXRvVHJpZ2dlcihtb2RlbCwgMSwgdHJ1ZSwgJ3R5cGluZyBhIHNpbmdsZSBjaGFyYWN0ZXIgYmVmb3JlIGEgd29yZDogRHxhcycpO1xuXHRcdGFzc2VydEF1dG9UcmlnZ2VyKG1vZGVsLCA1NSwgZmFsc2UsICdudW1iZXIsIDE4NjF8Jyk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGRBdXRvVHJpZ2dlciBhdCBlbWJlZGRlZCBsYW5ndWFnZSBib3VuZGFyaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgb3V0ZXJNb2RlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE91dGVyTW9kZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbm5lck1vZGUpKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnYTx4eD5hPHg+Jywgb3V0ZXJNb2RlLmxhbmd1YWdlSWQpKTtcblxuXHRcdGFzc2VydEF1dG9UcmlnZ2VyKG1vZGVsLCAxLCB0cnVlLCAnYXw8eCBcdTIwMTQgc2hvdWxkIHRyaWdnZXIgYXQgZW5kIG9mIHdvcmQnKTtcblx0XHRhc3NlcnRBdXRvVHJpZ2dlcihtb2RlbCwgMiwgZmFsc2UsICdhPHx4IFx1MjAxNCBzaG91bGQgTk9UIHRyaWdnZXIgYXQgc3RhcnQgb2Ygd29yZCcpO1xuXHRcdGFzc2VydEF1dG9UcmlnZ2VyKG1vZGVsLCAzLCB0cnVlLCAnYTx4fHggXHUyMDE0ICBzaG91bGQgdHJpZ2dlciBhZnRlciB0eXBpbmcgYSBzaW5nbGUgY2hhcmFjdGVyIGJlZm9yZSBhIHdvcmQnKTtcblx0XHRhc3NlcnRBdXRvVHJpZ2dlcihtb2RlbCwgNCwgdHJ1ZSwgJ2E8eHh8PiBcdTIwMTQgc2hvdWxkIHRyaWdnZXIgYXQgYm91bmRhcnkgYmV0d2VlbiBsYW5ndWFnZXMnKTtcblx0XHRhc3NlcnRBdXRvVHJpZ2dlcihtb2RlbCwgNSwgZmFsc2UsICdhPHh4PnxhIFx1MjAxNCBzaG91bGQgTk9UIHRyaWdnZXIgYXQgc3RhcnQgb2Ygd29yZCcpO1xuXHRcdGFzc2VydEF1dG9UcmlnZ2VyKG1vZGVsLCA2LCB0cnVlLCAnYTx4eD5hfDwgXHUyMDE0IHNob3VsZCB0cmlnZ2VyIGF0IGVuZCBvZiB3b3JkJyk7XG5cdFx0YXNzZXJ0QXV0b1RyaWdnZXIobW9kZWwsIDgsIHRydWUsICdhPHh4PmE8eHw+IFx1MjAxNCBzaG91bGQgdHJpZ2dlciBhdCBlbmQgb2Ygd29yZCBhdCBib3VuZGFyeScpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnU3VnZ2VzdE1vZGVsIC0gVHJpZ2dlckFuZENhbmNlbE9yYWNsZScsIGZ1bmN0aW9uICgpIHtcblxuXG5cdGZ1bmN0aW9uIGdldERlZmF1bHRTdWdnZXN0UmFuZ2UobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbikge1xuXHRcdGNvbnN0IHdvcmRVbnRpbCA9IG1vZGVsLmdldFdvcmRVbnRpbFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHdvcmRVbnRpbC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgd29yZFVudGlsLmVuZENvbHVtbik7XG5cdH1cblxuXHRjb25zdCBhbHdheXNFbXB0eVN1cHBvcnQ6IENvbXBsZXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0X2RlYnVnRGlzcGxheU5hbWU6ICd0ZXN0Jyxcblx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKTogQ29tcGxldGlvbkxpc3Qge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5jb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdHN1Z2dlc3Rpb25zOiBbXVxuXHRcdFx0fTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgYWx3YXlzU29tZXRoaW5nU3VwcG9ydDogQ29tcGxldGlvbkl0ZW1Qcm92aWRlciA9IHtcblx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoZG9jLCBwb3MpOiBDb21wbGV0aW9uTGlzdCB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbmNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGRvYy5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3MpLndvcmQsXG5cdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LFxuXHRcdFx0XHRcdGluc2VydFRleHQ6ICdmb29mb28nLFxuXHRcdFx0XHRcdHJhbmdlOiBnZXREZWZhdWx0U3VnZ2VzdFJhbmdlKGRvYywgcG9zKVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cdH07XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBtb2RlbDogVGV4dE1vZGVsO1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXHRjb25zdCByZWdpc3RyeSA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlcjtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FiYyBkZWYnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OnNvbWVmaWxlLnR0dCcpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB3aXRoT3JhY2xlKGNhbGxiYWNrOiAobW9kZWw6IFN1Z2dlc3RNb2RlbCwgZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IpID0+IGFueSk6IFByb21pc2U8YW55PiB7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gY3JlYXRlTW9ja0VkaXRvcihtb2RlbCwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgb3JhY2xlID0gZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdE1vZGVsLCBlZGl0b3IpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChvcmFjbGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvcik7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlc29sdmUoY2FsbGJhY2sob3JhY2xlLCBlZGl0b3IpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydEV2ZW50PEU+KGV2ZW50OiBFdmVudDxFPiwgYWN0aW9uOiAoKSA9PiBhbnksIGFzc2VydDogKGU6IEUpID0+IGFueSkge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBzdWIgPSBldmVudChlID0+IHtcblx0XHRcdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXNvbHZlKGFzc2VydChlKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFjdGlvbigpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnZXZlbnRzIC0gY2FuY2VsL3RyaWdnZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUobW9kZWwgPT4ge1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXG5cdFx0XHRcdGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkVHJpZ2dlciwgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdG1vZGVsLnRyaWdnZXIoeyBhdXRvOiB0cnVlIH0pO1xuXHRcdFx0XHR9LCBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuYXV0bywgdHJ1ZSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gYXNzZXJ0RXZlbnQobW9kZWwub25EaWRDYW5jZWwsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRcdG1vZGVsLmNhbmNlbCgpO1xuXHRcdFx0XHRcdH0sIGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnJldHJpZ2dlciwgZmFsc2UpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSxcblxuXHRcdFx0XHRhc3NlcnRFdmVudChtb2RlbC5vbkRpZFRyaWdnZXIsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRtb2RlbC50cmlnZ2VyKHsgYXV0bzogdHJ1ZSB9KTtcblx0XHRcdFx0fSwgZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmF1dG8sIHRydWUpO1xuXHRcdFx0XHR9KSxcblxuXHRcdFx0XHRhc3NlcnRFdmVudChtb2RlbC5vbkRpZFRyaWdnZXIsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRtb2RlbC50cmlnZ2VyKHsgYXV0bzogZmFsc2UgfSk7XG5cdFx0XHRcdH0sIGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5hdXRvLCBmYWxzZSk7XG5cdFx0XHRcdH0pXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdldmVudHMgLSBzdWdnZXN0L2VtcHR5JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwgYWx3YXlzRW1wdHlTdXBwb3J0KSk7XG5cblx0XHRyZXR1cm4gd2l0aE9yYWNsZShtb2RlbCA9PiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRhc3NlcnRFdmVudChtb2RlbC5vbkRpZENhbmNlbCwgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdG1vZGVsLnRyaWdnZXIoeyBhdXRvOiB0cnVlIH0pO1xuXHRcdFx0XHR9LCBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQucmV0cmlnZ2VyLCBmYWxzZSk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRtb2RlbC50cmlnZ2VyKHsgYXV0bzogZmFsc2UgfSk7XG5cdFx0XHRcdH0sIGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCBmYWxzZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmlzRnJvemVuLCBmYWxzZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDApO1xuXHRcdFx0XHR9KVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaWdnZXIgLSBvbiB0eXBlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwgYWx3YXlzU29tZXRoaW5nU3VwcG9ydCkpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoKG1vZGVsLCBlZGl0b3IpID0+IHtcblx0XHRcdHJldHVybiBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiA0IH0pO1xuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2QnIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wcm92aWRlciwgYWx3YXlzU29tZXRoaW5nU3VwcG9ydCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnIzE3NDAwOiBLZWVwIGZpbHRlcmluZyBzdWdnZXN0TW9kZWwudHMgYWZ0ZXIgc3BhY2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0JyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcyk6IENvbXBsZXRpb25MaXN0IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbmNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGxhYmVsOiAnTXkgVGFibGUnLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ015IFRhYmxlJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBnZXREZWZhdWx0U3VnZ2VzdFJhbmdlKGRvYywgcG9zKVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoKG1vZGVsLCBlZGl0b3IpID0+IHtcblxuXHRcdFx0cmV0dXJuIGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHQvLyBtYWtlIHN1cmUgY29tcGxldGlvbk1vZGVsIHN0YXJ0cyBoZXJlIVxuXHRcdFx0XHRtb2RlbC50cmlnZ2VyKHsgYXV0bzogdHJ1ZSB9KTtcblx0XHRcdH0sIGV2ZW50ID0+IHtcblxuXHRcdFx0XHRyZXR1cm4gYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxIH0pO1xuXHRcdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnTXknIH0pO1xuXG5cdFx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdGNvbnN0IFtmaXJzdF0gPSBldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXM7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbXBsZXRpb24ubGFiZWwsICdNeSBUYWJsZScpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAzIH0pO1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICcgJyB9KTtcblxuXHRcdFx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRcdGNvbnN0IFtmaXJzdF0gPSBldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXM7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29tcGxldGlvbi5sYWJlbCwgJ015IFRhYmxlJyk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJyMyMTQ4NDogVHJpZ2dlciBjaGFyYWN0ZXIgYWx3YXlzIGZvcmNlIGEgbmV3IGNvbXBsZXRpb24gc2Vzc2lvbicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKTogQ29tcGxldGlvbkxpc3Qge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGluY29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdmb28uYmFyJyxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdmb28uYmFyJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcy53aXRoKHVuZGVmaW5lZCwgMSksIHBvcylcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogWycuJ10sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKTogQ29tcGxldGlvbkxpc3Qge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGluY29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdib29tJyxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdib29tJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKFxuXHRcdFx0XHRcdFx0XHRwb3MuZGVsdGEoMCwgZG9jLmdldExpbmVDb250ZW50KHBvcy5saW5lTnVtYmVyKVtwb3MuY29sdW1uIC0gMl0gPT09ICcuJyA/IDAgOiAtMSksXG5cdFx0XHRcdFx0XHRcdHBvc1xuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoYXN5bmMgKG1vZGVsLCBlZGl0b3IpID0+IHtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMSB9KTtcblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdmb28nIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29tcGxldGlvbi5sYWJlbCwgJ2Zvby5iYXInKTtcblxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJy4nIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdC8vIFNZTkNcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdF0gPSBldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb21wbGV0aW9uLmxhYmVsLCAnZm9vLmJhcicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHQvLyBub3RoaW5nIC0+IHRyaWdnZXJlZCBieSB0aGUgdHJpZ2dlciBjaGFyYWN0ZXIgdHlwaW5nIChzZWUgYWJvdmUpXG5cblx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0Ly8gQVNZTkNcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcztcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbXBsZXRpb24ubGFiZWwsICdmb28uYmFyJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuY29tcGxldGlvbi5sYWJlbCwgJ2Jvb20nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnRlbGxpc2Vuc2UgQ29tcGxldGlvbiBkb2VzblxcJ3QgcmVzcGVjdCBzcGFjZSBhZnRlciBlcXVhbCBzaWduICguaHRtbCBmaWxlKSwgIzI5MzUzIFsxLzJdJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwgYWx3YXlzU29tZXRoaW5nU3VwcG9ydCkpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoKG1vZGVsLCBlZGl0b3IpID0+IHtcblxuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnNldFZhbHVlKCdmbycpO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAzIH0pO1xuXG5cdFx0XHRyZXR1cm4gYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXIoeyBhdXRvOiBmYWxzZSB9KTtcblx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmlzRnJvemVuLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHRyZXR1cm4gYXNzZXJ0RXZlbnQobW9kZWwub25EaWRDYW5jZWwsICgpID0+IHtcblx0XHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJysnIH0pO1xuXHRcdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnJldHJpZ2dlciwgZmFsc2UpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnRlbGxpc2Vuc2UgQ29tcGxldGlvbiBkb2VzblxcJ3QgcmVzcGVjdCBzcGFjZSBhZnRlciBlcXVhbCBzaWduICguaHRtbCBmaWxlKSwgIzI5MzUzIFsyLzJdJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwgYWx3YXlzU29tZXRoaW5nU3VwcG9ydCkpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoKG1vZGVsLCBlZGl0b3IpID0+IHtcblxuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnNldFZhbHVlKCdmbycpO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAzIH0pO1xuXG5cdFx0XHRyZXR1cm4gYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXIoeyBhdXRvOiBmYWxzZSB9KTtcblx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmlzRnJvemVuLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHRyZXR1cm4gYXNzZXJ0RXZlbnQobW9kZWwub25EaWRDYW5jZWwsICgpID0+IHtcblx0XHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJyAnIH0pO1xuXHRcdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnJldHJpZ2dlciwgZmFsc2UpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNvbXBsZXRlIHN1Z2dlc3Rpb24gcmVzdWx0cyBjYXVzZSByZS10cmlnZ2VyaW5nIHdoZW4gdHlwaW5nIHcvbyBmdXJ0aGVyIGNvbnRleHQsICMyODQwMCAoMS8yKScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKTogQ29tcGxldGlvbkxpc3Qge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGluY29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ2ZvbycsXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnZm9vJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcy53aXRoKHVuZGVmaW5lZCwgMSksIHBvcylcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB3aXRoT3JhY2xlKChtb2RlbCwgZWRpdG9yKSA9PiB7XG5cblx0XHRcdGVkaXRvci5nZXRNb2RlbCgpIS5zZXRWYWx1ZSgnZm9vJyk7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDQgfSk7XG5cblx0XHRcdHJldHVybiBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0bW9kZWwudHJpZ2dlcih7IGF1dG86IGZhbHNlIH0pO1xuXHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLmdldEluY29tcGxldGVQcm92aWRlcigpLnNpemUsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cblx0XHRcdFx0cmV0dXJuIGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkQ2FuY2VsLCAoKSA9PiB7XG5cdFx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICc7JyB9KTtcblx0XHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5yZXRyaWdnZXIsIGZhbHNlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnSW5jb21wbGV0ZSBzdWdnZXN0aW9uIHJlc3VsdHMgY2F1c2UgcmUtdHJpZ2dlcmluZyB3aGVuIHR5cGluZyB3L28gZnVydGhlciBjb250ZXh0LCAjMjg0MDAgKDIvMiknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0JyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcyk6IENvbXBsZXRpb25MaXN0IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbmNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdmb287Jyxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdmb28nLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zLndpdGgodW5kZWZpbmVkLCAxKSwgcG9zKVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoKG1vZGVsLCBlZGl0b3IpID0+IHtcblxuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnNldFZhbHVlKCdmb28nKTtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9KTtcblxuXHRcdFx0cmV0dXJuIGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRtb2RlbC50cmlnZ2VyKHsgYXV0bzogZmFsc2UgfSk7XG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuZ2V0SW5jb21wbGV0ZVByb3ZpZGVyKCkuc2l6ZSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHRyZXR1cm4gYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gd2hpbGUgd2UgY2FuY2VsIGluY3JlbWVudGFsbHkgZW5yaWNoaW5nIHRoZSBzZXQgb2Zcblx0XHRcdFx0XHQvLyBjb21wbGV0aW9ucyB3ZSBzdGlsbCBmaWx0ZXIgYWdhaW5zdCB0aG9zZSB0aGF0IHdlIGhhdmVcblx0XHRcdFx0XHQvLyB1bnRpbCBub3dcblx0XHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJzsnIH0pO1xuXHRcdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIGZhbHNlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLmdldEluY29tcGxldGVQcm92aWRlcigpLnNpemUsIDEpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUcmlnZ2VyIGNoYXJhY3RlciBpcyBwcm92aWRlZCBpbiBzdWdnZXN0IGNvbnRleHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHRyaWdnZXJDaGFyYWN0ZXIgPSAnJztcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0JyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnLiddLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcywgY29udGV4dCk6IENvbXBsZXRpb25MaXN0IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQudHJpZ2dlcktpbmQsIENvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyQ2hhcmFjdGVyKTtcblx0XHRcdFx0dHJpZ2dlckNoYXJhY3RlciA9IGNvbnRleHQudHJpZ2dlckNoYXJhY3RlciE7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aW5jb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6ICdmb28uYmFyJyxcblx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnZm9vLmJhcicsXG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcy53aXRoKHVuZGVmaW5lZCwgMSksIHBvcylcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoKG1vZGVsLCBlZGl0b3IpID0+IHtcblxuXHRcdFx0cmV0dXJuIGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSk7XG5cdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnZm9vLicgfSk7XG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmlnZ2VyQ2hhcmFjdGVyLCAnLicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01hYyBwcmVzcyBhbmQgaG9sZCBhY2NlbnQgY2hhcmFjdGVyIGluc2VydGlvbiBkb2VzIG5vdCB1cGRhdGUgc3VnZ2VzdGlvbnMsICMzNTI2OScsIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0JyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcyk6IENvbXBsZXRpb25MaXN0IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbmNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdhYmMnLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ2FiYycsXG5cdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3Mud2l0aCh1bmRlZmluZWQsIDEpLCBwb3MpXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdcdTAwRTRiYycsXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnXHUwMEU0YmMnLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zLndpdGgodW5kZWZpbmVkLCAxKSwgcG9zKVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdHJldHVybiB3aXRoT3JhY2xlKChtb2RlbCwgZWRpdG9yKSA9PiB7XG5cblx0XHRcdHJldHVybiBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxIH0pO1xuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2EnIH0pO1xuXHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXNbMF0uY29tcGxldGlvbi5sYWJlbCwgJ2FiYycpO1xuXG5cdFx0XHRcdHJldHVybiBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW0VkaXRPcGVyYXRpb24ucmVwbGFjZShuZXcgUmFuZ2UoMSwgMSwgMSwgMiksICdcdTAwRTQnKV0pO1xuXG5cdFx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0XHQvLyBzdWdnZXN0IG1vZGVsIGNoYW5nZWQgdG8gXHUwMEU0YmNcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtc1swXS5jb21wbGV0aW9uLmxhYmVsLCAnXHUwMEU0YmMnKTtcblxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCYWNrc3BhY2Ugc2hvdWxkIG5vdCBhbHdheXMgY2FuY2VsIGNvZGUgY29tcGxldGlvbiwgIzM2NDkxJywgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIGFsd2F5c1NvbWV0aGluZ1N1cHBvcnQpKTtcblxuXHRcdHJldHVybiB3aXRoT3JhY2xlKGFzeW5jIChtb2RlbCwgZWRpdG9yKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiA0IH0pO1xuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2QnIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wcm92aWRlciwgYWx3YXlzU29tZXRoaW5nU3VwcG9ydCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cblx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdF0gPSBldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXM7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnByb3ZpZGVyLCBhbHdheXNTb21ldGhpbmdTdXBwb3J0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXh0IGNoYW5nZXMgZm9yIGNvbXBsZXRpb24gQ29kZUFjdGlvbiBhcmUgYWZmZWN0ZWQgYnkgdGhlIGNvbXBsZXRpb24gIzM5ODkzJywgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKTogQ29tcGxldGlvbkxpc3Qge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGluY29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ2JhcicsXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnYmFyJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcy5kZWx0YSgwLCAtMiksIHBvcyksXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsVGV4dEVkaXRzOiBbe1xuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnLCBiYXInLFxuXHRcdFx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIGVuZExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxNywgZW5kQ29sdW1uOiAxNyB9XG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bW9kZWwuc2V0VmFsdWUoJ2JhOyBpbXBvcnQgeyBmb28gfSBmcm9tIFwiLi9iXCInKTtcblxuXHRcdHJldHVybiB3aXRoT3JhY2xlKGFzeW5jIChzdWdnZXQsIGVkaXRvcikgPT4ge1xuXHRcdFx0Y2xhc3MgVGVzdEN0cmwgZXh0ZW5kcyBTdWdnZXN0Q29udHJvbGxlciB7XG5cdFx0XHRcdF9pbnNlcnRTdWdnZXN0aW9uX3B1YmxpY0ZvclRlc3QoaXRlbTogSVNlbGVjdGVkU3VnZ2VzdGlvbiwgZmxhZ3M6IG51bWJlciA9IDApIHtcblx0XHRcdFx0XHRzdXBlci5faW5zZXJ0U3VnZ2VzdGlvbihpdGVtLCBmbGFncyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGN0cmwgPSA8VGVzdEN0cmw+ZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oVGVzdEN0cmwuSUQsIFRlc3RDdHJsKTtcblx0XHRcdGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFNuaXBwZXRDb250cm9sbGVyMi5JRCwgU25pcHBldENvbnRyb2xsZXIyKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQoc3VnZ2V0Lm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDMgfSk7XG5cdFx0XHRcdHN1Z2dldC50cmlnZ2VyKHsgYXV0bzogZmFsc2UgfSk7XG5cdFx0XHR9LCBldmVudCA9PiB7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29tcGxldGlvbi5sYWJlbCwgJ2JhcicpO1xuXG5cdFx0XHRcdGN0cmwuX2luc2VydFN1Z2dlc3Rpb25fcHVibGljRm9yVGVzdCh7IGl0ZW06IGZpcnN0LCBpbmRleDogMCwgbW9kZWw6IGV2ZW50LmNvbXBsZXRpb25Nb2RlbCB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vZGVsLmdldFZhbHVlKCksXG5cdFx0XHRcdCdiYXI7IGltcG9ydCB7IGZvbywgYmFyIH0gZnJvbSBcIi4vYlwiJ1xuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ29tcGxldGlvbiB1bmV4cGVjdGVkbHkgdHJpZ2dlcnMgb24gc2Vjb25kIGtleXByZXNzIG9mIGFuIGVkaXQgZ3JvdXAgaW4gYSBzbmlwcGV0ICM0MzUyMycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIGFsd2F5c1NvbWV0aGluZ1N1cHBvcnQpKTtcblxuXHRcdHJldHVybiB3aXRoT3JhY2xlKChtb2RlbCwgZWRpdG9yKSA9PiB7XG5cdFx0XHRyZXR1cm4gYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRWYWx1ZSgnZCcpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMikpO1xuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2UnIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wcm92aWRlciwgYWx3YXlzU29tZXRoaW5nU3VwcG9ydCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdGYWlscyB0byByZW5kZXIgY29tcGxldGlvbiBkZXRhaWxzICM0Nzk4OCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBkaXNwb3NlQSA9IDA7XG5cdFx0bGV0IGRpc3Bvc2VCID0gMDtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aW5jb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ0NvbXBsZXRlTm90Jyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdJbmNvbXBsZXRlJyxcblx0XHRcdFx0XHRcdHNvcnRUZXh0OiAnYScsXG5cdFx0XHRcdFx0XHRyYW5nZTogZ2V0RGVmYXVsdFN1Z2dlc3RSYW5nZShkb2MsIHBvcylcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRkaXNwb3NlKCkgeyBkaXNwb3NlQSArPSAxOyB9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aW5jb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdDb21wbGV0ZScsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnQ29tcGxldGUnLFxuXHRcdFx0XHRcdFx0c29ydFRleHQ6ICd6Jyxcblx0XHRcdFx0XHRcdHJhbmdlOiBnZXREZWZhdWx0U3VnZ2VzdFJhbmdlKGRvYywgcG9zKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGRpc3Bvc2UoKSB7IGRpc3Bvc2VCICs9IDE7IH1cblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlQ29tcGxldGlvbkl0ZW0oaXRlbSkge1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoYXN5bmMgKG1vZGVsLCBlZGl0b3IpID0+IHtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRWYWx1ZSgnJyk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnYycgfSk7XG5cblx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQiwgMCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnbycgfSk7XG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRcdC8vIGNsZWFuIHVwXG5cdFx0XHRcdG1vZGVsLmNsZWFyKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQSwgMik7IC8vIHByb3ZpZGUgZ290IGNhbGxlZCB0d28gdGltZXMhXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQiwgMSk7XG5cdFx0XHR9KTtcblxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ1RyaWdnZXIgKGZ1bGwpIGNvbXBsZXRpb25zIHdoZW4gKGluY29tcGxldGUpIGNvbXBsZXRpb25zIGFyZSBhbHJlYWR5IGFjdGl2ZSAjOTk1MDQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgY291bnRBID0gMDtcblx0XHRsZXQgY291bnRCID0gMDtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdGNvdW50QSArPSAxO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGluY29tcGxldGU6IGZhbHNlLCAvLyBkb2Vzbid0IG1hdHRlciBpZiBpbmNvbXBsZXRlIG9yIG5vdFxuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdaIGFhYScsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnWiBhYWEnLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCBwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbilcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICd0ZXN0Jyxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoZG9jLCBwb3MpIHtcblx0XHRcdFx0Y291bnRCICs9IDE7XG5cdFx0XHRcdGlmICghZG9jLmdldFdvcmRVbnRpbFBvc2l0aW9uKHBvcykud29yZC5zdGFydHNXaXRoKCdhJykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbmNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ2FhYScsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnYWFhJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBnZXREZWZhdWx0U3VnZ2VzdFJhbmdlKGRvYywgcG9zKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gd2l0aE9yYWNsZShhc3luYyAobW9kZWwsIGVkaXRvcikgPT4ge1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldFZhbHVlKCcnKTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdaJyB9KTtcblxuXHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtc1swXS50ZXh0TGFiZWwsICdaIGFhYScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHQvLyBzdGFydGVkIGFub3RoZXIgd29yZDogWiBhfFxuXHRcdFx0XHQvLyBpdGVtIHNob3VsZCBiZTogWiBhYWEsIGFhYVxuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJyBhJyB9KTtcblx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXNbMF0udGV4dExhYmVsLCAnWiBhYWEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtc1sxXS50ZXh0TGFiZWwsICdhYWEnKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRBLCAxKTsgLy8gc2hvdWxkIHdlIGtlZXAgdGhlIHN1Z2dlc3Rpb25zIGZyb20gdGhlIFwiYWN0aXZlXCIgcHJvdmlkZXI/LCBZZXMhIFNlZTogIzEwNjU3M1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRCLCAyKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIgd2l0aCBsZXR0ZXJzIGFzIHRyaWdnZXIgY2hhcmFjdGVycyBibG9jayBvdGhlciBjb21wbGV0aW9uIGl0ZW1zIHRvIHNob3cgdXAgIzEyNzgxNScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuQ2xhc3MsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ0FBQUEnLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ1dvcmRUcmlnZ2VyQScsXG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCBwb3MuY29sdW1uLCBwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbilcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICd0ZXN0Jyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbJ2EnLCAnLiddLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdBQUFBJyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdBdXRvVHJpZ2dlckEnLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbiwgcG9zLmxpbmVOdW1iZXIsIHBvcy5jb2x1bW4pXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB3aXRoT3JhY2xlKGFzeW5jIChtb2RlbCwgZWRpdG9yKSA9PiB7XG5cblx0XHRcdGF3YWl0IGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0VmFsdWUoJycpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJy4nIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0fSk7XG5cblxuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkuc2V0VmFsdWUoJycpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldFZhbHVlKCcnKTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdhJyB9KTtcblxuXHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIHN1Z2dlc3Qgc2NvcmluZyAjMTY3MjQyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlcignKicsIHtcblx0XHRcdC8vIHdvcmQtYmFzZWRcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmQgPSBkb2MuZ2V0V29yZFVudGlsUG9zaXRpb24ocG9zKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdwdWxsJyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdwdWxsJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zLmxpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIHBvcy5saW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbilcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwge1xuXHRcdFx0Ly8gSlNPTi1iYXNlZFxuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICd0ZXN0Jyxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoZG9jLCBwb3MpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5DbGFzcyxcblx0XHRcdFx0XHRcdGxhYmVsOiAnZ2l0LnB1bGwnLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ2dpdC5wdWxsJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zLmxpbmVOdW1iZXIsIDEsIHBvcy5saW5lTnVtYmVyLCBwb3MuY29sdW1uKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gd2l0aE9yYWNsZShhc3luYyBmdW5jdGlvbiAobW9kZWwsIGVkaXRvcikge1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldFZhbHVlKCdnaScpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMykpO1xuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ3QnIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zWzBdLnRleHRMYWJlbCwgJ2dpdC5wdWxsJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICcuJyB9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAncCcgfSk7XG5cblx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXNbMF0udGV4dExhYmVsLCAnZ2l0LnB1bGwnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDb21wbGV0aW9uIGxpc3QgY2xvc2VzIHVuZXhwZWN0ZWRseSB3aGVuIHR5cGluZyBhIGRpZ2l0IGFmdGVyIGEgd29yZCBzZXBhcmF0b3IgIzE2OTM5MCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHJlcXVlc3RDb3VudHMgPSBbMCwgMF07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0JyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zKSB7XG5cdFx0XHRcdHJlcXVlc3RDb3VudHNbMF0gKz0gMTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdmb28tMjAnLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ2Zvby0yMCcsXG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCAxLCBwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbilcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRcdGxhYmVsOiAnZm9vLWhlbGxvJyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdmb28taGVsbG8nLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3MubGluZU51bWJlciwgMSwgcG9zLmxpbmVOdW1iZXIsIHBvcy5jb2x1bW4pXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogWycyJ10sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zLCBjdHgpIHtcblx0XHRcdFx0cmVxdWVzdENvdW50c1sxXSArPSAxO1xuXHRcdFx0XHRpZiAoY3R4LnRyaWdnZXJLaW5kICE9PSBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdmb28tMjEwJyxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdmb28tMjEwJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zLmxpbmVOdW1iZXIsIDEsIHBvcy5saW5lTnVtYmVyLCBwb3MuY29sdW1uKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gd2l0aE9yYWNsZShhc3luYyBmdW5jdGlvbiAobW9kZWwsIGVkaXRvcikge1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldFZhbHVlKCdmb28nKTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpKTtcblx0XHRcdFx0bW9kZWwudHJpZ2dlcih7IGF1dG86IGZhbHNlIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtc1swXS50ZXh0TGFiZWwsICdmb28tMjAnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtc1sxXS50ZXh0TGFiZWwsICdmb28taGVsbG8nKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJy0nIH0pO1xuXG5cblx0XHRcdGF3YWl0IGFzc2VydEV2ZW50KG1vZGVsLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJzInIH0pO1xuXG5cdFx0XHR9LCBldmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zWzBdLnRleHRMYWJlbCwgJ2Zvby0yMCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zWzFdLnRleHRMYWJlbCwgJ2Zvby0yMTAnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0Q291bnRzLCBbMSwgMl0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NldCByZWZpbHRlci1mbGFnLCBrZWVwIHRyaWdnZXJLaW5kJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICd0ZXN0Jyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbJy4nXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoZG9jLCBwb3MsIGN0eCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGRvYy5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3MpLndvcmQgfHwgJ2hlbGxvJyxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdmb29mb28nLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IGdldERlZmF1bHRTdWdnZXN0UmFuZ2UoZG9jLCBwb3MpXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoYXN5bmMgZnVuY3Rpb24gKG1vZGVsLCBlZGl0b3IpIHtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRWYWx1ZSgnZm9vJyk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSk7XG5cdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnbycgfSk7XG5cblxuXHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy50cmlnZ2VyQ2hhcmFjdGVyLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMudHJpZ2dlcktpbmQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICcuJyB9KTtcblxuXHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy5yZWZpbHRlciwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLnRyaWdnZXJDaGFyYWN0ZXIsICcuJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy50cmlnZ2VyS2luZCwgQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnaCcgfSk7XG5cblx0XHRcdH0sIGV2ZW50ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMucmVmaWx0ZXIsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMudHJpZ2dlckNoYXJhY3RlciwgJy4nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLnRyaWdnZXJLaW5kLCBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0cyBnb25lIGZyb20gSW50ZWxsaVNlbnNlICMxNzMyNDQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBzbmlwcGV0UHJvdmlkZXI6IENvbXBsZXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcywgY3R4KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ2xvZycsXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6ICdsb2cnLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IGdldERlZmF1bHRTdWdnZXN0UmFuZ2UoZG9jLCBwb3MpXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IG9sZCA9IHNldFNuaXBwZXRTdWdnZXN0U3VwcG9ydChzbmlwcGV0UHJvdmlkZXIpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoZ2V0U25pcHBldFN1Z2dlc3RTdXBwb3J0KCkgPT09IHNuaXBwZXRQcm92aWRlcikge1xuXHRcdFx0XHRzZXRTbmlwcGV0U3VnZ2VzdFN1cHBvcnQob2xkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0JyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnLiddLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcywgY3R4KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ2xvY2FscycsXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnbG9jYWxzJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBnZXREZWZhdWx0U3VnZ2VzdFJhbmdlKGRvYywgcG9zKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGluY29tcGxldGU6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHdpdGhPcmFjbGUoYXN5bmMgZnVuY3Rpb24gKG1vZGVsLCBlZGl0b3IpIHtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0RXZlbnQobW9kZWwub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRWYWx1ZSgnJyk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnbCcgfSk7XG5cblxuXHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50cmlnZ2VyT3B0aW9ucy50cmlnZ2VyQ2hhcmFjdGVyLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMudHJpZ2dlcktpbmQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtc1swXS50ZXh0TGFiZWwsICdsb2NhbHMnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbXBsZXRpb25Nb2RlbC5pdGVtc1sxXS50ZXh0TGFiZWwsICdsb2cnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRFdmVudChtb2RlbC5vbkRpZFN1Z2dlc3QsICgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdvJyB9KTtcblxuXHRcdFx0fSwgZXZlbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudHJpZ2dlck9wdGlvbnMudHJpZ2dlcktpbmQsIENvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyRm9ySW5jb21wbGV0ZUNvbXBsZXRpb25zKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRyaWdnZXJPcHRpb25zLmF1dG8sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXNbMF0udGV4dExhYmVsLCAnbG9jYWxzJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXNbMV0udGV4dExhYmVsLCAnbG9nJyk7XG5cdFx0XHR9KTtcblxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMgLSBhbGxvd3MgcXVpY2sgc3VnZ2VzdCB3aGVuIGlubGluZSBwcm92aWRlciByZXR1cm5zIGVtcHR5IHJlc3VsdHMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0JyB9LCBhbHdheXNTb21ldGhpbmdTdXBwb3J0KSk7XG5cblx0XHQvLyBSZWdpc3RlciBhIGR1bW15IGlubGluZSBjb21wbGV0aW9ucyBwcm92aWRlciB0aGF0IHJldHVybnMgbm8gaXRlbXNcblx0XHRjb25zdCBpbmxpbmVQcm92aWRlcjogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVJbmxpbmVDb21wbGV0aW9uczogKCkgPT4gKHsgaXRlbXM6IFtdIH0pLFxuXHRcdFx0ZGlzcG9zZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7IH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwgaW5saW5lUHJvdmlkZXIpKTtcblxuXHRcdHJldHVybiB3aXRoT3JhY2xlKChzdWdnZXN0T3JhY2xlLCBlZGl0b3IpID0+IHtcblx0XHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHsgcXVpY2tTdWdnZXN0aW9uczogeyBjb21tZW50czogJ29mZicsIHN0cmluZ3M6ICdvZmYnLCBvdGhlcjogJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucycgfSB9KTtcblxuXHRcdFx0Ly8gV2l0aG91dCBhbiBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIsIHRoZSBmYWxsYmFjayB0cmlnZ2VycyBpbW1lZGlhdGVseVxuXHRcdFx0cmV0dXJuIGFzc2VydEV2ZW50KHN1Z2dlc3RPcmFjbGUub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9KTtcblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdkJyB9KTtcblx0XHRcdH0sIHN1Z2dlc3RFdmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWdnZXN0RXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zIC0gYWxsb3dzIHF1aWNrIHN1Z2dlc3Qgd2hlbiBubyBpbmxpbmUgcHJvdmlkZXIgZXhpc3RzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwgYWx3YXlzU29tZXRoaW5nU3VwcG9ydCkpO1xuXG5cdFx0Ly8gTm8gaW5saW5lIGNvbXBsZXRpb25zIHByb3ZpZGVyIHJlZ2lzdGVyZWQgZm9yICd0ZXN0JyBzY2hlbWVcblxuXHRcdHJldHVybiB3aXRoT3JhY2xlKChzdWdnZXN0T3JhY2xlLCBlZGl0b3IpID0+IHtcblx0XHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHsgcXVpY2tTdWdnZXN0aW9uczogeyBjb21tZW50czogJ29mZicsIHN0cmluZ3M6ICdvZmYnLCBvdGhlcjogJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucycgfSB9KTtcblxuXHRcdFx0cmV0dXJuIGFzc2VydEV2ZW50KHN1Z2dlc3RPcmFjbGUub25EaWRTdWdnZXN0LCAoKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9KTtcblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICdkJyB9KTtcblx0XHRcdH0sIHN1Z2dlc3RFdmVudCA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWdnZXN0RXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWdnZXN0RXZlbnQuY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zIC0gYWxsb3dzIHF1aWNrIHN1Z2dlc3Qgd2hlbiBpbmxpbmVTdWdnZXN0IGlzIGRpc2FibGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIGFsd2F5c1NvbWV0aGluZ1N1cHBvcnQpKTtcblxuXHRcdFx0Ly8gUmVnaXN0ZXIgYSBkdW1teSBpbmxpbmUgY29tcGxldGlvbnMgcHJvdmlkZXJcblx0XHRcdGNvbnN0IGlubGluZVByb3ZpZGVyOiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlSW5saW5lQ29tcGxldGlvbnM6ICgpID0+ICh7IGl0ZW1zOiBbXSB9KSxcblx0XHRcdFx0ZGlzcG9zZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIGlubGluZVByb3ZpZGVyKSk7XG5cblx0XHRcdHJldHVybiB3aXRoT3JhY2xlKChzdWdnZXN0T3JhY2xlLCBlZGl0b3IpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRcdHF1aWNrU3VnZ2VzdGlvbnM6IHsgY29tbWVudHM6ICdvZmYnLCBzdHJpbmdzOiAnb2ZmJywgb3RoZXI6ICdvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMnIH0sXG5cdFx0XHRcdFx0aW5saW5lU3VnZ2VzdDogeyBlbmFibGVkOiBmYWxzZSB9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBhc3NlcnRFdmVudChzdWdnZXN0T3JhY2xlLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9KTtcblx0XHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2QnIH0pO1xuXHRcdFx0XHR9LCBzdWdnZXN0RXZlbnQgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWdnZXN0RXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Z2dlc3RFdmVudC5jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaW5nIHNob3J0aGFuZCAtIFwib2ZmXCIgZGlzYWJsZXMgcXVpY2sgc3VnZ2VzdGlvbnMgZm9yIGFsbCB0b2tlbiB0eXBlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCAoKSA9PiB7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3Rlcih7IHNjaGVtZTogJ3Rlc3QnIH0sIGFsd2F5c1NvbWV0aGluZ1N1cHBvcnQpKTtcblxuXHRcdFx0cmV0dXJuIHdpdGhPcmFjbGUoKHN1Z2dlc3RPcmFjbGUsIGVkaXRvcikgPT4ge1xuXHRcdFx0XHQvLyBVc2Ugc3RyaW5nIHNob3J0aGFuZCBpbnN0ZWFkIG9mIG9iamVjdCBmb3JtXG5cdFx0XHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHsgcXVpY2tTdWdnZXN0aW9uczogJ29mZicgfSk7XG5cblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzdWIgPSBzdWdnZXN0T3JhY2xlLm9uRGlkU3VnZ2VzdCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignUXVpY2sgc3VnZ2VzdGlvbnMgc2hvdWxkIGhhdmUgYmVlbiBzdXBwcmVzc2VkIGJ5IHN0cmluZyBzaG9ydGhhbmQgXCJvZmZcIicpKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9KTtcblx0XHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2QnIH0pO1xuXG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH0sIDIwMCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmluZyBzaG9ydGhhbmQgLSBcIm9mZldoZW5JbmxpbmVDb21wbGV0aW9uc1wiIGFsbG93cyBxdWljayBzdWdnZXN0IHdoZW4gaW5saW5lIHByb3ZpZGVyIHJldHVybnMgZW1wdHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgc2NoZW1lOiAndGVzdCcgfSwgYWx3YXlzU29tZXRoaW5nU3VwcG9ydCkpO1xuXG5cdFx0XHRjb25zdCBpbmxpbmVQcm92aWRlcjogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiAoeyBpdGVtczogW10gfSksXG5cdFx0XHRcdGRpc3Bvc2VJbmxpbmVDb21wbGV0aW9uczogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6ICd0ZXN0JyB9LCBpbmxpbmVQcm92aWRlcikpO1xuXG5cdFx0XHRyZXR1cm4gd2l0aE9yYWNsZSgoc3VnZ2VzdE9yYWNsZSwgZWRpdG9yKSA9PiB7XG5cdFx0XHRcdC8vIFVzZSBzdHJpbmcgc2hvcnRoYW5kIC0gYXBwbGllcyB0byBhbGwgdG9rZW4gdHlwZXNcblx0XHRcdFx0ZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBxdWlja1N1Z2dlc3Rpb25zOiAnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zJyB9KTtcblxuXHRcdFx0XHQvLyBXaXRob3V0IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciwgdGhlIGZhbGxiYWNrIHRyaWdnZXJzIGltbWVkaWF0ZWx5XG5cdFx0XHRcdHJldHVybiBhc3NlcnRFdmVudChzdWdnZXN0T3JhY2xlLm9uRGlkU3VnZ2VzdCwgKCkgPT4ge1xuXHRcdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9KTtcblx0XHRcdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2QnIH0pO1xuXHRcdFx0XHR9LCBzdWdnZXN0RXZlbnQgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWdnZXN0RXZlbnQudHJpZ2dlck9wdGlvbnMuYXV0bywgdHJ1ZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdTdWdnZXN0TW9kZWwgLSBvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMgd2l0aCBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXInLCBmdW5jdGlvbiAoKSB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgY29tcGxldGlvblByb3ZpZGVyOiBDb21wbGV0aW9uSXRlbVByb3ZpZGVyID0ge1xuXHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcyk6IENvbXBsZXRpb25MaXN0IHtcblx0XHRcdGNvbnN0IHdvcmRVbnRpbCA9IGRvYy5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3MpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5jb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdGxhYmVsOiBkb2MuZ2V0V29yZFVudGlsUG9zaXRpb24ocG9zKS53b3JkLFxuXHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSxcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnZm9vZm9vJyxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCB3b3JkVW50aWwuc3RhcnRDb2x1bW4sIHBvcy5saW5lTnVtYmVyLCB3b3JkVW50aWwuZW5kQ29sdW1uKVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cdH07XG5cblx0YXN5bmMgZnVuY3Rpb24gd2l0aFN1Z2dlc3RNb2RlbEFuZElubGluZUNvbXBsZXRpb25zKFxuXHRcdHRleHQ6IHN0cmluZyxcblx0XHRpbmxpbmVQcm92aWRlcjogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcixcblx0XHRjYWxsYmFjazogKHN1Z2dlc3RNb2RlbDogU3VnZ2VzdE1vZGVsLCBlZGl0b3I6IElUZXN0Q29kZUVkaXRvcikgPT4gUHJvbWlzZTx2b2lkPixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHBhdHRlcm46ICcqKicgfSwgY29tcGxldGlvblByb3ZpZGVyKSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5yZWdpc3Rlcih7IHBhdHRlcm46ICcqKicgfSwgaW5saW5lUHJvdmlkZXIpKTtcblxuXHRcdFx0XHRjb25zdCBzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFx0XHRbSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZV0sXG5cdFx0XHRcdFx0W0lUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZV0sXG5cdFx0XHRcdFx0W0lMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKV0sXG5cdFx0XHRcdFx0W0lTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKV0sXG5cdFx0XHRcdFx0W0lLZXliaW5kaW5nU2VydmljZSwgbmV3IE1vY2tLZXliaW5kaW5nU2VydmljZSgpXSxcblx0XHRcdFx0XHRbSUVkaXRvcldvcmtlclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvcldvcmtlclNlcnZpY2U+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgY29tcHV0ZVdvcmRSYW5nZXMoKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFtJU3VnZ2VzdE1lbW9yeVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVN1Z2dlc3RNZW1vcnlTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIG1lbW9yaXplKCk6IHZvaWQgeyB9XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBzZWxlY3QoKTogbnVtYmVyIHsgcmV0dXJuIDA7IH1cblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRbSU1lbnVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNZW51U2VydmljZT4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBjcmVhdGVNZW51KCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWVudT4oKSB7XG5cdFx0XHRcdFx0XHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRcdFx0XHRcdG92ZXJyaWRlIGRpc3Bvc2UoKSB7IH1cblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRbSUxhYmVsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFiZWxTZXJ2aWNlPigpIHsgfV0sXG5cdFx0XHRcdFx0W0lXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkgeyB9XSxcblx0XHRcdFx0XHRbSUVudmlyb25tZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRW52aXJvbm1lbnRTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIGlzQnVpbHQ6IGJvb2xlYW4gPSB0cnVlO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgaXNFeHRlbnNpb25EZXZlbG9wbWVudDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFtJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHBsYXlTaWduYWwoKSB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIGlzU291bmRFbmFibGVkKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRbSURlZmF1bHRBY2NvdW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGVmYXVsdEFjY291bnRTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0RGVmYXVsdEFjY291bnQgPSBhc3luYyAoKSA9PiBudWxsO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgc2V0RGVmYXVsdEFjY291bnRQcm92aWRlciA9ICgpID0+IHsgfTtcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcih0ZXh0LCB7IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IsIF9lZGl0b3JWaWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKElubGluZVN1Z2dlc3Rpb25zVmlldywge1xuXHRcdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0ZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oU25pcHBldENvbnRyb2xsZXIyLklELCBTbmlwcGV0Q29udHJvbGxlcjIpO1xuXHRcdFx0XHRcdGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5JRCwgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyKTtcblxuXHRcdFx0XHRcdGVkaXRvci5oYXNXaWRnZXRGb2N1cyA9ICgpID0+IHRydWU7XG5cdFx0XHRcdFx0ZWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRcdFx0cXVpY2tTdWdnZXN0aW9uczogeyBjb21tZW50czogJ29mZicsIHN0cmluZ3M6ICdvZmYnLCBvdGhlcjogJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucycgfSxcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGNvbnN0IHN1Z2dlc3RNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoXG5cdFx0XHRcdFx0XHRlZGl0b3IuaW52b2tlV2l0aGluQ29udGV4dChhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5jcmVhdGVJbnN0YW5jZShTdWdnZXN0TW9kZWwsIGVkaXRvcikpXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGF3YWl0IGNhbGxiYWNrKHN1Z2dlc3RNb2RlbCwgZWRpdG9yKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRNb2RpZmllcktleUVtaXR0ZXIuZGlzcG9zZUluc3RhbmNlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdzdXBwcmVzc2VzIHF1aWNrIHN1Z2dlc3Qgd2hlbiBpbmxpbmUgY29tcGxldGlvbnMgYXJlIHNob3dpbmcgZ2hvc3QgdGV4dCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbmxpbmVQcm92aWRlcjogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVJbmxpbmVDb21wbGV0aW9uczogKG1vZGVsLCBwb3MpID0+IHtcblx0XHRcdFx0Ly8gUmV0dXJuIGEgY29tcGxldGlvbiB0aGF0IGV4dGVuZHMgdGhlIGN1cnJlbnQgd29yZCAtIG11c3QgYmUgdmlzaWJsZSBhdCBjdXJzb3Jcblx0XHRcdFx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHBvcyk7XG5cdFx0XHRcdGlmICghd29yZCkgeyByZXR1cm4geyBpdGVtczogW10gfTsgfVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGl0ZW1zOiBbe1xuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogd29yZC53b3JkICsgJ1N1ZmZpeCcsXG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCBwb3MubGluZU51bWJlciwgd29yZC5lbmRDb2x1bW4pLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7IH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgd2l0aFN1Z2dlc3RNb2RlbEFuZElubGluZUNvbXBsZXRpb25zKCdhYmMgZGVmJywgaW5saW5lUHJvdmlkZXIsIGFzeW5jIChzdWdnZXN0TW9kZWwsIGVkaXRvcikgPT4ge1xuXHRcdFx0bGV0IGRpZFN1Z2dlc3QgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHN1YiA9IHN1Z2dlc3RNb2RlbC5vbkRpZFN1Z2dlc3QoKCkgPT4geyBkaWRTdWdnZXN0ID0gdHJ1ZTsgfSk7XG5cblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9KTtcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnZCcgfSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMjAwKTtcblxuXHRcdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRTdWdnZXN0LCBmYWxzZSwgJ1F1aWNrIHN1Z2dlc3Rpb25zIHNob3VsZCBoYXZlIGJlZW4gc3VwcHJlc3NlZCB3aGVuIGlubGluZSBjb21wbGV0aW9ucyBhcmUgc2hvd2luZycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgcXVpY2sgc3VnZ2VzdCB3aGVuIGlubGluZSBjb21wbGV0aW9ucyByZXNvbHZlIHdpdGggbm8gcmVzdWx0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbmxpbmVQcm92aWRlcjogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVJbmxpbmVDb21wbGV0aW9uczogKCkgPT4gKHsgaXRlbXM6IFtdIH0pLFxuXHRcdFx0ZGlzcG9zZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7IH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgd2l0aFN1Z2dlc3RNb2RlbEFuZElubGluZUNvbXBsZXRpb25zKCdhYmMgZGVmJywgaW5saW5lUHJvdmlkZXIsIGFzeW5jIChzdWdnZXN0TW9kZWwsIGVkaXRvcikgPT4ge1xuXHRcdFx0bGV0IGRpZFN1Z2dlc3QgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHN1YiA9IHN1Z2dlc3RNb2RlbC5vbkRpZFN1Z2dlc3QoZSA9PiB7XG5cdFx0XHRcdGRpZFN1Z2dlc3QgPSB0cnVlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDQgfSk7XG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2QnIH0pO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDIwMCk7XG5cblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkU3VnZ2VzdCwgdHJ1ZSwgJ1F1aWNrIHN1Z2dlc3Rpb25zIHNob3VsZCBoYXZlIGJlZW4gdHJpZ2dlcmVkIGFmdGVyIGlubGluZSBjb21wbGV0aW9ucyByZXNvbHZlZCBlbXB0eScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgcXVpY2sgc3VnZ2VzdCB3aGVuIGlubGluZVN1Z2dlc3QgaXMgZGlzYWJsZWQgZXZlbiB3aXRoIHByb3ZpZGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGlubGluZVByb3ZpZGVyOiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZUlubGluZUNvbXBsZXRpb25zOiAobW9kZWwsIHBvcykgPT4ge1xuXHRcdFx0XHRjb25zdCB3b3JkID0gbW9kZWwuZ2V0V29yZEF0UG9zaXRpb24ocG9zKTtcblx0XHRcdFx0aWYgKCF3b3JkKSB7IHJldHVybiB7IGl0ZW1zOiBbXSB9OyB9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiB3b3JkLndvcmQgKyAnU3VmZml4Jyxcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zLmxpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIHBvcy5saW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbiksXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlSW5saW5lQ29tcGxldGlvbnM6ICgpID0+IHsgfVxuXHRcdH07XG5cblx0XHRhd2FpdCB3aXRoU3VnZ2VzdE1vZGVsQW5kSW5saW5lQ29tcGxldGlvbnMoJ2FiYyBkZWYnLCBpbmxpbmVQcm92aWRlciwgYXN5bmMgKHN1Z2dlc3RNb2RlbCwgZWRpdG9yKSA9PiB7XG5cdFx0XHRlZGl0b3IudXBkYXRlT3B0aW9ucyh7IGlubGluZVN1Z2dlc3Q6IHsgZW5hYmxlZDogZmFsc2UgfSB9KTtcblxuXHRcdFx0bGV0IGRpZFN1Z2dlc3QgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHN1YiA9IHN1Z2dlc3RNb2RlbC5vbkRpZFN1Z2dlc3QoZSA9PiB7XG5cdFx0XHRcdGRpZFN1Z2dlc3QgPSB0cnVlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS50cmlnZ2VyT3B0aW9ucy5hdXRvLCB0cnVlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDQgfSk7XG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ2QnIH0pO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDIwMCk7XG5cblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkU3VnZ2VzdCwgdHJ1ZSwgJ1F1aWNrIHN1Z2dlc3Rpb25zIHNob3VsZCBoYXZlIGJlZW4gdHJpZ2dlcmVkIHdoZW4gaW5saW5lU3VnZ2VzdCBpcyBkaXNhYmxlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB0cmlnZ2VyIGFmdGVyIHRoZSBpbmxpbmUgbW9kZWwgaXMgZGlzcG9zZWQgbWlkLXdhaXQgKGUuZy4sIHJlYWRvbmx5IHRvZ2dsZWQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdC8vIFByb3ZpZGVyIHRoYXQgb25seSByZXNvbHZlcyB3aGVuIGl0cyBjYW5jZWxsYXRpb24gdG9rZW4gZmlyZXMuIFRoaXMga2VlcHMgdGhlXG5cdFx0Ly8gd2FpdCBpbiB0aGUgbG9hZGluZyBzdGF0ZSB1bnRpbCBlaXRoZXIgdGhlIGlubGluZSBtb2RlbCBpcyBkaXNwb3NlZFxuXHRcdC8vIChjYW5jZWxsaW5nIHRoZSB0b2tlbikgb3IgdGhlIDc1MG1zIHRpbWVvdXQgZmlyZXMuXG5cdFx0Y29uc3QgaW5saW5lUHJvdmlkZXI6IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIgPSB7XG5cdFx0XHRwcm92aWRlSW5saW5lQ29tcGxldGlvbnM6IChfbW9kZWwsIF9wb3MsIF9jdHgsIHRva2VuKSA9PiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgZCA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKHsgaXRlbXM6IFtdIH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pLFxuXHRcdFx0ZGlzcG9zZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7IH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgd2l0aFN1Z2dlc3RNb2RlbEFuZElubGluZUNvbXBsZXRpb25zKCdhYmMgZGVmJywgaW5saW5lUHJvdmlkZXIsIGFzeW5jIChzdWdnZXN0TW9kZWwsIGVkaXRvcikgPT4ge1xuXHRcdFx0bGV0IGRpZFN1Z2dlc3QgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHN1YiA9IHN1Z2dlc3RNb2RlbC5vbkRpZFN1Z2dlc3QoKCkgPT4geyBkaWRTdWdnZXN0ID0gdHJ1ZTsgfSk7XG5cblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9KTtcblx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnZCcgfSk7XG5cblx0XHRcdC8vIExldCBfd2FpdEZvcklubGluZUNvbXBsZXRpb25zQW5kVHJpZ2dlciBiZSBzY2hlZHVsZWQgYW5kIHNldCB1cC5cblx0XHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0XHQvLyBUb2dnbGluZyByZWFkb25seSBjYXVzZXMgdGhlIGNvbnRyb2xsZXIncyBgbW9kZWxgIGRlcml2ZWREaXNwb3NhYmxlIHRvXG5cdFx0XHQvLyByZWNvbXB1dGUgYW5kIGRpc3Bvc2UgdGhlIElubGluZUNvbXBsZXRpb25zTW9kZWwuIFN1Z2dlc3RNb2RlbCBkb2VzIE5PVFxuXHRcdFx0Ly8gY2FuY2VsIG9uIGNvbmZpZ3VyYXRpb24gY2hhbmdlLCBzbyB3aXRob3V0IGJpbmRpbmcgdGhlIHdhaXQgdG8gdGhlXG5cdFx0XHQvLyBtb2RlbCdzIGxpZmV0aW1lLCB0aGUgNzUwbXMgdGltZW91dCB3b3VsZCBzdGlsbCBmaXJlIGFuZCBjYWxsXG5cdFx0XHQvLyBgdGhpcy50cmlnZ2VyKHsgYXV0bzogdHJ1ZSB9KWAgKGFuZCBgc3RvcCgpYCBvbiB0aGUgZGlzcG9zZWQgbW9kZWwpLlxuXHRcdFx0ZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogdHJ1ZSB9KTtcblxuXHRcdFx0Ly8gQWR2YW5jZSBwYXN0IHRoZSA3NTBtcyB0aW1lb3V0IHdpbmRvdy5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkU3VnZ2VzdCwgZmFsc2UsXG5cdFx0XHRcdCdRdWljayBzdWdnZXN0IHNob3VsZCBub3QgZmlyZSBhZnRlciB0aGUgaW5saW5lIG1vZGVsIGlzIGRpc3Bvc2VkIG1pZC13YWl0Jyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBZ0Isb0JBQW9CO0FBQ3BDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx3QkFBd0IsdUJBQXVCO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBNEQsdUJBQXVCLDJCQUE4RCw0QkFBNEI7QUFDdEwsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxpQkFBaUI7QUFHMUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxzQkFBdUMsK0JBQStCO0FBQy9FLFNBQVMscUJBQXFCLGlCQUFpQiw0QkFBNEI7QUFDM0UsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQkFBMEIsZ0NBQWdDO0FBQ25FLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYSxvQkFBb0I7QUFJMUMsU0FBUyxpQkFBaUIsT0FBa0IseUJBQW9FO0FBRS9HLFFBQU0sZUFBZSxJQUFJLHVCQUF1QjtBQUNoRCxRQUFNLFNBQVMscUJBQXFCLE9BQU87QUFBQSxJQUMxQyxtQkFBbUIsSUFBSTtBQUFBLE1BQ3RCLENBQUMsMEJBQTBCLHVCQUF1QjtBQUFBLE1BQ2xELENBQUMsbUJBQW1CLG9CQUFvQjtBQUFBLE1BQ3hDLENBQUMsaUJBQWlCLFlBQVk7QUFBQSxNQUM5QixDQUFDLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQUEsTUFDaEQsQ0FBQyx1QkFBdUIsSUFBSSxNQUF1QztBQUFBLFFBRWxFLFdBQWlCO0FBQUEsUUFDakI7QUFBQSxRQUNBLFNBQWlCO0FBQ2hCLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsR0FBQztBQUFBLE1BQ0QsQ0FBQyxlQUFlLElBQUksY0FBYyxLQUFvQixFQUFFO0FBQUEsTUFBRSxHQUFDO0FBQUEsTUFDM0QsQ0FBQywwQkFBMEIsSUFBSSxjQUFjLEtBQStCLEVBQUU7QUFBQSxNQUFFLEdBQUM7QUFBQSxNQUNqRixDQUFDLHFCQUFxQixJQUFJLGNBQWMsS0FBMEIsRUFBRTtBQUFBLFFBQTFDO0FBQUE7QUFDekIsZUFBUyxVQUFtQjtBQUM1QixlQUFTLHlCQUFrQztBQUFBO0FBQUEsTUFDNUMsR0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFDRCxRQUFNLE9BQU8sT0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBQ2hHLFNBQU8saUJBQWlCLE1BQU07QUFFOUIsU0FBTyxtQkFBbUIsSUFBSTtBQUM5QixTQUFPLG1CQUFtQixZQUFZO0FBQ3RDLFNBQU87QUFDUjtBQUVBLE1BQU0sMEJBQTBCLFdBQVk7QUFDM0MsUUFBTSxvQkFBb0I7QUFDMUIsUUFBTSxvQkFBb0I7QUFFMUIsTUFBTSxZQUFOLGNBQXdCLFdBQVc7QUFBQSxJQUVsQyxZQUNtQixpQkFDYSw4QkFDOUI7QUFDRCxZQUFNO0FBTFAsV0FBZ0IsYUFBYTtBQU01QixXQUFLLFVBQVUsZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQztBQUN4RSxXQUFLLFVBQVUsNkJBQTZCLFNBQVMsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDO0FBRXpFLFdBQUssVUFBVSxxQkFBcUIsU0FBUyxLQUFLLFlBQVk7QUFBQSxRQUM3RCxpQkFBaUIsTUFBYztBQUFBLFFBQy9CLFVBQVU7QUFBQSxRQUNWLGlCQUFpQixDQUFDLE1BQWMsUUFBaUIsVUFBNkM7QUFDN0YsZ0JBQU0sWUFBc0IsQ0FBQztBQUM3QixjQUFJLGlCQUFxQztBQUN6QyxtQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFFBQVEsS0FBSztBQUNyQyxrQkFBTSxhQUFjLEtBQUssT0FBTyxDQUFDLE1BQU0sTUFBTSxvQkFBb0I7QUFDakUsa0JBQU0sb0JBQW9CLGdCQUFnQixnQkFBZ0IsaUJBQWlCLFVBQVU7QUFDckYsZ0JBQUksbUJBQW1CLFlBQVk7QUFDbEMsd0JBQVUsS0FBSyxDQUFDO0FBQ2hCLHdCQUFVLEtBQU0scUJBQXFCLGVBQWUsaUJBQWtCO0FBQUEsWUFDdkU7QUFDQSw2QkFBaUI7QUFBQSxVQUNsQjtBQUVBLGdCQUFNLFNBQVMsSUFBSSxZQUFZLFVBQVUsTUFBTTtBQUMvQyxtQkFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFFBQVEsS0FBSztBQUN2QyxtQkFBTyxDQUFDLElBQUksVUFBVSxDQUFDO0FBQUEsVUFDeEI7QUFDQSxpQkFBTyxJQUFJLDBCQUEwQixRQUFRLENBQUMsR0FBRyxLQUFLO0FBQUEsUUFDdkQ7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBbENNLGNBQU47QUFBQSxJQUdHO0FBQUEsSUFDQTtBQUFBLEtBSkc7QUFvQ04sTUFBTSxZQUFOLGNBQXdCLFdBQVc7QUFBQSxJQUVsQyxZQUNtQixpQkFDYSw4QkFDOUI7QUFDRCxZQUFNO0FBTFAsV0FBZ0IsYUFBYTtBQU01QixXQUFLLFVBQVUsZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQztBQUN4RSxXQUFLLFVBQVUsNkJBQTZCLFNBQVMsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDMUU7QUFBQSxFQUNEO0FBVk0sY0FBTjtBQUFBLElBR0c7QUFBQSxJQUNBO0FBQUEsS0FKRztBQVlOLFFBQU0sb0JBQW9CLENBQUMsT0FBa0IsUUFBZ0IsVUFBbUIsWUFBMkI7QUFDMUcsVUFBTSxNQUFNLE1BQU0sY0FBYyxNQUFNO0FBQ3RDLFVBQU0sU0FBUyxpQkFBaUIsT0FBTyxJQUFJLHdCQUF3QixDQUFDO0FBQ3BFLFdBQU8sWUFBWSxHQUFHO0FBQ3RCLFdBQU8sWUFBWSxZQUFZLGtCQUFrQixNQUFNLEdBQUcsVUFBVSxPQUFPO0FBQzNFLFdBQU8sUUFBUTtBQUFBLEVBQ2hCO0FBRUEsTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLGtCQUFjLElBQUksZ0JBQWdCO0FBQUEsRUFDbkMsQ0FBQztBQUVELFdBQVMsV0FBWTtBQUNwQixnQkFBWSxRQUFRO0FBQUEsRUFDckIsQ0FBQztBQUVELDBDQUF3QztBQUV4QyxPQUFLLCtCQUErQixXQUFZO0FBQy9DLFVBQU0sUUFBUSxnQkFBZ0IsK0VBQWdGO0FBQzlHLGdCQUFZLElBQUksS0FBSztBQUVyQixzQkFBa0IsT0FBTyxHQUFHLE1BQU0sbUJBQW1CO0FBQ3JELHNCQUFrQixPQUFPLEdBQUcsT0FBTyxlQUFlO0FBQ2xELHNCQUFrQixPQUFPLEdBQUcsTUFBTSwrQ0FBK0M7QUFDakYsc0JBQWtCLE9BQU8sSUFBSSxPQUFPLGVBQWU7QUFDbkQsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNQSxlQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0sdUJBQXVCLG9CQUFvQkEsWUFBVztBQUM1RCxVQUFNLFlBQVlBLGFBQVksSUFBSSxxQkFBcUIsZUFBZSxTQUFTLENBQUM7QUFDaEYsSUFBQUEsYUFBWSxJQUFJLHFCQUFxQixlQUFlLFNBQVMsQ0FBQztBQUU5RCxVQUFNLFFBQVFBLGFBQVksSUFBSSxxQkFBcUIsc0JBQXNCLGFBQWEsVUFBVSxVQUFVLENBQUM7QUFFM0csc0JBQWtCLE9BQU8sR0FBRyxNQUFNLDJDQUFzQztBQUN4RSxzQkFBa0IsT0FBTyxHQUFHLE9BQU8saURBQTRDO0FBQy9FLHNCQUFrQixPQUFPLEdBQUcsTUFBTSw0RUFBdUU7QUFDekcsc0JBQWtCLE9BQU8sR0FBRyxNQUFNLDREQUF1RDtBQUN6RixzQkFBa0IsT0FBTyxHQUFHLE9BQU8sb0RBQStDO0FBQ2xGLHNCQUFrQixPQUFPLEdBQUcsTUFBTSwrQ0FBMEM7QUFDNUUsc0JBQWtCLE9BQU8sR0FBRyxNQUFNLDZEQUF3RDtBQUUxRixJQUFBQSxhQUFZLFFBQVE7QUFBQSxFQUNyQixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0seUNBQXlDLFdBQVk7QUFHMUQsV0FBUyx1QkFBdUJDLFFBQW1CLFVBQW9CO0FBQ3RFLFVBQU0sWUFBWUEsT0FBTSxxQkFBcUIsUUFBUTtBQUNyRCxXQUFPLElBQUksTUFBTSxTQUFTLFlBQVksVUFBVSxhQUFhLFNBQVMsWUFBWSxVQUFVLFNBQVM7QUFBQSxFQUN0RztBQUVBLFFBQU0scUJBQTZDO0FBQUEsSUFDbEQsbUJBQW1CO0FBQUEsSUFDbkIsdUJBQXVCLEtBQUssS0FBcUI7QUFDaEQsYUFBTztBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osYUFBYSxDQUFDO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsUUFBTSx5QkFBaUQ7QUFBQSxJQUN0RCxtQkFBbUI7QUFBQSxJQUNuQix1QkFBdUIsS0FBSyxLQUFxQjtBQUNoRCxhQUFPO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixhQUFhLENBQUM7QUFBQSxVQUNiLE9BQU8sSUFBSSxxQkFBcUIsR0FBRyxFQUFFO0FBQUEsVUFDckMsTUFBTSxtQkFBbUI7QUFBQSxVQUN6QixZQUFZO0FBQUEsVUFDWixPQUFPLHVCQUF1QixLQUFLLEdBQUc7QUFBQSxRQUN2QyxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsTUFBSTtBQUNKLE1BQUk7QUFDSixRQUFNLDBCQUEwQixJQUFJLHdCQUF3QjtBQUM1RCxRQUFNLFdBQVcsd0JBQXdCO0FBRXpDLFFBQU0sV0FBWTtBQUNqQixrQkFBYyxJQUFJLGdCQUFnQjtBQUNsQyxZQUFRLGdCQUFnQixXQUFXLFFBQVcsUUFBVyxJQUFJLE1BQU0sbUJBQW1CLENBQUM7QUFDdkYsZ0JBQVksSUFBSSxLQUFLO0FBQUEsRUFDdEIsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLGdCQUFZLFFBQVE7QUFBQSxFQUNyQixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLFdBQVMsV0FBVyxVQUErRTtBQUVsRyxXQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUN2QyxZQUFNLFNBQVMsaUJBQWlCLE9BQU8sdUJBQXVCO0FBQzlELFlBQU0sU0FBUyxPQUFPLG9CQUFvQixjQUFZLFNBQVMsSUFBSSxxQkFBcUIsRUFBRSxlQUFlLGNBQWMsTUFBTSxDQUFDO0FBQzlILGtCQUFZLElBQUksTUFBTTtBQUN0QixrQkFBWSxJQUFJLE1BQU07QUFFdEIsVUFBSTtBQUNILGdCQUFRLFNBQVMsUUFBUSxNQUFNLENBQUM7QUFBQSxNQUNqQyxTQUFTLEtBQUs7QUFDYixlQUFPLEdBQUc7QUFBQSxNQUNYO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUVBLFdBQVMsWUFBZSxPQUFpQixRQUFtQkMsU0FBdUI7QUFDbEYsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsWUFBTSxNQUFNLE1BQU0sT0FBSztBQUN0QixZQUFJLFFBQVE7QUFDWixZQUFJO0FBQ0gsa0JBQVFBLFFBQU8sQ0FBQyxDQUFDO0FBQUEsUUFDbEIsU0FBUyxLQUFLO0FBQ2IsaUJBQU8sR0FBRztBQUFBLFFBQ1g7QUFBQSxNQUNELENBQUM7QUFDRCxVQUFJO0FBQ0gsZUFBTztBQUFBLE1BQ1IsU0FBUyxLQUFLO0FBQ2IsWUFBSSxRQUFRO0FBQ1osZUFBTyxHQUFHO0FBQUEsTUFDWDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxPQUFLLDJCQUEyQixXQUFZO0FBQzNDLFdBQU8sV0FBVyxDQUFBRCxXQUFTO0FBRTFCLGFBQU8sUUFBUSxJQUFJO0FBQUEsUUFFbEIsWUFBWUEsT0FBTSxjQUFjLFdBQVk7QUFDM0MsVUFBQUEsT0FBTSxRQUFRLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxRQUM3QixHQUFHLFNBQVUsT0FBTztBQUNuQixpQkFBTyxZQUFZLE1BQU0sTUFBTSxJQUFJO0FBRW5DLGlCQUFPLFlBQVlBLE9BQU0sYUFBYSxXQUFZO0FBQ2pELFlBQUFBLE9BQU0sT0FBTztBQUFBLFVBQ2QsR0FBRyxTQUFVRSxRQUFPO0FBQ25CLG1CQUFPLFlBQVlBLE9BQU0sV0FBVyxLQUFLO0FBQUEsVUFDMUMsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLFFBRUQsWUFBWUYsT0FBTSxjQUFjLFdBQVk7QUFDM0MsVUFBQUEsT0FBTSxRQUFRLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxRQUM3QixHQUFHLFNBQVUsT0FBTztBQUNuQixpQkFBTyxZQUFZLE1BQU0sTUFBTSxJQUFJO0FBQUEsUUFDcEMsQ0FBQztBQUFBLFFBRUQsWUFBWUEsT0FBTSxjQUFjLFdBQVk7QUFDM0MsVUFBQUEsT0FBTSxRQUFRLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFBQSxRQUM5QixHQUFHLFNBQVUsT0FBTztBQUNuQixpQkFBTyxZQUFZLE1BQU0sTUFBTSxLQUFLO0FBQUEsUUFDckMsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUdELE9BQUssMEJBQTBCLFdBQVk7QUFFMUMsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRyxrQkFBa0IsQ0FBQztBQUV6RSxXQUFPLFdBQVcsQ0FBQUEsV0FBUztBQUMxQixhQUFPLFFBQVEsSUFBSTtBQUFBLFFBQ2xCLFlBQVlBLE9BQU0sYUFBYSxXQUFZO0FBQzFDLFVBQUFBLE9BQU0sUUFBUSxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQUEsUUFDN0IsR0FBRyxTQUFVLE9BQU87QUFDbkIsaUJBQU8sWUFBWSxNQUFNLFdBQVcsS0FBSztBQUFBLFFBQzFDLENBQUM7QUFBQSxRQUNELFlBQVlBLE9BQU0sY0FBYyxXQUFZO0FBQzNDLFVBQUFBLE9BQU0sUUFBUSxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQUEsUUFDOUIsR0FBRyxTQUFVLE9BQU87QUFDbkIsaUJBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxLQUFLO0FBQ25ELGlCQUFPLFlBQVksTUFBTSxVQUFVLEtBQUs7QUFDeEMsaUJBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUFBLFFBQ3pELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFCQUFxQixXQUFZO0FBRXJDLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUcsc0JBQXNCLENBQUM7QUFFN0UsV0FBTyxXQUFXLENBQUNBLFFBQU8sV0FBVztBQUNwQyxhQUFPLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQzVDLGVBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLE1BRXZELEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxjQUFNLENBQUMsS0FBSyxJQUFJLE1BQU0sZ0JBQWdCO0FBRXRDLGVBQU8sWUFBWSxNQUFNLFVBQVUsc0JBQXNCO0FBQUEsTUFDMUQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELFdBQVk7QUFFdEUsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLHVCQUF1QixLQUFLLEtBQXFCO0FBQ2hELGVBQU87QUFBQSxVQUNOLFlBQVk7QUFBQSxVQUNaLGFBQWEsQ0FBQztBQUFBLFlBQ2IsT0FBTztBQUFBLFlBQ1AsTUFBTSxtQkFBbUI7QUFBQSxZQUN6QixZQUFZO0FBQUEsWUFDWixPQUFPLHVCQUF1QixLQUFLLEdBQUc7QUFBQSxVQUN2QyxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sU0FBUyxFQUFFO0FBRWpCLFdBQU8sV0FBVyxDQUFDQSxRQUFPLFdBQVc7QUFFcEMsYUFBTyxZQUFZQSxPQUFNLGNBQWMsTUFBTTtBQUU1QyxRQUFBQSxPQUFNLFFBQVEsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzdCLEdBQUcsV0FBUztBQUVYLGVBQU8sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDNUMsaUJBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxpQkFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxRQUV4RCxHQUFHLENBQUFFLFdBQVM7QUFDWCxpQkFBTyxZQUFZQSxPQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGlCQUFPLFlBQVlBLE9BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQ3hELGdCQUFNLENBQUMsS0FBSyxJQUFJQSxPQUFNLGdCQUFnQjtBQUN0QyxpQkFBTyxZQUFZLE1BQU0sV0FBVyxPQUFPLFVBQVU7QUFFckQsaUJBQU8sWUFBWUYsT0FBTSxjQUFjLE1BQU07QUFDNUMsbUJBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxtQkFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxVQUV2RCxHQUFHLENBQUFFLFdBQVM7QUFDWCxtQkFBTyxZQUFZQSxPQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELG1CQUFPLFlBQVlBLE9BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQ3hELGtCQUFNLENBQUNDLE1BQUssSUFBSUQsT0FBTSxnQkFBZ0I7QUFDdEMsbUJBQU8sWUFBWUMsT0FBTSxXQUFXLE9BQU8sVUFBVTtBQUFBLFVBQ3RELENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxXQUFZO0FBRW5GLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUc7QUFBQSxNQUNyRCxtQkFBbUI7QUFBQSxNQUNuQix1QkFBdUIsS0FBSyxLQUFxQjtBQUNoRCxlQUFPO0FBQUEsVUFDTixZQUFZO0FBQUEsVUFDWixhQUFhLENBQUM7QUFBQSxZQUNiLE9BQU87QUFBQSxZQUNQLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsWUFBWTtBQUFBLFlBQ1osT0FBTyxNQUFNLGNBQWMsSUFBSSxLQUFLLFFBQVcsQ0FBQyxHQUFHLEdBQUc7QUFBQSxVQUN2RCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUc7QUFBQSxNQUNyRCxtQkFBbUI7QUFBQSxNQUNuQixtQkFBbUIsQ0FBQyxHQUFHO0FBQUEsTUFDdkIsdUJBQXVCLEtBQUssS0FBcUI7QUFDaEQsZUFBTztBQUFBLFVBQ04sWUFBWTtBQUFBLFVBQ1osYUFBYSxDQUFDO0FBQUEsWUFDYixPQUFPO0FBQUEsWUFDUCxNQUFNLG1CQUFtQjtBQUFBLFlBQ3pCLFlBQVk7QUFBQSxZQUNaLE9BQU8sTUFBTTtBQUFBLGNBQ1osSUFBSSxNQUFNLEdBQUcsSUFBSSxlQUFlLElBQUksVUFBVSxFQUFFLElBQUksU0FBUyxDQUFDLE1BQU0sTUFBTSxJQUFJLEVBQUU7QUFBQSxjQUNoRjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxTQUFTLEVBQUU7QUFFakIsV0FBTyxXQUFXLE9BQU9ILFFBQU8sV0FBVztBQUUxQyxZQUFNLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQzNDLGVBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUFBLE1BRXpELEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxjQUFNLENBQUMsS0FBSyxJQUFJLE1BQU0sZ0JBQWdCO0FBQ3RDLGVBQU8sWUFBWSxNQUFNLFdBQVcsT0FBTyxTQUFTO0FBQUEsTUFFckQsQ0FBQztBQUVELFlBQU0sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDM0MsZUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUV2RCxHQUFHLFdBQVM7QUFFWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sSUFBSTtBQUNsRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFDeEQsY0FBTSxDQUFDLEtBQUssSUFBSSxNQUFNLGdCQUFnQjtBQUN0QyxlQUFPLFlBQVksTUFBTSxXQUFXLE9BQU8sU0FBUztBQUFBLE1BQ3JELENBQUM7QUFFRCxZQUFNLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQUEsTUFHNUMsR0FBRyxXQUFTO0FBRVgsZUFBTyxZQUFZLE1BQU0sZUFBZSxNQUFNLElBQUk7QUFDbEQsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQ3hELGNBQU0sQ0FBQyxPQUFPLE1BQU0sSUFBSSxNQUFNLGdCQUFnQjtBQUM5QyxlQUFPLFlBQVksTUFBTSxXQUFXLE9BQU8sU0FBUztBQUNwRCxlQUFPLFlBQVksT0FBTyxXQUFXLE9BQU8sTUFBTTtBQUFBLE1BQ25ELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZGQUE4RixXQUFZO0FBRTlHLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUcsc0JBQXNCLENBQUM7QUFFN0UsV0FBTyxXQUFXLENBQUNBLFFBQU8sV0FBVztBQUVwQyxhQUFPLFNBQVMsRUFBRyxTQUFTLElBQUk7QUFDaEMsYUFBTyxZQUFZLEVBQUUsWUFBWSxHQUFHLFFBQVEsRUFBRSxDQUFDO0FBRS9DLGFBQU8sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDNUMsUUFBQUEsT0FBTSxRQUFRLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFBQSxNQUM5QixHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sS0FBSztBQUNuRCxlQUFPLFlBQVksTUFBTSxVQUFVLEtBQUs7QUFDeEMsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBRXhELGVBQU8sWUFBWUEsT0FBTSxhQUFhLE1BQU07QUFDM0MsaUJBQU8sUUFBUSxZQUFZLFFBQVEsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsUUFDdkQsR0FBRyxDQUFBRSxXQUFTO0FBQ1gsaUJBQU8sWUFBWUEsT0FBTSxXQUFXLEtBQUs7QUFBQSxRQUMxQyxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2RkFBOEYsV0FBWTtBQUU5RyxnQkFBWSxJQUFJLFNBQVMsU0FBUyxFQUFFLFFBQVEsT0FBTyxHQUFHLHNCQUFzQixDQUFDO0FBRTdFLFdBQU8sV0FBVyxDQUFDRixRQUFPLFdBQVc7QUFFcEMsYUFBTyxTQUFTLEVBQUcsU0FBUyxJQUFJO0FBQ2hDLGFBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUUvQyxhQUFPLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQzVDLFFBQUFBLE9BQU0sUUFBUSxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQUEsTUFDOUIsR0FBRyxXQUFTO0FBQ1gsZUFBTyxZQUFZLE1BQU0sZUFBZSxNQUFNLEtBQUs7QUFDbkQsZUFBTyxZQUFZLE1BQU0sVUFBVSxLQUFLO0FBQ3hDLGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUV4RCxlQUFPLFlBQVlBLE9BQU0sYUFBYSxNQUFNO0FBQzNDLGlCQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLFFBQ3ZELEdBQUcsQ0FBQUUsV0FBUztBQUNYLGlCQUFPLFlBQVlBLE9BQU0sV0FBVyxLQUFLO0FBQUEsUUFDMUMsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUdBQW1HLFdBQVk7QUFFbkgsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLHVCQUF1QixLQUFLLEtBQXFCO0FBQ2hELGVBQU87QUFBQSxVQUNOLFlBQVk7QUFBQSxVQUNaLGFBQWEsQ0FBQztBQUFBLFlBQ2IsT0FBTztBQUFBLFlBQ1AsTUFBTSxtQkFBbUI7QUFBQSxZQUN6QixZQUFZO0FBQUEsWUFDWixPQUFPLE1BQU0sY0FBYyxJQUFJLEtBQUssUUFBVyxDQUFDLEdBQUcsR0FBRztBQUFBLFVBQ3ZELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTyxXQUFXLENBQUNGLFFBQU8sV0FBVztBQUVwQyxhQUFPLFNBQVMsRUFBRyxTQUFTLEtBQUs7QUFDakMsYUFBTyxZQUFZLEVBQUUsWUFBWSxHQUFHLFFBQVEsRUFBRSxDQUFDO0FBRS9DLGFBQU8sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDNUMsUUFBQUEsT0FBTSxRQUFRLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFBQSxNQUM5QixHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sS0FBSztBQUNuRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0Isc0JBQXNCLEVBQUUsTUFBTSxDQUFDO0FBQ3hFLGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUV4RCxlQUFPLFlBQVlBLE9BQU0sYUFBYSxNQUFNO0FBQzNDLGlCQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLFFBQ3ZELEdBQUcsQ0FBQUUsV0FBUztBQUNYLGlCQUFPLFlBQVlBLE9BQU0sV0FBVyxLQUFLO0FBQUEsUUFDMUMsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUdBQW1HLFdBQVk7QUFFbkgsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLHVCQUF1QixLQUFLLEtBQXFCO0FBQ2hELGVBQU87QUFBQSxVQUNOLFlBQVk7QUFBQSxVQUNaLGFBQWEsQ0FBQztBQUFBLFlBQ2IsT0FBTztBQUFBLFlBQ1AsTUFBTSxtQkFBbUI7QUFBQSxZQUN6QixZQUFZO0FBQUEsWUFDWixPQUFPLE1BQU0sY0FBYyxJQUFJLEtBQUssUUFBVyxDQUFDLEdBQUcsR0FBRztBQUFBLFVBQ3ZELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTyxXQUFXLENBQUNGLFFBQU8sV0FBVztBQUVwQyxhQUFPLFNBQVMsRUFBRyxTQUFTLEtBQUs7QUFDakMsYUFBTyxZQUFZLEVBQUUsWUFBWSxHQUFHLFFBQVEsRUFBRSxDQUFDO0FBRS9DLGFBQU8sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDNUMsUUFBQUEsT0FBTSxRQUFRLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFBQSxNQUM5QixHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sS0FBSztBQUNuRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0Isc0JBQXNCLEVBQUUsTUFBTSxDQUFDO0FBQ3hFLGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUV4RCxlQUFPLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBSTVDLGlCQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLFFBQ3ZELEdBQUcsQ0FBQUUsV0FBUztBQUNYLGlCQUFPLFlBQVlBLE9BQU0sZUFBZSxNQUFNLEtBQUs7QUFDbkQsaUJBQU8sWUFBWUEsT0FBTSxnQkFBZ0Isc0JBQXNCLEVBQUUsTUFBTSxDQUFDO0FBQ3hFLGlCQUFPLFlBQVlBLE9BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQUEsUUFFekQsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0RBQW9ELFdBQVk7QUFDcEUsUUFBSSxtQkFBbUI7QUFDdkIsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLG1CQUFtQixDQUFDLEdBQUc7QUFBQSxNQUN2Qix1QkFBdUIsS0FBSyxLQUFLLFNBQXlCO0FBQ3pELGVBQU8sWUFBWSxRQUFRLGFBQWEsc0JBQXNCLGdCQUFnQjtBQUM5RSwyQkFBbUIsUUFBUTtBQUMzQixlQUFPO0FBQUEsVUFDTixZQUFZO0FBQUEsVUFDWixhQUFhO0FBQUEsWUFDWjtBQUFBLGNBQ0MsT0FBTztBQUFBLGNBQ1AsTUFBTSxtQkFBbUI7QUFBQSxjQUN6QixZQUFZO0FBQUEsY0FDWixPQUFPLE1BQU0sY0FBYyxJQUFJLEtBQUssUUFBVyxDQUFDLEdBQUcsR0FBRztBQUFBLFlBQ3ZEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFNBQVMsRUFBRTtBQUVqQixXQUFPLFdBQVcsQ0FBQ0YsUUFBTyxXQUFXO0FBRXBDLGFBQU8sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDNUMsZUFBTyxZQUFZLEVBQUUsWUFBWSxHQUFHLFFBQVEsRUFBRSxDQUFDO0FBQy9DLGVBQU8sUUFBUSxZQUFZLFFBQVEsTUFBTSxFQUFFLE1BQU0sT0FBTyxDQUFDO0FBQUEsTUFDMUQsR0FBRyxXQUFTO0FBQ1gsZUFBTyxZQUFZLGtCQUFrQixHQUFHO0FBQUEsTUFDekMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUZBQXFGLFdBQVk7QUFDckcsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLHVCQUF1QixLQUFLLEtBQXFCO0FBQ2hELGVBQU87QUFBQSxVQUNOLFlBQVk7QUFBQSxVQUNaLGFBQWEsQ0FBQztBQUFBLFlBQ2IsT0FBTztBQUFBLFlBQ1AsTUFBTSxtQkFBbUI7QUFBQSxZQUN6QixZQUFZO0FBQUEsWUFDWixPQUFPLE1BQU0sY0FBYyxJQUFJLEtBQUssUUFBVyxDQUFDLEdBQUcsR0FBRztBQUFBLFVBQ3ZELEdBQUc7QUFBQSxZQUNGLE9BQU87QUFBQSxZQUNQLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsWUFBWTtBQUFBLFlBQ1osT0FBTyxNQUFNLGNBQWMsSUFBSSxLQUFLLFFBQVcsQ0FBQyxHQUFHLEdBQUc7QUFBQSxVQUN2RCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sU0FBUyxFQUFFO0FBQ2pCLFdBQU8sV0FBVyxDQUFDQSxRQUFPLFdBQVc7QUFFcEMsYUFBTyxZQUFZQSxPQUFNLGNBQWMsTUFBTTtBQUM1QyxlQUFPLFlBQVksRUFBRSxZQUFZLEdBQUcsUUFBUSxFQUFFLENBQUM7QUFDL0MsZUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUN2RCxHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFDeEQsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sQ0FBQyxFQUFFLFdBQVcsT0FBTyxLQUFLO0FBRXpFLGVBQU8sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDNUMsaUJBQU8sYUFBYSxRQUFRLENBQUMsY0FBYyxRQUFRLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBRyxDQUFDLENBQUM7QUFBQSxRQUVoRixHQUFHLENBQUFFLFdBQVM7QUFFWCxpQkFBTyxZQUFZQSxPQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxpQkFBTyxZQUFZQSxPQUFNLGdCQUFnQixNQUFNLENBQUMsRUFBRSxXQUFXLE9BQU8sUUFBSztBQUFBLFFBRTFFLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhEQUE4RCxXQUFZO0FBQzlFLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUcsc0JBQXNCLENBQUM7QUFFN0UsV0FBTyxXQUFXLE9BQU9GLFFBQU8sV0FBVztBQUMxQyxZQUFNLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQzNDLGVBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLE1BRXZELEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxjQUFNLENBQUMsS0FBSyxJQUFJLE1BQU0sZ0JBQWdCO0FBRXRDLGVBQU8sWUFBWSxNQUFNLFVBQVUsc0JBQXNCO0FBQUEsTUFDMUQsQ0FBQztBQUVELFlBQU0sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDM0MsZUFBTyxXQUFXLG9CQUFvQixZQUFZLElBQUk7QUFBQSxNQUV2RCxHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sSUFBSTtBQUNsRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFDeEQsY0FBTSxDQUFDLEtBQUssSUFBSSxNQUFNLGdCQUFnQjtBQUV0QyxlQUFPLFlBQVksTUFBTSxVQUFVLHNCQUFzQjtBQUFBLE1BQzFELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdGQUFnRixXQUFZO0FBQ2hHLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUc7QUFBQSxNQUNyRCxtQkFBbUI7QUFBQSxNQUNuQix1QkFBdUIsS0FBSyxLQUFxQjtBQUNoRCxlQUFPO0FBQUEsVUFDTixZQUFZO0FBQUEsVUFDWixhQUFhLENBQUM7QUFBQSxZQUNiLE9BQU87QUFBQSxZQUNQLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsWUFBWTtBQUFBLFlBQ1osT0FBTyxNQUFNLGNBQWMsSUFBSSxNQUFNLEdBQUcsRUFBRSxHQUFHLEdBQUc7QUFBQSxZQUNoRCxxQkFBcUIsQ0FBQztBQUFBLGNBQ3JCLE1BQU07QUFBQSxjQUNOLE9BQU8sRUFBRSxpQkFBaUIsR0FBRyxlQUFlLEdBQUcsYUFBYSxJQUFJLFdBQVcsR0FBRztBQUFBLFlBQy9FLENBQUM7QUFBQSxVQUNGLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxTQUFTLCtCQUErQjtBQUU5QyxXQUFPLFdBQVcsT0FBTyxRQUFRLFdBQVc7QUFBQSxNQUMzQyxNQUFNLGlCQUFpQixrQkFBa0I7QUFBQSxRQUN4QyxnQ0FBZ0MsTUFBMkIsUUFBZ0IsR0FBRztBQUM3RSxnQkFBTSxrQkFBa0IsTUFBTSxLQUFLO0FBQUEsUUFDcEM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxPQUFpQixPQUFPLG1DQUFtQyxTQUFTLElBQUksUUFBUTtBQUN0RixhQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFFbkYsWUFBTSxZQUFZLE9BQU8sY0FBYyxNQUFNO0FBQzVDLGVBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxlQUFPLFFBQVEsRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUFBLE1BQy9CLEdBQUcsV0FBUztBQUVYLGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxjQUFNLENBQUMsS0FBSyxJQUFJLE1BQU0sZ0JBQWdCO0FBQ3RDLGVBQU8sWUFBWSxNQUFNLFdBQVcsT0FBTyxLQUFLO0FBRWhELGFBQUssZ0NBQWdDLEVBQUUsTUFBTSxPQUFPLE9BQU8sR0FBRyxPQUFPLE1BQU0sZ0JBQWdCLENBQUM7QUFBQSxNQUM3RixDQUFDO0FBRUQsYUFBTztBQUFBLFFBQ04sTUFBTSxTQUFTO0FBQUEsUUFDZjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDRGQUE0RixXQUFZO0FBRTVHLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUcsc0JBQXNCLENBQUM7QUFFN0UsV0FBTyxXQUFXLENBQUNBLFFBQU8sV0FBVztBQUNwQyxhQUFPLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQzVDLGVBQU8sU0FBUyxHQUFHO0FBQ25CLGVBQU8sYUFBYSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQzdDLGVBQU8sUUFBUSxZQUFZLFFBQVEsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFFdkQsR0FBRyxXQUFTO0FBQ1gsZUFBTyxZQUFZLE1BQU0sZUFBZSxNQUFNLElBQUk7QUFDbEQsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQ3hELGNBQU0sQ0FBQyxLQUFLLElBQUksTUFBTSxnQkFBZ0I7QUFFdEMsZUFBTyxZQUFZLE1BQU0sVUFBVSxzQkFBc0I7QUFBQSxNQUMxRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBR0QsT0FBSyw2Q0FBNkMsV0FBWTtBQUU3RCxRQUFJLFdBQVc7QUFDZixRQUFJLFdBQVc7QUFFZixnQkFBWSxJQUFJLFNBQVMsU0FBUyxFQUFFLFFBQVEsT0FBTyxHQUFHO0FBQUEsTUFDckQsbUJBQW1CO0FBQUEsTUFDbkIsdUJBQXVCLEtBQUssS0FBSztBQUNoQyxlQUFPO0FBQUEsVUFDTixZQUFZO0FBQUEsVUFDWixhQUFhLENBQUM7QUFBQSxZQUNiLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsT0FBTztBQUFBLFlBQ1AsWUFBWTtBQUFBLFlBQ1osVUFBVTtBQUFBLFlBQ1YsT0FBTyx1QkFBdUIsS0FBSyxHQUFHO0FBQUEsVUFDdkMsQ0FBQztBQUFBLFVBQ0QsVUFBVTtBQUFFLHdCQUFZO0FBQUEsVUFBRztBQUFBLFFBQzVCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLHVCQUF1QixLQUFLLEtBQUs7QUFDaEMsZUFBTztBQUFBLFVBQ04sWUFBWTtBQUFBLFVBQ1osYUFBYSxDQUFDO0FBQUEsWUFDYixNQUFNLG1CQUFtQjtBQUFBLFlBQ3pCLE9BQU87QUFBQSxZQUNQLFlBQVk7QUFBQSxZQUNaLFVBQVU7QUFBQSxZQUNWLE9BQU8sdUJBQXVCLEtBQUssR0FBRztBQUFBLFVBQ3ZDLENBQUM7QUFBQSxVQUNELFVBQVU7QUFBRSx3QkFBWTtBQUFBLFVBQUc7QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLHNCQUFzQixNQUFNO0FBQzNCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixXQUFPLFdBQVcsT0FBT0EsUUFBTyxXQUFXO0FBRTFDLFlBQU0sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDM0MsZUFBTyxTQUFTLEVBQUU7QUFDbEIsZUFBTyxhQUFhLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDN0MsZUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUV2RCxHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sSUFBSTtBQUNsRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFDeEQsZUFBTyxZQUFZLFVBQVUsQ0FBQztBQUM5QixlQUFPLFlBQVksVUFBVSxDQUFDO0FBQUEsTUFDL0IsQ0FBQztBQUVELFlBQU0sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDM0MsZUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUN2RCxHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sSUFBSTtBQUNsRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFHeEQsUUFBQUEsT0FBTSxNQUFNO0FBQ1osZUFBTyxZQUFZLFVBQVUsQ0FBQztBQUM5QixlQUFPLFlBQVksVUFBVSxDQUFDO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBRUYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUdELE9BQUssc0ZBQXNGLFdBQVk7QUFFdEcsUUFBSSxTQUFTO0FBQ2IsUUFBSSxTQUFTO0FBRWIsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLHVCQUF1QixLQUFLLEtBQUs7QUFDaEMsa0JBQVU7QUFDVixlQUFPO0FBQUEsVUFDTixZQUFZO0FBQUE7QUFBQSxVQUNaLGFBQWEsQ0FBQztBQUFBLFlBQ2IsTUFBTSxtQkFBbUI7QUFBQSxZQUN6QixPQUFPO0FBQUEsWUFDUCxZQUFZO0FBQUEsWUFDWixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsSUFBSSxZQUFZLElBQUksTUFBTTtBQUFBLFVBQ2xELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLHVCQUF1QixLQUFLLEtBQUs7QUFDaEMsa0JBQVU7QUFDVixZQUFJLENBQUMsSUFBSSxxQkFBcUIsR0FBRyxFQUFFLEtBQUssV0FBVyxHQUFHLEdBQUc7QUFDeEQ7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLFVBQ04sWUFBWTtBQUFBLFVBQ1osYUFBYSxDQUFDO0FBQUEsWUFDYixNQUFNLG1CQUFtQjtBQUFBLFlBQ3pCLE9BQU87QUFBQSxZQUNQLFlBQVk7QUFBQSxZQUNaLE9BQU8sdUJBQXVCLEtBQUssR0FBRztBQUFBLFVBQ3ZDLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTyxXQUFXLE9BQU9BLFFBQU8sV0FBVztBQUUxQyxZQUFNLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQzNDLGVBQU8sU0FBUyxFQUFFO0FBQ2xCLGVBQU8sYUFBYSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQzdDLGVBQU8sUUFBUSxZQUFZLFFBQVEsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFFdkQsR0FBRyxXQUFTO0FBQ1gsZUFBTyxZQUFZLE1BQU0sZUFBZSxNQUFNLElBQUk7QUFDbEQsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQ3hELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLENBQUMsRUFBRSxXQUFXLE9BQU87QUFBQSxNQUNyRSxDQUFDO0FBRUQsWUFBTSxZQUFZQSxPQUFNLGNBQWMsTUFBTTtBQUczQyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQ3hELEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxDQUFDLEVBQUUsV0FBVyxPQUFPO0FBQ3BFLGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLENBQUMsRUFBRSxXQUFXLEtBQUs7QUFFbEUsZUFBTyxZQUFZLFFBQVEsQ0FBQztBQUM1QixlQUFPLFlBQVksUUFBUSxDQUFDO0FBQUEsTUFDN0IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUhBQXFILGlCQUFrQjtBQUUzSSxnQkFBWSxJQUFJLFNBQVMsU0FBUyxFQUFFLFFBQVEsT0FBTyxHQUFHO0FBQUEsTUFDckQsbUJBQW1CO0FBQUEsTUFDbkIsdUJBQXVCLEtBQUssS0FBSztBQUNoQyxlQUFPO0FBQUEsVUFDTixhQUFhLENBQUM7QUFBQSxZQUNiLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsT0FBTztBQUFBLFlBQ1AsWUFBWTtBQUFBLFlBQ1osT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLElBQUksUUFBUSxJQUFJLFlBQVksSUFBSSxNQUFNO0FBQUEsVUFDeEUsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLFNBQVMsU0FBUyxFQUFFLFFBQVEsT0FBTyxHQUFHO0FBQUEsTUFDckQsbUJBQW1CO0FBQUEsTUFDbkIsbUJBQW1CLENBQUMsS0FBSyxHQUFHO0FBQUEsTUFDNUIsdUJBQXVCLEtBQUssS0FBSztBQUNoQyxlQUFPO0FBQUEsVUFDTixhQUFhLENBQUM7QUFBQSxZQUNiLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsT0FBTztBQUFBLFlBQ1AsWUFBWTtBQUFBLFlBQ1osT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLElBQUksUUFBUSxJQUFJLFlBQVksSUFBSSxNQUFNO0FBQUEsVUFDeEUsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixXQUFPLFdBQVcsT0FBT0EsUUFBTyxXQUFXO0FBRTFDLFlBQU0sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDM0MsZUFBTyxTQUFTLEVBQUU7QUFDbEIsZUFBTyxhQUFhLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDN0MsZUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUV2RCxHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sSUFBSTtBQUNsRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFBQSxNQUN6RCxDQUFDO0FBR0QsYUFBTyxTQUFTLEVBQUUsU0FBUyxFQUFFO0FBRTdCLFlBQU0sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDM0MsZUFBTyxTQUFTLEVBQUU7QUFDbEIsZUFBTyxhQUFhLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDN0MsZUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUV2RCxHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sSUFBSTtBQUNsRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFBQSxNQUN6RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsaUJBQWtCO0FBQzVELGdCQUFZLElBQUksU0FBUyxTQUFTLEtBQUs7QUFBQTtBQUFBLE1BRXRDLG1CQUFtQjtBQUFBLE1BQ25CLHVCQUF1QixLQUFLLEtBQUs7QUFDaEMsY0FBTSxPQUFPLElBQUkscUJBQXFCLEdBQUc7QUFDekMsZUFBTztBQUFBLFVBQ04sYUFBYSxDQUFDO0FBQUEsWUFDYixNQUFNLG1CQUFtQjtBQUFBLFlBQ3pCLE9BQU87QUFBQSxZQUNQLFlBQVk7QUFBQSxZQUNaLE9BQU8sSUFBSSxNQUFNLElBQUksWUFBWSxLQUFLLGFBQWEsSUFBSSxZQUFZLEtBQUssU0FBUztBQUFBLFVBQ2xGLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBO0FBQUEsTUFFckQsbUJBQW1CO0FBQUEsTUFDbkIsdUJBQXVCLEtBQUssS0FBSztBQUNoQyxlQUFPO0FBQUEsVUFDTixhQUFhLENBQUM7QUFBQSxZQUNiLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsT0FBTztBQUFBLFlBQ1AsWUFBWTtBQUFBLFlBQ1osT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLEdBQUcsSUFBSSxZQUFZLElBQUksTUFBTTtBQUFBLFVBQy9ELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTyxXQUFXLGVBQWdCQSxRQUFPLFFBQVE7QUFFaEQsWUFBTSxZQUFZQSxPQUFNLGNBQWMsTUFBTTtBQUMzQyxlQUFPLFNBQVMsSUFBSTtBQUNwQixlQUFPLGFBQWEsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUM3QyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLE1BRXZELEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxDQUFDLEVBQUUsV0FBVyxVQUFVO0FBQUEsTUFDeEUsQ0FBQztBQUVELGFBQU8sUUFBUSxZQUFZLFFBQVEsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBRXRELFlBQU0sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDM0MsZUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUV2RCxHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sSUFBSTtBQUNsRCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFDeEQsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sQ0FBQyxFQUFFLFdBQVcsVUFBVTtBQUFBLE1BQ3hFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBGQUEwRixXQUFZO0FBRTFHLFVBQU0sZ0JBQWdCLENBQUMsR0FBRyxDQUFDO0FBRTNCLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUc7QUFBQSxNQUNyRCxtQkFBbUI7QUFBQSxNQUVuQix1QkFBdUIsS0FBSyxLQUFLO0FBQ2hDLHNCQUFjLENBQUMsS0FBSztBQUNwQixlQUFPO0FBQUEsVUFDTixhQUFhLENBQUM7QUFBQSxZQUNiLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsT0FBTztBQUFBLFlBQ1AsWUFBWTtBQUFBLFlBQ1osT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLEdBQUcsSUFBSSxZQUFZLElBQUksTUFBTTtBQUFBLFVBQy9ELEdBQUc7QUFBQSxZQUNGLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsT0FBTztBQUFBLFlBQ1AsWUFBWTtBQUFBLFlBQ1osT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLEdBQUcsSUFBSSxZQUFZLElBQUksTUFBTTtBQUFBLFVBQy9ELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLG1CQUFtQixDQUFDLEdBQUc7QUFBQSxNQUN2Qix1QkFBdUIsS0FBSyxLQUFLLEtBQUs7QUFDckMsc0JBQWMsQ0FBQyxLQUFLO0FBQ3BCLFlBQUksSUFBSSxnQkFBZ0Isc0JBQXNCLGtCQUFrQjtBQUMvRDtBQUFBLFFBQ0Q7QUFDQSxlQUFPO0FBQUEsVUFDTixhQUFhLENBQUM7QUFBQSxZQUNiLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsT0FBTztBQUFBLFlBQ1AsWUFBWTtBQUFBLFlBQ1osT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLEdBQUcsSUFBSSxZQUFZLElBQUksTUFBTTtBQUFBLFVBQy9ELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTyxXQUFXLGVBQWdCQSxRQUFPLFFBQVE7QUFFaEQsWUFBTSxZQUFZQSxPQUFNLGNBQWMsTUFBTTtBQUMzQyxlQUFPLFNBQVMsS0FBSztBQUNyQixlQUFPLGFBQWEsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUM3QyxRQUFBQSxPQUFNLFFBQVEsRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUFBLE1BRTlCLEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxLQUFLO0FBQ25ELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxDQUFDLEVBQUUsV0FBVyxRQUFRO0FBQ3JFLGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLENBQUMsRUFBRSxXQUFXLFdBQVc7QUFBQSxNQUN6RSxDQUFDO0FBRUQsYUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFHdEQsWUFBTSxZQUFZQSxPQUFNLGNBQWMsTUFBTTtBQUMzQyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLE1BRXZELEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUN4RCxlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxDQUFDLEVBQUUsV0FBVyxRQUFRO0FBQ3JFLGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLENBQUMsRUFBRSxXQUFXLFNBQVM7QUFDdEUsZUFBTyxnQkFBZ0IsZUFBZSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDN0MsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUNBQXVDLFdBQVk7QUFFdkQsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLG1CQUFtQixDQUFDLEdBQUc7QUFBQSxNQUN2Qix1QkFBdUIsS0FBSyxLQUFLLEtBQUs7QUFDckMsZUFBTztBQUFBLFVBQ04sYUFBYSxDQUFDO0FBQUEsWUFDYixPQUFPLElBQUkscUJBQXFCLEdBQUcsRUFBRSxRQUFRO0FBQUEsWUFDN0MsTUFBTSxtQkFBbUI7QUFBQSxZQUN6QixZQUFZO0FBQUEsWUFDWixPQUFPLHVCQUF1QixLQUFLLEdBQUc7QUFBQSxVQUN2QyxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFdBQU8sV0FBVyxlQUFnQkEsUUFBTyxRQUFRO0FBRWhELFlBQU0sWUFBWUEsT0FBTSxjQUFjLE1BQU07QUFDM0MsZUFBTyxTQUFTLEtBQUs7QUFDckIsZUFBTyxhQUFhLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDN0MsZUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUd2RCxHQUFHLFdBQVM7QUFDWCxlQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sSUFBSTtBQUNsRCxlQUFPLFlBQVksTUFBTSxlQUFlLGtCQUFrQixNQUFTO0FBQ25FLGVBQU8sWUFBWSxNQUFNLGVBQWUsYUFBYSxNQUFTO0FBQzlELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQ3pELENBQUM7QUFFRCxZQUFNLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQzNDLGVBQU8sUUFBUSxZQUFZLFFBQVEsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFFdkQsR0FBRyxXQUFTO0FBQ1gsZUFBTyxZQUFZLE1BQU0sZUFBZSxNQUFNLElBQUk7QUFDbEQsZUFBTyxZQUFZLE1BQU0sZUFBZSxVQUFVLE1BQVM7QUFDM0QsZUFBTyxZQUFZLE1BQU0sZUFBZSxrQkFBa0IsR0FBRztBQUM3RCxlQUFPLFlBQVksTUFBTSxlQUFlLGFBQWEsc0JBQXNCLGdCQUFnQjtBQUMzRixlQUFPLFlBQVksTUFBTSxnQkFBZ0IsTUFBTSxRQUFRLENBQUM7QUFBQSxNQUN6RCxDQUFDO0FBRUQsWUFBTSxZQUFZQSxPQUFNLGNBQWMsTUFBTTtBQUMzQyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLE1BRXZELEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGVBQU8sWUFBWSxNQUFNLGVBQWUsVUFBVSxJQUFJO0FBQ3RELGVBQU8sWUFBWSxNQUFNLGVBQWUsa0JBQWtCLEdBQUc7QUFDN0QsZUFBTyxZQUFZLE1BQU0sZUFBZSxhQUFhLHNCQUFzQixnQkFBZ0I7QUFDM0YsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQUEsTUFDekQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkNBQTJDLFdBQVk7QUFFM0QsVUFBTSxrQkFBMEM7QUFBQSxNQUMvQyxtQkFBbUI7QUFBQSxNQUNuQix1QkFBdUIsS0FBSyxLQUFLLEtBQUs7QUFDckMsZUFBTztBQUFBLFVBQ04sYUFBYSxDQUFDO0FBQUEsWUFDYixPQUFPO0FBQUEsWUFDUCxNQUFNLG1CQUFtQjtBQUFBLFlBQ3pCLFlBQVk7QUFBQSxZQUNaLE9BQU8sdUJBQXVCLEtBQUssR0FBRztBQUFBLFVBQ3ZDLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxVQUFNLE1BQU0seUJBQXlCLGVBQWU7QUFFcEQsZ0JBQVksSUFBSSxhQUFhLE1BQU07QUFDbEMsVUFBSSx5QkFBeUIsTUFBTSxpQkFBaUI7QUFDbkQsaUNBQXlCLEdBQUc7QUFBQSxNQUM3QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3JELG1CQUFtQjtBQUFBLE1BQ25CLG1CQUFtQixDQUFDLEdBQUc7QUFBQSxNQUN2Qix1QkFBdUIsS0FBSyxLQUFLLEtBQUs7QUFDckMsZUFBTztBQUFBLFVBQ04sYUFBYSxDQUFDO0FBQUEsWUFDYixPQUFPO0FBQUEsWUFDUCxNQUFNLG1CQUFtQjtBQUFBLFlBQ3pCLFlBQVk7QUFBQSxZQUNaLE9BQU8sdUJBQXVCLEtBQUssR0FBRztBQUFBLFVBQ3ZDLENBQUM7QUFBQSxVQUNELFlBQVk7QUFBQSxRQUNiO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTyxXQUFXLGVBQWdCQSxRQUFPLFFBQVE7QUFFaEQsWUFBTSxZQUFZQSxPQUFNLGNBQWMsTUFBTTtBQUMzQyxlQUFPLFNBQVMsRUFBRTtBQUNsQixlQUFPLGFBQWEsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUM3QyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLE1BR3ZELEdBQUcsV0FBUztBQUNYLGVBQU8sWUFBWSxNQUFNLGVBQWUsTUFBTSxJQUFJO0FBQ2xELGVBQU8sWUFBWSxNQUFNLGVBQWUsa0JBQWtCLE1BQVM7QUFDbkUsZUFBTyxZQUFZLE1BQU0sZUFBZSxhQUFhLE1BQVM7QUFDOUQsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQ3hELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLENBQUMsRUFBRSxXQUFXLFFBQVE7QUFDckUsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sQ0FBQyxFQUFFLFdBQVcsS0FBSztBQUFBLE1BQ25FLENBQUM7QUFFRCxZQUFNLFlBQVlBLE9BQU0sY0FBYyxNQUFNO0FBQzNDLGVBQU8sUUFBUSxZQUFZLFFBQVEsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFFdkQsR0FBRyxXQUFTO0FBQ1gsZUFBTyxZQUFZLE1BQU0sZUFBZSxhQUFhLHNCQUFzQiwrQkFBK0I7QUFDMUcsZUFBTyxZQUFZLE1BQU0sZUFBZSxNQUFNLElBQUk7QUFDbEQsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQ3hELGVBQU8sWUFBWSxNQUFNLGdCQUFnQixNQUFNLENBQUMsRUFBRSxXQUFXLFFBQVE7QUFDckUsZUFBTyxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sQ0FBQyxFQUFFLFdBQVcsS0FBSztBQUFBLE1BQ25FLENBQUM7QUFBQSxJQUVGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhGQUE4RixXQUFZO0FBRTlHLGdCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUcsc0JBQXNCLENBQUM7QUFHN0UsVUFBTSxpQkFBNEM7QUFBQSxNQUNqRCwwQkFBMEIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDN0MsMEJBQTBCLE1BQU07QUFBQSxNQUFFO0FBQUEsSUFDbkM7QUFDQSxnQkFBWSxJQUFJLHdCQUF3QiwwQkFBMEIsU0FBUyxFQUFFLFFBQVEsT0FBTyxHQUFHLGNBQWMsQ0FBQztBQUU5RyxXQUFPLFdBQVcsQ0FBQyxlQUFlLFdBQVc7QUFDNUMsYUFBTyxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxPQUFPLFNBQVMsT0FBTyxPQUFPLDJCQUEyQixFQUFFLENBQUM7QUFHakgsYUFBTyxZQUFZLGNBQWMsY0FBYyxNQUFNO0FBQ3BELGVBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLE1BQ3ZELEdBQUcsa0JBQWdCO0FBQ2xCLGVBQU8sWUFBWSxhQUFhLGVBQWUsTUFBTSxJQUFJO0FBQUEsTUFDMUQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0ZBQWtGLFdBQVk7QUFFbEcsZ0JBQVksSUFBSSxTQUFTLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRyxzQkFBc0IsQ0FBQztBQUk3RSxXQUFPLFdBQVcsQ0FBQyxlQUFlLFdBQVc7QUFDNUMsYUFBTyxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxPQUFPLFNBQVMsT0FBTyxPQUFPLDJCQUEyQixFQUFFLENBQUM7QUFFakgsYUFBTyxZQUFZLGNBQWMsY0FBYyxNQUFNO0FBQ3BELGVBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxlQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLE1BQ3ZELEdBQUcsa0JBQWdCO0FBQ2xCLGVBQU8sWUFBWSxhQUFhLGVBQWUsTUFBTSxJQUFJO0FBQ3pELGVBQU8sWUFBWSxhQUFhLGdCQUFnQixNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQ2hFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtGQUFrRixXQUFZO0FBQ2xHLFdBQU8sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsTUFBTTtBQUN4RCxrQkFBWSxJQUFJLFNBQVMsU0FBUyxFQUFFLFFBQVEsT0FBTyxHQUFHLHNCQUFzQixDQUFDO0FBRzdFLFlBQU0saUJBQTRDO0FBQUEsUUFDakQsMEJBQTBCLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRTtBQUFBLFFBQzdDLDBCQUEwQixNQUFNO0FBQUEsUUFBRTtBQUFBLE1BQ25DO0FBQ0Esa0JBQVksSUFBSSx3QkFBd0IsMEJBQTBCLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRyxjQUFjLENBQUM7QUFFOUcsYUFBTyxXQUFXLENBQUMsZUFBZSxXQUFXO0FBQzVDLGVBQU8sY0FBYztBQUFBLFVBQ3BCLGtCQUFrQixFQUFFLFVBQVUsT0FBTyxTQUFTLE9BQU8sT0FBTywyQkFBMkI7QUFBQSxVQUN2RixlQUFlLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFDakMsQ0FBQztBQUVELGVBQU8sWUFBWSxjQUFjLGNBQWMsTUFBTTtBQUNwRCxpQkFBTyxZQUFZLEVBQUUsWUFBWSxHQUFHLFFBQVEsRUFBRSxDQUFDO0FBQy9DLGlCQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLFFBQ3ZELEdBQUcsa0JBQWdCO0FBQ2xCLGlCQUFPLFlBQVksYUFBYSxlQUFlLE1BQU0sSUFBSTtBQUN6RCxpQkFBTyxZQUFZLGFBQWEsZ0JBQWdCLE1BQU0sUUFBUSxDQUFDO0FBQUEsUUFDaEUsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkVBQTJFLFdBQVk7QUFDM0YsV0FBTyxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxNQUFNO0FBRXhELGtCQUFZLElBQUksU0FBUyxTQUFTLEVBQUUsUUFBUSxPQUFPLEdBQUcsc0JBQXNCLENBQUM7QUFFN0UsYUFBTyxXQUFXLENBQUMsZUFBZSxXQUFXO0FBRTVDLGVBQU8sY0FBYyxFQUFFLGtCQUFrQixNQUFNLENBQUM7QUFFaEQsZUFBTyxJQUFJLFFBQWMsQ0FBQyxTQUFTLFdBQVc7QUFDN0MsZ0JBQU0sTUFBTSxjQUFjLGFBQWEsTUFBTTtBQUM1QyxnQkFBSSxRQUFRO0FBQ1osbUJBQU8sSUFBSSxNQUFNLHlFQUF5RSxDQUFDO0FBQUEsVUFDNUYsQ0FBQztBQUVELGlCQUFPLFlBQVksRUFBRSxZQUFZLEdBQUcsUUFBUSxFQUFFLENBQUM7QUFDL0MsaUJBQU8sUUFBUSxZQUFZLFFBQVEsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBRXRELHFCQUFXLE1BQU07QUFDaEIsZ0JBQUksUUFBUTtBQUNaLG9CQUFRO0FBQUEsVUFDVCxHQUFHLEdBQUc7QUFBQSxRQUNQLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlHQUF5RyxXQUFZO0FBQ3pILFdBQU8sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsTUFBTTtBQUN4RCxrQkFBWSxJQUFJLFNBQVMsU0FBUyxFQUFFLFFBQVEsT0FBTyxHQUFHLHNCQUFzQixDQUFDO0FBRTdFLFlBQU0saUJBQTRDO0FBQUEsUUFDakQsMEJBQTBCLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRTtBQUFBLFFBQzdDLDBCQUEwQixNQUFNO0FBQUEsUUFBRTtBQUFBLE1BQ25DO0FBQ0Esa0JBQVksSUFBSSx3QkFBd0IsMEJBQTBCLFNBQVMsRUFBRSxRQUFRLE9BQU8sR0FBRyxjQUFjLENBQUM7QUFFOUcsYUFBTyxXQUFXLENBQUMsZUFBZSxXQUFXO0FBRTVDLGVBQU8sY0FBYyxFQUFFLGtCQUFrQiwyQkFBMkIsQ0FBQztBQUdyRSxlQUFPLFlBQVksY0FBYyxjQUFjLE1BQU07QUFDcEQsaUJBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxpQkFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxRQUN2RCxHQUFHLGtCQUFnQjtBQUNsQixpQkFBTyxZQUFZLGFBQWEsZUFBZSxNQUFNLElBQUk7QUFBQSxRQUMxRCxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sNEVBQTRFLFdBQVk7QUFFN0YsMENBQXdDO0FBRXhDLFFBQU0scUJBQTZDO0FBQUEsSUFDbEQsbUJBQW1CO0FBQUEsSUFDbkIsdUJBQXVCLEtBQUssS0FBcUI7QUFDaEQsWUFBTSxZQUFZLElBQUkscUJBQXFCLEdBQUc7QUFDOUMsYUFBTztBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osYUFBYSxDQUFDO0FBQUEsVUFDYixPQUFPLElBQUkscUJBQXFCLEdBQUcsRUFBRTtBQUFBLFVBQ3JDLE1BQU0sbUJBQW1CO0FBQUEsVUFDekIsWUFBWTtBQUFBLFVBQ1osT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLFVBQVUsYUFBYSxJQUFJLFlBQVksVUFBVSxTQUFTO0FBQUEsUUFDNUYsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLGlCQUFlLHFDQUNkLE1BQ0EsZ0JBQ0EsVUFDZ0I7QUFDaEIsVUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBQzdELFlBQU0sa0JBQWtCLElBQUksZ0JBQWdCO0FBQzVDLFVBQUk7QUFDSCxjQUFNLDBCQUEwQixJQUFJLHdCQUF3QjtBQUM1RCx3QkFBZ0IsSUFBSSx3QkFBd0IsbUJBQW1CLFNBQVMsRUFBRSxTQUFTLEtBQUssR0FBRyxrQkFBa0IsQ0FBQztBQUM5Ryx3QkFBZ0IsSUFBSSx3QkFBd0IsMEJBQTBCLFNBQVMsRUFBRSxTQUFTLEtBQUssR0FBRyxjQUFjLENBQUM7QUFFakgsY0FBTSxvQkFBb0IsSUFBSTtBQUFBLFVBQzdCLENBQUMsMEJBQTBCLHVCQUF1QjtBQUFBLFVBQ2xELENBQUMsbUJBQW1CLG9CQUFvQjtBQUFBLFVBQ3hDLENBQUMsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUFBLFVBQ2xDLENBQUMsaUJBQWlCLGdCQUFnQixJQUFJLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUFBLFVBQ25FLENBQUMsb0JBQW9CLElBQUksc0JBQXNCLENBQUM7QUFBQSxVQUNoRCxDQUFDLHNCQUFzQixJQUFJLGNBQWMsS0FBMkIsRUFBRTtBQUFBLFlBQzVELG9CQUFvQjtBQUM1QixxQkFBTyxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsWUFDMUI7QUFBQSxVQUNELEdBQUM7QUFBQSxVQUNELENBQUMsdUJBQXVCLElBQUksY0FBYyxLQUE0QixFQUFFO0FBQUEsWUFDOUQsV0FBaUI7QUFBQSxZQUFFO0FBQUEsWUFDbkIsU0FBaUI7QUFBRSxxQkFBTztBQUFBLFlBQUc7QUFBQSxVQUN2QyxHQUFDO0FBQUEsVUFDRCxDQUFDLGNBQWMsSUFBSSxjQUFjLEtBQW1CLEVBQUU7QUFBQSxZQUM1QyxhQUFhO0FBQ3JCLHFCQUFPLElBQUksY0FBYyxLQUFZLEVBQUU7QUFBQSxnQkFBNUI7QUFBQTtBQUNWLHVCQUFTLGNBQWMsTUFBTTtBQUFBO0FBQUEsZ0JBQ3BCLFVBQVU7QUFBQSxnQkFBRTtBQUFBLGNBQ3RCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsR0FBQztBQUFBLFVBQ0QsQ0FBQyxlQUFlLElBQUksY0FBYyxLQUFvQixFQUFFO0FBQUEsVUFBRSxHQUFDO0FBQUEsVUFDM0QsQ0FBQywwQkFBMEIsSUFBSSxjQUFjLEtBQStCLEVBQUU7QUFBQSxVQUFFLEdBQUM7QUFBQSxVQUNqRixDQUFDLHFCQUFxQixJQUFJLGNBQWMsS0FBMEIsRUFBRTtBQUFBLFlBQTFDO0FBQUE7QUFDekIsbUJBQVMsVUFBbUI7QUFDNUIsbUJBQVMseUJBQWtDO0FBQUE7QUFBQSxVQUM1QyxHQUFDO0FBQUEsVUFDRCxDQUFDLDZCQUE2QixJQUFJLGNBQWMsS0FBa0MsRUFBRTtBQUFBLFlBQ25GLE1BQWUsYUFBYTtBQUFBLFlBQUU7QUFBQSxZQUNyQixpQkFBaUI7QUFBRSxxQkFBTztBQUFBLFlBQU87QUFBQSxVQUMzQyxHQUFDO0FBQUEsVUFDRCxDQUFDLHdCQUF3QixJQUFJLGNBQWMsS0FBNkIsRUFBRTtBQUFBLFlBQTdDO0FBQUE7QUFDNUIsbUJBQVMsNEJBQTRCLE1BQU07QUFDM0MsbUJBQVMsb0JBQW9CLFlBQVk7QUFDekMsbUJBQVMsNEJBQTRCLE1BQU07QUFBQSxjQUFFO0FBQUE7QUFBQSxVQUM5QyxHQUFDO0FBQUEsUUFDRjtBQUVBLGNBQU0sd0JBQXdCLE1BQU0sRUFBRSxrQkFBa0IsR0FBRyxPQUFPLFFBQVEsa0JBQWtCLHlCQUF5QjtBQUNwSCwrQkFBcUIsYUFBYSx1QkFBdUI7QUFBQSxZQUN4RCxTQUFTLE1BQU07QUFBQSxZQUFFO0FBQUEsVUFDbEIsQ0FBQztBQUNELGlCQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFDbkYsaUJBQU8sbUNBQW1DLDRCQUE0QixJQUFJLDJCQUEyQjtBQUVyRyxpQkFBTyxpQkFBaUIsTUFBTTtBQUM5QixpQkFBTyxjQUFjO0FBQUEsWUFDcEIsa0JBQWtCLEVBQUUsVUFBVSxPQUFPLFNBQVMsT0FBTyxPQUFPLDJCQUEyQjtBQUFBLFVBQ3hGLENBQUM7QUFFRCxnQkFBTSxlQUFlLGdCQUFnQjtBQUFBLFlBQ3BDLE9BQU8sb0JBQW9CLGNBQVksU0FBUyxJQUFJLHFCQUFxQixFQUFFLGVBQWUsY0FBYyxNQUFNLENBQUM7QUFBQSxVQUNoSDtBQUVBLGdCQUFNLFNBQVMsY0FBYyxNQUFNO0FBQUEsUUFDcEMsQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELHdCQUFnQixRQUFRO0FBQ3hCLDJCQUFtQixnQkFBZ0I7QUFBQSxNQUNwQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxPQUFLLDJFQUEyRSxpQkFBa0I7QUFDakcsVUFBTSxpQkFBNEM7QUFBQSxNQUNqRCwwQkFBMEIsQ0FBQyxPQUFPLFFBQVE7QUFFekMsY0FBTSxPQUFPLE1BQU0sa0JBQWtCLEdBQUc7QUFDeEMsWUFBSSxDQUFDLE1BQU07QUFBRSxpQkFBTyxFQUFFLE9BQU8sQ0FBQyxFQUFFO0FBQUEsUUFBRztBQUNuQyxlQUFPO0FBQUEsVUFDTixPQUFPLENBQUM7QUFBQSxZQUNQLFlBQVksS0FBSyxPQUFPO0FBQUEsWUFDeEIsT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLEtBQUssYUFBYSxJQUFJLFlBQVksS0FBSyxTQUFTO0FBQUEsVUFDbEYsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQUEsTUFDQSwwQkFBMEIsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNuQztBQUVBLFVBQU0scUNBQXFDLFdBQVcsZ0JBQWdCLE9BQU8sY0FBYyxXQUFXO0FBQ3JHLFVBQUksYUFBYTtBQUNqQixZQUFNLE1BQU0sYUFBYSxhQUFhLE1BQU07QUFBRSxxQkFBYTtBQUFBLE1BQU0sQ0FBQztBQUVsRSxhQUFPLFlBQVksRUFBRSxZQUFZLEdBQUcsUUFBUSxFQUFFLENBQUM7QUFDL0MsYUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFFdEQsWUFBTSxRQUFRLEdBQUc7QUFFakIsVUFBSSxRQUFRO0FBQ1osYUFBTyxZQUFZLFlBQVksT0FBTyxtRkFBbUY7QUFBQSxJQUMxSCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx3RUFBd0UsaUJBQWtCO0FBQzlGLFVBQU0saUJBQTRDO0FBQUEsTUFDakQsMEJBQTBCLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRTtBQUFBLE1BQzdDLDBCQUEwQixNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ25DO0FBRUEsVUFBTSxxQ0FBcUMsV0FBVyxnQkFBZ0IsT0FBTyxjQUFjLFdBQVc7QUFDckcsVUFBSSxhQUFhO0FBQ2pCLFlBQU0sTUFBTSxhQUFhLGFBQWEsT0FBSztBQUMxQyxxQkFBYTtBQUNiLGVBQU8sWUFBWSxFQUFFLGVBQWUsTUFBTSxJQUFJO0FBQUEsTUFDL0MsQ0FBQztBQUVELGFBQU8sWUFBWSxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUUsQ0FBQztBQUMvQyxhQUFPLFFBQVEsWUFBWSxRQUFRLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUV0RCxZQUFNLFFBQVEsR0FBRztBQUVqQixVQUFJLFFBQVE7QUFDWixhQUFPLFlBQVksWUFBWSxNQUFNLHNGQUFzRjtBQUFBLElBQzVILENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxpQkFBa0I7QUFDaEcsVUFBTSxpQkFBNEM7QUFBQSxNQUNqRCwwQkFBMEIsQ0FBQyxPQUFPLFFBQVE7QUFDekMsY0FBTSxPQUFPLE1BQU0sa0JBQWtCLEdBQUc7QUFDeEMsWUFBSSxDQUFDLE1BQU07QUFBRSxpQkFBTyxFQUFFLE9BQU8sQ0FBQyxFQUFFO0FBQUEsUUFBRztBQUNuQyxlQUFPO0FBQUEsVUFDTixPQUFPLENBQUM7QUFBQSxZQUNQLFlBQVksS0FBSyxPQUFPO0FBQUEsWUFDeEIsT0FBTyxJQUFJLE1BQU0sSUFBSSxZQUFZLEtBQUssYUFBYSxJQUFJLFlBQVksS0FBSyxTQUFTO0FBQUEsVUFDbEYsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQUEsTUFDQSwwQkFBMEIsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNuQztBQUVBLFVBQU0scUNBQXFDLFdBQVcsZ0JBQWdCLE9BQU8sY0FBYyxXQUFXO0FBQ3JHLGFBQU8sY0FBYyxFQUFFLGVBQWUsRUFBRSxTQUFTLE1BQU0sRUFBRSxDQUFDO0FBRTFELFVBQUksYUFBYTtBQUNqQixZQUFNLE1BQU0sYUFBYSxhQUFhLE9BQUs7QUFDMUMscUJBQWE7QUFDYixlQUFPLFlBQVksRUFBRSxlQUFlLE1BQU0sSUFBSTtBQUFBLE1BQy9DLENBQUM7QUFFRCxhQUFPLFlBQVksRUFBRSxZQUFZLEdBQUcsUUFBUSxFQUFFLENBQUM7QUFDL0MsYUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFFdEQsWUFBTSxRQUFRLEdBQUc7QUFFakIsVUFBSSxRQUFRO0FBQ1osYUFBTyxZQUFZLFlBQVksTUFBTSw2RUFBNkU7QUFBQSxJQUNuSCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5RkFBeUYsaUJBQWtCO0FBSS9HLFVBQU0saUJBQTRDO0FBQUEsTUFDakQsMEJBQTBCLENBQUMsUUFBUSxNQUFNLE1BQU0sVUFBVSxJQUFJLFFBQVEsYUFBVztBQUMvRSxjQUFNLElBQUksTUFBTSx3QkFBd0IsTUFBTTtBQUM3QyxZQUFFLFFBQVE7QUFDVixrQkFBUSxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUN0QixDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsTUFDRCwwQkFBMEIsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNuQztBQUVBLFVBQU0scUNBQXFDLFdBQVcsZ0JBQWdCLE9BQU8sY0FBYyxXQUFXO0FBQ3JHLFVBQUksYUFBYTtBQUNqQixZQUFNLE1BQU0sYUFBYSxhQUFhLE1BQU07QUFBRSxxQkFBYTtBQUFBLE1BQU0sQ0FBQztBQUVsRSxhQUFPLFlBQVksRUFBRSxZQUFZLEdBQUcsUUFBUSxFQUFFLENBQUM7QUFDL0MsYUFBTyxRQUFRLFlBQVksUUFBUSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFHdEQsWUFBTSxRQUFRLEVBQUU7QUFPaEIsYUFBTyxjQUFjLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFHdkMsWUFBTSxRQUFRLEdBQUk7QUFFbEIsVUFBSSxRQUFRO0FBQ1osYUFBTztBQUFBLFFBQVk7QUFBQSxRQUFZO0FBQUEsUUFDOUI7QUFBQSxNQUEyRTtBQUFBLElBQzdFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJkaXNwb3NhYmxlcyIsICJtb2RlbCIsICJhc3NlcnQiLCAiZXZlbnQiLCAiZmlyc3QiXQp9Cg==
