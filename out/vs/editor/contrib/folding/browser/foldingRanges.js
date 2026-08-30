var FoldSource = /* @__PURE__ */ ((FoldSource2) => {
  FoldSource2[FoldSource2["provider"] = 0] = "provider";
  FoldSource2[FoldSource2["userDefined"] = 1] = "userDefined";
  FoldSource2[FoldSource2["recovered"] = 2] = "recovered";
  return FoldSource2;
})(FoldSource || {});
const foldSourceAbbr = {
  [0 /* provider */]: " ",
  [1 /* userDefined */]: "u",
  [2 /* recovered */]: "r"
};
const MAX_FOLDING_REGIONS = 65535;
const MAX_LINE_NUMBER = 16777215;
const MASK_INDENT = 4278190080;
class BitField {
  constructor(size) {
    const numWords = Math.ceil(size / 32);
    this._states = new Uint32Array(numWords);
  }
  get(index) {
    const arrayIndex = index / 32 | 0;
    const bit = index % 32;
    return (this._states[arrayIndex] & 1 << bit) !== 0;
  }
  set(index, newState) {
    const arrayIndex = index / 32 | 0;
    const bit = index % 32;
    const value = this._states[arrayIndex];
    if (newState) {
      this._states[arrayIndex] = value | 1 << bit;
    } else {
      this._states[arrayIndex] = value & ~(1 << bit);
    }
  }
}
class FoldingRegions {
  constructor(startIndexes, endIndexes, types) {
    if (startIndexes.length !== endIndexes.length || startIndexes.length > MAX_FOLDING_REGIONS) {
      throw new Error("invalid startIndexes or endIndexes size");
    }
    this._startIndexes = startIndexes;
    this._endIndexes = endIndexes;
    this._collapseStates = new BitField(startIndexes.length);
    this._userDefinedStates = new BitField(startIndexes.length);
    this._recoveredStates = new BitField(startIndexes.length);
    this._types = types;
    this._parentsComputed = false;
  }
  ensureParentIndices() {
    if (!this._parentsComputed) {
      this._parentsComputed = true;
      const parentIndexes = [];
      const isInsideLast = (startLineNumber, endLineNumber) => {
        const index = parentIndexes[parentIndexes.length - 1];
        return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber;
      };
      for (let i = 0, len = this._startIndexes.length; i < len; i++) {
        const startLineNumber = this._startIndexes[i];
        const endLineNumber = this._endIndexes[i];
        if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
          throw new Error("startLineNumber or endLineNumber must not exceed " + MAX_LINE_NUMBER);
        }
        while (parentIndexes.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) {
          parentIndexes.pop();
        }
        const parentIndex = parentIndexes.length > 0 ? parentIndexes[parentIndexes.length - 1] : -1;
        parentIndexes.push(i);
        this._startIndexes[i] = startLineNumber + ((parentIndex & 255) << 24);
        this._endIndexes[i] = endLineNumber + ((parentIndex & 65280) << 16);
      }
    }
  }
  get length() {
    return this._startIndexes.length;
  }
  getStartLineNumber(index) {
    return this._startIndexes[index] & MAX_LINE_NUMBER;
  }
  getEndLineNumber(index) {
    return this._endIndexes[index] & MAX_LINE_NUMBER;
  }
  getType(index) {
    return this._types ? this._types[index] : void 0;
  }
  hasTypes() {
    return !!this._types;
  }
  isCollapsed(index) {
    return this._collapseStates.get(index);
  }
  setCollapsed(index, newState) {
    this._collapseStates.set(index, newState);
  }
  isUserDefined(index) {
    return this._userDefinedStates.get(index);
  }
  setUserDefined(index, newState) {
    return this._userDefinedStates.set(index, newState);
  }
  isRecovered(index) {
    return this._recoveredStates.get(index);
  }
  setRecovered(index, newState) {
    return this._recoveredStates.set(index, newState);
  }
  getSource(index) {
    if (this.isUserDefined(index)) {
      return 1 /* userDefined */;
    } else if (this.isRecovered(index)) {
      return 2 /* recovered */;
    }
    return 0 /* provider */;
  }
  setSource(index, source) {
    if (source === 1 /* userDefined */) {
      this.setUserDefined(index, true);
      this.setRecovered(index, false);
    } else if (source === 2 /* recovered */) {
      this.setUserDefined(index, false);
      this.setRecovered(index, true);
    } else {
      this.setUserDefined(index, false);
      this.setRecovered(index, false);
    }
  }
  setCollapsedAllOfType(type, newState) {
    let hasChanged = false;
    if (this._types) {
      for (let i = 0; i < this._types.length; i++) {
        if (this._types[i] === type) {
          this.setCollapsed(i, newState);
          hasChanged = true;
        }
      }
    }
    return hasChanged;
  }
  toRegion(index) {
    return new FoldingRegion(this, index);
  }
  getParentIndex(index) {
    this.ensureParentIndices();
    const parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
    if (parent === MAX_FOLDING_REGIONS) {
      return -1;
    }
    return parent;
  }
  contains(index, line) {
    return this.getStartLineNumber(index) <= line && this.getEndLineNumber(index) >= line;
  }
  findIndex(line) {
    let low = 0, high = this._startIndexes.length;
    if (high === 0) {
      return -1;
    }
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (line < this.getStartLineNumber(mid)) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low - 1;
  }
  findRange(line) {
    let index = this.findIndex(line);
    if (index >= 0) {
      const endLineNumber = this.getEndLineNumber(index);
      if (endLineNumber >= line) {
        return index;
      }
      index = this.getParentIndex(index);
      while (index !== -1) {
        if (this.contains(index, line)) {
          return index;
        }
        index = this.getParentIndex(index);
      }
    }
    return -1;
  }
  toString() {
    const res = [];
    for (let i = 0; i < this.length; i++) {
      res[i] = `[${foldSourceAbbr[this.getSource(i)]}${this.isCollapsed(i) ? "+" : "-"}] ${this.getStartLineNumber(i)}/${this.getEndLineNumber(i)}`;
    }
    return res.join(", ");
  }
  toFoldRange(index) {
    return {
      startLineNumber: this._startIndexes[index] & MAX_LINE_NUMBER,
      endLineNumber: this._endIndexes[index] & MAX_LINE_NUMBER,
      type: this._types ? this._types[index] : void 0,
      isCollapsed: this.isCollapsed(index),
      source: this.getSource(index)
    };
  }
  static fromFoldRanges(ranges) {
    const rangesLength = ranges.length;
    const startIndexes = new Uint32Array(rangesLength);
    const endIndexes = new Uint32Array(rangesLength);
    let types = [];
    let gotTypes = false;
    for (let i = 0; i < rangesLength; i++) {
      const range = ranges[i];
      startIndexes[i] = range.startLineNumber;
      endIndexes[i] = range.endLineNumber;
      types.push(range.type);
      if (range.type) {
        gotTypes = true;
      }
    }
    if (!gotTypes) {
      types = void 0;
    }
    const regions = new FoldingRegions(startIndexes, endIndexes, types);
    for (let i = 0; i < rangesLength; i++) {
      if (ranges[i].isCollapsed) {
        regions.setCollapsed(i, true);
      }
      regions.setSource(i, ranges[i].source);
    }
    return regions;
  }
  /**
   * Two inputs, each a FoldingRegions or a FoldRange[], are merged.
   * Each input must be pre-sorted on startLineNumber.
   * The first list is assumed to always include all regions currently defined by range providers.
   * The second list only contains the previously collapsed and all manual ranges.
   * If the line position matches, the range of the new range is taken, and the range is no longer manual
   * When an entry in one list overlaps an entry in the other, the second list's entry "wins" and
   * overlapping entries in the first list are discarded.
   * Invalid entries are discarded. An entry is invalid if:
   * 		the start and end line numbers aren't a valid range of line numbers,
   * 		it is out of sequence or has the same start line as a preceding entry,
   * 		it overlaps a preceding entry and is not fully contained by that entry.
   */
  static sanitizeAndMerge(rangesA, rangesB, maxLineNumber, selection) {
    maxLineNumber = maxLineNumber ?? Number.MAX_VALUE;
    const getIndexedFunction = (r, limit) => {
      return Array.isArray(r) ? ((i) => {
        return i < limit ? r[i] : void 0;
      }) : ((i) => {
        return i < limit ? r.toFoldRange(i) : void 0;
      });
    };
    const getA = getIndexedFunction(rangesA, rangesA.length);
    const getB = getIndexedFunction(rangesB, rangesB.length);
    let indexA = 0;
    let indexB = 0;
    let nextA = getA(0);
    let nextB = getB(0);
    const stackedRanges = [];
    let topStackedRange;
    let prevLineNumber = 0;
    const resultRanges = [];
    while (nextA || nextB) {
      let useRange = void 0;
      if (nextB && (!nextA || nextA.startLineNumber >= nextB.startLineNumber)) {
        if (nextA && nextA.startLineNumber === nextB.startLineNumber) {
          if (nextB.source === 1 /* userDefined */) {
            useRange = nextB;
          } else {
            useRange = nextA;
            useRange.isCollapsed = nextB.isCollapsed && (nextA.endLineNumber === nextB.endLineNumber || !selection?.startsInside(nextA.startLineNumber + 1, nextA.endLineNumber + 1));
            useRange.source = 0 /* provider */;
          }
          nextA = getA(++indexA);
        } else {
          useRange = nextB;
          if (nextB.isCollapsed && nextB.source === 0 /* provider */) {
            useRange.source = 2 /* recovered */;
          }
        }
        nextB = getB(++indexB);
      } else {
        let scanIndex = indexB;
        let prescanB = nextB;
        while (true) {
          if (!prescanB || prescanB.startLineNumber > nextA.endLineNumber) {
            useRange = nextA;
            break;
          }
          if (prescanB.source === 1 /* userDefined */ && prescanB.endLineNumber > nextA.endLineNumber) {
            break;
          }
          prescanB = getB(++scanIndex);
        }
        nextA = getA(++indexA);
      }
      if (useRange) {
        while (topStackedRange && topStackedRange.endLineNumber < useRange.startLineNumber) {
          topStackedRange = stackedRanges.pop();
        }
        if (useRange.endLineNumber > useRange.startLineNumber && useRange.startLineNumber > prevLineNumber && useRange.endLineNumber <= maxLineNumber && (!topStackedRange || topStackedRange.endLineNumber >= useRange.endLineNumber)) {
          resultRanges.push(useRange);
          prevLineNumber = useRange.startLineNumber;
          if (topStackedRange) {
            stackedRanges.push(topStackedRange);
          }
          topStackedRange = useRange;
        }
      }
    }
    return resultRanges;
  }
}
class FoldingRegion {
  constructor(ranges, index) {
    this.ranges = ranges;
    this.index = index;
  }
  get startLineNumber() {
    return this.ranges.getStartLineNumber(this.index);
  }
  get endLineNumber() {
    return this.ranges.getEndLineNumber(this.index);
  }
  get regionIndex() {
    return this.index;
  }
  get parentIndex() {
    return this.ranges.getParentIndex(this.index);
  }
  get isCollapsed() {
    return this.ranges.isCollapsed(this.index);
  }
  containedBy(range) {
    return range.startLineNumber <= this.startLineNumber && range.endLineNumber >= this.endLineNumber;
  }
  containsLine(lineNumber) {
    return this.startLineNumber <= lineNumber && lineNumber <= this.endLineNumber;
  }
  hidesLine(lineNumber) {
    return this.startLineNumber < lineNumber && lineNumber <= this.endLineNumber;
  }
}
export {
  FoldSource,
  FoldingRegion,
  FoldingRegions,
  MAX_FOLDING_REGIONS,
  MAX_LINE_NUMBER,
  foldSourceAbbr
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZvbGRpbmdcXGJyb3dzZXJcXGZvbGRpbmdSYW5nZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZWxlY3RlZExpbmVzIH0gZnJvbSAnLi9mb2xkaW5nLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTGluZVJhbmdlIHtcblx0c3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdGVuZExpbmVOdW1iZXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRm9sZFNvdXJjZSB7XG5cdHByb3ZpZGVyID0gMCxcblx0dXNlckRlZmluZWQgPSAxLFxuXHRyZWNvdmVyZWQgPSAyXG59XG5cbmV4cG9ydCBjb25zdCBmb2xkU291cmNlQWJiciA9IHtcblx0W0ZvbGRTb3VyY2UucHJvdmlkZXJdOiAnICcsXG5cdFtGb2xkU291cmNlLnVzZXJEZWZpbmVkXTogJ3UnLFxuXHRbRm9sZFNvdXJjZS5yZWNvdmVyZWRdOiAncicsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIEZvbGRSYW5nZSB7XG5cdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0aXNDb2xsYXBzZWQ6IGJvb2xlYW47XG5cdHNvdXJjZTogRm9sZFNvdXJjZTtcbn1cblxuZXhwb3J0IGNvbnN0IE1BWF9GT0xESU5HX1JFR0lPTlMgPSAweEZGRkY7XG5leHBvcnQgY29uc3QgTUFYX0xJTkVfTlVNQkVSID0gMHhGRkZGRkY7XG5cbmNvbnN0IE1BU0tfSU5ERU5UID0gMHhGRjAwMDAwMDtcblxuY2xhc3MgQml0RmllbGQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZXM6IFVpbnQzMkFycmF5O1xuXHRjb25zdHJ1Y3RvcihzaXplOiBudW1iZXIpIHtcblx0XHRjb25zdCBudW1Xb3JkcyA9IE1hdGguY2VpbChzaXplIC8gMzIpO1xuXHRcdHRoaXMuX3N0YXRlcyA9IG5ldyBVaW50MzJBcnJheShudW1Xb3Jkcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBhcnJheUluZGV4ID0gKGluZGV4IC8gMzIpIHwgMDtcblx0XHRjb25zdCBiaXQgPSBpbmRleCAlIDMyO1xuXHRcdHJldHVybiAodGhpcy5fc3RhdGVzW2FycmF5SW5kZXhdICYgKDEgPDwgYml0KSkgIT09IDA7XG5cdH1cblxuXHRwdWJsaWMgc2V0KGluZGV4OiBudW1iZXIsIG5ld1N0YXRlOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgYXJyYXlJbmRleCA9IChpbmRleCAvIDMyKSB8IDA7XG5cdFx0Y29uc3QgYml0ID0gaW5kZXggJSAzMjtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3N0YXRlc1thcnJheUluZGV4XTtcblx0XHRpZiAobmV3U3RhdGUpIHtcblx0XHRcdHRoaXMuX3N0YXRlc1thcnJheUluZGV4XSA9IHZhbHVlIHwgKDEgPDwgYml0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhdGVzW2FycmF5SW5kZXhdID0gdmFsdWUgJiB+KDEgPDwgYml0KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvbGRpbmdSZWdpb25zIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnRJbmRleGVzOiBVaW50MzJBcnJheTtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5kSW5kZXhlczogVWludDMyQXJyYXk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxhcHNlU3RhdGVzOiBCaXRGaWVsZDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXNlckRlZmluZWRTdGF0ZXM6IEJpdEZpZWxkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvdmVyZWRTdGF0ZXM6IEJpdEZpZWxkO1xuXG5cdHByaXZhdGUgX3BhcmVudHNDb21wdXRlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfdHlwZXM6IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3Ioc3RhcnRJbmRleGVzOiBVaW50MzJBcnJheSwgZW5kSW5kZXhlczogVWludDMyQXJyYXksIHR5cGVzPzogQXJyYXk8c3RyaW5nIHwgdW5kZWZpbmVkPikge1xuXHRcdGlmIChzdGFydEluZGV4ZXMubGVuZ3RoICE9PSBlbmRJbmRleGVzLmxlbmd0aCB8fCBzdGFydEluZGV4ZXMubGVuZ3RoID4gTUFYX0ZPTERJTkdfUkVHSU9OUykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHN0YXJ0SW5kZXhlcyBvciBlbmRJbmRleGVzIHNpemUnKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RhcnRJbmRleGVzID0gc3RhcnRJbmRleGVzO1xuXHRcdHRoaXMuX2VuZEluZGV4ZXMgPSBlbmRJbmRleGVzO1xuXHRcdHRoaXMuX2NvbGxhcHNlU3RhdGVzID0gbmV3IEJpdEZpZWxkKHN0YXJ0SW5kZXhlcy5sZW5ndGgpO1xuXHRcdHRoaXMuX3VzZXJEZWZpbmVkU3RhdGVzID0gbmV3IEJpdEZpZWxkKHN0YXJ0SW5kZXhlcy5sZW5ndGgpO1xuXHRcdHRoaXMuX3JlY292ZXJlZFN0YXRlcyA9IG5ldyBCaXRGaWVsZChzdGFydEluZGV4ZXMubGVuZ3RoKTtcblx0XHR0aGlzLl90eXBlcyA9IHR5cGVzO1xuXHRcdHRoaXMuX3BhcmVudHNDb21wdXRlZCA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVQYXJlbnRJbmRpY2VzKCkge1xuXHRcdGlmICghdGhpcy5fcGFyZW50c0NvbXB1dGVkKSB7XG5cdFx0XHR0aGlzLl9wYXJlbnRzQ29tcHV0ZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgcGFyZW50SW5kZXhlczogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGlzSW5zaWRlTGFzdCA9IChzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gcGFyZW50SW5kZXhlc1twYXJlbnRJbmRleGVzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRTdGFydExpbmVOdW1iZXIoaW5kZXgpIDw9IHN0YXJ0TGluZU51bWJlciAmJiB0aGlzLmdldEVuZExpbmVOdW1iZXIoaW5kZXgpID49IGVuZExpbmVOdW1iZXI7XG5cdFx0XHR9O1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3N0YXJ0SW5kZXhlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSB0aGlzLl9zdGFydEluZGV4ZXNbaV07XG5cdFx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB0aGlzLl9lbmRJbmRleGVzW2ldO1xuXHRcdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyID4gTUFYX0xJTkVfTlVNQkVSIHx8IGVuZExpbmVOdW1iZXIgPiBNQVhfTElORV9OVU1CRVIpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3N0YXJ0TGluZU51bWJlciBvciBlbmRMaW5lTnVtYmVyIG11c3Qgbm90IGV4Y2VlZCAnICsgTUFYX0xJTkVfTlVNQkVSKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR3aGlsZSAocGFyZW50SW5kZXhlcy5sZW5ndGggPiAwICYmICFpc0luc2lkZUxhc3Qoc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdHBhcmVudEluZGV4ZXMucG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcGFyZW50SW5kZXggPSBwYXJlbnRJbmRleGVzLmxlbmd0aCA+IDAgPyBwYXJlbnRJbmRleGVzW3BhcmVudEluZGV4ZXMubGVuZ3RoIC0gMV0gOiAtMTtcblx0XHRcdFx0cGFyZW50SW5kZXhlcy5wdXNoKGkpO1xuXHRcdFx0XHR0aGlzLl9zdGFydEluZGV4ZXNbaV0gPSBzdGFydExpbmVOdW1iZXIgKyAoKHBhcmVudEluZGV4ICYgMHhGRikgPDwgMjQpO1xuXHRcdFx0XHR0aGlzLl9lbmRJbmRleGVzW2ldID0gZW5kTGluZU51bWJlciArICgocGFyZW50SW5kZXggJiAweEZGMDApIDw8IDE2KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGxlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zdGFydEluZGV4ZXMubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldFN0YXJ0TGluZU51bWJlcihpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRJbmRleGVzW2luZGV4XSAmIE1BWF9MSU5FX05VTUJFUjtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmRMaW5lTnVtYmVyKGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9lbmRJbmRleGVzW2luZGV4XSAmIE1BWF9MSU5FX05VTUJFUjtcblx0fVxuXG5cdHB1YmxpYyBnZXRUeXBlKGluZGV4OiBudW1iZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90eXBlcyA/IHRoaXMuX3R5cGVzW2luZGV4XSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBoYXNUeXBlcygpIHtcblx0XHRyZXR1cm4gISF0aGlzLl90eXBlcztcblx0fVxuXG5cdHB1YmxpYyBpc0NvbGxhcHNlZChpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbGxhcHNlU3RhdGVzLmdldChpbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29sbGFwc2VkKGluZGV4OiBudW1iZXIsIG5ld1N0YXRlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY29sbGFwc2VTdGF0ZXMuc2V0KGluZGV4LCBuZXdTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGlzVXNlckRlZmluZWQoaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91c2VyRGVmaW5lZFN0YXRlcy5nZXQoaW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRVc2VyRGVmaW5lZChpbmRleDogbnVtYmVyLCBuZXdTdGF0ZTogYm9vbGVhbikge1xuXHRcdHJldHVybiB0aGlzLl91c2VyRGVmaW5lZFN0YXRlcy5zZXQoaW5kZXgsIG5ld1N0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgaXNSZWNvdmVyZWQoaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWNvdmVyZWRTdGF0ZXMuZ2V0KGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0UmVjb3ZlcmVkKGluZGV4OiBudW1iZXIsIG5ld1N0YXRlOiBib29sZWFuKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlY292ZXJlZFN0YXRlcy5zZXQoaW5kZXgsIG5ld1N0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTb3VyY2UoaW5kZXg6IG51bWJlcik6IEZvbGRTb3VyY2Uge1xuXHRcdGlmICh0aGlzLmlzVXNlckRlZmluZWQoaW5kZXgpKSB7XG5cdFx0XHRyZXR1cm4gRm9sZFNvdXJjZS51c2VyRGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaXNSZWNvdmVyZWQoaW5kZXgpKSB7XG5cdFx0XHRyZXR1cm4gRm9sZFNvdXJjZS5yZWNvdmVyZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBGb2xkU291cmNlLnByb3ZpZGVyO1xuXHR9XG5cblx0cHVibGljIHNldFNvdXJjZShpbmRleDogbnVtYmVyLCBzb3VyY2U6IEZvbGRTb3VyY2UpOiB2b2lkIHtcblx0XHRpZiAoc291cmNlID09PSBGb2xkU291cmNlLnVzZXJEZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnNldFVzZXJEZWZpbmVkKGluZGV4LCB0cnVlKTtcblx0XHRcdHRoaXMuc2V0UmVjb3ZlcmVkKGluZGV4LCBmYWxzZSk7XG5cdFx0fSBlbHNlIGlmIChzb3VyY2UgPT09IEZvbGRTb3VyY2UucmVjb3ZlcmVkKSB7XG5cdFx0XHR0aGlzLnNldFVzZXJEZWZpbmVkKGluZGV4LCBmYWxzZSk7XG5cdFx0XHR0aGlzLnNldFJlY292ZXJlZChpbmRleCwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0VXNlckRlZmluZWQoaW5kZXgsIGZhbHNlKTtcblx0XHRcdHRoaXMuc2V0UmVjb3ZlcmVkKGluZGV4LCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldENvbGxhcHNlZEFsbE9mVHlwZSh0eXBlOiBzdHJpbmcsIG5ld1N0YXRlOiBib29sZWFuKSB7XG5cdFx0bGV0IGhhc0NoYW5nZWQgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5fdHlwZXMpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fdHlwZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHRoaXMuX3R5cGVzW2ldID09PSB0eXBlKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb2xsYXBzZWQoaSwgbmV3U3RhdGUpO1xuXHRcdFx0XHRcdGhhc0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBoYXNDaGFuZ2VkO1xuXHR9XG5cblx0cHVibGljIHRvUmVnaW9uKGluZGV4OiBudW1iZXIpOiBGb2xkaW5nUmVnaW9uIHtcblx0XHRyZXR1cm4gbmV3IEZvbGRpbmdSZWdpb24odGhpcywgaW5kZXgpO1xuXHR9XG5cblx0cHVibGljIGdldFBhcmVudEluZGV4KGluZGV4OiBudW1iZXIpIHtcblx0XHR0aGlzLmVuc3VyZVBhcmVudEluZGljZXMoKTtcblx0XHRjb25zdCBwYXJlbnQgPSAoKHRoaXMuX3N0YXJ0SW5kZXhlc1tpbmRleF0gJiBNQVNLX0lOREVOVCkgPj4+IDI0KSArICgodGhpcy5fZW5kSW5kZXhlc1tpbmRleF0gJiBNQVNLX0lOREVOVCkgPj4+IDE2KTtcblx0XHRpZiAocGFyZW50ID09PSBNQVhfRk9MRElOR19SRUdJT05TKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJlbnQ7XG5cdH1cblxuXHRwdWJsaWMgY29udGFpbnMoaW5kZXg6IG51bWJlciwgbGluZTogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhcnRMaW5lTnVtYmVyKGluZGV4KSA8PSBsaW5lICYmIHRoaXMuZ2V0RW5kTGluZU51bWJlcihpbmRleCkgPj0gbGluZTtcblx0fVxuXG5cdHByaXZhdGUgZmluZEluZGV4KGxpbmU6IG51bWJlcikge1xuXHRcdGxldCBsb3cgPSAwLCBoaWdoID0gdGhpcy5fc3RhcnRJbmRleGVzLmxlbmd0aDtcblx0XHRpZiAoaGlnaCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIC0xOyAvLyBubyBjaGlsZHJlblxuXHRcdH1cblx0XHR3aGlsZSAobG93IDwgaGlnaCkge1xuXHRcdFx0Y29uc3QgbWlkID0gTWF0aC5mbG9vcigobG93ICsgaGlnaCkgLyAyKTtcblx0XHRcdGlmIChsaW5lIDwgdGhpcy5nZXRTdGFydExpbmVOdW1iZXIobWlkKSkge1xuXHRcdFx0XHRoaWdoID0gbWlkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG93ID0gbWlkICsgMTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxvdyAtIDE7XG5cdH1cblxuXHRwdWJsaWMgZmluZFJhbmdlKGxpbmU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGluZGV4ID0gdGhpcy5maW5kSW5kZXgobGluZSk7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB0aGlzLmdldEVuZExpbmVOdW1iZXIoaW5kZXgpO1xuXHRcdFx0aWYgKGVuZExpbmVOdW1iZXIgPj0gbGluZSkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHR9XG5cdFx0XHRpbmRleCA9IHRoaXMuZ2V0UGFyZW50SW5kZXgoaW5kZXgpO1xuXHRcdFx0d2hpbGUgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRpZiAodGhpcy5jb250YWlucyhpbmRleCwgbGluZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5kZXggPSB0aGlzLmdldFBhcmVudEluZGV4KGluZGV4KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblxuXHRwdWJsaWMgdG9TdHJpbmcoKSB7XG5cdFx0Y29uc3QgcmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0cmVzW2ldID0gYFske2ZvbGRTb3VyY2VBYmJyW3RoaXMuZ2V0U291cmNlKGkpXX0ke3RoaXMuaXNDb2xsYXBzZWQoaSkgPyAnKycgOiAnLSd9XSAke3RoaXMuZ2V0U3RhcnRMaW5lTnVtYmVyKGkpfS8ke3RoaXMuZ2V0RW5kTGluZU51bWJlcihpKX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzLmpvaW4oJywgJyk7XG5cdH1cblxuXHRwdWJsaWMgdG9Gb2xkUmFuZ2UoaW5kZXg6IG51bWJlcik6IEZvbGRSYW5nZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogdGhpcy5fc3RhcnRJbmRleGVzW2luZGV4XSAmIE1BWF9MSU5FX05VTUJFUixcblx0XHRcdGVuZExpbmVOdW1iZXI6IHRoaXMuX2VuZEluZGV4ZXNbaW5kZXhdICYgTUFYX0xJTkVfTlVNQkVSLFxuXHRcdFx0dHlwZTogdGhpcy5fdHlwZXMgPyB0aGlzLl90eXBlc1tpbmRleF0gOiB1bmRlZmluZWQsXG5cdFx0XHRpc0NvbGxhcHNlZDogdGhpcy5pc0NvbGxhcHNlZChpbmRleCksXG5cdFx0XHRzb3VyY2U6IHRoaXMuZ2V0U291cmNlKGluZGV4KVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21Gb2xkUmFuZ2VzKHJhbmdlczogRm9sZFJhbmdlW10pOiBGb2xkaW5nUmVnaW9ucyB7XG5cdFx0Y29uc3QgcmFuZ2VzTGVuZ3RoID0gcmFuZ2VzLmxlbmd0aDtcblx0XHRjb25zdCBzdGFydEluZGV4ZXMgPSBuZXcgVWludDMyQXJyYXkocmFuZ2VzTGVuZ3RoKTtcblx0XHRjb25zdCBlbmRJbmRleGVzID0gbmV3IFVpbnQzMkFycmF5KHJhbmdlc0xlbmd0aCk7XG5cdFx0bGV0IHR5cGVzOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkID0gW107XG5cdFx0bGV0IGdvdFR5cGVzID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByYW5nZXNMZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSByYW5nZXNbaV07XG5cdFx0XHRzdGFydEluZGV4ZXNbaV0gPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRlbmRJbmRleGVzW2ldID0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRcdHR5cGVzLnB1c2gocmFuZ2UudHlwZSk7XG5cdFx0XHRpZiAocmFuZ2UudHlwZSkge1xuXHRcdFx0XHRnb3RUeXBlcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghZ290VHlwZXMpIHtcblx0XHRcdHR5cGVzID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZWdpb25zID0gbmV3IEZvbGRpbmdSZWdpb25zKHN0YXJ0SW5kZXhlcywgZW5kSW5kZXhlcywgdHlwZXMpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmFuZ2VzTGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChyYW5nZXNbaV0uaXNDb2xsYXBzZWQpIHtcblx0XHRcdFx0cmVnaW9ucy5zZXRDb2xsYXBzZWQoaSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZWdpb25zLnNldFNvdXJjZShpLCByYW5nZXNbaV0uc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlZ2lvbnM7XG5cdH1cblxuXHQvKipcblx0ICogVHdvIGlucHV0cywgZWFjaCBhIEZvbGRpbmdSZWdpb25zIG9yIGEgRm9sZFJhbmdlW10sIGFyZSBtZXJnZWQuXG5cdCAqIEVhY2ggaW5wdXQgbXVzdCBiZSBwcmUtc29ydGVkIG9uIHN0YXJ0TGluZU51bWJlci5cblx0ICogVGhlIGZpcnN0IGxpc3QgaXMgYXNzdW1lZCB0byBhbHdheXMgaW5jbHVkZSBhbGwgcmVnaW9ucyBjdXJyZW50bHkgZGVmaW5lZCBieSByYW5nZSBwcm92aWRlcnMuXG5cdCAqIFRoZSBzZWNvbmQgbGlzdCBvbmx5IGNvbnRhaW5zIHRoZSBwcmV2aW91c2x5IGNvbGxhcHNlZCBhbmQgYWxsIG1hbnVhbCByYW5nZXMuXG5cdCAqIElmIHRoZSBsaW5lIHBvc2l0aW9uIG1hdGNoZXMsIHRoZSByYW5nZSBvZiB0aGUgbmV3IHJhbmdlIGlzIHRha2VuLCBhbmQgdGhlIHJhbmdlIGlzIG5vIGxvbmdlciBtYW51YWxcblx0ICogV2hlbiBhbiBlbnRyeSBpbiBvbmUgbGlzdCBvdmVybGFwcyBhbiBlbnRyeSBpbiB0aGUgb3RoZXIsIHRoZSBzZWNvbmQgbGlzdCdzIGVudHJ5IFwid2luc1wiIGFuZFxuXHQgKiBvdmVybGFwcGluZyBlbnRyaWVzIGluIHRoZSBmaXJzdCBsaXN0IGFyZSBkaXNjYXJkZWQuXG5cdCAqIEludmFsaWQgZW50cmllcyBhcmUgZGlzY2FyZGVkLiBBbiBlbnRyeSBpcyBpbnZhbGlkIGlmOlxuXHQgKiBcdFx0dGhlIHN0YXJ0IGFuZCBlbmQgbGluZSBudW1iZXJzIGFyZW4ndCBhIHZhbGlkIHJhbmdlIG9mIGxpbmUgbnVtYmVycyxcblx0ICogXHRcdGl0IGlzIG91dCBvZiBzZXF1ZW5jZSBvciBoYXMgdGhlIHNhbWUgc3RhcnQgbGluZSBhcyBhIHByZWNlZGluZyBlbnRyeSxcblx0ICogXHRcdGl0IG92ZXJsYXBzIGEgcHJlY2VkaW5nIGVudHJ5IGFuZCBpcyBub3QgZnVsbHkgY29udGFpbmVkIGJ5IHRoYXQgZW50cnkuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHNhbml0aXplQW5kTWVyZ2UoXG5cdFx0cmFuZ2VzQTogRm9sZGluZ1JlZ2lvbnMgfCBGb2xkUmFuZ2VbXSxcblx0XHRyYW5nZXNCOiBGb2xkaW5nUmVnaW9ucyB8IEZvbGRSYW5nZVtdLFxuXHRcdG1heExpbmVOdW1iZXI6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRzZWxlY3Rpb24/OiBTZWxlY3RlZExpbmVzXG5cdCk6IEZvbGRSYW5nZVtdIHtcblxuXHRcdG1heExpbmVOdW1iZXIgPSBtYXhMaW5lTnVtYmVyID8/IE51bWJlci5NQVhfVkFMVUU7XG5cblx0XHRjb25zdCBnZXRJbmRleGVkRnVuY3Rpb24gPSAocjogRm9sZGluZ1JlZ2lvbnMgfCBGb2xkUmFuZ2VbXSwgbGltaXQ6IG51bWJlcikgPT4ge1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocilcblx0XHRcdFx0PyAoKGk6IG51bWJlcikgPT4geyByZXR1cm4gKGkgPCBsaW1pdCkgPyByW2ldIDogdW5kZWZpbmVkOyB9KVxuXHRcdFx0XHQ6ICgoaTogbnVtYmVyKSA9PiB7IHJldHVybiAoaSA8IGxpbWl0KSA/IHIudG9Gb2xkUmFuZ2UoaSkgOiB1bmRlZmluZWQ7IH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgZ2V0QSA9IGdldEluZGV4ZWRGdW5jdGlvbihyYW5nZXNBLCByYW5nZXNBLmxlbmd0aCk7XG5cdFx0Y29uc3QgZ2V0QiA9IGdldEluZGV4ZWRGdW5jdGlvbihyYW5nZXNCLCByYW5nZXNCLmxlbmd0aCk7XG5cdFx0bGV0IGluZGV4QSA9IDA7XG5cdFx0bGV0IGluZGV4QiA9IDA7XG5cdFx0bGV0IG5leHRBID0gZ2V0QSgwKTtcblx0XHRsZXQgbmV4dEIgPSBnZXRCKDApO1xuXG5cdFx0Y29uc3Qgc3RhY2tlZFJhbmdlczogRm9sZFJhbmdlW10gPSBbXTtcblx0XHRsZXQgdG9wU3RhY2tlZFJhbmdlOiBGb2xkUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHByZXZMaW5lTnVtYmVyID0gMDtcblx0XHRjb25zdCByZXN1bHRSYW5nZXM6IEZvbGRSYW5nZVtdID0gW107XG5cblx0XHR3aGlsZSAobmV4dEEgfHwgbmV4dEIpIHtcblxuXHRcdFx0bGV0IHVzZVJhbmdlOiBGb2xkUmFuZ2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobmV4dEIgJiYgKCFuZXh0QSB8fCBuZXh0QS5zdGFydExpbmVOdW1iZXIgPj0gbmV4dEIuc3RhcnRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRpZiAobmV4dEEgJiYgbmV4dEEuc3RhcnRMaW5lTnVtYmVyID09PSBuZXh0Qi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRpZiAobmV4dEIuc291cmNlID09PSBGb2xkU291cmNlLnVzZXJEZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHQvLyBhIHVzZXIgZGVmaW5lZCByYW5nZSAocG9zc2libHkgdW5mb2xkZWQpXG5cdFx0XHRcdFx0XHR1c2VSYW5nZSA9IG5leHRCO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBhIHByZXZpb3VzbHkgZm9sZGVkIHJhbmdlIG9yIGEgKHBvc3NpYmx5IHVuZm9sZGVkKSByZWNvdmVyZWQgcmFuZ2Vcblx0XHRcdFx0XHRcdHVzZVJhbmdlID0gbmV4dEE7XG5cdFx0XHRcdFx0XHQvLyBzdGF5cyBjb2xsYXBzZWQgaWYgdGhlIHJhbmdlIHN0aWxsIGhhcyB0aGUgc2FtZSBudW1iZXIgb2YgbGluZXMgb3IgdGhlIHNlbGVjdGlvbiBpcyBub3QgaW4gdGhlIHJhbmdlIG9yIGFmdGVyIGl0XG5cdFx0XHRcdFx0XHR1c2VSYW5nZS5pc0NvbGxhcHNlZCA9IG5leHRCLmlzQ29sbGFwc2VkICYmIChuZXh0QS5lbmRMaW5lTnVtYmVyID09PSBuZXh0Qi5lbmRMaW5lTnVtYmVyIHx8ICFzZWxlY3Rpb24/LnN0YXJ0c0luc2lkZShuZXh0QS5zdGFydExpbmVOdW1iZXIgKyAxLCBuZXh0QS5lbmRMaW5lTnVtYmVyICsgMSkpO1xuXHRcdFx0XHRcdFx0dXNlUmFuZ2Uuc291cmNlID0gRm9sZFNvdXJjZS5wcm92aWRlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bmV4dEEgPSBnZXRBKCsraW5kZXhBKTsgLy8gbm90IG5lY2Vzc2FyeSwganVzdCBmb3Igc3BlZWRcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR1c2VSYW5nZSA9IG5leHRCO1xuXHRcdFx0XHRcdGlmIChuZXh0Qi5pc0NvbGxhcHNlZCAmJiBuZXh0Qi5zb3VyY2UgPT09IEZvbGRTb3VyY2UucHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdC8vIGEgcHJldmlvdXNseSBjb2xsYXBzZWQgcmFuZ2Vcblx0XHRcdFx0XHRcdHVzZVJhbmdlLnNvdXJjZSA9IEZvbGRTb3VyY2UucmVjb3ZlcmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRuZXh0QiA9IGdldEIoKytpbmRleEIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gbmV4dEEgaXMgbmV4dC4gVGhlIHVzZXIgZm9sZGVkIEIgc2V0IHRha2VzIHByZWNlZGVuY2UgYW5kIHdlIHNvbWV0aW1lcyBuZWVkIHRvIGxvb2tcblx0XHRcdFx0Ly8gYWhlYWQgaW4gaXQgdG8gY2hlY2sgZm9yIGFuIHVwY29taW5nIGNvbmZsaWN0LlxuXHRcdFx0XHRsZXQgc2NhbkluZGV4ID0gaW5kZXhCO1xuXHRcdFx0XHRsZXQgcHJlc2NhbkIgPSBuZXh0Qjtcblx0XHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0XHRpZiAoIXByZXNjYW5CIHx8IHByZXNjYW5CLnN0YXJ0TGluZU51bWJlciA+IG5leHRBIS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHR1c2VSYW5nZSA9IG5leHRBO1xuXHRcdFx0XHRcdFx0YnJlYWs7IC8vIG5vIGNvbmZsaWN0LCB1c2UgdGhpcyBuZXh0QVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocHJlc2NhbkIuc291cmNlID09PSBGb2xkU291cmNlLnVzZXJEZWZpbmVkICYmIHByZXNjYW5CLmVuZExpbmVOdW1iZXIgPiBuZXh0QSEuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0Ly8gd2UgZm91bmQgYSB1c2VyIGZvbGRlZCByYW5nZSwgaXQgd2luc1xuXHRcdFx0XHRcdFx0YnJlYWs7IC8vIHdpdGhvdXQgc2V0dGluZyBuZXh0UmVzdWx0LCBzbyB0aGlzIG5leHRBIGdldHMgc2tpcHBlZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcmVzY2FuQiA9IGdldEIoKytzY2FuSW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG5leHRBID0gZ2V0QSgrK2luZGV4QSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1c2VSYW5nZSkge1xuXHRcdFx0XHR3aGlsZSAodG9wU3RhY2tlZFJhbmdlXG5cdFx0XHRcdFx0JiYgdG9wU3RhY2tlZFJhbmdlLmVuZExpbmVOdW1iZXIgPCB1c2VSYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHR0b3BTdGFja2VkUmFuZ2UgPSBzdGFja2VkUmFuZ2VzLnBvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1c2VSYW5nZS5lbmRMaW5lTnVtYmVyID4gdXNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyXG5cdFx0XHRcdFx0JiYgdXNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gcHJldkxpbmVOdW1iZXJcblx0XHRcdFx0XHQmJiB1c2VSYW5nZS5lbmRMaW5lTnVtYmVyIDw9IG1heExpbmVOdW1iZXJcblx0XHRcdFx0XHQmJiAoIXRvcFN0YWNrZWRSYW5nZVxuXHRcdFx0XHRcdFx0fHwgdG9wU3RhY2tlZFJhbmdlLmVuZExpbmVOdW1iZXIgPj0gdXNlUmFuZ2UuZW5kTGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRyZXN1bHRSYW5nZXMucHVzaCh1c2VSYW5nZSk7XG5cdFx0XHRcdFx0cHJldkxpbmVOdW1iZXIgPSB1c2VSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0aWYgKHRvcFN0YWNrZWRSYW5nZSkge1xuXHRcdFx0XHRcdFx0c3RhY2tlZFJhbmdlcy5wdXNoKHRvcFN0YWNrZWRSYW5nZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRvcFN0YWNrZWRSYW5nZSA9IHVzZVJhbmdlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdFJhbmdlcztcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBGb2xkaW5nUmVnaW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHJhbmdlczogRm9sZGluZ1JlZ2lvbnMsIHByaXZhdGUgaW5kZXg6IG51bWJlcikge1xuXHR9XG5cblx0cHVibGljIGdldCBzdGFydExpbmVOdW1iZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMucmFuZ2VzLmdldFN0YXJ0TGluZU51bWJlcih0aGlzLmluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZW5kTGluZU51bWJlcigpIHtcblx0XHRyZXR1cm4gdGhpcy5yYW5nZXMuZ2V0RW5kTGluZU51bWJlcih0aGlzLmluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgcmVnaW9uSW5kZXgoKSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5kZXg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHBhcmVudEluZGV4KCkge1xuXHRcdHJldHVybiB0aGlzLnJhbmdlcy5nZXRQYXJlbnRJbmRleCh0aGlzLmluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNDb2xsYXBzZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMucmFuZ2VzLmlzQ29sbGFwc2VkKHRoaXMuaW5kZXgpO1xuXHR9XG5cblx0Y29udGFpbmVkQnkocmFuZ2U6IElMaW5lUmFuZ2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDw9IHRoaXMuc3RhcnRMaW5lTnVtYmVyICYmIHJhbmdlLmVuZExpbmVOdW1iZXIgPj0gdGhpcy5lbmRMaW5lTnVtYmVyO1xuXHR9XG5cdGNvbnRhaW5zTGluZShsaW5lTnVtYmVyOiBudW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5zdGFydExpbmVOdW1iZXIgPD0gbGluZU51bWJlciAmJiBsaW5lTnVtYmVyIDw9IHRoaXMuZW5kTGluZU51bWJlcjtcblx0fVxuXHRoaWRlc0xpbmUobGluZU51bWJlcjogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhcnRMaW5lTnVtYmVyIDwgbGluZU51bWJlciAmJiBsaW5lTnVtYmVyIDw9IHRoaXMuZW5kTGluZU51bWJlcjtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBWU8sSUFBVyxhQUFYLGtCQUFXQSxnQkFBWDtBQUNOLEVBQUFBLHdCQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLHdCQUFBLGlCQUFjLEtBQWQ7QUFDQSxFQUFBQSx3QkFBQSxlQUFZLEtBQVo7QUFIaUIsU0FBQUE7QUFBQSxHQUFBO0FBTVgsTUFBTSxpQkFBaUI7QUFBQSxFQUM3QixDQUFDLGdCQUFtQixHQUFHO0FBQUEsRUFDdkIsQ0FBQyxtQkFBc0IsR0FBRztBQUFBLEVBQzFCLENBQUMsaUJBQW9CLEdBQUc7QUFDekI7QUFVTyxNQUFNLHNCQUFzQjtBQUM1QixNQUFNLGtCQUFrQjtBQUUvQixNQUFNLGNBQWM7QUFFcEIsTUFBTSxTQUFTO0FBQUEsRUFFZCxZQUFZLE1BQWM7QUFDekIsVUFBTSxXQUFXLEtBQUssS0FBSyxPQUFPLEVBQUU7QUFDcEMsU0FBSyxVQUFVLElBQUksWUFBWSxRQUFRO0FBQUEsRUFDeEM7QUFBQSxFQUVPLElBQUksT0FBd0I7QUFDbEMsVUFB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
