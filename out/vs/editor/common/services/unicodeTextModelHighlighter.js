import { Range } from "../core/range.js";
import { Searcher } from "../model/textModelSearch.js";
import * as strings from "../../../base/common/strings.js";
import { assertNever } from "../../../base/common/assert.js";
import { DEFAULT_WORD_REGEXP, getWordAtText } from "../core/wordHelper.js";
class UnicodeTextModelHighlighter {
  static computeUnicodeHighlights(model, options, range) {
    const startLine = range ? range.startLineNumber : 1;
    const endLine = range ? range.endLineNumber : model.getLineCount();
    const codePointHighlighter = new CodePointHighlighter(options);
    const candidates = codePointHighlighter.getCandidateCodePoints();
    let regex;
    if (candidates === "allNonBasicAscii") {
      regex = new RegExp("[^\\t\\n\\r\\x20-\\x7E]", "g");
    } else {
      regex = new RegExp(`${buildRegExpCharClassExpr(Array.from(candidates))}`, "g");
    }
    const searcher = new Searcher(null, regex);
    const ranges = [];
    let hasMore = false;
    let m;
    let ambiguousCharacterCount = 0;
    let invisibleCharacterCount = 0;
    let nonBasicAsciiCharacterCount = 0;
    forLoop:
      for (let lineNumber = startLine, lineCount = endLine; lineNumber <= lineCount; lineNumber++) {
        const lineContent = model.getLineContent(lineNumber);
        const lineLength = lineContent.length;
        searcher.reset(0);
        do {
          m = searcher.next(lineContent);
          if (m) {
            let startIndex = m.index;
            let endIndex = m.index + m[0].length;
            if (startIndex > 0) {
              const charCodeBefore = lineContent.charCodeAt(startIndex - 1);
              if (strings.isHighSurrogate(charCodeBefore)) {
                startIndex--;
              }
            }
            if (endIndex + 1 < lineLength) {
              const charCodeBefore = lineContent.charCodeAt(endIndex - 1);
              if (strings.isHighSurrogate(charCodeBefore)) {
                endIndex++;
              }
            }
            const str = lineContent.substring(startIndex, endIndex);
            let word = getWordAtText(startIndex + 1, DEFAULT_WORD_REGEXP, lineContent, 0);
            if (word && word.endColumn <= startIndex + 1) {
              word = null;
            }
            const highlightReason = codePointHighlighter.shouldHighlightNonBasicASCII(str, word ? word.word : null);
            if (highlightReason !== 0 /* None */) {
              if (highlightReason === 3 /* Ambiguous */) {
                ambiguousCharacterCount++;
              } else if (highlightReason === 2 /* Invisible */) {
                invisibleCharacterCount++;
              } else if (highlightReason === 1 /* NonBasicASCII */) {
                nonBasicAsciiCharacterCount++;
              } else {
                assertNever(highlightReason);
              }
              const MAX_RESULT_LENGTH = 1e3;
              if (ranges.length >= MAX_RESULT_LENGTH) {
                hasMore = true;
                break forLoop;
              }
              ranges.push(new Range(lineNumber, startIndex + 1, lineNumber, endIndex + 1));
            }
          }
        } while (m);
      }
    return {
      ranges,
      hasMore,
      ambiguousCharacterCount,
      invisibleCharacterCount,
      nonBasicAsciiCharacterCount
    };
  }
  static computeUnicodeHighlightReason(char, options) {
    const codePointHighlighter = new CodePointHighlighter(options);
    const reason = codePointHighlighter.shouldHighlightNonBasicASCII(char, null);
    switch (reason) {
      case 0 /* None */:
        return null;
      case 2 /* Invisible */:
        return { kind: 1 /* Invisible */ };
      case 3 /* Ambiguous */: {
        const codePoint = char.codePointAt(0);
        const primaryConfusable = codePointHighlighter.ambiguousCharacters.getPrimaryConfusable(codePoint);
        const notAmbiguousInLocales = strings.AmbiguousCharacters.getLocales().filter(
          (l) => !strings.AmbiguousCharacters.getInstance(
            /* @__PURE__ */ new Set([...options.allowedLocales, l])
          ).isAmbiguous(codePoint)
        );
        return { kind: 0 /* Ambiguous */, confusableWith: String.fromCodePoint(primaryConfusable), notAmbiguousInLocales };
      }
      case 1 /* NonBasicASCII */:
        return { kind: 2 /* NonBasicAscii */ };
    }
  }
}
function buildRegExpCharClassExpr(codePoints, flags) {
  const src = `[${strings.escapeRegExpCharacters(
    codePoints.map((i) => String.fromCodePoint(i)).join("")
  )}]`;
  return src;
}
var UnicodeHighlighterReasonKind = /* @__PURE__ */ ((UnicodeHighlighterReasonKind2) => {
  UnicodeHighlighterReasonKind2[UnicodeHighlighterReasonKind2["Ambiguous"] = 0] = "Ambiguous";
  UnicodeHighlighterReasonKind2[UnicodeHighlighterReasonKind2["Invisible"] = 1] = "Invisible";
  UnicodeHighlighterReasonKind2[UnicodeHighlighterReasonKind2["NonBasicAscii"] = 2] = "NonBasicAscii";
  return UnicodeHighlighterReasonKind2;
})(UnicodeHighlighterReasonKind || {});
class CodePointHighlighter {
  constructor(options) {
    this.options = options;
    this.allowedCodePoints = new Set(options.allowedCodePoints);
    this.ambiguousCharacters = strings.AmbiguousCharacters.getInstance(new Set(options.allowedLocales));
  }
  getCandidateCodePoints() {
    if (this.options.nonBasicASCII) {
      return "allNonBasicAscii";
    }
    const set = /* @__PURE__ */ new Set();
    if (this.options.invisibleCharacters) {
      for (const cp of strings.InvisibleCharacters.codePoints) {
        if (!isAllowedInvisibleCharacter(String.fromCodePoint(cp))) {
          set.add(cp);
        }
      }
    }
    if (this.options.ambiguousCharacters) {
      for (const cp of this.ambiguousCharacters.getConfusableCodePoints()) {
        set.add(cp);
      }
    }
    for (const cp of this.allowedCodePoints) {
      set.delete(cp);
    }
    return set;
  }
  shouldHighlightNonBasicASCII(character, wordContext) {
    const codePoint = character.codePointAt(0);
    if (this.allowedCodePoints.has(codePoint)) {
      return 0 /* None */;
    }
    if (this.options.nonBasicASCII) {
      return 1 /* NonBasicASCII */;
    }
    let hasBasicASCIICharacters = false;
    let hasNonConfusableNonBasicAsciiCharacter = false;
    if (wordContext) {
      for (const char of wordContext) {
        const codePoint2 = char.codePointAt(0);
        const isBasicASCII = strings.isBasicASCII(char);
        hasBasicASCIICharacters = hasBasicASCIICharacters || isBasicASCII;
        if (!isBasicASCII && !this.ambiguousCharacters.isAmbiguous(codePoint2) && !strings.InvisibleCharacters.isInvisibleCharacter(codePoint2)) {
          hasNonConfusableNonBasicAsciiCharacter = true;
        }
      }
    }
    if (
      /* Don't allow mixing weird looking characters with ASCII */
      !hasBasicASCIICharacters && /* Is there an obviously weird looking character? */
      hasNonConfusableNonBasicAsciiCharacter
    ) {
      return 0 /* None */;
    }
    if (this.options.invisibleCharacters) {
      if (!isAllowedInvisibleCharacter(character) && strings.InvisibleCharacters.isInvisibleCharacter(codePoint)) {
        return 2 /* Invisible */;
      }
    }
    if (this.options.ambiguousCharacters) {
      if (this.ambiguousCharacters.isAmbiguous(codePoint)) {
        return 3 /* Ambiguous */;
      }
    }
    return 0 /* None */;
  }
}
function isAllowedInvisibleCharacter(character) {
  return character === " " || character === "\n" || character === "	";
}
var SimpleHighlightReason = /* @__PURE__ */ ((SimpleHighlightReason2) => {
  SimpleHighlightReason2[SimpleHighlightReason2["None"] = 0] = "None";
  SimpleHighlightReason2[SimpleHighlightReason2["NonBasicASCII"] = 1] = "NonBasicASCII";
  SimpleHighlightReason2[SimpleHighlightReason2["Invisible"] = 2] = "Invisible";
  SimpleHighlightReason2[SimpleHighlightReason2["Ambiguous"] = 3] = "Ambiguous";
  return SimpleHighlightReason2;
})(SimpleHighlightReason || {});
export {
  UnicodeHighlighterReasonKind,
  UnicodeTextModelHighlighter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcc2VydmljZXNcXHVuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlYXJjaGVyIH0gZnJvbSAnLi4vbW9kZWwvdGV4dE1vZGVsU2VhcmNoLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQgfSBmcm9tICcuL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX1dPUkRfUkVHRVhQLCBnZXRXb3JkQXRUZXh0IH0gZnJvbSAnLi4vY29yZS93b3JkSGVscGVyLmpzJztcblxuZXhwb3J0IGNsYXNzIFVuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlciB7XG5cdHB1YmxpYyBzdGF0aWMgY29tcHV0ZVVuaWNvZGVIaWdobGlnaHRzKG1vZGVsOiBJVW5pY29kZUNoYXJhY3RlclNlYXJjaGVyVGFyZ2V0LCBvcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zLCByYW5nZT86IElSYW5nZSk6IElVbmljb2RlSGlnaGxpZ2h0c1Jlc3VsdCB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gcmFuZ2UgPyByYW5nZS5zdGFydExpbmVOdW1iZXIgOiAxO1xuXHRcdGNvbnN0IGVuZExpbmUgPSByYW5nZSA/IHJhbmdlLmVuZExpbmVOdW1iZXIgOiBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblxuXHRcdGNvbnN0IGNvZGVQb2ludEhpZ2hsaWdodGVyID0gbmV3IENvZGVQb2ludEhpZ2hsaWdodGVyKG9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IGNvZGVQb2ludEhpZ2hsaWdodGVyLmdldENhbmRpZGF0ZUNvZGVQb2ludHMoKTtcblx0XHRsZXQgcmVnZXg6IFJlZ0V4cDtcblx0XHRpZiAoY2FuZGlkYXRlcyA9PT0gJ2FsbE5vbkJhc2ljQXNjaWknKSB7XG5cdFx0XHRyZWdleCA9IG5ldyBSZWdFeHAoJ1teXFxcXHRcXFxcblxcXFxyXFxcXHgyMC1cXFxceDdFXScsICdnJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlZ2V4ID0gbmV3IFJlZ0V4cChgJHtidWlsZFJlZ0V4cENoYXJDbGFzc0V4cHIoQXJyYXkuZnJvbShjYW5kaWRhdGVzKSl9YCwgJ2cnKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWFyY2hlciA9IG5ldyBTZWFyY2hlcihudWxsLCByZWdleCk7XG5cdFx0Y29uc3QgcmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdFx0bGV0IGhhc01vcmUgPSBmYWxzZTtcblx0XHRsZXQgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuXHRcdGxldCBhbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudCA9IDA7XG5cdFx0bGV0IGludmlzaWJsZUNoYXJhY3RlckNvdW50ID0gMDtcblx0XHRsZXQgbm9uQmFzaWNBc2NpaUNoYXJhY3RlckNvdW50ID0gMDtcblxuXHRcdGZvckxvb3A6XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHN0YXJ0TGluZSwgbGluZUNvdW50ID0gZW5kTGluZTsgbGluZU51bWJlciA8PSBsaW5lQ291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSBsaW5lQ29udGVudC5sZW5ndGg7XG5cblx0XHRcdC8vIFJlc2V0IHJlZ2V4IHRvIHNlYXJjaCBmcm9tIHRoZSBiZWdpbm5pbmdcblx0XHRcdHNlYXJjaGVyLnJlc2V0KDApO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRtID0gc2VhcmNoZXIubmV4dChsaW5lQ29udGVudCk7XG5cdFx0XHRcdGlmIChtKSB7XG5cdFx0XHRcdFx0bGV0IHN0YXJ0SW5kZXggPSBtLmluZGV4O1xuXHRcdFx0XHRcdGxldCBlbmRJbmRleCA9IG0uaW5kZXggKyBtWzBdLmxlbmd0aDtcblxuXHRcdFx0XHRcdC8vIEV4dGVuZCByYW5nZSB0byBlbnRpcmUgY29kZSBwb2ludFxuXHRcdFx0XHRcdGlmIChzdGFydEluZGV4ID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhckNvZGVCZWZvcmUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KHN0YXJ0SW5kZXggLSAxKTtcblx0XHRcdFx0XHRcdGlmIChzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShjaGFyQ29kZUJlZm9yZSkpIHtcblx0XHRcdFx0XHRcdFx0c3RhcnRJbmRleC0tO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW5kSW5kZXggKyAxIDwgbGluZUxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhckNvZGVCZWZvcmUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGVuZEluZGV4IC0gMSk7XG5cdFx0XHRcdFx0XHRpZiAoc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVCZWZvcmUpKSB7XG5cdFx0XHRcdFx0XHRcdGVuZEluZGV4Kys7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHN0ciA9IGxpbmVDb250ZW50LnN1YnN0cmluZyhzdGFydEluZGV4LCBlbmRJbmRleCk7XG5cdFx0XHRcdFx0bGV0IHdvcmQgPSBnZXRXb3JkQXRUZXh0KHN0YXJ0SW5kZXggKyAxLCBERUZBVUxUX1dPUkRfUkVHRVhQLCBsaW5lQ29udGVudCwgMCk7XG5cdFx0XHRcdFx0aWYgKHdvcmQgJiYgd29yZC5lbmRDb2x1bW4gPD0gc3RhcnRJbmRleCArIDEpIHtcblx0XHRcdFx0XHRcdC8vIFRoZSB3b3JkIGRvZXMgbm90IGluY2x1ZGUgdGhlIHByb2JsZW1hdGljIGNoYXJhY3RlciwgaWdub3JlIHRoZSB3b3JkXG5cdFx0XHRcdFx0XHR3b3JkID0gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgaGlnaGxpZ2h0UmVhc29uID0gY29kZVBvaW50SGlnaGxpZ2h0ZXIuc2hvdWxkSGlnaGxpZ2h0Tm9uQmFzaWNBU0NJSShzdHIsIHdvcmQgPyB3b3JkLndvcmQgOiBudWxsKTtcblxuXHRcdFx0XHRcdGlmIChoaWdobGlnaHRSZWFzb24gIT09IFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5Ob25lKSB7XG5cdFx0XHRcdFx0XHRpZiAoaGlnaGxpZ2h0UmVhc29uID09PSBTaW1wbGVIaWdobGlnaHRSZWFzb24uQW1iaWd1b3VzKSB7XG5cdFx0XHRcdFx0XHRcdGFtYmlndW91c0NoYXJhY3RlckNvdW50Kys7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGhpZ2hsaWdodFJlYXNvbiA9PT0gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLkludmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0XHRpbnZpc2libGVDaGFyYWN0ZXJDb3VudCsrO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChoaWdobGlnaHRSZWFzb24gPT09IFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5Ob25CYXNpY0FTQ0lJKSB7XG5cdFx0XHRcdFx0XHRcdG5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJDb3VudCsrO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0TmV2ZXIoaGlnaGxpZ2h0UmVhc29uKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgTUFYX1JFU1VMVF9MRU5HVEggPSAxMDAwO1xuXHRcdFx0XHRcdFx0aWYgKHJhbmdlcy5sZW5ndGggPj0gTUFYX1JFU1VMVF9MRU5HVEgpIHtcblx0XHRcdFx0XHRcdFx0aGFzTW9yZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGJyZWFrIGZvckxvb3A7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJhbmdlcy5wdXNoKG5ldyBSYW5nZShsaW5lTnVtYmVyLCBzdGFydEluZGV4ICsgMSwgbGluZU51bWJlciwgZW5kSW5kZXggKyAxKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlIChtKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlcyxcblx0XHRcdGhhc01vcmUsXG5cdFx0XHRhbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudCxcblx0XHRcdGludmlzaWJsZUNoYXJhY3RlckNvdW50LFxuXHRcdFx0bm9uQmFzaWNBc2NpaUNoYXJhY3RlckNvdW50XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29tcHV0ZVVuaWNvZGVIaWdobGlnaHRSZWFzb24oY2hhcjogc3RyaW5nLCBvcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zKTogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uIHwgbnVsbCB7XG5cdFx0Y29uc3QgY29kZVBvaW50SGlnaGxpZ2h0ZXIgPSBuZXcgQ29kZVBvaW50SGlnaGxpZ2h0ZXIob3B0aW9ucyk7XG5cblx0XHRjb25zdCByZWFzb24gPSBjb2RlUG9pbnRIaWdobGlnaHRlci5zaG91bGRIaWdobGlnaHROb25CYXNpY0FTQ0lJKGNoYXIsIG51bGwpO1xuXHRcdHN3aXRjaCAocmVhc29uKSB7XG5cdFx0XHRjYXNlIFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5Ob25lOlxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdGNhc2UgU2ltcGxlSGlnaGxpZ2h0UmVhc29uLkludmlzaWJsZTpcblx0XHRcdFx0cmV0dXJuIHsga2luZDogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5JbnZpc2libGUgfTtcblxuXHRcdFx0Y2FzZSBTaW1wbGVIaWdobGlnaHRSZWFzb24uQW1iaWd1b3VzOiB7XG5cdFx0XHRcdGNvbnN0IGNvZGVQb2ludCA9IGNoYXIuY29kZVBvaW50QXQoMCkhO1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5Q29uZnVzYWJsZSA9IGNvZGVQb2ludEhpZ2hsaWdodGVyLmFtYmlndW91c0NoYXJhY3RlcnMuZ2V0UHJpbWFyeUNvbmZ1c2FibGUoY29kZVBvaW50KSE7XG5cdFx0XHRcdGNvbnN0IG5vdEFtYmlndW91c0luTG9jYWxlcyA9XG5cdFx0XHRcdFx0c3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldExvY2FsZXMoKS5maWx0ZXIoXG5cdFx0XHRcdFx0XHQobCkgPT5cblx0XHRcdFx0XHRcdFx0IXN0cmluZ3MuQW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRJbnN0YW5jZShcblx0XHRcdFx0XHRcdFx0XHRuZXcgU2V0KFsuLi5vcHRpb25zLmFsbG93ZWRMb2NhbGVzLCBsXSlcblx0XHRcdFx0XHRcdFx0KS5pc0FtYmlndW91cyhjb2RlUG9pbnQpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5BbWJpZ3VvdXMsIGNvbmZ1c2FibGVXaXRoOiBTdHJpbmcuZnJvbUNvZGVQb2ludChwcmltYXJ5Q29uZnVzYWJsZSksIG5vdEFtYmlndW91c0luTG9jYWxlcyB9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBTaW1wbGVIaWdobGlnaHRSZWFzb24uTm9uQmFzaWNBU0NJSTpcblx0XHRcdFx0cmV0dXJuIHsga2luZDogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5Ob25CYXNpY0FzY2lpIH07XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUmVnRXhwQ2hhckNsYXNzRXhwcihjb2RlUG9pbnRzOiBudW1iZXJbXSwgZmxhZ3M/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzcmMgPSBgWyR7c3RyaW5ncy5lc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKFxuXHRcdGNvZGVQb2ludHMubWFwKChpKSA9PiBTdHJpbmcuZnJvbUNvZGVQb2ludChpKSkuam9pbignJylcblx0KX1dYDtcblx0cmV0dXJuIHNyYztcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZCB7XG5cdEFtYmlndW91cywgSW52aXNpYmxlLCBOb25CYXNpY0FzY2lpXG59XG5cbmV4cG9ydCB0eXBlIFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbiA9IHtcblx0a2luZDogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5BbWJpZ3VvdXM7XG5cdGNvbmZ1c2FibGVXaXRoOiBzdHJpbmc7XG5cdG5vdEFtYmlndW91c0luTG9jYWxlczogc3RyaW5nW107XG59IHwge1xuXHRraW5kOiBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLkludmlzaWJsZTtcbn0gfCB7XG5cdGtpbmQ6IFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQuTm9uQmFzaWNBc2NpaTtcbn07XG5cbmNsYXNzIENvZGVQb2ludEhpZ2hsaWdodGVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBhbGxvd2VkQ29kZVBvaW50czogU2V0PG51bWJlcj47XG5cdHB1YmxpYyByZWFkb25seSBhbWJpZ3VvdXNDaGFyYWN0ZXJzOiBzdHJpbmdzLkFtYmlndW91c0NoYXJhY3RlcnM7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucykge1xuXHRcdHRoaXMuYWxsb3dlZENvZGVQb2ludHMgPSBuZXcgU2V0KG9wdGlvbnMuYWxsb3dlZENvZGVQb2ludHMpO1xuXHRcdHRoaXMuYW1iaWd1b3VzQ2hhcmFjdGVycyA9IHN0cmluZ3MuQW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRJbnN0YW5jZShuZXcgU2V0KG9wdGlvbnMuYWxsb3dlZExvY2FsZXMpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDYW5kaWRhdGVDb2RlUG9pbnRzKCk6IFNldDxudW1iZXI+IHwgJ2FsbE5vbkJhc2ljQXNjaWknIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLm5vbkJhc2ljQVNDSUkpIHtcblx0XHRcdHJldHVybiAnYWxsTm9uQmFzaWNBc2NpaSc7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2V0ID0gbmV3IFNldDxudW1iZXI+KCk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmludmlzaWJsZUNoYXJhY3RlcnMpIHtcblx0XHRcdGZvciAoY29uc3QgY3Agb2Ygc3RyaW5ncy5JbnZpc2libGVDaGFyYWN0ZXJzLmNvZGVQb2ludHMpIHtcblx0XHRcdFx0aWYgKCFpc0FsbG93ZWRJbnZpc2libGVDaGFyYWN0ZXIoU3RyaW5nLmZyb21Db2RlUG9pbnQoY3ApKSkge1xuXHRcdFx0XHRcdHNldC5hZGQoY3ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5hbWJpZ3VvdXNDaGFyYWN0ZXJzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNwIG9mIHRoaXMuYW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRDb25mdXNhYmxlQ29kZVBvaW50cygpKSB7XG5cdFx0XHRcdHNldC5hZGQoY3ApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY3Agb2YgdGhpcy5hbGxvd2VkQ29kZVBvaW50cykge1xuXHRcdFx0c2V0LmRlbGV0ZShjcCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNldDtcblx0fVxuXG5cdHB1YmxpYyBzaG91bGRIaWdobGlnaHROb25CYXNpY0FTQ0lJKGNoYXJhY3Rlcjogc3RyaW5nLCB3b3JkQ29udGV4dDogc3RyaW5nIHwgbnVsbCk6IFNpbXBsZUhpZ2hsaWdodFJlYXNvbiB7XG5cdFx0Y29uc3QgY29kZVBvaW50ID0gY2hhcmFjdGVyLmNvZGVQb2ludEF0KDApITtcblxuXHRcdGlmICh0aGlzLmFsbG93ZWRDb2RlUG9pbnRzLmhhcyhjb2RlUG9pbnQpKSB7XG5cdFx0XHRyZXR1cm4gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLk5vbmU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5ub25CYXNpY0FTQ0lJKSB7XG5cdFx0XHRyZXR1cm4gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLk5vbkJhc2ljQVNDSUk7XG5cdFx0fVxuXG5cdFx0bGV0IGhhc0Jhc2ljQVNDSUlDaGFyYWN0ZXJzID0gZmFsc2U7XG5cdFx0bGV0IGhhc05vbkNvbmZ1c2FibGVOb25CYXNpY0FzY2lpQ2hhcmFjdGVyID0gZmFsc2U7XG5cdFx0aWYgKHdvcmRDb250ZXh0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoYXIgb2Ygd29yZENvbnRleHQpIHtcblx0XHRcdFx0Y29uc3QgY29kZVBvaW50ID0gY2hhci5jb2RlUG9pbnRBdCgwKSE7XG5cdFx0XHRcdGNvbnN0IGlzQmFzaWNBU0NJSSA9IHN0cmluZ3MuaXNCYXNpY0FTQ0lJKGNoYXIpO1xuXHRcdFx0XHRoYXNCYXNpY0FTQ0lJQ2hhcmFjdGVycyA9IGhhc0Jhc2ljQVNDSUlDaGFyYWN0ZXJzIHx8IGlzQmFzaWNBU0NJSTtcblxuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0IWlzQmFzaWNBU0NJSSAmJlxuXHRcdFx0XHRcdCF0aGlzLmFtYmlndW91c0NoYXJhY3RlcnMuaXNBbWJpZ3VvdXMoY29kZVBvaW50KSAmJlxuXHRcdFx0XHRcdCFzdHJpbmdzLkludmlzaWJsZUNoYXJhY3RlcnMuaXNJbnZpc2libGVDaGFyYWN0ZXIoY29kZVBvaW50KVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRoYXNOb25Db25mdXNhYmxlTm9uQmFzaWNBc2NpaUNoYXJhY3RlciA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHQvKiBEb24ndCBhbGxvdyBtaXhpbmcgd2VpcmQgbG9va2luZyBjaGFyYWN0ZXJzIHdpdGggQVNDSUkgKi8gIWhhc0Jhc2ljQVNDSUlDaGFyYWN0ZXJzICYmXG5cdFx0XHQvKiBJcyB0aGVyZSBhbiBvYnZpb3VzbHkgd2VpcmQgbG9va2luZyBjaGFyYWN0ZXI/ICovIGhhc05vbkNvbmZ1c2FibGVOb25CYXNpY0FzY2lpQ2hhcmFjdGVyXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gU2ltcGxlSGlnaGxpZ2h0UmVhc29uLk5vbmU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5pbnZpc2libGVDaGFyYWN0ZXJzKSB7XG5cdFx0XHQvLyBUT0RPIGNoZWNrIGZvciBlbW9qaXNcblx0XHRcdGlmICghaXNBbGxvd2VkSW52aXNpYmxlQ2hhcmFjdGVyKGNoYXJhY3RlcikgJiYgc3RyaW5ncy5JbnZpc2libGVDaGFyYWN0ZXJzLmlzSW52aXNpYmxlQ2hhcmFjdGVyKGNvZGVQb2ludCkpIHtcblx0XHRcdFx0cmV0dXJuIFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5JbnZpc2libGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5hbWJpZ3VvdXNDaGFyYWN0ZXJzKSB7XG5cdFx0XHRpZiAodGhpcy5hbWJpZ3VvdXNDaGFyYWN0ZXJzLmlzQW1iaWd1b3VzKGNvZGVQb2ludCkpIHtcblx0XHRcdFx0cmV0dXJuIFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5BbWJpZ3VvdXM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFNpbXBsZUhpZ2hsaWdodFJlYXNvbi5Ob25lO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzQWxsb3dlZEludmlzaWJsZUNoYXJhY3RlcihjaGFyYWN0ZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY2hhcmFjdGVyID09PSAnICcgfHwgY2hhcmFjdGVyID09PSAnXFxuJyB8fCBjaGFyYWN0ZXIgPT09ICdcXHQnO1xufVxuXG5jb25zdCBlbnVtIFNpbXBsZUhpZ2hsaWdodFJlYXNvbiB7XG5cdE5vbmUsXG5cdE5vbkJhc2ljQVNDSUksXG5cdEludmlzaWJsZSxcblx0QW1iaWd1b3VzXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVVuaWNvZGVDaGFyYWN0ZXJTZWFyY2hlclRhcmdldCB7XG5cdGdldExpbmVDb3VudCgpOiBudW1iZXI7XG5cdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zIHtcblx0bm9uQmFzaWNBU0NJSTogYm9vbGVhbjtcblx0YW1iaWd1b3VzQ2hhcmFjdGVyczogYm9vbGVhbjtcblx0aW52aXNpYmxlQ2hhcmFjdGVyczogYm9vbGVhbjtcblx0aW5jbHVkZUNvbW1lbnRzOiBib29sZWFuO1xuXHRpbmNsdWRlU3RyaW5nczogYm9vbGVhbjtcblx0YWxsb3dlZENvZGVQb2ludHM6IG51bWJlcltdO1xuXHRhbGxvd2VkTG9jYWxlczogc3RyaW5nW107XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFpQixhQUFhO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUV6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQixxQkFBcUI7QUFFNUMsTUFBTSw0QkFBNEI7QUFBQSxFQUN4QyxPQUFjLHlCQUF5QixPQUF3QyxTQUFvQyxPQUEwQztBQUM1SixVQUFNLFlBQVksUUFBUSxNQUFNLGtCQUFrQjtBQUNsRCxVQUFNLFVBQVUsUUFBUSxNQUFNLGdCQUFnQixNQUFNLGFBQWE7QUFFakUsVUFBTSx1QkFBdUIs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QSxRQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssUUFBUSxxQkFBcUI7QUFDckMsaUJBQVcsTUFBTSxLQUFLLG9CQUFvQix3QkFBd0IsR0FBRztBQUNwRSxZQUFJLElBQUksRUFBRTtBQUFBLE1BQ1g7QUFBQSxJQUNEO0FBRUEsZUFBVyxNQUFNLEtBQUssbUJBQW1CO0FBQ3hDLFVBQUksT0FBTyxFQUFFO0FBQUEsSUFDZDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyw2QkFBNkIsV0FBbUIsYUFBbUQ7QUFDekcsVUFBTSxZQUFZLFVBQVUsWUFBWSxDQUFDO0FBRXpDLFFBQUksS0FBSyxrQkFBa0IsSUFBSSxTQUFTLEdBQUc7QUFDMUMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssUUFBUSxlQUFlO0FBQy9CLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSwwQkFBMEI7QUFDOUIsUUFBSSx5Q0FBeUM7QUFDN0MsUUFBSSxhQUFhO0FBQ2hCLGlCQUFXLFFBQVEsYUFBYTtBQUMvQixjQUFNQyxhQUFZLEtBQUssWUFBWSxDQUFDO0FBQ3BDLGNBQU0sZUFBZSxRQUFRLGFBQWEsSUFBSTtBQUM5QyxrQ0FBMEIsMkJBQTJCO0FBRXJELFlBQ0MsQ0FBQyxnQkFDRCxDQUFDLEtBQUssb0JBQW9CLFlBQVlBLFVBQVMsS0FDL0MsQ0FBQyxRQUFRLG9CQUFvQixxQkFBcUJBLFVBQVMsR0FDMUQ7QUFDRCxtREFBeUM7QUFBQSxRQUMxQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUE7QUFBQTtBQUFBLE1BQzhELENBQUM7QUFBQSxNQUNUO0FBQUEsTUFDcEQ7QUFDRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyxRQUFRLHFCQUFxQjtBQUVyQyxVQUFJLENBQUMsNEJBQTRCLFNBQVMsS0FBSyxRQUFRLG9CQUFvQixxQkFBcUIsU0FBUyxHQUFHO0FBQzNHLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxRQUFRLHFCQUFxQjtBQUNyQyxVQUFJLEtBQUssb0JBQW9CLFlBQVksU0FBUyxHQUFHO0FBQ3BELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLDRCQUE0QixXQUE0QjtBQUNoRSxTQUFPLGNBQWMsT0FBTyxjQUFjLFFBQVEsY0FBYztBQUNqRTtBQUVBLElBQVcsd0JBQVgsa0JBQVdDLDJCQUFYO0FBQ0MsRUFBQUEsOENBQUE7QUFDQSxFQUFBQSw4Q0FBQTtBQUNBLEVBQUFBLDhDQUFBO0FBQ0EsRUFBQUEsOENBQUE7QUFKVSxTQUFBQTtBQUFBLEdBQUE7IiwKICAibmFtZXMiOiBbIlVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQiLCAiY29kZVBvaW50IiwgIlNpbXBsZUhpZ2hsaWdodFJlYXNvbiJdCn0K
