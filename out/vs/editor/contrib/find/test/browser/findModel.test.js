import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CoreNavigationCommands } from "../../../../browser/coreCommands.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { PieceTreeTextBufferBuilder } from "../../../../common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js";
import { FindModelBoundToEditorModel } from "../../browser/findModel.js";
import { FindReplaceState } from "../../browser/findState.js";
import { withTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
suite("FindModel", () => {
  let disposables;
  setup(() => {
    disposables = new DisposableStore();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function findTest(testName, callback) {
    test(testName, () => {
      const textArr = [
        "// my cool header",
        '#include "cool.h"',
        "#include <iostream>",
        "",
        "int main() {",
        '    cout << "hello world, Hello!" << endl;',
        '    cout << "hello world again" << endl;',
        '    cout << "Hello world again" << endl;',
        '    cout << "helloworld again" << endl;',
        "}",
        "// blablablaciao",
        ""
      ];
      withTestCodeEditor(textArr, {}, (editor) => callback(editor));
      const text = textArr.join("\n");
      const ptBuilder = new PieceTreeTextBufferBuilder();
      ptBuilder.acceptChunk(text.substr(0, 94));
      ptBuilder.acceptChunk(text.substr(94, 101));
      ptBuilder.acceptChunk(text.substr(195, 59));
      const factory = ptBuilder.finish();
      withTestCodeEditor(
        factory,
        {},
        (editor) => callback(editor)
      );
    });
  }
  function fromRange(rng) {
    return [rng.startLineNumber, rng.startColumn, rng.endLineNumber, rng.endColumn];
  }
  function _getFindState(editor) {
    const model = editor.getModel();
    const currentFindMatches = [];
    const allFindMatches = [];
    for (const dec of model.getAllDecorations()) {
      if (dec.options.className === "currentFindMatch") {
        currentFindMatches.push(dec.range);
        allFindMatches.push(dec.range);
      } else if (dec.options.className === "findMatch") {
        allFindMatches.push(dec.range);
      }
    }
    currentFindMatches.sort(Range.compareRangesUsingStarts);
    allFindMatches.sort(Range.compareRangesUsingStarts);
    return {
      highlighted: currentFindMatches.map(fromRange),
      findDecorations: allFindMatches.map(fromRange)
    };
  }
  function assertFindState(editor, cursor, highlighted, findDecorations) {
    assert.deepStrictEqual(fromRange(editor.getSelection()), cursor, "cursor");
    const expectedState = {
      highlighted: highlighted ? [highlighted] : [],
      findDecorations
    };
    assert.deepStrictEqual(_getFindState(editor), expectedState, "state");
  }
  findTest("incremental find from beginning of file", (editor) => {
    editor.setPosition({ lineNumber: 1, column: 1 });
    const findState = disposables.add(new FindReplaceState());
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    findState.change({ searchString: "H" }, true);
    assertFindState(
      editor,
      [1, 12, 1, 13],
      [1, 12, 1, 13],
      [
        [1, 12, 1, 13],
        [2, 16, 2, 17],
        [6, 14, 6, 15],
        [6, 27, 6, 28],
        [7, 14, 7, 15],
        [8, 14, 8, 15],
        [9, 14, 9, 15]
      ]
    );
    findState.change({ searchString: "He" }, true);
    assertFindState(
      editor,
      [1, 12, 1, 14],
      [1, 12, 1, 14],
      [
        [1, 12, 1, 14],
        [6, 14, 6, 16],
        [6, 27, 6, 29],
        [7, 14, 7, 16],
        [8, 14, 8, 16],
        [9, 14, 9, 16]
      ]
    );
    findState.change({ searchString: "Hello" }, true);
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findState.change({ matchCase: true }, true);
    assertFindState(
      editor,
      [6, 27, 6, 32],
      [6, 27, 6, 32],
      [
        [6, 27, 6, 32],
        [8, 14, 8, 19]
      ]
    );
    findState.change({ searchString: "hello" }, true);
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [9, 14, 9, 19]
      ]
    );
    findState.change({ wholeWord: true }, true);
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19]
      ]
    );
    findState.change({ matchCase: false }, true);
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findState.change({ wholeWord: false }, true);
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findState.change({ searchScope: [new Range(8, 1, 10, 1)] }, true);
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findState.change({ searchScope: null }, true);
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find model removes its decorations", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello" }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assert.strictEqual(findState.matchesCount, 5);
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
  });
  findTest("find model updates state matchesCount", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello" }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assert.strictEqual(findState.matchesCount, 5);
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findState.change({ searchString: "helloo" }, false);
    assert.strictEqual(findState.matchesCount, 0);
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find model reacts to position change", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello" }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    editor.trigger("mouse", CoreNavigationCommands.MoveTo.id, {
      position: new Position(6, 20)
    });
    assertFindState(
      editor,
      [6, 20, 6, 20],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findState.change({ searchString: "Hello" }, true);
    assertFindState(
      editor,
      [6, 27, 6, 32],
      [6, 27, 6, 32],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find model next", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [6, 27, 6, 32],
      [6, 27, 6, 32],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find model next stays in scope", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", wholeWord: true, searchScope: [new Range(7, 1, 9, 1)] }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("multi-selection find model next stays in scope (overlap)", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", wholeWord: true, searchScope: [new Range(7, 1, 8, 2), new Range(8, 1, 9, 1)] }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("multi-selection find model next stays in scope", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", matchCase: true, wholeWord: false, searchScope: [new Range(6, 1, 7, 38), new Range(9, 3, 9, 38)] }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        // `matchCase: false` would
        // find this match as well:
        // [6, 27, 6, 32],
        [7, 14, 7, 19],
        // `wholeWord: true` would
        // exclude this match:
        [9, 14, 9, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [9, 14, 9, 19],
      [9, 14, 9, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find model prev", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [6, 27, 6, 32],
      [6, 27, 6, 32],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find model prev stays in scope", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", wholeWord: true, searchScope: [new Range(7, 1, 9, 1)] }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find model next/prev with no matches", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "helloo", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find model next/prev respects cursor position", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    editor.trigger("mouse", CoreNavigationCommands.MoveTo.id, {
      position: new Position(6, 20)
    });
    assertFindState(
      editor,
      [6, 20, 6, 20],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [6, 27, 6, 32],
      [6, 27, 6, 32],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find ^", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "^", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [1, 1, 1, 1],
        [2, 1, 2, 1],
        [3, 1, 3, 1],
        [4, 1, 4, 1],
        [5, 1, 5, 1],
        [6, 1, 6, 1],
        [7, 1, 7, 1],
        [8, 1, 8, 1],
        [9, 1, 9, 1],
        [10, 1, 10, 1],
        [11, 1, 11, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [2, 1, 2, 1],
      [2, 1, 2, 1],
      [
        [1, 1, 1, 1],
        [2, 1, 2, 1],
        [3, 1, 3, 1],
        [4, 1, 4, 1],
        [5, 1, 5, 1],
        [6, 1, 6, 1],
        [7, 1, 7, 1],
        [8, 1, 8, 1],
        [9, 1, 9, 1],
        [10, 1, 10, 1],
        [11, 1, 11, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [3, 1, 3, 1],
      [3, 1, 3, 1],
      [
        [1, 1, 1, 1],
        [2, 1, 2, 1],
        [3, 1, 3, 1],
        [4, 1, 4, 1],
        [5, 1, 5, 1],
        [6, 1, 6, 1],
        [7, 1, 7, 1],
        [8, 1, 8, 1],
        [9, 1, 9, 1],
        [10, 1, 10, 1],
        [11, 1, 11, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find $", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "$", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [1, 18, 1, 18],
        [2, 18, 2, 18],
        [3, 20, 3, 20],
        [4, 1, 4, 1],
        [5, 13, 5, 13],
        [6, 43, 6, 43],
        [7, 41, 7, 41],
        [8, 41, 8, 41],
        [9, 40, 9, 40],
        [10, 2, 10, 2],
        [11, 17, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [1, 18, 1, 18],
      [1, 18, 1, 18],
      [
        [1, 18, 1, 18],
        [2, 18, 2, 18],
        [3, 20, 3, 20],
        [4, 1, 4, 1],
        [5, 13, 5, 13],
        [6, 43, 6, 43],
        [7, 41, 7, 41],
        [8, 41, 8, 41],
        [9, 40, 9, 40],
        [10, 2, 10, 2],
        [11, 17, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [2, 18, 2, 18],
      [2, 18, 2, 18],
      [
        [1, 18, 1, 18],
        [2, 18, 2, 18],
        [3, 20, 3, 20],
        [4, 1, 4, 1],
        [5, 13, 5, 13],
        [6, 43, 6, 43],
        [7, 41, 7, 41],
        [8, 41, 8, 41],
        [9, 40, 9, 40],
        [10, 2, 10, 2],
        [11, 17, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [3, 20, 3, 20],
      [3, 20, 3, 20],
      [
        [1, 18, 1, 18],
        [2, 18, 2, 18],
        [3, 20, 3, 20],
        [4, 1, 4, 1],
        [5, 13, 5, 13],
        [6, 43, 6, 43],
        [7, 41, 7, 41],
        [8, 41, 8, 41],
        [9, 40, 9, 40],
        [10, 2, 10, 2],
        [11, 17, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find next ^$", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "^$", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [4, 1, 4, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [4, 1, 4, 1],
      [4, 1, 4, 1],
      [
        [4, 1, 4, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [12, 1, 12, 1],
      [12, 1, 12, 1],
      [
        [4, 1, 4, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [4, 1, 4, 1],
      [4, 1, 4, 1],
      [
        [4, 1, 4, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find .*", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: ".*", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [1, 1, 1, 18],
        [2, 1, 2, 18],
        [3, 1, 3, 20],
        [4, 1, 4, 1],
        [5, 1, 5, 13],
        [6, 1, 6, 43],
        [7, 1, 7, 41],
        [8, 1, 8, 41],
        [9, 1, 9, 40],
        [10, 1, 10, 2],
        [11, 1, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find next ^.*$", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "^.*$", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [1, 1, 1, 18],
        [2, 1, 2, 18],
        [3, 1, 3, 20],
        [4, 1, 4, 1],
        [5, 1, 5, 13],
        [6, 1, 6, 43],
        [7, 1, 7, 41],
        [8, 1, 8, 41],
        [9, 1, 9, 40],
        [10, 1, 10, 2],
        [11, 1, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [1, 1, 1, 18],
      [1, 1, 1, 18],
      [
        [1, 1, 1, 18],
        [2, 1, 2, 18],
        [3, 1, 3, 20],
        [4, 1, 4, 1],
        [5, 1, 5, 13],
        [6, 1, 6, 43],
        [7, 1, 7, 41],
        [8, 1, 8, 41],
        [9, 1, 9, 40],
        [10, 1, 10, 2],
        [11, 1, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [2, 1, 2, 18],
      [2, 1, 2, 18],
      [
        [1, 1, 1, 18],
        [2, 1, 2, 18],
        [3, 1, 3, 20],
        [4, 1, 4, 1],
        [5, 1, 5, 13],
        [6, 1, 6, 43],
        [7, 1, 7, 41],
        [8, 1, 8, 41],
        [9, 1, 9, 40],
        [10, 1, 10, 2],
        [11, 1, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find prev ^.*$", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "^.*$", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [1, 1, 1, 18],
        [2, 1, 2, 18],
        [3, 1, 3, 20],
        [4, 1, 4, 1],
        [5, 1, 5, 13],
        [6, 1, 6, 43],
        [7, 1, 7, 41],
        [8, 1, 8, 41],
        [9, 1, 9, 40],
        [10, 1, 10, 2],
        [11, 1, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [12, 1, 12, 1],
      [12, 1, 12, 1],
      [
        [1, 1, 1, 18],
        [2, 1, 2, 18],
        [3, 1, 3, 20],
        [4, 1, 4, 1],
        [5, 1, 5, 13],
        [6, 1, 6, 43],
        [7, 1, 7, 41],
        [8, 1, 8, 41],
        [9, 1, 9, 40],
        [10, 1, 10, 2],
        [11, 1, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [11, 1, 11, 17],
      [11, 1, 11, 17],
      [
        [1, 1, 1, 18],
        [2, 1, 2, 18],
        [3, 1, 3, 20],
        [4, 1, 4, 1],
        [5, 1, 5, 13],
        [6, 1, 6, 43],
        [7, 1, 7, 41],
        [8, 1, 8, 41],
        [9, 1, 9, 40],
        [10, 1, 10, 2],
        [11, 1, 11, 17],
        [12, 1, 12, 1]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("find prev ^$", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "^$", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [4, 1, 4, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [12, 1, 12, 1],
      [12, 1, 12, 1],
      [
        [4, 1, 4, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [4, 1, 4, 1],
      [4, 1, 4, 1],
      [
        [4, 1, 4, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.moveToPrevMatch();
    assertFindState(
      editor,
      [12, 1, 12, 1],
      [12, 1, 12, 1],
      [
        [4, 1, 4, 1],
        [12, 1, 12, 1]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("replace hello", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", replaceString: "hi", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    editor.trigger("mouse", CoreNavigationCommands.MoveTo.id, {
      position: new Position(6, 20)
    });
    assertFindState(
      editor,
      [6, 20, 6, 20],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [6, 27, 6, 32],
      [6, 27, 6, 32],
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, hi!" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [6, 14, 6, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [6, 16, 6, 16],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, hi!" << endl;');
    findModel.dispose();
    findState.dispose();
  });
  findTest("replace bla", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "bla", replaceString: "ciao" }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [11, 4, 11, 7],
        [11, 7, 11, 10],
        [11, 10, 11, 13]
      ]
    );
    findModel.replace();
    assertFindState(
      editor,
      [11, 4, 11, 7],
      [11, 4, 11, 7],
      [
        [11, 4, 11, 7],
        [11, 7, 11, 10],
        [11, 10, 11, 13]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(11), "// blablablaciao");
    findModel.replace();
    assertFindState(
      editor,
      [11, 8, 11, 11],
      [11, 8, 11, 11],
      [
        [11, 8, 11, 11],
        [11, 11, 11, 14]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(11), "// ciaoblablaciao");
    findModel.replace();
    assertFindState(
      editor,
      [11, 12, 11, 15],
      [11, 12, 11, 15],
      [
        [11, 12, 11, 15]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(11), "// ciaociaoblaciao");
    findModel.replace();
    assertFindState(
      editor,
      [11, 16, 11, 16],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(11), "// ciaociaociaociao");
    findModel.dispose();
    findState.dispose();
  });
  findTest("replaceAll hello", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", replaceString: "hi", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    editor.trigger("mouse", CoreNavigationCommands.MoveTo.id, {
      position: new Position(6, 20)
    });
    assertFindState(
      editor,
      [6, 20, 6, 20],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
    findModel.replaceAll();
    assertFindState(
      editor,
      [6, 17, 6, 17],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, hi!" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
    findModel.dispose();
    findState.dispose();
  });
  findTest("replaceAll two spaces with one space", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "  ", replaceString: " " }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 1, 6, 3],
        [6, 3, 6, 5],
        [7, 1, 7, 3],
        [7, 3, 7, 5],
        [8, 1, 8, 3],
        [8, 3, 8, 5],
        [9, 1, 9, 3],
        [9, 3, 9, 5]
      ]
    );
    findModel.replaceAll();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 1, 6, 3],
        [7, 1, 7, 3],
        [8, 1, 8, 3],
        [9, 1, 9, 3]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '  cout << "hello world, Hello!" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(7), '  cout << "hello world again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(8), '  cout << "Hello world again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(9), '  cout << "helloworld again" << endl;');
    findModel.dispose();
    findState.dispose();
  });
  findTest("replaceAll bla", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "bla", replaceString: "ciao" }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [11, 4, 11, 7],
        [11, 7, 11, 10],
        [11, 10, 11, 13]
      ]
    );
    findModel.replaceAll();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(11), "// ciaociaociaociao");
    findModel.dispose();
    findState.dispose();
  });
  findTest("replaceAll bla with \\t\\n", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "bla", replaceString: "<\\n\\t>", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [11, 4, 11, 7],
        [11, 7, 11, 10],
        [11, 10, 11, 13]
      ]
    );
    findModel.replaceAll();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(11), "// <");
    assert.strictEqual(editor.getModel().getLineContent(12), "	><");
    assert.strictEqual(editor.getModel().getLineContent(13), "	><");
    assert.strictEqual(editor.getModel().getLineContent(14), "	>ciao");
    findModel.dispose();
    findState.dispose();
  });
  findTest('issue #3516: "replace all" moves page/cursor/focus/scroll to the place of the last replacement', (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "include", replaceString: "bar" }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [2, 2, 2, 9],
        [3, 2, 3, 9]
      ]
    );
    findModel.replaceAll();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(2), '#bar "cool.h"');
    assert.strictEqual(editor.getModel().getLineContent(3), "#bar <iostream>");
    findModel.dispose();
    findState.dispose();
  });
  findTest("listens to model content changes", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", replaceString: "hi", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    editor.getModel().setValue("hello\nhi");
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("selectAllMatches", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", replaceString: "hi", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.selectAllMatches();
    assert.deepStrictEqual(editor.getSelections().map((s) => s.toString()), [
      new Selection(6, 14, 6, 19),
      new Selection(6, 27, 6, 32),
      new Selection(7, 14, 7, 19),
      new Selection(8, 14, 8, 19)
    ].map((s) => s.toString()));
    assertFindState(
      editor,
      [6, 14, 6, 19],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("issue #14143 selectAllMatches should maintain primary cursor if feasible", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", replaceString: "hi", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    editor.setSelection(new Range(7, 14, 7, 19));
    findModel.selectAllMatches();
    assert.deepStrictEqual(editor.getSelections().map((s) => s.toString()), [
      new Selection(7, 14, 7, 19),
      new Selection(6, 14, 6, 19),
      new Selection(6, 27, 6, 32),
      new Selection(8, 14, 8, 19)
    ].map((s) => s.toString()));
    assert.deepStrictEqual(editor.getSelection().toString(), new Selection(7, 14, 7, 19).toString());
    assertFindState(
      editor,
      [7, 14, 7, 19],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("issue #1914: NPE when there is only one find match", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "cool.h" }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [2, 11, 2, 17]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [2, 11, 2, 17],
      [2, 11, 2, 17],
      [
        [2, 11, 2, 17]
      ]
    );
    findModel.moveToNextMatch();
    assertFindState(
      editor,
      [2, 11, 2, 17],
      [2, 11, 2, 17],
      [
        [2, 11, 2, 17]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("replace when search string has look ahed regex", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello(?=\\sworld)", replaceString: "hi", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.replace();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, Hello!" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [8, 16, 8, 16],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
    findModel.dispose();
    findState.dispose();
  });
  findTest("replace when search string has look ahed regex and cursor is at the last find match", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello(?=\\sworld)", replaceString: "hi", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    editor.trigger("mouse", CoreNavigationCommands.MoveTo.id, {
      position: new Position(8, 14)
    });
    assertFindState(
      editor,
      [8, 14, 8, 14],
      null,
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.replace();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "Hello world again" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [7, 14, 7, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, Hello!" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [7, 16, 7, 16],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
    findModel.dispose();
    findState.dispose();
  });
  findTest("replaceAll when search string has look ahed regex", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello(?=\\sworld)", replaceString: "hi", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.replaceAll();
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, Hello!" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hi world again" << endl;');
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("replace when search string has look ahed regex and replace string has capturing groups", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hel(lo)(?=\\sworld)", replaceString: "hi$1", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.replace();
    assertFindState(
      editor,
      [6, 14, 6, 19],
      [6, 14, 6, 19],
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello world, Hello!" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [7, 14, 7, 19],
      [7, 14, 7, 19],
      [
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hilo world, Hello!" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [8, 14, 8, 19],
      [8, 14, 8, 19],
      [
        [8, 14, 8, 19]
      ]
    );
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hilo world again" << endl;');
    findModel.replace();
    assertFindState(
      editor,
      [8, 18, 8, 18],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "hilo world again" << endl;');
    findModel.dispose();
    findState.dispose();
  });
  findTest("replaceAll when search string has look ahed regex and replace string has capturing groups", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "wo(rl)d(?=.*;$)", replaceString: "gi$1", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 20, 6, 25],
        [7, 20, 7, 25],
        [8, 20, 8, 25],
        [9, 19, 9, 24]
      ]
    );
    findModel.replaceAll();
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello girl, Hello!" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hello girl again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "Hello girl again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(9), '    cout << "hellogirl again" << endl;');
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("replaceAll when search string is multiline and has look ahed regex and replace string has capturing groups", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "wo(rl)d(.*;\\n)(?=.*hello)", replaceString: "gi$1$2", isRegex: true, matchCase: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 20, 7, 1],
        [8, 20, 9, 1]
      ]
    );
    findModel.replaceAll();
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hello girl, Hello!" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "Hello girl again" << endl;');
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("replaceAll preserving case", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", replaceString: "goodbye", isRegex: false, matchCase: false, preserveCase: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.replaceAll();
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "goodbye world, Goodbye!" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "goodbye world again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << "Goodbye world again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(9), '    cout << "goodbyeworld again" << endl;');
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest("issue #18711 replaceAll with empty string", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", replaceString: "", wholeWord: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [6, 27, 6, 32],
        [7, 14, 7, 19],
        [8, 14, 8, 19]
      ]
    );
    findModel.replaceAll();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << " world, !" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << " world again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(8), '    cout << " world again" << endl;');
    findModel.dispose();
    findState.dispose();
  });
  findTest("issue #32522 replaceAll with ^ on more than 1000 matches", (editor) => {
    let initialText = "";
    for (let i = 0; i < 1100; i++) {
      initialText += "line" + i + "\n";
    }
    editor.getModel().setValue(initialText);
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "^", replaceString: "a ", isRegex: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    findModel.replaceAll();
    let expectedText = "";
    for (let i = 0; i < 1100; i++) {
      expectedText += "a line" + i + "\n";
    }
    expectedText += "a ";
    assert.strictEqual(editor.getModel().getValue(), expectedText);
    findModel.dispose();
    findState.dispose();
  });
  findTest("issue #19740 Find and replace capture group/backreference inserts `undefined` instead of empty string", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello(z)?", replaceString: "hi$1", isRegex: true, matchCase: true }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [6, 14, 6, 19],
        [7, 14, 7, 19],
        [9, 14, 9, 19]
      ]
    );
    findModel.replaceAll();
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      []
    );
    assert.strictEqual(editor.getModel().getLineContent(6), '    cout << "hi world, Hello!" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(7), '    cout << "hi world again" << endl;');
    assert.strictEqual(editor.getModel().getLineContent(9), '    cout << "hiworld again" << endl;');
    findModel.dispose();
    findState.dispose();
  });
  findTest("issue #27083. search scope works even if it is a single line", (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", wholeWord: true, searchScope: [new Range(7, 1, 8, 1)] }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assertFindState(
      editor,
      [1, 1, 1, 1],
      null,
      [
        [7, 14, 7, 19]
      ]
    );
    findModel.dispose();
    findState.dispose();
  });
  findTest('issue #3516: Control behavior of "Next" operations (not looping back to beginning)', (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello", loop: false }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assert.strictEqual(findState.matchesCount, 5);
    assert.strictEqual(findState.matchesPosition, 0);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 1);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), false);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 2);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 3);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 4);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 5);
    assert.strictEqual(findState.canNavigateForward(), false);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 5);
    assert.strictEqual(findState.canNavigateForward(), false);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 5);
    assert.strictEqual(findState.canNavigateForward(), false);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 4);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 3);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 2);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 1);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), false);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 1);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), false);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 1);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), false);
  });
  findTest('issue #3516: Control behavior of "Next" operations (looping back to beginning)', (editor) => {
    const findState = disposables.add(new FindReplaceState());
    findState.change({ searchString: "hello" }, false);
    const findModel = disposables.add(new FindModelBoundToEditorModel(editor, findState));
    assert.strictEqual(findState.matchesCount, 5);
    assert.strictEqual(findState.matchesPosition, 0);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 1);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 2);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 3);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 4);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 5);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 1);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToNextMatch();
    assert.strictEqual(findState.matchesPosition, 2);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 1);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 5);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 4);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 3);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 2);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
    findModel.moveToPrevMatch();
    assert.strictEqual(findState.matchesPosition, 1);
    assert.strictEqual(findState.canNavigateForward(), true);
    assert.strictEqual(findState.canNavigateBack(), true);
  });
  test("issue #288515: Wrong current index in find widget if matches > 1000", () => {
    const textArr = Array(1001).fill("hello");
    withTestCodeEditor(textArr, {}, (_editor) => {
      const editor = _editor;
      editor.setSelection(new Selection(900, 1, 900, 6));
      const findState = disposables.add(new FindReplaceState());
      findState.change({ searchString: "hello" }, false);
      disposables.add(new FindModelBoundToEditorModel(editor, findState));
      assert.strictEqual(findState.matchesCount, 1001);
      assert.strictEqual(findState.matchesPosition, 900);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZpbmRcXHRlc3RcXGJyb3dzZXJcXGZpbmRNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29yZU5hdmlnYXRpb25Db21tYW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IFBpZWNlVHJlZVRleHRCdWZmZXJCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3BpZWNlVHJlZVRleHRCdWZmZXIvcGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9maW5kTW9kZWwuanMnO1xuaW1wb3J0IHsgRmluZFJlcGxhY2VTdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZmluZFN0YXRlLmpzJztcbmltcG9ydCB7IHdpdGhUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5cbnN1aXRlKCdGaW5kTW9kZWwnLCAoKSA9PiB7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBmaW5kVGVzdCh0ZXN0TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0ZXN0KHRlc3ROYW1lLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0QXJyID0gW1xuXHRcdFx0XHQnLy8gbXkgY29vbCBoZWFkZXInLFxuXHRcdFx0XHQnI2luY2x1ZGUgXCJjb29sLmhcIicsXG5cdFx0XHRcdCcjaW5jbHVkZSA8aW9zdHJlYW0+Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdpbnQgbWFpbigpIHsnLFxuXHRcdFx0XHQnICAgIGNvdXQgPDwgXCJoZWxsbyB3b3JsZCwgSGVsbG8hXCIgPDwgZW5kbDsnLFxuXHRcdFx0XHQnICAgIGNvdXQgPDwgXCJoZWxsbyB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyxcblx0XHRcdFx0JyAgICBjb3V0IDw8IFwiSGVsbG8gd29ybGQgYWdhaW5cIiA8PCBlbmRsOycsXG5cdFx0XHRcdCcgICAgY291dCA8PCBcImhlbGxvd29ybGQgYWdhaW5cIiA8PCBlbmRsOycsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdFx0Jy8vIGJsYWJsYWJsYWNpYW8nLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XTtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcih0ZXh0QXJyLCB7fSwgKGVkaXRvcikgPT4gY2FsbGJhY2soZWRpdG9yIGFzIElBY3RpdmVDb2RlRWRpdG9yKSk7XG5cblx0XHRcdGNvbnN0IHRleHQgPSB0ZXh0QXJyLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcHRCdWlsZGVyID0gbmV3IFBpZWNlVHJlZVRleHRCdWZmZXJCdWlsZGVyKCk7XG5cdFx0XHRwdEJ1aWxkZXIuYWNjZXB0Q2h1bmsodGV4dC5zdWJzdHIoMCwgOTQpKTtcblx0XHRcdHB0QnVpbGRlci5hY2NlcHRDaHVuayh0ZXh0LnN1YnN0cig5NCwgMTAxKSk7XG5cdFx0XHRwdEJ1aWxkZXIuYWNjZXB0Q2h1bmsodGV4dC5zdWJzdHIoMTk1LCA1OSkpO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9IHB0QnVpbGRlci5maW5pc2goKTtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0ZmFjdG9yeSxcblx0XHRcdFx0e30sXG5cdFx0XHRcdChlZGl0b3IpID0+IGNhbGxiYWNrKGVkaXRvciBhcyBJQWN0aXZlQ29kZUVkaXRvcilcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBmcm9tUmFuZ2Uocm5nOiBSYW5nZSk6IG51bWJlcltdIHtcblx0XHRyZXR1cm4gW3JuZy5zdGFydExpbmVOdW1iZXIsIHJuZy5zdGFydENvbHVtbiwgcm5nLmVuZExpbmVOdW1iZXIsIHJuZy5lbmRDb2x1bW5dO1xuXHR9XG5cblx0ZnVuY3Rpb24gX2dldEZpbmRTdGF0ZShlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0Y29uc3QgY3VycmVudEZpbmRNYXRjaGVzOiBSYW5nZVtdID0gW107XG5cdFx0Y29uc3QgYWxsRmluZE1hdGNoZXM6IFJhbmdlW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZGVjIG9mIG1vZGVsLmdldEFsbERlY29yYXRpb25zKCkpIHtcblx0XHRcdGlmIChkZWMub3B0aW9ucy5jbGFzc05hbWUgPT09ICdjdXJyZW50RmluZE1hdGNoJykge1xuXHRcdFx0XHRjdXJyZW50RmluZE1hdGNoZXMucHVzaChkZWMucmFuZ2UpO1xuXHRcdFx0XHRhbGxGaW5kTWF0Y2hlcy5wdXNoKGRlYy5yYW5nZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGRlYy5vcHRpb25zLmNsYXNzTmFtZSA9PT0gJ2ZpbmRNYXRjaCcpIHtcblx0XHRcdFx0YWxsRmluZE1hdGNoZXMucHVzaChkZWMucmFuZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGN1cnJlbnRGaW5kTWF0Y2hlcy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdFx0YWxsRmluZE1hdGNoZXMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGhpZ2hsaWdodGVkOiBjdXJyZW50RmluZE1hdGNoZXMubWFwKGZyb21SYW5nZSksXG5cdFx0XHRmaW5kRGVjb3JhdGlvbnM6IGFsbEZpbmRNYXRjaGVzLm1hcChmcm9tUmFuZ2UpXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydEZpbmRTdGF0ZShlZGl0b3I6IElDb2RlRWRpdG9yLCBjdXJzb3I6IG51bWJlcltdLCBoaWdobGlnaHRlZDogbnVtYmVyW10gfCBudWxsLCBmaW5kRGVjb3JhdGlvbnM6IG51bWJlcltdW10pOiB2b2lkIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZyb21SYW5nZShlZGl0b3IuZ2V0U2VsZWN0aW9uKCkhKSwgY3Vyc29yLCAnY3Vyc29yJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZFN0YXRlID0ge1xuXHRcdFx0aGlnaGxpZ2h0ZWQ6IGhpZ2hsaWdodGVkID8gW2hpZ2hsaWdodGVkXSA6IFtdLFxuXHRcdFx0ZmluZERlY29yYXRpb25zOiBmaW5kRGVjb3JhdGlvbnNcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoX2dldEZpbmRTdGF0ZShlZGl0b3IpLCBleHBlY3RlZFN0YXRlLCAnc3RhdGUnKTtcblx0fVxuXG5cdGZpbmRUZXN0KCdpbmNyZW1lbnRhbCBmaW5kIGZyb20gYmVnaW5uaW5nIG9mIGZpbGUnLCAoZWRpdG9yKSA9PiB7XG5cdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxIH0pO1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0Ly8gc2ltdWxhdGUgdHlwaW5nIHRoZSBzZWFyY2ggc3RyaW5nXG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ0gnIH0sIHRydWUpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxMiwgMSwgMTNdLFxuXHRcdFx0WzEsIDEyLCAxLCAxM10sXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxMiwgMSwgMTNdLFxuXHRcdFx0XHRbMiwgMTYsIDIsIDE3XSxcblx0XHRcdFx0WzYsIDE0LCA2LCAxNV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMjhdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE1XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxNV0sXG5cdFx0XHRcdFs5LCAxNCwgOSwgMTVdXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdC8vIHNpbXVsYXRlIHR5cGluZyB0aGUgc2VhcmNoIHN0cmluZ1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdIZScgfSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEyLCAxLCAxNF0sXG5cdFx0XHRbMSwgMTIsIDEsIDE0XSxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEyLCAxLCAxNF0sXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTZdLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDI5XSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxNl0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTZdLFxuXHRcdFx0XHRbOSwgMTQsIDksIDE2XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHQvLyBzaW11bGF0ZSB0eXBpbmcgdGhlIHNlYXJjaCBzdHJpbmdcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnSGVsbG8nIH0sIHRydWUpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0XHRbOSwgMTQsIDksIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHQvLyBzaW11bGF0ZSB0b2dnbGluZyBvbiBgbWF0Y2hDYXNlYFxuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBtYXRjaENhc2U6IHRydWUgfSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdC8vIHNpbXVsYXRlIHR5cGluZyB0aGUgc2VhcmNoIHN0cmluZ1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbycgfSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOSwgMTQsIDksIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHQvLyBzaW11bGF0ZSB0b2dnbGluZyBvbiBgd2hvbGVXb3JkYFxuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyB3aG9sZVdvcmQ6IHRydWUgfSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdC8vIHNpbXVsYXRlIHRvZ2dsaW5nIG9mZiBgbWF0Y2hDYXNlYFxuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBtYXRjaENhc2U6IGZhbHNlIH0sIHRydWUpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdC8vIHNpbXVsYXRlIHRvZ2dsaW5nIG9mZiBgd2hvbGVXb3JkYFxuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyB3aG9sZVdvcmQ6IGZhbHNlIH0sIHRydWUpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0XHRbOSwgMTQsIDksIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHQvLyBzaW11bGF0ZSBhZGRpbmcgYSBzZWFyY2ggc2NvcGVcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU2NvcGU6IFtuZXcgUmFuZ2UoOCwgMSwgMTAsIDEpXSB9LCB0cnVlKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFx0WzksIDE0LCA5LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0Ly8gc2ltdWxhdGUgcmVtb3ZpbmcgdGhlIHNlYXJjaCBzY29wZVxuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTY29wZTogbnVsbCB9LCB0cnVlKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFx0WzksIDE0LCA5LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnZmluZCBtb2RlbCByZW1vdmVzIGl0cyBkZWNvcmF0aW9ucycsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ2hlbGxvJyB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc0NvdW50LCA1KTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFx0WzksIDE0LCA5LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtdXG5cdFx0KTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2ZpbmQgbW9kZWwgdXBkYXRlcyBzdGF0ZSBtYXRjaGVzQ291bnQnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbycgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNDb3VudCwgNSk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRcdFs5LCAxNCwgOSwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsb28nIH0sIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNDb3VudCwgMCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2ZpbmQgbW9kZWwgcmVhY3RzIHRvIHBvc2l0aW9uIGNoYW5nZScsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ2hlbGxvJyB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0XHRbOSwgMTQsIDksIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcignbW91c2UnLCBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5pZCwge1xuXHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbig2LCAyMClcblx0XHR9KTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAyMCwgNiwgMjBdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRcdFs5LCAxNCwgOSwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdIZWxsbycgfSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRcdFs5LCAxNCwgOSwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2ZpbmQgbW9kZWwgbmV4dCcsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ2hlbGxvJywgd2hvbGVXb3JkOiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdmaW5kIG1vZGVsIG5leHQgc3RheXMgaW4gc2NvcGUnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbycsIHdob2xlV29yZDogdHJ1ZSwgc2VhcmNoU2NvcGU6IFtuZXcgUmFuZ2UoNywgMSwgOSwgMSldIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ211bHRpLXNlbGVjdGlvbiBmaW5kIG1vZGVsIG5leHQgc3RheXMgaW4gc2NvcGUgKG92ZXJsYXApJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nLCB3aG9sZVdvcmQ6IHRydWUsIHNlYXJjaFNjb3BlOiBbbmV3IFJhbmdlKDcsIDEsIDgsIDIpLCBuZXcgUmFuZ2UoOCwgMSwgOSwgMSldIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ211bHRpLXNlbGVjdGlvbiBmaW5kIG1vZGVsIG5leHQgc3RheXMgaW4gc2NvcGUnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbycsIG1hdGNoQ2FzZTogdHJ1ZSwgd2hvbGVXb3JkOiBmYWxzZSwgc2VhcmNoU2NvcGU6IFtuZXcgUmFuZ2UoNiwgMSwgNywgMzgpLCBuZXcgUmFuZ2UoOSwgMywgOSwgMzgpXSB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHQvLyBgbWF0Y2hDYXNlOiBmYWxzZWAgd291bGRcblx0XHRcdFx0Ly8gZmluZCB0aGlzIG1hdGNoIGFzIHdlbGw6XG5cdFx0XHRcdC8vIFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0Ly8gYHdob2xlV29yZDogdHJ1ZWAgd291bGRcblx0XHRcdFx0Ly8gZXhjbHVkZSB0aGlzIG1hdGNoOlxuXHRcdFx0XHRbOSwgMTQsIDksIDE5XSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzksIDE0LCA5LCAxOV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs5LCAxNCwgOSwgMTldLFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzksIDE0LCA5LCAxOV0sXG5cdFx0XHRbOSwgMTQsIDksIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOSwgMTQsIDksIDE5XSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzksIDE0LCA5LCAxOV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2ZpbmQgbW9kZWwgcHJldicsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ2hlbGxvJywgd2hvbGVXb3JkOiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvUHJldk1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdmaW5kIG1vZGVsIHByZXYgc3RheXMgaW4gc2NvcGUnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbycsIHdob2xlV29yZDogdHJ1ZSwgc2VhcmNoU2NvcGU6IFtuZXcgUmFuZ2UoNywgMSwgOSwgMSldIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvUHJldk1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2ZpbmQgbW9kZWwgbmV4dC9wcmV2IHdpdGggbm8gbWF0Y2hlcycsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ2hlbGxvbycsIHdob2xlV29yZDogdHJ1ZSB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W11cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnZmluZCBtb2RlbCBuZXh0L3ByZXYgcmVzcGVjdHMgY3Vyc29yIHBvc2l0aW9uJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nLCB3aG9sZVdvcmQ6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcignbW91c2UnLCBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5pZCwge1xuXHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbig2LCAyMClcblx0XHR9KTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNiwgMjAsIDYsIDIwXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdmaW5kIF4nLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdeJywgaXNSZWdleDogdHJ1ZSB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdFx0WzIsIDEsIDIsIDFdLFxuXHRcdFx0XHRbMywgMSwgMywgMV0sXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzUsIDEsIDUsIDFdLFxuXHRcdFx0XHRbNiwgMSwgNiwgMV0sXG5cdFx0XHRcdFs3LCAxLCA3LCAxXSxcblx0XHRcdFx0WzgsIDEsIDgsIDFdLFxuXHRcdFx0XHRbOSwgMSwgOSwgMV0sXG5cdFx0XHRcdFsxMCwgMSwgMTAsIDFdLFxuXHRcdFx0XHRbMTEsIDEsIDExLCAxXSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMiwgMSwgMiwgMV0sXG5cdFx0XHRbMiwgMSwgMiwgMV0sXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdFx0WzIsIDEsIDIsIDFdLFxuXHRcdFx0XHRbMywgMSwgMywgMV0sXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzUsIDEsIDUsIDFdLFxuXHRcdFx0XHRbNiwgMSwgNiwgMV0sXG5cdFx0XHRcdFs3LCAxLCA3LCAxXSxcblx0XHRcdFx0WzgsIDEsIDgsIDFdLFxuXHRcdFx0XHRbOSwgMSwgOSwgMV0sXG5cdFx0XHRcdFsxMCwgMSwgMTAsIDFdLFxuXHRcdFx0XHRbMTEsIDEsIDExLCAxXSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMywgMSwgMywgMV0sXG5cdFx0XHRbMywgMSwgMywgMV0sXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdFx0WzIsIDEsIDIsIDFdLFxuXHRcdFx0XHRbMywgMSwgMywgMV0sXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzUsIDEsIDUsIDFdLFxuXHRcdFx0XHRbNiwgMSwgNiwgMV0sXG5cdFx0XHRcdFs3LCAxLCA3LCAxXSxcblx0XHRcdFx0WzgsIDEsIDgsIDFdLFxuXHRcdFx0XHRbOSwgMSwgOSwgMV0sXG5cdFx0XHRcdFsxMCwgMSwgMTAsIDFdLFxuXHRcdFx0XHRbMTEsIDEsIDExLCAxXSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2ZpbmQgJCcsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJyQnLCBpc1JlZ2V4OiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDE4LCAxLCAxOF0sXG5cdFx0XHRcdFsyLCAxOCwgMiwgMThdLFxuXHRcdFx0XHRbMywgMjAsIDMsIDIwXSxcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbNSwgMTMsIDUsIDEzXSxcblx0XHRcdFx0WzYsIDQzLCA2LCA0M10sXG5cdFx0XHRcdFs3LCA0MSwgNywgNDFdLFxuXHRcdFx0XHRbOCwgNDEsIDgsIDQxXSxcblx0XHRcdFx0WzksIDQwLCA5LCA0MF0sXG5cdFx0XHRcdFsxMCwgMiwgMTAsIDJdLFxuXHRcdFx0XHRbMTEsIDE3LCAxMSwgMTddLFxuXHRcdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxOCwgMSwgMThdLFxuXHRcdFx0WzEsIDE4LCAxLCAxOF0sXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxOCwgMSwgMThdLFxuXHRcdFx0XHRbMiwgMTgsIDIsIDE4XSxcblx0XHRcdFx0WzMsIDIwLCAzLCAyMF0sXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzUsIDEzLCA1LCAxM10sXG5cdFx0XHRcdFs2LCA0MywgNiwgNDNdLFxuXHRcdFx0XHRbNywgNDEsIDcsIDQxXSxcblx0XHRcdFx0WzgsIDQxLCA4LCA0MV0sXG5cdFx0XHRcdFs5LCA0MCwgOSwgNDBdLFxuXHRcdFx0XHRbMTAsIDIsIDEwLCAyXSxcblx0XHRcdFx0WzExLCAxNywgMTEsIDE3XSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMiwgMTgsIDIsIDE4XSxcblx0XHRcdFsyLCAxOCwgMiwgMThdLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMTgsIDEsIDE4XSxcblx0XHRcdFx0WzIsIDE4LCAyLCAxOF0sXG5cdFx0XHRcdFszLCAyMCwgMywgMjBdLFxuXHRcdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRcdFs1LCAxMywgNSwgMTNdLFxuXHRcdFx0XHRbNiwgNDMsIDYsIDQzXSxcblx0XHRcdFx0WzcsIDQxLCA3LCA0MV0sXG5cdFx0XHRcdFs4LCA0MSwgOCwgNDFdLFxuXHRcdFx0XHRbOSwgNDAsIDksIDQwXSxcblx0XHRcdFx0WzEwLCAyLCAxMCwgMl0sXG5cdFx0XHRcdFsxMSwgMTcsIDExLCAxN10sXG5cdFx0XHRcdFsxMiwgMSwgMTIsIDFdLFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzMsIDIwLCAzLCAyMF0sXG5cdFx0XHRbMywgMjAsIDMsIDIwXSxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDE4LCAxLCAxOF0sXG5cdFx0XHRcdFsyLCAxOCwgMiwgMThdLFxuXHRcdFx0XHRbMywgMjAsIDMsIDIwXSxcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbNSwgMTMsIDUsIDEzXSxcblx0XHRcdFx0WzYsIDQzLCA2LCA0M10sXG5cdFx0XHRcdFs3LCA0MSwgNywgNDFdLFxuXHRcdFx0XHRbOCwgNDEsIDgsIDQxXSxcblx0XHRcdFx0WzksIDQwLCA5LCA0MF0sXG5cdFx0XHRcdFsxMCwgMiwgMTAsIDJdLFxuXHRcdFx0XHRbMTEsIDE3LCAxMSwgMTddLFxuXHRcdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnZmluZCBuZXh0IF4kJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnXiQnLCBpc1JlZ2V4OiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFtcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxMiwgMSwgMTIsIDFdLFxuXHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2ZpbmQgLionLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICcuKicsIGlzUmVnZXg6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMSwgMThdLFxuXHRcdFx0XHRbMiwgMSwgMiwgMThdLFxuXHRcdFx0XHRbMywgMSwgMywgMjBdLFxuXHRcdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRcdFs1LCAxLCA1LCAxM10sXG5cdFx0XHRcdFs2LCAxLCA2LCA0M10sXG5cdFx0XHRcdFs3LCAxLCA3LCA0MV0sXG5cdFx0XHRcdFs4LCAxLCA4LCA0MV0sXG5cdFx0XHRcdFs5LCAxLCA5LCA0MF0sXG5cdFx0XHRcdFsxMCwgMSwgMTAsIDJdLFxuXHRcdFx0XHRbMTEsIDEsIDExLCAxN10sXG5cdFx0XHRcdFsxMiwgMSwgMTIsIDFdLFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdmaW5kIG5leHQgXi4qJCcsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ14uKiQnLCBpc1JlZ2V4OiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDE4XSxcblx0XHRcdFx0WzIsIDEsIDIsIDE4XSxcblx0XHRcdFx0WzMsIDEsIDMsIDIwXSxcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbNSwgMSwgNSwgMTNdLFxuXHRcdFx0XHRbNiwgMSwgNiwgNDNdLFxuXHRcdFx0XHRbNywgMSwgNywgNDFdLFxuXHRcdFx0XHRbOCwgMSwgOCwgNDFdLFxuXHRcdFx0XHRbOSwgMSwgOSwgNDBdLFxuXHRcdFx0XHRbMTAsIDEsIDEwLCAyXSxcblx0XHRcdFx0WzExLCAxLCAxMSwgMTddLFxuXHRcdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxOF0sXG5cdFx0XHRbMSwgMSwgMSwgMThdLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMSwgMThdLFxuXHRcdFx0XHRbMiwgMSwgMiwgMThdLFxuXHRcdFx0XHRbMywgMSwgMywgMjBdLFxuXHRcdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRcdFs1LCAxLCA1LCAxM10sXG5cdFx0XHRcdFs2LCAxLCA2LCA0M10sXG5cdFx0XHRcdFs3LCAxLCA3LCA0MV0sXG5cdFx0XHRcdFs4LCAxLCA4LCA0MV0sXG5cdFx0XHRcdFs5LCAxLCA5LCA0MF0sXG5cdFx0XHRcdFsxMCwgMSwgMTAsIDJdLFxuXHRcdFx0XHRbMTEsIDEsIDExLCAxN10sXG5cdFx0XHRcdFsxMiwgMSwgMTIsIDFdLFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzIsIDEsIDIsIDE4XSxcblx0XHRcdFsyLCAxLCAyLCAxOF0sXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAxLCAxOF0sXG5cdFx0XHRcdFsyLCAxLCAyLCAxOF0sXG5cdFx0XHRcdFszLCAxLCAzLCAyMF0sXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzUsIDEsIDUsIDEzXSxcblx0XHRcdFx0WzYsIDEsIDYsIDQzXSxcblx0XHRcdFx0WzcsIDEsIDcsIDQxXSxcblx0XHRcdFx0WzgsIDEsIDgsIDQxXSxcblx0XHRcdFx0WzksIDEsIDksIDQwXSxcblx0XHRcdFx0WzEwLCAxLCAxMCwgMl0sXG5cdFx0XHRcdFsxMSwgMSwgMTEsIDE3XSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2ZpbmQgcHJldiBeLiokJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnXi4qJCcsIGlzUmVnZXg6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMSwgMThdLFxuXHRcdFx0XHRbMiwgMSwgMiwgMThdLFxuXHRcdFx0XHRbMywgMSwgMywgMjBdLFxuXHRcdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRcdFs1LCAxLCA1LCAxM10sXG5cdFx0XHRcdFs2LCAxLCA2LCA0M10sXG5cdFx0XHRcdFs3LCAxLCA3LCA0MV0sXG5cdFx0XHRcdFs4LCAxLCA4LCA0MV0sXG5cdFx0XHRcdFs5LCAxLCA5LCA0MF0sXG5cdFx0XHRcdFsxMCwgMSwgMTAsIDJdLFxuXHRcdFx0XHRbMTEsIDEsIDExLCAxN10sXG5cdFx0XHRcdFsxMiwgMSwgMTIsIDFdLFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvUHJldk1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDE4XSxcblx0XHRcdFx0WzIsIDEsIDIsIDE4XSxcblx0XHRcdFx0WzMsIDEsIDMsIDIwXSxcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbNSwgMSwgNSwgMTNdLFxuXHRcdFx0XHRbNiwgMSwgNiwgNDNdLFxuXHRcdFx0XHRbNywgMSwgNywgNDFdLFxuXHRcdFx0XHRbOCwgMSwgOCwgNDFdLFxuXHRcdFx0XHRbOSwgMSwgOSwgNDBdLFxuXHRcdFx0XHRbMTAsIDEsIDEwLCAyXSxcblx0XHRcdFx0WzExLCAxLCAxMSwgMTddLFxuXHRcdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxMSwgMSwgMTEsIDE3XSxcblx0XHRcdFsxMSwgMSwgMTEsIDE3XSxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDE4XSxcblx0XHRcdFx0WzIsIDEsIDIsIDE4XSxcblx0XHRcdFx0WzMsIDEsIDMsIDIwXSxcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbNSwgMSwgNSwgMTNdLFxuXHRcdFx0XHRbNiwgMSwgNiwgNDNdLFxuXHRcdFx0XHRbNywgMSwgNywgNDFdLFxuXHRcdFx0XHRbOCwgMSwgOCwgNDFdLFxuXHRcdFx0XHRbOSwgMSwgOSwgNDBdLFxuXHRcdFx0XHRbMTAsIDEsIDEwLCAyXSxcblx0XHRcdFx0WzExLCAxLCAxMSwgMTddLFxuXHRcdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnZmluZCBwcmV2IF4kJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnXiQnLCBpc1JlZ2V4OiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxMiwgMSwgMTIsIDFdLFxuXHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzEyLCAxLCAxMiwgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMTIsIDEsIDEyLCAxXSxcblx0XHRcdFsxMiwgMSwgMTIsIDFdLFxuXHRcdFx0W1xuXHRcdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRcdFsxMiwgMSwgMTIsIDFdLFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdyZXBsYWNlIGhlbGxvJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nLCByZXBsYWNlU3RyaW5nOiAnaGknLCB3aG9sZVdvcmQ6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcignbW91c2UnLCBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5pZCwge1xuXHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbig2LCAyMClcblx0XHR9KTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNiwgMjAsIDYsIDIwXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDYpLCAnICAgIGNvdXQgPDwgXCJoZWxsbyB3b3JsZCwgSGVsbG8hXCIgPDwgZW5kbDsnKTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNiksICcgICAgY291dCA8PCBcImhlbGxvIHdvcmxkLCBIZWxsbyFcIiA8PCBlbmRsOycpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDYpLCAnICAgIGNvdXQgPDwgXCJoZWxsbyB3b3JsZCwgaGkhXCIgPDwgZW5kbDsnKTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDcpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZSgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDgpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZSgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNiwgNiwgMTZdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDYpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCwgaGkhXCIgPDwgZW5kbDsnKTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ3JlcGxhY2UgYmxhJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnYmxhJywgcmVwbGFjZVN0cmluZzogJ2NpYW8nIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzExLCA0LCAxMSwgN10sXG5cdFx0XHRcdFsxMSwgNywgMTEsIDEwXSxcblx0XHRcdFx0WzExLCAxMCwgMTEsIDEzXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZSgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxMSwgNCwgMTEsIDddLFxuXHRcdFx0WzExLCA0LCAxMSwgN10sXG5cdFx0XHRbXG5cdFx0XHRcdFsxMSwgNCwgMTEsIDddLFxuXHRcdFx0XHRbMTEsIDcsIDExLCAxMF0sXG5cdFx0XHRcdFsxMSwgMTAsIDExLCAxM11cblx0XHRcdF1cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoMTEpLCAnLy8gYmxhYmxhYmxhY2lhbycpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMTEsIDgsIDExLCAxMV0sXG5cdFx0XHRbMTEsIDgsIDExLCAxMV0sXG5cdFx0XHRbXG5cdFx0XHRcdFsxMSwgOCwgMTEsIDExXSxcblx0XHRcdFx0WzExLCAxMSwgMTEsIDE0XVxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCgxMSksICcvLyBjaWFvYmxhYmxhY2lhbycpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMTEsIDEyLCAxMSwgMTVdLFxuXHRcdFx0WzExLCAxMiwgMTEsIDE1XSxcblx0XHRcdFtcblx0XHRcdFx0WzExLCAxMiwgMTEsIDE1XVxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCgxMSksICcvLyBjaWFvY2lhb2JsYWNpYW8nKTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzExLCAxNiwgMTEsIDE2XSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCgxMSksICcvLyBjaWFvY2lhb2NpYW9jaWFvJyk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdyZXBsYWNlQWxsIGhlbGxvJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nLCByZXBsYWNlU3RyaW5nOiAnaGknLCB3aG9sZVdvcmQ6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcignbW91c2UnLCBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5pZCwge1xuXHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbig2LCAyMClcblx0XHR9KTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNiwgMjAsIDYsIDIwXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNiwgMjcsIDYsIDMyXSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDYpLCAnICAgIGNvdXQgPDwgXCJoZWxsbyB3b3JsZCwgSGVsbG8hXCIgPDwgZW5kbDsnKTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlQWxsKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDE3LCA2LCAxN10sXG5cdFx0XHRudWxsLFxuXHRcdFx0W11cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNiksICcgICAgY291dCA8PCBcImhpIHdvcmxkLCBoaSFcIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNyksICcgICAgY291dCA8PCBcImhpIHdvcmxkIGFnYWluXCIgPDwgZW5kbDsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDgpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdyZXBsYWNlQWxsIHR3byBzcGFjZXMgd2l0aCBvbmUgc3BhY2UnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICcgICcsIHJlcGxhY2VTdHJpbmc6ICcgJyB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxLCA2LCAzXSxcblx0XHRcdFx0WzYsIDMsIDYsIDVdLFxuXHRcdFx0XHRbNywgMSwgNywgM10sXG5cdFx0XHRcdFs3LCAzLCA3LCA1XSxcblx0XHRcdFx0WzgsIDEsIDgsIDNdLFxuXHRcdFx0XHRbOCwgMywgOCwgNV0sXG5cdFx0XHRcdFs5LCAxLCA5LCAzXSxcblx0XHRcdFx0WzksIDMsIDksIDVdXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlQWxsKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDEsIDYsIDNdLFxuXHRcdFx0XHRbNywgMSwgNywgM10sXG5cdFx0XHRcdFs4LCAxLCA4LCAzXSxcblx0XHRcdFx0WzksIDEsIDksIDNdXG5cdFx0XHRdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDYpLCAnICBjb3V0IDw8IFwiaGVsbG8gd29ybGQsIEhlbGxvIVwiIDw8IGVuZGw7Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg3KSwgJyAgY291dCA8PCBcImhlbGxvIHdvcmxkIGFnYWluXCIgPDwgZW5kbDsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDgpLCAnICBjb3V0IDw8IFwiSGVsbG8gd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoOSksICcgIGNvdXQgPDwgXCJoZWxsb3dvcmxkIGFnYWluXCIgPDwgZW5kbDsnKTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ3JlcGxhY2VBbGwgYmxhJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnYmxhJywgcmVwbGFjZVN0cmluZzogJ2NpYW8nIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzExLCA0LCAxMSwgN10sXG5cdFx0XHRcdFsxMSwgNywgMTEsIDEwXSxcblx0XHRcdFx0WzExLCAxMCwgMTEsIDEzXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZUFsbCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCgxMSksICcvLyBjaWFvY2lhb2NpYW9jaWFvJyk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdyZXBsYWNlQWxsIGJsYSB3aXRoIFxcXFx0XFxcXG4nLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdibGEnLCByZXBsYWNlU3RyaW5nOiAnPFxcXFxuXFxcXHQ+JywgaXNSZWdleDogdHJ1ZSB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxMSwgNCwgMTEsIDddLFxuXHRcdFx0XHRbMTEsIDcsIDExLCAxMF0sXG5cdFx0XHRcdFsxMSwgMTAsIDExLCAxM11cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2VBbGwoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W11cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoMTEpLCAnLy8gPCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoMTIpLCAnXFx0PjwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDEzKSwgJ1xcdD48Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCgxNCksICdcXHQ+Y2lhbycpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnaXNzdWUgIzM1MTY6IFwicmVwbGFjZSBhbGxcIiBtb3ZlcyBwYWdlL2N1cnNvci9mb2N1cy9zY3JvbGwgdG8gdGhlIHBsYWNlIG9mIHRoZSBsYXN0IHJlcGxhY2VtZW50JywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaW5jbHVkZScsIHJlcGxhY2VTdHJpbmc6ICdiYXInIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzIsIDIsIDIsIDldLFxuXHRcdFx0XHRbMywgMiwgMywgOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2VBbGwoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W11cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCgyKSwgJyNiYXIgXCJjb29sLmhcIicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoMyksICcjYmFyIDxpb3N0cmVhbT4nKTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2xpc3RlbnMgdG8gbW9kZWwgY29udGVudCBjaGFuZ2VzJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nLCByZXBsYWNlU3RyaW5nOiAnaGknLCB3aG9sZVdvcmQ6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRlZGl0b3IuZ2V0TW9kZWwoKSEuc2V0VmFsdWUoJ2hlbGxvXFxuaGknKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W11cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnc2VsZWN0QWxsTWF0Y2hlcycsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ2hlbGxvJywgcmVwbGFjZVN0cmluZzogJ2hpJywgd2hvbGVXb3JkOiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLnNlbGVjdEFsbE1hdGNoZXMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubWFwKHMgPT4gcy50b1N0cmluZygpKSwgW1xuXHRcdFx0bmV3IFNlbGVjdGlvbig2LCAxNCwgNiwgMTkpLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig2LCAyNywgNiwgMzIpLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig3LCAxNCwgNywgMTkpLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig4LCAxNCwgOCwgMTkpXG5cdFx0XS5tYXAocyA9PiBzLnRvU3RyaW5nKCkpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnaXNzdWUgIzE0MTQzIHNlbGVjdEFsbE1hdGNoZXMgc2hvdWxkIG1haW50YWluIHByaW1hcnkgY3Vyc29yIGlmIGZlYXNpYmxlJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nLCByZXBsYWNlU3RyaW5nOiAnaGknLCB3aG9sZVdvcmQ6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBSYW5nZSg3LCAxNCwgNywgMTkpKTtcblxuXHRcdGZpbmRNb2RlbC5zZWxlY3RBbGxNYXRjaGVzKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLm1hcChzID0+IHMudG9TdHJpbmcoKSksIFtcblx0XHRcdG5ldyBTZWxlY3Rpb24oNywgMTQsIDcsIDE5KSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgMTQsIDYsIDE5KSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgMjcsIDYsIDMyKSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oOCwgMTQsIDgsIDE5KVxuXHRcdF0ubWFwKHMgPT4gcy50b1N0cmluZygpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb24oKSEudG9TdHJpbmcoKSwgbmV3IFNlbGVjdGlvbig3LCAxNCwgNywgMTkpLnRvU3RyaW5nKCkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdpc3N1ZSAjMTkxNDogTlBFIHdoZW4gdGhlcmUgaXMgb25seSBvbmUgZmluZCBtYXRjaCcsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ2Nvb2wuaCcgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMiwgMTEsIDIsIDE3XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzIsIDExLCAyLCAxN10sXG5cdFx0XHRbMiwgMTEsIDIsIDE3XSxcblx0XHRcdFtcblx0XHRcdFx0WzIsIDExLCAyLCAxN11cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsyLCAxMSwgMiwgMTddLFxuXHRcdFx0WzIsIDExLCAyLCAxN10sXG5cdFx0XHRbXG5cdFx0XHRcdFsyLCAxMSwgMiwgMTddXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ3JlcGxhY2Ugd2hlbiBzZWFyY2ggc3RyaW5nIGhhcyBsb29rIGFoZWQgcmVnZXgnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbyg/PVxcXFxzd29ybGQpJywgcmVwbGFjZVN0cmluZzogJ2hpJywgaXNSZWdleDogdHJ1ZSB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAxNCwgNiwgMTldLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNiksICcgICAgY291dCA8PCBcImhlbGxvIHdvcmxkLCBIZWxsbyFcIiA8PCBlbmRsOycpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNiksICcgICAgY291dCA8PCBcImhpIHdvcmxkLCBIZWxsbyFcIiA8PCBlbmRsOycpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg3KSwgJyAgICBjb3V0IDw8IFwiaGkgd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbOCwgMTYsIDgsIDE2XSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg4KSwgJyAgICBjb3V0IDw8IFwiaGkgd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgncmVwbGFjZSB3aGVuIHNlYXJjaCBzdHJpbmcgaGFzIGxvb2sgYWhlZCByZWdleCBhbmQgY3Vyc29yIGlzIGF0IHRoZSBsYXN0IGZpbmQgbWF0Y2gnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbyg/PVxcXFxzd29ybGQpJywgcmVwbGFjZVN0cmluZzogJ2hpJywgaXNSZWdleDogdHJ1ZSB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGVkaXRvci50cmlnZ2VyKCdtb3VzZScsIENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLmlkLCB7XG5cdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDgsIDE0KVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzgsIDE0LCA4LCAxNF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlKCk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFs4LCAxNCwgOCwgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoOCksICcgICAgY291dCA8PCBcIkhlbGxvIHdvcmxkIGFnYWluXCIgPDwgZW5kbDsnKTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg4KSwgJyAgICBjb3V0IDw8IFwiaGkgd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0W1xuXHRcdFx0XHRbNywgMTQsIDcsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg2KSwgJyAgICBjb3V0IDw8IFwiaGkgd29ybGQsIEhlbGxvIVwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZSgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs3LCAxNiwgNywgMTZdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDcpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdyZXBsYWNlQWxsIHdoZW4gc2VhcmNoIHN0cmluZyBoYXMgbG9vayBhaGVkIHJlZ2V4JywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8oPz1cXFxcc3dvcmxkKScsIHJlcGxhY2VTdHJpbmc6ICdoaScsIGlzUmVnZXg6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs4LCAxNCwgOCwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlQWxsKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDYpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCwgSGVsbG8hXCIgPDwgZW5kbDsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDcpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg4KSwgJyAgICBjb3V0IDw8IFwiaGkgd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ3JlcGxhY2Ugd2hlbiBzZWFyY2ggc3RyaW5nIGhhcyBsb29rIGFoZWQgcmVnZXggYW5kIHJlcGxhY2Ugc3RyaW5nIGhhcyBjYXB0dXJpbmcgZ3JvdXBzJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsKGxvKSg/PVxcXFxzd29ybGQpJywgcmVwbGFjZVN0cmluZzogJ2hpJDEnLCBpc1JlZ2V4OiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZSgpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg2KSwgJyAgICBjb3V0IDw8IFwiaGVsbG8gd29ybGQsIEhlbGxvIVwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZSgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRbXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg2KSwgJyAgICBjb3V0IDw8IFwiaGlsbyB3b3JsZCwgSGVsbG8hXCIgPDwgZW5kbDsnKTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRbOCwgMTQsIDgsIDE5XSxcblx0XHRcdFtcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNyksICcgICAgY291dCA8PCBcImhpbG8gd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXG5cdFx0ZmluZE1vZGVsLnJlcGxhY2UoKTtcblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbOCwgMTgsIDgsIDE4XSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg4KSwgJyAgICBjb3V0IDw8IFwiaGlsbyB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdyZXBsYWNlQWxsIHdoZW4gc2VhcmNoIHN0cmluZyBoYXMgbG9vayBhaGVkIHJlZ2V4IGFuZCByZXBsYWNlIHN0cmluZyBoYXMgY2FwdHVyaW5nIGdyb3VwcycsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ3dvKHJsKWQoPz0uKjskKScsIHJlcGxhY2VTdHJpbmc6ICdnaSQxJywgaXNSZWdleDogdHJ1ZSB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFs2LCAyMCwgNiwgMjVdLFxuXHRcdFx0XHRbNywgMjAsIDcsIDI1XSxcblx0XHRcdFx0WzgsIDIwLCA4LCAyNV0sXG5cdFx0XHRcdFs5LCAxOSwgOSwgMjRdXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlQWxsKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDYpLCAnICAgIGNvdXQgPDwgXCJoZWxsbyBnaXJsLCBIZWxsbyFcIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNyksICcgICAgY291dCA8PCBcImhlbGxvIGdpcmwgYWdhaW5cIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoOCksICcgICAgY291dCA8PCBcIkhlbGxvIGdpcmwgYWdhaW5cIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoOSksICcgICAgY291dCA8PCBcImhlbGxvZ2lybCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W11cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgncmVwbGFjZUFsbCB3aGVuIHNlYXJjaCBzdHJpbmcgaXMgbXVsdGlsaW5lIGFuZCBoYXMgbG9vayBhaGVkIHJlZ2V4IGFuZCByZXBsYWNlIHN0cmluZyBoYXMgY2FwdHVyaW5nIGdyb3VwcycsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ3dvKHJsKWQoLio7XFxcXG4pKD89LipoZWxsbyknLCByZXBsYWNlU3RyaW5nOiAnZ2kkMSQyJywgaXNSZWdleDogdHJ1ZSwgbWF0Y2hDYXNlOiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDIwLCA3LCAxXSxcblx0XHRcdFx0WzgsIDIwLCA5LCAxXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZUFsbCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg2KSwgJyAgICBjb3V0IDw8IFwiaGVsbG8gZ2lybCwgSGVsbG8hXCIgPDwgZW5kbDsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDgpLCAnICAgIGNvdXQgPDwgXCJIZWxsbyBnaXJsIGFnYWluXCIgPDwgZW5kbDsnKTtcblxuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdyZXBsYWNlQWxsIHByZXNlcnZpbmcgY2FzZScsIChlZGl0b3IpID0+IHtcblx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ2hlbGxvJywgcmVwbGFjZVN0cmluZzogJ2dvb2RieWUnLCBpc1JlZ2V4OiBmYWxzZSwgbWF0Y2hDYXNlOiBmYWxzZSwgcHJlc2VydmVDYXNlOiB0cnVlIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzYsIDE0LCA2LCAxOV0sXG5cdFx0XHRcdFs2LCAyNywgNiwgMzJdLFxuXHRcdFx0XHRbNywgMTQsIDcsIDE5XSxcblx0XHRcdFx0WzgsIDE0LCA4LCAxOV0sXG5cdFx0XHRcdFs5LCAxNCwgOSwgMTldLFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZUFsbCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg2KSwgJyAgICBjb3V0IDw8IFwiZ29vZGJ5ZSB3b3JsZCwgR29vZGJ5ZSFcIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoNyksICcgICAgY291dCA8PCBcImdvb2RieWUgd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoOCksICcgICAgY291dCA8PCBcIkdvb2RieWUgd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoOSksICcgICAgY291dCA8PCBcImdvb2RieWV3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W11cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnaXNzdWUgIzE4NzExIHJlcGxhY2VBbGwgd2l0aCBlbXB0eSBzdHJpbmcnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbycsIHJlcGxhY2VTdHJpbmc6ICcnLCB3aG9sZVdvcmQ6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzYsIDI3LCA2LCAzMl0sXG5cdFx0XHRcdFs3LCAxNCwgNywgMTldLFxuXHRcdFx0XHRbOCwgMTQsIDgsIDE5XVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZUFsbCgpO1xuXHRcdGFzc2VydEZpbmRTdGF0ZShcblx0XHRcdGVkaXRvcixcblx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdG51bGwsXG5cdFx0XHRbXVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg2KSwgJyAgICBjb3V0IDw8IFwiIHdvcmxkLCAhXCIgPDwgZW5kbDsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDcpLCAnICAgIGNvdXQgPDwgXCIgd29ybGQgYWdhaW5cIiA8PCBlbmRsOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoOCksICcgICAgY291dCA8PCBcIiB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdpc3N1ZSAjMzI1MjIgcmVwbGFjZUFsbCB3aXRoIF4gb24gbW9yZSB0aGFuIDEwMDAgbWF0Y2hlcycsIChlZGl0b3IpID0+IHtcblx0XHRsZXQgaW5pdGlhbFRleHQgPSAnJztcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDExMDA7IGkrKykge1xuXHRcdFx0aW5pdGlhbFRleHQgKz0gJ2xpbmUnICsgaSArICdcXG4nO1xuXHRcdH1cblx0XHRlZGl0b3IuZ2V0TW9kZWwoKSEuc2V0VmFsdWUoaW5pdGlhbFRleHQpO1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnXicsIHJlcGxhY2VTdHJpbmc6ICdhICcsIGlzUmVnZXg6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRmaW5kTW9kZWwucmVwbGFjZUFsbCgpO1xuXG5cdFx0bGV0IGV4cGVjdGVkVGV4dCA9ICcnO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTEwMDsgaSsrKSB7XG5cdFx0XHRleHBlY3RlZFRleHQgKz0gJ2EgbGluZScgKyBpICsgJ1xcbic7XG5cdFx0fVxuXHRcdGV4cGVjdGVkVGV4dCArPSAnYSAnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWUoKSwgZXhwZWN0ZWRUZXh0KTtcblxuXHRcdGZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZmluZFN0YXRlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZmluZFRlc3QoJ2lzc3VlICMxOTc0MCBGaW5kIGFuZCByZXBsYWNlIGNhcHR1cmUgZ3JvdXAvYmFja3JlZmVyZW5jZSBpbnNlcnRzIGB1bmRlZmluZWRgIGluc3RlYWQgb2YgZW1wdHkgc3RyaW5nJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8oeik/JywgcmVwbGFjZVN0cmluZzogJ2hpJDEnLCBpc1JlZ2V4OiB0cnVlLCBtYXRjaENhc2U6IHRydWUgfSwgZmFsc2UpO1xuXHRcdGNvbnN0IGZpbmRNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRhc3NlcnRGaW5kU3RhdGUoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbNiwgMTQsIDYsIDE5XSxcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV0sXG5cdFx0XHRcdFs5LCAxNCwgOSwgMTldXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGZpbmRNb2RlbC5yZXBsYWNlQWxsKCk7XG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtdXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDYpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCwgSGVsbG8hXCIgPDwgZW5kbDsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb250ZW50KDcpLCAnICAgIGNvdXQgPDwgXCJoaSB3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudCg5KSwgJyAgICBjb3V0IDw8IFwiaGl3b3JsZCBhZ2FpblwiIDw8IGVuZGw7Jyk7XG5cblx0XHRmaW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdGZpbmRTdGF0ZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGZpbmRUZXN0KCdpc3N1ZSAjMjcwODMuIHNlYXJjaCBzY29wZSB3b3JrcyBldmVuIGlmIGl0IGlzIGEgc2luZ2xlIGxpbmUnLCAoZWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgZmluZFN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdoZWxsbycsIHdob2xlV29yZDogdHJ1ZSwgc2VhcmNoU2NvcGU6IFtuZXcgUmFuZ2UoNywgMSwgOCwgMSldIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0RmluZFN0YXRlKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0bnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzcsIDE0LCA3LCAxOV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0ZmluZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRmaW5kU3RhdGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmaW5kVGVzdCgnaXNzdWUgIzM1MTY6IENvbnRyb2wgYmVoYXZpb3Igb2YgXCJOZXh0XCIgb3BlcmF0aW9ucyAobm90IGxvb3BpbmcgYmFjayB0byBiZWdpbm5pbmcpJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nLCBsb29wOiBmYWxzZSB9LCBmYWxzZSk7XG5cdFx0Y29uc3QgZmluZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwoZWRpdG9yLCBmaW5kU3RhdGUpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc0NvdW50LCA1KTtcblxuXHRcdC8vIFRlc3QgbmV4dCBvcGVyYXRpb25zXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCBmYWxzZSk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCB0cnVlKTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgdHJ1ZSk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCB0cnVlKTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgdHJ1ZSk7XG5cblx0XHQvLyBUZXN0IHByZXZpb3VzIG9wZXJhdGlvbnNcblx0XHRmaW5kTW9kZWwubW92ZVRvUHJldk1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCB0cnVlKTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgdHJ1ZSk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvUHJldk1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIGZhbHNlKTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgZmFsc2UpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCBmYWxzZSk7XG5cblx0fSk7XG5cblx0ZmluZFRlc3QoJ2lzc3VlICMzNTE2OiBDb250cm9sIGJlaGF2aW9yIG9mIFwiTmV4dFwiIG9wZXJhdGlvbnMgKGxvb3BpbmcgYmFjayB0byBiZWdpbm5pbmcpJywgKGVkaXRvcikgPT4ge1xuXHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZSgpKTtcblx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nIH0sIGZhbHNlKTtcblx0XHRjb25zdCBmaW5kTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbChlZGl0b3IsIGZpbmRTdGF0ZSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzQ291bnQsIDUpO1xuXG5cdFx0Ly8gVGVzdCBuZXh0IG9wZXJhdGlvbnNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgdHJ1ZSk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCB0cnVlKTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgdHJ1ZSk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb05leHRNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCB0cnVlKTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgdHJ1ZSk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdFx0Ly8gVGVzdCBwcmV2aW91cyBvcGVyYXRpb25zXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCB0cnVlKTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgdHJ1ZSk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvUHJldk1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdFx0ZmluZE1vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc1Bvc2l0aW9uLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlRm9yd2FyZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmNhbk5hdmlnYXRlQmFjaygpLCB0cnVlKTtcblxuXHRcdGZpbmRNb2RlbC5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNQb3NpdGlvbiwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSwgdHJ1ZSk7XG5cblx0XHRmaW5kTW9kZWwubW92ZVRvUHJldk1hdGNoKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuY2FuTmF2aWdhdGVCYWNrKCksIHRydWUpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyODg1MTU6IFdyb25nIGN1cnJlbnQgaW5kZXggaW4gZmluZCB3aWRnZXQgaWYgbWF0Y2hlcyA+IDEwMDAnLCAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIDEwMDEgbGluZXMgb2YgJ2hlbGxvJ1xuXHRcdGNvbnN0IHRleHRBcnIgPSBBcnJheSgxMDAxKS5maWxsKCdoZWxsbycpO1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcih0ZXh0QXJyLCB7fSwgKF9lZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IF9lZGl0b3IgYXMgSUFjdGl2ZUNvZGVFZGl0b3I7XG5cblx0XHRcdC8vIFBsYWNlIGN1cnNvciBhdCBsaW5lIDkwMCwgc2VsZWN0aW5nICdoZWxsbydcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig5MDAsIDEsIDkwMCwgNikpO1xuXG5cdFx0XHRjb25zdCBmaW5kU3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnaGVsbG8nIH0sIGZhbHNlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKGVkaXRvciwgZmluZFN0YXRlKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUubWF0Y2hlc0NvdW50LCAxMDAxKTtcblx0XHRcdC8vIFdpdGggY3Vyc29yIHNlbGVjdGluZyAnaGVsbG8nIGF0IGxpbmUgOTAwLCBtYXRjaGVzUG9zaXRpb24gc2hvdWxkIGJlIDkwMFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5tYXRjaGVzUG9zaXRpb24sIDkwMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFFbkMsTUFBTSxhQUFhLE1BQU07QUFFeEIsTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLGtCQUFjLElBQUksZ0JBQWdCO0FBQUEsRUFDbkMsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLGdCQUFZLFFBQVE7QUFBQSxFQUNyQixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLFdBQVMsU0FBUyxVQUFrQixVQUFxRDtBQUN4RixTQUFLLFVBQVUsTUFBTTtBQUNwQixZQUFNLFVBQVU7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQ0EseUJBQW1CLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxTQUFTLE1BQTJCLENBQUM7QUFFakYsWUFBTSxPQUFPLFFBQVEsS0FBSyxJQUFJO0FBQzlCLFlBQU0sWUFBWSxJQUFJLDJCQUEyQjtBQUNqRCxnQkFBVSxZQUFZLEtBQUss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QUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFHQSxjQUFVLE9BQU8sRUFBRSxXQUFXLEtBQUssR0FBRyxJQUFJO0FBQzFDO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBR0EsY0FBVSxPQUFPLEVBQUUsV0FBVyxNQUFNLEdBQUcsSUFBSTtBQUMzQztBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYjtBQUFBLFFBQ0MsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFHQSxjQUFVLE9BQU8sRUFBRSxXQUFXLE1BQU0sR0FBRyxJQUFJO0FBQzNDO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFB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QUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsUUFBUTtBQUNsQixjQUFVLFFBQVE7QUFBQSxFQUNuQixDQUFDO0FBRUQsV0FBUyxrQ0FBa0MsQ0FBQyxXQUFXO0FBQ3RELFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSxpQkFBaUIsQ0FBQztBQUN4RCxjQUFVLE9BQU8sRUFBRSxjQUFjLFNBQVMsV0FBVyxNQUFNLGFBQWEsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEVBQUUsR0FBRyxLQUFLO0FBQ3hHLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSw0QkFBNEIsUUFBUSxTQUFTLENBQUM7QUFFcEY7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLFFBQ0MsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxjQUFVLGdCQUFnQjtBQUMxQjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYjtBQUFBLFFBQ0MsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsUUFBUTtBQUNsQixjQUFVLFFBQVE7QUFBQSxFQUNuQixDQUFDO0FBRUQsV0FBUyw0REFBNEQsQ0FBQyxXQUFXO0FBQ2hGLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSxpQkFBaUIsQ0FBQztBQUN4RCxjQUFVLE9BQU8sRUFBRSxjQUFjLFNBQVMsV0FBVyxNQUFNLGFBQWEsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLEtBQUs7QUFDL0gsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLDRCQUE0QixRQUFRLFNBQVMsQ0FBQztBQUVwRjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ1g7QUFBQSxNQUNBO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxjQUFVLGdCQUFnQjtBQUMxQjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYjtBQUFBLFFBQ0MsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxRQUFRO0FBQ2xCLGNBQVUsUUFBUTtBQUFBLEVBQ25CLENBQUM7QUFFRCxXQUFTLGtEQUFrRCxDQUFDLFdBQVc7QUFDdEUsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLGlCQUFpQixDQUFDO0FBQ3hELGNBQVUsT0FBTyxFQUFFLGNBQWMsU0FBUyxXQUFXLE1BQU0sV0FBVyxPQUFPLGFBQWEsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEtBQUs7QUFDbkosVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLDRCQUE0QixRQUFRLFNBQVMsQ0FBQztBQUVwRjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ1g7QUFBQSxNQUNBO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUliLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBO0FBQUE7QUFBQSxRQUdiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxjQUFVLGdCQUFnQjtBQUMxQjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYjtBQUFBLFFBQ0MsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsUUFBUTtBQUNsQixjQUFVLFFBQVE7QUFBQSxFQUNuQixDQUFDO0FBRUQsV0FBUyxtQkFBbUIsQ0FBQyxXQUFXO0FBQ3ZDLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSxpQkFBaUIsQ0FBQztBQUN4RCxjQUFVLE9BQU8sRUFBRSxjQUFjLFNBQVMsV0FBVyxLQUFLLEdBQUcsS0FBSztBQUNsRSxVQUFNLFlBQVksWUFBWSxJQUFJLElBQUksNEJBQTRCLFFBQVEsU0FBUyxDQUFDO0FBRXBGO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxRQUFRO0FBQ2xCLGNBQVUsUUFBUTtBQUFBLEVBQ25CLENBQUM7QUFFRCxXQUFTLGtDQUFrQyxDQUFDLFdBQVc7QUFDdEQsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLGlCQUFpQixDQUFDO0FBQ3hELGNBQVUsT0FBTyxFQUFFLGNBQWMsU0FBUyxXQUFXLE1BQU0sYUFBYSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLEtBQUs7QUFDeEcsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLDRCQUE0QixRQUFRLFNBQVMsQ0FBQztBQUVwRjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ1g7QUFBQSxNQUNBO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxjQUFVLGdCQUFnQjtBQUMxQjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYjtBQUFBLFFBQ0MsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxRQUFRO0FBQ2xCLGNBQVUsUUFBUTtBQUFBLEVBQ25CLENBQUM7QUFFRCxXQUFTLHdDQUF3QyxDQUFDLFdBQVc7QUFDNUQsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLGlCQUFpQixDQUFDO0FBQ3hELGNBQVUsT0FBTyxFQUFFLGNBQWMsVUFBVSxXQUFXLEtBQUssR0FBRyxLQUFLO0FBQ25FLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSw0QkFBNEIsUUFBUSxTQUFTLENBQUM7QUFFcEY7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNYO0FBQUEsTUFDQSxDQUFDO0FBQUEsSUFDRjtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWDtBQUFBLE1BQ0EsQ0FBQztBQUFBLElBQ0Y7QUFFQSxjQUFVLGdCQUFnQjtBQUMxQjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ1g7QUFBQSxNQUNBLENBQUM7QUFBQSxJQUNGO0FBRUEsY0FBVSxRQUFRO0FBQ2xCLGNBQVUsUUFBUTtBQUFBLEVBQ25CLENBQUM7QUFFRCxXQUFTLGlEQUFpRCxDQUFDLFdBQVc7QUFDckUsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLGlCQUFpQixDQUFDO0FBQ3hELGNBQVUsT0FBTyxFQUFFLGNBQWMsU0FBUyxXQUFXLEtBQUssR0FBRyxLQUFLO0FBQ2xFLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSw0QkFBNEIsUUFBUSxTQUFTLENBQUM7QUFFcEY7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLFFBQ0MsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxXQUFPLFFBQVEsU0FBUyx1QkFBdUIsT0FBTyxJQUFJO0FBQUEsTUFDekQsVUFBVSxJQUFJLFNBQVMsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUNEO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxRQUFRO0FBQ2xCLGNBQVUsUUFBUTtBQUFBLEVBQ25CLENBQUM7QUFFRCxXQUFTLFVBQVUsQ0FBQyxXQUFXO0FBQzlCLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSxpQkFBaUIsQ0FBQztBQUN4RCxjQUFVLE9BQU8sRUFBRSxjQUFjLEtBQUssU0FBUyxLQUFLLEdBQUcsS0FBSztBQUM1RCxVQUFNLFlBQVksWUFBWSxJQUFJLElBQUksNEJBQTRCLFFBQVEsU0FBUyxDQUFDO0FBRXBGO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxRQUNDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFFBQ2IsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsUUFDYixDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNYO0FBQUEsUUFDQyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxRQUNiLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFFBQ2IsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxjQUFVLGdCQUFnQjtBQUMxQjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWDtBQUFBLFFBQ0MsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsUUFDYixDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxRQUNiLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxRQUFRO0FBQ2xCLGNBQVUsUUFBUTtBQUFBLEVBQ25CLENBQUM7QUFFRCxXQUFTLFVBQVUsQ0FBQyxXQUFXO0FBQzlCLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSxpQkFBaUIsQ0FBQztBQUN4RCxjQUFVLE9BQU8sRUFBRSxjQUFjLEtBQUssU0FBUyxLQUFLLEdBQUcsS0FBSztBQUM1RCxVQUFNLFlBQVksWUFBWSxJQUFJLElBQUksNEJBQTRCLFFBQVEsU0FBUyxDQUFDO0FBRXBGO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFFBQ2IsQ0FBQyxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsUUFDZixDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsZ0JBQWdCO0FBQzFCO0FBQUEsTUFDQztBQUFBLE1BQ0EsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiO0FBQUEsUUFDQyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNYLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxRQUNiLENBQUMsSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFFBQ2YsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxjQUFVLGdCQUFnQjtBQUMxQjtBQUFBLE1BQ0M7QUFBQSxNQUNBLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDYjtBQUFBLFFBQ0MsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsUUFDYixDQUFDLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxRQUNmLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsY0FBVSxnQkFBZ0I7QUFDMUI7QUFBQSxNQUNDO0FBQUEsTUFDQSxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2I7QUFBQSxRQUNDLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQ2IsQ0FBQyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDYixDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUNiLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFFBQ2IsQ0FBQyxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsUUFDZixDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLGNBQVUsUUFB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
