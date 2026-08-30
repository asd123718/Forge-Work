import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { WordCharacterClass, getMapForWordSeparators } from "../core/wordCharacterClassifier.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { EndOfLinePreference, FindMatch, SearchData } from "../model.js";
const LIMIT_FIND_COUNT = 999;
class SearchParams {
  constructor(searchString, isRegex, matchCase, wordSeparators) {
    this.searchString = searchString;
    this.isRegex = isRegex;
    this.matchCase = matchCase;
    this.wordSeparators = wordSeparators;
  }
  parseSearchRequest() {
    if (this.searchString === "") {
      return null;
    }
    let multiline;
    if (this.isRegex) {
      multiline = isMultilineRegexSource(this.searchString);
    } else {
      multiline = this.searchString.indexOf("\n") >= 0;
    }
    let regex = null;
    try {
      regex = strings.createRegExp(this.searchString, this.isRegex, {
        matchCase: this.matchCase,
        wholeWord: false,
        multiline,
        global: true,
        unicode: true
      });
    } catch (err) {
      return null;
    }
    if (!regex) {
      return null;
    }
    let canUseSimpleSearch = !this.isRegex && !multiline;
    if (canUseSimpleSearch && this.searchString.toLowerCase() !== this.searchString.toUpperCase()) {
      canUseSimpleSearch = this.matchCase;
    }
    return new SearchData(regex, this.wordSeparators ? getMapForWordSeparators(this.wordSeparators, []) : null, canUseSimpleSearch ? this.searchString : null);
  }
}
function isMultilineRegexSource(searchString) {
  if (!searchString || searchString.length === 0) {
    return false;
  }
  for (let i = 0, len = searchString.length; i < len; i++) {
    const chCode = searchString.charCodeAt(i);
    if (chCode === CharCode.LineFeed) {
      return true;
    }
    if (chCode === CharCode.Backslash) {
      i++;
      if (i >= len) {
        break;
      }
      const nextChCode = searchString.charCodeAt(i);
      if (nextChCode === CharCode.n || nextChCode === CharCode.r || nextChCode === CharCode.W) {
        return true;
      }
    }
  }
  return false;
}
function createFindMatch(range, rawMatches, captureMatches) {
  if (!captureMatches) {
    return new FindMatch(range, null);
  }
  const matches = [];
  for (let i = 0, len = rawMatches.length; i < len; i++) {
    matches[i] = rawMatches[i];
  }
  return new FindMatch(range, matches);
}
class LineFeedCounter {
  constructor(text) {
    const lineFeedsOffsets = [];
    let lineFeedsOffsetsLen = 0;
    for (let i = 0, textLen = text.length; i < textLen; i++) {
      if (text.charCodeAt(i) === CharCode.LineFeed) {
        lineFeedsOffsets[lineFeedsOffsetsLen++] = i;
      }
    }
    this._lineFeedsOffsets = lineFeedsOffsets;
  }
  findLineFeedCountBeforeOffset(offset) {
    const lineFeedsOffsets = this._lineFeedsOffsets;
    let min = 0;
    let max = lineFeedsOffsets.length - 1;
    if (max === -1) {
      return 0;
    }
    if (offset <= lineFeedsOffsets[0]) {
      return 0;
    }
    while (min < max) {
      const mid = min + ((max - min) / 2 >> 0);
      if (lineFeedsOffsets[mid] >= offset) {
        max = mid - 1;
      } else {
        if (lineFeedsOffsets[mid + 1] >= offset) {
          min = mid;
          max = mid;
        } else {
          min = mid + 1;
        }
      }
    }
    return min + 1;
  }
}
class TextModelSearch {
  static findMatches(model, searchParams, searchRange, captureMatches, limitResultCount) {
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return [];
    }
    if (searchData.regex.multiline) {
      return this._doFindMatchesMultiline(model, searchRange, new Searcher(searchData.wordSeparators, searchData.regex), captureMatches, limitResultCount);
    }
    return this._doFindMatchesLineByLine(model, searchRange, searchData, captureMatches, limitResultCount);
  }
  /**
   * Multiline search always executes on the lines concatenated with \n.
   * We must therefore compensate for the count of \n in case the model is CRLF
   */
  static _getMultilineMatchRange(model, deltaOffset, text, lfCounter, matchIndex, match0) {
    let startOffset;
    let lineFeedCountBeforeMatch = 0;
    if (lfCounter) {
      lineFeedCountBeforeMatch = lfCounter.findLineFeedCountBeforeOffset(matchIndex);
      startOffset = deltaOffset + matchIndex + lineFeedCountBeforeMatch;
    } else {
      startOffset = deltaOffset + matchIndex;
    }
    let endOffset;
    if (lfCounter) {
      const lineFeedCountBeforeEndOfMatch = lfCounter.findLineFeedCountBeforeOffset(matchIndex + match0.length);
      const lineFeedCountInMatch = lineFeedCountBeforeEndOfMatch - lineFeedCountBeforeMatch;
      endOffset = startOffset + match0.length + lineFeedCountInMatch;
    } else {
      endOffset = startOffset + match0.length;
    }
    const startPosition = model.getPositionAt(startOffset);
    const endPosition = model.getPositionAt(endOffset);
    return new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
  }
  static _doFindMatchesMultiline(model, searchRange, searcher, captureMatches, limitResultCount) {
    const deltaOffset = model.getOffsetAt(searchRange.getStartPosition());
    const text = model.getValueInRange(searchRange, EndOfLinePreference.LF);
    const lfCounter = model.getEOL() === "\r\n" ? new LineFeedCounter(text) : null;
    const result = [];
    let counter = 0;
    let m;
    searcher.reset(0);
    while (m = searcher.next(text)) {
      result[counter++] = createFindMatch(this._getMultilineMatchRange(model, deltaOffset, text, lfCounter, m.index, m[0]), m, captureMatches);
      if (counter >= limitResultCount) {
        return result;
      }
    }
    return result;
  }
  static _doFindMatchesLineByLine(model, searchRange, searchData, captureMatches, limitResultCount) {
    const result = [];
    let resultLen = 0;
    if (searchRange.startLineNumber === searchRange.endLineNumber) {
      const text2 = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1, searchRange.endColumn - 1);
      resultLen = this._findMatchesInLine(searchData, text2, searchRange.startLineNumber, searchRange.startColumn - 1, resultLen, result, captureMatches, limitResultCount);
      return result;
    }
    const text = model.getLineContent(searchRange.startLineNumber).substring(searchRange.startColumn - 1);
    resultLen = this._findMatchesInLine(searchData, text, searchRange.startLineNumber, searchRange.startColumn - 1, resultLen, result, captureMatches, limitResultCount);
    for (let lineNumber = searchRange.startLineNumber + 1; lineNumber < searchRange.endLineNumber && resultLen < limitResultCount; lineNumber++) {
      resultLen = this._findMatchesInLine(searchData, model.getLineContent(lineNumber), lineNumber, 0, resultLen, result, captureMatches, limitResultCount);
    }
    if (resultLen < limitResultCount) {
      const text2 = model.getLineContent(searchRange.endLineNumber).substring(0, searchRange.endColumn - 1);
      resultLen = this._findMatchesInLine(searchData, text2, searchRange.endLineNumber, 0, resultLen, result, captureMatches, limitResultCount);
    }
    return result;
  }
  static _findMatchesInLine(searchData, text, lineNumber, deltaOffset, resultLen, result, captureMatches, limitResultCount) {
    const wordSeparators = searchData.wordSeparators;
    if (!captureMatches && searchData.simpleSearch) {
      const searchString = searchData.simpleSearch;
      const searchStringLen = searchString.length;
      const textLength = text.length;
      let lastMatchIndex = -searchStringLen;
      while ((lastMatchIndex = text.indexOf(searchString, lastMatchIndex + searchStringLen)) !== -1) {
        if (!wordSeparators || isValidMatch(wordSeparators, text, textLength, lastMatchIndex, searchStringLen)) {
          result[resultLen++] = new FindMatch(new Range(lineNumber, lastMatchIndex + 1 + deltaOffset, lineNumber, lastMatchIndex + 1 + searchStringLen + deltaOffset), null);
          if (resultLen >= limitResultCount) {
            return resultLen;
          }
        }
      }
      return resultLen;
    }
    const searcher = new Searcher(searchData.wordSeparators, searchData.regex);
    let m;
    searcher.reset(0);
    do {
      m = searcher.next(text);
      if (m) {
        result[resultLen++] = createFindMatch(new Range(lineNumber, m.index + 1 + deltaOffset, lineNumber, m.index + 1 + m[0].length + deltaOffset), m, captureMatches);
        if (resultLen >= limitResultCount) {
          return resultLen;
        }
      }
    } while (m);
    return resultLen;
  }
  static findNextMatch(model, searchParams, searchStart, captureMatches) {
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return null;
    }
    const searcher = new Searcher(searchData.wordSeparators, searchData.regex);
    if (searchData.regex.multiline) {
      return this._doFindNextMatchMultiline(model, searchStart, searcher, captureMatches);
    }
    return this._doFindNextMatchLineByLine(model, searchStart, searcher, captureMatches);
  }
  static _doFindNextMatchMultiline(model, searchStart, searcher, captureMatches) {
    const searchTextStart = new Position(searchStart.lineNumber, 1);
    const deltaOffset = model.getOffsetAt(searchTextStart);
    const lineCount = model.getLineCount();
    const text = model.getValueInRange(new Range(searchTextStart.lineNumber, searchTextStart.column, lineCount, model.getLineMaxColumn(lineCount)), EndOfLinePreference.LF);
    const lfCounter = model.getEOL() === "\r\n" ? new LineFeedCounter(text) : null;
    searcher.reset(searchStart.column - 1);
    const m = searcher.next(text);
    if (m) {
      return createFindMatch(
        this._getMultilineMatchRange(model, deltaOffset, text, lfCounter, m.index, m[0]),
        m,
        captureMatches
      );
    }
    if (searchStart.lineNumber !== 1 || searchStart.column !== 1) {
      return this._doFindNextMatchMultiline(model, new Position(1, 1), searcher, captureMatches);
    }
    return null;
  }
  static _doFindNextMatchLineByLine(model, searchStart, searcher, captureMatches) {
    const lineCount = model.getLineCount();
    const startLineNumber = searchStart.lineNumber;
    const text = model.getLineContent(startLineNumber);
    const r = this._findFirstMatchInLine(searcher, text, startLineNumber, searchStart.column, captureMatches);
    if (r) {
      return r;
    }
    for (let i = 1; i <= lineCount; i++) {
      const lineIndex = (startLineNumber + i - 1) % lineCount;
      const text2 = model.getLineContent(lineIndex + 1);
      const r2 = this._findFirstMatchInLine(searcher, text2, lineIndex + 1, 1, captureMatches);
      if (r2) {
        return r2;
      }
    }
    return null;
  }
  static _findFirstMatchInLine(searcher, text, lineNumber, fromColumn, captureMatches) {
    searcher.reset(fromColumn - 1);
    const m = searcher.next(text);
    if (m) {
      return createFindMatch(
        new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length),
        m,
        captureMatches
      );
    }
    return null;
  }
  static findPreviousMatch(model, searchParams, searchStart, captureMatches) {
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return null;
    }
    const searcher = new Searcher(searchData.wordSeparators, searchData.regex);
    if (searchData.regex.multiline) {
      return this._doFindPreviousMatchMultiline(model, searchStart, searcher, captureMatches);
    }
    return this._doFindPreviousMatchLineByLine(model, searchStart, searcher, captureMatches);
  }
  static _doFindPreviousMatchMultiline(model, searchStart, searcher, captureMatches) {
    const matches = this._doFindMatchesMultiline(model, new Range(1, 1, searchStart.lineNumber, searchStart.column), searcher, captureMatches, 10 * LIMIT_FIND_COUNT);
    if (matches.length > 0) {
      return matches[matches.length - 1];
    }
    const lineCount = model.getLineCount();
    if (searchStart.lineNumber !== lineCount || searchStart.column !== model.getLineMaxColumn(lineCount)) {
      return this._doFindPreviousMatchMultiline(model, new Position(lineCount, model.getLineMaxColumn(lineCount)), searcher, captureMatches);
    }
    return null;
  }
  static _doFindPreviousMatchLineByLine(model, searchStart, searcher, captureMatches) {
    const lineCount = model.getLineCount();
    const startLineNumber = searchStart.lineNumber;
    const text = model.getLineContent(startLineNumber).substring(0, searchStart.column - 1);
    const r = this._findLastMatchInLine(searcher, text, startLineNumber, captureMatches);
    if (r) {
      return r;
    }
    for (let i = 1; i <= lineCount; i++) {
      const lineIndex = (lineCount + startLineNumber - i - 1) % lineCount;
      const text2 = model.getLineContent(lineIndex + 1);
      const r2 = this._findLastMatchInLine(searcher, text2, lineIndex + 1, captureMatches);
      if (r2) {
        return r2;
      }
    }
    return null;
  }
  static _findLastMatchInLine(searcher, text, lineNumber, captureMatches) {
    let bestResult = null;
    let m;
    searcher.reset(0);
    while (m = searcher.next(text)) {
      bestResult = createFindMatch(new Range(lineNumber, m.index + 1, lineNumber, m.index + 1 + m[0].length), m, captureMatches);
    }
    return bestResult;
  }
}
function leftIsWordBounday(wordSeparators, text, textLength, matchStartIndex, matchLength) {
  if (matchStartIndex === 0) {
    return true;
  }
  const charBefore = text.charCodeAt(matchStartIndex - 1);
  if (wordSeparators.get(charBefore) !== WordCharacterClass.Regular) {
    return true;
  }
  if (charBefore === CharCode.CarriageReturn || charBefore === CharCode.LineFeed) {
    return true;
  }
  if (matchLength > 0) {
    const firstCharInMatch = text.charCodeAt(matchStartIndex);
    if (wordSeparators.get(firstCharInMatch) !== WordCharacterClass.Regular) {
      return true;
    }
  }
  return false;
}
function rightIsWordBounday(wordSeparators, text, textLength, matchStartIndex, matchLength) {
  if (matchStartIndex + matchLength === textLength) {
    return true;
  }
  const charAfter = text.charCodeAt(matchStartIndex + matchLength);
  if (wordSeparators.get(charAfter) !== WordCharacterClass.Regular) {
    return true;
  }
  if (charAfter === CharCode.CarriageReturn || charAfter === CharCode.LineFeed) {
    return true;
  }
  if (matchLength > 0) {
    const lastCharInMatch = text.charCodeAt(matchStartIndex + matchLength - 1);
    if (wordSeparators.get(lastCharInMatch) !== WordCharacterClass.Regular) {
      return true;
    }
  }
  return false;
}
function isValidMatch(wordSeparators, text, textLength, matchStartIndex, matchLength) {
  return leftIsWordBounday(wordSeparators, text, textLength, matchStartIndex, matchLength) && rightIsWordBounday(wordSeparators, text, textLength, matchStartIndex, matchLength);
}
class Searcher {
  constructor(wordSeparators, searchRegex) {
    this._wordSeparators = wordSeparators;
    this._searchRegex = searchRegex;
    this._prevMatchStartIndex = -1;
    this._prevMatchLength = 0;
  }
  reset(lastIndex) {
    this._searchRegex.lastIndex = lastIndex;
    this._prevMatchStartIndex = -1;
    this._prevMatchLength = 0;
  }
  next(text) {
    const textLength = text.length;
    let m;
    do {
      if (this._prevMatchStartIndex + this._prevMatchLength === textLength) {
        return null;
      }
      m = this._searchRegex.exec(text);
      if (!m) {
        return null;
      }
      const matchStartIndex = m.index;
      const matchLength = m[0].length;
      if (matchStartIndex === this._prevMatchStartIndex && matchLength === this._prevMatchLength) {
        if (matchLength === 0) {
          if (strings.getNextCodePoint(text, textLength, this._searchRegex.lastIndex) > 65535) {
            this._searchRegex.lastIndex += 2;
          } else {
            this._searchRegex.lastIndex += 1;
          }
          continue;
        }
        return null;
      }
      this._prevMatchStartIndex = matchStartIndex;
      this._prevMatchLength = matchLength;
      if (!this._wordSeparators || isValidMatch(this._wordSeparators, text, textLength, matchStartIndex, matchLength)) {
        return m;
      }
    } while (m);
    return null;
  }
}
export {
  SearchParams,
  Searcher,
  TextModelSearch,
  createFindMatch,
  isMultilineRegexSource,
  isValidMatch
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHRleHRNb2RlbFNlYXJjaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFdvcmRDaGFyYWN0ZXJDbGFzcywgV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIGdldE1hcEZvcldvcmRTZXBhcmF0b3JzIH0gZnJvbSAnLi4vY29yZS93b3JkQ2hhcmFjdGVyQ2xhc3NpZmllci5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIEZpbmRNYXRjaCwgU2VhcmNoRGF0YSB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4vdGV4dE1vZGVsLmpzJztcblxuY29uc3QgTElNSVRfRklORF9DT1VOVCA9IDk5OTtcblxuZXhwb3J0IGNsYXNzIFNlYXJjaFBhcmFtcyB7XG5cdHB1YmxpYyByZWFkb25seSBzZWFyY2hTdHJpbmc6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGlzUmVnZXg6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBtYXRjaENhc2U6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSB3b3JkU2VwYXJhdG9yczogc3RyaW5nIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihzZWFyY2hTdHJpbmc6IHN0cmluZywgaXNSZWdleDogYm9vbGVhbiwgbWF0Y2hDYXNlOiBib29sZWFuLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nIHwgbnVsbCkge1xuXHRcdHRoaXMuc2VhcmNoU3RyaW5nID0gc2VhcmNoU3RyaW5nO1xuXHRcdHRoaXMuaXNSZWdleCA9IGlzUmVnZXg7XG5cdFx0dGhpcy5tYXRjaENhc2UgPSBtYXRjaENhc2U7XG5cdFx0dGhpcy53b3JkU2VwYXJhdG9ycyA9IHdvcmRTZXBhcmF0b3JzO1xuXHR9XG5cblx0cHVibGljIHBhcnNlU2VhcmNoUmVxdWVzdCgpOiBTZWFyY2hEYXRhIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuc2VhcmNoU3RyaW5nID09PSAnJykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IHRvIGNyZWF0ZSBhIFJlZ0V4cCBvdXQgb2YgdGhlIHBhcmFtc1xuXHRcdGxldCBtdWx0aWxpbmU6IGJvb2xlYW47XG5cdFx0aWYgKHRoaXMuaXNSZWdleCkge1xuXHRcdFx0bXVsdGlsaW5lID0gaXNNdWx0aWxpbmVSZWdleFNvdXJjZSh0aGlzLnNlYXJjaFN0cmluZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG11bHRpbGluZSA9ICh0aGlzLnNlYXJjaFN0cmluZy5pbmRleE9mKCdcXG4nKSA+PSAwKTtcblx0XHR9XG5cblx0XHRsZXQgcmVnZXg6IFJlZ0V4cCB8IG51bGwgPSBudWxsO1xuXHRcdHRyeSB7XG5cdFx0XHRyZWdleCA9IHN0cmluZ3MuY3JlYXRlUmVnRXhwKHRoaXMuc2VhcmNoU3RyaW5nLCB0aGlzLmlzUmVnZXgsIHtcblx0XHRcdFx0bWF0Y2hDYXNlOiB0aGlzLm1hdGNoQ2FzZSxcblx0XHRcdFx0d2hvbGVXb3JkOiBmYWxzZSxcblx0XHRcdFx0bXVsdGlsaW5lOiBtdWx0aWxpbmUsXG5cdFx0XHRcdGdsb2JhbDogdHJ1ZSxcblx0XHRcdFx0dW5pY29kZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoIXJlZ2V4KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgY2FuVXNlU2ltcGxlU2VhcmNoID0gKCF0aGlzLmlzUmVnZXggJiYgIW11bHRpbGluZSk7XG5cdFx0aWYgKGNhblVzZVNpbXBsZVNlYXJjaCAmJiB0aGlzLnNlYXJjaFN0cmluZy50b0xvd2VyQ2FzZSgpICE9PSB0aGlzLnNlYXJjaFN0cmluZy50b1VwcGVyQ2FzZSgpKSB7XG5cdFx0XHQvLyBjYXNpbmcgbWlnaHQgbWFrZSBhIGRpZmZlcmVuY2Vcblx0XHRcdGNhblVzZVNpbXBsZVNlYXJjaCA9IHRoaXMubWF0Y2hDYXNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgU2VhcmNoRGF0YShyZWdleCwgdGhpcy53b3JkU2VwYXJhdG9ycyA/IGdldE1hcEZvcldvcmRTZXBhcmF0b3JzKHRoaXMud29yZFNlcGFyYXRvcnMsIFtdKSA6IG51bGwsIGNhblVzZVNpbXBsZVNlYXJjaCA/IHRoaXMuc2VhcmNoU3RyaW5nIDogbnVsbCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTXVsdGlsaW5lUmVnZXhTb3VyY2Uoc2VhcmNoU3RyaW5nOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKCFzZWFyY2hTdHJpbmcgfHwgc2VhcmNoU3RyaW5nLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWFyY2hTdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCBjaENvZGUgPSBzZWFyY2hTdHJpbmcuY2hhckNvZGVBdChpKTtcblxuXHRcdGlmIChjaENvZGUgPT09IENoYXJDb2RlLkxpbmVGZWVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoY2hDb2RlID09PSBDaGFyQ29kZS5CYWNrc2xhc2gpIHtcblxuXHRcdFx0Ly8gbW92ZSB0byBuZXh0IGNoYXJcblx0XHRcdGkrKztcblxuXHRcdFx0aWYgKGkgPj0gbGVuKSB7XG5cdFx0XHRcdC8vIHN0cmluZyBlbmRzIHdpdGggYSBcXFxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV4dENoQ29kZSA9IHNlYXJjaFN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXHRcdFx0aWYgKG5leHRDaENvZGUgPT09IENoYXJDb2RlLm4gfHwgbmV4dENoQ29kZSA9PT0gQ2hhckNvZGUuciB8fCBuZXh0Q2hDb2RlID09PSBDaGFyQ29kZS5XKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUZpbmRNYXRjaChyYW5nZTogUmFuZ2UsIHJhd01hdGNoZXM6IFJlZ0V4cEV4ZWNBcnJheSwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4pOiBGaW5kTWF0Y2gge1xuXHRpZiAoIWNhcHR1cmVNYXRjaGVzKSB7XG5cdFx0cmV0dXJuIG5ldyBGaW5kTWF0Y2gocmFuZ2UsIG51bGwpO1xuXHR9XG5cdGNvbnN0IG1hdGNoZXM6IHN0cmluZ1tdID0gW107XG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYXdNYXRjaGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0bWF0Y2hlc1tpXSA9IHJhd01hdGNoZXNbaV07XG5cdH1cblx0cmV0dXJuIG5ldyBGaW5kTWF0Y2gocmFuZ2UsIG1hdGNoZXMpO1xufVxuXG5jbGFzcyBMaW5lRmVlZENvdW50ZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVGZWVkc09mZnNldHM6IG51bWJlcltdO1xuXG5cdGNvbnN0cnVjdG9yKHRleHQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGxpbmVGZWVkc09mZnNldHM6IG51bWJlcltdID0gW107XG5cdFx0bGV0IGxpbmVGZWVkc09mZnNldHNMZW4gPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwLCB0ZXh0TGVuID0gdGV4dC5sZW5ndGg7IGkgPCB0ZXh0TGVuOyBpKyspIHtcblx0XHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQoaSkgPT09IENoYXJDb2RlLkxpbmVGZWVkKSB7XG5cdFx0XHRcdGxpbmVGZWVkc09mZnNldHNbbGluZUZlZWRzT2Zmc2V0c0xlbisrXSA9IGk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2xpbmVGZWVkc09mZnNldHMgPSBsaW5lRmVlZHNPZmZzZXRzO1xuXHR9XG5cblx0cHVibGljIGZpbmRMaW5lRmVlZENvdW50QmVmb3JlT2Zmc2V0KG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBsaW5lRmVlZHNPZmZzZXRzID0gdGhpcy5fbGluZUZlZWRzT2Zmc2V0cztcblx0XHRsZXQgbWluID0gMDtcblx0XHRsZXQgbWF4ID0gbGluZUZlZWRzT2Zmc2V0cy5sZW5ndGggLSAxO1xuXG5cdFx0aWYgKG1heCA9PT0gLTEpIHtcblx0XHRcdC8vIG5vIGxpbmUgZmVlZHNcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGlmIChvZmZzZXQgPD0gbGluZUZlZWRzT2Zmc2V0c1swXSkge1xuXHRcdFx0Ly8gYmVmb3JlIGZpcnN0IGxpbmUgZmVlZFxuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0d2hpbGUgKG1pbiA8IG1heCkge1xuXHRcdFx0Y29uc3QgbWlkID0gbWluICsgKChtYXggLSBtaW4pIC8gMiA+PiAwKTtcblxuXHRcdFx0aWYgKGxpbmVGZWVkc09mZnNldHNbbWlkXSA+PSBvZmZzZXQpIHtcblx0XHRcdFx0bWF4ID0gbWlkIC0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChsaW5lRmVlZHNPZmZzZXRzW21pZCArIDFdID49IG9mZnNldCkge1xuXHRcdFx0XHRcdC8vIGJpbmdvIVxuXHRcdFx0XHRcdG1pbiA9IG1pZDtcblx0XHRcdFx0XHRtYXggPSBtaWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWluID0gbWlkICsgMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWluICsgMTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGV4dE1vZGVsU2VhcmNoIHtcblxuXHRwdWJsaWMgc3RhdGljIGZpbmRNYXRjaGVzKG1vZGVsOiBUZXh0TW9kZWwsIHNlYXJjaFBhcmFtczogU2VhcmNoUGFyYW1zLCBzZWFyY2hSYW5nZTogUmFuZ2UsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBsaW1pdFJlc3VsdENvdW50OiBudW1iZXIpOiBGaW5kTWF0Y2hbXSB7XG5cdFx0Y29uc3Qgc2VhcmNoRGF0YSA9IHNlYXJjaFBhcmFtcy5wYXJzZVNlYXJjaFJlcXVlc3QoKTtcblx0XHRpZiAoIXNlYXJjaERhdGEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRpZiAoc2VhcmNoRGF0YS5yZWdleC5tdWx0aWxpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kb0ZpbmRNYXRjaGVzTXVsdGlsaW5lKG1vZGVsLCBzZWFyY2hSYW5nZSwgbmV3IFNlYXJjaGVyKHNlYXJjaERhdGEud29yZFNlcGFyYXRvcnMsIHNlYXJjaERhdGEucmVnZXgpLCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kb0ZpbmRNYXRjaGVzTGluZUJ5TGluZShtb2RlbCwgc2VhcmNoUmFuZ2UsIHNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNdWx0aWxpbmUgc2VhcmNoIGFsd2F5cyBleGVjdXRlcyBvbiB0aGUgbGluZXMgY29uY2F0ZW5hdGVkIHdpdGggXFxuLlxuXHQgKiBXZSBtdXN0IHRoZXJlZm9yZSBjb21wZW5zYXRlIGZvciB0aGUgY291bnQgb2YgXFxuIGluIGNhc2UgdGhlIG1vZGVsIGlzIENSTEZcblx0ICovXG5cdHByaXZhdGUgc3RhdGljIF9nZXRNdWx0aWxpbmVNYXRjaFJhbmdlKG1vZGVsOiBUZXh0TW9kZWwsIGRlbHRhT2Zmc2V0OiBudW1iZXIsIHRleHQ6IHN0cmluZywgbGZDb3VudGVyOiBMaW5lRmVlZENvdW50ZXIgfCBudWxsLCBtYXRjaEluZGV4OiBudW1iZXIsIG1hdGNoMDogc3RyaW5nKTogUmFuZ2Uge1xuXHRcdGxldCBzdGFydE9mZnNldDogbnVtYmVyO1xuXHRcdGxldCBsaW5lRmVlZENvdW50QmVmb3JlTWF0Y2ggPSAwO1xuXHRcdGlmIChsZkNvdW50ZXIpIHtcblx0XHRcdGxpbmVGZWVkQ291bnRCZWZvcmVNYXRjaCA9IGxmQ291bnRlci5maW5kTGluZUZlZWRDb3VudEJlZm9yZU9mZnNldChtYXRjaEluZGV4KTtcblx0XHRcdHN0YXJ0T2Zmc2V0ID0gZGVsdGFPZmZzZXQgKyBtYXRjaEluZGV4ICsgbGluZUZlZWRDb3VudEJlZm9yZU1hdGNoIC8qIGFkZCBhcyBtYW55IFxcciBhcyB0aGVyZSB3ZXJlIFxcbiAqLztcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RhcnRPZmZzZXQgPSBkZWx0YU9mZnNldCArIG1hdGNoSW5kZXg7XG5cdFx0fVxuXG5cdFx0bGV0IGVuZE9mZnNldDogbnVtYmVyO1xuXHRcdGlmIChsZkNvdW50ZXIpIHtcblx0XHRcdGNvbnN0IGxpbmVGZWVkQ291bnRCZWZvcmVFbmRPZk1hdGNoID0gbGZDb3VudGVyLmZpbmRMaW5lRmVlZENvdW50QmVmb3JlT2Zmc2V0KG1hdGNoSW5kZXggKyBtYXRjaDAubGVuZ3RoKTtcblx0XHRcdGNvbnN0IGxpbmVGZWVkQ291bnRJbk1hdGNoID0gbGluZUZlZWRDb3VudEJlZm9yZUVuZE9mTWF0Y2ggLSBsaW5lRmVlZENvdW50QmVmb3JlTWF0Y2g7XG5cdFx0XHRlbmRPZmZzZXQgPSBzdGFydE9mZnNldCArIG1hdGNoMC5sZW5ndGggKyBsaW5lRmVlZENvdW50SW5NYXRjaCAvKiBhZGQgYXMgbWFueSBcXHIgYXMgdGhlcmUgd2VyZSBcXG4gKi87XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVuZE9mZnNldCA9IHN0YXJ0T2Zmc2V0ICsgbWF0Y2gwLmxlbmd0aDtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydFBvc2l0aW9uID0gbW9kZWwuZ2V0UG9zaXRpb25BdChzdGFydE9mZnNldCk7XG5cdFx0Y29uc3QgZW5kUG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KGVuZE9mZnNldCk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0UG9zaXRpb24uY29sdW1uLCBlbmRQb3NpdGlvbi5saW5lTnVtYmVyLCBlbmRQb3NpdGlvbi5jb2x1bW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RvRmluZE1hdGNoZXNNdWx0aWxpbmUobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoUmFuZ2U6IFJhbmdlLCBzZWFyY2hlcjogU2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBsaW1pdFJlc3VsdENvdW50OiBudW1iZXIpOiBGaW5kTWF0Y2hbXSB7XG5cdFx0Y29uc3QgZGVsdGFPZmZzZXQgPSBtb2RlbC5nZXRPZmZzZXRBdChzZWFyY2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdC8vIFdlIGFsd2F5cyBleGVjdXRlIG11bHRpbGluZSBzZWFyY2ggb3ZlciB0aGUgbGluZXMgam9pbmVkIHdpdGggXFxuXG5cdFx0Ly8gVGhpcyBtYWtlcyBpdCB0aGF0IFxcbiB3aWxsIG1hdGNoIHRoZSBFT0wgZm9yIGJvdGggQ1JMRiBhbmQgTEYgbW9kZWxzXG5cdFx0Ly8gV2UgY29tcGVuc2F0ZSBmb3Igb2Zmc2V0IGVycm9ycyBpbiBgX2dldE11bHRpbGluZU1hdGNoUmFuZ2VgXG5cdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShzZWFyY2hSYW5nZSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRik7XG5cdFx0Y29uc3QgbGZDb3VudGVyID0gKG1vZGVsLmdldEVPTCgpID09PSAnXFxyXFxuJyA/IG5ldyBMaW5lRmVlZENvdW50ZXIodGV4dCkgOiBudWxsKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogRmluZE1hdGNoW10gPSBbXTtcblx0XHRsZXQgY291bnRlciA9IDA7XG5cblx0XHRsZXQgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHRzZWFyY2hlci5yZXNldCgwKTtcblx0XHR3aGlsZSAoKG0gPSBzZWFyY2hlci5uZXh0KHRleHQpKSkge1xuXHRcdFx0cmVzdWx0W2NvdW50ZXIrK10gPSBjcmVhdGVGaW5kTWF0Y2godGhpcy5fZ2V0TXVsdGlsaW5lTWF0Y2hSYW5nZShtb2RlbCwgZGVsdGFPZmZzZXQsIHRleHQsIGxmQ291bnRlciwgbS5pbmRleCwgbVswXSksIG0sIGNhcHR1cmVNYXRjaGVzKTtcblx0XHRcdGlmIChjb3VudGVyID49IGxpbWl0UmVzdWx0Q291bnQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RvRmluZE1hdGNoZXNMaW5lQnlMaW5lKG1vZGVsOiBUZXh0TW9kZWwsIHNlYXJjaFJhbmdlOiBSYW5nZSwgc2VhcmNoRGF0YTogU2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlcik6IEZpbmRNYXRjaFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IEZpbmRNYXRjaFtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cblx0XHQvLyBFYXJseSBjYXNlIGZvciBhIHNlYXJjaCByYW5nZSB0aGF0IHN0YXJ0cyAmIHN0b3BzIG9uIHRoZSBzYW1lIGxpbmUgbnVtYmVyXG5cdFx0aWYgKHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gc2VhcmNoUmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlcikuc3Vic3RyaW5nKHNlYXJjaFJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgc2VhcmNoUmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0XHRyZXN1bHRMZW4gPSB0aGlzLl9maW5kTWF0Y2hlc0luTGluZShzZWFyY2hEYXRhLCB0ZXh0LCBzZWFyY2hSYW5nZS5zdGFydExpbmVOdW1iZXIsIHNlYXJjaFJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgcmVzdWx0TGVuLCByZXN1bHQsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ29sbGVjdCByZXN1bHRzIGZyb20gZmlyc3QgbGluZVxuXHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChzZWFyY2hSYW5nZS5zdGFydExpbmVOdW1iZXIpLnN1YnN0cmluZyhzZWFyY2hSYW5nZS5zdGFydENvbHVtbiAtIDEpO1xuXHRcdHJlc3VsdExlbiA9IHRoaXMuX2ZpbmRNYXRjaGVzSW5MaW5lKHNlYXJjaERhdGEsIHRleHQsIHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlciwgc2VhcmNoUmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCByZXN1bHRMZW4sIHJlc3VsdCwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXG5cdFx0Ly8gQ29sbGVjdCByZXN1bHRzIGZyb20gbWlkZGxlIGxpbmVzXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHNlYXJjaFJhbmdlLnN0YXJ0TGluZU51bWJlciArIDE7IGxpbmVOdW1iZXIgPCBzZWFyY2hSYW5nZS5lbmRMaW5lTnVtYmVyICYmIHJlc3VsdExlbiA8IGxpbWl0UmVzdWx0Q291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0cmVzdWx0TGVuID0gdGhpcy5fZmluZE1hdGNoZXNJbkxpbmUoc2VhcmNoRGF0YSwgbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlciksIGxpbmVOdW1iZXIsIDAsIHJlc3VsdExlbiwgcmVzdWx0LCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29sbGVjdCByZXN1bHRzIGZyb20gbGFzdCBsaW5lXG5cdFx0aWYgKHJlc3VsdExlbiA8IGxpbWl0UmVzdWx0Q291bnQpIHtcblx0XHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChzZWFyY2hSYW5nZS5lbmRMaW5lTnVtYmVyKS5zdWJzdHJpbmcoMCwgc2VhcmNoUmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0XHRyZXN1bHRMZW4gPSB0aGlzLl9maW5kTWF0Y2hlc0luTGluZShzZWFyY2hEYXRhLCB0ZXh0LCBzZWFyY2hSYW5nZS5lbmRMaW5lTnVtYmVyLCAwLCByZXN1bHRMZW4sIHJlc3VsdCwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmluZE1hdGNoZXNJbkxpbmUoc2VhcmNoRGF0YTogU2VhcmNoRGF0YSwgdGV4dDogc3RyaW5nLCBsaW5lTnVtYmVyOiBudW1iZXIsIGRlbHRhT2Zmc2V0OiBudW1iZXIsIHJlc3VsdExlbjogbnVtYmVyLCByZXN1bHQ6IEZpbmRNYXRjaFtdLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbiwgbGltaXRSZXN1bHRDb3VudDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IHNlYXJjaERhdGEud29yZFNlcGFyYXRvcnM7XG5cdFx0aWYgKCFjYXB0dXJlTWF0Y2hlcyAmJiBzZWFyY2hEYXRhLnNpbXBsZVNlYXJjaCkge1xuXHRcdFx0Y29uc3Qgc2VhcmNoU3RyaW5nID0gc2VhcmNoRGF0YS5zaW1wbGVTZWFyY2g7XG5cdFx0XHRjb25zdCBzZWFyY2hTdHJpbmdMZW4gPSBzZWFyY2hTdHJpbmcubGVuZ3RoO1xuXHRcdFx0Y29uc3QgdGV4dExlbmd0aCA9IHRleHQubGVuZ3RoO1xuXG5cdFx0XHRsZXQgbGFzdE1hdGNoSW5kZXggPSAtc2VhcmNoU3RyaW5nTGVuO1xuXHRcdFx0d2hpbGUgKChsYXN0TWF0Y2hJbmRleCA9IHRleHQuaW5kZXhPZihzZWFyY2hTdHJpbmcsIGxhc3RNYXRjaEluZGV4ICsgc2VhcmNoU3RyaW5nTGVuKSkgIT09IC0xKSB7XG5cdFx0XHRcdGlmICghd29yZFNlcGFyYXRvcnMgfHwgaXNWYWxpZE1hdGNoKHdvcmRTZXBhcmF0b3JzLCB0ZXh0LCB0ZXh0TGVuZ3RoLCBsYXN0TWF0Y2hJbmRleCwgc2VhcmNoU3RyaW5nTGVuKSkge1xuXHRcdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgRmluZE1hdGNoKG5ldyBSYW5nZShsaW5lTnVtYmVyLCBsYXN0TWF0Y2hJbmRleCArIDEgKyBkZWx0YU9mZnNldCwgbGluZU51bWJlciwgbGFzdE1hdGNoSW5kZXggKyAxICsgc2VhcmNoU3RyaW5nTGVuICsgZGVsdGFPZmZzZXQpLCBudWxsKTtcblx0XHRcdFx0XHRpZiAocmVzdWx0TGVuID49IGxpbWl0UmVzdWx0Q291bnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZXN1bHRMZW47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0TGVuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlYXJjaGVyID0gbmV3IFNlYXJjaGVyKHNlYXJjaERhdGEud29yZFNlcGFyYXRvcnMsIHNlYXJjaERhdGEucmVnZXgpO1xuXHRcdGxldCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdC8vIFJlc2V0IHJlZ2V4IHRvIHNlYXJjaCBmcm9tIHRoZSBiZWdpbm5pbmdcblx0XHRzZWFyY2hlci5yZXNldCgwKTtcblx0XHRkbyB7XG5cdFx0XHRtID0gc2VhcmNoZXIubmV4dCh0ZXh0KTtcblx0XHRcdGlmIChtKSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBjcmVhdGVGaW5kTWF0Y2gobmV3IFJhbmdlKGxpbmVOdW1iZXIsIG0uaW5kZXggKyAxICsgZGVsdGFPZmZzZXQsIGxpbmVOdW1iZXIsIG0uaW5kZXggKyAxICsgbVswXS5sZW5ndGggKyBkZWx0YU9mZnNldCksIG0sIGNhcHR1cmVNYXRjaGVzKTtcblx0XHRcdFx0aWYgKHJlc3VsdExlbiA+PSBsaW1pdFJlc3VsdENvdW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdExlbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKG0pO1xuXHRcdHJldHVybiByZXN1bHRMZW47XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZpbmROZXh0TWF0Y2gobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoUGFyYW1zOiBTZWFyY2hQYXJhbXMsIHNlYXJjaFN0YXJ0OiBQb3NpdGlvbiwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4pOiBGaW5kTWF0Y2ggfCBudWxsIHtcblx0XHRjb25zdCBzZWFyY2hEYXRhID0gc2VhcmNoUGFyYW1zLnBhcnNlU2VhcmNoUmVxdWVzdCgpO1xuXHRcdGlmICghc2VhcmNoRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VhcmNoZXIgPSBuZXcgU2VhcmNoZXIoc2VhcmNoRGF0YS53b3JkU2VwYXJhdG9ycywgc2VhcmNoRGF0YS5yZWdleCk7XG5cblx0XHRpZiAoc2VhcmNoRGF0YS5yZWdleC5tdWx0aWxpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kb0ZpbmROZXh0TWF0Y2hNdWx0aWxpbmUobW9kZWwsIHNlYXJjaFN0YXJ0LCBzZWFyY2hlciwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZG9GaW5kTmV4dE1hdGNoTGluZUJ5TGluZShtb2RlbCwgc2VhcmNoU3RhcnQsIHNlYXJjaGVyLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZG9GaW5kTmV4dE1hdGNoTXVsdGlsaW5lKG1vZGVsOiBUZXh0TW9kZWwsIHNlYXJjaFN0YXJ0OiBQb3NpdGlvbiwgc2VhcmNoZXI6IFNlYXJjaGVyLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdGNvbnN0IHNlYXJjaFRleHRTdGFydCA9IG5ldyBQb3NpdGlvbihzZWFyY2hTdGFydC5saW5lTnVtYmVyLCAxKTtcblx0XHRjb25zdCBkZWx0YU9mZnNldCA9IG1vZGVsLmdldE9mZnNldEF0KHNlYXJjaFRleHRTdGFydCk7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Ly8gV2UgYWx3YXlzIGV4ZWN1dGUgbXVsdGlsaW5lIHNlYXJjaCBvdmVyIHRoZSBsaW5lcyBqb2luZWQgd2l0aCBcXG5cblx0XHQvLyBUaGlzIG1ha2VzIGl0IHRoYXQgXFxuIHdpbGwgbWF0Y2ggdGhlIEVPTCBmb3IgYm90aCBDUkxGIGFuZCBMRiBtb2RlbHNcblx0XHQvLyBXZSBjb21wZW5zYXRlIGZvciBvZmZzZXQgZXJyb3JzIGluIGBfZ2V0TXVsdGlsaW5lTWF0Y2hSYW5nZWBcblx0XHRjb25zdCB0ZXh0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShzZWFyY2hUZXh0U3RhcnQubGluZU51bWJlciwgc2VhcmNoVGV4dFN0YXJ0LmNvbHVtbiwgbGluZUNvdW50LCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVDb3VudCkpLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKTtcblx0XHRjb25zdCBsZkNvdW50ZXIgPSAobW9kZWwuZ2V0RU9MKCkgPT09ICdcXHJcXG4nID8gbmV3IExpbmVGZWVkQ291bnRlcih0ZXh0KSA6IG51bGwpO1xuXHRcdHNlYXJjaGVyLnJlc2V0KHNlYXJjaFN0YXJ0LmNvbHVtbiAtIDEpO1xuXHRcdGNvbnN0IG0gPSBzZWFyY2hlci5uZXh0KHRleHQpO1xuXHRcdGlmIChtKSB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlRmluZE1hdGNoKFxuXHRcdFx0XHR0aGlzLl9nZXRNdWx0aWxpbmVNYXRjaFJhbmdlKG1vZGVsLCBkZWx0YU9mZnNldCwgdGV4dCwgbGZDb3VudGVyLCBtLmluZGV4LCBtWzBdKSxcblx0XHRcdFx0bSxcblx0XHRcdFx0Y2FwdHVyZU1hdGNoZXNcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKHNlYXJjaFN0YXJ0LmxpbmVOdW1iZXIgIT09IDEgfHwgc2VhcmNoU3RhcnQuY29sdW1uICE9PSAxKSB7XG5cdFx0XHQvLyBUcnkgYWdhaW4gZnJvbSB0aGUgdG9wXG5cdFx0XHRyZXR1cm4gdGhpcy5fZG9GaW5kTmV4dE1hdGNoTXVsdGlsaW5lKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSksIHNlYXJjaGVyLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZG9GaW5kTmV4dE1hdGNoTGluZUJ5TGluZShtb2RlbDogVGV4dE1vZGVsLCBzZWFyY2hTdGFydDogUG9zaXRpb24sIHNlYXJjaGVyOiBTZWFyY2hlciwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4pOiBGaW5kTWF0Y2ggfCBudWxsIHtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBzZWFyY2hTdGFydC5saW5lTnVtYmVyO1xuXG5cdFx0Ly8gTG9vayBpbiBmaXJzdCBsaW5lXG5cdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgciA9IHRoaXMuX2ZpbmRGaXJzdE1hdGNoSW5MaW5lKHNlYXJjaGVyLCB0ZXh0LCBzdGFydExpbmVOdW1iZXIsIHNlYXJjaFN0YXJ0LmNvbHVtbiwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdGlmIChyKSB7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSBsaW5lQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZUluZGV4ID0gKHN0YXJ0TGluZU51bWJlciArIGkgLSAxKSAlIGxpbmVDb3VudDtcblx0XHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lSW5kZXggKyAxKTtcblx0XHRcdGNvbnN0IHIgPSB0aGlzLl9maW5kRmlyc3RNYXRjaEluTGluZShzZWFyY2hlciwgdGV4dCwgbGluZUluZGV4ICsgMSwgMSwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmluZEZpcnN0TWF0Y2hJbkxpbmUoc2VhcmNoZXI6IFNlYXJjaGVyLCB0ZXh0OiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlciwgZnJvbUNvbHVtbjogbnVtYmVyLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdC8vIFNldCByZWdleCB0byBzZWFyY2ggZnJvbSBjb2x1bW5cblx0XHRzZWFyY2hlci5yZXNldChmcm9tQ29sdW1uIC0gMSk7XG5cdFx0Y29uc3QgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IHNlYXJjaGVyLm5leHQodGV4dCk7XG5cdFx0aWYgKG0pIHtcblx0XHRcdHJldHVybiBjcmVhdGVGaW5kTWF0Y2goXG5cdFx0XHRcdG5ldyBSYW5nZShsaW5lTnVtYmVyLCBtLmluZGV4ICsgMSwgbGluZU51bWJlciwgbS5pbmRleCArIDEgKyBtWzBdLmxlbmd0aCksXG5cdFx0XHRcdG0sXG5cdFx0XHRcdGNhcHR1cmVNYXRjaGVzXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZmluZFByZXZpb3VzTWF0Y2gobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoUGFyYW1zOiBTZWFyY2hQYXJhbXMsIHNlYXJjaFN0YXJ0OiBQb3NpdGlvbiwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4pOiBGaW5kTWF0Y2ggfCBudWxsIHtcblx0XHRjb25zdCBzZWFyY2hEYXRhID0gc2VhcmNoUGFyYW1zLnBhcnNlU2VhcmNoUmVxdWVzdCgpO1xuXHRcdGlmICghc2VhcmNoRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VhcmNoZXIgPSBuZXcgU2VhcmNoZXIoc2VhcmNoRGF0YS53b3JkU2VwYXJhdG9ycywgc2VhcmNoRGF0YS5yZWdleCk7XG5cblx0XHRpZiAoc2VhcmNoRGF0YS5yZWdleC5tdWx0aWxpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kb0ZpbmRQcmV2aW91c01hdGNoTXVsdGlsaW5lKG1vZGVsLCBzZWFyY2hTdGFydCwgc2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RvRmluZFByZXZpb3VzTWF0Y2hMaW5lQnlMaW5lKG1vZGVsLCBzZWFyY2hTdGFydCwgc2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9kb0ZpbmRQcmV2aW91c01hdGNoTXVsdGlsaW5lKG1vZGVsOiBUZXh0TW9kZWwsIHNlYXJjaFN0YXJ0OiBQb3NpdGlvbiwgc2VhcmNoZXI6IFNlYXJjaGVyLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLl9kb0ZpbmRNYXRjaGVzTXVsdGlsaW5lKG1vZGVsLCBuZXcgUmFuZ2UoMSwgMSwgc2VhcmNoU3RhcnQubGluZU51bWJlciwgc2VhcmNoU3RhcnQuY29sdW1uKSwgc2VhcmNoZXIsIGNhcHR1cmVNYXRjaGVzLCAxMCAqIExJTUlUX0ZJTkRfQ09VTlQpO1xuXHRcdGlmIChtYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBtYXRjaGVzW21hdGNoZXMubGVuZ3RoIC0gMV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0aWYgKHNlYXJjaFN0YXJ0LmxpbmVOdW1iZXIgIT09IGxpbmVDb3VudCB8fCBzZWFyY2hTdGFydC5jb2x1bW4gIT09IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KSkge1xuXHRcdFx0Ly8gVHJ5IGFnYWluIHdpdGggYWxsIGNvbnRlbnRcblx0XHRcdHJldHVybiB0aGlzLl9kb0ZpbmRQcmV2aW91c01hdGNoTXVsdGlsaW5lKG1vZGVsLCBuZXcgUG9zaXRpb24obGluZUNvdW50LCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVDb3VudCkpLCBzZWFyY2hlciwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RvRmluZFByZXZpb3VzTWF0Y2hMaW5lQnlMaW5lKG1vZGVsOiBUZXh0TW9kZWwsIHNlYXJjaFN0YXJ0OiBQb3NpdGlvbiwgc2VhcmNoZXI6IFNlYXJjaGVyLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IEZpbmRNYXRjaCB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHNlYXJjaFN0YXJ0LmxpbmVOdW1iZXI7XG5cblx0XHQvLyBMb29rIGluIGZpcnN0IGxpbmVcblx0XHRjb25zdCB0ZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKS5zdWJzdHJpbmcoMCwgc2VhcmNoU3RhcnQuY29sdW1uIC0gMSk7XG5cdFx0Y29uc3QgciA9IHRoaXMuX2ZpbmRMYXN0TWF0Y2hJbkxpbmUoc2VhcmNoZXIsIHRleHQsIHN0YXJ0TGluZU51bWJlciwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdGlmIChyKSB7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSBsaW5lQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZUluZGV4ID0gKGxpbmVDb3VudCArIHN0YXJ0TGluZU51bWJlciAtIGkgLSAxKSAlIGxpbmVDb3VudDtcblx0XHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lSW5kZXggKyAxKTtcblx0XHRcdGNvbnN0IHIgPSB0aGlzLl9maW5kTGFzdE1hdGNoSW5MaW5lKHNlYXJjaGVyLCB0ZXh0LCBsaW5lSW5kZXggKyAxLCBjYXB0dXJlTWF0Y2hlcyk7XG5cdFx0XHRpZiAocikge1xuXHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maW5kTGFzdE1hdGNoSW5MaW5lKHNlYXJjaGVyOiBTZWFyY2hlciwgdGV4dDogc3RyaW5nLCBsaW5lTnVtYmVyOiBudW1iZXIsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuKTogRmluZE1hdGNoIHwgbnVsbCB7XG5cdFx0bGV0IGJlc3RSZXN1bHQ6IEZpbmRNYXRjaCB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdHNlYXJjaGVyLnJlc2V0KDApO1xuXHRcdHdoaWxlICgobSA9IHNlYXJjaGVyLm5leHQodGV4dCkpKSB7XG5cdFx0XHRiZXN0UmVzdWx0ID0gY3JlYXRlRmluZE1hdGNoKG5ldyBSYW5nZShsaW5lTnVtYmVyLCBtLmluZGV4ICsgMSwgbGluZU51bWJlciwgbS5pbmRleCArIDEgKyBtWzBdLmxlbmd0aCksIG0sIGNhcHR1cmVNYXRjaGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGJlc3RSZXN1bHQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gbGVmdElzV29yZEJvdW5kYXkod29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCB0ZXh0OiBzdHJpbmcsIHRleHRMZW5ndGg6IG51bWJlciwgbWF0Y2hTdGFydEluZGV4OiBudW1iZXIsIG1hdGNoTGVuZ3RoOiBudW1iZXIpOiBib29sZWFuIHtcblx0aWYgKG1hdGNoU3RhcnRJbmRleCA9PT0gMCkge1xuXHRcdC8vIE1hdGNoIHN0YXJ0cyBhdCBzdGFydCBvZiBzdHJpbmdcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IGNoYXJCZWZvcmUgPSB0ZXh0LmNoYXJDb2RlQXQobWF0Y2hTdGFydEluZGV4IC0gMSk7XG5cdGlmICh3b3JkU2VwYXJhdG9ycy5nZXQoY2hhckJlZm9yZSkgIT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5SZWd1bGFyKSB7XG5cdFx0Ly8gVGhlIGNoYXJhY3RlciBiZWZvcmUgdGhlIG1hdGNoIGlzIGEgd29yZCBzZXBhcmF0b3Jcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChjaGFyQmVmb3JlID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybiB8fCBjaGFyQmVmb3JlID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdC8vIFRoZSBjaGFyYWN0ZXIgYmVmb3JlIHRoZSBtYXRjaCBpcyBsaW5lIGJyZWFrIG9yIGNhcnJpYWdlIHJldHVybi5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChtYXRjaExlbmd0aCA+IDApIHtcblx0XHRjb25zdCBmaXJzdENoYXJJbk1hdGNoID0gdGV4dC5jaGFyQ29kZUF0KG1hdGNoU3RhcnRJbmRleCk7XG5cdFx0aWYgKHdvcmRTZXBhcmF0b3JzLmdldChmaXJzdENoYXJJbk1hdGNoKSAhPT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXIpIHtcblx0XHRcdC8vIFRoZSBmaXJzdCBjaGFyYWN0ZXIgaW5zaWRlIHRoZSBtYXRjaCBpcyBhIHdvcmQgc2VwYXJhdG9yXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHJpZ2h0SXNXb3JkQm91bmRheSh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIHRleHQ6IHN0cmluZywgdGV4dExlbmd0aDogbnVtYmVyLCBtYXRjaFN0YXJ0SW5kZXg6IG51bWJlciwgbWF0Y2hMZW5ndGg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRpZiAobWF0Y2hTdGFydEluZGV4ICsgbWF0Y2hMZW5ndGggPT09IHRleHRMZW5ndGgpIHtcblx0XHQvLyBNYXRjaCBlbmRzIGF0IGVuZCBvZiBzdHJpbmdcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IGNoYXJBZnRlciA9IHRleHQuY2hhckNvZGVBdChtYXRjaFN0YXJ0SW5kZXggKyBtYXRjaExlbmd0aCk7XG5cdGlmICh3b3JkU2VwYXJhdG9ycy5nZXQoY2hhckFmdGVyKSAhPT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXIpIHtcblx0XHQvLyBUaGUgY2hhcmFjdGVyIGFmdGVyIHRoZSBtYXRjaCBpcyBhIHdvcmQgc2VwYXJhdG9yXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAoY2hhckFmdGVyID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybiB8fCBjaGFyQWZ0ZXIgPT09IENoYXJDb2RlLkxpbmVGZWVkKSB7XG5cdFx0Ly8gVGhlIGNoYXJhY3RlciBhZnRlciB0aGUgbWF0Y2ggaXMgbGluZSBicmVhayBvciBjYXJyaWFnZSByZXR1cm4uXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAobWF0Y2hMZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgbGFzdENoYXJJbk1hdGNoID0gdGV4dC5jaGFyQ29kZUF0KG1hdGNoU3RhcnRJbmRleCArIG1hdGNoTGVuZ3RoIC0gMSk7XG5cdFx0aWYgKHdvcmRTZXBhcmF0b3JzLmdldChsYXN0Q2hhckluTWF0Y2gpICE9PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuUmVndWxhcikge1xuXHRcdFx0Ly8gVGhlIGxhc3QgY2hhcmFjdGVyIGluIHRoZSBtYXRjaCBpcyBhIHdvcmQgc2VwYXJhdG9yXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1ZhbGlkTWF0Y2god29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCB0ZXh0OiBzdHJpbmcsIHRleHRMZW5ndGg6IG51bWJlciwgbWF0Y2hTdGFydEluZGV4OiBudW1iZXIsIG1hdGNoTGVuZ3RoOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIChcblx0XHRsZWZ0SXNXb3JkQm91bmRheSh3b3JkU2VwYXJhdG9ycywgdGV4dCwgdGV4dExlbmd0aCwgbWF0Y2hTdGFydEluZGV4LCBtYXRjaExlbmd0aClcblx0XHQmJiByaWdodElzV29yZEJvdW5kYXkod29yZFNlcGFyYXRvcnMsIHRleHQsIHRleHRMZW5ndGgsIG1hdGNoU3RhcnRJbmRleCwgbWF0Y2hMZW5ndGgpXG5cdCk7XG59XG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hlciB7XG5cdHB1YmxpYyByZWFkb25seSBfd29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VhcmNoUmVnZXg6IFJlZ0V4cDtcblx0cHJpdmF0ZSBfcHJldk1hdGNoU3RhcnRJbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIF9wcmV2TWF0Y2hMZW5ndGg6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcih3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIgfCBudWxsLCBzZWFyY2hSZWdleDogUmVnRXhwLCkge1xuXHRcdHRoaXMuX3dvcmRTZXBhcmF0b3JzID0gd29yZFNlcGFyYXRvcnM7XG5cdFx0dGhpcy5fc2VhcmNoUmVnZXggPSBzZWFyY2hSZWdleDtcblx0XHR0aGlzLl9wcmV2TWF0Y2hTdGFydEluZGV4ID0gLTE7XG5cdFx0dGhpcy5fcHJldk1hdGNoTGVuZ3RoID0gMDtcblx0fVxuXG5cdHB1YmxpYyByZXNldChsYXN0SW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3NlYXJjaFJlZ2V4Lmxhc3RJbmRleCA9IGxhc3RJbmRleDtcblx0XHR0aGlzLl9wcmV2TWF0Y2hTdGFydEluZGV4ID0gLTE7XG5cdFx0dGhpcy5fcHJldk1hdGNoTGVuZ3RoID0gMDtcblx0fVxuXG5cdHB1YmxpYyBuZXh0KHRleHQ6IHN0cmluZyk6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwge1xuXHRcdGNvbnN0IHRleHRMZW5ndGggPSB0ZXh0Lmxlbmd0aDtcblxuXHRcdGxldCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdGRvIHtcblx0XHRcdGlmICh0aGlzLl9wcmV2TWF0Y2hTdGFydEluZGV4ICsgdGhpcy5fcHJldk1hdGNoTGVuZ3RoID09PSB0ZXh0TGVuZ3RoKSB7XG5cdFx0XHRcdC8vIFJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgbGluZVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0bSA9IHRoaXMuX3NlYXJjaFJlZ2V4LmV4ZWModGV4dCk7XG5cdFx0XHRpZiAoIW0pIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hdGNoU3RhcnRJbmRleCA9IG0uaW5kZXg7XG5cdFx0XHRjb25zdCBtYXRjaExlbmd0aCA9IG1bMF0ubGVuZ3RoO1xuXHRcdFx0aWYgKG1hdGNoU3RhcnRJbmRleCA9PT0gdGhpcy5fcHJldk1hdGNoU3RhcnRJbmRleCAmJiBtYXRjaExlbmd0aCA9PT0gdGhpcy5fcHJldk1hdGNoTGVuZ3RoKSB7XG5cdFx0XHRcdGlmIChtYXRjaExlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIHRoZSBzZWFyY2ggcmVzdWx0IGlzIGFuIGVtcHR5IHN0cmluZyBhbmQgd29uJ3QgYWR2YW5jZSBgcmVnZXgubGFzdEluZGV4YCwgc28gYHJlZ2V4LmV4ZWNgIHdpbGwgc3R1Y2sgaGVyZVxuXHRcdFx0XHRcdC8vIHdlIGF0dGVtcHQgdG8gcmVjb3ZlciBmcm9tIHRoYXQgYnkgYWR2YW5jaW5nIGJ5IHR3byBpZiBzdXJyb2dhdGUgcGFpciBmb3VuZCBhbmQgYnkgb25lIG90aGVyd2lzZVxuXHRcdFx0XHRcdGlmIChzdHJpbmdzLmdldE5leHRDb2RlUG9pbnQodGV4dCwgdGV4dExlbmd0aCwgdGhpcy5fc2VhcmNoUmVnZXgubGFzdEluZGV4KSA+IDB4RkZGRikge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2VhcmNoUmVnZXgubGFzdEluZGV4ICs9IDI7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX3NlYXJjaFJlZ2V4Lmxhc3RJbmRleCArPSAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBFeGl0IGVhcmx5IGlmIHRoZSByZWdleCBtYXRjaGVzIHRoZSBzYW1lIHJhbmdlIHR3aWNlXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJldk1hdGNoU3RhcnRJbmRleCA9IG1hdGNoU3RhcnRJbmRleDtcblx0XHRcdHRoaXMuX3ByZXZNYXRjaExlbmd0aCA9IG1hdGNoTGVuZ3RoO1xuXG5cdFx0XHRpZiAoIXRoaXMuX3dvcmRTZXBhcmF0b3JzIHx8IGlzVmFsaWRNYXRjaCh0aGlzLl93b3JkU2VwYXJhdG9ycywgdGV4dCwgdGV4dExlbmd0aCwgbWF0Y2hTdGFydEluZGV4LCBtYXRjaExlbmd0aCkpIHtcblx0XHRcdFx0cmV0dXJuIG07XG5cdFx0XHR9XG5cblx0XHR9IHdoaWxlIChtKTtcblxuXHRc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
