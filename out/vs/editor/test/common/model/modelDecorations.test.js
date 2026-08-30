import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { EndOfLineSequence, TrackedRangeStickiness } from "../../../common/model.js";
import { createTextModel } from "../testTextModel.js";
function modelHasDecorations(model, decorations) {
  const modelDecorations = [];
  const actualDecorations = model.getAllDecorations();
  for (let i = 0, len = actualDecorations.length; i < len; i++) {
    modelDecorations.push({
      range: actualDecorations[i].range,
      className: actualDecorations[i].options.className
    });
  }
  modelDecorations.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
  assert.deepStrictEqual(modelDecorations, decorations);
}
function modelHasDecoration(model, startLineNumber, startColumn, endLineNumber, endColumn, className) {
  modelHasDecorations(model, [{
    range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
    className
  }]);
}
function modelHasNoDecorations(model) {
  assert.strictEqual(model.getAllDecorations().length, 0, "Model has no decoration");
}
function addDecoration(model, startLineNumber, startColumn, endLineNumber, endColumn, className) {
  return model.changeDecorations((changeAccessor) => {
    return changeAccessor.addDecoration(new Range(startLineNumber, startColumn, endLineNumber, endColumn), {
      description: "test",
      className
    });
  });
}
function lineHasDecorations(model, lineNumber, decorations) {
  const lineDecorations = [];
  const decs = model.getLineDecorations(lineNumber);
  for (let i = 0, len = decs.length; i < len; i++) {
    lineDecorations.push({
      start: decs[i].range.startColumn,
      end: decs[i].range.endColumn,
      className: decs[i].options.className
    });
  }
  assert.deepStrictEqual(lineDecorations, decorations, "Line decorations");
}
function lineHasNoDecorations(model, lineNumber) {
  lineHasDecorations(model, lineNumber, []);
}
function lineHasDecoration(model, lineNumber, start, end, className) {
  lineHasDecorations(model, lineNumber, [{
    start,
    end,
    className
  }]);
}
suite("Editor Model - Model Decorations", () => {
  const LINE1 = "My First Line";
  const LINE2 = "		My Second Line";
  const LINE3 = "    Third Line";
  const LINE4 = "";
  const LINE5 = "1";
  let thisModel;
  setup(() => {
    const text = LINE1 + "\r\n" + LINE2 + "\n" + LINE3 + "\n" + LINE4 + "\r\n" + LINE5;
    thisModel = createTextModel(text);
  });
  teardown(() => {
    thisModel.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("single character decoration", () => {
    addDecoration(thisModel, 1, 1, 1, 2, "myType");
    lineHasDecoration(thisModel, 1, 1, 2, "myType");
    lineHasNoDecorations(thisModel, 2);
    lineHasNoDecorations(thisModel, 3);
    lineHasNoDecorations(thisModel, 4);
    lineHasNoDecorations(thisModel, 5);
  });
  test("line decoration", () => {
    addDecoration(thisModel, 1, 1, 1, 14, "myType");
    lineHasDecoration(thisModel, 1, 1, 14, "myType");
    lineHasNoDecorations(thisModel, 2);
    lineHasNoDecorations(thisModel, 3);
    lineHasNoDecorations(thisModel, 4);
    lineHasNoDecorations(thisModel, 5);
  });
  test("full line decoration", () => {
    addDecoration(thisModel, 1, 1, 2, 1, "myType");
    const line1Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line1Decorations.length, 1);
    assert.strictEqual(line1Decorations[0].options.className, "myType");
    const line2Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line2Decorations.length, 1);
    assert.strictEqual(line2Decorations[0].options.className, "myType");
    lineHasNoDecorations(thisModel, 3);
    lineHasNoDecorations(thisModel, 4);
    lineHasNoDecorations(thisModel, 5);
  });
  test("multiple line decoration", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    const line1Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line1Decorations.length, 1);
    assert.strictEqual(line1Decorations[0].options.className, "myType");
    const line2Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line2Decorations.length, 1);
    assert.strictEqual(line2Decorations[0].options.className, "myType");
    const line3Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line3Decorations.length, 1);
    assert.strictEqual(line3Decorations[0].options.className, "myType");
    lineHasNoDecorations(thisModel, 4);
    lineHasNoDecorations(thisModel, 5);
  });
  test("decoration gets removed", () => {
    const decId = addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(decId);
    });
    modelHasNoDecorations(thisModel);
  });
  test("decorations get removed", () => {
    const decId1 = addDecoration(thisModel, 1, 2, 3, 2, "myType1");
    const decId2 = addDecoration(thisModel, 1, 2, 3, 1, "myType2");
    modelHasDecorations(thisModel, [
      {
        range: new Range(1, 2, 3, 1),
        className: "myType2"
      },
      {
        range: new Range(1, 2, 3, 2),
        className: "myType1"
      }
    ]);
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(decId1);
    });
    modelHasDecorations(thisModel, [
      {
        range: new Range(1, 2, 3, 1),
        className: "myType2"
      }
    ]);
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(decId2);
    });
    modelHasNoDecorations(thisModel);
  });
  test("decoration range can be changed", () => {
    const decId = addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.changeDecoration(decId, new Range(1, 1, 1, 2));
    });
    modelHasDecoration(thisModel, 1, 1, 1, 2, "myType");
  });
  test("decorations emit event on add", () => {
    let listenerCalled = 0;
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    assert.strictEqual(listenerCalled, 1, "listener called");
    disposable.dispose();
  });
  test("decorations emit event on change", () => {
    let listenerCalled = 0;
    const decId = addDecoration(thisModel, 1, 2, 3, 2, "myType");
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.changeDecoration(decId, new Range(1, 1, 1, 2));
    });
    assert.strictEqual(listenerCalled, 1, "listener called");
    disposable.dispose();
  });
  test("decorations emit event on remove", () => {
    let listenerCalled = 0;
    const decId = addDecoration(thisModel, 1, 2, 3, 2, "myType");
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(decId);
    });
    assert.strictEqual(listenerCalled, 1, "listener called");
    disposable.dispose();
  });
  test("decorations emit event when inserting one line text before it", () => {
    let listenerCalled = 0;
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "Hallo ")]);
    assert.strictEqual(listenerCalled, 1, "listener called");
    disposable.dispose();
  });
  test("decorations do not emit event on no-op deltaDecorations", () => {
    let listenerCalled = 0;
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    thisModel.deltaDecorations([], []);
    thisModel.changeDecorations((accessor) => {
      accessor.deltaDecorations([], []);
    });
    assert.strictEqual(listenerCalled, 0, "listener not called");
    disposable.dispose();
  });
  test("decorations are updated when inserting one line text before it", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "Hallo ")]);
    modelHasDecoration(thisModel, 1, 8, 3, 2, "myType");
  });
  test("decorations are updated when inserting one line text before it 2", () => {
    addDecoration(thisModel, 1, 1, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 1, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.replace(new Range(1, 1, 1, 1), "Hallo ")]);
    modelHasDecoration(thisModel, 1, 1, 3, 2, "myType");
  });
  test("decorations are updated when inserting multiple lines text before it", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "Hallo\nI'm inserting multiple\nlines")]);
    modelHasDecoration(thisModel, 3, 7, 5, 2, "myType");
  });
  test("decorations change when inserting text after them", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(3, 2), "Hallo")]);
    modelHasDecoration(thisModel, 1, 2, 3, 7, "myType");
  });
  test("decorations are updated when inserting text inside", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), "Hallo ")]);
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
  });
  test("decorations are updated when inserting text inside 2", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(3, 1), "Hallo ")]);
    modelHasDecoration(thisModel, 1, 2, 3, 8, "myType");
  });
  test("decorations are updated when inserting text inside 3", () => {
    addDecoration(thisModel, 1, 1, 2, 16, "myType");
    modelHasDecoration(thisModel, 1, 1, 2, 16, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(2, 2), "\n")]);
    modelHasDecoration(thisModel, 1, 1, 3, 15, "myType");
  });
  test("decorations are updated when inserting multiple lines text inside", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), "Hallo\nI'm inserting multiple\nlines")]);
    modelHasDecoration(thisModel, 1, 2, 5, 2, "myType");
  });
  test("decorations are updated when deleting one line text before it", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
    modelHasDecoration(thisModel, 1, 1, 3, 2, "myType");
  });
  test("decorations are updated when deleting multiple lines text before it", () => {
    addDecoration(thisModel, 2, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 2, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 1))]);
    modelHasDecoration(thisModel, 1, 2, 2, 2, "myType");
  });
  test("decorations are updated when deleting multiple lines text before it 2", () => {
    addDecoration(thisModel, 2, 3, 3, 2, "myType");
    modelHasDecoration(thisModel, 2, 3, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 2))]);
    modelHasDecoration(thisModel, 1, 2, 2, 2, "myType");
  });
  test("decorations are updated when deleting text inside", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType");
    modelHasDecoration(thisModel, 1, 2, 4, 1, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 3, 2, 1))]);
    modelHasDecoration(thisModel, 1, 2, 3, 1, "myType");
  });
  test("decorations are updated when deleting text inside 2", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType");
    modelHasDecoration(thisModel, 1, 2, 4, 1, "myType");
    thisModel.applyEdits([
      EditOperation.delete(new Range(1, 1, 1, 2)),
      EditOperation.delete(new Range(4, 1, 4, 1))
    ]);
    modelHasDecoration(thisModel, 1, 1, 4, 1, "myType");
  });
  test("decorations are updated when deleting multiple lines text", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType");
    modelHasDecoration(thisModel, 1, 2, 4, 1, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 1))]);
    modelHasDecoration(thisModel, 1, 1, 2, 1, "myType");
  });
  test("decorations are updated when changing EOL", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType1");
    addDecoration(thisModel, 1, 3, 4, 1, "myType2");
    addDecoration(thisModel, 1, 4, 4, 1, "myType3");
    addDecoration(thisModel, 1, 5, 4, 1, "myType4");
    addDecoration(thisModel, 1, 6, 4, 1, "myType5");
    addDecoration(thisModel, 1, 7, 4, 1, "myType6");
    addDecoration(thisModel, 1, 8, 4, 1, "myType7");
    addDecoration(thisModel, 1, 9, 4, 1, "myType8");
    addDecoration(thisModel, 1, 10, 4, 1, "myType9");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "x")]);
    thisModel.setEOL(EndOfLineSequence.CRLF);
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "x")]);
    modelHasDecorations(thisModel, [
      { range: new Range(1, 4, 4, 1), className: "myType1" },
      { range: new Range(1, 5, 4, 1), className: "myType2" },
      { range: new Range(1, 6, 4, 1), className: "myType3" },
      { range: new Range(1, 7, 4, 1), className: "myType4" },
      { range: new Range(1, 8, 4, 1), className: "myType5" },
      { range: new Range(1, 9, 4, 1), className: "myType6" },
      { range: new Range(1, 10, 4, 1), className: "myType7" },
      { range: new Range(1, 11, 4, 1), className: "myType8" },
      { range: new Range(1, 12, 4, 1), className: "myType9" }
    ]);
  });
  test("an apparently simple edit", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType1");
    thisModel.applyEdits([EditOperation.replace(new Range(1, 14, 2, 1), "x")]);
    modelHasDecorations(thisModel, [
      { range: new Range(1, 2, 3, 1), className: "myType1" }
    ]);
  });
  test("removeAllDecorationsWithOwnerId can be called after model dispose", () => {
    const model = createTextModel("asd");
    model.dispose();
    model.removeAllDecorationsWithOwnerId(1);
  });
  test("removeAllDecorationsWithOwnerId works", () => {
    thisModel.deltaDecorations([], [{ range: new Range(1, 2, 4, 1), options: { description: "test", className: "myType1" } }], 1);
    thisModel.removeAllDecorationsWithOwnerId(1);
    modelHasNoDecorations(thisModel);
  });
});
suite("Decorations and editing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function _runTest(decRange, stickiness, editRange, editText, editForceMoveMarkers, expectedDecRange, msg) {
    const model = createTextModel([
      "My First Line",
      "My Second Line",
      "Third Line"
    ].join("\n"));
    const id = model.deltaDecorations([], [{ range: decRange, options: { description: "test", stickiness } }])[0];
    model.applyEdits([{
      range: editRange,
      text: editText,
      forceMoveMarkers: editForceMoveMarkers
    }]);
    const actual = model.getDecorationRange(id);
    assert.deepStrictEqual(actual, expectedDecRange, msg);
    model.dispose();
  }
  function runTest(decRange, editRange, editText, expectedDecRange) {
    _runTest(decRange, 0, editRange, editText, false, expectedDecRange[0][0], "no-0-AlwaysGrowsWhenTypingAtEdges");
    _runTest(decRange, 1, editRange, editText, false, expectedDecRange[0][1], "no-1-NeverGrowsWhenTypingAtEdges");
    _runTest(decRange, 2, editRange, editText, false, expectedDecRange[0][2], "no-2-GrowsOnlyWhenTypingBefore");
    _runTest(decRange, 3, editRange, editText, false, expectedDecRange[0][3], "no-3-GrowsOnlyWhenTypingAfter");
    _runTest(decRange, 0, editRange, editText, true, expectedDecRange[1][0], "force-0-AlwaysGrowsWhenTypingAtEdges");
    _runTest(decRange, 1, editRange, editText, true, expectedDecRange[1][1], "force-1-NeverGrowsWhenTypingAtEdges");
    _runTest(decRange, 2, editRange, editText, true, expectedDecRange[1][2], "force-2-GrowsOnlyWhenTypingBefore");
    _runTest(decRange, 3, editRange, editText, true, expectedDecRange[1][3], "force-3-GrowsOnlyWhenTypingAfter");
  }
  suite("insert", () => {
    suite("collapsed dec", () => {
      test("before", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 3),
          "xx",
          [
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)],
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)]
          ]
        );
      });
      test("equal", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 4),
          "xx",
          [
            [new Range(1, 4, 1, 6), new Range(1, 6, 1, 6), new Range(1, 4, 1, 4), new Range(1, 6, 1, 6)],
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)]
          ]
        );
      });
      test("after", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 5),
          "xx",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
    });
    suite("non-collapsed dec", () => {
      test("before", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 3),
          "xx",
          [
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)],
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)]
          ]
        );
      });
      test("start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 4),
          "xx",
          [
            [new Range(1, 4, 1, 11), new Range(1, 6, 1, 11), new Range(1, 4, 1, 11), new Range(1, 6, 1, 11)],
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)]
          ]
        );
      });
      test("inside", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 5),
          "xx",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)],
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)]
          ]
        );
      });
      test("end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 9),
          "xx",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 11)],
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)]
          ]
        );
      });
      test("after", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 10),
          "xx",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
    });
  });
  suite("delete", () => {
    suite("collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 1, 1, 3),
          "",
          [
            [new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2)],
            [new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "",
          [
            [new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2)],
            [new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
    });
    suite("non-collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 1, 1, 3),
          "",
          [
            [new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7)],
            [new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "",
          [
            [new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7)],
            [new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "",
          [
            [new Range(1, 3, 1, 7), new Range(1, 3, 1, 7), new Range(1, 3, 1, 7), new Range(1, 3, 1, 7)],
            [new Range(1, 3, 1, 7), new Range(1, 3, 1, 7), new Range(1, 3, 1, 7), new Range(1, 3, 1, 7)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "",
          [
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)],
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "",
          [
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)],
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "",
          [
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)],
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "",
          [
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)],
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
    });
  });
  suite("replace short", () => {
    suite("collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 1, 1, 3),
          "c",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "c",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
    });
    suite("non-collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 1, 1, 3),
          "c",
          [
            [new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8)],
            [new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "c",
          [
            [new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8)],
            [new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "c",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "c",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 5, 1, 8), new Range(1, 5, 1, 8), new Range(1, 5, 1, 8), new Range(1, 5, 1, 8)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "c",
          [
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)],
            [new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "c",
          [
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)],
            [new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "c",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "c",
          [
            [new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6)],
            [new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "c",
          [
            [new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6)],
            [new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "c",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 10), new Range(1, 4, 1, 10), new Range(1, 4, 1, 10), new Range(1, 4, 1, 10)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "c",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
    });
  });
  suite("replace long", () => {
    suite("collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 1, 1, 3),
          "cccc",
          [
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)],
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "cccc",
          [
            [new Range(1, 4, 1, 6), new Range(1, 6, 1, 6), new Range(1, 4, 1, 4), new Range(1, 6, 1, 6)],
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "cccc",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "cccc",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "cccc",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
    });
    suite("non-collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 1, 1, 3),
          "cccc",
          [
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)],
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "cccc",
          [
            [new Range(1, 4, 1, 11), new Range(1, 6, 1, 11), new Range(1, 4, 1, 11), new Range(1, 6, 1, 11)],
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "cccc",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)],
            [new Range(1, 7, 1, 11), new Range(1, 7, 1, 11), new Range(1, 7, 1, 11), new Range(1, 7, 1, 11)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "cccc",
          [
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)],
            [new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "cccc",
          [
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)],
            [new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "cccc",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)],
            [new Range(1, 8, 1, 11), new Range(1, 8, 1, 11), new Range(1, 8, 1, 11), new Range(1, 8, 1, 11)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "cccc",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "cccc",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "cccc",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)],
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "cccc",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "cccc",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "cccc",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 13), new Range(1, 4, 1, 13), new Range(1, 4, 1, 13), new Range(1, 4, 1, 13)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "cccc",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
    });
  });
});
suite("deltaDecorations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function decoration(id, startLineNumber, startColumn, endLineNumber, endColum) {
    return {
      id,
      range: new Range(startLineNumber, startColumn, endLineNumber, endColum)
    };
  }
  function toModelDeltaDecoration(dec) {
    return {
      range: dec.range,
      options: {
        description: "test",
        className: dec.id
      }
    };
  }
  function strcmp(a, b) {
    if (a === b) {
      return 0;
    }
    if (a < b) {
      return -1;
    }
    return 1;
  }
  function readModelDecorations(model, ids) {
    return ids.map((id) => {
      return {
        range: model.getDecorationRange(id),
        id: model.getDecorationOptions(id).className
      };
    });
  }
  function testDeltaDecorations(text, decorations, newDecorations) {
    const model = createTextModel(text.join("\n"));
    const initialIds = model.deltaDecorations([], decorations.map(toModelDeltaDecoration));
    const actualDecorations = readModelDecorations(model, initialIds);
    assert.strictEqual(initialIds.length, decorations.length, "returns expected cnt of ids");
    assert.strictEqual(initialIds.length, model.getAllDecorations().length, "does not leak decorations");
    actualDecorations.sort((a, b) => strcmp(a.id, b.id));
    decorations.sort((a, b) => strcmp(a.id, b.id));
    assert.deepStrictEqual(actualDecorations, decorations);
    const newIds = model.deltaDecorations(initialIds, newDecorations.map(toModelDeltaDecoration));
    const actualNewDecorations = readModelDecorations(model, newIds);
    assert.strictEqual(newIds.length, newDecorations.length, "returns expected cnt of ids");
    assert.strictEqual(newIds.length, model.getAllDecorations().length, "does not leak decorations");
    actualNewDecorations.sort((a, b) => strcmp(a.id, b.id));
    newDecorations.sort((a, b) => strcmp(a.id, b.id));
    assert.deepStrictEqual(actualDecorations, decorations);
    model.dispose();
  }
  function range(startLineNumber, startColumn, endLineNumber, endColumn) {
    return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
  }
  test("result respects input", () => {
    const model = createTextModel([
      "Hello world,",
      "How are you?"
    ].join("\n"));
    const ids = model.deltaDecorations([], [
      toModelDeltaDecoration(decoration("a", 1, 1, 1, 12)),
      toModelDeltaDecoration(decoration("b", 2, 1, 2, 13))
    ]);
    assert.deepStrictEqual(model.getDecorationRange(ids[0]), range(1, 1, 1, 12));
    assert.deepStrictEqual(model.getDecorationRange(ids[1]), range(2, 1, 2, 13));
    model.dispose();
  });
  test("deltaDecorations 1", () => {
    testDeltaDecorations(
      [
        "This is a text",
        "That has multiple lines",
        "And is very friendly",
        "Towards testing"
      ],
      [
        decoration("a", 1, 1, 1, 2),
        decoration("b", 1, 1, 1, 15),
        decoration("c", 1, 1, 2, 1),
        decoration("d", 1, 1, 2, 24),
        decoration("e", 2, 1, 2, 24),
        decoration("f", 2, 1, 4, 16)
      ],
      [
        decoration("x", 1, 1, 1, 2),
        decoration("b", 1, 1, 1, 15),
        decoration("c", 1, 1, 2, 1),
        decoration("d", 1, 1, 2, 24),
        decoration("e", 2, 1, 2, 21),
        decoration("f", 2, 17, 4, 16)
      ]
    );
  });
  test("deltaDecorations 2", () => {
    testDeltaDecorations(
      [
        "This is a text",
        "That has multiple lines",
        "And is very friendly",
        "Towards testing"
      ],
      [
        decoration("a", 1, 1, 1, 2),
        decoration("b", 1, 2, 1, 3),
        decoration("c", 1, 3, 1, 4),
        decoration("d", 1, 4, 1, 5),
        decoration("e", 1, 5, 1, 6)
      ],
      [
        decoration("a", 1, 2, 1, 3),
        decoration("b", 1, 3, 1, 4),
        decoration("c", 1, 4, 1, 5),
        decoration("d", 1, 5, 1, 6)
      ]
    );
  });
  test("deltaDecorations 3", () => {
    testDeltaDecorations(
      [
        "This is a text",
        "That has multiple lines",
        "And is very friendly",
        "Towards testing"
      ],
      [
        decoration("a", 1, 1, 1, 2),
        decoration("b", 1, 2, 1, 3),
        decoration("c", 1, 3, 1, 4),
        decoration("d", 1, 4, 1, 5),
        decoration("e", 1, 5, 1, 6)
      ],
      []
    );
  });
  test("issue #4317: editor.setDecorations doesn't update the hover message", () => {
    const model = createTextModel("Hello world!");
    let ids = model.deltaDecorations([], [{
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 100,
        endColumn: 1
      },
      options: {
        description: "test",
        hoverMessage: { value: "hello1" }
      }
    }]);
    ids = model.deltaDecorations(ids, [{
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 100,
        endColumn: 1
      },
      options: {
        description: "test",
        hoverMessage: { value: "hello2" }
      }
    }]);
    const actualDecoration = model.getDecorationOptions(ids[0]);
    assert.deepStrictEqual(actualDecoration.hoverMessage, { value: "hello2" });
    model.dispose();
  });
  test("model doesn't get confused with individual tracked ranges", () => {
    const model = createTextModel([
      "Hello world,",
      "How are you?"
    ].join("\n"));
    const trackedRangeId = model.changeDecorations((changeAcessor) => {
      return changeAcessor.addDecoration(
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1
        },
        {
          description: "test",
          stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
        }
      );
    });
    model.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(trackedRangeId);
    });
    let ids = model.deltaDecorations([], [
      toModelDeltaDecoration(decoration("a", 1, 1, 1, 12)),
      toModelDeltaDecoration(decoration("b", 2, 1, 2, 13))
    ]);
    assert.deepStrictEqual(model.getDecorationRange(ids[0]), range(1, 1, 1, 12));
    assert.deepStrictEqual(model.getDecorationRange(ids[1]), range(2, 1, 2, 13));
    ids = model.deltaDecorations(ids, [
      toModelDeltaDecoration(decoration("a", 1, 1, 1, 12)),
      toModelDeltaDecoration(decoration("b", 2, 1, 2, 13))
    ]);
    assert.deepStrictEqual(model.getDecorationRange(ids[0]), range(1, 1, 1, 12));
    assert.deepStrictEqual(model.getDecorationRange(ids[1]), range(2, 1, 2, 13));
    model.dispose();
  });
  test("issue #16922: Clicking on link doesn't seem to do anything", () => {
    const model = createTextModel([
      "Hello world,",
      "How are you?",
      "Fine.",
      "Good."
    ].join("\n"));
    model.deltaDecorations([], [
      { range: new Range(1, 1, 1, 1), options: { description: "test", className: "1" } },
      { range: new Range(1, 13, 1, 13), options: { description: "test", className: "2" } },
      { range: new Range(2, 1, 2, 1), options: { description: "test", className: "3" } },
      { range: new Range(2, 1, 2, 4), options: { description: "test", className: "4" } },
      { range: new Range(2, 8, 2, 13), options: { description: "test", className: "5" } },
      { range: new Range(3, 1, 4, 6), options: { description: "test", className: "6" } },
      { range: new Range(1, 1, 3, 6), options: { description: "test", className: "x1" } },
      { range: new Range(2, 5, 2, 8), options: { description: "test", className: "x2" } },
      { range: new Range(1, 1, 2, 8), options: { description: "test", className: "x3" } },
      { range: new Range(2, 5, 3, 1), options: { description: "test", className: "x4" } }
    ]);
    const inRange = model.getDecorationsInRange(new Range(2, 6, 2, 6));
    const inRangeClassNames = inRange.map((d) => d.options.className);
    inRangeClassNames.sort();
    assert.deepStrictEqual(inRangeClassNames, ["x1", "x2", "x3", "x4"]);
    model.dispose();
  });
  test("issue #41492: URL highlighting persists after pasting over url", () => {
    const model = createTextModel([
      "My First Line"
    ].join("\n"));
    const id = model.deltaDecorations([], [{ range: new Range(1, 2, 1, 14), options: { description: "test", stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, collapseOnReplaceEdit: true } }])[0];
    model.applyEdits([{
      range: new Range(1, 1, 1, 14),
      text: "Some new text that is longer than the previous one",
      forceMoveMarkers: false
    }]);
    const actual = model.getDecorationRange(id);
    assert.deepStrictEqual(actual, new Range(1, 1, 1, 1));
    model.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXG1vZGVsRGVjb3JhdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVNlcXVlbmNlLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi90ZXN0VGV4dE1vZGVsLmpzJztcblxuLy8gLS0tLS0tLS0tIHV0aWxzXG5cbmludGVyZmFjZSBJTGlnaHRXZWlnaHREZWNvcmF0aW9uMiB7XG5cdHJhbmdlOiBSYW5nZTtcblx0Y2xhc3NOYW1lOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBtb2RlbEhhc0RlY29yYXRpb25zKG1vZGVsOiBUZXh0TW9kZWwsIGRlY29yYXRpb25zOiBJTGlnaHRXZWlnaHREZWNvcmF0aW9uMltdKSB7XG5cdGNvbnN0IG1vZGVsRGVjb3JhdGlvbnM6IElMaWdodFdlaWdodERlY29yYXRpb24yW10gPSBbXTtcblx0Y29uc3QgYWN0dWFsRGVjb3JhdGlvbnMgPSBtb2RlbC5nZXRBbGxEZWNvcmF0aW9ucygpO1xuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gYWN0dWFsRGVjb3JhdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRtb2RlbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0cmFuZ2U6IGFjdHVhbERlY29yYXRpb25zW2ldLnJhbmdlLFxuXHRcdFx0Y2xhc3NOYW1lOiBhY3R1YWxEZWNvcmF0aW9uc1tpXS5vcHRpb25zLmNsYXNzTmFtZVxuXHRcdH0pO1xuXHR9XG5cdG1vZGVsRGVjb3JhdGlvbnMuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpKTtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbERlY29yYXRpb25zLCBkZWNvcmF0aW9ucyk7XG59XG5cbmZ1bmN0aW9uIG1vZGVsSGFzRGVjb3JhdGlvbihtb2RlbDogVGV4dE1vZGVsLCBzdGFydExpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpIHtcblx0bW9kZWxIYXNEZWNvcmF0aW9ucyhtb2RlbCwgW3tcblx0XHRyYW5nZTogbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksXG5cdFx0Y2xhc3NOYW1lOiBjbGFzc05hbWVcblx0fV0pO1xufVxuXG5mdW5jdGlvbiBtb2RlbEhhc05vRGVjb3JhdGlvbnMobW9kZWw6IFRleHRNb2RlbCkge1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0QWxsRGVjb3JhdGlvbnMoKS5sZW5ndGgsIDAsICdNb2RlbCBoYXMgbm8gZGVjb3JhdGlvbicpO1xufVxuXG5mdW5jdGlvbiBhZGREZWNvcmF0aW9uKG1vZGVsOiBUZXh0TW9kZWwsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRyZXR1cm4gY2hhbmdlQWNjZXNzb3IuYWRkRGVjb3JhdGlvbihuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKSwge1xuXHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdGNsYXNzTmFtZTogY2xhc3NOYW1lXG5cdFx0fSk7XG5cdH0pITtcbn1cblxuZnVuY3Rpb24gbGluZUhhc0RlY29yYXRpb25zKG1vZGVsOiBUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgZGVjb3JhdGlvbnM6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXI7IGNsYXNzTmFtZTogc3RyaW5nIH1bXSkge1xuXHRjb25zdCBsaW5lRGVjb3JhdGlvbnM6IEFycmF5PHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXI7IGNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRjb25zdCBkZWNzID0gbW9kZWwuZ2V0TGluZURlY29yYXRpb25zKGxpbmVOdW1iZXIpO1xuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gZGVjcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGxpbmVEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdHN0YXJ0OiBkZWNzW2ldLnJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0ZW5kOiBkZWNzW2ldLnJhbmdlLmVuZENvbHVtbixcblx0XHRcdGNsYXNzTmFtZTogZGVjc1tpXS5vcHRpb25zLmNsYXNzTmFtZVxuXHRcdH0pO1xuXHR9XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZURlY29yYXRpb25zLCBkZWNvcmF0aW9ucywgJ0xpbmUgZGVjb3JhdGlvbnMnKTtcbn1cblxuZnVuY3Rpb24gbGluZUhhc05vRGVjb3JhdGlvbnMobW9kZWw6IFRleHRNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyKSB7XG5cdGxpbmVIYXNEZWNvcmF0aW9ucyhtb2RlbCwgbGluZU51bWJlciwgW10pO1xufVxuXG5mdW5jdGlvbiBsaW5lSGFzRGVjb3JhdGlvbihtb2RlbDogVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCBjbGFzc05hbWU6IHN0cmluZykge1xuXHRsaW5lSGFzRGVjb3JhdGlvbnMobW9kZWwsIGxpbmVOdW1iZXIsIFt7XG5cdFx0c3RhcnQ6IHN0YXJ0LFxuXHRcdGVuZDogZW5kLFxuXHRcdGNsYXNzTmFtZTogY2xhc3NOYW1lXG5cdH1dKTtcbn1cblxuc3VpdGUoJ0VkaXRvciBNb2RlbCAtIE1vZGVsIERlY29yYXRpb25zJywgKCkgPT4ge1xuXHRjb25zdCBMSU5FMSA9ICdNeSBGaXJzdCBMaW5lJztcblx0Y29uc3QgTElORTIgPSAnXFx0XFx0TXkgU2Vjb25kIExpbmUnO1xuXHRjb25zdCBMSU5FMyA9ICcgICAgVGhpcmQgTGluZSc7XG5cdGNvbnN0IExJTkU0ID0gJyc7XG5cdGNvbnN0IExJTkU1ID0gJzEnO1xuXG5cdC8vIC0tLS0tLS0tLSBNb2RlbCBEZWNvcmF0aW9uc1xuXG5cdGxldCB0aGlzTW9kZWw6IFRleHRNb2RlbDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9XG5cdFx0XHRMSU5FMSArICdcXHJcXG4nICtcblx0XHRcdExJTkUyICsgJ1xcbicgK1xuXHRcdFx0TElORTMgKyAnXFxuJyArXG5cdFx0XHRMSU5FNCArICdcXHJcXG4nICtcblx0XHRcdExJTkU1O1xuXHRcdHRoaXNNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3NpbmdsZSBjaGFyYWN0ZXIgZGVjb3JhdGlvbicsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMSwgMiwgJ215VHlwZScpO1xuXHRcdGxpbmVIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMiwgJ215VHlwZScpO1xuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgMik7XG5cdFx0bGluZUhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsLCAzKTtcblx0XHRsaW5lSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwsIDQpO1xuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpbmUgZGVjb3JhdGlvbicsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMSwgMTQsICdteVR5cGUnKTtcblx0XHRsaW5lSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDE0LCAnbXlUeXBlJyk7XG5cdFx0bGluZUhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsLCAyKTtcblx0XHRsaW5lSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwsIDMpO1xuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgNCk7XG5cdFx0bGluZUhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsLCA1KTtcblx0fSk7XG5cblx0dGVzdCgnZnVsbCBsaW5lIGRlY29yYXRpb24nLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDIsIDEsICdteVR5cGUnKTtcblxuXHRcdGNvbnN0IGxpbmUxRGVjb3JhdGlvbnMgPSB0aGlzTW9kZWwuZ2V0TGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMURlY29yYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxRGVjb3JhdGlvbnNbMF0ub3B0aW9ucy5jbGFzc05hbWUsICdteVR5cGUnKTtcblxuXHRcdGNvbnN0IGxpbmUyRGVjb3JhdGlvbnMgPSB0aGlzTW9kZWwuZ2V0TGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMkRlY29yYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUyRGVjb3JhdGlvbnNbMF0ub3B0aW9ucy5jbGFzc05hbWUsICdteVR5cGUnKTtcblxuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgMyk7XG5cdFx0bGluZUhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsLCA0KTtcblx0XHRsaW5lSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBsaW5lIGRlY29yYXRpb24nLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblxuXHRcdGNvbnN0IGxpbmUxRGVjb3JhdGlvbnMgPSB0aGlzTW9kZWwuZ2V0TGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMURlY29yYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxRGVjb3JhdGlvbnNbMF0ub3B0aW9ucy5jbGFzc05hbWUsICdteVR5cGUnKTtcblxuXHRcdGNvbnN0IGxpbmUyRGVjb3JhdGlvbnMgPSB0aGlzTW9kZWwuZ2V0TGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMkRlY29yYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUyRGVjb3JhdGlvbnNbMF0ub3B0aW9ucy5jbGFzc05hbWUsICdteVR5cGUnKTtcblxuXHRcdGNvbnN0IGxpbmUzRGVjb3JhdGlvbnMgPSB0aGlzTW9kZWwuZ2V0TGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lM0RlY29yYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUzRGVjb3JhdGlvbnNbMF0ub3B0aW9ucy5jbGFzc05hbWUsICdteVR5cGUnKTtcblxuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgNCk7XG5cdFx0bGluZUhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsLCA1KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIHJlbW92aW5nLCBjaGFuZ2luZyBkZWNvcmF0aW9uc1xuXG5cdHRlc3QoJ2RlY29yYXRpb24gZ2V0cyByZW1vdmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRlY0lkID0gYWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y2hhbmdlQWNjZXNzb3IucmVtb3ZlRGVjb3JhdGlvbihkZWNJZCk7XG5cdFx0fSk7XG5cdFx0bW9kZWxIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGdldCByZW1vdmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRlY0lkMSA9IGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlMScpO1xuXHRcdGNvbnN0IGRlY0lkMiA9IGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAxLCAnbXlUeXBlMicpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbnModGhpc01vZGVsLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMiwgMywgMSksXG5cdFx0XHRcdGNsYXNzTmFtZTogJ215VHlwZTInXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDIsIDMsIDIpLFxuXHRcdFx0XHRjbGFzc05hbWU6ICdteVR5cGUxJ1xuXHRcdFx0fVxuXHRcdF0pO1xuXHRcdHRoaXNNb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24oZGVjSWQxKTtcblx0XHR9KTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb25zKHRoaXNNb2RlbCwgW1xuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDIsIDMsIDEpLFxuXHRcdFx0XHRjbGFzc05hbWU6ICdteVR5cGUyJ1xuXHRcdFx0fVxuXHRcdF0pO1xuXHRcdHRoaXNNb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24oZGVjSWQyKTtcblx0XHR9KTtcblx0XHRtb2RlbEhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbiByYW5nZSBjYW4gYmUgY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBkZWNJZCA9IGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLmNoYW5nZURlY29yYXRpb24oZGVjSWQsIG5ldyBSYW5nZSgxLCAxLCAxLCAyKSk7XG5cdFx0fSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMSwgMiwgJ215VHlwZScpO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gZXZlbnRpbmdcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBlbWl0IGV2ZW50IG9uIGFkZCcsICgpID0+IHtcblx0XHRsZXQgbGlzdGVuZXJDYWxsZWQgPSAwO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzTW9kZWwub25EaWRDaGFuZ2VEZWNvcmF0aW9ucygoZSkgPT4ge1xuXHRcdFx0bGlzdGVuZXJDYWxsZWQrKztcblx0XHR9KTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0ZW5lckNhbGxlZCwgMSwgJ2xpc3RlbmVyIGNhbGxlZCcpO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBlbWl0IGV2ZW50IG9uIGNoYW5nZScsICgpID0+IHtcblx0XHRsZXQgbGlzdGVuZXJDYWxsZWQgPSAwO1xuXHRcdGNvbnN0IGRlY0lkID0gYWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpc01vZGVsLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKGUpID0+IHtcblx0XHRcdGxpc3RlbmVyQ2FsbGVkKys7XG5cdFx0fSk7XG5cdFx0dGhpc01vZGVsLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y2hhbmdlQWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbihkZWNJZCwgbmV3IFJhbmdlKDEsIDEsIDEsIDIpKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdGVuZXJDYWxsZWQsIDEsICdsaXN0ZW5lciBjYWxsZWQnKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgZW1pdCBldmVudCBvbiByZW1vdmUnLCAoKSA9PiB7XG5cdFx0bGV0IGxpc3RlbmVyQ2FsbGVkID0gMDtcblx0XHRjb25zdCBkZWNJZCA9IGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXNNb2RlbC5vbkRpZENoYW5nZURlY29yYXRpb25zKChlKSA9PiB7XG5cdFx0XHRsaXN0ZW5lckNhbGxlZCsrO1xuXHRcdH0pO1xuXHRcdHRoaXNNb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24oZGVjSWQpO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0ZW5lckNhbGxlZCwgMSwgJ2xpc3RlbmVyIGNhbGxlZCcpO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBlbWl0IGV2ZW50IHdoZW4gaW5zZXJ0aW5nIG9uZSBsaW5lIHRleHQgYmVmb3JlIGl0JywgKCkgPT4ge1xuXHRcdGxldCBsaXN0ZW5lckNhbGxlZCA9IDA7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzTW9kZWwub25EaWRDaGFuZ2VEZWNvcmF0aW9ucygoZSkgPT4ge1xuXHRcdFx0bGlzdGVuZXJDYWxsZWQrKztcblx0XHR9KTtcblxuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMSksICdIYWxsbyAnKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0ZW5lckNhbGxlZCwgMSwgJ2xpc3RlbmVyIGNhbGxlZCcpO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBkbyBub3QgZW1pdCBldmVudCBvbiBuby1vcCBkZWx0YURlY29yYXRpb25zJywgKCkgPT4ge1xuXHRcdGxldCBsaXN0ZW5lckNhbGxlZCA9IDA7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpc01vZGVsLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKGUpID0+IHtcblx0XHRcdGxpc3RlbmVyQ2FsbGVkKys7XG5cdFx0fSk7XG5cblx0XHR0aGlzTW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhbXSwgW10pO1xuXHRcdHRoaXNNb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3IpID0+IHtcblx0XHRcdGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMoW10sIFtdKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0ZW5lckNhbGxlZCwgMCwgJ2xpc3RlbmVyIG5vdCBjYWxsZWQnKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIGVkaXRpbmcgdGV4dCAmIGVmZmVjdHMgb24gZGVjb3JhdGlvbnNcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGluc2VydGluZyBvbmUgbGluZSB0ZXh0IGJlZm9yZSBpdCcsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDEpLCAnSGFsbG8gJyldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCA4LCAzLCAyLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gaW5zZXJ0aW5nIG9uZSBsaW5lIHRleHQgYmVmb3JlIGl0IDInLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24ucmVwbGFjZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSksICdIYWxsbyAnKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDMsIDIsICdteVR5cGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgYXJlIHVwZGF0ZWQgd2hlbiBpbnNlcnRpbmcgbXVsdGlwbGUgbGluZXMgdGV4dCBiZWZvcmUgaXQnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAxKSwgJ0hhbGxvXFxuSVxcJ20gaW5zZXJ0aW5nIG11bHRpcGxlXFxubGluZXMnKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDMsIDcsIDUsIDIsICdteVR5cGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgY2hhbmdlIHdoZW4gaW5zZXJ0aW5nIHRleHQgYWZ0ZXIgdGhlbScsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDMsIDIpLCAnSGFsbG8nKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDcsICdteVR5cGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgYXJlIHVwZGF0ZWQgd2hlbiBpbnNlcnRpbmcgdGV4dCBpbnNpZGUnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAzKSwgJ0hhbGxvICcpXSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGluc2VydGluZyB0ZXh0IGluc2lkZSAyJywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMywgMSksICdIYWxsbyAnKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDgsICdteVR5cGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgYXJlIHVwZGF0ZWQgd2hlbiBpbnNlcnRpbmcgdGV4dCBpbnNpZGUgMycsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMiwgMTYsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAyLCAxNiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMiwgMiksICdcXG4nKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDMsIDE1LCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gaW5zZXJ0aW5nIG11bHRpcGxlIGxpbmVzIHRleHQgaW5zaWRlJywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMyksICdIYWxsb1xcbklcXCdtIGluc2VydGluZyBtdWx0aXBsZVxcbmxpbmVzJyldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCA1LCAyLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gZGVsZXRpbmcgb25lIGxpbmUgdGV4dCBiZWZvcmUgaXQnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAxLCAyKSldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAzLCAyLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gZGVsZXRpbmcgbXVsdGlwbGUgbGluZXMgdGV4dCBiZWZvcmUgaXQnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDIsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAyLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAyLCAxKSldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAyLCAyLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gZGVsZXRpbmcgbXVsdGlwbGUgbGluZXMgdGV4dCBiZWZvcmUgaXQgMicsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMiwgMywgMywgMiwgJ215VHlwZScpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDIsIDMsIDMsIDIsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDEsIDIsIDIpKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDIsIDIsICdteVR5cGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgYXJlIHVwZGF0ZWQgd2hlbiBkZWxldGluZyB0ZXh0IGluc2lkZScsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgNCwgMSwgJ215VHlwZScpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDQsIDEsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDMsIDIsIDEpKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDEsICdteVR5cGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgYXJlIHVwZGF0ZWQgd2hlbiBkZWxldGluZyB0ZXh0IGluc2lkZSAyJywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCA0LCAxLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgNCwgMSwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdEVkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAxLCAyKSksXG5cdFx0XHRFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoNCwgMSwgNCwgMSkpXG5cdFx0XSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgNCwgMSwgJ215VHlwZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGRlbGV0aW5nIG11bHRpcGxlIGxpbmVzIHRleHQnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDQsIDEsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCA0LCAxLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAzLCAxKSldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAyLCAxLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gY2hhbmdpbmcgRU9MJywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCA0LCAxLCAnbXlUeXBlMScpO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAzLCA0LCAxLCAnbXlUeXBlMicpO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCA0LCA0LCAxLCAnbXlUeXBlMycpO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCA1LCA0LCAxLCAnbXlUeXBlNCcpO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCA2LCA0LCAxLCAnbXlUeXBlNScpO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCA3LCA0LCAxLCAnbXlUeXBlNicpO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCA4LCA0LCAxLCAnbXlUeXBlNycpO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCA5LCA0LCAxLCAnbXlUeXBlOCcpO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAxMCwgNCwgMSwgJ215VHlwZTknKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDEpLCAneCcpXSk7XG5cdFx0dGhpc01vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDEpLCAneCcpXSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9ucyh0aGlzTW9kZWwsIFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA0LCA0LCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlMScgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCA0LCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlMicgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA2LCA0LCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlMycgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA3LCA0LCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlNCcgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA4LCA0LCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlNScgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA5LCA0LCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlNicgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMCwgNCwgMSksIGNsYXNzTmFtZTogJ215VHlwZTcnIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTEsIDQsIDEpLCBjbGFzc05hbWU6ICdteVR5cGU4JyB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDEyLCA0LCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlOScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYW4gYXBwYXJlbnRseSBzaW1wbGUgZWRpdCcsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgNCwgMSwgJ215VHlwZTEnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5yZXBsYWNlKG5ldyBSYW5nZSgxLCAxNCwgMiwgMSksICd4JyldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb25zKHRoaXNNb2RlbCwgW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDIsIDMsIDEpLCBjbGFzc05hbWU6ICdteVR5cGUxJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVBbGxEZWNvcmF0aW9uc1dpdGhPd25lcklkIGNhbiBiZSBjYWxsZWQgYWZ0ZXIgbW9kZWwgZGlzcG9zZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnYXNkJyk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdG1vZGVsLnJlbW92ZUFsbERlY29yYXRpb25zV2l0aE93bmVySWQoMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUFsbERlY29yYXRpb25zV2l0aE93bmVySWQgd29ya3MnLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMiwgNCwgMSksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JywgY2xhc3NOYW1lOiAnbXlUeXBlMScgfSB9XSwgMSk7XG5cdFx0dGhpc01vZGVsLnJlbW92ZUFsbERlY29yYXRpb25zV2l0aE93bmVySWQoMSk7XG5cdFx0bW9kZWxIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdEZWNvcmF0aW9ucyBhbmQgZWRpdGluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBfcnVuVGVzdChkZWNSYW5nZTogUmFuZ2UsIHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MsIGVkaXRSYW5nZTogUmFuZ2UsIGVkaXRUZXh0OiBzdHJpbmcsIGVkaXRGb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuLCBleHBlY3RlZERlY1JhbmdlOiBSYW5nZSwgbXNnOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHQnTXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0J1RoaXJkIExpbmUnXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRjb25zdCBpZCA9IG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFt7IHJhbmdlOiBkZWNSYW5nZSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBzdGlja2luZXNzOiBzdGlja2luZXNzIH0gfV0pWzBdO1xuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdHJhbmdlOiBlZGl0UmFuZ2UsXG5cdFx0XHR0ZXh0OiBlZGl0VGV4dCxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGVkaXRGb3JjZU1vdmVNYXJrZXJzXG5cdFx0fV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShpZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkRGVjUmFuZ2UsIG1zZyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH1cblxuXHRmdW5jdGlvbiBydW5UZXN0KGRlY1JhbmdlOiBSYW5nZSwgZWRpdFJhbmdlOiBSYW5nZSwgZWRpdFRleHQ6IHN0cmluZywgZXhwZWN0ZWREZWNSYW5nZTogUmFuZ2VbXVtdKTogdm9pZCB7XG5cdFx0X3J1blRlc3QoZGVjUmFuZ2UsIDAsIGVkaXRSYW5nZSwgZWRpdFRleHQsIGZhbHNlLCBleHBlY3RlZERlY1JhbmdlWzBdWzBdLCAnbm8tMC1BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzJyk7XG5cdFx0X3J1blRlc3QoZGVjUmFuZ2UsIDEsIGVkaXRSYW5nZSwgZWRpdFRleHQsIGZhbHNlLCBleHBlY3RlZERlY1JhbmdlWzBdWzFdLCAnbm8tMS1OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMnKTtcblx0XHRfcnVuVGVzdChkZWNSYW5nZSwgMiwgZWRpdFJhbmdlLCBlZGl0VGV4dCwgZmFsc2UsIGV4cGVjdGVkRGVjUmFuZ2VbMF1bMl0sICduby0yLUdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUnKTtcblx0XHRfcnVuVGVzdChkZWNSYW5nZSwgMywgZWRpdFJhbmdlLCBlZGl0VGV4dCwgZmFsc2UsIGV4cGVjdGVkRGVjUmFuZ2VbMF1bM10sICduby0zLUdyb3dzT25seVdoZW5UeXBpbmdBZnRlcicpO1xuXG5cdFx0X3J1blRlc3QoZGVjUmFuZ2UsIDAsIGVkaXRSYW5nZSwgZWRpdFRleHQsIHRydWUsIGV4cGVjdGVkRGVjUmFuZ2VbMV1bMF0sICdmb3JjZS0wLUFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMnKTtcblx0XHRfcnVuVGVzdChkZWNSYW5nZSwgMSwgZWRpdFJhbmdlLCBlZGl0VGV4dCwgdHJ1ZSwgZXhwZWN0ZWREZWNSYW5nZVsxXVsxXSwgJ2ZvcmNlLTEtTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzJyk7XG5cdFx0X3J1blRlc3QoZGVjUmFuZ2UsIDIsIGVkaXRSYW5nZSwgZWRpdFRleHQsIHRydWUsIGV4cGVjdGVkRGVjUmFuZ2VbMV1bMl0sICdmb3JjZS0yLUdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUnKTtcblx0XHRfcnVuVGVzdChkZWNSYW5nZSwgMywgZWRpdFJhbmdlLCBlZGl0VGV4dCwgdHJ1ZSwgZXhwZWN0ZWREZWNSYW5nZVsxXVszXSwgJ2ZvcmNlLTMtR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyJyk7XG5cdH1cblxuXHRzdWl0ZSgnaW5zZXJ0JywgKCkgPT4ge1xuXHRcdHN1aXRlKCdjb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYmVmb3JlJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgMyksICd4eCcsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VxdWFsJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksICd4eCcsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2FmdGVyJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgNSksICd4eCcsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRzdWl0ZSgnbm9uLWNvbGxhcHNlZCBkZWMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdiZWZvcmUnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgJ3h4Jyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2luc2lkZScsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDUpLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDksIDEsIDkpLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdhZnRlcicsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEwLCAxLCAxMCksICd4eCcsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2RlbGV0ZScsICgpID0+IHtcblx0XHRzdWl0ZSgnY29sbGFwc2VkIGRlYycsICgpID0+IHtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDwgcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAzKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAyLCAxLCAyKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDw9IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMiwgMSwgNCksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMildLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAyLCAxLCAyKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA1KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPj0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNiksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgNyksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ25vbi1jb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPCByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDMpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDIsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDcpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPD0gcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAyLCAxLCA0KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAyLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDIsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDUpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMywgMSwgNyksIG5ldyBSYW5nZSgxLCAzLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDcpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgNyksIG5ldyBSYW5nZSgxLCAzLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMywgMSwgNyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgOSksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDEwKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDYpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgMTApLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDcpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA5KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCAxMCksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgOSwgMSwgMTEpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMTAsIDEsIDExKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlcGxhY2Ugc2hvcnQnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ2NvbGxhcHNlZCBkZWMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMyksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPD0gcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAyLCAxLCA0KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA1KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID49IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDYpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDUsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNSwgMSwgNSksIG5ldyBSYW5nZSgxLCA1LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDUpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA3KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ25vbi1jb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPCByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDMpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIG5ldyBSYW5nZSgxLCAzLCAxLCA4KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIG5ldyBSYW5nZSgxLCAzLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDgpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDw9IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMiwgMSwgNCksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIG5ldyBSYW5nZSgxLCAzLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDgpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgOCksIG5ldyBSYW5nZSgxLCAzLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kIDwgcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgNSksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDkpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDEwKSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kIDwgcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNiksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNSwgMSwgOCksIG5ldyBSYW5nZSgxLCA1LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNSwgMSwgOCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA1LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNSwgMSwgNSksIG5ldyBSYW5nZSgxLCA1LCAxLCA1KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgMTApLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDUsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNSwgMSwgNSksIG5ldyBSYW5nZSgxLCA1LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDUpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5zdGFydCAmJiBlZGl0LnN0YXJ0IDwgcmFuZ2UuZW5kICYmIGVkaXQuZW5kIDwgcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgNyksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgOSksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNildLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCAxMCksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNildLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA5LCAxLCAxMSksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTApLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTApLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTApLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTApXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxMCwgMSwgMTEpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlcGxhY2UgbG9uZycsICgpID0+IHtcblx0XHRzdWl0ZSgnY29sbGFwc2VkIGRlYycsICgpID0+IHtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDwgcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAzKSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNildLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8PSByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDQpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDUpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNywgMSwgNyksIG5ldyBSYW5nZSgxLCA3LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDcsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPj0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNiksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgOCwgMSwgOCksIG5ldyBSYW5nZSgxLCA4LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDgsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgOCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDcpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRzdWl0ZSgnbm9uLWNvbGxhcHNlZCBkZWMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMyksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8PSByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDQpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kIDwgcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgNSksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDcsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDcsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDcsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDcsIDEsIDExKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgOSksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNywgMSwgNyksIG5ldyBSYW5nZSgxLCA3LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNywgMSwgNyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgMTApLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNywgMSwgNyksIG5ldyBSYW5nZSgxLCA3LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDcsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgOCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgMTEpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgOCwgMSwgOCksIG5ldyBSYW5nZSgxLCA4LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDgsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgOCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDEwKSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA4LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDgsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgOCksIG5ldyBSYW5nZSgxLCA4LCAxLCA4KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDcpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgOSksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCAxMCksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA5LCAxLCAxMSksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTMpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTMpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTMpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTMpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxMCwgMSwgMTEpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuaW50ZXJmYWNlIElMaWdodFdlaWdodERlY29yYXRpb24ge1xuXHRpZDogc3RyaW5nO1xuXHRyYW5nZTogUmFuZ2U7XG59XG5cbnN1aXRlKCdkZWx0YURlY29yYXRpb25zJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGRlY29yYXRpb24oaWQ6IHN0cmluZywgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZW5kQ29sdW06IG51bWJlcik6IElMaWdodFdlaWdodERlY29yYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogaWQsXG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtKVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiB0b01vZGVsRGVsdGFEZWNvcmF0aW9uKGRlYzogSUxpZ2h0V2VpZ2h0RGVjb3JhdGlvbik6IElNb2RlbERlbHRhRGVjb3JhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiBkZWMucmFuZ2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdGNsYXNzTmFtZTogZGVjLmlkXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN0cmNtcChhOiBzdHJpbmcsIGI6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0aWYgKGEgPT09IGIpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRpZiAoYSA8IGIpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIDE7XG5cdH1cblxuXHRmdW5jdGlvbiByZWFkTW9kZWxEZWNvcmF0aW9ucyhtb2RlbDogVGV4dE1vZGVsLCBpZHM6IHN0cmluZ1tdKTogSUxpZ2h0V2VpZ2h0RGVjb3JhdGlvbltdIHtcblx0XHRyZXR1cm4gaWRzLm1hcCgoaWQpID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpISxcblx0XHRcdFx0aWQ6IG1vZGVsLmdldERlY29yYXRpb25PcHRpb25zKGlkKSEuY2xhc3NOYW1lIVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRlc3REZWx0YURlY29yYXRpb25zKHRleHQ6IHN0cmluZ1tdLCBkZWNvcmF0aW9uczogSUxpZ2h0V2VpZ2h0RGVjb3JhdGlvbltdLCBuZXdEZWNvcmF0aW9uczogSUxpZ2h0V2VpZ2h0RGVjb3JhdGlvbltdKTogdm9pZCB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0LmpvaW4oJ1xcbicpKTtcblxuXHRcdC8vIEFkZCBpbml0aWFsIGRlY29yYXRpb25zICYgYXNzZXJ0IHRoZXkgYXJlIGFkZGVkXG5cdFx0Y29uc3QgaW5pdGlhbElkcyA9IG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIGRlY29yYXRpb25zLm1hcCh0b01vZGVsRGVsdGFEZWNvcmF0aW9uKSk7XG5cdFx0Y29uc3QgYWN0dWFsRGVjb3JhdGlvbnMgPSByZWFkTW9kZWxEZWNvcmF0aW9ucyhtb2RlbCwgaW5pdGlhbElkcyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5pdGlhbElkcy5sZW5ndGgsIGRlY29yYXRpb25zLmxlbmd0aCwgJ3JldHVybnMgZXhwZWN0ZWQgY250IG9mIGlkcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbml0aWFsSWRzLmxlbmd0aCwgbW9kZWwuZ2V0QWxsRGVjb3JhdGlvbnMoKS5sZW5ndGgsICdkb2VzIG5vdCBsZWFrIGRlY29yYXRpb25zJyk7XG5cdFx0YWN0dWFsRGVjb3JhdGlvbnMuc29ydCgoYSwgYikgPT4gc3RyY21wKGEuaWQsIGIuaWQpKTtcblx0XHRkZWNvcmF0aW9ucy5zb3J0KChhLCBiKSA9PiBzdHJjbXAoYS5pZCwgYi5pZCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsRGVjb3JhdGlvbnMsIGRlY29yYXRpb25zKTtcblxuXHRcdGNvbnN0IG5ld0lkcyA9IG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoaW5pdGlhbElkcywgbmV3RGVjb3JhdGlvbnMubWFwKHRvTW9kZWxEZWx0YURlY29yYXRpb24pKTtcblx0XHRjb25zdCBhY3R1YWxOZXdEZWNvcmF0aW9ucyA9IHJlYWRNb2RlbERlY29yYXRpb25zKG1vZGVsLCBuZXdJZHMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0lkcy5sZW5ndGgsIG5ld0RlY29yYXRpb25zLmxlbmd0aCwgJ3JldHVybnMgZXhwZWN0ZWQgY250IG9mIGlkcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdJZHMubGVuZ3RoLCBtb2RlbC5nZXRBbGxEZWNvcmF0aW9ucygpLmxlbmd0aCwgJ2RvZXMgbm90IGxlYWsgZGVjb3JhdGlvbnMnKTtcblx0XHRhY3R1YWxOZXdEZWNvcmF0aW9ucy5zb3J0KChhLCBiKSA9PiBzdHJjbXAoYS5pZCwgYi5pZCkpO1xuXHRcdG5ld0RlY29yYXRpb25zLnNvcnQoKGEsIGIpID0+IHN0cmNtcChhLmlkLCBiLmlkKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxEZWNvcmF0aW9ucywgZGVjb3JhdGlvbnMpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmFuZ2Uoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHR9XG5cblx0dGVzdCgncmVzdWx0IHJlc3BlY3RzIGlucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdIZWxsbyB3b3JsZCwnLFxuXHRcdFx0J0hvdyBhcmUgeW91Pydcblx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdGNvbnN0IGlkcyA9IG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFtcblx0XHRcdHRvTW9kZWxEZWx0YURlY29yYXRpb24oZGVjb3JhdGlvbignYScsIDEsIDEsIDEsIDEyKSksXG5cdFx0XHR0b01vZGVsRGVsdGFEZWNvcmF0aW9uKGRlY29yYXRpb24oJ2InLCAyLCAxLCAyLCAxMykpXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldERlY29yYXRpb25SYW5nZShpZHNbMF0pLCByYW5nZSgxLCAxLCAxLCAxMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkc1sxXSksIHJhbmdlKDIsIDEsIDIsIDEzKSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbHRhRGVjb3JhdGlvbnMgMScsICgpID0+IHtcblx0XHR0ZXN0RGVsdGFEZWNvcmF0aW9ucyhcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgYSB0ZXh0Jyxcblx0XHRcdFx0J1RoYXQgaGFzIG11bHRpcGxlIGxpbmVzJyxcblx0XHRcdFx0J0FuZCBpcyB2ZXJ5IGZyaWVuZGx5Jyxcblx0XHRcdFx0J1Rvd2FyZHMgdGVzdGluZydcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGRlY29yYXRpb24oJ2EnLCAxLCAxLCAxLCAyKSxcblx0XHRcdFx0ZGVjb3JhdGlvbignYicsIDEsIDEsIDEsIDE1KSxcblx0XHRcdFx0ZGVjb3JhdGlvbignYycsIDEsIDEsIDIsIDEpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdkJywgMSwgMSwgMiwgMjQpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdlJywgMiwgMSwgMiwgMjQpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdmJywgMiwgMSwgNCwgMTYpXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRkZWNvcmF0aW9uKCd4JywgMSwgMSwgMSwgMiksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2InLCAxLCAxLCAxLCAxNSksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2MnLCAxLCAxLCAyLCAxKSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZCcsIDEsIDEsIDIsIDI0KSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZScsIDIsIDEsIDIsIDIxKSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZicsIDIsIDE3LCA0LCAxNilcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWx0YURlY29yYXRpb25zIDInLCAoKSA9PiB7XG5cdFx0dGVzdERlbHRhRGVjb3JhdGlvbnMoXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIGEgdGV4dCcsXG5cdFx0XHRcdCdUaGF0IGhhcyBtdWx0aXBsZSBsaW5lcycsXG5cdFx0XHRcdCdBbmQgaXMgdmVyeSBmcmllbmRseScsXG5cdFx0XHRcdCdUb3dhcmRzIHRlc3RpbmcnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRkZWNvcmF0aW9uKCdhJywgMSwgMSwgMSwgMiksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2InLCAxLCAyLCAxLCAzKSxcblx0XHRcdFx0ZGVjb3JhdGlvbignYycsIDEsIDMsIDEsIDQpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdkJywgMSwgNCwgMSwgNSksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2UnLCAxLCA1LCAxLCA2KVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZGVjb3JhdGlvbignYScsIDEsIDIsIDEsIDMpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdiJywgMSwgMywgMSwgNCksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2MnLCAxLCA0LCAxLCA1KSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZCcsIDEsIDUsIDEsIDYpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsdGFEZWNvcmF0aW9ucyAzJywgKCkgPT4ge1xuXHRcdHRlc3REZWx0YURlY29yYXRpb25zKFxuXHRcdFx0W1xuXHRcdFx0XHQnVGhpcyBpcyBhIHRleHQnLFxuXHRcdFx0XHQnVGhhdCBoYXMgbXVsdGlwbGUgbGluZXMnLFxuXHRcdFx0XHQnQW5kIGlzIHZlcnkgZnJpZW5kbHknLFxuXHRcdFx0XHQnVG93YXJkcyB0ZXN0aW5nJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZGVjb3JhdGlvbignYScsIDEsIDEsIDEsIDIpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdiJywgMSwgMiwgMSwgMyksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2MnLCAxLCAzLCAxLCA0KSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZCcsIDEsIDQsIDEsIDUpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdlJywgMSwgNSwgMSwgNilcblx0XHRcdF0sXG5cdFx0XHRbXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0MzE3OiBlZGl0b3Iuc2V0RGVjb3JhdGlvbnMgZG9lc25cXCd0IHVwZGF0ZSB0aGUgaG92ZXIgbWVzc2FnZScsICgpID0+IHtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdIZWxsbyB3b3JsZCEnKTtcblxuXHRcdGxldCBpZHMgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbe1xuXHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTAwLFxuXHRcdFx0XHRlbmRDb2x1bW46IDFcblx0XHRcdH0sXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdGhvdmVyTWVzc2FnZTogeyB2YWx1ZTogJ2hlbGxvMScgfVxuXHRcdFx0fVxuXHRcdH1dKTtcblxuXHRcdGlkcyA9IG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoaWRzLCBbe1xuXHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTAwLFxuXHRcdFx0XHRlbmRDb2x1bW46IDFcblx0XHRcdH0sXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdGhvdmVyTWVzc2FnZTogeyB2YWx1ZTogJ2hlbGxvMicgfVxuXHRcdFx0fVxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IGFjdHVhbERlY29yYXRpb24gPSBtb2RlbC5nZXREZWNvcmF0aW9uT3B0aW9ucyhpZHNbMF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxEZWNvcmF0aW9uIS5ob3Zlck1lc3NhZ2UsIHsgdmFsdWU6ICdoZWxsbzInIH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkb2VzblxcJ3QgZ2V0IGNvbmZ1c2VkIHdpdGggaW5kaXZpZHVhbCB0cmFja2VkIHJhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnSGVsbG8gd29ybGQsJyxcblx0XHRcdCdIb3cgYXJlIHlvdT8nXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRjb25zdCB0cmFja2VkUmFuZ2VJZCA9IG1vZGVsLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Vzc29yKSA9PiB7XG5cdFx0XHRyZXR1cm4gY2hhbmdlQWNlc3Nvci5hZGREZWNvcmF0aW9uKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdG1vZGVsLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y2hhbmdlQWNjZXNzb3IucmVtb3ZlRGVjb3JhdGlvbih0cmFja2VkUmFuZ2VJZCEpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGlkcyA9IG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFtcblx0XHRcdHRvTW9kZWxEZWx0YURlY29yYXRpb24oZGVjb3JhdGlvbignYScsIDEsIDEsIDEsIDEyKSksXG5cdFx0XHR0b01vZGVsRGVsdGFEZWNvcmF0aW9uKGRlY29yYXRpb24oJ2InLCAyLCAxLCAyLCAxMykpXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldERlY29yYXRpb25SYW5nZShpZHNbMF0pLCByYW5nZSgxLCAxLCAxLCAxMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkc1sxXSksIHJhbmdlKDIsIDEsIDIsIDEzKSk7XG5cblx0XHRpZHMgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKGlkcywgW1xuXHRcdFx0dG9Nb2RlbERlbHRhRGVjb3JhdGlvbihkZWNvcmF0aW9uKCdhJywgMSwgMSwgMSwgMTIpKSxcblx0XHRcdHRvTW9kZWxEZWx0YURlY29yYXRpb24oZGVjb3JhdGlvbignYicsIDIsIDEsIDIsIDEzKSlcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkc1swXSksIHJhbmdlKDEsIDEsIDEsIDEyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoaWRzWzFdKSwgcmFuZ2UoMiwgMSwgMiwgMTMpKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2OTIyOiBDbGlja2luZyBvbiBsaW5rIGRvZXNuXFwndCBzZWVtIHRvIGRvIGFueXRoaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdIZWxsbyB3b3JsZCwnLFxuXHRcdFx0J0hvdyBhcmUgeW91PycsXG5cdFx0XHQnRmluZS4nLFxuXHRcdFx0J0dvb2QuJyxcblx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBjbGFzc05hbWU6ICcxJyB9IH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTMsIDEsIDEzKSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBjbGFzc05hbWU6ICcyJyB9IH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JywgY2xhc3NOYW1lOiAnMycgfSB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDQpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcsIGNsYXNzTmFtZTogJzQnIH0gfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgyLCA4LCAyLCAxMyksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JywgY2xhc3NOYW1lOiAnNScgfSB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDMsIDEsIDQsIDYpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcsIGNsYXNzTmFtZTogJzYnIH0gfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAzLCA2KSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBjbGFzc05hbWU6ICd4MScgfSB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDIsIDUsIDIsIDgpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcsIGNsYXNzTmFtZTogJ3gyJyB9IH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMiwgOCksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JywgY2xhc3NOYW1lOiAneDMnIH0gfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgyLCA1LCAzLCAxKSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBjbGFzc05hbWU6ICd4NCcgfSB9LFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgaW5SYW5nZSA9IG1vZGVsLmdldERlY29yYXRpb25zSW5SYW5nZShuZXcgUmFuZ2UoMiwgNiwgMiwgNikpO1xuXG5cdFx0Y29uc3QgaW5SYW5nZUNsYXNzTmFtZXMgPSBpblJhbmdlLm1hcChkID0+IGQub3B0aW9ucy5jbGFzc05hbWUpO1xuXHRcdGluUmFuZ2VDbGFzc05hbWVzLnNvcnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluUmFuZ2VDbGFzc05hbWVzLCBbJ3gxJywgJ3gyJywgJ3gzJywgJ3g0J10pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDE0OTI6IFVSTCBoaWdobGlnaHRpbmcgcGVyc2lzdHMgYWZ0ZXIgcGFzdGluZyBvdmVyIHVybCcsICgpID0+IHtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdNeSBGaXJzdCBMaW5lJ1xuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0Y29uc3QgaWQgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDIsIDEsIDE0KSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgY29sbGFwc2VPblJlcGxhY2VFZGl0OiB0cnVlIH0gfV0pWzBdO1xuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTQpLFxuXHRcdFx0dGV4dDogJ1NvbWUgbmV3IHRleHQgdGhhdCBpcyBsb25nZXIgdGhhbiB0aGUgcHJldmlvdXMgb25lJyxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0fV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShpZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxLCAxLCAxKSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQTBDLDhCQUE4QjtBQUVqRixTQUFTLHVCQUF1QjtBQVNoQyxTQUFTLG9CQUFvQixPQUFrQixhQUF3QztBQUN0RixRQUFNLG1CQUE4QyxDQUFDO0FBQ3JELFFBQU0sb0JBQW9CLE1BQU0sa0JBQWtCO0FBQ2xELFdBQVMsSUFBSSxHQUFHLE1BQU0s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QUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxXQUFLLFVBQVUsTUFBTTtBQUNwQjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDL0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxTQUFTLE1BQU07QUFDbkI7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUFBLFlBQy9GLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUFBLFVBQ2hHO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssVUFBVSxNQUFNO0FBQ3BCO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxZQUMvRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxVQUNoRztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLE9BQU8sTUFBTTtBQUNqQjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDN0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxTQUFTLE1BQU07QUFDbkI7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxVQUFHO0FBQUEsVUFDekI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sVUFBVSxNQUFNO0FBQ3JCLFVBQU0saUJBQWlCLE1BQU07QUFDNUIsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxXQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLHNEQUFzRCxNQUFNO0FBQ2hFO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLDhFQUE4RSxNQUFNO0FBQ3hGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLCtFQUErRSxNQUFNO0FBQ3pGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLDhFQUE4RSxNQUFNO0FBQ3hGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3pCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGlCQUFpQixNQUFNO0FBQzVCLFVBQU0saUJBQWlCLE1BQU07QUFDNUIsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxXQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHNEQUFzRCxNQUFNO0FBQ2hFO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDhFQUE4RSxNQUFNO0FBQ3hGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLCtFQUErRSxNQUFNO0FBQ3pGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDhFQUE4RSxNQUFNO0FBQ3hGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxVQUNoRztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3pCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGdCQUFnQixNQUFNO0FBQzNCLFVBQU0saUJBQWlCLE1BQU07QUFDNUIsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxXQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxZQUMvRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxVQUNoRztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxZQUMvRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxVQUNoRztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxZQUMvRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxVQUNoRztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxZQUMvRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxVQUNoRztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHNEQUFzRCxNQUFNO0FBQ2hFO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDhFQUE4RSxNQUFNO0FBQ3hGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxZQUMvRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxVQUNoRztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLCtFQUErRSxNQUFNO0FBQ3pGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDhFQUE4RSxNQUFNO0FBQ3hGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxVQUNoRztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3pCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFB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LFdBQVcsS0FBSyxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzQkFBc0IsTUFBTTtBQUNoQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMxQixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUMzQjtBQUFBLE1BQ0E7QUFBQSxRQUNDLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMxQixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDM0I7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzQkFBc0IsTUFBTTtBQUNoQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMxQixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUMz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
