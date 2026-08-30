import { findLastIdxMonotonous, findLastMonotonous, findFirstMonotonous } from "../../../../base/common/arraysFind.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { OffsetRange } from "../../core/ranges/offsetRange.js";
import { Position } from "../../core/position.js";
import { Range } from "../../core/range.js";
import { isSpace } from "./utils.js";
class LinesSliceCharSequence {
  constructor(lines, range, considerWhitespaceChanges) {
    this.lines = lines;
    this.range = range;
    this.considerWhitespaceChanges = considerWhitespaceChanges;
    this.elements = [];
    this.firstElementOffsetByLineIdx = [];
    this.lineStartOffsets = [];
    this.trimmedWsLengthsByLineIdx = [];
    this.firstElementOffsetByLineIdx.push(0);
    for (let lineNumber = this.range.startLineNumber; lineNumber <= this.range.endLineNumber; lineNumber++) {
      let line = lines[lineNumber - 1];
      let lineStartOffset = 0;
      if (lineNumber === this.range.startLineNumber && this.range.startColumn > 1) {
        lineStartOffset = this.range.startColumn - 1;
        line = line.substring(lineStartOffset);
      }
      this.lineStartOffsets.push(lineStartOffset);
      let trimmedWsLength = 0;
      if (!considerWhitespaceChanges) {
        const trimmedStartLine = line.trimStart();
        trimmedWsLength = line.length - trimmedStartLine.length;
        line = trimmedStartLine.trimEnd();
      }
      this.trimmedWsLengthsByLineIdx.push(trimmedWsLength);
      const lineLength = lineNumber === this.range.endLineNumber ? Math.min(this.range.endColumn - 1 - lineStartOffset - trimmedWsLength, line.length) : line.length;
      for (let i = 0; i < lineLength; i++) {
        this.elements.push(line.charCodeAt(i));
      }
      if (lineNumber < this.range.endLineNumber) {
        this.elements.push("\n".charCodeAt(0));
        this.firstElementOffsetByLineIdx.push(this.elements.length);
      }
    }
  }
  toString() {
    return `Slice: "${this.text}"`;
  }
  get text() {
    return this.getText(new OffsetRange(0, this.length));
  }
  getText(range) {
    return this.elements.slice(range.start, range.endExclusive).map((e) => String.fromCharCode(e)).join("");
  }
  getElement(offset) {
    return this.elements[offset];
  }
  get length() {
    return this.elements.length;
  }
  getBoundaryScore(length) {
    const prevCategory = getCategory(length > 0 ? this.elements[length - 1] : -1);
    const nextCategory = getCategory(length < this.elements.length ? this.elements[length] : -1);
    if (prevCategory === 7 /* LineBreakCR */ && nextCategory === 8 /* LineBreakLF */) {
      return 0;
    }
    if (prevCategory === 8 /* LineBreakLF */) {
      return 150;
    }
    let score2 = 0;
    if (prevCategory !== nextCategory) {
      score2 += 10;
      if (prevCategory === 0 /* WordLower */ && nextCategory === 1 /* WordUpper */) {
        score2 += 1;
      }
    }
    score2 += getCategoryBoundaryScore(prevCategory);
    score2 += getCategoryBoundaryScore(nextCategory);
    return score2;
  }
  translateOffset(offset, preference = "right") {
    const i = findLastIdxMonotonous(this.firstElementOffsetByLineIdx, (value) => value <= offset);
    const lineOffset = offset - this.firstElementOffsetByLineIdx[i];
    return new Position(
      this.range.startLineNumber + i,
      1 + this.lineStartOffsets[i] + lineOffset + (lineOffset === 0 && preference === "left" ? 0 : this.trimmedWsLengthsByLineIdx[i])
    );
  }
  translateRange(range) {
    const pos1 = this.translateOffset(range.start, "right");
    const pos2 = this.translateOffset(range.endExclusive, "left");
    if (pos2.isBefore(pos1)) {
      return Range.fromPositions(pos2, pos2);
    }
    return Range.fromPositions(pos1, pos2);
  }
  /**
   * Finds the word that contains the character at the given offset
   */
  findWordContaining(offset) {
    if (offset < 0 || offset >= this.elements.length) {
      return void 0;
    }
    if (!isWordChar(this.elements[offset])) {
      return void 0;
    }
    let start = offset;
    while (start > 0 && isWordChar(this.elements[start - 1])) {
      start--;
    }
    let end = offset;
    while (end < this.elements.length && isWordChar(this.elements[end])) {
      end++;
    }
    return new OffsetRange(start, end);
  }
  /** fooBar has the two sub-words foo and bar */
  findSubWordContaining(offset) {
    if (offset < 0 || offset >= this.elements.length) {
      return void 0;
    }
    if (!isWordChar(this.elements[offset])) {
      return void 0;
    }
    let start = offset;
    while (start > 0 && isWordChar(this.elements[start - 1]) && !isUpperCase(this.elements[start])) {
      start--;
    }
    let end = offset;
    while (end < this.elements.length && isWordChar(this.elements[end]) && !isUpperCase(this.elements[end])) {
      end++;
    }
    return new OffsetRange(start, end);
  }
  countLinesIn(range) {
    return this.translateOffset(range.endExclusive).lineNumber - this.translateOffset(range.start).lineNumber;
  }
  isStronglyEqual(offset1, offset2) {
    return this.elements[offset1] === this.elements[offset2];
  }
  extendToFullLines(range) {
    const start = findLastMonotonous(this.firstElementOffsetByLineIdx, (x) => x <= range.start) ?? 0;
    const end = findFirstMonotonous(this.firstElementOffsetByLineIdx, (x) => range.endExclusive <= x) ?? this.elements.length;
    return new OffsetRange(start, end);
  }
}
function isWordChar(charCode) {
  return charCode >= CharCode.a && charCode <= CharCode.z || charCode >= CharCode.A && charCode <= CharCode.Z || charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9;
}
function isUpperCase(charCode) {
  return charCode >= CharCode.A && charCode <= CharCode.Z;
}
var CharBoundaryCategory = /* @__PURE__ */ ((CharBoundaryCategory2) => {
  CharBoundaryCategory2[CharBoundaryCategory2["WordLower"] = 0] = "WordLower";
  CharBoundaryCategory2[CharBoundaryCategory2["WordUpper"] = 1] = "WordUpper";
  CharBoundaryCategory2[CharBoundaryCategory2["WordNumber"] = 2] = "WordNumber";
  CharBoundaryCategory2[CharBoundaryCategory2["End"] = 3] = "End";
  CharBoundaryCategory2[CharBoundaryCategory2["Other"] = 4] = "Other";
  CharBoundaryCategory2[CharBoundaryCategory2["Separator"] = 5] = "Separator";
  CharBoundaryCategory2[CharBoundaryCategory2["Space"] = 6] = "Space";
  CharBoundaryCategory2[CharBoundaryCategory2["LineBreakCR"] = 7] = "LineBreakCR";
  CharBoundaryCategory2[CharBoundaryCategory2["LineBreakLF"] = 8] = "LineBreakLF";
  return CharBoundaryCategory2;
})(CharBoundaryCategory || {});
const score = {
  [0 /* WordLower */]: 0,
  [1 /* WordUpper */]: 0,
  [2 /* WordNumber */]: 0,
  [3 /* End */]: 10,
  [4 /* Other */]: 2,
  [5 /* Separator */]: 30,
  [6 /* Space */]: 3,
  [7 /* LineBreakCR */]: 10,
  [8 /* LineBreakLF */]: 10
};
function getCategoryBoundaryScore(category) {
  return score[category];
}
function getCategory(charCode) {
  if (charCode === CharCode.LineFeed) {
    return 8 /* LineBreakLF */;
  } else if (charCode === CharCode.CarriageReturn) {
    return 7 /* LineBreakCR */;
  } else if (isSpace(charCode)) {
    return 6 /* Space */;
  } else if (charCode >= CharCode.a && charCode <= CharCode.z) {
    return 0 /* WordLower */;
  } else if (charCode >= CharCode.A && charCode <= CharCode.Z) {
    return 1 /* WordUpper */;
  } else if (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9) {
    return 2 /* WordNumber */;
  } else if (charCode === -1) {
    return 3 /* End */;
  } else if (charCode === CharCode.Comma || charCode === CharCode.Semicolon) {
    return 5 /* Separator */;
  } else {
    return 4 /* Other */;
  }
}
export {
  LinesSliceCharSequence
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcZGlmZlxcZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyXFxsaW5lc1NsaWNlQ2hhclNlcXVlbmNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZmluZExhc3RJZHhNb25vdG9ub3VzLCBmaW5kTGFzdE1vbm90b25vdXMsIGZpbmRGaXJzdE1vbm90b25vdXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZXF1ZW5jZSB9IGZyb20gJy4vYWxnb3JpdGhtcy9kaWZmQWxnb3JpdGhtLmpzJztcbmltcG9ydCB7IGlzU3BhY2UgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuZXhwb3J0IGNsYXNzIExpbmVzU2xpY2VDaGFyU2VxdWVuY2UgaW1wbGVtZW50cyBJU2VxdWVuY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnRzOiBudW1iZXJbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpcnN0RWxlbWVudE9mZnNldEJ5TGluZUlkeDogbnVtYmVyW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBsaW5lU3RhcnRPZmZzZXRzOiBudW1iZXJbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyaW1tZWRXc0xlbmd0aHNCeUxpbmVJZHg6IG51bWJlcltdID0gW107XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGxpbmVzOiBzdHJpbmdbXSwgcHJpdmF0ZSByZWFkb25seSByYW5nZTogUmFuZ2UsIHB1YmxpYyByZWFkb25seSBjb25zaWRlcldoaXRlc3BhY2VDaGFuZ2VzOiBib29sZWFuKSB7XG5cdFx0dGhpcy5maXJzdEVsZW1lbnRPZmZzZXRCeUxpbmVJZHgucHVzaCgwKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gdGhpcy5yYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gdGhpcy5yYW5nZS5lbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGxldCBsaW5lID0gbGluZXNbbGluZU51bWJlciAtIDFdO1xuXHRcdFx0bGV0IGxpbmVTdGFydE9mZnNldCA9IDA7XG5cdFx0XHRpZiAobGluZU51bWJlciA9PT0gdGhpcy5yYW5nZS5zdGFydExpbmVOdW1iZXIgJiYgdGhpcy5yYW5nZS5zdGFydENvbHVtbiA+IDEpIHtcblx0XHRcdFx0bGluZVN0YXJ0T2Zmc2V0ID0gdGhpcy5yYW5nZS5zdGFydENvbHVtbiAtIDE7XG5cdFx0XHRcdGxpbmUgPSBsaW5lLnN1YnN0cmluZyhsaW5lU3RhcnRPZmZzZXQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5saW5lU3RhcnRPZmZzZXRzLnB1c2gobGluZVN0YXJ0T2Zmc2V0KTtcblxuXHRcdFx0bGV0IHRyaW1tZWRXc0xlbmd0aCA9IDA7XG5cdFx0XHRpZiAoIWNvbnNpZGVyV2hpdGVzcGFjZUNoYW5nZXMpIHtcblx0XHRcdFx0Y29uc3QgdHJpbW1lZFN0YXJ0TGluZSA9IGxpbmUudHJpbVN0YXJ0KCk7XG5cdFx0XHRcdHRyaW1tZWRXc0xlbmd0aCA9IGxpbmUubGVuZ3RoIC0gdHJpbW1lZFN0YXJ0TGluZS5sZW5ndGg7XG5cdFx0XHRcdGxpbmUgPSB0cmltbWVkU3RhcnRMaW5lLnRyaW1FbmQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudHJpbW1lZFdzTGVuZ3Roc0J5TGluZUlkeC5wdXNoKHRyaW1tZWRXc0xlbmd0aCk7XG5cblx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSBsaW5lTnVtYmVyID09PSB0aGlzLnJhbmdlLmVuZExpbmVOdW1iZXIgPyBNYXRoLm1pbih0aGlzLnJhbmdlLmVuZENvbHVtbiAtIDEgLSBsaW5lU3RhcnRPZmZzZXQgLSB0cmltbWVkV3NMZW5ndGgsIGxpbmUubGVuZ3RoKSA6IGxpbmUubGVuZ3RoO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lTGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50cy5wdXNoKGxpbmUuY2hhckNvZGVBdChpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChsaW5lTnVtYmVyIDwgdGhpcy5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudHMucHVzaCgnXFxuJy5jaGFyQ29kZUF0KDApKTtcblx0XHRcdFx0dGhpcy5maXJzdEVsZW1lbnRPZmZzZXRCeUxpbmVJZHgucHVzaCh0aGlzLmVsZW1lbnRzLmxlbmd0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dG9TdHJpbmcoKSB7XG5cdFx0cmV0dXJuIGBTbGljZTogXCIke3RoaXMudGV4dH1cImA7XG5cdH1cblxuXHRnZXQgdGV4dCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdldFRleHQobmV3IE9mZnNldFJhbmdlKDAsIHRoaXMubGVuZ3RoKSk7XG5cdH1cblxuXHRnZXRUZXh0KHJhbmdlOiBPZmZzZXRSYW5nZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHMuc2xpY2UocmFuZ2Uuc3RhcnQsIHJhbmdlLmVuZEV4Y2x1c2l2ZSkubWFwKGUgPT4gU3RyaW5nLmZyb21DaGFyQ29kZShlKSkuam9pbignJyk7XG5cdH1cblxuXHRnZXRFbGVtZW50KG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50c1tvZmZzZXRdO1xuXHR9XG5cblx0Z2V0IGxlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnRzLmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXRCb3VuZGFyeVNjb3JlKGxlbmd0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHQvLyAgIGEgICBiICAgYyAgICwgICAgICAgICAgIGQgICBlICAgZlxuXHRcdC8vIDExICAwICAgMCAgIDEyICAxNSAgNiAgIDEzICAwICAgMCAgIDExXG5cblx0XHRjb25zdCBwcmV2Q2F0ZWdvcnkgPSBnZXRDYXRlZ29yeShsZW5ndGggPiAwID8gdGhpcy5lbGVtZW50c1tsZW5ndGggLSAxXSA6IC0xKTtcblx0XHRjb25zdCBuZXh0Q2F0ZWdvcnkgPSBnZXRDYXRlZ29yeShsZW5ndGggPCB0aGlzLmVsZW1lbnRzLmxlbmd0aCA/IHRoaXMuZWxlbWVudHNbbGVuZ3RoXSA6IC0xKTtcblxuXHRcdGlmIChwcmV2Q2F0ZWdvcnkgPT09IENoYXJCb3VuZGFyeUNhdGVnb3J5LkxpbmVCcmVha0NSICYmIG5leHRDYXRlZ29yeSA9PT0gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuTGluZUJyZWFrTEYpIHtcblx0XHRcdC8vIGRvbid0IGJyZWFrIGJldHdlZW4gXFxyIGFuZCBcXG5cblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRpZiAocHJldkNhdGVnb3J5ID09PSBDaGFyQm91bmRhcnlDYXRlZ29yeS5MaW5lQnJlYWtMRikge1xuXHRcdFx0Ly8gcHJlZmVyIHRoZSBsaW5lYnJlYWsgYmVmb3JlIHRoZSBjaGFuZ2Vcblx0XHRcdHJldHVybiAxNTA7XG5cdFx0fVxuXG5cdFx0bGV0IHNjb3JlID0gMDtcblx0XHRpZiAocHJldkNhdGVnb3J5ICE9PSBuZXh0Q2F0ZWdvcnkpIHtcblx0XHRcdHNjb3JlICs9IDEwO1xuXHRcdFx0aWYgKHByZXZDYXRlZ29yeSA9PT0gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuV29yZExvd2VyICYmIG5leHRDYXRlZ29yeSA9PT0gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuV29yZFVwcGVyKSB7XG5cdFx0XHRcdHNjb3JlICs9IDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2NvcmUgKz0gZ2V0Q2F0ZWdvcnlCb3VuZGFyeVNjb3JlKHByZXZDYXRlZ29yeSk7XG5cdFx0c2NvcmUgKz0gZ2V0Q2F0ZWdvcnlCb3VuZGFyeVNjb3JlKG5leHRDYXRlZ29yeSk7XG5cblx0XHRyZXR1cm4gc2NvcmU7XG5cdH1cblxuXHRwdWJsaWMgdHJhbnNsYXRlT2Zmc2V0KG9mZnNldDogbnVtYmVyLCBwcmVmZXJlbmNlOiAnbGVmdCcgfCAncmlnaHQnID0gJ3JpZ2h0Jyk6IFBvc2l0aW9uIHtcblx0XHQvLyBmaW5kIHNtYWxsZXN0IGksIHNvIHRoYXQgbGluZUJyZWFrT2Zmc2V0c1tpXSA8PSBvZmZzZXQgdXNpbmcgYmluYXJ5IHNlYXJjaFxuXHRcdGNvbnN0IGkgPSBmaW5kTGFzdElkeE1vbm90b25vdXModGhpcy5maXJzdEVsZW1lbnRPZmZzZXRCeUxpbmVJZHgsICh2YWx1ZSkgPT4gdmFsdWUgPD0gb2Zmc2V0KTtcblx0XHRjb25zdCBsaW5lT2Zmc2V0ID0gb2Zmc2V0IC0gdGhpcy5maXJzdEVsZW1lbnRPZmZzZXRCeUxpbmVJZHhbaV07XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihcblx0XHRcdHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgaSxcblx0XHRcdDEgKyB0aGlzLmxpbmVTdGFydE9mZnNldHNbaV0gKyBsaW5lT2Zmc2V0ICsgKChsaW5lT2Zmc2V0ID09PSAwICYmIHByZWZlcmVuY2UgPT09ICdsZWZ0JykgPyAwIDogdGhpcy50cmltbWVkV3NMZW5ndGhzQnlMaW5lSWR4W2ldKVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdHJhbnNsYXRlUmFuZ2UocmFuZ2U6IE9mZnNldFJhbmdlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHBvczEgPSB0aGlzLnRyYW5zbGF0ZU9mZnNldChyYW5nZS5zdGFydCwgJ3JpZ2h0Jyk7XG5cdFx0Y29uc3QgcG9zMiA9IHRoaXMudHJhbnNsYXRlT2Zmc2V0KHJhbmdlLmVuZEV4Y2x1c2l2ZSwgJ2xlZnQnKTtcblx0XHRpZiAocG9zMi5pc0JlZm9yZShwb3MxKSkge1xuXHRcdFx0cmV0dXJuIFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zMiwgcG9zMik7XG5cdFx0fVxuXHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvczEsIHBvczIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmRzIHRoZSB3b3JkIHRoYXQgY29udGFpbnMgdGhlIGNoYXJhY3RlciBhdCB0aGUgZ2l2ZW4gb2Zmc2V0XG5cdCAqL1xuXHRwdWJsaWMgZmluZFdvcmRDb250YWluaW5nKG9mZnNldDogbnVtYmVyKTogT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGlmIChvZmZzZXQgPCAwIHx8IG9mZnNldCA+PSB0aGlzLmVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIWlzV29yZENoYXIodGhpcy5lbGVtZW50c1tvZmZzZXRdKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBmaW5kIHN0YXJ0XG5cdFx0bGV0IHN0YXJ0ID0gb2Zmc2V0O1xuXHRcdHdoaWxlIChzdGFydCA+IDAgJiYgaXNXb3JkQ2hhcih0aGlzLmVsZW1lbnRzW3N0YXJ0IC0gMV0pKSB7XG5cdFx0XHRzdGFydC0tO1xuXHRcdH1cblxuXHRcdC8vIGZpbmQgZW5kXG5cdFx0bGV0IGVuZCA9IG9mZnNldDtcblx0XHR3aGlsZSAoZW5kIDwgdGhpcy5lbGVtZW50cy5sZW5ndGggJiYgaXNXb3JkQ2hhcih0aGlzLmVsZW1lbnRzW2VuZF0pKSB7XG5cdFx0XHRlbmQrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmQpO1xuXHR9XG5cblx0LyoqIGZvb0JhciBoYXMgdGhlIHR3byBzdWItd29yZHMgZm9vIGFuZCBiYXIgKi9cblx0cHVibGljIGZpbmRTdWJXb3JkQ29udGFpbmluZyhvZmZzZXQ6IG51bWJlcik6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAob2Zmc2V0IDwgMCB8fCBvZmZzZXQgPj0gdGhpcy5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1dvcmRDaGFyKHRoaXMuZWxlbWVudHNbb2Zmc2V0XSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gZmluZCBzdGFydFxuXHRcdGxldCBzdGFydCA9IG9mZnNldDtcblx0XHR3aGlsZSAoc3RhcnQgPiAwICYmIGlzV29yZENoYXIodGhpcy5lbGVtZW50c1tzdGFydCAtIDFdKSAmJiAhaXNVcHBlckNhc2UodGhpcy5lbGVtZW50c1tzdGFydF0pKSB7XG5cdFx0XHRzdGFydC0tO1xuXHRcdH1cblxuXHRcdC8vIGZpbmQgZW5kXG5cdFx0bGV0IGVuZCA9IG9mZnNldDtcblx0XHR3aGlsZSAoZW5kIDwgdGhpcy5lbGVtZW50cy5sZW5ndGggJiYgaXNXb3JkQ2hhcih0aGlzLmVsZW1lbnRzW2VuZF0pICYmICFpc1VwcGVyQ2FzZSh0aGlzLmVsZW1lbnRzW2VuZF0pKSB7XG5cdFx0XHRlbmQrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmQpO1xuXHR9XG5cblx0cHVibGljIGNvdW50TGluZXNJbihyYW5nZTogT2Zmc2V0UmFuZ2UpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnRyYW5zbGF0ZU9mZnNldChyYW5nZS5lbmRFeGNsdXNpdmUpLmxpbmVOdW1iZXIgLSB0aGlzLnRyYW5zbGF0ZU9mZnNldChyYW5nZS5zdGFydCkubGluZU51bWJlcjtcblx0fVxuXG5cdHB1YmxpYyBpc1N0cm9uZ2x5RXF1YWwob2Zmc2V0MTogbnVtYmVyLCBvZmZzZXQyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50c1tvZmZzZXQxXSA9PT0gdGhpcy5lbGVtZW50c1tvZmZzZXQyXTtcblx0fVxuXG5cdHB1YmxpYyBleHRlbmRUb0Z1bGxMaW5lcyhyYW5nZTogT2Zmc2V0UmFuZ2UpOiBPZmZzZXRSYW5nZSB7XG5cdFx0Y29uc3Qgc3RhcnQgPSBmaW5kTGFzdE1vbm90b25vdXModGhpcy5maXJzdEVsZW1lbnRPZmZzZXRCeUxpbmVJZHgsIHggPT4geCA8PSByYW5nZS5zdGFydCkgPz8gMDtcblx0XHRjb25zdCBlbmQgPSBmaW5kRmlyc3RNb25vdG9ub3VzKHRoaXMuZmlyc3RFbGVtZW50T2Zmc2V0QnlMaW5lSWR4LCB4ID0+IHJhbmdlLmVuZEV4Y2x1c2l2ZSA8PSB4KSA/PyB0aGlzLmVsZW1lbnRzLmxlbmd0aDtcblx0XHRyZXR1cm4gbmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzV29yZENoYXIoY2hhckNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY2hhckNvZGUgPj0gQ2hhckNvZGUuYSAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS56XG5cdFx0fHwgY2hhckNvZGUgPj0gQ2hhckNvZGUuQSAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS5aXG5cdFx0fHwgY2hhckNvZGUgPj0gQ2hhckNvZGUuRGlnaXQwICYmIGNoYXJDb2RlIDw9IENoYXJDb2RlLkRpZ2l0OTtcbn1cblxuZnVuY3Rpb24gaXNVcHBlckNhc2UoY2hhckNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY2hhckNvZGUgPj0gQ2hhckNvZGUuQSAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS5aO1xufVxuXG5jb25zdCBlbnVtIENoYXJCb3VuZGFyeUNhdGVnb3J5IHtcblx0V29yZExvd2VyLFxuXHRXb3JkVXBwZXIsXG5cdFdvcmROdW1iZXIsXG5cdEVuZCxcblx0T3RoZXIsXG5cdFNlcGFyYXRvcixcblx0U3BhY2UsXG5cdExpbmVCcmVha0NSLFxuXHRMaW5lQnJlYWtMRixcbn1cblxuY29uc3Qgc2NvcmU6IFJlY29yZDxDaGFyQm91bmRhcnlDYXRlZ29yeSwgbnVtYmVyPiA9IHtcblx0W0NoYXJCb3VuZGFyeUNhdGVnb3J5LldvcmRMb3dlcl06IDAsXG5cdFtDaGFyQm91bmRhcnlDYXRlZ29yeS5Xb3JkVXBwZXJdOiAwLFxuXHRbQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuV29yZE51bWJlcl06IDAsXG5cdFtDaGFyQm91bmRhcnlDYXRlZ29yeS5FbmRdOiAxMCxcblx0W0NoYXJCb3VuZGFyeUNhdGVnb3J5Lk90aGVyXTogMixcblx0W0NoYXJCb3VuZGFyeUNhdGVnb3J5LlNlcGFyYXRvcl06IDMwLFxuXHRbQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuU3BhY2VdOiAzLFxuXHRbQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuTGluZUJyZWFrQ1JdOiAxMCxcblx0W0NoYXJCb3VuZGFyeUNhdGVnb3J5LkxpbmVCcmVha0xGXTogMTAsXG59O1xuXG5mdW5jdGlvbiBnZXRDYXRlZ29yeUJvdW5kYXJ5U2NvcmUoY2F0ZWdvcnk6IENoYXJCb3VuZGFyeUNhdGVnb3J5KTogbnVtYmVyIHtcblx0cmV0dXJuIHNjb3JlW2NhdGVnb3J5XTtcbn1cblxuZnVuY3Rpb24gZ2V0Q2F0ZWdvcnkoY2hhckNvZGU6IG51bWJlcik6IENoYXJCb3VuZGFyeUNhdGVnb3J5IHtcblx0aWYgKGNoYXJDb2RlID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdHJldHVybiBDaGFyQm91bmRhcnlDYXRlZ29yeS5MaW5lQnJlYWtMRjtcblx0fSBlbHNlIGlmIChjaGFyQ29kZSA9PT0gQ2hhckNvZGUuQ2FycmlhZ2VSZXR1cm4pIHtcblx0XHRyZXR1cm4gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuTGluZUJyZWFrQ1I7XG5cdH0gZWxzZSBpZiAoaXNTcGFjZShjaGFyQ29kZSkpIHtcblx0XHRyZXR1cm4gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuU3BhY2U7XG5cdH0gZWxzZSBpZiAoY2hhckNvZGUgPj0gQ2hhckNvZGUuYSAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS56KSB7XG5cdFx0cmV0dXJuIENoYXJCb3VuZGFyeUNhdGVnb3J5LldvcmRMb3dlcjtcblx0fSBlbHNlIGlmIChjaGFyQ29kZSA+PSBDaGFyQ29kZS5BICYmIGNoYXJDb2RlIDw9IENoYXJDb2RlLlopIHtcblx0XHRyZXR1cm4gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuV29yZFVwcGVyO1xuXHR9IGVsc2UgaWYgKGNoYXJDb2RlID49IENoYXJDb2RlLkRpZ2l0MCAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS5EaWdpdDkpIHtcblx0XHRyZXR1cm4gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuV29yZE51bWJlcjtcblx0fSBlbHNlIGlmIChjaGFyQ29kZSA9PT0gLTEpIHtcblx0XHRyZXR1cm4gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuRW5kO1xuXHR9IGVsc2UgaWYgKGNoYXJDb2RlID09PSBDaGFyQ29kZS5Db21tYSB8fCBjaGFyQ29kZSA9PT0gQ2hhckNvZGUuU2VtaWNvbG9uKSB7XG5cdFx0cmV0dXJuIENoYXJCb3VuZGFyeUNhdGVnb3J5LlNlcGFyYXRvcjtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gQ2hhckJvdW5kYXJ5Q2F0ZWdvcnkuT3RoZXI7XG5cdH1cbn1cblxuIl0sCiAgIm1hcHBpbmdz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QUNsQztBQUNEO0FBRUEsU0FBUyxXQUFXLFVBQTJCO0FBQzlDLFNBQU8sWUFBWSxTQUFTLEtBQUssWUFBWSxTQUFTLEtBQ2xELFlBQVksU0FBUyxLQUFLLFlBQVksU0FBUyxLQUMvQyxZQUFZLFNBQVMsVUFBVSxZQUFZLFNBQVM7QUFDekQ7QUFFQSxTQUFTLFlBQVksVUFBMkI7QUFDL0MsU0FBTyxZQUFZLFNBQVMsS0FBSyxZQUFZLFNBQVM7QUFDdkQ7QUFFQSxJQUFXLHVCQUFYLGtCQUFXQywwQkFBWDtBQUNDLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFDQSxFQUFBQSw0Q0FBQTtBQUNBLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFDQSxFQUFBQSw0Q0FBQTtBQUNBLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFDQSxFQUFBQSw0Q0FBQTtBQVRVLFNBQUFBO0FBQUEsR0FBQTtBQVlYLE1BQU0sUUFBOEM7QUFBQSxFQUNuRCxDQUFDLGlCQUE4QixHQUFHO0FBQUEsRUFDbEMsQ0FBQyxpQkFBOEIsR0FBRztBQUFBLEVBQ2xDLENBQUMsa0JBQStCLEdBQUc7QUFBQSxFQUNuQyxDQUFDLFdBQXdCLEdBQUc7QUFBQSxFQUM1QixDQUFDLGFBQTBCLEdBQUc7QUFBQSxFQUM5QixDQUFDLGlCQUE4QixHQUFHO0FBQUEsRUFDbEMsQ0FBQyxhQUEwQixHQUFHO0FBQUEsRUFDOUIsQ0FBQyxtQkFBZ0MsR0FBRztBQUFBLEVBQ3BDLENBQUMsbUJBQWdDLEdBQUc7QUFDckM7QUFFQSxTQUFTLHlCQUF5QixVQUF3QztBQUN6RSxTQUFPLE1BQU0sUUFBUTtBQUN0QjtBQUVBLFNBQVMsWUFBWSxVQUF3QztBQUM1RCxNQUFJLGFBQWEsU0FBUyxVQUFVO0FBQ25DLFdBQU87QUFBQSxFQUNSLFdBQVcsYUFBYSxTQUFTLGdCQUFnQjtBQUNoRCxXQUFPO0FBQUEsRUFDUixXQUFXLFFBQVEsUUFBUSxHQUFHO0FBQzdCLFdBQU87QUFBQSxFQUNSLFdBQVcsWUFBWSxTQUFTLEtBQUssWUFBWSxTQUFTLEdBQUc7QUFDNUQsV0FBTztBQUFBLEVBQ1IsV0FBVyxZQUFZLFNBQVMsS0FBSyxZQUFZLFNBQVMsR0FBRztBQUM1RCxXQUFPO0FBQUEsRUFDUixXQUFXLFlBQVksU0FBUyxVQUFVLFlBQVksU0FBUyxRQUFRO0FBQ3RFLFdBQU87QUFBQSxFQUNSLFdBQVcsYUFBYSxJQUFJO0FBQzNCLFdBQU87QUFBQSxFQUNSLFdBQVcsYUFBYSxTQUFTLFNBQVMsYUFBYSxTQUFTLFdBQVc7QUFDMUUsV0FBTztBQUFBLEVBQ1IsT0FBTztBQUNOLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbInNjb3JlIiwgIkNoYXJCb3VuZGFyeUNhdGVnb3J5Il0KfQo=
