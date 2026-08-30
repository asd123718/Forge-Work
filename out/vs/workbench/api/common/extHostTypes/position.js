var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
import { illegalArgument } from "../../../../base/common/errors.js";
import { es5ClassCompat } from "./es5ClassCompat.js";
let Position = class {
  static Min(...positions) {
    if (positions.length === 0) {
      throw new TypeError();
    }
    let result = positions[0];
    for (let i = 1; i < positions.length; i++) {
      const p = positions[i];
      if (p.isBefore(result)) {
        result = p;
      }
    }
    return result;
  }
  static Max(...positions) {
    if (positions.length === 0) {
      throw new TypeError();
    }
    let result = positions[0];
    for (let i = 1; i < positions.length; i++) {
      const p = positions[i];
      if (p.isAfter(result)) {
        result = p;
      }
    }
    return result;
  }
  static isPosition(other) {
    if (!other) {
      return false;
    }
    if (other instanceof Position) {
      return true;
    }
    const { line, character } = other;
    if (typeof line === "number" && typeof character === "number") {
      return true;
    }
    return false;
  }
  static of(obj) {
    if (obj instanceof Position) {
      return obj;
    } else if (this.isPosition(obj)) {
      return new Position(obj.line, obj.character);
    }
    throw new Error("Invalid argument, is NOT a position-like object");
  }
  get line() {
    return this._line;
  }
  get character() {
    return this._character;
  }
  constructor(line, character) {
    if (line < 0) {
      throw illegalArgument("line must be non-negative");
    }
    if (character < 0) {
      throw illegalArgument("character must be non-negative");
    }
    this._line = line;
    this._character = character;
  }
  isBefore(other) {
    if (this._line < other._line) {
      return true;
    }
    if (other._line < this._line) {
      return false;
    }
    return this._character < other._character;
  }
  isBeforeOrEqual(other) {
    if (this._line < other._line) {
      return true;
    }
    if (other._line < this._line) {
      return false;
    }
    return this._character <= other._character;
  }
  isAfter(other) {
    return !this.isBeforeOrEqual(other);
  }
  isAfterOrEqual(other) {
    return !this.isBefore(other);
  }
  isEqual(other) {
    return this._line === other._line && this._character === other._character;
  }
  compareTo(other) {
    if (this._line < other._line) {
      return -1;
    } else if (this._line > other.line) {
      return 1;
    } else {
      if (this._character < other._character) {
        return -1;
      } else if (this._character > other._character) {
        return 1;
      } else {
        return 0;
      }
    }
  }
  translate(lineDeltaOrChange, characterDelta = 0) {
    if (lineDeltaOrChange === null || characterDelta === null) {
      throw illegalArgument();
    }
    let lineDelta;
    if (typeof lineDeltaOrChange === "undefined") {
      lineDelta = 0;
    } else if (typeof lineDeltaOrChange === "number") {
      lineDelta = lineDeltaOrChange;
    } else {
      lineDelta = typeof lineDeltaOrChange.lineDelta === "number" ? lineDeltaOrChange.lineDelta : 0;
      characterDelta = typeof lineDeltaOrChange.characterDelta === "number" ? lineDeltaOrChange.characterDelta : 0;
    }
    if (lineDelta === 0 && characterDelta === 0) {
      return this;
    }
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }
  with(lineOrChange, character = this.character) {
    if (lineOrChange === null || character === null) {
      throw illegalArgument();
    }
    let line;
    if (typeof lineOrChange === "undefined") {
      line = this.line;
    } else if (typeof lineOrChange === "number") {
      line = lineOrChange;
    } else {
      line = typeof lineOrChange.line === "number" ? lineOrChange.line : this.line;
      character = typeof lineOrChange.character === "number" ? lineOrChange.character : this.character;
    }
    if (line === this.line && character === this.character) {
      return this;
    }
    return new Position(line, character);
  }
  toJSON() {
    return { line: this.line, character: this.character };
  }
  [/* @__PURE__ */ Symbol.for("debug.description")]() {
    return `(${this.line}:${this.character})`;
  }
};
Position = __decorateClass([
  es5ClassCompat
], Position);
export {
  Position
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXHBvc2l0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGlsbGVnYWxBcmd1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBQb3NpdGlvbiB7XG5cblx0c3RhdGljIE1pbiguLi5wb3NpdGlvbnM6IFBvc2l0aW9uW10pOiBQb3NpdGlvbiB7XG5cdFx0aWYgKHBvc2l0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoKTtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdCA9IHBvc2l0aW9uc1swXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHBvc2l0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcCA9IHBvc2l0aW9uc1tpXTtcblx0XHRcdGlmIChwLmlzQmVmb3JlKHJlc3VsdCkpIHtcblx0XHRcdFx0cmVzdWx0ID0gcDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHN0YXRpYyBNYXgoLi4ucG9zaXRpb25zOiBQb3NpdGlvbltdKTogUG9zaXRpb24ge1xuXHRcdGlmIChwb3NpdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQgPSBwb3NpdGlvbnNbMF07XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBwb3NpdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHAgPSBwb3NpdGlvbnNbaV07XG5cdFx0XHRpZiAocC5pc0FmdGVyKHJlc3VsdCkpIHtcblx0XHRcdFx0cmVzdWx0ID0gcDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHN0YXRpYyBpc1Bvc2l0aW9uKG90aGVyOiB1bmtub3duKTogb3RoZXIgaXMgUG9zaXRpb24ge1xuXHRcdGlmICghb3RoZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKG90aGVyIGluc3RhbmNlb2YgUG9zaXRpb24pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCB7IGxpbmUsIGNoYXJhY3RlciB9ID0gPFBvc2l0aW9uPm90aGVyO1xuXHRcdGlmICh0eXBlb2YgbGluZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGNoYXJhY3RlciA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRzdGF0aWMgb2Yob2JqOiB2c2NvZGUuUG9zaXRpb24pOiBQb3NpdGlvbiB7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIFBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gb2JqO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pc1Bvc2l0aW9uKG9iaikpIHtcblx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24ob2JqLmxpbmUsIG9iai5jaGFyYWN0ZXIpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQsIGlzIE5PVCBhIHBvc2l0aW9uLWxpa2Ugb2JqZWN0Jyk7XG5cdH1cblxuXHRwcml2YXRlIF9saW5lOiBudW1iZXI7XG5cdHByaXZhdGUgX2NoYXJhY3RlcjogbnVtYmVyO1xuXG5cdGdldCBsaW5lKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmU7XG5cdH1cblxuXHRnZXQgY2hhcmFjdGVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXJhY3Rlcjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKGxpbmU6IG51bWJlciwgY2hhcmFjdGVyOiBudW1iZXIpIHtcblx0XHRpZiAobGluZSA8IDApIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnbGluZSBtdXN0IGJlIG5vbi1uZWdhdGl2ZScpO1xuXHRcdH1cblx0XHRpZiAoY2hhcmFjdGVyIDwgMCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdjaGFyYWN0ZXIgbXVzdCBiZSBub24tbmVnYXRpdmUnKTtcblx0XHR9XG5cdFx0dGhpcy5fbGluZSA9IGxpbmU7XG5cdFx0dGhpcy5fY2hhcmFjdGVyID0gY2hhcmFjdGVyO1xuXHR9XG5cblx0aXNCZWZvcmUob3RoZXI6IFBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2xpbmUgPCBvdGhlci5fbGluZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChvdGhlci5fbGluZSA8IHRoaXMuX2xpbmUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXJhY3RlciA8IG90aGVyLl9jaGFyYWN0ZXI7XG5cdH1cblxuXHRpc0JlZm9yZU9yRXF1YWwob3RoZXI6IFBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2xpbmUgPCBvdGhlci5fbGluZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChvdGhlci5fbGluZSA8IHRoaXMuX2xpbmUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXJhY3RlciA8PSBvdGhlci5fY2hhcmFjdGVyO1xuXHR9XG5cblx0aXNBZnRlcihvdGhlcjogUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuaXNCZWZvcmVPckVxdWFsKG90aGVyKTtcblx0fVxuXG5cdGlzQWZ0ZXJPckVxdWFsKG90aGVyOiBQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5pc0JlZm9yZShvdGhlcik7XG5cdH1cblxuXHRpc0VxdWFsKG90aGVyOiBQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9saW5lID09PSBvdGhlci5fbGluZSAmJiB0aGlzLl9jaGFyYWN0ZXIgPT09IG90aGVyLl9jaGFyYWN0ZXI7XG5cdH1cblxuXHRjb21wYXJlVG8ob3RoZXI6IFBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fbGluZSA8IG90aGVyLl9saW5lKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9saW5lID4gb3RoZXIubGluZSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVxdWFsIGxpbmVcblx0XHRcdGlmICh0aGlzLl9jaGFyYWN0ZXIgPCBvdGhlci5fY2hhcmFjdGVyKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fY2hhcmFjdGVyID4gb3RoZXIuX2NoYXJhY3Rlcikge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGVxdWFsIGxpbmUgYW5kIGNoYXJhY3RlclxuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0cmFuc2xhdGUoY2hhbmdlOiB7IGxpbmVEZWx0YT86IG51bWJlcjsgY2hhcmFjdGVyRGVsdGE/OiBudW1iZXIgfSk6IFBvc2l0aW9uO1xuXHR0cmFuc2xhdGUobGluZURlbHRhPzogbnVtYmVyLCBjaGFyYWN0ZXJEZWx0YT86IG51bWJlcik6IFBvc2l0aW9uO1xuXHR0cmFuc2xhdGUobGluZURlbHRhT3JDaGFuZ2U6IG51bWJlciB8IHVuZGVmaW5lZCB8IHsgbGluZURlbHRhPzogbnVtYmVyOyBjaGFyYWN0ZXJEZWx0YT86IG51bWJlciB9LCBjaGFyYWN0ZXJEZWx0YTogbnVtYmVyID0gMCk6IFBvc2l0aW9uIHtcblxuXHRcdGlmIChsaW5lRGVsdGFPckNoYW5nZSA9PT0gbnVsbCB8fCBjaGFyYWN0ZXJEZWx0YSA9PT0gbnVsbCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCk7XG5cdFx0fVxuXG5cdFx0bGV0IGxpbmVEZWx0YTogbnVtYmVyO1xuXHRcdGlmICh0eXBlb2YgbGluZURlbHRhT3JDaGFuZ2UgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRsaW5lRGVsdGEgPSAwO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGxpbmVEZWx0YU9yQ2hhbmdlID09PSAnbnVtYmVyJykge1xuXHRcdFx0bGluZURlbHRhID0gbGluZURlbHRhT3JDaGFuZ2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpbmVEZWx0YSA9IHR5cGVvZiBsaW5lRGVsdGFPckNoYW5nZS5saW5lRGVsdGEgPT09ICdudW1iZXInID8gbGluZURlbHRhT3JDaGFuZ2UubGluZURlbHRhIDogMDtcblx0XHRcdGNoYXJhY3RlckRlbHRhID0gdHlwZW9mIGxpbmVEZWx0YU9yQ2hhbmdlLmNoYXJhY3RlckRlbHRhID09PSAnbnVtYmVyJyA/IGxpbmVEZWx0YU9yQ2hhbmdlLmNoYXJhY3RlckRlbHRhIDogMDtcblx0XHR9XG5cblx0XHRpZiAobGluZURlbHRhID09PSAwICYmIGNoYXJhY3RlckRlbHRhID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbih0aGlzLmxpbmUgKyBsaW5lRGVsdGEsIHRoaXMuY2hhcmFjdGVyICsgY2hhcmFjdGVyRGVsdGEpO1xuXHR9XG5cblx0d2l0aChjaGFuZ2U6IHsgbGluZT86IG51bWJlcjsgY2hhcmFjdGVyPzogbnVtYmVyIH0pOiBQb3NpdGlvbjtcblx0d2l0aChsaW5lPzogbnVtYmVyLCBjaGFyYWN0ZXI/OiBudW1iZXIpOiBQb3NpdGlvbjtcblx0d2l0aChsaW5lT3JDaGFuZ2U6IG51bWJlciB8IHVuZGVmaW5lZCB8IHsgbGluZT86IG51bWJlcjsgY2hhcmFjdGVyPzogbnVtYmVyIH0sIGNoYXJhY3RlcjogbnVtYmVyID0gdGhpcy5jaGFyYWN0ZXIpOiBQb3NpdGlvbiB7XG5cblx0XHRpZiAobGluZU9yQ2hhbmdlID09PSBudWxsIHx8IGNoYXJhY3RlciA9PT0gbnVsbCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCk7XG5cdFx0fVxuXG5cdFx0bGV0IGxpbmU6IG51bWJlcjtcblx0XHRpZiAodHlwZW9mIGxpbmVPckNoYW5nZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGxpbmUgPSB0aGlzLmxpbmU7XG5cblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBsaW5lT3JDaGFuZ2UgPT09ICdudW1iZXInKSB7XG5cdFx0XHRsaW5lID0gbGluZU9yQ2hhbmdlO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpbmUgPSB0eXBlb2YgbGluZU9yQ2hhbmdlLmxpbmUgPT09ICdudW1iZXInID8gbGluZU9yQ2hhbmdlLmxpbmUgOiB0aGlzLmxpbmU7XG5cdFx0XHRjaGFyYWN0ZXIgPSB0eXBlb2YgbGluZU9yQ2hhbmdlLmNoYXJhY3RlciA9PT0gJ251bWJlcicgPyBsaW5lT3JDaGFuZ2UuY2hhcmFjdGVyIDogdGhpcy5jaGFyYWN0ZXI7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmUgPT09IHRoaXMubGluZSAmJiBjaGFyYWN0ZXIgPT09IHRoaXMuY2hhcmFjdGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lLCBjaGFyYWN0ZXIpO1xuXHR9XG5cblx0dG9KU09OKCk6IHsgbGluZTogbnVtYmVyOyBjaGFyYWN0ZXI6IG51bWJlciB9IHtcblx0XHRyZXR1cm4geyBsaW5lOiB0aGlzLmxpbmUsIGNoYXJhY3RlcjogdGhpcy5jaGFyYWN0ZXIgfTtcblx0fVxuXG5cdFtTeW1ib2wuZm9yKCdkZWJ1Zy5kZXNjcmlwdGlvbicpXSgpIHtcblx0XHRyZXR1cm4gYCgke3RoaXMubGluZX06JHt0aGlzLmNoYXJhY3Rlcn0pYDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQU1BLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBR3hCLElBQU0sV0FBTixNQUFlO0FBQUEsRUFFckIsT0FBTyxPQUFPLFdBQWlDO0FBQzlDLFFBQUksVUFBVSxXQUFXLEdBQUc7QUFDM0IsWUFBTSxJQUFJLFVBQVU7QUFBQSxJQUNyQjtBQUNBLFFBQUksU0FBUyxVQUFVLENBQUM7QUFDeEIsYUFBUyxJQUFJLEdBQUcsSUFBSSxVQUFVLFFBQVEsS0FBSztBQUMxQyxZQUFNLElBQUksVUFBVSxDQUFDO0FBQ3JCLFVBQUksRUFBRSxTQUFTLE1BQU0sR0FBRztBQUN2QixpQkFBUztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQU8sT0FBTyxXQUFpQztBQUM5QyxRQUFJLFVBQVUsV0FBVyxHQUFHO0FBQzNCLFlBQU0sSUFBSSxVQUFVO0FBQUEsSUFDckI7QUFDQSxRQUFJLFNBQVMsVUFBVSxDQUFDO0FBQ3hCLGFBQVMsSUFBSSxHQUFHLElBQUksVUFBVSxRQUFRLEtBQUs7QUFDMUMsWUFBTSxJQUFJLFVB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
