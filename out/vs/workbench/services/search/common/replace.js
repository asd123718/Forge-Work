import * as strings from "../../../../base/common/strings.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { buildReplaceStringWithCasePreserved } from "../../../../base/common/search.js";
class ReplacePattern {
  constructor(replaceString, arg2, arg3) {
    this._hasParameters = false;
    this._replacePattern = replaceString;
    let searchPatternInfo;
    let parseParameters;
    if (typeof arg2 === "boolean") {
      parseParameters = arg2;
      this._regExp = arg3;
    } else {
      searchPatternInfo = arg2;
      parseParameters = !!searchPatternInfo.isRegExp;
      this._regExp = strings.createRegExp(searchPatternInfo.pattern, !!searchPatternInfo.isRegExp, { matchCase: searchPatternInfo.isCaseSensitive, wholeWord: searchPatternInfo.isWordMatch, multiline: searchPatternInfo.isMultiline, global: false, unicode: true });
    }
    if (parseParameters) {
      this.parseReplaceString(replaceString);
    }
    if (this._regExp.global) {
      this._regExp = strings.createRegExp(this._regExp.source, true, { matchCase: !this._regExp.ignoreCase, wholeWord: false, multiline: this._regExp.multiline, global: false });
    }
    this._caseOpsRegExp = new RegExp(/([\s\S]*?)((?:\\[uUlL])+?|)(\$[0-9]+)([\s\S]*?)/g);
  }
  get hasParameters() {
    return this._hasParameters;
  }
  get pattern() {
    return this._replacePattern;
  }
  get regExp() {
    return this._regExp;
  }
  /**
  * Returns the replace string for the first match in the given text.
  * If text has no matches then returns null.
  */
  getReplaceString(text, preserveCase) {
    this._regExp.lastIndex = 0;
    const match = this._regExp.exec(text);
    if (match) {
      if (this.hasParameters) {
        const replaceString = this.replaceWithCaseOperations(text, this._regExp, this.buildReplaceString(match, preserveCase));
        if (match[0] === text) {
          return replaceString;
        }
        return replaceString.substr(match.index, match[0].length - (text.length - replaceString.length));
      }
      return this.buildReplaceString(match, preserveCase);
    }
    return null;
  }
  /**
   * replaceWithCaseOperations applies case operations to relevant replacement strings and applies
   * the affected $N arguments. It then passes unaffected $N arguments through to string.replace().
   *
   * \u			=> upper-cases one character in a match.
   * \U			=> upper-cases ALL remaining characters in a match.
   * \l			=> lower-cases one character in a match.
   * \L			=> lower-cases ALL remaining characters in a match.
   */
  replaceWithCaseOperations(text, regex, replaceString) {
    if (!/\\[uUlL]/.test(replaceString)) {
      return text.replace(regex, replaceString);
    }
    const firstMatch = regex.exec(text);
    if (firstMatch === null) {
      return text.replace(regex, replaceString);
    }
    let patMatch;
    let newReplaceString = "";
    let lastIndex = 0;
    let lastMatch = "";
    while ((patMatch = this._caseOpsRegExp.exec(replaceString)) !== null) {
      lastIndex = patMatch.index;
      const fullMatch = patMatch[0];
      lastMatch = fullMatch;
      let caseOps = patMatch[2];
      const money = patMatch[3];
      if (!caseOps) {
        newReplaceString += fullMatch;
        continue;
      }
      const replacement = firstMatch[parseInt(money.slice(1))];
      if (!replacement) {
        newReplaceString += fullMatch;
        continue;
      }
      const replacementLen = replacement.length;
      newReplaceString += patMatch[1];
      caseOps = caseOps.replace(/\\/g, "");
      let i = 0;
      for (; i < caseOps.length; i++) {
        switch (caseOps[i]) {
          case "U":
            newReplaceString += replacement.slice(i).toUpperCase();
            i = replacementLen;
            break;
          case "u":
            newReplaceString += replacement[i].toUpperCase();
            break;
          case "L":
            newReplaceString += replacement.slice(i).toLowerCase();
            i = replacementLen;
            break;
          case "l":
            newReplaceString += replacement[i].toLowerCase();
            break;
        }
      }
      if (i < replacementLen) {
        newReplaceString += replacement.slice(i);
      }
      newReplaceString += patMatch[4];
    }
    newReplaceString += replaceString.slice(lastIndex + lastMatch.length);
    return text.replace(regex, newReplaceString);
  }
  buildReplaceString(matches, preserveCase) {
    if (preserveCase) {
      return buildReplaceStringWithCasePreserved(matches, this._replacePattern);
    } else {
      return this._replacePattern;
    }
  }
  /**
   * \n => LF
   * \t => TAB
   * \\ => \
   * $0 => $& (see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_string_as_a_parameter)
   * everything else stays untouched
   */
  parseReplaceString(replaceString) {
    if (!replaceString || replaceString.length === 0) {
      return;
    }
    let substrFrom = 0, result = "";
    for (let i = 0, len = replaceString.length; i < len; i++) {
      const chCode = replaceString.charCodeAt(i);
      if (chCode === CharCode.Backslash) {
        i++;
        if (i >= len) {
          break;
        }
        const nextChCode = replaceString.charCodeAt(i);
        let replaceWithCharacter = null;
        switch (nextChCode) {
          case CharCode.Backslash:
            replaceWithCharacter = "\\";
            break;
          case CharCode.n:
            replaceWithCharacter = "\n";
            break;
          case CharCode.t:
            replaceWithCharacter = "	";
            break;
        }
        if (replaceWithCharacter) {
          result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
          substrFrom = i + 1;
        }
      }
      if (chCode === CharCode.DollarSign) {
        i++;
        if (i >= len) {
          break;
        }
        const nextChCode = replaceString.charCodeAt(i);
        let replaceWithCharacter = null;
        switch (nextChCode) {
          case CharCode.Digit0:
            replaceWithCharacter = "$&";
            this._hasParameters = true;
            break;
          case CharCode.BackTick:
          case CharCode.SingleQuote:
            this._hasParameters = true;
            break;
          default: {
            if (!this.between(nextChCode, CharCode.Digit1, CharCode.Digit9)) {
              break;
            }
            if (i === replaceString.length - 1) {
              this._hasParameters = true;
              break;
            }
            let charCode = replaceString.charCodeAt(++i);
            if (!this.between(charCode, CharCode.Digit0, CharCode.Digit9)) {
              this._hasParameters = true;
              --i;
              break;
            }
            if (i === replaceString.length - 1) {
              this._hasParameters = true;
              break;
            }
            charCode = replaceString.charCodeAt(++i);
            if (!this.between(charCode, CharCode.Digit0, CharCode.Digit9)) {
              this._hasParameters = true;
              --i;
              break;
            }
            break;
          }
        }
        if (replaceWithCharacter) {
          result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
          substrFrom = i + 1;
        }
      }
    }
    if (substrFrom === 0) {
      return;
    }
    this._replacePattern = result + replaceString.substring(substrFrom);
  }
  between(value, from, to) {
    return from <= value && value <= to;
  }
}
export {
  ReplacePattern
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXGNvbW1vblxccmVwbGFjZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJUGF0dGVybkluZm8gfSBmcm9tICcuL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IGJ1aWxkUmVwbGFjZVN0cmluZ1dpdGhDYXNlUHJlc2VydmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2VhcmNoLmpzJztcblxuZXhwb3J0IGNsYXNzIFJlcGxhY2VQYXR0ZXJuIHtcblxuXHRwcml2YXRlIF9yZXBsYWNlUGF0dGVybjogc3RyaW5nO1xuXHRwcml2YXRlIF9oYXNQYXJhbWV0ZXJzOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlZ0V4cDogUmVnRXhwO1xuXHRwcml2YXRlIF9jYXNlT3BzUmVnRXhwOiBSZWdFeHA7XG5cblx0Y29uc3RydWN0b3IocmVwbGFjZVN0cmluZzogc3RyaW5nLCBzZWFyY2hQYXR0ZXJuSW5mbzogSVBhdHRlcm5JbmZvKTtcblx0Y29uc3RydWN0b3IocmVwbGFjZVN0cmluZzogc3RyaW5nLCBwYXJzZVBhcmFtZXRlcnM6IGJvb2xlYW4sIHJlZ0V4OiBSZWdFeHApO1xuXHRjb25zdHJ1Y3RvcihyZXBsYWNlU3RyaW5nOiBzdHJpbmcsIGFyZzI6IGFueSwgYXJnMz86IGFueSkge1xuXHRcdHRoaXMuX3JlcGxhY2VQYXR0ZXJuID0gcmVwbGFjZVN0cmluZztcblx0XHRsZXQgc2VhcmNoUGF0dGVybkluZm86IElQYXR0ZXJuSW5mbztcblx0XHRsZXQgcGFyc2VQYXJhbWV0ZXJzOiBib29sZWFuO1xuXHRcdGlmICh0eXBlb2YgYXJnMiA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRwYXJzZVBhcmFtZXRlcnMgPSBhcmcyO1xuXHRcdFx0dGhpcy5fcmVnRXhwID0gYXJnMztcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZWFyY2hQYXR0ZXJuSW5mbyA9IGFyZzI7XG5cdFx0XHRwYXJzZVBhcmFtZXRlcnMgPSAhIXNlYXJjaFBhdHRlcm5JbmZvLmlzUmVnRXhwO1xuXHRcdFx0dGhpcy5fcmVnRXhwID0gc3RyaW5ncy5jcmVhdGVSZWdFeHAoc2VhcmNoUGF0dGVybkluZm8ucGF0dGVybiwgISFzZWFyY2hQYXR0ZXJuSW5mby5pc1JlZ0V4cCwgeyBtYXRjaENhc2U6IHNlYXJjaFBhdHRlcm5JbmZvLmlzQ2FzZVNlbnNpdGl2ZSwgd2hvbGVXb3JkOiBzZWFyY2hQYXR0ZXJuSW5mby5pc1dvcmRNYXRjaCwgbXVsdGlsaW5lOiBzZWFyY2hQYXR0ZXJuSW5mby5pc011bHRpbGluZSwgZ2xvYmFsOiBmYWxzZSwgdW5pY29kZTogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRpZiAocGFyc2VQYXJhbWV0ZXJzKSB7XG5cdFx0XHR0aGlzLnBhcnNlUmVwbGFjZVN0cmluZyhyZXBsYWNlU3RyaW5nKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcmVnRXhwLmdsb2JhbCkge1xuXHRcdFx0dGhpcy5fcmVnRXhwID0gc3RyaW5ncy5jcmVhdGVSZWdFeHAodGhpcy5fcmVnRXhwLnNvdXJjZSwgdHJ1ZSwgeyBtYXRjaENhc2U6ICF0aGlzLl9yZWdFeHAuaWdub3JlQ2FzZSwgd2hvbGVXb3JkOiBmYWxzZSwgbXVsdGlsaW5lOiB0aGlzLl9yZWdFeHAubXVsdGlsaW5lLCBnbG9iYWw6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Nhc2VPcHNSZWdFeHAgPSBuZXcgUmVnRXhwKC8oW1xcc1xcU10qPykoKD86XFxcXFt1VWxMXSkrP3wpKFxcJFswLTldKykoW1xcc1xcU10qPykvZyk7XG5cdH1cblxuXHRnZXQgaGFzUGFyYW1ldGVycygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzUGFyYW1ldGVycztcblx0fVxuXG5cdGdldCBwYXR0ZXJuKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcGxhY2VQYXR0ZXJuO1xuXHR9XG5cblx0Z2V0IHJlZ0V4cCgpOiBSZWdFeHAge1xuXHRcdHJldHVybiB0aGlzLl9yZWdFeHA7XG5cdH1cblxuXHQvKipcblx0KiBSZXR1cm5zIHRoZSByZXBsYWNlIHN0cmluZyBmb3IgdGhlIGZpcnN0IG1hdGNoIGluIHRoZSBnaXZlbiB0ZXh0LlxuXHQqIElmIHRleHQgaGFzIG5vIG1hdGNoZXMgdGhlbiByZXR1cm5zIG51bGwuXG5cdCovXG5cdGdldFJlcGxhY2VTdHJpbmcodGV4dDogc3RyaW5nLCBwcmVzZXJ2ZUNhc2U/OiBib29sZWFuKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0dGhpcy5fcmVnRXhwLmxhc3RJbmRleCA9IDA7XG5cdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLl9yZWdFeHAuZXhlYyh0ZXh0KTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdGlmICh0aGlzLmhhc1BhcmFtZXRlcnMpIHtcblx0XHRcdFx0Y29uc3QgcmVwbGFjZVN0cmluZyA9IHRoaXMucmVwbGFjZVdpdGhDYXNlT3BlcmF0aW9ucyh0ZXh0LCB0aGlzLl9yZWdFeHAsIHRoaXMuYnVpbGRSZXBsYWNlU3RyaW5nKG1hdGNoLCBwcmVzZXJ2ZUNhc2UpKTtcblx0XHRcdFx0aWYgKG1hdGNoWzBdID09PSB0ZXh0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcGxhY2VTdHJpbmc7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlcGxhY2VTdHJpbmcuc3Vic3RyKG1hdGNoLmluZGV4LCBtYXRjaFswXS5sZW5ndGggLSAodGV4dC5sZW5ndGggLSByZXBsYWNlU3RyaW5nLmxlbmd0aCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuYnVpbGRSZXBsYWNlU3RyaW5nKG1hdGNoLCBwcmVzZXJ2ZUNhc2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0LyoqXG5cdCAqIHJlcGxhY2VXaXRoQ2FzZU9wZXJhdGlvbnMgYXBwbGllcyBjYXNlIG9wZXJhdGlvbnMgdG8gcmVsZXZhbnQgcmVwbGFjZW1lbnQgc3RyaW5ncyBhbmQgYXBwbGllc1xuXHQgKiB0aGUgYWZmZWN0ZWQgJE4gYXJndW1lbnRzLiBJdCB0aGVuIHBhc3NlcyB1bmFmZmVjdGVkICROIGFyZ3VtZW50cyB0aHJvdWdoIHRvIHN0cmluZy5yZXBsYWNlKCkuXG5cdCAqXG5cdCAqIFxcdVx0XHRcdD0+IHVwcGVyLWNhc2VzIG9uZSBjaGFyYWN0ZXIgaW4gYSBtYXRjaC5cblx0ICogXFxVXHRcdFx0PT4gdXBwZXItY2FzZXMgQUxMIHJlbWFpbmluZyBjaGFyYWN0ZXJzIGluIGEgbWF0Y2guXG5cdCAqIFxcbFx0XHRcdD0+IGxvd2VyLWNhc2VzIG9uZSBjaGFyYWN0ZXIgaW4gYSBtYXRjaC5cblx0ICogXFxMXHRcdFx0PT4gbG93ZXItY2FzZXMgQUxMIHJlbWFpbmluZyBjaGFyYWN0ZXJzIGluIGEgbWF0Y2guXG5cdCAqL1xuXHRwcml2YXRlIHJlcGxhY2VXaXRoQ2FzZU9wZXJhdGlvbnModGV4dDogc3RyaW5nLCByZWdleDogUmVnRXhwLCByZXBsYWNlU3RyaW5nOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdC8vIFNob3J0LWNpcmN1aXQgdGhlIGNvbW1vbiBwYXRoLlxuXHRcdGlmICghL1xcXFxbdVVsTF0vLnRlc3QocmVwbGFjZVN0cmluZykpIHtcblx0XHRcdHJldHVybiB0ZXh0LnJlcGxhY2UocmVnZXgsIHJlcGxhY2VTdHJpbmcpO1xuXHRcdH1cblx0XHQvLyBTdG9yZSB0aGUgdmFsdWVzIG9mIHRoZSBzZWFyY2ggcGFyYW1ldGVycy5cblx0XHRjb25zdCBmaXJzdE1hdGNoID0gcmVnZXguZXhlYyh0ZXh0KTtcblx0XHRpZiAoZmlyc3RNYXRjaCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRleHQucmVwbGFjZShyZWdleCwgcmVwbGFjZVN0cmluZyk7XG5cdFx0fVxuXG5cdFx0bGV0IHBhdE1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdGxldCBuZXdSZXBsYWNlU3RyaW5nID0gJyc7XG5cdFx0bGV0IGxhc3RJbmRleCA9IDA7XG5cdFx0bGV0IGxhc3RNYXRjaCA9ICcnO1xuXHRcdC8vIEZvciBlYWNoIGFubm90YXRlZCAkTiwgcGVyZm9ybSB0ZXh0IHByb2Nlc3Npbmcgb24gdGhlIHBhcmFtZXRlcnMgYW5kIHBlcmZvcm0gdGhlIHN1YnN0aXR1dGlvbi5cblx0XHR3aGlsZSAoKHBhdE1hdGNoID0gdGhpcy5fY2FzZU9wc1JlZ0V4cC5leGVjKHJlcGxhY2VTdHJpbmcpKSAhPT0gbnVsbCkge1xuXHRcdFx0bGFzdEluZGV4ID0gcGF0TWF0Y2guaW5kZXg7XG5cdFx0XHRjb25zdCBmdWxsTWF0Y2ggPSBwYXRNYXRjaFswXTtcblx0XHRcdGxhc3RNYXRjaCA9IGZ1bGxNYXRjaDtcblx0XHRcdGxldCBjYXNlT3BzID0gcGF0TWF0Y2hbMl07IC8vIFxcdSwgXFxsXFx1LCBldGMuXG5cdFx0XHRjb25zdCBtb25leSA9IHBhdE1hdGNoWzNdOyAvLyAkMSwgJDIsIGV0Yy5cblxuXHRcdFx0aWYgKCFjYXNlT3BzKSB7XG5cdFx0XHRcdG5ld1JlcGxhY2VTdHJpbmcgKz0gZnVsbE1hdGNoO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gZmlyc3RNYXRjaFtwYXJzZUludChtb25leS5zbGljZSgxKSldO1xuXHRcdFx0aWYgKCFyZXBsYWNlbWVudCkge1xuXHRcdFx0XHRuZXdSZXBsYWNlU3RyaW5nICs9IGZ1bGxNYXRjaDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXBsYWNlbWVudExlbiA9IHJlcGxhY2VtZW50Lmxlbmd0aDtcblxuXHRcdFx0bmV3UmVwbGFjZVN0cmluZyArPSBwYXRNYXRjaFsxXTsgLy8gcHJlZml4XG5cdFx0XHRjYXNlT3BzID0gY2FzZU9wcy5yZXBsYWNlKC9cXFxcL2csICcnKTtcblx0XHRcdGxldCBpID0gMDtcblx0XHRcdGZvciAoOyBpIDwgY2FzZU9wcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRzd2l0Y2ggKGNhc2VPcHNbaV0pIHtcblx0XHRcdFx0XHRjYXNlICdVJzpcblx0XHRcdFx0XHRcdG5ld1JlcGxhY2VTdHJpbmcgKz0gcmVwbGFjZW1lbnQuc2xpY2UoaSkudG9VcHBlckNhc2UoKTtcblx0XHRcdFx0XHRcdGkgPSByZXBsYWNlbWVudExlbjtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3UnOlxuXHRcdFx0XHRcdFx0bmV3UmVwbGFjZVN0cmluZyArPSByZXBsYWNlbWVudFtpXS50b1VwcGVyQ2FzZSgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnTCc6XG5cdFx0XHRcdFx0XHRuZXdSZXBsYWNlU3RyaW5nICs9IHJlcGxhY2VtZW50LnNsaWNlKGkpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRpID0gcmVwbGFjZW1lbnRMZW47XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdsJzpcblx0XHRcdFx0XHRcdG5ld1JlcGxhY2VTdHJpbmcgKz0gcmVwbGFjZW1lbnRbaV0udG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBBcHBlbmQgYW55IHJlbWFpbmluZyByZXBsYWNlbWVudCBzdHJpbmcgY29udGVudCBub3QgY292ZXJlZCBieSBjYXNlIG9wZXJhdGlvbnMuXG5cdFx0XHRpZiAoaSA8IHJlcGxhY2VtZW50TGVuKSB7XG5cdFx0XHRcdG5ld1JlcGxhY2VTdHJpbmcgKz0gcmVwbGFjZW1lbnQuc2xpY2UoaSk7XG5cdFx0XHR9XG5cblx0XHRcdG5ld1JlcGxhY2VTdHJpbmcgKz0gcGF0TWF0Y2hbNF07IC8vIHN1ZmZpeFxuXHRcdH1cblxuXHRcdC8vIEFwcGVuZCBhbnkgcmVtYWluaW5nIHRyYWlsaW5nIGNvbnRlbnQgYWZ0ZXIgdGhlIGZpbmFsIHJlZ2V4IG1hdGNoLlxuXHRcdG5ld1JlcGxhY2VTdHJpbmcgKz0gcmVwbGFjZVN0cmluZy5zbGljZShsYXN0SW5kZXggKyBsYXN0TWF0Y2gubGVuZ3RoKTtcblxuXHRcdHJldHVybiB0ZXh0LnJlcGxhY2UocmVnZXgsIG5ld1JlcGxhY2VTdHJpbmcpO1xuXHR9XG5cblx0cHVibGljIGJ1aWxkUmVwbGFjZVN0cmluZyhtYXRjaGVzOiBzdHJpbmdbXSB8IG51bGwsIHByZXNlcnZlQ2FzZT86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGlmIChwcmVzZXJ2ZUNhc2UpIHtcblx0XHRcdHJldHVybiBidWlsZFJlcGxhY2VTdHJpbmdXaXRoQ2FzZVByZXNlcnZlZChtYXRjaGVzLCB0aGlzLl9yZXBsYWNlUGF0dGVybik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXBsYWNlUGF0dGVybjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogXFxuID0+IExGXG5cdCAqIFxcdCA9PiBUQUJcblx0ICogXFxcXCA9PiBcXFxuXHQgKiAkMCA9PiAkJiAoc2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL1N0cmluZy9yZXBsYWNlI1NwZWNpZnlpbmdfYV9zdHJpbmdfYXNfYV9wYXJhbWV0ZXIpXG5cdCAqIGV2ZXJ5dGhpbmcgZWxzZSBzdGF5cyB1bnRvdWNoZWRcblx0ICovXG5cdHByaXZhdGUgcGFyc2VSZXBsYWNlU3RyaW5nKHJlcGxhY2VTdHJpbmc6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghcmVwbGFjZVN0cmluZyB8fCByZXBsYWNlU3RyaW5nLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzdWJzdHJGcm9tID0gMCwgcmVzdWx0ID0gJyc7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJlcGxhY2VTdHJpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGNoQ29kZSA9IHJlcGxhY2VTdHJpbmcuY2hhckNvZGVBdChpKTtcblxuXHRcdFx0aWYgKGNoQ29kZSA9PT0gQ2hhckNvZGUuQmFja3NsYXNoKSB7XG5cblx0XHRcdFx0Ly8gbW92ZSB0byBuZXh0IGNoYXJcblx0XHRcdFx0aSsrO1xuXG5cdFx0XHRcdGlmIChpID49IGxlbikge1xuXHRcdFx0XHRcdC8vIHN0cmluZyBlbmRzIHdpdGggYSBcXFxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmV4dENoQ29kZSA9IHJlcGxhY2VTdHJpbmcuY2hhckNvZGVBdChpKTtcblx0XHRcdFx0bGV0IHJlcGxhY2VXaXRoQ2hhcmFjdGVyOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0XHRzd2l0Y2ggKG5leHRDaENvZGUpIHtcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkJhY2tzbGFzaDpcblx0XHRcdFx0XHRcdC8vIFxcXFwgPT4gXFxcblx0XHRcdFx0XHRcdHJlcGxhY2VXaXRoQ2hhcmFjdGVyID0gJ1xcXFwnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5uOlxuXHRcdFx0XHRcdFx0Ly8gXFxuID0+IExGXG5cdFx0XHRcdFx0XHRyZXBsYWNlV2l0aENoYXJhY3RlciA9ICdcXG4nO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS50OlxuXHRcdFx0XHRcdFx0Ly8gXFx0ID0+IFRBQlxuXHRcdFx0XHRcdFx0cmVwbGFjZVdpdGhDaGFyYWN0ZXIgPSAnXFx0Jztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJlcGxhY2VXaXRoQ2hhcmFjdGVyKSB7XG5cdFx0XHRcdFx0cmVzdWx0ICs9IHJlcGxhY2VTdHJpbmcuc3Vic3RyaW5nKHN1YnN0ckZyb20sIGkgLSAxKSArIHJlcGxhY2VXaXRoQ2hhcmFjdGVyO1xuXHRcdFx0XHRcdHN1YnN0ckZyb20gPSBpICsgMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hDb2RlID09PSBDaGFyQ29kZS5Eb2xsYXJTaWduKSB7XG5cblx0XHRcdFx0Ly8gbW92ZSB0byBuZXh0IGNoYXJcblx0XHRcdFx0aSsrO1xuXG5cdFx0XHRcdGlmIChpID49IGxlbikge1xuXHRcdFx0XHRcdC8vIHN0cmluZyBlbmRzIHdpdGggYSAkXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuZXh0Q2hDb2RlID0gcmVwbGFjZVN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXHRcdFx0XHRsZXQgcmVwbGFjZVdpdGhDaGFyYWN0ZXI6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRcdHN3aXRjaCAobmV4dENoQ29kZSkge1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuRGlnaXQwOlxuXHRcdFx0XHRcdFx0Ly8gJDAgPT4gJCZcblx0XHRcdFx0XHRcdHJlcGxhY2VXaXRoQ2hhcmFjdGVyID0gJyQmJztcblx0XHRcdFx0XHRcdHRoaXMuX2hhc1BhcmFtZXRlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5CYWNrVGljazpcblx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLlNpbmdsZVF1b3RlOlxuXHRcdFx0XHRcdFx0dGhpcy5faGFzUGFyYW1ldGVycyA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0XHQvLyBjaGVjayBpZiBpdCBpcyBhIHZhbGlkIHN0cmluZyBwYXJhbWV0ZXIgJG4gKDAgPD0gbiA8PSA5OSkuICQwIGlzIGFscmVhZHkgaGFuZGxlZCBieSBub3cuXG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuYmV0d2VlbihuZXh0Q2hDb2RlLCBDaGFyQ29kZS5EaWdpdDEsIENoYXJDb2RlLkRpZ2l0OSkpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaSA9PT0gcmVwbGFjZVN0cmluZy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2hhc1BhcmFtZXRlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGxldCBjaGFyQ29kZSA9IHJlcGxhY2VTdHJpbmcuY2hhckNvZGVBdCgrK2kpO1xuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLmJldHdlZW4oY2hhckNvZGUsIENoYXJDb2RlLkRpZ2l0MCwgQ2hhckNvZGUuRGlnaXQ5KSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9oYXNQYXJhbWV0ZXJzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0LS1pO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpID09PSByZXBsYWNlU3RyaW5nLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5faGFzUGFyYW1ldGVycyA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2hhckNvZGUgPSByZXBsYWNlU3RyaW5nLmNoYXJDb2RlQXQoKytpKTtcblx0XHRcdFx0XHRcdGlmICghdGhpcy5iZXR3ZWVuKGNoYXJDb2RlLCBDaGFyQ29kZS5EaWdpdDAsIENoYXJDb2RlLkRpZ2l0OSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5faGFzUGFyYW1ldGVycyA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdC0taTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocmVwbGFjZVdpdGhDaGFyYWN0ZXIpIHtcblx0XHRcdFx0XHRyZXN1bHQgKz0gcmVwbGFjZVN0cmluZy5zdWJzdHJpbmcoc3Vic3RyRnJvbSwgaSAtIDEpICsgcmVwbGFjZVdpdGhDaGFyYWN0ZXI7XG5cdFx0XHRcdFx0c3Vic3RyRnJvbSA9IGkgKyAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN1YnN0ckZyb20gPT09IDApIHtcblx0XHRcdC8vIG5vIHJlcGxhY2VtZW50IG9jY3VycmVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVwbGFjZVBhdHRlcm4gPSByZXN1bHQgKyByZXBsYWNlU3RyaW5nLnN1YnN0cmluZyhzdWJzdHJGcm9tKTtcblx0fVxuXG5cdHByaXZhdGUgYmV0d2Vlbih2YWx1ZTogbnVtYmVyLCBmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZnJvbSA8PSB2YWx1ZSAmJiB2YWx1ZSA8PSB0bztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxhQUFhO0FBRXpCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkNBQTJDO0FBRTdDLE1BQU0sZUFBZTtBQUFB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
