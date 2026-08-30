import { numberComparator } from "../../../../base/common/arrays.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { StringEdit, StringReplacement } from "../../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { PositionOffsetTransformer } from "../../../common/core/text/positionToOffset.js";
import { Range } from "../../../common/core/range.js";
import { TextReplacement, TextEdit } from "../../../common/core/edits/textEdit.js";
const _Random = class _Random {
  static create(seed) {
    return new MersenneTwister(seed);
  }
  stringGenerator(alphabet) {
    return {
      next: () => {
        const characterIndex = this.nextIntRange(0, alphabet.length);
        return alphabet.charAt(characterIndex);
      }
    };
  }
  nextString(length, alphabet = this.stringGenerator(_Random.basicAlphabet)) {
    let randomText = "";
    for (let i = 0; i < length; i++) {
      randomText += alphabet.next();
    }
    return randomText;
  }
  nextMultiLineString(lineCount, lineLengthRange, alphabet = this.stringGenerator(_Random.basicAlphabet)) {
    const lines = [];
    for (let i = 0; i < lineCount; i++) {
      const lineLength = this.nextIntRange(lineLengthRange.start, lineLengthRange.endExclusive);
      lines.push(this.nextString(lineLength, alphabet));
    }
    return lines.join("\n");
  }
  nextConsecutiveOffsets(range, count) {
    const offsets = OffsetRange.ofLength(count).map(() => this.nextIntRange(range.start, range.endExclusive));
    offsets.sort(numberComparator);
    return offsets;
  }
  nextConsecutivePositions(source, count) {
    const t = new PositionOffsetTransformer(source.getValue());
    const offsets = this.nextConsecutiveOffsets(new OffsetRange(0, t.text.length), count);
    return offsets.map((offset) => t.getPosition(offset));
  }
  nextRange(source) {
    const [start, end] = this.nextConsecutivePositions(source, 2);
    return Range.fromPositions(start, end);
  }
  nextTextEdit(target, singleTextEditCount) {
    const singleTextEdits = [];
    const positions = this.nextConsecutivePositions(target, singleTextEditCount * 2);
    for (let i = 0; i < singleTextEditCount; i++) {
      const start = positions[i * 2];
      const end = positions[i * 2 + 1];
      const newText = this.nextString(end.column - start.column, this.stringGenerator(_Random.basicAlphabetMultiline));
      singleTextEdits.push(new TextReplacement(Range.fromPositions(start, end), newText));
    }
    return new TextEdit(singleTextEdits).normalize();
  }
  nextStringEdit(target, singleTextEditCount, newTextAlphabet = _Random.basicAlphabetMultiline) {
    const singleTextEdits = [];
    const positions = this.nextConsecutiveOffsets(new OffsetRange(0, target.length), singleTextEditCount * 2);
    for (let i = 0; i < singleTextEditCount; i++) {
      const start = positions[i * 2];
      const end = positions[i * 2 + 1];
      const range = new OffsetRange(start, end);
      const newTextLen = this.nextIntRange(range.isEmpty ? 1 : 0, 10);
      const newText = this.nextString(newTextLen, this.stringGenerator(newTextAlphabet));
      singleTextEdits.push(new StringReplacement(range, newText));
    }
    return new StringEdit(singleTextEdits).normalize();
  }
  nextSingleStringEdit(target, newTextAlphabet = _Random.basicAlphabetMultiline) {
    const edit = this.nextStringEdit(target, 1, newTextAlphabet);
    return edit.replacements[0];
  }
  /**
   * Fills the given array with random data.
  */
  nextRandomValues(data) {
    for (let i = 0; i < data.length; i++) {
      data[i] = this.nextIntRange(0, 256);
    }
  }
  nextUuid() {
    if (!this._data) {
      this._data = new Uint8Array(16);
    }
    if (!this._hex) {
      this._hex = [];
      for (let i2 = 0; i2 < 256; i2++) {
        this._hex.push(i2.toString(16).padStart(2, "0"));
      }
    }
    this.nextRandomValues(this._data);
    this._data[6] = this._data[6] & 15 | 64;
    this._data[8] = this._data[8] & 63 | 128;
    let i = 0;
    let result = "";
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += "-";
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += "-";
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += "-";
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += "-";
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    result += this._hex[this._data[i++]];
    return result;
  }
};
_Random.alphabetSmallLowercase = "abcdefgh";
_Random.alphabetSmallUppercase = "ABCDEFGH";
_Random.alphabetLowercase = "abcdefghijklmnopqrstuvwxyz";
_Random.alphabetUppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
_Random.basicAlphabet = "      abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
_Random.basicAlphabetMultiline = "      \n\n\nabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
let Random = _Random;
function sequenceGenerator(sequence) {
  let index = 0;
  return {
    next: () => {
      if (index >= sequence.length) {
        throw new BugIndicatingError("End of sequence");
      }
      const element = sequence[index];
      index++;
      return element;
    }
  };
}
class MersenneTwister extends Random {
  constructor(seed) {
    super();
    this.mt = new Array(624);
    this.index = 0;
    this.mt[0] = seed >>> 0;
    for (let i = 1; i < 624; i++) {
      const s = this.mt[i - 1] ^ this.mt[i - 1] >>> 30;
      this.mt[i] = (((s & 4294901760) >>> 16) * 1812433253 << 16) + (s & 65535) * 1812433253 + i >>> 0;
    }
  }
  _nextInt() {
    if (this.index === 0) {
      this.generateNumbers();
    }
    let y = this.mt[this.index];
    y = y ^ y >>> 11;
    y = y ^ y << 7 & 2636928640;
    y = y ^ y << 15 & 4022730752;
    y = y ^ y >>> 18;
    this.index = (this.index + 1) % 624;
    return y >>> 0;
  }
  nextIntRange(start, endExclusive) {
    const range = endExclusive - start;
    return Math.floor(this._nextInt() / (4294967296 / range)) + start;
  }
  generateNumbers() {
    for (let i = 0; i < 624; i++) {
      const y = (this.mt[i] & 2147483648) + (this.mt[(i + 1) % 624] & 2147483647);
      this.mt[i] = this.mt[(i + 397) % 624] ^ y >>> 1;
      if (y % 2 !== 0) {
        this.mt[i] = this.mt[i] ^ 2567483615;
      }
    }
  }
}
export {
  Random,
  sequenceGenerator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcY29yZVxccmFuZG9tLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbnVtYmVyQ29tcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgU3RyaW5nRWRpdCwgU3RyaW5nUmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy9zdHJpbmdFZGl0LmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3RleHQvcG9zaXRpb25Ub09mZnNldC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRleHRSZXBsYWNlbWVudCwgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBSYW5kb20ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGFscGhhYmV0U21hbGxMb3dlcmNhc2UgPSAnYWJjZGVmZ2gnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGFscGhhYmV0U21hbGxVcHBlcmNhc2UgPSAnQUJDREVGR0gnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGFscGhhYmV0TG93ZXJjYXNlID0gJ2FiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6Jztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBhbHBoYWJldFVwcGVyY2FzZSA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWic7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgYmFzaWNBbHBoYWJldDogc3RyaW5nID0gJyAgICAgIGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5Jztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBiYXNpY0FscGhhYmV0TXVsdGlsaW5lOiBzdHJpbmcgPSAnICAgICAgXFxuXFxuXFxuYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAxMjM0NTY3ODknO1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKHNlZWQ6IG51bWJlcik6IFJhbmRvbSB7XG5cdFx0cmV0dXJuIG5ldyBNZXJzZW5uZVR3aXN0ZXIoc2VlZCk7XG5cdH1cblxuXHRwdWJsaWMgc3RyaW5nR2VuZXJhdG9yKGFscGhhYmV0OiBzdHJpbmcpOiBJR2VuZXJhdG9yPHN0cmluZz4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuZXh0OiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYXJhY3RlckluZGV4ID0gdGhpcy5uZXh0SW50UmFuZ2UoMCwgYWxwaGFiZXQubGVuZ3RoKTtcblx0XHRcdFx0cmV0dXJuIGFscGhhYmV0LmNoYXJBdChjaGFyYWN0ZXJJbmRleCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBuZXh0SW50UmFuZ2Uoc3RhcnQ6IG51bWJlciwgZW5kRXhjbHVzaXZlOiBudW1iZXIpOiBudW1iZXI7XG5cblx0cHVibGljIG5leHRTdHJpbmcobGVuZ3RoOiBudW1iZXIsIGFscGhhYmV0ID0gdGhpcy5zdHJpbmdHZW5lcmF0b3IoUmFuZG9tLmJhc2ljQWxwaGFiZXQpKTogc3RyaW5nIHtcblx0XHRsZXQgcmFuZG9tVGV4dDogc3RyaW5nID0gJyc7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0cmFuZG9tVGV4dCArPSBhbHBoYWJldC5uZXh0KCk7XG5cdFx0fVxuXHRcdHJldHVybiByYW5kb21UZXh0O1xuXHR9XG5cblx0cHVibGljIG5leHRNdWx0aUxpbmVTdHJpbmcobGluZUNvdW50OiBudW1iZXIsIGxpbmVMZW5ndGhSYW5nZTogT2Zmc2V0UmFuZ2UsIGFscGhhYmV0ID0gdGhpcy5zdHJpbmdHZW5lcmF0b3IoUmFuZG9tLmJhc2ljQWxwaGFiZXQpKTogc3RyaW5nIHtcblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lTGVuZ3RoID0gdGhpcy5uZXh0SW50UmFuZ2UobGluZUxlbmd0aFJhbmdlLnN0YXJ0LCBsaW5lTGVuZ3RoUmFuZ2UuZW5kRXhjbHVzaXZlKTtcblx0XHRcdGxpbmVzLnB1c2godGhpcy5uZXh0U3RyaW5nKGxpbmVMZW5ndGgsIGFscGhhYmV0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBuZXh0Q29uc2VjdXRpdmVPZmZzZXRzKHJhbmdlOiBPZmZzZXRSYW5nZSwgY291bnQ6IG51bWJlcik6IG51bWJlcltdIHtcblx0XHRjb25zdCBvZmZzZXRzID0gT2Zmc2V0UmFuZ2Uub2ZMZW5ndGgoY291bnQpLm1hcCgoKSA9PiB0aGlzLm5leHRJbnRSYW5nZShyYW5nZS5zdGFydCwgcmFuZ2UuZW5kRXhjbHVzaXZlKSk7XG5cdFx0b2Zmc2V0cy5zb3J0KG51bWJlckNvbXBhcmF0b3IpO1xuXHRcdHJldHVybiBvZmZzZXRzO1xuXHR9XG5cblx0cHVibGljIG5leHRDb25zZWN1dGl2ZVBvc2l0aW9ucyhzb3VyY2U6IEFic3RyYWN0VGV4dCwgY291bnQ6IG51bWJlcik6IFBvc2l0aW9uW10ge1xuXHRcdGNvbnN0IHQgPSBuZXcgUG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lcihzb3VyY2UuZ2V0VmFsdWUoKSk7XG5cdFx0Y29uc3Qgb2Zmc2V0cyA9IHRoaXMubmV4dENvbnNlY3V0aXZlT2Zmc2V0cyhuZXcgT2Zmc2V0UmFuZ2UoMCwgdC50ZXh0Lmxlbmd0aCksIGNvdW50KTtcblx0XHRyZXR1cm4gb2Zmc2V0cy5tYXAob2Zmc2V0ID0+IHQuZ2V0UG9zaXRpb24ob2Zmc2V0KSk7XG5cdH1cblxuXHRwdWJsaWMgbmV4dFJhbmdlKHNvdXJjZTogQWJzdHJhY3RUZXh0KTogUmFuZ2Uge1xuXHRcdGNvbnN0IFtzdGFydCwgZW5kXSA9IHRoaXMubmV4dENvbnNlY3V0aXZlUG9zaXRpb25zKHNvdXJjZSwgMik7XG5cdFx0cmV0dXJuIFJhbmdlLmZyb21Qb3NpdGlvbnMoc3RhcnQsIGVuZCk7XG5cdH1cblxuXHRwdWJsaWMgbmV4dFRleHRFZGl0KHRhcmdldDogQWJzdHJhY3RUZXh0LCBzaW5nbGVUZXh0RWRpdENvdW50OiBudW1iZXIpOiBUZXh0RWRpdCB7XG5cdFx0Y29uc3Qgc2luZ2xlVGV4dEVkaXRzOiBUZXh0UmVwbGFjZW1lbnRbXSA9IFtdO1xuXG5cdFx0Y29uc3QgcG9zaXRpb25zID0gdGhpcy5uZXh0Q29uc2VjdXRpdmVQb3NpdGlvbnModGFyZ2V0LCBzaW5nbGVUZXh0RWRpdENvdW50ICogMik7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNpbmdsZVRleHRFZGl0Q291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBwb3NpdGlvbnNbaSAqIDJdO1xuXHRcdFx0Y29uc3QgZW5kID0gcG9zaXRpb25zW2kgKiAyICsgMV07XG5cdFx0XHRjb25zdCBuZXdUZXh0ID0gdGhpcy5uZXh0U3RyaW5nKGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW4sIHRoaXMuc3RyaW5nR2VuZXJhdG9yKFJhbmRvbS5iYXNpY0FscGhhYmV0TXVsdGlsaW5lKSk7XG5cdFx0XHRzaW5nbGVUZXh0RWRpdHMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KFJhbmdlLmZyb21Qb3NpdGlvbnMoc3RhcnQsIGVuZCksIG5ld1RleHQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KHNpbmdsZVRleHRFZGl0cykubm9ybWFsaXplKCk7XG5cdH1cblxuXHRwdWJsaWMgbmV4dFN0cmluZ0VkaXQodGFyZ2V0OiBzdHJpbmcsIHNpbmdsZVRleHRFZGl0Q291bnQ6IG51bWJlciwgbmV3VGV4dEFscGhhYmV0ID0gUmFuZG9tLmJhc2ljQWxwaGFiZXRNdWx0aWxpbmUpOiBTdHJpbmdFZGl0IHtcblx0XHRjb25zdCBzaW5nbGVUZXh0RWRpdHM6IFN0cmluZ1JlcGxhY2VtZW50W10gPSBbXTtcblxuXHRcdGNvbnN0IHBvc2l0aW9ucyA9IHRoaXMubmV4dENvbnNlY3V0aXZlT2Zmc2V0cyhuZXcgT2Zmc2V0UmFuZ2UoMCwgdGFyZ2V0Lmxlbmd0aCksIHNpbmdsZVRleHRFZGl0Q291bnQgKiAyKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2luZ2xlVGV4dEVkaXRDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IHBvc2l0aW9uc1tpICogMl07XG5cdFx0XHRjb25zdCBlbmQgPSBwb3NpdGlvbnNbaSAqIDIgKyAxXTtcblx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmQpO1xuXG5cdFx0XHRjb25zdCBuZXdUZXh0TGVuID0gdGhpcy5uZXh0SW50UmFuZ2UocmFuZ2UuaXNFbXB0eSA/IDEgOiAwLCAxMCk7XG5cdFx0XHRjb25zdCBuZXdUZXh0ID0gdGhpcy5uZXh0U3RyaW5nKG5ld1RleHRMZW4sIHRoaXMuc3RyaW5nR2VuZXJhdG9yKG5ld1RleHRBbHBoYWJldCkpO1xuXHRcdFx0c2luZ2xlVGV4dEVkaXRzLnB1c2gobmV3IFN0cmluZ1JlcGxhY2VtZW50KHJhbmdlLCBuZXdUZXh0KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KHNpbmdsZVRleHRFZGl0cykubm9ybWFsaXplKCk7XG5cdH1cblxuXHRwdWJsaWMgbmV4dFNpbmdsZVN0cmluZ0VkaXQodGFyZ2V0OiBzdHJpbmcsIG5ld1RleHRBbHBoYWJldCA9IFJhbmRvbS5iYXNpY0FscGhhYmV0TXVsdGlsaW5lKTogU3RyaW5nUmVwbGFjZW1lbnQge1xuXHRcdGNvbnN0IGVkaXQgPSB0aGlzLm5leHRTdHJpbmdFZGl0KHRhcmdldCwgMSwgbmV3VGV4dEFscGhhYmV0KTtcblx0XHRyZXR1cm4gZWRpdC5yZXBsYWNlbWVudHNbMF07XG5cdH1cblxuXHQvKipcblx0ICogRmlsbHMgdGhlIGdpdmVuIGFycmF5IHdpdGggcmFuZG9tIGRhdGEuXG5cdCovXG5cdHB1YmxpYyBuZXh0UmFuZG9tVmFsdWVzKGRhdGE6IFVpbnQ4QXJyYXkpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdGRhdGFbaV0gPSB0aGlzLm5leHRJbnRSYW5nZSgwLCAyNTYpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hleDogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RhdGE6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIG5leHRVdWlkKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9kYXRhKSB7XG5cdFx0XHR0aGlzLl9kYXRhID0gbmV3IFVpbnQ4QXJyYXkoMTYpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2hleCkge1xuXHRcdFx0dGhpcy5faGV4ID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDI1NjsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX2hleC5wdXNoKGkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubmV4dFJhbmRvbVZhbHVlcyh0aGlzLl9kYXRhKTtcblxuXHRcdC8vIHNldCB2ZXJzaW9uIGJpdHNcblx0XHR0aGlzLl9kYXRhWzZdID0gKHRoaXMuX2RhdGFbNl0gJiAweDBmKSB8IDB4NDA7XG5cdFx0dGhpcy5fZGF0YVs4XSA9ICh0aGlzLl9kYXRhWzhdICYgMHgzZikgfCAweDgwO1xuXG5cdFx0bGV0IGkgPSAwO1xuXHRcdGxldCByZXN1bHQgPSAnJztcblx0XHRyZXN1bHQgKz0gdGhpcy5faGV4W3RoaXMuX2RhdGFbaSsrXV07XG5cdFx0cmVzdWx0ICs9IHRoaXMuX2hleFt0aGlzLl9kYXRhW2krK11dO1xuXHRcdHJlc3VsdCArPSB0aGlzLl9oZXhbdGhpcy5fZGF0YVtpKytdXTtcblx0XHRyZXN1bHQgKz0gdGhpcy5faGV4W3RoaXMuX2RhdGFbaSsrXV07XG5cdFx0cmVzdWx0ICs9ICctJztcblx0XHRyZXN1bHQgKz0gdGhpcy5faGV4W3RoaXMuX2RhdGFbaSsrXV07XG5cdFx0cmVzdWx0ICs9IHRoaXMuX2hleFt0aGlzLl9kYXRhW2krK11dO1xuXHRcdHJlc3VsdCArPSAnLSc7XG5cdFx0cmVzdWx0ICs9IHRoaXMuX2hleFt0aGlzLl9kYXRhW2krK11dO1xuXHRcdHJlc3VsdCArPSB0aGlzLl9oZXhbdGhpcy5fZGF0YVtpKytdXTtcblx0XHRyZXN1bHQgKz0gJy0nO1xuXHRcdHJlc3VsdCArPSB0aGlzLl9oZXhbdGhpcy5fZGF0YVtpKytdXTtcblx0XHRyZXN1bHQgKz0gdGhpcy5faGV4W3RoaXMuX2RhdGFbaSsrXV07XG5cdFx0cmVzdWx0ICs9ICctJztcblx0XHRyZXN1bHQgKz0gdGhpcy5faGV4W3RoaXMuX2RhdGFbaSsrXV07XG5cdFx0cmVzdWx0ICs9IHRoaXMuX2hleFt0aGlzLl9kYXRhW2krK11dO1xuXHRcdHJlc3VsdCArPSB0aGlzLl9oZXhbdGhpcy5fZGF0YVtpKytdXTtcblx0XHRyZXN1bHQgKz0gdGhpcy5faGV4W3RoaXMuX2RhdGFbaSsrXV07XG5cdFx0cmVzdWx0ICs9IHRoaXMuX2hleFt0aGlzLl9kYXRhW2krK11dO1xuXHRcdHJlc3VsdCArPSB0aGlzLl9oZXhbdGhpcy5fZGF0YVtpKytdXTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXF1ZW5jZUdlbmVyYXRvcjxUPihzZXF1ZW5jZTogVFtdKTogSUdlbmVyYXRvcjxUPiB7XG5cdGxldCBpbmRleCA9IDA7XG5cdHJldHVybiB7XG5cdFx0bmV4dDogKCkgPT4ge1xuXHRcdFx0aWYgKGluZGV4ID49IHNlcXVlbmNlLmxlbmd0aCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdFbmQgb2Ygc2VxdWVuY2UnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBzZXF1ZW5jZVtpbmRleF07XG5cdFx0XHRpbmRleCsrO1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0fVxuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHZW5lcmF0b3I8VD4ge1xuXHRuZXh0KCk6IFQ7XG59XG5cbmNsYXNzIE1lcnNlbm5lVHdpc3RlciBleHRlbmRzIFJhbmRvbSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgbXQgPSBuZXcgQXJyYXkoNjI0KTtcblx0cHJpdmF0ZSBpbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3Ioc2VlZDogbnVtYmVyKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMubXRbMF0gPSBzZWVkID4+PiAwO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgNjI0OyBpKyspIHtcblx0XHRcdGNvbnN0IHMgPSB0aGlzLm10W2kgLSAxXSBeICh0aGlzLm10W2kgLSAxXSA+Pj4gMzApO1xuXHRcdFx0dGhpcy5tdFtpXSA9ICgoKCgocyAmIDB4ZmZmZjAwMDApID4+PiAxNikgKiAweDZjMDc4OTY1KSA8PCAxNikgKyAocyAmIDB4MDAwMGZmZmYpICogMHg2YzA3ODk2NSArIGkpID4+PiAwO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX25leHRJbnQoKSB7XG5cdFx0aWYgKHRoaXMuaW5kZXggPT09IDApIHtcblx0XHRcdHRoaXMuZ2VuZXJhdGVOdW1iZXJzKCk7XG5cdFx0fVxuXG5cdFx0bGV0IHkgPSB0aGlzLm10W3RoaXMuaW5kZXhdO1xuXHRcdHkgPSB5IF4gKHkgPj4+IDExKTtcblx0XHR5ID0geSBeICgoeSA8PCA3KSAmIDB4OWQyYzU2ODApO1xuXHRcdHkgPSB5IF4gKCh5IDw8IDE1KSAmIDB4ZWZjNjAwMDApO1xuXHRcdHkgPSB5IF4gKHkgPj4+IDE4KTtcblxuXHRcdHRoaXMuaW5kZXggPSAodGhpcy5pbmRleCArIDEpICUgNjI0O1xuXG5cdFx0cmV0dXJuIHkgPj4+IDA7XG5cdH1cblxuXHRwdWJsaWMgbmV4dEludFJhbmdlKHN0YXJ0OiBudW1iZXIsIGVuZEV4Y2x1c2l2ZTogbnVtYmVyKSB7XG5cdFx0Y29uc3QgcmFuZ2UgPSBlbmRFeGNsdXNpdmUgLSBzdGFydDtcblx0XHRyZXR1cm4gTWF0aC5mbG9vcih0aGlzLl9uZXh0SW50KCkgLyAoMHgxMDAwMDAwMDAgLyByYW5nZSkpICsgc3RhcnQ7XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlTnVtYmVycygpIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDYyNDsgaSsrKSB7XG5cdFx0XHRjb25zdCB5ID0gKHRoaXMubXRbaV0gJiAweDgwMDAwMDAwKSArICh0aGlzLm10WyhpICsgMSkgJSA2MjRdICYgMHg3ZmZmZmZmZik7XG5cdFx0XHR0aGlzLm10W2ldID0gdGhpcy5tdFsoaSArIDM5NykgJSA2MjRdIF4gKHkgPj4+IDEpO1xuXHRcdFx0aWYgKCh5ICUgMikgIT09IDApIHtcblx0XHRcdFx0dGhpcy5tdFtpXSA9IHRoaXMubXRbaV0gXiAweDk5MDhiMGRmO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUIsZ0JBQWdCO0FBR25DLE1BQWUsVUFBZixNQUFlLFFBQU87QUFBQSxFQVE1QixPQUFjLE9BQU8sTUFBc0I7QUFDMUMsV0FBTyxJQUFJLGdCQUFnQixJQUFJO0FBQUEsRUFDaEM7QUFBQSxFQUVPLGdCQUFnQixVQUFzQztBQUM1RCxXQUFPO0FBQUEsTUFDTixNQUFNLE1BQU07QUFDWCxjQUFNLGlCQUFpQixLQUFLLGFBQWEsR0FBRyxTQUFTLE1BQU07QUFDM0QsZUFBTyxTQUFTLE9BQU8sY0FBYztBQUFBLE1BQ3RDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUlPLFdBQVcsUUFBZ0IsV0FBVyxLQUFLLGdCQUFnQixRQUFPLGFBQWEsR0FBVztBQUNoRyxRQUFJLGFBQXFCO0FBQ3pCLGFBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxLQUFLO0FBQ2hDLG9CQUFjLFNBQVMsS0FBSztBQUFBLElBQzdCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLG9CQUFvQixXQUFtQixp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
