import { CharCode } from "../../../../base/common/charCode.js";
var TokenType = /* @__PURE__ */ ((TokenType2) => {
  TokenType2[TokenType2["Dollar"] = 0] = "Dollar";
  TokenType2[TokenType2["Colon"] = 1] = "Colon";
  TokenType2[TokenType2["Comma"] = 2] = "Comma";
  TokenType2[TokenType2["CurlyOpen"] = 3] = "CurlyOpen";
  TokenType2[TokenType2["CurlyClose"] = 4] = "CurlyClose";
  TokenType2[TokenType2["Backslash"] = 5] = "Backslash";
  TokenType2[TokenType2["Forwardslash"] = 6] = "Forwardslash";
  TokenType2[TokenType2["Pipe"] = 7] = "Pipe";
  TokenType2[TokenType2["Int"] = 8] = "Int";
  TokenType2[TokenType2["VariableName"] = 9] = "VariableName";
  TokenType2[TokenType2["Format"] = 10] = "Format";
  TokenType2[TokenType2["Plus"] = 11] = "Plus";
  TokenType2[TokenType2["Dash"] = 12] = "Dash";
  TokenType2[TokenType2["QuestionMark"] = 13] = "QuestionMark";
  TokenType2[TokenType2["EOF"] = 14] = "EOF";
  return TokenType2;
})(TokenType || {});
const _Scanner = class _Scanner {
  constructor() {
    this.value = "";
    this.pos = 0;
  }
  static isDigitCharacter(ch) {
    return ch >= CharCode.Digit0 && ch <= CharCode.Digit9;
  }
  static isVariableCharacter(ch) {
    return ch === CharCode.Underline || ch >= CharCode.a && ch <= CharCode.z || ch >= CharCode.A && ch <= CharCode.Z;
  }
  text(value) {
    this.value = value;
    this.pos = 0;
  }
  tokenText(token) {
    return this.value.substr(token.pos, token.len);
  }
  next() {
    if (this.pos >= this.value.length) {
      return { type: 14 /* EOF */, pos: this.pos, len: 0 };
    }
    const pos = this.pos;
    let len = 0;
    let ch = this.value.charCodeAt(pos);
    let type;
    type = _Scanner._table[ch];
    if (typeof type === "number") {
      this.pos += 1;
      return { type, pos, len: 1 };
    }
    if (_Scanner.isDigitCharacter(ch)) {
      type = 8 /* Int */;
      do {
        len += 1;
        ch = this.value.charCodeAt(pos + len);
      } while (_Scanner.isDigitCharacter(ch));
      this.pos += len;
      return { type, pos, len };
    }
    if (_Scanner.isVariableCharacter(ch)) {
      type = 9 /* VariableName */;
      do {
        ch = this.value.charCodeAt(pos + ++len);
      } while (_Scanner.isVariableCharacter(ch) || _Scanner.isDigitCharacter(ch));
      this.pos += len;
      return { type, pos, len };
    }
    type = 10 /* Format */;
    do {
      len += 1;
      ch = this.value.charCodeAt(pos + len);
    } while (!isNaN(ch) && typeof _Scanner._table[ch] === "undefined" && !_Scanner.isDigitCharacter(ch) && !_Scanner.isVariableCharacter(ch));
    this.pos += len;
    return { type, pos, len };
  }
};
_Scanner._table = {
  [CharCode.DollarSign]: 0 /* Dollar */,
  [CharCode.Colon]: 1 /* Colon */,
  [CharCode.Comma]: 2 /* Comma */,
  [CharCode.OpenCurlyBrace]: 3 /* CurlyOpen */,
  [CharCode.CloseCurlyBrace]: 4 /* CurlyClose */,
  [CharCode.Backslash]: 5 /* Backslash */,
  [CharCode.Slash]: 6 /* Forwardslash */,
  [CharCode.Pipe]: 7 /* Pipe */,
  [CharCode.Plus]: 11 /* Plus */,
  [CharCode.Dash]: 12 /* Dash */,
  [CharCode.QuestionMark]: 13 /* QuestionMark */
};
let Scanner = _Scanner;
class Marker {
  constructor() {
    this._children = [];
  }
  appendChild(child) {
    if (child instanceof Text && this._children[this._children.length - 1] instanceof Text) {
      this._children[this._children.length - 1].value += child.value;
    } else {
      child.parent = this;
      this._children.push(child);
    }
    return this;
  }
  replace(child, others) {
    const { parent } = child;
    const idx = parent.children.indexOf(child);
    const newChildren = parent.children.slice(0);
    newChildren.splice(idx, 1, ...others);
    parent._children = newChildren;
    (function _fixParent(children, parent2) {
      for (const child2 of children) {
        child2.parent = parent2;
        _fixParent(child2.children, child2);
      }
    })(others, parent);
  }
  get children() {
    return this._children;
  }
  get rightMostDescendant() {
    if (this._children.length > 0) {
      return this._children[this._children.length - 1].rightMostDescendant;
    }
    return this;
  }
  get snippet() {
    let candidate = this;
    while (true) {
      if (!candidate) {
        return void 0;
      }
      if (candidate instanceof TextmateSnippet) {
        return candidate;
      }
      candidate = candidate.parent;
    }
  }
  toString() {
    return this.children.reduce((prev, cur) => prev + cur.toString(), "");
  }
  len() {
    return 0;
  }
}
class Text extends Marker {
  constructor(value) {
    super();
    this.value = value;
  }
  static escape(value) {
    return value.replace(/\$|}|\\/g, "\\$&");
  }
  toString() {
    return this.value;
  }
  toTextmateString() {
    return Text.escape(this.value);
  }
  len() {
    return this.value.length;
  }
  clone() {
    return new Text(this.value);
  }
}
class TransformableMarker extends Marker {
}
class Placeholder extends TransformableMarker {
  constructor(index) {
    super();
    this.index = index;
  }
  static compareByIndex(a, b) {
    if (a.index === b.index) {
      return 0;
    } else if (a.isFinalTabstop) {
      return 1;
    } else if (b.isFinalTabstop) {
      return -1;
    } else if (a.index < b.index) {
      return -1;
    } else if (a.index > b.index) {
      return 1;
    } else {
      return 0;
    }
  }
  get isFinalTabstop() {
    return this.index === 0;
  }
  get choice() {
    return this._children.length === 1 && this._children[0] instanceof Choice ? this._children[0] : void 0;
  }
  toTextmateString() {
    let transformString = "";
    if (this.transform) {
      transformString = this.transform.toTextmateString();
    }
    if (this.children.length === 0 && !this.transform) {
      return `$${this.index}`;
    } else if (this.children.length === 0) {
      return `\${${this.index}${transformString}}`;
    } else if (this.choice) {
      return `\${${this.index}|${this.choice.toTextmateString()}|${transformString}}`;
    } else {
      return `\${${this.index}:${this.children.map((child) => child.toTextmateString()).join("")}${transformString}}`;
    }
  }
  clone() {
    const ret = new Placeholder(this.index);
    if (this.transform) {
      ret.transform = this.transform.clone();
    }
    ret._children = this.children.map((child) => child.clone());
    return ret;
  }
}
class Choice extends Marker {
  constructor() {
    super(...arguments);
    this.options = [];
  }
  appendChild(marker) {
    if (marker instanceof Text) {
      marker.parent = this;
      this.options.push(marker);
    }
    return this;
  }
  toString() {
    return this.options[0].value;
  }
  toTextmateString() {
    return this.options.map((option) => option.value.replace(/\||,|\\/g, "\\$&")).join(",");
  }
  len() {
    return this.options[0].len();
  }
  clone() {
    const ret = new Choice();
    this.options.forEach(ret.appendChild, ret);
    return ret;
  }
}
class Transform extends Marker {
  constructor() {
    super(...arguments);
    this.regexp = new RegExp("");
  }
  resolve(value) {
    const _this = this;
    let didMatch = false;
    let ret = value.replace(this.regexp, function() {
      didMatch = true;
      return _this._replace(Array.prototype.slice.call(arguments, 0, -2));
    });
    if (!didMatch && this._children.some((child) => child instanceof FormatString && Boolean(child.elseValue))) {
      ret = this._replace([]);
    }
    return ret;
  }
  _replace(groups) {
    let ret = "";
    for (const marker of this._children) {
      if (marker instanceof FormatString) {
        let value = groups[marker.index] || "";
        value = marker.resolve(value);
        ret += value;
      } else {
        ret += marker.toString();
      }
    }
    return ret;
  }
  toString() {
    return "";
  }
  toTextmateString() {
    return `/${this.regexp.source}/${this.children.map((c) => c.toTextmateString()).join("")}/${(this.regexp.ignoreCase ? "i" : "") + (this.regexp.global ? "g" : "")}`;
  }
  clone() {
    const ret = new Transform();
    ret.regexp = new RegExp(this.regexp.source, (this.regexp.ignoreCase ? "i" : "") + (this.regexp.global ? "g" : ""));
    ret._children = this.children.map((child) => child.clone());
    return ret;
  }
}
class FormatString extends Marker {
  constructor(index, shorthandName, ifValue, elseValue) {
    super();
    this.index = index;
    this.shorthandName = shorthandName;
    this.ifValue = ifValue;
    this.elseValue = elseValue;
  }
  resolve(value) {
    if (this.shorthandName === "upcase") {
      return !value ? "" : value.toLocaleUpperCase();
    } else if (this.shorthandName === "downcase") {
      return !value ? "" : value.toLocaleLowerCase();
    } else if (this.shorthandName === "capitalize") {
      return !value ? "" : value[0].toLocaleUpperCase() + value.substr(1);
    } else if (this.shorthandName === "pascalcase") {
      return !value ? "" : this._toPascalCase(value);
    } else if (this.shorthandName === "camelcase") {
      return !value ? "" : this._toCamelCase(value);
    } else if (this.shorthandName === "kebabcase") {
      return !value ? "" : this._toKebabCase(value);
    } else if (this.shorthandName === "snakecase") {
      return !value ? "" : this._toSnakeCase(value);
    } else if (Boolean(value) && typeof this.ifValue === "string") {
      return this.ifValue;
    } else if (!Boolean(value) && typeof this.elseValue === "string") {
      return this.elseValue;
    } else {
      return value || "";
    }
  }
  // Note: word-based case transforms rely on uppercase/lowercase distinctions.
  // For scripts without case, transforms are effectively no-ops.
  _toKebabCase(value) {
    const match = value.match(/[\p{L}0-9]+/gu);
    if (!match) {
      return value;
    }
    if (!value.match(/[\p{L}0-9]/u)) {
      return value.trim().toLowerCase().replace(/^_+|_+$/g, "").replace(/[\s_]+/g, "-");
    }
    const cleaned = value.trim().replace(/^_+|_+$/g, "");
    const match2 = cleaned.match(/\p{Lu}{2,}(?=\p{Lu}\p{Ll}+[0-9]*|[\s_-]|$)|\p{Lu}?\p{Ll}+[0-9]*|\p{Lu}(?=\p{Lu}\p{Ll})|\p{Lu}(?=[\s_-]|$)|[0-9]+/gu);
    if (!match2) {
      return cleaned.split(/[\s_-]+/).filter((word) => word.length > 0).map((word) => word.toLowerCase()).join("-");
    }
    return match2.map((x) => x.toLowerCase()).join("-");
  }
  _toPascalCase(value) {
    const match = value.match(/[\p{L}0-9]+/gu);
    if (!match) {
      return value;
    }
    return match.map((word) => {
      return word.charAt(0).toUpperCase() + word.substr(1);
    }).join("");
  }
  _toCamelCase(value) {
    const match = value.match(/[\p{L}0-9]+/gu);
    if (!match) {
      return value;
    }
    return match.map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toLowerCase() + word.substr(1);
      }
      return word.charAt(0).toUpperCase() + word.substr(1);
    }).join("");
  }
  _toSnakeCase(value) {
    return value.replace(/(\p{Ll})(\p{Lu})/gu, "$1_$2").replace(/[\s\-]+/g, "_").toLowerCase();
  }
  toTextmateString() {
    let value = "${";
    value += this.index;
    if (this.shorthandName) {
      value += `:/${this.shorthandName}`;
    } else if (this.ifValue && this.elseValue) {
      value += `:?${this.ifValue}:${this.elseValue}`;
    } else if (this.ifValue) {
      value += `:+${this.ifValue}`;
    } else if (this.elseValue) {
      value += `:-${this.elseValue}`;
    }
    value += "}";
    return value;
  }
  clone() {
    const ret = new FormatString(this.index, this.shorthandName, this.ifValue, this.elseValue);
    return ret;
  }
}
class Variable extends TransformableMarker {
  constructor(name) {
    super();
    this.name = name;
  }
  resolve(resolver) {
    let value = resolver.resolve(this);
    if (this.transform) {
      value = this.transform.resolve(value || "");
    }
    if (value !== void 0) {
      this._children = [new Text(value)];
      return true;
    }
    return false;
  }
  toTextmateString() {
    let transformString = "";
    if (this.transform) {
      transformString = this.transform.toTextmateString();
    }
    if (this.children.length === 0) {
      return `\${${this.name}${transformString}}`;
    } else {
      return `\${${this.name}:${this.children.map((child) => child.toTextmateString()).join("")}${transformString}}`;
    }
  }
  clone() {
    const ret = new Variable(this.name);
    if (this.transform) {
      ret.transform = this.transform.clone();
    }
    ret._children = this.children.map((child) => child.clone());
    return ret;
  }
}
function walk(marker, visitor) {
  const stack = [...marker];
  while (stack.length > 0) {
    const marker2 = stack.shift();
    const recurse = visitor(marker2);
    if (!recurse) {
      break;
    }
    stack.unshift(...marker2.children);
  }
}
class TextmateSnippet extends Marker {
  get placeholderInfo() {
    if (!this._placeholders) {
      const all = [];
      let last;
      this.walk(function(candidate) {
        if (candidate instanceof Placeholder) {
          all.push(candidate);
          last = !last || last.index < candidate.index ? candidate : last;
        }
        return true;
      });
      this._placeholders = { all, last };
    }
    return this._placeholders;
  }
  get placeholders() {
    const { all } = this.placeholderInfo;
    return all;
  }
  offset(marker) {
    let pos = 0;
    let found = false;
    this.walk((candidate) => {
      if (candidate === marker) {
        found = true;
        return false;
      }
      pos += candidate.len();
      return true;
    });
    if (!found) {
      return -1;
    }
    return pos;
  }
  fullLen(marker) {
    let ret = 0;
    walk([marker], (marker2) => {
      ret += marker2.len();
      return true;
    });
    return ret;
  }
  enclosingPlaceholders(placeholder) {
    const ret = [];
    let { parent } = placeholder;
    while (parent) {
      if (parent instanceof Placeholder) {
        ret.push(parent);
      }
      parent = parent.parent;
    }
    return ret;
  }
  resolveVariables(resolver) {
    this.walk((candidate) => {
      if (candidate instanceof Variable) {
        if (candidate.resolve(resolver)) {
          this._placeholders = void 0;
        }
      }
      return true;
    });
    return this;
  }
  appendChild(child) {
    this._placeholders = void 0;
    return super.appendChild(child);
  }
  replace(child, others) {
    this._placeholders = void 0;
    return super.replace(child, others);
  }
  toTextmateString() {
    return this.children.reduce((prev, cur) => prev + cur.toTextmateString(), "");
  }
  clone() {
    const ret = new TextmateSnippet();
    ret._children = this.children.map((child) => child.clone());
    return ret;
  }
  walk(visitor) {
    walk(this.children, visitor);
  }
}
class SnippetParser {
  constructor() {
    this._scanner = new Scanner();
    this._token = { type: 14 /* EOF */, pos: 0, len: 0 };
  }
  static escape(value) {
    return value.replace(/\$|}|\\/g, "\\$&");
  }
  /**
   * Takes a snippet and returns the insertable string, e.g return the snippet-string
   * without any placeholder, tabstop, variables etc...
   */
  static asInsertText(value) {
    return new SnippetParser().parse(value).toString();
  }
  static guessNeedsClipboard(template) {
    return /\${?CLIPBOARD/.test(template);
  }
  parse(value, insertFinalTabstop, enforceFinalTabstop) {
    const snippet = new TextmateSnippet();
    this.parseFragment(value, snippet);
    this.ensureFinalTabstop(snippet, enforceFinalTabstop ?? false, insertFinalTabstop ?? false);
    return snippet;
  }
  parseFragment(value, snippet) {
    const offset = snippet.children.length;
    this._scanner.text(value);
    this._token = this._scanner.next();
    while (this._parse(snippet)) {
    }
    const placeholderDefaultValues = /* @__PURE__ */ new Map();
    const incompletePlaceholders = [];
    snippet.walk((marker) => {
      if (marker instanceof Placeholder) {
        if (marker.isFinalTabstop) {
          placeholderDefaultValues.set(0, void 0);
        } else if (!placeholderDefaultValues.has(marker.index) && marker.children.length > 0) {
          placeholderDefaultValues.set(marker.index, marker.children);
        } else {
          incompletePlaceholders.push(marker);
        }
      }
      return true;
    });
    const fillInIncompletePlaceholder = (placeholder, stack2) => {
      const defaultValues = placeholderDefaultValues.get(placeholder.index);
      if (!defaultValues) {
        return;
      }
      const clone = new Placeholder(placeholder.index);
      clone.transform = placeholder.transform;
      for (const child of defaultValues) {
        const newChild = child.clone();
        clone.appendChild(newChild);
        if (newChild instanceof Placeholder && placeholderDefaultValues.has(newChild.index) && !stack2.has(newChild.index)) {
          stack2.add(newChild.index);
          fillInIncompletePlaceholder(newChild, stack2);
          stack2.delete(newChild.index);
        }
      }
      snippet.replace(placeholder, [clone]);
    };
    const stack = /* @__PURE__ */ new Set();
    for (const placeholder of incompletePlaceholders) {
      fillInIncompletePlaceholder(placeholder, stack);
    }
    return snippet.children.slice(offset);
  }
  ensureFinalTabstop(snippet, enforceFinalTabstop, insertFinalTabstop) {
    if (enforceFinalTabstop || insertFinalTabstop && snippet.placeholders.length > 0) {
      const finalTabstop = snippet.placeholders.find((p) => p.index === 0);
      if (!finalTabstop) {
        snippet.appendChild(new Placeholder(0));
      }
    }
  }
  _accept(type, value) {
    if (type === void 0 || this._token.type === type) {
      const ret = !value ? true : this._scanner.tokenText(this._token);
      this._token = this._scanner.next();
      return ret;
    }
    return false;
  }
  _backTo(token) {
    this._scanner.pos = token.pos + token.len;
    this._token = token;
    return false;
  }
  _until(type) {
    const start = this._token;
    while (this._token.type !== type) {
      if (this._token.type === 14 /* EOF */) {
        return false;
      } else if (this._token.type === 5 /* Backslash */) {
        const nextToken = this._scanner.next();
        if (nextToken.type !== 0 /* Dollar */ && nextToken.type !== 4 /* CurlyClose */ && nextToken.type !== 5 /* Backslash */) {
          return false;
        }
      }
      this._token = this._scanner.next();
    }
    const value = this._scanner.value.substring(start.pos, this._token.pos).replace(/\\(\$|}|\\)/g, "$1");
    this._token = this._scanner.next();
    return value;
  }
  _parse(marker) {
    return this._parseEscaped(marker) || this._parseTabstopOrVariableName(marker) || this._parseComplexPlaceholder(marker) || this._parseComplexVariable(marker) || this._parseAnything(marker);
  }
  // \$, \\, \} -> just text
  _parseEscaped(marker) {
    let value;
    if (value = this._accept(5 /* Backslash */, true)) {
      value = this._accept(0 /* Dollar */, true) || this._accept(4 /* CurlyClose */, true) || this._accept(5 /* Backslash */, true) || value;
      marker.appendChild(new Text(value));
      return true;
    }
    return false;
  }
  // $foo -> variable, $1 -> tabstop
  _parseTabstopOrVariableName(parent) {
    let value;
    const token = this._token;
    const match = this._accept(0 /* Dollar */) && (value = this._accept(9 /* VariableName */, true) || this._accept(8 /* Int */, true));
    if (!match) {
      return this._backTo(token);
    }
    parent.appendChild(
      /^\d+$/.test(value) ? new Placeholder(Number(value)) : new Variable(value)
    );
    return true;
  }
  // ${1:<children>}, ${1} -> placeholder
  _parseComplexPlaceholder(parent) {
    let index;
    const token = this._token;
    const match = this._accept(0 /* Dollar */) && this._accept(3 /* CurlyOpen */) && (index = this._accept(8 /* Int */, true));
    if (!match) {
      return this._backTo(token);
    }
    const placeholder = new Placeholder(Number(index));
    if (this._accept(1 /* Colon */)) {
      while (true) {
        if (this._accept(4 /* CurlyClose */)) {
          parent.appendChild(placeholder);
          return true;
        }
        if (this._parse(placeholder)) {
          continue;
        }
        parent.appendChild(new Text("${" + index + ":"));
        placeholder.children.forEach(parent.appendChild, parent);
        return true;
      }
    } else if (placeholder.index > 0 && this._accept(7 /* Pipe */)) {
      const choice = new Choice();
      while (true) {
        if (this._parseChoiceElement(choice)) {
          if (this._accept(2 /* Comma */)) {
            continue;
          }
          if (this._accept(7 /* Pipe */)) {
            placeholder.appendChild(choice);
            if (this._accept(4 /* CurlyClose */)) {
              parent.appendChild(placeholder);
              return true;
            }
          }
        }
        this._backTo(token);
        return false;
      }
    } else if (this._accept(6 /* Forwardslash */)) {
      if (this._parseTransform(placeholder)) {
        parent.appendChild(placeholder);
        return true;
      }
      this._backTo(token);
      return false;
    } else if (this._accept(4 /* CurlyClose */)) {
      parent.appendChild(placeholder);
      return true;
    } else {
      return this._backTo(token);
    }
  }
  _parseChoiceElement(parent) {
    const token = this._token;
    const values = [];
    while (true) {
      if (this._token.type === 2 /* Comma */ || this._token.type === 7 /* Pipe */) {
        break;
      }
      let value;
      if (value = this._accept(5 /* Backslash */, true)) {
        value = this._accept(2 /* Comma */, true) || this._accept(7 /* Pipe */, true) || this._accept(5 /* Backslash */, true) || value;
      } else {
        value = this._accept(void 0, true);
      }
      if (!value) {
        this._backTo(token);
        return false;
      }
      values.push(value);
    }
    if (values.length === 0) {
      this._backTo(token);
      return false;
    }
    parent.appendChild(new Text(values.join("")));
    return true;
  }
  // ${foo:<children>}, ${foo} -> variable
  _parseComplexVariable(parent) {
    let name;
    const token = this._token;
    const match = this._accept(0 /* Dollar */) && this._accept(3 /* CurlyOpen */) && (name = this._accept(9 /* VariableName */, true));
    if (!match) {
      return this._backTo(token);
    }
    const variable = new Variable(name);
    if (this._accept(1 /* Colon */)) {
      while (true) {
        if (this._accept(4 /* CurlyClose */)) {
          parent.appendChild(variable);
          return true;
        }
        if (this._parse(variable)) {
          continue;
        }
        parent.appendChild(new Text("${" + name + ":"));
        variable.children.forEach(parent.appendChild, parent);
        return true;
      }
    } else if (this._accept(6 /* Forwardslash */)) {
      if (this._parseTransform(variable)) {
        parent.appendChild(variable);
        return true;
      }
      this._backTo(token);
      return false;
    } else if (this._accept(4 /* CurlyClose */)) {
      parent.appendChild(variable);
      return true;
    } else {
      return this._backTo(token);
    }
  }
  _parseTransform(parent) {
    const transform = new Transform();
    let regexValue = "";
    let regexOptions = "";
    while (true) {
      if (this._accept(6 /* Forwardslash */)) {
        break;
      }
      let escaped;
      if (escaped = this._accept(5 /* Backslash */, true)) {
        escaped = this._accept(6 /* Forwardslash */, true) || escaped;
        regexValue += escaped;
        continue;
      }
      if (this._token.type !== 14 /* EOF */) {
        regexValue += this._accept(void 0, true);
        continue;
      }
      return false;
    }
    while (true) {
      if (this._accept(6 /* Forwardslash */)) {
        break;
      }
      let escaped;
      if (escaped = this._accept(5 /* Backslash */, true)) {
        escaped = this._accept(5 /* Backslash */, true) || this._accept(6 /* Forwardslash */, true) || escaped;
        transform.appendChild(new Text(escaped));
        continue;
      }
      if (this._parseFormatString(transform) || this._parseAnything(transform)) {
        continue;
      }
      return false;
    }
    while (true) {
      if (this._accept(4 /* CurlyClose */)) {
        break;
      }
      if (this._token.type !== 14 /* EOF */) {
        regexOptions += this._accept(void 0, true);
        continue;
      }
      return false;
    }
    try {
      transform.regexp = new RegExp(regexValue, regexOptions);
    } catch (e) {
      return false;
    }
    parent.transform = transform;
    return true;
  }
  _parseFormatString(parent) {
    const token = this._token;
    if (!this._accept(0 /* Dollar */)) {
      return false;
    }
    let complex = false;
    if (this._accept(3 /* CurlyOpen */)) {
      complex = true;
    }
    const index = this._accept(8 /* Int */, true);
    if (!index) {
      this._backTo(token);
      return false;
    } else if (!complex) {
      parent.appendChild(new FormatString(Number(index)));
      return true;
    } else if (this._accept(4 /* CurlyClose */)) {
      parent.appendChild(new FormatString(Number(index)));
      return true;
    } else if (!this._accept(1 /* Colon */)) {
      this._backTo(token);
      return false;
    }
    if (this._accept(6 /* Forwardslash */)) {
      const shorthand = this._accept(9 /* VariableName */, true);
      if (!shorthand || !this._accept(4 /* CurlyClose */)) {
        this._backTo(token);
        return false;
      } else {
        parent.appendChild(new FormatString(Number(index), shorthand));
        return true;
      }
    } else if (this._accept(11 /* Plus */)) {
      const ifValue = this._until(4 /* CurlyClose */);
      if (ifValue) {
        parent.appendChild(new FormatString(Number(index), void 0, ifValue, void 0));
        return true;
      }
    } else if (this._accept(12 /* Dash */)) {
      const elseValue = this._until(4 /* CurlyClose */);
      if (elseValue) {
        parent.appendChild(new FormatString(Number(index), void 0, void 0, elseValue));
        return true;
      }
    } else if (this._accept(13 /* QuestionMark */)) {
      const ifValue = this._until(1 /* Colon */);
      if (ifValue) {
        const elseValue = this._until(4 /* CurlyClose */);
        if (elseValue) {
          parent.appendChild(new FormatString(Number(index), void 0, ifValue, elseValue));
          return true;
        }
      }
    } else {
      const elseValue = this._until(4 /* CurlyClose */);
      if (elseValue) {
        parent.appendChild(new FormatString(Number(index), void 0, void 0, elseValue));
        return true;
      }
    }
    this._backTo(token);
    return false;
  }
  _parseAnything(marker) {
    if (this._token.type !== 14 /* EOF */) {
      marker.appendChild(new Text(this._scanner.tokenText(this._token)));
      this._accept(void 0);
      return true;
    }
    return false;
  }
}
export {
  Choice,
  FormatString,
  Marker,
  Placeholder,
  Scanner,
  SnippetParser,
  Text,
  TextmateSnippet,
  TokenType,
  Transform,
  TransformableMarker,
  Variable
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNuaXBwZXRcXGJyb3dzZXJcXHNuaXBwZXRQYXJzZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gVG9rZW5UeXBlIHtcblx0RG9sbGFyLFxuXHRDb2xvbixcblx0Q29tbWEsXG5cdEN1cmx5T3Blbixcblx0Q3VybHlDbG9zZSxcblx0QmFja3NsYXNoLFxuXHRGb3J3YXJkc2xhc2gsXG5cdFBpcGUsXG5cdEludCxcblx0VmFyaWFibGVOYW1lLFxuXHRGb3JtYXQsXG5cdFBsdXMsXG5cdERhc2gsXG5cdFF1ZXN0aW9uTWFyayxcblx0RU9GXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVG9rZW4ge1xuXHR0eXBlOiBUb2tlblR5cGU7XG5cdHBvczogbnVtYmVyO1xuXHRsZW46IG51bWJlcjtcbn1cblxuXG5leHBvcnQgY2xhc3MgU2Nhbm5lciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3RhYmxlOiB7IFtjaDogbnVtYmVyXTogVG9rZW5UeXBlIH0gPSB7XG5cdFx0W0NoYXJDb2RlLkRvbGxhclNpZ25dOiBUb2tlblR5cGUuRG9sbGFyLFxuXHRcdFtDaGFyQ29kZS5Db2xvbl06IFRva2VuVHlwZS5Db2xvbixcblx0XHRbQ2hhckNvZGUuQ29tbWFdOiBUb2tlblR5cGUuQ29tbWEsXG5cdFx0W0NoYXJDb2RlLk9wZW5DdXJseUJyYWNlXTogVG9rZW5UeXBlLkN1cmx5T3Blbixcblx0XHRbQ2hhckNvZGUuQ2xvc2VDdXJseUJyYWNlXTogVG9rZW5UeXBlLkN1cmx5Q2xvc2UsXG5cdFx0W0NoYXJDb2RlLkJhY2tzbGFzaF06IFRva2VuVHlwZS5CYWNrc2xhc2gsXG5cdFx0W0NoYXJDb2RlLlNsYXNoXTogVG9rZW5UeXBlLkZvcndhcmRzbGFzaCxcblx0XHRbQ2hhckNvZGUuUGlwZV06IFRva2VuVHlwZS5QaXBlLFxuXHRcdFtDaGFyQ29kZS5QbHVzXTogVG9rZW5UeXBlLlBsdXMsXG5cdFx0W0NoYXJDb2RlLkRhc2hdOiBUb2tlblR5cGUuRGFzaCxcblx0XHRbQ2hhckNvZGUuUXVlc3Rpb25NYXJrXTogVG9rZW5UeXBlLlF1ZXN0aW9uTWFyayxcblx0fTtcblxuXHRzdGF0aWMgaXNEaWdpdENoYXJhY3RlcihjaDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNoID49IENoYXJDb2RlLkRpZ2l0MCAmJiBjaCA8PSBDaGFyQ29kZS5EaWdpdDk7XG5cdH1cblxuXHRzdGF0aWMgaXNWYXJpYWJsZUNoYXJhY3RlcihjaDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNoID09PSBDaGFyQ29kZS5VbmRlcmxpbmVcblx0XHRcdHx8IChjaCA+PSBDaGFyQ29kZS5hICYmIGNoIDw9IENoYXJDb2RlLnopXG5cdFx0XHR8fCAoY2ggPj0gQ2hhckNvZGUuQSAmJiBjaCA8PSBDaGFyQ29kZS5aKTtcblx0fVxuXG5cdHZhbHVlOiBzdHJpbmcgPSAnJztcblx0cG9zOiBudW1iZXIgPSAwO1xuXG5cdHRleHQodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLnBvcyA9IDA7XG5cdH1cblxuXHR0b2tlblRleHQodG9rZW46IFRva2VuKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZS5zdWJzdHIodG9rZW4ucG9zLCB0b2tlbi5sZW4pO1xuXHR9XG5cblx0bmV4dCgpOiBUb2tlbiB7XG5cblx0XHRpZiAodGhpcy5wb3MgPj0gdGhpcy52YWx1ZS5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6IFRva2VuVHlwZS5FT0YsIHBvczogdGhpcy5wb3MsIGxlbjogMCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvcyA9IHRoaXMucG9zO1xuXHRcdGxldCBsZW4gPSAwO1xuXHRcdGxldCBjaCA9IHRoaXMudmFsdWUuY2hhckNvZGVBdChwb3MpO1xuXHRcdGxldCB0eXBlOiBUb2tlblR5cGU7XG5cblx0XHQvLyBzdGF0aWMgdHlwZXNcblx0XHR0eXBlID0gU2Nhbm5lci5fdGFibGVbY2hdO1xuXHRcdGlmICh0eXBlb2YgdHlwZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMucG9zICs9IDE7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBwb3MsIGxlbjogMSB9O1xuXHRcdH1cblxuXHRcdC8vIG51bWJlclxuXHRcdGlmIChTY2FubmVyLmlzRGlnaXRDaGFyYWN0ZXIoY2gpKSB7XG5cdFx0XHR0eXBlID0gVG9rZW5UeXBlLkludDtcblx0XHRcdGRvIHtcblx0XHRcdFx0bGVuICs9IDE7XG5cdFx0XHRcdGNoID0gdGhpcy52YWx1ZS5jaGFyQ29kZUF0KHBvcyArIGxlbik7XG5cdFx0XHR9IHdoaWxlIChTY2FubmVyLmlzRGlnaXRDaGFyYWN0ZXIoY2gpKTtcblxuXHRcdFx0dGhpcy5wb3MgKz0gbGVuO1xuXHRcdFx0cmV0dXJuIHsgdHlwZSwgcG9zLCBsZW4gfTtcblx0XHR9XG5cblx0XHQvLyB2YXJpYWJsZSBuYW1lXG5cdFx0aWYgKFNjYW5uZXIuaXNWYXJpYWJsZUNoYXJhY3RlcihjaCkpIHtcblx0XHRcdHR5cGUgPSBUb2tlblR5cGUuVmFyaWFibGVOYW1lO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRjaCA9IHRoaXMudmFsdWUuY2hhckNvZGVBdChwb3MgKyAoKytsZW4pKTtcblx0XHRcdH0gd2hpbGUgKFNjYW5uZXIuaXNWYXJpYWJsZUNoYXJhY3RlcihjaCkgfHwgU2Nhbm5lci5pc0RpZ2l0Q2hhcmFjdGVyKGNoKSk7XG5cblx0XHRcdHRoaXMucG9zICs9IGxlbjtcblx0XHRcdHJldHVybiB7IHR5cGUsIHBvcywgbGVuIH07XG5cdFx0fVxuXG5cblx0XHQvLyBmb3JtYXRcblx0XHR0eXBlID0gVG9rZW5UeXBlLkZvcm1hdDtcblx0XHRkbyB7XG5cdFx0XHRsZW4gKz0gMTtcblx0XHRcdGNoID0gdGhpcy52YWx1ZS5jaGFyQ29kZUF0KHBvcyArIGxlbik7XG5cdFx0fSB3aGlsZSAoXG5cdFx0XHQhaXNOYU4oY2gpXG5cdFx0XHQmJiB0eXBlb2YgU2Nhbm5lci5fdGFibGVbY2hdID09PSAndW5kZWZpbmVkJyAvLyBub3Qgc3RhdGljIHRva2VuXG5cdFx0XHQmJiAhU2Nhbm5lci5pc0RpZ2l0Q2hhcmFjdGVyKGNoKSAvLyBub3QgbnVtYmVyXG5cdFx0XHQmJiAhU2Nhbm5lci5pc1ZhcmlhYmxlQ2hhcmFjdGVyKGNoKSAvLyBub3QgdmFyaWFibGVcblx0XHQpO1xuXG5cdFx0dGhpcy5wb3MgKz0gbGVuO1xuXHRcdHJldHVybiB7IHR5cGUsIHBvcywgbGVuIH07XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE1hcmtlciB7XG5cblx0cmVhZG9ubHkgX21hcmtlckJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHVibGljIHBhcmVudCE6IE1hcmtlcjtcblx0cHJvdGVjdGVkIF9jaGlsZHJlbjogTWFya2VyW10gPSBbXTtcblxuXHRhcHBlbmRDaGlsZChjaGlsZDogTWFya2VyKTogdGhpcyB7XG5cdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgVGV4dCAmJiB0aGlzLl9jaGlsZHJlblt0aGlzLl9jaGlsZHJlbi5sZW5ndGggLSAxXSBpbnN0YW5jZW9mIFRleHQpIHtcblx0XHRcdC8vIHRoaXMgYW5kIHByZXZpb3VzIGNoaWxkIGFyZSB0ZXh0IC0+IG1lcmdlIHRoZW1cblx0XHRcdCg8VGV4dD50aGlzLl9jaGlsZHJlblt0aGlzLl9jaGlsZHJlbi5sZW5ndGggLSAxXSkudmFsdWUgKz0gY2hpbGQudmFsdWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG5vcm1hbCBhZG9wdGlvbiBvZiBjaGlsZFxuXHRcdFx0Y2hpbGQucGFyZW50ID0gdGhpcztcblx0XHRcdHRoaXMuX2NoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHJlcGxhY2UoY2hpbGQ6IE1hcmtlciwgb3RoZXJzOiBNYXJrZXJbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgcGFyZW50IH0gPSBjaGlsZDtcblx0XHRjb25zdCBpZHggPSBwYXJlbnQuY2hpbGRyZW4uaW5kZXhPZihjaGlsZCk7XG5cdFx0Y29uc3QgbmV3Q2hpbGRyZW4gPSBwYXJlbnQuY2hpbGRyZW4uc2xpY2UoMCk7XG5cdFx0bmV3Q2hpbGRyZW4uc3BsaWNlKGlkeCwgMSwgLi4ub3RoZXJzKTtcblx0XHRwYXJlbnQuX2NoaWxkcmVuID0gbmV3Q2hpbGRyZW47XG5cblx0XHQoZnVuY3Rpb24gX2ZpeFBhcmVudChjaGlsZHJlbjogTWFya2VyW10sIHBhcmVudDogTWFya2VyKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdGNoaWxkLnBhcmVudCA9IHBhcmVudDtcblx0XHRcdFx0X2ZpeFBhcmVudChjaGlsZC5jaGlsZHJlbiwgY2hpbGQpO1xuXHRcdFx0fVxuXHRcdH0pKG90aGVycywgcGFyZW50KTtcblx0fVxuXG5cdGdldCBjaGlsZHJlbigpOiBNYXJrZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoaWxkcmVuO1xuXHR9XG5cblx0Z2V0IHJpZ2h0TW9zdERlc2NlbmRhbnQoKTogTWFya2VyIHtcblx0XHRpZiAodGhpcy5fY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoaWxkcmVuW3RoaXMuX2NoaWxkcmVuLmxlbmd0aCAtIDFdLnJpZ2h0TW9zdERlc2NlbmRhbnQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0Z2V0IHNuaXBwZXQoKTogVGV4dG1hdGVTbmlwcGV0IHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgY2FuZGlkYXRlOiBNYXJrZXIgPSB0aGlzO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNhbmRpZGF0ZSBpbnN0YW5jZW9mIFRleHRtYXRlU25pcHBldCkge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdFx0Y2FuZGlkYXRlID0gY2FuZGlkYXRlLnBhcmVudDtcblx0XHR9XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLnJlZHVjZSgocHJldiwgY3VyKSA9PiBwcmV2ICsgY3VyLnRvU3RyaW5nKCksICcnKTtcblx0fVxuXG5cdGFic3RyYWN0IHRvVGV4dG1hdGVTdHJpbmcoKTogc3RyaW5nO1xuXG5cdGxlbigpOiBudW1iZXIge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0YWJzdHJhY3QgY2xvbmUoKTogTWFya2VyO1xufVxuXG5leHBvcnQgY2xhc3MgVGV4dCBleHRlbmRzIE1hcmtlciB7XG5cblx0c3RhdGljIGVzY2FwZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvXFwkfH18XFxcXC9nLCAnXFxcXCQmJyk7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWU7XG5cdH1cblx0dG9UZXh0bWF0ZVN0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBUZXh0LmVzY2FwZSh0aGlzLnZhbHVlKTtcblx0fVxuXHRvdmVycmlkZSBsZW4oKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZS5sZW5ndGg7XG5cdH1cblx0Y2xvbmUoKTogVGV4dCB7XG5cdFx0cmV0dXJuIG5ldyBUZXh0KHRoaXMudmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBUcmFuc2Zvcm1hYmxlTWFya2VyIGV4dGVuZHMgTWFya2VyIHtcblx0cHVibGljIHRyYW5zZm9ybT86IFRyYW5zZm9ybTtcbn1cblxuZXhwb3J0IGNsYXNzIFBsYWNlaG9sZGVyIGV4dGVuZHMgVHJhbnNmb3JtYWJsZU1hcmtlciB7XG5cdHN0YXRpYyBjb21wYXJlQnlJbmRleChhOiBQbGFjZWhvbGRlciwgYjogUGxhY2Vob2xkZXIpOiBudW1iZXIge1xuXHRcdGlmIChhLmluZGV4ID09PSBiLmluZGV4KSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9IGVsc2UgaWYgKGEuaXNGaW5hbFRhYnN0b3ApIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH0gZWxzZSBpZiAoYi5pc0ZpbmFsVGFic3RvcCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH0gZWxzZSBpZiAoYS5pbmRleCA8IGIuaW5kZXgpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2UgaWYgKGEuaW5kZXggPiBiLmluZGV4KSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IocHVibGljIGluZGV4OiBudW1iZXIpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0IGlzRmluYWxUYWJzdG9wKCkge1xuXHRcdHJldHVybiB0aGlzLmluZGV4ID09PSAwO1xuXHR9XG5cblx0Z2V0IGNob2ljZSgpOiBDaG9pY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGlsZHJlbi5sZW5ndGggPT09IDEgJiYgdGhpcy5fY2hpbGRyZW5bMF0gaW5zdGFuY2VvZiBDaG9pY2Vcblx0XHRcdD8gdGhpcy5fY2hpbGRyZW5bMF1cblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cblx0dG9UZXh0bWF0ZVN0cmluZygpOiBzdHJpbmcge1xuXHRcdGxldCB0cmFuc2Zvcm1TdHJpbmcgPSAnJztcblx0XHRpZiAodGhpcy50cmFuc2Zvcm0pIHtcblx0XHRcdHRyYW5zZm9ybVN0cmluZyA9IHRoaXMudHJhbnNmb3JtLnRvVGV4dG1hdGVTdHJpbmcoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwICYmICF0aGlzLnRyYW5zZm9ybSkge1xuXHRcdFx0cmV0dXJuIGBcXCQke3RoaXMuaW5kZXh9YDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gYFxcJHske3RoaXMuaW5kZXh9JHt0cmFuc2Zvcm1TdHJpbmd9fWA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmNob2ljZSkge1xuXHRcdFx0cmV0dXJuIGBcXCR7JHt0aGlzLmluZGV4fXwke3RoaXMuY2hvaWNlLnRvVGV4dG1hdGVTdHJpbmcoKX18JHt0cmFuc2Zvcm1TdHJpbmd9fWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBgXFwkeyR7dGhpcy5pbmRleH06JHt0aGlzLmNoaWxkcmVuLm1hcChjaGlsZCA9PiBjaGlsZC50b1RleHRtYXRlU3RyaW5nKCkpLmpvaW4oJycpfSR7dHJhbnNmb3JtU3RyaW5nfX1gO1xuXHRcdH1cblx0fVxuXG5cdGNsb25lKCk6IFBsYWNlaG9sZGVyIHtcblx0XHRjb25zdCByZXQgPSBuZXcgUGxhY2Vob2xkZXIodGhpcy5pbmRleCk7XG5cdFx0aWYgKHRoaXMudHJhbnNmb3JtKSB7XG5cdFx0XHRyZXQudHJhbnNmb3JtID0gdGhpcy50cmFuc2Zvcm0uY2xvbmUoKTtcblx0XHR9XG5cdFx0cmV0Ll9jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW4ubWFwKGNoaWxkID0+IGNoaWxkLmNsb25lKCkpO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENob2ljZSBleHRlbmRzIE1hcmtlciB7XG5cblx0cmVhZG9ubHkgb3B0aW9uczogVGV4dFtdID0gW107XG5cblx0b3ZlcnJpZGUgYXBwZW5kQ2hpbGQobWFya2VyOiBNYXJrZXIpOiB0aGlzIHtcblx0XHRpZiAobWFya2VyIGluc3RhbmNlb2YgVGV4dCkge1xuXHRcdFx0bWFya2VyLnBhcmVudCA9IHRoaXM7XG5cdFx0XHR0aGlzLm9wdGlvbnMucHVzaChtYXJrZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCkge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnNbMF0udmFsdWU7XG5cdH1cblxuXHR0b1RleHRtYXRlU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9uc1xuXHRcdFx0Lm1hcChvcHRpb24gPT4gb3B0aW9uLnZhbHVlLnJlcGxhY2UoL1xcfHwsfFxcXFwvZywgJ1xcXFwkJicpKVxuXHRcdFx0LmpvaW4oJywnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGxlbigpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnNbMF0ubGVuKCk7XG5cdH1cblxuXHRjbG9uZSgpOiBDaG9pY2Uge1xuXHRcdGNvbnN0IHJldCA9IG5ldyBDaG9pY2UoKTtcblx0XHR0aGlzLm9wdGlvbnMuZm9yRWFjaChyZXQuYXBwZW5kQ2hpbGQsIHJldCk7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHJhbnNmb3JtIGV4dGVuZHMgTWFya2VyIHtcblxuXHRyZWdleHA6IFJlZ0V4cCA9IG5ldyBSZWdFeHAoJycpO1xuXG5cdHJlc29sdmUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgX3RoaXMgPSB0aGlzO1xuXHRcdGxldCBkaWRNYXRjaCA9IGZhbHNlO1xuXHRcdGxldCByZXQgPSB2YWx1ZS5yZXBsYWNlKHRoaXMucmVnZXhwLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRkaWRNYXRjaCA9IHRydWU7XG5cdFx0XHRyZXR1cm4gX3RoaXMuX3JlcGxhY2UoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwLCAtMikpO1xuXHRcdH0pO1xuXHRcdC8vIHdoZW4gdGhlIHJlZ2V4IGRpZG4ndCBtYXRjaCBhbmQgd2hlbiB0aGUgdHJhbnNmb3JtIGhhc1xuXHRcdC8vIGVsc2UgYnJhbmNoZXMsIHRoZW4gcnVuIHRob3NlXG5cdFx0aWYgKCFkaWRNYXRjaCAmJiB0aGlzLl9jaGlsZHJlbi5zb21lKGNoaWxkID0+IGNoaWxkIGluc3RhbmNlb2YgRm9ybWF0U3RyaW5nICYmIEJvb2xlYW4oY2hpbGQuZWxzZVZhbHVlKSkpIHtcblx0XHRcdHJldCA9IHRoaXMuX3JlcGxhY2UoW10pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwbGFjZShncm91cHM6IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRsZXQgcmV0ID0gJyc7XG5cdFx0Zm9yIChjb25zdCBtYXJrZXIgb2YgdGhpcy5fY2hpbGRyZW4pIHtcblx0XHRcdGlmIChtYXJrZXIgaW5zdGFuY2VvZiBGb3JtYXRTdHJpbmcpIHtcblx0XHRcdFx0bGV0IHZhbHVlID0gZ3JvdXBzW21hcmtlci5pbmRleF0gfHwgJyc7XG5cdFx0XHRcdHZhbHVlID0gbWFya2VyLnJlc29sdmUodmFsdWUpO1xuXHRcdFx0XHRyZXQgKz0gdmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXQgKz0gbWFya2VyLnRvU3RyaW5nKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHRvVGV4dG1hdGVTdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYC8ke3RoaXMucmVnZXhwLnNvdXJjZX0vJHt0aGlzLmNoaWxkcmVuLm1hcChjID0+IGMudG9UZXh0bWF0ZVN0cmluZygpKS5qb2luKCcnKX0vJHsodGhpcy5yZWdleHAuaWdub3JlQ2FzZSA/ICdpJyA6ICcnKSArICh0aGlzLnJlZ2V4cC5nbG9iYWwgPyAnZycgOiAnJyl9YDtcblx0fVxuXG5cdGNsb25lKCk6IFRyYW5zZm9ybSB7XG5cdFx0Y29uc3QgcmV0ID0gbmV3IFRyYW5zZm9ybSgpO1xuXHRcdHJldC5yZWdleHAgPSBuZXcgUmVnRXhwKHRoaXMucmVnZXhwLnNvdXJjZSwgJycgKyAodGhpcy5yZWdleHAuaWdub3JlQ2FzZSA/ICdpJyA6ICcnKSArICh0aGlzLnJlZ2V4cC5nbG9iYWwgPyAnZycgOiAnJykpO1xuXHRcdHJldC5fY2hpbGRyZW4gPSB0aGlzLmNoaWxkcmVuLm1hcChjaGlsZCA9PiBjaGlsZC5jbG9uZSgpKTtcblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEZvcm1hdFN0cmluZyBleHRlbmRzIE1hcmtlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcixcblx0XHRyZWFkb25seSBzaG9ydGhhbmROYW1lPzogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGlmVmFsdWU/OiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZWxzZVZhbHVlPzogc3RyaW5nLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVzb2x2ZSh2YWx1ZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuc2hvcnRoYW5kTmFtZSA9PT0gJ3VwY2FzZScpIHtcblx0XHRcdHJldHVybiAhdmFsdWUgPyAnJyA6IHZhbHVlLnRvTG9jYWxlVXBwZXJDYXNlKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNob3J0aGFuZE5hbWUgPT09ICdkb3duY2FzZScpIHtcblx0XHRcdHJldHVybiAhdmFsdWUgPyAnJyA6IHZhbHVlLnRvTG9jYWxlTG93ZXJDYXNlKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNob3J0aGFuZE5hbWUgPT09ICdjYXBpdGFsaXplJykge1xuXHRcdFx0cmV0dXJuICF2YWx1ZSA/ICcnIDogKHZhbHVlWzBdLnRvTG9jYWxlVXBwZXJDYXNlKCkgKyB2YWx1ZS5zdWJzdHIoMSkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zaG9ydGhhbmROYW1lID09PSAncGFzY2FsY2FzZScpIHtcblx0XHRcdHJldHVybiAhdmFsdWUgPyAnJyA6IHRoaXMuX3RvUGFzY2FsQ2FzZSh2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNob3J0aGFuZE5hbWUgPT09ICdjYW1lbGNhc2UnKSB7XG5cdFx0XHRyZXR1cm4gIXZhbHVlID8gJycgOiB0aGlzLl90b0NhbWVsQ2FzZSh2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNob3J0aGFuZE5hbWUgPT09ICdrZWJhYmNhc2UnKSB7XG5cdFx0XHRyZXR1cm4gIXZhbHVlID8gJycgOiB0aGlzLl90b0tlYmFiQ2FzZSh2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNob3J0aGFuZE5hbWUgPT09ICdzbmFrZWNhc2UnKSB7XG5cdFx0XHRyZXR1cm4gIXZhbHVlID8gJycgOiB0aGlzLl90b1NuYWtlQ2FzZSh2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmIChCb29sZWFuKHZhbHVlKSAmJiB0eXBlb2YgdGhpcy5pZlZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuaWZWYWx1ZTtcblx0XHR9IGVsc2UgaWYgKCFCb29sZWFuKHZhbHVlKSAmJiB0eXBlb2YgdGhpcy5lbHNlVmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lbHNlVmFsdWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB2YWx1ZSB8fCAnJztcblx0XHR9XG5cdH1cblxuXHQvLyBOb3RlOiB3b3JkLWJhc2VkIGNhc2UgdHJhbnNmb3JtcyByZWx5IG9uIHVwcGVyY2FzZS9sb3dlcmNhc2UgZGlzdGluY3Rpb25zLlxuXHQvLyBGb3Igc2NyaXB0cyB3aXRob3V0IGNhc2UsIHRyYW5zZm9ybXMgYXJlIGVmZmVjdGl2ZWx5IG5vLW9wcy5cblx0cHJpdmF0ZSBfdG9LZWJhYkNhc2UodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvW1xccHtMfTAtOV0rL2d1KTtcblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXG5cdFx0aWYgKCF2YWx1ZS5tYXRjaCgvW1xccHtMfTAtOV0vdSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZVxuXHRcdFx0XHQudHJpbSgpXG5cdFx0XHRcdC50b0xvd2VyQ2FzZSgpXG5cdFx0XHRcdC5yZXBsYWNlKC9eXyt8XyskL2csICcnKVxuXHRcdFx0XHQucmVwbGFjZSgvW1xcc19dKy9nLCAnLScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsZWFuZWQgPSB2YWx1ZS50cmltKCkucmVwbGFjZSgvXl8rfF8rJC9nLCAnJyk7XG5cblx0XHRjb25zdCBtYXRjaDIgPSBjbGVhbmVkLm1hdGNoKC9cXHB7THV9ezIsfSg/PVxccHtMdX1cXHB7TGx9K1swLTldKnxbXFxzXy1dfCQpfFxccHtMdX0/XFxwe0xsfStbMC05XSp8XFxwe0x1fSg/PVxccHtMdX1cXHB7TGx9KXxcXHB7THV9KD89W1xcc18tXXwkKXxbMC05XSsvZ3UpO1xuXG5cdFx0aWYgKCFtYXRjaDIpIHtcblx0XHRcdHJldHVybiBjbGVhbmVkXG5cdFx0XHRcdC5zcGxpdCgvW1xcc18tXSsvKVxuXHRcdFx0XHQuZmlsdGVyKHdvcmQgPT4gd29yZC5sZW5ndGggPiAwKVxuXHRcdFx0XHQubWFwKHdvcmQgPT4gd29yZC50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0XHQuam9pbignLScpO1xuXHRcdH1cblxuXHRcdHJldHVybiBtYXRjaDJcblx0XHRcdC5tYXAoeCA9PiB4LnRvTG93ZXJDYXNlKCkpXG5cdFx0XHQuam9pbignLScpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9QYXNjYWxDYXNlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL1tcXHB7TH0wLTldKy9ndSk7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2gubWFwKHdvcmQgPT4ge1xuXHRcdFx0cmV0dXJuIHdvcmQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnN1YnN0cigxKTtcblx0XHR9KVxuXHRcdFx0LmpvaW4oJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9DYW1lbENhc2UodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvW1xccHtMfTAtOV0rL2d1KTtcblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaC5tYXAoKHdvcmQsIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHdvcmQuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyB3b3JkLnN1YnN0cigxKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB3b3JkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgd29yZC5zdWJzdHIoMSk7XG5cdFx0fSlcblx0XHRcdC5qb2luKCcnKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU25ha2VDYXNlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB2YWx1ZS5yZXBsYWNlKC8oXFxwe0xsfSkoXFxwe0x1fSkvZ3UsICckMV8kMicpXG5cdFx0XHQucmVwbGFjZSgvW1xcc1xcLV0rL2csICdfJylcblx0XHRcdC50b0xvd2VyQ2FzZSgpO1xuXHR9XG5cblx0dG9UZXh0bWF0ZVN0cmluZygpOiBzdHJpbmcge1xuXHRcdGxldCB2YWx1ZSA9ICckeyc7XG5cdFx0dmFsdWUgKz0gdGhpcy5pbmRleDtcblx0XHRpZiAodGhpcy5zaG9ydGhhbmROYW1lKSB7XG5cdFx0XHR2YWx1ZSArPSBgOi8ke3RoaXMuc2hvcnRoYW5kTmFtZX1gO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLmlmVmFsdWUgJiYgdGhpcy5lbHNlVmFsdWUpIHtcblx0XHRcdHZhbHVlICs9IGA6PyR7dGhpcy5pZlZhbHVlfToke3RoaXMuZWxzZVZhbHVlfWA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmlmVmFsdWUpIHtcblx0XHRcdHZhbHVlICs9IGA6KyR7dGhpcy5pZlZhbHVlfWA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmVsc2VWYWx1ZSkge1xuXHRcdFx0dmFsdWUgKz0gYDotJHt0aGlzLmVsc2VWYWx1ZX1gO1xuXHRcdH1cblx0XHR2YWx1ZSArPSAnfSc7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0Y2xvbmUoKTogRm9ybWF0U3RyaW5nIHtcblx0XHRjb25zdCByZXQgPSBuZXcgRm9ybWF0U3RyaW5nKHRoaXMuaW5kZXgsIHRoaXMuc2hvcnRoYW5kTmFtZSwgdGhpcy5pZlZhbHVlLCB0aGlzLmVsc2VWYWx1ZSk7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVmFyaWFibGUgZXh0ZW5kcyBUcmFuc2Zvcm1hYmxlTWFya2VyIHtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgbmFtZTogc3RyaW5nKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlc29sdmUocmVzb2x2ZXI6IFZhcmlhYmxlUmVzb2x2ZXIpOiBib29sZWFuIHtcblx0XHRsZXQgdmFsdWUgPSByZXNvbHZlci5yZXNvbHZlKHRoaXMpO1xuXHRcdGlmICh0aGlzLnRyYW5zZm9ybSkge1xuXHRcdFx0dmFsdWUgPSB0aGlzLnRyYW5zZm9ybS5yZXNvbHZlKHZhbHVlIHx8ICcnKTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2NoaWxkcmVuID0gW25ldyBUZXh0KHZhbHVlKV07XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0dG9UZXh0bWF0ZVN0cmluZygpOiBzdHJpbmcge1xuXHRcdGxldCB0cmFuc2Zvcm1TdHJpbmcgPSAnJztcblx0XHRpZiAodGhpcy50cmFuc2Zvcm0pIHtcblx0XHRcdHRyYW5zZm9ybVN0cmluZyA9IHRoaXMudHJhbnNmb3JtLnRvVGV4dG1hdGVTdHJpbmcoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gYFxcJHske3RoaXMubmFtZX0ke3RyYW5zZm9ybVN0cmluZ319YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGBcXCR7JHt0aGlzLm5hbWV9OiR7dGhpcy5jaGlsZHJlbi5tYXAoY2hpbGQgPT4gY2hpbGQudG9UZXh0bWF0ZVN0cmluZygpKS5qb2luKCcnKX0ke3RyYW5zZm9ybVN0cmluZ319YDtcblx0XHR9XG5cdH1cblxuXHRjbG9uZSgpOiBWYXJpYWJsZSB7XG5cdFx0Y29uc3QgcmV0ID0gbmV3IFZhcmlhYmxlKHRoaXMubmFtZSk7XG5cdFx0aWYgKHRoaXMudHJhbnNmb3JtKSB7XG5cdFx0XHRyZXQudHJhbnNmb3JtID0gdGhpcy50cmFuc2Zvcm0uY2xvbmUoKTtcblx0XHR9XG5cdFx0cmV0Ll9jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW4ubWFwKGNoaWxkID0+IGNoaWxkLmNsb25lKCkpO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBWYXJpYWJsZVJlc29sdmVyIHtcblx0cmVzb2x2ZSh2YXJpYWJsZTogVmFyaWFibGUpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHdhbGsobWFya2VyOiBNYXJrZXJbXSwgdmlzaXRvcjogKG1hcmtlcjogTWFya2VyKSA9PiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IHN0YWNrID0gWy4uLm1hcmtlcl07XG5cdHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgbWFya2VyID0gc3RhY2suc2hpZnQoKSE7XG5cdFx0Y29uc3QgcmVjdXJzZSA9IHZpc2l0b3IobWFya2VyKTtcblx0XHRpZiAoIXJlY3Vyc2UpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRzdGFjay51bnNoaWZ0KC4uLm1hcmtlci5jaGlsZHJlbik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRleHRtYXRlU25pcHBldCBleHRlbmRzIE1hcmtlciB7XG5cblx0cHJpdmF0ZSBfcGxhY2Vob2xkZXJzPzogeyBhbGw6IFBsYWNlaG9sZGVyW107IGxhc3Q/OiBQbGFjZWhvbGRlciB9O1xuXG5cdGdldCBwbGFjZWhvbGRlckluZm8oKSB7XG5cdFx0aWYgKCF0aGlzLl9wbGFjZWhvbGRlcnMpIHtcblx0XHRcdC8vIGZpbGwgaW4gcGxhY2Vob2xkZXJzXG5cdFx0XHRjb25zdCBhbGw6IFBsYWNlaG9sZGVyW10gPSBbXTtcblx0XHRcdGxldCBsYXN0OiBQbGFjZWhvbGRlciB8IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMud2FsayhmdW5jdGlvbiAoY2FuZGlkYXRlKSB7XG5cdFx0XHRcdGlmIChjYW5kaWRhdGUgaW5zdGFuY2VvZiBQbGFjZWhvbGRlcikge1xuXHRcdFx0XHRcdGFsbC5wdXNoKGNhbmRpZGF0ZSk7XG5cdFx0XHRcdFx0bGFzdCA9ICFsYXN0IHx8IGxhc3QuaW5kZXggPCBjYW5kaWRhdGUuaW5kZXggPyBjYW5kaWRhdGUgOiBsYXN0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9wbGFjZWhvbGRlcnMgPSB7IGFsbCwgbGFzdCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGxhY2Vob2xkZXJzO1xuXHR9XG5cblx0Z2V0IHBsYWNlaG9sZGVycygpOiBQbGFjZWhvbGRlcltdIHtcblx0XHRjb25zdCB7IGFsbCB9ID0gdGhpcy5wbGFjZWhvbGRlckluZm87XG5cdFx0cmV0dXJuIGFsbDtcblx0fVxuXG5cdG9mZnNldChtYXJrZXI6IE1hcmtlcik6IG51bWJlciB7XG5cdFx0bGV0IHBvcyA9IDA7XG5cdFx0bGV0IGZvdW5kID0gZmFsc2U7XG5cdFx0dGhpcy53YWxrKGNhbmRpZGF0ZSA9PiB7XG5cdFx0XHRpZiAoY2FuZGlkYXRlID09PSBtYXJrZXIpIHtcblx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRwb3MgKz0gY2FuZGlkYXRlLmxlbigpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiBwb3M7XG5cdH1cblxuXHRmdWxsTGVuKG1hcmtlcjogTWFya2VyKTogbnVtYmVyIHtcblx0XHRsZXQgcmV0ID0gMDtcblx0XHR3YWxrKFttYXJrZXJdLCBtYXJrZXIgPT4ge1xuXHRcdFx0cmV0ICs9IG1hcmtlci5sZW4oKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRlbmNsb3NpbmdQbGFjZWhvbGRlcnMocGxhY2Vob2xkZXI6IFBsYWNlaG9sZGVyKTogUGxhY2Vob2xkZXJbXSB7XG5cdFx0Y29uc3QgcmV0OiBQbGFjZWhvbGRlcltdID0gW107XG5cdFx0bGV0IHsgcGFyZW50IH0gPSBwbGFjZWhvbGRlcjtcblx0XHR3aGlsZSAocGFyZW50KSB7XG5cdFx0XHRpZiAocGFyZW50IGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpIHtcblx0XHRcdFx0cmV0LnB1c2gocGFyZW50KTtcblx0XHRcdH1cblx0XHRcdHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRyZXNvbHZlVmFyaWFibGVzKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyKTogdGhpcyB7XG5cdFx0dGhpcy53YWxrKGNhbmRpZGF0ZSA9PiB7XG5cdFx0XHRpZiAoY2FuZGlkYXRlIGluc3RhbmNlb2YgVmFyaWFibGUpIHtcblx0XHRcdFx0aWYgKGNhbmRpZGF0ZS5yZXNvbHZlKHJlc29sdmVyKSkge1xuXHRcdFx0XHRcdHRoaXMuX3BsYWNlaG9sZGVycyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRvdmVycmlkZSBhcHBlbmRDaGlsZChjaGlsZDogTWFya2VyKSB7XG5cdFx0dGhpcy5fcGxhY2Vob2xkZXJzID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiBzdXBlci5hcHBlbmRDaGlsZChjaGlsZCk7XG5cdH1cblxuXHRvdmVycmlkZSByZXBsYWNlKGNoaWxkOiBNYXJrZXIsIG90aGVyczogTWFya2VyW10pOiB2b2lkIHtcblx0XHR0aGlzLl9wbGFjZWhvbGRlcnMgPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHN1cGVyLnJlcGxhY2UoY2hpbGQsIG90aGVycyk7XG5cdH1cblxuXHR0b1RleHRtYXRlU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4ucmVkdWNlKChwcmV2LCBjdXIpID0+IHByZXYgKyBjdXIudG9UZXh0bWF0ZVN0cmluZygpLCAnJyk7XG5cdH1cblxuXHRjbG9uZSgpOiBUZXh0bWF0ZVNuaXBwZXQge1xuXHRcdGNvbnN0IHJldCA9IG5ldyBUZXh0bWF0ZVNuaXBwZXQoKTtcblx0XHRyZXQuX2NoaWxkcmVuID0gdGhpcy5jaGlsZHJlbi5tYXAoY2hpbGQgPT4gY2hpbGQuY2xvbmUoKSk7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHdhbGsodmlzaXRvcjogKG1hcmtlcjogTWFya2VyKSA9PiBib29sZWFuKTogdm9pZCB7XG5cdFx0d2Fsayh0aGlzLmNoaWxkcmVuLCB2aXNpdG9yKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldFBhcnNlciB7XG5cblx0c3RhdGljIGVzY2FwZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvXFwkfH18XFxcXC9nLCAnXFxcXCQmJyk7XG5cdH1cblxuXHQvKipcblx0ICogVGFrZXMgYSBzbmlwcGV0IGFuZCByZXR1cm5zIHRoZSBpbnNlcnRhYmxlIHN0cmluZywgZS5nIHJldHVybiB0aGUgc25pcHBldC1zdHJpbmdcblx0ICogd2l0aG91dCBhbnkgcGxhY2Vob2xkZXIsIHRhYnN0b3AsIHZhcmlhYmxlcyBldGMuLi5cblx0ICovXG5cdHN0YXRpYyBhc0luc2VydFRleHQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UodmFsdWUpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRzdGF0aWMgZ3Vlc3NOZWVkc0NsaXBib2FyZCh0ZW1wbGF0ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9cXCR7P0NMSVBCT0FSRC8udGVzdCh0ZW1wbGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2FubmVyOiBTY2FubmVyID0gbmV3IFNjYW5uZXIoKTtcblx0cHJpdmF0ZSBfdG9rZW46IFRva2VuID0geyB0eXBlOiBUb2tlblR5cGUuRU9GLCBwb3M6IDAsIGxlbjogMCB9O1xuXG5cdHBhcnNlKHZhbHVlOiBzdHJpbmcsIGluc2VydEZpbmFsVGFic3RvcD86IGJvb2xlYW4sIGVuZm9yY2VGaW5hbFRhYnN0b3A/OiBib29sZWFuKTogVGV4dG1hdGVTbmlwcGV0IHtcblx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFRleHRtYXRlU25pcHBldCgpO1xuXHRcdHRoaXMucGFyc2VGcmFnbWVudCh2YWx1ZSwgc25pcHBldCk7XG5cdFx0dGhpcy5lbnN1cmVGaW5hbFRhYnN0b3Aoc25pcHBldCwgZW5mb3JjZUZpbmFsVGFic3RvcCA/PyBmYWxzZSwgaW5zZXJ0RmluYWxUYWJzdG9wID8/IGZhbHNlKTtcblx0XHRyZXR1cm4gc25pcHBldDtcblx0fVxuXG5cdHBhcnNlRnJhZ21lbnQodmFsdWU6IHN0cmluZywgc25pcHBldDogVGV4dG1hdGVTbmlwcGV0KTogcmVhZG9ubHkgTWFya2VyW10ge1xuXG5cdFx0Y29uc3Qgb2Zmc2V0ID0gc25pcHBldC5jaGlsZHJlbi5sZW5ndGg7XG5cdFx0dGhpcy5fc2Nhbm5lci50ZXh0KHZhbHVlKTtcblx0XHR0aGlzLl90b2tlbiA9IHRoaXMuX3NjYW5uZXIubmV4dCgpO1xuXHRcdHdoaWxlICh0aGlzLl9wYXJzZShzbmlwcGV0KSkge1xuXHRcdFx0Ly8gbm90aGluZ1xuXHRcdH1cblxuXHRcdC8vIGZpbGwgaW4gdmFsdWVzIGZvciBwbGFjZWhvbGRlcnMuIHRoZSBmaXJzdCBwbGFjZWhvbGRlciBvZiBhbiBpbmRleFxuXHRcdC8vIHRoYXQgaGFzIGEgdmFsdWUgZGVmaW5lcyB0aGUgdmFsdWUgZm9yIGFsbCBwbGFjZWhvbGRlcnMgd2l0aCB0aGF0IGluZGV4XG5cdFx0Y29uc3QgcGxhY2Vob2xkZXJEZWZhdWx0VmFsdWVzID0gbmV3IE1hcDxudW1iZXIsIE1hcmtlcltdIHwgdW5kZWZpbmVkPigpO1xuXHRcdGNvbnN0IGluY29tcGxldGVQbGFjZWhvbGRlcnM6IFBsYWNlaG9sZGVyW10gPSBbXTtcblx0XHRzbmlwcGV0LndhbGsobWFya2VyID0+IHtcblx0XHRcdGlmIChtYXJrZXIgaW5zdGFuY2VvZiBQbGFjZWhvbGRlcikge1xuXHRcdFx0XHRpZiAobWFya2VyLmlzRmluYWxUYWJzdG9wKSB7XG5cdFx0XHRcdFx0cGxhY2Vob2xkZXJEZWZhdWx0VmFsdWVzLnNldCgwLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFwbGFjZWhvbGRlckRlZmF1bHRWYWx1ZXMuaGFzKG1hcmtlci5pbmRleCkgJiYgbWFya2VyLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRwbGFjZWhvbGRlckRlZmF1bHRWYWx1ZXMuc2V0KG1hcmtlci5pbmRleCwgbWFya2VyLmNoaWxkcmVuKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbmNvbXBsZXRlUGxhY2Vob2xkZXJzLnB1c2gobWFya2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBmaWxsSW5JbmNvbXBsZXRlUGxhY2Vob2xkZXIgPSAocGxhY2Vob2xkZXI6IFBsYWNlaG9sZGVyLCBzdGFjazogU2V0PG51bWJlcj4pID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRWYWx1ZXMgPSBwbGFjZWhvbGRlckRlZmF1bHRWYWx1ZXMuZ2V0KHBsYWNlaG9sZGVyLmluZGV4KTtcblx0XHRcdGlmICghZGVmYXVsdFZhbHVlcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjbG9uZSA9IG5ldyBQbGFjZWhvbGRlcihwbGFjZWhvbGRlci5pbmRleCk7XG5cdFx0XHRjbG9uZS50cmFuc2Zvcm0gPSBwbGFjZWhvbGRlci50cmFuc2Zvcm07XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGRlZmF1bHRWYWx1ZXMpIHtcblx0XHRcdFx0Y29uc3QgbmV3Q2hpbGQgPSBjaGlsZC5jbG9uZSgpO1xuXHRcdFx0XHRjbG9uZS5hcHBlbmRDaGlsZChuZXdDaGlsZCk7XG5cblx0XHRcdFx0Ly8gXCJyZWN1cnNlXCIgb24gY2hpbGRyZW4gdGhhdCBhcmUgYWdhaW4gcGxhY2Vob2xkZXJzXG5cdFx0XHRcdGlmIChuZXdDaGlsZCBpbnN0YW5jZW9mIFBsYWNlaG9sZGVyICYmIHBsYWNlaG9sZGVyRGVmYXVsdFZhbHVlcy5oYXMobmV3Q2hpbGQuaW5kZXgpICYmICFzdGFjay5oYXMobmV3Q2hpbGQuaW5kZXgpKSB7XG5cdFx0XHRcdFx0c3RhY2suYWRkKG5ld0NoaWxkLmluZGV4KTtcblx0XHRcdFx0XHRmaWxsSW5JbmNvbXBsZXRlUGxhY2Vob2xkZXIobmV3Q2hpbGQsIHN0YWNrKTtcblx0XHRcdFx0XHRzdGFjay5kZWxldGUobmV3Q2hpbGQuaW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRzbmlwcGV0LnJlcGxhY2UocGxhY2Vob2xkZXIsIFtjbG9uZV0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBzdGFjayA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgcGxhY2Vob2xkZXIgb2YgaW5jb21wbGV0ZVBsYWNlaG9sZGVycykge1xuXHRcdFx0ZmlsbEluSW5jb21wbGV0ZVBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyLCBzdGFjayk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNuaXBwZXQuY2hpbGRyZW4uc2xpY2Uob2Zmc2V0KTtcblx0fVxuXG5cdGVuc3VyZUZpbmFsVGFic3RvcChzbmlwcGV0OiBUZXh0bWF0ZVNuaXBwZXQsIGVuZm9yY2VGaW5hbFRhYnN0b3A6IGJvb2xlYW4sIGluc2VydEZpbmFsVGFic3RvcDogYm9vbGVhbikge1xuXG5cdFx0aWYgKGVuZm9yY2VGaW5hbFRhYnN0b3AgfHwgaW5zZXJ0RmluYWxUYWJzdG9wICYmIHNuaXBwZXQucGxhY2Vob2xkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGZpbmFsVGFic3RvcCA9IHNuaXBwZXQucGxhY2Vob2xkZXJzLmZpbmQocCA9PiBwLmluZGV4ID09PSAwKTtcblx0XHRcdGlmICghZmluYWxUYWJzdG9wKSB7XG5cdFx0XHRcdC8vIHRoZSBzbmlwcGV0IHVzZXMgcGxhY2Vob2xkZXJzIGJ1dCBoYXMgbm9cblx0XHRcdFx0Ly8gZmluYWwgdGFic3RvcCBkZWZpbmVkIC0+IGluc2VydCBhdCB0aGUgZW5kXG5cdFx0XHRcdHNuaXBwZXQuYXBwZW5kQ2hpbGQobmV3IFBsYWNlaG9sZGVyKDApKTtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgX2FjY2VwdCh0eXBlPzogVG9rZW5UeXBlKTogYm9vbGVhbjtcblx0cHJpdmF0ZSBfYWNjZXB0KHR5cGU6IFRva2VuVHlwZSB8IHVuZGVmaW5lZCwgdmFsdWU6IHRydWUpOiBzdHJpbmc7XG5cdHByaXZhdGUgX2FjY2VwdCh0eXBlOiBUb2tlblR5cGUsIHZhbHVlPzogYm9vbGVhbik6IGJvb2xlYW4gfCBzdHJpbmcge1xuXHRcdGlmICh0eXBlID09PSB1bmRlZmluZWQgfHwgdGhpcy5fdG9rZW4udHlwZSA9PT0gdHlwZSkge1xuXHRcdFx0Y29uc3QgcmV0ID0gIXZhbHVlID8gdHJ1ZSA6IHRoaXMuX3NjYW5uZXIudG9rZW5UZXh0KHRoaXMuX3Rva2VuKTtcblx0XHRcdHRoaXMuX3Rva2VuID0gdGhpcy5fc2Nhbm5lci5uZXh0KCk7XG5cdFx0XHRyZXR1cm4gcmV0O1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9iYWNrVG8odG9rZW46IFRva2VuKTogZmFsc2Uge1xuXHRcdHRoaXMuX3NjYW5uZXIucG9zID0gdG9rZW4ucG9zICsgdG9rZW4ubGVuO1xuXHRcdHRoaXMuX3Rva2VuID0gdG9rZW47XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdW50aWwodHlwZTogVG9rZW5UeXBlKTogZmFsc2UgfCBzdHJpbmcge1xuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5fdG9rZW47XG5cdFx0d2hpbGUgKHRoaXMuX3Rva2VuLnR5cGUgIT09IHR5cGUpIHtcblx0XHRcdGlmICh0aGlzLl90b2tlbi50eXBlID09PSBUb2tlblR5cGUuRU9GKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fdG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkJhY2tzbGFzaCkge1xuXHRcdFx0XHRjb25zdCBuZXh0VG9rZW4gPSB0aGlzLl9zY2FubmVyLm5leHQoKTtcblx0XHRcdFx0aWYgKG5leHRUb2tlbi50eXBlICE9PSBUb2tlblR5cGUuRG9sbGFyXG5cdFx0XHRcdFx0JiYgbmV4dFRva2VuLnR5cGUgIT09IFRva2VuVHlwZS5DdXJseUNsb3NlXG5cdFx0XHRcdFx0JiYgbmV4dFRva2VuLnR5cGUgIT09IFRva2VuVHlwZS5CYWNrc2xhc2gpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rva2VuID0gdGhpcy5fc2Nhbm5lci5uZXh0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fc2Nhbm5lci52YWx1ZS5zdWJzdHJpbmcoc3RhcnQucG9zLCB0aGlzLl90b2tlbi5wb3MpLnJlcGxhY2UoL1xcXFwoXFwkfH18XFxcXCkvZywgJyQxJyk7XG5cdFx0dGhpcy5fdG9rZW4gPSB0aGlzLl9zY2FubmVyLm5leHQoKTtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9wYXJzZShtYXJrZXI6IE1hcmtlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wYXJzZUVzY2FwZWQobWFya2VyKVxuXHRcdFx0fHwgdGhpcy5fcGFyc2VUYWJzdG9wT3JWYXJpYWJsZU5hbWUobWFya2VyKVxuXHRcdFx0fHwgdGhpcy5fcGFyc2VDb21wbGV4UGxhY2Vob2xkZXIobWFya2VyKVxuXHRcdFx0fHwgdGhpcy5fcGFyc2VDb21wbGV4VmFyaWFibGUobWFya2VyKVxuXHRcdFx0fHwgdGhpcy5fcGFyc2VBbnl0aGluZyhtYXJrZXIpO1xuXHR9XG5cblx0Ly8gXFwkLCBcXFxcLCBcXH0gLT4ganVzdCB0ZXh0XG5cdHByaXZhdGUgX3BhcnNlRXNjYXBlZChtYXJrZXI6IE1hcmtlcik6IGJvb2xlYW4ge1xuXHRcdGxldCB2YWx1ZTogc3RyaW5nO1xuXHRcdGlmICh2YWx1ZSA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQmFja3NsYXNoLCB0cnVlKSkge1xuXHRcdFx0Ly8gc2F3IGEgYmFja3NsYXNoLCBhcHBlbmQgZXNjYXBlZCB0b2tlbiBvciB0aGF0IGJhY2tzbGFzaFxuXHRcdFx0dmFsdWUgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkRvbGxhciwgdHJ1ZSlcblx0XHRcdFx0fHwgdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseUNsb3NlLCB0cnVlKVxuXHRcdFx0XHR8fCB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkJhY2tzbGFzaCwgdHJ1ZSlcblx0XHRcdFx0fHwgdmFsdWU7XG5cblx0XHRcdG1hcmtlci5hcHBlbmRDaGlsZChuZXcgVGV4dCh2YWx1ZSkpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vICRmb28gLT4gdmFyaWFibGUsICQxIC0+IHRhYnN0b3Bcblx0cHJpdmF0ZSBfcGFyc2VUYWJzdG9wT3JWYXJpYWJsZU5hbWUocGFyZW50OiBNYXJrZXIpOiBib29sZWFuIHtcblx0XHRsZXQgdmFsdWU6IHN0cmluZztcblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX3Rva2VuO1xuXHRcdGNvbnN0IG1hdGNoID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Eb2xsYXIpXG5cdFx0XHQmJiAodmFsdWUgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSwgdHJ1ZSkgfHwgdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5JbnQsIHRydWUpKTtcblxuXHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdHJldHVybiB0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdH1cblxuXHRcdHBhcmVudC5hcHBlbmRDaGlsZCgvXlxcZCskLy50ZXN0KHZhbHVlISlcblx0XHRcdD8gbmV3IFBsYWNlaG9sZGVyKE51bWJlcih2YWx1ZSEpKVxuXHRcdFx0OiBuZXcgVmFyaWFibGUodmFsdWUhKVxuXHRcdCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAkezE6PGNoaWxkcmVuPn0sICR7MX0gLT4gcGxhY2Vob2xkZXJcblx0cHJpdmF0ZSBfcGFyc2VDb21wbGV4UGxhY2Vob2xkZXIocGFyZW50OiBNYXJrZXIpOiBib29sZWFuIHtcblx0XHRsZXQgaW5kZXg6IHN0cmluZztcblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX3Rva2VuO1xuXHRcdGNvbnN0IG1hdGNoID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Eb2xsYXIpXG5cdFx0XHQmJiB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkN1cmx5T3Blbilcblx0XHRcdCYmIChpbmRleCA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuSW50LCB0cnVlKSk7XG5cblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHR9XG5cblx0XHRjb25zdCBwbGFjZWhvbGRlciA9IG5ldyBQbGFjZWhvbGRlcihOdW1iZXIoaW5kZXghKSk7XG5cblx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Db2xvbikpIHtcblx0XHRcdC8vICR7MTo8Y2hpbGRyZW4+fVxuXHRcdFx0d2hpbGUgKHRydWUpIHtcblxuXHRcdFx0XHQvLyAuLi59IC0+IGRvbmVcblx0XHRcdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlDbG9zZSkpIHtcblx0XHRcdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQocGxhY2Vob2xkZXIpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX3BhcnNlKHBsYWNlaG9sZGVyKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gZmFsbGJhY2tcblx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKG5ldyBUZXh0KCckeycgKyBpbmRleCEgKyAnOicpKTtcblx0XHRcdFx0cGxhY2Vob2xkZXIuY2hpbGRyZW4uZm9yRWFjaChwYXJlbnQuYXBwZW5kQ2hpbGQsIHBhcmVudCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocGxhY2Vob2xkZXIuaW5kZXggPiAwICYmIHRoaXMuX2FjY2VwdChUb2tlblR5cGUuUGlwZSkpIHtcblx0XHRcdC8vICR7MXxvbmUsdHdvLHRocmVlfH1cblx0XHRcdGNvbnN0IGNob2ljZSA9IG5ldyBDaG9pY2UoKTtcblxuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3BhcnNlQ2hvaWNlRWxlbWVudChjaG9pY2UpKSB7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Db21tYSkpIHtcblx0XHRcdFx0XHRcdC8vIG9wdCwgLT4gbW9yZVxuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuUGlwZSkpIHtcblx0XHRcdFx0XHRcdHBsYWNlaG9sZGVyLmFwcGVuZENoaWxkKGNob2ljZSk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseUNsb3NlKSkge1xuXHRcdFx0XHRcdFx0XHQvLyAuLnx9IC0+IGRvbmVcblx0XHRcdFx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKHBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIGlmICh0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkZvcndhcmRzbGFzaCkpIHtcblx0XHRcdC8vICR7MS88cmVnZXg+Lzxmb3JtYXQ+LzxvcHRpb25zPn1cblx0XHRcdGlmICh0aGlzLl9wYXJzZVRyYW5zZm9ybShwbGFjZWhvbGRlcikpIHtcblx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKHBsYWNlaG9sZGVyKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlDbG9zZSkpIHtcblx0XHRcdC8vICR7MX1cblx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChwbGFjZWhvbGRlcik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyAkezEgPC0gbWlzc2luZyBjdXJseSBvciBjb2xvblxuXHRcdFx0cmV0dXJuIHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VDaG9pY2VFbGVtZW50KHBhcmVudDogQ2hvaWNlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl90b2tlbjtcblx0XHRjb25zdCB2YWx1ZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHRoaXMuX3Rva2VuLnR5cGUgPT09IFRva2VuVHlwZS5Db21tYSB8fCB0aGlzLl90b2tlbi50eXBlID09PSBUb2tlblR5cGUuUGlwZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGxldCB2YWx1ZTogc3RyaW5nO1xuXHRcdFx0aWYgKHZhbHVlID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5CYWNrc2xhc2gsIHRydWUpKSB7XG5cdFx0XHRcdC8vIFxcLCBcXHwsIG9yIFxcXFxcblx0XHRcdFx0dmFsdWUgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkNvbW1hLCB0cnVlKVxuXHRcdFx0XHRcdHx8IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuUGlwZSwgdHJ1ZSlcblx0XHRcdFx0XHR8fCB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkJhY2tzbGFzaCwgdHJ1ZSlcblx0XHRcdFx0XHR8fCB2YWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhbHVlID0gdGhpcy5fYWNjZXB0KHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdC8vIEVPRlxuXHRcdFx0XHR0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZXMucHVzaCh2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbHVlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKG5ldyBUZXh0KHZhbHVlcy5qb2luKCcnKSkpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gJHtmb286PGNoaWxkcmVuPn0sICR7Zm9vfSAtPiB2YXJpYWJsZVxuXHRwcml2YXRlIF9wYXJzZUNvbXBsZXhWYXJpYWJsZShwYXJlbnQ6IE1hcmtlcik6IGJvb2xlYW4ge1xuXHRcdGxldCBuYW1lOiBzdHJpbmc7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl90b2tlbjtcblx0XHRjb25zdCBtYXRjaCA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuRG9sbGFyKVxuXHRcdFx0JiYgdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseU9wZW4pXG5cdFx0XHQmJiAobmFtZSA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuVmFyaWFibGVOYW1lLCB0cnVlKSk7XG5cblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHR9XG5cblx0XHRjb25zdCB2YXJpYWJsZSA9IG5ldyBWYXJpYWJsZShuYW1lISk7XG5cblx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Db2xvbikpIHtcblx0XHRcdC8vICR7Zm9vOjxjaGlsZHJlbj59XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXG5cdFx0XHRcdC8vIC4uLn0gLT4gZG9uZVxuXHRcdFx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseUNsb3NlKSkge1xuXHRcdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZCh2YXJpYWJsZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5fcGFyc2UodmFyaWFibGUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBmYWxsYmFja1xuXHRcdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQobmV3IFRleHQoJyR7JyArIG5hbWUhICsgJzonKSk7XG5cdFx0XHRcdHZhcmlhYmxlLmNoaWxkcmVuLmZvckVhY2gocGFyZW50LmFwcGVuZENoaWxkLCBwYXJlbnQpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Gb3J3YXJkc2xhc2gpKSB7XG5cdFx0XHQvLyAke2Zvby88cmVnZXg+Lzxmb3JtYXQ+LzxvcHRpb25zPn1cblx0XHRcdGlmICh0aGlzLl9wYXJzZVRyYW5zZm9ybSh2YXJpYWJsZSkpIHtcblx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKHZhcmlhYmxlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQ3VybHlDbG9zZSkpIHtcblx0XHRcdC8vICR7Zm9vfVxuXHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKHZhcmlhYmxlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vICR7Zm9vIDwtIG1pc3NpbmcgY3VybHkgb3IgY29sb25cblx0XHRcdHJldHVybiB0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlVHJhbnNmb3JtKHBhcmVudDogVHJhbnNmb3JtYWJsZU1hcmtlcik6IGJvb2xlYW4ge1xuXHRcdC8vIC4uLjxyZWdleD4vPGZvcm1hdD4vPG9wdGlvbnM+fVxuXG5cdFx0Y29uc3QgdHJhbnNmb3JtID0gbmV3IFRyYW5zZm9ybSgpO1xuXHRcdGxldCByZWdleFZhbHVlID0gJyc7XG5cdFx0bGV0IHJlZ2V4T3B0aW9ucyA9ICcnO1xuXG5cdFx0Ly8gKDEpIC9yZWdleFxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Gb3J3YXJkc2xhc2gpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZXNjYXBlZDogc3RyaW5nO1xuXHRcdFx0aWYgKGVzY2FwZWQgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkJhY2tzbGFzaCwgdHJ1ZSkpIHtcblx0XHRcdFx0ZXNjYXBlZCA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuRm9yd2FyZHNsYXNoLCB0cnVlKSB8fCBlc2NhcGVkO1xuXHRcdFx0XHRyZWdleFZhbHVlICs9IGVzY2FwZWQ7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fdG9rZW4udHlwZSAhPT0gVG9rZW5UeXBlLkVPRikge1xuXHRcdFx0XHRyZWdleFZhbHVlICs9IHRoaXMuX2FjY2VwdCh1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyAoMikgL2Zvcm1hdFxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Gb3J3YXJkc2xhc2gpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZXNjYXBlZDogc3RyaW5nO1xuXHRcdFx0aWYgKGVzY2FwZWQgPSB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkJhY2tzbGFzaCwgdHJ1ZSkpIHtcblx0XHRcdFx0ZXNjYXBlZCA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuQmFja3NsYXNoLCB0cnVlKSB8fCB0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkZvcndhcmRzbGFzaCwgdHJ1ZSkgfHwgZXNjYXBlZDtcblx0XHRcdFx0dHJhbnNmb3JtLmFwcGVuZENoaWxkKG5ldyBUZXh0KGVzY2FwZWQpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9wYXJzZUZvcm1hdFN0cmluZyh0cmFuc2Zvcm0pIHx8IHRoaXMuX3BhcnNlQW55dGhpbmcodHJhbnNmb3JtKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyAoMykgL29wdGlvblxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseUNsb3NlKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl90b2tlbi50eXBlICE9PSBUb2tlblR5cGUuRU9GKSB7XG5cdFx0XHRcdHJlZ2V4T3B0aW9ucyArPSB0aGlzLl9hY2NlcHQodW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRyYW5zZm9ybS5yZWdleHAgPSBuZXcgUmVnRXhwKHJlZ2V4VmFsdWUsIHJlZ2V4T3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gaW52YWxpZCByZWdleHBcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRwYXJlbnQudHJhbnNmb3JtID0gdHJhbnNmb3JtO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VGb3JtYXRTdHJpbmcocGFyZW50OiBUcmFuc2Zvcm0pOiBib29sZWFuIHtcblxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fdG9rZW47XG5cdFx0aWYgKCF0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkRvbGxhcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgY29tcGxleCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkN1cmx5T3BlbikpIHtcblx0XHRcdGNvbXBsZXggPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fYWNjZXB0KFRva2VuVHlwZS5JbnQsIHRydWUpO1xuXG5cdFx0aWYgKCFpbmRleCkge1xuXHRcdFx0dGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdH0gZWxzZSBpZiAoIWNvbXBsZXgpIHtcblx0XHRcdC8vICQxXG5cdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQobmV3IEZvcm1hdFN0cmluZyhOdW1iZXIoaW5kZXgpKSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRcdH0gZWxzZSBpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5DdXJseUNsb3NlKSkge1xuXHRcdFx0Ly8gJHsxfVxuXHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKG5ldyBGb3JtYXRTdHJpbmcoTnVtYmVyKGluZGV4KSkpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cblx0XHR9IGVsc2UgaWYgKCF0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkNvbG9uKSkge1xuXHRcdFx0dGhpcy5fYmFja1RvKHRva2VuKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5Gb3J3YXJkc2xhc2gpKSB7XG5cdFx0XHQvLyAkezE6L3VwY2FzZX1cblx0XHRcdGNvbnN0IHNob3J0aGFuZCA9IHRoaXMuX2FjY2VwdChUb2tlblR5cGUuVmFyaWFibGVOYW1lLCB0cnVlKTtcblx0XHRcdGlmICghc2hvcnRoYW5kIHx8ICF0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkN1cmx5Q2xvc2UpKSB7XG5cdFx0XHRcdHRoaXMuX2JhY2tUbyh0b2tlbik7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChuZXcgRm9ybWF0U3RyaW5nKE51bWJlcihpbmRleCksIHNob3J0aGFuZCkpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5QbHVzKSkge1xuXHRcdFx0Ly8gJHsxOis8aWY+fVxuXHRcdFx0Y29uc3QgaWZWYWx1ZSA9IHRoaXMuX3VudGlsKFRva2VuVHlwZS5DdXJseUNsb3NlKTtcblx0XHRcdGlmIChpZlZhbHVlKSB7XG5cdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChuZXcgRm9ybWF0U3RyaW5nKE51bWJlcihpbmRleCksIHVuZGVmaW5lZCwgaWZWYWx1ZSwgdW5kZWZpbmVkKSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIGlmICh0aGlzLl9hY2NlcHQoVG9rZW5UeXBlLkRhc2gpKSB7XG5cdFx0XHQvLyAkezI6LTxlbHNlPn1cblx0XHRcdGNvbnN0IGVsc2VWYWx1ZSA9IHRoaXMuX3VudGlsKFRva2VuVHlwZS5DdXJseUNsb3NlKTtcblx0XHRcdGlmIChlbHNlVmFsdWUpIHtcblx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKG5ldyBGb3JtYXRTdHJpbmcoTnVtYmVyKGluZGV4KSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGVsc2VWYWx1ZSkpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAodGhpcy5fYWNjZXB0KFRva2VuVHlwZS5RdWVzdGlvbk1hcmspKSB7XG5cdFx0XHQvLyAkezI6PzxpZj46PGVsc2U+fVxuXHRcdFx0Y29uc3QgaWZWYWx1ZSA9IHRoaXMuX3VudGlsKFRva2VuVHlwZS5Db2xvbik7XG5cdFx0XHRpZiAoaWZWYWx1ZSkge1xuXHRcdFx0XHRjb25zdCBlbHNlVmFsdWUgPSB0aGlzLl91bnRpbChUb2tlblR5cGUuQ3VybHlDbG9zZSk7XG5cdFx0XHRcdGlmIChlbHNlVmFsdWUpIHtcblx0XHRcdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQobmV3IEZvcm1hdFN0cmluZyhOdW1iZXIoaW5kZXgpLCB1bmRlZmluZWQsIGlmVmFsdWUsIGVsc2VWYWx1ZSkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gJHsxOjxlbHNlPn1cblx0XHRcdGNvbnN0IGVsc2VWYWx1ZSA9IHRoaXMuX3VudGlsKFRva2VuVHlwZS5DdXJseUNsb3NlKTtcblx0XHRcdGlmIChlbHNlVmFsdWUpIHtcblx0XHRcdFx0cGFyZW50LmFwcGVuZENoaWxkKG5ldyBGb3JtYXRTdHJpbmcoTnVtYmVyKGluZGV4KSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGVsc2VWYWx1ZSkpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9iYWNrVG8odG9rZW4pO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlQW55dGhpbmcobWFya2VyOiBNYXJrZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fdG9rZW4udHlwZSAhPT0gVG9rZW5UeXBlLkVPRikge1xuXHRcdFx0bWFya2VyLmFwcGVuZENoaWxkKG5ldyBUZXh0KHRoaXMuX3NjYW5uZXIudG9rZW5UZXh0KHRoaXMuX3Rva2VuKSkpO1xuXHRcdFx0dGhpcy5fYWNjZXB0KHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUVsQixJQUFXLFlBQVgsa0JBQVdBLGVBQVg7QUFDTixFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEs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O0FBRWhELFlBQU0sVUFBVSxLQUFLLE9BQU8sYUFBZTtBQUMzQyxVQUFJLFNBQVM7QUFDWixjQUFNLFlBQVksS0FBSyxPQUFPLGtCQUFvQjtBQUNsRCxZQUFJLFdBQVc7QUFDZCxpQkFBTyxZQUFZLElBQUksYUFBYSxPQUFPLEtBQUssR0FBRyxRQUFXLFNBQVMsU0FBUyxDQUFDO0FBQ2pGLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUVELE9BQU87QUFFTixZQUFNLFlBQVksS0FBSyxPQUFPLGtCQUFvQjtBQUNsRCxVQUFJLFdBQVc7QUFDZCxlQUFPLFlBQVksSUFBSSxhQUFhLE9BQU8sS0FBSyxHQUFHLFFBQVcsUUFBVyxTQUFTLENBQUM7QUFDbkYsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsU0FBSyxRQUFRLEtBQUs7QUFDbEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGVBQWUsUUFBeUI7QUFDL0MsUUFBSSxLQUFLLE9BQU8sU0FBUyxjQUFlO0FBQ3ZDLGFBQU8sWUFBWSxJQUFJLEtBQUssS0FBSyxTQUFTLFVBQVUsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUNqRSxXQUFLLFFBQVEsTUFBUztBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlRva2VuVHlwZSIsICJwYXJlbnQiLCAiY2hpbGQiLCAibWFya2VyIiwgInN0YWNrIl0KfQo=
