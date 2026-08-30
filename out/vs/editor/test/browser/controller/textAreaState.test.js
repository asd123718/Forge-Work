import assert from "assert";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TextAreaState } from "../../../browser/controller/editContext/textArea/textAreaEditContextState.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { createTextModel } from "../../common/testTextModel.js";
import { SimplePagedScreenReaderStrategy } from "../../../browser/controller/editContext/screenReaderUtils.js";
class MockTextAreaWrapper extends Disposable {
  constructor() {
    super();
    this._value = "";
    this._selectionStart = 0;
    this._selectionEnd = 0;
  }
  getValue() {
    return this._value;
  }
  setValue(reason, value) {
    this._value = value;
    this._selectionStart = this._value.length;
    this._selectionEnd = this._value.length;
  }
  getSelectionStart() {
    return this._selectionStart;
  }
  getSelectionEnd() {
    return this._selectionEnd;
  }
  setSelectionRange(reason, selectionStart, selectionEnd) {
    if (selectionStart < 0) {
      selectionStart = 0;
    }
    if (selectionStart > this._value.length) {
      selectionStart = this._value.length;
    }
    if (selectionEnd < 0) {
      selectionEnd = 0;
    }
    if (selectionEnd > this._value.length) {
      selectionEnd = this._value.length;
    }
    this._selectionStart = selectionStart;
    this._selectionEnd = selectionEnd;
  }
}
function equalsTextAreaState(a, b) {
  return a.value === b.value && a.selectionStart === b.selectionStart && a.selectionEnd === b.selectionEnd && Range.equalsRange(a.selection, b.selection) && a.newlineCountBeforeSelection === b.newlineCountBeforeSelection;
}
suite("TextAreaState", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertTextAreaState(actual, value, selectionStart, selectionEnd) {
    const desired = new TextAreaState(value, selectionStart, selectionEnd, null, void 0);
    assert.ok(equalsTextAreaState(desired, actual), desired.toString() + " == " + actual.toString());
  }
  test("fromTextArea", () => {
    const textArea = new MockTextAreaWrapper();
    textArea._value = "Hello world!";
    textArea._selectionStart = 1;
    textArea._selectionEnd = 12;
    let actual = TextAreaState.readFromTextArea(textArea, null);
    assertTextAreaState(actual, "Hello world!", 1, 12);
    assert.strictEqual(actual.value, "Hello world!");
    assert.strictEqual(actual.selectionStart, 1);
    actual = actual.collapseSelection();
    assertTextAreaState(actual, "Hello world!", 12, 12);
    textArea.dispose();
  });
  test("applyToTextArea", () => {
    const textArea = new MockTextAreaWrapper();
    textArea._value = "Hello world!";
    textArea._selectionStart = 1;
    textArea._selectionEnd = 12;
    let state = new TextAreaState("Hi world!", 2, 2, null, void 0);
    state.writeToTextArea("test", textArea, false);
    assert.strictEqual(textArea._value, "Hi world!");
    assert.strictEqual(textArea._selectionStart, 9);
    assert.strictEqual(textArea._selectionEnd, 9);
    state = new TextAreaState("Hi world!", 3, 3, null, void 0);
    state.writeToTextArea("test", textArea, false);
    assert.strictEqual(textArea._value, "Hi world!");
    assert.strictEqual(textArea._selectionStart, 9);
    assert.strictEqual(textArea._selectionEnd, 9);
    state = new TextAreaState("Hi world!", 0, 2, null, void 0);
    state.writeToTextArea("test", textArea, true);
    assert.strictEqual(textArea._value, "Hi world!");
    assert.strictEqual(textArea._selectionStart, 0);
    assert.strictEqual(textArea._selectionEnd, 2);
    textArea.dispose();
  });
  function testDeduceInput(prevState, value, selectionStart, selectionEnd, couldBeEmojiInput, expected, expectedCharReplaceCnt) {
    prevState = prevState || TextAreaState.EMPTY;
    const textArea = new MockTextAreaWrapper();
    textArea._value = value;
    textArea._selectionStart = selectionStart;
    textArea._selectionEnd = selectionEnd;
    const newState = TextAreaState.readFromTextArea(textArea, null);
    const actual = TextAreaState.deduceInput(prevState, newState, couldBeEmojiInput);
    assert.deepStrictEqual(actual, {
      text: expected,
      replacePrevCharCnt: expectedCharReplaceCnt,
      replaceNextCharCnt: 0,
      positionDelta: 0
    });
    textArea.dispose();
  }
  test("extractNewText - no previous state with selection", () => {
    testDeduceInput(
      null,
      "a",
      0,
      1,
      true,
      "a",
      0
    );
  });
  test("issue #2586: Replacing selected end-of-line with newline locks up the document", () => {
    testDeduceInput(
      new TextAreaState("]\n", 1, 2, null, void 0),
      "]\n",
      2,
      2,
      true,
      "\n",
      0
    );
  });
  test("extractNewText - no previous state without selection", () => {
    testDeduceInput(
      null,
      "a",
      1,
      1,
      true,
      "a",
      0
    );
  });
  test("extractNewText - typing does not cause a selection", () => {
    testDeduceInput(
      TextAreaState.EMPTY,
      "a",
      0,
      1,
      true,
      "a",
      0
    );
  });
  test("extractNewText - had the textarea empty", () => {
    testDeduceInput(
      TextAreaState.EMPTY,
      "a",
      1,
      1,
      true,
      "a",
      0
    );
  });
  test("extractNewText - had the entire line selected", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 0, 12, null, void 0),
      "H",
      1,
      1,
      true,
      "H",
      0
    );
  });
  test("extractNewText - had previous text 1", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 12, 12, null, void 0),
      "Hello world!a",
      13,
      13,
      true,
      "a",
      0
    );
  });
  test("extractNewText - had previous text 2", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 0, 0, null, void 0),
      "aHello world!",
      1,
      1,
      true,
      "a",
      0
    );
  });
  test("extractNewText - had previous text 3", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 6, 11, null, void 0),
      "Hello other!",
      11,
      11,
      true,
      "other",
      0
    );
  });
  test("extractNewText - IME", () => {
    testDeduceInput(
      TextAreaState.EMPTY,
      "\u3053\u308C\u306F",
      3,
      3,
      true,
      "\u3053\u308C\u306F",
      0
    );
  });
  test("extractNewText - isInOverwriteMode", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 0, 0, null, void 0),
      "Aello world!",
      1,
      1,
      true,
      "A",
      0
    );
  });
  test("extractMacReplacedText - does nothing if there is selection", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 5, 5, null, void 0),
      "Hell\xF6 world!",
      4,
      5,
      true,
      "\xF6",
      0
    );
  });
  test("extractMacReplacedText - does nothing if there is more than one extra char", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 5, 5, null, void 0),
      "Hell\xF6\xF6 world!",
      5,
      5,
      true,
      "\xF6\xF6",
      1
    );
  });
  test("extractMacReplacedText - does nothing if there is more than one changed char", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 5, 5, null, void 0),
      "Hel\xF6\xF6 world!",
      5,
      5,
      true,
      "\xF6\xF6",
      2
    );
  });
  test("extractMacReplacedText", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 5, 5, null, void 0),
      "Hell\xF6 world!",
      5,
      5,
      true,
      "\xF6",
      1
    );
  });
  test("issue #25101 - First key press ignored", () => {
    testDeduceInput(
      new TextAreaState("a", 0, 1, null, void 0),
      "a",
      1,
      1,
      true,
      "a",
      0
    );
  });
  test("issue #16520 - Cmd-d of single character followed by typing same character as has no effect", () => {
    testDeduceInput(
      new TextAreaState("x x", 0, 1, null, void 0),
      "x x",
      1,
      1,
      true,
      "x",
      0
    );
  });
  function testDeduceAndroidCompositionInput(prevState, value, selectionStart, selectionEnd, expected, expectedReplacePrevCharCnt, expectedReplaceNextCharCnt, expectedPositionDelta) {
    prevState = prevState || TextAreaState.EMPTY;
    const textArea = new MockTextAreaWrapper();
    textArea._value = value;
    textArea._selectionStart = selectionStart;
    textArea._selectionEnd = selectionEnd;
    const newState = TextAreaState.readFromTextArea(textArea, null);
    const actual = TextAreaState.deduceAndroidCompositionInput(prevState, newState);
    assert.deepStrictEqual(actual, {
      text: expected,
      replacePrevCharCnt: expectedReplacePrevCharCnt,
      replaceNextCharCnt: expectedReplaceNextCharCnt,
      positionDelta: expectedPositionDelta
    });
    textArea.dispose();
  }
  test("Android composition input 1", () => {
    testDeduceAndroidCompositionInput(
      new TextAreaState("Microsoft", 4, 4, null, void 0),
      "Microsoft",
      4,
      4,
      "",
      0,
      0,
      0
    );
  });
  test("Android composition input 2", () => {
    testDeduceAndroidCompositionInput(
      new TextAreaState("Microsoft", 4, 4, null, void 0),
      "Microsoft",
      0,
      9,
      "",
      0,
      0,
      5
    );
  });
  test("Android composition input 3", () => {
    testDeduceAndroidCompositionInput(
      new TextAreaState("Microsoft", 0, 9, null, void 0),
      "Microsoft's",
      11,
      11,
      "'s",
      0,
      0,
      0
    );
  });
  test("Android backspace", () => {
    testDeduceAndroidCompositionInput(
      new TextAreaState("undefinedVariable", 2, 2, null, void 0),
      "udefinedVariable",
      1,
      1,
      "",
      1,
      0,
      0
    );
  });
  suite("SimplePagedScreenReaderStrategy", () => {
    function testPagedScreenReaderStrategy(lines, selection, expected) {
      const model = createTextModel(lines.join("\n"));
      const screenReaderStrategy = new SimplePagedScreenReaderStrategy();
      const screenReaderContentState = screenReaderStrategy.fromEditorSelection(model, selection, 10, true);
      const textAreaState = TextAreaState.fromScreenReaderContentState(screenReaderContentState);
      assert.ok(equalsTextAreaState(textAreaState, expected));
      model.dispose();
    }
    test("simple", () => {
      testPagedScreenReaderStrategy(
        [
          "Hello world!"
        ],
        new Selection(1, 13, 1, 13),
        new TextAreaState("Hello world!", 12, 12, new Range(1, 13, 1, 13), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "Hello world!"
        ],
        new Selection(1, 1, 1, 1),
        new TextAreaState("Hello world!", 0, 0, new Range(1, 1, 1, 1), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "Hello world!"
        ],
        new Selection(1, 1, 1, 6),
        new TextAreaState("Hello world!", 0, 5, new Range(1, 1, 1, 6), 0)
      );
    });
    test("multiline", () => {
      testPagedScreenReaderStrategy(
        [
          "Hello world!",
          "How are you?"
        ],
        new Selection(1, 1, 1, 1),
        new TextAreaState("Hello world!\nHow are you?", 0, 0, new Range(1, 1, 1, 1), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "Hello world!",
          "How are you?"
        ],
        new Selection(2, 1, 2, 1),
        new TextAreaState("Hello world!\nHow are you?", 13, 13, new Range(2, 1, 2, 1), 1)
      );
    });
    test("page", () => {
      testPagedScreenReaderStrategy(
        [
          "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21"
        ],
        new Selection(1, 1, 1, 1),
        new TextAreaState("L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\n", 0, 0, new Range(1, 1, 1, 1), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21"
        ],
        new Selection(11, 1, 11, 1),
        new TextAreaState("L11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\n", 0, 0, new Range(11, 1, 11, 1), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21"
        ],
        new Selection(12, 1, 12, 1),
        new TextAreaState("L11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\n", 4, 4, new Range(12, 1, 12, 1), 1)
      );
      testPagedScreenReaderStrategy(
        [
          "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21"
        ],
        new Selection(21, 1, 21, 1),
        new TextAreaState("L21", 0, 0, new Range(21, 1, 21, 1), 0)
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXHRleHRBcmVhU3RhdGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVGV4dEFyZWFXcmFwcGVyLCBUZXh0QXJlYVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L3RleHRBcmVhL3RleHRBcmVhRWRpdENvbnRleHRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTaW1wbGVQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L3NjcmVlblJlYWRlclV0aWxzLmpzJztcblxuY2xhc3MgTW9ja1RleHRBcmVhV3JhcHBlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGV4dEFyZWFXcmFwcGVyIHtcblxuXHRwdWJsaWMgX3ZhbHVlOiBzdHJpbmc7XG5cdHB1YmxpYyBfc2VsZWN0aW9uU3RhcnQ6IG51bWJlcjtcblx0cHVibGljIF9zZWxlY3Rpb25FbmQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3ZhbHVlID0gJyc7XG5cdFx0dGhpcy5fc2VsZWN0aW9uU3RhcnQgPSAwO1xuXHRcdHRoaXMuX3NlbGVjdGlvbkVuZCA9IDA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUocmVhc29uOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0ID0gdGhpcy5fdmFsdWUubGVuZ3RoO1xuXHRcdHRoaXMuX3NlbGVjdGlvbkVuZCA9IHRoaXMuX3ZhbHVlLmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb25TdGFydCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3Rpb25TdGFydDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb25FbmQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0aW9uRW5kO1xuXHR9XG5cblx0cHVibGljIHNldFNlbGVjdGlvblJhbmdlKHJlYXNvbjogc3RyaW5nLCBzZWxlY3Rpb25TdGFydDogbnVtYmVyLCBzZWxlY3Rpb25FbmQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChzZWxlY3Rpb25TdGFydCA8IDApIHtcblx0XHRcdHNlbGVjdGlvblN0YXJ0ID0gMDtcblx0XHR9XG5cdFx0aWYgKHNlbGVjdGlvblN0YXJ0ID4gdGhpcy5fdmFsdWUubGVuZ3RoKSB7XG5cdFx0XHRzZWxlY3Rpb25TdGFydCA9IHRoaXMuX3ZhbHVlLmxlbmd0aDtcblx0XHR9XG5cdFx0aWYgKHNlbGVjdGlvbkVuZCA8IDApIHtcblx0XHRcdHNlbGVjdGlvbkVuZCA9IDA7XG5cdFx0fVxuXHRcdGlmIChzZWxlY3Rpb25FbmQgPiB0aGlzLl92YWx1ZS5sZW5ndGgpIHtcblx0XHRcdHNlbGVjdGlvbkVuZCA9IHRoaXMuX3ZhbHVlLmxlbmd0aDtcblx0XHR9XG5cdFx0dGhpcy5fc2VsZWN0aW9uU3RhcnQgPSBzZWxlY3Rpb25TdGFydDtcblx0XHR0aGlzLl9zZWxlY3Rpb25FbmQgPSBzZWxlY3Rpb25FbmQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXF1YWxzVGV4dEFyZWFTdGF0ZShhOiBUZXh0QXJlYVN0YXRlLCBiOiBUZXh0QXJlYVN0YXRlKTogYm9vbGVhbiB7XG5cdHJldHVybiAoXG5cdFx0YS52YWx1ZSA9PT0gYi52YWx1ZVxuXHRcdCYmIGEuc2VsZWN0aW9uU3RhcnQgPT09IGIuc2VsZWN0aW9uU3RhcnRcblx0XHQmJiBhLnNlbGVjdGlvbkVuZCA9PT0gYi5zZWxlY3Rpb25FbmRcblx0XHQmJiBSYW5nZS5lcXVhbHNSYW5nZShhLnNlbGVjdGlvbiwgYi5zZWxlY3Rpb24pXG5cdFx0JiYgYS5uZXdsaW5lQ291bnRCZWZvcmVTZWxlY3Rpb24gPT09IGIubmV3bGluZUNvdW50QmVmb3JlU2VsZWN0aW9uXG5cdCk7XG59XG5cbnN1aXRlKCdUZXh0QXJlYVN0YXRlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGFzc2VydFRleHRBcmVhU3RhdGUoYWN0dWFsOiBUZXh0QXJlYVN0YXRlLCB2YWx1ZTogc3RyaW5nLCBzZWxlY3Rpb25TdGFydDogbnVtYmVyLCBzZWxlY3Rpb25FbmQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGRlc2lyZWQgPSBuZXcgVGV4dEFyZWFTdGF0ZSh2YWx1ZSwgc2VsZWN0aW9uU3RhcnQsIHNlbGVjdGlvbkVuZCwgbnVsbCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soZXF1YWxzVGV4dEFyZWFTdGF0ZShkZXNpcmVkLCBhY3R1YWwpLCBkZXNpcmVkLnRvU3RyaW5nKCkgKyAnID09ICcgKyBhY3R1YWwudG9TdHJpbmcoKSk7XG5cdH1cblxuXHR0ZXN0KCdmcm9tVGV4dEFyZWEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dEFyZWEgPSBuZXcgTW9ja1RleHRBcmVhV3JhcHBlcigpO1xuXHRcdHRleHRBcmVhLl92YWx1ZSA9ICdIZWxsbyB3b3JsZCEnO1xuXHRcdHRleHRBcmVhLl9zZWxlY3Rpb25TdGFydCA9IDE7XG5cdFx0dGV4dEFyZWEuX3NlbGVjdGlvbkVuZCA9IDEyO1xuXHRcdGxldCBhY3R1YWwgPSBUZXh0QXJlYVN0YXRlLnJlYWRGcm9tVGV4dEFyZWEodGV4dEFyZWEsIG51bGwpO1xuXG5cdFx0YXNzZXJ0VGV4dEFyZWFTdGF0ZShhY3R1YWwsICdIZWxsbyB3b3JsZCEnLCAxLCAxMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC52YWx1ZSwgJ0hlbGxvIHdvcmxkIScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuc2VsZWN0aW9uU3RhcnQsIDEpO1xuXG5cdFx0YWN0dWFsID0gYWN0dWFsLmNvbGxhcHNlU2VsZWN0aW9uKCk7XG5cdFx0YXNzZXJ0VGV4dEFyZWFTdGF0ZShhY3R1YWwsICdIZWxsbyB3b3JsZCEnLCAxMiwgMTIpO1xuXG5cdFx0dGV4dEFyZWEuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseVRvVGV4dEFyZWEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dEFyZWEgPSBuZXcgTW9ja1RleHRBcmVhV3JhcHBlcigpO1xuXHRcdHRleHRBcmVhLl92YWx1ZSA9ICdIZWxsbyB3b3JsZCEnO1xuXHRcdHRleHRBcmVhLl9zZWxlY3Rpb25TdGFydCA9IDE7XG5cdFx0dGV4dEFyZWEuX3NlbGVjdGlvbkVuZCA9IDEyO1xuXG5cdFx0bGV0IHN0YXRlID0gbmV3IFRleHRBcmVhU3RhdGUoJ0hpIHdvcmxkIScsIDIsIDIsIG51bGwsIHVuZGVmaW5lZCk7XG5cdFx0c3RhdGUud3JpdGVUb1RleHRBcmVhKCd0ZXN0JywgdGV4dEFyZWEsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0QXJlYS5fdmFsdWUsICdIaSB3b3JsZCEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEFyZWEuX3NlbGVjdGlvblN0YXJ0LCA5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEFyZWEuX3NlbGVjdGlvbkVuZCwgOSk7XG5cblx0XHRzdGF0ZSA9IG5ldyBUZXh0QXJlYVN0YXRlKCdIaSB3b3JsZCEnLCAzLCAzLCBudWxsLCB1bmRlZmluZWQpO1xuXHRcdHN0YXRlLndyaXRlVG9UZXh0QXJlYSgndGVzdCcsIHRleHRBcmVhLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEFyZWEuX3ZhbHVlLCAnSGkgd29ybGQhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRBcmVhLl9zZWxlY3Rpb25TdGFydCwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRBcmVhLl9zZWxlY3Rpb25FbmQsIDkpO1xuXG5cdFx0c3RhdGUgPSBuZXcgVGV4dEFyZWFTdGF0ZSgnSGkgd29ybGQhJywgMCwgMiwgbnVsbCwgdW5kZWZpbmVkKTtcblx0XHRzdGF0ZS53cml0ZVRvVGV4dEFyZWEoJ3Rlc3QnLCB0ZXh0QXJlYSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEFyZWEuX3ZhbHVlLCAnSGkgd29ybGQhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRBcmVhLl9zZWxlY3Rpb25TdGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRBcmVhLl9zZWxlY3Rpb25FbmQsIDIpO1xuXG5cdFx0dGV4dEFyZWEuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0ZXN0RGVkdWNlSW5wdXQocHJldlN0YXRlOiBUZXh0QXJlYVN0YXRlIHwgbnVsbCwgdmFsdWU6IHN0cmluZywgc2VsZWN0aW9uU3RhcnQ6IG51bWJlciwgc2VsZWN0aW9uRW5kOiBudW1iZXIsIGNvdWxkQmVFbW9qaUlucHV0OiBib29sZWFuLCBleHBlY3RlZDogc3RyaW5nLCBleHBlY3RlZENoYXJSZXBsYWNlQ250OiBudW1iZXIpOiB2b2lkIHtcblx0XHRwcmV2U3RhdGUgPSBwcmV2U3RhdGUgfHwgVGV4dEFyZWFTdGF0ZS5FTVBUWTtcblxuXHRcdGNvbnN0IHRleHRBcmVhID0gbmV3IE1vY2tUZXh0QXJlYVdyYXBwZXIoKTtcblx0XHR0ZXh0QXJlYS5fdmFsdWUgPSB2YWx1ZTtcblx0XHR0ZXh0QXJlYS5fc2VsZWN0aW9uU3RhcnQgPSBzZWxlY3Rpb25TdGFydDtcblx0XHR0ZXh0QXJlYS5fc2VsZWN0aW9uRW5kID0gc2VsZWN0aW9uRW5kO1xuXG5cdFx0Y29uc3QgbmV3U3RhdGUgPSBUZXh0QXJlYVN0YXRlLnJlYWRGcm9tVGV4dEFyZWEodGV4dEFyZWEsIG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IFRleHRBcmVhU3RhdGUuZGVkdWNlSW5wdXQocHJldlN0YXRlLCBuZXdTdGF0ZSwgY291bGRCZUVtb2ppSW5wdXQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHtcblx0XHRcdHRleHQ6IGV4cGVjdGVkLFxuXHRcdFx0cmVwbGFjZVByZXZDaGFyQ250OiBleHBlY3RlZENoYXJSZXBsYWNlQ250LFxuXHRcdFx0cmVwbGFjZU5leHRDaGFyQ250OiAwLFxuXHRcdFx0cG9zaXRpb25EZWx0YTogMCxcblx0XHR9KTtcblxuXHRcdHRleHRBcmVhLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHRlc3QoJ2V4dHJhY3ROZXdUZXh0IC0gbm8gcHJldmlvdXMgc3RhdGUgd2l0aCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0bnVsbCxcblx0XHRcdCdhJyxcblx0XHRcdDAsIDEsIHRydWUsXG5cdFx0XHQnYScsIDBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjU4NjogUmVwbGFjaW5nIHNlbGVjdGVkIGVuZC1vZi1saW5lIHdpdGggbmV3bGluZSBsb2NrcyB1cCB0aGUgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ11cXG4nLCAxLCAyLCBudWxsLCB1bmRlZmluZWQpLFxuXHRcdFx0J11cXG4nLFxuXHRcdFx0MiwgMiwgdHJ1ZSxcblx0XHRcdCdcXG4nLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdE5ld1RleHQgLSBubyBwcmV2aW91cyBzdGF0ZSB3aXRob3V0IHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRudWxsLFxuXHRcdFx0J2EnLFxuXHRcdFx0MSwgMSwgdHJ1ZSxcblx0XHRcdCdhJywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3ROZXdUZXh0IC0gdHlwaW5nIGRvZXMgbm90IGNhdXNlIGEgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdFRleHRBcmVhU3RhdGUuRU1QVFksXG5cdFx0XHQnYScsXG5cdFx0XHQwLCAxLCB0cnVlLFxuXHRcdFx0J2EnLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdE5ld1RleHQgLSBoYWQgdGhlIHRleHRhcmVhIGVtcHR5JywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdFRleHRBcmVhU3RhdGUuRU1QVFksXG5cdFx0XHQnYScsXG5cdFx0XHQxLCAxLCB0cnVlLFxuXHRcdFx0J2EnLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdE5ld1RleHQgLSBoYWQgdGhlIGVudGlyZSBsaW5lIHNlbGVjdGVkJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCAwLCAxMiwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdIJyxcblx0XHRcdDEsIDEsIHRydWUsXG5cdFx0XHQnSCcsIDBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TmV3VGV4dCAtIGhhZCBwcmV2aW91cyB0ZXh0IDEnLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0hlbGxvIHdvcmxkIScsIDEyLCAxMiwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdIZWxsbyB3b3JsZCFhJyxcblx0XHRcdDEzLCAxMywgdHJ1ZSxcblx0XHRcdCdhJywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3ROZXdUZXh0IC0gaGFkIHByZXZpb3VzIHRleHQgMicsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhJywgMCwgMCwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdhSGVsbG8gd29ybGQhJyxcblx0XHRcdDEsIDEsIHRydWUsXG5cdFx0XHQnYScsIDBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TmV3VGV4dCAtIGhhZCBwcmV2aW91cyB0ZXh0IDMnLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0hlbGxvIHdvcmxkIScsIDYsIDExLCBudWxsLCB1bmRlZmluZWQpLFxuXHRcdFx0J0hlbGxvIG90aGVyIScsXG5cdFx0XHQxMSwgMTEsIHRydWUsXG5cdFx0XHQnb3RoZXInLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdE5ld1RleHQgLSBJTUUnLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0VGV4dEFyZWFTdGF0ZS5FTVBUWSxcblx0XHRcdCdcdTMwNTNcdTMwOENcdTMwNkYnLFxuXHRcdFx0MywgMywgdHJ1ZSxcblx0XHRcdCdcdTMwNTNcdTMwOENcdTMwNkYnLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdE5ld1RleHQgLSBpc0luT3ZlcndyaXRlTW9kZScsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhJywgMCwgMCwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdBZWxsbyB3b3JsZCEnLFxuXHRcdFx0MSwgMSwgdHJ1ZSxcblx0XHRcdCdBJywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RNYWNSZXBsYWNlZFRleHQgLSBkb2VzIG5vdGhpbmcgaWYgdGhlcmUgaXMgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCA1LCA1LCBudWxsLCB1bmRlZmluZWQpLFxuXHRcdFx0J0hlbGxcdTAwRjYgd29ybGQhJyxcblx0XHRcdDQsIDUsIHRydWUsXG5cdFx0XHQnXHUwMEY2JywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RNYWNSZXBsYWNlZFRleHQgLSBkb2VzIG5vdGhpbmcgaWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBleHRyYSBjaGFyJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCA1LCA1LCBudWxsLCB1bmRlZmluZWQpLFxuXHRcdFx0J0hlbGxcdTAwRjZcdTAwRjYgd29ybGQhJyxcblx0XHRcdDUsIDUsIHRydWUsXG5cdFx0XHQnXHUwMEY2XHUwMEY2JywgMVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RNYWNSZXBsYWNlZFRleHQgLSBkb2VzIG5vdGhpbmcgaWYgdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBjaGFuZ2VkIGNoYXInLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0hlbGxvIHdvcmxkIScsIDUsIDUsIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnSGVsXHUwMEY2XHUwMEY2IHdvcmxkIScsXG5cdFx0XHQ1LCA1LCB0cnVlLFxuXHRcdFx0J1x1MDBGNlx1MDBGNicsIDJcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TWFjUmVwbGFjZWRUZXh0JywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCA1LCA1LCBudWxsLCB1bmRlZmluZWQpLFxuXHRcdFx0J0hlbGxcdTAwRjYgd29ybGQhJyxcblx0XHRcdDUsIDUsIHRydWUsXG5cdFx0XHQnXHUwMEY2JywgMVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNTEwMSAtIEZpcnN0IGtleSBwcmVzcyBpZ25vcmVkJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdhJywgMCwgMSwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdhJyxcblx0XHRcdDEsIDEsIHRydWUsXG5cdFx0XHQnYScsIDBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTY1MjAgLSBDbWQtZCBvZiBzaW5nbGUgY2hhcmFjdGVyIGZvbGxvd2VkIGJ5IHR5cGluZyBzYW1lIGNoYXJhY3RlciBhcyBoYXMgbm8gZWZmZWN0JywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCd4IHgnLCAwLCAxLCBudWxsLCB1bmRlZmluZWQpLFxuXHRcdFx0J3ggeCcsXG5cdFx0XHQxLCAxLCB0cnVlLFxuXHRcdFx0J3gnLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGVzdERlZHVjZUFuZHJvaWRDb21wb3NpdGlvbklucHV0KFxuXHRcdHByZXZTdGF0ZTogVGV4dEFyZWFTdGF0ZSB8IG51bGwsXG5cdFx0dmFsdWU6IHN0cmluZywgc2VsZWN0aW9uU3RhcnQ6IG51bWJlciwgc2VsZWN0aW9uRW5kOiBudW1iZXIsXG5cdFx0ZXhwZWN0ZWQ6IHN0cmluZywgZXhwZWN0ZWRSZXBsYWNlUHJldkNoYXJDbnQ6IG51bWJlciwgZXhwZWN0ZWRSZXBsYWNlTmV4dENoYXJDbnQ6IG51bWJlciwgZXhwZWN0ZWRQb3NpdGlvbkRlbHRhOiBudW1iZXIpOiB2b2lkIHtcblx0XHRwcmV2U3RhdGUgPSBwcmV2U3RhdGUgfHwgVGV4dEFyZWFTdGF0ZS5FTVBUWTtcblxuXHRcdGNvbnN0IHRleHRBcmVhID0gbmV3IE1vY2tUZXh0QXJlYVdyYXBwZXIoKTtcblx0XHR0ZXh0QXJlYS5fdmFsdWUgPSB2YWx1ZTtcblx0XHR0ZXh0QXJlYS5fc2VsZWN0aW9uU3RhcnQgPSBzZWxlY3Rpb25TdGFydDtcblx0XHR0ZXh0QXJlYS5fc2VsZWN0aW9uRW5kID0gc2VsZWN0aW9uRW5kO1xuXG5cdFx0Y29uc3QgbmV3U3RhdGUgPSBUZXh0QXJlYVN0YXRlLnJlYWRGcm9tVGV4dEFyZWEodGV4dEFyZWEsIG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IFRleHRBcmVhU3RhdGUuZGVkdWNlQW5kcm9pZENvbXBvc2l0aW9uSW5wdXQocHJldlN0YXRlLCBuZXdTdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0dGV4dDogZXhwZWN0ZWQsXG5cdFx0XHRyZXBsYWNlUHJldkNoYXJDbnQ6IGV4cGVjdGVkUmVwbGFjZVByZXZDaGFyQ250LFxuXHRcdFx0cmVwbGFjZU5leHRDaGFyQ250OiBleHBlY3RlZFJlcGxhY2VOZXh0Q2hhckNudCxcblx0XHRcdHBvc2l0aW9uRGVsdGE6IGV4cGVjdGVkUG9zaXRpb25EZWx0YSxcblx0XHR9KTtcblxuXHRcdHRleHRBcmVhLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHRlc3QoJ0FuZHJvaWQgY29tcG9zaXRpb24gaW5wdXQgMScsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlQW5kcm9pZENvbXBvc2l0aW9uSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnTWljcm9zb2Z0JywgNCwgNCwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdNaWNyb3NvZnQnLFxuXHRcdFx0NCwgNCxcblx0XHRcdCcnLCAwLCAwLCAwLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FuZHJvaWQgY29tcG9zaXRpb24gaW5wdXQgMicsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlQW5kcm9pZENvbXBvc2l0aW9uSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnTWljcm9zb2Z0JywgNCwgNCwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdNaWNyb3NvZnQnLFxuXHRcdFx0MCwgOSxcblx0XHRcdCcnLCAwLCAwLCA1LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FuZHJvaWQgY29tcG9zaXRpb24gaW5wdXQgMycsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlQW5kcm9pZENvbXBvc2l0aW9uSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnTWljcm9zb2Z0JywgMCwgOSwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdNaWNyb3NvZnRcXCdzJyxcblx0XHRcdDExLCAxMSxcblx0XHRcdCdcXCdzJywgMCwgMCwgMCxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdBbmRyb2lkIGJhY2tzcGFjZScsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlQW5kcm9pZENvbXBvc2l0aW9uSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgndW5kZWZpbmVkVmFyaWFibGUnLCAyLCAyLCBudWxsLCB1bmRlZmluZWQpLFxuXHRcdFx0J3VkZWZpbmVkVmFyaWFibGUnLFxuXHRcdFx0MSwgMSxcblx0XHRcdCcnLCAxLCAwLCAwLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTaW1wbGVQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5JywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gdGVzdFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3kobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWQ6IFRleHRBcmVhU3RhdGUpOiB2b2lkIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHRcdGNvbnN0IHNjcmVlblJlYWRlclN0cmF0ZWd5ID0gbmV3IFNpbXBsZVBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3koKTtcblx0XHRcdGNvbnN0IHNjcmVlblJlYWRlckNvbnRlbnRTdGF0ZSA9IHNjcmVlblJlYWRlclN0cmF0ZWd5LmZyb21FZGl0b3JTZWxlY3Rpb24obW9kZWwsIHNlbGVjdGlvbiwgMTAsIHRydWUpO1xuXHRcdFx0Y29uc3QgdGV4dEFyZWFTdGF0ZSA9IFRleHRBcmVhU3RhdGUuZnJvbVNjcmVlblJlYWRlckNvbnRlbnRTdGF0ZShzY3JlZW5SZWFkZXJDb250ZW50U3RhdGUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVxdWFsc1RleHRBcmVhU3RhdGUodGV4dEFyZWFTdGF0ZSwgZXhwZWN0ZWQpKTtcblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaW1wbGUnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0UGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneShcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdIZWxsbyB3b3JsZCEnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDEzKSxcblx0XHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0hlbGxvIHdvcmxkIScsIDEyLCAxMiwgbmV3IFJhbmdlKDEsIDEzLCAxLCAxMyksIDApXG5cdFx0XHQpO1xuXG5cdFx0XHR0ZXN0UGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneShcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdIZWxsbyB3b3JsZCEnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCAwLCAwLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIDApXG5cdFx0XHQpO1xuXG5cdFx0XHR0ZXN0UGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneShcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdIZWxsbyB3b3JsZCEnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNiksXG5cdFx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCAwLCA1LCBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIDApXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlsaW5lJywgKCkgPT4ge1xuXHRcdFx0dGVzdFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3koXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnSGVsbG8gd29ybGQhJyxcblx0XHRcdFx0XHQnSG93IGFyZSB5b3U/J1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhXFxuSG93IGFyZSB5b3U/JywgMCwgMCwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCAwKVxuXHRcdFx0KTtcblxuXHRcdFx0dGVzdFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3koXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnSGVsbG8gd29ybGQhJyxcblx0XHRcdFx0XHQnSG93IGFyZSB5b3U/J1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpLFxuXHRcdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhXFxuSG93IGFyZSB5b3U/JywgMTMsIDEzLCBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksIDEpXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFnZScsICgpID0+IHtcblx0XHRcdHRlc3RQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5KFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J0wxXFxuTDJcXG5MM1xcbkw0XFxuTDVcXG5MNlxcbkw3XFxuTDhcXG5MOVxcbkwxMFxcbkwxMVxcbkwxMlxcbkwxM1xcbkwxNFxcbkwxNVxcbkwxNlxcbkwxN1xcbkwxOFxcbkwxOVxcbkwyMFxcbkwyMSdcblx0XHRcdFx0XSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0wxXFxuTDJcXG5MM1xcbkw0XFxuTDVcXG5MNlxcbkw3XFxuTDhcXG5MOVxcbkwxMFxcbicsIDAsIDAsIG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgMClcblx0XHRcdCk7XG5cblx0XHRcdHRlc3RQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5KFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J0wxXFxuTDJcXG5MM1xcbkw0XFxuTDVcXG5MNlxcbkw3XFxuTDhcXG5MOVxcbkwxMFxcbkwxMVxcbkwxMlxcbkwxM1xcbkwxNFxcbkwxNVxcbkwxNlxcbkwxN1xcbkwxOFxcbkwxOVxcbkwyMFxcbkwyMSdcblx0XHRcdFx0XSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxMSwgMSwgMTEsIDEpLFxuXHRcdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnTDExXFxuTDEyXFxuTDEzXFxuTDE0XFxuTDE1XFxuTDE2XFxuTDE3XFxuTDE4XFxuTDE5XFxuTDIwXFxuJywgMCwgMCwgbmV3IFJhbmdlKDExLCAxLCAxMSwgMSksIDApXG5cdFx0XHQpO1xuXG5cdFx0XHR0ZXN0UGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneShcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdMMVxcbkwyXFxuTDNcXG5MNFxcbkw1XFxuTDZcXG5MN1xcbkw4XFxuTDlcXG5MMTBcXG5MMTFcXG5MMTJcXG5MMTNcXG5MMTRcXG5MMTVcXG5MMTZcXG5MMTdcXG5MMThcXG5MMTlcXG5MMjBcXG5MMjEnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTIsIDEsIDEyLCAxKSxcblx0XHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0wxMVxcbkwxMlxcbkwxM1xcbkwxNFxcbkwxNVxcbkwxNlxcbkwxN1xcbkwxOFxcbkwxOVxcbkwyMFxcbicsIDQsIDQsIG5ldyBSYW5nZSgxMiwgMSwgMTIsIDEpLCAxKVxuXHRcdFx0KTtcblxuXHRcdFx0dGVzdFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3koXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnTDFcXG5MMlxcbkwzXFxuTDRcXG5MNVxcbkw2XFxuTDdcXG5MOFxcbkw5XFxuTDEwXFxuTDExXFxuTDEyXFxuTDEzXFxuTDE0XFxuTDE1XFxuTDE2XFxuTDE3XFxuTDE4XFxuTDE5XFxuTDIwXFxuTDIxJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIxLCAxLCAyMSwgMSksXG5cdFx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdMMjEnLCAwLCAwLCBuZXcgUmFuZ2UoMjEsIDEsIDIxLCAxKSwgMClcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtDQUErQztBQUN4RCxTQUEyQixxQkFBcUI7QUFD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
