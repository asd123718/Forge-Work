import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AnnotatedString, AnnotationsUpdate } from "../../../common/model/tokens/annotations.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { StringEdit } from "../../../common/core/edits/stringEdit.js";
function parseVisualAnnotations(visual) {
  const annotations = [];
  let baseString = "";
  let i = 0;
  while (i < visual.length) {
    if (visual[i] === "[") {
      const colonIdx = visual.indexOf(":", i + 1);
      const closeIdx = visual.indexOf("]", colonIdx + 1);
      if (colonIdx === -1 || closeIdx === -1) {
        throw new Error(`Invalid annotation format at position ${i}`);
      }
      const id = visual.substring(i + 1, colonIdx);
      const text = visual.substring(colonIdx + 1, closeIdx);
      const startOffset = baseString.length;
      baseString += text;
      annotations.push({ range: new OffsetRange(startOffset, baseString.length), annotation: id });
      i = closeIdx + 1;
    } else {
      baseString += visual[i];
      i++;
    }
  }
  return { annotations, baseString };
}
function toVisualString(annotations, baseString) {
  if (annotations.length === 0) {
    return baseString;
  }
  const sortedAnnotations = [...annotations].sort((a, b) => a.range.start - b.range.start);
  let result = "";
  let pos = 0;
  for (const ann of sortedAnnotations) {
    result += baseString.substring(pos, ann.range.start);
    const annotatedText = baseString.substring(ann.range.start, ann.range.endExclusive);
    result += `[${ann.annotation}:${annotatedText}]`;
    pos = ann.range.endExclusive;
  }
  result += baseString.substring(pos);
  return result;
}
class VisualAnnotatedString {
  constructor(annotatedString, baseString) {
    this.annotatedString = annotatedString;
    this.baseString = baseString;
  }
  setAnnotations(update) {
    this.annotatedString.setAnnotations(update);
  }
  applyEdit(edit) {
    this.annotatedString.applyEdit(edit);
    this.baseString = edit.apply(this.baseString);
  }
  getAnnotationsIntersecting(range) {
    return this.annotatedString.getAnnotationsIntersecting(range);
  }
  getAllAnnotations() {
    return this.annotatedString.getAllAnnotations();
  }
  clone() {
    return new VisualAnnotatedString(this.annotatedString.clone(), this.baseString);
  }
}
function fromVisual(visual) {
  const { annotations, baseString } = parseVisualAnnotations(visual);
  return new VisualAnnotatedString(new AnnotatedString(annotations), baseString);
}
function toVisual(vas) {
  return toVisualString(vas.getAllAnnotations(), vas.baseString);
}
function parseVisualUpdate(visual) {
  const updates = [];
  let baseString = "";
  let i = 0;
  while (i < visual.length) {
    if (visual[i] === "[") {
      const colonIdx = visual.indexOf(":", i + 1);
      const closeIdx = visual.indexOf("]", colonIdx + 1);
      if (colonIdx === -1 || closeIdx === -1) {
        throw new Error(`Invalid annotation format at position ${i}`);
      }
      const id = visual.substring(i + 1, colonIdx);
      const text = visual.substring(colonIdx + 1, closeIdx);
      const startOffset = baseString.length;
      baseString += text;
      updates.push({ range: new OffsetRange(startOffset, baseString.length), annotation: id });
      i = closeIdx + 1;
    } else if (visual[i] === "<") {
      const colonIdx = visual.indexOf(":", i + 1);
      const closeIdx = visual.indexOf(">", colonIdx + 1);
      if (colonIdx === -1 || closeIdx === -1) {
        throw new Error(`Invalid delete format at position ${i}`);
      }
      const text = visual.substring(colonIdx + 1, closeIdx);
      const startOffset = baseString.length;
      baseString += text;
      updates.push({ range: new OffsetRange(startOffset, baseString.length), annotation: void 0 });
      i = closeIdx + 1;
    } else {
      baseString += visual[i];
      i++;
    }
  }
  return { updates, baseString };
}
function updateFromVisual(...visuals) {
  const updates = [];
  for (const visual of visuals) {
    const { updates: parsedUpdates } = parseVisualUpdate(visual);
    updates.push(...parsedUpdates);
  }
  return AnnotationsUpdate.create(updates);
}
function editDelete(start, end) {
  return StringEdit.replace(new OffsetRange(start, end), "");
}
function editInsert(pos, text) {
  return StringEdit.insert(pos, text);
}
function editReplace(start, end, text) {
  return StringEdit.replace(new OffsetRange(start, end), text);
}
function assertVisual(vas, expectedVisual) {
  const actual = toVisual(vas);
  const { annotations: expectedAnnotations } = parseVisualAnnotations(expectedVisual);
  const actualAnnotations = vas.getAllAnnotations();
  if (actualAnnotations.length !== expectedAnnotations.length) {
    assert.fail(
      `Annotation count mismatch.
  Expected: ${expectedVisual}
  Actual:   ${actual}
  Expected ${expectedAnnotations.length} annotations, got ${actualAnnotations.length}`
    );
  }
  for (let i = 0; i < actualAnnotations.length; i++) {
    const expected = expectedAnnotations[i];
    const actualAnn = actualAnnotations[i];
    if (actualAnn.range.start !== expected.range.start || actualAnn.range.endExclusive !== expected.range.endExclusive) {
      assert.fail(
        `Annotation ${i} range mismatch.
  Expected: (${expected.range.start}, ${expected.range.endExclusive})
  Actual:   (${actualAnn.range.start}, ${actualAnn.range.endExclusive})
  Expected visual: ${expectedVisual}
  Actual visual:   ${actual}`
      );
    }
    if (actualAnn.annotation !== expected.annotation) {
      assert.fail(
        `Annotation ${i} value mismatch.
  Expected: "${expected.annotation}"
  Actual:   "${actualAnn.annotation}"`
      );
    }
  }
}
function visualizeEdit(beforeAnnotations, edit) {
  const vas = fromVisual(beforeAnnotations);
  const before = toVisual(vas);
  vas.applyEdit(edit);
  const after = toVisual(vas);
  return { before, after };
}
suite("Annotations Suite", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("setAnnotations 1", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    vas.setAnnotations(updateFromVisual("[4:Lorem i]"));
    assertVisual(vas, "[4:Lorem i]psum [2:dolor] sit [3:amet]");
    vas.setAnnotations(updateFromVisual("Lorem ip[5:s]"));
    assertVisual(vas, "[4:Lorem i]p[5:s]um [2:dolor] sit [3:amet]");
  });
  test("setAnnotations 2", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    vas.setAnnotations(updateFromVisual(
      "L<_:orem ipsum d>",
      "[4:Lorem ]"
    ));
    assertVisual(vas, "[4:Lorem ]ipsum dolor sit [3:amet]");
    vas.setAnnotations(updateFromVisual(
      "Lorem <_:ipsum dolor sit amet>",
      "[5:Lor]"
    ));
    assertVisual(vas, "[5:Lor]em ipsum dolor sit amet");
    vas.setAnnotations(updateFromVisual("L[6:or]"));
    assertVisual(vas, "L[6:or]em ipsum dolor sit amet");
  });
  test("setAnnotations 3", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    vas.setAnnotations(updateFromVisual("Lore[4:m ipsum dolor ]"));
    assertVisual(vas, "Lore[4:m ipsum dolor ]sit [3:amet]");
    vas.setAnnotations(updateFromVisual("Lorem ipsum dolor sit [5:a]"));
    assertVisual(vas, "Lore[4:m ipsum dolor ]sit [5:a]met");
  });
  test("setAnnotations 4", () => {
    const vas = fromVisual("Lorem ipsum dolor sit amet, consectetur adipiscing el[:it]");
    vas.setAnnotations(updateFromVisual("Lorem ipsum dolor sit amet, consectetur adipiscing el<_:i>t"));
    assertVisual(vas, "Lorem ipsum dolor sit amet, consectetur adipiscing elit");
  });
  test("getAnnotationsIntersecting 1", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    const result1 = vas.getAnnotationsIntersecting(new OffsetRange(0, 13));
    assert.strictEqual(result1.length, 2);
    assert.deepStrictEqual(result1.map((a) => a.annotation), ["1", "2"]);
    const result2 = vas.getAnnotationsIntersecting(new OffsetRange(0, 22));
    assert.strictEqual(result2.length, 3);
    assert.deepStrictEqual(result2.map((a) => a.annotation), ["1", "2", "3"]);
  });
  test("getAnnotationsIntersecting 2", () => {
    const vas = fromVisual("[1:Lorem] [2:i]p[3:s]");
    const result1 = vas.getAnnotationsIntersecting(new OffsetRange(5, 7));
    assert.strictEqual(result1.length, 1);
    assert.deepStrictEqual(result1.map((a) => a.annotation), ["2"]);
    const result2 = vas.getAnnotationsIntersecting(new OffsetRange(5, 9));
    assert.strictEqual(result2.length, 2);
    assert.deepStrictEqual(result2.map((a) => a.annotation), ["2", "3"]);
  });
  test("getAnnotationsIntersecting 3", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor]");
    const result1 = vas.getAnnotationsIntersecting(new OffsetRange(4, 13));
    assert.strictEqual(result1.length, 2);
    assert.deepStrictEqual(result1.map((a) => a.annotation), ["1", "2"]);
    vas.setAnnotations(updateFromVisual("[3:Lore]m[4: ipsu]"));
    assertVisual(vas, "[3:Lore]m[4: ipsu]m [2:dolor]");
    const result2 = vas.getAnnotationsIntersecting(new OffsetRange(7, 13));
    assert.strictEqual(result2.length, 2);
    assert.deepStrictEqual(result2.map((a) => a.annotation), ["4", "2"]);
  });
  test("getAnnotationsIntersecting 4", () => {
    const vas = fromVisual("[1:Lorem ipsum] sit");
    vas.setAnnotations(updateFromVisual("Lorem ipsum [2:sit]"));
    const result = vas.getAnnotationsIntersecting(new OffsetRange(2, 8));
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result.map((a) => a.annotation), ["1"]);
  });
  test("getAnnotationsIntersecting 5", () => {
    const vas = fromVisual("[1:Lorem ipsum] [2:dol] [3:or]");
    const result = vas.getAnnotationsIntersecting(new OffsetRange(1, 16));
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result.map((a) => a.annotation), ["1", "2", "3"]);
  });
  test("getAnnotationsIntersecting 6", () => {
    const vas = fromVisual("[1:Lorem ][2:ip][3:sum]");
    const result = vas.getAnnotationsIntersecting(new OffsetRange(6, 6));
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result.map((a) => a.annotation), ["2"]);
  });
  test("applyEdit 1 - deletion within annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editDelete(0, 3)
    );
    assert.strictEqual(result.after, "[1:em] ipsum [2:dolor] sit [3:amet]");
  });
  test("applyEdit 2 - deletion and insertion within annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editReplace(1, 3, "XXXXX")
    );
    assert.strictEqual(result.after, "[1:LXXXXXem] ipsum [2:dolor] sit [3:amet]");
  });
  test("applyEdit 3 - deletion across several annotations", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editReplace(4, 22, "XXXXX")
    );
    assert.strictEqual(result.after, "[1:LoreXXXXX][3:amet]");
  });
  test("applyEdit 4 - deletion between annotations", () => {
    const result = visualizeEdit(
      "[1:Lorem ip]sum and [2:dolor] sit [3:amet]",
      editDelete(10, 12)
    );
    assert.strictEqual(result.after, "[1:Lorem ip]suand [2:dolor] sit [3:amet]");
  });
  test("applyEdit 5 - deletion that covers annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editDelete(0, 5)
    );
    assert.strictEqual(result.after, " ipsum [2:dolor] sit [3:amet]");
  });
  test("applyEdit 6 - several edits", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    const edit = StringEdit.compose([
      StringEdit.replace(new OffsetRange(0, 6), ""),
      StringEdit.replace(new OffsetRange(6, 12), ""),
      StringEdit.replace(new OffsetRange(12, 17), "")
    ]);
    vas.applyEdit(edit);
    assertVisual(vas, "ipsum sit [3:am]");
  });
  test("applyEdit 7 - several edits", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    const edit1 = StringEdit.replace(new OffsetRange(0, 3), "XXXX");
    const edit2 = StringEdit.replace(new OffsetRange(0, 2), "");
    vas.applyEdit(edit1.compose(edit2));
    assertVisual(vas, "[1:XXem] ipsum [2:dolor] sit [3:amet]");
  });
  test("applyEdit 9 - insertion at end of annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editInsert(17, "XXX")
    );
    assert.strictEqual(result.after, "[1:Lorem] ipsum [2:dolor]XXX sit [3:amet]");
  });
  test("applyEdit 10 - insertion in middle of annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editInsert(14, "XXX")
    );
    assert.strictEqual(result.after, "[1:Lorem] ipsum [2:doXXXlor] sit [3:amet]");
  });
  test("applyEdit 11 - replacement consuming annotation", () => {
    const result = visualizeEdit(
      "[1:L]o[2:rem] [3:i]",
      editReplace(1, 6, "X")
    );
    assert.strictEqual(result.after, "[1:L]X[3:i]");
  });
  test("applyEdit 12 - multiple disjoint edits", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet!] [4:done]");
    const edit = StringEdit.compose([
      StringEdit.insert(0, "X"),
      StringEdit.delete(new OffsetRange(12, 13)),
      StringEdit.replace(new OffsetRange(21, 22), "YY"),
      StringEdit.replace(new OffsetRange(28, 32), "Z")
    ]);
    vas.applyEdit(edit);
    assertVisual(vas, "X[1:Lorem] ipsum[2:dolor] sitYY[3:amet!]Z[4:e]");
  });
  test("applyEdit 13 - edit on the left border", () => {
    const result = visualizeEdit(
      "lorem ipsum dolor[1: ]",
      editInsert(17, "X")
    );
    assert.strictEqual(result.after, "lorem ipsum dolorX[1: ]");
  });
  test("rebase", () => {
    const a = new VisualAnnotatedString(
      new AnnotatedString([{ range: new OffsetRange(2, 5), annotation: "1" }]),
      "sitamet"
    );
    const b = a.clone();
    const update = AnnotationsUpdate.create([{ range: new OffsetRange(4, 5), annotation: "2" }]);
    b.setAnnotations(update);
    const edit = StringEdit.replace(new OffsetRange(1, 6), "XXX");
    a.applyEdit(edit);
    b.applyEdit(edit);
    update.rebase(edit);
    a.setAnnotations(update);
    assert.deepStrictEqual(a.getAllAnnotations(), b.getAllAnnotations());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGFubm90YXRpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFubm90YXRlZFN0cmluZywgQW5ub3RhdGlvbnNVcGRhdGUsIElBbm5vdGF0aW9uLCBJQW5ub3RhdGlvblVwZGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90b2tlbnMvYW5ub3RhdGlvbnMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgU3RyaW5nRWRpdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBWaXN1YWwgQW5ub3RhdGlvbiBUZXN0IEluZnJhc3RydWN0dXJlXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUaGlzIGluZnJhc3RydWN0dXJlIGFsbG93cyByZXByZXNlbnRpbmcgYW5ub3RhdGlvbnMgdmlzdWFsbHkgdXNpbmcgYnJhY2tldHM6XG4vLyAtICdbaWQ6dGV4dF0nIG1hcmtzIGFuIGFubm90YXRpb24gd2l0aCB0aGUgZ2l2ZW4gaWQgY292ZXJpbmcgJ3RleHQnXG4vLyAtIFBsYWluIHRleHQgcmVwcmVzZW50cyB1bmFubm90YXRlZCBjb250ZW50XG4vL1xuLy8gRXhhbXBsZTogXCJMb3JlbSBbMTppcHN1bV0gZG9sb3IgWzI6c2l0XSBhbWV0XCIgcmVwcmVzZW50czpcbi8vICAgLSBhbm5vdGF0aW9uIFwiMVwiIGF0IG9mZnNldCA2LTExIChjb250ZW50IFwiaXBzdW1cIilcbi8vICAgLSBhbm5vdGF0aW9uIFwiMlwiIGF0IG9mZnNldCAxOC0yMSAoY29udGVudCBcInNpdFwiKVxuLy9cbi8vIEZvciB1cGRhdGVzOlxuLy8gLSAnW2lkOnRleHRdJyBzZXRzIGFuIGFubm90YXRpb25cbi8vIC0gJzxpZDp0ZXh0PicgZGVsZXRlcyBhbiBhbm5vdGF0aW9uIGluIHRoYXQgcmFuZ2Vcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBQYXJzZXMgYSB2aXN1YWwgc3RyaW5nIHJlcHJlc2VudGF0aW9uIGludG8gYW5ub3RhdGlvbnMuXG4gKiBUaGUgdmlzdWFsIHN0cmluZyB1c2VzICdbaWQ6dGV4dF0nIHRvIG1hcmsgYW5ub3RhdGlvbiBib3VuZGFyaWVzLlxuICogVGhlIGlkIGJlY29tZXMgdGhlIGFubm90YXRpb24gdmFsdWUsIGFuZCB0ZXh0IGlzIHRoZSBhbm5vdGF0ZWQgY29udGVudC5cbiAqL1xuZnVuY3Rpb24gcGFyc2VWaXN1YWxBbm5vdGF0aW9ucyh2aXN1YWw6IHN0cmluZyk6IHsgYW5ub3RhdGlvbnM6IElBbm5vdGF0aW9uPHN0cmluZz5bXTsgYmFzZVN0cmluZzogc3RyaW5nIH0ge1xuXHRjb25zdCBhbm5vdGF0aW9uczogSUFubm90YXRpb248c3RyaW5nPltdID0gW107XG5cdGxldCBiYXNlU3RyaW5nID0gJyc7XG5cdGxldCBpID0gMDtcblxuXHR3aGlsZSAoaSA8IHZpc3VhbC5sZW5ndGgpIHtcblx0XHRpZiAodmlzdWFsW2ldID09PSAnWycpIHtcblx0XHRcdC8vIEZpbmQgdGhlIGNvbG9uIGFuZCBjbG9zaW5nIGJyYWNrZXRcblx0XHRcdGNvbnN0IGNvbG9uSWR4ID0gdmlzdWFsLmluZGV4T2YoJzonLCBpICsgMSk7XG5cdFx0XHRjb25zdCBjbG9zZUlkeCA9IHZpc3VhbC5pbmRleE9mKCddJywgY29sb25JZHggKyAxKTtcblx0XHRcdGlmIChjb2xvbklkeCA9PT0gLTEgfHwgY2xvc2VJZHggPT09IC0xKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBhbm5vdGF0aW9uIGZvcm1hdCBhdCBwb3NpdGlvbiAke2l9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpZCA9IHZpc3VhbC5zdWJzdHJpbmcoaSArIDEsIGNvbG9uSWR4KTtcblx0XHRcdGNvbnN0IHRleHQgPSB2aXN1YWwuc3Vic3RyaW5nKGNvbG9uSWR4ICsgMSwgY2xvc2VJZHgpO1xuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSBiYXNlU3RyaW5nLmxlbmd0aDtcblx0XHRcdGJhc2VTdHJpbmcgKz0gdGV4dDtcblx0XHRcdGFubm90YXRpb25zLnB1c2goeyByYW5nZTogbmV3IE9mZnNldFJhbmdlKHN0YXJ0T2Zmc2V0LCBiYXNlU3RyaW5nLmxlbmd0aCksIGFubm90YXRpb246IGlkIH0pO1xuXHRcdFx0aSA9IGNsb3NlSWR4ICsgMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YmFzZVN0cmluZyArPSB2aXN1YWxbaV07XG5cdFx0XHRpKys7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgYW5ub3RhdGlvbnMsIGJhc2VTdHJpbmcgfTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhbm5vdGF0aW9ucyB0byBhIHZpc3VhbCBzdHJpbmcgcmVwcmVzZW50YXRpb24uXG4gKiBVc2VzICdbaWQ6dGV4dF0nIHRvIG1hcmsgYW5ub3RhdGlvbiBib3VuZGFyaWVzLlxuICpcbiAqIEBwYXJhbSBhbm5vdGF0aW9ucyAtIFRoZSBhbm5vdGF0aW9ucyB0byB2aXN1YWxpemVcbiAqIEBwYXJhbSBiYXNlU3RyaW5nIC0gVGhlIGJhc2Ugc3RyaW5nIGNvbnRlbnRcbiAqL1xuZnVuY3Rpb24gdG9WaXN1YWxTdHJpbmcoXG5cdGFubm90YXRpb25zOiBJQW5ub3RhdGlvbjxzdHJpbmc+W10sXG5cdGJhc2VTdHJpbmc6IHN0cmluZ1xuKTogc3RyaW5nIHtcblx0aWYgKGFubm90YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBiYXNlU3RyaW5nO1xuXHR9XG5cblx0Ly8gU29ydCBhbm5vdGF0aW9ucyBieSBzdGFydCBwb3NpdGlvblxuXHRjb25zdCBzb3J0ZWRBbm5vdGF0aW9ucyA9IFsuLi5hbm5vdGF0aW9uc10uc29ydCgoYSwgYikgPT4gYS5yYW5nZS5zdGFydCAtIGIucmFuZ2Uuc3RhcnQpO1xuXG5cdC8vIEJ1aWxkIHRoZSB2aXN1YWwgcmVwcmVzZW50YXRpb25cblx0bGV0IHJlc3VsdCA9ICcnO1xuXHRsZXQgcG9zID0gMDtcblxuXHRmb3IgKGNvbnN0IGFubiBvZiBzb3J0ZWRBbm5vdGF0aW9ucykge1xuXHRcdC8vIEFkZCBwbGFpbiB0ZXh0IGJlZm9yZSB0aGlzIGFubm90YXRpb25cblx0XHRyZXN1bHQgKz0gYmFzZVN0cmluZy5zdWJzdHJpbmcocG9zLCBhbm4ucmFuZ2Uuc3RhcnQpO1xuXHRcdC8vIEFkZCBhbm5vdGF0ZWQgY29udGVudCB3aXRoIGlkXG5cdFx0Y29uc3QgYW5ub3RhdGVkVGV4dCA9IGJhc2VTdHJpbmcuc3Vic3RyaW5nKGFubi5yYW5nZS5zdGFydCwgYW5uLnJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cdFx0cmVzdWx0ICs9IGBbJHthbm4uYW5ub3RhdGlvbn06JHthbm5vdGF0ZWRUZXh0fV1gO1xuXHRcdHBvcyA9IGFubi5yYW5nZS5lbmRFeGNsdXNpdmU7XG5cdH1cblxuXHQvLyBBZGQgcmVtYWluaW5nIHRleHQgYWZ0ZXIgbGFzdCBhbm5vdGF0aW9uXG5cdHJlc3VsdCArPSBiYXNlU3RyaW5nLnN1YnN0cmluZyhwb3MpO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBBbm5vdGF0ZWRTdHJpbmcgd2l0aCBpdHMgYmFzZSBzdHJpbmcgZm9yIHZpc3VhbCB0ZXN0aW5nLlxuICovXG5jbGFzcyBWaXN1YWxBbm5vdGF0ZWRTdHJpbmcge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgYW5ub3RhdGVkU3RyaW5nOiBBbm5vdGF0ZWRTdHJpbmc8c3RyaW5nPixcblx0XHRwdWJsaWMgYmFzZVN0cmluZzogc3RyaW5nXG5cdCkgeyB9XG5cblx0c2V0QW5ub3RhdGlvbnModXBkYXRlOiBBbm5vdGF0aW9uc1VwZGF0ZTxzdHJpbmc+KTogdm9pZCB7XG5cdFx0dGhpcy5hbm5vdGF0ZWRTdHJpbmcuc2V0QW5ub3RhdGlvbnModXBkYXRlKTtcblx0fVxuXG5cdGFwcGx5RWRpdChlZGl0OiBTdHJpbmdFZGl0KTogdm9pZCB7XG5cdFx0dGhpcy5hbm5vdGF0ZWRTdHJpbmcuYXBwbHlFZGl0KGVkaXQpO1xuXHRcdHRoaXMuYmFzZVN0cmluZyA9IGVkaXQuYXBwbHkodGhpcy5iYXNlU3RyaW5nKTtcblx0fVxuXG5cdGdldEFubm90YXRpb25zSW50ZXJzZWN0aW5nKHJhbmdlOiBPZmZzZXRSYW5nZSk6IElBbm5vdGF0aW9uPHN0cmluZz5bXSB7XG5cdFx0cmV0dXJuIHRoaXMuYW5ub3RhdGVkU3RyaW5nLmdldEFubm90YXRpb25zSW50ZXJzZWN0aW5nKHJhbmdlKTtcblx0fVxuXG5cdGdldEFsbEFubm90YXRpb25zKCk6IElBbm5vdGF0aW9uPHN0cmluZz5bXSB7XG5cdFx0cmV0dXJuIHRoaXMuYW5ub3RhdGVkU3RyaW5nLmdldEFsbEFubm90YXRpb25zKCk7XG5cdH1cblxuXHRjbG9uZSgpOiBWaXN1YWxBbm5vdGF0ZWRTdHJpbmcge1xuXHRcdHJldHVybiBuZXcgVmlzdWFsQW5ub3RhdGVkU3RyaW5nKHRoaXMuYW5ub3RhdGVkU3RyaW5nLmNsb25lKCkgYXMgQW5ub3RhdGVkU3RyaW5nPHN0cmluZz4sIHRoaXMuYmFzZVN0cmluZyk7XG5cdH1cbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgVmlzdWFsQW5ub3RhdGVkU3RyaW5nIGZyb20gYSB2aXN1YWwgcmVwcmVzZW50YXRpb24uXG4gKi9cbmZ1bmN0aW9uIGZyb21WaXN1YWwodmlzdWFsOiBzdHJpbmcpOiBWaXN1YWxBbm5vdGF0ZWRTdHJpbmcge1xuXHRjb25zdCB7IGFubm90YXRpb25zLCBiYXNlU3RyaW5nIH0gPSBwYXJzZVZpc3VhbEFubm90YXRpb25zKHZpc3VhbCk7XG5cdHJldHVybiBuZXcgVmlzdWFsQW5ub3RhdGVkU3RyaW5nKG5ldyBBbm5vdGF0ZWRTdHJpbmc8c3RyaW5nPihhbm5vdGF0aW9ucyksIGJhc2VTdHJpbmcpO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGEgVmlzdWFsQW5ub3RhdGVkU3RyaW5nIHRvIGEgdmlzdWFsIHJlcHJlc2VudGF0aW9uLlxuICovXG5mdW5jdGlvbiB0b1Zpc3VhbCh2YXM6IFZpc3VhbEFubm90YXRlZFN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB0b1Zpc3VhbFN0cmluZyh2YXMuZ2V0QWxsQW5ub3RhdGlvbnMoKSwgdmFzLmJhc2VTdHJpbmcpO1xufVxuXG4vKipcbiAqIFBhcnNlcyB2aXN1YWwgdXBkYXRlIGFubm90YXRpb25zLCB3aGVyZTpcbiAqIC0gJ1tpZDp0ZXh0XScgcmVwcmVzZW50cyBhbiBhbm5vdGF0aW9uIHRvIHNldFxuICogLSAnPGlkOnRleHQ+JyByZXByZXNlbnRzIGFuIGFubm90YXRpb24gdG8gZGVsZXRlIChyYW5nZSBpcyB0cmFja2VkIGJ1dCBhbm5vdGF0aW9uIGlzIHVuZGVmaW5lZClcbiAqL1xuZnVuY3Rpb24gcGFyc2VWaXN1YWxVcGRhdGUodmlzdWFsOiBzdHJpbmcpOiB7IHVwZGF0ZXM6IElBbm5vdGF0aW9uVXBkYXRlPHN0cmluZz5bXTsgYmFzZVN0cmluZzogc3RyaW5nIH0ge1xuXHRjb25zdCB1cGRhdGVzOiBJQW5ub3RhdGlvblVwZGF0ZTxzdHJpbmc+W10gPSBbXTtcblx0bGV0IGJhc2VTdHJpbmcgPSAnJztcblx0bGV0IGkgPSAwO1xuXG5cdHdoaWxlIChpIDwgdmlzdWFsLmxlbmd0aCkge1xuXHRcdGlmICh2aXN1YWxbaV0gPT09ICdbJykge1xuXHRcdFx0Ly8gU2V0IGFubm90YXRpb246IFtpZDp0ZXh0XVxuXHRcdFx0Y29uc3QgY29sb25JZHggPSB2aXN1YWwuaW5kZXhPZignOicsIGkgKyAxKTtcblx0XHRcdGNvbnN0IGNsb3NlSWR4ID0gdmlzdWFsLmluZGV4T2YoJ10nLCBjb2xvbklkeCArIDEpO1xuXHRcdFx0aWYgKGNvbG9uSWR4ID09PSAtMSB8fCBjbG9zZUlkeCA9PT0gLTEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGFubm90YXRpb24gZm9ybWF0IGF0IHBvc2l0aW9uICR7aX1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlkID0gdmlzdWFsLnN1YnN0cmluZyhpICsgMSwgY29sb25JZHgpO1xuXHRcdFx0Y29uc3QgdGV4dCA9IHZpc3VhbC5zdWJzdHJpbmcoY29sb25JZHggKyAxLCBjbG9zZUlkeCk7XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IGJhc2VTdHJpbmcubGVuZ3RoO1xuXHRcdFx0YmFzZVN0cmluZyArPSB0ZXh0O1xuXHRcdFx0dXBkYXRlcy5wdXNoKHsgcmFuZ2U6IG5ldyBPZmZzZXRSYW5nZShzdGFydE9mZnNldCwgYmFzZVN0cmluZy5sZW5ndGgpLCBhbm5vdGF0aW9uOiBpZCB9KTtcblx0XHRcdGkgPSBjbG9zZUlkeCArIDE7XG5cdFx0fSBlbHNlIGlmICh2aXN1YWxbaV0gPT09ICc8Jykge1xuXHRcdFx0Ly8gRGVsZXRlIGFubm90YXRpb246IDxpZDp0ZXh0PlxuXHRcdFx0Y29uc3QgY29sb25JZHggPSB2aXN1YWwuaW5kZXhPZignOicsIGkgKyAxKTtcblx0XHRcdGNvbnN0IGNsb3NlSWR4ID0gdmlzdWFsLmluZGV4T2YoJz4nLCBjb2xvbklkeCArIDEpO1xuXHRcdFx0aWYgKGNvbG9uSWR4ID09PSAtMSB8fCBjbG9zZUlkeCA9PT0gLTEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGRlbGV0ZSBmb3JtYXQgYXQgcG9zaXRpb24gJHtpfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dCA9IHZpc3VhbC5zdWJzdHJpbmcoY29sb25JZHggKyAxLCBjbG9zZUlkeCk7XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IGJhc2VTdHJpbmcubGVuZ3RoO1xuXHRcdFx0YmFzZVN0cmluZyArPSB0ZXh0O1xuXHRcdFx0dXBkYXRlcy5wdXNoKHsgcmFuZ2U6IG5ldyBPZmZzZXRSYW5nZShzdGFydE9mZnNldCwgYmFzZVN0cmluZy5sZW5ndGgpLCBhbm5vdGF0aW9uOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRpID0gY2xvc2VJZHggKyAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRiYXNlU3RyaW5nICs9IHZpc3VhbFtpXTtcblx0XHRcdGkrKztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyB1cGRhdGVzLCBiYXNlU3RyaW5nIH07XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBBbm5vdGF0aW9uc1VwZGF0ZSBmcm9tIGEgdmlzdWFsIHJlcHJlc2VudGF0aW9uLlxuICovXG5mdW5jdGlvbiB1cGRhdGVGcm9tVmlzdWFsKC4uLnZpc3VhbHM6IHN0cmluZ1tdKTogQW5ub3RhdGlvbnNVcGRhdGU8c3RyaW5nPiB7XG5cdGNvbnN0IHVwZGF0ZXM6IElBbm5vdGF0aW9uVXBkYXRlPHN0cmluZz5bXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgdmlzdWFsIG9mIHZpc3VhbHMpIHtcblx0XHRjb25zdCB7IHVwZGF0ZXM6IHBhcnNlZFVwZGF0ZXMgfSA9IHBhcnNlVmlzdWFsVXBkYXRlKHZpc3VhbCk7XG5cdFx0dXBkYXRlcy5wdXNoKC4uLnBhcnNlZFVwZGF0ZXMpO1xuXHR9XG5cblx0cmV0dXJuIEFubm90YXRpb25zVXBkYXRlLmNyZWF0ZSh1cGRhdGVzKTtcbn1cblxuLyoqXG4gKiBIZWxwZXIgdG8gY3JlYXRlIGEgU3RyaW5nRWRpdCBmcm9tIHZpc3VhbCBub3RhdGlvbi5cbiAqIFVzZXMgYSBwYXR0ZXJuIG1hdGNoaW5nIGFwcHJvYWNoIHdoZXJlOlxuICogLSAnZCcgbWFya3MgcG9zaXRpb25zIHRvIGRlbGV0ZVxuICogLSAnaTp0ZXh0OicgaW5zZXJ0cyAndGV4dCcgYXQgdGhlIG1hcmtlZCBwb3NpdGlvblxuICpcbiAqIFNpbXBsZXIgYXBwcm9hY2g6IGp1c3QgdXNlIG9mZnNldC1iYXNlZCBoZWxwZXJzXG4gKi9cbmZ1bmN0aW9uIGVkaXREZWxldGUoc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpOiBTdHJpbmdFZGl0IHtcblx0cmV0dXJuIFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnQsIGVuZCksICcnKTtcbn1cblxuZnVuY3Rpb24gZWRpdEluc2VydChwb3M6IG51bWJlciwgdGV4dDogc3RyaW5nKTogU3RyaW5nRWRpdCB7XG5cdHJldHVybiBTdHJpbmdFZGl0Lmluc2VydChwb3MsIHRleHQpO1xufVxuXG5mdW5jdGlvbiBlZGl0UmVwbGFjZShzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgdGV4dDogc3RyaW5nKTogU3RyaW5nRWRpdCB7XG5cdHJldHVybiBTdHJpbmdFZGl0LnJlcGxhY2UobmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmQpLCB0ZXh0KTtcbn1cblxuLyoqXG4gKiBBc3NlcnRzIHRoYXQgYSBWaXN1YWxBbm5vdGF0ZWRTdHJpbmcgbWF0Y2hlcyB0aGUgZXhwZWN0ZWQgdmlzdWFsIHJlcHJlc2VudGF0aW9uLlxuICogT25seSBjb21wYXJlcyBhbm5vdGF0aW9ucywgbm90IHRoZSBiYXNlIHN0cmluZyAoc2luY2Ugc2V0QW5ub3RhdGlvbnMgZG9lc24ndCBjaGFuZ2UgdGhlIGJhc2Ugc3RyaW5nKS5cbiAqL1xuZnVuY3Rpb24gYXNzZXJ0VmlzdWFsKHZhczogVmlzdWFsQW5ub3RhdGVkU3RyaW5nLCBleHBlY3RlZFZpc3VhbDogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGFjdHVhbCA9IHRvVmlzdWFsKHZhcyk7XG5cdGNvbnN0IHsgYW5ub3RhdGlvbnM6IGV4cGVjdGVkQW5ub3RhdGlvbnMgfSA9IHBhcnNlVmlzdWFsQW5ub3RhdGlvbnMoZXhwZWN0ZWRWaXN1YWwpO1xuXHRjb25zdCBhY3R1YWxBbm5vdGF0aW9ucyA9IHZhcy5nZXRBbGxBbm5vdGF0aW9ucygpO1xuXG5cdC8vIENvbXBhcmUgYW5ub3RhdGlvbnMgZm9yIGJldHRlciBlcnJvciBtZXNzYWdlc1xuXHRpZiAoYWN0dWFsQW5ub3RhdGlvbnMubGVuZ3RoICE9PSBleHBlY3RlZEFubm90YXRpb25zLmxlbmd0aCkge1xuXHRcdGFzc2VydC5mYWlsKFxuXHRcdFx0YEFubm90YXRpb24gY291bnQgbWlzbWF0Y2guXFxuYCArXG5cdFx0XHRgICBFeHBlY3RlZDogJHtleHBlY3RlZFZpc3VhbH1cXG5gICtcblx0XHRcdGAgIEFjdHVhbDogICAke2FjdHVhbH1cXG5gICtcblx0XHRcdGAgIEV4cGVjdGVkICR7ZXhwZWN0ZWRBbm5vdGF0aW9ucy5sZW5ndGh9IGFubm90YXRpb25zLCBnb3QgJHthY3R1YWxBbm5vdGF0aW9ucy5sZW5ndGh9YFxuXHRcdCk7XG5cdH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGFjdHVhbEFubm90YXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBleHBlY3RlZEFubm90YXRpb25zW2ldO1xuXHRcdGNvbnN0IGFjdHVhbEFubiA9IGFjdHVhbEFubm90YXRpb25zW2ldO1xuXHRcdGlmIChhY3R1YWxBbm4ucmFuZ2Uuc3RhcnQgIT09IGV4cGVjdGVkLnJhbmdlLnN0YXJ0IHx8IGFjdHVhbEFubi5yYW5nZS5lbmRFeGNsdXNpdmUgIT09IGV4cGVjdGVkLnJhbmdlLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0YXNzZXJ0LmZhaWwoXG5cdFx0XHRcdGBBbm5vdGF0aW9uICR7aX0gcmFuZ2UgbWlzbWF0Y2guXFxuYCArXG5cdFx0XHRcdGAgIEV4cGVjdGVkOiAoJHtleHBlY3RlZC5yYW5nZS5zdGFydH0sICR7ZXhwZWN0ZWQucmFuZ2UuZW5kRXhjbHVzaXZlfSlcXG5gICtcblx0XHRcdFx0YCAgQWN0dWFsOiAgICgke2FjdHVhbEFubi5yYW5nZS5zdGFydH0sICR7YWN0dWFsQW5uLnJhbmdlLmVuZEV4Y2x1c2l2ZX0pXFxuYCArXG5cdFx0XHRcdGAgIEV4cGVjdGVkIHZpc3VhbDogJHtleHBlY3RlZFZpc3VhbH1cXG5gICtcblx0XHRcdFx0YCAgQWN0dWFsIHZpc3VhbDogICAke2FjdHVhbH1gXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoYWN0dWFsQW5uLmFubm90YXRpb24gIT09IGV4cGVjdGVkLmFubm90YXRpb24pIHtcblx0XHRcdGFzc2VydC5mYWlsKFxuXHRcdFx0XHRgQW5ub3RhdGlvbiAke2l9IHZhbHVlIG1pc21hdGNoLlxcbmAgK1xuXHRcdFx0XHRgICBFeHBlY3RlZDogXCIke2V4cGVjdGVkLmFubm90YXRpb259XCJcXG5gICtcblx0XHRcdFx0YCAgQWN0dWFsOiAgIFwiJHthY3R1YWxBbm4uYW5ub3RhdGlvbn1cImBcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogSGVscGVyIHRvIHZpc3VhbGl6ZSB0aGUgZWZmZWN0IG9mIGFuIGVkaXQgb24gYW5ub3RhdGlvbnMuXG4gKiBSZXR1cm5zIGJvdGggYmVmb3JlIGFuZCBhZnRlciBzdGF0ZXMgYXMgdmlzdWFsIHN0cmluZ3MuXG4gKi9cbmZ1bmN0aW9uIHZpc3VhbGl6ZUVkaXQoXG5cdGJlZm9yZUFubm90YXRpb25zOiBzdHJpbmcsXG5cdGVkaXQ6IFN0cmluZ0VkaXRcbik6IHsgYmVmb3JlOiBzdHJpbmc7IGFmdGVyOiBzdHJpbmcgfSB7XG5cdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoYmVmb3JlQW5ub3RhdGlvbnMpO1xuXHRjb25zdCBiZWZvcmUgPSB0b1Zpc3VhbCh2YXMpO1xuXG5cdHZhcy5hcHBseUVkaXQoZWRpdCk7XG5cblx0Y29uc3QgYWZ0ZXIgPSB0b1Zpc3VhbCh2YXMpO1xuXHRyZXR1cm4geyBiZWZvcmUsIGFmdGVyIH07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFZpc3VhbCBBbm5vdGF0aW9ucyBUZXN0IFN1aXRlXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUaGVzZSB0ZXN0cyB1c2UgYSB2aXN1YWwgcmVwcmVzZW50YXRpb24gZm9yIGJldHRlciByZWFkYWJpbGl0eTpcbi8vIC0gJ1tpZDp0ZXh0XScgbWFya3MgYW5ub3RhdGVkIHJlZ2lvbnMgd2l0aCBpZCBhbmQgY29udGVudFxuLy8gLSBQbGFpbiB0ZXh0IHJlcHJlc2VudHMgdW5hbm5vdGF0ZWQgY29udGVudFxuLy8gLSAnPGlkOnRleHQ+JyBtYXJrcyByZWdpb25zIHRvIGRlbGV0ZSAoaW4gdXBkYXRlcylcbi8vXG4vLyBFeGFtcGxlOiBcIkxvcmVtIFsxOmlwc3VtXSBkb2xvciBbMjpzaXRdIGFtZXRcIiByZXByZXNlbnRzIHR3byBhbm5vdGF0aW9uczpcbi8vICAgICAgICAgIFwiMVwiIGF0ICg2LDExKSBjb3ZlcmluZyBcImlwc3VtXCIsIFwiMlwiIGF0ICgxOCwyMSkgY292ZXJpbmcgXCJzaXRcIlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5zdWl0ZSgnQW5ub3RhdGlvbnMgU3VpdGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2V0QW5ub3RhdGlvbnMgMScsICgpID0+IHtcblx0XHRjb25zdCB2YXMgPSBmcm9tVmlzdWFsKCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScpO1xuXHRcdHZhcy5zZXRBbm5vdGF0aW9ucyh1cGRhdGVGcm9tVmlzdWFsKCdbNDpMb3JlbSBpXScpKTtcblx0XHRhc3NlcnRWaXN1YWwodmFzLCAnWzQ6TG9yZW0gaV1wc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0XHR2YXMuc2V0QW5ub3RhdGlvbnModXBkYXRlRnJvbVZpc3VhbCgnTG9yZW0gaXBbNTpzXScpKTtcblx0XHRhc3NlcnRWaXN1YWwodmFzLCAnWzQ6TG9yZW0gaV1wWzU6c111bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldEFubm90YXRpb25zIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0XHR2YXMuc2V0QW5ub3RhdGlvbnModXBkYXRlRnJvbVZpc3VhbChcblx0XHRcdCdMPF86b3JlbSBpcHN1bSBkPicsXG5cdFx0XHQnWzQ6TG9yZW0gXSdcblx0XHQpKTtcblx0XHRhc3NlcnRWaXN1YWwodmFzLCAnWzQ6TG9yZW0gXWlwc3VtIGRvbG9yIHNpdCBbMzphbWV0XScpO1xuXHRcdHZhcy5zZXRBbm5vdGF0aW9ucyh1cGRhdGVGcm9tVmlzdWFsKFxuXHRcdFx0J0xvcmVtIDxfOmlwc3VtIGRvbG9yIHNpdCBhbWV0PicsXG5cdFx0XHQnWzU6TG9yXSdcblx0XHQpKTtcblx0XHRhc3NlcnRWaXN1YWwodmFzLCAnWzU6TG9yXWVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0Jyk7XG5cdFx0dmFzLnNldEFubm90YXRpb25zKHVwZGF0ZUZyb21WaXN1YWwoJ0xbNjpvcl0nKSk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ0xbNjpvcl1lbSBpcHN1bSBkb2xvciBzaXQgYW1ldCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRBbm5vdGF0aW9ucyAzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdFx0dmFzLnNldEFubm90YXRpb25zKHVwZGF0ZUZyb21WaXN1YWwoJ0xvcmVbNDptIGlwc3VtIGRvbG9yIF0nKSk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ0xvcmVbNDptIGlwc3VtIGRvbG9yIF1zaXQgWzM6YW1ldF0nKTtcblx0XHR2YXMuc2V0QW5ub3RhdGlvbnModXBkYXRlRnJvbVZpc3VhbCgnTG9yZW0gaXBzdW0gZG9sb3Igc2l0IFs1OmFdJykpO1xuXHRcdGFzc2VydFZpc3VhbCh2YXMsICdMb3JlWzQ6bSBpcHN1bSBkb2xvciBdc2l0IFs1OmFdbWV0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldEFubm90YXRpb25zIDQnLCAoKSA9PiB7XG5cdFx0Ly8gNTQgY2hhcnMgYmVmb3JlICdpJzogXCJMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCwgY29uc2VjdGV0dXIgYWRpcGlzY2luZyBlbFwiXG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnTG9yZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQsIGNvbnNlY3RldHVyIGFkaXBpc2NpbmcgZWxbOml0XScpO1xuXHRcdHZhcy5zZXRBbm5vdGF0aW9ucyh1cGRhdGVGcm9tVmlzdWFsKCdMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCwgY29uc2VjdGV0dXIgYWRpcGlzY2luZyBlbDxfOmk+dCcpKTtcblx0XHRhc3NlcnRWaXN1YWwodmFzLCAnTG9yZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQsIGNvbnNlY3RldHVyIGFkaXBpc2NpbmcgZWxpdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdFx0Y29uc3QgcmVzdWx0MSA9IHZhcy5nZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhuZXcgT2Zmc2V0UmFuZ2UoMCwgMTMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MS5tYXAoYSA9PiBhLmFubm90YXRpb24pLCBbJzEnLCAnMiddKTtcblx0XHRjb25zdCByZXN1bHQyID0gdmFzLmdldEFubm90YXRpb25zSW50ZXJzZWN0aW5nKG5ldyBPZmZzZXRSYW5nZSgwLCAyMikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLm1hcChhID0+IGEuYW5ub3RhdGlvbiksIFsnMScsICcyJywgJzMnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFubm90YXRpb25zSW50ZXJzZWN0aW5nIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnWzE6TG9yZW1dIFsyOmldcFszOnNdJyk7XG5cblx0XHRjb25zdCByZXN1bHQxID0gdmFzLmdldEFubm90YXRpb25zSW50ZXJzZWN0aW5nKG5ldyBPZmZzZXRSYW5nZSg1LCA3KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDEubWFwKGEgPT4gYS5hbm5vdGF0aW9uKSwgWycyJ10pO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSB2YXMuZ2V0QW5ub3RhdGlvbnNJbnRlcnNlY3RpbmcobmV3IE9mZnNldFJhbmdlKDUsIDkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Mi5tYXAoYSA9PiBhLmFubm90YXRpb24pLCBbJzInLCAnMyddKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QW5ub3RhdGlvbnNJbnRlcnNlY3RpbmcgMycsICgpID0+IHtcblx0XHRjb25zdCB2YXMgPSBmcm9tVmlzdWFsKCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdJyk7XG5cdFx0Y29uc3QgcmVzdWx0MSA9IHZhcy5nZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhuZXcgT2Zmc2V0UmFuZ2UoNCwgMTMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MS5tYXAoYSA9PiBhLmFubm90YXRpb24pLCBbJzEnLCAnMiddKTtcblx0XHR2YXMuc2V0QW5ub3RhdGlvbnModXBkYXRlRnJvbVZpc3VhbCgnWzM6TG9yZV1tWzQ6IGlwc3VdJykpO1xuXHRcdGFzc2VydFZpc3VhbCh2YXMsICdbMzpMb3JlXW1bNDogaXBzdV1tIFsyOmRvbG9yXScpO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSB2YXMuZ2V0QW5ub3RhdGlvbnNJbnRlcnNlY3RpbmcobmV3IE9mZnNldFJhbmdlKDcsIDEzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIubWFwKGEgPT4gYS5hbm5vdGF0aW9uKSwgWyc0JywgJzInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFubm90YXRpb25zSW50ZXJzZWN0aW5nIDQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnWzE6TG9yZW0gaXBzdW1dIHNpdCcpO1xuXHRcdHZhcy5zZXRBbm5vdGF0aW9ucyh1cGRhdGVGcm9tVmlzdWFsKCdMb3JlbSBpcHN1bSBbMjpzaXRdJykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZhcy5nZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhuZXcgT2Zmc2V0UmFuZ2UoMiwgOCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoYSA9PiBhLmFubm90YXRpb24pLCBbJzEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFubm90YXRpb25zSW50ZXJzZWN0aW5nIDUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnWzE6TG9yZW0gaXBzdW1dIFsyOmRvbF0gWzM6b3JdJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmFzLmdldEFubm90YXRpb25zSW50ZXJzZWN0aW5nKG5ldyBPZmZzZXRSYW5nZSgxLCAxNikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoYSA9PiBhLmFubm90YXRpb24pLCBbJzEnLCAnMicsICczJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyA2JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtIF1bMjppcF1bMzpzdW1dJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmFzLmdldEFubm90YXRpb25zSW50ZXJzZWN0aW5nKG5ldyBPZmZzZXRSYW5nZSg2LCA2KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChhID0+IGEuYW5ub3RhdGlvbiksIFsnMiddKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDEgLSBkZWxldGlvbiB3aXRoaW4gYW5ub3RhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2aXN1YWxpemVFZGl0KFxuXHRcdFx0J1sxOkxvcmVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyxcblx0XHRcdGVkaXREZWxldGUoMCwgMylcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICdbMTplbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUVkaXQgMiAtIGRlbGV0aW9uIGFuZCBpbnNlcnRpb24gd2l0aGluIGFubm90YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlzdWFsaXplRWRpdChcblx0XHRcdCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScsXG5cdFx0XHRlZGl0UmVwbGFjZSgxLCAzLCAnWFhYWFgnKVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hZnRlciwgJ1sxOkxYWFhYWGVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5RWRpdCAzIC0gZGVsZXRpb24gYWNyb3NzIHNldmVyYWwgYW5ub3RhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlzdWFsaXplRWRpdChcblx0XHRcdCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScsXG5cdFx0XHRlZGl0UmVwbGFjZSg0LCAyMiwgJ1hYWFhYJylcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICdbMTpMb3JlWFhYWFhdWzM6YW1ldF0nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDQgLSBkZWxldGlvbiBiZXR3ZWVuIGFubm90YXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZpc3VhbGl6ZUVkaXQoXG5cdFx0XHQnWzE6TG9yZW0gaXBdc3VtIGFuZCBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyxcblx0XHRcdGVkaXREZWxldGUoMTAsIDEyKVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hZnRlciwgJ1sxOkxvcmVtIGlwXXN1YW5kIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDUgLSBkZWxldGlvbiB0aGF0IGNvdmVycyBhbm5vdGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZpc3VhbGl6ZUVkaXQoXG5cdFx0XHQnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nLFxuXHRcdFx0ZWRpdERlbGV0ZSgwLCA1KVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hZnRlciwgJyBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5RWRpdCA2IC0gc2V2ZXJhbCBlZGl0cycsICgpID0+IHtcblx0XHRjb25zdCB2YXMgPSBmcm9tVmlzdWFsKCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScpO1xuXHRcdGNvbnN0IGVkaXQgPSBTdHJpbmdFZGl0LmNvbXBvc2UoW1xuXHRcdFx0U3RyaW5nRWRpdC5yZXBsYWNlKG5ldyBPZmZzZXRSYW5nZSgwLCA2KSwgJycpLFxuXHRcdFx0U3RyaW5nRWRpdC5yZXBsYWNlKG5ldyBPZmZzZXRSYW5nZSg2LCAxMiksICcnKSxcblx0XHRcdFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMTIsIDE3KSwgJycpXG5cdFx0XSk7XG5cdFx0dmFzLmFwcGx5RWRpdChlZGl0KTtcblx0XHRhc3NlcnRWaXN1YWwodmFzLCAnaXBzdW0gc2l0IFszOmFtXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUVkaXQgNyAtIHNldmVyYWwgZWRpdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0XHRjb25zdCBlZGl0MSA9IFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgMyksICdYWFhYJyk7XG5cdFx0Y29uc3QgZWRpdDIgPSBTdHJpbmdFZGl0LnJlcGxhY2UobmV3IE9mZnNldFJhbmdlKDAsIDIpLCAnJyk7XG5cdFx0dmFzLmFwcGx5RWRpdChlZGl0MS5jb21wb3NlKGVkaXQyKSk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ1sxOlhYZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDkgLSBpbnNlcnRpb24gYXQgZW5kIG9mIGFubm90YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlzdWFsaXplRWRpdChcblx0XHRcdCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScsXG5cdFx0XHRlZGl0SW5zZXJ0KDE3LCAnWFhYJylcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdWFhYIHNpdCBbMzphbWV0XScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUVkaXQgMTAgLSBpbnNlcnRpb24gaW4gbWlkZGxlIG9mIGFubm90YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlzdWFsaXplRWRpdChcblx0XHRcdCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScsXG5cdFx0XHRlZGl0SW5zZXJ0KDE0LCAnWFhYJylcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9YWFhsb3JdIHNpdCBbMzphbWV0XScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUVkaXQgMTEgLSByZXBsYWNlbWVudCBjb25zdW1pbmcgYW5ub3RhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2aXN1YWxpemVFZGl0KFxuXHRcdFx0J1sxOkxdb1syOnJlbV0gWzM6aV0nLFxuXHRcdFx0ZWRpdFJlcGxhY2UoMSwgNiwgJ1gnKVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hZnRlciwgJ1sxOkxdWFszOmldJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5RWRpdCAxMiAtIG11bHRpcGxlIGRpc2pvaW50IGVkaXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXQhXSBbNDpkb25lXScpO1xuXG5cdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuY29tcG9zZShbXG5cdFx0XHRTdHJpbmdFZGl0Lmluc2VydCgwLCAnWCcpLFxuXHRcdFx0U3RyaW5nRWRpdC5kZWxldGUobmV3IE9mZnNldFJhbmdlKDEyLCAxMykpLFxuXHRcdFx0U3RyaW5nRWRpdC5yZXBsYWNlKG5ldyBPZmZzZXRSYW5nZSgyMSwgMjIpLCAnWVknKSxcblx0XHRcdFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMjgsIDMyKSwgJ1onKVxuXHRcdF0pO1xuXHRcdHZhcy5hcHBseUVkaXQoZWRpdCk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ1hbMTpMb3JlbV0gaXBzdW1bMjpkb2xvcl0gc2l0WVlbMzphbWV0IV1aWzQ6ZV0nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDEzIC0gZWRpdCBvbiB0aGUgbGVmdCBib3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlzdWFsaXplRWRpdChcblx0XHRcdCdsb3JlbSBpcHN1bSBkb2xvclsxOiBdJyxcblx0XHRcdGVkaXRJbnNlcnQoMTcsICdYJylcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICdsb3JlbSBpcHN1bSBkb2xvclhbMTogXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWJhc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IG5ldyBWaXN1YWxBbm5vdGF0ZWRTdHJpbmcoXG5cdFx0XHRuZXcgQW5ub3RhdGVkU3RyaW5nPHN0cmluZz4oW3sgcmFuZ2U6IG5ldyBPZmZzZXRSYW5nZSgyLCA1KSwgYW5ub3RhdGlvbjogJzEnIH1dKSxcblx0XHRcdCdzaXRhbWV0J1xuXHRcdCk7XG5cdFx0Y29uc3QgYiA9IGEuY2xvbmUoKTtcblx0XHRjb25zdCB1cGRhdGU6IEFubm90YXRpb25zVXBkYXRlPHN0cmluZz4gPSBBbm5vdGF0aW9uc1VwZGF0ZS5jcmVhdGUoW3sgcmFuZ2U6IG5ldyBPZmZzZXRSYW5nZSg0LCA1KSwgYW5ub3RhdGlvbjogJzInIH1dKTtcblxuXHRcdGIuc2V0QW5ub3RhdGlvbnModXBkYXRlKTtcblx0XHRjb25zdCBlZGl0OiBTdHJpbmdFZGl0ID0gU3RyaW5nRWRpdC5yZXBsYWNlKG5ldyBPZmZzZXRSYW5nZSgxLCA2KSwgJ1hYWCcpO1xuXG5cdFx0YS5hcHBseUVkaXQoZWRpdCk7XG5cdFx0Yi5hcHBseUVkaXQoZWRpdCk7XG5cblx0XHR1cGRhdGUucmViYXNlKGVkaXQpO1xuXG5cdFx0YS5zZXRBbm5vdGF0aW9ucyh1cGRhdGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYS5nZXRBbGxBbm5vdGF0aW9ucygpLCBiLmdldEFsbEFubm90YXRpb25zKCkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNB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QUVELE9BQUssbURBQW1ELE1BQU07QUFDN0QsVUFBTSxTQUFTO0FBQUEsTUFDZDtBQUFBLE1BQ0EsWUFBWSxHQUFHLEdBQUcsR0FBRztBQUFBLElBQ3RCO0FBQ0EsV0FBTyxZQUFZLE9BQU8sT0FBTyxhQUFhO0FBQUEsRUFDL0MsQ0FBQztBQUVELE9BQUssMENBQTBDLE1BQU07QUFDcEQsVUFBTSxNQUFNLFdBQVcsa0RBQWtEO0FBRXpFLFVBQU0sT0FBTyxXQUFXLFFBQVE7QUFBQSxNQUMvQixXQUFXLE9BQU8sR0FBRyxHQUFHO0FBQUEsTUFDeEIsV0FBVyxPQUFPLElBQUksWUFBWSxJQUFJLEVBQUUsQ0FBQztBQUFBLE1BQ3pDLFdBQVcsUUFBUSxJQUFJLFlBQVksSUFBSSxFQUFFLEdBQUcsSUFBSTtBQUFBLE1BQ2hELFdBQVcsUUFBUSxJQUFJLFlBQVksSUFBSSxFQUFFLEdBQUcsR0FBRztBQUFBLElBQ2hELENBQUM7QUFDRCxRQUFJLFVBQVUsSUFBSTtBQUNsQixpQkFBYSxLQUFLLGdEQUFnRDtBQUFBLEVBQ25FLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBQ3BELFVBQU0sU0FBUztBQUFBLE1BQ2Q7QUFBQSxNQUNBLFdBQVcsSUFBSSxHQUFHO0FBQUEsSUFDbkI7QUFDQSxXQUFPLFlBQVksT0FBTyxPQUFPLHlCQUF5QjtBQUFBLEVBQzNELENBQUM7QUFFRCxPQUFLLFVBQVUsTUFBTTtBQUNwQixVQUFNLElBQUksSUFBSTtBQUFBLE1BQ2IsSUFBSSxnQkFBd0IsQ0FBQyxFQUFFLE9BQU8sSUFBSSxZQUFZLEdBQUcsQ0FBQyxHQUFHLFlBQVksSUFBSSxDQUFDLENBQUM7QUFBQSxNQUMvRTtBQUFBLElBQ0Q7QUFDQSxVQUFNLElBQUksRUFBRSxNQUFNO0FBQ2xCLFVBQU0sU0FBb0Msa0JBQWtCLE9BQU8sQ0FBQyxFQUFFLE9BQU8sSUFBSSxZQUFZLEdBQUcsQ0FBQyxHQUFHLFlBQVksSUFBSSxDQUFDLENBQUM7QUFFdEgsTUFBRSxlQUFlLE1BQU07QUFDdkIsVUFBTSxPQUFtQixXQUFXLFFBQVEsSUFBSSxZQUFZLEdBQUcsQ0FBQyxHQUFHLEtBQUs7QUFFeEUsTUFBRSxVQUFVLElBQUk7QUFDaEIsTUFBRSxVQUFVLElBQUk7QUFFaEIsV0FBTyxPQUFPLElBQUk7QUFFbEIsTUFBRSxlQUFlLE1BQU07QUFDdkIsV0FBTyxnQkFBZ0IsRUFBRSxrQkFBa0IsR0FBRyxFQUFFLGtCQUFrQixDQUFDO0FBQUEsRUFDcEUsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
