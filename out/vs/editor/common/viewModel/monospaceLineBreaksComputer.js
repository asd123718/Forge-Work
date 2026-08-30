import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { WrappingIndent, EditorOption } from "../config/editorOptions.js";
import { CharacterClassifier } from "../core/characterClassifier.js";
import { LineInjectedText } from "../textModelEvents.js";
import { ModelLineProjectionData } from "../modelLineProjectionData.js";
class MonospaceLineBreaksComputerFactory {
  static create(options) {
    return new MonospaceLineBreaksComputerFactory(
      options.get(EditorOption.wordWrapBreakBeforeCharacters),
      options.get(EditorOption.wordWrapBreakAfterCharacters)
    );
  }
  constructor(breakBeforeChars, breakAfterChars) {
    this.classifier = new WrappingCharacterClassifier(breakBeforeChars, breakAfterChars);
  }
  createLineBreaksComputer(context, fontInfo, tabSize, wrappingColumn, wrappingIndent, wordBreak, wrapOnEscapedLineFeeds) {
    const lineNumbers = [];
    const previousBreakingData = [];
    return {
      addRequest: (lineNumber, previousLineBreakData) => {
        lineNumbers.push(lineNumber);
        previousBreakingData.push(previousLineBreakData);
      },
      finalize: () => {
        const columnsForFullWidthChar = fontInfo.typicalFullwidthCharacterWidth / fontInfo.typicalHalfwidthCharacterWidth;
        const result = [];
        for (let i = 0, len = lineNumbers.length; i < len; i++) {
          const lineNumber = lineNumbers[i];
          const injectedText = context.getLineInjectedText(lineNumber);
          const lineText = context.getLineContent(lineNumber);
          const previousLineBreakData = previousBreakingData[i];
          const isLineFeedWrappingEnabled = wrapOnEscapedLineFeeds && lineText.includes('"') && lineText.includes("\\n");
          if (previousLineBreakData && !previousLineBreakData.injectionOptions && !injectedText && !isLineFeedWrappingEnabled) {
            result[i] = createLineBreaksFromPreviousLineBreaks(this.classifier, previousLineBreakData, lineText, tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent, wordBreak);
          } else {
            result[i] = createLineBreaks(this.classifier, lineText, injectedText, tabSize, wrappingColumn, columnsForFullWidthChar, wrappingIndent, wordBreak, isLineFeedWrappingEnabled);
          }
        }
        arrPool1.length = 0;
        arrPool2.length = 0;
        return result;
      }
    };
  }
}
var CharacterClass = /* @__PURE__ */ ((CharacterClass2) => {
  CharacterClass2[CharacterClass2["NONE"] = 0] = "NONE";
  CharacterClass2[CharacterClass2["BREAK_BEFORE"] = 1] = "BREAK_BEFORE";
  CharacterClass2[CharacterClass2["BREAK_AFTER"] = 2] = "BREAK_AFTER";
  CharacterClass2[CharacterClass2["BREAK_IDEOGRAPHIC"] = 3] = "BREAK_IDEOGRAPHIC";
  return CharacterClass2;
})(CharacterClass || {});
class WrappingCharacterClassifier extends CharacterClassifier {
  constructor(BREAK_BEFORE, BREAK_AFTER) {
    super(0 /* NONE */);
    for (let i = 0; i < BREAK_BEFORE.length; i++) {
      this.set(BREAK_BEFORE.charCodeAt(i), 1 /* BREAK_BEFORE */);
    }
    for (let i = 0; i < BREAK_AFTER.length; i++) {
      this.set(BREAK_AFTER.charCodeAt(i), 2 /* BREAK_AFTER */);
    }
  }
  get(charCode) {
    if (charCode >= 0 && charCode < 256) {
      return this._asciiMap[charCode];
    } else {
      if (charCode >= 12352 && charCode <= 12543 || charCode >= 13312 && charCode <= 19903 || charCode >= 19968 && charCode <= 40959) {
        return 3 /* BREAK_IDEOGRAPHIC */;
      }
      return this._map.get(charCode) || this._defaultValue;
    }
  }
}
let arrPool1 = [];
let arrPool2 = [];
function createLineBreaksFromPreviousLineBreaks(classifier, previousBreakingData, lineText, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent, wordBreak) {
  if (firstLineBreakColumn === -1) {
    return null;
  }
  const len = lineText.length;
  if (len <= 1) {
    return null;
  }
  const isKeepAll = wordBreak === "keepAll";
  const prevBreakingOffsets = previousBreakingData.breakOffsets;
  const prevBreakingOffsetsVisibleColumn = previousBreakingData.breakOffsetsVisibleColumn;
  const wrappedTextIndentLength = computeWrappedTextIndentLength(lineText, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent);
  const wrappedLineBreakColumn = firstLineBreakColumn - wrappedTextIndentLength;
  const breakingOffsets = arrPool1;
  const breakingOffsetsVisibleColumn = arrPool2;
  let breakingOffsetsCount = 0;
  let lastBreakingOffset = 0;
  let lastBreakingOffsetVisibleColumn = 0;
  let breakingColumn = firstLineBreakColumn;
  const prevLen = prevBreakingOffsets.length;
  let prevIndex = 0;
  if (prevIndex >= 0) {
    let bestDistance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex] - breakingColumn);
    while (prevIndex + 1 < prevLen) {
      const distance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex + 1] - breakingColumn);
      if (distance >= bestDistance) {
        break;
      }
      bestDistance = distance;
      prevIndex++;
    }
  }
  while (prevIndex < prevLen) {
    let prevBreakOffset = prevIndex < 0 ? 0 : prevBreakingOffsets[prevIndex];
    let prevBreakOffsetVisibleColumn = prevIndex < 0 ? 0 : prevBreakingOffsetsVisibleColumn[prevIndex];
    if (lastBreakingOffset > prevBreakOffset) {
      prevBreakOffset = lastBreakingOffset;
      prevBreakOffsetVisibleColumn = lastBreakingOffsetVisibleColumn;
    }
    let breakOffset = 0;
    let breakOffsetVisibleColumn = 0;
    let forcedBreakOffset = 0;
    let forcedBreakOffsetVisibleColumn = 0;
    if (prevBreakOffsetVisibleColumn <= breakingColumn) {
      let visibleColumn = prevBreakOffsetVisibleColumn;
      let prevCharCode = prevBreakOffset === 0 ? CharCode.Null : lineText.charCodeAt(prevBreakOffset - 1);
      let prevCharCodeClass = prevBreakOffset === 0 ? 0 /* NONE */ : classifier.get(prevCharCode);
      let entireLineFits = true;
      for (let i = prevBreakOffset; i < len; i++) {
        const charStartOffset = i;
        const charCode = lineText.charCodeAt(i);
        let charCodeClass;
        let charWidth;
        if (strings.isHighSurrogate(charCode)) {
          i++;
          charCodeClass = 0 /* NONE */;
          charWidth = 2;
        } else {
          charCodeClass = classifier.get(charCode);
          charWidth = computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar);
        }
        if (charStartOffset > lastBreakingOffset && canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
          breakOffset = charStartOffset;
          breakOffsetVisibleColumn = visibleColumn;
        }
        visibleColumn += charWidth;
        if (visibleColumn > breakingColumn) {
          if (charStartOffset > lastBreakingOffset) {
            forcedBreakOffset = charStartOffset;
            forcedBreakOffsetVisibleColumn = visibleColumn - charWidth;
          } else {
            forcedBreakOffset = i + 1;
            forcedBreakOffsetVisibleColumn = visibleColumn;
          }
          if (visibleColumn - breakOffsetVisibleColumn > wrappedLineBreakColumn) {
            breakOffset = 0;
          }
          entireLineFits = false;
          break;
        }
        prevCharCode = charCode;
        prevCharCodeClass = charCodeClass;
      }
      if (entireLineFits) {
        if (breakingOffsetsCount > 0) {
          breakingOffsets[breakingOffsetsCount] = prevBreakingOffsets[prevBreakingOffsets.length - 1];
          breakingOffsetsVisibleColumn[breakingOffsetsCount] = prevBreakingOffsetsVisibleColumn[prevBreakingOffsets.length - 1];
          breakingOffsetsCount++;
        }
        break;
      }
    }
    if (breakOffset === 0) {
      let visibleColumn = prevBreakOffsetVisibleColumn;
      let charCode = lineText.charCodeAt(prevBreakOffset);
      let charCodeClass = classifier.get(charCode);
      let hitATabCharacter = false;
      for (let i = prevBreakOffset - 1; i >= lastBreakingOffset; i--) {
        const charStartOffset = i + 1;
        const prevCharCode = lineText.charCodeAt(i);
        if (prevCharCode === CharCode.Tab) {
          hitATabCharacter = true;
          break;
        }
        let prevCharCodeClass;
        let prevCharWidth;
        if (strings.isLowSurrogate(prevCharCode)) {
          i--;
          prevCharCodeClass = 0 /* NONE */;
          prevCharWidth = 2;
        } else {
          prevCharCodeClass = classifier.get(prevCharCode);
          prevCharWidth = strings.isFullWidthCharacter(prevCharCode) ? columnsForFullWidthChar : 1;
        }
        if (visibleColumn <= breakingColumn) {
          if (forcedBreakOffset === 0) {
            forcedBreakOffset = charStartOffset;
            forcedBreakOffsetVisibleColumn = visibleColumn;
          }
          if (visibleColumn <= breakingColumn - wrappedLineBreakColumn) {
            break;
          }
          if (canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
            breakOffset = charStartOffset;
            breakOffsetVisibleColumn = visibleColumn;
            break;
          }
        }
        visibleColumn -= prevCharWidth;
        charCode = prevCharCode;
        charCodeClass = prevCharCodeClass;
      }
      if (breakOffset !== 0) {
        const remainingWidthOfNextLine = wrappedLineBreakColumn - (forcedBreakOffsetVisibleColumn - breakOffsetVisibleColumn);
        if (remainingWidthOfNextLine <= tabSize) {
          const charCodeAtForcedBreakOffset = lineText.charCodeAt(forcedBreakOffset);
          let charWidth;
          if (strings.isHighSurrogate(charCodeAtForcedBreakOffset)) {
            charWidth = 2;
          } else {
            charWidth = computeCharWidth(charCodeAtForcedBreakOffset, forcedBreakOffsetVisibleColumn, tabSize, columnsForFullWidthChar);
          }
          if (remainingWidthOfNextLine - charWidth < 0) {
            breakOffset = 0;
          }
        }
      }
      if (hitATabCharacter) {
        prevIndex--;
        continue;
      }
    }
    if (breakOffset === 0) {
      breakOffset = forcedBreakOffset;
      breakOffsetVisibleColumn = forcedBreakOffsetVisibleColumn;
    }
    if (breakOffset <= lastBreakingOffset) {
      const charCode = lineText.charCodeAt(lastBreakingOffset);
      if (strings.isHighSurrogate(charCode)) {
        breakOffset = lastBreakingOffset + 2;
        breakOffsetVisibleColumn = lastBreakingOffsetVisibleColumn + 2;
      } else {
        breakOffset = lastBreakingOffset + 1;
        breakOffsetVisibleColumn = lastBreakingOffsetVisibleColumn + computeCharWidth(charCode, lastBreakingOffsetVisibleColumn, tabSize, columnsForFullWidthChar);
      }
    }
    lastBreakingOffset = breakOffset;
    breakingOffsets[breakingOffsetsCount] = breakOffset;
    lastBreakingOffsetVisibleColumn = breakOffsetVisibleColumn;
    breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
    breakingOffsetsCount++;
    breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakColumn;
    while (prevIndex < 0 || prevIndex < prevLen && prevBreakingOffsetsVisibleColumn[prevIndex] < breakOffsetVisibleColumn) {
      prevIndex++;
    }
    let bestDistance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex] - breakingColumn);
    while (prevIndex + 1 < prevLen) {
      const distance = Math.abs(prevBreakingOffsetsVisibleColumn[prevIndex + 1] - breakingColumn);
      if (distance >= bestDistance) {
        break;
      }
      bestDistance = distance;
      prevIndex++;
    }
  }
  if (breakingOffsetsCount === 0) {
    return null;
  }
  breakingOffsets.length = breakingOffsetsCount;
  breakingOffsetsVisibleColumn.length = breakingOffsetsCount;
  arrPool1 = previousBreakingData.breakOffsets;
  arrPool2 = previousBreakingData.breakOffsetsVisibleColumn;
  previousBreakingData.breakOffsets = breakingOffsets;
  previousBreakingData.breakOffsetsVisibleColumn = breakingOffsetsVisibleColumn;
  previousBreakingData.wrappedTextIndentLength = wrappedTextIndentLength;
  return previousBreakingData;
}
function createLineBreaks(classifier, _lineText, injectedTexts, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent, wordBreak, wrapOnEscapedLineFeeds) {
  const lineText = LineInjectedText.applyInjectedText(_lineText, injectedTexts);
  let injectionOptions;
  let injectionOffsets;
  if (injectedTexts && injectedTexts.length > 0) {
    injectionOptions = injectedTexts.map((t) => t.options);
    injectionOffsets = injectedTexts.map((text) => text.column - 1);
  } else {
    injectionOptions = null;
    injectionOffsets = null;
  }
  if (firstLineBreakColumn === -1) {
    if (!injectionOptions) {
      return null;
    }
    return new ModelLineProjectionData(injectionOffsets, injectionOptions, [lineText.length], [], 0);
  }
  const len = lineText.length;
  if (len <= 1) {
    if (!injectionOptions) {
      return null;
    }
    return new ModelLineProjectionData(injectionOffsets, injectionOptions, [lineText.length], [], 0);
  }
  const isKeepAll = wordBreak === "keepAll";
  const wrappedTextIndentLength = computeWrappedTextIndentLength(lineText, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent);
  const wrappedLineBreakColumn = firstLineBreakColumn - wrappedTextIndentLength;
  const breakingOffsets = [];
  const breakingOffsetsVisibleColumn = [];
  let breakingOffsetsCount = 0;
  let breakOffset = 0;
  let breakOffsetVisibleColumn = 0;
  let breakingColumn = firstLineBreakColumn;
  let prevCharCode = lineText.charCodeAt(0);
  let prevCharCodeClass = classifier.get(prevCharCode);
  let visibleColumn = computeCharWidth(prevCharCode, 0, tabSize, columnsForFullWidthChar);
  let startOffset = 1;
  if (strings.isHighSurrogate(prevCharCode)) {
    visibleColumn += 1;
    prevCharCode = lineText.charCodeAt(1);
    prevCharCodeClass = classifier.get(prevCharCode);
    startOffset++;
  }
  for (let i = startOffset; i < len; i++) {
    const charStartOffset = i;
    const charCode = lineText.charCodeAt(i);
    let charCodeClass;
    let charWidth;
    let wrapEscapedLineFeed = false;
    if (strings.isHighSurrogate(charCode)) {
      i++;
      charCodeClass = 0 /* NONE */;
      charWidth = 2;
    } else {
      charCodeClass = classifier.get(charCode);
      charWidth = computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar);
    }
    if (wrapOnEscapedLineFeeds && isEscapedLineBreakAtPosition(lineText, i)) {
      breakOffset = charStartOffset;
      breakOffsetVisibleColumn = visibleColumn;
      wrapEscapedLineFeed = true;
    } else if (canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll)) {
      breakOffset = charStartOffset;
      breakOffsetVisibleColumn = visibleColumn;
    }
    visibleColumn += charWidth;
    if (visibleColumn > breakingColumn || wrapEscapedLineFeed) {
      if (breakOffset === 0 || visibleColumn - breakOffsetVisibleColumn > wrappedLineBreakColumn) {
        breakOffset = charStartOffset;
        breakOffsetVisibleColumn = visibleColumn - charWidth;
      }
      breakingOffsets[breakingOffsetsCount] = breakOffset;
      breakingOffsetsVisibleColumn[breakingOffsetsCount] = breakOffsetVisibleColumn;
      breakingOffsetsCount++;
      breakingColumn = breakOffsetVisibleColumn + wrappedLineBreakColumn;
      breakOffset = 0;
    }
    prevCharCode = charCode;
    prevCharCodeClass = charCodeClass;
  }
  if (breakingOffsetsCount === 0 && (!injectedTexts || injectedTexts.length === 0)) {
    return null;
  }
  breakingOffsets[breakingOffsetsCount] = len;
  breakingOffsetsVisibleColumn[breakingOffsetsCount] = visibleColumn;
  return new ModelLineProjectionData(injectionOffsets, injectionOptions, breakingOffsets, breakingOffsetsVisibleColumn, wrappedTextIndentLength);
}
function computeCharWidth(charCode, visibleColumn, tabSize, columnsForFullWidthChar) {
  if (charCode === CharCode.Tab) {
    return tabSize - visibleColumn % tabSize;
  }
  if (strings.isFullWidthCharacter(charCode)) {
    return columnsForFullWidthChar;
  }
  if (charCode < 32) {
    return columnsForFullWidthChar;
  }
  return 1;
}
function tabCharacterWidth(visibleColumn, tabSize) {
  return tabSize - visibleColumn % tabSize;
}
function isEscapedLineBreakAtPosition(lineText, i) {
  if (i >= 2 && lineText.charAt(i - 1) === "n") {
    let escapeCount = 0;
    for (let j = i - 2; j >= 0; j--) {
      if (lineText.charAt(j) === "\\") {
        escapeCount++;
      } else {
        return escapeCount % 2 === 1;
      }
    }
  }
  return false;
}
function canBreak(prevCharCode, prevCharCodeClass, charCode, charCodeClass, isKeepAll) {
  return charCode !== CharCode.Space && (prevCharCodeClass === 2 /* BREAK_AFTER */ && charCodeClass !== 2 /* BREAK_AFTER */ || prevCharCodeClass !== 1 /* BREAK_BEFORE */ && charCodeClass === 1 /* BREAK_BEFORE */ || !isKeepAll && prevCharCodeClass === 3 /* BREAK_IDEOGRAPHIC */ && charCodeClass !== 2 /* BREAK_AFTER */ || !isKeepAll && charCodeClass === 3 /* BREAK_IDEOGRAPHIC */ && prevCharCodeClass !== 1 /* BREAK_BEFORE */);
}
function computeWrappedTextIndentLength(lineText, tabSize, firstLineBreakColumn, columnsForFullWidthChar, wrappingIndent) {
  let wrappedTextIndentLength = 0;
  if (wrappingIndent !== WrappingIndent.None) {
    const firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineText);
    if (firstNonWhitespaceIndex !== -1) {
      for (let i = 0; i < firstNonWhitespaceIndex; i++) {
        const charWidth = lineText.charCodeAt(i) === CharCode.Tab ? tabCharacterWidth(wrappedTextIndentLength, tabSize) : 1;
        wrappedTextIndentLength += charWidth;
      }
      const numberOfAdditionalTabs = wrappingIndent === WrappingIndent.DeepIndent ? 2 : wrappingIndent === WrappingIndent.Indent ? 1 : 0;
      for (let i = 0; i < numberOfAdditionalTabs; i++) {
        const charWidth = tabCharacterWidth(wrappedTextIndentLength, tabSize);
        wrappedTextIndentLength += charWidth;
      }
      if (wrappedTextIndentLength + columnsForFullWidthChar > firstLineBreakColumn) {
        wrappedTextIndentLength = 0;
      }
    }
  }
  return wrappedTextIndentLength;
}
export {
  MonospaceLineBreaksComputerFactory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdmlld01vZGVsXFxtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBXcmFwcGluZ0luZGVudCwgSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhcmFjdGVyQ2xhc3NpZmllciB9IGZyb20gJy4uL2NvcmUvY2hhcmFjdGVyQ2xhc3NpZmllci5qcyc7XG5pbXBvcnQgeyBGb250SW5mbyB9IGZyb20gJy4uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBMaW5lSW5qZWN0ZWRUZXh0IH0gZnJvbSAnLi4vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IEluamVjdGVkVGV4dE9wdGlvbnMgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSwgSUxpbmVCcmVha3NDb21wdXRlciwgTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEsIElMaW5lQnJlYWtzQ29tcHV0ZXJDb250ZXh0IH0gZnJvbSAnLi4vbW9kZWxMaW5lUHJvamVjdGlvbkRhdGEuanMnO1xuXG5leHBvcnQgY2xhc3MgTW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSBpbXBsZW1lbnRzIElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5IHtcblx0cHVibGljIHN0YXRpYyBjcmVhdGUob3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucyk6IE1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnkge1xuXHRcdHJldHVybiBuZXcgTW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeShcblx0XHRcdG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkV3JhcEJyZWFrQmVmb3JlQ2hhcmFjdGVycyksXG5cdFx0XHRvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZFdyYXBCcmVha0FmdGVyQ2hhcmFjdGVycylcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjbGFzc2lmaWVyOiBXcmFwcGluZ0NoYXJhY3RlckNsYXNzaWZpZXI7XG5cblx0Y29uc3RydWN0b3IoYnJlYWtCZWZvcmVDaGFyczogc3RyaW5nLCBicmVha0FmdGVyQ2hhcnM6IHN0cmluZykge1xuXHRcdHRoaXMuY2xhc3NpZmllciA9IG5ldyBXcmFwcGluZ0NoYXJhY3RlckNsYXNzaWZpZXIoYnJlYWtCZWZvcmVDaGFycywgYnJlYWtBZnRlckNoYXJzKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVMaW5lQnJlYWtzQ29tcHV0ZXIoY29udGV4dDogSUxpbmVCcmVha3NDb21wdXRlckNvbnRleHQsIGZvbnRJbmZvOiBGb250SW5mbywgdGFiU2l6ZTogbnVtYmVyLCB3cmFwcGluZ0NvbHVtbjogbnVtYmVyLCB3cmFwcGluZ0luZGVudDogV3JhcHBpbmdJbmRlbnQsIHdvcmRCcmVhazogJ25vcm1hbCcgfCAna2VlcEFsbCcsIHdyYXBPbkVzY2FwZWRMaW5lRmVlZHM6IGJvb2xlYW4pOiBJTGluZUJyZWFrc0NvbXB1dGVyIHtcblx0XHRjb25zdCBsaW5lTnVtYmVyczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBwcmV2aW91c0JyZWFraW5nRGF0YTogKE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbClbXSA9IFtdO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhZGRSZXF1ZXN0OiAobGluZU51bWJlcjogbnVtYmVyLCBwcmV2aW91c0xpbmVCcmVha0RhdGE6IE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRsaW5lTnVtYmVycy5wdXNoKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRwcmV2aW91c0JyZWFraW5nRGF0YS5wdXNoKHByZXZpb3VzTGluZUJyZWFrRGF0YSk7XG5cdFx0XHR9LFxuXHRcdFx0ZmluYWxpemU6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXIgPSBmb250SW5mby50eXBpY2FsRnVsbHdpZHRoQ2hhcmFjdGVyV2lkdGggLyBmb250SW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogKE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbClbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZU51bWJlcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gbGluZU51bWJlcnNbaV07XG5cdFx0XHRcdFx0Y29uc3QgaW5qZWN0ZWRUZXh0ID0gY29udGV4dC5nZXRMaW5lSW5qZWN0ZWRUZXh0KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gY29udGV4dC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRjb25zdCBwcmV2aW91c0xpbmVCcmVha0RhdGEgPSBwcmV2aW91c0JyZWFraW5nRGF0YVtpXTtcblx0XHRcdFx0XHRjb25zdCBpc0xpbmVGZWVkV3JhcHBpbmdFbmFibGVkID0gd3JhcE9uRXNjYXBlZExpbmVGZWVkcyAmJiBsaW5lVGV4dC5pbmNsdWRlcygnXCInKSAmJiBsaW5lVGV4dC5pbmNsdWRlcygnXFxcXG4nKTtcblx0XHRcdFx0XHRpZiAocHJldmlvdXNMaW5lQnJlYWtEYXRhICYmICFwcmV2aW91c0xpbmVCcmVha0RhdGEuaW5qZWN0aW9uT3B0aW9ucyAmJiAhaW5qZWN0ZWRUZXh0ICYmICFpc0xpbmVGZWVkV3JhcHBpbmdFbmFibGVkKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHRbaV0gPSBjcmVhdGVMaW5lQnJlYWtzRnJvbVByZXZpb3VzTGluZUJyZWFrcyh0aGlzLmNsYXNzaWZpZXIsIHByZXZpb3VzTGluZUJyZWFrRGF0YSwgbGluZVRleHQsIHRhYlNpemUsIHdyYXBwaW5nQ29sdW1uLCBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhciwgd3JhcHBpbmdJbmRlbnQsIHdvcmRCcmVhayk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc3VsdFtpXSA9IGNyZWF0ZUxpbmVCcmVha3ModGhpcy5jbGFzc2lmaWVyLCBsaW5lVGV4dCwgaW5qZWN0ZWRUZXh0LCB0YWJTaXplLCB3cmFwcGluZ0NvbHVtbiwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXIsIHdyYXBwaW5nSW5kZW50LCB3b3JkQnJlYWssIGlzTGluZUZlZWRXcmFwcGluZ0VuYWJsZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhcnJQb29sMS5sZW5ndGggPSAwO1xuXHRcdFx0XHRhcnJQb29sMi5sZW5ndGggPSAwO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuY29uc3QgZW51bSBDaGFyYWN0ZXJDbGFzcyB7XG5cdE5PTkUgPSAwLFxuXHRCUkVBS19CRUZPUkUgPSAxLFxuXHRCUkVBS19BRlRFUiA9IDIsXG5cdEJSRUFLX0lERU9HUkFQSElDID0gMyAvLyBmb3IgSGFuIGFuZCBLYW5hLlxufVxuXG5jbGFzcyBXcmFwcGluZ0NoYXJhY3RlckNsYXNzaWZpZXIgZXh0ZW5kcyBDaGFyYWN0ZXJDbGFzc2lmaWVyPENoYXJhY3RlckNsYXNzPiB7XG5cblx0Y29uc3RydWN0b3IoQlJFQUtfQkVGT1JFOiBzdHJpbmcsIEJSRUFLX0FGVEVSOiBzdHJpbmcpIHtcblx0XHRzdXBlcihDaGFyYWN0ZXJDbGFzcy5OT05FKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgQlJFQUtfQkVGT1JFLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLnNldChCUkVBS19CRUZPUkUuY2hhckNvZGVBdChpKSwgQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfQkVGT1JFKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IEJSRUFLX0FGVEVSLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLnNldChCUkVBS19BRlRFUi5jaGFyQ29kZUF0KGkpLCBDaGFyYWN0ZXJDbGFzcy5CUkVBS19BRlRFUik7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldChjaGFyQ29kZTogbnVtYmVyKTogQ2hhcmFjdGVyQ2xhc3Mge1xuXHRcdGlmIChjaGFyQ29kZSA+PSAwICYmIGNoYXJDb2RlIDwgMjU2KSB7XG5cdFx0XHRyZXR1cm4gPENoYXJhY3RlckNsYXNzPnRoaXMuX2FzY2lpTWFwW2NoYXJDb2RlXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSW5pdGlhbGl6ZSBDaGFyYWN0ZXJDbGFzcy5CUkVBS19JREVPR1JBUEhJQyBmb3IgdGhlc2UgVW5pY29kZSByYW5nZXM6XG5cdFx0XHQvLyAxLiBDSksgVW5pZmllZCBJZGVvZ3JhcGhzICgweDRFMDAgLS0gMHg5RkZGKVxuXHRcdFx0Ly8gMi4gQ0pLIFVuaWZpZWQgSWRlb2dyYXBocyBFeHRlbnNpb24gQSAoMHgzNDAwIC0tIDB4NERCRilcblx0XHRcdC8vIDMuIEhpcmFnYW5hIGFuZCBLYXRha2FuYSAoMHgzMDQwIC0tIDB4MzBGRilcblx0XHRcdGlmIChcblx0XHRcdFx0KGNoYXJDb2RlID49IDB4MzA0MCAmJiBjaGFyQ29kZSA8PSAweDMwRkYpXG5cdFx0XHRcdHx8IChjaGFyQ29kZSA+PSAweDM0MDAgJiYgY2hhckNvZGUgPD0gMHg0REJGKVxuXHRcdFx0XHR8fCAoY2hhckNvZGUgPj0gMHg0RTAwICYmIGNoYXJDb2RlIDw9IDB4OUZGRilcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfSURFT0dSQVBISUM7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiA8Q2hhcmFjdGVyQ2xhc3M+KHRoaXMuX21hcC5nZXQoY2hhckNvZGUpIHx8IHRoaXMuX2RlZmF1bHRWYWx1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmxldCBhcnJQb29sMTogbnVtYmVyW10gPSBbXTtcbmxldCBhcnJQb29sMjogbnVtYmVyW10gPSBbXTtcblxuZnVuY3Rpb24gY3JlYXRlTGluZUJyZWFrc0Zyb21QcmV2aW91c0xpbmVCcmVha3MoY2xhc3NpZmllcjogV3JhcHBpbmdDaGFyYWN0ZXJDbGFzc2lmaWVyLCBwcmV2aW91c0JyZWFraW5nRGF0YTogTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEsIGxpbmVUZXh0OiBzdHJpbmcsIHRhYlNpemU6IG51bWJlciwgZmlyc3RMaW5lQnJlYWtDb2x1bW46IG51bWJlciwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXI6IG51bWJlciwgd3JhcHBpbmdJbmRlbnQ6IFdyYXBwaW5nSW5kZW50LCB3b3JkQnJlYWs6ICdub3JtYWwnIHwgJ2tlZXBBbGwnKTogTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfCBudWxsIHtcblx0aWYgKGZpcnN0TGluZUJyZWFrQ29sdW1uID09PSAtMSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgbGVuID0gbGluZVRleHQubGVuZ3RoO1xuXHRpZiAobGVuIDw9IDEpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IGlzS2VlcEFsbCA9ICh3b3JkQnJlYWsgPT09ICdrZWVwQWxsJyk7XG5cblx0Y29uc3QgcHJldkJyZWFraW5nT2Zmc2V0cyA9IHByZXZpb3VzQnJlYWtpbmdEYXRhLmJyZWFrT2Zmc2V0cztcblx0Y29uc3QgcHJldkJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW4gPSBwcmV2aW91c0JyZWFraW5nRGF0YS5icmVha09mZnNldHNWaXNpYmxlQ29sdW1uO1xuXG5cdGNvbnN0IHdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoID0gY29tcHV0ZVdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoKGxpbmVUZXh0LCB0YWJTaXplLCBmaXJzdExpbmVCcmVha0NvbHVtbiwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXIsIHdyYXBwaW5nSW5kZW50KTtcblx0Y29uc3Qgd3JhcHBlZExpbmVCcmVha0NvbHVtbiA9IGZpcnN0TGluZUJyZWFrQ29sdW1uIC0gd3JhcHBlZFRleHRJbmRlbnRMZW5ndGg7XG5cblx0Y29uc3QgYnJlYWtpbmdPZmZzZXRzOiBudW1iZXJbXSA9IGFyclBvb2wxO1xuXHRjb25zdCBicmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uOiBudW1iZXJbXSA9IGFyclBvb2wyO1xuXHRsZXQgYnJlYWtpbmdPZmZzZXRzQ291bnQgPSAwO1xuXHRsZXQgbGFzdEJyZWFraW5nT2Zmc2V0ID0gMDtcblx0bGV0IGxhc3RCcmVha2luZ09mZnNldFZpc2libGVDb2x1bW4gPSAwO1xuXG5cdGxldCBicmVha2luZ0NvbHVtbiA9IGZpcnN0TGluZUJyZWFrQ29sdW1uO1xuXHRjb25zdCBwcmV2TGVuID0gcHJldkJyZWFraW5nT2Zmc2V0cy5sZW5ndGg7XG5cdGxldCBwcmV2SW5kZXggPSAwO1xuXG5cdGlmIChwcmV2SW5kZXggPj0gMCkge1xuXHRcdGxldCBiZXN0RGlzdGFuY2UgPSBNYXRoLmFicyhwcmV2QnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbltwcmV2SW5kZXhdIC0gYnJlYWtpbmdDb2x1bW4pO1xuXHRcdHdoaWxlIChwcmV2SW5kZXggKyAxIDwgcHJldkxlbikge1xuXHRcdFx0Y29uc3QgZGlzdGFuY2UgPSBNYXRoLmFicyhwcmV2QnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbltwcmV2SW5kZXggKyAxXSAtIGJyZWFraW5nQ29sdW1uKTtcblx0XHRcdGlmIChkaXN0YW5jZSA+PSBiZXN0RGlzdGFuY2UpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRiZXN0RGlzdGFuY2UgPSBkaXN0YW5jZTtcblx0XHRcdHByZXZJbmRleCsrO1xuXHRcdH1cblx0fVxuXG5cdHdoaWxlIChwcmV2SW5kZXggPCBwcmV2TGVuKSB7XG5cdFx0Ly8gQWxsb3cgZm9yIHByZXZJbmRleCB0byBiZSAtMSAoZm9yIHRoZSBjYXNlIHdoZXJlIHdlIGhpdCBhIHRhYiB3aGVuIHdhbGtpbmcgYmFja3dhcmRzIGZyb20gdGhlIGZpcnN0IGJyZWFrKVxuXHRcdGxldCBwcmV2QnJlYWtPZmZzZXQgPSBwcmV2SW5kZXggPCAwID8gMCA6IHByZXZCcmVha2luZ09mZnNldHNbcHJldkluZGV4XTtcblx0XHRsZXQgcHJldkJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IHByZXZJbmRleCA8IDAgPyAwIDogcHJldkJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bcHJldkluZGV4XTtcblx0XHRpZiAobGFzdEJyZWFraW5nT2Zmc2V0ID4gcHJldkJyZWFrT2Zmc2V0KSB7XG5cdFx0XHRwcmV2QnJlYWtPZmZzZXQgPSBsYXN0QnJlYWtpbmdPZmZzZXQ7XG5cdFx0XHRwcmV2QnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gbGFzdEJyZWFraW5nT2Zmc2V0VmlzaWJsZUNvbHVtbjtcblx0XHR9XG5cblx0XHRsZXQgYnJlYWtPZmZzZXQgPSAwO1xuXHRcdGxldCBicmVha09mZnNldFZpc2libGVDb2x1bW4gPSAwO1xuXG5cdFx0bGV0IGZvcmNlZEJyZWFrT2Zmc2V0ID0gMDtcblx0XHRsZXQgZm9yY2VkQnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gMDtcblxuXHRcdC8vIGluaXRpYWxseSwgd2Ugc2VhcmNoIGFzIG11Y2ggYXMgcG9zc2libGUgdG8gdGhlIHJpZ2h0IChpZiBpdCBmaXRzKVxuXHRcdGlmIChwcmV2QnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uIDw9IGJyZWFraW5nQ29sdW1uKSB7XG5cdFx0XHRsZXQgdmlzaWJsZUNvbHVtbiA9IHByZXZCcmVha09mZnNldFZpc2libGVDb2x1bW47XG5cdFx0XHRsZXQgcHJldkNoYXJDb2RlID0gcHJldkJyZWFrT2Zmc2V0ID09PSAwID8gQ2hhckNvZGUuTnVsbCA6IGxpbmVUZXh0LmNoYXJDb2RlQXQocHJldkJyZWFrT2Zmc2V0IC0gMSk7XG5cdFx0XHRsZXQgcHJldkNoYXJDb2RlQ2xhc3MgPSBwcmV2QnJlYWtPZmZzZXQgPT09IDAgPyBDaGFyYWN0ZXJDbGFzcy5OT05FIDogY2xhc3NpZmllci5nZXQocHJldkNoYXJDb2RlKTtcblx0XHRcdGxldCBlbnRpcmVMaW5lRml0cyA9IHRydWU7XG5cdFx0XHRmb3IgKGxldCBpID0gcHJldkJyZWFrT2Zmc2V0OyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2hhclN0YXJ0T2Zmc2V0ID0gaTtcblx0XHRcdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lVGV4dC5jaGFyQ29kZUF0KGkpO1xuXHRcdFx0XHRsZXQgY2hhckNvZGVDbGFzczogbnVtYmVyO1xuXHRcdFx0XHRsZXQgY2hhcldpZHRoOiBudW1iZXI7XG5cblx0XHRcdFx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlKSkge1xuXHRcdFx0XHRcdC8vIEEgc3Vycm9nYXRlIHBhaXIgbXVzdCBhbHdheXMgYmUgY29uc2lkZXJlZCBhcyBhIHNpbmdsZSB1bml0LCBzbyBpdCBpcyBuZXZlciB0byBiZSBicm9rZW5cblx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdFx0Y2hhckNvZGVDbGFzcyA9IENoYXJhY3RlckNsYXNzLk5PTkU7XG5cdFx0XHRcdFx0Y2hhcldpZHRoID0gMjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjaGFyQ29kZUNsYXNzID0gY2xhc3NpZmllci5nZXQoY2hhckNvZGUpO1xuXHRcdFx0XHRcdGNoYXJXaWR0aCA9IGNvbXB1dGVDaGFyV2lkdGgoY2hhckNvZGUsIHZpc2libGVDb2x1bW4sIHRhYlNpemUsIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjaGFyU3RhcnRPZmZzZXQgPiBsYXN0QnJlYWtpbmdPZmZzZXQgJiYgY2FuQnJlYWsocHJldkNoYXJDb2RlLCBwcmV2Q2hhckNvZGVDbGFzcywgY2hhckNvZGUsIGNoYXJDb2RlQ2xhc3MsIGlzS2VlcEFsbCkpIHtcblx0XHRcdFx0XHRicmVha09mZnNldCA9IGNoYXJTdGFydE9mZnNldDtcblx0XHRcdFx0XHRicmVha09mZnNldFZpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmlzaWJsZUNvbHVtbiArPSBjaGFyV2lkdGg7XG5cblx0XHRcdFx0Ly8gY2hlY2sgaWYgYWRkaW5nIGNoYXJhY3RlciBhdCBgaWAgd2lsbCBnbyBvdmVyIHRoZSBicmVha2luZyBjb2x1bW5cblx0XHRcdFx0aWYgKHZpc2libGVDb2x1bW4gPiBicmVha2luZ0NvbHVtbikge1xuXHRcdFx0XHRcdC8vIFdlIG5lZWQgdG8gYnJlYWsgYXQgbGVhc3QgYmVmb3JlIGNoYXJhY3RlciBhdCBgaWA6XG5cdFx0XHRcdFx0aWYgKGNoYXJTdGFydE9mZnNldCA+IGxhc3RCcmVha2luZ09mZnNldCkge1xuXHRcdFx0XHRcdFx0Zm9yY2VkQnJlYWtPZmZzZXQgPSBjaGFyU3RhcnRPZmZzZXQ7XG5cdFx0XHRcdFx0XHRmb3JjZWRCcmVha09mZnNldFZpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uIC0gY2hhcldpZHRoO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyB3ZSBuZWVkIHRvIGFkdmFuY2UgYXQgbGVhc3QgYnkgb25lIGNoYXJhY3RlclxuXHRcdFx0XHRcdFx0Zm9yY2VkQnJlYWtPZmZzZXQgPSBpICsgMTtcblx0XHRcdFx0XHRcdGZvcmNlZEJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHZpc2libGVDb2x1bW4gLSBicmVha09mZnNldFZpc2libGVDb2x1bW4gPiB3cmFwcGVkTGluZUJyZWFrQ29sdW1uKSB7XG5cdFx0XHRcdFx0XHQvLyBDYW5ub3QgYnJlYWsgYXQgYGJyZWFrT2Zmc2V0YCA9PiByZXNldCBpdCBpZiBpdCB3YXMgc2V0XG5cdFx0XHRcdFx0XHRicmVha09mZnNldCA9IDA7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZW50aXJlTGluZUZpdHMgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByZXZDaGFyQ29kZSA9IGNoYXJDb2RlO1xuXHRcdFx0XHRwcmV2Q2hhckNvZGVDbGFzcyA9IGNoYXJDb2RlQ2xhc3M7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbnRpcmVMaW5lRml0cykge1xuXHRcdFx0XHQvLyB0aGVyZSBpcyBubyBtb3JlIG5lZWQgdG8gYnJlYWsgPT4gc3RvcCB0aGUgb3V0ZXIgbG9vcCFcblx0XHRcdFx0aWYgKGJyZWFraW5nT2Zmc2V0c0NvdW50ID4gMCkge1xuXHRcdFx0XHRcdC8vIEFkZCBsYXN0IHNlZ21lbnQsIG5vIG5lZWQgdG8gYXNzaWduIHRvIGBsYXN0QnJlYWtpbmdPZmZzZXRgIGFuZCBgbGFzdEJyZWFraW5nT2Zmc2V0VmlzaWJsZUNvbHVtbmBcblx0XHRcdFx0XHRicmVha2luZ09mZnNldHNbYnJlYWtpbmdPZmZzZXRzQ291bnRdID0gcHJldkJyZWFraW5nT2Zmc2V0c1twcmV2QnJlYWtpbmdPZmZzZXRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bYnJlYWtpbmdPZmZzZXRzQ291bnRdID0gcHJldkJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bcHJldkJyZWFraW5nT2Zmc2V0cy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRicmVha2luZ09mZnNldHNDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChicmVha09mZnNldCA9PT0gMCkge1xuXHRcdFx0Ly8gbXVzdCBzZWFyY2ggbGVmdFxuXHRcdFx0bGV0IHZpc2libGVDb2x1bW4gPSBwcmV2QnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uO1xuXHRcdFx0bGV0IGNoYXJDb2RlID0gbGluZVRleHQuY2hhckNvZGVBdChwcmV2QnJlYWtPZmZzZXQpO1xuXHRcdFx0bGV0IGNoYXJDb2RlQ2xhc3MgPSBjbGFzc2lmaWVyLmdldChjaGFyQ29kZSk7XG5cdFx0XHRsZXQgaGl0QVRhYkNoYXJhY3RlciA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHByZXZCcmVha09mZnNldCAtIDE7IGkgPj0gbGFzdEJyZWFraW5nT2Zmc2V0OyBpLS0pIHtcblx0XHRcdFx0Y29uc3QgY2hhclN0YXJ0T2Zmc2V0ID0gaSArIDE7XG5cdFx0XHRcdGNvbnN0IHByZXZDaGFyQ29kZSA9IGxpbmVUZXh0LmNoYXJDb2RlQXQoaSk7XG5cblx0XHRcdFx0aWYgKHByZXZDaGFyQ29kZSA9PT0gQ2hhckNvZGUuVGFiKSB7XG5cdFx0XHRcdFx0Ly8gY2Fubm90IGRldGVybWluZSB0aGUgd2lkdGggb2YgYSB0YWIgd2hlbiBnb2luZyBiYWNrd2FyZHMsIHNvIHdlIG11c3QgZ28gZm9yd2FyZHNcblx0XHRcdFx0XHRoaXRBVGFiQ2hhcmFjdGVyID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBwcmV2Q2hhckNvZGVDbGFzczogbnVtYmVyO1xuXHRcdFx0XHRsZXQgcHJldkNoYXJXaWR0aDogbnVtYmVyO1xuXG5cdFx0XHRcdGlmIChzdHJpbmdzLmlzTG93U3Vycm9nYXRlKHByZXZDaGFyQ29kZSkpIHtcblx0XHRcdFx0XHQvLyBBIHN1cnJvZ2F0ZSBwYWlyIG11c3QgYWx3YXlzIGJlIGNvbnNpZGVyZWQgYXMgYSBzaW5nbGUgdW5pdCwgc28gaXQgaXMgbmV2ZXIgdG8gYmUgYnJva2VuXG5cdFx0XHRcdFx0aS0tO1xuXHRcdFx0XHRcdHByZXZDaGFyQ29kZUNsYXNzID0gQ2hhcmFjdGVyQ2xhc3MuTk9ORTtcblx0XHRcdFx0XHRwcmV2Q2hhcldpZHRoID0gMjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwcmV2Q2hhckNvZGVDbGFzcyA9IGNsYXNzaWZpZXIuZ2V0KHByZXZDaGFyQ29kZSk7XG5cdFx0XHRcdFx0cHJldkNoYXJXaWR0aCA9IChzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKHByZXZDaGFyQ29kZSkgPyBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhciA6IDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHZpc2libGVDb2x1bW4gPD0gYnJlYWtpbmdDb2x1bW4pIHtcblx0XHRcdFx0XHRpZiAoZm9yY2VkQnJlYWtPZmZzZXQgPT09IDApIHtcblx0XHRcdFx0XHRcdGZvcmNlZEJyZWFrT2Zmc2V0ID0gY2hhclN0YXJ0T2Zmc2V0O1xuXHRcdFx0XHRcdFx0Zm9yY2VkQnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gdmlzaWJsZUNvbHVtbjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodmlzaWJsZUNvbHVtbiA8PSBicmVha2luZ0NvbHVtbiAtIHdyYXBwZWRMaW5lQnJlYWtDb2x1bW4pIHtcblx0XHRcdFx0XHRcdC8vIHdlbnQgdG9vIGZhciFcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChjYW5CcmVhayhwcmV2Q2hhckNvZGUsIHByZXZDaGFyQ29kZUNsYXNzLCBjaGFyQ29kZSwgY2hhckNvZGVDbGFzcywgaXNLZWVwQWxsKSkge1xuXHRcdFx0XHRcdFx0YnJlYWtPZmZzZXQgPSBjaGFyU3RhcnRPZmZzZXQ7XG5cdFx0XHRcdFx0XHRicmVha09mZnNldFZpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmlzaWJsZUNvbHVtbiAtPSBwcmV2Q2hhcldpZHRoO1xuXHRcdFx0XHRjaGFyQ29kZSA9IHByZXZDaGFyQ29kZTtcblx0XHRcdFx0Y2hhckNvZGVDbGFzcyA9IHByZXZDaGFyQ29kZUNsYXNzO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYnJlYWtPZmZzZXQgIT09IDApIHtcblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nV2lkdGhPZk5leHRMaW5lID0gd3JhcHBlZExpbmVCcmVha0NvbHVtbiAtIChmb3JjZWRCcmVha09mZnNldFZpc2libGVDb2x1bW4gLSBicmVha09mZnNldFZpc2libGVDb2x1bW4pO1xuXHRcdFx0XHRpZiAocmVtYWluaW5nV2lkdGhPZk5leHRMaW5lIDw9IHRhYlNpemUpIHtcblx0XHRcdFx0XHRjb25zdCBjaGFyQ29kZUF0Rm9yY2VkQnJlYWtPZmZzZXQgPSBsaW5lVGV4dC5jaGFyQ29kZUF0KGZvcmNlZEJyZWFrT2Zmc2V0KTtcblx0XHRcdFx0XHRsZXQgY2hhcldpZHRoOiBudW1iZXI7XG5cdFx0XHRcdFx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlQXRGb3JjZWRCcmVha09mZnNldCkpIHtcblx0XHRcdFx0XHRcdC8vIEEgc3Vycm9nYXRlIHBhaXIgbXVzdCBhbHdheXMgYmUgY29uc2lkZXJlZCBhcyBhIHNpbmdsZSB1bml0LCBzbyBpdCBpcyBuZXZlciB0byBiZSBicm9rZW5cblx0XHRcdFx0XHRcdGNoYXJXaWR0aCA9IDI7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNoYXJXaWR0aCA9IGNvbXB1dGVDaGFyV2lkdGgoY2hhckNvZGVBdEZvcmNlZEJyZWFrT2Zmc2V0LCBmb3JjZWRCcmVha09mZnNldFZpc2libGVDb2x1bW4sIHRhYlNpemUsIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHJlbWFpbmluZ1dpZHRoT2ZOZXh0TGluZSAtIGNoYXJXaWR0aCA8IDApIHtcblx0XHRcdFx0XHRcdC8vIGl0IGlzIG5vdCB3b3J0aCBpdCB0byBicmVhayBhdCBicmVha09mZnNldCwgaXQganVzdCBpbnRyb2R1Y2VzIGFuIGV4dHJhIG5lZWRsZXNzIGxpbmUhXG5cdFx0XHRcdFx0XHRicmVha09mZnNldCA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoaXRBVGFiQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdC8vIGNhbm5vdCBkZXRlcm1pbmUgdGhlIHdpZHRoIG9mIGEgdGFiIHdoZW4gZ29pbmcgYmFja3dhcmRzLCBzbyB3ZSBtdXN0IGdvIGZvcndhcmRzIGZyb20gdGhlIHByZXZpb3VzIGJyZWFrXG5cdFx0XHRcdHByZXZJbmRleC0tO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYnJlYWtPZmZzZXQgPT09IDApIHtcblx0XHRcdC8vIENvdWxkIG5vdCBmaW5kIGEgZ29vZCBicmVha2luZyBwb2ludFxuXHRcdFx0YnJlYWtPZmZzZXQgPSBmb3JjZWRCcmVha09mZnNldDtcblx0XHRcdGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IGZvcmNlZEJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbjtcblx0XHR9XG5cblx0XHRpZiAoYnJlYWtPZmZzZXQgPD0gbGFzdEJyZWFraW5nT2Zmc2V0KSB7XG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhhdCB3ZSBhcmUgYWR2YW5jaW5nIChhdCBsZWFzdCBvbmUgY2hhcmFjdGVyKVxuXHRcdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lVGV4dC5jaGFyQ29kZUF0KGxhc3RCcmVha2luZ09mZnNldCk7XG5cdFx0XHRpZiAoc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGUpKSB7XG5cdFx0XHRcdC8vIEEgc3Vycm9nYXRlIHBhaXIgbXVzdCBhbHdheXMgYmUgY29uc2lkZXJlZCBhcyBhIHNpbmdsZSB1bml0LCBzbyBpdCBpcyBuZXZlciB0byBiZSBicm9rZW5cblx0XHRcdFx0YnJlYWtPZmZzZXQgPSBsYXN0QnJlYWtpbmdPZmZzZXQgKyAyO1xuXHRcdFx0XHRicmVha09mZnNldFZpc2libGVDb2x1bW4gPSBsYXN0QnJlYWtpbmdPZmZzZXRWaXNpYmxlQ29sdW1uICsgMjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrT2Zmc2V0ID0gbGFzdEJyZWFraW5nT2Zmc2V0ICsgMTtcblx0XHRcdFx0YnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID0gbGFzdEJyZWFraW5nT2Zmc2V0VmlzaWJsZUNvbHVtbiArIGNvbXB1dGVDaGFyV2lkdGgoY2hhckNvZGUsIGxhc3RCcmVha2luZ09mZnNldFZpc2libGVDb2x1bW4sIHRhYlNpemUsIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsYXN0QnJlYWtpbmdPZmZzZXQgPSBicmVha09mZnNldDtcblx0XHRicmVha2luZ09mZnNldHNbYnJlYWtpbmdPZmZzZXRzQ291bnRdID0gYnJlYWtPZmZzZXQ7XG5cdFx0bGFzdEJyZWFraW5nT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbjtcblx0XHRicmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uW2JyZWFraW5nT2Zmc2V0c0NvdW50XSA9IGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbjtcblx0XHRicmVha2luZ09mZnNldHNDb3VudCsrO1xuXHRcdGJyZWFraW5nQ29sdW1uID0gYnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uICsgd3JhcHBlZExpbmVCcmVha0NvbHVtbjtcblxuXHRcdHdoaWxlIChwcmV2SW5kZXggPCAwIHx8IChwcmV2SW5kZXggPCBwcmV2TGVuICYmIHByZXZCcmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uW3ByZXZJbmRleF0gPCBicmVha09mZnNldFZpc2libGVDb2x1bW4pKSB7XG5cdFx0XHRwcmV2SW5kZXgrKztcblx0XHR9XG5cblx0XHRsZXQgYmVzdERpc3RhbmNlID0gTWF0aC5hYnMocHJldkJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bcHJldkluZGV4XSAtIGJyZWFraW5nQ29sdW1uKTtcblx0XHR3aGlsZSAocHJldkluZGV4ICsgMSA8IHByZXZMZW4pIHtcblx0XHRcdGNvbnN0IGRpc3RhbmNlID0gTWF0aC5hYnMocHJldkJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bcHJldkluZGV4ICsgMV0gLSBicmVha2luZ0NvbHVtbik7XG5cdFx0XHRpZiAoZGlzdGFuY2UgPj0gYmVzdERpc3RhbmNlKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YmVzdERpc3RhbmNlID0gZGlzdGFuY2U7XG5cdFx0XHRwcmV2SW5kZXgrKztcblx0XHR9XG5cdH1cblxuXHRpZiAoYnJlYWtpbmdPZmZzZXRzQ291bnQgPT09IDApIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8vIERvaW5nIGhlcmUgc29tZSBvYmplY3QgcmV1c2Ugd2hpY2ggZW5kcyB1cCBoZWxwaW5nIGEgaHVnZSBkZWFsIHdpdGggR0MgcGF1c2VzIVxuXHRicmVha2luZ09mZnNldHMubGVuZ3RoID0gYnJlYWtpbmdPZmZzZXRzQ291bnQ7XG5cdGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW4ubGVuZ3RoID0gYnJlYWtpbmdPZmZzZXRzQ291bnQ7XG5cdGFyclBvb2wxID0gcHJldmlvdXNCcmVha2luZ0RhdGEuYnJlYWtPZmZzZXRzO1xuXHRhcnJQb29sMiA9IHByZXZpb3VzQnJlYWtpbmdEYXRhLmJyZWFrT2Zmc2V0c1Zpc2libGVDb2x1bW47XG5cdHByZXZpb3VzQnJlYWtpbmdEYXRhLmJyZWFrT2Zmc2V0cyA9IGJyZWFraW5nT2Zmc2V0cztcblx0cHJldmlvdXNCcmVha2luZ0RhdGEuYnJlYWtPZmZzZXRzVmlzaWJsZUNvbHVtbiA9IGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW47XG5cdHByZXZpb3VzQnJlYWtpbmdEYXRhLndyYXBwZWRUZXh0SW5kZW50TGVuZ3RoID0gd3JhcHBlZFRleHRJbmRlbnRMZW5ndGg7XG5cdHJldHVybiBwcmV2aW91c0JyZWFraW5nRGF0YTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTGluZUJyZWFrcyhjbGFzc2lmaWVyOiBXcmFwcGluZ0NoYXJhY3RlckNsYXNzaWZpZXIsIF9saW5lVGV4dDogc3RyaW5nLCBpbmplY3RlZFRleHRzOiBMaW5lSW5qZWN0ZWRUZXh0W10gfCBudWxsLCB0YWJTaXplOiBudW1iZXIsIGZpcnN0TGluZUJyZWFrQ29sdW1uOiBudW1iZXIsIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyOiBudW1iZXIsIHdyYXBwaW5nSW5kZW50OiBXcmFwcGluZ0luZGVudCwgd29yZEJyZWFrOiAnbm9ybWFsJyB8ICdrZWVwQWxsJywgd3JhcE9uRXNjYXBlZExpbmVGZWVkczogYm9vbGVhbik6IE1vZGVsTGluZVByb2plY3Rpb25EYXRhIHwgbnVsbCB7XG5cdGNvbnN0IGxpbmVUZXh0ID0gTGluZUluamVjdGVkVGV4dC5hcHBseUluamVjdGVkVGV4dChfbGluZVRleHQsIGluamVjdGVkVGV4dHMpO1xuXG5cdGxldCBpbmplY3Rpb25PcHRpb25zOiBJbmplY3RlZFRleHRPcHRpb25zW10gfCBudWxsO1xuXHRsZXQgaW5qZWN0aW9uT2Zmc2V0czogbnVtYmVyW10gfCBudWxsO1xuXHRpZiAoaW5qZWN0ZWRUZXh0cyAmJiBpbmplY3RlZFRleHRzLmxlbmd0aCA+IDApIHtcblx0XHRpbmplY3Rpb25PcHRpb25zID0gaW5qZWN0ZWRUZXh0cy5tYXAodCA9PiB0Lm9wdGlvbnMpO1xuXHRcdGluamVjdGlvbk9mZnNldHMgPSBpbmplY3RlZFRleHRzLm1hcCh0ZXh0ID0+IHRleHQuY29sdW1uIC0gMSk7XG5cdH0gZWxzZSB7XG5cdFx0aW5qZWN0aW9uT3B0aW9ucyA9IG51bGw7XG5cdFx0aW5qZWN0aW9uT2Zmc2V0cyA9IG51bGw7XG5cdH1cblxuXHRpZiAoZmlyc3RMaW5lQnJlYWtDb2x1bW4gPT09IC0xKSB7XG5cdFx0aWYgKCFpbmplY3Rpb25PcHRpb25zKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Ly8gY3JlYXRpbmcgYSBgTGluZUJyZWFrRGF0YWAgd2l0aCBhbiBpbnZhbGlkIGBicmVha09mZnNldHNWaXNpYmxlQ29sdW1uYCBpcyBPS1xuXHRcdC8vIGJlY2F1c2UgYGJyZWFrT2Zmc2V0c1Zpc2libGVDb2x1bW5gIHdpbGwgbmV2ZXIgYmUgdXNlZCBiZWNhdXNlIGl0IGNvbnRhaW5zIGluamVjdGVkIHRleHRcblx0XHRyZXR1cm4gbmV3IE1vZGVsTGluZVByb2plY3Rpb25EYXRhKGluamVjdGlvbk9mZnNldHMsIGluamVjdGlvbk9wdGlvbnMsIFtsaW5lVGV4dC5sZW5ndGhdLCBbXSwgMCk7XG5cdH1cblxuXHRjb25zdCBsZW4gPSBsaW5lVGV4dC5sZW5ndGg7XG5cdGlmIChsZW4gPD0gMSkge1xuXHRcdGlmICghaW5qZWN0aW9uT3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdC8vIGNyZWF0aW5nIGEgYExpbmVCcmVha0RhdGFgIHdpdGggYW4gaW52YWxpZCBgYnJlYWtPZmZzZXRzVmlzaWJsZUNvbHVtbmAgaXMgT0tcblx0XHQvLyBiZWNhdXNlIGBicmVha09mZnNldHNWaXNpYmxlQ29sdW1uYCB3aWxsIG5ldmVyIGJlIHVzZWQgYmVjYXVzZSBpdCBjb250YWlucyBpbmplY3RlZCB0ZXh0XG5cdFx0cmV0dXJuIG5ldyBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YShpbmplY3Rpb25PZmZzZXRzLCBpbmplY3Rpb25PcHRpb25zLCBbbGluZVRleHQubGVuZ3RoXSwgW10sIDApO1xuXHR9XG5cblx0Y29uc3QgaXNLZWVwQWxsID0gKHdvcmRCcmVhayA9PT0gJ2tlZXBBbGwnKTtcblx0Y29uc3Qgd3JhcHBlZFRleHRJbmRlbnRMZW5ndGggPSBjb21wdXRlV3JhcHBlZFRleHRJbmRlbnRMZW5ndGgobGluZVRleHQsIHRhYlNpemUsIGZpcnN0TGluZUJyZWFrQ29sdW1uLCBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhciwgd3JhcHBpbmdJbmRlbnQpO1xuXHRjb25zdCB3cmFwcGVkTGluZUJyZWFrQ29sdW1uID0gZmlyc3RMaW5lQnJlYWtDb2x1bW4gLSB3cmFwcGVkVGV4dEluZGVudExlbmd0aDtcblxuXHRjb25zdCBicmVha2luZ09mZnNldHM6IG51bWJlcltdID0gW107XG5cdGNvbnN0IGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW46IG51bWJlcltdID0gW107XG5cdGxldCBicmVha2luZ09mZnNldHNDb3VudDogbnVtYmVyID0gMDtcblx0bGV0IGJyZWFrT2Zmc2V0ID0gMDtcblx0bGV0IGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IDA7XG5cblx0bGV0IGJyZWFraW5nQ29sdW1uID0gZmlyc3RMaW5lQnJlYWtDb2x1bW47XG5cdGxldCBwcmV2Q2hhckNvZGUgPSBsaW5lVGV4dC5jaGFyQ29kZUF0KDApO1xuXHRsZXQgcHJldkNoYXJDb2RlQ2xhc3MgPSBjbGFzc2lmaWVyLmdldChwcmV2Q2hhckNvZGUpO1xuXHRsZXQgdmlzaWJsZUNvbHVtbiA9IGNvbXB1dGVDaGFyV2lkdGgocHJldkNoYXJDb2RlLCAwLCB0YWJTaXplLCBjb2x1bW5zRm9yRnVsbFdpZHRoQ2hhcik7XG5cblx0bGV0IHN0YXJ0T2Zmc2V0ID0gMTtcblx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKHByZXZDaGFyQ29kZSkpIHtcblx0XHQvLyBBIHN1cnJvZ2F0ZSBwYWlyIG11c3QgYWx3YXlzIGJlIGNvbnNpZGVyZWQgYXMgYSBzaW5nbGUgdW5pdCwgc28gaXQgaXMgbmV2ZXIgdG8gYmUgYnJva2VuXG5cdFx0dmlzaWJsZUNvbHVtbiArPSAxO1xuXHRcdHByZXZDaGFyQ29kZSA9IGxpbmVUZXh0LmNoYXJDb2RlQXQoMSk7XG5cdFx0cHJldkNoYXJDb2RlQ2xhc3MgPSBjbGFzc2lmaWVyLmdldChwcmV2Q2hhckNvZGUpO1xuXHRcdHN0YXJ0T2Zmc2V0Kys7XG5cdH1cblxuXHRmb3IgKGxldCBpID0gc3RhcnRPZmZzZXQ7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGNoYXJTdGFydE9mZnNldCA9IGk7XG5cdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lVGV4dC5jaGFyQ29kZUF0KGkpO1xuXHRcdGxldCBjaGFyQ29kZUNsYXNzOiBDaGFyYWN0ZXJDbGFzcztcblx0XHRsZXQgY2hhcldpZHRoOiBudW1iZXI7XG5cdFx0bGV0IHdyYXBFc2NhcGVkTGluZUZlZWQgPSBmYWxzZTtcblxuXHRcdGlmIChzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShjaGFyQ29kZSkpIHtcblx0XHRcdC8vIEEgc3Vycm9nYXRlIHBhaXIgbXVzdCBhbHdheXMgYmUgY29uc2lkZXJlZCBhcyBhIHNpbmdsZSB1bml0LCBzbyBpdCBpcyBuZXZlciB0byBiZSBicm9rZW5cblx0XHRcdGkrKztcblx0XHRcdGNoYXJDb2RlQ2xhc3MgPSBDaGFyYWN0ZXJDbGFzcy5OT05FO1xuXHRcdFx0Y2hhcldpZHRoID0gMjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hhckNvZGVDbGFzcyA9IGNsYXNzaWZpZXIuZ2V0KGNoYXJDb2RlKTtcblx0XHRcdGNoYXJXaWR0aCA9IGNvbXB1dGVDaGFyV2lkdGgoY2hhckNvZGUsIHZpc2libGVDb2x1bW4sIHRhYlNpemUsIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyKTtcblx0XHR9XG5cblx0XHQvLyBsaXRlcmFsIFxcbiBzaGFsbCB0cmlnZ2VyIGEgc29mdHdyYXBcblx0XHRpZiAod3JhcE9uRXNjYXBlZExpbmVGZWVkcyAmJiBpc0VzY2FwZWRMaW5lQnJlYWtBdFBvc2l0aW9uKGxpbmVUZXh0LCBpKSkge1xuXHRcdFx0YnJlYWtPZmZzZXQgPSBjaGFyU3RhcnRPZmZzZXQ7XG5cdFx0XHRicmVha09mZnNldFZpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uO1xuXHRcdFx0d3JhcEVzY2FwZWRMaW5lRmVlZCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChjYW5CcmVhayhwcmV2Q2hhckNvZGUsIHByZXZDaGFyQ29kZUNsYXNzLCBjaGFyQ29kZSwgY2hhckNvZGVDbGFzcywgaXNLZWVwQWxsKSkge1xuXHRcdFx0YnJlYWtPZmZzZXQgPSBjaGFyU3RhcnRPZmZzZXQ7XG5cdFx0XHRicmVha09mZnNldFZpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uO1xuXHRcdH1cblxuXHRcdHZpc2libGVDb2x1bW4gKz0gY2hhcldpZHRoO1xuXG5cdFx0Ly8gY2hlY2sgaWYgYWRkaW5nIGNoYXJhY3RlciBhdCBgaWAgd2lsbCBnbyBvdmVyIHRoZSBicmVha2luZyBjb2x1bW5cblx0XHRpZiAodmlzaWJsZUNvbHVtbiA+IGJyZWFraW5nQ29sdW1uIHx8IHdyYXBFc2NhcGVkTGluZUZlZWQpIHtcblx0XHRcdC8vIFdlIG5lZWQgdG8gYnJlYWsgYXQgbGVhc3QgYmVmb3JlIGNoYXJhY3RlciBhdCBgaWA6XG5cblx0XHRcdGlmIChicmVha09mZnNldCA9PT0gMCB8fCB2aXNpYmxlQ29sdW1uIC0gYnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uID4gd3JhcHBlZExpbmVCcmVha0NvbHVtbikge1xuXHRcdFx0XHQvLyBDYW5ub3QgYnJlYWsgYXQgYGJyZWFrT2Zmc2V0YCwgbXVzdCBicmVhayBhdCBgaWBcblx0XHRcdFx0YnJlYWtPZmZzZXQgPSBjaGFyU3RhcnRPZmZzZXQ7XG5cdFx0XHRcdGJyZWFrT2Zmc2V0VmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW4gLSBjaGFyV2lkdGg7XG5cdFx0XHR9XG5cblx0XHRcdGJyZWFraW5nT2Zmc2V0c1ticmVha2luZ09mZnNldHNDb3VudF0gPSBicmVha09mZnNldDtcblx0XHRcdGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW5bYnJlYWtpbmdPZmZzZXRzQ291bnRdID0gYnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uO1xuXHRcdFx0YnJlYWtpbmdPZmZzZXRzQ291bnQrKztcblx0XHRcdGJyZWFraW5nQ29sdW1uID0gYnJlYWtPZmZzZXRWaXNpYmxlQ29sdW1uICsgd3JhcHBlZExpbmVCcmVha0NvbHVtbjtcblx0XHRcdGJyZWFrT2Zmc2V0ID0gMDtcblx0XHR9XG5cblx0XHRwcmV2Q2hhckNvZGUgPSBjaGFyQ29kZTtcblx0XHRwcmV2Q2hhckNvZGVDbGFzcyA9IGNoYXJDb2RlQ2xhc3M7XG5cdH1cblxuXHRpZiAoYnJlYWtpbmdPZmZzZXRzQ291bnQgPT09IDAgJiYgKCFpbmplY3RlZFRleHRzIHx8IGluamVjdGVkVGV4dHMubGVuZ3RoID09PSAwKSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Ly8gQWRkIGxhc3Qgc2VnbWVudFxuXHRicmVha2luZ09mZnNldHNbYnJlYWtpbmdPZmZzZXRzQ291bnRdID0gbGVuO1xuXHRicmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uW2JyZWFraW5nT2Zmc2V0c0NvdW50XSA9IHZpc2libGVDb2x1bW47XG5cblx0cmV0dXJuIG5ldyBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YShpbmplY3Rpb25PZmZzZXRzLCBpbmplY3Rpb25PcHRpb25zLCBicmVha2luZ09mZnNldHMsIGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW4sIHdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoKTtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZUNoYXJXaWR0aChjaGFyQ29kZTogbnVtYmVyLCB2aXNpYmxlQ29sdW1uOiBudW1iZXIsIHRhYlNpemU6IG51bWJlciwgY29sdW1uc0ZvckZ1bGxXaWR0aENoYXI6IG51bWJlcik6IG51bWJlciB7XG5cdGlmIChjaGFyQ29kZSA9PT0gQ2hhckNvZGUuVGFiKSB7XG5cdFx0cmV0dXJuICh0YWJTaXplIC0gKHZpc2libGVDb2x1bW4gJSB0YWJTaXplKSk7XG5cdH1cblx0aWYgKHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIoY2hhckNvZGUpKSB7XG5cdFx0cmV0dXJuIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyO1xuXHR9XG5cdGlmIChjaGFyQ29kZSA8IDMyKSB7XG5cdFx0Ly8gd2hlbiB1c2luZyBgZWRpdG9yLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzYCwgdGhlIHN1YnN0aXR1dGlvbnMgYXJlIG9mdGVuIHdpZGVcblx0XHRyZXR1cm4gY29sdW1uc0ZvckZ1bGxXaWR0aENoYXI7XG5cdH1cblx0cmV0dXJuIDE7XG59XG5cbmZ1bmN0aW9uIHRhYkNoYXJhY3RlcldpZHRoKHZpc2libGVDb2x1bW46IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuICh0YWJTaXplIC0gKHZpc2libGVDb2x1bW4gJSB0YWJTaXplKSk7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIHRoZSBjdXJyZW50IHBvc2l0aW9uIGluIHRoZSB0ZXh0IHNob3VsZCB0cmlnZ2VyIGEgc29mdCB3cmFwIGR1ZSB0byBlc2NhcGVkIGxpbmUgZmVlZHMuXG4gKiBUaGlzIGhhbmRsZXMgdGhlIHdyYXBPbkVzY2FwZWRMaW5lRmVlZHMgZmVhdHVyZSB3aGljaCBhbGxvd3MgXFxuIHNlcXVlbmNlcyBpbiBzdHJpbmdzIHRvIHRyaWdnZXIgd3JhcHBpbmcuXG4gKi9cbmZ1bmN0aW9uIGlzRXNjYXBlZExpbmVCcmVha0F0UG9zaXRpb24obGluZVRleHQ6IHN0cmluZywgaTogbnVtYmVyKTogYm9vbGVhbiB7XG5cdGlmIChpID49IDIgJiYgbGluZVRleHQuY2hhckF0KGkgLSAxKSA9PT0gJ24nKSB7XG5cdFx0Ly8gQ2hlY2sgaWYgdGhlcmUncyBhbiBvZGQgbnVtYmVyIG9mIGJhY2tzbGFzaGVzXG5cdFx0bGV0IGVzY2FwZUNvdW50ID0gMDtcblx0XHRmb3IgKGxldCBqID0gaSAtIDI7IGogPj0gMDsgai0tKSB7XG5cdFx0XHRpZiAobGluZVRleHQuY2hhckF0KGopID09PSAnXFxcXCcpIHtcblx0XHRcdFx0ZXNjYXBlQ291bnQrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBlc2NhcGVDb3VudCAlIDIgPT09IDE7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBLaW5zb2t1IFNob3JpIDogRG9uJ3QgYnJlYWsgYWZ0ZXIgYSBsZWFkaW5nIGNoYXJhY3RlciwgbGlrZSBhbiBvcGVuIGJyYWNrZXRcbiAqIEtpbnNva3UgU2hvcmkgOiBEb24ndCBicmVhayBiZWZvcmUgYSB0cmFpbGluZyBjaGFyYWN0ZXIsIGxpa2UgYSBwZXJpb2RcbiAqL1xuZnVuY3Rpb24gY2FuQnJlYWsocHJldkNoYXJDb2RlOiBudW1iZXIsIHByZXZDaGFyQ29kZUNsYXNzOiBDaGFyYWN0ZXJDbGFzcywgY2hhckNvZGU6IG51bWJlciwgY2hhckNvZGVDbGFzczogQ2hhcmFjdGVyQ2xhc3MsIGlzS2VlcEFsbDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKFxuXHRcdGNoYXJDb2RlICE9PSBDaGFyQ29kZS5TcGFjZVxuXHRcdCYmIChcblx0XHRcdChwcmV2Q2hhckNvZGVDbGFzcyA9PT0gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfQUZURVIgJiYgY2hhckNvZGVDbGFzcyAhPT0gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfQUZURVIpIC8vIGJyZWFrIGF0IHRoZSBlbmQgb2YgbXVsdGlwbGUgQlJFQUtfQUZURVJcblx0XHRcdHx8IChwcmV2Q2hhckNvZGVDbGFzcyAhPT0gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfQkVGT1JFICYmIGNoYXJDb2RlQ2xhc3MgPT09IENoYXJhY3RlckNsYXNzLkJSRUFLX0JFRk9SRSkgLy8gYnJlYWsgYXQgdGhlIHN0YXJ0IG9mIG11bHRpcGxlIEJSRUFLX0JFRk9SRVxuXHRcdFx0fHwgKCFpc0tlZXBBbGwgJiYgcHJldkNoYXJDb2RlQ2xhc3MgPT09IENoYXJhY3RlckNsYXNzLkJSRUFLX0lERU9HUkFQSElDICYmIGNoYXJDb2RlQ2xhc3MgIT09IENoYXJhY3RlckNsYXNzLkJSRUFLX0FGVEVSKVxuXHRcdFx0fHwgKCFpc0tlZXBBbGwgJiYgY2hhckNvZGVDbGFzcyA9PT0gQ2hhcmFjdGVyQ2xhc3MuQlJFQUtfSURFT0dSQVBISUMgJiYgcHJldkNoYXJDb2RlQ2xhc3MgIT09IENoYXJhY3RlckNsYXNzLkJSRUFLX0JFRk9SRSlcblx0XHQpXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVXcmFwcGVkVGV4dEluZGVudExlbmd0aChsaW5lVGV4dDogc3RyaW5nLCB0YWJTaXplOiBudW1iZXIsIGZpcnN0TGluZUJyZWFrQ29sdW1uOiBudW1iZXIsIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyOiBudW1iZXIsIHdyYXBwaW5nSW5kZW50OiBXcmFwcGluZ0luZGVudCk6IG51bWJlciB7XG5cdGxldCB3cmFwcGVkVGV4dEluZGVudExlbmd0aCA9IDA7XG5cdGlmICh3cmFwcGluZ0luZGVudCAhPT0gV3JhcHBpbmdJbmRlbnQuTm9uZSkge1xuXHRcdGNvbnN0IGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lVGV4dCk7XG5cdFx0aWYgKGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ICE9PSAtMSkge1xuXHRcdFx0Ly8gVHJhY2sgZXhpc3RpbmcgaW5kZW50XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGFyV2lkdGggPSAobGluZVRleHQuY2hhckNvZGVBdChpKSA9PT0gQ2hhckNvZGUuVGFiID8gdGFiQ2hhcmFjdGVyV2lkdGgod3JhcHBlZFRleHRJbmRlbnRMZW5ndGgsIHRhYlNpemUpIDogMSk7XG5cdFx0XHRcdHdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoICs9IGNoYXJXaWR0aDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgaW5kZW50IG9mIGNvbnRpbnVhdGlvbiBsaW5lcywgaWYgZGVzaXJlZFxuXHRcdFx0Y29uc3QgbnVtYmVyT2ZBZGRpdGlvbmFsVGFicyA9ICh3cmFwcGluZ0luZGVudCA9PT0gV3JhcHBpbmdJbmRlbnQuRGVlcEluZGVudCA/IDIgOiB3cmFwcGluZ0luZGVudCA9PT0gV3JhcHBpbmdJbmRlbnQuSW5kZW50ID8gMSA6IDApO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBudW1iZXJPZkFkZGl0aW9uYWxUYWJzOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2hhcldpZHRoID0gdGFiQ2hhcmFjdGVyV2lkdGgod3JhcHBlZFRleHRJbmRlbnRMZW5ndGgsIHRhYlNpemUpO1xuXHRcdFx0XHR3cmFwcGVkVGV4dEluZGVudExlbmd0aCArPSBjaGFyV2lkdGg7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvcmNlIHN0aWNraW5nIHRvIGJlZ2lubmluZyBvZiBsaW5lIGlmIG5vIGNoYXJhY3RlciB3b3VsZCBmaXQgZXhjZXB0IGZvciB0aGUgaW5kZW50YXRpb25cblx0XHRcdGlmICh3cmFwcGVkVGV4dEluZGVudExlbmd0aCArIGNvbHVtbnNGb3JGdWxsV2lkdGhDaGFyID4gZmlyc3RMaW5lQnJlYWtDb2x1bW4pIHtcblx0XHRcdFx0d3JhcHBlZFRleHRJbmRlbnRMZW5ndGggPSAwO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gd3JhcHBlZFRleHRJbmRlbnRMZW5ndGg7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLGFBQWE7QUFDekIsU0FBUyxnQkFBd0Msb0JBQW9CO0FBQ3JFLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQTBELCtCQUEyRDtBQUU5RyxNQUFNLG1DQUF5RTtBQUFBLEVBQ3JGLE9BQWMsT0FBTyxT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
