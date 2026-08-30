import { NotSupportedError } from "../../../../../base/common/errors.js";
import { StandardTokenType, TokenMetadata } from "../../../encodedTokenAttributes.js";
import { TextAstNode } from "./ast.js";
import { lengthAdd, lengthDiff, lengthGetColumnCountIfZeroLineCount, lengthToObj, lengthZero, toLength } from "./length.js";
import { SmallImmutableSet } from "./smallImmutableSet.js";
var TokenKind = /* @__PURE__ */ ((TokenKind2) => {
  TokenKind2[TokenKind2["Text"] = 0] = "Text";
  TokenKind2[TokenKind2["OpeningBracket"] = 1] = "OpeningBracket";
  TokenKind2[TokenKind2["ClosingBracket"] = 2] = "ClosingBracket";
  return TokenKind2;
})(TokenKind || {});
class Token {
  constructor(length, kind, bracketId, bracketIds, astNode) {
    this.length = length;
    this.kind = kind;
    this.bracketId = bracketId;
    this.bracketIds = bracketIds;
    this.astNode = astNode;
  }
}
class TextBufferTokenizer {
  constructor(textModel, bracketTokens) {
    this.textModel = textModel;
    this.bracketTokens = bracketTokens;
    this.reader = new NonPeekableTextBufferTokenizer(this.textModel, this.bracketTokens);
    this._offset = lengthZero;
    this.didPeek = false;
    this.peeked = null;
    this.textBufferLineCount = textModel.getLineCount();
    this.textBufferLastLineLength = textModel.getLineLength(this.textBufferLineCount);
  }
  get offset() {
    return this._offset;
  }
  get length() {
    return toLength(this.textBufferLineCount - 1, this.textBufferLastLineLength);
  }
  getText() {
    return this.textModel.getValue();
  }
  skip(length) {
    this.didPeek = false;
    this._offset = lengthAdd(this._offset, length);
    const obj = lengthToObj(this._offset);
    this.reader.setPosition(obj.lineCount, obj.columnCount);
  }
  read() {
    let token;
    if (this.peeked) {
      this.didPeek = false;
      token = this.peeked;
    } else {
      token = this.reader.read();
    }
    if (token) {
      this._offset = lengthAdd(this._offset, token.length);
    }
    return token;
  }
  peek() {
    if (!this.didPeek) {
      this.peeked = this.reader.read();
      this.didPeek = true;
    }
    return this.peeked;
  }
}
class NonPeekableTextBufferTokenizer {
  constructor(textModel, bracketTokens) {
    this.textModel = textModel;
    this.bracketTokens = bracketTokens;
    this.lineIdx = 0;
    this.line = null;
    this.lineCharOffset = 0;
    this.lineTokens = null;
    this.lineTokenOffset = 0;
    /** Must be a zero line token. The end of the document cannot be peeked. */
    this.peekedToken = null;
    this.textBufferLineCount = textModel.getLineCount();
    this.textBufferLastLineLength = textModel.getLineLength(this.textBufferLineCount);
  }
  setPosition(lineIdx, column) {
    if (lineIdx === this.lineIdx) {
      this.lineCharOffset = column;
      if (this.line !== null) {
        this.lineTokenOffset = this.lineCharOffset === 0 ? 0 : this.lineTokens.findTokenIndexAtOffset(this.lineCharOffset);
      }
    } else {
      this.lineIdx = lineIdx;
      this.lineCharOffset = column;
      this.line = null;
    }
    this.peekedToken = null;
  }
  read() {
    if (this.peekedToken) {
      const token = this.peekedToken;
      this.peekedToken = null;
      this.lineCharOffset += lengthGetColumnCountIfZeroLineCount(token.length);
      return token;
    }
    if (this.lineIdx > this.textBufferLineCount - 1 || this.lineIdx === this.textBufferLineCount - 1 && this.lineCharOffset >= this.textBufferLastLineLength) {
      return null;
    }
    if (this.line === null) {
      this.lineTokens = this.textModel.tokenization.getLineTokens(this.lineIdx + 1);
      this.line = this.lineTokens.getLineContent();
      this.lineTokenOffset = this.lineCharOffset === 0 ? 0 : this.lineTokens.findTokenIndexAtOffset(this.lineCharOffset);
    }
    const startLineIdx = this.lineIdx;
    const startLineCharOffset = this.lineCharOffset;
    let lengthHeuristic = 0;
    while (true) {
      const lineTokens = this.lineTokens;
      const tokenCount = lineTokens.getCount();
      let peekedBracketToken = null;
      if (this.lineTokenOffset < tokenCount) {
        const tokenMetadata = lineTokens.getMetadata(this.lineTokenOffset);
        while (this.lineTokenOffset + 1 < tokenCount && tokenMetadata === lineTokens.getMetadata(this.lineTokenOffset + 1)) {
          this.lineTokenOffset++;
        }
        const isOther = TokenMetadata.getTokenType(tokenMetadata) === StandardTokenType.Other;
        const containsBracketType = TokenMetadata.containsBalancedBrackets(tokenMetadata);
        const endOffset = lineTokens.getEndOffset(this.lineTokenOffset);
        if (containsBracketType && isOther && this.lineCharOffset < endOffset) {
          const languageId = lineTokens.getLanguageId(this.lineTokenOffset);
          const text = this.line.substring(this.lineCharOffset, endOffset);
          const brackets = this.bracketTokens.getSingleLanguageBracketTokens(languageId);
          const regexp = brackets.regExpGlobal;
          if (regexp) {
            regexp.lastIndex = 0;
            const match = regexp.exec(text);
            if (match) {
              peekedBracketToken = brackets.getToken(match[0]);
              if (peekedBracketToken) {
                this.lineCharOffset += match.index;
              }
            }
          }
        }
        lengthHeuristic += endOffset - this.lineCharOffset;
        if (peekedBracketToken) {
          if (startLineIdx !== this.lineIdx || startLineCharOffset !== this.lineCharOffset) {
            this.peekedToken = peekedBracketToken;
            break;
          } else {
            this.lineCharOffset += lengthGetColumnCountIfZeroLineCount(peekedBracketToken.length);
            return peekedBracketToken;
          }
        } else {
          this.lineTokenOffset++;
          this.lineCharOffset = endOffset;
        }
      } else {
        if (this.lineIdx === this.textBufferLineCount - 1) {
          break;
        }
        this.lineIdx++;
        this.lineTokens = this.textModel.tokenization.getLineTokens(this.lineIdx + 1);
        this.lineTokenOffset = 0;
        this.line = this.lineTokens.getLineContent();
        this.lineCharOffset = 0;
        lengthHeuristic += 33;
        if (lengthHeuristic > 1e3) {
          break;
        }
      }
      if (lengthHeuristic > 1500) {
        break;
      }
    }
    const length = lengthDiff(startLineIdx, startLineCharOffset, this.lineIdx, this.lineCharOffset);
    return new Token(length, 0 /* Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(length));
  }
}
class FastTokenizer {
  constructor(text, brackets) {
    this.text = text;
    this._offset = lengthZero;
    this.idx = 0;
    const regExpStr = brackets.getRegExpStr();
    const regexp = regExpStr ? new RegExp(regExpStr + "|\n", "gi") : null;
    const tokens = [];
    let match;
    let curLineCount = 0;
    let lastLineBreakOffset = 0;
    let lastTokenEndOffset = 0;
    let lastTokenEndLine = 0;
    const smallTextTokens0Line = [];
    for (let i = 0; i < 60; i++) {
      smallTextTokens0Line.push(
        new Token(
          toLength(0, i),
          0 /* Text */,
          -1,
          SmallImmutableSet.getEmpty(),
          new TextAstNode(toLength(0, i))
        )
      );
    }
    const smallTextTokens1Line = [];
    for (let i = 0; i < 60; i++) {
      smallTextTokens1Line.push(
        new Token(
          toLength(1, i),
          0 /* Text */,
          -1,
          SmallImmutableSet.getEmpty(),
          new TextAstNode(toLength(1, i))
        )
      );
    }
    if (regexp) {
      regexp.lastIndex = 0;
      while ((match = regexp.exec(text)) !== null) {
        const curOffset = match.index;
        const value = match[0];
        if (value === "\n") {
          curLineCount++;
          lastLineBreakOffset = curOffset + 1;
        } else {
          if (lastTokenEndOffset !== curOffset) {
            let token;
            if (lastTokenEndLine === curLineCount) {
              const colCount = curOffset - lastTokenEndOffset;
              if (colCount < smallTextTokens0Line.length) {
                token = smallTextTokens0Line[colCount];
              } else {
                const length = toLength(0, colCount);
                token = new Token(length, 0 /* Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(length));
              }
            } else {
              const lineCount = curLineCount - lastTokenEndLine;
              const colCount = curOffset - lastLineBreakOffset;
              if (lineCount === 1 && colCount < smallTextTokens1Line.length) {
                token = smallTextTokens1Line[colCount];
              } else {
                const length = toLength(lineCount, colCount);
                token = new Token(length, 0 /* Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(length));
              }
            }
            tokens.push(token);
          }
          tokens.push(brackets.getToken(value));
          lastTokenEndOffset = curOffset + value.length;
          lastTokenEndLine = curLineCount;
        }
      }
    }
    const offset = text.length;
    if (lastTokenEndOffset !== offset) {
      const length = lastTokenEndLine === curLineCount ? toLength(0, offset - lastTokenEndOffset) : toLength(curLineCount - lastTokenEndLine, offset - lastLineBreakOffset);
      tokens.push(new Token(length, 0 /* Text */, -1, SmallImmutableSet.getEmpty(), new TextAstNode(length)));
    }
    this.length = toLength(curLineCount, offset - lastLineBreakOffset);
    this.tokens = tokens;
  }
  get offset() {
    return this._offset;
  }
  read() {
    return this.tokens[this.idx++] || null;
  }
  peek() {
    return this.tokens[this.idx] || null;
  }
  skip(length) {
    throw new NotSupportedError();
  }
  getText() {
    return this.text;
  }
}
export {
  FastTokenizer,
  TextBufferTokenizer,
  Token,
  TokenKind
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXGJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnRcXGJyYWNrZXRQYWlyc1RyZWVcXHRva2VuaXplci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE5vdFN1cHBvcnRlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkVG9rZW5UeXBlLCBUb2tlbk1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBJVmlld0xpbmVUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBCcmFja2V0QXN0Tm9kZSwgVGV4dEFzdE5vZGUgfSBmcm9tICcuL2FzdC5qcyc7XG5pbXBvcnQgeyBCcmFja2V0VG9rZW5zLCBMYW5ndWFnZUFnbm9zdGljQnJhY2tldFRva2VucyB9IGZyb20gJy4vYnJhY2tldHMuanMnO1xuaW1wb3J0IHsgTGVuZ3RoLCBsZW5ndGhBZGQsIGxlbmd0aERpZmYsIGxlbmd0aEdldENvbHVtbkNvdW50SWZaZXJvTGluZUNvdW50LCBsZW5ndGhUb09iaiwgbGVuZ3RoWmVybywgdG9MZW5ndGggfSBmcm9tICcuL2xlbmd0aC5qcyc7XG5pbXBvcnQgeyBTbWFsbEltbXV0YWJsZVNldCB9IGZyb20gJy4vc21hbGxJbW11dGFibGVTZXQuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRva2VuaXplciB7XG5cdHJlYWRvbmx5IG9mZnNldDogTGVuZ3RoO1xuXHRyZWFkb25seSBsZW5ndGg6IExlbmd0aDtcblxuXHRyZWFkKCk6IFRva2VuIHwgbnVsbDtcblx0cGVlaygpOiBUb2tlbiB8IG51bGw7XG5cdHNraXAobGVuZ3RoOiBMZW5ndGgpOiB2b2lkO1xuXG5cdGdldFRleHQoKTogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBUb2tlbktpbmQge1xuXHRUZXh0ID0gMCxcblx0T3BlbmluZ0JyYWNrZXQgPSAxLFxuXHRDbG9zaW5nQnJhY2tldCA9IDIsXG59XG5cbmV4cG9ydCB0eXBlIE9wZW5pbmdCcmFja2V0SWQgPSBudW1iZXI7XG5cbmV4cG9ydCBjbGFzcyBUb2tlbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGxlbmd0aDogTGVuZ3RoLFxuXHRcdHJlYWRvbmx5IGtpbmQ6IFRva2VuS2luZCxcblx0XHQvKipcblx0XHQgKiBJZiB0aGlzIHRva2VuIGlzIGFuIG9wZW5pbmcgYnJhY2tldCwgdGhpcyBpcyB0aGUgaWQgb2YgdGhlIG9wZW5pbmcgYnJhY2tldC5cblx0XHQgKiBJZiB0aGlzIHRva2VuIGlzIGEgY2xvc2luZyBicmFja2V0LCB0aGlzIGlzIHRoZSBpZCBvZiB0aGUgZmlyc3Qgb3BlbmluZyBicmFja2V0IHRoYXQgaXMgY2xvc2VkIGJ5IHRoaXMgYnJhY2tldC5cblx0XHQgKiBPdGhlcndpc2UsIGl0IGlzIC0xLlxuXHRcdCAqL1xuXHRcdHJlYWRvbmx5IGJyYWNrZXRJZDogT3BlbmluZ0JyYWNrZXRJZCxcblx0XHQvKipcblx0XHQgKiBJZiB0aGlzIHRva2VuIGlzIGFuIG9wZW5pbmcgYnJhY2tldCwgdGhpcyBqdXN0IGNvbnRhaW5zIGBicmFja2V0SWRgLlxuXHRcdCAqIElmIHRoaXMgdG9rZW4gaXMgYSBjbG9zaW5nIGJyYWNrZXQsIHRoaXMgbGlzdHMgYWxsIG9wZW5pbmcgYnJhY2tldCBpZHMsIHRoYXQgaXQgY2xvc2VzLlxuXHRcdCAqIE90aGVyd2lzZSwgaXQgaXMgZW1wdHkuXG5cdFx0ICovXG5cdFx0cmVhZG9ubHkgYnJhY2tldElkczogU21hbGxJbW11dGFibGVTZXQ8T3BlbmluZ0JyYWNrZXRJZD4sXG5cdFx0cmVhZG9ubHkgYXN0Tm9kZTogQnJhY2tldEFzdE5vZGUgfCBUZXh0QXN0Tm9kZSB8IHVuZGVmaW5lZCxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVG9rZW5pemVyU291cmNlIHtcblx0Z2V0VmFsdWUoKTogc3RyaW5nO1xuXHRnZXRMaW5lQ291bnQoKTogbnVtYmVyO1xuXHRnZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlcjtcblxuXHR0b2tlbml6YXRpb246IHtcblx0XHRnZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXI6IG51bWJlcik6IElWaWV3TGluZVRva2Vucztcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIFRleHRCdWZmZXJUb2tlbml6ZXIgaW1wbGVtZW50cyBUb2tlbml6ZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IHRleHRCdWZmZXJMaW5lQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSB0ZXh0QnVmZmVyTGFzdExpbmVMZW5ndGg6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlYWRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbDogSVRva2VuaXplclNvdXJjZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJyYWNrZXRUb2tlbnM6IExhbmd1YWdlQWdub3N0aWNCcmFja2V0VG9rZW5zXG5cdCkge1xuXHRcdHRoaXMucmVhZGVyID0gbmV3IE5vblBlZWthYmxlVGV4dEJ1ZmZlclRva2VuaXplcih0aGlzLnRleHRNb2RlbCwgdGhpcy5icmFja2V0VG9rZW5zKTtcblx0XHR0aGlzLl9vZmZzZXQgPSBsZW5ndGhaZXJvO1xuXHRcdHRoaXMuZGlkUGVlayA9IGZhbHNlO1xuXHRcdHRoaXMucGVla2VkID0gbnVsbDtcblx0XHR0aGlzLnRleHRCdWZmZXJMaW5lQ291bnQgPSB0ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0dGhpcy50ZXh0QnVmZmVyTGFzdExpbmVMZW5ndGggPSB0ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aCh0aGlzLnRleHRCdWZmZXJMaW5lQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb2Zmc2V0OiBMZW5ndGg7XG5cblx0Z2V0IG9mZnNldCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb2Zmc2V0O1xuXHR9XG5cblx0Z2V0IGxlbmd0aCgpIHtcblx0XHRyZXR1cm4gdG9MZW5ndGgodGhpcy50ZXh0QnVmZmVyTGluZUNvdW50IC0gMSwgdGhpcy50ZXh0QnVmZmVyTGFzdExpbmVMZW5ndGgpO1xuXHR9XG5cblx0Z2V0VGV4dCgpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblx0fVxuXG5cdHNraXAobGVuZ3RoOiBMZW5ndGgpOiB2b2lkIHtcblx0XHR0aGlzLmRpZFBlZWsgPSBmYWxzZTtcblx0XHR0aGlzLl9vZmZzZXQgPSBsZW5ndGhBZGQodGhpcy5fb2Zmc2V0LCBsZW5ndGgpO1xuXHRcdGNvbnN0IG9iaiA9IGxlbmd0aFRvT2JqKHRoaXMuX29mZnNldCk7XG5cdFx0dGhpcy5yZWFkZXIuc2V0UG9zaXRpb24ob2JqLmxpbmVDb3VudCwgb2JqLmNvbHVtbkNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgZGlkUGVlaztcblx0cHJpdmF0ZSBwZWVrZWQ6IFRva2VuIHwgbnVsbDtcblxuXHRyZWFkKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0bGV0IHRva2VuOiBUb2tlbiB8IG51bGw7XG5cdFx0aWYgKHRoaXMucGVla2VkKSB7XG5cdFx0XHR0aGlzLmRpZFBlZWsgPSBmYWxzZTtcblx0XHRcdHRva2VuID0gdGhpcy5wZWVrZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRva2VuID0gdGhpcy5yZWFkZXIucmVhZCgpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4pIHtcblx0XHRcdHRoaXMuX29mZnNldCA9IGxlbmd0aEFkZCh0aGlzLl9vZmZzZXQsIHRva2VuLmxlbmd0aCk7XG5cdFx0fVxuXHRcdHJldHVybiB0b2tlbjtcblx0fVxuXG5cdHBlZWsoKTogVG9rZW4gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuZGlkUGVlaykge1xuXHRcdFx0dGhpcy5wZWVrZWQgPSB0aGlzLnJlYWRlci5yZWFkKCk7XG5cdFx0XHR0aGlzLmRpZFBlZWsgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5wZWVrZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBEb2VzIG5vdCBzdXBwb3J0IHBlZWsuXG4qL1xuY2xhc3MgTm9uUGVla2FibGVUZXh0QnVmZmVyVG9rZW5pemVyIHtcblx0cHJpdmF0ZSByZWFkb25seSB0ZXh0QnVmZmVyTGluZUNvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGV4dEJ1ZmZlckxhc3RMaW5lTGVuZ3RoOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWw6IElUb2tlbml6ZXJTb3VyY2UsIHByaXZhdGUgcmVhZG9ubHkgYnJhY2tldFRva2VuczogTGFuZ3VhZ2VBZ25vc3RpY0JyYWNrZXRUb2tlbnMpIHtcblx0XHR0aGlzLnRleHRCdWZmZXJMaW5lQ291bnQgPSB0ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0dGhpcy50ZXh0QnVmZmVyTGFzdExpbmVMZW5ndGggPSB0ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aCh0aGlzLnRleHRCdWZmZXJMaW5lQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBsaW5lSWR4ID0gMDtcblx0cHJpdmF0ZSBsaW5lOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBsaW5lQ2hhck9mZnNldCA9IDA7XG5cdHByaXZhdGUgbGluZVRva2VuczogSVZpZXdMaW5lVG9rZW5zIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgbGluZVRva2VuT2Zmc2V0ID0gMDtcblxuXHRwdWJsaWMgc2V0UG9zaXRpb24obGluZUlkeDogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIFdlIG11c3Qgbm90IGp1bXAgaW50byBhIHRva2VuIVxuXHRcdGlmIChsaW5lSWR4ID09PSB0aGlzLmxpbmVJZHgpIHtcblx0XHRcdHRoaXMubGluZUNoYXJPZmZzZXQgPSBjb2x1bW47XG5cdFx0XHRpZiAodGhpcy5saW5lICE9PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMubGluZVRva2VuT2Zmc2V0ID0gdGhpcy5saW5lQ2hhck9mZnNldCA9PT0gMCA/IDAgOiB0aGlzLmxpbmVUb2tlbnMhLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQodGhpcy5saW5lQ2hhck9mZnNldCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGluZUlkeCA9IGxpbmVJZHg7XG5cdFx0XHR0aGlzLmxpbmVDaGFyT2Zmc2V0ID0gY29sdW1uO1xuXHRcdFx0dGhpcy5saW5lID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5wZWVrZWRUb2tlbiA9IG51bGw7XG5cdH1cblxuXHQvKiogTXVzdCBiZSBhIHplcm8gbGluZSB0b2tlbi4gVGhlIGVuZCBvZiB0aGUgZG9jdW1lbnQgY2Fubm90IGJlIHBlZWtlZC4gKi9cblx0cHJpdmF0ZSBwZWVrZWRUb2tlbjogVG9rZW4gfCBudWxsID0gbnVsbDtcblxuXHRwdWJsaWMgcmVhZCgpOiBUb2tlbiB8IG51bGwge1xuXHRcdGlmICh0aGlzLnBlZWtlZFRva2VuKSB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHRoaXMucGVla2VkVG9rZW47XG5cdFx0XHR0aGlzLnBlZWtlZFRva2VuID0gbnVsbDtcblx0XHRcdHRoaXMubGluZUNoYXJPZmZzZXQgKz0gbGVuZ3RoR2V0Q29sdW1uQ291bnRJZlplcm9MaW5lQ291bnQodG9rZW4ubGVuZ3RoKTtcblx0XHRcdHJldHVybiB0b2tlbjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5saW5lSWR4ID4gdGhpcy50ZXh0QnVmZmVyTGluZUNvdW50IC0gMSB8fCAodGhpcy5saW5lSWR4ID09PSB0aGlzLnRleHRCdWZmZXJMaW5lQ291bnQgLSAxICYmIHRoaXMubGluZUNoYXJPZmZzZXQgPj0gdGhpcy50ZXh0QnVmZmVyTGFzdExpbmVMZW5ndGgpKSB7XG5cdFx0XHQvLyBXZSBhcmUgYWZ0ZXIgdGhlIGVuZFxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubGluZSA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5saW5lVG9rZW5zID0gdGhpcy50ZXh0TW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnModGhpcy5saW5lSWR4ICsgMSk7XG5cdFx0XHR0aGlzLmxpbmUgPSB0aGlzLmxpbmVUb2tlbnMuZ2V0TGluZUNvbnRlbnQoKTtcblx0XHRcdHRoaXMubGluZVRva2VuT2Zmc2V0ID0gdGhpcy5saW5lQ2hhck9mZnNldCA9PT0gMCA/IDAgOiB0aGlzLmxpbmVUb2tlbnMuZmluZFRva2VuSW5kZXhBdE9mZnNldCh0aGlzLmxpbmVDaGFyT2Zmc2V0KTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydExpbmVJZHggPSB0aGlzLmxpbmVJZHg7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lQ2hhck9mZnNldCA9IHRoaXMubGluZUNoYXJPZmZzZXQ7XG5cblx0XHQvLyBsaW1pdHMgdGhlIGxlbmd0aCBvZiB0ZXh0IHRva2Vucy5cblx0XHQvLyBJZiB0ZXh0IHRva2VucyBnZXQgdG9vIGxvbmcsIGluY3JlbWVudGFsIHVwZGF0ZXMgd2lsbCBiZSBzbG93XG5cdFx0bGV0IGxlbmd0aEhldXJpc3RpYyA9IDA7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSB0aGlzLmxpbmVUb2tlbnMhO1xuXHRcdFx0Y29uc3QgdG9rZW5Db3VudCA9IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTtcblxuXHRcdFx0bGV0IHBlZWtlZEJyYWNrZXRUb2tlbjogVG9rZW4gfCBudWxsID0gbnVsbDtcblxuXHRcdFx0aWYgKHRoaXMubGluZVRva2VuT2Zmc2V0IDwgdG9rZW5Db3VudCkge1xuXHRcdFx0XHRjb25zdCB0b2tlbk1ldGFkYXRhID0gbGluZVRva2Vucy5nZXRNZXRhZGF0YSh0aGlzLmxpbmVUb2tlbk9mZnNldCk7XG5cdFx0XHRcdHdoaWxlICh0aGlzLmxpbmVUb2tlbk9mZnNldCArIDEgPCB0b2tlbkNvdW50ICYmIHRva2VuTWV0YWRhdGEgPT09IGxpbmVUb2tlbnMuZ2V0TWV0YWRhdGEodGhpcy5saW5lVG9rZW5PZmZzZXQgKyAxKSkge1xuXHRcdFx0XHRcdC8vIFNraXAgdG9rZW5zIHRoYXQgYXJlIGlkZW50aWNhbC5cblx0XHRcdFx0XHQvLyBTb21ldGltZXMsIChicmFja2V0KSBpZGVudGlmaWVycyBhcmUgc3BsaXQgdXAgaW50byBtdWx0aXBsZSB0b2tlbnMuXG5cdFx0XHRcdFx0dGhpcy5saW5lVG9rZW5PZmZzZXQrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlzT3RoZXIgPSBUb2tlbk1ldGFkYXRhLmdldFRva2VuVHlwZSh0b2tlbk1ldGFkYXRhKSA9PT0gU3RhbmRhcmRUb2tlblR5cGUuT3RoZXI7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5zQnJhY2tldFR5cGUgPSBUb2tlbk1ldGFkYXRhLmNvbnRhaW5zQmFsYW5jZWRCcmFja2V0cyh0b2tlbk1ldGFkYXRhKTtcblxuXHRcdFx0XHRjb25zdCBlbmRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0aGlzLmxpbmVUb2tlbk9mZnNldCk7XG5cdFx0XHRcdC8vIElzIHRoZXJlIGEgYnJhY2tldCB0b2tlbiBuZXh0PyBPbmx5IGNvbnN1bWUgdGV4dC5cblx0XHRcdFx0aWYgKGNvbnRhaW5zQnJhY2tldFR5cGUgJiYgaXNPdGhlciAmJiB0aGlzLmxpbmVDaGFyT2Zmc2V0IDwgZW5kT2Zmc2V0KSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0aGlzLmxpbmVUb2tlbk9mZnNldCk7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMubGluZS5zdWJzdHJpbmcodGhpcy5saW5lQ2hhck9mZnNldCwgZW5kT2Zmc2V0KTtcblxuXHRcdFx0XHRcdGNvbnN0IGJyYWNrZXRzID0gdGhpcy5icmFja2V0VG9rZW5zLmdldFNpbmdsZUxhbmd1YWdlQnJhY2tldFRva2VucyhsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRjb25zdCByZWdleHAgPSBicmFja2V0cy5yZWdFeHBHbG9iYWw7XG5cdFx0XHRcdFx0aWYgKHJlZ2V4cCkge1xuXHRcdFx0XHRcdFx0cmVnZXhwLmxhc3RJbmRleCA9IDA7XG5cdFx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IHJlZ2V4cC5leGVjKHRleHQpO1xuXHRcdFx0XHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdFx0XHRcdHBlZWtlZEJyYWNrZXRUb2tlbiA9IGJyYWNrZXRzLmdldFRva2VuKG1hdGNoWzBdKSE7XG5cdFx0XHRcdFx0XHRcdGlmIChwZWVrZWRCcmFja2V0VG9rZW4pIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBDb25zdW1lIGxlYWRpbmcgdGV4dCBvZiB0aGUgdG9rZW5cblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxpbmVDaGFyT2Zmc2V0ICs9IG1hdGNoLmluZGV4O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGVuZ3RoSGV1cmlzdGljICs9IGVuZE9mZnNldCAtIHRoaXMubGluZUNoYXJPZmZzZXQ7XG5cblx0XHRcdFx0aWYgKHBlZWtlZEJyYWNrZXRUb2tlbikge1xuXHRcdFx0XHRcdC8vIERvbid0IHNraXAgdGhlIGVudGlyZSB0b2tlbiwgYXMgYSBzaW5nbGUgdG9rZW4gY291bGQgY29udGFpbiBtdWx0aXBsZSBicmFja2V0cy5cblxuXHRcdFx0XHRcdGlmIChzdGFydExpbmVJZHggIT09IHRoaXMubGluZUlkeCB8fCBzdGFydExpbmVDaGFyT2Zmc2V0ICE9PSB0aGlzLmxpbmVDaGFyT2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHQvLyBUaGVyZSBpcyB0ZXh0IGJlZm9yZSB0aGUgYnJhY2tldFxuXHRcdFx0XHRcdFx0dGhpcy5wZWVrZWRUb2tlbiA9IHBlZWtlZEJyYWNrZXRUb2tlbjtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBDb25zdW1lIHRoZSBwZWVrZWQgdG9rZW5cblx0XHRcdFx0XHRcdHRoaXMubGluZUNoYXJPZmZzZXQgKz0gbGVuZ3RoR2V0Q29sdW1uQ291bnRJZlplcm9MaW5lQ291bnQocGVla2VkQnJhY2tldFRva2VuLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGVla2VkQnJhY2tldFRva2VuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBTa2lwIHRoZSBlbnRpcmUgdG9rZW4sIGFzIHRoZSB0b2tlbiBjb250YWlucyBubyBicmFja2V0cyBhdCBhbGwuXG5cdFx0XHRcdFx0dGhpcy5saW5lVG9rZW5PZmZzZXQrKztcblx0XHRcdFx0XHR0aGlzLmxpbmVDaGFyT2Zmc2V0ID0gZW5kT2Zmc2V0O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5saW5lSWR4ID09PSB0aGlzLnRleHRCdWZmZXJMaW5lQ291bnQgLSAxKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5saW5lSWR4Kys7XG5cdFx0XHRcdHRoaXMubGluZVRva2VucyA9IHRoaXMudGV4dE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKHRoaXMubGluZUlkeCArIDEpO1xuXHRcdFx0XHR0aGlzLmxpbmVUb2tlbk9mZnNldCA9IDA7XG5cdFx0XHRcdHRoaXMubGluZSA9IHRoaXMubGluZVRva2Vucy5nZXRMaW5lQ29udGVudCgpO1xuXHRcdFx0XHR0aGlzLmxpbmVDaGFyT2Zmc2V0ID0gMDtcblxuXHRcdFx0XHRsZW5ndGhIZXVyaXN0aWMgKz0gMzM7IC8vIG1heCAxMDAwLzMzID0gMzAgbGluZXNcblx0XHRcdFx0Ly8gVGhpcyBsaW1pdHMgdGhlIGFtb3VudCBvZiB3b3JrIHRvIHJlY29tcHV0ZSBtaW4taW5kZW50YXRpb25cblxuXHRcdFx0XHRpZiAobGVuZ3RoSGV1cmlzdGljID4gMTAwMCkge1xuXHRcdFx0XHRcdC8vIG9ubHkgYnJlYWsgKGF1dG9tYXRpY2FsbHkpIGF0IHRoZSBlbmQgb2YgbGluZS5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobGVuZ3RoSGV1cmlzdGljID4gMTUwMCkge1xuXHRcdFx0XHQvLyBFdmVudHVhbGx5IGJyZWFrIHJlZ2FyZGxlc3Mgb2YgdGhlIGxpbmUgbGVuZ3RoIHNvIHRoYXRcblx0XHRcdFx0Ly8gdmVyeSBsb25nIGxpbmVzIGRvIG5vdCBjYXVzZSBiYWQgcGVyZm9ybWFuY2UuXG5cdFx0XHRcdC8vIFRoaXMgZWZmZWN0aXZlIGxpbWl0cyBtYXggaW5kZW50YXRpb24gdG8gNTAwLCBhc1xuXHRcdFx0XHQvLyBpbmRlbnRhdGlvbiBpcyBub3QgY29tcHV0ZWQgYWNyb3NzIG11bHRpcGxlIHRleHQgbm9kZXMuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIGEgdG9rZW4gY29udGFpbnMgc29tZSBwcm9wZXIgaW5kZW50YXRpb24sIGl0IGFsc28gY29udGFpbnMgXFxue0lOREVOVEFUSU9OK30oPyF7SU5ERU5UQVRJT059KSxcblx0XHQvLyB1bmxlc3MgdGhlIGxpbmUgaXMgdG9vIGxvbmcuXG5cdFx0Ly8gVGh1cywgdGhlIG1pbiBpbmRlbnRhdGlvbiBvZiB0aGUgZG9jdW1lbnQgaXMgdGhlIG1pbmltdW0gbWluIGluZGVudGF0aW9uIG9mIGV2ZXJ5IHRleHQgbm9kZS5cblx0XHRjb25zdCBsZW5ndGggPSBsZW5ndGhEaWZmKHN0YXJ0TGluZUlkeCwgc3RhcnRMaW5lQ2hhck9mZnNldCwgdGhpcy5saW5lSWR4LCB0aGlzLmxpbmVDaGFyT2Zmc2V0KTtcblx0XHRyZXR1cm4gbmV3IFRva2VuKGxlbmd0aCwgVG9rZW5LaW5kLlRleHQsIC0xLCBTbWFsbEltbXV0YWJsZVNldC5nZXRFbXB0eSgpLCBuZXcgVGV4dEFzdE5vZGUobGVuZ3RoKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZhc3RUb2tlbml6ZXIgaW1wbGVtZW50cyBUb2tlbml6ZXIge1xuXHRwcml2YXRlIF9vZmZzZXQ6IExlbmd0aCA9IGxlbmd0aFplcm87XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9rZW5zOiByZWFkb25seSBUb2tlbltdO1xuXHRwcml2YXRlIGlkeCA9IDA7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB0ZXh0OiBzdHJpbmcsIGJyYWNrZXRzOiBCcmFja2V0VG9rZW5zKSB7XG5cdFx0Y29uc3QgcmVnRXhwU3RyID0gYnJhY2tldHMuZ2V0UmVnRXhwU3RyKCk7XG5cdFx0Y29uc3QgcmVnZXhwID0gcmVnRXhwU3RyID8gbmV3IFJlZ0V4cChyZWdFeHBTdHIgKyAnfFxcbicsICdnaScpIDogbnVsbDtcblxuXHRcdGNvbnN0IHRva2VuczogVG9rZW5bXSA9IFtdO1xuXG5cdFx0bGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdGxldCBjdXJMaW5lQ291bnQgPSAwO1xuXHRcdGxldCBsYXN0TGluZUJyZWFrT2Zmc2V0ID0gMDtcblxuXHRcdGxldCBsYXN0VG9rZW5FbmRPZmZzZXQgPSAwO1xuXHRcdGxldCBsYXN0VG9rZW5FbmRMaW5lID0gMDtcblxuXHRcdGNvbnN0IHNtYWxsVGV4dFRva2VuczBMaW5lOiBUb2tlbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA2MDsgaSsrKSB7XG5cdFx0XHRzbWFsbFRleHRUb2tlbnMwTGluZS5wdXNoKFxuXHRcdFx0XHRuZXcgVG9rZW4oXG5cdFx0XHRcdFx0dG9MZW5ndGgoMCwgaSksIFRva2VuS2luZC5UZXh0LCAtMSwgU21hbGxJbW11dGFibGVTZXQuZ2V0RW1wdHkoKSxcblx0XHRcdFx0XHRuZXcgVGV4dEFzdE5vZGUodG9MZW5ndGgoMCwgaSkpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc21hbGxUZXh0VG9rZW5zMUxpbmU6IFRva2VuW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDYwOyBpKyspIHtcblx0XHRcdHNtYWxsVGV4dFRva2VuczFMaW5lLnB1c2goXG5cdFx0XHRcdG5ldyBUb2tlbihcblx0XHRcdFx0XHR0b0xlbmd0aCgxLCBpKSwgVG9rZW5LaW5kLlRleHQsIC0xLCBTbWFsbEltbXV0YWJsZVNldC5nZXRFbXB0eSgpLFxuXHRcdFx0XHRcdG5ldyBUZXh0QXN0Tm9kZSh0b0xlbmd0aCgxLCBpKSlcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAocmVnZXhwKSB7XG5cdFx0XHRyZWdleHAubGFzdEluZGV4ID0gMDtcblx0XHRcdC8vIElmIGEgdG9rZW4gY29udGFpbnMgaW5kZW50YXRpb24sIGl0IGFsc28gY29udGFpbnMgXFxue0lOREVOVEFUSU9OK30oPyF7SU5ERU5UQVRJT059KVxuXHRcdFx0d2hpbGUgKChtYXRjaCA9IHJlZ2V4cC5leGVjKHRleHQpKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRjb25zdCBjdXJPZmZzZXQgPSBtYXRjaC5pbmRleDtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBtYXRjaFswXTtcblx0XHRcdFx0aWYgKHZhbHVlID09PSAnXFxuJykge1xuXHRcdFx0XHRcdGN1ckxpbmVDb3VudCsrO1xuXHRcdFx0XHRcdGxhc3RMaW5lQnJlYWtPZmZzZXQgPSBjdXJPZmZzZXQgKyAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChsYXN0VG9rZW5FbmRPZmZzZXQgIT09IGN1ck9mZnNldCkge1xuXHRcdFx0XHRcdFx0bGV0IHRva2VuOiBUb2tlbjtcblx0XHRcdFx0XHRcdGlmIChsYXN0VG9rZW5FbmRMaW5lID09PSBjdXJMaW5lQ291bnQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29sQ291bnQgPSBjdXJPZmZzZXQgLSBsYXN0VG9rZW5FbmRPZmZzZXQ7XG5cdFx0XHRcdFx0XHRcdGlmIChjb2xDb3VudCA8IHNtYWxsVGV4dFRva2VuczBMaW5lLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRcdHRva2VuID0gc21hbGxUZXh0VG9rZW5zMExpbmVbY29sQ291bnRdO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxlbmd0aCA9IHRvTGVuZ3RoKDAsIGNvbENvdW50KTtcblx0XHRcdFx0XHRcdFx0XHR0b2tlbiA9IG5ldyBUb2tlbihsZW5ndGgsIFRva2VuS2luZC5UZXh0LCAtMSwgU21hbGxJbW11dGFibGVTZXQuZ2V0RW1wdHkoKSwgbmV3IFRleHRBc3ROb2RlKGxlbmd0aCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsaW5lQ291bnQgPSBjdXJMaW5lQ291bnQgLSBsYXN0VG9rZW5FbmRMaW5lO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb2xDb3VudCA9IGN1ck9mZnNldCAtIGxhc3RMaW5lQnJlYWtPZmZzZXQ7XG5cdFx0XHRcdFx0XHRcdGlmIChsaW5lQ291bnQgPT09IDEgJiYgY29sQ291bnQgPCBzbWFsbFRleHRUb2tlbnMxTGluZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0XHR0b2tlbiA9IHNtYWxsVGV4dFRva2VuczFMaW5lW2NvbENvdW50XTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBsZW5ndGggPSB0b0xlbmd0aChsaW5lQ291bnQsIGNvbENvdW50KTtcblx0XHRcdFx0XHRcdFx0XHR0b2tlbiA9IG5ldyBUb2tlbihsZW5ndGgsIFRva2VuS2luZC5UZXh0LCAtMSwgU21hbGxJbW11dGFibGVTZXQuZ2V0RW1wdHkoKSwgbmV3IFRleHRBc3ROb2RlKGxlbmd0aCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0b2tlbnMucHVzaCh0b2tlbik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gdmFsdWUgaXMgbWF0Y2hlZCBieSByZWdleHAsIHNvIHRoZSB0b2tlbiBtdXN0IGV4aXN0XG5cdFx0XHRcdFx0dG9rZW5zLnB1c2goYnJhY2tldHMuZ2V0VG9rZW4odmFsdWUpISk7XG5cblx0XHRcdFx0XHRsYXN0VG9rZW5FbmRPZmZzZXQgPSBjdXJPZmZzZXQgKyB2YWx1ZS5sZW5ndGg7XG5cdFx0XHRcdFx0bGFzdFRva2VuRW5kTGluZSA9IGN1ckxpbmVDb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG9mZnNldCA9IHRleHQubGVuZ3RoO1xuXG5cdFx0aWYgKGxhc3RUb2tlbkVuZE9mZnNldCAhPT0gb2Zmc2V0KSB7XG5cdFx0XHRjb25zdCBsZW5ndGggPSAobGFzdFRva2VuRW5kTGluZSA9PT0gY3VyTGluZUNvdW50KVxuXHRcdFx0XHQ/IHRvTGVuZ3RoKDAsIG9mZnNldCAtIGxhc3RUb2tlbkVuZE9mZnNldClcblx0XHRcdFx0OiB0b0xlbmd0aChjdXJMaW5lQ291bnQgLSBsYXN0VG9rZW5FbmRMaW5lLCBvZmZzZXQgLSBsYXN0TGluZUJyZWFrT2Zmc2V0KTtcblx0XHRcdHRva2Vucy5wdXNoKG5ldyBUb2tlbihsZW5ndGgsIFRva2VuS2luZC5UZXh0LCAtMSwgU21hbGxJbW11dGFibGVTZXQuZ2V0RW1wdHkoKSwgbmV3IFRleHRBc3ROb2RlKGxlbmd0aCkpKTtcblx0XHR9XG5cblx0XHR0aGlzLmxlbmd0aCA9IHRvTGVuZ3RoKGN1ckxpbmVDb3VudCwgb2Zmc2V0IC0gbGFzdExpbmVCcmVha09mZnNldCk7XG5cdFx0dGhpcy50b2tlbnMgPSB0b2tlbnM7XG5cdH1cblxuXHRnZXQgb2Zmc2V0KCk6IExlbmd0aCB7XG5cdFx0cmV0dXJuIHRoaXMuX29mZnNldDtcblx0fVxuXG5cdHJlYWRvbmx5IGxlbmd0aDogTGVuZ3RoO1xuXG5cdHJlYWQoKTogVG9rZW4gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy50b2tlbnNbdGhpcy5pZHgrK10gfHwgbnVsbDtcblx0fVxuXG5cdHBlZWsoKTogVG9rZW4gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy50b2tlbnNbdGhpcy5pZHhdIHx8IG51bGw7XG5cdH1cblxuXHRza2lwKGxlbmd0aDogTGVuZ3RoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IE5vdFN1cHBvcnRlZEVycm9yKCk7XG5cdH1cblxuXHRnZXRUZXh0KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudGV4dDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIscUJBQXFCO0FBRWpELFNBQXlCLG1CQUFtQjtBQUU1QyxTQUFpQixXQUFXLFlBQVkscUNBQXFDLGFBQWEsWUFBWSxnQkFBZ0I7QUFDdEgsU0FBUyx5QkFBeUI7QUFhM0IsSUFBVyxZQUFYLGtCQUFXQSxlQUFYO0FBQ04sRUFBQUEsc0JBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsc0JBQUEsb0JBQWlCLEtBQWpCO0FBQ0EsRUFBQUEsc0JBQUEsb0JBQWlCLEtBQWpCO0FBSGlCLFNBQUFBO0FBQUEsR0FBQTtBQVFYLE1BQU0sTUFBTTtBQUFBLEVBQ2xCLFlBQ1UsUUFDQSxNQU1BLFdBTUEsWUFDQSxTQUNSO0FBZlE7QUFDQTtBQU1BO0FBTUE7QUFDQTtB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
