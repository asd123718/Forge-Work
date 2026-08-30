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
let Range = class {
  static isRange(thing) {
    if (thing instanceof Range) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return Position.isPosition(thing.start) && Position.isPosition(thing.end);
  }
  static of(obj) {
    if (obj instanceof Range) {
      return obj;
    }
    if (this.isRange(obj)) {
      return new Range(obj.start, obj.end);
    }
    throw new Error("Invalid argument, is NOT a range-like object");
  }
  get start() {
    return this._start;
  }
  get end() {
    return this._end;
  }
  constructor(startLineOrStart, startColumnOrEnd, endLine, endColumn) {
    let start;
    let end;
    if (typeof startLineOrStart === "number" && typeof startColumnOrEnd === "number" && typeof endLine === "number" && typeof endColumn === "number") {
      start = new Position(startLineOrStart, startColumnOrEnd);
      end = new Position(endLine, endColumn);
    } else if (Position.isPosition(startLineOrStart) && Position.isPosition(startColumnOrEnd)) {
      start = Position.of(startLineOrStart);
      end = Position.of(startColumnOrEnd);
    }
    if (!start || !end) {
      throw new Error("Invalid arguments");
    }
    if (start.isBefore(end)) {
      this._start = start;
      this._end = end;
    } else {
      this._start = end;
      this._end = start;
    }
  }
  contains(positionOrRange) {
    if (Range.isRange(positionOrRange)) {
      return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    } else if (Position.isPosition(positionOrRange)) {
      if (Position.of(positionOrRange).isBefore(this._start)) {
        return false;
      }
      if (this._end.isBefore(positionOrRange)) {
        return false;
      }
      return true;
    }
    return false;
  }
  isEqual(other) {
    return this._start.isEqual(other._start) && this._end.isEqual(other._end);
  }
  intersection(other) {
    const start = Position.Max(other.start, this._start);
    const end = Position.Min(other.end, this._end);
    if (start.isAfter(end)) {
      return void 0;
    }
    return new Range(start, end);
  }
  union(other) {
    if (this.contains(other)) {
      return this;
    } else if (other.contains(this)) {
      return other;
    }
    const start = Position.Min(other.start, this._start);
    const end = Position.Max(other.end, this.end);
    return new Range(start, end);
  }
  get isEmpty() {
    return this._start.isEqual(this._end);
  }
  get isSingleLine() {
    return this._start.line === this._end.line;
  }
  with(startOrChange, end = this.end) {
    if (startOrChange === null || end === null) {
      throw illegalArgument();
    }
    let start;
    if (!startOrChange) {
      start = this.start;
    } else if (Position.isPosition(startOrChange)) {
      start = startOrChange;
    } else {
      start = startOrChange.start || this.start;
      end = startOrChange.end || this.end;
    }
    if (start.isEqual(this._start) && end.isEqual(this.end)) {
      return this;
    }
    return new Range(start, end);
  }
  toJSON() {
    return [this.start, this.end];
  }
  [/* @__PURE__ */ Symbol.for("debug.description")]() {
    return getDebugDescriptionOfRange(this);
  }
};
Range = __decorateClass([
  es5ClassCompat
], Range);
function getDebugDescriptionOfRange(range) {
  return range.isEmpty ? `[${range.start.line}:${range.start.character})` : `[${range.start.line}:${range.start.character} -> ${range.end.line}:${range.end.character})`;
}
export {
  Range,
  getDebugDescriptionOfRange
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXHJhbmdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGlsbGVnYWxBcmd1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuL3Bvc2l0aW9uLmpzJztcblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgUmFuZ2Uge1xuXG5cdHN0YXRpYyBpc1JhbmdlKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgdnNjb2RlLlJhbmdlIHtcblx0XHRpZiAodGhpbmcgaW5zdGFuY2VvZiBSYW5nZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghdGhpbmcgfHwgdHlwZW9mIHRoaW5nICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUG9zaXRpb24uaXNQb3NpdGlvbigoPFJhbmdlPnRoaW5nKS5zdGFydClcblx0XHRcdCYmIFBvc2l0aW9uLmlzUG9zaXRpb24oKDxSYW5nZT50aGluZykuZW5kKTtcblx0fVxuXG5cdHN0YXRpYyBvZihvYmo6IHZzY29kZS5SYW5nZSk6IFJhbmdlIHtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgUmFuZ2UpIHtcblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzUmFuZ2Uob2JqKSkge1xuXHRcdFx0cmV0dXJuIG5ldyBSYW5nZShvYmouc3RhcnQsIG9iai5lbmQpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQsIGlzIE5PVCBhIHJhbmdlLWxpa2Ugb2JqZWN0Jyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3N0YXJ0OiBQb3NpdGlvbjtcblx0cHJvdGVjdGVkIF9lbmQ6IFBvc2l0aW9uO1xuXG5cdGdldCBzdGFydCgpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXJ0O1xuXHR9XG5cblx0Z2V0IGVuZCgpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0OiB2c2NvZGUuUG9zaXRpb24sIGVuZDogdnNjb2RlLlBvc2l0aW9uKTtcblx0Y29uc3RydWN0b3Ioc3RhcnQ6IFBvc2l0aW9uLCBlbmQ6IFBvc2l0aW9uKTtcblx0Y29uc3RydWN0b3Ioc3RhcnRMaW5lOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmU6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIpO1xuXHRjb25zdHJ1Y3RvcihzdGFydExpbmVPclN0YXJ0OiBudW1iZXIgfCBQb3NpdGlvbiB8IHZzY29kZS5Qb3NpdGlvbiwgc3RhcnRDb2x1bW5PckVuZDogbnVtYmVyIHwgUG9zaXRpb24gfCB2c2NvZGUuUG9zaXRpb24sIGVuZExpbmU/OiBudW1iZXIsIGVuZENvbHVtbj86IG51bWJlcikge1xuXHRcdGxldCBzdGFydDogUG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGVuZDogUG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAodHlwZW9mIHN0YXJ0TGluZU9yU3RhcnQgPT09ICdudW1iZXInICYmIHR5cGVvZiBzdGFydENvbHVtbk9yRW5kID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgZW5kTGluZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGVuZENvbHVtbiA9PT0gJ251bWJlcicpIHtcblx0XHRcdHN0YXJ0ID0gbmV3IFBvc2l0aW9uKHN0YXJ0TGluZU9yU3RhcnQsIHN0YXJ0Q29sdW1uT3JFbmQpO1xuXHRcdFx0ZW5kID0gbmV3IFBvc2l0aW9uKGVuZExpbmUsIGVuZENvbHVtbik7XG5cdFx0fSBlbHNlIGlmIChQb3NpdGlvbi5pc1Bvc2l0aW9uKHN0YXJ0TGluZU9yU3RhcnQpICYmIFBvc2l0aW9uLmlzUG9zaXRpb24oc3RhcnRDb2x1bW5PckVuZCkpIHtcblx0XHRcdHN0YXJ0ID0gUG9zaXRpb24ub2Yoc3RhcnRMaW5lT3JTdGFydCk7XG5cdFx0XHRlbmQgPSBQb3NpdGlvbi5vZihzdGFydENvbHVtbk9yRW5kKTtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXJ0IHx8ICFlbmQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHR9XG5cblx0XHRpZiAoc3RhcnQuaXNCZWZvcmUoZW5kKSkge1xuXHRcdFx0dGhpcy5fc3RhcnQgPSBzdGFydDtcblx0XHRcdHRoaXMuX2VuZCA9IGVuZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhcnQgPSBlbmQ7XG5cdFx0XHR0aGlzLl9lbmQgPSBzdGFydDtcblx0XHR9XG5cdH1cblxuXHRjb250YWlucyhwb3NpdGlvbk9yUmFuZ2U6IFBvc2l0aW9uIHwgUmFuZ2UpOiBib29sZWFuIHtcblx0XHRpZiAoUmFuZ2UuaXNSYW5nZShwb3NpdGlvbk9yUmFuZ2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb250YWlucyhwb3NpdGlvbk9yUmFuZ2Uuc3RhcnQpXG5cdFx0XHRcdCYmIHRoaXMuY29udGFpbnMocG9zaXRpb25PclJhbmdlLmVuZCk7XG5cblx0XHR9IGVsc2UgaWYgKFBvc2l0aW9uLmlzUG9zaXRpb24ocG9zaXRpb25PclJhbmdlKSkge1xuXHRcdFx0aWYgKFBvc2l0aW9uLm9mKHBvc2l0aW9uT3JSYW5nZSkuaXNCZWZvcmUodGhpcy5fc3RhcnQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9lbmQuaXNCZWZvcmUocG9zaXRpb25PclJhbmdlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aXNFcXVhbChvdGhlcjogUmFuZ2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnQuaXNFcXVhbChvdGhlci5fc3RhcnQpICYmIHRoaXMuX2VuZC5pc0VxdWFsKG90aGVyLl9lbmQpO1xuXHR9XG5cblx0aW50ZXJzZWN0aW9uKG90aGVyOiBSYW5nZSk6IFJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdGFydCA9IFBvc2l0aW9uLk1heChvdGhlci5zdGFydCwgdGhpcy5fc3RhcnQpO1xuXHRcdGNvbnN0IGVuZCA9IFBvc2l0aW9uLk1pbihvdGhlci5lbmQsIHRoaXMuX2VuZCk7XG5cdFx0aWYgKHN0YXJ0LmlzQWZ0ZXIoZW5kKSkge1xuXHRcdFx0Ly8gdGhpcyBoYXBwZW5zIHdoZW4gdGhlcmUgaXMgbm8gb3ZlcmxhcDpcblx0XHRcdC8vIHwtLS0tLXxcblx0XHRcdC8vICAgICAgICAgIHwtLS0tfFxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKTtcblx0fVxuXG5cdHVuaW9uKG90aGVyOiBSYW5nZSk6IFJhbmdlIHtcblx0XHRpZiAodGhpcy5jb250YWlucyhvdGhlcikpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0gZWxzZSBpZiAob3RoZXIuY29udGFpbnModGhpcykpIHtcblx0XHRcdHJldHVybiBvdGhlcjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnQgPSBQb3NpdGlvbi5NaW4ob3RoZXIuc3RhcnQsIHRoaXMuX3N0YXJ0KTtcblx0XHRjb25zdCBlbmQgPSBQb3NpdGlvbi5NYXgob3RoZXIuZW5kLCB0aGlzLmVuZCk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKTtcblx0fVxuXG5cdGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGFydC5pc0VxdWFsKHRoaXMuX2VuZCk7XG5cdH1cblxuXHRnZXQgaXNTaW5nbGVMaW5lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGFydC5saW5lID09PSB0aGlzLl9lbmQubGluZTtcblx0fVxuXG5cdHdpdGgoY2hhbmdlOiB7IHN0YXJ0PzogUG9zaXRpb247IGVuZD86IFBvc2l0aW9uIH0pOiBSYW5nZTtcblx0d2l0aChzdGFydD86IFBvc2l0aW9uLCBlbmQ/OiBQb3NpdGlvbik6IFJhbmdlO1xuXHR3aXRoKHN0YXJ0T3JDaGFuZ2U6IFBvc2l0aW9uIHwgdW5kZWZpbmVkIHwgeyBzdGFydD86IFBvc2l0aW9uOyBlbmQ/OiBQb3NpdGlvbiB9LCBlbmQ6IFBvc2l0aW9uID0gdGhpcy5lbmQpOiBSYW5nZSB7XG5cblx0XHRpZiAoc3RhcnRPckNoYW5nZSA9PT0gbnVsbCB8fCBlbmQgPT09IG51bGwpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgpO1xuXHRcdH1cblxuXHRcdGxldCBzdGFydDogUG9zaXRpb247XG5cdFx0aWYgKCFzdGFydE9yQ2hhbmdlKSB7XG5cdFx0XHRzdGFydCA9IHRoaXMuc3RhcnQ7XG5cblx0XHR9IGVsc2UgaWYgKFBvc2l0aW9uLmlzUG9zaXRpb24oc3RhcnRPckNoYW5nZSkpIHtcblx0XHRcdHN0YXJ0ID0gc3RhcnRPckNoYW5nZTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGFydCA9IHN0YXJ0T3JDaGFuZ2Uuc3RhcnQgfHwgdGhpcy5zdGFydDtcblx0XHRcdGVuZCA9IHN0YXJ0T3JDaGFuZ2UuZW5kIHx8IHRoaXMuZW5kO1xuXHRcdH1cblxuXHRcdGlmIChzdGFydC5pc0VxdWFsKHRoaXMuX3N0YXJ0KSAmJiBlbmQuaXNFcXVhbCh0aGlzLmVuZCkpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0LCBlbmQpO1xuXHR9XG5cblx0dG9KU09OKCk6IHVua25vd24ge1xuXHRcdHJldHVybiBbdGhpcy5zdGFydCwgdGhpcy5lbmRdO1xuXHR9XG5cblx0W1N5bWJvbC5mb3IoJ2RlYnVnLmRlc2NyaXB0aW9uJyldKCkge1xuXHRcdHJldHVybiBnZXREZWJ1Z0Rlc2NyaXB0aW9uT2ZSYW5nZSh0aGlzKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGVidWdEZXNjcmlwdGlvbk9mUmFuZ2UocmFuZ2U6IHZzY29kZS5SYW5nZSk6IHN0cmluZyB7XG5cdHJldHVybiByYW5nZS5pc0VtcHR5XG5cdFx0PyBgWyR7cmFuZ2Uuc3RhcnQubGluZX06JHtyYW5nZS5zdGFydC5jaGFyYWN0ZXJ9KWBcblx0XHQ6IGBbJHtyYW5nZS5zdGFydC5saW5lfToke3JhbmdlLnN0YXJ0LmNoYXJhY3Rlcn0gLT4gJHtyYW5nZS5lbmQubGluZX06JHtyYW5nZS5lbmQuY2hhcmFjdGVyfSlgO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQU1BLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBR2xCLElBQU0sUUFBTixNQUFZO0FBQUEsRUFFbEIsT0FBTyxRQUFRLE9BQXVDO0FB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
