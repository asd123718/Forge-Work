import { FontStyle, ColorId, MetadataConsts, TokenMetadata } from "../encodedTokenAttributes.js";
import { OffsetRange } from "../core/ranges/offsetRange.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
const _LineTokens = class _LineTokens {
  constructor(tokens, text, decoder) {
    this._lineTokensBrand = void 0;
    const tokensLength = tokens.length > 1 ? tokens[tokens.length - 2] : 0;
    if (tokensLength !== text.length) {
      onUnexpectedError(new Error("Token length and text length do not match!"));
    }
    this._tokens = tokens;
    this._tokensCount = this._tokens.length >>> 1;
    this._text = text;
    this.languageIdCodec = decoder;
  }
  static createEmpty(lineContent, decoder) {
    const defaultMetadata = _LineTokens.defaultTokenMetadata;
    const tokens = new Uint32Array(2);
    tokens[0] = lineContent.length;
    tokens[1] = defaultMetadata;
    return new _LineTokens(tokens, lineContent, decoder);
  }
  static createFromTextAndMetadata(data, decoder) {
    let offset = 0;
    let fullText = "";
    const tokens = new Array();
    for (const { text, metadata } of data) {
      tokens.push(offset + text.length, metadata);
      offset += text.length;
      fullText += text;
    }
    return new _LineTokens(new Uint32Array(tokens), fullText, decoder);
  }
  static convertToEndOffset(tokens, lineTextLength) {
    const tokenCount = tokens.length >>> 1;
    const lastTokenIndex = tokenCount - 1;
    for (let tokenIndex = 0; tokenIndex < lastTokenIndex; tokenIndex++) {
      tokens[tokenIndex << 1] = tokens[tokenIndex + 1 << 1];
    }
    tokens[lastTokenIndex << 1] = lineTextLength;
  }
  static findIndexInTokensArray(tokens, desiredIndex) {
    if (tokens.length <= 2) {
      return 0;
    }
    let low = 0;
    let high = (tokens.length >>> 1) - 1;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      const endOffset = tokens[mid << 1];
      if (endOffset === desiredIndex) {
        return mid + 1;
      } else if (endOffset < desiredIndex) {
        low = mid + 1;
      } else if (endOffset > desiredIndex) {
        high = mid;
      }
    }
    return low;
  }
  getTextLength() {
    return this._text.length;
  }
  equals(other) {
    if (other instanceof _LineTokens) {
      return this.slicedEquals(other, 0, this._tokensCount);
    }
    return false;
  }
  slicedEquals(other, sliceFromTokenIndex, sliceTokenCount) {
    if (this._text !== other._text) {
      return false;
    }
    if (this._tokensCount !== other._tokensCount) {
      return false;
    }
    const from = sliceFromTokenIndex << 1;
    const to = from + (sliceTokenCount << 1);
    for (let i = from; i < to; i++) {
      if (this._tokens[i] !== other._tokens[i]) {
        return false;
      }
    }
    return true;
  }
  getLineContent() {
    return this._text;
  }
  getCount() {
    return this._tokensCount;
  }
  getStartOffset(tokenIndex) {
    if (tokenIndex > 0) {
      return this._tokens[tokenIndex - 1 << 1];
    }
    return 0;
  }
  getMetadata(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return metadata;
  }
  getLanguageId(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    const languageId = TokenMetadata.getLanguageId(metadata);
    return this.languageIdCodec.decodeLanguageId(languageId);
  }
  getStandardTokenType(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getTokenType(metadata);
  }
  getForeground(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getForeground(metadata);
  }
  getClassName(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getClassNameFromMetadata(metadata);
  }
  getInlineStyle(tokenIndex, colorMap) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getInlineStyleFromMetadata(metadata, colorMap);
  }
  getPresentation(tokenIndex) {
    const metadata = this._tokens[(tokenIndex << 1) + 1];
    return TokenMetadata.getPresentationFromMetadata(metadata);
  }
  getEndOffset(tokenIndex) {
    return this._tokens[tokenIndex << 1];
  }
  /**
   * Find the token containing offset `offset`.
   * @param offset The search offset
   * @return The index of the token containing the offset.
   */
  findTokenIndexAtOffset(offset) {
    return _LineTokens.findIndexInTokensArray(this._tokens, offset);
  }
  inflate() {
    return this;
  }
  sliceAndInflate(startOffset, endOffset, deltaOffset) {
    return new SliceLineTokens(this, startOffset, endOffset, deltaOffset);
  }
  sliceZeroCopy(range) {
    return this.sliceAndInflate(range.start, range.endExclusive, 0);
  }
  /**
   * @pure
   * @param insertTokens Must be sorted by offset.
  */
  withInserted(insertTokens) {
    if (insertTokens.length === 0) {
      return this;
    }
    let nextOriginalTokenIdx = 0;
    let nextInsertTokenIdx = 0;
    let text = "";
    const newTokens = new Array();
    let originalEndOffset = 0;
    while (true) {
      const nextOriginalTokenEndOffset = nextOriginalTokenIdx < this._tokensCount ? this._tokens[nextOriginalTokenIdx << 1] : -1;
      const nextInsertToken = nextInsertTokenIdx < insertTokens.length ? insertTokens[nextInsertTokenIdx] : null;
      if (nextOriginalTokenEndOffset !== -1 && (nextInsertToken === null || nextOriginalTokenEndOffset <= nextInsertToken.offset)) {
        text += this._text.substring(originalEndOffset, nextOriginalTokenEndOffset);
        const metadata = this._tokens[(nextOriginalTokenIdx << 1) + 1];
        newTokens.push(text.length, metadata);
        nextOriginalTokenIdx++;
        originalEndOffset = nextOriginalTokenEndOffset;
      } else if (nextInsertToken) {
        if (nextInsertToken.offset > originalEndOffset) {
          text += this._text.substring(originalEndOffset, nextInsertToken.offset);
          const metadata = this._tokens[(nextOriginalTokenIdx << 1) + 1];
          newTokens.push(text.length, metadata);
          originalEndOffset = nextInsertToken.offset;
        }
        text += nextInsertToken.text;
        newTokens.push(text.length, nextInsertToken.tokenMetadata);
        nextInsertTokenIdx++;
      } else {
        break;
      }
    }
    return new _LineTokens(new Uint32Array(newTokens), text, this.languageIdCodec);
  }
  getTokensInRange(range) {
    const builder = new TokenArrayBuilder();
    const startTokenIndex = this.findTokenIndexAtOffset(range.start);
    const endTokenIndex = this.findTokenIndexAtOffset(range.endExclusive);
    for (let tokenIndex = startTokenIndex; tokenIndex <= endTokenIndex; tokenIndex++) {
      const tokenRange = new OffsetRange(this.getStartOffset(tokenIndex), this.getEndOffset(tokenIndex));
      const length = tokenRange.intersectionLength(range);
      if (length > 0) {
        builder.add(length, this.getMetadata(tokenIndex));
      }
    }
    return builder.build();
  }
  getTokenText(tokenIndex) {
    const startOffset = this.getStartOffset(tokenIndex);
    const endOffset = this.getEndOffset(tokenIndex);
    const text = this._text.substring(startOffset, endOffset);
    return text;
  }
  forEach(callback) {
    const tokenCount = this.getCount();
    for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
      callback(tokenIndex);
    }
  }
  toString() {
    let result = "";
    this.forEach((i) => {
      result += `[${this.getTokenText(i)}]{${this.getClassName(i)}}`;
    });
    return result;
  }
};
_LineTokens.defaultTokenMetadata = (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET | ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET | ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET) >>> 0;
let LineTokens = _LineTokens;
class SliceLineTokens {
  constructor(source, startOffset, endOffset, deltaOffset) {
    this._source = source;
    this._startOffset = startOffset;
    this._endOffset = endOffset;
    this._deltaOffset = deltaOffset;
    this._firstTokenIndex = source.findTokenIndexAtOffset(startOffset);
    this.languageIdCodec = source.languageIdCodec;
    this._tokensCount = 0;
    for (let i = this._firstTokenIndex, len = source.getCount(); i < len; i++) {
      const tokenStartOffset = source.getStartOffset(i);
      if (tokenStartOffset >= endOffset) {
        break;
      }
      this._tokensCount++;
    }
  }
  getMetadata(tokenIndex) {
    return this._source.getMetadata(this._firstTokenIndex + tokenIndex);
  }
  getLanguageId(tokenIndex) {
    return this._source.getLanguageId(this._firstTokenIndex + tokenIndex);
  }
  getLineContent() {
    return this._source.getLineContent().substring(this._startOffset, this._endOffset);
  }
  equals(other) {
    if (other instanceof SliceLineTokens) {
      return this._startOffset === other._startOffset && this._endOffset === other._endOffset && this._deltaOffset === other._deltaOffset && this._source.slicedEquals(other._source, this._firstTokenIndex, this._tokensCount);
    }
    return false;
  }
  getCount() {
    return this._tokensCount;
  }
  getStandardTokenType(tokenIndex) {
    return this._source.getStandardTokenType(this._firstTokenIndex + tokenIndex);
  }
  getForeground(tokenIndex) {
    return this._source.getForeground(this._firstTokenIndex + tokenIndex);
  }
  getEndOffset(tokenIndex) {
    const tokenEndOffset = this._source.getEndOffset(this._firstTokenIndex + tokenIndex);
    return Math.min(this._endOffset, tokenEndOffset) - this._startOffset + this._deltaOffset;
  }
  getClassName(tokenIndex) {
    return this._source.getClassName(this._firstTokenIndex + tokenIndex);
  }
  getInlineStyle(tokenIndex, colorMap) {
    return this._source.getInlineStyle(this._firstTokenIndex + tokenIndex, colorMap);
  }
  getPresentation(tokenIndex) {
    return this._source.getPresentation(this._firstTokenIndex + tokenIndex);
  }
  findTokenIndexAtOffset(offset) {
    return this._source.findTokenIndexAtOffset(offset + this._startOffset - this._deltaOffset) - this._firstTokenIndex;
  }
  getTokenText(tokenIndex) {
    const adjustedTokenIndex = this._firstTokenIndex + tokenIndex;
    const tokenStartOffset = this._source.getStartOffset(adjustedTokenIndex);
    const tokenEndOffset = this._source.getEndOffset(adjustedTokenIndex);
    let text = this._source.getTokenText(adjustedTokenIndex);
    if (tokenStartOffset < this._startOffset) {
      text = text.substring(this._startOffset - tokenStartOffset);
    }
    if (tokenEndOffset > this._endOffset) {
      text = text.substring(0, text.length - (tokenEndOffset - this._endOffset));
    }
    return text;
  }
  forEach(callback) {
    for (let tokenIndex = 0; tokenIndex < this.getCount(); tokenIndex++) {
      callback(tokenIndex);
    }
  }
}
function getStandardTokenTypeAtPosition(model, position) {
  const lineNumber = position.lineNumber;
  if (!model.tokenization.isCheapToTokenize(lineNumber)) {
    return void 0;
  }
  model.tokenization.forceTokenization(lineNumber);
  const lineTokens = model.tokenization.getLineTokens(lineNumber);
  const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
  const tokenType = lineTokens.getStandardTokenType(tokenIndex);
  return tokenType;
}
class TokenArray {
  constructor(_tokenInfo) {
    this._tokenInfo = _tokenInfo;
  }
  static fromLineTokens(lineTokens) {
    const tokenInfo = [];
    for (let i = 0; i < lineTokens.getCount(); i++) {
      tokenInfo.push(new TokenInfo(lineTokens.getEndOffset(i) - lineTokens.getStartOffset(i), lineTokens.getMetadata(i)));
    }
    return TokenArray.create(tokenInfo);
  }
  static create(tokenInfo) {
    return new TokenArray(tokenInfo);
  }
  toLineTokens(lineContent, decoder) {
    return LineTokens.createFromTextAndMetadata(this.map((r, t) => ({ text: r.substring(lineContent), metadata: t.metadata })), decoder);
  }
  forEach(cb) {
    let lengthSum = 0;
    for (const tokenInfo of this._tokenInfo) {
      const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.length);
      cb(range, tokenInfo);
      lengthSum += tokenInfo.length;
    }
  }
  map(cb) {
    const result = [];
    let lengthSum = 0;
    for (const tokenInfo of this._tokenInfo) {
      const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.length);
      result.push(cb(range, tokenInfo));
      lengthSum += tokenInfo.length;
    }
    return result;
  }
  slice(range) {
    const result = [];
    let lengthSum = 0;
    for (const tokenInfo of this._tokenInfo) {
      const tokenStart = lengthSum;
      const tokenEndEx = tokenStart + tokenInfo.length;
      if (tokenEndEx > range.start) {
        if (tokenStart >= range.endExclusive) {
          break;
        }
        const deltaBefore = Math.max(0, range.start - tokenStart);
        const deltaAfter = Math.max(0, tokenEndEx - range.endExclusive);
        result.push(new TokenInfo(tokenInfo.length - deltaBefore - deltaAfter, tokenInfo.metadata));
      }
      lengthSum += tokenInfo.length;
    }
    return TokenArray.create(result);
  }
  append(other) {
    const result = this._tokenInfo.concat(other._tokenInfo);
    return TokenArray.create(result);
  }
}
class TokenInfo {
  constructor(length, metadata) {
    this.length = length;
    this.metadata = metadata;
  }
}
class TokenArrayBuilder {
  constructor() {
    this._tokens = [];
  }
  add(length, metadata) {
    this._tokens.push(new TokenInfo(length, metadata));
  }
  build() {
    return TokenArray.create(this._tokens);
  }
}
export {
  LineTokens,
  TokenArray,
  TokenArrayBuilder,
  TokenInfo,
  getStandardTokenTypeAtPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdG9rZW5zXFxsaW5lVG9rZW5zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUxhbmd1YWdlSWRDb2RlYyB9IGZyb20gJy4uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBGb250U3R5bGUsIENvbG9ySWQsIFN0YW5kYXJkVG9rZW5UeXBlLCBNZXRhZGF0YUNvbnN0cywgSVRva2VuUHJlc2VudGF0aW9uLCBUb2tlbk1ldGFkYXRhIH0gZnJvbSAnLi4vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3TGluZVRva2VucyB7XG5cdGxhbmd1YWdlSWRDb2RlYzogSUxhbmd1YWdlSWRDb2RlYztcblx0ZXF1YWxzKG90aGVyOiBJVmlld0xpbmVUb2tlbnMpOiBib29sZWFuO1xuXHRnZXRDb3VudCgpOiBudW1iZXI7XG5cdGdldFN0YW5kYXJkVG9rZW5UeXBlKHRva2VuSW5kZXg6IG51bWJlcik6IFN0YW5kYXJkVG9rZW5UeXBlO1xuXHRnZXRGb3JlZ3JvdW5kKHRva2VuSW5kZXg6IG51bWJlcik6IENvbG9ySWQ7XG5cdGdldEVuZE9mZnNldCh0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXI7XG5cdGdldENsYXNzTmFtZSh0b2tlbkluZGV4OiBudW1iZXIpOiBzdHJpbmc7XG5cdGdldElubGluZVN0eWxlKHRva2VuSW5kZXg6IG51bWJlciwgY29sb3JNYXA6IHN0cmluZ1tdKTogc3RyaW5nO1xuXHRnZXRQcmVzZW50YXRpb24odG9rZW5JbmRleDogbnVtYmVyKTogSVRva2VuUHJlc2VudGF0aW9uO1xuXHRmaW5kVG9rZW5JbmRleEF0T2Zmc2V0KG9mZnNldDogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXRMaW5lQ29udGVudCgpOiBzdHJpbmc7XG5cdGdldE1ldGFkYXRhKHRva2VuSW5kZXg6IG51bWJlcik6IG51bWJlcjtcblx0Z2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4OiBudW1iZXIpOiBzdHJpbmc7XG5cdGdldFRva2VuVGV4dCh0b2tlbkluZGV4OiBudW1iZXIpOiBzdHJpbmc7XG5cdGZvckVhY2goY2FsbGJhY2s6ICh0b2tlbkluZGV4OiBudW1iZXIpID0+IHZvaWQpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgTGluZVRva2VucyBpbXBsZW1lbnRzIElWaWV3TGluZVRva2VucyB7XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlRW1wdHkobGluZUNvbnRlbnQ6IHN0cmluZywgZGVjb2RlcjogSUxhbmd1YWdlSWRDb2RlYyk6IExpbmVUb2tlbnMge1xuXHRcdGNvbnN0IGRlZmF1bHRNZXRhZGF0YSA9IExpbmVUb2tlbnMuZGVmYXVsdFRva2VuTWV0YWRhdGE7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBuZXcgVWludDMyQXJyYXkoMik7XG5cdFx0dG9rZW5zWzBdID0gbGluZUNvbnRlbnQubGVuZ3RoO1xuXHRcdHRva2Vuc1sxXSA9IGRlZmF1bHRNZXRhZGF0YTtcblxuXHRcdHJldHVybiBuZXcgTGluZVRva2Vucyh0b2tlbnMsIGxpbmVDb250ZW50LCBkZWNvZGVyKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlRnJvbVRleHRBbmRNZXRhZGF0YShkYXRhOiB7IHRleHQ6IHN0cmluZzsgbWV0YWRhdGE6IG51bWJlciB9W10sIGRlY29kZXI6IElMYW5ndWFnZUlkQ29kZWMpOiBMaW5lVG9rZW5zIHtcblx0XHRsZXQgb2Zmc2V0OiBudW1iZXIgPSAwO1xuXHRcdGxldCBmdWxsVGV4dDogc3RyaW5nID0gJyc7XG5cdFx0Y29uc3QgdG9rZW5zID0gbmV3IEFycmF5PG51bWJlcj4oKTtcblx0XHRmb3IgKGNvbnN0IHsgdGV4dCwgbWV0YWRhdGEgfSBvZiBkYXRhKSB7XG5cdFx0XHR0b2tlbnMucHVzaChvZmZzZXQgKyB0ZXh0Lmxlbmd0aCwgbWV0YWRhdGEpO1xuXHRcdFx0b2Zmc2V0ICs9IHRleHQubGVuZ3RoO1xuXHRcdFx0ZnVsbFRleHQgKz0gdGV4dDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBMaW5lVG9rZW5zKG5ldyBVaW50MzJBcnJheSh0b2tlbnMpLCBmdWxsVGV4dCwgZGVjb2Rlcik7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNvbnZlcnRUb0VuZE9mZnNldCh0b2tlbnM6IFVpbnQzMkFycmF5LCBsaW5lVGV4dExlbmd0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9rZW5Db3VudCA9ICh0b2tlbnMubGVuZ3RoID4+PiAxKTtcblx0XHRjb25zdCBsYXN0VG9rZW5JbmRleCA9IHRva2VuQ291bnQgLSAxO1xuXHRcdGZvciAobGV0IHRva2VuSW5kZXggPSAwOyB0b2tlbkluZGV4IDwgbGFzdFRva2VuSW5kZXg7IHRva2VuSW5kZXgrKykge1xuXHRcdFx0dG9rZW5zW3Rva2VuSW5kZXggPDwgMV0gPSB0b2tlbnNbKHRva2VuSW5kZXggKyAxKSA8PCAxXTtcblx0XHR9XG5cdFx0dG9rZW5zW2xhc3RUb2tlbkluZGV4IDw8IDFdID0gbGluZVRleHRMZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZpbmRJbmRleEluVG9rZW5zQXJyYXkodG9rZW5zOiBVaW50MzJBcnJheSwgZGVzaXJlZEluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICh0b2tlbnMubGVuZ3RoIDw9IDIpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGxldCBsb3cgPSAwO1xuXHRcdGxldCBoaWdoID0gKHRva2Vucy5sZW5ndGggPj4+IDEpIC0gMTtcblxuXHRcdHdoaWxlIChsb3cgPCBoaWdoKSB7XG5cblx0XHRcdGNvbnN0IG1pZCA9IGxvdyArIE1hdGguZmxvb3IoKGhpZ2ggLSBsb3cpIC8gMik7XG5cdFx0XHRjb25zdCBlbmRPZmZzZXQgPSB0b2tlbnNbKG1pZCA8PCAxKV07XG5cblx0XHRcdGlmIChlbmRPZmZzZXQgPT09IGRlc2lyZWRJbmRleCkge1xuXHRcdFx0XHRyZXR1cm4gbWlkICsgMTtcblx0XHRcdH0gZWxzZSBpZiAoZW5kT2Zmc2V0IDwgZGVzaXJlZEluZGV4KSB7XG5cdFx0XHRcdGxvdyA9IG1pZCArIDE7XG5cdFx0XHR9IGVsc2UgaWYgKGVuZE9mZnNldCA+IGRlc2lyZWRJbmRleCkge1xuXHRcdFx0XHRoaWdoID0gbWlkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBsb3c7XG5cdH1cblxuXHRfbGluZVRva2Vuc0JyYW5kOiB2b2lkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuczogVWludDMyQXJyYXk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2Vuc0NvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHQ6IHN0cmluZztcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZENvZGVjOiBJTGFuZ3VhZ2VJZENvZGVjO1xuXG5cdHB1YmxpYyBzdGF0aWMgZGVmYXVsdFRva2VuTWV0YWRhdGEgPSAoXG5cdFx0KEZvbnRTdHlsZS5Ob25lIDw8IE1ldGFkYXRhQ29uc3RzLkZPTlRfU1RZTEVfT0ZGU0VUKVxuXHRcdHwgKENvbG9ySWQuRGVmYXVsdEZvcmVncm91bmQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0fCAoQ29sb3JJZC5EZWZhdWx0QmFja2dyb3VuZCA8PCBNZXRhZGF0YUNvbnN0cy5CQUNLR1JPVU5EX09GRlNFVClcblx0KSA+Pj4gMDtcblxuXHRjb25zdHJ1Y3Rvcih0b2tlbnM6IFVpbnQzMkFycmF5LCB0ZXh0OiBzdHJpbmcsIGRlY29kZXI6IElMYW5ndWFnZUlkQ29kZWMpIHtcblx0XHRjb25zdCB0b2tlbnNMZW5ndGggPSB0b2tlbnMubGVuZ3RoID4gMSA/IHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMl0gOiAwO1xuXHRcdGlmICh0b2tlbnNMZW5ndGggIT09IHRleHQubGVuZ3RoKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgRXJyb3IoJ1Rva2VuIGxlbmd0aCBhbmQgdGV4dCBsZW5ndGggZG8gbm90IG1hdGNoIScpKTtcblx0XHR9XG5cdFx0dGhpcy5fdG9rZW5zID0gdG9rZW5zO1xuXHRcdHRoaXMuX3Rva2Vuc0NvdW50ID0gKHRoaXMuX3Rva2Vucy5sZW5ndGggPj4+IDEpO1xuXHRcdHRoaXMuX3RleHQgPSB0ZXh0O1xuXHRcdHRoaXMubGFuZ3VhZ2VJZENvZGVjID0gZGVjb2Rlcjtcblx0fVxuXG5cdHB1YmxpYyBnZXRUZXh0TGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3RleHQubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogSVZpZXdMaW5lVG9rZW5zKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyIGluc3RhbmNlb2YgTGluZVRva2Vucykge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2xpY2VkRXF1YWxzKG90aGVyLCAwLCB0aGlzLl90b2tlbnNDb3VudCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzbGljZWRFcXVhbHMob3RoZXI6IExpbmVUb2tlbnMsIHNsaWNlRnJvbVRva2VuSW5kZXg6IG51bWJlciwgc2xpY2VUb2tlbkNvdW50OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fdGV4dCAhPT0gb3RoZXIuX3RleHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Rva2Vuc0NvdW50ICE9PSBvdGhlci5fdG9rZW5zQ291bnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZnJvbSA9IChzbGljZUZyb21Ub2tlbkluZGV4IDw8IDEpO1xuXHRcdGNvbnN0IHRvID0gZnJvbSArIChzbGljZVRva2VuQ291bnQgPDwgMSk7XG5cdFx0Zm9yIChsZXQgaSA9IGZyb207IGkgPCB0bzsgaSsrKSB7XG5cdFx0XHRpZiAodGhpcy5fdG9rZW5zW2ldICE9PSBvdGhlci5fdG9rZW5zW2ldKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdGV4dDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNDb3VudDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGFydE9mZnNldCh0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICh0b2tlbkluZGV4ID4gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Rva2Vuc1sodG9rZW5JbmRleCAtIDEpIDw8IDFdO1xuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBnZXRNZXRhZGF0YSh0b2tlbkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fdG9rZW5zWyh0b2tlbkluZGV4IDw8IDEpICsgMV07XG5cdFx0cmV0dXJuIG1ldGFkYXRhO1xuXHR9XG5cblx0cHVibGljIGdldExhbmd1YWdlSWQodG9rZW5JbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX3Rva2Vuc1sodG9rZW5JbmRleCA8PCAxKSArIDFdO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBUb2tlbk1ldGFkYXRhLmdldExhbmd1YWdlSWQobWV0YWRhdGEpO1xuXHRcdHJldHVybiB0aGlzLmxhbmd1YWdlSWRDb2RlYy5kZWNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXHR9XG5cblx0cHVibGljIGdldFN0YW5kYXJkVG9rZW5UeXBlKHRva2VuSW5kZXg6IG51bWJlcik6IFN0YW5kYXJkVG9rZW5UeXBlIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX3Rva2Vuc1sodG9rZW5JbmRleCA8PCAxKSArIDFdO1xuXHRcdHJldHVybiBUb2tlbk1ldGFkYXRhLmdldFRva2VuVHlwZShtZXRhZGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rm9yZWdyb3VuZCh0b2tlbkluZGV4OiBudW1iZXIpOiBDb2xvcklkIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX3Rva2Vuc1sodG9rZW5JbmRleCA8PCAxKSArIDFdO1xuXHRcdHJldHVybiBUb2tlbk1ldGFkYXRhLmdldEZvcmVncm91bmQobWV0YWRhdGEpO1xuXHR9XG5cblx0cHVibGljIGdldENsYXNzTmFtZSh0b2tlbkluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fdG9rZW5zWyh0b2tlbkluZGV4IDw8IDEpICsgMV07XG5cdFx0cmV0dXJuIFRva2VuTWV0YWRhdGEuZ2V0Q2xhc3NOYW1lRnJvbU1ldGFkYXRhKG1ldGFkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbmxpbmVTdHlsZSh0b2tlbkluZGV4OiBudW1iZXIsIGNvbG9yTWFwOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl90b2tlbnNbKHRva2VuSW5kZXggPDwgMSkgKyAxXTtcblx0XHRyZXR1cm4gVG9rZW5NZXRhZGF0YS5nZXRJbmxpbmVTdHlsZUZyb21NZXRhZGF0YShtZXRhZGF0YSwgY29sb3JNYXApO1xuXHR9XG5cblx0cHVibGljIGdldFByZXNlbnRhdGlvbih0b2tlbkluZGV4OiBudW1iZXIpOiBJVG9rZW5QcmVzZW50YXRpb24ge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fdG9rZW5zWyh0b2tlbkluZGV4IDw8IDEpICsgMV07XG5cdFx0cmV0dXJuIFRva2VuTWV0YWRhdGEuZ2V0UHJlc2VudGF0aW9uRnJvbU1ldGFkYXRhKG1ldGFkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmRPZmZzZXQodG9rZW5JbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zW3Rva2VuSW5kZXggPDwgMV07XG5cdH1cblxuXHQvKipcblx0ICogRmluZCB0aGUgdG9rZW4gY29udGFpbmluZyBvZmZzZXQgYG9mZnNldGAuXG5cdCAqIEBwYXJhbSBvZmZzZXQgVGhlIHNlYXJjaCBvZmZzZXRcblx0ICogQHJldHVybiBUaGUgaW5kZXggb2YgdGhlIHRva2VuIGNvbnRhaW5pbmcgdGhlIG9mZnNldC5cblx0ICovXG5cdHB1YmxpYyBmaW5kVG9rZW5JbmRleEF0T2Zmc2V0KG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTGluZVRva2Vucy5maW5kSW5kZXhJblRva2Vuc0FycmF5KHRoaXMuX3Rva2Vucywgb2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBpbmZsYXRlKCk6IElWaWV3TGluZVRva2VucyB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgc2xpY2VBbmRJbmZsYXRlKHN0YXJ0T2Zmc2V0OiBudW1iZXIsIGVuZE9mZnNldDogbnVtYmVyLCBkZWx0YU9mZnNldDogbnVtYmVyKTogSVZpZXdMaW5lVG9rZW5zIHtcblx0XHRyZXR1cm4gbmV3IFNsaWNlTGluZVRva2Vucyh0aGlzLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0LCBkZWx0YU9mZnNldCk7XG5cdH1cblxuXHRwdWJsaWMgc2xpY2VaZXJvQ29weShyYW5nZTogT2Zmc2V0UmFuZ2UpOiBJVmlld0xpbmVUb2tlbnMge1xuXHRcdHJldHVybiB0aGlzLnNsaWNlQW5kSW5mbGF0ZShyYW5nZS5zdGFydCwgcmFuZ2UuZW5kRXhjbHVzaXZlLCAwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcHVyZVxuXHQgKiBAcGFyYW0gaW5zZXJ0VG9rZW5zIE11c3QgYmUgc29ydGVkIGJ5IG9mZnNldC5cblx0Ki9cblx0cHVibGljIHdpdGhJbnNlcnRlZChpbnNlcnRUb2tlbnM6IHsgb2Zmc2V0OiBudW1iZXI7IHRleHQ6IHN0cmluZzsgdG9rZW5NZXRhZGF0YTogbnVtYmVyIH1bXSk6IExpbmVUb2tlbnMge1xuXHRcdGlmIChpbnNlcnRUb2tlbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRsZXQgbmV4dE9yaWdpbmFsVG9rZW5JZHggPSAwO1xuXHRcdGxldCBuZXh0SW5zZXJ0VG9rZW5JZHggPSAwO1xuXHRcdGxldCB0ZXh0ID0gJyc7XG5cdFx0Y29uc3QgbmV3VG9rZW5zID0gbmV3IEFycmF5PG51bWJlcj4oKTtcblxuXHRcdGxldCBvcmlnaW5hbEVuZE9mZnNldCA9IDA7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IG5leHRPcmlnaW5hbFRva2VuRW5kT2Zmc2V0ID0gbmV4dE9yaWdpbmFsVG9rZW5JZHggPCB0aGlzLl90b2tlbnNDb3VudCA/IHRoaXMuX3Rva2Vuc1tuZXh0T3JpZ2luYWxUb2tlbklkeCA8PCAxXSA6IC0xO1xuXHRcdFx0Y29uc3QgbmV4dEluc2VydFRva2VuID0gbmV4dEluc2VydFRva2VuSWR4IDwgaW5zZXJ0VG9rZW5zLmxlbmd0aCA/IGluc2VydFRva2Vuc1tuZXh0SW5zZXJ0VG9rZW5JZHhdIDogbnVsbDtcblxuXHRcdFx0aWYgKG5leHRPcmlnaW5hbFRva2VuRW5kT2Zmc2V0ICE9PSAtMSAmJiAobmV4dEluc2VydFRva2VuID09PSBudWxsIHx8IG5leHRPcmlnaW5hbFRva2VuRW5kT2Zmc2V0IDw9IG5leHRJbnNlcnRUb2tlbi5vZmZzZXQpKSB7XG5cdFx0XHRcdC8vIG9yaWdpbmFsIHRva2VuIGVuZHMgYmVmb3JlIG5leHQgaW5zZXJ0IHRva2VuXG5cdFx0XHRcdHRleHQgKz0gdGhpcy5fdGV4dC5zdWJzdHJpbmcob3JpZ2luYWxFbmRPZmZzZXQsIG5leHRPcmlnaW5hbFRva2VuRW5kT2Zmc2V0KTtcblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl90b2tlbnNbKG5leHRPcmlnaW5hbFRva2VuSWR4IDw8IDEpICsgMV07XG5cdFx0XHRcdG5ld1Rva2Vucy5wdXNoKHRleHQubGVuZ3RoLCBtZXRhZGF0YSk7XG5cdFx0XHRcdG5leHRPcmlnaW5hbFRva2VuSWR4Kys7XG5cdFx0XHRcdG9yaWdpbmFsRW5kT2Zmc2V0ID0gbmV4dE9yaWdpbmFsVG9rZW5FbmRPZmZzZXQ7XG5cblx0XHRcdH0gZWxzZSBpZiAobmV4dEluc2VydFRva2VuKSB7XG5cdFx0XHRcdGlmIChuZXh0SW5zZXJ0VG9rZW4ub2Zmc2V0ID4gb3JpZ2luYWxFbmRPZmZzZXQpIHtcblx0XHRcdFx0XHQvLyBpbnNlcnQgdG9rZW4gaXMgaW4gdGhlIG1pZGRsZSBvZiB0aGUgbmV4dCB0b2tlbi5cblx0XHRcdFx0XHR0ZXh0ICs9IHRoaXMuX3RleHQuc3Vic3RyaW5nKG9yaWdpbmFsRW5kT2Zmc2V0LCBuZXh0SW5zZXJ0VG9rZW4ub2Zmc2V0KTtcblx0XHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX3Rva2Vuc1sobmV4dE9yaWdpbmFsVG9rZW5JZHggPDwgMSkgKyAxXTtcblx0XHRcdFx0XHRuZXdUb2tlbnMucHVzaCh0ZXh0Lmxlbmd0aCwgbWV0YWRhdGEpO1xuXHRcdFx0XHRcdG9yaWdpbmFsRW5kT2Zmc2V0ID0gbmV4dEluc2VydFRva2VuLm9mZnNldDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRleHQgKz0gbmV4dEluc2VydFRva2VuLnRleHQ7XG5cdFx0XHRcdG5ld1Rva2Vucy5wdXNoKHRleHQubGVuZ3RoLCBuZXh0SW5zZXJ0VG9rZW4udG9rZW5NZXRhZGF0YSk7XG5cdFx0XHRcdG5leHRJbnNlcnRUb2tlbklkeCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBMaW5lVG9rZW5zKG5ldyBVaW50MzJBcnJheShuZXdUb2tlbnMpLCB0ZXh0LCB0aGlzLmxhbmd1YWdlSWRDb2RlYyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VG9rZW5zSW5SYW5nZShyYW5nZTogT2Zmc2V0UmFuZ2UpOiBUb2tlbkFycmF5IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IFRva2VuQXJyYXlCdWlsZGVyKCk7XG5cblx0XHRjb25zdCBzdGFydFRva2VuSW5kZXggPSB0aGlzLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQocmFuZ2Uuc3RhcnQpO1xuXHRcdGNvbnN0IGVuZFRva2VuSW5kZXggPSB0aGlzLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQocmFuZ2UuZW5kRXhjbHVzaXZlKTtcblxuXHRcdGZvciAobGV0IHRva2VuSW5kZXggPSBzdGFydFRva2VuSW5kZXg7IHRva2VuSW5kZXggPD0gZW5kVG9rZW5JbmRleDsgdG9rZW5JbmRleCsrKSB7XG5cdFx0XHRjb25zdCB0b2tlblJhbmdlID0gbmV3IE9mZnNldFJhbmdlKHRoaXMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCksIHRoaXMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpKTtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IHRva2VuUmFuZ2UuaW50ZXJzZWN0aW9uTGVuZ3RoKHJhbmdlKTtcblx0XHRcdGlmIChsZW5ndGggPiAwKSB7XG5cdFx0XHRcdGJ1aWxkZXIuYWRkKGxlbmd0aCwgdGhpcy5nZXRNZXRhZGF0YSh0b2tlbkluZGV4KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJ1aWxkZXIuYnVpbGQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlblRleHQodG9rZW5JbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0Y29uc3QgZW5kT2Zmc2V0ID0gdGhpcy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0Y29uc3QgdGV4dCA9IHRoaXMuX3RleHQuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQpO1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0cHVibGljIGZvckVhY2goY2FsbGJhY2s6ICh0b2tlbkluZGV4OiBudW1iZXIpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCB0b2tlbkNvdW50ID0gdGhpcy5nZXRDb3VudCgpO1xuXHRcdGZvciAobGV0IHRva2VuSW5kZXggPSAwOyB0b2tlbkluZGV4IDwgdG9rZW5Db3VudDsgdG9rZW5JbmRleCsrKSB7XG5cdFx0XHRjYWxsYmFjayh0b2tlbkluZGV4KTtcblx0XHR9XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGxldCByZXN1bHQgPSAnJztcblx0XHR0aGlzLmZvckVhY2goKGkpID0+IHtcblx0XHRcdHJlc3VsdCArPSBgWyR7dGhpcy5nZXRUb2tlblRleHQoaSl9XXske3RoaXMuZ2V0Q2xhc3NOYW1lKGkpfX1gO1xuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgU2xpY2VMaW5lVG9rZW5zIGltcGxlbWVudHMgSVZpZXdMaW5lVG9rZW5zIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zb3VyY2U6IExpbmVUb2tlbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuZE9mZnNldDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWx0YU9mZnNldDogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpcnN0VG9rZW5JbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbnNDb3VudDogbnVtYmVyO1xuXG5cdHB1YmxpYyByZWFkb25seSBsYW5ndWFnZUlkQ29kZWM6IElMYW5ndWFnZUlkQ29kZWM7XG5cblx0Y29uc3RydWN0b3Ioc291cmNlOiBMaW5lVG9rZW5zLCBzdGFydE9mZnNldDogbnVtYmVyLCBlbmRPZmZzZXQ6IG51bWJlciwgZGVsdGFPZmZzZXQ6IG51bWJlcikge1xuXHRcdHRoaXMuX3NvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLl9zdGFydE9mZnNldCA9IHN0YXJ0T2Zmc2V0O1xuXHRcdHRoaXMuX2VuZE9mZnNldCA9IGVuZE9mZnNldDtcblx0XHR0aGlzLl9kZWx0YU9mZnNldCA9IGRlbHRhT2Zmc2V0O1xuXHRcdHRoaXMuX2ZpcnN0VG9rZW5JbmRleCA9IHNvdXJjZS5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHN0YXJ0T2Zmc2V0KTtcblx0XHR0aGlzLmxhbmd1YWdlSWRDb2RlYyA9IHNvdXJjZS5sYW5ndWFnZUlkQ29kZWM7XG5cblx0XHR0aGlzLl90b2tlbnNDb3VudCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2ZpcnN0VG9rZW5JbmRleCwgbGVuID0gc291cmNlLmdldENvdW50KCk7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW5TdGFydE9mZnNldCA9IHNvdXJjZS5nZXRTdGFydE9mZnNldChpKTtcblx0XHRcdGlmICh0b2tlblN0YXJ0T2Zmc2V0ID49IGVuZE9mZnNldCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rva2Vuc0NvdW50Kys7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldE1ldGFkYXRhKHRva2VuSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5nZXRNZXRhZGF0YSh0aGlzLl9maXJzdFRva2VuSW5kZXggKyB0b2tlbkluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMYW5ndWFnZUlkKHRva2VuSW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5nZXRMYW5ndWFnZUlkKHRoaXMuX2ZpcnN0VG9rZW5JbmRleCArIHRva2VuSW5kZXgpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5nZXRMaW5lQ29udGVudCgpLnN1YnN0cmluZyh0aGlzLl9zdGFydE9mZnNldCwgdGhpcy5fZW5kT2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IElWaWV3TGluZVRva2Vucyk6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlciBpbnN0YW5jZW9mIFNsaWNlTGluZVRva2Vucykge1xuXHRcdFx0cmV0dXJuIChcblx0XHRcdFx0dGhpcy5fc3RhcnRPZmZzZXQgPT09IG90aGVyLl9zdGFydE9mZnNldFxuXHRcdFx0XHQmJiB0aGlzLl9lbmRPZmZzZXQgPT09IG90aGVyLl9lbmRPZmZzZXRcblx0XHRcdFx0JiYgdGhpcy5fZGVsdGFPZmZzZXQgPT09IG90aGVyLl9kZWx0YU9mZnNldFxuXHRcdFx0XHQmJiB0aGlzLl9zb3VyY2Uuc2xpY2VkRXF1YWxzKG90aGVyLl9zb3VyY2UsIHRoaXMuX2ZpcnN0VG9rZW5JbmRleCwgdGhpcy5fdG9rZW5zQ291bnQpXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5zQ291bnQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleDogbnVtYmVyKTogU3RhbmRhcmRUb2tlblR5cGUge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UuZ2V0U3RhbmRhcmRUb2tlblR5cGUodGhpcy5fZmlyc3RUb2tlbkluZGV4ICsgdG9rZW5JbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rm9yZWdyb3VuZCh0b2tlbkluZGV4OiBudW1iZXIpOiBDb2xvcklkIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmdldEZvcmVncm91bmQodGhpcy5fZmlyc3RUb2tlbkluZGV4ICsgdG9rZW5JbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgdG9rZW5FbmRPZmZzZXQgPSB0aGlzLl9zb3VyY2UuZ2V0RW5kT2Zmc2V0KHRoaXMuX2ZpcnN0VG9rZW5JbmRleCArIHRva2VuSW5kZXgpO1xuXHRcdHJldHVybiBNYXRoLm1pbih0aGlzLl9lbmRPZmZzZXQsIHRva2VuRW5kT2Zmc2V0KSAtIHRoaXMuX3N0YXJ0T2Zmc2V0ICsgdGhpcy5fZGVsdGFPZmZzZXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2xhc3NOYW1lKHRva2VuSW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5nZXRDbGFzc05hbWUodGhpcy5fZmlyc3RUb2tlbkluZGV4ICsgdG9rZW5JbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SW5saW5lU3R5bGUodG9rZW5JbmRleDogbnVtYmVyLCBjb2xvck1hcDogc3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UuZ2V0SW5saW5lU3R5bGUodGhpcy5fZmlyc3RUb2tlbkluZGV4ICsgdG9rZW5JbmRleCwgY29sb3JNYXApO1xuXHR9XG5cblx0cHVibGljIGdldFByZXNlbnRhdGlvbih0b2tlbkluZGV4OiBudW1iZXIpOiBJVG9rZW5QcmVzZW50YXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UuZ2V0UHJlc2VudGF0aW9uKHRoaXMuX2ZpcnN0VG9rZW5JbmRleCArIHRva2VuSW5kZXgpO1xuXHR9XG5cblx0cHVibGljIGZpbmRUb2tlbkluZGV4QXRPZmZzZXQob2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UuZmluZFRva2VuSW5kZXhBdE9mZnNldChvZmZzZXQgKyB0aGlzLl9zdGFydE9mZnNldCAtIHRoaXMuX2RlbHRhT2Zmc2V0KSAtIHRoaXMuX2ZpcnN0VG9rZW5JbmRleDtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlblRleHQodG9rZW5JbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBhZGp1c3RlZFRva2VuSW5kZXggPSB0aGlzLl9maXJzdFRva2VuSW5kZXggKyB0b2tlbkluZGV4O1xuXHRcdGNvbnN0IHRva2VuU3RhcnRPZmZzZXQgPSB0aGlzLl9zb3VyY2UuZ2V0U3RhcnRPZmZzZXQoYWRqdXN0ZWRUb2tlbkluZGV4KTtcblx0XHRjb25zdCB0b2tlbkVuZE9mZnNldCA9IHRoaXMuX3NvdXJjZS5nZXRFbmRPZmZzZXQoYWRqdXN0ZWRUb2tlbkluZGV4KTtcblx0XHRsZXQgdGV4dCA9IHRoaXMuX3NvdXJjZS5nZXRUb2tlblRleHQoYWRqdXN0ZWRUb2tlbkluZGV4KTtcblx0XHRpZiAodG9rZW5TdGFydE9mZnNldCA8IHRoaXMuX3N0YXJ0T2Zmc2V0KSB7XG5cdFx0XHR0ZXh0ID0gdGV4dC5zdWJzdHJpbmcodGhpcy5fc3RhcnRPZmZzZXQgLSB0b2tlblN0YXJ0T2Zmc2V0KTtcblx0XHR9XG5cdFx0aWYgKHRva2VuRW5kT2Zmc2V0ID4gdGhpcy5fZW5kT2Zmc2V0KSB7XG5cdFx0XHR0ZXh0ID0gdGV4dC5zdWJzdHJpbmcoMCwgdGV4dC5sZW5ndGggLSAodG9rZW5FbmRPZmZzZXQgLSB0aGlzLl9lbmRPZmZzZXQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHRwdWJsaWMgZm9yRWFjaChjYWxsYmFjazogKHRva2VuSW5kZXg6IG51bWJlcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGZvciAobGV0IHRva2VuSW5kZXggPSAwOyB0b2tlbkluZGV4IDwgdGhpcy5nZXRDb3VudCgpOyB0b2tlbkluZGV4KyspIHtcblx0XHRcdGNhbGxiYWNrKHRva2VuSW5kZXgpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RhbmRhcmRUb2tlblR5cGVBdFBvc2l0aW9uKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogSVBvc2l0aW9uKTogU3RhbmRhcmRUb2tlblR5cGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0aWYgKCFtb2RlbC50b2tlbml6YXRpb24uaXNDaGVhcFRvVG9rZW5pemUobGluZU51bWJlcikpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0Y29uc3QgbGluZVRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRjb25zdCB0b2tlbkluZGV4ID0gbGluZVRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRjb25zdCB0b2tlblR5cGUgPSBsaW5lVG9rZW5zLmdldFN0YW5kYXJkVG9rZW5UeXBlKHRva2VuSW5kZXgpO1xuXHRyZXR1cm4gdG9rZW5UeXBlO1xufVxuXG5cblxuLyoqXG4gKiBUaGlzIGNsYXNzIHJlcHJlc2VudHMgYSBzZXF1ZW5jZSBvZiB0b2tlbnMuXG4gKiBDb25jZXB0dWFsbHksIGVhY2ggdG9rZW4gaGFzIGEgbGVuZ3RoIGFuZCBhIG1ldGFkYXRhIG51bWJlci5cbiAqIEEgdG9rZW4gYXJyYXkgbWlnaHQgYmUgdXNlZCB0byBhbm5vdGF0ZSBhIHN0cmluZyB3aXRoIG1ldGFkYXRhLlxuICogVXNlIHtAbGluayBUb2tlbkFycmF5QnVpbGRlcn0gdG8gZWZmaWNpZW50bHkgY3JlYXRlIGEgdG9rZW4gYXJyYXkuXG4gKlxuICogVE9ETzogTWFrZSB0aGlzIGNsYXNzIG1vcmUgZWZmaWNpZW50IChlLmcuIGJ5IHVzaW5nIGEgSW50MzJBcnJheSkuXG4qL1xuZXhwb3J0IGNsYXNzIFRva2VuQXJyYXkge1xuXHRwdWJsaWMgc3RhdGljIGZyb21MaW5lVG9rZW5zKGxpbmVUb2tlbnM6IExpbmVUb2tlbnMpOiBUb2tlbkFycmF5IHtcblx0XHRjb25zdCB0b2tlbkluZm86IFRva2VuSW5mb1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lVG9rZW5zLmdldENvdW50KCk7IGkrKykge1xuXHRcdFx0dG9rZW5JbmZvLnB1c2gobmV3IFRva2VuSW5mbyhsaW5lVG9rZW5zLmdldEVuZE9mZnNldChpKSAtIGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQoaSksIGxpbmVUb2tlbnMuZ2V0TWV0YWRhdGEoaSkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIFRva2VuQXJyYXkuY3JlYXRlKHRva2VuSW5mbyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZSh0b2tlbkluZm86IFRva2VuSW5mb1tdKTogVG9rZW5BcnJheSB7XG5cdFx0cmV0dXJuIG5ldyBUb2tlbkFycmF5KHRva2VuSW5mbyk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuSW5mbzogVG9rZW5JbmZvW11cblx0KSB7IH1cblxuXHRwdWJsaWMgdG9MaW5lVG9rZW5zKGxpbmVDb250ZW50OiBzdHJpbmcsIGRlY29kZXI6IElMYW5ndWFnZUlkQ29kZWMpOiBMaW5lVG9rZW5zIHtcblx0XHRyZXR1cm4gTGluZVRva2Vucy5jcmVhdGVGcm9tVGV4dEFuZE1ldGFkYXRhKHRoaXMubWFwKChyLCB0KSA9PiAoeyB0ZXh0OiByLnN1YnN0cmluZyhsaW5lQ29udGVudCksIG1ldGFkYXRhOiB0Lm1ldGFkYXRhIH0pKSwgZGVjb2Rlcik7XG5cdH1cblxuXHRwdWJsaWMgZm9yRWFjaChjYjogKHJhbmdlOiBPZmZzZXRSYW5nZSwgdG9rZW5JbmZvOiBUb2tlbkluZm8pID0+IHZvaWQpOiB2b2lkIHtcblx0XHRsZXQgbGVuZ3RoU3VtID0gMDtcblx0XHRmb3IgKGNvbnN0IHRva2VuSW5mbyBvZiB0aGlzLl90b2tlbkluZm8pIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IE9mZnNldFJhbmdlKGxlbmd0aFN1bSwgbGVuZ3RoU3VtICsgdG9rZW5JbmZvLmxlbmd0aCk7XG5cdFx0XHRjYihyYW5nZSwgdG9rZW5JbmZvKTtcblx0XHRcdGxlbmd0aFN1bSArPSB0b2tlbkluZm8ubGVuZ3RoO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBtYXA8VD4oY2I6IChyYW5nZTogT2Zmc2V0UmFuZ2UsIHRva2VuSW5mbzogVG9rZW5JbmZvKSA9PiBUKTogVFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFRbXSA9IFtdO1xuXHRcdGxldCBsZW5ndGhTdW0gPSAwO1xuXHRcdGZvciAoY29uc3QgdG9rZW5JbmZvIG9mIHRoaXMuX3Rva2VuSW5mbykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgT2Zmc2V0UmFuZ2UobGVuZ3RoU3VtLCBsZW5ndGhTdW0gKyB0b2tlbkluZm8ubGVuZ3RoKTtcblx0XHRcdHJlc3VsdC5wdXNoKGNiKHJhbmdlLCB0b2tlbkluZm8pKTtcblx0XHRcdGxlbmd0aFN1bSArPSB0b2tlbkluZm8ubGVuZ3RoO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHNsaWNlKHJhbmdlOiBPZmZzZXRSYW5nZSk6IFRva2VuQXJyYXkge1xuXHRcdGNvbnN0IHJlc3VsdDogVG9rZW5JbmZvW10gPSBbXTtcblx0XHRsZXQgbGVuZ3RoU3VtID0gMDtcblx0XHRmb3IgKGNvbnN0IHRva2VuSW5mbyBvZiB0aGlzLl90b2tlbkluZm8pIHtcblx0XHRcdGNvbnN0IHRva2VuU3RhcnQgPSBsZW5ndGhTdW07XG5cdFx0XHRjb25zdCB0b2tlbkVuZEV4ID0gdG9rZW5TdGFydCArIHRva2VuSW5mby5sZW5ndGg7XG5cdFx0XHRpZiAodG9rZW5FbmRFeCA+IHJhbmdlLnN0YXJ0KSB7XG5cdFx0XHRcdGlmICh0b2tlblN0YXJ0ID49IHJhbmdlLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGVsdGFCZWZvcmUgPSBNYXRoLm1heCgwLCByYW5nZS5zdGFydCAtIHRva2VuU3RhcnQpO1xuXHRcdFx0XHRjb25zdCBkZWx0YUFmdGVyID0gTWF0aC5tYXgoMCwgdG9rZW5FbmRFeCAtIHJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cblx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IFRva2VuSW5mbyh0b2tlbkluZm8ubGVuZ3RoIC0gZGVsdGFCZWZvcmUgLSBkZWx0YUFmdGVyLCB0b2tlbkluZm8ubWV0YWRhdGEpKTtcblx0XHRcdH1cblxuXHRcdFx0bGVuZ3RoU3VtICs9IHRva2VuSW5mby5sZW5ndGg7XG5cdFx0fVxuXHRcdHJldHVybiBUb2tlbkFycmF5LmNyZWF0ZShyZXN1bHQpO1xuXHR9XG5cblx0cHVibGljIGFwcGVuZChvdGhlcjogVG9rZW5BcnJheSk6IFRva2VuQXJyYXkge1xuXHRcdGNvbnN0IHJlc3VsdDogVG9rZW5JbmZvW10gPSB0aGlzLl90b2tlbkluZm8uY29uY2F0KG90aGVyLl90b2tlbkluZm8pO1xuXHRcdHJldHVybiBUb2tlbkFycmF5LmNyZWF0ZShyZXN1bHQpO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIElUb2tlbk1ldGFkYXRhID0gbnVtYmVyO1xuXG5leHBvcnQgY2xhc3MgVG9rZW5JbmZvIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBtZXRhZGF0YTogSVRva2VuTWV0YWRhdGFcblx0KSB7IH1cbn1cbi8qKlxuICogVE9ETzogTWFrZSB0aGlzIGNsYXNzIG1vcmUgZWZmaWNpZW50IChlLmcuIGJ5IHVzaW5nIGEgSW50MzJBcnJheSkuXG4qL1xuXG5leHBvcnQgY2xhc3MgVG9rZW5BcnJheUJ1aWxkZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbnM6IFRva2VuSW5mb1tdID0gW107XG5cblx0cHVibGljIGFkZChsZW5ndGg6IG51bWJlciwgbWV0YWRhdGE6IElUb2tlbk1ldGFkYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9rZW5zLnB1c2gobmV3IFRva2VuSW5mbyhsZW5ndGgsIG1ldGFkYXRhKSk7XG5cdH1cblxuXHRwdWJsaWMgYnVpbGQoKTogVG9rZW5BcnJheSB7XG5cdFx0cmV0dXJuIFRva2VuQXJyYXkuY3JlYXRlKHRoaXMuX3Rva2Vucyk7XG5cdH1cbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxXQUFXLFNBQTRCLGdCQUFvQyxxQkFBcUI7QUFHekcsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFxQjNCLE1BQU0sY0FBTixNQUFNLFlBQXNDO0FBQUEsRUF1RWxELFlBQVksUUFBcUIsTUFBYyxTQUEyQjtBQWQxRSw0QkFBeUI7QUFleEIsVUFBTSxlQUFlLE9BQU8sU0FBUyxJQUFJLE9BQU8sT0FBTyxTQUFTLENBQUMsSUFBSTtBQUNyRSxRQUFJLGlCQUFpQixLQUFLLFFBQVE7QUFDakMsd0JBQWtCLElBQUksTUFBTSw0Q0FBNEMsQ0FBQztBQUFBLElBQzFFO0FBQ0EsU0FBSyxVQUFVO0FBQ2YsU0FBSyxlQUFnQixLQUFLLFFBQVEsV0FBVztBQUM3QyxTQUFLLFFBQVE7QUFDYixTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUEvRUEsT0FBYyxZQUFZLGFBQXFCLFNBQXVDO0FBQ3JGLFVBQU0sa0JBQWtCLFlBQVc7QUFFbkMsVUFBTSxTQUFTLElBQUksWUFBWSxDQUFDO0FBQ2hDLFdBQU8sQ0FBQyxJQUFJLFlBQVk7QUFDeEIsV0FBTyxDQUFDLElBQUk7QUFFWixXQUFPLElBQUksWUFBVyxRQUFRLGFBQWEsT0FBTztBQUFBLEVBQ25EO0FBQUEsRUFFQSxPQUFjLDBCQUEwQixNQUE0QyxTQUF1QztBQUMxSCxRQUFJLFNBQWlCO0FBQ3JCLFFBQUksV0FBbUI7QUFDdkIsVUFBTSxTQUFTLElBQUksTUFBYztBQUNqQyxlQUFXLEVBQUUsTUFBTSxTQUFTLEtBQUssTUFBTTtBQUN0QyxhQUFPLEtBQUssU0FBUyxLQUFLLFFBQVEsUUFBUTtBQUMxQyxnQkFBVSxLQUFLO0FBQ2Ysa0JBQVk7QUFBQSxJQUNiO0FBQ0EsV0FBTyxJQUFJLFlBQVcsSUFBSSxZQUFZLE1BQU0sR0FBRyxVQUFVLE9BQU87QUFBQSxFQUNqRTtBQUFBLEVBRUEsT0FBYyxtQkFBbUIsUUFBcUIsZ0JBQThCO0FBQ25GLFVBQU0sYUFBYyxPQUFPLFdBQVc7QUFDdEMsVUFBTSxpQkFBaUIsYUFBYTtBQUNwQyxhQUFTLGFBQWEsR0FBRyxhQUFhLGdCQUFnQixjQUFjO0FBQ25FLGFBQU8sY0FBYyxDQUFDLElBQUksT0FBUSxhQUFhLEtBQU0sQ0FBQztBQUFBLElBQ3ZEO0FBQ0EsV0FBTyxrQkFBa0IsQ0FBQyxJQUFJO0FBQUEsRUFDL0I7QUFBQSxFQUVBLE9BQWMsdUJBQXVCLFFBQXFCLGNBQThCO0FBQ3ZGLFFBQUksT0FBTyxVQUFVLEdBQUc7QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLE1BQU07QUFDVixRQUFJLFFBQVEsT0FBTyxXQUFXLEtBQUs7QUFFbkMsV0FBTyxNQUFNLE1BQU07QUFFbEIsWUFBTSxNQUFNLE1BQU0sS0FBSyxPQUFPLE9BQU8sT0FBTyxDQUFDO0FBQzdDLFlBQU0sWUFBWSxPQUFRLE9BQU8sQ0FBRTtBQUVuQyxVQUFJLGNBQWMsY0FBYztBQUMvQixlQUFPLE1BQU07QUFBQSxNQUNkLFdBQVcsWUFBWSxjQUFjO0FBQ3BDLGNBQU0sTUFBTTtBQUFBLE1BQ2IsV0FBVyxZQUFZLGNBQWM7QUFDcEMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQTJCTyxnQkFBd0I7QUFDOUIsV0FBTyxLQUFLLE1BQU07QUFBQSxFQUNuQjtBQUFBLEVBRU8sT0FBTyxPQUFpQztBQUM5QyxRQUFJLGlCQUFpQixhQUFZO0FBQ2hDLGFBQU8sS0FBSyxhQUFhLE9BQU8sR0FBRyxLQUFLLFlBQVk7QUFBQSxJQUNyRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxhQUFhLE9BQW1CLHFCQUE2QixpQkFBa0M7QUFDckcsUUFBSSxLQUFLLFVBQVUsTUFBTSxPQUFPO0FBQy9CLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLGlCQUFpQixNQUFNLGNBQWM7QUFDN0MsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLE9BQVEsdUJBQXVCO0FBQ3JDLFVBQU0sS0FBSyxRQUFRLG1CQUFtQjtBQUN0QyxhQUFTLElBQUksTUFBTSxJQUFJLElBQUksS0FBSztBQUMvQixVQUFJLEtBQUssUUFBUSxDQUFDLE1BQU0sTUFBTSxRQUFRLENBQUMsR0FBRztBQUN6QyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8saUJBQXlCO0FBQy9CLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLFdBQW1CO0FBQ3pCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLGVBQWUsWUFBNEI7QUFDakQsUUFBSSxhQUFhLEdBQUc7QUFDbkIsYUFBTyxLQUFLLFFBQVMsYUFBYSxLQUFNLENBQUM7QUFBQSxJQUMxQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxZQUFZLFlBQTRCO0FBQzlDLFVBQU0sV0FBVyxLQUFLLFNBQVMsY0FBYyxLQUFLLENBQUM7QUFDbkQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLGNBQWMsWUFBNEI7QUFDaEQsVUFBTSxXQUFXLEtBQUssU0FBUyxjQUFjLEtBQUssQ0FBQztBQUNuRCxVQUFNLGFBQWEsY0FBYyxjQUFjLFFBQVE7QUFDdkQsV0FBTyxLQUFLLGdCQUFnQixpQkFBaUIsVUFBVTtBQUFBLEVBQ3hEO0FBQUEsRUFFTyxxQkFBcUIsWUFBdUM7QUFDbEUsVUFBTSxXQUFXLEtBQUssU0FBUyxjQUFjLEtBQUssQ0FBQztBQUNuRCxXQUFPLGNBQWMsYUFBYSxRQUFRO0FBQUEsRUFDM0M7QUFBQSxFQUVPLGNBQWMsWUFBNkI7QUFDakQsVUFBTSxXQUFXLEtBQUssU0FBUyxjQUFjLEtBQUssQ0FBQztBQUNuRCxXQUFPLGNBQWMsY0FBYyxRQUFRO0FBQUEsRUFDNUM7QUFBQSxFQUVPLGFBQWEsWUFBNEI7QUFDL0MsVUFBTSxXQUFXLEtBQUssU0FBUyxjQUFjLEtBQUssQ0FBQztBQUNuRCxXQUFPLGNBQWMseUJBQXlCLFFBQVE7QUFBQSxFQUN2RDtBQUFBLEVBRU8sZUFBZSxZQUFvQixVQUE0QjtBQUNyRSxVQUFNLFdBQVcsS0FBSyxTQUFTLGNBQWMsS0FBSyxDQUFDO0FBQ25ELFdBQU8sY0FBYywyQkFBMkIsVUFBVSxRQUFRO0FBQUEsRUFDbkU7QUFBQSxFQUVPLGdCQUFnQixZQUF3QztBQUM5RCxVQUFNLFdBQVcsS0FBSyxTQUFTLGNBQWMsS0FBSyxDQUFDO0FBQ25ELFdBQU8sY0FBYyw0QkFBNEIsUUFBUTtBQUFBLEVBQzFEO0FBQUEsRUFFTyxhQUFhLFlBQTRCO0FBQy9DLFdBQU8sS0FBSyxRQUFRLGNBQWMsQ0FBQztBQUFBLEVBQ3BDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT08sdUJBQXVCLFFBQXdCO0FBQ3JELFdBQU8sWUFBVyx1QkFBdUIsS0FBSyxTQUFTLE1BQU07QUFBQSxFQUM5RDtBQUFBLEVBRU8sVUFBMkI7QUFDakMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLGdCQUFnQixhQUFxQixXQUFtQixhQUFzQztBQUNwRyxXQUFPLElBQUksZ0JBQWdCLE1BQU0sYUFBYSxXQUFXLFdBQVc7QUFBQSxFQUNyRTtBQUFBLEVBRU8sY0FBYyxPQUFxQztBQUN6RCxXQUFPLEtBQUssZ0JBQWdCLE1BQU0sT0FBTyxNQUFNLGNBQWMsQ0FBQztBQUFBLEVBQy9EO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLGFBQWEsY0FBcUY7QUFDeEcsUUFBSSxhQUFhLFdBQVcsR0FBRztBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksdUJBQXVCO0FBQzNCLFFBQUkscUJBQXFCO0FBQ3pCLFFBQUksT0FBTztBQUNYLFVBQU0sWUFBWSxJQUFJLE1BQWM7QUFFcEMsUUFBSSxvQkFBb0I7QUFDeEIsV0FBTyxNQUFNO0FBQ1osWUFBTSw2QkFBNkIsdUJBQXVCLEtBQUssZUFBZSxLQUFLLFFBQVEsd0JBQXdCLENBQUMsSUFBSTtBQUN4SCxZQUFNLGtCQUFrQixxQkFBcUIsYUFBYSxTQUFTLGFBQWEsa0JBQWtCLElBQUk7QUFFdEcsVUFBSSwrQkFBK0IsT0FBTyxvQkFBb0IsUUFBUSw4QkFBOEIsZ0JBQWdCLFNBQVM7QUFFNUgsZ0JBQVEsS0FBSyxNQUFNLFVBQVUsbUJBQW1CLDBCQUEwQjtBQUMxRSxjQUFNLFdBQVcsS0FBSyxTQUFTLHdCQUF3QixLQUFLLENBQUM7QUFDN0Qsa0JBQVUsS0FBSyxLQUFLLFFBQVEsUUFBUTtBQUNwQztBQUNBLDRCQUFvQjtBQUFBLE1BRXJCLFdBQVcsaUJBQWlCO0FBQzNCLFlBQUksZ0JBQWdCLFNBQVMsbUJBQW1CO0FBRS9DLGtCQUFRLEtBQUssTUFBTSxVQUFVLG1CQUFtQixnQkFBZ0IsTUFBTTtBQUN0RSxnQkFBTSxXQUFXLEtBQUssU0FBUyx3QkFBd0IsS0FBSyxDQUFDO0FBQzdELG9CQUFVLEtBQUssS0FBSyxRQUFRLFFBQVE7QUFDcEMsOEJBQW9CLGdCQUFnQjtBQUFBLFFBQ3JDO0FBRUEsZ0JBQVEsZ0JBQWdCO0FBQ3hCLGtCQUFVLEtBQUssS0FBSyxRQUFRLGdCQUFnQixhQUFhO0FBQ3pEO0FBQUEsTUFDRCxPQUFPO0FBQ047QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sSUFBSSxZQUFXLElBQUksWUFBWSxTQUFTLEdBQUcsTUFBTSxLQUFLLGVBQWU7QUFBQSxFQUM3RTtBQUFBLEVBRU8saUJBQWlCLE9BQWdDO0FBQ3ZELFVBQU0sVUFBVSxJQUFJLGtCQUFrQjtBQUV0QyxVQUFNLGtCQUFrQixLQUFLLHVCQUF1QixNQUFNLEtBQUs7QUFDL0QsVUFBTSxnQkFBZ0IsS0FBSyx1QkFBdUIsTUFBTSxZQUFZO0FBRXBFLGFBQVMsYUFBYSxpQkFBaUIsY0FBYyxlQUFlLGNBQWM7QUFDakYsWUFBTSxhQUFhLElBQUksWUFBWSxLQUFLLGVBQWUsVUFBVSxHQUFHLEtBQUssYUFBYSxVQUFVLENBQUM7QUFDakcsWUFBTSxTQUFTLFdBQVcsbUJBQW1CLEtBQUs7QUFDbEQsVUFBSSxTQUFTLEdBQUc7QUFDZixnQkFBUSxJQUFJLFFBQVEsS0FBSyxZQUFZLFVBQVUsQ0FBQztBQUFBLE1BQ2pEO0FBQUEsSUFDRDtBQUVBLFdBQU8sUUFBUSxNQUFNO0FBQUEsRUFDdEI7QUFBQSxFQUVPLGFBQWEsWUFBNEI7QUFDL0MsVUFBTSxjQUFjLEtBQUssZUFBZSxVQUFVO0FBQ2xELFVBQU0sWUFBWSxLQUFLLGFBQWEsVUFBVTtBQUM5QyxVQUFNLE9BQU8sS0FBSyxNQUFNLFVBQVUsYUFBYSxTQUFTO0FBQ3hELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxRQUFRLFVBQThDO0FBQzVELFVBQU0sYUFBYSxLQUFLLFNBQVM7QUFDakMsYUFBUyxhQUFhLEdBQUcsYUFBYSxZQUFZLGNBQWM7QUFDL0QsZUFBUyxVQUFVO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxXQUFtQjtBQUNsQixRQUFJLFNBQVM7QUFDYixTQUFLLFFBQVEsQ0FBQyxNQUFNO0FBQ25CLGdCQUFVLElBQUksS0FBSyxhQUFhLENBQUMsQ0FBQyxLQUFLLEtBQUssYUFBYSxDQUFDLENBQUM7QUFBQSxJQUM1RCxDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQS9RYSxZQWlFRSx3QkFDWixVQUFVLFFBQVEsZUFBZSxvQkFDL0IsUUFBUSxxQkFBcUIsZUFBZSxvQkFDNUMsUUFBUSxxQkFBcUIsZUFBZSx1QkFDMUM7QUFyRUEsSUFBTSxhQUFOO0FBaVJQLE1BQU0sZ0JBQTJDO0FBQUEsRUFZaEQsWUFBWSxRQUFvQixhQUFxQixXQUFtQixhQUFxQjtBQUM1RixTQUFLLFVBQVU7QUFDZixTQUFLLGVBQWU7QUFDcEIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssZUFBZTtBQUNwQixTQUFLLG1CQUFtQixPQUFPLHVCQUF1QixXQUFXO0FBQ2pFLFNBQUssa0JBQWtCLE9BQU87QUFFOUIsU0FBSyxlQUFlO0FBQ3BCLGFBQVMsSUFBSSxLQUFLLGtCQUFrQixNQUFNLE9BQU8sU0FBUyxHQUFHLElBQUksS0FBSyxLQUFLO0FBQzFFLFlBQU0sbUJBQW1CLE9BQU8sZUFBZSxDQUFDO0FBQ2hELFVBQUksb0JBQW9CLFdBQVc7QUFDbEM7QUFBQSxNQUNEO0FBQ0EsV0FBSztBQUFBLElBQ047QUFBQSxFQUNEO0FBQUEsRUFFTyxZQUFZLFlBQTRCO0FBQzlDLFdBQU8sS0FBSyxRQUFRLFlBQVksS0FBSyxtQkFBbUIsVUFBVTtBQUFBLEVBQ25FO0FBQUEsRUFFTyxjQUFjLFlBQTRCO0FBQ2hELFdBQU8sS0FBSyxRQUFRLGNBQWMsS0FBSyxtQkFBbUIsVUFBVTtBQUFBLEVBQ3JFO0FBQUEsRUFFTyxpQkFBeUI7QUFDL0IsV0FBTyxLQUFLLFFBQVEsZUFBZSxFQUFFLFVBQVUsS0FBSyxjQUFjLEtBQUssVUFBVTtBQUFBLEVBQ2xGO0FBQUEsRUFFTyxPQUFPLE9BQWlDO0FBQzlDLFFBQUksaUJBQWlCLGlCQUFpQjtBQUNyQyxhQUNDLEtBQUssaUJBQWlCLE1BQU0sZ0JBQ3pCLEtBQUssZUFBZSxNQUFNLGNBQzFCLEtBQUssaUJBQWlCLE1BQU0sZ0JBQzVCLEtBQUssUUFBUSxhQUFhLE1BQU0sU0FBUyxLQUFLLGtCQUFrQixLQUFLLFlBQVk7QUFBQSxJQUV0RjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxXQUFtQjtBQUN6QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxxQkFBcUIsWUFBdUM7QUFDbEUsV0FBTyxLQUFLLFFBQVEscUJBQXFCLEtBQUssbUJBQW1CLFVBQVU7QUFBQSxFQUM1RTtBQUFBLEVBRU8sY0FBYyxZQUE2QjtBQUNqRCxXQUFPLEtBQUssUUFBUSxjQUFjLEtBQUssbUJBQW1CLFVBQVU7QUFBQSxFQUNyRTtBQUFBLEVBRU8sYUFBYSxZQUE0QjtBQUMvQyxVQUFNLGlCQUFpQixLQUFLLFFBQVEsYUFBYSxLQUFLLG1CQUFtQixVQUFVO0FBQ25GLFdBQU8sS0FBSyxJQUFJLEtBQUssWUFBWSxjQUFjLElBQUksS0FBSyxlQUFlLEtBQUs7QUFBQSxFQUM3RTtBQUFBLEVBRU8sYUFBYSxZQUE0QjtBQUMvQyxXQUFPLEtBQUssUUFBUSxhQUFhLEtBQUssbUJBQW1CLFVBQVU7QUFBQSxFQUNwRTtBQUFBLEVBRU8sZUFBZSxZQUFvQixVQUE0QjtBQUNyRSxXQUFPLEtBQUssUUFBUSxlQUFlLEtBQUssbUJBQW1CLFlBQVksUUFBUTtBQUFBLEVBQ2hGO0FBQUEsRUFFTyxnQkFBZ0IsWUFBd0M7QUFDOUQsV0FBTyxLQUFLLFFBQVEsZ0JBQWdCLEtBQUssbUJBQW1CLFVBQVU7QUFBQSxFQUN2RTtBQUFBLEVBRU8sdUJBQXVCLFFBQXdCO0FBQ3JELFdBQU8sS0FBSyxRQUFRLHVCQUF1QixTQUFTLEtBQUssZUFBZSxLQUFLLFlBQVksSUFBSSxLQUFLO0FBQUEsRUFDbkc7QUFBQSxFQUVPLGFBQWEsWUFBNEI7QUFDL0MsVUFBTSxxQkFBcUIsS0FBSyxtQkFBbUI7QUFDbkQsVUFBTSxtQkFBbUIsS0FBSyxRQUFRLGVBQWUsa0JBQWtCO0FBQ3ZFLFVBQU0saUJBQWlCLEtBQUssUUFBUSxhQUFhLGtCQUFrQjtBQUNuRSxRQUFJLE9BQU8sS0FBSyxRQUFRLGFBQWEsa0JBQWtCO0FBQ3ZELFFBQUksbUJBQW1CLEtBQUssY0FBYztBQUN6QyxhQUFPLEtBQUssVUFBVSxLQUFLLGVBQWUsZ0JBQWdCO0FBQUEsSUFDM0Q7QUFDQSxRQUFJLGlCQUFpQixLQUFLLFlBQVk7QUFDckMsYUFBTyxLQUFLLFVBQVUsR0FBRyxLQUFLLFVBQVUsaUJBQWlCLEtBQUssV0FBVztBQUFBLElBQzFFO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFFBQVEsVUFBOEM7QUFDNUQsYUFBUyxhQUFhLEdBQUcsYUFBYSxLQUFLLFNBQVMsR0FBRyxjQUFjO0FBQ3BFLGVBQVMsVUFBVTtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUNEO0FBRU8sU0FBUywrQkFBK0IsT0FBbUIsVUFBb0Q7QUFDckgsUUFBTSxhQUFhLFNBQVM7QUFDNUIsTUFBSSxDQUFDLE1BQU0sYUFBYSxrQkFBa0IsVUFBVSxHQUFHO0FBQ3RELFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxhQUFhLGtCQUFrQixVQUFVO0FBQy9DLFFBQU0sYUFBYSxNQUFNLGFBQWEsY0FBYyxVQUFVO0FBQzlELFFBQU0sYUFBYSxXQUFXLHVCQUF1QixTQUFTLFNBQVMsQ0FBQztBQUN4RSxRQUFNLFlBQVksV0FBVyxxQkFBcUIsVUFBVTtBQUM1RCxTQUFPO0FBQ1I7QUFZTyxNQUFNLFdBQVc7QUFBQSxFQWFmLFlBQ1UsWUFDaEI7QUFEZ0I7QUFBQSxFQUNkO0FBQUEsRUFkSixPQUFjLGVBQWUsWUFBb0M7QUFDaEUsVUFBTSxZQUF5QixDQUFDO0FBQ2hDLGFBQVMsSUFBSSxHQUFHLElBQUksV0FBVyxTQUFTLEdBQUcsS0FBSztBQUMvQyxnQkFBVSxLQUFLLElBQUksVUFBVSxXQUFXLGFBQWEsQ0FBQyxJQUFJLFdBQVcsZUFBZSxDQUFDLEdBQUcsV0FBVyxZQUFZLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDbkg7QUFDQSxXQUFPLFdBQVcsT0FBTyxTQUFTO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE9BQWMsT0FBTyxXQUFvQztBQUN4RCxXQUFPLElBQUksV0FBVyxTQUFTO0FBQUEsRUFDaEM7QUFBQSxFQU1PLGFBQWEsYUFBcUIsU0FBdUM7QUFDL0UsV0FBTyxXQUFXLDBCQUEwQixLQUFLLElBQUksQ0FBQyxHQUFHLE9BQU8sRUFBRSxNQUFNLEVBQUUsVUFBVSxXQUFXLEdBQUcsVUFBVSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU87QUFBQSxFQUNwSTtBQUFBLEVBRU8sUUFBUSxJQUE4RDtBQUM1RSxRQUFJLFlBQVk7QUFDaEIsZUFBVyxhQUFhLEtBQUssWUFBWTtBQUN4QyxZQUFNLFFBQVEsSUFBSSxZQUFZLFdBQVcsWUFBWSxVQUFVLE1BQU07QUFDckUsU0FBRyxPQUFPLFNBQVM7QUFDbkIsbUJBQWEsVUFBVTtBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRU8sSUFBTyxJQUEwRDtBQUN2RSxVQUFNLFNBQWMsQ0FBQztBQUNyQixRQUFJLFlBQVk7QUFDaEIsZUFBVyxhQUFhLEtBQUssWUFBWTtBQUN4QyxZQUFNLFFBQVEsSUFBSSxZQUFZLFdBQVcsWUFBWSxVQUFVLE1BQU07QUFDckUsYUFBTyxLQUFLLEdBQUcsT0FBTyxTQUFTLENBQUM7QUFDaEMsbUJBQWEsVUFBVTtBQUFBLElBQ3hCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLE1BQU0sT0FBZ0M7QUFDNUMsVUFBTSxTQUFzQixDQUFDO0FBQzdCLFFBQUksWUFBWTtBQUNoQixlQUFXLGFBQWEsS0FBSyxZQUFZO0FBQ3hDLFlBQU0sYUFBYTtBQUNuQixZQUFNLGFBQWEsYUFBYSxVQUFVO0FBQzFDLFVBQUksYUFBYSxNQUFNLE9BQU87QUFDN0IsWUFBSSxjQUFjLE1BQU0sY0FBYztBQUNyQztBQUFBLFFBQ0Q7QUFFQSxjQUFNLGNBQWMsS0FBSyxJQUFJLEdBQUcsTUFBTSxRQUFRLFVBQVU7QUFDeEQsY0FBTSxhQUFhLEtBQUssSUFBSSxHQUFHLGFBQWEsTUFBTSxZQUFZO0FBRTlELGVBQU8sS0FBSyxJQUFJLFVBQVUsVUFBVSxTQUFTLGNBQWMsWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUFBLE1BQzNGO0FBRUEsbUJBQWEsVUFBVTtBQUFBLElBQ3hCO0FBQ0EsV0FBTyxXQUFXLE9BQU8sTUFBTTtBQUFBLEVBQ2hDO0FBQUEsRUFFTyxPQUFPLE9BQStCO0FBQzVDLFVBQU0sU0FBc0IsS0FBSyxXQUFXLE9BQU8sTUFBTSxVQUFVO0FBQ25FLFdBQU8sV0FBVyxPQUFPLE1BQU07QUFBQSxFQUNoQztBQUNEO0FBSU8sTUFBTSxVQUFVO0FBQUEsRUFDdEIsWUFDaUIsUUFDQSxVQUNmO0FBRmU7QUFDQTtBQUFBLEVBQ2I7QUFDTDtBQUtPLE1BQU0sa0JBQWtCO0FBQUEsRUFBeEI7QUFDTixTQUFpQixVQUF1QixDQUFDO0FBQUE7QUFBQSxFQUVsQyxJQUFJLFFBQWdCLFVBQWdDO0FBQzFELFNBQUssUUFBUSxLQUFLLElBQUksVUFBVSxRQUFRLFFBQVEsQ0FBQztBQUFBLEVBQ2xEO0FBQUEsRUFFTyxRQUFvQjtBQUMxQixXQUFPLFdBQVcsT0FBTyxLQUFLLE9BQU87QUFBQSxFQUN0QztBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
