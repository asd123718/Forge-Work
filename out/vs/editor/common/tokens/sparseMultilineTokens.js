import { CharCode } from "../../../base/common/charCode.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { countEOL } from "../core/misc/eolCounter.js";
import { RateLimiter } from "./common.js";
class SparseMultilineTokens {
  static create(startLineNumber, tokens) {
    return new SparseMultilineTokens(startLineNumber, new SparseMultilineTokensStorage(tokens));
  }
  /**
   * (Inclusive) start line number for these tokens.
   */
  get startLineNumber() {
    return this._startLineNumber;
  }
  /**
   * (Inclusive) end line number for these tokens.
   */
  get endLineNumber() {
    return this._endLineNumber;
  }
  constructor(startLineNumber, tokens) {
    this._startLineNumber = startLineNumber;
    this._tokens = tokens;
    this._endLineNumber = this._startLineNumber + this._tokens.getMaxDeltaLine();
  }
  toString() {
    return this._tokens.toString(this._startLineNumber);
  }
  _updateEndLineNumber() {
    this._endLineNumber = this._startLineNumber + this._tokens.getMaxDeltaLine();
  }
  isEmpty() {
    return this._tokens.isEmpty();
  }
  getLineTokens(lineNumber) {
    if (this._startLineNumber <= lineNumber && lineNumber <= this._endLineNumber) {
      return this._tokens.getLineTokens(lineNumber - this._startLineNumber);
    }
    return null;
  }
  getRange() {
    const deltaRange = this._tokens.getRange();
    if (!deltaRange) {
      return deltaRange;
    }
    return new Range(this._startLineNumber + deltaRange.startLineNumber, deltaRange.startColumn, this._startLineNumber + deltaRange.endLineNumber, deltaRange.endColumn);
  }
  removeTokens(range) {
    const startLineIndex = range.startLineNumber - this._startLineNumber;
    const endLineIndex = range.endLineNumber - this._startLineNumber;
    this._startLineNumber += this._tokens.removeTokens(startLineIndex, range.startColumn - 1, endLineIndex, range.endColumn - 1);
    this._updateEndLineNumber();
  }
  split(range) {
    const startLineIndex = range.startLineNumber - this._startLineNumber;
    const endLineIndex = range.endLineNumber - this._startLineNumber;
    const [a, b, bDeltaLine] = this._tokens.split(startLineIndex, range.startColumn - 1, endLineIndex, range.endColumn - 1);
    return [new SparseMultilineTokens(this._startLineNumber, a), new SparseMultilineTokens(this._startLineNumber + bDeltaLine, b)];
  }
  applyEdit(range, text) {
    const [eolCount, firstLineLength, lastLineLength] = countEOL(text);
    this.acceptEdit(range, eolCount, firstLineLength, lastLineLength, text.length > 0 ? text.charCodeAt(0) : CharCode.Null);
  }
  acceptEdit(range, eolCount, firstLineLength, lastLineLength, firstCharCode) {
    this._acceptDeleteRange(range);
    this._acceptInsertText(new Position(range.startLineNumber, range.startColumn), eolCount, firstLineLength, lastLineLength, firstCharCode);
    this._updateEndLineNumber();
  }
  _acceptDeleteRange(range) {
    if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
      return;
    }
    const firstLineIndex = range.startLineNumber - this._startLineNumber;
    const lastLineIndex = range.endLineNumber - this._startLineNumber;
    if (lastLineIndex < 0) {
      const deletedLinesCount = lastLineIndex - firstLineIndex;
      this._startLineNumber -= deletedLinesCount;
      return;
    }
    const tokenMaxDeltaLine = this._tokens.getMaxDeltaLine();
    if (firstLineIndex >= tokenMaxDeltaLine + 1) {
      return;
    }
    if (firstLineIndex < 0 && lastLineIndex >= tokenMaxDeltaLine + 1) {
      this._startLineNumber = 0;
      this._tokens.clear();
      return;
    }
    if (firstLineIndex < 0) {
      const deletedBefore = -firstLineIndex;
      this._startLineNumber -= deletedBefore;
      this._tokens.acceptDeleteRange(range.startColumn - 1, 0, 0, lastLineIndex, range.endColumn - 1);
    } else {
      this._tokens.acceptDeleteRange(0, firstLineIndex, range.startColumn - 1, lastLineIndex, range.endColumn - 1);
    }
  }
  _acceptInsertText(position, eolCount, firstLineLength, lastLineLength, firstCharCode) {
    if (eolCount === 0 && firstLineLength === 0) {
      return;
    }
    const lineIndex = position.lineNumber - this._startLineNumber;
    if (lineIndex < 0) {
      this._startLineNumber += eolCount;
      return;
    }
    const tokenMaxDeltaLine = this._tokens.getMaxDeltaLine();
    if (lineIndex >= tokenMaxDeltaLine + 1) {
      return;
    }
    this._tokens.acceptInsertText(lineIndex, position.column - 1, eolCount, firstLineLength, lastLineLength, firstCharCode);
  }
  reportIfInvalid(model) {
    this._tokens.reportIfInvalid(model, this._startLineNumber);
  }
}
const _SparseMultilineTokensStorage = class _SparseMultilineTokensStorage {
  constructor(tokens) {
    this._tokens = tokens;
    this._tokenCount = tokens.length / 4;
  }
  toString(startLineNumber) {
    const pieces = [];
    for (let i = 0; i < this._tokenCount; i++) {
      pieces.push(`(${this._getDeltaLine(i) + startLineNumber},${this._getStartCharacter(i)}-${this._getEndCharacter(i)})`);
    }
    return `[${pieces.join(",")}]`;
  }
  getMaxDeltaLine() {
    const tokenCount = this._getTokenCount();
    if (tokenCount === 0) {
      return -1;
    }
    return this._getDeltaLine(tokenCount - 1);
  }
  getRange() {
    const tokenCount = this._getTokenCount();
    if (tokenCount === 0) {
      return null;
    }
    const startChar = this._getStartCharacter(0);
    const maxDeltaLine = this._getDeltaLine(tokenCount - 1);
    const endChar = this._getEndCharacter(tokenCount - 1);
    return new Range(0, startChar + 1, maxDeltaLine, endChar + 1);
  }
  _getTokenCount() {
    return this._tokenCount;
  }
  _getDeltaLine(tokenIndex) {
    return this._tokens[4 * tokenIndex];
  }
  _getStartCharacter(tokenIndex) {
    return this._tokens[4 * tokenIndex + 1];
  }
  _getEndCharacter(tokenIndex) {
    return this._tokens[4 * tokenIndex + 2];
  }
  isEmpty() {
    return this._getTokenCount() === 0;
  }
  getLineTokens(deltaLine) {
    let low = 0;
    let high = this._getTokenCount() - 1;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      const midDeltaLine = this._getDeltaLine(mid);
      if (midDeltaLine < deltaLine) {
        low = mid + 1;
      } else if (midDeltaLine > deltaLine) {
        high = mid - 1;
      } else {
        let min = mid;
        while (min > low && this._getDeltaLine(min - 1) === deltaLine) {
          min--;
        }
        let max = mid;
        while (max < high && this._getDeltaLine(max + 1) === deltaLine) {
          max++;
        }
        return new SparseLineTokens(this._tokens.subarray(4 * min, 4 * max + 4));
      }
    }
    if (this._getDeltaLine(low) === deltaLine) {
      return new SparseLineTokens(this._tokens.subarray(4 * low, 4 * low + 4));
    }
    return null;
  }
  clear() {
    this._tokenCount = 0;
  }
  removeTokens(startDeltaLine, startChar, endDeltaLine, endChar) {
    const tokens = this._tokens;
    const tokenCount = this._tokenCount;
    let newTokenCount = 0;
    let hasDeletedTokens = false;
    let firstDeltaLine = 0;
    for (let i = 0; i < tokenCount; i++) {
      const srcOffset = 4 * i;
      const tokenDeltaLine = tokens[srcOffset];
      const tokenStartCharacter = tokens[srcOffset + 1];
      const tokenEndCharacter = tokens[srcOffset + 2];
      const tokenMetadata = tokens[srcOffset + 3];
      if ((tokenDeltaLine > startDeltaLine || tokenDeltaLine === startDeltaLine && tokenEndCharacter >= startChar) && (tokenDeltaLine < endDeltaLine || tokenDeltaLine === endDeltaLine && tokenStartCharacter <= endChar)) {
        hasDeletedTokens = true;
      } else {
        if (newTokenCount === 0) {
          firstDeltaLine = tokenDeltaLine;
        }
        if (hasDeletedTokens) {
          const destOffset = 4 * newTokenCount;
          tokens[destOffset] = tokenDeltaLine - firstDeltaLine;
          tokens[destOffset + 1] = tokenStartCharacter;
          tokens[destOffset + 2] = tokenEndCharacter;
          tokens[destOffset + 3] = tokenMetadata;
        } else if (firstDeltaLine !== 0) {
          tokens[srcOffset] = tokenDeltaLine - firstDeltaLine;
        }
        newTokenCount++;
      }
    }
    this._tokenCount = newTokenCount;
    return firstDeltaLine;
  }
  split(startDeltaLine, startChar, endDeltaLine, endChar) {
    const tokens = this._tokens;
    const tokenCount = this._tokenCount;
    const aTokens = [];
    const bTokens = [];
    let destTokens = aTokens;
    let destOffset = 0;
    let destFirstDeltaLine = 0;
    for (let i = 0; i < tokenCount; i++) {
      const srcOffset = 4 * i;
      const tokenDeltaLine = tokens[srcOffset];
      const tokenStartCharacter = tokens[srcOffset + 1];
      const tokenEndCharacter = tokens[srcOffset + 2];
      const tokenMetadata = tokens[srcOffset + 3];
      if (tokenDeltaLine > startDeltaLine || tokenDeltaLine === startDeltaLine && tokenEndCharacter >= startChar) {
        if (tokenDeltaLine < endDeltaLine || tokenDeltaLine === endDeltaLine && tokenStartCharacter <= endChar) {
          continue;
        } else {
          if (destTokens !== bTokens) {
            destTokens = bTokens;
            destOffset = 0;
            destFirstDeltaLine = tokenDeltaLine;
          }
        }
      }
      destTokens[destOffset++] = tokenDeltaLine - destFirstDeltaLine;
      destTokens[destOffset++] = tokenStartCharacter;
      destTokens[destOffset++] = tokenEndCharacter;
      destTokens[destOffset++] = tokenMetadata;
    }
    return [new _SparseMultilineTokensStorage(new Uint32Array(aTokens)), new _SparseMultilineTokensStorage(new Uint32Array(bTokens)), destFirstDeltaLine];
  }
  acceptDeleteRange(horizontalShiftForFirstLineTokens, startDeltaLine, startCharacter, endDeltaLine, endCharacter) {
    const tokens = this._tokens;
    const tokenCount = this._tokenCount;
    const deletedLineCount = endDeltaLine - startDeltaLine;
    let newTokenCount = 0;
    let hasDeletedTokens = false;
    for (let i = 0; i < tokenCount; i++) {
      const srcOffset = 4 * i;
      let tokenDeltaLine = tokens[srcOffset];
      let tokenStartCharacter = tokens[srcOffset + 1];
      let tokenEndCharacter = tokens[srcOffset + 2];
      const tokenMetadata = tokens[srcOffset + 3];
      if (tokenDeltaLine < startDeltaLine || tokenDeltaLine === startDeltaLine && tokenEndCharacter <= startCharacter) {
        newTokenCount++;
        continue;
      } else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter < startCharacter) {
        if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
          tokenEndCharacter -= endCharacter - startCharacter;
        } else {
          tokenEndCharacter = startCharacter;
        }
      } else if (tokenDeltaLine === startDeltaLine && tokenStartCharacter === startCharacter) {
        if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
          tokenEndCharacter -= endCharacter - startCharacter;
        } else {
          hasDeletedTokens = true;
          continue;
        }
      } else if (tokenDeltaLine < endDeltaLine || tokenDeltaLine === endDeltaLine && tokenStartCharacter < endCharacter) {
        if (tokenDeltaLine === endDeltaLine && tokenEndCharacter > endCharacter) {
          tokenDeltaLine = startDeltaLine;
          tokenStartCharacter = startCharacter;
          tokenEndCharacter = tokenStartCharacter + (tokenEndCharacter - endCharacter);
        } else {
          hasDeletedTokens = true;
          continue;
        }
      } else if (tokenDeltaLine > endDeltaLine) {
        if (deletedLineCount === 0 && !hasDeletedTokens) {
          newTokenCount = tokenCount;
          break;
        }
        tokenDeltaLine -= deletedLineCount;
      } else if (tokenDeltaLine === endDeltaLine && tokenStartCharacter >= endCharacter) {
        if (horizontalShiftForFirstLineTokens && tokenDeltaLine === 0) {
          tokenStartCharacter += horizontalShiftForFirstLineTokens;
          tokenEndCharacter += horizontalShiftForFirstLineTokens;
        }
        tokenDeltaLine -= deletedLineCount;
        tokenStartCharacter -= endCharacter - startCharacter;
        tokenEndCharacter -= endCharacter - startCharacter;
      } else {
        throw new Error(`Not possible!`);
      }
      const destOffset = 4 * newTokenCount;
      tokens[destOffset] = tokenDeltaLine;
      tokens[destOffset + 1] = tokenStartCharacter;
      tokens[destOffset + 2] = tokenEndCharacter;
      tokens[destOffset + 3] = tokenMetadata;
      newTokenCount++;
    }
    this._tokenCount = newTokenCount;
  }
  acceptInsertText(deltaLine, character, eolCount, firstLineLength, lastLineLength, firstCharCode) {
    const isInsertingPreciselyOneWordCharacter = eolCount === 0 && firstLineLength === 1 && (firstCharCode >= CharCode.Digit0 && firstCharCode <= CharCode.Digit9 || firstCharCode >= CharCode.A && firstCharCode <= CharCode.Z || firstCharCode >= CharCode.a && firstCharCode <= CharCode.z);
    const tokens = this._tokens;
    const tokenCount = this._tokenCount;
    for (let i = 0; i < tokenCount; i++) {
      const offset = 4 * i;
      let tokenDeltaLine = tokens[offset];
      let tokenStartCharacter = tokens[offset + 1];
      let tokenEndCharacter = tokens[offset + 2];
      if (tokenDeltaLine < deltaLine || tokenDeltaLine === deltaLine && tokenEndCharacter < character) {
        continue;
      } else if (tokenDeltaLine === deltaLine && tokenEndCharacter === character) {
        if (isInsertingPreciselyOneWordCharacter) {
          tokenEndCharacter += 1;
        } else {
          continue;
        }
      } else if (tokenDeltaLine === deltaLine && tokenStartCharacter < character && character < tokenEndCharacter) {
        if (eolCount === 0) {
          tokenEndCharacter += firstLineLength;
        } else {
          tokenEndCharacter = character;
        }
      } else {
        if (tokenDeltaLine === deltaLine && tokenStartCharacter === character) {
          if (isInsertingPreciselyOneWordCharacter) {
            continue;
          }
        }
        if (tokenDeltaLine === deltaLine) {
          tokenDeltaLine += eolCount;
          if (eolCount === 0) {
            tokenStartCharacter += firstLineLength;
            tokenEndCharacter += firstLineLength;
          } else {
            const tokenLength = tokenEndCharacter - tokenStartCharacter;
            tokenStartCharacter = lastLineLength + (tokenStartCharacter - character);
            tokenEndCharacter = tokenStartCharacter + tokenLength;
          }
        } else {
          tokenDeltaLine += eolCount;
        }
      }
      tokens[offset] = tokenDeltaLine;
      tokens[offset + 1] = tokenStartCharacter;
      tokens[offset + 2] = tokenEndCharacter;
    }
  }
  // limit to 10 times per minute
  reportIfInvalid(model, startLineNumber) {
    for (let i = 0; i < this._tokenCount; i++) {
      const lineNumber = this._getDeltaLine(i) + startLineNumber;
      if (lineNumber < 1) {
        _SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
          console.error("Invalid Semantic Tokens Data From Extension: lineNumber < 1");
        });
      } else if (lineNumber > model.getLineCount()) {
        _SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
          console.error("Invalid Semantic Tokens Data From Extension: lineNumber > model.getLineCount()");
        });
      } else if (this._getEndCharacter(i) > model.getLineLength(lineNumber)) {
        _SparseMultilineTokensStorage._rateLimiter.runIfNotLimited(() => {
          console.error("Invalid Semantic Tokens Data From Extension: end character > model.getLineLength(lineNumber)");
        });
      }
    }
  }
};
_SparseMultilineTokensStorage._rateLimiter = new RateLimiter(10 / 60);
let SparseMultilineTokensStorage = _SparseMultilineTokensStorage;
class SparseLineTokens {
  constructor(tokens) {
    this._tokens = tokens;
  }
  getCount() {
    return this._tokens.length / 4;
  }
  getStartCharacter(tokenIndex) {
    return this._tokens[4 * tokenIndex + 1];
  }
  getEndCharacter(tokenIndex) {
    return this._tokens[4 * tokenIndex + 2];
  }
  getMetadata(tokenIndex) {
    return this._tokens[4 * tokenIndex + 3];
  }
}
export {
  SparseLineTokens,
  SparseMultilineTokens
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdG9rZW5zXFxzcGFyc2VNdWx0aWxpbmVUb2tlbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBjb3VudEVPTCB9IGZyb20gJy4uL2NvcmUvbWlzYy9lb2xDb3VudGVyLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBSYXRlTGltaXRlciB9IGZyb20gJy4vY29tbW9uLmpzJztcblxuLyoqXG4gKiBSZXByZXNlbnRzIHNwYXJzZSB0b2tlbnMgb3ZlciBhIGNvbnRpZ3VvdXMgcmFuZ2Ugb2YgbGluZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBTcGFyc2VNdWx0aWxpbmVUb2tlbnMge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCB0b2tlbnM6IFVpbnQzMkFycmF5KTogU3BhcnNlTXVsdGlsaW5lVG9rZW5zIHtcblx0XHRyZXR1cm4gbmV3IFNwYXJzZU11bHRpbGluZVRva2VucyhzdGFydExpbmVOdW1iZXIsIG5ldyBTcGFyc2VNdWx0aWxpbmVUb2tlbnNTdG9yYWdlKHRva2VucykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHByaXZhdGUgX2VuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5zOiBTcGFyc2VNdWx0aWxpbmVUb2tlbnNTdG9yYWdlO1xuXG5cdC8qKlxuXHQgKiAoSW5jbHVzaXZlKSBzdGFydCBsaW5lIG51bWJlciBmb3IgdGhlc2UgdG9rZW5zLlxuXHQgKi9cblx0cHVibGljIGdldCBzdGFydExpbmVOdW1iZXIoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRMaW5lTnVtYmVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIChJbmNsdXNpdmUpIGVuZCBsaW5lIG51bWJlciBmb3IgdGhlc2UgdG9rZW5zLlxuXHQgKi9cblx0cHVibGljIGdldCBlbmRMaW5lTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuZExpbmVOdW1iZXI7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCB0b2tlbnM6IFNwYXJzZU11bHRpbGluZVRva2Vuc1N0b3JhZ2UpIHtcblx0XHR0aGlzLl9zdGFydExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5fdG9rZW5zID0gdG9rZW5zO1xuXHRcdHRoaXMuX2VuZExpbmVOdW1iZXIgPSB0aGlzLl9zdGFydExpbmVOdW1iZXIgKyB0aGlzLl90b2tlbnMuZ2V0TWF4RGVsdGFMaW5lKCk7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zLnRvU3RyaW5nKHRoaXMuX3N0YXJ0TGluZU51bWJlcik7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVFbmRMaW5lTnVtYmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VuZExpbmVOdW1iZXIgPSB0aGlzLl9zdGFydExpbmVOdW1iZXIgKyB0aGlzLl90b2tlbnMuZ2V0TWF4RGVsdGFMaW5lKCk7XG5cdH1cblxuXHRwdWJsaWMgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zLmlzRW1wdHkoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXI6IG51bWJlcik6IFNwYXJzZUxpbmVUb2tlbnMgfCBudWxsIHtcblx0XHRpZiAodGhpcy5fc3RhcnRMaW5lTnVtYmVyIDw9IGxpbmVOdW1iZXIgJiYgbGluZU51bWJlciA8PSB0aGlzLl9lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zLmdldExpbmVUb2tlbnMobGluZU51bWJlciAtIHRoaXMuX3N0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIGdldFJhbmdlKCk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3QgZGVsdGFSYW5nZSA9IHRoaXMuX3Rva2Vucy5nZXRSYW5nZSgpO1xuXHRcdGlmICghZGVsdGFSYW5nZSkge1xuXHRcdFx0cmV0dXJuIGRlbHRhUmFuZ2U7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmFuZ2UodGhpcy5fc3RhcnRMaW5lTnVtYmVyICsgZGVsdGFSYW5nZS5zdGFydExpbmVOdW1iZXIsIGRlbHRhUmFuZ2Uuc3RhcnRDb2x1bW4sIHRoaXMuX3N0YXJ0TGluZU51bWJlciArIGRlbHRhUmFuZ2UuZW5kTGluZU51bWJlciwgZGVsdGFSYW5nZS5lbmRDb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVRva2VucyhyYW5nZTogUmFuZ2UpOiB2b2lkIHtcblx0XHRjb25zdCBzdGFydExpbmVJbmRleCA9IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIHRoaXMuX3N0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBlbmRMaW5lSW5kZXggPSByYW5nZS5lbmRMaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0dGhpcy5fc3RhcnRMaW5lTnVtYmVyICs9IHRoaXMuX3Rva2Vucy5yZW1vdmVUb2tlbnMoc3RhcnRMaW5lSW5kZXgsIHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgZW5kTGluZUluZGV4LCByYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHR0aGlzLl91cGRhdGVFbmRMaW5lTnVtYmVyKCk7XG5cdH1cblxuXHRwdWJsaWMgc3BsaXQocmFuZ2U6IFJhbmdlKTogW1NwYXJzZU11bHRpbGluZVRva2VucywgU3BhcnNlTXVsdGlsaW5lVG9rZW5zXSB7XG5cdFx0Ly8gc3BsaXQgdG9rZW5zIHRvIHR3bzpcblx0XHQvLyBhKSBhbGwgdGhlIHRva2VucyBiZWZvcmUgYHJhbmdlYFxuXHRcdC8vIGIpIGFsbCB0aGUgdG9rZW5zIGFmdGVyIGByYW5nZWBcblx0XHRjb25zdCBzdGFydExpbmVJbmRleCA9IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIHRoaXMuX3N0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBlbmRMaW5lSW5kZXggPSByYW5nZS5lbmRMaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0Y29uc3QgW2EsIGIsIGJEZWx0YUxpbmVdID0gdGhpcy5fdG9rZW5zLnNwbGl0KHN0YXJ0TGluZUluZGV4LCByYW5nZS5zdGFydENvbHVtbiAtIDEsIGVuZExpbmVJbmRleCwgcmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0cmV0dXJuIFtuZXcgU3BhcnNlTXVsdGlsaW5lVG9rZW5zKHRoaXMuX3N0YXJ0TGluZU51bWJlciwgYSksIG5ldyBTcGFyc2VNdWx0aWxpbmVUb2tlbnModGhpcy5fc3RhcnRMaW5lTnVtYmVyICsgYkRlbHRhTGluZSwgYildO1xuXHR9XG5cblx0cHVibGljIGFwcGx5RWRpdChyYW5nZTogSVJhbmdlLCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBbZW9sQ291bnQsIGZpcnN0TGluZUxlbmd0aCwgbGFzdExpbmVMZW5ndGhdID0gY291bnRFT0wodGV4dCk7XG5cdFx0dGhpcy5hY2NlcHRFZGl0KHJhbmdlLCBlb2xDb3VudCwgZmlyc3RMaW5lTGVuZ3RoLCBsYXN0TGluZUxlbmd0aCwgdGV4dC5sZW5ndGggPiAwID8gdGV4dC5jaGFyQ29kZUF0KDApIDogQ2hhckNvZGUuTnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0RWRpdChyYW5nZTogSVJhbmdlLCBlb2xDb3VudDogbnVtYmVyLCBmaXJzdExpbmVMZW5ndGg6IG51bWJlciwgbGFzdExpbmVMZW5ndGg6IG51bWJlciwgZmlyc3RDaGFyQ29kZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXB0RGVsZXRlUmFuZ2UocmFuZ2UpO1xuXHRcdHRoaXMuX2FjY2VwdEluc2VydFRleHQobmV3IFBvc2l0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pLCBlb2xDb3VudCwgZmlyc3RMaW5lTGVuZ3RoLCBsYXN0TGluZUxlbmd0aCwgZmlyc3RDaGFyQ29kZSk7XG5cdFx0dGhpcy5fdXBkYXRlRW5kTGluZU51bWJlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWNjZXB0RGVsZXRlUmFuZ2UocmFuZ2U6IElSYW5nZSk6IHZvaWQge1xuXHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIgJiYgcmFuZ2Uuc3RhcnRDb2x1bW4gPT09IHJhbmdlLmVuZENvbHVtbikge1xuXHRcdFx0Ly8gTm90aGluZyB0byBkZWxldGVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdExpbmVJbmRleCA9IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIHRoaXMuX3N0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBsYXN0TGluZUluZGV4ID0gcmFuZ2UuZW5kTGluZU51bWJlciAtIHRoaXMuX3N0YXJ0TGluZU51bWJlcjtcblxuXHRcdGlmIChsYXN0TGluZUluZGV4IDwgMCkge1xuXHRcdFx0Ly8gdGhpcyBkZWxldGlvbiBvY2N1cnMgZW50aXJlbHkgYmVmb3JlIHRoaXMgYmxvY2ssIHNvIHdlIG9ubHkgbmVlZCB0byBhZGp1c3QgbGluZSBudW1iZXJzXG5cdFx0XHRjb25zdCBkZWxldGVkTGluZXNDb3VudCA9IGxhc3RMaW5lSW5kZXggLSBmaXJzdExpbmVJbmRleDtcblx0XHRcdHRoaXMuX3N0YXJ0TGluZU51bWJlciAtPSBkZWxldGVkTGluZXNDb3VudDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b2tlbk1heERlbHRhTGluZSA9IHRoaXMuX3Rva2Vucy5nZXRNYXhEZWx0YUxpbmUoKTtcblxuXHRcdGlmIChmaXJzdExpbmVJbmRleCA+PSB0b2tlbk1heERlbHRhTGluZSArIDEpIHtcblx0XHRcdC8vIHRoaXMgZGVsZXRpb24gb2NjdXJzIGVudGlyZWx5IGFmdGVyIHRoaXMgYmxvY2ssIHNvIHRoZXJlIGlzIG5vdGhpbmcgdG8gZG9cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZmlyc3RMaW5lSW5kZXggPCAwICYmIGxhc3RMaW5lSW5kZXggPj0gdG9rZW5NYXhEZWx0YUxpbmUgKyAxKSB7XG5cdFx0XHQvLyB0aGlzIGRlbGV0aW9uIGNvbXBsZXRlbHkgZW5jb21wYXNzZXMgdGhpcyBibG9ja1xuXHRcdFx0dGhpcy5fc3RhcnRMaW5lTnVtYmVyID0gMDtcblx0XHRcdHRoaXMuX3Rva2Vucy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChmaXJzdExpbmVJbmRleCA8IDApIHtcblx0XHRcdGNvbnN0IGRlbGV0ZWRCZWZvcmUgPSAtZmlyc3RMaW5lSW5kZXg7XG5cdFx0XHR0aGlzLl9zdGFydExpbmVOdW1iZXIgLT0gZGVsZXRlZEJlZm9yZTtcblxuXHRcdFx0dGhpcy5fdG9rZW5zLmFjY2VwdERlbGV0ZVJhbmdlKHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgMCwgMCwgbGFzdExpbmVJbmRleCwgcmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Rva2Vucy5hY2NlcHREZWxldGVSYW5nZSgwLCBmaXJzdExpbmVJbmRleCwgcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBsYXN0TGluZUluZGV4LCByYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hY2NlcHRJbnNlcnRUZXh0KHBvc2l0aW9uOiBQb3NpdGlvbiwgZW9sQ291bnQ6IG51bWJlciwgZmlyc3RMaW5lTGVuZ3RoOiBudW1iZXIsIGxhc3RMaW5lTGVuZ3RoOiBudW1iZXIsIGZpcnN0Q2hhckNvZGU6IG51bWJlcik6IHZvaWQge1xuXG5cdFx0aWYgKGVvbENvdW50ID09PSAwICYmIGZpcnN0TGluZUxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gTm90aGluZyB0byBpbnNlcnRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lSW5kZXggPSBwb3NpdGlvbi5saW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0aWYgKGxpbmVJbmRleCA8IDApIHtcblx0XHRcdC8vIHRoaXMgaW5zZXJ0aW9uIG9jY3VycyBiZWZvcmUgdGhpcyBibG9jaywgc28gd2Ugb25seSBuZWVkIHRvIGFkanVzdCBsaW5lIG51bWJlcnNcblx0XHRcdHRoaXMuX3N0YXJ0TGluZU51bWJlciArPSBlb2xDb3VudDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b2tlbk1heERlbHRhTGluZSA9IHRoaXMuX3Rva2Vucy5nZXRNYXhEZWx0YUxpbmUoKTtcblxuXHRcdGlmIChsaW5lSW5kZXggPj0gdG9rZW5NYXhEZWx0YUxpbmUgKyAxKSB7XG5cdFx0XHQvLyB0aGlzIGluc2VydGlvbiBvY2N1cnMgYWZ0ZXIgdGhpcyBibG9jaywgc28gdGhlcmUgaXMgbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Rva2Vucy5hY2NlcHRJbnNlcnRUZXh0KGxpbmVJbmRleCwgcG9zaXRpb24uY29sdW1uIC0gMSwgZW9sQ291bnQsIGZpcnN0TGluZUxlbmd0aCwgbGFzdExpbmVMZW5ndGgsIGZpcnN0Q2hhckNvZGUpO1xuXHR9XG5cblx0cHVibGljIHJlcG9ydElmSW52YWxpZChtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rva2Vucy5yZXBvcnRJZkludmFsaWQobW9kZWwsIHRoaXMuX3N0YXJ0TGluZU51bWJlcik7XG5cdH1cbn1cblxuY2xhc3MgU3BhcnNlTXVsdGlsaW5lVG9rZW5zU3RvcmFnZSB7XG5cdC8qKlxuXHQgKiBUaGUgZW5jb2Rpbmcgb2YgdG9rZW5zIGlzOlxuXHQgKiAgNCppICAgIGRlbHRhTGluZSAoZnJvbSBgc3RhcnRMaW5lTnVtYmVyYClcblx0ICogIDQqaSsxICBzdGFydENoYXJhY3RlciAoZnJvbSB0aGUgbGluZSBzdGFydClcblx0ICogIDQqaSsyICBlbmRDaGFyYWN0ZXIgKGZyb20gdGhlIGxpbmUgc3RhcnQpXG5cdCAqICA0KmkrMyAgbWV0YWRhdGFcblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuczogVWludDMyQXJyYXk7XG5cdHByaXZhdGUgX3Rva2VuQ291bnQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcih0b2tlbnM6IFVpbnQzMkFycmF5KSB7XG5cdFx0dGhpcy5fdG9rZW5zID0gdG9rZW5zO1xuXHRcdHRoaXMuX3Rva2VuQ291bnQgPSB0b2tlbnMubGVuZ3RoIC8gNDtcblx0fVxuXG5cdHB1YmxpYyB0b1N0cmluZyhzdGFydExpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgcGllY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fdG9rZW5Db3VudDsgaSsrKSB7XG5cdFx0XHRwaWVjZXMucHVzaChgKCR7dGhpcy5fZ2V0RGVsdGFMaW5lKGkpICsgc3RhcnRMaW5lTnVtYmVyfSwke3RoaXMuX2dldFN0YXJ0Q2hhcmFjdGVyKGkpfS0ke3RoaXMuX2dldEVuZENoYXJhY3RlcihpKX0pYCk7XG5cdFx0fVxuXHRcdHJldHVybiBgWyR7cGllY2VzLmpvaW4oJywnKX1dYDtcblx0fVxuXG5cdHB1YmxpYyBnZXRNYXhEZWx0YUxpbmUoKTogbnVtYmVyIHtcblx0XHRjb25zdCB0b2tlbkNvdW50ID0gdGhpcy5fZ2V0VG9rZW5Db3VudCgpO1xuXHRcdGlmICh0b2tlbkNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXREZWx0YUxpbmUodG9rZW5Db3VudCAtIDEpO1xuXHR9XG5cblx0cHVibGljIGdldFJhbmdlKCk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3QgdG9rZW5Db3VudCA9IHRoaXMuX2dldFRva2VuQ291bnQoKTtcblx0XHRpZiAodG9rZW5Db3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0Q2hhciA9IHRoaXMuX2dldFN0YXJ0Q2hhcmFjdGVyKDApO1xuXHRcdGNvbnN0IG1heERlbHRhTGluZSA9IHRoaXMuX2dldERlbHRhTGluZSh0b2tlbkNvdW50IC0gMSk7XG5cdFx0Y29uc3QgZW5kQ2hhciA9IHRoaXMuX2dldEVuZENoYXJhY3Rlcih0b2tlbkNvdW50IC0gMSk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZSgwLCBzdGFydENoYXIgKyAxLCBtYXhEZWx0YUxpbmUsIGVuZENoYXIgKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRva2VuQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5Db3VudDtcblx0fVxuXG5cdHByaXZhdGUgX2dldERlbHRhTGluZSh0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbNCAqIHRva2VuSW5kZXhdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U3RhcnRDaGFyYWN0ZXIodG9rZW5JbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zWzQgKiB0b2tlbkluZGV4ICsgMV07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFbmRDaGFyYWN0ZXIodG9rZW5JbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zWzQgKiB0b2tlbkluZGV4ICsgMl07XG5cdH1cblxuXHRwdWJsaWMgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX2dldFRva2VuQ291bnQoKSA9PT0gMCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZVRva2VucyhkZWx0YUxpbmU6IG51bWJlcik6IFNwYXJzZUxpbmVUb2tlbnMgfCBudWxsIHtcblx0XHRsZXQgbG93ID0gMDtcblx0XHRsZXQgaGlnaCA9IHRoaXMuX2dldFRva2VuQ291bnQoKSAtIDE7XG5cblx0XHR3aGlsZSAobG93IDwgaGlnaCkge1xuXHRcdFx0Y29uc3QgbWlkID0gbG93ICsgTWF0aC5mbG9vcigoaGlnaCAtIGxvdykgLyAyKTtcblx0XHRcdGNvbnN0IG1pZERlbHRhTGluZSA9IHRoaXMuX2dldERlbHRhTGluZShtaWQpO1xuXG5cdFx0XHRpZiAobWlkRGVsdGFMaW5lIDwgZGVsdGFMaW5lKSB7XG5cdFx0XHRcdGxvdyA9IG1pZCArIDE7XG5cdFx0XHR9IGVsc2UgaWYgKG1pZERlbHRhTGluZSA+IGRlbHRhTGluZSkge1xuXHRcdFx0XHRoaWdoID0gbWlkIC0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBtaW4gPSBtaWQ7XG5cdFx0XHRcdHdoaWxlIChtaW4gPiBsb3cgJiYgdGhpcy5fZ2V0RGVsdGFMaW5lKG1pbiAtIDEpID09PSBkZWx0YUxpbmUpIHtcblx0XHRcdFx0XHRtaW4tLTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgbWF4ID0gbWlkO1xuXHRcdFx0XHR3aGlsZSAobWF4IDwgaGlnaCAmJiB0aGlzLl9nZXREZWx0YUxpbmUobWF4ICsgMSkgPT09IGRlbHRhTGluZSkge1xuXHRcdFx0XHRcdG1heCsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgU3BhcnNlTGluZVRva2Vucyh0aGlzLl90b2tlbnMuc3ViYXJyYXkoNCAqIG1pbiwgNCAqIG1heCArIDQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZ2V0RGVsdGFMaW5lKGxvdykgPT09IGRlbHRhTGluZSkge1xuXHRcdFx0cmV0dXJuIG5ldyBTcGFyc2VMaW5lVG9rZW5zKHRoaXMuX3Rva2Vucy5zdWJhcnJheSg0ICogbG93LCA0ICogbG93ICsgNCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rva2VuQ291bnQgPSAwO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVRva2VucyhzdGFydERlbHRhTGluZTogbnVtYmVyLCBzdGFydENoYXI6IG51bWJlciwgZW5kRGVsdGFMaW5lOiBudW1iZXIsIGVuZENoYXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGhpcy5fdG9rZW5zO1xuXHRcdGNvbnN0IHRva2VuQ291bnQgPSB0aGlzLl90b2tlbkNvdW50O1xuXHRcdGxldCBuZXdUb2tlbkNvdW50ID0gMDtcblx0XHRsZXQgaGFzRGVsZXRlZFRva2VucyA9IGZhbHNlO1xuXHRcdGxldCBmaXJzdERlbHRhTGluZSA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbkNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHNyY09mZnNldCA9IDQgKiBpO1xuXHRcdFx0Y29uc3QgdG9rZW5EZWx0YUxpbmUgPSB0b2tlbnNbc3JjT2Zmc2V0XTtcblx0XHRcdGNvbnN0IHRva2VuU3RhcnRDaGFyYWN0ZXIgPSB0b2tlbnNbc3JjT2Zmc2V0ICsgMV07XG5cdFx0XHRjb25zdCB0b2tlbkVuZENoYXJhY3RlciA9IHRva2Vuc1tzcmNPZmZzZXQgKyAyXTtcblx0XHRcdGNvbnN0IHRva2VuTWV0YWRhdGEgPSB0b2tlbnNbc3JjT2Zmc2V0ICsgM107XG5cblx0XHRcdGlmIChcblx0XHRcdFx0KHRva2VuRGVsdGFMaW5lID4gc3RhcnREZWx0YUxpbmUgfHwgKHRva2VuRGVsdGFMaW5lID09PSBzdGFydERlbHRhTGluZSAmJiB0b2tlbkVuZENoYXJhY3RlciA+PSBzdGFydENoYXIpKVxuXHRcdFx0XHQmJiAodG9rZW5EZWx0YUxpbmUgPCBlbmREZWx0YUxpbmUgfHwgKHRva2VuRGVsdGFMaW5lID09PSBlbmREZWx0YUxpbmUgJiYgdG9rZW5TdGFydENoYXJhY3RlciA8PSBlbmRDaGFyKSlcblx0XHRcdCkge1xuXHRcdFx0XHRoYXNEZWxldGVkVG9rZW5zID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChuZXdUb2tlbkNvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0Zmlyc3REZWx0YUxpbmUgPSB0b2tlbkRlbHRhTGluZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGFzRGVsZXRlZFRva2Vucykge1xuXHRcdFx0XHRcdC8vIG11c3QgbW92ZSB0aGUgdG9rZW4gdG8gdGhlIGxlZnRcblx0XHRcdFx0XHRjb25zdCBkZXN0T2Zmc2V0ID0gNCAqIG5ld1Rva2VuQ291bnQ7XG5cdFx0XHRcdFx0dG9rZW5zW2Rlc3RPZmZzZXRdID0gdG9rZW5EZWx0YUxpbmUgLSBmaXJzdERlbHRhTGluZTtcblx0XHRcdFx0XHR0b2tlbnNbZGVzdE9mZnNldCArIDFdID0gdG9rZW5TdGFydENoYXJhY3Rlcjtcblx0XHRcdFx0XHR0b2tlbnNbZGVzdE9mZnNldCArIDJdID0gdG9rZW5FbmRDaGFyYWN0ZXI7XG5cdFx0XHRcdFx0dG9rZW5zW2Rlc3RPZmZzZXQgKyAzXSA9IHRva2VuTWV0YWRhdGE7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZmlyc3REZWx0YUxpbmUgIT09IDApIHtcblx0XHRcdFx0XHQvLyBtdXN0IGFkanVzdCB0aGUgZGVsdGEgbGluZSBpbiBwbGFjZVxuXHRcdFx0XHRcdHRva2Vuc1tzcmNPZmZzZXRdID0gdG9rZW5EZWx0YUxpbmUgLSBmaXJzdERlbHRhTGluZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXdUb2tlbkNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdG9rZW5Db3VudCA9IG5ld1Rva2VuQ291bnQ7XG5cblx0XHRyZXR1cm4gZmlyc3REZWx0YUxpbmU7XG5cdH1cblxuXHRwdWJsaWMgc3BsaXQoc3RhcnREZWx0YUxpbmU6IG51bWJlciwgc3RhcnRDaGFyOiBudW1iZXIsIGVuZERlbHRhTGluZTogbnVtYmVyLCBlbmRDaGFyOiBudW1iZXIpOiBbU3BhcnNlTXVsdGlsaW5lVG9rZW5zU3RvcmFnZSwgU3BhcnNlTXVsdGlsaW5lVG9rZW5zU3RvcmFnZSwgbnVtYmVyXSB7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGhpcy5fdG9rZW5zO1xuXHRcdGNvbnN0IHRva2VuQ291bnQgPSB0aGlzLl90b2tlbkNvdW50O1xuXHRcdGNvbnN0IGFUb2tlbnM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgYlRva2VuczogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgZGVzdFRva2VuczogbnVtYmVyW10gPSBhVG9rZW5zO1xuXHRcdGxldCBkZXN0T2Zmc2V0ID0gMDtcblx0XHRsZXQgZGVzdEZpcnN0RGVsdGFMaW5lOiBudW1iZXIgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5Db3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzcmNPZmZzZXQgPSA0ICogaTtcblx0XHRcdGNvbnN0IHRva2VuRGVsdGFMaW5lID0gdG9rZW5zW3NyY09mZnNldF07XG5cdFx0XHRjb25zdCB0b2tlblN0YXJ0Q2hhcmFjdGVyID0gdG9rZW5zW3NyY09mZnNldCArIDFdO1xuXHRcdFx0Y29uc3QgdG9rZW5FbmRDaGFyYWN0ZXIgPSB0b2tlbnNbc3JjT2Zmc2V0ICsgMl07XG5cdFx0XHRjb25zdCB0b2tlbk1ldGFkYXRhID0gdG9rZW5zW3NyY09mZnNldCArIDNdO1xuXG5cdFx0XHRpZiAoKHRva2VuRGVsdGFMaW5lID4gc3RhcnREZWx0YUxpbmUgfHwgKHRva2VuRGVsdGFMaW5lID09PSBzdGFydERlbHRhTGluZSAmJiB0b2tlbkVuZENoYXJhY3RlciA+PSBzdGFydENoYXIpKSkge1xuXHRcdFx0XHRpZiAoKHRva2VuRGVsdGFMaW5lIDwgZW5kRGVsdGFMaW5lIHx8ICh0b2tlbkRlbHRhTGluZSA9PT0gZW5kRGVsdGFMaW5lICYmIHRva2VuU3RhcnRDaGFyYWN0ZXIgPD0gZW5kQ2hhcikpKSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBpcyB0b3VjaGluZyB0aGUgcmFuZ2Vcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIGlzIGFmdGVyIHRoZSByYW5nZVxuXHRcdFx0XHRcdGlmIChkZXN0VG9rZW5zICE9PSBiVG9rZW5zKSB7XG5cdFx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIGlzIHRoZSBmaXJzdCB0b2tlbiBhZnRlciB0aGUgcmFuZ2Vcblx0XHRcdFx0XHRcdGRlc3RUb2tlbnMgPSBiVG9rZW5zO1xuXHRcdFx0XHRcdFx0ZGVzdE9mZnNldCA9IDA7XG5cdFx0XHRcdFx0XHRkZXN0Rmlyc3REZWx0YUxpbmUgPSB0b2tlbkRlbHRhTGluZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZGVzdFRva2Vuc1tkZXN0T2Zmc2V0KytdID0gdG9rZW5EZWx0YUxpbmUgLSBkZXN0Rmlyc3REZWx0YUxpbmU7XG5cdFx0XHRkZXN0VG9rZW5zW2Rlc3RPZmZzZXQrK10gPSB0b2tlblN0YXJ0Q2hhcmFjdGVyO1xuXHRcdFx0ZGVzdFRva2Vuc1tkZXN0T2Zmc2V0KytdID0gdG9rZW5FbmRDaGFyYWN0ZXI7XG5cdFx0XHRkZXN0VG9rZW5zW2Rlc3RPZmZzZXQrK10gPSB0b2tlbk1ldGFkYXRhO1xuXHRcdH1cblxuXHRcdHJldHVybiBbbmV3IFNwYXJzZU11bHRpbGluZVRva2Vuc1N0b3JhZ2UobmV3IFVpbnQzMkFycmF5KGFUb2tlbnMpKSwgbmV3IFNwYXJzZU11bHRpbGluZVRva2Vuc1N0b3JhZ2UobmV3IFVpbnQzMkFycmF5KGJUb2tlbnMpKSwgZGVzdEZpcnN0RGVsdGFMaW5lXTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHREZWxldGVSYW5nZShob3Jpem9udGFsU2hpZnRGb3JGaXJzdExpbmVUb2tlbnM6IG51bWJlciwgc3RhcnREZWx0YUxpbmU6IG51bWJlciwgc3RhcnRDaGFyYWN0ZXI6IG51bWJlciwgZW5kRGVsdGFMaW5lOiBudW1iZXIsIGVuZENoYXJhY3RlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gVGhpcyBpcyBhIGJpdCBjb21wbGV4LCBoZXJlIGFyZSB0aGUgY2FzZXMgSSB1c2VkIHRvIHRoaW5rIGFib3V0IHRoaXM6XG5cdFx0Ly9cblx0XHQvLyAxLiBUaGUgdG9rZW4gc3RhcnRzIGJlZm9yZSB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHQvLyAxYS4gVGhlIHRva2VuIGlzIGNvbXBsZXRlbHkgYmVmb3JlIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdC8vICAgICAgICAgICAgICAgLS0tLS0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgICAgeHh4eHh4eHh4eHhcblx0XHQvLyAxYi4gVGhlIHRva2VuIHN0YXJ0cyBiZWZvcmUsIHRoZSBkZWxldGlvbiByYW5nZSBlbmRzIGFmdGVyIHRoZSB0b2tlblxuXHRcdC8vICAgICAgICAgICAgICAgLS0tLS0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICB4eHh4eHh4eHh4eFxuXHRcdC8vIDFjLiBUaGUgdG9rZW4gc3RhcnRzIGJlZm9yZSwgdGhlIGRlbGV0aW9uIHJhbmdlIGVuZHMgcHJlY2lzZWx5IHdpdGggdGhlIHRva2VuXG5cdFx0Ly8gICAgICAgICAgICAgICAtLS0tLS0tLS0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICB4eHh4eHh4eFxuXHRcdC8vIDFkLiBUaGUgdG9rZW4gc3RhcnRzIGJlZm9yZSwgdGhlIGRlbGV0aW9uIHJhbmdlIGlzIGluc2lkZSB0aGUgdG9rZW5cblx0XHQvLyAgICAgICAgICAgICAgIC0tLS0tLS0tLS0tLS0tLVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICB4eHh4eFxuXHRcdC8vXG5cdFx0Ly8gMi4gVGhlIHRva2VuIHN0YXJ0cyBhdCB0aGUgc2FtZSBwb3NpdGlvbiB3aXRoIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdC8vIDJhLiBUaGUgdG9rZW4gc3RhcnRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uLCBhbmQgZW5kcyBpbnNpZGUgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0Ly8gICAgICAgICAgICAgICAtLS0tLS0tXG5cdFx0Ly8gICAgICAgICAgICAgICB4eHh4eHh4eHh4eFxuXHRcdC8vIDJiLiBUaGUgdG9rZW4gc3RhcnRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uLCBhbmQgZW5kcyBhdCB0aGUgc2FtZSBwb3NpdGlvbiBhcyB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHQvLyAgICAgICAgICAgICAgIC0tLS0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICAgIHh4eHh4eHh4eHhcblx0XHQvLyAyYy4gVGhlIHRva2VuIHN0YXJ0cyBhdCB0aGUgc2FtZSBwb3NpdGlvbiwgYW5kIGVuZHMgYWZ0ZXIgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0Ly8gICAgICAgICAgICAgICAtLS0tLS0tLS0tLS0tXG5cdFx0Ly8gICAgICAgICAgICAgICB4eHh4eHh4XG5cdFx0Ly9cblx0XHQvLyAzLiBUaGUgdG9rZW4gc3RhcnRzIGluc2lkZSB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHQvLyAzYS4gVGhlIHRva2VuIGlzIGluc2lkZSB0aGUgZGVsZXRpb24gcmFuZ2Vcblx0XHQvLyAgICAgICAgICAgICAgICAtLS0tLS0tXG5cdFx0Ly8gICAgICAgICAgICAgeHh4eHh4eHh4eHh4eFxuXHRcdC8vIDNiLiBUaGUgdG9rZW4gc3RhcnRzIGluc2lkZSB0aGUgZGVsZXRpb24gcmFuZ2UsIGFuZCBlbmRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uIGFzIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdC8vICAgICAgICAgICAgICAgIC0tLS0tLS0tLS1cblx0XHQvLyAgICAgICAgICAgICB4eHh4eHh4eHh4eHh4XG5cdFx0Ly8gM2MuIFRoZSB0b2tlbiBzdGFydHMgaW5zaWRlIHRoZSBkZWxldGlvbiByYW5nZSwgYW5kIGVuZHMgYWZ0ZXIgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0Ly8gICAgICAgICAgICAgICAgLS0tLS0tLS0tLS0tXG5cdFx0Ly8gICAgICAgICAgICAgeHh4eHh4eHh4eHhcblx0XHQvL1xuXHRcdC8vIDQuIFRoZSB0b2tlbiBzdGFydHMgYWZ0ZXIgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0Ly8gICAgICAgICAgICAgICAgICAtLS0tLS0tLS0tLVxuXHRcdC8vICAgICAgICAgIHh4eHh4eHh4XG5cdFx0Ly9cblx0XHRjb25zdCB0b2tlbnMgPSB0aGlzLl90b2tlbnM7XG5cdFx0Y29uc3QgdG9rZW5Db3VudCA9IHRoaXMuX3Rva2VuQ291bnQ7XG5cdFx0Y29uc3QgZGVsZXRlZExpbmVDb3VudCA9IChlbmREZWx0YUxpbmUgLSBzdGFydERlbHRhTGluZSk7XG5cdFx0bGV0IG5ld1Rva2VuQ291bnQgPSAwO1xuXHRcdGxldCBoYXNEZWxldGVkVG9rZW5zID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbkNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHNyY09mZnNldCA9IDQgKiBpO1xuXHRcdFx0bGV0IHRva2VuRGVsdGFMaW5lID0gdG9rZW5zW3NyY09mZnNldF07XG5cdFx0XHRsZXQgdG9rZW5TdGFydENoYXJhY3RlciA9IHRva2Vuc1tzcmNPZmZzZXQgKyAxXTtcblx0XHRcdGxldCB0b2tlbkVuZENoYXJhY3RlciA9IHRva2Vuc1tzcmNPZmZzZXQgKyAyXTtcblx0XHRcdGNvbnN0IHRva2VuTWV0YWRhdGEgPSB0b2tlbnNbc3JjT2Zmc2V0ICsgM107XG5cblx0XHRcdGlmICh0b2tlbkRlbHRhTGluZSA8IHN0YXJ0RGVsdGFMaW5lIHx8ICh0b2tlbkRlbHRhTGluZSA9PT0gc3RhcnREZWx0YUxpbmUgJiYgdG9rZW5FbmRDaGFyYWN0ZXIgPD0gc3RhcnRDaGFyYWN0ZXIpKSB7XG5cdFx0XHRcdC8vIDFhLiBUaGUgdG9rZW4gaXMgY29tcGxldGVseSBiZWZvcmUgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0XHRcdC8vID0+IG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0bmV3VG9rZW5Db3VudCsrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH0gZWxzZSBpZiAodG9rZW5EZWx0YUxpbmUgPT09IHN0YXJ0RGVsdGFMaW5lICYmIHRva2VuU3RhcnRDaGFyYWN0ZXIgPCBzdGFydENoYXJhY3Rlcikge1xuXHRcdFx0XHQvLyAxYiwgMWMsIDFkXG5cdFx0XHRcdC8vID0+IHRoZSB0b2tlbiBzdXJ2aXZlcywgYnV0IGl0IG5lZWRzIHRvIHNocmlua1xuXHRcdFx0XHRpZiAodG9rZW5EZWx0YUxpbmUgPT09IGVuZERlbHRhTGluZSAmJiB0b2tlbkVuZENoYXJhY3RlciA+IGVuZENoYXJhY3Rlcikge1xuXHRcdFx0XHRcdC8vIDFkLiBUaGUgdG9rZW4gc3RhcnRzIGJlZm9yZSwgdGhlIGRlbGV0aW9uIHJhbmdlIGlzIGluc2lkZSB0aGUgdG9rZW5cblx0XHRcdFx0XHQvLyA9PiB0aGUgdG9rZW4gc2hyaW5rcyBieSB0aGUgZGVsZXRpb24gY2hhcmFjdGVyIGNvdW50XG5cdFx0XHRcdFx0dG9rZW5FbmRDaGFyYWN0ZXIgLT0gKGVuZENoYXJhY3RlciAtIHN0YXJ0Q2hhcmFjdGVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyAxYi4gVGhlIHRva2VuIHN0YXJ0cyBiZWZvcmUsIHRoZSBkZWxldGlvbiByYW5nZSBlbmRzIGFmdGVyIHRoZSB0b2tlblxuXHRcdFx0XHRcdC8vIDFjLiBUaGUgdG9rZW4gc3RhcnRzIGJlZm9yZSwgdGhlIGRlbGV0aW9uIHJhbmdlIGVuZHMgcHJlY2lzZWx5IHdpdGggdGhlIHRva2VuXG5cdFx0XHRcdFx0Ly8gPT4gdGhlIHRva2VuIHNocmlua3MgaXRzIGVuZGluZyB0byB0aGUgZGVsZXRpb24gc3RhcnRcblx0XHRcdFx0XHR0b2tlbkVuZENoYXJhY3RlciA9IHN0YXJ0Q2hhcmFjdGVyO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHRva2VuRGVsdGFMaW5lID09PSBzdGFydERlbHRhTGluZSAmJiB0b2tlblN0YXJ0Q2hhcmFjdGVyID09PSBzdGFydENoYXJhY3Rlcikge1xuXHRcdFx0XHQvLyAyYSwgMmIsIDJjXG5cdFx0XHRcdGlmICh0b2tlbkRlbHRhTGluZSA9PT0gZW5kRGVsdGFMaW5lICYmIHRva2VuRW5kQ2hhcmFjdGVyID4gZW5kQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdFx0Ly8gMmMuIFRoZSB0b2tlbiBzdGFydHMgYXQgdGhlIHNhbWUgcG9zaXRpb24sIGFuZCBlbmRzIGFmdGVyIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdFx0XHRcdC8vID0+IHRoZSB0b2tlbiBzaHJpbmtzIGJ5IHRoZSBkZWxldGlvbiBjaGFyYWN0ZXIgY291bnRcblx0XHRcdFx0XHR0b2tlbkVuZENoYXJhY3RlciAtPSAoZW5kQ2hhcmFjdGVyIC0gc3RhcnRDaGFyYWN0ZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIDJhLiBUaGUgdG9rZW4gc3RhcnRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uLCBhbmQgZW5kcyBpbnNpZGUgdGhlIGRlbGV0aW9uIHJhbmdlXG5cdFx0XHRcdFx0Ly8gMmIuIFRoZSB0b2tlbiBzdGFydHMgYXQgdGhlIHNhbWUgcG9zaXRpb24sIGFuZCBlbmRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uIGFzIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdFx0XHRcdC8vID0+IHRoZSB0b2tlbiBpcyBkZWxldGVkXG5cdFx0XHRcdFx0aGFzRGVsZXRlZFRva2VucyA9IHRydWU7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodG9rZW5EZWx0YUxpbmUgPCBlbmREZWx0YUxpbmUgfHwgKHRva2VuRGVsdGFMaW5lID09PSBlbmREZWx0YUxpbmUgJiYgdG9rZW5TdGFydENoYXJhY3RlciA8IGVuZENoYXJhY3RlcikpIHtcblx0XHRcdFx0Ly8gM2EsIDNiLCAzY1xuXHRcdFx0XHRpZiAodG9rZW5EZWx0YUxpbmUgPT09IGVuZERlbHRhTGluZSAmJiB0b2tlbkVuZENoYXJhY3RlciA+IGVuZENoYXJhY3Rlcikge1xuXHRcdFx0XHRcdC8vIDNjLiBUaGUgdG9rZW4gc3RhcnRzIGluc2lkZSB0aGUgZGVsZXRpb24gcmFuZ2UsIGFuZCBlbmRzIGFmdGVyIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdFx0XHRcdC8vID0+IHRoZSB0b2tlbiBtb3ZlcyB0byBjb250aW51ZSByaWdodCBhZnRlciB0aGUgZGVsZXRpb25cblx0XHRcdFx0XHR0b2tlbkRlbHRhTGluZSA9IHN0YXJ0RGVsdGFMaW5lO1xuXHRcdFx0XHRcdHRva2VuU3RhcnRDaGFyYWN0ZXIgPSBzdGFydENoYXJhY3Rlcjtcblx0XHRcdFx0XHR0b2tlbkVuZENoYXJhY3RlciA9IHRva2VuU3RhcnRDaGFyYWN0ZXIgKyAodG9rZW5FbmRDaGFyYWN0ZXIgLSBlbmRDaGFyYWN0ZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIDNhLiBUaGUgdG9rZW4gaXMgaW5zaWRlIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdFx0XHRcdC8vIDNiLiBUaGUgdG9rZW4gc3RhcnRzIGluc2lkZSB0aGUgZGVsZXRpb24gcmFuZ2UsIGFuZCBlbmRzIGF0IHRoZSBzYW1lIHBvc2l0aW9uIGFzIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdFx0XHRcdC8vID0+IHRoZSB0b2tlbiBpcyBkZWxldGVkXG5cdFx0XHRcdFx0aGFzRGVsZXRlZFRva2VucyA9IHRydWU7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodG9rZW5EZWx0YUxpbmUgPiBlbmREZWx0YUxpbmUpIHtcblx0XHRcdFx0Ly8gNC4gKHBhcnRpYWwpIFRoZSB0b2tlbiBzdGFydHMgYWZ0ZXIgdGhlIGRlbGV0aW9uIHJhbmdlLCBvbiBhIGxpbmUgYmVsb3cuLi5cblx0XHRcdFx0aWYgKGRlbGV0ZWRMaW5lQ291bnQgPT09IDAgJiYgIWhhc0RlbGV0ZWRUb2tlbnMpIHtcblx0XHRcdFx0XHQvLyBlYXJseSBzdG9wLCB0aGVyZSBpcyBubyBuZWVkIHRvIHdhbGsgYWxsIHRoZSB0b2tlbnMgYW5kIGRvIG5vdGhpbmcuLi5cblx0XHRcdFx0XHRuZXdUb2tlbkNvdW50ID0gdG9rZW5Db3VudDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHR0b2tlbkRlbHRhTGluZSAtPSBkZWxldGVkTGluZUNvdW50O1xuXHRcdFx0fSBlbHNlIGlmICh0b2tlbkRlbHRhTGluZSA9PT0gZW5kRGVsdGFMaW5lICYmIHRva2VuU3RhcnRDaGFyYWN0ZXIgPj0gZW5kQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdC8vIDQuIChjb250aW51ZWQpIFRoZSB0b2tlbiBzdGFydHMgYWZ0ZXIgdGhlIGRlbGV0aW9uIHJhbmdlLCBvbiB0aGUgbGFzdCBsaW5lIHdoZXJlIGEgZGVsZXRpb24gb2NjdXJzXG5cdFx0XHRcdGlmIChob3Jpem9udGFsU2hpZnRGb3JGaXJzdExpbmVUb2tlbnMgJiYgdG9rZW5EZWx0YUxpbmUgPT09IDApIHtcblx0XHRcdFx0XHR0b2tlblN0YXJ0Q2hhcmFjdGVyICs9IGhvcml6b250YWxTaGlmdEZvckZpcnN0TGluZVRva2Vucztcblx0XHRcdFx0XHR0b2tlbkVuZENoYXJhY3RlciArPSBob3Jpem9udGFsU2hpZnRGb3JGaXJzdExpbmVUb2tlbnM7XG5cdFx0XHRcdH1cblx0XHRcdFx0dG9rZW5EZWx0YUxpbmUgLT0gZGVsZXRlZExpbmVDb3VudDtcblx0XHRcdFx0dG9rZW5TdGFydENoYXJhY3RlciAtPSAoZW5kQ2hhcmFjdGVyIC0gc3RhcnRDaGFyYWN0ZXIpO1xuXHRcdFx0XHR0b2tlbkVuZENoYXJhY3RlciAtPSAoZW5kQ2hhcmFjdGVyIC0gc3RhcnRDaGFyYWN0ZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBOb3QgcG9zc2libGUhYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlc3RPZmZzZXQgPSA0ICogbmV3VG9rZW5Db3VudDtcblx0XHRcdHRva2Vuc1tkZXN0T2Zmc2V0XSA9IHRva2VuRGVsdGFMaW5lO1xuXHRcdFx0dG9rZW5zW2Rlc3RPZmZzZXQgKyAxXSA9IHRva2VuU3RhcnRDaGFyYWN0ZXI7XG5cdFx0XHR0b2tlbnNbZGVzdE9mZnNldCArIDJdID0gdG9rZW5FbmRDaGFyYWN0ZXI7XG5cdFx0XHR0b2tlbnNbZGVzdE9mZnNldCArIDNdID0gdG9rZW5NZXRhZGF0YTtcblx0XHRcdG5ld1Rva2VuQ291bnQrKztcblx0XHR9XG5cblx0XHR0aGlzLl90b2tlbkNvdW50ID0gbmV3VG9rZW5Db3VudDtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRJbnNlcnRUZXh0KGRlbHRhTGluZTogbnVtYmVyLCBjaGFyYWN0ZXI6IG51bWJlciwgZW9sQ291bnQ6IG51bWJlciwgZmlyc3RMaW5lTGVuZ3RoOiBudW1iZXIsIGxhc3RMaW5lTGVuZ3RoOiBudW1iZXIsIGZpcnN0Q2hhckNvZGU6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIEhlcmUgYXJlIHRoZSBjYXNlcyBJIHVzZWQgdG8gdGhpbmsgYWJvdXQgdGhpczpcblx0XHQvL1xuXHRcdC8vIDEuIFRoZSB0b2tlbiBpcyBjb21wbGV0ZWx5IGJlZm9yZSB0aGUgaW5zZXJ0aW9uIHBvaW50XG5cdFx0Ly8gICAgICAgICAgICAtLS0tLS0tLS0tLSAgIHxcblx0XHQvLyAyLiBUaGUgdG9rZW4gZW5kcyBwcmVjaXNlbHkgYXQgdGhlIGluc2VydGlvbiBwb2ludFxuXHRcdC8vICAgICAgICAgICAgLS0tLS0tLS0tLS18XG5cdFx0Ly8gMy4gVGhlIHRva2VuIGNvbnRhaW5zIHRoZSBpbnNlcnRpb24gcG9pbnRcblx0XHQvLyAgICAgICAgICAgIC0tLS0tfC0tLS0tLVxuXHRcdC8vIDQuIFRoZSB0b2tlbiBzdGFydHMgcHJlY2lzZWx5IGF0IHRoZSBpbnNlcnRpb24gcG9pbnRcblx0XHQvLyAgICAgICAgICAgIHwtLS0tLS0tLS0tLVxuXHRcdC8vIDUuIFRoZSB0b2tlbiBpcyBjb21wbGV0ZWx5IGFmdGVyIHRoZSBpbnNlcnRpb24gcG9pbnRcblx0XHQvLyAgICAgICAgICAgIHwgICAtLS0tLS0tLS0tLVxuXHRcdC8vXG5cdFx0Y29uc3QgaXNJbnNlcnRpbmdQcmVjaXNlbHlPbmVXb3JkQ2hhcmFjdGVyID0gKFxuXHRcdFx0ZW9sQ291bnQgPT09IDBcblx0XHRcdCYmIGZpcnN0TGluZUxlbmd0aCA9PT0gMVxuXHRcdFx0JiYgKFxuXHRcdFx0XHQoZmlyc3RDaGFyQ29kZSA+PSBDaGFyQ29kZS5EaWdpdDAgJiYgZmlyc3RDaGFyQ29kZSA8PSBDaGFyQ29kZS5EaWdpdDkpXG5cdFx0XHRcdHx8IChmaXJzdENoYXJDb2RlID49IENoYXJDb2RlLkEgJiYgZmlyc3RDaGFyQ29kZSA8PSBDaGFyQ29kZS5aKVxuXHRcdFx0XHR8fCAoZmlyc3RDaGFyQ29kZSA+PSBDaGFyQ29kZS5hICYmIGZpcnN0Q2hhckNvZGUgPD0gQ2hhckNvZGUueilcblx0XHRcdClcblx0XHQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRoaXMuX3Rva2Vucztcblx0XHRjb25zdCB0b2tlbkNvdW50ID0gdGhpcy5fdG9rZW5Db3VudDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRva2VuQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gNCAqIGk7XG5cdFx0XHRsZXQgdG9rZW5EZWx0YUxpbmUgPSB0b2tlbnNbb2Zmc2V0XTtcblx0XHRcdGxldCB0b2tlblN0YXJ0Q2hhcmFjdGVyID0gdG9rZW5zW29mZnNldCArIDFdO1xuXHRcdFx0bGV0IHRva2VuRW5kQ2hhcmFjdGVyID0gdG9rZW5zW29mZnNldCArIDJdO1xuXG5cdFx0XHRpZiAodG9rZW5EZWx0YUxpbmUgPCBkZWx0YUxpbmUgfHwgKHRva2VuRGVsdGFMaW5lID09PSBkZWx0YUxpbmUgJiYgdG9rZW5FbmRDaGFyYWN0ZXIgPCBjaGFyYWN0ZXIpKSB7XG5cdFx0XHRcdC8vIDEuIFRoZSB0b2tlbiBpcyBjb21wbGV0ZWx5IGJlZm9yZSB0aGUgaW5zZXJ0aW9uIHBvaW50XG5cdFx0XHRcdC8vID0+IG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9IGVsc2UgaWYgKHRva2VuRGVsdGFMaW5lID09PSBkZWx0YUxpbmUgJiYgdG9rZW5FbmRDaGFyYWN0ZXIgPT09IGNoYXJhY3Rlcikge1xuXHRcdFx0XHQvLyAyLiBUaGUgdG9rZW4gZW5kcyBwcmVjaXNlbHkgYXQgdGhlIGluc2VydGlvbiBwb2ludFxuXHRcdFx0XHQvLyA9PiBleHBhbmQgdGhlIGVuZCBjaGFyYWN0ZXIgb25seSBpZiBpbnNlcnRpbmcgcHJlY2lzZWx5IG9uZSBjaGFyYWN0ZXIgdGhhdCBpcyBhIHdvcmQgY2hhcmFjdGVyXG5cdFx0XHRcdGlmIChpc0luc2VydGluZ1ByZWNpc2VseU9uZVdvcmRDaGFyYWN0ZXIpIHtcblx0XHRcdFx0XHR0b2tlbkVuZENoYXJhY3RlciArPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHRva2VuRGVsdGFMaW5lID09PSBkZWx0YUxpbmUgJiYgdG9rZW5TdGFydENoYXJhY3RlciA8IGNoYXJhY3RlciAmJiBjaGFyYWN0ZXIgPCB0b2tlbkVuZENoYXJhY3Rlcikge1xuXHRcdFx0XHQvLyAzLiBUaGUgdG9rZW4gY29udGFpbnMgdGhlIGluc2VydGlvbiBwb2ludFxuXHRcdFx0XHRpZiAoZW9sQ291bnQgPT09IDApIHtcblx0XHRcdFx0XHQvLyA9PiBqdXN0IGV4cGFuZCB0aGUgZW5kIGNoYXJhY3RlclxuXHRcdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyICs9IGZpcnN0TGluZUxlbmd0aDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyA9PiBjdXQgb2ZmIHRoZSB0b2tlblxuXHRcdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyID0gY2hhcmFjdGVyO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyA0LiBvciA1LlxuXHRcdFx0XHRpZiAodG9rZW5EZWx0YUxpbmUgPT09IGRlbHRhTGluZSAmJiB0b2tlblN0YXJ0Q2hhcmFjdGVyID09PSBjaGFyYWN0ZXIpIHtcblx0XHRcdFx0XHQvLyA0LiBUaGUgdG9rZW4gc3RhcnRzIHByZWNpc2VseSBhdCB0aGUgaW5zZXJ0aW9uIHBvaW50XG5cdFx0XHRcdFx0Ly8gPT4gZ3JvdyB0aGUgdG9rZW4gKGJ5IGtlZXBpbmcgaXRzIHN0YXJ0IGNvbnN0YW50KSBvbmx5IGlmIGluc2VydGluZyBwcmVjaXNlbHkgb25lIGNoYXJhY3RlciB0aGF0IGlzIGEgd29yZCBjaGFyYWN0ZXJcblx0XHRcdFx0XHQvLyA9PiBvdGhlcndpc2UgYmVoYXZlIGFzIGluIGNhc2UgNS5cblx0XHRcdFx0XHRpZiAoaXNJbnNlcnRpbmdQcmVjaXNlbHlPbmVXb3JkQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gPT4gdGhlIHRva2VuIG11c3QgbW92ZSBhbmQga2VlcCBpdHMgc2l6ZSBjb25zdGFudFxuXHRcdFx0XHRpZiAodG9rZW5EZWx0YUxpbmUgPT09IGRlbHRhTGluZSkge1xuXHRcdFx0XHRcdHRva2VuRGVsdGFMaW5lICs9IGVvbENvdW50O1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gaXMgb24gdGhlIGxpbmUgd2hlcmUgdGhlIGluc2VydGlvbiBpcyB0YWtpbmcgcGxhY2Vcblx0XHRcdFx0XHRpZiAoZW9sQ291bnQgPT09IDApIHtcblx0XHRcdFx0XHRcdHRva2VuU3RhcnRDaGFyYWN0ZXIgKz0gZmlyc3RMaW5lTGVuZ3RoO1xuXHRcdFx0XHRcdFx0dG9rZW5FbmRDaGFyYWN0ZXIgKz0gZmlyc3RMaW5lTGVuZ3RoO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbkxlbmd0aCA9IHRva2VuRW5kQ2hhcmFjdGVyIC0gdG9rZW5TdGFydENoYXJhY3Rlcjtcblx0XHRcdFx0XHRcdHRva2VuU3RhcnRDaGFyYWN0ZXIgPSBsYXN0TGluZUxlbmd0aCArICh0b2tlblN0YXJ0Q2hhcmFjdGVyIC0gY2hhcmFjdGVyKTtcblx0XHRcdFx0XHRcdHRva2VuRW5kQ2hhcmFjdGVyID0gdG9rZW5TdGFydENoYXJhY3RlciArIHRva2VuTGVuZ3RoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0b2tlbkRlbHRhTGluZSArPSBlb2xDb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0b2tlbnNbb2Zmc2V0XSA9IHRva2VuRGVsdGFMaW5lO1xuXHRcdFx0dG9rZW5zW29mZnNldCArIDFdID0gdG9rZW5TdGFydENoYXJhY3Rlcjtcblx0XHRcdHRva2Vuc1tvZmZzZXQgKyAyXSA9IHRva2VuRW5kQ2hhcmFjdGVyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yYXRlTGltaXRlciA9IG5ldyBSYXRlTGltaXRlcigxMCAvIDYwKTsgLy8gbGltaXQgdG8gMTAgdGltZXMgcGVyIG1pbnV0ZVxuXG5cdHB1YmxpYyByZXBvcnRJZkludmFsaWQobW9kZWw6IElUZXh0TW9kZWwsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl90b2tlbkNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSB0aGlzLl9nZXREZWx0YUxpbmUoaSkgKyBzdGFydExpbmVOdW1iZXI7XG5cblx0XHRcdGlmIChsaW5lTnVtYmVyIDwgMSkge1xuXHRcdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnNTdG9yYWdlLl9yYXRlTGltaXRlci5ydW5JZk5vdExpbWl0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgU2VtYW50aWMgVG9rZW5zIERhdGEgRnJvbSBFeHRlbnNpb246IGxpbmVOdW1iZXIgPCAxJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChsaW5lTnVtYmVyID4gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zU3RvcmFnZS5fcmF0ZUxpbWl0ZXIucnVuSWZOb3RMaW1pdGVkKCgpID0+IHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdJbnZhbGlkIFNlbWFudGljIFRva2VucyBEYXRhIEZyb20gRXh0ZW5zaW9uOiBsaW5lTnVtYmVyID4gbW9kZWwuZ2V0TGluZUNvdW50KCknKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2dldEVuZENoYXJhY3RlcihpKSA+IG1vZGVsLmdldExpbmVMZW5ndGgobGluZU51bWJlcikpIHtcblx0XHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zU3RvcmFnZS5fcmF0ZUxpbWl0ZXIucnVuSWZOb3RMaW1pdGVkKCgpID0+IHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdJbnZhbGlkIFNlbWFudGljIFRva2VucyBEYXRhIEZyb20gRXh0ZW5zaW9uOiBlbmQgY2hhcmFjdGVyID4gbW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKScpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNwYXJzZUxpbmVUb2tlbnMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuczogVWludDMyQXJyYXk7XG5cblx0Y29uc3RydWN0b3IodG9rZW5zOiBVaW50MzJBcnJheSkge1xuXHRcdHRoaXMuX3Rva2VucyA9IHRva2Vucztcblx0fVxuXG5cdHB1YmxpYyBnZXRDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnMubGVuZ3RoIC8gNDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGFydENoYXJhY3Rlcih0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbNCAqIHRva2VuSW5kZXggKyAxXTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmRDaGFyYWN0ZXIodG9rZW5JbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zWzQgKiB0b2tlbkluZGV4ICsgMl07XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWV0YWRhdGEodG9rZW5JbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zWzQgKiB0b2tlbkluZGV4ICsgM107XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWlCLGFBQWE7QUFDOUIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxtQkFBbUI7QUFLckIsTUFBTSxzQkFBc0I7QUFBQSxFQUVsQyxPQUFjLE9BQU8saUJBQXlCLFFBQTRDO0FBQ3pGLFdBQU8sSUFBSSxzQkFBc0IsaUJBQWlCLElBQUksNkJBQTZCLE1BQU0sQ0FBQztBQUFBLEVBQzNGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSxJQUFXLGtCQUEwQjtBQUNwQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFXLGdCQUF3QjtBQUNsQyxXQUFPLEtBQUs7QUFB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
