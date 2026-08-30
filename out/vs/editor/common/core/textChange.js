import * as buffer from "../../../base/common/buffer.js";
import { decodeUTF16LE } from "./stringBuilder.js";
function escapeNewLine(str) {
  return str.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
class TextChange {
  constructor(oldPosition, oldText, newPosition, newText) {
    this.oldPosition = oldPosition;
    this.oldText = oldText;
    this.newPosition = newPosition;
    this.newText = newText;
  }
  get oldLength() {
    return this.oldText.length;
  }
  get oldEnd() {
    return this.oldPosition + this.oldText.length;
  }
  get newLength() {
    return this.newText.length;
  }
  get newEnd() {
    return this.newPosition + this.newText.length;
  }
  toString() {
    if (this.oldText.length === 0) {
      return `(insert@${this.oldPosition} "${escapeNewLine(this.newText)}")`;
    }
    if (this.newText.length === 0) {
      return `(delete@${this.oldPosition} "${escapeNewLine(this.oldText)}")`;
    }
    return `(replace@${this.oldPosition} "${escapeNewLine(this.oldText)}" with "${escapeNewLine(this.newText)}")`;
  }
  static _writeStringSize(str) {
    return 4 + 2 * str.length;
  }
  static _writeString(b, str, offset) {
    const len = str.length;
    buffer.writeUInt32BE(b, len, offset);
    offset += 4;
    for (let i = 0; i < len; i++) {
      buffer.writeUInt16LE(b, str.charCodeAt(i), offset);
      offset += 2;
    }
    return offset;
  }
  static _readString(b, offset) {
    const len = buffer.readUInt32BE(b, offset);
    offset += 4;
    return decodeUTF16LE(b, offset, len);
  }
  writeSize() {
    return 4 + 4 + TextChange._writeStringSize(this.oldText) + TextChange._writeStringSize(this.newText);
  }
  write(b, offset) {
    buffer.writeUInt32BE(b, this.oldPosition, offset);
    offset += 4;
    buffer.writeUInt32BE(b, this.newPosition, offset);
    offset += 4;
    offset = TextChange._writeString(b, this.oldText, offset);
    offset = TextChange._writeString(b, this.newText, offset);
    return offset;
  }
  static read(b, offset, dest) {
    const oldPosition = buffer.readUInt32BE(b, offset);
    offset += 4;
    const newPosition = buffer.readUInt32BE(b, offset);
    offset += 4;
    const oldText = TextChange._readString(b, offset);
    offset += TextChange._writeStringSize(oldText);
    const newText = TextChange._readString(b, offset);
    offset += TextChange._writeStringSize(newText);
    dest.push(new TextChange(oldPosition, oldText, newPosition, newText));
    return offset;
  }
}
function compressConsecutiveTextChanges(prevEdits, currEdits) {
  if (prevEdits === null || prevEdits.length === 0) {
    return currEdits;
  }
  const compressor = new TextChangeCompressor(prevEdits, currEdits);
  return compressor.compress();
}
class TextChangeCompressor {
  constructor(prevEdits, currEdits) {
    this._prevEdits = prevEdits;
    this._currEdits = currEdits;
    this._result = [];
    this._resultLen = 0;
    this._prevLen = this._prevEdits.length;
    this._prevDeltaOffset = 0;
    this._currLen = this._currEdits.length;
    this._currDeltaOffset = 0;
  }
  compress() {
    let prevIndex = 0;
    let currIndex = 0;
    let prevEdit = this._getPrev(prevIndex);
    let currEdit = this._getCurr(currIndex);
    while (prevIndex < this._prevLen || currIndex < this._currLen) {
      if (prevEdit === null) {
        this._acceptCurr(currEdit);
        currEdit = this._getCurr(++currIndex);
        continue;
      }
      if (currEdit === null) {
        this._acceptPrev(prevEdit);
        prevEdit = this._getPrev(++prevIndex);
        continue;
      }
      if (currEdit.oldEnd <= prevEdit.newPosition) {
        this._acceptCurr(currEdit);
        currEdit = this._getCurr(++currIndex);
        continue;
      }
      if (prevEdit.newEnd <= currEdit.oldPosition) {
        this._acceptPrev(prevEdit);
        prevEdit = this._getPrev(++prevIndex);
        continue;
      }
      if (currEdit.oldPosition < prevEdit.newPosition) {
        const [e1, e2] = TextChangeCompressor._splitCurr(currEdit, prevEdit.newPosition - currEdit.oldPosition);
        this._acceptCurr(e1);
        currEdit = e2;
        continue;
      }
      if (prevEdit.newPosition < currEdit.oldPosition) {
        const [e1, e2] = TextChangeCompressor._splitPrev(prevEdit, currEdit.oldPosition - prevEdit.newPosition);
        this._acceptPrev(e1);
        prevEdit = e2;
        continue;
      }
      let mergePrev;
      let mergeCurr;
      if (currEdit.oldEnd === prevEdit.newEnd) {
        mergePrev = prevEdit;
        mergeCurr = currEdit;
        prevEdit = this._getPrev(++prevIndex);
        currEdit = this._getCurr(++currIndex);
      } else if (currEdit.oldEnd < prevEdit.newEnd) {
        const [e1, e2] = TextChangeCompressor._splitPrev(prevEdit, currEdit.oldLength);
        mergePrev = e1;
        mergeCurr = currEdit;
        prevEdit = e2;
        currEdit = this._getCurr(++currIndex);
      } else {
        const [e1, e2] = TextChangeCompressor._splitCurr(currEdit, prevEdit.newLength);
        mergePrev = prevEdit;
        mergeCurr = e1;
        prevEdit = this._getPrev(++prevIndex);
        currEdit = e2;
      }
      this._result[this._resultLen++] = new TextChange(
        mergePrev.oldPosition,
        mergePrev.oldText,
        mergeCurr.newPosition,
        mergeCurr.newText
      );
      this._prevDeltaOffset += mergePrev.newLength - mergePrev.oldLength;
      this._currDeltaOffset += mergeCurr.newLength - mergeCurr.oldLength;
    }
    const merged = TextChangeCompressor._merge(this._result);
    const cleaned = TextChangeCompressor._removeNoOps(merged);
    return cleaned;
  }
  _acceptCurr(currEdit) {
    this._result[this._resultLen++] = TextChangeCompressor._rebaseCurr(this._prevDeltaOffset, currEdit);
    this._currDeltaOffset += currEdit.newLength - currEdit.oldLength;
  }
  _getCurr(currIndex) {
    return currIndex < this._currLen ? this._currEdits[currIndex] : null;
  }
  _acceptPrev(prevEdit) {
    this._result[this._resultLen++] = TextChangeCompressor._rebasePrev(this._currDeltaOffset, prevEdit);
    this._prevDeltaOffset += prevEdit.newLength - prevEdit.oldLength;
  }
  _getPrev(prevIndex) {
    return prevIndex < this._prevLen ? this._prevEdits[prevIndex] : null;
  }
  static _rebaseCurr(prevDeltaOffset, currEdit) {
    return new TextChange(
      currEdit.oldPosition - prevDeltaOffset,
      currEdit.oldText,
      currEdit.newPosition,
      currEdit.newText
    );
  }
  static _rebasePrev(currDeltaOffset, prevEdit) {
    return new TextChange(
      prevEdit.oldPosition,
      prevEdit.oldText,
      prevEdit.newPosition + currDeltaOffset,
      prevEdit.newText
    );
  }
  static _splitPrev(edit, offset) {
    const preText = edit.newText.substr(0, offset);
    const postText = edit.newText.substr(offset);
    return [
      new TextChange(
        edit.oldPosition,
        edit.oldText,
        edit.newPosition,
        preText
      ),
      new TextChange(
        edit.oldEnd,
        "",
        edit.newPosition + offset,
        postText
      )
    ];
  }
  static _splitCurr(edit, offset) {
    const preText = edit.oldText.substr(0, offset);
    const postText = edit.oldText.substr(offset);
    return [
      new TextChange(
        edit.oldPosition,
        preText,
        edit.newPosition,
        edit.newText
      ),
      new TextChange(
        edit.oldPosition + offset,
        postText,
        edit.newEnd,
        ""
      )
    ];
  }
  static _merge(edits) {
    if (edits.length === 0) {
      return edits;
    }
    const result = [];
    let resultLen = 0;
    let prev = edits[0];
    for (let i = 1; i < edits.length; i++) {
      const curr = edits[i];
      if (prev.oldEnd === curr.oldPosition) {
        prev = new TextChange(
          prev.oldPosition,
          prev.oldText + curr.oldText,
          prev.newPosition,
          prev.newText + curr.newText
        );
      } else {
        result[resultLen++] = prev;
        prev = curr;
      }
    }
    result[resultLen++] = prev;
    return result;
  }
  static _removeNoOps(edits) {
    if (edits.length === 0) {
      return edits;
    }
    const result = [];
    let resultLen = 0;
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (edit.oldText === edit.newText) {
        continue;
      }
      result[resultLen++] = edit;
    }
    return result;
  }
}
export {
  TextChange,
  compressConsecutiveTextChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29yZVxcdGV4dENoYW5nZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGJ1ZmZlciBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZGVjb2RlVVRGMTZMRSB9IGZyb20gJy4vc3RyaW5nQnVpbGRlci5qcyc7XG5cbmZ1bmN0aW9uIGVzY2FwZU5ld0xpbmUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gKFxuXHRcdHN0clxuXHRcdFx0LnJlcGxhY2UoL1xcbi9nLCAnXFxcXG4nKVxuXHRcdFx0LnJlcGxhY2UoL1xcci9nLCAnXFxcXHInKVxuXHQpO1xufVxuXG5leHBvcnQgY2xhc3MgVGV4dENoYW5nZSB7XG5cblx0cHVibGljIGdldCBvbGRMZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vbGRUZXh0Lmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb2xkRW5kKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub2xkUG9zaXRpb24gKyB0aGlzLm9sZFRleHQubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldCBuZXdMZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5uZXdUZXh0Lmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbmV3RW5kKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubmV3UG9zaXRpb24gKyB0aGlzLm5ld1RleHQubGVuZ3RoO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG9sZFBvc2l0aW9uOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IG9sZFRleHQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmV3UG9zaXRpb246IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmV3VGV4dDogc3RyaW5nXG5cdCkgeyB9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMub2xkVGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBgKGluc2VydEAke3RoaXMub2xkUG9zaXRpb259IFwiJHtlc2NhcGVOZXdMaW5lKHRoaXMubmV3VGV4dCl9XCIpYDtcblx0XHR9XG5cdFx0aWYgKHRoaXMubmV3VGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBgKGRlbGV0ZUAke3RoaXMub2xkUG9zaXRpb259IFwiJHtlc2NhcGVOZXdMaW5lKHRoaXMub2xkVGV4dCl9XCIpYDtcblx0XHR9XG5cdFx0cmV0dXJuIGAocmVwbGFjZUAke3RoaXMub2xkUG9zaXRpb259IFwiJHtlc2NhcGVOZXdMaW5lKHRoaXMub2xkVGV4dCl9XCIgd2l0aCBcIiR7ZXNjYXBlTmV3TGluZSh0aGlzLm5ld1RleHQpfVwiKWA7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfd3JpdGVTdHJpbmdTaXplKHN0cjogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0NCArIDIgKiBzdHIubGVuZ3RoXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF93cml0ZVN0cmluZyhiOiBVaW50OEFycmF5LCBzdHI6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxlbiA9IHN0ci5sZW5ndGg7XG5cdFx0YnVmZmVyLndyaXRlVUludDMyQkUoYiwgbGVuLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRidWZmZXIud3JpdGVVSW50MTZMRShiLCBzdHIuY2hhckNvZGVBdChpKSwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDI7XG5cdFx0fVxuXHRcdHJldHVybiBvZmZzZXQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVhZFN0cmluZyhiOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGVuID0gYnVmZmVyLnJlYWRVSW50MzJCRShiLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRyZXR1cm4gZGVjb2RlVVRGMTZMRShiLCBvZmZzZXQsIGxlbik7XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVTaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIChcblx0XHRcdCsgNCAvLyBvbGRQb3NpdGlvblxuXHRcdFx0KyA0IC8vIG5ld1Bvc2l0aW9uXG5cdFx0XHQrIFRleHRDaGFuZ2UuX3dyaXRlU3RyaW5nU2l6ZSh0aGlzLm9sZFRleHQpXG5cdFx0XHQrIFRleHRDaGFuZ2UuX3dyaXRlU3RyaW5nU2l6ZSh0aGlzLm5ld1RleHQpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB3cml0ZShiOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0YnVmZmVyLndyaXRlVUludDMyQkUoYiwgdGhpcy5vbGRQb3NpdGlvbiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0YnVmZmVyLndyaXRlVUludDMyQkUoYiwgdGhpcy5uZXdQb3NpdGlvbiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0b2Zmc2V0ID0gVGV4dENoYW5nZS5fd3JpdGVTdHJpbmcoYiwgdGhpcy5vbGRUZXh0LCBvZmZzZXQpO1xuXHRcdG9mZnNldCA9IFRleHRDaGFuZ2UuX3dyaXRlU3RyaW5nKGIsIHRoaXMubmV3VGV4dCwgb2Zmc2V0KTtcblx0XHRyZXR1cm4gb2Zmc2V0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyByZWFkKGI6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCBkZXN0OiBUZXh0Q2hhbmdlW10pOiBudW1iZXIge1xuXHRcdGNvbnN0IG9sZFBvc2l0aW9uID0gYnVmZmVyLnJlYWRVSW50MzJCRShiLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRjb25zdCBuZXdQb3NpdGlvbiA9IGJ1ZmZlci5yZWFkVUludDMyQkUoYiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IDQ7XG5cdFx0Y29uc3Qgb2xkVGV4dCA9IFRleHRDaGFuZ2UuX3JlYWRTdHJpbmcoYiwgb2Zmc2V0KTsgb2Zmc2V0ICs9IFRleHRDaGFuZ2UuX3dyaXRlU3RyaW5nU2l6ZShvbGRUZXh0KTtcblx0XHRjb25zdCBuZXdUZXh0ID0gVGV4dENoYW5nZS5fcmVhZFN0cmluZyhiLCBvZmZzZXQpOyBvZmZzZXQgKz0gVGV4dENoYW5nZS5fd3JpdGVTdHJpbmdTaXplKG5ld1RleHQpO1xuXHRcdGRlc3QucHVzaChuZXcgVGV4dENoYW5nZShvbGRQb3NpdGlvbiwgb2xkVGV4dCwgbmV3UG9zaXRpb24sIG5ld1RleHQpKTtcblx0XHRyZXR1cm4gb2Zmc2V0O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wcmVzc0NvbnNlY3V0aXZlVGV4dENoYW5nZXMocHJldkVkaXRzOiBUZXh0Q2hhbmdlW10gfCBudWxsLCBjdXJyRWRpdHM6IFRleHRDaGFuZ2VbXSk6IFRleHRDaGFuZ2VbXSB7XG5cdGlmIChwcmV2RWRpdHMgPT09IG51bGwgfHwgcHJldkVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBjdXJyRWRpdHM7XG5cdH1cblx0Y29uc3QgY29tcHJlc3NvciA9IG5ldyBUZXh0Q2hhbmdlQ29tcHJlc3NvcihwcmV2RWRpdHMsIGN1cnJFZGl0cyk7XG5cdHJldHVybiBjb21wcmVzc29yLmNvbXByZXNzKCk7XG59XG5cbmNsYXNzIFRleHRDaGFuZ2VDb21wcmVzc29yIHtcblxuXHRwcml2YXRlIF9wcmV2RWRpdHM6IFRleHRDaGFuZ2VbXTtcblx0cHJpdmF0ZSBfY3VyckVkaXRzOiBUZXh0Q2hhbmdlW107XG5cblx0cHJpdmF0ZSBfcmVzdWx0OiBUZXh0Q2hhbmdlW107XG5cdHByaXZhdGUgX3Jlc3VsdExlbjogbnVtYmVyO1xuXG5cdHByaXZhdGUgX3ByZXZMZW46IG51bWJlcjtcblx0cHJpdmF0ZSBfcHJldkRlbHRhT2Zmc2V0OiBudW1iZXI7XG5cblx0cHJpdmF0ZSBfY3VyckxlbjogbnVtYmVyO1xuXHRwcml2YXRlIF9jdXJyRGVsdGFPZmZzZXQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihwcmV2RWRpdHM6IFRleHRDaGFuZ2VbXSwgY3VyckVkaXRzOiBUZXh0Q2hhbmdlW10pIHtcblx0XHR0aGlzLl9wcmV2RWRpdHMgPSBwcmV2RWRpdHM7XG5cdFx0dGhpcy5fY3VyckVkaXRzID0gY3VyckVkaXRzO1xuXG5cdFx0dGhpcy5fcmVzdWx0ID0gW107XG5cdFx0dGhpcy5fcmVzdWx0TGVuID0gMDtcblxuXHRcdHRoaXMuX3ByZXZMZW4gPSB0aGlzLl9wcmV2RWRpdHMubGVuZ3RoO1xuXHRcdHRoaXMuX3ByZXZEZWx0YU9mZnNldCA9IDA7XG5cblx0XHR0aGlzLl9jdXJyTGVuID0gdGhpcy5fY3VyckVkaXRzLmxlbmd0aDtcblx0XHR0aGlzLl9jdXJyRGVsdGFPZmZzZXQgPSAwO1xuXHR9XG5cblx0cHVibGljIGNvbXByZXNzKCk6IFRleHRDaGFuZ2VbXSB7XG5cdFx0bGV0IHByZXZJbmRleCA9IDA7XG5cdFx0bGV0IGN1cnJJbmRleCA9IDA7XG5cblx0XHRsZXQgcHJldkVkaXQgPSB0aGlzLl9nZXRQcmV2KHByZXZJbmRleCk7XG5cdFx0bGV0IGN1cnJFZGl0ID0gdGhpcy5fZ2V0Q3VycihjdXJySW5kZXgpO1xuXG5cdFx0d2hpbGUgKHByZXZJbmRleCA8IHRoaXMuX3ByZXZMZW4gfHwgY3VyckluZGV4IDwgdGhpcy5fY3Vyckxlbikge1xuXG5cdFx0XHRpZiAocHJldkVkaXQgPT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5fYWNjZXB0Q3VycihjdXJyRWRpdCEpO1xuXHRcdFx0XHRjdXJyRWRpdCA9IHRoaXMuX2dldEN1cnIoKytjdXJySW5kZXgpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1cnJFZGl0ID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuX2FjY2VwdFByZXYocHJldkVkaXQpO1xuXHRcdFx0XHRwcmV2RWRpdCA9IHRoaXMuX2dldFByZXYoKytwcmV2SW5kZXgpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1cnJFZGl0Lm9sZEVuZCA8PSBwcmV2RWRpdC5uZXdQb3NpdGlvbikge1xuXHRcdFx0XHR0aGlzLl9hY2NlcHRDdXJyKGN1cnJFZGl0KTtcblx0XHRcdFx0Y3VyckVkaXQgPSB0aGlzLl9nZXRDdXJyKCsrY3VyckluZGV4KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmV2RWRpdC5uZXdFbmQgPD0gY3VyckVkaXQub2xkUG9zaXRpb24pIHtcblx0XHRcdFx0dGhpcy5fYWNjZXB0UHJldihwcmV2RWRpdCk7XG5cdFx0XHRcdHByZXZFZGl0ID0gdGhpcy5fZ2V0UHJldigrK3ByZXZJbmRleCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VyckVkaXQub2xkUG9zaXRpb24gPCBwcmV2RWRpdC5uZXdQb3NpdGlvbikge1xuXHRcdFx0XHRjb25zdCBbZTEsIGUyXSA9IFRleHRDaGFuZ2VDb21wcmVzc29yLl9zcGxpdEN1cnIoY3VyckVkaXQsIHByZXZFZGl0Lm5ld1Bvc2l0aW9uIC0gY3VyckVkaXQub2xkUG9zaXRpb24pO1xuXHRcdFx0XHR0aGlzLl9hY2NlcHRDdXJyKGUxKTtcblx0XHRcdFx0Y3VyckVkaXQgPSBlMjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmV2RWRpdC5uZXdQb3NpdGlvbiA8IGN1cnJFZGl0Lm9sZFBvc2l0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IFtlMSwgZTJdID0gVGV4dENoYW5nZUNvbXByZXNzb3IuX3NwbGl0UHJldihwcmV2RWRpdCwgY3VyckVkaXQub2xkUG9zaXRpb24gLSBwcmV2RWRpdC5uZXdQb3NpdGlvbik7XG5cdFx0XHRcdHRoaXMuX2FjY2VwdFByZXYoZTEpO1xuXHRcdFx0XHRwcmV2RWRpdCA9IGUyO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCwgY3VyckVkaXQub2xkUG9zaXRpb24gPT09IHByZXZFZGl0Lm5ld1Bvc2l0aW9uXG5cblx0XHRcdGxldCBtZXJnZVByZXY6IFRleHRDaGFuZ2U7XG5cdFx0XHRsZXQgbWVyZ2VDdXJyOiBUZXh0Q2hhbmdlO1xuXG5cdFx0XHRpZiAoY3VyckVkaXQub2xkRW5kID09PSBwcmV2RWRpdC5uZXdFbmQpIHtcblx0XHRcdFx0bWVyZ2VQcmV2ID0gcHJldkVkaXQ7XG5cdFx0XHRcdG1lcmdlQ3VyciA9IGN1cnJFZGl0O1xuXHRcdFx0XHRwcmV2RWRpdCA9IHRoaXMuX2dldFByZXYoKytwcmV2SW5kZXgpO1xuXHRcdFx0XHRjdXJyRWRpdCA9IHRoaXMuX2dldEN1cnIoKytjdXJySW5kZXgpO1xuXHRcdFx0fSBlbHNlIGlmIChjdXJyRWRpdC5vbGRFbmQgPCBwcmV2RWRpdC5uZXdFbmQpIHtcblx0XHRcdFx0Y29uc3QgW2UxLCBlMl0gPSBUZXh0Q2hhbmdlQ29tcHJlc3Nvci5fc3BsaXRQcmV2KHByZXZFZGl0LCBjdXJyRWRpdC5vbGRMZW5ndGgpO1xuXHRcdFx0XHRtZXJnZVByZXYgPSBlMTtcblx0XHRcdFx0bWVyZ2VDdXJyID0gY3VyckVkaXQ7XG5cdFx0XHRcdHByZXZFZGl0ID0gZTI7XG5cdFx0XHRcdGN1cnJFZGl0ID0gdGhpcy5fZ2V0Q3VycigrK2N1cnJJbmRleCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBbZTEsIGUyXSA9IFRleHRDaGFuZ2VDb21wcmVzc29yLl9zcGxpdEN1cnIoY3VyckVkaXQsIHByZXZFZGl0Lm5ld0xlbmd0aCk7XG5cdFx0XHRcdG1lcmdlUHJldiA9IHByZXZFZGl0O1xuXHRcdFx0XHRtZXJnZUN1cnIgPSBlMTtcblx0XHRcdFx0cHJldkVkaXQgPSB0aGlzLl9nZXRQcmV2KCsrcHJldkluZGV4KTtcblx0XHRcdFx0Y3VyckVkaXQgPSBlMjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcmVzdWx0W3RoaXMuX3Jlc3VsdExlbisrXSA9IG5ldyBUZXh0Q2hhbmdlKFxuXHRcdFx0XHRtZXJnZVByZXYub2xkUG9zaXRpb24sXG5cdFx0XHRcdG1lcmdlUHJldi5vbGRUZXh0LFxuXHRcdFx0XHRtZXJnZUN1cnIubmV3UG9zaXRpb24sXG5cdFx0XHRcdG1lcmdlQ3Vyci5uZXdUZXh0XG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fcHJldkRlbHRhT2Zmc2V0ICs9IG1lcmdlUHJldi5uZXdMZW5ndGggLSBtZXJnZVByZXYub2xkTGVuZ3RoO1xuXHRcdFx0dGhpcy5fY3VyckRlbHRhT2Zmc2V0ICs9IG1lcmdlQ3Vyci5uZXdMZW5ndGggLSBtZXJnZUN1cnIub2xkTGVuZ3RoO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lcmdlZCA9IFRleHRDaGFuZ2VDb21wcmVzc29yLl9tZXJnZSh0aGlzLl9yZXN1bHQpO1xuXHRcdGNvbnN0IGNsZWFuZWQgPSBUZXh0Q2hhbmdlQ29tcHJlc3Nvci5fcmVtb3ZlTm9PcHMobWVyZ2VkKTtcblx0XHRyZXR1cm4gY2xlYW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2FjY2VwdEN1cnIoY3VyckVkaXQ6IFRleHRDaGFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXN1bHRbdGhpcy5fcmVzdWx0TGVuKytdID0gVGV4dENoYW5nZUNvbXByZXNzb3IuX3JlYmFzZUN1cnIodGhpcy5fcHJldkRlbHRhT2Zmc2V0LCBjdXJyRWRpdCk7XG5cdFx0dGhpcy5fY3VyckRlbHRhT2Zmc2V0ICs9IGN1cnJFZGl0Lm5ld0xlbmd0aCAtIGN1cnJFZGl0Lm9sZExlbmd0aDtcblx0fVxuXG5cdHByaXZhdGUgX2dldEN1cnIoY3VyckluZGV4OiBudW1iZXIpOiBUZXh0Q2hhbmdlIHwgbnVsbCB7XG5cdFx0cmV0dXJuIChjdXJySW5kZXggPCB0aGlzLl9jdXJyTGVuID8gdGhpcy5fY3VyckVkaXRzW2N1cnJJbmRleF0gOiBudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgX2FjY2VwdFByZXYocHJldkVkaXQ6IFRleHRDaGFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXN1bHRbdGhpcy5fcmVzdWx0TGVuKytdID0gVGV4dENoYW5nZUNvbXByZXNzb3IuX3JlYmFzZVByZXYodGhpcy5fY3VyckRlbHRhT2Zmc2V0LCBwcmV2RWRpdCk7XG5cdFx0dGhpcy5fcHJldkRlbHRhT2Zmc2V0ICs9IHByZXZFZGl0Lm5ld0xlbmd0aCAtIHByZXZFZGl0Lm9sZExlbmd0aDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFByZXYocHJldkluZGV4OiBudW1iZXIpOiBUZXh0Q2hhbmdlIHwgbnVsbCB7XG5cdFx0cmV0dXJuIChwcmV2SW5kZXggPCB0aGlzLl9wcmV2TGVuID8gdGhpcy5fcHJldkVkaXRzW3ByZXZJbmRleF0gOiBudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZWJhc2VDdXJyKHByZXZEZWx0YU9mZnNldDogbnVtYmVyLCBjdXJyRWRpdDogVGV4dENoYW5nZSk6IFRleHRDaGFuZ2Uge1xuXHRcdHJldHVybiBuZXcgVGV4dENoYW5nZShcblx0XHRcdGN1cnJFZGl0Lm9sZFBvc2l0aW9uIC0gcHJldkRlbHRhT2Zmc2V0LFxuXHRcdFx0Y3VyckVkaXQub2xkVGV4dCxcblx0XHRcdGN1cnJFZGl0Lm5ld1Bvc2l0aW9uLFxuXHRcdFx0Y3VyckVkaXQubmV3VGV4dFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmViYXNlUHJldihjdXJyRGVsdGFPZmZzZXQ6IG51bWJlciwgcHJldkVkaXQ6IFRleHRDaGFuZ2UpOiBUZXh0Q2hhbmdlIHtcblx0XHRyZXR1cm4gbmV3IFRleHRDaGFuZ2UoXG5cdFx0XHRwcmV2RWRpdC5vbGRQb3NpdGlvbixcblx0XHRcdHByZXZFZGl0Lm9sZFRleHQsXG5cdFx0XHRwcmV2RWRpdC5uZXdQb3NpdGlvbiArIGN1cnJEZWx0YU9mZnNldCxcblx0XHRcdHByZXZFZGl0Lm5ld1RleHRcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NwbGl0UHJldihlZGl0OiBUZXh0Q2hhbmdlLCBvZmZzZXQ6IG51bWJlcik6IFtUZXh0Q2hhbmdlLCBUZXh0Q2hhbmdlXSB7XG5cdFx0Y29uc3QgcHJlVGV4dCA9IGVkaXQubmV3VGV4dC5zdWJzdHIoMCwgb2Zmc2V0KTtcblx0XHRjb25zdCBwb3N0VGV4dCA9IGVkaXQubmV3VGV4dC5zdWJzdHIob2Zmc2V0KTtcblxuXHRcdHJldHVybiBbXG5cdFx0XHRuZXcgVGV4dENoYW5nZShcblx0XHRcdFx0ZWRpdC5vbGRQb3NpdGlvbixcblx0XHRcdFx0ZWRpdC5vbGRUZXh0LFxuXHRcdFx0XHRlZGl0Lm5ld1Bvc2l0aW9uLFxuXHRcdFx0XHRwcmVUZXh0XG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRleHRDaGFuZ2UoXG5cdFx0XHRcdGVkaXQub2xkRW5kLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0ZWRpdC5uZXdQb3NpdGlvbiArIG9mZnNldCxcblx0XHRcdFx0cG9zdFRleHRcblx0XHRcdClcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NwbGl0Q3VycihlZGl0OiBUZXh0Q2hhbmdlLCBvZmZzZXQ6IG51bWJlcik6IFtUZXh0Q2hhbmdlLCBUZXh0Q2hhbmdlXSB7XG5cdFx0Y29uc3QgcHJlVGV4dCA9IGVkaXQub2xkVGV4dC5zdWJzdHIoMCwgb2Zmc2V0KTtcblx0XHRjb25zdCBwb3N0VGV4dCA9IGVkaXQub2xkVGV4dC5zdWJzdHIob2Zmc2V0KTtcblxuXHRcdHJldHVybiBbXG5cdFx0XHRuZXcgVGV4dENoYW5nZShcblx0XHRcdFx0ZWRpdC5vbGRQb3NpdGlvbixcblx0XHRcdFx0cHJlVGV4dCxcblx0XHRcdFx0ZWRpdC5uZXdQb3NpdGlvbixcblx0XHRcdFx0ZWRpdC5uZXdUZXh0XG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRleHRDaGFuZ2UoXG5cdFx0XHRcdGVkaXQub2xkUG9zaXRpb24gKyBvZmZzZXQsXG5cdFx0XHRcdHBvc3RUZXh0LFxuXHRcdFx0XHRlZGl0Lm5ld0VuZCxcblx0XHRcdFx0Jydcblx0XHRcdClcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21lcmdlKGVkaXRzOiBUZXh0Q2hhbmdlW10pOiBUZXh0Q2hhbmdlW10ge1xuXHRcdGlmIChlZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBlZGl0cztcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IFRleHRDaGFuZ2VbXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXG5cdFx0bGV0IHByZXYgPSBlZGl0c1swXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGVkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJyID0gZWRpdHNbaV07XG5cblx0XHRcdGlmIChwcmV2Lm9sZEVuZCA9PT0gY3Vyci5vbGRQb3NpdGlvbikge1xuXHRcdFx0XHQvLyBNZXJnZSBpbnRvIGBwcmV2YFxuXHRcdFx0XHRwcmV2ID0gbmV3IFRleHRDaGFuZ2UoXG5cdFx0XHRcdFx0cHJldi5vbGRQb3NpdGlvbixcblx0XHRcdFx0XHRwcmV2Lm9sZFRleHQgKyBjdXJyLm9sZFRleHQsXG5cdFx0XHRcdFx0cHJldi5uZXdQb3NpdGlvbixcblx0XHRcdFx0XHRwcmV2Lm5ld1RleHQgKyBjdXJyLm5ld1RleHRcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBwcmV2O1xuXHRcdFx0XHRwcmV2ID0gY3Vycjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IHByZXY7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlbW92ZU5vT3BzKGVkaXRzOiBUZXh0Q2hhbmdlW10pOiBUZXh0Q2hhbmdlW10ge1xuXHRcdGlmIChlZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBlZGl0cztcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IFRleHRDaGFuZ2VbXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlZGl0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZWRpdCA9IGVkaXRzW2ldO1xuXG5cdFx0XHRpZiAoZWRpdC5vbGRUZXh0ID09PSBlZGl0Lm5ld1RleHQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gZWRpdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxjQUFjLEtBQXFCO0FBQzNDLFNBQ0MsSUFDRSxRQUFRLE9BQU8sS0FBSyxFQUNwQixRQUFRLE9BQU8sS0FBSztBQUV4QjtBQUVPLE1BQU0sV0FBVztBQUFBLEVBa0J2QixZQUNpQixhQUNBLFNBQ0EsYUFDQSxTQUNmO0FBSmU7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUNiO0FBQUEsRUFyQkosSUFBVyxZQUFvQjtBQUM5QixXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxJQUFX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
