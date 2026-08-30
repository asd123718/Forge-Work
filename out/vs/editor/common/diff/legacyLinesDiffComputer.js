import { CharCode } from "../../../base/common/charCode.js";
import { LcsDiff } from "../../../base/common/diff/diff.js";
import { LinesDiff } from "./linesDiffComputer.js";
import { RangeMapping, DetailedLineRangeMapping } from "./rangeMapping.js";
import * as strings from "../../../base/common/strings.js";
import { Range } from "../core/range.js";
import { assertFn, checkAdjacentItems } from "../../../base/common/assert.js";
import { LineRange } from "../core/ranges/lineRange.js";
const MINIMUM_MATCHING_CHARACTER_LENGTH = 3;
class LegacyLinesDiffComputer {
  computeDiff(originalLines, modifiedLines, options) {
    const diffComputer = new DiffComputer(originalLines, modifiedLines, {
      maxComputationTime: options.maxComputationTimeMs,
      shouldIgnoreTrimWhitespace: options.ignoreTrimWhitespace,
      shouldComputeCharChanges: true,
      shouldMakePrettyDiff: true,
      shouldPostProcessCharChanges: true
    });
    const result = diffComputer.computeDiff();
    const changes = [];
    let lastChange = null;
    for (const c of result.changes) {
      let originalRange;
      if (c.originalEndLineNumber === 0) {
        originalRange = new LineRange(c.originalStartLineNumber + 1, c.originalStartLineNumber + 1);
      } else {
        originalRange = new LineRange(c.originalStartLineNumber, c.originalEndLineNumber + 1);
      }
      let modifiedRange;
      if (c.modifiedEndLineNumber === 0) {
        modifiedRange = new LineRange(c.modifiedStartLineNumber + 1, c.modifiedStartLineNumber + 1);
      } else {
        modifiedRange = new LineRange(c.modifiedStartLineNumber, c.modifiedEndLineNumber + 1);
      }
      let change = new DetailedLineRangeMapping(originalRange, modifiedRange, c.charChanges?.map((c2) => new RangeMapping(
        new Range(c2.originalStartLineNumber, c2.originalStartColumn, c2.originalEndLineNumber, c2.originalEndColumn),
        new Range(c2.modifiedStartLineNumber, c2.modifiedStartColumn, c2.modifiedEndLineNumber, c2.modifiedEndColumn)
      )));
      if (lastChange) {
        if (lastChange.modified.endLineNumberExclusive === change.modified.startLineNumber || lastChange.original.endLineNumberExclusive === change.original.startLineNumber) {
          change = new DetailedLineRangeMapping(
            lastChange.original.join(change.original),
            lastChange.modified.join(change.modified),
            lastChange.innerChanges && change.innerChanges ? lastChange.innerChanges.concat(change.innerChanges) : void 0
          );
          changes.pop();
        }
      }
      changes.push(change);
      lastChange = change;
    }
    assertFn(() => {
      return checkAdjacentItems(
        changes,
        (m1, m2) => m2.original.startLineNumber - m1.original.endLineNumberExclusive === m2.modified.startLineNumber - m1.modified.endLineNumberExclusive && // There has to be an unchanged line in between (otherwise both diffs should have been joined)
        m1.original.endLineNumberExclusive < m2.original.startLineNumber && m1.modified.endLineNumberExclusive < m2.modified.startLineNumber
      );
    });
    return new LinesDiff(changes, [], result.quitEarly);
  }
}
function computeDiff(originalSequence, modifiedSequence, continueProcessingPredicate, pretty) {
  const diffAlgo = new LcsDiff(originalSequence, modifiedSequence, continueProcessingPredicate);
  return diffAlgo.ComputeDiff(pretty);
}
class LineSequence {
  constructor(lines) {
    const startColumns = [];
    const endColumns = [];
    for (let i = 0, length = lines.length; i < length; i++) {
      startColumns[i] = getFirstNonBlankColumn(lines[i], 1);
      endColumns[i] = getLastNonBlankColumn(lines[i], 1);
    }
    this.lines = lines;
    this._startColumns = startColumns;
    this._endColumns = endColumns;
  }
  getElements() {
    const elements = [];
    for (let i = 0, len = this.lines.length; i < len; i++) {
      elements[i] = this.lines[i].substring(this._startColumns[i] - 1, this._endColumns[i] - 1);
    }
    return elements;
  }
  getStrictElement(index) {
    return this.lines[index];
  }
  getStartLineNumber(i) {
    return i + 1;
  }
  getEndLineNumber(i) {
    return i + 1;
  }
  createCharSequence(shouldIgnoreTrimWhitespace, startIndex, endIndex) {
    const charCodes = [];
    const lineNumbers = [];
    const columns = [];
    let len = 0;
    for (let index = startIndex; index <= endIndex; index++) {
      const lineContent = this.lines[index];
      const startColumn = shouldIgnoreTrimWhitespace ? this._startColumns[index] : 1;
      const endColumn = shouldIgnoreTrimWhitespace ? this._endColumns[index] : lineContent.length + 1;
      for (let col = startColumn; col < endColumn; col++) {
        charCodes[len] = lineContent.charCodeAt(col - 1);
        lineNumbers[len] = index + 1;
        columns[len] = col;
        len++;
      }
      if (!shouldIgnoreTrimWhitespace && index < endIndex) {
        charCodes[len] = CharCode.LineFeed;
        lineNumbers[len] = index + 1;
        columns[len] = lineContent.length + 1;
        len++;
      }
    }
    return new CharSequence(charCodes, lineNumbers, columns);
  }
}
class CharSequence {
  constructor(charCodes, lineNumbers, columns) {
    this._charCodes = charCodes;
    this._lineNumbers = lineNumbers;
    this._columns = columns;
  }
  toString() {
    return "[" + this._charCodes.map((s, idx) => (s === CharCode.LineFeed ? "\\n" : String.fromCharCode(s)) + `-(${this._lineNumbers[idx]},${this._columns[idx]})`).join(", ") + "]";
  }
  _assertIndex(index, arr) {
    if (index < 0 || index >= arr.length) {
      throw new Error(`Illegal index`);
    }
  }
  getElements() {
    return this._charCodes;
  }
  getStartLineNumber(i) {
    if (i > 0 && i === this._lineNumbers.length) {
      return this.getEndLineNumber(i - 1);
    }
    this._assertIndex(i, this._lineNumbers);
    return this._lineNumbers[i];
  }
  getEndLineNumber(i) {
    if (i === -1) {
      return this.getStartLineNumber(i + 1);
    }
    this._assertIndex(i, this._lineNumbers);
    if (this._charCodes[i] === CharCode.LineFeed) {
      return this._lineNumbers[i] + 1;
    }
    return this._lineNumbers[i];
  }
  getStartColumn(i) {
    if (i > 0 && i === this._columns.length) {
      return this.getEndColumn(i - 1);
    }
    this._assertIndex(i, this._columns);
    return this._columns[i];
  }
  getEndColumn(i) {
    if (i === -1) {
      return this.getStartColumn(i + 1);
    }
    this._assertIndex(i, this._columns);
    if (this._charCodes[i] === CharCode.LineFeed) {
      return 1;
    }
    return this._columns[i] + 1;
  }
}
class CharChange {
  constructor(originalStartLineNumber, originalStartColumn, originalEndLineNumber, originalEndColumn, modifiedStartLineNumber, modifiedStartColumn, modifiedEndLineNumber, modifiedEndColumn) {
    this.originalStartLineNumber = originalStartLineNumber;
    this.originalStartColumn = originalStartColumn;
    this.originalEndLineNumber = originalEndLineNumber;
    this.originalEndColumn = originalEndColumn;
    this.modifiedStartLineNumber = modifiedStartLineNumber;
    this.modifiedStartColumn = modifiedStartColumn;
    this.modifiedEndLineNumber = modifiedEndLineNumber;
    this.modifiedEndColumn = modifiedEndColumn;
  }
  static createFromDiffChange(diffChange, originalCharSequence, modifiedCharSequence) {
    const originalStartLineNumber = originalCharSequence.getStartLineNumber(diffChange.originalStart);
    const originalStartColumn = originalCharSequence.getStartColumn(diffChange.originalStart);
    const originalEndLineNumber = originalCharSequence.getEndLineNumber(diffChange.originalStart + diffChange.originalLength - 1);
    const originalEndColumn = originalCharSequence.getEndColumn(diffChange.originalStart + diffChange.originalLength - 1);
    const modifiedStartLineNumber = modifiedCharSequence.getStartLineNumber(diffChange.modifiedStart);
    const modifiedStartColumn = modifiedCharSequence.getStartColumn(diffChange.modifiedStart);
    const modifiedEndLineNumber = modifiedCharSequence.getEndLineNumber(diffChange.modifiedStart + diffChange.modifiedLength - 1);
    const modifiedEndColumn = modifiedCharSequence.getEndColumn(diffChange.modifiedStart + diffChange.modifiedLength - 1);
    return new CharChange(
      originalStartLineNumber,
      originalStartColumn,
      originalEndLineNumber,
      originalEndColumn,
      modifiedStartLineNumber,
      modifiedStartColumn,
      modifiedEndLineNumber,
      modifiedEndColumn
    );
  }
}
function postProcessCharChanges(rawChanges) {
  if (rawChanges.length <= 1) {
    return rawChanges;
  }
  const result = [rawChanges[0]];
  let prevChange = result[0];
  for (let i = 1, len = rawChanges.length; i < len; i++) {
    const currChange = rawChanges[i];
    const originalMatchingLength = currChange.originalStart - (prevChange.originalStart + prevChange.originalLength);
    const modifiedMatchingLength = currChange.modifiedStart - (prevChange.modifiedStart + prevChange.modifiedLength);
    const matchingLength = Math.min(originalMatchingLength, modifiedMatchingLength);
    if (matchingLength < MINIMUM_MATCHING_CHARACTER_LENGTH) {
      prevChange.originalLength = currChange.originalStart + currChange.originalLength - prevChange.originalStart;
      prevChange.modifiedLength = currChange.modifiedStart + currChange.modifiedLength - prevChange.modifiedStart;
    } else {
      result.push(currChange);
      prevChange = currChange;
    }
  }
  return result;
}
class LineChange {
  constructor(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges) {
    this.originalStartLineNumber = originalStartLineNumber;
    this.originalEndLineNumber = originalEndLineNumber;
    this.modifiedStartLineNumber = modifiedStartLineNumber;
    this.modifiedEndLineNumber = modifiedEndLineNumber;
    this.charChanges = charChanges;
  }
  static createFromDiffResult(shouldIgnoreTrimWhitespace, diffChange, originalLineSequence, modifiedLineSequence, continueCharDiff, shouldComputeCharChanges, shouldPostProcessCharChanges) {
    let originalStartLineNumber;
    let originalEndLineNumber;
    let modifiedStartLineNumber;
    let modifiedEndLineNumber;
    let charChanges = void 0;
    if (diffChange.originalLength === 0) {
      originalStartLineNumber = originalLineSequence.getStartLineNumber(diffChange.originalStart) - 1;
      originalEndLineNumber = 0;
    } else {
      originalStartLineNumber = originalLineSequence.getStartLineNumber(diffChange.originalStart);
      originalEndLineNumber = originalLineSequence.getEndLineNumber(diffChange.originalStart + diffChange.originalLength - 1);
    }
    if (diffChange.modifiedLength === 0) {
      modifiedStartLineNumber = modifiedLineSequence.getStartLineNumber(diffChange.modifiedStart) - 1;
      modifiedEndLineNumber = 0;
    } else {
      modifiedStartLineNumber = modifiedLineSequence.getStartLineNumber(diffChange.modifiedStart);
      modifiedEndLineNumber = modifiedLineSequence.getEndLineNumber(diffChange.modifiedStart + diffChange.modifiedLength - 1);
    }
    if (shouldComputeCharChanges && diffChange.originalLength > 0 && diffChange.originalLength < 20 && diffChange.modifiedLength > 0 && diffChange.modifiedLength < 20 && continueCharDiff()) {
      const originalCharSequence = originalLineSequence.createCharSequence(shouldIgnoreTrimWhitespace, diffChange.originalStart, diffChange.originalStart + diffChange.originalLength - 1);
      const modifiedCharSequence = modifiedLineSequence.createCharSequence(shouldIgnoreTrimWhitespace, diffChange.modifiedStart, diffChange.modifiedStart + diffChange.modifiedLength - 1);
      if (originalCharSequence.getElements().length > 0 && modifiedCharSequence.getElements().length > 0) {
        let rawChanges = computeDiff(originalCharSequence, modifiedCharSequence, continueCharDiff, true).changes;
        if (shouldPostProcessCharChanges) {
          rawChanges = postProcessCharChanges(rawChanges);
        }
        charChanges = [];
        for (let i = 0, length = rawChanges.length; i < length; i++) {
          charChanges.push(CharChange.createFromDiffChange(rawChanges[i], originalCharSequence, modifiedCharSequence));
        }
      }
    }
    return new LineChange(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges);
  }
}
class DiffComputer {
  constructor(originalLines, modifiedLines, opts) {
    this.shouldComputeCharChanges = opts.shouldComputeCharChanges;
    this.shouldPostProcessCharChanges = opts.shouldPostProcessCharChanges;
    this.shouldIgnoreTrimWhitespace = opts.shouldIgnoreTrimWhitespace;
    this.shouldMakePrettyDiff = opts.shouldMakePrettyDiff;
    this.originalLines = originalLines;
    this.modifiedLines = modifiedLines;
    this.original = new LineSequence(originalLines);
    this.modified = new LineSequence(modifiedLines);
    this.continueLineDiff = createContinueProcessingPredicate(opts.maxComputationTime);
    this.continueCharDiff = createContinueProcessingPredicate(opts.maxComputationTime === 0 ? 0 : Math.min(opts.maxComputationTime, 5e3));
  }
  computeDiff() {
    if (this.original.lines.length === 1 && this.original.lines[0].length === 0) {
      if (this.modified.lines.length === 1 && this.modified.lines[0].length === 0) {
        return {
          quitEarly: false,
          changes: []
        };
      }
      return {
        quitEarly: false,
        changes: [{
          originalStartLineNumber: 1,
          originalEndLineNumber: 1,
          modifiedStartLineNumber: 1,
          modifiedEndLineNumber: this.modified.lines.length,
          charChanges: void 0
        }]
      };
    }
    if (this.modified.lines.length === 1 && this.modified.lines[0].length === 0) {
      return {
        quitEarly: false,
        changes: [{
          originalStartLineNumber: 1,
          originalEndLineNumber: this.original.lines.length,
          modifiedStartLineNumber: 1,
          modifiedEndLineNumber: 1,
          charChanges: void 0
        }]
      };
    }
    const diffResult = computeDiff(this.original, this.modified, this.continueLineDiff, this.shouldMakePrettyDiff);
    const rawChanges = diffResult.changes;
    const quitEarly = diffResult.quitEarly;
    if (this.shouldIgnoreTrimWhitespace) {
      const lineChanges = [];
      for (let i = 0, length = rawChanges.length; i < length; i++) {
        lineChanges.push(LineChange.createFromDiffResult(this.shouldIgnoreTrimWhitespace, rawChanges[i], this.original, this.modified, this.continueCharDiff, this.shouldComputeCharChanges, this.shouldPostProcessCharChanges));
      }
      return {
        quitEarly,
        changes: lineChanges
      };
    }
    const result = [];
    let originalLineIndex = 0;
    let modifiedLineIndex = 0;
    for (let i = -1, len = rawChanges.length; i < len; i++) {
      const nextChange = i + 1 < len ? rawChanges[i + 1] : null;
      const originalStop = nextChange ? nextChange.originalStart : this.originalLines.length;
      const modifiedStop = nextChange ? nextChange.modifiedStart : this.modifiedLines.length;
      while (originalLineIndex < originalStop && modifiedLineIndex < modifiedStop) {
        const originalLine = this.originalLines[originalLineIndex];
        const modifiedLine = this.modifiedLines[modifiedLineIndex];
        if (originalLine !== modifiedLine) {
          {
            let originalStartColumn = getFirstNonBlankColumn(originalLine, 1);
            let modifiedStartColumn = getFirstNonBlankColumn(modifiedLine, 1);
            while (originalStartColumn > 1 && modifiedStartColumn > 1) {
              const originalChar = originalLine.charCodeAt(originalStartColumn - 2);
              const modifiedChar = modifiedLine.charCodeAt(modifiedStartColumn - 2);
              if (originalChar !== modifiedChar) {
                break;
              }
              originalStartColumn--;
              modifiedStartColumn--;
            }
            if (originalStartColumn > 1 || modifiedStartColumn > 1) {
              this._pushTrimWhitespaceCharChange(
                result,
                originalLineIndex + 1,
                1,
                originalStartColumn,
                modifiedLineIndex + 1,
                1,
                modifiedStartColumn
              );
            }
          }
          {
            let originalEndColumn = getLastNonBlankColumn(originalLine, 1);
            let modifiedEndColumn = getLastNonBlankColumn(modifiedLine, 1);
            const originalMaxColumn = originalLine.length + 1;
            const modifiedMaxColumn = modifiedLine.length + 1;
            while (originalEndColumn < originalMaxColumn && modifiedEndColumn < modifiedMaxColumn) {
              const originalChar = originalLine.charCodeAt(originalEndColumn - 1);
              const modifiedChar = originalLine.charCodeAt(modifiedEndColumn - 1);
              if (originalChar !== modifiedChar) {
                break;
              }
              originalEndColumn++;
              modifiedEndColumn++;
            }
            if (originalEndColumn < originalMaxColumn || modifiedEndColumn < modifiedMaxColumn) {
              this._pushTrimWhitespaceCharChange(
                result,
                originalLineIndex + 1,
                originalEndColumn,
                originalMaxColumn,
                modifiedLineIndex + 1,
                modifiedEndColumn,
                modifiedMaxColumn
              );
            }
          }
        }
        originalLineIndex++;
        modifiedLineIndex++;
      }
      if (nextChange) {
        result.push(LineChange.createFromDiffResult(this.shouldIgnoreTrimWhitespace, nextChange, this.original, this.modified, this.continueCharDiff, this.shouldComputeCharChanges, this.shouldPostProcessCharChanges));
        originalLineIndex += nextChange.originalLength;
        modifiedLineIndex += nextChange.modifiedLength;
      }
    }
    return {
      quitEarly,
      changes: result
    };
  }
  _pushTrimWhitespaceCharChange(result, originalLineNumber, originalStartColumn, originalEndColumn, modifiedLineNumber, modifiedStartColumn, modifiedEndColumn) {
    if (this._mergeTrimWhitespaceCharChange(result, originalLineNumber, originalStartColumn, originalEndColumn, modifiedLineNumber, modifiedStartColumn, modifiedEndColumn)) {
      return;
    }
    let charChanges = void 0;
    if (this.shouldComputeCharChanges) {
      charChanges = [new CharChange(
        originalLineNumber,
        originalStartColumn,
        originalLineNumber,
        originalEndColumn,
        modifiedLineNumber,
        modifiedStartColumn,
        modifiedLineNumber,
        modifiedEndColumn
      )];
    }
    result.push(new LineChange(
      originalLineNumber,
      originalLineNumber,
      modifiedLineNumber,
      modifiedLineNumber,
      charChanges
    ));
  }
  _mergeTrimWhitespaceCharChange(result, originalLineNumber, originalStartColumn, originalEndColumn, modifiedLineNumber, modifiedStartColumn, modifiedEndColumn) {
    const len = result.length;
    if (len === 0) {
      return false;
    }
    const prevChange = result[len - 1];
    if (prevChange.originalEndLineNumber === 0 || prevChange.modifiedEndLineNumber === 0) {
      return false;
    }
    if (prevChange.originalEndLineNumber === originalLineNumber && prevChange.modifiedEndLineNumber === modifiedLineNumber) {
      if (this.shouldComputeCharChanges && prevChange.charChanges) {
        prevChange.charChanges.push(new CharChange(
          originalLineNumber,
          originalStartColumn,
          originalLineNumber,
          originalEndColumn,
          modifiedLineNumber,
          modifiedStartColumn,
          modifiedLineNumber,
          modifiedEndColumn
        ));
      }
      return true;
    }
    if (prevChange.originalEndLineNumber + 1 === originalLineNumber && prevChange.modifiedEndLineNumber + 1 === modifiedLineNumber) {
      prevChange.originalEndLineNumber = originalLineNumber;
      prevChange.modifiedEndLineNumber = modifiedLineNumber;
      if (this.shouldComputeCharChanges && prevChange.charChanges) {
        prevChange.charChanges.push(new CharChange(
          originalLineNumber,
          originalStartColumn,
          originalLineNumber,
          originalEndColumn,
          modifiedLineNumber,
          modifiedStartColumn,
          modifiedLineNumber,
          modifiedEndColumn
        ));
      }
      return true;
    }
    return false;
  }
}
function getFirstNonBlankColumn(txt, defaultValue) {
  const r = strings.firstNonWhitespaceIndex(txt);
  if (r === -1) {
    return defaultValue;
  }
  return r + 1;
}
function getLastNonBlankColumn(txt, defaultValue) {
  const r = strings.lastNonWhitespaceIndex(txt);
  if (r === -1) {
    return defaultValue;
  }
  return r + 2;
}
function createContinueProcessingPredicate(maximumRuntime) {
  if (maximumRuntime === 0) {
    return () => true;
  }
  const startTime = Date.now();
  return () => {
    return Date.now() - startTime < maximumRuntime;
  };
}
export {
  DiffComputer,
  LegacyLinesDiffComputer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcZGlmZlxcbGVnYWN5TGluZXNEaWZmQ29tcHV0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IElEaWZmQ2hhbmdlLCBJU2VxdWVuY2UsIExjc0RpZmYsIElEaWZmUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGlmZi9kaWZmLmpzJztcbmltcG9ydCB7IElMaW5lc0RpZmZDb21wdXRlciwgSUxpbmVzRGlmZkNvbXB1dGVyT3B0aW9ucywgTGluZXNEaWZmIH0gZnJvbSAnLi9saW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBSYW5nZU1hcHBpbmcsIERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4vcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgYXNzZXJ0Rm4sIGNoZWNrQWRqYWNlbnRJdGVtcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuXG5jb25zdCBNSU5JTVVNX01BVENISU5HX0NIQVJBQ1RFUl9MRU5HVEggPSAzO1xuXG5leHBvcnQgY2xhc3MgTGVnYWN5TGluZXNEaWZmQ29tcHV0ZXIgaW1wbGVtZW50cyBJTGluZXNEaWZmQ29tcHV0ZXIge1xuXHRjb21wdXRlRGlmZihvcmlnaW5hbExpbmVzOiBzdHJpbmdbXSwgbW9kaWZpZWRMaW5lczogc3RyaW5nW10sIG9wdGlvbnM6IElMaW5lc0RpZmZDb21wdXRlck9wdGlvbnMpOiBMaW5lc0RpZmYge1xuXHRcdGNvbnN0IGRpZmZDb21wdXRlciA9IG5ldyBEaWZmQ29tcHV0ZXIob3JpZ2luYWxMaW5lcywgbW9kaWZpZWRMaW5lcywge1xuXHRcdFx0bWF4Q29tcHV0YXRpb25UaW1lOiBvcHRpb25zLm1heENvbXB1dGF0aW9uVGltZU1zLFxuXHRcdFx0c2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2U6IG9wdGlvbnMuaWdub3JlVHJpbVdoaXRlc3BhY2UsXG5cdFx0XHRzaG91bGRDb21wdXRlQ2hhckNoYW5nZXM6IHRydWUsXG5cdFx0XHRzaG91bGRNYWtlUHJldHR5RGlmZjogdHJ1ZSxcblx0XHRcdHNob3VsZFBvc3RQcm9jZXNzQ2hhckNoYW5nZXM6IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGlmZkNvbXB1dGVyLmNvbXB1dGVEaWZmKCk7XG5cdFx0Y29uc3QgY2hhbmdlczogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10gPSBbXTtcblx0XHRsZXQgbGFzdENoYW5nZTogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nIHwgbnVsbCA9IG51bGw7XG5cblxuXHRcdGZvciAoY29uc3QgYyBvZiByZXN1bHQuY2hhbmdlcykge1xuXHRcdFx0bGV0IG9yaWdpbmFsUmFuZ2U6IExpbmVSYW5nZTtcblx0XHRcdGlmIChjLm9yaWdpbmFsRW5kTGluZU51bWJlciA9PT0gMCkge1xuXHRcdFx0XHQvLyBJbnNlcnRpb25cblx0XHRcdFx0b3JpZ2luYWxSYW5nZSA9IG5ldyBMaW5lUmFuZ2UoYy5vcmlnaW5hbFN0YXJ0TGluZU51bWJlciArIDEsIGMub3JpZ2luYWxTdGFydExpbmVOdW1iZXIgKyAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9yaWdpbmFsUmFuZ2UgPSBuZXcgTGluZVJhbmdlKGMub3JpZ2luYWxTdGFydExpbmVOdW1iZXIsIGMub3JpZ2luYWxFbmRMaW5lTnVtYmVyICsgMSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBtb2RpZmllZFJhbmdlOiBMaW5lUmFuZ2U7XG5cdFx0XHRpZiAoYy5tb2RpZmllZEVuZExpbmVOdW1iZXIgPT09IDApIHtcblx0XHRcdFx0Ly8gRGVsZXRpb25cblx0XHRcdFx0bW9kaWZpZWRSYW5nZSA9IG5ldyBMaW5lUmFuZ2UoYy5tb2RpZmllZFN0YXJ0TGluZU51bWJlciArIDEsIGMubW9kaWZpZWRTdGFydExpbmVOdW1iZXIgKyAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1vZGlmaWVkUmFuZ2UgPSBuZXcgTGluZVJhbmdlKGMubW9kaWZpZWRTdGFydExpbmVOdW1iZXIsIGMubW9kaWZpZWRFbmRMaW5lTnVtYmVyICsgMSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjaGFuZ2UgPSBuZXcgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKG9yaWdpbmFsUmFuZ2UsIG1vZGlmaWVkUmFuZ2UsIGMuY2hhckNoYW5nZXM/Lm1hcChjID0+IG5ldyBSYW5nZU1hcHBpbmcoXG5cdFx0XHRcdG5ldyBSYW5nZShjLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLCBjLm9yaWdpbmFsU3RhcnRDb2x1bW4sIGMub3JpZ2luYWxFbmRMaW5lTnVtYmVyLCBjLm9yaWdpbmFsRW5kQ29sdW1uKSxcblx0XHRcdFx0bmV3IFJhbmdlKGMubW9kaWZpZWRTdGFydExpbmVOdW1iZXIsIGMubW9kaWZpZWRTdGFydENvbHVtbiwgYy5tb2RpZmllZEVuZExpbmVOdW1iZXIsIGMubW9kaWZpZWRFbmRDb2x1bW4pLFxuXHRcdFx0KSkpO1xuXHRcdFx0aWYgKGxhc3RDaGFuZ2UpIHtcblx0XHRcdFx0aWYgKGxhc3RDaGFuZ2UubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA9PT0gY2hhbmdlLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlclxuXHRcdFx0XHRcdHx8IGxhc3RDaGFuZ2Uub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA9PT0gY2hhbmdlLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRcdC8vIGpvaW4gdG91Y2hpbmcgZGlmZnMuIFByb2JhYmx5IG1vdmluZyBkaWZmcyB1cC9kb3duIGluIHRoZSBhbGdvcml0aG0gY2F1c2VzIHRvdWNoaW5nIGRpZmZzLlxuXHRcdFx0XHRcdGNoYW5nZSA9IG5ldyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcoXG5cdFx0XHRcdFx0XHRsYXN0Q2hhbmdlLm9yaWdpbmFsLmpvaW4oY2hhbmdlLm9yaWdpbmFsKSxcblx0XHRcdFx0XHRcdGxhc3RDaGFuZ2UubW9kaWZpZWQuam9pbihjaGFuZ2UubW9kaWZpZWQpLFxuXHRcdFx0XHRcdFx0bGFzdENoYW5nZS5pbm5lckNoYW5nZXMgJiYgY2hhbmdlLmlubmVyQ2hhbmdlcyA/XG5cdFx0XHRcdFx0XHRcdGxhc3RDaGFuZ2UuaW5uZXJDaGFuZ2VzLmNvbmNhdChjaGFuZ2UuaW5uZXJDaGFuZ2VzKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0Y2hhbmdlcy5wb3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjaGFuZ2VzLnB1c2goY2hhbmdlKTtcblx0XHRcdGxhc3RDaGFuZ2UgPSBjaGFuZ2U7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Rm4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNoZWNrQWRqYWNlbnRJdGVtcyhjaGFuZ2VzLFxuXHRcdFx0XHQobTEsIG0yKSA9PiBtMi5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgLSBtMS5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlID09PSBtMi5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgLSBtMS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlICYmXG5cdFx0XHRcdFx0Ly8gVGhlcmUgaGFzIHRvIGJlIGFuIHVuY2hhbmdlZCBsaW5lIGluIGJldHdlZW4gKG90aGVyd2lzZSBib3RoIGRpZmZzIHNob3VsZCBoYXZlIGJlZW4gam9pbmVkKVxuXHRcdFx0XHRcdG0xLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPCBtMi5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgJiZcblx0XHRcdFx0XHRtMS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIDwgbTIubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBuZXcgTGluZXNEaWZmKGNoYW5nZXMsIFtdLCByZXN1bHQucXVpdEVhcmx5KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaWZmQ29tcHV0YXRpb25SZXN1bHQge1xuXHRxdWl0RWFybHk6IGJvb2xlYW47XG5cdGlkZW50aWNhbDogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIGNoYW5nZXMgYXMgKGxlZ2FjeSkgbGluZSBjaGFuZ2UgYXJyYXkuXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBgY2hhbmdlczJgIGluc3RlYWQuXG5cdCAqL1xuXHRjaGFuZ2VzOiBJTGluZUNoYW5nZVtdO1xuXG5cdC8qKlxuXHQgKiBUaGUgY2hhbmdlcyBhcyAobW9kZXJuKSBsaW5lIHJhbmdlIG1hcHBpbmcgYXJyYXkuXG5cdCAqL1xuXHRjaGFuZ2VzMjogcmVhZG9ubHkgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW107XG59XG5cbi8qKlxuICogQSBjaGFuZ2VcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhbmdlIHtcblx0cmVhZG9ubHkgb3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cmVhZG9ubHkgb3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1vZGlmaWVkRW5kTGluZU51bWJlcjogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgY2hhcmFjdGVyIGxldmVsIGNoYW5nZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhckNoYW5nZSBleHRlbmRzIElDaGFuZ2Uge1xuXHRyZWFkb25seSBvcmlnaW5hbFN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdHJlYWRvbmx5IG9yaWdpbmFsRW5kQ29sdW1uOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1vZGlmaWVkU3RhcnRDb2x1bW46IG51bWJlcjtcblx0cmVhZG9ubHkgbW9kaWZpZWRFbmRDb2x1bW46IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIGxpbmUgY2hhbmdlXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUxpbmVDaGFuZ2UgZXh0ZW5kcyBJQ2hhbmdlIHtcblx0cmVhZG9ubHkgY2hhckNoYW5nZXM6IElDaGFyQ2hhbmdlW10gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpZmZDb21wdXRlclJlc3VsdCB7XG5cdHF1aXRFYXJseTogYm9vbGVhbjtcblx0Y2hhbmdlczogSUxpbmVDaGFuZ2VbXTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZURpZmYob3JpZ2luYWxTZXF1ZW5jZTogSVNlcXVlbmNlLCBtb2RpZmllZFNlcXVlbmNlOiBJU2VxdWVuY2UsIGNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZTogKCkgPT4gYm9vbGVhbiwgcHJldHR5OiBib29sZWFuKTogSURpZmZSZXN1bHQge1xuXHRjb25zdCBkaWZmQWxnbyA9IG5ldyBMY3NEaWZmKG9yaWdpbmFsU2VxdWVuY2UsIG1vZGlmaWVkU2VxdWVuY2UsIGNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZSk7XG5cdHJldHVybiBkaWZmQWxnby5Db21wdXRlRGlmZihwcmV0dHkpO1xufVxuXG5jbGFzcyBMaW5lU2VxdWVuY2UgaW1wbGVtZW50cyBJU2VxdWVuY2Uge1xuXG5cdHB1YmxpYyByZWFkb25seSBsaW5lczogc3RyaW5nW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXJ0Q29sdW1uczogbnVtYmVyW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuZENvbHVtbnM6IG51bWJlcltdO1xuXG5cdGNvbnN0cnVjdG9yKGxpbmVzOiBzdHJpbmdbXSkge1xuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBlbmRDb2x1bW5zOiBudW1iZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW5ndGggPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0c3RhcnRDb2x1bW5zW2ldID0gZ2V0Rmlyc3ROb25CbGFua0NvbHVtbihsaW5lc1tpXSwgMSk7XG5cdFx0XHRlbmRDb2x1bW5zW2ldID0gZ2V0TGFzdE5vbkJsYW5rQ29sdW1uKGxpbmVzW2ldLCAxKTtcblx0XHR9XG5cdFx0dGhpcy5saW5lcyA9IGxpbmVzO1xuXHRcdHRoaXMuX3N0YXJ0Q29sdW1ucyA9IHN0YXJ0Q29sdW1ucztcblx0XHR0aGlzLl9lbmRDb2x1bW5zID0gZW5kQ29sdW1ucztcblx0fVxuXG5cdHB1YmxpYyBnZXRFbGVtZW50cygpOiBJbnQzMkFycmF5IHwgbnVtYmVyW10gfCBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgZWxlbWVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMubGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGVsZW1lbnRzW2ldID0gdGhpcy5saW5lc1tpXS5zdWJzdHJpbmcodGhpcy5fc3RhcnRDb2x1bW5zW2ldIC0gMSwgdGhpcy5fZW5kQ29sdW1uc1tpXSAtIDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gZWxlbWVudHM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RyaWN0RWxlbWVudChpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5saW5lc1tpbmRleF07XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RhcnRMaW5lTnVtYmVyKGk6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIGkgKyAxO1xuXHR9XG5cblx0cHVibGljIGdldEVuZExpbmVOdW1iZXIoaTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gaSArIDE7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQ2hhclNlcXVlbmNlKHNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlOiBib29sZWFuLCBzdGFydEluZGV4OiBudW1iZXIsIGVuZEluZGV4OiBudW1iZXIpOiBDaGFyU2VxdWVuY2Uge1xuXHRcdGNvbnN0IGNoYXJDb2RlczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBsaW5lTnVtYmVyczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBjb2x1bW5zOiBudW1iZXJbXSA9IFtdO1xuXHRcdGxldCBsZW4gPSAwO1xuXHRcdGZvciAobGV0IGluZGV4ID0gc3RhcnRJbmRleDsgaW5kZXggPD0gZW5kSW5kZXg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gdGhpcy5saW5lc1tpbmRleF07XG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IChzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZSA/IHRoaXMuX3N0YXJ0Q29sdW1uc1tpbmRleF0gOiAxKTtcblx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IChzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZSA/IHRoaXMuX2VuZENvbHVtbnNbaW5kZXhdIDogbGluZUNvbnRlbnQubGVuZ3RoICsgMSk7XG5cdFx0XHRmb3IgKGxldCBjb2wgPSBzdGFydENvbHVtbjsgY29sIDwgZW5kQ29sdW1uOyBjb2wrKykge1xuXHRcdFx0XHRjaGFyQ29kZXNbbGVuXSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY29sIC0gMSk7XG5cdFx0XHRcdGxpbmVOdW1iZXJzW2xlbl0gPSBpbmRleCArIDE7XG5cdFx0XHRcdGNvbHVtbnNbbGVuXSA9IGNvbDtcblx0XHRcdFx0bGVuKys7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlICYmIGluZGV4IDwgZW5kSW5kZXgpIHtcblx0XHRcdFx0Ly8gQWRkIFxcbiBpZiB0cmltIHdoaXRlc3BhY2UgaXMgbm90IGlnbm9yZWRcblx0XHRcdFx0Y2hhckNvZGVzW2xlbl0gPSBDaGFyQ29kZS5MaW5lRmVlZDtcblx0XHRcdFx0bGluZU51bWJlcnNbbGVuXSA9IGluZGV4ICsgMTtcblx0XHRcdFx0Y29sdW1uc1tsZW5dID0gbGluZUNvbnRlbnQubGVuZ3RoICsgMTtcblx0XHRcdFx0bGVuKys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgQ2hhclNlcXVlbmNlKGNoYXJDb2RlcywgbGluZU51bWJlcnMsIGNvbHVtbnMpO1xuXHR9XG59XG5cbmNsYXNzIENoYXJTZXF1ZW5jZSBpbXBsZW1lbnRzIElTZXF1ZW5jZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhckNvZGVzOiBudW1iZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGluZU51bWJlcnM6IG51bWJlcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2x1bW5zOiBudW1iZXJbXTtcblxuXHRjb25zdHJ1Y3RvcihjaGFyQ29kZXM6IG51bWJlcltdLCBsaW5lTnVtYmVyczogbnVtYmVyW10sIGNvbHVtbnM6IG51bWJlcltdKSB7XG5cdFx0dGhpcy5fY2hhckNvZGVzID0gY2hhckNvZGVzO1xuXHRcdHRoaXMuX2xpbmVOdW1iZXJzID0gbGluZU51bWJlcnM7XG5cdFx0dGhpcy5fY29sdW1ucyA9IGNvbHVtbnM7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKSB7XG5cdFx0cmV0dXJuIChcblx0XHRcdCdbJyArIHRoaXMuX2NoYXJDb2Rlcy5tYXAoKHMsIGlkeCkgPT4gKHMgPT09IENoYXJDb2RlLkxpbmVGZWVkID8gJ1xcXFxuJyA6IFN0cmluZy5mcm9tQ2hhckNvZGUocykpICsgYC0oJHt0aGlzLl9saW5lTnVtYmVyc1tpZHhdfSwke3RoaXMuX2NvbHVtbnNbaWR4XX0pYCkuam9pbignLCAnKSArICddJ1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9hc3NlcnRJbmRleChpbmRleDogbnVtYmVyLCBhcnI6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSBhcnIubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYElsbGVnYWwgaW5kZXhgKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWxlbWVudHMoKTogSW50MzJBcnJheSB8IG51bWJlcltdIHwgc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9jaGFyQ29kZXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RhcnRMaW5lTnVtYmVyKGk6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGkgPiAwICYmIGkgPT09IHRoaXMuX2xpbmVOdW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0Ly8gdGhlIHN0YXJ0IGxpbmUgbnVtYmVyIG9mIHRoZSBlbGVtZW50IGFmdGVyIHRoZSBsYXN0IGVsZW1lbnRcblx0XHRcdC8vIGlzIHRoZSBlbmQgbGluZSBudW1iZXIgb2YgdGhlIGxhc3QgZWxlbWVudFxuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0RW5kTGluZU51bWJlcihpIC0gMSk7XG5cdFx0fVxuXHRcdHRoaXMuX2Fzc2VydEluZGV4KGksIHRoaXMuX2xpbmVOdW1iZXJzKTtcblxuXHRcdHJldHVybiB0aGlzLl9saW5lTnVtYmVyc1tpXTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmRMaW5lTnVtYmVyKGk6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGkgPT09IC0xKSB7XG5cdFx0XHQvLyB0aGUgZW5kIGxpbmUgbnVtYmVyIG9mIHRoZSBlbGVtZW50IGJlZm9yZSB0aGUgZmlyc3QgZWxlbWVudFxuXHRcdFx0Ly8gaXMgdGhlIHN0YXJ0IGxpbmUgbnVtYmVyIG9mIHRoZSBmaXJzdCBlbGVtZW50XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRTdGFydExpbmVOdW1iZXIoaSArIDEpO1xuXHRcdH1cblx0XHR0aGlzLl9hc3NlcnRJbmRleChpLCB0aGlzLl9saW5lTnVtYmVycyk7XG5cblx0XHRpZiAodGhpcy5fY2hhckNvZGVzW2ldID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xpbmVOdW1iZXJzW2ldICsgMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVOdW1iZXJzW2ldO1xuXHR9XG5cblx0cHVibGljIGdldFN0YXJ0Q29sdW1uKGk6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGkgPiAwICYmIGkgPT09IHRoaXMuX2NvbHVtbnMubGVuZ3RoKSB7XG5cdFx0XHQvLyB0aGUgc3RhcnQgY29sdW1uIG9mIHRoZSBlbGVtZW50IGFmdGVyIHRoZSBsYXN0IGVsZW1lbnRcblx0XHRcdC8vIGlzIHRoZSBlbmQgY29sdW1uIG9mIHRoZSBsYXN0IGVsZW1lbnRcblx0XHRcdHJldHVybiB0aGlzLmdldEVuZENvbHVtbihpIC0gMSk7XG5cdFx0fVxuXHRcdHRoaXMuX2Fzc2VydEluZGV4KGksIHRoaXMuX2NvbHVtbnMpO1xuXHRcdHJldHVybiB0aGlzLl9jb2x1bW5zW2ldO1xuXHR9XG5cblx0cHVibGljIGdldEVuZENvbHVtbihpOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChpID09PSAtMSkge1xuXHRcdFx0Ly8gdGhlIGVuZCBjb2x1bW4gb2YgdGhlIGVsZW1lbnQgYmVmb3JlIHRoZSBmaXJzdCBlbGVtZW50XG5cdFx0XHQvLyBpcyB0aGUgc3RhcnQgY29sdW1uIG9mIHRoZSBmaXJzdCBlbGVtZW50XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRTdGFydENvbHVtbihpICsgMSk7XG5cdFx0fVxuXHRcdHRoaXMuX2Fzc2VydEluZGV4KGksIHRoaXMuX2NvbHVtbnMpO1xuXG5cdFx0aWYgKHRoaXMuX2NoYXJDb2Rlc1tpXSA9PT0gQ2hhckNvZGUuTGluZUZlZWQpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29sdW1uc1tpXSArIDE7XG5cdH1cbn1cblxuY2xhc3MgQ2hhckNoYW5nZSBpbXBsZW1lbnRzIElDaGFyQ2hhbmdlIHtcblxuXHRwdWJsaWMgb3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHVibGljIG9yaWdpbmFsU3RhcnRDb2x1bW46IG51bWJlcjtcblx0cHVibGljIG9yaWdpbmFsRW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgb3JpZ2luYWxFbmRDb2x1bW46IG51bWJlcjtcblxuXHRwdWJsaWMgbW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHVibGljIG1vZGlmaWVkU3RhcnRDb2x1bW46IG51bWJlcjtcblx0cHVibGljIG1vZGlmaWVkRW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgbW9kaWZpZWRFbmRDb2x1bW46IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbnVtYmVyLFxuXHRcdG9yaWdpbmFsU3RhcnRDb2x1bW46IG51bWJlcixcblx0XHRvcmlnaW5hbEVuZExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRvcmlnaW5hbEVuZENvbHVtbjogbnVtYmVyLFxuXHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0bW9kaWZpZWRTdGFydENvbHVtbjogbnVtYmVyLFxuXHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdG1vZGlmaWVkRW5kQ29sdW1uOiBudW1iZXJcblx0KSB7XG5cdFx0dGhpcy5vcmlnaW5hbFN0YXJ0TGluZU51bWJlciA9IG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyO1xuXHRcdHRoaXMub3JpZ2luYWxTdGFydENvbHVtbiA9IG9yaWdpbmFsU3RhcnRDb2x1bW47XG5cdFx0dGhpcy5vcmlnaW5hbEVuZExpbmVOdW1iZXIgPSBvcmlnaW5hbEVuZExpbmVOdW1iZXI7XG5cdFx0dGhpcy5vcmlnaW5hbEVuZENvbHVtbiA9IG9yaWdpbmFsRW5kQ29sdW1uO1xuXHRcdHRoaXMubW9kaWZpZWRTdGFydExpbmVOdW1iZXIgPSBtb2RpZmllZFN0YXJ0TGluZU51bWJlcjtcblx0XHR0aGlzLm1vZGlmaWVkU3RhcnRDb2x1bW4gPSBtb2RpZmllZFN0YXJ0Q29sdW1uO1xuXHRcdHRoaXMubW9kaWZpZWRFbmRMaW5lTnVtYmVyID0gbW9kaWZpZWRFbmRMaW5lTnVtYmVyO1xuXHRcdHRoaXMubW9kaWZpZWRFbmRDb2x1bW4gPSBtb2RpZmllZEVuZENvbHVtbjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlRnJvbURpZmZDaGFuZ2UoZGlmZkNoYW5nZTogSURpZmZDaGFuZ2UsIG9yaWdpbmFsQ2hhclNlcXVlbmNlOiBDaGFyU2VxdWVuY2UsIG1vZGlmaWVkQ2hhclNlcXVlbmNlOiBDaGFyU2VxdWVuY2UpOiBDaGFyQ2hhbmdlIHtcblx0XHRjb25zdCBvcmlnaW5hbFN0YXJ0TGluZU51bWJlciA9IG9yaWdpbmFsQ2hhclNlcXVlbmNlLmdldFN0YXJ0TGluZU51bWJlcihkaWZmQ2hhbmdlLm9yaWdpbmFsU3RhcnQpO1xuXHRcdGNvbnN0IG9yaWdpbmFsU3RhcnRDb2x1bW4gPSBvcmlnaW5hbENoYXJTZXF1ZW5jZS5nZXRTdGFydENvbHVtbihkaWZmQ2hhbmdlLm9yaWdpbmFsU3RhcnQpO1xuXHRcdGNvbnN0IG9yaWdpbmFsRW5kTGluZU51bWJlciA9IG9yaWdpbmFsQ2hhclNlcXVlbmNlLmdldEVuZExpbmVOdW1iZXIoZGlmZkNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgZGlmZkNoYW5nZS5vcmlnaW5hbExlbmd0aCAtIDEpO1xuXHRcdGNvbnN0IG9yaWdpbmFsRW5kQ29sdW1uID0gb3JpZ2luYWxDaGFyU2VxdWVuY2UuZ2V0RW5kQ29sdW1uKGRpZmZDaGFuZ2Uub3JpZ2luYWxTdGFydCArIGRpZmZDaGFuZ2Uub3JpZ2luYWxMZW5ndGggLSAxKTtcblxuXHRcdGNvbnN0IG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyID0gbW9kaWZpZWRDaGFyU2VxdWVuY2UuZ2V0U3RhcnRMaW5lTnVtYmVyKGRpZmZDaGFuZ2UubW9kaWZpZWRTdGFydCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRTdGFydENvbHVtbiA9IG1vZGlmaWVkQ2hhclNlcXVlbmNlLmdldFN0YXJ0Q29sdW1uKGRpZmZDaGFuZ2UubW9kaWZpZWRTdGFydCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRFbmRMaW5lTnVtYmVyID0gbW9kaWZpZWRDaGFyU2VxdWVuY2UuZ2V0RW5kTGluZU51bWJlcihkaWZmQ2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBkaWZmQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoIC0gMSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRFbmRDb2x1bW4gPSBtb2RpZmllZENoYXJTZXF1ZW5jZS5nZXRFbmRDb2x1bW4oZGlmZkNoYW5nZS5tb2RpZmllZFN0YXJ0ICsgZGlmZkNoYW5nZS5tb2RpZmllZExlbmd0aCAtIDEpO1xuXG5cdFx0cmV0dXJuIG5ldyBDaGFyQ2hhbmdlKFxuXHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXIsIG9yaWdpbmFsU3RhcnRDb2x1bW4sIG9yaWdpbmFsRW5kTGluZU51bWJlciwgb3JpZ2luYWxFbmRDb2x1bW4sXG5cdFx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlciwgbW9kaWZpZWRTdGFydENvbHVtbiwgbW9kaWZpZWRFbmRMaW5lTnVtYmVyLCBtb2RpZmllZEVuZENvbHVtbixcblx0XHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHBvc3RQcm9jZXNzQ2hhckNoYW5nZXMocmF3Q2hhbmdlczogSURpZmZDaGFuZ2VbXSk6IElEaWZmQ2hhbmdlW10ge1xuXHRpZiAocmF3Q2hhbmdlcy5sZW5ndGggPD0gMSkge1xuXHRcdHJldHVybiByYXdDaGFuZ2VzO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0ID0gW3Jhd0NoYW5nZXNbMF1dO1xuXHRsZXQgcHJldkNoYW5nZSA9IHJlc3VsdFswXTtcblxuXHRmb3IgKGxldCBpID0gMSwgbGVuID0gcmF3Q2hhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGN1cnJDaGFuZ2UgPSByYXdDaGFuZ2VzW2ldO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxNYXRjaGluZ0xlbmd0aCA9IGN1cnJDaGFuZ2Uub3JpZ2luYWxTdGFydCAtIChwcmV2Q2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBwcmV2Q2hhbmdlLm9yaWdpbmFsTGVuZ3RoKTtcblx0XHRjb25zdCBtb2RpZmllZE1hdGNoaW5nTGVuZ3RoID0gY3VyckNoYW5nZS5tb2RpZmllZFN0YXJ0IC0gKHByZXZDaGFuZ2UubW9kaWZpZWRTdGFydCArIHByZXZDaGFuZ2UubW9kaWZpZWRMZW5ndGgpO1xuXHRcdC8vIEJvdGggb2YgdGhlIGFib3ZlIHNob3VsZCBiZSBlcXVhbCwgYnV0IHRoZSBjb250aW51ZVByb2Nlc3NpbmdQcmVkaWNhdGUgbWF5IHByZXZlbnQgdGhpcyBmcm9tIGJlaW5nIHRydWVcblx0XHRjb25zdCBtYXRjaGluZ0xlbmd0aCA9IE1hdGgubWluKG9yaWdpbmFsTWF0Y2hpbmdMZW5ndGgsIG1vZGlmaWVkTWF0Y2hpbmdMZW5ndGgpO1xuXG5cdFx0aWYgKG1hdGNoaW5nTGVuZ3RoIDwgTUlOSU1VTV9NQVRDSElOR19DSEFSQUNURVJfTEVOR1RIKSB7XG5cdFx0XHQvLyBNZXJnZSB0aGUgY3VycmVudCBjaGFuZ2UgaW50byB0aGUgcHJldmlvdXMgb25lXG5cdFx0XHRwcmV2Q2hhbmdlLm9yaWdpbmFsTGVuZ3RoID0gKGN1cnJDaGFuZ2Uub3JpZ2luYWxTdGFydCArIGN1cnJDaGFuZ2Uub3JpZ2luYWxMZW5ndGgpIC0gcHJldkNoYW5nZS5vcmlnaW5hbFN0YXJ0O1xuXHRcdFx0cHJldkNoYW5nZS5tb2RpZmllZExlbmd0aCA9IChjdXJyQ2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBjdXJyQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoKSAtIHByZXZDaGFuZ2UubW9kaWZpZWRTdGFydDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQWRkIHRoZSBjdXJyZW50IGNoYW5nZVxuXHRcdFx0cmVzdWx0LnB1c2goY3VyckNoYW5nZSk7XG5cdFx0XHRwcmV2Q2hhbmdlID0gY3VyckNoYW5nZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5jbGFzcyBMaW5lQ2hhbmdlIGltcGxlbWVudHMgSUxpbmVDaGFuZ2Uge1xuXHRwdWJsaWMgb3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHVibGljIG9yaWdpbmFsRW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgbW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHVibGljIG1vZGlmaWVkRW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgY2hhckNoYW5nZXM6IENoYXJDaGFuZ2VbXSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbnVtYmVyLFxuXHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0Y2hhckNoYW5nZXM6IENoYXJDaGFuZ2VbXSB8IHVuZGVmaW5lZFxuXHQpIHtcblx0XHR0aGlzLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyID0gb3JpZ2luYWxTdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5vcmlnaW5hbEVuZExpbmVOdW1iZXIgPSBvcmlnaW5hbEVuZExpbmVOdW1iZXI7XG5cdFx0dGhpcy5tb2RpZmllZFN0YXJ0TGluZU51bWJlciA9IG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyO1xuXHRcdHRoaXMubW9kaWZpZWRFbmRMaW5lTnVtYmVyID0gbW9kaWZpZWRFbmRMaW5lTnVtYmVyO1xuXHRcdHRoaXMuY2hhckNoYW5nZXMgPSBjaGFyQ2hhbmdlcztcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlRnJvbURpZmZSZXN1bHQoc2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2U6IGJvb2xlYW4sIGRpZmZDaGFuZ2U6IElEaWZmQ2hhbmdlLCBvcmlnaW5hbExpbmVTZXF1ZW5jZTogTGluZVNlcXVlbmNlLCBtb2RpZmllZExpbmVTZXF1ZW5jZTogTGluZVNlcXVlbmNlLCBjb250aW51ZUNoYXJEaWZmOiAoKSA9PiBib29sZWFuLCBzaG91bGRDb21wdXRlQ2hhckNoYW5nZXM6IGJvb2xlYW4sIHNob3VsZFBvc3RQcm9jZXNzQ2hhckNoYW5nZXM6IGJvb2xlYW4pOiBMaW5lQ2hhbmdlIHtcblx0XHRsZXQgb3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRsZXQgb3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0bGV0IG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0bGV0IG1vZGlmaWVkRW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRcdGxldCBjaGFyQ2hhbmdlczogQ2hhckNoYW5nZVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGRpZmZDaGFuZ2Uub3JpZ2luYWxMZW5ndGggPT09IDApIHtcblx0XHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyID0gb3JpZ2luYWxMaW5lU2VxdWVuY2UuZ2V0U3RhcnRMaW5lTnVtYmVyKGRpZmZDaGFuZ2Uub3JpZ2luYWxTdGFydCkgLSAxO1xuXHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXIgPSBvcmlnaW5hbExpbmVTZXF1ZW5jZS5nZXRTdGFydExpbmVOdW1iZXIoZGlmZkNoYW5nZS5vcmlnaW5hbFN0YXJ0KTtcblx0XHRcdG9yaWdpbmFsRW5kTGluZU51bWJlciA9IG9yaWdpbmFsTGluZVNlcXVlbmNlLmdldEVuZExpbmVOdW1iZXIoZGlmZkNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgZGlmZkNoYW5nZS5vcmlnaW5hbExlbmd0aCAtIDEpO1xuXHRcdH1cblxuXHRcdGlmIChkaWZmQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoID09PSAwKSB7XG5cdFx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlciA9IG1vZGlmaWVkTGluZVNlcXVlbmNlLmdldFN0YXJ0TGluZU51bWJlcihkaWZmQ2hhbmdlLm1vZGlmaWVkU3RhcnQpIC0gMTtcblx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlciA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyID0gbW9kaWZpZWRMaW5lU2VxdWVuY2UuZ2V0U3RhcnRMaW5lTnVtYmVyKGRpZmZDaGFuZ2UubW9kaWZpZWRTdGFydCk7XG5cdFx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXIgPSBtb2RpZmllZExpbmVTZXF1ZW5jZS5nZXRFbmRMaW5lTnVtYmVyKGRpZmZDaGFuZ2UubW9kaWZpZWRTdGFydCArIGRpZmZDaGFuZ2UubW9kaWZpZWRMZW5ndGggLSAxKTtcblx0XHR9XG5cblx0XHRpZiAoc2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzICYmIGRpZmZDaGFuZ2Uub3JpZ2luYWxMZW5ndGggPiAwICYmIGRpZmZDaGFuZ2Uub3JpZ2luYWxMZW5ndGggPCAyMCAmJiBkaWZmQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoID4gMCAmJiBkaWZmQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoIDwgMjAgJiYgY29udGludWVDaGFyRGlmZigpKSB7XG5cdFx0XHQvLyBDb21wdXRlIGNoYXJhY3RlciBjaGFuZ2VzIGZvciBkaWZmIGNodW5rcyBvZiBhdCBtb3N0IDIwIGxpbmVzLi4uXG5cdFx0XHRjb25zdCBvcmlnaW5hbENoYXJTZXF1ZW5jZSA9IG9yaWdpbmFsTGluZVNlcXVlbmNlLmNyZWF0ZUNoYXJTZXF1ZW5jZShzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZSwgZGlmZkNoYW5nZS5vcmlnaW5hbFN0YXJ0LCBkaWZmQ2hhbmdlLm9yaWdpbmFsU3RhcnQgKyBkaWZmQ2hhbmdlLm9yaWdpbmFsTGVuZ3RoIC0gMSk7XG5cdFx0XHRjb25zdCBtb2RpZmllZENoYXJTZXF1ZW5jZSA9IG1vZGlmaWVkTGluZVNlcXVlbmNlLmNyZWF0ZUNoYXJTZXF1ZW5jZShzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZSwgZGlmZkNoYW5nZS5tb2RpZmllZFN0YXJ0LCBkaWZmQ2hhbmdlLm1vZGlmaWVkU3RhcnQgKyBkaWZmQ2hhbmdlLm1vZGlmaWVkTGVuZ3RoIC0gMSk7XG5cblx0XHRcdGlmIChvcmlnaW5hbENoYXJTZXF1ZW5jZS5nZXRFbGVtZW50cygpLmxlbmd0aCA+IDAgJiYgbW9kaWZpZWRDaGFyU2VxdWVuY2UuZ2V0RWxlbWVudHMoKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGxldCByYXdDaGFuZ2VzID0gY29tcHV0ZURpZmYob3JpZ2luYWxDaGFyU2VxdWVuY2UsIG1vZGlmaWVkQ2hhclNlcXVlbmNlLCBjb250aW51ZUNoYXJEaWZmLCB0cnVlKS5jaGFuZ2VzO1xuXG5cdFx0XHRcdGlmIChzaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzKSB7XG5cdFx0XHRcdFx0cmF3Q2hhbmdlcyA9IHBvc3RQcm9jZXNzQ2hhckNoYW5nZXMocmF3Q2hhbmdlcyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaGFyQ2hhbmdlcyA9IFtdO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuZ3RoID0gcmF3Q2hhbmdlcy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNoYXJDaGFuZ2VzLnB1c2goQ2hhckNoYW5nZS5jcmVhdGVGcm9tRGlmZkNoYW5nZShyYXdDaGFuZ2VzW2ldLCBvcmlnaW5hbENoYXJTZXF1ZW5jZSwgbW9kaWZpZWRDaGFyU2VxdWVuY2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTGluZUNoYW5nZShvcmlnaW5hbFN0YXJ0TGluZU51bWJlciwgb3JpZ2luYWxFbmRMaW5lTnVtYmVyLCBtb2RpZmllZFN0YXJ0TGluZU51bWJlciwgbW9kaWZpZWRFbmRMaW5lTnVtYmVyLCBjaGFyQ2hhbmdlcyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlmZkNvbXB1dGVyT3B0cyB7XG5cdHNob3VsZENvbXB1dGVDaGFyQ2hhbmdlczogYm9vbGVhbjtcblx0c2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlczogYm9vbGVhbjtcblx0c2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2U6IGJvb2xlYW47XG5cdHNob3VsZE1ha2VQcmV0dHlEaWZmOiBib29sZWFuO1xuXHRtYXhDb21wdXRhdGlvblRpbWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIERpZmZDb21wdXRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzaG91bGRDb21wdXRlQ2hhckNoYW5nZXM6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlczogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBzaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBzaG91bGRNYWtlUHJldHR5RGlmZjogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbExpbmVzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RpZmllZExpbmVzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbDogTGluZVNlcXVlbmNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGlmaWVkOiBMaW5lU2VxdWVuY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGludWVMaW5lRGlmZjogKCkgPT4gYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBjb250aW51ZUNoYXJEaWZmOiAoKSA9PiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKG9yaWdpbmFsTGluZXM6IHN0cmluZ1tdLCBtb2RpZmllZExpbmVzOiBzdHJpbmdbXSwgb3B0czogSURpZmZDb21wdXRlck9wdHMpIHtcblx0XHR0aGlzLnNob3VsZENvbXB1dGVDaGFyQ2hhbmdlcyA9IG9wdHMuc2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzO1xuXHRcdHRoaXMuc2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlcyA9IG9wdHMuc2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlcztcblx0XHR0aGlzLnNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlID0gb3B0cy5zaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZTtcblx0XHR0aGlzLnNob3VsZE1ha2VQcmV0dHlEaWZmID0gb3B0cy5zaG91bGRNYWtlUHJldHR5RGlmZjtcblx0XHR0aGlzLm9yaWdpbmFsTGluZXMgPSBvcmlnaW5hbExpbmVzO1xuXHRcdHRoaXMubW9kaWZpZWRMaW5lcyA9IG1vZGlmaWVkTGluZXM7XG5cdFx0dGhpcy5vcmlnaW5hbCA9IG5ldyBMaW5lU2VxdWVuY2Uob3JpZ2luYWxMaW5lcyk7XG5cdFx0dGhpcy5tb2RpZmllZCA9IG5ldyBMaW5lU2VxdWVuY2UobW9kaWZpZWRMaW5lcyk7XG5cblx0XHR0aGlzLmNvbnRpbnVlTGluZURpZmYgPSBjcmVhdGVDb250aW51ZVByb2Nlc3NpbmdQcmVkaWNhdGUob3B0cy5tYXhDb21wdXRhdGlvblRpbWUpO1xuXHRcdHRoaXMuY29udGludWVDaGFyRGlmZiA9IGNyZWF0ZUNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZShvcHRzLm1heENvbXB1dGF0aW9uVGltZSA9PT0gMCA/IDAgOiBNYXRoLm1pbihvcHRzLm1heENvbXB1dGF0aW9uVGltZSwgNTAwMCkpOyAvLyBuZXZlciBydW4gYWZ0ZXIgNXMgZm9yIGNoYXJhY3RlciBjaGFuZ2VzLi4uXG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZURpZmYoKTogSURpZmZDb21wdXRlclJlc3VsdCB7XG5cblx0XHRpZiAodGhpcy5vcmlnaW5hbC5saW5lcy5sZW5ndGggPT09IDEgJiYgdGhpcy5vcmlnaW5hbC5saW5lc1swXS5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIGVtcHR5IG9yaWdpbmFsID0+IGZhc3QgcGF0aFxuXHRcdFx0aWYgKHRoaXMubW9kaWZpZWQubGluZXMubGVuZ3RoID09PSAxICYmIHRoaXMubW9kaWZpZWQubGluZXNbMF0ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cXVpdEVhcmx5OiBmYWxzZSxcblx0XHRcdFx0XHRjaGFuZ2VzOiBbXVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlLFxuXHRcdFx0XHRjaGFuZ2VzOiBbe1xuXHRcdFx0XHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcjogMSxcblx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXI6IHRoaXMubW9kaWZpZWQubGluZXMubGVuZ3RoLFxuXHRcdFx0XHRcdGNoYXJDaGFuZ2VzOiB1bmRlZmluZWRcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubW9kaWZpZWQubGluZXMubGVuZ3RoID09PSAxICYmIHRoaXMubW9kaWZpZWQubGluZXNbMF0ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBlbXB0eSBtb2RpZmllZCA9PiBmYXN0IHBhdGhcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHF1aXRFYXJseTogZmFsc2UsXG5cdFx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyOiB0aGlzLm9yaWdpbmFsLmxpbmVzLmxlbmd0aCxcblx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0Y2hhckNoYW5nZXM6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBkaWZmUmVzdWx0ID0gY29tcHV0ZURpZmYodGhpcy5vcmlnaW5hbCwgdGhpcy5tb2RpZmllZCwgdGhpcy5jb250aW51ZUxpbmVEaWZmLCB0aGlzLnNob3VsZE1ha2VQcmV0dHlEaWZmKTtcblx0XHRjb25zdCByYXdDaGFuZ2VzID0gZGlmZlJlc3VsdC5jaGFuZ2VzO1xuXHRcdGNvbnN0IHF1aXRFYXJseSA9IGRpZmZSZXN1bHQucXVpdEVhcmx5O1xuXG5cdFx0Ly8gVGhlIGRpZmYgaXMgYWx3YXlzIGNvbXB1dGVkIHdpdGggaWdub3JpbmcgdHJpbSB3aGl0ZXNwYWNlXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIHdlIGdldCB0aGUgcHJldHRpZXN0IGRpZmZcblxuXHRcdGlmICh0aGlzLnNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlKSB7XG5cdFx0XHRjb25zdCBsaW5lQ2hhbmdlczogTGluZUNoYW5nZVtdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuZ3RoID0gcmF3Q2hhbmdlcy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0XHRsaW5lQ2hhbmdlcy5wdXNoKExpbmVDaGFuZ2UuY3JlYXRlRnJvbURpZmZSZXN1bHQodGhpcy5zaG91bGRJZ25vcmVUcmltV2hpdGVzcGFjZSwgcmF3Q2hhbmdlc1tpXSwgdGhpcy5vcmlnaW5hbCwgdGhpcy5tb2RpZmllZCwgdGhpcy5jb250aW51ZUNoYXJEaWZmLCB0aGlzLnNob3VsZENvbXB1dGVDaGFyQ2hhbmdlcywgdGhpcy5zaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRxdWl0RWFybHk6IHF1aXRFYXJseSxcblx0XHRcdFx0Y2hhbmdlczogbGluZUNoYW5nZXNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gTmVlZCB0byBwb3N0LXByb2Nlc3MgYW5kIGludHJvZHVjZSBjaGFuZ2VzIHdoZXJlIHRoZSB0cmltIHdoaXRlc3BhY2UgaXMgZGlmZmVyZW50XG5cdFx0Ly8gTm90ZSB0aGF0IHdlIGFyZSBsb29waW5nIHN0YXJ0aW5nIGF0IC0xIHRvIGFsc28gY292ZXIgdGhlIGxpbmVzIGJlZm9yZSB0aGUgZmlyc3QgY2hhbmdlXG5cdFx0Y29uc3QgcmVzdWx0OiBMaW5lQ2hhbmdlW10gPSBbXTtcblxuXHRcdGxldCBvcmlnaW5hbExpbmVJbmRleCA9IDA7XG5cdFx0bGV0IG1vZGlmaWVkTGluZUluZGV4ID0gMDtcblx0XHRmb3IgKGxldCBpID0gLTEgLyogISEhISAqLywgbGVuID0gcmF3Q2hhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbmV4dENoYW5nZSA9IChpICsgMSA8IGxlbiA/IHJhd0NoYW5nZXNbaSArIDFdIDogbnVsbCk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFN0b3AgPSAobmV4dENoYW5nZSA/IG5leHRDaGFuZ2Uub3JpZ2luYWxTdGFydCA6IHRoaXMub3JpZ2luYWxMaW5lcy5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRTdG9wID0gKG5leHRDaGFuZ2UgPyBuZXh0Q2hhbmdlLm1vZGlmaWVkU3RhcnQgOiB0aGlzLm1vZGlmaWVkTGluZXMubGVuZ3RoKTtcblxuXHRcdFx0d2hpbGUgKG9yaWdpbmFsTGluZUluZGV4IDwgb3JpZ2luYWxTdG9wICYmIG1vZGlmaWVkTGluZUluZGV4IDwgbW9kaWZpZWRTdG9wKSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsTGluZSA9IHRoaXMub3JpZ2luYWxMaW5lc1tvcmlnaW5hbExpbmVJbmRleF07XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZSA9IHRoaXMubW9kaWZpZWRMaW5lc1ttb2RpZmllZExpbmVJbmRleF07XG5cblx0XHRcdFx0aWYgKG9yaWdpbmFsTGluZSAhPT0gbW9kaWZpZWRMaW5lKSB7XG5cdFx0XHRcdFx0Ly8gVGhlc2UgbGluZXMgZGlmZmVyIG9ubHkgaW4gdHJpbSB3aGl0ZXNwYWNlXG5cblx0XHRcdFx0XHQvLyBDaGVjayB0aGUgbGVhZGluZyB3aGl0ZXNwYWNlXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV0IG9yaWdpbmFsU3RhcnRDb2x1bW4gPSBnZXRGaXJzdE5vbkJsYW5rQ29sdW1uKG9yaWdpbmFsTGluZSwgMSk7XG5cdFx0XHRcdFx0XHRsZXQgbW9kaWZpZWRTdGFydENvbHVtbiA9IGdldEZpcnN0Tm9uQmxhbmtDb2x1bW4obW9kaWZpZWRMaW5lLCAxKTtcblx0XHRcdFx0XHRcdHdoaWxlIChvcmlnaW5hbFN0YXJ0Q29sdW1uID4gMSAmJiBtb2RpZmllZFN0YXJ0Q29sdW1uID4gMSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbENoYXIgPSBvcmlnaW5hbExpbmUuY2hhckNvZGVBdChvcmlnaW5hbFN0YXJ0Q29sdW1uIC0gMik7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkQ2hhciA9IG1vZGlmaWVkTGluZS5jaGFyQ29kZUF0KG1vZGlmaWVkU3RhcnRDb2x1bW4gLSAyKTtcblx0XHRcdFx0XHRcdFx0aWYgKG9yaWdpbmFsQ2hhciAhPT0gbW9kaWZpZWRDaGFyKSB7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0b3JpZ2luYWxTdGFydENvbHVtbi0tO1xuXHRcdFx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0Q29sdW1uLS07XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChvcmlnaW5hbFN0YXJ0Q29sdW1uID4gMSB8fCBtb2RpZmllZFN0YXJ0Q29sdW1uID4gMSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wdXNoVHJpbVdoaXRlc3BhY2VDaGFyQ2hhbmdlKHJlc3VsdCxcblx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbExpbmVJbmRleCArIDEsIDEsIG9yaWdpbmFsU3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRcdFx0bW9kaWZpZWRMaW5lSW5kZXggKyAxLCAxLCBtb2RpZmllZFN0YXJ0Q29sdW1uXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQ2hlY2sgdGhlIHRyYWlsaW5nIHdoaXRlc3BhY2Vcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXQgb3JpZ2luYWxFbmRDb2x1bW4gPSBnZXRMYXN0Tm9uQmxhbmtDb2x1bW4ob3JpZ2luYWxMaW5lLCAxKTtcblx0XHRcdFx0XHRcdGxldCBtb2RpZmllZEVuZENvbHVtbiA9IGdldExhc3ROb25CbGFua0NvbHVtbihtb2RpZmllZExpbmUsIDEpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxNYXhDb2x1bW4gPSBvcmlnaW5hbExpbmUubGVuZ3RoICsgMTtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkTWF4Q29sdW1uID0gbW9kaWZpZWRMaW5lLmxlbmd0aCArIDE7XG5cdFx0XHRcdFx0XHR3aGlsZSAob3JpZ2luYWxFbmRDb2x1bW4gPCBvcmlnaW5hbE1heENvbHVtbiAmJiBtb2RpZmllZEVuZENvbHVtbiA8IG1vZGlmaWVkTWF4Q29sdW1uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsQ2hhciA9IG9yaWdpbmFsTGluZS5jaGFyQ29kZUF0KG9yaWdpbmFsRW5kQ29sdW1uIC0gMSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkQ2hhciA9IG9yaWdpbmFsTGluZS5jaGFyQ29kZUF0KG1vZGlmaWVkRW5kQ29sdW1uIC0gMSk7XG5cdFx0XHRcdFx0XHRcdGlmIChvcmlnaW5hbENoYXIgIT09IG1vZGlmaWVkQ2hhcikge1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsRW5kQ29sdW1uKys7XG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkRW5kQ29sdW1uKys7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChvcmlnaW5hbEVuZENvbHVtbiA8IG9yaWdpbmFsTWF4Q29sdW1uIHx8IG1vZGlmaWVkRW5kQ29sdW1uIDwgbW9kaWZpZWRNYXhDb2x1bW4pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcHVzaFRyaW1XaGl0ZXNwYWNlQ2hhckNoYW5nZShyZXN1bHQsXG5cdFx0XHRcdFx0XHRcdFx0b3JpZ2luYWxMaW5lSW5kZXggKyAxLCBvcmlnaW5hbEVuZENvbHVtbiwgb3JpZ2luYWxNYXhDb2x1bW4sXG5cdFx0XHRcdFx0XHRcdFx0bW9kaWZpZWRMaW5lSW5kZXggKyAxLCBtb2RpZmllZEVuZENvbHVtbiwgbW9kaWZpZWRNYXhDb2x1bW5cblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0b3JpZ2luYWxMaW5lSW5kZXgrKztcblx0XHRcdFx0bW9kaWZpZWRMaW5lSW5kZXgrKztcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5leHRDaGFuZ2UpIHtcblx0XHRcdFx0Ly8gRW1pdCB0aGUgYWN0dWFsIGNoYW5nZVxuXHRcdFx0XHRyZXN1bHQucHVzaChMaW5lQ2hhbmdlLmNyZWF0ZUZyb21EaWZmUmVzdWx0KHRoaXMuc2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2UsIG5leHRDaGFuZ2UsIHRoaXMub3JpZ2luYWwsIHRoaXMubW9kaWZpZWQsIHRoaXMuY29udGludWVDaGFyRGlmZiwgdGhpcy5zaG91bGRDb21wdXRlQ2hhckNoYW5nZXMsIHRoaXMuc2hvdWxkUG9zdFByb2Nlc3NDaGFyQ2hhbmdlcykpO1xuXG5cdFx0XHRcdG9yaWdpbmFsTGluZUluZGV4ICs9IG5leHRDaGFuZ2Uub3JpZ2luYWxMZW5ndGg7XG5cdFx0XHRcdG1vZGlmaWVkTGluZUluZGV4ICs9IG5leHRDaGFuZ2UubW9kaWZpZWRMZW5ndGg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHF1aXRFYXJseTogcXVpdEVhcmx5LFxuXHRcdFx0Y2hhbmdlczogcmVzdWx0XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3B1c2hUcmltV2hpdGVzcGFjZUNoYXJDaGFuZ2UoXG5cdFx0cmVzdWx0OiBMaW5lQ2hhbmdlW10sXG5cdFx0b3JpZ2luYWxMaW5lTnVtYmVyOiBudW1iZXIsIG9yaWdpbmFsU3RhcnRDb2x1bW46IG51bWJlciwgb3JpZ2luYWxFbmRDb2x1bW46IG51bWJlcixcblx0XHRtb2RpZmllZExpbmVOdW1iZXI6IG51bWJlciwgbW9kaWZpZWRTdGFydENvbHVtbjogbnVtYmVyLCBtb2RpZmllZEVuZENvbHVtbjogbnVtYmVyXG5cdCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tZXJnZVRyaW1XaGl0ZXNwYWNlQ2hhckNoYW5nZShyZXN1bHQsIG9yaWdpbmFsTGluZU51bWJlciwgb3JpZ2luYWxTdGFydENvbHVtbiwgb3JpZ2luYWxFbmRDb2x1bW4sIG1vZGlmaWVkTGluZU51bWJlciwgbW9kaWZpZWRTdGFydENvbHVtbiwgbW9kaWZpZWRFbmRDb2x1bW4pKSB7XG5cdFx0XHQvLyBNZXJnZWQgaW50byBwcmV2aW91c1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBjaGFyQ2hhbmdlczogQ2hhckNoYW5nZVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLnNob3VsZENvbXB1dGVDaGFyQ2hhbmdlcykge1xuXHRcdFx0Y2hhckNoYW5nZXMgPSBbbmV3IENoYXJDaGFuZ2UoXG5cdFx0XHRcdG9yaWdpbmFsTGluZU51bWJlciwgb3JpZ2luYWxTdGFydENvbHVtbiwgb3JpZ2luYWxMaW5lTnVtYmVyLCBvcmlnaW5hbEVuZENvbHVtbixcblx0XHRcdFx0bW9kaWZpZWRMaW5lTnVtYmVyLCBtb2RpZmllZFN0YXJ0Q29sdW1uLCBtb2RpZmllZExpbmVOdW1iZXIsIG1vZGlmaWVkRW5kQ29sdW1uXG5cdFx0XHQpXTtcblx0XHR9XG5cdFx0cmVzdWx0LnB1c2gobmV3IExpbmVDaGFuZ2UoXG5cdFx0XHRvcmlnaW5hbExpbmVOdW1iZXIsIG9yaWdpbmFsTGluZU51bWJlcixcblx0XHRcdG1vZGlmaWVkTGluZU51bWJlciwgbW9kaWZpZWRMaW5lTnVtYmVyLFxuXHRcdFx0Y2hhckNoYW5nZXNcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX21lcmdlVHJpbVdoaXRlc3BhY2VDaGFyQ2hhbmdlKFxuXHRcdHJlc3VsdDogTGluZUNoYW5nZVtdLFxuXHRcdG9yaWdpbmFsTGluZU51bWJlcjogbnVtYmVyLCBvcmlnaW5hbFN0YXJ0Q29sdW1uOiBudW1iZXIsIG9yaWdpbmFsRW5kQ29sdW1uOiBudW1iZXIsXG5cdFx0bW9kaWZpZWRMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGlmaWVkU3RhcnRDb2x1bW46IG51bWJlciwgbW9kaWZpZWRFbmRDb2x1bW46IG51bWJlclxuXHQpOiBib29sZWFuIHtcblx0XHRjb25zdCBsZW4gPSByZXN1bHQubGVuZ3RoO1xuXHRcdGlmIChsZW4gPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2Q2hhbmdlID0gcmVzdWx0W2xlbiAtIDFdO1xuXG5cdFx0aWYgKHByZXZDaGFuZ2Uub3JpZ2luYWxFbmRMaW5lTnVtYmVyID09PSAwIHx8IHByZXZDaGFuZ2UubW9kaWZpZWRFbmRMaW5lTnVtYmVyID09PSAwKSB7XG5cdFx0XHQvLyBEb24ndCBtZXJnZSB3aXRoIGluc2VydHMvZGVsZXRlc1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChwcmV2Q2hhbmdlLm9yaWdpbmFsRW5kTGluZU51bWJlciA9PT0gb3JpZ2luYWxMaW5lTnVtYmVyICYmIHByZXZDaGFuZ2UubW9kaWZpZWRFbmRMaW5lTnVtYmVyID09PSBtb2RpZmllZExpbmVOdW1iZXIpIHtcblx0XHRcdGlmICh0aGlzLnNob3VsZENvbXB1dGVDaGFyQ2hhbmdlcyAmJiBwcmV2Q2hhbmdlLmNoYXJDaGFuZ2VzKSB7XG5cdFx0XHRcdHByZXZDaGFuZ2UuY2hhckNoYW5nZXMucHVzaChuZXcgQ2hhckNoYW5nZShcblx0XHRcdFx0XHRvcmlnaW5hbExpbmVOdW1iZXIsIG9yaWdpbmFsU3RhcnRDb2x1bW4sIG9yaWdpbmFsTGluZU51bWJlciwgb3JpZ2luYWxFbmRDb2x1bW4sXG5cdFx0XHRcdFx0bW9kaWZpZWRMaW5lTnVtYmVyLCBtb2RpZmllZFN0YXJ0Q29sdW1uLCBtb2RpZmllZExpbmVOdW1iZXIsIG1vZGlmaWVkRW5kQ29sdW1uXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHByZXZDaGFuZ2Uub3JpZ2luYWxFbmRMaW5lTnVtYmVyICsgMSA9PT0gb3JpZ2luYWxMaW5lTnVtYmVyICYmIHByZXZDaGFuZ2UubW9kaWZpZWRFbmRMaW5lTnVtYmVyICsgMSA9PT0gbW9kaWZpZWRMaW5lTnVtYmVyKSB7XG5cdFx0XHRwcmV2Q2hhbmdlLm9yaWdpbmFsRW5kTGluZU51bWJlciA9IG9yaWdpbmFsTGluZU51bWJlcjtcblx0XHRcdHByZXZDaGFuZ2UubW9kaWZpZWRFbmRMaW5lTnVtYmVyID0gbW9kaWZpZWRMaW5lTnVtYmVyO1xuXHRcdFx0aWYgKHRoaXMuc2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzICYmIHByZXZDaGFuZ2UuY2hhckNoYW5nZXMpIHtcblx0XHRcdFx0cHJldkNoYW5nZS5jaGFyQ2hhbmdlcy5wdXNoKG5ldyBDaGFyQ2hhbmdlKFxuXHRcdFx0XHRcdG9yaWdpbmFsTGluZU51bWJlciwgb3JpZ2luYWxTdGFydENvbHVtbiwgb3JpZ2luYWxMaW5lTnVtYmVyLCBvcmlnaW5hbEVuZENvbHVtbixcblx0XHRcdFx0XHRtb2RpZmllZExpbmVOdW1iZXIsIG1vZGlmaWVkU3RhcnRDb2x1bW4sIG1vZGlmaWVkTGluZU51bWJlciwgbW9kaWZpZWRFbmRDb2x1bW5cblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0Rmlyc3ROb25CbGFua0NvbHVtbih0eHQ6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCByID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleCh0eHQpO1xuXHRpZiAociA9PT0gLTEpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdHJldHVybiByICsgMTtcbn1cblxuZnVuY3Rpb24gZ2V0TGFzdE5vbkJsYW5rQ29sdW1uKHR4dDogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdGNvbnN0IHIgPSBzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgodHh0KTtcblx0aWYgKHIgPT09IC0xKSB7XG5cdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0fVxuXHRyZXR1cm4gciArIDI7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRpbnVlUHJvY2Vzc2luZ1ByZWRpY2F0ZShtYXhpbXVtUnVudGltZTogbnVtYmVyKTogKCkgPT4gYm9vbGVhbiB7XG5cdGlmIChtYXhpbXVtUnVudGltZSA9PT0gMCkge1xuXHRcdHJldHVybiAoKSA9PiB0cnVlO1xuXHR9XG5cblx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0cmV0dXJuICgpID0+IHtcblx0XHRyZXR1cm4gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8IG1heGltdW1SdW50aW1lO1xuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUMsZUFBNEI7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
