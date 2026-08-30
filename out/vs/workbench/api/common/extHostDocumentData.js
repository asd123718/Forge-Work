import { ok } from "../../../base/common/assert.js";
import { Schemas } from "../../../base/common/network.js";
import { regExpLeadsToEndlessLoop } from "../../../base/common/strings.js";
import { MirrorTextModel } from "../../../editor/common/model/mirrorTextModel.js";
import { ensureValidWordDefinition, getWordAtText } from "../../../editor/common/core/wordHelper.js";
import { equals } from "../../../base/common/arrays.js";
import { EndOfLine } from "./extHostTypes/textEdit.js";
import { Position } from "./extHostTypes/position.js";
import { Range } from "./extHostTypes/range.js";
const _languageId2WordDefinition = /* @__PURE__ */ new Map();
function setWordDefinitionFor(languageId, wordDefinition) {
  if (!wordDefinition) {
    _languageId2WordDefinition.delete(languageId);
  } else {
    _languageId2WordDefinition.set(languageId, wordDefinition);
  }
}
function getWordDefinitionFor(languageId) {
  return _languageId2WordDefinition.get(languageId);
}
class ExtHostDocumentData extends MirrorTextModel {
  constructor(_proxy, uri, lines, eol, versionId, _languageId, _isDirty, _encoding, _strictInstanceofChecks = true) {
    super(uri, lines, eol, versionId);
    this._proxy = _proxy;
    this._languageId = _languageId;
    this._isDirty = _isDirty;
    this._encoding = _encoding;
    this._strictInstanceofChecks = _strictInstanceofChecks;
    this._isDisposed = false;
  }
  // eslint-disable-next-line local/code-must-use-super-dispose
  dispose() {
    ok(!this._isDisposed);
    this._isDisposed = true;
    this._isDirty = false;
  }
  equalLines(lines) {
    return equals(this._lines, lines);
  }
  get document() {
    if (!this._document) {
      const that = this;
      this._document = {
        get uri() {
          return that._uri;
        },
        get fileName() {
          return that._uri.fsPath;
        },
        get isUntitled() {
          return that._uri.scheme === Schemas.untitled;
        },
        get languageId() {
          return that._languageId;
        },
        get version() {
          return that._versionId;
        },
        get isClosed() {
          return that._isDisposed;
        },
        get isDirty() {
          return that._isDirty;
        },
        get encoding() {
          return that._encoding;
        },
        save() {
          return that._save();
        },
        getText(range) {
          return range ? that._getTextInRange(range) : that.getText();
        },
        get eol() {
          return that._eol === "\n" ? EndOfLine.LF : EndOfLine.CRLF;
        },
        get lineCount() {
          return that._lines.length;
        },
        lineAt(lineOrPos) {
          return that._lineAt(lineOrPos);
        },
        offsetAt(pos) {
          return that._offsetAt(pos);
        },
        positionAt(offset) {
          return that._positionAt(offset);
        },
        validateRange(ran) {
          return that._validateRange(ran);
        },
        validatePosition(pos) {
          return that._validatePosition(pos);
        },
        getWordRangeAtPosition(pos, regexp) {
          return that._getWordRangeAtPosition(pos, regexp);
        },
        [/* @__PURE__ */ Symbol.for("debug.description")]() {
          return `TextDocument(${that._uri.toString()})`;
        }
      };
    }
    return Object.freeze(this._document);
  }
  _acceptLanguageId(newLanguageId) {
    ok(!this._isDisposed);
    this._languageId = newLanguageId;
  }
  _acceptIsDirty(isDirty) {
    ok(!this._isDisposed);
    this._isDirty = isDirty;
  }
  _acceptEncoding(encoding) {
    ok(!this._isDisposed);
    this._encoding = encoding;
  }
  _save() {
    if (this._isDisposed) {
      return Promise.reject(new Error("Document has been closed"));
    }
    return this._proxy.$trySaveDocument(this._uri);
  }
  _getTextInRange(_range) {
    const range = this._validateRange(_range);
    if (range.isEmpty) {
      return "";
    }
    if (range.isSingleLine) {
      return this._lines[range.start.line].substring(range.start.character, range.end.character);
    }
    const lineEnding = this._eol, startLineIndex = range.start.line, endLineIndex = range.end.line, resultLines = [];
    resultLines.push(this._lines[startLineIndex].substring(range.start.character));
    for (let i = startLineIndex + 1; i < endLineIndex; i++) {
      resultLines.push(this._lines[i]);
    }
    resultLines.push(this._lines[endLineIndex].substring(0, range.end.character));
    return resultLines.join(lineEnding);
  }
  _lineAt(lineOrPosition) {
    let line;
    if (lineOrPosition instanceof Position) {
      line = lineOrPosition.line;
    } else if (typeof lineOrPosition === "number") {
      line = lineOrPosition;
    } else if (!this._strictInstanceofChecks && Position.isPosition(lineOrPosition)) {
      line = lineOrPosition.line;
    }
    if (typeof line !== "number" || line < 0 || line >= this._lines.length || Math.floor(line) !== line) {
      throw new Error("Illegal value for `line`");
    }
    return new ExtHostDocumentLine(line, this._lines[line], line === this._lines.length - 1);
  }
  _offsetAt(position) {
    position = this._validatePosition(position);
    this._ensureLineStarts();
    return this._lineStarts.getPrefixSum(position.line - 1) + position.character;
  }
  _positionAt(offset) {
    offset = Math.floor(offset);
    offset = Math.max(0, offset);
    this._ensureLineStarts();
    const out = this._lineStarts.getIndexOf(offset);
    const lineLength = this._lines[out.index].length;
    return new Position(out.index, Math.min(out.remainder, lineLength));
  }
  // ---- range math
  _validateRange(range) {
    if (this._strictInstanceofChecks) {
      if (!(range instanceof Range)) {
        throw new Error("Invalid argument");
      }
    } else {
      if (!Range.isRange(range)) {
        throw new Error("Invalid argument");
      }
    }
    const start = this._validatePosition(range.start);
    const end = this._validatePosition(range.end);
    if (start === range.start && end === range.end) {
      return range;
    }
    return new Range(start.line, start.character, end.line, end.character);
  }
  _validatePosition(position) {
    if (this._strictInstanceofChecks) {
      if (!(position instanceof Position)) {
        throw new Error("Invalid argument");
      }
    } else {
      if (!Position.isPosition(position)) {
        throw new Error("Invalid argument");
      }
    }
    if (this._lines.length === 0) {
      return position.with(0, 0);
    }
    let { line, character } = position;
    let hasChanged = false;
    if (line < 0) {
      line = 0;
      character = 0;
      hasChanged = true;
    } else if (line >= this._lines.length) {
      line = this._lines.length - 1;
      character = this._lines[line].length;
      hasChanged = true;
    } else {
      const maxCharacter = this._lines[line].length;
      if (character < 0) {
        character = 0;
        hasChanged = true;
      } else if (character > maxCharacter) {
        character = maxCharacter;
        hasChanged = true;
      }
    }
    if (!hasChanged) {
      return position;
    }
    return new Position(line, character);
  }
  _getWordRangeAtPosition(_position, regexp) {
    const position = this._validatePosition(_position);
    if (!regexp) {
      regexp = getWordDefinitionFor(this._languageId);
    } else if (regExpLeadsToEndlessLoop(regexp)) {
      throw new Error(`[getWordRangeAtPosition]: ignoring custom regexp '${regexp.source}' because it matches the empty string.`);
    }
    const wordAtText = getWordAtText(
      position.character + 1,
      ensureValidWordDefinition(regexp),
      this._lines[position.line],
      0
    );
    if (wordAtText) {
      return new Range(position.line, wordAtText.startColumn - 1, position.line, wordAtText.endColumn - 1);
    }
    return void 0;
  }
}
class ExtHostDocumentLine {
  constructor(line, text, isLastLine) {
    this._line = line;
    this._text = text;
    this._isLastLine = isLastLine;
  }
  get lineNumber() {
    return this._line;
  }
  get text() {
    return this._text;
  }
  get range() {
    return new Range(this._line, 0, this._line, this._text.length);
  }
  get rangeIncludingLineBreak() {
    if (this._isLastLine) {
      return this.range;
    }
    return new Range(this._line, 0, this._line + 1, 0);
  }
  get firstNonWhitespaceCharacterIndex() {
    return /^(\s*)/.exec(this._text)[1].length;
  }
  get isEmptyOrWhitespace() {
    return this.firstNonWhitespaceCharacterIndex === this._text.length;
  }
}
export {
  ExtHostDocumentData,
  ExtHostDocumentLine,
  setWordDefinitionFor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0RG9jdW1lbnREYXRhLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb2sgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgcmVnRXhwTGVhZHNUb0VuZGxlc3NMb29wIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTWlycm9yVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC9taXJyb3JUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgZW5zdXJlVmFsaWRXb3JkRGVmaW5pdGlvbiwgZ2V0V29yZEF0VGV4dCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3JhbmdlLmpzJztcblxuY29uc3QgX2xhbmd1YWdlSWQyV29yZERlZmluaXRpb24gPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuZXhwb3J0IGZ1bmN0aW9uIHNldFdvcmREZWZpbml0aW9uRm9yKGxhbmd1YWdlSWQ6IHN0cmluZywgd29yZERlZmluaXRpb246IFJlZ0V4cCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRpZiAoIXdvcmREZWZpbml0aW9uKSB7XG5cdFx0X2xhbmd1YWdlSWQyV29yZERlZmluaXRpb24uZGVsZXRlKGxhbmd1YWdlSWQpO1xuXHR9IGVsc2Uge1xuXHRcdF9sYW5ndWFnZUlkMldvcmREZWZpbml0aW9uLnNldChsYW5ndWFnZUlkLCB3b3JkRGVmaW5pdGlvbik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0V29yZERlZmluaXRpb25Gb3IobGFuZ3VhZ2VJZDogc3RyaW5nKTogUmVnRXhwIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIF9sYW5ndWFnZUlkMldvcmREZWZpbml0aW9uLmdldChsYW5ndWFnZUlkKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdERvY3VtZW50U2F2ZURlbGVnYXRlIHtcblx0JHRyeVNhdmVEb2N1bWVudCh1cmk6IFVyaUNvbXBvbmVudHMpOiBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdERvY3VtZW50RGF0YSBleHRlbmRzIE1pcnJvclRleHRNb2RlbCB7XG5cblx0cHJpdmF0ZSBfZG9jdW1lbnQ/OiB2c2NvZGUuVGV4dERvY3VtZW50O1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IElFeHRIb3N0RG9jdW1lbnRTYXZlRGVsZWdhdGUsXG5cdFx0dXJpOiBVUkksIGxpbmVzOiBzdHJpbmdbXSwgZW9sOiBzdHJpbmcsIHZlcnNpb25JZDogbnVtYmVyLFxuXHRcdHByaXZhdGUgX2xhbmd1YWdlSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIF9pc0RpcnR5OiBib29sZWFuLFxuXHRcdHByaXZhdGUgX2VuY29kaW5nOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RyaWN0SW5zdGFuY2VvZkNoZWNrcyA9IHRydWUgLy8gdXNlZCBmb3IgY29kZSByZXVzZVxuXHQpIHtcblx0XHRzdXBlcih1cmksIGxpbmVzLCBlb2wsIHZlcnNpb25JZCk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1tdXN0LXVzZS1zdXBlci1kaXNwb3NlXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gd2UgZG9uJ3QgcmVhbGx5IGRpc3Bvc2UgZG9jdW1lbnRzIGJ1dCBsZXRcblx0XHQvLyBleHRlbnNpb25zIHN0aWxsIHJlYWQgZnJvbSB0aGVtLiBzb21lXG5cdFx0Ly8gb3BlcmF0aW9ucywgbGl2ZSBzYXZpbmcsIHdpbGwgbm93IGVycm9yIHRob1xuXHRcdG9rKCF0aGlzLl9pc0Rpc3Bvc2VkKTtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9pc0RpcnR5ID0gZmFsc2U7XG5cdH1cblxuXHRlcXVhbExpbmVzKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlcXVhbHModGhpcy5fbGluZXMsIGxpbmVzKTtcblx0fVxuXG5cdGdldCBkb2N1bWVudCgpOiB2c2NvZGUuVGV4dERvY3VtZW50IHtcblx0XHRpZiAoIXRoaXMuX2RvY3VtZW50KSB7XG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdHRoaXMuX2RvY3VtZW50ID0ge1xuXHRcdFx0XHRnZXQgdXJpKCkgeyByZXR1cm4gdGhhdC5fdXJpOyB9LFxuXHRcdFx0XHRnZXQgZmlsZU5hbWUoKSB7IHJldHVybiB0aGF0Ll91cmkuZnNQYXRoOyB9LFxuXHRcdFx0XHRnZXQgaXNVbnRpdGxlZCgpIHsgcmV0dXJuIHRoYXQuX3VyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQ7IH0sXG5cdFx0XHRcdGdldCBsYW5ndWFnZUlkKCkgeyByZXR1cm4gdGhhdC5fbGFuZ3VhZ2VJZDsgfSxcblx0XHRcdFx0Z2V0IHZlcnNpb24oKSB7IHJldHVybiB0aGF0Ll92ZXJzaW9uSWQ7IH0sXG5cdFx0XHRcdGdldCBpc0Nsb3NlZCgpIHsgcmV0dXJuIHRoYXQuX2lzRGlzcG9zZWQ7IH0sXG5cdFx0XHRcdGdldCBpc0RpcnR5KCkgeyByZXR1cm4gdGhhdC5faXNEaXJ0eTsgfSxcblx0XHRcdFx0Z2V0IGVuY29kaW5nKCkgeyByZXR1cm4gdGhhdC5fZW5jb2Rpbmc7IH0sXG5cdFx0XHRcdHNhdmUoKSB7IHJldHVybiB0aGF0Ll9zYXZlKCk7IH0sXG5cdFx0XHRcdGdldFRleHQocmFuZ2U/KSB7IHJldHVybiByYW5nZSA/IHRoYXQuX2dldFRleHRJblJhbmdlKHJhbmdlKSA6IHRoYXQuZ2V0VGV4dCgpOyB9LFxuXHRcdFx0XHRnZXQgZW9sKCkgeyByZXR1cm4gdGhhdC5fZW9sID09PSAnXFxuJyA/IEVuZE9mTGluZS5MRiA6IEVuZE9mTGluZS5DUkxGOyB9LFxuXHRcdFx0XHRnZXQgbGluZUNvdW50KCkgeyByZXR1cm4gdGhhdC5fbGluZXMubGVuZ3RoOyB9LFxuXHRcdFx0XHRsaW5lQXQobGluZU9yUG9zOiBudW1iZXIgfCB2c2NvZGUuUG9zaXRpb24pIHsgcmV0dXJuIHRoYXQuX2xpbmVBdChsaW5lT3JQb3MpOyB9LFxuXHRcdFx0XHRvZmZzZXRBdChwb3MpIHsgcmV0dXJuIHRoYXQuX29mZnNldEF0KHBvcyk7IH0sXG5cdFx0XHRcdHBvc2l0aW9uQXQob2Zmc2V0KSB7IHJldHVybiB0aGF0Ll9wb3NpdGlvbkF0KG9mZnNldCk7IH0sXG5cdFx0XHRcdHZhbGlkYXRlUmFuZ2UocmFuKSB7IHJldHVybiB0aGF0Ll92YWxpZGF0ZVJhbmdlKHJhbik7IH0sXG5cdFx0XHRcdHZhbGlkYXRlUG9zaXRpb24ocG9zKSB7IHJldHVybiB0aGF0Ll92YWxpZGF0ZVBvc2l0aW9uKHBvcyk7IH0sXG5cdFx0XHRcdGdldFdvcmRSYW5nZUF0UG9zaXRpb24ocG9zLCByZWdleHA/KSB7IHJldHVybiB0aGF0Ll9nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKHBvcywgcmVnZXhwKTsgfSxcblx0XHRcdFx0W1N5bWJvbC5mb3IoJ2RlYnVnLmRlc2NyaXB0aW9uJyldKCkge1xuXHRcdFx0XHRcdHJldHVybiBgVGV4dERvY3VtZW50KCR7dGhhdC5fdXJpLnRvU3RyaW5nKCl9KWA7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHRoaXMuX2RvY3VtZW50KTtcblx0fVxuXG5cdF9hY2NlcHRMYW5ndWFnZUlkKG5ld0xhbmd1YWdlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdG9rKCF0aGlzLl9pc0Rpc3Bvc2VkKTtcblx0XHR0aGlzLl9sYW5ndWFnZUlkID0gbmV3TGFuZ3VhZ2VJZDtcblx0fVxuXG5cdF9hY2NlcHRJc0RpcnR5KGlzRGlydHk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRvayghdGhpcy5faXNEaXNwb3NlZCk7XG5cdFx0dGhpcy5faXNEaXJ0eSA9IGlzRGlydHk7XG5cdH1cblxuXHRfYWNjZXB0RW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZyk6IHZvaWQge1xuXHRcdG9rKCF0aGlzLl9pc0Rpc3Bvc2VkKTtcblx0XHR0aGlzLl9lbmNvZGluZyA9IGVuY29kaW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignRG9jdW1lbnQgaGFzIGJlZW4gY2xvc2VkJykpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHRyeVNhdmVEb2N1bWVudCh0aGlzLl91cmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGV4dEluUmFuZ2UoX3JhbmdlOiB2c2NvZGUuUmFuZ2UpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fdmFsaWRhdGVSYW5nZShfcmFuZ2UpO1xuXG5cdFx0aWYgKHJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRpZiAocmFuZ2UuaXNTaW5nbGVMaW5lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGluZXNbcmFuZ2Uuc3RhcnQubGluZV0uc3Vic3RyaW5nKHJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgcmFuZ2UuZW5kLmNoYXJhY3Rlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUVuZGluZyA9IHRoaXMuX2VvbCxcblx0XHRcdHN0YXJ0TGluZUluZGV4ID0gcmFuZ2Uuc3RhcnQubGluZSxcblx0XHRcdGVuZExpbmVJbmRleCA9IHJhbmdlLmVuZC5saW5lLFxuXHRcdFx0cmVzdWx0TGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRyZXN1bHRMaW5lcy5wdXNoKHRoaXMuX2xpbmVzW3N0YXJ0TGluZUluZGV4XS5zdWJzdHJpbmcocmFuZ2Uuc3RhcnQuY2hhcmFjdGVyKSk7XG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0TGluZUluZGV4ICsgMTsgaSA8IGVuZExpbmVJbmRleDsgaSsrKSB7XG5cdFx0XHRyZXN1bHRMaW5lcy5wdXNoKHRoaXMuX2xpbmVzW2ldKTtcblx0XHR9XG5cdFx0cmVzdWx0TGluZXMucHVzaCh0aGlzLl9saW5lc1tlbmRMaW5lSW5kZXhdLnN1YnN0cmluZygwLCByYW5nZS5lbmQuY2hhcmFjdGVyKSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0TGluZXMuam9pbihsaW5lRW5kaW5nKTtcblx0fVxuXG5cdHByaXZhdGUgX2xpbmVBdChsaW5lT3JQb3NpdGlvbjogbnVtYmVyIHwgdnNjb2RlLlBvc2l0aW9uKTogdnNjb2RlLlRleHRMaW5lIHtcblxuXHRcdGxldCBsaW5lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGxpbmVPclBvc2l0aW9uIGluc3RhbmNlb2YgUG9zaXRpb24pIHtcblx0XHRcdGxpbmUgPSBsaW5lT3JQb3NpdGlvbi5saW5lO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGxpbmVPclBvc2l0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0bGluZSA9IGxpbmVPclBvc2l0aW9uO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuX3N0cmljdEluc3RhbmNlb2ZDaGVja3MgJiYgUG9zaXRpb24uaXNQb3NpdGlvbihsaW5lT3JQb3NpdGlvbikpIHtcblx0XHRcdGxpbmUgPSBsaW5lT3JQb3NpdGlvbi5saW5lO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbGluZSAhPT0gJ251bWJlcicgfHwgbGluZSA8IDAgfHwgbGluZSA+PSB0aGlzLl9saW5lcy5sZW5ndGggfHwgTWF0aC5mbG9vcihsaW5lKSAhPT0gbGluZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbGxlZ2FsIHZhbHVlIGZvciBgbGluZWAnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IEV4dEhvc3REb2N1bWVudExpbmUobGluZSwgdGhpcy5fbGluZXNbbGluZV0sIGxpbmUgPT09IHRoaXMuX2xpbmVzLmxlbmd0aCAtIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb2Zmc2V0QXQocG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbik6IG51bWJlciB7XG5cdFx0cG9zaXRpb24gPSB0aGlzLl92YWxpZGF0ZVBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHR0aGlzLl9lbnN1cmVMaW5lU3RhcnRzKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVTdGFydHMhLmdldFByZWZpeFN1bShwb3NpdGlvbi5saW5lIC0gMSkgKyBwb3NpdGlvbi5jaGFyYWN0ZXI7XG5cdH1cblxuXHRwcml2YXRlIF9wb3NpdGlvbkF0KG9mZnNldDogbnVtYmVyKTogdnNjb2RlLlBvc2l0aW9uIHtcblx0XHRvZmZzZXQgPSBNYXRoLmZsb29yKG9mZnNldCk7XG5cdFx0b2Zmc2V0ID0gTWF0aC5tYXgoMCwgb2Zmc2V0KTtcblxuXHRcdHRoaXMuX2Vuc3VyZUxpbmVTdGFydHMoKTtcblx0XHRjb25zdCBvdXQgPSB0aGlzLl9saW5lU3RhcnRzIS5nZXRJbmRleE9mKG9mZnNldCk7XG5cblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gdGhpcy5fbGluZXNbb3V0LmluZGV4XS5sZW5ndGg7XG5cblx0XHQvLyBFbnN1cmUgd2UgcmV0dXJuIGEgdmFsaWQgcG9zaXRpb25cblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKG91dC5pbmRleCwgTWF0aC5taW4ob3V0LnJlbWFpbmRlciwgbGluZUxlbmd0aCkpO1xuXHR9XG5cblx0Ly8gLS0tLSByYW5nZSBtYXRoXG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVSYW5nZShyYW5nZTogdnNjb2RlLlJhbmdlKTogdnNjb2RlLlJhbmdlIHtcblx0XHRpZiAodGhpcy5fc3RyaWN0SW5zdGFuY2VvZkNoZWNrcykge1xuXHRcdFx0aWYgKCEocmFuZ2UgaW5zdGFuY2VvZiBSYW5nZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50Jyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghUmFuZ2UuaXNSYW5nZShyYW5nZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLl92YWxpZGF0ZVBvc2l0aW9uKHJhbmdlLnN0YXJ0KTtcblx0XHRjb25zdCBlbmQgPSB0aGlzLl92YWxpZGF0ZVBvc2l0aW9uKHJhbmdlLmVuZCk7XG5cblx0XHRpZiAoc3RhcnQgPT09IHJhbmdlLnN0YXJ0ICYmIGVuZCA9PT0gcmFuZ2UuZW5kKSB7XG5cdFx0XHRyZXR1cm4gcmFuZ2U7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQubGluZSwgc3RhcnQuY2hhcmFjdGVyLCBlbmQubGluZSwgZW5kLmNoYXJhY3Rlcik7XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZVBvc2l0aW9uKHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24pOiB2c2NvZGUuUG9zaXRpb24ge1xuXHRcdGlmICh0aGlzLl9zdHJpY3RJbnN0YW5jZW9mQ2hlY2tzKSB7XG5cdFx0XHRpZiAoIShwb3NpdGlvbiBpbnN0YW5jZW9mIFBvc2l0aW9uKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQnKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCFQb3NpdGlvbi5pc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbGluZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gcG9zaXRpb24ud2l0aCgwLCAwKTtcblx0XHR9XG5cblx0XHRsZXQgeyBsaW5lLCBjaGFyYWN0ZXIgfSA9IHBvc2l0aW9uO1xuXHRcdGxldCBoYXNDaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRpZiAobGluZSA8IDApIHtcblx0XHRcdGxpbmUgPSAwO1xuXHRcdFx0Y2hhcmFjdGVyID0gMDtcblx0XHRcdGhhc0NoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRlbHNlIGlmIChsaW5lID49IHRoaXMuX2xpbmVzLmxlbmd0aCkge1xuXHRcdFx0bGluZSA9IHRoaXMuX2xpbmVzLmxlbmd0aCAtIDE7XG5cdFx0XHRjaGFyYWN0ZXIgPSB0aGlzLl9saW5lc1tsaW5lXS5sZW5ndGg7XG5cdFx0XHRoYXNDaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBtYXhDaGFyYWN0ZXIgPSB0aGlzLl9saW5lc1tsaW5lXS5sZW5ndGg7XG5cdFx0XHRpZiAoY2hhcmFjdGVyIDwgMCkge1xuXHRcdFx0XHRjaGFyYWN0ZXIgPSAwO1xuXHRcdFx0XHRoYXNDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKGNoYXJhY3RlciA+IG1heENoYXJhY3Rlcikge1xuXHRcdFx0XHRjaGFyYWN0ZXIgPSBtYXhDaGFyYWN0ZXI7XG5cdFx0XHRcdGhhc0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaGFzQ2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuIHBvc2l0aW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmUsIGNoYXJhY3Rlcik7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKF9wb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uLCByZWdleHA/OiBSZWdFeHApOiB2c2NvZGUuUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fdmFsaWRhdGVQb3NpdGlvbihfcG9zaXRpb24pO1xuXG5cdFx0aWYgKCFyZWdleHApIHtcblx0XHRcdC8vIHVzZSBkZWZhdWx0IHdoZW4gY3VzdG9tLXJlZ2V4cCBpc24ndCBwcm92aWRlZFxuXHRcdFx0cmVnZXhwID0gZ2V0V29yZERlZmluaXRpb25Gb3IodGhpcy5fbGFuZ3VhZ2VJZCk7XG5cblx0XHR9IGVsc2UgaWYgKHJlZ0V4cExlYWRzVG9FbmRsZXNzTG9vcChyZWdleHApKSB7XG5cdFx0XHQvLyB1c2UgZGVmYXVsdCB3aGVuIGN1c3RvbS1yZWdleHAgaXMgYmFkXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtnZXRXb3JkUmFuZ2VBdFBvc2l0aW9uXTogaWdub3JpbmcgY3VzdG9tIHJlZ2V4cCAnJHtyZWdleHAuc291cmNlfScgYmVjYXVzZSBpdCBtYXRjaGVzIHRoZSBlbXB0eSBzdHJpbmcuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29yZEF0VGV4dCA9IGdldFdvcmRBdFRleHQoXG5cdFx0XHRwb3NpdGlvbi5jaGFyYWN0ZXIgKyAxLFxuXHRcdFx0ZW5zdXJlVmFsaWRXb3JkRGVmaW5pdGlvbihyZWdleHApLFxuXHRcdFx0dGhpcy5fbGluZXNbcG9zaXRpb24ubGluZV0sXG5cdFx0XHQwXG5cdFx0KTtcblxuXHRcdGlmICh3b3JkQXRUZXh0KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmUsIHdvcmRBdFRleHQuc3RhcnRDb2x1bW4gLSAxLCBwb3NpdGlvbi5saW5lLCB3b3JkQXRUZXh0LmVuZENvbHVtbiAtIDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0RG9jdW1lbnRMaW5lIGltcGxlbWVudHMgdnNjb2RlLlRleHRMaW5lIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfaXNMYXN0TGluZTogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihsaW5lOiBudW1iZXIsIHRleHQ6IHN0cmluZywgaXNMYXN0TGluZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2xpbmUgPSBsaW5lO1xuXHRcdHRoaXMuX3RleHQgPSB0ZXh0O1xuXHRcdHRoaXMuX2lzTGFzdExpbmUgPSBpc0xhc3RMaW5lO1xuXHR9XG5cblx0cHVibGljIGdldCBsaW5lTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdGV4dDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgcmFuZ2UoKTogUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgUmFuZ2UodGhpcy5fbGluZSwgMCwgdGhpcy5fbGluZSwgdGhpcy5fdGV4dC5sZW5ndGgpO1xuXHR9XG5cblx0cHVibGljIGdldCByYW5nZUluY2x1ZGluZ0xpbmVCcmVhaygpOiBSYW5nZSB7XG5cdFx0aWYgKHRoaXMuX2lzTGFzdExpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLnJhbmdlO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFJhbmdlKHRoaXMuX2xpbmUsIDAsIHRoaXMuX2xpbmUgKyAxLCAwKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVySW5kZXgoKTogbnVtYmVyIHtcblx0XHQvL1RPRE9AYXBpLCByZW5hbWUgdG8gJ2xlYWRpbmdXaGl0ZXNwYWNlTGVuZ3RoJ1xuXHRcdHJldHVybiAvXihcXHMqKS8uZXhlYyh0aGlzLl90ZXh0KSFbMV0ubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldCBpc0VtcHR5T3JXaGl0ZXNwYWNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlckluZGV4ID09PSB0aGlzLl90ZXh0Lmxlbmd0aDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxVQUFVO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQixxQkFBcUI7QUFFekQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUV0QixNQUFNLDZCQUE2QixvQkFBSSxJQUFvQjtBQUNwRCxTQUFTLHFCQUFxQixZQUFvQixnQkFBMEM7QUFDbEcsTUFBSSxDQUFDLGdCQUFnQjtBQUNwQiwr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QUFPLElBQUksU0FBUyxNQUFNLFNBQVM7QUFBQSxFQUNwQztBQUFBLEVBRVEsd0JBQXdCLFdBQTRCLFFBQTJDO0FBQ3RHLFVBQU0sV0FBVyxLQUFLLGtCQUFrQixTQUFTO0FBRWpELFFBQUksQ0FBQyxRQUFRO0FBRVosZUFBUyxxQkFBcUIsS0FBSyxXQUFXO0FBQUEsSUFFL0MsV0FBVyx5QkFBeUIsTUFBTSxHQUFHO0FBRTVDLFlBQU0sSUFBSSxNQUFNLHFEQUFxRCxPQUFPLE1BQU0sd0NBQXdDO0FBQUEsSUFDM0g7QUFFQSxVQUFNLGFBQWE7QUFBQSxNQUNsQixTQUFTLFlBQVk7QUFBQSxNQUNyQiwwQkFBMEIsTUFBTTtBQUFBLE1BQ2hDLEtBQUssT0FBTyxTQUFTLElBQUk7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFlBQVk7QUFDZixhQUFPLElBQUksTUFBTSxTQUFTLE1BQU0sV0FBVyxjQUFjLEdBQUcsU0FBUyxNQUFNLFdBQVcsWUFBWSxDQUFDO0FBQUEsSUFDcEc7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRU8sTUFBTSxvQkFBK0M7QUFBQSxFQU0zRCxZQUFZLE1BQWMsTUFBYyxZQUFxQjtBQUM1RCxTQUFLLFFBQVE7QUFDYixTQUFLLFFBQVE7QUFDYixTQUFLLGNBQWM7QUFBQSxFQUNwQjtBQUFBLEVBRUEsSUFBVyxhQUFxQjtBQUMvQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFXLE9BQWU7QUFDekIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxRQUFlO0FBQ3pCLFdBQU8sSUFBSSxNQUFNLEtBQUssT0FBTyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU0sTUFBTTtBQUFBLEVBQzlEO0FBQUEsRUFFQSxJQUFXLDBCQUFpQztBQUMzQyxRQUFJLEtBQUssYUFBYTtBQUNyQixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsV0FBTyxJQUFJLE1BQU0sS0FBSyxPQUFPLEdBQUcsS0FBSyxRQUFRLEdBQUcsQ0FBQztBQUFBLEVBQ2xEO0FBQUEsRUFFQSxJQUFXLG1DQUEyQztBQUVyRCxXQUFPLFNBQVMsS0FBSyxLQUFLLEtBQUssRUFBRyxDQUFDLEVBQUU7QUFBQSxFQUN0QztBQUFBLEVBRUEsSUFBVyxzQkFBK0I7QUFDekMsV0FBTyxLQUFLLHFDQUFxQyxLQUFLLE1BQU07QUFBQSxFQUM3RDtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
