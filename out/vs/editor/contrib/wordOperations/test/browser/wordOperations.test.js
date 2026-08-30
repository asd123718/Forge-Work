import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { isFirefox } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CoreEditingCommands } from "../../../../browser/coreCommands.js";
import { Position } from "../../../../common/core/position.js";
import { Selection } from "../../../../common/core/selection.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { CursorWordAccessibilityLeft, CursorWordAccessibilityLeftSelect, CursorWordAccessibilityRight, CursorWordAccessibilityRightSelect, CursorWordEndLeft, CursorWordEndLeftSelect, CursorWordEndRight, CursorWordEndRightSelect, CursorWordLeft, CursorWordLeftSelect, CursorWordRight, CursorWordRightSelect, CursorWordStartLeft, CursorWordStartLeftSelect, CursorWordStartRight, CursorWordStartRightSelect, DeleteInsideWord, DeleteWordEndLeft, DeleteWordEndRight, DeleteWordLeft, DeleteWordRight, DeleteWordStartLeft, DeleteWordStartRight } from "../../browser/wordOperations.js";
import { deserializePipePositions, serializePipePositions, testRepeatedActionAndExtractPositions } from "./wordTestUtils.js";
import { createCodeEditorServices, instantiateTestCodeEditor, withTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { instantiateTextModel } from "../../../../test/common/testTextModel.js";
suite("WordOperations", () => {
  const _cursorWordStartLeft = new CursorWordStartLeft();
  const _cursorWordEndLeft = new CursorWordEndLeft();
  const _cursorWordLeft = new CursorWordLeft();
  const _cursorWordStartLeftSelect = new CursorWordStartLeftSelect();
  const _cursorWordEndLeftSelect = new CursorWordEndLeftSelect();
  const _cursorWordLeftSelect = new CursorWordLeftSelect();
  const _cursorWordStartRight = new CursorWordStartRight();
  const _cursorWordEndRight = new CursorWordEndRight();
  const _cursorWordRight = new CursorWordRight();
  const _cursorWordStartRightSelect = new CursorWordStartRightSelect();
  const _cursorWordEndRightSelect = new CursorWordEndRightSelect();
  const _cursorWordRightSelect = new CursorWordRightSelect();
  const _cursorWordAccessibilityLeft = new CursorWordAccessibilityLeft();
  const _cursorWordAccessibilityLeftSelect = new CursorWordAccessibilityLeftSelect();
  const _cursorWordAccessibilityRight = new CursorWordAccessibilityRight();
  const _cursorWordAccessibilityRightSelect = new CursorWordAccessibilityRightSelect();
  const _deleteWordLeft = new DeleteWordLeft();
  const _deleteWordStartLeft = new DeleteWordStartLeft();
  const _deleteWordEndLeft = new DeleteWordEndLeft();
  const _deleteWordRight = new DeleteWordRight();
  const _deleteWordStartRight = new DeleteWordStartRight();
  const _deleteWordEndRight = new DeleteWordEndRight();
  const _deleteInsideWord = new DeleteInsideWord();
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createCodeEditorServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function runEditorCommand(editor, command) {
    instantiationService.invokeFunction((accessor) => {
      command.runEditorCommand(accessor, editor, null);
    });
  }
  function cursorWordLeft(editor, inSelectionMode = false) {
    runEditorCommand(editor, inSelectionMode ? _cursorWordLeftSelect : _cursorWordLeft);
  }
  function cursorWordAccessibilityLeft(editor, inSelectionMode = false) {
    runEditorCommand(editor, inSelectionMode ? _cursorWordAccessibilityLeft : _cursorWordAccessibilityLeftSelect);
  }
  function cursorWordAccessibilityRight(editor, inSelectionMode = false) {
    runEditorCommand(editor, inSelectionMode ? _cursorWordAccessibilityRightSelect : _cursorWordAccessibilityRight);
  }
  function cursorWordStartLeft(editor, inSelectionMode = false) {
    runEditorCommand(editor, inSelectionMode ? _cursorWordStartLeftSelect : _cursorWordStartLeft);
  }
  function cursorWordEndLeft(editor, inSelectionMode = false) {
    runEditorCommand(editor, inSelectionMode ? _cursorWordEndLeftSelect : _cursorWordEndLeft);
  }
  function cursorWordRight(editor, inSelectionMode = false) {
    runEditorCommand(editor, inSelectionMode ? _cursorWordRightSelect : _cursorWordRight);
  }
  function moveWordEndRight(editor, inSelectionMode = false) {
    runEditorCommand(editor, inSelectionMode ? _cursorWordEndRightSelect : _cursorWordEndRight);
  }
  function moveWordStartRight(editor, inSelectionMode = false) {
    runEditorCommand(editor, inSelectionMode ? _cursorWordStartRightSelect : _cursorWordStartRight);
  }
  function deleteWordLeft(editor) {
    runEditorCommand(editor, _deleteWordLeft);
  }
  function deleteWordStartLeft(editor) {
    runEditorCommand(editor, _deleteWordStartLeft);
  }
  function deleteWordEndLeft(editor) {
    runEditorCommand(editor, _deleteWordEndLeft);
  }
  function deleteWordRight(editor) {
    runEditorCommand(editor, _deleteWordRight);
  }
  function deleteWordStartRight(editor) {
    runEditorCommand(editor, _deleteWordStartRight);
  }
  function deleteWordEndRight(editor) {
    runEditorCommand(editor, _deleteWordEndRight);
  }
  function deleteInsideWord(editor, args) {
    _deleteInsideWord.run(null, editor, args);
  }
  test("cursorWordLeft - simple", () => {
    const EXPECTED = [
      "|    	|My |First |Line	 ",
      "|	|My |Second |Line",
      "|    |Third |Line\u{1F436}",
      "|",
      "|1"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordLeft - with selection", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor) => {
      editor.setPosition(new Position(5, 2));
      cursorWordLeft(editor, true);
      assert.deepStrictEqual(editor.getSelection(), new Selection(5, 2, 5, 1));
    });
  });
  test("cursorWordLeft - issue #832", () => {
    const EXPECTED = ["|   |/* |Just |some   |more   |text |a|+= |3 |+|5-|3 |+ |7 |*/  "].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordLeft - issue #48046: Word selection doesn't work as usual", () => {
    const EXPECTED = [
      "|deep.|object.|property"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 21),
      (ed) => cursorWordLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordLeft - Recognize words", function() {
    if (isFirefox) {
      return this.skip();
    }
    const EXPECTED = [
      "|/* |\u3053\u308C|\u306F|\u30C6\u30B9\u30C8|\u3067\u3059 |/*"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordLeft(ed, true),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1)),
      {
        wordSegmenterLocales: "ja"
      }
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordLeft - Does not recognize words", () => {
    const EXPECTED = [
      "|/* |\u3053\u308C\u306F\u30C6\u30B9\u30C8\u3067\u3059 |/*"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordLeft(ed, true),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1)),
      {
        wordSegmenterLocales: ""
      }
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordLeft - issue #169904: cursors out of sync", () => {
    const text = [
      ".grid1 {",
      "  display: grid;",
      "  grid-template-columns:",
      "    [full-start] minmax(1em, 1fr)",
      "    [main-start] minmax(0, 40em) [main-end]",
      "    minmax(1em, 1fr) [full-end];",
      "}",
      ".grid2 {",
      "  display: grid;",
      "  grid-template-columns:",
      "    [full-start] minmax(1em, 1fr)",
      "    [main-start] minmax(0, 40em) [main-end] minmax(1em, 1fr) [full-end];",
      "}"
    ];
    withTestCodeEditor(text, {}, (editor) => {
      editor.setSelections([
        new Selection(5, 44, 5, 44),
        new Selection(6, 32, 6, 32),
        new Selection(12, 44, 12, 44),
        new Selection(12, 72, 12, 72)
      ]);
      cursorWordLeft(editor, false);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(5, 43, 5, 43),
        new Selection(6, 31, 6, 31),
        new Selection(12, 43, 12, 43),
        new Selection(12, 71, 12, 71)
      ]);
    });
  });
  test("cursorWordLeftSelect - issue #74369: cursorWordLeft and cursorWordLeftSelect do not behave consistently", () => {
    const EXPECTED = [
      "|this.|is.|a.|test"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 15),
      (ed) => cursorWordLeft(ed, true),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordStartLeft", () => {
    const EXPECTED = ["|   |/* |Just |some   |more   |text |a|+= |3 |+|5|-|3 |+ |7 |*/  "].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordStartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordStartLeft - issue #51119: regression makes VS compatibility impossible", () => {
    const EXPECTED = ["|this|.|is|.|a|.|test"].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordStartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("issue #51275 - cursorWordStartLeft does not push undo/redo stack element", () => {
    function type(viewModel, text) {
      for (let i = 0; i < text.length; i++) {
        viewModel.type(text.charAt(i), "keyboard");
      }
    }
    withTestCodeEditor("", {}, (editor, viewModel) => {
      type(viewModel, "foo bar baz");
      assert.strictEqual(editor.getValue(), "foo bar baz");
      cursorWordStartLeft(editor);
      cursorWordStartLeft(editor);
      type(viewModel, "q");
      assert.strictEqual(editor.getValue(), "foo qbar baz");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(editor.getValue(), "foo bar baz");
    });
  });
  test("cursorWordEndLeft", () => {
    const EXPECTED = ["|   /*| Just| some|   more|   text| a|+=| 3| +|5|-|3| +| 7| */|  "].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordEndLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordRight - simple", () => {
    const EXPECTED = [
      "    	My| First| Line|	 |",
      "	My| Second| Line|",
      "    Third| Line\u{1F436}|",
      "|",
      "1|"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(5, 2))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordRight - selection", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      editor.setPosition(new Position(1, 1));
      cursorWordRight(editor, true);
      assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 1, 8));
    });
  });
  test("cursorWordRight - issue #832", () => {
    const EXPECTED = [
      "   /*| Just| some|   more|   text| a|+=| 3| +5|-3| +| 7| */|  |"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 50))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordRight - issue #41199", () => {
    const EXPECTED = [
      "console|.log|(err|)|"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 17))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordRight - Recognize words", function() {
    if (isFirefox) {
      return this.skip();
    }
    const EXPECTED = [
      "/*| \u3053\u308C|\u306F|\u30C6\u30B9\u30C8|\u3067\u3059|/*|"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 14)),
      {
        wordSegmenterLocales: "ja"
      }
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordRight - Does not recognize words", () => {
    const EXPECTED = [
      "/*| \u3053\u308C\u306F\u30C6\u30B9\u30C8\u3067\u3059|/*|"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 14)),
      {
        wordSegmenterLocales: ""
      }
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("moveWordEndRight", () => {
    const EXPECTED = [
      "   /*| Just| some|   more|   text| a|+=| 3| +5|-3| +| 7| */|  |"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => moveWordEndRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 50))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("moveWordStartRight", () => {
    const EXPECTED = [
      "   |/* |Just |some   |more   |text |a|+= |3 |+|5|-|3 |+ |7 |*/  |"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => moveWordStartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 50))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("issue #51119: cursorWordStartRight regression makes VS compatibility impossible", () => {
    const EXPECTED = ["this|.|is|.|a|.|test|"].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => moveWordStartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 15))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("issue #64810: cursorWordStartRight skips first word after newline", () => {
    const EXPECTED = ["Hello |World|", "|Hei |mailman|"].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => moveWordStartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(2, 12))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordAccessibilityLeft", () => {
    const EXPECTED = ["|   /* |Just |some   |more   |text |a+= |3 +|5-|3 + |7 */  "].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordAccessibilityLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordAccessibilityRight", () => {
    const EXPECTED = ["   /* |Just |some   |more   |text |a+= |3 +|5-|3 + |7 */  |"].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordAccessibilityRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 50))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordLeft for non-empty selection", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setSelection(new Selection(3, 7, 3, 9));
      deleteWordLeft(editor);
      assert.strictEqual(model.getLineContent(3), "    Thd Line\u{1F436}");
      assert.deepStrictEqual(editor.getPosition(), new Position(3, 7));
    });
  });
  test("deleteWordLeft for cursor at beginning of document", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 1));
      deleteWordLeft(editor);
      assert.strictEqual(model.getLineContent(1), "    	My First Line	 ");
      assert.deepStrictEqual(editor.getPosition(), new Position(1, 1));
    });
  });
  test("deleteWordLeft for cursor at end of whitespace", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(3, 11));
      deleteWordLeft(editor);
      assert.strictEqual(model.getLineContent(3), "    Line\u{1F436}");
      assert.deepStrictEqual(editor.getPosition(), new Position(3, 5));
    });
  });
  test("deleteWordLeft for cursor just behind a word", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(2, 11));
      deleteWordLeft(editor);
      assert.strictEqual(model.getLineContent(2), "	My  Line");
      assert.deepStrictEqual(editor.getPosition(), new Position(2, 5));
    });
  });
  test("deleteWordLeft for cursor inside of a word", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 12));
      deleteWordLeft(editor);
      assert.strictEqual(model.getLineContent(1), "    	My st Line	 ");
      assert.deepStrictEqual(editor.getPosition(), new Position(1, 9));
    });
  });
  test("deleteWordRight for non-empty selection", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setSelection(new Selection(3, 7, 3, 9));
      deleteWordRight(editor);
      assert.strictEqual(model.getLineContent(3), "    Thd Line\u{1F436}");
      assert.deepStrictEqual(editor.getPosition(), new Position(3, 7));
    });
  });
  test("deleteWordRight for cursor at end of document", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(5, 3));
      deleteWordRight(editor);
      assert.strictEqual(model.getLineContent(5), "1");
      assert.deepStrictEqual(editor.getPosition(), new Position(5, 2));
    });
  });
  test("deleteWordRight for cursor at beggining of whitespace", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(3, 1));
      deleteWordRight(editor);
      assert.strictEqual(model.getLineContent(3), "Third Line\u{1F436}");
      assert.deepStrictEqual(editor.getPosition(), new Position(3, 1));
    });
  });
  test("deleteWordRight for cursor just before a word", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(2, 5));
      deleteWordRight(editor);
      assert.strictEqual(model.getLineContent(2), "	My  Line");
      assert.deepStrictEqual(editor.getPosition(), new Position(2, 5));
    });
  });
  test("deleteWordRight for cursor inside of a word", () => {
    withTestCodeEditor([
      "    	My First Line	 ",
      "	My Second Line",
      "    Third Line\u{1F436}",
      "",
      "1"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 11));
      deleteWordRight(editor);
      assert.strictEqual(model.getLineContent(1), "    	My Fi Line	 ");
      assert.deepStrictEqual(editor.getPosition(), new Position(1, 11));
    });
  });
  test("deleteWordLeft - issue #832", () => {
    const EXPECTED = [
      "|   |/* |Just |some |text |a|+= |3 |+|5 |*/|  "
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e4),
      (ed) => deleteWordLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getValue().length === 0
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordStartLeft", () => {
    const EXPECTED = [
      "|   |/* |Just |some |text |a|+= |3 |+|5 |*/  "
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e4),
      (ed) => deleteWordStartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getValue().length === 0
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordEndLeft", () => {
    const EXPECTED = [
      "|   /*| Just| some| text| a|+=| 3| +|5| */|  "
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e4),
      (ed) => deleteWordEndLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getValue().length === 0
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordLeft - issue #24947", () => {
    withTestCodeEditor([
      "{",
      "}"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(2, 1));
      deleteWordLeft(editor);
      assert.strictEqual(model.getLineContent(1), "{}");
    });
    withTestCodeEditor([
      "{",
      "}"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(2, 1));
      deleteWordStartLeft(editor);
      assert.strictEqual(model.getLineContent(1), "{}");
    });
    withTestCodeEditor([
      "{",
      "}"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(2, 1));
      deleteWordEndLeft(editor);
      assert.strictEqual(model.getLineContent(1), "{}");
    });
  });
  test("deleteWordRight - issue #832", () => {
    const EXPECTED = "   |/*| |Just| |some| |text| |a|+=| |3| |+|5|-|3| |*/|  |";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => deleteWordRight(ed),
      (ed) => new Position(1, text.length - ed.getValue().length + 1),
      (ed) => ed.getValue().length === 0
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordRight - issue #3882", () => {
    withTestCodeEditor([
      "public void Add( int x,",
      "                 int y )"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 24));
      deleteWordRight(editor);
      assert.strictEqual(model.getLineContent(1), "public void Add( int x,int y )", "001");
    });
  });
  test("deleteWordStartRight - issue #3882", () => {
    withTestCodeEditor([
      "public void Add( int x,",
      "                 int y )"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 24));
      deleteWordStartRight(editor);
      assert.strictEqual(model.getLineContent(1), "public void Add( int x,int y )", "001");
    });
  });
  test("deleteWordEndRight - issue #3882", () => {
    withTestCodeEditor([
      "public void Add( int x,",
      "                 int y )"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 24));
      deleteWordEndRight(editor);
      assert.strictEqual(model.getLineContent(1), "public void Add( int x,int y )", "001");
    });
  });
  test("deleteWordStartRight", () => {
    const EXPECTED = "   |/* |Just |some |text |a|+= |3 |+|5|-|3 |*/  |";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => deleteWordStartRight(ed),
      (ed) => new Position(1, text.length - ed.getValue().length + 1),
      (ed) => ed.getValue().length === 0
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordEndRight", () => {
    const EXPECTED = "   /*| Just| some| text| a|+=| 3| +|5|-|3| */|  |";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => deleteWordEndRight(ed),
      (ed) => new Position(1, text.length - ed.getValue().length + 1),
      (ed) => ed.getValue().length === 0
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordRight - issue #3882 (1): Ctrl+Delete removing entire line when used at the end of line", () => {
    withTestCodeEditor([
      "A line with text.",
      "   And another one"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 18));
      deleteWordRight(editor);
      assert.strictEqual(model.getLineContent(1), "A line with text.And another one", "001");
    });
  });
  test("deleteWordLeft - issue #3882 (2): Ctrl+Delete removing entire line when used at the end of line", () => {
    withTestCodeEditor([
      "A line with text.",
      "   And another one"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(2, 1));
      deleteWordLeft(editor);
      assert.strictEqual(model.getLineContent(1), "A line with text.   And another one", "001");
    });
  });
  test("deleteWordLeft - issue #91855: Matching (quote, bracket, paren) doesn't get deleted when hitting Ctrl+Backspace", () => {
    const languageId = "myTestMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      autoClosingPairs: [
        { open: '"', close: '"' }
      ]
    }));
    const model = disposables.add(instantiateTextModel(instantiationService, 'a ""', languageId));
    const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model, { autoClosingDelete: "always" }));
    editor.setPosition(new Position(1, 4));
    deleteWordLeft(editor);
    assert.strictEqual(model.getLineContent(1), "a ");
  });
  test("deleteInsideWord - empty line", () => {
    withTestCodeEditor([
      "Line1",
      "",
      "Line2"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(2, 1));
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "Line1\nLine2");
    });
  });
  test("deleteInsideWord - in whitespace 1", () => {
    withTestCodeEditor([
      "Just  some text."
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 6));
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "Justsome text.");
    });
  });
  test("deleteInsideWord - in whitespace 2", () => {
    withTestCodeEditor([
      "Just     some text."
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 6));
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "Justsome text.");
    });
  });
  test("deleteInsideWord - in whitespace 3", () => {
    withTestCodeEditor([
      'Just     "some text.'
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 6));
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), 'Just"some text.');
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), '"some text.');
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "some text.");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "text.");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), ".");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "");
    });
  });
  test("deleteInsideWord - in non-words", () => {
    withTestCodeEditor([
      "x=3+4+5+6"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 7));
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "x=3+45+6");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "x=3++6");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "x=36");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "x=");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "x");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "");
    });
  });
  test("deleteInsideWord - in words 1", () => {
    withTestCodeEditor([
      "This is interesting"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 7));
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "This interesting");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "This");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "");
    });
  });
  test("deleteInsideWord - in words 2", () => {
    withTestCodeEditor([
      "This  is  interesting"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 7));
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "This  interesting");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "This");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "");
      deleteInsideWord(editor);
      assert.strictEqual(model.getValue(), "");
    });
  });
  test("deleteInsideWord - onlyWord: does not delete whitespace before last word", () => {
    withTestCodeEditor([
      "hello world"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 9));
      deleteInsideWord(editor, { onlyWord: true });
      assert.strictEqual(model.getValue(), "hello ");
    });
  });
  test("deleteInsideWord - onlyWord: deletes just the word (leaves double spaces)", () => {
    withTestCodeEditor([
      "This is interesting"
    ], {}, (editor, _) => {
      const model = editor.getModel();
      editor.setPosition(new Position(1, 7));
      deleteInsideWord(editor, { onlyWord: true });
      assert.strictEqual(model.getValue(), "This  interesting");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHdvcmRPcGVyYXRpb25zXFx0ZXN0XFxicm93c2VyXFx3b3JkT3BlcmF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRmlyZWZveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29yZUVkaXRpbmdDb21tYW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld01vZGVsSW1wbC5qcyc7XG5pbXBvcnQgeyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnQsIEN1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdFNlbGVjdCwgQ3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodCwgQ3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodFNlbGVjdCwgQ3Vyc29yV29yZEVuZExlZnQsIEN1cnNvcldvcmRFbmRMZWZ0U2VsZWN0LCBDdXJzb3JXb3JkRW5kUmlnaHQsIEN1cnNvcldvcmRFbmRSaWdodFNlbGVjdCwgQ3Vyc29yV29yZExlZnQsIEN1cnNvcldvcmRMZWZ0U2VsZWN0LCBDdXJzb3JXb3JkUmlnaHQsIEN1cnNvcldvcmRSaWdodFNlbGVjdCwgQ3Vyc29yV29yZFN0YXJ0TGVmdCwgQ3Vyc29yV29yZFN0YXJ0TGVmdFNlbGVjdCwgQ3Vyc29yV29yZFN0YXJ0UmlnaHQsIEN1cnNvcldvcmRTdGFydFJpZ2h0U2VsZWN0LCBEZWxldGVJbnNpZGVXb3JkLCBEZWxldGVXb3JkRW5kTGVmdCwgRGVsZXRlV29yZEVuZFJpZ2h0LCBEZWxldGVXb3JkTGVmdCwgRGVsZXRlV29yZFJpZ2h0LCBEZWxldGVXb3JkU3RhcnRMZWZ0LCBEZWxldGVXb3JkU3RhcnRSaWdodCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd29yZE9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zLCBzZXJpYWxpemVQaXBlUG9zaXRpb25zLCB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zIH0gZnJvbSAnLi93b3JkVGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcywgaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvciwgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IGluc3RhbnRpYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5cbnN1aXRlKCdXb3JkT3BlcmF0aW9ucycsICgpID0+IHtcblxuXHRjb25zdCBfY3Vyc29yV29yZFN0YXJ0TGVmdCA9IG5ldyBDdXJzb3JXb3JkU3RhcnRMZWZ0KCk7XG5cdGNvbnN0IF9jdXJzb3JXb3JkRW5kTGVmdCA9IG5ldyBDdXJzb3JXb3JkRW5kTGVmdCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZExlZnQgPSBuZXcgQ3Vyc29yV29yZExlZnQoKTtcblx0Y29uc3QgX2N1cnNvcldvcmRTdGFydExlZnRTZWxlY3QgPSBuZXcgQ3Vyc29yV29yZFN0YXJ0TGVmdFNlbGVjdCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZEVuZExlZnRTZWxlY3QgPSBuZXcgQ3Vyc29yV29yZEVuZExlZnRTZWxlY3QoKTtcblx0Y29uc3QgX2N1cnNvcldvcmRMZWZ0U2VsZWN0ID0gbmV3IEN1cnNvcldvcmRMZWZ0U2VsZWN0KCk7XG5cdGNvbnN0IF9jdXJzb3JXb3JkU3RhcnRSaWdodCA9IG5ldyBDdXJzb3JXb3JkU3RhcnRSaWdodCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZEVuZFJpZ2h0ID0gbmV3IEN1cnNvcldvcmRFbmRSaWdodCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZFJpZ2h0ID0gbmV3IEN1cnNvcldvcmRSaWdodCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZFN0YXJ0UmlnaHRTZWxlY3QgPSBuZXcgQ3Vyc29yV29yZFN0YXJ0UmlnaHRTZWxlY3QoKTtcblx0Y29uc3QgX2N1cnNvcldvcmRFbmRSaWdodFNlbGVjdCA9IG5ldyBDdXJzb3JXb3JkRW5kUmlnaHRTZWxlY3QoKTtcblx0Y29uc3QgX2N1cnNvcldvcmRSaWdodFNlbGVjdCA9IG5ldyBDdXJzb3JXb3JkUmlnaHRTZWxlY3QoKTtcblx0Y29uc3QgX2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdCA9IG5ldyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnQoKTtcblx0Y29uc3QgX2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdFNlbGVjdCA9IG5ldyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnRTZWxlY3QoKTtcblx0Y29uc3QgX2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5UmlnaHQgPSBuZXcgQ3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodFNlbGVjdCA9IG5ldyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eVJpZ2h0U2VsZWN0KCk7XG5cdGNvbnN0IF9kZWxldGVXb3JkTGVmdCA9IG5ldyBEZWxldGVXb3JkTGVmdCgpO1xuXHRjb25zdCBfZGVsZXRlV29yZFN0YXJ0TGVmdCA9IG5ldyBEZWxldGVXb3JkU3RhcnRMZWZ0KCk7XG5cdGNvbnN0IF9kZWxldGVXb3JkRW5kTGVmdCA9IG5ldyBEZWxldGVXb3JkRW5kTGVmdCgpO1xuXHRjb25zdCBfZGVsZXRlV29yZFJpZ2h0ID0gbmV3IERlbGV0ZVdvcmRSaWdodCgpO1xuXHRjb25zdCBfZGVsZXRlV29yZFN0YXJ0UmlnaHQgPSBuZXcgRGVsZXRlV29yZFN0YXJ0UmlnaHQoKTtcblx0Y29uc3QgX2RlbGV0ZVdvcmRFbmRSaWdodCA9IG5ldyBEZWxldGVXb3JkRW5kUmlnaHQoKTtcblx0Y29uc3QgX2RlbGV0ZUluc2lkZVdvcmQgPSBuZXcgRGVsZXRlSW5zaWRlV29yZCgpO1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0bGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBydW5FZGl0b3JDb21tYW5kKGVkaXRvcjogSUNvZGVFZGl0b3IsIGNvbW1hbmQ6IEVkaXRvckNvbW1hbmQpOiB2b2lkIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbW1hbmQucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgZWRpdG9yLCBudWxsKTtcblx0XHR9KTtcblx0fVxuXHRmdW5jdGlvbiBjdXJzb3JXb3JkTGVmdChlZGl0b3I6IElDb2RlRWRpdG9yLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHJ1bkVkaXRvckNvbW1hbmQoZWRpdG9yLCBpblNlbGVjdGlvbk1vZGUgPyBfY3Vyc29yV29yZExlZnRTZWxlY3QgOiBfY3Vyc29yV29yZExlZnQpO1xuXHR9XG5cdGZ1bmN0aW9uIGN1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdChlZGl0b3I6IElDb2RlRWRpdG9yLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHJ1bkVkaXRvckNvbW1hbmQoZWRpdG9yLCBpblNlbGVjdGlvbk1vZGUgPyBfY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlMZWZ0IDogX2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdFNlbGVjdCk7XG5cdH1cblx0ZnVuY3Rpb24gY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodChlZGl0b3I6IElDb2RlRWRpdG9yLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHJ1bkVkaXRvckNvbW1hbmQoZWRpdG9yLCBpblNlbGVjdGlvbk1vZGUgPyBfY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodFNlbGVjdCA6IF9jdXJzb3JXb3JkQWNjZXNzaWJpbGl0eVJpZ2h0KTtcblx0fVxuXHRmdW5jdGlvbiBjdXJzb3JXb3JkU3RhcnRMZWZ0KGVkaXRvcjogSUNvZGVFZGl0b3IsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0cnVuRWRpdG9yQ29tbWFuZChlZGl0b3IsIGluU2VsZWN0aW9uTW9kZSA/IF9jdXJzb3JXb3JkU3RhcnRMZWZ0U2VsZWN0IDogX2N1cnNvcldvcmRTdGFydExlZnQpO1xuXHR9XG5cdGZ1bmN0aW9uIGN1cnNvcldvcmRFbmRMZWZ0KGVkaXRvcjogSUNvZGVFZGl0b3IsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0cnVuRWRpdG9yQ29tbWFuZChlZGl0b3IsIGluU2VsZWN0aW9uTW9kZSA/IF9jdXJzb3JXb3JkRW5kTGVmdFNlbGVjdCA6IF9jdXJzb3JXb3JkRW5kTGVmdCk7XG5cdH1cblx0ZnVuY3Rpb24gY3Vyc29yV29yZFJpZ2h0KGVkaXRvcjogSUNvZGVFZGl0b3IsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0cnVuRWRpdG9yQ29tbWFuZChlZGl0b3IsIGluU2VsZWN0aW9uTW9kZSA/IF9jdXJzb3JXb3JkUmlnaHRTZWxlY3QgOiBfY3Vyc29yV29yZFJpZ2h0KTtcblx0fVxuXHRmdW5jdGlvbiBtb3ZlV29yZEVuZFJpZ2h0KGVkaXRvcjogSUNvZGVFZGl0b3IsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0cnVuRWRpdG9yQ29tbWFuZChlZGl0b3IsIGluU2VsZWN0aW9uTW9kZSA/IF9jdXJzb3JXb3JkRW5kUmlnaHRTZWxlY3QgOiBfY3Vyc29yV29yZEVuZFJpZ2h0KTtcblx0fVxuXHRmdW5jdGlvbiBtb3ZlV29yZFN0YXJ0UmlnaHQoZWRpdG9yOiBJQ29kZUVkaXRvciwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRydW5FZGl0b3JDb21tYW5kKGVkaXRvciwgaW5TZWxlY3Rpb25Nb2RlID8gX2N1cnNvcldvcmRTdGFydFJpZ2h0U2VsZWN0IDogX2N1cnNvcldvcmRTdGFydFJpZ2h0KTtcblx0fVxuXHRmdW5jdGlvbiBkZWxldGVXb3JkTGVmdChlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0cnVuRWRpdG9yQ29tbWFuZChlZGl0b3IsIF9kZWxldGVXb3JkTGVmdCk7XG5cdH1cblx0ZnVuY3Rpb24gZGVsZXRlV29yZFN0YXJ0TGVmdChlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0cnVuRWRpdG9yQ29tbWFuZChlZGl0b3IsIF9kZWxldGVXb3JkU3RhcnRMZWZ0KTtcblx0fVxuXHRmdW5jdGlvbiBkZWxldGVXb3JkRW5kTGVmdChlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0cnVuRWRpdG9yQ29tbWFuZChlZGl0b3IsIF9kZWxldGVXb3JkRW5kTGVmdCk7XG5cdH1cblx0ZnVuY3Rpb24gZGVsZXRlV29yZFJpZ2h0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRydW5FZGl0b3JDb21tYW5kKGVkaXRvciwgX2RlbGV0ZVdvcmRSaWdodCk7XG5cdH1cblx0ZnVuY3Rpb24gZGVsZXRlV29yZFN0YXJ0UmlnaHQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdHJ1bkVkaXRvckNvbW1hbmQoZWRpdG9yLCBfZGVsZXRlV29yZFN0YXJ0UmlnaHQpO1xuXHR9XG5cdGZ1bmN0aW9uIGRlbGV0ZVdvcmRFbmRSaWdodChlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0cnVuRWRpdG9yQ29tbWFuZChlZGl0b3IsIF9kZWxldGVXb3JkRW5kUmlnaHQpO1xuXHR9XG5cdGZ1bmN0aW9uIGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJncz86IHVua25vd24pOiB2b2lkIHtcblx0XHRfZGVsZXRlSW5zaWRlV29yZC5ydW4obnVsbCEsIGVkaXRvciwgYXJncyk7XG5cdH1cblxuXHR0ZXN0KCdjdXJzb3JXb3JkTGVmdCAtIHNpbXBsZScsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCd8ICAgIFxcdHxNeSB8Rmlyc3QgfExpbmVcXHQgJyxcblx0XHRcdCd8XFx0fE15IHxTZWNvbmQgfExpbmUnLFxuXHRcdFx0J3wgICAgfFRoaXJkIHxMaW5lXHVEODNEXHVEQzM2Jyxcblx0XHRcdCd8Jyxcblx0XHRcdCd8MScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEwMDAsIDEwMDApLFxuXHRcdFx0ZWQgPT4gY3Vyc29yV29yZExlZnQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZExlZnQgLSB3aXRoIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0JyAgICBcXHRNeSBGaXJzdCBMaW5lXFx0ICcsXG5cdFx0XHQnXFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0JyAgICBUaGlyZCBMaW5lXHVEODNEXHVEQzM2Jyxcblx0XHRcdCcnLFxuXHRcdFx0JzEnLFxuXHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDUsIDIpKTtcblx0XHRcdGN1cnNvcldvcmRMZWZ0KGVkaXRvciwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbig1LCAyLCA1LCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvcldvcmRMZWZ0IC0gaXNzdWUgIzgzMicsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFsnfCAgIHwvKiB8SnVzdCB8c29tZSAgIHxtb3JlICAgfHRleHQgfGF8Kz0gfDMgfCt8NS18MyB8KyB8NyB8Ki8gICddLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMTAwMCwgMTAwMCksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkTGVmdChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgMSkpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3JXb3JkTGVmdCAtIGlzc3VlICM0ODA0NjogV29yZCBzZWxlY3Rpb24gZG9lc25cXCd0IHdvcmsgYXMgdXN1YWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgRVhQRUNURUQgPSBbXG5cdFx0XHQnfGRlZXAufG9iamVjdC58cHJvcGVydHknLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAyMSksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkTGVmdChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgMSkpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3JXb3JkTGVmdCAtIFJlY29nbml6ZSB3b3JkcycsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNGaXJlZm94KSB7XG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjE5ODQzXG5cdFx0XHRyZXR1cm4gdGhpcy5za2lwKCk7XG5cdFx0fVxuXHRcdGNvbnN0IEVYUEVDVEVEID0gW1xuXHRcdFx0J3wvKiB8XHUzMDUzXHUzMDhDfFx1MzA2RnxcdTMwQzZcdTMwQjlcdTMwQzh8XHUzMDY3XHUzMDU5IHwvKicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEwMDAsIDEwMDApLFxuXHRcdFx0ZWQgPT4gY3Vyc29yV29yZExlZnQoZWQsIHRydWUpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKSxcblx0XHRcdHtcblx0XHRcdFx0d29yZFNlZ21lbnRlckxvY2FsZXM6ICdqYSdcblx0XHRcdH1cblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvcldvcmRMZWZ0IC0gRG9lcyBub3QgcmVjb2duaXplIHdvcmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gW1xuXHRcdFx0J3wvKiB8XHUzMDUzXHUzMDhDXHUzMDZGXHUzMEM2XHUzMEI5XHUzMEM4XHUzMDY3XHUzMDU5IHwvKicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEwMDAsIDEwMDApLFxuXHRcdFx0ZWQgPT4gY3Vyc29yV29yZExlZnQoZWQsIHRydWUpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKSxcblx0XHRcdHtcblx0XHRcdFx0d29yZFNlZ21lbnRlckxvY2FsZXM6ICcnXG5cdFx0XHR9XG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3JXb3JkTGVmdCAtIGlzc3VlICMxNjk5MDQ6IGN1cnNvcnMgb3V0IG9mIHN5bmMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCcuZ3JpZDEgeycsXG5cdFx0XHQnICBkaXNwbGF5OiBncmlkOycsXG5cdFx0XHQnICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6Jyxcblx0XHRcdCcgICAgW2Z1bGwtc3RhcnRdIG1pbm1heCgxZW0sIDFmciknLFxuXHRcdFx0JyAgICBbbWFpbi1zdGFydF0gbWlubWF4KDAsIDQwZW0pIFttYWluLWVuZF0nLFxuXHRcdFx0JyAgICBtaW5tYXgoMWVtLCAxZnIpIFtmdWxsLWVuZF07Jyxcblx0XHRcdCd9Jyxcblx0XHRcdCcuZ3JpZDIgeycsXG5cdFx0XHQnICBkaXNwbGF5OiBncmlkOycsXG5cdFx0XHQnICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6Jyxcblx0XHRcdCcgICAgW2Z1bGwtc3RhcnRdIG1pbm1heCgxZW0sIDFmciknLFxuXHRcdFx0JyAgICBbbWFpbi1zdGFydF0gbWlubWF4KDAsIDQwZW0pIFttYWluLWVuZF0gbWlubWF4KDFlbSwgMWZyKSBbZnVsbC1lbmRdOycsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IodGV4dCwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA0NCwgNSwgNDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDMyLCA2LCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTIsIDQ0LCAxMiwgNDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEyLCA3MiwgMTIsIDcyKSxcblx0XHRcdF0pO1xuXHRcdFx0Y3Vyc29yV29yZExlZnQoZWRpdG9yLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA0MywgNSwgNDMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDMxLCA2LCAzMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTIsIDQzLCAxMiwgNDMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEyLCA3MSwgMTIsIDcxKSxcblx0XHRcdF0pO1xuXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvcldvcmRMZWZ0U2VsZWN0IC0gaXNzdWUgIzc0MzY5OiBjdXJzb3JXb3JkTGVmdCBhbmQgY3Vyc29yV29yZExlZnRTZWxlY3QgZG8gbm90IGJlaGF2ZSBjb25zaXN0ZW50bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgRVhQRUNURUQgPSBbXG5cdFx0XHQnfHRoaXMufGlzLnxhLnx0ZXN0Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMTUpLFxuXHRcdFx0ZWQgPT4gY3Vyc29yV29yZExlZnQoZWQsIHRydWUpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZFN0YXJ0TGVmdCcsICgpID0+IHtcblx0XHQvLyBUaGlzIGlzIHRoZSBiZWhhdmlvdXIgb2JzZXJ2ZWQgaW4gVmlzdWFsIFN0dWRpbywgcGxlYXNlIGRvIG5vdCB0b3VjaCB0ZXN0XG5cdFx0Y29uc3QgRVhQRUNURUQgPSBbJ3wgICB8LyogfEp1c3QgfHNvbWUgICB8bW9yZSAgIHx0ZXh0IHxhfCs9IHwzIHwrfDV8LXwzIHwrIHw3IHwqLyAgJ10uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxMDAwLCAxMDAwKSxcblx0XHRcdGVkID0+IGN1cnNvcldvcmRTdGFydExlZnQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZFN0YXJ0TGVmdCAtIGlzc3VlICM1MTExOTogcmVncmVzc2lvbiBtYWtlcyBWUyBjb21wYXRpYmlsaXR5IGltcG9zc2libGUnLCAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBpcyB0aGUgYmVoYXZpb3VyIG9ic2VydmVkIGluIFZpc3VhbCBTdHVkaW8sIHBsZWFzZSBkbyBub3QgdG91Y2ggdGVzdFxuXHRcdGNvbnN0IEVYUEVDVEVEID0gWyd8dGhpc3wufGlzfC58YXwufHRlc3QnXS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEwMDAsIDEwMDApLFxuXHRcdFx0ZWQgPT4gY3Vyc29yV29yZFN0YXJ0TGVmdChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgMSkpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTEyNzUgLSBjdXJzb3JXb3JkU3RhcnRMZWZ0IGRvZXMgbm90IHB1c2ggdW5kby9yZWRvIHN0YWNrIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdHlwZSh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgdGV4dDogc3RyaW5nKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0dmlld01vZGVsLnR5cGUodGV4dC5jaGFyQXQoaSksICdrZXlib2FyZCcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcignJywge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dHlwZSh2aWV3TW9kZWwsICdmb28gYmFyIGJheicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnZm9vIGJhciBiYXonKTtcblxuXHRcdFx0Y3Vyc29yV29yZFN0YXJ0TGVmdChlZGl0b3IpO1xuXHRcdFx0Y3Vyc29yV29yZFN0YXJ0TGVmdChlZGl0b3IpO1xuXHRcdFx0dHlwZSh2aWV3TW9kZWwsICdxJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJ2ZvbyBxYmFyIGJheicpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnZm9vIGJhciBiYXonKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZEVuZExlZnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgRVhQRUNURUQgPSBbJ3wgICAvKnwgSnVzdHwgc29tZXwgICBtb3JlfCAgIHRleHR8IGF8Kz18IDN8ICt8NXwtfDN8ICt8IDd8ICovfCAgJ10uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxMDAwLCAxMDAwKSxcblx0XHRcdGVkID0+IGN1cnNvcldvcmRFbmRMZWZ0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEuZXF1YWxzKG5ldyBQb3NpdGlvbigxLCAxKSlcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvcldvcmRSaWdodCAtIHNpbXBsZScsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCcgICAgXFx0TXl8IEZpcnN0fCBMaW5lfFxcdCB8Jyxcblx0XHRcdCdcXHRNeXwgU2Vjb25kfCBMaW5lfCcsXG5cdFx0XHQnICAgIFRoaXJkfCBMaW5lXHVEODNEXHVEQzM2fCcsXG5cdFx0XHQnfCcsXG5cdFx0XHQnMXwnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IGN1cnNvcldvcmRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oNSwgMikpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3JXb3JkUmlnaHQgLSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0XHQnJyxcblx0XHRcdCcxJyxcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0XHRjdXJzb3JXb3JkUmlnaHQoZWRpdG9yLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDgpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZFJpZ2h0IC0gaXNzdWUgIzgzMicsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCcgICAvKnwgSnVzdHwgc29tZXwgICBtb3JlfCAgIHRleHR8IGF8Kz18IDN8ICs1fC0zfCArfCA3fCAqL3wgIHwnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IGN1cnNvcldvcmRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgNTApKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZFJpZ2h0IC0gaXNzdWUgIzQxMTk5JywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gW1xuXHRcdFx0J2NvbnNvbGV8LmxvZ3woZXJyfCl8Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUmlnaHQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDE3KSlcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvcldvcmRSaWdodCAtIFJlY29nbml6ZSB3b3JkcycsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNGaXJlZm94KSB7XG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjE5ODQzXG5cdFx0XHRyZXR1cm4gdGhpcy5za2lwKCk7XG5cdFx0fVxuXHRcdGNvbnN0IEVYUEVDVEVEID0gW1xuXHRcdFx0Jy8qfCBcdTMwNTNcdTMwOEN8XHUzMDZGfFx1MzBDNlx1MzBCOVx1MzBDOHxcdTMwNjdcdTMwNTl8Lyp8Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUmlnaHQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDE0KSksXG5cdFx0XHR7XG5cdFx0XHRcdHdvcmRTZWdtZW50ZXJMb2NhbGVzOiAnamEnXG5cdFx0XHR9XG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3JXb3JkUmlnaHQgLSBEb2VzIG5vdCByZWNvZ25pemUgd29yZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgRVhQRUNURUQgPSBbXG5cdFx0XHQnLyp8IFx1MzA1M1x1MzA4Q1x1MzA2Rlx1MzBDNlx1MzBCOVx1MzBDOFx1MzA2N1x1MzA1OXwvKnwnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IGN1cnNvcldvcmRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgMTQpKSxcblx0XHRcdHtcblx0XHRcdFx0d29yZFNlZ21lbnRlckxvY2FsZXM6ICcnXG5cdFx0XHR9XG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlV29yZEVuZFJpZ2h0JywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gW1xuXHRcdFx0JyAgIC8qfCBKdXN0fCBzb21lfCAgIG1vcmV8ICAgdGV4dHwgYXwrPXwgM3wgKzV8LTN8ICt8IDd8ICovfCAgfCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0ZWQgPT4gbW92ZVdvcmRFbmRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgNTApKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZVdvcmRTdGFydFJpZ2h0JywgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIGJlaGF2aW91ciBvYnNlcnZlZCBpbiBWaXN1YWwgU3R1ZGlvLCBwbGVhc2UgZG8gbm90IHRvdWNoIHRlc3Rcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCcgICB8LyogfEp1c3QgfHNvbWUgICB8bW9yZSAgIHx0ZXh0IHxhfCs9IHwzIHwrfDV8LXwzIHwrIHw3IHwqLyAgfCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0ZWQgPT4gbW92ZVdvcmRTdGFydFJpZ2h0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEuZXF1YWxzKG5ldyBQb3NpdGlvbigxLCA1MCkpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTExMTk6IGN1cnNvcldvcmRTdGFydFJpZ2h0IHJlZ3Jlc3Npb24gbWFrZXMgVlMgY29tcGF0aWJpbGl0eSBpbXBvc3NpYmxlJywgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIGJlaGF2aW91ciBvYnNlcnZlZCBpbiBWaXN1YWwgU3R1ZGlvLCBwbGVhc2UgZG8gbm90IHRvdWNoIHRlc3Rcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFsndGhpc3wufGlzfC58YXwufHRlc3R8J10uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IG1vdmVXb3JkU3RhcnRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgMTUpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzY0ODEwOiBjdXJzb3JXb3JkU3RhcnRSaWdodCBza2lwcyBmaXJzdCB3b3JkIGFmdGVyIG5ld2xpbmUnLCAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBpcyB0aGUgYmVoYXZpb3VyIG9ic2VydmVkIGluIFZpc3VhbCBTdHVkaW8sIHBsZWFzZSBkbyBub3QgdG91Y2ggdGVzdFxuXHRcdGNvbnN0IEVYUEVDVEVEID0gWydIZWxsbyB8V29ybGR8JywgJ3xIZWkgfG1haWxtYW58J10uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IG1vdmVXb3JkU3RhcnRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMiwgMTIpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlMZWZ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gWyd8ICAgLyogfEp1c3QgfHNvbWUgICB8bW9yZSAgIHx0ZXh0IHxhKz0gfDMgK3w1LXwzICsgfDcgKi8gICddLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMTAwMCwgMTAwMCksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFsnICAgLyogfEp1c3QgfHNvbWUgICB8bW9yZSAgIHx0ZXh0IHxhKz0gfDMgK3w1LXwzICsgfDcgKi8gIHwnXS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0ZWQgPT4gY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgNTApKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlV29yZExlZnQgZm9yIG5vbi1lbXB0eSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0XHQnJyxcblx0XHRcdCcxJyxcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMywgNywgMywgOSkpO1xuXHRcdFx0ZGVsZXRlV29yZExlZnQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyAgICBUaGQgTGluZVx1RDgzRFx1REMzNicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0UG9zaXRpb24oKSwgbmV3IFBvc2l0aW9uKDMsIDcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlV29yZExlZnQgZm9yIGN1cnNvciBhdCBiZWdpbm5pbmcgb2YgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0XHQnJyxcblx0XHRcdCcxJyxcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdGRlbGV0ZVdvcmRMZWZ0KGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFBvc2l0aW9uKCksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRMZWZ0IGZvciBjdXJzb3IgYXQgZW5kIG9mIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0XHQnJyxcblx0XHRcdCcxJyxcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDMsIDExKSk7XG5cdFx0XHRkZWxldGVXb3JkTGVmdChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnICAgIExpbmVcdUQ4M0RcdURDMzYnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFBvc2l0aW9uKCksIG5ldyBQb3NpdGlvbigzLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRMZWZ0IGZvciBjdXJzb3IganVzdCBiZWhpbmQgYSB3b3JkJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnICAgIFxcdE15IEZpcnN0IExpbmVcXHQgJyxcblx0XHRcdCdcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHQnICAgIFRoaXJkIExpbmVcdUQ4M0RcdURDMzYnLFxuXHRcdFx0JycsXG5cdFx0XHQnMScsXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAxMSkpO1xuXHRcdFx0ZGVsZXRlV29yZExlZnQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ1xcdE15ICBMaW5lJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRQb3NpdGlvbigpLCBuZXcgUG9zaXRpb24oMiwgNSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkTGVmdCBmb3IgY3Vyc29yIGluc2lkZSBvZiBhIHdvcmQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0XHQnJyxcblx0XHRcdCcxJyxcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEyKSk7XG5cdFx0XHRkZWxldGVXb3JkTGVmdChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgIFxcdE15IHN0IExpbmVcXHQgJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRQb3NpdGlvbigpLCBuZXcgUG9zaXRpb24oMSwgOSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkUmlnaHQgZm9yIG5vbi1lbXB0eSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0XHQnJyxcblx0XHRcdCcxJyxcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMywgNywgMywgOSkpO1xuXHRcdFx0ZGVsZXRlV29yZFJpZ2h0KGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcgICAgVGhkIExpbmVcdUQ4M0RcdURDMzYnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFBvc2l0aW9uKCksIG5ldyBQb3NpdGlvbigzLCA3KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRSaWdodCBmb3IgY3Vyc29yIGF0IGVuZCBvZiBkb2N1bWVudCcsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0JyAgICBcXHRNeSBGaXJzdCBMaW5lXFx0ICcsXG5cdFx0XHQnXFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0JyAgICBUaGlyZCBMaW5lXHVEODNEXHVEQzM2Jyxcblx0XHRcdCcnLFxuXHRcdFx0JzEnLFxuXHRcdF0sIHt9LCAoZWRpdG9yLCBfKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oNSwgMykpO1xuXHRcdFx0ZGVsZXRlV29yZFJpZ2h0KGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICcxJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRQb3NpdGlvbigpLCBuZXcgUG9zaXRpb24oNSwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkUmlnaHQgZm9yIGN1cnNvciBhdCBiZWdnaW5pbmcgb2Ygd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0JyAgICBcXHRNeSBGaXJzdCBMaW5lXFx0ICcsXG5cdFx0XHQnXFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0JyAgICBUaGlyZCBMaW5lXHVEODNEXHVEQzM2Jyxcblx0XHRcdCcnLFxuXHRcdFx0JzEnLFxuXHRcdF0sIHt9LCAoZWRpdG9yLCBfKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMywgMSkpO1xuXHRcdFx0ZGVsZXRlV29yZFJpZ2h0KGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICdUaGlyZCBMaW5lXHVEODNEXHVEQzM2Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRQb3NpdGlvbigpLCBuZXcgUG9zaXRpb24oMywgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkUmlnaHQgZm9yIGN1cnNvciBqdXN0IGJlZm9yZSBhIHdvcmQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0XHQnJyxcblx0XHRcdCcxJyxcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDUpKTtcblx0XHRcdGRlbGV0ZVdvcmRSaWdodChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnXFx0TXkgIExpbmUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFBvc2l0aW9uKCksIG5ldyBQb3NpdGlvbigyLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRSaWdodCBmb3IgY3Vyc29yIGluc2lkZSBvZiBhIHdvcmQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0XHQnJyxcblx0XHRcdCcxJyxcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDExKSk7XG5cdFx0XHRkZWxldGVXb3JkUmlnaHQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBcXHRNeSBGaSBMaW5lXFx0ICcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0UG9zaXRpb24oKSwgbmV3IFBvc2l0aW9uKDEsIDExKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRMZWZ0IC0gaXNzdWUgIzgzMicsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCd8ICAgfC8qIHxKdXN0IHxzb21lIHx0ZXh0IHxhfCs9IHwzIHwrfDUgfCovfCAgJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMTAwMCwgMTAwMDApLFxuXHRcdFx0ZWQgPT4gZGVsZXRlV29yZExlZnQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRWYWx1ZSgpLmxlbmd0aCA9PT0gMFxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlV29yZFN0YXJ0TGVmdCcsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCd8ICAgfC8qIHxKdXN0IHxzb21lIHx0ZXh0IHxhfCs9IHwzIHwrfDUgfCovICAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxMDAwLCAxMDAwMCksXG5cdFx0XHRlZCA9PiBkZWxldGVXb3JkU3RhcnRMZWZ0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0VmFsdWUoKS5sZW5ndGggPT09IDBcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRFbmRMZWZ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gW1xuXHRcdFx0J3wgICAvKnwgSnVzdHwgc29tZXwgdGV4dHwgYXwrPXwgM3wgK3w1fCAqL3wgICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEwMDAsIDEwMDAwKSxcblx0XHRcdGVkID0+IGRlbGV0ZVdvcmRFbmRMZWZ0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0VmFsdWUoKS5sZW5ndGggPT09IDBcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRMZWZ0IC0gaXNzdWUgIzI0OTQ3JywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQneycsXG5cdFx0XHQnfSdcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHRcdGRlbGV0ZVdvcmRMZWZ0KGVkaXRvcik7IGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3t9Jyk7XG5cdFx0fSk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J3snLFxuXHRcdFx0J30nXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0XHRkZWxldGVXb3JkU3RhcnRMZWZ0KGVkaXRvcik7IGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3t9Jyk7XG5cdFx0fSk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J3snLFxuXHRcdFx0J30nXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0XHRkZWxldGVXb3JkRW5kTGVmdChlZGl0b3IpOyBhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd7fScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkUmlnaHQgLSBpc3N1ZSAjODMyJywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gJyAgIHwvKnwgfEp1c3R8IHxzb21lfCB8dGV4dHwgfGF8Kz18IHwzfCB8K3w1fC18M3wgfCovfCAgfCc7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IGRlbGV0ZVdvcmRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBuZXcgUG9zaXRpb24oMSwgdGV4dC5sZW5ndGggLSBlZC5nZXRWYWx1ZSgpLmxlbmd0aCArIDEpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0VmFsdWUoKS5sZW5ndGggPT09IDBcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRSaWdodCAtIGlzc3VlICMzODgyJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQncHVibGljIHZvaWQgQWRkKCBpbnQgeCwnLFxuXHRcdFx0JyAgICAgICAgICAgICAgICAgaW50IHkgKSdcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDI0KSk7XG5cdFx0XHRkZWxldGVXb3JkUmlnaHQoZWRpdG9yKTsgYXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAncHVibGljIHZvaWQgQWRkKCBpbnQgeCxpbnQgeSApJywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkU3RhcnRSaWdodCAtIGlzc3VlICMzODgyJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQncHVibGljIHZvaWQgQWRkKCBpbnQgeCwnLFxuXHRcdFx0JyAgICAgICAgICAgICAgICAgaW50IHkgKSdcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDI0KSk7XG5cdFx0XHRkZWxldGVXb3JkU3RhcnRSaWdodChlZGl0b3IpOyBhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdwdWJsaWMgdm9pZCBBZGQoIGludCB4LGludCB5ICknLCAnMDAxJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRFbmRSaWdodCAtIGlzc3VlICMzODgyJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQncHVibGljIHZvaWQgQWRkKCBpbnQgeCwnLFxuXHRcdFx0JyAgICAgICAgICAgICAgICAgaW50IHkgKSdcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDI0KSk7XG5cdFx0XHRkZWxldGVXb3JkRW5kUmlnaHQoZWRpdG9yKTsgYXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAncHVibGljIHZvaWQgQWRkKCBpbnQgeCxpbnQgeSApJywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkU3RhcnRSaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9ICcgICB8LyogfEp1c3QgfHNvbWUgfHRleHQgfGF8Kz0gfDMgfCt8NXwtfDMgfCovICB8Jztcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0ZWQgPT4gZGVsZXRlV29yZFN0YXJ0UmlnaHQoZWQpLFxuXHRcdFx0ZWQgPT4gbmV3IFBvc2l0aW9uKDEsIHRleHQubGVuZ3RoIC0gZWQuZ2V0VmFsdWUoKS5sZW5ndGggKyAxKSxcblx0XHRcdGVkID0+IGVkLmdldFZhbHVlKCkubGVuZ3RoID09PSAwXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkRW5kUmlnaHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgRVhQRUNURUQgPSAnICAgLyp8IEp1c3R8IHNvbWV8IHRleHR8IGF8Kz18IDN8ICt8NXwtfDN8ICovfCAgfCc7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IGRlbGV0ZVdvcmRFbmRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBuZXcgUG9zaXRpb24oMSwgdGV4dC5sZW5ndGggLSBlZC5nZXRWYWx1ZSgpLmxlbmd0aCArIDEpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0VmFsdWUoKS5sZW5ndGggPT09IDBcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRSaWdodCAtIGlzc3VlICMzODgyICgxKTogQ3RybCtEZWxldGUgcmVtb3ZpbmcgZW50aXJlIGxpbmUgd2hlbiB1c2VkIGF0IHRoZSBlbmQgb2YgbGluZScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J0EgbGluZSB3aXRoIHRleHQuJyxcblx0XHRcdCcgICBBbmQgYW5vdGhlciBvbmUnXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxOCkpO1xuXHRcdFx0ZGVsZXRlV29yZFJpZ2h0KGVkaXRvcik7IGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0EgbGluZSB3aXRoIHRleHQuQW5kIGFub3RoZXIgb25lJywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkTGVmdCAtIGlzc3VlICMzODgyICgyKTogQ3RybCtEZWxldGUgcmVtb3ZpbmcgZW50aXJlIGxpbmUgd2hlbiB1c2VkIGF0IHRoZSBlbmQgb2YgbGluZScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J0EgbGluZSB3aXRoIHRleHQuJyxcblx0XHRcdCcgICBBbmQgYW5vdGhlciBvbmUnXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0XHRkZWxldGVXb3JkTGVmdChlZGl0b3IpOyBhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBIGxpbmUgd2l0aCB0ZXh0LiAgIEFuZCBhbm90aGVyIG9uZScsICcwMDEnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlV29yZExlZnQgLSBpc3N1ZSAjOTE4NTU6IE1hdGNoaW5nIChxdW90ZSwgYnJhY2tldCwgcGFyZW4pIGRvZXNuXFwndCBnZXQgZGVsZXRlZCB3aGVuIGhpdHRpbmcgQ3RybCtCYWNrc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdteVRlc3RNb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBbXG5cdFx0XHRcdHsgb3BlbjogJ1xcXCInLCBjbG9zZTogJ1xcXCInIH1cblx0XHRcdF1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ2EgXCJcIicsIGxhbmd1YWdlSWQpKTtcblx0XHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZSwgbW9kZWwsIHsgYXV0b0Nsb3NpbmdEZWxldGU6ICdhbHdheXMnIH0pKTtcblxuXHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNCkpO1xuXHRcdGRlbGV0ZVdvcmRMZWZ0KGVkaXRvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnYSAnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlSW5zaWRlV29yZCAtIGVtcHR5IGxpbmUnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdMaW5lMScsXG5cdFx0XHQnJyxcblx0XHRcdCdMaW5lMidcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnTGluZTFcXG5MaW5lMicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVJbnNpZGVXb3JkIC0gaW4gd2hpdGVzcGFjZSAxJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnSnVzdCAgc29tZSB0ZXh0Lidcblx0XHRdLCB7fSwgKGVkaXRvciwgXykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDYpKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnSnVzdHNvbWUgdGV4dC4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlSW5zaWRlV29yZCAtIGluIHdoaXRlc3BhY2UgMicsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J0p1c3QgICAgIHNvbWUgdGV4dC4nXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA2KSk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ0p1c3Rzb21lIHRleHQuJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUluc2lkZVdvcmQgLSBpbiB3aGl0ZXNwYWNlIDMnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdKdXN0ICAgICBcInNvbWUgdGV4dC4nXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA2KSk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ0p1c3RcInNvbWUgdGV4dC4nKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnXCJzb21lIHRleHQuJyk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ3NvbWUgdGV4dC4nKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAndGV4dC4nKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnLicpO1xuXHRcdFx0ZGVsZXRlSW5zaWRlV29yZChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcnKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUluc2lkZVdvcmQgLSBpbiBub24td29yZHMnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCd4PTMrNCs1KzYnXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA3KSk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ3g9Mys0NSs2Jyk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ3g9MysrNicpO1xuXHRcdFx0ZGVsZXRlSW5zaWRlV29yZChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICd4PTM2Jyk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ3g9Jyk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ3gnKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnJyk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVJbnNpZGVXb3JkIC0gaW4gd29yZHMgMScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J1RoaXMgaXMgaW50ZXJlc3RpbmcnXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA3KSk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1RoaXMgaW50ZXJlc3RpbmcnKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnVGhpcycpO1xuXHRcdFx0ZGVsZXRlSW5zaWRlV29yZChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcnKTtcblx0XHRcdGRlbGV0ZUluc2lkZVdvcmQoZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUluc2lkZVdvcmQgLSBpbiB3b3JkcyAyJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnVGhpcyAgaXMgIGludGVyZXN0aW5nJ1xuXHRcdF0sIHt9LCAoZWRpdG9yLCBfKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNykpO1xuXHRcdFx0ZGVsZXRlSW5zaWRlV29yZChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdUaGlzICBpbnRlcmVzdGluZycpO1xuXHRcdFx0ZGVsZXRlSW5zaWRlV29yZChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdUaGlzJyk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJycpO1xuXHRcdFx0ZGVsZXRlSW5zaWRlV29yZChlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlSW5zaWRlV29yZCAtIG9ubHlXb3JkOiBkb2VzIG5vdCBkZWxldGUgd2hpdGVzcGFjZSBiZWZvcmUgbGFzdCB3b3JkJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnaGVsbG8gd29ybGQnXG5cdFx0XSwge30sIChlZGl0b3IsIF8pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA5KSk7XG5cdFx0XHRkZWxldGVJbnNpZGVXb3JkKGVkaXRvciwgeyBvbmx5V29yZDogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnaGVsbG8gJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUluc2lkZVdvcmQgLSBvbmx5V29yZDogZGVsZXRlcyBqdXN0IHRoZSB3b3JkIChsZWF2ZXMgZG91YmxlIHNwYWNlcyknLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdUaGlzIGlzIGludGVyZXN0aW5nJ1xuXHRcdF0sIHt9LCAoZWRpdG9yLCBfKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNykpO1xuXHRcdFx0ZGVsZXRlSW5zaWRlV29yZChlZGl0b3IsIHsgb25seVdvcmQ6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1RoaXMgIGludGVyZXN0aW5nJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFHcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFFOUMsU0FBUyw2QkFBNkIsbUNBQW1DLDhCQUE4QixvQ0FBb0MsbUJBQW1CLHlCQUF5QixvQkFBb0Is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
