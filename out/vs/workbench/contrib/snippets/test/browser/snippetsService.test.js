import assert from "assert";
import { SnippetCompletionProvider } from "../../browser/snippetCompletionProvider.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { createModelServices, instantiateTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { Snippet, SnippetSource } from "../../browser/snippetsFile.js";
import { CompletionTriggerKind } from "../../../../../editor/common/languages.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { TestLanguageConfigurationService } from "../../../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { EditOperation } from "../../../../../editor/common/core/editOperation.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CompletionModel } from "../../../../../editor/contrib/suggest/browser/completionModel.js";
import { CompletionItem } from "../../../../../editor/contrib/suggest/browser/suggest.js";
import { WordDistance } from "../../../../../editor/contrib/suggest/browser/wordDistance.js";
import { EditorOptions } from "../../../../../editor/common/config/editorOptions.js";
import { URI } from "../../../../../base/common/uri.js";
class SimpleSnippetService {
  constructor(snippets) {
    this.snippets = snippets;
  }
  getSnippets(languageId, resourceUri) {
    return Promise.resolve(this.getSnippetsSync(languageId, resourceUri));
  }
  getSnippetsSync(languageId, resourceUri) {
    if (resourceUri) {
      return this.snippets.filter((snippet) => snippet.isFileIncluded(resourceUri));
    }
    return this.snippets;
  }
  getSnippetFiles() {
    throw new Error();
  }
  isEnabled() {
    throw new Error();
  }
  updateEnablement() {
    throw new Error();
  }
  updateUsageTimestamp(snippet) {
    throw new Error();
  }
}
suite("SnippetsService", function() {
  const defaultCompletionContext = { triggerKind: CompletionTriggerKind.Invoke };
  let disposables;
  let instantiationService;
  let languageService;
  let snippetService;
  setup(function() {
    disposables = new DisposableStore();
    instantiationService = createModelServices(disposables);
    languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({
      id: "fooLang",
      extensions: [".fooLang"]
    }));
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "barTest",
      "bar",
      "",
      "barCodeSnippet",
      "",
      SnippetSource.User,
      generateUuid()
    ), new Snippet(
      false,
      ["fooLang"],
      "bazzTest",
      "bazz",
      "",
      "bazzCodeSnippet",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function asCompletionModel(model, position, provider, context = defaultCompletionContext) {
    const list = await provider.provideCompletionItems(model, Position.lift(position), context);
    const result = new CompletionModel(
      list.suggestions.map((s) => {
        return new CompletionItem(position, s, list, provider);
      }),
      position.column,
      { characterCountDelta: 0, leadingLineContent: model.getLineContent(position.lineNumber).substring(0, position.column - 1) },
      WordDistance.None,
      EditorOptions.suggest.defaultValue,
      EditorOptions.snippetSuggestions.defaultValue,
      void 0
    );
    return result;
  }
  test("snippet completions - simple", async function() {
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "", "fooLang"));
    await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.incomplete, void 0);
      assert.strictEqual(result.suggestions.length, 2);
    });
    const completions = await asCompletionModel(model, new Position(1, 1), provider);
    assert.strictEqual(completions.items.length, 2);
  });
  test("snippet completions - simple 2", async function() {
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "hello ", "fooLang"));
    await provider.provideCompletionItems(model, new Position(1, 6), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.incomplete, void 0);
      assert.strictEqual(result.suggestions.length, 0);
    });
    await provider.provideCompletionItems(model, new Position(1, 7), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.incomplete, void 0);
      assert.strictEqual(result.suggestions.length, 2);
    });
    const completions1 = await asCompletionModel(model, new Position(1, 6), provider);
    assert.strictEqual(completions1.items.length, 0);
    const completions2 = await asCompletionModel(model, new Position(1, 7), provider);
    assert.strictEqual(completions2.items.length, 2);
  });
  test("snippet completions - with prefix", async function() {
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "bar", "fooLang"));
    await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.incomplete, void 0);
      assert.strictEqual(result.suggestions.length, 1);
      assert.deepStrictEqual(result.suggestions[0].label, {
        label: "bar",
        description: "barTest"
      });
      assert.strictEqual(result.suggestions[0].range.insert.startColumn, 1);
      assert.strictEqual(result.suggestions[0].insertText, "barCodeSnippet");
    });
    const completions = await asCompletionModel(model, new Position(1, 4), provider);
    assert.strictEqual(completions.items.length, 1);
    assert.deepStrictEqual(completions.items[0].completion.label, {
      label: "bar",
      description: "barTest"
    });
    assert.strictEqual(completions.items[0].completion.range.insert.startColumn, 1);
    assert.strictEqual(completions.items[0].completion.insertText, "barCodeSnippet");
  });
  test("snippet completions - with different prefixes", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "barTest",
      "bar",
      "",
      "s1",
      "",
      SnippetSource.User,
      generateUuid()
    ), new Snippet(
      false,
      ["fooLang"],
      "name",
      "bar-bar",
      "",
      "s2",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "bar-bar", "fooLang"));
    {
      await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext).then((result) => {
        assert.strictEqual(result.incomplete, void 0);
        assert.strictEqual(result.suggestions.length, 2);
        assert.deepStrictEqual(result.suggestions[0].label, {
          label: "bar",
          description: "barTest"
        });
        assert.strictEqual(result.suggestions[0].insertText, "s1");
        assert.strictEqual(result.suggestions[0].range.insert.startColumn, 1);
        assert.deepStrictEqual(result.suggestions[1].label, {
          label: "bar-bar",
          description: "name"
        });
        assert.strictEqual(result.suggestions[1].insertText, "s2");
        assert.strictEqual(result.suggestions[1].range.insert.startColumn, 1);
      });
      const completions = await asCompletionModel(model, new Position(1, 3), provider);
      assert.strictEqual(completions.items.length, 2);
      assert.deepStrictEqual(completions.items[0].completion.label, {
        label: "bar",
        description: "barTest"
      });
      assert.strictEqual(completions.items[0].completion.insertText, "s1");
      assert.strictEqual(completions.items[0].completion.range.insert.startColumn, 1);
      assert.deepStrictEqual(completions.items[1].completion.label, {
        label: "bar-bar",
        description: "name"
      });
      assert.strictEqual(completions.items[1].completion.insertText, "s2");
      assert.strictEqual(completions.items[1].completion.range.insert.startColumn, 1);
    }
    {
      await provider.provideCompletionItems(model, new Position(1, 5), defaultCompletionContext).then((result) => {
        assert.strictEqual(result.incomplete, void 0);
        assert.strictEqual(result.suggestions.length, 2);
        const [first2, second2] = result.suggestions;
        assert.deepStrictEqual(first2.label, {
          label: "bar",
          description: "barTest"
        });
        assert.strictEqual(first2.insertText, "s1");
        assert.strictEqual(first2.range.insert.startColumn, 5);
        assert.deepStrictEqual(second2.label, {
          label: "bar-bar",
          description: "name"
        });
        assert.strictEqual(second2.insertText, "s2");
        assert.strictEqual(second2.range.insert.startColumn, 1);
      });
      const completions = await asCompletionModel(model, new Position(1, 5), provider);
      assert.strictEqual(completions.items.length, 2);
      const [first, second] = completions.items.map((i) => i.completion);
      assert.deepStrictEqual(first.label, {
        label: "bar-bar",
        description: "name"
      });
      assert.strictEqual(first.insertText, "s2");
      assert.strictEqual(first.range.insert.startColumn, 1);
      assert.deepStrictEqual(second.label, {
        label: "bar",
        description: "barTest"
      });
      assert.strictEqual(second.insertText, "s1");
      assert.strictEqual(second.range.insert.startColumn, 5);
    }
    {
      await provider.provideCompletionItems(model, new Position(1, 6), defaultCompletionContext).then((result) => {
        assert.strictEqual(result.incomplete, void 0);
        assert.strictEqual(result.suggestions.length, 2);
        assert.deepStrictEqual(result.suggestions[0].label, {
          label: "bar",
          description: "barTest"
        });
        assert.strictEqual(result.suggestions[0].insertText, "s1");
        assert.strictEqual(result.suggestions[0].range.insert.startColumn, 5);
        assert.deepStrictEqual(result.suggestions[1].label, {
          label: "bar-bar",
          description: "name"
        });
        assert.strictEqual(result.suggestions[1].insertText, "s2");
        assert.strictEqual(result.suggestions[1].range.insert.startColumn, 1);
      });
      const completions = await asCompletionModel(model, new Position(1, 6), provider);
      assert.strictEqual(completions.items.length, 2);
      assert.deepStrictEqual(completions.items[0].completion.label, {
        label: "bar-bar",
        description: "name"
      });
      assert.strictEqual(completions.items[0].completion.insertText, "s2");
      assert.strictEqual(completions.items[0].completion.range.insert.startColumn, 1);
      assert.deepStrictEqual(completions.items[1].completion.label, {
        label: "bar",
        description: "barTest"
      });
      assert.strictEqual(completions.items[1].completion.insertText, "s1");
      assert.strictEqual(completions.items[1].completion.range.insert.startColumn, 5);
    }
  });
  test('Cannot use "<?php" as user snippet prefix anymore, #26275', async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "",
      "<?php",
      "",
      "insert me",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    let model = instantiateTextModel(instantiationService, "	<?php", "fooLang");
    await provider.provideCompletionItems(model, new Position(1, 7), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.suggestions.length, 1);
    });
    const completions1 = await asCompletionModel(model, new Position(1, 7), provider);
    assert.strictEqual(completions1.items.length, 1);
    model.dispose();
    model = instantiateTextModel(instantiationService, "	<?", "fooLang");
    await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.suggestions.length, 1);
      assert.strictEqual(result.suggestions[0].range.insert.startColumn, 2);
    });
    const completions2 = await asCompletionModel(model, new Position(1, 4), provider);
    assert.strictEqual(completions2.items.length, 1);
    assert.strictEqual(completions2.items[0].completion.range.insert.startColumn, 2);
    model.dispose();
    model = instantiateTextModel(instantiationService, "a<?", "fooLang");
    await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.suggestions.length, 1);
      assert.strictEqual(result.suggestions[0].range.insert.startColumn, 2);
    });
    const completions3 = await asCompletionModel(model, new Position(1, 4), provider);
    assert.strictEqual(completions3.items.length, 1);
    assert.strictEqual(completions3.items[0].completion.range.insert.startColumn, 2);
    model.dispose();
  });
  test("No user snippets in suggestions, when inside the code, #30508", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "",
      "foo",
      "",
      "<foo>$0</foo>",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "<head>\n	\n>/head>", "fooLang"));
    await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.suggestions.length, 1);
    });
    const completions = await asCompletionModel(model, new Position(1, 1), provider);
    assert.strictEqual(completions.items.length, 1);
    await provider.provideCompletionItems(model, new Position(2, 2), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.suggestions.length, 1);
    });
    const completions2 = await asCompletionModel(model, new Position(2, 2), provider);
    assert.strictEqual(completions2.items.length, 1);
  });
  test("SnippetSuggest - ensure extension snippets come last ", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "second",
      "second",
      "",
      "second",
      "",
      SnippetSource.Extension,
      generateUuid()
    ), new Snippet(
      false,
      ["fooLang"],
      "first",
      "first",
      "",
      "first",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "", "fooLang"));
    await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext).then((result) => {
      assert.strictEqual(result.suggestions.length, 2);
      const [first2, second2] = result.suggestions;
      assert.deepStrictEqual(first2.label, {
        label: "first",
        description: "first"
      });
      assert.deepStrictEqual(second2.label, {
        label: "second",
        description: "second"
      });
    });
    const completions = await asCompletionModel(model, new Position(1, 1), provider);
    assert.strictEqual(completions.items.length, 2);
    const [first, second] = completions.items;
    assert.deepStrictEqual(first.completion.label, {
      label: "first",
      description: "first"
    });
    assert.deepStrictEqual(second.completion.label, {
      label: "second",
      description: "second"
    });
  });
  test("Dash in snippets prefix broken #53945", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "p-a",
      "p-a",
      "",
      "second",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "p-", "fooLang"));
    let result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext);
    let completions = await asCompletionModel(model, new Position(1, 2), provider);
    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(completions.items.length, 1);
    result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
    completions = await asCompletionModel(model, new Position(1, 3), provider);
    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(completions.items.length, 1);
    result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
    completions = await asCompletionModel(model, new Position(1, 3), provider);
    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(completions.items.length, 1);
  });
  test("No snippets suggestion on long lines beyond character 100 #58807", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "bug",
      "bug",
      "",
      "second",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea b", "fooLang"));
    const result = await provider.provideCompletionItems(model, new Position(1, 158), defaultCompletionContext);
    const completions = await asCompletionModel(model, new Position(1, 158), provider);
    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(completions.items.length, 1);
  });
  test("Type colon will trigger snippet #60746", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "bug",
      "bug",
      "",
      "second",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, ":", "fooLang"));
    const result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 0);
    const completions = await asCompletionModel(model, new Position(1, 2), provider);
    assert.strictEqual(completions.items.length, 0);
  });
  test("substring of prefix can't trigger snippet #60737", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "mytemplate",
      "mytemplate",
      "",
      "second",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "template", "fooLang"));
    const result = await provider.provideCompletionItems(model, new Position(1, 9), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 1);
    assert.deepStrictEqual(result.suggestions[0].label, {
      label: "mytemplate",
      description: "mytemplate"
    });
    const completions = await asCompletionModel(model, new Position(1, 9), provider);
    assert.strictEqual(completions.items.length, 0);
  });
  test("No snippets suggestion beyond character 100 if not at end of line #60247", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "bug",
      "bug",
      "",
      "second",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea b text_after_b", "fooLang"));
    const result = await provider.provideCompletionItems(model, new Position(1, 158), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 1);
    const completions = await asCompletionModel(model, new Position(1, 158), provider);
    assert.strictEqual(completions.items.length, 1);
  });
  test("issue #61296: VS code freezes when editing CSS fi`le with emoji", async function() {
    const languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
    disposables.add(languageConfigurationService.register("fooLang", {
      wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w\-?]+%?|[@#!.])/g
    }));
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "bug",
      "-a-bug",
      "",
      "second",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, languageConfigurationService);
    const model = disposables.add(instantiateTextModel(instantiationService, ".\u{1F437}-a-b", "fooLang"));
    const result = await provider.provideCompletionItems(model, new Position(1, 8), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 1);
    const completions = await asCompletionModel(model, new Position(1, 8), provider);
    assert.strictEqual(completions.items.length, 1);
  });
  test("No snippets shown when triggering completions at whitespace on line that already has text #62335", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "bug",
      "bug",
      "",
      "second",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "a ", "fooLang"));
    const result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 1);
    const completions = await asCompletionModel(model, new Position(1, 3), provider);
    assert.strictEqual(completions.items.length, 1);
  });
  test("Snippet prefix with special chars and numbers does not work #62906", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "noblockwdelay",
      "<<",
      "",
      '<= #dly"',
      "",
      SnippetSource.User,
      generateUuid()
    ), new Snippet(
      false,
      ["fooLang"],
      "noblockwdelay",
      "11",
      "",
      "eleven",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    let model = instantiateTextModel(instantiationService, " <", "fooLang");
    let result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 1);
    let [first] = result.suggestions;
    assert.strictEqual(first.range.insert.startColumn, 2);
    let completions = await asCompletionModel(model, new Position(1, 3), provider);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].editStart.column, 2);
    model.dispose();
    model = instantiateTextModel(instantiationService, "1", "fooLang");
    result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext);
    completions = await asCompletionModel(model, new Position(1, 2), provider);
    assert.strictEqual(result.suggestions.length, 1);
    [first] = result.suggestions;
    assert.strictEqual(first.range.insert.startColumn, 1);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].editStart.column, 1);
    model.dispose();
  });
  test("Snippet replace range", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "notWordTest",
      "not word",
      "",
      "not word snippet",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    let model = instantiateTextModel(instantiationService, "not wordFoo bar", "fooLang");
    let result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 1);
    let [first] = result.suggestions;
    assert.strictEqual(first.range.insert.endColumn, 3);
    assert.strictEqual(first.range.replace.endColumn, 9);
    let completions = await asCompletionModel(model, new Position(1, 3), provider);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].editInsertEnd.column, 3);
    assert.strictEqual(completions.items[0].editReplaceEnd.column, 9);
    model.dispose();
    model = instantiateTextModel(instantiationService, "not woFoo bar", "fooLang");
    result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 1);
    [first] = result.suggestions;
    assert.strictEqual(first.range.insert.endColumn, 3);
    assert.strictEqual(first.range.replace.endColumn, 3);
    completions = await asCompletionModel(model, new Position(1, 3), provider);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].editInsertEnd.column, 3);
    assert.strictEqual(completions.items[0].editReplaceEnd.column, 3);
    model.dispose();
    model = instantiateTextModel(instantiationService, "not word", "fooLang");
    result = await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext);
    assert.strictEqual(result.suggestions.length, 1);
    [first] = result.suggestions;
    assert.strictEqual(first.range.insert.endColumn, 1);
    assert.strictEqual(first.range.replace.endColumn, 9);
    completions = await asCompletionModel(model, new Position(1, 1), provider);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].editInsertEnd.column, 1);
    assert.strictEqual(completions.items[0].editReplaceEnd.column, 9);
    model.dispose();
  });
  test("Snippet replace-range incorrect #108894", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "eng",
      "eng",
      "",
      "<span></span>",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, "filler e KEEP ng filler", "fooLang");
    const result = await provider.provideCompletionItems(model, new Position(1, 9), defaultCompletionContext);
    const completions = await asCompletionModel(model, new Position(1, 9), provider);
    assert.strictEqual(result.suggestions.length, 1);
    const [first] = result.suggestions;
    assert.strictEqual(first.range.insert.endColumn, 9);
    assert.strictEqual(first.range.replace.endColumn, 9);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].editInsertEnd.column, 9);
    assert.strictEqual(completions.items[0].editReplaceEnd.column, 9);
    model.dispose();
  });
  test("Snippet will replace auto-closing pair if specified in prefix", async function() {
    const languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
    disposables.add(languageConfigurationService.register("fooLang", {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "PSCustomObject",
      "[PSCustomObject]",
      "",
      "[PSCustomObject] @{ Key = Value }",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, languageConfigurationService);
    const model = instantiateTextModel(instantiationService, "[psc]", "fooLang");
    const result = await provider.provideCompletionItems(model, new Position(1, 5), defaultCompletionContext);
    const completions = await asCompletionModel(model, new Position(1, 5), provider);
    assert.strictEqual(result.suggestions.length, 1);
    const [first] = result.suggestions;
    assert.strictEqual(first.range.insert.endColumn, 5);
    assert.strictEqual(first.range.replace.endColumn, 6);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].editInsertEnd.column, 5);
    assert.strictEqual(completions.items[0].editReplaceEnd.column, 6);
    model.dispose();
  });
  test("Leading whitespace in snippet prefix #123860", async function() {
    snippetService = new SimpleSnippetService([new Snippet(
      false,
      ["fooLang"],
      "cite-name",
      " cite",
      "",
      "~\\cite{$CLIPBOARD}",
      "",
      SnippetSource.User,
      generateUuid()
    )]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, " ci", "fooLang");
    const result = await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext);
    const completions = await asCompletionModel(model, new Position(1, 4), provider);
    assert.strictEqual(result.suggestions.length, 1);
    const [first] = result.suggestions;
    assert.strictEqual(first.label.label, " cite");
    assert.strictEqual(first.range.insert.startColumn, 1);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].textLabel, " cite");
    assert.strictEqual(completions.items[0].editStart.column, 1);
    model.dispose();
  });
  test("still show suggestions in string when disable string suggestion #136611", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "aaa", "aaa", "", "value", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "bbb", "bbb", "", "value", "", SnippetSource.User, generateUuid())
      // new Snippet(['fooLang'], '\'ccc', '\'ccc', '', 'value', '', SnippetSource.User, generateUuid())
    ]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, "''", "fooLang");
    const result = await provider.provideCompletionItems(
      model,
      new Position(1, 2),
      { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: "'" }
    );
    assert.strictEqual(result.suggestions.length, 0);
    model.dispose();
  });
  test("still show suggestions in string when disable string suggestion #136611 (part 2)", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "aaa", "aaa", "", "value", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "bbb", "bbb", "", "value", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "'ccc", "'ccc", "", "value", "", SnippetSource.User, generateUuid())
    ]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, "''", "fooLang");
    const result = await provider.provideCompletionItems(
      model,
      new Position(1, 2),
      { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: "'" }
    );
    assert.strictEqual(result.suggestions.length, 1);
    const completions = await asCompletionModel(model, new Position(1, 2), provider, { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: "'" });
    assert.strictEqual(completions.items.length, 1);
    model.dispose();
  });
  test("Snippet suggestions are too eager #138707 (word)", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "tys", "tys", "", "value", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "hell_or_tell", "hell_or_tell", "", "value", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "^y", "^y", "", "value", "", SnippetSource.User, generateUuid())
    ]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, "'hellot'", "fooLang");
    const result = await provider.provideCompletionItems(
      model,
      new Position(1, 8),
      { triggerKind: CompletionTriggerKind.Invoke }
    );
    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(result.suggestions[0].label.label, "hell_or_tell");
    const completions = await asCompletionModel(model, new Position(1, 8), provider, { triggerKind: CompletionTriggerKind.Invoke });
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].textLabel, "hell_or_tell");
    model.dispose();
  });
  test("Snippet suggestions are too eager #138707 (no word)", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "tys", "tys", "", "value", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "t", "t", "", "value", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "^y", "^y", "", "value", "", SnippetSource.User, generateUuid())
    ]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, ")*&^", "fooLang");
    const result = await provider.provideCompletionItems(
      model,
      new Position(1, 5),
      { triggerKind: CompletionTriggerKind.Invoke }
    );
    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(result.suggestions[0].label.label, "^y");
    const completions = await asCompletionModel(model, new Position(1, 5), provider, { triggerKind: CompletionTriggerKind.Invoke });
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].textLabel, "^y");
    model.dispose();
  });
  test("Snippet suggestions are too eager #138707 (word/word)", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "async arrow function", "async arrow function", "", "value", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "foobarrrrrr", "foobarrrrrr", "", "value", "", SnippetSource.User, generateUuid())
    ]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, "foobar", "fooLang");
    const result = await provider.provideCompletionItems(
      model,
      new Position(1, 7),
      { triggerKind: CompletionTriggerKind.Invoke }
    );
    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(result.suggestions[0].label.label, "foobarrrrrr");
    const completions = await asCompletionModel(model, new Position(1, 7), provider, { triggerKind: CompletionTriggerKind.Invoke });
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].textLabel, "foobarrrrrr");
    model.dispose();
  });
  test("Strange and useless autosuggestion #region/#endregion PHP #140039", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "reg", "#region", "", "value", "", SnippetSource.User, generateUuid())
    ]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, "function abc(w)", "fooLang");
    const result = await provider.provideCompletionItems(
      model,
      new Position(1, 15),
      { triggerKind: CompletionTriggerKind.Invoke }
    );
    assert.strictEqual(result.suggestions.length, 0);
    model.dispose();
  });
  test.skip("Snippets disappear with . key #145960", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "div", "div", "", "div", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "div.", "div.", "", "div.", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "div#", "div#", "", "div#", "", SnippetSource.User, generateUuid())
    ]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = instantiateTextModel(instantiationService, "di", "fooLang");
    const result = await provider.provideCompletionItems(
      model,
      new Position(1, 3),
      { triggerKind: CompletionTriggerKind.Invoke }
    );
    assert.strictEqual(result.suggestions.length, 3);
    model.applyEdits([EditOperation.insert(new Position(1, 3), ".")]);
    assert.strictEqual(model.getValue(), "di.");
    const result2 = await provider.provideCompletionItems(
      model,
      new Position(1, 4),
      { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: "." }
    );
    assert.strictEqual(result2.suggestions.length, 1);
    assert.strictEqual(result2.suggestions[0].insertText, "div.");
    model.dispose();
  });
  test("Hyphen in snippet prefix de-indents snippet #139016", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "foo", "Foo- Bar", "", "Foo", "", SnippetSource.User, generateUuid())
    ]);
    const model = disposables.add(instantiateTextModel(instantiationService, "    bar", "fooLang"));
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const result = await provider.provideCompletionItems(
      model,
      new Position(1, 8),
      { triggerKind: CompletionTriggerKind.Invoke }
    );
    assert.strictEqual(result.suggestions.length, 1);
    const first = result.suggestions[0];
    assert.strictEqual(first.range.insert.startColumn, 5);
    const completions = await asCompletionModel(model, new Position(1, 8), provider);
    assert.strictEqual(completions.items.length, 1);
    assert.strictEqual(completions.items[0].editStart.column, 5);
  });
  test("Autocomplete suggests based on the last letter of a word and it depends on the typing speed #191070", async function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "/whiletrue", "/whiletrue", "", "one", "", SnippetSource.User, generateUuid()),
      new Snippet(false, ["fooLang"], "/sc not expanding", "/sc not expanding", "", "two", "", SnippetSource.User, generateUuid())
    ]);
    const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
    const model = disposables.add(instantiateTextModel(instantiationService, "", "fooLang"));
    {
      model.setValue("w");
      const result1 = await provider.provideCompletionItems(
        model,
        new Position(1, 2),
        { triggerKind: CompletionTriggerKind.Invoke }
      );
      assert.strictEqual(result1.suggestions[0].insertText, "one");
      assert.strictEqual(result1.suggestions.length, 1);
    }
    {
      model.setValue("where");
      const result2 = await provider.provideCompletionItems(
        model,
        new Position(1, 6),
        { triggerKind: CompletionTriggerKind.Invoke }
      );
      assert.strictEqual(result2.suggestions[0].insertText, "one");
      assert.strictEqual(result2.suggestions.length, 1);
    }
  });
  test("getSnippetsSync - include pattern", function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "TestSnippet", "test", "", "snippet", "test", SnippetSource.User, generateUuid(), ["**/*.test.ts"]),
      new Snippet(false, ["fooLang"], "SpecSnippet", "spec", "", "snippet", "test", SnippetSource.User, generateUuid(), ["**/*.spec.ts"]),
      new Snippet(false, ["fooLang"], "AllSnippet", "all", "", "snippet", "test", SnippetSource.User, generateUuid())
    ]);
    let snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.test.ts"));
    assert.strictEqual(snippets.length, 2);
    assert.ok(snippets.some((s) => s.name === "TestSnippet"));
    assert.ok(snippets.some((s) => s.name === "AllSnippet"));
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.spec.ts"));
    assert.strictEqual(snippets.length, 2);
    assert.ok(snippets.some((s) => s.name === "SpecSnippet"));
    assert.ok(snippets.some((s) => s.name === "AllSnippet"));
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.ts"));
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].name, "AllSnippet");
    snippets = snippetService.getSnippetsSync("fooLang");
    assert.strictEqual(snippets.length, 3);
  });
  test("getSnippetsSync - exclude pattern", function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "ProdSnippet", "prod", "", "snippet", "test", SnippetSource.User, generateUuid(), void 0, ["**/*.min.js", "**/dist/**"]),
      new Snippet(false, ["fooLang"], "AllSnippet", "all", "", "snippet", "test", SnippetSource.User, generateUuid())
    ]);
    let snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.js"));
    assert.strictEqual(snippets.length, 2);
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.min.js"));
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].name, "AllSnippet");
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/dist/bundle.js"));
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].name, "AllSnippet");
  });
  test("getSnippetsSync - include and exclude patterns together", function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "TestSnippet", "test", "", "snippet", "test", SnippetSource.User, generateUuid(), ["**/*.test.ts", "**/*.spec.ts"], ["**/*.perf.test.ts"])
    ]);
    let snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.test.ts"));
    assert.strictEqual(snippets.length, 1);
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.spec.ts"));
    assert.strictEqual(snippets.length, 1);
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.perf.test.ts"));
    assert.strictEqual(snippets.length, 0);
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.ts"));
    assert.strictEqual(snippets.length, 0);
  });
  test("getSnippetsSync - filename-only patterns (no path separator)", function() {
    snippetService = new SimpleSnippetService([
      new Snippet(false, ["fooLang"], "TestSnippet", "test", "", "snippet", "test", SnippetSource.User, generateUuid(), ["*.test.ts"]),
      new Snippet(false, ["fooLang"], "ConfigSnippet", "config", "", "snippet", "test", SnippetSource.User, generateUuid(), ["config.json"])
    ]);
    let snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/src/foo.test.ts"));
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].name, "TestSnippet");
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/other/deep/path/bar.test.ts"));
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].name, "TestSnippet");
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/config.json"));
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].name, "ConfigSnippet");
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/deep/nested/path/config.json"));
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].name, "ConfigSnippet");
    snippets = snippetService.getSnippetsSync("fooLang", URI.file("/project/myconfig.json"));
    assert.strictEqual(snippets.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNuaXBwZXRzXFx0ZXN0XFxicm93c2VyXFxzbmlwcGV0c1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFNuaXBwZXRDb21wbGV0aW9uLCBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxTZXJ2aWNlcywgaW5zdGFudGlhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJU25pcHBldHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zbmlwcGV0cy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0LCBTbmlwcGV0U291cmNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zbmlwcGV0c0ZpbGUuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtTGFiZWwsIENvbXBsZXRpb25JdGVtUmFuZ2VzLCBDb21wbGV0aW9uVHJpZ2dlcktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vbW9kZXMvdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL2NvbXBsZXRpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LmpzJztcbmltcG9ydCB7IFdvcmREaXN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci93b3JkRGlzdGFuY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuY2xhc3MgU2ltcGxlU25pcHBldFNlcnZpY2UgaW1wbGVtZW50cyBJU25pcHBldHNTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHNuaXBwZXRzOiBTbmlwcGV0W10pIHsgfVxuXHRnZXRTbmlwcGV0cyhsYW5ndWFnZUlkPzogc3RyaW5nLCByZXNvdXJjZVVyaT86IFVSSSkge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5nZXRTbmlwcGV0c1N5bmMobGFuZ3VhZ2VJZCEsIHJlc291cmNlVXJpKSk7XG5cdH1cblx0Z2V0U25pcHBldHNTeW5jKGxhbmd1YWdlSWQ/OiBzdHJpbmcsIHJlc291cmNlVXJpPzogVVJJKTogU25pcHBldFtdIHtcblx0XHQvLyBGaWx0ZXIgc25pcHBldHMgYmFzZWQgb24gcmVzb3VyY2VVcmkgaWYgcHJvdmlkZWRcblx0XHRpZiAocmVzb3VyY2VVcmkpIHtcblx0XHRcdHJldHVybiB0aGlzLnNuaXBwZXRzLmZpbHRlcihzbmlwcGV0ID0+IHNuaXBwZXQuaXNGaWxlSW5jbHVkZWQocmVzb3VyY2VVcmkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuc25pcHBldHM7XG5cdH1cblx0Z2V0U25pcHBldEZpbGVzKCk6IGFueSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdH1cblx0aXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHR9XG5cdHVwZGF0ZUVuYWJsZW1lbnQoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdH1cblx0dXBkYXRlVXNhZ2VUaW1lc3RhbXAoc25pcHBldDogU25pcHBldCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHR9XG59XG5cbnN1aXRlKCdTbmlwcGV0c1NlcnZpY2UnLCBmdW5jdGlvbiAoKSB7XG5cdGNvbnN0IGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dDogQ29tcGxldGlvbkNvbnRleHQgPSB7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH07XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXHRsZXQgc25pcHBldFNlcnZpY2U6IElTbmlwcGV0c1NlcnZpY2U7XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0bGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdFx0XHRpZDogJ2Zvb0xhbmcnLFxuXHRcdFx0ZXh0ZW5zaW9uczogWycuZm9vTGFuZycsXVxuXHRcdH0pKTtcblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbbmV3IFNuaXBwZXQoXG5cdFx0XHRmYWxzZSxcblx0XHRcdFsnZm9vTGFuZyddLFxuXHRcdFx0J2JhclRlc3QnLFxuXHRcdFx0J2JhcicsXG5cdFx0XHQnJyxcblx0XHRcdCdiYXJDb2RlU25pcHBldCcsXG5cdFx0XHQnJyxcblx0XHRcdFNuaXBwZXRTb3VyY2UuVXNlcixcblx0XHRcdGdlbmVyYXRlVXVpZCgpXG5cdFx0KSwgbmV3IFNuaXBwZXQoXG5cdFx0XHRmYWxzZSxcblx0XHRcdFsnZm9vTGFuZyddLFxuXHRcdFx0J2JhenpUZXN0Jyxcblx0XHRcdCdiYXp6Jyxcblx0XHRcdCcnLFxuXHRcdFx0J2JhenpDb2RlU25pcHBldCcsXG5cdFx0XHQnJyxcblx0XHRcdFNuaXBwZXRTb3VyY2UuVXNlcixcblx0XHRcdGdlbmVyYXRlVXVpZCgpXG5cdFx0KV0pO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRhc3luYyBmdW5jdGlvbiBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IElQb3NpdGlvbiwgcHJvdmlkZXI6IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIsIGNvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0ID0gZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSB7XG5cblx0XHRjb25zdCBsaXN0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgUG9zaXRpb24ubGlmdChwb3NpdGlvbiksIGNvbnRleHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IENvbXBsZXRpb25Nb2RlbChsaXN0LnN1Z2dlc3Rpb25zLm1hcChzID0+IHtcblx0XHRcdHJldHVybiBuZXcgQ29tcGxldGlvbkl0ZW0ocG9zaXRpb24sIHMsIGxpc3QsIHByb3ZpZGVyKTtcblx0XHR9KSxcblx0XHRcdHBvc2l0aW9uLmNvbHVtbixcblx0XHRcdHsgY2hhcmFjdGVyQ291bnREZWx0YTogMCwgbGVhZGluZ0xpbmVDb250ZW50OiBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKS5zdWJzdHJpbmcoMCwgcG9zaXRpb24uY29sdW1uIC0gMSkgfSxcblx0XHRcdFdvcmREaXN0YW5jZS5Ob25lLCBFZGl0b3JPcHRpb25zLnN1Z2dlc3QuZGVmYXVsdFZhbHVlLCBFZGl0b3JPcHRpb25zLnNuaXBwZXRTdWdnZXN0aW9ucy5kZWZhdWx0VmFsdWUsIHVuZGVmaW5lZFxuXHRcdCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0dGVzdCgnc25pcHBldCBjb21wbGV0aW9ucyAtIHNpbXBsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICcnLCAnZm9vTGFuZycpKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSEudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbmNvbXBsZXRlLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpLCBwcm92aWRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXQgY29tcGxldGlvbnMgLSBzaW1wbGUgMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdoZWxsbyAnLCAnZm9vTGFuZycpKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA2KSAvKiBoZWxsb3wgKi8sIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jb21wbGV0ZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA3KSAvKiBoZWxsbyB8Ki8sIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jb21wbGV0ZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbXBsZXRpb25zMSA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNikvKiBoZWxsb3wgKi8sIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMxLml0ZW1zLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCBjb21wbGV0aW9uczIgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDcpLyogaGVsbG8gfCovLCBwcm92aWRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zMi5pdGVtcy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0IGNvbXBsZXRpb25zIC0gd2l0aCBwcmVmaXgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnYmFyJywgJ2Zvb0xhbmcnKSk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNCksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jb21wbGV0ZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zWzBdLmxhYmVsLCB7XG5cdFx0XHRcdGxhYmVsOiAnYmFyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdiYXJUZXN0J1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdC5zdWdnZXN0aW9uc1swXS5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnNbMF0uaW5zZXJ0VGV4dCwgJ2JhckNvZGVTbmlwcGV0Jyk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNCksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLmNvbXBsZXRpb24ubGFiZWwsIHtcblx0XHRcdGxhYmVsOiAnYmFyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnYmFyVGVzdCdcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbXBsZXRpb25zLml0ZW1zWzBdLmNvbXBsZXRpb24ucmFuZ2UgYXMgQ29tcGxldGlvbkl0ZW1SYW5nZXMpLmluc2VydC5zdGFydENvbHVtbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLmNvbXBsZXRpb24uaW5zZXJ0VGV4dCwgJ2JhckNvZGVTbmlwcGV0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXQgY29tcGxldGlvbnMgLSB3aXRoIGRpZmZlcmVudCBwcmVmaXhlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbbmV3IFNuaXBwZXQoXG5cdFx0XHRmYWxzZSxcblx0XHRcdFsnZm9vTGFuZyddLFxuXHRcdFx0J2JhclRlc3QnLFxuXHRcdFx0J2JhcicsXG5cdFx0XHQnJyxcblx0XHRcdCdzMScsXG5cdFx0XHQnJyxcblx0XHRcdFNuaXBwZXRTb3VyY2UuVXNlcixcblx0XHRcdGdlbmVyYXRlVXVpZCgpXG5cdFx0KSwgbmV3IFNuaXBwZXQoXG5cdFx0XHRmYWxzZSxcblx0XHRcdFsnZm9vTGFuZyddLFxuXHRcdFx0J25hbWUnLFxuXHRcdFx0J2Jhci1iYXInLFxuXHRcdFx0JycsXG5cdFx0XHQnczInLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdiYXItYmFyJywgJ2Zvb0xhbmcnKSk7XG5cblx0XHR7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMyksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbmNvbXBsZXRlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zWzBdLmxhYmVsLCB7XG5cdFx0XHRcdFx0bGFiZWw6ICdiYXInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnYmFyVGVzdCdcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnNbMF0uaW5zZXJ0VGV4dCwgJ3MxJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LnN1Z2dlc3Rpb25zWzBdLnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5pbnNlcnQuc3RhcnRDb2x1bW4sIDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9uc1sxXS5sYWJlbCwge1xuXHRcdFx0XHRcdGxhYmVsOiAnYmFyLWJhcicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICduYW1lJ1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9uc1sxXS5pbnNlcnRUZXh0LCAnczInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQuc3VnZ2VzdGlvbnNbMV0ucmFuZ2UgYXMgQ29tcGxldGlvbkl0ZW1SYW5nZXMpLmluc2VydC5zdGFydENvbHVtbiwgMSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpLCBwcm92aWRlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXNbMF0uY29tcGxldGlvbi5sYWJlbCwge1xuXHRcdFx0XHRsYWJlbDogJ2JhcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnYmFyVGVzdCdcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLmNvbXBsZXRpb24uaW5zZXJ0VGV4dCwgJ3MxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbXBsZXRpb25zLml0ZW1zWzBdLmNvbXBsZXRpb24ucmFuZ2UgYXMgQ29tcGxldGlvbkl0ZW1SYW5nZXMpLmluc2VydC5zdGFydENvbHVtbiwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzFdLmNvbXBsZXRpb24ubGFiZWwsIHtcblx0XHRcdFx0bGFiZWw6ICdiYXItYmFyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICduYW1lJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXNbMV0uY29tcGxldGlvbi5pbnNlcnRUZXh0LCAnczInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoY29tcGxldGlvbnMuaXRlbXNbMV0uY29tcGxldGlvbi5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCAxKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNSksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbmNvbXBsZXRlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMik7XG5cblx0XHRcdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gcmVzdWx0LnN1Z2dlc3Rpb25zO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QubGFiZWwsIHtcblx0XHRcdFx0XHRsYWJlbDogJ2JhcicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdiYXJUZXN0J1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Lmluc2VydFRleHQsICdzMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGZpcnN0LnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5pbnNlcnQuc3RhcnRDb2x1bW4sIDUpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vjb25kLmxhYmVsLCB7XG5cdFx0XHRcdFx0bGFiZWw6ICdiYXItYmFyJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ25hbWUnXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmluc2VydFRleHQsICdzMicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHNlY29uZC5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCAxKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNSksIHByb3ZpZGVyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSBjb21wbGV0aW9ucy5pdGVtcy5tYXAoaSA9PiBpLmNvbXBsZXRpb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LmxhYmVsLCB7XG5cdFx0XHRcdGxhYmVsOiAnYmFyLWJhcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnbmFtZSdcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Lmluc2VydFRleHQsICdzMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChmaXJzdC5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCAxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmQubGFiZWwsIHtcblx0XHRcdFx0bGFiZWw6ICdiYXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2JhclRlc3QnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuaW5zZXJ0VGV4dCwgJ3MxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHNlY29uZC5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCA1KTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNiksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbmNvbXBsZXRlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zWzBdLmxhYmVsLCB7XG5cdFx0XHRcdFx0bGFiZWw6ICdiYXInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnYmFyVGVzdCdcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnNbMF0uaW5zZXJ0VGV4dCwgJ3MxJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LnN1Z2dlc3Rpb25zWzBdLnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5pbnNlcnQuc3RhcnRDb2x1bW4sIDUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9uc1sxXS5sYWJlbCwge1xuXHRcdFx0XHRcdGxhYmVsOiAnYmFyLWJhcicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICduYW1lJ1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9uc1sxXS5pbnNlcnRUZXh0LCAnczInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQuc3VnZ2VzdGlvbnNbMV0ucmFuZ2UgYXMgQ29tcGxldGlvbkl0ZW1SYW5nZXMpLmluc2VydC5zdGFydENvbHVtbiwgMSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDYpLCBwcm92aWRlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXNbMF0uY29tcGxldGlvbi5sYWJlbCwge1xuXHRcdFx0XHRsYWJlbDogJ2Jhci1iYXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ25hbWUnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS5jb21wbGV0aW9uLmluc2VydFRleHQsICdzMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChjb21wbGV0aW9ucy5pdGVtc1swXS5jb21wbGV0aW9uLnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5pbnNlcnQuc3RhcnRDb2x1bW4sIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1sxXS5jb21wbGV0aW9uLmxhYmVsLCB7XG5cdFx0XHRcdGxhYmVsOiAnYmFyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdiYXJUZXN0J1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXNbMV0uY29tcGxldGlvbi5pbnNlcnRUZXh0LCAnczEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoY29tcGxldGlvbnMuaXRlbXNbMV0uY29tcGxldGlvbi5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCA1KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0Nhbm5vdCB1c2UgXCI8P3BocFwiIGFzIHVzZXIgc25pcHBldCBwcmVmaXggYW55bW9yZSwgIzI2Mjc1JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnJyxcblx0XHRcdCc8P3BocCcsXG5cdFx0XHQnJyxcblx0XHRcdCdpbnNlcnQgbWUnLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cblx0XHRsZXQgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ1xcdDw/cGhwJywgJ2Zvb0xhbmcnKTtcblx0XHRhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNyksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0aW9uczEgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDcpLCBwcm92aWRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zMS5pdGVtcy5sZW5ndGgsIDEpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdG1vZGVsID0gaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdcXHQ8PycsICdmb29MYW5nJyk7XG5cdFx0YXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDQpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LnN1Z2dlc3Rpb25zWzBdLnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5pbnNlcnQuc3RhcnRDb2x1bW4sIDIpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zMiA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNCksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMyLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChjb21wbGV0aW9uczIuaXRlbXNbMF0uY29tcGxldGlvbi5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCAyKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRtb2RlbCA9IGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnYTw/JywgJ2Zvb0xhbmcnKTtcblx0XHRhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNCksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LnN1Z2dlc3Rpb25zWzBdLnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5pbnNlcnQuc3RhcnRDb2x1bW4sIDIpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zMyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNCksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMzLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChjb21wbGV0aW9uczMuaXRlbXNbMF0uY29tcGxldGlvbi5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCAyKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ05vIHVzZXIgc25pcHBldHMgaW4gc3VnZ2VzdGlvbnMsIHdoZW4gaW5zaWRlIHRoZSBjb2RlLCAjMzA1MDgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbbmV3IFNuaXBwZXQoXG5cdFx0XHRmYWxzZSxcblx0XHRcdFsnZm9vTGFuZyddLFxuXHRcdFx0JycsXG5cdFx0XHQnZm9vJyxcblx0XHRcdCcnLFxuXHRcdFx0Jzxmb28+JDA8L2Zvbz4nLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJzxoZWFkPlxcblxcdFxcbj4vaGVhZD4nLCAnZm9vTGFuZycpKTtcblx0XHRhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblxuXG5cdFx0YXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDIpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0aW9uczIgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDIpLCBwcm92aWRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zMi5pdGVtcy5sZW5ndGgsIDEpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXRTdWdnZXN0IC0gZW5zdXJlIGV4dGVuc2lvbiBzbmlwcGV0cyBjb21lIGxhc3QgJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnc2Vjb25kJyxcblx0XHRcdCdzZWNvbmQnLFxuXHRcdFx0JycsXG5cdFx0XHQnc2Vjb25kJyxcblx0XHRcdCcnLFxuXHRcdFx0U25pcHBldFNvdXJjZS5FeHRlbnNpb24sXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCksIG5ldyBTbmlwcGV0KFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRbJ2Zvb0xhbmcnXSxcblx0XHRcdCdmaXJzdCcsXG5cdFx0XHQnZmlyc3QnLFxuXHRcdFx0JycsXG5cdFx0XHQnZmlyc3QnLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJycsICdmb29MYW5nJykpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSEudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gcmVzdWx0LnN1Z2dlc3Rpb25zO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5sYWJlbCwge1xuXHRcdFx0XHRsYWJlbDogJ2ZpcnN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdmaXJzdCdcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmQubGFiZWwsIHtcblx0XHRcdFx0bGFiZWw6ICdzZWNvbmQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3NlY29uZCdcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpLCBwcm92aWRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gY29tcGxldGlvbnMuaXRlbXM7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5jb21wbGV0aW9uLmxhYmVsLCB7XG5cdFx0XHRsYWJlbDogJ2ZpcnN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnZmlyc3QnXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmQuY29tcGxldGlvbi5sYWJlbCwge1xuXHRcdFx0bGFiZWw6ICdzZWNvbmQnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdzZWNvbmQnXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Rhc2ggaW4gc25pcHBldHMgcHJlZml4IGJyb2tlbiAjNTM5NDUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW25ldyBTbmlwcGV0KFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRbJ2Zvb0xhbmcnXSxcblx0XHRcdCdwLWEnLFxuXHRcdFx0J3AtYScsXG5cdFx0XHQnJyxcblx0XHRcdCdzZWNvbmQnLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdwLScsICdmb29MYW5nJykpO1xuXG5cdFx0bGV0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyKSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSE7XG5cdFx0bGV0IGNvbXBsZXRpb25zID0gYXdhaXQgYXNDb21wbGV0aW9uTW9kZWwobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyKSwgcHJvdmlkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblxuXHRcdHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAzKSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSE7XG5cdFx0Y29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpLCBwcm92aWRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDEpO1xuXG5cdFx0cmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpITtcblx0XHRjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMyksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ05vIHNuaXBwZXRzIHN1Z2dlc3Rpb24gb24gbG9uZyBsaW5lcyBiZXlvbmQgY2hhcmFjdGVyIDEwMCAjNTg4MDcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW25ldyBTbmlwcGV0KFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRbJ2Zvb0xhbmcnXSxcblx0XHRcdCdidWcnLFxuXHRcdFx0J2J1ZycsXG5cdFx0XHQnJyxcblx0XHRcdCdzZWNvbmQnLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ1RoaXNpc2F2ZXJ5bG9uZ2xpbmVnb2luZ3dpdGhtb3JlMTAwYmNoYXJhY3RlcnNhbmR0aGlzbWFrZXNpbnRlbGxpc2Vuc2ViZWNvbWVhIFRoaXNpc2F2ZXJ5bG9uZ2xpbmVnb2luZ3dpdGhtb3JlMTAwYmNoYXJhY3RlcnNhbmR0aGlzbWFrZXNpbnRlbGxpc2Vuc2ViZWNvbWVhIGInLCAnZm9vTGFuZycpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTU4KSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSE7XG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDE1OCksIHByb3ZpZGVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnVHlwZSBjb2xvbiB3aWxsIHRyaWdnZXIgc25pcHBldCAjNjA3NDYnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW25ldyBTbmlwcGV0KFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRbJ2Zvb0xhbmcnXSxcblx0XHRcdCdidWcnLFxuXHRcdFx0J2J1ZycsXG5cdFx0XHQnJyxcblx0XHRcdCdzZWNvbmQnLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJzonLCAnZm9vTGFuZycpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMiksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgYXNDb21wbGV0aW9uTW9kZWwobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyKSwgcHJvdmlkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzdHJpbmcgb2YgcHJlZml4IGNhblxcJ3QgdHJpZ2dlciBzbmlwcGV0ICM2MDczNycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbbmV3IFNuaXBwZXQoXG5cdFx0XHRmYWxzZSxcblx0XHRcdFsnZm9vTGFuZyddLFxuXHRcdFx0J215dGVtcGxhdGUnLFxuXHRcdFx0J215dGVtcGxhdGUnLFxuXHRcdFx0JycsXG5cdFx0XHQnc2Vjb25kJyxcblx0XHRcdCcnLFxuXHRcdFx0U25pcHBldFNvdXJjZS5Vc2VyLFxuXHRcdFx0Z2VuZXJhdGVVdWlkKClcblx0XHQpXSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICd0ZW1wbGF0ZScsICdmb29MYW5nJykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA5KSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9uc1swXS5sYWJlbCwge1xuXHRcdFx0bGFiZWw6ICdteXRlbXBsYXRlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnbXl0ZW1wbGF0ZSdcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgYXNDb21wbGV0aW9uTW9kZWwobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA5KSwgcHJvdmlkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdObyBzbmlwcGV0cyBzdWdnZXN0aW9uIGJleW9uZCBjaGFyYWN0ZXIgMTAwIGlmIG5vdCBhdCBlbmQgb2YgbGluZSAjNjAyNDcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW25ldyBTbmlwcGV0KFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRbJ2Zvb0xhbmcnXSxcblx0XHRcdCdidWcnLFxuXHRcdFx0J2J1ZycsXG5cdFx0XHQnJyxcblx0XHRcdCdzZWNvbmQnLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ1RoaXNpc2F2ZXJ5bG9uZ2xpbmVnb2luZ3dpdGhtb3JlMTAwYmNoYXJhY3RlcnNhbmR0aGlzbWFrZXNpbnRlbGxpc2Vuc2ViZWNvbWVhIFRoaXNpc2F2ZXJ5bG9uZ2xpbmVnb2luZ3dpdGhtb3JlMTAwYmNoYXJhY3RlcnNhbmR0aGlzbWFrZXNpbnRlbGxpc2Vuc2ViZWNvbWVhIGIgdGV4dF9hZnRlcl9iJywgJ2Zvb0xhbmcnKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTU4KSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDE1OCksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzYxMjk2OiBWUyBjb2RlIGZyZWV6ZXMgd2hlbiBlZGl0aW5nIENTUyBmaWBsZSB3aXRoIGVtb2ppJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKCdmb29MYW5nJywge1xuXHRcdFx0d29yZFBhdHRlcm46IC8oIz8tP1xcZCpcXC5cXGRcXHcqJT8pfCg6Oj9bXFx3LV0qKD89W14seztdKlsse10pKXwoKFtAIy4hXSk/W1xcd1xcLT9dKyU/fFtAIyEuXSkvZ1xuXHRcdH0pKTtcblxuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnYnVnJyxcblx0XHRcdCctYS1idWcnLFxuXHRcdFx0JycsXG5cdFx0XHQnc2Vjb25kJyxcblx0XHRcdCcnLFxuXHRcdFx0U25pcHBldFNvdXJjZS5Vc2VyLFxuXHRcdFx0Z2VuZXJhdGVVdWlkKClcblx0XHQpXSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICcuXHVEODNEXHVEQzM3LWEtYicsICdmb29MYW5nJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDgpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgOCksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnTm8gc25pcHBldHMgc2hvd24gd2hlbiB0cmlnZ2VyaW5nIGNvbXBsZXRpb25zIGF0IHdoaXRlc3BhY2Ugb24gbGluZSB0aGF0IGFscmVhZHkgaGFzIHRleHQgIzYyMzM1JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnYnVnJyxcblx0XHRcdCdidWcnLFxuXHRcdFx0JycsXG5cdFx0XHQnc2Vjb25kJyxcblx0XHRcdCcnLFxuXHRcdFx0U25pcHBldFNvdXJjZS5Vc2VyLFxuXHRcdFx0Z2VuZXJhdGVVdWlkKClcblx0XHQpXSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdhICcsICdmb29MYW5nJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMyksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCBwcmVmaXggd2l0aCBzcGVjaWFsIGNoYXJzIGFuZCBudW1iZXJzIGRvZXMgbm90IHdvcmsgIzYyOTA2JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnbm9ibG9ja3dkZWxheScsXG5cdFx0XHQnPDwnLFxuXHRcdFx0JycsXG5cdFx0XHQnPD0gI2RseVwiJyxcblx0XHRcdCcnLFxuXHRcdFx0U25pcHBldFNvdXJjZS5Vc2VyLFxuXHRcdFx0Z2VuZXJhdGVVdWlkKClcblx0XHQpLCBuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnbm9ibG9ja3dkZWxheScsXG5cdFx0XHQnMTEnLFxuXHRcdFx0JycsXG5cdFx0XHQnZWxldmVuJyxcblx0XHRcdCcnLFxuXHRcdFx0U25pcHBldFNvdXJjZS5Vc2VyLFxuXHRcdFx0Z2VuZXJhdGVVdWlkKClcblx0XHQpXSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXG5cdFx0bGV0IG1vZGVsID0gaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICcgPCcsICdmb29MYW5nJyk7XG5cblx0XHRsZXQgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0bGV0IFtmaXJzdF0gPSByZXN1bHQuc3VnZ2VzdGlvbnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChmaXJzdC5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LnN0YXJ0Q29sdW1uLCAyKTtcblxuXHRcdGxldCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMyksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXNbMF0uZWRpdFN0YXJ0LmNvbHVtbiwgMik7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0bW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJzEnLCAnZm9vTGFuZycpO1xuXHRcdHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyKSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSE7XG5cdFx0Y29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIpLCBwcm92aWRlcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0W2ZpcnN0XSA9IHJlc3VsdC5zdWdnZXN0aW9ucztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGZpcnN0LnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5pbnNlcnQuc3RhcnRDb2x1bW4sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS5lZGl0U3RhcnQuY29sdW1uLCAxKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCByZXBsYWNlIHJhbmdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnbm90V29yZFRlc3QnLFxuXHRcdFx0J25vdCB3b3JkJyxcblx0XHRcdCcnLFxuXHRcdFx0J25vdCB3b3JkIHNuaXBwZXQnLFxuXHRcdFx0JycsXG5cdFx0XHRTbmlwcGV0U291cmNlLlVzZXIsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdCldKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cblx0XHRsZXQgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ25vdCB3b3JkRm9vIGJhcicsICdmb29MYW5nJyk7XG5cblx0XHRsZXQgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0bGV0IFtmaXJzdF0gPSByZXN1bHQuc3VnZ2VzdGlvbnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChmaXJzdC5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LmVuZENvbHVtbiwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChmaXJzdC5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykucmVwbGFjZS5lbmRDb2x1bW4sIDkpO1xuXG5cdFx0bGV0IGNvbXBsZXRpb25zID0gYXdhaXQgYXNDb21wbGV0aW9uTW9kZWwobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAzKSwgcHJvdmlkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS5lZGl0SW5zZXJ0RW5kLmNvbHVtbiwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLmVkaXRSZXBsYWNlRW5kLmNvbHVtbiwgOSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0bW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ25vdCB3b0ZvbyBiYXInLCAnZm9vTGFuZycpO1xuXHRcdHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAzKSwgZGVmYXVsdENvbXBsZXRpb25Db250ZXh0KSE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0W2ZpcnN0XSA9IHJlc3VsdC5zdWdnZXN0aW9ucztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGZpcnN0LnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5pbnNlcnQuZW5kQ29sdW1uLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGZpcnN0LnJhbmdlIGFzIENvbXBsZXRpb25JdGVtUmFuZ2VzKS5yZXBsYWNlLmVuZENvbHVtbiwgMyk7XG5cblx0XHRjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMyksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXNbMF0uZWRpdEluc2VydEVuZC5jb2x1bW4sIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS5lZGl0UmVwbGFjZUVuZC5jb2x1bW4sIDMpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdG1vZGVsID0gaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdub3Qgd29yZCcsICdmb29MYW5nJyk7XG5cdFx0cmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpITtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRbZmlyc3RdID0gcmVzdWx0LnN1Z2dlc3Rpb25zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZmlyc3QucmFuZ2UgYXMgQ29tcGxldGlvbkl0ZW1SYW5nZXMpLmluc2VydC5lbmRDb2x1bW4sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZmlyc3QucmFuZ2UgYXMgQ29tcGxldGlvbkl0ZW1SYW5nZXMpLnJlcGxhY2UuZW5kQ29sdW1uLCA5KTtcblxuXHRcdGNvbXBsZXRpb25zID0gYXdhaXQgYXNDb21wbGV0aW9uTW9kZWwobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSwgcHJvdmlkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS5lZGl0SW5zZXJ0RW5kLmNvbHVtbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLmVkaXRSZXBsYWNlRW5kLmNvbHVtbiwgOSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXQgcmVwbGFjZS1yYW5nZSBpbmNvcnJlY3QgIzEwODg5NCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnZW5nJyxcblx0XHRcdCdlbmcnLFxuXHRcdFx0JycsXG5cdFx0XHQnPHNwYW4+PC9zcGFuPicsXG5cdFx0XHQnJyxcblx0XHRcdFNuaXBwZXRTb3VyY2UuVXNlcixcblx0XHRcdGdlbmVyYXRlVXVpZCgpXG5cdFx0KV0pO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgU25pcHBldENvbXBsZXRpb25Qcm92aWRlcihsYW5ndWFnZVNlcnZpY2UsIHNuaXBwZXRTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdmaWxsZXIgZSBLRUVQIG5nIGZpbGxlcicsICdmb29MYW5nJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDkpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpITtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgOSksIHByb3ZpZGVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gcmVzdWx0LnN1Z2dlc3Rpb25zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZmlyc3QucmFuZ2UgYXMgQ29tcGxldGlvbkl0ZW1SYW5nZXMpLmluc2VydC5lbmRDb2x1bW4sIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZmlyc3QucmFuZ2UgYXMgQ29tcGxldGlvbkl0ZW1SYW5nZXMpLnJlcGxhY2UuZW5kQ29sdW1uLCA5KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS5lZGl0SW5zZXJ0RW5kLmNvbHVtbiwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLmVkaXRSZXBsYWNlRW5kLmNvbHVtbiwgOSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXQgd2lsbCByZXBsYWNlIGF1dG8tY2xvc2luZyBwYWlyIGlmIHNwZWNpZmllZCBpbiBwcmVmaXgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIoJ2Zvb0xhbmcnLCB7XG5cdFx0XHRicmFja2V0czogW1xuXHRcdFx0XHRbJ3snLCAnfSddLFxuXHRcdFx0XHRbJ1snLCAnXSddLFxuXHRcdFx0XHRbJygnLCAnKSddLFxuXHRcdFx0XVxuXHRcdH0pKTtcblxuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtuZXcgU25pcHBldChcblx0XHRcdGZhbHNlLFxuXHRcdFx0Wydmb29MYW5nJ10sXG5cdFx0XHQnUFNDdXN0b21PYmplY3QnLFxuXHRcdFx0J1tQU0N1c3RvbU9iamVjdF0nLFxuXHRcdFx0JycsXG5cdFx0XHQnW1BTQ3VzdG9tT2JqZWN0XSBAeyBLZXkgPSBWYWx1ZSB9Jyxcblx0XHRcdCcnLFxuXHRcdFx0U25pcHBldFNvdXJjZS5Vc2VyLFxuXHRcdFx0Z2VuZXJhdGVVdWlkKClcblx0XHQpXSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ1twc2NdJywgJ2Zvb0xhbmcnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNSksIGRlZmF1bHRDb21wbGV0aW9uQ29udGV4dCkhO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgYXNDb21wbGV0aW9uTW9kZWwobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSwgcHJvdmlkZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSByZXN1bHQuc3VnZ2VzdGlvbnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChmaXJzdC5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykuaW5zZXJ0LmVuZENvbHVtbiwgNSk7XG5cdFx0Ly8gVGhpcyBpcyA2IGJlY2F1c2UgaXQgc2hvdWxkIGVhdCB0aGUgYF1gIGF0IHRoZSBlbmQgb2YgdGhlIHRleHQgZXZlbiBpZiBjdXJzb3IgaXMgYmVmb3JlIGl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChmaXJzdC5yYW5nZSBhcyBDb21wbGV0aW9uSXRlbVJhbmdlcykucmVwbGFjZS5lbmRDb2x1bW4sIDYpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLmVkaXRJbnNlcnRFbmQuY29sdW1uLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXNbMF0uZWRpdFJlcGxhY2VFbmQuY29sdW1uLCA2KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnTGVhZGluZyB3aGl0ZXNwYWNlIGluIHNuaXBwZXQgcHJlZml4ICMxMjM4NjAnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbbmV3IFNuaXBwZXQoXG5cdFx0XHRmYWxzZSxcblx0XHRcdFsnZm9vTGFuZyddLFxuXHRcdFx0J2NpdGUtbmFtZScsXG5cdFx0XHQnIGNpdGUnLFxuXHRcdFx0JycsXG5cdFx0XHQnflxcXFxjaXRleyRDTElQQk9BUkR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0U25pcHBldFNvdXJjZS5Vc2VyLFxuXHRcdFx0Z2VuZXJhdGVVdWlkKClcblx0XHQpXSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJyBjaScsICdmb29MYW5nJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDQpLCBkZWZhdWx0Q29tcGxldGlvbkNvbnRleHQpITtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNCksIHByb3ZpZGVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gcmVzdWx0LnN1Z2dlc3Rpb25zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPENvbXBsZXRpb25JdGVtTGFiZWw+Zmlyc3QubGFiZWwpLmxhYmVsLCAnIGNpdGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxDb21wbGV0aW9uSXRlbVJhbmdlcz5maXJzdC5yYW5nZSkuaW5zZXJ0LnN0YXJ0Q29sdW1uLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS50ZXh0TGFiZWwsICcgY2l0ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS5lZGl0U3RhcnQuY29sdW1uLCAxKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc3RpbGwgc2hvdyBzdWdnZXN0aW9ucyBpbiBzdHJpbmcgd2hlbiBkaXNhYmxlIHN0cmluZyBzdWdnZXN0aW9uICMxMzY2MTEnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdhYWEnLCAnYWFhJywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ2JiYicsICdiYmInLCAnJywgJ3ZhbHVlJywgJycsIFNuaXBwZXRTb3VyY2UuVXNlciwgZ2VuZXJhdGVVdWlkKCkpLFxuXHRcdFx0Ly8gbmV3IFNuaXBwZXQoWydmb29MYW5nJ10sICdcXCdjY2MnLCAnXFwnY2NjJywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgU25pcHBldENvbXBsZXRpb25Qcm92aWRlcihsYW5ndWFnZVNlcnZpY2UsIHNuaXBwZXRTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdcXCdcXCcnLCAnZm9vTGFuZycpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRtb2RlbCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAyKSxcblx0XHRcdHsgdHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyQ2hhcmFjdGVyLCB0cmlnZ2VyQ2hhcmFjdGVyOiAnXFwnJyB9XG5cdFx0KSE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ3N0aWxsIHNob3cgc3VnZ2VzdGlvbnMgaW4gc3RyaW5nIHdoZW4gZGlzYWJsZSBzdHJpbmcgc3VnZ2VzdGlvbiAjMTM2NjExIChwYXJ0IDIpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW1xuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFsnZm9vTGFuZyddLCAnYWFhJywgJ2FhYScsICcnLCAndmFsdWUnLCAnJywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdiYmInLCAnYmJiJywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ1xcJ2NjYycsICdcXCdjY2MnLCAnJywgJ3ZhbHVlJywgJycsIFNuaXBwZXRTb3VyY2UuVXNlciwgZ2VuZXJhdGVVdWlkKCkpXG5cdFx0XSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ1xcJ1xcJycsICdmb29MYW5nJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMiksXG5cdFx0XHR7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3RlciwgdHJpZ2dlckNoYXJhY3RlcjogJ1xcJycgfVxuXHRcdCkhO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBhc0NvbXBsZXRpb25Nb2RlbChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIpLCBwcm92aWRlciwgeyB0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIsIHRyaWdnZXJDaGFyYWN0ZXI6ICdcXCcnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDEpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IHN1Z2dlc3Rpb25zIGFyZSB0b28gZWFnZXIgIzEzODcwNyAod29yZCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW1xuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFsnZm9vTGFuZyddLCAndHlzJywgJ3R5cycsICcnLCAndmFsdWUnLCAnJywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdoZWxsX29yX3RlbGwnLCAnaGVsbF9vcl90ZWxsJywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ155JywgJ155JywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ1xcJ2hlbGxvdFxcJycsICdmb29MYW5nJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgOCksXG5cdFx0XHR7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH1cblx0XHQpITtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxTbmlwcGV0Q29tcGxldGlvbj5yZXN1bHQuc3VnZ2VzdGlvbnNbMF0pLmxhYmVsLmxhYmVsLCAnaGVsbF9vcl90ZWxsJyk7XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgOCksIHByb3ZpZGVyLCB7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9ucy5pdGVtc1swXS50ZXh0TGFiZWwsICdoZWxsX29yX3RlbGwnKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCBzdWdnZXN0aW9ucyBhcmUgdG9vIGVhZ2VyICMxMzg3MDcgKG5vIHdvcmQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ3R5cycsICd0eXMnLCAnJywgJ3ZhbHVlJywgJycsIFNuaXBwZXRTb3VyY2UuVXNlciwgZ2VuZXJhdGVVdWlkKCkpLFxuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFsnZm9vTGFuZyddLCAndCcsICd0JywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ155JywgJ155JywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJykqJl4nLCAnZm9vTGFuZycpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdG1vZGVsLFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDUpLFxuXHRcdFx0eyB0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZSB9XG5cdFx0KSE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8U25pcHBldENvbXBsZXRpb24+cmVzdWx0LnN1Z2dlc3Rpb25zWzBdKS5sYWJlbC5sYWJlbCwgJ155Jyk7XG5cblxuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgYXNDb21wbGV0aW9uTW9kZWwobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSwgcHJvdmlkZXIsIHsgdHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLnRleHRMYWJlbCwgJ155Jyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXQgc3VnZ2VzdGlvbnMgYXJlIHRvbyBlYWdlciAjMTM4NzA3ICh3b3JkL3dvcmQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ2FzeW5jIGFycm93IGZ1bmN0aW9uJywgJ2FzeW5jIGFycm93IGZ1bmN0aW9uJywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ2Zvb2JhcnJycnJyJywgJ2Zvb2JhcnJycnJyJywgJycsICd2YWx1ZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ2Zvb2JhcicsICdmb29MYW5nJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgNyksXG5cdFx0XHR7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH1cblx0XHQpITtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxTbmlwcGV0Q29tcGxldGlvbj5yZXN1bHQuc3VnZ2VzdGlvbnNbMF0pLmxhYmVsLmxhYmVsLCAnZm9vYmFycnJycnInKTtcblxuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgYXNDb21wbGV0aW9uTW9kZWwobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA3KSwgcHJvdmlkZXIsIHsgdHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRpb25zLml0ZW1zWzBdLnRleHRMYWJlbCwgJ2Zvb2JhcnJycnJyJyk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdTdHJhbmdlIGFuZCB1c2VsZXNzIGF1dG9zdWdnZXN0aW9uICNyZWdpb24vI2VuZHJlZ2lvbiBQSFAgIzE0MDAzOScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdyZWcnLCAnI3JlZ2lvbicsICcnLCAndmFsdWUnLCAnJywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XSk7XG5cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ2Z1bmN0aW9uIGFiYyh3KScsICdmb29MYW5nJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdG1vZGVsLFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDE1KSxcblx0XHRcdHsgdHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2UgfVxuXHRcdCkhO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWdnZXN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdTbmlwcGV0cyBkaXNhcHBlYXIgd2l0aCAuIGtleSAjMTQ1OTYwJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHNuaXBwZXRTZXJ2aWNlID0gbmV3IFNpbXBsZVNuaXBwZXRTZXJ2aWNlKFtcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ2RpdicsICdkaXYnLCAnJywgJ2RpdicsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ2Rpdi4nLCAnZGl2LicsICcnLCAnZGl2LicsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ2RpdiMnLCAnZGl2IycsICcnLCAnZGl2IycsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZXJ2aWNlLCBzbmlwcGV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ2RpJywgJ2Zvb0xhbmcnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMyksXG5cdFx0XHR7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH1cblx0XHQpITtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoLCAzKTtcblxuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDMpLCAnLicpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdkaS4nKTtcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdG1vZGVsLFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDQpLFxuXHRcdFx0eyB0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIsIHRyaWdnZXJDaGFyYWN0ZXI6ICcuJyB9XG5cdFx0KSE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5zdWdnZXN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLnN1Z2dlc3Rpb25zWzBdLmluc2VydFRleHQsICdkaXYuJyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0h5cGhlbiBpbiBzbmlwcGV0IHByZWZpeCBkZS1pbmRlbnRzIHNuaXBwZXQgIzEzOTAxNicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdmb28nLCAnRm9vLSBCYXInLCAnJywgJ0ZvbycsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRdKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJyAgICBiYXInLCAnZm9vTGFuZycpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRtb2RlbCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCA4KSxcblx0XHRcdHsgdHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2UgfVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgZmlyc3QgPSByZXN1bHQuc3VnZ2VzdGlvbnNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8Q29tcGxldGlvbkl0ZW1SYW5nZXM+Zmlyc3QucmFuZ2UpLmluc2VydC5zdGFydENvbHVtbiwgNSk7XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IGFzQ29tcGxldGlvbk1vZGVsKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgOCksIHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXNbMF0uZWRpdFN0YXJ0LmNvbHVtbiwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0F1dG9jb21wbGV0ZSBzdWdnZXN0cyBiYXNlZCBvbiB0aGUgbGFzdCBsZXR0ZXIgb2YgYSB3b3JkIGFuZCBpdCBkZXBlbmRzIG9uIHRoZSB0eXBpbmcgc3BlZWQgIzE5MTA3MCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRzbmlwcGV0U2VydmljZSA9IG5ldyBTaW1wbGVTbmlwcGV0U2VydmljZShbXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICcvd2hpbGV0cnVlJywgJy93aGlsZXRydWUnLCAnJywgJ29uZScsICcnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJy9zYyBub3QgZXhwYW5kaW5nJywgJy9zYyBub3QgZXhwYW5kaW5nJywgJycsICd0d28nLCAnJywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBTbmlwcGV0Q29tcGxldGlvblByb3ZpZGVyKGxhbmd1YWdlU2VydmljZSwgc25pcHBldFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnJywgJ2Zvb0xhbmcnKSk7XG5cblx0XHR7IC8vIFBSRUZJWDogd1xuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJ3cnKTtcblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0bmV3IFBvc2l0aW9uKDEsIDIpLFxuXHRcdFx0XHR7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH1cblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5zdWdnZXN0aW9uc1swXS5pbnNlcnRUZXh0LCAnb25lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5zdWdnZXN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdH1cblxuXHRcdHsgLy8gUFJFRklYOiB3aGVyZVxuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJ3doZXJlJyk7XG5cdFx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdG5ldyBQb3NpdGlvbigxLCA2KSxcblx0XHRcdFx0eyB0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZSB9XG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIuc3VnZ2VzdGlvbnNbMF0uaW5zZXJ0VGV4dCwgJ29uZScpOyAvLyAvd2hpbGV0cnVlIG1hdGNoZXMgd2hlcmUgKFdIaWxFdFJ1RSlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLnN1Z2dlc3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdnZXRTbmlwcGV0c1N5bmMgLSBpbmNsdWRlIHBhdHRlcm4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW1xuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFsnZm9vTGFuZyddLCAnVGVzdFNuaXBwZXQnLCAndGVzdCcsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSwgWycqKi8qLnRlc3QudHMnXSksXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdTcGVjU25pcHBldCcsICdzcGVjJywgJycsICdzbmlwcGV0JywgJ3Rlc3QnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpLCBbJyoqLyouc3BlYy50cyddKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Zvb0xhbmcnXSwgJ0FsbFNuaXBwZXQnLCAnYWxsJywgJycsICdzbmlwcGV0JywgJ3Rlc3QnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRdKTtcblxuXHRcdC8vIFRlc3QgZmlsZSBzaG91bGQgb25seSBnZXQgVGVzdFNuaXBwZXQgYW5kIEFsbFNuaXBwZXRcblx0XHRsZXQgc25pcHBldHMgPSBzbmlwcGV0U2VydmljZS5nZXRTbmlwcGV0c1N5bmMoJ2Zvb0xhbmcnLCBVUkkuZmlsZSgnL3Byb2plY3Qvc3JjL2Zvby50ZXN0LnRzJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayhzbmlwcGV0cy5zb21lKHMgPT4gcy5uYW1lID09PSAnVGVzdFNuaXBwZXQnKSk7XG5cdFx0YXNzZXJ0Lm9rKHNuaXBwZXRzLnNvbWUocyA9PiBzLm5hbWUgPT09ICdBbGxTbmlwcGV0JykpO1xuXG5cdFx0Ly8gU3BlYyBmaWxlIHNob3VsZCBvbmx5IGdldCBTcGVjU25pcHBldCBhbmQgQWxsU25pcHBldFxuXHRcdHNuaXBwZXRzID0gc25pcHBldFNlcnZpY2UuZ2V0U25pcHBldHNTeW5jKCdmb29MYW5nJywgVVJJLmZpbGUoJy9wcm9qZWN0L3NyYy9mb28uc3BlYy50cycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2soc25pcHBldHMuc29tZShzID0+IHMubmFtZSA9PT0gJ1NwZWNTbmlwcGV0JykpO1xuXHRcdGFzc2VydC5vayhzbmlwcGV0cy5zb21lKHMgPT4gcy5uYW1lID09PSAnQWxsU25pcHBldCcpKTtcblxuXHRcdC8vIFJlZ3VsYXIgZmlsZSBzaG91bGQgb25seSBnZXQgQWxsU25pcHBldFxuXHRcdHNuaXBwZXRzID0gc25pcHBldFNlcnZpY2UuZ2V0U25pcHBldHNTeW5jKCdmb29MYW5nJywgVVJJLmZpbGUoJy9wcm9qZWN0L3NyYy9mb28udHMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzWzBdLm5hbWUsICdBbGxTbmlwcGV0Jyk7XG5cblx0XHQvLyBXaXRob3V0IFVSSSwgYWxsIHNuaXBwZXRzIHNob3VsZCBiZSByZXR1cm5lZCAoYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcblx0XHRzbmlwcGV0cyA9IHNuaXBwZXRTZXJ2aWNlLmdldFNuaXBwZXRzU3luYygnZm9vTGFuZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0cy5sZW5ndGgsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTbmlwcGV0c1N5bmMgLSBleGNsdWRlIHBhdHRlcm4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW1xuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFsnZm9vTGFuZyddLCAnUHJvZFNuaXBwZXQnLCAncHJvZCcsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSwgdW5kZWZpbmVkLCBbJyoqLyoubWluLmpzJywgJyoqL2Rpc3QvKionXSksXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdBbGxTbmlwcGV0JywgJ2FsbCcsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XSk7XG5cblx0XHQvLyBSZWd1bGFyIC5qcyBmaWxlIHNob3VsZCBnZXQgYm90aCBzbmlwcGV0c1xuXHRcdGxldCBzbmlwcGV0cyA9IHNuaXBwZXRTZXJ2aWNlLmdldFNuaXBwZXRzU3luYygnZm9vTGFuZycsIFVSSS5maWxlKCcvcHJvamVjdC9zcmMvZm9vLmpzJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0cy5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gTWluaWZpZWQgZmlsZSBzaG91bGQgb25seSBnZXQgQWxsU25pcHBldCAoUHJvZFNuaXBwZXQgaXMgZXhjbHVkZWQpXG5cdFx0c25pcHBldHMgPSBzbmlwcGV0U2VydmljZS5nZXRTbmlwcGV0c1N5bmMoJ2Zvb0xhbmcnLCBVUkkuZmlsZSgnL3Byb2plY3Qvc3JjL2Zvby5taW4uanMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzWzBdLm5hbWUsICdBbGxTbmlwcGV0Jyk7XG5cblx0XHQvLyBGaWxlIGluIGRpc3QgZm9sZGVyIHNob3VsZCBvbmx5IGdldCBBbGxTbmlwcGV0XG5cdFx0c25pcHBldHMgPSBzbmlwcGV0U2VydmljZS5nZXRTbmlwcGV0c1N5bmMoJ2Zvb0xhbmcnLCBVUkkuZmlsZSgnL3Byb2plY3QvZGlzdC9idW5kbGUuanMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzWzBdLm5hbWUsICdBbGxTbmlwcGV0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNuaXBwZXRzU3luYyAtIGluY2x1ZGUgYW5kIGV4Y2x1ZGUgcGF0dGVybnMgdG9nZXRoZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW1xuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFsnZm9vTGFuZyddLCAnVGVzdFNuaXBwZXQnLCAndGVzdCcsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSwgWycqKi8qLnRlc3QudHMnLCAnKiovKi5zcGVjLnRzJ10sIFsnKiovKi5wZXJmLnRlc3QudHMnXSksXG5cdFx0XSk7XG5cblx0XHQvLyBSZWd1bGFyIHRlc3QgZmlsZSBzaG91bGQgZ2V0IHRoZSBzbmlwcGV0XG5cdFx0bGV0IHNuaXBwZXRzID0gc25pcHBldFNlcnZpY2UuZ2V0U25pcHBldHNTeW5jKCdmb29MYW5nJywgVVJJLmZpbGUoJy9wcm9qZWN0L3NyYy9mb28udGVzdC50cycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldHMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFNwZWMgZmlsZSBzaG91bGQgZ2V0IHRoZSBzbmlwcGV0XG5cdFx0c25pcHBldHMgPSBzbmlwcGV0U2VydmljZS5nZXRTbmlwcGV0c1N5bmMoJ2Zvb0xhbmcnLCBVUkkuZmlsZSgnL3Byb2plY3Qvc3JjL2Zvby5zcGVjLnRzJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0cy5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gUGVyZm9ybWFuY2UgdGVzdCBmaWxlIHNob3VsZCBOT1QgZ2V0IHRoZSBzbmlwcGV0IChleGNsdWRlZClcblx0XHRzbmlwcGV0cyA9IHNuaXBwZXRTZXJ2aWNlLmdldFNuaXBwZXRzU3luYygnZm9vTGFuZycsIFVSSS5maWxlKCcvcHJvamVjdC9zcmMvZm9vLnBlcmYudGVzdC50cycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldHMubGVuZ3RoLCAwKTtcblxuXHRcdC8vIFJlZ3VsYXIgZmlsZSBzaG91bGQgTk9UIGdldCB0aGUgc25pcHBldCAobm90IGluY2x1ZGVkKVxuXHRcdHNuaXBwZXRzID0gc25pcHBldFNlcnZpY2UuZ2V0U25pcHBldHNTeW5jKCdmb29MYW5nJywgVVJJLmZpbGUoJy9wcm9qZWN0L3NyYy9mb28udHMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNuaXBwZXRzU3luYyAtIGZpbGVuYW1lLW9ubHkgcGF0dGVybnMgKG5vIHBhdGggc2VwYXJhdG9yKScsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBQYXR0ZXJucyB3aXRob3V0ICcvJyBzaG91bGQgbWF0Y2ggb24gZmlsZW5hbWUgb25seSAobGlrZSBmaWxlcy5hc3NvY2lhdGlvbnMpXG5cdFx0c25pcHBldFNlcnZpY2UgPSBuZXcgU2ltcGxlU25pcHBldFNlcnZpY2UoW1xuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFsnZm9vTGFuZyddLCAnVGVzdFNuaXBwZXQnLCAndGVzdCcsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSwgWycqLnRlc3QudHMnXSksXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdDb25maWdTbmlwcGV0JywgJ2NvbmZpZycsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSwgWydjb25maWcuanNvbiddKSxcblx0XHRdKTtcblxuXHRcdC8vICoudGVzdC50cyBzaG91bGQgbWF0Y2ggYW55IGZpbGUgZW5kaW5nIGluIC50ZXN0LnRzIHJlZ2FyZGxlc3Mgb2YgcGF0aFxuXHRcdGxldCBzbmlwcGV0cyA9IHNuaXBwZXRTZXJ2aWNlLmdldFNuaXBwZXRzU3luYygnZm9vTGFuZycsIFVSSS5maWxlKCcvcHJvamVjdC9zcmMvZm9vLnRlc3QudHMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzWzBdLm5hbWUsICdUZXN0U25pcHBldCcpO1xuXG5cdFx0c25pcHBldHMgPSBzbmlwcGV0U2VydmljZS5nZXRTbmlwcGV0c1N5bmMoJ2Zvb0xhbmcnLCBVUkkuZmlsZSgnL290aGVyL2RlZXAvcGF0aC9iYXIudGVzdC50cycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldHNbMF0ubmFtZSwgJ1Rlc3RTbmlwcGV0Jyk7XG5cblx0XHQvLyBjb25maWcuanNvbiBzaG91bGQgbWF0Y2ggZmlsZW5hbWUgZXhhY3RseVxuXHRcdHNuaXBwZXRzID0gc25pcHBldFNlcnZpY2UuZ2V0U25pcHBldHNTeW5jKCdmb29MYW5nJywgVVJJLmZpbGUoJy9wcm9qZWN0L2NvbmZpZy5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0c1swXS5uYW1lLCAnQ29uZmlnU25pcHBldCcpO1xuXG5cdFx0c25pcHBldHMgPSBzbmlwcGV0U2VydmljZS5nZXRTbmlwcGV0c1N5bmMoJ2Zvb0xhbmcnLCBVUkkuZmlsZSgnL2RlZXAvbmVzdGVkL3BhdGgvY29uZmlnLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzWzBdLm5hbWUsICdDb25maWdTbmlwcGV0Jyk7XG5cblx0XHQvLyBteWNvbmZpZy5qc29uIHNob3VsZCBOT1QgbWF0Y2ggY29uZmlnLmpzb24gcGF0dGVyblxuXHRcdHNuaXBwZXRzID0gc25pcHBldFNlcnZpY2UuZ2V0U25pcHBldHNTeW5jKCdmb29MYW5nJywgVVJJLmZpbGUoJy9wcm9qZWN0L215Y29uZmlnLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRzLmxlbmd0aCwgMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBNEIsaUNBQWlDO0FBQzdELFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFTLHFCQUFxQiw0QkFBNEI7QUFFMUQsU0FBUyxTQUFTLHFCQUFxQjtBQUN2QyxTQUF1RSw2QkFBNkI7QUFDcEcsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxXQUFXO0FBRXBCLE1BQU0scUJBQWlEO0FBQUEsRUFFdEQsWUFBcUIsVUFBcUI7QUFBckI7QUFBQSxFQUF1QjtBQUFBLEVBQzVDLFlBQVksWUFBcUIsYUFBbUI7QUFDbkQsV0FBTyxRQUFRLFFBQVEsS0FBSyxnQkFBZ0IsWUFBYSxXQUFXLENBQUM7QUFBQSxFQUN0RTtBQUFBLEVBQ0EsZ0JBQWdCLFlBQXFCLGFBQThCO0FBRWxFLFFBQUksYUFBYTtBQUNoQixhQUFPLEtBQUssU0FBUyxPQUFPLGFBQVcsUUFBUSxlQUFlLFdBQVcsQ0FBQztBQUFBLElBQzNFO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBQ0Esa0JBQXVCO0FBQ3RCLFVBQU0sSUFBSSxNQUFNO0FBQUEsRUFDakI7QUFBQSxFQUNBLFlBQXFCO0FBQ3BCLFVBQU0sSUFBSSxNQUFNO0FBQUEsRUFDakI7QUFBQSxFQUNBLG1CQUF5QjtBQUN4QixVQUFNLElBQUksTUFBTTtBQUFBLEVBQ2pCO0FBQUEsRUFDQSxxQkFBcUIsU0FBd0I7QUFDNUMsVUFB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QUFZLFNBQVMsUUFBUSxDQUFDO0FBR3JDLGVBQVcsZUFBZSxnQkFBZ0IsV0FBVyxJQUFJLEtBQUssK0JBQStCLENBQUM7QUFDOUYsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBR3JDLGVBQVcsZUFBZSxnQkFBZ0IsV0FBVyxJQUFJLEtBQUsscUJBQXFCLENBQUM7QUFDcEYsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDdEMsQ0FBQztBQUVELE9BQUssZ0VBQWdFLFdBQVk7QUFFaEYscUJBQWlCLElBQUkscUJBQXFCO0FBQUEsTUFDekMsSUFBSSxRQUFRLE9BQU8sQ0FBQyxTQUFTLEdBQUcsZUFBZSxRQUFRLElBQUksV0FBVyxRQUFRLGNBQWMsTUFBTSxhQUFhLEdBQUcsQ0FBQyxXQUFXLENBQUM7QUFBQSxNQUMvSCxJQUFJLFFBQVEsT0FBTyxDQUFDLFNBQVMsR0FBRyxpQkFBaUIsVUFBVSxJQUFJLFdBQVcsUUFBUSxjQUFjLE1BQU0sYUFBYSxHQUFHLENBQUMsYUFBYSxDQUFDO0FBQUEsSUFDdEksQ0FBQztBQUdELFFBQUksV0FBVyxlQUFlLGdCQUFnQixXQUFXLElBQUksS0FBSywwQkFBMEIsQ0FBQztBQUM3RixXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFDckMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLE1BQU0sYUFBYTtBQUVsRCxlQUFXLGVBQWUsZ0JBQWdCLFdBQVcsSUFBSSxLQUFLLDhCQUE4QixDQUFDO0FBQzdGLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUNyQyxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsTUFBTSxhQUFhO0FBR2xELGVBQVcsZUFBZSxnQkFBZ0IsV0FBVyxJQUFJLEtBQUssc0JBQXNCLENBQUM7QUFDckYsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxNQUFNLGVBQWU7QUFFcEQsZUFBVyxlQUFlLGdCQUFnQixXQUFXLElBQUksS0FBSywrQkFBK0IsQ0FBQztBQUM5RixXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFDckMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLE1BQU0sZUFBZTtBQUdwRCxlQUFXLGVBQWUsZ0JBQWdCLFdBQVcsSUFBSSxLQUFLLHdCQUF3QixDQUFDO0FBQ3ZGLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQ3RDLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJmaXJzdCIsICJzZWNvbmQiXQp9Cg==
