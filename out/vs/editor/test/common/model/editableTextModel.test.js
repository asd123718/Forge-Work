import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { EndOfLinePreference, EndOfLineSequence } from "../../../common/model.js";
import { MirrorTextModel } from "../../../common/model/mirrorTextModel.js";
import { assertSyncedModels, testApplyEditsWithSyncedModels } from "./editableTextModelTestUtils.js";
import { createTextModel } from "../testTextModel.js";
suite("EditorModel - EditableTextModel.applyEdits updates mightContainRTL", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testApplyEdits(original, edits, before, after) {
    const model = createTextModel(original.join("\n"));
    model.setEOL(EndOfLineSequence.LF);
    assert.strictEqual(model.mightContainRTL(), before);
    model.applyEdits(edits);
    assert.strictEqual(model.mightContainRTL(), after);
    model.dispose();
  }
  function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
    return {
      range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
      text: text.join("\n")
    };
  }
  test("start with RTL, insert LTR", () => {
    testApplyEdits(["Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"], [editOp(1, 1, 1, 1, ["hello"])], true, true);
  });
  test("start with RTL, delete RTL", () => {
    testApplyEdits(["Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"], [editOp(1, 1, 10, 10, [""])], true, true);
  });
  test("start with RTL, insert RTL", () => {
    testApplyEdits(["Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"], [editOp(1, 1, 1, 1, ["\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644"])], true, true);
  });
  test("start with LTR, insert LTR", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["hello"])], false, false);
  });
  test("start with LTR, insert RTL 1", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644"])], false, true);
  });
  test("start with LTR, insert RTL 2", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"])], false, true);
  });
});
suite("EditorModel - EditableTextModel.applyEdits updates mightContainNonBasicASCII", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testApplyEdits(original, edits, before, after) {
    const model = createTextModel(original.join("\n"));
    model.setEOL(EndOfLineSequence.LF);
    assert.strictEqual(model.mightContainNonBasicASCII(), before);
    model.applyEdits(edits);
    assert.strictEqual(model.mightContainNonBasicASCII(), after);
    model.dispose();
  }
  function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
    return {
      range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
      text: text.join("\n")
    };
  }
  test("start with NON-ASCII, insert ASCII", () => {
    testApplyEdits(["Hello,\nZ\xFCrich"], [editOp(1, 1, 1, 1, ["hello", "second line"])], true, true);
  });
  test("start with NON-ASCII, delete NON-ASCII", () => {
    testApplyEdits(["Hello,\nZ\xFCrich"], [editOp(1, 1, 10, 10, [""])], true, true);
  });
  test("start with NON-ASCII, insert NON-ASCII", () => {
    testApplyEdits(["Hello,\nZ\xFCrich"], [editOp(1, 1, 1, 1, ["Z\xFCrich"])], true, true);
  });
  test("start with ASCII, insert ASCII", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["hello", "second line"])], false, false);
  });
  test("start with ASCII, insert NON-ASCII", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["Z\xFCrich", "Z\xFCrich"])], false, true);
  });
});
suite("EditorModel - EditableTextModel.applyEdits", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
    return {
      range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
      text: text.join("\n"),
      forceMoveMarkers: false
    };
  }
  test("high-low surrogates 1", () => {
    testApplyEditsWithSyncedModels(
      [
        "\u{1F4DA}some",
        "very nice",
        "text"
      ],
      [
        editOp(1, 2, 1, 2, ["a"])
      ],
      [
        "a\u{1F4DA}some",
        "very nice",
        "text"
      ],
      /*inputEditsAreInvalid*/
      true
    );
  });
  test("high-low surrogates 2", () => {
    testApplyEditsWithSyncedModels(
      [
        "\u{1F4DA}some",
        "very nice",
        "text"
      ],
      [
        editOp(1, 2, 1, 3, ["a"])
      ],
      [
        "asome",
        "very nice",
        "text"
      ],
      /*inputEditsAreInvalid*/
      true
    );
  });
  test("high-low surrogates 3", () => {
    testApplyEditsWithSyncedModels(
      [
        "\u{1F4DA}some",
        "very nice",
        "text"
      ],
      [
        editOp(1, 1, 1, 2, ["a"])
      ],
      [
        "asome",
        "very nice",
        "text"
      ],
      /*inputEditsAreInvalid*/
      true
    );
  });
  test("high-low surrogates 4", () => {
    testApplyEditsWithSyncedModels(
      [
        "\u{1F4DA}some",
        "very nice",
        "text"
      ],
      [
        editOp(1, 1, 1, 3, ["a"])
      ],
      [
        "asome",
        "very nice",
        "text"
      ],
      /*inputEditsAreInvalid*/
      true
    );
  });
  test("Bug 19872: Undo is funky", () => {
    testApplyEditsWithSyncedModels(
      [
        "something",
        " A",
        "",
        " B",
        "something else"
      ],
      [
        editOp(2, 1, 2, 2, [""]),
        editOp(3, 1, 4, 2, [""])
      ],
      [
        "something",
        "A",
        "B",
        "something else"
      ]
    );
  });
  test("Bug 19872: Undo is funky (2)", () => {
    testApplyEditsWithSyncedModels(
      [
        "something",
        "A",
        "B",
        "something else"
      ],
      [
        editOp(2, 1, 2, 1, [" "]),
        editOp(3, 1, 3, 1, ["", " "])
      ],
      [
        "something",
        " A",
        "",
        " B",
        "something else"
      ]
    );
  });
  test("insert empty text", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 1, [""])
      ],
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("last op is no-op", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 2, [""]),
        editOp(4, 1, 4, 1, [""])
      ],
      [
        "y First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text without newline 1", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 1, ["foo "])
      ],
      [
        "foo My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text without newline 2", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, [" foo"])
      ],
      [
        "My foo First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert one newline", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 4, 1, 4, ["", ""])
      ],
      [
        "My ",
        "First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text with one newline", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, [" new line", "No longer"])
      ],
      [
        "My new line",
        "No longer First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text with two newlines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, [" new line", "One more line in the middle", "No longer"])
      ],
      [
        "My new line",
        "One more line in the middle",
        "No longer First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text with many newlines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, ["", "", "", "", ""])
      ],
      [
        "My",
        "",
        "",
        "",
        " First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert multiple newlines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, ["", "", "", "", ""]),
        editOp(3, 15, 3, 15, ["a", "b"])
      ],
      [
        "My",
        "",
        "",
        "",
        " First Line",
        "		My Second Line",
        "    Third Linea",
        "b",
        "",
        "1"
      ]
    );
  });
  test("delete empty text", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 1, [""])
      ],
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete text from one line", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 2, [""])
      ],
      [
        "y First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete text from one line 2", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 3, ["a"])
      ],
      [
        "a First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete all text from a line", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 14, [""])
      ],
      [
        "",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete text from two lines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 4, 2, 6, [""])
      ],
      [
        "My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete text from many lines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 4, 3, 5, [""])
      ],
      [
        "My Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete everything", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 5, 2, [""])
      ],
      [
        ""
      ]
    );
  });
  test("two unrelated edits", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      [
        editOp(2, 1, 2, 3, ["	"]),
        editOp(3, 1, 3, 5, [""])
      ],
      [
        "My First Line",
        "	My Second Line",
        "Third Line",
        "",
        "123"
      ]
    );
  });
  test("two edits on one line", () => {
    testApplyEditsWithSyncedModels(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      [
        editOp(5, 3, 5, 7, [""]),
        editOp(5, 12, 5, 16, [""])
      ],
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		fifth		"
      ]
    );
  });
  test("many edits", () => {
    testApplyEditsWithSyncedModels(
      [
        '{"x" : 1}'
      ],
      [
        editOp(1, 2, 1, 2, ["\n  "]),
        editOp(1, 5, 1, 6, [""]),
        editOp(1, 9, 1, 9, ["\n"])
      ],
      [
        "{",
        '  "x": 1',
        "}"
      ]
    );
  });
  test("many edits reversed", () => {
    testApplyEditsWithSyncedModels(
      [
        "{",
        '  "x": 1',
        "}"
      ],
      [
        editOp(1, 2, 2, 3, [""]),
        editOp(2, 6, 2, 6, [" "]),
        editOp(2, 9, 3, 1, [""])
      ],
      [
        '{"x" : 1}'
      ]
    );
  });
  test("replacing newlines 1", () => {
    testApplyEditsWithSyncedModels(
      [
        "{",
        '"a": true,',
        "",
        '"b": true',
        "}"
      ],
      [
        editOp(1, 2, 2, 1, ["", "	"]),
        editOp(2, 11, 4, 1, ["", "	"])
      ],
      [
        "{",
        '	"a": true,',
        '	"b": true',
        "}"
      ]
    );
  });
  test("replacing newlines 2", () => {
    testApplyEditsWithSyncedModels(
      [
        "some text",
        "some more text",
        "now comes an empty line",
        "",
        "after empty line",
        "and the last line"
      ],
      [
        editOp(1, 5, 3, 1, [" text", "some more text", "some more text"]),
        editOp(3, 2, 4, 1, ["o more lines", "asd", "asd", "asd"]),
        editOp(5, 1, 5, 6, ["zzzzzzzz"]),
        editOp(5, 11, 6, 16, ["1", "2", "3", "4"])
      ],
      [
        "some text",
        "some more text",
        "some more textno more lines",
        "asd",
        "asd",
        "asd",
        "zzzzzzzz empt1",
        "2",
        "3",
        "4ne"
      ]
    );
  });
  test("advanced 1", () => {
    testApplyEditsWithSyncedModels(
      [
        ' {       "d": [',
        "             null",
        "        ] /*comment*/",
        '        ,"e": /*comment*/ [null] }'
      ],
      [
        editOp(1, 1, 1, 2, [""]),
        editOp(1, 3, 1, 10, ["", "  "]),
        editOp(1, 16, 2, 14, ["", "    "]),
        editOp(2, 18, 3, 9, ["", "  "]),
        editOp(3, 22, 4, 9, [""]),
        editOp(4, 10, 4, 10, ["", "  "]),
        editOp(4, 28, 4, 28, ["", "    "]),
        editOp(4, 32, 4, 32, ["", "  "]),
        editOp(4, 33, 4, 34, ["", ""])
      ],
      [
        "{",
        '  "d": [',
        "    null",
        "  ] /*comment*/,",
        '  "e": /*comment*/ [',
        "    null",
        "  ]",
        "}"
      ]
    );
  });
  test("advanced simplified", () => {
    testApplyEditsWithSyncedModels(
      [
        "   abc",
        " ,def"
      ],
      [
        editOp(1, 1, 1, 4, [""]),
        editOp(1, 7, 2, 2, [""]),
        editOp(2, 3, 2, 3, ["", ""])
      ],
      [
        "abc,",
        "def"
      ]
    );
  });
  test("issue #144", () => {
    testApplyEditsWithSyncedModels(
      [
        "package caddy",
        "",
        "func main() {",
        '	fmt.Println("Hello World! :)")',
        "}",
        ""
      ],
      [
        editOp(1, 1, 6, 1, [
          "package caddy",
          "",
          'import "fmt"',
          "",
          "func main() {",
          '	fmt.Println("Hello World! :)")',
          "}",
          ""
        ])
      ],
      [
        "package caddy",
        "",
        'import "fmt"',
        "",
        "func main() {",
        '	fmt.Println("Hello World! :)")',
        "}",
        ""
      ]
    );
  });
  test("issue #2586 Replacing selected end-of-line with newline locks up the document", () => {
    testApplyEditsWithSyncedModels(
      [
        "something",
        "interesting"
      ],
      [
        editOp(1, 10, 2, 1, ["", ""])
      ],
      [
        "something",
        "interesting"
      ]
    );
  });
  test("issue #3980", () => {
    testApplyEditsWithSyncedModels(
      [
        "class A {",
        "    someProperty = false;",
        "    someMethod() {",
        "    this.someMethod();",
        "    }",
        "}"
      ],
      [
        editOp(1, 8, 1, 9, ["", ""]),
        editOp(3, 17, 3, 18, ["", ""]),
        editOp(3, 18, 3, 18, ["    "]),
        editOp(4, 5, 4, 5, ["    "])
      ],
      [
        "class A",
        "{",
        "    someProperty = false;",
        "    someMethod()",
        "    {",
        "        this.someMethod();",
        "    }",
        "}"
      ]
    );
  });
  function testApplyEditsFails(original, edits) {
    const model = createTextModel(original.join("\n"));
    let hasThrown = false;
    try {
      model.applyEdits(edits);
    } catch (err) {
      hasThrown = true;
    }
    assert.ok(hasThrown, "expected model.applyEdits to fail.");
    model.dispose();
  }
  test("touching edits: two inserts at the same position", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 1, ["a"]),
        editOp(1, 1, 1, 1, ["b"])
      ],
      [
        "abhello world"
      ]
    );
  });
  test("touching edits: insert and replace touching", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 1, ["b"]),
        editOp(1, 1, 1, 3, ["ab"])
      ],
      [
        "babllo world"
      ]
    );
  });
  test("overlapping edits: two overlapping replaces", () => {
    testApplyEditsFails(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 2, ["b"]),
        editOp(1, 1, 1, 3, ["ab"])
      ]
    );
  });
  test("overlapping edits: two overlapping deletes", () => {
    testApplyEditsFails(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 2, [""]),
        editOp(1, 1, 1, 3, [""])
      ]
    );
  });
  test("touching edits: two touching replaces", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 2, ["H"]),
        editOp(1, 2, 1, 3, ["E"])
      ],
      [
        "HEllo world"
      ]
    );
  });
  test("touching edits: two touching deletes", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 2, [""]),
        editOp(1, 2, 1, 3, [""])
      ],
      [
        "llo world"
      ]
    );
  });
  test("touching edits: insert and replace", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 1, ["H"]),
        editOp(1, 1, 1, 3, ["e"])
      ],
      [
        "Hello world"
      ]
    );
  });
  test("touching edits: replace and insert", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 3, ["H"]),
        editOp(1, 3, 1, 3, ["e"])
      ],
      [
        "Hello world"
      ]
    );
  });
  test("change while emitting events 1", () => {
    let disposable;
    assertSyncedModels("Hello", (model, assertMirrorModels) => {
      model.applyEdits([{
        range: new Range(1, 6, 1, 6),
        text: " world!"
        // forceMoveMarkers: false
      }]);
      assertMirrorModels();
    }, (model) => {
      let isFirstTime = true;
      disposable = model.onDidChangeContent(() => {
        if (!isFirstTime) {
          return;
        }
        isFirstTime = false;
        model.applyEdits([{
          range: new Range(1, 13, 1, 13),
          text: " How are you?"
          // forceMoveMarkers: false
        }]);
      });
    });
    disposable.dispose();
  });
  test("change while emitting events 2", () => {
    let disposable;
    assertSyncedModels("Hello", (model, assertMirrorModels) => {
      model.applyEdits([{
        range: new Range(1, 6, 1, 6),
        text: " world!"
        // forceMoveMarkers: false
      }]);
      assertMirrorModels();
    }, (model) => {
      let isFirstTime = true;
      disposable = model.onDidChangeContent((e) => {
        if (!isFirstTime) {
          return;
        }
        isFirstTime = false;
        model.applyEdits([{
          range: new Range(1, 13, 1, 13),
          text: " How are you?"
          // forceMoveMarkers: false
        }]);
      });
    });
    disposable.dispose();
  });
  test("issue #1580: Changes in line endings are not correctly reflected in the extension host, leading to invalid offsets sent to external refactoring tools", () => {
    const model = createTextModel("Hello\nWorld!");
    assert.strictEqual(model.getEOL(), "\n");
    const mirrorModel2 = new MirrorTextModel(null, model.getLinesContent(), model.getEOL(), model.getVersionId());
    let mirrorModel2PrevVersionId = model.getVersionId();
    const disposable = model.onDidChangeContent((e) => {
      const versionId = e.versionId;
      if (versionId < mirrorModel2PrevVersionId) {
        console.warn("Model version id did not advance between edits (2)");
      }
      mirrorModel2PrevVersionId = versionId;
      mirrorModel2.onEvents(e);
    });
    const assertMirrorModels = () => {
      assert.strictEqual(mirrorModel2.getText(), model.getValue(), "mirror model 2 text OK");
      assert.strictEqual(mirrorModel2.version, model.getVersionId(), "mirror model 2 version OK");
    };
    model.setEOL(EndOfLineSequence.CRLF);
    assertMirrorModels();
    disposable.dispose();
    model.dispose();
    mirrorModel2.dispose();
  });
  test("issue #47733: Undo mangles unicode characters", () => {
    const model = createTextModel("'\u{1F441}'");
    model.applyEdits([
      { range: new Range(1, 1, 1, 1), text: '"' },
      { range: new Range(1, 2, 1, 2), text: '"' }
    ]);
    assert.strictEqual(model.getValue(EndOfLinePreference.LF), `"'"\u{1F441}'`);
    assert.deepStrictEqual(model.validateRange(new Range(1, 3, 1, 4)), new Range(1, 3, 1, 4));
    model.applyEdits([
      { range: new Range(1, 1, 1, 2), text: null },
      { range: new Range(1, 3, 1, 4), text: null }
    ]);
    assert.strictEqual(model.getValue(EndOfLinePreference.LF), "'\u{1F441}'");
    model.dispose();
  });
  test("issue #48741: Broken undo stack with move lines up with multiple cursors", () => {
    const model = createTextModel([
      "line1",
      "line2",
      "line3",
      ""
    ].join("\n"));
    const undoEdits = model.applyEdits([
      { range: new Range(4, 1, 4, 1), text: "line3" },
      { range: new Range(3, 1, 3, 6), text: null },
      { range: new Range(2, 1, 3, 1), text: null },
      { range: new Range(3, 6, 3, 6), text: "\nline2" }
    ], true);
    model.applyEdits(undoEdits);
    assert.deepStrictEqual(model.getValue(), "line1\nline2\nline3\n");
    model.dispose();
  });
});
suite("CRLF edit normalization", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("edit ending with \\r followed by \\n in buffer should strip trailing \\r", () => {
    const model = createTextModel("abc\r\ndef\r\n");
    model.setEOL(EndOfLineSequence.CRLF);
    assert.strictEqual(model.getEOL(), "\r\n");
    assert.strictEqual(model.getLineCount(), 3);
    assert.strictEqual(model.getLineContent(1), "abc");
    assert.strictEqual(model.getLineContent(2), "def");
    model.applyEdits([
      { range: new Range(1, 1, 1, 4), text: "xyz\r" }
    ]);
    assert.strictEqual(model.getLineContent(1), "xyz");
    assert.strictEqual(model.getLineContent(2), "def");
    assert.strictEqual(model.getLineCount(), 3);
    model.dispose();
  });
  test("edit ending with \\r\\n should NOT be modified", () => {
    const model = createTextModel("abc\r\ndef\r\n");
    model.setEOL(EndOfLineSequence.CRLF);
    model.applyEdits([
      { range: new Range(1, 1, 1, 4), text: "xyz\r\n" }
    ]);
    assert.strictEqual(model.getLineContent(1), "xyz");
    assert.strictEqual(model.getLineContent(2), "");
    assert.strictEqual(model.getLineContent(3), "def");
    assert.strictEqual(model.getLineCount(), 4);
    model.dispose();
  });
  test("edit ending with \\r NOT followed by \\n should NOT be modified", () => {
    const model = createTextModel("abcdef");
    model.setEOL(EndOfLineSequence.CRLF);
    model.applyEdits([
      { range: new Range(1, 1, 1, 4), text: "xyz\r" }
    ]);
    assert.strictEqual(model.getLineCount(), 2);
    model.dispose();
  });
  test("edit in LF buffer should NOT strip trailing \\r", () => {
    const model = createTextModel("abc\ndef\n");
    model.setEOL(EndOfLineSequence.LF);
    assert.strictEqual(model.getEOL(), "\n");
    assert.strictEqual(model.getLineCount(), 3);
    model.applyEdits([
      { range: new Range(1, 1, 1, 4), text: "xyz\r" }
    ]);
    assert.strictEqual(model.getLineCount(), 4);
    model.dispose();
  });
  test("LSP include sorting scenario - edit ending with \\r should be normalized", () => {
    const model = createTextModel('#include "a.h"\r\n#include "c.h"\r\n#include "b.h"\r\n');
    model.setEOL(EndOfLineSequence.CRLF);
    assert.strictEqual(model.getEOL(), "\r\n");
    assert.strictEqual(model.getLineCount(), 4);
    assert.strictEqual(model.getLineContent(1), '#include "a.h"');
    assert.strictEqual(model.getLineContent(2), '#include "c.h"');
    assert.strictEqual(model.getLineContent(3), '#include "b.h"');
    model.applyEdits([
      {
        range: new Range(1, 1, 3, 16),
        text: '#include "a.h"\r\n#include "b.h"\r\n#include "c.h"\r'
      }
    ]);
    assert.strictEqual(model.getLineCount(), 4);
    assert.strictEqual(model.getLineContent(1), '#include "a.h"');
    assert.strictEqual(model.getLineContent(2), '#include "b.h"');
    assert.strictEqual(model.getLineContent(3), '#include "c.h"');
    assert.strictEqual(model.getLineContent(4), "");
    model.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGVkaXRhYmxlVGV4dE1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIEVuZE9mTGluZVNlcXVlbmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1pcnJvclRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9taXJyb3JUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0U3luY2VkTW9kZWxzLCB0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMgfSBmcm9tICcuL2VkaXRhYmxlVGV4dE1vZGVsVGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuXG5zdWl0ZSgnRWRpdG9yTW9kZWwgLSBFZGl0YWJsZVRleHRNb2RlbC5hcHBseUVkaXRzIHVwZGF0ZXMgbWlnaHRDb250YWluUlRMJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRlc3RBcHBseUVkaXRzKG9yaWdpbmFsOiBzdHJpbmdbXSwgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10sIGJlZm9yZTogYm9vbGVhbiwgYWZ0ZXI6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChvcmlnaW5hbC5qb2luKCdcXG4nKSk7XG5cdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkxGKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5taWdodENvbnRhaW5SVEwoKSwgYmVmb3JlKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoZWRpdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5taWdodENvbnRhaW5SVEwoKSwgYWZ0ZXIpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGVkaXRPcChzdGFydExpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgdGV4dDogc3RyaW5nW10pOiBJU2luZ2xlRWRpdE9wZXJhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKSxcblx0XHRcdHRleHQ6IHRleHQuam9pbignXFxuJylcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBSVEwsIGluc2VydCBMVFInLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG5cdTA1RDZcdTA1RDVcdTA1RDRcdTA1RDkgXHUwNUUyXHUwNUQ1XHUwNUQxXHUwNUQzXHUwNUQ0IFx1MDVERVx1MDVEMVx1MDVENVx1MDVFMVx1MDVFMVx1MDVFQSBcdTA1RTlcdTA1RDNcdTA1RTJcdTA1RUFcdTA1RDUnXSwgW2VkaXRPcCgxLCAxLCAxLCAxLCBbJ2hlbGxvJ10pXSwgdHJ1ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0IHdpdGggUlRMLCBkZWxldGUgUlRMJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFsnSGVsbG8sXFxuXHUwNUQ2XHUwNUQ1XHUwNUQ0XHUwNUQ5IFx1MDVFMlx1MDVENVx1MDVEMVx1MDVEM1x1MDVENCBcdTA1REVcdTA1RDFcdTA1RDVcdTA1RTFcdTA1RTFcdTA1RUEgXHUwNUU5XHUwNUQzXHUwNUUyXHUwNUVBXHUwNUQ1J10sIFtlZGl0T3AoMSwgMSwgMTAsIDEwLCBbJyddKV0sIHRydWUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydCB3aXRoIFJUTCwgaW5zZXJ0IFJUTCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhbJ0hlbGxvLFxcblx1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENSddLCBbZWRpdE9wKDEsIDEsIDEsIDEsIFsnXHUwNjQ3XHUwNjQ2XHUwNjI3XHUwNjQzIFx1MDYyRFx1MDY0Mlx1MDY0QVx1MDY0Mlx1MDYyOSBcdTA2NDVcdTA2MkJcdTA2MjhcdTA2MkFcdTA2MjkgXHUwNjQ1XHUwNjQ2XHUwNjMwIFx1MDYzMlx1MDY0NVx1MDY0NiBcdTA2MzdcdTA2NDhcdTA2NEFcdTA2NDQnXSldLCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBMVFIsIGluc2VydCBMVFInLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG53b3JsZCEnXSwgW2VkaXRPcCgxLCAxLCAxLCAxLCBbJ2hlbGxvJ10pXSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBMVFIsIGluc2VydCBSVEwgMScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhbJ0hlbGxvLFxcbndvcmxkISddLCBbZWRpdE9wKDEsIDEsIDEsIDEsIFsnXHUwNjQ3XHUwNjQ2XHUwNjI3XHUwNjQzIFx1MDYyRFx1MDY0Mlx1MDY0QVx1MDY0Mlx1MDYyOSBcdTA2NDVcdTA2MkJcdTA2MjhcdTA2MkFcdTA2MjkgXHUwNjQ1XHUwNjQ2XHUwNjMwIFx1MDYzMlx1MDY0NVx1MDY0NiBcdTA2MzdcdTA2NDhcdTA2NEFcdTA2NDQnXSldLCBmYWxzZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0IHdpdGggTFRSLCBpbnNlcnQgUlRMIDInLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG53b3JsZCEnXSwgW2VkaXRPcCgxLCAxLCAxLCAxLCBbJ1x1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENSddKV0sIGZhbHNlLCB0cnVlKTtcblx0fSk7XG59KTtcblxuXG5zdWl0ZSgnRWRpdG9yTW9kZWwgLSBFZGl0YWJsZVRleHRNb2RlbC5hcHBseUVkaXRzIHVwZGF0ZXMgbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXN0QXBwbHlFZGl0cyhvcmlnaW5hbDogc3RyaW5nW10sIGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBiZWZvcmU6IGJvb2xlYW4sIGFmdGVyOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwob3JpZ2luYWwuam9pbignXFxuJykpO1xuXHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5MRik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSgpLCBiZWZvcmUpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKSwgYWZ0ZXIpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGVkaXRPcChzdGFydExpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgdGV4dDogc3RyaW5nW10pOiBJU2luZ2xlRWRpdE9wZXJhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKSxcblx0XHRcdHRleHQ6IHRleHQuam9pbignXFxuJylcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBOT04tQVNDSUksIGluc2VydCBBU0NJSScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhbJ0hlbGxvLFxcblpcdTAwRkNyaWNoJ10sIFtlZGl0T3AoMSwgMSwgMSwgMSwgWydoZWxsbycsICdzZWNvbmQgbGluZSddKV0sIHRydWUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydCB3aXRoIE5PTi1BU0NJSSwgZGVsZXRlIE5PTi1BU0NJSScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhbJ0hlbGxvLFxcblpcdTAwRkNyaWNoJ10sIFtlZGl0T3AoMSwgMSwgMTAsIDEwLCBbJyddKV0sIHRydWUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydCB3aXRoIE5PTi1BU0NJSSwgaW5zZXJ0IE5PTi1BU0NJSScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhbJ0hlbGxvLFxcblpcdTAwRkNyaWNoJ10sIFtlZGl0T3AoMSwgMSwgMSwgMSwgWydaXHUwMEZDcmljaCddKV0sIHRydWUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydCB3aXRoIEFTQ0lJLCBpbnNlcnQgQVNDSUknLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG53b3JsZCEnXSwgW2VkaXRPcCgxLCAxLCAxLCAxLCBbJ2hlbGxvJywgJ3NlY29uZCBsaW5lJ10pXSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBBU0NJSSwgaW5zZXJ0IE5PTi1BU0NJSScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhbJ0hlbGxvLFxcbndvcmxkISddLCBbZWRpdE9wKDEsIDEsIDEsIDEsIFsnWlx1MDBGQ3JpY2gnLCAnWlx1MDBGQ3JpY2gnXSldLCBmYWxzZSwgdHJ1ZSk7XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ0VkaXRvck1vZGVsIC0gRWRpdGFibGVUZXh0TW9kZWwuYXBwbHlFZGl0cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBlZGl0T3Aoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIHRleHQ6IHN0cmluZ1tdKTogSVNpbmdsZUVkaXRPcGVyYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksXG5cdFx0XHR0ZXh0OiB0ZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnaGlnaC1sb3cgc3Vycm9nYXRlcyAxJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J1x1RDgzRFx1RENEQXNvbWUnLFxuXHRcdFx0XHQndmVyeSBuaWNlJyxcblx0XHRcdFx0J3RleHQnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMiwgMSwgMiwgWydhJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnYVx1RDgzRFx1RENEQXNvbWUnLFxuXHRcdFx0XHQndmVyeSBuaWNlJyxcblx0XHRcdFx0J3RleHQnXG5cdFx0XHRdLFxuLyppbnB1dEVkaXRzQXJlSW52YWxpZCovdHJ1ZVxuXHRcdCk7XG5cdH0pO1xuXHR0ZXN0KCdoaWdoLWxvdyBzdXJyb2dhdGVzIDInLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnXHVEODNEXHVEQ0RBc29tZScsXG5cdFx0XHRcdCd2ZXJ5IG5pY2UnLFxuXHRcdFx0XHQndGV4dCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAyLCAxLCAzLCBbJ2EnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdhc29tZScsXG5cdFx0XHRcdCd2ZXJ5IG5pY2UnLFxuXHRcdFx0XHQndGV4dCdcblx0XHRcdF0sXG4vKmlucHV0RWRpdHNBcmVJbnZhbGlkKi90cnVlXG5cdFx0KTtcblx0fSk7XG5cdHRlc3QoJ2hpZ2gtbG93IHN1cnJvZ2F0ZXMgMycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdcdUQ4M0RcdURDREFzb21lJyxcblx0XHRcdFx0J3ZlcnkgbmljZScsXG5cdFx0XHRcdCd0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDIsIFsnYSddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2Fzb21lJyxcblx0XHRcdFx0J3ZlcnkgbmljZScsXG5cdFx0XHRcdCd0ZXh0J1xuXHRcdFx0XSxcbi8qaW5wdXRFZGl0c0FyZUludmFsaWQqL3RydWVcblx0XHQpO1xuXHR9KTtcblx0dGVzdCgnaGlnaC1sb3cgc3Vycm9nYXRlcyA0JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J1x1RDgzRFx1RENEQXNvbWUnLFxuXHRcdFx0XHQndmVyeSBuaWNlJyxcblx0XHRcdFx0J3RleHQnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMywgWydhJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnYXNvbWUnLFxuXHRcdFx0XHQndmVyeSBuaWNlJyxcblx0XHRcdFx0J3RleHQnXG5cdFx0XHRdLFxuLyppbnB1dEVkaXRzQXJlSW52YWxpZCovdHJ1ZVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0J1ZyAxOTg3MjogVW5kbyBpcyBmdW5reScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdzb21ldGhpbmcnLFxuXHRcdFx0XHQnIEEnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyBCJyxcblx0XHRcdFx0J3NvbWV0aGluZyBlbHNlJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDIsIDEsIDIsIDIsIFsnJ10pLFxuXHRcdFx0XHRlZGl0T3AoMywgMSwgNCwgMiwgWycnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdzb21ldGhpbmcnLFxuXHRcdFx0XHQnQScsXG5cdFx0XHRcdCdCJyxcblx0XHRcdFx0J3NvbWV0aGluZyBlbHNlJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0J1ZyAxOTg3MjogVW5kbyBpcyBmdW5reSAoMiknLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZXRoaW5nJyxcblx0XHRcdFx0J0EnLFxuXHRcdFx0XHQnQicsXG5cdFx0XHRcdCdzb21ldGhpbmcgZWxzZSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgyLCAxLCAyLCAxLCBbJyAnXSksXG5cdFx0XHRcdGVkaXRPcCgzLCAxLCAzLCAxLCBbJycsICcgJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZXRoaW5nJyxcblx0XHRcdFx0JyBBJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgQicsXG5cdFx0XHRcdCdzb21ldGhpbmcgZWxzZSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgZW1wdHkgdGV4dCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDEsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXN0IG9wIGlzIG5vLW9wJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMiwgWycnXSksXG5cdFx0XHRcdGVkaXRPcCg0LCAxLCA0LCAxLCBbJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3kgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgdGV4dCB3aXRob3V0IG5ld2xpbmUgMScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDEsIFsnZm9vICddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2ZvbyBNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCB0ZXh0IHdpdGhvdXQgbmV3bGluZSAyJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMywgMSwgMywgWycgZm9vJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgZm9vIEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IG9uZSBuZXdsaW5lJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgNCwgMSwgNCwgWycnLCAnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgJyxcblx0XHRcdFx0J0ZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IHRleHQgd2l0aCBvbmUgbmV3bGluZScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDMsIDEsIDMsIFsnIG5ldyBsaW5lJywgJ05vIGxvbmdlciddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015IG5ldyBsaW5lJyxcblx0XHRcdFx0J05vIGxvbmdlciBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCB0ZXh0IHdpdGggdHdvIG5ld2xpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMywgMSwgMywgWycgbmV3IGxpbmUnLCAnT25lIG1vcmUgbGluZSBpbiB0aGUgbWlkZGxlJywgJ05vIGxvbmdlciddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015IG5ldyBsaW5lJyxcblx0XHRcdFx0J09uZSBtb3JlIGxpbmUgaW4gdGhlIG1pZGRsZScsXG5cdFx0XHRcdCdObyBsb25nZXIgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgdGV4dCB3aXRoIG1hbnkgbmV3bGluZXMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAzLCAxLCAzLCBbJycsICcnLCAnJywgJycsICcnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdNeScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgbXVsdGlwbGUgbmV3bGluZXMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAzLCAxLCAzLCBbJycsICcnLCAnJywgJycsICcnXSksXG5cdFx0XHRcdGVkaXRPcCgzLCAxNSwgMywgMTUsIFsnYScsICdiJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXknLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnIEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmVhJyxcblx0XHRcdFx0J2InLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIGVtcHR5IHRleHQnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAxLCBbJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHRleHQgZnJvbSBvbmUgbGluZScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDIsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQneSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSB0ZXh0IGZyb20gb25lIGxpbmUgMicsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDMsIFsnYSddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2EgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgYWxsIHRleHQgZnJvbSBhIGxpbmUnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAxNCwgWycnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHRleHQgZnJvbSB0d28gbGluZXMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCA0LCAyLCA2LCBbJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSB0ZXh0IGZyb20gbWFueSBsaW5lcycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDQsIDMsIDUsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgZXZlcnl0aGluZycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDUsIDIsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byB1bnJlbGF0ZWQgZWRpdHMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDIsIDEsIDIsIDMsIFsnXFx0J10pLFxuXHRcdFx0XHRlZGl0T3AoMywgMSwgMywgNSwgWycnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0J1RoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gZWRpdHMgb24gb25lIGxpbmUnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0PCFAI2ZpZnRoI0AhPlxcdFxcdCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCg1LCAzLCA1LCA3LCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDUsIDEyLCA1LCAxNiwgWycnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRcXHRmaXJzdFxcdCAgICAnLFxuXHRcdFx0XHQnXFx0XFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnXFx0dGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdcXHRcXHRmaWZ0aFxcdFxcdCdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW55IGVkaXRzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J3tcInhcIiA6IDF9J1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDIsIDEsIDIsIFsnXFxuICAnXSksXG5cdFx0XHRcdGVkaXRPcCgxLCA1LCAxLCA2LCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDksIDEsIDksIFsnXFxuJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQneycsXG5cdFx0XHRcdCcgIFwieFwiOiAxJyxcblx0XHRcdFx0J30nXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWFueSBlZGl0cyByZXZlcnNlZCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCd7Jyxcblx0XHRcdFx0JyAgXCJ4XCI6IDEnLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAyLCAyLCAzLCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDIsIDYsIDIsIDYsIFsnICddKSxcblx0XHRcdFx0ZWRpdE9wKDIsIDksIDMsIDEsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQne1wieFwiIDogMX0nXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjaW5nIG5ld2xpbmVzIDEnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQneycsXG5cdFx0XHRcdCdcImFcIjogdHJ1ZSwnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1wiYlwiOiB0cnVlJyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMiwgMiwgMSwgWycnLCAnXFx0J10pLFxuXHRcdFx0XHRlZGl0T3AoMiwgMTEsIDQsIDEsIFsnJywgJ1xcdCddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnXFx0XCJhXCI6IHRydWUsJyxcblx0XHRcdFx0J1xcdFwiYlwiOiB0cnVlJyxcblx0XHRcdFx0J30nXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjaW5nIG5ld2xpbmVzIDInLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZSB0ZXh0Jyxcblx0XHRcdFx0J3NvbWUgbW9yZSB0ZXh0Jyxcblx0XHRcdFx0J25vdyBjb21lcyBhbiBlbXB0eSBsaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdhZnRlciBlbXB0eSBsaW5lJyxcblx0XHRcdFx0J2FuZCB0aGUgbGFzdCBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDUsIDMsIDEsIFsnIHRleHQnLCAnc29tZSBtb3JlIHRleHQnLCAnc29tZSBtb3JlIHRleHQnXSksXG5cdFx0XHRcdGVkaXRPcCgzLCAyLCA0LCAxLCBbJ28gbW9yZSBsaW5lcycsICdhc2QnLCAnYXNkJywgJ2FzZCddKSxcblx0XHRcdFx0ZWRpdE9wKDUsIDEsIDUsIDYsIFsnenp6enp6enonXSksXG5cdFx0XHRcdGVkaXRPcCg1LCAxMSwgNiwgMTYsIFsnMScsICcyJywgJzMnLCAnNCddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3NvbWUgdGV4dCcsXG5cdFx0XHRcdCdzb21lIG1vcmUgdGV4dCcsXG5cdFx0XHRcdCdzb21lIG1vcmUgdGV4dG5vIG1vcmUgbGluZXMnLFxuXHRcdFx0XHQnYXNkJyxcblx0XHRcdFx0J2FzZCcsXG5cdFx0XHRcdCdhc2QnLFxuXHRcdFx0XHQnenp6enp6enogZW1wdDEnLFxuXHRcdFx0XHQnMicsXG5cdFx0XHRcdCczJyxcblx0XHRcdFx0JzRuZSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZHZhbmNlZCAxJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0JyB7ICAgICAgIFwiZFwiOiBbJyxcblx0XHRcdFx0JyAgICAgICAgICAgICBudWxsJyxcblx0XHRcdFx0JyAgICAgICAgXSAvKmNvbW1lbnQqLycsXG5cdFx0XHRcdCcgICAgICAgICxcImVcIjogLypjb21tZW50Ki8gW251bGxdIH0nLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDIsIFsnJ10pLFxuXHRcdFx0XHRlZGl0T3AoMSwgMywgMSwgMTAsIFsnJywgJyAgJ10pLFxuXHRcdFx0XHRlZGl0T3AoMSwgMTYsIDIsIDE0LCBbJycsICcgICAgJ10pLFxuXHRcdFx0XHRlZGl0T3AoMiwgMTgsIDMsIDksIFsnJywgJyAgJ10pLFxuXHRcdFx0XHRlZGl0T3AoMywgMjIsIDQsIDksIFsnJ10pLFxuXHRcdFx0XHRlZGl0T3AoNCwgMTAsIDQsIDEwLCBbJycsICcgICddKSxcblx0XHRcdFx0ZWRpdE9wKDQsIDI4LCA0LCAyOCwgWycnLCAnICAgICddKSxcblx0XHRcdFx0ZWRpdE9wKDQsIDMyLCA0LCAzMiwgWycnLCAnICAnXSksXG5cdFx0XHRcdGVkaXRPcCg0LCAzMywgNCwgMzQsIFsnJywgJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnICBcImRcIjogWycsXG5cdFx0XHRcdCcgICAgbnVsbCcsXG5cdFx0XHRcdCcgIF0gLypjb21tZW50Ki8sJyxcblx0XHRcdFx0JyAgXCJlXCI6IC8qY29tbWVudCovIFsnLFxuXHRcdFx0XHQnICAgIG51bGwnLFxuXHRcdFx0XHQnICBdJyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkdmFuY2VkIHNpbXBsaWZpZWQnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgYWJjJyxcblx0XHRcdFx0JyAsZGVmJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDQsIFsnJ10pLFxuXHRcdFx0XHRlZGl0T3AoMSwgNywgMiwgMiwgWycnXSksXG5cdFx0XHRcdGVkaXRPcCgyLCAzLCAyLCAzLCBbJycsICcnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdhYmMsJyxcblx0XHRcdFx0J2RlZidcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTQ0JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J3BhY2thZ2UgY2FkZHknLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2Z1bmMgbWFpbigpIHsnLFxuXHRcdFx0XHQnXFx0Zm10LlByaW50bG4oXCJIZWxsbyBXb3JsZCEgOilcIiknLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgNiwgMSwgW1xuXHRcdFx0XHRcdCdwYWNrYWdlIGNhZGR5Jyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnaW1wb3J0IFwiZm10XCInLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCdmdW5jIG1haW4oKSB7Jyxcblx0XHRcdFx0XHQnXFx0Zm10LlByaW50bG4oXCJIZWxsbyBXb3JsZCEgOilcIiknLFxuXHRcdFx0XHRcdCd9Jyxcblx0XHRcdFx0XHQnJ1xuXHRcdFx0XHRdKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3BhY2thZ2UgY2FkZHknLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2ltcG9ydCBcImZtdFwiJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdmdW5jIG1haW4oKSB7Jyxcblx0XHRcdFx0J1xcdGZtdC5QcmludGxuKFwiSGVsbG8gV29ybGQhIDopXCIpJyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNTg2IFJlcGxhY2luZyBzZWxlY3RlZCBlbmQtb2YtbGluZSB3aXRoIG5ld2xpbmUgbG9ja3MgdXAgdGhlIGRvY3VtZW50JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J3NvbWV0aGluZycsXG5cdFx0XHRcdCdpbnRlcmVzdGluZydcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxMCwgMiwgMSwgWycnLCAnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZXRoaW5nJyxcblx0XHRcdFx0J2ludGVyZXN0aW5nJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzOTgwJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J2NsYXNzIEEgeycsXG5cdFx0XHRcdCcgICAgc29tZVByb3BlcnR5ID0gZmFsc2U7Jyxcblx0XHRcdFx0JyAgICBzb21lTWV0aG9kKCkgeycsXG5cdFx0XHRcdCcgICAgdGhpcy5zb21lTWV0aG9kKCk7Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDgsIDEsIDksIFsnJywgJyddKSxcblx0XHRcdFx0ZWRpdE9wKDMsIDE3LCAzLCAxOCwgWycnLCAnJ10pLFxuXHRcdFx0XHRlZGl0T3AoMywgMTgsIDMsIDE4LCBbJyAgICAnXSksXG5cdFx0XHRcdGVkaXRPcCg0LCA1LCA0LCA1LCBbJyAgICAnXSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnY2xhc3MgQScsXG5cdFx0XHRcdCd7Jyxcblx0XHRcdFx0JyAgICBzb21lUHJvcGVydHkgPSBmYWxzZTsnLFxuXHRcdFx0XHQnICAgIHNvbWVNZXRob2QoKScsXG5cdFx0XHRcdCcgICAgeycsXG5cdFx0XHRcdCcgICAgICAgIHRoaXMuc29tZU1ldGhvZCgpOycsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0ZXN0QXBwbHlFZGl0c0ZhaWxzKG9yaWdpbmFsOiBzdHJpbmdbXSwgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChvcmlnaW5hbC5qb2luKCdcXG4nKSk7XG5cblx0XHRsZXQgaGFzVGhyb3duID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoZWRpdHMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aGFzVGhyb3duID0gdHJ1ZTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGhhc1Rocm93biwgJ2V4cGVjdGVkIG1vZGVsLmFwcGx5RWRpdHMgdG8gZmFpbC4nKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHRlc3QoJ3RvdWNoaW5nIGVkaXRzOiB0d28gaW5zZXJ0cyBhdCB0aGUgc2FtZSBwb3NpdGlvbicsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAxLCBbJ2EnXSksXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAxLCBbJ2InXSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnYWJoZWxsbyB3b3JsZCdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b3VjaGluZyBlZGl0czogaW5zZXJ0IGFuZCByZXBsYWNlIHRvdWNoaW5nJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J2hlbGxvIHdvcmxkJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDEsIFsnYiddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDMsIFsnYWInXSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnYmFibGxvIHdvcmxkJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ292ZXJsYXBwaW5nIGVkaXRzOiB0d28gb3ZlcmxhcHBpbmcgcmVwbGFjZXMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNGYWlscyhcblx0XHRcdFtcblx0XHRcdFx0J2hlbGxvIHdvcmxkJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDIsIFsnYiddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDMsIFsnYWInXSksXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnb3ZlcmxhcHBpbmcgZWRpdHM6IHR3byBvdmVybGFwcGluZyBkZWxldGVzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzRmFpbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAyLCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDMsIFsnJ10pLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvdWNoaW5nIGVkaXRzOiB0d28gdG91Y2hpbmcgcmVwbGFjZXMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMiwgWydIJ10pLFxuXHRcdFx0XHRlZGl0T3AoMSwgMiwgMSwgMywgWydFJ10pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J0hFbGxvIHdvcmxkJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvdWNoaW5nIGVkaXRzOiB0d28gdG91Y2hpbmcgZGVsZXRlcycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAyLCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDIsIDEsIDMsIFsnJ10pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2xsbyB3b3JsZCdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b3VjaGluZyBlZGl0czogaW5zZXJ0IGFuZCByZXBsYWNlJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J2hlbGxvIHdvcmxkJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDEsIFsnSCddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDMsIFsnZSddKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdIZWxsbyB3b3JsZCdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b3VjaGluZyBlZGl0czogcmVwbGFjZSBhbmQgaW5zZXJ0JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J2hlbGxvIHdvcmxkJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDMsIFsnSCddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDMsIDEsIDMsIFsnZSddKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdIZWxsbyB3b3JsZCdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2Ugd2hpbGUgZW1pdHRpbmcgZXZlbnRzIDEnLCAoKSA9PiB7XG5cdFx0bGV0IGRpc3Bvc2FibGUhOiBJRGlzcG9zYWJsZTtcblx0XHRhc3NlcnRTeW5jZWRNb2RlbHMoJ0hlbGxvJywgKG1vZGVsLCBhc3NlcnRNaXJyb3JNb2RlbHMpID0+IHtcblx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA2LCAxLCA2KSxcblx0XHRcdFx0dGV4dDogJyB3b3JsZCEnLFxuXHRcdFx0XHQvLyBmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRhc3NlcnRNaXJyb3JNb2RlbHMoKTtcblxuXHRcdH0sIChtb2RlbCkgPT4ge1xuXHRcdFx0bGV0IGlzRmlyc3RUaW1lID0gdHJ1ZTtcblx0XHRcdGRpc3Bvc2FibGUgPSBtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWlzRmlyc3RUaW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlzRmlyc3RUaW1lID0gZmFsc2U7XG5cblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTMsIDEsIDEzKSxcblx0XHRcdFx0XHR0ZXh0OiAnIEhvdyBhcmUgeW91PycsXG5cdFx0XHRcdFx0Ly8gZm9yY2VNb3ZlTWFya2VyczogZmFsc2Vcblx0XHRcdFx0fV0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZSB3aGlsZSBlbWl0dGluZyBldmVudHMgMicsICgpID0+IHtcblx0XHRsZXQgZGlzcG9zYWJsZSE6IElEaXNwb3NhYmxlO1xuXHRcdGFzc2VydFN5bmNlZE1vZGVscygnSGVsbG8nLCAobW9kZWwsIGFzc2VydE1pcnJvck1vZGVscykgPT4ge1xuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDYsIDEsIDYpLFxuXHRcdFx0XHR0ZXh0OiAnIHdvcmxkIScsXG5cdFx0XHRcdC8vIGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0XHR9XSk7XG5cblx0XHRcdGFzc2VydE1pcnJvck1vZGVscygpO1xuXG5cdFx0fSwgKG1vZGVsKSA9PiB7XG5cdFx0XHRsZXQgaXNGaXJzdFRpbWUgPSB0cnVlO1xuXHRcdFx0ZGlzcG9zYWJsZSA9IG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoZTogSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIWlzRmlyc3RUaW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlzRmlyc3RUaW1lID0gZmFsc2U7XG5cblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTMsIDEsIDEzKSxcblx0XHRcdFx0XHR0ZXh0OiAnIEhvdyBhcmUgeW91PycsXG5cdFx0XHRcdFx0Ly8gZm9yY2VNb3ZlTWFya2VyczogZmFsc2Vcblx0XHRcdFx0fV0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTgwOiBDaGFuZ2VzIGluIGxpbmUgZW5kaW5ncyBhcmUgbm90IGNvcnJlY3RseSByZWZsZWN0ZWQgaW4gdGhlIGV4dGVuc2lvbiBob3N0LCBsZWFkaW5nIHRvIGludmFsaWQgb2Zmc2V0cyBzZW50IHRvIGV4dGVybmFsIHJlZmFjdG9yaW5nIHRvb2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdIZWxsb1xcbldvcmxkIScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRFT0woKSwgJ1xcbicpO1xuXG5cdFx0Y29uc3QgbWlycm9yTW9kZWwyID0gbmV3IE1pcnJvclRleHRNb2RlbChudWxsISwgbW9kZWwuZ2V0TGluZXNDb250ZW50KCksIG1vZGVsLmdldEVPTCgpLCBtb2RlbC5nZXRWZXJzaW9uSWQoKSk7XG5cdFx0bGV0IG1pcnJvck1vZGVsMlByZXZWZXJzaW9uSWQgPSBtb2RlbC5nZXRWZXJzaW9uSWQoKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKGU6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHZlcnNpb25JZCA9IGUudmVyc2lvbklkO1xuXHRcdFx0aWYgKHZlcnNpb25JZCA8IG1pcnJvck1vZGVsMlByZXZWZXJzaW9uSWQpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdNb2RlbCB2ZXJzaW9uIGlkIGRpZCBub3QgYWR2YW5jZSBiZXR3ZWVuIGVkaXRzICgyKScpO1xuXHRcdFx0fVxuXHRcdFx0bWlycm9yTW9kZWwyUHJldlZlcnNpb25JZCA9IHZlcnNpb25JZDtcblx0XHRcdG1pcnJvck1vZGVsMi5vbkV2ZW50cyhlKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFzc2VydE1pcnJvck1vZGVscyA9ICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaXJyb3JNb2RlbDIuZ2V0VGV4dCgpLCBtb2RlbC5nZXRWYWx1ZSgpLCAnbWlycm9yIG1vZGVsIDIgdGV4dCBPSycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pcnJvck1vZGVsMi52ZXJzaW9uLCBtb2RlbC5nZXRWZXJzaW9uSWQoKSwgJ21pcnJvciBtb2RlbCAyIHZlcnNpb24gT0snKTtcblx0XHR9O1xuXG5cdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXHRcdGFzc2VydE1pcnJvck1vZGVscygpO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdG1pcnJvck1vZGVsMi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NzczMzogVW5kbyBtYW5nbGVzIHVuaWNvZGUgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnXFwnXHVEODNEXHVEQzQxXFwnJyk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ1wiJyB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCB0ZXh0OiAnXCInIH0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcIlxcJ1wiXHVEODNEXHVEQzQxXFwnJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDMsIDEsIDQpKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDQpKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDIpLCB0ZXh0OiBudWxsIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMywgMSwgNCksIHRleHQ6IG51bGwgfSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcJ1x1RDgzRFx1REM0MVxcJycpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDg3NDE6IEJyb2tlbiB1bmRvIHN0YWNrIHdpdGggbW92ZSBsaW5lcyB1cCB3aXRoIG11bHRpcGxlIGN1cnNvcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2xpbmUxJyxcblx0XHRcdCdsaW5lMicsXG5cdFx0XHQnbGluZTMnLFxuXHRcdFx0JycsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRjb25zdCB1bmRvRWRpdHMgPSBtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg0LCAxLCA0LCAxKSwgdGV4dDogJ2xpbmUzJywgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgzLCAxLCAzLCA2KSwgdGV4dDogbnVsbCwgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAzLCAxKSwgdGV4dDogbnVsbCwgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgzLCA2LCAzLCA2KSwgdGV4dDogJ1xcbmxpbmUyJyB9XG5cdFx0XSwgdHJ1ZSk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKHVuZG9FZGl0cyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdsaW5lMVxcbmxpbmUyXFxubGluZTNcXG4nKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NSTEYgZWRpdCBub3JtYWxpemF0aW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlZGl0IGVuZGluZyB3aXRoIFxcXFxyIGZvbGxvd2VkIGJ5IFxcXFxuIGluIGJ1ZmZlciBzaG91bGQgc3RyaXAgdHJhaWxpbmcgXFxcXHInLCAoKSA9PiB7XG5cdFx0Ly8gRG9jdW1lbnQ6IFwiYWJjXFxyXFxuZGVmXFxyXFxuXCJcblx0XHQvLyBFZGl0OiBSZXBsYWNlIHJhbmdlICgxLDEpLSgxLDQpIFwiYWJjXCIgd2l0aCBcInh5elxcclwiXG5cdFx0Ly8gVGhlIFxcciBhdCBlbmQgb2YgcmVwbGFjZW1lbnQgc2hvdWxkIGJlIHN0cmlwcGVkIHNpbmNlIG5leHQgY2hhciBpcyBcXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnYWJjXFxyXFxuZGVmXFxyXFxuJyk7XG5cdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEVPTCgpLCAnXFxyXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdhYmMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdkZWYnKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpLCB0ZXh0OiAneHl6XFxyJyB9XG5cdFx0XSk7XG5cblx0XHQvLyBUaGUgdHJhaWxpbmcgXFxyIHNob3VsZCBiZSBzdHJpcHBlZCwgc28gd2UgZ2V0IFwieHl6XCIgbm90IFwieHl6XFxyXCJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4eXonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdkZWYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDMpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0IGVuZGluZyB3aXRoIFxcXFxyXFxcXG4gc2hvdWxkIE5PVCBiZSBtb2RpZmllZCcsICgpID0+IHtcblx0XHQvLyBEb2N1bWVudDogXCJhYmNcXHJcXG5kZWZcXHJcXG5cIlxuXHRcdC8vIEVkaXQ6IFJlcGxhY2UgcmFuZ2UgKDEsMSktKDEsNCkgXCJhYmNcIiB3aXRoIFwieHl6XFxyXFxuXCJcblx0XHQvLyBUaGlzIGlzIGEgcHJvcGVyIENSTEYgc28gc2hvdWxkIG5vdCBiZSBtb2RpZmllZFxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdhYmNcXHJcXG5kZWZcXHJcXG4nKTtcblx0XHRtb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgdGV4dDogJ3h5elxcclxcbicgfVxuXHRcdF0pO1xuXG5cdFx0Ly8gU2hvdWxkIGFkZCBhIG5ldyBsaW5lXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneHl6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnZGVmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCA0KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdCBlbmRpbmcgd2l0aCBcXFxcciBOT1QgZm9sbG93ZWQgYnkgXFxcXG4gc2hvdWxkIE5PVCBiZSBtb2RpZmllZCcsICgpID0+IHtcblx0XHQvLyBEb2N1bWVudDogXCJhYmNkZWZcIiAobm8gbmV3bGluZSBhZnRlcilcblx0XHQvLyBFZGl0OiBSZXBsYWNlIHJhbmdlICgxLDEpLSgxLDQpIFwiYWJjXCIgd2l0aCBcInh5elxcclwiXG5cdFx0Ly8gU2luY2UgdGhlcmUncyBubyBcXG4gYWZ0ZXIgdGhlIHJhbmdlLCB0aGUgXFxyIHNob3VsZCBzdGF5XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FiY2RlZicpO1xuXHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDQpLCB0ZXh0OiAneHl6XFxyJyB9XG5cdFx0XSk7XG5cblx0XHQvLyBUaGUgXFxyIHNob3VsZCBjYXVzZSBhIG5ldyBsaW5lIHNpbmNlIGJ1ZmZlciBub3JtYWxpemVzIEVPTFxuXHRcdC8vIEFjdHVhbGx5IHNpbmNlIGJ1ZmZlciB1c2VzIENSTEYsIHRoZSBsb25lIFxcciB3aWxsIGJlIG5vcm1hbGl6ZWQgdG8gXFxyXFxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCAyKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdCBpbiBMRiBidWZmZXIgc2hvdWxkIE5PVCBzdHJpcCB0cmFpbGluZyBcXFxccicsICgpID0+IHtcblx0XHQvLyBEb2N1bWVudCB3aXRoIExGOiBcImFiY1xcbmRlZlxcblwiXG5cdFx0Ly8gRWRpdDogUmVwbGFjZSByYW5nZSAoMSwxKS0oMSw0KSBcImFiY1wiIHdpdGggXCJ4eXpcXHJcIlxuXHRcdC8vIFNpbmNlIGJ1ZmZlciBpcyBMRiwgbm8gc3BlY2lhbCBoYW5kbGluZyBuZWVkZWRcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnYWJjXFxuZGVmXFxuJyk7XG5cdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkxGKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRFT0woKSwgJ1xcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgMyk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgdGV4dDogJ3h5elxccicgfVxuXHRcdF0pO1xuXG5cdFx0Ly8gVGhlIFxcciB3aWxsIGJlIG5vcm1hbGl6ZWQgdG8gXFxuIChidWZmZXIncyBFT0wpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCA0KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnTFNQIGluY2x1ZGUgc29ydGluZyBzY2VuYXJpbyAtIGVkaXQgZW5kaW5nIHdpdGggXFxcXHIgc2hvdWxkIGJlIG5vcm1hbGl6ZWQnLCAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBpcyB0aGUgcmVhbC13b3JsZCBzY2VuYXJpbyBmcm9tIHRoZSBpc3N1ZVxuXHRcdC8vIERvY3VtZW50OiBcIiNpbmNsdWRlIFxcXCJhLmhcXFwiXFxyXFxuI2luY2x1ZGUgXFxcImMuaFxcXCJcXHJcXG4jaW5jbHVkZSBcXFwiYi5oXFxcIlxcclxcblwiXG5cdFx0Ly8gRWRpdDogUmVwbGFjZSBsaW5lcyAxLTMgd2l0aCByZW9yZGVyZWQgaW5jbHVkZXMgZW5kaW5nIHdpdGggXFxyXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJyNpbmNsdWRlIFwiYS5oXCJcXHJcXG4jaW5jbHVkZSBcImMuaFwiXFxyXFxuI2luY2x1ZGUgXCJiLmhcIlxcclxcbicpO1xuXHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRFT0woKSwgJ1xcclxcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnI2luY2x1ZGUgXCJhLmhcIicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyNpbmNsdWRlIFwiYy5oXCInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcjaW5jbHVkZSBcImIuaFwiJyk7XG5cblx0XHQvLyBFZGl0OiByZXBsYWNlIHJhbmdlICgxLDEpLSgzLDE2KSB3aXRoIHRleHQgZW5kaW5nIGluIFxcclxuXHRcdC8vIFJhbmdlIGNvdmVyczogI2luY2x1ZGUgXCJhLmhcIlxcclxcbiNpbmNsdWRlIFwiYy5oXCJcXHJcXG4jaW5jbHVkZSBcImIuaFwiXG5cdFx0Ly8gTm90ZTogbGluZSAzIGNvbCAxNiBpcyBhZnRlciB0aGUgbGFzdCBjaGFyIFwiaFwiIGJ1dCBiZWZvcmUgdGhlIFxcclxcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDMsIDE2KSxcblx0XHRcdFx0dGV4dDogJyNpbmNsdWRlIFwiYS5oXCJcXHJcXG4jaW5jbHVkZSBcImIuaFwiXFxyXFxuI2luY2x1ZGUgXCJjLmhcIlxccidcblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdC8vIFRoZSB0cmFpbGluZyBcXHIgc2hvdWxkIGJlIHN0cmlwcGVkIGJlY2F1c2UgdGhlIG5leHQgY2hhciBhZnRlciByYW5nZSBpcyBcXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyNpbmNsdWRlIFwiYS5oXCInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcjaW5jbHVkZSBcImIuaFwiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnI2luY2x1ZGUgXCJjLmhcIicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJycpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsYUFBYTtBQUN0QixTQUFTLHFCQUFxQix5QkFBeUI7QUFDdkQsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxvQkFBb0Isc0NBQXNDO0FBQ25FLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sc0VBQXNFLE1BQU07QUFFakYsMENBQXdDO0FBRXhDLFdBQVMsZUFBZSxVQUFvQixPQUErQixRQUFpQixPQUFzQjtBQUNqSCxVQUFNLFFBQVEsZ0JBQWdCLFNBQVMsS0FBSyxJQUFJLENBQUM7QUFDakQsVUFBTSxPQUFPLGtCQUFrQixFQUFFO0FBRWpDLFdBQU8sWUFBWSxNQUFNLGdCQUFnQixHQUFHLE1BQU07QUFFbEQsVUFBTSxXQUFXLEtBQUs7QUFDdEIsV0FBTyxZQUFZLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSztBQUNqRCxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBRUEsV0FBUyxPQUFPLGlCQUF5QixhQUFxQixlQUF1QixXQUFtQixNQUFzQztBQUM3SSxXQUFPO0FBQUEsTUFDTixPQUFPLElBQUksTUFBTSxpQkFBaUIsYUFBYSxlQUFlLFNBQVM7QUFBQSxNQUN2RSxNQUFNLEtBQUssS0FBSyxJQUFJO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBRUEsT0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxtQkFBZSxDQUFDLHFJQUFpQyxHQUFHLENBQUMsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxNQUFNLElBQUk7QUFBQSxFQUNoRyxDQUFDO0FBRUQsT0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxtQkFBZSxDQUFDLHFJQUFpQyxHQUFHLENBQUMsT0FBTyxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxNQUFNLElBQUk7QUFBQSxFQUM3RixDQUFDO0FBRUQsT0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxtQkFBZSxDQUFDLHFJQUFpQyxHQUFHLENBQUMsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsdUpBQStCLENBQUMsQ0FBQyxHQUFHLE1BQU0sSUFBSTtBQUFBLEVBQ3hILENBQUM7QUFFRCxPQUFLLDhCQUE4QixNQUFNO0FBQ3hDLG1CQUFlLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLE9BQU8sS0FBSztBQUFBLEVBQ2pGLENBQUM7QUFFRCxPQUFLLGdDQUFnQyxNQUFNO0FBQzFDLG1CQUFlLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyx1SkFBK0IsQ0FBQyxDQUFDLEdBQUcsT0FBTyxJQUFJO0FBQUEsRUFDeEcsQ0FBQztBQUVELE9BQUssZ0NBQWdDLE1BQU07QUFDMUMsbUJBQWUsQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLDZIQUF5QixDQUFDLENBQUMsR0FBRyxPQUFPLElBQUk7QUFBQSxFQUNsRyxDQUFDO0FBQ0YsQ0FBQztBQUdELE1BQU0sZ0ZBQWdGLE1BQU07QUFFM0YsMENBQXdDO0FBRXhDLFdBQVMsZUFBZSxVQUFvQixPQUErQixRQUFpQixPQUFzQjtBQUNqSCxVQUFNLFFBQVEsZ0JBQWdCLFNBQVMsS0FBSyxJQUFJLENBQUM7QUFDakQsVUFBTSxPQUFPLGtCQUFrQixFQUFFO0FBRWpDLFdBQU8sWUFBWSxNQUFNLDBCQUEwQixHQUFHLE1BQU07QUFFNUQsVUFBTSxXQUFXLEtBQUs7QUFDdEIsV0FBTyxZQUFZLE1BQU0sMEJBQTBCLEdBQUcsS0FBSztBQUMzRCxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBRUEsV0FBUyxPQUFPLGlCQUF5QixhQUFxQixlQUF1QixXQUFtQixNQUFzQztBQUM3SSxXQUFPO0FBQUEsTUFDTixPQUFPLElBQUksTUFBTSxpQkFBaUIsYUFBYSxlQUFlLFNBQVM7QUFBQSxNQUN2RSxNQUFNLEtBQUssS0FBSyxJQUFJO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBRUEsT0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxtQkFBZSxDQUFDLG1CQUFnQixHQUFHLENBQUMsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsU0FBUyxhQUFhLENBQUMsQ0FBQyxHQUFHLE1BQU0sSUFBSTtBQUFBLEVBQzlGLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBQ3BELG1CQUFlLENBQUMsbUJBQWdCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsR0FBRyxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLE1BQU0sSUFBSTtBQUFBLEVBQzVFLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBQ3BELG1CQUFlLENBQUMsbUJBQWdCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxXQUFRLENBQUMsQ0FBQyxHQUFHLE1BQU0sSUFBSTtBQUFBLEVBQ2hGLENBQUM7QUFFRCxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDLG1CQUFlLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxTQUFTLGFBQWEsQ0FBQyxDQUFDLEdBQUcsT0FBTyxLQUFLO0FBQUEsRUFDaEcsQ0FBQztBQUVELE9BQUssc0NBQXNDLE1BQU07QUFDaEQsbUJBQWUsQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLGFBQVUsV0FBUSxDQUFDLENBQUMsR0FBRyxPQUFPLElBQUk7QUFBQSxFQUMzRixDQUFDO0FBRUYsQ0FBQztBQUVELE1BQU0sOENBQThDLE1BQU07QUFFekQsMENBQXdDO0FBRXhDLFdBQVMsT0FBTyxpQkFBeUIsYUFBcUIsZUFBdUIsV0FBbUIsTUFBc0M7QUFDN0ksV0FBTztBQUFBLE1BQ04sT0FBTyxJQUFJLE1BQU0saUJBQWlCLGFBQWEsZUFBZSxTQUFTO0FBQUEsTUFDdkUsTUFBTSxLQUFLLEtBQUssSUFBSTtBQUFBLE1BQ3BCLGtCQUFrQjtBQUFBLElBQ25CO0FBQUEsRUFDRDtBQUVBLE9BQUsseUJBQXlCLE1BQU07QUFDbkM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUFBLE1BQ3pCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQTtBQUFBLE1BQ3FCO0FBQUEsSUFDdEI7QUFBQSxFQUNELENBQUM7QUFDRCxPQUFLLHlCQUF5QixNQUFNO0FBQ25DO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFBQSxNQUN6QjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUE7QUFBQSxNQUNxQjtBQUFBLElBQ3RCO0FBQUEsRUFDRCxDQUFDO0FBQ0QsT0FBSyx5QkFBeUIsTUFBTTtBQUNuQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQUEsTUFDekI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBO0FBQUEsTUFDcUI7QUFBQSxJQUN0QjtBQUFBLEVBQ0QsQ0FBQztBQUNELE9BQUsseUJBQXlCLE1BQU07QUFDbkM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUFBLE1BQ3pCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQTtBQUFBLE1BQ3FCO0FBQUEsSUFDdEI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDRCQUE0QixNQUFNO0FBQ3RDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQ3ZCLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssZ0NBQWdDLE1BQU07QUFDMUM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUM7QUFBQSxRQUN4QixPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQztBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHFCQUFxQixNQUFNO0FBQy9CO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG9CQUFvQixNQUFNO0FBQzlCO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQ3ZCLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlDQUFpQyxNQUFNO0FBQzNDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlDQUFpQyxNQUFNO0FBQzNDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNCQUFzQixNQUFNO0FBQ2hDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQUEsTUFDNUI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGdDQUFnQyxNQUFNO0FBQzFDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLGFBQWEsV0FBVyxDQUFDO0FBQUEsTUFDOUM7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlDQUFpQyxNQUFNO0FBQzNDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLGFBQWEsK0JBQStCLFdBQVcsQ0FBQztBQUFBLE1BQzdFO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0NBQWtDLE1BQU07QUFDNUM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7QUFBQSxNQUN4QztBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssNEJBQTRCLE1BQU07QUFDdEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7QUFBQSxRQUN2QyxPQUFPLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQztBQUFBLE1BQ2hDO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscUJBQXFCLE1BQU07QUFDL0I7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDeEI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssNkJBQTZCLE1BQU07QUFDdkM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDeEI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssK0JBQStCLE1BQU07QUFDekM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQUEsTUFDekI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssK0JBQStCLE1BQU07QUFDekM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDekI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssOEJBQThCLE1BQU07QUFDeEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDeEI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywrQkFBK0IsTUFBTTtBQUN6QztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscUJBQXFCLE1BQU07QUFDL0I7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDeEI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1QkFBdUIsTUFBTTtBQUNqQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFJLENBQUM7QUFBQSxRQUN6QixPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx5QkFBeUIsTUFBTTtBQUNuQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUN2QixPQUFPLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxjQUFjLE1BQU07QUFDeEI7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7QUFBQSxRQUMzQixPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUN2QixPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUM7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFB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QUFNLFFBQVE7QUFBQSxJQUMvQyxDQUFDO0FBSUQsV0FBTyxZQUFZLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFFMUMsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyxtREFBbUQsTUFBTTtBQUk3RCxVQUFNLFFBQVEsZ0JBQWdCLFlBQVk7QUFDMUMsVUFBTSxPQUFPLGtCQUFrQixFQUFFO0FBRWpDLFdBQU8sWUFBWSxNQUFNLE9BQU8sR0FBRyxJQUFJO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLGFBQWEsR0FBRyxDQUFDO0FBRTFDLFVBQU0sV0FBVztBQUFBLE1BQ2hCLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sUUFBUTtBQUFBLElBQy9DLENBQUM7QUFHRCxXQUFPLFlBQVksTUFBTSxhQUFhLEdBQUcsQ0FBQztBQUUxQyxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxNQUFNO0FBSXRGLFVBQU0sUUFBUSxnQkFBZ0Isd0RBQXdEO0FBQ3RGLFVBQU0sT0FBTyxrQkFBa0IsSUFBSTtBQUVuQyxXQUFPLFlBQVksTUFBTSxPQUFPLEdBQUcsTUFBTTtBQUN6QyxXQUFPLFlBQVksTUFBTSxhQUFhLEdBQUcsQ0FBQztBQUMxQyxXQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxnQkFBZ0I7QUFDNUQsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsZ0JBQWdCO0FBQzVELFdBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLGdCQUFnQjtBQUs1RCxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLFFBQ0MsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQzVCLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRCxDQUFDO0FBR0QsV0FBTyxZQUFZLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFDMUMsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsZ0JBQWdCO0FBQzVELFdBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLGdCQUFnQjtBQUM1RCxXQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxnQkFBZ0I7QUFDNUQsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsRUFBRTtBQUU5QyxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
