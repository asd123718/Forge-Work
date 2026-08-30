var ScanError = /* @__PURE__ */ ((ScanError2) => {
  ScanError2[ScanError2["None"] = 0] = "None";
  ScanError2[ScanError2["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
  ScanError2[ScanError2["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
  ScanError2[ScanError2["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
  ScanError2[ScanError2["InvalidUnicode"] = 4] = "InvalidUnicode";
  ScanError2[ScanError2["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
  ScanError2[ScanError2["InvalidCharacter"] = 6] = "InvalidCharacter";
  return ScanError2;
})(ScanError || {});
var SyntaxKind = /* @__PURE__ */ ((SyntaxKind2) => {
  SyntaxKind2[SyntaxKind2["OpenBraceToken"] = 1] = "OpenBraceToken";
  SyntaxKind2[SyntaxKind2["CloseBraceToken"] = 2] = "CloseBraceToken";
  SyntaxKind2[SyntaxKind2["OpenBracketToken"] = 3] = "OpenBracketToken";
  SyntaxKind2[SyntaxKind2["CloseBracketToken"] = 4] = "CloseBracketToken";
  SyntaxKind2[SyntaxKind2["CommaToken"] = 5] = "CommaToken";
  SyntaxKind2[SyntaxKind2["ColonToken"] = 6] = "ColonToken";
  SyntaxKind2[SyntaxKind2["NullKeyword"] = 7] = "NullKeyword";
  SyntaxKind2[SyntaxKind2["TrueKeyword"] = 8] = "TrueKeyword";
  SyntaxKind2[SyntaxKind2["FalseKeyword"] = 9] = "FalseKeyword";
  SyntaxKind2[SyntaxKind2["StringLiteral"] = 10] = "StringLiteral";
  SyntaxKind2[SyntaxKind2["NumericLiteral"] = 11] = "NumericLiteral";
  SyntaxKind2[SyntaxKind2["LineCommentTrivia"] = 12] = "LineCommentTrivia";
  SyntaxKind2[SyntaxKind2["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
  SyntaxKind2[SyntaxKind2["LineBreakTrivia"] = 14] = "LineBreakTrivia";
  SyntaxKind2[SyntaxKind2["Trivia"] = 15] = "Trivia";
  SyntaxKind2[SyntaxKind2["Unknown"] = 16] = "Unknown";
  SyntaxKind2[SyntaxKind2["EOF"] = 17] = "EOF";
  return SyntaxKind2;
})(SyntaxKind || {});
var ParseErrorCode = /* @__PURE__ */ ((ParseErrorCode2) => {
  ParseErrorCode2[ParseErrorCode2["InvalidSymbol"] = 1] = "InvalidSymbol";
  ParseErrorCode2[ParseErrorCode2["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
  ParseErrorCode2[ParseErrorCode2["PropertyNameExpected"] = 3] = "PropertyNameExpected";
  ParseErrorCode2[ParseErrorCode2["ValueExpected"] = 4] = "ValueExpected";
  ParseErrorCode2[ParseErrorCode2["ColonExpected"] = 5] = "ColonExpected";
  ParseErrorCode2[ParseErrorCode2["CommaExpected"] = 6] = "CommaExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBraceExpected"] = 7] = "CloseBraceExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBracketExpected"] = 8] = "CloseBracketExpected";
  ParseErrorCode2[ParseErrorCode2["EndOfFileExpected"] = 9] = "EndOfFileExpected";
  ParseErrorCode2[ParseErrorCode2["InvalidCommentToken"] = 10] = "InvalidCommentToken";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
  ParseErrorCode2[ParseErrorCode2["InvalidUnicode"] = 14] = "InvalidUnicode";
  ParseErrorCode2[ParseErrorCode2["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
  ParseErrorCode2[ParseErrorCode2["InvalidCharacter"] = 16] = "InvalidCharacter";
  return ParseErrorCode2;
})(ParseErrorCode || {});
var ParseOptions;
((ParseOptions2) => {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: true
  };
})(ParseOptions || (ParseOptions = {}));
function createScanner(text, ignoreTrivia = false) {
  let pos = 0;
  const len = text.length;
  let value = "";
  let tokenOffset = 0;
  let token = 16 /* Unknown */;
  let scanError = 0 /* None */;
  function scanHexDigits(count) {
    let digits = 0;
    let hexValue = 0;
    while (digits < count) {
      const ch = text.charCodeAt(pos);
      if (ch >= 48 /* _0 */ && ch <= 57 /* _9 */) {
        hexValue = hexValue * 16 + ch - 48 /* _0 */;
      } else if (ch >= 65 /* A */ && ch <= 70 /* F */) {
        hexValue = hexValue * 16 + ch - 65 /* A */ + 10;
      } else if (ch >= 97 /* a */ && ch <= 102 /* f */) {
        hexValue = hexValue * 16 + ch - 97 /* a */ + 10;
      } else {
        break;
      }
      pos++;
      digits++;
    }
    if (digits < count) {
      hexValue = -1;
    }
    return hexValue;
  }
  function setPosition(newPosition) {
    pos = newPosition;
    value = "";
    tokenOffset = 0;
    token = 16 /* Unknown */;
    scanError = 0 /* None */;
  }
  function scanNumber() {
    const start = pos;
    if (text.charCodeAt(pos) === 48 /* _0 */) {
      pos++;
    } else {
      pos++;
      while (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text.length && text.charCodeAt(pos) === 46 /* dot */) {
      pos++;
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3 /* UnexpectedEndOfNumber */;
        return text.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text.length && (text.charCodeAt(pos) === 69 /* E */ || text.charCodeAt(pos) === 101 /* e */)) {
      pos++;
      if (pos < text.length && text.charCodeAt(pos) === 43 /* plus */ || text.charCodeAt(pos) === 45 /* minus */) {
        pos++;
      }
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3 /* UnexpectedEndOfNumber */;
      }
    }
    return text.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text.substring(start, pos);
        scanError = 2 /* UnexpectedEndOfString */;
        break;
      }
      const ch = text.charCodeAt(pos);
      if (ch === 34 /* doubleQuote */) {
        result += text.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92 /* backslash */) {
        result += text.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2 /* UnexpectedEndOfString */;
          break;
        }
        const ch2 = text.charCodeAt(pos++);
        switch (ch2) {
          case 34 /* doubleQuote */:
            result += '"';
            break;
          case 92 /* backslash */:
            result += "\\";
            break;
          case 47 /* slash */:
            result += "/";
            break;
          case 98 /* b */:
            result += "\b";
            break;
          case 102 /* f */:
            result += "\f";
            break;
          case 110 /* n */:
            result += "\n";
            break;
          case 114 /* r */:
            result += "\r";
            break;
          case 116 /* t */:
            result += "	";
            break;
          case 117 /* u */: {
            const ch3 = scanHexDigits(4);
            if (ch3 >= 0) {
              result += String.fromCharCode(ch3);
            } else {
              scanError = 4 /* InvalidUnicode */;
            }
            break;
          }
          default:
            scanError = 5 /* InvalidEscapeCharacter */;
        }
        start = pos;
        continue;
      }
      if (ch >= 0 && ch <= 31) {
        if (isLineBreak(ch)) {
          result += text.substring(start, pos);
          scanError = 2 /* UnexpectedEndOfString */;
          break;
        } else {
          scanError = 6 /* InvalidCharacter */;
        }
      }
      pos++;
    }
    return result;
  }
  function scanNext() {
    value = "";
    scanError = 0 /* None */;
    tokenOffset = pos;
    if (pos >= len) {
      tokenOffset = len;
      return token = 17 /* EOF */;
    }
    let code = text.charCodeAt(pos);
    if (isWhitespace(code)) {
      do {
        pos++;
        value += String.fromCharCode(code);
        code = text.charCodeAt(pos);
      } while (isWhitespace(code));
      return token = 15 /* Trivia */;
    }
    if (isLineBreak(code)) {
      pos++;
      value += String.fromCharCode(code);
      if (code === 13 /* carriageReturn */ && text.charCodeAt(pos) === 10 /* lineFeed */) {
        pos++;
        value += "\n";
      }
      return token = 14 /* LineBreakTrivia */;
    }
    switch (code) {
      // tokens: []{}:,
      case 123 /* openBrace */:
        pos++;
        return token = 1 /* OpenBraceToken */;
      case 125 /* closeBrace */:
        pos++;
        return token = 2 /* CloseBraceToken */;
      case 91 /* openBracket */:
        pos++;
        return token = 3 /* OpenBracketToken */;
      case 93 /* closeBracket */:
        pos++;
        return token = 4 /* CloseBracketToken */;
      case 58 /* colon */:
        pos++;
        return token = 6 /* ColonToken */;
      case 44 /* comma */:
        pos++;
        return token = 5 /* CommaToken */;
      // strings
      case 34 /* doubleQuote */:
        pos++;
        value = scanString();
        return token = 10 /* StringLiteral */;
      // comments
      case 47 /* slash */: {
        const start = pos - 1;
        if (text.charCodeAt(pos + 1) === 47 /* slash */) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text.substring(start, pos);
          return token = 12 /* LineCommentTrivia */;
        }
        if (text.charCodeAt(pos + 1) === 42 /* asterisk */) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text.charCodeAt(pos);
            if (ch === 42 /* asterisk */ && text.charCodeAt(pos + 1) === 47 /* slash */) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
          }
          if (!commentClosed) {
            pos++;
            scanError = 1 /* UnexpectedEndOfComment */;
          }
          value = text.substring(start, pos);
          return token = 13 /* BlockCommentTrivia */;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16 /* Unknown */;
      }
      // numbers
      case 45 /* minus */:
        value += String.fromCharCode(code);
        pos++;
        if (pos === len || !isDigit(text.charCodeAt(pos))) {
          return token = 16 /* Unknown */;
        }
      // found a minus, followed by a number so
      // we fall through to proceed with scanning
      // numbers
      case 48 /* _0 */:
      case 49 /* _1 */:
      case 50 /* _2 */:
      case 51 /* _3 */:
      case 52 /* _4 */:
      case 53 /* _5 */:
      case 54 /* _6 */:
      case 55 /* _7 */:
      case 56 /* _8 */:
      case 57 /* _9 */:
        value += scanNumber();
        return token = 11 /* NumericLiteral */;
      // literals and unknown symbols
      default:
        while (pos < len && isUnknownContentCharacter(code)) {
          pos++;
          code = text.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text.substring(tokenOffset, pos);
          switch (value) {
            case "true":
              return token = 8 /* TrueKeyword */;
            case "false":
              return token = 9 /* FalseKeyword */;
            case "null":
              return token = 7 /* NullKeyword */;
          }
          return token = 16 /* Unknown */;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16 /* Unknown */;
    }
  }
  function isUnknownContentCharacter(code) {
    if (isWhitespace(code) || isLineBreak(code)) {
      return false;
    }
    switch (code) {
      case 125 /* closeBrace */:
      case 93 /* closeBracket */:
      case 123 /* openBrace */:
      case 91 /* openBracket */:
      case 34 /* doubleQuote */:
      case 58 /* colon */:
      case 44 /* comma */:
      case 47 /* slash */:
        return false;
    }
    return true;
  }
  function scanNextNonTrivia() {
    let result;
    do {
      result = scanNext();
    } while (result >= 12 /* LineCommentTrivia */ && result <= 15 /* Trivia */);
    return result;
  }
  return {
    setPosition,
    getPosition: () => pos,
    scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
    getToken: () => token,
    getTokenValue: () => value,
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenError: () => scanError
  };
}
function isWhitespace(ch) {
  return ch === 32 /* space */ || ch === 9 /* tab */ || ch === 11 /* verticalTab */ || ch === 12 /* formFeed */ || ch === 160 /* nonBreakingSpace */ || ch === 5760 /* ogham */ || ch >= 8192 /* enQuad */ && ch <= 8203 /* zeroWidthSpace */ || ch === 8239 /* narrowNoBreakSpace */ || ch === 8287 /* mathematicalSpace */ || ch === 12288 /* ideographicSpace */ || ch === 65279 /* byteOrderMark */;
}
function isLineBreak(ch) {
  return ch === 10 /* lineFeed */ || ch === 13 /* carriageReturn */ || ch === 8232 /* lineSeparator */ || ch === 8233 /* paragraphSeparator */;
}
function isDigit(ch) {
  return ch >= 48 /* _0 */ && ch <= 57 /* _9 */;
}
var CharacterCodes = /* @__PURE__ */ ((CharacterCodes2) => {
  CharacterCodes2[CharacterCodes2["nullCharacter"] = 0] = "nullCharacter";
  CharacterCodes2[CharacterCodes2["maxAsciiCharacter"] = 127] = "maxAsciiCharacter";
  CharacterCodes2[CharacterCodes2["lineFeed"] = 10] = "lineFeed";
  CharacterCodes2[CharacterCodes2["carriageReturn"] = 13] = "carriageReturn";
  CharacterCodes2[CharacterCodes2["lineSeparator"] = 8232] = "lineSeparator";
  CharacterCodes2[CharacterCodes2["paragraphSeparator"] = 8233] = "paragraphSeparator";
  CharacterCodes2[CharacterCodes2["nextLine"] = 133] = "nextLine";
  CharacterCodes2[CharacterCodes2["space"] = 32] = "space";
  CharacterCodes2[CharacterCodes2["nonBreakingSpace"] = 160] = "nonBreakingSpace";
  CharacterCodes2[CharacterCodes2["enQuad"] = 8192] = "enQuad";
  CharacterCodes2[CharacterCodes2["emQuad"] = 8193] = "emQuad";
  CharacterCodes2[CharacterCodes2["enSpace"] = 8194] = "enSpace";
  CharacterCodes2[CharacterCodes2["emSpace"] = 8195] = "emSpace";
  CharacterCodes2[CharacterCodes2["threePerEmSpace"] = 8196] = "threePerEmSpace";
  CharacterCodes2[CharacterCodes2["fourPerEmSpace"] = 8197] = "fourPerEmSpace";
  CharacterCodes2[CharacterCodes2["sixPerEmSpace"] = 8198] = "sixPerEmSpace";
  CharacterCodes2[CharacterCodes2["figureSpace"] = 8199] = "figureSpace";
  CharacterCodes2[CharacterCodes2["punctuationSpace"] = 8200] = "punctuationSpace";
  CharacterCodes2[CharacterCodes2["thinSpace"] = 8201] = "thinSpace";
  CharacterCodes2[CharacterCodes2["hairSpace"] = 8202] = "hairSpace";
  CharacterCodes2[CharacterCodes2["zeroWidthSpace"] = 8203] = "zeroWidthSpace";
  CharacterCodes2[CharacterCodes2["narrowNoBreakSpace"] = 8239] = "narrowNoBreakSpace";
  CharacterCodes2[CharacterCodes2["ideographicSpace"] = 12288] = "ideographicSpace";
  CharacterCodes2[CharacterCodes2["mathematicalSpace"] = 8287] = "mathematicalSpace";
  CharacterCodes2[CharacterCodes2["ogham"] = 5760] = "ogham";
  CharacterCodes2[CharacterCodes2["_"] = 95] = "_";
  CharacterCodes2[CharacterCodes2["$"] = 36] = "$";
  CharacterCodes2[CharacterCodes2["_0"] = 48] = "_0";
  CharacterCodes2[CharacterCodes2["_1"] = 49] = "_1";
  CharacterCodes2[CharacterCodes2["_2"] = 50] = "_2";
  CharacterCodes2[CharacterCodes2["_3"] = 51] = "_3";
  CharacterCodes2[CharacterCodes2["_4"] = 52] = "_4";
  CharacterCodes2[CharacterCodes2["_5"] = 53] = "_5";
  CharacterCodes2[CharacterCodes2["_6"] = 54] = "_6";
  CharacterCodes2[CharacterCodes2["_7"] = 55] = "_7";
  CharacterCodes2[CharacterCodes2["_8"] = 56] = "_8";
  CharacterCodes2[CharacterCodes2["_9"] = 57] = "_9";
  CharacterCodes2[CharacterCodes2["a"] = 97] = "a";
  CharacterCodes2[CharacterCodes2["b"] = 98] = "b";
  CharacterCodes2[CharacterCodes2["c"] = 99] = "c";
  CharacterCodes2[CharacterCodes2["d"] = 100] = "d";
  CharacterCodes2[CharacterCodes2["e"] = 101] = "e";
  CharacterCodes2[CharacterCodes2["f"] = 102] = "f";
  CharacterCodes2[CharacterCodes2["g"] = 103] = "g";
  CharacterCodes2[CharacterCodes2["h"] = 104] = "h";
  CharacterCodes2[CharacterCodes2["i"] = 105] = "i";
  CharacterCodes2[CharacterCodes2["j"] = 106] = "j";
  CharacterCodes2[CharacterCodes2["k"] = 107] = "k";
  CharacterCodes2[CharacterCodes2["l"] = 108] = "l";
  CharacterCodes2[CharacterCodes2["m"] = 109] = "m";
  CharacterCodes2[CharacterCodes2["n"] = 110] = "n";
  CharacterCodes2[CharacterCodes2["o"] = 111] = "o";
  CharacterCodes2[CharacterCodes2["p"] = 112] = "p";
  CharacterCodes2[CharacterCodes2["q"] = 113] = "q";
  CharacterCodes2[CharacterCodes2["r"] = 114] = "r";
  CharacterCodes2[CharacterCodes2["s"] = 115] = "s";
  CharacterCodes2[CharacterCodes2["t"] = 116] = "t";
  CharacterCodes2[CharacterCodes2["u"] = 117] = "u";
  CharacterCodes2[CharacterCodes2["v"] = 118] = "v";
  CharacterCodes2[CharacterCodes2["w"] = 119] = "w";
  CharacterCodes2[CharacterCodes2["x"] = 120] = "x";
  CharacterCodes2[CharacterCodes2["y"] = 121] = "y";
  CharacterCodes2[CharacterCodes2["z"] = 122] = "z";
  CharacterCodes2[CharacterCodes2["A"] = 65] = "A";
  CharacterCodes2[CharacterCodes2["B"] = 66] = "B";
  CharacterCodes2[CharacterCodes2["C"] = 67] = "C";
  CharacterCodes2[CharacterCodes2["D"] = 68] = "D";
  CharacterCodes2[CharacterCodes2["E"] = 69] = "E";
  CharacterCodes2[CharacterCodes2["F"] = 70] = "F";
  CharacterCodes2[CharacterCodes2["G"] = 71] = "G";
  CharacterCodes2[CharacterCodes2["H"] = 72] = "H";
  CharacterCodes2[CharacterCodes2["I"] = 73] = "I";
  CharacterCodes2[CharacterCodes2["J"] = 74] = "J";
  CharacterCodes2[CharacterCodes2["K"] = 75] = "K";
  CharacterCodes2[CharacterCodes2["L"] = 76] = "L";
  CharacterCodes2[CharacterCodes2["M"] = 77] = "M";
  CharacterCodes2[CharacterCodes2["N"] = 78] = "N";
  CharacterCodes2[CharacterCodes2["O"] = 79] = "O";
  CharacterCodes2[CharacterCodes2["P"] = 80] = "P";
  CharacterCodes2[CharacterCodes2["Q"] = 81] = "Q";
  CharacterCodes2[CharacterCodes2["R"] = 82] = "R";
  CharacterCodes2[CharacterCodes2["S"] = 83] = "S";
  CharacterCodes2[CharacterCodes2["T"] = 84] = "T";
  CharacterCodes2[CharacterCodes2["U"] = 85] = "U";
  CharacterCodes2[CharacterCodes2["V"] = 86] = "V";
  CharacterCodes2[CharacterCodes2["W"] = 87] = "W";
  CharacterCodes2[CharacterCodes2["X"] = 88] = "X";
  CharacterCodes2[CharacterCodes2["Y"] = 89] = "Y";
  CharacterCodes2[CharacterCodes2["Z"] = 90] = "Z";
  CharacterCodes2[CharacterCodes2["ampersand"] = 38] = "ampersand";
  CharacterCodes2[CharacterCodes2["asterisk"] = 42] = "asterisk";
  CharacterCodes2[CharacterCodes2["at"] = 64] = "at";
  CharacterCodes2[CharacterCodes2["backslash"] = 92] = "backslash";
  CharacterCodes2[CharacterCodes2["bar"] = 124] = "bar";
  CharacterCodes2[CharacterCodes2["caret"] = 94] = "caret";
  CharacterCodes2[CharacterCodes2["closeBrace"] = 125] = "closeBrace";
  CharacterCodes2[CharacterCodes2["closeBracket"] = 93] = "closeBracket";
  CharacterCodes2[CharacterCodes2["closeParen"] = 41] = "closeParen";
  CharacterCodes2[CharacterCodes2["colon"] = 58] = "colon";
  CharacterCodes2[CharacterCodes2["comma"] = 44] = "comma";
  CharacterCodes2[CharacterCodes2["dot"] = 46] = "dot";
  CharacterCodes2[CharacterCodes2["doubleQuote"] = 34] = "doubleQuote";
  CharacterCodes2[CharacterCodes2["equals"] = 61] = "equals";
  CharacterCodes2[CharacterCodes2["exclamation"] = 33] = "exclamation";
  CharacterCodes2[CharacterCodes2["greaterThan"] = 62] = "greaterThan";
  CharacterCodes2[CharacterCodes2["lessThan"] = 60] = "lessThan";
  CharacterCodes2[CharacterCodes2["minus"] = 45] = "minus";
  CharacterCodes2[CharacterCodes2["openBrace"] = 123] = "openBrace";
  CharacterCodes2[CharacterCodes2["openBracket"] = 91] = "openBracket";
  CharacterCodes2[CharacterCodes2["openParen"] = 40] = "openParen";
  CharacterCodes2[CharacterCodes2["percent"] = 37] = "percent";
  CharacterCodes2[CharacterCodes2["plus"] = 43] = "plus";
  CharacterCodes2[CharacterCodes2["question"] = 63] = "question";
  CharacterCodes2[CharacterCodes2["semicolon"] = 59] = "semicolon";
  CharacterCodes2[CharacterCodes2["singleQuote"] = 39] = "singleQuote";
  CharacterCodes2[CharacterCodes2["slash"] = 47] = "slash";
  CharacterCodes2[CharacterCodes2["tilde"] = 126] = "tilde";
  CharacterCodes2[CharacterCodes2["backspace"] = 8] = "backspace";
  CharacterCodes2[CharacterCodes2["formFeed"] = 12] = "formFeed";
  CharacterCodes2[CharacterCodes2["byteOrderMark"] = 65279] = "byteOrderMark";
  CharacterCodes2[CharacterCodes2["tab"] = 9] = "tab";
  CharacterCodes2[CharacterCodes2["verticalTab"] = 11] = "verticalTab";
  return CharacterCodes2;
})(CharacterCodes || {});
function getLocation(text, position) {
  const segments = [];
  const earlyReturnException = new Object();
  let previousNode = void 0;
  const previousNodeInst = {
    value: {},
    offset: 0,
    length: 0,
    type: "object",
    parent: void 0
  };
  let isAtPropertyKey = false;
  function setPreviousNode(value, offset, length, type) {
    previousNodeInst.value = value;
    previousNodeInst.offset = offset;
    previousNodeInst.length = length;
    previousNodeInst.type = type;
    previousNodeInst.colonOffset = void 0;
    previousNode = previousNodeInst;
  }
  try {
    visit(text, {
      onObjectBegin: (offset, length) => {
        if (position <= offset) {
          throw earlyReturnException;
        }
        previousNode = void 0;
        isAtPropertyKey = position > offset;
        segments.push("");
      },
      onObjectProperty: (name, offset, length) => {
        if (position < offset) {
          throw earlyReturnException;
        }
        setPreviousNode(name, offset, length, "property");
        segments[segments.length - 1] = name;
        if (position <= offset + length) {
          throw earlyReturnException;
        }
      },
      onObjectEnd: (offset, length) => {
        if (position <= offset) {
          throw earlyReturnException;
        }
        previousNode = void 0;
        segments.pop();
      },
      onArrayBegin: (offset, length) => {
        if (position <= offset) {
          throw earlyReturnException;
        }
        previousNode = void 0;
        segments.push(0);
      },
      onArrayEnd: (offset, length) => {
        if (position <= offset) {
          throw earlyReturnException;
        }
        previousNode = void 0;
        segments.pop();
      },
      onLiteralValue: (value, offset, length) => {
        if (position < offset) {
          throw earlyReturnException;
        }
        setPreviousNode(value, offset, length, getNodeType(value));
        if (position <= offset + length) {
          throw earlyReturnException;
        }
      },
      onSeparator: (sep, offset, length) => {
        if (position <= offset) {
          throw earlyReturnException;
        }
        if (sep === ":" && previousNode && previousNode.type === "property") {
          previousNode.colonOffset = offset;
          isAtPropertyKey = false;
          previousNode = void 0;
        } else if (sep === ",") {
          const last = segments[segments.length - 1];
          if (typeof last === "number") {
            segments[segments.length - 1] = last + 1;
          } else {
            isAtPropertyKey = true;
            segments[segments.length - 1] = "";
          }
          previousNode = void 0;
        }
      }
    });
  } catch (e) {
    if (e !== earlyReturnException) {
      throw e;
    }
  }
  return {
    path: segments,
    previousNode,
    isAtPropertyKey,
    matches: (pattern) => {
      let k = 0;
      for (let i = 0; k < pattern.length && i < segments.length; i++) {
        if (pattern[k] === segments[i] || pattern[k] === "*") {
          k++;
        } else if (pattern[k] !== "**") {
          return false;
        }
      }
      return k === pattern.length;
    }
  };
}
function parse(text, errors = [], options = ParseOptions.DEFAULT) {
  let currentProperty = null;
  let currentParent = [];
  const previousParents = [];
  function onValue(value) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value);
    } else if (currentProperty !== null) {
      currentParent[currentProperty] = value;
    }
  }
  const visitor = {
    onObjectBegin: () => {
      const object = {};
      onValue(object);
      previousParents.push(currentParent);
      currentParent = object;
      currentProperty = null;
    },
    onObjectProperty: (name) => {
      currentProperty = name;
    },
    onObjectEnd: () => {
      currentParent = previousParents.pop();
    },
    onArrayBegin: () => {
      const array = [];
      onValue(array);
      previousParents.push(currentParent);
      currentParent = array;
      currentProperty = null;
    },
    onArrayEnd: () => {
      currentParent = previousParents.pop();
    },
    onLiteralValue: onValue,
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text, visitor, options);
  return currentParent[0];
}
function parseTree(text, errors = [], options = ParseOptions.DEFAULT) {
  let currentParent = { type: "array", offset: -1, length: -1, children: [], parent: void 0 };
  function ensurePropertyComplete(endOffset) {
    if (currentParent.type === "property") {
      currentParent.length = endOffset - currentParent.offset;
      currentParent = currentParent.parent;
    }
  }
  function onValue(valueNode) {
    currentParent.children.push(valueNode);
    return valueNode;
  }
  const visitor = {
    onObjectBegin: (offset) => {
      currentParent = onValue({ type: "object", offset, length: -1, parent: currentParent, children: [] });
    },
    onObjectProperty: (name, offset, length) => {
      currentParent = onValue({ type: "property", offset, length: -1, parent: currentParent, children: [] });
      currentParent.children.push({ type: "string", value: name, offset, length, parent: currentParent });
    },
    onObjectEnd: (offset, length) => {
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onArrayBegin: (offset, length) => {
      currentParent = onValue({ type: "array", offset, length: -1, parent: currentParent, children: [] });
    },
    onArrayEnd: (offset, length) => {
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onLiteralValue: (value, offset, length) => {
      onValue({ type: getNodeType(value), offset, length, parent: currentParent, value });
      ensurePropertyComplete(offset + length);
    },
    onSeparator: (sep, offset, length) => {
      if (currentParent.type === "property") {
        if (sep === ":") {
          currentParent.colonOffset = offset;
        } else if (sep === ",") {
          ensurePropertyComplete(offset);
        }
      }
    },
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text, visitor, options);
  const result = currentParent.children[0];
  if (result) {
    delete result.parent;
  }
  return result;
}
function findNodeAtLocation(root, path) {
  if (!root) {
    return void 0;
  }
  let node = root;
  for (const segment of path) {
    if (typeof segment === "string") {
      if (node.type !== "object" || !Array.isArray(node.children)) {
        return void 0;
      }
      let found = false;
      for (const propertyNode of node.children) {
        if (Array.isArray(propertyNode.children) && propertyNode.children[0].value === segment) {
          node = propertyNode.children[1];
          found = true;
          break;
        }
      }
      if (!found) {
        return void 0;
      }
    } else {
      const index = segment;
      if (node.type !== "array" || index < 0 || !Array.isArray(node.children) || index >= node.children.length) {
        return void 0;
      }
      node = node.children[index];
    }
  }
  return node;
}
function getNodePath(node) {
  if (!node.parent || !node.parent.children) {
    return [];
  }
  const path = getNodePath(node.parent);
  if (node.parent.type === "property") {
    const key = node.parent.children[0].value;
    path.push(key);
  } else if (node.parent.type === "array") {
    const index = node.parent.children.indexOf(node);
    if (index !== -1) {
      path.push(index);
    }
  }
  return path;
}
function getNodeValue(node) {
  switch (node.type) {
    case "array":
      return node.children.map(getNodeValue);
    case "object": {
      const obj = /* @__PURE__ */ Object.create(null);
      for (const prop of node.children) {
        const valueNode = prop.children[1];
        if (valueNode) {
          obj[prop.children[0].value] = getNodeValue(valueNode);
        }
      }
      return obj;
    }
    case "null":
    case "string":
    case "number":
    case "boolean":
      return node.value;
    default:
      return void 0;
  }
}
function contains(node, offset, includeRightBound = false) {
  return offset >= node.offset && offset < node.offset + node.length || includeRightBound && offset === node.offset + node.length;
}
function findNodeAtOffset(node, offset, includeRightBound = false) {
  if (contains(node, offset, includeRightBound)) {
    const children = node.children;
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length && children[i].offset <= offset; i++) {
        const item = findNodeAtOffset(children[i], offset, includeRightBound);
        if (item) {
          return item;
        }
      }
    }
    return node;
  }
  return void 0;
}
function visit(text, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text, false);
  function toNoArgVisit(visitFunction) {
    return visitFunction ? () => visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength()) : () => true;
  }
  function toOneArgVisit(visitFunction) {
    return visitFunction ? (arg) => visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength()) : () => true;
  }
  const onObjectBegin = toNoArgVisit(visitor.onObjectBegin), onObjectProperty = toOneArgVisit(visitor.onObjectProperty), onObjectEnd = toNoArgVisit(visitor.onObjectEnd), onArrayBegin = toNoArgVisit(visitor.onArrayBegin), onArrayEnd = toNoArgVisit(visitor.onArrayEnd), onLiteralValue = toOneArgVisit(visitor.onLiteralValue), onSeparator = toOneArgVisit(visitor.onSeparator), onComment = toNoArgVisit(visitor.onComment), onError = toOneArgVisit(visitor.onError);
  const disallowComments = options && options.disallowComments;
  const allowTrailingComma = options && options.allowTrailingComma;
  function scanNext() {
    while (true) {
      const token = _scanner.scan();
      switch (_scanner.getTokenError()) {
        case 4 /* InvalidUnicode */:
          handleError(14 /* InvalidUnicode */);
          break;
        case 5 /* InvalidEscapeCharacter */:
          handleError(15 /* InvalidEscapeCharacter */);
          break;
        case 3 /* UnexpectedEndOfNumber */:
          handleError(13 /* UnexpectedEndOfNumber */);
          break;
        case 1 /* UnexpectedEndOfComment */:
          if (!disallowComments) {
            handleError(11 /* UnexpectedEndOfComment */);
          }
          break;
        case 2 /* UnexpectedEndOfString */:
          handleError(12 /* UnexpectedEndOfString */);
          break;
        case 6 /* InvalidCharacter */:
          handleError(16 /* InvalidCharacter */);
          break;
      }
      switch (token) {
        case 12 /* LineCommentTrivia */:
        case 13 /* BlockCommentTrivia */:
          if (disallowComments) {
            handleError(10 /* InvalidCommentToken */);
          } else {
            onComment();
          }
          break;
        case 16 /* Unknown */:
          handleError(1 /* InvalidSymbol */);
          break;
        case 15 /* Trivia */:
        case 14 /* LineBreakTrivia */:
          break;
        default:
          return token;
      }
    }
  }
  function handleError(error, skipUntilAfter = [], skipUntil = []) {
    onError(error);
    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token = _scanner.getToken();
      while (token !== 17 /* EOF */) {
        if (skipUntilAfter.indexOf(token) !== -1) {
          scanNext();
          break;
        } else if (skipUntil.indexOf(token) !== -1) {
          break;
        }
        token = scanNext();
      }
    }
  }
  function parseString(isValue) {
    const value = _scanner.getTokenValue();
    if (isValue) {
      onLiteralValue(value);
    } else {
      onObjectProperty(value);
    }
    scanNext();
    return true;
  }
  function parseLiteral() {
    switch (_scanner.getToken()) {
      case 11 /* NumericLiteral */: {
        let value = 0;
        try {
          value = JSON.parse(_scanner.getTokenValue());
          if (typeof value !== "number") {
            handleError(2 /* InvalidNumberFormat */);
            value = 0;
          }
        } catch (e) {
          handleError(2 /* InvalidNumberFormat */);
        }
        onLiteralValue(value);
        break;
      }
      case 7 /* NullKeyword */:
        onLiteralValue(null);
        break;
      case 8 /* TrueKeyword */:
        onLiteralValue(true);
        break;
      case 9 /* FalseKeyword */:
        onLiteralValue(false);
        break;
      default:
        return false;
    }
    scanNext();
    return true;
  }
  function parseProperty() {
    if (_scanner.getToken() !== 10 /* StringLiteral */) {
      handleError(3 /* PropertyNameExpected */, [], [2 /* CloseBraceToken */, 5 /* CommaToken */]);
      return false;
    }
    parseString(false);
    if (_scanner.getToken() === 6 /* ColonToken */) {
      onSeparator(":");
      scanNext();
      if (!parseValue()) {
        handleError(4 /* ValueExpected */, [], [2 /* CloseBraceToken */, 5 /* CommaToken */]);
      }
    } else {
      handleError(5 /* ColonExpected */, [], [2 /* CloseBraceToken */, 5 /* CommaToken */]);
    }
    return true;
  }
  function parseObject() {
    onObjectBegin();
    scanNext();
    let needsComma = false;
    while (_scanner.getToken() !== 2 /* CloseBraceToken */ && _scanner.getToken() !== 17 /* EOF */) {
      if (_scanner.getToken() === 5 /* CommaToken */) {
        if (!needsComma) {
          handleError(4 /* ValueExpected */, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 2 /* CloseBraceToken */ && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6 /* CommaExpected */, [], []);
      }
      if (!parseProperty()) {
        handleError(4 /* ValueExpected */, [], [2 /* CloseBraceToken */, 5 /* CommaToken */]);
      }
      needsComma = true;
    }
    onObjectEnd();
    if (_scanner.getToken() !== 2 /* CloseBraceToken */) {
      handleError(7 /* CloseBraceExpected */, [2 /* CloseBraceToken */], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseArray() {
    onArrayBegin();
    scanNext();
    let needsComma = false;
    while (_scanner.getToken() !== 4 /* CloseBracketToken */ && _scanner.getToken() !== 17 /* EOF */) {
      if (_scanner.getToken() === 5 /* CommaToken */) {
        if (!needsComma) {
          handleError(4 /* ValueExpected */, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 4 /* CloseBracketToken */ && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6 /* CommaExpected */, [], []);
      }
      if (!parseValue()) {
        handleError(4 /* ValueExpected */, [], [4 /* CloseBracketToken */, 5 /* CommaToken */]);
      }
      needsComma = true;
    }
    onArrayEnd();
    if (_scanner.getToken() !== 4 /* CloseBracketToken */) {
      handleError(8 /* CloseBracketExpected */, [4 /* CloseBracketToken */], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseValue() {
    switch (_scanner.getToken()) {
      case 3 /* OpenBracketToken */:
        return parseArray();
      case 1 /* OpenBraceToken */:
        return parseObject();
      case 10 /* StringLiteral */:
        return parseString(true);
      default:
        return parseLiteral();
    }
  }
  scanNext();
  if (_scanner.getToken() === 17 /* EOF */) {
    if (options.allowEmptyContent) {
      return true;
    }
    handleError(4 /* ValueExpected */, [], []);
    return false;
  }
  if (!parseValue()) {
    handleError(4 /* ValueExpected */, [], []);
    return false;
  }
  if (_scanner.getToken() !== 17 /* EOF */) {
    handleError(9 /* EndOfFileExpected */, [], []);
  }
  return true;
}
function getNodeType(value) {
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object": {
      if (!value) {
        return "null";
      } else if (Array.isArray(value)) {
        return "array";
      }
      return "object";
    }
    default:
      return "null";
  }
}
export {
  ParseErrorCode,
  ParseOptions,
  ScanError,
  SyntaxKind,
  contains,
  createScanner,
  findNodeAtLocation,
  findNodeAtOffset,
  getLocation,
  getNodePath,
  getNodeType,
  getNodeValue,
  parse,
  parseTree,
  visit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGpzb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5leHBvcnQgY29uc3QgZW51bSBTY2FuRXJyb3Ige1xuXHROb25lID0gMCxcblx0VW5leHBlY3RlZEVuZE9mQ29tbWVudCA9IDEsXG5cdFVuZXhwZWN0ZWRFbmRPZlN0cmluZyA9IDIsXG5cdFVuZXhwZWN0ZWRFbmRPZk51bWJlciA9IDMsXG5cdEludmFsaWRVbmljb2RlID0gNCxcblx0SW52YWxpZEVzY2FwZUNoYXJhY3RlciA9IDUsXG5cdEludmFsaWRDaGFyYWN0ZXIgPSA2XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFN5bnRheEtpbmQge1xuXHRPcGVuQnJhY2VUb2tlbiA9IDEsXG5cdENsb3NlQnJhY2VUb2tlbiA9IDIsXG5cdE9wZW5CcmFja2V0VG9rZW4gPSAzLFxuXHRDbG9zZUJyYWNrZXRUb2tlbiA9IDQsXG5cdENvbW1hVG9rZW4gPSA1LFxuXHRDb2xvblRva2VuID0gNixcblx0TnVsbEtleXdvcmQgPSA3LFxuXHRUcnVlS2V5d29yZCA9IDgsXG5cdEZhbHNlS2V5d29yZCA9IDksXG5cdFN0cmluZ0xpdGVyYWwgPSAxMCxcblx0TnVtZXJpY0xpdGVyYWwgPSAxMSxcblx0TGluZUNvbW1lbnRUcml2aWEgPSAxMixcblx0QmxvY2tDb21tZW50VHJpdmlhID0gMTMsXG5cdExpbmVCcmVha1RyaXZpYSA9IDE0LFxuXHRUcml2aWEgPSAxNSxcblx0VW5rbm93biA9IDE2LFxuXHRFT0YgPSAxN1xufVxuXG4vKipcbiAqIFRoZSBzY2FubmVyIG9iamVjdCwgcmVwcmVzZW50aW5nIGEgSlNPTiBzY2FubmVyIGF0IGEgcG9zaXRpb24gaW4gdGhlIGlucHV0IHN0cmluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBKU09OU2Nhbm5lciB7XG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBzY2FuIHBvc2l0aW9uIHRvIGEgbmV3IG9mZnNldC4gQSBjYWxsIHRvICdzY2FuJyBpcyBuZWVkZWQgdG8gZ2V0IHRoZSBmaXJzdCB0b2tlbi5cblx0ICovXG5cdHNldFBvc2l0aW9uKHBvczogbnVtYmVyKTogdm9pZDtcblx0LyoqXG5cdCAqIFJlYWQgdGhlIG5leHQgdG9rZW4uIFJldHVybnMgdGhlIHRva2VuIGNvZGUuXG5cdCAqL1xuXHRzY2FuKCk6IFN5bnRheEtpbmQ7XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNjYW4gcG9zaXRpb24sIHdoaWNoIGlzIGFmdGVyIHRoZSBsYXN0IHJlYWQgdG9rZW4uXG5cdCAqL1xuXHRnZXRQb3NpdGlvbigpOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBsYXN0IHJlYWQgdG9rZW4uXG5cdCAqL1xuXHRnZXRUb2tlbigpOiBTeW50YXhLaW5kO1xuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbGFzdCByZWFkIHRva2VuIHZhbHVlLiBUaGUgdmFsdWUgZm9yIHN0cmluZ3MgaXMgdGhlIGRlY29kZWQgc3RyaW5nIGNvbnRlbnQuIEZvciBudW1iZXJzIGl0cyBvZiB0eXBlIG51bWJlciwgZm9yIGJvb2xlYW4gaXQncyB0cnVlIG9yIGZhbHNlLlxuXHQgKi9cblx0Z2V0VG9rZW5WYWx1ZSgpOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgc3RhcnQgb2Zmc2V0IG9mIHRoZSBsYXN0IHJlYWQgdG9rZW4uXG5cdCAqL1xuXHRnZXRUb2tlbk9mZnNldCgpOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgbGVuZ3RoIG9mIHRoZSBsYXN0IHJlYWQgdG9rZW4uXG5cdCAqL1xuXHRnZXRUb2tlbkxlbmd0aCgpOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBBbiBlcnJvciBjb2RlIG9mIHRoZSBsYXN0IHNjYW4uXG5cdCAqL1xuXHRnZXRUb2tlbkVycm9yKCk6IFNjYW5FcnJvcjtcbn1cblxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VFcnJvciB7XG5cdGVycm9yOiBQYXJzZUVycm9yQ29kZTtcblx0b2Zmc2V0OiBudW1iZXI7XG5cdGxlbmd0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBQYXJzZUVycm9yQ29kZSB7XG5cdEludmFsaWRTeW1ib2wgPSAxLFxuXHRJbnZhbGlkTnVtYmVyRm9ybWF0ID0gMixcblx0UHJvcGVydHlOYW1lRXhwZWN0ZWQgPSAzLFxuXHRWYWx1ZUV4cGVjdGVkID0gNCxcblx0Q29sb25FeHBlY3RlZCA9IDUsXG5cdENvbW1hRXhwZWN0ZWQgPSA2LFxuXHRDbG9zZUJyYWNlRXhwZWN0ZWQgPSA3LFxuXHRDbG9zZUJyYWNrZXRFeHBlY3RlZCA9IDgsXG5cdEVuZE9mRmlsZUV4cGVjdGVkID0gOSxcblx0SW52YWxpZENvbW1lbnRUb2tlbiA9IDEwLFxuXHRVbmV4cGVjdGVkRW5kT2ZDb21tZW50ID0gMTEsXG5cdFVuZXhwZWN0ZWRFbmRPZlN0cmluZyA9IDEyLFxuXHRVbmV4cGVjdGVkRW5kT2ZOdW1iZXIgPSAxMyxcblx0SW52YWxpZFVuaWNvZGUgPSAxNCxcblx0SW52YWxpZEVzY2FwZUNoYXJhY3RlciA9IDE1LFxuXHRJbnZhbGlkQ2hhcmFjdGVyID0gMTZcbn1cblxuZXhwb3J0IHR5cGUgTm9kZVR5cGUgPSAnb2JqZWN0JyB8ICdhcnJheScgfCAncHJvcGVydHknIHwgJ3N0cmluZycgfCAnbnVtYmVyJyB8ICdib29sZWFuJyB8ICdudWxsJztcblxuZXhwb3J0IGludGVyZmFjZSBOb2RlIHtcblx0cmVhZG9ubHkgdHlwZTogTm9kZVR5cGU7XG5cdHJlYWRvbmx5IHZhbHVlPzogYW55O1xuXHRyZWFkb25seSBvZmZzZXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbGVuZ3RoOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNvbG9uT2Zmc2V0PzogbnVtYmVyO1xuXHRyZWFkb25seSBwYXJlbnQ/OiBOb2RlO1xuXHRyZWFkb25seSBjaGlsZHJlbj86IE5vZGVbXTtcbn1cblxuZXhwb3J0IHR5cGUgU2VnbWVudCA9IHN0cmluZyB8IG51bWJlcjtcbmV4cG9ydCB0eXBlIEpTT05QYXRoID0gU2VnbWVudFtdO1xuXG5leHBvcnQgaW50ZXJmYWNlIExvY2F0aW9uIHtcblx0LyoqXG5cdCAqIFRoZSBwcmV2aW91cyBwcm9wZXJ0eSBrZXkgb3IgbGl0ZXJhbCB2YWx1ZSAoc3RyaW5nLCBudW1iZXIsIGJvb2xlYW4gb3IgbnVsbCkgb3IgdW5kZWZpbmVkLlxuXHQgKi9cblx0cHJldmlvdXNOb2RlPzogTm9kZTtcblx0LyoqXG5cdCAqIFRoZSBwYXRoIGRlc2NyaWJpbmcgdGhlIGxvY2F0aW9uIGluIHRoZSBKU09OIGRvY3VtZW50LiBUaGUgcGF0aCBjb25zaXN0cyBvZiBhIHNlcXVlbmNlIHN0cmluZ3Ncblx0ICogcmVwcmVzZW50aW5nIGFuIG9iamVjdCBwcm9wZXJ0eSBvciBudW1iZXJzIGZvciBhcnJheSBpbmRpY2VzLlxuXHQgKi9cblx0cGF0aDogSlNPTlBhdGg7XG5cdC8qKlxuXHQgKiBNYXRjaGVzIHRoZSBsb2NhdGlvbnMgcGF0aCBhZ2FpbnN0IGEgcGF0dGVybiBjb25zaXN0aW5nIG9mIHN0cmluZ3MgKGZvciBwcm9wZXJ0aWVzKSBhbmQgbnVtYmVycyAoZm9yIGFycmF5IGluZGljZXMpLlxuXHQgKiAnKicgd2lsbCBtYXRjaCBhIHNpbmdsZSBzZWdtZW50LCBvZiBhbnkgcHJvcGVydHkgbmFtZSBvciBpbmRleC5cblx0ICogJyoqJyB3aWxsIG1hdGNoIGEgc2VxdWVuY2Ugb2Ygc2VnbWVudHMgb3Igbm8gc2VnbWVudCwgb2YgYW55IHByb3BlcnR5IG5hbWUgb3IgaW5kZXguXG5cdCAqL1xuXHRtYXRjaGVzOiAocGF0dGVybnM6IEpTT05QYXRoKSA9PiBib29sZWFuO1xuXHQvKipcblx0ICogSWYgc2V0LCB0aGUgbG9jYXRpb24ncyBvZmZzZXQgaXMgYXQgYSBwcm9wZXJ0eSBrZXkuXG5cdCAqL1xuXHRpc0F0UHJvcGVydHlLZXk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VPcHRpb25zIHtcblx0ZGlzYWxsb3dDb21tZW50cz86IGJvb2xlYW47XG5cdGFsbG93VHJhaWxpbmdDb21tYT86IGJvb2xlYW47XG5cdGFsbG93RW1wdHlDb250ZW50PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBQYXJzZU9wdGlvbnMge1xuXHRleHBvcnQgY29uc3QgREVGQVVMVCA9IHtcblx0XHRhbGxvd1RyYWlsaW5nQ29tbWE6IHRydWVcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBKU09OVmlzaXRvciB7XG5cdC8qKlxuXHQgKiBJbnZva2VkIHdoZW4gYW4gb3BlbiBicmFjZSBpcyBlbmNvdW50ZXJlZCBhbmQgYW4gb2JqZWN0IGlzIHN0YXJ0ZWQuIFRoZSBvZmZzZXQgYW5kIGxlbmd0aCByZXByZXNlbnQgdGhlIGxvY2F0aW9uIG9mIHRoZSBvcGVuIGJyYWNlLlxuXHQgKi9cblx0b25PYmplY3RCZWdpbj86IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEludm9rZWQgd2hlbiBhIHByb3BlcnR5IGlzIGVuY291bnRlcmVkLiBUaGUgb2Zmc2V0IGFuZCBsZW5ndGggcmVwcmVzZW50IHRoZSBsb2NhdGlvbiBvZiB0aGUgcHJvcGVydHkgbmFtZS5cblx0ICovXG5cdG9uT2JqZWN0UHJvcGVydHk/OiAocHJvcGVydHk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBJbnZva2VkIHdoZW4gYSBjbG9zaW5nIGJyYWNlIGlzIGVuY291bnRlcmVkIGFuZCBhbiBvYmplY3QgaXMgY29tcGxldGVkLiBUaGUgb2Zmc2V0IGFuZCBsZW5ndGggcmVwcmVzZW50IHRoZSBsb2NhdGlvbiBvZiB0aGUgY2xvc2luZyBicmFjZS5cblx0ICovXG5cdG9uT2JqZWN0RW5kPzogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4gdm9pZDtcblxuXHQvKipcblx0ICogSW52b2tlZCB3aGVuIGFuIG9wZW4gYnJhY2tldCBpcyBlbmNvdW50ZXJlZC4gVGhlIG9mZnNldCBhbmQgbGVuZ3RoIHJlcHJlc2VudCB0aGUgbG9jYXRpb24gb2YgdGhlIG9wZW4gYnJhY2tldC5cblx0ICovXG5cdG9uQXJyYXlCZWdpbj86IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEludm9rZWQgd2hlbiBhIGNsb3NpbmcgYnJhY2tldCBpcyBlbmNvdW50ZXJlZC4gVGhlIG9mZnNldCBhbmQgbGVuZ3RoIHJlcHJlc2VudCB0aGUgbG9jYXRpb24gb2YgdGhlIGNsb3NpbmcgYnJhY2tldC5cblx0ICovXG5cdG9uQXJyYXlFbmQ/OiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBJbnZva2VkIHdoZW4gYSBsaXRlcmFsIHZhbHVlIGlzIGVuY291bnRlcmVkLiBUaGUgb2Zmc2V0IGFuZCBsZW5ndGggcmVwcmVzZW50IHRoZSBsb2NhdGlvbiBvZiB0aGUgbGl0ZXJhbCB2YWx1ZS5cblx0ICovXG5cdG9uTGl0ZXJhbFZhbHVlPzogKHZhbHVlOiBhbnksIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4gdm9pZDtcblxuXHQvKipcblx0ICogSW52b2tlZCB3aGVuIGEgY29tbWEgb3IgY29sb24gc2VwYXJhdG9yIGlzIGVuY291bnRlcmVkLiBUaGUgb2Zmc2V0IGFuZCBsZW5ndGggcmVwcmVzZW50IHRoZSBsb2NhdGlvbiBvZiB0aGUgc2VwYXJhdG9yLlxuXHQgKi9cblx0b25TZXBhcmF0b3I/OiAoY2hhcmFjdGVyOiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4gdm9pZDtcblxuXHQvKipcblx0ICogV2hlbiBjb21tZW50cyBhcmUgYWxsb3dlZCwgaW52b2tlZCB3aGVuIGEgbGluZSBvciBibG9jayBjb21tZW50IGlzIGVuY291bnRlcmVkLiBUaGUgb2Zmc2V0IGFuZCBsZW5ndGggcmVwcmVzZW50IHRoZSBsb2NhdGlvbiBvZiB0aGUgY29tbWVudC5cblx0ICovXG5cdG9uQ29tbWVudD86IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEludm9rZWQgb24gYW4gZXJyb3IuXG5cdCAqL1xuXHRvbkVycm9yPzogKGVycm9yOiBQYXJzZUVycm9yQ29kZSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBKU09OIHNjYW5uZXIgb24gdGhlIGdpdmVuIHRleHQuXG4gKiBJZiBpZ25vcmVUcml2aWEgaXMgc2V0LCB3aGl0ZXNwYWNlcyBvciBjb21tZW50cyBhcmUgaWdub3JlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNjYW5uZXIodGV4dDogc3RyaW5nLCBpZ25vcmVUcml2aWE6IGJvb2xlYW4gPSBmYWxzZSk6IEpTT05TY2FubmVyIHtcblxuXHRsZXQgcG9zID0gMDtcblx0Y29uc3QgbGVuID0gdGV4dC5sZW5ndGg7XG5cdGxldCB2YWx1ZTogc3RyaW5nID0gJyc7XG5cdGxldCB0b2tlbk9mZnNldCA9IDA7XG5cdGxldCB0b2tlbjogU3ludGF4S2luZCA9IFN5bnRheEtpbmQuVW5rbm93bjtcblx0bGV0IHNjYW5FcnJvcjogU2NhbkVycm9yID0gU2NhbkVycm9yLk5vbmU7XG5cblx0ZnVuY3Rpb24gc2NhbkhleERpZ2l0cyhjb3VudDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgZGlnaXRzID0gMDtcblx0XHRsZXQgaGV4VmFsdWUgPSAwO1xuXHRcdHdoaWxlIChkaWdpdHMgPCBjb3VudCkge1xuXHRcdFx0Y29uc3QgY2ggPSB0ZXh0LmNoYXJDb2RlQXQocG9zKTtcblx0XHRcdGlmIChjaCA+PSBDaGFyYWN0ZXJDb2Rlcy5fMCAmJiBjaCA8PSBDaGFyYWN0ZXJDb2Rlcy5fOSkge1xuXHRcdFx0XHRoZXhWYWx1ZSA9IGhleFZhbHVlICogMTYgKyBjaCAtIENoYXJhY3RlckNvZGVzLl8wO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoY2ggPj0gQ2hhcmFjdGVyQ29kZXMuQSAmJiBjaCA8PSBDaGFyYWN0ZXJDb2Rlcy5GKSB7XG5cdFx0XHRcdGhleFZhbHVlID0gaGV4VmFsdWUgKiAxNiArIGNoIC0gQ2hhcmFjdGVyQ29kZXMuQSArIDEwO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoY2ggPj0gQ2hhcmFjdGVyQ29kZXMuYSAmJiBjaCA8PSBDaGFyYWN0ZXJDb2Rlcy5mKSB7XG5cdFx0XHRcdGhleFZhbHVlID0gaGV4VmFsdWUgKiAxNiArIGNoIC0gQ2hhcmFjdGVyQ29kZXMuYSArIDEwO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0cG9zKys7XG5cdFx0XHRkaWdpdHMrKztcblx0XHR9XG5cdFx0aWYgKGRpZ2l0cyA8IGNvdW50KSB7XG5cdFx0XHRoZXhWYWx1ZSA9IC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gaGV4VmFsdWU7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRQb3NpdGlvbihuZXdQb3NpdGlvbjogbnVtYmVyKSB7XG5cdFx0cG9zID0gbmV3UG9zaXRpb247XG5cdFx0dmFsdWUgPSAnJztcblx0XHR0b2tlbk9mZnNldCA9IDA7XG5cdFx0dG9rZW4gPSBTeW50YXhLaW5kLlVua25vd247XG5cdFx0c2NhbkVycm9yID0gU2NhbkVycm9yLk5vbmU7XG5cdH1cblxuXHRmdW5jdGlvbiBzY2FuTnVtYmVyKCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RhcnQgPSBwb3M7XG5cdFx0aWYgKHRleHQuY2hhckNvZGVBdChwb3MpID09PSBDaGFyYWN0ZXJDb2Rlcy5fMCkge1xuXHRcdFx0cG9zKys7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBvcysrO1xuXHRcdFx0d2hpbGUgKHBvcyA8IHRleHQubGVuZ3RoICYmIGlzRGlnaXQodGV4dC5jaGFyQ29kZUF0KHBvcykpKSB7XG5cdFx0XHRcdHBvcysrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocG9zIDwgdGV4dC5sZW5ndGggJiYgdGV4dC5jaGFyQ29kZUF0KHBvcykgPT09IENoYXJhY3RlckNvZGVzLmRvdCkge1xuXHRcdFx0cG9zKys7XG5cdFx0XHRpZiAocG9zIDwgdGV4dC5sZW5ndGggJiYgaXNEaWdpdCh0ZXh0LmNoYXJDb2RlQXQocG9zKSkpIHtcblx0XHRcdFx0cG9zKys7XG5cdFx0XHRcdHdoaWxlIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiBpc0RpZ2l0KHRleHQuY2hhckNvZGVBdChwb3MpKSkge1xuXHRcdFx0XHRcdHBvcysrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzY2FuRXJyb3IgPSBTY2FuRXJyb3IuVW5leHBlY3RlZEVuZE9mTnVtYmVyO1xuXHRcdFx0XHRyZXR1cm4gdGV4dC5zdWJzdHJpbmcoc3RhcnQsIHBvcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCBlbmQgPSBwb3M7XG5cdFx0aWYgKHBvcyA8IHRleHQubGVuZ3RoICYmICh0ZXh0LmNoYXJDb2RlQXQocG9zKSA9PT0gQ2hhcmFjdGVyQ29kZXMuRSB8fCB0ZXh0LmNoYXJDb2RlQXQocG9zKSA9PT0gQ2hhcmFjdGVyQ29kZXMuZSkpIHtcblx0XHRcdHBvcysrO1xuXHRcdFx0aWYgKHBvcyA8IHRleHQubGVuZ3RoICYmIHRleHQuY2hhckNvZGVBdChwb3MpID09PSBDaGFyYWN0ZXJDb2Rlcy5wbHVzIHx8IHRleHQuY2hhckNvZGVBdChwb3MpID09PSBDaGFyYWN0ZXJDb2Rlcy5taW51cykge1xuXHRcdFx0XHRwb3MrKztcblx0XHRcdH1cblx0XHRcdGlmIChwb3MgPCB0ZXh0Lmxlbmd0aCAmJiBpc0RpZ2l0KHRleHQuY2hhckNvZGVBdChwb3MpKSkge1xuXHRcdFx0XHRwb3MrKztcblx0XHRcdFx0d2hpbGUgKHBvcyA8IHRleHQubGVuZ3RoICYmIGlzRGlnaXQodGV4dC5jaGFyQ29kZUF0KHBvcykpKSB7XG5cdFx0XHRcdFx0cG9zKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZW5kID0gcG9zO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NhbkVycm9yID0gU2NhbkVycm9yLlVuZXhwZWN0ZWRFbmRPZk51bWJlcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRleHQuc3Vic3RyaW5nKHN0YXJ0LCBlbmQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2NhblN0cmluZygpOiBzdHJpbmcge1xuXG5cdFx0bGV0IHJlc3VsdCA9ICcnLFxuXHRcdFx0c3RhcnQgPSBwb3M7XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHBvcyA+PSBsZW4pIHtcblx0XHRcdFx0cmVzdWx0ICs9IHRleHQuc3Vic3RyaW5nKHN0YXJ0LCBwb3MpO1xuXHRcdFx0XHRzY2FuRXJyb3IgPSBTY2FuRXJyb3IuVW5leHBlY3RlZEVuZE9mU3RyaW5nO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoID0gdGV4dC5jaGFyQ29kZUF0KHBvcyk7XG5cdFx0XHRpZiAoY2ggPT09IENoYXJhY3RlckNvZGVzLmRvdWJsZVF1b3RlKSB7XG5cdFx0XHRcdHJlc3VsdCArPSB0ZXh0LnN1YnN0cmluZyhzdGFydCwgcG9zKTtcblx0XHRcdFx0cG9zKys7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoID09PSBDaGFyYWN0ZXJDb2Rlcy5iYWNrc2xhc2gpIHtcblx0XHRcdFx0cmVzdWx0ICs9IHRleHQuc3Vic3RyaW5nKHN0YXJ0LCBwb3MpO1xuXHRcdFx0XHRwb3MrKztcblx0XHRcdFx0aWYgKHBvcyA+PSBsZW4pIHtcblx0XHRcdFx0XHRzY2FuRXJyb3IgPSBTY2FuRXJyb3IuVW5leHBlY3RlZEVuZE9mU3RyaW5nO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNoMiA9IHRleHQuY2hhckNvZGVBdChwb3MrKyk7XG5cdFx0XHRcdHN3aXRjaCAoY2gyKSB7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyYWN0ZXJDb2Rlcy5kb3VibGVRdW90ZTpcblx0XHRcdFx0XHRcdHJlc3VsdCArPSAnXFxcIic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLmJhY2tzbGFzaDpcblx0XHRcdFx0XHRcdHJlc3VsdCArPSAnXFxcXCc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLnNsYXNoOlxuXHRcdFx0XHRcdFx0cmVzdWx0ICs9ICcvJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuYjpcblx0XHRcdFx0XHRcdHJlc3VsdCArPSAnXFxiJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuZjpcblx0XHRcdFx0XHRcdHJlc3VsdCArPSAnXFxmJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMubjpcblx0XHRcdFx0XHRcdHJlc3VsdCArPSAnXFxuJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMucjpcblx0XHRcdFx0XHRcdHJlc3VsdCArPSAnXFxyJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMudDpcblx0XHRcdFx0XHRcdHJlc3VsdCArPSAnXFx0Jztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMudToge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2gzID0gc2NhbkhleERpZ2l0cyg0KTtcblx0XHRcdFx0XHRcdGlmIChjaDMgPj0gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjaDMpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c2NhbkVycm9yID0gU2NhbkVycm9yLkludmFsaWRVbmljb2RlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRzY2FuRXJyb3IgPSBTY2FuRXJyb3IuSW52YWxpZEVzY2FwZUNoYXJhY3Rlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGFydCA9IHBvcztcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2ggPj0gMCAmJiBjaCA8PSAweDFGKSB7XG5cdFx0XHRcdGlmIChpc0xpbmVCcmVhayhjaCkpIHtcblx0XHRcdFx0XHRyZXN1bHQgKz0gdGV4dC5zdWJzdHJpbmcoc3RhcnQsIHBvcyk7XG5cdFx0XHRcdFx0c2NhbkVycm9yID0gU2NhbkVycm9yLlVuZXhwZWN0ZWRFbmRPZlN0cmluZztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzY2FuRXJyb3IgPSBTY2FuRXJyb3IuSW52YWxpZENoYXJhY3Rlcjtcblx0XHRcdFx0XHQvLyBtYXJrIGFzIGVycm9yIGJ1dCBjb250aW51ZSB3aXRoIHN0cmluZ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRwb3MrKztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGZ1bmN0aW9uIHNjYW5OZXh0KCk6IFN5bnRheEtpbmQge1xuXG5cdFx0dmFsdWUgPSAnJztcblx0XHRzY2FuRXJyb3IgPSBTY2FuRXJyb3IuTm9uZTtcblxuXHRcdHRva2VuT2Zmc2V0ID0gcG9zO1xuXG5cdFx0aWYgKHBvcyA+PSBsZW4pIHtcblx0XHRcdC8vIGF0IHRoZSBlbmRcblx0XHRcdHRva2VuT2Zmc2V0ID0gbGVuO1xuXHRcdFx0cmV0dXJuIHRva2VuID0gU3ludGF4S2luZC5FT0Y7XG5cdFx0fVxuXG5cdFx0bGV0IGNvZGUgPSB0ZXh0LmNoYXJDb2RlQXQocG9zKTtcblx0XHQvLyB0cml2aWE6IHdoaXRlc3BhY2Vcblx0XHRpZiAoaXNXaGl0ZXNwYWNlKGNvZGUpKSB7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdHBvcysrO1xuXHRcdFx0XHR2YWx1ZSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvZGUpO1xuXHRcdFx0XHRjb2RlID0gdGV4dC5jaGFyQ29kZUF0KHBvcyk7XG5cdFx0XHR9IHdoaWxlIChpc1doaXRlc3BhY2UoY29kZSkpO1xuXG5cdFx0XHRyZXR1cm4gdG9rZW4gPSBTeW50YXhLaW5kLlRyaXZpYTtcblx0XHR9XG5cblx0XHQvLyB0cml2aWE6IG5ld2xpbmVzXG5cdFx0aWYgKGlzTGluZUJyZWFrKGNvZGUpKSB7XG5cdFx0XHRwb3MrKztcblx0XHRcdHZhbHVlICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY29kZSk7XG5cdFx0XHRpZiAoY29kZSA9PT0gQ2hhcmFjdGVyQ29kZXMuY2FycmlhZ2VSZXR1cm4gJiYgdGV4dC5jaGFyQ29kZUF0KHBvcykgPT09IENoYXJhY3RlckNvZGVzLmxpbmVGZWVkKSB7XG5cdFx0XHRcdHBvcysrO1xuXHRcdFx0XHR2YWx1ZSArPSAnXFxuJztcblx0XHRcdH1cblx0XHRcdHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuTGluZUJyZWFrVHJpdmlhO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoY29kZSkge1xuXHRcdFx0Ly8gdG9rZW5zOiBbXXt9Oixcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMub3BlbkJyYWNlOlxuXHRcdFx0XHRwb3MrKztcblx0XHRcdFx0cmV0dXJuIHRva2VuID0gU3ludGF4S2luZC5PcGVuQnJhY2VUb2tlbjtcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuY2xvc2VCcmFjZTpcblx0XHRcdFx0cG9zKys7XG5cdFx0XHRcdHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuQ2xvc2VCcmFjZVRva2VuO1xuXHRcdFx0Y2FzZSBDaGFyYWN0ZXJDb2Rlcy5vcGVuQnJhY2tldDpcblx0XHRcdFx0cG9zKys7XG5cdFx0XHRcdHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuT3BlbkJyYWNrZXRUb2tlbjtcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuY2xvc2VCcmFja2V0OlxuXHRcdFx0XHRwb3MrKztcblx0XHRcdFx0cmV0dXJuIHRva2VuID0gU3ludGF4S2luZC5DbG9zZUJyYWNrZXRUb2tlbjtcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuY29sb246XG5cdFx0XHRcdHBvcysrO1xuXHRcdFx0XHRyZXR1cm4gdG9rZW4gPSBTeW50YXhLaW5kLkNvbG9uVG9rZW47XG5cdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLmNvbW1hOlxuXHRcdFx0XHRwb3MrKztcblx0XHRcdFx0cmV0dXJuIHRva2VuID0gU3ludGF4S2luZC5Db21tYVRva2VuO1xuXG5cdFx0XHQvLyBzdHJpbmdzXG5cdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLmRvdWJsZVF1b3RlOlxuXHRcdFx0XHRwb3MrKztcblx0XHRcdFx0dmFsdWUgPSBzY2FuU3RyaW5nKCk7XG5cdFx0XHRcdHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbDtcblxuXHRcdFx0Ly8gY29tbWVudHNcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuc2xhc2g6IHtcblx0XHRcdFx0Y29uc3Qgc3RhcnQgPSBwb3MgLSAxO1xuXHRcdFx0XHQvLyBTaW5nbGUtbGluZSBjb21tZW50XG5cdFx0XHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQocG9zICsgMSkgPT09IENoYXJhY3RlckNvZGVzLnNsYXNoKSB7XG5cdFx0XHRcdFx0cG9zICs9IDI7XG5cblx0XHRcdFx0XHR3aGlsZSAocG9zIDwgbGVuKSB7XG5cdFx0XHRcdFx0XHRpZiAoaXNMaW5lQnJlYWsodGV4dC5jaGFyQ29kZUF0KHBvcykpKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cG9zKys7XG5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dmFsdWUgPSB0ZXh0LnN1YnN0cmluZyhzdGFydCwgcG9zKTtcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW4gPSBTeW50YXhLaW5kLkxpbmVDb21tZW50VHJpdmlhO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTXVsdGktbGluZSBjb21tZW50XG5cdFx0XHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQocG9zICsgMSkgPT09IENoYXJhY3RlckNvZGVzLmFzdGVyaXNrKSB7XG5cdFx0XHRcdFx0cG9zICs9IDI7XG5cblx0XHRcdFx0XHRjb25zdCBzYWZlTGVuZ3RoID0gbGVuIC0gMTsgLy8gRm9yIGxvb2thaGVhZC5cblx0XHRcdFx0XHRsZXQgY29tbWVudENsb3NlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdHdoaWxlIChwb3MgPCBzYWZlTGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaCA9IHRleHQuY2hhckNvZGVBdChwb3MpO1xuXG5cdFx0XHRcdFx0XHRpZiAoY2ggPT09IENoYXJhY3RlckNvZGVzLmFzdGVyaXNrICYmIHRleHQuY2hhckNvZGVBdChwb3MgKyAxKSA9PT0gQ2hhcmFjdGVyQ29kZXMuc2xhc2gpIHtcblx0XHRcdFx0XHRcdFx0cG9zICs9IDI7XG5cdFx0XHRcdFx0XHRcdGNvbW1lbnRDbG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHBvcysrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghY29tbWVudENsb3NlZCkge1xuXHRcdFx0XHRcdFx0cG9zKys7XG5cdFx0XHRcdFx0XHRzY2FuRXJyb3IgPSBTY2FuRXJyb3IuVW5leHBlY3RlZEVuZE9mQ29tbWVudDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR2YWx1ZSA9IHRleHQuc3Vic3RyaW5nKHN0YXJ0LCBwb3MpO1xuXHRcdFx0XHRcdHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuQmxvY2tDb21tZW50VHJpdmlhO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGp1c3QgYSBzaW5nbGUgc2xhc2hcblx0XHRcdFx0dmFsdWUgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjb2RlKTtcblx0XHRcdFx0cG9zKys7XG5cdFx0XHRcdHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuVW5rbm93bjtcblx0XHRcdH1cblx0XHRcdC8vIG51bWJlcnNcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMubWludXM6XG5cdFx0XHRcdHZhbHVlICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY29kZSk7XG5cdFx0XHRcdHBvcysrO1xuXHRcdFx0XHRpZiAocG9zID09PSBsZW4gfHwgIWlzRGlnaXQodGV4dC5jaGFyQ29kZUF0KHBvcykpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuID0gU3ludGF4S2luZC5Vbmtub3duO1xuXHRcdFx0XHR9XG5cdFx0XHQvLyBmb3VuZCBhIG1pbnVzLCBmb2xsb3dlZCBieSBhIG51bWJlciBzb1xuXHRcdFx0Ly8gd2UgZmFsbCB0aHJvdWdoIHRvIHByb2NlZWQgd2l0aCBzY2FubmluZ1xuXHRcdFx0Ly8gbnVtYmVyc1xuXHRcdFx0Y2FzZSBDaGFyYWN0ZXJDb2Rlcy5fMDpcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuXzE6XG5cdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLl8yOlxuXHRcdFx0Y2FzZSBDaGFyYWN0ZXJDb2Rlcy5fMzpcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuXzQ6XG5cdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLl81OlxuXHRcdFx0Y2FzZSBDaGFyYWN0ZXJDb2Rlcy5fNjpcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuXzc6XG5cdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLl84OlxuXHRcdFx0Y2FzZSBDaGFyYWN0ZXJDb2Rlcy5fOTpcblx0XHRcdFx0dmFsdWUgKz0gc2Nhbk51bWJlcigpO1xuXHRcdFx0XHRyZXR1cm4gdG9rZW4gPSBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsO1xuXHRcdFx0Ly8gbGl0ZXJhbHMgYW5kIHVua25vd24gc3ltYm9sc1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Ly8gaXMgYSBsaXRlcmFsPyBSZWFkIHRoZSBmdWxsIHdvcmQuXG5cdFx0XHRcdHdoaWxlIChwb3MgPCBsZW4gJiYgaXNVbmtub3duQ29udGVudENoYXJhY3Rlcihjb2RlKSkge1xuXHRcdFx0XHRcdHBvcysrO1xuXHRcdFx0XHRcdGNvZGUgPSB0ZXh0LmNoYXJDb2RlQXQocG9zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodG9rZW5PZmZzZXQgIT09IHBvcykge1xuXHRcdFx0XHRcdHZhbHVlID0gdGV4dC5zdWJzdHJpbmcodG9rZW5PZmZzZXQsIHBvcyk7XG5cdFx0XHRcdFx0Ly8ga2V5d29yZHM6IHRydWUsIGZhbHNlLCBudWxsXG5cdFx0XHRcdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0XHRcdFx0Y2FzZSAndHJ1ZSc6IHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuVHJ1ZUtleXdvcmQ7XG5cdFx0XHRcdFx0XHRjYXNlICdmYWxzZSc6IHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuRmFsc2VLZXl3b3JkO1xuXHRcdFx0XHRcdFx0Y2FzZSAnbnVsbCc6IHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuTnVsbEtleXdvcmQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0b2tlbiA9IFN5bnRheEtpbmQuVW5rbm93bjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBzb21lXG5cdFx0XHRcdHZhbHVlICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY29kZSk7XG5cdFx0XHRcdHBvcysrO1xuXHRcdFx0XHRyZXR1cm4gdG9rZW4gPSBTeW50YXhLaW5kLlVua25vd247XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaXNVbmtub3duQ29udGVudENoYXJhY3Rlcihjb2RlOiBDaGFyYWN0ZXJDb2Rlcykge1xuXHRcdGlmIChpc1doaXRlc3BhY2UoY29kZSkgfHwgaXNMaW5lQnJlYWsoY29kZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0c3dpdGNoIChjb2RlKSB7XG5cdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLmNsb3NlQnJhY2U6XG5cdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLmNsb3NlQnJhY2tldDpcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMub3BlbkJyYWNlOlxuXHRcdFx0Y2FzZSBDaGFyYWN0ZXJDb2Rlcy5vcGVuQnJhY2tldDpcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuZG91YmxlUXVvdGU6XG5cdFx0XHRjYXNlIENoYXJhY3RlckNvZGVzLmNvbG9uOlxuXHRcdFx0Y2FzZSBDaGFyYWN0ZXJDb2Rlcy5jb21tYTpcblx0XHRcdGNhc2UgQ2hhcmFjdGVyQ29kZXMuc2xhc2g6XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXG5cdGZ1bmN0aW9uIHNjYW5OZXh0Tm9uVHJpdmlhKCk6IFN5bnRheEtpbmQge1xuXHRcdGxldCByZXN1bHQ6IFN5bnRheEtpbmQ7XG5cdFx0ZG8ge1xuXHRcdFx0cmVzdWx0ID0gc2Nhbk5leHQoKTtcblx0XHR9IHdoaWxlIChyZXN1bHQgPj0gU3ludGF4S2luZC5MaW5lQ29tbWVudFRyaXZpYSAmJiByZXN1bHQgPD0gU3ludGF4S2luZC5Ucml2aWEpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHNldFBvc2l0aW9uOiBzZXRQb3NpdGlvbixcblx0XHRnZXRQb3NpdGlvbjogKCkgPT4gcG9zLFxuXHRcdHNjYW46IGlnbm9yZVRyaXZpYSA/IHNjYW5OZXh0Tm9uVHJpdmlhIDogc2Nhbk5leHQsXG5cdFx0Z2V0VG9rZW46ICgpID0+IHRva2VuLFxuXHRcdGdldFRva2VuVmFsdWU6ICgpID0+IHZhbHVlLFxuXHRcdGdldFRva2VuT2Zmc2V0OiAoKSA9PiB0b2tlbk9mZnNldCxcblx0XHRnZXRUb2tlbkxlbmd0aDogKCkgPT4gcG9zIC0gdG9rZW5PZmZzZXQsXG5cdFx0Z2V0VG9rZW5FcnJvcjogKCkgPT4gc2NhbkVycm9yXG5cdH07XG59XG5cbmZ1bmN0aW9uIGlzV2hpdGVzcGFjZShjaDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBjaCA9PT0gQ2hhcmFjdGVyQ29kZXMuc3BhY2UgfHwgY2ggPT09IENoYXJhY3RlckNvZGVzLnRhYiB8fCBjaCA9PT0gQ2hhcmFjdGVyQ29kZXMudmVydGljYWxUYWIgfHwgY2ggPT09IENoYXJhY3RlckNvZGVzLmZvcm1GZWVkIHx8XG5cdFx0Y2ggPT09IENoYXJhY3RlckNvZGVzLm5vbkJyZWFraW5nU3BhY2UgfHwgY2ggPT09IENoYXJhY3RlckNvZGVzLm9naGFtIHx8IGNoID49IENoYXJhY3RlckNvZGVzLmVuUXVhZCAmJiBjaCA8PSBDaGFyYWN0ZXJDb2Rlcy56ZXJvV2lkdGhTcGFjZSB8fFxuXHRcdGNoID09PSBDaGFyYWN0ZXJDb2Rlcy5uYXJyb3dOb0JyZWFrU3BhY2UgfHwgY2ggPT09IENoYXJhY3RlckNvZGVzLm1hdGhlbWF0aWNhbFNwYWNlIHx8IGNoID09PSBDaGFyYWN0ZXJDb2Rlcy5pZGVvZ3JhcGhpY1NwYWNlIHx8IGNoID09PSBDaGFyYWN0ZXJDb2Rlcy5ieXRlT3JkZXJNYXJrO1xufVxuXG5mdW5jdGlvbiBpc0xpbmVCcmVhayhjaDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBjaCA9PT0gQ2hhcmFjdGVyQ29kZXMubGluZUZlZWQgfHwgY2ggPT09IENoYXJhY3RlckNvZGVzLmNhcnJpYWdlUmV0dXJuIHx8IGNoID09PSBDaGFyYWN0ZXJDb2Rlcy5saW5lU2VwYXJhdG9yIHx8IGNoID09PSBDaGFyYWN0ZXJDb2Rlcy5wYXJhZ3JhcGhTZXBhcmF0b3I7XG59XG5cbmZ1bmN0aW9uIGlzRGlnaXQoY2g6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY2ggPj0gQ2hhcmFjdGVyQ29kZXMuXzAgJiYgY2ggPD0gQ2hhcmFjdGVyQ29kZXMuXzk7XG59XG5cbmNvbnN0IGVudW0gQ2hhcmFjdGVyQ29kZXMge1xuXHRudWxsQ2hhcmFjdGVyID0gMCxcblx0bWF4QXNjaWlDaGFyYWN0ZXIgPSAweDdGLFxuXG5cdGxpbmVGZWVkID0gMHgwQSwgICAgICAgICAgICAgIC8vIFxcblxuXHRjYXJyaWFnZVJldHVybiA9IDB4MEQsICAgICAgICAvLyBcXHJcblx0bGluZVNlcGFyYXRvciA9IDB4MjAyOCxcblx0cGFyYWdyYXBoU2VwYXJhdG9yID0gMHgyMDI5LFxuXG5cdC8vIFJFVklFVzogZG8gd2UgbmVlZCB0byBzdXBwb3J0IHRoaXM/ICBUaGUgc2Nhbm5lciBkb2Vzbid0LCBidXQgb3VyIElUZXh0IGRvZXMuICBUaGlzIHNlZW1zXG5cdC8vIGxpa2UgYW4gb2RkIGRpc3Bhcml0eT8gIChPciBtYXliZSBpdCdzIGNvbXBsZXRlbHkgZmluZSBmb3IgdGhlbSB0byBiZSBkaWZmZXJlbnQpLlxuXHRuZXh0TGluZSA9IDB4MDA4NSxcblxuXHQvLyBVbmljb2RlIDMuMCBzcGFjZSBjaGFyYWN0ZXJzXG5cdHNwYWNlID0gMHgwMDIwLCAgIC8vIFwiIFwiXG5cdG5vbkJyZWFraW5nU3BhY2UgPSAweDAwQTAsICAgLy9cblx0ZW5RdWFkID0gMHgyMDAwLFxuXHRlbVF1YWQgPSAweDIwMDEsXG5cdGVuU3BhY2UgPSAweDIwMDIsXG5cdGVtU3BhY2UgPSAweDIwMDMsXG5cdHRocmVlUGVyRW1TcGFjZSA9IDB4MjAwNCxcblx0Zm91clBlckVtU3BhY2UgPSAweDIwMDUsXG5cdHNpeFBlckVtU3BhY2UgPSAweDIwMDYsXG5cdGZpZ3VyZVNwYWNlID0gMHgyMDA3LFxuXHRwdW5jdHVhdGlvblNwYWNlID0gMHgyMDA4LFxuXHR0aGluU3BhY2UgPSAweDIwMDksXG5cdGhhaXJTcGFjZSA9IDB4MjAwQSxcblx0emVyb1dpZHRoU3BhY2UgPSAweDIwMEIsXG5cdG5hcnJvd05vQnJlYWtTcGFjZSA9IDB4MjAyRixcblx0aWRlb2dyYXBoaWNTcGFjZSA9IDB4MzAwMCxcblx0bWF0aGVtYXRpY2FsU3BhY2UgPSAweDIwNUYsXG5cdG9naGFtID0gMHgxNjgwLFxuXG5cdF8gPSAweDVGLFxuXHQkID0gMHgyNCxcblxuXHRfMCA9IDB4MzAsXG5cdF8xID0gMHgzMSxcblx0XzIgPSAweDMyLFxuXHRfMyA9IDB4MzMsXG5cdF80ID0gMHgzNCxcblx0XzUgPSAweDM1LFxuXHRfNiA9IDB4MzYsXG5cdF83ID0gMHgzNyxcblx0XzggPSAweDM4LFxuXHRfOSA9IDB4MzksXG5cblx0YSA9IDB4NjEsXG5cdGIgPSAweDYyLFxuXHRjID0gMHg2Myxcblx0ZCA9IDB4NjQsXG5cdGUgPSAweDY1LFxuXHRmID0gMHg2Nixcblx0ZyA9IDB4NjcsXG5cdGggPSAweDY4LFxuXHRpID0gMHg2OSxcblx0aiA9IDB4NkEsXG5cdGsgPSAweDZCLFxuXHRsID0gMHg2Qyxcblx0bSA9IDB4NkQsXG5cdG4gPSAweDZFLFxuXHRvID0gMHg2Rixcblx0cCA9IDB4NzAsXG5cdHEgPSAweDcxLFxuXHRyID0gMHg3Mixcblx0cyA9IDB4NzMsXG5cdHQgPSAweDc0LFxuXHR1ID0gMHg3NSxcblx0diA9IDB4NzYsXG5cdHcgPSAweDc3LFxuXHR4ID0gMHg3OCxcblx0eSA9IDB4NzksXG5cdHogPSAweDdBLFxuXG5cdEEgPSAweDQxLFxuXHRCID0gMHg0Mixcblx0QyA9IDB4NDMsXG5cdEQgPSAweDQ0LFxuXHRFID0gMHg0NSxcblx0RiA9IDB4NDYsXG5cdEcgPSAweDQ3LFxuXHRIID0gMHg0OCxcblx0SSA9IDB4NDksXG5cdEogPSAweDRBLFxuXHRLID0gMHg0Qixcblx0TCA9IDB4NEMsXG5cdE0gPSAweDRELFxuXHROID0gMHg0RSxcblx0TyA9IDB4NEYsXG5cdFAgPSAweDUwLFxuXHRRID0gMHg1MSxcblx0UiA9IDB4NTIsXG5cdFMgPSAweDUzLFxuXHRUID0gMHg1NCxcblx0VSA9IDB4NTUsXG5cdFYgPSAweDU2LFxuXHRXID0gMHg1Nyxcblx0WCA9IDB4NTgsXG5cdFkgPSAweDU5LFxuXHRaID0gMHg1QSxcblxuXHRhbXBlcnNhbmQgPSAweDI2LCAgICAgICAgICAgICAvLyAmXG5cdGFzdGVyaXNrID0gMHgyQSwgICAgICAgICAgICAgIC8vICpcblx0YXQgPSAweDQwLCAgICAgICAgICAgICAgICAgICAgLy8gQFxuXHRiYWNrc2xhc2ggPSAweDVDLCAgICAgICAgICAgICAvLyBcXFxuXHRiYXIgPSAweDdDLCAgICAgICAgICAgICAgICAgICAvLyB8XG5cdGNhcmV0ID0gMHg1RSwgICAgICAgICAgICAgICAgIC8vIF5cblx0Y2xvc2VCcmFjZSA9IDB4N0QsICAgICAgICAgICAgLy8gfVxuXHRjbG9zZUJyYWNrZXQgPSAweDVELCAgICAgICAgICAvLyBdXG5cdGNsb3NlUGFyZW4gPSAweDI5LCAgICAgICAgICAgIC8vIClcblx0Y29sb24gPSAweDNBLCAgICAgICAgICAgICAgICAgLy8gOlxuXHRjb21tYSA9IDB4MkMsICAgICAgICAgICAgICAgICAvLyAsXG5cdGRvdCA9IDB4MkUsICAgICAgICAgICAgICAgICAgIC8vIC5cblx0ZG91YmxlUXVvdGUgPSAweDIyLCAgICAgICAgICAgLy8gXCJcblx0ZXF1YWxzID0gMHgzRCwgICAgICAgICAgICAgICAgLy8gPVxuXHRleGNsYW1hdGlvbiA9IDB4MjEsICAgICAgICAgICAvLyAhXG5cdGdyZWF0ZXJUaGFuID0gMHgzRSwgICAgICAgICAgIC8vID5cblx0bGVzc1RoYW4gPSAweDNDLCAgICAgICAgICAgICAgLy8gPFxuXHRtaW51cyA9IDB4MkQsICAgICAgICAgICAgICAgICAvLyAtXG5cdG9wZW5CcmFjZSA9IDB4N0IsICAgICAgICAgICAgIC8vIHtcblx0b3BlbkJyYWNrZXQgPSAweDVCLCAgICAgICAgICAgLy8gW1xuXHRvcGVuUGFyZW4gPSAweDI4LCAgICAgICAgICAgICAvLyAoXG5cdHBlcmNlbnQgPSAweDI1LCAgICAgICAgICAgICAgIC8vICVcblx0cGx1cyA9IDB4MkIsICAgICAgICAgICAgICAgICAgLy8gK1xuXHRxdWVzdGlvbiA9IDB4M0YsICAgICAgICAgICAgICAvLyA/XG5cdHNlbWljb2xvbiA9IDB4M0IsICAgICAgICAgICAgIC8vIDtcblx0c2luZ2xlUXVvdGUgPSAweDI3LCAgICAgICAgICAgLy8gJ1xuXHRzbGFzaCA9IDB4MkYsICAgICAgICAgICAgICAgICAvLyAvXG5cdHRpbGRlID0gMHg3RSwgICAgICAgICAgICAgICAgIC8vIH5cblxuXHRiYWNrc3BhY2UgPSAweDA4LCAgICAgICAgICAgICAvLyBcXGJcblx0Zm9ybUZlZWQgPSAweDBDLCAgICAgICAgICAgICAgLy8gXFxmXG5cdGJ5dGVPcmRlck1hcmsgPSAweEZFRkYsXG5cdHRhYiA9IDB4MDksICAgICAgICAgICAgICAgICAgIC8vIFxcdFxuXHR2ZXJ0aWNhbFRhYiA9IDB4MEIsICAgICAgICAgICAvLyBcXHZcbn1cblxuaW50ZXJmYWNlIE5vZGVJbXBsIGV4dGVuZHMgTm9kZSB7XG5cdHR5cGU6IE5vZGVUeXBlO1xuXHR2YWx1ZT86IGFueTtcblx0b2Zmc2V0OiBudW1iZXI7XG5cdGxlbmd0aDogbnVtYmVyO1xuXHRjb2xvbk9mZnNldD86IG51bWJlcjtcblx0cGFyZW50PzogTm9kZUltcGw7XG5cdGNoaWxkcmVuPzogTm9kZUltcGxbXTtcbn1cblxuLyoqXG4gKiBGb3IgYSBnaXZlbiBvZmZzZXQsIGV2YWx1YXRlIHRoZSBsb2NhdGlvbiBpbiB0aGUgSlNPTiBkb2N1bWVudC4gRWFjaCBzZWdtZW50IGluIHRoZSBsb2NhdGlvbiBwYXRoIGlzIGVpdGhlciBhIHByb3BlcnR5IG5hbWUgb3IgYW4gYXJyYXkgaW5kZXguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2NhdGlvbih0ZXh0OiBzdHJpbmcsIHBvc2l0aW9uOiBudW1iZXIpOiBMb2NhdGlvbiB7XG5cdGNvbnN0IHNlZ21lbnRzOiBTZWdtZW50W10gPSBbXTsgLy8gc3RyaW5ncyBvciBudW1iZXJzXG5cdGNvbnN0IGVhcmx5UmV0dXJuRXhjZXB0aW9uID0gbmV3IE9iamVjdCgpO1xuXHRsZXQgcHJldmlvdXNOb2RlOiBOb2RlSW1wbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Y29uc3QgcHJldmlvdXNOb2RlSW5zdDogTm9kZUltcGwgPSB7XG5cdFx0dmFsdWU6IHt9LFxuXHRcdG9mZnNldDogMCxcblx0XHRsZW5ndGg6IDAsXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cGFyZW50OiB1bmRlZmluZWRcblx0fTtcblx0bGV0IGlzQXRQcm9wZXJ0eUtleSA9IGZhbHNlO1xuXHRmdW5jdGlvbiBzZXRQcmV2aW91c05vZGUodmFsdWU6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyLCB0eXBlOiBOb2RlVHlwZSkge1xuXHRcdHByZXZpb3VzTm9kZUluc3QudmFsdWUgPSB2YWx1ZTtcblx0XHRwcmV2aW91c05vZGVJbnN0Lm9mZnNldCA9IG9mZnNldDtcblx0XHRwcmV2aW91c05vZGVJbnN0Lmxlbmd0aCA9IGxlbmd0aDtcblx0XHRwcmV2aW91c05vZGVJbnN0LnR5cGUgPSB0eXBlO1xuXHRcdHByZXZpb3VzTm9kZUluc3QuY29sb25PZmZzZXQgPSB1bmRlZmluZWQ7XG5cdFx0cHJldmlvdXNOb2RlID0gcHJldmlvdXNOb2RlSW5zdDtcblx0fVxuXHR0cnkge1xuXG5cdFx0dmlzaXQodGV4dCwge1xuXHRcdFx0b25PYmplY3RCZWdpbjogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRpZiAocG9zaXRpb24gPD0gb2Zmc2V0KSB7XG5cdFx0XHRcdFx0dGhyb3cgZWFybHlSZXR1cm5FeGNlcHRpb247XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJldmlvdXNOb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpc0F0UHJvcGVydHlLZXkgPSBwb3NpdGlvbiA+IG9mZnNldDtcblx0XHRcdFx0c2VnbWVudHMucHVzaCgnJyk7IC8vIHB1c2ggYSBwbGFjZWhvbGRlciAod2lsbCBiZSByZXBsYWNlZClcblx0XHRcdH0sXG5cdFx0XHRvbk9iamVjdFByb3BlcnR5OiAobmFtZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdFx0aWYgKHBvc2l0aW9uIDwgb2Zmc2V0KSB7XG5cdFx0XHRcdFx0dGhyb3cgZWFybHlSZXR1cm5FeGNlcHRpb247XG5cdFx0XHRcdH1cblx0XHRcdFx0c2V0UHJldmlvdXNOb2RlKG5hbWUsIG9mZnNldCwgbGVuZ3RoLCAncHJvcGVydHknKTtcblx0XHRcdFx0c2VnbWVudHNbc2VnbWVudHMubGVuZ3RoIC0gMV0gPSBuYW1lO1xuXHRcdFx0XHRpZiAocG9zaXRpb24gPD0gb2Zmc2V0ICsgbGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhyb3cgZWFybHlSZXR1cm5FeGNlcHRpb247XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbk9iamVjdEVuZDogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRpZiAocG9zaXRpb24gPD0gb2Zmc2V0KSB7XG5cdFx0XHRcdFx0dGhyb3cgZWFybHlSZXR1cm5FeGNlcHRpb247XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJldmlvdXNOb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRzZWdtZW50cy5wb3AoKTtcblx0XHRcdH0sXG5cdFx0XHRvbkFycmF5QmVnaW46IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdFx0aWYgKHBvc2l0aW9uIDw9IG9mZnNldCkge1xuXHRcdFx0XHRcdHRocm93IGVhcmx5UmV0dXJuRXhjZXB0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByZXZpb3VzTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c2VnbWVudHMucHVzaCgwKTtcblx0XHRcdH0sXG5cdFx0XHRvbkFycmF5RW5kOiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGlmIChwb3NpdGlvbiA8PSBvZmZzZXQpIHtcblx0XHRcdFx0XHR0aHJvdyBlYXJseVJldHVybkV4Y2VwdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcmV2aW91c05vZGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHNlZ21lbnRzLnBvcCgpO1xuXHRcdFx0fSxcblx0XHRcdG9uTGl0ZXJhbFZhbHVlOiAodmFsdWU6IGFueSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGlmIChwb3NpdGlvbiA8IG9mZnNldCkge1xuXHRcdFx0XHRcdHRocm93IGVhcmx5UmV0dXJuRXhjZXB0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldFByZXZpb3VzTm9kZSh2YWx1ZSwgb2Zmc2V0LCBsZW5ndGgsIGdldE5vZGVUeXBlKHZhbHVlKSk7XG5cblx0XHRcdFx0aWYgKHBvc2l0aW9uIDw9IG9mZnNldCArIGxlbmd0aCkge1xuXHRcdFx0XHRcdHRocm93IGVhcmx5UmV0dXJuRXhjZXB0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25TZXBhcmF0b3I6IChzZXA6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGlmIChwb3NpdGlvbiA8PSBvZmZzZXQpIHtcblx0XHRcdFx0XHR0aHJvdyBlYXJseVJldHVybkV4Y2VwdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2VwID09PSAnOicgJiYgcHJldmlvdXNOb2RlICYmIHByZXZpb3VzTm9kZS50eXBlID09PSAncHJvcGVydHknKSB7XG5cdFx0XHRcdFx0cHJldmlvdXNOb2RlLmNvbG9uT2Zmc2V0ID0gb2Zmc2V0O1xuXHRcdFx0XHRcdGlzQXRQcm9wZXJ0eUtleSA9IGZhbHNlO1xuXHRcdFx0XHRcdHByZXZpb3VzTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSBlbHNlIGlmIChzZXAgPT09ICcsJykge1xuXHRcdFx0XHRcdGNvbnN0IGxhc3QgPSBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGxhc3QgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXSA9IGxhc3QgKyAxO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpc0F0UHJvcGVydHlLZXkgPSB0cnVlO1xuXHRcdFx0XHRcdFx0c2VnbWVudHNbc2VnbWVudHMubGVuZ3RoIC0gMV0gPSAnJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHJldmlvdXNOb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRpZiAoZSAhPT0gZWFybHlSZXR1cm5FeGNlcHRpb24pIHtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRwYXRoOiBzZWdtZW50cyxcblx0XHRwcmV2aW91c05vZGUsXG5cdFx0aXNBdFByb3BlcnR5S2V5LFxuXHRcdG1hdGNoZXM6IChwYXR0ZXJuOiBTZWdtZW50W10pID0+IHtcblx0XHRcdGxldCBrID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBrIDwgcGF0dGVybi5sZW5ndGggJiYgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmIChwYXR0ZXJuW2tdID09PSBzZWdtZW50c1tpXSB8fCBwYXR0ZXJuW2tdID09PSAnKicpIHtcblx0XHRcdFx0XHRrKys7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGF0dGVybltrXSAhPT0gJyoqJykge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGsgPT09IHBhdHRlcm4ubGVuZ3RoO1xuXHRcdH1cblx0fTtcbn1cblxuXG4vKipcbiAqIFBhcnNlcyB0aGUgZ2l2ZW4gdGV4dCBhbmQgcmV0dXJucyB0aGUgb2JqZWN0IHRoZSBKU09OIGNvbnRlbnQgcmVwcmVzZW50cy4gT24gaW52YWxpZCBpbnB1dCwgdGhlIHBhcnNlciB0cmllcyB0byBiZSBhcyBmYXVsdCB0b2xlcmFudCBhcyBwb3NzaWJsZSwgYnV0IHN0aWxsIHJldHVybiBhIHJlc3VsdC5cbiAqIFRoZXJlZm9yZSBhbHdheXMgY2hlY2sgdGhlIGVycm9ycyBsaXN0IHRvIGZpbmQgb3V0IGlmIHRoZSBpbnB1dCB3YXMgdmFsaWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZSh0ZXh0OiBzdHJpbmcsIGVycm9yczogUGFyc2VFcnJvcltdID0gW10sIG9wdGlvbnM6IFBhcnNlT3B0aW9ucyA9IFBhcnNlT3B0aW9ucy5ERUZBVUxUKTogYW55IHtcblx0bGV0IGN1cnJlbnRQcm9wZXJ0eTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdGxldCBjdXJyZW50UGFyZW50OiBhbnkgPSBbXTtcblx0Y29uc3QgcHJldmlvdXNQYXJlbnRzOiBhbnlbXSA9IFtdO1xuXG5cdGZ1bmN0aW9uIG9uVmFsdWUodmFsdWU6IHVua25vd24pIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShjdXJyZW50UGFyZW50KSkge1xuXHRcdFx0Y3VycmVudFBhcmVudC5wdXNoKHZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKGN1cnJlbnRQcm9wZXJ0eSAhPT0gbnVsbCkge1xuXHRcdFx0Y3VycmVudFBhcmVudFtjdXJyZW50UHJvcGVydHldID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgdmlzaXRvcjogSlNPTlZpc2l0b3IgPSB7XG5cdFx0b25PYmplY3RCZWdpbjogKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb2JqZWN0ID0ge307XG5cdFx0XHRvblZhbHVlKG9iamVjdCk7XG5cdFx0XHRwcmV2aW91c1BhcmVudHMucHVzaChjdXJyZW50UGFyZW50KTtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBvYmplY3Q7XG5cdFx0XHRjdXJyZW50UHJvcGVydHkgPSBudWxsO1xuXHRcdH0sXG5cdFx0b25PYmplY3RQcm9wZXJ0eTogKG5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbmFtZTtcblx0XHR9LFxuXHRcdG9uT2JqZWN0RW5kOiAoKSA9PiB7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gcHJldmlvdXNQYXJlbnRzLnBvcCgpO1xuXHRcdH0sXG5cdFx0b25BcnJheUJlZ2luOiAoKSA9PiB7XG5cdFx0XHRjb25zdCBhcnJheTogYW55W10gPSBbXTtcblx0XHRcdG9uVmFsdWUoYXJyYXkpO1xuXHRcdFx0cHJldmlvdXNQYXJlbnRzLnB1c2goY3VycmVudFBhcmVudCk7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gYXJyYXk7XG5cdFx0XHRjdXJyZW50UHJvcGVydHkgPSBudWxsO1xuXHRcdH0sXG5cdFx0b25BcnJheUVuZDogKCkgPT4ge1xuXHRcdFx0Y3VycmVudFBhcmVudCA9IHByZXZpb3VzUGFyZW50cy5wb3AoKTtcblx0XHR9LFxuXHRcdG9uTGl0ZXJhbFZhbHVlOiBvblZhbHVlLFxuXHRcdG9uRXJyb3I6IChlcnJvcjogUGFyc2VFcnJvckNvZGUsIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0ZXJyb3JzLnB1c2goeyBlcnJvciwgb2Zmc2V0LCBsZW5ndGggfSk7XG5cdFx0fVxuXHR9O1xuXHR2aXNpdCh0ZXh0LCB2aXNpdG9yLCBvcHRpb25zKTtcblx0cmV0dXJuIGN1cnJlbnRQYXJlbnRbMF07XG59XG5cblxuLyoqXG4gKiBQYXJzZXMgdGhlIGdpdmVuIHRleHQgYW5kIHJldHVybnMgYSB0cmVlIHJlcHJlc2VudGF0aW9uIHRoZSBKU09OIGNvbnRlbnQuIE9uIGludmFsaWQgaW5wdXQsIHRoZSBwYXJzZXIgdHJpZXMgdG8gYmUgYXMgZmF1bHQgdG9sZXJhbnQgYXMgcG9zc2libGUsIGJ1dCBzdGlsbCByZXR1cm4gYSByZXN1bHQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVRyZWUodGV4dDogc3RyaW5nLCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdLCBvcHRpb25zOiBQYXJzZU9wdGlvbnMgPSBQYXJzZU9wdGlvbnMuREVGQVVMVCk6IE5vZGUge1xuXHRsZXQgY3VycmVudFBhcmVudDogTm9kZUltcGwgPSB7IHR5cGU6ICdhcnJheScsIG9mZnNldDogLTEsIGxlbmd0aDogLTEsIGNoaWxkcmVuOiBbXSwgcGFyZW50OiB1bmRlZmluZWQgfTsgLy8gYXJ0aWZpY2lhbCByb290XG5cblx0ZnVuY3Rpb24gZW5zdXJlUHJvcGVydHlDb21wbGV0ZShlbmRPZmZzZXQ6IG51bWJlcikge1xuXHRcdGlmIChjdXJyZW50UGFyZW50LnR5cGUgPT09ICdwcm9wZXJ0eScpIHtcblx0XHRcdGN1cnJlbnRQYXJlbnQubGVuZ3RoID0gZW5kT2Zmc2V0IC0gY3VycmVudFBhcmVudC5vZmZzZXQ7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gY3VycmVudFBhcmVudC5wYXJlbnQhO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIG9uVmFsdWUodmFsdWVOb2RlOiBOb2RlKTogTm9kZSB7XG5cdFx0Y3VycmVudFBhcmVudC5jaGlsZHJlbiEucHVzaCh2YWx1ZU5vZGUpO1xuXHRcdHJldHVybiB2YWx1ZU5vZGU7XG5cdH1cblxuXHRjb25zdCB2aXNpdG9yOiBKU09OVmlzaXRvciA9IHtcblx0XHRvbk9iamVjdEJlZ2luOiAob2Zmc2V0OiBudW1iZXIpID0+IHtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBvblZhbHVlKHsgdHlwZTogJ29iamVjdCcsIG9mZnNldCwgbGVuZ3RoOiAtMSwgcGFyZW50OiBjdXJyZW50UGFyZW50LCBjaGlsZHJlbjogW10gfSk7XG5cdFx0fSxcblx0XHRvbk9iamVjdFByb3BlcnR5OiAobmFtZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBvblZhbHVlKHsgdHlwZTogJ3Byb3BlcnR5Jywgb2Zmc2V0LCBsZW5ndGg6IC0xLCBwYXJlbnQ6IGN1cnJlbnRQYXJlbnQsIGNoaWxkcmVuOiBbXSB9KTtcblx0XHRcdGN1cnJlbnRQYXJlbnQuY2hpbGRyZW4hLnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG5hbWUsIG9mZnNldCwgbGVuZ3RoLCBwYXJlbnQ6IGN1cnJlbnRQYXJlbnQgfSk7XG5cdFx0fSxcblx0XHRvbk9iamVjdEVuZDogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y3VycmVudFBhcmVudC5sZW5ndGggPSBvZmZzZXQgKyBsZW5ndGggLSBjdXJyZW50UGFyZW50Lm9mZnNldDtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBjdXJyZW50UGFyZW50LnBhcmVudCE7XG5cdFx0XHRlbnN1cmVQcm9wZXJ0eUNvbXBsZXRlKG9mZnNldCArIGxlbmd0aCk7XG5cdFx0fSxcblx0XHRvbkFycmF5QmVnaW46IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBvblZhbHVlKHsgdHlwZTogJ2FycmF5Jywgb2Zmc2V0LCBsZW5ndGg6IC0xLCBwYXJlbnQ6IGN1cnJlbnRQYXJlbnQsIGNoaWxkcmVuOiBbXSB9KTtcblx0XHR9LFxuXHRcdG9uQXJyYXlFbmQ6IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGN1cnJlbnRQYXJlbnQubGVuZ3RoID0gb2Zmc2V0ICsgbGVuZ3RoIC0gY3VycmVudFBhcmVudC5vZmZzZXQ7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gY3VycmVudFBhcmVudC5wYXJlbnQhO1xuXHRcdFx0ZW5zdXJlUHJvcGVydHlDb21wbGV0ZShvZmZzZXQgKyBsZW5ndGgpO1xuXHRcdH0sXG5cdFx0b25MaXRlcmFsVmFsdWU6ICh2YWx1ZTogdW5rbm93biwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRvblZhbHVlKHsgdHlwZTogZ2V0Tm9kZVR5cGUodmFsdWUpLCBvZmZzZXQsIGxlbmd0aCwgcGFyZW50OiBjdXJyZW50UGFyZW50LCB2YWx1ZSB9KTtcblx0XHRcdGVuc3VyZVByb3BlcnR5Q29tcGxldGUob2Zmc2V0ICsgbGVuZ3RoKTtcblx0XHR9LFxuXHRcdG9uU2VwYXJhdG9yOiAoc2VwOiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0aWYgKGN1cnJlbnRQYXJlbnQudHlwZSA9PT0gJ3Byb3BlcnR5Jykge1xuXHRcdFx0XHRpZiAoc2VwID09PSAnOicpIHtcblx0XHRcdFx0XHRjdXJyZW50UGFyZW50LmNvbG9uT2Zmc2V0ID0gb2Zmc2V0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNlcCA9PT0gJywnKSB7XG5cdFx0XHRcdFx0ZW5zdXJlUHJvcGVydHlDb21wbGV0ZShvZmZzZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRvbkVycm9yOiAoZXJyb3I6IFBhcnNlRXJyb3JDb2RlLCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGVycm9ycy5wdXNoKHsgZXJyb3IsIG9mZnNldCwgbGVuZ3RoIH0pO1xuXHRcdH1cblx0fTtcblx0dmlzaXQodGV4dCwgdmlzaXRvciwgb3B0aW9ucyk7XG5cblx0Y29uc3QgcmVzdWx0ID0gY3VycmVudFBhcmVudC5jaGlsZHJlbiFbMF07XG5cdGlmIChyZXN1bHQpIHtcblx0XHRkZWxldGUgcmVzdWx0LnBhcmVudDtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEZpbmRzIHRoZSBub2RlIGF0IHRoZSBnaXZlbiBwYXRoIGluIGEgSlNPTiBET00uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTm9kZUF0TG9jYXRpb24ocm9vdDogTm9kZSwgcGF0aDogSlNPTlBhdGgpOiBOb2RlIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyb290KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgbm9kZSA9IHJvb3Q7XG5cdGZvciAoY29uc3Qgc2VnbWVudCBvZiBwYXRoKSB7XG5cdFx0aWYgKHR5cGVvZiBzZWdtZW50ID09PSAnc3RyaW5nJykge1xuXHRcdFx0aWYgKG5vZGUudHlwZSAhPT0gJ29iamVjdCcgfHwgIUFycmF5LmlzQXJyYXkobm9kZS5jaGlsZHJlbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBwcm9wZXJ0eU5vZGUgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwcm9wZXJ0eU5vZGUuY2hpbGRyZW4pICYmIHByb3BlcnR5Tm9kZS5jaGlsZHJlblswXS52YWx1ZSA9PT0gc2VnbWVudCkge1xuXHRcdFx0XHRcdG5vZGUgPSBwcm9wZXJ0eU5vZGUuY2hpbGRyZW5bMV07XG5cdFx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gc2VnbWVudDtcblx0XHRcdGlmIChub2RlLnR5cGUgIT09ICdhcnJheScgfHwgaW5kZXggPCAwIHx8ICFBcnJheS5pc0FycmF5KG5vZGUuY2hpbGRyZW4pIHx8IGluZGV4ID49IG5vZGUuY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRub2RlID0gbm9kZS5jaGlsZHJlbltpbmRleF07XG5cdFx0fVxuXHR9XG5cdHJldHVybiBub2RlO1xufVxuXG4vKipcbiAqIEdldHMgdGhlIEpTT04gcGF0aCBvZiB0aGUgZ2l2ZW4gSlNPTiBET00gbm9kZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Tm9kZVBhdGgobm9kZTogTm9kZSk6IEpTT05QYXRoIHtcblx0aWYgKCFub2RlLnBhcmVudCB8fCAhbm9kZS5wYXJlbnQuY2hpbGRyZW4pIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgcGF0aCA9IGdldE5vZGVQYXRoKG5vZGUucGFyZW50KTtcblx0aWYgKG5vZGUucGFyZW50LnR5cGUgPT09ICdwcm9wZXJ0eScpIHtcblx0XHRjb25zdCBrZXkgPSBub2RlLnBhcmVudC5jaGlsZHJlblswXS52YWx1ZTtcblx0XHRwYXRoLnB1c2goa2V5KTtcblx0fSBlbHNlIGlmIChub2RlLnBhcmVudC50eXBlID09PSAnYXJyYXknKSB7XG5cdFx0Y29uc3QgaW5kZXggPSBub2RlLnBhcmVudC5jaGlsZHJlbi5pbmRleE9mKG5vZGUpO1xuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdHBhdGgucHVzaChpbmRleCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBwYXRoO1xufVxuXG4vKipcbiAqIEV2YWx1YXRlcyB0aGUgSmF2YVNjcmlwdCBvYmplY3Qgb2YgdGhlIGdpdmVuIEpTT04gRE9NIG5vZGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE5vZGVWYWx1ZShub2RlOiBOb2RlKTogYW55IHtcblx0c3dpdGNoIChub2RlLnR5cGUpIHtcblx0XHRjYXNlICdhcnJheSc6XG5cdFx0XHRyZXR1cm4gbm9kZS5jaGlsZHJlbiEubWFwKGdldE5vZGVWYWx1ZSk7XG5cdFx0Y2FzZSAnb2JqZWN0Jzoge1xuXHRcdFx0Y29uc3Qgb2JqID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdGZvciAoY29uc3QgcHJvcCBvZiBub2RlLmNoaWxkcmVuISkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZU5vZGUgPSBwcm9wLmNoaWxkcmVuIVsxXTtcblx0XHRcdFx0aWYgKHZhbHVlTm9kZSkge1xuXHRcdFx0XHRcdG9ialtwcm9wLmNoaWxkcmVuIVswXS52YWx1ZV0gPSBnZXROb2RlVmFsdWUodmFsdWVOb2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9XG5cdFx0Y2FzZSAnbnVsbCc6XG5cdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRjYXNlICdudW1iZXInOlxuXHRcdGNhc2UgJ2Jvb2xlYW4nOlxuXHRcdFx0cmV0dXJuIG5vZGUudmFsdWU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29udGFpbnMobm9kZTogTm9kZSwgb2Zmc2V0OiBudW1iZXIsIGluY2x1ZGVSaWdodEJvdW5kID0gZmFsc2UpOiBib29sZWFuIHtcblx0cmV0dXJuIChvZmZzZXQgPj0gbm9kZS5vZmZzZXQgJiYgb2Zmc2V0IDwgKG5vZGUub2Zmc2V0ICsgbm9kZS5sZW5ndGgpKSB8fCBpbmNsdWRlUmlnaHRCb3VuZCAmJiAob2Zmc2V0ID09PSAobm9kZS5vZmZzZXQgKyBub2RlLmxlbmd0aCkpO1xufVxuXG4vKipcbiAqIEZpbmRzIHRoZSBtb3N0IGlubmVyIG5vZGUgYXQgdGhlIGdpdmVuIG9mZnNldC4gSWYgaW5jbHVkZVJpZ2h0Qm91bmQgaXMgc2V0LCBhbHNvIGZpbmRzIG5vZGVzIHRoYXQgZW5kIGF0IHRoZSBnaXZlbiBvZmZzZXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTm9kZUF0T2Zmc2V0KG5vZGU6IE5vZGUsIG9mZnNldDogbnVtYmVyLCBpbmNsdWRlUmlnaHRCb3VuZCA9IGZhbHNlKTogTm9kZSB8IHVuZGVmaW5lZCB7XG5cdGlmIChjb250YWlucyhub2RlLCBvZmZzZXQsIGluY2x1ZGVSaWdodEJvdW5kKSkge1xuXHRcdGNvbnN0IGNoaWxkcmVuID0gbm9kZS5jaGlsZHJlbjtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShjaGlsZHJlbikpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoICYmIGNoaWxkcmVuW2ldLm9mZnNldCA8PSBvZmZzZXQ7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gZmluZE5vZGVBdE9mZnNldChjaGlsZHJlbltpXSwgb2Zmc2V0LCBpbmNsdWRlUmlnaHRCb3VuZCk7XG5cdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH1cblx0XHRyZXR1cm4gbm9kZTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5cbi8qKlxuICogUGFyc2VzIHRoZSBnaXZlbiB0ZXh0IGFuZCBpbnZva2VzIHRoZSB2aXNpdG9yIGZ1bmN0aW9ucyBmb3IgZWFjaCBvYmplY3QsIGFycmF5IGFuZCBsaXRlcmFsIHJlYWNoZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2aXNpdCh0ZXh0OiBzdHJpbmcsIHZpc2l0b3I6IEpTT05WaXNpdG9yLCBvcHRpb25zOiBQYXJzZU9wdGlvbnMgPSBQYXJzZU9wdGlvbnMuREVGQVVMVCk6IGFueSB7XG5cblx0Y29uc3QgX3NjYW5uZXIgPSBjcmVhdGVTY2FubmVyKHRleHQsIGZhbHNlKTtcblxuXHRmdW5jdGlvbiB0b05vQXJnVmlzaXQodmlzaXRGdW5jdGlvbj86IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHZvaWQpOiAoKSA9PiB2b2lkIHtcblx0XHRyZXR1cm4gdmlzaXRGdW5jdGlvbiA/ICgpID0+IHZpc2l0RnVuY3Rpb24oX3NjYW5uZXIuZ2V0VG9rZW5PZmZzZXQoKSwgX3NjYW5uZXIuZ2V0VG9rZW5MZW5ndGgoKSkgOiAoKSA9PiB0cnVlO1xuXHR9XG5cdGZ1bmN0aW9uIHRvT25lQXJnVmlzaXQ8VD4odmlzaXRGdW5jdGlvbj86IChhcmc6IFQsIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4gdm9pZCk6IChhcmc6IFQpID0+IHZvaWQge1xuXHRcdHJldHVybiB2aXNpdEZ1bmN0aW9uID8gKGFyZzogVCkgPT4gdmlzaXRGdW5jdGlvbihhcmcsIF9zY2FubmVyLmdldFRva2VuT2Zmc2V0KCksIF9zY2FubmVyLmdldFRva2VuTGVuZ3RoKCkpIDogKCkgPT4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IG9uT2JqZWN0QmVnaW4gPSB0b05vQXJnVmlzaXQodmlzaXRvci5vbk9iamVjdEJlZ2luKSxcblx0XHRvbk9iamVjdFByb3BlcnR5ID0gdG9PbmVBcmdWaXNpdCh2aXNpdG9yLm9uT2JqZWN0UHJvcGVydHkpLFxuXHRcdG9uT2JqZWN0RW5kID0gdG9Ob0FyZ1Zpc2l0KHZpc2l0b3Iub25PYmplY3RFbmQpLFxuXHRcdG9uQXJyYXlCZWdpbiA9IHRvTm9BcmdWaXNpdCh2aXNpdG9yLm9uQXJyYXlCZWdpbiksXG5cdFx0b25BcnJheUVuZCA9IHRvTm9BcmdWaXNpdCh2aXNpdG9yLm9uQXJyYXlFbmQpLFxuXHRcdG9uTGl0ZXJhbFZhbHVlID0gdG9PbmVBcmdWaXNpdCh2aXNpdG9yLm9uTGl0ZXJhbFZhbHVlKSxcblx0XHRvblNlcGFyYXRvciA9IHRvT25lQXJnVmlzaXQodmlzaXRvci5vblNlcGFyYXRvciksXG5cdFx0b25Db21tZW50ID0gdG9Ob0FyZ1Zpc2l0KHZpc2l0b3Iub25Db21tZW50KSxcblx0XHRvbkVycm9yID0gdG9PbmVBcmdWaXNpdCh2aXNpdG9yLm9uRXJyb3IpO1xuXG5cdGNvbnN0IGRpc2FsbG93Q29tbWVudHMgPSBvcHRpb25zICYmIG9wdGlvbnMuZGlzYWxsb3dDb21tZW50cztcblx0Y29uc3QgYWxsb3dUcmFpbGluZ0NvbW1hID0gb3B0aW9ucyAmJiBvcHRpb25zLmFsbG93VHJhaWxpbmdDb21tYTtcblx0ZnVuY3Rpb24gc2Nhbk5leHQoKTogU3ludGF4S2luZCB7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IHRva2VuID0gX3NjYW5uZXIuc2NhbigpO1xuXHRcdFx0c3dpdGNoIChfc2Nhbm5lci5nZXRUb2tlbkVycm9yKCkpIHtcblx0XHRcdFx0Y2FzZSBTY2FuRXJyb3IuSW52YWxpZFVuaWNvZGU6XG5cdFx0XHRcdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuSW52YWxpZFVuaWNvZGUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNjYW5FcnJvci5JbnZhbGlkRXNjYXBlQ2hhcmFjdGVyOlxuXHRcdFx0XHRcdGhhbmRsZUVycm9yKFBhcnNlRXJyb3JDb2RlLkludmFsaWRFc2NhcGVDaGFyYWN0ZXIpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNjYW5FcnJvci5VbmV4cGVjdGVkRW5kT2ZOdW1iZXI6XG5cdFx0XHRcdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuVW5leHBlY3RlZEVuZE9mTnVtYmVyKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTY2FuRXJyb3IuVW5leHBlY3RlZEVuZE9mQ29tbWVudDpcblx0XHRcdFx0XHRpZiAoIWRpc2FsbG93Q29tbWVudHMpIHtcblx0XHRcdFx0XHRcdGhhbmRsZUVycm9yKFBhcnNlRXJyb3JDb2RlLlVuZXhwZWN0ZWRFbmRPZkNvbW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTY2FuRXJyb3IuVW5leHBlY3RlZEVuZE9mU3RyaW5nOlxuXHRcdFx0XHRcdGhhbmRsZUVycm9yKFBhcnNlRXJyb3JDb2RlLlVuZXhwZWN0ZWRFbmRPZlN0cmluZyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU2NhbkVycm9yLkludmFsaWRDaGFyYWN0ZXI6XG5cdFx0XHRcdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuSW52YWxpZENoYXJhY3Rlcik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRzd2l0Y2ggKHRva2VuKSB7XG5cdFx0XHRcdGNhc2UgU3ludGF4S2luZC5MaW5lQ29tbWVudFRyaXZpYTpcblx0XHRcdFx0Y2FzZSBTeW50YXhLaW5kLkJsb2NrQ29tbWVudFRyaXZpYTpcblx0XHRcdFx0XHRpZiAoZGlzYWxsb3dDb21tZW50cykge1xuXHRcdFx0XHRcdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuSW52YWxpZENvbW1lbnRUb2tlbik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG9uQ29tbWVudCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTeW50YXhLaW5kLlVua25vd246XG5cdFx0XHRcdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuSW52YWxpZFN5bWJvbCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3ludGF4S2luZC5Ucml2aWE6XG5cdFx0XHRcdGNhc2UgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWE6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGhhbmRsZUVycm9yKGVycm9yOiBQYXJzZUVycm9yQ29kZSwgc2tpcFVudGlsQWZ0ZXI6IFN5bnRheEtpbmRbXSA9IFtdLCBza2lwVW50aWw6IFN5bnRheEtpbmRbXSA9IFtdKTogdm9pZCB7XG5cdFx0b25FcnJvcihlcnJvcik7XG5cdFx0aWYgKHNraXBVbnRpbEFmdGVyLmxlbmd0aCArIHNraXBVbnRpbC5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgdG9rZW4gPSBfc2Nhbm5lci5nZXRUb2tlbigpO1xuXHRcdFx0d2hpbGUgKHRva2VuICE9PSBTeW50YXhLaW5kLkVPRikge1xuXHRcdFx0XHRpZiAoc2tpcFVudGlsQWZ0ZXIuaW5kZXhPZih0b2tlbikgIT09IC0xKSB7XG5cdFx0XHRcdFx0c2Nhbk5leHQoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIGlmIChza2lwVW50aWwuaW5kZXhPZih0b2tlbikgIT09IC0xKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0dG9rZW4gPSBzY2FuTmV4dCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlU3RyaW5nKGlzVmFsdWU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCB2YWx1ZSA9IF9zY2FubmVyLmdldFRva2VuVmFsdWUoKTtcblx0XHRpZiAoaXNWYWx1ZSkge1xuXHRcdFx0b25MaXRlcmFsVmFsdWUodmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvbk9iamVjdFByb3BlcnR5KHZhbHVlKTtcblx0XHR9XG5cdFx0c2Nhbk5leHQoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlTGl0ZXJhbCgpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKF9zY2FubmVyLmdldFRva2VuKCkpIHtcblx0XHRcdGNhc2UgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbDoge1xuXHRcdFx0XHRsZXQgdmFsdWUgPSAwO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHZhbHVlID0gSlNPTi5wYXJzZShfc2Nhbm5lci5nZXRUb2tlblZhbHVlKCkpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRoYW5kbGVFcnJvcihQYXJzZUVycm9yQ29kZS5JbnZhbGlkTnVtYmVyRm9ybWF0KTtcblx0XHRcdFx0XHRcdHZhbHVlID0gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRoYW5kbGVFcnJvcihQYXJzZUVycm9yQ29kZS5JbnZhbGlkTnVtYmVyRm9ybWF0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvbkxpdGVyYWxWYWx1ZSh2YWx1ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBTeW50YXhLaW5kLk51bGxLZXl3b3JkOlxuXHRcdFx0XHRvbkxpdGVyYWxWYWx1ZShudWxsKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN5bnRheEtpbmQuVHJ1ZUtleXdvcmQ6XG5cdFx0XHRcdG9uTGl0ZXJhbFZhbHVlKHRydWUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3ludGF4S2luZC5GYWxzZUtleXdvcmQ6XG5cdFx0XHRcdG9uTGl0ZXJhbFZhbHVlKGZhbHNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHNjYW5OZXh0KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRmdW5jdGlvbiBwYXJzZVByb3BlcnR5KCk6IGJvb2xlYW4ge1xuXHRcdGlmIChfc2Nhbm5lci5nZXRUb2tlbigpICE9PSBTeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwpIHtcblx0XHRcdGhhbmRsZUVycm9yKFBhcnNlRXJyb3JDb2RlLlByb3BlcnR5TmFtZUV4cGVjdGVkLCBbXSwgW1N5bnRheEtpbmQuQ2xvc2VCcmFjZVRva2VuLCBTeW50YXhLaW5kLkNvbW1hVG9rZW5dKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cGFyc2VTdHJpbmcoZmFsc2UpO1xuXHRcdGlmIChfc2Nhbm5lci5nZXRUb2tlbigpID09PSBTeW50YXhLaW5kLkNvbG9uVG9rZW4pIHtcblx0XHRcdG9uU2VwYXJhdG9yKCc6Jyk7XG5cdFx0XHRzY2FuTmV4dCgpOyAvLyBjb25zdW1lIGNvbG9uXG5cblx0XHRcdGlmICghcGFyc2VWYWx1ZSgpKSB7XG5cdFx0XHRcdGhhbmRsZUVycm9yKFBhcnNlRXJyb3JDb2RlLlZhbHVlRXhwZWN0ZWQsIFtdLCBbU3ludGF4S2luZC5DbG9zZUJyYWNlVG9rZW4sIFN5bnRheEtpbmQuQ29tbWFUb2tlbl0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRoYW5kbGVFcnJvcihQYXJzZUVycm9yQ29kZS5Db2xvbkV4cGVjdGVkLCBbXSwgW1N5bnRheEtpbmQuQ2xvc2VCcmFjZVRva2VuLCBTeW50YXhLaW5kLkNvbW1hVG9rZW5dKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRmdW5jdGlvbiBwYXJzZU9iamVjdCgpOiBib29sZWFuIHtcblx0XHRvbk9iamVjdEJlZ2luKCk7XG5cdFx0c2Nhbk5leHQoKTsgLy8gY29uc3VtZSBvcGVuIGJyYWNlXG5cblx0XHRsZXQgbmVlZHNDb21tYSA9IGZhbHNlO1xuXHRcdHdoaWxlIChfc2Nhbm5lci5nZXRUb2tlbigpICE9PSBTeW50YXhLaW5kLkNsb3NlQnJhY2VUb2tlbiAmJiBfc2Nhbm5lci5nZXRUb2tlbigpICE9PSBTeW50YXhLaW5kLkVPRikge1xuXHRcdFx0aWYgKF9zY2FubmVyLmdldFRva2VuKCkgPT09IFN5bnRheEtpbmQuQ29tbWFUb2tlbikge1xuXHRcdFx0XHRpZiAoIW5lZWRzQ29tbWEpIHtcblx0XHRcdFx0XHRoYW5kbGVFcnJvcihQYXJzZUVycm9yQ29kZS5WYWx1ZUV4cGVjdGVkLCBbXSwgW10pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9uU2VwYXJhdG9yKCcsJyk7XG5cdFx0XHRcdHNjYW5OZXh0KCk7IC8vIGNvbnN1bWUgY29tbWFcblx0XHRcdFx0aWYgKF9zY2FubmVyLmdldFRva2VuKCkgPT09IFN5bnRheEtpbmQuQ2xvc2VCcmFjZVRva2VuICYmIGFsbG93VHJhaWxpbmdDb21tYSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKG5lZWRzQ29tbWEpIHtcblx0XHRcdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuQ29tbWFFeHBlY3RlZCwgW10sIFtdKTtcblx0XHRcdH1cblx0XHRcdGlmICghcGFyc2VQcm9wZXJ0eSgpKSB7XG5cdFx0XHRcdGhhbmRsZUVycm9yKFBhcnNlRXJyb3JDb2RlLlZhbHVlRXhwZWN0ZWQsIFtdLCBbU3ludGF4S2luZC5DbG9zZUJyYWNlVG9rZW4sIFN5bnRheEtpbmQuQ29tbWFUb2tlbl0pO1xuXHRcdFx0fVxuXHRcdFx0bmVlZHNDb21tYSA9IHRydWU7XG5cdFx0fVxuXHRcdG9uT2JqZWN0RW5kKCk7XG5cdFx0aWYgKF9zY2FubmVyLmdldFRva2VuKCkgIT09IFN5bnRheEtpbmQuQ2xvc2VCcmFjZVRva2VuKSB7XG5cdFx0XHRoYW5kbGVFcnJvcihQYXJzZUVycm9yQ29kZS5DbG9zZUJyYWNlRXhwZWN0ZWQsIFtTeW50YXhLaW5kLkNsb3NlQnJhY2VUb2tlbl0sIFtdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2Nhbk5leHQoKTsgLy8gY29uc3VtZSBjbG9zZSBicmFjZVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlQXJyYXkoKTogYm9vbGVhbiB7XG5cdFx0b25BcnJheUJlZ2luKCk7XG5cdFx0c2Nhbk5leHQoKTsgLy8gY29uc3VtZSBvcGVuIGJyYWNrZXRcblxuXHRcdGxldCBuZWVkc0NvbW1hID0gZmFsc2U7XG5cdFx0d2hpbGUgKF9zY2FubmVyLmdldFRva2VuKCkgIT09IFN5bnRheEtpbmQuQ2xvc2VCcmFja2V0VG9rZW4gJiYgX3NjYW5uZXIuZ2V0VG9rZW4oKSAhPT0gU3ludGF4S2luZC5FT0YpIHtcblx0XHRcdGlmIChfc2Nhbm5lci5nZXRUb2tlbigpID09PSBTeW50YXhLaW5kLkNvbW1hVG9rZW4pIHtcblx0XHRcdFx0aWYgKCFuZWVkc0NvbW1hKSB7XG5cdFx0XHRcdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuVmFsdWVFeHBlY3RlZCwgW10sIFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvblNlcGFyYXRvcignLCcpO1xuXHRcdFx0XHRzY2FuTmV4dCgpOyAvLyBjb25zdW1lIGNvbW1hXG5cdFx0XHRcdGlmIChfc2Nhbm5lci5nZXRUb2tlbigpID09PSBTeW50YXhLaW5kLkNsb3NlQnJhY2tldFRva2VuICYmIGFsbG93VHJhaWxpbmdDb21tYSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKG5lZWRzQ29tbWEpIHtcblx0XHRcdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuQ29tbWFFeHBlY3RlZCwgW10sIFtdKTtcblx0XHRcdH1cblx0XHRcdGlmICghcGFyc2VWYWx1ZSgpKSB7XG5cdFx0XHRcdGhhbmRsZUVycm9yKFBhcnNlRXJyb3JDb2RlLlZhbHVlRXhwZWN0ZWQsIFtdLCBbU3ludGF4S2luZC5DbG9zZUJyYWNrZXRUb2tlbiwgU3ludGF4S2luZC5Db21tYVRva2VuXSk7XG5cdFx0XHR9XG5cdFx0XHRuZWVkc0NvbW1hID0gdHJ1ZTtcblx0XHR9XG5cdFx0b25BcnJheUVuZCgpO1xuXHRcdGlmIChfc2Nhbm5lci5nZXRUb2tlbigpICE9PSBTeW50YXhLaW5kLkNsb3NlQnJhY2tldFRva2VuKSB7XG5cdFx0XHRoYW5kbGVFcnJvcihQYXJzZUVycm9yQ29kZS5DbG9zZUJyYWNrZXRFeHBlY3RlZCwgW1N5bnRheEtpbmQuQ2xvc2VCcmFja2V0VG9rZW5dLCBbXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNjYW5OZXh0KCk7IC8vIGNvbnN1bWUgY2xvc2UgYnJhY2tldFxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZ1bmN0aW9uIHBhcnNlVmFsdWUoKTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoIChfc2Nhbm5lci5nZXRUb2tlbigpKSB7XG5cdFx0XHRjYXNlIFN5bnRheEtpbmQuT3BlbkJyYWNrZXRUb2tlbjpcblx0XHRcdFx0cmV0dXJuIHBhcnNlQXJyYXkoKTtcblx0XHRcdGNhc2UgU3ludGF4S2luZC5PcGVuQnJhY2VUb2tlbjpcblx0XHRcdFx0cmV0dXJuIHBhcnNlT2JqZWN0KCk7XG5cdFx0XHRjYXNlIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbDpcblx0XHRcdFx0cmV0dXJuIHBhcnNlU3RyaW5nKHRydWUpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHBhcnNlTGl0ZXJhbCgpO1xuXHRcdH1cblx0fVxuXG5cdHNjYW5OZXh0KCk7XG5cdGlmIChfc2Nhbm5lci5nZXRUb2tlbigpID09PSBTeW50YXhLaW5kLkVPRikge1xuXHRcdGlmIChvcHRpb25zLmFsbG93RW1wdHlDb250ZW50KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aGFuZGxlRXJyb3IoUGFyc2VFcnJvckNvZGUuVmFsdWVFeHBlY3RlZCwgW10sIFtdKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCFwYXJzZVZhbHVlKCkpIHtcblx0XHRoYW5kbGVFcnJvcihQYXJzZUVycm9yQ29kZS5WYWx1ZUV4cGVjdGVkLCBbXSwgW10pO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoX3NjYW5uZXIuZ2V0VG9rZW4oKSAhPT0gU3ludGF4S2luZC5FT0YpIHtcblx0XHRoYW5kbGVFcnJvcihQYXJzZUVycm9yQ29kZS5FbmRPZkZpbGVFeHBlY3RlZCwgW10sIFtdKTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE5vZGVUeXBlKHZhbHVlOiB1bmtub3duKTogTm9kZVR5cGUge1xuXHRzd2l0Y2ggKHR5cGVvZiB2YWx1ZSkge1xuXHRcdGNhc2UgJ2Jvb2xlYW4nOiByZXR1cm4gJ2Jvb2xlYW4nO1xuXHRcdGNhc2UgJ251bWJlcic6IHJldHVybiAnbnVtYmVyJztcblx0XHRjYXNlICdzdHJpbmcnOiByZXR1cm4gJ3N0cmluZyc7XG5cdFx0Y2FzZSAnb2JqZWN0Jzoge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gJ251bGwnO1xuXHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gJ2FycmF5Jztcblx0XHRcdH1cblx0XHRcdHJldHVybiAnb2JqZWN0Jztcblx0XHR9XG5cdFx0ZGVmYXVsdDogcmV0dXJuICdudWxsJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS08sSUFBVyxZQUFYLGtCQUFX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T0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksT0FBSjtBQUVBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNBLEVBQUFBLGdDQUFBLE9BQUksTUFBSjtBQUNB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QyxXQUFXLEdBQUc7QUFDbEIsZ0JBQVksdUJBQThCLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDaEQsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLFNBQVMsU0FBUyxNQUFNLGNBQWdCO0FBQzNDLGdCQUFZLDJCQUFrQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDckQ7QUFDQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLFlBQVksT0FBMEI7QUFDckQsVUFBUSxPQUFPLE9BQU87QUFBQSxJQUNyQixLQUFLO0FBQVcsYUFBTztBQUFBLElBQ3ZCLEtBQUs7QUFBVSxhQUFPO0FBQUEsSUFDdEIsS0FBSztBQUFVLGFBQU87QUFBQSxJQUN0QixLQUFLLFVBQVU7QUFDZCxVQUFJLENBQUMsT0FBTztBQUNYLGVBQU87QUFBQSxNQUNSLFdBQVcsTUFBTSxRQUFRLEtBQUssR0FBRztBQUNoQyxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsSUFDQTtBQUFTLGFBQU87QUFBQSxFQUNqQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJTY2FuRXJyb3IiLCAiU3ludGF4S2luZCIsICJQYXJzZUVycm9yQ29kZSIsICJQYXJzZU9wdGlvbnMiLCAiQ2hhcmFjdGVyQ29kZXMiXQp9Cg==
