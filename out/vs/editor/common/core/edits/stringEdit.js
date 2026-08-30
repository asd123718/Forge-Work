import { commonPrefixLength, commonSuffixLength } from "../../../../base/common/strings.js";
import { OffsetRange } from "../ranges/offsetRange.js";
import { StringText } from "../text/abstractText.js";
import { BaseEdit, BaseReplacement } from "./edit.js";
class BaseStringEdit extends BaseEdit {
  get TReplacement() {
    throw new Error("TReplacement is not defined for BaseStringEdit");
  }
  static composeOrUndefined(edits) {
    if (edits.length === 0) {
      return void 0;
    }
    let result = edits[0];
    for (let i = 1; i < edits.length; i++) {
      result = result.compose(edits[i]);
    }
    return result;
  }
  /**
   * r := trySwap(e1, e2);
   * e1.compose(e2) === r.e1.compose(r.e2)
  */
  static trySwap(e1, e2) {
    const e1Inv = e1.inverseOnSlice((start, endEx) => " ".repeat(endEx - start));
    const e1_ = e2.tryRebase(e1Inv);
    if (!e1_) {
      return void 0;
    }
    const e2_ = e1.tryRebase(e1_);
    if (!e2_) {
      return void 0;
    }
    return { e1: e1_, e2: e2_ };
  }
  apply(base) {
    const resultText = [];
    let pos = 0;
    for (const edit of this.replacements) {
      resultText.push(base.substring(pos, edit.replaceRange.start));
      resultText.push(edit.newText);
      pos = edit.replaceRange.endExclusive;
    }
    resultText.push(base.substring(pos));
    return resultText.join("");
  }
  /**
   * Creates an edit that reverts this edit.
   */
  inverseOnSlice(getOriginalSlice) {
    const edits = [];
    let offset = 0;
    for (const e of this.replacements) {
      edits.push(StringReplacement.replace(
        OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newText.length),
        getOriginalSlice(e.replaceRange.start, e.replaceRange.endExclusive)
      ));
      offset += e.newText.length - e.replaceRange.length;
    }
    return new StringEdit(edits);
  }
  /**
   * Creates an edit that reverts this edit.
   */
  inverse(original) {
    return this.inverseOnSlice((start, endEx) => original.substring(start, endEx));
  }
  rebaseSkipConflicting(base) {
    return this._tryRebase(base, false);
  }
  tryRebase(base) {
    return this._tryRebase(base, true);
  }
  _tryRebase(base, noOverlap) {
    const newEdits = [];
    let baseIdx = 0;
    let ourIdx = 0;
    let offset = 0;
    while (ourIdx < this.replacements.length || baseIdx < base.replacements.length) {
      const baseEdit = base.replacements.at(baseIdx);
      const ourEdit = this.replacements.at(ourIdx);
      if (!ourEdit) {
        break;
      } else if (!baseEdit) {
        const transformedRange = ourEdit.replaceRange.delta(offset);
        newEdits.push(new StringReplacement(transformedRange, ourEdit.newText));
        ourIdx++;
      } else if (ourEdit.replaceRange.intersects(baseEdit.replaceRange) || areConcurrentInserts(ourEdit.replaceRange, baseEdit.replaceRange) || isInsertStrictlyInsideRange(ourEdit.replaceRange, baseEdit.replaceRange) || isInsertStrictlyInsideRange(baseEdit.replaceRange, ourEdit.replaceRange)) {
        ourIdx++;
        if (noOverlap) {
          return void 0;
        }
      } else if (ourEdit.replaceRange.start < baseEdit.replaceRange.start || ourEdit.replaceRange.isEmpty && ourEdit.replaceRange.start === baseEdit.replaceRange.start) {
        const transformedRange = ourEdit.replaceRange.delta(offset);
        newEdits.push(new StringReplacement(transformedRange, ourEdit.newText));
        ourIdx++;
      } else {
        baseIdx++;
        offset += baseEdit.newText.length - baseEdit.replaceRange.length;
      }
    }
    return new StringEdit(newEdits);
  }
  toJson() {
    return this.replacements.map((e) => e.toJson());
  }
  isNeutralOn(text) {
    return this.replacements.every((e) => e.isNeutralOn(text));
  }
  removeCommonSuffixPrefix(originalText) {
    const edits = [];
    for (const e of this.replacements) {
      const edit = e.removeCommonSuffixPrefix(originalText);
      if (!edit.isEmpty) {
        edits.push(edit);
      }
    }
    return new StringEdit(edits);
  }
  normalizeEOL(eol) {
    return new StringEdit(this.replacements.map((edit) => edit.normalizeEOL(eol)));
  }
  /**
   * If `e1.apply(source) === e2.apply(source)`, then `e1.normalizeOnSource(source).equals(e2.normalizeOnSource(source))`.
  */
  normalizeOnSource(source) {
    const result = this.apply(source);
    const edit = StringReplacement.replace(OffsetRange.ofLength(source.length), result);
    const e = edit.removeCommonSuffixAndPrefix(source);
    if (e.isEmpty) {
      return StringEdit.empty;
    }
    return e.toEdit();
  }
  removeCommonSuffixAndPrefix(source) {
    return this._createNew(this.replacements.map((e) => e.removeCommonSuffixAndPrefix(source))).normalize();
  }
  applyOnText(docContents) {
    return new StringText(this.apply(docContents.value));
  }
  mapData(f) {
    return new AnnotatedStringEdit(
      this.replacements.map((e) => new AnnotatedStringReplacement(
        e.replaceRange,
        e.newText,
        f(e)
      ))
    );
  }
}
class BaseStringReplacement extends BaseReplacement {
  constructor(range, newText) {
    super(range);
    this.newText = newText;
  }
  getNewLength() {
    return this.newText.length;
  }
  toString() {
    return `${this.replaceRange} -> ${JSON.stringify(this.newText)}`;
  }
  replace(str) {
    return str.substring(0, this.replaceRange.start) + this.newText + str.substring(this.replaceRange.endExclusive);
  }
  /**
   * Checks if the edit would produce no changes when applied to the given text.
   */
  isNeutralOn(text) {
    return this.newText === text.substring(this.replaceRange.start, this.replaceRange.endExclusive);
  }
  removeCommonSuffixPrefix(originalText) {
    const oldText = originalText.substring(this.replaceRange.start, this.replaceRange.endExclusive);
    const prefixLen = commonPrefixLength(oldText, this.newText);
    const suffixLen = Math.min(
      oldText.length - prefixLen,
      this.newText.length - prefixLen,
      commonSuffixLength(oldText, this.newText)
    );
    const replaceRange = new OffsetRange(
      this.replaceRange.start + prefixLen,
      this.replaceRange.endExclusive - suffixLen
    );
    const newText = this.newText.substring(prefixLen, this.newText.length - suffixLen);
    return new StringReplacement(replaceRange, newText);
  }
  normalizeEOL(eol) {
    const newText = this.newText.replace(/\r\n|\n/g, eol);
    return new StringReplacement(this.replaceRange, newText);
  }
  removeCommonSuffixAndPrefix(source) {
    return this.removeCommonSuffix(source).removeCommonPrefix(source);
  }
  removeCommonPrefix(source) {
    const oldText = this.replaceRange.substring(source);
    const prefixLen = commonPrefixLength(oldText, this.newText);
    if (prefixLen === 0) {
      return this;
    }
    return this.slice(this.replaceRange.deltaStart(prefixLen), new OffsetRange(prefixLen, this.newText.length));
  }
  removeCommonSuffix(source) {
    const oldText = this.replaceRange.substring(source);
    const suffixLen = commonSuffixLength(oldText, this.newText);
    if (suffixLen === 0) {
      return this;
    }
    return this.slice(this.replaceRange.deltaEnd(-suffixLen), new OffsetRange(0, this.newText.length - suffixLen));
  }
  toEdit() {
    return new StringEdit([this]);
  }
  toJson() {
    return {
      txt: this.newText,
      pos: this.replaceRange.start,
      len: this.replaceRange.length
    };
  }
}
const _StringEdit = class _StringEdit extends BaseStringEdit {
  /**
   * Parses an edit from its string representation.
   * E.g. [[2, 12) -> "fgh", [14, 20) -> "qrst", [22, 22) -> "de\n"]
  */
  static parse(toStringValue) {
    const replacements = [];
    const regex = /\[(\d+),\s*(\d+)\)\s*->\s*"([^"]*)"/g;
    let match;
    while ((match = regex.exec(toStringValue)) !== null) {
      const start = parseInt(match[1], 10);
      const endEx = parseInt(match[2], 10);
      const text = match[3].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\\\/g, "\\");
      replacements.push(new StringReplacement(new OffsetRange(start, endEx), text));
    }
    return new _StringEdit(replacements);
  }
  static create(replacements) {
    return new _StringEdit(replacements);
  }
  static single(replacement) {
    return new _StringEdit([replacement]);
  }
  static replace(range, replacement) {
    return new _StringEdit([new StringReplacement(range, replacement)]);
  }
  static insert(offset, replacement) {
    return new _StringEdit([new StringReplacement(OffsetRange.emptyAt(offset), replacement)]);
  }
  static delete(range) {
    return new _StringEdit([new StringReplacement(range, "")]);
  }
  static fromJson(data) {
    return new _StringEdit(data.map(StringReplacement.fromJson));
  }
  static compose(edits) {
    if (edits.length === 0) {
      return _StringEdit.empty;
    }
    let result = edits[0];
    for (let i = 1; i < edits.length; i++) {
      result = result.compose(edits[i]);
    }
    return result;
  }
  /**
   * The replacements are applied in order!
   * Equals `StringEdit.compose(replacements.map(r => r.toEdit()))`, but is much more performant.
  */
  static composeSequentialReplacements(replacements) {
    let edit = _StringEdit.empty;
    let curEditReplacements = [];
    for (const r of replacements) {
      const last = curEditReplacements.at(-1);
      if (!last || r.replaceRange.isBefore(last.replaceRange)) {
        curEditReplacements.push(r);
      } else {
        edit = edit.compose(_StringEdit.create(curEditReplacements.reverse()));
        curEditReplacements = [r];
      }
    }
    edit = edit.compose(_StringEdit.create(curEditReplacements.reverse()));
    return edit;
  }
  constructor(replacements) {
    super(replacements);
  }
  _createNew(replacements) {
    return new _StringEdit(replacements);
  }
};
_StringEdit.empty = new _StringEdit([]);
let StringEdit = _StringEdit;
class StringReplacement extends BaseStringReplacement {
  static insert(offset, text) {
    return new StringReplacement(OffsetRange.emptyAt(offset), text);
  }
  static replace(range, text) {
    return new StringReplacement(range, text);
  }
  static delete(range) {
    return new StringReplacement(range, "");
  }
  static fromJson(data) {
    return new StringReplacement(OffsetRange.ofStartAndLength(data.pos, data.len), data.txt);
  }
  equals(other) {
    return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText;
  }
  tryJoinTouching(other) {
    return new StringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText);
  }
  slice(range, rangeInReplacement) {
    return new StringReplacement(range, rangeInReplacement ? rangeInReplacement.substring(this.newText) : this.newText);
  }
}
function applyEditsToRanges(sortedRanges, edit) {
  sortedRanges = sortedRanges.slice();
  const result = [];
  let offset = 0;
  for (const e of edit.replacements) {
    while (true) {
      const r = sortedRanges[0];
      if (!r || r.endExclusive >= e.replaceRange.start) {
        break;
      }
      sortedRanges.shift();
      result.push(r.delta(offset));
    }
    const intersecting = [];
    while (true) {
      const r = sortedRanges[0];
      if (!r || !r.intersectsOrTouches(e.replaceRange)) {
        break;
      }
      sortedRanges.shift();
      intersecting.push(r);
    }
    for (let i = intersecting.length - 1; i >= 0; i--) {
      let r = intersecting[i];
      const overlap = r.intersect(e.replaceRange).length;
      r = r.deltaEnd(-overlap + (i === 0 ? e.newText.length : 0));
      const rangeAheadOfReplaceRange = r.start - e.replaceRange.start;
      if (rangeAheadOfReplaceRange > 0) {
        r = r.delta(-rangeAheadOfReplaceRange);
      }
      if (i !== 0) {
        r = r.delta(e.newText.length);
      }
      r = r.delta(-(e.newText.length - e.replaceRange.length));
      sortedRanges.unshift(r);
    }
    offset += e.newText.length - e.replaceRange.length;
  }
  while (true) {
    const r = sortedRanges[0];
    if (!r) {
      break;
    }
    sortedRanges.shift();
    result.push(r.delta(offset));
  }
  return result;
}
class VoidEditData {
  join(other) {
    return this;
  }
}
const _AnnotatedStringEdit = class _AnnotatedStringEdit extends BaseStringEdit {
  static create(replacements) {
    return new _AnnotatedStringEdit(replacements);
  }
  static single(replacement) {
    return new _AnnotatedStringEdit([replacement]);
  }
  static replace(range, replacement, data) {
    return new _AnnotatedStringEdit([new AnnotatedStringReplacement(range, replacement, data)]);
  }
  static insert(offset, replacement, data) {
    return new _AnnotatedStringEdit([new AnnotatedStringReplacement(OffsetRange.emptyAt(offset), replacement, data)]);
  }
  static delete(range, data) {
    return new _AnnotatedStringEdit([new AnnotatedStringReplacement(range, "", data)]);
  }
  static compose(edits) {
    if (edits.length === 0) {
      return _AnnotatedStringEdit.empty;
    }
    let result = edits[0];
    for (let i = 1; i < edits.length; i++) {
      result = result.compose(edits[i]);
    }
    return result;
  }
  constructor(replacements) {
    super(replacements);
  }
  _createNew(replacements) {
    return new _AnnotatedStringEdit(replacements);
  }
  toStringEdit(filter) {
    const newReplacements = [];
    for (const r of this.replacements) {
      if (!filter || filter(r)) {
        newReplacements.push(new StringReplacement(r.replaceRange, r.newText));
      }
    }
    return new StringEdit(newReplacements);
  }
};
_AnnotatedStringEdit.empty = new _AnnotatedStringEdit([]);
let AnnotatedStringEdit = _AnnotatedStringEdit;
class AnnotatedStringReplacement extends BaseStringReplacement {
  constructor(range, newText, data) {
    super(range, newText);
    this.data = data;
  }
  static insert(offset, text, data) {
    return new AnnotatedStringReplacement(OffsetRange.emptyAt(offset), text, data);
  }
  static replace(range, text, data) {
    return new AnnotatedStringReplacement(range, text, data);
  }
  static delete(range, data) {
    return new AnnotatedStringReplacement(range, "", data);
  }
  equals(other) {
    return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText && this.data === other.data;
  }
  tryJoinTouching(other) {
    const joined = this.data.join(other.data);
    if (joined === void 0) {
      return void 0;
    }
    return new AnnotatedStringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText, joined);
  }
  slice(range, rangeInReplacement) {
    return new AnnotatedStringReplacement(range, rangeInReplacement ? rangeInReplacement.substring(this.newText) : this.newText, this.data);
  }
}
function areConcurrentInserts(r1, r2) {
  return r1.isEmpty && r2.isEmpty && r1.start === r2.start;
}
function isInsertStrictlyInsideRange(insert, range) {
  return insert.isEmpty && range.start < insert.start && insert.start < range.endExclusive;
}
export {
  AnnotatedStringEdit,
  AnnotatedStringReplacement,
  BaseStringEdit,
  BaseStringReplacement,
  StringEdit,
  StringReplacement,
  VoidEditData,
  applyEditsToRanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29yZVxcZWRpdHNcXHN0cmluZ0VkaXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb21tb25QcmVmaXhMZW5ndGgsIGNvbW1vblN1ZmZpeExlbmd0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgU3RyaW5nVGV4dCB9IGZyb20gJy4uL3RleHQvYWJzdHJhY3RUZXh0LmpzJztcbmltcG9ydCB7IEJhc2VFZGl0LCBCYXNlUmVwbGFjZW1lbnQgfSBmcm9tICcuL2VkaXQuanMnO1xuXG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZVN0cmluZ0VkaXQ8VCBleHRlbmRzIEJhc2VTdHJpbmdSZXBsYWNlbWVudDxUPiA9IEJhc2VTdHJpbmdSZXBsYWNlbWVudDxhbnk+LCBURWRpdCBleHRlbmRzIEJhc2VTdHJpbmdFZGl0PFQsIFRFZGl0PiA9IEJhc2VTdHJpbmdFZGl0PGFueSwgYW55Pj4gZXh0ZW5kcyBCYXNlRWRpdDxULCBURWRpdD4ge1xuXHRnZXQgVFJlcGxhY2VtZW50KCk6IFQge1xuXHRcdHRocm93IG5ldyBFcnJvcignVFJlcGxhY2VtZW50IGlzIG5vdCBkZWZpbmVkIGZvciBCYXNlU3RyaW5nRWRpdCcpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjb21wb3NlT3JVbmRlZmluZWQ8VCBleHRlbmRzIEJhc2VTdHJpbmdFZGl0PihlZGl0czogcmVhZG9ubHkgVFtdKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdCA9IGVkaXRzWzBdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZWRpdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0cmVzdWx0ID0gcmVzdWx0LmNvbXBvc2UoZWRpdHNbaV0pIGFzIGFueTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiByIDo9IHRyeVN3YXAoZTEsIGUyKTtcblx0ICogZTEuY29tcG9zZShlMikgPT09IHIuZTEuY29tcG9zZShyLmUyKVxuXHQqL1xuXHRwdWJsaWMgc3RhdGljIHRyeVN3YXAoZTE6IEJhc2VTdHJpbmdFZGl0LCBlMjogQmFzZVN0cmluZ0VkaXQpOiB7IGUxOiBTdHJpbmdFZGl0OyBlMjogU3RyaW5nRWRpdCB9IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBUT0RPIG1ha2UgdGhpcyBtb3JlIGVmZmljaWVudFxuXHRcdGNvbnN0IGUxSW52ID0gZTEuaW52ZXJzZU9uU2xpY2UoKHN0YXJ0LCBlbmRFeCkgPT4gJyAnLnJlcGVhdChlbmRFeCAtIHN0YXJ0KSk7XG5cblx0XHRjb25zdCBlMV8gPSBlMi50cnlSZWJhc2UoZTFJbnYpO1xuXHRcdGlmICghZTFfKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBlMl8gPSBlMS50cnlSZWJhc2UoZTFfKTtcblx0XHRpZiAoIWUyXykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBlMTogZTFfLCBlMjogZTJfIH07XG5cdH1cblxuXHRwdWJsaWMgYXBwbHkoYmFzZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHRUZXh0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBwb3MgPSAwO1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0cmVzdWx0VGV4dC5wdXNoKGJhc2Uuc3Vic3RyaW5nKHBvcywgZWRpdC5yZXBsYWNlUmFuZ2Uuc3RhcnQpKTtcblx0XHRcdHJlc3VsdFRleHQucHVzaChlZGl0Lm5ld1RleHQpO1xuXHRcdFx0cG9zID0gZWRpdC5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlO1xuXHRcdH1cblx0XHRyZXN1bHRUZXh0LnB1c2goYmFzZS5zdWJzdHJpbmcocG9zKSk7XG5cdFx0cmV0dXJuIHJlc3VsdFRleHQuam9pbignJyk7XG5cdH1cblxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIGVkaXQgdGhhdCByZXZlcnRzIHRoaXMgZWRpdC5cblx0ICovXG5cdHB1YmxpYyBpbnZlcnNlT25TbGljZShnZXRPcmlnaW5hbFNsaWNlOiAoc3RhcnQ6IG51bWJlciwgZW5kRXg6IG51bWJlcikgPT4gc3RyaW5nKTogU3RyaW5nRWRpdCB7XG5cdFx0Y29uc3QgZWRpdHM6IFN0cmluZ1JlcGxhY2VtZW50W10gPSBbXTtcblx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRmb3IgKGNvbnN0IGUgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGVkaXRzLnB1c2goU3RyaW5nUmVwbGFjZW1lbnQucmVwbGFjZShcblx0XHRcdFx0T2Zmc2V0UmFuZ2Uub2ZTdGFydEFuZExlbmd0aChlLnJlcGxhY2VSYW5nZS5zdGFydCArIG9mZnNldCwgZS5uZXdUZXh0Lmxlbmd0aCksXG5cdFx0XHRcdGdldE9yaWdpbmFsU2xpY2UoZS5yZXBsYWNlUmFuZ2Uuc3RhcnQsIGUucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSlcblx0XHRcdCkpO1xuXHRcdFx0b2Zmc2V0ICs9IGUubmV3VGV4dC5sZW5ndGggLSBlLnJlcGxhY2VSYW5nZS5sZW5ndGg7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChlZGl0cyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBlZGl0IHRoYXQgcmV2ZXJ0cyB0aGlzIGVkaXQuXG5cdCAqL1xuXHRwdWJsaWMgaW52ZXJzZShvcmlnaW5hbDogc3RyaW5nKTogU3RyaW5nRWRpdCB7XG5cdFx0cmV0dXJuIHRoaXMuaW52ZXJzZU9uU2xpY2UoKHN0YXJ0LCBlbmRFeCkgPT4gb3JpZ2luYWwuc3Vic3RyaW5nKHN0YXJ0LCBlbmRFeCkpO1xuXHR9XG5cblx0cHVibGljIHJlYmFzZVNraXBDb25mbGljdGluZyhiYXNlOiBTdHJpbmdFZGl0KTogU3RyaW5nRWRpdCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyeVJlYmFzZShiYXNlLCBmYWxzZSkhO1xuXHR9XG5cblx0cHVibGljIHRyeVJlYmFzZShiYXNlOiBTdHJpbmdFZGl0KTogU3RyaW5nRWRpdCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyeVJlYmFzZShiYXNlLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyeVJlYmFzZShiYXNlOiBTdHJpbmdFZGl0LCBub092ZXJsYXA6IGJvb2xlYW4pOiBTdHJpbmdFZGl0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuZXdFZGl0czogU3RyaW5nUmVwbGFjZW1lbnRbXSA9IFtdO1xuXG5cdFx0bGV0IGJhc2VJZHggPSAwO1xuXHRcdGxldCBvdXJJZHggPSAwO1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXG5cdFx0d2hpbGUgKG91cklkeCA8IHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aCB8fCBiYXNlSWR4IDwgYmFzZS5yZXBsYWNlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHQvLyB0YWtlIHRoZSBlZGl0IHRoYXQgc3RhcnRzIGZpcnN0XG5cdFx0XHRjb25zdCBiYXNlRWRpdCA9IGJhc2UucmVwbGFjZW1lbnRzLmF0KGJhc2VJZHgpO1xuXHRcdFx0Y29uc3Qgb3VyRWRpdCA9IHRoaXMucmVwbGFjZW1lbnRzLmF0KG91cklkeCk7XG5cblx0XHRcdGlmICghb3VyRWRpdCkge1xuXHRcdFx0XHQvLyBXZSBwcm9jZXNzZWQgYWxsIG91ciBlZGl0c1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSBpZiAoIWJhc2VFZGl0KSB7XG5cdFx0XHRcdC8vIG5vIG1vcmUgZWRpdHMgZnJvbSBiYXNlXG5cdFx0XHRcdGNvbnN0IHRyYW5zZm9ybWVkUmFuZ2UgPSBvdXJFZGl0LnJlcGxhY2VSYW5nZS5kZWx0YShvZmZzZXQpO1xuXHRcdFx0XHRuZXdFZGl0cy5wdXNoKG5ldyBTdHJpbmdSZXBsYWNlbWVudCh0cmFuc2Zvcm1lZFJhbmdlLCBvdXJFZGl0Lm5ld1RleHQpKTtcblx0XHRcdFx0b3VySWR4Kys7XG5cdFx0XHR9IGVsc2UgaWYgKFxuXHRcdFx0XHRvdXJFZGl0LnJlcGxhY2VSYW5nZS5pbnRlcnNlY3RzKGJhc2VFZGl0LnJlcGxhY2VSYW5nZSkgfHxcblx0XHRcdFx0YXJlQ29uY3VycmVudEluc2VydHMob3VyRWRpdC5yZXBsYWNlUmFuZ2UsIGJhc2VFZGl0LnJlcGxhY2VSYW5nZSkgfHxcblx0XHRcdFx0aXNJbnNlcnRTdHJpY3RseUluc2lkZVJhbmdlKG91ckVkaXQucmVwbGFjZVJhbmdlLCBiYXNlRWRpdC5yZXBsYWNlUmFuZ2UpIHx8XG5cdFx0XHRcdGlzSW5zZXJ0U3RyaWN0bHlJbnNpZGVSYW5nZShiYXNlRWRpdC5yZXBsYWNlUmFuZ2UsIG91ckVkaXQucmVwbGFjZVJhbmdlKVxuXHRcdFx0KSB7XG5cdFx0XHRcdG91cklkeCsrOyAvLyBEb24ndCB0YWtlIG91ciBlZGl0LCBhcyBpdCBpcyBjb25mbGljdGluZyAtPiBza2lwXG5cdFx0XHRcdGlmIChub092ZXJsYXApIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKG91ckVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0IDwgYmFzZUVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0IHx8XG5cdFx0XHRcdChvdXJFZGl0LnJlcGxhY2VSYW5nZS5pc0VtcHR5ICYmIG91ckVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0ID09PSBiYXNlRWRpdC5yZXBsYWNlUmFuZ2Uuc3RhcnQpKSB7XG5cdFx0XHRcdC8vIE91ciBlZGl0IHN0YXJ0cyBmaXJzdCwgb3IgaXMgYW4gaW5zZXJ0IGF0IHRoZSBzdGFydCBvZiBiYXNlJ3MgcmFuZ2Vcblx0XHRcdFx0Y29uc3QgdHJhbnNmb3JtZWRSYW5nZSA9IG91ckVkaXQucmVwbGFjZVJhbmdlLmRlbHRhKG9mZnNldCk7XG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoZSB0cmFuc2Zvcm1lZCBlZGl0IHdvdWxkIHZpb2xhdGUgdGhlIHNvcnRlZC9kaXNqb2ludCBpbnZhcmlhbnRcblx0XHRcdFx0bmV3RWRpdHMucHVzaChuZXcgU3RyaW5nUmVwbGFjZW1lbnQodHJhbnNmb3JtZWRSYW5nZSwgb3VyRWRpdC5uZXdUZXh0KSk7XG5cdFx0XHRcdG91cklkeCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YmFzZUlkeCsrO1xuXHRcdFx0XHRvZmZzZXQgKz0gYmFzZUVkaXQubmV3VGV4dC5sZW5ndGggLSBiYXNlRWRpdC5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChuZXdFZGl0cyk7XG5cdH1cblxuXHRwdWJsaWMgdG9Kc29uKCk6IElTZXJpYWxpemVkU3RyaW5nRWRpdCB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZW1lbnRzLm1hcChlID0+IGUudG9Kc29uKCkpO1xuXHR9XG5cblx0cHVibGljIGlzTmV1dHJhbE9uKHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50cy5ldmVyeShlID0+IGUuaXNOZXV0cmFsT24odGV4dCkpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUNvbW1vblN1ZmZpeFByZWZpeChvcmlnaW5hbFRleHQ6IHN0cmluZyk6IFN0cmluZ0VkaXQge1xuXHRcdGNvbnN0IGVkaXRzOiBTdHJpbmdSZXBsYWNlbWVudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBlZGl0ID0gZS5yZW1vdmVDb21tb25TdWZmaXhQcmVmaXgob3JpZ2luYWxUZXh0KTtcblx0XHRcdGlmICghZWRpdC5pc0VtcHR5KSB7XG5cdFx0XHRcdGVkaXRzLnB1c2goZWRpdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChlZGl0cyk7XG5cdH1cblxuXHRwdWJsaWMgbm9ybWFsaXplRU9MKGVvbDogJ1xcclxcbicgfCAnXFxuJyk6IFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdCh0aGlzLnJlcGxhY2VtZW50cy5tYXAoZWRpdCA9PiBlZGl0Lm5vcm1hbGl6ZUVPTChlb2wpKSk7XG5cdH1cblxuXHQvKipcblx0ICogSWYgYGUxLmFwcGx5KHNvdXJjZSkgPT09IGUyLmFwcGx5KHNvdXJjZSlgLCB0aGVuIGBlMS5ub3JtYWxpemVPblNvdXJjZShzb3VyY2UpLmVxdWFscyhlMi5ub3JtYWxpemVPblNvdXJjZShzb3VyY2UpKWAuXG5cdCovXG5cdHB1YmxpYyBub3JtYWxpemVPblNvdXJjZShzb3VyY2U6IHN0cmluZyk6IFN0cmluZ0VkaXQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuYXBwbHkoc291cmNlKTtcblxuXHRcdGNvbnN0IGVkaXQgPSBTdHJpbmdSZXBsYWNlbWVudC5yZXBsYWNlKE9mZnNldFJhbmdlLm9mTGVuZ3RoKHNvdXJjZS5sZW5ndGgpLCByZXN1bHQpO1xuXHRcdGNvbnN0IGUgPSBlZGl0LnJlbW92ZUNvbW1vblN1ZmZpeEFuZFByZWZpeChzb3VyY2UpO1xuXHRcdGlmIChlLmlzRW1wdHkpIHtcblx0XHRcdHJldHVybiBTdHJpbmdFZGl0LmVtcHR5O1xuXHRcdH1cblx0XHRyZXR1cm4gZS50b0VkaXQoKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb21tb25TdWZmaXhBbmRQcmVmaXgoc291cmNlOiBzdHJpbmcpOiBURWRpdCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZU5ldyh0aGlzLnJlcGxhY2VtZW50cy5tYXAoZSA9PiBlLnJlbW92ZUNvbW1vblN1ZmZpeEFuZFByZWZpeChzb3VyY2UpKSkubm9ybWFsaXplKCk7XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlPblRleHQoZG9jQ29udGVudHM6IFN0cmluZ1RleHQpOiBTdHJpbmdUZXh0IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ1RleHQodGhpcy5hcHBseShkb2NDb250ZW50cy52YWx1ZSkpO1xuXHR9XG5cblx0cHVibGljIG1hcERhdGE8VERhdGEgZXh0ZW5kcyBJRWRpdERhdGE8VERhdGE+PihmOiAocmVwbGFjZW1lbnQ6IFQpID0+IFREYXRhKTogQW5ub3RhdGVkU3RyaW5nRWRpdDxURGF0YT4ge1xuXHRcdHJldHVybiBuZXcgQW5ub3RhdGVkU3RyaW5nRWRpdChcblx0XHRcdHRoaXMucmVwbGFjZW1lbnRzLm1hcChlID0+IG5ldyBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudChcblx0XHRcdFx0ZS5yZXBsYWNlUmFuZ2UsXG5cdFx0XHRcdGUubmV3VGV4dCxcblx0XHRcdFx0ZihlKVxuXHRcdFx0KSlcblx0XHQpO1xuXHR9XG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZVN0cmluZ1JlcGxhY2VtZW50PFQgZXh0ZW5kcyBCYXNlU3RyaW5nUmVwbGFjZW1lbnQ8VD4gPSBCYXNlU3RyaW5nUmVwbGFjZW1lbnQ8YW55Pj4gZXh0ZW5kcyBCYXNlUmVwbGFjZW1lbnQ8VD4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyYW5nZTogT2Zmc2V0UmFuZ2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IG5ld1RleHQ6IHN0cmluZ1xuXHQpIHtcblx0XHRzdXBlcihyYW5nZSk7XG5cdH1cblxuXHRnZXROZXdMZW5ndGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubmV3VGV4dC5sZW5ndGg7IH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLnJlcGxhY2VSYW5nZX0gLT4gJHtKU09OLnN0cmluZ2lmeSh0aGlzLm5ld1RleHQpfWA7XG5cdH1cblxuXHRyZXBsYWNlKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gc3RyLnN1YnN0cmluZygwLCB0aGlzLnJlcGxhY2VSYW5nZS5zdGFydCkgKyB0aGlzLm5ld1RleHQgKyBzdHIuc3Vic3RyaW5nKHRoaXMucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2tzIGlmIHRoZSBlZGl0IHdvdWxkIHByb2R1Y2Ugbm8gY2hhbmdlcyB3aGVuIGFwcGxpZWQgdG8gdGhlIGdpdmVuIHRleHQuXG5cdCAqL1xuXHRpc05ldXRyYWxPbih0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5uZXdUZXh0ID09PSB0ZXh0LnN1YnN0cmluZyh0aGlzLnJlcGxhY2VSYW5nZS5zdGFydCwgdGhpcy5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlKTtcblx0fVxuXG5cdHJlbW92ZUNvbW1vblN1ZmZpeFByZWZpeChvcmlnaW5hbFRleHQ6IHN0cmluZyk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0XHRjb25zdCBvbGRUZXh0ID0gb3JpZ2luYWxUZXh0LnN1YnN0cmluZyh0aGlzLnJlcGxhY2VSYW5nZS5zdGFydCwgdGhpcy5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlKTtcblxuXHRcdGNvbnN0IHByZWZpeExlbiA9IGNvbW1vblByZWZpeExlbmd0aChvbGRUZXh0LCB0aGlzLm5ld1RleHQpO1xuXHRcdGNvbnN0IHN1ZmZpeExlbiA9IE1hdGgubWluKFxuXHRcdFx0b2xkVGV4dC5sZW5ndGggLSBwcmVmaXhMZW4sXG5cdFx0XHR0aGlzLm5ld1RleHQubGVuZ3RoIC0gcHJlZml4TGVuLFxuXHRcdFx0Y29tbW9uU3VmZml4TGVuZ3RoKG9sZFRleHQsIHRoaXMubmV3VGV4dClcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVwbGFjZVJhbmdlID0gbmV3IE9mZnNldFJhbmdlKFxuXHRcdFx0dGhpcy5yZXBsYWNlUmFuZ2Uuc3RhcnQgKyBwcmVmaXhMZW4sXG5cdFx0XHR0aGlzLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUgLSBzdWZmaXhMZW4sXG5cdFx0KTtcblx0XHRjb25zdCBuZXdUZXh0ID0gdGhpcy5uZXdUZXh0LnN1YnN0cmluZyhwcmVmaXhMZW4sIHRoaXMubmV3VGV4dC5sZW5ndGggLSBzdWZmaXhMZW4pO1xuXG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudChyZXBsYWNlUmFuZ2UsIG5ld1RleHQpO1xuXHR9XG5cblx0bm9ybWFsaXplRU9MKGVvbDogJ1xcclxcbicgfCAnXFxuJyk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0XHRjb25zdCBuZXdUZXh0ID0gdGhpcy5uZXdUZXh0LnJlcGxhY2UoL1xcclxcbnxcXG4vZywgZW9sKTtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ1JlcGxhY2VtZW50KHRoaXMucmVwbGFjZVJhbmdlLCBuZXdUZXh0KTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb21tb25TdWZmaXhBbmRQcmVmaXgoc291cmNlOiBzdHJpbmcpOiBUIHtcblx0XHRyZXR1cm4gdGhpcy5yZW1vdmVDb21tb25TdWZmaXgoc291cmNlKS5yZW1vdmVDb21tb25QcmVmaXgoc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb21tb25QcmVmaXgoc291cmNlOiBzdHJpbmcpOiBUIHtcblx0XHRjb25zdCBvbGRUZXh0ID0gdGhpcy5yZXBsYWNlUmFuZ2Uuc3Vic3RyaW5nKHNvdXJjZSk7XG5cblx0XHRjb25zdCBwcmVmaXhMZW4gPSBjb21tb25QcmVmaXhMZW5ndGgob2xkVGV4dCwgdGhpcy5uZXdUZXh0KTtcblx0XHRpZiAocHJlZml4TGVuID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIFQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2xpY2UodGhpcy5yZXBsYWNlUmFuZ2UuZGVsdGFTdGFydChwcmVmaXhMZW4pLCBuZXcgT2Zmc2V0UmFuZ2UocHJlZml4TGVuLCB0aGlzLm5ld1RleHQubGVuZ3RoKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQ29tbW9uU3VmZml4KHNvdXJjZTogc3RyaW5nKTogVCB7XG5cdFx0Y29uc3Qgb2xkVGV4dCA9IHRoaXMucmVwbGFjZVJhbmdlLnN1YnN0cmluZyhzb3VyY2UpO1xuXG5cdFx0Y29uc3Qgc3VmZml4TGVuID0gY29tbW9uU3VmZml4TGVuZ3RoKG9sZFRleHQsIHRoaXMubmV3VGV4dCk7XG5cdFx0aWYgKHN1ZmZpeExlbiA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBUO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zbGljZSh0aGlzLnJlcGxhY2VSYW5nZS5kZWx0YUVuZCgtc3VmZml4TGVuKSwgbmV3IE9mZnNldFJhbmdlKDAsIHRoaXMubmV3VGV4dC5sZW5ndGggLSBzdWZmaXhMZW4pKTtcblx0fVxuXG5cdHB1YmxpYyB0b0VkaXQoKTogU3RyaW5nRWRpdCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KFt0aGlzXSk7XG5cdH1cblxuXHRwdWJsaWMgdG9Kc29uKCk6IElTZXJpYWxpemVkU3RyaW5nUmVwbGFjZW1lbnQge1xuXHRcdHJldHVybiAoe1xuXHRcdFx0dHh0OiB0aGlzLm5ld1RleHQsXG5cdFx0XHRwb3M6IHRoaXMucmVwbGFjZVJhbmdlLnN0YXJ0LFxuXHRcdFx0bGVuOiB0aGlzLnJlcGxhY2VSYW5nZS5sZW5ndGgsXG5cdFx0fSk7XG5cdH1cbn1cblxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBzZXQgb2YgcmVwbGFjZW1lbnRzIHRvIGEgc3RyaW5nLlxuICogQWxsIHRoZXNlIHJlcGxhY2VtZW50cyBhcmUgYXBwbGllZCBhdCBvbmNlLlxuKi9cbmV4cG9ydCBjbGFzcyBTdHJpbmdFZGl0IGV4dGVuZHMgQmFzZVN0cmluZ0VkaXQ8U3RyaW5nUmVwbGFjZW1lbnQsIFN0cmluZ0VkaXQ+IHtcblx0LyoqXG5cdCAqIFBhcnNlcyBhbiBlZGl0IGZyb20gaXRzIHN0cmluZyByZXByZXNlbnRhdGlvbi5cblx0ICogRS5nLiBbWzIsIDEyKSAtPiBcImZnaFwiLCBbMTQsIDIwKSAtPiBcInFyc3RcIiwgWzIyLCAyMikgLT4gXCJkZVxcblwiXVxuXHQqL1xuXHRwdWJsaWMgc3RhdGljIHBhcnNlKHRvU3RyaW5nVmFsdWU6IHN0cmluZyk6IFN0cmluZ0VkaXQge1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50czogU3RyaW5nUmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGNvbnN0IHJlZ2V4ID0gL1xcWyhcXGQrKSxcXHMqKFxcZCspXFwpXFxzKi0+XFxzKlwiKFteXCJdKilcIi9nO1xuXHRcdGxldCBtYXRjaDtcblxuXHRcdHdoaWxlICgobWF0Y2ggPSByZWdleC5leGVjKHRvU3RyaW5nVmFsdWUpKSAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBwYXJzZUludChtYXRjaFsxXSwgMTApO1xuXHRcdFx0Y29uc3QgZW5kRXggPSBwYXJzZUludChtYXRjaFsyXSwgMTApO1xuXHRcdFx0Y29uc3QgdGV4dCA9IG1hdGNoWzNdLnJlcGxhY2UoL1xcXFxuL2csICdcXG4nKS5yZXBsYWNlKC9cXFxcci9nLCAnXFxyJykucmVwbGFjZSgvXFxcXFxcXFwvZywgJ1xcXFwnKTtcblx0XHRcdHJlcGxhY2VtZW50cy5wdXNoKG5ldyBTdHJpbmdSZXBsYWNlbWVudChuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnQsIGVuZEV4KSwgdGV4dCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChyZXBsYWNlbWVudHMpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBlbXB0eSA9IG5ldyBTdHJpbmdFZGl0KFtdKTtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShyZXBsYWNlbWVudHM6IHJlYWRvbmx5IFN0cmluZ1JlcGxhY2VtZW50W10pOiBTdHJpbmdFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQocmVwbGFjZW1lbnRzKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2luZ2xlKHJlcGxhY2VtZW50OiBTdHJpbmdSZXBsYWNlbWVudCk6IFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChbcmVwbGFjZW1lbnRdKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVwbGFjZShyYW5nZTogT2Zmc2V0UmFuZ2UsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBTdHJpbmdFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQoW25ldyBTdHJpbmdSZXBsYWNlbWVudChyYW5nZSwgcmVwbGFjZW1lbnQpXSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGluc2VydChvZmZzZXQ6IG51bWJlciwgcmVwbGFjZW1lbnQ6IHN0cmluZyk6IFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChbbmV3IFN0cmluZ1JlcGxhY2VtZW50KE9mZnNldFJhbmdlLmVtcHR5QXQob2Zmc2V0KSwgcmVwbGFjZW1lbnQpXSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZShyYW5nZTogT2Zmc2V0UmFuZ2UpOiBTdHJpbmdFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQoW25ldyBTdHJpbmdSZXBsYWNlbWVudChyYW5nZSwgJycpXSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21Kc29uKGRhdGE6IElTZXJpYWxpemVkU3RyaW5nRWRpdCk6IFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChkYXRhLm1hcChTdHJpbmdSZXBsYWNlbWVudC5mcm9tSnNvbikpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjb21wb3NlKGVkaXRzOiByZWFkb25seSBTdHJpbmdFZGl0W10pOiBTdHJpbmdFZGl0IHtcblx0XHRpZiAoZWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gU3RyaW5nRWRpdC5lbXB0eTtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdCA9IGVkaXRzWzBdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZWRpdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5jb21wb3NlKGVkaXRzW2ldKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgcmVwbGFjZW1lbnRzIGFyZSBhcHBsaWVkIGluIG9yZGVyIVxuXHQgKiBFcXVhbHMgYFN0cmluZ0VkaXQuY29tcG9zZShyZXBsYWNlbWVudHMubWFwKHIgPT4gci50b0VkaXQoKSkpYCwgYnV0IGlzIG11Y2ggbW9yZSBwZXJmb3JtYW50LlxuXHQqL1xuXHRwdWJsaWMgc3RhdGljIGNvbXBvc2VTZXF1ZW50aWFsUmVwbGFjZW1lbnRzKHJlcGxhY2VtZW50czogcmVhZG9ubHkgU3RyaW5nUmVwbGFjZW1lbnRbXSk6IFN0cmluZ0VkaXQge1xuXHRcdGxldCBlZGl0ID0gU3RyaW5nRWRpdC5lbXB0eTtcblx0XHRsZXQgY3VyRWRpdFJlcGxhY2VtZW50czogU3RyaW5nUmVwbGFjZW1lbnRbXSA9IFtdOyAvLyBUaGVzZSBhcmUgcmV2ZXJzZSBzb3J0ZWRcblxuXHRcdGZvciAoY29uc3QgciBvZiByZXBsYWNlbWVudHMpIHtcblx0XHRcdGNvbnN0IGxhc3QgPSBjdXJFZGl0UmVwbGFjZW1lbnRzLmF0KC0xKTtcblx0XHRcdGlmICghbGFzdCB8fCByLnJlcGxhY2VSYW5nZS5pc0JlZm9yZShsYXN0LnJlcGxhY2VSYW5nZSkpIHtcblx0XHRcdFx0Ly8gRGV0ZWN0IHN1YnNlcXVlbmNlcyBvZiByZXZlcnNlIHNvcnRlZCByZXBsYWNlbWVudHNcblx0XHRcdFx0Y3VyRWRpdFJlcGxhY2VtZW50cy5wdXNoKHIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gT25jZSB0aGUgc3Vic2VxdWVuY2UgaXMgYnJva2VuLCBjb21wb3NlIHRoZSBjdXJyZW50IHJlcGxhY2VtZW50cyBhbmQgbG9vayBmb3IgYSBuZXcgc3Vic2VxdWVuY2UuXG5cdFx0XHRcdGVkaXQgPSBlZGl0LmNvbXBvc2UoU3RyaW5nRWRpdC5jcmVhdGUoY3VyRWRpdFJlcGxhY2VtZW50cy5yZXZlcnNlKCkpKTtcblx0XHRcdFx0Y3VyRWRpdFJlcGxhY2VtZW50cyA9IFtyXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlZGl0ID0gZWRpdC5jb21wb3NlKFN0cmluZ0VkaXQuY3JlYXRlKGN1ckVkaXRSZXBsYWNlbWVudHMucmV2ZXJzZSgpKSk7XG5cdFx0cmV0dXJuIGVkaXQ7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihyZXBsYWNlbWVudHM6IHJlYWRvbmx5IFN0cmluZ1JlcGxhY2VtZW50W10pIHtcblx0XHRzdXBlcihyZXBsYWNlbWVudHMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9jcmVhdGVOZXcocmVwbGFjZW1lbnRzOiByZWFkb25seSBTdHJpbmdSZXBsYWNlbWVudFtdKTogU3RyaW5nRWRpdCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KHJlcGxhY2VtZW50cyk7XG5cdH1cbn1cblxuLyoqXG4gKiBXYXJuaW5nOiBCZSBjYXJlZnVsIHdoZW4gY2hhbmdpbmcgdGhpcyB0eXBlLCBhcyBpdCBpcyB1c2VkIGZvciBzZXJpYWxpemF0aW9uIVxuKi9cbmV4cG9ydCB0eXBlIElTZXJpYWxpemVkU3RyaW5nRWRpdCA9IElTZXJpYWxpemVkU3RyaW5nUmVwbGFjZW1lbnRbXTtcblxuLyoqXG4gKiBXYXJuaW5nOiBCZSBjYXJlZnVsIHdoZW4gY2hhbmdpbmcgdGhpcyB0eXBlLCBhcyBpdCBpcyB1c2VkIGZvciBzZXJpYWxpemF0aW9uIVxuKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRTdHJpbmdSZXBsYWNlbWVudCB7XG5cdHR4dDogc3RyaW5nO1xuXHRwb3M6IG51bWJlcjtcblx0bGVuOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBTdHJpbmdSZXBsYWNlbWVudCBleHRlbmRzIEJhc2VTdHJpbmdSZXBsYWNlbWVudDxTdHJpbmdSZXBsYWNlbWVudD4ge1xuXHRwdWJsaWMgc3RhdGljIGluc2VydChvZmZzZXQ6IG51bWJlciwgdGV4dDogc3RyaW5nKTogU3RyaW5nUmVwbGFjZW1lbnQge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nUmVwbGFjZW1lbnQoT2Zmc2V0UmFuZ2UuZW1wdHlBdChvZmZzZXQpLCB0ZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVwbGFjZShyYW5nZTogT2Zmc2V0UmFuZ2UsIHRleHQ6IHN0cmluZyk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ1JlcGxhY2VtZW50KHJhbmdlLCB0ZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZGVsZXRlKHJhbmdlOiBPZmZzZXRSYW5nZSk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ1JlcGxhY2VtZW50KHJhbmdlLCAnJyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21Kc29uKGRhdGE6IElTZXJpYWxpemVkU3RyaW5nUmVwbGFjZW1lbnQpOiBTdHJpbmdSZXBsYWNlbWVudCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudChPZmZzZXRSYW5nZS5vZlN0YXJ0QW5kTGVuZ3RoKGRhdGEucG9zLCBkYXRhLmxlbiksIGRhdGEudHh0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGVxdWFscyhvdGhlcjogU3RyaW5nUmVwbGFjZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsYWNlUmFuZ2UuZXF1YWxzKG90aGVyLnJlcGxhY2VSYW5nZSkgJiYgdGhpcy5uZXdUZXh0ID09PSBvdGhlci5uZXdUZXh0O1xuXHR9XG5cblx0b3ZlcnJpZGUgdHJ5Sm9pblRvdWNoaW5nKG90aGVyOiBTdHJpbmdSZXBsYWNlbWVudCk6IFN0cmluZ1JlcGxhY2VtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ1JlcGxhY2VtZW50KHRoaXMucmVwbGFjZVJhbmdlLmpvaW5SaWdodFRvdWNoaW5nKG90aGVyLnJlcGxhY2VSYW5nZSksIHRoaXMubmV3VGV4dCArIG90aGVyLm5ld1RleHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2xpY2UocmFuZ2U6IE9mZnNldFJhbmdlLCByYW5nZUluUmVwbGFjZW1lbnQ/OiBPZmZzZXRSYW5nZSk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ1JlcGxhY2VtZW50KHJhbmdlLCByYW5nZUluUmVwbGFjZW1lbnQgPyByYW5nZUluUmVwbGFjZW1lbnQuc3Vic3RyaW5nKHRoaXMubmV3VGV4dCkgOiB0aGlzLm5ld1RleHQpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUVkaXRzVG9SYW5nZXMoc29ydGVkUmFuZ2VzOiBPZmZzZXRSYW5nZVtdLCBlZGl0OiBTdHJpbmdFZGl0KTogT2Zmc2V0UmFuZ2VbXSB7XG5cdHNvcnRlZFJhbmdlcyA9IHNvcnRlZFJhbmdlcy5zbGljZSgpO1xuXG5cdC8vIHRyZWF0IGVkaXRzIGFzIGRlbGV0aW9uIG9mIHRoZSByZXBsYWNlIHJhbmdlIGFuZCB0aGVuIGFzIGluc2VydGlvbiB0aGF0IGV4dGVuZHMgdGhlIGZpcnN0IHJhbmdlXG5cdGNvbnN0IHJlc3VsdDogT2Zmc2V0UmFuZ2VbXSA9IFtdO1xuXG5cdGxldCBvZmZzZXQgPSAwO1xuXG5cdGZvciAoY29uc3QgZSBvZiBlZGl0LnJlcGxhY2VtZW50cykge1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHQvLyByYW5nZXMgYmVmb3JlIHRoZSBjdXJyZW50IGVkaXRcblx0XHRcdGNvbnN0IHIgPSBzb3J0ZWRSYW5nZXNbMF07XG5cdFx0XHRpZiAoIXIgfHwgci5lbmRFeGNsdXNpdmUgPj0gZS5yZXBsYWNlUmFuZ2Uuc3RhcnQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRzb3J0ZWRSYW5nZXMuc2hpZnQoKTtcblx0XHRcdHJlc3VsdC5wdXNoKHIuZGVsdGEob2Zmc2V0KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW50ZXJzZWN0aW5nOiBPZmZzZXRSYW5nZVtdID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IHIgPSBzb3J0ZWRSYW5nZXNbMF07XG5cdFx0XHRpZiAoIXIgfHwgIXIuaW50ZXJzZWN0c09yVG91Y2hlcyhlLnJlcGxhY2VSYW5nZSkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRzb3J0ZWRSYW5nZXMuc2hpZnQoKTtcblx0XHRcdGludGVyc2VjdGluZy5wdXNoKHIpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSBpbnRlcnNlY3RpbmcubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGxldCByID0gaW50ZXJzZWN0aW5nW2ldO1xuXG5cdFx0XHRjb25zdCBvdmVybGFwID0gci5pbnRlcnNlY3QoZS5yZXBsYWNlUmFuZ2UpIS5sZW5ndGg7XG5cdFx0XHRyID0gci5kZWx0YUVuZCgtb3ZlcmxhcCArIChpID09PSAwID8gZS5uZXdUZXh0Lmxlbmd0aCA6IDApKTtcblxuXHRcdFx0Y29uc3QgcmFuZ2VBaGVhZE9mUmVwbGFjZVJhbmdlID0gci5zdGFydCAtIGUucmVwbGFjZVJhbmdlLnN0YXJ0O1xuXHRcdFx0aWYgKHJhbmdlQWhlYWRPZlJlcGxhY2VSYW5nZSA+IDApIHtcblx0XHRcdFx0ciA9IHIuZGVsdGEoLXJhbmdlQWhlYWRPZlJlcGxhY2VSYW5nZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpICE9PSAwKSB7XG5cdFx0XHRcdHIgPSByLmRlbHRhKGUubmV3VGV4dC5sZW5ndGgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBhbHJlYWR5IHRvb2sgb3VyIG9mZnNldCBpbnRvIGFjY291bnQuXG5cdFx0XHQvLyBCZWNhdXNlIHdlIGFkZCByIGJhY2sgdG8gdGhlIHF1ZXVlICh3aGljaCB0aGVuIGFkZHMgb2Zmc2V0IGFnYWluKSxcblx0XHRcdC8vIHdlIGhhdmUgdG8gcmVtb3ZlIGl0IGhlcmUuXG5cdFx0XHRyID0gci5kZWx0YSgtKGUubmV3VGV4dC5sZW5ndGggLSBlLnJlcGxhY2VSYW5nZS5sZW5ndGgpKTtcblxuXHRcdFx0c29ydGVkUmFuZ2VzLnVuc2hpZnQocik7XG5cdFx0fVxuXG5cdFx0b2Zmc2V0ICs9IGUubmV3VGV4dC5sZW5ndGggLSBlLnJlcGxhY2VSYW5nZS5sZW5ndGg7XG5cdH1cblxuXHR3aGlsZSAodHJ1ZSkge1xuXHRcdGNvbnN0IHIgPSBzb3J0ZWRSYW5nZXNbMF07XG5cdFx0aWYgKCFyKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0c29ydGVkUmFuZ2VzLnNoaWZ0KCk7XG5cdFx0cmVzdWx0LnB1c2goci5kZWx0YShvZmZzZXQpKTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBkYXRhIGFzc29jaWF0ZWQgdG8gYSBzaW5nbGUgZWRpdCwgd2hpY2ggc3Vydml2ZXMgY2VydGFpbiBlZGl0IG9wZXJhdGlvbnMuXG4qL1xuZXhwb3J0IGludGVyZmFjZSBJRWRpdERhdGE8VD4ge1xuXHRqb2luKG90aGVyOiBUKTogVCB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFZvaWRFZGl0RGF0YSBpbXBsZW1lbnRzIElFZGl0RGF0YTxWb2lkRWRpdERhdGE+IHtcblx0am9pbihvdGhlcjogVm9pZEVkaXREYXRhKTogVm9pZEVkaXREYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBzZXQgb2YgcmVwbGFjZW1lbnRzIHRvIGEgc3RyaW5nLlxuICogQWxsIHRoZXNlIHJlcGxhY2VtZW50cyBhcmUgYXBwbGllZCBhdCBvbmNlLlxuKi9cbmV4cG9ydCBjbGFzcyBBbm5vdGF0ZWRTdHJpbmdFZGl0PFQgZXh0ZW5kcyBJRWRpdERhdGE8VD4+IGV4dGVuZHMgQmFzZVN0cmluZ0VkaXQ8QW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4sIEFubm90YXRlZFN0cmluZ0VkaXQ8VD4+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBlbXB0eSA9IG5ldyBBbm5vdGF0ZWRTdHJpbmdFZGl0PG5ldmVyPihbXSk7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGU8VCBleHRlbmRzIElFZGl0RGF0YTxUPj4ocmVwbGFjZW1lbnRzOiByZWFkb25seSBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPltdKTogQW5ub3RhdGVkU3RyaW5nRWRpdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdFZGl0KHJlcGxhY2VtZW50cyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNpbmdsZTxUIGV4dGVuZHMgSUVkaXREYXRhPFQ+PihyZXBsYWNlbWVudDogQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4pOiBBbm5vdGF0ZWRTdHJpbmdFZGl0PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ0VkaXQoW3JlcGxhY2VtZW50XSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlcGxhY2U8VCBleHRlbmRzIElFZGl0RGF0YTxUPj4ocmFuZ2U6IE9mZnNldFJhbmdlLCByZXBsYWNlbWVudDogc3RyaW5nLCBkYXRhOiBUKTogQW5ub3RhdGVkU3RyaW5nRWRpdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdFZGl0KFtuZXcgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQocmFuZ2UsIHJlcGxhY2VtZW50LCBkYXRhKV0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpbnNlcnQ8VCBleHRlbmRzIElFZGl0RGF0YTxUPj4ob2Zmc2V0OiBudW1iZXIsIHJlcGxhY2VtZW50OiBzdHJpbmcsIGRhdGE6IFQpOiBBbm5vdGF0ZWRTdHJpbmdFZGl0PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ0VkaXQoW25ldyBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudChPZmZzZXRSYW5nZS5lbXB0eUF0KG9mZnNldCksIHJlcGxhY2VtZW50LCBkYXRhKV0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZWxldGU8VCBleHRlbmRzIElFZGl0RGF0YTxUPj4ocmFuZ2U6IE9mZnNldFJhbmdlLCBkYXRhOiBUKTogQW5ub3RhdGVkU3RyaW5nRWRpdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdFZGl0KFtuZXcgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQocmFuZ2UsICcnLCBkYXRhKV0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjb21wb3NlPFQgZXh0ZW5kcyBJRWRpdERhdGE8VD4+KGVkaXRzOiByZWFkb25seSBBbm5vdGF0ZWRTdHJpbmdFZGl0PFQ+W10pOiBBbm5vdGF0ZWRTdHJpbmdFZGl0PFQ+IHtcblx0XHRpZiAoZWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gQW5ub3RhdGVkU3RyaW5nRWRpdC5lbXB0eTtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdCA9IGVkaXRzWzBdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZWRpdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5jb21wb3NlKGVkaXRzW2ldKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHJlcGxhY2VtZW50czogcmVhZG9ubHkgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD5bXSkge1xuXHRcdHN1cGVyKHJlcGxhY2VtZW50cyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2NyZWF0ZU5ldyhyZXBsYWNlbWVudHM6IHJlYWRvbmx5IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+W10pOiBBbm5vdGF0ZWRTdHJpbmdFZGl0PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ0VkaXQ8VD4ocmVwbGFjZW1lbnRzKTtcblx0fVxuXG5cdHB1YmxpYyB0b1N0cmluZ0VkaXQoZmlsdGVyPzogKHJlcGxhY2VtZW50OiBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPikgPT4gYm9vbGVhbik6IFN0cmluZ0VkaXQge1xuXHRcdGNvbnN0IG5ld1JlcGxhY2VtZW50czogU3RyaW5nUmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgciBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0aWYgKCFmaWx0ZXIgfHwgZmlsdGVyKHIpKSB7XG5cdFx0XHRcdG5ld1JlcGxhY2VtZW50cy5wdXNoKG5ldyBTdHJpbmdSZXBsYWNlbWVudChyLnJlcGxhY2VSYW5nZSwgci5uZXdUZXh0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChuZXdSZXBsYWNlbWVudHMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUIGV4dGVuZHMgSUVkaXREYXRhPFQ+PiBleHRlbmRzIEJhc2VTdHJpbmdSZXBsYWNlbWVudDxBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPj4ge1xuXHRwdWJsaWMgc3RhdGljIGluc2VydDxUIGV4dGVuZHMgSUVkaXREYXRhPFQ+PihvZmZzZXQ6IG51bWJlciwgdGV4dDogc3RyaW5nLCBkYXRhOiBUKTogQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4ge1xuXHRcdHJldHVybiBuZXcgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4oT2Zmc2V0UmFuZ2UuZW1wdHlBdChvZmZzZXQpLCB0ZXh0LCBkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVwbGFjZTxUIGV4dGVuZHMgSUVkaXREYXRhPFQ+PihyYW5nZTogT2Zmc2V0UmFuZ2UsIHRleHQ6IHN0cmluZywgZGF0YTogVCk6IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+KHJhbmdlLCB0ZXh0LCBkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZGVsZXRlPFQgZXh0ZW5kcyBJRWRpdERhdGE8VD4+KHJhbmdlOiBPZmZzZXRSYW5nZSwgZGF0YTogVCk6IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+KHJhbmdlLCAnJywgZGF0YSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyYW5nZTogT2Zmc2V0UmFuZ2UsXG5cdFx0bmV3VGV4dDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBkYXRhOiBUXG5cdCkge1xuXHRcdHN1cGVyKHJhbmdlLCBuZXdUZXh0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGVxdWFscyhvdGhlcjogQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsYWNlUmFuZ2UuZXF1YWxzKG90aGVyLnJlcGxhY2VSYW5nZSkgJiYgdGhpcy5uZXdUZXh0ID09PSBvdGhlci5uZXdUZXh0ICYmIHRoaXMuZGF0YSA9PT0gb3RoZXIuZGF0YTtcblx0fVxuXG5cdHRyeUpvaW5Ub3VjaGluZyhvdGhlcjogQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4pOiBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgam9pbmVkID0gdGhpcy5kYXRhLmpvaW4ob3RoZXIuZGF0YSk7XG5cdFx0aWYgKGpvaW5lZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50KHRoaXMucmVwbGFjZVJhbmdlLmpvaW5SaWdodFRvdWNoaW5nKG90aGVyLnJlcGxhY2VSYW5nZSksIHRoaXMubmV3VGV4dCArIG90aGVyLm5ld1RleHQsIGpvaW5lZCk7XG5cdH1cblxuXHRzbGljZShyYW5nZTogT2Zmc2V0UmFuZ2UsIHJhbmdlSW5SZXBsYWNlbWVudD86IE9mZnNldFJhbmdlKTogQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4ge1xuXHRcdHJldHVybiBuZXcgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQocmFuZ2UsIHJhbmdlSW5SZXBsYWNlbWVudCA/IHJhbmdlSW5SZXBsYWNlbWVudC5zdWJzdHJpbmcodGhpcy5uZXdUZXh0KSA6IHRoaXMubmV3VGV4dCwgdGhpcy5kYXRhKTtcblx0fVxufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBib3RoIHJhbmdlcyBhcmUgZW1wdHkgKGluc2VydHMpIGF0IHRoZSBleGFjdCBzYW1lIHBvc2l0aW9uLlxuICogSW4gdGhpcyBjYXNlLCBhbHRob3VnaCB0aGV5IGRvbid0IFwiaW50ZXJzZWN0XCIgaW4gdGhlIHRyYWRpdGlvbmFsIHNlbnNlLFxuICogdGhleSBjb25mbGljdCBiZWNhdXNlIHRoZSBvcmRlciBvZiBpbnNlcnRpb24gbWF0dGVycy5cbiAqL1xuZnVuY3Rpb24gYXJlQ29uY3VycmVudEluc2VydHMocjE6IE9mZnNldFJhbmdlLCByMjogT2Zmc2V0UmFuZ2UpOiBib29sZWFuIHtcblx0cmV0dXJuIHIxLmlzRW1wdHkgJiYgcjIuaXNFbXB0eSAmJiByMS5zdGFydCA9PT0gcjIuc3RhcnQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIGBpbnNlcnRgIGlzIGFuIGVtcHR5IHJhbmdlIChpbnNlcnQpIHN0cmljdGx5IGluc2lkZSBgcmFuZ2VgLlxuICogRm9yIGV4YW1wbGUsIGluc2VydCBhdCBwb3NpdGlvbiA1IGlzIGluc2lkZSBbMywgNykgYnV0IG5vdCBpbnNpZGUgWzUsIDcpIG9yIFszLCA1KS5cbiAqL1xuZnVuY3Rpb24gaXNJbnNlcnRTdHJpY3RseUluc2lkZVJhbmdlKGluc2VydDogT2Zmc2V0UmFuZ2UsIHJhbmdlOiBPZmZzZXRSYW5nZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaW5zZXJ0LmlzRW1wdHkgJiYgcmFuZ2Uuc3RhcnQgPCBpbnNlcnQuc3RhcnQgJiYgaW5zZXJ0LnN0YXJ0IDwgcmFuZ2UuZW5kRXhjbHVzaXZlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxvQkFBb0IsMEJBQTBCO0FBQ3ZELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsVUFBVSx1QkFBdUI7QUFJbkMsTUFBZSx1QkFBMkosU0FBbUI7QUFBQSxFQUNuTSxJQUFJLGVBQWtCO0FBQ3JCLFVBQU0sSUFBSSxNQUFNLGdEQUFnRDtBQUFBLEVBQ2pFO0FBQUEsRUFFQSxPQUFjLG1CQUE2QyxPQUFvQztBQUM5RixRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxTQUFTLE1BQU0sQ0FBQztBQUNwQixhQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBRXRDLGVBQVMsT0FBTyxRQUFRLE1BQU0sQ0FBQyxDQUFDO0FBQUEsSUFDakM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxPQUFjLFFBQVEsSUFBb0IsSUFBb0U7QUFFN0csVUFBTSxRQUFRLEdBQUcsZUFBZSxDQUFDLE9BQU8sVUFBVSxJQUFJLE9BQU8sUUFBUSxLQUFLLENBQUM7QUFFM0UsVUFBTSxNQUFNLEdBQUcsVUFBVSxLQUFLO0FBQzlCLFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLE1BQU0sR0FBRyxVQUFVLEdBQUc7QUFDNUIsUUFBSSxDQUFDLEtBQUs7QUFDVCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sRUFBRSxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQUEsRUFDM0I7QUFBQSxFQUVPLE1BQU0sTUFBc0I7QUFDbEMsVUFBTSxhQUF1QixDQUFDO0FBQzlCLFFBQUksTUFBTTtBQUNWLGVBQVcsUUFBUSxLQUFLLGNBQWM7QUFDckMsaUJBQVcsS0FBSyxLQUFLLFVBQVUsS0FBSyxLQUFLLGFBQWEsS0FBSyxDQUFDO0FBQzVELGlCQUFXLEtBQUssS0FBSyxPQUFPO0FBQzVCLFlBQU0sS0FBSyxhQUFhO0FBQUEsSUFDekI7QUFDQSxlQUFXLEtBQUssS0FBSyxVQUFVLEdBQUcsQ0FBQztBQUNuQyxXQUFPLFdBQVcsS0FBSyxFQUFFO0FBQUEsRUFDMUI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLGVBQWUsa0JBQXdFO0FBQzdGLFVBQU0sUUFBNkIsQ0FBQztBQUNwQyxRQUFJLFNBQVM7QUFDYixlQUFXLEtBQUssS0FBSyxjQUFjO0FBQ2xDLFlBQU0sS0FBSyxrQkFBa0I7QUFBQSxRQUM1QixZQUFZLGlCQUFpQixFQUFFLGFBQWEsUUFBUSxRQUFRLEVBQUUsUUFBUSxNQUFNO0FBQUEsUUFDNUUsaUJBQWlCLEVBQUUsYUFBYSxPQUFPLEVBQUUsYUFBYSxZQUFZO0FBQUEsTUFDbkUsQ0FBQztBQUNELGdCQUFVLEVBQUUsUUFBUSxTQUFTLEVBQUUsYUFBYTtBQUFBLElBQzdDO0FBQ0EsV0FBTyxJQUFJLFdBQVcsS0FBSztBQUFBLEVBQzVCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxRQUFRLFVBQThCO0FBQzVDLFdBQU8sS0FBSyxlQUFlLENBQUMsT0FBTyxVQUFVLFNBQVMsVUFBVSxPQUFPLEtBQUssQ0FBQztBQUFBLEVBQzlFO0FBQUEsRUFFTyxzQkFBc0IsTUFBOEI7QUFDMUQsV0FBTyxLQUFLLFdBQVcsTUFBTSxLQUFLO0FBQUEsRUFDbkM7QUFBQSxFQUVPLFVBQVUsTUFBMEM7QUFDMUQsV0FBTyxLQUFLLFdBQVcsTUFBTSxJQUFJO0FBQUEsRUFDbEM7QUFBQSxFQUVRLFdBQVcsTUFBa0IsV0FBNEM7QUFDaEYsVUFBTSxXQUFnQyxDQUFDO0FBRXZDLFFBQUksVUFBVTtBQUNkLFFBQUksU0FBUztBQUNiLFFBQUksU0FBUztBQUViLFdBQU8sU0FBUyxLQUFLLGFBQWEsVUFBVSxVQUFVLEtBQUssYUFBYSxRQUFRO0FBRS9FLFlBQU0sV0FBVyxLQUFLLGFBQWEsR0FBRyxPQUFPO0FBQzdDLFlBQU0sVUFBVSxLQUFLLGFBQWEsR0FBRyxNQUFNO0FBRTNDLFVBQUksQ0FBQyxTQUFTO0FBRWI7QUFBQSxNQUNELFdBQVcsQ0FBQyxVQUFVO0FBRXJCLGNBQU0sbUJBQW1CLFFBQVEsYUFBYSxNQUFNLE1BQU07QUFDMUQsaUJBQVMsS0FBSyxJQUFJLGtCQUFrQixrQkFBa0IsUUFBUSxPQUFPLENBQUM7QUFDdEU7QUFBQSxNQUNELFdBQ0MsUUFBUSxhQUFhLFdBQVcsU0FBUyxZQUFZLEtBQ3JELHFCQUFxQixRQUFRLGNBQWMsU0FBUyxZQUFZLEtBQ2hFLDRCQUE0QixRQUFRLGNBQWMsU0FBUyxZQUFZLEtBQ3ZFLDRCQUE0QixTQUFTLGNBQWMsUUFBUSxZQUFZLEdBQ3RFO0FBQ0Q7QUFDQSxZQUFJLFdBQVc7QUFDZCxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNELFdBQVcsUUFBUSxhQUFhLFFBQVEsU0FBUyxhQUFhLFNBQzVELFFBQVEsYUFBYSxXQUFXLFFBQVEsYUFBYSxVQUFVLFNBQVMsYUFBYSxPQUFRO0FBRTlGLGNBQU0sbUJBQW1CLFFBQVEsYUFBYSxNQUFNLE1BQU07QUFFMUQsaUJBQVMsS0FBSyxJQUFJLGtCQUFrQixrQkFBa0IsUUFBUSxPQUFPLENBQUM7QUFDdEU7QUFBQSxNQUNELE9BQU87QUFDTjtBQUNBLGtCQUFVLFNBQVMsUUFBUSxTQUFTLFNBQVMsYUFBYTtBQUFBLE1BQzNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sSUFBSSxXQUFXLFFBQVE7QUFBQSxFQUMvQjtBQUFBLEVBRU8sU0FBZ0M7QUFDdEMsV0FBTyxLQUFLLGFBQWEsSUFBSSxPQUFLLEVBQUUsT0FBTyxDQUFDO0FBQUEsRUFDN0M7QUFBQSxFQUVPLFlBQVksTUFBdUI7QUFDekMsV0FBTyxLQUFLLGFBQWEsTUFBTSxPQUFLLEVBQUUsWUFBWSxJQUFJLENBQUM7QUFBQSxFQUN4RDtBQUFBLEVBRU8seUJBQXlCLGNBQWtDO0FBQ2pFLFVBQU0sUUFBNkIsQ0FBQztBQUNwQyxlQUFXLEtBQUssS0FBSyxjQUFjO0FBQ2xDLFlBQU0sT0FBTyxFQUFFLHlCQUF5QixZQUFZO0FBQ3BELFVBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsY0FBTSxLQUFLLElBQUk7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFDQSxXQUFPLElBQUksV0FBVyxLQUFLO0FBQUEsRUFDNUI7QUFBQSxFQUVPLGFBQWEsS0FBZ0M7QUFDbkQsV0FBTyxJQUFJLFdBQVcsS0FBSyxhQUFhLElBQUksVUFBUSxLQUFLLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUM1RTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sa0JBQWtCLFFBQTRCO0FBQ3BELFVBQU0sU0FBUyxLQUFLLE1BQU0sTUFBTTtBQUVoQyxVQUFNLE9BQU8sa0JBQWtCLFFBQVEsWUFBWSxTQUFTLE9BQU8sTUFBTSxHQUFHLE1BQU07QUFDbEYsVUFBTSxJQUFJLEtBQUssNEJBQTRCLE1BQU07QUFDakQsUUFBSSxFQUFFLFNBQVM7QUFDZCxhQUFPLFdBQVc7QUFBQSxJQUNuQjtBQUNBLFdBQU8sRUFBRSxPQUFPO0FBQUEsRUFDakI7QUFBQSxFQUVPLDRCQUE0QixRQUF1QjtBQUN6RCxXQUFPLEtBQUssV0FBVyxLQUFLLGFBQWEsSUFBSSxPQUFLLEVBQUUsNEJBQTRCLE1BQU0sQ0FBQyxDQUFDLEVBQUUsVUFBVTtBQUFBLEVBQ3JHO0FBQUEsRUFFTyxZQUFZLGFBQXFDO0FBQ3ZELFdBQU8sSUFBSSxXQUFXLEtBQUssTUFBTSxZQUFZLEtBQUssQ0FBQztBQUFBLEVBQ3BEO0FBQUEsRUFFTyxRQUF3QyxHQUEwRDtBQUN4RyxXQUFPLElBQUk7QUFBQSxNQUNWLEtBQUssYUFBYSxJQUFJLE9BQUssSUFBSTtBQUFBLFFBQzlCLEVBQUU7QUFBQSxRQUNGLEVBQUU7QUFBQSxRQUNGLEVBQUUsQ0FBQztBQUFBLE1BQ0osQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUFHTyxNQUFlLDhCQUErRixnQkFBbUI7QUFBQSxFQUN2SSxZQUNDLE9BQ2dCLFNBQ2Y7QUFDRCxVQUFNLEtBQUs7QUFGSztBQUFBLEVBR2pCO0FBQUEsRUFFQSxlQUF1QjtBQUFFLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFBUTtBQUFBLEVBRTVDLFdBQW1CO0FBQzNCLFdBQU8sR0FBRyxLQUFLLFlBQVksT0FBTyxLQUFLLFVBQVUsS0FBSyxPQUFPLENBQUM7QUFBQSxFQUMvRDtBQUFBLEVBRUEsUUFBUSxLQUFxQjtBQUM1QixXQUFPLElBQUksVUFBVSxHQUFHLEtBQUssYUFBYSxLQUFLLElBQUksS0FBSyxVQUFVLElBQUksVUFBVSxLQUFLLGFBQWEsWUFBWTtBQUFBLEVBQy9HO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxZQUFZLE1BQXVCO0FBQ2xDLFdBQU8sS0FBSyxZQUFZLEtBQUssVUFBVSxLQUFLLGFBQWEsT0FBTyxLQUFLLGFBQWEsWUFBWTtBQUFBLEVBQy9GO0FBQUEsRUFFQSx5QkFBeUIsY0FBeUM7QUFDakUsVUFBTSxVQUFVLGFBQWEsVUFBVSxLQUFLLGFBQWEsT0FBTyxLQUFLLGFBQWEsWUFBWTtBQUU5RixVQUFNLFlBQVksbUJBQW1CLFNBQVMsS0FBSyxPQUFPO0FBQzFELFVBQU0sWUFBWSxLQUFLO0FBQUEsTUFDdEIsUUFBUSxTQUFTO0FBQUEsTUFDakIsS0FBSyxRQUFRLFNBQVM7QUFBQSxNQUN0QixtQkFBbUIsU0FBUyxLQUFLLE9BQU87QUFBQSxJQUN6QztBQUVBLFVBQU0sZUFBZSxJQUFJO0FBQUEsTUFDeEIsS0FBSyxhQUFhLFFBQVE7QUFBQSxNQUMxQixLQUFLLGFBQWEsZUFBZTtBQUFBLElBQ2xDO0FBQ0EsVUFBTSxVQUFVLEtBQUssUUFBUSxVQUFVLFdBQVcsS0FBSyxRQUFRLFNBQVMsU0FBUztBQUVqRixXQUFPLElBQUksa0JBQWtCLGNBQWMsT0FBTztBQUFBLEVBQ25EO0FBQUEsRUFFQSxhQUFhLEtBQXVDO0FBQ25ELFVBQU0sVUFBVSxLQUFLLFFBQVEsUUFBUSxZQUFZLEdBQUc7QUFDcEQsV0FBTyxJQUFJLGtCQUFrQixLQUFLLGNBQWMsT0FBTztBQUFBLEVBQ3hEO0FBQUEsRUFFTyw0QkFBNEIsUUFBbUI7QUFDckQsV0FBTyxLQUFLLG1CQUFtQixNQUFNLEVBQUUsbUJBQW1CLE1BQU07QUFBQSxFQUNqRTtBQUFBLEVBRU8sbUJBQW1CLFFBQW1CO0FBQzVDLFVBQU0sVUFBVSxLQUFLLGFBQWEsVUFBVSxNQUFNO0FBRWxELFVBQU0sWUFBWSxtQkFBbUIsU0FBUyxLQUFLLE9BQU87QUFDMUQsUUFBSSxjQUFjLEdBQUc7QUFDcEIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssTUFBTSxLQUFLLGFBQWEsV0FBVyxTQUFTLEdBQUcsSUFBSSxZQUFZLFdBQVcsS0FBSyxRQUFRLE1BQU0sQ0FBQztBQUFBLEVBQzNHO0FBQUEsRUFFTyxtQkFBbUIsUUFBbUI7QUFDNUMsVUFBTSxVQUFVLEtBQUssYUFBYSxVQUFVLE1BQU07QUFFbEQsVUFBTSxZQUFZLG1CQUFtQixTQUFTLEtBQUssT0FBTztBQUMxRCxRQUFJLGNBQWMsR0FBRztBQUNwQixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxNQUFNLEtBQUssYUFBYSxTQUFTLENBQUMsU0FBUyxHQUFHLElBQUksWUFBWSxHQUFHLEtBQUssUUFBUSxTQUFTLFNBQVMsQ0FBQztBQUFBLEVBQzlHO0FBQUEsRUFFTyxTQUFxQjtBQUMzQixXQUFPLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQztBQUFBLEVBQzdCO0FBQUEsRUFFTyxTQUF1QztBQUM3QyxXQUFRO0FBQUEsTUFDUCxLQUFLLEtBQUs7QUFBQSxNQUNWLEtBQUssS0FBSyxhQUFhO0FBQUEsTUFDdkIsS0FBSyxLQUFLLGFBQWE7QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFDRDtBQU9PLE1BQU0sY0FBTixNQUFNLG9CQUFtQixlQUE4QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLN0UsT0FBYyxNQUFNLGVBQW1DO0FBQ3RELFVBQU0sZUFBb0MsQ0FBQztBQUMzQyxVQUFNLFFBQVE7QUFDZCxRQUFJO0FBRUosWUFBUSxRQUFRLE1BQU0sS0FBSyxhQUFhLE9BQU8sTUFBTTtBQUNwRCxZQUFNLFFBQVEsU0FBUyxNQUFNLENBQUMsR0FBRyxFQUFFO0FBQ25DLFlBQU0sUUFBUSxTQUFTLE1BQU0sQ0FBQyxHQUFHLEVBQUU7QUFDbkMsWUFBTSxPQUFPLE1BQU0sQ0FBQyxFQUFFLFFBQVEsUUFBUSxJQUFJLEVBQUUsUUFBUSxRQUFRLElBQUksRUFBRSxRQUFRLFNBQVMsSUFBSTtBQUN2RixtQkFBYSxLQUFLLElBQUksa0JBQWtCLElBQUksWUFBWSxPQUFPLEtBQUssR0FBRyxJQUFJLENBQUM7QUFBQSxJQUM3RTtBQUVBLFdBQU8sSUFBSSxZQUFXLFlBQVk7QUFBQSxFQUNuQztBQUFBLEVBSUEsT0FBYyxPQUFPLGNBQXdEO0FBQzVFLFdBQU8sSUFBSSxZQUFXLFlBQVk7QUFBQSxFQUNuQztBQUFBLEVBRUEsT0FBYyxPQUFPLGFBQTRDO0FBQ2hFLFdBQU8sSUFBSSxZQUFXLENBQUMsV0FBVyxDQUFDO0FBQUEsRUFDcEM7QUFBQSxFQUVBLE9BQWMsUUFBUSxPQUFvQixhQUFpQztBQUMxRSxXQUFPLElBQUksWUFBVyxDQUFDLElBQUksa0JBQWtCLE9BQU8sV0FBVyxDQUFDLENBQUM7QUFBQSxFQUNsRTtBQUFBLEVBRUEsT0FBYyxPQUFPLFFBQWdCLGFBQWlDO0FBQ3JFLFdBQU8sSUFBSSxZQUFXLENBQUMsSUFBSSxrQkFBa0IsWUFBWSxRQUFRLE1BQU0sR0FBRyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3hGO0FBQUEsRUFFQSxPQUFjLE9BQU8sT0FBZ0M7QUFDcEQsV0FBTyxJQUFJLFlBQVcsQ0FBQyxJQUFJLGtCQUFrQixPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQUEsRUFDekQ7QUFBQSxFQUVBLE9BQWMsU0FBUyxNQUF5QztBQUMvRCxXQUFPLElBQUksWUFBVyxLQUFLLElBQUksa0JBQWtCLFFBQVEsQ0FBQztBQUFBLEVBQzNEO0FBQUEsRUFFQSxPQUFjLFFBQVEsT0FBMEM7QUFDL0QsUUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2QixhQUFPLFlBQVc7QUFBQSxJQUNuQjtBQUNBLFFBQUksU0FBUyxNQUFNLENBQUM7QUFDcEIsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUN0QyxlQUFTLE9BQU8sUUFBUSxNQUFNLENBQUMsQ0FBQztBQUFBLElBQ2pDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsT0FBYyw4QkFBOEIsY0FBd0Q7QUFDbkcsUUFBSSxPQUFPLFlBQVc7QUFDdEIsUUFBSSxzQkFBMkMsQ0FBQztBQUVoRCxlQUFXLEtBQUssY0FBYztBQUM3QixZQUFNLE9BQU8sb0JBQW9CLEdBQUcsRUFBRTtBQUN0QyxVQUFJLENBQUMsUUFBUSxFQUFFLGFBQWEsU0FBUyxLQUFLLFlBQVksR0FBRztBQUV4RCw0QkFBb0IsS0FBSyxDQUFDO0FBQUEsTUFDM0IsT0FBTztBQUVOLGVBQU8sS0FBSyxRQUFRLFlBQVcsT0FBTyxvQkFBb0IsUUFBUSxDQUFDLENBQUM7QUFDcEUsOEJBQXNCLENBQUMsQ0FBQztBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSyxRQUFRLFlBQVcsT0FBTyxvQkFBb0IsUUFBUSxDQUFDLENBQUM7QUFDcEUsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFlBQVksY0FBNEM7QUFDdkQsVUFBTSxZQUFZO0FBQUEsRUFDbkI7QUFBQSxFQUVtQixXQUFXLGNBQXdEO0FBQ3JGLFdBQU8sSUFBSSxZQUFXLFlBQVk7QUFBQSxFQUNuQztBQUNEO0FBeEZhLFlBb0JXLFFBQVEsSUFBSSxZQUFXLENBQUMsQ0FBQztBQXBCMUMsSUFBTSxhQUFOO0FBd0dBLE1BQU0sMEJBQTBCLHNCQUF5QztBQUFBLEVBQy9FLE9BQWMsT0FBTyxRQUFnQixNQUFpQztBQUNyRSxXQUFPLElBQUksa0JBQWtCLFlBQVksUUFBUSxNQUFNLEdBQUcsSUFBSTtBQUFBLEVBQy9EO0FBQUEsRUFFQSxPQUFjLFFBQVEsT0FBb0IsTUFBaUM7QUFDMUUsV0FBTyxJQUFJLGtCQUFrQixPQUFPLElBQUk7QUFBQSxFQUN6QztBQUFBLEVBRUEsT0FBYyxPQUFPLE9BQXVDO0FBQzNELFdBQU8sSUFBSSxrQkFBa0IsT0FBTyxFQUFFO0FBQUEsRUFDdkM7QUFBQSxFQUVBLE9BQWMsU0FBUyxNQUF1RDtBQUM3RSxXQUFPLElBQUksa0JBQWtCLFlBQVksaUJBQWlCLEtBQUssS0FBSyxLQUFLLEdBQUcsR0FBRyxLQUFLLEdBQUc7QUFBQSxFQUN4RjtBQUFBLEVBRVMsT0FBTyxPQUFtQztBQUNsRCxXQUFPLEtBQUssYUFBYSxPQUFPLE1BQU0sWUFBWSxLQUFLLEtBQUssWUFBWSxNQUFNO0FBQUEsRUFDL0U7QUFBQSxFQUVTLGdCQUFnQixPQUF5RDtBQUNqRixXQUFPLElBQUksa0JBQWtCLEtBQUssYUFBYSxrQkFBa0IsTUFBTSxZQUFZLEdBQUcsS0FBSyxVQUFVLE1BQU0sT0FBTztBQUFBLEVBQ25IO0FBQUEsRUFFUyxNQUFNLE9BQW9CLG9CQUFxRDtBQUN2RixXQUFPLElBQUksa0JBQWtCLE9BQU8scUJBQXFCLG1CQUFtQixVQUFVLEtBQUssT0FBTyxJQUFJLEtBQUssT0FBTztBQUFBLEVBQ25IO0FBQ0Q7QUFFTyxTQUFTLG1CQUFtQixjQUE2QixNQUFpQztBQUNoRyxpQkFBZSxhQUFhLE1BQU07QUFHbEMsUUFBTSxTQUF3QixDQUFDO0FBRS9CLE1BQUksU0FBUztBQUViLGFBQVcsS0FBSyxLQUFLLGNBQWM7QUFDbEMsV0FBTyxNQUFNO0FBRVosWUFBTSxJQUFJLGFBQWEsQ0FBQztBQUN4QixVQUFJLENBQUMsS0FBSyxFQUFFLGdCQUFnQixFQUFFLGFBQWEsT0FBTztBQUNqRDtBQUFBLE1BQ0Q7QUFDQSxtQkFBYSxNQUFNO0FBQ25CLGFBQU8sS0FBSyxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDNUI7QUFFQSxVQUFNLGVBQThCLENBQUM7QUFDckMsV0FBTyxNQUFNO0FBQ1osWUFBTSxJQUFJLGFBQWEsQ0FBQztBQUN4QixVQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsb0JBQW9CLEVBQUUsWUFBWSxHQUFHO0FBQ2pEO0FBQUEsTUFDRDtBQUNBLG1CQUFhLE1BQU07QUFDbkIsbUJBQWEsS0FBSyxDQUFDO0FBQUEsSUFDcEI7QUFFQSxhQUFTLElBQUksYUFBYSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDbEQsVUFBSSxJQUFJLGFBQWEsQ0FBQztBQUV0QixZQUFNLFVBQVUsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFHO0FBQzdDLFVBQUksRUFBRSxTQUFTLENBQUMsV0FBVyxNQUFNLElBQUksRUFBRSxRQUFRLFNBQVMsRUFBRTtBQUUxRCxZQUFNLDJCQUEyQixFQUFFLFFBQVEsRUFBRSxhQUFhO0FBQzFELFVBQUksMkJBQTJCLEdBQUc7QUFDakMsWUFBSSxFQUFFLE1BQU0sQ0FBQyx3QkFBd0I7QUFBQSxNQUN0QztBQUVBLFVBQUksTUFBTSxHQUFHO0FBQ1osWUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLE1BQU07QUFBQSxNQUM3QjtBQUtBLFVBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxRQUFRLFNBQVMsRUFBRSxhQUFhLE9BQU87QUFFdkQsbUJBQWEsUUFBUSxDQUFDO0FBQUEsSUFDdkI7QUFFQSxjQUFVLEVBQUUsUUFBUSxTQUFTLEVBQUUsYUFBYTtBQUFBLEVBQzdDO0FBRUEsU0FBTyxNQUFNO0FBQ1osVUFBTSxJQUFJLGFBQWEsQ0FBQztBQUN4QixRQUFJLENBQUMsR0FBRztBQUNQO0FBQUEsSUFDRDtBQUNBLGlCQUFhLE1BQU07QUFDbkIsV0FBTyxLQUFLLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFBQSxFQUM1QjtBQUVBLFNBQU87QUFDUjtBQVNPLE1BQU0sYUFBZ0Q7QUFBQSxFQUM1RCxLQUFLLE9BQStDO0FBQ25ELFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFNTyxNQUFNLHVCQUFOLE1BQU0sNkJBQW9ELGVBQXNFO0FBQUEsRUFHdEksT0FBYyxPQUErQixjQUFnRjtBQUM1SCxXQUFPLElBQUkscUJBQW9CLFlBQVk7QUFBQSxFQUM1QztBQUFBLEVBRUEsT0FBYyxPQUErQixhQUFvRTtBQUNoSCxXQUFPLElBQUkscUJBQW9CLENBQUMsV0FBVyxDQUFDO0FBQUEsRUFDN0M7QUFBQSxFQUVBLE9BQWMsUUFBZ0MsT0FBb0IsYUFBcUIsTUFBaUM7QUFDdkgsV0FBTyxJQUFJLHFCQUFvQixDQUFDLElBQUksMkJBQTJCLE9BQU8sYUFBYSxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQzFGO0FBQUEsRUFFQSxPQUFjLE9BQStCLFFBQWdCLGFBQXFCLE1BQWlDO0FBQ2xILFdBQU8sSUFBSSxxQkFBb0IsQ0FBQyxJQUFJLDJCQUEyQixZQUFZLFFBQVEsTUFBTSxHQUFHLGFBQWEsSUFBSSxDQUFDLENBQUM7QUFBQSxFQUNoSDtBQUFBLEVBRUEsT0FBYyxPQUErQixPQUFvQixNQUFpQztBQUNqRyxXQUFPLElBQUkscUJBQW9CLENBQUMsSUFBSSwyQkFBMkIsT0FBTyxJQUFJLElBQUksQ0FBQyxDQUFDO0FBQUEsRUFDakY7QUFBQSxFQUVBLE9BQWMsUUFBZ0MsT0FBa0U7QUFDL0csUUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2QixhQUFPLHFCQUFvQjtBQUFBLElBQzVCO0FBQ0EsUUFBSSxTQUFTLE1BQU0sQ0FBQztBQUNwQixhQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3RDLGVBQVMsT0FBTyxRQUFRLE1BQU0sQ0FBQyxDQUFDO0FBQUEsSUFDakM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsWUFBWSxjQUF3RDtBQUNuRSxVQUFNLFlBQVk7QUFBQSxFQUNuQjtBQUFBLEVBRW1CLFdBQVcsY0FBZ0Y7QUFDN0csV0FBTyxJQUFJLHFCQUF1QixZQUFZO0FBQUEsRUFDL0M7QUFBQSxFQUVPLGFBQWEsUUFBOEU7QUFDakcsVUFBTSxrQkFBdUMsQ0FBQztBQUM5QyxlQUFXLEtBQUssS0FBSyxjQUFjO0FBQ2xDLFVBQUksQ0FBQyxVQUFVLE9BQU8sQ0FBQyxHQUFHO0FBQ3pCLHdCQUFnQixLQUFLLElBQUksa0JBQWtCLEVBQUUsY0FBYyxFQUFFLE9BQU8sQ0FBQztBQUFBLE1BQ3RFO0FBQUEsSUFDRDtBQUNBLFdBQU8sSUFBSSxXQUFXLGVBQWU7QUFBQSxFQUN0QztBQUNEO0FBbkRhLHFCQUNXLFFBQVEsSUFBSSxxQkFBMkIsQ0FBQyxDQUFDO0FBRDFELElBQU0sc0JBQU47QUFxREEsTUFBTSxtQ0FBMkQsc0JBQXFEO0FBQUEsRUFhNUgsWUFDQyxPQUNBLFNBQ2dCLE1BQ2Y7QUFDRCxVQUFNLE9BQU8sT0FBTztBQUZKO0FBQUEsRUFHakI7QUFBQSxFQWxCQSxPQUFjLE9BQStCLFFBQWdCLE1BQWMsTUFBd0M7QUFDbEgsV0FBTyxJQUFJLDJCQUE4QixZQUFZLFFBQVEsTUFBTSxHQUFHLE1BQU0sSUFBSTtBQUFBLEVBQ2pGO0FBQUEsRUFFQSxPQUFjLFFBQWdDLE9BQW9CLE1BQWMsTUFBd0M7QUFDdkgsV0FBTyxJQUFJLDJCQUE4QixPQUFPLE1BQU0sSUFBSTtBQUFBLEVBQzNEO0FBQUEsRUFFQSxPQUFjLE9BQStCLE9BQW9CLE1BQXdDO0FBQ3hHLFdBQU8sSUFBSSwyQkFBOEIsT0FBTyxJQUFJLElBQUk7QUFBQSxFQUN6RDtBQUFBLEVBVVMsT0FBTyxPQUErQztBQUM5RCxXQUFPLEtBQUssYUFBYSxPQUFPLE1BQU0sWUFBWSxLQUFLLEtBQUssWUFBWSxNQUFNLFdBQVcsS0FBSyxTQUFTLE1BQU07QUFBQSxFQUM5RztBQUFBLEVBRUEsZ0JBQWdCLE9BQWlGO0FBQ2hHLFVBQU0sU0FBUyxLQUFLLEtBQUssS0FBSyxNQUFNLElBQUk7QUFDeEMsUUFBSSxXQUFXLFFBQVc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLElBQUksMkJBQTJCLEtBQUssYUFBYSxrQkFBa0IsTUFBTSxZQUFZLEdBQUcsS0FBSyxVQUFVLE1BQU0sU0FBUyxNQUFNO0FBQUEsRUFDcEk7QUFBQSxFQUVBLE1BQU0sT0FBb0Isb0JBQWlFO0FBQzFGLFdBQU8sSUFBSSwyQkFBMkIsT0FBTyxxQkFBcUIsbUJBQW1CLFVBQVUsS0FBSyxPQUFPLElBQUksS0FBSyxTQUFTLEtBQUssSUFBSTtBQUFBLEVBQ3ZJO0FBQ0Q7QUFPQSxTQUFTLHFCQUFxQixJQUFpQixJQUEwQjtBQUN4RSxTQUFPLEdBQUcsV0FBVyxHQUFHLFdBQVcsR0FBRyxVQUFVLEdBQUc7QUFDcEQ7QUFNQSxTQUFTLDRCQUE0QixRQUFxQixPQUE2QjtBQUN0RixTQUFPLE9BQU8sV0FBVyxNQUFNLFFBQVEsT0FBTyxTQUFTLE9BQU8sUUFBUSxNQUFNO0FBQzdFOyIsCiAgIm5hbWVzIjogW10KfQo=
