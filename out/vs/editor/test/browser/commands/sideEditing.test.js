import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { withTestCodeEditor } from "../testCodeEditor.js";
function testCommand(lines, selections, edits, expectedLines, expectedSelections) {
  withTestCodeEditor(lines, {}, (editor, viewModel) => {
    const model = editor.getModel();
    viewModel.setSelections("tests", selections);
    model.applyEdits(edits);
    assert.deepStrictEqual(model.getLinesContent(), expectedLines);
    const actualSelections = viewModel.getSelections();
    assert.deepStrictEqual(actualSelections.map((s) => s.toString()), expectedSelections.map((s) => s.toString()));
  });
}
suite("Editor Side Editing - collapsed selection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("replace at selection", () => {
    testCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth"
      ],
      [new Selection(1, 1, 1, 1)],
      [
        EditOperation.replace(new Selection(1, 1, 1, 1), "something ")
      ],
      [
        "something first",
        "second line",
        "third line",
        "fourth"
      ],
      [new Selection(1, 11, 1, 11)]
    );
  });
  test("replace at selection 2", () => {
    testCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth"
      ],
      [new Selection(1, 1, 1, 6)],
      [
        EditOperation.replace(new Selection(1, 1, 1, 6), "something")
      ],
      [
        "something",
        "second line",
        "third line",
        "fourth"
      ],
      [new Selection(1, 1, 1, 10)]
    );
  });
  test("insert at selection", () => {
    testCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth"
      ],
      [new Selection(1, 1, 1, 1)],
      [
        EditOperation.insert(new Position(1, 1), "something ")
      ],
      [
        "something first",
        "second line",
        "third line",
        "fourth"
      ],
      [new Selection(1, 11, 1, 11)]
    );
  });
  test("insert at selection sitting on max column", () => {
    testCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth"
      ],
      [new Selection(1, 6, 1, 6)],
      [
        EditOperation.insert(new Position(1, 6), " something\nnew ")
      ],
      [
        "first something",
        "new ",
        "second line",
        "third line",
        "fourth"
      ],
      [new Selection(2, 5, 2, 5)]
    );
  });
  test("issue #3994: replace on top of selection", () => {
    testCommand(
      [
        '$obj = New-Object "system.col"'
      ],
      [new Selection(1, 30, 1, 30)],
      [
        EditOperation.replaceMove(new Range(1, 19, 1, 31), '"System.Collections"')
      ],
      [
        '$obj = New-Object "System.Collections"'
      ],
      [new Selection(1, 39, 1, 39)]
    );
  });
  test("issue #15267: Suggestion that adds a line - cursor goes to the wrong line ", () => {
    testCommand(
      [
        "package main",
        "",
        "import (",
        '	"fmt"',
        ")",
        "",
        "func main(",
        "	fmt.Println(strings.Con)",
        "}"
      ],
      [new Selection(8, 25, 8, 25)],
      [
        EditOperation.replaceMove(new Range(5, 1, 5, 1), '	"strings"\n')
      ],
      [
        "package main",
        "",
        "import (",
        '	"fmt"',
        '	"strings"',
        ")",
        "",
        "func main(",
        "	fmt.Println(strings.Con)",
        "}"
      ],
      [new Selection(9, 25, 9, 25)]
    );
  });
  test("issue #15236: Selections broke after deleting text using vscode.TextEditor.edit ", () => {
    testCommand(
      [
        "foofoofoo, foofoofoo, bar"
      ],
      [new Selection(1, 1, 1, 10), new Selection(1, 12, 1, 21)],
      [
        EditOperation.replace(new Range(1, 1, 1, 10), ""),
        EditOperation.replace(new Range(1, 12, 1, 21), "")
      ],
      [
        ", , bar"
      ],
      [new Selection(1, 1, 1, 1), new Selection(1, 3, 1, 3)]
    );
  });
});
suite("SideEditing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const LINES = [
    "My First Line",
    "My Second Line",
    "Third Line"
  ];
  function _runTest(selection, editRange, editText, editForceMoveMarkers, expected, msg) {
    withTestCodeEditor(LINES.join("\n"), {}, (editor, viewModel) => {
      viewModel.setSelections("tests", [selection]);
      editor.getModel().applyEdits([{
        range: editRange,
        text: editText,
        forceMoveMarkers: editForceMoveMarkers
      }]);
      const actual = viewModel.getSelection();
      assert.deepStrictEqual(actual.toString(), expected.toString(), msg);
    });
  }
  function runTest(selection, editRange, editText, expected) {
    const sel1 = new Selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn);
    _runTest(sel1, editRange, editText, false, expected[0][0], "0-0-regular-no-force");
    _runTest(sel1, editRange, editText, true, expected[1][0], "1-0-regular-force");
    const sel2 = new Selection(selection.endLineNumber, selection.endColumn, selection.startLineNumber, selection.startColumn);
    _runTest(sel2, editRange, editText, false, expected[0][1], "0-1-inverse-no-force");
    _runTest(sel2, editRange, editText, true, expected[1][1], "1-1-inverse-force");
  }
  suite("insert", () => {
    suite("collapsed sel", () => {
      test("before", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 3),
          "xx",
          [
            [new Selection(1, 6, 1, 6), new Selection(1, 6, 1, 6)],
            [new Selection(1, 6, 1, 6), new Selection(1, 6, 1, 6)]
          ]
        );
      });
      test("equal", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 4),
          "xx",
          [
            [new Selection(1, 6, 1, 6), new Selection(1, 6, 1, 6)],
            [new Selection(1, 6, 1, 6), new Selection(1, 6, 1, 6)]
          ]
        );
      });
      test("after", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 5),
          "xx",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
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
            [new Selection(1, 6, 1, 11), new Selection(1, 11, 1, 6)],
            [new Selection(1, 6, 1, 11), new Selection(1, 11, 1, 6)]
          ]
        );
      });
      test("start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 4),
          "xx",
          [
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)],
            [new Selection(1, 6, 1, 11), new Selection(1, 11, 1, 6)]
          ]
        );
      });
      test("inside", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 5),
          "xx",
          [
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)],
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)]
          ]
        );
      });
      test("end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 9),
          "xx",
          [
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)],
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)]
          ]
        );
      });
      test("after", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 10),
          "xx",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)]
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
            [new Selection(1, 2, 1, 2), new Selection(1, 2, 1, 2)],
            [new Selection(1, 2, 1, 2), new Selection(1, 2, 1, 2)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "",
          [
            [new Selection(1, 2, 1, 2), new Selection(1, 2, 1, 2)],
            [new Selection(1, 2, 1, 2), new Selection(1, 2, 1, 2)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "",
          [
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)],
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
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
            [new Selection(1, 2, 1, 7), new Selection(1, 7, 1, 2)],
            [new Selection(1, 2, 1, 7), new Selection(1, 7, 1, 2)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "",
          [
            [new Selection(1, 2, 1, 7), new Selection(1, 7, 1, 2)],
            [new Selection(1, 2, 1, 7), new Selection(1, 7, 1, 2)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "",
          [
            [new Selection(1, 3, 1, 7), new Selection(1, 7, 1, 3)],
            [new Selection(1, 3, 1, 7), new Selection(1, 7, 1, 3)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "",
          [
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)],
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "",
          [
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)],
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "",
          [
            [new Selection(1, 4, 1, 7), new Selection(1, 7, 1, 4)],
            [new Selection(1, 4, 1, 7), new Selection(1, 7, 1, 4)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "",
          [
            [new Selection(1, 4, 1, 7), new Selection(1, 7, 1, 4)],
            [new Selection(1, 4, 1, 7), new Selection(1, 7, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "",
          [
            [new Selection(1, 4, 1, 5), new Selection(1, 5, 1, 4)],
            [new Selection(1, 4, 1, 5), new Selection(1, 5, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "",
          [
            [new Selection(1, 4, 1, 5), new Selection(1, 5, 1, 4)],
            [new Selection(1, 4, 1, 5), new Selection(1, 5, 1, 4)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)]
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
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)],
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "c",
          [
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)],
            [new Selection(1, 3, 1, 3), new Selection(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "c",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "c",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 5, 1, 5), new Selection(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "c",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
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
            [new Selection(1, 3, 1, 8), new Selection(1, 8, 1, 3)],
            [new Selection(1, 3, 1, 8), new Selection(1, 8, 1, 3)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "c",
          [
            [new Selection(1, 3, 1, 8), new Selection(1, 8, 1, 3)],
            [new Selection(1, 3, 1, 8), new Selection(1, 8, 1, 3)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "c",
          [
            [new Selection(1, 4, 1, 8), new Selection(1, 8, 1, 4)],
            [new Selection(1, 4, 1, 8), new Selection(1, 8, 1, 4)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "c",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "c",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "c",
          [
            [new Selection(1, 4, 1, 8), new Selection(1, 8, 1, 4)],
            [new Selection(1, 5, 1, 8), new Selection(1, 8, 1, 5)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "c",
          [
            [new Selection(1, 4, 1, 5), new Selection(1, 5, 1, 4)],
            [new Selection(1, 5, 1, 5), new Selection(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "c",
          [
            [new Selection(1, 4, 1, 5), new Selection(1, 5, 1, 4)],
            [new Selection(1, 5, 1, 5), new Selection(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "c",
          [
            [new Selection(1, 4, 1, 8), new Selection(1, 8, 1, 4)],
            [new Selection(1, 4, 1, 8), new Selection(1, 8, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "c",
          [
            [new Selection(1, 4, 1, 6), new Selection(1, 6, 1, 4)],
            [new Selection(1, 4, 1, 6), new Selection(1, 6, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "c",
          [
            [new Selection(1, 4, 1, 6), new Selection(1, 6, 1, 4)],
            [new Selection(1, 4, 1, 6), new Selection(1, 6, 1, 4)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "c",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 10), new Selection(1, 10, 1, 4)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "c",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)]
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
            [new Selection(1, 6, 1, 6), new Selection(1, 6, 1, 6)],
            [new Selection(1, 6, 1, 6), new Selection(1, 6, 1, 6)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "cccc",
          [
            [new Selection(1, 6, 1, 6), new Selection(1, 6, 1, 6)],
            [new Selection(1, 6, 1, 6), new Selection(1, 6, 1, 6)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "cccc",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 7, 1, 7), new Selection(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "cccc",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 8, 1, 8), new Selection(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "cccc",
          [
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)],
            [new Selection(1, 4, 1, 4), new Selection(1, 4, 1, 4)]
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
            [new Selection(1, 6, 1, 11), new Selection(1, 11, 1, 6)],
            [new Selection(1, 6, 1, 11), new Selection(1, 11, 1, 6)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "cccc",
          [
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)],
            [new Selection(1, 6, 1, 11), new Selection(1, 11, 1, 6)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "cccc",
          [
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)],
            [new Selection(1, 7, 1, 11), new Selection(1, 11, 1, 7)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "cccc",
          [
            [new Selection(1, 4, 1, 7), new Selection(1, 7, 1, 4)],
            [new Selection(1, 7, 1, 7), new Selection(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "cccc",
          [
            [new Selection(1, 4, 1, 7), new Selection(1, 7, 1, 4)],
            [new Selection(1, 7, 1, 7), new Selection(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "cccc",
          [
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)],
            [new Selection(1, 8, 1, 11), new Selection(1, 11, 1, 8)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "cccc",
          [
            [new Selection(1, 4, 1, 8), new Selection(1, 8, 1, 4)],
            [new Selection(1, 8, 1, 8), new Selection(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "cccc",
          [
            [new Selection(1, 4, 1, 8), new Selection(1, 8, 1, 4)],
            [new Selection(1, 8, 1, 8), new Selection(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "cccc",
          [
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)],
            [new Selection(1, 4, 1, 11), new Selection(1, 11, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "cccc",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "cccc",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "cccc",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 13), new Selection(1, 13, 1, 4)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "cccc",
          [
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)],
            [new Selection(1, 4, 1, 9), new Selection(1, 9, 1, 4)]
          ]
        );
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGNvbW1hbmRzXFxzaWRlRWRpdGluZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uLCBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyB3aXRoVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi90ZXN0Q29kZUVkaXRvci5qcyc7XG5cbmZ1bmN0aW9uIHRlc3RDb21tYW5kKGxpbmVzOiBzdHJpbmdbXSwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBleHBlY3RlZExpbmVzOiBzdHJpbmdbXSwgZXhwZWN0ZWRTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHR3aXRoVGVzdENvZGVFZGl0b3IobGluZXMsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblxuXHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0cycsIHNlbGVjdGlvbnMpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0cyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBleHBlY3RlZExpbmVzKTtcblxuXHRcdGNvbnN0IGFjdHVhbFNlbGVjdGlvbnMgPSB2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsU2VsZWN0aW9ucy5tYXAocyA9PiBzLnRvU3RyaW5nKCkpLCBleHBlY3RlZFNlbGVjdGlvbnMubWFwKHMgPT4gcy50b1N0cmluZygpKSk7XG5cblx0fSk7XG59XG5cbnN1aXRlKCdFZGl0b3IgU2lkZSBFZGl0aW5nIC0gY29sbGFwc2VkIHNlbGVjdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXBsYWNlIGF0IHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoJ1xuXHRcdFx0XSxcblx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSxcblx0XHRcdFtcblx0XHRcdFx0RWRpdE9wZXJhdGlvbi5yZXBsYWNlKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksICdzb21ldGhpbmcgJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdzb21ldGhpbmcgZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGgnXG5cdFx0XHRdLFxuXHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDExKV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlIGF0IHNlbGVjdGlvbiAyJywgKCkgPT4ge1xuXHRcdHRlc3RDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGgnXG5cdFx0XHRdLFxuXHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNildLFxuXHRcdFx0W1xuXHRcdFx0XHRFZGl0T3BlcmF0aW9uLnJlcGxhY2UobmV3IFNlbGVjdGlvbigxLCAxLCAxLCA2KSwgJ3NvbWV0aGluZycpXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZXRoaW5nJyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoJ1xuXHRcdFx0XSxcblx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEwKV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgYXQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3RDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGgnXG5cdFx0XHRdLFxuXHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldLFxuXHRcdFx0W1xuXHRcdFx0XHRFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMSksICdzb21ldGhpbmcgJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdzb21ldGhpbmcgZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGgnXG5cdFx0XHRdLFxuXHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDExKV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgYXQgc2VsZWN0aW9uIHNpdHRpbmcgb24gbWF4IGNvbHVtbicsICgpID0+IHtcblx0XHR0ZXN0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoJ1xuXHRcdFx0XSxcblx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpXSxcblx0XHRcdFtcblx0XHRcdFx0RWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDYpLCAnIHNvbWV0aGluZ1xcbm5ldyAnKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0IHNvbWV0aGluZycsXG5cdFx0XHRcdCduZXcgJyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoJ1xuXHRcdFx0XSxcblx0XHRcdFtuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzOTk0OiByZXBsYWNlIG9uIHRvcCBvZiBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCckb2JqID0gTmV3LU9iamVjdCBcInN5c3RlbS5jb2xcIidcblx0XHRcdF0sXG5cdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAzMCwgMSwgMzApXSxcblx0XHRcdFtcblx0XHRcdFx0RWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShuZXcgUmFuZ2UoMSwgMTksIDEsIDMxKSwgJ1wiU3lzdGVtLkNvbGxlY3Rpb25zXCInKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0JyRvYmogPSBOZXctT2JqZWN0IFwiU3lzdGVtLkNvbGxlY3Rpb25zXCInXG5cdFx0XHRdLFxuXHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMzksIDEsIDM5KV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTUyNjc6IFN1Z2dlc3Rpb24gdGhhdCBhZGRzIGEgbGluZSAtIGN1cnNvciBnb2VzIHRvIHRoZSB3cm9uZyBsaW5lICcsICgpID0+IHtcblx0XHR0ZXN0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J3BhY2thZ2UgbWFpbicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnaW1wb3J0ICgnLFxuXHRcdFx0XHQnXHRcImZtdFwiJyxcblx0XHRcdFx0JyknLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2Z1bmMgbWFpbignLFxuXHRcdFx0XHQnXHRmbXQuUHJpbnRsbihzdHJpbmdzLkNvbiknLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0sXG5cdFx0XHRbbmV3IFNlbGVjdGlvbig4LCAyNSwgOCwgMjUpXSxcblx0XHRcdFtcblx0XHRcdFx0RWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShuZXcgUmFuZ2UoNSwgMSwgNSwgMSksICdcXHRcXFwic3RyaW5nc1xcXCJcXG4nKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3BhY2thZ2UgbWFpbicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnaW1wb3J0ICgnLFxuXHRcdFx0XHQnXHRcImZtdFwiJyxcblx0XHRcdFx0J1x0XCJzdHJpbmdzXCInLFxuXHRcdFx0XHQnKScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnZnVuYyBtYWluKCcsXG5cdFx0XHRcdCdcdGZtdC5QcmludGxuKHN0cmluZ3MuQ29uKScsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XSxcblx0XHRcdFtuZXcgU2VsZWN0aW9uKDksIDI1LCA5LCAyNSldXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1MjM2OiBTZWxlY3Rpb25zIGJyb2tlIGFmdGVyIGRlbGV0aW5nIHRleHQgdXNpbmcgdnNjb2RlLlRleHRFZGl0b3IuZWRpdCAnLCAoKSA9PiB7XG5cdFx0dGVzdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmb29mb29mb28sIGZvb2Zvb2ZvbywgYmFyJ1xuXHRcdFx0XSxcblx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEwKSwgbmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMjEpXSxcblx0XHRcdFtcblx0XHRcdFx0RWRpdE9wZXJhdGlvbi5yZXBsYWNlKG5ldyBSYW5nZSgxLCAxLCAxLCAxMCksICcnKSxcblx0XHRcdFx0RWRpdE9wZXJhdGlvbi5yZXBsYWNlKG5ldyBSYW5nZSgxLCAxMiwgMSwgMjEpLCAnJyksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnLCAsIGJhcidcblx0XHRcdF0sXG5cdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV1cblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnU2lkZUVkaXRpbmcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgTElORVMgPSBbXG5cdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdCdNeSBTZWNvbmQgTGluZScsXG5cdFx0J1RoaXJkIExpbmUnXG5cdF07XG5cblx0ZnVuY3Rpb24gX3J1blRlc3Qoc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGVkaXRSYW5nZTogUmFuZ2UsIGVkaXRUZXh0OiBzdHJpbmcsIGVkaXRGb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuLCBleHBlY3RlZDogU2VsZWN0aW9uLCBtc2c6IHN0cmluZyk6IHZvaWQge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihMSU5FUy5qb2luKCdcXG4nKSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3RzJywgW3NlbGVjdGlvbl0pO1xuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRyYW5nZTogZWRpdFJhbmdlLFxuXHRcdFx0XHR0ZXh0OiBlZGl0VGV4dCxcblx0XHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogZWRpdEZvcmNlTW92ZU1hcmtlcnNcblx0XHRcdH1dKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnRvU3RyaW5nKCksIGV4cGVjdGVkLnRvU3RyaW5nKCksIG1zZyk7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBydW5UZXN0KHNlbGVjdGlvbjogUmFuZ2UsIGVkaXRSYW5nZTogUmFuZ2UsIGVkaXRUZXh0OiBzdHJpbmcsIGV4cGVjdGVkOiBTZWxlY3Rpb25bXVtdKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsMSA9IG5ldyBTZWxlY3Rpb24oc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uLCBzZWxlY3Rpb24uZW5kTGluZU51bWJlciwgc2VsZWN0aW9uLmVuZENvbHVtbik7XG5cdFx0X3J1blRlc3Qoc2VsMSwgZWRpdFJhbmdlLCBlZGl0VGV4dCwgZmFsc2UsIGV4cGVjdGVkWzBdWzBdLCAnMC0wLXJlZ3VsYXItbm8tZm9yY2UnKTtcblx0XHRfcnVuVGVzdChzZWwxLCBlZGl0UmFuZ2UsIGVkaXRUZXh0LCB0cnVlLCBleHBlY3RlZFsxXVswXSwgJzEtMC1yZWd1bGFyLWZvcmNlJyk7XG5cblx0XHQvLyBSVEwgc2VsZWN0aW9uXG5cdFx0Y29uc3Qgc2VsMiA9IG5ldyBTZWxlY3Rpb24oc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRDb2x1bW4sIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvbi5zdGFydENvbHVtbik7XG5cdFx0X3J1blRlc3Qoc2VsMiwgZWRpdFJhbmdlLCBlZGl0VGV4dCwgZmFsc2UsIGV4cGVjdGVkWzBdWzFdLCAnMC0xLWludmVyc2Utbm8tZm9yY2UnKTtcblx0XHRfcnVuVGVzdChzZWwyLCBlZGl0UmFuZ2UsIGVkaXRUZXh0LCB0cnVlLCBleHBlY3RlZFsxXVsxXSwgJzEtMS1pbnZlcnNlLWZvcmNlJyk7XG5cdH1cblxuXHRzdWl0ZSgnaW5zZXJ0JywgKCkgPT4ge1xuXHRcdHN1aXRlKCdjb2xsYXBzZWQgc2VsJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYmVmb3JlJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgMyksICd4eCcsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNiksIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNildLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNiksIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNildLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZXF1YWwnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgJ3h4Jyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdhZnRlcicsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDUpLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRzdWl0ZSgnbm9uLWNvbGxhcHNlZCBkZWMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdiZWZvcmUnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgJ3h4Jyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCAxMSksIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDYpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDExKSwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgNildLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgJ3h4Jyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCAxMSksIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDExKSwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgNildLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnaW5zaWRlJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgNSksICd4eCcsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMTEpLCBuZXcgU2VsZWN0aW9uKDEsIDExLCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCAxMSksIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDksIDEsIDkpLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDExKSwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMTEpLCBuZXcgU2VsZWN0aW9uKDEsIDExLCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdhZnRlcicsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEwLCAxLCAxMCksICd4eCcsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGVsZXRlJywgKCkgPT4ge1xuXHRcdHN1aXRlKCdjb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPCByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDMpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSwgbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSwgbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8PSByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDQpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSwgbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSwgbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA1KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyksIG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyksIG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDcpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ25vbi1jb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPCByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDMpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCA3KSwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCAyKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCA3KSwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCAyKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8PSByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDQpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCA3KSwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCAyKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCA3KSwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCAyKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA1KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMywgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgMyldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMywgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgMyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgOSksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgMTApLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCAxMCksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA3KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA5KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSksIG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSksIG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDEwKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSksIG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSksIG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDksIDEsIDExKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMTAsIDEsIDExKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVwbGFjZSBzaG9ydCcsICgpID0+IHtcblx0XHRzdWl0ZSgnY29sbGFwc2VkIGRlYycsICgpID0+IHtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDwgcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAzKSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDw9IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMiwgMSwgNCksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA1KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPj0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNiksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgNyksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ25vbi1jb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPCByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDMpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMywgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgMyldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgMywgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgMyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPD0gcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAyLCAxLCA0KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDgpLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDMpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDgpLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDMpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDUpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDkpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgMTApLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDYpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgNSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDUpLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCAxMCksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA1KSwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDcpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgOSksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDEwKSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDYpLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDYpLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgOSwgMSwgMTEpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMTApLCBuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMTAsIDEsIDExKSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDkpLCBuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDkpLCBuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlcGxhY2UgbG9uZycsICgpID0+IHtcblx0XHRzdWl0ZSgnY29sbGFwc2VkIGRlYycsICgpID0+IHtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDwgcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAzKSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDw9IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMiwgMSwgNCksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA1KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLCBuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpLCBuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPj0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNiksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgNyksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ25vbi1jb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPCByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDMpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNiwgMSwgMTEpLCBuZXcgU2VsZWN0aW9uKDEsIDExLCAxLCA2KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCAxMSksIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDYpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDw9IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMiwgMSwgNCksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCAxMSksIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDExKSwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgNildLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kIDwgcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgNSksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCAxMSksIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDExKSwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgNyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDkpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgMTApLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyksIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDYpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMTEpLCBuZXcgU2VsZWN0aW9uKDEsIDExLCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA4LCAxLCAxMSksIG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDgpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA4KSwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgMTApLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCksIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA3KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDExKSwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMTEpLCBuZXcgU2VsZWN0aW9uKDEsIDExLCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA5KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDkpLCBuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDkpLCBuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5zdGFydCAmJiBlZGl0LnN0YXJ0IDwgcmFuZ2UuZW5kICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgMTApLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA5LCAxLCAxMSksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA5KSwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCAxMyksIG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxMCwgMSwgMTEpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgOSksIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQTJDO0FBQ3BELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLFlBQVksT0FBaUIsWUFBeUIsT0FBK0IsZUFBeUIsb0JBQXVDO0FBQzdKLHFCQUFtQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNwRCxVQUFNLFFBQVEsT0FBTyxTQUFTO0FBRTlCLGNBQVUsY0FBYyxTQUFTLFVBQVU7QUFFM0MsVUFBTSxXQUFXLEtBQUs7QUFFdEIsV0FBTyxnQkFBZ0IsTUFBTSxnQkFBZ0IsR0FBRyxhQUFhO0FBRTdELFVBQU0sbUJBQW1CLFVBQVUsY0FBYztBQUNqRCxXQUFPLGdCQUFnQixpQkFBaUIsSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDLEdBQUcsbUJBQW1CLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFFMUcsQ0FBQztBQUNGO0FBRUEsTUFBTSw2Q0FBNkMsTUFBTTtBQUV4RCwwQ0FBd0M7QUFFeEMsT0FBSyx3QkFBd0IsTUFBTTtBQUNsQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDMUI7QUFBQSxRQUNDLGNBQWMsUUFBUSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLFlBQVk7QUFBQSxNQUM5RDtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDN0I7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUMxQjtBQUFBLFFBQ0MsY0FBYyxRQUFRLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsV0FBVztBQUFBLE1BQzdEO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxJQUM1QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssdUJBQXVCLE1BQU07QUFDakM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzFCO0FBQUEsUUFDQyxjQUFjLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLFlBQVk7QUFBQSxNQUN0RDtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDN0I7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZDQUE2QyxNQUFNO0FBQ3ZEO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUMxQjtBQUFBLFFBQ0MsY0FBYyxPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxrQkFBa0I7QUFBQSxNQUM1RDtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzNCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RDtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDNUI7QUFBQSxRQUNDLGNBQWMsWUFBWSxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLHNCQUFzQjtBQUFBLE1BQzFFO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsTUFDQSxDQUFDLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxJQUM3QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssOEVBQThFLE1BQU07QUFDeEY7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDNUI7QUFBQSxRQUNDLGNBQWMsWUFBWSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLGNBQWlCO0FBQUEsTUFDbkU7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLENBQUMsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQzdCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvRkFBb0YsTUFBTTtBQUM5RjtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxNQUN4RDtBQUFBLFFBQ0MsY0FBYyxRQUFRLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsRUFBRTtBQUFBLFFBQ2hELGNBQWMsUUFBUSxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLEVBQUU7QUFBQSxNQUNsRDtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUN0RDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGVBQWUsTUFBTTtBQUUxQiwwQ0FBd0M7QUFFeEMsUUFBTSxRQUFRO0FBQUEsSUFDYjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUVBLFdBQVMsU0FBUyxXQUFzQixXQUFrQixVQUFrQixzQkFBK0IsVUFBcUIsS0FBbUI7QUFDbEosdUJBQW1CLE1BQU0sS0FBSyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQy9ELGdCQUFVLGNBQWMsU0FBUyxDQUFDLFNBQVMsQ0FBQztBQUM1QyxhQUFPLFNBQVMsRUFBRSxXQUFXLENBQUM7QUFBQSxRQUM3QixPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixrQkFBa0I7QUFBQSxNQUNuQixDQUFDLENBQUM7QUFDRixZQUFNLFNBQVMsVUFBVSxhQUFhO0FBQ3RDLGFBQU8sZ0JBQWdCLE9BQU8sU0FBUyxHQUFHLFNBQVMsU0FBUyxHQUFHLEdBQUc7QUFBQSxJQUNuRSxDQUFDO0FBQUEsRUFDRjtBQUVBLFdBQVMsUUFBUSxXQUFrQixXQUFrQixVQUFrQixVQUErQjtBQUNyRyxVQUFNLE9BQU8sSUFBSSxVQUFVLFVBQVUsaUJBQWlCLFVBQVUsYUFBYSxVQUFVLGVBQWUsVUFBVSxTQUFTO0FBQ3pILGFBQVMsTUFBTSxXQUFXLFVBQVUsT0FBTyxTQUFTLENBQUMsRUFBRSxDQUFDLEdBQUcsc0JBQXNCO0FBQ2pGLGFBQVMsTUFBTSxXQUFXLFVBQVUsTUFBTSxTQUFTLENBQUMsRUFBRSxDQUFDLEdBQUcsbUJBQW1CO0FBRzdFLFVBQU0sT0FBTyxJQUFJLFVBQVUsVUFBVSxlQUFlLFVBQVUsV0FBVyxVQUFVLGlCQUFpQixVQUFVLFdBQVc7QUFDekgsYUFBUyxNQUFNLFdBQVcsVUFBVSxPQUFPLFNBQVMsQ0FBQyxFQUFFLENBQUMsR0FBRyxzQkFBc0I7QUFDakYsYUFBUyxNQUFNLFdBQVcsVUFBVSxNQUFNLFNBQVMsQ0FBQyxFQUFFLENBQUMsR0FBRyxtQkFBbUI7QUFBQSxFQUM5RTtBQUVBLFFBQU0sVUFBVSxNQUFNO0FBQ3JCLFVBQU0saUJBQWlCLE1BQU07QUFDNUIsV0FBSyxVQUFVLE1BQU07QUFDcEI7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLFNBQVMsTUFBTTtBQUNuQjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssU0FBUyxNQUFNO0FBQ25CO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxXQUFLLFVBQVUsTUFBTTtBQUNwQjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLENBQUM7QUFBQSxZQUN2RCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3hEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssU0FBUyxNQUFNO0FBQ25CO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3ZELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDeEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxVQUFVLE1BQU07QUFDcEI7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDdkQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN4RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLE9BQU8sTUFBTTtBQUNqQjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLENBQUM7QUFBQSxZQUN2RCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3hEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssU0FBUyxNQUFNO0FBQ25CO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3pCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxVQUFVLE1BQU07QUFDckIsVUFBTSxpQkFBaUIsTUFBTTtBQUM1QixXQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssb0RBQW9ELE1BQU07QUFDOUQ7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFVBQU0scUJBQXFCLE1BQU07QUFDaEMsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMkJBQTJCLE1BQU07QUFDckM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssb0RBQW9ELE1BQU07QUFDOUQ7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxVQUFHO0FBQUEsVUFDeEI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxzREFBc0QsTUFBTTtBQUNoRTtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUsscURBQXFELE1BQU07QUFDL0Q7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxVQUFHO0FBQUEsVUFDeEI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLDhFQUE4RSxNQUFNO0FBQ3hGO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSywrRUFBK0UsTUFBTTtBQUN6RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssOEVBQThFLE1BQU07QUFDeEY7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxVQUFHO0FBQUEsVUFDeEI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsVUFBRztBQUFBLFVBQ3hCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN6QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0saUJBQWlCLE1BQU07QUFDNUIsVUFBTSxpQkFBaUIsTUFBTTtBQUM1QixXQUFLLDBCQUEwQixNQUFNO0FBQ3BDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssb0RBQW9ELE1BQU07QUFDOUQ7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDJCQUEyQixNQUFNO0FBQ3JDO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFVBQU0scUJBQXFCLE1BQU07QUFDaEMsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMkJBQTJCLE1BQU07QUFDckM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3JELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxxREFBcUQsTUFBTTtB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QyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUNyRCxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssb0RBQW9ELE1BQU07QUFDOUQ7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxVQUFHO0FBQUEsVUFDeEI7QUFBQSxZQUNDLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDckQsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLHFEQUFxRCxNQUFNO0FBQy9EO0FBQUEsVUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQ3ZELENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDeEQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxzREFBc0QsTUFBTTtBQUNoRTtBQUFB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
