import * as nls from "../../../nls.js";
import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { StringBuilder } from "../core/stringBuilder.js";
import { LineDecoration, LineDecorationsNormalizer } from "./lineDecorations.js";
import { LinePart, LinePartMetadata } from "./linePart.js";
import { InlineDecorationType } from "../viewModel/inlineDecorations.js";
import { TextDirection } from "../model.js";
var RenderWhitespace = /* @__PURE__ */ ((RenderWhitespace2) => {
  RenderWhitespace2[RenderWhitespace2["None"] = 0] = "None";
  RenderWhitespace2[RenderWhitespace2["Boundary"] = 1] = "Boundary";
  RenderWhitespace2[RenderWhitespace2["Selection"] = 2] = "Selection";
  RenderWhitespace2[RenderWhitespace2["Trailing"] = 3] = "Trailing";
  RenderWhitespace2[RenderWhitespace2["All"] = 4] = "All";
  return RenderWhitespace2;
})(RenderWhitespace || {});
class RenderLineInput {
  get isLTR() {
    return !this.containsRTL && this.textDirection !== TextDirection.RTL;
  }
  constructor(useMonospaceOptimizations, canUseHalfwidthRightwardsArrow, lineContent, continuesWithWrappedLine, isBasicASCII, containsRTL, fauxIndentLength, lineTokens, lineDecorations, tabSize, startVisibleColumn, spaceWidth, middotWidth, wsmiddotWidth, stopRenderingLineAfter, renderWhitespace, renderControlCharacters, fontLigatures, selectionsOnLine, textDirection, verticalScrollbarSize, renderNewLineWhenEmpty = false) {
    this.useMonospaceOptimizations = useMonospaceOptimizations;
    this.canUseHalfwidthRightwardsArrow = canUseHalfwidthRightwardsArrow;
    this.lineContent = lineContent;
    this.continuesWithWrappedLine = continuesWithWrappedLine;
    this.isBasicASCII = isBasicASCII;
    this.containsRTL = containsRTL;
    this.fauxIndentLength = fauxIndentLength;
    this.lineTokens = lineTokens;
    this.lineDecorations = lineDecorations.sort(LineDecoration.compare);
    this.tabSize = tabSize;
    this.startVisibleColumn = startVisibleColumn;
    this.spaceWidth = spaceWidth;
    this.stopRenderingLineAfter = stopRenderingLineAfter;
    this.renderWhitespace = renderWhitespace === "all" ? 4 /* All */ : renderWhitespace === "boundary" ? 1 /* Boundary */ : renderWhitespace === "selection" ? 2 /* Selection */ : renderWhitespace === "trailing" ? 3 /* Trailing */ : 0 /* None */;
    this.renderControlCharacters = renderControlCharacters;
    this.fontLigatures = fontLigatures;
    this.selectionsOnLine = selectionsOnLine && selectionsOnLine.sort((a, b) => a.start < b.start ? -1 : 1);
    this.renderNewLineWhenEmpty = renderNewLineWhenEmpty;
    this.textDirection = textDirection;
    this.verticalScrollbarSize = verticalScrollbarSize;
    const wsmiddotDiff = Math.abs(wsmiddotWidth - spaceWidth);
    const middotDiff = Math.abs(middotWidth - spaceWidth);
    if (wsmiddotDiff < middotDiff) {
      this.renderSpaceWidth = wsmiddotWidth;
      this.renderSpaceCharCode = 11825;
    } else {
      this.renderSpaceWidth = middotWidth;
      this.renderSpaceCharCode = 183;
    }
  }
  sameSelection(otherSelections) {
    if (this.selectionsOnLine === null) {
      return otherSelections === null;
    }
    if (otherSelections === null) {
      return false;
    }
    if (otherSelections.length !== this.selectionsOnLine.length) {
      return false;
    }
    for (let i = 0; i < this.selectionsOnLine.length; i++) {
      if (!this.selectionsOnLine[i].equals(otherSelections[i])) {
        return false;
      }
    }
    return true;
  }
  equals(other) {
    return this.useMonospaceOptimizations === other.useMonospaceOptimizations && this.canUseHalfwidthRightwardsArrow === other.canUseHalfwidthRightwardsArrow && this.lineContent === other.lineContent && this.continuesWithWrappedLine === other.continuesWithWrappedLine && this.isBasicASCII === other.isBasicASCII && this.containsRTL === other.containsRTL && this.fauxIndentLength === other.fauxIndentLength && this.tabSize === other.tabSize && this.startVisibleColumn === other.startVisibleColumn && this.spaceWidth === other.spaceWidth && this.renderSpaceWidth === other.renderSpaceWidth && this.renderSpaceCharCode === other.renderSpaceCharCode && this.stopRenderingLineAfter === other.stopRenderingLineAfter && this.renderWhitespace === other.renderWhitespace && this.renderControlCharacters === other.renderControlCharacters && this.fontLigatures === other.fontLigatures && LineDecoration.equalsArr(this.lineDecorations, other.lineDecorations) && this.lineTokens.equals(other.lineTokens) && this.sameSelection(other.selectionsOnLine) && this.textDirection === other.textDirection && this.verticalScrollbarSize === other.verticalScrollbarSize && this.renderNewLineWhenEmpty === other.renderNewLineWhenEmpty;
  }
}
var CharacterMappingConstants = /* @__PURE__ */ ((CharacterMappingConstants2) => {
  CharacterMappingConstants2[CharacterMappingConstants2["PART_INDEX_MASK"] = 4294901760] = "PART_INDEX_MASK";
  CharacterMappingConstants2[CharacterMappingConstants2["CHAR_INDEX_MASK"] = 65535] = "CHAR_INDEX_MASK";
  CharacterMappingConstants2[CharacterMappingConstants2["CHAR_INDEX_OFFSET"] = 0] = "CHAR_INDEX_OFFSET";
  CharacterMappingConstants2[CharacterMappingConstants2["PART_INDEX_OFFSET"] = 16] = "PART_INDEX_OFFSET";
  return CharacterMappingConstants2;
})(CharacterMappingConstants || {});
class DomPosition {
  constructor(partIndex, charIndex) {
    this.partIndex = partIndex;
    this.charIndex = charIndex;
  }
}
class CharacterMapping {
  static getPartIndex(partData) {
    return (partData & 4294901760 /* PART_INDEX_MASK */) >>> 16 /* PART_INDEX_OFFSET */;
  }
  static getCharIndex(partData) {
    return (partData & 65535 /* CHAR_INDEX_MASK */) >>> 0 /* CHAR_INDEX_OFFSET */;
  }
  constructor(length, partCount) {
    this.length = length;
    this._data = new Uint32Array(this.length);
    this._horizontalOffset = new Uint32Array(this.length);
  }
  setColumnInfo(column, partIndex, charIndex, horizontalOffset) {
    const partData = (partIndex << 16 /* PART_INDEX_OFFSET */ | charIndex << 0 /* CHAR_INDEX_OFFSET */) >>> 0;
    this._data[column - 1] = partData;
    this._horizontalOffset[column - 1] = horizontalOffset;
  }
  getHorizontalOffset(column) {
    if (this._horizontalOffset.length === 0) {
      return 0;
    }
    return this._horizontalOffset[column - 1];
  }
  charOffsetToPartData(charOffset) {
    if (this.length === 0) {
      return 0;
    }
    if (charOffset < 0) {
      return this._data[0];
    }
    if (charOffset >= this.length) {
      return this._data[this.length - 1];
    }
    return this._data[charOffset];
  }
  getDomPosition(column) {
    const partData = this.charOffsetToPartData(column - 1);
    const partIndex = CharacterMapping.getPartIndex(partData);
    const charIndex = CharacterMapping.getCharIndex(partData);
    return new DomPosition(partIndex, charIndex);
  }
  getColumn(domPosition, partLength) {
    const charOffset = this.partDataToCharOffset(domPosition.partIndex, partLength, domPosition.charIndex);
    return charOffset + 1;
  }
  partDataToCharOffset(partIndex, partLength, charIndex) {
    if (this.length === 0) {
      return 0;
    }
    const searchEntry = (partIndex << 16 /* PART_INDEX_OFFSET */ | charIndex << 0 /* CHAR_INDEX_OFFSET */) >>> 0;
    let min = 0;
    let max = this.length - 1;
    while (min + 1 < max) {
      const mid = min + max >>> 1;
      const midEntry = this._data[mid];
      if (midEntry === searchEntry) {
        return mid;
      } else if (midEntry > searchEntry) {
        max = mid;
      } else {
        min = mid;
      }
    }
    if (min === max) {
      return min;
    }
    const minEntry = this._data[min];
    const maxEntry = this._data[max];
    if (minEntry === searchEntry) {
      return min;
    }
    if (maxEntry === searchEntry) {
      return max;
    }
    const minPartIndex = CharacterMapping.getPartIndex(minEntry);
    const minCharIndex = CharacterMapping.getCharIndex(minEntry);
    const maxPartIndex = CharacterMapping.getPartIndex(maxEntry);
    let maxCharIndex;
    if (minPartIndex !== maxPartIndex) {
      maxCharIndex = partLength;
    } else {
      maxCharIndex = CharacterMapping.getCharIndex(maxEntry);
    }
    const minEntryDistance = charIndex - minCharIndex;
    const maxEntryDistance = maxCharIndex - charIndex;
    if (minEntryDistance <= maxEntryDistance) {
      return min;
    }
    return max;
  }
  inflate() {
    const result = [];
    for (let i = 0; i < this.length; i++) {
      const partData = this._data[i];
      const partIndex = CharacterMapping.getPartIndex(partData);
      const charIndex = CharacterMapping.getCharIndex(partData);
      const visibleColumn = this._horizontalOffset[i];
      result.push([partIndex, charIndex, visibleColumn]);
    }
    return result;
  }
}
var ForeignElementType = /* @__PURE__ */ ((ForeignElementType2) => {
  ForeignElementType2[ForeignElementType2["None"] = 0] = "None";
  ForeignElementType2[ForeignElementType2["Before"] = 1] = "Before";
  ForeignElementType2[ForeignElementType2["After"] = 2] = "After";
  return ForeignElementType2;
})(ForeignElementType || {});
class RenderLineOutput {
  constructor(characterMapping, containsForeignElements) {
    this._renderLineOutputBrand = void 0;
    this.characterMapping = characterMapping;
    this.containsForeignElements = containsForeignElements;
  }
}
function renderViewLine(input, sb) {
  if (input.lineContent.length === 0) {
    if (input.lineDecorations.length > 0) {
      sb.appendString(`<span>`);
      let beforeCount = 0;
      let afterCount = 0;
      let containsForeignElements = 0 /* None */;
      for (const lineDecoration of input.lineDecorations) {
        if (lineDecoration.type === InlineDecorationType.Before || lineDecoration.type === InlineDecorationType.After) {
          sb.appendString(`<span class="`);
          sb.appendString(lineDecoration.className);
          sb.appendString(`"></span>`);
          if (lineDecoration.type === InlineDecorationType.Before) {
            containsForeignElements |= 1 /* Before */;
            beforeCount++;
          }
          if (lineDecoration.type === InlineDecorationType.After) {
            containsForeignElements |= 2 /* After */;
            afterCount++;
          }
        }
      }
      sb.appendString(`</span>`);
      const characterMapping = new CharacterMapping(1, beforeCount + afterCount);
      characterMapping.setColumnInfo(1, beforeCount, 0, 0);
      return new RenderLineOutput(
        characterMapping,
        containsForeignElements
      );
    }
    if (input.renderNewLineWhenEmpty) {
      sb.appendString("<span><span>\n</span></span>");
    } else {
      sb.appendString("<span><span></span></span>");
    }
    return new RenderLineOutput(
      new CharacterMapping(0, 0),
      0 /* None */
    );
  }
  return _renderLine(resolveRenderLineInput(input), sb);
}
class RenderLineOutput2 {
  constructor(characterMapping, html, containsForeignElements) {
    this.characterMapping = characterMapping;
    this.html = html;
    this.containsForeignElements = containsForeignElements;
  }
}
function renderViewLine2(input) {
  const sb = new StringBuilder(1e4);
  const out = renderViewLine(input, sb);
  return new RenderLineOutput2(out.characterMapping, sb.build(), out.containsForeignElements);
}
class ResolvedRenderLineInput {
  constructor(fontIsMonospace, canUseHalfwidthRightwardsArrow, lineContent, len, isOverflowing, overflowingCharCount, parts, containsForeignElements, fauxIndentLength, tabSize, startVisibleColumn, spaceWidth, renderSpaceCharCode, renderWhitespace, renderControlCharacters) {
    this.fontIsMonospace = fontIsMonospace;
    this.canUseHalfwidthRightwardsArrow = canUseHalfwidthRightwardsArrow;
    this.lineContent = lineContent;
    this.len = len;
    this.isOverflowing = isOverflowing;
    this.overflowingCharCount = overflowingCharCount;
    this.parts = parts;
    this.containsForeignElements = containsForeignElements;
    this.fauxIndentLength = fauxIndentLength;
    this.tabSize = tabSize;
    this.startVisibleColumn = startVisibleColumn;
    this.spaceWidth = spaceWidth;
    this.renderSpaceCharCode = renderSpaceCharCode;
    this.renderWhitespace = renderWhitespace;
    this.renderControlCharacters = renderControlCharacters;
  }
}
function resolveRenderLineInput(input) {
  const lineContent = input.lineContent;
  let isOverflowing;
  let overflowingCharCount;
  let len;
  if (input.stopRenderingLineAfter !== -1 && input.stopRenderingLineAfter < lineContent.length) {
    isOverflowing = true;
    overflowingCharCount = lineContent.length - input.stopRenderingLineAfter;
    len = input.stopRenderingLineAfter;
  } else {
    isOverflowing = false;
    overflowingCharCount = 0;
    len = lineContent.length;
  }
  let tokens = transformAndRemoveOverflowing(lineContent, input.containsRTL, input.lineTokens, input.fauxIndentLength, len);
  if (input.renderControlCharacters && !input.isBasicASCII) {
    tokens = extractControlCharacters(lineContent, tokens);
  }
  if (input.renderWhitespace === 4 /* All */ || input.renderWhitespace === 1 /* Boundary */ || input.renderWhitespace === 2 /* Selection */ && !!input.selectionsOnLine || input.renderWhitespace === 3 /* Trailing */ && !input.continuesWithWrappedLine) {
    tokens = _applyRenderWhitespace(input, lineContent, len, tokens);
  }
  let containsForeignElements = 0 /* None */;
  if (input.lineDecorations.length > 0) {
    for (let i = 0, len2 = input.lineDecorations.length; i < len2; i++) {
      const lineDecoration = input.lineDecorations[i];
      if (lineDecoration.type === InlineDecorationType.RegularAffectingLetterSpacing) {
        containsForeignElements |= 1 /* Before */;
      } else if (lineDecoration.type === InlineDecorationType.Before) {
        containsForeignElements |= 1 /* Before */;
      } else if (lineDecoration.type === InlineDecorationType.After) {
        containsForeignElements |= 2 /* After */;
      }
    }
    tokens = _applyInlineDecorations(lineContent, len, tokens, input.lineDecorations);
  }
  if (!input.containsRTL) {
    tokens = splitLargeTokens(lineContent, tokens, !input.isBasicASCII || input.fontLigatures);
  } else {
    tokens = splitLeadingWhitespaceFromRTL(lineContent, tokens);
  }
  return new ResolvedRenderLineInput(
    input.useMonospaceOptimizations,
    input.canUseHalfwidthRightwardsArrow,
    lineContent,
    len,
    isOverflowing,
    overflowingCharCount,
    tokens,
    containsForeignElements,
    input.fauxIndentLength,
    input.tabSize,
    input.startVisibleColumn,
    input.spaceWidth,
    input.renderSpaceCharCode,
    input.renderWhitespace,
    input.renderControlCharacters
  );
}
function transformAndRemoveOverflowing(lineContent, lineContainsRTL, tokens, fauxIndentLength, len) {
  const result = [];
  let resultLen = 0;
  if (fauxIndentLength > 0) {
    result[resultLen++] = new LinePart(fauxIndentLength, "", 0, false);
  }
  let startOffset = fauxIndentLength;
  for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
    const endIndex = tokens.getEndOffset(tokenIndex);
    if (endIndex <= fauxIndentLength) {
      continue;
    }
    const type = tokens.getClassName(tokenIndex);
    if (endIndex >= len) {
      const tokenContainsRTL2 = lineContainsRTL ? strings.containsRTL(lineContent.substring(startOffset, len)) : false;
      result[resultLen++] = new LinePart(len, type, 0, tokenContainsRTL2);
      break;
    }
    const tokenContainsRTL = lineContainsRTL ? strings.containsRTL(lineContent.substring(startOffset, endIndex)) : false;
    result[resultLen++] = new LinePart(endIndex, type, 0, tokenContainsRTL);
    startOffset = endIndex;
  }
  return result;
}
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["LongToken"] = 50] = "LongToken";
  return Constants2;
})(Constants || {});
function splitLargeTokens(lineContent, tokens, onlyAtSpaces) {
  let lastTokenEndIndex = 0;
  const result = [];
  let resultLen = 0;
  if (onlyAtSpaces) {
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const tokenEndIndex = token.endIndex;
      if (lastTokenEndIndex + 50 /* LongToken */ < tokenEndIndex) {
        const tokenType = token.type;
        const tokenMetadata = token.metadata;
        const tokenContainsRTL = token.containsRTL;
        let lastSpaceOffset = -1;
        let currTokenStart = lastTokenEndIndex;
        for (let j = lastTokenEndIndex; j < tokenEndIndex; j++) {
          if (lineContent.charCodeAt(j) === CharCode.Space) {
            lastSpaceOffset = j;
          }
          if (lastSpaceOffset !== -1 && j - currTokenStart >= 50 /* LongToken */) {
            result[resultLen++] = new LinePart(lastSpaceOffset + 1, tokenType, tokenMetadata, tokenContainsRTL);
            currTokenStart = lastSpaceOffset + 1;
            lastSpaceOffset = -1;
          }
        }
        if (currTokenStart !== tokenEndIndex) {
          result[resultLen++] = new LinePart(tokenEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
        }
      } else {
        result[resultLen++] = token;
      }
      lastTokenEndIndex = tokenEndIndex;
    }
  } else {
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const tokenEndIndex = token.endIndex;
      const diff = tokenEndIndex - lastTokenEndIndex;
      if (diff > 50 /* LongToken */) {
        const tokenType = token.type;
        const tokenMetadata = token.metadata;
        const tokenContainsRTL = token.containsRTL;
        const piecesCount = Math.ceil(diff / 50 /* LongToken */);
        for (let j = 1; j < piecesCount; j++) {
          const pieceEndIndex = lastTokenEndIndex + j * 50 /* LongToken */;
          result[resultLen++] = new LinePart(pieceEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
        }
        result[resultLen++] = new LinePart(tokenEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
      } else {
        result[resultLen++] = token;
      }
      lastTokenEndIndex = tokenEndIndex;
    }
  }
  return result;
}
function splitLeadingWhitespaceFromRTL(lineContent, tokens) {
  if (tokens.length === 0) {
    return tokens;
  }
  const firstToken = tokens[0];
  if (!firstToken.containsRTL) {
    return tokens;
  }
  const firstTokenEndIndex = firstToken.endIndex;
  let firstNonWhitespaceIndex = 0;
  for (let i = 0; i < firstTokenEndIndex; i++) {
    const charCode = lineContent.charCodeAt(i);
    if (charCode !== CharCode.Space && charCode !== CharCode.Tab) {
      firstNonWhitespaceIndex = i;
      break;
    }
  }
  if (firstNonWhitespaceIndex === 0) {
    return tokens;
  }
  const result = [];
  result.push(new LinePart(firstNonWhitespaceIndex, firstToken.type, firstToken.metadata, false));
  result.push(new LinePart(firstTokenEndIndex, firstToken.type, firstToken.metadata, firstToken.containsRTL));
  for (let i = 1; i < tokens.length; i++) {
    result.push(tokens[i]);
  }
  return result;
}
function isControlCharacter(charCode) {
  if (charCode < 32) {
    return charCode !== CharCode.Tab;
  }
  if (charCode === 127) {
    return true;
  }
  if (charCode >= 8234 && charCode <= 8238 || charCode >= 8294 && charCode <= 8297 || charCode >= 8206 && charCode <= 8207 || charCode === 1564) {
    return true;
  }
  return false;
}
function extractControlCharacters(lineContent, tokens) {
  const result = [];
  let lastLinePart = new LinePart(0, "", 0, false);
  let charOffset = 0;
  for (const token of tokens) {
    const tokenEndIndex = token.endIndex;
    for (; charOffset < tokenEndIndex; charOffset++) {
      const charCode = lineContent.charCodeAt(charOffset);
      if (isControlCharacter(charCode)) {
        if (charOffset > lastLinePart.endIndex) {
          lastLinePart = new LinePart(charOffset, token.type, token.metadata, token.containsRTL);
          result.push(lastLinePart);
        }
        lastLinePart = new LinePart(charOffset + 1, "mtkcontrol", token.metadata, false);
        result.push(lastLinePart);
      }
    }
    if (charOffset > lastLinePart.endIndex) {
      lastLinePart = new LinePart(tokenEndIndex, token.type, token.metadata, token.containsRTL);
      result.push(lastLinePart);
    }
  }
  return result;
}
function _applyRenderWhitespace(input, lineContent, len, tokens) {
  const continuesWithWrappedLine = input.continuesWithWrappedLine;
  const fauxIndentLength = input.fauxIndentLength;
  const tabSize = input.tabSize;
  const startVisibleColumn = input.startVisibleColumn;
  const useMonospaceOptimizations = input.useMonospaceOptimizations;
  const selections = input.selectionsOnLine;
  const onlyBoundary = input.renderWhitespace === 1 /* Boundary */;
  const onlyTrailing = input.renderWhitespace === 3 /* Trailing */;
  const generateLinePartForEachWhitespace = input.renderSpaceWidth !== input.spaceWidth;
  const result = [];
  let resultLen = 0;
  let tokenIndex = 0;
  let tokenType = tokens[tokenIndex].type;
  let tokenContainsRTL = tokens[tokenIndex].containsRTL;
  let tokenEndIndex = tokens[tokenIndex].endIndex;
  const tokensLength = tokens.length;
  let lineIsEmptyOrWhitespace = false;
  let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
  let lastNonWhitespaceIndex;
  if (firstNonWhitespaceIndex === -1) {
    lineIsEmptyOrWhitespace = true;
    firstNonWhitespaceIndex = len;
    lastNonWhitespaceIndex = len;
  } else {
    lastNonWhitespaceIndex = strings.lastNonWhitespaceIndex(lineContent);
  }
  let wasInWhitespace = false;
  let currentSelectionIndex = 0;
  let currentSelection = selections && selections[currentSelectionIndex];
  let tmpIndent = startVisibleColumn % tabSize;
  for (let charIndex = fauxIndentLength; charIndex < len; charIndex++) {
    const chCode = lineContent.charCodeAt(charIndex);
    if (currentSelection && currentSelection.endExclusive <= charIndex) {
      currentSelectionIndex++;
      currentSelection = selections && selections[currentSelectionIndex];
    }
    let isInWhitespace;
    if (charIndex < firstNonWhitespaceIndex || charIndex > lastNonWhitespaceIndex) {
      isInWhitespace = true;
    } else if (chCode === CharCode.Tab) {
      isInWhitespace = true;
    } else if (chCode === CharCode.Space) {
      if (onlyBoundary) {
        if (wasInWhitespace) {
          isInWhitespace = true;
        } else {
          const nextChCode = charIndex + 1 < len ? lineContent.charCodeAt(charIndex + 1) : CharCode.Null;
          isInWhitespace = nextChCode === CharCode.Space || nextChCode === CharCode.Tab;
        }
      } else {
        isInWhitespace = true;
      }
    } else {
      isInWhitespace = false;
    }
    if (isInWhitespace && selections) {
      isInWhitespace = !!currentSelection && currentSelection.start <= charIndex && charIndex < currentSelection.endExclusive;
    }
    if (isInWhitespace && onlyTrailing) {
      isInWhitespace = lineIsEmptyOrWhitespace || charIndex > lastNonWhitespaceIndex;
    }
    if (isInWhitespace && tokenContainsRTL) {
      if (charIndex >= firstNonWhitespaceIndex && charIndex <= lastNonWhitespaceIndex) {
        isInWhitespace = false;
      }
    }
    if (wasInWhitespace) {
      if (!isInWhitespace || !useMonospaceOptimizations && tmpIndent >= tabSize) {
        if (generateLinePartForEachWhitespace) {
          const lastEndIndex = resultLen > 0 ? result[resultLen - 1].endIndex : fauxIndentLength;
          for (let i = lastEndIndex + 1; i <= charIndex; i++) {
            result[resultLen++] = new LinePart(i, "mtkw", LinePartMetadata.IS_WHITESPACE, false);
          }
        } else {
          result[resultLen++] = new LinePart(charIndex, "mtkw", LinePartMetadata.IS_WHITESPACE, false);
        }
        tmpIndent = tmpIndent % tabSize;
      }
    } else {
      if (charIndex === tokenEndIndex || isInWhitespace && charIndex > fauxIndentLength) {
        result[resultLen++] = new LinePart(charIndex, tokenType, 0, tokenContainsRTL);
        tmpIndent = tmpIndent % tabSize;
      }
    }
    if (chCode === CharCode.Tab) {
      tmpIndent = tabSize;
    } else if (strings.isFullWidthCharacter(chCode)) {
      tmpIndent += 2;
    } else {
      tmpIndent++;
    }
    wasInWhitespace = isInWhitespace;
    while (charIndex === tokenEndIndex) {
      tokenIndex++;
      if (tokenIndex < tokensLength) {
        tokenType = tokens[tokenIndex].type;
        tokenContainsRTL = tokens[tokenIndex].containsRTL;
        tokenEndIndex = tokens[tokenIndex].endIndex;
      } else {
        break;
      }
    }
  }
  let generateWhitespace = false;
  if (wasInWhitespace) {
    if (continuesWithWrappedLine && onlyBoundary) {
      const lastCharCode = len > 0 ? lineContent.charCodeAt(len - 1) : CharCode.Null;
      const prevCharCode = len > 1 ? lineContent.charCodeAt(len - 2) : CharCode.Null;
      const isSingleTrailingSpace = lastCharCode === CharCode.Space && (prevCharCode !== CharCode.Space && prevCharCode !== CharCode.Tab);
      if (!isSingleTrailingSpace) {
        generateWhitespace = true;
      }
    } else {
      generateWhitespace = true;
    }
  }
  if (generateWhitespace) {
    if (generateLinePartForEachWhitespace) {
      const lastEndIndex = resultLen > 0 ? result[resultLen - 1].endIndex : fauxIndentLength;
      for (let i = lastEndIndex + 1; i <= len; i++) {
        result[resultLen++] = new LinePart(i, "mtkw", LinePartMetadata.IS_WHITESPACE, false);
      }
    } else {
      result[resultLen++] = new LinePart(len, "mtkw", LinePartMetadata.IS_WHITESPACE, false);
    }
  } else {
    result[resultLen++] = new LinePart(len, tokenType, 0, tokenContainsRTL);
  }
  return result;
}
function _applyInlineDecorations(lineContent, len, tokens, _lineDecorations) {
  _lineDecorations.sort(LineDecoration.compare);
  const lineDecorations = LineDecorationsNormalizer.normalize(lineContent, _lineDecorations);
  const lineDecorationsLen = lineDecorations.length;
  let lineDecorationIndex = 0;
  const result = [];
  let resultLen = 0;
  let lastResultEndIndex = 0;
  for (let tokenIndex = 0, len2 = tokens.length; tokenIndex < len2; tokenIndex++) {
    const token = tokens[tokenIndex];
    const tokenEndIndex = token.endIndex;
    const tokenType = token.type;
    const tokenMetadata = token.metadata;
    const tokenContainsRTL = token.containsRTL;
    while (lineDecorationIndex < lineDecorationsLen && lineDecorations[lineDecorationIndex].startOffset < tokenEndIndex) {
      const lineDecoration = lineDecorations[lineDecorationIndex];
      if (lineDecoration.startOffset > lastResultEndIndex) {
        lastResultEndIndex = lineDecoration.startOffset;
        result[resultLen++] = new LinePart(lastResultEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
      }
      if (lineDecoration.endOffset + 1 <= tokenEndIndex) {
        lastResultEndIndex = lineDecoration.endOffset + 1;
        result[resultLen++] = new LinePart(lastResultEndIndex, tokenType + " " + lineDecoration.className, tokenMetadata | lineDecoration.metadata, tokenContainsRTL);
        lineDecorationIndex++;
      } else {
        lastResultEndIndex = tokenEndIndex;
        result[resultLen++] = new LinePart(lastResultEndIndex, tokenType + " " + lineDecoration.className, tokenMetadata | lineDecoration.metadata, tokenContainsRTL);
        break;
      }
    }
    if (tokenEndIndex > lastResultEndIndex) {
      lastResultEndIndex = tokenEndIndex;
      result[resultLen++] = new LinePart(lastResultEndIndex, tokenType, tokenMetadata, tokenContainsRTL);
    }
  }
  const lastTokenEndIndex = tokens[tokens.length - 1].endIndex;
  if (lineDecorationIndex < lineDecorationsLen && lineDecorations[lineDecorationIndex].startOffset === lastTokenEndIndex) {
    while (lineDecorationIndex < lineDecorationsLen && lineDecorations[lineDecorationIndex].startOffset === lastTokenEndIndex) {
      const lineDecoration = lineDecorations[lineDecorationIndex];
      result[resultLen++] = new LinePart(lastResultEndIndex, lineDecoration.className, lineDecoration.metadata, false);
      lineDecorationIndex++;
    }
  }
  return result;
}
function _renderLine(input, sb) {
  const fontIsMonospace = input.fontIsMonospace;
  const canUseHalfwidthRightwardsArrow = input.canUseHalfwidthRightwardsArrow;
  const containsForeignElements = input.containsForeignElements;
  const lineContent = input.lineContent;
  const len = input.len;
  const isOverflowing = input.isOverflowing;
  const overflowingCharCount = input.overflowingCharCount;
  const parts = input.parts;
  const fauxIndentLength = input.fauxIndentLength;
  const tabSize = input.tabSize;
  const startVisibleColumn = input.startVisibleColumn;
  const spaceWidth = input.spaceWidth;
  const renderSpaceCharCode = input.renderSpaceCharCode;
  const renderWhitespace = input.renderWhitespace;
  const renderControlCharacters = input.renderControlCharacters;
  const characterMapping = new CharacterMapping(len + 1, parts.length);
  let lastCharacterMappingDefined = false;
  let charIndex = 0;
  let visibleColumn = startVisibleColumn;
  let charOffsetInPart = 0;
  let charHorizontalOffset = 0;
  let partDisplacement = 0;
  sb.appendString("<span>");
  for (let partIndex = 0, tokensLen = parts.length; partIndex < tokensLen; partIndex++) {
    const part = parts[partIndex];
    const partEndIndex = part.endIndex;
    const partType = part.type;
    const partContainsRTL = part.containsRTL;
    const partRendersWhitespace = renderWhitespace !== 0 /* None */ && part.isWhitespace();
    const partRendersWhitespaceWithWidth = partRendersWhitespace && !fontIsMonospace && (partType === "mtkw" || !containsForeignElements);
    const partIsEmptyAndHasPseudoAfter = charIndex === partEndIndex && part.isPseudoAfter();
    charOffsetInPart = 0;
    sb.appendString("<span ");
    if (partContainsRTL) {
      sb.appendString('style="unicode-bidi:isolate" ');
    }
    sb.appendString('class="');
    sb.appendString(partRendersWhitespaceWithWidth ? "mtkz" : partType);
    sb.appendASCIICharCode(CharCode.DoubleQuote);
    if (partRendersWhitespace) {
      let partWidth = 0;
      {
        let _charIndex = charIndex;
        let _visibleColumn = visibleColumn;
        for (; _charIndex < partEndIndex; _charIndex++) {
          const charCode = lineContent.charCodeAt(_charIndex);
          const charWidth = (charCode === CharCode.Tab ? tabSize - _visibleColumn % tabSize : 1) | 0;
          partWidth += charWidth;
          if (_charIndex >= fauxIndentLength) {
            _visibleColumn += charWidth;
          }
        }
      }
      if (partRendersWhitespaceWithWidth) {
        sb.appendString(' style="width:');
        sb.appendString(String(spaceWidth * partWidth));
        sb.appendString('px"');
      }
      sb.appendASCIICharCode(CharCode.GreaterThan);
      for (; charIndex < partEndIndex; charIndex++) {
        characterMapping.setColumnInfo(charIndex + 1, partIndex - partDisplacement, charOffsetInPart, charHorizontalOffset);
        partDisplacement = 0;
        const charCode = lineContent.charCodeAt(charIndex);
        let producedCharacters;
        let charWidth;
        if (charCode === CharCode.Tab) {
          producedCharacters = tabSize - visibleColumn % tabSize | 0;
          charWidth = producedCharacters;
          if (!canUseHalfwidthRightwardsArrow || charWidth > 1) {
            sb.appendCharCode(8594);
          } else {
            sb.appendCharCode(65515);
          }
          for (let space = 2; space <= charWidth; space++) {
            sb.appendCharCode(160);
          }
        } else {
          producedCharacters = 2;
          charWidth = 1;
          sb.appendCharCode(renderSpaceCharCode);
          sb.appendCharCode(8204);
        }
        charOffsetInPart += producedCharacters;
        charHorizontalOffset += charWidth;
        if (charIndex >= fauxIndentLength) {
          visibleColumn += charWidth;
        }
      }
    } else {
      sb.appendASCIICharCode(CharCode.GreaterThan);
      for (; charIndex < partEndIndex; charIndex++) {
        characterMapping.setColumnInfo(charIndex + 1, partIndex - partDisplacement, charOffsetInPart, charHorizontalOffset);
        partDisplacement = 0;
        const charCode = lineContent.charCodeAt(charIndex);
        let producedCharacters = 1;
        let charWidth = 1;
        switch (charCode) {
          case CharCode.Tab:
            producedCharacters = tabSize - visibleColumn % tabSize;
            charWidth = producedCharacters;
            for (let space = 1; space <= producedCharacters; space++) {
              sb.appendCharCode(160);
            }
            break;
          case CharCode.Space:
            sb.appendCharCode(160);
            break;
          case CharCode.LessThan:
            sb.appendString("&lt;");
            break;
          case CharCode.GreaterThan:
            sb.appendString("&gt;");
            break;
          case CharCode.Ampersand:
            sb.appendString("&amp;");
            break;
          case CharCode.Null:
            if (renderControlCharacters) {
              sb.appendCharCode(9216);
            } else {
              sb.appendString("&#00;");
            }
            break;
          case CharCode.UTF8_BOM:
          case CharCode.LINE_SEPARATOR:
          case CharCode.PARAGRAPH_SEPARATOR:
          case CharCode.NEXT_LINE:
            sb.appendCharCode(65533);
            break;
          default:
            if (strings.isFullWidthCharacter(charCode)) {
              charWidth++;
            }
            if (renderControlCharacters && charCode < 32) {
              sb.appendCharCode(9216 + charCode);
            } else if (renderControlCharacters && charCode === 127) {
              sb.appendCharCode(9249);
            } else if (renderControlCharacters && isControlCharacter(charCode)) {
              sb.appendString("[U+");
              sb.appendString(to4CharHex(charCode));
              sb.appendString("]");
              producedCharacters = 8;
              charWidth = producedCharacters;
            } else {
              sb.appendCharCode(charCode);
            }
        }
        charOffsetInPart += producedCharacters;
        charHorizontalOffset += charWidth;
        if (charIndex >= fauxIndentLength) {
          visibleColumn += charWidth;
        }
      }
    }
    if (partIsEmptyAndHasPseudoAfter) {
      partDisplacement++;
    } else {
      partDisplacement = 0;
    }
    if (charIndex >= len && !lastCharacterMappingDefined && part.isPseudoAfter()) {
      lastCharacterMappingDefined = true;
      characterMapping.setColumnInfo(charIndex + 1, partIndex, charOffsetInPart, charHorizontalOffset);
    }
    sb.appendString("</span>");
  }
  if (!lastCharacterMappingDefined) {
    characterMapping.setColumnInfo(len + 1, parts.length - 1, charOffsetInPart, charHorizontalOffset);
  }
  if (isOverflowing) {
    sb.appendString('<span class="mtkoverflow">');
    sb.appendString(nls.localize("showMore", "Show more ({0})", renderOverflowingCharCount(overflowingCharCount)));
    sb.appendString("</span>");
  }
  sb.appendString("</span>");
  return new RenderLineOutput(characterMapping, containsForeignElements);
}
function to4CharHex(n) {
  return n.toString(16).toUpperCase().padStart(4, "0");
}
function renderOverflowingCharCount(n) {
  if (n < 1024) {
    return nls.localize("overflow.chars", "{0} chars", n);
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export {
  CharacterMapping,
  DomPosition,
  ForeignElementType,
  RenderLineInput,
  RenderLineOutput,
  RenderLineOutput2,
  RenderWhitespace,
  renderViewLine,
  renderViewLine2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdmlld0xheW91dFxcdmlld0xpbmVSZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVZpZXdMaW5lVG9rZW5zIH0gZnJvbSAnLi4vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgU3RyaW5nQnVpbGRlciB9IGZyb20gJy4uL2NvcmUvc3RyaW5nQnVpbGRlci5qcyc7XG5pbXBvcnQgeyBMaW5lRGVjb3JhdGlvbiwgTGluZURlY29yYXRpb25zTm9ybWFsaXplciB9IGZyb20gJy4vbGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IExpbmVQYXJ0LCBMaW5lUGFydE1ldGFkYXRhIH0gZnJvbSAnLi9saW5lUGFydC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb25UeXBlIH0gZnJvbSAnLi4vdmlld01vZGVsL2lubGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IFRleHREaXJlY3Rpb24gfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFJlbmRlcldoaXRlc3BhY2Uge1xuXHROb25lID0gMCxcblx0Qm91bmRhcnkgPSAxLFxuXHRTZWxlY3Rpb24gPSAyLFxuXHRUcmFpbGluZyA9IDMsXG5cdEFsbCA9IDRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVuZGVyTGluZUlucHV0T3B0aW9ucyB7XG5cdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IGJvb2xlYW47XG5cdGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogYm9vbGVhbjtcblx0bGluZUNvbnRlbnQ6IHN0cmluZztcblx0Y29udGludWVzV2l0aFdyYXBwZWRMaW5lOiBib29sZWFuO1xuXHRpc0Jhc2ljQVNDSUk6IGJvb2xlYW47XG5cdGNvbnRhaW5zUlRMOiBib29sZWFuO1xuXHRmYXV4SW5kZW50TGVuZ3RoOiBudW1iZXI7XG5cdGxpbmVUb2tlbnM6IElWaWV3TGluZVRva2Vucztcblx0bGluZURlY29yYXRpb25zOiBMaW5lRGVjb3JhdGlvbltdO1xuXHR0YWJTaXplOiBudW1iZXI7XG5cdHN0YXJ0VmlzaWJsZUNvbHVtbjogbnVtYmVyO1xuXHRzcGFjZVdpZHRoOiBudW1iZXI7XG5cdG1pZGRvdFdpZHRoOiBudW1iZXI7XG5cdHdzbWlkZG90V2lkdGg6IG51bWJlcjtcblx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogbnVtYmVyO1xuXHRyZW5kZXJXaGl0ZXNwYWNlOiAnbm9uZScgfCAnYm91bmRhcnknIHwgJ3NlbGVjdGlvbicgfCAndHJhaWxpbmcnIHwgJ2FsbCc7XG5cdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzOiBib29sZWFuO1xuXHRmb250TGlnYXR1cmVzOiBib29sZWFuO1xuXHRzZWxlY3Rpb25zT25MaW5lOiBPZmZzZXRSYW5nZVtdIHwgbnVsbDtcblx0dGV4dERpcmVjdGlvbjogVGV4dERpcmVjdGlvbiB8IG51bGw7XG5cdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogbnVtYmVyO1xuXHRyZW5kZXJOZXdMaW5lV2hlbkVtcHR5OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgUmVuZGVyTGluZUlucHV0IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGxpbmVDb250ZW50OiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBjb250aW51ZXNXaXRoV3JhcHBlZExpbmU6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBpc0Jhc2ljQVNDSUk6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBjb250YWluc1JUTDogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGZhdXhJbmRlbnRMZW5ndGg6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGxpbmVUb2tlbnM6IElWaWV3TGluZVRva2Vucztcblx0cHVibGljIHJlYWRvbmx5IGxpbmVEZWNvcmF0aW9uczogTGluZURlY29yYXRpb25bXTtcblx0cHVibGljIHJlYWRvbmx5IHRhYlNpemU6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IHN0YXJ0VmlzaWJsZUNvbHVtbjogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3BhY2VXaWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyU3BhY2VXaWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyU3BhY2VDaGFyQ29kZTogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyV2hpdGVzcGFjZTogUmVuZGVyV2hpdGVzcGFjZTtcblx0cHVibGljIHJlYWRvbmx5IHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgZm9udExpZ2F0dXJlczogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IHRleHREaXJlY3Rpb246IFRleHREaXJlY3Rpb24gfCBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgdmVydGljYWxTY3JvbGxiYXJTaXplOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIERlZmluZWQgb25seSB3aGVuIHJlbmRlcldoaXRlc3BhY2UgaXMgJ3NlbGVjdGlvbicuIFNlbGVjdGlvbnMgYXJlIG5vbi1vdmVybGFwcGluZyxcblx0ICogYW5kIG9yZGVyZWQgYnkgcG9zaXRpb24gd2l0aGluIHRoZSBsaW5lLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHNlbGVjdGlvbnNPbkxpbmU6IE9mZnNldFJhbmdlW10gfCBudWxsO1xuXHQvKipcblx0ICogV2hlbiByZW5kZXJpbmcgYW4gZW1wdHkgbGluZSwgd2hldGhlciB0byByZW5kZXIgYSBuZXcgbGluZSBpbnN0ZWFkXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyTmV3TGluZVdoZW5FbXB0eTogYm9vbGVhbjtcblxuXHRwdWJsaWMgZ2V0IGlzTFRSKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5jb250YWluc1JUTCAmJiB0aGlzLnRleHREaXJlY3Rpb24gIT09IFRleHREaXJlY3Rpb24uUlRMO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogYm9vbGVhbixcblx0XHRjYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3c6IGJvb2xlYW4sXG5cdFx0bGluZUNvbnRlbnQ6IHN0cmluZyxcblx0XHRjb250aW51ZXNXaXRoV3JhcHBlZExpbmU6IGJvb2xlYW4sXG5cdFx0aXNCYXNpY0FTQ0lJOiBib29sZWFuLFxuXHRcdGNvbnRhaW5zUlRMOiBib29sZWFuLFxuXHRcdGZhdXhJbmRlbnRMZW5ndGg6IG51bWJlcixcblx0XHRsaW5lVG9rZW5zOiBJVmlld0xpbmVUb2tlbnMsXG5cdFx0bGluZURlY29yYXRpb25zOiBMaW5lRGVjb3JhdGlvbltdLFxuXHRcdHRhYlNpemU6IG51bWJlcixcblx0XHRzdGFydFZpc2libGVDb2x1bW46IG51bWJlcixcblx0XHRzcGFjZVdpZHRoOiBudW1iZXIsXG5cdFx0bWlkZG90V2lkdGg6IG51bWJlcixcblx0XHR3c21pZGRvdFdpZHRoOiBudW1iZXIsXG5cdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogbnVtYmVyLFxuXHRcdHJlbmRlcldoaXRlc3BhY2U6ICdub25lJyB8ICdib3VuZGFyeScgfCAnc2VsZWN0aW9uJyB8ICd0cmFpbGluZycgfCAnYWxsJyxcblx0XHRyZW5kZXJDb250cm9sQ2hhcmFjdGVyczogYm9vbGVhbixcblx0XHRmb250TGlnYXR1cmVzOiBib29sZWFuLFxuXHRcdHNlbGVjdGlvbnNPbkxpbmU6IE9mZnNldFJhbmdlW10gfCBudWxsLFxuXHRcdHRleHREaXJlY3Rpb246IFRleHREaXJlY3Rpb24gfCBudWxsLFxuXHRcdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogbnVtYmVyLFxuXHRcdHJlbmRlck5ld0xpbmVXaGVuRW1wdHk6IGJvb2xlYW4gPSBmYWxzZSxcblx0KSB7XG5cdFx0dGhpcy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zID0gdXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucztcblx0XHR0aGlzLmNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyA9IGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdztcblx0XHR0aGlzLmxpbmVDb250ZW50ID0gbGluZUNvbnRlbnQ7XG5cdFx0dGhpcy5jb250aW51ZXNXaXRoV3JhcHBlZExpbmUgPSBjb250aW51ZXNXaXRoV3JhcHBlZExpbmU7XG5cdFx0dGhpcy5pc0Jhc2ljQVNDSUkgPSBpc0Jhc2ljQVNDSUk7XG5cdFx0dGhpcy5jb250YWluc1JUTCA9IGNvbnRhaW5zUlRMO1xuXHRcdHRoaXMuZmF1eEluZGVudExlbmd0aCA9IGZhdXhJbmRlbnRMZW5ndGg7XG5cdFx0dGhpcy5saW5lVG9rZW5zID0gbGluZVRva2Vucztcblx0XHR0aGlzLmxpbmVEZWNvcmF0aW9ucyA9IGxpbmVEZWNvcmF0aW9ucy5zb3J0KExpbmVEZWNvcmF0aW9uLmNvbXBhcmUpO1xuXHRcdHRoaXMudGFiU2l6ZSA9IHRhYlNpemU7XG5cdFx0dGhpcy5zdGFydFZpc2libGVDb2x1bW4gPSBzdGFydFZpc2libGVDb2x1bW47XG5cdFx0dGhpcy5zcGFjZVdpZHRoID0gc3BhY2VXaWR0aDtcblx0XHR0aGlzLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgPSBzdG9wUmVuZGVyaW5nTGluZUFmdGVyO1xuXHRcdHRoaXMucmVuZGVyV2hpdGVzcGFjZSA9IChcblx0XHRcdHJlbmRlcldoaXRlc3BhY2UgPT09ICdhbGwnXG5cdFx0XHRcdD8gUmVuZGVyV2hpdGVzcGFjZS5BbGxcblx0XHRcdFx0OiByZW5kZXJXaGl0ZXNwYWNlID09PSAnYm91bmRhcnknXG5cdFx0XHRcdFx0PyBSZW5kZXJXaGl0ZXNwYWNlLkJvdW5kYXJ5XG5cdFx0XHRcdFx0OiByZW5kZXJXaGl0ZXNwYWNlID09PSAnc2VsZWN0aW9uJ1xuXHRcdFx0XHRcdFx0PyBSZW5kZXJXaGl0ZXNwYWNlLlNlbGVjdGlvblxuXHRcdFx0XHRcdFx0OiByZW5kZXJXaGl0ZXNwYWNlID09PSAndHJhaWxpbmcnXG5cdFx0XHRcdFx0XHRcdD8gUmVuZGVyV2hpdGVzcGFjZS5UcmFpbGluZ1xuXHRcdFx0XHRcdFx0XHQ6IFJlbmRlcldoaXRlc3BhY2UuTm9uZVxuXHRcdCk7XG5cdFx0dGhpcy5yZW5kZXJDb250cm9sQ2hhcmFjdGVycyA9IHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzO1xuXHRcdHRoaXMuZm9udExpZ2F0dXJlcyA9IGZvbnRMaWdhdHVyZXM7XG5cdFx0dGhpcy5zZWxlY3Rpb25zT25MaW5lID0gc2VsZWN0aW9uc09uTGluZSAmJiBzZWxlY3Rpb25zT25MaW5lLnNvcnQoKGEsIGIpID0+IGEuc3RhcnQgPCBiLnN0YXJ0ID8gLTEgOiAxKTtcblx0XHR0aGlzLnJlbmRlck5ld0xpbmVXaGVuRW1wdHkgPSByZW5kZXJOZXdMaW5lV2hlbkVtcHR5O1xuXHRcdHRoaXMudGV4dERpcmVjdGlvbiA9IHRleHREaXJlY3Rpb247XG5cdFx0dGhpcy52ZXJ0aWNhbFNjcm9sbGJhclNpemUgPSB2ZXJ0aWNhbFNjcm9sbGJhclNpemU7XG5cblx0XHRjb25zdCB3c21pZGRvdERpZmYgPSBNYXRoLmFicyh3c21pZGRvdFdpZHRoIC0gc3BhY2VXaWR0aCk7XG5cdFx0Y29uc3QgbWlkZG90RGlmZiA9IE1hdGguYWJzKG1pZGRvdFdpZHRoIC0gc3BhY2VXaWR0aCk7XG5cdFx0aWYgKHdzbWlkZG90RGlmZiA8IG1pZGRvdERpZmYpIHtcblx0XHRcdHRoaXMucmVuZGVyU3BhY2VXaWR0aCA9IHdzbWlkZG90V2lkdGg7XG5cdFx0XHR0aGlzLnJlbmRlclNwYWNlQ2hhckNvZGUgPSAweDJFMzE7IC8vIFUrMkUzMSAtIFdPUkQgU0VQQVJBVE9SIE1JRERMRSBET1Rcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJTcGFjZVdpZHRoID0gbWlkZG90V2lkdGg7XG5cdFx0XHR0aGlzLnJlbmRlclNwYWNlQ2hhckNvZGUgPSAweEI3OyAvLyBVKzAwQjcgLSBNSURETEUgRE9UXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzYW1lU2VsZWN0aW9uKG90aGVyU2VsZWN0aW9uczogT2Zmc2V0UmFuZ2VbXSB8IG51bGwpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5zZWxlY3Rpb25zT25MaW5lID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gb3RoZXJTZWxlY3Rpb25zID09PSBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlclNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAob3RoZXJTZWxlY3Rpb25zLmxlbmd0aCAhPT0gdGhpcy5zZWxlY3Rpb25zT25MaW5lLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zZWxlY3Rpb25zT25MaW5lLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoIXRoaXMuc2VsZWN0aW9uc09uTGluZVtpXS5lcXVhbHMob3RoZXJTZWxlY3Rpb25zW2ldKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBSZW5kZXJMaW5lSW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0dGhpcy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zID09PSBvdGhlci51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zXG5cdFx0XHQmJiB0aGlzLmNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyA9PT0gb3RoZXIuY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93XG5cdFx0XHQmJiB0aGlzLmxpbmVDb250ZW50ID09PSBvdGhlci5saW5lQ29udGVudFxuXHRcdFx0JiYgdGhpcy5jb250aW51ZXNXaXRoV3JhcHBlZExpbmUgPT09IG90aGVyLmNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZVxuXHRcdFx0JiYgdGhpcy5pc0Jhc2ljQVNDSUkgPT09IG90aGVyLmlzQmFzaWNBU0NJSVxuXHRcdFx0JiYgdGhpcy5jb250YWluc1JUTCA9PT0gb3RoZXIuY29udGFpbnNSVExcblx0XHRcdCYmIHRoaXMuZmF1eEluZGVudExlbmd0aCA9PT0gb3RoZXIuZmF1eEluZGVudExlbmd0aFxuXHRcdFx0JiYgdGhpcy50YWJTaXplID09PSBvdGhlci50YWJTaXplXG5cdFx0XHQmJiB0aGlzLnN0YXJ0VmlzaWJsZUNvbHVtbiA9PT0gb3RoZXIuc3RhcnRWaXNpYmxlQ29sdW1uXG5cdFx0XHQmJiB0aGlzLnNwYWNlV2lkdGggPT09IG90aGVyLnNwYWNlV2lkdGhcblx0XHRcdCYmIHRoaXMucmVuZGVyU3BhY2VXaWR0aCA9PT0gb3RoZXIucmVuZGVyU3BhY2VXaWR0aFxuXHRcdFx0JiYgdGhpcy5yZW5kZXJTcGFjZUNoYXJDb2RlID09PSBvdGhlci5yZW5kZXJTcGFjZUNoYXJDb2RlXG5cdFx0XHQmJiB0aGlzLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgPT09IG90aGVyLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXJcblx0XHRcdCYmIHRoaXMucmVuZGVyV2hpdGVzcGFjZSA9PT0gb3RoZXIucmVuZGVyV2hpdGVzcGFjZVxuXHRcdFx0JiYgdGhpcy5yZW5kZXJDb250cm9sQ2hhcmFjdGVycyA9PT0gb3RoZXIucmVuZGVyQ29udHJvbENoYXJhY3RlcnNcblx0XHRcdCYmIHRoaXMuZm9udExpZ2F0dXJlcyA9PT0gb3RoZXIuZm9udExpZ2F0dXJlc1xuXHRcdFx0JiYgTGluZURlY29yYXRpb24uZXF1YWxzQXJyKHRoaXMubGluZURlY29yYXRpb25zLCBvdGhlci5saW5lRGVjb3JhdGlvbnMpXG5cdFx0XHQmJiB0aGlzLmxpbmVUb2tlbnMuZXF1YWxzKG90aGVyLmxpbmVUb2tlbnMpXG5cdFx0XHQmJiB0aGlzLnNhbWVTZWxlY3Rpb24ob3RoZXIuc2VsZWN0aW9uc09uTGluZSlcblx0XHRcdCYmIHRoaXMudGV4dERpcmVjdGlvbiA9PT0gb3RoZXIudGV4dERpcmVjdGlvblxuXHRcdFx0JiYgdGhpcy52ZXJ0aWNhbFNjcm9sbGJhclNpemUgPT09IG90aGVyLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZVxuXHRcdFx0JiYgdGhpcy5yZW5kZXJOZXdMaW5lV2hlbkVtcHR5ID09PSBvdGhlci5yZW5kZXJOZXdMaW5lV2hlbkVtcHR5XG5cdFx0KTtcblx0fVxufVxuXG5jb25zdCBlbnVtIENoYXJhY3Rlck1hcHBpbmdDb25zdGFudHMge1xuXHRQQVJUX0lOREVYX01BU0sgPSAwYjExMTExMTExMTExMTExMTEwMDAwMDAwMDAwMDAwMDAwLFxuXHRDSEFSX0lOREVYX01BU0sgPSAwYjAwMDAwMDAwMDAwMDAwMDAxMTExMTExMTExMTExMTExLFxuXG5cdENIQVJfSU5ERVhfT0ZGU0VUID0gMCxcblx0UEFSVF9JTkRFWF9PRkZTRVQgPSAxNlxufVxuXG5leHBvcnQgY2xhc3MgRG9tUG9zaXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcGFydEluZGV4OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNoYXJJbmRleDogbnVtYmVyXG5cdCkgeyB9XG59XG5cbi8qKlxuICogUHJvdmlkZXMgYSBib3RoIGRpcmVjdGlvbiBtYXBwaW5nIGJldHdlZW4gYSBsaW5lJ3MgY2hhcmFjdGVyIGFuZCBpdHMgcmVuZGVyZWQgcG9zaXRpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGFyYWN0ZXJNYXBwaW5nIHtcblxuXHRwcml2YXRlIHN0YXRpYyBnZXRQYXJ0SW5kZXgocGFydERhdGE6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIChwYXJ0RGF0YSAmIENoYXJhY3Rlck1hcHBpbmdDb25zdGFudHMuUEFSVF9JTkRFWF9NQVNLKSA+Pj4gQ2hhcmFjdGVyTWFwcGluZ0NvbnN0YW50cy5QQVJUX0lOREVYX09GRlNFVDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGdldENoYXJJbmRleChwYXJ0RGF0YTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKHBhcnREYXRhICYgQ2hhcmFjdGVyTWFwcGluZ0NvbnN0YW50cy5DSEFSX0lOREVYX01BU0spID4+PiBDaGFyYWN0ZXJNYXBwaW5nQ29uc3RhbnRzLkNIQVJfSU5ERVhfT0ZGU0VUO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhOiBVaW50MzJBcnJheTtcblx0cHJpdmF0ZSByZWFkb25seSBfaG9yaXpvbnRhbE9mZnNldDogVWludDMyQXJyYXk7XG5cblx0Y29uc3RydWN0b3IobGVuZ3RoOiBudW1iZXIsIHBhcnRDb3VudDogbnVtYmVyKSB7XG5cdFx0dGhpcy5sZW5ndGggPSBsZW5ndGg7XG5cdFx0dGhpcy5fZGF0YSA9IG5ldyBVaW50MzJBcnJheSh0aGlzLmxlbmd0aCk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbE9mZnNldCA9IG5ldyBVaW50MzJBcnJheSh0aGlzLmxlbmd0aCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29sdW1uSW5mbyhjb2x1bW46IG51bWJlciwgcGFydEluZGV4OiBudW1iZXIsIGNoYXJJbmRleDogbnVtYmVyLCBob3Jpem9udGFsT2Zmc2V0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwYXJ0RGF0YSA9IChcblx0XHRcdChwYXJ0SW5kZXggPDwgQ2hhcmFjdGVyTWFwcGluZ0NvbnN0YW50cy5QQVJUX0lOREVYX09GRlNFVClcblx0XHRcdHwgKGNoYXJJbmRleCA8PCBDaGFyYWN0ZXJNYXBwaW5nQ29uc3RhbnRzLkNIQVJfSU5ERVhfT0ZGU0VUKVxuXHRcdCkgPj4+IDA7XG5cdFx0dGhpcy5fZGF0YVtjb2x1bW4gLSAxXSA9IHBhcnREYXRhO1xuXHRcdHRoaXMuX2hvcml6b250YWxPZmZzZXRbY29sdW1uIC0gMV0gPSBob3Jpem9udGFsT2Zmc2V0O1xuXHR9XG5cblx0cHVibGljIGdldEhvcml6b250YWxPZmZzZXQoY29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9ob3Jpem9udGFsT2Zmc2V0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gTm8gY2hhcmFjdGVycyBvbiB0aGlzIGxpbmVcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faG9yaXpvbnRhbE9mZnNldFtjb2x1bW4gLSAxXTtcblx0fVxuXG5cdHByaXZhdGUgY2hhck9mZnNldFRvUGFydERhdGEoY2hhck9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRpZiAoY2hhck9mZnNldCA8IDApIHtcblx0XHRcdHJldHVybiB0aGlzLl9kYXRhWzBdO1xuXHRcdH1cblx0XHRpZiAoY2hhck9mZnNldCA+PSB0aGlzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RhdGFbdGhpcy5sZW5ndGggLSAxXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGFbY2hhck9mZnNldF07XG5cdH1cblxuXHRwdWJsaWMgZ2V0RG9tUG9zaXRpb24oY29sdW1uOiBudW1iZXIpOiBEb21Qb3NpdGlvbiB7XG5cdFx0Y29uc3QgcGFydERhdGEgPSB0aGlzLmNoYXJPZmZzZXRUb1BhcnREYXRhKGNvbHVtbiAtIDEpO1xuXHRcdGNvbnN0IHBhcnRJbmRleCA9IENoYXJhY3Rlck1hcHBpbmcuZ2V0UGFydEluZGV4KHBhcnREYXRhKTtcblx0XHRjb25zdCBjaGFySW5kZXggPSBDaGFyYWN0ZXJNYXBwaW5nLmdldENoYXJJbmRleChwYXJ0RGF0YSk7XG5cdFx0cmV0dXJuIG5ldyBEb21Qb3NpdGlvbihwYXJ0SW5kZXgsIGNoYXJJbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29sdW1uKGRvbVBvc2l0aW9uOiBEb21Qb3NpdGlvbiwgcGFydExlbmd0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBjaGFyT2Zmc2V0ID0gdGhpcy5wYXJ0RGF0YVRvQ2hhck9mZnNldChkb21Qb3NpdGlvbi5wYXJ0SW5kZXgsIHBhcnRMZW5ndGgsIGRvbVBvc2l0aW9uLmNoYXJJbmRleCk7XG5cdFx0cmV0dXJuIGNoYXJPZmZzZXQgKyAxO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJ0RGF0YVRvQ2hhck9mZnNldChwYXJ0SW5kZXg6IG51bWJlciwgcGFydExlbmd0aDogbnVtYmVyLCBjaGFySW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRjb25zdCBzZWFyY2hFbnRyeSA9IChcblx0XHRcdChwYXJ0SW5kZXggPDwgQ2hhcmFjdGVyTWFwcGluZ0NvbnN0YW50cy5QQVJUX0lOREVYX09GRlNFVClcblx0XHRcdHwgKGNoYXJJbmRleCA8PCBDaGFyYWN0ZXJNYXBwaW5nQ29uc3RhbnRzLkNIQVJfSU5ERVhfT0ZGU0VUKVxuXHRcdCkgPj4+IDA7XG5cblx0XHRsZXQgbWluID0gMDtcblx0XHRsZXQgbWF4ID0gdGhpcy5sZW5ndGggLSAxO1xuXHRcdHdoaWxlIChtaW4gKyAxIDwgbWF4KSB7XG5cdFx0XHRjb25zdCBtaWQgPSAoKG1pbiArIG1heCkgPj4+IDEpO1xuXHRcdFx0Y29uc3QgbWlkRW50cnkgPSB0aGlzLl9kYXRhW21pZF07XG5cdFx0XHRpZiAobWlkRW50cnkgPT09IHNlYXJjaEVudHJ5KSB7XG5cdFx0XHRcdHJldHVybiBtaWQ7XG5cdFx0XHR9IGVsc2UgaWYgKG1pZEVudHJ5ID4gc2VhcmNoRW50cnkpIHtcblx0XHRcdFx0bWF4ID0gbWlkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWluID0gbWlkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtaW4gPT09IG1heCkge1xuXHRcdFx0cmV0dXJuIG1pbjtcblx0XHR9XG5cblx0XHRjb25zdCBtaW5FbnRyeSA9IHRoaXMuX2RhdGFbbWluXTtcblx0XHRjb25zdCBtYXhFbnRyeSA9IHRoaXMuX2RhdGFbbWF4XTtcblxuXHRcdGlmIChtaW5FbnRyeSA9PT0gc2VhcmNoRW50cnkpIHtcblx0XHRcdHJldHVybiBtaW47XG5cdFx0fVxuXHRcdGlmIChtYXhFbnRyeSA9PT0gc2VhcmNoRW50cnkpIHtcblx0XHRcdHJldHVybiBtYXg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWluUGFydEluZGV4ID0gQ2hhcmFjdGVyTWFwcGluZy5nZXRQYXJ0SW5kZXgobWluRW50cnkpO1xuXHRcdGNvbnN0IG1pbkNoYXJJbmRleCA9IENoYXJhY3Rlck1hcHBpbmcuZ2V0Q2hhckluZGV4KG1pbkVudHJ5KTtcblxuXHRcdGNvbnN0IG1heFBhcnRJbmRleCA9IENoYXJhY3Rlck1hcHBpbmcuZ2V0UGFydEluZGV4KG1heEVudHJ5KTtcblx0XHRsZXQgbWF4Q2hhckluZGV4OiBudW1iZXI7XG5cblx0XHRpZiAobWluUGFydEluZGV4ICE9PSBtYXhQYXJ0SW5kZXgpIHtcblx0XHRcdC8vIHNpdHRpbmcgYmV0d2VlbiBwYXJ0c1xuXHRcdFx0bWF4Q2hhckluZGV4ID0gcGFydExlbmd0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWF4Q2hhckluZGV4ID0gQ2hhcmFjdGVyTWFwcGluZy5nZXRDaGFySW5kZXgobWF4RW50cnkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1pbkVudHJ5RGlzdGFuY2UgPSBjaGFySW5kZXggLSBtaW5DaGFySW5kZXg7XG5cdFx0Y29uc3QgbWF4RW50cnlEaXN0YW5jZSA9IG1heENoYXJJbmRleCAtIGNoYXJJbmRleDtcblxuXHRcdGlmIChtaW5FbnRyeURpc3RhbmNlIDw9IG1heEVudHJ5RGlzdGFuY2UpIHtcblx0XHRcdHJldHVybiBtaW47XG5cdFx0fVxuXHRcdHJldHVybiBtYXg7XG5cdH1cblxuXHRwdWJsaWMgaW5mbGF0ZSgpIHtcblx0XHRjb25zdCByZXN1bHQ6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwYXJ0RGF0YSA9IHRoaXMuX2RhdGFbaV07XG5cdFx0XHRjb25zdCBwYXJ0SW5kZXggPSBDaGFyYWN0ZXJNYXBwaW5nLmdldFBhcnRJbmRleChwYXJ0RGF0YSk7XG5cdFx0XHRjb25zdCBjaGFySW5kZXggPSBDaGFyYWN0ZXJNYXBwaW5nLmdldENoYXJJbmRleChwYXJ0RGF0YSk7XG5cdFx0XHRjb25zdCB2aXNpYmxlQ29sdW1uID0gdGhpcy5faG9yaXpvbnRhbE9mZnNldFtpXTtcblx0XHRcdHJlc3VsdC5wdXNoKFtwYXJ0SW5kZXgsIGNoYXJJbmRleCwgdmlzaWJsZUNvbHVtbl0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEZvcmVpZ25FbGVtZW50VHlwZSB7XG5cdE5vbmUgPSAwLFxuXHRCZWZvcmUgPSAxLFxuXHRBZnRlciA9IDJcbn1cblxuZXhwb3J0IGNsYXNzIFJlbmRlckxpbmVPdXRwdXQge1xuXHRfcmVuZGVyTGluZU91dHB1dEJyYW5kOiB2b2lkID0gdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNoYXJhY3Rlck1hcHBpbmc6IENoYXJhY3Rlck1hcHBpbmc7XG5cdHJlYWRvbmx5IGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzOiBGb3JlaWduRWxlbWVudFR5cGU7XG5cblx0Y29uc3RydWN0b3IoY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZywgY29udGFpbnNGb3JlaWduRWxlbWVudHM6IEZvcmVpZ25FbGVtZW50VHlwZSkge1xuXHRcdHRoaXMuY2hhcmFjdGVyTWFwcGluZyA9IGNoYXJhY3Rlck1hcHBpbmc7XG5cdFx0dGhpcy5jb250YWluc0ZvcmVpZ25FbGVtZW50cyA9IGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJWaWV3TGluZShpbnB1dDogUmVuZGVyTGluZUlucHV0LCBzYjogU3RyaW5nQnVpbGRlcik6IFJlbmRlckxpbmVPdXRwdXQge1xuXHRpZiAoaW5wdXQubGluZUNvbnRlbnQubGVuZ3RoID09PSAwKSB7XG5cblx0XHRpZiAoaW5wdXQubGluZURlY29yYXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIFRoaXMgbGluZSBpcyBlbXB0eSwgYnV0IGl0IGNvbnRhaW5zIGlubGluZSBkZWNvcmF0aW9uc1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKGA8c3Bhbj5gKTtcblxuXHRcdFx0bGV0IGJlZm9yZUNvdW50ID0gMDtcblx0XHRcdGxldCBhZnRlckNvdW50ID0gMDtcblx0XHRcdGxldCBjb250YWluc0ZvcmVpZ25FbGVtZW50cyA9IEZvcmVpZ25FbGVtZW50VHlwZS5Ob25lO1xuXHRcdFx0Zm9yIChjb25zdCBsaW5lRGVjb3JhdGlvbiBvZiBpbnB1dC5saW5lRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0aWYgKGxpbmVEZWNvcmF0aW9uLnR5cGUgPT09IElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSB8fCBsaW5lRGVjb3JhdGlvbi50eXBlID09PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlcikge1xuXHRcdFx0XHRcdHNiLmFwcGVuZFN0cmluZyhgPHNwYW4gY2xhc3M9XCJgKTtcblx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcobGluZURlY29yYXRpb24uY2xhc3NOYW1lKTtcblx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoYFwiPjwvc3Bhbj5gKTtcblxuXHRcdFx0XHRcdGlmIChsaW5lRGVjb3JhdGlvbi50eXBlID09PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmUpIHtcblx0XHRcdFx0XHRcdGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzIHw9IEZvcmVpZ25FbGVtZW50VHlwZS5CZWZvcmU7XG5cdFx0XHRcdFx0XHRiZWZvcmVDb3VudCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobGluZURlY29yYXRpb24udHlwZSA9PT0gSW5saW5lRGVjb3JhdGlvblR5cGUuQWZ0ZXIpIHtcblx0XHRcdFx0XHRcdGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzIHw9IEZvcmVpZ25FbGVtZW50VHlwZS5BZnRlcjtcblx0XHRcdFx0XHRcdGFmdGVyQ291bnQrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKGA8L3NwYW4+YCk7XG5cblx0XHRcdGNvbnN0IGNoYXJhY3Rlck1hcHBpbmcgPSBuZXcgQ2hhcmFjdGVyTWFwcGluZygxLCBiZWZvcmVDb3VudCArIGFmdGVyQ291bnQpO1xuXHRcdFx0Y2hhcmFjdGVyTWFwcGluZy5zZXRDb2x1bW5JbmZvKDEsIGJlZm9yZUNvdW50LCAwLCAwKTtcblxuXHRcdFx0cmV0dXJuIG5ldyBSZW5kZXJMaW5lT3V0cHV0KFxuXHRcdFx0XHRjaGFyYWN0ZXJNYXBwaW5nLFxuXHRcdFx0XHRjb250YWluc0ZvcmVpZ25FbGVtZW50c1xuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBjb21wbGV0ZWx5IGVtcHR5IGxpbmVcblx0XHRpZiAoaW5wdXQucmVuZGVyTmV3TGluZVdoZW5FbXB0eSkge1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKCc8c3Bhbj48c3Bhbj5cXG48L3NwYW4+PC9zcGFuPicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzYi5hcHBlbmRTdHJpbmcoJzxzcGFuPjxzcGFuPjwvc3Bhbj48L3NwYW4+Jyk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmVuZGVyTGluZU91dHB1dChcblx0XHRcdG5ldyBDaGFyYWN0ZXJNYXBwaW5nKDAsIDApLFxuXHRcdFx0Rm9yZWlnbkVsZW1lbnRUeXBlLk5vbmVcblx0XHQpO1xuXHR9XG5cblx0cmV0dXJuIF9yZW5kZXJMaW5lKHJlc29sdmVSZW5kZXJMaW5lSW5wdXQoaW5wdXQpLCBzYik7XG59XG5cbmV4cG9ydCBjbGFzcyBSZW5kZXJMaW5lT3V0cHV0MiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBjaGFyYWN0ZXJNYXBwaW5nOiBDaGFyYWN0ZXJNYXBwaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBodG1sOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzOiBGb3JlaWduRWxlbWVudFR5cGVcblx0KSB7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclZpZXdMaW5lMihpbnB1dDogUmVuZGVyTGluZUlucHV0KTogUmVuZGVyTGluZU91dHB1dDIge1xuXHRjb25zdCBzYiA9IG5ldyBTdHJpbmdCdWlsZGVyKDEwMDAwKTtcblx0Y29uc3Qgb3V0ID0gcmVuZGVyVmlld0xpbmUoaW5wdXQsIHNiKTtcblx0cmV0dXJuIG5ldyBSZW5kZXJMaW5lT3V0cHV0MihvdXQuY2hhcmFjdGVyTWFwcGluZywgc2IuYnVpbGQoKSwgb3V0LmNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzKTtcbn1cblxuY2xhc3MgUmVzb2x2ZWRSZW5kZXJMaW5lSW5wdXQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZm9udElzTW9ub3NwYWNlOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBjYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3c6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVDb250ZW50OiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxlbjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBpc092ZXJmbG93aW5nOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBvdmVyZmxvd2luZ0NoYXJDb3VudDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBwYXJ0czogTGluZVBhcnRbXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29udGFpbnNGb3JlaWduRWxlbWVudHM6IEZvcmVpZ25FbGVtZW50VHlwZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZmF1eEluZGVudExlbmd0aDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSB0YWJTaXplOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHN0YXJ0VmlzaWJsZUNvbHVtbjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzcGFjZVdpZHRoOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlbmRlclNwYWNlQ2hhckNvZGU6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyV2hpdGVzcGFjZTogUmVuZGVyV2hpdGVzcGFjZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyQ29udHJvbENoYXJhY3RlcnM6IGJvb2xlYW4sXG5cdCkge1xuXHRcdC8vXG5cdH1cbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVJlbmRlckxpbmVJbnB1dChpbnB1dDogUmVuZGVyTGluZUlucHV0KTogUmVzb2x2ZWRSZW5kZXJMaW5lSW5wdXQge1xuXHRjb25zdCBsaW5lQ29udGVudCA9IGlucHV0LmxpbmVDb250ZW50O1xuXG5cdGxldCBpc092ZXJmbG93aW5nOiBib29sZWFuO1xuXHRsZXQgb3ZlcmZsb3dpbmdDaGFyQ291bnQ6IG51bWJlcjtcblx0bGV0IGxlbjogbnVtYmVyO1xuXG5cdGlmIChpbnB1dC5zdG9wUmVuZGVyaW5nTGluZUFmdGVyICE9PSAtMSAmJiBpbnB1dC5zdG9wUmVuZGVyaW5nTGluZUFmdGVyIDwgbGluZUNvbnRlbnQubGVuZ3RoKSB7XG5cdFx0aXNPdmVyZmxvd2luZyA9IHRydWU7XG5cdFx0b3ZlcmZsb3dpbmdDaGFyQ291bnQgPSBsaW5lQ29udGVudC5sZW5ndGggLSBpbnB1dC5zdG9wUmVuZGVyaW5nTGluZUFmdGVyO1xuXHRcdGxlbiA9IGlucHV0LnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI7XG5cdH0gZWxzZSB7XG5cdFx0aXNPdmVyZmxvd2luZyA9IGZhbHNlO1xuXHRcdG92ZXJmbG93aW5nQ2hhckNvdW50ID0gMDtcblx0XHRsZW4gPSBsaW5lQ29udGVudC5sZW5ndGg7XG5cdH1cblxuXHRsZXQgdG9rZW5zID0gdHJhbnNmb3JtQW5kUmVtb3ZlT3ZlcmZsb3dpbmcobGluZUNvbnRlbnQsIGlucHV0LmNvbnRhaW5zUlRMLCBpbnB1dC5saW5lVG9rZW5zLCBpbnB1dC5mYXV4SW5kZW50TGVuZ3RoLCBsZW4pO1xuXHRpZiAoaW5wdXQucmVuZGVyQ29udHJvbENoYXJhY3RlcnMgJiYgIWlucHV0LmlzQmFzaWNBU0NJSSkge1xuXHRcdC8vIENhbGxpbmcgYGV4dHJhY3RDb250cm9sQ2hhcmFjdGVyc2AgYmVmb3JlIGFkZGluZyAocG9zc2libHkgZW1wdHkpIGxpbmUgcGFydHNcblx0XHQvLyBmb3IgaW5saW5lIGRlY29yYXRpb25zLiBgZXh0cmFjdENvbnRyb2xDaGFyYWN0ZXJzYCByZW1vdmVzIGVtcHR5IGxpbmUgcGFydHMuXG5cdFx0dG9rZW5zID0gZXh0cmFjdENvbnRyb2xDaGFyYWN0ZXJzKGxpbmVDb250ZW50LCB0b2tlbnMpO1xuXHR9XG5cdGlmIChpbnB1dC5yZW5kZXJXaGl0ZXNwYWNlID09PSBSZW5kZXJXaGl0ZXNwYWNlLkFsbCB8fFxuXHRcdGlucHV0LnJlbmRlcldoaXRlc3BhY2UgPT09IFJlbmRlcldoaXRlc3BhY2UuQm91bmRhcnkgfHxcblx0XHQoaW5wdXQucmVuZGVyV2hpdGVzcGFjZSA9PT0gUmVuZGVyV2hpdGVzcGFjZS5TZWxlY3Rpb24gJiYgISFpbnB1dC5zZWxlY3Rpb25zT25MaW5lKSB8fFxuXHRcdChpbnB1dC5yZW5kZXJXaGl0ZXNwYWNlID09PSBSZW5kZXJXaGl0ZXNwYWNlLlRyYWlsaW5nICYmICFpbnB1dC5jb250aW51ZXNXaXRoV3JhcHBlZExpbmUpXG5cdCkge1xuXHRcdHRva2VucyA9IF9hcHBseVJlbmRlcldoaXRlc3BhY2UoaW5wdXQsIGxpbmVDb250ZW50LCBsZW4sIHRva2Vucyk7XG5cdH1cblx0bGV0IGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzID0gRm9yZWlnbkVsZW1lbnRUeXBlLk5vbmU7XG5cdGlmIChpbnB1dC5saW5lRGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBpbnB1dC5saW5lRGVjb3JhdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVEZWNvcmF0aW9uID0gaW5wdXQubGluZURlY29yYXRpb25zW2ldO1xuXHRcdFx0aWYgKGxpbmVEZWNvcmF0aW9uLnR5cGUgPT09IElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXJBZmZlY3RpbmdMZXR0ZXJTcGFjaW5nKSB7XG5cdFx0XHRcdC8vIFByZXRlbmQgdGhlcmUgYXJlIGZvcmVpZ24gZWxlbWVudHMuLi4gYWx0aG91Z2ggbm90IDEwMCUgYWNjdXJhdGUuXG5cdFx0XHRcdGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzIHw9IEZvcmVpZ25FbGVtZW50VHlwZS5CZWZvcmU7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVEZWNvcmF0aW9uLnR5cGUgPT09IElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSkge1xuXHRcdFx0XHRjb250YWluc0ZvcmVpZ25FbGVtZW50cyB8PSBGb3JlaWduRWxlbWVudFR5cGUuQmVmb3JlO1xuXHRcdFx0fSBlbHNlIGlmIChsaW5lRGVjb3JhdGlvbi50eXBlID09PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlcikge1xuXHRcdFx0XHRjb250YWluc0ZvcmVpZ25FbGVtZW50cyB8PSBGb3JlaWduRWxlbWVudFR5cGUuQWZ0ZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRva2VucyA9IF9hcHBseUlubGluZURlY29yYXRpb25zKGxpbmVDb250ZW50LCBsZW4sIHRva2VucywgaW5wdXQubGluZURlY29yYXRpb25zKTtcblx0fVxuXHRpZiAoIWlucHV0LmNvbnRhaW5zUlRMKSB7XG5cdFx0Ly8gV2UgY2FuIG5ldmVyIHNwbGl0IFJUTCB0ZXh0LCBhcyBpdCBydWlucyB0aGUgcmVuZGVyaW5nXG5cdFx0dG9rZW5zID0gc3BsaXRMYXJnZVRva2VucyhsaW5lQ29udGVudCwgdG9rZW5zLCAhaW5wdXQuaXNCYXNpY0FTQ0lJIHx8IGlucHV0LmZvbnRMaWdhdHVyZXMpO1xuXHR9IGVsc2Uge1xuXHRcdC8vIFNwbGl0IHRoZSBmaXJzdCB0b2tlbiBpZiBpdCBjb250YWlucyBib3RoIGxlYWRpbmcgd2hpdGVzcGFjZSBhbmQgUlRMIHRleHRcblx0XHR0b2tlbnMgPSBzcGxpdExlYWRpbmdXaGl0ZXNwYWNlRnJvbVJUTChsaW5lQ29udGVudCwgdG9rZW5zKTtcblx0fVxuXG5cdHJldHVybiBuZXcgUmVzb2x2ZWRSZW5kZXJMaW5lSW5wdXQoXG5cdFx0aW5wdXQudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucyxcblx0XHRpbnB1dC5jYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3csXG5cdFx0bGluZUNvbnRlbnQsXG5cdFx0bGVuLFxuXHRcdGlzT3ZlcmZsb3dpbmcsXG5cdFx0b3ZlcmZsb3dpbmdDaGFyQ291bnQsXG5cdFx0dG9rZW5zLFxuXHRcdGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzLFxuXHRcdGlucHV0LmZhdXhJbmRlbnRMZW5ndGgsXG5cdFx0aW5wdXQudGFiU2l6ZSxcblx0XHRpbnB1dC5zdGFydFZpc2libGVDb2x1bW4sXG5cdFx0aW5wdXQuc3BhY2VXaWR0aCxcblx0XHRpbnB1dC5yZW5kZXJTcGFjZUNoYXJDb2RlLFxuXHRcdGlucHV0LnJlbmRlcldoaXRlc3BhY2UsXG5cdFx0aW5wdXQucmVuZGVyQ29udHJvbENoYXJhY3RlcnNcblx0KTtcbn1cblxuLyoqXG4gKiBJbiB0aGUgcmVuZGVyaW5nIHBoYXNlLCBjaGFyYWN0ZXJzIGFyZSBhbHdheXMgbG9vcGVkIHVudGlsIHRva2VuLmVuZEluZGV4LlxuICogRW5zdXJlIHRoYXQgYWxsIHRva2VucyBlbmQgYmVmb3JlIGBsZW5gIGFuZCB0aGUgbGFzdCBvbmUgZW5kcyBwcmVjaXNlbHkgYXQgYGxlbmAuXG4gKi9cbmZ1bmN0aW9uIHRyYW5zZm9ybUFuZFJlbW92ZU92ZXJmbG93aW5nKGxpbmVDb250ZW50OiBzdHJpbmcsIGxpbmVDb250YWluc1JUTDogYm9vbGVhbiwgdG9rZW5zOiBJVmlld0xpbmVUb2tlbnMsIGZhdXhJbmRlbnRMZW5ndGg6IG51bWJlciwgbGVuOiBudW1iZXIpOiBMaW5lUGFydFtdIHtcblx0Y29uc3QgcmVzdWx0OiBMaW5lUGFydFtdID0gW107XG5cdGxldCByZXN1bHRMZW4gPSAwO1xuXG5cdC8vIFRoZSBmYXV4IGluZGVudCBwYXJ0IG9mIHRoZSBsaW5lIHNob3VsZCBoYXZlIG5vIHRva2VuIHR5cGVcblx0aWYgKGZhdXhJbmRlbnRMZW5ndGggPiAwKSB7XG5cdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChmYXV4SW5kZW50TGVuZ3RoLCAnJywgMCwgZmFsc2UpO1xuXHR9XG5cdGxldCBzdGFydE9mZnNldCA9IGZhdXhJbmRlbnRMZW5ndGg7XG5cdGZvciAobGV0IHRva2VuSW5kZXggPSAwLCB0b2tlbnNMZW4gPSB0b2tlbnMuZ2V0Q291bnQoKTsgdG9rZW5JbmRleCA8IHRva2Vuc0xlbjsgdG9rZW5JbmRleCsrKSB7XG5cdFx0Y29uc3QgZW5kSW5kZXggPSB0b2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdGlmIChlbmRJbmRleCA8PSBmYXV4SW5kZW50TGVuZ3RoKSB7XG5cdFx0XHQvLyBUaGUgZmF1eCBpbmRlbnQgcGFydCBvZiB0aGUgbGluZSBzaG91bGQgaGF2ZSBubyB0b2tlbiB0eXBlXG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZSA9IHRva2Vucy5nZXRDbGFzc05hbWUodG9rZW5JbmRleCk7XG5cdFx0aWYgKGVuZEluZGV4ID49IGxlbikge1xuXHRcdFx0Y29uc3QgdG9rZW5Db250YWluc1JUTCA9IChsaW5lQ29udGFpbnNSVEwgPyBzdHJpbmdzLmNvbnRhaW5zUlRMKGxpbmVDb250ZW50LnN1YnN0cmluZyhzdGFydE9mZnNldCwgbGVuKSkgOiBmYWxzZSk7XG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGxlbiwgdHlwZSwgMCwgdG9rZW5Db250YWluc1JUTCk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW5Db250YWluc1JUTCA9IChsaW5lQ29udGFpbnNSVEwgPyBzdHJpbmdzLmNvbnRhaW5zUlRMKGxpbmVDb250ZW50LnN1YnN0cmluZyhzdGFydE9mZnNldCwgZW5kSW5kZXgpKSA6IGZhbHNlKTtcblx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGVuZEluZGV4LCB0eXBlLCAwLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRzdGFydE9mZnNldCA9IGVuZEluZGV4O1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiB3cml0dGVuIGFzIGEgY29uc3QgZW51bSB0byBnZXQgdmFsdWUgaW5saW5pbmcuXG4gKi9cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0TG9uZ1Rva2VuID0gNTBcbn1cblxuLyoqXG4gKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzY4ODUuXG4gKiBJdCBhcHBlYXJzIHRoYXQgaGF2aW5nIHZlcnkgbGFyZ2Ugc3BhbnMgY2F1c2VzIHZlcnkgc2xvdyByZWFkaW5nIG9mIGNoYXJhY3RlciBwb3NpdGlvbnMuXG4gKiBTbyBoZXJlIHdlIHRyeSB0byBhdm9pZCB0aGF0LlxuICovXG5mdW5jdGlvbiBzcGxpdExhcmdlVG9rZW5zKGxpbmVDb250ZW50OiBzdHJpbmcsIHRva2VuczogTGluZVBhcnRbXSwgb25seUF0U3BhY2VzOiBib29sZWFuKTogTGluZVBhcnRbXSB7XG5cdGxldCBsYXN0VG9rZW5FbmRJbmRleCA9IDA7XG5cdGNvbnN0IHJlc3VsdDogTGluZVBhcnRbXSA9IFtdO1xuXHRsZXQgcmVzdWx0TGVuID0gMDtcblxuXHRpZiAob25seUF0U3BhY2VzKSB7XG5cdFx0Ly8gU3BsaXQgb25seSBhdCBzcGFjZXMgPT4gd2UgbmVlZCB0byB3YWxrIGVhY2ggY2hhcmFjdGVyXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRva2Vucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSB0b2tlbnNbaV07XG5cdFx0XHRjb25zdCB0b2tlbkVuZEluZGV4ID0gdG9rZW4uZW5kSW5kZXg7XG5cdFx0XHRpZiAobGFzdFRva2VuRW5kSW5kZXggKyBDb25zdGFudHMuTG9uZ1Rva2VuIDwgdG9rZW5FbmRJbmRleCkge1xuXHRcdFx0XHRjb25zdCB0b2tlblR5cGUgPSB0b2tlbi50eXBlO1xuXHRcdFx0XHRjb25zdCB0b2tlbk1ldGFkYXRhID0gdG9rZW4ubWV0YWRhdGE7XG5cdFx0XHRcdGNvbnN0IHRva2VuQ29udGFpbnNSVEwgPSB0b2tlbi5jb250YWluc1JUTDtcblxuXHRcdFx0XHRsZXQgbGFzdFNwYWNlT2Zmc2V0ID0gLTE7XG5cdFx0XHRcdGxldCBjdXJyVG9rZW5TdGFydCA9IGxhc3RUb2tlbkVuZEluZGV4O1xuXHRcdFx0XHRmb3IgKGxldCBqID0gbGFzdFRva2VuRW5kSW5kZXg7IGogPCB0b2tlbkVuZEluZGV4OyBqKyspIHtcblx0XHRcdFx0XHRpZiAobGluZUNvbnRlbnQuY2hhckNvZGVBdChqKSA9PT0gQ2hhckNvZGUuU3BhY2UpIHtcblx0XHRcdFx0XHRcdGxhc3RTcGFjZU9mZnNldCA9IGo7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChsYXN0U3BhY2VPZmZzZXQgIT09IC0xICYmIGogLSBjdXJyVG9rZW5TdGFydCA+PSBDb25zdGFudHMuTG9uZ1Rva2VuKSB7XG5cdFx0XHRcdFx0XHQvLyBTcGxpdCBhdCBgbGFzdFNwYWNlT2Zmc2V0YCArIDFcblx0XHRcdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQobGFzdFNwYWNlT2Zmc2V0ICsgMSwgdG9rZW5UeXBlLCB0b2tlbk1ldGFkYXRhLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRcdFx0XHRcdGN1cnJUb2tlblN0YXJ0ID0gbGFzdFNwYWNlT2Zmc2V0ICsgMTtcblx0XHRcdFx0XHRcdGxhc3RTcGFjZU9mZnNldCA9IC0xO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY3VyclRva2VuU3RhcnQgIT09IHRva2VuRW5kSW5kZXgpIHtcblx0XHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KHRva2VuRW5kSW5kZXgsIHRva2VuVHlwZSwgdG9rZW5NZXRhZGF0YSwgdG9rZW5Db250YWluc1JUTCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSB0b2tlbjtcblx0XHRcdH1cblxuXHRcdFx0bGFzdFRva2VuRW5kSW5kZXggPSB0b2tlbkVuZEluZGV4O1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHQvLyBTcGxpdCBhbnl3aGVyZSA9PiB3ZSBkb24ndCBuZWVkIHRvIHdhbGsgZWFjaCBjaGFyYWN0ZXJcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdG9rZW5zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHRva2Vuc1tpXTtcblx0XHRcdGNvbnN0IHRva2VuRW5kSW5kZXggPSB0b2tlbi5lbmRJbmRleDtcblx0XHRcdGNvbnN0IGRpZmYgPSAodG9rZW5FbmRJbmRleCAtIGxhc3RUb2tlbkVuZEluZGV4KTtcblx0XHRcdGlmIChkaWZmID4gQ29uc3RhbnRzLkxvbmdUb2tlbikge1xuXHRcdFx0XHRjb25zdCB0b2tlblR5cGUgPSB0b2tlbi50eXBlO1xuXHRcdFx0XHRjb25zdCB0b2tlbk1ldGFkYXRhID0gdG9rZW4ubWV0YWRhdGE7XG5cdFx0XHRcdGNvbnN0IHRva2VuQ29udGFpbnNSVEwgPSB0b2tlbi5jb250YWluc1JUTDtcblx0XHRcdFx0Y29uc3QgcGllY2VzQ291bnQgPSBNYXRoLmNlaWwoZGlmZiAvIENvbnN0YW50cy5Mb25nVG9rZW4pO1xuXHRcdFx0XHRmb3IgKGxldCBqID0gMTsgaiA8IHBpZWNlc0NvdW50OyBqKyspIHtcblx0XHRcdFx0XHRjb25zdCBwaWVjZUVuZEluZGV4ID0gbGFzdFRva2VuRW5kSW5kZXggKyAoaiAqIENvbnN0YW50cy5Mb25nVG9rZW4pO1xuXHRcdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQocGllY2VFbmRJbmRleCwgdG9rZW5UeXBlLCB0b2tlbk1ldGFkYXRhLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KHRva2VuRW5kSW5kZXgsIHRva2VuVHlwZSwgdG9rZW5NZXRhZGF0YSwgdG9rZW5Db250YWluc1JUTCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gdG9rZW47XG5cdFx0XHR9XG5cdFx0XHRsYXN0VG9rZW5FbmRJbmRleCA9IHRva2VuRW5kSW5kZXg7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBTcGxpdHMgbGVhZGluZyB3aGl0ZXNwYWNlIGZyb20gdGhlIGZpcnN0IHRva2VuIGlmIGl0IGNvbnRhaW5zIFJUTCB0ZXh0LlxuICovXG5mdW5jdGlvbiBzcGxpdExlYWRpbmdXaGl0ZXNwYWNlRnJvbVJUTChsaW5lQ29udGVudDogc3RyaW5nLCB0b2tlbnM6IExpbmVQYXJ0W10pOiBMaW5lUGFydFtdIHtcblx0aWYgKHRva2Vucy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdG9rZW5zO1xuXHR9XG5cblx0Y29uc3QgZmlyc3RUb2tlbiA9IHRva2Vuc1swXTtcblx0aWYgKCFmaXJzdFRva2VuLmNvbnRhaW5zUlRMKSB7XG5cdFx0cmV0dXJuIHRva2Vucztcblx0fVxuXG5cdC8vIENoZWNrIGlmIHRoZSBmaXJzdCB0b2tlbiBzdGFydHMgd2l0aCB3aGl0ZXNwYWNlXG5cdGNvbnN0IGZpcnN0VG9rZW5FbmRJbmRleCA9IGZpcnN0VG9rZW4uZW5kSW5kZXg7XG5cdGxldCBmaXJzdE5vbldoaXRlc3BhY2VJbmRleCA9IDA7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZmlyc3RUb2tlbkVuZEluZGV4OyBpKyspIHtcblx0XHRjb25zdCBjaGFyQ29kZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoaSk7XG5cdFx0aWYgKGNoYXJDb2RlICE9PSBDaGFyQ29kZS5TcGFjZSAmJiBjaGFyQ29kZSAhPT0gQ2hhckNvZGUuVGFiKSB7XG5cdFx0XHRmaXJzdE5vbldoaXRlc3BhY2VJbmRleCA9IGk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRpZiAoZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXggPT09IDApIHtcblx0XHQvLyBObyBsZWFkaW5nIHdoaXRlc3BhY2Vcblx0XHRyZXR1cm4gdG9rZW5zO1xuXHR9XG5cblx0Ly8gU3BsaXQgdGhlIGZpcnN0IHRva2VuIGludG8gbGVhZGluZyB3aGl0ZXNwYWNlIGFuZCB0aGUgcmVzdFxuXHRjb25zdCByZXN1bHQ6IExpbmVQYXJ0W10gPSBbXTtcblx0cmVzdWx0LnB1c2gobmV3IExpbmVQYXJ0KGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4LCBmaXJzdFRva2VuLnR5cGUsIGZpcnN0VG9rZW4ubWV0YWRhdGEsIGZhbHNlKSk7XG5cdHJlc3VsdC5wdXNoKG5ldyBMaW5lUGFydChmaXJzdFRva2VuRW5kSW5kZXgsIGZpcnN0VG9rZW4udHlwZSwgZmlyc3RUb2tlbi5tZXRhZGF0YSwgZmlyc3RUb2tlbi5jb250YWluc1JUTCkpO1xuXG5cdC8vIEFkZCByZW1haW5pbmcgdG9rZW5zXG5cdGZvciAobGV0IGkgPSAxOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0cmVzdWx0LnB1c2godG9rZW5zW2ldKTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGlzQ29udHJvbENoYXJhY3RlcihjaGFyQ29kZTogbnVtYmVyKTogYm9vbGVhbiB7XG5cdGlmIChjaGFyQ29kZSA8IDMyKSB7XG5cdFx0cmV0dXJuIChjaGFyQ29kZSAhPT0gQ2hhckNvZGUuVGFiKTtcblx0fVxuXHRpZiAoY2hhckNvZGUgPT09IDEyNykge1xuXHRcdC8vIERFTFxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKFxuXHRcdChjaGFyQ29kZSA+PSAweDIwMkEgJiYgY2hhckNvZGUgPD0gMHgyMDJFKVxuXHRcdHx8IChjaGFyQ29kZSA+PSAweDIwNjYgJiYgY2hhckNvZGUgPD0gMHgyMDY5KVxuXHRcdHx8IChjaGFyQ29kZSA+PSAweDIwMEUgJiYgY2hhckNvZGUgPD0gMHgyMDBGKVxuXHRcdHx8IGNoYXJDb2RlID09PSAweDA2MUNcblx0KSB7XG5cdFx0Ly8gVW5pY29kZSBEaXJlY3Rpb25hbCBGb3JtYXR0aW5nIENoYXJhY3RlcnNcblx0XHQvLyBMUkVcdFUrMjAyQVx0TEVGVC1UTy1SSUdIVCBFTUJFRERJTkdcblx0XHQvLyBSTEVcdFUrMjAyQlx0UklHSFQtVE8tTEVGVCBFTUJFRERJTkdcblx0XHQvLyBQREZcdFUrMjAyQ1x0UE9QIERJUkVDVElPTkFMIEZPUk1BVFRJTkdcblx0XHQvLyBMUk9cdFUrMjAyRFx0TEVGVC1UTy1SSUdIVCBPVkVSUklERVxuXHRcdC8vIFJMT1x0VSsyMDJFXHRSSUdIVC1UTy1MRUZUIE9WRVJSSURFXG5cdFx0Ly8gTFJJXHRVKzIwNjZcdExFRlQtVE8tUklHSFQgSVNPTEFURVxuXHRcdC8vIFJMSVx0VSsyMDY3XHRSSUdIVC1UTy1MRUZUIElTT0xBVEVcblx0XHQvLyBGU0lcdFUrMjA2OFx0RklSU1QgU1RST05HIElTT0xBVEVcblx0XHQvLyBQRElcdFUrMjA2OVx0UE9QIERJUkVDVElPTkFMIElTT0xBVEVcblx0XHQvLyBMUk1cdFUrMjAwRVx0TEVGVC1UTy1SSUdIVCBNQVJLXG5cdFx0Ly8gUkxNXHRVKzIwMEZcdFJJR0hULVRPLUxFRlQgTUFSS1xuXHRcdC8vIEFMTVx0VSswNjFDXHRBUkFCSUMgTEVUVEVSIE1BUktcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdENvbnRyb2xDaGFyYWN0ZXJzKGxpbmVDb250ZW50OiBzdHJpbmcsIHRva2VuczogTGluZVBhcnRbXSk6IExpbmVQYXJ0W10ge1xuXHRjb25zdCByZXN1bHQ6IExpbmVQYXJ0W10gPSBbXTtcblx0bGV0IGxhc3RMaW5lUGFydDogTGluZVBhcnQgPSBuZXcgTGluZVBhcnQoMCwgJycsIDAsIGZhbHNlKTtcblx0bGV0IGNoYXJPZmZzZXQgPSAwO1xuXHRmb3IgKGNvbnN0IHRva2VuIG9mIHRva2Vucykge1xuXHRcdGNvbnN0IHRva2VuRW5kSW5kZXggPSB0b2tlbi5lbmRJbmRleDtcblx0XHRmb3IgKDsgY2hhck9mZnNldCA8IHRva2VuRW5kSW5kZXg7IGNoYXJPZmZzZXQrKykge1xuXHRcdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNoYXJPZmZzZXQpO1xuXHRcdFx0aWYgKGlzQ29udHJvbENoYXJhY3RlcihjaGFyQ29kZSkpIHtcblx0XHRcdFx0aWYgKGNoYXJPZmZzZXQgPiBsYXN0TGluZVBhcnQuZW5kSW5kZXgpIHtcblx0XHRcdFx0XHQvLyBlbWl0IHByZXZpb3VzIHBhcnQgaWYgaXQgaGFzIHRleHRcblx0XHRcdFx0XHRsYXN0TGluZVBhcnQgPSBuZXcgTGluZVBhcnQoY2hhck9mZnNldCwgdG9rZW4udHlwZSwgdG9rZW4ubWV0YWRhdGEsIHRva2VuLmNvbnRhaW5zUlRMKTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChsYXN0TGluZVBhcnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RMaW5lUGFydCA9IG5ldyBMaW5lUGFydChjaGFyT2Zmc2V0ICsgMSwgJ210a2NvbnRyb2wnLCB0b2tlbi5tZXRhZGF0YSwgZmFsc2UpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChsYXN0TGluZVBhcnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2hhck9mZnNldCA+IGxhc3RMaW5lUGFydC5lbmRJbmRleCkge1xuXHRcdFx0Ly8gZW1pdCBwcmV2aW91cyBwYXJ0IGlmIGl0IGhhcyB0ZXh0XG5cdFx0XHRsYXN0TGluZVBhcnQgPSBuZXcgTGluZVBhcnQodG9rZW5FbmRJbmRleCwgdG9rZW4udHlwZSwgdG9rZW4ubWV0YWRhdGEsIHRva2VuLmNvbnRhaW5zUlRMKTtcblx0XHRcdHJlc3VsdC5wdXNoKGxhc3RMaW5lUGFydCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogV2hpdGVzcGFjZSBpcyByZW5kZXJlZCBieSBcInJlcGxhY2luZ1wiIHRva2VucyB3aXRoIGEgc3BlY2lhbC1wdXJwb3NlIGBtdGt3YCB0eXBlIHRoYXQgaXMgbGF0ZXIgcmVjb2duaXplZCBpbiB0aGUgcmVuZGVyaW5nIHBoYXNlLlxuICogTW9yZW92ZXIsIGEgdG9rZW4gaXMgY3JlYXRlZCBmb3IgZXZlcnkgdmlzdWFsIGluZGVudCBiZWNhdXNlIG9uIHNvbWUgZm9udHMgdGhlIGdseXBocyB1c2VkIGZvciByZW5kZXJpbmcgd2hpdGVzcGFjZSAoJnJhcnI7IG9yICZtaWRkb3Q7KSBkbyBub3QgaGF2ZSB0aGUgc2FtZSB3aWR0aCBhcyAmbmJzcDsuXG4gKiBUaGUgcmVuZGVyaW5nIHBoYXNlIHdpbGwgZ2VuZXJhdGUgYHN0eWxlPVwid2lkdGg6Li4uXCJgIGZvciB0aGVzZSB0b2tlbnMuXG4gKi9cbmZ1bmN0aW9uIF9hcHBseVJlbmRlcldoaXRlc3BhY2UoaW5wdXQ6IFJlbmRlckxpbmVJbnB1dCwgbGluZUNvbnRlbnQ6IHN0cmluZywgbGVuOiBudW1iZXIsIHRva2VuczogTGluZVBhcnRbXSk6IExpbmVQYXJ0W10ge1xuXG5cdGNvbnN0IGNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZSA9IGlucHV0LmNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZTtcblx0Y29uc3QgZmF1eEluZGVudExlbmd0aCA9IGlucHV0LmZhdXhJbmRlbnRMZW5ndGg7XG5cdGNvbnN0IHRhYlNpemUgPSBpbnB1dC50YWJTaXplO1xuXHRjb25zdCBzdGFydFZpc2libGVDb2x1bW4gPSBpbnB1dC5zdGFydFZpc2libGVDb2x1bW47XG5cdGNvbnN0IHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMgPSBpbnB1dC51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zO1xuXHRjb25zdCBzZWxlY3Rpb25zID0gaW5wdXQuc2VsZWN0aW9uc09uTGluZTtcblx0Y29uc3Qgb25seUJvdW5kYXJ5ID0gKGlucHV0LnJlbmRlcldoaXRlc3BhY2UgPT09IFJlbmRlcldoaXRlc3BhY2UuQm91bmRhcnkpO1xuXHRjb25zdCBvbmx5VHJhaWxpbmcgPSAoaW5wdXQucmVuZGVyV2hpdGVzcGFjZSA9PT0gUmVuZGVyV2hpdGVzcGFjZS5UcmFpbGluZyk7XG5cdGNvbnN0IGdlbmVyYXRlTGluZVBhcnRGb3JFYWNoV2hpdGVzcGFjZSA9IChpbnB1dC5yZW5kZXJTcGFjZVdpZHRoICE9PSBpbnB1dC5zcGFjZVdpZHRoKTtcblxuXHRjb25zdCByZXN1bHQ6IExpbmVQYXJ0W10gPSBbXTtcblx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdGxldCB0b2tlbkluZGV4ID0gMDtcblx0bGV0IHRva2VuVHlwZSA9IHRva2Vuc1t0b2tlbkluZGV4XS50eXBlO1xuXHRsZXQgdG9rZW5Db250YWluc1JUTCA9IHRva2Vuc1t0b2tlbkluZGV4XS5jb250YWluc1JUTDtcblx0bGV0IHRva2VuRW5kSW5kZXggPSB0b2tlbnNbdG9rZW5JbmRleF0uZW5kSW5kZXg7XG5cdGNvbnN0IHRva2Vuc0xlbmd0aCA9IHRva2Vucy5sZW5ndGg7XG5cblx0bGV0IGxpbmVJc0VtcHR5T3JXaGl0ZXNwYWNlID0gZmFsc2U7XG5cdGxldCBmaXJzdE5vbldoaXRlc3BhY2VJbmRleCA9IHN0cmluZ3MuZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgobGluZUNvbnRlbnQpO1xuXHRsZXQgbGFzdE5vbldoaXRlc3BhY2VJbmRleDogbnVtYmVyO1xuXHRpZiAoZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXggPT09IC0xKSB7XG5cdFx0bGluZUlzRW1wdHlPcldoaXRlc3BhY2UgPSB0cnVlO1xuXHRcdGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ID0gbGVuO1xuXHRcdGxhc3ROb25XaGl0ZXNwYWNlSW5kZXggPSBsZW47XG5cdH0gZWxzZSB7XG5cdFx0bGFzdE5vbldoaXRlc3BhY2VJbmRleCA9IHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lQ29udGVudCk7XG5cdH1cblxuXHRsZXQgd2FzSW5XaGl0ZXNwYWNlID0gZmFsc2U7XG5cdGxldCBjdXJyZW50U2VsZWN0aW9uSW5kZXggPSAwO1xuXHRsZXQgY3VycmVudFNlbGVjdGlvbiA9IHNlbGVjdGlvbnMgJiYgc2VsZWN0aW9uc1tjdXJyZW50U2VsZWN0aW9uSW5kZXhdO1xuXHRsZXQgdG1wSW5kZW50ID0gc3RhcnRWaXNpYmxlQ29sdW1uICUgdGFiU2l6ZTtcblx0Zm9yIChsZXQgY2hhckluZGV4ID0gZmF1eEluZGVudExlbmd0aDsgY2hhckluZGV4IDwgbGVuOyBjaGFySW5kZXgrKykge1xuXHRcdGNvbnN0IGNoQ29kZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY2hhckluZGV4KTtcblxuXHRcdGlmIChjdXJyZW50U2VsZWN0aW9uICYmIGN1cnJlbnRTZWxlY3Rpb24uZW5kRXhjbHVzaXZlIDw9IGNoYXJJbmRleCkge1xuXHRcdFx0Y3VycmVudFNlbGVjdGlvbkluZGV4Kys7XG5cdFx0XHRjdXJyZW50U2VsZWN0aW9uID0gc2VsZWN0aW9ucyAmJiBzZWxlY3Rpb25zW2N1cnJlbnRTZWxlY3Rpb25JbmRleF07XG5cdFx0fVxuXG5cdFx0bGV0IGlzSW5XaGl0ZXNwYWNlOiBib29sZWFuO1xuXHRcdGlmIChjaGFySW5kZXggPCBmaXJzdE5vbldoaXRlc3BhY2VJbmRleCB8fCBjaGFySW5kZXggPiBsYXN0Tm9uV2hpdGVzcGFjZUluZGV4KSB7XG5cdFx0XHQvLyBpbiBsZWFkaW5nIG9yIHRyYWlsaW5nIHdoaXRlc3BhY2Vcblx0XHRcdGlzSW5XaGl0ZXNwYWNlID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGNoQ29kZSA9PT0gQ2hhckNvZGUuVGFiKSB7XG5cdFx0XHQvLyBhIHRhYiBjaGFyYWN0ZXIgaXMgcmVuZGVyZWQgYm90aCBpbiBhbGwgYW5kIGJvdW5kYXJ5IGNhc2VzXG5cdFx0XHRpc0luV2hpdGVzcGFjZSA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChjaENvZGUgPT09IENoYXJDb2RlLlNwYWNlKSB7XG5cdFx0XHQvLyBoaXQgYSBzcGFjZSBjaGFyYWN0ZXJcblx0XHRcdGlmIChvbmx5Qm91bmRhcnkpIHtcblx0XHRcdFx0Ly8gcmVuZGVyaW5nIG9ubHkgYm91bmRhcnkgd2hpdGVzcGFjZVxuXHRcdFx0XHRpZiAod2FzSW5XaGl0ZXNwYWNlKSB7XG5cdFx0XHRcdFx0aXNJbldoaXRlc3BhY2UgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IG5leHRDaENvZGUgPSAoY2hhckluZGV4ICsgMSA8IGxlbiA/IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY2hhckluZGV4ICsgMSkgOiBDaGFyQ29kZS5OdWxsKTtcblx0XHRcdFx0XHRpc0luV2hpdGVzcGFjZSA9IChuZXh0Q2hDb2RlID09PSBDaGFyQ29kZS5TcGFjZSB8fCBuZXh0Q2hDb2RlID09PSBDaGFyQ29kZS5UYWIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpc0luV2hpdGVzcGFjZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlzSW5XaGl0ZXNwYWNlID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgcmVuZGVyaW5nIHdoaXRlc3BhY2Ugb24gc2VsZWN0aW9uLCBjaGVjayB0aGF0IHRoZSBjaGFySW5kZXggZmFsbHMgd2l0aGluIGEgc2VsZWN0aW9uXG5cdFx0aWYgKGlzSW5XaGl0ZXNwYWNlICYmIHNlbGVjdGlvbnMpIHtcblx0XHRcdGlzSW5XaGl0ZXNwYWNlID0gISFjdXJyZW50U2VsZWN0aW9uICYmIGN1cnJlbnRTZWxlY3Rpb24uc3RhcnQgPD0gY2hhckluZGV4ICYmIGNoYXJJbmRleCA8IGN1cnJlbnRTZWxlY3Rpb24uZW5kRXhjbHVzaXZlO1xuXHRcdH1cblxuXHRcdC8vIElmIHJlbmRlcmluZyBvbmx5IHRyYWlsaW5nIHdoaXRlc3BhY2UsIGNoZWNrIHRoYXQgdGhlIGNoYXJJbmRleCBwb2ludHMgdG8gdHJhaWxpbmcgd2hpdGVzcGFjZS5cblx0XHRpZiAoaXNJbldoaXRlc3BhY2UgJiYgb25seVRyYWlsaW5nKSB7XG5cdFx0XHRpc0luV2hpdGVzcGFjZSA9IGxpbmVJc0VtcHR5T3JXaGl0ZXNwYWNlIHx8IGNoYXJJbmRleCA+IGxhc3ROb25XaGl0ZXNwYWNlSW5kZXg7XG5cdFx0fVxuXG5cdFx0aWYgKGlzSW5XaGl0ZXNwYWNlICYmIHRva2VuQ29udGFpbnNSVEwpIHtcblx0XHRcdC8vIElmIHRoZSB0b2tlbiBjb250YWlucyBSVEwgdGV4dCwgYnJlYWtpbmcgaXQgdXAgaW50byBtdWx0aXBsZSBsaW5lIHBhcnRzXG5cdFx0XHQvLyB0byByZW5kZXIgd2hpdGVzcGFjZSBtaWdodCBhZmZlY3QgdGhlIGJyb3dzZXIncyBiaWRpIGxheW91dC5cblx0XHRcdC8vXG5cdFx0XHQvLyBXZSByZW5kZXIgd2hpdGVzcGFjZSBpbiBzdWNoIHRva2VucyBvbmx5IGlmIHRoZSB3aGl0ZXNwYWNlXG5cdFx0XHQvLyBpcyB0aGUgbGVhZGluZyBvciB0aGUgdHJhaWxpbmcgd2hpdGVzcGFjZSBvZiB0aGUgbGluZSxcblx0XHRcdC8vIHdoaWNoIGRvZXNuJ3QgYWZmZWN0IHRoZSBicm93c2VyJ3MgYmlkaSBsYXlvdXQuXG5cdFx0XHRpZiAoY2hhckluZGV4ID49IGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ICYmIGNoYXJJbmRleCA8PSBsYXN0Tm9uV2hpdGVzcGFjZUluZGV4KSB7XG5cdFx0XHRcdGlzSW5XaGl0ZXNwYWNlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHdhc0luV2hpdGVzcGFjZSkge1xuXHRcdFx0Ly8gd2FzIGluIHdoaXRlc3BhY2UgdG9rZW5cblx0XHRcdGlmICghaXNJbldoaXRlc3BhY2UgfHwgKCF1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zICYmIHRtcEluZGVudCA+PSB0YWJTaXplKSkge1xuXHRcdFx0XHQvLyBsZWF2aW5nIHdoaXRlc3BhY2UgdG9rZW4gb3IgZW50ZXJpbmcgYSBuZXcgaW5kZW50XG5cdFx0XHRcdGlmIChnZW5lcmF0ZUxpbmVQYXJ0Rm9yRWFjaFdoaXRlc3BhY2UpIHtcblx0XHRcdFx0XHRjb25zdCBsYXN0RW5kSW5kZXggPSAocmVzdWx0TGVuID4gMCA/IHJlc3VsdFtyZXN1bHRMZW4gLSAxXS5lbmRJbmRleCA6IGZhdXhJbmRlbnRMZW5ndGgpO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSBsYXN0RW5kSW5kZXggKyAxOyBpIDw9IGNoYXJJbmRleDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGksICdtdGt3JywgTGluZVBhcnRNZXRhZGF0YS5JU19XSElURVNQQUNFLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQoY2hhckluZGV4LCAnbXRrdycsIExpbmVQYXJ0TWV0YWRhdGEuSVNfV0hJVEVTUEFDRSwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRtcEluZGVudCA9IHRtcEluZGVudCAlIHRhYlNpemU7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHdhcyBpbiByZWd1bGFyIHRva2VuXG5cdFx0XHRpZiAoY2hhckluZGV4ID09PSB0b2tlbkVuZEluZGV4IHx8IChpc0luV2hpdGVzcGFjZSAmJiBjaGFySW5kZXggPiBmYXV4SW5kZW50TGVuZ3RoKSkge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGNoYXJJbmRleCwgdG9rZW5UeXBlLCAwLCB0b2tlbkNvbnRhaW5zUlRMKTtcblx0XHRcdFx0dG1wSW5kZW50ID0gdG1wSW5kZW50ICUgdGFiU2l6ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2hDb2RlID09PSBDaGFyQ29kZS5UYWIpIHtcblx0XHRcdHRtcEluZGVudCA9IHRhYlNpemU7XG5cdFx0fSBlbHNlIGlmIChzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKGNoQ29kZSkpIHtcblx0XHRcdHRtcEluZGVudCArPSAyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0bXBJbmRlbnQrKztcblx0XHR9XG5cblx0XHR3YXNJbldoaXRlc3BhY2UgPSBpc0luV2hpdGVzcGFjZTtcblxuXHRcdHdoaWxlIChjaGFySW5kZXggPT09IHRva2VuRW5kSW5kZXgpIHtcblx0XHRcdHRva2VuSW5kZXgrKztcblx0XHRcdGlmICh0b2tlbkluZGV4IDwgdG9rZW5zTGVuZ3RoKSB7XG5cdFx0XHRcdHRva2VuVHlwZSA9IHRva2Vuc1t0b2tlbkluZGV4XS50eXBlO1xuXHRcdFx0XHR0b2tlbkNvbnRhaW5zUlRMID0gdG9rZW5zW3Rva2VuSW5kZXhdLmNvbnRhaW5zUlRMO1xuXHRcdFx0XHR0b2tlbkVuZEluZGV4ID0gdG9rZW5zW3Rva2VuSW5kZXhdLmVuZEluZGV4O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0bGV0IGdlbmVyYXRlV2hpdGVzcGFjZSA9IGZhbHNlO1xuXHRpZiAod2FzSW5XaGl0ZXNwYWNlKSB7XG5cdFx0Ly8gd2FzIGluIHdoaXRlc3BhY2UgdG9rZW5cblx0XHRpZiAoY29udGludWVzV2l0aFdyYXBwZWRMaW5lICYmIG9ubHlCb3VuZGFyeSkge1xuXHRcdFx0Y29uc3QgbGFzdENoYXJDb2RlID0gKGxlbiA+IDAgPyBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGxlbiAtIDEpIDogQ2hhckNvZGUuTnVsbCk7XG5cdFx0XHRjb25zdCBwcmV2Q2hhckNvZGUgPSAobGVuID4gMSA/IGxpbmVDb250ZW50LmNoYXJDb2RlQXQobGVuIC0gMikgOiBDaGFyQ29kZS5OdWxsKTtcblx0XHRcdGNvbnN0IGlzU2luZ2xlVHJhaWxpbmdTcGFjZSA9IChsYXN0Q2hhckNvZGUgPT09IENoYXJDb2RlLlNwYWNlICYmIChwcmV2Q2hhckNvZGUgIT09IENoYXJDb2RlLlNwYWNlICYmIHByZXZDaGFyQ29kZSAhPT0gQ2hhckNvZGUuVGFiKSk7XG5cdFx0XHRpZiAoIWlzU2luZ2xlVHJhaWxpbmdTcGFjZSkge1xuXHRcdFx0XHRnZW5lcmF0ZVdoaXRlc3BhY2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRnZW5lcmF0ZVdoaXRlc3BhY2UgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGlmIChnZW5lcmF0ZVdoaXRlc3BhY2UpIHtcblx0XHRpZiAoZ2VuZXJhdGVMaW5lUGFydEZvckVhY2hXaGl0ZXNwYWNlKSB7XG5cdFx0XHRjb25zdCBsYXN0RW5kSW5kZXggPSAocmVzdWx0TGVuID4gMCA/IHJlc3VsdFtyZXN1bHRMZW4gLSAxXS5lbmRJbmRleCA6IGZhdXhJbmRlbnRMZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IGxhc3RFbmRJbmRleCArIDE7IGkgPD0gbGVuOyBpKyspIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChpLCAnbXRrdycsIExpbmVQYXJ0TWV0YWRhdGEuSVNfV0hJVEVTUEFDRSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGxlbiwgJ210a3cnLCBMaW5lUGFydE1ldGFkYXRhLklTX1dISVRFU1BBQ0UsIGZhbHNlKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChsZW4sIHRva2VuVHlwZSwgMCwgdG9rZW5Db250YWluc1JUTCk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIElubGluZSBkZWNvcmF0aW9ucyBhcmUgXCJtZXJnZWRcIiBvbiB0b3Agb2YgdG9rZW5zLlxuICogU3BlY2lhbCBjYXJlIG11c3QgYmUgdGFrZW4gd2hlbiBtdWx0aXBsZSBpbmxpbmUgZGVjb3JhdGlvbnMgYXJlIGF0IHBsYXkgYW5kIHRoZXkgb3ZlcmxhcC5cbiAqL1xuZnVuY3Rpb24gX2FwcGx5SW5saW5lRGVjb3JhdGlvbnMobGluZUNvbnRlbnQ6IHN0cmluZywgbGVuOiBudW1iZXIsIHRva2VuczogTGluZVBhcnRbXSwgX2xpbmVEZWNvcmF0aW9uczogTGluZURlY29yYXRpb25bXSk6IExpbmVQYXJ0W10ge1xuXHRfbGluZURlY29yYXRpb25zLnNvcnQoTGluZURlY29yYXRpb24uY29tcGFyZSk7XG5cdGNvbnN0IGxpbmVEZWNvcmF0aW9ucyA9IExpbmVEZWNvcmF0aW9uc05vcm1hbGl6ZXIubm9ybWFsaXplKGxpbmVDb250ZW50LCBfbGluZURlY29yYXRpb25zKTtcblx0Y29uc3QgbGluZURlY29yYXRpb25zTGVuID0gbGluZURlY29yYXRpb25zLmxlbmd0aDtcblxuXHRsZXQgbGluZURlY29yYXRpb25JbmRleCA9IDA7XG5cdGNvbnN0IHJlc3VsdDogTGluZVBhcnRbXSA9IFtdO1xuXHRsZXQgcmVzdWx0TGVuID0gMDtcblx0bGV0IGxhc3RSZXN1bHRFbmRJbmRleCA9IDA7XG5cdGZvciAobGV0IHRva2VuSW5kZXggPSAwLCBsZW4gPSB0b2tlbnMubGVuZ3RoOyB0b2tlbkluZGV4IDwgbGVuOyB0b2tlbkluZGV4KyspIHtcblx0XHRjb25zdCB0b2tlbiA9IHRva2Vuc1t0b2tlbkluZGV4XTtcblx0XHRjb25zdCB0b2tlbkVuZEluZGV4ID0gdG9rZW4uZW5kSW5kZXg7XG5cdFx0Y29uc3QgdG9rZW5UeXBlID0gdG9rZW4udHlwZTtcblx0XHRjb25zdCB0b2tlbk1ldGFkYXRhID0gdG9rZW4ubWV0YWRhdGE7XG5cdFx0Y29uc3QgdG9rZW5Db250YWluc1JUTCA9IHRva2VuLmNvbnRhaW5zUlRMO1xuXG5cdFx0d2hpbGUgKGxpbmVEZWNvcmF0aW9uSW5kZXggPCBsaW5lRGVjb3JhdGlvbnNMZW4gJiYgbGluZURlY29yYXRpb25zW2xpbmVEZWNvcmF0aW9uSW5kZXhdLnN0YXJ0T2Zmc2V0IDwgdG9rZW5FbmRJbmRleCkge1xuXHRcdFx0Y29uc3QgbGluZURlY29yYXRpb24gPSBsaW5lRGVjb3JhdGlvbnNbbGluZURlY29yYXRpb25JbmRleF07XG5cblx0XHRcdGlmIChsaW5lRGVjb3JhdGlvbi5zdGFydE9mZnNldCA+IGxhc3RSZXN1bHRFbmRJbmRleCkge1xuXHRcdFx0XHRsYXN0UmVzdWx0RW5kSW5kZXggPSBsaW5lRGVjb3JhdGlvbi5zdGFydE9mZnNldDtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChsYXN0UmVzdWx0RW5kSW5kZXgsIHRva2VuVHlwZSwgdG9rZW5NZXRhZGF0YSwgdG9rZW5Db250YWluc1JUTCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChsaW5lRGVjb3JhdGlvbi5lbmRPZmZzZXQgKyAxIDw9IHRva2VuRW5kSW5kZXgpIHtcblx0XHRcdFx0Ly8gVGhpcyBsaW5lIGRlY29yYXRpb24gZW5kcyBiZWZvcmUgdGhpcyB0b2tlbiBlbmRzXG5cdFx0XHRcdGxhc3RSZXN1bHRFbmRJbmRleCA9IGxpbmVEZWNvcmF0aW9uLmVuZE9mZnNldCArIDE7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQobGFzdFJlc3VsdEVuZEluZGV4LCB0b2tlblR5cGUgKyAnICcgKyBsaW5lRGVjb3JhdGlvbi5jbGFzc05hbWUsIHRva2VuTWV0YWRhdGEgfCBsaW5lRGVjb3JhdGlvbi5tZXRhZGF0YSwgdG9rZW5Db250YWluc1JUTCk7XG5cdFx0XHRcdGxpbmVEZWNvcmF0aW9uSW5kZXgrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRoaXMgbGluZSBkZWNvcmF0aW9uIGNvbnRpbnVlcyBvbiB0byB0aGUgbmV4dCB0b2tlblxuXHRcdFx0XHRsYXN0UmVzdWx0RW5kSW5kZXggPSB0b2tlbkVuZEluZGV4O1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IExpbmVQYXJ0KGxhc3RSZXN1bHRFbmRJbmRleCwgdG9rZW5UeXBlICsgJyAnICsgbGluZURlY29yYXRpb24uY2xhc3NOYW1lLCB0b2tlbk1ldGFkYXRhIHwgbGluZURlY29yYXRpb24ubWV0YWRhdGEsIHRva2VuQ29udGFpbnNSVEwpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodG9rZW5FbmRJbmRleCA+IGxhc3RSZXN1bHRFbmRJbmRleCkge1xuXHRcdFx0bGFzdFJlc3VsdEVuZEluZGV4ID0gdG9rZW5FbmRJbmRleDtcblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgTGluZVBhcnQobGFzdFJlc3VsdEVuZEluZGV4LCB0b2tlblR5cGUsIHRva2VuTWV0YWRhdGEsIHRva2VuQ29udGFpbnNSVEwpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGxhc3RUb2tlbkVuZEluZGV4ID0gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5lbmRJbmRleDtcblx0aWYgKGxpbmVEZWNvcmF0aW9uSW5kZXggPCBsaW5lRGVjb3JhdGlvbnNMZW4gJiYgbGluZURlY29yYXRpb25zW2xpbmVEZWNvcmF0aW9uSW5kZXhdLnN0YXJ0T2Zmc2V0ID09PSBsYXN0VG9rZW5FbmRJbmRleCkge1xuXHRcdHdoaWxlIChsaW5lRGVjb3JhdGlvbkluZGV4IDwgbGluZURlY29yYXRpb25zTGVuICYmIGxpbmVEZWNvcmF0aW9uc1tsaW5lRGVjb3JhdGlvbkluZGV4XS5zdGFydE9mZnNldCA9PT0gbGFzdFRva2VuRW5kSW5kZXgpIHtcblx0XHRcdGNvbnN0IGxpbmVEZWNvcmF0aW9uID0gbGluZURlY29yYXRpb25zW2xpbmVEZWNvcmF0aW9uSW5kZXhdO1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBMaW5lUGFydChsYXN0UmVzdWx0RW5kSW5kZXgsIGxpbmVEZWNvcmF0aW9uLmNsYXNzTmFtZSwgbGluZURlY29yYXRpb24ubWV0YWRhdGEsIGZhbHNlKTtcblx0XHRcdGxpbmVEZWNvcmF0aW9uSW5kZXgrKztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gaXMgb24gcHVycG9zZSBub3Qgc3BsaXQgdXAgaW50byBtdWx0aXBsZSBmdW5jdGlvbnMgdG8gYWxsb3cgcnVudGltZSB0eXBlIGluZmVyZW5jZSAoaS5lLiBwZXJmb3JtYW5jZSByZWFzb25zKS5cbiAqIE5vdGljZSBob3cgYWxsIHRoZSBuZWVkZWQgZGF0YSBpcyBmdWxseSByZXNvbHZlZCBhbmQgcGFzc2VkIGluIChpLmUuIG5vIG90aGVyIGNhbGxzKS5cbiAqL1xuZnVuY3Rpb24gX3JlbmRlckxpbmUoaW5wdXQ6IFJlc29sdmVkUmVuZGVyTGluZUlucHV0LCBzYjogU3RyaW5nQnVpbGRlcik6IFJlbmRlckxpbmVPdXRwdXQge1xuXHRjb25zdCBmb250SXNNb25vc3BhY2UgPSBpbnB1dC5mb250SXNNb25vc3BhY2U7XG5cdGNvbnN0IGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyA9IGlucHV0LmNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdztcblx0Y29uc3QgY29udGFpbnNGb3JlaWduRWxlbWVudHMgPSBpbnB1dC5jb250YWluc0ZvcmVpZ25FbGVtZW50cztcblx0Y29uc3QgbGluZUNvbnRlbnQgPSBpbnB1dC5saW5lQ29udGVudDtcblx0Y29uc3QgbGVuID0gaW5wdXQubGVuO1xuXHRjb25zdCBpc092ZXJmbG93aW5nID0gaW5wdXQuaXNPdmVyZmxvd2luZztcblx0Y29uc3Qgb3ZlcmZsb3dpbmdDaGFyQ291bnQgPSBpbnB1dC5vdmVyZmxvd2luZ0NoYXJDb3VudDtcblx0Y29uc3QgcGFydHMgPSBpbnB1dC5wYXJ0cztcblx0Y29uc3QgZmF1eEluZGVudExlbmd0aCA9IGlucHV0LmZhdXhJbmRlbnRMZW5ndGg7XG5cdGNvbnN0IHRhYlNpemUgPSBpbnB1dC50YWJTaXplO1xuXHRjb25zdCBzdGFydFZpc2libGVDb2x1bW4gPSBpbnB1dC5zdGFydFZpc2libGVDb2x1bW47XG5cdGNvbnN0IHNwYWNlV2lkdGggPSBpbnB1dC5zcGFjZVdpZHRoO1xuXHRjb25zdCByZW5kZXJTcGFjZUNoYXJDb2RlID0gaW5wdXQucmVuZGVyU3BhY2VDaGFyQ29kZTtcblx0Y29uc3QgcmVuZGVyV2hpdGVzcGFjZSA9IGlucHV0LnJlbmRlcldoaXRlc3BhY2U7XG5cdGNvbnN0IHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzID0gaW5wdXQucmVuZGVyQ29udHJvbENoYXJhY3RlcnM7XG5cblx0Y29uc3QgY2hhcmFjdGVyTWFwcGluZyA9IG5ldyBDaGFyYWN0ZXJNYXBwaW5nKGxlbiArIDEsIHBhcnRzLmxlbmd0aCk7XG5cdGxldCBsYXN0Q2hhcmFjdGVyTWFwcGluZ0RlZmluZWQgPSBmYWxzZTtcblxuXHRsZXQgY2hhckluZGV4ID0gMDtcblx0bGV0IHZpc2libGVDb2x1bW4gPSBzdGFydFZpc2libGVDb2x1bW47XG5cdGxldCBjaGFyT2Zmc2V0SW5QYXJ0ID0gMDsgLy8gdGhlIGNoYXJhY3RlciBvZmZzZXQgaW4gdGhlIGN1cnJlbnQgcGFydFxuXHRsZXQgY2hhckhvcml6b250YWxPZmZzZXQgPSAwOyAvLyB0aGUgY2hhcmFjdGVyIGhvcml6b250YWwgcG9zaXRpb24gaW4gdGVybXMgb2YgY2hhcnMgcmVsYXRpdmUgdG8gbGluZSBzdGFydFxuXG5cdGxldCBwYXJ0RGlzcGxhY2VtZW50ID0gMDtcblxuXHRzYi5hcHBlbmRTdHJpbmcoJzxzcGFuPicpO1xuXG5cdGZvciAobGV0IHBhcnRJbmRleCA9IDAsIHRva2Vuc0xlbiA9IHBhcnRzLmxlbmd0aDsgcGFydEluZGV4IDwgdG9rZW5zTGVuOyBwYXJ0SW5kZXgrKykge1xuXG5cdFx0Y29uc3QgcGFydCA9IHBhcnRzW3BhcnRJbmRleF07XG5cdFx0Y29uc3QgcGFydEVuZEluZGV4ID0gcGFydC5lbmRJbmRleDtcblx0XHRjb25zdCBwYXJ0VHlwZSA9IHBhcnQudHlwZTtcblx0XHRjb25zdCBwYXJ0Q29udGFpbnNSVEwgPSBwYXJ0LmNvbnRhaW5zUlRMO1xuXHRcdGNvbnN0IHBhcnRSZW5kZXJzV2hpdGVzcGFjZSA9IChyZW5kZXJXaGl0ZXNwYWNlICE9PSBSZW5kZXJXaGl0ZXNwYWNlLk5vbmUgJiYgcGFydC5pc1doaXRlc3BhY2UoKSk7XG5cdFx0Y29uc3QgcGFydFJlbmRlcnNXaGl0ZXNwYWNlV2l0aFdpZHRoID0gcGFydFJlbmRlcnNXaGl0ZXNwYWNlICYmICFmb250SXNNb25vc3BhY2UgJiYgKHBhcnRUeXBlID09PSAnbXRrdycvKm9ubHkgd2hpdGVzcGFjZSovIHx8ICFjb250YWluc0ZvcmVpZ25FbGVtZW50cyk7XG5cdFx0Y29uc3QgcGFydElzRW1wdHlBbmRIYXNQc2V1ZG9BZnRlciA9IChjaGFySW5kZXggPT09IHBhcnRFbmRJbmRleCAmJiBwYXJ0LmlzUHNldWRvQWZ0ZXIoKSk7XG5cdFx0Y2hhck9mZnNldEluUGFydCA9IDA7XG5cblx0XHRzYi5hcHBlbmRTdHJpbmcoJzxzcGFuICcpO1xuXHRcdGlmIChwYXJ0Q29udGFpbnNSVEwpIHtcblx0XHRcdHNiLmFwcGVuZFN0cmluZygnc3R5bGU9XCJ1bmljb2RlLWJpZGk6aXNvbGF0ZVwiICcpO1xuXHRcdH1cblx0XHRzYi5hcHBlbmRTdHJpbmcoJ2NsYXNzPVwiJyk7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKHBhcnRSZW5kZXJzV2hpdGVzcGFjZVdpdGhXaWR0aCA/ICdtdGt6JyA6IHBhcnRUeXBlKTtcblx0XHRzYi5hcHBlbmRBU0NJSUNoYXJDb2RlKENoYXJDb2RlLkRvdWJsZVF1b3RlKTtcblxuXHRcdGlmIChwYXJ0UmVuZGVyc1doaXRlc3BhY2UpIHtcblxuXHRcdFx0bGV0IHBhcnRXaWR0aCA9IDA7XG5cdFx0XHR7XG5cdFx0XHRcdGxldCBfY2hhckluZGV4ID0gY2hhckluZGV4O1xuXHRcdFx0XHRsZXQgX3Zpc2libGVDb2x1bW4gPSB2aXNpYmxlQ29sdW1uO1xuXG5cdFx0XHRcdGZvciAoOyBfY2hhckluZGV4IDwgcGFydEVuZEluZGV4OyBfY2hhckluZGV4KyspIHtcblx0XHRcdFx0XHRjb25zdCBjaGFyQ29kZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoX2NoYXJJbmRleCk7XG5cdFx0XHRcdFx0Y29uc3QgY2hhcldpZHRoID0gKGNoYXJDb2RlID09PSBDaGFyQ29kZS5UYWIgPyAodGFiU2l6ZSAtIChfdmlzaWJsZUNvbHVtbiAlIHRhYlNpemUpKSA6IDEpIHwgMDtcblx0XHRcdFx0XHRwYXJ0V2lkdGggKz0gY2hhcldpZHRoO1xuXHRcdFx0XHRcdGlmIChfY2hhckluZGV4ID49IGZhdXhJbmRlbnRMZW5ndGgpIHtcblx0XHRcdFx0XHRcdF92aXNpYmxlQ29sdW1uICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHBhcnRSZW5kZXJzV2hpdGVzcGFjZVdpdGhXaWR0aCkge1xuXHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJyBzdHlsZT1cIndpZHRoOicpO1xuXHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoU3RyaW5nKHNwYWNlV2lkdGggKiBwYXJ0V2lkdGgpKTtcblx0XHRcdFx0c2IuYXBwZW5kU3RyaW5nKCdweFwiJyk7XG5cdFx0XHR9XG5cdFx0XHRzYi5hcHBlbmRBU0NJSUNoYXJDb2RlKENoYXJDb2RlLkdyZWF0ZXJUaGFuKTtcblxuXHRcdFx0Zm9yICg7IGNoYXJJbmRleCA8IHBhcnRFbmRJbmRleDsgY2hhckluZGV4KyspIHtcblx0XHRcdFx0Y2hhcmFjdGVyTWFwcGluZy5zZXRDb2x1bW5JbmZvKGNoYXJJbmRleCArIDEsIHBhcnRJbmRleCAtIHBhcnREaXNwbGFjZW1lbnQsIGNoYXJPZmZzZXRJblBhcnQsIGNoYXJIb3Jpem9udGFsT2Zmc2V0KTtcblx0XHRcdFx0cGFydERpc3BsYWNlbWVudCA9IDA7XG5cdFx0XHRcdGNvbnN0IGNoYXJDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjaGFySW5kZXgpO1xuXG5cdFx0XHRcdGxldCBwcm9kdWNlZENoYXJhY3RlcnM6IG51bWJlcjtcblx0XHRcdFx0bGV0IGNoYXJXaWR0aDogbnVtYmVyO1xuXG5cdFx0XHRcdGlmIChjaGFyQ29kZSA9PT0gQ2hhckNvZGUuVGFiKSB7XG5cdFx0XHRcdFx0cHJvZHVjZWRDaGFyYWN0ZXJzID0gKHRhYlNpemUgLSAodmlzaWJsZUNvbHVtbiAlIHRhYlNpemUpKSB8IDA7XG5cdFx0XHRcdFx0Y2hhcldpZHRoID0gcHJvZHVjZWRDaGFyYWN0ZXJzO1xuXG5cdFx0XHRcdFx0aWYgKCFjYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3cgfHwgY2hhcldpZHRoID4gMSkge1xuXHRcdFx0XHRcdFx0c2IuYXBwZW5kQ2hhckNvZGUoMHgyMTkyKTsgLy8gUklHSFRXQVJEUyBBUlJPV1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSgweEZGRUIpOyAvLyBIQUxGV0lEVEggUklHSFRXQVJEUyBBUlJPV1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGxldCBzcGFjZSA9IDI7IHNwYWNlIDw9IGNoYXJXaWR0aDsgc3BhY2UrKykge1xuXHRcdFx0XHRcdFx0c2IuYXBwZW5kQ2hhckNvZGUoMHhBMCk7IC8vICZuYnNwO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9IGVsc2UgeyAvLyBtdXN0IGJlIENoYXJDb2RlLlNwYWNlXG5cdFx0XHRcdFx0cHJvZHVjZWRDaGFyYWN0ZXJzID0gMjtcblx0XHRcdFx0XHRjaGFyV2lkdGggPSAxO1xuXG5cdFx0XHRcdFx0c2IuYXBwZW5kQ2hhckNvZGUocmVuZGVyU3BhY2VDaGFyQ29kZSk7IC8vICZtaWRkb3Q7IG9yIHdvcmQgc2VwYXJhdG9yIG1pZGRsZSBkb3Rcblx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSgweDIwMEMpOyAvLyBaRVJPIFdJRFRIIE5PTi1KT0lORVJcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNoYXJPZmZzZXRJblBhcnQgKz0gcHJvZHVjZWRDaGFyYWN0ZXJzO1xuXHRcdFx0XHRjaGFySG9yaXpvbnRhbE9mZnNldCArPSBjaGFyV2lkdGg7XG5cdFx0XHRcdGlmIChjaGFySW5kZXggPj0gZmF1eEluZGVudExlbmd0aCkge1xuXHRcdFx0XHRcdHZpc2libGVDb2x1bW4gKz0gY2hhcldpZHRoO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXG5cdFx0XHRzYi5hcHBlbmRBU0NJSUNoYXJDb2RlKENoYXJDb2RlLkdyZWF0ZXJUaGFuKTtcblxuXHRcdFx0Zm9yICg7IGNoYXJJbmRleCA8IHBhcnRFbmRJbmRleDsgY2hhckluZGV4KyspIHtcblx0XHRcdFx0Y2hhcmFjdGVyTWFwcGluZy5zZXRDb2x1bW5JbmZvKGNoYXJJbmRleCArIDEsIHBhcnRJbmRleCAtIHBhcnREaXNwbGFjZW1lbnQsIGNoYXJPZmZzZXRJblBhcnQsIGNoYXJIb3Jpem9udGFsT2Zmc2V0KTtcblx0XHRcdFx0cGFydERpc3BsYWNlbWVudCA9IDA7XG5cdFx0XHRcdGNvbnN0IGNoYXJDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChjaGFySW5kZXgpO1xuXG5cdFx0XHRcdGxldCBwcm9kdWNlZENoYXJhY3RlcnMgPSAxO1xuXHRcdFx0XHRsZXQgY2hhcldpZHRoID0gMTtcblxuXHRcdFx0XHRzd2l0Y2ggKGNoYXJDb2RlKSB7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5UYWI6XG5cdFx0XHRcdFx0XHRwcm9kdWNlZENoYXJhY3RlcnMgPSAodGFiU2l6ZSAtICh2aXNpYmxlQ29sdW1uICUgdGFiU2l6ZSkpO1xuXHRcdFx0XHRcdFx0Y2hhcldpZHRoID0gcHJvZHVjZWRDaGFyYWN0ZXJzO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgc3BhY2UgPSAxOyBzcGFjZSA8PSBwcm9kdWNlZENoYXJhY3RlcnM7IHNwYWNlKyspIHtcblx0XHRcdFx0XHRcdFx0c2IuYXBwZW5kQ2hhckNvZGUoMHhBMCk7IC8vICZuYnNwO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLlNwYWNlOlxuXHRcdFx0XHRcdFx0c2IuYXBwZW5kQ2hhckNvZGUoMHhBMCk7IC8vICZuYnNwO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkxlc3NUaGFuOlxuXHRcdFx0XHRcdFx0c2IuYXBwZW5kU3RyaW5nKCcmbHQ7Jyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuR3JlYXRlclRoYW46XG5cdFx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJyZndDsnKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5BbXBlcnNhbmQ6XG5cdFx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJyZhbXA7Jyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuTnVsbDpcblx0XHRcdFx0XHRcdGlmIChyZW5kZXJDb250cm9sQ2hhcmFjdGVycykge1xuXHRcdFx0XHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly91bmljb2RlLXRhYmxlLmNvbS9lbi9ibG9ja3MvY29udHJvbC1waWN0dXJlcy9cblx0XHRcdFx0XHRcdFx0c2IuYXBwZW5kQ2hhckNvZGUoOTIxNik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJyYjMDA7Jyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuVVRGOF9CT006XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5MSU5FX1NFUEFSQVRPUjpcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLlBBUkFHUkFQSF9TRVBBUkFUT1I6XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5ORVhUX0xJTkU6XG5cdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSgweEZGRkQpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0aWYgKHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIoY2hhckNvZGUpKSB7XG5cdFx0XHRcdFx0XHRcdGNoYXJXaWR0aCsrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vdW5pY29kZS10YWJsZS5jb20vZW4vYmxvY2tzL2NvbnRyb2wtcGljdHVyZXMvXG5cdFx0XHRcdFx0XHRpZiAocmVuZGVyQ29udHJvbENoYXJhY3RlcnMgJiYgY2hhckNvZGUgPCAzMikge1xuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSg5MjE2ICsgY2hhckNvZGUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChyZW5kZXJDb250cm9sQ2hhcmFjdGVycyAmJiBjaGFyQ29kZSA9PT0gMTI3KSB7XG5cdFx0XHRcdFx0XHRcdC8vIERFTFxuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRDaGFyQ29kZSg5MjQ5KTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocmVuZGVyQ29udHJvbENoYXJhY3RlcnMgJiYgaXNDb250cm9sQ2hhcmFjdGVyKGNoYXJDb2RlKSkge1xuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJ1tVKycpO1xuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcodG80Q2hhckhleChjaGFyQ29kZSkpO1xuXHRcdFx0XHRcdFx0XHRzYi5hcHBlbmRTdHJpbmcoJ10nKTtcblx0XHRcdFx0XHRcdFx0cHJvZHVjZWRDaGFyYWN0ZXJzID0gODtcblx0XHRcdFx0XHRcdFx0Y2hhcldpZHRoID0gcHJvZHVjZWRDaGFyYWN0ZXJzO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c2IuYXBwZW5kQ2hhckNvZGUoY2hhckNvZGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hhck9mZnNldEluUGFydCArPSBwcm9kdWNlZENoYXJhY3RlcnM7XG5cdFx0XHRcdGNoYXJIb3Jpem9udGFsT2Zmc2V0ICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0aWYgKGNoYXJJbmRleCA+PSBmYXV4SW5kZW50TGVuZ3RoKSB7XG5cdFx0XHRcdFx0dmlzaWJsZUNvbHVtbiArPSBjaGFyV2lkdGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocGFydElzRW1wdHlBbmRIYXNQc2V1ZG9BZnRlcikge1xuXHRcdFx0cGFydERpc3BsYWNlbWVudCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwYXJ0RGlzcGxhY2VtZW50ID0gMDtcblx0XHR9XG5cblx0XHRpZiAoY2hhckluZGV4ID49IGxlbiAmJiAhbGFzdENoYXJhY3Rlck1hcHBpbmdEZWZpbmVkICYmIHBhcnQuaXNQc2V1ZG9BZnRlcigpKSB7XG5cdFx0XHRsYXN0Q2hhcmFjdGVyTWFwcGluZ0RlZmluZWQgPSB0cnVlO1xuXHRcdFx0Y2hhcmFjdGVyTWFwcGluZy5zZXRDb2x1bW5JbmZvKGNoYXJJbmRleCArIDEsIHBhcnRJbmRleCwgY2hhck9mZnNldEluUGFydCwgY2hhckhvcml6b250YWxPZmZzZXQpO1xuXHRcdH1cblxuXHRcdHNiLmFwcGVuZFN0cmluZygnPC9zcGFuPicpO1xuXG5cdH1cblxuXHRpZiAoIWxhc3RDaGFyYWN0ZXJNYXBwaW5nRGVmaW5lZCkge1xuXHRcdC8vIFdoZW4gZ2V0dGluZyBjbGllbnQgcmVjdHMgZm9yIHRoZSBsYXN0IGNoYXJhY3Rlciwgd2Ugd2lsbCBwb3NpdGlvbiB0aGVcblx0XHQvLyB0ZXh0IHJhbmdlIGF0IHRoZSBlbmQgb2YgdGhlIHNwYW4sIGluc3RlYWYgb2YgYXQgdGhlIGJlZ2lubmluZyBvZiBuZXh0IHNwYW5cblx0XHRjaGFyYWN0ZXJNYXBwaW5nLnNldENvbHVtbkluZm8obGVuICsgMSwgcGFydHMubGVuZ3RoIC0gMSwgY2hhck9mZnNldEluUGFydCwgY2hhckhvcml6b250YWxPZmZzZXQpO1xuXHR9XG5cblx0aWYgKGlzT3ZlcmZsb3dpbmcpIHtcblx0XHRzYi5hcHBlbmRTdHJpbmcoJzxzcGFuIGNsYXNzPVwibXRrb3ZlcmZsb3dcIj4nKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcobmxzLmxvY2FsaXplKCdzaG93TW9yZScsIFwiU2hvdyBtb3JlICh7MH0pXCIsIHJlbmRlck92ZXJmbG93aW5nQ2hhckNvdW50KG92ZXJmbG93aW5nQ2hhckNvdW50KSkpO1xuXHRcdHNiLmFwcGVuZFN0cmluZygnPC9zcGFuPicpO1xuXHR9XG5cblx0c2IuYXBwZW5kU3RyaW5nKCc8L3NwYW4+Jyk7XG5cblx0cmV0dXJuIG5ldyBSZW5kZXJMaW5lT3V0cHV0KGNoYXJhY3Rlck1hcHBpbmcsIGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzKTtcbn1cblxuZnVuY3Rpb24gdG80Q2hhckhleChuOiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gbi50b1N0cmluZygxNikudG9VcHBlckNhc2UoKS5wYWRTdGFydCg0LCAnMCcpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJPdmVyZmxvd2luZ0NoYXJDb3VudChuOiBudW1iZXIpOiBzdHJpbmcge1xuXHRpZiAobiA8IDEwMjQpIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdvdmVyZmxvdy5jaGFycycsIFwiezB9IGNoYXJzXCIsIG4pO1xuXHR9XG5cdGlmIChuIDwgMTAyNCAqIDEwMjQpIHtcblx0XHRyZXR1cm4gYCR7KG4gLyAxMDI0KS50b0ZpeGVkKDEpfSBLQmA7XG5cdH1cblx0cmV0dXJuIGAkeyhuIC8gMTAyNCAvIDEwMjQpLnRvRml4ZWQoMSl9IE1CYDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixZQUFZLGFBQWE7QUFFekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0IsaUNBQWlDO0FBQzFELFNBQVMsVUFBVSx3QkFBd0I7QUFFM0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFFdkIsSUFBVyxtQkFBWCxrQkFBV0Esc0JBQVg7QUFDTixFQUFBQSxvQ0FBQSxVQUFPLEtBQVA7QUFDQSxFQUFBQSxvQ0FBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSxvQ0FBQSxlQUFZLEtBQVo7QUFDQSxFQUFBQSxvQ0FBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSxvQ0FBQSxTQUFNLEtBQU47QUFMaUIsU0FBQUE7QUFBQSxHQUFBO0FBaUNYLE1BQU0sZ0JBQWdCO0FBQUEsRUFpQzVCLElB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QUFBLElBQ0QsT0FBTztBQUNOLHlCQUFtQjtBQUFBLElBQ3BCO0FBRUEsUUFBSSxhQUFhLE9BQU8sQ0FBQywrQkFBK0IsS0FBSyxjQUFjLEdBQUc7QUFDN0Usb0NBQThCO0FBQzlCLHVCQUFpQixjQUFjLFlBQVksR0FBRyxXQUFXLGtCQUFrQixvQkFBb0I7QUFBQSxJQUNoRztBQUVBLE9BQUcsYUFBYSxTQUFTO0FBQUEsRUFFMUI7QUFFQSxNQUFJLENBQUMsNkJBQTZCO0FBR2pDLHFCQUFpQixjQUFjLE1BQU0sR0FBRyxNQUFNLFNBQVMsR0FBRyxrQkFBa0Isb0JBQW9CO0FBQUEsRUFDakc7QUFFQSxNQUFJLGVBQWU7QUFDbEIsT0FBRyxhQUFhLDRCQUE0QjtBQUM1QyxPQUFHLGFBQWEsSUFBSSxTQUFTLFlBQVksbUJBQW1CLDJCQUEyQixvQkFBb0IsQ0FBQyxDQUFDO0FBQzdHLE9BQUcsYUFBYSxTQUFTO0FBQUEsRUFDMUI7QUFFQSxLQUFHLGFBQWEsU0FBUztBQUV6QixTQUFPLElBQUksaUJBQWlCLGtCQUFrQix1QkFBdUI7QUFDdEU7QUFFQSxTQUFTLFdBQVcsR0FBbUI7QUFDdEMsU0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLFlBQVksRUFBRSxTQUFTLEdBQUcsR0FBRztBQUNwRDtBQUVBLFNBQVMsMkJBQTJCLEdBQW1CO0FBQ3RELE1BQUksSUFBSSxNQUFNO0FBQ2IsV0FBTyxJQUFJLFNBQVMsa0JBQWtCLGFBQWEsQ0FBQztBQUFBLEVBQ3JEO0FBQ0EsTUFBSSxJQUFJLE9BQU8sTUFBTTtBQUNwQixXQUFPLElBQUksSUFBSSxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDaEM7QUFDQSxTQUFPLElBQUksSUFBSSxPQUFPLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFDdkM7IiwKICAibmFtZXMiOiBbIlJlbmRlcldoaXRlc3BhY2UiLCAiQ2hhcmFjdGVyTWFwcGluZ0NvbnN0YW50cyIsICJGb3JlaWduRWxlbWVudFR5cGUiLCAibGVuIiwgInRva2VuQ29udGFpbnNSVEwiLCAiQ29uc3RhbnRzIl0KfQo=
