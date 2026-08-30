import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Position } from "../../../../common/core/position.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { deserializePipePositions, serializePipePositions, testRepeatedActionAndExtractPositions } from "../../../wordOperations/test/browser/wordTestUtils.js";
import { CursorWordPartLeft, CursorWordPartLeftSelect, CursorWordPartRight, CursorWordPartRightSelect, DeleteWordPartLeft, DeleteWordPartRight } from "../../browser/wordPartOperations.js";
import { StaticServiceAccessor } from "./utils.js";
import { TestLanguageConfigurationService } from "../../../../test/common/modes/testLanguageConfigurationService.js";
suite("WordPartOperations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const _deleteWordPartLeft = new DeleteWordPartLeft();
  const _deleteWordPartRight = new DeleteWordPartRight();
  const _cursorWordPartLeft = new CursorWordPartLeft();
  const _cursorWordPartLeftSelect = new CursorWordPartLeftSelect();
  const _cursorWordPartRight = new CursorWordPartRight();
  const _cursorWordPartRightSelect = new CursorWordPartRightSelect();
  const serviceAccessor = new StaticServiceAccessor().withService(
    ILanguageConfigurationService,
    new TestLanguageConfigurationService()
  );
  function runEditorCommand(editor, command) {
    command.runEditorCommand(serviceAccessor, editor, null);
  }
  function cursorWordPartLeft(editor, inSelectionmode = false) {
    runEditorCommand(editor, inSelectionmode ? _cursorWordPartLeftSelect : _cursorWordPartLeft);
  }
  function cursorWordPartRight(editor, inSelectionmode = false) {
    runEditorCommand(editor, inSelectionmode ? _cursorWordPartRightSelect : _cursorWordPartRight);
  }
  function deleteWordPartLeft(editor) {
    runEditorCommand(editor, _deleteWordPartLeft);
  }
  function deleteWordPartRight(editor) {
    runEditorCommand(editor, _deleteWordPartRight);
  }
  test("cursorWordPartLeft - basic", () => {
    const EXPECTED = [
      "|start| |line|",
      "|this|Is|A|Camel|Case|Var|  |this_|is_|a_|snake_|case_|var| |THIS_|IS_|CAPS_|SNAKE| |this_|IS|Mixed|Use|",
      "|end| |line"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordPartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordPartLeft - issue #53899: whitespace", () => {
    const EXPECTED = "|myvar| |=| |'|demonstration|     |of| |selection| |with| |space|'";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordPartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordPartLeft - issue #53899: underscores", () => {
    const EXPECTED = "|myvar| |=| |'|demonstration_____|of| |selection| |with| |space|'";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordPartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordPartRight - basic", () => {
    const EXPECTED = [
      "start| |line|",
      "|this|Is|A|Camel|Case|Var|  |this|_is|_a|_snake|_case|_var| |THIS|_IS|_CAPS|_SNAKE| |this|_IS|Mixed|Use|",
      "|end| |line|"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordPartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(3, 9))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordPartRight - issue #53899: whitespace", () => {
    const EXPECTED = "myvar| |=| |'|demonstration|     |of| |selection| |with| |space|'|";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordPartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 52))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordPartRight - issue #53899: underscores", () => {
    const EXPECTED = "myvar| |=| |'|demonstration|_____of| |selection| |with| |space|'|";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordPartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 52))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("cursorWordPartRight - issue #53899: second case", () => {
    const EXPECTED = [
      ";| |--| |1|",
      "|;|        |--| |2|",
      "|;|    |#|3|",
      "|;|   |#|4|"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordPartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(4, 7))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("issue #93239 - cursorWordPartRight", () => {
    const EXPECTED = [
      "foo|_bar|"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordPartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 8))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("issue #93239 - cursorWordPartLeft", () => {
    const EXPECTED = [
      "|foo_|bar"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 8),
      (ed) => cursorWordPartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1))
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordPartLeft - basic", () => {
    const EXPECTED = "|   |/*| |Just| |some| |text| |a|+=| |3| |+|5|-|3| |*/|  |this|Is|A|Camel|Case|Var|  |this_|is_|a_|snake_|case_|var| |THIS_|IS_|CAPS_|SNAKE| |this_|IS|Mixed|Use";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1e3),
      (ed) => deleteWordPartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getValue().length === 0
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test("deleteWordPartRight - basic", () => {
    const EXPECTED = "   |/*| |Just| |some| |text| |a|+=| |3| |+|5|-|3| |*/|  |this|Is|A|Camel|Case|Var|  |this|_is|_a|_snake|_case|_var| |THIS|_IS|_CAPS|_SNAKE| |this|_IS|Mixed|Use|";
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => deleteWordPartRight(ed),
      (ed) => new Position(1, text.length - ed.getValue().length + 1),
      (ed) => ed.getValue().length === 0
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test('issue #158667: cursorWordPartLeft stops at "-" even when "-" is not in word separators', () => {
    const EXPECTED = [
      "|this-|is-|a-|kebab-|case-|var| |THIS-|IS-|CAPS-|KEBAB| |this-|IS|Mixed|Use"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => cursorWordPartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 1)),
      { wordSeparators: "!\"#&'()*+,./:;<=>?@[\\]^`{|}\xB7" }
      // default characters sans '$-%~' plus '·'
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test('issue #158667: cursorWordPartRight stops at "-" even when "-" is not in word separators', () => {
    const EXPECTED = [
      "this|-is|-a|-kebab|-case|-var| |THIS|-IS|-CAPS|-KEBAB| |this|-IS|Mixed|Use|"
    ].join("\n");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => cursorWordPartRight(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getPosition().equals(new Position(1, 60)),
      { wordSeparators: "!\"#&'()*+,./:;<=>?@[\\]^`{|}\xB7" }
      // default characters sans '$-%~' plus '·'
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test('issue #158667: deleteWordPartLeft stops at "-" even when "-" is not in word separators', () => {
    const EXPECTED = [
      "|this-|is-|a-|kebab-|case-|var| |THIS-|IS-|CAPS-|KEBAB| |this-|IS|Mixed|Use"
    ].join(" ");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1e3, 1e3),
      (ed) => deleteWordPartLeft(ed),
      (ed) => ed.getPosition(),
      (ed) => ed.getValue().length === 0,
      { wordSeparators: "!\"#&'()*+,./:;<=>?@[\\]^`{|}\xB7" }
      // default characters sans '$-%~' plus '·'
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
  test('issue #158667: deleteWordPartRight stops at "-" even when "-" is not in word separators', () => {
    const EXPECTED = [
      "this|-is|-a|-kebab|-case|-var| |THIS|-IS|-CAPS|-KEBAB| |this|-IS|Mixed|Use|"
    ].join(" ");
    const [text] = deserializePipePositions(EXPECTED);
    const actualStops = testRepeatedActionAndExtractPositions(
      text,
      new Position(1, 1),
      (ed) => deleteWordPartRight(ed),
      (ed) => new Position(1, text.length - ed.getValue().length + 1),
      (ed) => ed.getValue().length === 0,
      { wordSeparators: "!\"#&'()*+,./:;<=>?@[\\]^`{|}\xB7" }
      // default characters sans '$-%~' plus '·'
    );
    const actual = serializePipePositions(text, actualStops);
    assert.deepStrictEqual(actual, EXPECTED);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHdvcmRQYXJ0T3BlcmF0aW9uc1xcdGVzdFxcYnJvd3Nlclxcd29yZFBhcnRPcGVyYXRpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zLCBzZXJpYWxpemVQaXBlUG9zaXRpb25zLCB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vd29yZE9wZXJhdGlvbnMvdGVzdC9icm93c2VyL3dvcmRUZXN0VXRpbHMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yV29yZFBhcnRMZWZ0LCBDdXJzb3JXb3JkUGFydExlZnRTZWxlY3QsIEN1cnNvcldvcmRQYXJ0UmlnaHQsIEN1cnNvcldvcmRQYXJ0UmlnaHRTZWxlY3QsIERlbGV0ZVdvcmRQYXJ0TGVmdCwgRGVsZXRlV29yZFBhcnRSaWdodCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd29yZFBhcnRPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IFN0YXRpY1NlcnZpY2VBY2Nlc3NvciB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbnN1aXRlKCdXb3JkUGFydE9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgX2RlbGV0ZVdvcmRQYXJ0TGVmdCA9IG5ldyBEZWxldGVXb3JkUGFydExlZnQoKTtcblx0Y29uc3QgX2RlbGV0ZVdvcmRQYXJ0UmlnaHQgPSBuZXcgRGVsZXRlV29yZFBhcnRSaWdodCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZFBhcnRMZWZ0ID0gbmV3IEN1cnNvcldvcmRQYXJ0TGVmdCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZFBhcnRMZWZ0U2VsZWN0ID0gbmV3IEN1cnNvcldvcmRQYXJ0TGVmdFNlbGVjdCgpO1xuXHRjb25zdCBfY3Vyc29yV29yZFBhcnRSaWdodCA9IG5ldyBDdXJzb3JXb3JkUGFydFJpZ2h0KCk7XG5cdGNvbnN0IF9jdXJzb3JXb3JkUGFydFJpZ2h0U2VsZWN0ID0gbmV3IEN1cnNvcldvcmRQYXJ0UmlnaHRTZWxlY3QoKTtcblxuXHRjb25zdCBzZXJ2aWNlQWNjZXNzb3IgPSBuZXcgU3RhdGljU2VydmljZUFjY2Vzc29yKCkud2l0aFNlcnZpY2UoXG5cdFx0SUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0bmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKClcblx0KTtcblxuXHRmdW5jdGlvbiBydW5FZGl0b3JDb21tYW5kKGVkaXRvcjogSUNvZGVFZGl0b3IsIGNvbW1hbmQ6IEVkaXRvckNvbW1hbmQpOiB2b2lkIHtcblx0XHRjb21tYW5kLnJ1bkVkaXRvckNvbW1hbmQoc2VydmljZUFjY2Vzc29yLCBlZGl0b3IsIG51bGwpO1xuXHR9XG5cdGZ1bmN0aW9uIGN1cnNvcldvcmRQYXJ0TGVmdChlZGl0b3I6IElDb2RlRWRpdG9yLCBpblNlbGVjdGlvbm1vZGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHJ1bkVkaXRvckNvbW1hbmQoZWRpdG9yLCBpblNlbGVjdGlvbm1vZGUgPyBfY3Vyc29yV29yZFBhcnRMZWZ0U2VsZWN0IDogX2N1cnNvcldvcmRQYXJ0TGVmdCk7XG5cdH1cblx0ZnVuY3Rpb24gY3Vyc29yV29yZFBhcnRSaWdodChlZGl0b3I6IElDb2RlRWRpdG9yLCBpblNlbGVjdGlvbm1vZGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHJ1bkVkaXRvckNvbW1hbmQoZWRpdG9yLCBpblNlbGVjdGlvbm1vZGUgPyBfY3Vyc29yV29yZFBhcnRSaWdodFNlbGVjdCA6IF9jdXJzb3JXb3JkUGFydFJpZ2h0KTtcblx0fVxuXHRmdW5jdGlvbiBkZWxldGVXb3JkUGFydExlZnQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdHJ1bkVkaXRvckNvbW1hbmQoZWRpdG9yLCBfZGVsZXRlV29yZFBhcnRMZWZ0KTtcblx0fVxuXHRmdW5jdGlvbiBkZWxldGVXb3JkUGFydFJpZ2h0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRydW5FZGl0b3JDb21tYW5kKGVkaXRvciwgX2RlbGV0ZVdvcmRQYXJ0UmlnaHQpO1xuXHR9XG5cblx0dGVzdCgnY3Vyc29yV29yZFBhcnRMZWZ0IC0gYmFzaWMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgRVhQRUNURUQgPSBbXG5cdFx0XHQnfHN0YXJ0fCB8bGluZXwnLFxuXHRcdFx0J3x0aGlzfElzfEF8Q2FtZWx8Q2FzZXxWYXJ8ICB8dGhpc198aXNffGFffHNuYWtlX3xjYXNlX3x2YXJ8IHxUSElTX3xJU198Q0FQU198U05BS0V8IHx0aGlzX3xJU3xNaXhlZHxVc2V8Jyxcblx0XHRcdCd8ZW5kfCB8bGluZSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMTAwMCwgMTAwMCksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUGFydExlZnQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZFBhcnRMZWZ0IC0gaXNzdWUgIzUzODk5OiB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gJ3xteXZhcnwgfD18IHxcXCd8ZGVtb25zdHJhdGlvbnwgICAgIHxvZnwgfHNlbGVjdGlvbnwgfHdpdGh8IHxzcGFjZXxcXCcnO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMTAwMCwgMTAwMCksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUGFydExlZnQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZFBhcnRMZWZ0IC0gaXNzdWUgIzUzODk5OiB1bmRlcnNjb3JlcycsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9ICd8bXl2YXJ8IHw9fCB8XFwnfGRlbW9uc3RyYXRpb25fX19fX3xvZnwgfHNlbGVjdGlvbnwgfHdpdGh8IHxzcGFjZXxcXCcnO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMTAwMCwgMTAwMCksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUGFydExlZnQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDEpKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yV29yZFBhcnRSaWdodCAtIGJhc2ljJywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gW1xuXHRcdFx0J3N0YXJ0fCB8bGluZXwnLFxuXHRcdFx0J3x0aGlzfElzfEF8Q2FtZWx8Q2FzZXxWYXJ8ICB8dGhpc3xfaXN8X2F8X3NuYWtlfF9jYXNlfF92YXJ8IHxUSElTfF9JU3xfQ0FQU3xfU05BS0V8IHx0aGlzfF9JU3xNaXhlZHxVc2V8Jyxcblx0XHRcdCd8ZW5kfCB8bGluZXwnXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0ZWQgPT4gY3Vyc29yV29yZFBhcnRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMywgOSkpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3JXb3JkUGFydFJpZ2h0IC0gaXNzdWUgIzUzODk5OiB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gJ215dmFyfCB8PXwgfFxcJ3xkZW1vbnN0cmF0aW9ufCAgICAgfG9mfCB8c2VsZWN0aW9ufCB8d2l0aHwgfHNwYWNlfFxcJ3wnO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUGFydFJpZ2h0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEuZXF1YWxzKG5ldyBQb3NpdGlvbigxLCA1MikpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3JXb3JkUGFydFJpZ2h0IC0gaXNzdWUgIzUzODk5OiB1bmRlcnNjb3JlcycsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9ICdteXZhcnwgfD18IHxcXCd8ZGVtb25zdHJhdGlvbnxfX19fX29mfCB8c2VsZWN0aW9ufCB8d2l0aHwgfHNwYWNlfFxcJ3wnO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUGFydFJpZ2h0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEuZXF1YWxzKG5ldyBQb3NpdGlvbigxLCA1MikpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3JXb3JkUGFydFJpZ2h0IC0gaXNzdWUgIzUzODk5OiBzZWNvbmQgY2FzZScsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCc7fCB8LS18IHwxfCcsXG5cdFx0XHQnfDt8ICAgICAgICB8LS18IHwyfCcsXG5cdFx0XHQnfDt8ICAgIHwjfDN8Jyxcblx0XHRcdCd8O3wgICB8I3w0fCdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUGFydFJpZ2h0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEuZXF1YWxzKG5ldyBQb3NpdGlvbig0LCA3KSlcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5MzIzOSAtIGN1cnNvcldvcmRQYXJ0UmlnaHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgRVhQRUNURUQgPSBbXG5cdFx0XHQnZm9vfF9iYXJ8Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IFt0ZXh0LF0gPSBkZXNlcmlhbGl6ZVBpcGVQb3NpdGlvbnMoRVhQRUNURUQpO1xuXHRcdGNvbnN0IGFjdHVhbFN0b3BzID0gdGVzdFJlcGVhdGVkQWN0aW9uQW5kRXh0cmFjdFBvc2l0aW9ucyhcblx0XHRcdHRleHQsXG5cdFx0XHRuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRlZCA9PiBjdXJzb3JXb3JkUGFydFJpZ2h0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEuZXF1YWxzKG5ldyBQb3NpdGlvbigxLCA4KSlcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5MzIzOSAtIGN1cnNvcldvcmRQYXJ0TGVmdCcsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCd8Zm9vX3xiYXInLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCA4KSxcblx0XHRcdGVkID0+IGN1cnNvcldvcmRQYXJ0TGVmdChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgMSkpXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVXb3JkUGFydExlZnQgLSBiYXNpYycsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9ICd8ICAgfC8qfCB8SnVzdHwgfHNvbWV8IHx0ZXh0fCB8YXwrPXwgfDN8IHwrfDV8LXwzfCB8Ki98ICB8dGhpc3xJc3xBfENhbWVsfENhc2V8VmFyfCAgfHRoaXNffGlzX3xhX3xzbmFrZV98Y2FzZV98dmFyfCB8VEhJU198SVNffENBUFNffFNOQUtFfCB8dGhpc198SVN8TWl4ZWR8VXNlJztcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDEwMDApLFxuXHRcdFx0ZWQgPT4gZGVsZXRlV29yZFBhcnRMZWZ0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0VmFsdWUoKS5sZW5ndGggPT09IDBcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVdvcmRQYXJ0UmlnaHQgLSBiYXNpYycsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9ICcgICB8Lyp8IHxKdXN0fCB8c29tZXwgfHRleHR8IHxhfCs9fCB8M3wgfCt8NXwtfDN8IHwqL3wgIHx0aGlzfElzfEF8Q2FtZWx8Q2FzZXxWYXJ8ICB8dGhpc3xfaXN8X2F8X3NuYWtlfF9jYXNlfF92YXJ8IHxUSElTfF9JU3xfQ0FQU3xfU05BS0V8IHx0aGlzfF9JU3xNaXhlZHxVc2V8Jztcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0ZWQgPT4gZGVsZXRlV29yZFBhcnRSaWdodChlZCksXG5cdFx0XHRlZCA9PiBuZXcgUG9zaXRpb24oMSwgdGV4dC5sZW5ndGggLSBlZC5nZXRWYWx1ZSgpLmxlbmd0aCArIDEpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0VmFsdWUoKS5sZW5ndGggPT09IDBcblx0XHQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlcmlhbGl6ZVBpcGVQb3NpdGlvbnModGV4dCwgYWN0dWFsU3RvcHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBFWFBFQ1RFRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTg2Njc6IGN1cnNvcldvcmRQYXJ0TGVmdCBzdG9wcyBhdCBcIi1cIiBldmVuIHdoZW4gXCItXCIgaXMgbm90IGluIHdvcmQgc2VwYXJhdG9ycycsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCd8dGhpcy18aXMtfGEtfGtlYmFiLXxjYXNlLXx2YXJ8IHxUSElTLXxJUy18Q0FQUy18S0VCQUJ8IHx0aGlzLXxJU3xNaXhlZHxVc2UnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxMDAwLCAxMDAwKSxcblx0XHRcdGVkID0+IGN1cnNvcldvcmRQYXJ0TGVmdChlZCksXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpISxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLmVxdWFscyhuZXcgUG9zaXRpb24oMSwgMSkpLFxuXHRcdFx0eyB3b3JkU2VwYXJhdG9yczogJyFcIiMmXFwnKCkqKywuLzo7PD0+P0BbXFxcXF1eYHt8fVx1MDBCNycgfSAvLyBkZWZhdWx0IGNoYXJhY3RlcnMgc2FucyAnJC0lficgcGx1cyAnXHUwMEI3J1xuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1ODY2NzogY3Vyc29yV29yZFBhcnRSaWdodCBzdG9wcyBhdCBcIi1cIiBldmVuIHdoZW4gXCItXCIgaXMgbm90IGluIHdvcmQgc2VwYXJhdG9ycycsICgpID0+IHtcblx0XHRjb25zdCBFWFBFQ1RFRCA9IFtcblx0XHRcdCd0aGlzfC1pc3wtYXwta2ViYWJ8LWNhc2V8LXZhcnwgfFRISVN8LUlTfC1DQVBTfC1LRUJBQnwgfHRoaXN8LUlTfE1peGVkfFVzZXwnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IGN1cnNvcldvcmRQYXJ0UmlnaHQoZWQpLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0UG9zaXRpb24oKSEsXG5cdFx0XHRlZCA9PiBlZC5nZXRQb3NpdGlvbigpIS5lcXVhbHMobmV3IFBvc2l0aW9uKDEsIDYwKSksXG5cdFx0XHR7IHdvcmRTZXBhcmF0b3JzOiAnIVwiIyZcXCcoKSorLC4vOjs8PT4/QFtcXFxcXV5ge3x9XHUwMEI3JyB9IC8vIGRlZmF1bHQgY2hhcmFjdGVycyBzYW5zICckLSV+JyBwbHVzICdcdTAwQjcnXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTU4NjY3OiBkZWxldGVXb3JkUGFydExlZnQgc3RvcHMgYXQgXCItXCIgZXZlbiB3aGVuIFwiLVwiIGlzIG5vdCBpbiB3b3JkIHNlcGFyYXRvcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgRVhQRUNURUQgPSBbXG5cdFx0XHQnfHRoaXMtfGlzLXxhLXxrZWJhYi18Y2FzZS18dmFyfCB8VEhJUy18SVMtfENBUFMtfEtFQkFCfCB8dGhpcy18SVN8TWl4ZWR8VXNlJyxcblx0XHRdLmpvaW4oJyAnKTtcblx0XHRjb25zdCBbdGV4dCxdID0gZGVzZXJpYWxpemVQaXBlUG9zaXRpb25zKEVYUEVDVEVEKTtcblx0XHRjb25zdCBhY3R1YWxTdG9wcyA9IHRlc3RSZXBlYXRlZEFjdGlvbkFuZEV4dHJhY3RQb3NpdGlvbnMoXG5cdFx0XHR0ZXh0LFxuXHRcdFx0bmV3IFBvc2l0aW9uKDEwMDAsIDEwMDApLFxuXHRcdFx0ZWQgPT4gZGVsZXRlV29yZFBhcnRMZWZ0KGVkKSxcblx0XHRcdGVkID0+IGVkLmdldFBvc2l0aW9uKCkhLFxuXHRcdFx0ZWQgPT4gZWQuZ2V0VmFsdWUoKS5sZW5ndGggPT09IDAsXG5cdFx0XHR7IHdvcmRTZXBhcmF0b3JzOiAnIVwiIyZcXCcoKSorLC4vOjs8PT4/QFtcXFxcXV5ge3x9XHUwMEI3JyB9IC8vIGRlZmF1bHQgY2hhcmFjdGVycyBzYW5zICckLSV+JyBwbHVzICdcdTAwQjcnXG5cdFx0KTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZXJpYWxpemVQaXBlUG9zaXRpb25zKHRleHQsIGFjdHVhbFN0b3BzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgRVhQRUNURUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTU4NjY3OiBkZWxldGVXb3JkUGFydFJpZ2h0IHN0b3BzIGF0IFwiLVwiIGV2ZW4gd2hlbiBcIi1cIiBpcyBub3QgaW4gd29yZCBzZXBhcmF0b3JzJywgKCkgPT4ge1xuXHRcdGNvbnN0IEVYUEVDVEVEID0gW1xuXHRcdFx0J3RoaXN8LWlzfC1hfC1rZWJhYnwtY2FzZXwtdmFyfCB8VEhJU3wtSVN8LUNBUFN8LUtFQkFCfCB8dGhpc3wtSVN8TWl4ZWR8VXNlfCcsXG5cdFx0XS5qb2luKCcgJyk7XG5cdFx0Y29uc3QgW3RleHQsXSA9IGRlc2VyaWFsaXplUGlwZVBvc2l0aW9ucyhFWFBFQ1RFRCk7XG5cdFx0Y29uc3QgYWN0dWFsU3RvcHMgPSB0ZXN0UmVwZWF0ZWRBY3Rpb25BbmRFeHRyYWN0UG9zaXRpb25zKFxuXHRcdFx0dGV4dCxcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdGVkID0+IGRlbGV0ZVdvcmRQYXJ0UmlnaHQoZWQpLFxuXHRcdFx0ZWQgPT4gbmV3IFBvc2l0aW9uKDEsIHRleHQubGVuZ3RoIC0gZWQuZ2V0VmFsdWUoKS5sZW5ndGggKyAxKSxcblx0XHRcdGVkID0+IGVkLmdldFZhbHVlKCkubGVuZ3RoID09PSAwLFxuXHRcdFx0eyB3b3JkU2VwYXJhdG9yczogJyFcIiMmXFwnKCkqKywuLzo7PD0+P0BbXFxcXF1eYHt8fVx1MDBCNycgfSAvLyBkZWZhdWx0IGNoYXJhY3RlcnMgc2FucyAnJC0lficgcGx1cyAnXHUwMEI3J1xuXHRcdCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gc2VyaWFsaXplUGlwZVBvc2l0aW9ucyh0ZXh0LCBhY3R1YWxTdG9wcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIEVYUEVDVEVEKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUd4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDBCQUEwQix3QkFBd0IsNkNBQTZDO0FBQ3hHLFNBQVMsb0JBQW9CLDBCQUEwQixxQkFBcUIsMkJBQTJCLG9CQUFvQiwyQkFBMkI7QUFDdEosU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3Q0FBd0M7QUFFakQsTUFBTSxzQkFBc0IsTUFBTTtBQUVqQywwQ0FBd0M7QUFFeEMsUUFBTSxzQkFBc0IsSUFBSSxtQkFBbUI7QUFDbkQsUUFBTSx1QkFBdUIsSUFBSSxvQkFBb0I7QUFDckQsUUFBTSxzQkFBc0IsSUFBSSxtQkFBbUI7QUFDbkQsUUFBTSw0QkFBNEIsSUFBSSx5QkFBeUI7QUFDL0QsUUFBTSx1QkFBdUIsSUFBSSxvQkFBb0I7QUFDckQsUUFBTSw2QkFBNkIsSUFBSSwwQkFBMEI7QUFFakUsUUFBTSxrQkFBa0IsSUFBSSxzQkFBc0IsRUFBRTtBQUFBLElBQ25EO0FBQUEsSUFDQSxJQUFJLGlDQUFpQztBQUFBLEVBQ3RDO0FBRUEsV0FBUyxpQkFBaUIsUUFBcUIsU0FBOEI7QUFDNUUsWUFBUSxpQkFBaUIsaUJBQWlCLFFBQVEsSUFBSTtBQUFBLEVBQ3ZEO0FBQ0EsV0FBUyxtQkFBbUIsUUFBcUIsa0JBQTJCLE9BQWE7QUFDeEYscUJBQWlCLFFBQVEsa0JBQWtCLDRCQUE0QixtQkFBbUI7QUFBQSxFQUMzRjtBQUNBLFdBQVMsb0JBQW9CLFFBQXFCLGtCQUEyQixPQUFhO0FBQ3pGLHFCQUFpQixRQUFRLGtCQUFrQiw2QkFBNkIsb0JBQW9CO0FBQUEsRUFDN0Y7QUFDQSxXQUFTLG1CQUFtQixRQUEyQjtBQUN0RCxxQkFBaUIsUUFBUSxtQkFBbUI7QUFBQSxFQUM3QztBQUNBLFdBQVMs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O0FBQUEsTUFDbkI7QUFBQSxNQUNBLElBQUksU0FBUyxHQUFHLENBQUM7QUFBQSxNQUNqQixRQUFNLG9CQUFvQixFQUFFO0FBQUEsTUFDNUIsUUFBTSxHQUFHLFlBQVk7QUFBQSxNQUNyQixRQUFNLEdBQUcsWUFBWSxFQUFHLE9BQU8sSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDbEQsRUFBRSxnQkFBZ0Isb0NBQWlDO0FBQUE7QUFBQSxJQUNwRDtBQUNBLFVBQU0sU0FBUyx1QkFBdUIsTUFBTSxXQUFXO0FBQ3ZELFdBQU8sZ0JBQWdCLFFBQVEsUUFBUTtBQUFBLEVBQ3hDLENBQUM7QUFFRCxPQUFLLDBGQUEwRixNQUFNO0FBQ3BHLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsSUFDRCxFQUFFLEtBQUssR0FBRztBQUNWLFVBQU0sQ0FBQyxJQUFLLElBQUkseUJBQXlCLFFBQVE7QUFDakQsVUFBTSxjQUFjO0FBQUEsTUFDbkI7QUFBQSxNQUNBLElBQUksU0FBUyxLQUFNLEdBQUk7QUFBQSxNQUN2QixRQUFNLG1CQUFtQixFQUFFO0FBQUEsTUFDM0IsUUFBTSxHQUFHLFlBQVk7QUFBQSxNQUNyQixRQUFNLEdBQUcsU0FBUyxFQUFFLFdBQVc7QUFBQSxNQUMvQixFQUFFLGdCQUFnQixvQ0FBaUM7QUFBQTtBQUFBLElBQ3BEO0FBQ0EsVUFBTSxTQUFTLHVCQUF1QixNQUFNLFdBQVc7QUFDdkQsV0FBTyxnQkFBZ0IsUUFBUSxRQUFRO0FBQUEsRUFDeEMsQ0FBQztBQUVELE9BQUssMkZBQTJGLE1BQU07QUFDckcsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxJQUNELEVBQUUsS0FBSyxHQUFHO0FBQ1YsVUFBTSxDQUFDLElBQUssSUFBSSx5QkFBeUIsUUFBUTtBQUNqRCxVQUFNLGNBQWM7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUFBLE1BQ2pCLFFBQU0sb0JBQW9CLEVBQUU7QUFBQSxNQUM1QixRQUFNLElBQUksU0FBUyxHQUFHLEtBQUssU0FBUyxHQUFHLFNBQVMsRUFBRSxTQUFTLENBQUM7QUFBQSxNQUM1RCxRQUFNLEdBQUcsU0FBUyxFQUFFLFdBQVc7QUFBQSxNQUMvQixFQUFFLGdCQUFnQixvQ0FBaUM7QUFBQTtBQUFBLElBQ3BEO0FBQ0EsVUFBTSxTQUFTLHVCQUF1QixNQUFNLFdBQVc7QUFDdkQsV0FBTyxnQkFBZ0IsUUFBUSxRQUFRO0FBQUEsRUFDeEMsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
