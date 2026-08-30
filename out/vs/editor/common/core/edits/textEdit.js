import { compareBy, equals } from "../../../../base/common/arrays.js";
import { assertFn, checkAdjacentItems } from "../../../../base/common/assert.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { commonPrefixLength, commonSuffixLength } from "../../../../base/common/strings.js";
import { Position } from "../position.js";
import { Range } from "../range.js";
import { TextLength } from "../text/textLength.js";
import { StringText } from "../text/abstractText.js";
class TextEdit {
  constructor(replacements) {
    this.replacements = replacements;
    assertFn(() => checkAdjacentItems(replacements, (a, b) => a.range.getEndPosition().isBeforeOrEqual(b.range.getStartPosition())));
  }
  static fromStringEdit(edit, initialState) {
    const edits = edit.replacements.map((e) => TextReplacement.fromStringReplacement(e, initialState));
    return new TextEdit(edits);
  }
  static replace(originalRange, newText) {
    return new TextEdit([new TextReplacement(originalRange, newText)]);
  }
  static delete(range) {
    return new TextEdit([new TextReplacement(range, "")]);
  }
  static insert(position, newText) {
    return new TextEdit([new TextReplacement(Range.fromPositions(position, position), newText)]);
  }
  static fromParallelReplacementsUnsorted(replacements) {
    const r = replacements.slice().sort(compareBy((i) => i.range, Range.compareRangesUsingStarts));
    return new TextEdit(r);
  }
  /**
   * Joins touching edits and removes empty edits.
   */
  normalize() {
    const replacements = [];
    for (const r of this.replacements) {
      if (replacements.length > 0 && replacements[replacements.length - 1].range.getEndPosition().equals(r.range.getStartPosition())) {
        const last = replacements[replacements.length - 1];
        replacements[replacements.length - 1] = new TextReplacement(last.range.plusRange(r.range), last.text + r.text);
      } else if (!r.isEmpty) {
        replacements.push(r);
      }
    }
    return new TextEdit(replacements);
  }
  mapPosition(position) {
    let lineDelta = 0;
    let curLine = 0;
    let columnDeltaInCurLine = 0;
    for (const replacement of this.replacements) {
      const start = replacement.range.getStartPosition();
      if (position.isBeforeOrEqual(start)) {
        break;
      }
      const end = replacement.range.getEndPosition();
      const len = TextLength.ofText(replacement.text);
      if (position.isBefore(end)) {
        const startPos = new Position(start.lineNumber + lineDelta, start.column + (start.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
        const endPos = len.addToPosition(startPos);
        return rangeFromPositions(startPos, endPos);
      }
      if (start.lineNumber + lineDelta !== curLine) {
        columnDeltaInCurLine = 0;
      }
      lineDelta += len.lineCount - (replacement.range.endLineNumber - replacement.range.startLineNumber);
      if (len.lineCount === 0) {
        if (end.lineNumber !== start.lineNumber) {
          columnDeltaInCurLine += len.columnCount - (end.column - 1);
        } else {
          columnDeltaInCurLine += len.columnCount - (end.column - start.column);
        }
      } else {
        columnDeltaInCurLine = len.columnCount;
      }
      curLine = end.lineNumber + lineDelta;
    }
    return new Position(position.lineNumber + lineDelta, position.column + (position.lineNumber + lineDelta === curLine ? columnDeltaInCurLine : 0));
  }
  mapRange(range) {
    function getStart(p) {
      return p instanceof Position ? p : p.getStartPosition();
    }
    function getEnd(p) {
      return p instanceof Position ? p : p.getEndPosition();
    }
    const start = getStart(this.mapPosition(range.getStartPosition()));
    const end = getEnd(this.mapPosition(range.getEndPosition()));
    return rangeFromPositions(start, end);
  }
  // TODO: `doc` is not needed for this!
  inverseMapPosition(positionAfterEdit, doc) {
    const reversed = this.inverse(doc);
    return reversed.mapPosition(positionAfterEdit);
  }
  inverseMapRange(range, doc) {
    const reversed = this.inverse(doc);
    return reversed.mapRange(range);
  }
  apply(text) {
    let result = "";
    let lastEditEnd = new Position(1, 1);
    for (const replacement of this.replacements) {
      const editRange = replacement.range;
      const editStart = editRange.getStartPosition();
      const editEnd = editRange.getEndPosition();
      const r2 = rangeFromPositions(lastEditEnd, editStart);
      if (!r2.isEmpty()) {
        result += text.getValueOfRange(r2);
      }
      result += replacement.text;
      lastEditEnd = editEnd;
    }
    const r = rangeFromPositions(lastEditEnd, text.endPositionExclusive);
    if (!r.isEmpty()) {
      result += text.getValueOfRange(r);
    }
    return result;
  }
  applyToString(str) {
    const strText = new StringText(str);
    return this.apply(strText);
  }
  inverse(doc) {
    const ranges = this.getNewRanges();
    return new TextEdit(this.replacements.map((e, idx) => new TextReplacement(ranges[idx], doc.getValueOfRange(e.range))));
  }
  getNewRanges() {
    const newRanges = [];
    let previousEditEndLineNumber = 0;
    let lineOffset = 0;
    let columnOffset = 0;
    for (const replacement of this.replacements) {
      const textLength = TextLength.ofText(replacement.text);
      const newRangeStart = Position.lift({
        lineNumber: replacement.range.startLineNumber + lineOffset,
        column: replacement.range.startColumn + (replacement.range.startLineNumber === previousEditEndLineNumber ? columnOffset : 0)
      });
      const newRange = textLength.createRange(newRangeStart);
      newRanges.push(newRange);
      lineOffset = newRange.endLineNumber - replacement.range.endLineNumber;
      columnOffset = newRange.endColumn - replacement.range.endColumn;
      previousEditEndLineNumber = replacement.range.endLineNumber;
    }
    return newRanges;
  }
  toReplacement(text) {
    if (this.replacements.length === 0) {
      throw new BugIndicatingError();
    }
    if (this.replacements.length === 1) {
      return this.replacements[0];
    }
    const startPos = this.replacements[0].range.getStartPosition();
    const endPos = this.replacements[this.replacements.length - 1].range.getEndPosition();
    let newText = "";
    for (let i = 0; i < this.replacements.length; i++) {
      const curEdit = this.replacements[i];
      newText += curEdit.text;
      if (i < this.replacements.length - 1) {
        const nextEdit = this.replacements[i + 1];
        const gapRange = Range.fromPositions(curEdit.range.getEndPosition(), nextEdit.range.getStartPosition());
        const gapText = text.getValueOfRange(gapRange);
        newText += gapText;
      }
    }
    return new TextReplacement(Range.fromPositions(startPos, endPos), newText);
  }
  equals(other) {
    return equals(this.replacements, other.replacements, (a, b) => a.equals(b));
  }
  /**
   * Combines two edits into one with the same effect.
   * WARNING: This is written by AI, but well tested. I do not understand the implementation myself.
   *
   * Invariant:
   * ```
   * other.applyToString(this.applyToString(s0)) = this.compose(other).applyToString(s0)
   * ```
   */
  compose(other) {
    const edits1 = this.normalize();
    const edits2 = other.normalize();
    if (edits1.replacements.length === 0) {
      return edits2;
    }
    if (edits2.replacements.length === 0) {
      return edits1;
    }
    const resultReplacements = [];
    let edit1Idx = 0;
    let lastEdit1EndS0Line = 1;
    let lastEdit1EndS0Col = 1;
    let headSrcRangeStartLine = 0;
    let headSrcRangeStartCol = 0;
    let headSrcRangeEndLine = 0;
    let headSrcRangeEndCol = 0;
    let headText = null;
    let headLengthLine = 0;
    let headLengthCol = 0;
    let headHasValue = false;
    let headIsInfinite = false;
    let currentPosInS1Line = 1;
    let currentPosInS1Col = 1;
    function ensureHead() {
      if (headHasValue) {
        return;
      }
      if (edit1Idx < edits1.replacements.length) {
        const nextEdit = edits1.replacements[edit1Idx];
        const nextEditStart = nextEdit.range.getStartPosition();
        const gapIsEmpty = lastEdit1EndS0Line === nextEditStart.lineNumber && lastEdit1EndS0Col === nextEditStart.column;
        if (!gapIsEmpty) {
          headSrcRangeStartLine = lastEdit1EndS0Line;
          headSrcRangeStartCol = lastEdit1EndS0Col;
          headSrcRangeEndLine = nextEditStart.lineNumber;
          headSrcRangeEndCol = nextEditStart.column;
          headText = null;
          if (lastEdit1EndS0Line === nextEditStart.lineNumber) {
            headLengthLine = 0;
            headLengthCol = nextEditStart.column - lastEdit1EndS0Col;
          } else {
            headLengthLine = nextEditStart.lineNumber - lastEdit1EndS0Line;
            headLengthCol = nextEditStart.column - 1;
          }
          headHasValue = true;
          lastEdit1EndS0Line = nextEditStart.lineNumber;
          lastEdit1EndS0Col = nextEditStart.column;
        } else {
          const nextEditEnd = nextEdit.range.getEndPosition();
          headSrcRangeStartLine = nextEditStart.lineNumber;
          headSrcRangeStartCol = nextEditStart.column;
          headSrcRangeEndLine = nextEditEnd.lineNumber;
          headSrcRangeEndCol = nextEditEnd.column;
          headText = nextEdit.text;
          let line = 0;
          let column = 0;
          const text = nextEdit.text;
          for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) {
              line++;
              column = 0;
            } else {
              column++;
            }
          }
          headLengthLine = line;
          headLengthCol = column;
          headHasValue = true;
          lastEdit1EndS0Line = nextEditEnd.lineNumber;
          lastEdit1EndS0Col = nextEditEnd.column;
          edit1Idx++;
        }
      } else {
        headIsInfinite = true;
        headSrcRangeStartLine = lastEdit1EndS0Line;
        headSrcRangeStartCol = lastEdit1EndS0Col;
        headHasValue = true;
      }
    }
    function splitText(text, lenLine, lenCol) {
      if (lenLine === 0 && lenCol === 0) {
        return ["", text];
      }
      let line = 0;
      let offset = 0;
      while (line < lenLine) {
        const idx = text.indexOf("\n", offset);
        if (idx === -1) {
          throw new BugIndicatingError("Text length mismatch");
        }
        offset = idx + 1;
        line++;
      }
      offset += lenCol;
      return [text.substring(0, offset), text.substring(offset)];
    }
    for (const r2 of edits2.replacements) {
      const r2Start = r2.range.getStartPosition();
      const r2End = r2.range.getEndPosition();
      while (true) {
        if (currentPosInS1Line === r2Start.lineNumber && currentPosInS1Col === r2Start.column) {
          break;
        }
        ensureHead();
        if (headIsInfinite) {
          let distLine, distCol;
          if (currentPosInS1Line === r2Start.lineNumber) {
            distLine = 0;
            distCol = r2Start.column - currentPosInS1Col;
          } else {
            distLine = r2Start.lineNumber - currentPosInS1Line;
            distCol = r2Start.column - 1;
          }
          currentPosInS1Line = r2Start.lineNumber;
          currentPosInS1Col = r2Start.column;
          if (distLine === 0) {
            headSrcRangeStartCol += distCol;
          } else {
            headSrcRangeStartLine += distLine;
            headSrcRangeStartCol = distCol + 1;
          }
          break;
        }
        let headEndInS1Line, headEndInS1Col;
        if (headLengthLine === 0) {
          headEndInS1Line = currentPosInS1Line;
          headEndInS1Col = currentPosInS1Col + headLengthCol;
        } else {
          headEndInS1Line = currentPosInS1Line + headLengthLine;
          headEndInS1Col = headLengthCol + 1;
        }
        let r2StartIsBeforeHeadEnd = false;
        if (r2Start.lineNumber < headEndInS1Line) {
          r2StartIsBeforeHeadEnd = true;
        } else if (r2Start.lineNumber === headEndInS1Line) {
          r2StartIsBeforeHeadEnd = r2Start.column < headEndInS1Col;
        }
        if (r2StartIsBeforeHeadEnd) {
          let splitLenLine, splitLenCol;
          if (currentPosInS1Line === r2Start.lineNumber) {
            splitLenLine = 0;
            splitLenCol = r2Start.column - currentPosInS1Col;
          } else {
            splitLenLine = r2Start.lineNumber - currentPosInS1Line;
            splitLenCol = r2Start.column - 1;
          }
          let remainingLenLine, remainingLenCol;
          if (splitLenLine === headLengthLine) {
            remainingLenLine = 0;
            remainingLenCol = headLengthCol - splitLenCol;
          } else {
            remainingLenLine = headLengthLine - splitLenLine;
            remainingLenCol = headLengthCol;
          }
          if (headText !== null) {
            const [t1, t2] = splitText(headText, splitLenLine, splitLenCol);
            resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), t1));
            headText = t2;
            headLengthLine = remainingLenLine;
            headLengthCol = remainingLenCol;
            headSrcRangeStartLine = headSrcRangeEndLine;
            headSrcRangeStartCol = headSrcRangeEndCol;
          } else {
            let splitPosLine, splitPosCol;
            if (splitLenLine === 0) {
              splitPosLine = headSrcRangeStartLine;
              splitPosCol = headSrcRangeStartCol + splitLenCol;
            } else {
              splitPosLine = headSrcRangeStartLine + splitLenLine;
              splitPosCol = splitLenCol + 1;
            }
            headSrcRangeStartLine = splitPosLine;
            headSrcRangeStartCol = splitPosCol;
            headLengthLine = remainingLenLine;
            headLengthCol = remainingLenCol;
          }
          currentPosInS1Line = r2Start.lineNumber;
          currentPosInS1Col = r2Start.column;
          break;
        }
        if (headText !== null) {
          resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), headText));
        }
        currentPosInS1Line = headEndInS1Line;
        currentPosInS1Col = headEndInS1Col;
        headHasValue = false;
      }
      let consumedStartS0Line = null;
      let consumedStartS0Col = null;
      let consumedEndS0Line = null;
      let consumedEndS0Col = null;
      while (true) {
        if (currentPosInS1Line === r2End.lineNumber && currentPosInS1Col === r2End.column) {
          break;
        }
        ensureHead();
        if (headIsInfinite) {
          let distLine, distCol;
          if (currentPosInS1Line === r2End.lineNumber) {
            distLine = 0;
            distCol = r2End.column - currentPosInS1Col;
          } else {
            distLine = r2End.lineNumber - currentPosInS1Line;
            distCol = r2End.column - 1;
          }
          let rangeInS0EndLine, rangeInS0EndCol;
          if (distLine === 0) {
            rangeInS0EndLine = headSrcRangeStartLine;
            rangeInS0EndCol = headSrcRangeStartCol + distCol;
          } else {
            rangeInS0EndLine = headSrcRangeStartLine + distLine;
            rangeInS0EndCol = distCol + 1;
          }
          if (consumedStartS0Line === null) {
            consumedStartS0Line = headSrcRangeStartLine;
            consumedStartS0Col = headSrcRangeStartCol;
          }
          consumedEndS0Line = rangeInS0EndLine;
          consumedEndS0Col = rangeInS0EndCol;
          currentPosInS1Line = r2End.lineNumber;
          currentPosInS1Col = r2End.column;
          headSrcRangeStartLine = rangeInS0EndLine;
          headSrcRangeStartCol = rangeInS0EndCol;
          break;
        }
        let headEndInS1Line, headEndInS1Col;
        if (headLengthLine === 0) {
          headEndInS1Line = currentPosInS1Line;
          headEndInS1Col = currentPosInS1Col + headLengthCol;
        } else {
          headEndInS1Line = currentPosInS1Line + headLengthLine;
          headEndInS1Col = headLengthCol + 1;
        }
        let r2EndIsBeforeHeadEnd = false;
        if (r2End.lineNumber < headEndInS1Line) {
          r2EndIsBeforeHeadEnd = true;
        } else if (r2End.lineNumber === headEndInS1Line) {
          r2EndIsBeforeHeadEnd = r2End.column < headEndInS1Col;
        }
        if (r2EndIsBeforeHeadEnd) {
          let splitLenLine, splitLenCol;
          if (currentPosInS1Line === r2End.lineNumber) {
            splitLenLine = 0;
            splitLenCol = r2End.column - currentPosInS1Col;
          } else {
            splitLenLine = r2End.lineNumber - currentPosInS1Line;
            splitLenCol = r2End.column - 1;
          }
          let remainingLenLine, remainingLenCol;
          if (splitLenLine === headLengthLine) {
            remainingLenLine = 0;
            remainingLenCol = headLengthCol - splitLenCol;
          } else {
            remainingLenLine = headLengthLine - splitLenLine;
            remainingLenCol = headLengthCol;
          }
          if (headText !== null) {
            if (consumedStartS0Line === null) {
              consumedStartS0Line = headSrcRangeStartLine;
              consumedStartS0Col = headSrcRangeStartCol;
            }
            consumedEndS0Line = headSrcRangeEndLine;
            consumedEndS0Col = headSrcRangeEndCol;
            const [, t2] = splitText(headText, splitLenLine, splitLenCol);
            headText = t2;
            headLengthLine = remainingLenLine;
            headLengthCol = remainingLenCol;
            headSrcRangeStartLine = headSrcRangeEndLine;
            headSrcRangeStartCol = headSrcRangeEndCol;
          } else {
            let splitPosLine, splitPosCol;
            if (splitLenLine === 0) {
              splitPosLine = headSrcRangeStartLine;
              splitPosCol = headSrcRangeStartCol + splitLenCol;
            } else {
              splitPosLine = headSrcRangeStartLine + splitLenLine;
              splitPosCol = splitLenCol + 1;
            }
            if (consumedStartS0Line === null) {
              consumedStartS0Line = headSrcRangeStartLine;
              consumedStartS0Col = headSrcRangeStartCol;
            }
            consumedEndS0Line = splitPosLine;
            consumedEndS0Col = splitPosCol;
            headSrcRangeStartLine = splitPosLine;
            headSrcRangeStartCol = splitPosCol;
            headLengthLine = remainingLenLine;
            headLengthCol = remainingLenCol;
          }
          currentPosInS1Line = r2End.lineNumber;
          currentPosInS1Col = r2End.column;
          break;
        }
        if (consumedStartS0Line === null) {
          consumedStartS0Line = headSrcRangeStartLine;
          consumedStartS0Col = headSrcRangeStartCol;
        }
        consumedEndS0Line = headSrcRangeEndLine;
        consumedEndS0Col = headSrcRangeEndCol;
        currentPosInS1Line = headEndInS1Line;
        currentPosInS1Col = headEndInS1Col;
        headHasValue = false;
      }
      if (consumedStartS0Line !== null) {
        resultReplacements.push(new TextReplacement(new Range(consumedStartS0Line, consumedStartS0Col, consumedEndS0Line, consumedEndS0Col), r2.text));
      } else {
        ensureHead();
        const insertPosS0Line = headSrcRangeStartLine;
        const insertPosS0Col = headSrcRangeStartCol;
        resultReplacements.push(new TextReplacement(new Range(insertPosS0Line, insertPosS0Col, insertPosS0Line, insertPosS0Col), r2.text));
      }
    }
    while (true) {
      ensureHead();
      if (headIsInfinite) {
        break;
      }
      if (headText !== null) {
        resultReplacements.push(new TextReplacement(new Range(headSrcRangeStartLine, headSrcRangeStartCol, headSrcRangeEndLine, headSrcRangeEndCol), headText));
      }
      headHasValue = false;
    }
    return new TextEdit(resultReplacements).normalize();
  }
  toString(text) {
    if (text === void 0) {
      return this.replacements.map((edit) => edit.toString()).join("\n");
    }
    if (typeof text === "string") {
      return this.toString(new StringText(text));
    }
    if (this.replacements.length === 0) {
      return "";
    }
    return this.replacements.map((r) => {
      const maxLength = 10;
      const originalText = text.getValueOfRange(r.range);
      const beforeRange = Range.fromPositions(
        new Position(Math.max(1, r.range.startLineNumber - 1), 1),
        r.range.getStartPosition()
      );
      let beforeText = text.getValueOfRange(beforeRange);
      if (beforeText.length > maxLength) {
        beforeText = "..." + beforeText.substring(beforeText.length - maxLength);
      }
      const afterRange = Range.fromPositions(
        r.range.getEndPosition(),
        new Position(r.range.endLineNumber + 1, 1)
      );
      let afterText = text.getValueOfRange(afterRange);
      if (afterText.length > maxLength) {
        afterText = afterText.substring(0, maxLength) + "...";
      }
      let replacedText = originalText;
      if (replacedText.length > maxLength) {
        const halfMax = Math.floor(maxLength / 2);
        replacedText = replacedText.substring(0, halfMax) + "..." + replacedText.substring(replacedText.length - halfMax);
      }
      let newText = r.text;
      if (newText.length > maxLength) {
        const halfMax = Math.floor(maxLength / 2);
        newText = newText.substring(0, halfMax) + "..." + newText.substring(newText.length - halfMax);
      }
      if (replacedText.length === 0) {
        return `${beforeText}\u2770${newText}\u2771${afterText}`;
      }
      return `${beforeText}\u2770${replacedText}\u21A6${newText}\u2771${afterText}`;
    }).join("\n");
  }
}
class TextReplacement {
  constructor(range, text) {
    this.range = range;
    this.text = text;
  }
  static joinReplacements(replacements, initialValue) {
    if (replacements.length === 0) {
      throw new BugIndicatingError();
    }
    if (replacements.length === 1) {
      return replacements[0];
    }
    const startPos = replacements[0].range.getStartPosition();
    const endPos = replacements[replacements.length - 1].range.getEndPosition();
    let newText = "";
    for (let i = 0; i < replacements.length; i++) {
      const curEdit = replacements[i];
      newText += curEdit.text;
      if (i < replacements.length - 1) {
        const nextEdit = replacements[i + 1];
        const gapRange = Range.fromPositions(curEdit.range.getEndPosition(), nextEdit.range.getStartPosition());
        const gapText = initialValue.getValueOfRange(gapRange);
        newText += gapText;
      }
    }
    return new TextReplacement(Range.fromPositions(startPos, endPos), newText);
  }
  static fromStringReplacement(replacement, initialState) {
    return new TextReplacement(initialState.getTransformer().getRange(replacement.replaceRange), replacement.newText);
  }
  static delete(range) {
    return new TextReplacement(range, "");
  }
  get isEmpty() {
    return this.range.isEmpty() && this.text.length === 0;
  }
  static equals(first, second) {
    return first.range.equalsRange(second.range) && first.text === second.text;
  }
  toSingleEditOperation() {
    return {
      range: this.range,
      text: this.text
    };
  }
  toEdit() {
    return new TextEdit([this]);
  }
  equals(other) {
    return TextReplacement.equals(this, other);
  }
  extendToCoverRange(range, initialValue) {
    if (this.range.containsRange(range)) {
      return this;
    }
    const newRange = this.range.plusRange(range);
    const textBefore = initialValue.getValueOfRange(Range.fromPositions(newRange.getStartPosition(), this.range.getStartPosition()));
    const textAfter = initialValue.getValueOfRange(Range.fromPositions(this.range.getEndPosition(), newRange.getEndPosition()));
    const newText = textBefore + this.text + textAfter;
    return new TextReplacement(newRange, newText);
  }
  extendToFullLine(initialValue) {
    const newRange = new Range(
      this.range.startLineNumber,
      1,
      this.range.endLineNumber,
      initialValue.getTransformer().getLineLength(this.range.endLineNumber) + 1
    );
    return this.extendToCoverRange(newRange, initialValue);
  }
  removeCommonPrefixAndSuffix(text) {
    const prefix = this.removeCommonPrefix(text);
    const suffix = prefix.removeCommonSuffix(text);
    return suffix;
  }
  removeCommonPrefix(text) {
    const normalizedOriginalText = text.getValueOfRange(this.range).replaceAll("\r\n", "\n");
    const normalizedModifiedText = this.text.replaceAll("\r\n", "\n");
    const commonPrefixLen = commonPrefixLength(normalizedOriginalText, normalizedModifiedText);
    const start = TextLength.ofText(normalizedOriginalText.substring(0, commonPrefixLen)).addToPosition(this.range.getStartPosition());
    const newText = normalizedModifiedText.substring(commonPrefixLen);
    const range = Range.fromPositions(start, this.range.getEndPosition());
    return new TextReplacement(range, newText);
  }
  removeCommonSuffix(text) {
    const normalizedOriginalText = text.getValueOfRange(this.range).replaceAll("\r\n", "\n");
    const normalizedModifiedText = this.text.replaceAll("\r\n", "\n");
    const commonSuffixLen = commonSuffixLength(normalizedOriginalText, normalizedModifiedText);
    const end = TextLength.ofText(normalizedOriginalText.substring(0, normalizedOriginalText.length - commonSuffixLen)).addToPosition(this.range.getStartPosition());
    const newText = normalizedModifiedText.substring(0, normalizedModifiedText.length - commonSuffixLen);
    const range = Range.fromPositions(this.range.getStartPosition(), end);
    return new TextReplacement(range, newText);
  }
  isEffectiveDeletion(text) {
    let newText = this.text.replaceAll("\r\n", "\n");
    let existingText = text.getValueOfRange(this.range).replaceAll("\r\n", "\n");
    const l = commonPrefixLength(newText, existingText);
    newText = newText.substring(l);
    existingText = existingText.substring(l);
    const r = commonSuffixLength(newText, existingText);
    newText = newText.substring(0, newText.length - r);
    existingText = existingText.substring(0, existingText.length - r);
    return newText === "";
  }
  toString() {
    const start = this.range.getStartPosition();
    const end = this.range.getEndPosition();
    return `(${start.lineNumber},${start.column} -> ${end.lineNumber},${end.column}): "${this.text}"`;
  }
}
function rangeFromPositions(start, end) {
  if (start.lineNumber === end.lineNumber && start.column === Number.MAX_SAFE_INTEGER) {
    return Range.fromPositions(end, end);
  } else if (!start.isBeforeOrEqual(end)) {
    throw new BugIndicatingError("start must be before end");
  }
  return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
}
export {
  TextEdit,
  TextReplacement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29yZVxcZWRpdHNcXHRleHRFZGl0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY29tcGFyZUJ5LCBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0Rm4sIGNoZWNrQWRqYWNlbnRJdGVtcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgY29tbW9uUHJlZml4TGVuZ3RoLCBjb21tb25TdWZmaXhMZW5ndGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBCYXNlU3RyaW5nRWRpdCwgU3RyaW5nUmVwbGFjZW1lbnQgfSBmcm9tICcuL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL3JhbmdlLmpzJztcbmltcG9ydCB7IFRleHRMZW5ndGggfSBmcm9tICcuLi90ZXh0L3RleHRMZW5ndGguanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUZXh0LCBTdHJpbmdUZXh0IH0gZnJvbSAnLi4vdGV4dC9hYnN0cmFjdFRleHQuanMnO1xuaW1wb3J0IHsgSUVxdWF0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2VxdWFscy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXh0RWRpdCB7XG5cdHB1YmxpYyBzdGF0aWMgZnJvbVN0cmluZ0VkaXQoZWRpdDogQmFzZVN0cmluZ0VkaXQsIGluaXRpYWxTdGF0ZTogQWJzdHJhY3RUZXh0KTogVGV4dEVkaXQge1xuXHRcdGNvbnN0IGVkaXRzID0gZWRpdC5yZXBsYWNlbWVudHMubWFwKGUgPT4gVGV4dFJlcGxhY2VtZW50LmZyb21TdHJpbmdSZXBsYWNlbWVudChlLCBpbml0aWFsU3RhdGUpKTtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KGVkaXRzKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVwbGFjZShvcmlnaW5hbFJhbmdlOiBSYW5nZSwgbmV3VGV4dDogc3RyaW5nKTogVGV4dEVkaXQge1xuXHRcdHJldHVybiBuZXcgVGV4dEVkaXQoW25ldyBUZXh0UmVwbGFjZW1lbnQob3JpZ2luYWxSYW5nZSwgbmV3VGV4dCldKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZGVsZXRlKHJhbmdlOiBSYW5nZSk6IFRleHRFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KFtuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCAnJyldKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaW5zZXJ0KHBvc2l0aW9uOiBQb3NpdGlvbiwgbmV3VGV4dDogc3RyaW5nKTogVGV4dEVkaXQge1xuXHRcdHJldHVybiBuZXcgVGV4dEVkaXQoW25ldyBUZXh0UmVwbGFjZW1lbnQoUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbiwgcG9zaXRpb24pLCBuZXdUZXh0KV0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tUGFyYWxsZWxSZXBsYWNlbWVudHNVbnNvcnRlZChyZXBsYWNlbWVudHM6IHJlYWRvbmx5IFRleHRSZXBsYWNlbWVudFtdKTogVGV4dEVkaXQge1xuXHRcdGNvbnN0IHIgPSByZXBsYWNlbWVudHMuc2xpY2UoKS5zb3J0KGNvbXBhcmVCeShpID0+IGkucmFuZ2UsIFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cykpO1xuXHRcdHJldHVybiBuZXcgVGV4dEVkaXQocik7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVwbGFjZW1lbnRzOiByZWFkb25seSBUZXh0UmVwbGFjZW1lbnRbXVxuXHQpIHtcblx0XHRhc3NlcnRGbigoKSA9PiBjaGVja0FkamFjZW50SXRlbXMocmVwbGFjZW1lbnRzLCAoYSwgYikgPT4gYS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLmlzQmVmb3JlT3JFcXVhbChiLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBKb2lucyB0b3VjaGluZyBlZGl0cyBhbmQgcmVtb3ZlcyBlbXB0eSBlZGl0cy5cblx0ICovXG5cdG5vcm1hbGl6ZSgpOiBUZXh0RWRpdCB7XG5cdFx0Y29uc3QgcmVwbGFjZW1lbnRzOiBUZXh0UmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgciBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0aWYgKHJlcGxhY2VtZW50cy5sZW5ndGggPiAwICYmIHJlcGxhY2VtZW50c1tyZXBsYWNlbWVudHMubGVuZ3RoIC0gMV0ucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKS5lcXVhbHMoci5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3QgPSByZXBsYWNlbWVudHNbcmVwbGFjZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRyZXBsYWNlbWVudHNbcmVwbGFjZW1lbnRzLmxlbmd0aCAtIDFdID0gbmV3IFRleHRSZXBsYWNlbWVudChsYXN0LnJhbmdlLnBsdXNSYW5nZShyLnJhbmdlKSwgbGFzdC50ZXh0ICsgci50ZXh0KTtcblx0XHRcdH0gZWxzZSBpZiAoIXIuaXNFbXB0eSkge1xuXHRcdFx0XHRyZXBsYWNlbWVudHMucHVzaChyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBUZXh0RWRpdChyZXBsYWNlbWVudHMpO1xuXHR9XG5cblx0bWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24gfCBSYW5nZSB7XG5cdFx0bGV0IGxpbmVEZWx0YSA9IDA7XG5cdFx0bGV0IGN1ckxpbmUgPSAwO1xuXHRcdGxldCBjb2x1bW5EZWx0YUluQ3VyTGluZSA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IHJlcGxhY2VtZW50LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblxuXHRcdFx0aWYgKHBvc2l0aW9uLmlzQmVmb3JlT3JFcXVhbChzdGFydCkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVuZCA9IHJlcGxhY2VtZW50LnJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBsZW4gPSBUZXh0TGVuZ3RoLm9mVGV4dChyZXBsYWNlbWVudC50ZXh0KTtcblx0XHRcdGlmIChwb3NpdGlvbi5pc0JlZm9yZShlbmQpKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0UG9zID0gbmV3IFBvc2l0aW9uKHN0YXJ0LmxpbmVOdW1iZXIgKyBsaW5lRGVsdGEsIHN0YXJ0LmNvbHVtbiArIChzdGFydC5saW5lTnVtYmVyICsgbGluZURlbHRhID09PSBjdXJMaW5lID8gY29sdW1uRGVsdGFJbkN1ckxpbmUgOiAwKSk7XG5cdFx0XHRcdGNvbnN0IGVuZFBvcyA9IGxlbi5hZGRUb1Bvc2l0aW9uKHN0YXJ0UG9zKTtcblx0XHRcdFx0cmV0dXJuIHJhbmdlRnJvbVBvc2l0aW9ucyhzdGFydFBvcywgZW5kUG9zKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXJ0LmxpbmVOdW1iZXIgKyBsaW5lRGVsdGEgIT09IGN1ckxpbmUpIHtcblx0XHRcdFx0Y29sdW1uRGVsdGFJbkN1ckxpbmUgPSAwO1xuXHRcdFx0fVxuXG5cdFx0XHRsaW5lRGVsdGEgKz0gbGVuLmxpbmVDb3VudCAtIChyZXBsYWNlbWVudC5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gcmVwbGFjZW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblxuXHRcdFx0aWYgKGxlbi5saW5lQ291bnQgPT09IDApIHtcblx0XHRcdFx0aWYgKGVuZC5saW5lTnVtYmVyICE9PSBzdGFydC5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Y29sdW1uRGVsdGFJbkN1ckxpbmUgKz0gbGVuLmNvbHVtbkNvdW50IC0gKGVuZC5jb2x1bW4gLSAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb2x1bW5EZWx0YUluQ3VyTGluZSArPSBsZW4uY29sdW1uQ291bnQgLSAoZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbHVtbkRlbHRhSW5DdXJMaW5lID0gbGVuLmNvbHVtbkNvdW50O1xuXHRcdFx0fVxuXHRcdFx0Y3VyTGluZSA9IGVuZC5saW5lTnVtYmVyICsgbGluZURlbHRhO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24ocG9zaXRpb24ubGluZU51bWJlciArIGxpbmVEZWx0YSwgcG9zaXRpb24uY29sdW1uICsgKHBvc2l0aW9uLmxpbmVOdW1iZXIgKyBsaW5lRGVsdGEgPT09IGN1ckxpbmUgPyBjb2x1bW5EZWx0YUluQ3VyTGluZSA6IDApKTtcblx0fVxuXG5cdG1hcFJhbmdlKHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcblx0XHRmdW5jdGlvbiBnZXRTdGFydChwOiBQb3NpdGlvbiB8IFJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gcCBpbnN0YW5jZW9mIFBvc2l0aW9uID8gcCA6IHAuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldEVuZChwOiBQb3NpdGlvbiB8IFJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gcCBpbnN0YW5jZW9mIFBvc2l0aW9uID8gcCA6IHAuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydCA9IGdldFN0YXJ0KHRoaXMubWFwUG9zaXRpb24ocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSk7XG5cdFx0Y29uc3QgZW5kID0gZ2V0RW5kKHRoaXMubWFwUG9zaXRpb24ocmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSkpO1xuXG5cdFx0cmV0dXJuIHJhbmdlRnJvbVBvc2l0aW9ucyhzdGFydCwgZW5kKTtcblx0fVxuXG5cdC8vIFRPRE86IGBkb2NgIGlzIG5vdCBuZWVkZWQgZm9yIHRoaXMhXG5cdGludmVyc2VNYXBQb3NpdGlvbihwb3NpdGlvbkFmdGVyRWRpdDogUG9zaXRpb24sIGRvYzogQWJzdHJhY3RUZXh0KTogUG9zaXRpb24gfCBSYW5nZSB7XG5cdFx0Y29uc3QgcmV2ZXJzZWQgPSB0aGlzLmludmVyc2UoZG9jKTtcblx0XHRyZXR1cm4gcmV2ZXJzZWQubWFwUG9zaXRpb24ocG9zaXRpb25BZnRlckVkaXQpO1xuXHR9XG5cblx0aW52ZXJzZU1hcFJhbmdlKHJhbmdlOiBSYW5nZSwgZG9jOiBBYnN0cmFjdFRleHQpOiBSYW5nZSB7XG5cdFx0Y29uc3QgcmV2ZXJzZWQgPSB0aGlzLmludmVyc2UoZG9jKTtcblx0XHRyZXR1cm4gcmV2ZXJzZWQubWFwUmFuZ2UocmFuZ2UpO1xuXHR9XG5cblx0YXBwbHkodGV4dDogQWJzdHJhY3RUZXh0KTogc3RyaW5nIHtcblx0XHRsZXQgcmVzdWx0ID0gJyc7XG5cdFx0bGV0IGxhc3RFZGl0RW5kID0gbmV3IFBvc2l0aW9uKDEsIDEpO1xuXHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGNvbnN0IGVkaXRSYW5nZSA9IHJlcGxhY2VtZW50LnJhbmdlO1xuXHRcdFx0Y29uc3QgZWRpdFN0YXJ0ID0gZWRpdFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IGVkaXRFbmQgPSBlZGl0UmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblxuXHRcdFx0Y29uc3QgciA9IHJhbmdlRnJvbVBvc2l0aW9ucyhsYXN0RWRpdEVuZCwgZWRpdFN0YXJ0KTtcblx0XHRcdGlmICghci5pc0VtcHR5KCkpIHtcblx0XHRcdFx0cmVzdWx0ICs9IHRleHQuZ2V0VmFsdWVPZlJhbmdlKHIpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0ICs9IHJlcGxhY2VtZW50LnRleHQ7XG5cdFx0XHRsYXN0RWRpdEVuZCA9IGVkaXRFbmQ7XG5cdFx0fVxuXHRcdGNvbnN0IHIgPSByYW5nZUZyb21Qb3NpdGlvbnMobGFzdEVkaXRFbmQsIHRleHQuZW5kUG9zaXRpb25FeGNsdXNpdmUpO1xuXHRcdGlmICghci5pc0VtcHR5KCkpIHtcblx0XHRcdHJlc3VsdCArPSB0ZXh0LmdldFZhbHVlT2ZSYW5nZShyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFwcGx5VG9TdHJpbmcoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0clRleHQgPSBuZXcgU3RyaW5nVGV4dChzdHIpO1xuXHRcdHJldHVybiB0aGlzLmFwcGx5KHN0clRleHQpO1xuXHR9XG5cblx0aW52ZXJzZShkb2M6IEFic3RyYWN0VGV4dCk6IFRleHRFZGl0IHtcblx0XHRjb25zdCByYW5nZXMgPSB0aGlzLmdldE5ld1JhbmdlcygpO1xuXHRcdHJldHVybiBuZXcgVGV4dEVkaXQodGhpcy5yZXBsYWNlbWVudHMubWFwKChlLCBpZHgpID0+IG5ldyBUZXh0UmVwbGFjZW1lbnQocmFuZ2VzW2lkeF0sIGRvYy5nZXRWYWx1ZU9mUmFuZ2UoZS5yYW5nZSkpKSk7XG5cdH1cblxuXHRnZXROZXdSYW5nZXMoKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgbmV3UmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdFx0bGV0IHByZXZpb3VzRWRpdEVuZExpbmVOdW1iZXIgPSAwO1xuXHRcdGxldCBsaW5lT2Zmc2V0ID0gMDtcblx0XHRsZXQgY29sdW1uT2Zmc2V0ID0gMDtcblx0XHRmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRjb25zdCB0ZXh0TGVuZ3RoID0gVGV4dExlbmd0aC5vZlRleHQocmVwbGFjZW1lbnQudGV4dCk7XG5cdFx0XHRjb25zdCBuZXdSYW5nZVN0YXJ0ID0gUG9zaXRpb24ubGlmdCh7XG5cdFx0XHRcdGxpbmVOdW1iZXI6IHJlcGxhY2VtZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlciArIGxpbmVPZmZzZXQsXG5cdFx0XHRcdGNvbHVtbjogcmVwbGFjZW1lbnQucmFuZ2Uuc3RhcnRDb2x1bW4gKyAocmVwbGFjZW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBwcmV2aW91c0VkaXRFbmRMaW5lTnVtYmVyID8gY29sdW1uT2Zmc2V0IDogMClcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbmV3UmFuZ2UgPSB0ZXh0TGVuZ3RoLmNyZWF0ZVJhbmdlKG5ld1JhbmdlU3RhcnQpO1xuXHRcdFx0bmV3UmFuZ2VzLnB1c2gobmV3UmFuZ2UpO1xuXHRcdFx0bGluZU9mZnNldCA9IG5ld1JhbmdlLmVuZExpbmVOdW1iZXIgLSByZXBsYWNlbWVudC5yYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0Y29sdW1uT2Zmc2V0ID0gbmV3UmFuZ2UuZW5kQ29sdW1uIC0gcmVwbGFjZW1lbnQucmFuZ2UuZW5kQ29sdW1uO1xuXHRcdFx0cHJldmlvdXNFZGl0RW5kTGluZU51bWJlciA9IHJlcGxhY2VtZW50LnJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0fVxuXHRcdHJldHVybiBuZXdSYW5nZXM7XG5cdH1cblxuXHR0b1JlcGxhY2VtZW50KHRleHQ6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudCB7XG5cdFx0aWYgKHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkgeyB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCk7IH1cblx0XHRpZiAodGhpcy5yZXBsYWNlbWVudHMubGVuZ3RoID09PSAxKSB7IHJldHVybiB0aGlzLnJlcGxhY2VtZW50c1swXTsgfVxuXG5cdFx0Y29uc3Qgc3RhcnRQb3MgPSB0aGlzLnJlcGxhY2VtZW50c1swXS5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgZW5kUG9zID0gdGhpcy5yZXBsYWNlbWVudHNbdGhpcy5yZXBsYWNlbWVudHMubGVuZ3RoIC0gMV0ucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblxuXHRcdGxldCBuZXdUZXh0ID0gJyc7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJFZGl0ID0gdGhpcy5yZXBsYWNlbWVudHNbaV07XG5cdFx0XHRuZXdUZXh0ICs9IGN1ckVkaXQudGV4dDtcblx0XHRcdGlmIChpIDwgdGhpcy5yZXBsYWNlbWVudHMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRjb25zdCBuZXh0RWRpdCA9IHRoaXMucmVwbGFjZW1lbnRzW2kgKyAxXTtcblx0XHRcdFx0Y29uc3QgZ2FwUmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGN1ckVkaXQucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgbmV4dEVkaXQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdFx0Y29uc3QgZ2FwVGV4dCA9IHRleHQuZ2V0VmFsdWVPZlJhbmdlKGdhcFJhbmdlKTtcblx0XHRcdFx0bmV3VGV4dCArPSBnYXBUZXh0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFRleHRSZXBsYWNlbWVudChSYW5nZS5mcm9tUG9zaXRpb25zKHN0YXJ0UG9zLCBlbmRQb3MpLCBuZXdUZXh0KTtcblx0fVxuXG5cdGVxdWFscyhvdGhlcjogVGV4dEVkaXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZXF1YWxzKHRoaXMucmVwbGFjZW1lbnRzLCBvdGhlci5yZXBsYWNlbWVudHMsIChhLCBiKSA9PiBhLmVxdWFscyhiKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tYmluZXMgdHdvIGVkaXRzIGludG8gb25lIHdpdGggdGhlIHNhbWUgZWZmZWN0LlxuXHQgKiBXQVJOSU5HOiBUaGlzIGlzIHdyaXR0ZW4gYnkgQUksIGJ1dCB3ZWxsIHRlc3RlZC4gSSBkbyBub3QgdW5kZXJzdGFuZCB0aGUgaW1wbGVtZW50YXRpb24gbXlzZWxmLlxuXHQgKlxuXHQgKiBJbnZhcmlhbnQ6XG5cdCAqIGBgYFxuXHQgKiBvdGhlci5hcHBseVRvU3RyaW5nKHRoaXMuYXBwbHlUb1N0cmluZyhzMCkpID0gdGhpcy5jb21wb3NlKG90aGVyKS5hcHBseVRvU3RyaW5nKHMwKVxuXHQgKiBgYGBcblx0ICovXG5cdGNvbXBvc2Uob3RoZXI6IFRleHRFZGl0KTogVGV4dEVkaXQge1xuXHRcdGNvbnN0IGVkaXRzMSA9IHRoaXMubm9ybWFsaXplKCk7XG5cdFx0Y29uc3QgZWRpdHMyID0gb3RoZXIubm9ybWFsaXplKCk7XG5cblx0XHRpZiAoZWRpdHMxLnJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHsgcmV0dXJuIGVkaXRzMjsgfVxuXHRcdGlmIChlZGl0czIucmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm4gZWRpdHMxOyB9XG5cblx0XHRjb25zdCByZXN1bHRSZXBsYWNlbWVudHM6IFRleHRSZXBsYWNlbWVudFtdID0gW107XG5cblx0XHRsZXQgZWRpdDFJZHggPSAwO1xuXHRcdGxldCBsYXN0RWRpdDFFbmRTMExpbmUgPSAxO1xuXHRcdGxldCBsYXN0RWRpdDFFbmRTMENvbCA9IDE7XG5cblx0XHRsZXQgaGVhZFNyY1JhbmdlU3RhcnRMaW5lID0gMDtcblx0XHRsZXQgaGVhZFNyY1JhbmdlU3RhcnRDb2wgPSAwO1xuXHRcdGxldCBoZWFkU3JjUmFuZ2VFbmRMaW5lID0gMDtcblx0XHRsZXQgaGVhZFNyY1JhbmdlRW5kQ29sID0gMDtcblx0XHRsZXQgaGVhZFRleHQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBoZWFkTGVuZ3RoTGluZSA9IDA7XG5cdFx0bGV0IGhlYWRMZW5ndGhDb2wgPSAwO1xuXG5cdFx0bGV0IGhlYWRIYXNWYWx1ZSA9IGZhbHNlO1xuXHRcdGxldCBoZWFkSXNJbmZpbml0ZSA9IGZhbHNlO1xuXG5cdFx0bGV0IGN1cnJlbnRQb3NJblMxTGluZSA9IDE7XG5cdFx0bGV0IGN1cnJlbnRQb3NJblMxQ29sID0gMTtcblxuXHRcdGZ1bmN0aW9uIGVuc3VyZUhlYWQoKSB7XG5cdFx0XHRpZiAoaGVhZEhhc1ZhbHVlKSB7IHJldHVybjsgfVxuXG5cdFx0XHRpZiAoZWRpdDFJZHggPCBlZGl0czEucmVwbGFjZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBuZXh0RWRpdCA9IGVkaXRzMS5yZXBsYWNlbWVudHNbZWRpdDFJZHhdO1xuXHRcdFx0XHRjb25zdCBuZXh0RWRpdFN0YXJ0ID0gbmV4dEVkaXQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXG5cdFx0XHRcdGNvbnN0IGdhcElzRW1wdHkgPSAobGFzdEVkaXQxRW5kUzBMaW5lID09PSBuZXh0RWRpdFN0YXJ0LmxpbmVOdW1iZXIpICYmIChsYXN0RWRpdDFFbmRTMENvbCA9PT0gbmV4dEVkaXRTdGFydC5jb2x1bW4pO1xuXG5cdFx0XHRcdGlmICghZ2FwSXNFbXB0eSkge1xuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IGxhc3RFZGl0MUVuZFMwTGluZTtcblx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydENvbCA9IGxhc3RFZGl0MUVuZFMwQ29sO1xuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZUVuZExpbmUgPSBuZXh0RWRpdFN0YXJ0LmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0aGVhZFNyY1JhbmdlRW5kQ29sID0gbmV4dEVkaXRTdGFydC5jb2x1bW47XG5cblx0XHRcdFx0XHRoZWFkVGV4dCA9IG51bGw7XG5cblx0XHRcdFx0XHRpZiAobGFzdEVkaXQxRW5kUzBMaW5lID09PSBuZXh0RWRpdFN0YXJ0LmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhMaW5lID0gMDtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhDb2wgPSBuZXh0RWRpdFN0YXJ0LmNvbHVtbiAtIGxhc3RFZGl0MUVuZFMwQ29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRoZWFkTGVuZ3RoTGluZSA9IG5leHRFZGl0U3RhcnQubGluZU51bWJlciAtIGxhc3RFZGl0MUVuZFMwTGluZTtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhDb2wgPSBuZXh0RWRpdFN0YXJ0LmNvbHVtbiAtIDE7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aGVhZEhhc1ZhbHVlID0gdHJ1ZTtcblx0XHRcdFx0XHRsYXN0RWRpdDFFbmRTMExpbmUgPSBuZXh0RWRpdFN0YXJ0LmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0bGFzdEVkaXQxRW5kUzBDb2wgPSBuZXh0RWRpdFN0YXJ0LmNvbHVtbjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBuZXh0RWRpdEVuZCA9IG5leHRFZGl0LnJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRMaW5lID0gbmV4dEVkaXRTdGFydC5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0Q29sID0gbmV4dEVkaXRTdGFydC5jb2x1bW47XG5cdFx0XHRcdFx0aGVhZFNyY1JhbmdlRW5kTGluZSA9IG5leHRFZGl0RW5kLmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0aGVhZFNyY1JhbmdlRW5kQ29sID0gbmV4dEVkaXRFbmQuY29sdW1uO1xuXG5cdFx0XHRcdFx0aGVhZFRleHQgPSBuZXh0RWRpdC50ZXh0O1xuXG5cdFx0XHRcdFx0bGV0IGxpbmUgPSAwO1xuXHRcdFx0XHRcdGxldCBjb2x1bW4gPSAwO1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBuZXh0RWRpdC50ZXh0O1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0aWYgKHRleHQuY2hhckNvZGVBdChpKSA9PT0gMTApIHtcblx0XHRcdFx0XHRcdFx0bGluZSsrO1xuXHRcdFx0XHRcdFx0XHRjb2x1bW4gPSAwO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29sdW1uKys7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGhlYWRMZW5ndGhMaW5lID0gbGluZTtcblx0XHRcdFx0XHRoZWFkTGVuZ3RoQ29sID0gY29sdW1uO1xuXG5cdFx0XHRcdFx0aGVhZEhhc1ZhbHVlID0gdHJ1ZTtcblx0XHRcdFx0XHRsYXN0RWRpdDFFbmRTMExpbmUgPSBuZXh0RWRpdEVuZC5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGxhc3RFZGl0MUVuZFMwQ29sID0gbmV4dEVkaXRFbmQuY29sdW1uO1xuXHRcdFx0XHRcdGVkaXQxSWR4Kys7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhlYWRJc0luZmluaXRlID0gdHJ1ZTtcblx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRMaW5lID0gbGFzdEVkaXQxRW5kUzBMaW5lO1xuXHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydENvbCA9IGxhc3RFZGl0MUVuZFMwQ29sO1xuXHRcdFx0XHRoZWFkSGFzVmFsdWUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNwbGl0VGV4dCh0ZXh0OiBzdHJpbmcsIGxlbkxpbmU6IG51bWJlciwgbGVuQ29sOiBudW1iZXIpOiBbc3RyaW5nLCBzdHJpbmddIHtcblx0XHRcdGlmIChsZW5MaW5lID09PSAwICYmIGxlbkNvbCA9PT0gMCkgeyByZXR1cm4gWycnLCB0ZXh0XTsgfVxuXHRcdFx0bGV0IGxpbmUgPSAwO1xuXHRcdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0XHR3aGlsZSAobGluZSA8IGxlbkxpbmUpIHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGV4dC5pbmRleE9mKCdcXG4nLCBvZmZzZXQpO1xuXHRcdFx0XHRpZiAoaWR4ID09PSAtMSkgeyB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdUZXh0IGxlbmd0aCBtaXNtYXRjaCcpOyB9XG5cdFx0XHRcdG9mZnNldCA9IGlkeCArIDE7XG5cdFx0XHRcdGxpbmUrKztcblx0XHRcdH1cblx0XHRcdG9mZnNldCArPSBsZW5Db2w7XG5cdFx0XHRyZXR1cm4gW3RleHQuc3Vic3RyaW5nKDAsIG9mZnNldCksIHRleHQuc3Vic3RyaW5nKG9mZnNldCldO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcjIgb2YgZWRpdHMyLnJlcGxhY2VtZW50cykge1xuXHRcdFx0Y29uc3QgcjJTdGFydCA9IHIyLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IHIyRW5kID0gcjIucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblxuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRQb3NJblMxTGluZSA9PT0gcjJTdGFydC5saW5lTnVtYmVyICYmIGN1cnJlbnRQb3NJblMxQ29sID09PSByMlN0YXJ0LmNvbHVtbikgeyBicmVhazsgfVxuXHRcdFx0XHRlbnN1cmVIZWFkKCk7XG5cblx0XHRcdFx0aWYgKGhlYWRJc0luZmluaXRlKSB7XG5cdFx0XHRcdFx0bGV0IGRpc3RMaW5lOiBudW1iZXIsIGRpc3RDb2w6IG51bWJlcjtcblx0XHRcdFx0XHRpZiAoY3VycmVudFBvc0luUzFMaW5lID09PSByMlN0YXJ0LmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdGRpc3RMaW5lID0gMDtcblx0XHRcdFx0XHRcdGRpc3RDb2wgPSByMlN0YXJ0LmNvbHVtbiAtIGN1cnJlbnRQb3NJblMxQ29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkaXN0TGluZSA9IHIyU3RhcnQubGluZU51bWJlciAtIGN1cnJlbnRQb3NJblMxTGluZTtcblx0XHRcdFx0XHRcdGRpc3RDb2wgPSByMlN0YXJ0LmNvbHVtbiAtIDE7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y3VycmVudFBvc0luUzFMaW5lID0gcjJTdGFydC5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGN1cnJlbnRQb3NJblMxQ29sID0gcjJTdGFydC5jb2x1bW47XG5cblx0XHRcdFx0XHRpZiAoZGlzdExpbmUgPT09IDApIHtcblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0Q29sICs9IGRpc3RDb2w7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSArPSBkaXN0TGluZTtcblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0Q29sID0gZGlzdENvbCArIDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGhlYWRFbmRJblMxTGluZTogbnVtYmVyLCBoZWFkRW5kSW5TMUNvbDogbnVtYmVyO1xuXHRcdFx0XHRpZiAoaGVhZExlbmd0aExpbmUgPT09IDApIHtcblx0XHRcdFx0XHRoZWFkRW5kSW5TMUxpbmUgPSBjdXJyZW50UG9zSW5TMUxpbmU7XG5cdFx0XHRcdFx0aGVhZEVuZEluUzFDb2wgPSBjdXJyZW50UG9zSW5TMUNvbCArIGhlYWRMZW5ndGhDb2w7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGVhZEVuZEluUzFMaW5lID0gY3VycmVudFBvc0luUzFMaW5lICsgaGVhZExlbmd0aExpbmU7XG5cdFx0XHRcdFx0aGVhZEVuZEluUzFDb2wgPSBoZWFkTGVuZ3RoQ29sICsgMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCByMlN0YXJ0SXNCZWZvcmVIZWFkRW5kID0gZmFsc2U7XG5cdFx0XHRcdGlmIChyMlN0YXJ0LmxpbmVOdW1iZXIgPCBoZWFkRW5kSW5TMUxpbmUpIHtcblx0XHRcdFx0XHRyMlN0YXJ0SXNCZWZvcmVIZWFkRW5kID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChyMlN0YXJ0LmxpbmVOdW1iZXIgPT09IGhlYWRFbmRJblMxTGluZSkge1xuXHRcdFx0XHRcdHIyU3RhcnRJc0JlZm9yZUhlYWRFbmQgPSByMlN0YXJ0LmNvbHVtbiA8IGhlYWRFbmRJblMxQ29sO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHIyU3RhcnRJc0JlZm9yZUhlYWRFbmQpIHtcblx0XHRcdFx0XHRsZXQgc3BsaXRMZW5MaW5lOiBudW1iZXIsIHNwbGl0TGVuQ29sOiBudW1iZXI7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRQb3NJblMxTGluZSA9PT0gcjJTdGFydC5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRzcGxpdExlbkxpbmUgPSAwO1xuXHRcdFx0XHRcdFx0c3BsaXRMZW5Db2wgPSByMlN0YXJ0LmNvbHVtbiAtIGN1cnJlbnRQb3NJblMxQ29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzcGxpdExlbkxpbmUgPSByMlN0YXJ0LmxpbmVOdW1iZXIgLSBjdXJyZW50UG9zSW5TMUxpbmU7XG5cdFx0XHRcdFx0XHRzcGxpdExlbkNvbCA9IHIyU3RhcnQuY29sdW1uIC0gMTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgcmVtYWluaW5nTGVuTGluZTogbnVtYmVyLCByZW1haW5pbmdMZW5Db2w6IG51bWJlcjtcblx0XHRcdFx0XHRpZiAoc3BsaXRMZW5MaW5lID09PSBoZWFkTGVuZ3RoTGluZSkge1xuXHRcdFx0XHRcdFx0cmVtYWluaW5nTGVuTGluZSA9IDA7XG5cdFx0XHRcdFx0XHRyZW1haW5pbmdMZW5Db2wgPSBoZWFkTGVuZ3RoQ29sIC0gc3BsaXRMZW5Db2w7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlbWFpbmluZ0xlbkxpbmUgPSBoZWFkTGVuZ3RoTGluZSAtIHNwbGl0TGVuTGluZTtcblx0XHRcdFx0XHRcdHJlbWFpbmluZ0xlbkNvbCA9IGhlYWRMZW5ndGhDb2w7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGhlYWRUZXh0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBbdDEsIHQyXSA9IHNwbGl0VGV4dChoZWFkVGV4dCwgc3BsaXRMZW5MaW5lLCBzcGxpdExlbkNvbCk7XG5cdFx0XHRcdFx0XHRyZXN1bHRSZXBsYWNlbWVudHMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KG5ldyBSYW5nZShoZWFkU3JjUmFuZ2VTdGFydExpbmUsIGhlYWRTcmNSYW5nZVN0YXJ0Q29sLCBoZWFkU3JjUmFuZ2VFbmRMaW5lLCBoZWFkU3JjUmFuZ2VFbmRDb2wpLCB0MSkpO1xuXG5cdFx0XHRcdFx0XHRoZWFkVGV4dCA9IHQyO1xuXHRcdFx0XHRcdFx0aGVhZExlbmd0aExpbmUgPSByZW1haW5pbmdMZW5MaW5lO1xuXHRcdFx0XHRcdFx0aGVhZExlbmd0aENvbCA9IHJlbWFpbmluZ0xlbkNvbDtcblxuXHRcdFx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRMaW5lID0gaGVhZFNyY1JhbmdlRW5kTGluZTtcblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0Q29sID0gaGVhZFNyY1JhbmdlRW5kQ29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRsZXQgc3BsaXRQb3NMaW5lOiBudW1iZXIsIHNwbGl0UG9zQ29sOiBudW1iZXI7XG5cdFx0XHRcdFx0XHRpZiAoc3BsaXRMZW5MaW5lID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHNwbGl0UG9zTGluZSA9IGhlYWRTcmNSYW5nZVN0YXJ0TGluZTtcblx0XHRcdFx0XHRcdFx0c3BsaXRQb3NDb2wgPSBoZWFkU3JjUmFuZ2VTdGFydENvbCArIHNwbGl0TGVuQ29sO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c3BsaXRQb3NMaW5lID0gaGVhZFNyY1JhbmdlU3RhcnRMaW5lICsgc3BsaXRMZW5MaW5lO1xuXHRcdFx0XHRcdFx0XHRzcGxpdFBvc0NvbCA9IHNwbGl0TGVuQ29sICsgMTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRMaW5lID0gc3BsaXRQb3NMaW5lO1xuXHRcdFx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRDb2wgPSBzcGxpdFBvc0NvbDtcblxuXHRcdFx0XHRcdFx0aGVhZExlbmd0aExpbmUgPSByZW1haW5pbmdMZW5MaW5lO1xuXHRcdFx0XHRcdFx0aGVhZExlbmd0aENvbCA9IHJlbWFpbmluZ0xlbkNvbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y3VycmVudFBvc0luUzFMaW5lID0gcjJTdGFydC5saW5lTnVtYmVyO1xuXHRcdFx0XHRcdGN1cnJlbnRQb3NJblMxQ29sID0gcjJTdGFydC5jb2x1bW47XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaGVhZFRleHQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXN1bHRSZXBsYWNlbWVudHMucHVzaChuZXcgVGV4dFJlcGxhY2VtZW50KG5ldyBSYW5nZShoZWFkU3JjUmFuZ2VTdGFydExpbmUsIGhlYWRTcmNSYW5nZVN0YXJ0Q29sLCBoZWFkU3JjUmFuZ2VFbmRMaW5lLCBoZWFkU3JjUmFuZ2VFbmRDb2wpLCBoZWFkVGV4dCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y3VycmVudFBvc0luUzFMaW5lID0gaGVhZEVuZEluUzFMaW5lO1xuXHRcdFx0XHRjdXJyZW50UG9zSW5TMUNvbCA9IGhlYWRFbmRJblMxQ29sO1xuXHRcdFx0XHRoZWFkSGFzVmFsdWUgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGNvbnN1bWVkU3RhcnRTMExpbmU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IGNvbnN1bWVkU3RhcnRTMENvbDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRsZXQgY29uc3VtZWRFbmRTMExpbmU6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IGNvbnN1bWVkRW5kUzBDb2w6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRpZiAoY3VycmVudFBvc0luUzFMaW5lID09PSByMkVuZC5saW5lTnVtYmVyICYmIGN1cnJlbnRQb3NJblMxQ29sID09PSByMkVuZC5jb2x1bW4pIHsgYnJlYWs7IH1cblx0XHRcdFx0ZW5zdXJlSGVhZCgpO1xuXG5cdFx0XHRcdGlmIChoZWFkSXNJbmZpbml0ZSkge1xuXHRcdFx0XHRcdGxldCBkaXN0TGluZTogbnVtYmVyLCBkaXN0Q29sOiBudW1iZXI7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRQb3NJblMxTGluZSA9PT0gcjJFbmQubGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0ZGlzdExpbmUgPSAwO1xuXHRcdFx0XHRcdFx0ZGlzdENvbCA9IHIyRW5kLmNvbHVtbiAtIGN1cnJlbnRQb3NJblMxQ29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkaXN0TGluZSA9IHIyRW5kLmxpbmVOdW1iZXIgLSBjdXJyZW50UG9zSW5TMUxpbmU7XG5cdFx0XHRcdFx0XHRkaXN0Q29sID0gcjJFbmQuY29sdW1uIC0gMTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgcmFuZ2VJblMwRW5kTGluZTogbnVtYmVyLCByYW5nZUluUzBFbmRDb2w6IG51bWJlcjtcblx0XHRcdFx0XHRpZiAoZGlzdExpbmUgPT09IDApIHtcblx0XHRcdFx0XHRcdHJhbmdlSW5TMEVuZExpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmU7XG5cdFx0XHRcdFx0XHRyYW5nZUluUzBFbmRDb2wgPSBoZWFkU3JjUmFuZ2VTdGFydENvbCArIGRpc3RDb2w7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJhbmdlSW5TMEVuZExpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmUgKyBkaXN0TGluZTtcblx0XHRcdFx0XHRcdHJhbmdlSW5TMEVuZENvbCA9IGRpc3RDb2wgKyAxO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChjb25zdW1lZFN0YXJ0UzBMaW5lID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRjb25zdW1lZFN0YXJ0UzBMaW5lID0gaGVhZFNyY1JhbmdlU3RhcnRMaW5lO1xuXHRcdFx0XHRcdFx0Y29uc3VtZWRTdGFydFMwQ29sID0gaGVhZFNyY1JhbmdlU3RhcnRDb2w7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN1bWVkRW5kUzBMaW5lID0gcmFuZ2VJblMwRW5kTGluZTtcblx0XHRcdFx0XHRjb25zdW1lZEVuZFMwQ29sID0gcmFuZ2VJblMwRW5kQ29sO1xuXG5cdFx0XHRcdFx0Y3VycmVudFBvc0luUzFMaW5lID0gcjJFbmQubGluZU51bWJlcjtcblx0XHRcdFx0XHRjdXJyZW50UG9zSW5TMUNvbCA9IHIyRW5kLmNvbHVtbjtcblxuXHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IHJhbmdlSW5TMEVuZExpbmU7XG5cdFx0XHRcdFx0aGVhZFNyY1JhbmdlU3RhcnRDb2wgPSByYW5nZUluUzBFbmRDb2w7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgaGVhZEVuZEluUzFMaW5lOiBudW1iZXIsIGhlYWRFbmRJblMxQ29sOiBudW1iZXI7XG5cdFx0XHRcdGlmIChoZWFkTGVuZ3RoTGluZSA9PT0gMCkge1xuXHRcdFx0XHRcdGhlYWRFbmRJblMxTGluZSA9IGN1cnJlbnRQb3NJblMxTGluZTtcblx0XHRcdFx0XHRoZWFkRW5kSW5TMUNvbCA9IGN1cnJlbnRQb3NJblMxQ29sICsgaGVhZExlbmd0aENvbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRoZWFkRW5kSW5TMUxpbmUgPSBjdXJyZW50UG9zSW5TMUxpbmUgKyBoZWFkTGVuZ3RoTGluZTtcblx0XHRcdFx0XHRoZWFkRW5kSW5TMUNvbCA9IGhlYWRMZW5ndGhDb2wgKyAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHIyRW5kSXNCZWZvcmVIZWFkRW5kID0gZmFsc2U7XG5cdFx0XHRcdGlmIChyMkVuZC5saW5lTnVtYmVyIDwgaGVhZEVuZEluUzFMaW5lKSB7XG5cdFx0XHRcdFx0cjJFbmRJc0JlZm9yZUhlYWRFbmQgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHIyRW5kLmxpbmVOdW1iZXIgPT09IGhlYWRFbmRJblMxTGluZSkge1xuXHRcdFx0XHRcdHIyRW5kSXNCZWZvcmVIZWFkRW5kID0gcjJFbmQuY29sdW1uIDwgaGVhZEVuZEluUzFDb2w7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocjJFbmRJc0JlZm9yZUhlYWRFbmQpIHtcblx0XHRcdFx0XHRsZXQgc3BsaXRMZW5MaW5lOiBudW1iZXIsIHNwbGl0TGVuQ29sOiBudW1iZXI7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRQb3NJblMxTGluZSA9PT0gcjJFbmQubGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0c3BsaXRMZW5MaW5lID0gMDtcblx0XHRcdFx0XHRcdHNwbGl0TGVuQ29sID0gcjJFbmQuY29sdW1uIC0gY3VycmVudFBvc0luUzFDb2w7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNwbGl0TGVuTGluZSA9IHIyRW5kLmxpbmVOdW1iZXIgLSBjdXJyZW50UG9zSW5TMUxpbmU7XG5cdFx0XHRcdFx0XHRzcGxpdExlbkNvbCA9IHIyRW5kLmNvbHVtbiAtIDE7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IHJlbWFpbmluZ0xlbkxpbmU6IG51bWJlciwgcmVtYWluaW5nTGVuQ29sOiBudW1iZXI7XG5cdFx0XHRcdFx0aWYgKHNwbGl0TGVuTGluZSA9PT0gaGVhZExlbmd0aExpbmUpIHtcblx0XHRcdFx0XHRcdHJlbWFpbmluZ0xlbkxpbmUgPSAwO1xuXHRcdFx0XHRcdFx0cmVtYWluaW5nTGVuQ29sID0gaGVhZExlbmd0aENvbCAtIHNwbGl0TGVuQ29sO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZW1haW5pbmdMZW5MaW5lID0gaGVhZExlbmd0aExpbmUgLSBzcGxpdExlbkxpbmU7XG5cdFx0XHRcdFx0XHRyZW1haW5pbmdMZW5Db2wgPSBoZWFkTGVuZ3RoQ29sO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChoZWFkVGV4dCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0aWYgKGNvbnN1bWVkU3RhcnRTMExpbmUgPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3VtZWRTdGFydFMwTGluZSA9IGhlYWRTcmNSYW5nZVN0YXJ0TGluZTtcblx0XHRcdFx0XHRcdFx0Y29uc3VtZWRTdGFydFMwQ29sID0gaGVhZFNyY1JhbmdlU3RhcnRDb2w7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdW1lZEVuZFMwTGluZSA9IGhlYWRTcmNSYW5nZUVuZExpbmU7XG5cdFx0XHRcdFx0XHRjb25zdW1lZEVuZFMwQ29sID0gaGVhZFNyY1JhbmdlRW5kQ29sO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBbLCB0Ml0gPSBzcGxpdFRleHQoaGVhZFRleHQsIHNwbGl0TGVuTGluZSwgc3BsaXRMZW5Db2wpO1xuXHRcdFx0XHRcdFx0aGVhZFRleHQgPSB0Mjtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhMaW5lID0gcmVtYWluaW5nTGVuTGluZTtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhDb2wgPSByZW1haW5pbmdMZW5Db2w7XG5cblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IGhlYWRTcmNSYW5nZUVuZExpbmU7XG5cdFx0XHRcdFx0XHRoZWFkU3JjUmFuZ2VTdGFydENvbCA9IGhlYWRTcmNSYW5nZUVuZENvbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGV0IHNwbGl0UG9zTGluZTogbnVtYmVyLCBzcGxpdFBvc0NvbDogbnVtYmVyO1xuXHRcdFx0XHRcdFx0aWYgKHNwbGl0TGVuTGluZSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRzcGxpdFBvc0xpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmU7XG5cdFx0XHRcdFx0XHRcdHNwbGl0UG9zQ29sID0gaGVhZFNyY1JhbmdlU3RhcnRDb2wgKyBzcGxpdExlbkNvbDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNwbGl0UG9zTGluZSA9IGhlYWRTcmNSYW5nZVN0YXJ0TGluZSArIHNwbGl0TGVuTGluZTtcblx0XHRcdFx0XHRcdFx0c3BsaXRQb3NDb2wgPSBzcGxpdExlbkNvbCArIDE7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChjb25zdW1lZFN0YXJ0UzBMaW5lID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN1bWVkU3RhcnRTMExpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmU7XG5cdFx0XHRcdFx0XHRcdGNvbnN1bWVkU3RhcnRTMENvbCA9IGhlYWRTcmNSYW5nZVN0YXJ0Q29sO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3VtZWRFbmRTMExpbmUgPSBzcGxpdFBvc0xpbmU7XG5cdFx0XHRcdFx0XHRjb25zdW1lZEVuZFMwQ29sID0gc3BsaXRQb3NDb2w7XG5cblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0TGluZSA9IHNwbGl0UG9zTGluZTtcblx0XHRcdFx0XHRcdGhlYWRTcmNSYW5nZVN0YXJ0Q29sID0gc3BsaXRQb3NDb2w7XG5cblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhMaW5lID0gcmVtYWluaW5nTGVuTGluZTtcblx0XHRcdFx0XHRcdGhlYWRMZW5ndGhDb2wgPSByZW1haW5pbmdMZW5Db2w7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGN1cnJlbnRQb3NJblMxTGluZSA9IHIyRW5kLmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0Y3VycmVudFBvc0luUzFDb2wgPSByMkVuZC5jb2x1bW47XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY29uc3VtZWRTdGFydFMwTGluZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdGNvbnN1bWVkU3RhcnRTMExpbmUgPSBoZWFkU3JjUmFuZ2VTdGFydExpbmU7XG5cdFx0XHRcdFx0Y29uc3VtZWRTdGFydFMwQ29sID0gaGVhZFNyY1JhbmdlU3RhcnRDb2w7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3VtZWRFbmRTMExpbmUgPSBoZWFkU3JjUmFuZ2VFbmRMaW5lO1xuXHRcdFx0XHRjb25zdW1lZEVuZFMwQ29sID0gaGVhZFNyY1JhbmdlRW5kQ29sO1xuXG5cdFx0XHRcdGN1cnJlbnRQb3NJblMxTGluZSA9IGhlYWRFbmRJblMxTGluZTtcblx0XHRcdFx0Y3VycmVudFBvc0luUzFDb2wgPSBoZWFkRW5kSW5TMUNvbDtcblx0XHRcdFx0aGVhZEhhc1ZhbHVlID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25zdW1lZFN0YXJ0UzBMaW5lICE9PSBudWxsKSB7XG5cdFx0XHRcdHJlc3VsdFJlcGxhY2VtZW50cy5wdXNoKG5ldyBUZXh0UmVwbGFjZW1lbnQobmV3IFJhbmdlKGNvbnN1bWVkU3RhcnRTMExpbmUsIGNvbnN1bWVkU3RhcnRTMENvbCEsIGNvbnN1bWVkRW5kUzBMaW5lISwgY29uc3VtZWRFbmRTMENvbCEpLCByMi50ZXh0KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnN1cmVIZWFkKCk7XG5cdFx0XHRcdGNvbnN0IGluc2VydFBvc1MwTGluZSA9IGhlYWRTcmNSYW5nZVN0YXJ0TGluZTtcblx0XHRcdFx0Y29uc3QgaW5zZXJ0UG9zUzBDb2wgPSBoZWFkU3JjUmFuZ2VTdGFydENvbDtcblx0XHRcdFx0cmVzdWx0UmVwbGFjZW1lbnRzLnB1c2gobmV3IFRleHRSZXBsYWNlbWVudChuZXcgUmFuZ2UoaW5zZXJ0UG9zUzBMaW5lLCBpbnNlcnRQb3NTMENvbCwgaW5zZXJ0UG9zUzBMaW5lLCBpbnNlcnRQb3NTMENvbCksIHIyLnRleHQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0ZW5zdXJlSGVhZCgpO1xuXHRcdFx0aWYgKGhlYWRJc0luZmluaXRlKSB7IGJyZWFrOyB9XG5cdFx0XHRpZiAoaGVhZFRleHQgIT09IG51bGwpIHtcblx0XHRcdFx0cmVzdWx0UmVwbGFjZW1lbnRzLnB1c2gobmV3IFRleHRSZXBsYWNlbWVudChuZXcgUmFuZ2UoaGVhZFNyY1JhbmdlU3RhcnRMaW5lLCBoZWFkU3JjUmFuZ2VTdGFydENvbCwgaGVhZFNyY1JhbmdlRW5kTGluZSwgaGVhZFNyY1JhbmdlRW5kQ29sKSwgaGVhZFRleHQpKTtcblx0XHRcdH1cblx0XHRcdGhlYWRIYXNWYWx1ZSA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgVGV4dEVkaXQocmVzdWx0UmVwbGFjZW1lbnRzKS5ub3JtYWxpemUoKTtcblx0fVxuXG5cdHRvU3RyaW5nKHRleHQ6IEFic3RyYWN0VGV4dCB8IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKHRleHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVwbGFjZW1lbnRzLm1hcChlZGl0ID0+IGVkaXQudG9TdHJpbmcoKSkuam9pbignXFxuJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0ZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9TdHJpbmcobmV3IFN0cmluZ1RleHQodGV4dCkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yZXBsYWNlbWVudHMubWFwKHIgPT4ge1xuXHRcdFx0Y29uc3QgbWF4TGVuZ3RoID0gMTA7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFRleHQgPSB0ZXh0LmdldFZhbHVlT2ZSYW5nZShyLnJhbmdlKTtcblxuXHRcdFx0Ly8gR2V0IHRleHQgYmVmb3JlIHRoZSBlZGl0XG5cdFx0XHRjb25zdCBiZWZvcmVSYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoXG5cdFx0XHRcdG5ldyBQb3NpdGlvbihNYXRoLm1heCgxLCByLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEpLCAxKSxcblx0XHRcdFx0ci5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKClcblx0XHRcdCk7XG5cdFx0XHRsZXQgYmVmb3JlVGV4dCA9IHRleHQuZ2V0VmFsdWVPZlJhbmdlKGJlZm9yZVJhbmdlKTtcblx0XHRcdGlmIChiZWZvcmVUZXh0Lmxlbmd0aCA+IG1heExlbmd0aCkge1xuXHRcdFx0XHRiZWZvcmVUZXh0ID0gJy4uLicgKyBiZWZvcmVUZXh0LnN1YnN0cmluZyhiZWZvcmVUZXh0Lmxlbmd0aCAtIG1heExlbmd0aCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEdldCB0ZXh0IGFmdGVyIHRoZSBlZGl0XG5cdFx0XHRjb25zdCBhZnRlclJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhcblx0XHRcdFx0ci5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLFxuXHRcdFx0XHRuZXcgUG9zaXRpb24oci5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMSwgMSlcblx0XHRcdCk7XG5cdFx0XHRsZXQgYWZ0ZXJUZXh0ID0gdGV4dC5nZXRWYWx1ZU9mUmFuZ2UoYWZ0ZXJSYW5nZSk7XG5cdFx0XHRpZiAoYWZ0ZXJUZXh0Lmxlbmd0aCA+IG1heExlbmd0aCkge1xuXHRcdFx0XHRhZnRlclRleHQgPSBhZnRlclRleHQuc3Vic3RyaW5nKDAsIG1heExlbmd0aCkgKyAnLi4uJztcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9ybWF0IHRoZSByZXBsYWNlZCB0ZXh0XG5cdFx0XHRsZXQgcmVwbGFjZWRUZXh0ID0gb3JpZ2luYWxUZXh0O1xuXHRcdFx0aWYgKHJlcGxhY2VkVGV4dC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgaGFsZk1heCA9IE1hdGguZmxvb3IobWF4TGVuZ3RoIC8gMik7XG5cdFx0XHRcdHJlcGxhY2VkVGV4dCA9IHJlcGxhY2VkVGV4dC5zdWJzdHJpbmcoMCwgaGFsZk1heCkgKyAnLi4uJyArXG5cdFx0XHRcdFx0cmVwbGFjZWRUZXh0LnN1YnN0cmluZyhyZXBsYWNlZFRleHQubGVuZ3RoIC0gaGFsZk1heCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvcm1hdCB0aGUgbmV3IHRleHRcblx0XHRcdGxldCBuZXdUZXh0ID0gci50ZXh0O1xuXHRcdFx0aWYgKG5ld1RleHQubGVuZ3RoID4gbWF4TGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGhhbGZNYXggPSBNYXRoLmZsb29yKG1heExlbmd0aCAvIDIpO1xuXHRcdFx0XHRuZXdUZXh0ID0gbmV3VGV4dC5zdWJzdHJpbmcoMCwgaGFsZk1heCkgKyAnLi4uJyArXG5cdFx0XHRcdFx0bmV3VGV4dC5zdWJzdHJpbmcobmV3VGV4dC5sZW5ndGggLSBoYWxmTWF4KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlcGxhY2VkVGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0XHRcdHJldHVybiBgJHtiZWZvcmVUZXh0fVx1Mjc3MCR7bmV3VGV4dH1cdTI3NzEke2FmdGVyVGV4dH1gO1xuXHRcdFx0fVxuXHRcdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0XHRyZXR1cm4gYCR7YmVmb3JlVGV4dH1cdTI3NzAke3JlcGxhY2VkVGV4dH1cdTIxQTYke25ld1RleHR9XHUyNzcxJHthZnRlclRleHR9YDtcblx0XHR9KS5qb2luKCdcXG4nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGV4dFJlcGxhY2VtZW50IGltcGxlbWVudHMgSUVxdWF0YWJsZTxUZXh0UmVwbGFjZW1lbnQ+IHtcblx0cHVibGljIHN0YXRpYyBqb2luUmVwbGFjZW1lbnRzKHJlcGxhY2VtZW50czogVGV4dFJlcGxhY2VtZW50W10sIGluaXRpYWxWYWx1ZTogQWJzdHJhY3RUZXh0KTogVGV4dFJlcGxhY2VtZW50IHtcblx0XHRpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkgeyB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCk7IH1cblx0XHRpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMSkgeyByZXR1cm4gcmVwbGFjZW1lbnRzWzBdOyB9XG5cblx0XHRjb25zdCBzdGFydFBvcyA9IHJlcGxhY2VtZW50c1swXS5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgZW5kUG9zID0gcmVwbGFjZW1lbnRzW3JlcGxhY2VtZW50cy5sZW5ndGggLSAxXS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpO1xuXG5cdFx0bGV0IG5ld1RleHQgPSAnJztcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVwbGFjZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJFZGl0ID0gcmVwbGFjZW1lbnRzW2ldO1xuXHRcdFx0bmV3VGV4dCArPSBjdXJFZGl0LnRleHQ7XG5cdFx0XHRpZiAoaSA8IHJlcGxhY2VtZW50cy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdGNvbnN0IG5leHRFZGl0ID0gcmVwbGFjZW1lbnRzW2kgKyAxXTtcblx0XHRcdFx0Y29uc3QgZ2FwUmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGN1ckVkaXQucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgbmV4dEVkaXQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdFx0Y29uc3QgZ2FwVGV4dCA9IGluaXRpYWxWYWx1ZS5nZXRWYWx1ZU9mUmFuZ2UoZ2FwUmFuZ2UpO1xuXHRcdFx0XHRuZXdUZXh0ICs9IGdhcFRleHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KFJhbmdlLmZyb21Qb3NpdGlvbnMoc3RhcnRQb3MsIGVuZFBvcyksIG5ld1RleHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tU3RyaW5nUmVwbGFjZW1lbnQocmVwbGFjZW1lbnQ6IFN0cmluZ1JlcGxhY2VtZW50LCBpbml0aWFsU3RhdGU6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudCB7XG5cdFx0cmV0dXJuIG5ldyBUZXh0UmVwbGFjZW1lbnQoaW5pdGlhbFN0YXRlLmdldFRyYW5zZm9ybWVyKCkuZ2V0UmFuZ2UocmVwbGFjZW1lbnQucmVwbGFjZVJhbmdlKSwgcmVwbGFjZW1lbnQubmV3VGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZShyYW5nZTogUmFuZ2UpOiBUZXh0UmVwbGFjZW1lbnQge1xuXHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCAnJyk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmFuZ2U6IFJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSB0ZXh0OiBzdHJpbmcsXG5cdCkge1xuXHR9XG5cblx0Z2V0IGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmFuZ2UuaXNFbXB0eSgpICYmIHRoaXMudGV4dC5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRzdGF0aWMgZXF1YWxzKGZpcnN0OiBUZXh0UmVwbGFjZW1lbnQsIHNlY29uZDogVGV4dFJlcGxhY2VtZW50KSB7XG5cdFx0cmV0dXJuIGZpcnN0LnJhbmdlLmVxdWFsc1JhbmdlKHNlY29uZC5yYW5nZSkgJiYgZmlyc3QudGV4dCA9PT0gc2Vjb25kLnRleHQ7XG5cdH1cblxuXHRwdWJsaWMgdG9TaW5nbGVFZGl0T3BlcmF0aW9uKCk6IElTaW5nbGVFZGl0T3BlcmF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IHRoaXMucmFuZ2UsXG5cdFx0XHR0ZXh0OiB0aGlzLnRleHQsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyB0b0VkaXQoKTogVGV4dEVkaXQge1xuXHRcdHJldHVybiBuZXcgVGV4dEVkaXQoW3RoaXNdKTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IFRleHRSZXBsYWNlbWVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBUZXh0UmVwbGFjZW1lbnQuZXF1YWxzKHRoaXMsIG90aGVyKTtcblx0fVxuXG5cdHB1YmxpYyBleHRlbmRUb0NvdmVyUmFuZ2UocmFuZ2U6IFJhbmdlLCBpbml0aWFsVmFsdWU6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudCB7XG5cdFx0aWYgKHRoaXMucmFuZ2UuY29udGFpbnNSYW5nZShyYW5nZSkpIHsgcmV0dXJuIHRoaXM7IH1cblxuXHRcdGNvbnN0IG5ld1JhbmdlID0gdGhpcy5yYW5nZS5wbHVzUmFuZ2UocmFuZ2UpO1xuXHRcdGNvbnN0IHRleHRCZWZvcmUgPSBpbml0aWFsVmFsdWUuZ2V0VmFsdWVPZlJhbmdlKFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3UmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLCB0aGlzLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSkpO1xuXHRcdGNvbnN0IHRleHRBZnRlciA9IGluaXRpYWxWYWx1ZS5nZXRWYWx1ZU9mUmFuZ2UoUmFuZ2UuZnJvbVBvc2l0aW9ucyh0aGlzLnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIG5ld1JhbmdlLmdldEVuZFBvc2l0aW9uKCkpKTtcblx0XHRjb25zdCBuZXdUZXh0ID0gdGV4dEJlZm9yZSArIHRoaXMudGV4dCArIHRleHRBZnRlcjtcblx0XHRyZXR1cm4gbmV3IFRleHRSZXBsYWNlbWVudChuZXdSYW5nZSwgbmV3VGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgZXh0ZW5kVG9GdWxsTGluZShpbml0aWFsVmFsdWU6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudCB7XG5cdFx0Y29uc3QgbmV3UmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHR0aGlzLnJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdDEsXG5cdFx0XHR0aGlzLnJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRpbml0aWFsVmFsdWUuZ2V0VHJhbnNmb3JtZXIoKS5nZXRMaW5lTGVuZ3RoKHRoaXMucmFuZ2UuZW5kTGluZU51bWJlcikgKyAxXG5cdFx0KTtcblx0XHRyZXR1cm4gdGhpcy5leHRlbmRUb0NvdmVyUmFuZ2UobmV3UmFuZ2UsIGluaXRpYWxWYWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQ29tbW9uUHJlZml4QW5kU3VmZml4KHRleHQ6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudCB7XG5cdFx0Y29uc3QgcHJlZml4ID0gdGhpcy5yZW1vdmVDb21tb25QcmVmaXgodGV4dCk7XG5cdFx0Y29uc3Qgc3VmZml4ID0gcHJlZml4LnJlbW92ZUNvbW1vblN1ZmZpeCh0ZXh0KTtcblx0XHRyZXR1cm4gc3VmZml4O1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUNvbW1vblByZWZpeCh0ZXh0OiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnQge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRPcmlnaW5hbFRleHQgPSB0ZXh0LmdldFZhbHVlT2ZSYW5nZSh0aGlzLnJhbmdlKS5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxuJyk7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZE1vZGlmaWVkVGV4dCA9IHRoaXMudGV4dC5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxuJyk7XG5cblx0XHRjb25zdCBjb21tb25QcmVmaXhMZW4gPSBjb21tb25QcmVmaXhMZW5ndGgobm9ybWFsaXplZE9yaWdpbmFsVGV4dCwgbm9ybWFsaXplZE1vZGlmaWVkVGV4dCk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBUZXh0TGVuZ3RoLm9mVGV4dChub3JtYWxpemVkT3JpZ2luYWxUZXh0LnN1YnN0cmluZygwLCBjb21tb25QcmVmaXhMZW4pKVxuXHRcdFx0LmFkZFRvUG9zaXRpb24odGhpcy5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXG5cdFx0Y29uc3QgbmV3VGV4dCA9IG5vcm1hbGl6ZWRNb2RpZmllZFRleHQuc3Vic3RyaW5nKGNvbW1vblByZWZpeExlbik7XG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHN0YXJ0LCB0aGlzLnJhbmdlLmdldEVuZFBvc2l0aW9uKCkpO1xuXHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBuZXdUZXh0KTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb21tb25TdWZmaXgodGV4dDogQWJzdHJhY3RUZXh0KTogVGV4dFJlcGxhY2VtZW50IHtcblx0XHRjb25zdCBub3JtYWxpemVkT3JpZ2luYWxUZXh0ID0gdGV4dC5nZXRWYWx1ZU9mUmFuZ2UodGhpcy5yYW5nZSkucmVwbGFjZUFsbCgnXFxyXFxuJywgJ1xcbicpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRNb2RpZmllZFRleHQgPSB0aGlzLnRleHQucmVwbGFjZUFsbCgnXFxyXFxuJywgJ1xcbicpO1xuXG5cdFx0Y29uc3QgY29tbW9uU3VmZml4TGVuID0gY29tbW9uU3VmZml4TGVuZ3RoKG5vcm1hbGl6ZWRPcmlnaW5hbFRleHQsIG5vcm1hbGl6ZWRNb2RpZmllZFRleHQpO1xuXHRcdGNvbnN0IGVuZCA9IFRleHRMZW5ndGgub2ZUZXh0KG5vcm1hbGl6ZWRPcmlnaW5hbFRleHQuc3Vic3RyaW5nKDAsIG5vcm1hbGl6ZWRPcmlnaW5hbFRleHQubGVuZ3RoIC0gY29tbW9uU3VmZml4TGVuKSlcblx0XHRcdC5hZGRUb1Bvc2l0aW9uKHRoaXMucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblxuXHRcdGNvbnN0IG5ld1RleHQgPSBub3JtYWxpemVkTW9kaWZpZWRUZXh0LnN1YnN0cmluZygwLCBub3JtYWxpemVkTW9kaWZpZWRUZXh0Lmxlbmd0aCAtIGNvbW1vblN1ZmZpeExlbik7XG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHRoaXMucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLCBlbmQpO1xuXHRcdHJldHVybiBuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBuZXdUZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBpc0VmZmVjdGl2ZURlbGV0aW9uKHRleHQ6IEFic3RyYWN0VGV4dCk6IGJvb2xlYW4ge1xuXHRcdGxldCBuZXdUZXh0ID0gdGhpcy50ZXh0LnJlcGxhY2VBbGwoJ1xcclxcbicsICdcXG4nKTtcblx0XHRsZXQgZXhpc3RpbmdUZXh0ID0gdGV4dC5nZXRWYWx1ZU9mUmFuZ2UodGhpcy5yYW5nZSkucmVwbGFjZUFsbCgnXFxyXFxuJywgJ1xcbicpO1xuXHRcdGNvbnN0IGwgPSBjb21tb25QcmVmaXhMZW5ndGgobmV3VGV4dCwgZXhpc3RpbmdUZXh0KTtcblx0XHRuZXdUZXh0ID0gbmV3VGV4dC5zdWJzdHJpbmcobCk7XG5cdFx0ZXhpc3RpbmdUZXh0ID0gZXhpc3RpbmdUZXh0LnN1YnN0cmluZyhsKTtcblx0XHRjb25zdCByID0gY29tbW9uU3VmZml4TGVuZ3RoKG5ld1RleHQsIGV4aXN0aW5nVGV4dCk7XG5cdFx0bmV3VGV4dCA9IG5ld1RleHQuc3Vic3RyaW5nKDAsIG5ld1RleHQubGVuZ3RoIC0gcik7XG5cdFx0ZXhpc3RpbmdUZXh0ID0gZXhpc3RpbmdUZXh0LnN1YnN0cmluZygwLCBleGlzdGluZ1RleHQubGVuZ3RoIC0gcik7XG5cblx0XHRyZXR1cm4gbmV3VGV4dCA9PT0gJyc7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGVuZCA9IHRoaXMucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRyZXR1cm4gYCgke3N0YXJ0LmxpbmVOdW1iZXJ9LCR7c3RhcnQuY29sdW1ufSAtPiAke2VuZC5saW5lTnVtYmVyfSwke2VuZC5jb2x1bW59KTogXCIke3RoaXMudGV4dH1cImA7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmFuZ2VGcm9tUG9zaXRpb25zKHN0YXJ0OiBQb3NpdGlvbiwgZW5kOiBQb3NpdGlvbik6IFJhbmdlIHtcblx0aWYgKHN0YXJ0LmxpbmVOdW1iZXIgPT09IGVuZC5saW5lTnVtYmVyICYmIHN0YXJ0LmNvbHVtbiA9PT0gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcblx0XHRyZXR1cm4gUmFuZ2UuZnJvbVBvc2l0aW9ucyhlbmQsIGVuZCk7XG5cdH0gZWxzZSBpZiAoIXN0YXJ0LmlzQmVmb3JlT3JFcXVhbChlbmQpKSB7XG5cdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignc3RhcnQgbXVzdCBiZSBiZWZvcmUgZW5kJyk7XG5cdH1cblx0cmV0dXJuIG5ldyBSYW5nZShzdGFydC5saW5lTnVtYmVyLCBzdGFydC5jb2x1bW4sIGVuZC5saW5lTnVtYmVyLCBlbmQuY29sdW1uKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsV0FBVyxjQUFjO0FBQ2xDLFNBQVMsVUFBVSwwQkFBMEI7QUFDN0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0IsMEJBQTBCO0FBR3ZELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUF1QixrQkFBa0I7QUFHbEMsTUFBTSxTQUFTO0FBQUEsRUF1QnJCLFlBQ2lCLGNBQ2Y7QUFEZTtBQUVoQixhQUFTLE1BQU0sbUJBQW1CLGNBQWMsQ0FBQyxHQUFHLE1BQU0sRUFBRSxNQUFNLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlCQUFpQixDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ2hJO0FBQUEsRUExQkEsT0FBYyxlQUFlLE1BQXNCLGNBQXNDO0FBQ3hGLFVBQU0sUUFBUSxLQUFLLGFBQWEsSUFBSSxPQUFLLGdCQUFnQixzQkFBc0IsR0FBRyxZQUFZLENBQUM7QUFDL0YsV0FBTyxJQUFJLFNBQVMsS0FBSztBQUFBLEVBQzFCO0FBQUEsRUFFQSxPQUFjLFFBQVEsZUFBc0IsU0FBMkI7QUFDdEUsV0FBTyxJQUFJLFNBQVMsQ0FBQyxJQUFJLGdCQUFnQixlQUFlLE9B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
