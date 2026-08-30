import assert from "assert";
import { Lazy } from "../../../../base/common/lazy.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { RenderLineNumbersType, TextEditorCursorStyle } from "../../../../editor/common/config/editorOptions.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ExtHostDocumentData } from "../../common/extHostDocumentData.js";
import { ExtHostTextEditor, ExtHostTextEditorOptions } from "../../common/extHostTextEditor.js";
import { Range, TextEditorLineNumbersStyle } from "../../common/extHostTypes.js";
suite("ExtHostTextEditor", () => {
  let editor;
  const doc = new ExtHostDocumentData(void 0, URI.file(""), [
    "aaaa bbbb+cccc abc"
  ], "\n", 1, "text", false, "utf8");
  setup(() => {
    editor = new ExtHostTextEditor("fake", null, new NullLogService(), new Lazy(() => doc.document), [], { cursorStyle: TextEditorCursorStyle.Line, insertSpaces: true, lineNumbers: 1, tabSize: 4, indentSize: 4, originalIndentSize: "tabSize" }, [], 1);
  });
  test("disposed editor", () => {
    assert.ok(editor.value.document);
    editor._acceptViewColumn(3);
    assert.strictEqual(3, editor.value.viewColumn);
    editor.dispose();
    assert.throws(() => editor._acceptViewColumn(2));
    assert.strictEqual(3, editor.value.viewColumn);
    assert.ok(editor.value.document);
    assert.throws(() => editor._acceptOptions(null));
    assert.throws(() => editor._acceptSelections([]));
  });
  test("API [bug]: registerTextEditorCommand clears redo stack even if no edits are made #55163", async function() {
    let applyCount = 0;
    const editor2 = new ExtHostTextEditor(
      "edt1",
      new class extends mock() {
        $tryApplyEdits() {
          applyCount += 1;
          return Promise.resolve(true);
        }
      }(),
      new NullLogService(),
      new Lazy(() => doc.document),
      [],
      { cursorStyle: TextEditorCursorStyle.Line, insertSpaces: true, lineNumbers: 1, tabSize: 4, indentSize: 4, originalIndentSize: "tabSize" },
      [],
      1
    );
    await editor2.value.edit((edit) => {
    });
    assert.strictEqual(applyCount, 0);
    await editor2.value.edit((edit) => {
      edit.setEndOfLine(1);
    });
    assert.strictEqual(applyCount, 1);
    await editor2.value.edit((edit) => {
      edit.delete(new Range(0, 0, 1, 1));
    });
    assert.strictEqual(applyCount, 2);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("ExtHostTextEditorOptions", () => {
  let opts;
  let calls = [];
  setup(() => {
    calls = [];
    const mockProxy = {
      dispose: void 0,
      $trySetOptions: (id, options) => {
        assert.strictEqual(id, "1");
        calls.push(options);
        return Promise.resolve(void 0);
      },
      $tryShowTextDocument: void 0,
      $registerTextEditorDecorationType: void 0,
      $removeTextEditorDecorationType: void 0,
      $tryShowEditor: void 0,
      $tryHideEditor: void 0,
      $trySetDecorations: void 0,
      $trySetDecorationsFast: void 0,
      $tryRevealRange: void 0,
      $trySetSelections: void 0,
      $tryApplyEdits: void 0,
      $tryInsertSnippet: void 0,
      $getDiffInformation: void 0
    };
    opts = new ExtHostTextEditorOptions(mockProxy, "1", {
      tabSize: 4,
      indentSize: 4,
      originalIndentSize: "tabSize",
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    }, new NullLogService());
  });
  teardown(() => {
    opts = null;
    calls = null;
  });
  function assertState(opts2, expected) {
    const actual = {
      tabSize: opts2.value.tabSize,
      indentSize: opts2.value.indentSize,
      insertSpaces: opts2.value.insertSpaces,
      cursorStyle: opts2.value.cursorStyle,
      lineNumbers: opts2.value.lineNumbers
    };
    assert.deepStrictEqual(actual, expected);
  }
  test("can set tabSize to the same value", () => {
    opts.value.tabSize = 4;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can change tabSize to positive integer", () => {
    opts.value.tabSize = 1;
    assertState(opts, {
      tabSize: 1,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: 1 }]);
  });
  test("can change tabSize to positive float", () => {
    opts.value.tabSize = 2.3;
    assertState(opts, {
      tabSize: 2,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: 2 }]);
  });
  test("can change tabSize to a string number", () => {
    opts.value.tabSize = "2";
    assertState(opts, {
      tabSize: 2,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: 2 }]);
  });
  test("tabSize can request indentation detection", () => {
    opts.value.tabSize = "auto";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: "auto" }]);
  });
  test("ignores invalid tabSize 1", () => {
    opts.value.tabSize = null;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid tabSize 2", () => {
    opts.value.tabSize = -5;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid tabSize 3", () => {
    opts.value.tabSize = "hello";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid tabSize 4", () => {
    opts.value.tabSize = "-17";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can set indentSize to the same value", () => {
    opts.value.indentSize = 4;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 4 }]);
  });
  test("can change indentSize to positive integer", () => {
    opts.value.indentSize = 1;
    assertState(opts, {
      tabSize: 4,
      indentSize: 1,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 1 }]);
  });
  test("can change indentSize to positive float", () => {
    opts.value.indentSize = 2.3;
    assertState(opts, {
      tabSize: 4,
      indentSize: 2,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 2 }]);
  });
  test("can change indentSize to a string number", () => {
    opts.value.indentSize = "2";
    assertState(opts, {
      tabSize: 4,
      indentSize: 2,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 2 }]);
  });
  test("indentSize can request to use tabSize", () => {
    opts.value.indentSize = "tabSize";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: "tabSize" }]);
  });
  test("indentSize cannot request indentation detection", () => {
    opts.value.indentSize = "auto";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid indentSize 1", () => {
    opts.value.indentSize = null;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid indentSize 2", () => {
    opts.value.indentSize = -5;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid indentSize 3", () => {
    opts.value.indentSize = "hello";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("ignores invalid indentSize 4", () => {
    opts.value.indentSize = "-17";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can set insertSpaces to the same value", () => {
    opts.value.insertSpaces = false;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can set insertSpaces to boolean", () => {
    opts.value.insertSpaces = true;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: true,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ insertSpaces: true }]);
  });
  test("can set insertSpaces to false string", () => {
    opts.value.insertSpaces = "false";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can set insertSpaces to truey", () => {
    opts.value.insertSpaces = "hello";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: true,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ insertSpaces: true }]);
  });
  test("insertSpaces can request indentation detection", () => {
    opts.value.insertSpaces = "auto";
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ insertSpaces: "auto" }]);
  });
  test("can set cursorStyle to same value", () => {
    opts.value.cursorStyle = TextEditorCursorStyle.Line;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can change cursorStyle", () => {
    opts.value.cursorStyle = TextEditorCursorStyle.Block;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Block,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ cursorStyle: TextEditorCursorStyle.Block }]);
  });
  test("can set lineNumbers to same value", () => {
    opts.value.lineNumbers = TextEditorLineNumbersStyle.On;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, []);
  });
  test("can change lineNumbers", () => {
    opts.value.lineNumbers = TextEditorLineNumbersStyle.Off;
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.Off
    });
    assert.deepStrictEqual(calls, [{ lineNumbers: RenderLineNumbersType.Off }]);
  });
  test("can do bulk updates 0", () => {
    opts.assign({
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: TextEditorLineNumbersStyle.On
    });
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ indentSize: 4 }]);
  });
  test("can do bulk updates 1", () => {
    opts.assign({
      tabSize: "auto",
      insertSpaces: true
    });
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: true,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: "auto", insertSpaces: true }]);
  });
  test("can do bulk updates 2", () => {
    opts.assign({
      tabSize: 3,
      insertSpaces: "auto"
    });
    assertState(opts, {
      tabSize: 3,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Line,
      lineNumbers: RenderLineNumbersType.On
    });
    assert.deepStrictEqual(calls, [{ tabSize: 3, insertSpaces: "auto" }]);
  });
  test("can do bulk updates 3", () => {
    opts.assign({
      cursorStyle: TextEditorCursorStyle.Block,
      lineNumbers: TextEditorLineNumbersStyle.Relative
    });
    assertState(opts, {
      tabSize: 4,
      indentSize: 4,
      insertSpaces: false,
      cursorStyle: TextEditorCursorStyle.Block,
      lineNumbers: RenderLineNumbersType.Relative
    });
    assert.deepStrictEqual(calls, [{ cursorStyle: TextEditorCursorStyle.Block, lineNumbers: RenderLineNumbersType.Relative }]);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdFRleHRFZGl0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJlbmRlckxpbmVOdW1iZXJzVHlwZSwgVGV4dEVkaXRvckN1cnNvclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JDb25maWd1cmF0aW9uLCBJVGV4dEVkaXRvckNvbmZpZ3VyYXRpb25VcGRhdGUsIE1haW5UaHJlYWRUZXh0RWRpdG9yc1NoYXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50RGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnREYXRhLmpzJztcbmltcG9ydCB7IEV4dEhvc3RUZXh0RWRpdG9yLCBFeHRIb3N0VGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFRleHRFZGl0b3IuanMnO1xuaW1wb3J0IHsgUmFuZ2UsIFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUeXBlcy5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0VGV4dEVkaXRvcicsICgpID0+IHtcblxuXHRsZXQgZWRpdG9yOiBFeHRIb3N0VGV4dEVkaXRvcjtcblx0Y29uc3QgZG9jID0gbmV3IEV4dEhvc3REb2N1bWVudERhdGEodW5kZWZpbmVkISwgVVJJLmZpbGUoJycpLCBbXG5cdFx0J2FhYWEgYmJiYitjY2NjIGFiYydcblx0XSwgJ1xcbicsIDEsICd0ZXh0JywgZmFsc2UsICd1dGY4Jyk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGVkaXRvciA9IG5ldyBFeHRIb3N0VGV4dEVkaXRvcignZmFrZScsIG51bGwhLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IExhenkoKCkgPT4gZG9jLmRvY3VtZW50KSwgW10sIHsgY3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLCBpbnNlcnRTcGFjZXM6IHRydWUsIGxpbmVOdW1iZXJzOiAxLCB0YWJTaXplOiA0LCBpbmRlbnRTaXplOiA0LCBvcmlnaW5hbEluZGVudFNpemU6ICd0YWJTaXplJyB9LCBbXSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2VkIGVkaXRvcicsICgpID0+IHtcblxuXHRcdGFzc2VydC5vayhlZGl0b3IudmFsdWUuZG9jdW1lbnQpO1xuXHRcdGVkaXRvci5fYWNjZXB0Vmlld0NvbHVtbigzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMywgZWRpdG9yLnZhbHVlLnZpZXdDb2x1bW4pO1xuXG5cdFx0ZWRpdG9yLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZWRpdG9yLl9hY2NlcHRWaWV3Q29sdW1uKDIpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMywgZWRpdG9yLnZhbHVlLnZpZXdDb2x1bW4pO1xuXG5cdFx0YXNzZXJ0Lm9rKGVkaXRvci52YWx1ZS5kb2N1bWVudCk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBlZGl0b3IuX2FjY2VwdE9wdGlvbnMobnVsbCEpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGVkaXRvci5fYWNjZXB0U2VsZWN0aW9ucyhbXSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdBUEkgW2J1Z106IHJlZ2lzdGVyVGV4dEVkaXRvckNvbW1hbmQgY2xlYXJzIHJlZG8gc3RhY2sgZXZlbiBpZiBubyBlZGl0cyBhcmUgbWFkZSAjNTUxNjMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGFwcGx5Q291bnQgPSAwO1xuXHRcdGNvbnN0IGVkaXRvciA9IG5ldyBFeHRIb3N0VGV4dEVkaXRvcignZWR0MScsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRUZXh0RWRpdG9yc1NoYXBlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHRyeUFwcGx5RWRpdHMoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0XHRcdFx0YXBwbHlDb3VudCArPSAxO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpLCBuZXcgTGF6eSgoKSA9PiBkb2MuZG9jdW1lbnQpLCBbXSwgeyBjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsIGluc2VydFNwYWNlczogdHJ1ZSwgbGluZU51bWJlcnM6IDEsIHRhYlNpemU6IDQsIGluZGVudFNpemU6IDQsIG9yaWdpbmFsSW5kZW50U2l6ZTogJ3RhYlNpemUnIH0sIFtdLCAxKTtcblxuXHRcdGF3YWl0IGVkaXRvci52YWx1ZS5lZGl0KGVkaXQgPT4geyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlDb3VudCwgMCk7XG5cblx0XHRhd2FpdCBlZGl0b3IudmFsdWUuZWRpdChlZGl0ID0+IHsgZWRpdC5zZXRFbmRPZkxpbmUoMSk7IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBseUNvdW50LCAxKTtcblxuXHRcdGF3YWl0IGVkaXRvci52YWx1ZS5lZGl0KGVkaXQgPT4geyBlZGl0LmRlbGV0ZShuZXcgUmFuZ2UoMCwgMCwgMSwgMSkpOyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlDb3VudCwgMik7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG5cbnN1aXRlKCdFeHRIb3N0VGV4dEVkaXRvck9wdGlvbnMnLCAoKSA9PiB7XG5cblx0bGV0IG9wdHM6IEV4dEhvc3RUZXh0RWRpdG9yT3B0aW9ucztcblx0bGV0IGNhbGxzOiBJVGV4dEVkaXRvckNvbmZpZ3VyYXRpb25VcGRhdGVbXSA9IFtdO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjYWxscyA9IFtdO1xuXHRcdGNvbnN0IG1vY2tQcm94eTogTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGUgPSB7XG5cdFx0XHRkaXNwb3NlOiB1bmRlZmluZWQhLFxuXHRcdFx0JHRyeVNldE9wdGlvbnM6IChpZDogc3RyaW5nLCBvcHRpb25zOiBJVGV4dEVkaXRvckNvbmZpZ3VyYXRpb25VcGRhdGUpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlkLCAnMScpO1xuXHRcdFx0XHRjYWxscy5wdXNoKG9wdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9LFxuXHRcdFx0JHRyeVNob3dUZXh0RG9jdW1lbnQ6IHVuZGVmaW5lZCEsXG5cdFx0XHQkcmVnaXN0ZXJUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGU6IHVuZGVmaW5lZCEsXG5cdFx0XHQkcmVtb3ZlVGV4dEVkaXRvckRlY29yYXRpb25UeXBlOiB1bmRlZmluZWQhLFxuXHRcdFx0JHRyeVNob3dFZGl0b3I6IHVuZGVmaW5lZCEsXG5cdFx0XHQkdHJ5SGlkZUVkaXRvcjogdW5kZWZpbmVkISxcblx0XHRcdCR0cnlTZXREZWNvcmF0aW9uczogdW5kZWZpbmVkISxcblx0XHRcdCR0cnlTZXREZWNvcmF0aW9uc0Zhc3Q6IHVuZGVmaW5lZCEsXG5cdFx0XHQkdHJ5UmV2ZWFsUmFuZ2U6IHVuZGVmaW5lZCEsXG5cdFx0XHQkdHJ5U2V0U2VsZWN0aW9uczogdW5kZWZpbmVkISxcblx0XHRcdCR0cnlBcHBseUVkaXRzOiB1bmRlZmluZWQhLFxuXHRcdFx0JHRyeUluc2VydFNuaXBwZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHQkZ2V0RGlmZkluZm9ybWF0aW9uOiB1bmRlZmluZWQhXG5cdFx0fTtcblx0XHRvcHRzID0gbmV3IEV4dEhvc3RUZXh0RWRpdG9yT3B0aW9ucyhtb2NrUHJveHksICcxJywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRvcmlnaW5hbEluZGVudFNpemU6ICd0YWJTaXplJyxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0b3B0cyA9IG51bGwhO1xuXHRcdGNhbGxzID0gbnVsbCE7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFzc2VydFN0YXRlKG9wdHM6IEV4dEhvc3RUZXh0RWRpdG9yT3B0aW9ucywgZXhwZWN0ZWQ6IE9taXQ8SVJlc29sdmVkVGV4dEVkaXRvckNvbmZpZ3VyYXRpb24sICdvcmlnaW5hbEluZGVudFNpemUnPik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHtcblx0XHRcdHRhYlNpemU6IG9wdHMudmFsdWUudGFiU2l6ZSxcblx0XHRcdGluZGVudFNpemU6IG9wdHMudmFsdWUuaW5kZW50U2l6ZSxcblx0XHRcdGluc2VydFNwYWNlczogb3B0cy52YWx1ZS5pbnNlcnRTcGFjZXMsXG5cdFx0XHRjdXJzb3JTdHlsZTogb3B0cy52YWx1ZS5jdXJzb3JTdHlsZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBvcHRzLnZhbHVlLmxpbmVOdW1iZXJzXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0dGVzdCgnY2FuIHNldCB0YWJTaXplIHRvIHRoZSBzYW1lIHZhbHVlJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUudGFiU2l6ZSA9IDQ7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGNoYW5nZSB0YWJTaXplIHRvIHBvc2l0aXZlIGludGVnZXInLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS50YWJTaXplID0gMTtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiAxLFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgdGFiU2l6ZTogMSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgdGFiU2l6ZSB0byBwb3NpdGl2ZSBmbG9hdCcsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLnRhYlNpemUgPSAyLjM7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogMixcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IHRhYlNpemU6IDIgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gY2hhbmdlIHRhYlNpemUgdG8gYSBzdHJpbmcgbnVtYmVyJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUudGFiU2l6ZSA9ICcyJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiAyLFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgdGFiU2l6ZTogMiB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RhYlNpemUgY2FuIHJlcXVlc3QgaW5kZW50YXRpb24gZGV0ZWN0aW9uJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUudGFiU2l6ZSA9ICdhdXRvJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgdGFiU2l6ZTogJ2F1dG8nIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBpbnZhbGlkIHRhYlNpemUgMScsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLnRhYlNpemUgPSBudWxsITtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGludmFsaWQgdGFiU2l6ZSAyJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUudGFiU2l6ZSA9IC01O1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgaW52YWxpZCB0YWJTaXplIDMnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS50YWJTaXplID0gJ2hlbGxvJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGludmFsaWQgdGFiU2l6ZSA0JywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUudGFiU2l6ZSA9ICctMTcnO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBzZXQgaW5kZW50U2l6ZSB0byB0aGUgc2FtZSB2YWx1ZScsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmluZGVudFNpemUgPSA0O1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBpbmRlbnRTaXplOiA0IH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGNoYW5nZSBpbmRlbnRTaXplIHRvIHBvc2l0aXZlIGludGVnZXInLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5pbmRlbnRTaXplID0gMTtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogMSxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgaW5kZW50U2l6ZTogMSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgaW5kZW50U2l6ZSB0byBwb3NpdGl2ZSBmbG9hdCcsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmluZGVudFNpemUgPSAyLjM7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDIsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IGluZGVudFNpemU6IDIgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gY2hhbmdlIGluZGVudFNpemUgdG8gYSBzdHJpbmcgbnVtYmVyJywgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9wdHMudmFsdWUuaW5kZW50U2l6ZSA9IDxhbnk+JzInO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiAyLFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBpbmRlbnRTaXplOiAyIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnaW5kZW50U2l6ZSBjYW4gcmVxdWVzdCB0byB1c2UgdGFiU2l6ZScsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmluZGVudFNpemUgPSAndGFiU2l6ZSc7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IGluZGVudFNpemU6ICd0YWJTaXplJyB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luZGVudFNpemUgY2Fubm90IHJlcXVlc3QgaW5kZW50YXRpb24gZGV0ZWN0aW9uJywgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9wdHMudmFsdWUuaW5kZW50U2l6ZSA9IDxhbnk+J2F1dG8nO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgaW52YWxpZCBpbmRlbnRTaXplIDEnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5pbmRlbnRTaXplID0gbnVsbCE7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBpbnZhbGlkIGluZGVudFNpemUgMicsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmluZGVudFNpemUgPSAtNTtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGludmFsaWQgaW5kZW50U2l6ZSAzJywgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9wdHMudmFsdWUuaW5kZW50U2l6ZSA9IDxhbnk+J2hlbGxvJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGludmFsaWQgaW5kZW50U2l6ZSA0JywgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9wdHMudmFsdWUuaW5kZW50U2l6ZSA9IDxhbnk+Jy0xNyc7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIHNldCBpbnNlcnRTcGFjZXMgdG8gdGhlIHNhbWUgdmFsdWUnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5pbnNlcnRTcGFjZXMgPSBmYWxzZTtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gc2V0IGluc2VydFNwYWNlcyB0byBib29sZWFuJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUuaW5zZXJ0U3BhY2VzID0gdHJ1ZTtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogdHJ1ZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBpbnNlcnRTcGFjZXM6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gc2V0IGluc2VydFNwYWNlcyB0byBmYWxzZSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0b3B0cy52YWx1ZS5pbnNlcnRTcGFjZXMgPSAnZmFsc2UnO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBzZXQgaW5zZXJ0U3BhY2VzIHRvIHRydWV5JywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUuaW5zZXJ0U3BhY2VzID0gJ2hlbGxvJztcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogdHJ1ZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBpbnNlcnRTcGFjZXM6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnRTcGFjZXMgY2FuIHJlcXVlc3QgaW5kZW50YXRpb24gZGV0ZWN0aW9uJywgKCkgPT4ge1xuXHRcdG9wdHMudmFsdWUuaW5zZXJ0U3BhY2VzID0gJ2F1dG8nO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT25cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBpbnNlcnRTcGFjZXM6ICdhdXRvJyB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBzZXQgY3Vyc29yU3R5bGUgdG8gc2FtZSB2YWx1ZScsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmN1cnNvclN0eWxlID0gVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmU7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGNoYW5nZSBjdXJzb3JTdHlsZScsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmN1cnNvclN0eWxlID0gVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuQmxvY2ssXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgY3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5CbG9jayB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBzZXQgbGluZU51bWJlcnMgdG8gc2FtZSB2YWx1ZScsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmxpbmVOdW1iZXJzID0gVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuT247XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGNoYW5nZSBsaW5lTnVtYmVycycsICgpID0+IHtcblx0XHRvcHRzLnZhbHVlLmxpbmVOdW1iZXJzID0gVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuT2ZmO1xuXHRcdGFzc2VydFN0YXRlKG9wdHMsIHtcblx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZSxcblx0XHRcdGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT2ZmXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgbGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PZmYgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gZG8gYnVsayB1cGRhdGVzIDAnLCAoKSA9PiB7XG5cdFx0b3B0cy5hc3NpZ24oe1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IGluZGVudFNpemU6IDQgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gZG8gYnVsayB1cGRhdGVzIDEnLCAoKSA9PiB7XG5cdFx0b3B0cy5hc3NpZ24oe1xuXHRcdFx0dGFiU2l6ZTogJ2F1dG8nLFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiB0cnVlXG5cdFx0fSk7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IHRydWUsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmUsXG5cdFx0XHRsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgdGFiU2l6ZTogJ2F1dG8nLCBpbnNlcnRTcGFjZXM6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gZG8gYnVsayB1cGRhdGVzIDInLCAoKSA9PiB7XG5cdFx0b3B0cy5hc3NpZ24oe1xuXHRcdFx0dGFiU2l6ZTogMyxcblx0XHRcdGluc2VydFNwYWNlczogJ2F1dG8nXG5cdFx0fSk7XG5cdFx0YXNzZXJ0U3RhdGUob3B0cywge1xuXHRcdFx0dGFiU2l6ZTogMyxcblx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PblxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IHRhYlNpemU6IDMsIGluc2VydFNwYWNlczogJ2F1dG8nIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGRvIGJ1bGsgdXBkYXRlcyAzJywgKCkgPT4ge1xuXHRcdG9wdHMuYXNzaWduKHtcblx0XHRcdGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuQmxvY2ssXG5cdFx0XHRsaW5lTnVtYmVyczogVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuUmVsYXRpdmVcblx0XHR9KTtcblx0XHRhc3NlcnRTdGF0ZShvcHRzLCB7XG5cdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrLFxuXHRcdFx0bGluZU51bWJlcnM6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5SZWxhdGl2ZVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IGN1cnNvclN0eWxlOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuQmxvY2ssIGxpbmVOdW1iZXJzOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuUmVsYXRpdmUgfV0pO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCLDZCQUE2QjtBQUM3RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1C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
