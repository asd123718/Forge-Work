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
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Position } from "../../../../common/core/position.js";
import { Selection } from "../../../../common/core/selection.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { SnippetController2 } from "../../browser/snippetController2.js";
import { withTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { TestLanguageConfigurationService } from "../../../../test/common/modes/testLanguageConfigurationService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
let TestSnippetController = class extends SnippetController2 {
  constructor(editor, _contextKeyService) {
    const testLanguageConfigurationService = new TestLanguageConfigurationService();
    super(editor, new NullLogService(), new LanguageFeaturesService(), _contextKeyService, testLanguageConfigurationService);
    this._contextKeyService = _contextKeyService;
    this._testLanguageConfigurationService = testLanguageConfigurationService;
  }
  dispose() {
    super.dispose();
    this._testLanguageConfigurationService.dispose();
  }
  isInSnippetMode() {
    return SnippetController2.InSnippetMode.getValue(this._contextKeyService);
  }
};
TestSnippetController = __decorateClass([
  __decorateParam(1, IContextKeyService)
], TestSnippetController);
suite("SnippetController", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function snippetTest(cb, lines) {
    if (!lines) {
      lines = [
        "function test() {",
        "	var x = 3;",
        "	var arr = [];",
        "	",
        "}"
      ];
    }
    const serviceCollection = new ServiceCollection(
      [ILabelService, new class extends mock() {
      }()],
      [IWorkspaceContextService, new class extends mock() {
      }()]
    );
    withTestCodeEditor(lines, { serviceCollection }, (editor) => {
      editor.getModel().updateOptions({
        insertSpaces: false
      });
      const snippetController = editor.registerAndInstantiateContribution(TestSnippetController.ID, TestSnippetController);
      const template = [
        "for (var ${1:index}; $1 < ${2:array}.length; $1++) {",
        "	var element = $2[$1];",
        "	$0",
        "}"
      ].join("\n");
      cb(editor, template, snippetController);
      snippetController.dispose();
    });
  }
  test("Simple accepted", () => {
    snippetTest((editor, template, snippetController) => {
      editor.setPosition({ lineNumber: 4, column: 2 });
      snippetController.insert(template);
      assert.strictEqual(editor.getModel().getLineContent(4), "	for (var index; index < array.length; index++) {");
      assert.strictEqual(editor.getModel().getLineContent(5), "		var element = array[index];");
      assert.strictEqual(editor.getModel().getLineContent(6), "		");
      assert.strictEqual(editor.getModel().getLineContent(7), "	}");
      editor.trigger("test", "type", { text: "i" });
      assert.strictEqual(editor.getModel().getLineContent(4), "	for (var i; i < array.length; i++) {");
      assert.strictEqual(editor.getModel().getLineContent(5), "		var element = array[i];");
      assert.strictEqual(editor.getModel().getLineContent(6), "		");
      assert.strictEqual(editor.getModel().getLineContent(7), "	}");
      snippetController.next();
      editor.trigger("test", "type", { text: "arr" });
      assert.strictEqual(editor.getModel().getLineContent(4), "	for (var i; i < arr.length; i++) {");
      assert.strictEqual(editor.getModel().getLineContent(5), "		var element = arr[i];");
      assert.strictEqual(editor.getModel().getLineContent(6), "		");
      assert.strictEqual(editor.getModel().getLineContent(7), "	}");
      snippetController.prev();
      editor.trigger("test", "type", { text: "j" });
      assert.strictEqual(editor.getModel().getLineContent(4), "	for (var j; j < arr.length; j++) {");
      assert.strictEqual(editor.getModel().getLineContent(5), "		var element = arr[j];");
      assert.strictEqual(editor.getModel().getLineContent(6), "		");
      assert.strictEqual(editor.getModel().getLineContent(7), "	}");
      snippetController.next();
      snippetController.next();
      assert.deepStrictEqual(editor.getPosition(), new Position(6, 3));
    });
  });
  test("Simple canceled", () => {
    snippetTest((editor, template, snippetController) => {
      editor.setPosition({ lineNumber: 4, column: 2 });
      snippetController.insert(template);
      assert.strictEqual(editor.getModel().getLineContent(4), "	for (var index; index < array.length; index++) {");
      assert.strictEqual(editor.getModel().getLineContent(5), "		var element = array[index];");
      assert.strictEqual(editor.getModel().getLineContent(6), "		");
      assert.strictEqual(editor.getModel().getLineContent(7), "	}");
      snippetController.cancel();
      assert.deepStrictEqual(editor.getPosition(), new Position(4, 16));
    });
  });
  test("Stops when calling model.setValue()", () => {
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setPosition({ lineNumber: 4, column: 2 });
      snippetController.insert(codeSnippet);
      editor.getModel().setValue("goodbye");
      assert.strictEqual(snippetController.isInSnippetMode(), false);
    });
  });
  test("Stops when undoing", () => {
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setPosition({ lineNumber: 4, column: 2 });
      snippetController.insert(codeSnippet);
      editor.getModel().undo();
      assert.strictEqual(snippetController.isInSnippetMode(), false);
    });
  });
  test("Stops when moving cursor outside", () => {
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setPosition({ lineNumber: 4, column: 2 });
      snippetController.insert(codeSnippet);
      editor.setPosition({ lineNumber: 1, column: 1 });
      assert.strictEqual(snippetController.isInSnippetMode(), false);
    });
  });
  test("Stops when disconnecting editor model", () => {
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setPosition({ lineNumber: 4, column: 2 });
      snippetController.insert(codeSnippet);
      editor.setModel(null);
      assert.strictEqual(snippetController.isInSnippetMode(), false);
    });
  });
  test("Stops when disposing editor", () => {
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setPosition({ lineNumber: 4, column: 2 });
      snippetController.insert(codeSnippet);
      snippetController.dispose();
      assert.strictEqual(snippetController.isInSnippetMode(), false);
    });
  });
  test("Final tabstop with multiple selections", () => {
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1),
        new Selection(2, 1, 2, 1)
      ]);
      codeSnippet = "foo$0";
      snippetController.insert(codeSnippet);
      assert.strictEqual(editor.getSelections().length, 2);
      const [first, second] = editor.getSelections();
      assert.ok(first.equalsRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }), first.toString());
      assert.ok(second.equalsRange({ startLineNumber: 2, startColumn: 4, endLineNumber: 2, endColumn: 4 }), second.toString());
    });
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1),
        new Selection(2, 1, 2, 1)
      ]);
      codeSnippet = "foo$0bar";
      snippetController.insert(codeSnippet);
      assert.strictEqual(editor.getSelections().length, 2);
      const [first, second] = editor.getSelections();
      assert.ok(first.equalsRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }), first.toString());
      assert.ok(second.equalsRange({ startLineNumber: 2, startColumn: 4, endLineNumber: 2, endColumn: 4 }), second.toString());
    });
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1),
        new Selection(1, 5, 1, 5)
      ]);
      codeSnippet = "foo$0bar";
      snippetController.insert(codeSnippet);
      assert.strictEqual(editor.getSelections().length, 2);
      const [first, second] = editor.getSelections();
      assert.ok(first.equalsRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }), first.toString());
      assert.ok(second.equalsRange({ startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 14 }), second.toString());
    });
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1),
        new Selection(1, 5, 1, 5)
      ]);
      codeSnippet = "foo\n$0\nbar";
      snippetController.insert(codeSnippet);
      assert.strictEqual(editor.getSelections().length, 2);
      const [first, second] = editor.getSelections();
      assert.ok(first.equalsRange({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }), first.toString());
      assert.ok(second.equalsRange({ startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 1 }), second.toString());
    });
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1),
        new Selection(1, 5, 1, 5)
      ]);
      codeSnippet = "foo\n$0\nbar";
      snippetController.insert(codeSnippet);
      assert.strictEqual(editor.getSelections().length, 2);
      const [first, second] = editor.getSelections();
      assert.ok(first.equalsRange({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }), first.toString());
      assert.ok(second.equalsRange({ startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 1 }), second.toString());
    });
    snippetTest((editor, codeSnippet, snippetController) => {
      editor.setSelections([
        new Selection(2, 7, 2, 7)
      ]);
      codeSnippet = "xo$0r";
      snippetController.insert(codeSnippet, { overwriteBefore: 1 });
      assert.strictEqual(editor.getSelections().length, 1);
      assert.ok(editor.getSelection().equalsRange({ startLineNumber: 2, startColumn: 8, endColumn: 8, endLineNumber: 2 }));
    });
  });
  test("Final tabstop, #11742 simple", () => {
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelection(new Selection(1, 19, 1, 19));
      codeSnippet = "{{% url_**$1** %}}";
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.strictEqual(editor.getSelections().length, 1);
      assert.ok(editor.getSelection().equalsRange({ startLineNumber: 1, startColumn: 27, endLineNumber: 1, endColumn: 27 }));
      assert.strictEqual(editor.getModel().getValue(), "example example {{% url_**** %}}");
    }, ["example example sc"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelection(new Selection(1, 3, 1, 3));
      codeSnippet = [
        "afterEach((done) => {",
        "	${1}test",
        "});"
      ].join("\n");
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.strictEqual(editor.getSelections().length, 1);
      assert.ok(editor.getSelection().equalsRange({ startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 2 }), editor.getSelection().toString());
      assert.strictEqual(editor.getModel().getValue(), "afterEach((done) => {\n	test\n});");
    }, ["af"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelection(new Selection(1, 3, 1, 3));
      codeSnippet = [
        "afterEach((done) => {",
        "${1}	test",
        "});"
      ].join("\n");
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.strictEqual(editor.getSelections().length, 1);
      assert.ok(editor.getSelection().equalsRange({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }), editor.getSelection().toString());
      assert.strictEqual(editor.getModel().getValue(), "afterEach((done) => {\n	test\n});");
    }, ["af"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelection(new Selection(1, 9, 1, 9));
      codeSnippet = [
        "aft${1}er"
      ].join("\n");
      controller.insert(codeSnippet, { overwriteBefore: 8 });
      assert.strictEqual(editor.getModel().getValue(), "after");
      assert.strictEqual(editor.getSelections().length, 1);
      assert.ok(editor.getSelection().equalsRange({ startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }), editor.getSelection().toString());
    }, ["afterone"]);
  });
  test("Final tabstop, #11742 different indents", () => {
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(2, 4, 2, 4),
        new Selection(1, 3, 1, 3)
      ]);
      codeSnippet = [
        "afterEach((done) => {",
        "	${0}test",
        "});"
      ].join("\n");
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.strictEqual(editor.getSelections().length, 2);
      const [first, second] = editor.getSelections();
      assert.ok(first.equalsRange({ startLineNumber: 5, startColumn: 3, endLineNumber: 5, endColumn: 3 }), first.toString());
      assert.ok(second.equalsRange({ startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 2 }), second.toString());
    }, ["af", "	af"]);
  });
  test("Final tabstop, #11890 stay at the beginning", () => {
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 5, 1, 5)
      ]);
      codeSnippet = [
        "afterEach((done) => {",
        "${1}	test",
        "});"
      ].join("\n");
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.strictEqual(editor.getSelections().length, 1);
      const [first] = editor.getSelections();
      assert.ok(first.equalsRange({ startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 3 }), first.toString());
    }, ["  af"]);
  });
  test("Final tabstop, no tabstop", () => {
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 3, 1, 3)
      ]);
      codeSnippet = "afterEach";
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.ok(editor.getSelection().equalsRange({ startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 }));
    }, ["af", "	af"]);
  });
  test("Multiple cursor and overwriteBefore/After, issue #11060", () => {
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 7, 1, 7),
        new Selection(2, 4, 2, 4)
      ]);
      codeSnippet = "_foo";
      controller.insert(codeSnippet, { overwriteBefore: 1 });
      assert.strictEqual(editor.getModel().getValue(), "this._foo\nabc_foo");
    }, ["this._", "abc"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 7, 1, 7),
        new Selection(2, 4, 2, 4)
      ]);
      codeSnippet = "XX";
      controller.insert(codeSnippet, { overwriteBefore: 1 });
      assert.strictEqual(editor.getModel().getValue(), "this.XX\nabcXX");
    }, ["this._", "abc"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 7, 1, 7),
        new Selection(2, 4, 2, 4),
        new Selection(3, 5, 3, 5)
      ]);
      codeSnippet = "_foo";
      controller.insert(codeSnippet, { overwriteBefore: 1 });
      assert.strictEqual(editor.getModel().getValue(), "this._foo\nabc_foo\ndef_foo");
    }, ["this._", "abc", "def_"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 7, 1, 7),
        // primary at `this._`
        new Selection(2, 4, 2, 4),
        new Selection(3, 6, 3, 6)
      ]);
      codeSnippet = "._foo";
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.strictEqual(editor.getModel().getValue(), "this._foo\nabc._foo\ndef._foo");
    }, ["this._", "abc", "def._"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(3, 6, 3, 6),
        // primary at `def._`
        new Selection(1, 7, 1, 7),
        new Selection(2, 4, 2, 4)
      ]);
      codeSnippet = "._foo";
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.strictEqual(editor.getModel().getValue(), "this._foo\nabc._foo\ndef._foo");
    }, ["this._", "abc", "def._"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(2, 4, 2, 4),
        // primary at `abc`
        new Selection(3, 6, 3, 6),
        new Selection(1, 7, 1, 7)
      ]);
      codeSnippet = "._foo";
      controller.insert(codeSnippet, { overwriteBefore: 2 });
      assert.strictEqual(editor.getModel().getValue(), "this._._foo\na._foo\ndef._._foo");
    }, ["this._", "abc", "def._"]);
  });
  test("Multiple cursor and overwriteBefore/After, #16277", () => {
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 5, 1, 5),
        new Selection(2, 5, 2, 5)
      ]);
      codeSnippet = "document";
      controller.insert(codeSnippet, { overwriteBefore: 3 });
      assert.strictEqual(editor.getModel().getValue(), "{document}\n{document && true}");
    }, ["{foo}", "{foo && true}"]);
  });
  test("Insert snippet twice, #19449", () => {
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1)
      ]);
      codeSnippet = "for (var ${1:i}=0; ${1:i}<len; ${1:i}++) { $0 }";
      controller.insert(codeSnippet);
      assert.strictEqual(editor.getModel().getValue(), "for (var i=0; i<len; i++) {  }for (var i=0; i<len; i++) {  }");
    }, ["for (var i=0; i<len; i++) {  }"]);
    snippetTest((editor, codeSnippet, controller) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1)
      ]);
      codeSnippet = "for (let ${1:i}=0; ${1:i}<len; ${1:i}++) { $0 }";
      controller.insert(codeSnippet);
      assert.strictEqual(editor.getModel().getValue(), "for (let i=0; i<len; i++) {  }for (var i=0; i<len; i++) {  }");
    }, ["for (var i=0; i<len; i++) {  }"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNuaXBwZXRcXHRlc3RcXGJyb3dzZXJcXHNuaXBwZXRDb250cm9sbGVyMi5vbGQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgSVRlc3RDb2RlRWRpdG9yLCB3aXRoVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcblxuY2xhc3MgVGVzdFNuaXBwZXRDb250cm9sbGVyIGV4dGVuZHMgU25pcHBldENvbnRyb2xsZXIyIHtcblxuXHRwcml2YXRlIF90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRzdXBlcihlZGl0b3IsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKSwgX2NvbnRleHRLZXlTZXJ2aWNlLCB0ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSB0ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Rlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGlzSW5TbmlwcGV0TW9kZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gU25pcHBldENvbnRyb2xsZXIyLkluU25pcHBldE1vZGUuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpITtcblx0fVxufVxuXG5zdWl0ZSgnU25pcHBldENvbnRyb2xsZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc25pcHBldFRlc3QoY2I6IChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdGVtcGxhdGU6IHN0cmluZywgc25pcHBldENvbnRyb2xsZXI6IFRlc3RTbmlwcGV0Q29udHJvbGxlcikgPT4gdm9pZCwgbGluZXM/OiBzdHJpbmdbXSk6IHZvaWQge1xuXG5cdFx0aWYgKCFsaW5lcykge1xuXHRcdFx0bGluZXMgPSBbXG5cdFx0XHRcdCdmdW5jdGlvbiB0ZXN0KCkgeycsXG5cdFx0XHRcdCdcXHR2YXIgeCA9IDM7Jyxcblx0XHRcdFx0J1xcdHZhciBhcnIgPSBbXTsnLFxuXHRcdFx0XHQnXFx0Jyxcblx0XHRcdFx0J30nXG5cdFx0XHRdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMYWJlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhYmVsU2VydmljZT4oKSB7IH1dLFxuXHRcdFx0W0lXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkgeyB9XSxcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKGxpbmVzLCB7IHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IpID0+IHtcblx0XHRcdGVkaXRvci5nZXRNb2RlbCgpIS51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzbmlwcGV0Q29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFRlc3RTbmlwcGV0Q29udHJvbGxlci5JRCwgVGVzdFNuaXBwZXRDb250cm9sbGVyKTtcblx0XHRcdGNvbnN0IHRlbXBsYXRlID0gW1xuXHRcdFx0XHQnZm9yICh2YXIgJHsxOmluZGV4fTsgJDEgPCAkezI6YXJyYXl9Lmxlbmd0aDsgJDErKykgeycsXG5cdFx0XHRcdCdcXHR2YXIgZWxlbWVudCA9ICQyWyQxXTsnLFxuXHRcdFx0XHQnXFx0JDAnLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNiKGVkaXRvciwgdGVtcGxhdGUsIHNuaXBwZXRDb250cm9sbGVyKTtcblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ1NpbXBsZSBhY2NlcHRlZCcsICgpID0+IHtcblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCB0ZW1wbGF0ZSwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDQsIGNvbHVtbjogMiB9KTtcblxuXHRcdFx0c25pcHBldENvbnRyb2xsZXIuaW5zZXJ0KHRlbXBsYXRlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRmb3IgKHZhciBpbmRleDsgaW5kZXggPCBhcnJheS5sZW5ndGg7IGluZGV4KyspIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNSksICdcXHRcXHR2YXIgZWxlbWVudCA9IGFycmF5W2luZGV4XTsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNiksICdcXHRcXHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNyksICdcXHR9Jyk7XG5cblx0XHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3R5cGUnLCB7IHRleHQ6ICdpJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRmb3IgKHZhciBpOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNSksICdcXHRcXHR2YXIgZWxlbWVudCA9IGFycmF5W2ldOycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg2KSwgJ1xcdFxcdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg3KSwgJ1xcdH0nKTtcblxuXHRcdFx0c25pcHBldENvbnRyb2xsZXIubmV4dCgpO1xuXHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ2FycicgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDQpLCAnXFx0Zm9yICh2YXIgaTsgaSA8IGFyci5sZW5ndGg7IGkrKykgeycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg1KSwgJ1xcdFxcdHZhciBlbGVtZW50ID0gYXJyW2ldOycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg2KSwgJ1xcdFxcdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg3KSwgJ1xcdH0nKTtcblxuXHRcdFx0c25pcHBldENvbnRyb2xsZXIucHJldigpO1xuXHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCAndHlwZScsIHsgdGV4dDogJ2onIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg0KSwgJ1xcdGZvciAodmFyIGo7IGogPCBhcnIubGVuZ3RoOyBqKyspIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNSksICdcXHRcXHR2YXIgZWxlbWVudCA9IGFycltqXTsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNiksICdcXHRcXHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNyksICdcXHR9Jyk7XG5cblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLm5leHQoKTtcblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLm5leHQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFBvc2l0aW9uKCksIG5ldyBQb3NpdGlvbig2LCAzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NpbXBsZSBjYW5jZWxlZCcsICgpID0+IHtcblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCB0ZW1wbGF0ZSwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDQsIGNvbHVtbjogMiB9KTtcblxuXHRcdFx0c25pcHBldENvbnRyb2xsZXIuaW5zZXJ0KHRlbXBsYXRlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRmb3IgKHZhciBpbmRleDsgaW5kZXggPCBhcnJheS5sZW5ndGg7IGluZGV4KyspIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNSksICdcXHRcXHR2YXIgZWxlbWVudCA9IGFycmF5W2luZGV4XTsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNiksICdcXHRcXHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNyksICdcXHR9Jyk7XG5cblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLmNhbmNlbCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0UG9zaXRpb24oKSwgbmV3IFBvc2l0aW9uKDQsIDE2KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIHRlc3QoJ1N0b3BzIHdoZW4gZGVsZXRpbmcgbGluZXMgYWJvdmUnLCAoKSA9PiB7XG5cdC8vIFx0c25pcHBldFRlc3QoKGVkaXRvciwgY29kZVNuaXBwZXQsIHNuaXBwZXRDb250cm9sbGVyKSA9PiB7XG5cdC8vIFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiA0LCBjb2x1bW46IDIgfSk7XG5cdC8vIFx0XHRzbmlwcGV0Q29udHJvbGxlci5pbnNlcnQoY29kZVNuaXBwZXQsIDAsIDApO1xuXG5cdC8vIFx0XHRlZGl0b3IuZ2V0TW9kZWwoKSEuYXBwbHlFZGl0cyhbe1xuXHQvLyBcdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZSxcblx0Ly8gXHRcdFx0aWRlbnRpZmllcjogbnVsbCxcblx0Ly8gXHRcdFx0aXNBdXRvV2hpdGVzcGFjZUVkaXQ6IGZhbHNlLFxuXHQvLyBcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDMsIDEpLFxuXHQvLyBcdFx0XHR0ZXh0OiBudWxsXG5cdC8vIFx0XHR9XSk7XG5cblx0Ly8gXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0Q29udHJvbGxlci5pc0luU25pcHBldE1vZGUoKSwgZmFsc2UpO1xuXHQvLyBcdH0pO1xuXHQvLyB9KTtcblxuXHQvLyB0ZXN0KCdTdG9wcyB3aGVuIGRlbGV0aW5nIGxpbmVzIGJlbG93JywgKCkgPT4ge1xuXHQvLyBcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBzbmlwcGV0Q29udHJvbGxlcikgPT4ge1xuXHQvLyBcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogNCwgY29sdW1uOiAyIH0pO1xuXHQvLyBcdFx0c25pcHBldENvbnRyb2xsZXIucnVuKGNvZGVTbmlwcGV0LCAwLCAwKTtcblxuXHQvLyBcdFx0ZWRpdG9yLmdldE1vZGVsKCkhLmFwcGx5RWRpdHMoW3tcblx0Ly8gXHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogZmFsc2UsXG5cdC8vIFx0XHRcdGlkZW50aWZpZXI6IG51bGwsXG5cdC8vIFx0XHRcdGlzQXV0b1doaXRlc3BhY2VFZGl0OiBmYWxzZSxcblx0Ly8gXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSg4LCAxLCA4LCAxMDApLFxuXHQvLyBcdFx0XHR0ZXh0OiBudWxsXG5cdC8vIFx0XHR9XSk7XG5cblx0Ly8gXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0Q29udHJvbGxlci5pc0luU25pcHBldE1vZGUoKSwgZmFsc2UpO1xuXHQvLyBcdH0pO1xuXHQvLyB9KTtcblxuXHQvLyB0ZXN0KCdTdG9wcyB3aGVuIGluc2VydGluZyBsaW5lcyBhYm92ZScsICgpID0+IHtcblx0Ly8gXHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0Ly8gXHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDQsIGNvbHVtbjogMiB9KTtcblx0Ly8gXHRcdHNuaXBwZXRDb250cm9sbGVyLnJ1bihjb2RlU25pcHBldCwgMCwgMCk7XG5cblx0Ly8gXHRcdGVkaXRvci5nZXRNb2RlbCgpIS5hcHBseUVkaXRzKFt7XG5cdC8vIFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlLFxuXHQvLyBcdFx0XHRpZGVudGlmaWVyOiBudWxsLFxuXHQvLyBcdFx0XHRpc0F1dG9XaGl0ZXNwYWNlRWRpdDogZmFsc2UsXG5cdC8vIFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTAwLCAxLCAxMDApLFxuXHQvLyBcdFx0XHR0ZXh0OiAnXFxuSGVsbG8nXG5cdC8vIFx0XHR9XSk7XG5cblx0Ly8gXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0Q29udHJvbGxlci5pc0luU25pcHBldE1vZGUoKSwgZmFsc2UpO1xuXHQvLyBcdH0pO1xuXHQvLyB9KTtcblxuXHQvLyB0ZXN0KCdTdG9wcyB3aGVuIGluc2VydGluZyBsaW5lcyBiZWxvdycsICgpID0+IHtcblx0Ly8gXHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0Ly8gXHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDQsIGNvbHVtbjogMiB9KTtcblx0Ly8gXHRcdHNuaXBwZXRDb250cm9sbGVyLnJ1bihjb2RlU25pcHBldCwgMCwgMCk7XG5cblx0Ly8gXHRcdGVkaXRvci5nZXRNb2RlbCgpIS5hcHBseUVkaXRzKFt7XG5cdC8vIFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlLFxuXHQvLyBcdFx0XHRpZGVudGlmaWVyOiBudWxsLFxuXHQvLyBcdFx0XHRpc0F1dG9XaGl0ZXNwYWNlRWRpdDogZmFsc2UsXG5cdC8vIFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoOCwgMTAwLCA4LCAxMDApLFxuXHQvLyBcdFx0XHR0ZXh0OiAnXFxuSGVsbG8nXG5cdC8vIFx0XHR9XSk7XG5cblx0Ly8gXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0Q29udHJvbGxlci5pc0luU25pcHBldE1vZGUoKSwgZmFsc2UpO1xuXHQvLyBcdH0pO1xuXHQvLyB9KTtcblxuXHR0ZXN0KCdTdG9wcyB3aGVuIGNhbGxpbmcgbW9kZWwuc2V0VmFsdWUoKScsICgpID0+IHtcblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDQsIGNvbHVtbjogMiB9KTtcblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCk7XG5cblx0XHRcdGVkaXRvci5nZXRNb2RlbCgpIS5zZXRWYWx1ZSgnZ29vZGJ5ZScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldENvbnRyb2xsZXIuaXNJblNuaXBwZXRNb2RlKCksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU3RvcHMgd2hlbiB1bmRvaW5nJywgKCkgPT4ge1xuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBzbmlwcGV0Q29udHJvbGxlcikgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogNCwgY29sdW1uOiAyIH0pO1xuXHRcdFx0c25pcHBldENvbnRyb2xsZXIuaW5zZXJ0KGNvZGVTbmlwcGV0KTtcblxuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnVuZG8oKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRDb250cm9sbGVyLmlzSW5TbmlwcGV0TW9kZSgpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0b3BzIHdoZW4gbW92aW5nIGN1cnNvciBvdXRzaWRlJywgKCkgPT4ge1xuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBzbmlwcGV0Q29udHJvbGxlcikgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogNCwgY29sdW1uOiAyIH0pO1xuXHRcdFx0c25pcHBldENvbnRyb2xsZXIuaW5zZXJ0KGNvZGVTbmlwcGV0KTtcblxuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldENvbnRyb2xsZXIuaXNJblNuaXBwZXRNb2RlKCksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU3RvcHMgd2hlbiBkaXNjb25uZWN0aW5nIGVkaXRvciBtb2RlbCcsICgpID0+IHtcblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDQsIGNvbHVtbjogMiB9KTtcblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCk7XG5cblx0XHRcdGVkaXRvci5zZXRNb2RlbChudWxsKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRDb250cm9sbGVyLmlzSW5TbmlwcGV0TW9kZSgpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0b3BzIHdoZW4gZGlzcG9zaW5nIGVkaXRvcicsICgpID0+IHtcblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDQsIGNvbHVtbjogMiB9KTtcblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCk7XG5cblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXRDb250cm9sbGVyLmlzSW5TbmlwcGV0TW9kZSgpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbmFsIHRhYnN0b3Agd2l0aCBtdWx0aXBsZSBzZWxlY3Rpb25zJywgKCkgPT4ge1xuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBzbmlwcGV0Q29udHJvbGxlcikgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvZGVTbmlwcGV0ID0gJ2ZvbyQwJztcblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIS5sZW5ndGgsIDIpO1xuXHRcdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKSE7XG5cdFx0XHRhc3NlcnQub2soZmlyc3QuZXF1YWxzUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiA0LCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDQgfSksIGZpcnN0LnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlY29uZC5lcXVhbHNSYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDQsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogNCB9KSwgc2Vjb25kLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0c25pcHBldFRlc3QoKGVkaXRvciwgY29kZVNuaXBwZXQsIHNuaXBwZXRDb250cm9sbGVyKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29kZVNuaXBwZXQgPSAnZm9vJDBiYXInO1xuXHRcdFx0c25pcHBldENvbnRyb2xsZXIuaW5zZXJ0KGNvZGVTbmlwcGV0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLmxlbmd0aCwgMik7XG5cdFx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpITtcblx0XHRcdGFzc2VydC5vayhmaXJzdC5lcXVhbHNSYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDQsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogNCB9KSwgZmlyc3QudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc2Vjb25kLmVxdWFsc1JhbmdlKHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogNCwgZW5kTGluZU51bWJlcjogMiwgZW5kQ29sdW1uOiA0IH0pLCBzZWNvbmQudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICdmb28kMGJhcic7XG5cdFx0XHRzbmlwcGV0Q29udHJvbGxlci5pbnNlcnQoY29kZVNuaXBwZXQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubGVuZ3RoLCAyKTtcblx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpcnN0LmVxdWFsc1JhbmdlKHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogNCwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA0IH0pLCBmaXJzdC50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzZWNvbmQuZXF1YWxzUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxNCwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxNCB9KSwgc2Vjb25kLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0c25pcHBldFRlc3QoKGVkaXRvciwgY29kZVNuaXBwZXQsIHNuaXBwZXRDb250cm9sbGVyKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29kZVNuaXBwZXQgPSAnZm9vXFxuJDBcXG5iYXInO1xuXHRcdFx0c25pcHBldENvbnRyb2xsZXIuaW5zZXJ0KGNvZGVTbmlwcGV0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLmxlbmd0aCwgMik7XG5cdFx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpITtcblx0XHRcdGFzc2VydC5vayhmaXJzdC5lcXVhbHNSYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMSB9KSwgZmlyc3QudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc2Vjb25kLmVxdWFsc1JhbmdlKHsgc3RhcnRMaW5lTnVtYmVyOiA0LCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogNCwgZW5kQ29sdW1uOiAxIH0pLCBzZWNvbmQudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgc25pcHBldENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICdmb29cXG4kMFxcbmJhcic7XG5cdFx0XHRzbmlwcGV0Q29udHJvbGxlci5pbnNlcnQoY29kZVNuaXBwZXQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubGVuZ3RoLCAyKTtcblx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpcnN0LmVxdWFsc1JhbmdlKHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMiwgZW5kQ29sdW1uOiAxIH0pLCBmaXJzdC50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzZWNvbmQuZXF1YWxzUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IDQsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDEgfSksIHNlY29uZC50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBzbmlwcGV0Q29udHJvbGxlcikgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDcsIDIsIDcpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvZGVTbmlwcGV0ID0gJ3hvJDByJztcblx0XHRcdHNuaXBwZXRDb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCwgeyBvdmVyd3JpdGVCZWZvcmU6IDEgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVkaXRvci5nZXRTZWxlY3Rpb24oKSEuZXF1YWxzUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiA4LCBlbmRDb2x1bW46IDgsIGVuZExpbmVOdW1iZXI6IDIgfSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaW5hbCB0YWJzdG9wLCAjMTE3NDIgc2ltcGxlJywgKCkgPT4ge1xuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBjb250cm9sbGVyKSA9PiB7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxOSwgMSwgMTkpKTtcblxuXHRcdFx0Y29kZVNuaXBwZXQgPSAne3slIHVybF8qKiQxKiogJX19Jztcblx0XHRcdGNvbnRyb2xsZXIuaW5zZXJ0KGNvZGVTbmlwcGV0LCB7IG92ZXJ3cml0ZUJlZm9yZTogMiB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soZWRpdG9yLmdldFNlbGVjdGlvbigpIS5lcXVhbHNSYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDI3LCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDI3IH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ2V4YW1wbGUgZXhhbXBsZSB7eyUgdXJsXyoqKiogJX19Jyk7XG5cblx0XHR9LCBbJ2V4YW1wbGUgZXhhbXBsZSBzYyddKTtcblxuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBjb250cm9sbGVyKSA9PiB7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSk7XG5cblx0XHRcdGNvZGVTbmlwcGV0ID0gW1xuXHRcdFx0XHQnYWZ0ZXJFYWNoKChkb25lKSA9PiB7Jyxcblx0XHRcdFx0J1xcdCR7MX10ZXN0Jyxcblx0XHRcdFx0J30pOydcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnRyb2xsZXIuaW5zZXJ0KGNvZGVTbmlwcGV0LCB7IG92ZXJ3cml0ZUJlZm9yZTogMiB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soZWRpdG9yLmdldFNlbGVjdGlvbigpIS5lcXVhbHNSYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDIsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMiB9KSwgZWRpdG9yLmdldFNlbGVjdGlvbigpIS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ2FmdGVyRWFjaCgoZG9uZSkgPT4ge1xcblxcdHRlc3RcXG59KTsnKTtcblxuXHRcdH0sIFsnYWYnXSk7XG5cblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgY29udHJvbGxlcikgPT4ge1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMykpO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9IFtcblx0XHRcdFx0J2FmdGVyRWFjaCgoZG9uZSkgPT4geycsXG5cdFx0XHRcdCckezF9XFx0dGVzdCcsXG5cdFx0XHRcdCd9KTsnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCwgeyBvdmVyd3JpdGVCZWZvcmU6IDIgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVkaXRvci5nZXRTZWxlY3Rpb24oKSEuZXF1YWxzUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAyLCBlbmRDb2x1bW46IDEgfSksIGVkaXRvci5nZXRTZWxlY3Rpb24oKSEudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksICdhZnRlckVhY2goKGRvbmUpID0+IHtcXG5cXHR0ZXN0XFxufSk7Jyk7XG5cblx0XHR9LCBbJ2FmJ10pO1xuXG5cdFx0c25pcHBldFRlc3QoKGVkaXRvciwgY29kZVNuaXBwZXQsIGNvbnRyb2xsZXIpID0+IHtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDkpKTtcblxuXHRcdFx0Y29kZVNuaXBwZXQgPSBbXG5cdFx0XHRcdCdhZnQkezF9ZXInXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCwgeyBvdmVyd3JpdGVCZWZvcmU6IDggfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ2FmdGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhlZGl0b3IuZ2V0U2VsZWN0aW9uKCkhLmVxdWFsc1JhbmdlKHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogNCwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA0IH0pLCBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkhLnRvU3RyaW5nKCkpO1xuXG5cdFx0fSwgWydhZnRlcm9uZSddKTtcblx0fSk7XG5cblx0dGVzdCgnRmluYWwgdGFic3RvcCwgIzExNzQyIGRpZmZlcmVudCBpbmRlbnRzJywgKCkgPT4ge1xuXG5cdFx0c25pcHBldFRlc3QoKGVkaXRvciwgY29kZVNuaXBwZXQsIGNvbnRyb2xsZXIpID0+IHtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29kZVNuaXBwZXQgPSBbXG5cdFx0XHRcdCdhZnRlckVhY2goKGRvbmUpID0+IHsnLFxuXHRcdFx0XHQnXFx0JHswfXRlc3QnLFxuXHRcdFx0XHQnfSk7J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29udHJvbGxlci5pbnNlcnQoY29kZVNuaXBwZXQsIHsgb3ZlcndyaXRlQmVmb3JlOiAyIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubGVuZ3RoLCAyKTtcblx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhO1xuXG5cdFx0XHRhc3NlcnQub2soZmlyc3QuZXF1YWxzUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IDUsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiA1LCBlbmRDb2x1bW46IDMgfSksIGZpcnN0LnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlY29uZC5lcXVhbHNSYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDIsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMiB9KSwgc2Vjb25kLnRvU3RyaW5nKCkpO1xuXG5cdFx0fSwgWydhZicsICdcXHRhZiddKTtcblx0fSk7XG5cblx0dGVzdCgnRmluYWwgdGFic3RvcCwgIzExODkwIHN0YXkgYXQgdGhlIGJlZ2lubmluZycsICgpID0+IHtcblxuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBjb250cm9sbGVyKSA9PiB7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvZGVTbmlwcGV0ID0gW1xuXHRcdFx0XHQnYWZ0ZXJFYWNoKChkb25lKSA9PiB7Jyxcblx0XHRcdFx0JyR7MX1cXHR0ZXN0Jyxcblx0XHRcdFx0J30pOydcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnRyb2xsZXIuaW5zZXJ0KGNvZGVTbmlwcGV0LCB7IG92ZXJ3cml0ZUJlZm9yZTogMiB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBbZmlyc3RdID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKSE7XG5cblx0XHRcdGFzc2VydC5vayhmaXJzdC5lcXVhbHNSYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMyB9KSwgZmlyc3QudG9TdHJpbmcoKSk7XG5cblx0XHR9LCBbJyAgYWYnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbmFsIHRhYnN0b3AsIG5vIHRhYnN0b3AnLCAoKSA9PiB7XG5cblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgY29udHJvbGxlcikgPT4ge1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMylcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICdhZnRlckVhY2gnO1xuXG5cdFx0XHRjb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCwgeyBvdmVyd3JpdGVCZWZvcmU6IDIgfSk7XG5cblx0XHRcdGFzc2VydC5vayhlZGl0b3IuZ2V0U2VsZWN0aW9uKCkhLmVxdWFsc1JhbmdlKHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMTAsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMTAgfSkpO1xuXG5cdFx0fSwgWydhZicsICdcXHRhZiddKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgY3Vyc29yIGFuZCBvdmVyd3JpdGVCZWZvcmUvQWZ0ZXIsIGlzc3VlICMxMTA2MCcsICgpID0+IHtcblxuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBjb250cm9sbGVyKSA9PiB7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCA0KVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvZGVTbmlwcGV0ID0gJ19mb28nO1xuXHRcdFx0Y29udHJvbGxlci5pbnNlcnQoY29kZVNuaXBwZXQsIHsgb3ZlcndyaXRlQmVmb3JlOiAxIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRWYWx1ZSgpLCAndGhpcy5fZm9vXFxuYWJjX2ZvbycpO1xuXG5cdFx0fSwgWyd0aGlzLl8nLCAnYWJjJ10pO1xuXG5cdFx0c25pcHBldFRlc3QoKGVkaXRvciwgY29kZVNuaXBwZXQsIGNvbnRyb2xsZXIpID0+IHtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDQpXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29kZVNuaXBwZXQgPSAnWFgnO1xuXHRcdFx0Y29udHJvbGxlci5pbnNlcnQoY29kZVNuaXBwZXQsIHsgb3ZlcndyaXRlQmVmb3JlOiAxIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRWYWx1ZSgpLCAndGhpcy5YWFxcbmFiY1hYJyk7XG5cblx0XHR9LCBbJ3RoaXMuXycsICdhYmMnXSk7XG5cblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgY29udHJvbGxlcikgPT4ge1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNSwgMywgNSlcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICdfZm9vJztcblx0XHRcdGNvbnRyb2xsZXIuaW5zZXJ0KGNvZGVTbmlwcGV0LCB7IG92ZXJ3cml0ZUJlZm9yZTogMSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgJ3RoaXMuX2Zvb1xcbmFiY19mb29cXG5kZWZfZm9vJyk7XG5cblx0XHR9LCBbJ3RoaXMuXycsICdhYmMnLCAnZGVmXyddKTtcblxuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBjb250cm9sbGVyKSA9PiB7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSwgLy8gcHJpbWFyeSBhdCBgdGhpcy5fYFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDYsIDMsIDYpXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29kZVNuaXBwZXQgPSAnLl9mb28nO1xuXHRcdFx0Y29udHJvbGxlci5pbnNlcnQoY29kZVNuaXBwZXQsIHsgb3ZlcndyaXRlQmVmb3JlOiAyIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRWYWx1ZSgpLCAndGhpcy5fZm9vXFxuYWJjLl9mb29cXG5kZWYuX2ZvbycpO1xuXG5cdFx0fSwgWyd0aGlzLl8nLCAnYWJjJywgJ2RlZi5fJ10pO1xuXG5cdFx0c25pcHBldFRlc3QoKGVkaXRvciwgY29kZVNuaXBwZXQsIGNvbnRyb2xsZXIpID0+IHtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDYsIDMsIDYpLCAvLyBwcmltYXJ5IGF0IGBkZWYuX2Bcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCA0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICcuX2Zvbyc7XG5cdFx0XHRjb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCwgeyBvdmVyd3JpdGVCZWZvcmU6IDIgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksICd0aGlzLl9mb29cXG5hYmMuX2Zvb1xcbmRlZi5fZm9vJyk7XG5cblx0XHR9LCBbJ3RoaXMuXycsICdhYmMnLCAnZGVmLl8nXSk7XG5cblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgY29udHJvbGxlcikgPT4ge1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNCksIC8vIHByaW1hcnkgYXQgYGFiY2Bcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA2LCAzLCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICcuX2Zvbyc7XG5cdFx0XHRjb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCwgeyBvdmVyd3JpdGVCZWZvcmU6IDIgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksICd0aGlzLl8uX2Zvb1xcbmEuX2Zvb1xcbmRlZi5fLl9mb28nKTtcblxuXHRcdH0sIFsndGhpcy5fJywgJ2FiYycsICdkZWYuXyddKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBjdXJzb3IgYW5kIG92ZXJ3cml0ZUJlZm9yZS9BZnRlciwgIzE2Mjc3JywgKCkgPT4ge1xuXHRcdHNuaXBwZXRUZXN0KChlZGl0b3IsIGNvZGVTbmlwcGV0LCBjb250cm9sbGVyKSA9PiB7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA1LCAyLCA1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICdkb2N1bWVudCc7XG5cdFx0XHRjb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCwgeyBvdmVyd3JpdGVCZWZvcmU6IDMgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksICd7ZG9jdW1lbnR9XFxue2RvY3VtZW50ICYmIHRydWV9Jyk7XG5cblx0XHR9LCBbJ3tmb299JywgJ3tmb28gJiYgdHJ1ZX0nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBzbmlwcGV0IHR3aWNlLCAjMTk0NDknLCAoKSA9PiB7XG5cblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgY29udHJvbGxlcikgPT4ge1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSlcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICdmb3IgKHZhciAkezE6aX09MDsgJHsxOml9PGxlbjsgJHsxOml9KyspIHsgJDAgfSc7XG5cdFx0XHRjb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksICdmb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHsgIH1mb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHsgIH0nKTtcblxuXHRcdH0sIFsnZm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7ICB9J10pO1xuXG5cblx0XHRzbmlwcGV0VGVzdCgoZWRpdG9yLCBjb2RlU25pcHBldCwgY29udHJvbGxlcikgPT4ge1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSlcblx0XHRcdF0pO1xuXG5cdFx0XHRjb2RlU25pcHBldCA9ICdmb3IgKGxldCAkezE6aX09MDsgJHsxOml9PGxlbjsgJHsxOml9KyspIHsgJDAgfSc7XG5cdFx0XHRjb250cm9sbGVyLmluc2VydChjb2RlU25pcHBldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlKCksICdmb3IgKGxldCBpPTA7IGk8bGVuOyBpKyspIHsgIH1mb3IgKHZhciBpPTA7IGk8bGVuOyBpKyspIHsgIH0nKTtcblxuXHRcdH0sIFsnZm9yICh2YXIgaT0wOyBpPGxlbjsgaSsrKSB7ICB9J10pO1xuXG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBMEIsMEJBQTBCO0FBQ3BELFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0NBQWdDO0FBRXpDLElBQU0sd0JBQU4sY0FBb0MsbUJBQW1CO0FBQUEsRUFJdEQsWUFDQyxRQUNxQyxvQkFDcEM7QUFDRCxVQUFNLG1DQUFtQyxJQUFJLGlDQUFpQztBQUM5RSxVQUFNLFFBQVEsSUFBSSxlQUFlLEdBQUcsSUFBSSx3QkFBd0IsR0FBRyxvQkFBb0IsZ0NBQWdDO0FBSGxGO0FBSXJDLFNBQUssb0NBQW9DO0FBQUEsRUFDMUM7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUNkLFNBQUssa0NBQWtDLFFBQVE7QUFBQSxFQUNoRDtBQUFBLEVBRUEsa0JBQTJCO0FBQzFCLFdBQU8sbUJBQW1CLGNBQWMsU0FBUyxLQUFLLGtCQUFrQjtBQUFBLEVBQ3pFO0FBQ0Q7QUFyQk0sd0JBQU47QUFBQSxFQU1HO0FBQUEsR0FORztBQXVCTixNQUFNLHFCQUFxQixNQUFNO0FBRWhDLDBDQUF3QztBQUV4QyxXQUFTLFlBQVksSUFBbUcsT0FBd0I7QUFFL0ksUUFBSSxDQUFDLE9BQU87QUFDWCxjQUFRO0FBQUEs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QUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUVELG9CQUFjO0FBQ2QsaUJBQVcsT0FBTyxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztBQUNyRCxhQUFPLFlBQVksT0FBTyxTQUFTLEVBQUcsU0FBUyxHQUFHLGlDQUFpQztBQUFBLElBRXBGLEdBQUcsQ0FBQyxVQUFVLE9BQU8sT0FBTyxDQUFDO0FBQUEsRUFFOUIsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0QsZ0JBQVksQ0FBQyxRQUFRLGFBQWEsZUFBZTtBQUVoRCxhQUFPLGNBQWM7QUFBQSxRQUNwQixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUVELG9CQUFjO0FBQ2QsaUJBQVcsT0FBTyxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztBQUNyRCxhQUFPLFlBQVksT0FBTyxTQUFTLEVBQUcsU0FBUyxHQUFHLGdDQUFnQztBQUFBLElBRW5GLEdBQUcsQ0FBQyxTQUFTLGVBQWUsQ0FBQztBQUFBLEVBQzlCLENBQUM7QUFFRCxPQUFLLGdDQUFnQyxNQUFNO0FBRTFDLGdCQUFZLENBQUMsUUFBUSxhQUFhLGVBQWU7QUFFaEQsYUFBTyxjQUFjO0FBQUEsUUFDcEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN6QixDQUFDO0FBRUQsb0JBQWM7QUFDZCxpQkFBVyxPQUFPLFdBQVc7QUFDN0IsYUFBTyxZQUFZLE9BQU8sU0FBUyxFQUFHLFNBQVMsR0FBRyw4REFBOEQ7QUFBQSxJQUVqSCxHQUFHLENBQUMsZ0NBQWdDLENBQUM7QUFHckMsZ0JBQVksQ0FBQyxRQUFRLGFBQWEsZUFBZTtBQUVoRCxhQUFPLGNBQWM7QUFBQSxRQUNwQixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFFRCxvQkFBYztBQUNkLGlCQUFXLE9BQU8sV0FBVztBQUM3QixhQUFPLFlBQVksT0FBTyxTQUFTLEVBQUcsU0FBUyxHQUFHLDhEQUE4RDtBQUFBLElBRWpILEdBQUcsQ0FBQyxnQ0FBZ0MsQ0FBQztBQUFBLEVBRXRDLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
