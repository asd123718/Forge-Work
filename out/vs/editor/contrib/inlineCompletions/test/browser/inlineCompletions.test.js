import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDataChannelService } from "../../../../../platform/dataChannel/common/dataChannel.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { Range } from "../../../../common/core/range.js";
import { InlineCompletionTriggerKind, ProviderId } from "../../../../common/languages.js";
import { InlineCompletionEditorType } from "../../browser/model/provideInlineCompletions.js";
import { InlineCompletionsSource } from "../../browser/model/inlineCompletionsSource.js";
import { MockInlineCompletionsProvider, withAsyncTestCodeEditorAndInlineCompletionsModel } from "./utils.js";
import { Selection } from "../../../../common/core/selection.js";
suite("Inline Completions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Emits empty response telemetry after instantiation service disposal", async function() {
    const providerStarted = new DeferredPromise();
    const providerResponse = new DeferredPromise();
    const provider = {
      providerId: ProviderId.fromExtensionId("GitHub.copilot"),
      provideInlineCompletions: () => {
        providerStarted.complete();
        return providerResponse.p;
      },
      disposeInlineCompletions: () => {
      }
    };
    const sentChannelIds = [];
    const dataChannelService = {
      _serviceBrand: void 0,
      onDidSendData: Event.None,
      getDataChannel: (channelId) => ({
        sendData: () => sentChannelIds.push(channelId)
      })
    };
    const serviceCollection = new ServiceCollection(
      [IDataChannelService, dataChannelService],
      [IConfigurationService, new TestConfigurationService({
        "github.copilot.enable": { "*": true }
      })]
    );
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { provider, serviceCollection },
      async ({ editor, model, store, instantiationService }) => {
        const source = store.add(instantiationService.createInstance(
          InlineCompletionsSource,
          model.textModel,
          model._textModelVersionId,
          { get: () => 0, update: () => 0, default: () => 0 },
          observableValue("testCursorPosition", editor.getPosition()),
          "github.copilot.enable"
        ));
        const request = source.fetch([provider], void 0, {
          triggerKind: InlineCompletionTriggerKind.Explicit,
          selectedSuggestionInfo: void 0,
          earliestShownDateTime: 0,
          includeInlineCompletions: true,
          includeInlineEdits: false,
          requestIssuedDateTime: Date.now()
        }, void 0, false, observableValue("userJumpedToActiveCompletion", false), {
          startTime: Date.now(),
          sku: void 0,
          editorType: InlineCompletionEditorType.TextEditor,
          languageId: "plaintext",
          availableProviders: [provider.providerId],
          reason: "",
          typingInterval: 0,
          typingIntervalCharacterCount: 0
        });
        await providerStarted.p;
        instantiationService.dispose();
        await providerResponse.complete({ items: [] });
        await request;
      }
    );
    assert.deepStrictEqual(sentChannelIds, ["editTelemetry"]);
  });
  test("Does not trigger automatically if disabled", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider, inlineSuggest: { enabled: false } },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("foo");
        await timeout(1e3);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), []);
        assert.deepStrictEqual(context.getAndClearViewStates(), [""]);
      }
    );
  });
  test("Ghost text is shown after trigger", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("foo");
        provider.setReturnValue({ insertText: "foobar", range: new Range(1, 1, 1, 4) });
        model.triggerExplicitly();
        await timeout(1e3);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(1,4)", text: "foo", triggerKind: 1 }
        ]);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["", "foo[bar]"]);
      }
    );
  });
  test("Ghost text is shown automatically when configured", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider, inlineSuggest: { enabled: true } },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("foo");
        provider.setReturnValue({ insertText: "foobar", range: new Range(1, 1, 1, 4) });
        await timeout(1e3);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(1,4)", text: "foo", triggerKind: 0 }
        ]);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["", "foo[bar]"]);
      }
    );
  });
  test("Ghost text is updated automatically", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        provider.setReturnValue({ insertText: "foobar", range: new Range(1, 1, 1, 4) });
        context.keyboardType("foo");
        model.triggerExplicitly();
        await timeout(1e3);
        provider.setReturnValue({ insertText: "foobizz", range: new Range(1, 1, 1, 6) });
        context.keyboardType("b");
        context.keyboardType("i");
        await timeout(1e3);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(1,4)", text: "foo", triggerKind: 1 },
          { position: "(1,6)", text: "foobi", triggerKind: 0 }
        ]);
        assert.deepStrictEqual(
          context.getAndClearViewStates(),
          ["", "foo[bar]", "foob[ar]", "foobi", "foobi[zz]"]
        );
      }
    );
  });
  test("Unindent whitespace", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("  ");
        provider.setReturnValue({ insertText: "foo", range: new Range(1, 2, 1, 3) });
        model.triggerExplicitly();
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["", "  [foo]"]);
        model.accept(editor);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(1,3)", text: "  ", triggerKind: 1 }
        ]);
        assert.deepStrictEqual(context.getAndClearViewStates(), [" foo"]);
      }
    );
  });
  test("Unindent tab", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("		");
        provider.setReturnValue({ insertText: "foo", range: new Range(1, 2, 1, 3) });
        model.triggerExplicitly();
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["", "		[foo]"]);
        model.accept(editor);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(1,3)", text: "		", triggerKind: 1 }
        ]);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["	foo"]);
      }
    );
  });
  test("No unindent after indentation", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("buzz  ");
        provider.setReturnValue({ insertText: "foo", range: new Range(1, 6, 1, 7) });
        model.triggerExplicitly();
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), [""]);
        model.accept(editor);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(1,7)", text: "buzz  ", triggerKind: 1 }
        ]);
        assert.deepStrictEqual(context.getAndClearViewStates(), []);
      }
    );
  });
  test("Next/previous", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context, logger }) => {
        context.keyboardType("foo");
        provider.setReturnValue({ insertText: "foobar1", range: new Range(1, 1, 1, 4) });
        logger.logRun(() => model.trigger());
        await timeout(1e3);
        assert.deepStrictEqual(
          context.getAndClearViewStates(),
          ["", "foo[bar1]"]
        );
        provider.setReturnValues([
          { insertText: "foobar1", range: new Range(1, 1, 1, 4) },
          { insertText: "foobizz2", range: new Range(1, 1, 1, 4) },
          { insertText: "foobuzz3", range: new Range(1, 1, 1, 4) }
        ]);
        logger.logRun(() => model.next());
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["foo[bizz2]"]);
        logger.logRun(() => model.next());
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["foo[buzz3]"]);
        logger.logRun(() => model.next());
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["foo[bar1]"]);
        logger.logRun(() => model.previous());
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["foo[buzz3]"]);
        logger.logRun(() => model.previous());
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["foo[bizz2]"]);
        logger.logRun(() => model.previous());
        await timeout(1e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), ["foo[bar1]"]);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(1,4)", text: "foo", triggerKind: 0 },
          { position: "(1,4)", text: "foo", triggerKind: 1 }
        ]);
      }
    );
  });
  test("Calling the provider is debounced", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        model.trigger();
        context.keyboardType("f");
        await timeout(40);
        context.keyboardType("o");
        await timeout(40);
        context.keyboardType("o");
        await timeout(40);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), []);
        await timeout(400);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(1,4)", text: "foo", triggerKind: 0 }
        ]);
        provider.assertNotCalledTwiceWithin50ms();
      }
    );
  });
  test("Backspace is debounced", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider, inlineSuggest: { enabled: true } },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("foo");
        provider.setReturnValue({ insertText: "foobar", range: new Range(1, 1, 1, 4) });
        await timeout(1e3);
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 3; i++) {
            context.leftDelete();
            await timeout(5);
          }
          context.keyboardType("bar");
        }
        await timeout(400);
        provider.assertNotCalledTwiceWithin50ms();
      }
    );
  });
  suite("Forward Stability", () => {
    test("Typing agrees", async function() {
      const provider = new MockInlineCompletionsProvider();
      await withAsyncTestCodeEditorAndInlineCompletionsModel(
        "",
        { fakeClock: true, provider },
        async ({ editor, editorViewModel, model, context }) => {
          provider.setReturnValue({ insertText: "foobar" });
          context.keyboardType("foo");
          model.trigger();
          await timeout(1e3);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [
            { position: "(1,4)", text: "foo", triggerKind: 0 }
          ]);
          assert.deepStrictEqual(context.getAndClearViewStates(), ["", "foo[bar]"]);
          context.keyboardType("b");
          assert.deepStrictEqual(context.getAndClearViewStates(), ["foob[ar]"]);
          await timeout(1e3);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [
            { position: "(1,5)", text: "foob", triggerKind: 0 }
          ]);
          assert.deepStrictEqual(context.getAndClearViewStates(), []);
          context.keyboardType("a");
          assert.deepStrictEqual(context.getAndClearViewStates(), ["fooba[r]"]);
          await timeout(1e3);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [
            { position: "(1,6)", text: "fooba", triggerKind: 0 }
          ]);
          assert.deepStrictEqual(context.getAndClearViewStates(), []);
        }
      );
    });
    async function setupScenario({ editor, editorViewModel, model, context, store }, provider) {
      assert.deepStrictEqual(context.getAndClearViewStates(), [""]);
      provider.setReturnValue({ insertText: "foo bar" });
      context.keyboardType("f");
      model.triggerExplicitly();
      await timeout(1e4);
      assert.deepStrictEqual(provider.getAndClearCallHistory(), [{ position: "(1,2)", triggerKind: 1, text: "f" }]);
      assert.deepStrictEqual(context.getAndClearViewStates(), ["f[oo bar]"]);
      provider.setReturnValue({ insertText: "foo baz" });
      await timeout(1e4);
    }
    test("Support forward instability", async function() {
      const provider = new MockInlineCompletionsProvider();
      await withAsyncTestCodeEditorAndInlineCompletionsModel(
        "",
        { fakeClock: true, provider },
        async (ctx) => {
          await setupScenario(ctx, provider);
          ctx.context.keyboardType("o");
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ["fo[o bar]"]);
          await timeout(1e4);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [
            { position: "(1,3)", text: "fo", triggerKind: 0 }
          ]);
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ["fo[o baz]"]);
        }
      );
    });
    test("when accepting word by word", async function() {
      const provider = new MockInlineCompletionsProvider();
      await withAsyncTestCodeEditorAndInlineCompletionsModel(
        "",
        { fakeClock: true, provider },
        async (ctx) => {
          await setupScenario(ctx, provider);
          await ctx.model.acceptNextWord();
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ["foo[ bar]"]);
          await timeout(1e4);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [{ position: "(1,4)", triggerKind: 0, text: "foo" }]);
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), []);
          await ctx.model.triggerExplicitly();
          await timeout(1e4);
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), []);
        }
      );
    });
    test("when accepting undo", async function() {
      const provider = new MockInlineCompletionsProvider();
      await withAsyncTestCodeEditorAndInlineCompletionsModel(
        "",
        { fakeClock: true, provider },
        async (ctx) => {
          await setupScenario(ctx, provider);
          await ctx.model.acceptNextWord();
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ["foo[ bar]"]);
          await timeout(1e4);
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), []);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [{ position: "(1,4)", triggerKind: 0, text: "foo" }]);
          await ctx.editor.getModel().undo();
          await timeout(1e4);
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ["f[oo bar]"]);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [{ position: "(1,2)", triggerKind: 0, text: "f" }]);
          await ctx.editor.getModel().redo();
          await timeout(1e4);
          assert.deepStrictEqual(ctx.context.getAndClearViewStates(), ["foo[ bar]"]);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [{ position: "(1,4)", triggerKind: 0, text: "foo" }]);
        }
      );
    });
    test("Support backward instability", async function() {
      const provider = new MockInlineCompletionsProvider();
      await withAsyncTestCodeEditorAndInlineCompletionsModel(
        "",
        { fakeClock: true, provider },
        async ({ editor, editorViewModel, model, context }) => {
          context.keyboardType("fooba");
          provider.setReturnValue({ insertText: "foobar", range: new Range(1, 1, 1, 6) });
          model.triggerExplicitly();
          await timeout(1e3);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [
            { position: "(1,6)", text: "fooba", triggerKind: 1 }
          ]);
          assert.deepStrictEqual(context.getAndClearViewStates(), ["", "fooba[r]"]);
          provider.setReturnValue({ insertText: "foobaz", range: new Range(1, 1, 1, 5) });
          context.leftDelete();
          await timeout(1e3);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [
            { position: "(1,5)", text: "foob", triggerKind: 0 }
          ]);
          assert.deepStrictEqual(context.getAndClearViewStates(), [
            "foob[ar]",
            "foob[az]"
          ]);
        }
      );
    });
    test("Push item to preserve to front", async function() {
      const provider = new MockInlineCompletionsProvider(true);
      await withAsyncTestCodeEditorAndInlineCompletionsModel(
        "",
        { fakeClock: true, provider },
        async ({ editor, editorViewModel, model, context }) => {
          provider.setReturnValue({ insertText: "foobar", range: new Range(1, 1, 1, 4) });
          context.keyboardType("foo");
          await timeout(1e3);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [
            {
              position: "(1,4)",
              triggerKind: 0,
              text: "foo"
            }
          ]);
          assert.deepStrictEqual(
            context.getAndClearViewStates(),
            [
              "",
              "foo[bar]"
            ]
          );
          provider.setReturnValues([{ insertText: "foobar1", range: new Range(1, 1, 1, 4) }, { insertText: "foobar", range: new Range(1, 1, 1, 4) }]);
          await model.triggerExplicitly();
          await timeout(1e3);
          assert.deepStrictEqual(provider.getAndClearCallHistory(), [
            {
              position: "(1,4)",
              triggerKind: 1,
              text: "foo"
            }
          ]);
          assert.deepStrictEqual(
            context.getAndClearViewStates(),
            []
          );
        }
      );
    });
  });
  test("No race conditions", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("h");
        provider.setReturnValue({ insertText: "helloworld", range: new Range(1, 1, 1, 2) }, 1e3);
        model.triggerExplicitly();
        await timeout(1030);
        context.keyboardType("ello");
        provider.setReturnValue({ insertText: "helloworld", range: new Range(1, 1, 1, 6) }, 1e3);
        await timeout(2e3);
        assert.deepStrictEqual(context.getAndClearViewStates(), [
          "",
          "hello[world]"
        ]);
      }
    );
  });
  test("Do not reuse cache from previous session (#132516)", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider, inlineSuggest: { enabled: true } },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("hello\n");
        context.cursorLeft();
        context.keyboardType("x");
        context.leftDelete();
        provider.setReturnValue({ insertText: "helloworld", range: new Range(1, 1, 1, 6) }, 1e3);
        await timeout(2e3);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          {
            position: "(1,6)",
            text: "hello\n",
            triggerKind: 0
          }
        ]);
        provider.setReturnValue({ insertText: "helloworld", range: new Range(2, 1, 2, 6) }, 1e3);
        context.cursorDown();
        context.keyboardType("hello");
        await timeout(40);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), []);
        context.keyboardType("w");
        context.leftDelete();
        await timeout(2e3);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [
          { position: "(2,6)", triggerKind: 0, text: "hello\nhello" }
        ]);
        assert.deepStrictEqual(context.getAndClearViewStates(), [
          "",
          "hello[world]\n",
          "hello\n",
          "hello\nhello[world]"
        ]);
      }
    );
  });
  test("Additional Text Edits", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("buzz\nbaz");
        provider.setReturnValue({
          insertText: "bazz",
          range: new Range(2, 1, 2, 4),
          additionalTextEdits: [{
            range: new Range(1, 1, 1, 5),
            text: "bla"
          }]
        });
        model.triggerExplicitly();
        await timeout(1e3);
        model.accept(editor);
        assert.deepStrictEqual(provider.getAndClearCallHistory(), [{ position: "(2,4)", triggerKind: 1, text: "buzz\nbaz" }]);
        assert.deepStrictEqual(context.getAndClearViewStates(), [
          "",
          "buzz\nbaz[z]",
          "bla\nbazz"
        ]);
      }
    );
  });
});
suite("Multi Cursor Support", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Basic", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("console\nconsole\n");
        editor.setSelections([
          new Selection(1, 1e3, 1, 1e3),
          new Selection(2, 1e3, 2, 1e3)
        ]);
        provider.setReturnValue({
          insertText: 'console.log("hello");',
          range: new Range(1, 1, 1, 1e3)
        });
        model.triggerExplicitly();
        await timeout(1e3);
        model.accept(editor);
        assert.deepStrictEqual(
          editor.getValue(),
          [
            `console.log("hello");`,
            `console.log("hello");`,
            ``
          ].join("\n")
        );
      }
    );
  });
  test("Multi Part", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("console.log()\nconsole.log\n");
        editor.setSelections([
          new Selection(1, 12, 1, 12),
          new Selection(2, 1e3, 2, 1e3)
        ]);
        provider.setReturnValue({
          insertText: 'console.log("hello");',
          range: new Range(1, 1, 1, 1e3)
        });
        model.triggerExplicitly();
        await timeout(1e3);
        model.accept(editor);
        assert.deepStrictEqual(
          editor.getValue(),
          [
            `console.log("hello");`,
            `console.log`,
            ``
          ].join("\n")
        );
      }
    );
  });
  test("Multi Part and Different Cursor Columns", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("console.log()\nconsole.warn\n");
        editor.setSelections([
          new Selection(1, 12, 1, 12),
          new Selection(2, 14, 2, 14)
        ]);
        provider.setReturnValue({
          insertText: 'console.log("hello");',
          range: new Range(1, 1, 1, 1e3)
        });
        model.triggerExplicitly();
        await timeout(1e3);
        model.accept(editor);
        assert.deepStrictEqual(
          editor.getValue(),
          [
            `console.log("hello");`,
            `console.warn`,
            ``
          ].join("\n")
        );
      }
    );
  });
  async function acceptNextWord(model, editor, timesToAccept = 1) {
    for (let i = 0; i < timesToAccept; i++) {
      model.triggerExplicitly();
      await timeout(1e3);
      await model.acceptNextWord();
    }
  }
  test("Basic Partial Completion", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("let\nlet\n");
        editor.setSelections([
          new Selection(1, 1e3, 1, 1e3),
          new Selection(2, 1e3, 2, 1e3)
        ]);
        provider.setReturnValue({
          insertText: `let a = 'some word'; `,
          range: new Range(1, 1, 1, 1e3)
        });
        await acceptNextWord(model, editor, 2);
        assert.deepStrictEqual(
          editor.getValue(),
          [
            `let a`,
            `let a`,
            ``
          ].join("\n")
        );
      }
    );
  });
  test("Partial Multi-Part Completion", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("for ()\nfor \n");
        editor.setSelections([
          new Selection(1, 5, 1, 5),
          new Selection(2, 1e3, 2, 1e3)
        ]);
        provider.setReturnValue({
          insertText: `for (let i = 0; i < 10; i++) {`,
          range: new Range(1, 1, 1, 1e3)
        });
        model.triggerExplicitly();
        await timeout(1e3);
        await acceptNextWord(model, editor, 3);
        assert.deepStrictEqual(
          editor.getValue(),
          [
            `for (let i)`,
            `for `,
            ``
          ].join("\n")
        );
      }
    );
  });
  test("Partial Mutli-Part and Different Cursor Columns Completion", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType(`console.log()
console.warnnnn
`);
        editor.setSelections([
          new Selection(1, 12, 1, 12),
          new Selection(2, 16, 2, 16)
        ]);
        provider.setReturnValue({
          insertText: `console.log("hello" + " " + "world");`,
          range: new Range(1, 1, 1, 1e3)
        });
        model.triggerExplicitly();
        await timeout(1e3);
        await acceptNextWord(model, editor, 4);
        assert.deepStrictEqual(
          editor.getValue(),
          [
            `console.log("hello" + )`,
            `console.warnnnn`,
            ``
          ].join("\n")
        );
      }
    );
  });
  test("Change hint is passed from onDidChange to provideInlineCompletions", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider, inlineSuggest: { enabled: true } },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("foo");
        provider.setReturnValue({ insertText: "foobar", range: new Range(1, 1, 1, 4) });
        model.triggerExplicitly();
        await timeout(1e3);
        const firstCallHistory = provider.getAndClearCallHistory();
        assert.strictEqual(firstCallHistory.length, 1);
        assert.strictEqual(firstCallHistory[0].changeHint, void 0);
        editor.setPosition({ lineNumber: 1, column: 3 });
        const changeHintData = { reason: "modelUpdated", version: 42 };
        provider.setReturnValue({ insertText: "foobaz", range: new Range(1, 1, 1, 4) });
        provider.fireOnDidChange({ data: changeHintData });
        await timeout(1e3);
        const secondCallHistory = provider.getAndClearCallHistory();
        assert.deepStrictEqual(
          secondCallHistory,
          [{
            changeHint: {
              data: {
                reason: "modelUpdated",
                version: 42
              }
            },
            position: "(1,3)",
            text: "foo",
            triggerKind: 0
          }]
        );
      }
    );
  });
  test("Change hint is undefined when onDidChange fires without hint", async function() {
    const provider = new MockInlineCompletionsProvider();
    await withAsyncTestCodeEditorAndInlineCompletionsModel(
      "",
      { fakeClock: true, provider, inlineSuggest: { enabled: true } },
      async ({ editor, editorViewModel, model, context }) => {
        context.keyboardType("foo");
        provider.setReturnValue({ insertText: "foobar", range: new Range(1, 1, 1, 4) });
        model.triggerExplicitly();
        await timeout(1e3);
        provider.getAndClearCallHistory();
        editor.setPosition({ lineNumber: 1, column: 3 });
        provider.setReturnValue({ insertText: "foobaz", range: new Range(1, 1, 1, 4) });
        provider.fireOnDidChange();
        await timeout(1e3);
        const callHistory = provider.getAndClearCallHistory();
        assert.deepStrictEqual(
          callHistory,
          [{
            position: "(1,3)",
            text: "foo",
            triggerKind: 0
          }]
        );
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFx0ZXN0XFxicm93c2VyXFxpbmxpbmVDb21wbGV0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGF0YUNoYW5uZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGF0YUNoYW5uZWwvY29tbW9uL2RhdGFDaGFubmVsLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsIElubGluZUNvbXBsZXRpb25zLCBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLCBQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tb2RlbC9pbmxpbmVDb21wbGV0aW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tb2RlbC9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNTb3VyY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVsL2lubGluZUNvbXBsZXRpb25zU291cmNlLmpzJztcbmltcG9ydCB7IElXaXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwsIE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IElUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuXG5zdWl0ZSgnSW5saW5lIENvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdFbWl0cyBlbXB0eSByZXNwb25zZSB0ZWxlbWV0cnkgYWZ0ZXIgaW5zdGFudGlhdGlvbiBzZXJ2aWNlIGRpc3Bvc2FsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb3ZpZGVyU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBwcm92aWRlclJlc3BvbnNlID0gbmV3IERlZmVycmVkUHJvbWlzZTxJbmxpbmVDb21wbGV0aW9ucz4oKTtcblx0XHRjb25zdCBwcm92aWRlcjogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVySWQ6IFByb3ZpZGVySWQuZnJvbUV4dGVuc2lvbklkKCdHaXRIdWIuY29waWxvdCcpLFxuXHRcdFx0cHJvdmlkZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7XG5cdFx0XHRcdHByb3ZpZGVyU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRyZXR1cm4gcHJvdmlkZXJSZXNwb25zZS5wO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2VJbmxpbmVDb21wbGV0aW9uczogKCkgPT4geyB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc2VudENoYW5uZWxJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZGF0YUNoYW5uZWxTZXJ2aWNlOiBJRGF0YUNoYW5uZWxTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRTZW5kRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdGdldERhdGFDaGFubmVsOiBjaGFubmVsSWQgPT4gKHtcblx0XHRcdFx0c2VuZERhdGE6ICgpID0+IHNlbnRDaGFubmVsSWRzLnB1c2goY2hhbm5lbElkKVxuXHRcdFx0fSlcblx0XHR9O1xuXHRcdGNvbnN0IHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lEYXRhQ2hhbm5lbFNlcnZpY2UsIGRhdGFDaGFubmVsU2VydmljZV0sXG5cdFx0XHRbSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0J2dpdGh1Yi5jb3BpbG90LmVuYWJsZSc6IHsgJyonOiB0cnVlIH0sXG5cdFx0XHR9KV0sXG5cdFx0KTtcblxuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJywgeyBwcm92aWRlciwgc2VydmljZUNvbGxlY3Rpb24gfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgbW9kZWwsIHN0b3JlLCBpbnN0YW50aWF0aW9uU2VydmljZSB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRJbmxpbmVDb21wbGV0aW9uc1NvdXJjZSxcblx0XHRcdFx0XHRtb2RlbC50ZXh0TW9kZWwsXG5cdFx0XHRcdFx0bW9kZWwuX3RleHRNb2RlbFZlcnNpb25JZCxcblx0XHRcdFx0XHR7IGdldDogKCkgPT4gMCwgdXBkYXRlOiAoKSA9PiAwLCBkZWZhdWx0OiAoKSA9PiAwIH0sXG5cdFx0XHRcdFx0b2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Q3Vyc29yUG9zaXRpb24nLCBlZGl0b3IuZ2V0UG9zaXRpb24oKSEpLFxuXHRcdFx0XHRcdCdnaXRodWIuY29waWxvdC5lbmFibGUnLFxuXHRcdFx0XHQpKTtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IHNvdXJjZS5mZXRjaChbcHJvdmlkZXJdLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHR0cmlnZ2VyS2luZDogSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkV4cGxpY2l0LFxuXHRcdFx0XHRcdHNlbGVjdGVkU3VnZ2VzdGlvbkluZm86IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlYXJsaWVzdFNob3duRGF0ZVRpbWU6IDAsXG5cdFx0XHRcdFx0aW5jbHVkZUlubGluZUNvbXBsZXRpb25zOiB0cnVlLFxuXHRcdFx0XHRcdGluY2x1ZGVJbmxpbmVFZGl0czogZmFsc2UsXG5cdFx0XHRcdFx0cmVxdWVzdElzc3VlZERhdGVUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHR9LCB1bmRlZmluZWQsIGZhbHNlLCBvYnNlcnZhYmxlVmFsdWUoJ3VzZXJKdW1wZWRUb0FjdGl2ZUNvbXBsZXRpb24nLCBmYWxzZSksIHtcblx0XHRcdFx0XHRzdGFydFRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0c2t1OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZWRpdG9yVHlwZTogSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuVGV4dEVkaXRvcixcblx0XHRcdFx0XHRsYW5ndWFnZUlkOiAncGxhaW50ZXh0Jyxcblx0XHRcdFx0XHRhdmFpbGFibGVQcm92aWRlcnM6IFtwcm92aWRlci5wcm92aWRlcklkIV0sXG5cdFx0XHRcdFx0cmVhc29uOiAnJyxcblx0XHRcdFx0XHR0eXBpbmdJbnRlcnZhbDogMCxcblx0XHRcdFx0XHR0eXBpbmdJbnRlcnZhbENoYXJhY3RlckNvdW50OiAwLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXJTdGFydGVkLnA7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXJSZXNwb25zZS5jb21wbGV0ZSh7IGl0ZW1zOiBbXSB9KTtcblx0XHRcdFx0YXdhaXQgcmVxdWVzdDtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW50Q2hhbm5lbElkcywgWydlZGl0VGVsZW1ldHJ5J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdEb2VzIG5vdCB0cmlnZ2VyIGF1dG9tYXRpY2FsbHkgaWYgZGlzYWJsZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIsIGlubGluZVN1Z2dlc3Q6IHsgZW5hYmxlZDogZmFsc2UgfSB9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0IH0pID0+IHtcblx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ2ZvbycpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXG5cdFx0XHRcdC8vIFByb3ZpZGVyIGlzIG5vdCBjYWxsZWQsIG5vIGdob3N0IHRleHQgaXMgc2hvd24uXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWycnXSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnR2hvc3QgdGV4dCBpcyBzaG93biBhZnRlciB0cmlnZ2VyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKCk7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyIH0sXG5cdFx0XHRhc3luYyAoeyBlZGl0b3IsIGVkaXRvclZpZXdNb2RlbCwgbW9kZWwsIGNvbnRleHQgfSkgPT4ge1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnZm9vJyk7XG5cdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHsgaW5zZXJ0VGV4dDogJ2Zvb2JhcicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNCkgfSk7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIFtcblx0XHRcdFx0XHR7IHBvc2l0aW9uOiAnKDEsNCknLCB0ZXh0OiAnZm9vJywgdHJpZ2dlcktpbmQ6IDEsIH1cblx0XHRcdFx0XSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWycnLCAnZm9vW2Jhcl0nXSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnR2hvc3QgdGV4dCBpcyBzaG93biBhdXRvbWF0aWNhbGx5IHdoZW4gY29uZmlndXJlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdHsgZmFrZUNsb2NrOiB0cnVlLCBwcm92aWRlciwgaW5saW5lU3VnZ2VzdDogeyBlbmFibGVkOiB0cnVlIH0gfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdmb28nKTtcblxuXHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7IGluc2VydFRleHQ6ICdmb29iYXInLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpIH0pO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpLCBbXG5cdFx0XHRcdFx0eyBwb3NpdGlvbjogJygxLDQpJywgdGV4dDogJ2ZvbycsIHRyaWdnZXJLaW5kOiAwLCB9XG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIFsnJywgJ2Zvb1tiYXJdJ10pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0dob3N0IHRleHQgaXMgdXBkYXRlZCBhdXRvbWF0aWNhbGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKCk7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyIH0sXG5cdFx0XHRhc3luYyAoeyBlZGl0b3IsIGVkaXRvclZpZXdNb2RlbCwgbW9kZWwsIGNvbnRleHQgfSkgPT4ge1xuXHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7IGluc2VydFRleHQ6ICdmb29iYXInLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpIH0pO1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnZm9vJyk7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoeyBpbnNlcnRUZXh0OiAnZm9vYml6eicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNikgfSk7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdiJyk7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdpJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIFtcblx0XHRcdFx0XHR7IHBvc2l0aW9uOiAnKDEsNCknLCB0ZXh0OiAnZm9vJywgdHJpZ2dlcktpbmQ6IDEsIH0sXG5cdFx0XHRcdFx0eyBwb3NpdGlvbjogJygxLDYpJywgdGV4dDogJ2Zvb2JpJywgdHJpZ2dlcktpbmQ6IDAsIH1cblx0XHRcdFx0XSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Y29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSxcblx0XHRcdFx0XHRbJycsICdmb29bYmFyXScsICdmb29iW2FyXScsICdmb29iaScsICdmb29iaVt6el0nXVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VuaW5kZW50IHdoaXRlc3BhY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCcgICcpO1xuXHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7IGluc2VydFRleHQ6ICdmb28nLCByYW5nZTogbmV3IFJhbmdlKDEsIDIsIDEsIDMpIH0pO1xuXHRcdFx0XHRtb2RlbC50cmlnZ2VyRXhwbGljaXRseSgpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWycnLCAnICBbZm9vXSddKTtcblxuXHRcdFx0XHRtb2RlbC5hY2NlcHQoZWRpdG9yKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgW1xuXHRcdFx0XHRcdHsgcG9zaXRpb246ICcoMSwzKScsIHRleHQ6ICcgICcsIHRyaWdnZXJLaW5kOiAxLCB9LFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIFsnIGZvbyddKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdVbmluZGVudCB0YWInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdcXHRcXHQnKTtcblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoeyBpbnNlcnRUZXh0OiAnZm9vJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAxLCAzKSB9KTtcblx0XHRcdFx0bW9kZWwudHJpZ2dlckV4cGxpY2l0bHkoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIFsnJywgJ1xcdFxcdFtmb29dJ10pO1xuXG5cdFx0XHRcdG1vZGVsLmFjY2VwdChlZGl0b3IpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpLCBbXG5cdFx0XHRcdFx0eyBwb3NpdGlvbjogJygxLDMpJywgdGV4dDogJ1xcdFxcdCcsIHRyaWdnZXJLaW5kOiAxLCB9LFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIFsnXFx0Zm9vJ10pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ05vIHVuaW5kZW50IGFmdGVyIGluZGVudGF0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKCk7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyIH0sXG5cdFx0XHRhc3luYyAoeyBlZGl0b3IsIGVkaXRvclZpZXdNb2RlbCwgbW9kZWwsIGNvbnRleHQgfSkgPT4ge1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnYnV6eiAgJyk7XG5cdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHsgaW5zZXJ0VGV4dDogJ2ZvbycsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgNiwgMSwgNykgfSk7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbJyddKTtcblxuXHRcdFx0XHRtb2RlbC5hY2NlcHQoZWRpdG9yKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgW1xuXHRcdFx0XHRcdHsgcG9zaXRpb246ICcoMSw3KScsIHRleHQ6ICdidXp6ICAnLCB0cmlnZ2VyS2luZDogMSwgfSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbXSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnTmV4dC9wcmV2aW91cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdHsgZmFrZUNsb2NrOiB0cnVlLCBwcm92aWRlciB9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0LCBsb2dnZXIgfSkgPT4ge1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnZm9vJyk7XG5cdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHsgaW5zZXJ0VGV4dDogJ2Zvb2JhcjEnLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpIH0pO1xuXHRcdFx0XHRsb2dnZXIubG9nUnVuKCgpID0+IG1vZGVsLnRyaWdnZXIoKSk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLFxuXHRcdFx0XHRcdFsnJywgJ2Zvb1tiYXIxXSddXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWVzKFtcblx0XHRcdFx0XHR7IGluc2VydFRleHQ6ICdmb29iYXIxJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSB9LFxuXHRcdFx0XHRcdHsgaW5zZXJ0VGV4dDogJ2Zvb2JpenoyJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSB9LFxuXHRcdFx0XHRcdHsgaW5zZXJ0VGV4dDogJ2Zvb2J1enozJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSB9XG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGxvZ2dlci5sb2dSdW4oKCkgPT4gbW9kZWwubmV4dCgpKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbJ2Zvb1tiaXp6Ml0nXSk7XG5cblx0XHRcdFx0bG9nZ2VyLmxvZ1J1bigoKSA9PiBtb2RlbC5uZXh0KCkpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIFsnZm9vW2J1enozXSddKTtcblxuXHRcdFx0XHRsb2dnZXIubG9nUnVuKCgpID0+IG1vZGVsLm5leHQoKSk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWydmb29bYmFyMV0nXSk7XG5cblx0XHRcdFx0bG9nZ2VyLmxvZ1J1bigoKSA9PiBtb2RlbC5wcmV2aW91cygpKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbJ2Zvb1tidXp6M10nXSk7XG5cblx0XHRcdFx0bG9nZ2VyLmxvZ1J1bigoKSA9PiBtb2RlbC5wcmV2aW91cygpKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbJ2Zvb1tiaXp6Ml0nXSk7XG5cblx0XHRcdFx0bG9nZ2VyLmxvZ1J1bigoKSA9PiBtb2RlbC5wcmV2aW91cygpKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbJ2Zvb1tiYXIxXSddKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgW1xuXHRcdFx0XHRcdHsgcG9zaXRpb246ICcoMSw0KScsIHRleHQ6ICdmb28nLCB0cmlnZ2VyS2luZDogMCwgfSxcblx0XHRcdFx0XHR7IHBvc2l0aW9uOiAnKDEsNCknLCB0ZXh0OiAnZm9vJywgdHJpZ2dlcktpbmQ6IDEsIH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbGxpbmcgdGhlIHByb3ZpZGVyIGlzIGRlYm91bmNlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdHsgZmFrZUNsb2NrOiB0cnVlLCBwcm92aWRlciB9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0IH0pID0+IHtcblx0XHRcdFx0bW9kZWwudHJpZ2dlcigpO1xuXG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdmJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNDApO1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnbycpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDQwKTtcblx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ28nKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCg0MCk7XG5cblx0XHRcdFx0Ly8gVGhlIHByb3ZpZGVyIGlzIG5vdCBjYWxsZWRcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIFtdKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDQwMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpLCBbXG5cdFx0XHRcdFx0eyBwb3NpdGlvbjogJygxLDQpJywgdGV4dDogJ2ZvbycsIHRyaWdnZXJLaW5kOiAwLCB9XG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdHByb3ZpZGVyLmFzc2VydE5vdENhbGxlZFR3aWNlV2l0aGluNTBtcygpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0JhY2tzcGFjZSBpcyBkZWJvdW5jZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIsIGlubGluZVN1Z2dlc3Q6IHsgZW5hYmxlZDogdHJ1ZSB9IH0sXG5cdFx0XHRhc3luYyAoeyBlZGl0b3IsIGVkaXRvclZpZXdNb2RlbCwgbW9kZWwsIGNvbnRleHQgfSkgPT4ge1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnZm9vJyk7XG5cblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoeyBpbnNlcnRUZXh0OiAnZm9vYmFyJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSB9KTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblxuXHRcdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IDI7IGorKykge1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG5cdFx0XHRcdFx0XHRjb250ZXh0LmxlZnREZWxldGUoKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ2JhcicpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGltZW91dCg0MDApO1xuXG5cdFx0XHRcdHByb3ZpZGVyLmFzc2VydE5vdENhbGxlZFR3aWNlV2l0aGluNTBtcygpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cblx0c3VpdGUoJ0ZvcndhcmQgU3RhYmlsaXR5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ1R5cGluZyBhZ3JlZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBUaGUgdXNlciB0eXBlcyB0aGUgdGV4dCBhcyBzdWdnZXN0ZWQgYW5kIHRoZSBwcm92aWRlciBpcyBmb3J3YXJkLXN0YWJsZVxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyIH0sXG5cdFx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoeyBpbnNlcnRUZXh0OiAnZm9vYmFyJywgfSk7XG5cdFx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ2ZvbycpO1xuXHRcdFx0XHRcdG1vZGVsLnRyaWdnZXIoKTtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpLCBbXG5cdFx0XHRcdFx0XHR7IHBvc2l0aW9uOiAnKDEsNCknLCB0ZXh0OiAnZm9vJywgdHJpZ2dlcktpbmQ6IDAsIH1cblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIFsnJywgJ2Zvb1tiYXJdJ10pO1xuXG5cdFx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ2InKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIChbJ2Zvb2JbYXJdJ10pKTtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpLCBbXG5cdFx0XHRcdFx0XHR7IHBvc2l0aW9uOiAnKDEsNSknLCB0ZXh0OiAnZm9vYicsIHRyaWdnZXJLaW5kOiAwLCB9XG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbXSk7XG5cblx0XHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnYScpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgKFsnZm9vYmFbcl0nXSkpO1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIFtcblx0XHRcdFx0XHRcdHsgcG9zaXRpb246ICcoMSw2KScsIHRleHQ6ICdmb29iYScsIHRyaWdnZXJLaW5kOiAwLCB9XG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbXSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRhc3luYyBmdW5jdGlvbiBzZXR1cFNjZW5hcmlvKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0LCBzdG9yZSB9OiBJV2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsLCBwcm92aWRlcjogTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWycnXSk7XG5cdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7IGluc2VydFRleHQ6ICdmb28gYmFyJyB9KTtcblx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdmJyk7XG5cdFx0XHRtb2RlbC50cmlnZ2VyRXhwbGljaXRseSgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMDAwMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgKFt7IHBvc2l0aW9uOiAnKDEsMiknLCB0cmlnZ2VyS2luZDogMSwgdGV4dDogJ2YnIH1dKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIChbJ2Zbb28gYmFyXSddKSk7XG5cblx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHsgaW5zZXJ0VGV4dDogJ2ZvbyBiYXonIH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMDAwMCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnU3VwcG9ydCBmb3J3YXJkIGluc3RhYmlsaXR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gVGhlIHVzZXIgdHlwZXMgdGhlIHRleHQgYXMgc3VnZ2VzdGVkIGFuZCB0aGUgcHJvdmlkZXIgcmVwb3J0cyBhIGRpZmZlcmVudCBzdWdnZXN0aW9uLlxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyIH0sXG5cdFx0XHRcdGFzeW5jIChjdHgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCBzZXR1cFNjZW5hcmlvKGN0eCwgcHJvdmlkZXIpO1xuXG5cdFx0XHRcdFx0Y3R4LmNvbnRleHQua2V5Ym9hcmRUeXBlKCdvJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdHguY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgWydmb1tvIGJhcl0nXSk7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwMCk7XG5cblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgW1xuXHRcdFx0XHRcdFx0eyBwb3NpdGlvbjogJygxLDMpJywgdGV4dDogJ2ZvJywgdHJpZ2dlcktpbmQ6IDAsIH1cblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0eC5jb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbJ2ZvW28gYmF6XSddKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXG5cdFx0dGVzdCgnd2hlbiBhY2NlcHRpbmcgd29yZCBieSB3b3JkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gVGhlIHVzZXIgdHlwZXMgdGhlIHRleHQgYXMgc3VnZ2VzdGVkIGFuZCB0aGUgcHJvdmlkZXIgcmVwb3J0cyBhIGRpZmZlcmVudCBzdWdnZXN0aW9uLlxuXHRcdFx0Ly8gRXZlbiB3aGVuIHRyaWdnZXJpbmcgZXhwbGljaXRseSwgd2Ugd2FudCB0byBrZWVwIHRoZSBzdWdnZXN0aW9uLlxuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdFx0YXN5bmMgKGN0eCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHNldHVwU2NlbmFyaW8oY3R4LCBwcm92aWRlcik7XG5cblx0XHRcdFx0XHRhd2FpdCBjdHgubW9kZWwuYWNjZXB0TmV4dFdvcmQoKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0eC5jb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCAoWydmb29bIGJhcl0nXSkpO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIChbeyBwb3NpdGlvbjogJygxLDQpJywgdHJpZ2dlcktpbmQ6IDAsIHRleHQ6ICdmb28nIH1dKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdHguY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgKFtdKSk7XG5cblx0XHRcdFx0XHRhd2FpdCBjdHgubW9kZWwudHJpZ2dlckV4cGxpY2l0bHkoKTsgLy8gcmVzZXQgdG8gcHJvdmlkZXIgdHJ1dGhcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDAwKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0eC5jb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCAoW10pKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3doZW4gYWNjZXB0aW5nIHVuZG8nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBUaGUgdXNlciB0eXBlcyB0aGUgdGV4dCBhcyBzdWdnZXN0ZWQgYW5kIHRoZSBwcm92aWRlciByZXBvcnRzIGEgZGlmZmVyZW50IHN1Z2dlc3Rpb24uXG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKCk7XG5cdFx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHRcdHsgZmFrZUNsb2NrOiB0cnVlLCBwcm92aWRlciB9LFxuXHRcdFx0XHRhc3luYyAoY3R4KSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgc2V0dXBTY2VuYXJpbyhjdHgsIHByb3ZpZGVyKTtcblxuXHRcdFx0XHRcdGF3YWl0IGN0eC5tb2RlbC5hY2NlcHROZXh0V29yZCgpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3R4LmNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIChbJ2Zvb1sgYmFyXSddKSk7XG5cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDAwKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN0eC5jb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCAoW10pKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgKFt7IHBvc2l0aW9uOiAnKDEsNCknLCB0cmlnZ2VyS2luZDogMCwgdGV4dDogJ2ZvbycgfV0pKTtcblxuXHRcdFx0XHRcdGF3YWl0IGN0eC5lZGl0b3IuZ2V0TW9kZWwoKS51bmRvKCk7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdHguY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgKFsnZltvbyBiYXJdJ10pKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgKFt7IHBvc2l0aW9uOiAnKDEsMiknLCB0cmlnZ2VyS2luZDogMCwgdGV4dDogJ2YnIH1dKSk7XG5cblx0XHRcdFx0XHRhd2FpdCBjdHguZWRpdG9yLmdldE1vZGVsKCkucmVkbygpO1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMDApO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3R4LmNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIChbJ2Zvb1sgYmFyXSddKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIChbeyBwb3NpdGlvbjogJygxLDQpJywgdHJpZ2dlcktpbmQ6IDAsIHRleHQ6ICdmb28nIH1dKSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTdXBwb3J0IGJhY2t3YXJkIGluc3RhYmlsaXR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gVGhlIHVzZXIgZGVsZXRlcyB0ZXh0IGFuZCB0aGUgc3VnZ2VzdGlvbiBjaGFuZ2VzXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0IH0pID0+IHtcblx0XHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnZm9vYmEnKTtcblxuXHRcdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHsgaW5zZXJ0VGV4dDogJ2Zvb2JhcicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNikgfSk7XG5cblx0XHRcdFx0XHRtb2RlbC50cmlnZ2VyRXhwbGljaXRseSgpO1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIFtcblx0XHRcdFx0XHRcdHsgcG9zaXRpb246ICcoMSw2KScsIHRleHQ6ICdmb29iYScsIHRyaWdnZXJLaW5kOiAxLCB9XG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbJycsICdmb29iYVtyXSddKTtcblxuXHRcdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHsgaW5zZXJ0VGV4dDogJ2Zvb2JheicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNSkgfSk7XG5cdFx0XHRcdFx0Y29udGV4dC5sZWZ0RGVsZXRlKCk7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgW1xuXHRcdFx0XHRcdFx0eyBwb3NpdGlvbjogJygxLDUpJywgdGV4dDogJ2Zvb2InLCB0cmlnZ2VyS2luZDogMCwgfVxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgW1xuXHRcdFx0XHRcdFx0J2Zvb2JbYXJdJyxcblx0XHRcdFx0XHRcdCdmb29iW2F6XSdcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1B1c2ggaXRlbSB0byBwcmVzZXJ2ZSB0byBmcm9udCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKHRydWUpO1xuXHRcdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0IH0pID0+IHtcblx0XHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7IGluc2VydFRleHQ6ICdmb29iYXInLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpIH0pO1xuXHRcdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdmb28nKTtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIChbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnKDEsNCknLFxuXHRcdFx0XHRcdFx0XHR0cmlnZ2VyS2luZDogMCxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ2Zvbydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLFxuXHRcdFx0XHRcdFx0KFtcblx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdCdmb29bYmFyXSdcblx0XHRcdFx0XHRcdF0pXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlcyhbeyBpbnNlcnRUZXh0OiAnZm9vYmFyMScsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNCkgfSwgeyBpbnNlcnRUZXh0OiAnZm9vYmFyJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSB9XSk7XG5cblx0XHRcdFx0XHRhd2FpdCBtb2RlbC50cmlnZ2VyRXhwbGljaXRseSgpO1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKSwgKFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICcoMSw0KScsXG5cdFx0XHRcdFx0XHRcdHRyaWdnZXJLaW5kOiAxLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnZm9vJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF0pKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksXG5cdFx0XHRcdFx0XHQoW10pXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTm8gcmFjZSBjb25kaXRpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKCk7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyLCB9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0IH0pID0+IHtcblx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ2gnKTtcblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoeyBpbnNlcnRUZXh0OiAnaGVsbG93b3JsZCcsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMikgfSwgMTAwMCk7XG5cblx0XHRcdFx0bW9kZWwudHJpZ2dlckV4cGxpY2l0bHkoKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMzApO1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnZWxsbycpO1xuXHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7IGluc2VydFRleHQ6ICdoZWxsb3dvcmxkJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSB9LCAxMDAwKTtcblxuXHRcdFx0XHQvLyBhZnRlciAyMG1zOiBJbmxpbmUgY29tcGxldGlvbiBwcm92aWRlciBhbnN3ZXJzIGJhY2tcblx0XHRcdFx0Ly8gYWZ0ZXIgNTBtczogRGVib3VuY2UgaXMgdHJpZ2dlcmVkXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMjAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmdldEFuZENsZWFyVmlld1N0YXRlcygpLCBbXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0J2hlbGxvW3dvcmxkXScsXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RvIG5vdCByZXVzZSBjYWNoZSBmcm9tIHByZXZpb3VzIHNlc3Npb24gKCMxMzI1MTYpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKCk7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyLCBpbmxpbmVTdWdnZXN0OiB7IGVuYWJsZWQ6IHRydWUgfSB9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0IH0pID0+IHtcblx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ2hlbGxvXFxuJyk7XG5cdFx0XHRcdGNvbnRleHQuY3Vyc29yTGVmdCgpO1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgneCcpO1xuXHRcdFx0XHRjb250ZXh0LmxlZnREZWxldGUoKTtcblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoeyBpbnNlcnRUZXh0OiAnaGVsbG93b3JsZCcsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNikgfSwgMTAwMCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMjAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogJygxLDYpJyxcblx0XHRcdFx0XHRcdHRleHQ6ICdoZWxsb1xcbicsXG5cdFx0XHRcdFx0XHR0cmlnZ2VyS2luZDogMCxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHsgaW5zZXJ0VGV4dDogJ2hlbGxvd29ybGQnLCByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDYpIH0sIDEwMDApO1xuXG5cdFx0XHRcdGNvbnRleHQuY3Vyc29yRG93bigpO1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnaGVsbG8nKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCg0MCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIFtdKTtcblxuXHRcdFx0XHQvLyBVcGRhdGUgZ2hvc3QgdGV4dFxuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgndycpO1xuXHRcdFx0XHRjb250ZXh0LmxlZnREZWxldGUoKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDIwMDApO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpLCBbXG5cdFx0XHRcdFx0eyBwb3NpdGlvbjogJygyLDYpJywgdHJpZ2dlcktpbmQ6IDAsIHRleHQ6ICdoZWxsb1xcbmhlbGxvJyB9LFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZ2V0QW5kQ2xlYXJWaWV3U3RhdGVzKCksIFtcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnaGVsbG9bd29ybGRdXFxuJyxcblx0XHRcdFx0XHQnaGVsbG9cXG4nLFxuXHRcdFx0XHRcdCdoZWxsb1xcbmhlbGxvW3dvcmxkXScsXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FkZGl0aW9uYWwgVGV4dCBFZGl0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdHsgZmFrZUNsb2NrOiB0cnVlLCBwcm92aWRlciB9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0IH0pID0+IHtcblx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ2J1enpcXG5iYXonKTtcblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoe1xuXHRcdFx0XHRcdGluc2VydFRleHQ6ICdiYXp6Jyxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDQpLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxUZXh0RWRpdHM6IFt7XG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDUpLFxuXHRcdFx0XHRcdFx0dGV4dDogJ2JsYSdcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0bW9kZWwuYWNjZXB0KGVkaXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRBbmRDbGVhckNhbGxIaXN0b3J5KCksIChbeyBwb3NpdGlvbjogJygyLDQpJywgdHJpZ2dlcktpbmQ6IDEsIHRleHQ6ICdidXp6XFxuYmF6JyB9XSkpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5nZXRBbmRDbGVhclZpZXdTdGF0ZXMoKSwgW1xuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCdidXp6XFxuYmF6W3pdJyxcblx0XHRcdFx0XHQnYmxhXFxuYmF6eicsXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdNdWx0aSBDdXJzb3IgU3VwcG9ydCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnQmFzaWMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdjb25zb2xlXFxuY29uc29sZVxcbicpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMDAwLCAxLCAxMDAwKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEwMDAsIDIsIDEwMDApLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoe1xuXHRcdFx0XHRcdGluc2VydFRleHQ6ICdjb25zb2xlLmxvZyhcImhlbGxvXCIpOycsXG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxMDAwKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cdFx0XHRcdG1vZGVsLmFjY2VwdChlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGVkaXRvci5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdGBjb25zb2xlLmxvZyhcImhlbGxvXCIpO2AsXG5cdFx0XHRcdFx0XHRgY29uc29sZS5sb2coXCJoZWxsb1wiKTtgLFxuXHRcdFx0XHRcdFx0YGBcblx0XHRcdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGkgUGFydCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdHsgZmFrZUNsb2NrOiB0cnVlLCBwcm92aWRlciB9LFxuXHRcdFx0YXN5bmMgKHsgZWRpdG9yLCBlZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCBjb250ZXh0IH0pID0+IHtcblx0XHRcdFx0Y29udGV4dC5rZXlib2FyZFR5cGUoJ2NvbnNvbGUubG9nKClcXG5jb25zb2xlLmxvZ1xcbicpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTAwMCwgMiwgMTAwMCksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ2NvbnNvbGUubG9nKFwiaGVsbG9cIik7Jyxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEwMDApLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0bW9kZWwudHJpZ2dlckV4cGxpY2l0bHkoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdFx0bW9kZWwuYWNjZXB0KGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0ZWRpdG9yLmdldFZhbHVlKCksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0YGNvbnNvbGUubG9nKFwiaGVsbG9cIik7YCxcblx0XHRcdFx0XHRcdGBjb25zb2xlLmxvZ2AsXG5cdFx0XHRcdFx0XHRgYFxuXHRcdFx0XHRcdF0uam9pbignXFxuJylcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aSBQYXJ0IGFuZCBEaWZmZXJlbnQgQ3Vyc29yIENvbHVtbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdjb25zb2xlLmxvZygpXFxuY29uc29sZS53YXJuXFxuJyk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMiksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxNCwgMiwgMTQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoe1xuXHRcdFx0XHRcdGluc2VydFRleHQ6ICdjb25zb2xlLmxvZyhcImhlbGxvXCIpOycsXG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxMDAwKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cdFx0XHRcdG1vZGVsLmFjY2VwdChlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGVkaXRvci5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdGBjb25zb2xlLmxvZyhcImhlbGxvXCIpO2AsXG5cdFx0XHRcdFx0XHRgY29uc29sZS53YXJuYCxcblx0XHRcdFx0XHRcdGBgXG5cdFx0XHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGFjY2VwdE5leHRXb3JkKG1vZGVsOiBJbmxpbmVDb21wbGV0aW9uc01vZGVsLCBlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdGltZXNUb0FjY2VwdDogbnVtYmVyID0gMSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGltZXNUb0FjY2VwdDsgaSsrKSB7XG5cdFx0XHRtb2RlbC50cmlnZ2VyRXhwbGljaXRseSgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblx0XHRcdGF3YWl0IG1vZGVsLmFjY2VwdE5leHRXb3JkKCk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnQmFzaWMgUGFydGlhbCBDb21wbGV0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1vY2tJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKCk7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3JBbmRJbmxpbmVDb21wbGV0aW9uc01vZGVsKCcnLFxuXHRcdFx0eyBmYWtlQ2xvY2s6IHRydWUsIHByb3ZpZGVyIH0sXG5cdFx0XHRhc3luYyAoeyBlZGl0b3IsIGVkaXRvclZpZXdNb2RlbCwgbW9kZWwsIGNvbnRleHQgfSkgPT4ge1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnbGV0XFxubGV0XFxuJyk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEwMDAsIDEsIDEwMDApLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTAwMCwgMiwgMTAwMCksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiBgbGV0IGEgPSAnc29tZSB3b3JkJzsgYCxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEwMDApLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhd2FpdCBhY2NlcHROZXh0V29yZChtb2RlbCwgZWRpdG9yLCAyKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGVkaXRvci5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdGBsZXQgYWAsXG5cdFx0XHRcdFx0XHRgbGV0IGFgLFxuXHRcdFx0XHRcdFx0YGBcblx0XHRcdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnUGFydGlhbCBNdWx0aS1QYXJ0IENvbXBsZXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdmb3IgKClcXG5mb3IgXFxuJyk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTAwMCwgMiwgMTAwMCksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiBgZm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7YCxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEwMDApLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2RlbC50cmlnZ2VyRXhwbGljaXRseSgpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXG5cdFx0XHRcdGF3YWl0IGFjY2VwdE5leHRXb3JkKG1vZGVsLCBlZGl0b3IsIDMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0ZWRpdG9yLmdldFZhbHVlKCksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0YGZvciAobGV0IGkpYCxcblx0XHRcdFx0XHRcdGBmb3IgYCxcblx0XHRcdFx0XHRcdGBgXG5cdFx0XHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BhcnRpYWwgTXV0bGktUGFydCBhbmQgRGlmZmVyZW50IEN1cnNvciBDb2x1bW5zIENvbXBsZXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIgfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKGBjb25zb2xlLmxvZygpXFxuY29uc29sZS53YXJubm5uXFxuYCk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMiksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxNiwgMiwgMTYpLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogYGNvbnNvbGUubG9nKFwiaGVsbG9cIiArIFwiIFwiICsgXCJ3b3JsZFwiKTtgLFxuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTAwMCksXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0YXdhaXQgYWNjZXB0TmV4dFdvcmQobW9kZWwsIGVkaXRvciwgNCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRlZGl0b3IuZ2V0VmFsdWUoKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRgY29uc29sZS5sb2coXCJoZWxsb1wiICsgKWAsXG5cdFx0XHRcdFx0XHRgY29uc29sZS53YXJubm5uYCxcblx0XHRcdFx0XHRcdGBgXG5cdFx0XHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZSBoaW50IGlzIHBhc3NlZCBmcm9tIG9uRGlkQ2hhbmdlIHRvIHByb3ZpZGVJbmxpbmVDb21wbGV0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNb2NrSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcigpO1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yQW5kSW5saW5lQ29tcGxldGlvbnNNb2RlbCgnJyxcblx0XHRcdHsgZmFrZUNsb2NrOiB0cnVlLCBwcm92aWRlciwgaW5saW5lU3VnZ2VzdDogeyBlbmFibGVkOiB0cnVlIH0gfSxcblx0XHRcdGFzeW5jICh7IGVkaXRvciwgZWRpdG9yVmlld01vZGVsLCBtb2RlbCwgY29udGV4dCB9KSA9PiB7XG5cdFx0XHRcdGNvbnRleHQua2V5Ym9hcmRUeXBlKCdmb28nKTtcblx0XHRcdFx0cHJvdmlkZXIuc2V0UmV0dXJuVmFsdWUoeyBpbnNlcnRUZXh0OiAnZm9vYmFyJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSB9KTtcblx0XHRcdFx0bW9kZWwudHJpZ2dlckV4cGxpY2l0bHkoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblxuXHRcdFx0XHRjb25zdCBmaXJzdENhbGxIaXN0b3J5ID0gcHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RDYWxsSGlzdG9yeS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGZpcnN0Q2FsbEhpc3RvcnlbMF0gYXMgeyBjaGFuZ2VIaW50PzogdW5rbm93biB9KS5jaGFuZ2VIaW50LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdC8vIENoYW5nZSBjdXJzb3IgcG9zaXRpb24gdG8gYXZvaWQgY2FjaGUgaGl0XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMyB9KTtcblxuXG5cdFx0XHRcdGNvbnN0IGNoYW5nZUhpbnREYXRhID0geyByZWFzb246ICdtb2RlbFVwZGF0ZWQnLCB2ZXJzaW9uOiA0MiB9O1xuXHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7IGluc2VydFRleHQ6ICdmb29iYXonLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpIH0pO1xuXHRcdFx0XHRwcm92aWRlci5maXJlT25EaWRDaGFuZ2UoeyBkYXRhOiBjaGFuZ2VIaW50RGF0YSB9KTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblxuXHRcdFx0XHRjb25zdCBzZWNvbmRDYWxsSGlzdG9yeSA9IHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHNlY29uZENhbGxIaXN0b3J5LFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRjaGFuZ2VIaW50OiB7XG5cdFx0XHRcdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRcdFx0XHRyZWFzb246ICdtb2RlbFVwZGF0ZWQnLFxuXHRcdFx0XHRcdFx0XHRcdHZlcnNpb246IDQyLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cG9zaXRpb246ICcoMSwzKScsXG5cdFx0XHRcdFx0XHR0ZXh0OiAnZm9vJyxcblx0XHRcdFx0XHRcdHRyaWdnZXJLaW5kOiAwXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2UgaGludCBpcyB1bmRlZmluZWQgd2hlbiBvbkRpZENoYW5nZSBmaXJlcyB3aXRob3V0IGhpbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTW9ja0lubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoKTtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvckFuZElubGluZUNvbXBsZXRpb25zTW9kZWwoJycsXG5cdFx0XHR7IGZha2VDbG9jazogdHJ1ZSwgcHJvdmlkZXIsIGlubGluZVN1Z2dlc3Q6IHsgZW5hYmxlZDogdHJ1ZSB9IH0sXG5cdFx0XHRhc3luYyAoeyBlZGl0b3IsIGVkaXRvclZpZXdNb2RlbCwgbW9kZWwsIGNvbnRleHQgfSkgPT4ge1xuXHRcdFx0XHRjb250ZXh0LmtleWJvYXJkVHlwZSgnZm9vJyk7XG5cdFx0XHRcdHByb3ZpZGVyLnNldFJldHVyblZhbHVlKHsgaW5zZXJ0VGV4dDogJ2Zvb2JhcicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNCkgfSk7XG5cdFx0XHRcdG1vZGVsLnRyaWdnZXJFeHBsaWNpdGx5KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRcdFx0cHJvdmlkZXIuZ2V0QW5kQ2xlYXJDYWxsSGlzdG9yeSgpO1xuXG5cdFx0XHRcdC8vIENoYW5nZSBjdXJzb3IgcG9zaXRpb24gdG8gYXZvaWQgY2FjaGUgaGl0XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMyB9KTtcblxuXHRcdFx0XHRwcm92aWRlci5zZXRSZXR1cm5WYWx1ZSh7IGluc2VydFRleHQ6ICdmb29iYXonLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpIH0pO1xuXHRcdFx0XHRwcm92aWRlci5maXJlT25EaWRDaGFuZ2UoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsSGlzdG9yeSA9IHByb3ZpZGVyLmdldEFuZENsZWFyQ2FsbEhpc3RvcnkoKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGNhbGxIaXN0b3J5LFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogJygxLDMpJyxcblx0XHRcdFx0XHRcdHRleHQ6ICdmb28nLFxuXHRcdFx0XHRcdFx0dHJpZ2dlcktpbmQ6IDBcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUIsZUFBZTtBQUN6QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsNkJBQTJFLGtCQUFrQjtBQUV0RyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLCtCQUErQjtBQUN4QyxTQUE0RCwrQkFBK0Isd0RBQXdEO0FBRW5KLFNBQVMsaUJBQWlCO0FBRTFCLE1BQU0sc0JBQXNCLE1BQU07QUFDakMsMENBQXdDO0FBRXhDLE9BQUssdUVBQXVFLGlCQUFrQjtBQUM3RixVQUFNLGtCQUFrQixJQUFJLGdCQUFzQjtBQUNsRCxVQUFNLG1C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
