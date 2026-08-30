import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Selection } from "../../../../common/core/selection.js";
import { Handler } from "../../../../common/editorCommon.js";
import { EndOfLineSequence } from "../../../../common/model.js";
import { CommonFindController } from "../../../find/browser/findController.js";
import { AddSelectionToNextFindMatchAction, InsertCursorAbove, InsertCursorBelow, MultiCursorSelectionController, SelectHighlightsAction } from "../../browser/multicursor.js";
import { withTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IStorageService, InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
suite("Multicursor", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #26393: Multiple cursors + Word wrap", () => {
    withTestCodeEditor([
      "a".repeat(20),
      "a".repeat(20)
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 10 }, (editor, viewModel) => {
      const addCursorDownAction = new InsertCursorBelow();
      addCursorDownAction.run(null, editor, {});
      assert.strictEqual(viewModel.getCursorStates().length, 2);
      assert.strictEqual(viewModel.getCursorStates()[0].viewState.position.lineNumber, 1);
      assert.strictEqual(viewModel.getCursorStates()[1].viewState.position.lineNumber, 3);
      editor.setPosition({ lineNumber: 4, column: 1 });
      const addCursorUpAction = new InsertCursorAbove();
      addCursorUpAction.run(null, editor, {});
      assert.strictEqual(viewModel.getCursorStates().length, 2);
      assert.strictEqual(viewModel.getCursorStates()[0].viewState.position.lineNumber, 4);
      assert.strictEqual(viewModel.getCursorStates()[1].viewState.position.lineNumber, 2);
    });
  });
  test("issue #2205: Multi-cursor pastes in reverse order", () => {
    withTestCodeEditor([
      "abc",
      "def"
    ], {}, (editor, viewModel) => {
      const addCursorUpAction = new InsertCursorAbove();
      editor.setSelection(new Selection(2, 1, 2, 1));
      addCursorUpAction.run(null, editor, {});
      assert.strictEqual(viewModel.getSelections().length, 2);
      editor.trigger("test", Handler.Paste, {
        text: "1\n2",
        multicursorText: [
          "1",
          "2"
        ]
      });
      assert.strictEqual(editor.getModel().getLineContent(1), "1abc");
      assert.strictEqual(editor.getModel().getLineContent(2), "2def");
    });
  });
  test("issue #1336: Insert cursor below on last line adds a cursor to the end of the current line", () => {
    withTestCodeEditor([
      "abc"
    ], {}, (editor, viewModel) => {
      const addCursorDownAction = new InsertCursorBelow();
      addCursorDownAction.run(null, editor, {});
      assert.strictEqual(viewModel.getSelections().length, 1);
    });
  });
});
function fromRange(rng) {
  return [rng.startLineNumber, rng.startColumn, rng.endLineNumber, rng.endColumn];
}
suite("Multicursor selection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const serviceCollection = new ServiceCollection();
  serviceCollection.set(IStorageService, new InMemoryStorageService());
  test("issue #8817: Cursor position changes when you cancel multicursor", () => {
    withTestCodeEditor([
      "var x = (3 * 5)",
      "var y = (3 * 5)",
      "var z = (3 * 5)"
    ], { serviceCollection }, (editor) => {
      const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
      const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
      const selectHighlightsAction = new SelectHighlightsAction();
      editor.setSelection(new Selection(2, 9, 2, 16));
      selectHighlightsAction.run(null, editor);
      assert.deepStrictEqual(editor.getSelections().map(fromRange), [
        [2, 9, 2, 16],
        [1, 9, 1, 16],
        [3, 9, 3, 16]
      ]);
      editor.trigger("test", "removeSecondaryCursors", null);
      assert.deepStrictEqual(fromRange(editor.getSelection()), [2, 9, 2, 16]);
      multiCursorSelectController.dispose();
      findController.dispose();
    });
  });
  test('issue #5400: "Select All Occurrences of Find Match" does not select all if find uses regex', () => {
    withTestCodeEditor([
      "something",
      "someething",
      "someeething",
      "nothing"
    ], { serviceCollection }, (editor) => {
      const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
      const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
      const selectHighlightsAction = new SelectHighlightsAction();
      editor.setSelection(new Selection(1, 1, 1, 1));
      findController.getState().change({ searchString: "some+thing", isRegex: true, isRevealed: true }, false);
      selectHighlightsAction.run(null, editor);
      assert.deepStrictEqual(editor.getSelections().map(fromRange), [
        [1, 1, 1, 10],
        [2, 1, 2, 11],
        [3, 1, 3, 12]
      ]);
      assert.strictEqual(findController.getState().searchString, "some+thing");
      multiCursorSelectController.dispose();
      findController.dispose();
    });
  });
  test("AddSelectionToNextFindMatchAction can work with multiline", () => {
    withTestCodeEditor([
      "",
      "qwe",
      "rty",
      "",
      "qwe",
      "",
      "rty",
      "qwe",
      "rty"
    ], { serviceCollection }, (editor) => {
      const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
      const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
      const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();
      editor.setSelection(new Selection(2, 1, 3, 4));
      addSelectionToNextFindMatch.run(null, editor);
      assert.deepStrictEqual(editor.getSelections().map(fromRange), [
        [2, 1, 3, 4],
        [8, 1, 9, 4]
      ]);
      editor.trigger("test", "removeSecondaryCursors", null);
      assert.deepStrictEqual(fromRange(editor.getSelection()), [2, 1, 3, 4]);
      multiCursorSelectController.dispose();
      findController.dispose();
    });
  });
  test("issue #6661: AddSelectionToNextFindMatchAction can work with touching ranges", () => {
    withTestCodeEditor([
      "abcabc",
      "abc",
      "abcabc"
    ], { serviceCollection }, (editor) => {
      const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
      const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
      const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();
      editor.setSelection(new Selection(1, 1, 1, 4));
      addSelectionToNextFindMatch.run(null, editor);
      assert.deepStrictEqual(editor.getSelections().map(fromRange), [
        [1, 1, 1, 4],
        [1, 4, 1, 7]
      ]);
      addSelectionToNextFindMatch.run(null, editor);
      addSelectionToNextFindMatch.run(null, editor);
      addSelectionToNextFindMatch.run(null, editor);
      assert.deepStrictEqual(editor.getSelections().map(fromRange), [
        [1, 1, 1, 4],
        [1, 4, 1, 7],
        [2, 1, 2, 4],
        [3, 1, 3, 4],
        [3, 4, 3, 7]
      ]);
      editor.trigger("test", Handler.Type, { text: "z" });
      assert.deepStrictEqual(editor.getSelections().map(fromRange), [
        [1, 2, 1, 2],
        [1, 3, 1, 3],
        [2, 2, 2, 2],
        [3, 2, 3, 2],
        [3, 3, 3, 3]
      ]);
      assert.strictEqual(editor.getValue(), [
        "zz",
        "z",
        "zz"
      ].join("\n"));
      multiCursorSelectController.dispose();
      findController.dispose();
    });
  });
  test("issue #23541: Multiline Ctrl+D does not work in CRLF files", () => {
    withTestCodeEditor([
      "",
      "qwe",
      "rty",
      "",
      "qwe",
      "",
      "rty",
      "qwe",
      "rty"
    ], { serviceCollection }, (editor) => {
      editor.getModel().setEOL(EndOfLineSequence.CRLF);
      const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
      const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
      const addSelectionToNextFindMatch = new AddSelectionToNextFindMatchAction();
      editor.setSelection(new Selection(2, 1, 3, 4));
      addSelectionToNextFindMatch.run(null, editor);
      assert.deepStrictEqual(editor.getSelections().map(fromRange), [
        [2, 1, 3, 4],
        [8, 1, 9, 4]
      ]);
      editor.trigger("test", "removeSecondaryCursors", null);
      assert.deepStrictEqual(fromRange(editor.getSelection()), [2, 1, 3, 4]);
      multiCursorSelectController.dispose();
      findController.dispose();
    });
  });
  function testMulticursor(text, callback) {
    withTestCodeEditor(text, { serviceCollection }, (editor) => {
      const findController = editor.registerAndInstantiateContribution(CommonFindController.ID, CommonFindController);
      const multiCursorSelectController = editor.registerAndInstantiateContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController);
      callback(editor, findController);
      multiCursorSelectController.dispose();
      findController.dispose();
    });
  }
  function testAddSelectionToNextFindMatchAction(text, callback) {
    testMulticursor(text, (editor, findController) => {
      const action = new AddSelectionToNextFindMatchAction();
      callback(editor, action, findController);
    });
  }
  test("AddSelectionToNextFindMatchAction starting with single collapsed selection", () => {
    const text = [
      "abc pizza",
      "abc house",
      "abc bar"
    ];
    testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
      editor.setSelections([
        new Selection(1, 2, 1, 2)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4),
        new Selection(3, 1, 3, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4),
        new Selection(3, 1, 3, 4)
      ]);
    });
  });
  test("AddSelectionToNextFindMatchAction starting with two selections, one being collapsed 1)", () => {
    const text = [
      "abc pizza",
      "abc house",
      "abc bar"
    ];
    testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
      editor.setSelections([
        new Selection(1, 1, 1, 4),
        new Selection(2, 2, 2, 2)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4),
        new Selection(3, 1, 3, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4),
        new Selection(3, 1, 3, 4)
      ]);
    });
  });
  test("AddSelectionToNextFindMatchAction starting with two selections, one being collapsed 2)", () => {
    const text = [
      "abc pizza",
      "abc house",
      "abc bar"
    ];
    testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
      editor.setSelections([
        new Selection(1, 2, 1, 2),
        new Selection(2, 1, 2, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4),
        new Selection(3, 1, 3, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4),
        new Selection(3, 1, 3, 4)
      ]);
    });
  });
  test("AddSelectionToNextFindMatchAction starting with all collapsed selections", () => {
    const text = [
      "abc pizza",
      "abc house",
      "abc bar"
    ];
    testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
      editor.setSelections([
        new Selection(1, 2, 1, 2),
        new Selection(2, 2, 2, 2),
        new Selection(3, 1, 3, 1)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4),
        new Selection(3, 1, 3, 4)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 4),
        new Selection(2, 1, 2, 4),
        new Selection(3, 1, 3, 4)
      ]);
    });
  });
  test("AddSelectionToNextFindMatchAction starting with all collapsed selections on different words", () => {
    const text = [
      "abc pizza",
      "abc house",
      "abc bar"
    ];
    testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
      editor.setSelections([
        new Selection(1, 6, 1, 6),
        new Selection(2, 6, 2, 6),
        new Selection(3, 6, 3, 6)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 5, 1, 10),
        new Selection(2, 5, 2, 10),
        new Selection(3, 5, 3, 8)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 5, 1, 10),
        new Selection(2, 5, 2, 10),
        new Selection(3, 5, 3, 8)
      ]);
    });
  });
  test("issue #20651: AddSelectionToNextFindMatchAction case insensitive", () => {
    const text = [
      "test",
      "testte",
      "Test",
      "testte",
      "test"
    ];
    testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
      editor.setSelections([
        new Selection(1, 1, 1, 5)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5),
        new Selection(3, 1, 3, 5)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5),
        new Selection(3, 1, 3, 5),
        new Selection(4, 1, 4, 5)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5),
        new Selection(3, 1, 3, 5),
        new Selection(4, 1, 4, 5),
        new Selection(5, 1, 5, 5)
      ]);
      action.run(null, editor);
      assert.deepStrictEqual(editor.getSelections(), [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5),
        new Selection(3, 1, 3, 5),
        new Selection(4, 1, 4, 5),
        new Selection(5, 1, 5, 5)
      ]);
    });
  });
  suite("Find state disassociation", () => {
    const text = [
      "app",
      "apples",
      "whatsapp",
      "app",
      "App",
      " app"
    ];
    test("enters mode", () => {
      testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
        editor.setSelections([
          new Selection(1, 2, 1, 2)
        ]);
        action.run(null, editor);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 1, 1, 4)
        ]);
        action.run(null, editor);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 1, 1, 4),
          new Selection(4, 1, 4, 4)
        ]);
        action.run(null, editor);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 1, 1, 4),
          new Selection(4, 1, 4, 4),
          new Selection(6, 2, 6, 5)
        ]);
      });
    });
    test("leaves mode when selection changes", () => {
      testAddSelectionToNextFindMatchAction(text, (editor, action, findController) => {
        editor.setSelections([
          new Selection(1, 2, 1, 2)
        ]);
        action.run(null, editor);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 1, 1, 4)
        ]);
        action.run(null, editor);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 1, 1, 4),
          new Selection(4, 1, 4, 4)
        ]);
        editor.setSelections([
          new Selection(1, 1, 1, 4)
        ]);
        action.run(null, editor);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 1, 1, 4),
          new Selection(2, 1, 2, 4)
        ]);
      });
    });
    test("Select Highlights respects mode ", () => {
      testMulticursor(text, (editor, findController) => {
        const action = new SelectHighlightsAction();
        editor.setSelections([
          new Selection(1, 2, 1, 2)
        ]);
        action.run(null, editor);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 1, 1, 4),
          new Selection(4, 1, 4, 4),
          new Selection(6, 2, 6, 5)
        ]);
        action.run(null, editor);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 1, 1, 4),
          new Selection(4, 1, 4, 4),
          new Selection(6, 2, 6, 5)
        ]);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXG11bHRpY3Vyc29yXFx0ZXN0XFxicm93c2VyXFxtdWx0aWN1cnNvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29tbW9uRmluZENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi9maW5kL2Jyb3dzZXIvZmluZENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uLCBJbnNlcnRDdXJzb3JBYm92ZSwgSW5zZXJ0Q3Vyc29yQmVsb3csIE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciwgU2VsZWN0SGlnaGxpZ2h0c0FjdGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbXVsdGljdXJzb3IuanMnO1xuaW1wb3J0IHsgSVRlc3RDb2RlRWRpdG9yLCB3aXRoVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuc3VpdGUoJ011bHRpY3Vyc29yJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2lzc3VlICMyNjM5MzogTXVsdGlwbGUgY3Vyc29ycyArIFdvcmQgd3JhcCcsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J2EnLnJlcGVhdCgyMCksXG5cdFx0XHQnYScucmVwZWF0KDIwKSxcblx0XHRdLCB7IHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLCB3b3JkV3JhcENvbHVtbjogMTAgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBhZGRDdXJzb3JEb3duQWN0aW9uID0gbmV3IEluc2VydEN1cnNvckJlbG93KCk7XG5cdFx0XHRhZGRDdXJzb3JEb3duQWN0aW9uLnJ1bihudWxsISwgZWRpdG9yLCB7fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkubGVuZ3RoLCAyKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKVswXS52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpWzFdLnZpZXdTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyLCAzKTtcblxuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogNCwgY29sdW1uOiAxIH0pO1xuXHRcdFx0Y29uc3QgYWRkQ3Vyc29yVXBBY3Rpb24gPSBuZXcgSW5zZXJ0Q3Vyc29yQWJvdmUoKTtcblx0XHRcdGFkZEN1cnNvclVwQWN0aW9uLnJ1bihudWxsISwgZWRpdG9yLCB7fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkubGVuZ3RoLCAyKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKVswXS52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlciwgNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpWzFdLnZpZXdTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyLCAyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIyMDU6IE11bHRpLWN1cnNvciBwYXN0ZXMgaW4gcmV2ZXJzZSBvcmRlcicsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J2FiYycsXG5cdFx0XHQnZGVmJ1xuXHRcdF0sIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGFkZEN1cnNvclVwQWN0aW9uID0gbmV3IEluc2VydEN1cnNvckFib3ZlKCk7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cdFx0XHRhZGRDdXJzb3JVcEFjdGlvbi5ydW4obnVsbCEsIGVkaXRvciwge30pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCkubGVuZ3RoLCAyKTtcblxuXHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCBIYW5kbGVyLlBhc3RlLCB7XG5cdFx0XHRcdHRleHQ6ICcxXFxuMicsXG5cdFx0XHRcdG11bHRpY3Vyc29yVGV4dDogW1xuXHRcdFx0XHRcdCcxJyxcblx0XHRcdFx0XHQnMidcblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoMSksICcxYWJjJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDIpLCAnMmRlZicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTMzNjogSW5zZXJ0IGN1cnNvciBiZWxvdyBvbiBsYXN0IGxpbmUgYWRkcyBhIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGxpbmUnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdhYmMnXG5cdFx0XSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgYWRkQ3Vyc29yRG93bkFjdGlvbiA9IG5ldyBJbnNlcnRDdXJzb3JCZWxvdygpO1xuXHRcdFx0YWRkQ3Vyc29yRG93bkFjdGlvbi5ydW4obnVsbCEsIGVkaXRvciwge30pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCkubGVuZ3RoLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cbn0pO1xuXG5mdW5jdGlvbiBmcm9tUmFuZ2Uocm5nOiBSYW5nZSk6IG51bWJlcltdIHtcblx0cmV0dXJuIFtybmcuc3RhcnRMaW5lTnVtYmVyLCBybmcuc3RhcnRDb2x1bW4sIHJuZy5lbmRMaW5lTnVtYmVyLCBybmcuZW5kQ29sdW1uXTtcbn1cblxuc3VpdGUoJ011bHRpY3Vyc29yIHNlbGVjdGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2VydmljZUNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0c2VydmljZUNvbGxlY3Rpb24uc2V0KElTdG9yYWdlU2VydmljZSwgbmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0dGVzdCgnaXNzdWUgIzg4MTc6IEN1cnNvciBwb3NpdGlvbiBjaGFuZ2VzIHdoZW4geW91IGNhbmNlbCBtdWx0aWN1cnNvcicsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J3ZhciB4ID0gKDMgKiA1KScsXG5cdFx0XHQndmFyIHkgPSAoMyAqIDUpJyxcblx0XHRcdCd2YXIgeiA9ICgzICogNSknLFxuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IpID0+IHtcblxuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihDb21tb25GaW5kQ29udHJvbGxlci5JRCwgQ29tbW9uRmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgbXVsdGlDdXJzb3JTZWxlY3RDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLklELCBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0SGlnaGxpZ2h0c0FjdGlvbiA9IG5ldyBTZWxlY3RIaWdobGlnaHRzQWN0aW9uKCk7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCA5LCAyLCAxNikpO1xuXG5cdFx0XHRzZWxlY3RIaWdobGlnaHRzQWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubWFwKGZyb21SYW5nZSksIFtcblx0XHRcdFx0WzIsIDksIDIsIDE2XSxcblx0XHRcdFx0WzEsIDksIDEsIDE2XSxcblx0XHRcdFx0WzMsIDksIDMsIDE2XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IudHJpZ2dlcigndGVzdCcsICdyZW1vdmVTZWNvbmRhcnlDdXJzb3JzJywgbnVsbCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnJvbVJhbmdlKGVkaXRvci5nZXRTZWxlY3Rpb24oKSEpLCBbMiwgOSwgMiwgMTZdKTtcblxuXHRcdFx0bXVsdGlDdXJzb3JTZWxlY3RDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHRcdGZpbmRDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzU0MDA6IFwiU2VsZWN0IEFsbCBPY2N1cnJlbmNlcyBvZiBGaW5kIE1hdGNoXCIgZG9lcyBub3Qgc2VsZWN0IGFsbCBpZiBmaW5kIHVzZXMgcmVnZXgnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdzb21ldGhpbmcnLFxuXHRcdFx0J3NvbWVldGhpbmcnLFxuXHRcdFx0J3NvbWVlZXRoaW5nJyxcblx0XHRcdCdub3RoaW5nJ1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IpID0+IHtcblxuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihDb21tb25GaW5kQ29udHJvbGxlci5JRCwgQ29tbW9uRmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgbXVsdGlDdXJzb3JTZWxlY3RDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLklELCBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0SGlnaGxpZ2h0c0FjdGlvbiA9IG5ldyBTZWxlY3RIaWdobGlnaHRzQWN0aW9uKCk7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0XHRmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ3NvbWUrdGhpbmcnLCBpc1JlZ2V4OiB0cnVlLCBpc1JldmVhbGVkOiB0cnVlIH0sIGZhbHNlKTtcblxuXHRcdFx0c2VsZWN0SGlnaGxpZ2h0c0FjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLm1hcChmcm9tUmFuZ2UpLCBbXG5cdFx0XHRcdFsxLCAxLCAxLCAxMF0sXG5cdFx0XHRcdFsyLCAxLCAyLCAxMV0sXG5cdFx0XHRcdFszLCAxLCAzLCAxMl0sXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCkuc2VhcmNoU3RyaW5nLCAnc29tZSt0aGluZycpO1xuXG5cdFx0XHRtdWx0aUN1cnNvclNlbGVjdENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24gY2FuIHdvcmsgd2l0aCBtdWx0aWxpbmUnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcnLFxuXHRcdFx0J3F3ZScsXG5cdFx0XHQncnR5Jyxcblx0XHRcdCcnLFxuXHRcdFx0J3F3ZScsXG5cdFx0XHQnJyxcblx0XHRcdCdydHknLFxuXHRcdFx0J3F3ZScsXG5cdFx0XHQncnR5J1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IpID0+IHtcblxuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihDb21tb25GaW5kQ29udHJvbGxlci5JRCwgQ29tbW9uRmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgbXVsdGlDdXJzb3JTZWxlY3RDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLklELCBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgYWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoID0gbmV3IEFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbigpO1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMywgNCkpO1xuXG5cdFx0XHRhZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2gucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIS5tYXAoZnJvbVJhbmdlKSwgW1xuXHRcdFx0XHRbMiwgMSwgMywgNF0sXG5cdFx0XHRcdFs4LCAxLCA5LCA0XVxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3JlbW92ZVNlY29uZGFyeUN1cnNvcnMnLCBudWxsKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmcm9tUmFuZ2UoZWRpdG9yLmdldFNlbGVjdGlvbigpISksIFsyLCAxLCAzLCA0XSk7XG5cblx0XHRcdG11bHRpQ3Vyc29yU2VsZWN0Q29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2NjYxOiBBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24gY2FuIHdvcmsgd2l0aCB0b3VjaGluZyByYW5nZXMnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdhYmNhYmMnLFxuXHRcdFx0J2FiYycsXG5cdFx0XHQnYWJjYWJjJyxcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yKSA9PiB7XG5cblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oQ29tbW9uRmluZENvbnRyb2xsZXIuSUQsIENvbW1vbkZpbmRDb250cm9sbGVyKTtcblx0XHRcdGNvbnN0IG11bHRpQ3Vyc29yU2VsZWN0Q29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlci5JRCwgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyKTtcblx0XHRcdGNvbnN0IGFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaCA9IG5ldyBBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24oKTtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpKTtcblxuXHRcdFx0YWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubWFwKGZyb21SYW5nZSksIFtcblx0XHRcdFx0WzEsIDEsIDEsIDRdLFxuXHRcdFx0XHRbMSwgNCwgMSwgN11cblx0XHRcdF0pO1xuXG5cdFx0XHRhZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2gucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaC5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLm1hcChmcm9tUmFuZ2UpLCBbXG5cdFx0XHRcdFsxLCAxLCAxLCA0XSxcblx0XHRcdFx0WzEsIDQsIDEsIDddLFxuXHRcdFx0XHRbMiwgMSwgMiwgNF0sXG5cdFx0XHRcdFszLCAxLCAzLCA0XSxcblx0XHRcdFx0WzMsIDQsIDMsIDddXG5cdFx0XHRdKTtcblxuXHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ3Rlc3QnLCBIYW5kbGVyLlR5cGUsIHsgdGV4dDogJ3onIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIS5tYXAoZnJvbVJhbmdlKSwgW1xuXHRcdFx0XHRbMSwgMiwgMSwgMl0sXG5cdFx0XHRcdFsxLCAzLCAxLCAzXSxcblx0XHRcdFx0WzIsIDIsIDIsIDJdLFxuXHRcdFx0XHRbMywgMiwgMywgMl0sXG5cdFx0XHRcdFszLCAzLCAzLCAzXVxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J3p6Jyxcblx0XHRcdFx0J3onLFxuXHRcdFx0XHQnenonLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRcdG11bHRpQ3Vyc29yU2VsZWN0Q29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMzU0MTogTXVsdGlsaW5lIEN0cmwrRCBkb2VzIG5vdCB3b3JrIGluIENSTEYgZmlsZXMnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcnLFxuXHRcdFx0J3F3ZScsXG5cdFx0XHQncnR5Jyxcblx0XHRcdCcnLFxuXHRcdFx0J3F3ZScsXG5cdFx0XHQnJyxcblx0XHRcdCdydHknLFxuXHRcdFx0J3F3ZScsXG5cdFx0XHQncnR5J1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IpID0+IHtcblxuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkhLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGKTtcblxuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihDb21tb25GaW5kQ29udHJvbGxlci5JRCwgQ29tbW9uRmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgbXVsdGlDdXJzb3JTZWxlY3RDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLklELCBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgYWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoID0gbmV3IEFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbigpO1xuXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMywgNCkpO1xuXG5cdFx0XHRhZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2gucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIS5tYXAoZnJvbVJhbmdlKSwgW1xuXHRcdFx0XHRbMiwgMSwgMywgNF0sXG5cdFx0XHRcdFs4LCAxLCA5LCA0XVxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci50cmlnZ2VyKCd0ZXN0JywgJ3JlbW92ZVNlY29uZGFyeUN1cnNvcnMnLCBudWxsKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmcm9tUmFuZ2UoZWRpdG9yLmdldFNlbGVjdGlvbigpISksIFsyLCAxLCAzLCA0XSk7XG5cblx0XHRcdG11bHRpQ3Vyc29yU2VsZWN0Q29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHRlc3RNdWx0aWN1cnNvcih0ZXh0OiBzdHJpbmdbXSwgY2FsbGJhY2s6IChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKHRleHQsIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oQ29tbW9uRmluZENvbnRyb2xsZXIuSUQsIENvbW1vbkZpbmRDb250cm9sbGVyKTtcblx0XHRcdGNvbnN0IG11bHRpQ3Vyc29yU2VsZWN0Q29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlci5JRCwgTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyKTtcblxuXHRcdFx0Y2FsbGJhY2soZWRpdG9yLCBmaW5kQ29udHJvbGxlcik7XG5cblx0XHRcdG11bHRpQ3Vyc29yU2VsZWN0Q29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0QWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uKHRleHQ6IHN0cmluZ1tdLCBjYWxsYmFjazogKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCBhY3Rpb246IEFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbiwgZmluZENvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGVzdE11bHRpY3Vyc29yKHRleHQsIChlZGl0b3IsIGZpbmRDb250cm9sbGVyKSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uKCk7XG5cdFx0XHRjYWxsYmFjayhlZGl0b3IsIGFjdGlvbiwgZmluZENvbnRyb2xsZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnQWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uIHN0YXJ0aW5nIHdpdGggc2luZ2xlIGNvbGxhcHNlZCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdhYmMgcGl6emEnLFxuXHRcdFx0J2FiYyBob3VzZScsXG5cdFx0XHQnYWJjIGJhcidcblx0XHRdO1xuXHRcdHRlc3RBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24odGV4dCwgKGVkaXRvciwgYWN0aW9uLCBmaW5kQ29udHJvbGxlcikgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNCksXG5cdFx0XHRdKTtcblxuXHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxLCAzLCA0KSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24gc3RhcnRpbmcgd2l0aCB0d28gc2VsZWN0aW9ucywgb25lIGJlaW5nIGNvbGxhcHNlZCAxKScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2FiYyBwaXp6YScsXG5cdFx0XHQnYWJjIGhvdXNlJyxcblx0XHRcdCdhYmMgYmFyJ1xuXHRcdF07XG5cdFx0dGVzdEFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbih0ZXh0LCAoZWRpdG9yLCBhY3Rpb24sIGZpbmRDb250cm9sbGVyKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMiksXG5cdFx0XHRdKTtcblxuXHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxLCAzLCA0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMywgNCksXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uIHN0YXJ0aW5nIHdpdGggdHdvIHNlbGVjdGlvbnMsIG9uZSBiZWluZyBjb2xsYXBzZWQgMiknLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdhYmMgcGl6emEnLFxuXHRcdFx0J2FiYyBob3VzZScsXG5cdFx0XHQnYWJjIGJhcidcblx0XHRdO1xuXHRcdHRlc3RBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24odGV4dCwgKGVkaXRvciwgYWN0aW9uLCBmaW5kQ29udHJvbGxlcikgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCA0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMywgNCksXG5cdFx0XHRdKTtcblxuXHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDQpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbiBzdGFydGluZyB3aXRoIGFsbCBjb2xsYXBzZWQgc2VsZWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2FiYyBwaXp6YScsXG5cdFx0XHQnYWJjIGhvdXNlJyxcblx0XHRcdCdhYmMgYmFyJ1xuXHRcdF07XG5cdFx0dGVzdEFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbih0ZXh0LCAoZWRpdG9yLCBhY3Rpb24sIGZpbmRDb250cm9sbGVyKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSksXG5cdFx0XHRdKTtcblxuXHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxLCAzLCA0KSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24gc3RhcnRpbmcgd2l0aCBhbGwgY29sbGFwc2VkIHNlbGVjdGlvbnMgb24gZGlmZmVyZW50IHdvcmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnYWJjIHBpenphJyxcblx0XHRcdCdhYmMgaG91c2UnLFxuXHRcdFx0J2FiYyBiYXInXG5cdFx0XTtcblx0XHR0ZXN0QWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uKHRleHQsIChlZGl0b3IsIGFjdGlvbiwgZmluZENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA2LCAyLCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA2LCAzLCA2KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgMTApLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDEwKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA1LCAzLCA4KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgMTApLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDEwKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA1LCAzLCA4KSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjA2NTE6IEFkZFNlbGVjdGlvblRvTmV4dEZpbmRNYXRjaEFjdGlvbiBjYXNlIGluc2Vuc2l0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQndGVzdCcsXG5cdFx0XHQndGVzdHRlJyxcblx0XHRcdCdUZXN0Jyxcblx0XHRcdCd0ZXN0dGUnLFxuXHRcdFx0J3Rlc3QnXG5cdFx0XTtcblx0XHR0ZXN0QWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uKHRleHQsIChlZGl0b3IsIGFjdGlvbiwgZmluZENvbnRyb2xsZXIpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDUpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCA1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxLCAzLCA1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxLCA0LCA1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMywgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgMSwgNSwgNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDEsIDUsIDUpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdGaW5kIHN0YXRlIGRpc2Fzc29jaWF0aW9uJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdhcHAnLFxuXHRcdFx0J2FwcGxlcycsXG5cdFx0XHQnd2hhdHNhcHAnLFxuXHRcdFx0J2FwcCcsXG5cdFx0XHQnQXBwJyxcblx0XHRcdCcgYXBwJ1xuXHRcdF07XG5cblx0XHR0ZXN0KCdlbnRlcnMgbW9kZScsICgpID0+IHtcblx0XHRcdHRlc3RBZGRTZWxlY3Rpb25Ub05leHRGaW5kTWF0Y2hBY3Rpb24odGV4dCwgKGVkaXRvciwgYWN0aW9uLCBmaW5kQ29udHJvbGxlcikgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDQpLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgNCksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCAyLCA2LCA1KSxcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlYXZlcyBtb2RlIHdoZW4gc2VsZWN0aW9uIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0QWRkU2VsZWN0aW9uVG9OZXh0RmluZE1hdGNoQWN0aW9uKHRleHQsIChlZGl0b3IsIGFjdGlvbiwgZmluZENvbnRyb2xsZXIpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxLCA0LCA0KSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0Ly8gY2hhbmdlIHNlbGVjdGlvblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2VsZWN0IEhpZ2hsaWdodHMgcmVzcGVjdHMgbW9kZSAnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0TXVsdGljdXJzb3IodGV4dCwgKGVkaXRvciwgZmluZENvbnRyb2xsZXIpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IFNlbGVjdEhpZ2hsaWdodHNBY3Rpb24oKTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGFjdGlvbi5ydW4obnVsbCEsIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxLCA0LCA0KSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDIsIDYsIDUpLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRhY3Rpb24ucnVuKG51bGwhLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgNCksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCAyLCA2LCA1KSxcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG1DQUFtQyxtQkFBbUIsbUJBQW1CLGdDQUFnQyw4QkFBOEI7QUFDaEosU0FBMEIsMEJBQTBCO0FBQ3BELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCLDhCQUE4QjtBQUV4RCxNQUFNLGVBQWUsTUFBTTtBQUUxQiwwQ0FBd0M7QUFFeEMsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCx1QkFBbUI7QUFBQSxNQUNsQixJQUFJLE9BQU8sRUFBRTtBQUFBLE1BQ2IsSUFBSSxPQUFPLEVBQUU7QUFBQSxJQUNkLEdBQUcsRUFBRSxVQUFVLGtCQUFrQixnQkFBZ0IsR0FBRyxH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
