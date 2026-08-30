import { Range } from "../../../common/range.js";
function groupIntersect(range, groups) {
  const result = [];
  for (const r of groups) {
    if (range.start >= r.range.end) {
      continue;
    }
    if (range.end < r.range.start) {
      break;
    }
    const intersection = Range.intersect(range, r.range);
    if (Range.isEmpty(intersection)) {
      continue;
    }
    result.push({
      range: intersection,
      size: r.size
    });
  }
  return result;
}
function shift({ start, end }, much) {
  return { start: start + much, end: end + much };
}
function consolidate(groups) {
  const result = [];
  let previousGroup = null;
  for (const group of groups) {
    const start = group.range.start;
    const end = group.range.end;
    const size = group.size;
    if (previousGroup && size === previousGroup.size) {
      previousGroup.range.end = end;
      continue;
    }
    previousGroup = { range: { start, end }, size };
    result.push(previousGroup);
  }
  return result;
}
function concat(...groups) {
  return consolidate(groups.reduce((r, g) => r.concat(g), []));
}
class RangeMap {
  constructor(topPadding) {
    this.groups = [];
    this._size = 0;
    this._paddingTop = 0;
    this._paddingTop = topPadding ?? 0;
    this._size = this._paddingTop;
  }
  get paddingTop() {
    return this._paddingTop;
  }
  set paddingTop(paddingTop) {
    this._size = this._size + paddingTop - this._paddingTop;
    this._paddingTop = paddingTop;
  }
  splice(index, deleteCount, items = []) {
    const diff = items.length - deleteCount;
    const before = groupIntersect({ start: 0, end: index }, this.groups);
    const after = groupIntersect({ start: index + deleteCount, end: Number.POSITIVE_INFINITY }, this.groups).map((g) => ({ range: shift(g.range, diff), size: g.size }));
    const middle = items.map((item, i) => ({
      range: { start: index + i, end: index + i + 1 },
      size: item.size
    }));
    this.groups = concat(before, middle, after);
    this._size = this._paddingTop + this.groups.reduce((t, g) => t + g.size * (g.range.end - g.range.start), 0);
  }
  /**
   * Returns the number of items in the range map.
   */
  get count() {
    const len = this.groups.length;
    if (!len) {
      return 0;
    }
    return this.groups[len - 1].range.end;
  }
  /**
   * Returns the sum of the sizes of all items in the range map.
   */
  get size() {
    return this._size;
  }
  /**
   * Returns the index of the item at the given position.
   */
  indexAt(position) {
    if (position < 0) {
      return -1;
    }
    if (position < this._paddingTop) {
      return 0;
    }
    let index = 0;
    let size = this._paddingTop;
    for (const group of this.groups) {
      const count = group.range.end - group.range.start;
      const newSize = size + count * group.size;
      if (position < newSize) {
        return index + Math.floor((position - size) / group.size);
      }
      index += count;
      size = newSize;
    }
    return index;
  }
  /**
   * Returns the index of the item right after the item at the
   * index of the given position.
   */
  indexAfter(position) {
    return Math.min(this.indexAt(position) + 1, this.count);
  }
  /**
   * Returns the start position of the item at the given index.
   */
  positionAt(index) {
    if (index < 0) {
      return -1;
    }
    let position = 0;
    let count = 0;
    for (const group of this.groups) {
      const groupCount = group.range.end - group.range.start;
      const newCount = count + groupCount;
      if (index < newCount) {
        return this._paddingTop + position + (index - count) * group.size;
      }
      position += groupCount * group.size;
      count = newCount;
    }
    return -1;
  }
}
export {
  RangeMap,
  consolidate,
  groupIntersect,
  shift
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcbGlzdFxccmFuZ2VNYXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3JhbmdlLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJSXRlbSB7XG5cdHNpemU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmFuZ2VkR3JvdXAge1xuXHRyYW5nZTogSVJhbmdlO1xuXHRzaXplOiBudW1iZXI7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW50ZXJzZWN0aW9uIGJldHdlZW4gYSByYW5nZWQgZ3JvdXAgYW5kIGEgcmFuZ2UuXG4gKiBSZXR1cm5zIGBbXWAgaWYgdGhlIGludGVyc2VjdGlvbiBpcyBlbXB0eS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdyb3VwSW50ZXJzZWN0KHJhbmdlOiBJUmFuZ2UsIGdyb3VwczogSVJhbmdlZEdyb3VwW10pOiBJUmFuZ2VkR3JvdXBbXSB7XG5cdGNvbnN0IHJlc3VsdDogSVJhbmdlZEdyb3VwW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IHIgb2YgZ3JvdXBzKSB7XG5cdFx0aWYgKHJhbmdlLnN0YXJ0ID49IHIucmFuZ2UuZW5kKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAocmFuZ2UuZW5kIDwgci5yYW5nZS5zdGFydCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW50ZXJzZWN0aW9uID0gUmFuZ2UuaW50ZXJzZWN0KHJhbmdlLCByLnJhbmdlKTtcblxuXHRcdGlmIChSYW5nZS5pc0VtcHR5KGludGVyc2VjdGlvbikpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdHJhbmdlOiBpbnRlcnNlY3Rpb24sXG5cdFx0XHRzaXplOiByLnNpemVcblx0XHR9KTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogU2hpZnRzIGEgcmFuZ2UgYnkgdGhhdCBgbXVjaGAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzaGlmdCh7IHN0YXJ0LCBlbmQgfTogSVJhbmdlLCBtdWNoOiBudW1iZXIpOiBJUmFuZ2Uge1xuXHRyZXR1cm4geyBzdGFydDogc3RhcnQgKyBtdWNoLCBlbmQ6IGVuZCArIG11Y2ggfTtcbn1cblxuLyoqXG4gKiBDb25zb2xpZGF0ZXMgYSBjb2xsZWN0aW9uIG9mIHJhbmdlZCBncm91cHMuXG4gKlxuICogQ29uc29saWRhdGlvbiBpcyB0aGUgcHJvY2VzcyBvZiBtZXJnaW5nIGNvbnNlY3V0aXZlIHJhbmdlZCBncm91cHNcbiAqIHRoYXQgc2hhcmUgdGhlIHNhbWUgYHNpemVgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29uc29saWRhdGUoZ3JvdXBzOiBJUmFuZ2VkR3JvdXBbXSk6IElSYW5nZWRHcm91cFtdIHtcblx0Y29uc3QgcmVzdWx0OiBJUmFuZ2VkR3JvdXBbXSA9IFtdO1xuXHRsZXQgcHJldmlvdXNHcm91cDogSVJhbmdlZEdyb3VwIHwgbnVsbCA9IG51bGw7XG5cblx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRjb25zdCBzdGFydCA9IGdyb3VwLnJhbmdlLnN0YXJ0O1xuXHRcdGNvbnN0IGVuZCA9IGdyb3VwLnJhbmdlLmVuZDtcblx0XHRjb25zdCBzaXplID0gZ3JvdXAuc2l6ZTtcblxuXHRcdGlmIChwcmV2aW91c0dyb3VwICYmIHNpemUgPT09IHByZXZpb3VzR3JvdXAuc2l6ZSkge1xuXHRcdFx0cHJldmlvdXNHcm91cC5yYW5nZS5lbmQgPSBlbmQ7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRwcmV2aW91c0dyb3VwID0geyByYW5nZTogeyBzdGFydCwgZW5kIH0sIHNpemUgfTtcblx0XHRyZXN1bHQucHVzaChwcmV2aW91c0dyb3VwKTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ29uY2F0ZW5hdGVzIHNldmVyYWwgY29sbGVjdGlvbnMgb2YgcmFuZ2VkIGdyb3VwcyBpbnRvIGEgc2luZ2xlXG4gKiBjb2xsZWN0aW9uLlxuICovXG5mdW5jdGlvbiBjb25jYXQoLi4uZ3JvdXBzOiBJUmFuZ2VkR3JvdXBbXVtdKTogSVJhbmdlZEdyb3VwW10ge1xuXHRyZXR1cm4gY29uc29saWRhdGUoZ3JvdXBzLnJlZHVjZSgociwgZykgPT4gci5jb25jYXQoZyksIFtdKSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhbmdlTWFwIHtcblx0cmVhZG9ubHkgc2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xuXHRwYWRkaW5nVG9wOiBudW1iZXI7XG5cdHNwbGljZShpbmRleDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBpdGVtcz86IElJdGVtW10pOiB2b2lkO1xuXHRpbmRleEF0KHBvc2l0aW9uOiBudW1iZXIpOiBudW1iZXI7XG5cdGluZGV4QWZ0ZXIocG9zaXRpb246IG51bWJlcik6IG51bWJlcjtcblx0cG9zaXRpb25BdChpbmRleDogbnVtYmVyKTogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgUmFuZ2VNYXAgaW1wbGVtZW50cyBJUmFuZ2VNYXAge1xuXG5cdHByaXZhdGUgZ3JvdXBzOiBJUmFuZ2VkR3JvdXBbXSA9IFtdO1xuXHRwcml2YXRlIF9zaXplID0gMDtcblx0cHJpdmF0ZSBfcGFkZGluZ1RvcCA9IDA7XG5cblx0Z2V0IHBhZGRpbmdUb3AoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BhZGRpbmdUb3A7XG5cdH1cblxuXHRzZXQgcGFkZGluZ1RvcChwYWRkaW5nVG9wOiBudW1iZXIpIHtcblx0XHR0aGlzLl9zaXplID0gdGhpcy5fc2l6ZSArIHBhZGRpbmdUb3AgLSB0aGlzLl9wYWRkaW5nVG9wO1xuXHRcdHRoaXMuX3BhZGRpbmdUb3AgPSBwYWRkaW5nVG9wO1xuXHR9XG5cblx0Y29uc3RydWN0b3IodG9wUGFkZGluZz86IG51bWJlcikge1xuXHRcdHRoaXMuX3BhZGRpbmdUb3AgPSB0b3BQYWRkaW5nID8/IDA7XG5cdFx0dGhpcy5fc2l6ZSA9IHRoaXMuX3BhZGRpbmdUb3A7XG5cdH1cblxuXHRzcGxpY2UoaW5kZXg6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlciwgaXRlbXM6IElJdGVtW10gPSBbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGRpZmYgPSBpdGVtcy5sZW5ndGggLSBkZWxldGVDb3VudDtcblx0XHRjb25zdCBiZWZvcmUgPSBncm91cEludGVyc2VjdCh7IHN0YXJ0OiAwLCBlbmQ6IGluZGV4IH0sIHRoaXMuZ3JvdXBzKTtcblx0XHRjb25zdCBhZnRlciA9IGdyb3VwSW50ZXJzZWN0KHsgc3RhcnQ6IGluZGV4ICsgZGVsZXRlQ291bnQsIGVuZDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIH0sIHRoaXMuZ3JvdXBzKVxuXHRcdFx0Lm1hcDxJUmFuZ2VkR3JvdXA+KGcgPT4gKHsgcmFuZ2U6IHNoaWZ0KGcucmFuZ2UsIGRpZmYpLCBzaXplOiBnLnNpemUgfSkpO1xuXG5cdFx0Y29uc3QgbWlkZGxlID0gaXRlbXMubWFwPElSYW5nZWRHcm91cD4oKGl0ZW0sIGkpID0+ICh7XG5cdFx0XHRyYW5nZTogeyBzdGFydDogaW5kZXggKyBpLCBlbmQ6IGluZGV4ICsgaSArIDEgfSxcblx0XHRcdHNpemU6IGl0ZW0uc2l6ZVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZ3JvdXBzID0gY29uY2F0KGJlZm9yZSwgbWlkZGxlLCBhZnRlcik7XG5cdFx0dGhpcy5fc2l6ZSA9IHRoaXMuX3BhZGRpbmdUb3AgKyB0aGlzLmdyb3Vwcy5yZWR1Y2UoKHQsIGcpID0+IHQgKyAoZy5zaXplICogKGcucmFuZ2UuZW5kIC0gZy5yYW5nZS5zdGFydCkpLCAwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBudW1iZXIgb2YgaXRlbXMgaW4gdGhlIHJhbmdlIG1hcC5cblx0ICovXG5cdGdldCBjb3VudCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxlbiA9IHRoaXMuZ3JvdXBzLmxlbmd0aDtcblxuXHRcdGlmICghbGVuKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5ncm91cHNbbGVuIC0gMV0ucmFuZ2UuZW5kO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHN1bSBvZiB0aGUgc2l6ZXMgb2YgYWxsIGl0ZW1zIGluIHRoZSByYW5nZSBtYXAuXG5cdCAqL1xuXHRnZXQgc2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zaXplO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBpdGVtIGF0IHRoZSBnaXZlbiBwb3NpdGlvbi5cblx0ICovXG5cdGluZGV4QXQocG9zaXRpb246IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHBvc2l0aW9uIDwgMCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGlmIChwb3NpdGlvbiA8IHRoaXMuX3BhZGRpbmdUb3ApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGxldCBpbmRleCA9IDA7XG5cdFx0bGV0IHNpemUgPSB0aGlzLl9wYWRkaW5nVG9wO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdyb3Vwcykge1xuXHRcdFx0Y29uc3QgY291bnQgPSBncm91cC5yYW5nZS5lbmQgLSBncm91cC5yYW5nZS5zdGFydDtcblx0XHRcdGNvbnN0IG5ld1NpemUgPSBzaXplICsgKGNvdW50ICogZ3JvdXAuc2l6ZSk7XG5cblx0XHRcdGlmIChwb3NpdGlvbiA8IG5ld1NpemUpIHtcblx0XHRcdFx0cmV0dXJuIGluZGV4ICsgTWF0aC5mbG9vcigocG9zaXRpb24gLSBzaXplKSAvIGdyb3VwLnNpemUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpbmRleCArPSBjb3VudDtcblx0XHRcdHNpemUgPSBuZXdTaXplO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbmRleDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgaXRlbSByaWdodCBhZnRlciB0aGUgaXRlbSBhdCB0aGVcblx0ICogaW5kZXggb2YgdGhlIGdpdmVuIHBvc2l0aW9uLlxuXHQgKi9cblx0aW5kZXhBZnRlcihwb3NpdGlvbjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5taW4odGhpcy5pbmRleEF0KHBvc2l0aW9uKSArIDEsIHRoaXMuY291bnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHN0YXJ0IHBvc2l0aW9uIG9mIHRoZSBpdGVtIGF0IHRoZSBnaXZlbiBpbmRleC5cblx0ICovXG5cdHBvc2l0aW9uQXQoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGxldCBwb3NpdGlvbiA9IDA7XG5cdFx0bGV0IGNvdW50ID0gMDtcblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5ncm91cHMpIHtcblx0XHRcdGNvbnN0IGdyb3VwQ291bnQgPSBncm91cC5yYW5nZS5lbmQgLSBncm91cC5yYW5nZS5zdGFydDtcblx0XHRcdGNvbnN0IG5ld0NvdW50ID0gY291bnQgKyBncm91cENvdW50O1xuXG5cdFx0XHRpZiAoaW5kZXggPCBuZXdDb3VudCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcGFkZGluZ1RvcCArIHBvc2l0aW9uICsgKChpbmRleCAtIGNvdW50KSAqIGdyb3VwLnNpemUpO1xuXHRcdFx0fVxuXG5cdFx0XHRwb3NpdGlvbiArPSBncm91cENvdW50ICogZ3JvdXAuc2l6ZTtcblx0XHRcdGNvdW50ID0gbmV3Q291bnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIC0xO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFpQixhQUFhO0FBZXZCLFNBQVMsZUFBZSxPQUFlLFFBQXdDO0FBQ3JGLFFBQU0sU0FBeUIsQ0FBQztBQUVoQyxhQUFXLEtBQUssUUFBUTtBQUN2QixRQUFJLE1BQU0sU0FBUyxFQUFFLE1BQU0sS0FBSztBQUMvQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sTUFBTSxFQUFFLE1BQU0sT0FBTztBQUM5QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGVBQWUsTUFBTSxVQUFVLE9BQU8sRUFBRSxLQUFLO0FBRW5ELFFBQUksTUFBTSxRQUFRLFlBQVksR0FBRztBQUNoQztBQUFBLElBQ0Q7QUFFQSxXQUFPLEtBQUs7QUFBQSxNQUNYLE9BQU87QUFBQSxNQUNQLE1BQU0sRUFBRTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxTQUFPO0FBQ1I7QUFLTyxTQUFTLE1BQU0sRUFBRSxPQUFPLElBQUksR0FBVyxNQUFzQjtBQUNuRSxTQUFPLEVBQUUsT0FBTyxRQUFRLE1BQU0sS0FBSyxNQUFNLEtBQUs7QUFDL0M7QUFRTyxTQUFTLFlBQVksUUFBd0M7QUFDbkUsUUFBTSxTQUF5QixDQUFDO0FBQ2hDLE1BQUksZ0JBQXFDO0FBRXpDLGFBQVcsU0FBUyxRQUFRO0FBQzNCLFVBQU0sUUFBUSxNQUFNLE1BQU07QUFDMUIsVUFBTSxNQUFNLE1B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
