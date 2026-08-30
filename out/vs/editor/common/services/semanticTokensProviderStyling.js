var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { FontStyle, MetadataConsts, TokenMetadata } from "../encodedTokenAttributes.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { ILogService, LogLevel } from "../../../platform/log/common/log.js";
import { SparseMultilineTokens } from "../tokens/sparseMultilineTokens.js";
import { ILanguageService } from "../languages/language.js";
var SemanticTokensProviderStylingConstants = /* @__PURE__ */ ((SemanticTokensProviderStylingConstants2) => {
  SemanticTokensProviderStylingConstants2[SemanticTokensProviderStylingConstants2["NO_STYLING"] = 2147483647] = "NO_STYLING";
  return SemanticTokensProviderStylingConstants2;
})(SemanticTokensProviderStylingConstants || {});
const ENABLE_TRACE = false;
let SemanticTokensProviderStyling = class {
  constructor(_legend, _themeService, _languageService, _logService) {
    this._legend = _legend;
    this._themeService = _themeService;
    this._languageService = _languageService;
    this._logService = _logService;
    this._hasWarnedOverlappingTokens = false;
    this._hasWarnedInvalidLengthTokens = false;
    this._hasWarnedInvalidEditStart = false;
    this._hashTable = new HashTable();
  }
  getMetadata(tokenTypeIndex, tokenModifierSet, languageId) {
    const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
    const entry = this._hashTable.get(tokenTypeIndex, tokenModifierSet, encodedLanguageId);
    let metadata;
    if (entry) {
      metadata = entry.metadata;
      if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
        this._logService.trace(`SemanticTokensProviderStyling [CACHED] ${tokenTypeIndex} / ${tokenModifierSet}: foreground ${TokenMetadata.getForeground(metadata)}, fontStyle ${TokenMetadata.getFontStyle(metadata).toString(2)}`);
      }
    } else {
      let tokenType = this._legend.tokenTypes[tokenTypeIndex];
      const tokenModifiers = [];
      if (tokenType) {
        let modifierSet = tokenModifierSet;
        for (let modifierIndex = 0; modifierSet > 0 && modifierIndex < this._legend.tokenModifiers.length; modifierIndex++) {
          if (modifierSet & 1) {
            tokenModifiers.push(this._legend.tokenModifiers[modifierIndex]);
          }
          modifierSet = modifierSet >> 1;
        }
        if (ENABLE_TRACE && modifierSet > 0 && this._logService.getLevel() === LogLevel.Trace) {
          this._logService.trace(`SemanticTokensProviderStyling: unknown token modifier index: ${tokenModifierSet.toString(2)} for legend: ${JSON.stringify(this._legend.tokenModifiers)}`);
          tokenModifiers.push("not-in-legend");
        }
        const tokenStyle = this._themeService.getColorTheme().getTokenStyleMetadata(tokenType, tokenModifiers, languageId);
        if (typeof tokenStyle === "undefined") {
          metadata = 2147483647 /* NO_STYLING */;
        } else {
          metadata = 0;
          if (typeof tokenStyle.italic !== "undefined") {
            const italicBit = (tokenStyle.italic ? FontStyle.Italic : 0) << MetadataConsts.FONT_STYLE_OFFSET;
            metadata |= italicBit | MetadataConsts.SEMANTIC_USE_ITALIC;
          }
          if (typeof tokenStyle.bold !== "undefined") {
            const boldBit = (tokenStyle.bold ? FontStyle.Bold : 0) << MetadataConsts.FONT_STYLE_OFFSET;
            metadata |= boldBit | MetadataConsts.SEMANTIC_USE_BOLD;
          }
          if (typeof tokenStyle.underline !== "undefined") {
            const underlineBit = (tokenStyle.underline ? FontStyle.Underline : 0) << MetadataConsts.FONT_STYLE_OFFSET;
            metadata |= underlineBit | MetadataConsts.SEMANTIC_USE_UNDERLINE;
          }
          if (typeof tokenStyle.strikethrough !== "undefined") {
            const strikethroughBit = (tokenStyle.strikethrough ? FontStyle.Strikethrough : 0) << MetadataConsts.FONT_STYLE_OFFSET;
            metadata |= strikethroughBit | MetadataConsts.SEMANTIC_USE_STRIKETHROUGH;
          }
          if (tokenStyle.foreground) {
            const foregroundBits = tokenStyle.foreground << MetadataConsts.FOREGROUND_OFFSET;
            metadata |= foregroundBits | MetadataConsts.SEMANTIC_USE_FOREGROUND;
          }
          if (metadata === 0) {
            metadata = 2147483647 /* NO_STYLING */;
          }
        }
      } else {
        if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
          this._logService.trace(`SemanticTokensProviderStyling: unknown token type index: ${tokenTypeIndex} for legend: ${JSON.stringify(this._legend.tokenTypes)}`);
        }
        metadata = 2147483647 /* NO_STYLING */;
        tokenType = "not-in-legend";
      }
      this._hashTable.add(tokenTypeIndex, tokenModifierSet, encodedLanguageId, metadata);
      if (ENABLE_TRACE && this._logService.getLevel() === LogLevel.Trace) {
        this._logService.trace(`SemanticTokensProviderStyling ${tokenTypeIndex} (${tokenType}) / ${tokenModifierSet} (${tokenModifiers.join(" ")}): foreground ${TokenMetadata.getForeground(metadata)}, fontStyle ${TokenMetadata.getFontStyle(metadata).toString(2)}`);
      }
    }
    return metadata;
  }
  warnOverlappingSemanticTokens(lineNumber, startColumn) {
    if (!this._hasWarnedOverlappingTokens) {
      this._hasWarnedOverlappingTokens = true;
      this._logService.warn(`Overlapping semantic tokens detected at lineNumber ${lineNumber}, column ${startColumn}`);
    }
  }
  warnInvalidLengthSemanticTokens(lineNumber, startColumn) {
    if (!this._hasWarnedInvalidLengthTokens) {
      this._hasWarnedInvalidLengthTokens = true;
      this._logService.warn(`Semantic token with invalid length detected at lineNumber ${lineNumber}, column ${startColumn}`);
    }
  }
  warnInvalidEditStart(previousResultId, resultId, editIndex, editStart, maxExpectedStart) {
    if (!this._hasWarnedInvalidEditStart) {
      this._hasWarnedInvalidEditStart = true;
      this._logService.warn(`Invalid semantic tokens edit detected (previousResultId: ${previousResultId}, resultId: ${resultId}) at edit #${editIndex}: The provided start offset ${editStart} is outside the previous data (length ${maxExpectedStart}).`);
    }
  }
};
SemanticTokensProviderStyling = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, ILogService)
], SemanticTokensProviderStyling);
var SemanticColoringConstants = /* @__PURE__ */ ((SemanticColoringConstants2) => {
  SemanticColoringConstants2[SemanticColoringConstants2["DesiredTokensPerArea"] = 400] = "DesiredTokensPerArea";
  SemanticColoringConstants2[SemanticColoringConstants2["DesiredMaxAreas"] = 1024] = "DesiredMaxAreas";
  return SemanticColoringConstants2;
})(SemanticColoringConstants || {});
function toMultilineTokens2(tokens, styling, languageId) {
  const srcData = tokens.data;
  const tokenCount = tokens.data.length / 5 | 0;
  const tokensPerArea = Math.max(Math.ceil(tokenCount / 1024 /* DesiredMaxAreas */), 400 /* DesiredTokensPerArea */);
  const result = [];
  let tokenIndex = 0;
  let lastLineNumber = 1;
  let lastStartCharacter = 0;
  while (tokenIndex < tokenCount) {
    const tokenStartIndex = tokenIndex;
    let tokenEndIndex = Math.min(tokenStartIndex + tokensPerArea, tokenCount);
    if (tokenEndIndex < tokenCount) {
      let smallTokenEndIndex = tokenEndIndex;
      while (smallTokenEndIndex - 1 > tokenStartIndex && srcData[5 * smallTokenEndIndex] === 0) {
        smallTokenEndIndex--;
      }
      if (smallTokenEndIndex - 1 === tokenStartIndex) {
        let bigTokenEndIndex = tokenEndIndex;
        while (bigTokenEndIndex + 1 < tokenCount && srcData[5 * bigTokenEndIndex] === 0) {
          bigTokenEndIndex++;
        }
        tokenEndIndex = bigTokenEndIndex;
      } else {
        tokenEndIndex = smallTokenEndIndex;
      }
    }
    let destData = new Uint32Array((tokenEndIndex - tokenStartIndex) * 4);
    let destOffset = 0;
    let areaLine = 0;
    let prevLineNumber = 0;
    let prevEndCharacter = 0;
    while (tokenIndex < tokenEndIndex) {
      const srcOffset = 5 * tokenIndex;
      const deltaLine = srcData[srcOffset];
      const deltaCharacter = srcData[srcOffset + 1];
      const lineNumber = lastLineNumber + deltaLine | 0;
      const startCharacter = deltaLine === 0 ? lastStartCharacter + deltaCharacter | 0 : deltaCharacter;
      const length = srcData[srcOffset + 2];
      const endCharacter = startCharacter + length | 0;
      const tokenTypeIndex = srcData[srcOffset + 3];
      const tokenModifierSet = srcData[srcOffset + 4];
      if (endCharacter <= startCharacter) {
        styling.warnInvalidLengthSemanticTokens(lineNumber, startCharacter + 1);
      } else if (prevLineNumber === lineNumber && prevEndCharacter > startCharacter) {
        styling.warnOverlappingSemanticTokens(lineNumber, startCharacter + 1);
      } else {
        const metadata = styling.getMetadata(tokenTypeIndex, tokenModifierSet, languageId);
        if (metadata !== 2147483647 /* NO_STYLING */) {
          if (areaLine === 0) {
            areaLine = lineNumber;
          }
          destData[destOffset] = lineNumber - areaLine;
          destData[destOffset + 1] = startCharacter;
          destData[destOffset + 2] = endCharacter;
          destData[destOffset + 3] = metadata;
          destOffset += 4;
          prevLineNumber = lineNumber;
          prevEndCharacter = endCharacter;
        }
      }
      lastLineNumber = lineNumber;
      lastStartCharacter = startCharacter;
      tokenIndex++;
    }
    if (destOffset !== destData.length) {
      destData = destData.subarray(0, destOffset);
    }
    const tokens2 = SparseMultilineTokens.create(areaLine, destData);
    result.push(tokens2);
  }
  return result;
}
class HashTableEntry {
  constructor(tokenTypeIndex, tokenModifierSet, languageId, metadata) {
    this.tokenTypeIndex = tokenTypeIndex;
    this.tokenModifierSet = tokenModifierSet;
    this.languageId = languageId;
    this.metadata = metadata;
    this.next = null;
  }
}
const _HashTable = class _HashTable {
  constructor() {
    this._elementsCount = 0;
    this._currentLengthIndex = 0;
    this._currentLength = _HashTable._SIZES[this._currentLengthIndex];
    this._growCount = Math.round(this._currentLengthIndex + 1 < _HashTable._SIZES.length ? 2 / 3 * this._currentLength : 0);
    this._elements = [];
    _HashTable._nullOutEntries(this._elements, this._currentLength);
  }
  static _nullOutEntries(entries, length) {
    for (let i = 0; i < length; i++) {
      entries[i] = null;
    }
  }
  _hash2(n1, n2) {
    return (n1 << 5) - n1 + n2 | 0;
  }
  _hashFunc(tokenTypeIndex, tokenModifierSet, languageId) {
    return this._hash2(this._hash2(tokenTypeIndex, tokenModifierSet), languageId) % this._currentLength;
  }
  get(tokenTypeIndex, tokenModifierSet, languageId) {
    const hash = this._hashFunc(tokenTypeIndex, tokenModifierSet, languageId);
    let p = this._elements[hash];
    while (p) {
      if (p.tokenTypeIndex === tokenTypeIndex && p.tokenModifierSet === tokenModifierSet && p.languageId === languageId) {
        return p;
      }
      p = p.next;
    }
    return null;
  }
  add(tokenTypeIndex, tokenModifierSet, languageId, metadata) {
    this._elementsCount++;
    if (this._growCount !== 0 && this._elementsCount >= this._growCount) {
      const oldElements = this._elements;
      this._currentLengthIndex++;
      this._currentLength = _HashTable._SIZES[this._currentLengthIndex];
      this._growCount = Math.round(this._currentLengthIndex + 1 < _HashTable._SIZES.length ? 2 / 3 * this._currentLength : 0);
      this._elements = [];
      _HashTable._nullOutEntries(this._elements, this._currentLength);
      for (const first of oldElements) {
        let p = first;
        while (p) {
          const oldNext = p.next;
          p.next = null;
          this._add(p);
          p = oldNext;
        }
      }
    }
    this._add(new HashTableEntry(tokenTypeIndex, tokenModifierSet, languageId, metadata));
  }
  _add(element) {
    const hash = this._hashFunc(element.tokenTypeIndex, element.tokenModifierSet, element.languageId);
    element.next = this._elements[hash];
    this._elements[hash] = element;
  }
};
_HashTable._SIZES = [3, 7, 13, 31, 61, 127, 251, 509, 1021, 2039, 4093, 8191, 16381, 32749, 65521, 131071, 262139, 524287, 1048573, 2097143];
let HashTable = _HashTable;
export {
  SemanticTokensProviderStyling,
  toMultilineTokens2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcc2VydmljZXNcXHNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2VtYW50aWNUb2tlbnNMZWdlbmQsIFNlbWFudGljVG9rZW5zIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IEZvbnRTdHlsZSwgTWV0YWRhdGFDb25zdHMsIFRva2VuTWV0YWRhdGEgfSBmcm9tICcuLi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFNwYXJzZU11bHRpbGluZVRva2VucyB9IGZyb20gJy4uL3Rva2Vucy9zcGFyc2VNdWx0aWxpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5cbmNvbnN0IGVudW0gU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmdDb25zdGFudHMge1xuXHROT19TVFlMSU5HID0gMGIwMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMVxufVxuXG5jb25zdCBFTkFCTEVfVFJBQ0UgPSBmYWxzZTtcblxuZXhwb3J0IGNsYXNzIFNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNoVGFibGU6IEhhc2hUYWJsZTtcblx0cHJpdmF0ZSBfaGFzV2FybmVkT3ZlcmxhcHBpbmdUb2tlbnMgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGFzV2FybmVkSW52YWxpZExlbmd0aFRva2VucyA9IGZhbHNlO1xuXHRwcml2YXRlIF9oYXNXYXJuZWRJbnZhbGlkRWRpdFN0YXJ0ID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGVnZW5kOiBTZW1hbnRpY1Rva2Vuc0xlZ2VuZCxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9oYXNoVGFibGUgPSBuZXcgSGFzaFRhYmxlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWV0YWRhdGEodG9rZW5UeXBlSW5kZXg6IG51bWJlciwgdG9rZW5Nb2RpZmllclNldDogbnVtYmVyLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGNvbnN0IGVuY29kZWRMYW5ndWFnZUlkID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5faGFzaFRhYmxlLmdldCh0b2tlblR5cGVJbmRleCwgdG9rZW5Nb2RpZmllclNldCwgZW5jb2RlZExhbmd1YWdlSWQpO1xuXHRcdGxldCBtZXRhZGF0YTogbnVtYmVyO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0bWV0YWRhdGEgPSBlbnRyeS5tZXRhZGF0YTtcblx0XHRcdGlmIChFTkFCTEVfVFJBQ0UgJiYgdGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZyBbQ0FDSEVEXSAke3Rva2VuVHlwZUluZGV4fSAvICR7dG9rZW5Nb2RpZmllclNldH06IGZvcmVncm91bmQgJHtUb2tlbk1ldGFkYXRhLmdldEZvcmVncm91bmQobWV0YWRhdGEpfSwgZm9udFN0eWxlICR7VG9rZW5NZXRhZGF0YS5nZXRGb250U3R5bGUobWV0YWRhdGEpLnRvU3RyaW5nKDIpfWApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgdG9rZW5UeXBlID0gdGhpcy5fbGVnZW5kLnRva2VuVHlwZXNbdG9rZW5UeXBlSW5kZXhdO1xuXHRcdFx0Y29uc3QgdG9rZW5Nb2RpZmllcnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAodG9rZW5UeXBlKSB7XG5cdFx0XHRcdGxldCBtb2RpZmllclNldCA9IHRva2VuTW9kaWZpZXJTZXQ7XG5cdFx0XHRcdGZvciAobGV0IG1vZGlmaWVySW5kZXggPSAwOyBtb2RpZmllclNldCA+IDAgJiYgbW9kaWZpZXJJbmRleCA8IHRoaXMuX2xlZ2VuZC50b2tlbk1vZGlmaWVycy5sZW5ndGg7IG1vZGlmaWVySW5kZXgrKykge1xuXHRcdFx0XHRcdGlmIChtb2RpZmllclNldCAmIDEpIHtcblx0XHRcdFx0XHRcdHRva2VuTW9kaWZpZXJzLnB1c2godGhpcy5fbGVnZW5kLnRva2VuTW9kaWZpZXJzW21vZGlmaWVySW5kZXhdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bW9kaWZpZXJTZXQgPSBtb2RpZmllclNldCA+PiAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChFTkFCTEVfVFJBQ0UgJiYgbW9kaWZpZXJTZXQgPiAwICYmIHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZzogdW5rbm93biB0b2tlbiBtb2RpZmllciBpbmRleDogJHt0b2tlbk1vZGlmaWVyU2V0LnRvU3RyaW5nKDIpfSBmb3IgbGVnZW5kOiAke0pTT04uc3RyaW5naWZ5KHRoaXMuX2xlZ2VuZC50b2tlbk1vZGlmaWVycyl9YCk7XG5cdFx0XHRcdFx0dG9rZW5Nb2RpZmllcnMucHVzaCgnbm90LWluLWxlZ2VuZCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdG9rZW5TdHlsZSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0VG9rZW5TdHlsZU1ldGFkYXRhKHRva2VuVHlwZSwgdG9rZW5Nb2RpZmllcnMsIGxhbmd1YWdlSWQpO1xuXHRcdFx0XHRpZiAodHlwZW9mIHRva2VuU3R5bGUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0bWV0YWRhdGEgPSBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZ0NvbnN0YW50cy5OT19TVFlMSU5HO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1ldGFkYXRhID0gMDtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHRva2VuU3R5bGUuaXRhbGljICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRhbGljQml0ID0gKHRva2VuU3R5bGUuaXRhbGljID8gRm9udFN0eWxlLkl0YWxpYyA6IDApIDw8IE1ldGFkYXRhQ29uc3RzLkZPTlRfU1RZTEVfT0ZGU0VUO1xuXHRcdFx0XHRcdFx0bWV0YWRhdGEgfD0gaXRhbGljQml0IHwgTWV0YWRhdGFDb25zdHMuU0VNQU5USUNfVVNFX0lUQUxJQztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB0b2tlblN0eWxlLmJvbGQgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBib2xkQml0ID0gKHRva2VuU3R5bGUuYm9sZCA/IEZvbnRTdHlsZS5Cb2xkIDogMCkgPDwgTWV0YWRhdGFDb25zdHMuRk9OVF9TVFlMRV9PRkZTRVQ7XG5cdFx0XHRcdFx0XHRtZXRhZGF0YSB8PSBib2xkQml0IHwgTWV0YWRhdGFDb25zdHMuU0VNQU5USUNfVVNFX0JPTEQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0eXBlb2YgdG9rZW5TdHlsZS51bmRlcmxpbmUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1bmRlcmxpbmVCaXQgPSAodG9rZW5TdHlsZS51bmRlcmxpbmUgPyBGb250U3R5bGUuVW5kZXJsaW5lIDogMCkgPDwgTWV0YWRhdGFDb25zdHMuRk9OVF9TVFlMRV9PRkZTRVQ7XG5cdFx0XHRcdFx0XHRtZXRhZGF0YSB8PSB1bmRlcmxpbmVCaXQgfCBNZXRhZGF0YUNvbnN0cy5TRU1BTlRJQ19VU0VfVU5ERVJMSU5FO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodHlwZW9mIHRva2VuU3R5bGUuc3RyaWtldGhyb3VnaCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHN0cmlrZXRocm91Z2hCaXQgPSAodG9rZW5TdHlsZS5zdHJpa2V0aHJvdWdoID8gRm9udFN0eWxlLlN0cmlrZXRocm91Z2ggOiAwKSA8PCBNZXRhZGF0YUNvbnN0cy5GT05UX1NUWUxFX09GRlNFVDtcblx0XHRcdFx0XHRcdG1ldGFkYXRhIHw9IHN0cmlrZXRocm91Z2hCaXQgfCBNZXRhZGF0YUNvbnN0cy5TRU1BTlRJQ19VU0VfU1RSSUtFVEhST1VHSDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRva2VuU3R5bGUuZm9yZWdyb3VuZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZm9yZWdyb3VuZEJpdHMgPSAodG9rZW5TdHlsZS5mb3JlZ3JvdW5kKSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVDtcblx0XHRcdFx0XHRcdG1ldGFkYXRhIHw9IGZvcmVncm91bmRCaXRzIHwgTWV0YWRhdGFDb25zdHMuU0VNQU5USUNfVVNFX0ZPUkVHUk9VTkQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtZXRhZGF0YSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Ly8gTm90aGluZyFcblx0XHRcdFx0XHRcdG1ldGFkYXRhID0gU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmdDb25zdGFudHMuTk9fU1RZTElORztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChFTkFCTEVfVFJBQ0UgJiYgdGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nOiB1bmtub3duIHRva2VuIHR5cGUgaW5kZXg6ICR7dG9rZW5UeXBlSW5kZXh9IGZvciBsZWdlbmQ6ICR7SlNPTi5zdHJpbmdpZnkodGhpcy5fbGVnZW5kLnRva2VuVHlwZXMpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1ldGFkYXRhID0gU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmdDb25zdGFudHMuTk9fU1RZTElORztcblx0XHRcdFx0dG9rZW5UeXBlID0gJ25vdC1pbi1sZWdlbmQnO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faGFzaFRhYmxlLmFkZCh0b2tlblR5cGVJbmRleCwgdG9rZW5Nb2RpZmllclNldCwgZW5jb2RlZExhbmd1YWdlSWQsIG1ldGFkYXRhKTtcblxuXHRcdFx0aWYgKEVOQUJMRV9UUkFDRSAmJiB0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nICR7dG9rZW5UeXBlSW5kZXh9ICgke3Rva2VuVHlwZX0pIC8gJHt0b2tlbk1vZGlmaWVyU2V0fSAoJHt0b2tlbk1vZGlmaWVycy5qb2luKCcgJyl9KTogZm9yZWdyb3VuZCAke1Rva2VuTWV0YWRhdGEuZ2V0Rm9yZWdyb3VuZChtZXRhZGF0YSl9LCBmb250U3R5bGUgJHtUb2tlbk1ldGFkYXRhLmdldEZvbnRTdHlsZShtZXRhZGF0YSkudG9TdHJpbmcoMil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1ldGFkYXRhO1xuXHR9XG5cblx0cHVibGljIHdhcm5PdmVybGFwcGluZ1NlbWFudGljVG9rZW5zKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faGFzV2FybmVkT3ZlcmxhcHBpbmdUb2tlbnMpIHtcblx0XHRcdHRoaXMuX2hhc1dhcm5lZE92ZXJsYXBwaW5nVG9rZW5zID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgT3ZlcmxhcHBpbmcgc2VtYW50aWMgdG9rZW5zIGRldGVjdGVkIGF0IGxpbmVOdW1iZXIgJHtsaW5lTnVtYmVyfSwgY29sdW1uICR7c3RhcnRDb2x1bW59YCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHdhcm5JbnZhbGlkTGVuZ3RoU2VtYW50aWNUb2tlbnMobGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNXYXJuZWRJbnZhbGlkTGVuZ3RoVG9rZW5zKSB7XG5cdFx0XHR0aGlzLl9oYXNXYXJuZWRJbnZhbGlkTGVuZ3RoVG9rZW5zID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgU2VtYW50aWMgdG9rZW4gd2l0aCBpbnZhbGlkIGxlbmd0aCBkZXRlY3RlZCBhdCBsaW5lTnVtYmVyICR7bGluZU51bWJlcn0sIGNvbHVtbiAke3N0YXJ0Q29sdW1ufWApO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB3YXJuSW52YWxpZEVkaXRTdGFydChwcmV2aW91c1Jlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGVkaXRJbmRleDogbnVtYmVyLCBlZGl0U3RhcnQ6IG51bWJlciwgbWF4RXhwZWN0ZWRTdGFydDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNXYXJuZWRJbnZhbGlkRWRpdFN0YXJ0KSB7XG5cdFx0XHR0aGlzLl9oYXNXYXJuZWRJbnZhbGlkRWRpdFN0YXJ0ID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgSW52YWxpZCBzZW1hbnRpYyB0b2tlbnMgZWRpdCBkZXRlY3RlZCAocHJldmlvdXNSZXN1bHRJZDogJHtwcmV2aW91c1Jlc3VsdElkfSwgcmVzdWx0SWQ6ICR7cmVzdWx0SWR9KSBhdCBlZGl0ICMke2VkaXRJbmRleH06IFRoZSBwcm92aWRlZCBzdGFydCBvZmZzZXQgJHtlZGl0U3RhcnR9IGlzIG91dHNpZGUgdGhlIHByZXZpb3VzIGRhdGEgKGxlbmd0aCAke21heEV4cGVjdGVkU3RhcnR9KS5gKTtcblx0XHR9XG5cdH1cblxufVxuXG5jb25zdCBlbnVtIFNlbWFudGljQ29sb3JpbmdDb25zdGFudHMge1xuXHQvKipcblx0ICogTGV0J3MgYWltIGF0IGhhdmluZyA4S0IgYnVmZmVycyBpZiBwb3NzaWJsZS4uLlxuXHQgKiBTbyB0aGF0IHdvdWxkIGJlIDgxOTIgLyAoNSAqIDQpID0gNDA5LjYgdG9rZW5zIHBlciBhcmVhXG5cdCAqL1xuXHREZXNpcmVkVG9rZW5zUGVyQXJlYSA9IDQwMCxcblxuXHQvKipcblx0ICogVHJ5IHRvIGtlZXAgdGhlIHRvdGFsIG51bWJlciBvZiBhcmVhcyB1bmRlciAxMDI0IGlmIHBvc3NpYmxlLFxuXHQgKiBzaW1wbHkgY29tcGVuc2F0ZSBieSBoYXZpbmcgbW9yZSB0b2tlbnMgcGVyIGFyZWEuLi5cblx0ICovXG5cdERlc2lyZWRNYXhBcmVhcyA9IDEwMjQsXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b011bHRpbGluZVRva2VuczIodG9rZW5zOiBTZW1hbnRpY1Rva2Vucywgc3R5bGluZzogU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZyk6IFNwYXJzZU11bHRpbGluZVRva2Vuc1tdIHtcblx0Y29uc3Qgc3JjRGF0YSA9IHRva2Vucy5kYXRhO1xuXHRjb25zdCB0b2tlbkNvdW50ID0gKHRva2Vucy5kYXRhLmxlbmd0aCAvIDUpIHwgMDtcblx0Y29uc3QgdG9rZW5zUGVyQXJlYSA9IE1hdGgubWF4KE1hdGguY2VpbCh0b2tlbkNvdW50IC8gU2VtYW50aWNDb2xvcmluZ0NvbnN0YW50cy5EZXNpcmVkTWF4QXJlYXMpLCBTZW1hbnRpY0NvbG9yaW5nQ29uc3RhbnRzLkRlc2lyZWRUb2tlbnNQZXJBcmVhKTtcblx0Y29uc3QgcmVzdWx0OiBTcGFyc2VNdWx0aWxpbmVUb2tlbnNbXSA9IFtdO1xuXG5cdGxldCB0b2tlbkluZGV4ID0gMDtcblx0bGV0IGxhc3RMaW5lTnVtYmVyID0gMTtcblx0bGV0IGxhc3RTdGFydENoYXJhY3RlciA9IDA7XG5cdHdoaWxlICh0b2tlbkluZGV4IDwgdG9rZW5Db3VudCkge1xuXHRcdGNvbnN0IHRva2VuU3RhcnRJbmRleCA9IHRva2VuSW5kZXg7XG5cdFx0bGV0IHRva2VuRW5kSW5kZXggPSBNYXRoLm1pbih0b2tlblN0YXJ0SW5kZXggKyB0b2tlbnNQZXJBcmVhLCB0b2tlbkNvdW50KTtcblxuXHRcdC8vIEtlZXAgdG9rZW5zIG9uIHRoZSBzYW1lIGxpbmUgaW4gdGhlIHNhbWUgYXJlYS4uLlxuXHRcdGlmICh0b2tlbkVuZEluZGV4IDwgdG9rZW5Db3VudCkge1xuXG5cdFx0XHRsZXQgc21hbGxUb2tlbkVuZEluZGV4ID0gdG9rZW5FbmRJbmRleDtcblx0XHRcdHdoaWxlIChzbWFsbFRva2VuRW5kSW5kZXggLSAxID4gdG9rZW5TdGFydEluZGV4ICYmIHNyY0RhdGFbNSAqIHNtYWxsVG9rZW5FbmRJbmRleF0gPT09IDApIHtcblx0XHRcdFx0c21hbGxUb2tlbkVuZEluZGV4LS07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzbWFsbFRva2VuRW5kSW5kZXggLSAxID09PSB0b2tlblN0YXJ0SW5kZXgpIHtcblx0XHRcdFx0Ly8gdGhlcmUgYXJlIHNvIG1hbnkgdG9rZW5zIG9uIHRoaXMgbGluZSB0aGF0IG91ciBhcmVhIHdvdWxkIGJlIGVtcHR5LCB3ZSBtdXN0IG5vdyBnbyByaWdodFxuXHRcdFx0XHRsZXQgYmlnVG9rZW5FbmRJbmRleCA9IHRva2VuRW5kSW5kZXg7XG5cdFx0XHRcdHdoaWxlIChiaWdUb2tlbkVuZEluZGV4ICsgMSA8IHRva2VuQ291bnQgJiYgc3JjRGF0YVs1ICogYmlnVG9rZW5FbmRJbmRleF0gPT09IDApIHtcblx0XHRcdFx0XHRiaWdUb2tlbkVuZEluZGV4Kys7XG5cdFx0XHRcdH1cblx0XHRcdFx0dG9rZW5FbmRJbmRleCA9IGJpZ1Rva2VuRW5kSW5kZXg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b2tlbkVuZEluZGV4ID0gc21hbGxUb2tlbkVuZEluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBkZXN0RGF0YSA9IG5ldyBVaW50MzJBcnJheSgodG9rZW5FbmRJbmRleCAtIHRva2VuU3RhcnRJbmRleCkgKiA0KTtcblx0XHRsZXQgZGVzdE9mZnNldCA9IDA7XG5cdFx0bGV0IGFyZWFMaW5lID0gMDtcblx0XHRsZXQgcHJldkxpbmVOdW1iZXIgPSAwO1xuXHRcdGxldCBwcmV2RW5kQ2hhcmFjdGVyID0gMDtcblx0XHR3aGlsZSAodG9rZW5JbmRleCA8IHRva2VuRW5kSW5kZXgpIHtcblx0XHRcdGNvbnN0IHNyY09mZnNldCA9IDUgKiB0b2tlbkluZGV4O1xuXHRcdFx0Y29uc3QgZGVsdGFMaW5lID0gc3JjRGF0YVtzcmNPZmZzZXRdO1xuXHRcdFx0Y29uc3QgZGVsdGFDaGFyYWN0ZXIgPSBzcmNEYXRhW3NyY09mZnNldCArIDFdO1xuXHRcdFx0Ly8gQ2FzdGluZyBib3RoIGBsaW5lTnVtYmVyYCwgYHN0YXJ0Q2hhcmFjdGVyYCBhbmQgYGVuZENoYXJhY3RlcmAgaGVyZSB0byB1aW50MzIgdXNpbmcgYHwwYFxuXHRcdFx0Ly8gdG8gdmFsaWRhdGUgYmVsb3cgd2l0aCB0aGUgYWN0dWFsIHZhbHVlcyB0aGF0IHdpbGwgYmUgaW5zZXJ0ZWQgaW4gdGhlIFVpbnQzMkFycmF5IHJlc3VsdFxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IChsYXN0TGluZU51bWJlciArIGRlbHRhTGluZSkgfCAwO1xuXHRcdFx0Y29uc3Qgc3RhcnRDaGFyYWN0ZXIgPSAoZGVsdGFMaW5lID09PSAwID8gKGxhc3RTdGFydENoYXJhY3RlciArIGRlbHRhQ2hhcmFjdGVyKSB8IDAgOiBkZWx0YUNoYXJhY3Rlcik7XG5cdFx0XHRjb25zdCBsZW5ndGggPSBzcmNEYXRhW3NyY09mZnNldCArIDJdO1xuXHRcdFx0Y29uc3QgZW5kQ2hhcmFjdGVyID0gKHN0YXJ0Q2hhcmFjdGVyICsgbGVuZ3RoKSB8IDA7XG5cdFx0XHRjb25zdCB0b2tlblR5cGVJbmRleCA9IHNyY0RhdGFbc3JjT2Zmc2V0ICsgM107XG5cdFx0XHRjb25zdCB0b2tlbk1vZGlmaWVyU2V0ID0gc3JjRGF0YVtzcmNPZmZzZXQgKyA0XTtcblxuXHRcdFx0aWYgKGVuZENoYXJhY3RlciA8PSBzdGFydENoYXJhY3Rlcikge1xuXHRcdFx0XHQvLyB0aGlzIHRva2VuIGlzIGludmFsaWQgKG1vc3QgbGlrZWx5IGEgbmVnYXRpdmUgbGVuZ3RoIGNhc3RlZCB0byB1aW50MzIpXG5cdFx0XHRcdHN0eWxpbmcud2FybkludmFsaWRMZW5ndGhTZW1hbnRpY1Rva2VucyhsaW5lTnVtYmVyLCBzdGFydENoYXJhY3RlciArIDEpO1xuXHRcdFx0fSBlbHNlIGlmIChwcmV2TGluZU51bWJlciA9PT0gbGluZU51bWJlciAmJiBwcmV2RW5kQ2hhcmFjdGVyID4gc3RhcnRDaGFyYWN0ZXIpIHtcblx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBvdmVybGFwcyB3aXRoIHRoZSBwcmV2aW91cyB0b2tlblxuXHRcdFx0XHRzdHlsaW5nLndhcm5PdmVybGFwcGluZ1NlbWFudGljVG9rZW5zKGxpbmVOdW1iZXIsIHN0YXJ0Q2hhcmFjdGVyICsgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IHN0eWxpbmcuZ2V0TWV0YWRhdGEodG9rZW5UeXBlSW5kZXgsIHRva2VuTW9kaWZpZXJTZXQsIGxhbmd1YWdlSWQpO1xuXG5cdFx0XHRcdGlmIChtZXRhZGF0YSAhPT0gU2VtYW50aWNUb2tlbnNQcm92aWRlclN0eWxpbmdDb25zdGFudHMuTk9fU1RZTElORykge1xuXHRcdFx0XHRcdGlmIChhcmVhTGluZSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0YXJlYUxpbmUgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZXN0RGF0YVtkZXN0T2Zmc2V0XSA9IGxpbmVOdW1iZXIgLSBhcmVhTGluZTtcblx0XHRcdFx0XHRkZXN0RGF0YVtkZXN0T2Zmc2V0ICsgMV0gPSBzdGFydENoYXJhY3Rlcjtcblx0XHRcdFx0XHRkZXN0RGF0YVtkZXN0T2Zmc2V0ICsgMl0gPSBlbmRDaGFyYWN0ZXI7XG5cdFx0XHRcdFx0ZGVzdERhdGFbZGVzdE9mZnNldCArIDNdID0gbWV0YWRhdGE7XG5cdFx0XHRcdFx0ZGVzdE9mZnNldCArPSA0O1xuXG5cdFx0XHRcdFx0cHJldkxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHRcdHByZXZFbmRDaGFyYWN0ZXIgPSBlbmRDaGFyYWN0ZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGFzdExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdFx0bGFzdFN0YXJ0Q2hhcmFjdGVyID0gc3RhcnRDaGFyYWN0ZXI7XG5cdFx0XHR0b2tlbkluZGV4Kys7XG5cdFx0fVxuXG5cdFx0aWYgKGRlc3RPZmZzZXQgIT09IGRlc3REYXRhLmxlbmd0aCkge1xuXHRcdFx0ZGVzdERhdGEgPSBkZXN0RGF0YS5zdWJhcnJheSgwLCBkZXN0T2Zmc2V0KTtcblx0XHR9XG5cblx0XHRjb25zdCB0b2tlbnMgPSBTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKGFyZWFMaW5lLCBkZXN0RGF0YSk7XG5cdFx0cmVzdWx0LnB1c2godG9rZW5zKTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmNsYXNzIEhhc2hUYWJsZUVudHJ5IHtcblx0cHVibGljIHJlYWRvbmx5IHRva2VuVHlwZUluZGV4OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSB0b2tlbk1vZGlmaWVyU2V0OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBsYW5ndWFnZUlkOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBtZXRhZGF0YTogbnVtYmVyO1xuXHRwdWJsaWMgbmV4dDogSGFzaFRhYmxlRW50cnkgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHRva2VuVHlwZUluZGV4OiBudW1iZXIsIHRva2VuTW9kaWZpZXJTZXQ6IG51bWJlciwgbGFuZ3VhZ2VJZDogbnVtYmVyLCBtZXRhZGF0YTogbnVtYmVyKSB7XG5cdFx0dGhpcy50b2tlblR5cGVJbmRleCA9IHRva2VuVHlwZUluZGV4O1xuXHRcdHRoaXMudG9rZW5Nb2RpZmllclNldCA9IHRva2VuTW9kaWZpZXJTZXQ7XG5cdFx0dGhpcy5sYW5ndWFnZUlkID0gbGFuZ3VhZ2VJZDtcblx0XHR0aGlzLm1ldGFkYXRhID0gbWV0YWRhdGE7XG5cdFx0dGhpcy5uZXh0ID0gbnVsbDtcblx0fVxufVxuXG5jbGFzcyBIYXNoVGFibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIF9TSVpFUyA9IFszLCA3LCAxMywgMzEsIDYxLCAxMjcsIDI1MSwgNTA5LCAxMDIxLCAyMDM5LCA0MDkzLCA4MTkxLCAxNjM4MSwgMzI3NDksIDY1NTIxLCAxMzEwNzEsIDI2MjEzOSwgNTI0Mjg3LCAxMDQ4NTczLCAyMDk3MTQzXTtcblxuXHRwcml2YXRlIF9lbGVtZW50c0NvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgX2N1cnJlbnRMZW5ndGhJbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIF9jdXJyZW50TGVuZ3RoOiBudW1iZXI7XG5cdHByaXZhdGUgX2dyb3dDb3VudDogbnVtYmVyO1xuXHRwcml2YXRlIF9lbGVtZW50czogKEhhc2hUYWJsZUVudHJ5IHwgbnVsbClbXTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9lbGVtZW50c0NvdW50ID0gMDtcblx0XHR0aGlzLl9jdXJyZW50TGVuZ3RoSW5kZXggPSAwO1xuXHRcdHRoaXMuX2N1cnJlbnRMZW5ndGggPSBIYXNoVGFibGUuX1NJWkVTW3RoaXMuX2N1cnJlbnRMZW5ndGhJbmRleF07XG5cdFx0dGhpcy5fZ3Jvd0NvdW50ID0gTWF0aC5yb3VuZCh0aGlzLl9jdXJyZW50TGVuZ3RoSW5kZXggKyAxIDwgSGFzaFRhYmxlLl9TSVpFUy5sZW5ndGggPyAyIC8gMyAqIHRoaXMuX2N1cnJlbnRMZW5ndGggOiAwKTtcblx0XHR0aGlzLl9lbGVtZW50cyA9IFtdO1xuXHRcdEhhc2hUYWJsZS5fbnVsbE91dEVudHJpZXModGhpcy5fZWxlbWVudHMsIHRoaXMuX2N1cnJlbnRMZW5ndGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX251bGxPdXRFbnRyaWVzKGVudHJpZXM6IChIYXNoVGFibGVFbnRyeSB8IG51bGwpW10sIGxlbmd0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0ZW50cmllc1tpXSA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFzaDIobjE6IG51bWJlciwgbjI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuICgoKG4xIDw8IDUpIC0gbjEpICsgbjIpIHwgMDsgIC8vIG4xICogMzEgKyBuMiwga2VlcCBhcyBpbnQzMlxuXHR9XG5cblx0cHJpdmF0ZSBfaGFzaEZ1bmModG9rZW5UeXBlSW5kZXg6IG51bWJlciwgdG9rZW5Nb2RpZmllclNldDogbnVtYmVyLCBsYW5ndWFnZUlkOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9oYXNoMih0aGlzLl9oYXNoMih0b2tlblR5cGVJbmRleCwgdG9rZW5Nb2RpZmllclNldCksIGxhbmd1YWdlSWQpICUgdGhpcy5fY3VycmVudExlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXQodG9rZW5UeXBlSW5kZXg6IG51bWJlciwgdG9rZW5Nb2RpZmllclNldDogbnVtYmVyLCBsYW5ndWFnZUlkOiBudW1iZXIpOiBIYXNoVGFibGVFbnRyeSB8IG51bGwge1xuXHRcdGNvbnN0IGhhc2ggPSB0aGlzLl9oYXNoRnVuYyh0b2tlblR5cGVJbmRleCwgdG9rZW5Nb2RpZmllclNldCwgbGFuZ3VhZ2VJZCk7XG5cblx0XHRsZXQgcCA9IHRoaXMuX2VsZW1lbnRzW2hhc2hdO1xuXHRcdHdoaWxlIChwKSB7XG5cdFx0XHRpZiAocC50b2tlblR5cGVJbmRleCA9PT0gdG9rZW5UeXBlSW5kZXggJiYgcC50b2tlbk1vZGlmaWVyU2V0ID09PSB0b2tlbk1vZGlmaWVyU2V0ICYmIHAubGFuZ3VhZ2VJZCA9PT0gbGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRyZXR1cm4gcDtcblx0XHRcdH1cblx0XHRcdHAgPSBwLm5leHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgYWRkKHRva2VuVHlwZUluZGV4OiBudW1iZXIsIHRva2VuTW9kaWZpZXJTZXQ6IG51bWJlciwgbGFuZ3VhZ2VJZDogbnVtYmVyLCBtZXRhZGF0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZWxlbWVudHNDb3VudCsrO1xuXHRcdGlmICh0aGlzLl9ncm93Q291bnQgIT09IDAgJiYgdGhpcy5fZWxlbWVudHNDb3VudCA+PSB0aGlzLl9ncm93Q291bnQpIHtcblx0XHRcdC8vIGV4cGFuZCFcblx0XHRcdGNvbnN0IG9sZEVsZW1lbnRzID0gdGhpcy5fZWxlbWVudHM7XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRMZW5ndGhJbmRleCsrO1xuXHRcdFx0dGhpcy5fY3VycmVudExlbmd0aCA9IEhhc2hUYWJsZS5fU0laRVNbdGhpcy5fY3VycmVudExlbmd0aEluZGV4XTtcblx0XHRcdHRoaXMuX2dyb3dDb3VudCA9IE1hdGgucm91bmQodGhpcy5fY3VycmVudExlbmd0aEluZGV4ICsgMSA8IEhhc2hUYWJsZS5fU0laRVMubGVuZ3RoID8gMiAvIDMgKiB0aGlzLl9jdXJyZW50TGVuZ3RoIDogMCk7XG5cdFx0XHR0aGlzLl9lbGVtZW50cyA9IFtdO1xuXHRcdFx0SGFzaFRhYmxlLl9udWxsT3V0RW50cmllcyh0aGlzLl9lbGVtZW50cywgdGhpcy5fY3VycmVudExlbmd0aCk7XG5cblx0XHRcdGZvciAoY29uc3QgZmlyc3Qgb2Ygb2xkRWxlbWVudHMpIHtcblx0XHRcdFx0bGV0IHAgPSBmaXJzdDtcblx0XHRcdFx0d2hpbGUgKHApIHtcblx0XHRcdFx0XHRjb25zdCBvbGROZXh0ID0gcC5uZXh0O1xuXHRcdFx0XHRcdHAubmV4dCA9IG51bGw7XG5cdFx0XHRcdFx0dGhpcy5fYWRkKHApO1xuXHRcdFx0XHRcdHAgPSBvbGROZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FkZChuZXcgSGFzaFRhYmxlRW50cnkodG9rZW5UeXBlSW5kZXgsIHRva2VuTW9kaWZpZXJTZXQsIGxhbmd1YWdlSWQsIG1ldGFkYXRhKSk7XG5cdH1cblxuXHRwcml2YXRlIF9hZGQoZWxlbWVudDogSGFzaFRhYmxlRW50cnkpOiB2b2lkIHtcblx0XHRjb25zdCBoYXNoID0gdGhpcy5faGFzaEZ1bmMoZWxlbWVudC50b2tlblR5cGVJbmRleCwgZWxlbWVudC50b2tlbk1vZGlmaWVyU2V0LCBlbGVtZW50Lmxhbmd1YWdlSWQpO1xuXHRcdGVsZW1lbnQubmV4dCA9IHRoaXMuX2VsZW1lbnRzW2hhc2hdO1xuXHRcdHRoaXMuX2VsZW1lbnRzW2hhc2hdID0gZWxlbWVudDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFdBQVcsZ0JBQWdCLHFCQUFxQjtBQUN6RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGFBQWEsZ0JBQWdCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBRWpDLElBQVcseUNBQVgsa0JBQVdBLDRDQUFYO0FBQ0MsRUFBQUEsZ0ZBQUEsZ0JBQWEsY0FBYjtBQURVLFNBQUFBO0FBQUEsR0FBQTtBQUlYLE1BQU0sZUFBZTtBQUVkLElBQU0sZ0NBQU4sTUFBb0M7QUFBQSxFQU8xQyxZQUNrQixTQUNlLGVBQ0csa0JBQ0wsYUFDN0I7QUFKZ0I7QUFDZTtBQUNHO0FBQ0w7QUFSL0IsU0FBUSw4QkFBOEI7QUFDdEMsU0FBUSxnQ0FBZ0M7QUFDeEMsU0FBUSw2QkFBNkI7QUFRcEMsU0FBSyxhQUFhLElBQUksVUFBVTtBQUFBLEVBQ2pDO0FBQUEsRUFFTyxZQUFZLGdCQUF3QixrQkFBMEIsWUFBNEI7QUFDaEcsVUFBTSxvQkFBb0IsS0FBSyxpQkFBaUIsZ0JBQWdCLGlCQUFpQixVQUFVO0FBQzNGLFVBQU0sUUFBUSxLQUFLLFdBQVcsSUFBSSxnQkFBZ0Isa0JBQWtCLGlCQUFpQjtBQUNyRixRQUFJO0FBQ0osUUFBSSxPQUFPO0FBQ1YsaUJBQVcsTUFBTTtBQUNqQixVQUFJLGdCQUFnQixLQUFLLFlBQVksU0FBUyxNQUFNLFNBQVMsT0FBTztBQUNuRSxhQUFLLFlBQVksTUFBTSwwQ0FBMEMsY0FBYyxNQUFNLGdCQUFnQixnQkFBZ0IsY0FBYyxjQUFjLFFBQVEsQ0FBQyxlQUFlLGNBQWMs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TDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsU0FBSyxLQUFLLElBQUksZUFBZSxnQkFBZ0Isa0JBQWtCLFlBQVksUUFBUSxDQUFDO0FBQUEsRUFDckY7QUFBQSxFQUVRLEtBQUssU0FBK0I7QUFDM0MsVUFBTSxPQUFPLEtBQUssVUFBVSxRQUFRLGdCQUFnQixRQUFRLGtCQUFrQixRQUFRLFVBQVU7QUFDaEcsWUFBUSxPQUFPLEtBQUssVUFBVSxJQUFJO0FBQ2xDLFNBQUssVUFBVSxJQUFJLElBQUk7QUFBQSxFQUN4QjtBQUNEO0FBN0VNLFdBRVUsU0FBUyxDQUFDLEdBQUcsR0FBRyxJQUFJLElBQUksSUFBSSxLQUFLLEtBQUssS0FBSyxNQUFNLE1BQU0sTUFBTSxNQUFNLE9BQU8sT0FBTyxPQUFPLFFBQVEsUUFBUSxRQUFRLFNBQVMsT0FBTztBQUZoSixJQUFNLFlBQU47IiwKICAibmFtZXMiOiBbIlNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nQ29uc3RhbnRzIiwgIlNlbWFudGljQ29sb3JpbmdDb25zdGFudHMiLCAidG9rZW5zIl0KfQo=
