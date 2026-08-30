import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { EndOfLineSequence, PositionAffinity } from "../../../common/model.js";
import { ViewEventHandler } from "../../../common/viewEventHandler.js";
import { testViewModel } from "./testViewModel.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { createTextModel } from "../../common/testTextModel.js";
import { createCodeEditorServices, instantiateTestCodeEditor } from "../testCodeEditor.js";
suite("ViewModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #21073: SplitLinesCollection: attempt to access a 'newer' model", () => {
    const text = [""];
    const opts = {
      lineNumbersMinChars: 1
    };
    testViewModel(text, opts, (viewModel, model) => {
      assert.strictEqual(viewModel.getLineCount(), 1);
      viewModel.setViewport(1, 1, 1);
      model.applyEdits([{
        range: new Range(1, 1, 1, 1),
        text: [
          "line01",
          "line02",
          "line03",
          "line04",
          "line05",
          "line06",
          "line07",
          "line08",
          "line09",
          "line10"
        ].join("\n")
      }]);
      assert.strictEqual(viewModel.getLineCount(), 10);
    });
  });
  test("issue #44805: SplitLinesCollection: attempt to access a 'newer' model", () => {
    const text = [""];
    testViewModel(text, {}, (viewModel, model) => {
      assert.strictEqual(viewModel.getLineCount(), 1);
      model.pushEditOperations([], [{
        range: new Range(1, 1, 1, 1),
        text: "\ninsert1"
      }], () => []);
      model.pushEditOperations([], [{
        range: new Range(1, 1, 1, 1),
        text: "\ninsert2"
      }], () => []);
      model.pushEditOperations([], [{
        range: new Range(1, 1, 1, 1),
        text: "\ninsert3"
      }], () => []);
      const viewLineCount = [];
      viewLineCount.push(viewModel.getLineCount());
      const eventHandler = new class extends ViewEventHandler {
        handleEvents(events) {
          viewLineCount.push(viewModel.getLineCount());
        }
      }();
      viewModel.addViewEventHandler(eventHandler);
      model.undo();
      viewLineCount.push(viewModel.getLineCount());
      assert.deepStrictEqual(viewLineCount, [4, 1, 1, 1, 1]);
      viewModel.removeViewEventHandler(eventHandler);
      eventHandler.dispose();
    });
  });
  test("view models react first to model changes", () => {
    const initialText = [
      "Hello",
      "world"
    ];
    const disposables = new DisposableStore();
    const model = disposables.add(createTextModel(initialText.join("\n")));
    const instantiationService = createCodeEditorServices(disposables);
    const ed1 = disposables.add(instantiateTestCodeEditor(instantiationService, model));
    disposables.add(instantiateTestCodeEditor(instantiationService, model));
    let isFirst = true;
    disposables.add(ed1.onDidChangeModelContent((e) => {
      if (isFirst) {
        isFirst = false;
        model.applyEdits([{ range: new Range(1, 6, 2, 1), text: "" }]);
      }
    }));
    model.applyEdits([{ range: new Range(2, 6, 2, 6), text: "!" }]);
    disposables.dispose();
  });
  test("issue #44805: No visible lines via API call", () => {
    const text = [
      "line1",
      "line2",
      "line3"
    ];
    testViewModel(text, {}, (viewModel, model) => {
      assert.strictEqual(viewModel.getLineCount(), 3);
      viewModel.setHiddenAreas([new Range(1, 1, 3, 1)]);
      assert.ok(viewModel.getVisibleRanges() !== null);
    });
  });
  test("issue #44805: No visible lines via undoing", () => {
    const text = [
      ""
    ];
    testViewModel(text, {}, (viewModel, model) => {
      assert.strictEqual(viewModel.getLineCount(), 1);
      model.pushEditOperations([], [{
        range: new Range(1, 1, 1, 1),
        text: "line1\nline2\nline3"
      }], () => []);
      viewModel.setHiddenAreas([new Range(1, 1, 1, 1)]);
      assert.strictEqual(viewModel.getLineCount(), 2);
      model.undo();
      assert.ok(viewModel.getVisibleRanges() !== null);
    });
  });
  function assertGetPlainTextToCopy(text, ranges, emptySelectionClipboard, expected) {
    testViewModel(text, {}, (viewModel, model) => {
      const actual = viewModel.getPlainTextToCopy(ranges, emptySelectionClipboard, false);
      assert.deepStrictEqual(actual.sourceText, expected);
    });
  }
  const USUAL_TEXT = [
    "",
    "line2",
    "line3",
    "line4",
    ""
  ];
  test("getPlainTextToCopy 0/1", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2)
      ],
      false,
      ""
    );
  });
  test("getPlainTextToCopy 0/1 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2)
      ],
      true,
      "line2\n"
    );
  });
  test("getPlainTextToCopy 1/1", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6)
      ],
      false,
      "ine2"
    );
  });
  test("getPlainTextToCopy 1/1 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6)
      ],
      true,
      "ine2"
    );
  });
  test("getPlainTextToCopy 0/2", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2),
        new Range(3, 2, 3, 2)
      ],
      false,
      ""
    );
  });
  test("getPlainTextToCopy 0/2 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2),
        new Range(3, 2, 3, 2)
      ],
      true,
      [
        "line2\n",
        "line3\n"
      ]
    );
  });
  test("issue #256039: getPlainTextToCopy with multiple cursors and empty selections should return array", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 1, 2, 1),
        new Range(3, 1, 3, 1)
      ],
      true,
      ["line2\n", "line3\n"]
    );
  });
  test("getPlainTextToCopy 1/2", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6),
        new Range(3, 2, 3, 2)
      ],
      false,
      "ine2"
    );
  });
  test("getPlainTextToCopy 1/2 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6),
        new Range(3, 2, 3, 2)
      ],
      true,
      ["ine2", "line3\n"]
    );
  });
  test("getPlainTextToCopy 2/2", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6),
        new Range(3, 2, 3, 6)
      ],
      false,
      ["ine2", "ine3"]
    );
  });
  test("getPlainTextToCopy 2/2 reversed", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(3, 2, 3, 6),
        new Range(2, 2, 2, 6)
      ],
      false,
      ["ine2", "ine3"]
    );
  });
  test("getPlainTextToCopy 0/3 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2),
        new Range(2, 3, 2, 3),
        new Range(3, 2, 3, 2)
      ],
      true,
      [
        "line2\n",
        "line3\n"
      ]
    );
  });
  test("issue #22688 - always use CRLF for clipboard on Windows", () => {
    testViewModel(USUAL_TEXT, {}, (viewModel, model) => {
      model.setEOL(EndOfLineSequence.LF);
      const actual = viewModel.getPlainTextToCopy([new Range(2, 1, 5, 1)], true, true);
      assert.deepStrictEqual(actual.sourceText, "line2\r\nline3\r\nline4\r\n");
    });
  });
  test("issue #40926: Incorrect spacing when inserting new line after multiple folded blocks of code", () => {
    testViewModel(
      [
        "foo = {",
        "    foobar: function() {",
        "        this.foobar();",
        "    },",
        "    foobar: function() {",
        "        this.foobar();",
        "    },",
        "    foobar: function() {",
        "        this.foobar();",
        "    },",
        "}"
      ],
      {},
      (viewModel, model) => {
        viewModel.setHiddenAreas([
          new Range(3, 1, 3, 1),
          new Range(6, 1, 6, 1),
          new Range(9, 1, 9, 1)
        ]);
        model.applyEdits([
          { range: new Range(4, 7, 4, 7), text: "\n    " },
          { range: new Range(7, 7, 7, 7), text: "\n    " },
          { range: new Range(10, 7, 10, 7), text: "\n    " }
        ]);
        assert.strictEqual(viewModel.getLineCount(), 11);
      }
    );
  });
  test("normalizePosition with multiple touching injected text", () => {
    testViewModel(
      [
        "just some text"
      ],
      {},
      (viewModel, model) => {
        model.deltaDecorations([], [
          {
            range: new Range(1, 8, 1, 8),
            options: {
              description: "test",
              before: {
                content: "bar"
              },
              showIfCollapsed: true
            }
          },
          {
            range: new Range(1, 8, 1, 8),
            options: {
              description: "test",
              before: {
                content: "bz"
              },
              showIfCollapsed: true
            }
          }
        ]);
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.None), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.None), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.None), new Position(1, 11));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.None), new Position(1, 11));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.None), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.Right), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.Right), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.Right), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.Right), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.Right), new Position(1, 13));
      }
    );
  });
  test("issue #193262: Incorrect implementation of modifyPosition", () => {
    testViewModel(
      [
        "just some text"
      ],
      {
        wordWrap: "wordWrapColumn",
        wordWrapColumn: 5
      },
      (viewModel, model) => {
        assert.deepStrictEqual(
          new Position(3, 1),
          viewModel.modifyPosition(new Position(3, 2), -1)
        );
      }
    );
  });
  suite("hidden areas must always leave at least one visible line", () => {
    test("replacing the only visible line content does not make it hidden", () => {
      const text = [
        "line1",
        "line2",
        "line3"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([
          new Range(1, 1, 1, 1),
          new Range(3, 1, 3, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{
          range: new Range(2, 1, 2, 6),
          text: "new content"
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("deleting the only visible line when it is the last line", () => {
      const text = [
        "line1",
        "line2",
        "line3"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([new Range(1, 1, 2, 1)]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{
          range: new Range(2, 6, 3, 6),
          text: null
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("deleting the only visible line when it is in the middle", () => {
      const text = [
        "line1",
        "line2",
        "line3",
        "line4",
        "line5"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([
          new Range(1, 1, 2, 1),
          new Range(4, 1, 5, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{
          range: new Range(2, 6, 4, 1),
          text: null
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("undo that removes the only visible line", () => {
      const text = [
        "line1"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.pushEditOperations([], [{
          range: new Range(1, 6, 1, 6),
          text: "\nline2\nline3\nline4\nline5"
        }], () => []);
        assert.strictEqual(viewModel.getLineCount(), 5);
        viewModel.setHiddenAreas([
          new Range(1, 1, 2, 1),
          new Range(4, 1, 5, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.undo();
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("deleting the only visible line between two hidden areas leaves all lines hidden", () => {
      const text = [
        "line1",
        "line2",
        "line3",
        "line4",
        "line5",
        "line6",
        "line7",
        "line8"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        assert.strictEqual(viewModel.getLineCount(), 8);
        viewModel.setHiddenAreas([
          new Range(1, 1, 5, 1),
          new Range(7, 1, 8, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{
          range: new Range(6, 1, 8, 5),
          text: null
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("multiple visible lines deleted leaving only hidden lines", () => {
      const text = [
        "hidden1",
        "hidden2",
        "visible1",
        "visible2",
        "hidden3",
        "hidden4"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([
          new Range(1, 1, 2, 1),
          new Range(5, 1, 6, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 2);
        model.applyEdits([{
          range: new Range(2, 8, 5, 1),
          text: null
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("hidden areas from multiple sources that overlap produce valid merged result", () => {
      const text = [];
      for (let i = 1; i <= 10; i++) {
        text.push(`line${i}`);
      }
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([new Range(1, 1, 8, 1)], "sourceA");
        viewModel.setHiddenAreas([new Range(2, 1, 3, 1), new Range(5, 1, 6, 1), new Range(8, 1, 9, 1)], "sourceB");
        assert.strictEqual(viewModel.getLineCount(), 1, "only line 10 should be visible");
        const hiddenAreas = viewModel.getHiddenAreas();
        for (let i = 1; i < hiddenAreas.length; i++) {
          assert.ok(
            hiddenAreas[i].startLineNumber > hiddenAreas[i - 1].endLineNumber,
            `hidden areas should not overlap: [${hiddenAreas[i - 1].startLineNumber}-${hiddenAreas[i - 1].endLineNumber}] and [${hiddenAreas[i].startLineNumber}-${hiddenAreas[i].endLineNumber}]`
          );
        }
      });
    });
    test("tab size change with drifted hidden area decorations must not leave 0 visible lines", () => {
      const text = [
        "line1",
        "line2",
        "line3"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([new Range(1, 1, 2, 1)]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{ range: new Range(2, 1, 2, 1), text: "x\n" }]);
        model.applyEdits([{ range: new Range(3, 1, 3, 1), text: "y\n" }]);
        model.applyEdits([{ range: new Range(4, 1, 5, 6), text: "" }]);
        model.updateOptions({ tabSize: 8 });
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXHZpZXdNb2RlbFxcdmlld01vZGVsSW1wbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UsIFBvc2l0aW9uQWZmaW5pdHkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVmlld0V2ZW50SGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRIYW5kbGVyLmpzJztcbmltcG9ydCB7IFZpZXdFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IHRlc3RWaWV3TW9kZWwgfSBmcm9tICcuL3Rlc3RWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcywgaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uL3Rlc3RDb2RlRWRpdG9yLmpzJztcblxuc3VpdGUoJ1ZpZXdNb2RlbCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjEwNzM6IFNwbGl0TGluZXNDb2xsZWN0aW9uOiBhdHRlbXB0IHRvIGFjY2VzcyBhIFxcJ25ld2VyXFwnIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbJyddO1xuXHRcdGNvbnN0IG9wdHMgPSB7XG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAxXG5cdFx0fTtcblx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIG9wdHMsICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFZpZXdwb3J0KDEsIDEsIDEpO1xuXG5cdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksXG5cdFx0XHRcdHRleHQ6IFtcblx0XHRcdFx0XHQnbGluZTAxJyxcblx0XHRcdFx0XHQnbGluZTAyJyxcblx0XHRcdFx0XHQnbGluZTAzJyxcblx0XHRcdFx0XHQnbGluZTA0Jyxcblx0XHRcdFx0XHQnbGluZTA1Jyxcblx0XHRcdFx0XHQnbGluZTA2Jyxcblx0XHRcdFx0XHQnbGluZTA3Jyxcblx0XHRcdFx0XHQnbGluZTA4Jyxcblx0XHRcdFx0XHQnbGluZTA5Jyxcblx0XHRcdFx0XHQnbGluZTEwJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NDgwNTogU3BsaXRMaW5lc0NvbGxlY3Rpb246IGF0dGVtcHQgdG8gYWNjZXNzIGEgXFwnbmV3ZXJcXCcgbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFsnJ107XG5cdFx0dGVzdFZpZXdNb2RlbCh0ZXh0LCB7fSwgKHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXG5cdFx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoW10sIFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksXG5cdFx0XHRcdHRleHQ6ICdcXG5pbnNlcnQxJ1xuXHRcdFx0fV0sICgpID0+IChbXSkpO1xuXG5cdFx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoW10sIFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksXG5cdFx0XHRcdHRleHQ6ICdcXG5pbnNlcnQyJ1xuXHRcdFx0fV0sICgpID0+IChbXSkpO1xuXG5cdFx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoW10sIFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksXG5cdFx0XHRcdHRleHQ6ICdcXG5pbnNlcnQzJ1xuXHRcdFx0fV0sICgpID0+IChbXSkpO1xuXG5cdFx0XHRjb25zdCB2aWV3TGluZUNvdW50OiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0XHR2aWV3TGluZUNvdW50LnB1c2godmlld01vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGNvbnN0IGV2ZW50SGFuZGxlciA9IG5ldyBjbGFzcyBleHRlbmRzIFZpZXdFdmVudEhhbmRsZXIge1xuXHRcdFx0XHRvdmVycmlkZSBoYW5kbGVFdmVudHMoZXZlbnRzOiBWaWV3RXZlbnRbXSk6IHZvaWQge1xuXHRcdFx0XHRcdC8vIEFjY2VzcyB0aGUgdmlldyBtb2RlbFxuXHRcdFx0XHRcdHZpZXdMaW5lQ291bnQucHVzaCh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0dmlld01vZGVsLmFkZFZpZXdFdmVudEhhbmRsZXIoZXZlbnRIYW5kbGVyKTtcblx0XHRcdG1vZGVsLnVuZG8oKTtcblx0XHRcdHZpZXdMaW5lQ291bnQucHVzaCh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdMaW5lQ291bnQsIFs0LCAxLCAxLCAxLCAxXSk7XG5cblx0XHRcdHZpZXdNb2RlbC5yZW1vdmVWaWV3RXZlbnRIYW5kbGVyKGV2ZW50SGFuZGxlcik7XG5cdFx0XHRldmVudEhhbmRsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2aWV3IG1vZGVscyByZWFjdCBmaXJzdCB0byBtb2RlbCBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluaXRpYWxUZXh0ID0gW1xuXHRcdFx0J0hlbGxvJyxcblx0XHRcdCd3b3JsZCdcblx0XHRdO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGluaXRpYWxUZXh0LmpvaW4oJ1xcbicpKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVDb2RlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGVkMSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRlc3RDb2RlRWRpdG9yKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBtb2RlbCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRlc3RDb2RlRWRpdG9yKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBtb2RlbCkpO1xuXG5cdFx0Ly8gQWRkIGEgbmFzdHkgbGlzdGVuZXIgd2hpY2ggbW9kaWZpZXMgdGhlIG1vZGVsIGR1cmluZyB0aGUgbW9kZWwgY2hhbmdlIGV2ZW50XG5cdFx0bGV0IGlzRmlyc3QgPSB0cnVlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZDEub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdGlmIChpc0ZpcnN0KSB7XG5cdFx0XHRcdGlzRmlyc3QgPSBmYWxzZTtcblx0XHRcdFx0Ly8gZGVsZXRlIHRoZSBcXG5cblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKDEsIDYsIDIsIDEpLCB0ZXh0OiAnJyB9XSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKDIsIDYsIDIsIDYpLCB0ZXh0OiAnIScgfV0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDQ4MDU6IE5vIHZpc2libGUgbGluZXMgdmlhIEFQSSBjYWxsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnbGluZTEnLFxuXHRcdFx0J2xpbmUyJyxcblx0XHRcdCdsaW5lMydcblx0XHRdO1xuXHRcdHRlc3RWaWV3TW9kZWwodGV4dCwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAzKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbbmV3IFJhbmdlKDEsIDEsIDMsIDEpXSk7XG5cdFx0XHRhc3NlcnQub2sodmlld01vZGVsLmdldFZpc2libGVSYW5nZXMoKSAhPT0gbnVsbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NDgwNTogTm8gdmlzaWJsZSBsaW5lcyB2aWEgdW5kb2luZycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0Jydcblx0XHRdO1xuXHRcdHRlc3RWaWV3TW9kZWwodGV4dCwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtdLCBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHR0ZXh0OiAnbGluZTFcXG5saW5lMlxcbmxpbmUzJ1xuXHRcdFx0fV0sICgpID0+IChbXSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgxLCAxLCAxLCAxKV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMik7XG5cblx0XHRcdG1vZGVsLnVuZG8oKTtcblx0XHRcdGFzc2VydC5vayh2aWV3TW9kZWwuZ2V0VmlzaWJsZVJhbmdlcygpICE9PSBudWxsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KHRleHQ6IHN0cmluZ1tdLCByYW5nZXM6IFJhbmdlW10sIGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkOiBib29sZWFuLCBleHBlY3RlZDogc3RyaW5nIHwgc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gdmlld01vZGVsLmdldFBsYWluVGV4dFRvQ29weShyYW5nZXMsIGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3VyY2VUZXh0LCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRjb25zdCBVU1VBTF9URVhUID0gW1xuXHRcdCcnLFxuXHRcdCdsaW5lMicsXG5cdFx0J2xpbmUzJyxcblx0XHQnbGluZTQnLFxuXHRcdCcnXG5cdF07XG5cblx0dGVzdCgnZ2V0UGxhaW5UZXh0VG9Db3B5IDAvMScsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgMilcblx0XHRcdF0sXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UGxhaW5UZXh0VG9Db3B5IDAvMSAtIGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkJywgKCkgPT4ge1xuXHRcdGFzc2VydEdldFBsYWluVGV4dFRvQ29weShcblx0XHRcdFVTVUFMX1RFWFQsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBSYW5nZSgyLCAyLCAyLCAyKVxuXHRcdFx0XSxcblx0XHRcdHRydWUsXG5cdFx0XHQnbGluZTJcXG4nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UGxhaW5UZXh0VG9Db3B5IDEvMScsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgNilcblx0XHRcdF0sXG5cdFx0XHRmYWxzZSxcblx0XHRcdCdpbmUyJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAxLzEgLSBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgNilcblx0XHRcdF0sXG5cdFx0XHR0cnVlLFxuXHRcdFx0J2luZTInXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UGxhaW5UZXh0VG9Db3B5IDAvMicsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgMiksXG5cdFx0XHRcdG5ldyBSYW5nZSgzLCAyLCAzLCAyKSxcblx0XHRcdF0sXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UGxhaW5UZXh0VG9Db3B5IDAvMiAtIGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkJywgKCkgPT4ge1xuXHRcdGFzc2VydEdldFBsYWluVGV4dFRvQ29weShcblx0XHRcdFVTVUFMX1RFWFQsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBSYW5nZSgyLCAyLCAyLCAyKSxcblx0XHRcdFx0bmV3IFJhbmdlKDMsIDIsIDMsIDIpLFxuXHRcdFx0XSxcblx0XHRcdHRydWUsXG5cdFx0XHRbXG5cdFx0XHRcdCdsaW5lMlxcbicsXG5cdFx0XHRcdCdsaW5lM1xcbidcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjU2MDM5OiBnZXRQbGFpblRleHRUb0NvcHkgd2l0aCBtdWx0aXBsZSBjdXJzb3JzIGFuZCBlbXB0eSBzZWxlY3Rpb25zIHNob3VsZCByZXR1cm4gYXJyYXknLCAoKSA9PiB7XG5cdFx0Ly8gQnVnOiBXaGVuIGNvcHlpbmcgd2l0aCBtdWx0aXBsZSBjdXJzb3JzIChlbXB0eSBzZWxlY3Rpb25zKSB3aXRoIGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkIGVuYWJsZWQsXG5cdFx0Ly8gdGhlIHJlc3VsdCBzaG91bGQgYmUgYW4gYXJyYXkgc28gdGhhdCBwYXN0aW5nIHdpdGggXCJlZGl0b3IubXVsdGlDdXJzb3JQYXN0ZVwiOiBcImZ1bGxcIlxuXHRcdC8vIGNvcnJlY3RseSBkaXN0cmlidXRlcyBlYWNoIGxpbmUgdG8gdGhlIGNvcnJlc3BvbmRpbmcgY3Vyc29yLlxuXHRcdC8vIFdpdGhvdXQgdGhlIGZpeCwgdGhpcyByZXR1cm5zICdsaW5lMlxcbmxpbmUzXFxuJyAoYSBzaW5nbGUgc3RyaW5nKS5cblx0XHQvLyBXaXRoIHRoZSBmaXgsIHRoaXMgcmV0dXJucyBbJ2xpbmUyXFxuJywgJ2xpbmUzXFxuJ10gKGFuIGFycmF5KS5cblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMSwgMiwgMSksXG5cdFx0XHRcdG5ldyBSYW5nZSgzLCAxLCAzLCAxKSxcblx0XHRcdF0sXG5cdFx0XHR0cnVlLFxuXHRcdFx0WydsaW5lMlxcbicsICdsaW5lM1xcbiddXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UGxhaW5UZXh0VG9Db3B5IDEvMicsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgNiksXG5cdFx0XHRcdG5ldyBSYW5nZSgzLCAyLCAzLCAyKSxcblx0XHRcdF0sXG5cdFx0XHRmYWxzZSxcblx0XHRcdCdpbmUyJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAxLzIgLSBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgNiksXG5cdFx0XHRcdG5ldyBSYW5nZSgzLCAyLCAzLCAyKSxcblx0XHRcdF0sXG5cdFx0XHR0cnVlLFxuXHRcdFx0WydpbmUyJywgJ2xpbmUzXFxuJ11cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQbGFpblRleHRUb0NvcHkgMi8yJywgKCkgPT4ge1xuXHRcdGFzc2VydEdldFBsYWluVGV4dFRvQ29weShcblx0XHRcdFVTVUFMX1RFWFQsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBSYW5nZSgyLCAyLCAyLCA2KSxcblx0XHRcdFx0bmV3IFJhbmdlKDMsIDIsIDMsIDYpLFxuXHRcdFx0XSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0WydpbmUyJywgJ2luZTMnXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAyLzIgcmV2ZXJzZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KFxuXHRcdFx0VVNVQUxfVEVYVCxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFJhbmdlKDMsIDIsIDMsIDYpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgNiksXG5cdFx0XHRdLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRbJ2luZTInLCAnaW5lMyddXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UGxhaW5UZXh0VG9Db3B5IDAvMyAtIGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkJywgKCkgPT4ge1xuXHRcdGFzc2VydEdldFBsYWluVGV4dFRvQ29weShcblx0XHRcdFVTVUFMX1RFWFQsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBSYW5nZSgyLCAyLCAyLCAyKSxcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDMsIDIsIDMpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMywgMiwgMywgMiksXG5cdFx0XHRdLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdFtcblx0XHRcdFx0J2xpbmUyXFxuJyxcblx0XHRcdFx0J2xpbmUzXFxuJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMjY4OCAtIGFsd2F5cyB1c2UgQ1JMRiBmb3IgY2xpcGJvYXJkIG9uIFdpbmRvd3MnLCAoKSA9PiB7XG5cdFx0dGVzdFZpZXdNb2RlbChVU1VBTF9URVhULCB7fSwgKHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5MRik7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSB2aWV3TW9kZWwuZ2V0UGxhaW5UZXh0VG9Db3B5KFtuZXcgUmFuZ2UoMiwgMSwgNSwgMSldLCB0cnVlLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvdXJjZVRleHQsICdsaW5lMlxcclxcbmxpbmUzXFxyXFxubGluZTRcXHJcXG4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQwOTI2OiBJbmNvcnJlY3Qgc3BhY2luZyB3aGVuIGluc2VydGluZyBuZXcgbGluZSBhZnRlciBtdWx0aXBsZSBmb2xkZWQgYmxvY2tzIG9mIGNvZGUnLCAoKSA9PiB7XG5cdFx0dGVzdFZpZXdNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2ZvbyA9IHsnLFxuXHRcdFx0XHQnICAgIGZvb2JhcjogZnVuY3Rpb24oKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgdGhpcy5mb29iYXIoKTsnLFxuXHRcdFx0XHQnICAgIH0sJyxcblx0XHRcdFx0JyAgICBmb29iYXI6IGZ1bmN0aW9uKCkgeycsXG5cdFx0XHRcdCcgICAgICAgIHRoaXMuZm9vYmFyKCk7Jyxcblx0XHRcdFx0JyAgICB9LCcsXG5cdFx0XHRcdCcgICAgZm9vYmFyOiBmdW5jdGlvbigpIHsnLFxuXHRcdFx0XHQnICAgICAgICB0aGlzLmZvb2JhcigpOycsXG5cdFx0XHRcdCcgICAgfSwnLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLCB7fSwgKHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMywgMSwgMywgMSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDYsIDEsIDYsIDEpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSg5LCAxLCA5LCAxKSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDQsIDcsIDQsIDcpLCB0ZXh0OiAnXFxuICAgICcgfSxcblx0XHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNywgNywgNywgNyksIHRleHQ6ICdcXG4gICAgJyB9LFxuXHRcdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxMCwgNywgMTAsIDcpLCB0ZXh0OiAnXFxuICAgICcgfVxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxMSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplUG9zaXRpb24gd2l0aCBtdWx0aXBsZSB0b3VjaGluZyBpbmplY3RlZCB0ZXh0JywgKCkgPT4ge1xuXHRcdHRlc3RWaWV3TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdqdXN0IHNvbWUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHR7fSxcblx0XHRcdCh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRcdG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDgsIDEsIDgpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdFx0XHRiZWZvcmU6IHtcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50OiAnYmFyJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgOCwgMSwgOCksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdFx0XHRcdGJlZm9yZToge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdieidcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0Ly8ganVzdCBzb2JhcmJ6bWUgdGV4dFxuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA4KSwgUG9zaXRpb25BZmZpbml0eS5Ob25lKSwgbmV3IFBvc2l0aW9uKDEsIDgpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDkpLCBQb3NpdGlvbkFmZmluaXR5Lk5vbmUpLCBuZXcgUG9zaXRpb24oMSwgOCkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMTEpLCBQb3NpdGlvbkFmZmluaXR5Lk5vbmUpLCBuZXcgUG9zaXRpb24oMSwgMTEpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEyKSwgUG9zaXRpb25BZmZpbml0eS5Ob25lKSwgbmV3IFBvc2l0aW9uKDEsIDExKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxMyksIFBvc2l0aW9uQWZmaW5pdHkuTm9uZSksIG5ldyBQb3NpdGlvbigxLCAxMykpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA4KSwgUG9zaXRpb25BZmZpbml0eS5MZWZ0KSwgbmV3IFBvc2l0aW9uKDEsIDgpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDkpLCBQb3NpdGlvbkFmZmluaXR5LkxlZnQpLCBuZXcgUG9zaXRpb24oMSwgOCkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMTEpLCBQb3NpdGlvbkFmZmluaXR5LkxlZnQpLCBuZXcgUG9zaXRpb24oMSwgOCkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMTIpLCBQb3NpdGlvbkFmZmluaXR5LkxlZnQpLCBuZXcgUG9zaXRpb24oMSwgOCkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMTMpLCBQb3NpdGlvbkFmZmluaXR5LkxlZnQpLCBuZXcgUG9zaXRpb24oMSwgOCkpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA4KSwgUG9zaXRpb25BZmZpbml0eS5SaWdodCksIG5ldyBQb3NpdGlvbigxLCAxMykpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgOSksIFBvc2l0aW9uQWZmaW5pdHkuUmlnaHQpLCBuZXcgUG9zaXRpb24oMSwgMTMpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDExKSwgUG9zaXRpb25BZmZpbml0eS5SaWdodCksIG5ldyBQb3NpdGlvbigxLCAxMykpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMTIpLCBQb3NpdGlvbkFmZmluaXR5LlJpZ2h0KSwgbmV3IFBvc2l0aW9uKDEsIDEzKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxMyksIFBvc2l0aW9uQWZmaW5pdHkuUmlnaHQpLCBuZXcgUG9zaXRpb24oMSwgMTMpKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTkzMjYyOiBJbmNvcnJlY3QgaW1wbGVtZW50YXRpb24gb2YgbW9kaWZ5UG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdFZpZXdNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2p1c3Qgc29tZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0d29yZFdyYXA6ICd3b3JkV3JhcENvbHVtbicsXG5cdFx0XHRcdHdvcmRXcmFwQ29sdW1uOiA1XG5cdFx0XHR9LFxuXHRcdFx0KHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRuZXcgUG9zaXRpb24oMywgMSksXG5cdFx0XHRcdFx0dmlld01vZGVsLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigzLCAyKSwgLTEpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0c3VpdGUoJ2hpZGRlbiBhcmVhcyBtdXN0IGFsd2F5cyBsZWF2ZSBhdCBsZWFzdCBvbmUgdmlzaWJsZSBsaW5lJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVwbGFjaW5nIHRoZSBvbmx5IHZpc2libGUgbGluZSBjb250ZW50IGRvZXMgbm90IG1ha2UgaXQgaGlkZGVuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0J2xpbmUzJyxcblx0XHRcdF07XG5cdFx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHQvLyBIaWRlIGxpbmVzIDEgYW5kIDMsIGxlYXZpbmcgb25seSBsaW5lIDIgdmlzaWJsZVxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW1xuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAxKSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMywgMSwgMywgMSksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0XHQvLyBSZXBsYWNlIGxpbmUgMiBjb250ZW50IGVudGlyZWx5XG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDYpLFxuXHRcdFx0XHRcdHRleHQ6ICduZXcgY29udGVudCdcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGFzc2VydC5vayh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkgPj0gMSwgYGV4cGVjdGVkIGF0IGxlYXN0IDEgdmlldyBsaW5lIGJ1dCBnb3QgJHt2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCl9YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0aW5nIHRoZSBvbmx5IHZpc2libGUgbGluZSB3aGVuIGl0IGlzIHRoZSBsYXN0IGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHQnbGluZTInLFxuXHRcdFx0XHQnbGluZTMnLFxuXHRcdFx0XTtcblx0XHRcdHRlc3RWaWV3TW9kZWwodGV4dCwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRcdC8vIEhpZGUgbGluZXMgMS0yLCBsZWF2aW5nIG9ubHkgbGluZSAzIHZpc2libGVcblx0XHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMSwgMSwgMiwgMSldKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cblx0XHRcdFx0Ly8gRGVsZXRlIGxpbmUgMyBieSBtZXJnaW5nIGl0IGludG8gbGluZSAyXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDIsIDYsIDMsIDYpLFxuXHRcdFx0XHRcdHRleHQ6IG51bGxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGFzc2VydC5vayh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkgPj0gMSwgYGV4cGVjdGVkIGF0IGxlYXN0IDEgdmlldyBsaW5lIGJ1dCBnb3QgJHt2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCl9YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0aW5nIHRoZSBvbmx5IHZpc2libGUgbGluZSB3aGVuIGl0IGlzIGluIHRoZSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHQnbGluZTInLFxuXHRcdFx0XHQnbGluZTMnLFxuXHRcdFx0XHQnbGluZTQnLFxuXHRcdFx0XHQnbGluZTUnLFxuXHRcdFx0XTtcblx0XHRcdHRlc3RWaWV3TW9kZWwodGV4dCwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRcdC8vIEhpZGUgbGluZXMgMS0yIGFuZCA0LTUsIGxlYXZpbmcgb25seSBsaW5lIDMgdmlzaWJsZVxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW1xuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAyLCAxKSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoNCwgMSwgNSwgMSksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0XHQvLyBEZWxldGUgbGluZSAzIGJ5IG1lcmdpbmcgYWRqYWNlbnQgbGluZXNcblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMiwgNiwgNCwgMSksXG5cdFx0XHRcdFx0dGV4dDogbnVsbFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSA+PSAxLCBgZXhwZWN0ZWQgYXQgbGVhc3QgMSB2aWV3IGxpbmUgYnV0IGdvdCAke3ZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKX1gKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5kbyB0aGF0IHJlbW92ZXMgdGhlIG9ubHkgdmlzaWJsZSBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdF07XG5cdFx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0XHQvLyBJbnNlcnQgbGluZXMgdG8gY3JlYXRlIGNvbnRlbnRcblx0XHRcdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtdLCBbe1xuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksXG5cdFx0XHRcdFx0dGV4dDogJ1xcbmxpbmUyXFxubGluZTNcXG5saW5lNFxcbmxpbmU1J1xuXHRcdFx0XHR9XSwgKCkgPT4gKFtdKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgNSk7XG5cblx0XHRcdFx0Ly8gSGlkZSBsaW5lcyAxLTIgYW5kIDQtNSwgbGVhdmluZyBvbmx5IGxpbmUgMyB2aXNpYmxlXG5cdFx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDIsIDEpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSg0LCAxLCA1LCAxKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXG5cdFx0XHRcdC8vIFVuZG8gY29sbGFwc2VzIGJhY2sgdG8gMSBsaW5lLCBidXQgaGlkZGVuIGFyZWEgZGVjb3JhdGlvbnMgbWF5IGdyb3dcblx0XHRcdFx0bW9kZWwudW5kbygpO1xuXG5cdFx0XHRcdGFzc2VydC5vayh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkgPj0gMSwgYGV4cGVjdGVkIGF0IGxlYXN0IDEgdmlldyBsaW5lIGJ1dCBnb3QgJHt2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCl9YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0aW5nIHRoZSBvbmx5IHZpc2libGUgbGluZSBiZXR3ZWVuIHR3byBoaWRkZW4gYXJlYXMgbGVhdmVzIGFsbCBsaW5lcyBoaWRkZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHQnbGluZTInLFxuXHRcdFx0XHQnbGluZTMnLFxuXHRcdFx0XHQnbGluZTQnLFxuXHRcdFx0XHQnbGluZTUnLFxuXHRcdFx0XHQnbGluZTYnLFxuXHRcdFx0XHQnbGluZTcnLFxuXHRcdFx0XHQnbGluZTgnLFxuXHRcdFx0XTtcblx0XHRcdHRlc3RWaWV3TW9kZWwodGV4dCwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCksIDgpO1xuXG5cdFx0XHRcdC8vIEhpZGUgbGluZXMgMS01IGFuZCA3LTgsIGxlYXZpbmcgb25seSBsaW5lIDYgdmlzaWJsZVxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW1xuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCA1LCAxKSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoNywgMSwgOCwgMSksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0XHQvLyBEZWxldGUgbGluZXMgNiwgNywgOCBcdTIwMTQgdGhlIG9ubHkgdmlzaWJsZSBsaW5lIHBsdXMgc29tZSBoaWRkZW4gb25lc1xuXHRcdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSg2LCAxLCA4LCA1KSxcblx0XHRcdFx0XHR0ZXh0OiBudWxsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHQvLyBUaGUgdmlldyBtb2RlbCBtdXN0IHN0aWxsIGhhdmUgYXQgbGVhc3Qgb25lIHZpc2libGUgbGluZVxuXHRcdFx0XHRhc3NlcnQub2sodmlld01vZGVsLmdldExpbmVDb3VudCgpID49IDEsIGBleHBlY3RlZCBhdCBsZWFzdCAxIHZpZXcgbGluZSBidXQgZ290ICR7dmlld01vZGVsLmdldExpbmVDb3VudCgpfWApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSB2aXNpYmxlIGxpbmVzIGRlbGV0ZWQgbGVhdmluZyBvbmx5IGhpZGRlbiBsaW5lcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHRcdCdoaWRkZW4xJyxcblx0XHRcdFx0J2hpZGRlbjInLFxuXHRcdFx0XHQndmlzaWJsZTEnLFxuXHRcdFx0XHQndmlzaWJsZTInLFxuXHRcdFx0XHQnaGlkZGVuMycsXG5cdFx0XHRcdCdoaWRkZW40Jyxcblx0XHRcdF07XG5cdFx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW1xuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAyLCAxKSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoNSwgMSwgNiwgMSksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAyKTtcblxuXHRcdFx0XHQvLyBEZWxldGUgdmlzaWJsZSBsaW5lcyAzIGFuZCA0XG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDIsIDgsIDUsIDEpLFxuXHRcdFx0XHRcdHRleHQ6IG51bGxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGFzc2VydC5vayh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkgPj0gMSwgYGV4cGVjdGVkIGF0IGxlYXN0IDEgdmlldyBsaW5lIGJ1dCBnb3QgJHt2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCl9YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hpZGRlbiBhcmVhcyBmcm9tIG11bHRpcGxlIHNvdXJjZXMgdGhhdCBvdmVybGFwIHByb2R1Y2UgdmFsaWQgbWVyZ2VkIHJlc3VsdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRleHQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSAxMDsgaSsrKSB7XG5cdFx0XHRcdHRleHQucHVzaChgbGluZSR7aX1gKTtcblx0XHRcdH1cblx0XHRcdHRlc3RWaWV3TW9kZWwodGV4dCwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRcdC8vIFNvdXJjZSBBIGhpZGVzIGEgbGFyZ2UgcmFuZ2UgWzEtOF0uXG5cdFx0XHRcdC8vIFNvdXJjZSBCIGhpZGVzIHNtYWxsIHJhbmdlcyBbMi0zXSBhbmQgWzUtNl0gdGhhdCBhcmUgc3Vic3VtZWQgYnkgQS5cblx0XHRcdFx0Ly8gbWVyZ2VMaW5lUmFuZ2VBcnJheSBoYXMgYSBidWcgd2hlcmUgaXQgYWR2YW5jZXMgYm90aCBwb2ludGVycyBhZnRlclxuXHRcdFx0XHQvLyBtZXJnaW5nIFsxLThdK1syLTNdPVsxLThdLCBsZWF2aW5nIFs1LTZdIGFuZCBbOCw5XSBhcyBzZXBhcmF0ZSBlbnRyaWVzXG5cdFx0XHRcdC8vIHRoYXQgb3ZlcmxhcCB3aXRoIG9yIGFyZSBzdWJzdW1lZCBieSBbMS04XS5cblx0XHRcdFx0Ly8gbm9ybWFsaXplTGluZVJhbmdlcyBpbiBzZXRIaWRkZW5BcmVhcyBjbGVhbnMgdGhpcyB1cCwgc28gdGhlIHJlc3VsdFxuXHRcdFx0XHQvLyBzaG91bGQgc3RpbGwgYmUgY29ycmVjdDogbGluZXMgMS04IGhpZGRlbiwgbGluZXMgOS0xMCB2aXNpYmxlLlxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgxLCAxLCA4LCAxKV0sICdzb3VyY2VBJyk7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbbmV3IFJhbmdlKDIsIDEsIDMsIDEpLCBuZXcgUmFuZ2UoNSwgMSwgNiwgMSksIG5ldyBSYW5nZSg4LCAxLCA5LCAxKV0sICdzb3VyY2VCJyk7XG5cblx0XHRcdFx0Ly8gTGluZXMgMS05IHNob3VsZCBiZSBoaWRkZW4gKG1lcmdlZCBmcm9tIFsxLThdIGFuZCBbOC05XSksIGxpbmUgMTAgdmlzaWJsZVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxLCAnb25seSBsaW5lIDEwIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRcdFx0Ly8gVGhlIGhpZGRlbiBhcmVhcyByZXR1cm5lZCBzaG91bGQgYmUgbm9uLW92ZXJsYXBwaW5nIGFuZCBzb3J0ZWRcblx0XHRcdFx0Y29uc3QgaGlkZGVuQXJlYXMgPSB2aWV3TW9kZWwuZ2V0SGlkZGVuQXJlYXMoKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBoaWRkZW5BcmVhcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGFzc2VydC5vayhcblx0XHRcdFx0XHRcdGhpZGRlbkFyZWFzW2ldLnN0YXJ0TGluZU51bWJlciA+IGhpZGRlbkFyZWFzW2kgLSAxXS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0YGhpZGRlbiBhcmVhcyBzaG91bGQgbm90IG92ZXJsYXA6IFske2hpZGRlbkFyZWFzW2kgLSAxXS5zdGFydExpbmVOdW1iZXJ9LSR7aGlkZGVuQXJlYXNbaSAtIDFdLmVuZExpbmVOdW1iZXJ9XSBhbmQgWyR7aGlkZGVuQXJlYXNbaV0uc3RhcnRMaW5lTnVtYmVyfS0ke2hpZGRlbkFyZWFzW2ldLmVuZExpbmVOdW1iZXJ9XWBcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RhYiBzaXplIGNoYW5nZSB3aXRoIGRyaWZ0ZWQgaGlkZGVuIGFyZWEgZGVjb3JhdGlvbnMgbXVzdCBub3QgbGVhdmUgMCB2aXNpYmxlIGxpbmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0J2xpbmUzJyxcblx0XHRcdF07XG5cdFx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHQvLyBIaWRlIGxpbmVzIDEtMiwgbGVhdmluZyBvbmx5IGxpbmUgMyB2aXNpYmxlLlxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgxLCAxLCAyLCAxKV0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0XHQvLyBJbnNlcnQgYXQgKDIsMSkgXHUyMDE0IHRoZSBlbmQgZWRnZSBvZiB0aGUgaGlkZGVuIGFyZWEgZGVjb3JhdGlvbi5cblx0XHRcdFx0Ly8gQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyBjYXVzZXMgdGhlIGRlY29yYXRpb24gdG8gZ3JvdyBmcm9tXG5cdFx0XHRcdC8vIFsxLDEgXHUyMTkyIDIsMV0gdG8gWzEsMSBcdTIxOTIgMywxXSwgY292ZXJpbmcgd2hhdCB3YXMgdGhlIHZpc2libGUgbGluZSAzLlxuXHRcdFx0XHQvLyBBZnRlciB0aGlzIGluc2VydCwgdGhlIGZpbGUgaGFzIDQgbGluZXMsIGRlY29yYXRpb24gY292ZXJzIFsxLTNdLCBsaW5lIDQgdmlzaWJsZS5cblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDEpLCB0ZXh0OiAneFxcbicgfV0pO1xuXHRcdFx0XHQvLyBJbnNlcnQgYWdhaW4gdG8gcHVzaCBkZWNvcmF0aW9uIGZ1cnRoZXJcblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKDMsIDEsIDMsIDEpLCB0ZXh0OiAneVxcbicgfV0pO1xuXHRcdFx0XHQvLyBOb3cgZmlsZSBoYXMgNSBsaW5lcywgZGVjb3JhdGlvbiBjb3ZlcnMgWzEtNF0sIGxpbmUgNSB2aXNpYmxlLlxuXG5cdFx0XHRcdC8vIERlbGV0ZSBsaW5lcyA0LTUgdG8gY29sbGFwc2UgYmFjaywgbWFraW5nIGRlY29yYXRpb24gY292ZXIgZXZlcnl0aGluZ1xuXHRcdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7IHJhbmdlOiBuZXcgUmFuZ2UoNCwgMSwgNSwgNiksIHRleHQ6ICcnIH1dKTtcblx0XHRcdFx0Ly8gTm93IGZpbGUgaGFzIDQgbGluZXMuIGFjY2VwdFZlcnNpb25JZCBlbnN1cmVzIHZpZXdMaW5lcyA+PSAxLlxuXG5cdFx0XHRcdC8vIFRhYiBzaXplIGNoYW5nZTogdHJpZ2dlcnMgX2NvbnN0cnVjdExpbmVzKHJlc2V0SGlkZGVuQXJlYXM9ZmFsc2UpXG5cdFx0XHRcdC8vIHdoaWNoIHJlLXJlYWRzIHRoZSBkZWNvcmF0aW9uIHJhbmdlcyAod2hpY2ggbWF5IGNvdmVyIGFsbCBsaW5lcykuXG5cdFx0XHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoeyB0YWJTaXplOiA4IH0pO1xuXG5cdFx0XHRcdGFzc2VydC5vayh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkgPj0gMSwgYGV4cGVjdGVkIGF0IGxlYXN0IDEgdmlldyBsaW5lIGJ1dCBnb3QgJHt2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCl9YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUIsd0JBQXdCO0FBQ3BELFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCLGlDQUFpQztBQUVwRSxNQUFNLGFBQWEsTUFBTTtBQUV4QiwwQ0FBd0M7QUFFeEMsT0FBSyx5RUFBMkUsTUFBTTtBQUNyRixVQUFNLE9BQU8sQ0FBQyxFQUFFO0FBQ2hCLFVBQU0sT0FBTztBQUFBLE1BQ1oscUJBQXFCO0FBQUEsSUFDdEI7QUFDQSxrQkFBYyxNQUFNLE1BQU0sQ0FBQyxXQUFXLFVBQVU7QUFDL0MsYUFBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLENBQUM7QUFFOUMsZ0JBQVUsWUFBWSxHQUFHLEdBQUcsQ0FBQztBQUU3QixZQUFNLFdBQVcsQ0FBQztBQUFBLFFBQ2pCLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsVUFDTDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNaLENBQUMsQ0FBQztBQUVGLGFBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxFQUFFO0FBQUEsSUFDaEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUVBQTJFLE1BQU07QUFDckYsVUFBTSxPQUFPLENBQUMsRUFBRTtBQUNoQixrQkFBYyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsVUFBVTtBQUM3QyxhQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUU5QyxZQUFNLG1CQUFtQixDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQzdCLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUCxDQUFDLEdBQUcsTUFBTyxDQUFDLENBQUU7QUFFZCxZQUFNLG1CQUFtQixDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQzdCLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUCxDQUFDLEdBQUcsTUFBTyxDQUFDLENBQUU7QUFFZCxZQUFNLG1CQUFtQixDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQzdCLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUCxDQUFDLEdBQUcsTUFBTyxDQUFDLENBQUU7QUFFZCxZQUFNLGdCQUEwQixDQUFDO0FBRWpDLG9CQUFjLEtBQUssVUFBVSxhQUFhLENBQUM7QUFDM0MsWUFBTSxlQUFlLElBQUksY0FBYyxpQkFBaUI7QUFBQSxRQUM5QyxhQUFhLFFBQTJCO0FBRWhELHdCQUFjLEtBQUssVUFBVSxhQUFhLENBQUM7QUFBQSxRQUM1QztBQUFBLE1BQ0Q7QUFDQSxnQkFBVSxvQkFBb0IsWUFBWTtBQUMxQyxZQUFNLEtBQUs7QUFDWCxvQkFBYyxLQUFLLFVBQVUsYUFBYSxDQUFDO0FBRTNDLGFBQU8sZ0JBQWdCLGVBQWUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUVyRCxnQkFBVSx1QkFBdUIsWUFBWTtBQUM3QyxtQkFBYSxRQUFRO0FBQUEsSUFDdEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNENBQTRDLE1BQU07QUFDdEQsVUFBTSxjQUFjO0FBQUEsTUFDbkI7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxVQUFNLFFBQVEsWUFBWSxJQUFJLGdCQUFnQixZQUFZLEtBQUssSUFBSSxDQUFDLENBQUM7QUFDckUsVUFBTSx1QkFBdUIseUJBQXlCLFdBQVc7QUFDakUsVUFBTSxNQUFNLFlBQVksSUFBSSwwQkFBMEIsc0JBQXNCLEtBQUssQ0FBQztBQUNsRixnQkFBWSxJQUFJLDBCQUEwQixzQkFBc0IsS0FBSyxDQUFDO0FBR3RFLFFBQUksVUFBVTtBQUNkLGdCQUFZLElBQUksSUFBSSx3QkFBd0IsQ0FBQyxNQUFNO0FBQ2xELFVBQUksU0FBUztBQUNaLGtCQUFVO0FBRVYsY0FBTSxXQUFXLENBQUMsRUFBRSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBTSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzlEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFdBQVcsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBRTlELGdCQUFZLFFBQVE7QUFBQSxFQUNyQixDQUFDO0FBRUQsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxVQUFNLE9BQU87QUFBQSxNQUNaO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0Esa0JBQWMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLFVBQVU7QUFDN0MsYUFBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLENBQUM7QUFDOUMsZ0JBQVUsZUFBZSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNoRCxhQUFPLEdBQUcsVUFBVSxpQkFBaUIsTUFBTSxJQUFJO0FBQUEsSUFDaEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsVUFBTSxPQUFPO0FBQUEsTUFDWjtBQUFBLElBQ0Q7QUFDQSxrQkFBYyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsVUFBVTtBQUM3QyxhQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUU5QyxZQUFNLG1CQUFtQixDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQzdCLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUCxDQUFDLEdBQUcsTUFBTyxDQUFDLENBQUU7QUFFZCxnQkFBVSxlQUFlLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2hELGFBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBRTlDLFlBQU0sS0FBSztBQUNYLGFBQU8sR0FBRyxVQUFVLGlCQUFpQixNQUFNLElBQUk7QUFBQSxJQUNoRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsV0FBUyx5QkFBeUIsTUFBZ0IsUUFBaUIseUJBQWtDLFVBQW1DO0FBQ3ZJLGtCQUFjLE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVyxVQUFVO0FBQzdDLFlBQU0sU0FBUyxVQUFVLG1CQUFtQixRQUFRLHlCQUF5QixLQUFLO0FBQ2xGLGFBQU8sZ0JBQWdCLE9BQU8sWUFBWSxRQUFRO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxRQUFNLGFBQWE7QUFBQSxJQUNsQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNEO0FBRUEsT0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3JCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3JCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3JCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3JCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDckI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBQzlEO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxRQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNyQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0dBQW9HLE1BQU07QUFNOUc7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3JCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsQ0FBQyxXQUFXLFNBQVM7QUFBQSxJQUN0QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMEJBQTBCLE1BQU07QUFDcEM7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3JCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDckI7QUFBQSxNQUNBO0FBQUEsTUFDQSxDQUFDLFFBQVEsU0FBUztBQUFBLElBQ25CO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDckI7QUFBQSxNQUNBO0FBQUEsTUFDQSxDQUFDLFFBQVEsTUFBTTtBQUFBLElBQ2hCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QztBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDckI7QUFBQSxNQUNBO0FBQUEsTUFDQSxDQUFDLFFBQVEsTUFBTTtBQUFBLElBQ2hCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNyQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMkRBQTJELE1BQU07QUFDckUsa0JBQWMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxXQUFXLFVBQVU7QUFDbkQsWUFBTSxPQUFPLGtCQUFrQixFQUFFO0FBQ2pDLFlBQU0sU0FBUyxVQUFVLG1CQUFtQixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLElBQUk7QUFDL0UsYUFBTyxnQkFBZ0IsT0FBTyxZQUFZLDZCQUE2QjtBQUFBLElBQ3hFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdHQUFnRyxNQUFNO0FBQzFHO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQUcsQ0FBQztBQUFBLE1BQUcsQ0FBQyxXQUFXLFVBQVU7QUFDNUIsa0JBQVUsZUFBZTtBQUFBLFVBQ3hCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3JCLENBQUM7QUFFRCxjQUFNLFdBQVc7QUFBQSxVQUNoQixFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLFNBQVM7QUFBQSxVQUMvQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLFNBQVM7QUFBQSxVQUMvQyxFQUFFLE9BQU8sSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxNQUFNLFNBQVM7QUFBQSxRQUNsRCxDQUFDO0FBRUQsZUFBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLEVBQUU7QUFBQSxNQUNoRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDBEQUEwRCxNQUFNO0FBQ3BFO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsTUFDQSxDQUFDO0FBQUEsTUFDRCxDQUFDLFdBQVcsVUFBVTtBQUNyQixjQUFNLGlCQUFpQixDQUFDLEdBQUc7QUFBQSxVQUMxQjtBQUFBLFlBQ0MsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFlBQzNCLFNBQVM7QUFBQSxjQUNSLGFBQWE7QUFBQSxjQUNiLFFBQVE7QUFBQSxnQkFDUCxTQUFTO0FBQUEsY0FDVjtBQUFBLGNBQ0EsaUJBQWlCO0FBQUEsWUFDbEI7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFlBQzNCLFNBQVM7QUFBQSxjQUNSLGFBQWE7QUFBQSxjQUNiLFFBQVE7QUFBQSxnQkFDUCxTQUFTO0FBQUEsY0FDVjtBQUFBLGNBQ0EsaUJBQWlCO0FBQUEsWUFDbEI7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBSUQsZUFBTyxnQkFBZ0IsVUFBVSxrQkFBa0IsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ2pILGVBQU8sZ0JBQWdCLFVBQVUsa0JBQWtCLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxpQkFBaUIsSUFBSSxHQUFHLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUNqSCxlQUFPLGdCQUFnQixVQUFVLGtCQUFrQixJQUFJLFNBQVMsR0FBRyxFQUFFLEdBQUcsaUJBQWlCLElBQUksR0FBRyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFDbkgsZUFBTyxnQkFBZ0IsVUFBVSxrQkFBa0IsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQ25ILGVBQU8sZ0JBQWdCLFVBQVUsa0JBQWtCLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxpQkFBaUIsSUFBSSxHQUFHLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUVuSCxlQUFPLGdCQUFnQixVQUFVLGtCQUFrQixJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsaUJBQWlCLElBQUksR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDakgsZUFBTyxnQkFBZ0IsVUFBVSxrQkFBa0IsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ2pILGVBQU8sZ0JBQWdCLFVBQVUsa0JBQWtCLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxpQkFBaUIsSUFBSSxHQUFHLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUNsSCxlQUFPLGdCQUFnQixVQUFVLGtCQUFrQixJQUFJLFNBQVMsR0FBRyxFQUFFLEdBQUcsaUJBQWlCLElBQUksR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbEgsZUFBTyxnQkFBZ0IsVUFBVSxrQkFBa0IsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBRWxILGVBQU8sZ0JBQWdCLFVBQVUsa0JBQWtCLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxpQkFBaUIsS0FBSyxHQUFHLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUNuSCxlQUFPLGdCQUFnQixVQUFVLGtCQUFrQixJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsaUJBQWlCLEtBQUssR0FBRyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFDbkgsZUFBTyxnQkFBZ0IsVUFBVSxrQkFBa0IsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLGlCQUFpQixLQUFLLEdBQUcsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQ3BILGVBQU8sZ0JBQWdCLFVBQVUsa0JBQWtCLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxpQkFBaUIsS0FBSyxHQUFHLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUNwSCxlQUFPLGdCQUFnQixVQUFVLGtCQUFrQixJQUFJLFNBQVMsR0FBRyxFQUFFLEdBQUcsaUJBQWlCLEtBQUssR0FBRyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFBQSxNQUNySDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsVUFBVTtBQUFBLFFBQ1YsZ0JBQWdCO0FBQUEsTUFDakI7QUFBQSxNQUNBLENBQUMsV0FBVyxVQUFVO0FBQ3JCLGVBQU87QUFBQSxVQUNOLElBQUksU0FBUyxHQUFHLENBQUM7QUFBQSxVQUNqQixVQUFVLGVBQWUsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLEVBQUU7QUFBQSxRQUNoRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsUUFBTSw0REFBNEQsTUFBTTtBQUV2RSxTQUFLLG1FQUFtRSxNQUFNO0FBQzdFLFlBQU0sT0FBTztBQUFBLFFBQ1o7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFDQSxvQkFBYyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsVUFBVTtBQUU3QyxrQkFBVSxlQUFlO0FBQUEsVUFDeEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3JCLENBQUM7QUFDRCxlQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUc5QyxjQUFNLFdBQVcsQ0FBQztBQUFBLFVBQ2pCLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUMzQixNQUFNO0FBQUEsUUFDUCxDQUFDLENBQUM7QUFFRixlQUFPLEdBQUcsVUFBVSxhQUFhLEtBQUssR0FBRyx5Q0FBeUMsVUFBVSxhQUFhLENBQUMsRUFBRTtBQUFBLE1BQzdHLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFlBQU0sT0FBTztBQUFBLFFBQ1o7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFDQSxvQkFBYyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsVUFBVTtBQUU3QyxrQkFBVSxlQUFlLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2hELGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBRzlDLGNBQU0sV0FBVyxDQUFDO0FBQUEsVUFDakIsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQzNCLE1BQU07QUFBQSxRQUNQLENBQUMsQ0FBQztBQUVGLGVBQU8sR0FBRyxVQUFVLGFBQWEsS0FBSyxHQUFHLHlDQUF5QyxVQUFVLGFBQWEsQ0FBQyxFQUFFO0FBQUEsTUFDN0csQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssMkRBQTJELE1BQU07QUFDckUsWUFBTSxPQUFPO0FBQUEsUUFDWjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQ0Esb0JBQWMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLFVBQVU7QUFFN0Msa0JBQVUsZUFBZTtBQUFBLFVBQ3hCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNyQixDQUFDO0FBQ0QsZUFBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLENBQUM7QUFHOUMsY0FBTSxXQUFXLENBQUM7QUFBQSxVQUNqQixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDM0IsTUFBTTtBQUFBLFFBQ1AsQ0FBQyxDQUFDO0FBRUYsZUFBTyxHQUFHLFVBQVUsYUFBYSxLQUFLLEdBQUcseUNBQXlDLFVBQVUsYUFBYSxDQUFDLEVBQUU7QUFBQSxNQUM3RyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxZQUFNLE9BQU87QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUNBLG9CQUFjLE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVyxVQUFVO0FBQzdDLGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBRzlDLGNBQU0sbUJBQW1CLENBQUMsR0FBRyxDQUFDO0FBQUEsVUFDN0IsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQzNCLE1BQU07QUFBQSxRQUNQLENBQUMsR0FBRyxNQUFPLENBQUMsQ0FBRTtBQUVkLGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBRzlDLGtCQUFVLGVBQWU7QUFBQSxVQUN4QixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDckIsQ0FBQztBQUNELGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBRzlDLGNBQU0sS0FBSztBQUVYLGVBQU8sR0FBRyxVQUFVLGFBQWEsS0FBSyxHQUFHLHlDQUF5QyxVQUFVLGFBQWEsQ0FBQyxFQUFFO0FBQUEsTUFDN0csQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssbUZBQW1GLE1BQU07QUFDN0YsWUFBTSxPQUFPO0FBQUEsUUFDWjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQ0Esb0JBQWMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLFVBQVU7QUFDN0MsZUFBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLENBQUM7QUFHOUMsa0JBQVUsZUFBZTtBQUFBLFVBQ3hCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNyQixDQUFDO0FBQ0QsZUFBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLENBQUM7QUFHOUMsY0FBTSxXQUFXLENBQUM7QUFBQSxVQUNqQixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDM0IsTUFBTTtBQUFBLFFBQ1AsQ0FBQyxDQUFDO0FBR0YsZUFBTyxHQUFHLFVBQVUsYUFBYSxLQUFLLEdBQUcseUNBQXlDLFVBQVUsYUFBYSxDQUFDLEVBQUU7QUFBQSxNQUM3RyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyw0REFBNEQsTUFBTTtBQUN0RSxZQUFNLE9BQU87QUFBQSxRQUNaO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQ0Esb0JBQWMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLFVBQVU7QUFDN0Msa0JBQVUsZUFBZTtBQUFBLFVBQ3hCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUNyQixDQUFDO0FBQ0QsZUFBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLENBQUM7QUFHOUMsY0FBTSxXQUFXLENBQUM7QUFBQSxVQUNqQixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDM0IsTUFBTTtBQUFBLFFBQ1AsQ0FBQyxDQUFDO0FBRUYsZUFBTyxHQUFHLFVBQVUsYUFBYSxLQUFLLEdBQUcseUNBQXlDLFVBQVUsYUFBYSxDQUFDLEVBQUU7QUFBQSxNQUM3RyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywrRUFBK0UsTUFBTTtBQUN6RixZQUFNLE9BQWlCLENBQUM7QUFDeEIsZUFBUyxJQUFJLEdBQUcsS0FBSyxJQUFJLEtBQUs7QUFDN0IsYUFBSyxLQUFLLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDckI7QUFDQSxvQkFBYyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsVUFBVTtBQVE3QyxrQkFBVSxlQUFlLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLFNBQVM7QUFDM0Qsa0JBQVUsZUFBZSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsU0FBUztBQUd6RyxlQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsR0FBRyxnQ0FBZ0M7QUFHaEYsY0FBTSxjQUFjLFVBQVUsZUFBZTtBQUM3QyxpQkFBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLFFBQVEsS0FBSztBQUM1QyxpQkFBTztBQUFBLFlBQ04sWUFBWSxDQUFDLEVBQUUsa0JBQWtCLFlBQVksSUFBSSxDQUFDLEVBQUU7QUFBQSxZQUNwRCxxQ0FBcUMsWUFBWSxJQUFJLENBQUMsRUFBRSxlQUFlLElBQUksWUFBWSxJQUFJLENBQUMsRUFBRSxhQUFhLFVBQVUsWUFBWSxDQUFDLEVBQUUsZUFBZSxJQUFJLFlBQVksQ0FBQyxFQUFFLGFBQWE7QUFBQSxVQUNwTDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHVGQUF1RixNQUFNO0FBQ2pHLFlBQU0sT0FBTztBQUFBLFFBQ1o7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFDQSxvQkFBYyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsVUFBVTtBQUU3QyxrQkFBVSxlQUFlLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2hELGVBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBTTlDLGNBQU0sV0FBVyxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sTUFBTSxDQUFDLENBQUM7QUFFaEUsY0FBTSxXQUFXLENBQUMsRUFBRSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUloRSxjQUFNLFdBQVcsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBSzdELGNBQU0sY0FBYyxFQUFFLFNBQVMsRUFBRSxDQUFDO0FBRWxDLGVBQU8sR0FBRyxVQUFVLGFBQWEsS0FBSyxHQUFHLHlDQUF5QyxVQUFVLGFBQWEsQ0FBQyxFQUFFO0FBQUEsTUFDN0csQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
