import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { SelectionStartKind, SingleCursorState } from "../cursorCommon.js";
import { DeleteOperations } from "./cursorDeleteOperations.js";
import { WordCharacterClass, getMapForWordSeparators } from "../core/wordCharacterClassifier.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
var WordType = /* @__PURE__ */ ((WordType2) => {
  WordType2[WordType2["None"] = 0] = "None";
  WordType2[WordType2["Regular"] = 1] = "Regular";
  WordType2[WordType2["Separator"] = 2] = "Separator";
  return WordType2;
})(WordType || {});
var WordNavigationType = /* @__PURE__ */ ((WordNavigationType2) => {
  WordNavigationType2[WordNavigationType2["WordStart"] = 0] = "WordStart";
  WordNavigationType2[WordNavigationType2["WordStartFast"] = 1] = "WordStartFast";
  WordNavigationType2[WordNavigationType2["WordEnd"] = 2] = "WordEnd";
  WordNavigationType2[WordNavigationType2["WordAccessibility"] = 3] = "WordAccessibility";
  return WordNavigationType2;
})(WordNavigationType || {});
class WordOperations {
  static _createWord(lineContent, wordType, nextCharClass, start, end) {
    return { start, end, wordType, nextCharClass };
  }
  static _createIntlWord(intlWord, nextCharClass) {
    return { start: intlWord.index, end: intlWord.index + intlWord.segment.length, wordType: 1 /* Regular */, nextCharClass };
  }
  static _findPreviousWordOnLine(wordSeparators, model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    return this._doFindPreviousWordOnLine(lineContent, wordSeparators, position);
  }
  static _doFindPreviousWordOnLine(lineContent, wordSeparators, position) {
    let wordType = 0 /* None */;
    const previousIntlWord = wordSeparators.findPrevIntlWordBeforeOrAtOffset(lineContent, position.column - 2);
    for (let chIndex = position.column - 2; chIndex >= 0; chIndex--) {
      const chCode = lineContent.charCodeAt(chIndex);
      const chClass = wordSeparators.get(chCode);
      if (previousIntlWord && chIndex === previousIntlWord.index) {
        return this._createIntlWord(previousIntlWord, chClass);
      }
      if (chClass === WordCharacterClass.Regular) {
        if (wordType === 2 /* Separator */) {
          return this._createWord(lineContent, wordType, chClass, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
        }
        wordType = 1 /* Regular */;
      } else if (chClass === WordCharacterClass.WordSeparator) {
        if (wordType === 1 /* Regular */) {
          return this._createWord(lineContent, wordType, chClass, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
        }
        wordType = 2 /* Separator */;
      } else if (chClass === WordCharacterClass.Whitespace) {
        if (wordType !== 0 /* None */) {
          return this._createWord(lineContent, wordType, chClass, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
        }
      }
    }
    if (wordType !== 0 /* None */) {
      return this._createWord(lineContent, wordType, WordCharacterClass.Whitespace, 0, this._findEndOfWord(lineContent, wordSeparators, wordType, 0));
    }
    return null;
  }
  static _findEndOfWord(lineContent, wordSeparators, wordType, startIndex) {
    const nextIntlWord = wordSeparators.findNextIntlWordAtOrAfterOffset(lineContent, startIndex);
    const len = lineContent.length;
    for (let chIndex = startIndex; chIndex < len; chIndex++) {
      const chCode = lineContent.charCodeAt(chIndex);
      const chClass = wordSeparators.get(chCode);
      if (nextIntlWord && chIndex === nextIntlWord.index + nextIntlWord.segment.length) {
        return chIndex;
      }
      if (chClass === WordCharacterClass.Whitespace) {
        return chIndex;
      }
      if (wordType === 1 /* Regular */ && chClass === WordCharacterClass.WordSeparator) {
        return chIndex;
      }
      if (wordType === 2 /* Separator */ && chClass === WordCharacterClass.Regular) {
        return chIndex;
      }
    }
    return len;
  }
  static _findNextWordOnLine(wordSeparators, model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    return this._doFindNextWordOnLine(lineContent, wordSeparators, position);
  }
  static _doFindNextWordOnLine(lineContent, wordSeparators, position) {
    let wordType = 0 /* None */;
    const len = lineContent.length;
    const nextIntlWord = wordSeparators.findNextIntlWordAtOrAfterOffset(lineContent, position.column - 1);
    for (let chIndex = position.column - 1; chIndex < len; chIndex++) {
      const chCode = lineContent.charCodeAt(chIndex);
      const chClass = wordSeparators.get(chCode);
      if (nextIntlWord && chIndex === nextIntlWord.index) {
        return this._createIntlWord(nextIntlWord, chClass);
      }
      if (chClass === WordCharacterClass.Regular) {
        if (wordType === 2 /* Separator */) {
          return this._createWord(lineContent, wordType, chClass, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
        }
        wordType = 1 /* Regular */;
      } else if (chClass === WordCharacterClass.WordSeparator) {
        if (wordType === 1 /* Regular */) {
          return this._createWord(lineContent, wordType, chClass, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
        }
        wordType = 2 /* Separator */;
      } else if (chClass === WordCharacterClass.Whitespace) {
        if (wordType !== 0 /* None */) {
          return this._createWord(lineContent, wordType, chClass, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
        }
      }
    }
    if (wordType !== 0 /* None */) {
      return this._createWord(lineContent, wordType, WordCharacterClass.Whitespace, this._findStartOfWord(lineContent, wordSeparators, wordType, len - 1), len);
    }
    return null;
  }
  static _findStartOfWord(lineContent, wordSeparators, wordType, startIndex) {
    const previousIntlWord = wordSeparators.findPrevIntlWordBeforeOrAtOffset(lineContent, startIndex);
    for (let chIndex = startIndex; chIndex >= 0; chIndex--) {
      const chCode = lineContent.charCodeAt(chIndex);
      const chClass = wordSeparators.get(chCode);
      if (previousIntlWord && chIndex === previousIntlWord.index) {
        return chIndex;
      }
      if (chClass === WordCharacterClass.Whitespace) {
        return chIndex + 1;
      }
      if (wordType === 1 /* Regular */ && chClass === WordCharacterClass.WordSeparator) {
        return chIndex + 1;
      }
      if (wordType === 2 /* Separator */ && chClass === WordCharacterClass.Regular) {
        return chIndex + 1;
      }
    }
    return 0;
  }
  static moveWordLeft(wordSeparators, model, position, wordNavigationType, hasMulticursor) {
    let lineNumber = position.lineNumber;
    let column = position.column;
    if (column === 1) {
      if (lineNumber > 1) {
        lineNumber = lineNumber - 1;
        column = model.getLineMaxColumn(lineNumber);
      }
    }
    let prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, column));
    if (wordNavigationType === 0 /* WordStart */) {
      return new Position(lineNumber, prevWordOnLine ? prevWordOnLine.start + 1 : 1);
    }
    if (wordNavigationType === 1 /* WordStartFast */) {
      if (!hasMulticursor && prevWordOnLine && prevWordOnLine.wordType === 2 /* Separator */ && prevWordOnLine.end - prevWordOnLine.start === 1 && prevWordOnLine.nextCharClass === WordCharacterClass.Regular) {
        prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, prevWordOnLine.start + 1));
      }
      return new Position(lineNumber, prevWordOnLine ? prevWordOnLine.start + 1 : 1);
    }
    if (wordNavigationType === 3 /* WordAccessibility */) {
      while (prevWordOnLine && prevWordOnLine.wordType === 2 /* Separator */) {
        prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, prevWordOnLine.start + 1));
      }
      return new Position(lineNumber, prevWordOnLine ? prevWordOnLine.start + 1 : 1);
    }
    if (prevWordOnLine && column <= prevWordOnLine.end + 1) {
      prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, prevWordOnLine.start + 1));
    }
    return new Position(lineNumber, prevWordOnLine ? prevWordOnLine.end + 1 : 1);
  }
  static _moveWordPartLeft(model, position) {
    const lineNumber = position.lineNumber;
    const maxColumn = model.getLineMaxColumn(lineNumber);
    if (position.column === 1) {
      return lineNumber > 1 ? new Position(lineNumber - 1, model.getLineMaxColumn(lineNumber - 1)) : position;
    }
    const lineContent = model.getLineContent(lineNumber);
    for (let column = position.column - 1; column > 1; column--) {
      const left = lineContent.charCodeAt(column - 2);
      const right = lineContent.charCodeAt(column - 1);
      if (left === CharCode.Underline && right !== CharCode.Underline) {
        return new Position(lineNumber, column);
      }
      if (left === CharCode.Dash && right !== CharCode.Dash) {
        return new Position(lineNumber, column);
      }
      if ((strings.isLowerAsciiLetter(left) || strings.isAsciiDigit(left)) && strings.isUpperAsciiLetter(right)) {
        return new Position(lineNumber, column);
      }
      if (strings.isUpperAsciiLetter(left) && strings.isUpperAsciiLetter(right)) {
        if (column + 1 < maxColumn) {
          const rightRight = lineContent.charCodeAt(column);
          if (strings.isLowerAsciiLetter(rightRight) || strings.isAsciiDigit(rightRight)) {
            return new Position(lineNumber, column);
          }
        }
      }
    }
    return new Position(lineNumber, 1);
  }
  static moveWordRight(wordSeparators, model, position, wordNavigationType) {
    let lineNumber = position.lineNumber;
    let column = position.column;
    let movedDown = false;
    if (column === model.getLineMaxColumn(lineNumber)) {
      if (lineNumber < model.getLineCount()) {
        movedDown = true;
        lineNumber = lineNumber + 1;
        column = 1;
      }
    }
    let nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, column));
    if (wordNavigationType === 2 /* WordEnd */) {
      if (nextWordOnLine && nextWordOnLine.wordType === 2 /* Separator */) {
        if (nextWordOnLine.end - nextWordOnLine.start === 1 && nextWordOnLine.nextCharClass === WordCharacterClass.Regular) {
          nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, nextWordOnLine.end + 1));
        }
      }
      if (nextWordOnLine) {
        column = nextWordOnLine.end + 1;
      } else {
        column = model.getLineMaxColumn(lineNumber);
      }
    } else if (wordNavigationType === 3 /* WordAccessibility */) {
      if (movedDown) {
        column = 0;
      }
      while (nextWordOnLine && (nextWordOnLine.wordType === 2 /* Separator */ || nextWordOnLine.start + 1 <= column)) {
        nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, nextWordOnLine.end + 1));
      }
      if (nextWordOnLine) {
        column = nextWordOnLine.start + 1;
      } else {
        column = model.getLineMaxColumn(lineNumber);
      }
    } else {
      if (nextWordOnLine && !movedDown && column >= nextWordOnLine.start + 1) {
        nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, nextWordOnLine.end + 1));
      }
      if (nextWordOnLine) {
        column = nextWordOnLine.start + 1;
      } else {
        column = model.getLineMaxColumn(lineNumber);
      }
    }
    return new Position(lineNumber, column);
  }
  static _moveWordPartRight(model, position) {
    const lineNumber = position.lineNumber;
    const maxColumn = model.getLineMaxColumn(lineNumber);
    if (position.column === maxColumn) {
      return lineNumber < model.getLineCount() ? new Position(lineNumber + 1, 1) : position;
    }
    const lineContent = model.getLineContent(lineNumber);
    for (let column = position.column + 1; column < maxColumn; column++) {
      const left = lineContent.charCodeAt(column - 2);
      const right = lineContent.charCodeAt(column - 1);
      if (left !== CharCode.Underline && right === CharCode.Underline) {
        return new Position(lineNumber, column);
      }
      if (left !== CharCode.Dash && right === CharCode.Dash) {
        return new Position(lineNumber, column);
      }
      if ((strings.isLowerAsciiLetter(left) || strings.isAsciiDigit(left)) && strings.isUpperAsciiLetter(right)) {
        return new Position(lineNumber, column);
      }
      if (strings.isUpperAsciiLetter(left) && strings.isUpperAsciiLetter(right)) {
        if (column + 1 < maxColumn) {
          const rightRight = lineContent.charCodeAt(column);
          if (strings.isLowerAsciiLetter(rightRight) || strings.isAsciiDigit(rightRight)) {
            return new Position(lineNumber, column);
          }
        }
      }
    }
    return new Position(lineNumber, maxColumn);
  }
  static _deleteWordLeftWhitespace(model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    const startIndex = position.column - 2;
    const lastNonWhitespace = strings.lastNonWhitespaceIndex(lineContent, startIndex);
    if (lastNonWhitespace + 1 < startIndex) {
      return new Range(position.lineNumber, lastNonWhitespace + 2, position.lineNumber, position.column);
    }
    return null;
  }
  static deleteWordLeft(ctx, wordNavigationType) {
    const wordSeparators = ctx.wordSeparators;
    const model = ctx.model;
    const selection = ctx.selection;
    const whitespaceHeuristics = ctx.whitespaceHeuristics;
    if (!selection.isEmpty()) {
      return selection;
    }
    if (DeleteOperations.isAutoClosingPairDelete(ctx.autoClosingDelete, ctx.autoClosingBrackets, ctx.autoClosingQuotes, ctx.autoClosingPairs.autoClosingPairsOpenByEnd, ctx.model, [ctx.selection], ctx.autoClosedCharacters)) {
      const position2 = ctx.selection.getPosition();
      return new Range(position2.lineNumber, position2.column - 1, position2.lineNumber, position2.column + 1);
    }
    const position = new Position(selection.positionLineNumber, selection.positionColumn);
    let lineNumber = position.lineNumber;
    let column = position.column;
    if (lineNumber === 1 && column === 1) {
      return null;
    }
    if (whitespaceHeuristics) {
      const r = this._deleteWordLeftWhitespace(model, position);
      if (r) {
        return r;
      }
    }
    let prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, position);
    if (wordNavigationType === 0 /* WordStart */) {
      if (prevWordOnLine) {
        column = prevWordOnLine.start + 1;
      } else {
        if (column > 1) {
          column = 1;
        } else {
          lineNumber--;
          column = model.getLineMaxColumn(lineNumber);
        }
      }
    } else {
      if (prevWordOnLine && column <= prevWordOnLine.end + 1) {
        prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, new Position(lineNumber, prevWordOnLine.start + 1));
      }
      if (prevWordOnLine) {
        column = prevWordOnLine.end + 1;
      } else {
        if (column > 1) {
          column = 1;
        } else {
          lineNumber--;
          column = model.getLineMaxColumn(lineNumber);
        }
      }
    }
    return new Range(lineNumber, column, position.lineNumber, position.column);
  }
  static deleteInsideWord(wordSeparators, model, selection, onlyWord = false) {
    if (!selection.isEmpty()) {
      return selection;
    }
    const position = new Position(selection.positionLineNumber, selection.positionColumn);
    const r = this._deleteInsideWordWhitespace(model, position);
    if (r) {
      return r;
    }
    return this._deleteInsideWordDetermineDeleteRange(wordSeparators, model, position, onlyWord);
  }
  static _charAtIsWhitespace(str, index) {
    const charCode = str.charCodeAt(index);
    return charCode === CharCode.Space || charCode === CharCode.Tab;
  }
  static _deleteInsideWordWhitespace(model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    const lineContentLength = lineContent.length;
    if (lineContentLength === 0) {
      return null;
    }
    let leftIndex = Math.max(position.column - 2, 0);
    if (!this._charAtIsWhitespace(lineContent, leftIndex)) {
      return null;
    }
    let rightIndex = Math.min(position.column - 1, lineContentLength - 1);
    if (!this._charAtIsWhitespace(lineContent, rightIndex)) {
      return null;
    }
    while (leftIndex > 0 && this._charAtIsWhitespace(lineContent, leftIndex - 1)) {
      leftIndex--;
    }
    while (rightIndex + 1 < lineContentLength && this._charAtIsWhitespace(lineContent, rightIndex + 1)) {
      rightIndex++;
    }
    return new Range(position.lineNumber, leftIndex + 1, position.lineNumber, rightIndex + 2);
  }
  static _deleteInsideWordDetermineDeleteRange(wordSeparators, model, position, onlyWord) {
    const lineContent = model.getLineContent(position.lineNumber);
    const lineLength = lineContent.length;
    if (lineLength === 0) {
      if (position.lineNumber > 1) {
        return new Range(position.lineNumber - 1, model.getLineMaxColumn(position.lineNumber - 1), position.lineNumber, 1);
      } else {
        if (position.lineNumber < model.getLineCount()) {
          return new Range(position.lineNumber, 1, position.lineNumber + 1, 1);
        } else {
          return new Range(position.lineNumber, 1, position.lineNumber, 1);
        }
      }
    }
    const touchesWord = (word) => {
      return word.start + 1 <= position.column && position.column <= word.end + 1;
    };
    const createRangeWithPosition = (startColumn, endColumn) => {
      startColumn = Math.min(startColumn, position.column);
      endColumn = Math.max(endColumn, position.column);
      return new Range(position.lineNumber, startColumn, position.lineNumber, endColumn);
    };
    const deleteWordAndAdjacentWhitespace = (word) => {
      let startColumn = word.start + 1;
      let endColumn = word.end + 1;
      if (onlyWord) {
        return createRangeWithPosition(startColumn, endColumn);
      }
      let expandedToTheRight = false;
      while (endColumn - 1 < lineLength && this._charAtIsWhitespace(lineContent, endColumn - 1)) {
        expandedToTheRight = true;
        endColumn++;
      }
      if (!expandedToTheRight) {
        while (startColumn > 1 && this._charAtIsWhitespace(lineContent, startColumn - 2)) {
          startColumn--;
        }
      }
      return createRangeWithPosition(startColumn, endColumn);
    };
    const prevWordOnLine = WordOperations._findPreviousWordOnLine(wordSeparators, model, position);
    if (prevWordOnLine && touchesWord(prevWordOnLine)) {
      return deleteWordAndAdjacentWhitespace(prevWordOnLine);
    }
    const nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, position);
    if (nextWordOnLine && touchesWord(nextWordOnLine)) {
      return deleteWordAndAdjacentWhitespace(nextWordOnLine);
    }
    if (prevWordOnLine && nextWordOnLine) {
      return createRangeWithPosition(prevWordOnLine.end + 1, nextWordOnLine.start + 1);
    }
    if (prevWordOnLine) {
      return createRangeWithPosition(prevWordOnLine.start + 1, prevWordOnLine.end + 1);
    }
    if (nextWordOnLine) {
      return createRangeWithPosition(nextWordOnLine.start + 1, nextWordOnLine.end + 1);
    }
    return createRangeWithPosition(1, lineLength + 1);
  }
  static _deleteWordPartLeft(model, selection) {
    if (!selection.isEmpty()) {
      return selection;
    }
    const pos = selection.getPosition();
    const toPosition = WordOperations._moveWordPartLeft(model, pos);
    return new Range(pos.lineNumber, pos.column, toPosition.lineNumber, toPosition.column);
  }
  static _findFirstNonWhitespaceChar(str, startIndex) {
    const len = str.length;
    for (let chIndex = startIndex; chIndex < len; chIndex++) {
      const ch = str.charAt(chIndex);
      if (ch !== " " && ch !== "	") {
        return chIndex;
      }
    }
    return len;
  }
  static _deleteWordRightWhitespace(model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    const startIndex = position.column - 1;
    const firstNonWhitespace = this._findFirstNonWhitespaceChar(lineContent, startIndex);
    if (startIndex < firstNonWhitespace) {
      return new Range(position.lineNumber, position.column, position.lineNumber, firstNonWhitespace + 1);
    }
    return null;
  }
  static deleteWordRight(ctx, wordNavigationType) {
    const wordSeparators = ctx.wordSeparators;
    const model = ctx.model;
    const selection = ctx.selection;
    const whitespaceHeuristics = ctx.whitespaceHeuristics;
    if (!selection.isEmpty()) {
      return selection;
    }
    const position = new Position(selection.positionLineNumber, selection.positionColumn);
    let lineNumber = position.lineNumber;
    let column = position.column;
    const lineCount = model.getLineCount();
    const maxColumn = model.getLineMaxColumn(lineNumber);
    if (lineNumber === lineCount && column === maxColumn) {
      return null;
    }
    if (whitespaceHeuristics) {
      const r = this._deleteWordRightWhitespace(model, position);
      if (r) {
        return r;
      }
    }
    let nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, position);
    if (wordNavigationType === 2 /* WordEnd */) {
      if (nextWordOnLine) {
        column = nextWordOnLine.end + 1;
      } else {
        if (column < maxColumn || lineNumber === lineCount) {
          column = maxColumn;
        } else {
          lineNumber++;
          nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, 1));
          if (nextWordOnLine) {
            column = nextWordOnLine.start + 1;
          } else {
            column = model.getLineMaxColumn(lineNumber);
          }
        }
      }
    } else {
      if (nextWordOnLine && column >= nextWordOnLine.start + 1) {
        nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, nextWordOnLine.end + 1));
      }
      if (nextWordOnLine) {
        column = nextWordOnLine.start + 1;
      } else {
        if (column < maxColumn || lineNumber === lineCount) {
          column = maxColumn;
        } else {
          lineNumber++;
          nextWordOnLine = WordOperations._findNextWordOnLine(wordSeparators, model, new Position(lineNumber, 1));
          if (nextWordOnLine) {
            column = nextWordOnLine.start + 1;
          } else {
            column = model.getLineMaxColumn(lineNumber);
          }
        }
      }
    }
    return new Range(lineNumber, column, position.lineNumber, position.column);
  }
  static _deleteWordPartRight(model, selection) {
    if (!selection.isEmpty()) {
      return selection;
    }
    const pos = selection.getPosition();
    const toPosition = WordOperations._moveWordPartRight(model, pos);
    return new Range(pos.lineNumber, pos.column, toPosition.lineNumber, toPosition.column);
  }
  static _createWordAtPosition(model, lineNumber, word) {
    const range = new Range(lineNumber, word.start + 1, lineNumber, word.end + 1);
    return {
      word: model.getValueInRange(range),
      startColumn: range.startColumn,
      endColumn: range.endColumn
    };
  }
  static getWordAtPosition(model, _wordSeparators, _intlSegmenterLocales, position) {
    const wordSeparators = getMapForWordSeparators(_wordSeparators, _intlSegmenterLocales);
    const prevWord = WordOperations._findPreviousWordOnLine(wordSeparators, model, position);
    if (prevWord && prevWord.wordType === 1 /* Regular */ && prevWord.start <= position.column - 1 && position.column - 1 <= prevWord.end) {
      return WordOperations._createWordAtPosition(model, position.lineNumber, prevWord);
    }
    const nextWord = WordOperations._findNextWordOnLine(wordSeparators, model, position);
    if (nextWord && nextWord.wordType === 1 /* Regular */ && nextWord.start <= position.column - 1 && position.column - 1 <= nextWord.end) {
      return WordOperations._createWordAtPosition(model, position.lineNumber, nextWord);
    }
    return null;
  }
  static word(config, model, cursor, inSelectionMode, position) {
    const wordSeparators = getMapForWordSeparators(config.wordSeparators, config.wordSegmenterLocales);
    const prevWord = WordOperations._findPreviousWordOnLine(wordSeparators, model, position);
    const nextWord = WordOperations._findNextWordOnLine(wordSeparators, model, position);
    if (!inSelectionMode) {
      let startColumn2;
      let endColumn2;
      if (prevWord && prevWord.wordType === 1 /* Regular */ && prevWord.start <= position.column - 1 && position.column - 1 <= prevWord.end) {
        startColumn2 = prevWord.start + 1;
        endColumn2 = prevWord.end + 1;
      } else if (prevWord && prevWord.wordType === 2 /* Separator */ && prevWord.start <= position.column - 1 && position.column - 1 < prevWord.end) {
        startColumn2 = prevWord.start + 1;
        endColumn2 = prevWord.end + 1;
      } else if (nextWord && nextWord.wordType === 1 /* Regular */ && nextWord.start <= position.column - 1 && position.column - 1 <= nextWord.end) {
        startColumn2 = nextWord.start + 1;
        endColumn2 = nextWord.end + 1;
      } else if (nextWord && nextWord.wordType === 2 /* Separator */ && nextWord.start <= position.column - 1 && position.column - 1 < nextWord.end) {
        startColumn2 = nextWord.start + 1;
        endColumn2 = nextWord.end + 1;
      } else {
        if (prevWord) {
          startColumn2 = prevWord.end + 1;
        } else {
          startColumn2 = 1;
        }
        if (nextWord) {
          endColumn2 = nextWord.start + 1;
        } else {
          endColumn2 = model.getLineMaxColumn(position.lineNumber);
        }
      }
      return new SingleCursorState(
        new Range(position.lineNumber, startColumn2, position.lineNumber, endColumn2),
        SelectionStartKind.Word,
        0,
        new Position(position.lineNumber, endColumn2),
        0
      );
    }
    let startColumn;
    let endColumn;
    if (prevWord && prevWord.wordType === 1 /* Regular */ && prevWord.start < position.column - 1 && position.column - 1 < prevWord.end) {
      startColumn = prevWord.start + 1;
      endColumn = prevWord.end + 1;
    } else if (nextWord && nextWord.wordType === 1 /* Regular */ && nextWord.start < position.column - 1 && position.column - 1 < nextWord.end) {
      startColumn = nextWord.start + 1;
      endColumn = nextWord.end + 1;
    } else {
      startColumn = position.column;
      endColumn = position.column;
    }
    const lineNumber = position.lineNumber;
    let column;
    if (cursor.selectionStart.containsPosition(position)) {
      column = cursor.selectionStart.endColumn;
    } else if (position.isBeforeOrEqual(cursor.selectionStart.getStartPosition())) {
      column = startColumn;
      const possiblePosition = new Position(lineNumber, column);
      if (cursor.selectionStart.containsPosition(possiblePosition)) {
        column = cursor.selectionStart.endColumn;
      }
    } else {
      column = endColumn;
      const possiblePosition = new Position(lineNumber, column);
      if (cursor.selectionStart.containsPosition(possiblePosition)) {
        column = cursor.selectionStart.startColumn;
      }
    }
    return cursor.move(true, lineNumber, column, 0);
  }
}
class WordPartOperations extends WordOperations {
  static deleteWordPartLeft(ctx) {
    const candidates = enforceDefined([
      WordOperations.deleteWordLeft(ctx, 0 /* WordStart */),
      WordOperations.deleteWordLeft(ctx, 2 /* WordEnd */),
      WordOperations._deleteWordPartLeft(ctx.model, ctx.selection)
    ]);
    candidates.sort(Range.compareRangesUsingEnds);
    return candidates[2];
  }
  static deleteWordPartRight(ctx) {
    const candidates = enforceDefined([
      WordOperations.deleteWordRight(ctx, 0 /* WordStart */),
      WordOperations.deleteWordRight(ctx, 2 /* WordEnd */),
      WordOperations._deleteWordPartRight(ctx.model, ctx.selection)
    ]);
    candidates.sort(Range.compareRangesUsingStarts);
    return candidates[0];
  }
  static moveWordPartLeft(wordSeparators, model, position, hasMulticursor) {
    const candidates = enforceDefined([
      WordOperations.moveWordLeft(wordSeparators, model, position, 0 /* WordStart */, hasMulticursor),
      WordOperations.moveWordLeft(wordSeparators, model, position, 2 /* WordEnd */, hasMulticursor),
      WordOperations._moveWordPartLeft(model, position)
    ]);
    candidates.sort(Position.compare);
    return candidates[2];
  }
  static moveWordPartRight(wordSeparators, model, position) {
    const candidates = enforceDefined([
      WordOperations.moveWordRight(wordSeparators, model, position, 0 /* WordStart */),
      WordOperations.moveWordRight(wordSeparators, model, position, 2 /* WordEnd */),
      WordOperations._moveWordPartRight(model, position)
    ]);
    candidates.sort(Position.compare);
    return candidates[0];
  }
}
function enforceDefined(arr) {
  return arr.filter((el) => Boolean(el));
}
export {
  WordNavigationType,
  WordOperations,
  WordPartOperations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY3Vyc29yXFxjdXJzb3JXb3JkT3BlcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IEVkaXRvckF1dG9DbG9zaW5nRWRpdFN0cmF0ZWd5LCBFZGl0b3JBdXRvQ2xvc2luZ1N0cmF0ZWd5IH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29uZmlndXJhdGlvbiwgSUN1cnNvclNpbXBsZU1vZGVsLCBTZWxlY3Rpb25TdGFydEtpbmQsIFNpbmdsZUN1cnNvclN0YXRlIH0gZnJvbSAnLi4vY3Vyc29yQ29tbW9uLmpzJztcbmltcG9ydCB7IERlbGV0ZU9wZXJhdGlvbnMgfSBmcm9tICcuL2N1cnNvckRlbGV0ZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgV29yZENoYXJhY3RlckNsYXNzLCBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgSW50bFdvcmRTZWdtZW50RGF0YSwgZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMgfSBmcm9tICcuLi9jb3JlL3dvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IElXb3JkQXRQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBBdXRvQ2xvc2luZ1BhaXJzIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5cbmludGVyZmFjZSBJRmluZFdvcmRSZXN1bHQge1xuXHQvKipcblx0ICogVGhlIGluZGV4IHdoZXJlIHRoZSB3b3JkIHN0YXJ0cy5cblx0ICovXG5cdHN0YXJ0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgaW5kZXggd2hlcmUgdGhlIHdvcmQgZW5kcy5cblx0ICovXG5cdGVuZDogbnVtYmVyO1xuXHQvKipcblx0ICogVGhlIHdvcmQgdHlwZS5cblx0ICovXG5cdHdvcmRUeXBlOiBXb3JkVHlwZTtcblx0LyoqXG5cdCAqIFRoZSByZWFzb24gdGhlIHdvcmQgZW5kZWQuXG5cdCAqL1xuXHRuZXh0Q2hhckNsYXNzOiBXb3JkQ2hhcmFjdGVyQ2xhc3M7XG59XG5cbmNvbnN0IGVudW0gV29yZFR5cGUge1xuXHROb25lID0gMCxcblx0UmVndWxhciA9IDEsXG5cdFNlcGFyYXRvciA9IDJcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gV29yZE5hdmlnYXRpb25UeXBlIHtcblx0V29yZFN0YXJ0ID0gMCxcblx0V29yZFN0YXJ0RmFzdCA9IDEsXG5cdFdvcmRFbmQgPSAyLFxuXHRXb3JkQWNjZXNzaWJpbGl0eSA9IDMgLy8gUmVzcGVjdCBjaHJvbWUgZGVmaW5pdGlvbiBvZiBhIHdvcmRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEZWxldGVXb3JkQ29udGV4dCB7XG5cdHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllcjtcblx0bW9kZWw6IElUZXh0TW9kZWw7XG5cdHNlbGVjdGlvbjogU2VsZWN0aW9uO1xuXHR3aGl0ZXNwYWNlSGV1cmlzdGljczogYm9vbGVhbjtcblx0YXV0b0Nsb3NpbmdEZWxldGU6IEVkaXRvckF1dG9DbG9zaW5nRWRpdFN0cmF0ZWd5O1xuXHRhdXRvQ2xvc2luZ0JyYWNrZXRzOiBFZGl0b3JBdXRvQ2xvc2luZ1N0cmF0ZWd5O1xuXHRhdXRvQ2xvc2luZ1F1b3RlczogRWRpdG9yQXV0b0Nsb3NpbmdTdHJhdGVneTtcblx0YXV0b0Nsb3NpbmdQYWlyczogQXV0b0Nsb3NpbmdQYWlycztcblx0YXV0b0Nsb3NlZENoYXJhY3RlcnM6IFJhbmdlW107XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JkT3BlcmF0aW9ucyB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NyZWF0ZVdvcmQobGluZUNvbnRlbnQ6IHN0cmluZywgd29yZFR5cGU6IFdvcmRUeXBlLCBuZXh0Q2hhckNsYXNzOiBXb3JkQ2hhcmFjdGVyQ2xhc3MsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogSUZpbmRXb3JkUmVzdWx0IHtcblx0XHQvLyBjb25zb2xlLmxvZygnV09SRCA9PT4gJyArIHN0YXJ0ICsgJyA9PiAnICsgZW5kICsgJzo6OjogPDw8JyArIGxpbmVDb250ZW50LnN1YnN0cmluZyhzdGFydCwgZW5kKSArICc+Pj4nKTtcblx0XHRyZXR1cm4geyBzdGFydDogc3RhcnQsIGVuZDogZW5kLCB3b3JkVHlwZTogd29yZFR5cGUsIG5leHRDaGFyQ2xhc3M6IG5leHRDaGFyQ2xhc3MgfTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jcmVhdGVJbnRsV29yZChpbnRsV29yZDogSW50bFdvcmRTZWdtZW50RGF0YSwgbmV4dENoYXJDbGFzczogV29yZENoYXJhY3RlckNsYXNzKTogSUZpbmRXb3JkUmVzdWx0IHtcblx0XHQvLyBjb25zb2xlLmxvZygnSU5UTCBXT1JEID09PiAnICsgaW50bFdvcmQuaW5kZXggKyAnID0+ICcgKyBpbnRsV29yZC5pbmRleCArIGludGxXb3JkLnNlZ21lbnQubGVuZ3RoICsgJzo6OjogPDw8JyArIGludGxXb3JkLnNlZ21lbnQgKyAnPj4+Jyk7XG5cdFx0cmV0dXJuIHsgc3RhcnQ6IGludGxXb3JkLmluZGV4LCBlbmQ6IGludGxXb3JkLmluZGV4ICsgaW50bFdvcmQuc2VnbWVudC5sZW5ndGgsIHdvcmRUeXBlOiBXb3JkVHlwZS5SZWd1bGFyLCBuZXh0Q2hhckNsYXNzOiBuZXh0Q2hhckNsYXNzIH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmluZFByZXZpb3VzV29yZE9uTGluZSh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IElGaW5kV29yZFJlc3VsdCB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHRoaXMuX2RvRmluZFByZXZpb3VzV29yZE9uTGluZShsaW5lQ29udGVudCwgd29yZFNlcGFyYXRvcnMsIHBvc2l0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9kb0ZpbmRQcmV2aW91c1dvcmRPbkxpbmUobGluZUNvbnRlbnQ6IHN0cmluZywgd29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBwb3NpdGlvbjogUG9zaXRpb24pOiBJRmluZFdvcmRSZXN1bHQgfCBudWxsIHtcblx0XHRsZXQgd29yZFR5cGUgPSBXb3JkVHlwZS5Ob25lO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNJbnRsV29yZCA9IHdvcmRTZXBhcmF0b3JzLmZpbmRQcmV2SW50bFdvcmRCZWZvcmVPckF0T2Zmc2V0KGxpbmVDb250ZW50LCBwb3NpdGlvbi5jb2x1bW4gLSAyKTtcblxuXHRcdGZvciAobGV0IGNoSW5kZXggPSBwb3NpdGlvbi5jb2x1bW4gLSAyOyBjaEluZGV4ID49IDA7IGNoSW5kZXgtLSkge1xuXHRcdFx0Y29uc3QgY2hDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjaEluZGV4KTtcblx0XHRcdGNvbnN0IGNoQ2xhc3MgPSB3b3JkU2VwYXJhdG9ycy5nZXQoY2hDb2RlKTtcblxuXHRcdFx0aWYgKHByZXZpb3VzSW50bFdvcmQgJiYgY2hJbmRleCA9PT0gcHJldmlvdXNJbnRsV29yZC5pbmRleCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlSW50bFdvcmQocHJldmlvdXNJbnRsV29yZCwgY2hDbGFzcyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuUmVndWxhcikge1xuXHRcdFx0XHRpZiAod29yZFR5cGUgPT09IFdvcmRUeXBlLlNlcGFyYXRvcikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVXb3JkKGxpbmVDb250ZW50LCB3b3JkVHlwZSwgY2hDbGFzcywgY2hJbmRleCArIDEsIHRoaXMuX2ZpbmRFbmRPZldvcmQobGluZUNvbnRlbnQsIHdvcmRTZXBhcmF0b3JzLCB3b3JkVHlwZSwgY2hJbmRleCArIDEpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR3b3JkVHlwZSA9IFdvcmRUeXBlLlJlZ3VsYXI7XG5cdFx0XHR9IGVsc2UgaWYgKGNoQ2xhc3MgPT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5Xb3JkU2VwYXJhdG9yKSB7XG5cdFx0XHRcdGlmICh3b3JkVHlwZSA9PT0gV29yZFR5cGUuUmVndWxhcikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVXb3JkKGxpbmVDb250ZW50LCB3b3JkVHlwZSwgY2hDbGFzcywgY2hJbmRleCArIDEsIHRoaXMuX2ZpbmRFbmRPZldvcmQobGluZUNvbnRlbnQsIHdvcmRTZXBhcmF0b3JzLCB3b3JkVHlwZSwgY2hJbmRleCArIDEpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR3b3JkVHlwZSA9IFdvcmRUeXBlLlNlcGFyYXRvcjtcblx0XHRcdH0gZWxzZSBpZiAoY2hDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLldoaXRlc3BhY2UpIHtcblx0XHRcdFx0aWYgKHdvcmRUeXBlICE9PSBXb3JkVHlwZS5Ob25lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVdvcmQobGluZUNvbnRlbnQsIHdvcmRUeXBlLCBjaENsYXNzLCBjaEluZGV4ICsgMSwgdGhpcy5fZmluZEVuZE9mV29yZChsaW5lQ29udGVudCwgd29yZFNlcGFyYXRvcnMsIHdvcmRUeXBlLCBjaEluZGV4ICsgMSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmRUeXBlICE9PSBXb3JkVHlwZS5Ob25lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlV29yZChsaW5lQ29udGVudCwgd29yZFR5cGUsIFdvcmRDaGFyYWN0ZXJDbGFzcy5XaGl0ZXNwYWNlLCAwLCB0aGlzLl9maW5kRW5kT2ZXb3JkKGxpbmVDb250ZW50LCB3b3JkU2VwYXJhdG9ycywgd29yZFR5cGUsIDApKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maW5kRW5kT2ZXb3JkKGxpbmVDb250ZW50OiBzdHJpbmcsIHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgd29yZFR5cGU6IFdvcmRUeXBlLCBzdGFydEluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXG5cdFx0Y29uc3QgbmV4dEludGxXb3JkID0gd29yZFNlcGFyYXRvcnMuZmluZE5leHRJbnRsV29yZEF0T3JBZnRlck9mZnNldChsaW5lQ29udGVudCwgc3RhcnRJbmRleCk7XG5cblx0XHRjb25zdCBsZW4gPSBsaW5lQ29udGVudC5sZW5ndGg7XG5cdFx0Zm9yIChsZXQgY2hJbmRleCA9IHN0YXJ0SW5kZXg7IGNoSW5kZXggPCBsZW47IGNoSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgY2hDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjaEluZGV4KTtcblx0XHRcdGNvbnN0IGNoQ2xhc3MgPSB3b3JkU2VwYXJhdG9ycy5nZXQoY2hDb2RlKTtcblxuXHRcdFx0aWYgKG5leHRJbnRsV29yZCAmJiBjaEluZGV4ID09PSBuZXh0SW50bFdvcmQuaW5kZXggKyBuZXh0SW50bFdvcmQuc2VnbWVudC5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGNoSW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuV2hpdGVzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4gY2hJbmRleDtcblx0XHRcdH1cblx0XHRcdGlmICh3b3JkVHlwZSA9PT0gV29yZFR5cGUuUmVndWxhciAmJiBjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuV29yZFNlcGFyYXRvcikge1xuXHRcdFx0XHRyZXR1cm4gY2hJbmRleDtcblx0XHRcdH1cblx0XHRcdGlmICh3b3JkVHlwZSA9PT0gV29yZFR5cGUuU2VwYXJhdG9yICYmIGNoQ2xhc3MgPT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5SZWd1bGFyKSB7XG5cdFx0XHRcdHJldHVybiBjaEluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGVuO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpbmROZXh0V29yZE9uTGluZSh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IElGaW5kV29yZFJlc3VsdCB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHRoaXMuX2RvRmluZE5leHRXb3JkT25MaW5lKGxpbmVDb250ZW50LCB3b3JkU2VwYXJhdG9ycywgcG9zaXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RvRmluZE5leHRXb3JkT25MaW5lKGxpbmVDb250ZW50OiBzdHJpbmcsIHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgcG9zaXRpb246IFBvc2l0aW9uKTogSUZpbmRXb3JkUmVzdWx0IHwgbnVsbCB7XG5cdFx0bGV0IHdvcmRUeXBlID0gV29yZFR5cGUuTm9uZTtcblx0XHRjb25zdCBsZW4gPSBsaW5lQ29udGVudC5sZW5ndGg7XG5cblx0XHRjb25zdCBuZXh0SW50bFdvcmQgPSB3b3JkU2VwYXJhdG9ycy5maW5kTmV4dEludGxXb3JkQXRPckFmdGVyT2Zmc2V0KGxpbmVDb250ZW50LCBwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblxuXHRcdGZvciAobGV0IGNoSW5kZXggPSBwb3NpdGlvbi5jb2x1bW4gLSAxOyBjaEluZGV4IDwgbGVuOyBjaEluZGV4KyspIHtcblx0XHRcdGNvbnN0IGNoQ29kZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY2hJbmRleCk7XG5cdFx0XHRjb25zdCBjaENsYXNzID0gd29yZFNlcGFyYXRvcnMuZ2V0KGNoQ29kZSk7XG5cblx0XHRcdGlmIChuZXh0SW50bFdvcmQgJiYgY2hJbmRleCA9PT0gbmV4dEludGxXb3JkLmluZGV4KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVJbnRsV29yZChuZXh0SW50bFdvcmQsIGNoQ2xhc3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXIpIHtcblx0XHRcdFx0aWYgKHdvcmRUeXBlID09PSBXb3JkVHlwZS5TZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlV29yZChsaW5lQ29udGVudCwgd29yZFR5cGUsIGNoQ2xhc3MsIHRoaXMuX2ZpbmRTdGFydE9mV29yZChsaW5lQ29udGVudCwgd29yZFNlcGFyYXRvcnMsIHdvcmRUeXBlLCBjaEluZGV4IC0gMSksIGNoSW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdvcmRUeXBlID0gV29yZFR5cGUuUmVndWxhcjtcblx0XHRcdH0gZWxzZSBpZiAoY2hDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLldvcmRTZXBhcmF0b3IpIHtcblx0XHRcdFx0aWYgKHdvcmRUeXBlID09PSBXb3JkVHlwZS5SZWd1bGFyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVdvcmQobGluZUNvbnRlbnQsIHdvcmRUeXBlLCBjaENsYXNzLCB0aGlzLl9maW5kU3RhcnRPZldvcmQobGluZUNvbnRlbnQsIHdvcmRTZXBhcmF0b3JzLCB3b3JkVHlwZSwgY2hJbmRleCAtIDEpLCBjaEluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR3b3JkVHlwZSA9IFdvcmRUeXBlLlNlcGFyYXRvcjtcblx0XHRcdH0gZWxzZSBpZiAoY2hDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLldoaXRlc3BhY2UpIHtcblx0XHRcdFx0aWYgKHdvcmRUeXBlICE9PSBXb3JkVHlwZS5Ob25lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVdvcmQobGluZUNvbnRlbnQsIHdvcmRUeXBlLCBjaENsYXNzLCB0aGlzLl9maW5kU3RhcnRPZldvcmQobGluZUNvbnRlbnQsIHdvcmRTZXBhcmF0b3JzLCB3b3JkVHlwZSwgY2hJbmRleCAtIDEpLCBjaEluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh3b3JkVHlwZSAhPT0gV29yZFR5cGUuTm9uZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVdvcmQobGluZUNvbnRlbnQsIHdvcmRUeXBlLCBXb3JkQ2hhcmFjdGVyQ2xhc3MuV2hpdGVzcGFjZSwgdGhpcy5fZmluZFN0YXJ0T2ZXb3JkKGxpbmVDb250ZW50LCB3b3JkU2VwYXJhdG9ycywgd29yZFR5cGUsIGxlbiAtIDEpLCBsZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpbmRTdGFydE9mV29yZChsaW5lQ29udGVudDogc3RyaW5nLCB3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIHdvcmRUeXBlOiBXb3JkVHlwZSwgc3RhcnRJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblxuXHRcdGNvbnN0IHByZXZpb3VzSW50bFdvcmQgPSB3b3JkU2VwYXJhdG9ycy5maW5kUHJldkludGxXb3JkQmVmb3JlT3JBdE9mZnNldChsaW5lQ29udGVudCwgc3RhcnRJbmRleCk7XG5cblx0XHRmb3IgKGxldCBjaEluZGV4ID0gc3RhcnRJbmRleDsgY2hJbmRleCA+PSAwOyBjaEluZGV4LS0pIHtcblx0XHRcdGNvbnN0IGNoQ29kZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY2hJbmRleCk7XG5cdFx0XHRjb25zdCBjaENsYXNzID0gd29yZFNlcGFyYXRvcnMuZ2V0KGNoQ29kZSk7XG5cblx0XHRcdGlmIChwcmV2aW91c0ludGxXb3JkICYmIGNoSW5kZXggPT09IHByZXZpb3VzSW50bFdvcmQuaW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuIGNoSW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaENsYXNzID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuV2hpdGVzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4gY2hJbmRleCArIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAod29yZFR5cGUgPT09IFdvcmRUeXBlLlJlZ3VsYXIgJiYgY2hDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLldvcmRTZXBhcmF0b3IpIHtcblx0XHRcdFx0cmV0dXJuIGNoSW5kZXggKyAxO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdvcmRUeXBlID09PSBXb3JkVHlwZS5TZXBhcmF0b3IgJiYgY2hDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXIpIHtcblx0XHRcdFx0cmV0dXJuIGNoSW5kZXggKyAxO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbW92ZVdvcmRMZWZ0KHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3I6IGJvb2xlYW4pOiBQb3NpdGlvbiB7XG5cdFx0bGV0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGxldCBjb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cblx0XHRpZiAoY29sdW1uID09PSAxKSB7XG5cdFx0XHRpZiAobGluZU51bWJlciA+IDEpIHtcblx0XHRcdFx0bGluZU51bWJlciA9IGxpbmVOdW1iZXIgLSAxO1xuXHRcdFx0XHRjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBwcmV2V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kUHJldmlvdXNXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbikpO1xuXG5cdFx0aWYgKHdvcmROYXZpZ2F0aW9uVHlwZSA9PT0gV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCkge1xuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBwcmV2V29yZE9uTGluZSA/IHByZXZXb3JkT25MaW5lLnN0YXJ0ICsgMSA6IDEpO1xuXHRcdH1cblxuXHRcdGlmICh3b3JkTmF2aWdhdGlvblR5cGUgPT09IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnRGYXN0KSB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdCFoYXNNdWx0aWN1cnNvciAvLyBhdm9pZCBoYXZpbmcgbXVsdGlwbGUgY3Vyc29ycyBzdG9wIGF0IGRpZmZlcmVudCBsb2NhdGlvbnMgd2hlbiBkb2luZyB3b3JkIHN0YXJ0XG5cdFx0XHRcdCYmIHByZXZXb3JkT25MaW5lXG5cdFx0XHRcdCYmIHByZXZXb3JkT25MaW5lLndvcmRUeXBlID09PSBXb3JkVHlwZS5TZXBhcmF0b3Jcblx0XHRcdFx0JiYgcHJldldvcmRPbkxpbmUuZW5kIC0gcHJldldvcmRPbkxpbmUuc3RhcnQgPT09IDFcblx0XHRcdFx0JiYgcHJldldvcmRPbkxpbmUubmV4dENoYXJDbGFzcyA9PT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXJcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBTa2lwIG92ZXIgYSB3b3JkIG1hZGUgdXAgb2Ygb25lIHNpbmdsZSBzZXBhcmF0b3IgYW5kIGZvbGxvd2VkIGJ5IGEgcmVndWxhciBjaGFyYWN0ZXJcblx0XHRcdFx0cHJldldvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZFByZXZpb3VzV29yZE9uTGluZSh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBwcmV2V29yZE9uTGluZS5zdGFydCArIDEpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBwcmV2V29yZE9uTGluZSA/IHByZXZXb3JkT25MaW5lLnN0YXJ0ICsgMSA6IDEpO1xuXHRcdH1cblxuXHRcdGlmICh3b3JkTmF2aWdhdGlvblR5cGUgPT09IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkQWNjZXNzaWJpbGl0eSkge1xuXHRcdFx0d2hpbGUgKFxuXHRcdFx0XHRwcmV2V29yZE9uTGluZVxuXHRcdFx0XHQmJiBwcmV2V29yZE9uTGluZS53b3JkVHlwZSA9PT0gV29yZFR5cGUuU2VwYXJhdG9yXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gU2tpcCBvdmVyIHdvcmRzIG1hZGUgdXAgb2Ygb25seSBzZXBhcmF0b3JzXG5cdFx0XHRcdHByZXZXb3JkT25MaW5lID0gV29yZE9wZXJhdGlvbnMuX2ZpbmRQcmV2aW91c1dvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgcHJldldvcmRPbkxpbmUuc3RhcnQgKyAxKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgcHJldldvcmRPbkxpbmUgPyBwcmV2V29yZE9uTGluZS5zdGFydCArIDEgOiAxKTtcblx0XHR9XG5cblx0XHQvLyBXZSBhcmUgc3RvcHBpbmcgYXQgdGhlIGVuZGluZyBvZiB3b3Jkc1xuXG5cdFx0aWYgKHByZXZXb3JkT25MaW5lICYmIGNvbHVtbiA8PSBwcmV2V29yZE9uTGluZS5lbmQgKyAxKSB7XG5cdFx0XHRwcmV2V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kUHJldmlvdXNXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIHByZXZXb3JkT25MaW5lLnN0YXJ0ICsgMSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgcHJldldvcmRPbkxpbmUgPyBwcmV2V29yZE9uTGluZS5lbmQgKyAxIDogMSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIF9tb3ZlV29yZFBhcnRMZWZ0KG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRjb25zdCBtYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXG5cdFx0aWYgKHBvc2l0aW9uLmNvbHVtbiA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIChsaW5lTnVtYmVyID4gMSA/IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyIC0gMSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyIC0gMSkpIDogcG9zaXRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0Zm9yIChsZXQgY29sdW1uID0gcG9zaXRpb24uY29sdW1uIC0gMTsgY29sdW1uID4gMTsgY29sdW1uLS0pIHtcblx0XHRcdGNvbnN0IGxlZnQgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNvbHVtbiAtIDIpO1xuXHRcdFx0Y29uc3QgcmlnaHQgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNvbHVtbiAtIDEpO1xuXG5cdFx0XHRpZiAobGVmdCA9PT0gQ2hhckNvZGUuVW5kZXJsaW5lICYmIHJpZ2h0ICE9PSBDaGFyQ29kZS5VbmRlcmxpbmUpIHtcblx0XHRcdFx0Ly8gc25ha2VfY2FzZV92YXJpYWJsZXNcblx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobGVmdCA9PT0gQ2hhckNvZGUuRGFzaCAmJiByaWdodCAhPT0gQ2hhckNvZGUuRGFzaCkge1xuXHRcdFx0XHQvLyBrZWJhYi1jYXNlLXZhcmlhYmxlc1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmICgoc3RyaW5ncy5pc0xvd2VyQXNjaWlMZXR0ZXIobGVmdCkgfHwgc3RyaW5ncy5pc0FzY2lpRGlnaXQobGVmdCkpICYmIHN0cmluZ3MuaXNVcHBlckFzY2lpTGV0dGVyKHJpZ2h0KSkge1xuXHRcdFx0XHQvLyBjYW1lbENhc2VWYXJpYWJsZXNcblx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RyaW5ncy5pc1VwcGVyQXNjaWlMZXR0ZXIobGVmdCkgJiYgc3RyaW5ncy5pc1VwcGVyQXNjaWlMZXR0ZXIocmlnaHQpKSB7XG5cdFx0XHRcdC8vIHRoaXNJc0FDYW1lbENhc2VXaXRoT25lTGV0dGVyV29yZHNcblx0XHRcdFx0aWYgKGNvbHVtbiArIDEgPCBtYXhDb2x1bW4pIHtcblx0XHRcdFx0XHRjb25zdCByaWdodFJpZ2h0ID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjb2x1bW4pO1xuXHRcdFx0XHRcdGlmIChzdHJpbmdzLmlzTG93ZXJBc2NpaUxldHRlcihyaWdodFJpZ2h0KSB8fCBzdHJpbmdzLmlzQXNjaWlEaWdpdChyaWdodFJpZ2h0KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG1vdmVXb3JkUmlnaHQod29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlKTogUG9zaXRpb24ge1xuXHRcdGxldCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRsZXQgY29sdW1uID0gcG9zaXRpb24uY29sdW1uO1xuXG5cdFx0bGV0IG1vdmVkRG93biA9IGZhbHNlO1xuXHRcdGlmIChjb2x1bW4gPT09IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpIHtcblx0XHRcdGlmIChsaW5lTnVtYmVyIDwgbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0bW92ZWREb3duID0gdHJ1ZTtcblx0XHRcdFx0bGluZU51bWJlciA9IGxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0XHRjb2x1bW4gPSAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKSk7XG5cblx0XHRpZiAod29yZE5hdmlnYXRpb25UeXBlID09PSBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCkge1xuXHRcdFx0aWYgKG5leHRXb3JkT25MaW5lICYmIG5leHRXb3JkT25MaW5lLndvcmRUeXBlID09PSBXb3JkVHlwZS5TZXBhcmF0b3IpIHtcblx0XHRcdFx0aWYgKG5leHRXb3JkT25MaW5lLmVuZCAtIG5leHRXb3JkT25MaW5lLnN0YXJ0ID09PSAxICYmIG5leHRXb3JkT25MaW5lLm5leHRDaGFyQ2xhc3MgPT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5SZWd1bGFyKSB7XG5cdFx0XHRcdFx0Ly8gU2tpcCBvdmVyIGEgd29yZCBtYWRlIHVwIG9mIG9uZSBzaW5nbGUgc2VwYXJhdG9yIGFuZCBmb2xsb3dlZCBieSBhIHJlZ3VsYXIgY2hhcmFjdGVyXG5cdFx0XHRcdFx0bmV4dFdvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIG5leHRXb3JkT25MaW5lLmVuZCArIDEpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHRXb3JkT25MaW5lKSB7XG5cdFx0XHRcdGNvbHVtbiA9IG5leHRXb3JkT25MaW5lLmVuZCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAod29yZE5hdmlnYXRpb25UeXBlID09PSBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEFjY2Vzc2liaWxpdHkpIHtcblx0XHRcdGlmIChtb3ZlZERvd24pIHtcblx0XHRcdFx0Ly8gSWYgd2UgbW92ZSB0byB0aGUgbmV4dCBsaW5lLCBwcmV0ZW5kIHRoYXQgdGhlIGN1cnNvciBpcyByaWdodCBiZWZvcmUgdGhlIGZpcnN0IGNoYXJhY3Rlci5cblx0XHRcdFx0Ly8gVGhpcyBpcyBuZWVkZWQgd2hlbiB0aGUgZmlyc3Qgd29yZCBzdGFydHMgcmlnaHQgYXQgdGhlIGZpcnN0IGNoYXJhY3RlciAtIGFuZCBpbiBvcmRlciBub3QgdG8gbWlzcyBpdCxcblx0XHRcdFx0Ly8gd2UgbmVlZCB0byBzdGFydCBiZWZvcmUuXG5cdFx0XHRcdGNvbHVtbiA9IDA7XG5cdFx0XHR9XG5cblx0XHRcdHdoaWxlIChcblx0XHRcdFx0bmV4dFdvcmRPbkxpbmVcblx0XHRcdFx0JiYgKG5leHRXb3JkT25MaW5lLndvcmRUeXBlID09PSBXb3JkVHlwZS5TZXBhcmF0b3Jcblx0XHRcdFx0XHR8fCBuZXh0V29yZE9uTGluZS5zdGFydCArIDEgPD0gY29sdW1uXG5cdFx0XHRcdClcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBTa2lwIG92ZXIgYSB3b3JkIG1hZGUgdXAgb2Ygb25lIHNpbmdsZSBzZXBhcmF0b3Jcblx0XHRcdFx0Ly8gQWxzbyBza2lwIG92ZXIgd29yZCBpZiBpdCBiZWdpbnMgYmVmb3JlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uIHRvIGFzY2VydGFpbiB3ZSdyZSBtb3ZpbmcgZm9yd2FyZCBhdCBsZWFzdCAxIGNoYXJhY3Rlci5cblx0XHRcdFx0bmV4dFdvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIG5leHRXb3JkT25MaW5lLmVuZCArIDEpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5leHRXb3JkT25MaW5lKSB7XG5cdFx0XHRcdGNvbHVtbiA9IG5leHRXb3JkT25MaW5lLnN0YXJ0ICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChuZXh0V29yZE9uTGluZSAmJiAhbW92ZWREb3duICYmIGNvbHVtbiA+PSBuZXh0V29yZE9uTGluZS5zdGFydCArIDEpIHtcblx0XHRcdFx0bmV4dFdvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIG5leHRXb3JkT25MaW5lLmVuZCArIDEpKTtcblx0XHRcdH1cblx0XHRcdGlmIChuZXh0V29yZE9uTGluZSkge1xuXHRcdFx0XHRjb2x1bW4gPSBuZXh0V29yZE9uTGluZS5zdGFydCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgX21vdmVXb3JkUGFydFJpZ2h0KG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRjb25zdCBtYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXG5cdFx0aWYgKHBvc2l0aW9uLmNvbHVtbiA9PT0gbWF4Q29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gKGxpbmVOdW1iZXIgPCBtb2RlbC5nZXRMaW5lQ291bnQoKSA/IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyICsgMSwgMSkgOiBwb3NpdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRmb3IgKGxldCBjb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW4gKyAxOyBjb2x1bW4gPCBtYXhDb2x1bW47IGNvbHVtbisrKSB7XG5cdFx0XHRjb25zdCBsZWZ0ID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjb2x1bW4gLSAyKTtcblx0XHRcdGNvbnN0IHJpZ2h0ID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjb2x1bW4gLSAxKTtcblxuXHRcdFx0aWYgKGxlZnQgIT09IENoYXJDb2RlLlVuZGVybGluZSAmJiByaWdodCA9PT0gQ2hhckNvZGUuVW5kZXJsaW5lKSB7XG5cdFx0XHRcdC8vIHNuYWtlX2Nhc2VfdmFyaWFibGVzXG5cdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGxlZnQgIT09IENoYXJDb2RlLkRhc2ggJiYgcmlnaHQgPT09IENoYXJDb2RlLkRhc2gpIHtcblx0XHRcdFx0Ly8ga2ViYWItY2FzZS12YXJpYWJsZXNcblx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoKHN0cmluZ3MuaXNMb3dlckFzY2lpTGV0dGVyKGxlZnQpIHx8IHN0cmluZ3MuaXNBc2NpaURpZ2l0KGxlZnQpKSAmJiBzdHJpbmdzLmlzVXBwZXJBc2NpaUxldHRlcihyaWdodCkpIHtcblx0XHRcdFx0Ly8gY2FtZWxDYXNlVmFyaWFibGVzXG5cdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0cmluZ3MuaXNVcHBlckFzY2lpTGV0dGVyKGxlZnQpICYmIHN0cmluZ3MuaXNVcHBlckFzY2lpTGV0dGVyKHJpZ2h0KSkge1xuXHRcdFx0XHQvLyB0aGlzSXNBQ2FtZWxDYXNlV2l0aE9uZUxldHRlcldvcmRzXG5cdFx0XHRcdGlmIChjb2x1bW4gKyAxIDwgbWF4Q29sdW1uKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmlnaHRSaWdodCA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY29sdW1uKTtcblx0XHRcdFx0XHRpZiAoc3RyaW5ncy5pc0xvd2VyQXNjaWlMZXR0ZXIocmlnaHRSaWdodCkgfHwgc3RyaW5ncy5pc0FzY2lpRGlnaXQocmlnaHRSaWdodCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIG1heENvbHVtbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgc3RhdGljIF9kZWxldGVXb3JkTGVmdFdoaXRlc3BhY2UobW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogUmFuZ2UgfCBudWxsIHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSBwb3NpdGlvbi5jb2x1bW4gLSAyO1xuXHRcdGNvbnN0IGxhc3ROb25XaGl0ZXNwYWNlID0gc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVDb250ZW50LCBzdGFydEluZGV4KTtcblx0XHRpZiAobGFzdE5vbldoaXRlc3BhY2UgKyAxIDwgc3RhcnRJbmRleCkge1xuXHRcdFx0cmV0dXJuIG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBsYXN0Tm9uV2hpdGVzcGFjZSArIDIsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZWxldGVXb3JkTGVmdChjdHg6IERlbGV0ZVdvcmRDb250ZXh0LCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3Qgd29yZFNlcGFyYXRvcnMgPSBjdHgud29yZFNlcGFyYXRvcnM7XG5cdFx0Y29uc3QgbW9kZWwgPSBjdHgubW9kZWw7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gY3R4LnNlbGVjdGlvbjtcblx0XHRjb25zdCB3aGl0ZXNwYWNlSGV1cmlzdGljcyA9IGN0eC53aGl0ZXNwYWNlSGV1cmlzdGljcztcblxuXHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHR9XG5cblx0XHRpZiAoRGVsZXRlT3BlcmF0aW9ucy5pc0F1dG9DbG9zaW5nUGFpckRlbGV0ZShjdHguYXV0b0Nsb3NpbmdEZWxldGUsIGN0eC5hdXRvQ2xvc2luZ0JyYWNrZXRzLCBjdHguYXV0b0Nsb3NpbmdRdW90ZXMsIGN0eC5hdXRvQ2xvc2luZ1BhaXJzLmF1dG9DbG9zaW5nUGFpcnNPcGVuQnlFbmQsIGN0eC5tb2RlbCwgW2N0eC5zZWxlY3Rpb25dLCBjdHguYXV0b0Nsb3NlZENoYXJhY3RlcnMpKSB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IGN0eC5zZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0XHRcdHJldHVybiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uIC0gMSwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uICsgMSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24oc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlciwgc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1uKTtcblxuXHRcdGxldCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRsZXQgY29sdW1uID0gcG9zaXRpb24uY29sdW1uO1xuXG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IDEgJiYgY29sdW1uID09PSAxKSB7XG5cdFx0XHQvLyBJZ25vcmUgZGVsZXRpbmcgYXQgYmVnaW5uaW5nIG9mIGZpbGVcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh3aGl0ZXNwYWNlSGV1cmlzdGljcykge1xuXHRcdFx0Y29uc3QgciA9IHRoaXMuX2RlbGV0ZVdvcmRMZWZ0V2hpdGVzcGFjZShtb2RlbCwgcG9zaXRpb24pO1xuXHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHByZXZXb3JkT25MaW5lID0gV29yZE9wZXJhdGlvbnMuX2ZpbmRQcmV2aW91c1dvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbik7XG5cblx0XHRpZiAod29yZE5hdmlnYXRpb25UeXBlID09PSBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0KSB7XG5cdFx0XHRpZiAocHJldldvcmRPbkxpbmUpIHtcblx0XHRcdFx0Y29sdW1uID0gcHJldldvcmRPbkxpbmUuc3RhcnQgKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGNvbHVtbiA+IDEpIHtcblx0XHRcdFx0XHRjb2x1bW4gPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXItLTtcblx0XHRcdFx0XHRjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChwcmV2V29yZE9uTGluZSAmJiBjb2x1bW4gPD0gcHJldldvcmRPbkxpbmUuZW5kICsgMSkge1xuXHRcdFx0XHRwcmV2V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kUHJldmlvdXNXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIHByZXZXb3JkT25MaW5lLnN0YXJ0ICsgMSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByZXZXb3JkT25MaW5lKSB7XG5cdFx0XHRcdGNvbHVtbiA9IHByZXZXb3JkT25MaW5lLmVuZCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY29sdW1uID4gMSkge1xuXHRcdFx0XHRcdGNvbHVtbiA9IDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGluZU51bWJlci0tO1xuXHRcdFx0XHRcdGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIGNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZGVsZXRlSW5zaWRlV29yZCh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgb25seVdvcmQ6IGJvb2xlYW4gPSBmYWxzZSk6IFJhbmdlIHtcblx0XHRpZiAoIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24oc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlciwgc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1uKTtcblxuXHRcdGNvbnN0IHIgPSB0aGlzLl9kZWxldGVJbnNpZGVXb3JkV2hpdGVzcGFjZShtb2RlbCwgcG9zaXRpb24pO1xuXHRcdGlmIChyKSB7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZGVsZXRlSW5zaWRlV29yZERldGVybWluZURlbGV0ZVJhbmdlKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgcG9zaXRpb24sIG9ubHlXb3JkKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jaGFyQXRJc1doaXRlc3BhY2Uoc3RyOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFyQ29kZSA9IHN0ci5jaGFyQ29kZUF0KGluZGV4KTtcblx0XHRyZXR1cm4gKGNoYXJDb2RlID09PSBDaGFyQ29kZS5TcGFjZSB8fCBjaGFyQ29kZSA9PT0gQ2hhckNvZGUuVGFiKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9kZWxldGVJbnNpZGVXb3JkV2hpdGVzcGFjZShtb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24pOiBSYW5nZSB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnRMZW5ndGggPSBsaW5lQ29udGVudC5sZW5ndGg7XG5cblx0XHRpZiAobGluZUNvbnRlbnRMZW5ndGggPT09IDApIHtcblx0XHRcdC8vIGVtcHR5IGxpbmVcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCBsZWZ0SW5kZXggPSBNYXRoLm1heChwb3NpdGlvbi5jb2x1bW4gLSAyLCAwKTtcblx0XHRpZiAoIXRoaXMuX2NoYXJBdElzV2hpdGVzcGFjZShsaW5lQ29udGVudCwgbGVmdEluZGV4KSkge1xuXHRcdFx0Ly8gdG91Y2hlcyBhIG5vbi13aGl0ZXNwYWNlIGNoYXJhY3RlciB0byB0aGUgbGVmdFxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0bGV0IHJpZ2h0SW5kZXggPSBNYXRoLm1pbihwb3NpdGlvbi5jb2x1bW4gLSAxLCBsaW5lQ29udGVudExlbmd0aCAtIDEpO1xuXHRcdGlmICghdGhpcy5fY2hhckF0SXNXaGl0ZXNwYWNlKGxpbmVDb250ZW50LCByaWdodEluZGV4KSkge1xuXHRcdFx0Ly8gdG91Y2hlcyBhIG5vbi13aGl0ZXNwYWNlIGNoYXJhY3RlciB0byB0aGUgcmlnaHRcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIHdhbGsgb3ZlciB3aGl0ZXNwYWNlIHRvIHRoZSBsZWZ0XG5cdFx0d2hpbGUgKGxlZnRJbmRleCA+IDAgJiYgdGhpcy5fY2hhckF0SXNXaGl0ZXNwYWNlKGxpbmVDb250ZW50LCBsZWZ0SW5kZXggLSAxKSkge1xuXHRcdFx0bGVmdEluZGV4LS07XG5cdFx0fVxuXG5cdFx0Ly8gd2FsayBvdmVyIHdoaXRlc3BhY2UgdG8gdGhlIHJpZ2h0XG5cdFx0d2hpbGUgKHJpZ2h0SW5kZXggKyAxIDwgbGluZUNvbnRlbnRMZW5ndGggJiYgdGhpcy5fY2hhckF0SXNXaGl0ZXNwYWNlKGxpbmVDb250ZW50LCByaWdodEluZGV4ICsgMSkpIHtcblx0XHRcdHJpZ2h0SW5kZXgrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIGxlZnRJbmRleCArIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHJpZ2h0SW5kZXggKyAyKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9kZWxldGVJbnNpZGVXb3JkRGV0ZXJtaW5lRGVsZXRlUmFuZ2Uod29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIG9ubHlXb3JkOiBib29sZWFuKTogUmFuZ2Uge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGluZUxlbmd0aCA9IGxpbmVDb250ZW50Lmxlbmd0aDtcblx0XHRpZiAobGluZUxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gZW1wdHkgbGluZVxuXHRcdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPiAxKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciAtIDEsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlciAtIDEpLCBwb3NpdGlvbi5saW5lTnVtYmVyLCAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChwb3NpdGlvbi5saW5lTnVtYmVyIDwgbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIgKyAxLCAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBlbXB0eSBtb2RlbFxuXHRcdFx0XHRcdHJldHVybiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgMSwgcG9zaXRpb24ubGluZU51bWJlciwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0b3VjaGVzV29yZCA9ICh3b3JkOiBJRmluZFdvcmRSZXN1bHQpID0+IHtcblx0XHRcdHJldHVybiAod29yZC5zdGFydCArIDEgPD0gcG9zaXRpb24uY29sdW1uICYmIHBvc2l0aW9uLmNvbHVtbiA8PSB3b3JkLmVuZCArIDEpO1xuXHRcdH07XG5cdFx0Y29uc3QgY3JlYXRlUmFuZ2VXaXRoUG9zaXRpb24gPSAoc3RhcnRDb2x1bW46IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIpID0+IHtcblx0XHRcdHN0YXJ0Q29sdW1uID0gTWF0aC5taW4oc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0XHRlbmRDb2x1bW4gPSBNYXRoLm1heChlbmRDb2x1bW4sIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHRcdH07XG5cdFx0Y29uc3QgZGVsZXRlV29yZEFuZEFkamFjZW50V2hpdGVzcGFjZSA9ICh3b3JkOiBJRmluZFdvcmRSZXN1bHQpID0+IHtcblx0XHRcdGxldCBzdGFydENvbHVtbiA9IHdvcmQuc3RhcnQgKyAxO1xuXHRcdFx0bGV0IGVuZENvbHVtbiA9IHdvcmQuZW5kICsgMTtcblx0XHRcdGlmIChvbmx5V29yZCkge1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlUmFuZ2VXaXRoUG9zaXRpb24oc3RhcnRDb2x1bW4sIGVuZENvbHVtbik7XG5cdFx0XHR9XG5cdFx0XHRsZXQgZXhwYW5kZWRUb1RoZVJpZ2h0ID0gZmFsc2U7XG5cdFx0XHR3aGlsZSAoZW5kQ29sdW1uIC0gMSA8IGxpbmVMZW5ndGggJiYgdGhpcy5fY2hhckF0SXNXaGl0ZXNwYWNlKGxpbmVDb250ZW50LCBlbmRDb2x1bW4gLSAxKSkge1xuXHRcdFx0XHRleHBhbmRlZFRvVGhlUmlnaHQgPSB0cnVlO1xuXHRcdFx0XHRlbmRDb2x1bW4rKztcblx0XHRcdH1cblx0XHRcdGlmICghZXhwYW5kZWRUb1RoZVJpZ2h0KSB7XG5cdFx0XHRcdHdoaWxlIChzdGFydENvbHVtbiA+IDEgJiYgdGhpcy5fY2hhckF0SXNXaGl0ZXNwYWNlKGxpbmVDb250ZW50LCBzdGFydENvbHVtbiAtIDIpKSB7XG5cdFx0XHRcdFx0c3RhcnRDb2x1bW4tLTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNyZWF0ZVJhbmdlV2l0aFBvc2l0aW9uKHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4pO1xuXHRcdH07XG5cblx0XHRjb25zdCBwcmV2V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kUHJldmlvdXNXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgcG9zaXRpb24pO1xuXHRcdGlmIChwcmV2V29yZE9uTGluZSAmJiB0b3VjaGVzV29yZChwcmV2V29yZE9uTGluZSkpIHtcblx0XHRcdHJldHVybiBkZWxldGVXb3JkQW5kQWRqYWNlbnRXaGl0ZXNwYWNlKHByZXZXb3JkT25MaW5lKTtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dFdvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgcG9zaXRpb24pO1xuXHRcdGlmIChuZXh0V29yZE9uTGluZSAmJiB0b3VjaGVzV29yZChuZXh0V29yZE9uTGluZSkpIHtcblx0XHRcdHJldHVybiBkZWxldGVXb3JkQW5kQWRqYWNlbnRXaGl0ZXNwYWNlKG5leHRXb3JkT25MaW5lKTtcblx0XHR9XG5cdFx0aWYgKHByZXZXb3JkT25MaW5lICYmIG5leHRXb3JkT25MaW5lKSB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlUmFuZ2VXaXRoUG9zaXRpb24ocHJldldvcmRPbkxpbmUuZW5kICsgMSwgbmV4dFdvcmRPbkxpbmUuc3RhcnQgKyAxKTtcblx0XHR9XG5cdFx0aWYgKHByZXZXb3JkT25MaW5lKSB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlUmFuZ2VXaXRoUG9zaXRpb24ocHJldldvcmRPbkxpbmUuc3RhcnQgKyAxLCBwcmV2V29yZE9uTGluZS5lbmQgKyAxKTtcblx0XHR9XG5cdFx0aWYgKG5leHRXb3JkT25MaW5lKSB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlUmFuZ2VXaXRoUG9zaXRpb24obmV4dFdvcmRPbkxpbmUuc3RhcnQgKyAxLCBuZXh0V29yZE9uTGluZS5lbmQgKyAxKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3JlYXRlUmFuZ2VXaXRoUG9zaXRpb24oMSwgbGluZUxlbmd0aCArIDEpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBfZGVsZXRlV29yZFBhcnRMZWZ0KG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uKTogUmFuZ2Uge1xuXHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3MgPSBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0XHRjb25zdCB0b1Bvc2l0aW9uID0gV29yZE9wZXJhdGlvbnMuX21vdmVXb3JkUGFydExlZnQobW9kZWwsIHBvcyk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbiwgdG9Qb3NpdGlvbi5saW5lTnVtYmVyLCB0b1Bvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmluZEZpcnN0Tm9uV2hpdGVzcGFjZUNoYXIoc3RyOiBzdHJpbmcsIHN0YXJ0SW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgbGVuID0gc3RyLmxlbmd0aDtcblx0XHRmb3IgKGxldCBjaEluZGV4ID0gc3RhcnRJbmRleDsgY2hJbmRleCA8IGxlbjsgY2hJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBjaCA9IHN0ci5jaGFyQXQoY2hJbmRleCk7XG5cdFx0XHRpZiAoY2ggIT09ICcgJyAmJiBjaCAhPT0gJ1xcdCcpIHtcblx0XHRcdFx0cmV0dXJuIGNoSW5kZXg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsZW47XG5cdH1cblxuXHRwcm90ZWN0ZWQgc3RhdGljIF9kZWxldGVXb3JkUmlnaHRXaGl0ZXNwYWNlKG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBzdGFydEluZGV4ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRjb25zdCBmaXJzdE5vbldoaXRlc3BhY2UgPSB0aGlzLl9maW5kRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcihsaW5lQ29udGVudCwgc3RhcnRJbmRleCk7XG5cdFx0aWYgKHN0YXJ0SW5kZXggPCBmaXJzdE5vbldoaXRlc3BhY2UpIHtcblx0XHRcdC8vIGJpbmdvXG5cdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgZmlyc3ROb25XaGl0ZXNwYWNlICsgMSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZWxldGVXb3JkUmlnaHQoY3R4OiBEZWxldGVXb3JkQ29udGV4dCwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUpOiBSYW5nZSB8IG51bGwge1xuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gY3R4LndvcmRTZXBhcmF0b3JzO1xuXHRcdGNvbnN0IG1vZGVsID0gY3R4Lm1vZGVsO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGN0eC5zZWxlY3Rpb247XG5cdFx0Y29uc3Qgd2hpdGVzcGFjZUhldXJpc3RpY3MgPSBjdHgud2hpdGVzcGFjZUhldXJpc3RpY3M7XG5cblx0XHRpZiAoIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24oc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlciwgc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1uKTtcblxuXHRcdGxldCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRsZXQgY29sdW1uID0gcG9zaXRpb24uY29sdW1uO1xuXG5cdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgbWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRpZiAobGluZU51bWJlciA9PT0gbGluZUNvdW50ICYmIGNvbHVtbiA9PT0gbWF4Q29sdW1uKSB7XG5cdFx0XHQvLyBJZ25vcmUgZGVsZXRpbmcgYXQgZW5kIG9mIGZpbGVcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh3aGl0ZXNwYWNlSGV1cmlzdGljcykge1xuXHRcdFx0Y29uc3QgciA9IHRoaXMuX2RlbGV0ZVdvcmRSaWdodFdoaXRlc3BhY2UobW9kZWwsIHBvc2l0aW9uKTtcblx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdHJldHVybiByO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBuZXh0V29yZE9uTGluZSA9IFdvcmRPcGVyYXRpb25zLl9maW5kTmV4dFdvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbik7XG5cblx0XHRpZiAod29yZE5hdmlnYXRpb25UeXBlID09PSBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCkge1xuXHRcdFx0aWYgKG5leHRXb3JkT25MaW5lKSB7XG5cdFx0XHRcdGNvbHVtbiA9IG5leHRXb3JkT25MaW5lLmVuZCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY29sdW1uIDwgbWF4Q29sdW1uIHx8IGxpbmVOdW1iZXIgPT09IGxpbmVDb3VudCkge1xuXHRcdFx0XHRcdGNvbHVtbiA9IG1heENvbHVtbjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsaW5lTnVtYmVyKys7XG5cdFx0XHRcdFx0bmV4dFdvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpKTtcblx0XHRcdFx0XHRpZiAobmV4dFdvcmRPbkxpbmUpIHtcblx0XHRcdFx0XHRcdGNvbHVtbiA9IG5leHRXb3JkT25MaW5lLnN0YXJ0ICsgMTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKG5leHRXb3JkT25MaW5lICYmIGNvbHVtbiA+PSBuZXh0V29yZE9uTGluZS5zdGFydCArIDEpIHtcblx0XHRcdFx0bmV4dFdvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIG5leHRXb3JkT25MaW5lLmVuZCArIDEpKTtcblx0XHRcdH1cblx0XHRcdGlmIChuZXh0V29yZE9uTGluZSkge1xuXHRcdFx0XHRjb2x1bW4gPSBuZXh0V29yZE9uTGluZS5zdGFydCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY29sdW1uIDwgbWF4Q29sdW1uIHx8IGxpbmVOdW1iZXIgPT09IGxpbmVDb3VudCkge1xuXHRcdFx0XHRcdGNvbHVtbiA9IG1heENvbHVtbjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsaW5lTnVtYmVyKys7XG5cdFx0XHRcdFx0bmV4dFdvcmRPbkxpbmUgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpKTtcblx0XHRcdFx0XHRpZiAobmV4dFdvcmRPbkxpbmUpIHtcblx0XHRcdFx0XHRcdGNvbHVtbiA9IG5leHRXb3JkT25MaW5lLnN0YXJ0ICsgMTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIGNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgX2RlbGV0ZVdvcmRQYXJ0UmlnaHQobW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiBSYW5nZSB7XG5cdFx0aWYgKCFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvcyA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHRvUG9zaXRpb24gPSBXb3JkT3BlcmF0aW9ucy5fbW92ZVdvcmRQYXJ0UmlnaHQobW9kZWwsIHBvcyk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbiwgdG9Qb3NpdGlvbi5saW5lTnVtYmVyLCB0b1Bvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlV29yZEF0UG9zaXRpb24obW9kZWw6IElUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgd29yZDogSUZpbmRXb3JkUmVzdWx0KTogSVdvcmRBdFBvc2l0aW9uIHtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShsaW5lTnVtYmVyLCB3b3JkLnN0YXJ0ICsgMSwgbGluZU51bWJlciwgd29yZC5lbmQgKyAxKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d29yZDogbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKSxcblx0XHRcdHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydENvbHVtbixcblx0XHRcdGVuZENvbHVtbjogcmFuZ2UuZW5kQ29sdW1uXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0V29yZEF0UG9zaXRpb24obW9kZWw6IElUZXh0TW9kZWwsIF93b3JkU2VwYXJhdG9yczogc3RyaW5nLCBfaW50bFNlZ21lbnRlckxvY2FsZXM6IHN0cmluZ1tdLCBwb3NpdGlvbjogUG9zaXRpb24pOiBJV29yZEF0UG9zaXRpb24gfCBudWxsIHtcblx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IGdldE1hcEZvcldvcmRTZXBhcmF0b3JzKF93b3JkU2VwYXJhdG9ycywgX2ludGxTZWdtZW50ZXJMb2NhbGVzKTtcblx0XHRjb25zdCBwcmV2V29yZCA9IFdvcmRPcGVyYXRpb25zLl9maW5kUHJldmlvdXNXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgcG9zaXRpb24pO1xuXHRcdGlmIChwcmV2V29yZCAmJiBwcmV2V29yZC53b3JkVHlwZSA9PT0gV29yZFR5cGUuUmVndWxhciAmJiBwcmV2V29yZC5zdGFydCA8PSBwb3NpdGlvbi5jb2x1bW4gLSAxICYmIHBvc2l0aW9uLmNvbHVtbiAtIDEgPD0gcHJldldvcmQuZW5kKSB7XG5cdFx0XHRyZXR1cm4gV29yZE9wZXJhdGlvbnMuX2NyZWF0ZVdvcmRBdFBvc2l0aW9uKG1vZGVsLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwcmV2V29yZCk7XG5cdFx0fVxuXHRcdGNvbnN0IG5leHRXb3JkID0gV29yZE9wZXJhdGlvbnMuX2ZpbmROZXh0V29yZE9uTGluZSh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uKTtcblx0XHRpZiAobmV4dFdvcmQgJiYgbmV4dFdvcmQud29yZFR5cGUgPT09IFdvcmRUeXBlLlJlZ3VsYXIgJiYgbmV4dFdvcmQuc3RhcnQgPD0gcG9zaXRpb24uY29sdW1uIC0gMSAmJiBwb3NpdGlvbi5jb2x1bW4gLSAxIDw9IG5leHRXb3JkLmVuZCkge1xuXHRcdFx0cmV0dXJuIFdvcmRPcGVyYXRpb25zLl9jcmVhdGVXb3JkQXRQb3NpdGlvbihtb2RlbCwgcG9zaXRpb24ubGluZU51bWJlciwgbmV4dFdvcmQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgd29yZChjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIGN1cnNvcjogU2luZ2xlQ3Vyc29yU3RhdGUsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgcG9zaXRpb246IFBvc2l0aW9uKTogU2luZ2xlQ3Vyc29yU3RhdGUge1xuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoY29uZmlnLndvcmRTZXBhcmF0b3JzLCBjb25maWcud29yZFNlZ21lbnRlckxvY2FsZXMpO1xuXHRcdGNvbnN0IHByZXZXb3JkID0gV29yZE9wZXJhdGlvbnMuX2ZpbmRQcmV2aW91c1dvcmRPbkxpbmUod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0Y29uc3QgbmV4dFdvcmQgPSBXb3JkT3BlcmF0aW9ucy5fZmluZE5leHRXb3JkT25MaW5lKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgcG9zaXRpb24pO1xuXG5cdFx0aWYgKCFpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRcdC8vIEVudGVyaW5nIHdvcmQgc2VsZWN0aW9uIGZvciB0aGUgZmlyc3QgdGltZVxuXHRcdFx0bGV0IHN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdFx0XHRsZXQgZW5kQ29sdW1uOiBudW1iZXI7XG5cblx0XHRcdGlmIChwcmV2V29yZCAmJiBwcmV2V29yZC53b3JkVHlwZSA9PT0gV29yZFR5cGUuUmVndWxhciAmJiBwcmV2V29yZC5zdGFydCA8PSBwb3NpdGlvbi5jb2x1bW4gLSAxICYmIHBvc2l0aW9uLmNvbHVtbiAtIDEgPD0gcHJldldvcmQuZW5kKSB7XG5cdFx0XHRcdC8vIGlzVG91Y2hpbmdQcmV2V29yZCAoUmVndWxhciB3b3JkKVxuXHRcdFx0XHRzdGFydENvbHVtbiA9IHByZXZXb3JkLnN0YXJ0ICsgMTtcblx0XHRcdFx0ZW5kQ29sdW1uID0gcHJldldvcmQuZW5kICsgMTtcblx0XHRcdH0gZWxzZSBpZiAocHJldldvcmQgJiYgcHJldldvcmQud29yZFR5cGUgPT09IFdvcmRUeXBlLlNlcGFyYXRvciAmJiBwcmV2V29yZC5zdGFydCA8PSBwb3NpdGlvbi5jb2x1bW4gLSAxICYmIHBvc2l0aW9uLmNvbHVtbiAtIDEgPCBwcmV2V29yZC5lbmQpIHtcblx0XHRcdFx0Ly8gaXNUb3VjaGluZ1ByZXZXb3JkIChTZXBhcmF0b3Igd29yZCkgLSBzdHJpY3RlciBjaGVjaywgZG9uJ3QgaW5jbHVkZSBlbmQgYm91bmRhcnlcblx0XHRcdFx0c3RhcnRDb2x1bW4gPSBwcmV2V29yZC5zdGFydCArIDE7XG5cdFx0XHRcdGVuZENvbHVtbiA9IHByZXZXb3JkLmVuZCArIDE7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHRXb3JkICYmIG5leHRXb3JkLndvcmRUeXBlID09PSBXb3JkVHlwZS5SZWd1bGFyICYmIG5leHRXb3JkLnN0YXJ0IDw9IHBvc2l0aW9uLmNvbHVtbiAtIDEgJiYgcG9zaXRpb24uY29sdW1uIC0gMSA8PSBuZXh0V29yZC5lbmQpIHtcblx0XHRcdFx0Ly8gaXNUb3VjaGluZ05leHRXb3JkIChSZWd1bGFyIHdvcmQpXG5cdFx0XHRcdHN0YXJ0Q29sdW1uID0gbmV4dFdvcmQuc3RhcnQgKyAxO1xuXHRcdFx0XHRlbmRDb2x1bW4gPSBuZXh0V29yZC5lbmQgKyAxO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0V29yZCAmJiBuZXh0V29yZC53b3JkVHlwZSA9PT0gV29yZFR5cGUuU2VwYXJhdG9yICYmIG5leHRXb3JkLnN0YXJ0IDw9IHBvc2l0aW9uLmNvbHVtbiAtIDEgJiYgcG9zaXRpb24uY29sdW1uIC0gMSA8IG5leHRXb3JkLmVuZCkge1xuXHRcdFx0XHQvLyBpc1RvdWNoaW5nTmV4dFdvcmQgKFNlcGFyYXRvciB3b3JkKSAtIHN0cmljdGVyIGNoZWNrLCBkb24ndCBpbmNsdWRlIGVuZCBib3VuZGFyeVxuXHRcdFx0XHRzdGFydENvbHVtbiA9IG5leHRXb3JkLnN0YXJ0ICsgMTtcblx0XHRcdFx0ZW5kQ29sdW1uID0gbmV4dFdvcmQuZW5kICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChwcmV2V29yZCkge1xuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uID0gcHJldldvcmQuZW5kICsgMTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdGFydENvbHVtbiA9IDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5leHRXb3JkKSB7XG5cdFx0XHRcdFx0ZW5kQ29sdW1uID0gbmV4dFdvcmQuc3RhcnQgKyAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVuZENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5ldyBTaW5nbGVDdXJzb3JTdGF0ZShcblx0XHRcdFx0bmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBlbmRDb2x1bW4pLCBTZWxlY3Rpb25TdGFydEtpbmQuV29yZCwgMCxcblx0XHRcdFx0bmV3IFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIGVuZENvbHVtbiksIDBcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdFx0bGV0IGVuZENvbHVtbjogbnVtYmVyO1xuXG5cdFx0aWYgKHByZXZXb3JkICYmIHByZXZXb3JkLndvcmRUeXBlID09PSBXb3JkVHlwZS5SZWd1bGFyICYmIHByZXZXb3JkLnN0YXJ0IDwgcG9zaXRpb24uY29sdW1uIC0gMSAmJiBwb3NpdGlvbi5jb2x1bW4gLSAxIDwgcHJldldvcmQuZW5kKSB7XG5cdFx0XHQvLyBpc0luc2lkZVByZXZXb3JkIChSZWd1bGFyIHdvcmQpXG5cdFx0XHRzdGFydENvbHVtbiA9IHByZXZXb3JkLnN0YXJ0ICsgMTtcblx0XHRcdGVuZENvbHVtbiA9IHByZXZXb3JkLmVuZCArIDE7XG5cdFx0fSBlbHNlIGlmIChuZXh0V29yZCAmJiBuZXh0V29yZC53b3JkVHlwZSA9PT0gV29yZFR5cGUuUmVndWxhciAmJiBuZXh0V29yZC5zdGFydCA8IHBvc2l0aW9uLmNvbHVtbiAtIDEgJiYgcG9zaXRpb24uY29sdW1uIC0gMSA8IG5leHRXb3JkLmVuZCkge1xuXHRcdFx0Ly8gaXNJbnNpZGVOZXh0V29yZCAoUmVndWxhciB3b3JkKVxuXHRcdFx0c3RhcnRDb2x1bW4gPSBuZXh0V29yZC5zdGFydCArIDE7XG5cdFx0XHRlbmRDb2x1bW4gPSBuZXh0V29yZC5lbmQgKyAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGFydENvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblx0XHRcdGVuZENvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRsZXQgY29sdW1uOiBudW1iZXI7XG5cdFx0aWYgKGN1cnNvci5zZWxlY3Rpb25TdGFydC5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0Y29sdW1uID0gY3Vyc29yLnNlbGVjdGlvblN0YXJ0LmVuZENvbHVtbjtcblx0XHR9IGVsc2UgaWYgKHBvc2l0aW9uLmlzQmVmb3JlT3JFcXVhbChjdXJzb3Iuc2VsZWN0aW9uU3RhcnQuZ2V0U3RhcnRQb3NpdGlvbigpKSkge1xuXHRcdFx0Y29sdW1uID0gc3RhcnRDb2x1bW47XG5cdFx0XHRjb25zdCBwb3NzaWJsZVBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHRpZiAoY3Vyc29yLnNlbGVjdGlvblN0YXJ0LmNvbnRhaW5zUG9zaXRpb24ocG9zc2libGVQb3NpdGlvbikpIHtcblx0XHRcdFx0Y29sdW1uID0gY3Vyc29yLnNlbGVjdGlvblN0YXJ0LmVuZENvbHVtbjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29sdW1uID0gZW5kQ29sdW1uO1xuXHRcdFx0Y29uc3QgcG9zc2libGVQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0aWYgKGN1cnNvci5zZWxlY3Rpb25TdGFydC5jb250YWluc1Bvc2l0aW9uKHBvc3NpYmxlUG9zaXRpb24pKSB7XG5cdFx0XHRcdGNvbHVtbiA9IGN1cnNvci5zZWxlY3Rpb25TdGFydC5zdGFydENvbHVtbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY3Vyc29yLm1vdmUodHJ1ZSwgbGluZU51bWJlciwgY29sdW1uLCAwKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV29yZFBhcnRPcGVyYXRpb25zIGV4dGVuZHMgV29yZE9wZXJhdGlvbnMge1xuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZVdvcmRQYXJ0TGVmdChjdHg6IERlbGV0ZVdvcmRDb250ZXh0KTogUmFuZ2Uge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBlbmZvcmNlRGVmaW5lZChbXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5kZWxldGVXb3JkTGVmdChjdHgsIFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQpLFxuXHRcdFx0V29yZE9wZXJhdGlvbnMuZGVsZXRlV29yZExlZnQoY3R4LCBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCksXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5fZGVsZXRlV29yZFBhcnRMZWZ0KGN0eC5tb2RlbCwgY3R4LnNlbGVjdGlvbilcblx0XHRdKTtcblx0XHRjYW5kaWRhdGVzLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nRW5kcyk7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZXNbMl07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZVdvcmRQYXJ0UmlnaHQoY3R4OiBEZWxldGVXb3JkQ29udGV4dCk6IFJhbmdlIHtcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gZW5mb3JjZURlZmluZWQoW1xuXHRcdFx0V29yZE9wZXJhdGlvbnMuZGVsZXRlV29yZFJpZ2h0KGN0eCwgV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCksXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5kZWxldGVXb3JkUmlnaHQoY3R4LCBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCksXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5fZGVsZXRlV29yZFBhcnRSaWdodChjdHgubW9kZWwsIGN0eC5zZWxlY3Rpb24pXG5cdFx0XSk7XG5cdFx0Y2FuZGlkYXRlcy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZXNbMF07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG1vdmVXb3JkUGFydExlZnQod29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIGhhc011bHRpY3Vyc29yOiBib29sZWFuKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBlbmZvcmNlRGVmaW5lZChbXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5tb3ZlV29yZExlZnQod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbiwgV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCwgaGFzTXVsdGljdXJzb3IpLFxuXHRcdFx0V29yZE9wZXJhdGlvbnMubW92ZVdvcmRMZWZ0KHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgcG9zaXRpb24sIFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kLCBoYXNNdWx0aWN1cnNvciksXG5cdFx0XHRXb3JkT3BlcmF0aW9ucy5fbW92ZVdvcmRQYXJ0TGVmdChtb2RlbCwgcG9zaXRpb24pXG5cdFx0XSk7XG5cdFx0Y2FuZGlkYXRlcy5zb3J0KFBvc2l0aW9uLmNvbXBhcmUpO1xuXHRcdHJldHVybiBjYW5kaWRhdGVzWzJdO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBtb3ZlV29yZFBhcnRSaWdodCh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gZW5mb3JjZURlZmluZWQoW1xuXHRcdFx0V29yZE9wZXJhdGlvbnMubW92ZVdvcmRSaWdodCh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uLCBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0KSxcblx0XHRcdFdvcmRPcGVyYXRpb25zLm1vdmVXb3JkUmlnaHQod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBwb3NpdGlvbiwgV29yZE5hdmlnYXRpb25UeXBlLldvcmRFbmQpLFxuXHRcdFx0V29yZE9wZXJhdGlvbnMuX21vdmVXb3JkUGFydFJpZ2h0KG1vZGVsLCBwb3NpdGlvbilcblx0XHRdKTtcblx0XHRjYW5kaWRhdGVzLnNvcnQoUG9zaXRpb24uY29tcGFyZSk7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZXNbMF07XG5cdH1cbn1cblxuZnVuY3Rpb24gZW5mb3JjZURlZmluZWQ8VD4oYXJyOiBBcnJheTxUIHwgdW5kZWZpbmVkIHwgbnVsbD4pOiBUW10ge1xuXHRyZXR1cm4gPFRbXT5hcnIuZmlsdGVyKGVsID0+IEJvb2xlYW4oZWwpKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUV6QixTQUFrRCxvQkFBb0IseUJBQXlCO0FBQy9GLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQWtFLCtCQUErQjtBQUMxRyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUF5QnRCLElBQVcsV0FBWCxrQkFBV0EsY0FBWDtBQUNDLEVBQUFBLG9CQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLG9CQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLG9CQUFBLGVBQVksS0FBWjtBQUhVLFNBQUFBO0FBQUEsR0FBQTtBQU1KLElBQVcscUJBQVgsa0JBQVdDLHdCQUFYO0FBQ04sRUFBQUEsd0NBQUEsZUFBWSxLQUFaO0FBQ0EsRUFBQUEsd0NBQUEsbUJBQWdCLEtBQWhCO0FBQ0EsRUFBQUEsd0NBQUEsYUFBVSxLQUFWO0FBQ0EsRUFBQUEsd0NBQUEsdUJBQW9CLEtBQXBCO0FBSmlCLFNBQUFBO0FBQUEsR0FBQTtBQW1CWCxNQUFNLGVBQWU7QUFBQSxFQUUzQixPQUFlLFlBQVksYUFBcUIsVUFBb0IsZUFBbUMsT0FBZSxLQUE4QjtBQUVuSixXQUFPLEVBQUUsT0FBYyxLQUFVLFVBQW9CLGNBQTZCO0FBQUEsRUFDbkY7QUFBQSxFQUVBLE9BQWUsZ0JBQWdCLFVBQStCLGVBQW9EO0FBRWpILFdBQU8sRUFBRSxPQUFPLFNBQVMs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LGVBQWUsS0FBSyxlQUEwQjtBQUFBLE1BQzdELGVBQWUsb0JBQW9CLElBQUksT0FBTyxJQUFJLFNBQVM7QUFBQSxJQUM1RCxDQUFDO0FBQ0QsZUFBVyxLQUFLLE1BQU0sc0JBQXNCO0FBQzVDLFdBQU8sV0FBVyxDQUFDO0FBQUEsRUFDcEI7QUFBQSxFQUVBLE9BQWMsb0JBQW9CLEtBQStCO0FBQ2hFLFVBQU0sYUFBYSxlQUFlO0FBQUEsTUFDakMsZUFBZSxnQkFBZ0IsS0FBSyxpQkFBNEI7QUFBQSxNQUNoRSxlQUFlLGdCQUFnQixLQUFLLGVBQTBCO0FBQUEsTUFDOUQsZUFBZSxxQkFBcUIsSUFBSSxPQUFPLElBQUksU0FBUztBQUFBLElBQzdELENBQUM7QUFDRCxlQUFXLEtBQUssTUFBTSx3QkFBd0I7QUFDOUMsV0FBTyxXQUFXLENBQUM7QUFBQSxFQUNwQjtBQUFBLEVBRUEsT0FBYyxpQkFBaUIsZ0JBQXlDLE9BQTJCLFVBQW9CLGdCQUFtQztBQUN6SixVQUFNLGFBQWEsZUFBZTtBQUFBLE1BQ2pDLGVBQWUsYUFBYSxnQkFBZ0IsT0FBTyxVQUFVLG1CQUE4QixjQUFjO0FBQUEsTUFDekcsZUFBZSxhQUFhLGdCQUFnQixPQUFPLFVBQVUsaUJBQTRCLGNBQWM7QUFBQSxNQUN2RyxlQUFlLGtCQUFrQixPQUFPLFFBQVE7QUFBQSxJQUNqRCxDQUFDO0FBQ0QsZUFBVyxLQUFLLFNBQVMsT0FBTztBQUNoQyxXQUFPLFdBQVcsQ0FBQztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxPQUFjLGtCQUFrQixnQkFBeUMsT0FBMkIsVUFBOEI7QUFDakksVUFBTSxhQUFhLGVBQWU7QUFBQSxNQUNqQyxlQUFlLGNBQWMsZ0JBQWdCLE9BQU8sVUFBVSxpQkFBNEI7QUFBQSxNQUMxRixlQUFlLGNBQWMsZ0JBQWdCLE9BQU8sVUFBVSxlQUEwQjtBQUFBLE1BQ3hGLGVBQWUsbUJBQW1CLE9BQU8sUUFBUTtBQUFBLElBQ2xELENBQUM7QUFDRCxlQUFXLEtBQUssU0FBUyxPQUFPO0FBQ2hDLFdBQU8sV0FBVyxDQUFDO0FBQUEsRUFDcEI7QUFDRDtBQUVBLFNBQVMsZUFBa0IsS0FBdUM7QUFDakUsU0FBWSxJQUFJLE9BQU8sUUFBTSxRQUFRLEVBQUUsQ0FBQztBQUN6QzsiLAogICJuYW1lcyI6IFsiV29yZFR5cGUiLCAiV29yZE5hdmlnYXRpb25UeXBlIiwgInBvc2l0aW9uIiwgInN0YXJ0Q29sdW1uIiwgImVuZENvbHVtbiJdCn0K
