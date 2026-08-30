import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { LineTokens } from "../tokens/lineTokens.js";
import { TokenizationRegistry } from "../languages.js";
import { LanguageId } from "../encodedTokenAttributes.js";
import { NullState, nullTokenizeEncoded } from "./nullTokenize.js";
const fallback = {
  getInitialState: () => NullState,
  tokenizeEncoded: (buffer, hasEOL, state) => nullTokenizeEncoded(LanguageId.Null, state)
};
function tokenizeToStringSync(languageService, text, languageId) {
  return _tokenizeToString(text, languageService.languageIdCodec, TokenizationRegistry.get(languageId) || fallback);
}
async function tokenizeToString(languageService, text, languageId) {
  if (!languageId) {
    return _tokenizeToString(text, languageService.languageIdCodec, fallback);
  }
  const tokenizationSupport = await TokenizationRegistry.getOrCreate(languageId);
  return _tokenizeToString(text, languageService.languageIdCodec, tokenizationSupport || fallback);
}
function tokenizeLineToHTML(text, viewLineTokens, colorMap, startOffset, endOffset, tabSize, useNbsp) {
  let result = `<div>`;
  let charIndex = 0;
  let width = 0;
  let prevIsSpace = true;
  for (let tokenIndex = 0, tokenCount = viewLineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
    const tokenEndIndex = viewLineTokens.getEndOffset(tokenIndex);
    let partContent = "";
    for (; charIndex < tokenEndIndex && charIndex < endOffset; charIndex++) {
      const charCode = text.charCodeAt(charIndex);
      const isTab = charCode === CharCode.Tab;
      width += strings.isFullWidthCharacter(charCode) ? 2 : isTab ? 0 : 1;
      if (charIndex < startOffset) {
        if (isTab) {
          const remainder = width % tabSize;
          width += remainder === 0 ? tabSize : tabSize - remainder;
        }
        continue;
      }
      switch (charCode) {
        case CharCode.Tab: {
          const remainder = width % tabSize;
          const insertSpacesCount = remainder === 0 ? tabSize : tabSize - remainder;
          width += insertSpacesCount;
          let spacesRemaining = insertSpacesCount;
          while (spacesRemaining > 0) {
            if (useNbsp && prevIsSpace) {
              partContent += "&#160;";
              prevIsSpace = false;
            } else {
              partContent += " ";
              prevIsSpace = true;
            }
            spacesRemaining--;
          }
          break;
        }
        case CharCode.LessThan:
          partContent += "&lt;";
          prevIsSpace = false;
          break;
        case CharCode.GreaterThan:
          partContent += "&gt;";
          prevIsSpace = false;
          break;
        case CharCode.Ampersand:
          partContent += "&amp;";
          prevIsSpace = false;
          break;
        case CharCode.Null:
          partContent += "&#00;";
          prevIsSpace = false;
          break;
        case CharCode.UTF8_BOM:
        case CharCode.LINE_SEPARATOR:
        case CharCode.PARAGRAPH_SEPARATOR:
        case CharCode.NEXT_LINE:
          partContent += "\uFFFD";
          prevIsSpace = false;
          break;
        case CharCode.CarriageReturn:
          partContent += "&#8203";
          prevIsSpace = false;
          break;
        case CharCode.Space:
          if (useNbsp && prevIsSpace) {
            partContent += "&#160;";
            prevIsSpace = false;
          } else {
            partContent += " ";
            prevIsSpace = true;
          }
          break;
        default:
          partContent += String.fromCharCode(charCode);
          prevIsSpace = false;
      }
    }
    if (tokenEndIndex <= startOffset) {
      continue;
    }
    result += `<span style="${viewLineTokens.getInlineStyle(tokenIndex, colorMap)}">${partContent}</span>`;
    if (tokenEndIndex > endOffset || charIndex >= endOffset || startOffset >= endOffset) {
      break;
    }
  }
  result += `</div>`;
  return result;
}
function _tokenizeToString(text, languageIdCodec, tokenizationSupport) {
  let result = `<div class="monaco-tokenized-source">`;
  const lines = strings.splitLines(text);
  let currentState = tokenizationSupport.getInitialState();
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = lines[i];
    if (i > 0) {
      result += `<br/>`;
    }
    const tokenizationResult = tokenizationSupport.tokenizeEncoded(line, true, currentState);
    LineTokens.convertToEndOffset(tokenizationResult.tokens, line.length);
    const lineTokens = new LineTokens(tokenizationResult.tokens, line, languageIdCodec);
    const viewLineTokens = lineTokens.inflate();
    let startOffset = 0;
    for (let j = 0, lenJ = viewLineTokens.getCount(); j < lenJ; j++) {
      const type = viewLineTokens.getClassName(j);
      const endIndex = viewLineTokens.getEndOffset(j);
      result += `<span class="${type}">${strings.escape(line.substring(startOffset, endIndex))}</span>`;
      startOffset = endIndex;
    }
    currentState = tokenizationResult.endState;
  }
  result += `</div>`;
  return result;
}
export {
  _tokenizeToString,
  tokenizeLineToHTML,
  tokenizeToString,
  tokenizeToStringSync
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbGFuZ3VhZ2VzXFx0ZXh0VG9IdG1sVG9rZW5pemVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVZpZXdMaW5lVG9rZW5zLCBMaW5lVG9rZW5zIH0gZnJvbSAnLi4vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlSWRDb2RlYywgSVN0YXRlLCBJVG9rZW5pemF0aW9uU3VwcG9ydCwgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VJZCB9IGZyb20gJy4uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlLCBudWxsVG9rZW5pemVFbmNvZGVkIH0gZnJvbSAnLi9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4vbGFuZ3VhZ2UuanMnO1xuXG5leHBvcnQgdHlwZSBJUmVkdWNlZFRva2VuaXphdGlvblN1cHBvcnQgPSBPbWl0PElUb2tlbml6YXRpb25TdXBwb3J0LCAndG9rZW5pemUnPjtcblxuY29uc3QgZmFsbGJhY2s6IElSZWR1Y2VkVG9rZW5pemF0aW9uU3VwcG9ydCA9IHtcblx0Z2V0SW5pdGlhbFN0YXRlOiAoKSA9PiBOdWxsU3RhdGUsXG5cdHRva2VuaXplRW5jb2RlZDogKGJ1ZmZlcjogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpID0+IG51bGxUb2tlbml6ZUVuY29kZWQoTGFuZ3VhZ2VJZC5OdWxsLCBzdGF0ZSlcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiB0b2tlbml6ZVRvU3RyaW5nU3luYyhsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIHRleHQ6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIF90b2tlbml6ZVRvU3RyaW5nKHRleHQsIGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMsIFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldChsYW5ndWFnZUlkKSB8fCBmYWxsYmFjayk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0b2tlbml6ZVRvU3RyaW5nKGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgdGV4dDogc3RyaW5nLCBsYW5ndWFnZUlkOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0aWYgKCFsYW5ndWFnZUlkKSB7XG5cdFx0cmV0dXJuIF90b2tlbml6ZVRvU3RyaW5nKHRleHQsIGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMsIGZhbGxiYWNrKTtcblx0fVxuXHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0ID0gYXdhaXQgVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0T3JDcmVhdGUobGFuZ3VhZ2VJZCk7XG5cdHJldHVybiBfdG9rZW5pemVUb1N0cmluZyh0ZXh0LCBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLCB0b2tlbml6YXRpb25TdXBwb3J0IHx8IGZhbGxiYWNrKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRva2VuaXplTGluZVRvSFRNTCh0ZXh0OiBzdHJpbmcsIHZpZXdMaW5lVG9rZW5zOiBJVmlld0xpbmVUb2tlbnMsIGNvbG9yTWFwOiBzdHJpbmdbXSwgc3RhcnRPZmZzZXQ6IG51bWJlciwgZW5kT2Zmc2V0OiBudW1iZXIsIHRhYlNpemU6IG51bWJlciwgdXNlTmJzcDogYm9vbGVhbik6IHN0cmluZyB7XG5cdGxldCByZXN1bHQgPSBgPGRpdj5gO1xuXHRsZXQgY2hhckluZGV4ID0gMDtcblx0bGV0IHdpZHRoID0gMDtcblxuXHRsZXQgcHJldklzU3BhY2UgPSB0cnVlO1xuXG5cdGZvciAobGV0IHRva2VuSW5kZXggPSAwLCB0b2tlbkNvdW50ID0gdmlld0xpbmVUb2tlbnMuZ2V0Q291bnQoKTsgdG9rZW5JbmRleCA8IHRva2VuQ291bnQ7IHRva2VuSW5kZXgrKykge1xuXHRcdGNvbnN0IHRva2VuRW5kSW5kZXggPSB2aWV3TGluZVRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0bGV0IHBhcnRDb250ZW50ID0gJyc7XG5cblx0XHRmb3IgKDsgY2hhckluZGV4IDwgdG9rZW5FbmRJbmRleCAmJiBjaGFySW5kZXggPCBlbmRPZmZzZXQ7IGNoYXJJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBjaGFyQ29kZSA9IHRleHQuY2hhckNvZGVBdChjaGFySW5kZXgpO1xuXHRcdFx0Y29uc3QgaXNUYWIgPSBjaGFyQ29kZSA9PT0gQ2hhckNvZGUuVGFiO1xuXG5cdFx0XHR3aWR0aCArPSBzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKGNoYXJDb2RlKSA/IDIgOiAoaXNUYWIgPyAwIDogMSk7XG5cblx0XHRcdGlmIChjaGFySW5kZXggPCBzdGFydE9mZnNldCkge1xuXHRcdFx0XHRpZiAoaXNUYWIpIHtcblx0XHRcdFx0XHRjb25zdCByZW1haW5kZXIgPSB3aWR0aCAlIHRhYlNpemU7XG5cdFx0XHRcdFx0d2lkdGggKz0gcmVtYWluZGVyID09PSAwID8gdGFiU2l6ZSA6IHRhYlNpemUgLSByZW1haW5kZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAoY2hhckNvZGUpIHtcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5UYWI6IHtcblx0XHRcdFx0XHRjb25zdCByZW1haW5kZXIgPSB3aWR0aCAlIHRhYlNpemU7XG5cdFx0XHRcdFx0Y29uc3QgaW5zZXJ0U3BhY2VzQ291bnQgPSByZW1haW5kZXIgPT09IDAgPyB0YWJTaXplIDogdGFiU2l6ZSAtIHJlbWFpbmRlcjtcblx0XHRcdFx0XHR3aWR0aCArPSBpbnNlcnRTcGFjZXNDb3VudDtcblx0XHRcdFx0XHRsZXQgc3BhY2VzUmVtYWluaW5nID0gaW5zZXJ0U3BhY2VzQ291bnQ7XG5cdFx0XHRcdFx0d2hpbGUgKHNwYWNlc1JlbWFpbmluZyA+IDApIHtcblx0XHRcdFx0XHRcdGlmICh1c2VOYnNwICYmIHByZXZJc1NwYWNlKSB7XG5cdFx0XHRcdFx0XHRcdHBhcnRDb250ZW50ICs9ICcmIzE2MDsnO1xuXHRcdFx0XHRcdFx0XHRwcmV2SXNTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cGFydENvbnRlbnQgKz0gJyAnO1xuXHRcdFx0XHRcdFx0XHRwcmV2SXNTcGFjZSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzcGFjZXNSZW1haW5pbmctLTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5MZXNzVGhhbjpcblx0XHRcdFx0XHRwYXJ0Q29udGVudCArPSAnJmx0Oyc7XG5cdFx0XHRcdFx0cHJldklzU3BhY2UgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkdyZWF0ZXJUaGFuOlxuXHRcdFx0XHRcdHBhcnRDb250ZW50ICs9ICcmZ3Q7Jztcblx0XHRcdFx0XHRwcmV2SXNTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuQW1wZXJzYW5kOlxuXHRcdFx0XHRcdHBhcnRDb250ZW50ICs9ICcmYW1wOyc7XG5cdFx0XHRcdFx0cHJldklzU3BhY2UgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLk51bGw6XG5cdFx0XHRcdFx0cGFydENvbnRlbnQgKz0gJyYjMDA7Jztcblx0XHRcdFx0XHRwcmV2SXNTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuVVRGOF9CT006XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuTElORV9TRVBBUkFUT1I6XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuUEFSQUdSQVBIX1NFUEFSQVRPUjpcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5ORVhUX0xJTkU6XG5cdFx0XHRcdFx0cGFydENvbnRlbnQgKz0gJ1xcdWZmZmQnO1xuXHRcdFx0XHRcdHByZXZJc1NwYWNlID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybjpcblx0XHRcdFx0XHQvLyB6ZXJvIHdpZHRoIHNwYWNlLCBiZWNhdXNlIGNhcnJpYWdlIHJldHVybiB3b3VsZCBpbnRyb2R1Y2UgYSBsaW5lIGJyZWFrXG5cdFx0XHRcdFx0cGFydENvbnRlbnQgKz0gJyYjODIwMyc7XG5cdFx0XHRcdFx0cHJldklzU3BhY2UgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLlNwYWNlOlxuXHRcdFx0XHRcdGlmICh1c2VOYnNwICYmIHByZXZJc1NwYWNlKSB7XG5cdFx0XHRcdFx0XHRwYXJ0Q29udGVudCArPSAnJiMxNjA7Jztcblx0XHRcdFx0XHRcdHByZXZJc1NwYWNlID0gZmFsc2U7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHBhcnRDb250ZW50ICs9ICcgJztcblx0XHRcdFx0XHRcdHByZXZJc1NwYWNlID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRwYXJ0Q29udGVudCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXJDb2RlKTtcblx0XHRcdFx0XHRwcmV2SXNTcGFjZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0b2tlbkVuZEluZGV4IDw9IHN0YXJ0T2Zmc2V0KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRyZXN1bHQgKz0gYDxzcGFuIHN0eWxlPVwiJHt2aWV3TGluZVRva2Vucy5nZXRJbmxpbmVTdHlsZSh0b2tlbkluZGV4LCBjb2xvck1hcCl9XCI+JHtwYXJ0Q29udGVudH08L3NwYW4+YDtcblxuXHRcdGlmICh0b2tlbkVuZEluZGV4ID4gZW5kT2Zmc2V0IHx8IGNoYXJJbmRleCA+PSBlbmRPZmZzZXQgfHwgc3RhcnRPZmZzZXQgPj0gZW5kT2Zmc2V0KSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXN1bHQgKz0gYDwvZGl2PmA7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBfdG9rZW5pemVUb1N0cmluZyh0ZXh0OiBzdHJpbmcsIGxhbmd1YWdlSWRDb2RlYzogSUxhbmd1YWdlSWRDb2RlYywgdG9rZW5pemF0aW9uU3VwcG9ydDogSVJlZHVjZWRUb2tlbml6YXRpb25TdXBwb3J0KTogc3RyaW5nIHtcblx0bGV0IHJlc3VsdCA9IGA8ZGl2IGNsYXNzPVwibW9uYWNvLXRva2VuaXplZC1zb3VyY2VcIj5gO1xuXHRjb25zdCBsaW5lcyA9IHN0cmluZ3Muc3BsaXRMaW5lcyh0ZXh0KTtcblx0bGV0IGN1cnJlbnRTdGF0ZSA9IHRva2VuaXphdGlvblN1cHBvcnQuZ2V0SW5pdGlhbFN0YXRlKCk7XG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcblxuXHRcdGlmIChpID4gMCkge1xuXHRcdFx0cmVzdWx0ICs9IGA8YnIvPmA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uUmVzdWx0ID0gdG9rZW5pemF0aW9uU3VwcG9ydC50b2tlbml6ZUVuY29kZWQobGluZSwgdHJ1ZSwgY3VycmVudFN0YXRlKTtcblx0XHRMaW5lVG9rZW5zLmNvbnZlcnRUb0VuZE9mZnNldCh0b2tlbml6YXRpb25SZXN1bHQudG9rZW5zLCBsaW5lLmxlbmd0aCk7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IG5ldyBMaW5lVG9rZW5zKHRva2VuaXphdGlvblJlc3VsdC50b2tlbnMsIGxpbmUsIGxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0Y29uc3Qgdmlld0xpbmVUb2tlbnMgPSBsaW5lVG9rZW5zLmluZmxhdGUoKTtcblxuXHRcdGxldCBzdGFydE9mZnNldCA9IDA7XG5cdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSB2aWV3TGluZVRva2Vucy5nZXRDb3VudCgpOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRjb25zdCB0eXBlID0gdmlld0xpbmVUb2tlbnMuZ2V0Q2xhc3NOYW1lKGopO1xuXHRcdFx0Y29uc3QgZW5kSW5kZXggPSB2aWV3TGluZVRva2Vucy5nZXRFbmRPZmZzZXQoaik7XG5cdFx0XHRyZXN1bHQgKz0gYDxzcGFuIGNsYXNzPVwiJHt0eXBlfVwiPiR7c3RyaW5ncy5lc2NhcGUobGluZS5zdWJzdHJpbmcoc3RhcnRPZmZzZXQsIGVuZEluZGV4KSl9PC9zcGFuPmA7XG5cdFx0XHRzdGFydE9mZnNldCA9IGVuZEluZGV4O1xuXHRcdH1cblxuXHRcdGN1cnJlbnRTdGF0ZSA9IHRva2VuaXphdGlvblJlc3VsdC5lbmRTdGF0ZTtcblx0fVxuXG5cdHJlc3VsdCArPSBgPC9kaXY+YDtcblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUN6QixTQUEwQixrQkFBa0I7QUFDNUMsU0FBeUQsNEJBQTRCO0FBQ3JGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVywyQkFBMkI7QUFLL0MsTUFBTSxXQUF3QztBQUFBLEVBQzdDLGlCQUFpQixNQUFNO0FBQUEsRUFDdkIsaUJBQWlCLENBQUMsUUFBZ0IsUUFBaUIsVUFBa0Isb0JBQW9CLFdBQVcsTUFBTSxLQUFLO0FBQ2hIO0FBRU8sU0FBUyxxQkFBcUIsaUJBQW1DLE1BQWMsWUFBNEI7QUFDakgsU0FBTyxrQkFBa0IsTUFBTSxnQkFBZ0IsaUJBQWlCLHFCQUFxQixJQUFJLFVBQVUsS0FBSyxRQUFRO0FBQ2pIO0FBRUEsZUFBc0IsaUJBQWlCLGlCQUFtQyxNQUFjLFlBQTRDO0FBQ25JLE1BQUksQ0FBQyxZQUFZO0FBQ2hCLFdBQU8sa0JBQWtCLE1BQU0sZ0JBQWdCLGlCQUFpQixRQUFRO0FBQUEsRUFDekU7QUFDQSxRQUFNLHNCQUFzQixNQUFNLHFCQUFxQixZQUFZLFVBQVU7QUFDN0UsU0FBTyxrQkFBa0IsTUFBTSxnQkFBZ0IsaUJBQWlCLHVCQUF1QixRQUFRO0FBQ2hHO0FBRU8sU0FBUyxtQkFBbUIsTUFBYyxnQkFBaUMsVUFBb0IsYUFBcUIsV0FBbUIsU0FBaUIsU0FBMEI7QUFDeEwsTUFBSSxTQUFTO0FBQ2IsTUFBSSxZQUFZO0FBQ2hCLE1BQUksUUFBUTtBQUVaLE1BQUksY0FBYztBQUVsQixXQUFTLGFBQWEsR0FBRyxhQUFhLGVBQWUsU0FBUyxHQUFHLGFBQWEsWUFBWSxjQUFjO0FBQ3ZHLFVBQU0sZ0JBQWdCLGVBQWUsYUFBYSxVQUFVO0FBQzVELFFBQUksY0FBYztBQUVs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
