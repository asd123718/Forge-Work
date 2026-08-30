import { CharCode } from "../../../base/common/charCode.js";
import { isChrome, isEdge, isFirefox, isLinux, isMacintosh, isSafari, isWeb, isWindows } from "../../../base/common/platform.js";
import { isFalsyOrWhitespace } from "../../../base/common/strings.js";
import { Scanner, TokenType } from "./scanner.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { localize } from "../../../nls.js";
import { illegalArgument } from "../../../base/common/errors.js";
const CONSTANT_VALUES = /* @__PURE__ */ new Map();
CONSTANT_VALUES.set("false", false);
CONSTANT_VALUES.set("true", true);
CONSTANT_VALUES.set("isMac", isMacintosh);
CONSTANT_VALUES.set("isLinux", isLinux);
CONSTANT_VALUES.set("isWindows", isWindows);
CONSTANT_VALUES.set("isWeb", isWeb);
CONSTANT_VALUES.set("isMacNative", isMacintosh && !isWeb);
CONSTANT_VALUES.set("isEdge", isEdge);
CONSTANT_VALUES.set("isFirefox", isFirefox);
CONSTANT_VALUES.set("isChrome", isChrome);
CONSTANT_VALUES.set("isSafari", isSafari);
function setConstant(key, value) {
  if (CONSTANT_VALUES.get(key) !== void 0) {
    throw illegalArgument("contextkey.setConstant(k, v) invoked with already set constant `k`");
  }
  CONSTANT_VALUES.set(key, value);
}
const hasOwnProperty = Object.prototype.hasOwnProperty;
var ContextKeyExprType = /* @__PURE__ */ ((ContextKeyExprType2) => {
  ContextKeyExprType2[ContextKeyExprType2["False"] = 0] = "False";
  ContextKeyExprType2[ContextKeyExprType2["True"] = 1] = "True";
  ContextKeyExprType2[ContextKeyExprType2["Defined"] = 2] = "Defined";
  ContextKeyExprType2[ContextKeyExprType2["Not"] = 3] = "Not";
  ContextKeyExprType2[ContextKeyExprType2["Equals"] = 4] = "Equals";
  ContextKeyExprType2[ContextKeyExprType2["NotEquals"] = 5] = "NotEquals";
  ContextKeyExprType2[ContextKeyExprType2["And"] = 6] = "And";
  ContextKeyExprType2[ContextKeyExprType2["Regex"] = 7] = "Regex";
  ContextKeyExprType2[ContextKeyExprType2["NotRegex"] = 8] = "NotRegex";
  ContextKeyExprType2[ContextKeyExprType2["Or"] = 9] = "Or";
  ContextKeyExprType2[ContextKeyExprType2["In"] = 10] = "In";
  ContextKeyExprType2[ContextKeyExprType2["NotIn"] = 11] = "NotIn";
  ContextKeyExprType2[ContextKeyExprType2["Greater"] = 12] = "Greater";
  ContextKeyExprType2[ContextKeyExprType2["GreaterEquals"] = 13] = "GreaterEquals";
  ContextKeyExprType2[ContextKeyExprType2["Smaller"] = 14] = "Smaller";
  ContextKeyExprType2[ContextKeyExprType2["SmallerEquals"] = 15] = "SmallerEquals";
  return ContextKeyExprType2;
})(ContextKeyExprType || {});
const defaultConfig = {
  regexParsingWithErrorRecovery: true
};
const errorEmptyString = localize("contextkey.parser.error.emptyString", "Empty context key expression");
const hintEmptyString = localize("contextkey.parser.error.emptyString.hint", "Did you forget to write an expression? You can also put 'false' or 'true' to always evaluate to false or true, respectively.");
const errorNoInAfterNot = localize("contextkey.parser.error.noInAfterNot", "'in' after 'not'.");
const errorClosingParenthesis = localize("contextkey.parser.error.closingParenthesis", "closing parenthesis ')'");
const errorUnexpectedToken = localize("contextkey.parser.error.unexpectedToken", "Unexpected token");
const hintUnexpectedToken = localize("contextkey.parser.error.unexpectedToken.hint", "Did you forget to put && or || before the token?");
const errorUnexpectedEOF = localize("contextkey.parser.error.unexpectedEOF", "Unexpected end of expression");
const hintUnexpectedEOF = localize("contextkey.parser.error.unexpectedEOF.hint", "Did you forget to put a context key?");
const _Parser = class _Parser {
  constructor(_config = defaultConfig) {
    this._config = _config;
    // lifetime note: `_scanner` lives as long as the parser does, i.e., is not reset between calls to `parse`
    this._scanner = new Scanner();
    // lifetime note: `_tokens`, `_current`, and `_parsingErrors` must be reset between calls to `parse`
    this._tokens = [];
    this._current = 0;
    // invariant: 0 <= this._current < this._tokens.length ; any incrementation of this value must first call `_isAtEnd`
    this._parsingErrors = [];
    this._flagsGYRe = /g|y/g;
  }
  get lexingErrors() {
    return this._scanner.errors;
  }
  get parsingErrors() {
    return this._parsingErrors;
  }
  /**
   * Parse a context key expression.
   *
   * @param input the expression to parse
   * @returns the parsed expression or `undefined` if there's an error - call `lexingErrors` and `parsingErrors` to see the errors
   */
  parse(input) {
    if (input === "") {
      this._parsingErrors.push({ message: errorEmptyString, offset: 0, lexeme: "", additionalInfo: hintEmptyString });
      return void 0;
    }
    this._tokens = this._scanner.reset(input).scan();
    this._current = 0;
    this._parsingErrors = [];
    try {
      const expr = this._expr();
      if (!this._isAtEnd()) {
        const peek = this._peek();
        const additionalInfo = peek.type === TokenType.Str ? hintUnexpectedToken : void 0;
        this._parsingErrors.push({ message: errorUnexpectedToken, offset: peek.offset, lexeme: Scanner.getLexeme(peek), additionalInfo });
        throw _Parser._parseError;
      }
      return expr;
    } catch (e) {
      if (!(e === _Parser._parseError)) {
        throw e;
      }
      return void 0;
    }
  }
  _expr() {
    return this._or();
  }
  _or() {
    const expr = [this._and()];
    while (this._matchOne(TokenType.Or)) {
      const right = this._and();
      expr.push(right);
    }
    return expr.length === 1 ? expr[0] : ContextKeyExpr.or(...expr);
  }
  _and() {
    const expr = [this._term()];
    while (this._matchOne(TokenType.And)) {
      const right = this._term();
      expr.push(right);
    }
    return expr.length === 1 ? expr[0] : ContextKeyExpr.and(...expr);
  }
  _term() {
    if (this._matchOne(TokenType.Neg)) {
      const peek = this._peek();
      switch (peek.type) {
        case TokenType.True:
          this._advance();
          return ContextKeyFalseExpr.INSTANCE;
        case TokenType.False:
          this._advance();
          return ContextKeyTrueExpr.INSTANCE;
        case TokenType.LParen: {
          this._advance();
          const expr = this._expr();
          this._consume(TokenType.RParen, errorClosingParenthesis);
          return expr?.negate();
        }
        case TokenType.Str:
          this._advance();
          return ContextKeyNotExpr.create(peek.lexeme);
        default:
          throw this._errExpectedButGot(`KEY | true | false | '(' expression ')'`, peek);
      }
    }
    return this._primary();
  }
  _primary() {
    const peek = this._peek();
    switch (peek.type) {
      case TokenType.True:
        this._advance();
        return ContextKeyExpr.true();
      case TokenType.False:
        this._advance();
        return ContextKeyExpr.false();
      case TokenType.LParen: {
        this._advance();
        const expr = this._expr();
        this._consume(TokenType.RParen, errorClosingParenthesis);
        return expr;
      }
      case TokenType.Str: {
        const key = peek.lexeme;
        this._advance();
        if (this._matchOne(TokenType.RegexOp)) {
          const expr = this._peek();
          if (!this._config.regexParsingWithErrorRecovery) {
            this._advance();
            if (expr.type !== TokenType.RegexStr) {
              throw this._errExpectedButGot(`REGEX`, expr);
            }
            const regexLexeme = expr.lexeme;
            const closingSlashIndex = regexLexeme.lastIndexOf("/");
            const flags = closingSlashIndex === regexLexeme.length - 1 ? void 0 : this._removeFlagsGY(regexLexeme.substring(closingSlashIndex + 1));
            let regexp;
            try {
              regexp = new RegExp(regexLexeme.substring(1, closingSlashIndex), flags);
            } catch (e) {
              throw this._errExpectedButGot(`REGEX`, expr);
            }
            return ContextKeyRegexExpr.create(key, regexp);
          }
          switch (expr.type) {
            case TokenType.RegexStr:
            case TokenType.Error: {
              const lexemeReconstruction = [expr.lexeme];
              this._advance();
              let followingToken = this._peek();
              let parenBalance = 0;
              for (let i = 0; i < expr.lexeme.length; i++) {
                if (expr.lexeme.charCodeAt(i) === CharCode.OpenParen) {
                  parenBalance++;
                } else if (expr.lexeme.charCodeAt(i) === CharCode.CloseParen) {
                  parenBalance--;
                }
              }
              while (!this._isAtEnd() && followingToken.type !== TokenType.And && followingToken.type !== TokenType.Or) {
                switch (followingToken.type) {
                  case TokenType.LParen:
                    parenBalance++;
                    break;
                  case TokenType.RParen:
                    parenBalance--;
                    break;
                  case TokenType.RegexStr:
                  case TokenType.QuotedStr:
                    for (let i = 0; i < followingToken.lexeme.length; i++) {
                      if (followingToken.lexeme.charCodeAt(i) === CharCode.OpenParen) {
                        parenBalance++;
                      } else if (expr.lexeme.charCodeAt(i) === CharCode.CloseParen) {
                        parenBalance--;
                      }
                    }
                }
                if (parenBalance < 0) {
                  break;
                }
                lexemeReconstruction.push(Scanner.getLexeme(followingToken));
                this._advance();
                followingToken = this._peek();
              }
              const regexLexeme = lexemeReconstruction.join("");
              const closingSlashIndex = regexLexeme.lastIndexOf("/");
              const flags = closingSlashIndex === regexLexeme.length - 1 ? void 0 : this._removeFlagsGY(regexLexeme.substring(closingSlashIndex + 1));
              let regexp;
              try {
                regexp = new RegExp(regexLexeme.substring(1, closingSlashIndex), flags);
              } catch (e) {
                throw this._errExpectedButGot(`REGEX`, expr);
              }
              return ContextKeyExpr.regex(key, regexp);
            }
            case TokenType.QuotedStr: {
              const serializedValue = expr.lexeme;
              this._advance();
              let regex = null;
              if (!isFalsyOrWhitespace(serializedValue)) {
                const start = serializedValue.indexOf("/");
                const end = serializedValue.lastIndexOf("/");
                if (start !== end && start >= 0) {
                  const value = serializedValue.slice(start + 1, end);
                  const caseIgnoreFlag = serializedValue[end + 1] === "i" ? "i" : "";
                  try {
                    regex = new RegExp(value, caseIgnoreFlag);
                  } catch (_e) {
                    throw this._errExpectedButGot(`REGEX`, expr);
                  }
                }
              }
              if (regex === null) {
                throw this._errExpectedButGot("REGEX", expr);
              }
              return ContextKeyRegexExpr.create(key, regex);
            }
            default:
              throw this._errExpectedButGot("REGEX", this._peek());
          }
        }
        if (this._matchOne(TokenType.Not)) {
          this._consume(TokenType.In, errorNoInAfterNot);
          const right = this._value();
          return ContextKeyExpr.notIn(key, right);
        }
        const maybeOp = this._peek().type;
        switch (maybeOp) {
          case TokenType.Eq: {
            this._advance();
            const right = this._value();
            if (this._previous().type === TokenType.QuotedStr) {
              return ContextKeyExpr.equals(key, right);
            }
            switch (right) {
              case "true":
                return ContextKeyExpr.has(key);
              case "false":
                return ContextKeyExpr.not(key);
              default:
                return ContextKeyExpr.equals(key, right);
            }
          }
          case TokenType.NotEq: {
            this._advance();
            const right = this._value();
            if (this._previous().type === TokenType.QuotedStr) {
              return ContextKeyExpr.notEquals(key, right);
            }
            switch (right) {
              case "true":
                return ContextKeyExpr.not(key);
              case "false":
                return ContextKeyExpr.has(key);
              default:
                return ContextKeyExpr.notEquals(key, right);
            }
          }
          // TODO: ContextKeyExpr.smaller(key, right) accepts only `number` as `right` AND during eval of this node, we just eval to `false` if `right` is not a number
          // consequently, package.json linter should _warn_ the user if they're passing undesired things to ops
          case TokenType.Lt:
            this._advance();
            return ContextKeySmallerExpr.create(key, this._value());
          case TokenType.LtEq:
            this._advance();
            return ContextKeySmallerEqualsExpr.create(key, this._value());
          case TokenType.Gt:
            this._advance();
            return ContextKeyGreaterExpr.create(key, this._value());
          case TokenType.GtEq:
            this._advance();
            return ContextKeyGreaterEqualsExpr.create(key, this._value());
          case TokenType.In:
            this._advance();
            return ContextKeyExpr.in(key, this._value());
          default:
            return ContextKeyExpr.has(key);
        }
      }
      case TokenType.EOF:
        this._parsingErrors.push({ message: errorUnexpectedEOF, offset: peek.offset, lexeme: "", additionalInfo: hintUnexpectedEOF });
        throw _Parser._parseError;
      default:
        throw this._errExpectedButGot(`true | false | KEY 
	| KEY '=~' REGEX 
	| KEY ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not' 'in') value`, this._peek());
    }
  }
  _value() {
    const token = this._peek();
    switch (token.type) {
      case TokenType.Str:
      case TokenType.QuotedStr:
        this._advance();
        return token.lexeme;
      case TokenType.True:
        this._advance();
        return "true";
      case TokenType.False:
        this._advance();
        return "false";
      case TokenType.In:
        this._advance();
        return "in";
      default:
        return "";
    }
  }
  _removeFlagsGY(flags) {
    return flags.replaceAll(this._flagsGYRe, "");
  }
  // careful: this can throw if current token is the initial one (ie index = 0)
  _previous() {
    return this._tokens[this._current - 1];
  }
  _matchOne(token) {
    if (this._check(token)) {
      this._advance();
      return true;
    }
    return false;
  }
  _advance() {
    if (!this._isAtEnd()) {
      this._current++;
    }
    return this._previous();
  }
  _consume(type, message) {
    if (this._check(type)) {
      return this._advance();
    }
    throw this._errExpectedButGot(message, this._peek());
  }
  _errExpectedButGot(expected, got, additionalInfo) {
    const message = localize("contextkey.parser.error.expectedButGot", "Expected: {0}\nReceived: '{1}'.", expected, Scanner.getLexeme(got));
    const offset = got.offset;
    const lexeme = Scanner.getLexeme(got);
    this._parsingErrors.push({ message, offset, lexeme, additionalInfo });
    return _Parser._parseError;
  }
  _check(type) {
    return this._peek().type === type;
  }
  _peek() {
    return this._tokens[this._current];
  }
  _isAtEnd() {
    return this._peek().type === TokenType.EOF;
  }
};
// Note: this doesn't produce an exact syntax tree but a normalized one
// ContextKeyExpression's that we use as AST nodes do not expose constructors that do not normalize
_Parser._parseError = new Error();
let Parser = _Parser;
class ContextKeyExpr {
  static false() {
    return ContextKeyFalseExpr.INSTANCE;
  }
  static true() {
    return ContextKeyTrueExpr.INSTANCE;
  }
  static has(key) {
    return ContextKeyDefinedExpr.create(key);
  }
  static equals(key, value) {
    return ContextKeyEqualsExpr.create(key, value);
  }
  static notEquals(key, value) {
    return ContextKeyNotEqualsExpr.create(key, value);
  }
  static regex(key, value) {
    return ContextKeyRegexExpr.create(key, value);
  }
  static in(key, value) {
    return ContextKeyInExpr.create(key, value);
  }
  static notIn(key, value) {
    return ContextKeyNotInExpr.create(key, value);
  }
  static not(key) {
    return ContextKeyNotExpr.create(key);
  }
  static and(...expr) {
    return ContextKeyAndExpr.create(expr, null, true);
  }
  static or(...expr) {
    return ContextKeyOrExpr.create(expr, null, true);
  }
  static greater(key, value) {
    return ContextKeyGreaterExpr.create(key, value);
  }
  static greaterEquals(key, value) {
    return ContextKeyGreaterEqualsExpr.create(key, value);
  }
  static smaller(key, value) {
    return ContextKeySmallerExpr.create(key, value);
  }
  static smallerEquals(key, value) {
    return ContextKeySmallerEqualsExpr.create(key, value);
  }
  static deserialize(serialized) {
    if (serialized === void 0 || serialized === null) {
      return void 0;
    }
    const expr = this._parser.parse(serialized);
    return expr;
  }
}
ContextKeyExpr._parser = new Parser({ regexParsingWithErrorRecovery: false });
function validateWhenClauses(whenClauses) {
  const parser = new Parser({ regexParsingWithErrorRecovery: false });
  return whenClauses.map((whenClause) => {
    parser.parse(whenClause);
    if (parser.lexingErrors.length > 0) {
      return parser.lexingErrors.map((se) => ({
        errorMessage: se.additionalInfo ? localize("contextkey.scanner.errorForLinterWithHint", "Unexpected token. Hint: {0}", se.additionalInfo) : localize("contextkey.scanner.errorForLinter", "Unexpected token."),
        offset: se.offset,
        length: se.lexeme.length
      }));
    } else if (parser.parsingErrors.length > 0) {
      return parser.parsingErrors.map((pe) => ({
        errorMessage: pe.additionalInfo ? `${pe.message}. ${pe.additionalInfo}` : pe.message,
        offset: pe.offset,
        length: pe.lexeme.length
      }));
    } else {
      return [];
    }
  });
}
function expressionsAreEqualWithConstantSubstitution(a, b) {
  const aExpr = a ? a.substituteConstants() : void 0;
  const bExpr = b ? b.substituteConstants() : void 0;
  if (!aExpr && !bExpr) {
    return true;
  }
  if (!aExpr || !bExpr) {
    return false;
  }
  return aExpr.equals(bExpr);
}
function cmp(a, b) {
  return a.cmp(b);
}
const _ContextKeyFalseExpr = class _ContextKeyFalseExpr {
  constructor() {
    this.type = 0 /* False */;
  }
  cmp(other) {
    return this.type - other.type;
  }
  equals(other) {
    return other.type === this.type;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    return false;
  }
  serialize() {
    return "false";
  }
  keys() {
    return [];
  }
  map(mapFnc) {
    return this;
  }
  negate() {
    return ContextKeyTrueExpr.INSTANCE;
  }
};
_ContextKeyFalseExpr.INSTANCE = new _ContextKeyFalseExpr();
let ContextKeyFalseExpr = _ContextKeyFalseExpr;
const _ContextKeyTrueExpr = class _ContextKeyTrueExpr {
  constructor() {
    this.type = 1 /* True */;
  }
  cmp(other) {
    return this.type - other.type;
  }
  equals(other) {
    return other.type === this.type;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    return true;
  }
  serialize() {
    return "true";
  }
  keys() {
    return [];
  }
  map(mapFnc) {
    return this;
  }
  negate() {
    return ContextKeyFalseExpr.INSTANCE;
  }
};
_ContextKeyTrueExpr.INSTANCE = new _ContextKeyTrueExpr();
let ContextKeyTrueExpr = _ContextKeyTrueExpr;
class ContextKeyDefinedExpr {
  constructor(key, negated) {
    this.key = key;
    this.negated = negated;
    this.type = 2 /* Defined */;
  }
  static create(key, negated = null) {
    const constantValue = CONSTANT_VALUES.get(key);
    if (typeof constantValue === "boolean") {
      return constantValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
    }
    return new ContextKeyDefinedExpr(key, negated);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp1(this.key, other.key);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key;
    }
    return false;
  }
  substituteConstants() {
    const constantValue = CONSTANT_VALUES.get(this.key);
    if (typeof constantValue === "boolean") {
      return constantValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
    }
    return this;
  }
  evaluate(context) {
    return !!context.getValue(this.key);
  }
  serialize() {
    return this.key;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapDefined(this.key);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyNotExpr.create(this.key, this);
    }
    return this.negated;
  }
}
class ContextKeyEqualsExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 4 /* Equals */;
  }
  static create(key, value, negated = null) {
    if (typeof value === "boolean") {
      return value ? ContextKeyDefinedExpr.create(key, negated) : ContextKeyNotExpr.create(key, negated);
    }
    const constantValue = CONSTANT_VALUES.get(key);
    if (typeof constantValue === "boolean") {
      const trueValue = constantValue ? "true" : "false";
      return value === trueValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
    }
    return new ContextKeyEqualsExpr(key, value, negated);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    const constantValue = CONSTANT_VALUES.get(this.key);
    if (typeof constantValue === "boolean") {
      const trueValue = constantValue ? "true" : "false";
      return this.value === trueValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
    }
    return this;
  }
  evaluate(context) {
    return context.getValue(this.key) == this.value;
  }
  serialize() {
    return `${this.key} == '${this.value}'`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapEquals(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyNotEqualsExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeyInExpr {
  constructor(key, valueKey) {
    this.key = key;
    this.valueKey = valueKey;
    this.type = 10 /* In */;
    this.negated = null;
  }
  static create(key, valueKey) {
    return new ContextKeyInExpr(key, valueKey);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.valueKey, other.key, other.valueKey);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.valueKey === other.valueKey;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    const source = context.getValue(this.valueKey);
    const item = context.getValue(this.key);
    if (Array.isArray(source)) {
      if (source.includes(item)) {
        return true;
      }
      if (isWindows && typeof item === "string" && item.startsWith("file:///")) {
        const itemLower = item.toLowerCase();
        return source.some((s) => typeof s === "string" && s.toLowerCase() === itemLower);
      }
      return false;
    }
    if (typeof item === "string" && typeof source === "object" && source !== null) {
      if (hasOwnProperty.call(source, item)) {
        return true;
      }
      if (isWindows && item.startsWith("file:///")) {
        const itemLower = item.toLowerCase();
        return Object.keys(source).some((key) => key.toLowerCase() === itemLower);
      }
      return false;
    }
    return false;
  }
  serialize() {
    return `${this.key} in '${this.valueKey}'`;
  }
  keys() {
    return [this.key, this.valueKey];
  }
  map(mapFnc) {
    return mapFnc.mapIn(this.key, this.valueKey);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyNotInExpr.create(this.key, this.valueKey);
    }
    return this.negated;
  }
}
class ContextKeyNotInExpr {
  constructor(key, valueKey) {
    this.key = key;
    this.valueKey = valueKey;
    this.type = 11 /* NotIn */;
    this._negated = ContextKeyInExpr.create(key, valueKey);
  }
  static create(key, valueKey) {
    return new ContextKeyNotInExpr(key, valueKey);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return this._negated.cmp(other._negated);
  }
  equals(other) {
    if (other.type === this.type) {
      return this._negated.equals(other._negated);
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    return !this._negated.evaluate(context);
  }
  serialize() {
    return `${this.key} not in '${this.valueKey}'`;
  }
  keys() {
    return this._negated.keys();
  }
  map(mapFnc) {
    return mapFnc.mapNotIn(this.key, this.valueKey);
  }
  negate() {
    return this._negated;
  }
}
class ContextKeyNotEqualsExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 5 /* NotEquals */;
  }
  static create(key, value, negated = null) {
    if (typeof value === "boolean") {
      if (value) {
        return ContextKeyNotExpr.create(key, negated);
      }
      return ContextKeyDefinedExpr.create(key, negated);
    }
    const constantValue = CONSTANT_VALUES.get(key);
    if (typeof constantValue === "boolean") {
      const falseValue = constantValue ? "true" : "false";
      return value === falseValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE;
    }
    return new ContextKeyNotEqualsExpr(key, value, negated);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    const constantValue = CONSTANT_VALUES.get(this.key);
    if (typeof constantValue === "boolean") {
      const falseValue = constantValue ? "true" : "false";
      return this.value === falseValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE;
    }
    return this;
  }
  evaluate(context) {
    return context.getValue(this.key) != this.value;
  }
  serialize() {
    return `${this.key} != '${this.value}'`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapNotEquals(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyEqualsExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeyNotExpr {
  constructor(key, negated) {
    this.key = key;
    this.negated = negated;
    this.type = 3 /* Not */;
  }
  static create(key, negated = null) {
    const constantValue = CONSTANT_VALUES.get(key);
    if (typeof constantValue === "boolean") {
      return constantValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE;
    }
    return new ContextKeyNotExpr(key, negated);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp1(this.key, other.key);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key;
    }
    return false;
  }
  substituteConstants() {
    const constantValue = CONSTANT_VALUES.get(this.key);
    if (typeof constantValue === "boolean") {
      return constantValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE;
    }
    return this;
  }
  evaluate(context) {
    return !context.getValue(this.key);
  }
  serialize() {
    return `!${this.key}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapNot(this.key);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyDefinedExpr.create(this.key, this);
    }
    return this.negated;
  }
}
function withFloatOrStr(value, callback) {
  if (typeof value === "string") {
    const n = parseFloat(value);
    if (!isNaN(n)) {
      value = n;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    return callback(value);
  }
  return ContextKeyFalseExpr.INSTANCE;
}
class ContextKeyGreaterExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 12 /* Greater */;
  }
  static create(key, _value, negated = null) {
    return withFloatOrStr(_value, (value) => new ContextKeyGreaterExpr(key, value, negated));
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    if (typeof this.value === "string") {
      return false;
    }
    return parseFloat(context.getValue(this.key)) > this.value;
  }
  serialize() {
    return `${this.key} > ${this.value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapGreater(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeySmallerEqualsExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeyGreaterEqualsExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 13 /* GreaterEquals */;
  }
  static create(key, _value, negated = null) {
    return withFloatOrStr(_value, (value) => new ContextKeyGreaterEqualsExpr(key, value, negated));
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    if (typeof this.value === "string") {
      return false;
    }
    return parseFloat(context.getValue(this.key)) >= this.value;
  }
  serialize() {
    return `${this.key} >= ${this.value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapGreaterEquals(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeySmallerExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeySmallerExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 14 /* Smaller */;
  }
  static create(key, _value, negated = null) {
    return withFloatOrStr(_value, (value) => new ContextKeySmallerExpr(key, value, negated));
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    if (typeof this.value === "string") {
      return false;
    }
    return parseFloat(context.getValue(this.key)) < this.value;
  }
  serialize() {
    return `${this.key} < ${this.value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapSmaller(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyGreaterEqualsExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeySmallerEqualsExpr {
  constructor(key, value, negated) {
    this.key = key;
    this.value = value;
    this.negated = negated;
    this.type = 15 /* SmallerEquals */;
  }
  static create(key, _value, negated = null) {
    return withFloatOrStr(_value, (value) => new ContextKeySmallerEqualsExpr(key, value, negated));
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return cmp2(this.key, this.value, other.key, other.value);
  }
  equals(other) {
    if (other.type === this.type) {
      return this.key === other.key && this.value === other.value;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    if (typeof this.value === "string") {
      return false;
    }
    return parseFloat(context.getValue(this.key)) <= this.value;
  }
  serialize() {
    return `${this.key} <= ${this.value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapSmallerEquals(this.key, this.value);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyGreaterExpr.create(this.key, this.value, this);
    }
    return this.negated;
  }
}
class ContextKeyRegexExpr {
  constructor(key, regexp) {
    this.key = key;
    this.regexp = regexp;
    this.type = 7 /* Regex */;
    this.negated = null;
  }
  static create(key, regexp) {
    return new ContextKeyRegexExpr(key, regexp);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    if (this.key < other.key) {
      return -1;
    }
    if (this.key > other.key) {
      return 1;
    }
    const thisSource = this.regexp ? this.regexp.source : "";
    const otherSource = other.regexp ? other.regexp.source : "";
    if (thisSource < otherSource) {
      return -1;
    }
    if (thisSource > otherSource) {
      return 1;
    }
    return 0;
  }
  equals(other) {
    if (other.type === this.type) {
      const thisSource = this.regexp ? this.regexp.source : "";
      const otherSource = other.regexp ? other.regexp.source : "";
      return this.key === other.key && thisSource === otherSource;
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    const value = context.getValue(this.key);
    return this.regexp ? this.regexp.test(value) : false;
  }
  serialize() {
    const value = this.regexp ? `/${this.regexp.source}/${this.regexp.flags}` : "/invalid/";
    return `${this.key} =~ ${value}`;
  }
  keys() {
    return [this.key];
  }
  map(mapFnc) {
    return mapFnc.mapRegex(this.key, this.regexp);
  }
  negate() {
    if (!this.negated) {
      this.negated = ContextKeyNotRegexExpr.create(this);
    }
    return this.negated;
  }
}
class ContextKeyNotRegexExpr {
  constructor(_actual) {
    this._actual = _actual;
    this.type = 8 /* NotRegex */;
  }
  static create(actual) {
    return new ContextKeyNotRegexExpr(actual);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    return this._actual.cmp(other._actual);
  }
  equals(other) {
    if (other.type === this.type) {
      return this._actual.equals(other._actual);
    }
    return false;
  }
  substituteConstants() {
    return this;
  }
  evaluate(context) {
    return !this._actual.evaluate(context);
  }
  serialize() {
    return `!(${this._actual.serialize()})`;
  }
  keys() {
    return this._actual.keys();
  }
  map(mapFnc) {
    return new ContextKeyNotRegexExpr(this._actual.map(mapFnc));
  }
  negate() {
    return this._actual;
  }
}
function eliminateConstantsInArray(arr) {
  let newArr = null;
  for (let i = 0, len = arr.length; i < len; i++) {
    const newExpr = arr[i].substituteConstants();
    if (arr[i] !== newExpr) {
      if (newArr === null) {
        newArr = [];
        for (let j = 0; j < i; j++) {
          newArr[j] = arr[j];
        }
      }
    }
    if (newArr !== null) {
      newArr[i] = newExpr;
    }
  }
  if (newArr === null) {
    return arr;
  }
  return newArr;
}
class ContextKeyAndExpr {
  constructor(expr, negated) {
    this.expr = expr;
    this.negated = negated;
    this.type = 6 /* And */;
  }
  static create(_expr, negated, extraRedundantCheck) {
    return ContextKeyAndExpr._normalizeArr(_expr, negated, extraRedundantCheck);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    if (this.expr.length < other.expr.length) {
      return -1;
    }
    if (this.expr.length > other.expr.length) {
      return 1;
    }
    for (let i = 0, len = this.expr.length; i < len; i++) {
      const r = cmp(this.expr[i], other.expr[i]);
      if (r !== 0) {
        return r;
      }
    }
    return 0;
  }
  equals(other) {
    if (other.type === this.type) {
      if (this.expr.length !== other.expr.length) {
        return false;
      }
      for (let i = 0, len = this.expr.length; i < len; i++) {
        if (!this.expr[i].equals(other.expr[i])) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  substituteConstants() {
    const exprArr = eliminateConstantsInArray(this.expr);
    if (exprArr === this.expr) {
      return this;
    }
    return ContextKeyAndExpr.create(exprArr, this.negated, false);
  }
  evaluate(context) {
    for (let i = 0, len = this.expr.length; i < len; i++) {
      if (!this.expr[i].evaluate(context)) {
        return false;
      }
    }
    return true;
  }
  static _normalizeArr(arr, negated, extraRedundantCheck) {
    const expr = [];
    let hasTrue = false;
    for (const e of arr) {
      if (!e) {
        continue;
      }
      if (e.type === 1 /* True */) {
        hasTrue = true;
        continue;
      }
      if (e.type === 0 /* False */) {
        return ContextKeyFalseExpr.INSTANCE;
      }
      if (e.type === 6 /* And */) {
        expr.push(...e.expr);
        continue;
      }
      expr.push(e);
    }
    if (expr.length === 0 && hasTrue) {
      return ContextKeyTrueExpr.INSTANCE;
    }
    if (expr.length === 0) {
      return void 0;
    }
    if (expr.length === 1) {
      return expr[0];
    }
    expr.sort(cmp);
    for (let i = 1; i < expr.length; i++) {
      if (expr[i - 1].equals(expr[i])) {
        expr.splice(i, 1);
        i--;
      }
    }
    if (expr.length === 1) {
      return expr[0];
    }
    while (expr.length > 1) {
      const lastElement = expr[expr.length - 1];
      if (lastElement.type !== 9 /* Or */) {
        break;
      }
      expr.pop();
      const secondToLastElement = expr.pop();
      const isFinished = expr.length === 0;
      const resultElement = ContextKeyOrExpr.create(
        lastElement.expr.map((el) => ContextKeyAndExpr.create([el, secondToLastElement], null, extraRedundantCheck)),
        null,
        isFinished
      );
      if (resultElement) {
        expr.push(resultElement);
        expr.sort(cmp);
      }
    }
    if (expr.length === 1) {
      return expr[0];
    }
    if (extraRedundantCheck) {
      for (let i = 0; i < expr.length; i++) {
        for (let j = i + 1; j < expr.length; j++) {
          if (expr[i].negate().equals(expr[j])) {
            return ContextKeyFalseExpr.INSTANCE;
          }
        }
      }
      if (expr.length === 1) {
        return expr[0];
      }
    }
    return new ContextKeyAndExpr(expr, negated);
  }
  serialize() {
    return this.expr.map((e) => e.serialize()).join(" && ");
  }
  keys() {
    const result = [];
    for (const expr of this.expr) {
      result.push(...expr.keys());
    }
    return result;
  }
  map(mapFnc) {
    return new ContextKeyAndExpr(this.expr.map((expr) => expr.map(mapFnc)), null);
  }
  negate() {
    if (!this.negated) {
      const result = [];
      for (const expr of this.expr) {
        result.push(expr.negate());
      }
      this.negated = ContextKeyOrExpr.create(result, this, true);
    }
    return this.negated;
  }
}
class ContextKeyOrExpr {
  constructor(expr, negated) {
    this.expr = expr;
    this.negated = negated;
    this.type = 9 /* Or */;
  }
  static create(_expr, negated, extraRedundantCheck) {
    return ContextKeyOrExpr._normalizeArr(_expr, negated, extraRedundantCheck);
  }
  cmp(other) {
    if (other.type !== this.type) {
      return this.type - other.type;
    }
    if (this.expr.length < other.expr.length) {
      return -1;
    }
    if (this.expr.length > other.expr.length) {
      return 1;
    }
    for (let i = 0, len = this.expr.length; i < len; i++) {
      const r = cmp(this.expr[i], other.expr[i]);
      if (r !== 0) {
        return r;
      }
    }
    return 0;
  }
  equals(other) {
    if (other.type === this.type) {
      if (this.expr.length !== other.expr.length) {
        return false;
      }
      for (let i = 0, len = this.expr.length; i < len; i++) {
        if (!this.expr[i].equals(other.expr[i])) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  substituteConstants() {
    const exprArr = eliminateConstantsInArray(this.expr);
    if (exprArr === this.expr) {
      return this;
    }
    return ContextKeyOrExpr.create(exprArr, this.negated, false);
  }
  evaluate(context) {
    for (let i = 0, len = this.expr.length; i < len; i++) {
      if (this.expr[i].evaluate(context)) {
        return true;
      }
    }
    return false;
  }
  static _normalizeArr(arr, negated, extraRedundantCheck) {
    let expr = [];
    let hasFalse = false;
    if (arr) {
      for (let i = 0, len = arr.length; i < len; i++) {
        const e = arr[i];
        if (!e) {
          continue;
        }
        if (e.type === 0 /* False */) {
          hasFalse = true;
          continue;
        }
        if (e.type === 1 /* True */) {
          return ContextKeyTrueExpr.INSTANCE;
        }
        if (e.type === 9 /* Or */) {
          expr = expr.concat(e.expr);
          continue;
        }
        expr.push(e);
      }
      if (expr.length === 0 && hasFalse) {
        return ContextKeyFalseExpr.INSTANCE;
      }
      expr.sort(cmp);
    }
    if (expr.length === 0) {
      return void 0;
    }
    if (expr.length === 1) {
      return expr[0];
    }
    for (let i = 1; i < expr.length; i++) {
      if (expr[i - 1].equals(expr[i])) {
        expr.splice(i, 1);
        i--;
      }
    }
    if (expr.length === 1) {
      return expr[0];
    }
    if (extraRedundantCheck) {
      for (let i = 0; i < expr.length; i++) {
        for (let j = i + 1; j < expr.length; j++) {
          if (expr[i].negate().equals(expr[j])) {
            return ContextKeyTrueExpr.INSTANCE;
          }
        }
      }
      if (expr.length === 1) {
        return expr[0];
      }
    }
    return new ContextKeyOrExpr(expr, negated);
  }
  serialize() {
    return this.expr.map((e) => e.serialize()).join(" || ");
  }
  keys() {
    const result = [];
    for (const expr of this.expr) {
      result.push(...expr.keys());
    }
    return result;
  }
  map(mapFnc) {
    return new ContextKeyOrExpr(this.expr.map((expr) => expr.map(mapFnc)), null);
  }
  negate() {
    if (!this.negated) {
      const result = [];
      for (const expr of this.expr) {
        result.push(expr.negate());
      }
      while (result.length > 1) {
        const LEFT = result.shift();
        const RIGHT = result.shift();
        const all = [];
        for (const left of getTerminals(LEFT)) {
          for (const right of getTerminals(RIGHT)) {
            all.push(ContextKeyAndExpr.create([left, right], null, false));
          }
        }
        result.unshift(ContextKeyOrExpr.create(all, null, false));
      }
      this.negated = ContextKeyOrExpr.create(result, this, true);
    }
    return this.negated;
  }
}
const _RawContextKey = class _RawContextKey extends ContextKeyDefinedExpr {
  static all() {
    return _RawContextKey._info.values();
  }
  constructor(key, defaultValue, metaOrHide) {
    super(key, null);
    this._defaultValue = defaultValue;
    if (typeof metaOrHide === "object") {
      _RawContextKey._info.push({ ...metaOrHide, key });
    } else if (metaOrHide !== true) {
      _RawContextKey._info.push({ key, description: metaOrHide, type: defaultValue !== null && defaultValue !== void 0 ? typeof defaultValue : void 0 });
    }
  }
  bindTo(target) {
    return target.createKey(this.key, this._defaultValue);
  }
  getValue(target) {
    return target.getContextKeyValue(this.key);
  }
  toNegated() {
    return this.negate();
  }
  isEqualTo(value) {
    return ContextKeyEqualsExpr.create(this.key, value);
  }
  notEqualsTo(value) {
    return ContextKeyNotEqualsExpr.create(this.key, value);
  }
  greater(value) {
    return ContextKeyGreaterExpr.create(this.key, value);
  }
};
_RawContextKey._info = [];
let RawContextKey = _RawContextKey;
const IContextKeyService = createDecorator("contextKeyService");
function cmp1(key1, key2) {
  if (key1 < key2) {
    return -1;
  }
  if (key1 > key2) {
    return 1;
  }
  return 0;
}
function cmp2(key1, value1, key2, value2) {
  if (key1 < key2) {
    return -1;
  }
  if (key1 > key2) {
    return 1;
  }
  if (value1 < value2) {
    return -1;
  }
  if (value1 > value2) {
    return 1;
  }
  return 0;
}
function implies(p, q) {
  if (p.type === 0 /* False */ || q.type === 1 /* True */) {
    return true;
  }
  if (p.type === 9 /* Or */) {
    if (q.type === 9 /* Or */) {
      return allElementsIncluded(p.expr, q.expr);
    }
    return false;
  }
  if (q.type === 9 /* Or */) {
    for (const element of q.expr) {
      if (implies(p, element)) {
        return true;
      }
    }
    return false;
  }
  if (p.type === 6 /* And */) {
    if (q.type === 6 /* And */) {
      return allElementsIncluded(q.expr, p.expr);
    }
    for (const element of p.expr) {
      if (implies(element, q)) {
        return true;
      }
    }
    return false;
  }
  return p.equals(q);
}
function allElementsIncluded(p, q) {
  let pIndex = 0;
  let qIndex = 0;
  while (pIndex < p.length && qIndex < q.length) {
    const cmp3 = p[pIndex].cmp(q[qIndex]);
    if (cmp3 < 0) {
      return false;
    } else if (cmp3 === 0) {
      pIndex++;
      qIndex++;
    } else {
      qIndex++;
    }
  }
  return pIndex === p.length;
}
function getTerminals(node) {
  if (node.type === 9 /* Or */) {
    return node.expr;
  }
  return [node];
}
export {
  ContextKeyAndExpr,
  ContextKeyDefinedExpr,
  ContextKeyEqualsExpr,
  ContextKeyExpr,
  ContextKeyExprType,
  ContextKeyFalseExpr,
  ContextKeyGreaterEqualsExpr,
  ContextKeyGreaterExpr,
  ContextKeyInExpr,
  ContextKeyNotEqualsExpr,
  ContextKeyNotExpr,
  ContextKeyNotInExpr,
  ContextKeyNotRegexExpr,
  ContextKeyOrExpr,
  ContextKeyRegexExpr,
  ContextKeySmallerEqualsExpr,
  ContextKeySmallerExpr,
  ContextKeyTrueExpr,
  IContextKeyService,
  Parser,
  RawContextKey,
  expressionsAreEqualWithConstantSubstitution,
  implies,
  setConstant,
  validateWhenClauses
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29udGV4dGtleVxcY29tbW9uXFxjb250ZXh0a2V5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzQ2hyb21lLCBpc0VkZ2UsIGlzRmlyZWZveCwgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzU2FmYXJpLCBpc1dlYiwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgU2Nhbm5lciwgTGV4aW5nRXJyb3IsIFRva2VuLCBUb2tlblR5cGUgfSBmcm9tICcuL3NjYW5uZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpbGxlZ2FsQXJndW1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5jb25zdCBDT05TVEFOVF9WQUxVRVMgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcbkNPTlNUQU5UX1ZBTFVFUy5zZXQoJ2ZhbHNlJywgZmFsc2UpO1xuQ09OU1RBTlRfVkFMVUVTLnNldCgndHJ1ZScsIHRydWUpO1xuQ09OU1RBTlRfVkFMVUVTLnNldCgnaXNNYWMnLCBpc01hY2ludG9zaCk7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCdpc0xpbnV4JywgaXNMaW51eCk7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCdpc1dpbmRvd3MnLCBpc1dpbmRvd3MpO1xuQ09OU1RBTlRfVkFMVUVTLnNldCgnaXNXZWInLCBpc1dlYik7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCdpc01hY05hdGl2ZScsIGlzTWFjaW50b3NoICYmICFpc1dlYik7XG5DT05TVEFOVF9WQUxVRVMuc2V0KCdpc0VkZ2UnLCBpc0VkZ2UpO1xuQ09OU1RBTlRfVkFMVUVTLnNldCgnaXNGaXJlZm94JywgaXNGaXJlZm94KTtcbkNPTlNUQU5UX1ZBTFVFUy5zZXQoJ2lzQ2hyb21lJywgaXNDaHJvbWUpO1xuQ09OU1RBTlRfVkFMVUVTLnNldCgnaXNTYWZhcmknLCBpc1NhZmFyaSk7XG5cbi8qKiBhbGxvdyByZWdpc3RlciBjb25zdGFudCBjb250ZXh0IGtleXMgdGhhdCBhcmUga25vd24gb25seSBhZnRlciBzdGFydHVwOyByZXF1aXJlcyBydW5uaW5nIGBzdWJzdGl0dXRlQ29uc3RhbnRzYCBvbiB0aGUgY29udGV4dCBrZXkgLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTc0MjE4I2lzc3VlY29tbWVudC0xNDM3OTcyMTI3ICovXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29uc3RhbnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKSB7XG5cdGlmIChDT05TVEFOVF9WQUxVRVMuZ2V0KGtleSkgIT09IHVuZGVmaW5lZCkgeyB0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2NvbnRleHRrZXkuc2V0Q29uc3RhbnQoaywgdikgaW52b2tlZCB3aXRoIGFscmVhZHkgc2V0IGNvbnN0YW50IGBrYCcpOyB9XG5cblx0Q09OU1RBTlRfVkFMVUVTLnNldChrZXksIHZhbHVlKTtcbn1cblxuY29uc3QgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG5leHBvcnQgY29uc3QgZW51bSBDb250ZXh0S2V5RXhwclR5cGUge1xuXHRGYWxzZSA9IDAsXG5cdFRydWUgPSAxLFxuXHREZWZpbmVkID0gMixcblx0Tm90ID0gMyxcblx0RXF1YWxzID0gNCxcblx0Tm90RXF1YWxzID0gNSxcblx0QW5kID0gNixcblx0UmVnZXggPSA3LFxuXHROb3RSZWdleCA9IDgsXG5cdE9yID0gOSxcblx0SW4gPSAxMCxcblx0Tm90SW4gPSAxMSxcblx0R3JlYXRlciA9IDEyLFxuXHRHcmVhdGVyRXF1YWxzID0gMTMsXG5cdFNtYWxsZXIgPSAxNCxcblx0U21hbGxlckVxdWFscyA9IDE1LFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZXh0S2V5RXhwck1hcHBlciB7XG5cdG1hcERlZmluZWQoa2V5OiBzdHJpbmcpOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblx0bWFwTm90KGtleTogc3RyaW5nKTogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdG1hcEVxdWFscyhrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRtYXBOb3RFcXVhbHMoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblx0bWFwR3JlYXRlcihrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRtYXBHcmVhdGVyRXF1YWxzKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdG1hcFNtYWxsZXIoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblx0bWFwU21hbGxlckVxdWFscyhrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRtYXBSZWdleChrZXk6IHN0cmluZywgcmVnZXhwOiBSZWdFeHAgfCBudWxsKTogQ29udGV4dEtleVJlZ2V4RXhwcjtcblx0bWFwSW4oa2V5OiBzdHJpbmcsIHZhbHVlS2V5OiBzdHJpbmcpOiBDb250ZXh0S2V5SW5FeHByO1xuXHRtYXBOb3RJbihrZXk6IHN0cmluZywgdmFsdWVLZXk6IHN0cmluZyk6IENvbnRleHRLZXlOb3RJbkV4cHI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0Y21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlcjtcblx0ZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW47XG5cdHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cdGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbjtcblx0c2VyaWFsaXplKCk6IHN0cmluZztcblx0a2V5cygpOiBzdHJpbmdbXTtcblx0bWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblxufVxuXG5leHBvcnQgdHlwZSBDb250ZXh0S2V5RXhwcmVzc2lvbiA9IChcblx0Q29udGV4dEtleUZhbHNlRXhwciB8IENvbnRleHRLZXlUcnVlRXhwciB8IENvbnRleHRLZXlEZWZpbmVkRXhwciB8IENvbnRleHRLZXlOb3RFeHByXG5cdHwgQ29udGV4dEtleUVxdWFsc0V4cHIgfCBDb250ZXh0S2V5Tm90RXF1YWxzRXhwciB8IENvbnRleHRLZXlSZWdleEV4cHJcblx0fCBDb250ZXh0S2V5Tm90UmVnZXhFeHByIHwgQ29udGV4dEtleUFuZEV4cHIgfCBDb250ZXh0S2V5T3JFeHByIHwgQ29udGV4dEtleUluRXhwclxuXHR8IENvbnRleHRLZXlOb3RJbkV4cHIgfCBDb250ZXh0S2V5R3JlYXRlckV4cHIgfCBDb250ZXh0S2V5R3JlYXRlckVxdWFsc0V4cHJcblx0fCBDb250ZXh0S2V5U21hbGxlckV4cHIgfCBDb250ZXh0S2V5U21hbGxlckVxdWFsc0V4cHJcbik7XG5cblxuLypcblxuU3ludGF4IGdyYW1tYXI6XG5cbmBgYGVibmZcblxuZXhwcmVzc2lvbiA6Oj0gb3Jcblxub3IgOjo9IGFuZCB7ICd8fCcgYW5kIH0qXG5cbmFuZCA6Oj0gdGVybSB7ICcmJicgdGVybSB9KlxuXG50ZXJtIDo6PVxuXHR8ICchJyAoS0VZIHwgdHJ1ZSB8IGZhbHNlIHwgcGFyZW50aGVzaXplZClcblx0fCBwcmltYXJ5XG5cbnByaW1hcnkgOjo9XG5cdHwgJ3RydWUnXG5cdHwgJ2ZhbHNlJ1xuXHR8IHBhcmVudGhlc2l6ZWRcblx0fCBLRVkgJz1+JyBSRUdFWFxuXHR8IEtFWSBbICgnPT0nIHwgJyE9JyB8ICc8JyB8ICc8PScgfCAnPicgfCAnPj0nIHwgJ25vdCcgJ2luJyB8ICdpbicpIHZhbHVlIF1cblxucGFyZW50aGVzaXplZCA6Oj1cblx0fCAnKCcgZXhwcmVzc2lvbiAnKSdcblxudmFsdWUgOjo9XG5cdHwgJ3RydWUnXG5cdHwgJ2ZhbHNlJ1xuXHR8ICdpbicgICAgICBcdC8vIHdlIHN1cHBvcnQgYGluYCBhcyBhIHZhbHVlIGJlY2F1c2UgdGhlcmUncyBhbiBleHRlbnNpb24gdGhhdCB1c2VzIGl0LCBpZSBcIndoZW5cIjogXCJsYW5ndWFnZUlkID09IGluXCJcblx0fCBWQUxVRSBcdFx0Ly8gbWF0Y2hlZCBieSB0aGUgc2FtZSByZWdleCBhcyBLRVk7IGNvbnNpZGVyIHB1dHRpbmcgdGhlIHZhbHVlIGluIHNpbmdsZSBxdW90ZXMgaWYgaXQncyBhIHN0cmluZyAoZS5nLiwgd2l0aCBzcGFjZXMpXG5cdHwgU0lOR0xFX1FVT1RFRF9TVFJcblx0fCBFTVBUWV9TVFIgIFx0Ly8gdGhpcyBhbGxvd3MgXCJ3aGVuXCI6IFwiZm9vID09IFwiIHdoaWNoJ3MgdXNlZCBieSBleGlzdGluZyBleHRlbnNpb25zXG5cbmBgYFxuKi9cblxuZXhwb3J0IHR5cGUgUGFyc2VyQ29uZmlnID0ge1xuXHQvKipcblx0ICogd2l0aCB0aGlzIG9wdGlvbiBlbmFibGVkLCB0aGUgcGFyc2VyIGNhbiByZWNvdmVyIGZyb20gcmVnZXggcGFyc2luZyBlcnJvcnMsIGUuZy4sIHVuZXNjYXBlZCBzbGFzaGVzOiBgL3NyYy8vYCBpcyBhY2NlcHRlZCBhcyBgL3NyY1xcLy9gIHdvdWxkIGJlXG5cdCAqL1xuXHRyZWdleFBhcnNpbmdXaXRoRXJyb3JSZWNvdmVyeTogYm9vbGVhbjtcbn07XG5cbmNvbnN0IGRlZmF1bHRDb25maWc6IFBhcnNlckNvbmZpZyA9IHtcblx0cmVnZXhQYXJzaW5nV2l0aEVycm9yUmVjb3Zlcnk6IHRydWVcbn07XG5cbmV4cG9ydCB0eXBlIFBhcnNpbmdFcnJvciA9IHtcblx0bWVzc2FnZTogc3RyaW5nO1xuXHRvZmZzZXQ6IG51bWJlcjtcblx0bGV4ZW1lOiBzdHJpbmc7XG5cdGFkZGl0aW9uYWxJbmZvPzogc3RyaW5nO1xufTtcblxuY29uc3QgZXJyb3JFbXB0eVN0cmluZyA9IGxvY2FsaXplKCdjb250ZXh0a2V5LnBhcnNlci5lcnJvci5lbXB0eVN0cmluZycsIFwiRW1wdHkgY29udGV4dCBrZXkgZXhwcmVzc2lvblwiKTtcbmNvbnN0IGhpbnRFbXB0eVN0cmluZyA9IGxvY2FsaXplKCdjb250ZXh0a2V5LnBhcnNlci5lcnJvci5lbXB0eVN0cmluZy5oaW50JywgXCJEaWQgeW91IGZvcmdldCB0byB3cml0ZSBhbiBleHByZXNzaW9uPyBZb3UgY2FuIGFsc28gcHV0ICdmYWxzZScgb3IgJ3RydWUnIHRvIGFsd2F5cyBldmFsdWF0ZSB0byBmYWxzZSBvciB0cnVlLCByZXNwZWN0aXZlbHkuXCIpO1xuY29uc3QgZXJyb3JOb0luQWZ0ZXJOb3QgPSBsb2NhbGl6ZSgnY29udGV4dGtleS5wYXJzZXIuZXJyb3Iubm9JbkFmdGVyTm90JywgXCInaW4nIGFmdGVyICdub3QnLlwiKTtcbmNvbnN0IGVycm9yQ2xvc2luZ1BhcmVudGhlc2lzID0gbG9jYWxpemUoJ2NvbnRleHRrZXkucGFyc2VyLmVycm9yLmNsb3NpbmdQYXJlbnRoZXNpcycsIFwiY2xvc2luZyBwYXJlbnRoZXNpcyAnKSdcIik7XG5jb25zdCBlcnJvclVuZXhwZWN0ZWRUb2tlbiA9IGxvY2FsaXplKCdjb250ZXh0a2V5LnBhcnNlci5lcnJvci51bmV4cGVjdGVkVG9rZW4nLCBcIlVuZXhwZWN0ZWQgdG9rZW5cIik7XG5jb25zdCBoaW50VW5leHBlY3RlZFRva2VuID0gbG9jYWxpemUoJ2NvbnRleHRrZXkucGFyc2VyLmVycm9yLnVuZXhwZWN0ZWRUb2tlbi5oaW50JywgXCJEaWQgeW91IGZvcmdldCB0byBwdXQgJiYgb3IgfHwgYmVmb3JlIHRoZSB0b2tlbj9cIik7XG5jb25zdCBlcnJvclVuZXhwZWN0ZWRFT0YgPSBsb2NhbGl6ZSgnY29udGV4dGtleS5wYXJzZXIuZXJyb3IudW5leHBlY3RlZEVPRicsIFwiVW5leHBlY3RlZCBlbmQgb2YgZXhwcmVzc2lvblwiKTtcbmNvbnN0IGhpbnRVbmV4cGVjdGVkRU9GID0gbG9jYWxpemUoJ2NvbnRleHRrZXkucGFyc2VyLmVycm9yLnVuZXhwZWN0ZWRFT0YuaGludCcsIFwiRGlkIHlvdSBmb3JnZXQgdG8gcHV0IGEgY29udGV4dCBrZXk/XCIpO1xuXG4vKipcbiAqIEEgcGFyc2VyIGZvciBjb250ZXh0IGtleSBleHByZXNzaW9ucy5cbiAqXG4gKiBFeGFtcGxlOlxuICogYGBgdHNcbiAqIGNvbnN0IHBhcnNlciA9IG5ldyBQYXJzZXIoKTtcbiAqIGNvbnN0IGV4cHIgPSBwYXJzZXIucGFyc2UoJ2ZvbyA9PSBcImJhclwiICYmIGJheiA9PSB0cnVlJyk7XG4gKlxuICogaWYgKGV4cHIgPT09IHVuZGVmaW5lZCkge1xuICogXHQvLyB0aGVyZSB3ZXJlIGxleGluZyBvciBwYXJzaW5nIGVycm9yc1xuICogXHQvLyBwcm9jZXNzIGxleGluZyBlcnJvcnMgd2l0aCBgcGFyc2VyLmxleGluZ0Vycm9yc2BcbiAqICAvLyBwcm9jZXNzIHBhcnNpbmcgZXJyb3JzIHdpdGggYHBhcnNlci5wYXJzaW5nRXJyb3JzYFxuICogfSBlbHNlIHtcbiAqIFx0Ly8gZXhwciBpcyBhIHZhbGlkIGV4cHJlc3Npb25cbiAqIH1cbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgUGFyc2VyIHtcblx0Ly8gTm90ZTogdGhpcyBkb2Vzbid0IHByb2R1Y2UgYW4gZXhhY3Qgc3ludGF4IHRyZWUgYnV0IGEgbm9ybWFsaXplZCBvbmVcblx0Ly8gQ29udGV4dEtleUV4cHJlc3Npb24ncyB0aGF0IHdlIHVzZSBhcyBBU1Qgbm9kZXMgZG8gbm90IGV4cG9zZSBjb25zdHJ1Y3RvcnMgdGhhdCBkbyBub3Qgbm9ybWFsaXplXG5cblx0cHJpdmF0ZSBzdGF0aWMgX3BhcnNlRXJyb3IgPSBuZXcgRXJyb3IoKTtcblxuXHQvLyBsaWZldGltZSBub3RlOiBgX3NjYW5uZXJgIGxpdmVzIGFzIGxvbmcgYXMgdGhlIHBhcnNlciBkb2VzLCBpLmUuLCBpcyBub3QgcmVzZXQgYmV0d2VlbiBjYWxscyB0byBgcGFyc2VgXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjYW5uZXIgPSBuZXcgU2Nhbm5lcigpO1xuXG5cdC8vIGxpZmV0aW1lIG5vdGU6IGBfdG9rZW5zYCwgYF9jdXJyZW50YCwgYW5kIGBfcGFyc2luZ0Vycm9yc2AgbXVzdCBiZSByZXNldCBiZXR3ZWVuIGNhbGxzIHRvIGBwYXJzZWBcblx0cHJpdmF0ZSBfdG9rZW5zOiBUb2tlbltdID0gW107XG5cdHByaXZhdGUgX2N1cnJlbnQgPSAwOyBcdFx0XHRcdFx0Ly8gaW52YXJpYW50OiAwIDw9IHRoaXMuX2N1cnJlbnQgPCB0aGlzLl90b2tlbnMubGVuZ3RoIDsgYW55IGluY3JlbWVudGF0aW9uIG9mIHRoaXMgdmFsdWUgbXVzdCBmaXJzdCBjYWxsIGBfaXNBdEVuZGBcblx0cHJpdmF0ZSBfcGFyc2luZ0Vycm9yczogUGFyc2luZ0Vycm9yW10gPSBbXTtcblxuXHRnZXQgbGV4aW5nRXJyb3JzKCk6IFJlYWRvbmx5PExleGluZ0Vycm9yW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2Nhbm5lci5lcnJvcnM7XG5cdH1cblxuXHRnZXQgcGFyc2luZ0Vycm9ycygpOiBSZWFkb25seTxQYXJzaW5nRXJyb3JbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9wYXJzaW5nRXJyb3JzO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfY29uZmlnOiBQYXJzZXJDb25maWcgPSBkZWZhdWx0Q29uZmlnKSB7XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2UgYSBjb250ZXh0IGtleSBleHByZXNzaW9uLlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5wdXQgdGhlIGV4cHJlc3Npb24gdG8gcGFyc2Vcblx0ICogQHJldHVybnMgdGhlIHBhcnNlZCBleHByZXNzaW9uIG9yIGB1bmRlZmluZWRgIGlmIHRoZXJlJ3MgYW4gZXJyb3IgLSBjYWxsIGBsZXhpbmdFcnJvcnNgIGFuZCBgcGFyc2luZ0Vycm9yc2AgdG8gc2VlIHRoZSBlcnJvcnNcblx0ICovXG5cdHBhcnNlKGlucHV0OiBzdHJpbmcpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cblx0XHRpZiAoaW5wdXQgPT09ICcnKSB7XG5cdFx0XHR0aGlzLl9wYXJzaW5nRXJyb3JzLnB1c2goeyBtZXNzYWdlOiBlcnJvckVtcHR5U3RyaW5nLCBvZmZzZXQ6IDAsIGxleGVtZTogJycsIGFkZGl0aW9uYWxJbmZvOiBoaW50RW1wdHlTdHJpbmcgfSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Rva2VucyA9IHRoaXMuX3NjYW5uZXIucmVzZXQoaW5wdXQpLnNjYW4oKTtcblx0XHQvLyBAdWx1Z2Jla25hOiB3ZSBkbyBub3Qgc3RvcCBwYXJzaW5nIGlmIHRoZXJlIGFyZSBsZXhpbmcgZXJyb3JzIHRvIGJlIGFibGUgdG8gcmVjb25zdHJ1Y3QgcmVnZXhlcyB3aXRoIHVuZXNjYXBlZCBzbGFzaGVzOyBUT0RPQHVsdWdiZWtuYTogbWFrZSB0aGlzIHJlc3BlY3QgY29uZmlnIG9wdGlvbiBmb3IgcmVjb3ZlcnlcblxuXHRcdHRoaXMuX2N1cnJlbnQgPSAwO1xuXHRcdHRoaXMuX3BhcnNpbmdFcnJvcnMgPSBbXTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleHByID0gdGhpcy5fZXhwcigpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0F0RW5kKCkpIHtcblx0XHRcdFx0Y29uc3QgcGVlayA9IHRoaXMuX3BlZWsoKTtcblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbEluZm8gPSBwZWVrLnR5cGUgPT09IFRva2VuVHlwZS5TdHIgPyBoaW50VW5leHBlY3RlZFRva2VuIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9wYXJzaW5nRXJyb3JzLnB1c2goeyBtZXNzYWdlOiBlcnJvclVuZXhwZWN0ZWRUb2tlbiwgb2Zmc2V0OiBwZWVrLm9mZnNldCwgbGV4ZW1lOiBTY2FubmVyLmdldExleGVtZShwZWVrKSwgYWRkaXRpb25hbEluZm8gfSk7XG5cdFx0XHRcdHRocm93IFBhcnNlci5fcGFyc2VFcnJvcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleHByO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmICghKGUgPT09IFBhcnNlci5fcGFyc2VFcnJvcikpIHtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZXhwcigpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX29yKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vcigpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXhwciA9IFt0aGlzLl9hbmQoKV07XG5cblx0XHR3aGlsZSAodGhpcy5fbWF0Y2hPbmUoVG9rZW5UeXBlLk9yKSkge1xuXHRcdFx0Y29uc3QgcmlnaHQgPSB0aGlzLl9hbmQoKTtcblx0XHRcdGV4cHIucHVzaChyaWdodCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4cHIubGVuZ3RoID09PSAxID8gZXhwclswXSA6IENvbnRleHRLZXlFeHByLm9yKC4uLmV4cHIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYW5kKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleHByID0gW3RoaXMuX3Rlcm0oKV07XG5cblx0XHR3aGlsZSAodGhpcy5fbWF0Y2hPbmUoVG9rZW5UeXBlLkFuZCkpIHtcblx0XHRcdGNvbnN0IHJpZ2h0ID0gdGhpcy5fdGVybSgpO1xuXHRcdFx0ZXhwci5wdXNoKHJpZ2h0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZXhwci5sZW5ndGggPT09IDEgPyBleHByWzBdIDogQ29udGV4dEtleUV4cHIuYW5kKC4uLmV4cHIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdGVybSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX21hdGNoT25lKFRva2VuVHlwZS5OZWcpKSB7XG5cdFx0XHRjb25zdCBwZWVrID0gdGhpcy5fcGVlaygpO1xuXHRcdFx0c3dpdGNoIChwZWVrLnR5cGUpIHtcblx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuVHJ1ZTpcblx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0U7XG5cdFx0XHRcdGNhc2UgVG9rZW5UeXBlLkZhbHNlOlxuXHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFO1xuXHRcdFx0XHRjYXNlIFRva2VuVHlwZS5MUGFyZW46IHtcblx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdFx0Y29uc3QgZXhwciA9IHRoaXMuX2V4cHIoKTtcblx0XHRcdFx0XHR0aGlzLl9jb25zdW1lKFRva2VuVHlwZS5SUGFyZW4sIGVycm9yQ2xvc2luZ1BhcmVudGhlc2lzKTtcblx0XHRcdFx0XHRyZXR1cm4gZXhwcj8ubmVnYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuU3RyOlxuXHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleU5vdEV4cHIuY3JlYXRlKHBlZWsubGV4ZW1lKTtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aHJvdyB0aGlzLl9lcnJFeHBlY3RlZEJ1dEdvdChgS0VZIHwgdHJ1ZSB8IGZhbHNlIHwgJygnIGV4cHJlc3Npb24gJyknYCwgcGVlayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcmltYXJ5KCk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmltYXJ5KCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblxuXHRcdGNvbnN0IHBlZWsgPSB0aGlzLl9wZWVrKCk7XG5cdFx0c3dpdGNoIChwZWVrLnR5cGUpIHtcblx0XHRcdGNhc2UgVG9rZW5UeXBlLlRydWU6XG5cdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLnRydWUoKTtcblxuXHRcdFx0Y2FzZSBUb2tlblR5cGUuRmFsc2U6XG5cdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLmZhbHNlKCk7XG5cblx0XHRcdGNhc2UgVG9rZW5UeXBlLkxQYXJlbjoge1xuXHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdGNvbnN0IGV4cHIgPSB0aGlzLl9leHByKCk7XG5cdFx0XHRcdHRoaXMuX2NvbnN1bWUoVG9rZW5UeXBlLlJQYXJlbiwgZXJyb3JDbG9zaW5nUGFyZW50aGVzaXMpO1xuXHRcdFx0XHRyZXR1cm4gZXhwcjtcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSBUb2tlblR5cGUuU3RyOiB7XG5cdFx0XHRcdC8vIEtFWVxuXHRcdFx0XHRjb25zdCBrZXkgPSBwZWVrLmxleGVtZTtcblx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXG5cdFx0XHRcdC8vID1+IHJlZ2V4XG5cdFx0XHRcdGlmICh0aGlzLl9tYXRjaE9uZShUb2tlblR5cGUuUmVnZXhPcCkpIHtcblxuXHRcdFx0XHRcdC8vIEB1bHVnYmVrbmE6IHdlIG5lZWQgdG8gcmVjb25zdHJ1Y3QgdGhlIHJlZ2V4IGZyb20gdGhlIHRva2VucyBiZWNhdXNlIHNvbWUgZXh0ZW5zaW9ucyB1c2UgdW5lc2NhcGVkIHNsYXNoZXMgaW4gcmVnZXhlc1xuXHRcdFx0XHRcdGNvbnN0IGV4cHIgPSB0aGlzLl9wZWVrKCk7XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMuX2NvbmZpZy5yZWdleFBhcnNpbmdXaXRoRXJyb3JSZWNvdmVyeSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRcdFx0aWYgKGV4cHIudHlwZSAhPT0gVG9rZW5UeXBlLlJlZ2V4U3RyKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IHRoaXMuX2VyckV4cGVjdGVkQnV0R290KGBSRUdFWGAsIGV4cHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgcmVnZXhMZXhlbWUgPSBleHByLmxleGVtZTtcblx0XHRcdFx0XHRcdGNvbnN0IGNsb3NpbmdTbGFzaEluZGV4ID0gcmVnZXhMZXhlbWUubGFzdEluZGV4T2YoJy8nKTtcblx0XHRcdFx0XHRcdGNvbnN0IGZsYWdzID0gY2xvc2luZ1NsYXNoSW5kZXggPT09IHJlZ2V4TGV4ZW1lLmxlbmd0aCAtIDEgPyB1bmRlZmluZWQgOiB0aGlzLl9yZW1vdmVGbGFnc0dZKHJlZ2V4TGV4ZW1lLnN1YnN0cmluZyhjbG9zaW5nU2xhc2hJbmRleCArIDEpKTtcblx0XHRcdFx0XHRcdGxldCByZWdleHA6IFJlZ0V4cCB8IG51bGw7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRyZWdleHAgPSBuZXcgUmVnRXhwKHJlZ2V4TGV4ZW1lLnN1YnN0cmluZygxLCBjbG9zaW5nU2xhc2hJbmRleCksIGZsYWdzKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgdGhpcy5fZXJyRXhwZWN0ZWRCdXRHb3QoYFJFR0VYYCwgZXhwcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVJlZ2V4RXhwci5jcmVhdGUoa2V5LCByZWdleHApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHN3aXRjaCAoZXhwci50eXBlKSB7XG5cdFx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5SZWdleFN0cjpcblx0XHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLkVycm9yOiB7IC8vIGFsc28gaGFuZGxlIGFuIEVycm9yVG9rZW4gaW4gY2FzZSBvZiBzbXRoIHN1Y2ggYXMgLygvZmlsZSkvXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxleGVtZVJlY29uc3RydWN0aW9uID0gW2V4cHIubGV4ZW1lXTsgLy8gL1JFR0VYLyBvciAvUkVHRVgvRkxBR1Ncblx0XHRcdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXG5cdFx0XHRcdFx0XHRcdGxldCBmb2xsb3dpbmdUb2tlbiA9IHRoaXMuX3BlZWsoKTtcblx0XHRcdFx0XHRcdFx0bGV0IHBhcmVuQmFsYW5jZSA9IDA7XG5cdFx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZXhwci5sZXhlbWUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoZXhwci5sZXhlbWUuY2hhckNvZGVBdChpKSA9PT0gQ2hhckNvZGUuT3BlblBhcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRwYXJlbkJhbGFuY2UrKztcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGV4cHIubGV4ZW1lLmNoYXJDb2RlQXQoaSkgPT09IENoYXJDb2RlLkNsb3NlUGFyZW4pIHtcblx0XHRcdFx0XHRcdFx0XHRcdHBhcmVuQmFsYW5jZS0tO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHdoaWxlICghdGhpcy5faXNBdEVuZCgpICYmIGZvbGxvd2luZ1Rva2VuLnR5cGUgIT09IFRva2VuVHlwZS5BbmQgJiYgZm9sbG93aW5nVG9rZW4udHlwZSAhPT0gVG9rZW5UeXBlLk9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0c3dpdGNoIChmb2xsb3dpbmdUb2tlbi50eXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5MUGFyZW46XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHBhcmVuQmFsYW5jZSsrO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLlJQYXJlbjpcblx0XHRcdFx0XHRcdFx0XHRcdFx0cGFyZW5CYWxhbmNlLS07XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuUmVnZXhTdHI6XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5RdW90ZWRTdHI6XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZm9sbG93aW5nVG9rZW4ubGV4ZW1lLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGZvbGxvd2luZ1Rva2VuLmxleGVtZS5jaGFyQ29kZUF0KGkpID09PSBDaGFyQ29kZS5PcGVuUGFyZW4pIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHBhcmVuQmFsYW5jZSsrO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZXhwci5sZXhlbWUuY2hhckNvZGVBdChpKSA9PT0gQ2hhckNvZGUuQ2xvc2VQYXJlbikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cGFyZW5CYWxhbmNlLS07XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmIChwYXJlbkJhbGFuY2UgPCAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0bGV4ZW1lUmVjb25zdHJ1Y3Rpb24ucHVzaChTY2FubmVyLmdldExleGVtZShmb2xsb3dpbmdUb2tlbikpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRcdFx0XHRmb2xsb3dpbmdUb2tlbiA9IHRoaXMuX3BlZWsoKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlZ2V4TGV4ZW1lID0gbGV4ZW1lUmVjb25zdHJ1Y3Rpb24uam9pbignJyk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNsb3NpbmdTbGFzaEluZGV4ID0gcmVnZXhMZXhlbWUubGFzdEluZGV4T2YoJy8nKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZmxhZ3MgPSBjbG9zaW5nU2xhc2hJbmRleCA9PT0gcmVnZXhMZXhlbWUubGVuZ3RoIC0gMSA/IHVuZGVmaW5lZCA6IHRoaXMuX3JlbW92ZUZsYWdzR1kocmVnZXhMZXhlbWUuc3Vic3RyaW5nKGNsb3NpbmdTbGFzaEluZGV4ICsgMSkpO1xuXHRcdFx0XHRcdFx0XHRsZXQgcmVnZXhwOiBSZWdFeHAgfCBudWxsO1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdHJlZ2V4cCA9IG5ldyBSZWdFeHAocmVnZXhMZXhlbWUuc3Vic3RyaW5nKDEsIGNsb3NpbmdTbGFzaEluZGV4KSwgZmxhZ3MpO1xuXHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgdGhpcy5fZXJyRXhwZWN0ZWRCdXRHb3QoYFJFR0VYYCwgZXhwcik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLnJlZ2V4KGtleSwgcmVnZXhwKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuUXVvdGVkU3RyOiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRWYWx1ZSA9IGV4cHIubGV4ZW1lO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdFx0XHRcdC8vIHJlcGxpY2F0ZSBvbGQgcmVnZXggcGFyc2luZyBiZWhhdmlvclxuXG5cdFx0XHRcdFx0XHRcdGxldCByZWdleDogUmVnRXhwIHwgbnVsbCA9IG51bGw7XG5cblx0XHRcdFx0XHRcdFx0aWYgKCFpc0ZhbHN5T3JXaGl0ZXNwYWNlKHNlcmlhbGl6ZWRWYWx1ZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzdGFydCA9IHNlcmlhbGl6ZWRWYWx1ZS5pbmRleE9mKCcvJyk7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZW5kID0gc2VyaWFsaXplZFZhbHVlLmxhc3RJbmRleE9mKCcvJyk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHN0YXJ0ICE9PSBlbmQgJiYgc3RhcnQgPj0gMCkge1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IHNlcmlhbGl6ZWRWYWx1ZS5zbGljZShzdGFydCArIDEsIGVuZCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBjYXNlSWdub3JlRmxhZyA9IHNlcmlhbGl6ZWRWYWx1ZVtlbmQgKyAxXSA9PT0gJ2knID8gJ2knIDogJyc7XG5cdFx0XHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZWdleCA9IG5ldyBSZWdFeHAodmFsdWUsIGNhc2VJZ25vcmVGbGFnKTtcblx0XHRcdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKF9lKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHRocm93IHRoaXMuX2VyckV4cGVjdGVkQnV0R290KGBSRUdFWGAsIGV4cHIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGlmIChyZWdleCA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0XHRcdHRocm93IHRoaXMuX2VyckV4cGVjdGVkQnV0R290KCdSRUdFWCcsIGV4cHIpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlSZWdleEV4cHIuY3JlYXRlKGtleSwgcmVnZXgpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0XHR0aHJvdyB0aGlzLl9lcnJFeHBlY3RlZEJ1dEdvdCgnUkVHRVgnLCB0aGlzLl9wZWVrKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFsgJ25vdCcgJ2luJyB2YWx1ZSBdXG5cdFx0XHRcdGlmICh0aGlzLl9tYXRjaE9uZShUb2tlblR5cGUuTm90KSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnN1bWUoVG9rZW5UeXBlLkluLCBlcnJvck5vSW5BZnRlck5vdCk7XG5cdFx0XHRcdFx0Y29uc3QgcmlnaHQgPSB0aGlzLl92YWx1ZSgpO1xuXHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5RXhwci5ub3RJbihrZXksIHJpZ2h0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFsgKCc9PScgfCAnIT0nIHwgJzwnIHwgJzw9JyB8ICc+JyB8ICc+PScgfCAnaW4nKSB2YWx1ZSBdXG5cdFx0XHRcdGNvbnN0IG1heWJlT3AgPSB0aGlzLl9wZWVrKCkudHlwZTtcblx0XHRcdFx0c3dpdGNoIChtYXliZU9wKSB7XG5cdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuRXE6IHtcblx0XHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgcmlnaHQgPSB0aGlzLl92YWx1ZSgpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3ByZXZpb3VzKCkudHlwZSA9PT0gVG9rZW5UeXBlLlF1b3RlZFN0cikgeyAvLyB0byBwcmVzZXJ2ZSBvbGQgcGFyc2VyIGJlaGF2aW9yOiBcImZvbyA9PSAndHJ1ZSdcIiBpcyBwcmVzZXJ2ZWQgYXMgXCJmb28gPT0gJ3RydWUnXCIsIGJ1dCBcImZvbyA9PSB0cnVlXCIgaXMgb3B0aW1pemVkIGFzIFwiZm9vXCJcblx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLmVxdWFscyhrZXksIHJpZ2h0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHN3aXRjaCAocmlnaHQpIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSAndHJ1ZSc6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLmhhcyhrZXkpO1xuXHRcdFx0XHRcdFx0XHRjYXNlICdmYWxzZSc6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLm5vdChrZXkpO1xuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5RXhwci5lcXVhbHMoa2V5LCByaWdodCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuTm90RXE6IHtcblx0XHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgcmlnaHQgPSB0aGlzLl92YWx1ZSgpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3ByZXZpb3VzKCkudHlwZSA9PT0gVG9rZW5UeXBlLlF1b3RlZFN0cikgeyAvLyBzYW1lIGFzIGFib3ZlIHdpdGggXCJmb28gIT0gJ3RydWUnXCJcblx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhrZXksIHJpZ2h0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHN3aXRjaCAocmlnaHQpIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSAndHJ1ZSc6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLm5vdChrZXkpO1xuXHRcdFx0XHRcdFx0XHRjYXNlICdmYWxzZSc6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlFeHByLmhhcyhrZXkpO1xuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoa2V5LCByaWdodCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFRPRE86IENvbnRleHRLZXlFeHByLnNtYWxsZXIoa2V5LCByaWdodCkgYWNjZXB0cyBvbmx5IGBudW1iZXJgIGFzIGByaWdodGAgQU5EIGR1cmluZyBldmFsIG9mIHRoaXMgbm9kZSwgd2UganVzdCBldmFsIHRvIGBmYWxzZWAgaWYgYHJpZ2h0YCBpcyBub3QgYSBudW1iZXJcblx0XHRcdFx0XHQvLyBjb25zZXF1ZW50bHksIHBhY2thZ2UuanNvbiBsaW50ZXIgc2hvdWxkIF93YXJuXyB0aGUgdXNlciBpZiB0aGV5J3JlIHBhc3NpbmcgdW5kZXNpcmVkIHRoaW5ncyB0byBvcHNcblx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5MdDpcblx0XHRcdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5U21hbGxlckV4cHIuY3JlYXRlKGtleSwgdGhpcy5fdmFsdWUoKSk7XG5cblx0XHRcdFx0XHRjYXNlIFRva2VuVHlwZS5MdEVxOlxuXHRcdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlTbWFsbGVyRXF1YWxzRXhwci5jcmVhdGUoa2V5LCB0aGlzLl92YWx1ZSgpKTtcblxuXHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLkd0OlxuXHRcdFx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlHcmVhdGVyRXhwci5jcmVhdGUoa2V5LCB0aGlzLl92YWx1ZSgpKTtcblxuXHRcdFx0XHRcdGNhc2UgVG9rZW5UeXBlLkd0RXE6XG5cdFx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUdyZWF0ZXJFcXVhbHNFeHByLmNyZWF0ZShrZXksIHRoaXMuX3ZhbHVlKCkpO1xuXG5cdFx0XHRcdFx0Y2FzZSBUb2tlblR5cGUuSW46XG5cdFx0XHRcdFx0XHR0aGlzLl9hZHZhbmNlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIuaW4oa2V5LCB0aGlzLl92YWx1ZSgpKTtcblxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIuaGFzKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y2FzZSBUb2tlblR5cGUuRU9GOlxuXHRcdFx0XHR0aGlzLl9wYXJzaW5nRXJyb3JzLnB1c2goeyBtZXNzYWdlOiBlcnJvclVuZXhwZWN0ZWRFT0YsIG9mZnNldDogcGVlay5vZmZzZXQsIGxleGVtZTogJycsIGFkZGl0aW9uYWxJbmZvOiBoaW50VW5leHBlY3RlZEVPRiB9KTtcblx0XHRcdFx0dGhyb3cgUGFyc2VyLl9wYXJzZUVycm9yO1xuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyB0aGlzLl9lcnJFeHBlY3RlZEJ1dEdvdChgdHJ1ZSB8IGZhbHNlIHwgS0VZIFxcblxcdHwgS0VZICc9ficgUkVHRVggXFxuXFx0fCBLRVkgKCc9PScgfCAnIT0nIHwgJzwnIHwgJzw9JyB8ICc+JyB8ICc+PScgfCAnaW4nIHwgJ25vdCcgJ2luJykgdmFsdWVgLCB0aGlzLl9wZWVrKCkpO1xuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdmFsdWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX3BlZWsoKTtcblx0XHRzd2l0Y2ggKHRva2VuLnR5cGUpIHtcblx0XHRcdGNhc2UgVG9rZW5UeXBlLlN0cjpcblx0XHRcdGNhc2UgVG9rZW5UeXBlLlF1b3RlZFN0cjpcblx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRyZXR1cm4gdG9rZW4ubGV4ZW1lO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuVHJ1ZTpcblx0XHRcdFx0dGhpcy5fYWR2YW5jZSgpO1xuXHRcdFx0XHRyZXR1cm4gJ3RydWUnO1xuXHRcdFx0Y2FzZSBUb2tlblR5cGUuRmFsc2U6XG5cdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0cmV0dXJuICdmYWxzZSc7XG5cdFx0XHRjYXNlIFRva2VuVHlwZS5JbjogLy8gd2Ugc3VwcG9ydCBgaW5gIGFzIGEgdmFsdWUsIGUuZy4sIFwid2hlblwiOiBcImxhbmd1YWdlSWQgPT0gaW5cIiAtIGV4aXN0cyBpbiBleGlzdGluZyBleHRlbnNpb25zXG5cdFx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdFx0cmV0dXJuICdpbic7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHQvLyB0aGlzIGFsbG93cyBcIndoZW5cIjogXCJmb28gPT0gXCIgd2hpY2gncyB1c2VkIGJ5IGV4aXN0aW5nIGV4dGVuc2lvbnNcblx0XHRcdFx0Ly8gd2UgZG8gbm90IGNhbGwgYF9hZHZhbmNlYCBvbiBwdXJwb3NlIC0gd2UgZG9uJ3Qgd2FudCB0byBlYXQgdW5pbnRlbmRlZCB0b2tlbnNcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZsYWdzR1lSZSA9IC9nfHkvZztcblx0cHJpdmF0ZSBfcmVtb3ZlRmxhZ3NHWShmbGFnczogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZmxhZ3MucmVwbGFjZUFsbCh0aGlzLl9mbGFnc0dZUmUsICcnKTtcblx0fVxuXG5cdC8vIGNhcmVmdWw6IHRoaXMgY2FuIHRocm93IGlmIGN1cnJlbnQgdG9rZW4gaXMgdGhlIGluaXRpYWwgb25lIChpZSBpbmRleCA9IDApXG5cdHByaXZhdGUgX3ByZXZpb3VzKCkge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbdGhpcy5fY3VycmVudCAtIDFdO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hPbmUodG9rZW46IFRva2VuVHlwZSkge1xuXHRcdGlmICh0aGlzLl9jaGVjayh0b2tlbikpIHtcblx0XHRcdHRoaXMuX2FkdmFuY2UoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2FkdmFuY2UoKSB7XG5cdFx0aWYgKCF0aGlzLl9pc0F0RW5kKCkpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnQrKztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpb3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25zdW1lKHR5cGU6IFRva2VuVHlwZSwgbWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2NoZWNrKHR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWR2YW5jZSgpO1xuXHRcdH1cblxuXHRcdHRocm93IHRoaXMuX2VyckV4cGVjdGVkQnV0R290KG1lc3NhZ2UsIHRoaXMuX3BlZWsoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9lcnJFeHBlY3RlZEJ1dEdvdChleHBlY3RlZDogc3RyaW5nLCBnb3Q6IFRva2VuLCBhZGRpdGlvbmFsSW5mbz86IHN0cmluZykge1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY29udGV4dGtleS5wYXJzZXIuZXJyb3IuZXhwZWN0ZWRCdXRHb3QnLCBcIkV4cGVjdGVkOiB7MH1cXG5SZWNlaXZlZDogJ3sxfScuXCIsIGV4cGVjdGVkLCBTY2FubmVyLmdldExleGVtZShnb3QpKTtcblx0XHRjb25zdCBvZmZzZXQgPSBnb3Qub2Zmc2V0O1xuXHRcdGNvbnN0IGxleGVtZSA9IFNjYW5uZXIuZ2V0TGV4ZW1lKGdvdCk7XG5cdFx0dGhpcy5fcGFyc2luZ0Vycm9ycy5wdXNoKHsgbWVzc2FnZSwgb2Zmc2V0LCBsZXhlbWUsIGFkZGl0aW9uYWxJbmZvIH0pO1xuXHRcdHJldHVybiBQYXJzZXIuX3BhcnNlRXJyb3I7XG5cdH1cblxuXHRwcml2YXRlIF9jaGVjayh0eXBlOiBUb2tlblR5cGUpIHtcblx0XHRyZXR1cm4gdGhpcy5fcGVlaygpLnR5cGUgPT09IHR5cGU7XG5cdH1cblxuXHRwcml2YXRlIF9wZWVrKCkge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbnNbdGhpcy5fY3VycmVudF07XG5cdH1cblxuXHRwcml2YXRlIF9pc0F0RW5kKCkge1xuXHRcdHJldHVybiB0aGlzLl9wZWVrKCkudHlwZSA9PT0gVG9rZW5UeXBlLkVPRjtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQ29udGV4dEtleUV4cHIge1xuXG5cdHB1YmxpYyBzdGF0aWMgZmFsc2UoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgdHJ1ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGhhcyhrZXk6IHN0cmluZyk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleURlZmluZWRFeHByLmNyZWF0ZShrZXkpO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgZXF1YWxzKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5RXF1YWxzRXhwci5jcmVhdGUoa2V5LCB2YWx1ZSk7XG5cdH1cblx0cHVibGljIHN0YXRpYyBub3RFcXVhbHMoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlOb3RFcXVhbHNFeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIHJlZ2V4KGtleTogc3RyaW5nLCB2YWx1ZTogUmVnRXhwKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5UmVnZXhFeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGluKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5SW5FeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIG5vdEluKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5Tm90SW5FeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIG5vdChrZXk6IHN0cmluZyk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleU5vdEV4cHIuY3JlYXRlKGtleSk7XG5cdH1cblx0cHVibGljIHN0YXRpYyBhbmQoLi4uZXhwcjogQXJyYXk8Q29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQgfCBudWxsPik6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleUFuZEV4cHIuY3JlYXRlKGV4cHIsIG51bGwsIHRydWUpO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgb3IoLi4uZXhwcjogQXJyYXk8Q29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQgfCBudWxsPik6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleU9yRXhwci5jcmVhdGUoZXhwciwgbnVsbCwgdHJ1ZSk7XG5cdH1cblx0cHVibGljIHN0YXRpYyBncmVhdGVyKGtleTogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5R3JlYXRlckV4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgZ3JlYXRlckVxdWFscyhrZXk6IHN0cmluZywgdmFsdWU6IG51bWJlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleUdyZWF0ZXJFcXVhbHNFeHByLmNyZWF0ZShrZXksIHZhbHVlKTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIHNtYWxsZXIoa2V5OiBzdHJpbmcsIHZhbHVlOiBudW1iZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlTbWFsbGVyRXhwci5jcmVhdGUoa2V5LCB2YWx1ZSk7XG5cdH1cblx0cHVibGljIHN0YXRpYyBzbWFsbGVyRXF1YWxzKGtleTogc3RyaW5nLCB2YWx1ZTogbnVtYmVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBDb250ZXh0S2V5U21hbGxlckVxdWFsc0V4cHIuY3JlYXRlKGtleSwgdmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3BhcnNlciA9IG5ldyBQYXJzZXIoeyByZWdleFBhcnNpbmdXaXRoRXJyb3JSZWNvdmVyeTogZmFsc2UgfSk7XG5cdHB1YmxpYyBzdGF0aWMgZGVzZXJpYWxpemUoc2VyaWFsaXplZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc2VyaWFsaXplZCA9PT0gdW5kZWZpbmVkIHx8IHNlcmlhbGl6ZWQgPT09IG51bGwpIHsgLy8gYW4gZW1wdHkgc3RyaW5nIG5lZWRzIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHBhcnNlciB0byBnZXQgYSBjb3JyZXNwb25kaW5nIHBhcnNpbmcgZXJyb3IgcmVwb3J0ZWRcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwciA9IHRoaXMuX3BhcnNlci5wYXJzZShzZXJpYWxpemVkKTtcblx0XHRyZXR1cm4gZXhwcjtcblx0fVxuXG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlV2hlbkNsYXVzZXMod2hlbkNsYXVzZXM6IHN0cmluZ1tdKTogYW55IHtcblxuXHRjb25zdCBwYXJzZXIgPSBuZXcgUGFyc2VyKHsgcmVnZXhQYXJzaW5nV2l0aEVycm9yUmVjb3Zlcnk6IGZhbHNlIH0pOyAvLyB3ZSBydW4gd2l0aCBubyByZWNvdmVyeSB0byBndWlkZSB1c2VycyB0byB1c2UgY29ycmVjdCByZWdleGVzXG5cblx0cmV0dXJuIHdoZW5DbGF1c2VzLm1hcCh3aGVuQ2xhdXNlID0+IHtcblx0XHRwYXJzZXIucGFyc2Uod2hlbkNsYXVzZSk7XG5cblx0XHRpZiAocGFyc2VyLmxleGluZ0Vycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VyLmxleGluZ0Vycm9ycy5tYXAoKHNlOiBMZXhpbmdFcnJvcikgPT4gKHtcblx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBzZS5hZGRpdGlvbmFsSW5mbyA/XG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NvbnRleHRrZXkuc2Nhbm5lci5lcnJvckZvckxpbnRlcldpdGhIaW50JywgXCJVbmV4cGVjdGVkIHRva2VuLiBIaW50OiB7MH1cIiwgc2UuYWRkaXRpb25hbEluZm8pIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY29udGV4dGtleS5zY2FubmVyLmVycm9yRm9yTGludGVyJywgXCJVbmV4cGVjdGVkIHRva2VuLlwiKSxcblx0XHRcdFx0b2Zmc2V0OiBzZS5vZmZzZXQsXG5cdFx0XHRcdGxlbmd0aDogc2UubGV4ZW1lLmxlbmd0aCxcblx0XHRcdH0pKTtcblx0XHR9IGVsc2UgaWYgKHBhcnNlci5wYXJzaW5nRXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBwYXJzZXIucGFyc2luZ0Vycm9ycy5tYXAoKHBlOiBQYXJzaW5nRXJyb3IpID0+ICh7XG5cdFx0XHRcdGVycm9yTWVzc2FnZTogcGUuYWRkaXRpb25hbEluZm8gPyBgJHtwZS5tZXNzYWdlfS4gJHtwZS5hZGRpdGlvbmFsSW5mb31gIDogcGUubWVzc2FnZSxcblx0XHRcdFx0b2Zmc2V0OiBwZS5vZmZzZXQsXG5cdFx0XHRcdGxlbmd0aDogcGUubGV4ZW1lLmxlbmd0aCxcblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHByZXNzaW9uc0FyZUVxdWFsV2l0aENvbnN0YW50U3Vic3RpdHV0aW9uKGE6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCB8IHVuZGVmaW5lZCwgYjogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGNvbnN0IGFFeHByID0gYSA/IGEuc3Vic3RpdHV0ZUNvbnN0YW50cygpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBiRXhwciA9IGIgPyBiLnN1YnN0aXR1dGVDb25zdGFudHMoKSA6IHVuZGVmaW5lZDtcblx0aWYgKCFhRXhwciAmJiAhYkV4cHIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoIWFFeHByIHx8ICFiRXhwcikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gYUV4cHIuZXF1YWxzKGJFeHByKTtcbn1cblxuZnVuY3Rpb24gY21wKGE6IENvbnRleHRLZXlFeHByZXNzaW9uLCBiOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdHJldHVybiBhLmNtcChiKTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlGYWxzZUV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRwdWJsaWMgc3RhdGljIElOU1RBTkNFID0gbmV3IENvbnRleHRLZXlGYWxzZUV4cHIoKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5GYWxzZTtcblxuXHRwcm90ZWN0ZWQgY29uc3RydWN0b3IoKSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ2ZhbHNlJztcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleVRydWVFeHByIGltcGxlbWVudHMgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0cHVibGljIHN0YXRpYyBJTlNUQU5DRSA9IG5ldyBDb250ZXh0S2V5VHJ1ZUV4cHIoKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5UcnVlO1xuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3RvcigpIHtcblx0fVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICd0cnVlJztcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlEZWZpbmVkRXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgPSBudWxsKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IGNvbnN0YW50VmFsdWUgPSBDT05TVEFOVF9WQUxVRVMuZ2V0KGtleSk7XG5cdFx0aWYgKHR5cGVvZiBjb25zdGFudFZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiBjb25zdGFudFZhbHVlID8gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFIDogQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5RGVmaW5lZEV4cHIoa2V5LCBuZWdhdGVkKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLkRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGtleTogc3RyaW5nLFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gY21wMSh0aGlzLmtleSwgb3RoZXIua2V5KTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuICh0aGlzLmtleSA9PT0gb3RoZXIua2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvbnN0YW50VmFsdWUgPSBDT05TVEFOVF9WQUxVRVMuZ2V0KHRoaXMua2V5KTtcblx0XHRpZiAodHlwZW9mIGNvbnN0YW50VmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIGNvbnN0YW50VmFsdWUgPyBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0UgOiBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoISFjb250ZXh0LmdldFZhbHVlKHRoaXMua2V5KSk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMua2V5O1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbdGhpcy5rZXldO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcERlZmluZWQodGhpcy5rZXkpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlOb3RFeHByLmNyZWF0ZSh0aGlzLmtleSwgdGhpcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlFcXVhbHNFeHByIGltcGxlbWVudHMgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShrZXk6IHN0cmluZywgdmFsdWU6IGFueSwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsID0gbnVsbCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiAodmFsdWUgPyBDb250ZXh0S2V5RGVmaW5lZEV4cHIuY3JlYXRlKGtleSwgbmVnYXRlZCkgOiBDb250ZXh0S2V5Tm90RXhwci5jcmVhdGUoa2V5LCBuZWdhdGVkKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnN0YW50VmFsdWUgPSBDT05TVEFOVF9WQUxVRVMuZ2V0KGtleSk7XG5cdFx0aWYgKHR5cGVvZiBjb25zdGFudFZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdGNvbnN0IHRydWVWYWx1ZSA9IGNvbnN0YW50VmFsdWUgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXHRcdFx0cmV0dXJuICh2YWx1ZSA9PT0gdHJ1ZVZhbHVlID8gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFIDogQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgQ29udGV4dEtleUVxdWFsc0V4cHIoa2V5LCB2YWx1ZSwgbmVnYXRlZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5FcXVhbHM7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGtleTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmFsdWU6IGFueSxcblx0XHRwcml2YXRlIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRpZiAob3RoZXIudHlwZSAhPT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0XHR9XG5cdFx0cmV0dXJuIGNtcDIodGhpcy5rZXksIHRoaXMudmFsdWUsIG90aGVyLmtleSwgb3RoZXIudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gKHRoaXMua2V5ID09PSBvdGhlci5rZXkgJiYgdGhpcy52YWx1ZSA9PT0gb3RoZXIudmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29uc3RhbnRWYWx1ZSA9IENPTlNUQU5UX1ZBTFVFUy5nZXQodGhpcy5rZXkpO1xuXHRcdGlmICh0eXBlb2YgY29uc3RhbnRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRjb25zdCB0cnVlVmFsdWUgPSBjb25zdGFudFZhbHVlID8gJ3RydWUnIDogJ2ZhbHNlJztcblx0XHRcdHJldHVybiAodGhpcy52YWx1ZSA9PT0gdHJ1ZVZhbHVlID8gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFIDogQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0Ly8gSW50ZW50aW9uYWwgPT1cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgZXFlcWVxXG5cdFx0cmV0dXJuIChjb250ZXh0LmdldFZhbHVlKHRoaXMua2V5KSA9PSB0aGlzLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5rZXl9ID09ICcke3RoaXMudmFsdWV9J2A7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLmtleV07XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBtYXBGbmMubWFwRXF1YWxzKHRoaXMua2V5LCB0aGlzLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBuZWdhdGUoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGlmICghdGhpcy5uZWdhdGVkKSB7XG5cdFx0XHR0aGlzLm5lZ2F0ZWQgPSBDb250ZXh0S2V5Tm90RXF1YWxzRXhwci5jcmVhdGUodGhpcy5rZXksIHRoaXMudmFsdWUsIHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZWdhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5SW5FeHByIGltcGxlbWVudHMgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShrZXk6IHN0cmluZywgdmFsdWVLZXk6IHN0cmluZyk6IENvbnRleHRLZXlJbkV4cHIge1xuXHRcdHJldHVybiBuZXcgQ29udGV4dEtleUluRXhwcihrZXksIHZhbHVlS2V5KTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLkluO1xuXHRwcml2YXRlIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGtleTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmFsdWVLZXk6IHN0cmluZyxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiBjbXAyKHRoaXMua2V5LCB0aGlzLnZhbHVlS2V5LCBvdGhlci5rZXksIG90aGVyLnZhbHVlS2V5KTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuICh0aGlzLmtleSA9PT0gb3RoZXIua2V5ICYmIHRoaXMudmFsdWVLZXkgPT09IG90aGVyLnZhbHVlS2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc291cmNlID0gY29udGV4dC5nZXRWYWx1ZSh0aGlzLnZhbHVlS2V5KTtcblxuXHRcdGNvbnN0IGl0ZW0gPSBjb250ZXh0LmdldFZhbHVlKHRoaXMua2V5KTtcblxuXHRcdGlmIChBcnJheS5pc0FycmF5KHNvdXJjZSkpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0aWYgKHNvdXJjZS5pbmNsdWRlcyhpdGVtIGFzIGFueSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBPbiBXaW5kb3dzLCBmaWxlIHBhdGhzIGFyZSBjYXNlLWluc2Vuc2l0aXZlIHNvIGZpbGUgVVJJXG5cdFx0XHQvLyBjb21wYXJpc29ucyBtdXN0IGJlIGRvbmUgaW4gYSBjYXNlLWluc2Vuc2l0aXZlIG1hbm5lci5cblx0XHRcdGlmIChpc1dpbmRvd3MgJiYgdHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnICYmIGl0ZW0uc3RhcnRzV2l0aCgnZmlsZTovLy8nKSkge1xuXHRcdFx0XHRjb25zdCBpdGVtTG93ZXIgPSBpdGVtLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdHJldHVybiBzb3VyY2Uuc29tZShzID0+IHR5cGVvZiBzID09PSAnc3RyaW5nJyAmJiBzLnRvTG93ZXJDYXNlKCkgPT09IGl0ZW1Mb3dlcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJyAmJiB0eXBlb2Ygc291cmNlID09PSAnb2JqZWN0JyAmJiBzb3VyY2UgIT09IG51bGwpIHtcblx0XHRcdGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKHNvdXJjZSwgaXRlbSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBPbiBXaW5kb3dzLCBmaWxlIHBhdGhzIGFyZSBjYXNlLWluc2Vuc2l0aXZlIHNvIGZpbGUgVVJJXG5cdFx0XHQvLyBwcm9wZXJ0eSBsb29rdXBzIG11c3QgYmUgZG9uZSBpbiBhIGNhc2UtaW5zZW5zaXRpdmUgbWFubmVyLlxuXHRcdFx0aWYgKGlzV2luZG93cyAmJiBpdGVtLnN0YXJ0c1dpdGgoJ2ZpbGU6Ly8vJykpIHtcblx0XHRcdFx0Y29uc3QgaXRlbUxvd2VyID0gaXRlbS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRyZXR1cm4gT2JqZWN0LmtleXMoc291cmNlKS5zb21lKGtleSA9PiBrZXkudG9Mb3dlckNhc2UoKSA9PT0gaXRlbUxvd2VyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmtleX0gaW4gJyR7dGhpcy52YWx1ZUtleX0nYDtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW3RoaXMua2V5LCB0aGlzLnZhbHVlS2V5XTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5SW5FeHByIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcEluKHRoaXMua2V5LCB0aGlzLnZhbHVlS2V5KTtcblx0fVxuXG5cdHB1YmxpYyBuZWdhdGUoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGlmICghdGhpcy5uZWdhdGVkKSB7XG5cdFx0XHR0aGlzLm5lZ2F0ZWQgPSBDb250ZXh0S2V5Tm90SW5FeHByLmNyZWF0ZSh0aGlzLmtleSwgdGhpcy52YWx1ZUtleSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlOb3RJbkV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCB2YWx1ZUtleTogc3RyaW5nKTogQ29udGV4dEtleU5vdEluRXhwciB7XG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5Tm90SW5FeHByKGtleSwgdmFsdWVLZXkpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuTm90SW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbmVnYXRlZDogQ29udGV4dEtleUluRXhwcjtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZUtleTogc3RyaW5nLFxuXHQpIHtcblx0XHR0aGlzLl9uZWdhdGVkID0gQ29udGV4dEtleUluRXhwci5jcmVhdGUoa2V5LCB2YWx1ZUtleSk7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9uZWdhdGVkLmNtcChvdGhlci5fbmVnYXRlZCk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9uZWdhdGVkLmVxdWFscyhvdGhlci5fbmVnYXRlZCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fbmVnYXRlZC5ldmFsdWF0ZShjb250ZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5rZXl9IG5vdCBpbiAnJHt0aGlzLnZhbHVlS2V5fSdgO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9uZWdhdGVkLmtleXMoKTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIG1hcEZuYy5tYXBOb3RJbih0aGlzLmtleSwgdGhpcy52YWx1ZUtleSk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fbmVnYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleU5vdEVxdWFsc0V4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCB2YWx1ZTogYW55LCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgPSBudWxsKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBDb250ZXh0S2V5Tm90RXhwci5jcmVhdGUoa2V5LCBuZWdhdGVkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBDb250ZXh0S2V5RGVmaW5lZEV4cHIuY3JlYXRlKGtleSwgbmVnYXRlZCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnN0YW50VmFsdWUgPSBDT05TVEFOVF9WQUxVRVMuZ2V0KGtleSk7XG5cdFx0aWYgKHR5cGVvZiBjb25zdGFudFZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdGNvbnN0IGZhbHNlVmFsdWUgPSBjb25zdGFudFZhbHVlID8gJ3RydWUnIDogJ2ZhbHNlJztcblx0XHRcdHJldHVybiAodmFsdWUgPT09IGZhbHNlVmFsdWUgPyBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFIDogQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5Tm90RXF1YWxzRXhwcihrZXksIHZhbHVlLCBuZWdhdGVkKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLk5vdEVxdWFscztcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZTogYW55LFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gY21wMih0aGlzLmtleSwgdGhpcy52YWx1ZSwgb3RoZXIua2V5LCBvdGhlci52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiAodGhpcy5rZXkgPT09IG90aGVyLmtleSAmJiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb25zdGFudFZhbHVlID0gQ09OU1RBTlRfVkFMVUVTLmdldCh0aGlzLmtleSk7XG5cdFx0aWYgKHR5cGVvZiBjb25zdGFudFZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdGNvbnN0IGZhbHNlVmFsdWUgPSBjb25zdGFudFZhbHVlID8gJ3RydWUnIDogJ2ZhbHNlJztcblx0XHRcdHJldHVybiAodGhpcy52YWx1ZSA9PT0gZmFsc2VWYWx1ZSA/IENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0UgOiBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdC8vIEludGVudGlvbmFsICE9XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGVxZXFlcVxuXHRcdHJldHVybiAoY29udGV4dC5nZXRWYWx1ZSh0aGlzLmtleSkgIT0gdGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMua2V5fSAhPSAnJHt0aGlzLnZhbHVlfSdgO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbdGhpcy5rZXldO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcE5vdEVxdWFscyh0aGlzLmtleSwgdGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleUVxdWFsc0V4cHIuY3JlYXRlKHRoaXMua2V5LCB0aGlzLnZhbHVlLCB0aGlzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubmVnYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleU5vdEV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgPSBudWxsKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IGNvbnN0YW50VmFsdWUgPSBDT05TVEFOVF9WQUxVRVMuZ2V0KGtleSk7XG5cdFx0aWYgKHR5cGVvZiBjb25zdGFudFZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiAoY29uc3RhbnRWYWx1ZSA/IENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0UgOiBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0UpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlOb3RFeHByKGtleSwgbmVnYXRlZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5Ob3Q7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGtleTogc3RyaW5nLFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gY21wMSh0aGlzLmtleSwgb3RoZXIua2V5KTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuICh0aGlzLmtleSA9PT0gb3RoZXIua2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvbnN0YW50VmFsdWUgPSBDT05TVEFOVF9WQUxVRVMuZ2V0KHRoaXMua2V5KTtcblx0XHRpZiAodHlwZW9mIGNvbnN0YW50VmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIChjb25zdGFudFZhbHVlID8gQ29udGV4dEtleUZhbHNlRXhwci5JTlNUQU5DRSA6IENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICghY29udGV4dC5nZXRWYWx1ZSh0aGlzLmtleSkpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgISR7dGhpcy5rZXl9YDtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW3RoaXMua2V5XTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIG1hcEZuYy5tYXBOb3QodGhpcy5rZXkpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlEZWZpbmVkRXhwci5jcmVhdGUodGhpcy5rZXksIHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZWdhdGVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHdpdGhGbG9hdE9yU3RyPFQgZXh0ZW5kcyBDb250ZXh0S2V5RXhwcmVzc2lvbj4odmFsdWU6IGFueSwgY2FsbGJhY2s6ICh2YWx1ZTogbnVtYmVyIHwgc3RyaW5nKSA9PiBUKTogVCB8IENvbnRleHRLZXlGYWxzZUV4cHIge1xuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdGNvbnN0IG4gPSBwYXJzZUZsb2F0KHZhbHVlKTtcblx0XHRpZiAoIWlzTmFOKG4pKSB7XG5cdFx0XHR2YWx1ZSA9IG47XG5cdFx0fVxuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcblx0XHRyZXR1cm4gY2FsbGJhY2sodmFsdWUpO1xuXHR9XG5cdHJldHVybiBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFO1xufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleUdyZWF0ZXJFeHByIGltcGxlbWVudHMgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShrZXk6IHN0cmluZywgX3ZhbHVlOiBhbnksIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCA9IG51bGwpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIHdpdGhGbG9hdE9yU3RyKF92YWx1ZSwgKHZhbHVlKSA9PiBuZXcgQ29udGV4dEtleUdyZWF0ZXJFeHByKGtleSwgdmFsdWUsIG5lZ2F0ZWQpKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLkdyZWF0ZXI7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGtleTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmFsdWU6IG51bWJlciB8IHN0cmluZyxcblx0XHRwcml2YXRlIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRpZiAob3RoZXIudHlwZSAhPT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0XHR9XG5cdFx0cmV0dXJuIGNtcDIodGhpcy5rZXksIHRoaXMudmFsdWUsIG90aGVyLmtleSwgb3RoZXIudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gKHRoaXMua2V5ID09PSBvdGhlci5rZXkgJiYgdGhpcy52YWx1ZSA9PT0gb3RoZXIudmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIHRoaXMudmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAocGFyc2VGbG9hdChjb250ZXh0LmdldFZhbHVlPGFueT4odGhpcy5rZXkpKSA+IHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmtleX0gPiAke3RoaXMudmFsdWV9YDtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW3RoaXMua2V5XTtcblx0fVxuXG5cdHB1YmxpYyBtYXAobWFwRm5jOiBJQ29udGV4dEtleUV4cHJNYXBwZXIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIG1hcEZuYy5tYXBHcmVhdGVyKHRoaXMua2V5LCB0aGlzLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBuZWdhdGUoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdGlmICghdGhpcy5uZWdhdGVkKSB7XG5cdFx0XHR0aGlzLm5lZ2F0ZWQgPSBDb250ZXh0S2V5U21hbGxlckVxdWFsc0V4cHIuY3JlYXRlKHRoaXMua2V5LCB0aGlzLnZhbHVlLCB0aGlzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubmVnYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleUdyZWF0ZXJFcXVhbHNFeHByIGltcGxlbWVudHMgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShrZXk6IHN0cmluZywgX3ZhbHVlOiBhbnksIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCA9IG51bGwpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIHdpdGhGbG9hdE9yU3RyKF92YWx1ZSwgKHZhbHVlKSA9PiBuZXcgQ29udGV4dEtleUdyZWF0ZXJFcXVhbHNFeHByKGtleSwgdmFsdWUsIG5lZ2F0ZWQpKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLkdyZWF0ZXJFcXVhbHM7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGtleTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmFsdWU6IG51bWJlciB8IHN0cmluZyxcblx0XHRwcml2YXRlIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRpZiAob3RoZXIudHlwZSAhPT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0XHR9XG5cdFx0cmV0dXJuIGNtcDIodGhpcy5rZXksIHRoaXMudmFsdWUsIG90aGVyLmtleSwgb3RoZXIudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gKHRoaXMua2V5ID09PSBvdGhlci5rZXkgJiYgdGhpcy52YWx1ZSA9PT0gb3RoZXIudmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3Vic3RpdHV0ZUNvbnN0YW50cygpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIHRoaXMudmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAocGFyc2VGbG9hdChjb250ZXh0LmdldFZhbHVlPGFueT4odGhpcy5rZXkpKSA+PSB0aGlzLnZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5rZXl9ID49ICR7dGhpcy52YWx1ZX1gO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbdGhpcy5rZXldO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcEdyZWF0ZXJFcXVhbHModGhpcy5rZXksIHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlTbWFsbGVyRXhwci5jcmVhdGUodGhpcy5rZXksIHRoaXMudmFsdWUsIHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZWdhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5U21hbGxlckV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCBfdmFsdWU6IGFueSwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsID0gbnVsbCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gd2l0aEZsb2F0T3JTdHIoX3ZhbHVlLCAodmFsdWUpID0+IG5ldyBDb250ZXh0S2V5U21hbGxlckV4cHIoa2V5LCB2YWx1ZSwgbmVnYXRlZCkpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuU21hbGxlcjtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZTogbnVtYmVyIHwgc3RyaW5nLFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gY21wMih0aGlzLmtleSwgdGhpcy52YWx1ZSwgb3RoZXIua2V5LCBvdGhlci52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiAodGhpcy5rZXkgPT09IG90aGVyLmtleSAmJiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIChwYXJzZUZsb2F0KGNvbnRleHQuZ2V0VmFsdWU8YW55Pih0aGlzLmtleSkpIDwgdGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMua2V5fSA8ICR7dGhpcy52YWx1ZX1gO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbdGhpcy5rZXldO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbWFwRm5jLm1hcFNtYWxsZXIodGhpcy5rZXksIHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlHcmVhdGVyRXF1YWxzRXhwci5jcmVhdGUodGhpcy5rZXksIHRoaXMudmFsdWUsIHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZWdhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5U21hbGxlckVxdWFsc0V4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCBfdmFsdWU6IGFueSwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsID0gbnVsbCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gd2l0aEZsb2F0T3JTdHIoX3ZhbHVlLCAodmFsdWUpID0+IG5ldyBDb250ZXh0S2V5U21hbGxlckVxdWFsc0V4cHIoa2V5LCB2YWx1ZSwgbmVnYXRlZCkpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuU21hbGxlckVxdWFscztcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2YWx1ZTogbnVtYmVyIHwgc3RyaW5nLFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gY21wMih0aGlzLmtleSwgdGhpcy52YWx1ZSwgb3RoZXIua2V5LCBvdGhlci52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiAodGhpcy5rZXkgPT09IG90aGVyLmtleSAmJiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBldmFsdWF0ZShjb250ZXh0OiBJQ29udGV4dCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIChwYXJzZUZsb2F0KGNvbnRleHQuZ2V0VmFsdWU8YW55Pih0aGlzLmtleSkpIDw9IHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmtleX0gPD0gJHt0aGlzLnZhbHVlfWA7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLmtleV07XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBtYXBGbmMubWFwU21hbGxlckVxdWFscyh0aGlzLmtleSwgdGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleUdyZWF0ZXJFeHByLmNyZWF0ZSh0aGlzLmtleSwgdGhpcy52YWx1ZSwgdGhpcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlSZWdleEV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKGtleTogc3RyaW5nLCByZWdleHA6IFJlZ0V4cCB8IG51bGwpOiBDb250ZXh0S2V5UmVnZXhFeHByIHtcblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlSZWdleEV4cHIoa2V5LCByZWdleHApO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBDb250ZXh0S2V5RXhwclR5cGUuUmVnZXg7XG5cdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZWdleHA6IFJlZ0V4cCB8IG51bGxcblx0KSB7XG5cdFx0Ly9cblx0fVxuXG5cdHB1YmxpYyBjbXAob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogbnVtYmVyIHtcblx0XHRpZiAob3RoZXIudHlwZSAhPT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50eXBlIC0gb3RoZXIudHlwZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMua2V5IDwgb3RoZXIua2V5KSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmtleSA+IG90aGVyLmtleSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGNvbnN0IHRoaXNTb3VyY2UgPSB0aGlzLnJlZ2V4cCA/IHRoaXMucmVnZXhwLnNvdXJjZSA6ICcnO1xuXHRcdGNvbnN0IG90aGVyU291cmNlID0gb3RoZXIucmVnZXhwID8gb3RoZXIucmVnZXhwLnNvdXJjZSA6ICcnO1xuXHRcdGlmICh0aGlzU291cmNlIDwgb3RoZXJTb3VyY2UpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0aWYgKHRoaXNTb3VyY2UgPiBvdGhlclNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRjb25zdCB0aGlzU291cmNlID0gdGhpcy5yZWdleHAgPyB0aGlzLnJlZ2V4cC5zb3VyY2UgOiAnJztcblx0XHRcdGNvbnN0IG90aGVyU291cmNlID0gb3RoZXIucmVnZXhwID8gb3RoZXIucmVnZXhwLnNvdXJjZSA6ICcnO1xuXHRcdFx0cmV0dXJuICh0aGlzLmtleSA9PT0gb3RoZXIua2V5ICYmIHRoaXNTb3VyY2UgPT09IG90aGVyU291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBjb250ZXh0LmdldFZhbHVlPGFueT4odGhpcy5rZXkpO1xuXHRcdHJldHVybiB0aGlzLnJlZ2V4cCA/IHRoaXMucmVnZXhwLnRlc3QodmFsdWUpIDogZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLnJlZ2V4cFxuXHRcdFx0PyBgLyR7dGhpcy5yZWdleHAuc291cmNlfS8ke3RoaXMucmVnZXhwLmZsYWdzfWBcblx0XHRcdDogJy9pbnZhbGlkLyc7XG5cdFx0cmV0dXJuIGAke3RoaXMua2V5fSA9fiAke3ZhbHVlfWA7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFt0aGlzLmtleV07XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleVJlZ2V4RXhwciB7XG5cdFx0cmV0dXJuIG1hcEZuYy5tYXBSZWdleCh0aGlzLmtleSwgdGhpcy5yZWdleHApO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlOb3RSZWdleEV4cHIuY3JlYXRlKHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZWdhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5Tm90UmVnZXhFeHByIGltcGxlbWVudHMgSUNvbnRleHRLZXlFeHByZXNzaW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShhY3R1YWw6IENvbnRleHRLZXlSZWdleEV4cHIpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5Tm90UmVnZXhFeHByKGFjdHVhbCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IENvbnRleHRLZXlFeHByVHlwZS5Ob3RSZWdleDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2FjdHVhbDogQ29udGV4dEtleVJlZ2V4RXhwcikge1xuXHRcdC8vXG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwuY21wKG90aGVyLl9hY3R1YWwpO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIudHlwZSA9PT0gdGhpcy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLmVxdWFscyhvdGhlci5fYWN0dWFsKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9hY3R1YWwuZXZhbHVhdGUoY29udGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAhKCR7dGhpcy5fYWN0dWFsLnNlcmlhbGl6ZSgpfSlgO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwua2V5cygpO1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlOb3RSZWdleEV4cHIodGhpcy5fYWN0dWFsLm1hcChtYXBGbmMpKTtcblx0fVxuXG5cdHB1YmxpYyBuZWdhdGUoKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWw7XG5cdH1cbn1cblxuLyoqXG4gKiBAcmV0dXJucyB0aGUgc2FtZSBpbnN0YW5jZSBpZiBub3RoaW5nIGNoYW5nZWQuXG4gKi9cbmZ1bmN0aW9uIGVsaW1pbmF0ZUNvbnN0YW50c0luQXJyYXkoYXJyOiBDb250ZXh0S2V5RXhwcmVzc2lvbltdKTogKENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkKVtdIHtcblx0Ly8gQWxsb2NhdGUgYXJyYXkgb25seSBpZiB0aGVyZSBpcyBhIGRpZmZlcmVuY2Vcblx0bGV0IG5ld0FycjogKENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkKVtdIHwgbnVsbCA9IG51bGw7XG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhcnIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCBuZXdFeHByID0gYXJyW2ldLnN1YnN0aXR1dGVDb25zdGFudHMoKTtcblxuXHRcdGlmIChhcnJbaV0gIT09IG5ld0V4cHIpIHtcblx0XHRcdC8vIHNvbWV0aGluZyBoYXMgY2hhbmdlZCFcblxuXHRcdFx0Ly8gYWxsb2NhdGUgYXJyYXkgb24gZmlyc3QgZGlmZmVyZW5jZVxuXHRcdFx0aWYgKG5ld0FyciA9PT0gbnVsbCkge1xuXHRcdFx0XHRuZXdBcnIgPSBbXTtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBpOyBqKyspIHtcblx0XHRcdFx0XHRuZXdBcnJbal0gPSBhcnJbal07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobmV3QXJyICE9PSBudWxsKSB7XG5cdFx0XHRuZXdBcnJbaV0gPSBuZXdFeHByO1xuXHRcdH1cblx0fVxuXG5cdGlmIChuZXdBcnIgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gYXJyO1xuXHR9XG5cdHJldHVybiBuZXdBcnI7XG59XG5cbmV4cG9ydCBjbGFzcyBDb250ZXh0S2V5QW5kRXhwciBpbXBsZW1lbnRzIElDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoX2V4cHI6IFJlYWRvbmx5QXJyYXk8Q29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkPiwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsLCBleHRyYVJlZHVuZGFudENoZWNrOiBib29sZWFuKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBDb250ZXh0S2V5QW5kRXhwci5fbm9ybWFsaXplQXJyKF9leHByLCBuZWdhdGVkLCBleHRyYVJlZHVuZGFudENoZWNrKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLkFuZDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHByOiBDb250ZXh0S2V5RXhwcmVzc2lvbltdLFxuXHRcdHByaXZhdGUgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGNtcChvdGhlcjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdGlmIChvdGhlci50eXBlICE9PSB0aGlzLnR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnR5cGUgLSBvdGhlci50eXBlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHByLmxlbmd0aCA8IG90aGVyLmV4cHIubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4cHIubGVuZ3RoID4gb3RoZXIuZXhwci5sZW5ndGgpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5leHByLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCByID0gY21wKHRoaXMuZXhwcltpXSwgb3RoZXIuZXhwcltpXSk7XG5cdFx0XHRpZiAociAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci50eXBlID09PSB0aGlzLnR5cGUpIHtcblx0XHRcdGlmICh0aGlzLmV4cHIubGVuZ3RoICE9PSBvdGhlci5leHByLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5leHByLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGlmICghdGhpcy5leHByW2ldLmVxdWFscyhvdGhlci5leHByW2ldKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdWJzdGl0dXRlQ29uc3RhbnRzKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleHByQXJyID0gZWxpbWluYXRlQ29uc3RhbnRzSW5BcnJheSh0aGlzLmV4cHIpO1xuXHRcdGlmIChleHByQXJyID09PSB0aGlzLmV4cHIpIHtcblx0XHRcdC8vIG5vIGNoYW5nZVxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdHJldHVybiBDb250ZXh0S2V5QW5kRXhwci5jcmVhdGUoZXhwckFyciwgdGhpcy5uZWdhdGVkLCBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgZXZhbHVhdGUoY29udGV4dDogSUNvbnRleHQpOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5leHByLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoIXRoaXMuZXhwcltpXS5ldmFsdWF0ZShjb250ZXh0KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX25vcm1hbGl6ZUFycihhcnI6IFJlYWRvbmx5QXJyYXk8Q29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkPiwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsLCBleHRyYVJlZHVuZGFudENoZWNrOiBib29sZWFuKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4cHI6IENvbnRleHRLZXlFeHByZXNzaW9uW10gPSBbXTtcblx0XHRsZXQgaGFzVHJ1ZSA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBlIG9mIGFycikge1xuXHRcdFx0aWYgKCFlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuVHJ1ZSkge1xuXHRcdFx0XHQvLyBhbnl0aGluZyAmJiB0cnVlID09PiBhbnl0aGluZ1xuXHRcdFx0XHRoYXNUcnVlID0gdHJ1ZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5GYWxzZSkge1xuXHRcdFx0XHQvLyBhbnl0aGluZyAmJiBmYWxzZSA9PT4gZmFsc2Vcblx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5BbmQpIHtcblx0XHRcdFx0ZXhwci5wdXNoKC4uLmUuZXhwcik7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRleHByLnB1c2goZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4cHIubGVuZ3RoID09PSAwICYmIGhhc1RydWUpIHtcblx0XHRcdHJldHVybiBDb250ZXh0S2V5VHJ1ZUV4cHIuSU5TVEFOQ0U7XG5cdFx0fVxuXG5cdFx0aWYgKGV4cHIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChleHByLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGV4cHJbMF07XG5cdFx0fVxuXG5cdFx0ZXhwci5zb3J0KGNtcCk7XG5cblx0XHQvLyBlbGltaW5hdGUgZHVwbGljYXRlIHRlcm1zXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBleHByLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoZXhwcltpIC0gMV0uZXF1YWxzKGV4cHJbaV0pKSB7XG5cdFx0XHRcdGV4cHIuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRpLS07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4cHIubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gZXhwclswXTtcblx0XHR9XG5cblx0XHQvLyBXZSBtdXN0IGRpc3RyaWJ1dGUgYW55IE9SIGV4cHJlc3Npb24gYmVjYXVzZSB3ZSBkb24ndCBzdXBwb3J0IHBhcmVuc1xuXHRcdC8vIE9SIGV4dGVuc2lvbnMgd2lsbCBiZSBhdCB0aGUgZW5kIChkdWUgdG8gc29ydGluZyBydWxlcylcblx0XHR3aGlsZSAoZXhwci5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBsYXN0RWxlbWVudCA9IGV4cHJbZXhwci5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChsYXN0RWxlbWVudC50eXBlICE9PSBDb250ZXh0S2V5RXhwclR5cGUuT3IpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHQvLyBwb3AgdGhlIGxhc3QgZWxlbWVudFxuXHRcdFx0ZXhwci5wb3AoKTtcblxuXHRcdFx0Ly8gcG9wIHRoZSBzZWNvbmQgdG8gbGFzdCBlbGVtZW50XG5cdFx0XHRjb25zdCBzZWNvbmRUb0xhc3RFbGVtZW50ID0gZXhwci5wb3AoKSE7XG5cblx0XHRcdGNvbnN0IGlzRmluaXNoZWQgPSAoZXhwci5sZW5ndGggPT09IDApO1xuXG5cdFx0XHQvLyBkaXN0cmlidXRlIGBsYXN0RWxlbWVudGAgb3ZlciBgc2Vjb25kVG9MYXN0RWxlbWVudGBcblx0XHRcdGNvbnN0IHJlc3VsdEVsZW1lbnQgPSBDb250ZXh0S2V5T3JFeHByLmNyZWF0ZShcblx0XHRcdFx0bGFzdEVsZW1lbnQuZXhwci5tYXAoZWwgPT4gQ29udGV4dEtleUFuZEV4cHIuY3JlYXRlKFtlbCwgc2Vjb25kVG9MYXN0RWxlbWVudF0sIG51bGwsIGV4dHJhUmVkdW5kYW50Q2hlY2spKSxcblx0XHRcdFx0bnVsbCxcblx0XHRcdFx0aXNGaW5pc2hlZFxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKHJlc3VsdEVsZW1lbnQpIHtcblx0XHRcdFx0ZXhwci5wdXNoKHJlc3VsdEVsZW1lbnQpO1xuXHRcdFx0XHRleHByLnNvcnQoY21wKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhwci5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBleHByWzBdO1xuXHRcdH1cblxuXHRcdC8vIHJlc29sdmUgZmFsc2UgQU5EIGV4cHJlc3Npb25zXG5cdFx0aWYgKGV4dHJhUmVkdW5kYW50Q2hlY2spIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZXhwci5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRmb3IgKGxldCBqID0gaSArIDE7IGogPCBleHByLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRcdFx0aWYgKGV4cHJbaV0ubmVnYXRlKCkuZXF1YWxzKGV4cHJbal0pKSB7XG5cdFx0XHRcdFx0XHQvLyBBICYmICFBIGNhc2Vcblx0XHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5RmFsc2VFeHByLklOU1RBTkNFO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXhwci5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIGV4cHJbMF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5QW5kRXhwcihleHByLCBuZWdhdGVkKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5leHByLm1hcChlID0+IGUuc2VyaWFsaXplKCkpLmpvaW4oJyAmJiAnKTtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHByIG9mIHRoaXMuZXhwcikge1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uZXhwci5rZXlzKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIG1hcChtYXBGbmM6IElDb250ZXh0S2V5RXhwck1hcHBlcik6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXlBbmRFeHByKHRoaXMuZXhwci5tYXAoZXhwciA9PiBleHByLm1hcChtYXBGbmMpKSwgbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgbmVnYXRlKCk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRpZiAoIXRoaXMubmVnYXRlZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBDb250ZXh0S2V5RXhwcmVzc2lvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGV4cHIgb2YgdGhpcy5leHByKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGV4cHIubmVnYXRlKCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5uZWdhdGVkID0gQ29udGV4dEtleU9yRXhwci5jcmVhdGUocmVzdWx0LCB0aGlzLCB0cnVlKSE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5lZ2F0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRLZXlPckV4cHIgaW1wbGVtZW50cyBJQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKF9leHByOiBSZWFkb25seUFycmF5PENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCB8IHVuZGVmaW5lZD4sIG5lZ2F0ZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCwgZXh0cmFSZWR1bmRhbnRDaGVjazogYm9vbGVhbik6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleU9yRXhwci5fbm9ybWFsaXplQXJyKF9leHByLCBuZWdhdGVkLCBleHRyYVJlZHVuZGFudENoZWNrKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gQ29udGV4dEtleUV4cHJUeXBlLk9yO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4cHI6IENvbnRleHRLZXlFeHByZXNzaW9uW10sXG5cdFx0cHJpdmF0ZSBuZWdhdGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY21wKG90aGVyOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0aWYgKG90aGVyLnR5cGUgIT09IHRoaXMudHlwZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHlwZSAtIG90aGVyLnR5cGU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4cHIubGVuZ3RoIDwgb3RoZXIuZXhwci5sZW5ndGgpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXhwci5sZW5ndGggPiBvdGhlci5leHByLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmV4cHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHIgPSBjbXAodGhpcy5leHByW2ldLCBvdGhlci5leHByW2ldKTtcblx0XHRcdGlmIChyICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiByO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IENvbnRleHRLZXlFeHByZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLnR5cGUgPT09IHRoaXMudHlwZSkge1xuXHRcdFx0aWYgKHRoaXMuZXhwci5sZW5ndGggIT09IG90aGVyLmV4cHIubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmV4cHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0aWYgKCF0aGlzLmV4cHJbaV0uZXF1YWxzKG90aGVyLmV4cHJbaV0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHN1YnN0aXR1dGVDb25zdGFudHMoKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4cHJBcnIgPSBlbGltaW5hdGVDb25zdGFudHNJbkFycmF5KHRoaXMuZXhwcik7XG5cdFx0aWYgKGV4cHJBcnIgPT09IHRoaXMuZXhwcikge1xuXHRcdFx0Ly8gbm8gY2hhbmdlXG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0cmV0dXJuIENvbnRleHRLZXlPckV4cHIuY3JlYXRlKGV4cHJBcnIsIHRoaXMubmVnYXRlZCwgZmFsc2UpO1xuXHR9XG5cblx0cHVibGljIGV2YWx1YXRlKGNvbnRleHQ6IElDb250ZXh0KTogYm9vbGVhbiB7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuZXhwci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKHRoaXMuZXhwcltpXS5ldmFsdWF0ZShjb250ZXh0KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX25vcm1hbGl6ZUFycihhcnI6IFJlYWRvbmx5QXJyYXk8Q29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkPiwgbmVnYXRlZDogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsLCBleHRyYVJlZHVuZGFudENoZWNrOiBib29sZWFuKTogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGxldCBleHByOiBDb250ZXh0S2V5RXhwcmVzc2lvbltdID0gW107XG5cdFx0bGV0IGhhc0ZhbHNlID0gZmFsc2U7XG5cblx0XHRpZiAoYXJyKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGUgPSBhcnJbaV07XG5cdFx0XHRcdGlmICghZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLkZhbHNlKSB7XG5cdFx0XHRcdFx0Ly8gYW55dGhpbmcgfHwgZmFsc2UgPT0+IGFueXRoaW5nXG5cdFx0XHRcdFx0aGFzRmFsc2UgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLlRydWUpIHtcblx0XHRcdFx0XHQvLyBhbnl0aGluZyB8fCB0cnVlID09PiB0cnVlXG5cdFx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5Pcikge1xuXHRcdFx0XHRcdGV4cHIgPSBleHByLmNvbmNhdChlLmV4cHIpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZXhwci5wdXNoKGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXhwci5sZW5ndGggPT09IDAgJiYgaGFzRmFsc2UpIHtcblx0XHRcdFx0cmV0dXJuIENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0U7XG5cdFx0XHR9XG5cblx0XHRcdGV4cHIuc29ydChjbXApO1xuXHRcdH1cblxuXHRcdGlmIChleHByLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoZXhwci5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBleHByWzBdO1xuXHRcdH1cblxuXHRcdC8vIGVsaW1pbmF0ZSBkdXBsaWNhdGUgdGVybXNcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGV4cHIubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChleHByW2kgLSAxXS5lcXVhbHMoZXhwcltpXSkpIHtcblx0XHRcdFx0ZXhwci5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdGktLTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhwci5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBleHByWzBdO1xuXHRcdH1cblxuXHRcdC8vIHJlc29sdmUgdHJ1ZSBPUiBleHByZXNzaW9uc1xuXHRcdGlmIChleHRyYVJlZHVuZGFudENoZWNrKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV4cHIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgZXhwci5sZW5ndGg7IGorKykge1xuXHRcdFx0XHRcdGlmIChleHByW2ldLm5lZ2F0ZSgpLmVxdWFscyhleHByW2pdKSkge1xuXHRcdFx0XHRcdFx0Ly8gQSB8fCAhQSBjYXNlXG5cdFx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleVRydWVFeHByLklOU1RBTkNFO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXhwci5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIGV4cHJbMF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBDb250ZXh0S2V5T3JFeHByKGV4cHIsIG5lZ2F0ZWQpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmV4cHIubWFwKGUgPT4gZS5zZXJpYWxpemUoKSkuam9pbignIHx8ICcpO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4cHIgb2YgdGhpcy5leHByKSB7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5leHByLmtleXMoKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgbWFwKG1hcEZuYzogSUNvbnRleHRLZXlFeHByTWFwcGVyKTogQ29udGV4dEtleUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBuZXcgQ29udGV4dEtleU9yRXhwcih0aGlzLmV4cHIubWFwKGV4cHIgPT4gZXhwci5tYXAobWFwRm5jKSksIG51bGwpO1xuXHR9XG5cblx0cHVibGljIG5lZ2F0ZSgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLm5lZ2F0ZWQpIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogQ29udGV4dEtleUV4cHJlc3Npb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHByIG9mIHRoaXMuZXhwcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChleHByLm5lZ2F0ZSgpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgZG9uJ3Qgc3VwcG9ydCBwYXJlbnMsIHNvIGhlcmUgd2UgZGlzdHJpYnV0ZSB0aGUgQU5EIG92ZXIgdGhlIE9SIHRlcm1pbmFsc1xuXHRcdFx0Ly8gV2UgYWx3YXlzIHRha2UgdGhlIGZpcnN0IDIgQU5EIHBhaXJzIGFuZCBkaXN0cmlidXRlIHRoZW1cblx0XHRcdHdoaWxlIChyZXN1bHQubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCBMRUZUID0gcmVzdWx0LnNoaWZ0KCkhO1xuXHRcdFx0XHRjb25zdCBSSUdIVCA9IHJlc3VsdC5zaGlmdCgpITtcblxuXHRcdFx0XHRjb25zdCBhbGw6IENvbnRleHRLZXlFeHByZXNzaW9uW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBsZWZ0IG9mIGdldFRlcm1pbmFscyhMRUZUKSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmlnaHQgb2YgZ2V0VGVybWluYWxzKFJJR0hUKSkge1xuXHRcdFx0XHRcdFx0YWxsLnB1c2goQ29udGV4dEtleUFuZEV4cHIuY3JlYXRlKFtsZWZ0LCByaWdodF0sIG51bGwsIGZhbHNlKSEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc3VsdC51bnNoaWZ0KENvbnRleHRLZXlPckV4cHIuY3JlYXRlKGFsbCwgbnVsbCwgZmFsc2UpISk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubmVnYXRlZCA9IENvbnRleHRLZXlPckV4cHIuY3JlYXRlKHJlc3VsdCwgdGhpcywgdHJ1ZSkhO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5uZWdhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGV4dEtleUluZm8ge1xuXHRyZWFkb25seSBrZXk6IHN0cmluZztcblx0cmVhZG9ubHkgdHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBSYXdDb250ZXh0S2V5PFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWU+IGV4dGVuZHMgQ29udGV4dEtleURlZmluZWRFeHByIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfaW5mbzogQ29udGV4dEtleUluZm9bXSA9IFtdO1xuXG5cdHN0YXRpYyBhbGwoKTogSXRlcmFibGVJdGVyYXRvcjxDb250ZXh0S2V5SW5mbz4ge1xuXHRcdHJldHVybiBSYXdDb250ZXh0S2V5Ll9pbmZvLnZhbHVlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdFZhbHVlOiBUIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQgfCB1bmRlZmluZWQsIG1ldGFPckhpZGU/OiBzdHJpbmcgfCB0cnVlIHwgeyB0eXBlOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfSkge1xuXHRcdHN1cGVyKGtleSwgbnVsbCk7XG5cdFx0dGhpcy5fZGVmYXVsdFZhbHVlID0gZGVmYXVsdFZhbHVlO1xuXG5cdFx0Ly8gY29sbGVjdCBhbGwgY29udGV4dCBrZXlzIGludG8gYSBjZW50cmFsIHBsYWNlXG5cdFx0aWYgKHR5cGVvZiBtZXRhT3JIaWRlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0UmF3Q29udGV4dEtleS5faW5mby5wdXNoKHsgLi4ubWV0YU9ySGlkZSwga2V5IH0pO1xuXHRcdH0gZWxzZSBpZiAobWV0YU9ySGlkZSAhPT0gdHJ1ZSkge1xuXHRcdFx0UmF3Q29udGV4dEtleS5faW5mby5wdXNoKHsga2V5LCBkZXNjcmlwdGlvbjogbWV0YU9ySGlkZSwgdHlwZTogZGVmYXVsdFZhbHVlICE9PSBudWxsICYmIGRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkID8gdHlwZW9mIGRlZmF1bHRWYWx1ZSA6IHVuZGVmaW5lZCB9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYmluZFRvKHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlKTogSUNvbnRleHRLZXk8VD4ge1xuXHRcdHJldHVybiB0YXJnZXQuY3JlYXRlS2V5KHRoaXMua2V5LCB0aGlzLl9kZWZhdWx0VmFsdWUpO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlKHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRhcmdldC5nZXRDb250ZXh0S2V5VmFsdWU8VD4odGhpcy5rZXkpO1xuXHR9XG5cblx0cHVibGljIHRvTmVnYXRlZCgpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXMubmVnYXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgaXNFcXVhbFRvKHZhbHVlOiBhbnkpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlFcXVhbHNFeHByLmNyZWF0ZSh0aGlzLmtleSwgdmFsdWUpO1xuXHR9XG5cblx0cHVibGljIG5vdEVxdWFsc1RvKHZhbHVlOiBhbnkpOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIENvbnRleHRLZXlOb3RFcXVhbHNFeHByLmNyZWF0ZSh0aGlzLmtleSwgdmFsdWUpO1xuXHR9XG5cblx0cHVibGljIGdyZWF0ZXIodmFsdWU6IGFueSk6IENvbnRleHRLZXlFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gQ29udGV4dEtleUdyZWF0ZXJFeHByLmNyZWF0ZSh0aGlzLmtleSwgdmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIENvbnRleHRLZXlWYWx1ZSA9IG51bGwgfCB1bmRlZmluZWQgfCBib29sZWFuIHwgbnVtYmVyIHwgc3RyaW5nXG5cdHwgQXJyYXk8bnVsbCB8IHVuZGVmaW5lZCB8IGJvb2xlYW4gfCBudW1iZXIgfCBzdHJpbmc+XG5cdHwgUmVjb3JkPHN0cmluZywgbnVsbCB8IHVuZGVmaW5lZCB8IGJvb2xlYW4gfCBudW1iZXIgfCBzdHJpbmc+O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZXh0IHtcblx0Z2V0VmFsdWU8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZSA9IENvbnRleHRLZXlWYWx1ZT4oa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZXh0S2V5PFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWUgPSBDb250ZXh0S2V5VmFsdWU+IHtcblx0c2V0KHZhbHVlOiBUKTogdm9pZDtcblx0cmVzZXQoKTogdm9pZDtcblx0Z2V0KCk6IFQgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0IHtcblx0cGFyZW50RWxlbWVudDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0IHwgbnVsbDtcblx0c2V0QXR0cmlidXRlKGF0dHI6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQ7XG5cdHJlbW92ZUF0dHJpYnV0ZShhdHRyOiBzdHJpbmcpOiB2b2lkO1xuXHRoYXNBdHRyaWJ1dGUoYXR0cjogc3RyaW5nKTogYm9vbGVhbjtcblx0Z2V0QXR0cmlidXRlKGF0dHI6IHN0cmluZyk6IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBJQ29udGV4dEtleVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUNvbnRleHRLZXlTZXJ2aWNlPignY29udGV4dEtleVNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJUmVhZGFibGVTZXQ8VD4ge1xuXHRoYXModmFsdWU6IFQpOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZXh0S2V5Q2hhbmdlRXZlbnQge1xuXHRhZmZlY3RzU29tZShrZXlzOiBJUmVhZGFibGVTZXQ8c3RyaW5nPik6IGJvb2xlYW47XG5cdGFsbEtleXNDb250YWluZWRJbihrZXlzOiBJUmVhZGFibGVTZXQ8c3RyaW5nPik6IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIElTY29wZWRDb250ZXh0S2V5U2VydmljZSA9IElDb250ZXh0S2V5U2VydmljZSAmIElEaXNwb3NhYmxlO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZXh0S2V5U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRleHQ6IEV2ZW50PElDb250ZXh0S2V5Q2hhbmdlRXZlbnQ+O1xuXHRidWZmZXJDaGFuZ2VFdmVudHMoY2FsbGJhY2s6IEZ1bmN0aW9uKTogdm9pZDtcblxuXHRjcmVhdGVLZXk8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogVCB8IHVuZGVmaW5lZCk6IElDb250ZXh0S2V5PFQ+O1xuXHRjb250ZXh0TWF0Y2hlc1J1bGVzKHJ1bGVzOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW47XG5cdGdldENvbnRleHRLZXlWYWx1ZTxUPihrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQ7XG5cblx0Y3JlYXRlU2NvcGVkKHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0KTogSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRjcmVhdGVPdmVybGF5KG92ZXJsYXk6IEl0ZXJhYmxlPFtzdHJpbmcsIGFueV0+KTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRnZXRDb250ZXh0KHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0IHwgbnVsbCk6IElDb250ZXh0O1xuXG5cdHVwZGF0ZVBhcmVudChwYXJlbnRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gY21wMShrZXkxOiBzdHJpbmcsIGtleTI6IHN0cmluZyk6IG51bWJlciB7XG5cdGlmIChrZXkxIDwga2V5Mikge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXHRpZiAoa2V5MSA+IGtleTIpIHtcblx0XHRyZXR1cm4gMTtcblx0fVxuXHRyZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gY21wMihrZXkxOiBzdHJpbmcsIHZhbHVlMTogYW55LCBrZXkyOiBzdHJpbmcsIHZhbHVlMjogYW55KTogbnVtYmVyIHtcblx0aWYgKGtleTEgPCBrZXkyKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cdGlmIChrZXkxID4ga2V5Mikge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cdGlmICh2YWx1ZTEgPCB2YWx1ZTIpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cblx0aWYgKHZhbHVlMSA+IHZhbHVlMikge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cdHJldHVybiAwO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBpdCBpcyBwcm92YWJsZSBgcGAgaW1wbGllcyBgcWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbXBsaWVzKHA6IENvbnRleHRLZXlFeHByZXNzaW9uLCBxOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXG5cdGlmIChwLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5GYWxzZSB8fCBxLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5UcnVlKSB7XG5cdFx0Ly8gZmFsc2UgaW1wbGllcyBhbnl0aGluZ1xuXHRcdC8vIGFueXRoaW5nIGltcGxpZXMgdHJ1ZVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKHAudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLk9yKSB7XG5cdFx0aWYgKHEudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLk9yKSB7XG5cdFx0XHQvLyBgYSB8fCBiIHx8IGNgIGNhbiBvbmx5IGltcGx5IHNvbWV0aGluZyBsaWtlIGBhIHx8IGIgfHwgYyB8fCBkYFxuXHRcdFx0cmV0dXJuIGFsbEVsZW1lbnRzSW5jbHVkZWQocC5leHByLCBxLmV4cHIpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAocS50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuT3IpIHtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgcS5leHByKSB7XG5cdFx0XHRpZiAoaW1wbGllcyhwLCBlbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKHAudHlwZSA9PT0gQ29udGV4dEtleUV4cHJUeXBlLkFuZCkge1xuXHRcdGlmIChxLnR5cGUgPT09IENvbnRleHRLZXlFeHByVHlwZS5BbmQpIHtcblx0XHRcdC8vIGBhICYmIGIgJiYgY2AgaW1wbGllcyBgYSAmJiBjYFxuXHRcdFx0cmV0dXJuIGFsbEVsZW1lbnRzSW5jbHVkZWQocS5leHByLCBwLmV4cHIpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgcC5leHByKSB7XG5cdFx0XHRpZiAoaW1wbGllcyhlbGVtZW50LCBxKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHAuZXF1YWxzKHEpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBhbGwgZWxlbWVudHMgaW4gYHBgIGFyZSBhbHNvIHByZXNlbnQgaW4gYHFgLlxuICogVGhlIHR3byBhcnJheXMgYXJlIGFzc3VtZWQgdG8gYmUgc29ydGVkXG4gKi9cbmZ1bmN0aW9uIGFsbEVsZW1lbnRzSW5jbHVkZWQocDogQ29udGV4dEtleUV4cHJlc3Npb25bXSwgcTogQ29udGV4dEtleUV4cHJlc3Npb25bXSk6IGJvb2xlYW4ge1xuXHRsZXQgcEluZGV4ID0gMDtcblx0bGV0IHFJbmRleCA9IDA7XG5cdHdoaWxlIChwSW5kZXggPCBwLmxlbmd0aCAmJiBxSW5kZXggPCBxLmxlbmd0aCkge1xuXHRcdGNvbnN0IGNtcCA9IHBbcEluZGV4XS5jbXAocVtxSW5kZXhdKTtcblxuXHRcdGlmIChjbXAgPCAwKSB7XG5cdFx0XHQvLyBhbiBlbGVtZW50IGZyb20gYHBgIGlzIG1pc3NpbmcgZnJvbSBgcWBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKGNtcCA9PT0gMCkge1xuXHRcdFx0cEluZGV4Kys7XG5cdFx0XHRxSW5kZXgrKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cUluZGV4Kys7XG5cdFx0fVxuXHR9XG5cdHJldHVybiAocEluZGV4ID09PSBwLmxlbmd0aCk7XG59XG5cbmZ1bmN0aW9uIGdldFRlcm1pbmFscyhub2RlOiBDb250ZXh0S2V5RXhwcmVzc2lvbikge1xuXHRpZiAobm9kZS50eXBlID09PSBDb250ZXh0S2V5RXhwclR5cGUuT3IpIHtcblx0XHRyZXR1cm4gbm9kZS5leHByO1xuXHR9XG5cdHJldHVybiBbbm9kZV07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLFVBQVUsUUFBUSxXQUFXLFNBQVMsYUFBYSxVQUFVLE9BQU8saUJBQWlCO0FBQzlGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsU0FBNkIsaUJBQWlCO0FBQ3ZELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sa0JBQWtCLG9CQUFJLElBQXFCO0FBQ2pELGdCQUFnQixJQUFJLFNBQVMsS0FBSztBQUNsQyxnQkFBZ0IsSUFBSSxRQUFRLElBQUk7QUFDaEMsZ0JBQWdCLElBQUksU0FBUyxXQUFXO0FBQ3hDLGdCQUFnQixJQUFJLFdBQVcsT0FBTztBQUN0QyxnQkFBZ0IsSUFBSSxhQUFhLFNBQVM7QUFDMUMsZ0JBQWdCLElBQUksU0FBUyxLQUFLO0FBQ2xDLGdCQUFnQixJQUFJLGVBQWUsZUFBZSxDQUFDLEtBQUs7QUFDeEQsZ0JBQWdCLElBQUksVUFBVSxNQUFNO0FBQ3BDLGdCQUFnQixJQUFJLGFBQWEsU0FBUztBQUMxQyxnQkFBZ0IsSUFBSSxZQUFZLFFBQVE7QUFDeEMsZ0JBQWdCLElBQUksWUFBWSxRQUFRO0FBR2pDLFNBQVMsWUFBWSxLQUFhLE9BQWdCO0FBQ3hELE1BQUksZ0JBQWdCLElBQUksR0FBRyxNQUFNLFFBQVc7QUFBRSxVQUFNLGdCQUFnQixvRUFBb0U7QUFBQSxFQUFHO0FBRTNJLGtCQUFnQixJQUFJLEtBQUssS0FBSztB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Q1I7QUFDQSxNQUFJLFNBQVMsUUFBUTtBQUNwQixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksU0FBUyxRQUFRO0FBQ3BCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUNSO0FBS08sU0FBUyxRQUFRLEdBQXlCLEdBQWtDO0FBRWxGLE1BQUksRUFBRSxTQUFTLGlCQUE0QixFQUFFLFNBQVMsY0FBeUI7QUFHOUUsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLEVBQUUsU0FBUyxZQUF1QjtBQUNyQyxRQUFJLEVBQUUsU0FBUyxZQUF1QjtBQUVyQyxhQUFPLG9CQUFvQixFQUFFLE1BQU0sRUFBRSxJQUFJO0FBQUEsSUFDMUM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksRUFBRSxTQUFTLFlBQXVCO0FBQ3JDLGVBQVcsV0FBVyxFQUFFLE1BQU07QUFDN0IsVUFBSSxRQUFRLEdBQUcsT0FBTyxHQUFHO0FBQ3hCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxFQUFFLFNBQVMsYUFBd0I7QUFDdEMsUUFBSSxFQUFFLFNBQVMsYUFBd0I7QUFFdEMsYUFBTyxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsSUFBSTtBQUFBLElBQzFDO0FBQ0EsZUFBVyxXQUFXLEVBQUUsTUFBTTtBQUM3QixVQUFJLFFBQVEsU0FBUyxDQUFDLEdBQUc7QUFDeEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPLEVBQUUsT0FBTyxDQUFDO0FBQ2xCO0FBTUEsU0FBUyxvQkFBb0IsR0FBMkIsR0FBb0M7QUFDM0YsTUFBSSxTQUFTO0FBQ2IsTUFBSSxTQUFTO0FBQ2IsU0FBTyxTQUFTLEVBQUUsVUFBVSxTQUFTLEVBQUUsUUFBUTtBQUM5QyxVQUFNQyxPQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUM7QUFFbkMsUUFBSUEsT0FBTSxHQUFHO0FBRVosYUFBTztBQUFBLElBQ1IsV0FBV0EsU0FBUSxHQUFHO0FBQ3JCO0FBQ0E7QUFBQSxJQUNELE9BQU87QUFDTjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBUSxXQUFXLEVBQUU7QUFDdEI7QUFFQSxTQUFTLGFBQWEsTUFBNEI7QUFDakQsTUFBSSxLQUFLLFNBQVMsWUFBdUI7QUFDeEMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNBLFNBQU8sQ0FBQyxJQUFJO0FBQ2I7IiwKICAibmFtZXMiOiBbIkNvbnRleHRLZXlFeHByVHlwZSIsICJjbXAiXQp9Cg==
