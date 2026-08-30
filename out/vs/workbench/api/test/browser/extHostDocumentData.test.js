import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocumentData } from "../../common/extHostDocumentData.js";
import { Position } from "../../common/extHostTypes.js";
import { Range } from "../../../../editor/common/core/range.js";
import { mock } from "../../../../base/test/common/mock.js";
import * as perfData from "./extHostDocumentData.test.perf-data.js";
import { setDefaultGetWordAtTextConfig } from "../../../../editor/common/core/wordHelper.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostDocumentData", () => {
  let data;
  function assertPositionAt(offset, line, character) {
    const position = data.document.positionAt(offset);
    assert.strictEqual(position.line, line);
    assert.strictEqual(position.character, character);
  }
  function assertOffsetAt(line, character, offset) {
    const pos = new Position(line, character);
    const actual = data.document.offsetAt(pos);
    assert.strictEqual(actual, offset);
  }
  setup(function() {
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      "This is line one",
      //16
      "and this is line number two",
      //27
      "it is followed by #3",
      //20
      "and finished with the fourth."
      //29
    ], "\n", 1, "text", false, "utf8");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("readonly-ness", () => {
    assert.throws(() => data.document.uri = null);
    assert.throws(() => data.document.fileName = "foofile");
    assert.throws(() => data.document.isDirty = false);
    assert.throws(() => data.document.isUntitled = false);
    assert.throws(() => data.document.languageId = "dddd");
    assert.throws(() => data.document.lineCount = 9);
  });
  test("save, when disposed", function() {
    let saved;
    const data2 = new ExtHostDocumentData(new class extends mock() {
      $trySaveDocument(uri) {
        assert.ok(!saved);
        saved = uri;
        return Promise.resolve(true);
      }
    }(), URI.parse("foo:bar"), [], "\n", 1, "text", true, "utf8");
    return data2.document.save().then(() => {
      assert.strictEqual(saved.toString(), "foo:bar");
      data2.dispose();
      return data2.document.save().then(() => {
        assert.ok(false, "expected failure");
      }, (err) => {
        assert.ok(err);
      });
    });
  });
  test("read, when disposed", function() {
    data.dispose();
    const { document } = data;
    assert.strictEqual(document.lineCount, 4);
    assert.strictEqual(document.lineAt(0).text, "This is line one");
  });
  test("lines", () => {
    assert.strictEqual(data.document.lineCount, 4);
    assert.throws(() => data.document.lineAt(-1));
    assert.throws(() => data.document.lineAt(data.document.lineCount));
    assert.throws(() => data.document.lineAt(Number.MAX_VALUE));
    assert.throws(() => data.document.lineAt(Number.MIN_VALUE));
    assert.throws(() => data.document.lineAt(0.8));
    let line = data.document.lineAt(0);
    assert.strictEqual(line.lineNumber, 0);
    assert.strictEqual(line.text.length, 16);
    assert.strictEqual(line.text, "This is line one");
    assert.strictEqual(line.isEmptyOrWhitespace, false);
    assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 0);
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: "	 "
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assert.strictEqual(line.text, "This is line one");
    assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 0);
    line = data.document.lineAt(0);
    assert.strictEqual(line.text, "	 This is line one");
    assert.strictEqual(line.firstNonWhitespaceCharacterIndex, 2);
  });
  test("line, issue #5704", function() {
    let line = data.document.lineAt(0);
    let { range, rangeIncludingLineBreak } = line;
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 16);
    assert.strictEqual(rangeIncludingLineBreak.end.line, 1);
    assert.strictEqual(rangeIncludingLineBreak.end.character, 0);
    line = data.document.lineAt(data.document.lineCount - 1);
    range = line.range;
    rangeIncludingLineBreak = line.rangeIncludingLineBreak;
    assert.strictEqual(range.end.line, 3);
    assert.strictEqual(range.end.character, 29);
    assert.strictEqual(rangeIncludingLineBreak.end.line, 3);
    assert.strictEqual(rangeIncludingLineBreak.end.character, 29);
  });
  test("offsetAt", () => {
    assertOffsetAt(0, 0, 0);
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 16, 16);
    assertOffsetAt(1, 0, 17);
    assertOffsetAt(1, 3, 20);
    assertOffsetAt(2, 0, 45);
    assertOffsetAt(4, 29, 95);
    assertOffsetAt(4, 30, 95);
    assertOffsetAt(4, Number.MAX_VALUE, 95);
    assertOffsetAt(5, 29, 95);
    assertOffsetAt(Number.MAX_VALUE, 29, 95);
    assertOffsetAt(Number.MAX_VALUE, Number.MAX_VALUE, 95);
  });
  test("offsetAt, after remove", function() {
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: ""
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 13, 13);
    assertOffsetAt(1, 0, 14);
  });
  test("offsetAt, after replace", function() {
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: "is could be"
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 24, 24);
    assertOffsetAt(1, 0, 25);
  });
  test("offsetAt, after insert line", function() {
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: "is could be\na line with number"
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 13, 13);
    assertOffsetAt(1, 0, 14);
    assertOffsetAt(1, 18, 13 + 1 + 18);
    assertOffsetAt(1, 29, 13 + 1 + 29);
    assertOffsetAt(2, 0, 13 + 1 + 29 + 1);
  });
  test("offsetAt, after remove line", function() {
    data.onEvents({
      changes: [{
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 2, endColumn: 6 },
        rangeOffset: void 0,
        rangeLength: void 0,
        text: ""
      }],
      eol: void 0,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    });
    assertOffsetAt(0, 1, 1);
    assertOffsetAt(0, 2, 2);
    assertOffsetAt(1, 0, 25);
  });
  test("positionAt", () => {
    assertPositionAt(0, 0, 0);
    assertPositionAt(Number.MIN_VALUE, 0, 0);
    assertPositionAt(1, 0, 1);
    assertPositionAt(16, 0, 16);
    assertPositionAt(17, 1, 0);
    assertPositionAt(20, 1, 3);
    assertPositionAt(45, 2, 0);
    assertPositionAt(95, 3, 29);
    assertPositionAt(96, 3, 29);
    assertPositionAt(99, 3, 29);
    assertPositionAt(Number.MAX_VALUE, 3, 29);
  });
  test("getWordRangeAtPosition", () => {
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      "aaaa bbbb+cccc abc"
    ], "\n", 1, "text", false, "utf8");
    let range = data.document.getWordRangeAtPosition(new Position(0, 2));
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 0);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 4);
    assert.throws(() => data.document.getWordRangeAtPosition(new Position(0, 2), /.*/));
    range = data.document.getWordRangeAtPosition(new Position(0, 5), /[a-z+]+/);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 5);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 14);
    range = data.document.getWordRangeAtPosition(new Position(0, 17), /[a-z+]+/);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 15);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 18);
    range = data.document.getWordRangeAtPosition(new Position(0, 11), /yy/);
    assert.strictEqual(range, void 0);
  });
  test("getWordRangeAtPosition doesn't quite use the regex as expected, #29102", function() {
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      "some text here",
      "/** foo bar */",
      "function() {",
      '	"far boo"',
      "}"
    ], "\n", 1, "text", false, "utf8");
    let range = data.document.getWordRangeAtPosition(new Position(0, 0), /\/\*.+\*\//);
    assert.strictEqual(range, void 0);
    range = data.document.getWordRangeAtPosition(new Position(1, 0), /\/\*.+\*\//);
    assert.strictEqual(range.start.line, 1);
    assert.strictEqual(range.start.character, 0);
    assert.strictEqual(range.end.line, 1);
    assert.strictEqual(range.end.character, 14);
    range = data.document.getWordRangeAtPosition(new Position(3, 0), /("|').*\1/);
    assert.strictEqual(range, void 0);
    range = data.document.getWordRangeAtPosition(new Position(3, 1), /("|').*\1/);
    assert.strictEqual(range.start.line, 3);
    assert.strictEqual(range.start.character, 1);
    assert.strictEqual(range.end.line, 3);
    assert.strictEqual(range.end.character, 10);
  });
  test("getWordRangeAtPosition can freeze the extension host #95319", function() {
    const regex = /(https?:\/\/github\.com\/(([^\s]+)\/([^\s]+))\/([^\s]+\/)?(issues|pull)\/([0-9]+))|(([^\s]+)\/([^\s]+))?#([1-9][0-9]*)($|[\s\:\;\-\(\=])/;
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      perfData._$_$_expensive
    ], "\n", 1, "text", false, "utf8");
    const config = setDefaultGetWordAtTextConfig({ maxLen: 1e3, windowSize: 15, timeBudget: 30 });
    try {
      let range = data.document.getWordRangeAtPosition(new Position(0, 1177170), regex);
      assert.strictEqual(range, void 0);
      const pos = new Position(0, 1177170);
      range = data.document.getWordRangeAtPosition(pos);
      assert.ok(range);
      assert.ok(range.contains(pos));
      assert.strictEqual(data.document.getText(range), "TaskDefinition");
    } finally {
      config.dispose();
    }
  });
  test("Rename popup sometimes populates with text on the left side omitted #96013", function() {
    const regex = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;
    const line = "int abcdefhijklmnopqwvrstxyz;";
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      line
    ], "\n", 1, "text", false, "utf8");
    const range = data.document.getWordRangeAtPosition(new Position(0, 27), regex);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.start.character, 4);
    assert.strictEqual(range.end.character, 28);
  });
  test("Custom snippet $TM_SELECTED_TEXT not show suggestion #108892", function() {
    data = new ExtHostDocumentData(void 0, URI.file(""), [
      `        <p><span xml:lang="en">Sheldon</span>, soprannominato "<span xml:lang="en">Shelly</span> dalla madre e dalla sorella, \xE8 nato a <span xml:lang="en">Galveston</span>, in <span xml:lang="en">Texas</span>, il 26 febbraio 1980 in un supermercato. \xC8 stato un bambino prodigio, come testimoniato dal suo quoziente d'intelligenza (187, di molto superiore alla norma) e dalla sua rapida carriera scolastica: si \xE8 diplomato all'eta di 11 anni approdando alla stessa et\xE0 alla formazione universitaria e all'et\xE0 di 16 anni ha ottenuto il suo primo dottorato di ricerca. All'inizio della serie e per gran parte di essa vive con il coinquilino Leonard nell'appartamento 4A al 2311 <span xml:lang="en">North Los Robles Avenue</span> di <span xml:lang="en">Pasadena</span>, per poi trasferirsi nell'appartamento di <span xml:lang="en">Penny</span> con <span xml:lang="en">Amy</span> nella decima stagione. Come pi\xF9 volte afferma lui stesso possiede una memoria eidetica e un orecchio assoluto. \xC8 stato educato da una madre estremamente religiosa e, in pi\xF9 occasioni, questo aspetto contrasta con il rigore scientifico di <span xml:lang="en">Sheldon</span>; tuttavia la donna sembra essere l'unica persona in grado di comandarlo a bacchetta.</p>`
    ], "\n", 1, "text", false, "utf8");
    const pos = new Position(0, 55);
    const range = data.document.getWordRangeAtPosition(pos);
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.start.character, 47);
    assert.strictEqual(range.end.character, 61);
    assert.strictEqual(data.document.getText(range), "soprannominato");
  });
});
var AssertDocumentLineMappingDirection = /* @__PURE__ */ ((AssertDocumentLineMappingDirection2) => {
  AssertDocumentLineMappingDirection2[AssertDocumentLineMappingDirection2["OffsetToPosition"] = 0] = "OffsetToPosition";
  AssertDocumentLineMappingDirection2[AssertDocumentLineMappingDirection2["PositionToOffset"] = 1] = "PositionToOffset";
  return AssertDocumentLineMappingDirection2;
})(AssertDocumentLineMappingDirection || {});
suite("ExtHostDocumentData updates line mapping", () => {
  function positionToStr(position) {
    return "(" + position.line + "," + position.character + ")";
  }
  function assertDocumentLineMapping(doc, direction) {
    const allText = doc.getText();
    let line = 0, character = 0, previousIsCarriageReturn = false;
    for (let offset = 0; offset <= allText.length; offset++) {
      const position = new Position(line, character + (previousIsCarriageReturn ? -1 : 0));
      if (direction === 0 /* OffsetToPosition */) {
        const actualPosition = doc.document.positionAt(offset);
        assert.strictEqual(positionToStr(actualPosition), positionToStr(position), "positionAt mismatch for offset " + offset);
      } else {
        const expectedOffset = offset + (previousIsCarriageReturn ? -1 : 0);
        const actualOffset = doc.document.offsetAt(position);
        assert.strictEqual(actualOffset, expectedOffset, "offsetAt mismatch for position " + positionToStr(position));
      }
      if (allText.charAt(offset) === "\n") {
        line++;
        character = 0;
      } else {
        character++;
      }
      previousIsCarriageReturn = allText.charAt(offset) === "\r";
    }
  }
  function createChangeEvent(range, text, eol) {
    return {
      changes: [{
        range,
        rangeOffset: void 0,
        rangeLength: void 0,
        text
      }],
      eol,
      versionId: void 0,
      isRedoing: false,
      isUndoing: false
    };
  }
  function testLineMappingDirectionAfterEvents(lines, eol, direction, e) {
    const myDocument = new ExtHostDocumentData(void 0, URI.file(""), lines.slice(0), eol, 1, "text", false, "utf8");
    assertDocumentLineMapping(myDocument, direction);
    myDocument.onEvents(e);
    assertDocumentLineMapping(myDocument, direction);
  }
  function testLineMappingAfterEvents(lines, e) {
    testLineMappingDirectionAfterEvents(lines, "\n", 1 /* PositionToOffset */, e);
    testLineMappingDirectionAfterEvents(lines, "\n", 0 /* OffsetToPosition */, e);
    testLineMappingDirectionAfterEvents(lines, "\r\n", 1 /* PositionToOffset */, e);
    testLineMappingDirectionAfterEvents(lines, "\r\n", 0 /* OffsetToPosition */, e);
  }
  ensureNoDisposablesAreLeakedInTestSuite();
  test("line mapping", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], { changes: [], eol: void 0, versionId: 7, isRedoing: false, isUndoing: false });
  });
  test("after remove", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 1, 6), ""));
  });
  test("after replace", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 1, 6), "is could be"));
  });
  test("after insert line", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 1, 6), "is could be\na line with number"));
  });
  test("after insert two lines", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 1, 6), "is could be\na line with number\nyet another line"));
  });
  test("after remove line", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 2, 6), ""));
  });
  test("after remove two lines", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 3, 6), ""));
  });
  test("after deleting entire content", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 4, 30), ""));
  });
  test("after replacing entire content", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 3, 4, 30), "some new text\nthat\nspans multiple lines"));
  });
  test("after changing EOL to CRLF", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 1, 1, 1), "", "\r\n"));
  });
  test("after changing EOL to LF", () => {
    testLineMappingAfterEvents([
      "This is line one",
      "and this is line number two",
      "it is followed by #3",
      "and finished with the fourth."
    ], createChangeEvent(new Range(1, 1, 1, 1), "", "\n"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdERvY3VtZW50RGF0YS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudERhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50RGF0YS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZERvY3VtZW50c1NoYXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC9taXJyb3JUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgKiBhcyBwZXJmRGF0YSBmcm9tICcuL2V4dEhvc3REb2N1bWVudERhdGEudGVzdC5wZXJmLWRhdGEuanMnO1xuaW1wb3J0IHsgc2V0RGVmYXVsdEdldFdvcmRBdFRleHRDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0V4dEhvc3REb2N1bWVudERhdGEnLCAoKSA9PiB7XG5cblx0bGV0IGRhdGE6IEV4dEhvc3REb2N1bWVudERhdGE7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0UG9zaXRpb25BdChvZmZzZXQ6IG51bWJlciwgbGluZTogbnVtYmVyLCBjaGFyYWN0ZXI6IG51bWJlcikge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gZGF0YS5kb2N1bWVudC5wb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvc2l0aW9uLmxpbmUsIGxpbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb3NpdGlvbi5jaGFyYWN0ZXIsIGNoYXJhY3Rlcik7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRPZmZzZXRBdChsaW5lOiBudW1iZXIsIGNoYXJhY3RlcjogbnVtYmVyLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbihsaW5lLCBjaGFyYWN0ZXIpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGRhdGEuZG9jdW1lbnQub2Zmc2V0QXQocG9zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBvZmZzZXQpO1xuXHR9XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGRhdGEgPSBuZXcgRXh0SG9zdERvY3VtZW50RGF0YSh1bmRlZmluZWQhLCBVUkkuZmlsZSgnJyksIFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJywgLy8xNlxuXHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsIC8vMjdcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsIC8vMjlcblx0XHRdLCAnXFxuJywgMSwgJ3RleHQnLCBmYWxzZSwgJ3V0ZjgnKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVhZG9ubHktbmVzcycsICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IChkYXRhIGFzIGFueSkuZG9jdW1lbnQudXJpID0gbnVsbCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiAoZGF0YSBhcyBhbnkpLmRvY3VtZW50LmZpbGVOYW1lID0gJ2Zvb2ZpbGUnKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IChkYXRhIGFzIGFueSkuZG9jdW1lbnQuaXNEaXJ0eSA9IGZhbHNlKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IChkYXRhIGFzIGFueSkuZG9jdW1lbnQuaXNVbnRpdGxlZCA9IGZhbHNlKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IChkYXRhIGFzIGFueSkuZG9jdW1lbnQubGFuZ3VhZ2VJZCA9ICdkZGRkJyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiAoZGF0YSBhcyBhbnkpLmRvY3VtZW50LmxpbmVDb3VudCA9IDkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlLCB3aGVuIGRpc3Bvc2VkJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBzYXZlZDogVVJJO1xuXHRcdGNvbnN0IGRhdGEgPSBuZXcgRXh0SG9zdERvY3VtZW50RGF0YShuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWREb2N1bWVudHNTaGFwZT4oKSB7XG5cdFx0XHRvdmVycmlkZSAkdHJ5U2F2ZURvY3VtZW50KHVyaTogVVJJKSB7XG5cdFx0XHRcdGFzc2VydC5vayghc2F2ZWQpO1xuXHRcdFx0XHRzYXZlZCA9IHVyaTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9LCBVUkkucGFyc2UoJ2ZvbzpiYXInKSwgW10sICdcXG4nLCAxLCAndGV4dCcsIHRydWUsICd1dGY4Jyk7XG5cblx0XHRyZXR1cm4gZGF0YS5kb2N1bWVudC5zYXZlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWQudG9TdHJpbmcoKSwgJ2ZvbzpiYXInKTtcblxuXHRcdFx0ZGF0YS5kaXNwb3NlKCk7XG5cblx0XHRcdHJldHVybiBkYXRhLmRvY3VtZW50LnNhdmUoKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZhbHNlLCAnZXhwZWN0ZWQgZmFpbHVyZScpO1xuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGVycik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZCwgd2hlbiBkaXNwb3NlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRkYXRhLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHsgZG9jdW1lbnQgfSA9IGRhdGE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY3VtZW50LmxpbmVDb3VudCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY3VtZW50LmxpbmVBdCgwKS50ZXh0LCAnVGhpcyBpcyBsaW5lIG9uZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaW5lcycsICgpID0+IHtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmRvY3VtZW50LmxpbmVDb3VudCwgNCk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGRhdGEuZG9jdW1lbnQubGluZUF0KC0xKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBkYXRhLmRvY3VtZW50LmxpbmVBdChkYXRhLmRvY3VtZW50LmxpbmVDb3VudCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZGF0YS5kb2N1bWVudC5saW5lQXQoTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZGF0YS5kb2N1bWVudC5saW5lQXQoTnVtYmVyLk1JTl9WQUxVRSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZGF0YS5kb2N1bWVudC5saW5lQXQoMC44KSk7XG5cblx0XHRsZXQgbGluZSA9IGRhdGEuZG9jdW1lbnQubGluZUF0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lLmxpbmVOdW1iZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lLnRleHQubGVuZ3RoLCAxNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUudGV4dCwgJ1RoaXMgaXMgbGluZSBvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZS5pc0VtcHR5T3JXaGl0ZXNwYWNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUuZmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVySW5kZXgsIDApO1xuXG5cdFx0ZGF0YS5vbkV2ZW50cyh7XG5cdFx0XHRjaGFuZ2VzOiBbe1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0cmFuZ2VPZmZzZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHJhbmdlTGVuZ3RoOiB1bmRlZmluZWQhLFxuXHRcdFx0XHR0ZXh0OiAnXFx0ICdcblx0XHRcdH1dLFxuXHRcdFx0ZW9sOiB1bmRlZmluZWQhLFxuXHRcdFx0dmVyc2lvbklkOiB1bmRlZmluZWQhLFxuXHRcdFx0aXNSZWRvaW5nOiBmYWxzZSxcblx0XHRcdGlzVW5kb2luZzogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHQvLyBsaW5lIGRpZG4ndCBjaGFuZ2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZS50ZXh0LCAnVGhpcyBpcyBsaW5lIG9uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lLmZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlckluZGV4LCAwKTtcblxuXHRcdC8vIGZldGNoIGxpbmUgYWdhaW5cblx0XHRsaW5lID0gZGF0YS5kb2N1bWVudC5saW5lQXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUudGV4dCwgJ1xcdCBUaGlzIGlzIGxpbmUgb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUuZmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVySW5kZXgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaW5lLCBpc3N1ZSAjNTcwNCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBsaW5lID0gZGF0YS5kb2N1bWVudC5saW5lQXQoMCk7XG5cdFx0bGV0IHsgcmFuZ2UsIHJhbmdlSW5jbHVkaW5nTGluZUJyZWFrIH0gPSBsaW5lO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5jaGFyYWN0ZXIsIDE2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VJbmNsdWRpbmdMaW5lQnJlYWsuZW5kLmxpbmUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZUluY2x1ZGluZ0xpbmVCcmVhay5lbmQuY2hhcmFjdGVyLCAwKTtcblxuXHRcdGxpbmUgPSBkYXRhLmRvY3VtZW50LmxpbmVBdChkYXRhLmRvY3VtZW50LmxpbmVDb3VudCAtIDEpO1xuXHRcdHJhbmdlID0gbGluZS5yYW5nZTtcblx0XHRyYW5nZUluY2x1ZGluZ0xpbmVCcmVhayA9IGxpbmUucmFuZ2VJbmNsdWRpbmdMaW5lQnJlYWs7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5saW5lLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmNoYXJhY3RlciwgMjkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZUluY2x1ZGluZ0xpbmVCcmVhay5lbmQubGluZSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlSW5jbHVkaW5nTGluZUJyZWFrLmVuZC5jaGFyYWN0ZXIsIDI5KTtcblxuXHR9KTtcblxuXHR0ZXN0KCdvZmZzZXRBdCcsICgpID0+IHtcblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAwLCAwKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAxLCAxKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAxNiwgMTYpO1xuXHRcdGFzc2VydE9mZnNldEF0KDEsIDAsIDE3KTtcblx0XHRhc3NlcnRPZmZzZXRBdCgxLCAzLCAyMCk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMiwgMCwgNDUpO1xuXHRcdGFzc2VydE9mZnNldEF0KDQsIDI5LCA5NSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoNCwgMzAsIDk1KTtcblx0XHRhc3NlcnRPZmZzZXRBdCg0LCBOdW1iZXIuTUFYX1ZBTFVFLCA5NSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoNSwgMjksIDk1KTtcblx0XHRhc3NlcnRPZmZzZXRBdChOdW1iZXIuTUFYX1ZBTFVFLCAyOSwgOTUpO1xuXHRcdGFzc2VydE9mZnNldEF0KE51bWJlci5NQVhfVkFMVUUsIE51bWJlci5NQVhfVkFMVUUsIDk1KTtcblx0fSk7XG5cblx0dGVzdCgnb2Zmc2V0QXQsIGFmdGVyIHJlbW92ZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRhdGEub25FdmVudHMoe1xuXHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMywgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA2IH0sXG5cdFx0XHRcdHJhbmdlT2Zmc2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRyYW5nZUxlbmd0aDogdW5kZWZpbmVkISxcblx0XHRcdFx0dGV4dDogJydcblx0XHRcdH1dLFxuXHRcdFx0ZW9sOiB1bmRlZmluZWQhLFxuXHRcdFx0dmVyc2lvbklkOiB1bmRlZmluZWQhLFxuXHRcdFx0aXNSZWRvaW5nOiBmYWxzZSxcblx0XHRcdGlzVW5kb2luZzogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAxLCAxKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAxMywgMTMpO1xuXHRcdGFzc2VydE9mZnNldEF0KDEsIDAsIDE0KTtcblx0fSk7XG5cblx0dGVzdCgnb2Zmc2V0QXQsIGFmdGVyIHJlcGxhY2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkYXRhLm9uRXZlbnRzKHtcblx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogNiB9LFxuXHRcdFx0XHRyYW5nZU9mZnNldDogdW5kZWZpbmVkISxcblx0XHRcdFx0cmFuZ2VMZW5ndGg6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHRleHQ6ICdpcyBjb3VsZCBiZSdcblx0XHRcdH1dLFxuXHRcdFx0ZW9sOiB1bmRlZmluZWQhLFxuXHRcdFx0dmVyc2lvbklkOiB1bmRlZmluZWQhLFxuXHRcdFx0aXNSZWRvaW5nOiBmYWxzZSxcblx0XHRcdGlzVW5kb2luZzogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAxLCAxKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAyNCwgMjQpO1xuXHRcdGFzc2VydE9mZnNldEF0KDEsIDAsIDI1KTtcblx0fSk7XG5cblx0dGVzdCgnb2Zmc2V0QXQsIGFmdGVyIGluc2VydCBsaW5lJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGF0YS5vbkV2ZW50cyh7XG5cdFx0XHRjaGFuZ2VzOiBbe1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDYgfSxcblx0XHRcdFx0cmFuZ2VPZmZzZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHJhbmdlTGVuZ3RoOiB1bmRlZmluZWQhLFxuXHRcdFx0XHR0ZXh0OiAnaXMgY291bGQgYmVcXG5hIGxpbmUgd2l0aCBudW1iZXInXG5cdFx0XHR9XSxcblx0XHRcdGVvbDogdW5kZWZpbmVkISxcblx0XHRcdHZlcnNpb25JZDogdW5kZWZpbmVkISxcblx0XHRcdGlzUmVkb2luZzogZmFsc2UsXG5cdFx0XHRpc1VuZG9pbmc6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMSwgMSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMCwgMTMsIDEzKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgxLCAwLCAxNCk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMSwgMTgsIDEzICsgMSArIDE4KTtcblx0XHRhc3NlcnRPZmZzZXRBdCgxLCAyOSwgMTMgKyAxICsgMjkpO1xuXHRcdGFzc2VydE9mZnNldEF0KDIsIDAsIDEzICsgMSArIDI5ICsgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29mZnNldEF0LCBhZnRlciByZW1vdmUgbGluZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRhdGEub25FdmVudHMoe1xuXHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMywgZW5kTGluZU51bWJlcjogMiwgZW5kQ29sdW1uOiA2IH0sXG5cdFx0XHRcdHJhbmdlT2Zmc2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRyYW5nZUxlbmd0aDogdW5kZWZpbmVkISxcblx0XHRcdFx0dGV4dDogJydcblx0XHRcdH1dLFxuXHRcdFx0ZW9sOiB1bmRlZmluZWQhLFxuXHRcdFx0dmVyc2lvbklkOiB1bmRlZmluZWQhLFxuXHRcdFx0aXNSZWRvaW5nOiBmYWxzZSxcblx0XHRcdGlzVW5kb2luZzogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAxLCAxKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgwLCAyLCAyKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgxLCAwLCAyNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bvc2l0aW9uQXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCgwLCAwLCAwKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KE51bWJlci5NSU5fVkFMVUUsIDAsIDApO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoMSwgMCwgMSk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCgxNiwgMCwgMTYpO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoMTcsIDEsIDApO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoMjAsIDEsIDMpO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoNDUsIDIsIDApO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoOTUsIDMsIDI5KTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDk2LCAzLCAyOSk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCg5OSwgMywgMjkpO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoTnVtYmVyLk1BWF9WQUxVRSwgMywgMjkpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRXb3JkUmFuZ2VBdFBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdGRhdGEgPSBuZXcgRXh0SG9zdERvY3VtZW50RGF0YSh1bmRlZmluZWQhLCBVUkkuZmlsZSgnJyksIFtcblx0XHRcdCdhYWFhIGJiYmIrY2NjYyBhYmMnXG5cdFx0XSwgJ1xcbicsIDEsICd0ZXh0JywgZmFsc2UsICd1dGY4Jyk7XG5cblx0XHRsZXQgcmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDIpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5jaGFyYWN0ZXIsIDQpO1xuXG5cdFx0Ly8gaWdub3JlIGJhZCByZWd1bGFyIGV4cHJlc3NvbiAvLiovXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDIpLCAvLiovKSEpO1xuXG5cdFx0cmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDUpLCAvW2EteitdKy8pITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmNoYXJhY3RlciwgMTQpO1xuXG5cdFx0cmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDE3KSwgL1thLXorXSsvKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDE1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQuY2hhcmFjdGVyLCAxOCk7XG5cblx0XHRyYW5nZSA9IGRhdGEuZG9jdW1lbnQuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMCwgMTEpLCAveXkvKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRXb3JkUmFuZ2VBdFBvc2l0aW9uIGRvZXNuXFwndCBxdWl0ZSB1c2UgdGhlIHJlZ2V4IGFzIGV4cGVjdGVkLCAjMjkxMDInLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZGF0YSA9IG5ldyBFeHRIb3N0RG9jdW1lbnREYXRhKHVuZGVmaW5lZCEsIFVSSS5maWxlKCcnKSwgW1xuXHRcdFx0J3NvbWUgdGV4dCBoZXJlJyxcblx0XHRcdCcvKiogZm9vIGJhciAqLycsXG5cdFx0XHQnZnVuY3Rpb24oKSB7Jyxcblx0XHRcdCdcdFwiZmFyIGJvb1wiJyxcblx0XHRcdCd9J1xuXHRcdF0sICdcXG4nLCAxLCAndGV4dCcsIGZhbHNlLCAndXRmOCcpO1xuXG5cdFx0bGV0IHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCAwKSwgL1xcL1xcKi4rXFwqXFwvLyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLCB1bmRlZmluZWQpO1xuXG5cdFx0cmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDApLCAvXFwvXFwqLitcXCpcXC8vKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmxpbmUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQubGluZSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5jaGFyYWN0ZXIsIDE0KTtcblxuXHRcdHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigzLCAwKSwgLyhcInwnKS4qXFwxLyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLCB1bmRlZmluZWQpO1xuXG5cdFx0cmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDMsIDEpLCAvKFwifCcpLipcXDEvKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmxpbmUsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5lbmQubGluZSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5jaGFyYWN0ZXIsIDEwKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdnZXRXb3JkUmFuZ2VBdFBvc2l0aW9uIGNhbiBmcmVlemUgdGhlIGV4dGVuc2lvbiBob3N0ICM5NTMxOScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHJlZ2V4ID0gLyhodHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvKChbXlxcc10rKVxcLyhbXlxcc10rKSlcXC8oW15cXHNdK1xcLyk/KGlzc3Vlc3xwdWxsKVxcLyhbMC05XSspKXwoKFteXFxzXSspXFwvKFteXFxzXSspKT8jKFsxLTldWzAtOV0qKSgkfFtcXHNcXDpcXDtcXC1cXChcXD1dKS87XG5cblx0XHRkYXRhID0gbmV3IEV4dEhvc3REb2N1bWVudERhdGEodW5kZWZpbmVkISwgVVJJLmZpbGUoJycpLCBbXG5cdFx0XHRwZXJmRGF0YS5fJF8kX2V4cGVuc2l2ZVxuXHRcdF0sICdcXG4nLCAxLCAndGV4dCcsIGZhbHNlLCAndXRmOCcpO1xuXG5cdFx0Ly8gdGhpcyB0ZXN0IG9ubHkgZW5zdXJlcyB0aGF0IHdlIGV2ZW50dWFsbHkgZ2l2ZSBhbmQgdGltZW91dCAod2hlbiBzZWFyY2hpbmcgXCJmdW5ueVwiIHdvcmRzIGFuZCBsb25nIGxpbmVzKVxuXHRcdC8vIGZvciB0aGUgc2FrZSBvZiBzcGVlZHkgdGVzdHMgd2UgbG93ZXIgdGhlIHRpbWVCdWRnZXQgaGVyZVxuXHRcdGNvbnN0IGNvbmZpZyA9IHNldERlZmF1bHRHZXRXb3JkQXRUZXh0Q29uZmlnKHsgbWF4TGVuOiAxMDAwLCB3aW5kb3dTaXplOiAxNSwgdGltZUJ1ZGdldDogMzAgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCByYW5nZSA9IGRhdGEuZG9jdW1lbnQuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMCwgMV8xNzdfMTcwKSwgcmVnZXgpITtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKDAsIDExNzcxNzApO1xuXHRcdFx0cmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24ocG9zKSE7XG5cdFx0XHRhc3NlcnQub2socmFuZ2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJhbmdlLmNvbnRhaW5zKHBvcykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuZG9jdW1lbnQuZ2V0VGV4dChyYW5nZSksICdUYXNrRGVmaW5pdGlvbicpO1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdSZW5hbWUgcG9wdXAgc29tZXRpbWVzIHBvcHVsYXRlcyB3aXRoIHRleHQgb24gdGhlIGxlZnQgc2lkZSBvbWl0dGVkICM5NjAxMycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHJlZ2V4ID0gLygtP1xcZCpcXC5cXGRcXHcqKXwoW15cXGBcXH5cXCFcXEBcXCNcXCRcXCVcXF5cXCZcXCpcXChcXClcXC1cXD1cXCtcXFtcXHtcXF1cXH1cXFxcXFx8XFw7XFw6XFwnXFxcIlxcLFxcLlxcPFxcPlxcL1xcP1xcc10rKS9nO1xuXHRcdGNvbnN0IGxpbmUgPSAnaW50IGFiY2RlZmhpamtsbW5vcHF3dnJzdHh5ejsnO1xuXG5cdFx0ZGF0YSA9IG5ldyBFeHRIb3N0RG9jdW1lbnREYXRhKHVuZGVmaW5lZCEsIFVSSS5maWxlKCcnKSwgW1xuXHRcdFx0bGluZVxuXHRcdF0sICdcXG4nLCAxLCAndGV4dCcsIGZhbHNlLCAndXRmOCcpO1xuXG5cdFx0Y29uc3QgcmFuZ2UgPSBkYXRhLmRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDI3KSwgcmVnZXgpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmNoYXJhY3RlciwgMjgpO1xuXHR9KTtcblxuXHR0ZXN0KCdDdXN0b20gc25pcHBldCAkVE1fU0VMRUNURURfVEVYVCBub3Qgc2hvdyBzdWdnZXN0aW9uICMxMDg4OTInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkYXRhID0gbmV3IEV4dEhvc3REb2N1bWVudERhdGEodW5kZWZpbmVkISwgVVJJLmZpbGUoJycpLCBbXG5cdFx0XHRgICAgICAgICA8cD48c3BhbiB4bWw6bGFuZz1cImVuXCI+U2hlbGRvbjwvc3Bhbj4sIHNvcHJhbm5vbWluYXRvIFwiPHNwYW4geG1sOmxhbmc9XCJlblwiPlNoZWxseTwvc3Bhbj4gZGFsbGEgbWFkcmUgZSBkYWxsYSBzb3JlbGxhLCBcdTAwRTggbmF0byBhIDxzcGFuIHhtbDpsYW5nPVwiZW5cIj5HYWx2ZXN0b248L3NwYW4+LCBpbiA8c3BhbiB4bWw6bGFuZz1cImVuXCI+VGV4YXM8L3NwYW4+LCBpbCAyNiBmZWJicmFpbyAxOTgwIGluIHVuIHN1cGVybWVyY2F0by4gXHUwMEM4IHN0YXRvIHVuIGJhbWJpbm8gcHJvZGlnaW8sIGNvbWUgdGVzdGltb25pYXRvIGRhbCBzdW8gcXVvemllbnRlIGQnaW50ZWxsaWdlbnphICgxODcsIGRpIG1vbHRvIHN1cGVyaW9yZSBhbGxhIG5vcm1hKSBlIGRhbGxhIHN1YSByYXBpZGEgY2FycmllcmEgc2NvbGFzdGljYTogc2kgXHUwMEU4IGRpcGxvbWF0byBhbGwnZXRhIGRpIDExIGFubmkgYXBwcm9kYW5kbyBhbGxhIHN0ZXNzYSBldFx1MDBFMCBhbGxhIGZvcm1hemlvbmUgdW5pdmVyc2l0YXJpYSBlIGFsbCdldFx1MDBFMCBkaSAxNiBhbm5pIGhhIG90dGVudXRvIGlsIHN1byBwcmltbyBkb3R0b3JhdG8gZGkgcmljZXJjYS4gQWxsJ2luaXppbyBkZWxsYSBzZXJpZSBlIHBlciBncmFuIHBhcnRlIGRpIGVzc2Egdml2ZSBjb24gaWwgY29pbnF1aWxpbm8gTGVvbmFyZCBuZWxsJ2FwcGFydGFtZW50byA0QSBhbCAyMzExIDxzcGFuIHhtbDpsYW5nPVwiZW5cIj5Ob3J0aCBMb3MgUm9ibGVzIEF2ZW51ZTwvc3Bhbj4gZGkgPHNwYW4geG1sOmxhbmc9XCJlblwiPlBhc2FkZW5hPC9zcGFuPiwgcGVyIHBvaSB0cmFzZmVyaXJzaSBuZWxsJ2FwcGFydGFtZW50byBkaSA8c3BhbiB4bWw6bGFuZz1cImVuXCI+UGVubnk8L3NwYW4+IGNvbiA8c3BhbiB4bWw6bGFuZz1cImVuXCI+QW15PC9zcGFuPiBuZWxsYSBkZWNpbWEgc3RhZ2lvbmUuIENvbWUgcGlcdTAwRjkgdm9sdGUgYWZmZXJtYSBsdWkgc3Rlc3NvIHBvc3NpZWRlIHVuYSBtZW1vcmlhIGVpZGV0aWNhIGUgdW4gb3JlY2NoaW8gYXNzb2x1dG8uIFx1MDBDOCBzdGF0byBlZHVjYXRvIGRhIHVuYSBtYWRyZSBlc3RyZW1hbWVudGUgcmVsaWdpb3NhIGUsIGluIHBpXHUwMEY5IG9jY2FzaW9uaSwgcXVlc3RvIGFzcGV0dG8gY29udHJhc3RhIGNvbiBpbCByaWdvcmUgc2NpZW50aWZpY28gZGkgPHNwYW4geG1sOmxhbmc9XCJlblwiPlNoZWxkb248L3NwYW4+OyB0dXR0YXZpYSBsYSBkb25uYSBzZW1icmEgZXNzZXJlIGwndW5pY2EgcGVyc29uYSBpbiBncmFkbyBkaSBjb21hbmRhcmxvIGEgYmFjY2hldHRhLjwvcD5gXG5cdFx0XSwgJ1xcbicsIDEsICd0ZXh0JywgZmFsc2UsICd1dGY4Jyk7XG5cblx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24oMCwgNTUpO1xuXHRcdGNvbnN0IHJhbmdlID0gZGF0YS5kb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKHBvcykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDQ3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmNoYXJhY3RlciwgNjEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmRvY3VtZW50LmdldFRleHQocmFuZ2UpLCAnc29wcmFubm9taW5hdG8nKTtcblx0fSk7XG59KTtcblxuZW51bSBBc3NlcnREb2N1bWVudExpbmVNYXBwaW5nRGlyZWN0aW9uIHtcblx0T2Zmc2V0VG9Qb3NpdGlvbixcblx0UG9zaXRpb25Ub09mZnNldFxufVxuXG5zdWl0ZSgnRXh0SG9zdERvY3VtZW50RGF0YSB1cGRhdGVzIGxpbmUgbWFwcGluZycsICgpID0+IHtcblxuXHRmdW5jdGlvbiBwb3NpdGlvblRvU3RyKHBvc2l0aW9uOiB7IGxpbmU6IG51bWJlcjsgY2hhcmFjdGVyOiBudW1iZXIgfSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcoJyArIHBvc2l0aW9uLmxpbmUgKyAnLCcgKyBwb3NpdGlvbi5jaGFyYWN0ZXIgKyAnKSc7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnREb2N1bWVudExpbmVNYXBwaW5nKGRvYzogRXh0SG9zdERvY3VtZW50RGF0YSwgZGlyZWN0aW9uOiBBc3NlcnREb2N1bWVudExpbmVNYXBwaW5nRGlyZWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgYWxsVGV4dCA9IGRvYy5nZXRUZXh0KCk7XG5cblx0XHRsZXQgbGluZSA9IDAsIGNoYXJhY3RlciA9IDAsIHByZXZpb3VzSXNDYXJyaWFnZVJldHVybiA9IGZhbHNlO1xuXHRcdGZvciAobGV0IG9mZnNldCA9IDA7IG9mZnNldCA8PSBhbGxUZXh0Lmxlbmd0aDsgb2Zmc2V0KyspIHtcblx0XHRcdC8vIFRoZSBwb3NpdGlvbiBjb29yZGluYXRlIHN5c3RlbSBjYW5ub3QgZXhwcmVzcyB0aGUgcG9zaXRpb24gYmV0d2VlbiBcXHIgYW5kIFxcblxuXHRcdFx0Y29uc3QgcG9zaXRpb246IFBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGxpbmUsIGNoYXJhY3RlciArIChwcmV2aW91c0lzQ2FycmlhZ2VSZXR1cm4gPyAtMSA6IDApKTtcblxuXHRcdFx0aWYgKGRpcmVjdGlvbiA9PT0gQXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZ0RpcmVjdGlvbi5PZmZzZXRUb1Bvc2l0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbFBvc2l0aW9uID0gZG9jLmRvY3VtZW50LnBvc2l0aW9uQXQob2Zmc2V0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvc2l0aW9uVG9TdHIoYWN0dWFsUG9zaXRpb24pLCBwb3NpdGlvblRvU3RyKHBvc2l0aW9uKSwgJ3Bvc2l0aW9uQXQgbWlzbWF0Y2ggZm9yIG9mZnNldCAnICsgb2Zmc2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRoZSBwb3NpdGlvbiBjb29yZGluYXRlIHN5c3RlbSBjYW5ub3QgZXhwcmVzcyB0aGUgcG9zaXRpb24gYmV0d2VlbiBcXHIgYW5kIFxcblxuXHRcdFx0XHRjb25zdCBleHBlY3RlZE9mZnNldDogbnVtYmVyID0gb2Zmc2V0ICsgKHByZXZpb3VzSXNDYXJyaWFnZVJldHVybiA/IC0xIDogMCk7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbE9mZnNldCA9IGRvYy5kb2N1bWVudC5vZmZzZXRBdChwb3NpdGlvbik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxPZmZzZXQsIGV4cGVjdGVkT2Zmc2V0LCAnb2Zmc2V0QXQgbWlzbWF0Y2ggZm9yIHBvc2l0aW9uICcgKyBwb3NpdGlvblRvU3RyKHBvc2l0aW9uKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhbGxUZXh0LmNoYXJBdChvZmZzZXQpID09PSAnXFxuJykge1xuXHRcdFx0XHRsaW5lKys7XG5cdFx0XHRcdGNoYXJhY3RlciA9IDA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjaGFyYWN0ZXIrKztcblx0XHRcdH1cblxuXHRcdFx0cHJldmlvdXNJc0NhcnJpYWdlUmV0dXJuID0gKGFsbFRleHQuY2hhckF0KG9mZnNldCkgPT09ICdcXHInKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDaGFuZ2VFdmVudChyYW5nZTogUmFuZ2UsIHRleHQ6IHN0cmluZywgZW9sPzogc3RyaW5nKTogSU1vZGVsQ2hhbmdlZEV2ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdFx0XHRyYW5nZU9mZnNldDogdW5kZWZpbmVkISxcblx0XHRcdFx0cmFuZ2VMZW5ndGg6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHRleHQ6IHRleHRcblx0XHRcdH1dLFxuXHRcdFx0ZW9sOiBlb2whLFxuXHRcdFx0dmVyc2lvbklkOiB1bmRlZmluZWQhLFxuXHRcdFx0aXNSZWRvaW5nOiBmYWxzZSxcblx0XHRcdGlzVW5kb2luZzogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRlc3RMaW5lTWFwcGluZ0RpcmVjdGlvbkFmdGVyRXZlbnRzKGxpbmVzOiBzdHJpbmdbXSwgZW9sOiBzdHJpbmcsIGRpcmVjdGlvbjogQXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZ0RpcmVjdGlvbiwgZTogSU1vZGVsQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgbXlEb2N1bWVudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnREYXRhKHVuZGVmaW5lZCEsIFVSSS5maWxlKCcnKSwgbGluZXMuc2xpY2UoMCksIGVvbCwgMSwgJ3RleHQnLCBmYWxzZSwgJ3V0ZjgnKTtcblx0XHRhc3NlcnREb2N1bWVudExpbmVNYXBwaW5nKG15RG9jdW1lbnQsIGRpcmVjdGlvbik7XG5cblx0XHRteURvY3VtZW50Lm9uRXZlbnRzKGUpO1xuXHRcdGFzc2VydERvY3VtZW50TGluZU1hcHBpbmcobXlEb2N1bWVudCwgZGlyZWN0aW9uKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRlc3RMaW5lTWFwcGluZ0FmdGVyRXZlbnRzKGxpbmVzOiBzdHJpbmdbXSwgZTogSU1vZGVsQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0dGVzdExpbmVNYXBwaW5nRGlyZWN0aW9uQWZ0ZXJFdmVudHMobGluZXMsICdcXG4nLCBBc3NlcnREb2N1bWVudExpbmVNYXBwaW5nRGlyZWN0aW9uLlBvc2l0aW9uVG9PZmZzZXQsIGUpO1xuXHRcdHRlc3RMaW5lTWFwcGluZ0RpcmVjdGlvbkFmdGVyRXZlbnRzKGxpbmVzLCAnXFxuJywgQXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZ0RpcmVjdGlvbi5PZmZzZXRUb1Bvc2l0aW9uLCBlKTtcblxuXHRcdHRlc3RMaW5lTWFwcGluZ0RpcmVjdGlvbkFmdGVyRXZlbnRzKGxpbmVzLCAnXFxyXFxuJywgQXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZ0RpcmVjdGlvbi5Qb3NpdGlvblRvT2Zmc2V0LCBlKTtcblx0XHR0ZXN0TGluZU1hcHBpbmdEaXJlY3Rpb25BZnRlckV2ZW50cyhsaW5lcywgJ1xcclxcbicsIEFzc2VydERvY3VtZW50TGluZU1hcHBpbmdEaXJlY3Rpb24uT2Zmc2V0VG9Qb3NpdGlvbiwgZSk7XG5cdH1cblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdsaW5lIG1hcHBpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVNYXBwaW5nQWZ0ZXJFdmVudHMoW1xuXHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLFxuXHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsXG5cdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLFxuXHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJyxcblx0XHRdLCB7IGNoYW5nZXM6IFtdLCBlb2w6IHVuZGVmaW5lZCEsIHZlcnNpb25JZDogNywgaXNSZWRvaW5nOiBmYWxzZSwgaXNVbmRvaW5nOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnYWZ0ZXIgcmVtb3ZlJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lTWFwcGluZ0FmdGVyRXZlbnRzKFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJyxcblx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLFxuXHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJyxcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsXG5cdFx0XSwgY3JlYXRlQ2hhbmdlRXZlbnQobmV3IFJhbmdlKDEsIDMsIDEsIDYpLCAnJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciByZXBsYWNlJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lTWFwcGluZ0FmdGVyRXZlbnRzKFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJyxcblx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLFxuXHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJyxcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsXG5cdFx0XSwgY3JlYXRlQ2hhbmdlRXZlbnQobmV3IFJhbmdlKDEsIDMsIDEsIDYpLCAnaXMgY291bGQgYmUnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FmdGVyIGluc2VydCBsaW5lJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lTWFwcGluZ0FmdGVyRXZlbnRzKFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJyxcblx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLFxuXHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJyxcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsXG5cdFx0XSwgY3JlYXRlQ2hhbmdlRXZlbnQobmV3IFJhbmdlKDEsIDMsIDEsIDYpLCAnaXMgY291bGQgYmVcXG5hIGxpbmUgd2l0aCBudW1iZXInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FmdGVyIGluc2VydCB0d28gbGluZXMnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVNYXBwaW5nQWZ0ZXJFdmVudHMoW1xuXHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLFxuXHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsXG5cdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLFxuXHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJyxcblx0XHRdLCBjcmVhdGVDaGFuZ2VFdmVudChuZXcgUmFuZ2UoMSwgMywgMSwgNiksICdpcyBjb3VsZCBiZVxcbmEgbGluZSB3aXRoIG51bWJlclxcbnlldCBhbm90aGVyIGxpbmUnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FmdGVyIHJlbW92ZSBsaW5lJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lTWFwcGluZ0FmdGVyRXZlbnRzKFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJyxcblx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLFxuXHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJyxcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsXG5cdFx0XSwgY3JlYXRlQ2hhbmdlRXZlbnQobmV3IFJhbmdlKDEsIDMsIDIsIDYpLCAnJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciByZW1vdmUgdHdvIGxpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lTWFwcGluZ0FmdGVyRXZlbnRzKFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJyxcblx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLFxuXHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJyxcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsXG5cdFx0XSwgY3JlYXRlQ2hhbmdlRXZlbnQobmV3IFJhbmdlKDEsIDMsIDMsIDYpLCAnJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciBkZWxldGluZyBlbnRpcmUgY29udGVudCcsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAzLCA0LCAzMCksICcnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FmdGVyIHJlcGxhY2luZyBlbnRpcmUgY29udGVudCcsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAzLCA0LCAzMCksICdzb21lIG5ldyB0ZXh0XFxudGhhdFxcbnNwYW5zIG11bHRpcGxlIGxpbmVzJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlciBjaGFuZ2luZyBFT0wgdG8gQ1JMRicsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgJycsICdcXHJcXG4nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FmdGVyIGNoYW5naW5nIEVPTCB0byBMRicsICgpID0+IHtcblx0XHR0ZXN0TGluZU1hcHBpbmdBZnRlckV2ZW50cyhbXG5cdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsXG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsXG5cdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLFxuXHRcdF0sIGNyZWF0ZUNoYW5nZUV2ZW50KG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgJycsICdcXG4nKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUd0QixTQUFTLFlBQVk7QUFDckIsWUFBWSxjQUFjO0FBQzFCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sdUJBQXVCLE1BQU07QUFFbEMsTUFBSTtBQUVKLFdBQVMsaUJBQWlCLFFBQWdCLE1BQWMsV0FBbUI7QUFDMUUsVUFBTSxXQUFXLEtBQUssU0FBUyxXQUFXLE1BQU07QUFDaEQsV0FBTyxZQUFZLFNBQVMsTUFBTSxJQUFJO0FBQ3RDLFdBQU8sWUFBWSxTQUFTLFdBQVcsU0FBUztBQUFBLEVBQ2pEO0FBRUEsV0FBUyxlQUFlLE1BQWMsV0FBbUIsUUFBZ0I7QUFDeEUsVUFBTSxNQUFNLElBQUksU0FBUyxNQUFNLFNBQVM7QUFDeEMsVUFBTSxTQUFTLEtBQUssU0FBUyxTQUFTLEdBQUc7QUFDekMsV0FBTyxZQUFZLFFBQVEsTUFBTTtBQUFBLEVBQ2xDO0FBRUEsUUFBTSxXQUFZO0FBQ2pCLFdBQU8sSUFBSSxvQkFBb0IsUUFBWSxJQUFJLEtBQUssRUFBRSxHQUFHO0FBQUEsTUFDeEQ7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLElBQ0QsR0FBRyxNQUFNLEdBQUcsUUFBUSxPQUFPLE1BQU07QUFBQSxFQUNsQyxDQUFDO0FBRUQsMENBQXdDO0FBRXhDLE9BQUssaUJBQWlCLE1BQU07QUFFM0IsV0FBTyxPQUFPLE1BQU8sS0FBYSxTQUFTLE1BQU0sSUFBSTtBQUVyRCxXQUFPLE9BQU8sTUFBTyxLQUFhLFNBQVMsV0FBVyxTQUFTO0FBRS9ELFdBQU8sT0FBTyxNQUFPLEtBQWEsU0FBUyxVQUFVLEtBQUs7QUFFMUQsV0FBTyxPQUFPLE1BQU8sS0FBYSxTQUFTLGFBQWEsS0FBSztBQUU3RCxXQUFPLE9BQU8sTUFBTyxLQUFhLFNBQVMsYUFBYSxNQUFNO0FBRTlELFdBQU8sT0FBTyxNQUFPLEtBQWEsU0FBUyxZQUFZLENBQUM7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyx1QkFBdUIsV0FBWTtBQUN2QyxRQUFJO0FBQ0osVUFBTUEsUUFBTyxJQUFJLG9CQUFvQixJQUFJLGNBQWMsS0FBK0IsRUFBRTtBQUFBLE1BQzlFLGlCQUFpQixLQUFVO0FBQ25DLGVBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsZ0JBQVE7QUFDUixlQUFPLFFBQVEsUUFBUSxJQUFJO0FBQUEsTUFDNUI7QUFBQSxJQUNELEtBQUcsSUFBSSxNQUFNLFNBQVMsR0FBRyxDQUFDLEdBQUcsTUFBTSxHQUFHLFFBQVEsTUFBTSxNQUFNO0FBRTFELFdBQU9BLE1BQUssU0FBUyxLQUFLLEVBQUUsS0FBSyxNQUFNO0FBQ3RDLGFBQU8sWUFBWSxNQUFNLFNBQVMsR0FBRyxTQUFTO0FBRTlDLE1BQUFBLE1BQUssUUFBUTtBQUViLGFBQU9BLE1BQUssU0FBUyxLQUFLLEVBQUUsS0FBSyxNQUFNO0FBQ3RDLGVBQU8sR0FBRyxPQUFPLGtCQUFrQjtBQUFBLE1BQ3BDLEdBQUcsU0FBTztBQUNULGVBQU8sR0FBRyxHQUFHO0FBQUEsTUFDZCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1QkFBdUIsV0FBWTtBQUN2QyxTQUFLLFFBQVE7QUFFYixVQUFNLEVBQUUsU0FBUyxJQUFJO0FBQ3JCLFdBQU8sWUFBWSxTQUFTLFdBQVcsQ0FBQztBQUN4QyxXQUFPLFlBQVksU0FBUyxPQUFPLENBQUMsRUFBRSxNQUFNLGtCQUFrQjtBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLFNBQVMsTUFBTTtBQUVuQixXQUFPLFlBQVksS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUU3QyxXQUFPLE9BQU8sTUFBTSxLQUFLLFNBQVMsT0FBTyxFQUFFLENBQUM7QUFDNUMsV0FBTyxPQUFPLE1BQU0sS0FBSyxTQUFTLE9BQU8sS0FBSyxTQUFTLFNBQVMsQ0FBQztBQUNqRSxXQUFPLE9BQU8sTUFBTSxLQUFLLFNBQVMsT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUMxRCxXQUFPLE9BQU8sTUFBTSxLQUFLLFNBQVMsT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUMxRCxXQUFPLE9BQU8sTUFBTSxLQUFLLFNBQVMsT0FBTyxHQUFHLENBQUM7QUFFN0MsUUFBSSxPQUFPLEtBQUssU0FBUyxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLEtBQUssWUFBWSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxLQUFLLEtBQUssUUFBUSxFQUFFO0FBQ3ZDLFdBQU8sWUFBWSxLQUFLLE1BQU0sa0JBQWtCO0FBQ2hELFdBQU8sWUFBWSxLQUFLLHFCQUFxQixLQUFLO0FBQ2xELFdBQU8sWUFBWSxLQUFLLGtDQUFrQyxDQUFDO0FBRTNELFNBQUssU0FBUztBQUFBLE1BQ2IsU0FBUyxDQUFDO0FBQUEsUUFDVCxPQUFPLEVBQUUsaUJBQWlCLEdBQUcsYUFBYSxHQUFHLGVBQWUsR0FBRyxXQUFXLEVBQUU7QUFBQSxRQUM1RSxhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixNQUFNO0FBQUEsTUFDUCxDQUFDO0FBQUEsTUFDRCxLQUFLO0FBQUEsTUFDTCxXQUFXO0FBQUEsTUFDWCxXQUFXO0FBQUEsTUFDWCxXQUFXO0FBQUEsSUFDWixDQUFDO0FBR0QsV0FBTyxZQUFZLEtBQUssTUFBTSxrQkFBa0I7QUFDaEQsV0FBTyxZQUFZLEtBQUssa0NBQWtDLENBQUM7QUFHM0QsV0FBTyxLQUFLLFNBQVMsT0FBTyxDQUFDO0FBQzdCLFdBQU8sWUFBWSxLQUFLLE1BQU0sb0JBQXFCO0FBQ25ELFdBQU8sWUFBWSxLQUFLLGtDQUFrQyxDQUFDO0FBQUEsRUFDNUQsQ0FBQztBQUVELE9BQUsscUJBQXFCLFdBQVk7QUFFckMsUUFBSSxPQUFPLEtBQUssU0FBUyxPQUFPLENBQUM7QUFDakMsUUFBSSxFQUFFLE9BQU8sd0JBQXdCLElBQUk7QUFDekMsV0FBTyxZQUFZLE1BQU0sSUFBSSxNQUFNLENBQUM7QUFDcEMsV0FBTyxZQUFZLE1BQU0sSUFBSSxXQUFXLEVBQUU7QUFDMUMsV0FBTyxZQUFZLHdCQUF3QixJQUFJLE1BQU0sQ0FBQztBQUN0RCxXQUFPLFlBQVksd0JBQXdCLElBQUksV0FBVyxDQUFDO0FBRTNELFdBQU8sS0FBSyxTQUFTLE9BQU8sS0FBSyxTQUFTLFlBQVksQ0FBQztBQUN2RCxZQUFRLEtBQUs7QUFDYiw4QkFBMEIsS0FBSztBQUMvQixXQUFPLFlBQVksTUFBTSxJQUFJLE1BQU0sQ0FBQztBQUNwQyxXQUFPLFlBQVksTUFBTSxJQUFJLFdBQVcsRUFBRTtBQUMxQyxXQUFPLFlBQVksd0JBQXdCLElBQUksTUFBTSxDQUFDO0FBQ3RELFdBQU8sWUFBWSx3QkFBd0IsSUFBSSxXQUFXLEVBQUU7QUFBQSxFQUU3RCxDQUFDO0FBRUQsT0FBSyxZQUFZLE1BQU07QUFDdEIsbUJBQWUsR0FBRyxHQUFHLENBQUM7QUFDdEIsbUJBQWUsR0FBRyxHQUFHLENBQUM7QUFDdEIsbUJBQWUsR0FBRyxJQUFJLEVBQUU7QUFDeEIsbUJBQWUsR0FBRyxHQUFHLEVBQUU7QUFDdkIsbUJBQWUsR0FBRyxHQUFHLEVBQUU7QUFDdkIsbUJBQWUsR0FBRyxHQUFHLEVBQUU7QUFDdkIsbUJBQWUsR0FBRyxJQUFJLEVBQUU7QUFDeEIsbUJBQWUsR0FBRyxJQUFJLEVBQUU7QUFDeEIsbUJBQWUsR0FBRyxPQUFPLFdBQVcsRUFBRTtBQUN0QyxtQkFBZSxHQUFHLElBQUksRUFBRTtBQUN4QixtQkFBZSxPQUFPLFdBQVcsSUFBSSxFQUFFO0FBQ3ZDLG1CQUFlLE9BQU8sV0FBVyxPQUFPLFdBQVcsRUFBRTtBQUFBLEVBQ3RELENBQUM7QUFFRCxPQUFLLDBCQUEwQixXQUFZO0FBRTFDLFNBQUssU0FBUztBQUFBLE1BQ2IsU0FBUyxDQUFDO0FBQUEsUUFDVCxPQUFPLEVBQUUsaUJBQWlCLEdBQUcsYUFBYSxHQUFHLGVBQWUsR0FBRyxXQUFXLEVBQUU7QUFBQSxRQUM1RSxhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixNQUFNO0FBQUEsTUFDUCxDQUFDO0FBQUEsTUFDRCxLQUFLO0FBQUEsTUFDTCxXQUFXO0FBQUEsTUFDWCxXQUFXO0FBQUEsTUFDWCxXQUFXO0FBQUEsSUFDWixDQUFDO0FBRUQsbUJBQWUsR0FBRyxHQUFHLENBQUM7QUFDdEIsbUJBQWUsR0FBRyxJQUFJLEVBQUU7QUFDeEIsbUJBQWUsR0FBRyxHQUFHLEVBQUU7QUFBQSxFQUN4QixDQUFDO0FBRUQsT0FBSywyQkFBMkIsV0FBWTtBQUUzQyxTQUFLLFNBQVM7QUFBQSxNQUNiLFNBQVMsQ0FBQztBQUFBLFFBQ1QsT0FBTyxFQUFFLGlCQUFpQixHQUFHLGFBQWEsR0FBRyxlQUFlLEdBQUcsV0FBVyxFQUFFO0FBQUEsUUFDNUUsYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2IsTUFBTTtBQUFBLE1BQ1AsQ0FBQztBQUFBLE1BQ0QsS0FBSztBQUFBLE1BQ0wsV0FBVztBQUFBLE1BQ1gsV0FBVztBQUFBLE1BQ1gsV0FBVztBQUFBLElBQ1osQ0FBQztBQUVELG1CQUFlLEdBQUcsR0FBRyxDQUFDO0FBQ3RCLG1CQUFlLEdBQUcsSUFBSSxFQUFFO0FBQ3hCLG1CQUFlLEdBQUcsR0FBRyxFQUFFO0FBQUEsRUFDeEIsQ0FBQztBQUVELE9BQUssK0JBQStCLFdBQVk7QUFFL0MsU0FBSyxTQUFTO0FBQUEsTUFDYixTQUFTLENBQUM7QUFBQSxRQUNULE9BQU8sRUFBRSxpQkFBaUIsR0FBRyxhQUFhLEdBQUcsZUFBZSxHQUFHLFdBQVcsRUFBRTtBQUFBLFFBQzVFLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLE1BQU07QUFBQSxNQUNQLENBQUM7QUFBQSxNQUNELEtBQUs7QUFBQSxNQUNMLFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxJQUNaLENBQUM7QUFFRCxtQkFBZSxHQUFHLEdBQUcsQ0FBQztBQUN0QixtQkFBZSxHQUFHLElBQUksRUFBRTtBQUN4QixtQkFBZSxHQUFHLEdBQUcsRUFBRTtBQUN2QixtQkFBZSxHQUFHLElBQUksS0FBSyxJQUFJLEVBQUU7QUFDakMsbUJBQWUsR0FBRyxJQUFJLEtBQUssSUFBSSxFQUFFO0FBQ2pDLG1CQUFlLEdBQUcsR0FBRyxLQUFLLElBQUksS0FBSyxDQUFDO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssK0JBQStCLFdBQVk7QUFFL0MsU0FBSyxTQUFTO0FBQUEsTUFDYixTQUFTLENBQUM7QUFBQSxRQUNULE9BQU8sRUFBRSxpQkFBaUIsR0FBRyxhQUFhLEdBQUcsZUFBZSxHQUFHLFdBQVcsRUFBRTtBQUFBLFFBQzVFLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLE1BQU07QUFBQSxNQUNQLENBQUM7QUFBQSxNQUNELEtBQUs7QUFBQSxNQUNMLFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxJQUNaLENBQUM7QUFFRCxtQkFBZSxHQUFHLEdBQUcsQ0FBQztBQUN0QixtQkFBZSxHQUFHLEdBQUcsQ0FBQztBQUN0QixtQkFBZSxHQUFHLEdBQUcsRUFBRTtBQUFBLEVBQ3hCLENBQUM7QUFFRCxPQUFLLGNBQWMsTUFBTTtBQUN4QixxQkFBaUIsR0FBRyxHQUFHLENBQUM7QUFDeEIscUJBQWlCLE9BQU8sV0FBVyxHQUFHLENBQUM7QUFDdkMscUJBQWlCLEdBQUcsR0FBRyxDQUFDO0FBQ3hCLHFCQUFpQixJQUFJLEdBQUcsRUFBRTtBQUMxQixxQkFBaUIsSUFBSSxHQUFHLENBQUM7QUFDekIscUJBQWlCLElBQUksR0FBRyxDQUFDO0FBQ3pCLHFCQUFpQixJQUFJLEdBQUcsQ0FBQztBQUN6QixxQkFBaUIsSUFBSSxHQUFHLEVBQUU7QUFDMUIscUJBQWlCLElBQUksR0FBRyxFQUFFO0FBQzFCLHFCQUFpQixJQUFJLEdBQUcsRUFBRTtBQUMxQixxQkFBaUIsT0FBTyxXQUFXLEdBQUcsRUFBRTtBQUFBLEVBQ3pDLENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFdBQU8sSUFBSSxvQkFBb0IsUUFBWSxJQUFJLEtBQUssRUFBRSxHQUFHO0FBQUEsTUFDeEQ7QUFBQSxJQUNELEdBQUcsTUFBTSxHQUFHLFFBQVEsT0FBTyxNQUFNO0FBRWpDLFFBQUksUUFBUSxLQUFLLFNBQVMsdUJBQXVCLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUNuRSxXQUFPLFlBQVksTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUN0QyxXQUFPLFlBQVksTUFBTSxNQUFNLFdBQVcsQ0FBQztBQUMzQyxXQUFPLFlBQVksTUFBTSxJQUFJLE1BQU0sQ0FBQztBQUNwQyxXQUFPLFlBQVksTUFBTSxJQUFJLFdBQVcsQ0FBQztBQUd6QyxXQUFPLE9BQU8sTUFBTSxLQUFLLFNBQVMsdUJBQXVCLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUU7QUFFbkYsWUFBUSxLQUFLLFNBQVMsdUJBQXVCLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxTQUFTO0FBQzFFLFdBQU8sWUFBWSxNQUFNLE1BQU0sTUFBTSxDQUFDO0FBQ3RDLFdBQU8sWUFBWSxNQUFNLE1BQU0sV0FBVyxDQUFDO0FBQzNDLFdBQU8sWUFBWSxNQUFNLElBQUksTUFBTSxDQUFDO0FBQ3BDLFdBQU8sWUFBWSxNQUFNLElBQUksV0FBVyxFQUFFO0FBRTFDLFlBQVEsS0FBSyxTQUFTLHVCQUF1QixJQUFJLFNBQVMsR0FBRyxFQUFFLEdBQUcsU0FBUztBQUMzRSxXQUFPLFlBQVksTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUN0QyxXQUFPLFlBQVksTUFBTSxNQUFNLFdBQVcsRUFBRTtBQUM1QyxXQUFPLFlBQVksTUFBTSxJQUFJLE1BQU0sQ0FBQztBQUNwQyxXQUFPLFlBQVksTUFBTSxJQUFJLFdBQVcsRUFBRTtBQUUxQyxZQUFRLEtBQUssU0FBUyx1QkFBdUIsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLElBQUk7QUFDdEUsV0FBTyxZQUFZLE9BQU8sTUFBUztBQUFBLEVBQ3BDLENBQUM7QUFFRCxPQUFLLDBFQUEyRSxXQUFZO0FBQzNGLFdBQU8sSUFBSSxvQkFBb0IsUUFBWSxJQUFJLEtBQUssRUFBRSxHQUFHO0FBQUEsTUFDeEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLE1BQU0sR0FBRyxRQUFRLE9BQU8sTUFBTTtBQUVqQyxRQUFJLFFBQVEsS0FBSyxTQUFTLHVCQUF1QixJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsWUFBWTtBQUNqRixXQUFPLFlBQVksT0FBTyxNQUFTO0FBRW5DLFlBQVEsS0FBSyxTQUFTLHVCQUF1QixJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsWUFBWTtBQUM3RSxXQUFPLFlBQVksTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUN0QyxXQUFPLFlBQVksTUFBTSxNQUFNLFdBQVcsQ0FBQztBQUMzQyxXQUFPLFlBQVksTUFBTSxJQUFJLE1BQU0sQ0FBQztBQUNwQyxXQUFPLFlBQVksTUFBTSxJQUFJLFdBQVcsRUFBRTtBQUUxQyxZQUFRLEtBQUssU0FBUyx1QkFBdUIsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLFdBQVc7QUFDNUUsV0FBTyxZQUFZLE9BQU8sTUFBUztBQUVuQyxZQUFRLEtBQUssU0FBUyx1QkFBdUIsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLFdBQVc7QUFDNUUsV0FBTyxZQUFZLE1BQU0sTUFBTSxNQUFNLENBQUM7QUFDdEMsV0FBTyxZQUFZLE1BQU0sTUFBTSxXQUFXLENBQUM7QUFDM0MsV0FBTyxZQUFZLE1BQU0sSUFBSSxNQUFNLENBQUM7QUFDcEMsV0FBTyxZQUFZLE1BQU0sSUFBSSxXQUFXLEVBQUU7QUFBQSxFQUMzQyxDQUFDO0FBR0QsT0FBSywrREFBK0QsV0FBWTtBQUUvRSxVQUFNLFFBQVE7QUFFZCxXQUFPLElBQUksb0JBQW9CLFFBQVksSUFBSSxLQUFLLEVBQUUsR0FBRztBQUFBLE1BQ3hELFNBQVM7QUFBQSxJQUNWLEdBQUcsTUFBTSxHQUFHLFFBQVEsT0FBTyxNQUFNO0FBSWpDLFVBQU0sU0FBUyw4QkFBOEIsRUFBRSxRQUFRLEtBQU0sWUFBWSxJQUFJLFlBQVksR0FBRyxDQUFDO0FBQzdGLFFBQUk7QUFDSCxVQUFJLFFBQVEsS0FBSyxTQUFTLHVCQUF1QixJQUFJLFNBQVMsR0FBRyxPQUFTLEdBQUcsS0FBSztBQUNsRixhQUFPLFlBQVksT0FBTyxNQUFTO0FBRW5DLFlBQU0sTUFBTSxJQUFJLFNBQVMsR0FBRyxPQUFPO0FBQ25DLGNBQVEsS0FBSyxTQUFTLHVCQUF1QixHQUFHO0FBQ2hELGFBQU8sR0FBRyxLQUFLO0FBQ2YsYUFBTyxHQUFHLE1BQU0sU0FBUyxHQUFHLENBQUM7QUFDN0IsYUFBTyxZQUFZLEtBQUssU0FBUyxRQUFRLEtBQUssR0FBRyxnQkFBZ0I7QUFBQSxJQUVsRSxVQUFFO0FBQ0QsYUFBTyxRQUFRO0FBQUEsSUFDaEI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhFQUE4RSxXQUFZO0FBRTlGLFVBQU0sUUFBUTtBQUNkLFVBQU0sT0FBTztBQUViLFdBQU8sSUFBSSxvQkFBb0IsUUFBWSxJQUFJLEtBQUssRUFBRSxHQUFHO0FBQUEsTUFDeEQ7QUFBQSxJQUNELEdBQUcsTUFBTSxHQUFHLFFBQVEsT0FBTyxNQUFNO0FBRWpDLFVBQU0sUUFBUSxLQUFLLFNBQVMsdUJBQXVCLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxLQUFLO0FBQzdFLFdBQU8sWUFBWSxNQUFNLE1BQU0sTUFBTSxDQUFDO0FBQ3RDLFdBQU8sWUFBWSxNQUFNLElBQUksTUFBTSxDQUFDO0FBQ3BDLFdBQU8sWUFBWSxNQUFNLE1BQU0sV0FBVyxDQUFDO0FBQzNDLFdBQU8sWUFBWSxNQUFNLElBQUksV0FBVyxFQUFFO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUssZ0VBQWdFLFdBQVk7QUFFaEYsV0FBTyxJQUFJLG9CQUFvQixRQUFZLElBQUksS0FBSyxFQUFFLEdBQUc7QUFBQSxNQUN4RDtBQUFBLElBQ0QsR0FBRyxNQUFNLEdBQUcsUUFBUSxPQUFPLE1BQU07QUFFakMsVUFBTSxNQUFNLElBQUksU0FBUyxHQUFHLEVBQUU7QUFDOUIsVUFBTSxRQUFRLEtBQUssU0FBUyx1QkFBdUIsR0FBRztBQUN0RCxXQUFPLFlBQVksTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUN0QyxXQUFPLFlBQVksTUFBTSxJQUFJLE1BQU0sQ0FBQztBQUNwQyxXQUFPLFlBQVksTUFBTSxNQUFNLFdBQVcsRUFBRTtBQUM1QyxXQUFPLFlBQVksTUFBTSxJQUFJLFdBQVcsRUFBRTtBQUMxQyxXQUFPLFlBQVksS0FBSyxTQUFTLFFBQVEsS0FBSyxHQUFHLGdCQUFnQjtBQUFBLEVBQ2xFLENBQUM7QUFDRixDQUFDO0FBRUQsSUFBSyxxQ0FBTCxrQkFBS0Msd0NBQUw7QUFDQyxFQUFBQSx3RUFBQTtBQUNBLEVBQUFBLHdFQUFBO0FBRkksU0FBQUE7QUFBQSxHQUFBO0FBS0wsTUFBTSw0Q0FBNEMsTUFBTTtBQUV2RCxXQUFTLGNBQWMsVUFBdUQ7QUFDN0UsV0FBTyxNQUFNLFNBQVMsT0FBTyxNQUFNLFNBQVMsWUFBWTtBQUFBLEVBQ3pEO0FBRUEsV0FBUywwQkFBMEIsS0FBMEIsV0FBcUQ7QUFDakgsVUFBTSxVQUFVLElBQUksUUFBUTtBQUU1QixRQUFJLE9BQU8sR0FBRyxZQUFZLEdBQUcsMkJBQTJCO0FBQ3hELGFBQVMsU0FBUyxHQUFHLFVBQVUsUUFBUSxRQUFRLFVBQVU7QUFFeEQsWUFBTSxXQUFxQixJQUFJLFNBQVMsTUFBTSxhQUFhLDJCQUEyQixLQUFLLEVBQUU7QUFFN0YsVUFBSSxjQUFjLDBCQUFxRDtBQUN0RSxjQUFNLGlCQUFpQixJQUFJLFNBQVMsV0FBVyxNQUFNO0FBQ3JELGVBQU8sWUFBWSxjQUFjLGNBQWMsR0FBRyxjQUFjLFFBQVEsR0FBRyxvQ0FBb0MsTUFBTTtBQUFBLE1BQ3RILE9BQU87QUFFTixjQUFNLGlCQUF5QixVQUFVLDJCQUEyQixLQUFLO0FBQ3pFLGNBQU0sZUFBZSxJQUFJLFNBQVMsU0FBUyxRQUFRO0FBQ25ELGVBQU8sWUFBWSxjQUFjLGdCQUFnQixvQ0FBb0MsY0FBYyxRQUFRLENBQUM7QUFBQSxNQUM3RztBQUVBLFVBQUksUUFBUSxPQUFPLE1BQU0sTUFBTSxNQUFNO0FBQ3BDO0FBQ0Esb0JBQVk7QUFBQSxNQUNiLE9BQU87QUFDTjtBQUFBLE1BQ0Q7QUFFQSxpQ0FBNEIsUUFBUSxPQUFPLE1BQU0sTUFBTTtBQUFBLElBQ3hEO0FBQUEsRUFDRDtBQUVBLFdBQVMsa0JBQWtCLE9BQWMsTUFBYyxLQUFrQztBQUN4RixXQUFPO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxRQUNUO0FBQUEsUUFDQSxhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYjtBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxNQUNBLFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxJQUNaO0FBQUEsRUFDRDtBQUVBLFdBQVMsb0NBQW9DLE9BQWlCLEtBQWEsV0FBK0MsR0FBNkI7QUFDdEosVUFBTSxhQUFhLElBQUksb0JBQW9CLFFBQVksSUFBSSxLQUFLLEVBQUUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxHQUFHLEtBQUssR0FBRyxRQUFRLE9BQU8sTUFBTTtBQUNsSCw4QkFBMEIsWUFBWSxTQUFTO0FBRS9DLGVBQVcsU0FBUyxDQUFDO0FBQ3JCLDhCQUEwQixZQUFZLFNBQVM7QUFBQSxFQUNoRDtBQUVBLFdBQVMsMkJBQTJCLE9BQWlCLEdBQTZCO0FBQ2pGLHdDQUFvQyxPQUFPLE1BQU0sMEJBQXFELENBQUM7QUFDdkcsd0NBQW9DLE9BQU8sTUFBTSwwQkFBcUQsQ0FBQztBQUV2Ryx3Q0FBb0MsT0FBTyxRQUFRLDBCQUFxRCxDQUFDO0FBQ3pHLHdDQUFvQyxPQUFPLFFBQVEsMEJBQXFELENBQUM7QUFBQSxFQUMxRztBQUVBLDBDQUF3QztBQUV4QyxPQUFLLGdCQUFnQixNQUFNO0FBQzFCLCtCQUEyQjtBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEVBQUUsU0FBUyxDQUFDLEdBQUcsS0FBSyxRQUFZLFdBQVcsR0FBRyxXQUFXLE9BQU8sV0FBVyxNQUFNLENBQUM7QUFBQSxFQUN0RixDQUFDO0FBRUQsT0FBSyxnQkFBZ0IsTUFBTTtBQUMxQiwrQkFBMkI7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxrQkFBa0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyxpQkFBaUIsTUFBTTtBQUMzQiwrQkFBMkI7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxrQkFBa0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxhQUFhLENBQUM7QUFBQSxFQUMzRCxDQUFDO0FBRUQsT0FBSyxxQkFBcUIsTUFBTTtBQUMvQiwrQkFBMkI7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxrQkFBa0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxpQ0FBaUMsQ0FBQztBQUFBLEVBQy9FLENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBQ3BDLCtCQUEyQjtBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLGtCQUFrQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLG1EQUFtRCxDQUFDO0FBQUEsRUFDakcsQ0FBQztBQUVELE9BQUsscUJBQXFCLE1BQU07QUFDL0IsK0JBQTJCO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsa0JBQWtCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssMEJBQTBCLE1BQU07QUFDcEMsK0JBQTJCO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsa0JBQWtCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0MsK0JBQTJCO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsa0JBQWtCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO0FBQUEsRUFDakQsQ0FBQztBQUVELE9BQUssa0NBQWtDLE1BQU07QUFDNUMsK0JBQTJCO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsa0JBQWtCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsMkNBQTJDLENBQUM7QUFBQSxFQUMxRixDQUFDO0FBRUQsT0FBSyw4QkFBOEIsTUFBTTtBQUN4QywrQkFBMkI7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxrQkFBa0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sQ0FBQztBQUFBLEVBQ3hELENBQUM7QUFFRCxPQUFLLDRCQUE0QixNQUFNO0FBQ3RDLCtCQUEyQjtBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLGtCQUFrQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDO0FBQUEsRUFDdEQsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImRhdGEiLCAiQXNzZXJ0RG9jdW1lbnRMaW5lTWFwcGluZ0RpcmVjdGlvbiJdCn0K
