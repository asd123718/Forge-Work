import { localize } from "../../nls.js";
function parse(input, errors = [], options = {}) {
  const scanner = new YamlScanner(input);
  const tokens = scanner.scan();
  const parser = new YamlParser(tokens, input, errors, options);
  return parser.parse();
}
function parseFrontMatter(input, errors = [], options = {}) {
  const tokens = new YamlScanner(input).scan();
  if (tokens.length === 0 || tokens[0].type !== 11 /* DocumentStart */) {
    return new MarkdownNode(void 0, input);
  }
  const hasClosingFrontMatter = tokens.slice(1).some((token) => token.type === 11 /* DocumentStart */);
  if (!hasClosingFrontMatter) {
    return new MarkdownNode(void 0, input);
  }
  const header = new YamlParser(tokens, input, errors, options).parse();
  const lastToken = tokens[tokens.length - 1];
  const body = lastToken.type === 13 /* EOF */ ? input.substring(lastToken.startOffset) : "";
  return new MarkdownNode(header, body);
}
class MarkdownNode {
  constructor(header, body) {
    this.header = header;
    this.body = body;
  }
  getStringValue(name) {
    if (this.header && this.header.type === "map") {
      const property = this.header.properties.find((p) => p.key.value === name);
      if (property && property.value.type === "scalar") {
        return property.value.value;
      }
    }
    return void 0;
  }
  getStringArrayValue(name) {
    if (this.header && this.header.type === "map") {
      const property = this.header.properties.find((p) => p.key.value === name);
      if (property && property.value.type === "sequence") {
        return property.value.items.filter((item) => item.type === "scalar").map((item) => item.value);
      } else if (property && property.value.type === "scalar") {
        if (property.value.format === "none") {
          return parseCommaSeparatedList(property.value.value, 0).map((item) => item.value);
        } else {
          return [property.value.value];
        }
      }
    }
    return void 0;
  }
  getBooleanValue(name) {
    const value = this.getStringValue(name);
    if (value === "true") {
      return true;
    } else if (value === "false") {
      return false;
    }
    return void 0;
  }
}
function parseCommaSeparatedList(value, offset = 0) {
  const parsed = parse(`[${value}]`);
  const shift = offset - 1;
  const items = [];
  if (parsed && parsed.type === "sequence") {
    for (const item of parsed.items) {
      if (item.type === "scalar") {
        items.push({ ...item, startOffset: item.startOffset + shift, endOffset: item.endOffset + shift });
      }
    }
  } else {
    items.push({ type: "scalar", value, rawValue: value, startOffset: offset, endOffset: value.length + offset, format: "none" });
  }
  return items;
}
var TokenType = /* @__PURE__ */ ((TokenType2) => {
  TokenType2[TokenType2["Scalar"] = 0] = "Scalar";
  TokenType2[TokenType2["Colon"] = 1] = "Colon";
  TokenType2[TokenType2["Dash"] = 2] = "Dash";
  TokenType2[TokenType2["Comma"] = 3] = "Comma";
  TokenType2[TokenType2["FlowMapStart"] = 4] = "FlowMapStart";
  TokenType2[TokenType2["FlowMapEnd"] = 5] = "FlowMapEnd";
  TokenType2[TokenType2["FlowSeqStart"] = 6] = "FlowSeqStart";
  TokenType2[TokenType2["FlowSeqEnd"] = 7] = "FlowSeqEnd";
  TokenType2[TokenType2["Newline"] = 8] = "Newline";
  TokenType2[TokenType2["Indent"] = 9] = "Indent";
  TokenType2[TokenType2["Comment"] = 10] = "Comment";
  TokenType2[TokenType2["DocumentStart"] = 11] = "DocumentStart";
  TokenType2[TokenType2["DocumentEnd"] = 12] = "DocumentEnd";
  TokenType2[TokenType2["EOF"] = 13] = "EOF";
  return TokenType2;
})(TokenType || {});
function makeToken(type, startOffset, endOffset, extra) {
  return {
    type,
    startOffset,
    endOffset,
    rawValue: extra?.rawValue ?? "",
    value: extra?.value ?? "",
    format: extra?.format ?? "none",
    indent: extra?.indent ?? 0
  };
}
class YamlScanner {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.tokens = [];
    // Track flow nesting depth so commas and flow indicators are only special inside flow collections
    this.flowDepth = 0;
    // Track whether we've already seen a block colon on the current line.
    // After the first key: value colon, subsequent ': ' on the same line is part of the scalar value.
    this.seenBlockColon = false;
    this.seenDocumentStart = 0;
  }
  scan(maxDocuments = 1) {
    while (this.pos < this.input.length) {
      this.scanLine();
      if (this.seenDocumentStart > maxDocuments) {
        break;
      }
    }
    this.tokens.push(makeToken(13 /* EOF */, this.pos, this.pos));
    return this.tokens;
  }
  // Scan a single logical line (up to and including the newline character)
  scanLine() {
    this.seenBlockColon = false;
    if (this.peekChar() === "\n") {
      this.tokens.push(makeToken(8 /* Newline */, this.pos, this.pos + 1));
      this.pos++;
      return;
    }
    if (this.peekChar() === "\r") {
      const end = this.pos + (this.input[this.pos + 1] === "\n" ? 2 : 1);
      this.tokens.push(makeToken(8 /* Newline */, this.pos, end));
      this.pos = end;
      return;
    }
    const indentStart = this.pos;
    let indent = 0;
    while (this.pos < this.input.length && (this.input[this.pos] === " " || this.input[this.pos] === "	")) {
      indent++;
      this.pos++;
    }
    if (indent > 0) {
      this.tokens.push(makeToken(9 /* Indent */, indentStart, this.pos, { indent }));
    }
    if (this.pos >= this.input.length || this.peekChar() === "\n" || this.peekChar() === "\r") {
      if (this.pos < this.input.length) {
        const nlStart = this.pos;
        const end = this.peekChar() === "\r" && this.input[this.pos + 1] === "\n" ? this.pos + 2 : this.pos + 1;
        this.tokens.push(makeToken(8 /* Newline */, nlStart, end));
        this.pos = end;
      }
      return;
    }
    if (indent === 0 && this.input.length - this.pos >= 3) {
      const c0 = this.input[this.pos];
      const c1 = this.input[this.pos + 1];
      const c2 = this.input[this.pos + 2];
      const c3 = this.input[this.pos + 3];
      const isTerminator = c3 === void 0 || c3 === " " || c3 === "	" || c3 === "\n" || c3 === "\r";
      if (c0 === "-" && c1 === "-" && c2 === "-" && isTerminator) {
        this.tokens.push(makeToken(11 /* DocumentStart */, this.pos, this.pos + 3));
        this.pos += 3;
        this.scanLineContent();
        this.scanNewline();
        this.seenDocumentStart++;
        return;
      }
      if (c0 === "." && c1 === "." && c2 === "." && isTerminator) {
        this.tokens.push(makeToken(12 /* DocumentEnd */, this.pos, this.pos + 3));
        this.pos += 3;
        this.scanLineContent();
        this.scanNewline();
        return;
      }
    }
    if (this.peekChar() === "#") {
      this.scanComment();
      this.scanNewline();
      return;
    }
    if (this.peekChar() === "%") {
      while (this.pos < this.input.length && this.input[this.pos] !== "\n" && this.input[this.pos] !== "\r") {
        this.pos++;
      }
      this.scanNewline();
      return;
    }
    this.scanLineContent();
    this.scanNewline();
  }
  scanLineContent() {
    while (this.pos < this.input.length && this.peekChar() !== "\n" && this.peekChar() !== "\r") {
      this.skipInlineWhitespace();
      if (this.pos >= this.input.length || this.peekChar() === "\n" || this.peekChar() === "\r") {
        break;
      }
      const ch = this.peekChar();
      if (ch === "#") {
        this.scanComment();
        break;
      } else if (ch === "{") {
        this.flowDepth++;
        this.tokens.push(makeToken(4 /* FlowMapStart */, this.pos, this.pos + 1));
        this.pos++;
      } else if (ch === "}" && this.flowDepth > 0) {
        this.flowDepth--;
        this.tokens.push(makeToken(5 /* FlowMapEnd */, this.pos, this.pos + 1));
        this.pos++;
      } else if (ch === "[") {
        this.flowDepth++;
        this.tokens.push(makeToken(6 /* FlowSeqStart */, this.pos, this.pos + 1));
        this.pos++;
      } else if (ch === "]" && this.flowDepth > 0) {
        this.flowDepth--;
        this.tokens.push(makeToken(7 /* FlowSeqEnd */, this.pos, this.pos + 1));
        this.pos++;
      } else if (ch === "," && this.flowDepth > 0) {
        this.tokens.push(makeToken(3 /* Comma */, this.pos, this.pos + 1));
        this.pos++;
      } else if (ch === "-" && this.isBlockDash()) {
        this.tokens.push(makeToken(2 /* Dash */, this.pos, this.pos + 1));
        this.pos++;
      } else if (ch === ":" && this.isBlockColon()) {
        this.tokens.push(makeToken(1 /* Colon */, this.pos, this.pos + 1));
        this.pos++;
        if (this.flowDepth === 0) {
          this.seenBlockColon = true;
        }
      } else if (ch === ":" && this.flowDepth > 0 && this.lastTokenIsJsonLike()) {
        this.tokens.push(makeToken(1 /* Colon */, this.pos, this.pos + 1));
        this.pos++;
      } else if (ch === "'" || ch === '"') {
        this.scanQuotedScalar(ch);
      } else if ((ch === "|" || ch === ">") && this.flowDepth === 0 && this.isBlockScalarStart()) {
        this.scanBlockScalar(ch);
        break;
      } else {
        this.scanUnquotedScalar();
      }
    }
  }
  /** Check if '-' is a block sequence dash (followed by space, newline, or EOF) */
  isBlockDash() {
    const next = this.input[this.pos + 1];
    return next === void 0 || next === " " || next === "	" || next === "\n" || next === "\r";
  }
  /** Check if ':' acts as a mapping value indicator (followed by space, newline, EOF, or flow indicator) */
  isBlockColon() {
    if (this.seenBlockColon && this.flowDepth === 0) {
      return false;
    }
    const next = this.input[this.pos + 1];
    if (next === void 0 || next === " " || next === "	" || next === "\n" || next === "\r") {
      return true;
    }
    if (this.flowDepth > 0 && (next === "," || next === "}" || next === "]")) {
      return true;
    }
    return false;
  }
  /** Check if the last non-whitespace token is a JSON-like node (quoted scalar or flow end) */
  lastTokenIsJsonLike() {
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type === 8 /* Newline */ || t.type === 9 /* Indent */ || t.type === 10 /* Comment */) {
        continue;
      }
      if (t.type === 0 /* Scalar */ && t.format !== "none") {
        return true;
      }
      if (t.type === 5 /* FlowMapEnd */ || t.type === 7 /* FlowSeqEnd */) {
        return true;
      }
      return false;
    }
    return false;
  }
  scanQuotedScalar(quote) {
    const start = this.pos;
    this.pos++;
    let value = "";
    let trailingLiteralWs = 0;
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === quote) {
        if (quote === "'" && this.input[this.pos + 1] === "'") {
          value += "'";
          this.pos += 2;
          trailingLiteralWs = 0;
          continue;
        }
        this.pos++;
        const rawValue2 = this.input.substring(start, this.pos);
        this.tokens.push(makeToken(0 /* Scalar */, start, this.pos, {
          rawValue: rawValue2,
          value,
          format: quote === "'" ? "single" : "double"
        }));
        return;
      }
      if (quote === '"' && ch === "\\") {
        const next = this.input[this.pos + 1];
        if (next === "\n" || next === "\r") {
          this.pos++;
          this.consumeNewline();
          this.skipInlineWhitespace();
          trailingLiteralWs = 0;
          continue;
        }
        switch (next) {
          case "n":
            value += "\n";
            break;
          case "t":
            value += "	";
            break;
          case "\\":
            value += "\\";
            break;
          case '"':
            value += '"';
            break;
          case "/":
            value += "/";
            break;
          case "r":
            value += "\r";
            break;
          case "0":
            value += "\0";
            break;
          case "a":
            value += "\x07";
            break;
          case "b":
            value += "\b";
            break;
          case "e":
            value += "\x1B";
            break;
          case "v":
            value += "\v";
            break;
          case "f":
            value += "\f";
            break;
          case " ":
            value += " ";
            break;
          case "_":
            value += "\xA0";
            break;
          case "x": {
            const hex = this.input.substring(this.pos + 2, this.pos + 4);
            const code = parseInt(hex, 16);
            if (hex.length === 2 && !isNaN(code)) {
              value += String.fromCharCode(code);
              this.pos += 4;
            } else {
              value += "\\x";
              this.pos += 2;
            }
            trailingLiteralWs = 0;
            continue;
          }
          case "u": {
            const hex = this.input.substring(this.pos + 2, this.pos + 6);
            const code = parseInt(hex, 16);
            if (hex.length === 4 && !isNaN(code)) {
              value += String.fromCodePoint(code);
              this.pos += 6;
            } else {
              value += "\\u";
              this.pos += 2;
            }
            trailingLiteralWs = 0;
            continue;
          }
          case "U": {
            const hex = this.input.substring(this.pos + 2, this.pos + 10);
            const code = parseInt(hex, 16);
            if (hex.length === 8 && !isNaN(code)) {
              value += String.fromCodePoint(code);
              this.pos += 10;
            } else {
              value += "\\U";
              this.pos += 2;
            }
            trailingLiteralWs = 0;
            continue;
          }
          default:
            value += "\\" + (next ?? "");
            break;
        }
        this.pos += 2;
        trailingLiteralWs = 0;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        if (trailingLiteralWs > 0) {
          value = value.substring(0, value.length - trailingLiteralWs);
        }
        trailingLiteralWs = 0;
        this.consumeNewline();
        let emptyLineCount = 0;
        while (this.pos < this.input.length) {
          this.skipInlineWhitespace();
          const c = this.input[this.pos];
          if (c === "\n" || c === "\r") {
            emptyLineCount++;
            this.consumeNewline();
          } else {
            break;
          }
        }
        if (emptyLineCount > 0) {
          value += "\n".repeat(emptyLineCount);
        } else {
          value += " ";
        }
        continue;
      }
      if (ch === " " || ch === "	") {
        trailingLiteralWs++;
      } else {
        trailingLiteralWs = 0;
      }
      value += ch;
      this.pos++;
    }
    const rawValue = this.input.substring(start, this.pos);
    this.tokens.push(makeToken(0 /* Scalar */, start, this.pos, {
      rawValue,
      value,
      format: quote === "'" ? "single" : "double"
    }));
  }
  scanUnquotedScalar() {
    const start = this.pos;
    let end = this.pos;
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === "\n" || ch === "\r") {
        break;
      }
      if (this.flowDepth > 0 && (ch === "," || ch === "}" || ch === "]")) {
        break;
      }
      if (this.flowDepth > 0 && (ch === "{" || ch === "[")) {
        break;
      }
      if (ch === ":" && this.isBlockColon()) {
        break;
      }
      if (ch === "#" && this.pos > start && (this.input[this.pos - 1] === " " || this.input[this.pos - 1] === "	")) {
        break;
      }
      this.pos++;
      if (ch !== " " && ch !== "	") {
        end = this.pos;
      }
    }
    const rawValue = this.input.substring(start, end);
    this.tokens.push(makeToken(0 /* Scalar */, start, end, {
      rawValue,
      value: rawValue,
      format: "none"
    }));
  }
  /**
   * Check if '|' or '>' at the current position is a block scalar indicator.
   * Must be followed by optional indentation/chomping indicators, optional comment, then newline.
   */
  isBlockScalarStart() {
    let p = this.pos + 1;
    while (p < this.input.length) {
      const c2 = this.input[p];
      if (c2 >= "1" && c2 <= "9") {
        p++;
        continue;
      }
      if (c2 === "+" || c2 === "-") {
        p++;
        continue;
      }
      break;
    }
    while (p < this.input.length && (this.input[p] === " " || this.input[p] === "	")) {
      p++;
    }
    if (p >= this.input.length) {
      return true;
    }
    const c = this.input[p];
    return c === "\n" || c === "\r" || c === "#";
  }
  /**
   * Scan a block scalar (literal '|' or folded '>').
   * Parses the header line for indentation indicator and chomping mode,
   * then collects all content lines that are indented beyond the detected indentation.
   */
  scanBlockScalar(style) {
    const start = this.pos;
    this.pos++;
    let explicitIndent = 0;
    let chomping = "clip";
    for (let i = 0; i < 2; i++) {
      if (this.pos < this.input.length) {
        const c = this.input[this.pos];
        if (c >= "1" && c <= "9" && explicitIndent === 0) {
          explicitIndent = parseInt(c, 10);
          this.pos++;
        } else if (c === "-" && chomping === "clip") {
          chomping = "strip";
          this.pos++;
        } else if (c === "+" && chomping === "clip") {
          chomping = "keep";
          this.pos++;
        }
      }
    }
    while (this.pos < this.input.length && (this.input[this.pos] === " " || this.input[this.pos] === "	")) {
      this.pos++;
    }
    if (this.pos < this.input.length && this.input[this.pos] === "#") {
      while (this.pos < this.input.length && this.input[this.pos] !== "\n" && this.input[this.pos] !== "\r") {
        this.pos++;
      }
    }
    this.consumeNewline();
    const parentBlockIndent = this.getParentBlockIndent(start);
    let contentIndent = explicitIndent > 0 ? parentBlockIndent + explicitIndent : 0;
    const lines = [];
    let trailingNewlines = 0;
    while (this.pos < this.input.length) {
      const lineStart = this.pos;
      let lineIndent = 0;
      while (this.pos < this.input.length && this.input[this.pos] === " ") {
        lineIndent++;
        this.pos++;
      }
      if (this.pos >= this.input.length || this.input[this.pos] === "\n" || this.input[this.pos] === "\r") {
        if (contentIndent > 0 && lineIndent >= contentIndent) {
          const preserved = this.input.substring(lineStart + contentIndent, this.pos);
          lines.push(preserved);
          if (preserved === "") {
            trailingNewlines++;
          } else {
            trailingNewlines = 0;
          }
        } else {
          lines.push("");
          trailingNewlines++;
        }
        this.consumeNewline();
        continue;
      }
      if (lineIndent === 0 && this.input.length - this.pos >= 3) {
        const c0 = this.input[this.pos];
        const c1 = this.input[this.pos + 1];
        const c2 = this.input[this.pos + 2];
        const c3 = this.input[this.pos + 3];
        const isTerm = c3 === void 0 || c3 === " " || c3 === "	" || c3 === "\n" || c3 === "\r";
        if (c0 === "-" && c1 === "-" && c2 === "-" && isTerm || c0 === "." && c1 === "." && c2 === "." && isTerm) {
          this.pos = lineStart;
          break;
        }
      }
      if (contentIndent === 0) {
        if (lineIndent <= parentBlockIndent) {
          this.pos = lineStart;
          break;
        }
        contentIndent = lineIndent;
      }
      if (lineIndent < contentIndent) {
        this.pos = lineStart;
        break;
      }
      const contentStart = lineStart + contentIndent;
      while (this.pos < this.input.length && this.input[this.pos] !== "\n" && this.input[this.pos] !== "\r") {
        this.pos++;
      }
      const lineContent = this.input.substring(contentStart, this.pos);
      lines.push(lineContent);
      trailingNewlines = 0;
      this.consumeNewline();
    }
    let value;
    if (style === "|") {
      value = lines.join("\n");
    } else {
      value = "";
      let lastNonEmptyIsMoreIndented = false;
      let inEmptyRun = false;
      let seenNonEmpty = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isMoreIndented = line.length > 0 && (line[0] === " " || line[0] === "	");
        if (line === "") {
          value += "\n";
          inEmptyRun = true;
        } else if (i === 0) {
          value = line;
          lastNonEmptyIsMoreIndented = isMoreIndented;
          seenNonEmpty = true;
        } else if (inEmptyRun) {
          if ((lastNonEmptyIsMoreIndented || isMoreIndented) && seenNonEmpty) {
            value += "\n" + line;
          } else {
            value += line;
          }
          lastNonEmptyIsMoreIndented = isMoreIndented;
          inEmptyRun = false;
          seenNonEmpty = true;
        } else if (isMoreIndented || lastNonEmptyIsMoreIndented) {
          value += "\n" + line;
          lastNonEmptyIsMoreIndented = isMoreIndented;
          seenNonEmpty = true;
        } else {
          value += " " + line;
          lastNonEmptyIsMoreIndented = false;
          seenNonEmpty = true;
        }
      }
    }
    if (trailingNewlines > 0) {
      let end = value.length;
      while (end > 0 && value[end - 1] === "\n") {
        end--;
      }
      value = value.substring(0, end);
    }
    const hasContent = lines.some((l) => l !== "");
    switch (chomping) {
      case "clip":
        if (hasContent) {
          value += "\n";
        }
        break;
      case "keep":
        if (hasContent) {
          value += "\n".repeat(trailingNewlines + 1);
        } else {
          value = "\n".repeat(trailingNewlines);
        }
        break;
      case "strip":
        break;
    }
    const rawValue = this.input.substring(start, this.pos);
    this.tokens.push(makeToken(0 /* Scalar */, start, this.pos, {
      rawValue,
      value,
      format: style === "|" ? "literal" : "folded"
    }));
  }
  /**
   * Determine the parent block's indentation level for a block scalar.
   * Looks at preceding tokens to find the context:
   * - After Colon: the indentation of the line containing the mapping key
   * - After Dash: the column of the dash
   * - At document level: -1 (allows content at indent 0)
   */
  getParentBlockIndent(blockScalarPos) {
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type === 8 /* Newline */ || t.type === 10 /* Comment */ || t.type === 9 /* Indent */) {
        continue;
      }
      if (t.type === 1 /* Colon */) {
        for (let j = i - 1; j >= 0; j--) {
          const kt = this.tokens[j];
          if (kt.type === 8 /* Newline */ || kt.type === 10 /* Comment */ || kt.type === 9 /* Indent */) {
            continue;
          }
          return this.getColumnAt(kt.startOffset);
        }
        return 0;
      }
      if (t.type === 2 /* Dash */) {
        return this.getColumnAt(t.startOffset);
      }
      if (t.type === 11 /* DocumentStart */) {
        return -1;
      }
      break;
    }
    return 0;
  }
  /**
   * Get the column (0-based offset from start of line) for a position in the input.
   */
  getColumnAt(offset) {
    let col = 0;
    let p = offset - 1;
    while (p >= 0 && this.input[p] !== "\n" && this.input[p] !== "\r") {
      col++;
      p--;
    }
    return col;
  }
  scanComment() {
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== "\n" && this.input[this.pos] !== "\r") {
      this.pos++;
    }
    this.tokens.push(makeToken(10 /* Comment */, start, this.pos, {
      rawValue: this.input.substring(start, this.pos),
      value: this.input.substring(start, this.pos)
    }));
  }
  scanNewline() {
    const start = this.pos;
    if (this.consumeNewline()) {
      this.tokens.push(makeToken(8 /* Newline */, start, this.pos));
    }
  }
  skipInlineWhitespace() {
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === " " || ch === "	") {
        this.pos++;
      } else {
        break;
      }
    }
  }
  /** Advance past a newline sequence (\r\n, \n, or \r). Returns true if a newline was consumed. */
  consumeNewline() {
    if (this.pos >= this.input.length) {
      return false;
    }
    if (this.input[this.pos] === "\r" && this.input[this.pos + 1] === "\n") {
      this.pos += 2;
      return true;
    }
    if (this.input[this.pos] === "\n" || this.input[this.pos] === "\r") {
      this.pos++;
      return true;
    }
    return false;
  }
  peekChar() {
    return this.input[this.pos];
  }
}
class YamlParser {
  constructor(tokens, input, errors, options) {
    this.tokens = tokens;
    this.input = input;
    this.errors = errors;
    this.options = options;
    this.pos = 0;
  }
  parse() {
    this.skipNewlinesAndComments();
    if (this.currentToken().type === 11 /* DocumentStart */) {
      this.advance();
      this.skipNewlinesAndComments();
    }
    if (this.currentToken().type === 13 /* EOF */ || this.currentToken().type === 12 /* DocumentEnd */) {
      return void 0;
    }
    const result = this.parseValue(-1);
    return result;
  }
  // -- helpers ----------------------------------------------------------
  currentToken() {
    return this.tokens[this.pos];
  }
  peek(offset = 0) {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }
  advance() {
    const t = this.tokens[this.pos];
    if (t.type !== 13 /* EOF */) {
      this.pos++;
    }
    return t;
  }
  expect(type) {
    const t = this.currentToken();
    if (t.type === type) {
      return this.advance();
    }
    return t;
  }
  emitError(message, startOffset, endOffset, code) {
    this.errors.push({ message, startOffset, endOffset, code });
  }
  skipNewlinesAndComments() {
    while (this.currentToken().type === 8 /* Newline */ || this.currentToken().type === 10 /* Comment */ || this.currentToken().type === 9 /* Indent */ && this.isFollowedByNewlineOrComment()) {
      this.advance();
    }
  }
  /** Returns true if the current Indent token is followed immediately by Newline/Comment/EOF */
  isFollowedByNewlineOrComment() {
    const next = this.peek(1);
    return next.type === 8 /* Newline */ || next.type === 10 /* Comment */ || next.type === 13 /* EOF */;
  }
  /**
   * Determines the current indentation level.
   * If the current token is an Indent, returns its indent value.
   * Otherwise returns 0 (token is at column 0).
   */
  currentIndent() {
    if (this.currentToken().type === 9 /* Indent */) {
      return this.currentToken().indent;
    }
    return 0;
  }
  // -- Main parse entry for a value at a given indentation --------------
  parseValue(parentIndent) {
    this.skipNewlinesAndComments();
    const token = this.currentToken();
    const flowToken = token.type === 9 /* Indent */ ? this.peek(1) : token;
    if (flowToken.type === 4 /* FlowMapStart */ || flowToken.type === 6 /* FlowSeqStart */) {
      if (token.type === 9 /* Indent */) {
        this.advance();
      }
      if (flowToken.type === 4 /* FlowMapStart */) {
        return this.parseFlowMap();
      }
      return this.parseFlowSeq();
    }
    const indent = this.currentIndent();
    const firstContentToken = this.peekPastIndent();
    if (firstContentToken.type === 2 /* Dash */) {
      return this.parseBlockSequence(indent);
    }
    if (this.looksLikeMapping()) {
      return this.parseBlockMapping(indent);
    }
    if (token.type === 0 /* Scalar */ || token.type === 9 /* Indent */) {
      return this.parseScalar(parentIndent);
    }
    return void 0;
  }
  /** Peek past an optional Indent token to see the first content token */
  peekPastIndent() {
    if (this.currentToken().type === 9 /* Indent */) {
      return this.peek(1);
    }
    return this.currentToken();
  }
  /** Check if tokens at current position look like a mapping entry (key: value) */
  looksLikeMapping() {
    let offset = 0;
    if (this.peek(offset).type === 9 /* Indent */) {
      offset++;
    }
    if (this.peek(offset).type === 0 /* Scalar */) {
      offset++;
      if (this.peek(offset).type === 1 /* Colon */) {
        return true;
      }
    }
    return false;
  }
  // -- Scalar ----------------------------------------------------------
  parseScalar(parentIndent = -1) {
    if (this.currentToken().type === 9 /* Indent */) {
      this.advance();
    }
    const token = this.expect(0 /* Scalar */);
    if (token.format !== "none") {
      return this.scalarFromToken(token);
    }
    return this.parsePlainMultiline(token, parentIndent);
  }
  /**
   * Parse a multiline plain scalar. The first line's token is already consumed.
   * Continuation lines must be indented deeper than `parentIndent`.
   * Line folding rules:
   * - Single line break → space
   * - Each empty line → preserved as \n
   */
  parsePlainMultiline(firstToken, parentIndent) {
    let value = firstToken.value;
    let endOffset = firstToken.endOffset;
    while (true) {
      const savedPos = this.pos;
      let emptyLineCount = 0;
      let foundContent = false;
      while (this.pos < this.tokens.length) {
        const t = this.currentToken();
        if (t.type === 10 /* Comment */) {
          break;
        }
        if (t.type === 8 /* Newline */) {
          this.advance();
          const afterNewline = this.currentToken();
          if (afterNewline.type === 8 /* Newline */) {
            emptyLineCount++;
            continue;
          }
          if (afterNewline.type === 9 /* Indent */) {
            const afterIndent = this.peek(1);
            if (afterIndent.type === 8 /* Newline */ || afterIndent.type === 13 /* EOF */) {
              emptyLineCount++;
              this.advance();
              continue;
            }
            if (afterIndent.type === 10 /* Comment */) {
              break;
            }
            if (afterNewline.indent > parentIndent) {
              foundContent = true;
              break;
            } else {
              break;
            }
          }
          if (afterNewline.type === 13 /* EOF */) {
            break;
          }
          if (afterNewline.type === 11 /* DocumentStart */ || afterNewline.type === 12 /* DocumentEnd */) {
            break;
          }
          if (parentIndent < 0) {
            foundContent = true;
            break;
          }
          break;
        }
        if (t.type === 9 /* Indent */) {
          break;
        }
        break;
      }
      if (!foundContent) {
        this.pos = savedPos;
        break;
      }
      if (this.currentToken().type === 9 /* Indent */) {
        this.advance();
      }
      if (this.currentToken().type !== 0 /* Scalar */) {
        if (this.currentToken().type === 2 /* Dash */) {
          const dashToken = this.advance();
          let lineText = "-";
          if (this.currentToken().type === 0 /* Scalar */) {
            const restToken = this.advance();
            lineText = "- " + restToken.value;
            endOffset = restToken.endOffset;
          } else {
            endOffset = dashToken.endOffset;
          }
          if (emptyLineCount > 0) {
            value += "\n".repeat(emptyLineCount);
          } else {
            value += " ";
          }
          value += lineText;
          continue;
        }
        this.pos = savedPos;
        break;
      }
      if (this.peek(1).type === 1 /* Colon */) {
        this.pos = savedPos;
        break;
      }
      const contToken = this.advance();
      if (emptyLineCount > 0) {
        value += "\n".repeat(emptyLineCount);
      } else {
        value += " ";
      }
      value += contToken.value;
      endOffset = contToken.endOffset;
    }
    return {
      type: "scalar",
      value,
      rawValue: this.input.substring(firstToken.startOffset, endOffset),
      startOffset: firstToken.startOffset,
      endOffset,
      format: "none"
    };
  }
  // -- Block mapping ---------------------------------------------------
  parseBlockMapping(baseIndent, inlineFirstEntry = false) {
    const startOffset = this.currentToken().startOffset;
    const properties = [];
    const seenKeys = /* @__PURE__ */ new Set();
    if (inlineFirstEntry) {
      const firstEntry = this.parseMappingEntry(baseIndent);
      if (firstEntry) {
        seenKeys.add(firstEntry.key.value);
        properties.push(firstEntry);
      }
    }
    while (this.currentToken().type !== 13 /* EOF */) {
      this.skipNewlinesAndComments();
      if (this.currentToken().type === 13 /* EOF */) {
        break;
      }
      const indent = this.currentIndent();
      if (indent < baseIndent) {
        break;
      }
      if (indent !== baseIndent) {
        if (indent > baseIndent) {
          this.emitError(
            localize("unexpectedIndentation", "Unexpected indentation (expected {0}, got {1})", baseIndent, indent),
            this.currentToken().startOffset,
            this.currentToken().endOffset,
            "unexpected-indentation"
          );
        } else {
          break;
        }
      }
      if (!this.looksLikeMapping()) {
        break;
      }
      const entry = this.parseMappingEntry(baseIndent);
      if (!entry) {
        break;
      }
      if (!this.options.allowDuplicateKeys && seenKeys.has(entry.key.value)) {
        this.emitError(
          localize("duplicateKey", 'Duplicate key: "{0}"', entry.key.value),
          entry.key.startOffset,
          entry.key.endOffset,
          "duplicate-key"
        );
      }
      seenKeys.add(entry.key.value);
      properties.push(entry);
    }
    const endOffset = properties.length > 0 ? properties[properties.length - 1].value.endOffset : startOffset;
    return { type: "map", properties, style: "block", startOffset, endOffset };
  }
  parseMappingEntry(baseIndent) {
    if (this.currentToken().type === 9 /* Indent */) {
      this.advance();
    }
    const keyToken = this.expect(0 /* Scalar */);
    const key = this.scalarFromToken(keyToken);
    const colon = this.expect(1 /* Colon */);
    if (colon.type !== 1 /* Colon */) {
      this.emitError(localize("expectedColon", 'Expected ":"'), colon.startOffset, colon.endOffset, "expected-colon");
      return void 0;
    }
    const value = this.parseMappingValue(baseIndent, colon);
    return { key, value };
  }
  parseMappingValue(baseIndent, colonToken) {
    const next = this.currentToken();
    if (next.type === 4 /* FlowMapStart */) {
      return this.parseFlowMap();
    }
    if (next.type === 6 /* FlowSeqStart */) {
      return this.parseFlowSeq();
    }
    if (next.type === 0 /* Scalar */) {
      if (this.currentToken().type === 9 /* Indent */) {
        this.advance();
      }
      const token = this.advance();
      if (token.format !== "none") {
        return this.scalarFromToken(token);
      }
      return this.parsePlainMultiline(token, baseIndent);
    }
    this.skipNewlinesAndComments();
    const afterNewline = this.currentToken();
    if (afterNewline.type === 13 /* EOF */) {
      this.emitError(localize("missingValue", "Missing value"), colonToken.startOffset, colonToken.endOffset, "missing-value");
      return this.makeEmptyScalar(colonToken.endOffset);
    }
    const nextIndent = this.currentIndent();
    if (nextIndent === baseIndent && this.peekPastIndent().type === 2 /* Dash */) {
      return this.parseValue(baseIndent) ?? this.makeEmptyScalar(colonToken.endOffset);
    }
    if (nextIndent <= baseIndent) {
      this.emitError(localize("missingValue", "Missing value"), colonToken.startOffset, colonToken.endOffset, "missing-value");
      return this.makeEmptyScalar(colonToken.endOffset);
    }
    return this.parseValue(baseIndent) ?? this.makeEmptyScalar(colonToken.endOffset);
  }
  // -- Block sequence --------------------------------------------------
  parseBlockSequence(baseIndent) {
    const items = [];
    const startOffset = this.currentToken().startOffset;
    let endOffset = startOffset;
    let isFirstItem = true;
    while (this.currentToken().type !== 13 /* EOF */) {
      this.skipNewlinesAndComments();
      if (this.currentToken().type === 13 /* EOF */) {
        break;
      }
      let indent;
      if (isFirstItem && this.currentToken().type === 2 /* Dash */) {
        indent = this.currentToken().startOffset - this.getLineStart(this.currentToken().startOffset);
      } else {
        indent = this.currentIndent();
      }
      isFirstItem = false;
      if (indent < baseIndent) {
        break;
      }
      if (indent !== baseIndent) {
        if (indent > baseIndent) {
          this.emitError(
            localize("unexpectedIndentation", "Unexpected indentation (expected {0}, got {1})", baseIndent, indent),
            this.currentToken().startOffset,
            this.currentToken().endOffset,
            "unexpected-indentation"
          );
        } else {
          break;
        }
      }
      const contentToken = this.peekPastIndent();
      if (contentToken.type !== 2 /* Dash */) {
        break;
      }
      if (this.currentToken().type === 9 /* Indent */) {
        this.advance();
      }
      const dashToken = this.advance();
      const itemValue = this.parseSequenceItemValue(baseIndent, dashToken);
      items.push(itemValue);
      endOffset = itemValue.endOffset;
    }
    return { type: "sequence", items, style: "block", startOffset, endOffset };
  }
  parseSequenceItemValue(baseIndent, dashToken) {
    const next = this.currentToken();
    if (next.type === 10 /* Comment */) {
      this.advance();
    }
    if (next.type === 4 /* FlowMapStart */) {
      return this.parseFlowMap();
    }
    if (next.type === 6 /* FlowSeqStart */) {
      return this.parseFlowSeq();
    }
    if (next.type === 2 /* Dash */) {
      const nestedIndent = next.startOffset - this.getLineStart(next.startOffset);
      return this.parseBlockSequence(nestedIndent);
    }
    if (next.type === 0 /* Scalar */) {
      if (this.peek(1).type === 1 /* Colon */) {
        const itemIndent = next.startOffset - this.getLineStart(next.startOffset);
        return this.parseBlockMapping(itemIndent, true);
      }
      return this.parseScalar(baseIndent);
    }
    this.skipNewlinesAndComments();
    if (this.currentToken().type === 13 /* EOF */) {
      this.emitError(localize("missingSeqItemValue", "Missing sequence item value"), dashToken.startOffset, dashToken.endOffset, "missing-value");
      return this.makeEmptyScalar(dashToken.endOffset);
    }
    const nextIndent = this.currentIndent();
    if (nextIndent <= baseIndent) {
      this.emitError(localize("missingSeqItemValue", "Missing sequence item value"), dashToken.startOffset, dashToken.endOffset, "missing-value");
      return this.makeEmptyScalar(dashToken.endOffset);
    }
    return this.parseValue(baseIndent) ?? this.makeEmptyScalar(dashToken.endOffset);
  }
  /** Calculate the start of the line containing the given offset */
  getLineStart(offset) {
    let i = offset - 1;
    while (i >= 0 && this.input[i] !== "\n" && this.input[i] !== "\r") {
      i--;
    }
    return i + 1;
  }
  // -- Flow map --------------------------------------------------------
  parseFlowMap() {
    const startToken = this.advance();
    const properties = [];
    this.skipFlowWhitespace();
    while (this.currentToken().type !== 5 /* FlowMapEnd */ && this.currentToken().type !== 13 /* EOF */) {
      let key;
      if (this.currentToken().type === 0 /* Scalar */) {
        key = this.parseFlowScalar();
      } else {
        this.emitError(localize("expectedMappingKey", "Expected mapping key"), this.currentToken().startOffset, this.currentToken().endOffset, "expected-key");
        break;
      }
      this.skipFlowWhitespace();
      let value;
      if (this.currentToken().type === 1 /* Colon */) {
        this.advance();
        this.skipFlowWhitespace();
        value = this.parseFlowValue();
      } else {
        value = this.makeEmptyScalar(key.endOffset);
      }
      properties.push({ key, value });
      this.skipFlowWhitespace();
      if (this.currentToken().type === 3 /* Comma */) {
        this.advance();
        this.skipFlowWhitespace();
      }
    }
    const endToken = this.currentToken();
    if (endToken.type === 5 /* FlowMapEnd */) {
      this.advance();
    } else {
      this.emitError(localize("expectedFlowMapEnd", 'Expected "}"'), endToken.startOffset, endToken.endOffset, "expected-flow-map-end");
    }
    return {
      type: "map",
      properties,
      style: "flow",
      startOffset: startToken.startOffset,
      endOffset: endToken.type === 5 /* FlowMapEnd */ ? endToken.endOffset : endToken.startOffset
    };
  }
  // -- Flow sequence ---------------------------------------------------
  parseFlowSeq() {
    const startToken = this.advance();
    const items = [];
    this.skipFlowWhitespace();
    while (this.currentToken().type !== 7 /* FlowSeqEnd */ && this.currentToken().type !== 13 /* EOF */) {
      let item;
      if (this.currentToken().type === 4 /* FlowMapStart */) {
        item = this.parseFlowMap();
      } else if (this.currentToken().type === 6 /* FlowSeqStart */) {
        item = this.parseFlowSeq();
      } else if (this.currentToken().type === 0 /* Scalar */) {
        item = this.parseFlowScalar();
      } else {
        this.emitError(localize("unexpectedTokenInFlowSeq", "Unexpected token in flow sequence"), this.currentToken().startOffset, this.currentToken().endOffset, "unexpected-token");
        this.advance();
        continue;
      }
      items.push(item);
      this.skipFlowWhitespace();
      if (this.currentToken().type === 3 /* Comma */) {
        this.advance();
        this.skipFlowWhitespace();
      }
    }
    const endToken = this.currentToken();
    if (endToken.type === 7 /* FlowSeqEnd */) {
      this.advance();
    } else {
      this.emitError(localize("expectedFlowSeqEnd", 'Expected "]"'), endToken.startOffset, endToken.endOffset, "expected-flow-seq-end");
    }
    return {
      type: "sequence",
      items,
      style: "flow",
      startOffset: startToken.startOffset,
      endOffset: endToken.type === 7 /* FlowSeqEnd */ ? endToken.endOffset : endToken.startOffset
    };
  }
  /**
   * Parse a scalar inside a flow collection, handling multiline plain scalars.
   * In flow context, plain (unquoted) scalars can span multiple lines;
   * line breaks are folded into spaces.
   */
  parseFlowScalar() {
    const token = this.advance();
    if (token.format !== "none") {
      return this.scalarFromToken(token);
    }
    let value = token.value;
    let endOffset = token.endOffset;
    while (true) {
      let hasNewline = false;
      let p = this.pos;
      while (p < this.tokens.length) {
        const t = this.tokens[p];
        if (t.type === 8 /* Newline */) {
          hasNewline = true;
          p++;
        } else if (t.type === 9 /* Indent */ || t.type === 10 /* Comment */) {
          p++;
        } else {
          break;
        }
      }
      if (!hasNewline || p >= this.tokens.length) {
        break;
      }
      const nextToken = this.tokens[p];
      if (nextToken.type === 0 /* Scalar */ && nextToken.format === "none") {
        this.pos = p + 1;
        value += " " + nextToken.value;
        endOffset = nextToken.endOffset;
      } else {
        break;
      }
    }
    return {
      type: "scalar",
      value,
      rawValue: this.input.substring(token.startOffset, endOffset),
      startOffset: token.startOffset,
      endOffset,
      format: "none"
    };
  }
  /** Parse a value in flow context (used after colon in flow mappings/implicit mappings) */
  parseFlowValue() {
    if (this.currentToken().type === 4 /* FlowMapStart */) {
      return this.parseFlowMap();
    } else if (this.currentToken().type === 6 /* FlowSeqStart */) {
      return this.parseFlowSeq();
    } else if (this.currentToken().type === 0 /* Scalar */) {
      return this.parseFlowScalar();
    } else {
      return this.makeEmptyScalar(this.currentToken().startOffset);
    }
  }
  /** Skip whitespace, newlines, and comments inside flow collections */
  skipFlowWhitespace() {
    while (true) {
      const t = this.currentToken().type;
      if (t === 8 /* Newline */ || t === 9 /* Indent */ || t === 10 /* Comment */) {
        this.advance();
      } else {
        break;
      }
    }
  }
  scalarFromToken(token) {
    return {
      type: "scalar",
      value: token.value,
      rawValue: token.rawValue,
      startOffset: token.startOffset,
      endOffset: token.endOffset,
      format: token.format
    };
  }
  makeEmptyScalar(offset) {
    return {
      type: "scalar",
      value: "",
      rawValue: "",
      startOffset: offset,
      endOffset: offset,
      format: "none"
    };
  }
}
export {
  MarkdownNode,
  parse,
  parseCommaSeparatedList,
  parseFrontMatter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHlhbWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uL25scy5qcyc7XG5cbi8qKlxuICogUGFyc2VzIGEgc2ltcGxpZmllZCBZQU1MLWxpa2UgaW5wdXQgZnJvbSBhIHNpbmdsZSBzdHJpbmcuXG4gKiBTdXBwb3J0cyBvYmplY3RzLCBhcnJheXMsIHByaW1pdGl2ZSB0eXBlcyAoc3RyaW5nLCBudW1iZXIsIGJvb2xlYW4sIG51bGwpLlxuICogVHJhY2tzIHBvc2l0aW9ucyBmb3IgZXJyb3IgcmVwb3J0aW5nIGFuZCBub2RlIGxvY2F0aW9ucy5cbiAqXG4gKiBMaW1pdGF0aW9uczpcbiAqIC0gTm8gYW5jaG9ycyBvciByZWZlcmVuY2VzXG4gKiAtIE5vIGNvbXBsZXggdHlwZXMgKGRhdGVzLCBiaW5hcnkpXG4gKiAtIE5vIHNpbmdsZSBwYWlyIGltcGxpY2l0IGVudHJpZXNcbiAqXG4gKiBAcGFyYW0gaW5wdXQgQSBzdHJpbmcgY29udGFpbmluZyB0aGUgWUFNTC1saWtlIGlucHV0XG4gKiBAcGFyYW0gZXJyb3JzIEFycmF5IHRvIGNvbGxlY3QgcGFyc2luZyBlcnJvcnNcbiAqIEByZXR1cm5zIFRoZSBwYXJzZWQgcmVwcmVzZW50YXRpb24gKFlhbWxNYXBOb2RlLCBZYW1sU2VxdWVuY2VOb2RlLCBvciBZYW1sU2NhbGFyTm9kZSlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKGlucHV0OiBzdHJpbmcsIGVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdLCBvcHRpb25zOiBQYXJzZU9wdGlvbnMgPSB7fSk6IFlhbWxOb2RlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc2Nhbm5lciA9IG5ldyBZYW1sU2Nhbm5lcihpbnB1dCk7XG5cdGNvbnN0IHRva2VucyA9IHNjYW5uZXIuc2NhbigpO1xuXHRjb25zdCBwYXJzZXIgPSBuZXcgWWFtbFBhcnNlcih0b2tlbnMsIGlucHV0LCBlcnJvcnMsIG9wdGlvbnMpO1xuXHRyZXR1cm4gcGFyc2VyLnBhcnNlKCk7XG59XG5cbi8qKlxuICogSGVscGVyIHRvIHBhcnNlIGEgTWFya2Rvd24gd2l0aCBZQU1MIGZyb250bWF0dGVyIGRvY3VtZW50XG4gKiBAcmV0dXJuc1xuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VGcm9udE1hdHRlcihpbnB1dDogc3RyaW5nLCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXSwgb3B0aW9uczogUGFyc2VPcHRpb25zID0ge30pOiBNYXJrZG93bk5vZGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCB0b2tlbnMgPSBuZXcgWWFtbFNjYW5uZXIoaW5wdXQpLnNjYW4oKTtcblx0aWYgKHRva2Vucy5sZW5ndGggPT09IDAgfHwgdG9rZW5zWzBdLnR5cGUgIT09IFRva2VuVHlwZS5Eb2N1bWVudFN0YXJ0KSB7XG5cdFx0Ly8gZG9lcyBub3Qgc3RhcnQgd2l0aCBhIGZyb250bWF0dGVyIGhlYWRlciAoLS0tKVxuXHRcdHJldHVybiBuZXcgTWFya2Rvd25Ob2RlKHVuZGVmaW5lZCwgaW5wdXQpO1xuXHR9XG5cdGNvbnN0IGhhc0Nsb3NpbmdGcm9udE1hdHRlciA9IHRva2Vucy5zbGljZSgxKS5zb21lKHRva2VuID0+IHRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5Eb2N1bWVudFN0YXJ0KTtcblx0aWYgKCFoYXNDbG9zaW5nRnJvbnRNYXR0ZXIpIHtcblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duTm9kZSh1bmRlZmluZWQsIGlucHV0KTtcblx0fVxuXHRjb25zdCBoZWFkZXIgPSBuZXcgWWFtbFBhcnNlcih0b2tlbnMsIGlucHV0LCBlcnJvcnMsIG9wdGlvbnMpLnBhcnNlKCk7XG5cdGNvbnN0IGxhc3RUb2tlbiA9IHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV07XG5cdGNvbnN0IGJvZHkgPSBsYXN0VG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkVPRiA/IGlucHV0LnN1YnN0cmluZyhsYXN0VG9rZW4uc3RhcnRPZmZzZXQpIDogJyc7XG5cdHJldHVybiBuZXcgTWFya2Rvd25Ob2RlKGhlYWRlciwgYm9keSk7XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrZG93bk5vZGUge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgaGVhZGVyOiBZYW1sTm9kZSB8IHVuZGVmaW5lZCwgcHVibGljIHJlYWRvbmx5IGJvZHk6IHN0cmluZykge1xuXHR9XG5cblx0Z2V0U3RyaW5nVmFsdWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5oZWFkZXIgJiYgdGhpcy5oZWFkZXIudHlwZSA9PT0gJ21hcCcpIHtcblx0XHRcdGNvbnN0IHByb3BlcnR5ID0gdGhpcy5oZWFkZXIucHJvcGVydGllcy5maW5kKHAgPT4gcC5rZXkudmFsdWUgPT09IG5hbWUpO1xuXHRcdFx0aWYgKHByb3BlcnR5ICYmIHByb3BlcnR5LnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdHJldHVybiBwcm9wZXJ0eS52YWx1ZS52YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFN0cmluZ0FycmF5VmFsdWUobmFtZTogc3RyaW5nKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmhlYWRlciAmJiB0aGlzLmhlYWRlci50eXBlID09PSAnbWFwJykge1xuXHRcdFx0Y29uc3QgcHJvcGVydHkgPSB0aGlzLmhlYWRlci5wcm9wZXJ0aWVzLmZpbmQocCA9PiBwLmtleS52YWx1ZSA9PT0gbmFtZSk7XG5cdFx0XHRpZiAocHJvcGVydHkgJiYgcHJvcGVydHkudmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRyZXR1cm4gcHJvcGVydHkudmFsdWUuaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS50eXBlID09PSAnc2NhbGFyJykubWFwKGl0ZW0gPT4gaXRlbS52YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHByb3BlcnR5ICYmIHByb3BlcnR5LnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdGlmIChwcm9wZXJ0eS52YWx1ZS5mb3JtYXQgPT09ICdub25lJykge1xuXHRcdFx0XHRcdHJldHVybiBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdChwcm9wZXJ0eS52YWx1ZS52YWx1ZSwgMCkubWFwKGl0ZW0gPT4gaXRlbS52YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtwcm9wZXJ0eS52YWx1ZS52YWx1ZV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEJvb2xlYW5WYWx1ZShuYW1lOiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuZ2V0U3RyaW5nVmFsdWUobmFtZSk7XG5cdFx0aWYgKHZhbHVlID09PSAndHJ1ZScpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09ICdmYWxzZScpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5cbi8qKlxuICogUGFyc2VzIGEgY29tbWEtc2VwYXJhdGVkIGxpc3QgZnJvbSBhIHNjYWxhciBub2RlJ3MgdmFsdWUgaW50byBhbiBhcnJheSBvZiBzY2FsYXJzLlxuICogSGFuZGxlcyBzaW5nbGUtcXVvdGVkIGFuZCBkb3VibGUtcXVvdGVkIGl0ZW1zLCB0cmltbWluZyBzdXJyb3VuZGluZyB3aGl0ZXNwYWNlIGZvclxuICogdW5xdW90ZWQgaXRlbXMuIE9mZnNldHMgb24gZWFjaCBwcm9kdWNlZCBzY2FsYXIgbm9kZSBhcmUgcmVsYXRpdmUgdG8gdGhlIG9yaWdpbmFsXG4gKiBkb2N1bWVudCB0aGF0IHRoZSBpbnB1dCBzY2FsYXIgd2FzIHBhcnNlZCBmcm9tLlxuICpcbiAqIEludGVybmFsbHkgd3JhcHMgdGhlIHNjYWxhciB2YWx1ZSBpbiBgW1x1MjAyNl1gIGFuZCBkZWxlZ2F0ZXMgdG8gdGhlIGZ1bGwgWUFNTCBwYXJzZXIgc29cbiAqIHRoYXQgcXVvdGluZywgd2hpdGVzcGFjZSwgYW5kIGVzY2FwZSBoYW5kbGluZyBhcmUgY29uc2lzdGVudCB3aXRoIHRoZSByZXN0IG9mIHRoZSBwYXJzZXIuXG4gKlxuICogQHBhcmFtIHNjYWxhciBBIHNjYWxhciBub2RlIHdob3NlIHZhbHVlIGNvbnRhaW5zIGEgY29tbWEtc2VwYXJhdGVkIGxpc3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCh2YWx1ZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciA9IDApOiBZYW1sU2NhbGFyTm9kZVtdIHtcblx0Ly8gV3JhcCB0aGUgdmFsdWUgYXMgYSBZQU1MIGZsb3cgc2VxdWVuY2UgYW5kIHBhcnNlIGl0LlxuXHRjb25zdCBwYXJzZWQgPSBwYXJzZShgWyR7dmFsdWV9XWApO1xuXHQvLyBJdGVtcyBmcm9tIHRoZSBzeW50aGV0aWMgc3RyaW5nIHN0YXJ0IGF0IG9mZnNldCAxIChhZnRlciB0aGUgJ1snKS5cblx0Ly8gU2hpZnQgdGhlbSBzbyB0aGV5J3JlIHJlbGF0aXZlIHRvIHRoZSBvcmlnaW5hbCBkb2N1bWVudCBwb3NpdGlvbi5cblx0Y29uc3Qgc2hpZnQgPSBvZmZzZXQgLSAxO1xuXHRjb25zdCBpdGVtczogWWFtbFNjYWxhck5vZGVbXSA9IFtdO1xuXHRpZiAocGFyc2VkICYmIHBhcnNlZC50eXBlID09PSAnc2VxdWVuY2UnKSB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHBhcnNlZC5pdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7IC4uLml0ZW0sIHN0YXJ0T2Zmc2V0OiBpdGVtLnN0YXJ0T2Zmc2V0ICsgc2hpZnQsIGVuZE9mZnNldDogaXRlbS5lbmRPZmZzZXQgKyBzaGlmdCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZSwgcmF3VmFsdWU6IHZhbHVlLCBzdGFydE9mZnNldDogb2Zmc2V0LCBlbmRPZmZzZXQ6IHZhbHVlLmxlbmd0aCArIG9mZnNldCwgZm9ybWF0OiAnbm9uZScgfSk7XG5cdH1cblx0cmV0dXJuIGl0ZW1zO1xufVxuXG4vLyAtLSBBU1QgTm9kZSBUeXBlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBpbnRlcmZhY2UgWWFtbFNjYWxhck5vZGUge1xuXHRyZWFkb25seSB0eXBlOiAnc2NhbGFyJztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0cmVhZG9ubHkgcmF3VmFsdWU6IHN0cmluZztcblx0cmVhZG9ubHkgc3RhcnRPZmZzZXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZW5kT2Zmc2V0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGZvcm1hdDogJ3NpbmdsZScgfCAnZG91YmxlJyB8ICdub25lJyB8ICdsaXRlcmFsJyB8ICdmb2xkZWQnO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFlhbWxNYXBOb2RlIHtcblx0cmVhZG9ubHkgdHlwZTogJ21hcCc7XG5cdHJlYWRvbmx5IHByb3BlcnRpZXM6IHsga2V5OiBZYW1sU2NhbGFyTm9kZTsgdmFsdWU6IFlhbWxOb2RlIH1bXTtcblx0cmVhZG9ubHkgc3R5bGU6ICdibG9jaycgfCAnZmxvdyc7XG5cdHJlYWRvbmx5IHN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZE9mZnNldDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFlhbWxTZXF1ZW5jZU5vZGUge1xuXHRyZWFkb25seSB0eXBlOiAnc2VxdWVuY2UnO1xuXHRyZWFkb25seSBpdGVtczogWWFtbE5vZGVbXTtcblx0cmVhZG9ubHkgc3R5bGU6ICdibG9jaycgfCAnZmxvdyc7XG5cdHJlYWRvbmx5IHN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZE9mZnNldDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBZYW1sTm9kZSA9IFlhbWxTZXF1ZW5jZU5vZGUgfCBZYW1sTWFwTm9kZSB8IFlhbWxTY2FsYXJOb2RlO1xuXG5leHBvcnQgaW50ZXJmYWNlIFlhbWxQYXJzZUVycm9yIHtcblx0cmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nO1xuXHRyZWFkb25seSBzdGFydE9mZnNldDogbnVtYmVyO1xuXHRyZWFkb25seSBlbmRPZmZzZXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY29kZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFsbG93RHVwbGljYXRlS2V5cz86IGJvb2xlYW47XG59XG5cbi8vIC0tIFRva2VuIFR5cGVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgZW51bSBUb2tlblR5cGUge1xuXHQvLyBTY2FsYXIgdmFsdWVzICh1bnF1b3RlZCwgc2luZ2xlLXF1b3RlZCwgZG91YmxlLXF1b3RlZClcblx0U2NhbGFyLFxuXHQvLyBTdHJ1Y3R1cmFsIHRva2Vuc1xuXHRDb2xvbiwgICAgICAgICAgIC8vICc6J1xuXHREYXNoLCAgICAgICAgICAgIC8vICctICdcblx0Q29tbWEsICAgICAgICAgICAvLyAnLCdcblx0Rmxvd01hcFN0YXJ0LCAgICAvLyAneydcblx0Rmxvd01hcEVuZCwgICAgICAvLyAnfSdcblx0Rmxvd1NlcVN0YXJ0LCAgICAvLyAnWydcblx0Rmxvd1NlcUVuZCwgICAgICAvLyAnXSdcblx0Ly8gV2hpdGVzcGFjZSAvIHN0cnVjdHVyZVxuXHROZXdsaW5lLFxuXHRJbmRlbnQsICAgICAgICAgIC8vIGxlYWRpbmcgd2hpdGVzcGFjZSBhdCBzdGFydCBvZiBsaW5lIChjYXJyaWVzIHRoZSBpbmRlbnQgbGV2ZWwpXG5cdENvbW1lbnQsXG5cdERvY3VtZW50U3RhcnQsICAvLyAnLS0tJ1xuXHREb2N1bWVudEVuZCwgICAgLy8gJy4uLidcblx0RU9GLFxufVxuXG5pbnRlcmZhY2UgVG9rZW4ge1xuXHRyZWFkb25seSB0eXBlOiBUb2tlblR5cGU7XG5cdHJlYWRvbmx5IHN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZE9mZnNldDogbnVtYmVyO1xuXHQvKiogRm9yIFNjYWxhciB0b2tlbnM6IHRoZSByYXcgdGV4dCAoaW5jbHVkaW5nIHF1b3RlcykuICovXG5cdHJlYWRvbmx5IHJhd1ZhbHVlOiBzdHJpbmc7XG5cdC8qKiBGb3IgU2NhbGFyIHRva2VuczogdGhlIGludGVycHJldGVkIHN0cmluZyB2YWx1ZS4gKi9cblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0LyoqIEZvciBTY2FsYXIgdG9rZW5zOiBxdW90ZSBzdHlsZS4gKi9cblx0cmVhZG9ubHkgZm9ybWF0OiAnc2luZ2xlJyB8ICdkb3VibGUnIHwgJ25vbmUnIHwgJ2xpdGVyYWwnIHwgJ2ZvbGRlZCc7XG5cdC8qKiBGb3IgSW5kZW50IHRva2VuczogdGhlIGNvbHVtbiAobnVtYmVyIG9mIHNwYWNlcykuICovXG5cdHJlYWRvbmx5IGluZGVudDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBtYWtlVG9rZW4oXG5cdHR5cGU6IFRva2VuVHlwZSxcblx0c3RhcnRPZmZzZXQ6IG51bWJlcixcblx0ZW5kT2Zmc2V0OiBudW1iZXIsXG5cdGV4dHJhPzogUGFydGlhbDxQaWNrPFRva2VuLCAncmF3VmFsdWUnIHwgJ3ZhbHVlJyB8ICdmb3JtYXQnIHwgJ2luZGVudCc+PlxuKTogVG9rZW4ge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGUsXG5cdFx0c3RhcnRPZmZzZXQsXG5cdFx0ZW5kT2Zmc2V0LFxuXHRcdHJhd1ZhbHVlOiBleHRyYT8ucmF3VmFsdWUgPz8gJycsXG5cdFx0dmFsdWU6IGV4dHJhPy52YWx1ZSA/PyAnJyxcblx0XHRmb3JtYXQ6IGV4dHJhPy5mb3JtYXQgPz8gJ25vbmUnIGFzIFRva2VuWydmb3JtYXQnXSxcblx0XHRpbmRlbnQ6IGV4dHJhPy5pbmRlbnQgPz8gMCxcblx0fTtcbn1cblxuLy8gLS0gU2Nhbm5lciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBZYW1sU2Nhbm5lciB7XG5cdHByaXZhdGUgcG9zID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSB0b2tlbnM6IFRva2VuW10gPSBbXTtcblx0Ly8gVHJhY2sgZmxvdyBuZXN0aW5nIGRlcHRoIHNvIGNvbW1hcyBhbmQgZmxvdyBpbmRpY2F0b3JzIGFyZSBvbmx5IHNwZWNpYWwgaW5zaWRlIGZsb3cgY29sbGVjdGlvbnNcblx0cHJpdmF0ZSBmbG93RGVwdGggPSAwO1xuXHQvLyBUcmFjayB3aGV0aGVyIHdlJ3ZlIGFscmVhZHkgc2VlbiBhIGJsb2NrIGNvbG9uIG9uIHRoZSBjdXJyZW50IGxpbmUuXG5cdC8vIEFmdGVyIHRoZSBmaXJzdCBrZXk6IHZhbHVlIGNvbG9uLCBzdWJzZXF1ZW50ICc6ICcgb24gdGhlIHNhbWUgbGluZSBpcyBwYXJ0IG9mIHRoZSBzY2FsYXIgdmFsdWUuXG5cdHByaXZhdGUgc2VlbkJsb2NrQ29sb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBzZWVuRG9jdW1lbnRTdGFydCA9IDA7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBpbnB1dDogc3RyaW5nKSB7IH1cblxuXHRzY2FuKG1heERvY3VtZW50cyA9IDEpOiBUb2tlbltdIHtcblx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zY2FuTGluZSgpO1xuXHRcdFx0aWYgKHRoaXMuc2VlbkRvY3VtZW50U3RhcnQgPiBtYXhEb2N1bWVudHMpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5FT0YsIHRoaXMucG9zLCB0aGlzLnBvcykpO1xuXHRcdHJldHVybiB0aGlzLnRva2Vucztcblx0fVxuXG5cdC8vIFNjYW4gYSBzaW5nbGUgbG9naWNhbCBsaW5lICh1cCB0byBhbmQgaW5jbHVkaW5nIHRoZSBuZXdsaW5lIGNoYXJhY3Rlcilcblx0cHJpdmF0ZSBzY2FuTGluZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNlZW5CbG9ja0NvbG9uID0gZmFsc2U7XG5cdFx0Ly8gSGFuZGxlIGJsYW5rIGxpbmVzIC8gbGluZXMgdGhhdCBhcmUgb25seSB3aGl0ZXNwYWNlXG5cdFx0aWYgKHRoaXMucGVla0NoYXIoKSA9PT0gJ1xcbicpIHtcblx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5OZXdsaW5lLCB0aGlzLnBvcywgdGhpcy5wb3MgKyAxKSk7XG5cdFx0XHR0aGlzLnBvcysrO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5wZWVrQ2hhcigpID09PSAnXFxyJykge1xuXHRcdFx0Y29uc3QgZW5kID0gdGhpcy5wb3MgKyAodGhpcy5pbnB1dFt0aGlzLnBvcyArIDFdID09PSAnXFxuJyA/IDIgOiAxKTtcblx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5OZXdsaW5lLCB0aGlzLnBvcywgZW5kKSk7XG5cdFx0XHR0aGlzLnBvcyA9IGVuZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNZWFzdXJlIGxlYWRpbmcgd2hpdGVzcGFjZSBcdTIxOTIgSW5kZW50IHRva2VuXG5cdFx0Y29uc3QgaW5kZW50U3RhcnQgPSB0aGlzLnBvcztcblx0XHRsZXQgaW5kZW50ID0gMDtcblx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCAmJiAodGhpcy5pbnB1dFt0aGlzLnBvc10gPT09ICcgJyB8fCB0aGlzLmlucHV0W3RoaXMucG9zXSA9PT0gJ1xcdCcpKSB7XG5cdFx0XHRpbmRlbnQrKztcblx0XHRcdHRoaXMucG9zKys7XG5cdFx0fVxuXHRcdGlmIChpbmRlbnQgPiAwKSB7XG5cdFx0XHR0aGlzLnRva2Vucy5wdXNoKG1ha2VUb2tlbihUb2tlblR5cGUuSW5kZW50LCBpbmRlbnRTdGFydCwgdGhpcy5wb3MsIHsgaW5kZW50IH0pKTtcblx0XHR9XG5cblx0XHQvLyBJZiBsaW5lIGlzIG5vdyBlbXB0eSAob25seSB3aGl0ZXNwYWNlIGJlZm9yZSBuZXdsaW5lL0VPRiksIGVtaXQgbmV3bGluZVxuXHRcdGlmICh0aGlzLnBvcyA+PSB0aGlzLmlucHV0Lmxlbmd0aCB8fCB0aGlzLnBlZWtDaGFyKCkgPT09ICdcXG4nIHx8IHRoaXMucGVla0NoYXIoKSA9PT0gJ1xccicpIHtcblx0XHRcdGlmICh0aGlzLnBvcyA8IHRoaXMuaW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IG5sU3RhcnQgPSB0aGlzLnBvcztcblx0XHRcdFx0Y29uc3QgZW5kID0gdGhpcy5wZWVrQ2hhcigpID09PSAnXFxyJyAmJiB0aGlzLmlucHV0W3RoaXMucG9zICsgMV0gPT09ICdcXG4nID8gdGhpcy5wb3MgKyAyIDogdGhpcy5wb3MgKyAxO1xuXHRcdFx0XHR0aGlzLnRva2Vucy5wdXNoKG1ha2VUb2tlbihUb2tlblR5cGUuTmV3bGluZSwgbmxTdGFydCwgZW5kKSk7XG5cdFx0XHRcdHRoaXMucG9zID0gZW5kO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBkb2N1bWVudCBtYXJrZXJzICgtLS0gLyAuLi4pIGF0IGNvbHVtbiAwXG5cdFx0aWYgKGluZGVudCA9PT0gMCAmJiB0aGlzLmlucHV0Lmxlbmd0aCAtIHRoaXMucG9zID49IDMpIHtcblx0XHRcdGNvbnN0IGMwID0gdGhpcy5pbnB1dFt0aGlzLnBvc107XG5cdFx0XHRjb25zdCBjMSA9IHRoaXMuaW5wdXRbdGhpcy5wb3MgKyAxXTtcblx0XHRcdGNvbnN0IGMyID0gdGhpcy5pbnB1dFt0aGlzLnBvcyArIDJdO1xuXHRcdFx0Y29uc3QgYzMgPSB0aGlzLmlucHV0W3RoaXMucG9zICsgM107XG5cdFx0XHRjb25zdCBpc1Rlcm1pbmF0b3IgPSBjMyA9PT0gdW5kZWZpbmVkIHx8IGMzID09PSAnICcgfHwgYzMgPT09ICdcXHQnIHx8IGMzID09PSAnXFxuJyB8fCBjMyA9PT0gJ1xccic7XG5cdFx0XHRpZiAoYzAgPT09ICctJyAmJiBjMSA9PT0gJy0nICYmIGMyID09PSAnLScgJiYgaXNUZXJtaW5hdG9yKSB7XG5cdFx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5Eb2N1bWVudFN0YXJ0LCB0aGlzLnBvcywgdGhpcy5wb3MgKyAzKSk7XG5cdFx0XHRcdHRoaXMucG9zICs9IDM7XG5cdFx0XHRcdHRoaXMuc2NhbkxpbmVDb250ZW50KCk7XG5cdFx0XHRcdHRoaXMuc2Nhbk5ld2xpbmUoKTtcblx0XHRcdFx0dGhpcy5zZWVuRG9jdW1lbnRTdGFydCsrO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoYzAgPT09ICcuJyAmJiBjMSA9PT0gJy4nICYmIGMyID09PSAnLicgJiYgaXNUZXJtaW5hdG9yKSB7XG5cdFx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5Eb2N1bWVudEVuZCwgdGhpcy5wb3MsIHRoaXMucG9zICsgMykpO1xuXHRcdFx0XHR0aGlzLnBvcyArPSAzO1xuXHRcdFx0XHR0aGlzLnNjYW5MaW5lQ29udGVudCgpO1xuXHRcdFx0XHR0aGlzLnNjYW5OZXdsaW5lKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgY29tbWVudC1vbmx5IGxpbmVcblx0XHRpZiAodGhpcy5wZWVrQ2hhcigpID09PSAnIycpIHtcblx0XHRcdHRoaXMuc2NhbkNvbW1lbnQoKTtcblx0XHRcdHRoaXMuc2Nhbk5ld2xpbmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTa2lwIGRpcmVjdGl2ZSBsaW5lcyAoZS5nLiwgJVlBTUwgMS4yLCAlVEFHKSAtIGNvbnN1bWUgcmVzdCBvZiBsaW5lXG5cdFx0aWYgKHRoaXMucGVla0NoYXIoKSA9PT0gJyUnKSB7XG5cdFx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCAmJiB0aGlzLmlucHV0W3RoaXMucG9zXSAhPT0gJ1xcbicgJiYgdGhpcy5pbnB1dFt0aGlzLnBvc10gIT09ICdcXHInKSB7XG5cdFx0XHRcdHRoaXMucG9zKys7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNjYW5OZXdsaW5lKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2NhbiB0aGUgcmVzdCBvZiB0aGUgbGluZSBmb3IgdG9rZW5zXG5cdFx0dGhpcy5zY2FuTGluZUNvbnRlbnQoKTtcblx0XHR0aGlzLnNjYW5OZXdsaW5lKCk7XG5cdH1cblxuXHRwcml2YXRlIHNjYW5MaW5lQ29udGVudCgpOiB2b2lkIHtcblx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCAmJiB0aGlzLnBlZWtDaGFyKCkgIT09ICdcXG4nICYmIHRoaXMucGVla0NoYXIoKSAhPT0gJ1xccicpIHtcblx0XHRcdHRoaXMuc2tpcElubGluZVdoaXRlc3BhY2UoKTtcblx0XHRcdGlmICh0aGlzLnBvcyA+PSB0aGlzLmlucHV0Lmxlbmd0aCB8fCB0aGlzLnBlZWtDaGFyKCkgPT09ICdcXG4nIHx8IHRoaXMucGVla0NoYXIoKSA9PT0gJ1xccicpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoID0gdGhpcy5wZWVrQ2hhcigpO1xuXG5cdFx0XHRpZiAoY2ggPT09ICcjJykge1xuXHRcdFx0XHR0aGlzLnNjYW5Db21tZW50KCk7XG5cdFx0XHRcdGJyZWFrOyAvLyBjb21tZW50IGNvbnN1bWVzIHJlc3Qgb2YgbGluZVxuXHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gJ3snKSB7XG5cdFx0XHRcdHRoaXMuZmxvd0RlcHRoKys7XG5cdFx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5GbG93TWFwU3RhcnQsIHRoaXMucG9zLCB0aGlzLnBvcyArIDEpKTtcblx0XHRcdFx0dGhpcy5wb3MrKztcblx0XHRcdH0gZWxzZSBpZiAoY2ggPT09ICd9JyAmJiB0aGlzLmZsb3dEZXB0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5mbG93RGVwdGgtLTtcblx0XHRcdFx0dGhpcy50b2tlbnMucHVzaChtYWtlVG9rZW4oVG9rZW5UeXBlLkZsb3dNYXBFbmQsIHRoaXMucG9zLCB0aGlzLnBvcyArIDEpKTtcblx0XHRcdFx0dGhpcy5wb3MrKztcblx0XHRcdH0gZWxzZSBpZiAoY2ggPT09ICdbJykge1xuXHRcdFx0XHR0aGlzLmZsb3dEZXB0aCsrO1xuXHRcdFx0XHR0aGlzLnRva2Vucy5wdXNoKG1ha2VUb2tlbihUb2tlblR5cGUuRmxvd1NlcVN0YXJ0LCB0aGlzLnBvcywgdGhpcy5wb3MgKyAxKSk7XG5cdFx0XHRcdHRoaXMucG9zKys7XG5cdFx0XHR9IGVsc2UgaWYgKGNoID09PSAnXScgJiYgdGhpcy5mbG93RGVwdGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuZmxvd0RlcHRoLS07XG5cdFx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5GbG93U2VxRW5kLCB0aGlzLnBvcywgdGhpcy5wb3MgKyAxKSk7XG5cdFx0XHRcdHRoaXMucG9zKys7XG5cdFx0XHR9IGVsc2UgaWYgKGNoID09PSAnLCcgJiYgdGhpcy5mbG93RGVwdGggPiAwKSB7XG5cdFx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5Db21tYSwgdGhpcy5wb3MsIHRoaXMucG9zICsgMSkpO1xuXHRcdFx0XHR0aGlzLnBvcysrO1xuXHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gJy0nICYmIHRoaXMuaXNCbG9ja0Rhc2goKSkge1xuXHRcdFx0XHQvLyBCbG9jayBzZXF1ZW5jZSBpbmRpY2F0b3I6ICctICcgb3IgJy0nIGF0IGVuZCBvZiBsaW5lXG5cdFx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5EYXNoLCB0aGlzLnBvcywgdGhpcy5wb3MgKyAxKSk7XG5cdFx0XHRcdHRoaXMucG9zKys7XG5cdFx0XHR9IGVsc2UgaWYgKGNoID09PSAnOicgJiYgdGhpcy5pc0Jsb2NrQ29sb24oKSkge1xuXHRcdFx0XHR0aGlzLnRva2Vucy5wdXNoKG1ha2VUb2tlbihUb2tlblR5cGUuQ29sb24sIHRoaXMucG9zLCB0aGlzLnBvcyArIDEpKTtcblx0XHRcdFx0dGhpcy5wb3MrKztcblx0XHRcdFx0aWYgKHRoaXMuZmxvd0RlcHRoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWVuQmxvY2tDb2xvbiA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoY2ggPT09ICc6JyAmJiB0aGlzLmZsb3dEZXB0aCA+IDAgJiYgdGhpcy5sYXN0VG9rZW5Jc0pzb25MaWtlKCkpIHtcblx0XHRcdFx0Ly8gSW4gZmxvdyBjb250ZXh0LCAnOicgaW1tZWRpYXRlbHkgZm9sbG93aW5nIGEgSlNPTi1saWtlIG5vZGUgKHF1b3RlZCBzY2FsYXIsXG5cdFx0XHRcdC8vIGZsb3cgbWFwcGluZywgb3IgZmxvdyBzZXF1ZW5jZSkgaXMgYSB2YWx1ZSBpbmRpY2F0b3IgZXZlbiB3aXRob3V0IHRyYWlsaW5nIHNwYWNlXG5cdFx0XHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5Db2xvbiwgdGhpcy5wb3MsIHRoaXMucG9zICsgMSkpO1xuXHRcdFx0XHR0aGlzLnBvcysrO1xuXHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gJ1xcJycgfHwgY2ggPT09ICdcIicpIHtcblx0XHRcdFx0dGhpcy5zY2FuUXVvdGVkU2NhbGFyKGNoKTtcblx0XHRcdH0gZWxzZSBpZiAoKGNoID09PSAnfCcgfHwgY2ggPT09ICc+JykgJiYgdGhpcy5mbG93RGVwdGggPT09IDAgJiYgdGhpcy5pc0Jsb2NrU2NhbGFyU3RhcnQoKSkge1xuXHRcdFx0XHR0aGlzLnNjYW5CbG9ja1NjYWxhcihjaCBhcyAnfCcgfCAnPicpO1xuXHRcdFx0XHRicmVhazsgLy8gQmxvY2sgc2NhbGFyIGNvbnN1bWVkIG11bHRpcGxlIGxpbmVzOyByZXR1cm4gdG8gbWFpbiBzY2FuIGxvb3Bcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2NhblVucXVvdGVkU2NhbGFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIENoZWNrIGlmICctJyBpcyBhIGJsb2NrIHNlcXVlbmNlIGRhc2ggKGZvbGxvd2VkIGJ5IHNwYWNlLCBuZXdsaW5lLCBvciBFT0YpICovXG5cdHByaXZhdGUgaXNCbG9ja0Rhc2goKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbmV4dCA9IHRoaXMuaW5wdXRbdGhpcy5wb3MgKyAxXTtcblx0XHRyZXR1cm4gbmV4dCA9PT0gdW5kZWZpbmVkIHx8IG5leHQgPT09ICcgJyB8fCBuZXh0ID09PSAnXFx0JyB8fCBuZXh0ID09PSAnXFxuJyB8fCBuZXh0ID09PSAnXFxyJztcblx0fVxuXG5cdC8qKiBDaGVjayBpZiAnOicgYWN0cyBhcyBhIG1hcHBpbmcgdmFsdWUgaW5kaWNhdG9yIChmb2xsb3dlZCBieSBzcGFjZSwgbmV3bGluZSwgRU9GLCBvciBmbG93IGluZGljYXRvcikgKi9cblx0cHJpdmF0ZSBpc0Jsb2NrQ29sb24oKTogYm9vbGVhbiB7XG5cdFx0Ly8gSW4gYmxvY2sgY29udGV4dCwgYWZ0ZXIgdGhlIGZpcnN0IGtleS12YWx1ZSBjb2xvbiBvbiBhIGxpbmUsXG5cdFx0Ly8gc3Vic2VxdWVudCAnOiAnIGlzIHBhcnQgb2YgdGhlIHNjYWxhciB2YWx1ZSwgbm90IGEgbWFwcGluZyBpbmRpY2F0b3IuXG5cdFx0aWYgKHRoaXMuc2VlbkJsb2NrQ29sb24gJiYgdGhpcy5mbG93RGVwdGggPT09IDApIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0Y29uc3QgbmV4dCA9IHRoaXMuaW5wdXRbdGhpcy5wb3MgKyAxXTtcblx0XHRpZiAobmV4dCA9PT0gdW5kZWZpbmVkIHx8IG5leHQgPT09ICcgJyB8fCBuZXh0ID09PSAnXFx0JyB8fCBuZXh0ID09PSAnXFxuJyB8fCBuZXh0ID09PSAnXFxyJykgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdC8vIEZsb3cgaW5kaWNhdG9ycyBhZnRlciBjb2xvbiBvbmx5IGNvdW50IGluc2lkZSBmbG93IGNvbnRleHRcblx0XHRpZiAodGhpcy5mbG93RGVwdGggPiAwICYmIChuZXh0ID09PSAnLCcgfHwgbmV4dCA9PT0gJ30nIHx8IG5leHQgPT09ICddJykpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKiogQ2hlY2sgaWYgdGhlIGxhc3Qgbm9uLXdoaXRlc3BhY2UgdG9rZW4gaXMgYSBKU09OLWxpa2Ugbm9kZSAocXVvdGVkIHNjYWxhciBvciBmbG93IGVuZCkgKi9cblx0cHJpdmF0ZSBsYXN0VG9rZW5Jc0pzb25MaWtlKCk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLnRva2Vucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgdCA9IHRoaXMudG9rZW5zW2ldO1xuXHRcdFx0aWYgKHQudHlwZSA9PT0gVG9rZW5UeXBlLk5ld2xpbmUgfHwgdC50eXBlID09PSBUb2tlblR5cGUuSW5kZW50IHx8IHQudHlwZSA9PT0gVG9rZW5UeXBlLkNvbW1lbnQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBRdW90ZWQgc2NhbGFyIG9yIGZsb3cgY29sbGVjdGlvbiBlbmQgYnJhY2tldFxuXHRcdFx0aWYgKHQudHlwZSA9PT0gVG9rZW5UeXBlLlNjYWxhciAmJiB0LmZvcm1hdCAhPT0gJ25vbmUnKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRpZiAodC50eXBlID09PSBUb2tlblR5cGUuRmxvd01hcEVuZCB8fCB0LnR5cGUgPT09IFRva2VuVHlwZS5GbG93U2VxRW5kKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgc2NhblF1b3RlZFNjYWxhcihxdW90ZTogJ1xcJycgfCAnXCInKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLnBvcztcblx0XHR0aGlzLnBvcysrOyAvLyBza2lwIG9wZW5pbmcgcXVvdGVcblx0XHRsZXQgdmFsdWUgPSAnJztcblx0XHQvLyBUcmFjayB0cmFpbGluZyBsaXRlcmFsIHdoaXRlc3BhY2UgY291bnQgc28gZmxvdyBmb2xkaW5nIG9ubHkgdHJpbXNcblx0XHQvLyBzb3VyY2UtbGV2ZWwgd2hpdGVzcGFjZSwgbm90IHdoaXRlc3BhY2UgcHJvZHVjZWQgYnkgZXNjYXBlIHNlcXVlbmNlc1xuXHRcdGxldCB0cmFpbGluZ0xpdGVyYWxXcyA9IDA7XG5cblx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgY2ggPSB0aGlzLmlucHV0W3RoaXMucG9zXTtcblx0XHRcdGlmIChjaCA9PT0gcXVvdGUpIHtcblx0XHRcdFx0Ly8gSW4gc2luZ2xlLXF1b3RlZCBzdHJpbmdzLCAnJyBpcyBhbiBlc2NhcGVkIHNpbmdsZSBxdW90ZVxuXHRcdFx0XHRpZiAocXVvdGUgPT09ICdcXCcnICYmIHRoaXMuaW5wdXRbdGhpcy5wb3MgKyAxXSA9PT0gJ1xcJycpIHtcblx0XHRcdFx0XHR2YWx1ZSArPSAnXFwnJztcblx0XHRcdFx0XHR0aGlzLnBvcyArPSAyO1xuXHRcdFx0XHRcdHRyYWlsaW5nTGl0ZXJhbFdzID0gMDtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnBvcysrOyAvLyBza2lwIGNsb3NpbmcgcXVvdGVcblx0XHRcdFx0Y29uc3QgcmF3VmFsdWUgPSB0aGlzLmlucHV0LnN1YnN0cmluZyhzdGFydCwgdGhpcy5wb3MpO1xuXHRcdFx0XHR0aGlzLnRva2Vucy5wdXNoKG1ha2VUb2tlbihUb2tlblR5cGUuU2NhbGFyLCBzdGFydCwgdGhpcy5wb3MsIHtcblx0XHRcdFx0XHRyYXdWYWx1ZSxcblx0XHRcdFx0XHR2YWx1ZSxcblx0XHRcdFx0XHRmb3JtYXQ6IHF1b3RlID09PSAnXFwnJyA/ICdzaW5nbGUnIDogJ2RvdWJsZScsXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIYW5kbGUgZXNjYXBlIHNlcXVlbmNlcyBpbiBkb3VibGUtcXVvdGVkIHN0cmluZ3Ncblx0XHRcdGlmIChxdW90ZSA9PT0gJ1wiJyAmJiBjaCA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdGNvbnN0IG5leHQgPSB0aGlzLmlucHV0W3RoaXMucG9zICsgMV07XG5cdFx0XHRcdC8vIEVzY2FwZWQgbGluZSBicmVhazogXFwgKyBuZXdsaW5lIFx1MjE5MiBqb2luIGxpbmVzIHdpdGhvdXQgaW5zZXJ0aW5nIGEgc3BhY2Vcblx0XHRcdFx0aWYgKG5leHQgPT09ICdcXG4nIHx8IG5leHQgPT09ICdcXHInKSB7XG5cdFx0XHRcdFx0dGhpcy5wb3MrKzsgLy8gc2tpcCAnXFwnXG5cdFx0XHRcdFx0dGhpcy5jb25zdW1lTmV3bGluZSgpO1xuXHRcdFx0XHRcdC8vIFN0cmlwIGxlYWRpbmcgd2hpdGVzcGFjZSBvbiBjb250aW51YXRpb24gbGluZVxuXHRcdFx0XHRcdHRoaXMuc2tpcElubGluZVdoaXRlc3BhY2UoKTtcblx0XHRcdFx0XHR0cmFpbGluZ0xpdGVyYWxXcyA9IDA7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dpdGNoIChuZXh0KSB7XG5cdFx0XHRcdFx0Y2FzZSAnbic6IHZhbHVlICs9ICdcXG4nOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICd0JzogdmFsdWUgKz0gJ1xcdCc7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ1xcXFwnOiB2YWx1ZSArPSAnXFxcXCc7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ1wiJzogdmFsdWUgKz0gJ1wiJzsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnLyc6IHZhbHVlICs9ICcvJzsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncic6IHZhbHVlICs9ICdcXHInOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICcwJzogdmFsdWUgKz0gJ1xcMCc7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2EnOiB2YWx1ZSArPSAnXFx4MDcnOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICdiJzogdmFsdWUgKz0gJ1xcYic7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2UnOiB2YWx1ZSArPSAnXFx4MWInOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICd2JzogdmFsdWUgKz0gJ1xcdic7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2YnOiB2YWx1ZSArPSAnXFxmJzsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnICc6IHZhbHVlICs9ICcgJzsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnXyc6IHZhbHVlICs9ICdcXHhhMCc7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3gnOiB7XG5cdFx0XHRcdFx0XHQvLyBcXHhOTiAtIDItZGlnaXQgaGV4IGVzY2FwZVxuXHRcdFx0XHRcdFx0Y29uc3QgaGV4ID0gdGhpcy5pbnB1dC5zdWJzdHJpbmcodGhpcy5wb3MgKyAyLCB0aGlzLnBvcyArIDQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29kZSA9IHBhcnNlSW50KGhleCwgMTYpO1xuXHRcdFx0XHRcdFx0aWYgKGhleC5sZW5ndGggPT09IDIgJiYgIWlzTmFOKGNvZGUpKSB7XG5cdFx0XHRcdFx0XHRcdHZhbHVlICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY29kZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMucG9zICs9IDQ7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR2YWx1ZSArPSAnXFxcXHgnO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnBvcyArPSAyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dHJhaWxpbmdMaXRlcmFsV3MgPSAwO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3UnOiB7XG5cdFx0XHRcdFx0XHQvLyBcXHVOTk5OIC0gNC1kaWdpdCB1bmljb2RlIGVzY2FwZVxuXHRcdFx0XHRcdFx0Y29uc3QgaGV4ID0gdGhpcy5pbnB1dC5zdWJzdHJpbmcodGhpcy5wb3MgKyAyLCB0aGlzLnBvcyArIDYpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29kZSA9IHBhcnNlSW50KGhleCwgMTYpO1xuXHRcdFx0XHRcdFx0aWYgKGhleC5sZW5ndGggPT09IDQgJiYgIWlzTmFOKGNvZGUpKSB7XG5cdFx0XHRcdFx0XHRcdHZhbHVlICs9IFN0cmluZy5mcm9tQ29kZVBvaW50KGNvZGUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnBvcyArPSA2O1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dmFsdWUgKz0gJ1xcXFx1Jztcblx0XHRcdFx0XHRcdFx0dGhpcy5wb3MgKz0gMjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRyYWlsaW5nTGl0ZXJhbFdzID0gMDtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdVJzoge1xuXHRcdFx0XHRcdFx0Ly8gXFxVTk5OTk5OTk4gLSA4LWRpZ2l0IHVuaWNvZGUgZXNjYXBlXG5cdFx0XHRcdFx0XHRjb25zdCBoZXggPSB0aGlzLmlucHV0LnN1YnN0cmluZyh0aGlzLnBvcyArIDIsIHRoaXMucG9zICsgMTApO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29kZSA9IHBhcnNlSW50KGhleCwgMTYpO1xuXHRcdFx0XHRcdFx0aWYgKGhleC5sZW5ndGggPT09IDggJiYgIWlzTmFOKGNvZGUpKSB7XG5cdFx0XHRcdFx0XHRcdHZhbHVlICs9IFN0cmluZy5mcm9tQ29kZVBvaW50KGNvZGUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnBvcyArPSAxMDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHZhbHVlICs9ICdcXFxcVSc7XG5cdFx0XHRcdFx0XHRcdHRoaXMucG9zICs9IDI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0cmFpbGluZ0xpdGVyYWxXcyA9IDA7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVmYXVsdDogdmFsdWUgKz0gJ1xcXFwnICsgKG5leHQgPz8gJycpOyBicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnBvcyArPSAyO1xuXHRcdFx0XHR0cmFpbGluZ0xpdGVyYWxXcyA9IDA7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGbG93IGZvbGRpbmc6IGhhbmRsZSBuZXdsaW5lcyBpbnNpZGUgcXVvdGVkIHNjYWxhcnMgKGJvdGggc2luZ2xlIGFuZCBkb3VibGUpXG5cdFx0XHRpZiAoY2ggPT09ICdcXG4nIHx8IGNoID09PSAnXFxyJykge1xuXHRcdFx0XHQvLyBUcmltIHRyYWlsaW5nIGxpdGVyYWwgd2hpdGVzcGFjZSAobm90IGVzY2FwZS1wcm9kdWNlZCB3aGl0ZXNwYWNlKVxuXHRcdFx0XHRpZiAodHJhaWxpbmdMaXRlcmFsV3MgPiAwKSB7XG5cdFx0XHRcdFx0dmFsdWUgPSB2YWx1ZS5zdWJzdHJpbmcoMCwgdmFsdWUubGVuZ3RoIC0gdHJhaWxpbmdMaXRlcmFsV3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyYWlsaW5nTGl0ZXJhbFdzID0gMDtcblxuXHRcdFx0XHQvLyBTa2lwIHRoZSBuZXdsaW5lXG5cdFx0XHRcdHRoaXMuY29uc3VtZU5ld2xpbmUoKTtcblxuXHRcdFx0XHQvLyBDb3VudCBlbXB0eSBsaW5lcyAobGluZXMgd2l0aCBvbmx5IHdoaXRlc3BhY2UpXG5cdFx0XHRcdGxldCBlbXB0eUxpbmVDb3VudCA9IDA7XG5cdFx0XHRcdHdoaWxlICh0aGlzLnBvcyA8IHRoaXMuaW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gU2tpcCB3aGl0ZXNwYWNlIGF0IHN0YXJ0IG9mIGxpbmVcblx0XHRcdFx0XHR0aGlzLnNraXBJbmxpbmVXaGl0ZXNwYWNlKCk7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBsaW5lIGlzIGVtcHR5IChhbm90aGVyIG5ld2xpbmUgZm9sbG93cylcblx0XHRcdFx0XHRjb25zdCBjID0gdGhpcy5pbnB1dFt0aGlzLnBvc107XG5cdFx0XHRcdFx0aWYgKGMgPT09ICdcXG4nIHx8IGMgPT09ICdcXHInKSB7XG5cdFx0XHRcdFx0XHRlbXB0eUxpbmVDb3VudCsrO1xuXHRcdFx0XHRcdFx0dGhpcy5jb25zdW1lTmV3bGluZSgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBcHBseSBmb2xkaW5nOiBlbXB0eSBsaW5lcyBcdTIxOTIgXFxuIGVhY2gsIG90aGVyd2lzZSBzaW5nbGUgbmV3bGluZSBcdTIxOTIgc3BhY2Vcblx0XHRcdFx0aWYgKGVtcHR5TGluZUNvdW50ID4gMCkge1xuXHRcdFx0XHRcdHZhbHVlICs9ICdcXG4nLnJlcGVhdChlbXB0eUxpbmVDb3VudCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFsdWUgKz0gJyAnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcmFjayBsaXRlcmFsIHdoaXRlc3BhY2UgZm9yIGZvbGRpbmcgcHVycG9zZXNcblx0XHRcdGlmIChjaCA9PT0gJyAnIHx8IGNoID09PSAnXFx0Jykge1xuXHRcdFx0XHR0cmFpbGluZ0xpdGVyYWxXcysrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJhaWxpbmdMaXRlcmFsV3MgPSAwO1xuXHRcdFx0fVxuXHRcdFx0dmFsdWUgKz0gY2g7XG5cdFx0XHR0aGlzLnBvcysrO1xuXHRcdH1cblxuXHRcdC8vIFVudGVybWluYXRlZCBzdHJpbmcgLSBlbWl0IHdoYXQgd2UgaGF2ZVxuXHRcdGNvbnN0IHJhd1ZhbHVlID0gdGhpcy5pbnB1dC5zdWJzdHJpbmcoc3RhcnQsIHRoaXMucG9zKTtcblx0XHR0aGlzLnRva2Vucy5wdXNoKG1ha2VUb2tlbihUb2tlblR5cGUuU2NhbGFyLCBzdGFydCwgdGhpcy5wb3MsIHtcblx0XHRcdHJhd1ZhbHVlLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHRmb3JtYXQ6IHF1b3RlID09PSAnXFwnJyA/ICdzaW5nbGUnIDogJ2RvdWJsZScsXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2FuVW5xdW90ZWRTY2FsYXIoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLnBvcztcblx0XHRsZXQgZW5kID0gdGhpcy5wb3M7XG5cblx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgY2ggPSB0aGlzLmlucHV0W3RoaXMucG9zXTtcblx0XHRcdC8vIFN0b3AgYXQgbmV3bGluZVxuXHRcdFx0aWYgKGNoID09PSAnXFxuJyB8fCBjaCA9PT0gJ1xccicpIHsgYnJlYWs7IH1cblx0XHRcdC8vIFN0b3AgYXQgZmxvdyBpbmRpY2F0b3JzIChvbmx5IGluc2lkZSBmbG93IGNvbGxlY3Rpb25zKVxuXHRcdFx0aWYgKHRoaXMuZmxvd0RlcHRoID4gMCAmJiAoY2ggPT09ICcsJyB8fCBjaCA9PT0gJ30nIHx8IGNoID09PSAnXScpKSB7IGJyZWFrOyB9XG5cdFx0XHRpZiAodGhpcy5mbG93RGVwdGggPiAwICYmIChjaCA9PT0gJ3snIHx8IGNoID09PSAnWycpKSB7IGJyZWFrOyB9XG5cdFx0XHQvLyBTdG9wIGF0ICc6ICcgb3IgJzonIGF0IGVuZC1vZi1saW5lIChtYXBwaW5nIHZhbHVlIGluZGljYXRvcilcblx0XHRcdGlmIChjaCA9PT0gJzonICYmIHRoaXMuaXNCbG9ja0NvbG9uKCkpIHsgYnJlYWs7IH1cblx0XHRcdC8vIFN0b3AgYXQgJyAjJyAoY29tbWVudClcblx0XHRcdGlmIChjaCA9PT0gJyMnICYmIHRoaXMucG9zID4gc3RhcnQgJiYgKHRoaXMuaW5wdXRbdGhpcy5wb3MgLSAxXSA9PT0gJyAnIHx8IHRoaXMuaW5wdXRbdGhpcy5wb3MgLSAxXSA9PT0gJ1xcdCcpKSB7IGJyZWFrOyB9XG5cblx0XHRcdHRoaXMucG9zKys7XG5cdFx0XHQvLyBUcmFjayB0aGUgbGFzdCBub24td2hpdGVzcGFjZSBwb3NpdGlvbiB0byB0cmltIHRyYWlsaW5nIHdoaXRlc3BhY2Vcblx0XHRcdGlmIChjaCAhPT0gJyAnICYmIGNoICE9PSAnXFx0Jykge1xuXHRcdFx0XHRlbmQgPSB0aGlzLnBvcztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByYXdWYWx1ZSA9IHRoaXMuaW5wdXQuc3Vic3RyaW5nKHN0YXJ0LCBlbmQpO1xuXHRcdHRoaXMudG9rZW5zLnB1c2gobWFrZVRva2VuKFRva2VuVHlwZS5TY2FsYXIsIHN0YXJ0LCBlbmQsIHtcblx0XHRcdHJhd1ZhbHVlLFxuXHRcdFx0dmFsdWU6IHJhd1ZhbHVlLFxuXHRcdFx0Zm9ybWF0OiAnbm9uZScsXG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmICd8JyBvciAnPicgYXQgdGhlIGN1cnJlbnQgcG9zaXRpb24gaXMgYSBibG9jayBzY2FsYXIgaW5kaWNhdG9yLlxuXHQgKiBNdXN0IGJlIGZvbGxvd2VkIGJ5IG9wdGlvbmFsIGluZGVudGF0aW9uL2Nob21waW5nIGluZGljYXRvcnMsIG9wdGlvbmFsIGNvbW1lbnQsIHRoZW4gbmV3bGluZS5cblx0ICovXG5cdHByaXZhdGUgaXNCbG9ja1NjYWxhclN0YXJ0KCk6IGJvb2xlYW4ge1xuXHRcdGxldCBwID0gdGhpcy5wb3MgKyAxO1xuXHRcdC8vIFNraXAgb3B0aW9uYWwgaW5kZW50YXRpb24gaW5kaWNhdG9yIChkaWdpdCAxLTkpIGFuZCBjaG9tcGluZyBpbmRpY2F0b3IgKCsvLSlcblx0XHR3aGlsZSAocCA8IHRoaXMuaW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBjID0gdGhpcy5pbnB1dFtwXTtcblx0XHRcdGlmIChjID49ICcxJyAmJiBjIDw9ICc5JykgeyBwKys7IGNvbnRpbnVlOyB9XG5cdFx0XHRpZiAoYyA9PT0gJysnIHx8IGMgPT09ICctJykgeyBwKys7IGNvbnRpbnVlOyB9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Ly8gU2tpcCBvcHRpb25hbCB3aGl0ZXNwYWNlXG5cdFx0d2hpbGUgKHAgPCB0aGlzLmlucHV0Lmxlbmd0aCAmJiAodGhpcy5pbnB1dFtwXSA9PT0gJyAnIHx8IHRoaXMuaW5wdXRbcF0gPT09ICdcXHQnKSkgeyBwKys7IH1cblx0XHQvLyBNdXN0IGJlIGF0IG5ld2xpbmUsIEVPRiwgb3IgY29tbWVudFxuXHRcdGlmIChwID49IHRoaXMuaW5wdXQubGVuZ3RoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0Y29uc3QgYyA9IHRoaXMuaW5wdXRbcF07XG5cdFx0cmV0dXJuIGMgPT09ICdcXG4nIHx8IGMgPT09ICdcXHInIHx8IGMgPT09ICcjJztcblx0fVxuXG5cdC8qKlxuXHQgKiBTY2FuIGEgYmxvY2sgc2NhbGFyIChsaXRlcmFsICd8JyBvciBmb2xkZWQgJz4nKS5cblx0ICogUGFyc2VzIHRoZSBoZWFkZXIgbGluZSBmb3IgaW5kZW50YXRpb24gaW5kaWNhdG9yIGFuZCBjaG9tcGluZyBtb2RlLFxuXHQgKiB0aGVuIGNvbGxlY3RzIGFsbCBjb250ZW50IGxpbmVzIHRoYXQgYXJlIGluZGVudGVkIGJleW9uZCB0aGUgZGV0ZWN0ZWQgaW5kZW50YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIHNjYW5CbG9ja1NjYWxhcihzdHlsZTogJ3wnIHwgJz4nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLnBvcztcblx0XHR0aGlzLnBvcysrOyAvLyBza2lwICd8JyBvciAnPidcblxuXHRcdC8vIFBhcnNlIGhlYWRlcjogb3B0aW9uYWwgaW5kZW50YXRpb24gaW5kaWNhdG9yICgxLTkpIGFuZCBjaG9tcGluZyBpbmRpY2F0b3IgKCsvLSlcblx0XHRsZXQgZXhwbGljaXRJbmRlbnQgPSAwO1xuXHRcdGxldCBjaG9tcGluZzogJ2NsaXAnIHwgJ3N0cmlwJyB8ICdrZWVwJyA9ICdjbGlwJztcblxuXHRcdC8vIFRoZSBvcmRlciBvZiBpbmRlbnQgaW5kaWNhdG9yIGFuZCBjaG9tcGluZyBpbmRpY2F0b3IgY2FuIHZhcnkgKEQ4M0wgdGVzdClcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDI7IGkrKykge1xuXHRcdFx0aWYgKHRoaXMucG9zIDwgdGhpcy5pbnB1dC5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgYyA9IHRoaXMuaW5wdXRbdGhpcy5wb3NdO1xuXHRcdFx0XHRpZiAoYyA+PSAnMScgJiYgYyA8PSAnOScgJiYgZXhwbGljaXRJbmRlbnQgPT09IDApIHtcblx0XHRcdFx0XHRleHBsaWNpdEluZGVudCA9IHBhcnNlSW50KGMsIDEwKTtcblx0XHRcdFx0XHR0aGlzLnBvcysrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGMgPT09ICctJyAmJiBjaG9tcGluZyA9PT0gJ2NsaXAnKSB7XG5cdFx0XHRcdFx0Y2hvbXBpbmcgPSAnc3RyaXAnO1xuXHRcdFx0XHRcdHRoaXMucG9zKys7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYyA9PT0gJysnICYmIGNob21waW5nID09PSAnY2xpcCcpIHtcblx0XHRcdFx0XHRjaG9tcGluZyA9ICdrZWVwJztcblx0XHRcdFx0XHR0aGlzLnBvcysrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2tpcCBhbnkgdHJhaWxpbmcgd2hpdGVzcGFjZSBvbiB0aGUgaGVhZGVyIGxpbmVcblx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCAmJiAodGhpcy5pbnB1dFt0aGlzLnBvc10gPT09ICcgJyB8fCB0aGlzLmlucHV0W3RoaXMucG9zXSA9PT0gJ1xcdCcpKSB7XG5cdFx0XHR0aGlzLnBvcysrO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgb3B0aW9uYWwgY29tbWVudCBvbiBoZWFkZXIgbGluZVxuXHRcdGlmICh0aGlzLnBvcyA8IHRoaXMuaW5wdXQubGVuZ3RoICYmIHRoaXMuaW5wdXRbdGhpcy5wb3NdID09PSAnIycpIHtcblx0XHRcdHdoaWxlICh0aGlzLnBvcyA8IHRoaXMuaW5wdXQubGVuZ3RoICYmIHRoaXMuaW5wdXRbdGhpcy5wb3NdICE9PSAnXFxuJyAmJiB0aGlzLmlucHV0W3RoaXMucG9zXSAhPT0gJ1xccicpIHtcblx0XHRcdFx0dGhpcy5wb3MrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTa2lwIHRoZSBoZWFkZXIgbGluZSdzIG5ld2xpbmVcblx0XHR0aGlzLmNvbnN1bWVOZXdsaW5lKCk7XG5cblx0XHQvLyBEZXRlcm1pbmUgdGhlIHBhcmVudCBibG9jaydzIGluZGVudGF0aW9uIGxldmVsLlxuXHRcdC8vIFBlciBZQU1MIHNwZWMgOC4xLjEuMSwgY29udGVudCBpbmRlbnRhdGlvbiA9IHBhcmVudF9ibG9ja19pbmRlbnQgKyBOXG5cdFx0Ly8gd2hlcmUgTiBpcyB0aGUgZXhwbGljaXQgaW5kZW50IGluZGljYXRvciAob3IgYXV0by1kZXRlY3RlZCkuXG5cdFx0Ly8gQWxzbyB1c2VkIHRvIGVzdGFibGlzaCBhIG1pbmltdW0gY29udGVudCBpbmRlbnQgZm9yIGF1dG8tZGV0ZWN0aW9uLlxuXHRcdGNvbnN0IHBhcmVudEJsb2NrSW5kZW50ID0gdGhpcy5nZXRQYXJlbnRCbG9ja0luZGVudChzdGFydCk7XG5cblx0XHQvLyBDb21wdXRlIHRoZSBjb250ZW50IGluZGVudGF0aW9uIGxldmVsXG5cdFx0bGV0IGNvbnRlbnRJbmRlbnQgPSBleHBsaWNpdEluZGVudCA+IDAgPyBwYXJlbnRCbG9ja0luZGVudCArIGV4cGxpY2l0SW5kZW50IDogMDtcblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgdHJhaWxpbmdOZXdsaW5lcyA9IDA7XG5cblx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbGluZVN0YXJ0ID0gdGhpcy5wb3M7XG5cblx0XHRcdC8vIENvdW50IGxlYWRpbmcgc3BhY2VzIG9uIHRoaXMgbGluZSAodGFicyBhcmUgbm90IHZhbGlkIFlBTUwgaW5kZW50YXRpb24pXG5cdFx0XHRsZXQgbGluZUluZGVudCA9IDA7XG5cdFx0XHR3aGlsZSAodGhpcy5wb3MgPCB0aGlzLmlucHV0Lmxlbmd0aCAmJiB0aGlzLmlucHV0W3RoaXMucG9zXSA9PT0gJyAnKSB7XG5cdFx0XHRcdGxpbmVJbmRlbnQrKztcblx0XHRcdFx0dGhpcy5wb3MrKztcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhbiBlbXB0eSBvciB3aGl0ZXNwYWNlLW9ubHkgbGluZVxuXHRcdFx0aWYgKHRoaXMucG9zID49IHRoaXMuaW5wdXQubGVuZ3RoIHx8IHRoaXMuaW5wdXRbdGhpcy5wb3NdID09PSAnXFxuJyB8fCB0aGlzLmlucHV0W3RoaXMucG9zXSA9PT0gJ1xccicpIHtcblx0XHRcdFx0aWYgKGNvbnRlbnRJbmRlbnQgPiAwICYmIGxpbmVJbmRlbnQgPj0gY29udGVudEluZGVudCkge1xuXHRcdFx0XHRcdC8vIFdoaXRlc3BhY2Utb25seSBsaW5lIHdpdGggZW5vdWdoIGluZGVudCAtIHByZXNlcnZlIGV4Y2VzcyB3aGl0ZXNwYWNlXG5cdFx0XHRcdFx0Y29uc3QgcHJlc2VydmVkID0gdGhpcy5pbnB1dC5zdWJzdHJpbmcobGluZVN0YXJ0ICsgY29udGVudEluZGVudCwgdGhpcy5wb3MpO1xuXHRcdFx0XHRcdGxpbmVzLnB1c2gocHJlc2VydmVkKTtcblx0XHRcdFx0XHRpZiAocHJlc2VydmVkID09PSAnJykge1xuXHRcdFx0XHRcdFx0Ly8gRWZmZWN0aXZlbHkgYW4gZW1wdHkgbGluZSAtIGNvdW50cyBhcyB0cmFpbGluZ1xuXHRcdFx0XHRcdFx0dHJhaWxpbmdOZXdsaW5lcysrO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0cmFpbGluZ05ld2xpbmVzID0gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gVHJ1bHkgZW1wdHkgbGluZSAtIHBhcnQgb2Ygc2NhbGFyIGNvbnRlbnRcblx0XHRcdFx0XHRsaW5lcy5wdXNoKCcnKTtcblx0XHRcdFx0XHR0cmFpbGluZ05ld2xpbmVzKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gU2tpcCBuZXdsaW5lXG5cdFx0XHRcdHRoaXMuY29uc3VtZU5ld2xpbmUoKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGZvciBkb2N1bWVudCBtYXJrZXJzIGF0IGNvbHVtbiAwIC0gdGhleSB0ZXJtaW5hdGUgdGhlIGJsb2NrIHNjYWxhclxuXHRcdFx0aWYgKGxpbmVJbmRlbnQgPT09IDAgJiYgdGhpcy5pbnB1dC5sZW5ndGggLSB0aGlzLnBvcyA+PSAzKSB7XG5cdFx0XHRcdGNvbnN0IGMwID0gdGhpcy5pbnB1dFt0aGlzLnBvc107XG5cdFx0XHRcdGNvbnN0IGMxID0gdGhpcy5pbnB1dFt0aGlzLnBvcyArIDFdO1xuXHRcdFx0XHRjb25zdCBjMiA9IHRoaXMuaW5wdXRbdGhpcy5wb3MgKyAyXTtcblx0XHRcdFx0Y29uc3QgYzMgPSB0aGlzLmlucHV0W3RoaXMucG9zICsgM107XG5cdFx0XHRcdGNvbnN0IGlzVGVybSA9IGMzID09PSB1bmRlZmluZWQgfHwgYzMgPT09ICcgJyB8fCBjMyA9PT0gJ1xcdCcgfHwgYzMgPT09ICdcXG4nIHx8IGMzID09PSAnXFxyJztcblx0XHRcdFx0aWYgKChjMCA9PT0gJy0nICYmIGMxID09PSAnLScgJiYgYzIgPT09ICctJyAmJiBpc1Rlcm0pIHx8XG5cdFx0XHRcdFx0KGMwID09PSAnLicgJiYgYzEgPT09ICcuJyAmJiBjMiA9PT0gJy4nICYmIGlzVGVybSkpIHtcblx0XHRcdFx0XHR0aGlzLnBvcyA9IGxpbmVTdGFydDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdXRvLWRldGVjdCBjb250ZW50IGluZGVudCBmcm9tIGZpcnN0IG5vbi1lbXB0eSBsaW5lLlxuXHRcdFx0Ly8gQ29udGVudCBtdXN0IGJlIG1vcmUgaW5kZW50ZWQgdGhhbiB0aGUgcGFyZW50IGJsb2NrLlxuXHRcdFx0aWYgKGNvbnRlbnRJbmRlbnQgPT09IDApIHtcblx0XHRcdFx0aWYgKGxpbmVJbmRlbnQgPD0gcGFyZW50QmxvY2tJbmRlbnQpIHtcblx0XHRcdFx0XHQvLyBOb3QgZW5vdWdoIGluZGVudGF0aW9uIC0gdGVybWluYXRlcyB0aGUgYmxvY2sgc2NhbGFyXG5cdFx0XHRcdFx0dGhpcy5wb3MgPSBsaW5lU3RhcnQ7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGVudEluZGVudCA9IGxpbmVJbmRlbnQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoaXMgbGluZSdzIGluZGVudGF0aW9uIGlzIGxlc3MgdGhhbiB0aGUgY29udGVudCBpbmRlbnQsIHRoZSBibG9jayBzY2FsYXIgaXMgZG9uZVxuXHRcdFx0aWYgKGxpbmVJbmRlbnQgPCBjb250ZW50SW5kZW50KSB7XG5cdFx0XHRcdHRoaXMucG9zID0gbGluZVN0YXJ0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVhZCB0aGUgcmVzdCBvZiB0aGUgbGluZSAodGhlIGNvbnRlbnQpXG5cdFx0XHRjb25zdCBjb250ZW50U3RhcnQgPSBsaW5lU3RhcnQgKyBjb250ZW50SW5kZW50O1xuXHRcdFx0d2hpbGUgKHRoaXMucG9zIDwgdGhpcy5pbnB1dC5sZW5ndGggJiYgdGhpcy5pbnB1dFt0aGlzLnBvc10gIT09ICdcXG4nICYmIHRoaXMuaW5wdXRbdGhpcy5wb3NdICE9PSAnXFxyJykge1xuXHRcdFx0XHR0aGlzLnBvcysrO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIGxpbmUgY29udGVudCBpbmNsdWRlcyBhbnkgZXh0cmEgaW5kZW50YXRpb24gYmV5b25kIGNvbnRlbnRJbmRlbnRcblx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gdGhpcy5pbnB1dC5zdWJzdHJpbmcoY29udGVudFN0YXJ0LCB0aGlzLnBvcyk7XG5cdFx0XHRsaW5lcy5wdXNoKGxpbmVDb250ZW50KTtcblx0XHRcdHRyYWlsaW5nTmV3bGluZXMgPSAwO1xuXG5cdFx0XHQvLyBTa2lwIG5ld2xpbmVcblx0XHRcdHRoaXMuY29uc3VtZU5ld2xpbmUoKTtcblx0XHR9XG5cblx0XHQvLyBQcm9jZXNzIHRoZSBjb2xsZWN0ZWQgbGluZXMgYWNjb3JkaW5nIHRvIHRoZSBibG9jayBzY2FsYXIgc3R5bGVcblx0XHRsZXQgdmFsdWU6IHN0cmluZztcblx0XHRpZiAoc3R5bGUgPT09ICd8Jykge1xuXHRcdFx0Ly8gTGl0ZXJhbDogam9pbiBsaW5lcyB3aXRoIG5ld2xpbmVzIChwcmVzZXJ2aW5nIGFsbCBsaW5lIGJyZWFrcyBhcy1pcylcblx0XHRcdHZhbHVlID0gbGluZXMuam9pbignXFxuJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZvbGRlZDogcGVyIFlBTUwgc3BlYywgbGluZSBicmVha3MgYmV0d2VlbiBhZGphY2VudCBub24tbW9yZS1pbmRlbnRlZFxuXHRcdFx0Ly8gY29udGVudCBsaW5lcyBhcmUgZm9sZGVkIGludG8gc3BhY2VzLiBNb3JlLWluZGVudGVkIGxpbmVzIHByZXNlcnZlIGJyZWFrcy5cblx0XHRcdC8vIEVtcHR5IGxpbmVzIHByb2R1Y2UgXFxuIGVhY2guIFRoZSBicmVhayBmcm9tIGNvbnRlbnQgaW50byBhbiBlbXB0eSBydW5cblx0XHRcdC8vIGlzIFwidHJpbW1lZFwiIChhYnNvcmJlZCkgZm9yIG5vbi1tb3JlLWluZGVudGVkIGxpbmVzLCBidXQgcHJlc2VydmVkXG5cdFx0XHQvLyBmb3IgbW9yZS1pbmRlbnRlZCBsaW5lcy5cblx0XHRcdHZhbHVlID0gJyc7XG5cdFx0XHRsZXQgbGFzdE5vbkVtcHR5SXNNb3JlSW5kZW50ZWQgPSBmYWxzZTtcblx0XHRcdGxldCBpbkVtcHR5UnVuID0gZmFsc2U7XG5cdFx0XHRsZXQgc2Vlbk5vbkVtcHR5ID0gZmFsc2U7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXHRcdFx0XHRjb25zdCBpc01vcmVJbmRlbnRlZCA9IGxpbmUubGVuZ3RoID4gMCAmJiAobGluZVswXSA9PT0gJyAnIHx8IGxpbmVbMF0gPT09ICdcXHQnKTtcblxuXHRcdFx0XHRpZiAobGluZSA9PT0gJycpIHtcblx0XHRcdFx0XHQvLyBFbXB0eSBsaW5lIFx1MjE5MiBjb250cmlidXRlcyBvbmUgXFxuXG5cdFx0XHRcdFx0dmFsdWUgKz0gJ1xcbic7XG5cdFx0XHRcdFx0aW5FbXB0eVJ1biA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHRcdHZhbHVlID0gbGluZTtcblx0XHRcdFx0XHRsYXN0Tm9uRW1wdHlJc01vcmVJbmRlbnRlZCA9IGlzTW9yZUluZGVudGVkO1xuXHRcdFx0XHRcdHNlZW5Ob25FbXB0eSA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaW5FbXB0eVJ1bikge1xuXHRcdFx0XHRcdC8vIFRyYW5zaXRpb25pbmcgZnJvbSBlbXB0eSBsaW5lcyBiYWNrIHRvIGNvbnRlbnQuXG5cdFx0XHRcdFx0Ly8gSWYgdGhlIHByZXZpb3VzIGNvbnRlbnQgb3IgY3VycmVudCBsaW5lIGlzIG1vcmUtaW5kZW50ZWRcblx0XHRcdFx0XHQvLyBBTkQgd2UndmUgc2VlbiBjb250ZW50IGJlZm9yZSwgdGhlIGJyZWFrIGlzIHByZXNlcnZlZC5cblx0XHRcdFx0XHQvLyBPdGhlcndpc2UgdGhlIGVtcHRpZXMgYWxyZWFkeSBwcm92aWRlZCBhbGwgbmVlZGVkIGxpbmUgYnJlYWtzLlxuXHRcdFx0XHRcdGlmICgobGFzdE5vbkVtcHR5SXNNb3JlSW5kZW50ZWQgfHwgaXNNb3JlSW5kZW50ZWQpICYmIHNlZW5Ob25FbXB0eSkge1xuXHRcdFx0XHRcdFx0dmFsdWUgKz0gJ1xcbicgKyBsaW5lO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR2YWx1ZSArPSBsaW5lO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYXN0Tm9uRW1wdHlJc01vcmVJbmRlbnRlZCA9IGlzTW9yZUluZGVudGVkO1xuXHRcdFx0XHRcdGluRW1wdHlSdW4gPSBmYWxzZTtcblx0XHRcdFx0XHRzZWVuTm9uRW1wdHkgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzTW9yZUluZGVudGVkIHx8IGxhc3ROb25FbXB0eUlzTW9yZUluZGVudGVkKSB7XG5cdFx0XHRcdFx0Ly8gTW9yZS1pbmRlbnRlZCBsaW5lIFx1MjE5MiBwcmVzZXJ2ZSBuZXdsaW5lXG5cdFx0XHRcdFx0dmFsdWUgKz0gJ1xcbicgKyBsaW5lO1xuXHRcdFx0XHRcdGxhc3ROb25FbXB0eUlzTW9yZUluZGVudGVkID0gaXNNb3JlSW5kZW50ZWQ7XG5cdFx0XHRcdFx0c2Vlbk5vbkVtcHR5ID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBOb3JtYWwgYWRqYWNlbnQgbm9uLW1vcmUtaW5kZW50ZWQgbGluZXMgXHUyMTkyIGZvbGQgdG8gc3BhY2Vcblx0XHRcdFx0XHR2YWx1ZSArPSAnICcgKyBsaW5lO1xuXHRcdFx0XHRcdGxhc3ROb25FbXB0eUlzTW9yZUluZGVudGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0c2Vlbk5vbkVtcHR5ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFwcGx5IGNob21waW5nIHRvIHRyYWlsaW5nIG5ld2xpbmVzXG5cdFx0aWYgKHRyYWlsaW5nTmV3bGluZXMgPiAwKSB7XG5cdFx0XHQvLyBTdHJpcCBhbGwgdHJhaWxpbmcgbmV3bGluZXMgZnJvbSB0aGUgdmFsdWVcblx0XHRcdGxldCBlbmQgPSB2YWx1ZS5sZW5ndGg7XG5cdFx0XHR3aGlsZSAoZW5kID4gMCAmJiB2YWx1ZVtlbmQgLSAxXSA9PT0gJ1xcbicpIHtcblx0XHRcdFx0ZW5kLS07XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZSA9IHZhbHVlLnN1YnN0cmluZygwLCBlbmQpO1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSBpZiB0aGVyZSB3YXMgYW55IGFjdHVhbCAobm9uLWVtcHR5KSBjb250ZW50XG5cdFx0Y29uc3QgaGFzQ29udGVudCA9IGxpbmVzLnNvbWUobCA9PiBsICE9PSAnJyk7XG5cblx0XHRzd2l0Y2ggKGNob21waW5nKSB7XG5cdFx0XHRjYXNlICdjbGlwJzpcblx0XHRcdFx0aWYgKGhhc0NvbnRlbnQpIHtcblx0XHRcdFx0XHQvLyBBZGQgZXhhY3RseSBvbmUgdHJhaWxpbmcgbmV3bGluZVxuXHRcdFx0XHRcdHZhbHVlICs9ICdcXG4nO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAna2VlcCc6XG5cdFx0XHRcdGlmIChoYXNDb250ZW50KSB7XG5cdFx0XHRcdFx0Ly8gQ29udGVudCArIHRyYWlsaW5nOiBmaW5hbCBsaW5lIGJyZWFrICsgdHJhaWxpbmcgZW1wdHkgbGluZSBicmVha3Ncblx0XHRcdFx0XHR2YWx1ZSArPSAnXFxuJy5yZXBlYXQodHJhaWxpbmdOZXdsaW5lcyArIDEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE5vIGNvbnRlbnQsIG9ubHkgdHJhaWxpbmcgZW1wdGllc1xuXHRcdFx0XHRcdHZhbHVlID0gJ1xcbicucmVwZWF0KHRyYWlsaW5nTmV3bGluZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc3RyaXAnOlxuXHRcdFx0XHQvLyBObyB0cmFpbGluZyBuZXdsaW5lXG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd1ZhbHVlID0gdGhpcy5pbnB1dC5zdWJzdHJpbmcoc3RhcnQsIHRoaXMucG9zKTtcblx0XHR0aGlzLnRva2Vucy5wdXNoKG1ha2VUb2tlbihUb2tlblR5cGUuU2NhbGFyLCBzdGFydCwgdGhpcy5wb3MsIHtcblx0XHRcdHJhd1ZhbHVlLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHRmb3JtYXQ6IHN0eWxlID09PSAnfCcgPyAnbGl0ZXJhbCcgOiAnZm9sZGVkJyxcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lIHRoZSBwYXJlbnQgYmxvY2sncyBpbmRlbnRhdGlvbiBsZXZlbCBmb3IgYSBibG9jayBzY2FsYXIuXG5cdCAqIExvb2tzIGF0IHByZWNlZGluZyB0b2tlbnMgdG8gZmluZCB0aGUgY29udGV4dDpcblx0ICogLSBBZnRlciBDb2xvbjogdGhlIGluZGVudGF0aW9uIG9mIHRoZSBsaW5lIGNvbnRhaW5pbmcgdGhlIG1hcHBpbmcga2V5XG5cdCAqIC0gQWZ0ZXIgRGFzaDogdGhlIGNvbHVtbiBvZiB0aGUgZGFzaFxuXHQgKiAtIEF0IGRvY3VtZW50IGxldmVsOiAtMSAoYWxsb3dzIGNvbnRlbnQgYXQgaW5kZW50IDApXG5cdCAqL1xuXHRwcml2YXRlIGdldFBhcmVudEJsb2NrSW5kZW50KGJsb2NrU2NhbGFyUG9zOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLnRva2Vucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgdCA9IHRoaXMudG9rZW5zW2ldO1xuXHRcdFx0aWYgKHQudHlwZSA9PT0gVG9rZW5UeXBlLk5ld2xpbmUgfHwgdC50eXBlID09PSBUb2tlblR5cGUuQ29tbWVudCB8fCB0LnR5cGUgPT09IFRva2VuVHlwZS5JbmRlbnQpIHsgY29udGludWU7IH1cblx0XHRcdGlmICh0LnR5cGUgPT09IFRva2VuVHlwZS5Db2xvbikge1xuXHRcdFx0XHQvLyBCbG9jayBzY2FsYXIgaXMgYSBtYXBwaW5nIHZhbHVlLiBUaGUgcGFyZW50IGluZGVudGF0aW9uXG5cdFx0XHRcdC8vIGlzIHRoZSBjb2x1bW4gb2YgdGhlIG1hcHBpbmcga2V5ICh0aGUgc2NhbGFyIGJlZm9yZSB0aGUgY29sb24pLlxuXHRcdFx0XHRmb3IgKGxldCBqID0gaSAtIDE7IGogPj0gMDsgai0tKSB7XG5cdFx0XHRcdFx0Y29uc3Qga3QgPSB0aGlzLnRva2Vuc1tqXTtcblx0XHRcdFx0XHRpZiAoa3QudHlwZSA9PT0gVG9rZW5UeXBlLk5ld2xpbmUgfHwga3QudHlwZSA9PT0gVG9rZW5UeXBlLkNvbW1lbnQgfHwga3QudHlwZSA9PT0gVG9rZW5UeXBlLkluZGVudCkgeyBjb250aW51ZTsgfVxuXHRcdFx0XHRcdC8vIEZvdW5kIHRoZSBrZXkgdG9rZW4gLSByZXR1cm4gaXRzIGNvbHVtblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldENvbHVtbkF0KGt0LnN0YXJ0T2Zmc2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHRcdGlmICh0LnR5cGUgPT09IFRva2VuVHlwZS5EYXNoKSB7XG5cdFx0XHRcdC8vIEJsb2NrIHNjYWxhciBpcyBhIHNlcXVlbmNlIGl0ZW0uIFBhcmVudCBpbmRlbnQgPSBjb2x1bW4gb2YgdGhlIGRhc2guXG5cdFx0XHRcdHJldHVybiB0aGlzLmdldENvbHVtbkF0KHQuc3RhcnRPZmZzZXQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRG9jdW1lbnQgcm9vdCAtIGNvbnRlbnQgYXQgaW5kZW50IDAgaXMgdmFsaWRcblx0XHRcdGlmICh0LnR5cGUgPT09IFRva2VuVHlwZS5Eb2N1bWVudFN0YXJ0KSB7IHJldHVybiAtMTsgfVxuXHRcdFx0Ly8gRm9yIGFueSBvdGhlciB0b2tlbiwgdXNlIDBcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGNvbHVtbiAoMC1iYXNlZCBvZmZzZXQgZnJvbSBzdGFydCBvZiBsaW5lKSBmb3IgYSBwb3NpdGlvbiBpbiB0aGUgaW5wdXQuXG5cdCAqL1xuXHRwcml2YXRlIGdldENvbHVtbkF0KG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgY29sID0gMDtcblx0XHRsZXQgcCA9IG9mZnNldCAtIDE7XG5cdFx0d2hpbGUgKHAgPj0gMCAmJiB0aGlzLmlucHV0W3BdICE9PSAnXFxuJyAmJiB0aGlzLmlucHV0W3BdICE9PSAnXFxyJykge1xuXHRcdFx0Y29sKys7XG5cdFx0XHRwLS07XG5cdFx0fVxuXHRcdHJldHVybiBjb2w7XG5cdH1cblxuXHRwcml2YXRlIHNjYW5Db21tZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5wb3M7XG5cdFx0d2hpbGUgKHRoaXMucG9zIDwgdGhpcy5pbnB1dC5sZW5ndGggJiYgdGhpcy5pbnB1dFt0aGlzLnBvc10gIT09ICdcXG4nICYmIHRoaXMuaW5wdXRbdGhpcy5wb3NdICE9PSAnXFxyJykge1xuXHRcdFx0dGhpcy5wb3MrKztcblx0XHR9XG5cdFx0dGhpcy50b2tlbnMucHVzaChtYWtlVG9rZW4oVG9rZW5UeXBlLkNvbW1lbnQsIHN0YXJ0LCB0aGlzLnBvcywge1xuXHRcdFx0cmF3VmFsdWU6IHRoaXMuaW5wdXQuc3Vic3RyaW5nKHN0YXJ0LCB0aGlzLnBvcyksXG5cdFx0XHR2YWx1ZTogdGhpcy5pbnB1dC5zdWJzdHJpbmcoc3RhcnQsIHRoaXMucG9zKSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHNjYW5OZXdsaW5lKCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5wb3M7XG5cdFx0aWYgKHRoaXMuY29uc3VtZU5ld2xpbmUoKSkge1xuXHRcdFx0dGhpcy50b2tlbnMucHVzaChtYWtlVG9rZW4oVG9rZW5UeXBlLk5ld2xpbmUsIHN0YXJ0LCB0aGlzLnBvcykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2tpcElubGluZVdoaXRlc3BhY2UoKTogdm9pZCB7XG5cdFx0d2hpbGUgKHRoaXMucG9zIDwgdGhpcy5pbnB1dC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGNoID0gdGhpcy5pbnB1dFt0aGlzLnBvc107XG5cdFx0XHRpZiAoY2ggPT09ICcgJyB8fCBjaCA9PT0gJ1xcdCcpIHtcblx0XHRcdFx0dGhpcy5wb3MrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBBZHZhbmNlIHBhc3QgYSBuZXdsaW5lIHNlcXVlbmNlIChcXHJcXG4sIFxcbiwgb3IgXFxyKS4gUmV0dXJucyB0cnVlIGlmIGEgbmV3bGluZSB3YXMgY29uc3VtZWQuICovXG5cdHByaXZhdGUgY29uc3VtZU5ld2xpbmUoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMucG9zID49IHRoaXMuaW5wdXQubGVuZ3RoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdGlmICh0aGlzLmlucHV0W3RoaXMucG9zXSA9PT0gJ1xccicgJiYgdGhpcy5pbnB1dFt0aGlzLnBvcyArIDFdID09PSAnXFxuJykge1xuXHRcdFx0dGhpcy5wb3MgKz0gMjtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pbnB1dFt0aGlzLnBvc10gPT09ICdcXG4nIHx8IHRoaXMuaW5wdXRbdGhpcy5wb3NdID09PSAnXFxyJykge1xuXHRcdFx0dGhpcy5wb3MrKztcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHBlZWtDaGFyKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRbdGhpcy5wb3NdO1xuXHR9XG59XG5cbi8vIC0tIFBhcnNlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgWWFtbFBhcnNlciB7XG5cdHByaXZhdGUgcG9zID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRva2VuczogVG9rZW5bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlucHV0OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBQYXJzZU9wdGlvbnMsXG5cdCkgeyB9XG5cblx0cGFyc2UoKTogWWFtbE5vZGUgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuc2tpcE5ld2xpbmVzQW5kQ29tbWVudHMoKTtcblx0XHQvLyBTa2lwIGRvY3VtZW50IHN0YXJ0IG1hcmtlciAoLS0tKSBpZiBwcmVzZW50XG5cdFx0aWYgKHRoaXMuY3VycmVudFRva2VuKCkudHlwZSA9PT0gVG9rZW5UeXBlLkRvY3VtZW50U3RhcnQpIHtcblx0XHRcdHRoaXMuYWR2YW5jZSgpO1xuXHRcdFx0dGhpcy5za2lwTmV3bGluZXNBbmRDb21tZW50cygpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuRU9GIHx8IHRoaXMuY3VycmVudFRva2VuKCkudHlwZSA9PT0gVG9rZW5UeXBlLkRvY3VtZW50RW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnBhcnNlVmFsdWUoLTEpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyAtLSBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGN1cnJlbnRUb2tlbigpOiBUb2tlbiB7XG5cdFx0cmV0dXJuIHRoaXMudG9rZW5zW3RoaXMucG9zXTtcblx0fVxuXG5cdHByaXZhdGUgcGVlayhvZmZzZXQgPSAwKTogVG9rZW4ge1xuXHRcdHJldHVybiB0aGlzLnRva2Vuc1tNYXRoLm1pbih0aGlzLnBvcyArIG9mZnNldCwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSldO1xuXHR9XG5cblx0cHJpdmF0ZSBhZHZhbmNlKCk6IFRva2VuIHtcblx0XHRjb25zdCB0ID0gdGhpcy50b2tlbnNbdGhpcy5wb3NdO1xuXHRcdGlmICh0LnR5cGUgIT09IFRva2VuVHlwZS5FT0YpIHtcblx0XHRcdHRoaXMucG9zKys7XG5cdFx0fVxuXHRcdHJldHVybiB0O1xuXHR9XG5cblx0cHJpdmF0ZSBleHBlY3QodHlwZTogVG9rZW5UeXBlKTogVG9rZW4ge1xuXHRcdGNvbnN0IHQgPSB0aGlzLmN1cnJlbnRUb2tlbigpO1xuXHRcdGlmICh0LnR5cGUgPT09IHR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLmFkdmFuY2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHQ7XG5cdH1cblxuXHRwcml2YXRlIGVtaXRFcnJvcihtZXNzYWdlOiBzdHJpbmcsIHN0YXJ0T2Zmc2V0OiBudW1iZXIsIGVuZE9mZnNldDogbnVtYmVyLCBjb2RlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmVycm9ycy5wdXNoKHsgbWVzc2FnZSwgc3RhcnRPZmZzZXQsIGVuZE9mZnNldCwgY29kZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgc2tpcE5ld2xpbmVzQW5kQ29tbWVudHMoKTogdm9pZCB7XG5cdFx0d2hpbGUgKFxuXHRcdFx0dGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuTmV3bGluZSB8fFxuXHRcdFx0dGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuQ29tbWVudCB8fFxuXHRcdFx0KHRoaXMuY3VycmVudFRva2VuKCkudHlwZSA9PT0gVG9rZW5UeXBlLkluZGVudCAmJiB0aGlzLmlzRm9sbG93ZWRCeU5ld2xpbmVPckNvbW1lbnQoKSlcblx0XHQpIHtcblx0XHRcdHRoaXMuYWR2YW5jZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBSZXR1cm5zIHRydWUgaWYgdGhlIGN1cnJlbnQgSW5kZW50IHRva2VuIGlzIGZvbGxvd2VkIGltbWVkaWF0ZWx5IGJ5IE5ld2xpbmUvQ29tbWVudC9FT0YgKi9cblx0cHJpdmF0ZSBpc0ZvbGxvd2VkQnlOZXdsaW5lT3JDb21tZW50KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5leHQgPSB0aGlzLnBlZWsoMSk7XG5cdFx0cmV0dXJuIG5leHQudHlwZSA9PT0gVG9rZW5UeXBlLk5ld2xpbmUgfHwgbmV4dC50eXBlID09PSBUb2tlblR5cGUuQ29tbWVudCB8fCBuZXh0LnR5cGUgPT09IFRva2VuVHlwZS5FT0Y7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyB0aGUgY3VycmVudCBpbmRlbnRhdGlvbiBsZXZlbC5cblx0ICogSWYgdGhlIGN1cnJlbnQgdG9rZW4gaXMgYW4gSW5kZW50LCByZXR1cm5zIGl0cyBpbmRlbnQgdmFsdWUuXG5cdCAqIE90aGVyd2lzZSByZXR1cm5zIDAgKHRva2VuIGlzIGF0IGNvbHVtbiAwKS5cblx0ICovXG5cdHByaXZhdGUgY3VycmVudEluZGVudCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5JbmRlbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLmN1cnJlbnRUb2tlbigpLmluZGVudDtcblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHQvLyAtLSBNYWluIHBhcnNlIGVudHJ5IGZvciBhIHZhbHVlIGF0IGEgZ2l2ZW4gaW5kZW50YXRpb24gLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIHBhcnNlVmFsdWUocGFyZW50SW5kZW50OiBudW1iZXIpOiBZYW1sTm9kZSB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5za2lwTmV3bGluZXNBbmRDb21tZW50cygpO1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5jdXJyZW50VG9rZW4oKTtcblxuXHRcdC8vIEZsb3cgY29sbGVjdGlvbnMgKGFsc28gY2hlY2sgcGFzdCBpbmRlbnQpXG5cdFx0Y29uc3QgZmxvd1Rva2VuID0gdG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkluZGVudCA/IHRoaXMucGVlaygxKSA6IHRva2VuO1xuXHRcdGlmIChmbG93VG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dNYXBTdGFydCB8fCBmbG93VG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dTZXFTdGFydCkge1xuXHRcdFx0aWYgKHRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5JbmRlbnQpIHsgdGhpcy5hZHZhbmNlKCk7IH1cblx0XHRcdGlmIChmbG93VG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dNYXBTdGFydCkgeyByZXR1cm4gdGhpcy5wYXJzZUZsb3dNYXAoKTsgfVxuXHRcdFx0cmV0dXJuIHRoaXMucGFyc2VGbG93U2VxKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQmxvY2stbGV2ZWw6IGRldGVjdCBpZiB0aGlzIGlzIGEgc2VxdWVuY2Ugb3IgbWFwcGluZ1xuXHRcdGNvbnN0IGluZGVudCA9IHRoaXMuY3VycmVudEluZGVudCgpO1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIHdoYXQgdGhlIGZpcnN0IG1lYW5pbmdmdWwgdG9rZW4gaXMgYXQgdGhpcyBpbmRlbnRcblx0XHRjb25zdCBmaXJzdENvbnRlbnRUb2tlbiA9IHRoaXMucGVla1Bhc3RJbmRlbnQoKTtcblxuXHRcdGlmIChmaXJzdENvbnRlbnRUb2tlbi50eXBlID09PSBUb2tlblR5cGUuRGFzaCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGFyc2VCbG9ja1NlcXVlbmNlKGluZGVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyBsb29rcyBsaWtlIGEgbWFwcGluZyAoc2NhbGFyIGZvbGxvd2VkIGJ5IGNvbG9uKVxuXHRcdGlmICh0aGlzLmxvb2tzTGlrZU1hcHBpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGFyc2VCbG9ja01hcHBpbmcoaW5kZW50KTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgaXQncyBhIHNjYWxhclxuXHRcdGlmICh0b2tlbi50eXBlID09PSBUb2tlblR5cGUuU2NhbGFyIHx8IHRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5JbmRlbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLnBhcnNlU2NhbGFyKHBhcmVudEluZGVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBQZWVrIHBhc3QgYW4gb3B0aW9uYWwgSW5kZW50IHRva2VuIHRvIHNlZSB0aGUgZmlyc3QgY29udGVudCB0b2tlbiAqL1xuXHRwcml2YXRlIHBlZWtQYXN0SW5kZW50KCk6IFRva2VuIHtcblx0XHRpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuSW5kZW50KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wZWVrKDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50VG9rZW4oKTtcblx0fVxuXG5cdC8qKiBDaGVjayBpZiB0b2tlbnMgYXQgY3VycmVudCBwb3NpdGlvbiBsb29rIGxpa2UgYSBtYXBwaW5nIGVudHJ5IChrZXk6IHZhbHVlKSAqL1xuXHRwcml2YXRlIGxvb2tzTGlrZU1hcHBpbmcoKTogYm9vbGVhbiB7XG5cdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0aWYgKHRoaXMucGVlayhvZmZzZXQpLnR5cGUgPT09IFRva2VuVHlwZS5JbmRlbnQpIHsgb2Zmc2V0Kys7IH1cblx0XHRpZiAodGhpcy5wZWVrKG9mZnNldCkudHlwZSA9PT0gVG9rZW5UeXBlLlNjYWxhcikge1xuXHRcdFx0b2Zmc2V0Kys7XG5cdFx0XHRpZiAodGhpcy5wZWVrKG9mZnNldCkudHlwZSA9PT0gVG9rZW5UeXBlLkNvbG9uKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIC0tIFNjYWxhciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBwYXJzZVNjYWxhcihwYXJlbnRJbmRlbnQ6IG51bWJlciA9IC0xKTogWWFtbFNjYWxhck5vZGUge1xuXHRcdC8vIFNraXAgaW5kZW50IGlmIHByZXNlbnRcblx0XHRpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuSW5kZW50KSB7XG5cdFx0XHR0aGlzLmFkdmFuY2UoKTtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLmV4cGVjdChUb2tlblR5cGUuU2NhbGFyKTtcblx0XHQvLyBRdW90ZWQgc2NhbGFycyBhcmUgY29tcGxldGUgYXMtaXMgKHNjYW5uZXIgaGFuZGxlcyB0aGVpciBtdWx0aWxpbmUpXG5cdFx0aWYgKHRva2VuLmZvcm1hdCAhPT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zY2FsYXJGcm9tVG9rZW4odG9rZW4pO1xuXHRcdH1cblx0XHQvLyBGb3IgdW5xdW90ZWQgKHBsYWluKSBzY2FsYXJzLCBjaGVjayBmb3IgbXVsdGlsaW5lIGNvbnRpbnVhdGlvblxuXHRcdHJldHVybiB0aGlzLnBhcnNlUGxhaW5NdWx0aWxpbmUodG9rZW4sIHBhcmVudEluZGVudCk7XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2UgYSBtdWx0aWxpbmUgcGxhaW4gc2NhbGFyLiBUaGUgZmlyc3QgbGluZSdzIHRva2VuIGlzIGFscmVhZHkgY29uc3VtZWQuXG5cdCAqIENvbnRpbnVhdGlvbiBsaW5lcyBtdXN0IGJlIGluZGVudGVkIGRlZXBlciB0aGFuIGBwYXJlbnRJbmRlbnRgLlxuXHQgKiBMaW5lIGZvbGRpbmcgcnVsZXM6XG5cdCAqIC0gU2luZ2xlIGxpbmUgYnJlYWsgXHUyMTkyIHNwYWNlXG5cdCAqIC0gRWFjaCBlbXB0eSBsaW5lIFx1MjE5MiBwcmVzZXJ2ZWQgYXMgXFxuXG5cdCAqL1xuXHRwcml2YXRlIHBhcnNlUGxhaW5NdWx0aWxpbmUoZmlyc3RUb2tlbjogVG9rZW4sIHBhcmVudEluZGVudDogbnVtYmVyKTogWWFtbFNjYWxhck5vZGUge1xuXHRcdGxldCB2YWx1ZSA9IGZpcnN0VG9rZW4udmFsdWU7XG5cdFx0bGV0IGVuZE9mZnNldCA9IGZpcnN0VG9rZW4uZW5kT2Zmc2V0O1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdC8vIFNhdmUgcG9zaXRpb24gdG8gYmFja3RyYWNrIGlmIGNvbnRpbnVhdGlvbiBpcyBub3QgdmFsaWRcblx0XHRcdGNvbnN0IHNhdmVkUG9zID0gdGhpcy5wb3M7XG5cblx0XHRcdC8vIENvdW50IGVtcHR5IGxpbmVzIChuZXdsaW5lcyB3aXRoIG9ubHkgd2hpdGVzcGFjZSBiZXR3ZWVuKVxuXHRcdFx0bGV0IGVtcHR5TGluZUNvdW50ID0gMDtcblx0XHRcdGxldCBmb3VuZENvbnRlbnQgPSBmYWxzZTtcblxuXHRcdFx0d2hpbGUgKHRoaXMucG9zIDwgdGhpcy50b2tlbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHQgPSB0aGlzLmN1cnJlbnRUb2tlbigpO1xuXHRcdFx0XHRpZiAodC50eXBlID09PSBUb2tlblR5cGUuQ29tbWVudCkge1xuXHRcdFx0XHRcdC8vIENvbW1lbnQgdGVybWluYXRlcyBhIHBsYWluIHNjYWxhclxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0LnR5cGUgPT09IFRva2VuVHlwZS5OZXdsaW5lKSB7XG5cdFx0XHRcdFx0dGhpcy5hZHZhbmNlKCk7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIG5leHQgdGhpbmcgYWZ0ZXIgdGhpcyBuZXdsaW5lIGlzIGJsYW5rIG9yIGNvbnRlbnRcblx0XHRcdFx0XHRjb25zdCBhZnRlck5ld2xpbmUgPSB0aGlzLmN1cnJlbnRUb2tlbigpO1xuXHRcdFx0XHRcdGlmIChhZnRlck5ld2xpbmUudHlwZSA9PT0gVG9rZW5UeXBlLk5ld2xpbmUpIHtcblx0XHRcdFx0XHRcdC8vIEFub3RoZXIgbmV3bGluZSBtZWFucyBhbiBlbXB0eSBsaW5lXG5cdFx0XHRcdFx0XHRlbXB0eUxpbmVDb3VudCsrO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChhZnRlck5ld2xpbmUudHlwZSA9PT0gVG9rZW5UeXBlLkluZGVudCkge1xuXHRcdFx0XHRcdFx0Ly8gQ2hlY2sgd2hhdCBmb2xsb3dzIHRoZSBpbmRlbnRcblx0XHRcdFx0XHRcdGNvbnN0IGFmdGVySW5kZW50ID0gdGhpcy5wZWVrKDEpO1xuXHRcdFx0XHRcdFx0aWYgKGFmdGVySW5kZW50LnR5cGUgPT09IFRva2VuVHlwZS5OZXdsaW5lIHx8IGFmdGVySW5kZW50LnR5cGUgPT09IFRva2VuVHlwZS5FT0YpIHtcblx0XHRcdFx0XHRcdFx0Ly8gSW5kZW50IGZvbGxvd2VkIGJ5IG5ld2xpbmUgPSBlbXB0eSBsaW5lXG5cdFx0XHRcdFx0XHRcdGVtcHR5TGluZUNvdW50Kys7XG5cdFx0XHRcdFx0XHRcdHRoaXMuYWR2YW5jZSgpOyAvLyBza2lwIHRoZSBpbmRlbnRcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoYWZ0ZXJJbmRlbnQudHlwZSA9PT0gVG9rZW5UeXBlLkNvbW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0Ly8gQ29tbWVudCB0ZXJtaW5hdGVzIHNjYWxhclxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIENvbnRlbnQgb24gdGhpcyBsaW5lIC0gY2hlY2sgaW5kZW50YXRpb25cblx0XHRcdFx0XHRcdGlmIChhZnRlck5ld2xpbmUuaW5kZW50ID4gcGFyZW50SW5kZW50KSB7XG5cdFx0XHRcdFx0XHRcdC8vIFZhbGlkIGNvbnRpbnVhdGlvbiBsaW5lXG5cdFx0XHRcdFx0XHRcdGZvdW5kQ29udGVudCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gTm90IGRlZXAgZW5vdWdoIC0gbm90IGEgY29udGludWF0aW9uXG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoYWZ0ZXJOZXdsaW5lLnR5cGUgPT09IFRva2VuVHlwZS5FT0YpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBEb2N1bWVudCBtYXJrZXJzIHRlcm1pbmF0ZSBwbGFpbiBzY2FsYXJzXG5cdFx0XHRcdFx0aWYgKGFmdGVyTmV3bGluZS50eXBlID09PSBUb2tlblR5cGUuRG9jdW1lbnRTdGFydCB8fCBhZnRlck5ld2xpbmUudHlwZSA9PT0gVG9rZW5UeXBlLkRvY3VtZW50RW5kKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQ29udGVudCBhdCBjb2x1bW4gMFxuXHRcdFx0XHRcdGlmIChwYXJlbnRJbmRlbnQgPCAwKSB7XG5cdFx0XHRcdFx0XHQvLyBUb3AtbGV2ZWw6IGNvbHVtbiAwIGlzIHZhbGlkIGNvbnRpbnVhdGlvbiBmb3IgcGFyZW50SW5kZW50ID0gLTFcblx0XHRcdFx0XHRcdGZvdW5kQ29udGVudCA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHQudHlwZSA9PT0gVG9rZW5UeXBlLkluZGVudCkge1xuXHRcdFx0XHRcdC8vIFdlIHNob3VsZCBvbmx5IGdldCBoZXJlIGF0IHRoZSB2ZXJ5IHN0YXJ0IG9mIGxvb2thaGVhZCB3aGVuXG5cdFx0XHRcdFx0Ly8gdGhlIGZpcnN0IHRva2VuIGFmdGVyIHRoZSBzY2FsYXIncyBlbmQgaXMgSW5kZW50IChubyBuZXdsaW5lIGJlZm9yZSBpdCksXG5cdFx0XHRcdFx0Ly8gd2hpY2ggc2hvdWxkbid0IGhhcHBlbi4gQnJlYWsgdG8gYmUgc2FmZS5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBbnkgb3RoZXIgdG9rZW4gKEVPRiwgc3RydWN0dXJhbCkgPSBlbmQgb2Ygc2NhbGFyXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWZvdW5kQ29udGVudCkge1xuXHRcdFx0XHQvLyBObyBjb250aW51YXRpb24gZm91bmQgLSByZXN0b3JlIHBvc2l0aW9uXG5cdFx0XHRcdHRoaXMucG9zID0gc2F2ZWRQb3M7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBmb3VuZCBhIGNvbnRpbnVhdGlvbiBsaW5lLiBTa2lwIG9wdGlvbmFsIGluZGVudC5cblx0XHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5JbmRlbnQpIHtcblx0XHRcdFx0dGhpcy5hZHZhbmNlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBuZXh0IHRva2VuIG11c3QgYmUgYSBTY2FsYXIgZm9yIGNvbnRpbnVhdGlvblxuXHRcdFx0aWYgKHRoaXMuY3VycmVudFRva2VuKCkudHlwZSAhPT0gVG9rZW5UeXBlLlNjYWxhcikge1xuXHRcdFx0XHQvLyBBIGRhc2ggYXQgYSBkZWVwZXIgaW5kZW50IHRoYW4gdGhlIHBhcmVudCBpcyB0ZXh0IGNvbnRlbnQsIG5vdCBhIHNlcXVlbmNlIGluZGljYXRvclxuXHRcdFx0XHQvLyAoZS5nLiwgXCItIHNpbmdsZSBtdWx0aWxpbmVcXG4gLSBzZXF1ZW5jZSBlbnRyeVwiIFx1MjE5MiBvbmUgc2NhbGFyIFwic2luZ2xlIG11bHRpbGluZSAtIHNlcXVlbmNlIGVudHJ5XCIpXG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5EYXNoKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGFzaFRva2VuID0gdGhpcy5hZHZhbmNlKCk7XG5cdFx0XHRcdFx0bGV0IGxpbmVUZXh0ID0gJy0nO1xuXHRcdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5TY2FsYXIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3RUb2tlbiA9IHRoaXMuYWR2YW5jZSgpO1xuXHRcdFx0XHRcdFx0bGluZVRleHQgPSAnLSAnICsgcmVzdFRva2VuLnZhbHVlO1xuXHRcdFx0XHRcdFx0ZW5kT2Zmc2V0ID0gcmVzdFRva2VuLmVuZE9mZnNldDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZW5kT2Zmc2V0ID0gZGFzaFRva2VuLmVuZE9mZnNldDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVtcHR5TGluZUNvdW50ID4gMCkge1xuXHRcdFx0XHRcdFx0dmFsdWUgKz0gJ1xcbicucmVwZWF0KGVtcHR5TGluZUNvdW50KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dmFsdWUgKz0gJyAnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR2YWx1ZSArPSBsaW5lVGV4dDtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBOb3QgYSBzY2FsYXIgY29udGludWF0aW9uIChjb3VsZCBiZSBDb2xvbiwgZXRjLilcblx0XHRcdFx0dGhpcy5wb3MgPSBzYXZlZFBvcztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIHRoYXQgdGhpcyBsaW5lIGRvZXNuJ3QgbG9vayBsaWtlIGEgbWFwcGluZyBrZXkgKHNjYWxhciBmb2xsb3dlZCBieSBjb2xvbilcblx0XHRcdC8vIHdoaWNoIHdvdWxkIG1lYW4gdGhlIHNjYWxhciBlbmRlZCBhbmQgYSBuZXcgbWFwcGluZyBlbnRyeSBzdGFydHNcblx0XHRcdGlmICh0aGlzLnBlZWsoMSkudHlwZSA9PT0gVG9rZW5UeXBlLkNvbG9uKSB7XG5cdFx0XHRcdHRoaXMucG9zID0gc2F2ZWRQb3M7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250VG9rZW4gPSB0aGlzLmFkdmFuY2UoKTtcblxuXHRcdFx0Ly8gQXBwbHkgbGluZSBmb2xkaW5nOiBlbXB0eSBsaW5lcyBiZWNvbWUgXFxuLCBzaW5nbGUgbGluZSBicmVhayBiZWNvbWVzIHNwYWNlXG5cdFx0XHRpZiAoZW1wdHlMaW5lQ291bnQgPiAwKSB7XG5cdFx0XHRcdHZhbHVlICs9ICdcXG4nLnJlcGVhdChlbXB0eUxpbmVDb3VudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YWx1ZSArPSAnICc7XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZSArPSBjb250VG9rZW4udmFsdWU7XG5cdFx0XHRlbmRPZmZzZXQgPSBjb250VG9rZW4uZW5kT2Zmc2V0O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRcdHZhbHVlLFxuXHRcdFx0cmF3VmFsdWU6IHRoaXMuaW5wdXQuc3Vic3RyaW5nKGZpcnN0VG9rZW4uc3RhcnRPZmZzZXQsIGVuZE9mZnNldCksXG5cdFx0XHRzdGFydE9mZnNldDogZmlyc3RUb2tlbi5zdGFydE9mZnNldCxcblx0XHRcdGVuZE9mZnNldCxcblx0XHRcdGZvcm1hdDogJ25vbmUnLFxuXHRcdH07XG5cdH1cblxuXHQvLyAtLSBCbG9jayBtYXBwaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgcGFyc2VCbG9ja01hcHBpbmcoYmFzZUluZGVudDogbnVtYmVyLCBpbmxpbmVGaXJzdEVudHJ5ID0gZmFsc2UpOiBZYW1sTWFwTm9kZSB7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLmN1cnJlbnRUb2tlbigpLnN0YXJ0T2Zmc2V0O1xuXHRcdGNvbnN0IHByb3BlcnRpZXM6IHsga2V5OiBZYW1sU2NhbGFyTm9kZTsgdmFsdWU6IFlhbWxOb2RlIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW5LZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHQvLyBXaGVuIGNhbGxlZCBhZnRlciBhIHNlcXVlbmNlIGRhc2gsIHRoZSBmaXJzdCBrZXkgaXMgYWxyZWFkeSBhdCB0aGUgY3VycmVudCBwb3NpdGlvblxuXHRcdGlmIChpbmxpbmVGaXJzdEVudHJ5KSB7XG5cdFx0XHRjb25zdCBmaXJzdEVudHJ5ID0gdGhpcy5wYXJzZU1hcHBpbmdFbnRyeShiYXNlSW5kZW50KTtcblx0XHRcdGlmIChmaXJzdEVudHJ5KSB7XG5cdFx0XHRcdHNlZW5LZXlzLmFkZChmaXJzdEVudHJ5LmtleS52YWx1ZSk7XG5cdFx0XHRcdHByb3BlcnRpZXMucHVzaChmaXJzdEVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR3aGlsZSAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlICE9PSBUb2tlblR5cGUuRU9GKSB7XG5cdFx0XHR0aGlzLnNraXBOZXdsaW5lc0FuZENvbW1lbnRzKCk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuRU9GKSB7IGJyZWFrOyB9XG5cblx0XHRcdGNvbnN0IGluZGVudCA9IHRoaXMuY3VycmVudEluZGVudCgpO1xuXHRcdFx0aWYgKGluZGVudCA8IGJhc2VJbmRlbnQpIHsgYnJlYWs7IH1cblx0XHRcdGlmIChpbmRlbnQgIT09IGJhc2VJbmRlbnQpIHtcblx0XHRcdFx0aWYgKGluZGVudCA+IGJhc2VJbmRlbnQpIHtcblx0XHRcdFx0XHR0aGlzLmVtaXRFcnJvcihcblx0XHRcdFx0XHRcdGxvY2FsaXplKCd1bmV4cGVjdGVkSW5kZW50YXRpb24nLCAnVW5leHBlY3RlZCBpbmRlbnRhdGlvbiAoZXhwZWN0ZWQgezB9LCBnb3QgezF9KScsIGJhc2VJbmRlbnQsIGluZGVudCksXG5cdFx0XHRcdFx0XHR0aGlzLmN1cnJlbnRUb2tlbigpLnN0YXJ0T2Zmc2V0LFxuXHRcdFx0XHRcdFx0dGhpcy5jdXJyZW50VG9rZW4oKS5lbmRPZmZzZXQsXG5cdFx0XHRcdFx0XHQndW5leHBlY3RlZC1pbmRlbnRhdGlvbicsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLmxvb2tzTGlrZU1hcHBpbmcoKSkgeyBicmVhazsgfVxuXG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMucGFyc2VNYXBwaW5nRW50cnkoYmFzZUluZGVudCk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7IGJyZWFrOyB9XG5cblx0XHRcdGlmICghdGhpcy5vcHRpb25zLmFsbG93RHVwbGljYXRlS2V5cyAmJiBzZWVuS2V5cy5oYXMoZW50cnkua2V5LnZhbHVlKSkge1xuXHRcdFx0XHR0aGlzLmVtaXRFcnJvcihcblx0XHRcdFx0XHRsb2NhbGl6ZSgnZHVwbGljYXRlS2V5JywgJ0R1cGxpY2F0ZSBrZXk6IFwiezB9XCInLCBlbnRyeS5rZXkudmFsdWUpLFxuXHRcdFx0XHRcdGVudHJ5LmtleS5zdGFydE9mZnNldCxcblx0XHRcdFx0XHRlbnRyeS5rZXkuZW5kT2Zmc2V0LFxuXHRcdFx0XHRcdCdkdXBsaWNhdGUta2V5Jyxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHNlZW5LZXlzLmFkZChlbnRyeS5rZXkudmFsdWUpO1xuXHRcdFx0cHJvcGVydGllcy5wdXNoKGVudHJ5KTtcblx0XHR9XG5cblx0XHRjb25zdCBlbmRPZmZzZXQgPSBwcm9wZXJ0aWVzLmxlbmd0aCA+IDAgPyBwcm9wZXJ0aWVzW3Byb3BlcnRpZXMubGVuZ3RoIC0gMV0udmFsdWUuZW5kT2Zmc2V0IDogc3RhcnRPZmZzZXQ7XG5cdFx0cmV0dXJuIHsgdHlwZTogJ21hcCcsIHByb3BlcnRpZXMsIHN0eWxlOiAnYmxvY2snLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0IH07XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlTWFwcGluZ0VudHJ5KGJhc2VJbmRlbnQ6IG51bWJlcik6IHsga2V5OiBZYW1sU2NhbGFyTm9kZTsgdmFsdWU6IFlhbWxOb2RlIH0gfCB1bmRlZmluZWQge1xuXHRcdC8vIFNraXAgaW5kZW50XG5cdFx0aWYgKHRoaXMuY3VycmVudFRva2VuKCkudHlwZSA9PT0gVG9rZW5UeXBlLkluZGVudCkge1xuXHRcdFx0dGhpcy5hZHZhbmNlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gUGFyc2Uga2V5XG5cdFx0Y29uc3Qga2V5VG9rZW4gPSB0aGlzLmV4cGVjdChUb2tlblR5cGUuU2NhbGFyKTtcblx0XHRjb25zdCBrZXkgPSB0aGlzLnNjYWxhckZyb21Ub2tlbihrZXlUb2tlbik7XG5cblx0XHQvLyBFeHBlY3QgY29sb25cblx0XHRjb25zdCBjb2xvbiA9IHRoaXMuZXhwZWN0KFRva2VuVHlwZS5Db2xvbik7XG5cdFx0aWYgKGNvbG9uLnR5cGUgIT09IFRva2VuVHlwZS5Db2xvbikge1xuXHRcdFx0dGhpcy5lbWl0RXJyb3IobG9jYWxpemUoJ2V4cGVjdGVkQ29sb24nLCAnRXhwZWN0ZWQgXCI6XCInKSwgY29sb24uc3RhcnRPZmZzZXQsIGNvbG9uLmVuZE9mZnNldCwgJ2V4cGVjdGVkLWNvbG9uJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFBhcnNlIHZhbHVlOiBjb3VsZCBiZSBvbiBzYW1lIGxpbmUgb3IgbmV4dCBsaW5lIChpbmRlbnRlZClcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMucGFyc2VNYXBwaW5nVmFsdWUoYmFzZUluZGVudCwgY29sb24pO1xuXG5cdFx0cmV0dXJuIHsga2V5LCB2YWx1ZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZU1hcHBpbmdWYWx1ZShiYXNlSW5kZW50OiBudW1iZXIsIGNvbG9uVG9rZW46IFRva2VuKTogWWFtbE5vZGUge1xuXHRcdC8vIENoZWNrIGlmIHRoZXJlJ3MgYSB2YWx1ZSBvbiB0aGUgc2FtZSBsaW5lIGFmdGVyIHRoZSBjb2xvblxuXHRcdGNvbnN0IG5leHQgPSB0aGlzLmN1cnJlbnRUb2tlbigpO1xuXG5cdFx0Ly8gU2FtZS1saW5lIGZsb3cgY29sbGVjdGlvbnNcblx0XHRpZiAobmV4dC50eXBlID09PSBUb2tlblR5cGUuRmxvd01hcFN0YXJ0KSB7IHJldHVybiB0aGlzLnBhcnNlRmxvd01hcCgpOyB9XG5cdFx0aWYgKG5leHQudHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dTZXFTdGFydCkgeyByZXR1cm4gdGhpcy5wYXJzZUZsb3dTZXEoKTsgfVxuXG5cdFx0Ly8gU2FtZS1saW5lIHNjYWxhciAobWF5IGJlIG11bHRpbGluZSB3aXRoIGNvbnRpbnVhdGlvbilcblx0XHRpZiAobmV4dC50eXBlID09PSBUb2tlblR5cGUuU2NhbGFyKSB7XG5cdFx0XHQvLyBTa2lwIGluZGVudCBpZiBwcmVzZW50IChzaG91bGRuJ3QgYmUgaGVyZSwgYnV0IGJlIHNhZmUpXG5cdFx0XHRpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuSW5kZW50KSB7XG5cdFx0XHRcdHRoaXMuYWR2YW5jZSgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9rZW4gPSB0aGlzLmFkdmFuY2UoKTtcblx0XHRcdGlmICh0b2tlbi5mb3JtYXQgIT09ICdub25lJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zY2FsYXJGcm9tVG9rZW4odG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUGxhaW4gc2NhbGFyIC0gYWxsb3cgbXVsdGlsaW5lIGNvbnRpbnVhdGlvbiBkZWVwZXIgdGhhbiBiYXNlSW5kZW50XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZVBsYWluTXVsdGlsaW5lKHRva2VuLCBiYXNlSW5kZW50KTtcblx0XHR9XG5cblx0XHQvLyBWYWx1ZSBpcyBvbiB0aGUgbmV4dCBsaW5lIChza2lwIG5ld2xpbmVzL2NvbW1lbnRzIGFuZCBjaGVjayBpbmRlbnRhdGlvbilcblx0XHR0aGlzLnNraXBOZXdsaW5lc0FuZENvbW1lbnRzKCk7XG5cdFx0Y29uc3QgYWZ0ZXJOZXdsaW5lID0gdGhpcy5jdXJyZW50VG9rZW4oKTtcblxuXHRcdGlmIChhZnRlck5ld2xpbmUudHlwZSA9PT0gVG9rZW5UeXBlLkVPRikge1xuXHRcdFx0Ly8gTWlzc2luZyB2YWx1ZSBhdCBlbmQgb2YgaW5wdXRcblx0XHRcdHRoaXMuZW1pdEVycm9yKGxvY2FsaXplKCdtaXNzaW5nVmFsdWUnLCAnTWlzc2luZyB2YWx1ZScpLCBjb2xvblRva2VuLnN0YXJ0T2Zmc2V0LCBjb2xvblRva2VuLmVuZE9mZnNldCwgJ21pc3NpbmctdmFsdWUnKTtcblx0XHRcdHJldHVybiB0aGlzLm1ha2VFbXB0eVNjYWxhcihjb2xvblRva2VuLmVuZE9mZnNldCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dEluZGVudCA9IHRoaXMuY3VycmVudEluZGVudCgpO1xuXG5cdFx0Ly8gU3BlY2lhbCBjYXNlOiBhIHNlcXVlbmNlIGF0IHRoZSBzYW1lIGluZGVudCBhcyB0aGUgbWFwcGluZyBrZXkgaXMgYWxsb3dlZFxuXHRcdC8vIGFzIHRoZSBtYXBwaW5nIHZhbHVlIChlLmcuLCBcImZvbzpcXG4tIDQyXCIpXG5cdFx0aWYgKG5leHRJbmRlbnQgPT09IGJhc2VJbmRlbnQgJiYgdGhpcy5wZWVrUGFzdEluZGVudCgpLnR5cGUgPT09IFRva2VuVHlwZS5EYXNoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZVZhbHVlKGJhc2VJbmRlbnQpID8/IHRoaXMubWFrZUVtcHR5U2NhbGFyKGNvbG9uVG9rZW4uZW5kT2Zmc2V0KTtcblx0XHR9XG5cblx0XHRpZiAobmV4dEluZGVudCA8PSBiYXNlSW5kZW50KSB7XG5cdFx0XHQvLyBObyBkZWVwZXIgaW5kZW50YXRpb24gXHUyMTkyIG1pc3NpbmcgdmFsdWVcblx0XHRcdHRoaXMuZW1pdEVycm9yKGxvY2FsaXplKCdtaXNzaW5nVmFsdWUnLCAnTWlzc2luZyB2YWx1ZScpLCBjb2xvblRva2VuLnN0YXJ0T2Zmc2V0LCBjb2xvblRva2VuLmVuZE9mZnNldCwgJ21pc3NpbmctdmFsdWUnKTtcblx0XHRcdHJldHVybiB0aGlzLm1ha2VFbXB0eVNjYWxhcihjb2xvblRva2VuLmVuZE9mZnNldCk7XG5cdFx0fVxuXG5cdFx0Ly8gUGFyc2UgdGhlIG5lc3RlZCB2YWx1ZVxuXHRcdHJldHVybiB0aGlzLnBhcnNlVmFsdWUoYmFzZUluZGVudCkgPz8gdGhpcy5tYWtlRW1wdHlTY2FsYXIoY29sb25Ub2tlbi5lbmRPZmZzZXQpO1xuXHR9XG5cblx0Ly8gLS0gQmxvY2sgc2VxdWVuY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIHBhcnNlQmxvY2tTZXF1ZW5jZShiYXNlSW5kZW50OiBudW1iZXIpOiBZYW1sU2VxdWVuY2VOb2RlIHtcblx0XHRjb25zdCBpdGVtczogWWFtbE5vZGVbXSA9IFtdO1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5jdXJyZW50VG9rZW4oKS5zdGFydE9mZnNldDtcblx0XHRsZXQgZW5kT2Zmc2V0ID0gc3RhcnRPZmZzZXQ7XG5cdFx0bGV0IGlzRmlyc3RJdGVtID0gdHJ1ZTtcblxuXHRcdHdoaWxlICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgIT09IFRva2VuVHlwZS5FT0YpIHtcblx0XHRcdHRoaXMuc2tpcE5ld2xpbmVzQW5kQ29tbWVudHMoKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5FT0YpIHsgYnJlYWs7IH1cblxuXHRcdFx0Ly8gRm9yIHRoZSBmaXJzdCBpdGVtLCB0aGUgZGFzaCBtYXkgYmUgb24gdGhlIHNhbWUgbGluZSAobm8gSW5kZW50IHRva2VuKS5cblx0XHRcdC8vIENvbXB1dGUgdGhlIGFjdHVhbCBjb2x1bW4gdG8gY2hlY2sgYWdhaW5zdCBiYXNlSW5kZW50LlxuXHRcdFx0bGV0IGluZGVudDogbnVtYmVyO1xuXHRcdFx0aWYgKGlzRmlyc3RJdGVtICYmIHRoaXMuY3VycmVudFRva2VuKCkudHlwZSA9PT0gVG9rZW5UeXBlLkRhc2gpIHtcblx0XHRcdFx0aW5kZW50ID0gdGhpcy5jdXJyZW50VG9rZW4oKS5zdGFydE9mZnNldCAtIHRoaXMuZ2V0TGluZVN0YXJ0KHRoaXMuY3VycmVudFRva2VuKCkuc3RhcnRPZmZzZXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5kZW50ID0gdGhpcy5jdXJyZW50SW5kZW50KCk7XG5cdFx0XHR9XG5cdFx0XHRpc0ZpcnN0SXRlbSA9IGZhbHNlO1xuXG5cdFx0XHRpZiAoaW5kZW50IDwgYmFzZUluZGVudCkgeyBicmVhazsgfVxuXG5cdFx0XHRpZiAoaW5kZW50ICE9PSBiYXNlSW5kZW50KSB7XG5cdFx0XHRcdGlmIChpbmRlbnQgPiBiYXNlSW5kZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0RXJyb3IoXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgndW5leHBlY3RlZEluZGVudGF0aW9uJywgJ1VuZXhwZWN0ZWQgaW5kZW50YXRpb24gKGV4cGVjdGVkIHswfSwgZ290IHsxfSknLCBiYXNlSW5kZW50LCBpbmRlbnQpLFxuXHRcdFx0XHRcdFx0dGhpcy5jdXJyZW50VG9rZW4oKS5zdGFydE9mZnNldCxcblx0XHRcdFx0XHRcdHRoaXMuY3VycmVudFRva2VuKCkuZW5kT2Zmc2V0LFxuXHRcdFx0XHRcdFx0J3VuZXhwZWN0ZWQtaW5kZW50YXRpb24nLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGVudFRva2VuID0gdGhpcy5wZWVrUGFzdEluZGVudCgpO1xuXHRcdFx0aWYgKGNvbnRlbnRUb2tlbi50eXBlICE9PSBUb2tlblR5cGUuRGFzaCkgeyBicmVhazsgfVxuXG5cdFx0XHQvLyBTa2lwIGluZGVudFxuXHRcdFx0aWYgKHRoaXMuY3VycmVudFRva2VuKCkudHlwZSA9PT0gVG9rZW5UeXBlLkluZGVudCkge1xuXHRcdFx0XHR0aGlzLmFkdmFuY2UoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29uc3VtZSB0aGUgZGFzaFxuXHRcdFx0Y29uc3QgZGFzaFRva2VuID0gdGhpcy5hZHZhbmNlKCk7XG5cblx0XHRcdC8vIFBhcnNlIHRoZSBpdGVtIHZhbHVlXG5cdFx0XHRjb25zdCBpdGVtVmFsdWUgPSB0aGlzLnBhcnNlU2VxdWVuY2VJdGVtVmFsdWUoYmFzZUluZGVudCwgZGFzaFRva2VuKTtcblx0XHRcdGl0ZW1zLnB1c2goaXRlbVZhbHVlKTtcblx0XHRcdGVuZE9mZnNldCA9IGl0ZW1WYWx1ZS5lbmRPZmZzZXQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdHlwZTogJ3NlcXVlbmNlJywgaXRlbXMsIHN0eWxlOiAnYmxvY2snLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0IH07XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlU2VxdWVuY2VJdGVtVmFsdWUoYmFzZUluZGVudDogbnVtYmVyLCBkYXNoVG9rZW46IFRva2VuKTogWWFtbE5vZGUge1xuXHRcdGNvbnN0IG5leHQgPSB0aGlzLmN1cnJlbnRUb2tlbigpO1xuXG5cdFx0Ly8gU2tpcCBjb21tZW50IGFmdGVyIGRhc2hcblx0XHRpZiAobmV4dC50eXBlID09PSBUb2tlblR5cGUuQ29tbWVudCkge1xuXHRcdFx0dGhpcy5hZHZhbmNlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRmxvdyBjb2xsZWN0aW9ucyBvbiBzYW1lIGxpbmVcblx0XHRpZiAobmV4dC50eXBlID09PSBUb2tlblR5cGUuRmxvd01hcFN0YXJ0KSB7IHJldHVybiB0aGlzLnBhcnNlRmxvd01hcCgpOyB9XG5cdFx0aWYgKG5leHQudHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dTZXFTdGFydCkgeyByZXR1cm4gdGhpcy5wYXJzZUZsb3dTZXEoKTsgfVxuXG5cdFx0Ly8gTmVzdGVkIHNlcXVlbmNlIG9uIHNhbWUgbGluZSAoZS5nLiwgJy0gLSB2YWx1ZScpXG5cdFx0aWYgKG5leHQudHlwZSA9PT0gVG9rZW5UeXBlLkRhc2gpIHtcblx0XHRcdC8vIFRoZSBuZXN0ZWQgc2VxdWVuY2UncyBiYXNlIGluZGVudCBpcyB0aGUgY29sdW1uIG9mIHRoZSBkYXNoXG5cdFx0XHRjb25zdCBuZXN0ZWRJbmRlbnQgPSBuZXh0LnN0YXJ0T2Zmc2V0IC0gdGhpcy5nZXRMaW5lU3RhcnQobmV4dC5zdGFydE9mZnNldCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZUJsb2NrU2VxdWVuY2UobmVzdGVkSW5kZW50KTtcblx0XHR9XG5cblx0XHQvLyBJbmxpbmUgc2NhbGFyIG9uIHNhbWUgbGluZVxuXHRcdGlmIChuZXh0LnR5cGUgPT09IFRva2VuVHlwZS5TY2FsYXIpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYWN0dWFsbHkgYSBtYXBwaW5nIChrZXk6IHZhbHVlIG9uIHNhbWUgbGluZSBhZnRlciBkYXNoKVxuXHRcdFx0aWYgKHRoaXMucGVlaygxKS50eXBlID09PSBUb2tlblR5cGUuQ29sb24pIHtcblx0XHRcdFx0Ly8gSXQncyBhbiBpbmxpbmUgbWFwcGluZyBhZnRlciAnLSAnIGxpa2UgJy0gbmFtZTogSm9obidcblx0XHRcdFx0Ly8gVGhlIGltcGxpY2l0IGluZGVudCBmb3IgY29udGludWF0aW9uIGxpbmVzIGlzIHRoZSBjb2x1bW4gb2YgdGhlIGtleVxuXHRcdFx0XHRjb25zdCBpdGVtSW5kZW50ID0gbmV4dC5zdGFydE9mZnNldCAtIHRoaXMuZ2V0TGluZVN0YXJ0KG5leHQuc3RhcnRPZmZzZXQpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYXJzZUJsb2NrTWFwcGluZyhpdGVtSW5kZW50LCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnBhcnNlU2NhbGFyKGJhc2VJbmRlbnQpO1xuXHRcdH1cblxuXHRcdC8vIFZhbHVlIG9uIG5leHQgbGluZVxuXHRcdHRoaXMuc2tpcE5ld2xpbmVzQW5kQ29tbWVudHMoKTtcblx0XHRpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuRU9GKSB7XG5cdFx0XHR0aGlzLmVtaXRFcnJvcihsb2NhbGl6ZSgnbWlzc2luZ1NlcUl0ZW1WYWx1ZScsICdNaXNzaW5nIHNlcXVlbmNlIGl0ZW0gdmFsdWUnKSwgZGFzaFRva2VuLnN0YXJ0T2Zmc2V0LCBkYXNoVG9rZW4uZW5kT2Zmc2V0LCAnbWlzc2luZy12YWx1ZScpO1xuXHRcdFx0cmV0dXJuIHRoaXMubWFrZUVtcHR5U2NhbGFyKGRhc2hUb2tlbi5lbmRPZmZzZXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5leHRJbmRlbnQgPSB0aGlzLmN1cnJlbnRJbmRlbnQoKTtcblx0XHRpZiAobmV4dEluZGVudCA8PSBiYXNlSW5kZW50KSB7XG5cdFx0XHQvLyBFbXB0eSBpdGVtIChqdXN0IGEgZGFzaClcblx0XHRcdHRoaXMuZW1pdEVycm9yKGxvY2FsaXplKCdtaXNzaW5nU2VxSXRlbVZhbHVlJywgJ01pc3Npbmcgc2VxdWVuY2UgaXRlbSB2YWx1ZScpLCBkYXNoVG9rZW4uc3RhcnRPZmZzZXQsIGRhc2hUb2tlbi5lbmRPZmZzZXQsICdtaXNzaW5nLXZhbHVlJyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5tYWtlRW1wdHlTY2FsYXIoZGFzaFRva2VuLmVuZE9mZnNldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucGFyc2VWYWx1ZShiYXNlSW5kZW50KSA/PyB0aGlzLm1ha2VFbXB0eVNjYWxhcihkYXNoVG9rZW4uZW5kT2Zmc2V0KTtcblx0fVxuXG5cdC8qKiBDYWxjdWxhdGUgdGhlIHN0YXJ0IG9mIHRoZSBsaW5lIGNvbnRhaW5pbmcgdGhlIGdpdmVuIG9mZnNldCAqL1xuXHRwcml2YXRlIGdldExpbmVTdGFydChvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGkgPSBvZmZzZXQgLSAxO1xuXHRcdHdoaWxlIChpID49IDAgJiYgdGhpcy5pbnB1dFtpXSAhPT0gJ1xcbicgJiYgdGhpcy5pbnB1dFtpXSAhPT0gJ1xccicpIHtcblx0XHRcdGktLTtcblx0XHR9XG5cdFx0cmV0dXJuIGkgKyAxO1xuXHR9XG5cblx0Ly8gLS0gRmxvdyBtYXAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIHBhcnNlRmxvd01hcCgpOiBZYW1sTWFwTm9kZSB7XG5cdFx0Y29uc3Qgc3RhcnRUb2tlbiA9IHRoaXMuYWR2YW5jZSgpOyAvLyBjb25zdW1lICd7J1xuXHRcdGNvbnN0IHByb3BlcnRpZXM6IHsga2V5OiBZYW1sU2NhbGFyTm9kZTsgdmFsdWU6IFlhbWxOb2RlIH1bXSA9IFtdO1xuXG5cdFx0dGhpcy5za2lwRmxvd1doaXRlc3BhY2UoKTtcblxuXHRcdHdoaWxlICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgIT09IFRva2VuVHlwZS5GbG93TWFwRW5kICYmIHRoaXMuY3VycmVudFRva2VuKCkudHlwZSAhPT0gVG9rZW5UeXBlLkVPRikge1xuXHRcdFx0Ly8gUGFyc2Uga2V5IChtdXN0IGJlIGEgc2NhbGFyKVxuXHRcdFx0bGV0IGtleTogWWFtbFNjYWxhck5vZGU7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuU2NhbGFyKSB7XG5cdFx0XHRcdGtleSA9IHRoaXMucGFyc2VGbG93U2NhbGFyKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVtaXRFcnJvcihsb2NhbGl6ZSgnZXhwZWN0ZWRNYXBwaW5nS2V5JywgJ0V4cGVjdGVkIG1hcHBpbmcga2V5JyksIHRoaXMuY3VycmVudFRva2VuKCkuc3RhcnRPZmZzZXQsIHRoaXMuY3VycmVudFRva2VuKCkuZW5kT2Zmc2V0LCAnZXhwZWN0ZWQta2V5Jyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNraXBGbG93V2hpdGVzcGFjZSgpO1xuXG5cdFx0XHQvLyBDaGVjayBmb3IgY29sb24gLSBpZiBtaXNzaW5nLCB0aGUga2V5IGhhcyBhbiBlbXB0eSB2YWx1ZSAodGVybWluYXRlZCBieSBjb21tYSBvciB9KVxuXHRcdFx0bGV0IHZhbHVlOiBZYW1sTm9kZTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5Db2xvbikge1xuXHRcdFx0XHR0aGlzLmFkdmFuY2UoKTtcblx0XHRcdFx0dGhpcy5za2lwRmxvd1doaXRlc3BhY2UoKTtcblxuXHRcdFx0XHQvLyBQYXJzZSB2YWx1ZVxuXHRcdFx0XHR2YWx1ZSA9IHRoaXMucGFyc2VGbG93VmFsdWUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEtleSB3aXRob3V0IHZhbHVlIChlLmcuLCB7IGtleSwgb3RoZXI6IHZhbCB9KVxuXHRcdFx0XHR2YWx1ZSA9IHRoaXMubWFrZUVtcHR5U2NhbGFyKGtleS5lbmRPZmZzZXQpO1xuXHRcdFx0fVxuXG5cdFx0XHRwcm9wZXJ0aWVzLnB1c2goeyBrZXksIHZhbHVlIH0pO1xuXG5cdFx0XHR0aGlzLnNraXBGbG93V2hpdGVzcGFjZSgpO1xuXG5cdFx0XHQvLyBDb25zdW1lIGNvbW1hIGlmIHByZXNlbnRcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5Db21tYSkge1xuXHRcdFx0XHR0aGlzLmFkdmFuY2UoKTtcblx0XHRcdFx0dGhpcy5za2lwRmxvd1doaXRlc3BhY2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlbmRUb2tlbiA9IHRoaXMuY3VycmVudFRva2VuKCk7XG5cdFx0aWYgKGVuZFRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5GbG93TWFwRW5kKSB7XG5cdFx0XHR0aGlzLmFkdmFuY2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbWl0RXJyb3IobG9jYWxpemUoJ2V4cGVjdGVkRmxvd01hcEVuZCcsICdFeHBlY3RlZCBcIn1cIicpLCBlbmRUb2tlbi5zdGFydE9mZnNldCwgZW5kVG9rZW4uZW5kT2Zmc2V0LCAnZXhwZWN0ZWQtZmxvdy1tYXAtZW5kJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdtYXAnLFxuXHRcdFx0cHJvcGVydGllcyxcblx0XHRcdHN0eWxlOiAnZmxvdycsXG5cdFx0XHRzdGFydE9mZnNldDogc3RhcnRUb2tlbi5zdGFydE9mZnNldCxcblx0XHRcdGVuZE9mZnNldDogZW5kVG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dNYXBFbmQgPyBlbmRUb2tlbi5lbmRPZmZzZXQgOiBlbmRUb2tlbi5zdGFydE9mZnNldCxcblx0XHR9O1xuXHR9XG5cblx0Ly8gLS0gRmxvdyBzZXF1ZW5jZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIHBhcnNlRmxvd1NlcSgpOiBZYW1sU2VxdWVuY2VOb2RlIHtcblx0XHRjb25zdCBzdGFydFRva2VuID0gdGhpcy5hZHZhbmNlKCk7IC8vIGNvbnN1bWUgJ1snXG5cdFx0Y29uc3QgaXRlbXM6IFlhbWxOb2RlW10gPSBbXTtcblxuXHRcdHRoaXMuc2tpcEZsb3dXaGl0ZXNwYWNlKCk7XG5cblx0XHR3aGlsZSAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlICE9PSBUb2tlblR5cGUuRmxvd1NlcUVuZCAmJiB0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgIT09IFRva2VuVHlwZS5FT0YpIHtcblx0XHRcdGxldCBpdGVtOiBZYW1sTm9kZTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5GbG93TWFwU3RhcnQpIHtcblx0XHRcdFx0aXRlbSA9IHRoaXMucGFyc2VGbG93TWFwKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuY3VycmVudFRva2VuKCkudHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dTZXFTdGFydCkge1xuXHRcdFx0XHRpdGVtID0gdGhpcy5wYXJzZUZsb3dTZXEoKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuU2NhbGFyKSB7XG5cdFx0XHRcdGl0ZW0gPSB0aGlzLnBhcnNlRmxvd1NjYWxhcigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbWl0RXJyb3IobG9jYWxpemUoJ3VuZXhwZWN0ZWRUb2tlbkluRmxvd1NlcScsICdVbmV4cGVjdGVkIHRva2VuIGluIGZsb3cgc2VxdWVuY2UnKSwgdGhpcy5jdXJyZW50VG9rZW4oKS5zdGFydE9mZnNldCwgdGhpcy5jdXJyZW50VG9rZW4oKS5lbmRPZmZzZXQsICd1bmV4cGVjdGVkLXRva2VuJyk7XG5cdFx0XHRcdHRoaXMuYWR2YW5jZSgpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aXRlbXMucHVzaChpdGVtKTtcblx0XHRcdHRoaXMuc2tpcEZsb3dXaGl0ZXNwYWNlKCk7XG5cblx0XHRcdGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5Db21tYSkge1xuXHRcdFx0XHR0aGlzLmFkdmFuY2UoKTtcblx0XHRcdFx0dGhpcy5za2lwRmxvd1doaXRlc3BhY2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlbmRUb2tlbiA9IHRoaXMuY3VycmVudFRva2VuKCk7XG5cdFx0aWYgKGVuZFRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5GbG93U2VxRW5kKSB7XG5cdFx0XHR0aGlzLmFkdmFuY2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbWl0RXJyb3IobG9jYWxpemUoJ2V4cGVjdGVkRmxvd1NlcUVuZCcsICdFeHBlY3RlZCBcIl1cIicpLCBlbmRUb2tlbi5zdGFydE9mZnNldCwgZW5kVG9rZW4uZW5kT2Zmc2V0LCAnZXhwZWN0ZWQtZmxvdy1zZXEtZW5kJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0XHRpdGVtcyxcblx0XHRcdHN0eWxlOiAnZmxvdycsXG5cdFx0XHRzdGFydE9mZnNldDogc3RhcnRUb2tlbi5zdGFydE9mZnNldCxcblx0XHRcdGVuZE9mZnNldDogZW5kVG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dTZXFFbmQgPyBlbmRUb2tlbi5lbmRPZmZzZXQgOiBlbmRUb2tlbi5zdGFydE9mZnNldCxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlIGEgc2NhbGFyIGluc2lkZSBhIGZsb3cgY29sbGVjdGlvbiwgaGFuZGxpbmcgbXVsdGlsaW5lIHBsYWluIHNjYWxhcnMuXG5cdCAqIEluIGZsb3cgY29udGV4dCwgcGxhaW4gKHVucXVvdGVkKSBzY2FsYXJzIGNhbiBzcGFuIG11bHRpcGxlIGxpbmVzO1xuXHQgKiBsaW5lIGJyZWFrcyBhcmUgZm9sZGVkIGludG8gc3BhY2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBwYXJzZUZsb3dTY2FsYXIoKTogWWFtbFNjYWxhck5vZGUge1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5hZHZhbmNlKCk7XG5cdFx0Ly8gUXVvdGVkIHNjYWxhcnMgYXJlIGNvbXBsZXRlIGFzLWlzIChzY2FubmVyIGhhbmRsZXMgdGhlaXIgbXVsdGlsaW5lIGZvbGRpbmcpXG5cdFx0aWYgKHRva2VuLmZvcm1hdCAhPT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zY2FsYXJGcm9tVG9rZW4odG9rZW4pO1xuXHRcdH1cblx0XHQvLyBGb3IgdW5xdW90ZWQgKHBsYWluKSBzY2FsYXJzLCBmb2xkIGNvbnRpbnVhdGlvbiBsaW5lcyBhY3Jvc3MgbmV3bGluZXNcblx0XHRsZXQgdmFsdWUgPSB0b2tlbi52YWx1ZTtcblx0XHRsZXQgZW5kT2Zmc2V0ID0gdG9rZW4uZW5kT2Zmc2V0O1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdC8vIExvb2sgYWhlYWQgZm9yIGEgbmV3bGluZSBmb2xsb3dlZCBieSBhIHBsYWluIHNjYWxhciBjb250aW51YXRpb25cblx0XHRcdGxldCBoYXNOZXdsaW5lID0gZmFsc2U7XG5cdFx0XHRsZXQgcCA9IHRoaXMucG9zO1xuXHRcdFx0d2hpbGUgKHAgPCB0aGlzLnRva2Vucy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgdCA9IHRoaXMudG9rZW5zW3BdO1xuXHRcdFx0XHRpZiAodC50eXBlID09PSBUb2tlblR5cGUuTmV3bGluZSkge1xuXHRcdFx0XHRcdGhhc05ld2xpbmUgPSB0cnVlO1xuXHRcdFx0XHRcdHArKztcblx0XHRcdFx0fSBlbHNlIGlmICh0LnR5cGUgPT09IFRva2VuVHlwZS5JbmRlbnQgfHwgdC50eXBlID09PSBUb2tlblR5cGUuQ29tbWVudCkge1xuXHRcdFx0XHRcdHArKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWhhc05ld2xpbmUgfHwgcCA+PSB0aGlzLnRva2Vucy5sZW5ndGgpIHsgYnJlYWs7IH1cblxuXHRcdFx0Y29uc3QgbmV4dFRva2VuID0gdGhpcy50b2tlbnNbcF07XG5cdFx0XHRpZiAobmV4dFRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5TY2FsYXIgJiYgbmV4dFRva2VuLmZvcm1hdCA9PT0gJ25vbmUnKSB7XG5cdFx0XHRcdC8vIEZvbGQgY29udGludWF0aW9uIGxpbmUgaW50byB0aGUgc2NhbGFyXG5cdFx0XHRcdHRoaXMucG9zID0gcCArIDE7XG5cdFx0XHRcdHZhbHVlICs9ICcgJyArIG5leHRUb2tlbi52YWx1ZTtcblx0XHRcdFx0ZW5kT2Zmc2V0ID0gbmV4dFRva2VuLmVuZE9mZnNldDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRcdHZhbHVlLFxuXHRcdFx0cmF3VmFsdWU6IHRoaXMuaW5wdXQuc3Vic3RyaW5nKHRva2VuLnN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQpLFxuXHRcdFx0c3RhcnRPZmZzZXQ6IHRva2VuLnN0YXJ0T2Zmc2V0LFxuXHRcdFx0ZW5kT2Zmc2V0LFxuXHRcdFx0Zm9ybWF0OiAnbm9uZScsXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBQYXJzZSBhIHZhbHVlIGluIGZsb3cgY29udGV4dCAodXNlZCBhZnRlciBjb2xvbiBpbiBmbG93IG1hcHBpbmdzL2ltcGxpY2l0IG1hcHBpbmdzKSAqL1xuXHRwcml2YXRlIHBhcnNlRmxvd1ZhbHVlKCk6IFlhbWxOb2RlIHtcblx0XHRpZiAodGhpcy5jdXJyZW50VG9rZW4oKS50eXBlID09PSBUb2tlblR5cGUuRmxvd01hcFN0YXJ0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZUZsb3dNYXAoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY3VycmVudFRva2VuKCkudHlwZSA9PT0gVG9rZW5UeXBlLkZsb3dTZXFTdGFydCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGFyc2VGbG93U2VxKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmN1cnJlbnRUb2tlbigpLnR5cGUgPT09IFRva2VuVHlwZS5TY2FsYXIpIHtcblx0XHRcdHJldHVybiB0aGlzLnBhcnNlRmxvd1NjYWxhcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tYWtlRW1wdHlTY2FsYXIodGhpcy5jdXJyZW50VG9rZW4oKS5zdGFydE9mZnNldCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFNraXAgd2hpdGVzcGFjZSwgbmV3bGluZXMsIGFuZCBjb21tZW50cyBpbnNpZGUgZmxvdyBjb2xsZWN0aW9ucyAqL1xuXHRwcml2YXRlIHNraXBGbG93V2hpdGVzcGFjZSgpOiB2b2lkIHtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgdCA9IHRoaXMuY3VycmVudFRva2VuKCkudHlwZTtcblx0XHRcdGlmICh0ID09PSBUb2tlblR5cGUuTmV3bGluZSB8fCB0ID09PSBUb2tlblR5cGUuSW5kZW50IHx8IHQgPT09IFRva2VuVHlwZS5Db21tZW50KSB7XG5cdFx0XHRcdHRoaXMuYWR2YW5jZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzY2FsYXJGcm9tVG9rZW4odG9rZW46IFRva2VuKTogWWFtbFNjYWxhck5vZGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRcdHZhbHVlOiB0b2tlbi52YWx1ZSxcblx0XHRcdHJhd1ZhbHVlOiB0b2tlbi5yYXdWYWx1ZSxcblx0XHRcdHN0YXJ0T2Zmc2V0OiB0b2tlbi5zdGFydE9mZnNldCxcblx0XHRcdGVuZE9mZnNldDogdG9rZW4uZW5kT2Zmc2V0LFxuXHRcdFx0Zm9ybWF0OiB0b2tlbi5mb3JtYXQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgbWFrZUVtcHR5U2NhbGFyKG9mZnNldDogbnVtYmVyKTogWWFtbFNjYWxhck5vZGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRcdHZhbHVlOiAnJyxcblx0XHRcdHJhd1ZhbHVlOiAnJyxcblx0XHRcdHN0YXJ0T2Zmc2V0OiBvZmZzZXQsXG5cdFx0XHRlbmRPZmZzZXQ6IG9mZnNldCxcblx0XHRcdGZvcm1hdDogJ25vbmUnLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBZ0JsQixTQUFTLE1BQU0sT0FBZSxTQUEyQixDQUFDLEdBQUcsVUFBd0IsQ0FBQyxHQUF5QjtBQUNySCxRQUFNLFVBQVUsSUFBSSxZQUFZLEtBQUs7QUFDckMsUUFBTSxTQUFTLFFBQVEsS0FBSztBQUM1QixRQUFNLFNBQVMsSUFBSSxXQUFXLFFBQVEsT0FBTyxRQUFRLE9BQU87QUFDNUQsU0FBTyxPQUFPLE1BQU07QUFDckI7QUFNTyxTQUFTLGlCQUFpQixPQUFlLFNBQTJCLENBQUMsR0FBRyxVQUF3QixDQUFDLEdBQTZCO0FBQ3BJLFFBQU0sU0FBUyxJQUFJLFlBQVksS0FBSyxFQUFFLEtBQUs7QUFDM0MsTUFBSSxPQUFPLFdBQVcsS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLHdCQUF5QjtBQUV0RSxXQUFPLElBQUksYUFBYSxRQUFXLEtBQUs7QUFBQSxFQUN6QztBQUNBLFFBQU0sd0JBQXdCLE9BQU8sTUFBTSxDQUFDLEVBQUUsS0FBSyxXQUFTLE1BQU0sU0FBUyxzQkFBdUI7QUFDbEcsTUFB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
