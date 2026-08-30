import assert from "assert";
import { CancellationToken } from "../../../../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { EditorOptions } from "../../../../../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../../../editor/common/core/range.js";
import { CompletionItemKind, CompletionTriggerKind } from "../../../../../../../../editor/common/languages.js";
import { LanguageFeaturesService } from "../../../../../../../../editor/common/services/languageFeaturesService.js";
import { createTextModel } from "../../../../../../../../editor/test/common/testTextModel.js";
import { AgentHostInputCompletionsBase } from "../../../../../browser/widget/input/editor/agentHostInputCompletionsBase.js";
import { AgentHostInputCompletions } from "../../../../../browser/widget/input/editor/agentHostInputCompletions.js";
import { createChatReferenceVariableEntry } from "../../../../../common/attachments/chatVariableEntries.js";
import { attachedContextCompletionAdditionalTriggerCharacters, attachedContextCompletionSortText, computeCompletionRanges, escapeForCharClass, getAttachedContextCompletionMatch, getAttachedContextCompletionSortText, getCompletionRangeWord, isAtTriggerCharacterToken } from "../../../../../browser/widget/input/editor/chatInputCompletionUtils.js";
import { chatAgentLeader, chatVariableLeader } from "../../../../../common/requestParser/chatParserTypes.js";
import { MockChatSessionsService } from "../../../../common/mockChatSessionsService.js";
import { MockChatWidgetService } from "../../../widget/mockChatWidget.js";
import { TestConfigurationService } from "../../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { upcastPartial } from "../../../../../../../../base/test/common/mock.js";
class TestChatSessionsService extends MockChatSessionsService {
  constructor(insertText = "#roadmap.md") {
    super();
    this.insertText = insertText;
  }
  async provideChatInputCompletions(_sessionResource, _params, _token) {
    return {
      items: [{
        insertText: this.insertText,
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 2 },
        attachment: {
          kind: "resource",
          uri: URI.file("/workspace/roadmap.md")
        }
      }]
    };
  }
}
class OrderedTestChatSessionsService extends MockChatSessionsService {
  async provideChatInputCompletions(_sessionResource, _params, _token) {
    return {
      items: [
        {
          insertText: "#z-index.ts",
          start: { lineNumber: 1, column: 1 },
          end: { lineNumber: 1, column: 11 },
          attachment: { kind: "resource", uri: URI.file("/long/workspace/src/index.ts") }
        },
        {
          insertText: "#a-index.ts",
          start: { lineNumber: 1, column: 1 },
          end: { lineNumber: 1, column: 11 },
          attachment: { kind: "resource", uri: URI.file("/src/index.ts") }
        }
      ]
    };
  }
}
class TestAgentHostInputCompletions extends AgentHostInputCompletionsBase {
  constructor(languageFeaturesService, chatSessionsService, _completionKind = CompletionItemKind.File, _triggerCharacters = ["#"]) {
    super(languageFeaturesService, chatSessionsService);
    this._completionKind = _completionKind;
    this._triggerCharacters = _triggerCharacters;
  }
  register() {
    return this._registerProvider({ scheme: "test" }, "testAgentHostInputCompletions", this._triggerCharacters, void 0);
  }
  _resolveContext(_model) {
    return { sessionResource: URI.parse("test:session"), context: void 0 };
  }
  _buildItem(position, item) {
    return {
      label: item.insertText,
      insertText: item.insertText,
      filterText: this._completionKind === CompletionItemKind.Text ? item.insertText : void 0,
      range: Range.fromPositions(position),
      kind: this._completionKind
    };
  }
}
suite("AgentHostInputCompletionsBase", () => {
  const store = new DisposableStore();
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("marks results incomplete so the host is queried as the token changes", async () => {
    const languageFeaturesService = new LanguageFeaturesService();
    const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new TestChatSessionsService()));
    store.add(completions.register());
    const model = store.add(createTextModel("#", null, void 0, URI.parse("test:input")));
    const provider = languageFeaturesService.completionProvider.ordered(model)[0];
    const result = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: "#" }, CancellationToken.None);
    assert.deepStrictEqual(result, {
      suggestions: [{
        label: "#roadmap.md",
        insertText: "#roadmap.md",
        filterText: "#",
        sortText: "000000",
        range: new Range(1, 2, 1, 2),
        kind: CompletionItemKind.File
      }],
      incomplete: true
    });
  });
  test("preserves slash command filter text so Monaco can fuzzy rank it", async () => {
    const languageFeaturesService = new LanguageFeaturesService();
    const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new TestChatSessionsService("/vscode-pet"), CompletionItemKind.Text, ["/"]));
    store.add(completions.register());
    const model = store.add(createTextModel("/pet", null, void 0, URI.parse("test:input")));
    const provider = languageFeaturesService.completionProvider.ordered(model)[0];
    const result = await provider.provideCompletionItems(model, new Position(1, 5), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None);
    assert.deepStrictEqual(result, {
      suggestions: [{
        label: "/vscode-pet",
        insertText: "/vscode-pet",
        filterText: "/vscode-pet",
        sortText: "000000",
        range: new Range(1, 5, 1, 5),
        kind: CompletionItemKind.Text
      }],
      incomplete: true
    });
  });
  test("uses a common current-token filter score to preserve host order", async () => {
    const languageFeaturesService = new LanguageFeaturesService();
    const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new OrderedTestChatSessionsService()));
    store.add(completions.register());
    const model = store.add(createTextModel("#src/index", null, void 0, URI.parse("test:input")));
    const provider = languageFeaturesService.completionProvider.ordered(model)[0];
    const result = await provider.provideCompletionItems(model, new Position(1, 11), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None);
    assert.deepStrictEqual(result?.suggestions.map((item) => ({
      label: item.label,
      filterText: item.filterText,
      sortText: item.sortText
    })), [
      { label: "#z-index.ts", filterText: "#src/index", sortText: "000000" },
      { label: "#a-index.ts", filterText: "#src/index", sortText: "000001" }
    ]);
  });
});
class TestableAgentHostInputCompletions extends AgentHostInputCompletions {
  buildItem(position, item, widget) {
    return this._buildItem(position, item, widget);
  }
}
suite("AgentHostInputCompletions #chat references", () => {
  const store = new DisposableStore();
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepting a multi-word #chat reference registers a range covering the whole token", () => {
    const completions = store.add(new TestableAgentHostInputCompletions(
      new LanguageFeaturesService(),
      new MockChatWidgetService(),
      new TestChatSessionsService(),
      new TestConfigurationService()
    ));
    const widget = upcastPartial({});
    const chatResource = URI.parse("ahp-chat://chat-2/base64session");
    const built = completions.buildItem(new Position(1, 19), {
      insertText: "#chat:Design chat ",
      start: { lineNumber: 1, column: 1 },
      end: { lineNumber: 1, column: 19 },
      attachment: {
        kind: "chat",
        uri: chatResource,
        endTurn: "turn-5",
        title: "Design chat"
      }
    }, widget);
    const argument = built?.command?.arguments?.[0];
    assert.deepStrictEqual({ id: argument?.id, range: argument?.range }, {
      // Stable dynamic-variable id, so the parser treats the reference as one part.
      id: createChatReferenceVariableEntry(chatResource, "turn-5", "Design chat").id,
      // Covers `#chat:Design chat` (columns 1..18, end-exclusive) — the whole
      // token minus the trailing space, never a partial slice.
      range: new Range(1, 1, 1, 18)
    });
  });
});
suite("escapeForCharClass", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes through simple characters unchanged", () => {
    assert.strictEqual(escapeForCharClass("a"), "a");
    assert.strictEqual(escapeForCharClass("#"), "#");
    assert.strictEqual(escapeForCharClass("@"), "@");
  });
  test("escapes backslash", () => {
    assert.strictEqual(escapeForCharClass("\\"), "\\\\");
  });
  test("escapes closing bracket", () => {
    assert.strictEqual(escapeForCharClass("]"), "\\]");
  });
  test("escapes caret", () => {
    assert.strictEqual(escapeForCharClass("^"), "\\^");
  });
  test("escapes hyphen", () => {
    assert.strictEqual(escapeForCharClass("-"), "\\-");
  });
  test("escapes multiple special chars in one string", () => {
    assert.strictEqual(escapeForCharClass("-^]\\"), "\\-\\^\\]\\\\");
  });
  test("is safe to use for chatVariableLeader and chatAgentLeader", () => {
    const escaped = `[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]`;
    const re = new RegExp(escaped);
    assert.ok(re.test("#"));
    assert.ok(re.test("@"));
    assert.ok(!re.test("a"));
    assert.ok(!re.test("/"));
  });
});
suite("attached context completion ranking", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const suggestOptions = EditorOptions.suggest.defaultValue;
  test("sorts before other chat input completions", () => {
    assert.ok(attachedContextCompletionSortText < " ");
  });
  test("filters attachments before matching the current token exactly", () => {
    assert.deepStrictEqual({
      at: getAttachedContextCompletionMatch("@", "@", "Screen Recording.mov", "file", suggestOptions)?.filterText,
      atAttachment: getAttachedContextCompletionMatch("@att", "@", "Screen Recording.mov", "file", suggestOptions)?.filterText,
      hashName: getAttachedContextCompletionMatch("#screen", "#", "Screen Recording.mov", "file", suggestOptions)?.filterText,
      hashAttachment: getAttachedContextCompletionMatch("#att", "#", "Screen Recording.mov", "file", suggestOptions)?.filterText,
      unmatched: getAttachedContextCompletionMatch("#xyz", "#", "Screen Recording.mov", "file", suggestOptions)?.filterText
    }, {
      at: "@",
      atAttachment: "@att",
      hashName: "#screen",
      hashAttachment: "#att",
      unmatched: void 0
    });
  });
  test("honors graceful Suggest filtering", () => {
    assert.deepStrictEqual({
      graceful: getAttachedContextCompletionMatch("#attahcment", "#", "Screen Recording.mov", "file", suggestOptions)?.filterText,
      strict: getAttachedContextCompletionMatch("#attahcment", "#", "Screen Recording.mov", "file", { ...suggestOptions, filterGraceful: false })?.filterText
    }, {
      graceful: "#attahcment",
      strict: void 0
    });
  });
  test("refreshes across supported punctuation", () => {
    assert.deepStrictEqual({
      triggerCharacters: attachedContextCompletionAdditionalTriggerCharacters,
      colon: getAttachedContextCompletionMatch("#attachment:", "#", "Screen Recording.mov", "file", suggestOptions)?.filterText,
      hyphen: getAttachedContextCompletionMatch("#attachment:screen-", "#", "Screen-Recording.mov", "file", suggestOptions)?.filterText
    }, {
      triggerCharacters: [":", "-"],
      colon: "#attachment:",
      hyphen: "#attachment:screen-"
    });
  });
  test("uses only the token prefix through an interior cursor", () => {
    const range = {
      insert: new Range(1, 1, 1, 5),
      replace: new Range(1, 1, 1, 8),
      varWord: { word: "#attxyz", startColumn: 1, endColumn: 8 }
    };
    const typedWord = getCompletionRangeWord(range);
    assert.deepStrictEqual({
      typedWord,
      filterText: typedWord === void 0 ? void 0 : getAttachedContextCompletionMatch(typedWord, "#", "Screen Recording.mov", "file", suggestOptions)?.filterText
    }, {
      typedWord: "#att",
      filterText: "#att"
    });
  });
  test("preserves fuzzy relevance between attached contexts", () => {
    const strongMatch = getAttachedContextCompletionMatch("#readme", "#", "README.md", "file", suggestOptions);
    const weakMatch = getAttachedContextCompletionMatch("#readme", "#", "Areadme-copy.txt", "file", suggestOptions);
    assert.deepStrictEqual({
      matches: !!strongMatch && !!weakMatch,
      strongBeforeWeak: !!strongMatch && !!weakMatch && getAttachedContextCompletionSortText(strongMatch.score) < getAttachedContextCompletionSortText(weakMatch.score),
      weakBeforeAgentHost: !!weakMatch && getAttachedContextCompletionSortText(weakMatch.score) < "000000"
    }, {
      matches: true,
      strongBeforeWeak: true,
      weakBeforeAgentHost: true
    });
  });
});
suite("computeCompletionRanges", () => {
  let store;
  setup(() => {
    store = new DisposableStore();
  });
  teardown(() => {
    store.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function variableNameDef() {
    return new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][\\w:-]*`, "g");
  }
  function fileWordPattern() {
    return new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, "g");
  }
  function toolVariableNameDef() {
    return new RegExp(`(?<=^|\\s)[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]\\w*`, "g");
  }
  suite("with VariableNameDef regex", () => {
    test("matches #variable at start of line", () => {
      const model = store.add(createTextModel("#file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 6), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 1, 1, 6),
        replace: new Range(1, 1, 1, 6),
        varWord: { word: "#file", startColumn: 1, endColumn: 6 }
      });
    });
    test("matches @variable at start of line", () => {
      const model = store.add(createTextModel("@file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 6), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 1, 1, 6),
        replace: new Range(1, 1, 1, 6),
        varWord: { word: "@file", startColumn: 1, endColumn: 6 }
      });
    });
    test("matches #variable mid-line after space", () => {
      const model = store.add(createTextModel("hello #file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 12), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 7, 1, 12),
        replace: new Range(1, 7, 1, 12),
        varWord: { word: "#file", startColumn: 7, endColumn: 12 }
      });
    });
    test("matches @variable mid-line after space", () => {
      const model = store.add(createTextModel("hello @file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 12), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 7, 1, 12),
        replace: new Range(1, 7, 1, 12),
        varWord: { word: "@file", startColumn: 7, endColumn: 12 }
      });
    });
    test("matches # alone (just the leader)", () => {
      const model = store.add(createTextModel("#", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 2), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#");
    });
    test("matches @ alone (just the leader)", () => {
      const model = store.add(createTextModel("@", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 2), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@");
    });
    test("matches variable with colons and hyphens", () => {
      const model = store.add(createTextModel("#file:test-1", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 13), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#file:test-1");
    });
    test("cursor in middle of variable produces partial insert range", () => {
      const model = store.add(createTextModel("@selection", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 5), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 1, 1, 5),
        replace: new Range(1, 1, 1, 11),
        varWord: { word: "@selection", startColumn: 1, endColumn: 11 }
      });
    });
  });
  suite("with fileWordPattern regex", () => {
    test("matches #file:path/to/file.ts", () => {
      const model = store.add(createTextModel("#file:path/to/file.ts", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 22), fileWordPattern());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#file:path/to/file.ts");
    });
    test("matches @file:path/to/file.ts", () => {
      const model = store.add(createTextModel("@file:path/to/file.ts", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 22), fileWordPattern());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@file:path/to/file.ts");
    });
    test("stops at whitespace", () => {
      const model = store.add(createTextModel("#file:test rest", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 11), fileWordPattern());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#file:test");
    });
  });
  suite("with toolVariableNameDef regex", () => {
    test("matches #tool at start of line", () => {
      const model = store.add(createTextModel("#tool", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 6), toolVariableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#tool");
    });
    test("matches @tool at start of line", () => {
      const model = store.add(createTextModel("@tool", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 6), toolVariableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@tool");
    });
    test("matches #tool after space", () => {
      const model = store.add(createTextModel("use #fetch", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 11), toolVariableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#fetch");
    });
    test("matches @tool after space", () => {
      const model = store.add(createTextModel("use @fetch", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 11), toolVariableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@fetch");
    });
  });
  suite("edge cases", () => {
    test("returns undefined inside a normal word", () => {
      const model = store.add(createTextModel("hello", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 3), variableNameDef());
      assert.strictEqual(result, void 0);
    });
    test("returns undefined when no space before cursor mid-line", () => {
      const model = store.add(createTextModel("ab", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 3), variableNameDef());
      assert.strictEqual(result, void 0);
    });
    test("returns empty range at blank position after space", () => {
      const model = store.add(createTextModel("hello ", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 7), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord, null);
      assert.deepStrictEqual(result.insert, Range.fromPositions(new Position(1, 7)));
    });
    test("returns empty range at start of empty line", () => {
      const model = store.add(createTextModel("", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 1), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord, null);
    });
    test("onlyOnWordStart=true rejects variable preceded by a word", () => {
      const model = store.add(createTextModel("abc#file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 9), variableNameDef(), true);
      assert.strictEqual(result, void 0);
    });
    test("onlyOnWordStart=true accepts variable after space", () => {
      const model = store.add(createTextModel("abc #file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 10), variableNameDef(), true);
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#file");
    });
    test("onlyOnWordStart=true accepts @variable after space", () => {
      const model = store.add(createTextModel("abc @file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 10), variableNameDef(), true);
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@file");
    });
  });
});
suite("isAtTriggerCharacterToken", () => {
  let store;
  setup(() => {
    store = new DisposableStore();
  });
  teardown(() => {
    store.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  const triggerChars = ["@", "#"];
  function check(text, column, expected) {
    const model = store.add(createTextModel(text, null, void 0, URI.parse("test:input")));
    assert.strictEqual(
      isAtTriggerCharacterToken(model, new Position(1, column), triggerChars),
      expected,
      `text=${JSON.stringify(text)} column=${column}`
    );
  }
  test("cursor right after a trigger character at start of line", () => {
    check("@", 2, true);
  });
  test("cursor inside a trigger-led token at start of line", () => {
    check("@file", 4, true);
  });
  test("cursor at end of a trigger-led token at start of line", () => {
    check("@file", 6, true);
  });
  test("cursor inside a trigger-led token mid-line", () => {
    check("hello @file", 10, true);
  });
  test("cursor inside a # trigger-led token", () => {
    check("hello #file", 10, true);
  });
  test("cursor inside a non-trigger-led word at start of line", () => {
    check("hello", 4, false);
  });
  test("cursor inside a non-trigger-led word mid-line", () => {
    check("say hello", 8, false);
  });
  test("cursor at start of empty line", () => {
    check("", 1, false);
  });
  test("cursor right after whitespace, no token yet", () => {
    check("hello ", 7, false);
  });
  test("cursor after a trigger-led token followed by space", () => {
    check("@file ", 7, false);
  });
  test("cursor in token whose first char is not a trigger char", () => {
    check("abc@def", 8, false);
  });
  test("returns false when no trigger characters are configured", () => {
    const model = store.add(createTextModel("@file", null, void 0, URI.parse("test:input")));
    assert.strictEqual(isAtTriggerCharacterToken(model, new Position(1, 4), []), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcY2hhdElucHV0Q29tcGxldGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW0sIENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvblRyaWdnZXJLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2FnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25BZGRpdGlvbmFsVHJpZ2dlckNoYXJhY3RlcnMsIGF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25Tb3J0VGV4dCwgY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMsIGVzY2FwZUZvckNoYXJDbGFzcywgZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbk1hdGNoLCBnZXRBdHRhY2hlZENvbnRleHRDb21wbGV0aW9uU29ydFRleHQsIGdldENvbXBsZXRpb25SYW5nZVdvcmQsIGlzQXRUcmlnZ2VyQ2hhcmFjdGVyVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdElucHV0Q29tcGxldGlvblV0aWxzLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSwgSUNoYXRJbnB1dENvbXBsZXRpb25zUGFyYW1zLCBJQ2hhdElucHV0Q29tcGxldGlvbnNSZXN1bHQsIElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hhdEFnZW50TGVhZGVyLCBjaGF0VmFyaWFibGVMZWFkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vd2lkZ2V0L21vY2tDaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuXG5jbGFzcyBUZXN0Q2hhdFNlc3Npb25zU2VydmljZSBleHRlbmRzIE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBpbnNlcnRUZXh0ID0gJyNyb2FkbWFwLm1kJykge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBwcm92aWRlQ2hhdElucHV0Q29tcGxldGlvbnMoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfcGFyYW1zOiBJQ2hhdElucHV0Q29tcGxldGlvbnNQYXJhbXMsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0SW5wdXRDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpdGVtczogW3tcblx0XHRcdFx0aW5zZXJ0VGV4dDogdGhpcy5pbnNlcnRUZXh0LFxuXHRcdFx0XHRzdGFydDogeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSxcblx0XHRcdFx0ZW5kOiB7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMiB9LFxuXHRcdFx0XHRhdHRhY2htZW50OiB7XG5cdFx0XHRcdFx0a2luZDogJ3Jlc291cmNlJyxcblx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL3JvYWRtYXAubWQnKSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgT3JkZXJlZFRlc3RDaGF0U2Vzc2lvbnNTZXJ2aWNlIGV4dGVuZHMgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2Uge1xuXHRvdmVycmlkZSBhc3luYyBwcm92aWRlQ2hhdElucHV0Q29tcGxldGlvbnMoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfcGFyYW1zOiBJQ2hhdElucHV0Q29tcGxldGlvbnNQYXJhbXMsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0SW5wdXRDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogJyN6LWluZGV4LnRzJyxcblx0XHRcdFx0XHRzdGFydDogeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSxcblx0XHRcdFx0XHRlbmQ6IHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxMSB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnQ6IHsga2luZDogJ3Jlc291cmNlJywgdXJpOiBVUkkuZmlsZSgnL2xvbmcvd29ya3NwYWNlL3NyYy9pbmRleC50cycpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnI2EtaW5kZXgudHMnLFxuXHRcdFx0XHRcdHN0YXJ0OiB7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMSB9LFxuXHRcdFx0XHRcdGVuZDogeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDExIH0sXG5cdFx0XHRcdFx0YXR0YWNobWVudDogeyBraW5kOiAncmVzb3VyY2UnLCB1cmk6IFVSSS5maWxlKCcvc3JjL2luZGV4LnRzJykgfSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBUZXN0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucyBleHRlbmRzIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlPHZvaWQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0bGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBsZXRpb25LaW5kID0gQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJpZ2dlckNoYXJhY3RlcnM6IHJlYWRvbmx5IHN0cmluZ1tdID0gWycjJ10sXG5cdCkge1xuXHRcdHN1cGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0fVxuXG5cdHJlZ2lzdGVyKCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXJQcm92aWRlcih7IHNjaGVtZTogJ3Rlc3QnIH0sICd0ZXN0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucycsIHRoaXMuX3RyaWdnZXJDaGFyYWN0ZXJzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZXNvbHZlQ29udGV4dChfbW9kZWw6IElUZXh0TW9kZWwpOiB7IHNlc3Npb25SZXNvdXJjZTogVVJJOyBjb250ZXh0OiB2b2lkIH0ge1xuXHRcdHJldHVybiB7IHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0OnNlc3Npb24nKSwgY29udGV4dDogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2J1aWxkSXRlbShwb3NpdGlvbjogUG9zaXRpb24sIGl0ZW06IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSk6IENvbXBsZXRpb25JdGVtIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdGZpbHRlclRleHQ6IHRoaXMuX2NvbXBsZXRpb25LaW5kID09PSBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCA/IGl0ZW0uaW5zZXJ0VGV4dCA6IHVuZGVmaW5lZCxcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSxcblx0XHRcdGtpbmQ6IHRoaXMuX2NvbXBsZXRpb25LaW5kLFxuXHRcdH07XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHN0b3JlLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXJrcyByZXN1bHRzIGluY29tcGxldGUgc28gdGhlIGhvc3QgaXMgcXVlcmllZCBhcyB0aGUgdG9rZW4gY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gc3RvcmUuYWRkKG5ldyBUZXN0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbmV3IFRlc3RDaGF0U2Vzc2lvbnNTZXJ2aWNlKCkpKTtcblx0XHRzdG9yZS5hZGQoY29tcGxldGlvbnMucmVnaXN0ZXIoKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCcjJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLm9yZGVyZWQobW9kZWwpWzBdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIpLCB7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3RlciwgdHJpZ2dlckNoYXJhY3RlcjogJyMnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRsYWJlbDogJyNyb2FkbWFwLm1kJyxcblx0XHRcdFx0aW5zZXJ0VGV4dDogJyNyb2FkbWFwLm1kJyxcblx0XHRcdFx0ZmlsdGVyVGV4dDogJyMnLFxuXHRcdFx0XHRzb3J0VGV4dDogJzAwMDAwMCcsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5GaWxlLFxuXHRcdFx0fV0sXG5cdFx0XHRpbmNvbXBsZXRlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgc2xhc2ggY29tbWFuZCBmaWx0ZXIgdGV4dCBzbyBNb25hY28gY2FuIGZ1enp5IHJhbmsgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IHN0b3JlLmFkZChuZXcgVGVzdEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG5ldyBUZXN0Q2hhdFNlc3Npb25zU2VydmljZSgnL3ZzY29kZS1wZXQnKSwgQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsIFsnLyddKSk7XG5cdFx0c3RvcmUuYWRkKGNvbXBsZXRpb25zLnJlZ2lzdGVyKCkpO1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnL3BldCcsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5vcmRlcmVkKG1vZGVsKVswXTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSwgeyB0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0bGFiZWw6ICcvdnNjb2RlLXBldCcsXG5cdFx0XHRcdGluc2VydFRleHQ6ICcvdnNjb2RlLXBldCcsXG5cdFx0XHRcdGZpbHRlclRleHQ6ICcvdnNjb2RlLXBldCcsXG5cdFx0XHRcdHNvcnRUZXh0OiAnMDAwMDAwJyxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCA1KSxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHR9XSxcblx0XHRcdGluY29tcGxldGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgYSBjb21tb24gY3VycmVudC10b2tlbiBmaWx0ZXIgc2NvcmUgdG8gcHJlc2VydmUgaG9zdCBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gc3RvcmUuYWRkKG5ldyBUZXN0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbmV3IE9yZGVyZWRUZXN0Q2hhdFNlc3Npb25zU2VydmljZSgpKSk7XG5cdFx0c3RvcmUuYWRkKGNvbXBsZXRpb25zLnJlZ2lzdGVyKCkpO1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnI3NyYy9pbmRleCcsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5vcmRlcmVkKG1vZGVsKVswXTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMSksIHsgdHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2UgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdD8uc3VnZ2VzdGlvbnMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0ZmlsdGVyVGV4dDogaXRlbS5maWx0ZXJUZXh0LFxuXHRcdFx0c29ydFRleHQ6IGl0ZW0uc29ydFRleHQsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IGxhYmVsOiAnI3otaW5kZXgudHMnLCBmaWx0ZXJUZXh0OiAnI3NyYy9pbmRleCcsIHNvcnRUZXh0OiAnMDAwMDAwJyB9LFxuXHRcdFx0eyBsYWJlbDogJyNhLWluZGV4LnRzJywgZmlsdGVyVGV4dDogJyNzcmMvaW5kZXgnLCBzb3J0VGV4dDogJzAwMDAwMScgfSxcblx0XHRdKTtcblx0fSk7XG59KTtcblxuLyoqXG4gKiBUZXN0IGRvdWJsZSBleHBvc2luZyB0aGUgcHJvdGVjdGVkIHtAbGluayBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLl9idWlsZEl0ZW19XG4gKiBzbyB0aGUgYWNjZXB0ZWQtcmFuZ2UgaW52YXJpYW50IGNhbiBiZSBhc3NlcnRlZCBkaXJlY3RseS5cbiAqL1xuY2xhc3MgVGVzdGFibGVBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zIGV4dGVuZHMgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucyB7XG5cdGJ1aWxkSXRlbShwb3NpdGlvbjogUG9zaXRpb24sIGl0ZW06IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSwgd2lkZ2V0OiBJQ2hhdFdpZGdldCk6IENvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYnVpbGRJdGVtKHBvc2l0aW9uLCBpdGVtLCB3aWRnZXQpO1xuXHR9XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zICNjaGF0IHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FjY2VwdGluZyBhIG11bHRpLXdvcmQgI2NoYXQgcmVmZXJlbmNlIHJlZ2lzdGVycyBhIHJhbmdlIGNvdmVyaW5nIHRoZSB3aG9sZSB0b2tlbicsICgpID0+IHtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IHN0b3JlLmFkZChuZXcgVGVzdGFibGVBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zKFxuXHRcdFx0bmV3IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENoYXRTZXNzaW9uc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRjb25zdCB3aWRnZXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0V2lkZ2V0Pih7fSk7XG5cdFx0Ly8gVGhlIGNvbXBsZXRpb24gY2FycmllcyB0aGUgb3BhcXVlIGJhY2tlbmQgY2hhdCBVUkksIHN0b3JlZCB2ZXJiYXRpbSBvblxuXHRcdC8vIHRoZSBhY2NlcHRlZCByZWZlcmVuY2UgZW50cnkuXG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gVVJJLnBhcnNlKCdhaHAtY2hhdDovL2NoYXQtMi9iYXNlNjRzZXNzaW9uJyk7XG5cblx0XHQvLyBUaGUgaG9zdCBpbnNlcnRzIGAjY2hhdDo8dGl0bGU+IGAgKHRyYWlsaW5nIHNwYWNlKSBzcGFubmluZyBjb2x1bW5zIDEuLjE5LlxuXHRcdGNvbnN0IGJ1aWx0ID0gY29tcGxldGlvbnMuYnVpbGRJdGVtKG5ldyBQb3NpdGlvbigxLCAxOSksIHtcblx0XHRcdGluc2VydFRleHQ6ICcjY2hhdDpEZXNpZ24gY2hhdCAnLFxuXHRcdFx0c3RhcnQ6IHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxIH0sXG5cdFx0XHRlbmQ6IHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxOSB9LFxuXHRcdFx0YXR0YWNobWVudDoge1xuXHRcdFx0XHRraW5kOiAnY2hhdCcsXG5cdFx0XHRcdHVyaTogY2hhdFJlc291cmNlLFxuXHRcdFx0XHRlbmRUdXJuOiAndHVybi01Jyxcblx0XHRcdFx0dGl0bGU6ICdEZXNpZ24gY2hhdCcsXG5cdFx0XHR9LFxuXHRcdH0sIHdpZGdldCk7XG5cblx0XHRjb25zdCBhcmd1bWVudCA9IGJ1aWx0Py5jb21tYW5kPy5hcmd1bWVudHM/LlswXSBhcyB7IGlkOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9IHwgdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBpZDogYXJndW1lbnQ/LmlkLCByYW5nZTogYXJndW1lbnQ/LnJhbmdlIH0sIHtcblx0XHRcdC8vIFN0YWJsZSBkeW5hbWljLXZhcmlhYmxlIGlkLCBzbyB0aGUgcGFyc2VyIHRyZWF0cyB0aGUgcmVmZXJlbmNlIGFzIG9uZSBwYXJ0LlxuXHRcdFx0aWQ6IGNyZWF0ZUNoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5KGNoYXRSZXNvdXJjZSwgJ3R1cm4tNScsICdEZXNpZ24gY2hhdCcpLmlkLFxuXHRcdFx0Ly8gQ292ZXJzIGAjY2hhdDpEZXNpZ24gY2hhdGAgKGNvbHVtbnMgMS4uMTgsIGVuZC1leGNsdXNpdmUpIFx1MjAxNCB0aGUgd2hvbGVcblx0XHRcdC8vIHRva2VuIG1pbnVzIHRoZSB0cmFpbGluZyBzcGFjZSwgbmV2ZXIgYSBwYXJ0aWFsIHNsaWNlLlxuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxOCksXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdlc2NhcGVGb3JDaGFyQ2xhc3MnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGFzc2VzIHRocm91Z2ggc2ltcGxlIGNoYXJhY3RlcnMgdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVGb3JDaGFyQ2xhc3MoJ2EnKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlRm9yQ2hhckNsYXNzKCcjJyksICcjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUZvckNoYXJDbGFzcygnQCcpLCAnQCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdlc2NhcGVzIGJhY2tzbGFzaCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlRm9yQ2hhckNsYXNzKCdcXFxcJyksICdcXFxcXFxcXCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdlc2NhcGVzIGNsb3NpbmcgYnJhY2tldCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlRm9yQ2hhckNsYXNzKCddJyksICdcXFxcXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlc2NhcGVzIGNhcmV0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVGb3JDaGFyQ2xhc3MoJ14nKSwgJ1xcXFxeJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZXMgaHlwaGVuJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVGb3JDaGFyQ2xhc3MoJy0nKSwgJ1xcXFwtJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZXMgbXVsdGlwbGUgc3BlY2lhbCBjaGFycyBpbiBvbmUgc3RyaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVGb3JDaGFyQ2xhc3MoJy1eXVxcXFwnKSwgJ1xcXFwtXFxcXF5cXFxcXVxcXFxcXFxcJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzIHNhZmUgdG8gdXNlIGZvciBjaGF0VmFyaWFibGVMZWFkZXIgYW5kIGNoYXRBZ2VudExlYWRlcicsICgpID0+IHtcblx0XHQvLyBUaGVzZSBhcmUgdGhlIGFjdHVhbCB2YWx1ZXMgdXNlZCBpbiB0aGUgcHJvZHVjdCBjb2RlXG5cdFx0Y29uc3QgZXNjYXBlZCA9IGBbJHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdFZhcmlhYmxlTGVhZGVyKX0ke2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0QWdlbnRMZWFkZXIpfV1gO1xuXHRcdGNvbnN0IHJlID0gbmV3IFJlZ0V4cChlc2NhcGVkKTtcblx0XHRhc3NlcnQub2socmUudGVzdCgnIycpKTtcblx0XHRhc3NlcnQub2socmUudGVzdCgnQCcpKTtcblx0XHRhc3NlcnQub2soIXJlLnRlc3QoJ2EnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZS50ZXN0KCcvJykpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnYXR0YWNoZWQgY29udGV4dCBjb21wbGV0aW9uIHJhbmtpbmcnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHN1Z2dlc3RPcHRpb25zID0gRWRpdG9yT3B0aW9ucy5zdWdnZXN0LmRlZmF1bHRWYWx1ZTtcblxuXHR0ZXN0KCdzb3J0cyBiZWZvcmUgb3RoZXIgY2hhdCBpbnB1dCBjb21wbGV0aW9ucycsICgpID0+IHtcblx0XHRhc3NlcnQub2soYXR0YWNoZWRDb250ZXh0Q29tcGxldGlvblNvcnRUZXh0IDwgJyAnKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsdGVycyBhdHRhY2htZW50cyBiZWZvcmUgbWF0Y2hpbmcgdGhlIGN1cnJlbnQgdG9rZW4gZXhhY3RseScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF0OiBnZXRBdHRhY2hlZENvbnRleHRDb21wbGV0aW9uTWF0Y2goJ0AnLCAnQCcsICdTY3JlZW4gUmVjb3JkaW5nLm1vdicsICdmaWxlJywgc3VnZ2VzdE9wdGlvbnMpPy5maWx0ZXJUZXh0LFxuXHRcdFx0YXRBdHRhY2htZW50OiBnZXRBdHRhY2hlZENvbnRleHRDb21wbGV0aW9uTWF0Y2goJ0BhdHQnLCAnQCcsICdTY3JlZW4gUmVjb3JkaW5nLm1vdicsICdmaWxlJywgc3VnZ2VzdE9wdGlvbnMpPy5maWx0ZXJUZXh0LFxuXHRcdFx0aGFzaE5hbWU6IGdldEF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25NYXRjaCgnI3NjcmVlbicsICcjJywgJ1NjcmVlbiBSZWNvcmRpbmcubW92JywgJ2ZpbGUnLCBzdWdnZXN0T3B0aW9ucyk/LmZpbHRlclRleHQsXG5cdFx0XHRoYXNoQXR0YWNobWVudDogZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbk1hdGNoKCcjYXR0JywgJyMnLCAnU2NyZWVuIFJlY29yZGluZy5tb3YnLCAnZmlsZScsIHN1Z2dlc3RPcHRpb25zKT8uZmlsdGVyVGV4dCxcblx0XHRcdHVubWF0Y2hlZDogZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbk1hdGNoKCcjeHl6JywgJyMnLCAnU2NyZWVuIFJlY29yZGluZy5tb3YnLCAnZmlsZScsIHN1Z2dlc3RPcHRpb25zKT8uZmlsdGVyVGV4dCxcblx0XHR9LCB7XG5cdFx0XHRhdDogJ0AnLFxuXHRcdFx0YXRBdHRhY2htZW50OiAnQGF0dCcsXG5cdFx0XHRoYXNoTmFtZTogJyNzY3JlZW4nLFxuXHRcdFx0aGFzaEF0dGFjaG1lbnQ6ICcjYXR0Jyxcblx0XHRcdHVubWF0Y2hlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdob25vcnMgZ3JhY2VmdWwgU3VnZ2VzdCBmaWx0ZXJpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRncmFjZWZ1bDogZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbk1hdGNoKCcjYXR0YWhjbWVudCcsICcjJywgJ1NjcmVlbiBSZWNvcmRpbmcubW92JywgJ2ZpbGUnLCBzdWdnZXN0T3B0aW9ucyk/LmZpbHRlclRleHQsXG5cdFx0XHRzdHJpY3Q6IGdldEF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25NYXRjaCgnI2F0dGFoY21lbnQnLCAnIycsICdTY3JlZW4gUmVjb3JkaW5nLm1vdicsICdmaWxlJywgeyAuLi5zdWdnZXN0T3B0aW9ucywgZmlsdGVyR3JhY2VmdWw6IGZhbHNlIH0pPy5maWx0ZXJUZXh0LFxuXHRcdH0sIHtcblx0XHRcdGdyYWNlZnVsOiAnI2F0dGFoY21lbnQnLFxuXHRcdFx0c3RyaWN0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hlcyBhY3Jvc3Mgc3VwcG9ydGVkIHB1bmN0dWF0aW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IGF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25BZGRpdGlvbmFsVHJpZ2dlckNoYXJhY3RlcnMsXG5cdFx0XHRjb2xvbjogZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbk1hdGNoKCcjYXR0YWNobWVudDonLCAnIycsICdTY3JlZW4gUmVjb3JkaW5nLm1vdicsICdmaWxlJywgc3VnZ2VzdE9wdGlvbnMpPy5maWx0ZXJUZXh0LFxuXHRcdFx0aHlwaGVuOiBnZXRBdHRhY2hlZENvbnRleHRDb21wbGV0aW9uTWF0Y2goJyNhdHRhY2htZW50OnNjcmVlbi0nLCAnIycsICdTY3JlZW4tUmVjb3JkaW5nLm1vdicsICdmaWxlJywgc3VnZ2VzdE9wdGlvbnMpPy5maWx0ZXJUZXh0LFxuXHRcdH0sIHtcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbJzonLCAnLSddLFxuXHRcdFx0Y29sb246ICcjYXR0YWNobWVudDonLFxuXHRcdFx0aHlwaGVuOiAnI2F0dGFjaG1lbnQ6c2NyZWVuLScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgb25seSB0aGUgdG9rZW4gcHJlZml4IHRocm91Z2ggYW4gaW50ZXJpb3IgY3Vyc29yJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlID0ge1xuXHRcdFx0aW5zZXJ0OiBuZXcgUmFuZ2UoMSwgMSwgMSwgNSksXG5cdFx0XHRyZXBsYWNlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksXG5cdFx0XHR2YXJXb3JkOiB7IHdvcmQ6ICcjYXR0eHl6Jywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogOCB9LFxuXHRcdH07XG5cdFx0Y29uc3QgdHlwZWRXb3JkID0gZ2V0Q29tcGxldGlvblJhbmdlV29yZChyYW5nZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHR5cGVkV29yZCxcblx0XHRcdGZpbHRlclRleHQ6IHR5cGVkV29yZCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbk1hdGNoKHR5cGVkV29yZCwgJyMnLCAnU2NyZWVuIFJlY29yZGluZy5tb3YnLCAnZmlsZScsIHN1Z2dlc3RPcHRpb25zKT8uZmlsdGVyVGV4dCxcblx0XHR9LCB7XG5cdFx0XHR0eXBlZFdvcmQ6ICcjYXR0Jyxcblx0XHRcdGZpbHRlclRleHQ6ICcjYXR0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGZ1enp5IHJlbGV2YW5jZSBiZXR3ZWVuIGF0dGFjaGVkIGNvbnRleHRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0cm9uZ01hdGNoID0gZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbk1hdGNoKCcjcmVhZG1lJywgJyMnLCAnUkVBRE1FLm1kJywgJ2ZpbGUnLCBzdWdnZXN0T3B0aW9ucyk7XG5cdFx0Y29uc3Qgd2Vha01hdGNoID0gZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbk1hdGNoKCcjcmVhZG1lJywgJyMnLCAnQXJlYWRtZS1jb3B5LnR4dCcsICdmaWxlJywgc3VnZ2VzdE9wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtYXRjaGVzOiAhIXN0cm9uZ01hdGNoICYmICEhd2Vha01hdGNoLFxuXHRcdFx0c3Ryb25nQmVmb3JlV2VhazogISFzdHJvbmdNYXRjaCAmJiAhIXdlYWtNYXRjaCAmJiBnZXRBdHRhY2hlZENvbnRleHRDb21wbGV0aW9uU29ydFRleHQoc3Ryb25nTWF0Y2guc2NvcmUpIDwgZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvblNvcnRUZXh0KHdlYWtNYXRjaC5zY29yZSksXG5cdFx0XHR3ZWFrQmVmb3JlQWdlbnRIb3N0OiAhIXdlYWtNYXRjaCAmJiBnZXRBdHRhY2hlZENvbnRleHRDb21wbGV0aW9uU29ydFRleHQod2Vha01hdGNoLnNjb3JlKSA8ICcwMDAwMDAnLFxuXHRcdH0sIHtcblx0XHRcdG1hdGNoZXM6IHRydWUsXG5cdFx0XHRzdHJvbmdCZWZvcmVXZWFrOiB0cnVlLFxuXHRcdFx0d2Vha0JlZm9yZUFnZW50SG9zdDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NvbXB1dGVDb21wbGV0aW9uUmFuZ2VzJywgKCkgPT4ge1xuXG5cdGxldCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gSGVscGVyOiBidWlsZHMgdGhlIHNhbWUgcmVnZXggcGF0dGVybnMgdXNlZCBpbiB0aGUgcHJvZHVjdCBjb2RlXG5cdGZ1bmN0aW9uIHZhcmlhYmxlTmFtZURlZigpIHtcblx0XHRyZXR1cm4gbmV3IFJlZ0V4cChgWyR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRWYXJpYWJsZUxlYWRlcil9JHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdEFnZW50TGVhZGVyKX1dW1xcXFx3Oi1dKmAsICdnJyk7XG5cdH1cblxuXHRmdW5jdGlvbiBmaWxlV29yZFBhdHRlcm4oKSB7XG5cdFx0cmV0dXJuIG5ldyBSZWdFeHAoYFske2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0VmFyaWFibGVMZWFkZXIpfSR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRBZ2VudExlYWRlcil9XVteXFxcXHNdKmAsICdnJyk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b29sVmFyaWFibGVOYW1lRGVmKCkge1xuXHRcdHJldHVybiBuZXcgUmVnRXhwKGAoPzw9XnxcXFxccylbJHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdFZhcmlhYmxlTGVhZGVyKX0ke2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0QWdlbnRMZWFkZXIpfV1cXFxcdypgLCAnZycpO1xuXHR9XG5cblx0Ly8gLS0tIFZhcmlhYmxlTmFtZURlZiBwYXR0ZXJuIHRlc3RzIC0tLVxuXG5cdHN1aXRlKCd3aXRoIFZhcmlhYmxlTmFtZURlZiByZWdleCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hdGNoZXMgI3ZhcmlhYmxlIGF0IHN0YXJ0IG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJyNmaWxlJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA2KSwgdmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRpbnNlcnQ6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSxcblx0XHRcdFx0cmVwbGFjZTogbmV3IFJhbmdlKDEsIDEsIDEsIDYpLFxuXHRcdFx0XHR2YXJXb3JkOiB7IHdvcmQ6ICcjZmlsZScsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDYgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBAdmFyaWFibGUgYXQgc3RhcnQgb2YgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnQGZpbGUnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDYpLCB2YXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdGluc2VydDogbmV3IFJhbmdlKDEsIDEsIDEsIDYpLFxuXHRcdFx0XHRyZXBsYWNlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksXG5cdFx0XHRcdHZhcldvcmQ6IHsgd29yZDogJ0BmaWxlJywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogNiB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzICN2YXJpYWJsZSBtaWQtbGluZSBhZnRlciBzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gI2ZpbGUnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEyKSwgdmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRpbnNlcnQ6IG5ldyBSYW5nZSgxLCA3LCAxLCAxMiksXG5cdFx0XHRcdHJlcGxhY2U6IG5ldyBSYW5nZSgxLCA3LCAxLCAxMiksXG5cdFx0XHRcdHZhcldvcmQ6IHsgd29yZDogJyNmaWxlJywgc3RhcnRDb2x1bW46IDcsIGVuZENvbHVtbjogMTIgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBAdmFyaWFibGUgbWlkLWxpbmUgYWZ0ZXIgc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIEBmaWxlJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMiksIHZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0aW5zZXJ0OiBuZXcgUmFuZ2UoMSwgNywgMSwgMTIpLFxuXHRcdFx0XHRyZXBsYWNlOiBuZXcgUmFuZ2UoMSwgNywgMSwgMTIpLFxuXHRcdFx0XHR2YXJXb3JkOiB7IHdvcmQ6ICdAZmlsZScsIHN0YXJ0Q29sdW1uOiA3LCBlbmRDb2x1bW46IDEyIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgIyBhbG9uZSAoanVzdCB0aGUgbGVhZGVyKScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnIycsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMiksIHZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkPy53b3JkLCAnIycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBAIGFsb25lIChqdXN0IHRoZSBsZWFkZXIpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdAJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyKSwgdmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICdAJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIHZhcmlhYmxlIHdpdGggY29sb25zIGFuZCBoeXBoZW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCcjZmlsZTp0ZXN0LTEnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEzKSwgdmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICcjZmlsZTp0ZXN0LTEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2N1cnNvciBpbiBtaWRkbGUgb2YgdmFyaWFibGUgcHJvZHVjZXMgcGFydGlhbCBpbnNlcnQgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ0BzZWxlY3Rpb24nLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDUpLCB2YXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdGluc2VydDogbmV3IFJhbmdlKDEsIDEsIDEsIDUpLFxuXHRcdFx0XHRyZXBsYWNlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTEpLFxuXHRcdFx0XHR2YXJXb3JkOiB7IHdvcmQ6ICdAc2VsZWN0aW9uJywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMTEgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gZmlsZVdvcmRQYXR0ZXJuIHRlc3RzIC0tLVxuXG5cdHN1aXRlKCd3aXRoIGZpbGVXb3JkUGF0dGVybiByZWdleCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hdGNoZXMgI2ZpbGU6cGF0aC90by9maWxlLnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCcjZmlsZTpwYXRoL3RvL2ZpbGUudHMnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIyKSwgZmlsZVdvcmRQYXR0ZXJuKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICcjZmlsZTpwYXRoL3RvL2ZpbGUudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgQGZpbGU6cGF0aC90by9maWxlLnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdAZmlsZTpwYXRoL3RvL2ZpbGUudHMnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIyKSwgZmlsZVdvcmRQYXR0ZXJuKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICdAZmlsZTpwYXRoL3RvL2ZpbGUudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3BzIGF0IHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJyNmaWxlOnRlc3QgcmVzdCcsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTEpLCBmaWxlV29yZFBhdHRlcm4oKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFyV29yZD8ud29yZCwgJyNmaWxlOnRlc3QnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIHRvb2xWYXJpYWJsZU5hbWVEZWYgdGVzdHMgLS0tXG5cblx0c3VpdGUoJ3dpdGggdG9vbFZhcmlhYmxlTmFtZURlZiByZWdleCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hdGNoZXMgI3Rvb2wgYXQgc3RhcnQgb2YgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnI3Rvb2wnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDYpLCB0b29sVmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICcjdG9vbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBAdG9vbCBhdCBzdGFydCBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdAdG9vbCcsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNiksIHRvb2xWYXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFyV29yZD8ud29yZCwgJ0B0b29sJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzICN0b29sIGFmdGVyIHNwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCd1c2UgI2ZldGNoJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMSksIHRvb2xWYXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFyV29yZD8ud29yZCwgJyNmZXRjaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBAdG9vbCBhZnRlciBzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgndXNlIEBmZXRjaCcsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTEpLCB0b29sVmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICdAZmV0Y2gnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIEVkZ2UgY2FzZXMgLS0tXG5cblx0c3VpdGUoJ2VkZ2UgY2FzZXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBpbnNpZGUgYSBub3JtYWwgd29yZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8nLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpLCB2YXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBzcGFjZSBiZWZvcmUgY3Vyc29yIG1pZC1saW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdhYicsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMyksIHZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IHJhbmdlIGF0IGJsYW5rIHBvc2l0aW9uIGFmdGVyIHNwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyAnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDcpLCB2YXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFyV29yZCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pbnNlcnQsIFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3IFBvc2l0aW9uKDEsIDcpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IHJhbmdlIGF0IHN0YXJ0IG9mIGVtcHR5IGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJycsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSksIHZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkLCBudWxsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29ubHlPbldvcmRTdGFydD10cnVlIHJlamVjdHMgdmFyaWFibGUgcHJlY2VkZWQgYnkgYSB3b3JkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdhYmMjZmlsZScsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgOSksIHZhcmlhYmxlTmFtZURlZigpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbmx5T25Xb3JkU3RhcnQ9dHJ1ZSBhY2NlcHRzIHZhcmlhYmxlIGFmdGVyIHNwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdhYmMgI2ZpbGUnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEwKSwgdmFyaWFibGVOYW1lRGVmKCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICcjZmlsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25seU9uV29yZFN0YXJ0PXRydWUgYWNjZXB0cyBAdmFyaWFibGUgYWZ0ZXIgc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ2FiYyBAZmlsZScsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTApLCB2YXJpYWJsZU5hbWVEZWYoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFyV29yZD8ud29yZCwgJ0BmaWxlJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdpc0F0VHJpZ2dlckNoYXJhY3RlclRva2VuJywgKCkgPT4ge1xuXG5cdGxldCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgdHJpZ2dlckNoYXJzID0gWydAJywgJyMnXTtcblxuXHRmdW5jdGlvbiBjaGVjayh0ZXh0OiBzdHJpbmcsIGNvbHVtbjogbnVtYmVyLCBleHBlY3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXh0LCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aXNBdFRyaWdnZXJDaGFyYWN0ZXJUb2tlbihtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIGNvbHVtbiksIHRyaWdnZXJDaGFycyksXG5cdFx0XHRleHBlY3RlZCxcblx0XHRcdGB0ZXh0PSR7SlNPTi5zdHJpbmdpZnkodGV4dCl9IGNvbHVtbj0ke2NvbHVtbn1gLFxuXHRcdCk7XG5cdH1cblxuXHR0ZXN0KCdjdXJzb3IgcmlnaHQgYWZ0ZXIgYSB0cmlnZ2VyIGNoYXJhY3RlciBhdCBzdGFydCBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdGNoZWNrKCdAJywgMiwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvciBpbnNpZGUgYSB0cmlnZ2VyLWxlZCB0b2tlbiBhdCBzdGFydCBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdGNoZWNrKCdAZmlsZScsIDQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3IgYXQgZW5kIG9mIGEgdHJpZ2dlci1sZWQgdG9rZW4gYXQgc3RhcnQgb2YgbGluZScsICgpID0+IHtcblx0XHRjaGVjaygnQGZpbGUnLCA2LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yIGluc2lkZSBhIHRyaWdnZXItbGVkIHRva2VuIG1pZC1saW5lJywgKCkgPT4ge1xuXHRcdGNoZWNrKCdoZWxsbyBAZmlsZScsIDEwLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yIGluc2lkZSBhICMgdHJpZ2dlci1sZWQgdG9rZW4nLCAoKSA9PiB7XG5cdFx0Y2hlY2soJ2hlbGxvICNmaWxlJywgMTAsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3IgaW5zaWRlIGEgbm9uLXRyaWdnZXItbGVkIHdvcmQgYXQgc3RhcnQgb2YgbGluZScsICgpID0+IHtcblx0XHRjaGVjaygnaGVsbG8nLCA0LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvciBpbnNpZGUgYSBub24tdHJpZ2dlci1sZWQgd29yZCBtaWQtbGluZScsICgpID0+IHtcblx0XHRjaGVjaygnc2F5IGhlbGxvJywgOCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3IgYXQgc3RhcnQgb2YgZW1wdHkgbGluZScsICgpID0+IHtcblx0XHRjaGVjaygnJywgMSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3IgcmlnaHQgYWZ0ZXIgd2hpdGVzcGFjZSwgbm8gdG9rZW4geWV0JywgKCkgPT4ge1xuXHRcdGNoZWNrKCdoZWxsbyAnLCA3LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvciBhZnRlciBhIHRyaWdnZXItbGVkIHRva2VuIGZvbGxvd2VkIGJ5IHNwYWNlJywgKCkgPT4ge1xuXHRcdC8vIEN1cnNvciBzaXRzIGluIHRoZSBlbXB0eSB0b2tlbiBhZnRlciB0aGUgc3BhY2UsIG5vdCBpbiB0aGUgQGZpbGUgdG9rZW4uXG5cdFx0Y2hlY2soJ0BmaWxlICcsIDcsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yIGluIHRva2VuIHdob3NlIGZpcnN0IGNoYXIgaXMgbm90IGEgdHJpZ2dlciBjaGFyJywgKCkgPT4ge1xuXHRcdGNoZWNrKCdhYmNAZGVmJywgOCwgZmFsc2UpOyAvLyBmaXJzdCBjaGFyIG9mIHRva2VuIGlzICdhJywgbm90ICdAJ1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gbm8gdHJpZ2dlciBjaGFyYWN0ZXJzIGFyZSBjb25maWd1cmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnQGZpbGUnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXRUcmlnZ2VyQ2hhcmFjdGVyVG9rZW4obW9kZWwsIG5ldyBQb3NpdGlvbigxLCA0KSwgW10pLCBmYWxzZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBb0M7QUFDN0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUF5QixvQkFBb0IsNkJBQTZCO0FBRTFFLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsc0RBQXNELG1DQUFtQyx5QkFBeUIsb0JBQW9CLG1DQUFtQyxzQ0FBc0Msd0JBQXdCLGlDQUFpQztBQUVqUixTQUFTLGlCQUFpQiwwQkFBMEI7QUFDcEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFFOUIsTUFBTSxnQ0FBZ0Msd0JBQXdCO0FBQUEsRUFDN0QsWUFBNkIsYUFBYSxlQUFlO0FBQ3hELFVBQU07QUFEc0I7QUFBQSxFQUU3QjtBQUFBLEVBRUEsTUFBZSw0QkFBNEIsa0JBQXVCLFNBQXNDLFFBQWlFO0FBQ3hLLFdBQU87QUFBQSxNQUNOLE9BQU8sQ0FBQztBQUFBLFFBQ1AsWUFBWSxLQUFLO0FBQUEsUUFDakIsT0FBTyxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUU7QUFBQSxRQUNsQyxLQUFLLEVBQUUsWUFBWSxHQUFHLFFBQVEsRUFBRTtBQUFBLFFBQ2hDLFlBQVk7QUFBQSxVQUNYLE1BQU07QUFBQSxVQUNOLEtBQUssSUFBSSxLQUFLLHVCQUF1QjtBQUFBLFFBQ3RDO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sdUNBQXVDLHdCQUF3QjtBQUFBLEVBQ3BFLE1BQWUsNEJBQTRCLGtCQUF1QixTQUFzQyxRQUFpRTtBQUN4SyxXQUFPO0FBQUEsTUFDTixPQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MsWUFBWTtBQUFBLFVBQ1osT0FBTyxFQUFFLFlBQVksR0FBRyxRQUFRLEVBQUU7QUFBQSxVQUNsQyxLQUFLLEVBQUUsWUFBWSxHQUFHLFFBQVEsR0FBRztBQUFBLFVBQ2pDLFlBQVksRUFBRSxNQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssOEJBQThCLEVBQUU7QUFBQSxRQUMvRTtBQUFBLFFBQ0E7QUFBQSxVQUNDLFlBQVk7QUFBQSxVQUNaLE9BQU8sRUFBRSxZQUFZLEdBQUcsUUFBUSxFQUFFO0FBQUEsVUFDbEMsS0FBSyxFQUFFLFlBQVksR0FBRyxRQUFRLEdBQUc7QUFBQSxVQUNqQyxZQUFZLEVBQUUsTUFBTSxZQUFZLEtBQUssSUFBSSxLQUFLLGVBQWUsRUFBRTtBQUFBLFFBQ2hFO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLHNDQUFzQyw4QkFBb0M7QUFBQSxFQUMvRSxZQUNDLHlCQUNBLHFCQUNpQixrQkFBa0IsbUJBQW1CLE1BQ3JDLHFCQUF3QyxDQUFDLEdBQUcsR0FDNUQ7QUFDRCxVQUFNLHlCQUF5QixtQkFBbUI7QUFIakM7QUFDQTtBQUFBLEVBR2xCO0FBQUEsRUFFQSxXQUF3QjtBQUN2QixXQUFPLEtBQUssa0JBQWtCLEVBQUUsUUFBUSxPQUFPLEdBQUcsaUNBQWlDLEtBQUssb0JBQW9CLE1BQVM7QUFBQSxFQUN0SDtBQUFBLEVBRW1CLGdCQUFnQixRQUE2RDtBQUMvRixXQUFPLEVBQUUsaUJBQWlCLElBQUksTUFBTSxjQUFjLEdBQUcsU0FBUyxPQUFVO0FBQUEsRUFDekU7QUFBQSxFQUVtQixXQUFXLFVBQW9CLE1BQWdEO0FBQ2pHLFdBQU87QUFBQSxNQUNOLE9BQU8sS0FBSztBQUFBLE1BQ1osWUFBWSxLQUFLO0FBQUEsTUFDakIsWUFBWSxLQUFLLG9CQUFvQixtQkFBbUIsT0FBTyxLQUFLLGFBQWE7QUFBQSxNQUNqRixPQUFPLE1BQU0sY0FBYyxRQUFRO0FBQUEsTUFDbkMsTUFBTSxLQUFLO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0saUNBQWlDLE1BQU07QUFFNUMsUUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBRWxDLFdBQVMsTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUM1QiwwQ0FBd0M7QUFFeEMsT0FBSyx3RUFBd0UsWUFBWTtBQUN4RixVQUFNLDBCQUEwQixJQUFJLHdCQUF3QjtBQUM1RCxVQUFNLGNBQWMsTUFBTSxJQUFJLElBQUksOEJBQThCLHlCQUF5QixJQUFJLHdCQUF3QixDQUFDLENBQUM7QUFDdkgsVUFBTSxJQUFJLFlBQVksU0FBUyxDQUFDO0FBQ2hDLFVBQU0sUUFBUSxNQUFNLElBQUksZ0JBQWdCLEtBQUssTUFBTSxRQUFXLElBQUksTUFBTSxZQUFZLENBQUMsQ0FBQztBQUN0RixVQUFNLFdBQVcsd0JBQXdCLG1CQUFtQixRQUFRLEtBQUssRUFBRSxDQUFDO0FBRTVFLFVBQU0sU0FBUyxNQUFNLFNBQVMsdUJBQXVCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLEVBQUUsYUFBYSxzQkFBc0Isa0JBQWtCLGtCQUFrQixJQUFJLEdBQUcsa0JBQWtCLElBQUk7QUFFdEwsV0FBTyxnQkFBZ0IsUUFBUTtBQUFBLE1BQzlCLGFBQWEsQ0FBQztBQUFBLFFBQ2IsT0FBTztBQUFBLFFBQ1AsWUFBWTtBQUFBLFFBQ1osWUFBWTtBQUFBLFFBQ1osVUFBVTtBQUFBLFFBQ1YsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzNCLE1BQU0sbUJBQW1CO0FBQUEsTUFDMUIsQ0FBQztBQUFBLE1BQ0QsWUFBWTtBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUVBQW1FLFlBQVk7QUFDbkYsVUFBTSwwQkFBMEIsSUFBSSx3QkFBd0I7QUFDNUQsVUFBTSxjQUFjLE1BQU0sSUFBSSxJQUFJLDhCQUE4Qix5QkFBeUIsSUFBSSx3QkFBd0IsYUFBYSxHQUFHLG1CQUFtQixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDcEssVUFBTSxJQUFJLFlBQVksU0FBUyxDQUFDO0FBQ2hDLFVBQU0sUUFBUSxNQUFNLElBQUksZ0JBQWdCLFFBQVEsTUFBTSxRQUFXLElBQUksTUFBTSxZQUFZLENBQUMsQ0FBQztBQUN6RixVQUFNLFdBQVcsd0JBQXdCLG1CQUFtQixRQUFRLEtBQUssRUFBRSxDQUFDO0FBRTVFLFVBQU0sU0FBUyxNQUFNLFNBQVMsdUJBQXVCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLEVBQUUsYUFBYSxzQkFBc0IsT0FBTyxHQUFHLGtCQUFrQixJQUFJO0FBRXJKLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixhQUFhLENBQUM7QUFBQSxRQUNiLE9BQU87QUFBQSxRQUNQLFlBQVk7QUFBQSxRQUNaLFlBQVk7QUFBQSxRQUNaLFVBQVU7QUFBQSxRQUNWLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNLG1CQUFtQjtBQUFBLE1BQzFCLENBQUM7QUFBQSxNQUNELFlBQVk7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFVBQU0sMEJBQTBCLElBQUksd0JBQXdCO0FBQzVELFVBQU0sY0FBYyxNQUFNLElBQUksSUFBSSw4QkFBOEIseUJBQXlCLElBQUksK0JBQStCLENBQUMsQ0FBQztBQUM5SCxVQUFNLElBQUksWUFBWSxTQUFTLENBQUM7QUFDaEMsVUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsY0FBYyxNQUFNLFFBQVcsSUFBSSxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQy9GLFVBQU0sV0FBVyx3QkFBd0IsbUJBQW1CLFFBQVEsS0FBSyxFQUFFLENBQUM7QUFFNUUsVUFBTSxTQUFTLE1BQU0sU0FBUyx1QkFBdUIsT0FBTyxJQUFJLFNBQVMsR0FBRyxFQUFFLEdBQUcsRUFBRSxhQUFhLHNCQUFzQixPQUFPLEdBQUcsa0JBQWtCLElBQUk7QUFFdEosV0FBTyxnQkFBZ0IsUUFBUSxZQUFZLElBQUksV0FBUztBQUFBLE1BQ3ZELE9BQU8sS0FBSztBQUFBLE1BQ1osWUFBWSxLQUFLO0FBQUEsTUFDakIsVUFBVSxLQUFLO0FBQUEsSUFDaEIsRUFBRSxHQUFHO0FBQUEsTUFDSixFQUFFLE9BQU8sZUFBZSxZQUFZLGNBQWMsVUFBVSxTQUFTO0FBQUEsTUFDckUsRUFBRSxPQUFPLGVBQWUsWUFBWSxjQUFjLFVBQVUsU0FBUztBQUFBLElBQ3RFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDO0FBTUQsTUFBTSwwQ0FBMEMsMEJBQTBCO0FBQUEsRUFDekUsVUFBVSxVQUFvQixNQUFnQyxRQUFpRDtBQUM5RyxXQUFPLEtBQUssV0FBVyxVQUFVLE1BQU0sTUFBTTtBQUFBLEVBQzlDO0FBQ0Q7QUFFQSxNQUFNLDhDQUE4QyxNQUFNO0FBRXpELFFBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUVsQyxXQUFTLE1BQU0sTUFBTSxNQUFNLENBQUM7QUFDNUIsMENBQXdDO0FBRXhDLE9BQUsscUZBQXFGLE1BQU07QUFDL0YsVUFBTSxjQUFjLE1BQU0sSUFBSSxJQUFJO0FBQUEsTUFDakMsSUFBSSx3QkFBd0I7QUFBQSxNQUM1QixJQUFJLHNCQUFzQjtBQUFBLE1BQzFCLElBQUksd0JBQXdCO0FBQUEsTUFDNUIsSUFBSSx5QkFBeUI7QUFBQSxJQUM5QixDQUFDO0FBQ0QsVUFBTSxTQUFTLGNBQTJCLENBQUMsQ0FBQztBQUc1QyxVQUFNLGVBQWUsSUFBSSxNQUFNLGlDQUFpQztBQUdoRSxVQUFNLFFBQVEsWUFBWSxVQUFVLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRztBQUFBLE1BQ3hELFlBQVk7QUFBQSxNQUNaLE9BQU8sRUFBRSxZQUFZLEdBQUcsUUFBUSxFQUFFO0FBQUEsTUFDbEMsS0FBSyxFQUFFLFlBQVksR0FBRyxRQUFRLEdBQUc7QUFBQSxNQUNqQyxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsUUFDTixLQUFLO0FBQUEsUUFDTCxTQUFTO0FBQUEsUUFDVCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsR0FBRyxNQUFNO0FBRVQsVUFBTSxXQUFXLE9BQU8sU0FBUyxZQUFZLENBQUM7QUFDOUMsV0FBTyxnQkFBZ0IsRUFBRSxJQUFJLFVBQVUsSUFBSSxPQUFPLFVBQVUsTUFBTSxHQUFHO0FBQUE7QUFBQSxNQUVwRSxJQUFJLGlDQUFpQyxjQUFjLFVBQVUsYUFBYSxFQUFFO0FBQUE7QUFBQTtBQUFBLE1BRzVFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sc0JBQXNCLE1BQU07QUFFakMsMENBQXdDO0FBRXhDLE9BQUssOENBQThDLE1BQU07QUFDeEQsV0FBTyxZQUFZLG1CQUFtQixHQUFHLEdBQUcsR0FBRztBQUMvQyxXQUFPLFlBQVksbUJBQW1CLEdBQUcsR0FBRyxHQUFHO0FBQy9DLFdBQU8sWUFBWSxtQkFBbUIsR0FBRyxHQUFHLEdBQUc7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyxxQkFBcUIsTUFBTTtBQUMvQixXQUFPLFlBQVksbUJBQW1CLElBQUksR0FBRyxNQUFNO0FBQUEsRUFDcEQsQ0FBQztBQUVELE9BQUssMkJBQTJCLE1BQU07QUFDckMsV0FBTyxZQUFZLG1CQUFtQixHQUFHLEdBQUcsS0FBSztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLGlCQUFpQixNQUFNO0FBQzNCLFdBQU8sWUFBWSxtQkFBbUIsR0FBRyxHQUFHLEtBQUs7QUFBQSxFQUNsRCxDQUFDO0FBRUQsT0FBSyxrQkFBa0IsTUFBTTtBQUM1QixXQUFPLFlBQVksbUJBQW1CLEdBQUcsR0FBRyxLQUFLO0FBQUEsRUFDbEQsQ0FBQztBQUVELE9BQUssZ0RBQWdELE1BQU07QUFDMUQsV0FBTyxZQUFZLG1CQUFtQixPQUFPLEdBQUcsZUFBZTtBQUFBLEVBQ2hFLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBRXZFLFVBQU0sVUFBVSxJQUFJLG1CQUFtQixrQkFBa0IsQ0FBQyxHQUFHLG1CQUFtQixlQUFlLENBQUM7QUFDaEcsVUFBTSxLQUFLLElBQUksT0FBTyxPQUFPO0FBQzdCLFdBQU8sR0FBRyxHQUFHLEtBQUssR0FBRyxDQUFDO0FBQ3RCLFdBQU8sR0FBRyxHQUFHLEtBQUssR0FBRyxDQUFDO0FBQ3RCLFdBQU8sR0FBRyxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUM7QUFDdkIsV0FBTyxHQUFHLENBQUMsR0FBRyxLQUFLLEdBQUcsQ0FBQztBQUFBLEVBQ3hCLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSx1Q0FBdUMsTUFBTTtBQUNsRCwwQ0FBd0M7QUFFeEMsUUFBTSxpQkFBaUIsY0FBYyxRQUFRO0FBRTdDLE9BQUssNkNBQTZDLE1BQU07QUFDdkQsV0FBTyxHQUFHLG9DQUFvQyxHQUFHO0FBQUEsRUFDbEQsQ0FBQztBQUVELE9BQUssaUVBQWlFLE1BQU07QUFDM0UsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixJQUFJLGtDQUFrQyxLQUFLLEtBQUssd0JBQXdCLFFBQVEsY0FBYyxHQUFHO0FBQUEsTUFDakcsY0FBYyxrQ0FBa0MsUUFBUSxLQUFLLHdCQUF3QixRQUFRLGNBQWMsR0FBRztBQUFBLE1BQzlHLFVBQVUsa0NBQWtDLFdBQVcsS0FBSyx3QkFBd0IsUUFBUSxjQUFjLEdBQUc7QUFBQSxNQUM3RyxnQkFBZ0Isa0NBQWtDLFFBQVEsS0FBSyx3QkFBd0IsUUFBUSxjQUFjLEdBQUc7QUFBQSxNQUNoSCxXQUFXLGtDQUFrQyxRQUFRLEtBQUssd0JBQXdCLFFBQVEsY0FBYyxHQUFHO0FBQUEsSUFDNUcsR0FBRztBQUFBLE1BQ0YsSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsVUFBVTtBQUFBLE1BQ1YsZ0JBQWdCO0FBQUEsTUFDaEIsV0FBVztBQUFBLElBQ1osQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUNBQXFDLE1BQU07QUFDL0MsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLGtDQUFrQyxlQUFlLEtBQUssd0JBQXdCLFFBQVEsY0FBYyxHQUFHO0FBQUEsTUFDakgsUUFBUSxrQ0FBa0MsZUFBZSxLQUFLLHdCQUF3QixRQUFRLEVBQUUsR0FBRyxnQkFBZ0IsZ0JBQWdCLE1BQU0sQ0FBQyxHQUFHO0FBQUEsSUFDOUksR0FBRztBQUFBLE1BQ0YsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMENBQTBDLE1BQU07QUFDcEQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixtQkFBbUI7QUFBQSxNQUNuQixPQUFPLGtDQUFrQyxnQkFBZ0IsS0FBSyx3QkFBd0IsUUFBUSxjQUFjLEdBQUc7QUFBQSxNQUMvRyxRQUFRLGtDQUFrQyx1QkFBdUIsS0FBSyx3QkFBd0IsUUFBUSxjQUFjLEdBQUc7QUFBQSxJQUN4SCxHQUFHO0FBQUEsTUFDRixtQkFBbUIsQ0FBQyxLQUFLLEdBQUc7QUFBQSxNQUM1QixPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLFFBQVE7QUFBQSxNQUNiLFFBQVEsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUM1QixTQUFTLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDN0IsU0FBUyxFQUFFLE1BQU0sV0FBVyxhQUFhLEdBQUcsV0FBVyxFQUFFO0FBQUEsSUFDMUQ7QUFDQSxVQUFNLFlBQVksdUJBQXVCLEtBQUs7QUFFOUMsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsWUFBWSxjQUFjLFNBQVksU0FBWSxrQ0FBa0MsV0FBVyxLQUFLLHdCQUF3QixRQUFRLGNBQWMsR0FBRztBQUFBLElBQ3RKLEdBQUc7QUFBQSxNQUNGLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFVBQU0sY0FBYyxrQ0FBa0MsV0FBVyxLQUFLLGFBQWEsUUFBUSxjQUFjO0FBQ3pHLFVBQU0sWUFBWSxrQ0FBa0MsV0FBVyxLQUFLLG9CQUFvQixRQUFRLGNBQWM7QUFFOUcsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixTQUFTLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztBQUFBLE1BQzVCLGtCQUFrQixDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsYUFBYSxxQ0FBcUMsWUFBWSxLQUFLLElBQUkscUNBQXFDLFVBQVUsS0FBSztBQUFBLE1BQ2hLLHFCQUFxQixDQUFDLENBQUMsYUFBYSxxQ0FBcUMsVUFBVSxLQUFLLElBQUk7QUFBQSxJQUM3RixHQUFHO0FBQUEsTUFDRixTQUFTO0FBQUEsTUFDVCxrQkFBa0I7QUFBQSxNQUNsQixxQkFBcUI7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sMkJBQTJCLE1BQU07QUFFdEMsTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLFlBQVEsSUFBSSxnQkFBZ0I7QUFBQSxFQUM3QixDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsMENBQXdDO0FBR3hDLFdBQVMsa0JBQWtCO0FBQzFCLFdBQU8sSUFBSSxPQUFPLElBQUksbUJBQW1CLGtCQUFrQixDQUFDLEdBQUcsbUJBQW1CLGVBQWUsQ0FBQyxhQUFhLEdBQUc7QUFBQSxFQUNuSDtBQUVBLFdBQVMsa0JBQWtCO0FBQzFCLFdBQU8sSUFBSSxPQUFPLElBQUksbUJBQW1CLGtCQUFrQixDQUFDLEdBQUcsbUJBQW1CLGVBQWUsQ0FBQyxZQUFZLEdBQUc7QUFBQSxFQUNsSDtBQUVBLFdBQVMsc0JBQXNCO0FBQzlCLFdBQU8sSUFBSSxPQUFPLGNBQWMsbUJBQW1CLGtCQUFrQixDQUFDLEdBQUcsbUJBQW1CLGVBQWUsQ0FBQyxTQUFTLEdBQUc7QUFBQSxFQUN6SDtBQUlBLFFBQU0sOEJBQThCLE1BQU07QUFFekMsU0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxZQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixTQUFTLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDMUYsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztBQUNuRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLGdCQUFnQixRQUFRO0FBQUEsUUFDOUIsUUFBUSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzVCLFNBQVMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUM3QixTQUFTLEVBQUUsTUFBTSxTQUFTLGFBQWEsR0FBRyxXQUFXLEVBQUU7QUFBQSxNQUN4RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxZQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixTQUFTLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDMUYsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztBQUNuRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLGdCQUFnQixRQUFRO0FBQUEsUUFDOUIsUUFBUSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzVCLFNBQVMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUM3QixTQUFTLEVBQUUsTUFBTSxTQUFTLGFBQWEsR0FBRyxXQUFXLEVBQUU7QUFBQSxNQUN4RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywwQ0FBMEMsTUFBTTtBQUNwRCxZQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixlQUFlLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDaEcsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQztBQUNwRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLGdCQUFnQixRQUFRO0FBQUEsUUFDOUIsUUFBUSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQzdCLFNBQVMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUM5QixTQUFTLEVBQUUsTUFBTSxTQUFTLGFBQWEsR0FBRyxXQUFXLEdBQUc7QUFBQSxNQUN6RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywwQ0FBMEMsTUFBTTtBQUNwRCxZQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixlQUFlLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDaEcsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQztBQUNwRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLGdCQUFnQixRQUFRO0FBQUEsUUFDOUIsUUFBUSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQzdCLFNBQVMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUM5QixTQUFTLEVBQUUsTUFBTSxTQUFTLGFBQWEsR0FBRyxXQUFXLEdBQUc7QUFBQSxNQUN6RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxZQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixLQUFLLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDdEYsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztBQUNuRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLFlBQVksT0FBTyxTQUFTLE1BQU0sR0FBRztBQUFBLElBQzdDLENBQUM7QUFFRCxTQUFLLHFDQUFxQyxNQUFNO0FBQy9DLFlBQU0sUUFBUSxNQUFNLElBQUksZ0JBQWdCLEtBQUssTUFBTSxRQUFXLElBQUksTUFBTSxZQUFZLENBQUMsQ0FBQztBQUN0RixZQUFNLFNBQVMsd0JBQXdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLGdCQUFnQixDQUFDO0FBQ25GLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLFNBQVMsTUFBTSxHQUFHO0FBQUEsSUFDN0MsQ0FBQztBQUVELFNBQUssNENBQTRDLE1BQU07QUFDdEQsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsZ0JBQWdCLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDakcsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQztBQUNwRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLFlBQVksT0FBTyxTQUFTLE1BQU0sY0FBYztBQUFBLElBQ3hELENBQUM7QUFFRCxTQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFlBQU0sUUFBUSxNQUFNLElBQUksZ0JBQWdCLGNBQWMsTUFBTSxRQUFXLElBQUksTUFBTSxZQUFZLENBQUMsQ0FBQztBQUMvRixZQUFNLFNBQVMsd0JBQXdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLGdCQUFnQixDQUFDO0FBQ25GLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sZ0JBQWdCLFFBQVE7QUFBQSxRQUM5QixRQUFRLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDNUIsU0FBUyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQzlCLFNBQVMsRUFBRSxNQUFNLGNBQWMsYUFBYSxHQUFHLFdBQVcsR0FBRztBQUFBLE1BQzlELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFJRCxRQUFNLDhCQUE4QixNQUFNO0FBRXpDLFNBQUssaUNBQWlDLE1BQU07QUFDM0MsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IseUJBQXlCLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDMUcsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQztBQUNwRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLFlBQVksT0FBTyxTQUFTLE1BQU0sdUJBQXVCO0FBQUEsSUFDakUsQ0FBQztBQUVELFNBQUssaUNBQWlDLE1BQU07QUFDM0MsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IseUJBQXlCLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDMUcsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQztBQUNwRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLFlBQVksT0FBTyxTQUFTLE1BQU0sdUJBQXVCO0FBQUEsSUFDakUsQ0FBQztBQUVELFNBQUssdUJBQXVCLE1BQU07QUFDakMsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsbUJBQW1CLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDcEcsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQztBQUNwRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLFlBQVksT0FBTyxTQUFTLE1BQU0sWUFBWTtBQUFBLElBQ3RELENBQUM7QUFBQSxFQUNGLENBQUM7QUFJRCxRQUFNLGtDQUFrQyxNQUFNO0FBRTdDLFNBQUssa0NBQWtDLE1BQU07QUFDNUMsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsU0FBUyxNQUFNLFFBQVcsSUFBSSxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQzFGLFlBQU0sU0FBUyx3QkFBd0IsT0FBTyxJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsb0JBQW9CLENBQUM7QUFDdkYsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQU8sU0FBUyxNQUFNLE9BQU87QUFBQSxJQUNqRCxDQUFDO0FBRUQsU0FBSyxrQ0FBa0MsTUFBTTtBQUM1QyxZQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixTQUFTLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDMUYsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxvQkFBb0IsQ0FBQztBQUN2RixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLFlBQVksT0FBTyxTQUFTLE1BQU0sT0FBTztBQUFBLElBQ2pELENBQUM7QUFFRCxTQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLFlBQU0sUUFBUSxNQUFNLElBQUksZ0JBQWdCLGNBQWMsTUFBTSxRQUFXLElBQUksTUFBTSxZQUFZLENBQUMsQ0FBQztBQUMvRixZQUFNLFNBQVMsd0JBQXdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLG9CQUFvQixDQUFDO0FBQ3hGLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLFNBQVMsTUFBTSxRQUFRO0FBQUEsSUFDbEQsQ0FBQztBQUVELFNBQUssNkJBQTZCLE1BQU07QUFDdkMsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsY0FBYyxNQUFNLFFBQVcsSUFBSSxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQy9GLFlBQU0sU0FBUyx3QkFBd0IsT0FBTyxJQUFJLFNBQVMsR0FBRyxFQUFFLEdBQUcsb0JBQW9CLENBQUM7QUFDeEYsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQU8sU0FBUyxNQUFNLFFBQVE7QUFBQSxJQUNsRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBSUQsUUFBTSxjQUFjLE1BQU07QUFFekIsU0FBSywwQ0FBMEMsTUFBTTtBQUNwRCxZQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixTQUFTLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDMUYsWUFBTSxTQUFTLHdCQUF3QixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztBQUNuRixhQUFPLFlBQVksUUFBUSxNQUFTO0FBQUEsSUFDckMsQ0FBQztBQUVELFNBQUssMERBQTBELE1BQU07QUFDcEUsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsTUFBTSxNQUFNLFFBQVcsSUFBSSxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQ3ZGLFlBQU0sU0FBUyx3QkFBd0IsT0FBTyxJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsZ0JBQWdCLENBQUM7QUFDbkYsYUFBTyxZQUFZLFFBQVEsTUFBUztBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFlBQU0sUUFBUSxNQUFNLElBQUksZ0JBQWdCLFVBQVUsTUFBTSxRQUFXLElBQUksTUFBTSxZQUFZLENBQUMsQ0FBQztBQUMzRixZQUFNLFNBQVMsd0JBQXdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLGdCQUFnQixDQUFDO0FBQ25GLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLFNBQVMsSUFBSTtBQUN2QyxhQUFPLGdCQUFnQixPQUFPLFFBQVEsTUFBTSxjQUFjLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDOUUsQ0FBQztBQUVELFNBQUssOENBQThDLE1BQU07QUFDeEQsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsSUFBSSxNQUFNLFFBQVcsSUFBSSxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQ3JGLFlBQU0sU0FBUyx3QkFBd0IsT0FBTyxJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsZ0JBQWdCLENBQUM7QUFDbkYsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQU8sU0FBUyxJQUFJO0FBQUEsSUFDeEMsQ0FBQztBQUVELFNBQUssNERBQTRELE1BQU07QUFDdEUsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsWUFBWSxNQUFNLFFBQVcsSUFBSSxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQzdGLFlBQU0sU0FBUyx3QkFBd0IsT0FBTyxJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsZ0JBQWdCLEdBQUcsSUFBSTtBQUN6RixhQUFPLFlBQVksUUFBUSxNQUFTO0FBQUEsSUFDckMsQ0FBQztBQUVELFNBQUsscURBQXFELE1BQU07QUFDL0QsWUFBTSxRQUFRLE1BQU0sSUFBSSxnQkFBZ0IsYUFBYSxNQUFNLFFBQVcsSUFBSSxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQzlGLFlBQU0sU0FBUyx3QkFBd0IsT0FBTyxJQUFJLFNBQVMsR0FBRyxFQUFFLEdBQUcsZ0JBQWdCLEdBQUcsSUFBSTtBQUMxRixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLFlBQVksT0FBTyxTQUFTLE1BQU0sT0FBTztBQUFBLElBQ2pELENBQUM7QUFFRCxTQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFlBQU0sUUFBUSxNQUFNLElBQUksZ0JBQWdCLGFBQWEsTUFBTSxRQUFXLElBQUksTUFBTSxZQUFZLENBQUMsQ0FBQztBQUM5RixZQUFNLFNBQVMsd0JBQXdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLGdCQUFnQixHQUFHLElBQUk7QUFDMUYsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQU8sU0FBUyxNQUFNLE9BQU87QUFBQSxJQUNqRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sNkJBQTZCLE1BQU07QUFFeEMsTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLFlBQVEsSUFBSSxnQkFBZ0I7QUFBQSxFQUM3QixDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLFFBQU0sZUFBZSxDQUFDLEtBQUssR0FBRztBQUU5QixXQUFTLE1BQU0sTUFBYyxRQUFnQixVQUF5QjtBQUNyRSxVQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixNQUFNLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDdkYsV0FBTztBQUFBLE1BQ04sMEJBQTBCLE9BQU8sSUFBSSxTQUFTLEdBQUcsTUFBTSxHQUFHLFlBQVk7QUFBQSxNQUN0RTtBQUFBLE1BQ0EsUUFBUSxLQUFLLFVBQVUsSUFBSSxDQUFDLFdBQVcsTUFBTTtBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUVBLE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSxLQUFLLEdBQUcsSUFBSTtBQUFBLEVBQ25CLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFVBQU0sU0FBUyxHQUFHLElBQUk7QUFBQSxFQUN2QixDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDdkIsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsVUFBTSxlQUFlLElBQUksSUFBSTtBQUFBLEVBQzlCLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFVBQU0sZUFBZSxJQUFJLElBQUk7QUFBQSxFQUM5QixDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLFNBQVMsR0FBRyxLQUFLO0FBQUEsRUFDeEIsQ0FBQztBQUVELE9BQUssaURBQWlELE1BQU07QUFDM0QsVUFBTSxhQUFhLEdBQUcsS0FBSztBQUFBLEVBQzVCLENBQUM7QUFFRCxPQUFLLGlDQUFpQyxNQUFNO0FBQzNDLFVBQU0sSUFBSSxHQUFHLEtBQUs7QUFBQSxFQUNuQixDQUFDO0FBRUQsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxVQUFNLFVBQVUsR0FBRyxLQUFLO0FBQUEsRUFDekIsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFFaEUsVUFBTSxVQUFVLEdBQUcsS0FBSztBQUFBLEVBQ3pCLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFVBQU0sV0FBVyxHQUFHLEtBQUs7QUFBQSxFQUMxQixDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLFFBQVEsTUFBTSxJQUFJLGdCQUFnQixTQUFTLE1BQU0sUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDMUYsV0FBTyxZQUFZLDBCQUEwQixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLO0FBQUEsRUFDbkYsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
