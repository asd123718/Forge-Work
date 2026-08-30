import assert from "assert";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { SnippetParser, Variable } from "../../browser/snippetParser.js";
import { SnippetSession } from "../../browser/snippetSession.js";
import { createTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { TestLanguageConfigurationService } from "../../../../test/common/modes/testLanguageConfigurationService.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
suite("SnippetSession", function() {
  let languageConfigurationService;
  let editor;
  let model;
  function assertSelections(editor2, ...s) {
    for (const selection of editor2.getSelections()) {
      const actual = s.shift();
      assert.ok(selection.equalsSelection(actual), `actual=${selection.toString()} <> expected=${actual.toString()}`);
    }
    assert.strictEqual(s.length, 0);
  }
  setup(function() {
    model = createTextModel("function foo() {\n    console.log(a);\n}");
    languageConfigurationService = new TestLanguageConfigurationService();
    const serviceCollection = new ServiceCollection(
      [ILabelService, new class extends mock() {
      }()],
      [ILanguageConfigurationService, languageConfigurationService],
      [IWorkspaceContextService, new class extends mock() {
        getWorkspace() {
          return {
            id: "workspace-id",
            folders: []
          };
        }
      }()]
    );
    editor = createTestCodeEditor(model, { serviceCollection });
    editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5)]);
    assert.strictEqual(model.getEOL(), "\n");
  });
  teardown(function() {
    model.dispose();
    editor.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("normalize whitespace", function() {
    function assertNormalized(position, input, expected) {
      const snippet = new SnippetParser().parse(input);
      SnippetSession.adjustWhitespace(model, position, true, snippet);
      assert.strictEqual(snippet.toTextmateString(), expected);
    }
    assertNormalized(new Position(1, 1), "foo", "foo");
    assertNormalized(new Position(1, 1), "foo\rbar", "foo\nbar");
    assertNormalized(new Position(1, 1), "foo\rbar", "foo\nbar");
    assertNormalized(new Position(2, 5), "foo\r	bar", "foo\n        bar");
    assertNormalized(new Position(2, 3), "foo\r	bar", "foo\n    bar");
    assertNormalized(new Position(2, 5), "foo\r	bar\nfoo", "foo\n        bar\n    foo");
    assertNormalized(new Position(2, 5), "a\nb${1|foo,\nbar|}", "a\n    b${1|foo,\nbar|}");
  });
  test("adjust selection (overwrite[Before|After])", function() {
    let range = SnippetSession.adjustSelection(model, new Selection(1, 2, 1, 2), 1, 0);
    assert.ok(range.equalsRange(new Range(1, 1, 1, 2)));
    range = SnippetSession.adjustSelection(model, new Selection(1, 2, 1, 2), 1111, 0);
    assert.ok(range.equalsRange(new Range(1, 1, 1, 2)));
    range = SnippetSession.adjustSelection(model, new Selection(1, 2, 1, 2), 0, 10);
    assert.ok(range.equalsRange(new Range(1, 2, 1, 12)));
    range = SnippetSession.adjustSelection(model, new Selection(1, 2, 1, 2), 0, 10111);
    assert.ok(range.equalsRange(new Range(1, 2, 1, 17)));
  });
  test("text edits & selection", function() {
    const session = new SnippetSession(editor, "foo${1:bar}foo$0", void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(editor.getModel().getValue(), "foobarfoofunction foo() {\n    foobarfooconsole.log(a);\n}");
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    session.next();
    assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
  });
  test("text edit with reversed selection", function() {
    const session = new SnippetSession(editor, "${1:bar}$0", void 0, languageConfigurationService);
    editor.setSelections([new Selection(2, 5, 2, 5), new Selection(1, 1, 1, 1)]);
    session.insert();
    assert.strictEqual(model.getValue(), "barfunction foo() {\n    barconsole.log(a);\n}");
    assertSelections(editor, new Selection(2, 5, 2, 8), new Selection(1, 1, 1, 4));
  });
  test("snippets, repeated tabstops", function() {
    const session = new SnippetSession(editor, "${1:abc}foo${1:abc}$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(
      editor,
      new Selection(1, 1, 1, 4),
      new Selection(1, 7, 1, 10),
      new Selection(2, 5, 2, 8),
      new Selection(2, 11, 2, 14)
    );
    session.next();
    assertSelections(
      editor,
      new Selection(1, 10, 1, 10),
      new Selection(2, 14, 2, 14)
    );
  });
  test("snippets, just text", function() {
    const session = new SnippetSession(editor, "foobar", void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(model.getValue(), "foobarfunction foo() {\n    foobarconsole.log(a);\n}");
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
  });
  test("snippets, selections and new text with newlines", () => {
    const session = new SnippetSession(editor, "foo\n	${1:bar}\n$0", void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(editor.getModel().getValue(), "foo\n    bar\nfunction foo() {\n    foo\n        bar\n    console.log(a);\n}");
    assertSelections(editor, new Selection(2, 5, 2, 8), new Selection(5, 9, 5, 12));
    session.next();
    assertSelections(editor, new Selection(3, 1, 3, 1), new Selection(6, 5, 6, 5));
  });
  test("snippets, newline NO whitespace adjust", () => {
    editor.setSelection(new Selection(2, 5, 2, 5));
    const session = new SnippetSession(editor, "abc\n    foo\n        bar\n$0", { overwriteBefore: 0, overwriteAfter: 0, adjustWhitespace: false, clipboardText: void 0, overtypingCapturer: void 0 }, languageConfigurationService);
    session.insert();
    assert.strictEqual(editor.getModel().getValue(), "function foo() {\n    abc\n    foo\n        bar\nconsole.log(a);\n}");
  });
  test("snippets, selections -> next/prev", () => {
    const session = new SnippetSession(editor, "f$1oo${2:bar}foo$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(2, 6, 2, 6));
    session.next();
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    session.prev();
    assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(2, 6, 2, 6));
    session.next();
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    session.next();
    assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
  });
  test("snippets, selections & typing", function() {
    const session = new SnippetSession(editor, "f${1:oo}_$2_$0", void 0, languageConfigurationService);
    session.insert();
    editor.trigger("test", "type", { text: "X" });
    session.next();
    editor.trigger("test", "type", { text: "bar" });
    session.prev();
    assertSelections(editor, new Selection(1, 2, 1, 3), new Selection(2, 6, 2, 7));
    session.next();
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    session.next();
    assert.strictEqual(model.getValue(), "fX_bar_function foo() {\n    fX_bar_console.log(a);\n}");
    assertSelections(editor, new Selection(1, 8, 1, 8), new Selection(2, 12, 2, 12));
  });
  test("snippets, insert shorter snippet into non-empty selection", function() {
    model.setValue("foo_bar_foo");
    editor.setSelections([new Selection(1, 1, 1, 4), new Selection(1, 9, 1, 12)]);
    new SnippetSession(editor, "x$0", void 0, languageConfigurationService).insert();
    assert.strictEqual(model.getValue(), "x_bar_x");
    assertSelections(editor, new Selection(1, 2, 1, 2), new Selection(1, 8, 1, 8));
  });
  test("snippets, insert longer snippet into non-empty selection", function() {
    model.setValue("foo_bar_foo");
    editor.setSelections([new Selection(1, 1, 1, 4), new Selection(1, 9, 1, 12)]);
    new SnippetSession(editor, "LONGER$0", void 0, languageConfigurationService).insert();
    assert.strictEqual(model.getValue(), "LONGER_bar_LONGER");
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(1, 18, 1, 18));
  });
  test("snippets, don't grow final tabstop", function() {
    model.setValue("foo_zzz_foo");
    editor.setSelection(new Selection(1, 5, 1, 8));
    const session = new SnippetSession(editor, "$1bar$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 5, 1, 5));
    editor.trigger("test", "type", { text: "foo-" });
    session.next();
    assert.strictEqual(model.getValue(), "foo_foo-bar_foo");
    assertSelections(editor, new Selection(1, 12, 1, 12));
    editor.trigger("test", "type", { text: "XXX" });
    assert.strictEqual(model.getValue(), "foo_foo-barXXX_foo");
    session.prev();
    assertSelections(editor, new Selection(1, 5, 1, 9));
    session.next();
    assertSelections(editor, new Selection(1, 15, 1, 15));
  });
  test("snippets, don't merge touching tabstops 1/2", function() {
    const session = new SnippetSession(editor, "$1$2$3$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
    session.next();
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
    session.next();
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
    session.next();
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
    session.prev();
    session.prev();
    session.prev();
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
    editor.trigger("test", "type", { text: "111" });
    session.next();
    editor.trigger("test", "type", { text: "222" });
    session.next();
    editor.trigger("test", "type", { text: "333" });
    session.next();
    assert.strictEqual(model.getValue(), "111222333function foo() {\n    111222333console.log(a);\n}");
    assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
    session.prev();
    assertSelections(editor, new Selection(1, 7, 1, 10), new Selection(2, 11, 2, 14));
    session.prev();
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    session.prev();
    assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));
  });
  test("snippets, don't merge touching tabstops 2/2", function() {
    const session = new SnippetSession(editor, "$1$2$3$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
    editor.trigger("test", "type", { text: "111" });
    session.next();
    assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
    editor.trigger("test", "type", { text: "222" });
    session.next();
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
    editor.trigger("test", "type", { text: "333" });
    session.next();
    assert.strictEqual(session.isAtLastPlaceholder, true);
  });
  test("snippets, gracefully move over final tabstop", function() {
    const session = new SnippetSession(editor, "${1}bar$0", void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(session.isAtLastPlaceholder, false);
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
    session.next();
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
    session.next();
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
  });
  test("snippets, overwriting nested placeholder", function() {
    const session = new SnippetSession(editor, 'log(${1:"$2"});$0', void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 5, 1, 7), new Selection(2, 9, 2, 11));
    editor.trigger("test", "type", { text: "XXX" });
    assert.strictEqual(model.getValue(), "log(XXX);function foo() {\n    log(XXX);console.log(a);\n}");
    session.next();
    assert.strictEqual(session.isAtLastPlaceholder, false);
    session.next();
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 10, 1, 10), new Selection(2, 14, 2, 14));
  });
  test("snippets, selections and snippet ranges", function() {
    const session = new SnippetSession(editor, "${1:foo}farboo${2:bar}$0", void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(model.getValue(), "foofarboobarfunction foo() {\n    foofarboobarconsole.log(a);\n}");
    assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));
    assert.strictEqual(session.isSelectionWithinPlaceholders(), true);
    editor.setSelections([new Selection(1, 1, 1, 1)]);
    assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
    editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10)]);
    assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
    editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10), new Selection(1, 1, 1, 1)]);
    assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
    editor.setSelections([new Selection(1, 6, 1, 6), new Selection(2, 10, 2, 10), new Selection(2, 20, 2, 21)]);
    assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
    session.next();
    assert.strictEqual(session.isSelectionWithinPlaceholders(), true);
    assertSelections(editor, new Selection(1, 10, 1, 13), new Selection(2, 14, 2, 17));
    session.next();
    assert.strictEqual(session.isSelectionWithinPlaceholders(), true);
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 13, 1, 13), new Selection(2, 17, 2, 17));
  });
  test("snippets, nested sessions", function() {
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const first = new SnippetSession(editor, "foo${2:bar}foo$0", void 0, languageConfigurationService);
    first.insert();
    assert.strictEqual(model.getValue(), "foobarfoo");
    assertSelections(editor, new Selection(1, 4, 1, 7));
    const second = new SnippetSession(editor, "ba${1:zzzz}$0", void 0, languageConfigurationService);
    second.insert();
    assert.strictEqual(model.getValue(), "foobazzzzfoo");
    assertSelections(editor, new Selection(1, 6, 1, 10));
    second.next();
    assert.strictEqual(second.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 10, 1, 10));
    first.next();
    assert.strictEqual(first.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 13, 1, 13));
  });
  test("snippets, typing at final tabstop", function() {
    const session = new SnippetSession(editor, "farboo$0", void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
    editor.trigger("test", "type", { text: "XXX" });
    assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
  });
  test("snippets, typing at beginning", function() {
    editor.setSelection(new Selection(1, 2, 1, 2));
    const session = new SnippetSession(editor, "farboo$0", void 0, languageConfigurationService);
    session.insert();
    editor.setSelection(new Selection(1, 2, 1, 2));
    assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
    assert.strictEqual(session.isAtLastPlaceholder, true);
    editor.trigger("test", "type", { text: "XXX" });
    assert.strictEqual(model.getLineContent(1), "fXXXfarboounction foo() {");
    assert.strictEqual(session.isSelectionWithinPlaceholders(), false);
    session.next();
    assertSelections(editor, new Selection(1, 11, 1, 11));
  });
  test("snippets, typing with nested placeholder", function() {
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "This ${1:is ${2:nested}}.$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 6, 1, 15));
    session.next();
    assertSelections(editor, new Selection(1, 9, 1, 15));
    editor.trigger("test", "cut", {});
    assertSelections(editor, new Selection(1, 9, 1, 9));
    editor.trigger("test", "type", { text: "XXX" });
    session.prev();
    assertSelections(editor, new Selection(1, 6, 1, 12));
  });
  test("snippets, snippet with variables", function() {
    const session = new SnippetSession(editor, "@line=$TM_LINE_NUMBER$0", void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(model.getValue(), "@line=1function foo() {\n    @line=2console.log(a);\n}");
    assertSelections(editor, new Selection(1, 8, 1, 8), new Selection(2, 12, 2, 12));
  });
  test("snippets, merge", function() {
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "This ${1:is ${2:nested}}.$0", void 0, languageConfigurationService);
    session.insert();
    session.next();
    assertSelections(editor, new Selection(1, 9, 1, 15));
    session.merge("really ${1:nested}$0");
    assertSelections(editor, new Selection(1, 16, 1, 22));
    session.next();
    assertSelections(editor, new Selection(1, 22, 1, 22));
    assert.strictEqual(session.isAtLastPlaceholder, false);
    session.next();
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 23, 1, 23));
    session.prev();
    editor.trigger("test", "type", { text: "AAA" });
    session.prev();
    assertSelections(editor, new Selection(1, 16, 1, 22));
    session.prev();
    assertSelections(editor, new Selection(1, 6, 1, 25));
  });
  test("snippets, next does not throw when placeholder decorations are missing", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "${1:foo}$0", void 0, languageConfigurationService);
    session.insert();
    const decorationIds = editor.getModel().getAllDecorations().map((decoration) => decoration.id);
    assert.ok(decorationIds.length > 0);
    editor.getModel().changeDecorations((accessor) => {
      for (const decorationId of decorationIds) {
        accessor.removeDecoration(decorationId);
      }
    });
    assert.doesNotThrow(() => session.next());
  });
  test("snippets, deep merge does not produce phantom cursors (#279349)", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "\\sin\\left(${1:x}\\right) ", void 0, languageConfigurationService);
    session.insert();
    for (let i = 0; i < 25; i++) {
      session.merge("\\sin\\left(${1:x}\\right) ");
      assert.strictEqual(editor.getSelections().length, 1, `selection count after ${i + 1} merges`);
    }
  });
  test("snippets, merge preserves mirrors in nested snippet", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "(${1:x})", void 0, languageConfigurationService);
    session.insert();
    session.merge("${1:y}-${1}");
    assert.strictEqual(editor.getModel().getValue(), "(y-y)");
    assert.strictEqual(editor.getSelections().length, 2);
  });
  test("snippets, merge does not throw when placeholder occurrences collapse to same position", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "$1$1$0", void 0, languageConfigurationService);
    session.insert();
    assert.doesNotThrow(() => session.merge("${1:nested}$0"));
    assert.strictEqual(editor.getModel().getValue(), "nested");
  });
  test("snippets, transform", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "${1/foo/bar/}$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 1, 1, 1));
    editor.trigger("test", "type", { text: "foo" });
    session.next();
    assert.strictEqual(model.getValue(), "bar");
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 4, 1, 4));
  });
  test("snippets, multi placeholder same index one transform", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "$1 baz ${1/foo/bar/}$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(1, 6, 1, 6));
    editor.trigger("test", "type", { text: "foo" });
    session.next();
    assert.strictEqual(model.getValue(), "foo baz bar");
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 12, 1, 12));
  });
  test("snippets, transform example", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 1, 1, 5));
    editor.trigger("test", "type", { text: "clk" });
    session.next();
    assertSelections(editor, new Selection(1, 7, 1, 11));
    editor.trigger("test", "type", { text: "std_logic" });
    session.next();
    assertSelections(editor, new Selection(1, 16, 1, 16));
    session.next();
    assert.strictEqual(model.getValue(), "clk : std_logic;\n");
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(2, 1, 2, 1));
  });
  test("snippets, transform with indent", function() {
    const snippet = [
      "private readonly ${1} = new Emitter<$2>();",
      "readonly ${1/^_(.*)/$1/}: Event<$2> = this.$1.event;",
      "$0"
    ].join("\n");
    const expected = [
      "{",
      "	private readonly _prop = new Emitter<string>();",
      "	readonly prop: Event<string> = this._prop.event;",
      "	",
      "}"
    ].join("\n");
    const base = [
      "{",
      "	",
      "}"
    ].join("\n");
    editor.getModel().setValue(base);
    editor.getModel().updateOptions({ insertSpaces: false });
    editor.setSelection(new Selection(2, 2, 2, 2));
    const session = new SnippetSession(editor, snippet, void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(2, 19, 2, 19), new Selection(3, 11, 3, 11), new Selection(3, 28, 3, 28));
    editor.trigger("test", "type", { text: "_prop" });
    session.next();
    assertSelections(editor, new Selection(2, 39, 2, 39), new Selection(3, 23, 3, 23));
    editor.trigger("test", "type", { text: "string" });
    session.next();
    assert.strictEqual(model.getValue(), expected);
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(4, 2, 4, 2));
  });
  test("snippets, transform example hit if", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 1, 1, 5));
    editor.trigger("test", "type", { text: "clk" });
    session.next();
    assertSelections(editor, new Selection(1, 7, 1, 11));
    editor.trigger("test", "type", { text: "std_logic" });
    session.next();
    assertSelections(editor, new Selection(1, 16, 1, 16));
    editor.trigger("test", "type", { text: " := '1'" });
    session.next();
    assert.strictEqual(model.getValue(), "clk : std_logic := '1';\n");
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(2, 1, 2, 1));
  });
  test("Snippet tab stop selection issue #96545, snippets, transform adjacent to previous placeholder", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "${1:{}${2:fff}${1/{/}/}", void 0, languageConfigurationService);
    session.insert();
    assertSelections(editor, new Selection(1, 1, 1, 2), new Selection(1, 5, 1, 6));
    session.next();
    assert.strictEqual(model.getValue(), "{fff}");
    assertSelections(editor, new Selection(1, 2, 1, 5));
    editor.trigger("test", "type", { text: "ggg" });
    session.next();
    assert.strictEqual(model.getValue(), "{ggg}");
    assert.strictEqual(session.isAtLastPlaceholder, true);
    assertSelections(editor, new Selection(1, 6, 1, 6));
  });
  test("Snippet tab stop selection issue #96545", function() {
    editor.getModel().setValue("");
    const session = new SnippetSession(editor, "${1:{}${2:fff}${1/[\\{]/}/}$0", void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(editor.getModel().getValue(), "{fff{");
    assertSelections(editor, new Selection(1, 1, 1, 2), new Selection(1, 5, 1, 6));
    session.next();
    assertSelections(editor, new Selection(1, 2, 1, 5));
  });
  test("Snippet placeholder index incorrect after using 2+ snippets in a row that each end with a placeholder, #30769", function() {
    editor.getModel().setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    const session = new SnippetSession(editor, "test ${1:replaceme}", void 0, languageConfigurationService);
    session.insert();
    editor.trigger("test", "type", { text: "1" });
    editor.trigger("test", "type", { text: "\n" });
    assert.strictEqual(editor.getModel().getValue(), "test 1\n");
    session.merge("test ${1:replaceme}");
    editor.trigger("test", "type", { text: "2" });
    editor.trigger("test", "type", { text: "\n" });
    assert.strictEqual(editor.getModel().getValue(), "test 1\ntest 2\n");
    session.merge("test ${1:replaceme}");
    editor.trigger("test", "type", { text: "3" });
    editor.trigger("test", "type", { text: "\n" });
    assert.strictEqual(editor.getModel().getValue(), "test 1\ntest 2\ntest 3\n");
    session.merge("test ${1:replaceme}");
    editor.trigger("test", "type", { text: "4" });
    editor.trigger("test", "type", { text: "\n" });
    assert.strictEqual(editor.getModel().getValue(), "test 1\ntest 2\ntest 3\ntest 4\n");
  });
  test("Snippet variable text isn't whitespace normalised, #31124", function() {
    editor.getModel().setValue([
      "start",
      "		-one",
      "		-two",
      "end"
    ].join("\n"));
    editor.getModel().updateOptions({ insertSpaces: false });
    editor.setSelection(new Selection(2, 2, 3, 7));
    new SnippetSession(editor, "<div>\n	$TM_SELECTED_TEXT\n</div>$0", void 0, languageConfigurationService).insert();
    let expected = [
      "start",
      "	<div>",
      "			-one",
      "			-two",
      "	</div>",
      "end"
    ].join("\n");
    assert.strictEqual(editor.getModel().getValue(), expected);
    editor.getModel().setValue([
      "start",
      "		-one",
      "	-two",
      "end"
    ].join("\n"));
    editor.getModel().updateOptions({ insertSpaces: false });
    editor.setSelection(new Selection(2, 2, 3, 7));
    new SnippetSession(editor, "<div>\n	$TM_SELECTED_TEXT\n</div>$0", void 0, languageConfigurationService).insert();
    expected = [
      "start",
      "	<div>",
      "			-one",
      "		-two",
      "	</div>",
      "end"
    ].join("\n");
    assert.strictEqual(editor.getModel().getValue(), expected);
  });
  test("Selecting text from left to right, and choosing item messes up code, #31199", function() {
    const model2 = editor.getModel();
    model2.setValue("console.log");
    let actual = SnippetSession.adjustSelection(model2, new Selection(1, 12, 1, 9), 3, 0);
    assert.ok(actual.equalsSelection(new Selection(1, 9, 1, 6)));
    actual = SnippetSession.adjustSelection(model2, new Selection(1, 9, 1, 12), 3, 0);
    assert.ok(actual.equalsSelection(new Selection(1, 9, 1, 12)));
    editor.setSelections([new Selection(1, 9, 1, 12)]);
    new SnippetSession(editor, "far", { overwriteBefore: 3, overwriteAfter: 0, adjustWhitespace: true, clipboardText: void 0, overtypingCapturer: void 0 }, languageConfigurationService).insert();
    assert.strictEqual(model2.getValue(), "console.far");
  });
  test("Tabs don't get replaced with spaces in snippet transformations #103818", function() {
    const model2 = editor.getModel();
    model2.setValue("\n{\n  \n}");
    model2.updateOptions({ insertSpaces: true, indentSize: 2 });
    editor.setSelections([new Selection(1, 1, 1, 1), new Selection(3, 6, 3, 6)]);
    const session = new SnippetSession(editor, [
      "function animate () {",
      "	var ${1:a} = 12;",
      "	console.log(${1/(.*)/\n		$1\n	/})",
      "}"
    ].join("\n"), void 0, languageConfigurationService);
    session.insert();
    assert.strictEqual(model2.getValue(), [
      "function animate () {",
      "  var a = 12;",
      "  console.log(a)",
      "}",
      "{",
      "  function animate () {",
      "    var a = 12;",
      "    console.log(a)",
      "  }",
      "}"
    ].join("\n"));
    editor.trigger("test", "type", { text: "bbb" });
    session.next();
    assert.strictEqual(model2.getValue(), [
      "function animate () {",
      "  var bbb = 12;",
      "  console.log(",
      "    bbb",
      "  )",
      "}",
      "{",
      "  function animate () {",
      "    var bbb = 12;",
      "    console.log(",
      "      bbb",
      "    )",
      "  }",
      "}"
    ].join("\n"));
  });
  suite("createEditsAndSnippetsFromEdits", function() {
    test("empty", function() {
      const result = SnippetSession.createEditsAndSnippetsFromEdits(editor, [], true, true, void 0, void 0, languageConfigurationService);
      assert.deepStrictEqual(result.edits, []);
      assert.deepStrictEqual(result.snippets, []);
    });
    test("basic", function() {
      editor.getModel().setValue('foo("bar")');
      const result = SnippetSession.createEditsAndSnippetsFromEdits(
        editor,
        [{ range: new Range(1, 5, 1, 9), template: "$1" }, { range: new Range(1, 1, 1, 1), template: 'const ${1:new_const} = "bar"' }],
        true,
        true,
        void 0,
        void 0,
        languageConfigurationService
      );
      assert.strictEqual(result.edits.length, 2);
      assert.deepStrictEqual(result.edits[0].range, new Range(1, 1, 1, 1));
      assert.deepStrictEqual(result.edits[0].text, 'const new_const = "bar"');
      assert.deepStrictEqual(result.edits[1].range, new Range(1, 5, 1, 9));
      assert.deepStrictEqual(result.edits[1].text, "new_const");
      assert.strictEqual(result.snippets.length, 1);
      assert.strictEqual(result.snippets[0].isTrivialSnippet, false);
    });
    test("with $SELECTION variable", function() {
      editor.getModel().setValue("Some text and a selection");
      editor.setSelections([new Selection(1, 17, 1, 26)]);
      const result = SnippetSession.createEditsAndSnippetsFromEdits(
        editor,
        [{ range: new Range(1, 17, 1, 26), template: "wrapped <$SELECTION>" }],
        true,
        true,
        void 0,
        void 0,
        languageConfigurationService
      );
      assert.strictEqual(result.edits.length, 1);
      assert.deepStrictEqual(result.edits[0].range, new Range(1, 17, 1, 26));
      assert.deepStrictEqual(result.edits[0].text, "wrapped <selection>");
      assert.strictEqual(result.snippets.length, 1);
      assert.strictEqual(result.snippets[0].isTrivialSnippet, true);
    });
    test("$TM_SELECTED_TEXT resolves per edit, not the primary selection #206121", function() {
      editor.getModel().setValue("aaa\nbbb\nccc");
      editor.setSelections([new Selection(1, 1, 1, 4)]);
      const result = SnippetSession.createEditsAndSnippetsFromEdits(
        editor,
        [
          { range: new Range(2, 1, 2, 4), template: "[$TM_SELECTED_TEXT]" },
          { range: new Range(3, 1, 3, 4), template: "[$TM_SELECTED_TEXT]" }
        ],
        true,
        true,
        void 0,
        void 0,
        languageConfigurationService
      );
      assert.strictEqual(result.edits.length, 2);
      assert.deepStrictEqual(result.edits[0].range, new Range(2, 1, 2, 4));
      assert.deepStrictEqual(result.edits[0].text, "[bbb]");
      assert.deepStrictEqual(result.edits[1].range, new Range(3, 1, 3, 4));
      assert.deepStrictEqual(result.edits[1].text, "[ccc]");
    });
    test("$TM_LINE_NUMBER resolves per edit", function() {
      editor.getModel().setValue("a\nb\nc");
      editor.setSelections([new Selection(1, 1, 1, 1)]);
      const result = SnippetSession.createEditsAndSnippetsFromEdits(
        editor,
        [
          { range: new Range(1, 2, 1, 2), template: "$TM_LINE_NUMBER" },
          { range: new Range(3, 2, 3, 2), template: "$TM_LINE_NUMBER" }
        ],
        true,
        true,
        void 0,
        void 0,
        languageConfigurationService
      );
      assert.strictEqual(result.edits.length, 2);
      assert.deepStrictEqual(result.edits[0].text, "1");
      assert.deepStrictEqual(result.edits[1].text, "3");
    });
    test("per-edit resolution does not corrupt earlier edits when value lengths differ", function() {
      editor.getModel().setValue(Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join("\n"));
      editor.setSelections([new Selection(1, 1, 1, 1)]);
      const result = SnippetSession.createEditsAndSnippetsFromEdits(
        editor,
        [
          { range: new Range(1, 2, 1, 2), template: "$TM_LINE_NUMBER" },
          { range: new Range(100, 2, 100, 2), template: "$TM_LINE_NUMBER" }
        ],
        true,
        true,
        void 0,
        void 0,
        languageConfigurationService
      );
      assert.strictEqual(result.edits.length, 2);
      assert.deepStrictEqual(result.edits[0].text, "1");
      assert.deepStrictEqual(result.edits[1].text, "100");
    });
    test("$CURSOR_NUMBER uses caller-supplied edit order, not range-sorted order", function() {
      editor.getModel().setValue("xx\nyy");
      editor.setSelections([new Selection(1, 1, 1, 1)]);
      const result = SnippetSession.createEditsAndSnippetsFromEdits(
        editor,
        [
          { range: new Range(2, 3, 2, 3), template: "$CURSOR_NUMBER" },
          { range: new Range(1, 3, 1, 3), template: "$CURSOR_NUMBER" }
        ],
        true,
        true,
        void 0,
        void 0,
        languageConfigurationService
      );
      assert.strictEqual(result.edits.length, 2);
      assert.deepStrictEqual(result.edits[0].range, new Range(1, 3, 1, 3));
      assert.deepStrictEqual(result.edits[0].text, "2");
      assert.deepStrictEqual(result.edits[1].range, new Range(2, 3, 2, 3));
      assert.deepStrictEqual(result.edits[1].text, "1");
    });
    test("cross-edit placeholder backfill resolves variables in earlier edit", function() {
      editor.getModel().setValue("aaa\nbbb");
      editor.setSelections([new Selection(1, 1, 1, 1)]);
      const result = SnippetSession.createEditsAndSnippetsFromEdits(
        editor,
        [
          { range: new Range(1, 2, 1, 2), template: "$1" },
          { range: new Range(2, 2, 2, 2), template: "${1:$TM_LINE_NUMBER}" }
        ],
        true,
        true,
        void 0,
        void 0,
        languageConfigurationService
      );
      let hasUnresolvedVariable = false;
      const innerSnippet = result.snippets[0]._snippet;
      innerSnippet.walk((marker) => {
        if (marker instanceof Variable && marker.children.length === 0) {
          hasUnresolvedVariable = true;
        }
        return true;
      });
      assert.strictEqual(hasUnresolvedVariable, false, "backfilled $TM_LINE_NUMBER in earlier edit should be resolved");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNuaXBwZXRcXHRlc3RcXGJyb3dzZXJcXHNuaXBwZXRTZXNzaW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0UGFyc2VyLCBWYXJpYWJsZSwgdHlwZSBUZXh0bWF0ZVNuaXBwZXQgfSBmcm9tICcuLi8uLi9icm93c2VyL3NuaXBwZXRQYXJzZXIuanMnO1xuaW1wb3J0IHsgU25pcHBldFNlc3Npb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3NuaXBwZXRTZXNzaW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vbW9kZXMvdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG5zdWl0ZSgnU25pcHBldFNlc3Npb24nLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcjtcblx0bGV0IG1vZGVsOiBUZXh0TW9kZWw7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLCAuLi5zOiBTZWxlY3Rpb25bXSkge1xuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkpIHtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IHMuc2hpZnQoKSE7XG5cdFx0XHRhc3NlcnQub2soc2VsZWN0aW9uLmVxdWFsc1NlbGVjdGlvbihhY3R1YWwpLCBgYWN0dWFsPSR7c2VsZWN0aW9uLnRvU3RyaW5nKCl9IDw+IGV4cGVjdGVkPSR7YWN0dWFsLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzLmxlbmd0aCwgMCk7XG5cdH1cblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2Z1bmN0aW9uIGZvbygpIHtcXG4gICAgY29uc29sZS5sb2coYSk7XFxufScpO1xuXHRcdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTGFiZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYWJlbFNlcnZpY2U+KCkgeyB9XSxcblx0XHRcdFtJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZV0sXG5cdFx0XHRbSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFdvcmtzcGFjZSgpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2UtaWQnLFxuXHRcdFx0XHRcdFx0Zm9sZGVyczogW10sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0KTtcblx0XHRlZGl0b3IgPSBjcmVhdGVUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBzZXJ2aWNlQ29sbGVjdGlvbiB9KSBhcyBJQWN0aXZlQ29kZUVkaXRvcjtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigyLCA1LCAyLCA1KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRFT0woKSwgJ1xcbicpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdGVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZSB3aGl0ZXNwYWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0Tm9ybWFsaXplZChwb3NpdGlvbjogSVBvc2l0aW9uLCBpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZShpbnB1dCk7XG5cdFx0XHRTbmlwcGV0U2Vzc2lvbi5hZGp1c3RXaGl0ZXNwYWNlKG1vZGVsLCBwb3NpdGlvbiwgdHJ1ZSwgc25pcHBldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC50b1RleHRtYXRlU3RyaW5nKCksIGV4cGVjdGVkKTtcblx0XHR9XG5cblx0XHRhc3NlcnROb3JtYWxpemVkKG5ldyBQb3NpdGlvbigxLCAxKSwgJ2ZvbycsICdmb28nKTtcblx0XHRhc3NlcnROb3JtYWxpemVkKG5ldyBQb3NpdGlvbigxLCAxKSwgJ2Zvb1xccmJhcicsICdmb29cXG5iYXInKTtcblx0XHRhc3NlcnROb3JtYWxpemVkKG5ldyBQb3NpdGlvbigxLCAxKSwgJ2Zvb1xccmJhcicsICdmb29cXG5iYXInKTtcblx0XHRhc3NlcnROb3JtYWxpemVkKG5ldyBQb3NpdGlvbigyLCA1KSwgJ2Zvb1xcclxcdGJhcicsICdmb29cXG4gICAgICAgIGJhcicpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZWQobmV3IFBvc2l0aW9uKDIsIDMpLCAnZm9vXFxyXFx0YmFyJywgJ2Zvb1xcbiAgICBiYXInKTtcblx0XHRhc3NlcnROb3JtYWxpemVkKG5ldyBQb3NpdGlvbigyLCA1KSwgJ2Zvb1xcclxcdGJhclxcbmZvbycsICdmb29cXG4gICAgICAgIGJhclxcbiAgICBmb28nKTtcblxuXHRcdC8vSW5kZW50YXRpb24gaXNzdWUgd2l0aCBjaG9pY2UgZWxlbWVudHMgdGhhdCBzcGFuIG11bHRpcGxlIGxpbmVzICM0NjI2NlxuXHRcdGFzc2VydE5vcm1hbGl6ZWQobmV3IFBvc2l0aW9uKDIsIDUpLCAnYVxcbmIkezF8Zm9vLFxcbmJhcnx9JywgJ2FcXG4gICAgYiR7MXxmb28sXFxuYmFyfH0nKTtcblx0fSk7XG5cblx0dGVzdCgnYWRqdXN0IHNlbGVjdGlvbiAob3ZlcndyaXRlW0JlZm9yZXxBZnRlcl0pJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHJhbmdlID0gU25pcHBldFNlc3Npb24uYWRqdXN0U2VsZWN0aW9uKG1vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpLCAxLCAwKTtcblx0XHRhc3NlcnQub2socmFuZ2UuZXF1YWxzUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDIpKSk7XG5cdFx0cmFuZ2UgPSBTbmlwcGV0U2Vzc2lvbi5hZGp1c3RTZWxlY3Rpb24obW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksIDExMTEsIDApO1xuXHRcdGFzc2VydC5vayhyYW5nZS5lcXVhbHNSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMikpKTtcblx0XHRyYW5nZSA9IFNuaXBwZXRTZXNzaW9uLmFkanVzdFNlbGVjdGlvbihtb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSwgMCwgMTApO1xuXHRcdGFzc2VydC5vayhyYW5nZS5lcXVhbHNSYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgMTIpKSk7XG5cdFx0cmFuZ2UgPSBTbmlwcGV0U2Vzc2lvbi5hZGp1c3RTZWxlY3Rpb24obW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksIDAsIDEwMTExKTtcblx0XHRhc3NlcnQub2socmFuZ2UuZXF1YWxzUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDE3KSkpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ3RleHQgZWRpdHMgJiBzZWxlY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICdmb28kezE6YmFyfWZvbyQwJywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ2Zvb2JhcmZvb2Z1bmN0aW9uIGZvbygpIHtcXG4gICAgZm9vYmFyZm9vY29uc29sZS5sb2coYSk7XFxufScpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgOCwgMiwgMTEpKTtcblx0XHRzZXNzaW9uLm5leHQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTApLCBuZXcgU2VsZWN0aW9uKDIsIDE0LCAyLCAxNCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXh0IGVkaXQgd2l0aCByZXZlcnNlZCBzZWxlY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJyR7MTpiYXJ9JDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSk7XG5cblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnYmFyZnVuY3Rpb24gZm9vKCkge1xcbiAgICBiYXJjb25zb2xlLmxvZyhhKTtcXG59Jyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgOCksIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgcmVwZWF0ZWQgdGFic3RvcHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICckezE6YWJjfWZvbyR7MTphYmN9JDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDEwKSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgOCksIG5ldyBTZWxlY3Rpb24oMiwgMTEsIDIsIDE0KSxcblx0XHQpO1xuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTApLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxNCwgMiwgMTQpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCBqdXN0IHRleHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICdmb29iYXInLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdmb29iYXJmdW5jdGlvbiBmb28oKSB7XFxuICAgIGZvb2JhcmNvbnNvbGUubG9nKGEpO1xcbn0nKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCAxMSwgMiwgMTEpKTtcblx0fSk7XG5cblx0dGVzdCgnc25pcHBldHMsIHNlbGVjdGlvbnMgYW5kIG5ldyB0ZXh0IHdpdGggbmV3bGluZXMnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJ2Zvb1xcblxcdCR7MTpiYXJ9XFxuJDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksICdmb29cXG4gICAgYmFyXFxuZnVuY3Rpb24gZm9vKCkge1xcbiAgICBmb29cXG4gICAgICAgIGJhclxcbiAgICBjb25zb2xlLmxvZyhhKTtcXG59Jyk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigyLCA1LCAyLCA4KSwgbmV3IFNlbGVjdGlvbig1LCA5LCA1LCAxMikpO1xuXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSksIG5ldyBTZWxlY3Rpb24oNiwgNSwgNiwgNSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgbmV3bGluZSBOTyB3aGl0ZXNwYWNlIGFkanVzdCcsICgpID0+IHtcblxuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCA1LCAyLCA1KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICdhYmNcXG4gICAgZm9vXFxuICAgICAgICBiYXJcXG4kMCcsIHsgb3ZlcndyaXRlQmVmb3JlOiAwLCBvdmVyd3JpdGVBZnRlcjogMCwgYWRqdXN0V2hpdGVzcGFjZTogZmFsc2UsIGNsaXBib2FyZFRleHQ6IHVuZGVmaW5lZCwgb3ZlcnR5cGluZ0NhcHR1cmVyOiB1bmRlZmluZWQgfSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vzc2lvbi5pbnNlcnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksICdmdW5jdGlvbiBmb28oKSB7XFxuICAgIGFiY1xcbiAgICBmb29cXG4gICAgICAgIGJhclxcbmNvbnNvbGUubG9nKGEpO1xcbn0nKTtcblx0fSk7XG5cblx0dGVzdCgnc25pcHBldHMsIHNlbGVjdGlvbnMgLT4gbmV4dC9wcmV2JywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICdmJDFvbyR7MjpiYXJ9Zm9vJDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHQvLyBAICQyXG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksIG5ldyBTZWxlY3Rpb24oMiwgNiwgMiwgNikpO1xuXHRcdC8vIEAgJDFcblx0XHRzZXNzaW9uLm5leHQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCA4LCAyLCAxMSkpO1xuXHRcdC8vIEAgJDJcblx0XHRzZXNzaW9uLnByZXYoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSwgbmV3IFNlbGVjdGlvbigyLCA2LCAyLCA2KSk7XG5cdFx0Ly8gQCAkMVxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDcpLCBuZXcgU2VsZWN0aW9uKDIsIDgsIDIsIDExKSk7XG5cdFx0Ly8gQCAkMFxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMCksIG5ldyBTZWxlY3Rpb24oMiwgMTQsIDIsIDE0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCBzZWxlY3Rpb25zICYgdHlwaW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnZiR7MTpvb31fJDJfJDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnWCcgfSk7XG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ2JhcicgfSk7XG5cblx0XHQvLyBnbyBiYWNrIHRvICR7Mjpvb30gd2hpY2ggaXMgbm93IGp1c3QgJ1gnXG5cdFx0c2Vzc2lvbi5wcmV2KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMyksIG5ldyBTZWxlY3Rpb24oMiwgNiwgMiwgNykpO1xuXG5cdFx0Ly8gZ28gZm9yd2FyZCB0byAkMSB3aGljaCBpcyBub3cgJ2Jhcidcblx0XHRzZXNzaW9uLm5leHQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCA4LCAyLCAxMSkpO1xuXG5cdFx0Ly8gZ28gdG8gZmluYWwgdGFic3RvcFxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnZlhfYmFyX2Z1bmN0aW9uIGZvbygpIHtcXG4gICAgZlhfYmFyX2NvbnNvbGUubG9nKGEpO1xcbn0nKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSwgbmV3IFNlbGVjdGlvbigyLCAxMiwgMiwgMTIpKTtcblx0fSk7XG5cblx0dGVzdCgnc25pcHBldHMsIGluc2VydCBzaG9ydGVyIHNuaXBwZXQgaW50byBub24tZW1wdHkgc2VsZWN0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdG1vZGVsLnNldFZhbHVlKCdmb29fYmFyX2ZvbycpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDEyKV0pO1xuXG5cdFx0bmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJ3gkMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkuaW5zZXJ0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICd4X2Jhcl94Jyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgaW5zZXJ0IGxvbmdlciBzbmlwcGV0IGludG8gbm9uLWVtcHR5IHNlbGVjdGlvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnZm9vX2Jhcl9mb28nKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCAxMildKTtcblxuXHRcdG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICdMT05HRVIkMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkuaW5zZXJ0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdMT05HRVJfYmFyX0xPTkdFUicpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpLCBuZXcgU2VsZWN0aW9uKDEsIDE4LCAxLCAxOCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgZG9uXFwndCBncm93IGZpbmFsIHRhYnN0b3AnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJ2Zvb196enpfZm9vJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDgpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJyQxYmFyJDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ2Zvby0nIH0pO1xuXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdmb29fZm9vLWJhcl9mb28nKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdYWFgnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnZm9vX2Zvby1iYXJYWFhfZm9vJyk7XG5cdFx0c2Vzc2lvbi5wcmV2KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgOSkpO1xuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDE1LCAxLCAxNSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgZG9uXFwndCBtZXJnZSB0b3VjaGluZyB0YWJzdG9wcyAxLzInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJyQxJDIkMyQwJywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblxuXHRcdHNlc3Npb24ucHJldigpO1xuXHRcdHNlc3Npb24ucHJldigpO1xuXHRcdHNlc3Npb24ucHJldigpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnMTExJyB9KTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICcyMjInIH0pO1xuXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJzMzMycgfSk7XG5cblx0XHRzZXNzaW9uLm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJzExMTIyMjMzM2Z1bmN0aW9uIGZvbygpIHtcXG4gICAgMTExMjIyMzMzY29uc29sZS5sb2coYSk7XFxufScpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMCksIG5ldyBTZWxlY3Rpb24oMiwgMTQsIDIsIDE0KSk7XG5cblx0XHRzZXNzaW9uLnByZXYoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCAxMCksIG5ldyBTZWxlY3Rpb24oMiwgMTEsIDIsIDE0KSk7XG5cdFx0c2Vzc2lvbi5wcmV2KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgOCwgMiwgMTEpKTtcblx0XHRzZXNzaW9uLnByZXYoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSwgbmV3IFNlbGVjdGlvbigyLCA1LCAyLCA4KSk7XG5cdH0pO1xuXHR0ZXN0KCdzbmlwcGV0cywgZG9uXFwndCBtZXJnZSB0b3VjaGluZyB0YWJzdG9wcyAyLzInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJyQxJDIkMyQwJywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICcxMTEnIH0pO1xuXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMiwgOCwgMiwgOCkpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICcyMjInIH0pO1xuXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgMTEsIDIsIDExKSk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJzMzMycgfSk7XG5cblx0XHRzZXNzaW9uLm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0F0TGFzdFBsYWNlaG9sZGVyLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc25pcHBldHMsIGdyYWNlZnVsbHkgbW92ZSBvdmVyIGZpbmFsIHRhYnN0b3AnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICckezF9YmFyJDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0F0TGFzdFBsYWNlaG9sZGVyLCBmYWxzZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksIG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSkpO1xuXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBdExhc3RQbGFjZWhvbGRlciwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMiwgOCwgMiwgOCkpO1xuXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBdExhc3RQbGFjZWhvbGRlciwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMiwgOCwgMiwgOCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgb3ZlcndyaXRpbmcgbmVzdGVkIHBsYWNlaG9sZGVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnbG9nKCR7MTpcIiQyXCJ9KTskMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vzc2lvbi5pbnNlcnQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCA5LCAyLCAxMSkpO1xuXG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ1hYWCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdsb2coWFhYKTtmdW5jdGlvbiBmb28oKSB7XFxuICAgIGxvZyhYWFgpO2NvbnNvbGUubG9nKGEpO1xcbn0nKTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXRMYXN0UGxhY2Vob2xkZXIsIGZhbHNlKTtcblx0XHQvLyBhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCAxMSwgMiwgMTEpKTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXRMYXN0UGxhY2Vob2xkZXIsIHRydWUpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMCksIG5ldyBTZWxlY3Rpb24oMiwgMTQsIDIsIDE0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCBzZWxlY3Rpb25zIGFuZCBzbmlwcGV0IHJhbmdlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJyR7MTpmb299ZmFyYm9vJHsyOmJhcn0kMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vzc2lvbi5pbnNlcnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2Zvb2ZhcmJvb2JhcmZ1bmN0aW9uIGZvbygpIHtcXG4gICAgZm9vZmFyYm9vYmFyY29uc29sZS5sb2coYSk7XFxufScpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzU2VsZWN0aW9uV2l0aGluUGxhY2Vob2xkZXJzKCksIHRydWUpO1xuXG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1NlbGVjdGlvbldpdGhpblBsYWNlaG9sZGVycygpLCBmYWxzZSk7XG5cblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigyLCAxMCwgMiwgMTApXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNTZWxlY3Rpb25XaXRoaW5QbGFjZWhvbGRlcnMoKSwgZmFsc2UpOyAvLyBpbiBzbmlwcGV0LCBvdXRzaWRlIHBsYWNlaG9sZGVyXG5cblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigyLCAxMCwgMiwgMTApLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNTZWxlY3Rpb25XaXRoaW5QbGFjZWhvbGRlcnMoKSwgZmFsc2UpOyAvLyBpbiBzbmlwcGV0LCBvdXRzaWRlIHBsYWNlaG9sZGVyXG5cblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigyLCAxMCwgMiwgMTApLCBuZXcgU2VsZWN0aW9uKDIsIDIwLCAyLCAyMSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1NlbGVjdGlvbldpdGhpblBsYWNlaG9sZGVycygpLCBmYWxzZSk7XG5cblx0XHQvLyByZXNldCBzZWxlY3Rpb24gdG8gcGxhY2Vob2xkZXJcblx0XHRzZXNzaW9uLm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1NlbGVjdGlvbldpdGhpblBsYWNlaG9sZGVycygpLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTMpLCBuZXcgU2VsZWN0aW9uKDIsIDE0LCAyLCAxNykpO1xuXG5cdFx0Ly8gcmVzZXQgc2VsZWN0aW9uIHRvIHBsYWNlaG9sZGVyXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNTZWxlY3Rpb25XaXRoaW5QbGFjZWhvbGRlcnMoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBdExhc3RQbGFjZWhvbGRlciwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDEzKSwgbmV3IFNlbGVjdGlvbigyLCAxNywgMiwgMTcpKTtcblx0fSk7XG5cblx0dGVzdCgnc25pcHBldHMsIG5lc3RlZCBzZXNzaW9ucycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdG1vZGVsLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnZm9vJHsyOmJhcn1mb28kMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Zmlyc3QuaW5zZXJ0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdmb29iYXJmb28nKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA3KSk7XG5cblx0XHRjb25zdCBzZWNvbmQgPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnYmEkezE6enp6en0kMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vjb25kLmluc2VydCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnZm9vYmF6enp6Zm9vJyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgMTApKTtcblxuXHRcdHNlY29uZC5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5pc0F0TGFzdFBsYWNlaG9sZGVyLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTApKTtcblxuXHRcdGZpcnN0Lm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuaXNBdExhc3RQbGFjZWhvbGRlciwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDEzKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCB0eXBpbmcgYXQgZmluYWwgdGFic3RvcCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnZmFyYm9vJDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBdExhc3RQbGFjZWhvbGRlciwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNTZWxlY3Rpb25XaXRoaW5QbGFjZWhvbGRlcnMoKSwgZmFsc2UpO1xuXG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ1hYWCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNTZWxlY3Rpb25XaXRoaW5QbGFjZWhvbGRlcnMoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgdHlwaW5nIGF0IGJlZ2lubmluZycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICdmYXJib28kMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vzc2lvbi5pbnNlcnQoKTtcblxuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNTZWxlY3Rpb25XaXRoaW5QbGFjZWhvbGRlcnMoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXRMYXN0UGxhY2Vob2xkZXIsIHRydWUpO1xuXG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ1hYWCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnZlhYWGZhcmJvb3VuY3Rpb24gZm9vKCkgeycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzU2VsZWN0aW9uV2l0aGluUGxhY2Vob2xkZXJzKCksIGZhbHNlKTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDExLCAxLCAxMSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgdHlwaW5nIHdpdGggbmVzdGVkIHBsYWNlaG9sZGVyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJ1RoaXMgJHsxOmlzICR7MjpuZXN0ZWR9fS4kMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vzc2lvbi5pbnNlcnQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCAxNSkpO1xuXG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgMTUpKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ2N1dCcsIHt9KTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCA5KSk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnWFhYJyB9KTtcblx0XHRzZXNzaW9uLnByZXYoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCAxMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgc25pcHBldCB3aXRoIHZhcmlhYmxlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJ0BsaW5lPSRUTV9MSU5FX05VTUJFUiQwJywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdAbGluZT0xZnVuY3Rpb24gZm9vKCkge1xcbiAgICBAbGluZT0yY29uc29sZS5sb2coYSk7XFxufScpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDgpLCBuZXcgU2VsZWN0aW9uKDIsIDEyLCAyLCAxMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgbWVyZ2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJ1RoaXMgJHsxOmlzICR7MjpuZXN0ZWR9fS4kMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vzc2lvbi5pbnNlcnQoKTtcblx0XHRzZXNzaW9uLm5leHQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCAxNSkpO1xuXG5cdFx0c2Vzc2lvbi5tZXJnZSgncmVhbGx5ICR7MTpuZXN0ZWR9JDAnKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxNiwgMSwgMjIpKTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDIyLCAxLCAyMikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXRMYXN0UGxhY2Vob2xkZXIsIGZhbHNlKTtcblxuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXRMYXN0UGxhY2Vob2xkZXIsIHRydWUpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDIzLCAxLCAyMykpO1xuXG5cdFx0c2Vzc2lvbi5wcmV2KCk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ0FBQScgfSk7XG5cblx0XHQvLyBiYWNrIHRvIGByZWFsbHkgJHsxOm5lc3RlZH1gXG5cdFx0c2Vzc2lvbi5wcmV2KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMTYsIDEsIDIyKSk7XG5cblx0XHQvLyBiYWNrIHRvIGAkezE6aXMgLi4ufWAgd2hpY2ggbm93IGdyZXdcblx0XHRzZXNzaW9uLnByZXYoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCAyNSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgbmV4dCBkb2VzIG5vdCB0aHJvdyB3aGVuIHBsYWNlaG9sZGVyIGRlY29yYXRpb25zIGFyZSBtaXNzaW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdGVkaXRvci5nZXRNb2RlbCgpLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICckezE6Zm9vfSQwJywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbklkcyA9IGVkaXRvci5nZXRNb2RlbCgpLmdldEFsbERlY29yYXRpb25zKCkubWFwKGRlY29yYXRpb24gPT4gZGVjb3JhdGlvbi5pZCk7XG5cdFx0YXNzZXJ0Lm9rKGRlY29yYXRpb25JZHMubGVuZ3RoID4gMCk7XG5cdFx0ZWRpdG9yLmdldE1vZGVsKCkuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uSWQgb2YgZGVjb3JhdGlvbklkcykge1xuXHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKGRlY29yYXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHNlc3Npb24ubmV4dCgpKTtcblx0fSk7XG5cblx0dGVzdCgnc25pcHBldHMsIGRlZXAgbWVyZ2UgZG9lcyBub3QgcHJvZHVjZSBwaGFudG9tIGN1cnNvcnMgKCMyNzkzNDkpJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIFJlY3Vyc2l2ZWx5IGV4cGFuZGluZyBhIHNuaXBwZXQgKGUuZy4gXFxzaW5cXGxlZnQoJHsxOnh9XFxyaWdodCkpIHVzZWQgdG8gYXNzaWduXG5cdFx0Ly8gZnJhY3Rpb25hbCBwbGFjZWhvbGRlciBpbmRpY2llcy4gQWZ0ZXIgfjE2IG5lc3RpbmdzLCBkb3VibGUtcHJlY2lzaW9uIHJvdW5kaW5nXG5cdFx0Ly8gY29sbGFwc2VkIGRpc3RpbmN0IHBsYWNlaG9sZGVycyBvbnRvIHRoZSBzYW1lIGluZGV4LCBwcm9kdWNpbmcgYSBwaGFudG9tIGN1cnNvci5cblx0XHRlZGl0b3IuZ2V0TW9kZWwoKS5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJ1xcXFxzaW5cXFxcbGVmdCgkezE6eH1cXFxccmlnaHQpICcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vzc2lvbi5pbnNlcnQoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDI1OyBpKyspIHtcblx0XHRcdHNlc3Npb24ubWVyZ2UoJ1xcXFxzaW5cXFxcbGVmdCgkezE6eH1cXFxccmlnaHQpICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLmxlbmd0aCwgMSwgYHNlbGVjdGlvbiBjb3VudCBhZnRlciAke2kgKyAxfSBtZXJnZXNgKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCBtZXJnZSBwcmVzZXJ2ZXMgbWlycm9ycyBpbiBuZXN0ZWQgc25pcHBldCcsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBOZXN0ZWQgc25pcHBldHMgdGhhdCB0aGVtc2VsdmVzIGNvbnRhaW4gbWlycm9ycyAoJDEuLi4kMSkgbXVzdCBzdGlsbFxuXHRcdC8vIHByb2R1Y2UgbXVsdGktY3Vyc29yIHNlbGVjdGlvbnMgYWZ0ZXIgcmVub3JtYWxpemF0aW9uIG9mIHBsYWNlaG9sZGVyXG5cdFx0Ly8gaW5kaWNpZXMsIHNpbmNlIHRoZSByZW5vcm1hbGl6ZSBzdGVwIG1hcHMgZWFjaCB1bmlxdWUgb2xkIGluZGV4IHRvIGFcblx0XHQvLyBzaW5nbGUgbmV3IGluZGV4LlxuXHRcdGVkaXRvci5nZXRNb2RlbCgpLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnKCR7MTp4fSknLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cdFx0c2Vzc2lvbi5tZXJnZSgnJHsxOnl9LSR7MX0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkuZ2V0VmFsdWUoKSwgJyh5LXkpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCBtZXJnZSBkb2VzIG5vdCB0aHJvdyB3aGVuIHBsYWNlaG9sZGVyIG9jY3VycmVuY2VzIGNvbGxhcHNlIHRvIHNhbWUgcG9zaXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gJDEkMSBwbGFjZXMgdHdvIHplcm8td2lkdGggb2NjdXJyZW5jZXMgb2YgdGhlIHNhbWUgcGxhY2Vob2xkZXIgYXQgdGhlIHNhbWUgcG9zaXRpb247XG5cdFx0Ly8gdGhlIGVkaXRvcidzIGN1cnNvciBub3JtYWxpemF0aW9uIGNvbGxhcHNlcyB0aGVzZSBpbnRvIG9uZSBzZWxlY3Rpb24uIFByZXZpb3VzbHkgdGhpc1xuXHRcdC8vIGNhdXNlZCBtZXJnZSgpIHRvIGNyYXNoIGJlY2F1c2UgdGhlcmUgd2VyZSBtb3JlIHBsYWNlaG9sZGVyIG9jY3VycmVuY2VzIHRoYW4gbmVzdGVkIHNuaXBwZXRzLlxuXHRcdGVkaXRvci5nZXRNb2RlbCgpLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnJDEkMSQwJywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXG5cdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiBzZXNzaW9uLm1lcmdlKCckezE6bmVzdGVkfSQwJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKS5nZXRWYWx1ZSgpLCAnbmVzdGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCB0cmFuc2Zvcm0nLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnJHsxL2Zvby9iYXIvfSQwJywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdmb28nIH0pO1xuXHRcdHNlc3Npb24ubmV4dCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0F0TGFzdFBsYWNlaG9sZGVyLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCBtdWx0aSBwbGFjZWhvbGRlciBzYW1lIGluZGV4IG9uZSB0cmFuc2Zvcm0nLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnJDEgYmF6ICR7MS9mb28vYmFyL30kMCcsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0c2Vzc2lvbi5pbnNlcnQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnZm9vJyB9KTtcblx0XHRzZXNzaW9uLm5leHQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnZm9vIGJheiBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0F0TGFzdFBsYWNlaG9sZGVyLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpKTtcblx0fSk7XG5cblx0dGVzdCgnc25pcHBldHMsIHRyYW5zZm9ybSBleGFtcGxlJywgZnVuY3Rpb24gKCkge1xuXHRcdGVkaXRvci5nZXRNb2RlbCgpIS5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJyR7MTpuYW1lfSA6ICR7Mjp0eXBlfSR7My9cXFxcczo9KC4qKS8kezE6KyA6PX0kezF9L307XFxuJDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCA1KSk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ2NsaycgfSk7XG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCAxMSkpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdzdGRfbG9naWMnIH0pO1xuXHRcdHNlc3Npb24ubmV4dCgpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMTYsIDEsIDE2KSk7XG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2NsayA6IHN0ZF9sb2dpYztcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0F0TGFzdFBsYWNlaG9sZGVyLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzLCB0cmFuc2Zvcm0gd2l0aCBpbmRlbnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc25pcHBldCA9IFtcblx0XHRcdCdwcml2YXRlIHJlYWRvbmx5ICR7MX0gPSBuZXcgRW1pdHRlcjwkMj4oKTsnLFxuXHRcdFx0J3JlYWRvbmx5ICR7MS9eXyguKikvJDEvfTogRXZlbnQ8JDI+ID0gdGhpcy4kMS5ldmVudDsnLFxuXHRcdFx0JyQwJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnXFx0cHJpdmF0ZSByZWFkb25seSBfcHJvcCA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTsnLFxuXHRcdFx0J1xcdHJlYWRvbmx5IHByb3A6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9wcm9wLmV2ZW50OycsXG5cdFx0XHQnXFx0Jyxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgYmFzZSA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCdcXHQnLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGVkaXRvci5nZXRNb2RlbCgpIS5zZXRWYWx1ZShiYXNlKTtcblx0XHRlZGl0b3IuZ2V0TW9kZWwoKSEudXBkYXRlT3B0aW9ucyh7IGluc2VydFNwYWNlczogZmFsc2UgfSk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCBzbmlwcGV0LCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigyLCAxOSwgMiwgMTkpLCBuZXcgU2VsZWN0aW9uKDMsIDExLCAzLCAxMSksIG5ldyBTZWxlY3Rpb24oMywgMjgsIDMsIDI4KSk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ19wcm9wJyB9KTtcblx0XHRzZXNzaW9uLm5leHQoKTtcblxuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDIsIDM5LCAyLCAzOSksIG5ldyBTZWxlY3Rpb24oMywgMjMsIDMsIDIzKSk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ3N0cmluZycgfSk7XG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgZXhwZWN0ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXRMYXN0UGxhY2Vob2xkZXIsIHRydWUpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDQsIDIsIDQsIDIpKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdzbmlwcGV0cywgdHJhbnNmb3JtIGV4YW1wbGUgaGl0IGlmJywgZnVuY3Rpb24gKCkge1xuXHRcdGVkaXRvci5nZXRNb2RlbCgpIS5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJyR7MTpuYW1lfSA6ICR7Mjp0eXBlfSR7My9cXFxcczo9KC4qKS8kezE6KyA6PX0kezF9L307XFxuJDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCA1KSk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ2NsaycgfSk7XG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCAxMSkpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdzdGRfbG9naWMnIH0pO1xuXHRcdHNlc3Npb24ubmV4dCgpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMTYsIDEsIDE2KSk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJyA6PSBcXCcxXFwnJyB9KTtcblx0XHRzZXNzaW9uLm5leHQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnY2xrIDogc3RkX2xvZ2ljIDo9IFxcJzFcXCc7XFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBdExhc3RQbGFjZWhvbGRlciwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IHRhYiBzdG9wIHNlbGVjdGlvbiBpc3N1ZSAjOTY1NDUsIHNuaXBwZXRzLCB0cmFuc2Zvcm0gYWRqYWNlbnQgdG8gcHJldmlvdXMgcGxhY2Vob2xkZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnJHsxOnt9JHsyOmZmZn0kezEvey99L30nLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAyKSwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA2KSk7XG5cdFx0c2Vzc2lvbi5uZXh0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ3tmZmZ9Jyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgNSkpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdnZ2cnIH0pO1xuXHRcdHNlc3Npb24ubmV4dCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICd7Z2dnfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXRMYXN0UGxhY2Vob2xkZXIsIHRydWUpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCB0YWIgc3RvcCBzZWxlY3Rpb24gaXNzdWUgIzk2NTQ1JywgZnVuY3Rpb24gKCkge1xuXHRcdGVkaXRvci5nZXRNb2RlbCgpLnNldFZhbHVlKCcnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFNuaXBwZXRTZXNzaW9uKGVkaXRvciwgJyR7MTp7fSR7MjpmZmZ9JHsxL1tcXFxce10vfS99JDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHNlc3Npb24uaW5zZXJ0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpLmdldFZhbHVlKCksICd7ZmZmeycpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMiksIG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNikpO1xuXHRcdHNlc3Npb24ubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDUpKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCBwbGFjZWhvbGRlciBpbmRleCBpbmNvcnJlY3QgYWZ0ZXIgdXNpbmcgMisgc25pcHBldHMgaW4gYSByb3cgdGhhdCBlYWNoIGVuZCB3aXRoIGEgcGxhY2Vob2xkZXIsICMzMDc2OScsIGZ1bmN0aW9uICgpIHtcblx0XHRlZGl0b3IuZ2V0TW9kZWwoKSEuc2V0VmFsdWUoJycpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICd0ZXN0ICR7MTpyZXBsYWNlbWV9JywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJzEnIH0pO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdcXG4nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ3Rlc3QgMVxcbicpO1xuXG5cdFx0c2Vzc2lvbi5tZXJnZSgndGVzdCAkezE6cmVwbGFjZW1lfScpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICcyJyB9KTtcblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnXFxuJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ3Rlc3QgMVxcbnRlc3QgMlxcbicpO1xuXG5cdFx0c2Vzc2lvbi5tZXJnZSgndGVzdCAkezE6cmVwbGFjZW1lfScpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICczJyB9KTtcblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnXFxuJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ3Rlc3QgMVxcbnRlc3QgMlxcbnRlc3QgM1xcbicpO1xuXG5cdFx0c2Vzc2lvbi5tZXJnZSgndGVzdCAkezE6cmVwbGFjZW1lfScpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICc0JyB9KTtcblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnXFxuJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ3Rlc3QgMVxcbnRlc3QgMlxcbnRlc3QgM1xcbnRlc3QgNFxcbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IHZhcmlhYmxlIHRleHQgaXNuXFwndCB3aGl0ZXNwYWNlIG5vcm1hbGlzZWQsICMzMTEyNCcsIGZ1bmN0aW9uICgpIHtcblx0XHRlZGl0b3IuZ2V0TW9kZWwoKSEuc2V0VmFsdWUoW1xuXHRcdFx0J3N0YXJ0Jyxcblx0XHRcdCdcXHRcXHQtb25lJyxcblx0XHRcdCdcXHRcXHQtdHdvJyxcblx0XHRcdCdlbmQnXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRlZGl0b3IuZ2V0TW9kZWwoKSEudXBkYXRlT3B0aW9ucyh7IGluc2VydFNwYWNlczogZmFsc2UgfSk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDIsIDMsIDcpKTtcblxuXHRcdG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICc8ZGl2PlxcblxcdCRUTV9TRUxFQ1RFRF9URVhUXFxuPC9kaXY+JDAnLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpLmluc2VydCgpO1xuXG5cdFx0bGV0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3N0YXJ0Jyxcblx0XHRcdCdcXHQ8ZGl2PicsXG5cdFx0XHQnXFx0XFx0XFx0LW9uZScsXG5cdFx0XHQnXFx0XFx0XFx0LXR3bycsXG5cdFx0XHQnXFx0PC9kaXY+Jyxcblx0XHRcdCdlbmQnXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgZXhwZWN0ZWQpO1xuXG5cdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnNldFZhbHVlKFtcblx0XHRcdCdzdGFydCcsXG5cdFx0XHQnXFx0XFx0LW9uZScsXG5cdFx0XHQnXFx0LXR3bycsXG5cdFx0XHQnZW5kJ1xuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnVwZGF0ZU9wdGlvbnMoeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH0pO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAyLCAzLCA3KSk7XG5cblx0XHRuZXcgU25pcHBldFNlc3Npb24oZWRpdG9yLCAnPGRpdj5cXG5cXHQkVE1fU0VMRUNURURfVEVYVFxcbjwvZGl2PiQwJywgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS5pbnNlcnQoKTtcblxuXHRcdGV4cGVjdGVkID0gW1xuXHRcdFx0J3N0YXJ0Jyxcblx0XHRcdCdcXHQ8ZGl2PicsXG5cdFx0XHQnXFx0XFx0XFx0LW9uZScsXG5cdFx0XHQnXFx0XFx0LXR3bycsXG5cdFx0XHQnXFx0PC9kaXY+Jyxcblx0XHRcdCdlbmQnXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWxlY3RpbmcgdGV4dCBmcm9tIGxlZnQgdG8gcmlnaHQsIGFuZCBjaG9vc2luZyBpdGVtIG1lc3NlcyB1cCBjb2RlLCAjMzExOTknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJ2NvbnNvbGUubG9nJyk7XG5cblx0XHRsZXQgYWN0dWFsID0gU25pcHBldFNlc3Npb24uYWRqdXN0U2VsZWN0aW9uKG1vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCA5KSwgMywgMCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5lcXVhbHNTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCA5LCAxLCA2KSkpO1xuXG5cdFx0YWN0dWFsID0gU25pcHBldFNlc3Npb24uYWRqdXN0U2VsZWN0aW9uKG1vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDEyKSwgMywgMCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5lcXVhbHNTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCA5LCAxLCAxMikpKTtcblxuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDEyKV0pO1xuXHRcdG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsICdmYXInLCB7IG92ZXJ3cml0ZUJlZm9yZTogMywgb3ZlcndyaXRlQWZ0ZXI6IDAsIGFkanVzdFdoaXRlc3BhY2U6IHRydWUsIGNsaXBib2FyZFRleHQ6IHVuZGVmaW5lZCwgb3ZlcnR5cGluZ0NhcHR1cmVyOiB1bmRlZmluZWQgfSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkuaW5zZXJ0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdjb25zb2xlLmZhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdUYWJzIGRvblxcJ3QgZ2V0IHJlcGxhY2VkIHdpdGggc3BhY2VzIGluIHNuaXBwZXQgdHJhbnNmb3JtYXRpb25zICMxMDM4MTgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJ1xcbntcXG4gIFxcbn0nKTtcblx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCBpbmRlbnRTaXplOiAyIH0pO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDMsIDYsIDMsIDYpXSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBTbmlwcGV0U2Vzc2lvbihlZGl0b3IsIFtcblx0XHRcdCdmdW5jdGlvbiBhbmltYXRlICgpIHsnLFxuXHRcdFx0J1xcdHZhciAkezE6YX0gPSAxMjsnLFxuXHRcdFx0J1xcdGNvbnNvbGUubG9nKCR7MS8oLiopL1xcblxcdFxcdCQxXFxuXFx0L30pJyxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyksIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRzZXNzaW9uLmluc2VydCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdCdmdW5jdGlvbiBhbmltYXRlICgpIHsnLFxuXHRcdFx0JyAgdmFyIGEgPSAxMjsnLFxuXHRcdFx0JyAgY29uc29sZS5sb2coYSknLFxuXHRcdFx0J30nLFxuXHRcdFx0J3snLFxuXHRcdFx0JyAgZnVuY3Rpb24gYW5pbWF0ZSAoKSB7Jyxcblx0XHRcdCcgICAgdmFyIGEgPSAxMjsnLFxuXHRcdFx0JyAgICBjb25zb2xlLmxvZyhhKScsXG5cdFx0XHQnICB9Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdiYmInIH0pO1xuXHRcdHNlc3Npb24ubmV4dCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdCdmdW5jdGlvbiBhbmltYXRlICgpIHsnLFxuXHRcdFx0JyAgdmFyIGJiYiA9IDEyOycsXG5cdFx0XHQnICBjb25zb2xlLmxvZygnLFxuXHRcdFx0JyAgICBiYmInLFxuXHRcdFx0JyAgKScsXG5cdFx0XHQnfScsXG5cdFx0XHQneycsXG5cdFx0XHQnICBmdW5jdGlvbiBhbmltYXRlICgpIHsnLFxuXHRcdFx0JyAgICB2YXIgYmJiID0gMTI7Jyxcblx0XHRcdCcgICAgY29uc29sZS5sb2coJyxcblx0XHRcdCcgICAgICBiYmInLFxuXHRcdFx0JyAgICApJyxcblx0XHRcdCcgIH0nLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJykpO1xuXHR9KTtcblxuXG5cdHN1aXRlKCdjcmVhdGVFZGl0c0FuZFNuaXBwZXRzRnJvbUVkaXRzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0dGVzdCgnZW1wdHknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IFNuaXBwZXRTZXNzaW9uLmNyZWF0ZUVkaXRzQW5kU25pcHBldHNGcm9tRWRpdHMoZWRpdG9yLCBbXSwgdHJ1ZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuc25pcHBldHMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Jhc2ljJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKS5zZXRWYWx1ZSgnZm9vKFwiYmFyXCIpJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IFNuaXBwZXRTZXNzaW9uLmNyZWF0ZUVkaXRzQW5kU25pcHBldHNGcm9tRWRpdHMoXG5cdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCA5KSwgdGVtcGxhdGU6ICckMScgfSwgeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZW1wbGF0ZTogJ2NvbnN0ICR7MTpuZXdfY29uc3R9ID0gXCJiYXJcIicgfV0sXG5cdFx0XHRcdHRydWUsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5yYW5nZSwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLnRleHQsICdjb25zdCBuZXdfY29uc3QgPSBcImJhclwiJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1sxXS5yYW5nZSwgbmV3IFJhbmdlKDEsIDUsIDEsIDkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzFdLnRleHQsICduZXdfY29uc3QnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zbmlwcGV0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zbmlwcGV0c1swXS5pc1RyaXZpYWxTbmlwcGV0LCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoICRTRUxFQ1RJT04gdmFyaWFibGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKS5zZXRWYWx1ZSgnU29tZSB0ZXh0IGFuZCBhIHNlbGVjdGlvbicpO1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMTcsIDEsIDI2KV0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBTbmlwcGV0U2Vzc2lvbi5jcmVhdGVFZGl0c0FuZFNuaXBwZXRzRnJvbUVkaXRzKFxuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTcsIDEsIDI2KSwgdGVtcGxhdGU6ICd3cmFwcGVkIDwkU0VMRUNUSU9OPicgfV0sXG5cdFx0XHRcdHRydWUsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5yYW5nZSwgbmV3IFJhbmdlKDEsIDE3LCAxLCAyNikpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0udGV4dCwgJ3dyYXBwZWQgPHNlbGVjdGlvbj4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zbmlwcGV0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zbmlwcGV0c1swXS5pc1RyaXZpYWxTbmlwcGV0LCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJyRUTV9TRUxFQ1RFRF9URVhUIHJlc29sdmVzIHBlciBlZGl0LCBub3QgdGhlIHByaW1hcnkgc2VsZWN0aW9uICMyMDYxMjEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKS5zZXRWYWx1ZSgnYWFhXFxuYmJiXFxuY2NjJyk7XG5cdFx0XHQvLyBwcmltYXJ5IHNlbGVjdGlvbiBjb3ZlcnMgXCJhYWFcIiwgYnV0IHRoZSBlZGl0cyB0YXJnZXQgb3RoZXIgbGluZXNcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpXSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IFNuaXBwZXRTZXNzaW9uLmNyZWF0ZUVkaXRzQW5kU25pcHBldHNGcm9tRWRpdHMoXG5cdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCA0KSwgdGVtcGxhdGU6ICdbJFRNX1NFTEVDVEVEX1RFWFRdJyB9LFxuXHRcdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgzLCAxLCAzLCA0KSwgdGVtcGxhdGU6ICdbJFRNX1NFTEVDVEVEX1RFWFRdJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHR0cnVlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ucmFuZ2UsIG5ldyBSYW5nZSgyLCAxLCAyLCA0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS50ZXh0LCAnW2JiYl0nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzFdLnJhbmdlLCBuZXcgUmFuZ2UoMywgMSwgMywgNCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMV0udGV4dCwgJ1tjY2NdJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCckVE1fTElORV9OVU1CRVIgcmVzb2x2ZXMgcGVyIGVkaXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKS5zZXRWYWx1ZSgnYVxcbmJcXG5jJyk7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBTbmlwcGV0U2Vzc2lvbi5jcmVhdGVFZGl0c0FuZFNuaXBwZXRzRnJvbUVkaXRzKFxuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIHRlbXBsYXRlOiAnJFRNX0xJTkVfTlVNQkVSJyB9LFxuXHRcdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgzLCAyLCAzLCAyKSwgdGVtcGxhdGU6ICckVE1fTElORV9OVU1CRVInIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHRydWUsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS50ZXh0LCAnMScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMV0udGV4dCwgJzMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Blci1lZGl0IHJlc29sdXRpb24gZG9lcyBub3QgY29ycnVwdCBlYXJsaWVyIGVkaXRzIHdoZW4gdmFsdWUgbGVuZ3RocyBkaWZmZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyAxMDAgbGluZXMgc28gJFRNX0xJTkVfTlVNQkVSIHByb2R1Y2VzIHZhbHVlcyBvZiBkaWZmZXJpbmcgd2lkdGhzICgxIHZzIDEwMClcblx0XHRcdGVkaXRvci5nZXRNb2RlbCgpLnNldFZhbHVlKEFycmF5LmZyb20oeyBsZW5ndGg6IDEwMCB9LCAoXywgaSkgPT4gYGxpbmUke2kgKyAxfWApLmpvaW4oJ1xcbicpKTtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IFNuaXBwZXRTZXNzaW9uLmNyZWF0ZUVkaXRzQW5kU25pcHBldHNGcm9tRWRpdHMoXG5cdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAxLCAyKSwgdGVtcGxhdGU6ICckVE1fTElORV9OVU1CRVInIH0sXG5cdFx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEwMCwgMiwgMTAwLCAyKSwgdGVtcGxhdGU6ICckVE1fTElORV9OVU1CRVInIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHRydWUsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS50ZXh0LCAnMScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMV0udGV4dCwgJzEwMCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnJENVUlNPUl9OVU1CRVIgdXNlcyBjYWxsZXItc3VwcGxpZWQgZWRpdCBvcmRlciwgbm90IHJhbmdlLXNvcnRlZCBvcmRlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGVkaXRvci5nZXRNb2RlbCgpLnNldFZhbHVlKCd4eFxcbnl5Jyk7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBTbmlwcGV0U2Vzc2lvbi5jcmVhdGVFZGl0c0FuZFNuaXBwZXRzRnJvbUVkaXRzKFxuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgMywgMiwgMyksIHRlbXBsYXRlOiAnJENVUlNPUl9OVU1CRVInIH0sXG5cdFx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCB0ZW1wbGF0ZTogJyRDVVJTT1JfTlVNQkVSJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHR0cnVlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ucmFuZ2UsIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS50ZXh0LCAnMicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMV0ucmFuZ2UsIG5ldyBSYW5nZSgyLCAzLCAyLCAzKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1sxXS50ZXh0LCAnMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3Jvc3MtZWRpdCBwbGFjZWhvbGRlciBiYWNrZmlsbCByZXNvbHZlcyB2YXJpYWJsZXMgaW4gZWFybGllciBlZGl0JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gcGFyc2VGcmFnbWVudCBiYWNrZmlsbHMgdGhlIGVhcmxpZXIgJDEgd2l0aCBhIGNsb25lIG9mIHRoZSBsYXRlciBkZWZhdWx0O1xuXHRcdFx0Ly8gdGhlIGNsb25lZCAkVE1fTElORV9OVU1CRVIgbGl2ZXMgb3V0c2lkZSB0aGUgc2Vjb25kIGVkaXQncyBuZXdOb2Rlc1xuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkuc2V0VmFsdWUoJ2FhYVxcbmJiYicpO1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gU25pcHBldFNlc3Npb24uY3JlYXRlRWRpdHNBbmRTbmlwcGV0c0Zyb21FZGl0cyhcblx0XHRcdFx0ZWRpdG9yLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCB0ZW1wbGF0ZTogJyQxJyB9LFxuXHRcdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgyLCAyLCAyLCAyKSwgdGVtcGxhdGU6ICckezE6JFRNX0xJTkVfTlVNQkVSfScgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0dHJ1ZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdCk7XG5cblx0XHRcdGxldCBoYXNVbnJlc29sdmVkVmFyaWFibGUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGlubmVyU25pcHBldCA9IChyZXN1bHQuc25pcHBldHNbMF0gYXMgdW5rbm93biBhcyB7IF9zbmlwcGV0OiBUZXh0bWF0ZVNuaXBwZXQgfSkuX3NuaXBwZXQ7XG5cdFx0XHRpbm5lclNuaXBwZXQud2FsayhtYXJrZXIgPT4ge1xuXHRcdFx0XHRpZiAobWFya2VyIGluc3RhbmNlb2YgVmFyaWFibGUgJiYgbWFya2VyLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGhhc1VucmVzb2x2ZWRWYXJpYWJsZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNVbnJlc29sdmVkVmFyaWFibGUsIGZhbHNlLCAnYmFja2ZpbGxlZCAkVE1fTElORV9OVU1CRVIgaW4gZWFybGllciBlZGl0IHNob3VsZCBiZSByZXNvbHZlZCcpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUV4RCxTQUFvQixnQkFBZ0I7QUFDcEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsZUFBZSxnQkFBc0M7QUFDOUQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFFekMsTUFBTSxrQkFBa0IsV0FBWTtBQUVuQyxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixXQUFTLGlCQUFpQkEsWUFBOEIsR0FBZ0I7QUFDdkUsZUFBVyxh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
