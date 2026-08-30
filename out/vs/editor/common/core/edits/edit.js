import { sumBy } from "../../../../base/common/arrays.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { OffsetRange } from "../ranges/offsetRange.js";
class BaseEdit {
  constructor(replacements) {
    this.replacements = replacements;
    let lastEndEx = -1;
    for (const replacement of replacements) {
      if (!(replacement.replaceRange.start >= lastEndEx)) {
        throw new BugIndicatingError(`Edits must be disjoint and sorted. Found ${replacement} after ${lastEndEx}`);
      }
      lastEndEx = replacement.replaceRange.endExclusive;
    }
  }
  /**
   * Returns true if and only if this edit and the given edit are structurally equal.
   * Note that this does not mean that the edits have the same effect on a given input!
   * See `.normalize()` or `.normalizeOnBase(base)` for that.
  */
  equals(other) {
    if (this.replacements.length !== other.replacements.length) {
      return false;
    }
    for (let i = 0; i < this.replacements.length; i++) {
      if (!this.replacements[i].equals(other.replacements[i])) {
        return false;
      }
    }
    return true;
  }
  toString() {
    const edits = this.replacements.map((e) => e.toString()).join(", ");
    return `[${edits}]`;
  }
  /**
   * Normalizes the edit by removing empty replacements and joining touching replacements (if the replacements allow joining).
   * Two edits have an equal normalized edit if and only if they have the same effect on any input.
   *
   * ![](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vs/editor/common/core/edits/docs/BaseEdit_normalize.drawio.png)
   *
   * Invariant:
   * ```
   * (forall base: TEdit.apply(base).equals(other.apply(base))) <-> this.normalize().equals(other.normalize())
   * ```
   * and
   * ```
   * forall base: TEdit.apply(base).equals(this.normalize().apply(base))
   * ```
   *
   */
  normalize() {
    const newReplacements = [];
    let lastReplacement;
    for (const r of this.replacements) {
      if (r.getNewLength() === 0 && r.replaceRange.length === 0) {
        continue;
      }
      if (lastReplacement && lastReplacement.replaceRange.endExclusive === r.replaceRange.start) {
        const joined = lastReplacement.tryJoinTouching(r);
        if (joined) {
          lastReplacement = joined;
          continue;
        }
      }
      if (lastReplacement) {
        newReplacements.push(lastReplacement);
      }
      lastReplacement = r;
    }
    if (lastReplacement) {
      newReplacements.push(lastReplacement);
    }
    return this._createNew(newReplacements);
  }
  /**
   * Combines two edits into one with the same effect.
   *
   * ![](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vs/editor/common/core/edits/docs/BaseEdit_compose.drawio.png)
   *
   * Invariant:
   * ```
   * other.apply(this.apply(s0)) = this.compose(other).apply(s0)
   * ```
   */
  compose(other) {
    const edits1 = this.normalize();
    const edits2 = other.normalize();
    if (edits1.isEmpty()) {
      return edits2;
    }
    if (edits2.isEmpty()) {
      return edits1;
    }
    const edit1Queue = [...edits1.replacements];
    const result = [];
    let edit1ToEdit2 = 0;
    for (const r2 of edits2.replacements) {
      while (true) {
        const r1 = edit1Queue[0];
        if (!r1 || r1.replaceRange.start + edit1ToEdit2 + r1.getNewLength() >= r2.replaceRange.start) {
          break;
        }
        edit1Queue.shift();
        result.push(r1);
        edit1ToEdit2 += r1.getNewLength() - r1.replaceRange.length;
      }
      const firstEdit1ToEdit2 = edit1ToEdit2;
      let firstIntersecting;
      let lastIntersecting;
      while (true) {
        const r1 = edit1Queue[0];
        if (!r1 || r1.replaceRange.start + edit1ToEdit2 > r2.replaceRange.endExclusive) {
          break;
        }
        if (!firstIntersecting) {
          firstIntersecting = r1;
        }
        lastIntersecting = r1;
        edit1Queue.shift();
        edit1ToEdit2 += r1.getNewLength() - r1.replaceRange.length;
      }
      if (!firstIntersecting) {
        result.push(r2.delta(-edit1ToEdit2));
      } else {
        const newReplaceRangeStart = Math.min(firstIntersecting.replaceRange.start, r2.replaceRange.start - firstEdit1ToEdit2);
        const prefixLength = r2.replaceRange.start - (firstIntersecting.replaceRange.start + firstEdit1ToEdit2);
        if (prefixLength > 0) {
          const prefix = firstIntersecting.slice(OffsetRange.emptyAt(newReplaceRangeStart), new OffsetRange(0, prefixLength));
          result.push(prefix);
        }
        if (!lastIntersecting) {
          throw new BugIndicatingError(`Invariant violation: lastIntersecting is undefined`);
        }
        const suffixLength = lastIntersecting.replaceRange.endExclusive + edit1ToEdit2 - r2.replaceRange.endExclusive;
        if (suffixLength > 0) {
          const e = lastIntersecting.slice(
            OffsetRange.ofStartAndLength(lastIntersecting.replaceRange.endExclusive, 0),
            new OffsetRange(lastIntersecting.getNewLength() - suffixLength, lastIntersecting.getNewLength())
          );
          edit1Queue.unshift(e);
          edit1ToEdit2 -= e.getNewLength() - e.replaceRange.length;
        }
        const newReplaceRange = new OffsetRange(
          newReplaceRangeStart,
          r2.replaceRange.endExclusive - edit1ToEdit2
        );
        const middle = r2.slice(newReplaceRange, new OffsetRange(0, r2.getNewLength()));
        result.push(middle);
      }
    }
    while (true) {
      const item = edit1Queue.shift();
      if (!item) {
        break;
      }
      result.push(item);
    }
    return this._createNew(result).normalize();
  }
  decomposeSplit(shouldBeInE1) {
    const e1 = [];
    const e2 = [];
    let e2delta = 0;
    for (const edit of this.replacements) {
      if (shouldBeInE1(edit)) {
        e1.push(edit);
        e2delta += edit.getNewLength() - edit.replaceRange.length;
      } else {
        e2.push(edit.slice(edit.replaceRange.delta(e2delta), new OffsetRange(0, edit.getNewLength())));
      }
    }
    return { e1: this._createNew(e1), e2: this._createNew(e2) };
  }
  /**
   * Returns the range of each replacement in the applied value.
  */
  getNewRanges() {
    const ranges = [];
    let offset = 0;
    for (const e of this.replacements) {
      ranges.push(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.getNewLength()));
      offset += e.getLengthDelta();
    }
    return ranges;
  }
  getJoinedReplaceRange() {
    if (this.replacements.length === 0) {
      return void 0;
    }
    return this.replacements[0].replaceRange.join(this.replacements.at(-1).replaceRange);
  }
  isEmpty() {
    return this.replacements.length === 0;
  }
  getLengthDelta() {
    return sumBy(this.replacements, (replacement) => replacement.getLengthDelta());
  }
  getNewDataLength(dataLength) {
    return dataLength + this.getLengthDelta();
  }
  applyToOffset(originalOffset) {
    let accumulatedDelta = 0;
    for (const r of this.replacements) {
      if (r.replaceRange.start <= originalOffset) {
        if (originalOffset < r.replaceRange.endExclusive) {
          return r.replaceRange.start + accumulatedDelta;
        }
        accumulatedDelta += r.getNewLength() - r.replaceRange.length;
      } else {
        break;
      }
    }
    return originalOffset + accumulatedDelta;
  }
  applyToOffsetRange(originalRange) {
    return new OffsetRange(
      this.applyToOffset(originalRange.start),
      this.applyToOffset(originalRange.endExclusive)
    );
  }
  applyInverseToOffset(postEditsOffset) {
    let accumulatedDelta = 0;
    for (const edit of this.replacements) {
      const editLength = edit.getNewLength();
      if (edit.replaceRange.start <= postEditsOffset - accumulatedDelta) {
        if (postEditsOffset - accumulatedDelta < edit.replaceRange.start + editLength) {
          return edit.replaceRange.start;
        }
        accumulatedDelta += editLength - edit.replaceRange.length;
      } else {
        break;
      }
    }
    return postEditsOffset - accumulatedDelta;
  }
  /**
   * Return undefined if the originalOffset is within an edit
   */
  applyToOffsetOrUndefined(originalOffset) {
    let accumulatedDelta = 0;
    for (const edit of this.replacements) {
      if (edit.replaceRange.start <= originalOffset) {
        if (originalOffset < edit.replaceRange.endExclusive) {
          return void 0;
        }
        accumulatedDelta += edit.getNewLength() - edit.replaceRange.length;
      } else {
        break;
      }
    }
    return originalOffset + accumulatedDelta;
  }
  /**
   * Return undefined if the originalRange is within an edit
   */
  applyToOffsetRangeOrUndefined(originalRange) {
    const start = this.applyToOffsetOrUndefined(originalRange.start);
    if (start === void 0) {
      return void 0;
    }
    const end = this.applyToOffsetOrUndefined(originalRange.endExclusive);
    if (end === void 0) {
      return void 0;
    }
    return new OffsetRange(start, end);
  }
}
class BaseReplacement {
  constructor(replaceRange) {
    this.replaceRange = replaceRange;
  }
  delta(offset) {
    return this.slice(this.replaceRange.delta(offset), new OffsetRange(0, this.getNewLength()));
  }
  getLengthDelta() {
    return this.getNewLength() - this.replaceRange.length;
  }
  toString() {
    return `{ ${this.replaceRange.toString()} -> ${this.getNewLength()} }`;
  }
  get isEmpty() {
    return this.getNewLength() === 0 && this.replaceRange.length === 0;
  }
  getRangeAfterReplace() {
    return new OffsetRange(this.replaceRange.start, this.replaceRange.start + this.getNewLength());
  }
}
const _Edit = class _Edit extends BaseEdit {
  static create(replacements) {
    return new _Edit(replacements);
  }
  static single(replacement) {
    return new _Edit([replacement]);
  }
  _createNew(replacements) {
    return new _Edit(replacements);
  }
};
/**
 * Represents a set of edits to a string.
 * All these edits are applied at once.
*/
_Edit.empty = new _Edit([]);
let Edit = _Edit;
class AnnotationReplacement extends BaseReplacement {
  constructor(range, newLength, annotation) {
    super(range);
    this.newLength = newLength;
    this.annotation = annotation;
  }
  equals(other) {
    return this.replaceRange.equals(other.replaceRange) && this.newLength === other.newLength && this.annotation === other.annotation;
  }
  getNewLength() {
    return this.newLength;
  }
  tryJoinTouching(other) {
    if (this.annotation !== other.annotation) {
      return void 0;
    }
    return new AnnotationReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newLength + other.newLength, this.annotation);
  }
  slice(range, rangeInReplacement) {
    return new AnnotationReplacement(range, rangeInReplacement ? rangeInReplacement.length : this.newLength, this.annotation);
  }
}
export {
  AnnotationReplacement,
  BaseEdit,
  BaseReplacement,
  Edit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29yZVxcZWRpdHNcXGVkaXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzdW1CeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VFZGl0PFQgZXh0ZW5kcyBCYXNlUmVwbGFjZW1lbnQ8VD4gPSBCYXNlUmVwbGFjZW1lbnQ8YW55PiwgVEVkaXQgZXh0ZW5kcyBCYXNlRWRpdDxULCBURWRpdD4gPSBCYXNlRWRpdDxULCBhbnk+PiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZXBsYWNlbWVudHM6IHJlYWRvbmx5IFRbXSxcblx0KSB7XG5cdFx0bGV0IGxhc3RFbmRFeCA9IC0xO1xuXHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRpZiAoIShyZXBsYWNlbWVudC5yZXBsYWNlUmFuZ2Uuc3RhcnQgPj0gbGFzdEVuZEV4KSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKGBFZGl0cyBtdXN0IGJlIGRpc2pvaW50IGFuZCBzb3J0ZWQuIEZvdW5kICR7cmVwbGFjZW1lbnR9IGFmdGVyICR7bGFzdEVuZEV4fWApO1xuXHRcdFx0fVxuXHRcdFx0bGFzdEVuZEV4ID0gcmVwbGFjZW1lbnQucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2NyZWF0ZU5ldyhyZXBsYWNlbWVudHM6IHJlYWRvbmx5IFRbXSk6IFRFZGl0O1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgYW5kIG9ubHkgaWYgdGhpcyBlZGl0IGFuZCB0aGUgZ2l2ZW4gZWRpdCBhcmUgc3RydWN0dXJhbGx5IGVxdWFsLlxuXHQgKiBOb3RlIHRoYXQgdGhpcyBkb2VzIG5vdCBtZWFuIHRoYXQgdGhlIGVkaXRzIGhhdmUgdGhlIHNhbWUgZWZmZWN0IG9uIGEgZ2l2ZW4gaW5wdXQhXG5cdCAqIFNlZSBgLm5vcm1hbGl6ZSgpYCBvciBgLm5vcm1hbGl6ZU9uQmFzZShiYXNlKWAgZm9yIHRoYXQuXG5cdCovXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IFRFZGl0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aCAhPT0gb3RoZXIucmVwbGFjZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoIXRoaXMucmVwbGFjZW1lbnRzW2ldLmVxdWFscyhvdGhlci5yZXBsYWNlbWVudHNbaV0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKSB7XG5cdFx0Y29uc3QgZWRpdHMgPSB0aGlzLnJlcGxhY2VtZW50cy5tYXAoZSA9PiBlLnRvU3RyaW5nKCkpLmpvaW4oJywgJyk7XG5cdFx0cmV0dXJuIGBbJHtlZGl0c31dYDtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb3JtYWxpemVzIHRoZSBlZGl0IGJ5IHJlbW92aW5nIGVtcHR5IHJlcGxhY2VtZW50cyBhbmQgam9pbmluZyB0b3VjaGluZyByZXBsYWNlbWVudHMgKGlmIHRoZSByZXBsYWNlbWVudHMgYWxsb3cgam9pbmluZykuXG5cdCAqIFR3byBlZGl0cyBoYXZlIGFuIGVxdWFsIG5vcm1hbGl6ZWQgZWRpdCBpZiBhbmQgb25seSBpZiB0aGV5IGhhdmUgdGhlIHNhbWUgZWZmZWN0IG9uIGFueSBpbnB1dC5cblx0ICpcblx0ICogIVtdKGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9taWNyb3NvZnQvdnNjb2RlL3JlZnMvaGVhZHMvbWFpbi9zcmMvdnMvZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRzL2RvY3MvQmFzZUVkaXRfbm9ybWFsaXplLmRyYXdpby5wbmcpXG5cdCAqXG5cdCAqIEludmFyaWFudDpcblx0ICogYGBgXG5cdCAqIChmb3JhbGwgYmFzZTogVEVkaXQuYXBwbHkoYmFzZSkuZXF1YWxzKG90aGVyLmFwcGx5KGJhc2UpKSkgPC0+IHRoaXMubm9ybWFsaXplKCkuZXF1YWxzKG90aGVyLm5vcm1hbGl6ZSgpKVxuXHQgKiBgYGBcblx0ICogYW5kXG5cdCAqIGBgYFxuXHQgKiBmb3JhbGwgYmFzZTogVEVkaXQuYXBwbHkoYmFzZSkuZXF1YWxzKHRoaXMubm9ybWFsaXplKCkuYXBwbHkoYmFzZSkpXG5cdCAqIGBgYFxuXHQgKlxuXHQgKi9cblx0cHVibGljIG5vcm1hbGl6ZSgpOiBURWRpdCB7XG5cdFx0Y29uc3QgbmV3UmVwbGFjZW1lbnRzOiBUW10gPSBbXTtcblx0XHRsZXQgbGFzdFJlcGxhY2VtZW50OiBUIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgciBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0aWYgKHIuZ2V0TmV3TGVuZ3RoKCkgPT09IDAgJiYgci5yZXBsYWNlUmFuZ2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxhc3RSZXBsYWNlbWVudCAmJiBsYXN0UmVwbGFjZW1lbnQucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSA9PT0gci5yZXBsYWNlUmFuZ2Uuc3RhcnQpIHtcblx0XHRcdFx0Y29uc3Qgam9pbmVkID0gbGFzdFJlcGxhY2VtZW50LnRyeUpvaW5Ub3VjaGluZyhyKTtcblx0XHRcdFx0aWYgKGpvaW5lZCkge1xuXHRcdFx0XHRcdGxhc3RSZXBsYWNlbWVudCA9IGpvaW5lZDtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobGFzdFJlcGxhY2VtZW50KSB7XG5cdFx0XHRcdG5ld1JlcGxhY2VtZW50cy5wdXNoKGxhc3RSZXBsYWNlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRsYXN0UmVwbGFjZW1lbnQgPSByO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0UmVwbGFjZW1lbnQpIHtcblx0XHRcdG5ld1JlcGxhY2VtZW50cy5wdXNoKGxhc3RSZXBsYWNlbWVudCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVOZXcobmV3UmVwbGFjZW1lbnRzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21iaW5lcyB0d28gZWRpdHMgaW50byBvbmUgd2l0aCB0aGUgc2FtZSBlZmZlY3QuXG5cdCAqXG5cdCAqICFbXShodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vbWljcm9zb2Z0L3ZzY29kZS9yZWZzL2hlYWRzL21haW4vc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy9kb2NzL0Jhc2VFZGl0X2NvbXBvc2UuZHJhd2lvLnBuZylcblx0ICpcblx0ICogSW52YXJpYW50OlxuXHQgKiBgYGBcblx0ICogb3RoZXIuYXBwbHkodGhpcy5hcHBseShzMCkpID0gdGhpcy5jb21wb3NlKG90aGVyKS5hcHBseShzMClcblx0ICogYGBgXG5cdCAqL1xuXHRwdWJsaWMgY29tcG9zZShvdGhlcjogVEVkaXQpOiBURWRpdCB7XG5cdFx0Y29uc3QgZWRpdHMxID0gdGhpcy5ub3JtYWxpemUoKTtcblx0XHRjb25zdCBlZGl0czIgPSBvdGhlci5ub3JtYWxpemUoKTtcblxuXHRcdGlmIChlZGl0czEuaXNFbXB0eSgpKSB7IHJldHVybiBlZGl0czI7IH1cblx0XHRpZiAoZWRpdHMyLmlzRW1wdHkoKSkgeyByZXR1cm4gZWRpdHMxOyB9XG5cblx0XHRjb25zdCBlZGl0MVF1ZXVlID0gWy4uLmVkaXRzMS5yZXBsYWNlbWVudHNdO1xuXHRcdGNvbnN0IHJlc3VsdDogVFtdID0gW107XG5cblx0XHRsZXQgZWRpdDFUb0VkaXQyID0gMDtcblxuXHRcdGZvciAoY29uc3QgcjIgb2YgZWRpdHMyLnJlcGxhY2VtZW50cykge1xuXHRcdFx0Ly8gQ29weSBvdmVyIGVkaXQxIHVubW9kaWZpZWQgdW50aWwgaXQgdG91Y2hlcyBlZGl0Mi5cblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IHIxID0gZWRpdDFRdWV1ZVswXTtcblx0XHRcdFx0aWYgKCFyMSB8fCByMS5yZXBsYWNlUmFuZ2Uuc3RhcnQgKyBlZGl0MVRvRWRpdDIgKyByMS5nZXROZXdMZW5ndGgoKSA+PSByMi5yZXBsYWNlUmFuZ2Uuc3RhcnQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRlZGl0MVF1ZXVlLnNoaWZ0KCk7XG5cblx0XHRcdFx0cmVzdWx0LnB1c2gocjEpO1xuXHRcdFx0XHRlZGl0MVRvRWRpdDIgKz0gcjEuZ2V0TmV3TGVuZ3RoKCkgLSByMS5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaXJzdEVkaXQxVG9FZGl0MiA9IGVkaXQxVG9FZGl0Mjtcblx0XHRcdGxldCBmaXJzdEludGVyc2VjdGluZzogVCB8IHVuZGVmaW5lZDsgLy8gb3IgdG91Y2hpbmdcblx0XHRcdGxldCBsYXN0SW50ZXJzZWN0aW5nOiBUIHwgdW5kZWZpbmVkOyAvLyBvciB0b3VjaGluZ1xuXG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCByMSA9IGVkaXQxUXVldWVbMF07XG5cdFx0XHRcdGlmICghcjEgfHwgcjEucmVwbGFjZVJhbmdlLnN0YXJ0ICsgZWRpdDFUb0VkaXQyID4gcjIucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGVsc2Ugd2UgaW50ZXJzZWN0LCBiZWNhdXNlIHRoZSBuZXcgZW5kIG9mIGVkaXQxIGlzIGFmdGVyIG9yIGVxdWFsIHRvIG91ciBzdGFydFxuXG5cdFx0XHRcdGlmICghZmlyc3RJbnRlcnNlY3RpbmcpIHtcblx0XHRcdFx0XHRmaXJzdEludGVyc2VjdGluZyA9IHIxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RJbnRlcnNlY3RpbmcgPSByMTtcblx0XHRcdFx0ZWRpdDFRdWV1ZS5zaGlmdCgpO1xuXG5cdFx0XHRcdGVkaXQxVG9FZGl0MiArPSByMS5nZXROZXdMZW5ndGgoKSAtIHIxLnJlcGxhY2VSYW5nZS5sZW5ndGg7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZmlyc3RJbnRlcnNlY3RpbmcpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gocjIuZGVsdGEoLWVkaXQxVG9FZGl0MikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbmV3UmVwbGFjZVJhbmdlU3RhcnQgPSBNYXRoLm1pbihmaXJzdEludGVyc2VjdGluZy5yZXBsYWNlUmFuZ2Uuc3RhcnQsIHIyLnJlcGxhY2VSYW5nZS5zdGFydCAtIGZpcnN0RWRpdDFUb0VkaXQyKTtcblxuXHRcdFx0XHRjb25zdCBwcmVmaXhMZW5ndGggPSByMi5yZXBsYWNlUmFuZ2Uuc3RhcnQgLSAoZmlyc3RJbnRlcnNlY3RpbmcucmVwbGFjZVJhbmdlLnN0YXJ0ICsgZmlyc3RFZGl0MVRvRWRpdDIpO1xuXHRcdFx0XHRpZiAocHJlZml4TGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHByZWZpeCA9IGZpcnN0SW50ZXJzZWN0aW5nLnNsaWNlKE9mZnNldFJhbmdlLmVtcHR5QXQobmV3UmVwbGFjZVJhbmdlU3RhcnQpLCBuZXcgT2Zmc2V0UmFuZ2UoMCwgcHJlZml4TGVuZ3RoKSk7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gocHJlZml4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWxhc3RJbnRlcnNlY3RpbmcpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKGBJbnZhcmlhbnQgdmlvbGF0aW9uOiBsYXN0SW50ZXJzZWN0aW5nIGlzIHVuZGVmaW5lZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN1ZmZpeExlbmd0aCA9IChsYXN0SW50ZXJzZWN0aW5nLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUgKyBlZGl0MVRvRWRpdDIpIC0gcjIucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZTtcblx0XHRcdFx0aWYgKHN1ZmZpeExlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBlID0gbGFzdEludGVyc2VjdGluZy5zbGljZShcblx0XHRcdFx0XHRcdE9mZnNldFJhbmdlLm9mU3RhcnRBbmRMZW5ndGgobGFzdEludGVyc2VjdGluZy5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlLCAwKSxcblx0XHRcdFx0XHRcdG5ldyBPZmZzZXRSYW5nZShsYXN0SW50ZXJzZWN0aW5nLmdldE5ld0xlbmd0aCgpIC0gc3VmZml4TGVuZ3RoLCBsYXN0SW50ZXJzZWN0aW5nLmdldE5ld0xlbmd0aCgpKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0ZWRpdDFRdWV1ZS51bnNoaWZ0KGUpO1xuXHRcdFx0XHRcdGVkaXQxVG9FZGl0MiAtPSBlLmdldE5ld0xlbmd0aCgpIC0gZS5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmV3UmVwbGFjZVJhbmdlID0gbmV3IE9mZnNldFJhbmdlKFxuXHRcdFx0XHRcdG5ld1JlcGxhY2VSYW5nZVN0YXJ0LFxuXHRcdFx0XHRcdHIyLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUgLSBlZGl0MVRvRWRpdDJcblx0XHRcdFx0KTtcblx0XHRcdFx0Y29uc3QgbWlkZGxlID0gcjIuc2xpY2UobmV3UmVwbGFjZVJhbmdlLCBuZXcgT2Zmc2V0UmFuZ2UoMCwgcjIuZ2V0TmV3TGVuZ3RoKCkpKTtcblx0XHRcdFx0cmVzdWx0LnB1c2gobWlkZGxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGVkaXQxUXVldWUuc2hpZnQoKTtcblx0XHRcdGlmICghaXRlbSkgeyBicmVhazsgfVxuXHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZU5ldyhyZXN1bHQpLm5vcm1hbGl6ZSgpO1xuXHR9XG5cblx0cHVibGljIGRlY29tcG9zZVNwbGl0KHNob3VsZEJlSW5FMTogKHJlcGw6IFQpID0+IGJvb2xlYW4pOiB7IGUxOiBURWRpdDsgZTI6IFRFZGl0IH0ge1xuXHRcdGNvbnN0IGUxOiBUW10gPSBbXTtcblx0XHRjb25zdCBlMjogVFtdID0gW107XG5cblx0XHRsZXQgZTJkZWx0YSA9IDA7XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRpZiAoc2hvdWxkQmVJbkUxKGVkaXQpKSB7XG5cdFx0XHRcdGUxLnB1c2goZWRpdCk7XG5cdFx0XHRcdGUyZGVsdGEgKz0gZWRpdC5nZXROZXdMZW5ndGgoKSAtIGVkaXQucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGUyLnB1c2goZWRpdC5zbGljZShlZGl0LnJlcGxhY2VSYW5nZS5kZWx0YShlMmRlbHRhKSwgbmV3IE9mZnNldFJhbmdlKDAsIGVkaXQuZ2V0TmV3TGVuZ3RoKCkpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGUxOiB0aGlzLl9jcmVhdGVOZXcoZTEpLCBlMjogdGhpcy5fY3JlYXRlTmV3KGUyKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHJhbmdlIG9mIGVhY2ggcmVwbGFjZW1lbnQgaW4gdGhlIGFwcGxpZWQgdmFsdWUuXG5cdCovXG5cdHB1YmxpYyBnZXROZXdSYW5nZXMoKTogT2Zmc2V0UmFuZ2VbXSB7XG5cdFx0Y29uc3QgcmFuZ2VzOiBPZmZzZXRSYW5nZVtdID0gW107XG5cdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRyYW5nZXMucHVzaChPZmZzZXRSYW5nZS5vZlN0YXJ0QW5kTGVuZ3RoKGUucmVwbGFjZVJhbmdlLnN0YXJ0ICsgb2Zmc2V0LCBlLmdldE5ld0xlbmd0aCgpKSk7XG5cdFx0XHRvZmZzZXQgKz0gZS5nZXRMZW5ndGhEZWx0YSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmFuZ2VzO1xuXHR9XG5cblx0cHVibGljIGdldEpvaW5lZFJlcGxhY2VSYW5nZSgpOiBPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMucmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZW1lbnRzWzBdLnJlcGxhY2VSYW5nZS5qb2luKHRoaXMucmVwbGFjZW1lbnRzLmF0KC0xKSEucmVwbGFjZVJhbmdlKTtcblx0fVxuXG5cdHB1YmxpYyBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGVuZ3RoRGVsdGEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gc3VtQnkodGhpcy5yZXBsYWNlbWVudHMsIChyZXBsYWNlbWVudCkgPT4gcmVwbGFjZW1lbnQuZ2V0TGVuZ3RoRGVsdGEoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TmV3RGF0YUxlbmd0aChkYXRhTGVuZ3RoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBkYXRhTGVuZ3RoICsgdGhpcy5nZXRMZW5ndGhEZWx0YSgpO1xuXHR9XG5cblx0cHVibGljIGFwcGx5VG9PZmZzZXQob3JpZ2luYWxPZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGFjY3VtdWxhdGVkRGVsdGEgPSAwO1xuXHRcdGZvciAoY29uc3QgciBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0aWYgKHIucmVwbGFjZVJhbmdlLnN0YXJ0IDw9IG9yaWdpbmFsT2Zmc2V0KSB7XG5cdFx0XHRcdGlmIChvcmlnaW5hbE9mZnNldCA8IHIucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRcdC8vIHRoZSBvZmZzZXQgaXMgaW4gdGhlIHJlcGxhY2VkIHJhbmdlXG5cdFx0XHRcdFx0cmV0dXJuIHIucmVwbGFjZVJhbmdlLnN0YXJ0ICsgYWNjdW11bGF0ZWREZWx0YTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhY2N1bXVsYXRlZERlbHRhICs9IHIuZ2V0TmV3TGVuZ3RoKCkgLSByLnJlcGxhY2VSYW5nZS5sZW5ndGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG9yaWdpbmFsT2Zmc2V0ICsgYWNjdW11bGF0ZWREZWx0YTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseVRvT2Zmc2V0UmFuZ2Uob3JpZ2luYWxSYW5nZTogT2Zmc2V0UmFuZ2UpOiBPZmZzZXRSYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyBPZmZzZXRSYW5nZShcblx0XHRcdHRoaXMuYXBwbHlUb09mZnNldChvcmlnaW5hbFJhbmdlLnN0YXJ0KSxcblx0XHRcdHRoaXMuYXBwbHlUb09mZnNldChvcmlnaW5hbFJhbmdlLmVuZEV4Y2x1c2l2ZSlcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGFwcGx5SW52ZXJzZVRvT2Zmc2V0KHBvc3RFZGl0c09mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgYWNjdW11bGF0ZWREZWx0YSA9IDA7XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBlZGl0TGVuZ3RoID0gZWRpdC5nZXROZXdMZW5ndGgoKTtcblx0XHRcdGlmIChlZGl0LnJlcGxhY2VSYW5nZS5zdGFydCA8PSBwb3N0RWRpdHNPZmZzZXQgLSBhY2N1bXVsYXRlZERlbHRhKSB7XG5cdFx0XHRcdGlmIChwb3N0RWRpdHNPZmZzZXQgLSBhY2N1bXVsYXRlZERlbHRhIDwgZWRpdC5yZXBsYWNlUmFuZ2Uuc3RhcnQgKyBlZGl0TGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gdGhlIG9mZnNldCBpcyBpbiB0aGUgcmVwbGFjZWQgcmFuZ2Vcblx0XHRcdFx0XHRyZXR1cm4gZWRpdC5yZXBsYWNlUmFuZ2Uuc3RhcnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWNjdW11bGF0ZWREZWx0YSArPSBlZGl0TGVuZ3RoIC0gZWRpdC5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBwb3N0RWRpdHNPZmZzZXQgLSBhY2N1bXVsYXRlZERlbHRhO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB1bmRlZmluZWQgaWYgdGhlIG9yaWdpbmFsT2Zmc2V0IGlzIHdpdGhpbiBhbiBlZGl0XG5cdCAqL1xuXHRwdWJsaWMgYXBwbHlUb09mZnNldE9yVW5kZWZpbmVkKG9yaWdpbmFsT2Zmc2V0OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGxldCBhY2N1bXVsYXRlZERlbHRhID0gMDtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGlmIChlZGl0LnJlcGxhY2VSYW5nZS5zdGFydCA8PSBvcmlnaW5hbE9mZnNldCkge1xuXHRcdFx0XHRpZiAob3JpZ2luYWxPZmZzZXQgPCBlZGl0LnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdFx0XHQvLyB0aGUgb2Zmc2V0IGlzIGluIHRoZSByZXBsYWNlZCByYW5nZVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWNjdW11bGF0ZWREZWx0YSArPSBlZGl0LmdldE5ld0xlbmd0aCgpIC0gZWRpdC5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvcmlnaW5hbE9mZnNldCArIGFjY3VtdWxhdGVkRGVsdGE7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHVuZGVmaW5lZCBpZiB0aGUgb3JpZ2luYWxSYW5nZSBpcyB3aXRoaW4gYW4gZWRpdFxuXHQgKi9cblx0cHVibGljIGFwcGx5VG9PZmZzZXRSYW5nZU9yVW5kZWZpbmVkKG9yaWdpbmFsUmFuZ2U6IE9mZnNldFJhbmdlKTogT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0YXJ0ID0gdGhpcy5hcHBseVRvT2Zmc2V0T3JVbmRlZmluZWQob3JpZ2luYWxSYW5nZS5zdGFydCk7XG5cdFx0aWYgKHN0YXJ0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGVuZCA9IHRoaXMuYXBwbHlUb09mZnNldE9yVW5kZWZpbmVkKG9yaWdpbmFsUmFuZ2UuZW5kRXhjbHVzaXZlKTtcblx0XHRpZiAoZW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnQsIGVuZCk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VSZXBsYWNlbWVudDxUU2VsZiBleHRlbmRzIEJhc2VSZXBsYWNlbWVudDxUU2VsZj4+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0LyoqXG5cdFx0ICogVGhlIHJhbmdlIHRvIGJlIHJlcGxhY2VkLlxuXHRcdCovXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcGxhY2VSYW5nZTogT2Zmc2V0UmFuZ2UsXG5cdCkgeyB9XG5cblx0cHVibGljIGFic3RyYWN0IGdldE5ld0xlbmd0aCgpOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFByZWNvbmRpdGlvbjogVEVkaXQucmFuZ2UuZW5kRXhjbHVzaXZlID09PSBvdGhlci5yYW5nZS5zdGFydFxuXHQqL1xuXHRwdWJsaWMgYWJzdHJhY3QgdHJ5Sm9pblRvdWNoaW5nKG90aGVyOiBUU2VsZik6IFRTZWxmIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBhYnN0cmFjdCBzbGljZShuZXdSZXBsYWNlUmFuZ2U6IE9mZnNldFJhbmdlLCByYW5nZUluUmVwbGFjZW1lbnQ/OiBPZmZzZXRSYW5nZSk6IFRTZWxmO1xuXG5cdHB1YmxpYyBkZWx0YShvZmZzZXQ6IG51bWJlcik6IFRTZWxmIHtcblx0XHRyZXR1cm4gdGhpcy5zbGljZSh0aGlzLnJlcGxhY2VSYW5nZS5kZWx0YShvZmZzZXQpLCBuZXcgT2Zmc2V0UmFuZ2UoMCwgdGhpcy5nZXROZXdMZW5ndGgoKSkpO1xuXHR9XG5cblx0cHVibGljIGdldExlbmd0aERlbHRhKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TmV3TGVuZ3RoKCkgLSB0aGlzLnJlcGxhY2VSYW5nZS5sZW5ndGg7XG5cdH1cblxuXHRhYnN0cmFjdCBlcXVhbHMob3RoZXI6IFRTZWxmKTogYm9vbGVhbjtcblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgeyAke3RoaXMucmVwbGFjZVJhbmdlLnRvU3RyaW5nKCl9IC0+ICR7dGhpcy5nZXROZXdMZW5ndGgoKX0gfWA7XG5cdH1cblxuXHRnZXQgaXNFbXB0eSgpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXROZXdMZW5ndGgoKSA9PT0gMCAmJiB0aGlzLnJlcGxhY2VSYW5nZS5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRnZXRSYW5nZUFmdGVyUmVwbGFjZSgpOiBPZmZzZXRSYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyBPZmZzZXRSYW5nZSh0aGlzLnJlcGxhY2VSYW5nZS5zdGFydCwgdGhpcy5yZXBsYWNlUmFuZ2Uuc3RhcnQgKyB0aGlzLmdldE5ld0xlbmd0aCgpKTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBBbnlFZGl0ID0gQmFzZUVkaXQ8QW55UmVwbGFjZW1lbnQsIEFueUVkaXQ+O1xuZXhwb3J0IHR5cGUgQW55UmVwbGFjZW1lbnQgPSBCYXNlUmVwbGFjZW1lbnQ8QW55UmVwbGFjZW1lbnQ+O1xuXG5leHBvcnQgY2xhc3MgRWRpdDxUIGV4dGVuZHMgQmFzZVJlcGxhY2VtZW50PFQ+PiBleHRlbmRzIEJhc2VFZGl0PFQsIEVkaXQ8VD4+IHtcblx0LyoqXG5cdCAqIFJlcHJlc2VudHMgYSBzZXQgb2YgZWRpdHMgdG8gYSBzdHJpbmcuXG5cdCAqIEFsbCB0aGVzZSBlZGl0cyBhcmUgYXBwbGllZCBhdCBvbmNlLlxuXHQqL1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGVtcHR5ID0gbmV3IEVkaXQ8bmV2ZXI+KFtdKTtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZTxUIGV4dGVuZHMgQmFzZVJlcGxhY2VtZW50PFQ+PihyZXBsYWNlbWVudHM6IHJlYWRvbmx5IFRbXSk6IEVkaXQ8VD4ge1xuXHRcdHJldHVybiBuZXcgRWRpdChyZXBsYWNlbWVudHMpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzaW5nbGU8VCBleHRlbmRzIEJhc2VSZXBsYWNlbWVudDxUPj4ocmVwbGFjZW1lbnQ6IFQpOiBFZGl0PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEVkaXQoW3JlcGxhY2VtZW50XSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2NyZWF0ZU5ldyhyZXBsYWNlbWVudHM6IHJlYWRvbmx5IFRbXSk6IEVkaXQ8VD4ge1xuXHRcdHJldHVybiBuZXcgRWRpdChyZXBsYWNlbWVudHMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBbm5vdGF0aW9uUmVwbGFjZW1lbnQ8VEFubm90YXRpb24+IGV4dGVuZHMgQmFzZVJlcGxhY2VtZW50PEFubm90YXRpb25SZXBsYWNlbWVudDxUQW5ub3RhdGlvbj4+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmFuZ2U6IE9mZnNldFJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBuZXdMZW5ndGg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgYW5ub3RhdGlvbjogVEFubm90YXRpb24sXG5cdCkge1xuXHRcdHN1cGVyKHJhbmdlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGVxdWFscyhvdGhlcjogQW5ub3RhdGlvblJlcGxhY2VtZW50PFRBbm5vdGF0aW9uPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VSYW5nZS5lcXVhbHMob3RoZXIucmVwbGFjZVJhbmdlKSAmJiB0aGlzLm5ld0xlbmd0aCA9PT0gb3RoZXIubmV3TGVuZ3RoICYmIHRoaXMuYW5ub3RhdGlvbiA9PT0gb3RoZXIuYW5ub3RhdGlvbjtcblx0fVxuXG5cdGdldE5ld0xlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5uZXdMZW5ndGg7IH1cblxuXHR0cnlKb2luVG91Y2hpbmcob3RoZXI6IEFubm90YXRpb25SZXBsYWNlbWVudDxUQW5ub3RhdGlvbj4pOiBBbm5vdGF0aW9uUmVwbGFjZW1lbnQ8VEFubm90YXRpb24+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5hbm5vdGF0aW9uICE9PSBvdGhlci5hbm5vdGF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEFubm90YXRpb25SZXBsYWNlbWVudDxUQW5ub3RhdGlvbj4odGhpcy5yZXBsYWNlUmFuZ2Uuam9pblJpZ2h0VG91Y2hpbmcob3RoZXIucmVwbGFjZVJhbmdlKSwgdGhpcy5uZXdMZW5ndGggKyBvdGhlci5uZXdMZW5ndGgsIHRoaXMuYW5ub3RhdGlvbik7XG5cdH1cblxuXHRzbGljZShyYW5nZTogT2Zmc2V0UmFuZ2UsIHJhbmdlSW5SZXBsYWNlbWVudD86IE9mZnNldFJhbmdlKTogQW5ub3RhdGlvblJlcGxhY2VtZW50PFRBbm5vdGF0aW9uPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0aW9uUmVwbGFjZW1lbnQ8VEFubm90YXRpb24+KHJhbmdlLCByYW5nZUluUmVwbGFjZW1lbnQgPyByYW5nZUluUmVwbGFjZW1lbnQubGVuZ3RoIDogdGhpcy5uZXdMZW5ndGgsIHRoaXMuYW5ub3RhdGlvbik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUdyQixNQUFlLFNBQW1IO0FBQUEsRUFDeEksWUFDaUIsY0FDZjtBQURlO0FBRWhCLFFBQUksWUFBWTtBQUNoQixlQUFXLGVBQWUsY0FBYztBQUN2QyxVQUFJLEVBQUUsWUFBWSxhQUFhLFNBQVMsWUFBWTtBQUNuRCxjQUFNLElBQUksbUJBQW1CLDRDQUE0QyxXQUFXLFVBQVUsU0FBUyxFQUFFO0FBQUEsTUFDMUc7QUFDQSxrQkFBWSxZQUFZLGFBQWE7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTTyxPQUFPLE9BQXVCO0FBQ3BDLFFBQUksS0FBSyxhQUFhLFdBQVcsTUFBTSxhQUFhLFFBQVE7QUFDM0QsYUFBTztBQUFBLElBQ1I7QUFDQSxhQUFTLElBQUksR0FBRyxJQUFJ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
