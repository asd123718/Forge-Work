import { CharCode } from "../../../base/common/charCode.js";
import { illegalState } from "../../../base/common/errors.js";
import { localize } from "../../../nls.js";
var TokenType = /* @__PURE__ */ ((TokenType2) => {
  TokenType2[TokenType2["LParen"] = 0] = "LParen";
  TokenType2[TokenType2["RParen"] = 1] = "RParen";
  TokenType2[TokenType2["Neg"] = 2] = "Neg";
  TokenType2[TokenType2["Eq"] = 3] = "Eq";
  TokenType2[TokenType2["NotEq"] = 4] = "NotEq";
  TokenType2[TokenType2["Lt"] = 5] = "Lt";
  TokenType2[TokenType2["LtEq"] = 6] = "LtEq";
  TokenType2[TokenType2["Gt"] = 7] = "Gt";
  TokenType2[TokenType2["GtEq"] = 8] = "GtEq";
  TokenType2[TokenType2["RegexOp"] = 9] = "RegexOp";
  TokenType2[TokenType2["RegexStr"] = 10] = "RegexStr";
  TokenType2[TokenType2["True"] = 11] = "True";
  TokenType2[TokenType2["False"] = 12] = "False";
  TokenType2[TokenType2["In"] = 13] = "In";
  TokenType2[TokenType2["Not"] = 14] = "Not";
  TokenType2[TokenType2["And"] = 15] = "And";
  TokenType2[TokenType2["Or"] = 16] = "Or";
  TokenType2[TokenType2["Str"] = 17] = "Str";
  TokenType2[TokenType2["QuotedStr"] = 18] = "QuotedStr";
  TokenType2[TokenType2["Error"] = 19] = "Error";
  TokenType2[TokenType2["EOF"] = 20] = "EOF";
  return TokenType2;
})(TokenType || {});
function hintDidYouMean(...meant) {
  switch (meant.length) {
    case 1:
      return localize("contextkey.scanner.hint.didYouMean1", "Did you mean {0}?", meant[0]);
    case 2:
      return localize("contextkey.scanner.hint.didYouMean2", "Did you mean {0} or {1}?", meant[0], meant[1]);
    case 3:
      return localize("contextkey.scanner.hint.didYouMean3", "Did you mean {0}, {1} or {2}?", meant[0], meant[1], meant[2]);
    default:
      return void 0;
  }
}
const hintDidYouForgetToOpenOrCloseQuote = localize("contextkey.scanner.hint.didYouForgetToOpenOrCloseQuote", "Did you forget to open or close the quote?");
const hintDidYouForgetToEscapeSlash = localize("contextkey.scanner.hint.didYouForgetToEscapeSlash", "Did you forget to escape the '/' (slash) character? Put two backslashes before it to escape, e.g., '\\\\/'.");
const _Scanner = class _Scanner {
  constructor() {
    this._input = "";
    this._start = 0;
    this._current = 0;
    this._tokens = [];
    this._errors = [];
    // u - unicode, y - sticky // TODO@ulugbekna: we accept double quotes as part of the string rather than as a delimiter (to preserve old parser's behavior)
    this.stringRe = /[a-zA-Z0-9_<>\-\./\\:\*\?\+\[\]\^,#@;"%\$\p{L}-]+/uy;
  }
  static getLexeme(token) {
    switch (token.type) {
      case 0 /* LParen */:
        return "(";
      case 1 /* RParen */:
        return ")";
      case 2 /* Neg */:
        return "!";
      case 3 /* Eq */:
        return token.isTripleEq ? "===" : "==";
      case 4 /* NotEq */:
        return token.isTripleEq ? "!==" : "!=";
      case 5 /* Lt */:
        return "<";
      case 6 /* LtEq */:
        return "<=";
      case 7 /* Gt */:
        return ">";
      case 8 /* GtEq */:
        return ">=";
      case 9 /* RegexOp */:
        return "=~";
      case 10 /* RegexStr */:
        return token.lexeme;
      case 11 /* True */:
        return "true";
      case 12 /* False */:
        return "false";
      case 13 /* In */:
        return "in";
      case 14 /* Not */:
        return "not";
      case 15 /* And */:
        return "&&";
      case 16 /* Or */:
        return "||";
      case 17 /* Str */:
        return token.lexeme;
      case 18 /* QuotedStr */:
        return token.lexeme;
      case 19 /* Error */:
        return token.lexeme;
      case 20 /* EOF */:
        return "EOF";
      default:
        throw illegalState(`unhandled token type: ${JSON.stringify(token)}; have you forgotten to add a case?`);
    }
  }
  get errors() {
    return this._errors;
  }
  reset(value) {
    this._input = value;
    this._start = 0;
    this._current = 0;
    this._tokens = [];
    this._errors = [];
    return this;
  }
  scan() {
    while (!this._isAtEnd()) {
      this._start = this._current;
      const ch = this._advance();
      switch (ch) {
        case CharCode.OpenParen:
          this._addToken(0 /* LParen */);
          break;
        case CharCode.CloseParen:
          this._addToken(1 /* RParen */);
          break;
        case CharCode.ExclamationMark:
          if (this._match(CharCode.Equals)) {
            const isTripleEq = this._match(CharCode.Equals);
            this._tokens.push({ type: 4 /* NotEq */, offset: this._start, isTripleEq });
          } else {
            this._addToken(2 /* Neg */);
          }
          break;
        case CharCode.SingleQuote:
          this._quotedString();
          break;
        case CharCode.Slash:
          this._regex();
          break;
        case CharCode.Equals:
          if (this._match(CharCode.Equals)) {
            const isTripleEq = this._match(CharCode.Equals);
            this._tokens.push({ type: 3 /* Eq */, offset: this._start, isTripleEq });
          } else if (this._match(CharCode.Tilde)) {
            this._addToken(9 /* RegexOp */);
          } else {
            this._error(hintDidYouMean("==", "=~"));
          }
          break;
        case CharCode.LessThan:
          this._addToken(this._match(CharCode.Equals) ? 6 /* LtEq */ : 5 /* Lt */);
          break;
        case CharCode.GreaterThan:
          this._addToken(this._match(CharCode.Equals) ? 8 /* GtEq */ : 7 /* Gt */);
          break;
        case CharCode.Ampersand:
          if (this._match(CharCode.Ampersand)) {
            this._addToken(15 /* And */);
          } else {
            this._error(hintDidYouMean("&&"));
          }
          break;
        case CharCode.Pipe:
          if (this._match(CharCode.Pipe)) {
            this._addToken(16 /* Or */);
          } else {
            this._error(hintDidYouMean("||"));
          }
          break;
        // TODO@ulugbekna: 1) rewrite using a regex 2) reconsider what characters are considered whitespace, including unicode, nbsp, etc.
        case CharCode.Space:
        case CharCode.CarriageReturn:
        case CharCode.Tab:
        case CharCode.LineFeed:
        case CharCode.NoBreakSpace:
          break;
        default:
          this._string();
      }
    }
    this._start = this._current;
    this._addToken(20 /* EOF */);
    return Array.from(this._tokens);
  }
  _match(expected) {
    if (this._isAtEnd()) {
      return false;
    }
    if (this._input.charCodeAt(this._current) !== expected) {
      return false;
    }
    this._current++;
    return true;
  }
  _advance() {
    return this._input.charCodeAt(this._current++);
  }
  _peek() {
    return this._isAtEnd() ? CharCode.Null : this._input.charCodeAt(this._current);
  }
  _addToken(type) {
    this._tokens.push({ type, offset: this._start });
  }
  _error(additional) {
    const offset = this._start;
    const lexeme = this._input.substring(this._start, this._current);
    const errToken = { type: 19 /* Error */, offset: this._start, lexeme };
    this._errors.push({ offset, lexeme, additionalInfo: additional });
    this._tokens.push(errToken);
  }
  _string() {
    this.stringRe.lastIndex = this._start;
    const match = this.stringRe.exec(this._input);
    if (match) {
      this._current = this._start + match[0].length;
      const lexeme = this._input.substring(this._start, this._current);
      const keyword = _Scanner._keywords.get(lexeme);
      if (keyword) {
        this._addToken(keyword);
      } else {
        this._tokens.push({ type: 17 /* Str */, lexeme, offset: this._start });
      }
    }
  }
  // captures the lexeme without the leading and trailing '
  _quotedString() {
    while (this._peek() !== CharCode.SingleQuote && !this._isAtEnd()) {
      this._advance();
    }
    if (this._isAtEnd()) {
      this._error(hintDidYouForgetToOpenOrCloseQuote);
      return;
    }
    this._advance();
    this._tokens.push({ type: 18 /* QuotedStr */, lexeme: this._input.substring(this._start + 1, this._current - 1), offset: this._start + 1 });
  }
  /*
   * Lexing a regex expression: /.../[igsmyu]*
   * Based on https://github.com/microsoft/TypeScript/blob/9247ef115e617805983740ba795d7a8164babf89/src/compiler/scanner.ts#L2129-L2181
   *
   * Note that we want slashes within a regex to be escaped, e.g., /file:\\/\\/\\// should match `file:///`
   */
  _regex() {
    let p = this._current;
    let inEscape = false;
    let inCharacterClass = false;
    while (true) {
      if (p >= this._input.length) {
        this._current = p;
        this._error(hintDidYouForgetToEscapeSlash);
        return;
      }
      const ch = this._input.charCodeAt(p);
      if (inEscape) {
        inEscape = false;
      } else if (ch === CharCode.Slash && !inCharacterClass) {
        p++;
        break;
      } else if (ch === CharCode.OpenSquareBracket) {
        inCharacterClass = true;
      } else if (ch === CharCode.Backslash) {
        inEscape = true;
      } else if (ch === CharCode.CloseSquareBracket) {
        inCharacterClass = false;
      }
      p++;
    }
    while (p < this._input.length && _Scanner._regexFlags.has(this._input.charCodeAt(p))) {
      p++;
    }
    this._current = p;
    const lexeme = this._input.substring(this._start, this._current);
    this._tokens.push({ type: 10 /* RegexStr */, lexeme, offset: this._start });
  }
  _isAtEnd() {
    return this._current >= this._input.length;
  }
};
_Scanner._regexFlags = new Set(["i", "g", "s", "m", "y", "u"].map((ch) => ch.charCodeAt(0)));
_Scanner._keywords = /* @__PURE__ */ new Map([
  ["not", 14 /* Not */],
  ["in", 13 /* In */],
  ["false", 12 /* False */],
  ["true", 11 /* True */]
]);
let Scanner = _Scanner;
export {
  Scanner,
  TokenType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29udGV4dGtleVxcY29tbW9uXFxzY2FubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBpbGxlZ2FsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUb2tlblR5cGUge1xuXHRMUGFyZW4sXG5cdFJQYXJlbixcblx0TmVnLFxuXHRFcSxcblx0Tm90RXEsXG5cdEx0LFxuXHRMdEVxLFxuXHRHdCxcblx0R3RFcSxcblx0UmVnZXhPcCxcblx0UmVnZXhTdHIsXG5cdFRydWUsXG5cdEZhbHNlLFxuXHRJbixcblx0Tm90LFxuXHRBbmQsXG5cdE9yLFxuXHRTdHIsXG5cdFF1b3RlZFN0cixcblx0RXJyb3IsXG5cdEVPRixcbn1cblxuZXhwb3J0IHR5cGUgVG9rZW4gPVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLkxQYXJlbjsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLlJQYXJlbjsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLk5lZzsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLkVxOyBvZmZzZXQ6IG51bWJlcjsgaXNUcmlwbGVFcTogYm9vbGVhbiB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuTm90RXE7IG9mZnNldDogbnVtYmVyOyBpc1RyaXBsZUVxOiBib29sZWFuIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5MdDsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLkx0RXE7IG9mZnNldDogbnVtYmVyIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5HdDsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLkd0RXE7IG9mZnNldDogbnVtYmVyIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5SZWdleE9wOyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuUmVnZXhTdHI7IG9mZnNldDogbnVtYmVyOyBsZXhlbWU6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuVHJ1ZTsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLkZhbHNlOyBvZmZzZXQ6IG51bWJlciB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuSW47IG9mZnNldDogbnVtYmVyIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5Ob3Q7IG9mZnNldDogbnVtYmVyIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5BbmQ7IG9mZnNldDogbnVtYmVyIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5Pcjsgb2Zmc2V0OiBudW1iZXIgfVxuXHR8IHsgdHlwZTogVG9rZW5UeXBlLlN0cjsgb2Zmc2V0OiBudW1iZXI7IGxleGVtZTogc3RyaW5nIH1cblx0fCB7IHR5cGU6IFRva2VuVHlwZS5RdW90ZWRTdHI7IG9mZnNldDogbnVtYmVyOyBsZXhlbWU6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuRXJyb3I7IG9mZnNldDogbnVtYmVyOyBsZXhlbWU6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiBUb2tlblR5cGUuRU9GOyBvZmZzZXQ6IG51bWJlciB9O1xuXG50eXBlIEtleXdvcmRUb2tlblR5cGUgPSBUb2tlblR5cGUuTm90IHwgVG9rZW5UeXBlLkluIHwgVG9rZW5UeXBlLkZhbHNlIHwgVG9rZW5UeXBlLlRydWU7XG50eXBlIFRva2VuVHlwZVdpdGhvdXRMZXhlbWUgPVxuXHRUb2tlblR5cGUuTFBhcmVuIHxcblx0VG9rZW5UeXBlLlJQYXJlbiB8XG5cdFRva2VuVHlwZS5OZWcgfFxuXHRUb2tlblR5cGUuTHQgfFxuXHRUb2tlblR5cGUuTHRFcSB8XG5cdFRva2VuVHlwZS5HdCB8XG5cdFRva2VuVHlwZS5HdEVxIHxcblx0VG9rZW5UeXBlLlJlZ2V4T3AgfFxuXHRUb2tlblR5cGUuVHJ1ZSB8XG5cdFRva2VuVHlwZS5GYWxzZSB8XG5cdFRva2VuVHlwZS5JbiB8XG5cdFRva2VuVHlwZS5Ob3QgfFxuXHRUb2tlblR5cGUuQW5kIHxcblx0VG9rZW5UeXBlLk9yIHxcblx0VG9rZW5UeXBlLkVPRjtcblxuLyoqXG4gKiBFeGFtcGxlOlxuICogYGZvbyA9PSBiYXInYCAtIG5vdGUgaG93IHNpbmdsZSBxdW90ZSBkb2Vzbid0IGhhdmUgYSBjb3JyZXNwb25kaW5nIGNsb3NpbmcgcXVvdGUsXG4gKiBzbyBpdCdzIHJlcG9ydGVkIGFzIHVuZXhwZWN0ZWRcbiAqL1xuZXhwb3J0IHR5cGUgTGV4aW5nRXJyb3IgPSB7XG5cdG9mZnNldDogbnVtYmVyOyAvKiogbm90ZSB0aGF0IHRoaXMgZG9lc24ndCB0YWtlIGludG8gYWNjb3VudCBlc2NhcGUgY2hhcmFjdGVycyBmcm9tIHRoZSBvcmlnaW5hbCBlbmNvZGluZyBvZiB0aGUgc3RyaW5nLCBlLmcuLCB3aXRoaW4gYW4gZXh0ZW5zaW9uIG1hbmlmZXN0IGZpbGUncyBKU09OIGVuY29kaW5nICAqL1xuXHRsZXhlbWU6IHN0cmluZztcblx0YWRkaXRpb25hbEluZm8/OiBzdHJpbmc7XG59O1xuXG5mdW5jdGlvbiBoaW50RGlkWW91TWVhbiguLi5tZWFudDogc3RyaW5nW10pIHtcblx0c3dpdGNoIChtZWFudC5sZW5ndGgpIHtcblx0XHRjYXNlIDE6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRrZXkuc2Nhbm5lci5oaW50LmRpZFlvdU1lYW4xJywgXCJEaWQgeW91IG1lYW4gezB9P1wiLCBtZWFudFswXSk7XG5cdFx0Y2FzZSAyOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb250ZXh0a2V5LnNjYW5uZXIuaGludC5kaWRZb3VNZWFuMicsIFwiRGlkIHlvdSBtZWFuIHswfSBvciB7MX0/XCIsIG1lYW50WzBdLCBtZWFudFsxXSk7XG5cdFx0Y2FzZSAzOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb250ZXh0a2V5LnNjYW5uZXIuaGludC5kaWRZb3VNZWFuMycsIFwiRGlkIHlvdSBtZWFuIHswfSwgezF9IG9yIHsyfT9cIiwgbWVhbnRbMF0sIG1lYW50WzFdLCBtZWFudFsyXSk7XG5cdFx0ZGVmYXVsdDogLy8gd2UganVzdCBkb24ndCBleHBlY3QgdGhhdCBtYW55XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNvbnN0IGhpbnREaWRZb3VGb3JnZXRUb09wZW5PckNsb3NlUXVvdGUgPSBsb2NhbGl6ZSgnY29udGV4dGtleS5zY2FubmVyLmhpbnQuZGlkWW91Rm9yZ2V0VG9PcGVuT3JDbG9zZVF1b3RlJywgXCJEaWQgeW91IGZvcmdldCB0byBvcGVuIG9yIGNsb3NlIHRoZSBxdW90ZT9cIik7XG5jb25zdCBoaW50RGlkWW91Rm9yZ2V0VG9Fc2NhcGVTbGFzaCA9IGxvY2FsaXplKCdjb250ZXh0a2V5LnNjYW5uZXIuaGludC5kaWRZb3VGb3JnZXRUb0VzY2FwZVNsYXNoJywgXCJEaWQgeW91IGZvcmdldCB0byBlc2NhcGUgdGhlICcvJyAoc2xhc2gpIGNoYXJhY3Rlcj8gUHV0IHR3byBiYWNrc2xhc2hlcyBiZWZvcmUgaXQgdG8gZXNjYXBlLCBlLmcuLCAnXFxcXFxcXFwvXFwnLlwiKTtcblxuLyoqXG4gKiBBIHNpbXBsZSBzY2FubmVyIGZvciBjb250ZXh0IGtleXMuXG4gKlxuICogRXhhbXBsZTpcbiAqXG4gKiBgYGB0c1xuICogY29uc3Qgc2Nhbm5lciA9IG5ldyBTY2FubmVyKCkucmVzZXQoJ3Jlc291cmNlRmlsZU5hbWUgPX4gL2RvY2tlci8gJiYgIWNvbmZpZy5kb2NrZXIuZW5hYmxlZCcpO1xuICogY29uc3QgdG9rZW5zID0gWy4uLnNjYW5uZXJdO1xuICogaWYgKHNjYW5uZXIuZXJyb3JUb2tlbnMubGVuZ3RoID4gMCkge1xuICogICAgIHNjYW5uZXIuZXJyb3JUb2tlbnMuZm9yRWFjaChlcnIgPT4gY29uc29sZS5lcnJvcihgVW5leHBlY3RlZCB0b2tlbiBhdCAke2Vyci5vZmZzZXR9OiAke2Vyci5sZXhlbWV9XFxuSGludDogJHtlcnIuYWRkaXRpb25hbH1gKSk7XG4gKiB9IGVsc2Uge1xuICogICAgIC8vIHByb2Nlc3MgdG9rZW5zXG4gKiB9XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIFNjYW5uZXIge1xuXG5cdHN0YXRpYyBnZXRMZXhlbWUodG9rZW46IFRva2VuKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHRva2VuLnR5cGUpIHtcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkxQYXJlbjpcblx0XHRcdFx0cmV0dXJuICcoJztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLlJQYXJlbjpcblx0XHRcdFx0cmV0dXJuICcpJztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLk5lZzpcblx0XHRcdFx0cmV0dXJuICchJztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkVxOlxuXHRcdFx0XHRyZXR1cm4gdG9rZW4uaXNUcmlwbGVFcSA/ICc9PT0nIDogJz09Jztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLk5vdEVxOlxuXHRcdFx0XHRyZXR1cm4gdG9rZW4uaXNUcmlwbGVFcSA/ICchPT0nIDogJyE9Jztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkx0OlxuXHRcdFx0XHRyZXR1cm4gJzwnO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuTHRFcTpcblx0XHRcdFx0cmV0dXJuICc8PSc7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5HdDpcblx0XHRcdFx0cmV0dXJuICc+Jztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkd0RXE6XG5cdFx0XHRcdHJldHVybiAnPj0nO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuUmVnZXhPcDpcblx0XHRcdFx0cmV0dXJuICc9fic7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5SZWdleFN0cjpcblx0XHRcdFx0cmV0dXJuIHRva2VuLmxleGVtZTtcblx0XHRcdGNhc2UgVG9rZW5UeXBlLlRydWU6XG5cdFx0XHRcdHJldHVybiAndHJ1ZSc7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5GYWxzZTpcblx0XHRcdFx0cmV0dXJuICdmYWxzZSc7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5Jbjpcblx0XHRcdFx0cmV0dXJuICdpbic7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5Ob3Q6XG5cdFx0XHRcdHJldHVybiAnbm90Jztcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkFuZDpcblx0XHRcdFx0cmV0dXJuICcmJic7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5Pcjpcblx0XHRcdFx0cmV0dXJuICd8fCc7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5TdHI6XG5cdFx0XHRcdHJldHVybiB0b2tlbi5sZXhlbWU7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5RdW90ZWRTdHI6XG5cdFx0XHRcdHJldHVybiB0b2tlbi5sZXhlbWU7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5FcnJvcjpcblx0XHRcdFx0cmV0dXJuIHRva2VuLmxleGVtZTtcblx0XHRcdGNhc2UgVG9rZW5UeXBlLkVPRjpcblx0XHRcdFx0cmV0dXJuICdFT0YnO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgaWxsZWdhbFN0YXRlKGB1bmhhbmRsZWQgdG9rZW4gdHlwZTogJHtKU09OLnN0cmluZ2lmeSh0b2tlbil9OyBoYXZlIHlvdSBmb3Jnb3R0ZW4gdG8gYWRkIGEgY2FzZT9gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVnZXhGbGFncyA9IG5ldyBTZXQoWydpJywgJ2cnLCAncycsICdtJywgJ3knLCAndSddLm1hcChjaCA9PiBjaC5jaGFyQ29kZUF0KDApKSk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2tleXdvcmRzID0gbmV3IE1hcDxzdHJpbmcsIEtleXdvcmRUb2tlblR5cGU+KFtcblx0XHRbJ25vdCcsIFRva2VuVHlwZS5Ob3RdLFxuXHRcdFsnaW4nLCBUb2tlblR5cGUuSW5dLFxuXHRcdFsnZmFsc2UnLCBUb2tlblR5cGUuRmFsc2VdLFxuXHRcdFsndHJ1ZScsIFRva2VuVHlwZS5UcnVlXSxcblx0XSk7XG5cblx0cHJpdmF0ZSBfaW5wdXQ6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIF9zdGFydDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfY3VycmVudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfdG9rZW5zOiBUb2tlbltdID0gW107XG5cdHByaXZhdGUgX2Vycm9yczogTGV4aW5nRXJyb3JbXSA9IFtdO1xuXG5cdGdldCBlcnJvcnMoKTogUmVhZG9ubHk8TGV4aW5nRXJyb3JbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9lcnJvcnM7XG5cdH1cblxuXHRyZXNldCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5faW5wdXQgPSB2YWx1ZTtcblxuXHRcdHRoaXMuX3N0YXJ0ID0gMDtcblx0XHR0aGlzLl9jdXJyZW50ID0gMDtcblx0XHR0aGlzLl90b2tlbnMgPSBbXTtcblx0XHR0aGlzLl9lcnJvcnMgPSBbXTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0c2NhbigpIHtcblx0XHR3aGlsZSAoIXRoaXMuX2lzQXRFbmQoKSkge1xuXG5cdFx0XHR0aGlzLl9zdGFydCA9IHRoaXMuX2N1cnJlbnQ7XG5cblx0XHRcdGNvbnN0IGNoID0gdGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0c3dpdGNoIChjaCkge1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLk9wZW5QYXJlbjogdGhpcy5fYWRkVG9rZW4oVG9rZW5UeXBlLkxQYXJlbik7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkNsb3NlUGFyZW46IHRoaXMuX2FkZFRva2VuKFRva2VuVHlwZS5SUGFyZW4pOyBicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkV4Y2xhbWF0aW9uTWFyazpcblx0XHRcdFx0XHRpZiAodGhpcy5fbWF0Y2goQ2hhckNvZGUuRXF1YWxzKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXNUcmlwbGVFcSA9IHRoaXMuX21hdGNoKENoYXJDb2RlLkVxdWFscyk7IC8vIGVhdCBsYXN0IGA9YCBpZiBgIT09YFxuXHRcdFx0XHRcdFx0dGhpcy5fdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuTm90RXEsIG9mZnNldDogdGhpcy5fc3RhcnQsIGlzVHJpcGxlRXEgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2FkZFRva2VuKFRva2VuVHlwZS5OZWcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLlNpbmdsZVF1b3RlOiB0aGlzLl9xdW90ZWRTdHJpbmcoKTsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuU2xhc2g6IHRoaXMuX3JlZ2V4KCk7IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuRXF1YWxzOlxuXHRcdFx0XHRcdGlmICh0aGlzLl9tYXRjaChDaGFyQ29kZS5FcXVhbHMpKSB7IC8vIHN1cHBvcnQgYD09YFxuXHRcdFx0XHRcdFx0Y29uc3QgaXNUcmlwbGVFcSA9IHRoaXMuX21hdGNoKENoYXJDb2RlLkVxdWFscyk7IC8vIGVhdCBsYXN0IGA9YCBpZiBgPT09YFxuXHRcdFx0XHRcdFx0dGhpcy5fdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuRXEsIG9mZnNldDogdGhpcy5fc3RhcnQsIGlzVHJpcGxlRXEgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9tYXRjaChDaGFyQ29kZS5UaWxkZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2FkZFRva2VuKFRva2VuVHlwZS5SZWdleE9wKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3IoaGludERpZFlvdU1lYW4oJz09JywgJz1+JykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkxlc3NUaGFuOiB0aGlzLl9hZGRUb2tlbih0aGlzLl9tYXRjaChDaGFyQ29kZS5FcXVhbHMpID8gVG9rZW5UeXBlLkx0RXEgOiBUb2tlblR5cGUuTHQpOyBicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkdyZWF0ZXJUaGFuOiB0aGlzLl9hZGRUb2tlbih0aGlzLl9tYXRjaChDaGFyQ29kZS5FcXVhbHMpID8gVG9rZW5UeXBlLkd0RXEgOiBUb2tlblR5cGUuR3QpOyBicmVhaztcblxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkFtcGVyc2FuZDpcblx0XHRcdFx0XHRpZiAodGhpcy5fbWF0Y2goQ2hhckNvZGUuQW1wZXJzYW5kKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWRkVG9rZW4oVG9rZW5UeXBlLkFuZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2Vycm9yKGhpbnREaWRZb3VNZWFuKCcmJicpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5QaXBlOlxuXHRcdFx0XHRcdGlmICh0aGlzLl9tYXRjaChDaGFyQ29kZS5QaXBlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWRkVG9rZW4oVG9rZW5UeXBlLk9yKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fZXJyb3IoaGludERpZFlvdU1lYW4oJ3x8JykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHQvLyBUT0RPQHVsdWdiZWtuYTogMSkgcmV3cml0ZSB1c2luZyBhIHJlZ2V4IDIpIHJlY29uc2lkZXIgd2hhdCBjaGFyYWN0ZXJzIGFyZSBjb25zaWRlcmVkIHdoaXRlc3BhY2UsIGluY2x1ZGluZyB1bmljb2RlLCBuYnNwLCBldGMuXG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuQ2FycmlhZ2VSZXR1cm46XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuVGFiOlxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLkxpbmVGZWVkOlxuXHRcdFx0XHRjYXNlIENoYXJDb2RlLk5vQnJlYWtTcGFjZTogLy8gJm5ic3Bcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRoaXMuX3N0cmluZygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXJ0ID0gdGhpcy5fY3VycmVudDtcblx0XHR0aGlzLl9hZGRUb2tlbihUb2tlblR5cGUuRU9GKTtcblxuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX3Rva2Vucyk7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaChleHBlY3RlZDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2lzQXRFbmQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faW5wdXQuY2hhckNvZGVBdCh0aGlzLl9jdXJyZW50KSAhPT0gZXhwZWN0ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudCsrO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWR2YW5jZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dC5jaGFyQ29kZUF0KHRoaXMuX2N1cnJlbnQrKyk7XG5cdH1cblxuXHRwcml2YXRlIF9wZWVrKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzQXRFbmQoKSA/IENoYXJDb2RlLk51bGwgOiB0aGlzLl9pbnB1dC5jaGFyQ29kZUF0KHRoaXMuX2N1cnJlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkVG9rZW4odHlwZTogVG9rZW5UeXBlV2l0aG91dExleGVtZSkge1xuXHRcdHRoaXMuX3Rva2Vucy5wdXNoKHsgdHlwZSwgb2Zmc2V0OiB0aGlzLl9zdGFydCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2Vycm9yKGFkZGl0aW9uYWw/OiBzdHJpbmcpIHtcblx0XHRjb25zdCBvZmZzZXQgPSB0aGlzLl9zdGFydDtcblx0XHRjb25zdCBsZXhlbWUgPSB0aGlzLl9pbnB1dC5zdWJzdHJpbmcodGhpcy5fc3RhcnQsIHRoaXMuX2N1cnJlbnQpO1xuXHRcdGNvbnN0IGVyclRva2VuOiBUb2tlbiA9IHsgdHlwZTogVG9rZW5UeXBlLkVycm9yLCBvZmZzZXQ6IHRoaXMuX3N0YXJ0LCBsZXhlbWUgfTtcblx0XHR0aGlzLl9lcnJvcnMucHVzaCh7IG9mZnNldCwgbGV4ZW1lLCBhZGRpdGlvbmFsSW5mbzogYWRkaXRpb25hbCB9KTtcblx0XHR0aGlzLl90b2tlbnMucHVzaChlcnJUb2tlbik7XG5cdH1cblxuXHQvLyB1IC0gdW5pY29kZSwgeSAtIHN0aWNreSAvLyBUT0RPQHVsdWdiZWtuYTogd2UgYWNjZXB0IGRvdWJsZSBxdW90ZXMgYXMgcGFydCBvZiB0aGUgc3RyaW5nIHJhdGhlciB0aGFuIGFzIGEgZGVsaW1pdGVyICh0byBwcmVzZXJ2ZSBvbGQgcGFyc2VyJ3MgYmVoYXZpb3IpXG5cdHByaXZhdGUgc3RyaW5nUmUgPSAvW2EtekEtWjAtOV88PlxcLVxcLi9cXFxcOlxcKlxcP1xcK1xcW1xcXVxcXiwjQDtcIiVcXCRcXHB7TH0tXSsvdXk7XG5cdHByaXZhdGUgX3N0cmluZygpIHtcblx0XHR0aGlzLnN0cmluZ1JlLmxhc3RJbmRleCA9IHRoaXMuX3N0YXJ0O1xuXHRcdGNvbnN0IG1hdGNoID0gdGhpcy5zdHJpbmdSZS5leGVjKHRoaXMuX2lucHV0KTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnQgPSB0aGlzLl9zdGFydCArIG1hdGNoWzBdLmxlbmd0aDtcblx0XHRcdGNvbnN0IGxleGVtZSA9IHRoaXMuX2lucHV0LnN1YnN0cmluZyh0aGlzLl9zdGFydCwgdGhpcy5fY3VycmVudCk7XG5cdFx0XHRjb25zdCBrZXl3b3JkID0gU2Nhbm5lci5fa2V5d29yZHMuZ2V0KGxleGVtZSk7XG5cdFx0XHRpZiAoa2V5d29yZCkge1xuXHRcdFx0XHR0aGlzLl9hZGRUb2tlbihrZXl3b3JkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Rva2Vucy5wdXNoKHsgdHlwZTogVG9rZW5UeXBlLlN0ciwgbGV4ZW1lLCBvZmZzZXQ6IHRoaXMuX3N0YXJ0IH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIGNhcHR1cmVzIHRoZSBsZXhlbWUgd2l0aG91dCB0aGUgbGVhZGluZyBhbmQgdHJhaWxpbmcgJ1xuXHRwcml2YXRlIF9xdW90ZWRTdHJpbmcoKSB7XG5cdFx0d2hpbGUgKHRoaXMuX3BlZWsoKSAhPT0gQ2hhckNvZGUuU2luZ2xlUXVvdGUgJiYgIXRoaXMuX2lzQXRFbmQoKSkgeyAvLyBUT0RPQHVsdWdiZWtuYTogYWRkIHN1cHBvcnQgZm9yIGVzY2FwaW5nICcgP1xuXHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc0F0RW5kKCkpIHtcblx0XHRcdHRoaXMuX2Vycm9yKGhpbnREaWRZb3VGb3JnZXRUb09wZW5PckNsb3NlUXVvdGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGNvbnN1bWUgdGhlIGNsb3NpbmcgJ1xuXHRcdHRoaXMuX2FkdmFuY2UoKTtcblxuXHRcdHRoaXMuX3Rva2Vucy5wdXNoKHsgdHlwZTogVG9rZW5UeXBlLlF1b3RlZFN0ciwgbGV4ZW1lOiB0aGlzLl9pbnB1dC5zdWJzdHJpbmcodGhpcy5fc3RhcnQgKyAxLCB0aGlzLl9jdXJyZW50IC0gMSksIG9mZnNldDogdGhpcy5fc3RhcnQgKyAxIH0pO1xuXHR9XG5cblx0Lypcblx0ICogTGV4aW5nIGEgcmVnZXggZXhwcmVzc2lvbjogLy4uLi9baWdzbXl1XSpcblx0ICogQmFzZWQgb24gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9UeXBlU2NyaXB0L2Jsb2IvOTI0N2VmMTE1ZTYxNzgwNTk4Mzc0MGJhNzk1ZDdhODE2NGJhYmY4OS9zcmMvY29tcGlsZXIvc2Nhbm5lci50cyNMMjEyOS1MMjE4MVxuXHQgKlxuXHQgKiBOb3RlIHRoYXQgd2Ugd2FudCBzbGFzaGVzIHdpdGhpbiBhIHJlZ2V4IHRvIGJlIGVzY2FwZWQsIGUuZy4sIC9maWxlOlxcXFwvXFxcXC9cXFxcLy8gc2hvdWxkIG1hdGNoIGBmaWxlOi8vL2Bcblx0ICovXG5cdHByaXZhdGUgX3JlZ2V4KCkge1xuXHRcdGxldCBwID0gdGhpcy5fY3VycmVudDtcblxuXHRcdGxldCBpbkVzY2FwZSA9IGZhbHNlO1xuXHRcdGxldCBpbkNoYXJhY3RlckNsYXNzID0gZmFsc2U7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGlmIChwID49IHRoaXMuX2lucHV0Lmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50ID0gcDtcblx0XHRcdFx0dGhpcy5fZXJyb3IoaGludERpZFlvdUZvcmdldFRvRXNjYXBlU2xhc2gpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoID0gdGhpcy5faW5wdXQuY2hhckNvZGVBdChwKTtcblxuXHRcdFx0aWYgKGluRXNjYXBlKSB7IC8vIHBhcnNpbmcgYW4gZXNjYXBlIGNoYXJhY3RlclxuXHRcdFx0XHRpbkVzY2FwZSA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gQ2hhckNvZGUuU2xhc2ggJiYgIWluQ2hhcmFjdGVyQ2xhc3MpIHsgLy8gZW5kIG9mIHJlZ2V4XG5cdFx0XHRcdHArKztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2UgaWYgKGNoID09PSBDaGFyQ29kZS5PcGVuU3F1YXJlQnJhY2tldCkge1xuXHRcdFx0XHRpbkNoYXJhY3RlckNsYXNzID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoY2ggPT09IENoYXJDb2RlLkJhY2tzbGFzaCkge1xuXHRcdFx0XHRpbkVzY2FwZSA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKGNoID09PSBDaGFyQ29kZS5DbG9zZVNxdWFyZUJyYWNrZXQpIHtcblx0XHRcdFx0aW5DaGFyYWN0ZXJDbGFzcyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cCsrO1xuXHRcdH1cblxuXHRcdC8vIENvbnN1bWUgZmxhZ3MgLy8gVE9ET0B1bHVnYmVrbmE6IHVzZSByZWdleCBpbnN0ZWFkXG5cdFx0d2hpbGUgKHAgPCB0aGlzLl9pbnB1dC5sZW5ndGggJiYgU2Nhbm5lci5fcmVnZXhGbGFncy5oYXModGhpcy5faW5wdXQuY2hhckNvZGVBdChwKSkpIHtcblx0XHRcdHArKztcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50ID0gcDtcblxuXHRcdGNvbnN0IGxleGVtZSA9IHRoaXMuX2lucHV0LnN1YnN0cmluZyh0aGlzLl9zdGFydCwgdGhpcy5fY3VycmVudCk7XG5cdFx0dGhpcy5fdG9rZW5zLnB1c2goeyB0eXBlOiBUb2tlblR5cGUuUmVnZXhTdHIsIGxleGVtZSwgb2Zmc2V0OiB0aGlzLl9zdGFydCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQXRFbmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnQgPj0gdGhpcy5faW5wdXQubGVuZ3RoO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdC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TSxvQkFBcUIsUUFBUSxLQUFLLE9BQU8sVUFBVSxLQUFLLFNBQVMsR0FBRyxLQUFLLFdBQVcsQ0FBQyxHQUFHLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztBQUFBLEVBQzVJO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSxTQUFTO0FBQ2hCLFFBQUksSUFBSSxLQUFLO0FBRWIsUUFBSSxXQUFXO0FBQ2YsUUFBSSxtQkFBbUI7QUFDdkIsV0FBTyxNQUFNO0FBQ1osVUFBSSxLQUFLLEtBQUssT0FBTyxRQUFRO0FBQzVCLGFBQUssV0FBVztBQUNoQixhQUFLLE9BQU8sNkJBQTZCO0FBQ3pDO0FBQUEsTUFDRDtBQUVBLFlBQU0sS0FBSyxLQUFLLE9BQU8sV0FBVyxDQUFDO0FBRW5DLFVBQUksVUFBVTtBQUNiLG1CQUFXO0FBQUEsTUFDWixXQUFXLE9BQU8sU0FBUyxTQUFTLENBQUMsa0JBQWtCO0FBQ3REO0FBQ0E7QUFBQSxNQUNELFdBQVcsT0FBTyxTQUFTLG1CQUFtQjtBQUM3QywyQkFBbUI7QUFBQSxNQUNwQixXQUFXLE9BQU8sU0FBUyxXQUFXO0FBQ3JDLG1CQUFXO0FBQUEsTUFDWixXQUFXLE9BQU8sU0FBUyxvQkFBb0I7QUFDOUMsMkJBQW1CO0FBQUEsTUFDcEI7QUFDQTtBQUFBLElBQ0Q7QUFHQSxXQUFPLElBQUksS0FBSyxPQUFPLFVBQVUsU0FBUSxZQUFZLElBQUksS0FBSyxPQUFPLFdBQVcsQ0FBQyxDQUFDLEdBQUc7QUFDcEY7QUFBQSxJQUNEO0FBRUEsU0FBSyxXQUFXO0FBRWhCLFVBQU0sU0FBUyxLQUFLLE9BQU8sVUFBVSxLQUFLLFFBQVEsS0FBSyxRQUFRO0FBQy9ELFNBQUssUUFBUSxLQUFLLEVBQUUsTUFBTSxtQkFBb0IsUUFBUSxRQUFRLEtBQUssT0FBTyxDQUFDO0FBQUEsRUFDNUU7QUFBQSxFQUVRLFdBQVc7QUFDbEIsV0FBTyxLQUFLLFlBQVksS0FBSyxPQUFPO0FBQUEsRUFDckM7QUFDRDtBQTNRYSxTQW1ERyxjQUFjLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxHQUFHLEVBQUUsSUFBSSxRQUFNLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQztBQW5EbkYsU0FxREcsWUFBWSxvQkFBSSxJQUE4QjtBQUFBLEVBQzVELENBQUMsT0FBTyxZQUFhO0FBQUEsRUFDckIsQ0FBQyxNQUFNLFdBQVk7QUFBQSxFQUNuQixDQUFDLFNBQVMsY0FBZTtBQUFBLEVBQ3pCLENBQUMsUUFBUSxhQUFjO0FBQ3hCLENBQUM7QUExREssSUFBTSxVQUFOOyIsCiAgIm5hbWVzIjogWyJUb2tlblR5cGUiXQp9Cg==
