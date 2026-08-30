import { compareBy, groupAdjacentBy, numberComparator } from "../../../../base/common/arrays.js";
import { assert, checkAdjacentItems } from "../../../../base/common/assert.js";
import { splitLines } from "../../../../base/common/strings.js";
import { LineRange } from "../ranges/lineRange.js";
import { StringEdit, StringReplacement } from "./stringEdit.js";
import { Position } from "../position.js";
import { Range } from "../range.js";
import { TextReplacement, TextEdit } from "./textEdit.js";
const _LineEdit = class _LineEdit {
  constructor(replacements) {
    this.replacements = replacements;
    assert(checkAdjacentItems(replacements, (i1, i2) => i1.lineRange.endLineNumberExclusive <= i2.lineRange.startLineNumber));
  }
  static deserialize(data) {
    return new _LineEdit(data.map((e) => LineReplacement.deserialize(e)));
  }
  static fromStringEdit(edit, initialValue) {
    const textEdit = TextEdit.fromStringEdit(edit, initialValue);
    return _LineEdit.fromTextEdit(textEdit, initialValue);
  }
  static fromTextEdit(edit, initialValue) {
    const edits = edit.replacements;
    const result = [];
    const currentEdits = [];
    for (let i = 0; i < edits.length; i++) {
      const edit2 = edits[i];
      const nextEditRange = i + 1 < edits.length ? edits[i + 1] : void 0;
      currentEdits.push(edit2);
      if (nextEditRange && nextEditRange.range.startLineNumber === edit2.range.endLineNumber) {
        continue;
      }
      const singleEdit = TextReplacement.joinReplacements(currentEdits, initialValue);
      currentEdits.length = 0;
      const singleLineEdit = LineReplacement.fromSingleTextEdit(singleEdit, initialValue);
      result.push(singleLineEdit);
    }
    return new _LineEdit(result);
  }
  static createFromUnsorted(edits) {
    const result = edits.slice();
    result.sort(compareBy((i) => i.lineRange.startLineNumber, numberComparator));
    return new _LineEdit(result);
  }
  isEmpty() {
    return this.replacements.length === 0;
  }
  toEdit(initialValue) {
    const edits = [];
    for (const edit of this.replacements) {
      const singleEdit = edit.toSingleEdit(initialValue);
      edits.push(singleEdit);
    }
    return new StringEdit(edits);
  }
  toString() {
    return this.replacements.map((e) => e.toString()).join(",");
  }
  serialize() {
    return this.replacements.map((e) => e.serialize());
  }
  getNewLineRanges() {
    const ranges = [];
    let offset = 0;
    for (const e of this.replacements) {
      ranges.push(LineRange.ofLength(e.lineRange.startLineNumber + offset, e.newLines.length));
      offset += e.newLines.length - e.lineRange.length;
    }
    return ranges;
  }
  mapLineNumber(lineNumber) {
    let lineDelta = 0;
    for (const e of this.replacements) {
      if (e.lineRange.endLineNumberExclusive > lineNumber) {
        break;
      }
      lineDelta += e.newLines.length - e.lineRange.length;
    }
    return lineNumber + lineDelta;
  }
  mapLineRange(lineRange) {
    return new LineRange(
      this.mapLineNumber(lineRange.startLineNumber),
      this.mapLineNumber(lineRange.endLineNumberExclusive)
    );
  }
  /** TODO improve, dont require originalLines */
  mapBackLineRange(lineRange, originalLines) {
    const i = this.inverse(originalLines);
    return i.mapLineRange(lineRange);
  }
  touches(other) {
    return this.replacements.some((e1) => other.replacements.some((e2) => e1.lineRange.intersect(e2.lineRange)));
  }
  rebase(base) {
    return new _LineEdit(
      this.replacements.map((e) => new LineReplacement(base.mapLineRange(e.lineRange), e.newLines))
    );
  }
  humanReadablePatch(originalLines) {
    const result = [];
    function pushLine(originalLineNumber, modifiedLineNumber, kind, content) {
      const specialChar = kind === "unmodified" ? " " : kind === "deleted" ? "-" : "+";
      if (content === void 0) {
        content = "[[[[[ WARNING: LINE DOES NOT EXIST ]]]]]";
      }
      const origLn = originalLineNumber === -1 ? "   " : originalLineNumber.toString().padStart(3, " ");
      const modLn = modifiedLineNumber === -1 ? "   " : modifiedLineNumber.toString().padStart(3, " ");
      result.push(`${specialChar} ${origLn} ${modLn} ${content}`);
    }
    function pushSeperator() {
      result.push("---");
    }
    let lineDelta = 0;
    let first = true;
    for (const edits of groupAdjacentBy(this.replacements, (e1, e2) => e1.lineRange.distanceToRange(e2.lineRange) <= 5)) {
      if (!first) {
        pushSeperator();
      } else {
        first = false;
      }
      let lastLineNumber = edits[0].lineRange.startLineNumber - 2;
      for (const edit of edits) {
        for (let i = Math.max(1, lastLineNumber); i < edit.lineRange.startLineNumber; i++) {
          pushLine(i, i + lineDelta, "unmodified", originalLines[i - 1]);
        }
        const range = edit.lineRange;
        const newLines = edit.newLines;
        for (const replaceLineNumber of range.mapToLineArray((n) => n)) {
          const line = originalLines[replaceLineNumber - 1];
          pushLine(replaceLineNumber, -1, "deleted", line);
        }
        for (let i = 0; i < newLines.length; i++) {
          const line = newLines[i];
          pushLine(-1, range.startLineNumber + lineDelta + i, "added", line);
        }
        lastLineNumber = range.endLineNumberExclusive;
        lineDelta += edit.newLines.length - edit.lineRange.length;
      }
      for (let i = lastLineNumber; i <= Math.min(lastLineNumber + 2, originalLines.length); i++) {
        pushLine(i, i + lineDelta, "unmodified", originalLines[i - 1]);
      }
    }
    return result.join("\n");
  }
  apply(lines) {
    const result = [];
    let currentLineIndex = 0;
    for (const edit of this.replacements) {
      while (currentLineIndex < edit.lineRange.startLineNumber - 1) {
        result.push(lines[currentLineIndex]);
        currentLineIndex++;
      }
      for (const newLine of edit.newLines) {
        result.push(newLine);
      }
      currentLineIndex = edit.lineRange.endLineNumberExclusive - 1;
    }
    while (currentLineIndex < lines.length) {
      result.push(lines[currentLineIndex]);
      currentLineIndex++;
    }
    return result;
  }
  inverse(originalLines) {
    const newRanges = this.getNewLineRanges();
    return new _LineEdit(this.replacements.map((e, idx) => new LineReplacement(
      newRanges[idx],
      originalLines.slice(e.lineRange.startLineNumber - 1, e.lineRange.endLineNumberExclusive - 1)
    )));
  }
};
_LineEdit.empty = new _LineEdit([]);
let LineEdit = _LineEdit;
class LineReplacement {
  constructor(lineRange, newLines) {
    this.lineRange = lineRange;
    this.newLines = newLines;
  }
  static deserialize(e) {
    return new LineReplacement(
      LineRange.ofLength(e[0], e[1] - e[0]),
      e[2]
    );
  }
  static fromSingleTextEdit(edit, initialValue) {
    const newLines = splitLines(edit.text);
    let startLineNumber = edit.range.startLineNumber;
    const survivingFirstLineText = initialValue.getValueOfRange(Range.fromPositions(
      new Position(edit.range.startLineNumber, 1),
      edit.range.getStartPosition()
    ));
    newLines[0] = survivingFirstLineText + newLines[0];
    let endLineNumberEx = edit.range.endLineNumber + 1;
    const editEndLineNumberMaxColumn = initialValue.getTransformer().getLineLength(edit.range.endLineNumber) + 1;
    const survivingEndLineText = initialValue.getValueOfRange(Range.fromPositions(
      edit.range.getEndPosition(),
      new Position(edit.range.endLineNumber, editEndLineNumberMaxColumn)
    ));
    newLines[newLines.length - 1] = newLines[newLines.length - 1] + survivingEndLineText;
    const startBeforeNewLine = edit.range.startColumn === initialValue.getTransformer().getLineLength(edit.range.startLineNumber) + 1;
    const endAfterNewLine = edit.range.endColumn === 1;
    if (startBeforeNewLine && newLines[0].length === survivingFirstLineText.length) {
      startLineNumber++;
      newLines.shift();
    }
    if (newLines.length > 0 && startLineNumber < endLineNumberEx && endAfterNewLine && newLines[newLines.length - 1].length === survivingEndLineText.length) {
      endLineNumberEx--;
      newLines.pop();
    }
    return new LineReplacement(new LineRange(startLineNumber, endLineNumberEx), newLines);
  }
  toSingleTextEdit(initialValue) {
    if (this.newLines.length === 0) {
      const textLen = initialValue.getTransformer().textLength;
      if (this.lineRange.endLineNumberExclusive === textLen.lineCount + 2) {
        let startPos;
        if (this.lineRange.startLineNumber > 1) {
          const startLineNumber = this.lineRange.startLineNumber - 1;
          const startColumn = initialValue.getTransformer().getLineLength(startLineNumber) + 1;
          startPos = new Position(startLineNumber, startColumn);
        } else {
          startPos = new Position(1, 1);
        }
        const lastPosition = textLen.addToPosition(new Position(1, 1));
        return new TextReplacement(Range.fromPositions(startPos, lastPosition), "");
      } else {
        return new TextReplacement(new Range(this.lineRange.startLineNumber, 1, this.lineRange.endLineNumberExclusive, 1), "");
      }
    } else if (this.lineRange.isEmpty) {
      let endLineNumber;
      let column;
      let text;
      const insertionLine = this.lineRange.startLineNumber;
      if (insertionLine === initialValue.getTransformer().textLength.lineCount + 2) {
        endLineNumber = insertionLine - 1;
        column = initialValue.getTransformer().getLineLength(endLineNumber) + 1;
        text = this.newLines.map((l) => "\n" + l).join("");
      } else {
        endLineNumber = insertionLine;
        column = 1;
        text = this.newLines.map((l) => l + "\n").join("");
      }
      return new TextReplacement(Range.fromPositions(new Position(endLineNumber, column)), text);
    } else {
      const endLineNumber = this.lineRange.endLineNumberExclusive - 1;
      const endLineNumberMaxColumn = initialValue.getTransformer().getLineLength(endLineNumber) + 1;
      const range = new Range(
        this.lineRange.startLineNumber,
        1,
        endLineNumber,
        endLineNumberMaxColumn
      );
      const text = this.newLines.join("\n");
      return new TextReplacement(range, text);
    }
  }
  toSingleEdit(initialValue) {
    const textEdit = this.toSingleTextEdit(initialValue);
    const range = initialValue.getTransformer().getOffsetRange(textEdit.range);
    return new StringReplacement(range, textEdit.text);
  }
  toString() {
    return `${this.lineRange}->${JSON.stringify(this.newLines)}`;
  }
  serialize() {
    return [
      this.lineRange.startLineNumber,
      this.lineRange.endLineNumberExclusive,
      this.newLines
    ];
  }
  removeCommonSuffixPrefixLines(initialValue) {
    let startLineNumber = this.lineRange.startLineNumber;
    let endLineNumberEx = this.lineRange.endLineNumberExclusive;
    let trimStartCount = 0;
    while (startLineNumber < endLineNumberEx && trimStartCount < this.newLines.length && this.newLines[trimStartCount] === initialValue.getLineAt(startLineNumber)) {
      startLineNumber++;
      trimStartCount++;
    }
    let trimEndCount = 0;
    while (startLineNumber < endLineNumberEx && trimEndCount + trimStartCount < this.newLines.length && this.newLines[this.newLines.length - 1 - trimEndCount] === initialValue.getLineAt(endLineNumberEx - 1)) {
      endLineNumberEx--;
      trimEndCount++;
    }
    if (trimStartCount === 0 && trimEndCount === 0) {
      return this;
    }
    return new LineReplacement(new LineRange(startLineNumber, endLineNumberEx), this.newLines.slice(trimStartCount, this.newLines.length - trimEndCount));
  }
  toLineEdit() {
    return new LineEdit([this]);
  }
}
var SerializedLineReplacement;
((SerializedLineReplacement2) => {
  function is(thing) {
    return Array.isArray(thing) && thing.length === 3 && typeof thing[0] === "number" && typeof thing[1] === "number" && Array.isArray(thing[2]) && thing[2].every((e) => typeof e === "string");
  }
  SerializedLineReplacement2.is = is;
})(SerializedLineReplacement || (SerializedLineReplacement = {}));
export {
  LineEdit,
  LineReplacement,
  SerializedLineReplacement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29yZVxcZWRpdHNcXGxpbmVFZGl0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY29tcGFyZUJ5LCBncm91cEFkamFjZW50QnksIG51bWJlckNvbXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0LCBjaGVja0FkamFjZW50SXRlbXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgc3BsaXRMaW5lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBCYXNlU3RyaW5nRWRpdCwgU3RyaW5nRWRpdCwgU3RyaW5nUmVwbGFjZW1lbnQgfSBmcm9tICcuL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL3JhbmdlLmpzJztcbmltcG9ydCB7IFRleHRSZXBsYWNlbWVudCwgVGV4dEVkaXQgfSBmcm9tICcuL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IEFic3RyYWN0VGV4dCB9IGZyb20gJy4uL3RleHQvYWJzdHJhY3RUZXh0LmpzJztcblxuZXhwb3J0IGNsYXNzIExpbmVFZGl0IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBlbXB0eSA9IG5ldyBMaW5lRWRpdChbXSk7XG5cblx0cHVibGljIHN0YXRpYyBkZXNlcmlhbGl6ZShkYXRhOiBTZXJpYWxpemVkTGluZUVkaXQpOiBMaW5lRWRpdCB7XG5cdFx0cmV0dXJuIG5ldyBMaW5lRWRpdChkYXRhLm1hcChlID0+IExpbmVSZXBsYWNlbWVudC5kZXNlcmlhbGl6ZShlKSkpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tU3RyaW5nRWRpdChlZGl0OiBCYXNlU3RyaW5nRWRpdCwgaW5pdGlhbFZhbHVlOiBBYnN0cmFjdFRleHQpOiBMaW5lRWRpdCB7XG5cdFx0Y29uc3QgdGV4dEVkaXQgPSBUZXh0RWRpdC5mcm9tU3RyaW5nRWRpdChlZGl0LCBpbml0aWFsVmFsdWUpO1xuXHRcdHJldHVybiBMaW5lRWRpdC5mcm9tVGV4dEVkaXQodGV4dEVkaXQsIGluaXRpYWxWYWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21UZXh0RWRpdChlZGl0OiBUZXh0RWRpdCwgaW5pdGlhbFZhbHVlOiBBYnN0cmFjdFRleHQpOiBMaW5lRWRpdCB7XG5cdFx0Y29uc3QgZWRpdHMgPSBlZGl0LnJlcGxhY2VtZW50cztcblxuXHRcdGNvbnN0IHJlc3VsdDogTGluZVJlcGxhY2VtZW50W10gPSBbXTtcblxuXHRcdGNvbnN0IGN1cnJlbnRFZGl0czogVGV4dFJlcGxhY2VtZW50W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlZGl0ID0gZWRpdHNbaV07XG5cdFx0XHRjb25zdCBuZXh0RWRpdFJhbmdlID0gaSArIDEgPCBlZGl0cy5sZW5ndGggPyBlZGl0c1tpICsgMV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjdXJyZW50RWRpdHMucHVzaChlZGl0KTtcblx0XHRcdGlmIChuZXh0RWRpdFJhbmdlICYmIG5leHRFZGl0UmFuZ2UucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBlZGl0LnJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNpbmdsZUVkaXQgPSBUZXh0UmVwbGFjZW1lbnQuam9pblJlcGxhY2VtZW50cyhjdXJyZW50RWRpdHMsIGluaXRpYWxWYWx1ZSk7XG5cdFx0XHRjdXJyZW50RWRpdHMubGVuZ3RoID0gMDtcblxuXHRcdFx0Y29uc3Qgc2luZ2xlTGluZUVkaXQgPSBMaW5lUmVwbGFjZW1lbnQuZnJvbVNpbmdsZVRleHRFZGl0KHNpbmdsZUVkaXQsIGluaXRpYWxWYWx1ZSk7XG5cdFx0XHRyZXN1bHQucHVzaChzaW5nbGVMaW5lRWRpdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBMaW5lRWRpdChyZXN1bHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGVGcm9tVW5zb3J0ZWQoZWRpdHM6IHJlYWRvbmx5IExpbmVSZXBsYWNlbWVudFtdKTogTGluZUVkaXQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGVkaXRzLnNsaWNlKCk7XG5cdFx0cmVzdWx0LnNvcnQoY29tcGFyZUJ5KGkgPT4gaS5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBudW1iZXJDb21wYXJhdG9yKSk7XG5cdFx0cmV0dXJuIG5ldyBMaW5lRWRpdChyZXN1bHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0LyoqXG5cdFx0ICogSGF2ZSB0byBiZSBzb3J0ZWQgYnkgc3RhcnQgbGluZSBudW1iZXIgYW5kIG5vbi1pbnRlcnNlY3RpbmcuXG5cdFx0Ki9cblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVwbGFjZW1lbnRzOiByZWFkb25seSBMaW5lUmVwbGFjZW1lbnRbXVxuXHQpIHtcblx0XHRhc3NlcnQoY2hlY2tBZGphY2VudEl0ZW1zKHJlcGxhY2VtZW50cywgKGkxLCBpMikgPT4gaTEubGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPD0gaTIubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlcikpO1xuXHR9XG5cblx0cHVibGljIGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMDtcblx0fVxuXG5cdHB1YmxpYyB0b0VkaXQoaW5pdGlhbFZhbHVlOiBBYnN0cmFjdFRleHQpOiBTdHJpbmdFZGl0IHtcblx0XHRjb25zdCBlZGl0czogU3RyaW5nUmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0Y29uc3Qgc2luZ2xlRWRpdCA9IGVkaXQudG9TaW5nbGVFZGl0KGluaXRpYWxWYWx1ZSk7XG5cdFx0XHRlZGl0cy5wdXNoKHNpbmdsZUVkaXQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQoZWRpdHMpO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZW1lbnRzLm1hcChlID0+IGUudG9TdHJpbmcoKSkuam9pbignLCcpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBTZXJpYWxpemVkTGluZUVkaXQge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50cy5tYXAoZSA9PiBlLnNlcmlhbGl6ZSgpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXROZXdMaW5lUmFuZ2VzKCk6IExpbmVSYW5nZVtdIHtcblx0XHRjb25zdCByYW5nZXM6IExpbmVSYW5nZVtdID0gW107XG5cdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRyYW5nZXMucHVzaChMaW5lUmFuZ2Uub2ZMZW5ndGgoZS5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgb2Zmc2V0LCBlLm5ld0xpbmVzLmxlbmd0aCksKTtcblx0XHRcdG9mZnNldCArPSBlLm5ld0xpbmVzLmxlbmd0aCAtIGUubGluZVJhbmdlLmxlbmd0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHJhbmdlcztcblx0fVxuXG5cdHB1YmxpYyBtYXBMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGxpbmVEZWx0YSA9IDA7XG5cdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRpZiAoZS5saW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA+IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGxpbmVEZWx0YSArPSBlLm5ld0xpbmVzLmxlbmd0aCAtIGUubGluZVJhbmdlLmxlbmd0aDtcblx0XHR9XG5cdFx0cmV0dXJuIGxpbmVOdW1iZXIgKyBsaW5lRGVsdGE7XG5cdH1cblxuXHRwdWJsaWMgbWFwTGluZVJhbmdlKGxpbmVSYW5nZTogTGluZVJhbmdlKTogTGluZVJhbmdlIHtcblx0XHRyZXR1cm4gbmV3IExpbmVSYW5nZShcblx0XHRcdHRoaXMubWFwTGluZU51bWJlcihsaW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSxcblx0XHRcdHRoaXMubWFwTGluZU51bWJlcihsaW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSksXG5cdFx0KTtcblx0fVxuXG5cblx0LyoqIFRPRE8gaW1wcm92ZSwgZG9udCByZXF1aXJlIG9yaWdpbmFsTGluZXMgKi9cblx0cHVibGljIG1hcEJhY2tMaW5lUmFuZ2UobGluZVJhbmdlOiBMaW5lUmFuZ2UsIG9yaWdpbmFsTGluZXM6IHN0cmluZ1tdKTogTGluZVJhbmdlIHtcblx0XHRjb25zdCBpID0gdGhpcy5pbnZlcnNlKG9yaWdpbmFsTGluZXMpO1xuXHRcdHJldHVybiBpLm1hcExpbmVSYW5nZShsaW5lUmFuZ2UpO1xuXHR9XG5cblx0cHVibGljIHRvdWNoZXMob3RoZXI6IExpbmVFZGl0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZW1lbnRzLnNvbWUoZTEgPT4gb3RoZXIucmVwbGFjZW1lbnRzLnNvbWUoZTIgPT4gZTEubGluZVJhbmdlLmludGVyc2VjdChlMi5saW5lUmFuZ2UpKSk7XG5cdH1cblxuXHRwdWJsaWMgcmViYXNlKGJhc2U6IExpbmVFZGl0KTogTGluZUVkaXQge1xuXHRcdHJldHVybiBuZXcgTGluZUVkaXQoXG5cdFx0XHR0aGlzLnJlcGxhY2VtZW50cy5tYXAoZSA9PiBuZXcgTGluZVJlcGxhY2VtZW50KGJhc2UubWFwTGluZVJhbmdlKGUubGluZVJhbmdlKSwgZS5uZXdMaW5lcykpLFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgaHVtYW5SZWFkYWJsZVBhdGNoKG9yaWdpbmFsTGluZXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRmdW5jdGlvbiBwdXNoTGluZShvcmlnaW5hbExpbmVOdW1iZXI6IG51bWJlciwgbW9kaWZpZWRMaW5lTnVtYmVyOiBudW1iZXIsIGtpbmQ6ICd1bm1vZGlmaWVkJyB8ICdkZWxldGVkJyB8ICdhZGRlZCcsIGNvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc3BlY2lhbENoYXIgPSAoa2luZCA9PT0gJ3VubW9kaWZpZWQnID8gJyAnIDogKGtpbmQgPT09ICdkZWxldGVkJyA/ICctJyA6ICcrJykpO1xuXG5cdFx0XHRpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRlbnQgPSAnW1tbW1sgV0FSTklORzogTElORSBET0VTIE5PVCBFWElTVCBdXV1dXSc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9yaWdMbiA9IG9yaWdpbmFsTGluZU51bWJlciA9PT0gLTEgPyAnICAgJyA6IG9yaWdpbmFsTGluZU51bWJlci50b1N0cmluZygpLnBhZFN0YXJ0KDMsICcgJyk7XG5cdFx0XHRjb25zdCBtb2RMbiA9IG1vZGlmaWVkTGluZU51bWJlciA9PT0gLTEgPyAnICAgJyA6IG1vZGlmaWVkTGluZU51bWJlci50b1N0cmluZygpLnBhZFN0YXJ0KDMsICcgJyk7XG5cblx0XHRcdHJlc3VsdC5wdXNoKGAke3NwZWNpYWxDaGFyfSAke29yaWdMbn0gJHttb2RMbn0gJHtjb250ZW50fWApO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHB1c2hTZXBlcmF0b3IoKSB7XG5cdFx0XHRyZXN1bHQucHVzaCgnLS0tJyk7XG5cdFx0fVxuXG5cdFx0bGV0IGxpbmVEZWx0YSA9IDA7XG5cdFx0bGV0IGZpcnN0ID0gdHJ1ZTtcblxuXHRcdGZvciAoY29uc3QgZWRpdHMgb2YgZ3JvdXBBZGphY2VudEJ5KHRoaXMucmVwbGFjZW1lbnRzLCAoZTEsIGUyKSA9PiBlMS5saW5lUmFuZ2UuZGlzdGFuY2VUb1JhbmdlKGUyLmxpbmVSYW5nZSkgPD0gNSkpIHtcblx0XHRcdGlmICghZmlyc3QpIHtcblx0XHRcdFx0cHVzaFNlcGVyYXRvcigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zmlyc3QgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGxhc3RMaW5lTnVtYmVyID0gZWRpdHNbMF0ubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDI7XG5cblx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gTWF0aC5tYXgoMSwgbGFzdExpbmVOdW1iZXIpOyBpIDwgZWRpdC5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdFx0XHRwdXNoTGluZShpLCBpICsgbGluZURlbHRhLCAndW5tb2RpZmllZCcsIG9yaWdpbmFsTGluZXNbaSAtIDFdKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gZWRpdC5saW5lUmFuZ2U7XG5cdFx0XHRcdGNvbnN0IG5ld0xpbmVzID0gZWRpdC5uZXdMaW5lcztcblx0XHRcdFx0Zm9yIChjb25zdCByZXBsYWNlTGluZU51bWJlciBvZiByYW5nZS5tYXBUb0xpbmVBcnJheShuID0+IG4pKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IG9yaWdpbmFsTGluZXNbcmVwbGFjZUxpbmVOdW1iZXIgLSAxXTtcblx0XHRcdFx0XHRwdXNoTGluZShyZXBsYWNlTGluZU51bWJlciwgLTEsICdkZWxldGVkJywgbGluZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuZXdMaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmUgPSBuZXdMaW5lc1tpXTtcblx0XHRcdFx0XHRwdXNoTGluZSgtMSwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgbGluZURlbHRhICsgaSwgJ2FkZGVkJywgbGluZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsYXN0TGluZU51bWJlciA9IHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cblx0XHRcdFx0bGluZURlbHRhICs9IGVkaXQubmV3TGluZXMubGVuZ3RoIC0gZWRpdC5saW5lUmFuZ2UubGVuZ3RoO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBpID0gbGFzdExpbmVOdW1iZXI7IGkgPD0gTWF0aC5taW4obGFzdExpbmVOdW1iZXIgKyAyLCBvcmlnaW5hbExpbmVzLmxlbmd0aCk7IGkrKykge1xuXHRcdFx0XHRwdXNoTGluZShpLCBpICsgbGluZURlbHRhLCAndW5tb2RpZmllZCcsIG9yaWdpbmFsTGluZXNbaSAtIDFdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHVibGljIGFwcGx5KGxpbmVzOiBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRsZXQgY3VycmVudExpbmVJbmRleCA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdHdoaWxlIChjdXJyZW50TGluZUluZGV4IDwgZWRpdC5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChsaW5lc1tjdXJyZW50TGluZUluZGV4XSk7XG5cdFx0XHRcdGN1cnJlbnRMaW5lSW5kZXgrKztcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBuZXdMaW5lIG9mIGVkaXQubmV3TGluZXMpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobmV3TGluZSk7XG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnRMaW5lSW5kZXggPSBlZGl0LmxpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMTtcblx0XHR9XG5cblx0XHR3aGlsZSAoY3VycmVudExpbmVJbmRleCA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0LnB1c2gobGluZXNbY3VycmVudExpbmVJbmRleF0pO1xuXHRcdFx0Y3VycmVudExpbmVJbmRleCsrO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgaW52ZXJzZShvcmlnaW5hbExpbmVzOiBzdHJpbmdbXSk6IExpbmVFZGl0IHtcblx0XHRjb25zdCBuZXdSYW5nZXMgPSB0aGlzLmdldE5ld0xpbmVSYW5nZXMoKTtcblx0XHRyZXR1cm4gbmV3IExpbmVFZGl0KHRoaXMucmVwbGFjZW1lbnRzLm1hcCgoZSwgaWR4KSA9PiBuZXcgTGluZVJlcGxhY2VtZW50KFxuXHRcdFx0bmV3UmFuZ2VzW2lkeF0sXG5cdFx0XHRvcmlnaW5hbExpbmVzLnNsaWNlKGUubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIGUubGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxKSxcblx0XHQpKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExpbmVSZXBsYWNlbWVudCB7XG5cdHB1YmxpYyBzdGF0aWMgZGVzZXJpYWxpemUoZTogU2VyaWFsaXplZExpbmVSZXBsYWNlbWVudCk6IExpbmVSZXBsYWNlbWVudCB7XG5cdFx0cmV0dXJuIG5ldyBMaW5lUmVwbGFjZW1lbnQoXG5cdFx0XHRMaW5lUmFuZ2Uub2ZMZW5ndGgoZVswXSwgZVsxXSAtIGVbMF0pLFxuXHRcdFx0ZVsyXSxcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tU2luZ2xlVGV4dEVkaXQoZWRpdDogVGV4dFJlcGxhY2VtZW50LCBpbml0aWFsVmFsdWU6IEFic3RyYWN0VGV4dCk6IExpbmVSZXBsYWNlbWVudCB7XG5cdFx0Ly8gMTogYWJbY2RlXG5cdFx0Ly8gMjogZmdoaWprXG5cdFx0Ly8gMzogbG1uXW9wcVxuXG5cdFx0Ly8gcmVwbGFjZWQgd2l0aFxuXG5cdFx0Ly8gMW46IDEyM1xuXHRcdC8vIDJuOiA0NTZcblx0XHQvLyAzbjogNzg5XG5cblx0XHQvLyBzaW1wbGUgc29sdXRpb246IHJlcGxhY2UgWzEuLjQpIHdpdGggWzFuLi40bilcblxuXHRcdGNvbnN0IG5ld0xpbmVzID0gc3BsaXRMaW5lcyhlZGl0LnRleHQpO1xuXHRcdGxldCBzdGFydExpbmVOdW1iZXIgPSBlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBzdXJ2aXZpbmdGaXJzdExpbmVUZXh0ID0gaW5pdGlhbFZhbHVlLmdldFZhbHVlT2ZSYW5nZShSYW5nZS5mcm9tUG9zaXRpb25zKFxuXHRcdFx0bmV3IFBvc2l0aW9uKGVkaXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKSxcblx0XHRcdGVkaXQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpXG5cdFx0KSk7XG5cdFx0bmV3TGluZXNbMF0gPSBzdXJ2aXZpbmdGaXJzdExpbmVUZXh0ICsgbmV3TGluZXNbMF07XG5cblx0XHRsZXQgZW5kTGluZU51bWJlckV4ID0gZWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMTtcblx0XHRjb25zdCBlZGl0RW5kTGluZU51bWJlck1heENvbHVtbiA9IGluaXRpYWxWYWx1ZS5nZXRUcmFuc2Zvcm1lcigpLmdldExpbmVMZW5ndGgoZWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyKSArIDE7XG5cdFx0Y29uc3Qgc3Vydml2aW5nRW5kTGluZVRleHQgPSBpbml0aWFsVmFsdWUuZ2V0VmFsdWVPZlJhbmdlKFJhbmdlLmZyb21Qb3NpdGlvbnMoXG5cdFx0XHRlZGl0LnJhbmdlLmdldEVuZFBvc2l0aW9uKCksXG5cdFx0XHRuZXcgUG9zaXRpb24oZWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyLCBlZGl0RW5kTGluZU51bWJlck1heENvbHVtbilcblx0XHQpKTtcblx0XHRuZXdMaW5lc1tuZXdMaW5lcy5sZW5ndGggLSAxXSA9IG5ld0xpbmVzW25ld0xpbmVzLmxlbmd0aCAtIDFdICsgc3Vydml2aW5nRW5kTGluZVRleHQ7XG5cblx0XHQvLyBSZXBsYWNpbmcgW3N0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlckV4KSB3aXRoIG5ld0xpbmVzIHdvdWxkIGJlIGNvcnJlY3QsIGhvd2V2ZXIgaXQgbWlnaHQgbm90IGJlIG1pbmltYWwuXG5cblx0XHRjb25zdCBzdGFydEJlZm9yZU5ld0xpbmUgPSBlZGl0LnJhbmdlLnN0YXJ0Q29sdW1uID09PSBpbml0aWFsVmFsdWUuZ2V0VHJhbnNmb3JtZXIoKS5nZXRMaW5lTGVuZ3RoKGVkaXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSArIDE7XG5cdFx0Y29uc3QgZW5kQWZ0ZXJOZXdMaW5lID0gZWRpdC5yYW5nZS5lbmRDb2x1bW4gPT09IDE7XG5cblx0XHRpZiAoc3RhcnRCZWZvcmVOZXdMaW5lICYmIG5ld0xpbmVzWzBdLmxlbmd0aCA9PT0gc3Vydml2aW5nRmlyc3RMaW5lVGV4dC5sZW5ndGgpIHtcblx0XHRcdC8vIHRoZSByZXBsYWNlbWVudCB3b3VsZCBub3QgZGVsZXRlIGFueSB0ZXh0IG9uIHRoZSBmaXJzdCBsaW5lXG5cdFx0XHRzdGFydExpbmVOdW1iZXIrKztcblx0XHRcdG5ld0xpbmVzLnNoaWZ0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0xpbmVzLmxlbmd0aCA+IDAgJiYgc3RhcnRMaW5lTnVtYmVyIDwgZW5kTGluZU51bWJlckV4ICYmIGVuZEFmdGVyTmV3TGluZSAmJiBuZXdMaW5lc1tuZXdMaW5lcy5sZW5ndGggLSAxXS5sZW5ndGggPT09IHN1cnZpdmluZ0VuZExpbmVUZXh0Lmxlbmd0aCkge1xuXHRcdFx0Ly8gdGhlIHJlcGxhY2VtZW50IHdvdWxkIG5vdCBkZWxldGUgYW55IHRleHQgb24gdGhlIGxhc3QgbGluZVxuXHRcdFx0ZW5kTGluZU51bWJlckV4LS07XG5cdFx0XHRuZXdMaW5lcy5wb3AoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IExpbmVSZXBsYWNlbWVudChuZXcgTGluZVJhbmdlKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlckV4KSwgbmV3TGluZXMpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVSYW5nZTogTGluZVJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBuZXdMaW5lczogcmVhZG9ubHkgc3RyaW5nW10sXG5cdCkgeyB9XG5cblx0cHVibGljIHRvU2luZ2xlVGV4dEVkaXQoaW5pdGlhbFZhbHVlOiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnQge1xuXHRcdGlmICh0aGlzLm5ld0xpbmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gRGVsZXRpb25cblx0XHRcdGNvbnN0IHRleHRMZW4gPSBpbml0aWFsVmFsdWUuZ2V0VHJhbnNmb3JtZXIoKS50ZXh0TGVuZ3RoO1xuXHRcdFx0aWYgKHRoaXMubGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPT09IHRleHRMZW4ubGluZUNvdW50ICsgMikge1xuXHRcdFx0XHRsZXQgc3RhcnRQb3M6IFBvc2l0aW9uO1xuXHRcdFx0XHRpZiAodGhpcy5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gMSkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHRoaXMubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDE7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBpbml0aWFsVmFsdWUuZ2V0VHJhbnNmb3JtZXIoKS5nZXRMaW5lTGVuZ3RoKHN0YXJ0TGluZU51bWJlcikgKyAxO1xuXHRcdFx0XHRcdHN0YXJ0UG9zID0gbmV3IFBvc2l0aW9uKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIERlbGV0ZSBldmVyeXRoaW5nLlxuXHRcdFx0XHRcdC8vIEluIHRlcm1zIG9mIGxpbmVzLCB0aGlzIHdvdWxkIGVuZCB1cCB3aXRoIDAgbGluZXMuXG5cdFx0XHRcdFx0Ly8gSG93ZXZlciwgYSBzdHJpbmcgaGFzIGFsd2F5cyAxIGxpbmUgKHdoaWNoIGNhbiBiZSBlbXB0eSkuXG5cdFx0XHRcdFx0c3RhcnRQb3MgPSBuZXcgUG9zaXRpb24oMSwgMSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsYXN0UG9zaXRpb24gPSB0ZXh0TGVuLmFkZFRvUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXh0UmVwbGFjZW1lbnQoUmFuZ2UuZnJvbVBvc2l0aW9ucyhzdGFydFBvcywgbGFzdFBvc2l0aW9uKSwgJycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXh0UmVwbGFjZW1lbnQobmV3IFJhbmdlKHRoaXMubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSwgdGhpcy5saW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSwgMSksICcnKTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAodGhpcy5saW5lUmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0Ly8gSW5zZXJ0aW9uXG5cblx0XHRcdGxldCBlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0XHRsZXQgY29sdW1uOiBudW1iZXI7XG5cdFx0XHRsZXQgdGV4dDogc3RyaW5nO1xuXHRcdFx0Y29uc3QgaW5zZXJ0aW9uTGluZSA9IHRoaXMubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGlmIChpbnNlcnRpb25MaW5lID09PSBpbml0aWFsVmFsdWUuZ2V0VHJhbnNmb3JtZXIoKS50ZXh0TGVuZ3RoLmxpbmVDb3VudCArIDIpIHtcblx0XHRcdFx0ZW5kTGluZU51bWJlciA9IGluc2VydGlvbkxpbmUgLSAxO1xuXHRcdFx0XHRjb2x1bW4gPSBpbml0aWFsVmFsdWUuZ2V0VHJhbnNmb3JtZXIoKS5nZXRMaW5lTGVuZ3RoKGVuZExpbmVOdW1iZXIpICsgMTtcblx0XHRcdFx0dGV4dCA9IHRoaXMubmV3TGluZXMubWFwKGwgPT4gJ1xcbicgKyBsKS5qb2luKCcnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBpbnNlcnRpb25MaW5lO1xuXHRcdFx0XHRjb2x1bW4gPSAxO1xuXHRcdFx0XHR0ZXh0ID0gdGhpcy5uZXdMaW5lcy5tYXAobCA9PiBsICsgJ1xcbicpLmpvaW4oJycpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBUZXh0UmVwbGFjZW1lbnQoUmFuZ2UuZnJvbVBvc2l0aW9ucyhuZXcgUG9zaXRpb24oZW5kTGluZU51bWJlciwgY29sdW1uKSksIHRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdGhpcy5saW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDE7XG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyTWF4Q29sdW1uID0gaW5pdGlhbFZhbHVlLmdldFRyYW5zZm9ybWVyKCkuZ2V0TGluZUxlbmd0aChlbmRMaW5lTnVtYmVyKSArIDE7XG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShcblx0XHRcdFx0dGhpcy5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHQxLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyTWF4Q29sdW1uXG5cdFx0XHQpO1xuXHRcdFx0Ly8gRG9uJ3QgYWRkIFxcbiB0byB0aGUgbGFzdCBsaW5lLiBUaGlzIGlzIGJlY2F1c2Ugd2Ugc3VidHJhY3Qgb25lIGZyb20gbGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgZm9yIGVuZExpbmVOdW1iZXIuXG5cdFx0XHRjb25zdCB0ZXh0ID0gdGhpcy5uZXdMaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCB0ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdG9TaW5nbGVFZGl0KGluaXRpYWxWYWx1ZTogQWJzdHJhY3RUZXh0KTogU3RyaW5nUmVwbGFjZW1lbnQge1xuXHRcdGNvbnN0IHRleHRFZGl0ID0gdGhpcy50b1NpbmdsZVRleHRFZGl0KGluaXRpYWxWYWx1ZSk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBpbml0aWFsVmFsdWUuZ2V0VHJhbnNmb3JtZXIoKS5nZXRPZmZzZXRSYW5nZSh0ZXh0RWRpdC5yYW5nZSk7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudChyYW5nZSwgdGV4dEVkaXQudGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5saW5lUmFuZ2V9LT4ke0pTT04uc3RyaW5naWZ5KHRoaXMubmV3TGluZXMpfWA7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IFNlcmlhbGl6ZWRMaW5lUmVwbGFjZW1lbnQge1xuXHRcdHJldHVybiBbXG5cdFx0XHR0aGlzLmxpbmVSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHR0aGlzLmxpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLFxuXHRcdFx0dGhpcy5uZXdMaW5lcyxcblx0XHRdO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUNvbW1vblN1ZmZpeFByZWZpeExpbmVzKGluaXRpYWxWYWx1ZTogQWJzdHJhY3RUZXh0KTogTGluZVJlcGxhY2VtZW50IHtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gdGhpcy5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGxldCBlbmRMaW5lTnVtYmVyRXggPSB0aGlzLmxpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXG5cdFx0bGV0IHRyaW1TdGFydENvdW50ID0gMDtcblx0XHR3aGlsZSAoXG5cdFx0XHRzdGFydExpbmVOdW1iZXIgPCBlbmRMaW5lTnVtYmVyRXggJiYgdHJpbVN0YXJ0Q291bnQgPCB0aGlzLm5ld0xpbmVzLmxlbmd0aFxuXHRcdFx0JiYgdGhpcy5uZXdMaW5lc1t0cmltU3RhcnRDb3VudF0gPT09IGluaXRpYWxWYWx1ZS5nZXRMaW5lQXQoc3RhcnRMaW5lTnVtYmVyKVxuXHRcdCkge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyKys7XG5cdFx0XHR0cmltU3RhcnRDb3VudCsrO1xuXHRcdH1cblxuXHRcdGxldCB0cmltRW5kQ291bnQgPSAwO1xuXHRcdHdoaWxlIChcblx0XHRcdHN0YXJ0TGluZU51bWJlciA8IGVuZExpbmVOdW1iZXJFeCAmJiB0cmltRW5kQ291bnQgKyB0cmltU3RhcnRDb3VudCA8IHRoaXMubmV3TGluZXMubGVuZ3RoXG5cdFx0XHQmJiB0aGlzLm5ld0xpbmVzW3RoaXMubmV3TGluZXMubGVuZ3RoIC0gMSAtIHRyaW1FbmRDb3VudF0gPT09IGluaXRpYWxWYWx1ZS5nZXRMaW5lQXQoZW5kTGluZU51bWJlckV4IC0gMSlcblx0XHQpIHtcblx0XHRcdGVuZExpbmVOdW1iZXJFeC0tO1xuXHRcdFx0dHJpbUVuZENvdW50Kys7XG5cdFx0fVxuXG5cdFx0aWYgKHRyaW1TdGFydENvdW50ID09PSAwICYmIHRyaW1FbmRDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTGluZVJlcGxhY2VtZW50KG5ldyBMaW5lUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyRXgpLCB0aGlzLm5ld0xpbmVzLnNsaWNlKHRyaW1TdGFydENvdW50LCB0aGlzLm5ld0xpbmVzLmxlbmd0aCAtIHRyaW1FbmRDb3VudCkpO1xuXHR9XG5cblx0cHVibGljIHRvTGluZUVkaXQoKTogTGluZUVkaXQge1xuXHRcdHJldHVybiBuZXcgTGluZUVkaXQoW3RoaXNdKTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBTZXJpYWxpemVkTGluZUVkaXQgPSBTZXJpYWxpemVkTGluZVJlcGxhY2VtZW50W107XG5leHBvcnQgdHlwZSBTZXJpYWxpemVkTGluZVJlcGxhY2VtZW50ID0gW3N0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIG5ld0xpbmVzOiByZWFkb25seSBzdHJpbmdbXV07XG5cbmV4cG9ydCBuYW1lc3BhY2UgU2VyaWFsaXplZExpbmVSZXBsYWNlbWVudCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIFNlcmlhbGl6ZWRMaW5lUmVwbGFjZW1lbnQge1xuXHRcdHJldHVybiAoXG5cdFx0XHRBcnJheS5pc0FycmF5KHRoaW5nKVxuXHRcdFx0JiYgdGhpbmcubGVuZ3RoID09PSAzXG5cdFx0XHQmJiB0eXBlb2YgdGhpbmdbMF0gPT09ICdudW1iZXInXG5cdFx0XHQmJiB0eXBlb2YgdGhpbmdbMV0gPT09ICdudW1iZXInXG5cdFx0XHQmJiBBcnJheS5pc0FycmF5KHRoaW5nWzJdKVxuXHRcdFx0JiYgdGhpbmdbMl0uZXZlcnkoKGU6IHVua25vd24pID0+IHR5cGVvZiBlID09PSAnc3RyaW5nJylcblx0XHQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVcsaUJBQWlCLHdCQUF3QjtBQUM3RCxTQUFTLFFBQVEsMEJBQTBCO0FBQzNDLFNBQVMsa0JBQWtCO0FBQzNCLFNB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
