import * as strings from "../../../base/common/strings.js";
import { Constants } from "../../../base/common/uint.js";
import { InlineDecorationType } from "../viewModel/inlineDecorations.js";
import { LinePartMetadata } from "./linePart.js";
class LineDecoration {
  constructor(startColumn, endColumn, className, type) {
    this.startColumn = startColumn;
    this.endColumn = endColumn;
    this.className = className;
    this.type = type;
    this._lineDecorationBrand = void 0;
  }
  static _equals(a, b) {
    return a.startColumn === b.startColumn && a.endColumn === b.endColumn && a.className === b.className && a.type === b.type;
  }
  static equalsArr(a, b) {
    const aLen = a.length;
    const bLen = b.length;
    if (aLen !== bLen) {
      return false;
    }
    for (let i = 0; i < aLen; i++) {
      if (!LineDecoration._equals(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  static extractWrapped(arr, startOffset, endOffset) {
    if (arr.length === 0) {
      return arr;
    }
    const startColumn = startOffset + 1;
    const endColumn = endOffset + 1;
    const lineLength = endOffset - startOffset;
    const r = [];
    let rLength = 0;
    for (const dec of arr) {
      if (dec.endColumn <= startColumn || dec.startColumn >= endColumn) {
        continue;
      }
      r[rLength++] = new LineDecoration(Math.max(1, dec.startColumn - startColumn + 1), Math.min(lineLength + 1, dec.endColumn - startColumn + 1), dec.className, dec.type);
    }
    return r;
  }
  static filter(lineDecorations, lineNumber, minLineColumn, maxLineColumn) {
    if (lineDecorations.length === 0) {
      return [];
    }
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = lineDecorations.length; i < len; i++) {
      const d = lineDecorations[i];
      const range = d.range;
      if (range.endLineNumber < lineNumber || range.startLineNumber > lineNumber) {
        continue;
      }
      if (range.isEmpty() && (d.type === InlineDecorationType.Regular || d.type === InlineDecorationType.RegularAffectingLetterSpacing)) {
        continue;
      }
      const startColumn = range.startLineNumber === lineNumber ? range.startColumn : minLineColumn;
      const endColumn = range.endLineNumber === lineNumber ? range.endColumn : maxLineColumn;
      result[resultLen++] = new LineDecoration(startColumn, endColumn, d.inlineClassName, d.type);
    }
    return result;
  }
  static _typeCompare(a, b) {
    const ORDER = [2, 0, 1, 3];
    return ORDER[a] - ORDER[b];
  }
  static compare(a, b) {
    if (a.startColumn !== b.startColumn) {
      return a.startColumn - b.startColumn;
    }
    if (a.endColumn !== b.endColumn) {
      return a.endColumn - b.endColumn;
    }
    const typeCmp = LineDecoration._typeCompare(a.type, b.type);
    if (typeCmp !== 0) {
      return typeCmp;
    }
    if (a.className !== b.className) {
      return a.className < b.className ? -1 : 1;
    }
    return 0;
  }
}
class DecorationSegment {
  constructor(startOffset, endOffset, className, metadata) {
    this.startOffset = startOffset;
    this.endOffset = endOffset;
    this.className = className;
    this.metadata = metadata;
  }
}
class Stack {
  constructor() {
    this.stopOffsets = [];
    this.classNames = [];
    this.metadata = [];
    this.count = 0;
  }
  static _metadata(metadata) {
    let result = 0;
    for (let i = 0, len = metadata.length; i < len; i++) {
      result |= metadata[i];
    }
    return result;
  }
  consumeLowerThan(maxStopOffset, nextStartOffset, result) {
    while (this.count > 0 && this.stopOffsets[0] < maxStopOffset) {
      let i = 0;
      while (i + 1 < this.count && this.stopOffsets[i] === this.stopOffsets[i + 1]) {
        i++;
      }
      result.push(new DecorationSegment(nextStartOffset, this.stopOffsets[i], this.classNames.join(" "), Stack._metadata(this.metadata)));
      nextStartOffset = this.stopOffsets[i] + 1;
      this.stopOffsets.splice(0, i + 1);
      this.classNames.splice(0, i + 1);
      this.metadata.splice(0, i + 1);
      this.count -= i + 1;
    }
    if (this.count > 0 && nextStartOffset < maxStopOffset) {
      result.push(new DecorationSegment(nextStartOffset, maxStopOffset - 1, this.classNames.join(" "), Stack._metadata(this.metadata)));
      nextStartOffset = maxStopOffset;
    }
    return nextStartOffset;
  }
  insert(stopOffset, className, metadata) {
    if (this.count === 0 || this.stopOffsets[this.count - 1] <= stopOffset) {
      this.stopOffsets.push(stopOffset);
      this.classNames.push(className);
      this.metadata.push(metadata);
    } else {
      for (let i = 0; i < this.count; i++) {
        if (this.stopOffsets[i] >= stopOffset) {
          this.stopOffsets.splice(i, 0, stopOffset);
          this.classNames.splice(i, 0, className);
          this.metadata.splice(i, 0, metadata);
          break;
        }
      }
    }
    this.count++;
    return;
  }
}
class LineDecorationsNormalizer {
  /**
   * Normalize line decorations. Overlapping decorations will generate multiple segments
   */
  static normalize(lineContent, lineDecorations) {
    if (lineDecorations.length === 0) {
      return [];
    }
    const result = [];
    const stack = new Stack();
    let nextStartOffset = 0;
    for (let i = 0, len = lineDecorations.length; i < len; i++) {
      const d = lineDecorations[i];
      let startColumn = d.startColumn;
      let endColumn = d.endColumn;
      const className = d.className;
      const metadata = d.type === InlineDecorationType.Before ? LinePartMetadata.PSEUDO_BEFORE : d.type === InlineDecorationType.After ? LinePartMetadata.PSEUDO_AFTER : 0;
      if (startColumn > 1) {
        const charCodeBefore = lineContent.charCodeAt(startColumn - 2);
        if (strings.isHighSurrogate(charCodeBefore)) {
          startColumn--;
        }
      }
      if (endColumn > 1) {
        const charCodeBefore = lineContent.charCodeAt(endColumn - 2);
        if (strings.isHighSurrogate(charCodeBefore)) {
          endColumn--;
        }
      }
      const currentStartOffset = startColumn - 1;
      const currentEndOffset = endColumn - 2;
      nextStartOffset = stack.consumeLowerThan(currentStartOffset, nextStartOffset, result);
      if (stack.count === 0) {
        nextStartOffset = currentStartOffset;
      }
      stack.insert(currentEndOffset, className, metadata);
    }
    stack.consumeLowerThan(Constants.MAX_SAFE_SMALL_INTEGER, nextStartOffset, result);
    return result;
  }
}
export {
  DecorationSegment,
  LineDecoration,
  LineDecorationsNormalizer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdmlld0xheW91dFxcbGluZURlY29yYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgSW5saW5lRGVjb3JhdGlvbiwgSW5saW5lRGVjb3JhdGlvblR5cGUgfSBmcm9tICcuLi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgTGluZVBhcnRNZXRhZGF0YSB9IGZyb20gJy4vbGluZVBhcnQuanMnO1xuXG5leHBvcnQgY2xhc3MgTGluZURlY29yYXRpb24ge1xuXHRfbGluZURlY29yYXRpb25CcmFuZDogdm9pZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRDb2x1bW46IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZW5kQ29sdW1uOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSB0eXBlOiBJbmxpbmVEZWNvcmF0aW9uVHlwZVxuXHQpIHtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9lcXVhbHMoYTogTGluZURlY29yYXRpb24sIGI6IExpbmVEZWNvcmF0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdGEuc3RhcnRDb2x1bW4gPT09IGIuc3RhcnRDb2x1bW5cblx0XHRcdCYmIGEuZW5kQ29sdW1uID09PSBiLmVuZENvbHVtblxuXHRcdFx0JiYgYS5jbGFzc05hbWUgPT09IGIuY2xhc3NOYW1lXG5cdFx0XHQmJiBhLnR5cGUgPT09IGIudHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGVxdWFsc0FycihhOiByZWFkb25seSBMaW5lRGVjb3JhdGlvbltdLCBiOiByZWFkb25seSBMaW5lRGVjb3JhdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYUxlbiA9IGEubGVuZ3RoO1xuXHRcdGNvbnN0IGJMZW4gPSBiLmxlbmd0aDtcblx0XHRpZiAoYUxlbiAhPT0gYkxlbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFMZW47IGkrKykge1xuXHRcdFx0aWYgKCFMaW5lRGVjb3JhdGlvbi5fZXF1YWxzKGFbaV0sIGJbaV0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGV4dHJhY3RXcmFwcGVkKGFycjogTGluZURlY29yYXRpb25bXSwgc3RhcnRPZmZzZXQ6IG51bWJlciwgZW5kT2Zmc2V0OiBudW1iZXIpOiBMaW5lRGVjb3JhdGlvbltdIHtcblx0XHRpZiAoYXJyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGFycjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBzdGFydE9mZnNldCArIDE7XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gZW5kT2Zmc2V0ICsgMTtcblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gZW5kT2Zmc2V0IC0gc3RhcnRPZmZzZXQ7XG5cdFx0Y29uc3QgciA9IFtdO1xuXHRcdGxldCByTGVuZ3RoID0gMDtcblx0XHRmb3IgKGNvbnN0IGRlYyBvZiBhcnIpIHtcblx0XHRcdGlmIChkZWMuZW5kQ29sdW1uIDw9IHN0YXJ0Q29sdW1uIHx8IGRlYy5zdGFydENvbHVtbiA+PSBlbmRDb2x1bW4pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyW3JMZW5ndGgrK10gPSBuZXcgTGluZURlY29yYXRpb24oTWF0aC5tYXgoMSwgZGVjLnN0YXJ0Q29sdW1uIC0gc3RhcnRDb2x1bW4gKyAxKSwgTWF0aC5taW4obGluZUxlbmd0aCArIDEsIGRlYy5lbmRDb2x1bW4gLSBzdGFydENvbHVtbiArIDEpLCBkZWMuY2xhc3NOYW1lLCBkZWMudHlwZSk7XG5cdFx0fVxuXHRcdHJldHVybiByO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmaWx0ZXIobGluZURlY29yYXRpb25zOiBJbmxpbmVEZWNvcmF0aW9uW10sIGxpbmVOdW1iZXI6IG51bWJlciwgbWluTGluZUNvbHVtbjogbnVtYmVyLCBtYXhMaW5lQ29sdW1uOiBudW1iZXIpOiBMaW5lRGVjb3JhdGlvbltdIHtcblx0XHRpZiAobGluZURlY29yYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogTGluZURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVEZWNvcmF0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgZCA9IGxpbmVEZWNvcmF0aW9uc1tpXTtcblx0XHRcdGNvbnN0IHJhbmdlID0gZC5yYW5nZTtcblxuXHRcdFx0aWYgKHJhbmdlLmVuZExpbmVOdW1iZXIgPCBsaW5lTnVtYmVyIHx8IHJhbmdlLnN0YXJ0TGluZU51bWJlciA+IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gSWdub3JlIGRlY29yYXRpb25zIHRoYXQgc2l0IG91dHNpZGUgdGhpcyBsaW5lXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmFuZ2UuaXNFbXB0eSgpICYmIChkLnR5cGUgPT09IElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIgfHwgZC50eXBlID09PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyQWZmZWN0aW5nTGV0dGVyU3BhY2luZykpIHtcblx0XHRcdFx0Ly8gSWdub3JlIGVtcHR5IHJhbmdlIGRlY29yYXRpb25zXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IChyYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIgPyByYW5nZS5zdGFydENvbHVtbiA6IG1pbkxpbmVDb2x1bW4pO1xuXHRcdFx0Y29uc3QgZW5kQ29sdW1uID0gKHJhbmdlLmVuZExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIgPyByYW5nZS5lbmRDb2x1bW4gOiBtYXhMaW5lQ29sdW1uKTtcblxuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lRGVjb3JhdGlvbihzdGFydENvbHVtbiwgZW5kQ29sdW1uLCBkLmlubGluZUNsYXNzTmFtZSwgZC50eXBlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3R5cGVDb21wYXJlKGE6IElubGluZURlY29yYXRpb25UeXBlLCBiOiBJbmxpbmVEZWNvcmF0aW9uVHlwZSk6IG51bWJlciB7XG5cdFx0Y29uc3QgT1JERVIgPSBbMiwgMCwgMSwgM107XG5cdFx0cmV0dXJuIE9SREVSW2FdIC0gT1JERVJbYl07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNvbXBhcmUoYTogTGluZURlY29yYXRpb24sIGI6IExpbmVEZWNvcmF0aW9uKTogbnVtYmVyIHtcblx0XHRpZiAoYS5zdGFydENvbHVtbiAhPT0gYi5zdGFydENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGEuc3RhcnRDb2x1bW4gLSBiLnN0YXJ0Q29sdW1uO1xuXHRcdH1cblxuXHRcdGlmIChhLmVuZENvbHVtbiAhPT0gYi5lbmRDb2x1bW4pIHtcblx0XHRcdHJldHVybiBhLmVuZENvbHVtbiAtIGIuZW5kQ29sdW1uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHR5cGVDbXAgPSBMaW5lRGVjb3JhdGlvbi5fdHlwZUNvbXBhcmUoYS50eXBlLCBiLnR5cGUpO1xuXHRcdGlmICh0eXBlQ21wICE9PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHlwZUNtcDtcblx0XHR9XG5cblx0XHRpZiAoYS5jbGFzc05hbWUgIT09IGIuY2xhc3NOYW1lKSB7XG5cdFx0XHRyZXR1cm4gYS5jbGFzc05hbWUgPCBiLmNsYXNzTmFtZSA/IC0xIDogMTtcblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVjb3JhdGlvblNlZ21lbnQge1xuXHRzdGFydE9mZnNldDogbnVtYmVyO1xuXHRlbmRPZmZzZXQ6IG51bWJlcjtcblx0Y2xhc3NOYW1lOiBzdHJpbmc7XG5cdG1ldGFkYXRhOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3Ioc3RhcnRPZmZzZXQ6IG51bWJlciwgZW5kT2Zmc2V0OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nLCBtZXRhZGF0YTogbnVtYmVyKSB7XG5cdFx0dGhpcy5zdGFydE9mZnNldCA9IHN0YXJ0T2Zmc2V0O1xuXHRcdHRoaXMuZW5kT2Zmc2V0ID0gZW5kT2Zmc2V0O1xuXHRcdHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuXHRcdHRoaXMubWV0YWRhdGEgPSBtZXRhZGF0YTtcblx0fVxufVxuXG5jbGFzcyBTdGFjayB7XG5cdHB1YmxpYyBjb3VudDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0b3BPZmZzZXRzOiBudW1iZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBjbGFzc05hbWVzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBtZXRhZGF0YTogbnVtYmVyW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5zdG9wT2Zmc2V0cyA9IFtdO1xuXHRcdHRoaXMuY2xhc3NOYW1lcyA9IFtdO1xuXHRcdHRoaXMubWV0YWRhdGEgPSBbXTtcblx0XHR0aGlzLmNvdW50ID0gMDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tZXRhZGF0YShtZXRhZGF0YTogbnVtYmVyW10pOiBudW1iZXIge1xuXHRcdGxldCByZXN1bHQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBtZXRhZGF0YS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0cmVzdWx0IHw9IG1ldGFkYXRhW2ldO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGNvbnN1bWVMb3dlclRoYW4obWF4U3RvcE9mZnNldDogbnVtYmVyLCBuZXh0U3RhcnRPZmZzZXQ6IG51bWJlciwgcmVzdWx0OiBEZWNvcmF0aW9uU2VnbWVudFtdKTogbnVtYmVyIHtcblxuXHRcdHdoaWxlICh0aGlzLmNvdW50ID4gMCAmJiB0aGlzLnN0b3BPZmZzZXRzWzBdIDwgbWF4U3RvcE9mZnNldCkge1xuXHRcdFx0bGV0IGkgPSAwO1xuXG5cdFx0XHQvLyBUYWtlIGFsbCBlcXVhbCBzdG9wcGluZyBvZmZzZXRzXG5cdFx0XHR3aGlsZSAoaSArIDEgPCB0aGlzLmNvdW50ICYmIHRoaXMuc3RvcE9mZnNldHNbaV0gPT09IHRoaXMuc3RvcE9mZnNldHNbaSArIDFdKSB7XG5cdFx0XHRcdGkrKztcblx0XHRcdH1cblxuXHRcdFx0Ly8gQmFzaWNhbGx5IHdlIGFyZSBjb25zdW1pbmcgdGhlIGZpcnN0IGkgKyAxIGVsZW1lbnRzIG9mIHRoZSBzdGFja1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IERlY29yYXRpb25TZWdtZW50KG5leHRTdGFydE9mZnNldCwgdGhpcy5zdG9wT2Zmc2V0c1tpXSwgdGhpcy5jbGFzc05hbWVzLmpvaW4oJyAnKSwgU3RhY2suX21ldGFkYXRhKHRoaXMubWV0YWRhdGEpKSk7XG5cdFx0XHRuZXh0U3RhcnRPZmZzZXQgPSB0aGlzLnN0b3BPZmZzZXRzW2ldICsgMTtcblxuXHRcdFx0Ly8gQ29uc3VtZSB0aGVtXG5cdFx0XHR0aGlzLnN0b3BPZmZzZXRzLnNwbGljZSgwLCBpICsgMSk7XG5cdFx0XHR0aGlzLmNsYXNzTmFtZXMuc3BsaWNlKDAsIGkgKyAxKTtcblx0XHRcdHRoaXMubWV0YWRhdGEuc3BsaWNlKDAsIGkgKyAxKTtcblx0XHRcdHRoaXMuY291bnQgLT0gKGkgKyAxKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb3VudCA+IDAgJiYgbmV4dFN0YXJ0T2Zmc2V0IDwgbWF4U3RvcE9mZnNldCkge1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IERlY29yYXRpb25TZWdtZW50KG5leHRTdGFydE9mZnNldCwgbWF4U3RvcE9mZnNldCAtIDEsIHRoaXMuY2xhc3NOYW1lcy5qb2luKCcgJyksIFN0YWNrLl9tZXRhZGF0YSh0aGlzLm1ldGFkYXRhKSkpO1xuXHRcdFx0bmV4dFN0YXJ0T2Zmc2V0ID0gbWF4U3RvcE9mZnNldDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV4dFN0YXJ0T2Zmc2V0O1xuXHR9XG5cblx0cHVibGljIGluc2VydChzdG9wT2Zmc2V0OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nLCBtZXRhZGF0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY291bnQgPT09IDAgfHwgdGhpcy5zdG9wT2Zmc2V0c1t0aGlzLmNvdW50IC0gMV0gPD0gc3RvcE9mZnNldCkge1xuXHRcdFx0Ly8gSW5zZXJ0IGF0IHRoZSBlbmRcblx0XHRcdHRoaXMuc3RvcE9mZnNldHMucHVzaChzdG9wT2Zmc2V0KTtcblx0XHRcdHRoaXMuY2xhc3NOYW1lcy5wdXNoKGNsYXNzTmFtZSk7XG5cdFx0XHR0aGlzLm1ldGFkYXRhLnB1c2gobWV0YWRhdGEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBGaW5kIHRoZSBpbnNlcnRpb24gcG9zaXRpb24gZm9yIGBzdG9wT2Zmc2V0YFxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNvdW50OyBpKyspIHtcblx0XHRcdFx0aWYgKHRoaXMuc3RvcE9mZnNldHNbaV0gPj0gc3RvcE9mZnNldCkge1xuXHRcdFx0XHRcdHRoaXMuc3RvcE9mZnNldHMuc3BsaWNlKGksIDAsIHN0b3BPZmZzZXQpO1xuXHRcdFx0XHRcdHRoaXMuY2xhc3NOYW1lcy5zcGxpY2UoaSwgMCwgY2xhc3NOYW1lKTtcblx0XHRcdFx0XHR0aGlzLm1ldGFkYXRhLnNwbGljZShpLCAwLCBtZXRhZGF0YSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jb3VudCsrO1xuXHRcdHJldHVybjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTGluZURlY29yYXRpb25zTm9ybWFsaXplciB7XG5cdC8qKlxuXHQgKiBOb3JtYWxpemUgbGluZSBkZWNvcmF0aW9ucy4gT3ZlcmxhcHBpbmcgZGVjb3JhdGlvbnMgd2lsbCBnZW5lcmF0ZSBtdWx0aXBsZSBzZWdtZW50c1xuXHQgKi9cblx0cHVibGljIHN0YXRpYyBub3JtYWxpemUobGluZUNvbnRlbnQ6IHN0cmluZywgbGluZURlY29yYXRpb25zOiBMaW5lRGVjb3JhdGlvbltdKTogRGVjb3JhdGlvblNlZ21lbnRbXSB7XG5cdFx0aWYgKGxpbmVEZWNvcmF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IERlY29yYXRpb25TZWdtZW50W10gPSBbXTtcblxuXHRcdGNvbnN0IHN0YWNrID0gbmV3IFN0YWNrKCk7XG5cdFx0bGV0IG5leHRTdGFydE9mZnNldCA9IDA7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZURlY29yYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBkID0gbGluZURlY29yYXRpb25zW2ldO1xuXHRcdFx0bGV0IHN0YXJ0Q29sdW1uID0gZC5zdGFydENvbHVtbjtcblx0XHRcdGxldCBlbmRDb2x1bW4gPSBkLmVuZENvbHVtbjtcblx0XHRcdGNvbnN0IGNsYXNzTmFtZSA9IGQuY2xhc3NOYW1lO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSAoXG5cdFx0XHRcdGQudHlwZSA9PT0gSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlXG5cdFx0XHRcdFx0PyBMaW5lUGFydE1ldGFkYXRhLlBTRVVET19CRUZPUkVcblx0XHRcdFx0XHQ6IGQudHlwZSA9PT0gSW5saW5lRGVjb3JhdGlvblR5cGUuQWZ0ZXJcblx0XHRcdFx0XHRcdD8gTGluZVBhcnRNZXRhZGF0YS5QU0VVRE9fQUZURVJcblx0XHRcdFx0XHRcdDogMFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gSWYgdGhlIHBvc2l0aW9uIHdvdWxkIGVuZCB1cCBpbiB0aGUgbWlkZGxlIG9mIGEgaGlnaC1sb3cgc3Vycm9nYXRlIHBhaXIsIHdlIG1vdmUgaXQgdG8gYmVmb3JlIHRoZSBwYWlyXG5cdFx0XHRpZiAoc3RhcnRDb2x1bW4gPiAxKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXJDb2RlQmVmb3JlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChzdGFydENvbHVtbiAtIDIpO1xuXHRcdFx0XHRpZiAoc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVCZWZvcmUpKSB7XG5cdFx0XHRcdFx0c3RhcnRDb2x1bW4tLTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZW5kQ29sdW1uID4gMSkge1xuXHRcdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoZW5kQ29sdW1uIC0gMik7XG5cdFx0XHRcdGlmIChzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShjaGFyQ29kZUJlZm9yZSkpIHtcblx0XHRcdFx0XHRlbmRDb2x1bW4tLTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50U3RhcnRPZmZzZXQgPSBzdGFydENvbHVtbiAtIDE7XG5cdFx0XHRjb25zdCBjdXJyZW50RW5kT2Zmc2V0ID0gZW5kQ29sdW1uIC0gMjtcblxuXHRcdFx0bmV4dFN0YXJ0T2Zmc2V0ID0gc3RhY2suY29uc3VtZUxvd2VyVGhhbihjdXJyZW50U3RhcnRPZmZzZXQsIG5leHRTdGFydE9mZnNldCwgcmVzdWx0KTtcblxuXHRcdFx0aWYgKHN0YWNrLmNvdW50ID09PSAwKSB7XG5cdFx0XHRcdG5leHRTdGFydE9mZnNldCA9IGN1cnJlbnRTdGFydE9mZnNldDtcblx0XHRcdH1cblx0XHRcdHN0YWNrLmluc2VydChjdXJyZW50RW5kT2Zmc2V0LCBjbGFzc05hbWUsIG1ldGFkYXRhKTtcblx0XHR9XG5cblx0XHRzdGFjay5jb25zdW1lTG93ZXJUaGFuKENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLCBuZXh0U3RhcnRPZmZzZXQsIHJlc3VsdCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksYUFBYTtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUEyQiw0QkFBNEI7QUFDdkQsU0FBUyx3QkFBd0I7QUFFMUIsTUFBTSxlQUFlO0FBQUEsRUFHM0IsWUFDaUIsYUFDQSxXQUNBLFdBQ0EsTUFDZjtBQUplO0FBQ0E7QUFDQTtBQUNBO0FBTmpCLGdDQUE2QjtBQUFBLEVBUTdCO0FBQUEsRUFFQSxPQUFlLFFBQVEsR0FBbUIsR0FBNEI7QUFDckUsV0FDQyxFQUFFLGdCQUFnQixFQUFFLGVBQ2pCLEVBQUUsY0FBYyxFQUFFLGFBQ2xCLEVBQUUsY0FBYyxFQUFFLGFBQ2xC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
