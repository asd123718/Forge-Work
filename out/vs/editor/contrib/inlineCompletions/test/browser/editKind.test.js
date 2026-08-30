import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Position } from "../../../../common/core/position.js";
import { OffsetRange } from "../../../../common/core/ranges/offsetRange.js";
import { StringEdit } from "../../../../common/core/edits/stringEdit.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { computeEditKind } from "../../browser/model/editKind.js";
suite("computeEditKind", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Insert operations", () => {
    test("single character insert - syntactical", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(5, ";");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      assert.strictEqual(result.edits[0].charactersInserted, 1);
      assert.strictEqual(result.edits[0].charactersDeleted, 0);
      assert.strictEqual(result.edits[0].linesInserted, 0);
      assert.strictEqual(result.edits[0].linesDeleted, 0);
      const props = result.edits[0].properties;
      assert.strictEqual(props.textShape.kind, "singleLine");
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.isSingleCharacter, true);
        assert.strictEqual(props.textShape.singleCharacterKind, "syntactical");
      }
      model.dispose();
    });
    test("single character insert - identifier", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(5, "a");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.isSingleCharacter, true);
        assert.strictEqual(props.textShape.singleCharacterKind, "identifier");
      }
      model.dispose();
    });
    test("single character insert - whitespace", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(5, " ");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.isSingleCharacter, true);
        assert.strictEqual(props.textShape.singleCharacterKind, "whitespace");
      }
      model.dispose();
    });
    test("word insert", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(5, "foo");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.isWord, true);
        assert.strictEqual(props.textShape.isMultipleWords, false);
      }
      model.dispose();
    });
    test("multiple words insert", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(5, "foo bar baz");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.isMultipleWords, true);
      }
      model.dispose();
    });
    test("multi-line insert", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(5, "line1\nline2\nline3");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      assert.strictEqual(result.edits[0].charactersInserted, 17);
      assert.strictEqual(result.edits[0].charactersDeleted, 0);
      assert.strictEqual(result.edits[0].linesInserted, 2);
      assert.strictEqual(result.edits[0].linesDeleted, 0);
      const props = result.edits[0].properties;
      assert.strictEqual(props.textShape.kind, "multiLine");
      if (props.textShape.kind === "multiLine") {
        assert.strictEqual(props.textShape.lineCount, 3);
      }
      model.dispose();
    });
    test("insert at end of line", () => {
      const model = createTextModel("hello");
      const edit = StringEdit.insert(5, " world");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.strictEqual(props.locationShape, "endOfLine");
      model.dispose();
    });
    test("insert on empty line", () => {
      const model = createTextModel("hello\n\nworld");
      const edit = StringEdit.insert(6, "text");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.strictEqual(props.locationShape, "emptyLine");
      model.dispose();
    });
    test("insert at start of line", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(0, "prefix");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.strictEqual(props.locationShape, "startOfLine");
      model.dispose();
    });
    test("insert in middle of line", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(5, "_");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.strictEqual(props.locationShape, "middleOfLine");
      model.dispose();
    });
    test("insert relative to cursor - at cursor", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(5, "text");
      const cursor = new Position(1, 6);
      const result = computeEditKind(edit, model, cursor);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.ok(props.relativeToCursor);
      assert.strictEqual(props.relativeToCursor.atCursor, true);
      model.dispose();
    });
    test("insert relative to cursor - before cursor on same line", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(2, "text");
      const cursor = new Position(1, 8);
      const result = computeEditKind(edit, model, cursor);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.ok(props.relativeToCursor);
      assert.strictEqual(props.relativeToCursor.beforeCursorOnSameLine, true);
      model.dispose();
    });
    test("insert relative to cursor - after cursor on same line", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.insert(8, "text");
      const cursor = new Position(1, 4);
      const result = computeEditKind(edit, model, cursor);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.ok(props.relativeToCursor);
      assert.strictEqual(props.relativeToCursor.afterCursorOnSameLine, true);
      model.dispose();
    });
    test("insert relative to cursor - lines above", () => {
      const model = createTextModel("line1\nline2\nline3");
      const edit = StringEdit.insert(0, "text");
      const cursor = new Position(3, 1);
      const result = computeEditKind(edit, model, cursor);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.ok(props.relativeToCursor);
      assert.strictEqual(props.relativeToCursor.linesAbove, 2);
      model.dispose();
    });
    test("insert relative to cursor - lines below", () => {
      const model = createTextModel("line1\nline2\nline3");
      const edit = StringEdit.insert(12, "text");
      const cursor = new Position(1, 1);
      const result = computeEditKind(edit, model, cursor);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      assert.ok(props.relativeToCursor);
      assert.strictEqual(props.relativeToCursor.linesBelow, 2);
      model.dispose();
    });
    test("duplicated whitespace insert", () => {
      const model = createTextModel("hello");
      const edit = StringEdit.insert(5, "  ");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "insert");
      const props = result.edits[0].properties;
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.hasDuplicatedWhitespace, true);
      }
      model.dispose();
    });
  });
  suite("Delete operations", () => {
    test("single character delete - identifier", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.delete(new OffsetRange(4, 5));
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "delete");
      const props = result.edits[0].properties;
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.isSingleCharacter, true);
        assert.strictEqual(props.textShape.singleCharacterKind, "identifier");
      }
      model.dispose();
    });
    test("single character delete - syntactical", () => {
      const model = createTextModel("hello;world");
      const edit = StringEdit.delete(new OffsetRange(5, 6));
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "delete");
      const props = result.edits[0].properties;
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.isSingleCharacter, true);
        assert.strictEqual(props.textShape.singleCharacterKind, "syntactical");
      }
      model.dispose();
    });
    test("word delete", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.delete(new OffsetRange(0, 5));
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "delete");
      assert.strictEqual(result.edits[0].charactersInserted, 0);
      assert.strictEqual(result.edits[0].charactersDeleted, 5);
      assert.strictEqual(result.edits[0].linesInserted, 0);
      assert.strictEqual(result.edits[0].linesDeleted, 0);
      const props = result.edits[0].properties;
      if (props.textShape.kind === "singleLine") {
        assert.strictEqual(props.textShape.isWord, true);
      }
      model.dispose();
    });
    test("multi-line delete", () => {
      const model = createTextModel("line1\nline2\nline3");
      const edit = StringEdit.delete(new OffsetRange(0, 12));
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "delete");
      assert.strictEqual(result.edits[0].charactersInserted, 0);
      assert.strictEqual(result.edits[0].charactersDeleted, 12);
      assert.strictEqual(result.edits[0].linesInserted, 0);
      assert.strictEqual(result.edits[0].linesDeleted, 2);
      const props = result.edits[0].properties;
      assert.strictEqual(props.textShape.kind, "multiLine");
      model.dispose();
    });
    test("delete entire line content", () => {
      const model = createTextModel("hello");
      const edit = StringEdit.delete(new OffsetRange(0, 5));
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "delete");
      const props = result.edits[0].properties;
      assert.strictEqual(props.deletesEntireLineContent, true);
      model.dispose();
    });
  });
  suite("Replace operations", () => {
    test("word to word replacement", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.replace(new OffsetRange(0, 5), "goodbye");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "replace");
      assert.strictEqual(result.edits[0].charactersInserted, 7);
      assert.strictEqual(result.edits[0].charactersDeleted, 5);
      assert.strictEqual(result.edits[0].linesInserted, 0);
      assert.strictEqual(result.edits[0].linesDeleted, 0);
      const props = result.edits[0].properties;
      assert.strictEqual(props.isWordToWordReplacement, true);
      model.dispose();
    });
    test("additive replacement", () => {
      const model = createTextModel("hi world");
      const edit = StringEdit.replace(new OffsetRange(0, 2), "hello");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "replace");
      assert.strictEqual(result.edits[0].charactersInserted, 5);
      assert.strictEqual(result.edits[0].charactersDeleted, 2);
      const props = result.edits[0].properties;
      assert.strictEqual(props.isAdditive, true);
      assert.strictEqual(props.isSubtractive, false);
      model.dispose();
    });
    test("subtractive replacement", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.replace(new OffsetRange(0, 5), "hi");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "replace");
      assert.strictEqual(result.edits[0].charactersInserted, 2);
      assert.strictEqual(result.edits[0].charactersDeleted, 5);
      const props = result.edits[0].properties;
      assert.strictEqual(props.isSubtractive, true);
      assert.strictEqual(props.isAdditive, false);
      model.dispose();
    });
    test("single line to multi-line replacement", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.replace(new OffsetRange(0, 5), "line1\nline2");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "replace");
      assert.strictEqual(result.edits[0].linesInserted, 1);
      assert.strictEqual(result.edits[0].linesDeleted, 0);
      const props = result.edits[0].properties;
      assert.strictEqual(props.isSingleLineToMultiLine, true);
      model.dispose();
    });
    test("multi-line to single line replacement", () => {
      const model = createTextModel("line1\nline2\nline3");
      const edit = StringEdit.replace(new OffsetRange(0, 12), "hello");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "replace");
      assert.strictEqual(result.edits[0].linesInserted, 0);
      assert.strictEqual(result.edits[0].linesDeleted, 2);
      const props = result.edits[0].properties;
      assert.strictEqual(props.isMultiLineToSingleLine, true);
      model.dispose();
    });
    test("single line to single line replacement", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.replace(new OffsetRange(0, 5), "goodbye");
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 1);
      assert.strictEqual(result.edits[0].operation, "replace");
      const props = result.edits[0].properties;
      assert.strictEqual(props.isSingleLineToSingleLine, true);
      model.dispose();
    });
  });
  suite("Empty edit", () => {
    test("empty edit returns undefined", () => {
      const model = createTextModel("hello world");
      const edit = StringEdit.empty;
      const result = computeEditKind(edit, model);
      assert.strictEqual(result, void 0);
      model.dispose();
    });
  });
  suite("Multiple replacements", () => {
    test("multiple inserts", () => {
      const model = createTextModel("hello world");
      const edit = new StringEdit([
        StringEdit.insert(0, "A").replacements[0],
        StringEdit.insert(5, "B").replacements[0]
      ]);
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 2);
      assert.strictEqual(result.edits[0].operation, "insert");
      assert.strictEqual(result.edits[1].operation, "insert");
      model.dispose();
    });
    test("mixed operations", () => {
      const model = createTextModel("hello world");
      const edit = new StringEdit([
        StringEdit.insert(0, "prefix").replacements[0],
        StringEdit.delete(new OffsetRange(5, 6)).replacements[0]
      ]);
      const result = computeEditKind(edit, model);
      assert.ok(result);
      assert.strictEqual(result.edits.length, 2);
      assert.strictEqual(result.edits[0].operation, "insert");
      assert.strictEqual(result.edits[1].operation, "delete");
      model.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFx0ZXN0XFxicm93c2VyXFxlZGl0S2luZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFN0cmluZ0VkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy9zdHJpbmdFZGl0LmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUVkaXRLaW5kLCBJbnNlcnRQcm9wZXJ0aWVzLCBEZWxldGVQcm9wZXJ0aWVzLCBSZXBsYWNlUHJvcGVydGllcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWwvZWRpdEtpbmQuanMnO1xuXG5zdWl0ZSgnY29tcHV0ZUVkaXRLaW5kJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnSW5zZXJ0IG9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2luZ2xlIGNoYXJhY3RlciBpbnNlcnQgLSBzeW50YWN0aWNhbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDUsICc7Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAnaW5zZXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmNoYXJhY3RlcnNJbnNlcnRlZCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmNoYXJhY3RlcnNEZWxldGVkLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ubGluZXNJbnNlcnRlZCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmxpbmVzRGVsZXRlZCwgMCk7XG5cdFx0XHRjb25zdCBwcm9wcyA9IHJlc3VsdC5lZGl0c1swXS5wcm9wZXJ0aWVzIGFzIEluc2VydFByb3BlcnRpZXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMudGV4dFNoYXBlLmtpbmQsICdzaW5nbGVMaW5lJyk7XG5cdFx0XHRpZiAocHJvcHMudGV4dFNoYXBlLmtpbmQgPT09ICdzaW5nbGVMaW5lJykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMudGV4dFNoYXBlLmlzU2luZ2xlQ2hhcmFjdGVyLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BzLnRleHRTaGFwZS5zaW5nbGVDaGFyYWN0ZXJLaW5kLCAnc3ludGFjdGljYWwnKTtcblx0XHRcdH1cblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZSBjaGFyYWN0ZXIgaW5zZXJ0IC0gaWRlbnRpZmllcicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDUsICdhJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAnaW5zZXJ0Jyk7XG5cdFx0XHRjb25zdCBwcm9wcyA9IHJlc3VsdC5lZGl0c1swXS5wcm9wZXJ0aWVzIGFzIEluc2VydFByb3BlcnRpZXM7XG5cdFx0XHRpZiAocHJvcHMudGV4dFNoYXBlLmtpbmQgPT09ICdzaW5nbGVMaW5lJykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMudGV4dFNoYXBlLmlzU2luZ2xlQ2hhcmFjdGVyLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BzLnRleHRTaGFwZS5zaW5nbGVDaGFyYWN0ZXJLaW5kLCAnaWRlbnRpZmllcicpO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlIGNoYXJhY3RlciBpbnNlcnQgLSB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0XHRjb25zdCBlZGl0ID0gU3RyaW5nRWRpdC5pbnNlcnQoNSwgJyAnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGlmIChwcm9wcy50ZXh0U2hhcGUua2luZCA9PT0gJ3NpbmdsZUxpbmUnKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy50ZXh0U2hhcGUuaXNTaW5nbGVDaGFyYWN0ZXIsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMudGV4dFNoYXBlLnNpbmdsZUNoYXJhY3RlcktpbmQsICd3aGl0ZXNwYWNlJyk7XG5cdFx0XHR9XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3b3JkIGluc2VydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDUsICdmb28nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGlmIChwcm9wcy50ZXh0U2hhcGUua2luZCA9PT0gJ3NpbmdsZUxpbmUnKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy50ZXh0U2hhcGUuaXNXb3JkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BzLnRleHRTaGFwZS5pc011bHRpcGxlV29yZHMsIGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIHdvcmRzIGluc2VydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDUsICdmb28gYmFyIGJheicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUVkaXRLaW5kKGVkaXQsIG1vZGVsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLm9wZXJhdGlvbiwgJ2luc2VydCcpO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBJbnNlcnRQcm9wZXJ0aWVzO1xuXHRcdFx0aWYgKHByb3BzLnRleHRTaGFwZS5raW5kID09PSAnc2luZ2xlTGluZScpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BzLnRleHRTaGFwZS5pc011bHRpcGxlV29yZHMsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGktbGluZSBpbnNlcnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKTtcblx0XHRcdGNvbnN0IGVkaXQgPSBTdHJpbmdFZGl0Lmluc2VydCg1LCAnbGluZTFcXG5saW5lMlxcbmxpbmUzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAnaW5zZXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmNoYXJhY3RlcnNJbnNlcnRlZCwgMTcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5jaGFyYWN0ZXJzRGVsZXRlZCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmxpbmVzSW5zZXJ0ZWQsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5saW5lc0RlbGV0ZWQsIDApO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBJbnNlcnRQcm9wZXJ0aWVzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BzLnRleHRTaGFwZS5raW5kLCAnbXVsdGlMaW5lJyk7XG5cdFx0XHRpZiAocHJvcHMudGV4dFNoYXBlLmtpbmQgPT09ICdtdWx0aUxpbmUnKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy50ZXh0U2hhcGUubGluZUNvdW50LCAzKTtcblx0XHRcdH1cblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2VydCBhdCBlbmQgb2YgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbycpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDUsICcgd29ybGQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5sb2NhdGlvblNoYXBlLCAnZW5kT2ZMaW5lJyk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNlcnQgb24gZW1wdHkgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsb1xcblxcbndvcmxkJyk7XG5cdFx0XHRjb25zdCBlZGl0ID0gU3RyaW5nRWRpdC5pbnNlcnQoNiwgJ3RleHQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5sb2NhdGlvblNoYXBlLCAnZW1wdHlMaW5lJyk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNlcnQgYXQgc3RhcnQgb2YgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDAsICdwcmVmaXgnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5sb2NhdGlvblNoYXBlLCAnc3RhcnRPZkxpbmUnKTtcblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2VydCBpbiBtaWRkbGUgb2YgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDUsICdfJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAnaW5zZXJ0Jyk7XG5cdFx0XHRjb25zdCBwcm9wcyA9IHJlc3VsdC5lZGl0c1swXS5wcm9wZXJ0aWVzIGFzIEluc2VydFByb3BlcnRpZXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMubG9jYXRpb25TaGFwZSwgJ21pZGRsZU9mTGluZScpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zZXJ0IHJlbGF0aXZlIHRvIGN1cnNvciAtIGF0IGN1cnNvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDUsICd0ZXh0Jyk7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBuZXcgUG9zaXRpb24oMSwgNik7IC8vIGNvbHVtbiBpcyAxLWJhc2VkXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwsIGN1cnNvcik7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGFzc2VydC5vayhwcm9wcy5yZWxhdGl2ZVRvQ3Vyc29yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5yZWxhdGl2ZVRvQ3Vyc29yLmF0Q3Vyc29yLCB0cnVlKTtcblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2VydCByZWxhdGl2ZSB0byBjdXJzb3IgLSBiZWZvcmUgY3Vyc29yIG9uIHNhbWUgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDIsICd0ZXh0Jyk7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBuZXcgUG9zaXRpb24oMSwgOCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwsIGN1cnNvcik7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGFzc2VydC5vayhwcm9wcy5yZWxhdGl2ZVRvQ3Vyc29yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5yZWxhdGl2ZVRvQ3Vyc29yLmJlZm9yZUN1cnNvck9uU2FtZUxpbmUsIHRydWUpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zZXJ0IHJlbGF0aXZlIHRvIGN1cnNvciAtIGFmdGVyIGN1cnNvciBvbiBzYW1lIGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKTtcblx0XHRcdGNvbnN0IGVkaXQgPSBTdHJpbmdFZGl0Lmluc2VydCg4LCAndGV4dCcpO1xuXHRcdFx0Y29uc3QgY3Vyc29yID0gbmV3IFBvc2l0aW9uKDEsIDQpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUVkaXRLaW5kKGVkaXQsIG1vZGVsLCBjdXJzb3IpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAnaW5zZXJ0Jyk7XG5cdFx0XHRjb25zdCBwcm9wcyA9IHJlc3VsdC5lZGl0c1swXS5wcm9wZXJ0aWVzIGFzIEluc2VydFByb3BlcnRpZXM7XG5cdFx0XHRhc3NlcnQub2socHJvcHMucmVsYXRpdmVUb0N1cnNvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMucmVsYXRpdmVUb0N1cnNvci5hZnRlckN1cnNvck9uU2FtZUxpbmUsIHRydWUpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zZXJ0IHJlbGF0aXZlIHRvIGN1cnNvciAtIGxpbmVzIGFib3ZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUxXFxubGluZTJcXG5saW5lMycpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDAsICd0ZXh0Jyk7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBuZXcgUG9zaXRpb24oMywgMSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwsIGN1cnNvcik7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGFzc2VydC5vayhwcm9wcy5yZWxhdGl2ZVRvQ3Vyc29yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5yZWxhdGl2ZVRvQ3Vyc29yLmxpbmVzQWJvdmUsIDIpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zZXJ0IHJlbGF0aXZlIHRvIGN1cnNvciAtIGxpbmVzIGJlbG93JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUxXFxubGluZTJcXG5saW5lMycpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDEyLCAndGV4dCcpOyAvLyBhZnRlciAnbGluZTJcXG4nXG5cdFx0XHRjb25zdCBjdXJzb3IgPSBuZXcgUG9zaXRpb24oMSwgMSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwsIGN1cnNvcik7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgSW5zZXJ0UHJvcGVydGllcztcblx0XHRcdGFzc2VydC5vayhwcm9wcy5yZWxhdGl2ZVRvQ3Vyc29yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5yZWxhdGl2ZVRvQ3Vyc29yLmxpbmVzQmVsb3csIDIpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHVwbGljYXRlZCB3aGl0ZXNwYWNlIGluc2VydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbycpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuaW5zZXJ0KDUsICcgICcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUVkaXRLaW5kKGVkaXQsIG1vZGVsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLm9wZXJhdGlvbiwgJ2luc2VydCcpO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBJbnNlcnRQcm9wZXJ0aWVzO1xuXHRcdFx0aWYgKHByb3BzLnRleHRTaGFwZS5raW5kID09PSAnc2luZ2xlTGluZScpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BzLnRleHRTaGFwZS5oYXNEdXBsaWNhdGVkV2hpdGVzcGFjZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdEZWxldGUgb3BlcmF0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdzaW5nbGUgY2hhcmFjdGVyIGRlbGV0ZSAtIGlkZW50aWZpZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKTtcblx0XHRcdGNvbnN0IGVkaXQgPSBTdHJpbmdFZGl0LmRlbGV0ZShuZXcgT2Zmc2V0UmFuZ2UoNCwgNSkpOyAvLyBkZWxldGUgJ28nXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAnZGVsZXRlJyk7XG5cdFx0XHRjb25zdCBwcm9wcyA9IHJlc3VsdC5lZGl0c1swXS5wcm9wZXJ0aWVzIGFzIERlbGV0ZVByb3BlcnRpZXM7XG5cdFx0XHRpZiAocHJvcHMudGV4dFNoYXBlLmtpbmQgPT09ICdzaW5nbGVMaW5lJykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMudGV4dFNoYXBlLmlzU2luZ2xlQ2hhcmFjdGVyLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BzLnRleHRTaGFwZS5zaW5nbGVDaGFyYWN0ZXJLaW5kLCAnaWRlbnRpZmllcicpO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlIGNoYXJhY3RlciBkZWxldGUgLSBzeW50YWN0aWNhbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbzt3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuZGVsZXRlKG5ldyBPZmZzZXRSYW5nZSg1LCA2KSk7IC8vIGRlbGV0ZSAnOydcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdkZWxldGUnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgRGVsZXRlUHJvcGVydGllcztcblx0XHRcdGlmIChwcm9wcy50ZXh0U2hhcGUua2luZCA9PT0gJ3NpbmdsZUxpbmUnKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy50ZXh0U2hhcGUuaXNTaW5nbGVDaGFyYWN0ZXIsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMudGV4dFNoYXBlLnNpbmdsZUNoYXJhY3RlcktpbmQsICdzeW50YWN0aWNhbCcpO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd29yZCBkZWxldGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKTtcblx0XHRcdGNvbnN0IGVkaXQgPSBTdHJpbmdFZGl0LmRlbGV0ZShuZXcgT2Zmc2V0UmFuZ2UoMCwgNSkpOyAvLyBkZWxldGUgJ2hlbGxvJ1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUVkaXRLaW5kKGVkaXQsIG1vZGVsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLm9wZXJhdGlvbiwgJ2RlbGV0ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5jaGFyYWN0ZXJzSW5zZXJ0ZWQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5jaGFyYWN0ZXJzRGVsZXRlZCwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmxpbmVzSW5zZXJ0ZWQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5saW5lc0RlbGV0ZWQsIDApO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBEZWxldGVQcm9wZXJ0aWVzO1xuXHRcdFx0aWYgKHByb3BzLnRleHRTaGFwZS5raW5kID09PSAnc2luZ2xlTGluZScpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3BzLnRleHRTaGFwZS5pc1dvcmQsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGktbGluZSBkZWxldGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnbGluZTFcXG5saW5lMlxcbmxpbmUzJyk7XG5cdFx0XHRjb25zdCBlZGl0ID0gU3RyaW5nRWRpdC5kZWxldGUobmV3IE9mZnNldFJhbmdlKDAsIDEyKSk7IC8vIGRlbGV0ZSAnbGluZTFcXG5saW5lMlxcbidcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdkZWxldGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0uY2hhcmFjdGVyc0luc2VydGVkLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0uY2hhcmFjdGVyc0RlbGV0ZWQsIDEyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ubGluZXNJbnNlcnRlZCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmxpbmVzRGVsZXRlZCwgMik7XG5cdFx0XHRjb25zdCBwcm9wcyA9IHJlc3VsdC5lZGl0c1swXS5wcm9wZXJ0aWVzIGFzIERlbGV0ZVByb3BlcnRpZXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcHMudGV4dFNoYXBlLmtpbmQsICdtdWx0aUxpbmUnKTtcblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0ZSBlbnRpcmUgbGluZSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvJyk7XG5cdFx0XHRjb25zdCBlZGl0ID0gU3RyaW5nRWRpdC5kZWxldGUobmV3IE9mZnNldFJhbmdlKDAsIDUpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdkZWxldGUnKTtcblx0XHRcdGNvbnN0IHByb3BzID0gcmVzdWx0LmVkaXRzWzBdLnByb3BlcnRpZXMgYXMgRGVsZXRlUHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5kZWxldGVzRW50aXJlTGluZUNvbnRlbnQsIHRydWUpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUmVwbGFjZSBvcGVyYXRpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3dvcmQgdG8gd29yZCByZXBsYWNlbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgNSksICdnb29kYnllJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAncmVwbGFjZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5jaGFyYWN0ZXJzSW5zZXJ0ZWQsIDcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5jaGFyYWN0ZXJzRGVsZXRlZCwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmxpbmVzSW5zZXJ0ZWQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5saW5lc0RlbGV0ZWQsIDApO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBSZXBsYWNlUHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5pc1dvcmRUb1dvcmRSZXBsYWNlbWVudCwgdHJ1ZSk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRpdGl2ZSByZXBsYWNlbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoaSB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgMiksICdoZWxsbycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUVkaXRLaW5kKGVkaXQsIG1vZGVsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLm9wZXJhdGlvbiwgJ3JlcGxhY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0uY2hhcmFjdGVyc0luc2VydGVkLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0uY2hhcmFjdGVyc0RlbGV0ZWQsIDIpO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBSZXBsYWNlUHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5pc0FkZGl0aXZlLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5pc1N1YnRyYWN0aXZlLCBmYWxzZSk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJ0cmFjdGl2ZSByZXBsYWNlbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgNSksICdoaScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUVkaXRLaW5kKGVkaXQsIG1vZGVsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLm9wZXJhdGlvbiwgJ3JlcGxhY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0uY2hhcmFjdGVyc0luc2VydGVkLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0uY2hhcmFjdGVyc0RlbGV0ZWQsIDUpO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBSZXBsYWNlUHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5pc1N1YnRyYWN0aXZlLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5pc0FkZGl0aXZlLCBmYWxzZSk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgbGluZSB0byBtdWx0aS1saW5lIHJlcGxhY2VtZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0XHRjb25zdCBlZGl0ID0gU3RyaW5nRWRpdC5yZXBsYWNlKG5ldyBPZmZzZXRSYW5nZSgwLCA1KSwgJ2xpbmUxXFxubGluZTInKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdyZXBsYWNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmxpbmVzSW5zZXJ0ZWQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5saW5lc0RlbGV0ZWQsIDApO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBSZXBsYWNlUHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5pc1NpbmdsZUxpbmVUb011bHRpTGluZSwgdHJ1ZSk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aS1saW5lIHRvIHNpbmdsZSBsaW5lIHJlcGxhY2VtZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUxXFxubGluZTJcXG5saW5lMycpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgMTIpLCAnaGVsbG8nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdyZXBsYWNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzBdLmxpbmVzSW5zZXJ0ZWQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5saW5lc0RlbGV0ZWQsIDIpO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBSZXBsYWNlUHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5pc011bHRpTGluZVRvU2luZ2xlTGluZSwgdHJ1ZSk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgbGluZSB0byBzaW5nbGUgbGluZSByZXBsYWNlbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgNSksICdnb29kYnllJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAncmVwbGFjZScpO1xuXHRcdFx0Y29uc3QgcHJvcHMgPSByZXN1bHQuZWRpdHNbMF0ucHJvcGVydGllcyBhcyBSZXBsYWNlUHJvcGVydGllcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wcy5pc1NpbmdsZUxpbmVUb1NpbmdsZUxpbmUsIHRydWUpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRW1wdHkgZWRpdCcsICgpID0+IHtcblx0XHR0ZXN0KCdlbXB0eSBlZGl0IHJldHVybnMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0XHRjb25zdCBlZGl0ID0gU3RyaW5nRWRpdC5lbXB0eTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdNdWx0aXBsZSByZXBsYWNlbWVudHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbXVsdGlwbGUgaW5zZXJ0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IG5ldyBTdHJpbmdFZGl0KFtcblx0XHRcdFx0U3RyaW5nRWRpdC5pbnNlcnQoMCwgJ0EnKS5yZXBsYWNlbWVudHNbMF0sXG5cdFx0XHRcdFN0cmluZ0VkaXQuaW5zZXJ0KDUsICdCJykucmVwbGFjZW1lbnRzWzBdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRWRpdEtpbmQoZWRpdCwgbW9kZWwpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMF0ub3BlcmF0aW9uLCAnaW5zZXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVkaXRzWzFdLm9wZXJhdGlvbiwgJ2luc2VydCcpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWl4ZWQgb3BlcmF0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IG5ldyBTdHJpbmdFZGl0KFtcblx0XHRcdFx0U3RyaW5nRWRpdC5pbnNlcnQoMCwgJ3ByZWZpeCcpLnJlcGxhY2VtZW50c1swXSxcblx0XHRcdFx0U3RyaW5nRWRpdC5kZWxldGUobmV3IE9mZnNldFJhbmdlKDUsIDYpKS5yZXBsYWNlbWVudHNbMF0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lZGl0c1swXS5vcGVyYXRpb24sICdpbnNlcnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZWRpdHNbMV0ub3BlcmF0aW9uLCAnZGVsZXRlJyk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAi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
