import assert from "assert";
import { mock } from "../../../../../base/test/common/mock.js";
import { CoreEditingCommands } from "../../../../browser/coreCommands.js";
import { Selection } from "../../../../common/core/selection.js";
import { Range } from "../../../../common/core/range.js";
import { Handler } from "../../../../common/editorCommon.js";
import { SnippetController2 } from "../../browser/snippetController2.js";
import { createTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { InstantiationService } from "../../../../../platform/instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { EndOfLineSequence } from "../../../../common/model.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("SnippetController2", function() {
  function assertSelections(editor2, ...s) {
    for (const selection of editor2.getSelections()) {
      const actual = s.shift();
      assert.ok(selection.equalsSelection(actual), `actual=${selection.toString()} <> expected=${actual.toString()}`);
    }
    assert.strictEqual(s.length, 0);
  }
  function assertContextKeys(service, inSnippet, hasPrev, hasNext) {
    const state = getContextState(service);
    assert.strictEqual(state.inSnippet, inSnippet, `inSnippetMode`);
    assert.strictEqual(state.hasPrev, hasPrev, `HasPrevTabstop`);
    assert.strictEqual(state.hasNext, hasNext, `HasNextTabstop`);
  }
  function getContextState(service = contextKeys) {
    return {
      inSnippet: SnippetController2.InSnippetMode.getValue(service),
      hasPrev: SnippetController2.HasPrevTabstop.getValue(service),
      hasNext: SnippetController2.HasNextTabstop.getValue(service)
    };
  }
  let ctrl;
  let editor;
  let model;
  let contextKeys;
  let instaService;
  setup(function() {
    contextKeys = new MockContextKeyService();
    model = createTextModel("if\n    $state\nfi");
    const serviceCollection = new ServiceCollection(
      [ILabelService, new class extends mock() {
      }()],
      [IWorkspaceContextService, new class extends mock() {
        getWorkspace() {
          return { id: "foo", folders: [] };
        }
      }()],
      [ILogService, new NullLogService()],
      [IContextKeyService, contextKeys]
    );
    instaService = new InstantiationService(serviceCollection);
    editor = createTestCodeEditor(model, { serviceCollection });
    editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5)]);
    assert.strictEqual(model.getEOL(), "\n");
  });
  teardown(function() {
    model.dispose();
    ctrl.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("creation", () => {
    ctrl = instaService.createInstance(SnippetController2, editor);
    assertContextKeys(contextKeys, false, false, false);
  });
  test("insert, insert -> abort", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("foo${1:bar}foo$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    ctrl.cancel();
    assertContextKeys(contextKeys, false, false, false);
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
  });
  test("insert, insert -> tab, tab, done", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("${1:one}${2:two}$0");
    assertContextKeys(contextKeys, true, false, true);
    ctrl.next();
    assertContextKeys(contextKeys, true, true, true);
    ctrl.next();
    assertContextKeys(contextKeys, false, false, false);
    editor.trigger("test", "type", { text: "	" });
    assert.strictEqual(SnippetController2.InSnippetMode.getValue(contextKeys), false);
    assert.strictEqual(SnippetController2.HasNextTabstop.getValue(contextKeys), false);
    assert.strictEqual(SnippetController2.HasPrevTabstop.getValue(contextKeys), false);
  });
  test("insert, insert -> cursor moves out (left/right)", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("foo${1:bar}foo$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    editor.setSelections([new Selection(1, 12, 1, 12), new Selection(2, 16, 2, 16)]);
    assertContextKeys(contextKeys, false, false, false);
  });
  test("insert, insert -> cursor moves out (up/down)", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("foo${1:bar}foo$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    editor.setSelections([new Selection(2, 4, 2, 7), new Selection(3, 8, 3, 11)]);
    assertContextKeys(contextKeys, false, false, false);
  });
  test("insert, insert -> cursors collapse", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("foo${1:bar}foo$0");
    assert.strictEqual(SnippetController2.InSnippetMode.getValue(contextKeys), true);
    assertSelections(editor, new Selection(1, 4, 1, 7), new Selection(2, 8, 2, 11));
    editor.setSelections([new Selection(1, 4, 1, 7)]);
    assertContextKeys(contextKeys, false, false, false);
  });
  test("insert, insert plain text -> no snippet mode", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("foobar");
    assertContextKeys(contextKeys, false, false, false);
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
  });
  test("insert, delete snippet text", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("${1:foobar}$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));
    editor.trigger("test", "cut", {});
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(2, 5, 2, 5));
    editor.trigger("test", "type", { text: "abc" });
    assertContextKeys(contextKeys, true, false, true);
    ctrl.next();
    assertContextKeys(contextKeys, false, false, false);
    editor.trigger("test", "tab", {});
    assertContextKeys(contextKeys, false, false, false);
  });
  test("insert, nested trivial snippet", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("${1:foo}bar$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 1, 1, 4), new Selection(2, 5, 2, 8));
    ctrl.insert("FOO$0");
    assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
    assertContextKeys(contextKeys, true, false, true);
    ctrl.next();
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
    assertContextKeys(contextKeys, false, false, false);
  });
  test("insert, nested snippet", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("${1:foobar}$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));
    ctrl.insert("far$1boo$0");
    assertSelections(editor, new Selection(1, 4, 1, 4), new Selection(2, 8, 2, 8));
    assertContextKeys(contextKeys, true, false, true);
    ctrl.next();
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
    assertContextKeys(contextKeys, true, true, true);
    ctrl.next();
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
    assertContextKeys(contextKeys, false, false, false);
  });
  test("insert, nested plain text", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("${1:foobar}$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 1, 1, 7), new Selection(2, 5, 2, 11));
    ctrl.insert("farboo");
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
    assertContextKeys(contextKeys, true, false, true);
    ctrl.next();
    assertSelections(editor, new Selection(1, 7, 1, 7), new Selection(2, 11, 2, 11));
    assertContextKeys(contextKeys, false, false, false);
  });
  test("Nested snippets without final placeholder jumps to next outer placeholder, #27898", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("for(const ${1:element} of ${2:array}) {$0}");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 11, 1, 18), new Selection(2, 15, 2, 22));
    ctrl.next();
    assertContextKeys(contextKeys, true, true, true);
    assertSelections(editor, new Selection(1, 22, 1, 27), new Selection(2, 26, 2, 31));
    ctrl.insert("document");
    assertContextKeys(contextKeys, true, true, true);
    assertSelections(editor, new Selection(1, 30, 1, 30), new Selection(2, 34, 2, 34));
    ctrl.next();
    assertContextKeys(contextKeys, false, false, false);
  });
  test("Inconsistent tab stop behaviour with recursive snippets and tab / shift tab, #27543", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.insert("1_calize(${1:nl}, '${2:value}')$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 10, 1, 12), new Selection(2, 14, 2, 16));
    ctrl.insert("2_calize(${1:nl}, '${2:value}')$0");
    assertSelections(editor, new Selection(1, 19, 1, 21), new Selection(2, 23, 2, 25));
    ctrl.next();
    assertSelections(editor, new Selection(1, 24, 1, 29), new Selection(2, 28, 2, 33));
    ctrl.next();
    assertSelections(editor, new Selection(1, 31, 1, 31), new Selection(2, 35, 2, 35));
    ctrl.next();
    assertSelections(editor, new Selection(1, 34, 1, 39), new Selection(2, 38, 2, 43));
    ctrl.prev();
    assertSelections(editor, new Selection(1, 31, 1, 31), new Selection(2, 35, 2, 35));
  });
  test("Snippet tabstop selecting content of previously entered variable only works when separated by space, #23728", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert("import ${2:${1:module}} from '${1:module}'$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 8, 1, 14), new Selection(1, 21, 1, 27));
    ctrl.insert("foo");
    assertSelections(editor, new Selection(1, 11, 1, 11), new Selection(1, 21, 1, 21));
    ctrl.next();
    assertSelections(editor, new Selection(1, 8, 1, 11));
  });
  test("HTML Snippets Combine, #32211", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    model.updateOptions({ insertSpaces: false, tabSize: 4, trimAutoWhitespace: false });
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert(`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=\${2:device-width}, initial-scale=\${3:1.0}">
				<meta http-equiv="X-UA-Compatible" content="\${5:ie=edge}">
				<title>\${7:Document}</title>
			</head>
			<body>
				\${8}
			</body>
			</html>
		`);
    ctrl.next();
    ctrl.next();
    ctrl.next();
    ctrl.next();
    assertSelections(editor, new Selection(11, 5, 11, 5));
    ctrl.insert('<input type="${2:text}">');
    assertSelections(editor, new Selection(11, 18, 11, 22));
  });
  test("Problems with nested snippet insertion #39594", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert("$1 = ConvertTo-Json $1");
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(1, 19, 1, 19));
    editor.setSelection(new Selection(1, 19, 1, 19));
    assertContextKeys(contextKeys, false, false, false);
  });
  test("Problems with nested snippet insertion #39594 (part2)", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("a-\naaa-");
    editor.setSelections([new Selection(2, 5, 2, 5), new Selection(1, 3, 1, 3)]);
    ctrl.insert("log($1);$0");
    assertSelections(editor, new Selection(2, 9, 2, 9), new Selection(1, 7, 1, 7));
    assertContextKeys(contextKeys, true, false, true);
  });
  test("\u201CNested\u201D snippets terminating abruptly in VSCode 1.19.2. #42012", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert("var ${2:${1:name}} = ${1:name} + 1;${0}");
    assertSelections(editor, new Selection(1, 5, 1, 9), new Selection(1, 12, 1, 16));
    assertContextKeys(contextKeys, true, false, true);
    ctrl.next();
    assertContextKeys(contextKeys, true, true, true);
  });
  test("Placeholders order #58267", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert("\\pth{$1}$0");
    assertSelections(editor, new Selection(1, 6, 1, 6));
    assertContextKeys(contextKeys, true, false, true);
    ctrl.insert("\\itv{${1:left}}{${2:right}}{${3:left_value}}{${4:right_value}}$0");
    assertSelections(editor, new Selection(1, 11, 1, 15));
    ctrl.next();
    assertSelections(editor, new Selection(1, 17, 1, 22));
    ctrl.next();
    assertSelections(editor, new Selection(1, 24, 1, 34));
    ctrl.next();
    assertSelections(editor, new Selection(1, 36, 1, 47));
    ctrl.next();
    assertSelections(editor, new Selection(1, 48, 1, 48));
    ctrl.next();
    assertSelections(editor, new Selection(1, 49, 1, 49));
    assertContextKeys(contextKeys, false, false, false);
  });
  test("Must tab through deleted tab stops in snippets #31619", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert("foo${1:a${2:bar}baz}end$0");
    assertSelections(editor, new Selection(1, 4, 1, 11));
    editor.trigger("test", Handler.Cut, null);
    assertSelections(editor, new Selection(1, 4, 1, 4));
    ctrl.next();
    assertSelections(editor, new Selection(1, 7, 1, 7));
    assertContextKeys(contextKeys, false, false, false);
  });
  test("Cancelling snippet mode should discard added cursors #68512 (soft cancel)", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert(".REGION ${2:FUNCTION_NAME}\nCREATE.FUNCTION ${1:VOID} ${2:FUNCTION_NAME}(${3:})\n	${4:}\nEND\n.ENDREGION$0");
    assertSelections(editor, new Selection(2, 17, 2, 21));
    ctrl.next();
    assertSelections(editor, new Selection(1, 9, 1, 22), new Selection(2, 22, 2, 35));
    assertContextKeys(contextKeys, true, true, true);
    editor.setSelections([new Selection(1, 22, 1, 22), new Selection(2, 35, 2, 35)]);
    assertContextKeys(contextKeys, true, true, true);
    editor.setSelections([new Selection(2, 1, 2, 1), new Selection(2, 36, 2, 36)]);
    assertContextKeys(contextKeys, false, false, false);
    assertSelections(editor, new Selection(2, 1, 2, 1), new Selection(2, 36, 2, 36));
  });
  test("Cancelling snippet mode should discard added cursors #68512 (hard cancel)", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert(".REGION ${2:FUNCTION_NAME}\nCREATE.FUNCTION ${1:VOID} ${2:FUNCTION_NAME}(${3:})\n	${4:}\nEND\n.ENDREGION$0");
    assertSelections(editor, new Selection(2, 17, 2, 21));
    ctrl.next();
    assertSelections(editor, new Selection(1, 9, 1, 22), new Selection(2, 22, 2, 35));
    assertContextKeys(contextKeys, true, true, true);
    editor.setSelections([new Selection(1, 22, 1, 22), new Selection(2, 35, 2, 35)]);
    assertContextKeys(contextKeys, true, true, true);
    ctrl.cancel(true);
    assertContextKeys(contextKeys, false, false, false);
    assertSelections(editor, new Selection(1, 22, 1, 22));
  });
  test("User defined snippet tab stops ignored #72862", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert("export default $1");
    assertContextKeys(contextKeys, true, false, true);
  });
  test("Optional tabstop in snippets #72358", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl.insert("${1:prop: {$2\\},}\nmore$0");
    assertContextKeys(contextKeys, true, false, true);
    assertSelections(editor, new Selection(1, 1, 1, 10));
    editor.trigger("test", Handler.Cut, {});
    assertSelections(editor, new Selection(1, 1, 1, 1));
    ctrl.next();
    assertSelections(editor, new Selection(2, 5, 2, 5));
    assertContextKeys(contextKeys, false, false, false);
  });
  test("issue #90135: confusing trim whitespace edits", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.runCommand(CoreEditingCommands.Tab, null);
    ctrl.insert("\nfoo");
    assertSelections(editor, new Selection(2, 8, 2, 8));
  });
  test("issue #145727: insertSnippet can put snippet selections in wrong positions (1 of 2)", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.runCommand(CoreEditingCommands.Tab, null);
    ctrl.insert("\naProperty: aClass<${2:boolean}> = new aClass<${2:boolean}>();\n", { adjustWhitespace: false });
    assertSelections(editor, new Selection(2, 19, 2, 26), new Selection(2, 41, 2, 48));
  });
  test("issue #145727: insertSnippet can put snippet selections in wrong positions (2 of 2)", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    editor.runCommand(CoreEditingCommands.Tab, null);
    ctrl.insert("\naProperty: aClass<${2:boolean}> = new aClass<${2:boolean}>();\n");
    assertSelections(editor, new Selection(2, 23, 2, 30), new Selection(2, 45, 2, 52));
  });
  test("leading TAB by snippets won't replace by spaces #101870", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    model.updateOptions({ insertSpaces: true, tabSize: 4 });
    ctrl.insert("	Hello World\n	New Line");
    assert.strictEqual(model.getValue(), "    Hello World\n    New Line");
  });
  test("leading TAB by snippets won't replace by spaces #101870 (part 2)", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    model.updateOptions({ insertSpaces: true, tabSize: 4 });
    ctrl.insert("	Hello World\n	New Line\n${1:	more}");
    assert.strictEqual(model.getValue(), "    Hello World\n    New Line\n    more");
  });
  test.skip("Snippet transformation does not work after inserting variable using intellisense, #112362", function() {
    {
      ctrl = instaService.createInstance(SnippetController2, editor);
      model.setValue("");
      model.updateOptions({ insertSpaces: true, tabSize: 4 });
      ctrl.insert("$1\n\n${1/([A-Za-z0-9]+): ([A-Za-z]+).*/$1: '$2',/gm}");
      assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(3, 1, 3, 1));
      editor.trigger("test", "type", { text: "foo: number;" });
      ctrl.next();
      assert.strictEqual(model.getValue(), `foo: number;

foo: 'number',`);
    }
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    model.updateOptions({ insertSpaces: true, tabSize: 4 });
    ctrl.insert("$1\n\n${1/([A-Za-z0-9]+): ([A-Za-z]+).*/$1: '$2',/gm}");
    assertSelections(editor, new Selection(1, 1, 1, 1), new Selection(3, 1, 3, 1));
    editor.trigger("test", "type", { text: "foo: " });
    ctrl.insert("number;");
    ctrl.next();
    assert.strictEqual(model.getValue(), `foo: number;

foo: 'number',`);
  });
  suite("createEditsAndSnippetsFromEdits", function() {
    test("apply, tab, done", function() {
      ctrl = instaService.createInstance(SnippetController2, editor);
      model.setValue('foo("bar")');
      ctrl.apply([
        { range: new Range(1, 5, 1, 10), template: "$1" },
        { range: new Range(1, 1, 1, 1), template: 'const ${1:new_const} = "bar";\n' }
      ]);
      assert.strictEqual(model.getValue(), 'const new_const = "bar";\nfoo(new_const)');
      assertContextKeys(contextKeys, true, false, true);
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 16), new Selection(2, 5, 2, 14)]);
      ctrl.next();
      assertContextKeys(contextKeys, false, false, false);
      assert.deepStrictEqual(editor.getSelections(), [new Selection(2, 14, 2, 14)]);
    });
    test("apply, tab, done with special final tabstop", function() {
      model.setValue('foo("bar")');
      ctrl = instaService.createInstance(SnippetController2, editor);
      ctrl.apply([
        { range: new Range(1, 5, 1, 10), template: "$1" },
        { range: new Range(1, 1, 1, 1), template: 'const ${1:new_const}$0 = "bar";\n' }
      ]);
      assert.strictEqual(model.getValue(), 'const new_const = "bar";\nfoo(new_const)');
      assertContextKeys(contextKeys, true, false, true);
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 16), new Selection(2, 5, 2, 14)]);
      ctrl.next();
      assertContextKeys(contextKeys, false, false, false);
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 16, 1, 16)]);
    });
    test("apply, tab, tab, done", function() {
      model.setValue("foo\nbar");
      ctrl = instaService.createInstance(SnippetController2, editor);
      ctrl.apply([
        { range: new Range(1, 4, 1, 4), template: "${3}" },
        { range: new Range(2, 4, 2, 4), template: "$3" },
        { range: new Range(1, 1, 1, 1), template: "### ${2:Header}\n" }
      ]);
      assert.strictEqual(model.getValue(), "### Header\nfoo\nbar");
      assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 11)]);
      ctrl.next();
      assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: true, hasNext: true });
      assert.deepStrictEqual(editor.getSelections(), [new Selection(2, 4, 2, 4), new Selection(3, 4, 3, 4)]);
      ctrl.next();
      assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
      assert.deepStrictEqual(editor.getSelections(), [new Selection(3, 4, 3, 4)]);
    });
    test("nested into apply works", function() {
      ctrl = instaService.createInstance(SnippetController2, editor);
      model.setValue("onetwo");
      editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
      ctrl.apply([{
        range: new Range(1, 7, 1, 7),
        template: "$0${1:three}"
      }]);
      assert.strictEqual(model.getValue(), "onetwothree");
      assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 12)]);
      ctrl.insert("foo$1bar$1");
      assert.strictEqual(model.getValue(), "onetwofoobar");
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 10, 1, 10), new Selection(1, 13, 1, 13)]);
      assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
      ctrl.next();
      assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: true, hasNext: true });
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 13, 1, 13)]);
      ctrl.next();
      assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 7, 1, 7)]);
    });
    test('nested into insert abort "outer" snippet', function() {
      ctrl = instaService.createInstance(SnippetController2, editor);
      model.setValue("one\ntwo");
      editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
      ctrl.insert("foo${1:bar}bazz${1:bang}");
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 7), new Selection(1, 11, 1, 14), new Selection(2, 4, 2, 7), new Selection(2, 11, 2, 14)]);
      assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
      ctrl.apply([{
        range: new Range(1, 4, 1, 7),
        template: "$0A"
      }]);
      assert.strictEqual(model.getValue(), "fooAbazzbarone\nfoobarbazzbartwo");
      assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 4)]);
    });
    test('nested into "insert" abort "outer" snippet (2)', function() {
      ctrl = instaService.createInstance(SnippetController2, editor);
      model.setValue("one\ntwo");
      editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
      ctrl.insert("foo${1:bar}bazz${1:bang}");
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 4, 1, 7), new Selection(1, 11, 1, 14), new Selection(2, 4, 2, 7), new Selection(2, 11, 2, 14)]);
      assert.deepStrictEqual(getContextState(), { inSnippet: true, hasPrev: false, hasNext: true });
      const edits = [{
        range: new Range(1, 4, 1, 7),
        template: "A"
      }, {
        range: new Range(1, 11, 1, 14),
        template: "B"
      }, {
        range: new Range(2, 4, 2, 7),
        template: "C"
      }, {
        range: new Range(2, 11, 2, 14),
        template: "D"
      }];
      ctrl.apply(edits);
      assert.strictEqual(model.getValue(), "fooAbazzBone\nfooCbazzDtwo");
      assert.deepStrictEqual(getContextState(), { inSnippet: false, hasPrev: false, hasNext: false });
      assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 5, 1, 5), new Selection(1, 10, 1, 10), new Selection(2, 5, 2, 5), new Selection(2, 10, 2, 10)]);
    });
  });
  test("Bug: cursor position $0 with user snippets #163808", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    ctrl.insert('<Element1 Attr1="foo" $1>\n  <Element2 Attr1="$2"/>\n$0"\n</Element1>');
    assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 23, 1, 23)]);
    ctrl.insert('Qualifier="$0"');
    assert.strictEqual(model.getValue(), '<Element1 Attr1="foo" Qualifier="">\n  <Element2 Attr1=""/>\n"\n</Element1>');
    assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 34, 1, 34)]);
  });
  test("EOL-Sequence (CRLF) shifts tab stop in isFileTemplate snippets #167386", function() {
    ctrl = instaService.createInstance(SnippetController2, editor);
    model.setValue("");
    model.setEOL(EndOfLineSequence.CRLF);
    ctrl.apply([{
      range: model.getFullModelRange(),
      template: "line 54321${1:FOO}\nline 54321${1:FOO}\n(no tab stop)\nline 54321${1:FOO}\nline 54321"
    }]);
    assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 11, 1, 14), new Selection(2, 11, 2, 14), new Selection(4, 11, 4, 14)]);
  });
  test('"Surround With" code action snippets use incorrect indentation levels and styles #169319', function() {
    model.setValue("function foo(f, x, condition) {\n    f();\n    return x;\n}");
    const sel = new Range(2, 5, 3, 14);
    editor.setSelection(sel);
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.apply([{
      range: sel,
      template: "if (${1:condition}) {\n	$TM_SELECTED_TEXT$0\n}"
    }]);
    assert.strictEqual(model.getValue(), `function foo(f, x, condition) {
    if (condition) {
        f();
        return x;
    }
}`);
  });
  test("$TM_SELECTED_TEXT resolves per edit, not the last selection (multi-cursor wrap snippet) #206121", function() {
    model.setValue("aaa\nbbb\nccc");
    const ranges = [new Range(1, 1, 1, 4), new Range(2, 1, 2, 4), new Range(3, 1, 3, 4)];
    editor.setSelections(ranges.map((r) => new Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)));
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.apply(ranges.map((range) => ({ range, template: "if(${1:cond}) {$TM_SELECTED_TEXT}$0" })));
    assert.strictEqual(model.getValue(), "if(cond) {aaa}\nif(cond) {bbb}\nif(cond) {ccc}");
  });
  test("apply with multiple cursors threads $CURSOR_NUMBER per edit", function() {
    model.setValue("aa\nbb\ncc");
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.apply([
      { range: new Range(1, 3, 1, 3), template: ":$CURSOR_NUMBER" },
      { range: new Range(2, 3, 2, 3), template: ":$CURSOR_NUMBER" },
      { range: new Range(3, 3, 3, 3), template: ":$CURSOR_NUMBER" }
    ]);
    assert.strictEqual(model.getValue(), "aa:1\nbb:2\ncc:3");
  });
  test("undo restores original selection after apply (regression for #170041)", function() {
    model.setValue("Some text and more text");
    editor.setSelection(new Selection(1, 1, 1, 1));
    ctrl = instaService.createInstance(SnippetController2, editor);
    ctrl.apply([{ range: new Range(1, 6, 1, 10), template: "${0:hi}" }]);
    assert.strictEqual(model.getValue(), "Some hi and more text");
    editor.runCommand(CoreEditingCommands.Undo, null);
    assert.strictEqual(model.getValue(), "Some text and more text");
    assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNuaXBwZXRcXHRlc3RcXGJyb3dzZXJcXHNuaXBwZXRDb250cm9sbGVyMi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgQ29yZUVkaXRpbmdDb21tYW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdENvZGVFZGl0b3IsIElUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVTZXF1ZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ1NuaXBwZXRDb250cm9sbGVyMicsIGZ1bmN0aW9uICgpIHtcblxuXHQvKiogQGRlcHJlY2F0ZWQgKi9cblx0ZnVuY3Rpb24gYXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3I6IElDb2RlRWRpdG9yLCAuLi5zOiBTZWxlY3Rpb25bXSkge1xuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhKSB7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBzLnNoaWZ0KCkhO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlbGVjdGlvbi5lcXVhbHNTZWxlY3Rpb24oYWN0dWFsKSwgYGFjdHVhbD0ke3NlbGVjdGlvbi50b1N0cmluZygpfSA8PiBleHBlY3RlZD0ke2FjdHVhbC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocy5sZW5ndGgsIDApO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0Q29udGV4dEtleXMoc2VydmljZTogTW9ja0NvbnRleHRLZXlTZXJ2aWNlLCBpblNuaXBwZXQ6IGJvb2xlYW4sIGhhc1ByZXY6IGJvb2xlYW4sIGhhc05leHQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IGdldENvbnRleHRTdGF0ZShzZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaW5TbmlwcGV0LCBpblNuaXBwZXQsIGBpblNuaXBwZXRNb2RlYCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmhhc1ByZXYsIGhhc1ByZXYsIGBIYXNQcmV2VGFic3RvcGApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5oYXNOZXh0LCBoYXNOZXh0LCBgSGFzTmV4dFRhYnN0b3BgKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldENvbnRleHRTdGF0ZShzZXJ2aWNlOiBNb2NrQ29udGV4dEtleVNlcnZpY2UgPSBjb250ZXh0S2V5cykge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpblNuaXBwZXQ6IFNuaXBwZXRDb250cm9sbGVyMi5JblNuaXBwZXRNb2RlLmdldFZhbHVlKHNlcnZpY2UpLFxuXHRcdFx0aGFzUHJldjogU25pcHBldENvbnRyb2xsZXIyLkhhc1ByZXZUYWJzdG9wLmdldFZhbHVlKHNlcnZpY2UpLFxuXHRcdFx0aGFzTmV4dDogU25pcHBldENvbnRyb2xsZXIyLkhhc05leHRUYWJzdG9wLmdldFZhbHVlKHNlcnZpY2UpLFxuXHRcdH07XG5cdH1cblxuXHRsZXQgY3RybDogU25pcHBldENvbnRyb2xsZXIyO1xuXHRsZXQgZWRpdG9yOiBJVGVzdENvZGVFZGl0b3I7XG5cdGxldCBtb2RlbDogVGV4dE1vZGVsO1xuXHRsZXQgY29udGV4dEtleXM6IE1vY2tDb250ZXh0S2V5U2VydmljZTtcblx0bGV0IGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRjb250ZXh0S2V5cyA9IG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKTtcblx0XHRtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaWZcXG4gICAgJHN0YXRlXFxuZmknKTtcblx0XHRjb25zdCBzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTGFiZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYWJlbFNlcnZpY2U+KCkgeyB9XSxcblx0XHRcdFtJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0V29ya3NwYWNlKCkge1xuXHRcdFx0XHRcdHJldHVybiB7IGlkOiAnZm9vJywgZm9sZGVyczogW10gfTtcblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpXSxcblx0XHRcdFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlzXSxcblx0XHQpO1xuXHRcdGluc3RhU2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlQ29sbGVjdGlvbik7XG5cdFx0ZWRpdG9yID0gY3JlYXRlVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgc2VydmljZUNvbGxlY3Rpb24gfSk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksIG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0RU9MKCksICdcXG4nKTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRjdHJsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3JlYXRpb24nLCAoKSA9PiB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQsIGluc2VydCAtPiBhYm9ydCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCdmb28kezE6YmFyfWZvbyQwJyk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCA4LCAyLCAxMSkpO1xuXG5cdFx0Y3RybC5jYW5jZWwoKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgOCwgMiwgMTEpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0LCBpbnNlcnQgLT4gdGFiLCB0YWIsIGRvbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cblx0XHRjdHJsLmluc2VydCgnJHsxOm9uZX0kezI6dHdvfSQwJyk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIGZhbHNlLCB0cnVlKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdcXHQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChTbmlwcGV0Q29udHJvbGxlcjIuSW5TbmlwcGV0TW9kZS5nZXRWYWx1ZShjb250ZXh0S2V5cyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoU25pcHBldENvbnRyb2xsZXIyLkhhc05leHRUYWJzdG9wLmdldFZhbHVlKGNvbnRleHRLZXlzKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChTbmlwcGV0Q29udHJvbGxlcjIuSGFzUHJldlRhYnN0b3AuZ2V0VmFsdWUoY29udGV4dEtleXMpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCwgaW5zZXJ0IC0+IGN1cnNvciBtb3ZlcyBvdXQgKGxlZnQvcmlnaHQpJywgZnVuY3Rpb24gKCkge1xuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXG5cdFx0Y3RybC5pbnNlcnQoJ2ZvbyR7MTpiYXJ9Zm9vJDAnKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDcpLCBuZXcgU2VsZWN0aW9uKDIsIDgsIDIsIDExKSk7XG5cblx0XHQvLyBiYWQgc2VsZWN0aW9uIGNoYW5nZVxuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMiksIG5ldyBTZWxlY3Rpb24oMiwgMTYsIDIsIDE2KV0pO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0LCBpbnNlcnQgLT4gY3Vyc29yIG1vdmVzIG91dCAodXAvZG93biknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cblx0XHRjdHJsLmluc2VydCgnZm9vJHsxOmJhcn1mb28kMCcpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgOCwgMiwgMTEpKTtcblxuXHRcdC8vIGJhZCBzZWxlY3Rpb24gY2hhbmdlXG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNyksIG5ldyBTZWxlY3Rpb24oMywgOCwgMywgMTEpXSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQsIGluc2VydCAtPiBjdXJzb3JzIGNvbGxhcHNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXG5cdFx0Y3RybC5pbnNlcnQoJ2ZvbyR7MTpiYXJ9Zm9vJDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoU25pcHBldENvbnRyb2xsZXIyLkluU25pcHBldE1vZGUuZ2V0VmFsdWUoY29udGV4dEtleXMpLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCA4LCAyLCAxMSkpO1xuXG5cdFx0Ly8gYmFkIHNlbGVjdGlvbiBjaGFuZ2Vcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA3KV0pO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0LCBpbnNlcnQgcGxhaW4gdGV4dCAtPiBubyBzbmlwcGV0IG1vZGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cblx0XHRjdHJsLmluc2VydCgnZm9vYmFyJyk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpLCBuZXcgU2VsZWN0aW9uKDIsIDExLCAyLCAxMSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQsIGRlbGV0ZSBzbmlwcGV0IHRleHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cblx0XHRjdHJsLmluc2VydCgnJHsxOmZvb2Jhcn0kMCcpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgMTEpKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ2N1dCcsIHt9KTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdhYmMnIH0pO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cblx0XHRjdHJsLm5leHQoKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0YWInLCB7fSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXG5cdFx0Ly8gZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ2FiYycgfSk7XG5cdFx0Ly8gYXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQsIG5lc3RlZCB0cml2aWFsIHNuaXBwZXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0Y3RybC5pbnNlcnQoJyR7MTpmb299YmFyJDAnKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDgpKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCdGT08kMCcpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDIsIDgsIDIsIDgpKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgMTEsIDIsIDExKSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQsIG5lc3RlZCBzbmlwcGV0JywgZnVuY3Rpb24gKCkge1xuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXHRcdGN0cmwuaW5zZXJ0KCckezE6Zm9vYmFyfSQwJyk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCA1LCAyLCAxMSkpO1xuXG5cdFx0Y3RybC5pbnNlcnQoJ2ZhciQxYm9vJDAnKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigyLCA4LCAyLCA4KSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIGZhbHNlLCB0cnVlKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpLCBuZXcgU2VsZWN0aW9uKDIsIDExLCAyLCAxMSkpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCB0cnVlLCB0cnVlKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpLCBuZXcgU2VsZWN0aW9uKDIsIDExLCAyLCAxMSkpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0LCBuZXN0ZWQgcGxhaW4gdGV4dCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRjdHJsLmluc2VydCgnJHsxOmZvb2Jhcn0kMCcpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgMTEpKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCdmYXJib28nKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigyLCAxMSwgMiwgMTEpKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyksIG5ldyBTZWxlY3Rpb24oMiwgMTEsIDIsIDExKSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdOZXN0ZWQgc25pcHBldHMgd2l0aG91dCBmaW5hbCBwbGFjZWhvbGRlciBqdW1wcyB0byBuZXh0IG91dGVyIHBsYWNlaG9sZGVyLCAjMjc4OTgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cblx0XHRjdHJsLmluc2VydCgnZm9yKGNvbnN0ICR7MTplbGVtZW50fSBvZiAkezI6YXJyYXl9KSB7JDB9Jyk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgMTgpLCBuZXcgU2VsZWN0aW9uKDIsIDE1LCAyLCAyMikpO1xuXG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIHRydWUsIHRydWUpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDIyLCAxLCAyNyksIG5ldyBTZWxlY3Rpb24oMiwgMjYsIDIsIDMxKSk7XG5cblx0XHRjdHJsLmluc2VydCgnZG9jdW1lbnQnKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMzAsIDEsIDMwKSwgbmV3IFNlbGVjdGlvbigyLCAzNCwgMiwgMzQpKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jb25zaXN0ZW50IHRhYiBzdG9wIGJlaGF2aW91ciB3aXRoIHJlY3Vyc2l2ZSBzbmlwcGV0cyBhbmQgdGFiIC8gc2hpZnQgdGFiLCAjMjc1NDMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0Y3RybC5pbnNlcnQoJzFfY2FsaXplKCR7MTpubH0sIFxcJyR7Mjp2YWx1ZX1cXCcpJDAnKTtcblxuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDEyKSwgbmV3IFNlbGVjdGlvbigyLCAxNCwgMiwgMTYpKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCcyX2NhbGl6ZSgkezE6bmx9LCBcXCckezI6dmFsdWV9XFwnKSQwJyk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxOSwgMSwgMjEpLCBuZXcgU2VsZWN0aW9uKDIsIDIzLCAyLCAyNSkpO1xuXG5cdFx0Y3RybC5uZXh0KCk7IC8vIGlubmVyIGB2YWx1ZWBcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAyNCwgMSwgMjkpLCBuZXcgU2VsZWN0aW9uKDIsIDI4LCAyLCAzMykpO1xuXG5cdFx0Y3RybC5uZXh0KCk7IC8vIGlubmVyIGAkMGBcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAzMSwgMSwgMzEpLCBuZXcgU2VsZWN0aW9uKDIsIDM1LCAyLCAzNSkpO1xuXG5cdFx0Y3RybC5uZXh0KCk7IC8vIG91dGVyIGB2YWx1ZWBcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAzNCwgMSwgMzkpLCBuZXcgU2VsZWN0aW9uKDIsIDM4LCAyLCA0MykpO1xuXG5cdFx0Y3RybC5wcmV2KCk7IC8vIGlubmVyIGAkMGBcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAzMSwgMSwgMzEpLCBuZXcgU2VsZWN0aW9uKDIsIDM1LCAyLCAzNSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IHRhYnN0b3Agc2VsZWN0aW5nIGNvbnRlbnQgb2YgcHJldmlvdXNseSBlbnRlcmVkIHZhcmlhYmxlIG9ubHkgd29ya3Mgd2hlbiBzZXBhcmF0ZWQgYnkgc3BhY2UsICMyMzcyOCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblxuXHRcdG1vZGVsLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXG5cdFx0Y3RybC5pbnNlcnQoJ2ltcG9ydCAkezI6JHsxOm1vZHVsZX19IGZyb20gXFwnJHsxOm1vZHVsZX1cXCckMCcpO1xuXG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCAxNCksIG5ldyBTZWxlY3Rpb24oMSwgMjEsIDEsIDI3KSk7XG5cblx0XHRjdHJsLmluc2VydCgnZm9vJyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDExKSwgbmV3IFNlbGVjdGlvbigxLCAyMSwgMSwgMjEpKTtcblxuXHRcdGN0cmwubmV4dCgpOyAvLyAkezI6Li4ufVxuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDExKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0hUTUwgU25pcHBldHMgQ29tYmluZSwgIzMyMjExJywgZnVuY3Rpb24gKCkge1xuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoeyBpbnNlcnRTcGFjZXM6IGZhbHNlLCB0YWJTaXplOiA0LCB0cmltQXV0b1doaXRlc3BhY2U6IGZhbHNlIH0pO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cblx0XHRjdHJsLmluc2VydChgXG5cdFx0XHQ8IURPQ1RZUEUgaHRtbD5cblx0XHRcdDxodG1sIGxhbmc9XCJlblwiPlxuXHRcdFx0PGhlYWQ+XG5cdFx0XHRcdDxtZXRhIGNoYXJzZXQ9XCJVVEYtOFwiPlxuXHRcdFx0XHQ8bWV0YSBuYW1lPVwidmlld3BvcnRcIiBjb250ZW50PVwid2lkdGg9XFwkezI6ZGV2aWNlLXdpZHRofSwgaW5pdGlhbC1zY2FsZT1cXCR7MzoxLjB9XCI+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJYLVVBLUNvbXBhdGlibGVcIiBjb250ZW50PVwiXFwkezU6aWU9ZWRnZX1cIj5cblx0XHRcdFx0PHRpdGxlPlxcJHs3OkRvY3VtZW50fTwvdGl0bGU+XG5cdFx0XHQ8L2hlYWQ+XG5cdFx0XHQ8Ym9keT5cblx0XHRcdFx0XFwkezh9XG5cdFx0XHQ8L2JvZHk+XG5cdFx0XHQ8L2h0bWw+XG5cdFx0YCk7XG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMTEsIDUsIDExLCA1KSk7XG5cblx0XHRjdHJsLmluc2VydCgnPGlucHV0IHR5cGU9XCIkezI6dGV4dH1cIj4nKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxMSwgMTgsIDExLCAyMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdQcm9ibGVtcyB3aXRoIG5lc3RlZCBzbmlwcGV0IGluc2VydGlvbiAjMzk1OTQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cblx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCckMSA9IENvbnZlcnRUby1Kc29uICQxJyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksIG5ldyBTZWxlY3Rpb24oMSwgMTksIDEsIDE5KSk7XG5cblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMTksIDEsIDE5KSk7XG5cblx0XHQvLyBzbmlwcGV0IG1vZGUgc2hvdWxkIHN0b3AgYmVjYXVzZSAkMSBoYXMgdHdvIG9jY3VycmVuY2VzXG5cdFx0Ly8gYW5kIHdlIG9ubHkgaGF2ZSBvbmUgc2VsZWN0aW9uIGxlZnRcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Byb2JsZW1zIHdpdGggbmVzdGVkIHNuaXBwZXQgaW5zZXJ0aW9uICMzOTU5NCAocGFydDIpJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIGVuc3VyZSBzZWxlY3Rpb24tY2hhbmdlLXRvLWNhbmNlbCBsb2dpYyBpc24ndCB0b28gYWdncmVzc2l2ZVxuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXG5cdFx0bW9kZWwuc2V0VmFsdWUoJ2EtXFxuYWFhLScpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSk7XG5cblx0XHRjdHJsLmluc2VydCgnbG9nKCQxKTskMCcpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDIsIDksIDIsIDkpLCBuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdcdTIwMUNOZXN0ZWRcdTIwMUQgc25pcHBldHMgdGVybWluYXRpbmcgYWJydXB0bHkgaW4gVlNDb2RlIDEuMTkuMi4gIzQyMDEyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0Y3RybC5pbnNlcnQoJ3ZhciAkezI6JHsxOm5hbWV9fSA9ICR7MTpuYW1lfSArIDE7JHswfScpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDE2KSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIGZhbHNlLCB0cnVlKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnUGxhY2Vob2xkZXJzIG9yZGVyICM1ODI2NycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXHRcdG1vZGVsLnNldFZhbHVlKCcnKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdGN0cmwuaW5zZXJ0KCdcXFxccHRoeyQxfSQwJyk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIGZhbHNlLCB0cnVlKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCdcXFxcaXR2eyR7MTpsZWZ0fX17JHsyOnJpZ2h0fX17JHszOmxlZnRfdmFsdWV9fXskezQ6cmlnaHRfdmFsdWV9fSQwJyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDE1KSk7XG5cblx0XHRjdHJsLm5leHQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxNywgMSwgMjIpKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDI0LCAxLCAzNCkpO1xuXG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMzYsIDEsIDQ3KSk7XG5cblx0XHRjdHJsLm5leHQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0OCwgMSwgNDgpKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDQ5LCAxLCA0OSkpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnTXVzdCB0YWIgdGhyb3VnaCBkZWxldGVkIHRhYiBzdG9wcyBpbiBzbmlwcGV0cyAjMzE2MTknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0Y3RybC5pbnNlcnQoJ2ZvbyR7MTphJHsyOmJhcn1iYXp9ZW5kJDAnKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCAxMSkpO1xuXG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCBIYW5kbGVyLkN1dCwgbnVsbCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCkpO1xuXG5cdFx0Y3RybC5uZXh0KCk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNykpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FuY2VsbGluZyBzbmlwcGV0IG1vZGUgc2hvdWxkIGRpc2NhcmQgYWRkZWQgY3Vyc29ycyAjNjg1MTIgKHNvZnQgY2FuY2VsKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCcuUkVHSU9OICR7MjpGVU5DVElPTl9OQU1FfVxcbkNSRUFURS5GVU5DVElPTiAkezE6Vk9JRH0gJHsyOkZVTkNUSU9OX05BTUV9KCR7Mzp9KVxcblxcdCR7NDp9XFxuRU5EXFxuLkVORFJFR0lPTiQwJyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgMTcsIDIsIDIxKSk7XG5cblx0XHRjdHJsLm5leHQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCAyMiksIG5ldyBTZWxlY3Rpb24oMiwgMjIsIDIsIDM1KSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIHRydWUsIHRydWUpO1xuXG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMjIsIDEsIDIyKSwgbmV3IFNlbGVjdGlvbigyLCAzNSwgMiwgMzUpXSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIHRydWUsIHRydWUpO1xuXG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSksIG5ldyBTZWxlY3Rpb24oMiwgMzYsIDIsIDM2KV0pO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSwgbmV3IFNlbGVjdGlvbigyLCAzNiwgMiwgMzYpKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FuY2VsbGluZyBzbmlwcGV0IG1vZGUgc2hvdWxkIGRpc2NhcmQgYWRkZWQgY3Vyc29ycyAjNjg1MTIgKGhhcmQgY2FuY2VsKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCcuUkVHSU9OICR7MjpGVU5DVElPTl9OQU1FfVxcbkNSRUFURS5GVU5DVElPTiAkezE6Vk9JRH0gJHsyOkZVTkNUSU9OX05BTUV9KCR7Mzp9KVxcblxcdCR7NDp9XFxuRU5EXFxuLkVORFJFR0lPTiQwJyk7XG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgMTcsIDIsIDIxKSk7XG5cblx0XHRjdHJsLm5leHQoKTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCAyMiksIG5ldyBTZWxlY3Rpb24oMiwgMjIsIDIsIDM1KSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIHRydWUsIHRydWUpO1xuXG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMjIsIDEsIDIyKSwgbmV3IFNlbGVjdGlvbigyLCAzNSwgMiwgMzUpXSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIHRydWUsIHRydWUsIHRydWUpO1xuXG5cdFx0Y3RybC5jYW5jZWwodHJ1ZSk7XG5cdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDIyLCAxLCAyMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdVc2VyIGRlZmluZWQgc25pcHBldCB0YWIgc3RvcHMgaWdub3JlZCAjNzI4NjInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cblx0XHRjdHJsLmluc2VydCgnZXhwb3J0IGRlZmF1bHQgJDEnKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdPcHRpb25hbCB0YWJzdG9wIGluIHNuaXBwZXRzICM3MjM1OCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCckezE6cHJvcDogeyQyXFxcXH0sfVxcbm1vcmUkMCcpO1xuXHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxMCkpO1xuXHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgSGFuZGxlci5DdXQsIHt9KTtcblxuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5MDEzNTogY29uZnVzaW5nIHRyaW0gd2hpdGVzcGFjZSBlZGl0cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXG5cdFx0Y3RybC5pbnNlcnQoJ1xcbmZvbycpO1xuXHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDIsIDgsIDIsIDgpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0NTcyNzogaW5zZXJ0U25pcHBldCBjYW4gcHV0IHNuaXBwZXQgc2VsZWN0aW9ucyBpbiB3cm9uZyBwb3NpdGlvbnMgKDEgb2YgMiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCdcXG5hUHJvcGVydHk6IGFDbGFzczwkezI6Ym9vbGVhbn0+ID0gbmV3IGFDbGFzczwkezI6Ym9vbGVhbn0+KCk7XFxuJywgeyBhZGp1c3RXaGl0ZXNwYWNlOiBmYWxzZSB9KTtcblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigyLCAxOSwgMiwgMjYpLCBuZXcgU2VsZWN0aW9uKDIsIDQxLCAyLCA0OCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTQ1NzI3OiBpbnNlcnRTbmlwcGV0IGNhbiBwdXQgc25pcHBldCBzZWxlY3Rpb25zIGluIHdyb25nIHBvc2l0aW9ucyAoMiBvZiAyKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXG5cdFx0Y3RybC5pbnNlcnQoJ1xcbmFQcm9wZXJ0eTogYUNsYXNzPCR7Mjpib29sZWFufT4gPSBuZXcgYUNsYXNzPCR7Mjpib29sZWFufT4oKTtcXG4nKTtcblx0XHQvLyBUaGlzIHdpbGwgaW5zZXJ0IFxcbiAgICBhUHJvcGVydHkuLi4uXG5cdFx0YXNzZXJ0U2VsZWN0aW9ucyhlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgMjMsIDIsIDMwKSwgbmV3IFNlbGVjdGlvbigyLCA0NSwgMiwgNTIpKTtcblx0fSk7XG5cblx0dGVzdCgnbGVhZGluZyBUQUIgYnkgc25pcHBldHMgd29uXFwndCByZXBsYWNlIGJ5IHNwYWNlcyAjMTAxODcwJywgZnVuY3Rpb24gKCkge1xuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXHRcdG1vZGVsLnNldFZhbHVlKCcnKTtcblx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiA0IH0pO1xuXHRcdGN0cmwuaW5zZXJ0KCdcXHRIZWxsbyBXb3JsZFxcblxcdE5ldyBMaW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcgICAgSGVsbG8gV29ybGRcXG4gICAgTmV3IExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbGVhZGluZyBUQUIgYnkgc25pcHBldHMgd29uXFwndCByZXBsYWNlIGJ5IHNwYWNlcyAjMTAxODcwIChwYXJ0IDIpJywgZnVuY3Rpb24gKCkge1xuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXHRcdG1vZGVsLnNldFZhbHVlKCcnKTtcblx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiA0IH0pO1xuXHRcdGN0cmwuaW5zZXJ0KCdcXHRIZWxsbyBXb3JsZFxcblxcdE5ldyBMaW5lXFxuJHsxOlxcdG1vcmV9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcgICAgSGVsbG8gV29ybGRcXG4gICAgTmV3IExpbmVcXG4gICAgbW9yZScpO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ1NuaXBwZXQgdHJhbnNmb3JtYXRpb24gZG9lcyBub3Qgd29yayBhZnRlciBpbnNlcnRpbmcgdmFyaWFibGUgdXNpbmcgaW50ZWxsaXNlbnNlLCAjMTEyMzYyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0e1xuXHRcdFx0Ly8gSEFQUFkgLSBubyBuZXN0ZWQgc25pcHBldFxuXHRcdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiA0IH0pO1xuXHRcdFx0Y3RybC5pbnNlcnQoJyQxXFxuXFxuJHsxLyhbQS1aYS16MC05XSspOiAoW0EtWmEtel0rKS4qLyQxOiBcXCckMlxcJywvZ219Jyk7XG5cblx0XHRcdGFzc2VydFNlbGVjdGlvbnMoZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDEpKTtcblx0XHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdmb286IG51bWJlcjsnIH0pO1xuXHRcdFx0Y3RybC5uZXh0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgYGZvbzogbnVtYmVyO1xcblxcbmZvbzogJ251bWJlcicsYCk7XG5cdFx0fVxuXG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoeyBpbnNlcnRTcGFjZXM6IHRydWUsIHRhYlNpemU6IDQgfSk7XG5cdFx0Y3RybC5pbnNlcnQoJyQxXFxuXFxuJHsxLyhbQS1aYS16MC05XSspOiAoW0EtWmEtel0rKS4qLyQxOiBcXCckMlxcJywvZ219Jyk7XG5cblx0XHRhc3NlcnRTZWxlY3Rpb25zKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxKSk7XG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ2ZvbzogJyB9KTtcblx0XHRjdHJsLmluc2VydCgnbnVtYmVyOycpO1xuXHRcdGN0cmwubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBgZm9vOiBudW1iZXI7XFxuXFxuZm9vOiAnbnVtYmVyJyxgKTtcblx0XHQvLyBlZGl0b3IudHJpZ2dlcigndGVzdCcsICd0eXBlJywgeyB0ZXh0OiAnOycgfSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjcmVhdGVFZGl0c0FuZFNuaXBwZXRzRnJvbUVkaXRzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0dGVzdCgnYXBwbHksIHRhYiwgZG9uZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cblx0XHRcdG1vZGVsLnNldFZhbHVlKCdmb28oXCJiYXJcIiknKTtcblxuXHRcdFx0Y3RybC5hcHBseShbXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCAxMCksIHRlbXBsYXRlOiAnJDEnIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGVtcGxhdGU6ICdjb25zdCAkezE6bmV3X2NvbnN0fSA9IFwiYmFyXCI7XFxuJyB9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdjb25zdCBuZXdfY29uc3QgPSBcImJhclwiO1xcbmZvbyhuZXdfY29uc3QpJyk7XG5cdFx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigxLCA3LCAxLCAxNiksIG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgMTQpXSk7XG5cblx0XHRcdGN0cmwubmV4dCgpO1xuXHRcdFx0YXNzZXJ0Q29udGV4dEtleXMoY29udGV4dEtleXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigyLCAxNCwgMiwgMTQpXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBseSwgdGFiLCBkb25lIHdpdGggc3BlY2lhbCBmaW5hbCB0YWJzdG9wJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnZm9vKFwiYmFyXCIpJyk7XG5cblx0XHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXHRcdFx0Y3RybC5hcHBseShbXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCAxMCksIHRlbXBsYXRlOiAnJDEnIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGVtcGxhdGU6ICdjb25zdCAkezE6bmV3X2NvbnN0fSQwID0gXCJiYXJcIjtcXG4nIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2NvbnN0IG5ld19jb25zdCA9IFwiYmFyXCI7XFxuZm9vKG5ld19jb25zdCknKTtcblx0XHRcdGFzc2VydENvbnRleHRLZXlzKGNvbnRleHRLZXlzLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDE2KSwgbmV3IFNlbGVjdGlvbigyLCA1LCAyLCAxNCldKTtcblxuXHRcdFx0Y3RybC5uZXh0KCk7XG5cdFx0XHRhc3NlcnRDb250ZXh0S2V5cyhjb250ZXh0S2V5cywgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDE2LCAxLCAxNildKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGx5LCB0YWIsIHRhYiwgZG9uZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJ2Zvb1xcbmJhcicpO1xuXG5cdFx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRcdGN0cmwuYXBwbHkoW1xuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIHRlbXBsYXRlOiAnJHszfScgfSxcblx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDIsIDQsIDIsIDQpLCB0ZW1wbGF0ZTogJyQzJyB9LFxuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRlbXBsYXRlOiAnIyMjICR7MjpIZWFkZXJ9XFxuJyB9XG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcjIyMgSGVhZGVyXFxuZm9vXFxuYmFyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldENvbnRleHRTdGF0ZSgpLCB7IGluU25pcHBldDogdHJ1ZSwgaGFzUHJldjogZmFsc2UsIGhhc05leHQ6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDExKV0pO1xuXG5cdFx0XHRjdHJsLm5leHQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q29udGV4dFN0YXRlKCksIHsgaW5TbmlwcGV0OiB0cnVlLCBoYXNQcmV2OiB0cnVlLCBoYXNOZXh0OiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigyLCA0LCAyLCA0KSwgbmV3IFNlbGVjdGlvbigzLCA0LCAzLCA0KV0pO1xuXG5cdFx0XHRjdHJsLm5leHQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q29udGV4dFN0YXRlKCksIHsgaW5TbmlwcGV0OiBmYWxzZSwgaGFzUHJldjogZmFsc2UsIGhhc05leHQ6IGZhbHNlIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigzLCA0LCAzLCA0KV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVzdGVkIGludG8gYXBwbHkgd29ya3MnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJ29uZXR3bycpO1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKV0pO1xuXG5cdFx0XHRjdHJsLmFwcGx5KFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgNywgMSwgNyksXG5cdFx0XHRcdHRlbXBsYXRlOiAnJDAkezE6dGhyZWV9J1xuXHRcdFx0fV0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ29uZXR3b3RocmVlJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldENvbnRleHRTdGF0ZSgpLCB7IGluU25pcHBldDogdHJ1ZSwgaGFzUHJldjogZmFsc2UsIGhhc05leHQ6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDEyKV0pO1xuXG5cdFx0XHRjdHJsLmluc2VydCgnZm9vJDFiYXIkMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdvbmV0d29mb29iYXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDEwKSwgbmV3IFNlbGVjdGlvbigxLCAxMywgMSwgMTMpXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldENvbnRleHRTdGF0ZSgpLCAoeyBpblNuaXBwZXQ6IHRydWUsIGhhc1ByZXY6IGZhbHNlLCBoYXNOZXh0OiB0cnVlIH0pKTtcblxuXHRcdFx0Y3RybC5uZXh0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldENvbnRleHRTdGF0ZSgpLCAoeyBpblNuaXBwZXQ6IHRydWUsIGhhc1ByZXY6IHRydWUsIGhhc05leHQ6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigxLCAxMywgMSwgMTMpXSk7XG5cblx0XHRcdGN0cmwubmV4dCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRDb250ZXh0U3RhdGUoKSwgeyBpblNuaXBwZXQ6IGZhbHNlLCBoYXNQcmV2OiBmYWxzZSwgaGFzTmV4dDogZmFsc2UgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpXSk7XG5cblx0XHR9KTtcblxuXHRcdHRlc3QoJ25lc3RlZCBpbnRvIGluc2VydCBhYm9ydCBcIm91dGVyXCIgc25pcHBldCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnb25lXFxudHdvJyk7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpXSk7XG5cblx0XHRcdGN0cmwuaW5zZXJ0KCdmb28kezE6YmFyfWJhenokezE6YmFuZ30nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDE0KSwgbmV3IFNlbGVjdGlvbigyLCA0LCAyLCA3KSwgbmV3IFNlbGVjdGlvbigyLCAxMSwgMiwgMTQpXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldENvbnRleHRTdGF0ZSgpLCB7IGluU25pcHBldDogdHJ1ZSwgaGFzUHJldjogZmFsc2UsIGhhc05leHQ6IHRydWUgfSk7XG5cblx0XHRcdGN0cmwuYXBwbHkoW3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA0LCAxLCA3KSxcblx0XHRcdFx0dGVtcGxhdGU6ICckMEEnXG5cdFx0XHR9XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnZm9vQWJhenpiYXJvbmVcXG5mb29iYXJiYXp6YmFydHdvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldENvbnRleHRTdGF0ZSgpLCB7IGluU25pcHBldDogZmFsc2UsIGhhc1ByZXY6IGZhbHNlLCBoYXNOZXh0OiBmYWxzZSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25lc3RlZCBpbnRvIFwiaW5zZXJ0XCIgYWJvcnQgXCJvdXRlclwiIHNuaXBwZXQgKDIpJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRcdG1vZGVsLnNldFZhbHVlKCdvbmVcXG50d28nKTtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSldKTtcblxuXHRcdFx0Y3RybC5pbnNlcnQoJ2ZvbyR7MTpiYXJ9YmF6eiR7MTpiYW5nfScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA3KSwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgMTQpLCBuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDcpLCBuZXcgU2VsZWN0aW9uKDIsIDExLCAyLCAxNCldKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q29udGV4dFN0YXRlKCksIHsgaW5TbmlwcGV0OiB0cnVlLCBoYXNQcmV2OiBmYWxzZSwgaGFzTmV4dDogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgZWRpdHMgPSBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDQsIDEsIDcpLFxuXHRcdFx0XHR0ZW1wbGF0ZTogJ0EnXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTEsIDEsIDE0KSxcblx0XHRcdFx0dGVtcGxhdGU6ICdCJ1xuXHRcdFx0fSwge1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDIsIDQsIDIsIDcpLFxuXHRcdFx0XHR0ZW1wbGF0ZTogJ0MnXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMiwgMTEsIDIsIDE0KSxcblx0XHRcdFx0dGVtcGxhdGU6ICdEJ1xuXHRcdFx0fV07XG5cdFx0XHRjdHJsLmFwcGx5KGVkaXRzKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdmb29BYmF6ekJvbmVcXG5mb29DYmF6ekR0d28nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q29udGV4dFN0YXRlKCksIHsgaW5TbmlwcGV0OiBmYWxzZSwgaGFzUHJldjogZmFsc2UsIGhhc05leHQ6IGZhbHNlIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSwgbmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTApLCBuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpLCBuZXcgU2VsZWN0aW9uKDIsIDEwLCAyLCAxMCldKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQnVnOiBjdXJzb3IgcG9zaXRpb24gJDAgd2l0aCB1c2VyIHNuaXBwZXRzICMxNjM4MDgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cblx0XHRjdHJsLmluc2VydCgnPEVsZW1lbnQxIEF0dHIxPVwiZm9vXCIgJDE+XFxuICA8RWxlbWVudDIgQXR0cjE9XCIkMlwiLz5cXG4kMFwiXFxuPC9FbGVtZW50MT4nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDIzLCAxLCAyMyldKTtcblxuXHRcdGN0cmwuaW5zZXJ0KCdRdWFsaWZpZXI9XCIkMFwiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICc8RWxlbWVudDEgQXR0cjE9XCJmb29cIiBRdWFsaWZpZXI9XCJcIj5cXG4gIDxFbGVtZW50MiBBdHRyMT1cIlwiLz5cXG5cIlxcbjwvRWxlbWVudDE+Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigxLCAzNCwgMSwgMzQpXSk7XG5cblx0fSk7XG5cblx0dGVzdCgnRU9MLVNlcXVlbmNlIChDUkxGKSBzaGlmdHMgdGFiIHN0b3AgaW4gaXNGaWxlVGVtcGxhdGUgc25pcHBldHMgIzE2NzM4NicsIGZ1bmN0aW9uICgpIHtcblx0XHRjdHJsID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRDb250cm9sbGVyMiwgZWRpdG9yKTtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXG5cdFx0Y3RybC5hcHBseShbe1xuXHRcdFx0cmFuZ2U6IG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksXG5cdFx0XHR0ZW1wbGF0ZTogJ2xpbmUgNTQzMjEkezE6Rk9PfVxcbmxpbmUgNTQzMjEkezE6Rk9PfVxcbihubyB0YWIgc3RvcClcXG5saW5lIDU0MzIxJHsxOkZPT31cXG5saW5lIDU0MzIxJ1xuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDE0KSwgbmV3IFNlbGVjdGlvbigyLCAxMSwgMiwgMTQpLCBuZXcgU2VsZWN0aW9uKDQsIDExLCA0LCAxNCldKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdcIlN1cnJvdW5kIFdpdGhcIiBjb2RlIGFjdGlvbiBzbmlwcGV0cyB1c2UgaW5jb3JyZWN0IGluZGVudGF0aW9uIGxldmVscyBhbmQgc3R5bGVzICMxNjkzMTknLCBmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJ2Z1bmN0aW9uIGZvbyhmLCB4LCBjb25kaXRpb24pIHtcXG4gICAgZigpO1xcbiAgICByZXR1cm4geDtcXG59Jyk7XG5cdFx0Y29uc3Qgc2VsID0gbmV3IFJhbmdlKDIsIDUsIDMsIDE0KTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKHNlbCk7XG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0Y3RybC5hcHBseShbe1xuXHRcdFx0cmFuZ2U6IHNlbCxcblx0XHRcdHRlbXBsYXRlOiAnaWYgKCR7MTpjb25kaXRpb259KSB7XFxuXFx0JFRNX1NFTEVDVEVEX1RFWFQkMFxcbn0nXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIGBmdW5jdGlvbiBmb28oZiwgeCwgY29uZGl0aW9uKSB7XFxuICAgIGlmIChjb25kaXRpb24pIHtcXG4gICAgICAgIGYoKTtcXG4gICAgICAgIHJldHVybiB4O1xcbiAgICB9XFxufWApO1xuXHR9KTtcblxuXHR0ZXN0KCckVE1fU0VMRUNURURfVEVYVCByZXNvbHZlcyBwZXIgZWRpdCwgbm90IHRoZSBsYXN0IHNlbGVjdGlvbiAobXVsdGktY3Vyc29yIHdyYXAgc25pcHBldCkgIzIwNjEyMScsIGZ1bmN0aW9uICgpIHtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnYWFhXFxuYmJiXFxuY2NjJyk7XG5cdFx0Y29uc3QgcmFuZ2VzID0gW25ldyBSYW5nZSgxLCAxLCAxLCA0KSwgbmV3IFJhbmdlKDIsIDEsIDIsIDQpLCBuZXcgUmFuZ2UoMywgMSwgMywgNCldO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKHJhbmdlcy5tYXAociA9PiBuZXcgU2VsZWN0aW9uKHIuc3RhcnRMaW5lTnVtYmVyLCByLnN0YXJ0Q29sdW1uLCByLmVuZExpbmVOdW1iZXIsIHIuZW5kQ29sdW1uKSkpO1xuXG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0Y3RybC5hcHBseShyYW5nZXMubWFwKHJhbmdlID0+ICh7IHJhbmdlLCB0ZW1wbGF0ZTogJ2lmKCR7MTpjb25kfSkgeyRUTV9TRUxFQ1RFRF9URVhUfSQwJyB9KSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdpZihjb25kKSB7YWFhfVxcbmlmKGNvbmQpIHtiYmJ9XFxuaWYoY29uZCkge2NjY30nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHkgd2l0aCBtdWx0aXBsZSBjdXJzb3JzIHRocmVhZHMgJENVUlNPUl9OVU1CRVIgcGVyIGVkaXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJ2FhXFxuYmJcXG5jYycpO1xuXG5cdFx0Y3RybCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0Q29udHJvbGxlcjIsIGVkaXRvcik7XG5cdFx0Y3RybC5hcHBseShbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIHRlbXBsYXRlOiAnOiRDVVJTT1JfTlVNQkVSJyB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDIsIDMsIDIsIDMpLCB0ZW1wbGF0ZTogJzokQ1VSU09SX05VTUJFUicgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgzLCAzLCAzLCAzKSwgdGVtcGxhdGU6ICc6JENVUlNPUl9OVU1CRVInIH0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2FhOjFcXG5iYjoyXFxuY2M6MycpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmRvIHJlc3RvcmVzIG9yaWdpbmFsIHNlbGVjdGlvbiBhZnRlciBhcHBseSAocmVncmVzc2lvbiBmb3IgIzE3MDA0MSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJ1NvbWUgdGV4dCBhbmQgbW9yZSB0ZXh0Jyk7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdGN0cmwgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldENvbnRyb2xsZXIyLCBlZGl0b3IpO1xuXHRcdGN0cmwuYXBwbHkoW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA2LCAxLCAxMCksIHRlbXBsYXRlOiAnJHswOmhpfScgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdTb21lIGhpIGFuZCBtb3JlIHRleHQnKTtcblxuXHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1NvbWUgdGV4dCBhbmQgbW9yZSB0ZXh0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWTtBQUNyQixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBRXhCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxzQkFBc0IsV0FBWTtBQUd2QyxXQUFTLGlCQUFpQkEsWUFBd0IsR0FBZ0I7QUFDakUsZUFBVyxhQUFhQSxRQUFPLGNBQWMsR0FBSTtBQUNoRCxZQUFNLFNBQVMsRUFBRSxNQUFNO0FBQ3ZCLGFBQU8sR0FBRyxVQUFVLGdCQUFnQixNQUFNLEdBQUcsVUFBVSxVQUFVLFNBQVMsQ0FBQyxnQkFBZ0IsT0FBTyxTQUFTLENBQUMsRUFBRTtBQUFBLElBQy9HO0FBQ0EsV0FBTyxZQUFZLEVBQUUsUUFBUSxDQUFDO0FBQUEsRUFDL0I7QUFFQSxXQUFTLGtCQUFrQixTQUFnQyxXQUFvQixTQUFrQixTQUF3QjtBQUN4SCxVQUFNLFFBQVEsZ0JBQWdCLE9BQU87QUFDckMsV0FBTyxZQUFZLE1BQU0sV0FBVyxX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
