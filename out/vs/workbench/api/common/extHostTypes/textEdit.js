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
import { Position } from "./position.js";
import { Range } from "./range.js";
var EndOfLine = /* @__PURE__ */ ((EndOfLine2) => {
  EndOfLine2[EndOfLine2["LF"] = 1] = "LF";
  EndOfLine2[EndOfLine2["CRLF"] = 2] = "CRLF";
  return EndOfLine2;
})(EndOfLine || {});
let TextEdit = class {
  static isTextEdit(thing) {
    if (thing instanceof TextEdit) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return Range.isRange(thing) && typeof thing.newText === "string";
  }
  static replace(range, newText) {
    return new TextEdit(range, newText);
  }
  static insert(position, newText) {
    return TextEdit.replace(new Range(position, position), newText);
  }
  static delete(range) {
    return TextEdit.replace(range, "");
  }
  static setEndOfLine(eol) {
    const ret = new TextEdit(new Range(new Position(0, 0), new Position(0, 0)), "");
    ret.newEol = eol;
    return ret;
  }
  get range() {
    return this._range;
  }
  set range(value) {
    if (value && !Range.isRange(value)) {
      throw illegalArgument("range");
    }
    this._range = value;
  }
  get newText() {
    return this._newText || "";
  }
  set newText(value) {
    if (value && typeof value !== "string") {
      throw illegalArgument("newText");
    }
    this._newText = value;
  }
  get newEol() {
    return this._newEol;
  }
  set newEol(value) {
    if (value && typeof value !== "number") {
      throw illegalArgument("newEol");
    }
    this._newEol = value;
  }
  constructor(range, newText) {
    this._range = range;
    this._newText = newText;
  }
  toJSON() {
    return {
      range: this.range,
      newText: this.newText,
      newEol: this._newEol
    };
  }
};
TextEdit = __decorateClass([
  es5ClassCompat
], TextEdit);
export {
  EndOfLine,
  TextEdit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXHRleHRFZGl0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaWxsZWdhbEFyZ3VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGVzNUNsYXNzQ29tcGF0IH0gZnJvbSAnLi9lczVDbGFzc0NvbXBhdC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4vcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuL3JhbmdlLmpzJztcblxuZXhwb3J0IGVudW0gRW5kT2ZMaW5lIHtcblx0TEYgPSAxLFxuXHRDUkxGID0gMlxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUZXh0RWRpdCB7XG5cblx0c3RhdGljIGlzVGV4dEVkaXQodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBUZXh0RWRpdCB7XG5cdFx0aWYgKHRoaW5nIGluc3RhbmNlb2YgVGV4dEVkaXQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaW5nIHx8IHR5cGVvZiB0aGluZyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIFJhbmdlLmlzUmFuZ2UoKDxUZXh0RWRpdD50aGluZykpXG5cdFx0XHQmJiB0eXBlb2YgKDxUZXh0RWRpdD50aGluZykubmV3VGV4dCA9PT0gJ3N0cmluZyc7XG5cdH1cblxuXHRzdGF0aWMgcmVwbGFjZShyYW5nZTogUmFuZ2UsIG5ld1RleHQ6IHN0cmluZyk6IFRleHRFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFRleHRFZGl0KHJhbmdlLCBuZXdUZXh0KTtcblx0fVxuXG5cdHN0YXRpYyBpbnNlcnQocG9zaXRpb246IFBvc2l0aW9uLCBuZXdUZXh0OiBzdHJpbmcpOiBUZXh0RWRpdCB7XG5cdFx0cmV0dXJuIFRleHRFZGl0LnJlcGxhY2UobmV3IFJhbmdlKHBvc2l0aW9uLCBwb3NpdGlvbiksIG5ld1RleHQpO1xuXHR9XG5cblx0c3RhdGljIGRlbGV0ZShyYW5nZTogUmFuZ2UpOiBUZXh0RWRpdCB7XG5cdFx0cmV0dXJuIFRleHRFZGl0LnJlcGxhY2UocmFuZ2UsICcnKTtcblx0fVxuXG5cdHN0YXRpYyBzZXRFbmRPZkxpbmUoZW9sOiBFbmRPZkxpbmUpOiBUZXh0RWRpdCB7XG5cdFx0Y29uc3QgcmV0ID0gbmV3IFRleHRFZGl0KG5ldyBSYW5nZShuZXcgUG9zaXRpb24oMCwgMCksIG5ldyBQb3NpdGlvbigwLCAwKSksICcnKTtcblx0XHRyZXQubmV3RW9sID0gZW9sO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JhbmdlOiBSYW5nZTtcblx0cHJvdGVjdGVkIF9uZXdUZXh0OiBzdHJpbmcgfCBudWxsO1xuXHRwcm90ZWN0ZWQgX25ld0VvbD86IEVuZE9mTGluZTtcblxuXHRnZXQgcmFuZ2UoKTogUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLl9yYW5nZTtcblx0fVxuXG5cdHNldCByYW5nZSh2YWx1ZTogUmFuZ2UpIHtcblx0XHRpZiAodmFsdWUgJiYgIVJhbmdlLmlzUmFuZ2UodmFsdWUpKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3JhbmdlJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3JhbmdlID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgbmV3VGV4dCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9uZXdUZXh0IHx8ICcnO1xuXHR9XG5cblx0c2V0IG5ld1RleHQodmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ25ld1RleHQnKTtcblx0XHR9XG5cdFx0dGhpcy5fbmV3VGV4dCA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IG5ld0VvbCgpOiBFbmRPZkxpbmUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9uZXdFb2w7XG5cdH1cblxuXHRzZXQgbmV3RW9sKHZhbHVlOiBFbmRPZkxpbmUgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCduZXdFb2wnKTtcblx0XHR9XG5cdFx0dGhpcy5fbmV3RW9sID0gdmFsdWU7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogUmFuZ2UsIG5ld1RleHQ6IHN0cmluZyB8IG51bGwpIHtcblx0XHR0aGlzLl9yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMuX25ld1RleHQgPSBuZXdUZXh0O1xuXHR9XG5cblx0dG9KU09OKCk6IHsgcmFuZ2U6IFJhbmdlOyBuZXdUZXh0OiBzdHJpbmc7IG5ld0VvbDogRW5kT2ZMaW5lIHwgdW5kZWZpbmVkIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogdGhpcy5yYW5nZSxcblx0XHRcdG5ld1RleHQ6IHRoaXMubmV3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
