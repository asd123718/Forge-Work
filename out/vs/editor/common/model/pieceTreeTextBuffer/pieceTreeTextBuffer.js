import { Emitter } from "../../../../base/common/event.js";
import * as strings from "../../../../base/common/strings.js";
import { Range } from "../../core/range.js";
import { ApplyEditsResult, EndOfLinePreference } from "../../model.js";
import { PieceTreeBase } from "./pieceTreeBase.js";
import { countEOL, StringEOL } from "../../core/misc/eolCounter.js";
import { TextChange } from "../../core/textChange.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
class PieceTreeTextBuffer extends Disposable {
  constructor(chunks, BOM, eol, containsRTL, containsUnusualLineTerminators, isBasicASCII, eolNormalized) {
    super();
    this._onDidChangeContent = this._register(new Emitter());
    this._BOM = BOM;
    this._mightContainNonBasicASCII = !isBasicASCII;
    this._mightContainRTL = containsRTL;
    this._mightContainUnusualLineTerminators = containsUnusualLineTerminators;
    this._pieceTree = new PieceTreeBase(chunks, eol, eolNormalized);
  }
  get onDidChangeContent() {
    return this._onDidChangeContent.event;
  }
  // #region TextBuffer
  equals(other) {
    if (!(other instanceof PieceTreeTextBuffer)) {
      return false;
    }
    if (this._BOM !== other._BOM) {
      return false;
    }
    if (this.getEOL() !== other.getEOL()) {
      return false;
    }
    return this._pieceTree.equal(other._pieceTree);
  }
  mightContainRTL() {
    return this._mightContainRTL;
  }
  mightContainUnusualLineTerminators() {
    return this._mightContainUnusualLineTerminators;
  }
  resetMightContainUnusualLineTerminators() {
    this._mightContainUnusualLineTerminators = false;
  }
  mightContainNonBasicASCII() {
    return this._mightContainNonBasicASCII;
  }
  getBOM() {
    return this._BOM;
  }
  getEOL() {
    return this._pieceTree.getEOL();
  }
  createSnapshot(preserveBOM) {
    return this._pieceTree.createSnapshot(preserveBOM ? this._BOM : "");
  }
  getOffsetAt(lineNumber, column) {
    return this._pieceTree.getOffsetAt(lineNumber, column);
  }
  getPositionAt(offset) {
    return this._pieceTree.getPositionAt(offset);
  }
  getRangeAt(start, length) {
    const end = start + length;
    const startPosition = this.getPositionAt(start);
    const endPosition = this.getPositionAt(end);
    return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
  }
  getValueInRange(range, eol = EndOfLinePreference.TextDefined) {
    if (range.isEmpty()) {
      return "";
    }
    const lineEnding = this._getEndOfLine(eol);
    return this._pieceTree.getValueInRange(range, lineEnding);
  }
  getValueLengthInRange(range, eol = EndOfLinePreference.TextDefined) {
    if (range.isEmpty()) {
      return 0;
    }
    if (range.startLineNumber === range.endLineNumber) {
      return range.endColumn - range.startColumn;
    }
    const startOffset = this.getOffsetAt(range.startLineNumber, range.startColumn);
    const endOffset = this.getOffsetAt(range.endLineNumber, range.endColumn);
    let eolOffsetCompensation = 0;
    const desiredEOL = this._getEndOfLine(eol);
    const actualEOL = this.getEOL();
    if (desiredEOL.length !== actualEOL.length) {
      const delta = desiredEOL.length - actualEOL.length;
      const eolCount = range.endLineNumber - range.startLineNumber;
      eolOffsetCompensation = delta * eolCount;
    }
    return endOffset - startOffset + eolOffsetCompensation;
  }
  getCharacterCountInRange(range, eol = EndOfLinePreference.TextDefined) {
    if (this._mightContainNonBasicASCII) {
      let result = 0;
      const fromLineNumber = range.startLineNumber;
      const toLineNumber = range.endLineNumber;
      for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
        const lineContent = this.getLineContent(lineNumber);
        const fromOffset = lineNumber === fromLineNumber ? range.startColumn - 1 : 0;
        const toOffset = lineNumber === toLineNumber ? range.endColumn - 1 : lineContent.length;
        for (let offset = fromOffset; offset < toOffset; offset++) {
          if (strings.isHighSurrogate(lineContent.charCodeAt(offset))) {
            result = result + 1;
            offset = offset + 1;
          } else {
            result = result + 1;
          }
        }
      }
      result += this._getEndOfLine(eol).length * (toLineNumber - fromLineNumber);
      return result;
    }
    return this.getValueLengthInRange(range, eol);
  }
  getNearestChunk(offset) {
    return this._pieceTree.getNearestChunk(offset);
  }
  getLength() {
    return this._pieceTree.getLength();
  }
  getLineCount() {
    return this._pieceTree.getLineCount();
  }
  getLinesContent() {
    return this._pieceTree.getLinesContent();
  }
  getLineContent(lineNumber) {
    return this._pieceTree.getLineContent(lineNumber);
  }
  getLineCharCode(lineNumber, index) {
    return this._pieceTree.getLineCharCode(lineNumber, index);
  }
  getCharCode(offset) {
    return this._pieceTree.getCharCode(offset);
  }
  getLineLength(lineNumber) {
    return this._pieceTree.getLineLength(lineNumber);
  }
  getLineMinColumn(lineNumber) {
    return 1;
  }
  getLineMaxColumn(lineNumber) {
    return this.getLineLength(lineNumber) + 1;
  }
  getLineFirstNonWhitespaceColumn(lineNumber) {
    const result = strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
    if (result === -1) {
      return 0;
    }
    return result + 1;
  }
  getLineLastNonWhitespaceColumn(lineNumber) {
    const result = strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
    if (result === -1) {
      return 0;
    }
    return result + 2;
  }
  _getEndOfLine(eol) {
    switch (eol) {
      case EndOfLinePreference.LF:
        return "\n";
      case EndOfLinePreference.CRLF:
        return "\r\n";
      case EndOfLinePreference.TextDefined:
        return this.getEOL();
      default:
        throw new Error("Unknown EOL preference");
    }
  }
  setEOL(newEOL) {
    this._pieceTree.setEOL(newEOL);
  }
  applyEdits(rawOperations, recordTrimAutoWhitespace, computeUndoEdits) {
    let mightContainRTL = this._mightContainRTL;
    let mightContainUnusualLineTerminators = this._mightContainUnusualLineTerminators;
    let mightContainNonBasicASCII = this._mightContainNonBasicASCII;
    let canReduceOperations = true;
    let operations = [];
    for (let i = 0; i < rawOperations.length; i++) {
      const op = rawOperations[i];
      if (canReduceOperations && op._isTracked) {
        canReduceOperations = false;
      }
      const validatedRange = op.range;
      if (op.text) {
        let textMightContainNonBasicASCII = true;
        if (!mightContainNonBasicASCII) {
          textMightContainNonBasicASCII = !strings.isBasicASCII(op.text);
          mightContainNonBasicASCII = textMightContainNonBasicASCII;
        }
        if (!mightContainRTL && textMightContainNonBasicASCII) {
          mightContainRTL = strings.containsRTL(op.text);
        }
        if (!mightContainUnusualLineTerminators && textMightContainNonBasicASCII) {
          mightContainUnusualLineTerminators = strings.containsUnusualLineTerminators(op.text);
        }
      }
      let validText = "";
      let eolCount = 0;
      let firstLineLength = 0;
      let lastLineLength = 0;
      if (op.text) {
        let strEOL;
        [eolCount, firstLineLength, lastLineLength, strEOL] = countEOL(op.text);
        const bufferEOL = this.getEOL();
        const expectedStrEOL = bufferEOL === "\r\n" ? StringEOL.CRLF : StringEOL.LF;
        if (strEOL === StringEOL.Unknown || strEOL === expectedStrEOL) {
          validText = op.text;
        } else {
          validText = op.text.replace(/\r\n|\r|\n/g, bufferEOL);
        }
      }
      operations[i] = {
        sortIndex: i,
        identifier: op.identifier || null,
        range: validatedRange,
        rangeOffset: this.getOffsetAt(validatedRange.startLineNumber, validatedRange.startColumn),
        rangeLength: this.getValueLengthInRange(validatedRange),
        text: validText,
        eolCount,
        firstLineLength,
        lastLineLength,
        forceMoveMarkers: Boolean(op.forceMoveMarkers),
        isAutoWhitespaceEdit: op.isAutoWhitespaceEdit || false
      };
    }
    operations.sort(PieceTreeTextBuffer._sortOpsAscending);
    let hasTouchingRanges = false;
    for (let i = 0, count = operations.length - 1; i < count; i++) {
      const rangeEnd = operations[i].range.getEndPosition();
      const nextRangeStart = operations[i + 1].range.getStartPosition();
      if (nextRangeStart.isBeforeOrEqual(rangeEnd)) {
        if (nextRangeStart.isBefore(rangeEnd)) {
          throw new Error("Overlapping ranges are not allowed!");
        }
        hasTouchingRanges = true;
      }
    }
    if (canReduceOperations) {
      operations = this._reduceOperations(operations);
    }
    const reverseRanges = computeUndoEdits || recordTrimAutoWhitespace ? PieceTreeTextBuffer._getInverseEditRanges(operations) : [];
    const newTrimAutoWhitespaceCandidates = [];
    if (recordTrimAutoWhitespace) {
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const reverseRange = reverseRanges[i];
        if (op.isAutoWhitespaceEdit && op.range.isEmpty()) {
          for (let lineNumber = reverseRange.startLineNumber; lineNumber <= reverseRange.endLineNumber; lineNumber++) {
            let currentLineContent = "";
            if (lineNumber === reverseRange.startLineNumber) {
              currentLineContent = this.getLineContent(op.range.startLineNumber);
              if (strings.firstNonWhitespaceIndex(currentLineContent) !== -1) {
                continue;
              }
            }
            newTrimAutoWhitespaceCandidates.push({ lineNumber, oldContent: currentLineContent });
          }
        }
      }
    }
    let reverseOperations = null;
    if (computeUndoEdits) {
      let reverseRangeDeltaOffset = 0;
      reverseOperations = [];
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const reverseRange = reverseRanges[i];
        const bufferText = this.getValueInRange(op.range);
        const reverseRangeOffset = op.rangeOffset + reverseRangeDeltaOffset;
        reverseRangeDeltaOffset += op.text.length - bufferText.length;
        reverseOperations[i] = {
          sortIndex: op.sortIndex,
          identifier: op.identifier,
          range: reverseRange,
          text: bufferText,
          textChange: new TextChange(op.rangeOffset, bufferText, reverseRangeOffset, op.text)
        };
      }
      if (!hasTouchingRanges) {
        reverseOperations.sort((a, b) => a.sortIndex - b.sortIndex);
      }
    }
    this._mightContainRTL = mightContainRTL;
    this._mightContainUnusualLineTerminators = mightContainUnusualLineTerminators;
    this._mightContainNonBasicASCII = mightContainNonBasicASCII;
    const contentChanges = this._doApplyEdits(operations);
    let trimAutoWhitespaceLineNumbers = null;
    if (recordTrimAutoWhitespace && newTrimAutoWhitespaceCandidates.length > 0) {
      newTrimAutoWhitespaceCandidates.sort((a, b) => b.lineNumber - a.lineNumber);
      trimAutoWhitespaceLineNumbers = [];
      for (let i = 0, len = newTrimAutoWhitespaceCandidates.length; i < len; i++) {
        const lineNumber = newTrimAutoWhitespaceCandidates[i].lineNumber;
        if (i > 0 && newTrimAutoWhitespaceCandidates[i - 1].lineNumber === lineNumber) {
          continue;
        }
        const prevContent = newTrimAutoWhitespaceCandidates[i].oldContent;
        const lineContent = this.getLineContent(lineNumber);
        if (lineContent.length === 0 || lineContent === prevContent || strings.firstNonWhitespaceIndex(lineContent) !== -1) {
          continue;
        }
        trimAutoWhitespaceLineNumbers.push(lineNumber);
      }
    }
    this._onDidChangeContent.fire();
    return new ApplyEditsResult(
      reverseOperations,
      contentChanges,
      trimAutoWhitespaceLineNumbers
    );
  }
  /**
   * Transform operations such that they represent the same logic edit,
   * but that they also do not cause OOM crashes.
   */
  _reduceOperations(operations) {
    if (operations.length < 1e3) {
      return operations;
    }
    return [this._toSingleEditOperation(operations)];
  }
  _toSingleEditOperation(operations) {
    let forceMoveMarkers = false;
    const firstEditRange = operations[0].range;
    const lastEditRange = operations[operations.length - 1].range;
    const entireEditRange = new Range(firstEditRange.startLineNumber, firstEditRange.startColumn, lastEditRange.endLineNumber, lastEditRange.endColumn);
    let lastEndLineNumber = firstEditRange.startLineNumber;
    let lastEndColumn = firstEditRange.startColumn;
    const result = [];
    for (let i = 0, len = operations.length; i < len; i++) {
      const operation = operations[i];
      const range = operation.range;
      forceMoveMarkers = forceMoveMarkers || operation.forceMoveMarkers;
      result.push(this.getValueInRange(new Range(lastEndLineNumber, lastEndColumn, range.startLineNumber, range.startColumn)));
      if (operation.text.length > 0) {
        result.push(operation.text);
      }
      lastEndLineNumber = range.endLineNumber;
      lastEndColumn = range.endColumn;
    }
    const text = result.join("");
    const [eolCount, firstLineLength, lastLineLength] = countEOL(text);
    return {
      sortIndex: 0,
      identifier: operations[0].identifier,
      range: entireEditRange,
      rangeOffset: this.getOffsetAt(entireEditRange.startLineNumber, entireEditRange.startColumn),
      rangeLength: this.getValueLengthInRange(entireEditRange, EndOfLinePreference.TextDefined),
      text,
      eolCount,
      firstLineLength,
      lastLineLength,
      forceMoveMarkers,
      isAutoWhitespaceEdit: false
    };
  }
  _doApplyEdits(operations) {
    operations.sort(PieceTreeTextBuffer._sortOpsDescending);
    const contentChanges = [];
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const startLineNumber = op.range.startLineNumber;
      const startColumn = op.range.startColumn;
      const endLineNumber = op.range.endLineNumber;
      const endColumn = op.range.endColumn;
      if (startLineNumber === endLineNumber && startColumn === endColumn && op.text.length === 0) {
        continue;
      }
      if (op.text) {
        this._pieceTree.delete(op.rangeOffset, op.rangeLength);
        this._pieceTree.insert(op.rangeOffset, op.text, true);
      } else {
        this._pieceTree.delete(op.rangeOffset, op.rangeLength);
      }
      const contentChangeRange = new Range(startLineNumber, startColumn, endLineNumber, endColumn);
      contentChanges.push({
        range: contentChangeRange,
        rangeLength: op.rangeLength,
        text: op.text,
        rangeOffset: op.rangeOffset,
        forceMoveMarkers: op.forceMoveMarkers
      });
    }
    return contentChanges;
  }
  findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount) {
    return this._pieceTree.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
  }
  // #endregion
  // #region helper
  // testing purpose.
  getPieceTree() {
    return this._pieceTree;
  }
  static _getInverseEditRange(range, text) {
    const startLineNumber = range.startLineNumber;
    const startColumn = range.startColumn;
    const [eolCount, firstLineLength, lastLineLength] = countEOL(text);
    let resultRange;
    if (text.length > 0) {
      const lineCount = eolCount + 1;
      if (lineCount === 1) {
        resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn + firstLineLength);
      } else {
        resultRange = new Range(startLineNumber, startColumn, startLineNumber + lineCount - 1, lastLineLength + 1);
      }
    } else {
      resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn);
    }
    return resultRange;
  }
  /**
   * Assumes `operations` are validated and sorted ascending
   */
  static _getInverseEditRanges(operations) {
    const result = [];
    let prevOpEndLineNumber = 0;
    let prevOpEndColumn = 0;
    let prevOp = null;
    for (let i = 0, len = operations.length; i < len; i++) {
      const op = operations[i];
      let startLineNumber;
      let startColumn;
      if (prevOp) {
        if (prevOp.range.endLineNumber === op.range.startLineNumber) {
          startLineNumber = prevOpEndLineNumber;
          startColumn = prevOpEndColumn + (op.range.startColumn - prevOp.range.endColumn);
        } else {
          startLineNumber = prevOpEndLineNumber + (op.range.startLineNumber - prevOp.range.endLineNumber);
          startColumn = op.range.startColumn;
        }
      } else {
        startLineNumber = op.range.startLineNumber;
        startColumn = op.range.startColumn;
      }
      let resultRange;
      if (op.text.length > 0) {
        const lineCount = op.eolCount + 1;
        if (lineCount === 1) {
          resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn + op.firstLineLength);
        } else {
          resultRange = new Range(startLineNumber, startColumn, startLineNumber + lineCount - 1, op.lastLineLength + 1);
        }
      } else {
        resultRange = new Range(startLineNumber, startColumn, startLineNumber, startColumn);
      }
      prevOpEndLineNumber = resultRange.endLineNumber;
      prevOpEndColumn = resultRange.endColumn;
      result.push(resultRange);
      prevOp = op;
    }
    return result;
  }
  static _sortOpsAscending(a, b) {
    const r = Range.compareRangesUsingEnds(a.range, b.range);
    if (r === 0) {
      return a.sortIndex - b.sortIndex;
    }
    return r;
  }
  static _sortOpsDescending(a, b) {
    const r = Range.compareRangesUsingEnds(a.range, b.range);
    if (r === 0) {
      return b.sortIndex - a.sortIndex;
    }
    return -r;
  }
  // #endregion
}
export {
  PieceTreeTextBuffer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHBpZWNlVHJlZVRleHRCdWZmZXJcXHBpZWNlVHJlZVRleHRCdWZmZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEFwcGx5RWRpdHNSZXN1bHQsIEVuZE9mTGluZVByZWZlcmVuY2UsIEZpbmRNYXRjaCwgSUludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlLCBJU2luZ2xlRWRpdE9wZXJhdGlvbklkZW50aWZpZXIsIElUZXh0QnVmZmVyLCBJVGV4dFNuYXBzaG90LCBWYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb24sIElWYWxpZEVkaXRPcGVyYXRpb24sIFNlYXJjaERhdGEgfSBmcm9tICcuLi8uLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBQaWVjZVRyZWVCYXNlLCBTdHJpbmdCdWZmZXIgfSBmcm9tICcuL3BpZWNlVHJlZUJhc2UuanMnO1xuaW1wb3J0IHsgY291bnRFT0wsIFN0cmluZ0VPTCB9IGZyb20gJy4uLy4uL2NvcmUvbWlzYy9lb2xDb3VudGVyLmpzJztcbmltcG9ydCB7IFRleHRDaGFuZ2UgfSBmcm9tICcuLi8uLi9jb3JlL3RleHRDaGFuZ2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZhbGlkYXRlZEVkaXRPcGVyYXRpb24ge1xuXHRzb3J0SW5kZXg6IG51bWJlcjtcblx0aWRlbnRpZmllcjogSVNpbmdsZUVkaXRPcGVyYXRpb25JZGVudGlmaWVyIHwgbnVsbDtcblx0cmFuZ2U6IFJhbmdlO1xuXHRyYW5nZU9mZnNldDogbnVtYmVyO1xuXHRyYW5nZUxlbmd0aDogbnVtYmVyO1xuXHR0ZXh0OiBzdHJpbmc7XG5cdGVvbENvdW50OiBudW1iZXI7XG5cdGZpcnN0TGluZUxlbmd0aDogbnVtYmVyO1xuXHRsYXN0TGluZUxlbmd0aDogbnVtYmVyO1xuXHRmb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuO1xuXHRpc0F1dG9XaGl0ZXNwYWNlRWRpdDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElSZXZlcnNlU2luZ2xlRWRpdE9wZXJhdGlvbiBleHRlbmRzIElWYWxpZEVkaXRPcGVyYXRpb24ge1xuXHRzb3J0SW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFBpZWNlVHJlZVRleHRCdWZmZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRleHRCdWZmZXIge1xuXHRwcml2YXRlIF9waWVjZVRyZWU6IFBpZWNlVHJlZUJhc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX0JPTTogc3RyaW5nO1xuXHRwcml2YXRlIF9taWdodENvbnRhaW5SVEw6IGJvb2xlYW47XG5cdHByaXZhdGUgX21pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnM6IGJvb2xlYW47XG5cdHByaXZhdGUgX21pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUk6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50OiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VDb250ZW50KCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKGNodW5rczogU3RyaW5nQnVmZmVyW10sIEJPTTogc3RyaW5nLCBlb2w6ICdcXHJcXG4nIHwgJ1xcbicsIGNvbnRhaW5zUlRMOiBib29sZWFuLCBjb250YWluc1VudXN1YWxMaW5lVGVybWluYXRvcnM6IGJvb2xlYW4sIGlzQmFzaWNBU0NJSTogYm9vbGVhbiwgZW9sTm9ybWFsaXplZDogYm9vbGVhbikge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fQk9NID0gQk9NO1xuXHRcdHRoaXMuX21pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkgPSAhaXNCYXNpY0FTQ0lJO1xuXHRcdHRoaXMuX21pZ2h0Q29udGFpblJUTCA9IGNvbnRhaW5zUlRMO1xuXHRcdHRoaXMuX21pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnMgPSBjb250YWluc1VudXN1YWxMaW5lVGVybWluYXRvcnM7XG5cdFx0dGhpcy5fcGllY2VUcmVlID0gbmV3IFBpZWNlVHJlZUJhc2UoY2h1bmtzLCBlb2wsIGVvbE5vcm1hbGl6ZWQpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBUZXh0QnVmZmVyXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IElUZXh0QnVmZmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBQaWVjZVRyZWVUZXh0QnVmZmVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fQk9NICE9PSBvdGhlci5fQk9NKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmdldEVPTCgpICE9PSBvdGhlci5nZXRFT0woKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmVxdWFsKG90aGVyLl9waWVjZVRyZWUpO1xuXHR9XG5cdHB1YmxpYyBtaWdodENvbnRhaW5SVEwoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21pZ2h0Q29udGFpblJUTDtcblx0fVxuXHRwdWJsaWMgbWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycztcblx0fVxuXHRwdWJsaWMgcmVzZXRNaWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzKCk6IHZvaWQge1xuXHRcdHRoaXMuX21pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnMgPSBmYWxzZTtcblx0fVxuXHRwdWJsaWMgbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSTtcblx0fVxuXHRwdWJsaWMgZ2V0Qk9NKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX0JPTTtcblx0fVxuXHRwdWJsaWMgZ2V0RU9MKCk6ICdcXHJcXG4nIHwgJ1xcbicge1xuXHRcdHJldHVybiB0aGlzLl9waWVjZVRyZWUuZ2V0RU9MKCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU25hcHNob3QocHJlc2VydmVCT006IGJvb2xlYW4pOiBJVGV4dFNuYXBzaG90IHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmNyZWF0ZVNuYXBzaG90KHByZXNlcnZlQk9NID8gdGhpcy5fQk9NIDogJycpO1xuXHR9XG5cblx0cHVibGljIGdldE9mZnNldEF0KGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9waWVjZVRyZWUuZ2V0T2Zmc2V0QXQobGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbkF0KG9mZnNldDogbnVtYmVyKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9waWVjZVRyZWUuZ2V0UG9zaXRpb25BdChvZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGdldFJhbmdlQXQoc3RhcnQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBSYW5nZSB7XG5cdFx0Y29uc3QgZW5kID0gc3RhcnQgKyBsZW5ndGg7XG5cdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IHRoaXMuZ2V0UG9zaXRpb25BdChzdGFydCk7XG5cdFx0Y29uc3QgZW5kUG9zaXRpb24gPSB0aGlzLmdldFBvc2l0aW9uQXQoZW5kKTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0UG9zaXRpb24ubGluZU51bWJlciwgc3RhcnRQb3NpdGlvbi5jb2x1bW4sIGVuZFBvc2l0aW9uLmxpbmVOdW1iZXIsIGVuZFBvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWVJblJhbmdlKHJhbmdlOiBSYW5nZSwgZW9sOiBFbmRPZkxpbmVQcmVmZXJlbmNlID0gRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVFbmRpbmcgPSB0aGlzLl9nZXRFbmRPZkxpbmUoZW9sKTtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldFZhbHVlSW5SYW5nZShyYW5nZSwgbGluZUVuZGluZyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHJhbmdlOiBSYW5nZSwgZW9sOiBFbmRPZkxpbmVQcmVmZXJlbmNlID0gRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCk6IG51bWJlciB7XG5cdFx0aWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIChyYW5nZS5lbmRDb2x1bW4gLSByYW5nZS5zdGFydENvbHVtbik7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLmdldE9mZnNldEF0KHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdGNvbnN0IGVuZE9mZnNldCA9IHRoaXMuZ2V0T2Zmc2V0QXQocmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblxuXHRcdC8vIG9mZnNldHMgdXNlIHRoZSB0ZXh0IEVPTCwgc28gd2UgbmVlZCB0byBjb21wZW5zYXRlIGZvciBsZW5ndGggZGlmZmVyZW5jZXNcblx0XHQvLyBpZiB0aGUgcmVxdWVzdGVkIEVPTCBkb2Vzbid0IG1hdGNoIHRoZSB0ZXh0IEVPTFxuXHRcdGxldCBlb2xPZmZzZXRDb21wZW5zYXRpb24gPSAwO1xuXHRcdGNvbnN0IGRlc2lyZWRFT0wgPSB0aGlzLl9nZXRFbmRPZkxpbmUoZW9sKTtcblx0XHRjb25zdCBhY3R1YWxFT0wgPSB0aGlzLmdldEVPTCgpO1xuXHRcdGlmIChkZXNpcmVkRU9MLmxlbmd0aCAhPT0gYWN0dWFsRU9MLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZGVsdGEgPSBkZXNpcmVkRU9MLmxlbmd0aCAtIGFjdHVhbEVPTC5sZW5ndGg7XG5cdFx0XHRjb25zdCBlb2xDb3VudCA9IHJhbmdlLmVuZExpbmVOdW1iZXIgLSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRlb2xPZmZzZXRDb21wZW5zYXRpb24gPSBkZWx0YSAqIGVvbENvdW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBlbmRPZmZzZXQgLSBzdGFydE9mZnNldCArIGVvbE9mZnNldENvbXBlbnNhdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGFyYWN0ZXJDb3VudEluUmFuZ2UocmFuZ2U6IFJhbmdlLCBlb2w6IEVuZE9mTGluZVByZWZlcmVuY2UgPSBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSkge1xuXHRcdFx0Ly8gd2UgbXVzdCBjb3VudCBieSBpdGVyYXRpbmdcblxuXHRcdFx0bGV0IHJlc3VsdCA9IDA7XG5cblx0XHRcdGNvbnN0IGZyb21MaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgdG9MaW5lTnVtYmVyID0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBmcm9tTGluZU51bWJlcjsgbGluZU51bWJlciA8PSB0b0xpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRoaXMuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IGZyb21PZmZzZXQgPSAobGluZU51bWJlciA9PT0gZnJvbUxpbmVOdW1iZXIgPyByYW5nZS5zdGFydENvbHVtbiAtIDEgOiAwKTtcblx0XHRcdFx0Y29uc3QgdG9PZmZzZXQgPSAobGluZU51bWJlciA9PT0gdG9MaW5lTnVtYmVyID8gcmFuZ2UuZW5kQ29sdW1uIC0gMSA6IGxpbmVDb250ZW50Lmxlbmd0aCk7XG5cblx0XHRcdFx0Zm9yIChsZXQgb2Zmc2V0ID0gZnJvbU9mZnNldDsgb2Zmc2V0IDwgdG9PZmZzZXQ7IG9mZnNldCsrKSB7XG5cdFx0XHRcdFx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGxpbmVDb250ZW50LmNoYXJDb2RlQXQob2Zmc2V0KSkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdCA9IHJlc3VsdCArIDE7XG5cdFx0XHRcdFx0XHRvZmZzZXQgPSBvZmZzZXQgKyAxO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSByZXN1bHQgKyAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQgKz0gdGhpcy5fZ2V0RW5kT2ZMaW5lKGVvbCkubGVuZ3RoICogKHRvTGluZU51bWJlciAtIGZyb21MaW5lTnVtYmVyKTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UocmFuZ2UsIGVvbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TmVhcmVzdENodW5rKG9mZnNldDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldE5lYXJlc3RDaHVuayhvZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGdldExlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9waWVjZVRyZWUuZ2V0TGVuZ3RoKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5nZXRMaW5lQ291bnQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lc0NvbnRlbnQoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9waWVjZVRyZWUuZ2V0TGluZXNDb250ZW50KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDaGFyQ29kZShsaW5lTnVtYmVyOiBudW1iZXIsIGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9waWVjZVRyZWUuZ2V0TGluZUNoYXJDb2RlKGxpbmVOdW1iZXIsIGluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGFyQ29kZShvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpZWNlVHJlZS5nZXRDaGFyQ29kZShvZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVMZW5ndGgobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmdldExpbmVMZW5ndGgobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZU1pbkNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpICsgMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleCh0aGlzLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpKTtcblx0XHRpZiAocmVzdWx0ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQgKyAxO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleCh0aGlzLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpKTtcblx0XHRpZiAocmVzdWx0ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQgKyAyO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RW5kT2ZMaW5lKGVvbDogRW5kT2ZMaW5lUHJlZmVyZW5jZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChlb2wpIHtcblx0XHRcdGNhc2UgRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRjpcblx0XHRcdFx0cmV0dXJuICdcXG4nO1xuXHRcdFx0Y2FzZSBFbmRPZkxpbmVQcmVmZXJlbmNlLkNSTEY6XG5cdFx0XHRcdHJldHVybiAnXFxyXFxuJztcblx0XHRcdGNhc2UgRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0RU9MKCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gRU9MIHByZWZlcmVuY2UnKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0RU9MKG5ld0VPTDogJ1xcclxcbicgfCAnXFxuJyk6IHZvaWQge1xuXHRcdHRoaXMuX3BpZWNlVHJlZS5zZXRFT0wobmV3RU9MKTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseUVkaXRzKHJhd09wZXJhdGlvbnM6IFZhbGlkQW5ub3RhdGVkRWRpdE9wZXJhdGlvbltdLCByZWNvcmRUcmltQXV0b1doaXRlc3BhY2U6IGJvb2xlYW4sIGNvbXB1dGVVbmRvRWRpdHM6IGJvb2xlYW4pOiBBcHBseUVkaXRzUmVzdWx0IHtcblx0XHRsZXQgbWlnaHRDb250YWluUlRMID0gdGhpcy5fbWlnaHRDb250YWluUlRMO1xuXHRcdGxldCBtaWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzID0gdGhpcy5fbWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycztcblx0XHRsZXQgbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSA9IHRoaXMuX21pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUk7XG5cdFx0bGV0IGNhblJlZHVjZU9wZXJhdGlvbnMgPSB0cnVlO1xuXG5cdFx0bGV0IG9wZXJhdGlvbnM6IElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJhd09wZXJhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG9wID0gcmF3T3BlcmF0aW9uc1tpXTtcblx0XHRcdGlmIChjYW5SZWR1Y2VPcGVyYXRpb25zICYmIG9wLl9pc1RyYWNrZWQpIHtcblx0XHRcdFx0Y2FuUmVkdWNlT3BlcmF0aW9ucyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFsaWRhdGVkUmFuZ2UgPSBvcC5yYW5nZTtcblx0XHRcdGlmIChvcC50ZXh0KSB7XG5cdFx0XHRcdGxldCB0ZXh0TWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSA9IHRydWU7XG5cdFx0XHRcdGlmICghbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSkge1xuXHRcdFx0XHRcdHRleHRNaWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJID0gIXN0cmluZ3MuaXNCYXNpY0FTQ0lJKG9wLnRleHQpO1xuXHRcdFx0XHRcdG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkgPSB0ZXh0TWlnaHRDb250YWluTm9uQmFzaWNBU0NJSTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIW1pZ2h0Q29udGFpblJUTCAmJiB0ZXh0TWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSkge1xuXHRcdFx0XHRcdC8vIGNoZWNrIGlmIHRoZSBuZXcgaW5zZXJ0ZWQgdGV4dCBjb250YWlucyBSVExcblx0XHRcdFx0XHRtaWdodENvbnRhaW5SVEwgPSBzdHJpbmdzLmNvbnRhaW5zUlRMKG9wLnRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghbWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycyAmJiB0ZXh0TWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSkge1xuXHRcdFx0XHRcdC8vIGNoZWNrIGlmIHRoZSBuZXcgaW5zZXJ0ZWQgdGV4dCBjb250YWlucyB1bnVzdWFsIGxpbmUgdGVybWluYXRvcnNcblx0XHRcdFx0XHRtaWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzID0gc3RyaW5ncy5jb250YWluc1VudXN1YWxMaW5lVGVybWluYXRvcnMob3AudGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHZhbGlkVGV4dCA9ICcnO1xuXHRcdFx0bGV0IGVvbENvdW50ID0gMDtcblx0XHRcdGxldCBmaXJzdExpbmVMZW5ndGggPSAwO1xuXHRcdFx0bGV0IGxhc3RMaW5lTGVuZ3RoID0gMDtcblx0XHRcdGlmIChvcC50ZXh0KSB7XG5cdFx0XHRcdGxldCBzdHJFT0w6IFN0cmluZ0VPTDtcblx0XHRcdFx0W2VvbENvdW50LCBmaXJzdExpbmVMZW5ndGgsIGxhc3RMaW5lTGVuZ3RoLCBzdHJFT0xdID0gY291bnRFT0wob3AudGV4dCk7XG5cblx0XHRcdFx0Y29uc3QgYnVmZmVyRU9MID0gdGhpcy5nZXRFT0woKTtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRTdHJFT0wgPSAoYnVmZmVyRU9MID09PSAnXFxyXFxuJyA/IFN0cmluZ0VPTC5DUkxGIDogU3RyaW5nRU9MLkxGKTtcblx0XHRcdFx0aWYgKHN0ckVPTCA9PT0gU3RyaW5nRU9MLlVua25vd24gfHwgc3RyRU9MID09PSBleHBlY3RlZFN0ckVPTCkge1xuXHRcdFx0XHRcdHZhbGlkVGV4dCA9IG9wLnRleHQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFsaWRUZXh0ID0gb3AudGV4dC5yZXBsYWNlKC9cXHJcXG58XFxyfFxcbi9nLCBidWZmZXJFT0wpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdG9wZXJhdGlvbnNbaV0gPSB7XG5cdFx0XHRcdHNvcnRJbmRleDogaSxcblx0XHRcdFx0aWRlbnRpZmllcjogb3AuaWRlbnRpZmllciB8fCBudWxsLFxuXHRcdFx0XHRyYW5nZTogdmFsaWRhdGVkUmFuZ2UsXG5cdFx0XHRcdHJhbmdlT2Zmc2V0OiB0aGlzLmdldE9mZnNldEF0KHZhbGlkYXRlZFJhbmdlLnN0YXJ0TGluZU51bWJlciwgdmFsaWRhdGVkUmFuZ2Uuc3RhcnRDb2x1bW4pLFxuXHRcdFx0XHRyYW5nZUxlbmd0aDogdGhpcy5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UodmFsaWRhdGVkUmFuZ2UpLFxuXHRcdFx0XHR0ZXh0OiB2YWxpZFRleHQsXG5cdFx0XHRcdGVvbENvdW50OiBlb2xDb3VudCxcblx0XHRcdFx0Zmlyc3RMaW5lTGVuZ3RoOiBmaXJzdExpbmVMZW5ndGgsXG5cdFx0XHRcdGxhc3RMaW5lTGVuZ3RoOiBsYXN0TGluZUxlbmd0aCxcblx0XHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogQm9vbGVhbihvcC5mb3JjZU1vdmVNYXJrZXJzKSxcblx0XHRcdFx0aXNBdXRvV2hpdGVzcGFjZUVkaXQ6IG9wLmlzQXV0b1doaXRlc3BhY2VFZGl0IHx8IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFNvcnQgb3BlcmF0aW9ucyBhc2NlbmRpbmdcblx0XHRvcGVyYXRpb25zLnNvcnQoUGllY2VUcmVlVGV4dEJ1ZmZlci5fc29ydE9wc0FzY2VuZGluZyk7XG5cblx0XHRsZXQgaGFzVG91Y2hpbmdSYW5nZXMgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gMCwgY291bnQgPSBvcGVyYXRpb25zLmxlbmd0aCAtIDE7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCByYW5nZUVuZCA9IG9wZXJhdGlvbnNbaV0ucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IG5leHRSYW5nZVN0YXJ0ID0gb3BlcmF0aW9uc1tpICsgMV0ucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXG5cdFx0XHRpZiAobmV4dFJhbmdlU3RhcnQuaXNCZWZvcmVPckVxdWFsKHJhbmdlRW5kKSkge1xuXHRcdFx0XHRpZiAobmV4dFJhbmdlU3RhcnQuaXNCZWZvcmUocmFuZ2VFbmQpKSB7XG5cdFx0XHRcdFx0Ly8gb3ZlcmxhcHBpbmcgcmFuZ2VzXG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdPdmVybGFwcGluZyByYW5nZXMgYXJlIG5vdCBhbGxvd2VkIScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhhc1RvdWNoaW5nUmFuZ2VzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2FuUmVkdWNlT3BlcmF0aW9ucykge1xuXHRcdFx0b3BlcmF0aW9ucyA9IHRoaXMuX3JlZHVjZU9wZXJhdGlvbnMob3BlcmF0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVsdGEgZW5jb2RlIG9wZXJhdGlvbnNcblx0XHRjb25zdCByZXZlcnNlUmFuZ2VzID0gKGNvbXB1dGVVbmRvRWRpdHMgfHwgcmVjb3JkVHJpbUF1dG9XaGl0ZXNwYWNlID8gUGllY2VUcmVlVGV4dEJ1ZmZlci5fZ2V0SW52ZXJzZUVkaXRSYW5nZXMob3BlcmF0aW9ucykgOiBbXSk7XG5cdFx0Y29uc3QgbmV3VHJpbUF1dG9XaGl0ZXNwYWNlQ2FuZGlkYXRlczogeyBsaW5lTnVtYmVyOiBudW1iZXI7IG9sZENvbnRlbnQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRpZiAocmVjb3JkVHJpbUF1dG9XaGl0ZXNwYWNlKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG9wZXJhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgb3AgPSBvcGVyYXRpb25zW2ldO1xuXHRcdFx0XHRjb25zdCByZXZlcnNlUmFuZ2UgPSByZXZlcnNlUmFuZ2VzW2ldO1xuXG5cdFx0XHRcdGlmIChvcC5pc0F1dG9XaGl0ZXNwYWNlRWRpdCAmJiBvcC5yYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHQvLyBSZWNvcmQgYWxyZWFkeSB0aGUgZnV0dXJlIGxpbmUgbnVtYmVycyB0aGF0IG1pZ2h0IGJlIGF1dG8gd2hpdGVzcGFjZSByZW1vdmFsIGNhbmRpZGF0ZXMgb24gbmV4dCBlZGl0XG5cdFx0XHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHJldmVyc2VSYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gcmV2ZXJzZVJhbmdlLmVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRcdFx0bGV0IGN1cnJlbnRMaW5lQ29udGVudCA9ICcnO1xuXHRcdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IHJldmVyc2VSYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdFx0Y3VycmVudExpbmVDb250ZW50ID0gdGhpcy5nZXRMaW5lQ29udGVudChvcC5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0XHRpZiAoc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleChjdXJyZW50TGluZUNvbnRlbnQpICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRuZXdUcmltQXV0b1doaXRlc3BhY2VDYW5kaWRhdGVzLnB1c2goeyBsaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBvbGRDb250ZW50OiBjdXJyZW50TGluZUNvbnRlbnQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHJldmVyc2VPcGVyYXRpb25zOiBJUmV2ZXJzZVNpbmdsZUVkaXRPcGVyYXRpb25bXSB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChjb21wdXRlVW5kb0VkaXRzKSB7XG5cblx0XHRcdGxldCByZXZlcnNlUmFuZ2VEZWx0YU9mZnNldCA9IDA7XG5cdFx0XHRyZXZlcnNlT3BlcmF0aW9ucyA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvcGVyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IG9wID0gb3BlcmF0aW9uc1tpXTtcblx0XHRcdFx0Y29uc3QgcmV2ZXJzZVJhbmdlID0gcmV2ZXJzZVJhbmdlc1tpXTtcblx0XHRcdFx0Y29uc3QgYnVmZmVyVGV4dCA9IHRoaXMuZ2V0VmFsdWVJblJhbmdlKG9wLnJhbmdlKTtcblx0XHRcdFx0Y29uc3QgcmV2ZXJzZVJhbmdlT2Zmc2V0ID0gb3AucmFuZ2VPZmZzZXQgKyByZXZlcnNlUmFuZ2VEZWx0YU9mZnNldDtcblx0XHRcdFx0cmV2ZXJzZVJhbmdlRGVsdGFPZmZzZXQgKz0gKG9wLnRleHQubGVuZ3RoIC0gYnVmZmVyVGV4dC5sZW5ndGgpO1xuXG5cdFx0XHRcdHJldmVyc2VPcGVyYXRpb25zW2ldID0ge1xuXHRcdFx0XHRcdHNvcnRJbmRleDogb3Auc29ydEluZGV4LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6IG9wLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0cmFuZ2U6IHJldmVyc2VSYW5nZSxcblx0XHRcdFx0XHR0ZXh0OiBidWZmZXJUZXh0LFxuXHRcdFx0XHRcdHRleHRDaGFuZ2U6IG5ldyBUZXh0Q2hhbmdlKG9wLnJhbmdlT2Zmc2V0LCBidWZmZXJUZXh0LCByZXZlcnNlUmFuZ2VPZmZzZXQsIG9wLnRleHQpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhbiBvbmx5IHNvcnQgcmV2ZXJzZSBvcGVyYXRpb25zIHdoZW4gdGhlIG9yZGVyIGlzIG5vdCBzaWduaWZpY2FudFxuXHRcdFx0aWYgKCFoYXNUb3VjaGluZ1Jhbmdlcykge1xuXHRcdFx0XHRyZXZlcnNlT3BlcmF0aW9ucy5zb3J0KChhLCBiKSA9PiBhLnNvcnRJbmRleCAtIGIuc29ydEluZGV4KTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdHRoaXMuX21pZ2h0Q29udGFpblJUTCA9IG1pZ2h0Q29udGFpblJUTDtcblx0XHR0aGlzLl9taWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzID0gbWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycztcblx0XHR0aGlzLl9taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJID0gbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSTtcblxuXHRcdGNvbnN0IGNvbnRlbnRDaGFuZ2VzID0gdGhpcy5fZG9BcHBseUVkaXRzKG9wZXJhdGlvbnMpO1xuXG5cdFx0bGV0IHRyaW1BdXRvV2hpdGVzcGFjZUxpbmVOdW1iZXJzOiBudW1iZXJbXSB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChyZWNvcmRUcmltQXV0b1doaXRlc3BhY2UgJiYgbmV3VHJpbUF1dG9XaGl0ZXNwYWNlQ2FuZGlkYXRlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBzb3J0IGxpbmUgbnVtYmVycyBhdXRvIHdoaXRlc3BhY2UgcmVtb3ZhbCBjYW5kaWRhdGVzIGZvciBuZXh0IGVkaXQgZGVzY2VuZGluZ1xuXHRcdFx0bmV3VHJpbUF1dG9XaGl0ZXNwYWNlQ2FuZGlkYXRlcy5zb3J0KChhLCBiKSA9PiBiLmxpbmVOdW1iZXIgLSBhLmxpbmVOdW1iZXIpO1xuXG5cdFx0XHR0cmltQXV0b1doaXRlc3BhY2VMaW5lTnVtYmVycyA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG5ld1RyaW1BdXRvV2hpdGVzcGFjZUNhbmRpZGF0ZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IG5ld1RyaW1BdXRvV2hpdGVzcGFjZUNhbmRpZGF0ZXNbaV0ubGluZU51bWJlcjtcblx0XHRcdFx0aWYgKGkgPiAwICYmIG5ld1RyaW1BdXRvV2hpdGVzcGFjZUNhbmRpZGF0ZXNbaSAtIDFdLmxpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHQvLyBEbyBub3QgaGF2ZSB0aGUgc2FtZSBsaW5lIG51bWJlciB0d2ljZVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcHJldkNvbnRlbnQgPSBuZXdUcmltQXV0b1doaXRlc3BhY2VDYW5kaWRhdGVzW2ldLm9sZENvbnRlbnQ7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gdGhpcy5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblxuXHRcdFx0XHRpZiAobGluZUNvbnRlbnQubGVuZ3RoID09PSAwIHx8IGxpbmVDb250ZW50ID09PSBwcmV2Q29udGVudCB8fCBzdHJpbmdzLmZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVDb250ZW50KSAhPT0gLTEpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyaW1BdXRvV2hpdGVzcGFjZUxpbmVOdW1iZXJzLnB1c2gobGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoKTtcblxuXHRcdHJldHVybiBuZXcgQXBwbHlFZGl0c1Jlc3VsdChcblx0XHRcdHJldmVyc2VPcGVyYXRpb25zLFxuXHRcdFx0Y29udGVudENoYW5nZXMsXG5cdFx0XHR0cmltQXV0b1doaXRlc3BhY2VMaW5lTnVtYmVyc1xuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNmb3JtIG9wZXJhdGlvbnMgc3VjaCB0aGF0IHRoZXkgcmVwcmVzZW50IHRoZSBzYW1lIGxvZ2ljIGVkaXQsXG5cdCAqIGJ1dCB0aGF0IHRoZXkgYWxzbyBkbyBub3QgY2F1c2UgT09NIGNyYXNoZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWR1Y2VPcGVyYXRpb25zKG9wZXJhdGlvbnM6IElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uW10pOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbltdIHtcblx0XHRpZiAob3BlcmF0aW9ucy5sZW5ndGggPCAxMDAwKSB7XG5cdFx0XHQvLyBXZSBrbm93IGZyb20gZW1waXJpY2FsIHRlc3RpbmcgdGhhdCBhIHRob3VzYW5kIGVkaXRzIHdvcmsgZmluZSByZWdhcmRsZXNzIG9mIHRoZWlyIHNoYXBlLlxuXHRcdFx0cmV0dXJuIG9wZXJhdGlvbnM7XG5cdFx0fVxuXG5cdFx0Ly8gQXQgb25lIHBvaW50LCBkdWUgdG8gaG93IGV2ZW50cyBhcmUgZW1pdHRlZCBhbmQgaG93IGVhY2ggb3BlcmF0aW9uIGlzIGhhbmRsZWQsXG5cdFx0Ly8gc29tZSBvcGVyYXRpb25zIGNhbiB0cmlnZ2VyIGEgaGlnaCBhbW91bnQgb2YgdGVtcG9yYXJ5IHN0cmluZyBhbGxvY2F0aW9ucyxcblx0XHQvLyB0aGF0IHdpbGwgaW1tZWRpYXRlbHkgZ2V0IGVkaXRlZCBhZ2Fpbi5cblx0XHQvLyBlLmcuIGEgZm9ybWF0dGVyIGluc2VydGluZyByaWRpY3Vsb3VzIGFtbW91bnRzIG9mIFxcbiBvbiBhIG1vZGVsIHdpdGggYSBzaW5nbGUgbGluZVxuXHRcdC8vIFRoZXJlZm9yZSwgdGhlIHN0cmF0ZWd5IGlzIHRvIGNvbGxhcHNlIGFsbCB0aGUgb3BlcmF0aW9ucyBpbnRvIGEgaHVnZSBzaW5nbGUgZWRpdCBvcGVyYXRpb25cblx0XHRyZXR1cm4gW3RoaXMuX3RvU2luZ2xlRWRpdE9wZXJhdGlvbihvcGVyYXRpb25zKV07XG5cdH1cblxuXHRfdG9TaW5nbGVFZGl0T3BlcmF0aW9uKG9wZXJhdGlvbnM6IElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uW10pOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbiB7XG5cdFx0bGV0IGZvcmNlTW92ZU1hcmtlcnMgPSBmYWxzZTtcblx0XHRjb25zdCBmaXJzdEVkaXRSYW5nZSA9IG9wZXJhdGlvbnNbMF0ucmFuZ2U7XG5cdFx0Y29uc3QgbGFzdEVkaXRSYW5nZSA9IG9wZXJhdGlvbnNbb3BlcmF0aW9ucy5sZW5ndGggLSAxXS5yYW5nZTtcblx0XHRjb25zdCBlbnRpcmVFZGl0UmFuZ2UgPSBuZXcgUmFuZ2UoZmlyc3RFZGl0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBmaXJzdEVkaXRSYW5nZS5zdGFydENvbHVtbiwgbGFzdEVkaXRSYW5nZS5lbmRMaW5lTnVtYmVyLCBsYXN0RWRpdFJhbmdlLmVuZENvbHVtbik7XG5cdFx0bGV0IGxhc3RFbmRMaW5lTnVtYmVyID0gZmlyc3RFZGl0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGxldCBsYXN0RW5kQ29sdW1uID0gZmlyc3RFZGl0UmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG9wZXJhdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IG9wZXJhdGlvbiA9IG9wZXJhdGlvbnNbaV07XG5cdFx0XHRjb25zdCByYW5nZSA9IG9wZXJhdGlvbi5yYW5nZTtcblxuXHRcdFx0Zm9yY2VNb3ZlTWFya2VycyA9IGZvcmNlTW92ZU1hcmtlcnMgfHwgb3BlcmF0aW9uLmZvcmNlTW92ZU1hcmtlcnM7XG5cblx0XHRcdC8vICgxKSAtLSBQdXNoIG9sZCB0ZXh0XG5cdFx0XHRyZXN1bHQucHVzaCh0aGlzLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UobGFzdEVuZExpbmVOdW1iZXIsIGxhc3RFbmRDb2x1bW4sIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pKSk7XG5cblx0XHRcdC8vICgyKSAtLSBQdXNoIG5ldyB0ZXh0XG5cdFx0XHRpZiAob3BlcmF0aW9uLnRleHQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChvcGVyYXRpb24udGV4dCk7XG5cdFx0XHR9XG5cblx0XHRcdGxhc3RFbmRMaW5lTnVtYmVyID0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRcdGxhc3RFbmRDb2x1bW4gPSByYW5nZS5lbmRDb2x1bW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHJlc3VsdC5qb2luKCcnKTtcblx0XHRjb25zdCBbZW9sQ291bnQsIGZpcnN0TGluZUxlbmd0aCwgbGFzdExpbmVMZW5ndGhdID0gY291bnRFT0wodGV4dCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c29ydEluZGV4OiAwLFxuXHRcdFx0aWRlbnRpZmllcjogb3BlcmF0aW9uc1swXS5pZGVudGlmaWVyLFxuXHRcdFx0cmFuZ2U6IGVudGlyZUVkaXRSYW5nZSxcblx0XHRcdHJhbmdlT2Zmc2V0OiB0aGlzLmdldE9mZnNldEF0KGVudGlyZUVkaXRSYW5nZS5zdGFydExpbmVOdW1iZXIsIGVudGlyZUVkaXRSYW5nZS5zdGFydENvbHVtbiksXG5cdFx0XHRyYW5nZUxlbmd0aDogdGhpcy5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UoZW50aXJlRWRpdFJhbmdlLCBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKSxcblx0XHRcdHRleHQ6IHRleHQsXG5cdFx0XHRlb2xDb3VudDogZW9sQ291bnQsXG5cdFx0XHRmaXJzdExpbmVMZW5ndGg6IGZpcnN0TGluZUxlbmd0aCxcblx0XHRcdGxhc3RMaW5lTGVuZ3RoOiBsYXN0TGluZUxlbmd0aCxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZvcmNlTW92ZU1hcmtlcnMsXG5cdFx0XHRpc0F1dG9XaGl0ZXNwYWNlRWRpdDogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9BcHBseUVkaXRzKG9wZXJhdGlvbnM6IElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uW10pOiBJSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VbXSB7XG5cdFx0b3BlcmF0aW9ucy5zb3J0KFBpZWNlVHJlZVRleHRCdWZmZXIuX3NvcnRPcHNEZXNjZW5kaW5nKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRDaGFuZ2VzOiBJSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0Ly8gb3BlcmF0aW9ucyBhcmUgZnJvbSBib3R0b20gdG8gdG9wXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvcGVyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBvcCA9IG9wZXJhdGlvbnNbaV07XG5cblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IG9wLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gb3AucmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gb3AucmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IG9wLnJhbmdlLmVuZENvbHVtbjtcblxuXHRcdFx0aWYgKHN0YXJ0TGluZU51bWJlciA9PT0gZW5kTGluZU51bWJlciAmJiBzdGFydENvbHVtbiA9PT0gZW5kQ29sdW1uICYmIG9wLnRleHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIG5vLW9wXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3AudGV4dCkge1xuXHRcdFx0XHQvLyByZXBsYWNlbWVudFxuXHRcdFx0XHR0aGlzLl9waWVjZVRyZWUuZGVsZXRlKG9wLnJhbmdlT2Zmc2V0LCBvcC5yYW5nZUxlbmd0aCk7XG5cdFx0XHRcdHRoaXMuX3BpZWNlVHJlZS5pbnNlcnQob3AucmFuZ2VPZmZzZXQsIG9wLnRleHQsIHRydWUpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBkZWxldGlvblxuXHRcdFx0XHR0aGlzLl9waWVjZVRyZWUuZGVsZXRlKG9wLnJhbmdlT2Zmc2V0LCBvcC5yYW5nZUxlbmd0aCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRlbnRDaGFuZ2VSYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHRcdFx0Y29udGVudENoYW5nZXMucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiBjb250ZW50Q2hhbmdlUmFuZ2UsXG5cdFx0XHRcdHJhbmdlTGVuZ3RoOiBvcC5yYW5nZUxlbmd0aCxcblx0XHRcdFx0dGV4dDogb3AudGV4dCxcblx0XHRcdFx0cmFuZ2VPZmZzZXQ6IG9wLnJhbmdlT2Zmc2V0LFxuXHRcdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBvcC5mb3JjZU1vdmVNYXJrZXJzXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRlbnRDaGFuZ2VzO1xuXHR9XG5cblx0ZmluZE1hdGNoZXNMaW5lQnlMaW5lKHNlYXJjaFJhbmdlOiBSYW5nZSwgc2VhcmNoRGF0YTogU2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlcik6IEZpbmRNYXRjaFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlLmZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZSwgc2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gaGVscGVyXG5cdC8vIHRlc3RpbmcgcHVycG9zZS5cblx0cHVibGljIGdldFBpZWNlVHJlZSgpOiBQaWVjZVRyZWVCYXNlIHtcblx0XHRyZXR1cm4gdGhpcy5fcGllY2VUcmVlO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBfZ2V0SW52ZXJzZUVkaXRSYW5nZShyYW5nZTogUmFuZ2UsIHRleHQ6IHN0cmluZykge1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBzdGFydENvbHVtbiA9IHJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdGNvbnN0IFtlb2xDb3VudCwgZmlyc3RMaW5lTGVuZ3RoLCBsYXN0TGluZUxlbmd0aF0gPSBjb3VudEVPTCh0ZXh0KTtcblx0XHRsZXQgcmVzdWx0UmFuZ2U6IFJhbmdlO1xuXG5cdFx0aWYgKHRleHQubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gdGhlIG9wZXJhdGlvbiBpbnNlcnRzIHNvbWV0aGluZ1xuXHRcdFx0Y29uc3QgbGluZUNvdW50ID0gZW9sQ291bnQgKyAxO1xuXG5cdFx0XHRpZiAobGluZUNvdW50ID09PSAxKSB7XG5cdFx0XHRcdC8vIHNpbmdsZSBsaW5lIGluc2VydFxuXHRcdFx0XHRyZXN1bHRSYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uICsgZmlyc3RMaW5lTGVuZ3RoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG11bHRpIGxpbmUgaW5zZXJ0XG5cdFx0XHRcdHJlc3VsdFJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHN0YXJ0TGluZU51bWJlciArIGxpbmVDb3VudCAtIDEsIGxhc3RMaW5lTGVuZ3RoICsgMSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRoZXJlIGlzIG5vdGhpbmcgdG8gaW5zZXJ0XG5cdFx0XHRyZXN1bHRSYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0UmFuZ2U7XG5cdH1cblxuXHQvKipcblx0ICogQXNzdW1lcyBgb3BlcmF0aW9uc2AgYXJlIHZhbGlkYXRlZCBhbmQgc29ydGVkIGFzY2VuZGluZ1xuXHQgKi9cblx0cHVibGljIHN0YXRpYyBfZ2V0SW52ZXJzZUVkaXRSYW5nZXMob3BlcmF0aW9uczogSVZhbGlkYXRlZEVkaXRPcGVyYXRpb25bXSk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUmFuZ2VbXSA9IFtdO1xuXG5cdFx0bGV0IHByZXZPcEVuZExpbmVOdW1iZXI6IG51bWJlciA9IDA7XG5cdFx0bGV0IHByZXZPcEVuZENvbHVtbjogbnVtYmVyID0gMDtcblx0XHRsZXQgcHJldk9wOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBvcGVyYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBvcCA9IG9wZXJhdGlvbnNbaV07XG5cblx0XHRcdGxldCBzdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRcdGxldCBzdGFydENvbHVtbjogbnVtYmVyO1xuXG5cdFx0XHRpZiAocHJldk9wKSB7XG5cdFx0XHRcdGlmIChwcmV2T3AucmFuZ2UuZW5kTGluZU51bWJlciA9PT0gb3AucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gcHJldk9wRW5kTGluZU51bWJlcjtcblx0XHRcdFx0XHRzdGFydENvbHVtbiA9IHByZXZPcEVuZENvbHVtbiArIChvcC5yYW5nZS5zdGFydENvbHVtbiAtIHByZXZPcC5yYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlciA9IHByZXZPcEVuZExpbmVOdW1iZXIgKyAob3AucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gcHJldk9wLnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uID0gb3AucmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlciA9IG9wLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0c3RhcnRDb2x1bW4gPSBvcC5yYW5nZS5zdGFydENvbHVtbjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlc3VsdFJhbmdlOiBSYW5nZTtcblxuXHRcdFx0aWYgKG9wLnRleHQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQvLyB0aGUgb3BlcmF0aW9uIGluc2VydHMgc29tZXRoaW5nXG5cdFx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IG9wLmVvbENvdW50ICsgMTtcblxuXHRcdFx0XHRpZiAobGluZUNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0Ly8gc2luZ2xlIGxpbmUgaW5zZXJ0XG5cdFx0XHRcdFx0cmVzdWx0UmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiArIG9wLmZpcnN0TGluZUxlbmd0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbXVsdGkgbGluZSBpbnNlcnRcblx0XHRcdFx0XHRyZXN1bHRSYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBzdGFydExpbmVOdW1iZXIgKyBsaW5lQ291bnQgLSAxLCBvcC5sYXN0TGluZUxlbmd0aCArIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUaGVyZSBpcyBub3RoaW5nIHRvIGluc2VydFxuXHRcdFx0XHRyZXN1bHRSYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uKTtcblx0XHRcdH1cblxuXHRcdFx0cHJldk9wRW5kTGluZU51bWJlciA9IHJlc3VsdFJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRwcmV2T3BFbmRDb2x1bW4gPSByZXN1bHRSYW5nZS5lbmRDb2x1bW47XG5cblx0XHRcdHJlc3VsdC5wdXNoKHJlc3VsdFJhbmdlKTtcblx0XHRcdHByZXZPcCA9IG9wO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc29ydE9wc0FzY2VuZGluZyhhOiBJVmFsaWRhdGVkRWRpdE9wZXJhdGlvbiwgYjogSVZhbGlkYXRlZEVkaXRPcGVyYXRpb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IHIgPSBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdFbmRzKGEucmFuZ2UsIGIucmFuZ2UpO1xuXHRcdGlmIChyID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gYS5zb3J0SW5kZXggLSBiLnNvcnRJbmRleDtcblx0XHR9XG5cdFx0cmV0dXJuIHI7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc29ydE9wc0Rlc2NlbmRpbmcoYTogSVZhbGlkYXRlZEVkaXRPcGVyYXRpb24sIGI6IElWYWxpZGF0ZWRFZGl0T3BlcmF0aW9uKTogbnVtYmVyIHtcblx0XHRjb25zdCByID0gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nRW5kcyhhLnJhbmdlLCBiLnJhbmdlKTtcblx0XHRpZiAociA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGIuc29ydEluZGV4IC0gYS5zb3J0SW5kZXg7XG5cdFx0fVxuXHRcdHJldHVybiAtcjtcblx0fVxuXHQvLyAjZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQXNCO0FBQy9CLFlBQVksYUFBYTtBQUV6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0IsMkJBQTZMO0FBQ3hOLFNBQVMscUJBQW1DO0FBQzVDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0I7QUFvQnBCLE1BQU0sNEJBQTRCLFdBQWtDO0FBQUEsRUFVMUUsWUFBWSxRQUF3QixLQUFhLEtBQW9CLGFBQXNCLGdDQUF5QyxjQUF1QixlQUF3QjtBQUNsTCxVQUFNO0FBSlAsU0FBaUIsc0JBQXFDLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUt2RixTQUFLLE9BQU87QUFDWixTQUFLLDZCQUE2QixDQUFDO0FBQ25DLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssc0NBQXNDO0FBQzNDLFNBQUssYUFBYSxJQUFJLGNBQWMsUUFBUSxLQUFLLGFBQWE7QUFBQSxFQUMvRDtBQUFBLEVBVEEsSUFBVyxxQkFBa0M7QUFBRSxXQUFPLEtBQUssb0JBQW9CO0FBQUEsRUFBTztBQUFBO0FBQUEsRUFZL0UsT0FBTyxPQUE2QjtBQUMxQyxRQUFJLEVBQUUsaUJBQWlCLHNCQUFzQjtBQUM1QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxTQUFTLE1BQU0sTUFBTTtBQUM3QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxPQUFPLE1BQU0sTUFBTSxPQUFPLEdBQUc7QUFDckMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUssV0FBVyxNQUFNLE1BQU0sVUFBVTtBQUFBLEVBQzlDO0FBQUEsRUFDTyxrQkFBMkI7QUFDakMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFB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
