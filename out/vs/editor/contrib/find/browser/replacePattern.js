import { CharCode } from "../../../../base/common/charCode.js";
import { buildReplaceStringWithCasePreserved } from "../../../../base/common/search.js";
var ReplacePatternKind = /* @__PURE__ */ ((ReplacePatternKind2) => {
  ReplacePatternKind2[ReplacePatternKind2["StaticValue"] = 0] = "StaticValue";
  ReplacePatternKind2[ReplacePatternKind2["DynamicPieces"] = 1] = "DynamicPieces";
  return ReplacePatternKind2;
})(ReplacePatternKind || {});
class StaticValueReplacePattern {
  constructor(staticValue) {
    this.staticValue = staticValue;
    this.kind = 0 /* StaticValue */;
  }
}
class DynamicPiecesReplacePattern {
  constructor(pieces) {
    this.pieces = pieces;
    this.kind = 1 /* DynamicPieces */;
  }
}
class ReplacePattern {
  static fromStaticValue(value) {
    return new ReplacePattern([ReplacePiece.staticValue(value)]);
  }
  get hasReplacementPatterns() {
    return this._state.kind === 1 /* DynamicPieces */;
  }
  constructor(pieces) {
    if (!pieces || pieces.length === 0) {
      this._state = new StaticValueReplacePattern("");
    } else if (pieces.length === 1 && pieces[0].staticValue !== null) {
      this._state = new StaticValueReplacePattern(pieces[0].staticValue);
    } else {
      this._state = new DynamicPiecesReplacePattern(pieces);
    }
  }
  buildReplaceString(matches, preserveCase) {
    if (this._state.kind === 0 /* StaticValue */) {
      if (preserveCase) {
        return buildReplaceStringWithCasePreserved(matches, this._state.staticValue);
      } else {
        return this._state.staticValue;
      }
    }
    let result = "";
    for (let i = 0, len = this._state.pieces.length; i < len; i++) {
      const piece = this._state.pieces[i];
      if (piece.staticValue !== null) {
        result += piece.staticValue;
        continue;
      }
      let match = ReplacePattern._substitute(piece.matchIndex, matches);
      if (piece.caseOps !== null && piece.caseOps.length > 0) {
        const repl = [];
        const lenOps = piece.caseOps.length;
        let opIdx = 0;
        for (let idx = 0, len2 = match.length; idx < len2; idx++) {
          if (opIdx >= lenOps) {
            repl.push(match.slice(idx));
            break;
          }
          switch (piece.caseOps[opIdx]) {
            case "U":
              repl.push(match[idx].toUpperCase());
              break;
            case "u":
              repl.push(match[idx].toUpperCase());
              opIdx++;
              break;
            case "L":
              repl.push(match[idx].toLowerCase());
              break;
            case "l":
              repl.push(match[idx].toLowerCase());
              opIdx++;
              break;
            default:
              repl.push(match[idx]);
          }
        }
        match = repl.join("");
      }
      result += match;
    }
    return result;
  }
  static _substitute(matchIndex, matches) {
    if (matches === null) {
      return "";
    }
    if (matchIndex === 0) {
      return matches[0];
    }
    let remainder = "";
    while (matchIndex > 0) {
      if (matchIndex < matches.length) {
        const match = matches[matchIndex] || "";
        return match + remainder;
      }
      remainder = String(matchIndex % 10) + remainder;
      matchIndex = Math.floor(matchIndex / 10);
    }
    return "$" + remainder;
  }
}
class ReplacePiece {
  static staticValue(value) {
    return new ReplacePiece(value, -1, null);
  }
  static matchIndex(index) {
    return new ReplacePiece(null, index, null);
  }
  static caseOps(index, caseOps) {
    return new ReplacePiece(null, index, caseOps);
  }
  constructor(staticValue, matchIndex, caseOps) {
    this.staticValue = staticValue;
    this.matchIndex = matchIndex;
    if (!caseOps || caseOps.length === 0) {
      this.caseOps = null;
    } else {
      this.caseOps = caseOps.slice(0);
    }
  }
}
class ReplacePieceBuilder {
  constructor(source) {
    this._source = source;
    this._lastCharIndex = 0;
    this._result = [];
    this._resultLen = 0;
    this._currentStaticPiece = "";
  }
  emitUnchanged(toCharIndex) {
    this._emitStatic(this._source.substring(this._lastCharIndex, toCharIndex));
    this._lastCharIndex = toCharIndex;
  }
  emitStatic(value, toCharIndex) {
    this._emitStatic(value);
    this._lastCharIndex = toCharIndex;
  }
  _emitStatic(value) {
    if (value.length === 0) {
      return;
    }
    this._currentStaticPiece += value;
  }
  emitMatchIndex(index, toCharIndex, caseOps) {
    if (this._currentStaticPiece.length !== 0) {
      this._result[this._resultLen++] = ReplacePiece.staticValue(this._currentStaticPiece);
      this._currentStaticPiece = "";
    }
    this._result[this._resultLen++] = ReplacePiece.caseOps(index, caseOps);
    this._lastCharIndex = toCharIndex;
  }
  finalize() {
    this.emitUnchanged(this._source.length);
    if (this._currentStaticPiece.length !== 0) {
      this._result[this._resultLen++] = ReplacePiece.staticValue(this._currentStaticPiece);
      this._currentStaticPiece = "";
    }
    return new ReplacePattern(this._result);
  }
}
function parseReplaceString(replaceString) {
  if (!replaceString || replaceString.length === 0) {
    return new ReplacePattern(null);
  }
  const caseOps = [];
  const result = new ReplacePieceBuilder(replaceString);
  for (let i = 0, len = replaceString.length; i < len; i++) {
    const chCode = replaceString.charCodeAt(i);
    if (chCode === CharCode.Backslash) {
      i++;
      if (i >= len) {
        break;
      }
      const nextChCode = replaceString.charCodeAt(i);
      switch (nextChCode) {
        case CharCode.Backslash:
          result.emitUnchanged(i - 1);
          result.emitStatic("\\", i + 1);
          break;
        case CharCode.n:
          result.emitUnchanged(i - 1);
          result.emitStatic("\n", i + 1);
          break;
        case CharCode.t:
          result.emitUnchanged(i - 1);
          result.emitStatic("	", i + 1);
          break;
        // Case modification of string replacements, patterned after Boost, but only applied
        // to the replacement text, not subsequent content.
        case CharCode.u:
        // \u => upper-cases one character.
        case CharCode.U:
        // \U => upper-cases ALL following characters.
        case CharCode.l:
        // \l => lower-cases one character.
        case CharCode.L:
          result.emitUnchanged(i - 1);
          result.emitStatic("", i + 1);
          caseOps.push(String.fromCharCode(nextChCode));
          break;
      }
      continue;
    }
    if (chCode === CharCode.DollarSign) {
      i++;
      if (i >= len) {
        break;
      }
      const nextChCode = replaceString.charCodeAt(i);
      if (nextChCode === CharCode.DollarSign) {
        result.emitUnchanged(i - 1);
        result.emitStatic("$", i + 1);
        continue;
      }
      if (nextChCode === CharCode.Digit0 || nextChCode === CharCode.Ampersand) {
        result.emitUnchanged(i - 1);
        result.emitMatchIndex(0, i + 1, caseOps);
        caseOps.length = 0;
        continue;
      }
      if (CharCode.Digit1 <= nextChCode && nextChCode <= CharCode.Digit9) {
        let matchIndex = nextChCode - CharCode.Digit0;
        if (i + 1 < len) {
          const nextNextChCode = replaceString.charCodeAt(i + 1);
          if (CharCode.Digit0 <= nextNextChCode && nextNextChCode <= CharCode.Digit9) {
            i++;
            matchIndex = matchIndex * 10 + (nextNextChCode - CharCode.Digit0);
            result.emitUnchanged(i - 2);
            result.emitMatchIndex(matchIndex, i + 1, caseOps);
            caseOps.length = 0;
            continue;
          }
        }
        result.emitUnchanged(i - 1);
        result.emitMatchIndex(matchIndex, i + 1, caseOps);
        caseOps.length = 0;
        continue;
      }
    }
  }
  return result.finalize();
}
export {
  ReplacePattern,
  ReplacePiece,
  parseReplaceString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZpbmRcXGJyb3dzZXJcXHJlcGxhY2VQYXR0ZXJuLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBidWlsZFJlcGxhY2VTdHJpbmdXaXRoQ2FzZVByZXNlcnZlZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlYXJjaC5qcyc7XG5cbmNvbnN0IGVudW0gUmVwbGFjZVBhdHRlcm5LaW5kIHtcblx0U3RhdGljVmFsdWUgPSAwLFxuXHREeW5hbWljUGllY2VzID0gMVxufVxuXG4vKipcbiAqIEFzc2lnbmVkIHdoZW4gdGhlIHJlcGxhY2UgcGF0dGVybiBpcyBlbnRpcmVseSBzdGF0aWMuXG4gKi9cbmNsYXNzIFN0YXRpY1ZhbHVlUmVwbGFjZVBhdHRlcm4ge1xuXHRwdWJsaWMgcmVhZG9ubHkga2luZCA9IFJlcGxhY2VQYXR0ZXJuS2luZC5TdGF0aWNWYWx1ZTtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHN0YXRpY1ZhbHVlOiBzdHJpbmcpIHsgfVxufVxuXG4vKipcbiAqIEFzc2lnbmVkIHdoZW4gdGhlIHJlcGxhY2UgcGF0dGVybiBoYXMgcmVwbGFjZW1lbnQgcGF0dGVybnMuXG4gKi9cbmNsYXNzIER5bmFtaWNQaWVjZXNSZXBsYWNlUGF0dGVybiB7XG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gUmVwbGFjZVBhdHRlcm5LaW5kLkR5bmFtaWNQaWVjZXM7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBwaWVjZXM6IFJlcGxhY2VQaWVjZVtdKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxhY2VQYXR0ZXJuIHtcblxuXHRwdWJsaWMgc3RhdGljIGZyb21TdGF0aWNWYWx1ZSh2YWx1ZTogc3RyaW5nKTogUmVwbGFjZVBhdHRlcm4ge1xuXHRcdHJldHVybiBuZXcgUmVwbGFjZVBhdHRlcm4oW1JlcGxhY2VQaWVjZS5zdGF0aWNWYWx1ZSh2YWx1ZSldKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlOiBTdGF0aWNWYWx1ZVJlcGxhY2VQYXR0ZXJuIHwgRHluYW1pY1BpZWNlc1JlcGxhY2VQYXR0ZXJuO1xuXG5cdHB1YmxpYyBnZXQgaGFzUmVwbGFjZW1lbnRQYXR0ZXJucygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX3N0YXRlLmtpbmQgPT09IFJlcGxhY2VQYXR0ZXJuS2luZC5EeW5hbWljUGllY2VzKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHBpZWNlczogUmVwbGFjZVBpZWNlW10gfCBudWxsKSB7XG5cdFx0aWYgKCFwaWVjZXMgfHwgcGllY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBuZXcgU3RhdGljVmFsdWVSZXBsYWNlUGF0dGVybignJyk7XG5cdFx0fSBlbHNlIGlmIChwaWVjZXMubGVuZ3RoID09PSAxICYmIHBpZWNlc1swXS5zdGF0aWNWYWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBuZXcgU3RhdGljVmFsdWVSZXBsYWNlUGF0dGVybihwaWVjZXNbMF0uc3RhdGljVmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IG5ldyBEeW5hbWljUGllY2VzUmVwbGFjZVBhdHRlcm4ocGllY2VzKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYnVpbGRSZXBsYWNlU3RyaW5nKG1hdGNoZXM6IHN0cmluZ1tdIHwgbnVsbCwgcHJlc2VydmVDYXNlPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IFJlcGxhY2VQYXR0ZXJuS2luZC5TdGF0aWNWYWx1ZSkge1xuXHRcdFx0aWYgKHByZXNlcnZlQ2FzZSkge1xuXHRcdFx0XHRyZXR1cm4gYnVpbGRSZXBsYWNlU3RyaW5nV2l0aENhc2VQcmVzZXJ2ZWQobWF0Y2hlcywgdGhpcy5fc3RhdGUuc3RhdGljVmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXRlLnN0YXRpY1ZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXN1bHQgPSAnJztcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fc3RhdGUucGllY2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBwaWVjZSA9IHRoaXMuX3N0YXRlLnBpZWNlc1tpXTtcblx0XHRcdGlmIChwaWVjZS5zdGF0aWNWYWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0XHQvLyBzdGF0aWMgdmFsdWUgUmVwbGFjZVBpZWNlXG5cdFx0XHRcdHJlc3VsdCArPSBwaWVjZS5zdGF0aWNWYWx1ZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG1hdGNoIGluZGV4IFJlcGxhY2VQaWVjZVxuXHRcdFx0bGV0IG1hdGNoOiBzdHJpbmcgPSBSZXBsYWNlUGF0dGVybi5fc3Vic3RpdHV0ZShwaWVjZS5tYXRjaEluZGV4LCBtYXRjaGVzKTtcblx0XHRcdGlmIChwaWVjZS5jYXNlT3BzICE9PSBudWxsICYmIHBpZWNlLmNhc2VPcHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCByZXBsOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBsZW5PcHM6IG51bWJlciA9IHBpZWNlLmNhc2VPcHMubGVuZ3RoO1xuXHRcdFx0XHRsZXQgb3BJZHg6IG51bWJlciA9IDA7XG5cdFx0XHRcdGZvciAobGV0IGlkeDogbnVtYmVyID0gMCwgbGVuOiBudW1iZXIgPSBtYXRjaC5sZW5ndGg7IGlkeCA8IGxlbjsgaWR4KyspIHtcblx0XHRcdFx0XHRpZiAob3BJZHggPj0gbGVuT3BzKSB7XG5cdFx0XHRcdFx0XHRyZXBsLnB1c2gobWF0Y2guc2xpY2UoaWR4KSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c3dpdGNoIChwaWVjZS5jYXNlT3BzW29wSWR4XSkge1xuXHRcdFx0XHRcdFx0Y2FzZSAnVSc6XG5cdFx0XHRcdFx0XHRcdHJlcGwucHVzaChtYXRjaFtpZHhdLnRvVXBwZXJDYXNlKCkpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgJ3UnOlxuXHRcdFx0XHRcdFx0XHRyZXBsLnB1c2gobWF0Y2hbaWR4XS50b1VwcGVyQ2FzZSgpKTtcblx0XHRcdFx0XHRcdFx0b3BJZHgrKztcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlICdMJzpcblx0XHRcdFx0XHRcdFx0cmVwbC5wdXNoKG1hdGNoW2lkeF0udG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAnbCc6XG5cdFx0XHRcdFx0XHRcdHJlcGwucHVzaChtYXRjaFtpZHhdLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHRcdFx0XHRvcElkeCsrO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdHJlcGwucHVzaChtYXRjaFtpZHhdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0bWF0Y2ggPSByZXBsLmpvaW4oJycpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0ICs9IG1hdGNoO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc3Vic3RpdHV0ZShtYXRjaEluZGV4OiBudW1iZXIsIG1hdGNoZXM6IHN0cmluZ1tdIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0aWYgKG1hdGNoZXMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKG1hdGNoSW5kZXggPT09IDApIHtcblx0XHRcdHJldHVybiBtYXRjaGVzWzBdO1xuXHRcdH1cblxuXHRcdGxldCByZW1haW5kZXIgPSAnJztcblx0XHR3aGlsZSAobWF0Y2hJbmRleCA+IDApIHtcblx0XHRcdGlmIChtYXRjaEluZGV4IDwgbWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gQSBtYXRjaCBjYW4gYmUgdW5kZWZpbmVkXG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gKG1hdGNoZXNbbWF0Y2hJbmRleF0gfHwgJycpO1xuXHRcdFx0XHRyZXR1cm4gbWF0Y2ggKyByZW1haW5kZXI7XG5cdFx0XHR9XG5cdFx0XHRyZW1haW5kZXIgPSBTdHJpbmcobWF0Y2hJbmRleCAlIDEwKSArIHJlbWFpbmRlcjtcblx0XHRcdG1hdGNoSW5kZXggPSBNYXRoLmZsb29yKG1hdGNoSW5kZXggLyAxMCk7XG5cdFx0fVxuXHRcdHJldHVybiAnJCcgKyByZW1haW5kZXI7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHJlcGxhY2UgcGllY2UgY2FuIGVpdGhlciBiZSBhIHN0YXRpYyBzdHJpbmcgb3IgYW4gaW5kZXggdG8gYSBzcGVjaWZpYyBtYXRjaC5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlcGxhY2VQaWVjZSB7XG5cblx0cHVibGljIHN0YXRpYyBzdGF0aWNWYWx1ZSh2YWx1ZTogc3RyaW5nKTogUmVwbGFjZVBpZWNlIHtcblx0XHRyZXR1cm4gbmV3IFJlcGxhY2VQaWVjZSh2YWx1ZSwgLTEsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBtYXRjaEluZGV4KGluZGV4OiBudW1iZXIpOiBSZXBsYWNlUGllY2Uge1xuXHRcdHJldHVybiBuZXcgUmVwbGFjZVBpZWNlKG51bGwsIGluZGV4LCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY2FzZU9wcyhpbmRleDogbnVtYmVyLCBjYXNlT3BzOiBzdHJpbmdbXSk6IFJlcGxhY2VQaWVjZSB7XG5cdFx0cmV0dXJuIG5ldyBSZXBsYWNlUGllY2UobnVsbCwgaW5kZXgsIGNhc2VPcHMpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHN0YXRpY1ZhbHVlOiBzdHJpbmcgfCBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWF0Y2hJbmRleDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2FzZU9wczogc3RyaW5nW10gfCBudWxsO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3Ioc3RhdGljVmFsdWU6IHN0cmluZyB8IG51bGwsIG1hdGNoSW5kZXg6IG51bWJlciwgY2FzZU9wczogc3RyaW5nW10gfCBudWxsKSB7XG5cdFx0dGhpcy5zdGF0aWNWYWx1ZSA9IHN0YXRpY1ZhbHVlO1xuXHRcdHRoaXMubWF0Y2hJbmRleCA9IG1hdGNoSW5kZXg7XG5cdFx0aWYgKCFjYXNlT3BzIHx8IGNhc2VPcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmNhc2VPcHMgPSBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNhc2VPcHMgPSBjYXNlT3BzLnNsaWNlKDApO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZXBsYWNlUGllY2VCdWlsZGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zb3VyY2U6IHN0cmluZztcblx0cHJpdmF0ZSBfbGFzdENoYXJJbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXN1bHQ6IFJlcGxhY2VQaWVjZVtdO1xuXHRwcml2YXRlIF9yZXN1bHRMZW46IG51bWJlcjtcblx0cHJpdmF0ZSBfY3VycmVudFN0YXRpY1BpZWNlOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3Ioc291cmNlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9zb3VyY2UgPSBzb3VyY2U7XG5cdFx0dGhpcy5fbGFzdENoYXJJbmRleCA9IDA7XG5cdFx0dGhpcy5fcmVzdWx0ID0gW107XG5cdFx0dGhpcy5fcmVzdWx0TGVuID0gMDtcblx0XHR0aGlzLl9jdXJyZW50U3RhdGljUGllY2UgPSAnJztcblx0fVxuXG5cdHB1YmxpYyBlbWl0VW5jaGFuZ2VkKHRvQ2hhckluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9lbWl0U3RhdGljKHRoaXMuX3NvdXJjZS5zdWJzdHJpbmcodGhpcy5fbGFzdENoYXJJbmRleCwgdG9DaGFySW5kZXgpKTtcblx0XHR0aGlzLl9sYXN0Q2hhckluZGV4ID0gdG9DaGFySW5kZXg7XG5cdH1cblxuXHRwdWJsaWMgZW1pdFN0YXRpYyh2YWx1ZTogc3RyaW5nLCB0b0NoYXJJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZW1pdFN0YXRpYyh2YWx1ZSk7XG5cdFx0dGhpcy5fbGFzdENoYXJJbmRleCA9IHRvQ2hhckluZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSBfZW1pdFN0YXRpYyh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50U3RhdGljUGllY2UgKz0gdmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgZW1pdE1hdGNoSW5kZXgoaW5kZXg6IG51bWJlciwgdG9DaGFySW5kZXg6IG51bWJlciwgY2FzZU9wczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFN0YXRpY1BpZWNlLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0dGhpcy5fcmVzdWx0W3RoaXMuX3Jlc3VsdExlbisrXSA9IFJlcGxhY2VQaWVjZS5zdGF0aWNWYWx1ZSh0aGlzLl9jdXJyZW50U3RhdGljUGllY2UpO1xuXHRcdFx0dGhpcy5fY3VycmVudFN0YXRpY1BpZWNlID0gJyc7XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc3VsdFt0aGlzLl9yZXN1bHRMZW4rK10gPSBSZXBsYWNlUGllY2UuY2FzZU9wcyhpbmRleCwgY2FzZU9wcyk7XG5cdFx0dGhpcy5fbGFzdENoYXJJbmRleCA9IHRvQ2hhckluZGV4O1xuXHR9XG5cblxuXHRwdWJsaWMgZmluYWxpemUoKTogUmVwbGFjZVBhdHRlcm4ge1xuXHRcdHRoaXMuZW1pdFVuY2hhbmdlZCh0aGlzLl9zb3VyY2UubGVuZ3RoKTtcblx0XHRpZiAodGhpcy5fY3VycmVudFN0YXRpY1BpZWNlLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0dGhpcy5fcmVzdWx0W3RoaXMuX3Jlc3VsdExlbisrXSA9IFJlcGxhY2VQaWVjZS5zdGF0aWNWYWx1ZSh0aGlzLl9jdXJyZW50U3RhdGljUGllY2UpO1xuXHRcdFx0dGhpcy5fY3VycmVudFN0YXRpY1BpZWNlID0gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmVwbGFjZVBhdHRlcm4odGhpcy5fcmVzdWx0KTtcblx0fVxufVxuXG4vKipcbiAqIFxcblx0XHRcdD0+IGluc2VydHMgYSBMRlxuICogXFx0XHRcdFx0PT4gaW5zZXJ0cyBhIFRBQlxuICogXFxcXFx0XHRcdD0+IGluc2VydHMgYSBcIlxcXCIuXG4gKiBcXHVcdFx0XHQ9PiB1cHBlci1jYXNlcyBvbmUgY2hhcmFjdGVyIGluIGEgbWF0Y2guXG4gKiBcXFVcdFx0XHQ9PiB1cHBlci1jYXNlcyBBTEwgcmVtYWluaW5nIGNoYXJhY3RlcnMgaW4gYSBtYXRjaC5cbiAqIFxcbFx0XHRcdD0+IGxvd2VyLWNhc2VzIG9uZSBjaGFyYWN0ZXIgaW4gYSBtYXRjaC5cbiAqIFxcTFx0XHRcdD0+IGxvd2VyLWNhc2VzIEFMTCByZW1haW5pbmcgY2hhcmFjdGVycyBpbiBhIG1hdGNoLlxuICogJCRcdFx0XHQ9PiBpbnNlcnRzIGEgXCIkXCIuXG4gKiAkJiBhbmQgJDBcdD0+IGluc2VydHMgdGhlIG1hdGNoZWQgc3Vic3RyaW5nLlxuICogJG5cdFx0XHQ9PiBXaGVyZSBuIGlzIGEgbm9uLW5lZ2F0aXZlIGludGVnZXIgbGVzc2VyIHRoYW4gMTAwLCBpbnNlcnRzIHRoZSBudGggcGFyZW50aGVzaXplZCBzdWJtYXRjaCBzdHJpbmdcbiAqIGV2ZXJ5dGhpbmcgZWxzZSBzdGF5cyB1bnRvdWNoZWRcbiAqXG4gKiBBbHNvIHNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9TdHJpbmcvcmVwbGFjZSNTcGVjaWZ5aW5nX2Ffc3RyaW5nX2FzX2FfcGFyYW1ldGVyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVJlcGxhY2VTdHJpbmcocmVwbGFjZVN0cmluZzogc3RyaW5nKTogUmVwbGFjZVBhdHRlcm4ge1xuXHRpZiAoIXJlcGxhY2VTdHJpbmcgfHwgcmVwbGFjZVN0cmluZy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gbmV3IFJlcGxhY2VQYXR0ZXJuKG51bGwpO1xuXHR9XG5cblx0Y29uc3QgY2FzZU9wczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgcmVzdWx0ID0gbmV3IFJlcGxhY2VQaWVjZUJ1aWxkZXIocmVwbGFjZVN0cmluZyk7XG5cblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJlcGxhY2VTdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCBjaENvZGUgPSByZXBsYWNlU3RyaW5nLmNoYXJDb2RlQXQoaSk7XG5cblx0XHRpZiAoY2hDb2RlID09PSBDaGFyQ29kZS5CYWNrc2xhc2gpIHtcblxuXHRcdFx0Ly8gbW92ZSB0byBuZXh0IGNoYXJcblx0XHRcdGkrKztcblxuXHRcdFx0aWYgKGkgPj0gbGVuKSB7XG5cdFx0XHRcdC8vIHN0cmluZyBlbmRzIHdpdGggYSBcXFxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV4dENoQ29kZSA9IHJlcGxhY2VTdHJpbmcuY2hhckNvZGVBdChpKTtcblx0XHRcdC8vIGxldCByZXBsYWNlV2l0aENoYXJhY3Rlcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0XHRcdHN3aXRjaCAobmV4dENoQ29kZSkge1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkJhY2tzbGFzaDpcblx0XHRcdFx0XHQvLyBcXFxcID0+IGluc2VydHMgYSBcIlxcXCJcblx0XHRcdFx0XHRyZXN1bHQuZW1pdFVuY2hhbmdlZChpIC0gMSk7XG5cdFx0XHRcdFx0cmVzdWx0LmVtaXRTdGF0aWMoJ1xcXFwnLCBpICsgMSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUubjpcblx0XHRcdFx0XHQvLyBcXG4gPT4gaW5zZXJ0cyBhIExGXG5cdFx0XHRcdFx0cmVzdWx0LmVtaXRVbmNoYW5nZWQoaSAtIDEpO1xuXHRcdFx0XHRcdHJlc3VsdC5lbWl0U3RhdGljKCdcXG4nLCBpICsgMSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUudDpcblx0XHRcdFx0XHQvLyBcXHQgPT4gaW5zZXJ0cyBhIFRBQlxuXHRcdFx0XHRcdHJlc3VsdC5lbWl0VW5jaGFuZ2VkKGkgLSAxKTtcblx0XHRcdFx0XHRyZXN1bHQuZW1pdFN0YXRpYygnXFx0JywgaSArIDEpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHQvLyBDYXNlIG1vZGlmaWNhdGlvbiBvZiBzdHJpbmcgcmVwbGFjZW1lbnRzLCBwYXR0ZXJuZWQgYWZ0ZXIgQm9vc3QsIGJ1dCBvbmx5IGFwcGxpZWRcblx0XHRcdFx0Ly8gdG8gdGhlIHJlcGxhY2VtZW50IHRleHQsIG5vdCBzdWJzZXF1ZW50IGNvbnRlbnQuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUudTpcblx0XHRcdFx0Ly8gXFx1ID0+IHVwcGVyLWNhc2VzIG9uZSBjaGFyYWN0ZXIuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuVTpcblx0XHRcdFx0Ly8gXFxVID0+IHVwcGVyLWNhc2VzIEFMTCBmb2xsb3dpbmcgY2hhcmFjdGVycy5cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5sOlxuXHRcdFx0XHQvLyBcXGwgPT4gbG93ZXItY2FzZXMgb25lIGNoYXJhY3Rlci5cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5MOlxuXHRcdFx0XHRcdC8vIFxcTCA9PiBsb3dlci1jYXNlcyBBTEwgZm9sbG93aW5nIGNoYXJhY3RlcnMuXG5cdFx0XHRcdFx0cmVzdWx0LmVtaXRVbmNoYW5nZWQoaSAtIDEpO1xuXHRcdFx0XHRcdHJlc3VsdC5lbWl0U3RhdGljKCcnLCBpICsgMSk7XG5cdFx0XHRcdFx0Y2FzZU9wcy5wdXNoKFN0cmluZy5mcm9tQ2hhckNvZGUobmV4dENoQ29kZSkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoY2hDb2RlID09PSBDaGFyQ29kZS5Eb2xsYXJTaWduKSB7XG5cblx0XHRcdC8vIG1vdmUgdG8gbmV4dCBjaGFyXG5cdFx0XHRpKys7XG5cblx0XHRcdGlmIChpID49IGxlbikge1xuXHRcdFx0XHQvLyBzdHJpbmcgZW5kcyB3aXRoIGEgJFxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV4dENoQ29kZSA9IHJlcGxhY2VTdHJpbmcuY2hhckNvZGVBdChpKTtcblxuXHRcdFx0aWYgKG5leHRDaENvZGUgPT09IENoYXJDb2RlLkRvbGxhclNpZ24pIHtcblx0XHRcdFx0Ly8gJCQgPT4gaW5zZXJ0cyBhIFwiJFwiXG5cdFx0XHRcdHJlc3VsdC5lbWl0VW5jaGFuZ2VkKGkgLSAxKTtcblx0XHRcdFx0cmVzdWx0LmVtaXRTdGF0aWMoJyQnLCBpICsgMSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmV4dENoQ29kZSA9PT0gQ2hhckNvZGUuRGlnaXQwIHx8IG5leHRDaENvZGUgPT09IENoYXJDb2RlLkFtcGVyc2FuZCkge1xuXHRcdFx0XHQvLyAkJiBhbmQgJDAgPT4gaW5zZXJ0cyB0aGUgbWF0Y2hlZCBzdWJzdHJpbmcuXG5cdFx0XHRcdHJlc3VsdC5lbWl0VW5jaGFuZ2VkKGkgLSAxKTtcblx0XHRcdFx0cmVzdWx0LmVtaXRNYXRjaEluZGV4KDAsIGkgKyAxLCBjYXNlT3BzKTtcblx0XHRcdFx0Y2FzZU9wcy5sZW5ndGggPSAwO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKENoYXJDb2RlLkRpZ2l0MSA8PSBuZXh0Q2hDb2RlICYmIG5leHRDaENvZGUgPD0gQ2hhckNvZGUuRGlnaXQ5KSB7XG5cdFx0XHRcdC8vICRuXG5cblx0XHRcdFx0bGV0IG1hdGNoSW5kZXggPSBuZXh0Q2hDb2RlIC0gQ2hhckNvZGUuRGlnaXQwO1xuXG5cdFx0XHRcdC8vIHBlZWsgbmV4dCBjaGFyIHRvIHByb2JlIGZvciAkbm5cblx0XHRcdFx0aWYgKGkgKyAxIDwgbGVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dE5leHRDaENvZGUgPSByZXBsYWNlU3RyaW5nLmNoYXJDb2RlQXQoaSArIDEpO1xuXHRcdFx0XHRcdGlmIChDaGFyQ29kZS5EaWdpdDAgPD0gbmV4dE5leHRDaENvZGUgJiYgbmV4dE5leHRDaENvZGUgPD0gQ2hhckNvZGUuRGlnaXQ5KSB7XG5cdFx0XHRcdFx0XHQvLyAkbm5cblxuXHRcdFx0XHRcdFx0Ly8gbW92ZSB0byBuZXh0IGNoYXJcblx0XHRcdFx0XHRcdGkrKztcblx0XHRcdFx0XHRcdG1hdGNoSW5kZXggPSBtYXRjaEluZGV4ICogMTAgKyAobmV4dE5leHRDaENvZGUgLSBDaGFyQ29kZS5EaWdpdDApO1xuXG5cdFx0XHRcdFx0XHRyZXN1bHQuZW1pdFVuY2hhbmdlZChpIC0gMik7XG5cdFx0XHRcdFx0XHRyZXN1bHQuZW1pdE1hdGNoSW5kZXgobWF0Y2hJbmRleCwgaSArIDEsIGNhc2VPcHMpO1xuXHRcdFx0XHRcdFx0Y2FzZU9wcy5sZW5ndGggPSAwO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzdWx0LmVtaXRVbmNoYW5nZWQoaSAtIDEpO1xuXHRcdFx0XHRyZXN1bHQuZW1pdE1hdGNoSW5kZXgobWF0Y2hJbmRleCwgaSArIDEsIGNhc2VPcHMpO1xuXHRcdFx0XHRjYXNlT3BzLmxlbmd0aCA9IDA7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQuZmluYWxpemUoKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkNBQTJDO0FBRXBELElBQVcscUJBQVgsa0JBQVdBLHdCQUFYO0FBQ0MsRUFBQUEsd0NBQUEsaUJBQWMsS0FBZDtBQUNBLEVBQUFBLHdDQUFBLG1CQUFnQixLQUFoQjtBQUZVLFNBQUFBO0FBQUEsR0FBQTtBQVFYLE1BQU0sMEJBQTBCO0FBQUEsRUFFL0IsWUFBNEIsYUFBcUI7QUFBckI7QUFENUIsU0FBZ0IsT0FBTztBQUFBLEVBQzRCO0FBQ3BEO0FBS0EsTUFBTSw0QkFBNEI7QUFBQSxFQUVqQyxZQUE0QixRQUF3QjtBQUF4QjtBQUQ1QixTQUFnQixPQUFPO0FBQUEsRUFDK0I7QUFDdkQ7QUFFTyxNQUFNLGVBQWU7QUFBQSxFQUUzQixPQUFjLGdCQUFnQixPQUErQjtBQUM1RCxXQUFPLElBQUksZUFBZSxDQUFDLGFBQWEsWUFBWSxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQzVEO0FBQUEsRUFJQSxJQUFXLHlCQUFrQztBQUM1QyxXQUFRLEtBQUssT0FBTyxTQUFTO0FBQUEsRUFDOUI7QUFBQSxFQUVBLFlBQVksUUFBK0I7QUFDMUMsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLEdBQUc7QUFDbkMsV0FBSyxTQUFTLElBQUksMEJBQTBCLEVBQUU7QUFBQSxJQUMvQyxXQUFXLE9BQU8sV0FBVyxLQUFLLE9BQU8sQ0FBQyxFQUFFLGdCQUFnQixNQUFNO0FBQ2pFLFdBQUssU0FBUyxJQUFJLDBCQUEwQixPQUFPLENBQUMsRUFBRSxXQUFXO0FBQUEsSUFDbEUsT0FBTztBQUNOLFdBQUssU0FBUyxJQUFJLDRCQUE0QixNQUFNO0FBQUEsSUFDckQ7QUFBQSxFQUNEO0FBQUEsRUFFTyxtQkFBbUIsU0FBMEIsY0FBZ0M7QUFDbkYsUUFBSSxLQUFLLE9BQU8sU0FBUyxxQkFBZ0M7QUFDeEQsVUFBSSxjQUFjO0FBQ2pCLGVBQU8sb0NBQW9DLFNBQVMsS0FBSyxPQUFPLFdBQVc7QUFBQSxNQUM1RSxPQUFPO0FBQ04sZUFBTyxLQUFLLE9BQU87QUFBQSxNQUNwQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFNBQVM7QUFDYixhQUFTLElBQUksR0FBRyxNQUFNLEtBQUssT0FBTyxPQUFPLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDOUQsWUFBTSxRQUFRLEtBQUssT0FBTyxPQUFPLENBQUM7QUFDbEMsVUFBSSxNQUFNLGdCQUFnQixNQUFNO0FBRS9CLGtCQUFVLE1BQU07QUFDaEI7QUFBQSxNQUNEO0FBR0EsVUFBSSxRQUFnQixlQUFlLFlBQVksTUFBTSxZQUFZLE9BQU87QUFDeEUsVUFBSSxNQUFNLFlBQVksUUFBUSxNQUFNLFFBQVEsU0FBUyxHQUFHO0FBQ3ZELGNBQU0sT0FBaUIsQ0FBQztBQUN4QixjQUFNLFNBQWlCLE1BQU0sUUFBUTtBQUNyQyxZQUFJLFFBQWdCO0FBQ3BCLGlCQUFTLE1BQWMsR0FBR0MsT0FBYyxNQUFNLFFBQVEsTUFBTUEsTUFBSyxPQUFPO0FBQ3ZFLGNBQUksU0FBUyxRQUFRO0FBQ3BCLGlCQUFLLEtBQUssTUFBTSxNQUFNLEdBQUcsQ0FBQztBQUMxQjtBQUFBLFVBQ0Q7QUFDQSxrQkFBUSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQUEsWUFDN0IsS0FBSztBQUNKLG1CQUFLLEtBQUssTUFBTSxHQUFHLEVBQUUsWUFBWSxDQUFDO0FBQ2xDO0FBQUEsWUFDRCxLQUFLO0FBQ0osbUJBQUssS0FBSyxNQUFNLEdBQUcsRUFBRSxZQUFZLENBQUM7QUFDbEM7QUFDQTtBQUFBLFlBQ0QsS0FBSztBQUNKLG1CQUFLLEtBQUssTUFBTSxHQUFHLEVBQUUsWUFBWSxDQUFDO0FBQ2xDO0FBQUEsWUFDRCxLQUFLO0FBQ0osbUJBQUssS0FBSyxNQUFNLEdBQUcsRUFBRSxZQUFZLENBQUM7QUFDbEM7QUFDQTtBQUFBLFlBQ0Q7QUFDQyxtQkFBSyxLQUFLLE1BQU0sR0FBRyxDQUFDO0FBQUEsVUFDdEI7QUFBQSxRQUNEO0FBQ0EsZ0JBQVEsS0FBSyxLQUFLLEVBQUU7QUFBQSxNQUNyQjtBQUNBLGdCQUFVO0FBQUEsSUFDWDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFlLFlBQVksWUFBb0IsU0FBa0M7QUFDaEYsUUFBSSxZQUFZLE1BQU07QUFDckIsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLGVBQWUsR0FBRztBQUNyQixhQUFPLFFBQVEsQ0FBQztBQUFBLElBQ2pCO0FBRUEsUUFBSSxZQUFZO0FBQ2hCLFdBQU8sYUFBYSxHQUFHO0FBQ3RCLFVBQUksYUFBYSxRQUFRLFFBQVE7QUFFaEMsY0FBTSxRQUFTLFFBQVEsVUFBVSxLQUFLO0FBQ3RDLGVBQU8sUUFBUTtBQUFBLE1BQ2hCO0FBQ0Esa0JBQVksT0FBTyxhQUFhLEVBQUUsSUFBSTtBQUN0QyxtQkFBYSxLQUFLLE1BQU0sYUFBYSxFQUFFO0FBQUEsSUFDeEM7QUFDQSxXQUFPLE1BQU07QUFBQSxFQUNkO0FBQ0Q7QUFLTyxNQUFNLGFBQWE7QUFBQSxFQUV6QixPQUFjLFlBQVksT0FBNkI7QUFDdEQsV0FBTyxJQUFJLGFBQWEsT0FBTyxJQUFJLElBQUk7QUFBQSxFQUN4QztBQUFBLEVBRUEsT0FBYyxXQUFXLE9BQTZCO0FBQ3JELFdBQU8sSUFBSSxhQUFhLE1BQU0sT0FBTyxJQUFJO0FBQUEsRUFDMUM7QUFBQSxFQUVBLE9BQWMsUUFBUSxPQUFlLFNBQWlDO0FBQ3JFLFdBQU8sSUFBSSxhQUFhLE1BQU0sT0FBTyxPQUFPO0FBQUEsRUFDN0M7QUFBQSxFQU1RLFlBQVksYUFBNEIsWUFBb0IsU0FBMEI7QUFDN0YsU0FBSyxjQUFjO0FBQ25CLFNBQUssYUFBYTtBQUNsQixRQUFJLENBQUMsV0FBVyxRQUFRLFdBQVcsR0FBRztBQUNyQyxXQUFLLFVBQVU7QUFBQSxJQUNoQixPQUFPO0FBQ04sV0FBSyxVQUFVLFFBQVEsTUFBTSxDQUFDO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLG9CQUFvQjtBQUFBLEVBUXpCLFlBQVksUUFBZ0I7QUFDM0IsU0FBSyxVQUFVO0FBQ2YsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxVQUFVLENBQUM7QUFDaEIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQUVPLGNBQWMsYUFBMkI7QUFDL0MsU0FBSyxZQUFZLEtBQUssUUFBUSxVQUFVLEtBQUssZ0JBQWdCLFdBQVcsQ0FBQztBQUN6RSxTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFTyxXQUFXLE9BQWUsYUFBMkI7QUFDM0QsU0FBSyxZQUFZLEtBQUs7QUFDdEIsU0FBSyxpQkFBaUI7QUFBQSxFQUN2QjtBQUFBLEVBRVEsWUFBWSxPQUFxQjtBQUN4QyxRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUNBLFNBQUssdUJBQXVCO0FBQUEsRUFDN0I7QUFBQSxFQUVPLGVBQWUsT0FBZSxhQUFxQixTQUF5QjtBQUNsRixRQUFJLEtBQUssb0JBQW9CLFdBQVcsR0FBRztBQUMxQyxXQUFLLFFBQVEsS0FBSyxZQUFZLElBQUksYUFBYSxZQUFZLEtBQUssbUJBQW1CO0FBQ25GLFdBQUssc0JBQXNCO0FBQUEsSUFDNUI7QUFDQSxTQUFLLFFBQVEsS0FBSyxZQUFZLElBQUksYUFBYSxRQUFRLE9BQU8sT0FBTztBQUNyRSxTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFHTyxXQUEyQjtBQUNqQyxTQUFLLGNBQWMsS0FBSyxRQUFRLE1BQU07QUFDdEMsUUFBSSxLQUFLLG9CQUFvQixXQUFXLEdBQUc7QUFDMUMsV0FBSyxRQUFRLEtBQUssWUFBWSxJQUFJLGFBQWEsWUFBWSxLQUFLLG1CQUFtQjtBQUNuRixXQUFLLHNCQUFzQjtBQUFBLElBQzVCO0FBQ0EsV0FBTyxJQUFJLGVBQWUsS0FBSyxPQUFPO0FBQUEsRUFDdkM7QUFDRDtBQWlCTyxTQUFTLG1CQUFtQixlQUF1QztBQUN6RSxNQUFJLENBQUMsaUJBQWlCLGNBQWMsV0FBVyxHQUFHO0FBQ2pELFdBQU8sSUFBSSxlQUFlLElBQUk7QUFBQSxFQUMvQjtBQUVBLFFBQU0sVUFBb0IsQ0FBQztBQUMzQixRQUFNLFNBQVMsSUFBSSxvQkFBb0IsYUFBYTtBQUVwRCxXQUFTLElBQUksR0FBRyxNQUFNLGNBQWMsUUFBUSxJQUFJLEtBQUssS0FBSztBQUN6RCxVQUFNLFNBQVMsY0FBYyxXQUFXLENBQUM7QUFFekMsUUFBSSxXQUFXLFNBQVMsV0FBVztBQUdsQztBQUVBLFVBQUksS0FBSyxLQUFLO0FBRWI7QUFBQSxNQUNEO0FBRUEsWUFBTSxhQUFhLGNBQWMsV0FBVyxDQUFDO0FBRzdDLGNBQVEsWUFBWTtBQUFBLFFBQ25CLEtBQUssU0FBUztBQUViLGlCQUFPLGNBQWMsSUFBSSxDQUFDO0FBQzFCLGlCQUFPLFdBQVcsTUFBTSxJQUFJLENBQUM7QUFDN0I7QUFBQSxRQUNELEtBQUssU0FBUztBQUViLGlCQUFPLGNBQWMsSUFBSSxDQUFDO0FBQzFCLGlCQUFPLFdBQVcsTUFBTSxJQUFJLENBQUM7QUFDN0I7QUFBQSxRQUNELEtBQUssU0FBUztBQUViLGlCQUFPLGNBQWMsSUFBSSxDQUFDO0FBQzFCLGlCQUFPLFdBQVcsS0FBTSxJQUFJLENBQUM7QUFDN0I7QUFBQTtBQUFBO0FBQUEsUUFHRCxLQUFLLFNBQVM7QUFBQTtBQUFBLFFBRWQsS0FBSyxTQUFTO0FBQUE7QUFBQSxRQUVkLEtBQUssU0FBUztBQUFBO0FBQUEsUUFFZCxLQUFLLFNBQVM7QUFFYixpQkFBTyxjQUFjLElBQUksQ0FBQztBQUMxQixpQkFBTyxXQUFXLElBQUksSUFBSSxDQUFDO0FBQzNCLGtCQUFRLEtBQUssT0FBTyxhQUFhLFVBQVUsQ0FBQztBQUM1QztBQUFBLE1BQ0Y7QUFFQTtBQUFBLElBQ0Q7QUFFQSxRQUFJLFdBQVcsU0FBUyxZQUFZO0FBR25DO0FBRUEsVUFBSSxLQUFLLEtBQUs7QUFFYjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGFBQWEsY0FBYyxXQUFXLENBQUM7QUFFN0MsVUFBSSxlQUFlLFNBQVMsWUFBWTtBQUV2QyxlQUFPLGNBQWMsSUFBSSxDQUFDO0FBQzFCLGVBQU8sV0FBVyxLQUFLLElBQUksQ0FBQztBQUM1QjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLGVBQWUsU0FBUyxVQUFVLGVBQWUsU0FBUyxXQUFXO0FBRXhFLGVBQU8sY0FBYyxJQUFJLENBQUM7QUFDMUIsZUFBTyxlQUFlLEdBQUcsSUFBSSxHQUFHLE9BQU87QUFDdkMsZ0JBQVEsU0FBUztBQUNqQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFNBQVMsVUFBVSxjQUFjLGNBQWMsU0FBUyxRQUFRO0FBR25FLFlBQUksYUFBYSxhQUFhLFNBQVM7QUFHdkMsWUFBSSxJQUFJLElBQUksS0FBSztBQUNoQixnQkFBTSxpQkFBaUIsY0FBYyxXQUFXLElBQUksQ0FBQztBQUNyRCxjQUFJLFNBQVMsVUFBVSxrQkFBa0Isa0JBQWtCLFNBQVMsUUFBUTtBQUkzRTtBQUNBLHlCQUFhLGFBQWEsTUFBTSxpQkFBaUIsU0FBUztBQUUxRCxtQkFBTyxjQUFjLElBQUksQ0FBQztBQUMxQixtQkFBTyxlQUFlLFlBQVksSUFBSSxHQUFHLE9BQU87QUFDaEQsb0JBQVEsU0FBUztBQUNqQjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBRUEsZUFBTyxjQUFjLElBQUksQ0FBQztBQUMxQixlQUFPLGVBQWUsWUFBWSxJQUFJLEdBQUcsT0FBTztBQUNoRCxnQkFBUSxTQUFTO0FBQ2pCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsU0FBTyxPQUFPLFNBQVM7QUFDeEI7IiwKICAibmFtZXMiOiBbIlJlcGxhY2VQYXR0ZXJuS2luZCIsICJsZW4iXQp9Cg==
