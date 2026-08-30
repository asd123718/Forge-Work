import { Position } from "./position.js";
class Range {
  constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
    if (startLineNumber > endLineNumber || startLineNumber === endLineNumber && startColumn > endColumn) {
      this.startLineNumber = endLineNumber;
      this.startColumn = endColumn;
      this.endLineNumber = startLineNumber;
      this.endColumn = startColumn;
    } else {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  }
  /**
   * Test if this range is empty.
   */
  isEmpty() {
    return Range.isEmpty(this);
  }
  /**
   * Test if `range` is empty.
   */
  static isEmpty(range) {
    return range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
  }
  /**
   * Test if position is in this range. If the position is at the edges, will return true.
   */
  containsPosition(position) {
    return Range.containsPosition(this, position);
  }
  /**
   * Test if `position` is in `range`. If the position is at the edges, will return true.
   */
  static containsPosition(range, position) {
    if (position.lineNumber < range.startLineNumber || position.lineNumber > range.endLineNumber) {
      return false;
    }
    if (position.lineNumber === range.startLineNumber && position.column < range.startColumn) {
      return false;
    }
    if (position.lineNumber === range.endLineNumber && position.column > range.endColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if `position` is in `range`. If the position is at the edges, will return false.
   * @internal
   */
  static strictContainsPosition(range, position) {
    if (position.lineNumber < range.startLineNumber || position.lineNumber > range.endLineNumber) {
      return false;
    }
    if (position.lineNumber === range.startLineNumber && position.column <= range.startColumn) {
      return false;
    }
    if (position.lineNumber === range.endLineNumber && position.column >= range.endColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if range is in this range. If the range is equal to this range, will return true.
   */
  containsRange(range) {
    return Range.containsRange(this, range);
  }
  /**
   * Test if `otherRange` is in `range`. If the ranges are equal, will return true.
   */
  static containsRange(range, otherRange) {
    if (otherRange.startLineNumber < range.startLineNumber || otherRange.endLineNumber < range.startLineNumber) {
      return false;
    }
    if (otherRange.startLineNumber > range.endLineNumber || otherRange.endLineNumber > range.endLineNumber) {
      return false;
    }
    if (otherRange.startLineNumber === range.startLineNumber && otherRange.startColumn < range.startColumn) {
      return false;
    }
    if (otherRange.endLineNumber === range.endLineNumber && otherRange.endColumn > range.endColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if `range` is strictly in this range. `range` must start after and end before this range for the result to be true.
   */
  strictContainsRange(range) {
    return Range.strictContainsRange(this, range);
  }
  /**
   * Test if `otherRange` is strictly in `range` (must start after, and end before). If the ranges are equal, will return false.
   */
  static strictContainsRange(range, otherRange) {
    if (otherRange.startLineNumber < range.startLineNumber || otherRange.endLineNumber < range.startLineNumber) {
      return false;
    }
    if (otherRange.startLineNumber > range.endLineNumber || otherRange.endLineNumber > range.endLineNumber) {
      return false;
    }
    if (otherRange.startLineNumber === range.startLineNumber && otherRange.startColumn <= range.startColumn) {
      return false;
    }
    if (otherRange.endLineNumber === range.endLineNumber && otherRange.endColumn >= range.endColumn) {
      return false;
    }
    return true;
  }
  /**
   * A reunion of the two ranges.
   * The smallest position will be used as the start point, and the largest one as the end point.
   */
  plusRange(range) {
    return Range.plusRange(this, range);
  }
  /**
   * A reunion of the two ranges.
   * The smallest position will be used as the start point, and the largest one as the end point.
   */
  static plusRange(a, b) {
    let startLineNumber;
    let startColumn;
    let endLineNumber;
    let endColumn;
    if (b.startLineNumber < a.startLineNumber) {
      startLineNumber = b.startLineNumber;
      startColumn = b.startColumn;
    } else if (b.startLineNumber === a.startLineNumber) {
      startLineNumber = b.startLineNumber;
      startColumn = Math.min(b.startColumn, a.startColumn);
    } else {
      startLineNumber = a.startLineNumber;
      startColumn = a.startColumn;
    }
    if (b.endLineNumber > a.endLineNumber) {
      endLineNumber = b.endLineNumber;
      endColumn = b.endColumn;
    } else if (b.endLineNumber === a.endLineNumber) {
      endLineNumber = b.endLineNumber;
      endColumn = Math.max(b.endColumn, a.endColumn);
    } else {
      endLineNumber = a.endLineNumber;
      endColumn = a.endColumn;
    }
    return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
  }
  /**
   * A intersection of the two ranges.
   */
  intersectRanges(range) {
    return Range.intersectRanges(this, range);
  }
  /**
   * A intersection of the two ranges.
   */
  static intersectRanges(a, b) {
    let resultStartLineNumber = a.startLineNumber;
    let resultStartColumn = a.startColumn;
    let resultEndLineNumber = a.endLineNumber;
    let resultEndColumn = a.endColumn;
    const otherStartLineNumber = b.startLineNumber;
    const otherStartColumn = b.startColumn;
    const otherEndLineNumber = b.endLineNumber;
    const otherEndColumn = b.endColumn;
    if (resultStartLineNumber < otherStartLineNumber) {
      resultStartLineNumber = otherStartLineNumber;
      resultStartColumn = otherStartColumn;
    } else if (resultStartLineNumber === otherStartLineNumber) {
      resultStartColumn = Math.max(resultStartColumn, otherStartColumn);
    }
    if (resultEndLineNumber > otherEndLineNumber) {
      resultEndLineNumber = otherEndLineNumber;
      resultEndColumn = otherEndColumn;
    } else if (resultEndLineNumber === otherEndLineNumber) {
      resultEndColumn = Math.min(resultEndColumn, otherEndColumn);
    }
    if (resultStartLineNumber > resultEndLineNumber) {
      return null;
    }
    if (resultStartLineNumber === resultEndLineNumber && resultStartColumn > resultEndColumn) {
      return null;
    }
    return new Range(resultStartLineNumber, resultStartColumn, resultEndLineNumber, resultEndColumn);
  }
  /**
   * Test if this range equals other.
   */
  equalsRange(other) {
    return Range.equalsRange(this, other);
  }
  /**
   * Test if range `a` equals `b`.
   */
  static equalsRange(a, b) {
    if (!a && !b) {
      return true;
    }
    return !!a && !!b && a.startLineNumber === b.startLineNumber && a.startColumn === b.startColumn && a.endLineNumber === b.endLineNumber && a.endColumn === b.endColumn;
  }
  /**
   * Return the end position (which will be after or equal to the start position)
   */
  getEndPosition() {
    return Range.getEndPosition(this);
  }
  /**
   * Return the end position (which will be after or equal to the start position)
   */
  static getEndPosition(range) {
    return new Position(range.endLineNumber, range.endColumn);
  }
  /**
   * Return the start position (which will be before or equal to the end position)
   */
  getStartPosition() {
    return Range.getStartPosition(this);
  }
  /**
   * Return the start position (which will be before or equal to the end position)
   */
  static getStartPosition(range) {
    return new Position(range.startLineNumber, range.startColumn);
  }
  /**
   * Transform to a user presentable string representation.
   */
  toString() {
    return "[" + this.startLineNumber + "," + this.startColumn + " -> " + this.endLineNumber + "," + this.endColumn + "]";
  }
  /**
   * Create a new range using this range's start position, and using endLineNumber and endColumn as the end position.
   */
  setEndPosition(endLineNumber, endColumn) {
    return new Range(this.startLineNumber, this.startColumn, endLineNumber, endColumn);
  }
  /**
   * Create a new range using this range's end position, and using startLineNumber and startColumn as the start position.
   */
  setStartPosition(startLineNumber, startColumn) {
    return new Range(startLineNumber, startColumn, this.endLineNumber, this.endColumn);
  }
  /**
   * Create a new empty range using this range's start position.
   */
  collapseToStart() {
    return Range.collapseToStart(this);
  }
  /**
   * Create a new empty range using this range's start position.
   */
  static collapseToStart(range) {
    return new Range(range.startLineNumber, range.startColumn, range.startLineNumber, range.startColumn);
  }
  /**
   * Create a new empty range using this range's end position.
   */
  collapseToEnd() {
    return Range.collapseToEnd(this);
  }
  /**
   * Create a new empty range using this range's end position.
   */
  static collapseToEnd(range) {
    return new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn);
  }
  /**
   * Moves the range by the given amount of lines.
   */
  delta(lineCount) {
    return new Range(this.startLineNumber + lineCount, this.startColumn, this.endLineNumber + lineCount, this.endColumn);
  }
  /**
   * Test if this range starts and ends on the same line.
   */
  isSingleLine() {
    return this.startLineNumber === this.endLineNumber;
  }
  // ---
  static fromPositions(start, end = start) {
    return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }
  static lift(range) {
    if (!range) {
      return null;
    }
    return new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
  }
  /**
   * Test if `obj` is an `IRange`.
   */
  static isIRange(obj) {
    return !!obj && typeof obj.startLineNumber === "number" && typeof obj.startColumn === "number" && typeof obj.endLineNumber === "number" && typeof obj.endColumn === "number";
  }
  /**
   * Test if the two ranges are touching in any way.
   */
  static areIntersectingOrTouching(a, b) {
    if (a.endLineNumber < b.startLineNumber || a.endLineNumber === b.startLineNumber && a.endColumn < b.startColumn) {
      return false;
    }
    if (b.endLineNumber < a.startLineNumber || b.endLineNumber === a.startLineNumber && b.endColumn < a.startColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if the two ranges are intersecting. If the ranges are touching it returns true.
   */
  static areIntersecting(a, b) {
    if (a.endLineNumber < b.startLineNumber || a.endLineNumber === b.startLineNumber && a.endColumn <= b.startColumn) {
      return false;
    }
    if (b.endLineNumber < a.startLineNumber || b.endLineNumber === a.startLineNumber && b.endColumn <= a.startColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if the two ranges are intersecting, but not touching at all.
   */
  static areOnlyIntersecting(a, b) {
    if (a.endLineNumber < b.startLineNumber - 1 || a.endLineNumber === b.startLineNumber && a.endColumn < b.startColumn - 1) {
      return false;
    }
    if (b.endLineNumber < a.startLineNumber - 1 || b.endLineNumber === a.startLineNumber && b.endColumn < a.startColumn - 1) {
      return false;
    }
    return true;
  }
  /**
   * A function that compares ranges, useful for sorting ranges
   * It will first compare ranges on the startPosition and then on the endPosition
   */
  static compareRangesUsingStarts(a, b) {
    if (a && b) {
      const aStartLineNumber = a.startLineNumber | 0;
      const bStartLineNumber = b.startLineNumber | 0;
      if (aStartLineNumber === bStartLineNumber) {
        const aStartColumn = a.startColumn | 0;
        const bStartColumn = b.startColumn | 0;
        if (aStartColumn === bStartColumn) {
          const aEndLineNumber = a.endLineNumber | 0;
          const bEndLineNumber = b.endLineNumber | 0;
          if (aEndLineNumber === bEndLineNumber) {
            const aEndColumn = a.endColumn | 0;
            const bEndColumn = b.endColumn | 0;
            return aEndColumn - bEndColumn;
          }
          return aEndLineNumber - bEndLineNumber;
        }
        return aStartColumn - bStartColumn;
      }
      return aStartLineNumber - bStartLineNumber;
    }
    const aExists = a ? 1 : 0;
    const bExists = b ? 1 : 0;
    return aExists - bExists;
  }
  /**
   * A function that compares ranges, useful for sorting ranges
   * It will first compare ranges on the endPosition and then on the startPosition
   */
  static compareRangesUsingEnds(a, b) {
    if (a.endLineNumber === b.endLineNumber) {
      if (a.endColumn === b.endColumn) {
        if (a.startLineNumber === b.startLineNumber) {
          return a.startColumn - b.startColumn;
        }
        return a.startLineNumber - b.startLineNumber;
      }
      return a.endColumn - b.endColumn;
    }
    return a.endLineNumber - b.endLineNumber;
  }
  /**
   * Test if the range spans multiple lines.
   */
  static spansMultipleLines(range) {
    return range.endLineNumber > range.startLineNumber;
  }
  toJSON() {
    return this;
  }
}
export {
  Range
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29yZVxccmFuZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi9wb3NpdGlvbi5qcyc7XG5cbi8qKlxuICogQSByYW5nZSBpbiB0aGUgZWRpdG9yLiBUaGlzIGludGVyZmFjZSBpcyBzdWl0YWJsZSBmb3Igc2VyaWFsaXphdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUmFuZ2Uge1xuXHQvKipcblx0ICogTGluZSBudW1iZXIgb24gd2hpY2ggdGhlIHJhbmdlIHN0YXJ0cyAoc3RhcnRzIGF0IDEpLlxuXHQgKi9cblx0cmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb2x1bW4gb24gd2hpY2ggdGhlIHJhbmdlIHN0YXJ0cyBpbiBsaW5lIGBzdGFydExpbmVOdW1iZXJgIChzdGFydHMgYXQgMSkuXG5cdCAqL1xuXHRyZWFkb25seSBzdGFydENvbHVtbjogbnVtYmVyO1xuXHQvKipcblx0ICogTGluZSBudW1iZXIgb24gd2hpY2ggdGhlIHJhbmdlIGVuZHMuXG5cdCAqL1xuXHRyZWFkb25seSBlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb2x1bW4gb24gd2hpY2ggdGhlIHJhbmdlIGVuZHMgaW4gbGluZSBgZW5kTGluZU51bWJlcmAuXG5cdCAqL1xuXHRyZWFkb25seSBlbmRDb2x1bW46IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHJhbmdlIGluIHRoZSBlZGl0b3IuIChzdGFydExpbmVOdW1iZXIsc3RhcnRDb2x1bW4pIGlzIDw9IChlbmRMaW5lTnVtYmVyLGVuZENvbHVtbilcbiAqL1xuZXhwb3J0IGNsYXNzIFJhbmdlIHtcblxuXHQvKipcblx0ICogTGluZSBudW1iZXIgb24gd2hpY2ggdGhlIHJhbmdlIHN0YXJ0cyAoc3RhcnRzIGF0IDEpLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHQvKipcblx0ICogQ29sdW1uIG9uIHdoaWNoIHRoZSByYW5nZSBzdGFydHMgaW4gbGluZSBgc3RhcnRMaW5lTnVtYmVyYCAoc3RhcnRzIGF0IDEpLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBMaW5lIG51bWJlciBvbiB3aGljaCB0aGUgcmFuZ2UgZW5kcy5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb2x1bW4gb24gd2hpY2ggdGhlIHJhbmdlIGVuZHMgaW4gbGluZSBgZW5kTGluZU51bWJlcmAuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgZW5kQ29sdW1uOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3Ioc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIpIHtcblx0XHRpZiAoKHN0YXJ0TGluZU51bWJlciA+IGVuZExpbmVOdW1iZXIpIHx8IChzdGFydExpbmVOdW1iZXIgPT09IGVuZExpbmVOdW1iZXIgJiYgc3RhcnRDb2x1bW4gPiBlbmRDb2x1bW4pKSB7XG5cdFx0XHR0aGlzLnN0YXJ0TGluZU51bWJlciA9IGVuZExpbmVOdW1iZXI7XG5cdFx0XHR0aGlzLnN0YXJ0Q29sdW1uID0gZW5kQ29sdW1uO1xuXHRcdFx0dGhpcy5lbmRMaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0dGhpcy5lbmRDb2x1bW4gPSBzdGFydENvbHVtbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdGFydExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0XHR0aGlzLnN0YXJ0Q29sdW1uID0gc3RhcnRDb2x1bW47XG5cdFx0XHR0aGlzLmVuZExpbmVOdW1iZXIgPSBlbmRMaW5lTnVtYmVyO1xuXHRcdFx0dGhpcy5lbmRDb2x1bW4gPSBlbmRDb2x1bW47XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhpcyByYW5nZSBpcyBlbXB0eS5cblx0ICovXG5cdHB1YmxpYyBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBSYW5nZS5pc0VtcHR5KHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgYHJhbmdlYCBpcyBlbXB0eS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgaXNFbXB0eShyYW5nZTogSVJhbmdlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIgJiYgcmFuZ2Uuc3RhcnRDb2x1bW4gPT09IHJhbmdlLmVuZENvbHVtbik7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiBwb3NpdGlvbiBpcyBpbiB0aGlzIHJhbmdlLiBJZiB0aGUgcG9zaXRpb24gaXMgYXQgdGhlIGVkZ2VzLCB3aWxsIHJldHVybiB0cnVlLlxuXHQgKi9cblx0cHVibGljIGNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBSYW5nZS5jb250YWluc1Bvc2l0aW9uKHRoaXMsIHBvc2l0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIGBwb3NpdGlvbmAgaXMgaW4gYHJhbmdlYC4gSWYgdGhlIHBvc2l0aW9uIGlzIGF0IHRoZSBlZGdlcywgd2lsbCByZXR1cm4gdHJ1ZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY29udGFpbnNQb3NpdGlvbihyYW5nZTogSVJhbmdlLCBwb3NpdGlvbjogSVBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPCByYW5nZS5zdGFydExpbmVOdW1iZXIgfHwgcG9zaXRpb24ubGluZU51bWJlciA+IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPT09IHJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBwb3NpdGlvbi5jb2x1bW4gPCByYW5nZS5zdGFydENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA9PT0gcmFuZ2UuZW5kTGluZU51bWJlciAmJiBwb3NpdGlvbi5jb2x1bW4gPiByYW5nZS5lbmRDb2x1bW4pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiBgcG9zaXRpb25gIGlzIGluIGByYW5nZWAuIElmIHRoZSBwb3NpdGlvbiBpcyBhdCB0aGUgZWRnZXMsIHdpbGwgcmV0dXJuIGZhbHNlLlxuXHQgKiBAaW50ZXJuYWxcblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgc3RyaWN0Q29udGFpbnNQb3NpdGlvbihyYW5nZTogSVJhbmdlLCBwb3NpdGlvbjogSVBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPCByYW5nZS5zdGFydExpbmVOdW1iZXIgfHwgcG9zaXRpb24ubGluZU51bWJlciA+IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPT09IHJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBwb3NpdGlvbi5jb2x1bW4gPD0gcmFuZ2Uuc3RhcnRDb2x1bW4pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIgJiYgcG9zaXRpb24uY29sdW1uID49IHJhbmdlLmVuZENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHJhbmdlIGlzIGluIHRoaXMgcmFuZ2UuIElmIHRoZSByYW5nZSBpcyBlcXVhbCB0byB0aGlzIHJhbmdlLCB3aWxsIHJldHVybiB0cnVlLlxuXHQgKi9cblx0cHVibGljIGNvbnRhaW5zUmFuZ2UocmFuZ2U6IElSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBSYW5nZS5jb250YWluc1JhbmdlKHRoaXMsIHJhbmdlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIGBvdGhlclJhbmdlYCBpcyBpbiBgcmFuZ2VgLiBJZiB0aGUgcmFuZ2VzIGFyZSBlcXVhbCwgd2lsbCByZXR1cm4gdHJ1ZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY29udGFpbnNSYW5nZShyYW5nZTogSVJhbmdlLCBvdGhlclJhbmdlOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXJSYW5nZS5zdGFydExpbmVOdW1iZXIgPCByYW5nZS5zdGFydExpbmVOdW1iZXIgfHwgb3RoZXJSYW5nZS5lbmRMaW5lTnVtYmVyIDwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChvdGhlclJhbmdlLnN0YXJ0TGluZU51bWJlciA+IHJhbmdlLmVuZExpbmVOdW1iZXIgfHwgb3RoZXJSYW5nZS5lbmRMaW5lTnVtYmVyID4gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAob3RoZXJSYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBvdGhlclJhbmdlLnN0YXJ0Q29sdW1uIDwgcmFuZ2Uuc3RhcnRDb2x1bW4pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKG90aGVyUmFuZ2UuZW5kTGluZU51bWJlciA9PT0gcmFuZ2UuZW5kTGluZU51bWJlciAmJiBvdGhlclJhbmdlLmVuZENvbHVtbiA+IHJhbmdlLmVuZENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIGByYW5nZWAgaXMgc3RyaWN0bHkgaW4gdGhpcyByYW5nZS4gYHJhbmdlYCBtdXN0IHN0YXJ0IGFmdGVyIGFuZCBlbmQgYmVmb3JlIHRoaXMgcmFuZ2UgZm9yIHRoZSByZXN1bHQgdG8gYmUgdHJ1ZS5cblx0ICovXG5cdHB1YmxpYyBzdHJpY3RDb250YWluc1JhbmdlKHJhbmdlOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gUmFuZ2Uuc3RyaWN0Q29udGFpbnNSYW5nZSh0aGlzLCByYW5nZSk7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiBgb3RoZXJSYW5nZWAgaXMgc3RyaWN0bHkgaW4gYHJhbmdlYCAobXVzdCBzdGFydCBhZnRlciwgYW5kIGVuZCBiZWZvcmUpLiBJZiB0aGUgcmFuZ2VzIGFyZSBlcXVhbCwgd2lsbCByZXR1cm4gZmFsc2UuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHN0cmljdENvbnRhaW5zUmFuZ2UocmFuZ2U6IElSYW5nZSwgb3RoZXJSYW5nZTogSVJhbmdlKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIHx8IG90aGVyUmFuZ2UuZW5kTGluZU51bWJlciA8IHJhbmdlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAob3RoZXJSYW5nZS5zdGFydExpbmVOdW1iZXIgPiByYW5nZS5lbmRMaW5lTnVtYmVyIHx8IG90aGVyUmFuZ2UuZW5kTGluZU51bWJlciA+IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKG90aGVyUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSByYW5nZS5zdGFydExpbmVOdW1iZXIgJiYgb3RoZXJSYW5nZS5zdGFydENvbHVtbiA8PSByYW5nZS5zdGFydENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAob3RoZXJSYW5nZS5lbmRMaW5lTnVtYmVyID09PSByYW5nZS5lbmRMaW5lTnVtYmVyICYmIG90aGVyUmFuZ2UuZW5kQ29sdW1uID49IHJhbmdlLmVuZENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHJldW5pb24gb2YgdGhlIHR3byByYW5nZXMuXG5cdCAqIFRoZSBzbWFsbGVzdCBwb3NpdGlvbiB3aWxsIGJlIHVzZWQgYXMgdGhlIHN0YXJ0IHBvaW50LCBhbmQgdGhlIGxhcmdlc3Qgb25lIGFzIHRoZSBlbmQgcG9pbnQuXG5cdCAqL1xuXHRwdWJsaWMgcGx1c1JhbmdlKHJhbmdlOiBJUmFuZ2UpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIFJhbmdlLnBsdXNSYW5nZSh0aGlzLCByYW5nZSk7XG5cdH1cblxuXHQvKipcblx0ICogQSByZXVuaW9uIG9mIHRoZSB0d28gcmFuZ2VzLlxuXHQgKiBUaGUgc21hbGxlc3QgcG9zaXRpb24gd2lsbCBiZSB1c2VkIGFzIHRoZSBzdGFydCBwb2ludCwgYW5kIHRoZSBsYXJnZXN0IG9uZSBhcyB0aGUgZW5kIHBvaW50LlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBwbHVzUmFuZ2UoYTogSVJhbmdlLCBiOiBJUmFuZ2UpOiBSYW5nZSB7XG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRcdGxldCBzdGFydENvbHVtbjogbnVtYmVyO1xuXHRcdGxldCBlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0bGV0IGVuZENvbHVtbjogbnVtYmVyO1xuXG5cdFx0aWYgKGIuc3RhcnRMaW5lTnVtYmVyIDwgYS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlciA9IGIuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0c3RhcnRDb2x1bW4gPSBiLnN0YXJ0Q29sdW1uO1xuXHRcdH0gZWxzZSBpZiAoYi5zdGFydExpbmVOdW1iZXIgPT09IGEuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXIgPSBiLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdHN0YXJ0Q29sdW1uID0gTWF0aC5taW4oYi5zdGFydENvbHVtbiwgYS5zdGFydENvbHVtbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlciA9IGEuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0c3RhcnRDb2x1bW4gPSBhLnN0YXJ0Q29sdW1uO1xuXHRcdH1cblxuXHRcdGlmIChiLmVuZExpbmVOdW1iZXIgPiBhLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdGVuZExpbmVOdW1iZXIgPSBiLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRlbmRDb2x1bW4gPSBiLmVuZENvbHVtbjtcblx0XHR9IGVsc2UgaWYgKGIuZW5kTGluZU51bWJlciA9PT0gYS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRlbmRMaW5lTnVtYmVyID0gYi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0ZW5kQ29sdW1uID0gTWF0aC5tYXgoYi5lbmRDb2x1bW4sIGEuZW5kQ29sdW1uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZW5kTGluZU51bWJlciA9IGEuZW5kTGluZU51bWJlcjtcblx0XHRcdGVuZENvbHVtbiA9IGEuZW5kQ29sdW1uO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGludGVyc2VjdGlvbiBvZiB0aGUgdHdvIHJhbmdlcy5cblx0ICovXG5cdHB1YmxpYyBpbnRlcnNlY3RSYW5nZXMocmFuZ2U6IElSYW5nZSk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0cmV0dXJuIFJhbmdlLmludGVyc2VjdFJhbmdlcyh0aGlzLCByYW5nZSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBpbnRlcnNlY3Rpb24gb2YgdGhlIHR3byByYW5nZXMuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGludGVyc2VjdFJhbmdlcyhhOiBJUmFuZ2UsIGI6IElSYW5nZSk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0bGV0IHJlc3VsdFN0YXJ0TGluZU51bWJlciA9IGEuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGxldCByZXN1bHRTdGFydENvbHVtbiA9IGEuc3RhcnRDb2x1bW47XG5cdFx0bGV0IHJlc3VsdEVuZExpbmVOdW1iZXIgPSBhLmVuZExpbmVOdW1iZXI7XG5cdFx0bGV0IHJlc3VsdEVuZENvbHVtbiA9IGEuZW5kQ29sdW1uO1xuXHRcdGNvbnN0IG90aGVyU3RhcnRMaW5lTnVtYmVyID0gYi5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgb3RoZXJTdGFydENvbHVtbiA9IGIuc3RhcnRDb2x1bW47XG5cdFx0Y29uc3Qgb3RoZXJFbmRMaW5lTnVtYmVyID0gYi5lbmRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IG90aGVyRW5kQ29sdW1uID0gYi5lbmRDb2x1bW47XG5cblx0XHRpZiAocmVzdWx0U3RhcnRMaW5lTnVtYmVyIDwgb3RoZXJTdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHJlc3VsdFN0YXJ0TGluZU51bWJlciA9IG90aGVyU3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0cmVzdWx0U3RhcnRDb2x1bW4gPSBvdGhlclN0YXJ0Q29sdW1uO1xuXHRcdH0gZWxzZSBpZiAocmVzdWx0U3RhcnRMaW5lTnVtYmVyID09PSBvdGhlclN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0cmVzdWx0U3RhcnRDb2x1bW4gPSBNYXRoLm1heChyZXN1bHRTdGFydENvbHVtbiwgb3RoZXJTdGFydENvbHVtbik7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3VsdEVuZExpbmVOdW1iZXIgPiBvdGhlckVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJlc3VsdEVuZExpbmVOdW1iZXIgPSBvdGhlckVuZExpbmVOdW1iZXI7XG5cdFx0XHRyZXN1bHRFbmRDb2x1bW4gPSBvdGhlckVuZENvbHVtbjtcblx0XHR9IGVsc2UgaWYgKHJlc3VsdEVuZExpbmVOdW1iZXIgPT09IG90aGVyRW5kTGluZU51bWJlcikge1xuXHRcdFx0cmVzdWx0RW5kQ29sdW1uID0gTWF0aC5taW4ocmVzdWx0RW5kQ29sdW1uLCBvdGhlckVuZENvbHVtbik7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgc2VsZWN0aW9uIGlzIG5vdyBlbXB0eVxuXHRcdGlmIChyZXN1bHRTdGFydExpbmVOdW1iZXIgPiByZXN1bHRFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdFN0YXJ0TGluZU51bWJlciA9PT0gcmVzdWx0RW5kTGluZU51bWJlciAmJiByZXN1bHRTdGFydENvbHVtbiA+IHJlc3VsdEVuZENvbHVtbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmFuZ2UocmVzdWx0U3RhcnRMaW5lTnVtYmVyLCByZXN1bHRTdGFydENvbHVtbiwgcmVzdWx0RW5kTGluZU51bWJlciwgcmVzdWx0RW5kQ29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHRoaXMgcmFuZ2UgZXF1YWxzIG90aGVyLlxuXHQgKi9cblx0cHVibGljIGVxdWFsc1JhbmdlKG90aGVyOiBJUmFuZ2UgfCBudWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIFJhbmdlLmVxdWFsc1JhbmdlKHRoaXMsIG90aGVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHJhbmdlIGBhYCBlcXVhbHMgYGJgLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBlcXVhbHNSYW5nZShhOiBJUmFuZ2UgfCBudWxsIHwgdW5kZWZpbmVkLCBiOiBJUmFuZ2UgfCBudWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFhICYmICFiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIChcblx0XHRcdCEhYSAmJlxuXHRcdFx0ISFiICYmXG5cdFx0XHRhLnN0YXJ0TGluZU51bWJlciA9PT0gYi5zdGFydExpbmVOdW1iZXIgJiZcblx0XHRcdGEuc3RhcnRDb2x1bW4gPT09IGIuc3RhcnRDb2x1bW4gJiZcblx0XHRcdGEuZW5kTGluZU51bWJlciA9PT0gYi5lbmRMaW5lTnVtYmVyICYmXG5cdFx0XHRhLmVuZENvbHVtbiA9PT0gYi5lbmRDb2x1bW5cblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgZW5kIHBvc2l0aW9uICh3aGljaCB3aWxsIGJlIGFmdGVyIG9yIGVxdWFsIHRvIHRoZSBzdGFydCBwb3NpdGlvbilcblx0ICovXG5cdHB1YmxpYyBnZXRFbmRQb3NpdGlvbigpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIFJhbmdlLmdldEVuZFBvc2l0aW9uKHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgZW5kIHBvc2l0aW9uICh3aGljaCB3aWxsIGJlIGFmdGVyIG9yIGVxdWFsIHRvIHRoZSBzdGFydCBwb3NpdGlvbilcblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RW5kUG9zaXRpb24ocmFuZ2U6IElSYW5nZSk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBzdGFydCBwb3NpdGlvbiAod2hpY2ggd2lsbCBiZSBiZWZvcmUgb3IgZXF1YWwgdG8gdGhlIGVuZCBwb3NpdGlvbilcblx0ICovXG5cdHB1YmxpYyBnZXRTdGFydFBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbih0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIHN0YXJ0IHBvc2l0aW9uICh3aGljaCB3aWxsIGJlIGJlZm9yZSBvciBlcXVhbCB0byB0aGUgZW5kIHBvc2l0aW9uKVxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBnZXRTdGFydFBvc2l0aW9uKHJhbmdlOiBJUmFuZ2UpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2Zvcm0gdG8gYSB1c2VyIHByZXNlbnRhYmxlIHN0cmluZyByZXByZXNlbnRhdGlvbi5cblx0ICovXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnWycgKyB0aGlzLnN0YXJ0TGluZU51bWJlciArICcsJyArIHRoaXMuc3RhcnRDb2x1bW4gKyAnIC0+ICcgKyB0aGlzLmVuZExpbmVOdW1iZXIgKyAnLCcgKyB0aGlzLmVuZENvbHVtbiArICddJztcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgcmFuZ2UgdXNpbmcgdGhpcyByYW5nZSdzIHN0YXJ0IHBvc2l0aW9uLCBhbmQgdXNpbmcgZW5kTGluZU51bWJlciBhbmQgZW5kQ29sdW1uIGFzIHRoZSBlbmQgcG9zaXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgc2V0RW5kUG9zaXRpb24oZW5kTGluZU51bWJlcjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlcik6IFJhbmdlIHtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHRoaXMuc3RhcnRMaW5lTnVtYmVyLCB0aGlzLnN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyByYW5nZSB1c2luZyB0aGlzIHJhbmdlJ3MgZW5kIHBvc2l0aW9uLCBhbmQgdXNpbmcgc3RhcnRMaW5lTnVtYmVyIGFuZCBzdGFydENvbHVtbiBhcyB0aGUgc3RhcnQgcG9zaXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgc2V0U3RhcnRQb3NpdGlvbihzdGFydExpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlcik6IFJhbmdlIHtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHRoaXMuZW5kTGluZU51bWJlciwgdGhpcy5lbmRDb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyBlbXB0eSByYW5nZSB1c2luZyB0aGlzIHJhbmdlJ3Mgc3RhcnQgcG9zaXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgY29sbGFwc2VUb1N0YXJ0KCk6IFJhbmdlIHtcblx0XHRyZXR1cm4gUmFuZ2UuY29sbGFwc2VUb1N0YXJ0KHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyBlbXB0eSByYW5nZSB1c2luZyB0aGlzIHJhbmdlJ3Mgc3RhcnQgcG9zaXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGNvbGxhcHNlVG9TdGFydChyYW5nZTogSVJhbmdlKTogUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbik7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IGVtcHR5IHJhbmdlIHVzaW5nIHRoaXMgcmFuZ2UncyBlbmQgcG9zaXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgY29sbGFwc2VUb0VuZCgpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIFJhbmdlLmNvbGxhcHNlVG9FbmQodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IGVtcHR5IHJhbmdlIHVzaW5nIHRoaXMgcmFuZ2UncyBlbmQgcG9zaXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGNvbGxhcHNlVG9FbmQocmFuZ2U6IElSYW5nZSk6IFJhbmdlIHtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlcyB0aGUgcmFuZ2UgYnkgdGhlIGdpdmVuIGFtb3VudCBvZiBsaW5lcy5cblx0ICovXG5cdHB1YmxpYyBkZWx0YShsaW5lQ291bnQ6IG51bWJlcik6IFJhbmdlIHtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHRoaXMuc3RhcnRMaW5lTnVtYmVyICsgbGluZUNvdW50LCB0aGlzLnN0YXJ0Q29sdW1uLCB0aGlzLmVuZExpbmVOdW1iZXIgKyBsaW5lQ291bnQsIHRoaXMuZW5kQ29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHRoaXMgcmFuZ2Ugc3RhcnRzIGFuZCBlbmRzIG9uIHRoZSBzYW1lIGxpbmUuXG5cdCAqL1xuXHRwdWJsaWMgaXNTaW5nbGVMaW5lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXJ0TGluZU51bWJlciA9PT0gdGhpcy5lbmRMaW5lTnVtYmVyO1xuXHR9XG5cblx0Ly8gLS0tXG5cblx0cHVibGljIHN0YXRpYyBmcm9tUG9zaXRpb25zKHN0YXJ0OiBJUG9zaXRpb24sIGVuZDogSVBvc2l0aW9uID0gc3RhcnQpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydC5saW5lTnVtYmVyLCBzdGFydC5jb2x1bW4sIGVuZC5saW5lTnVtYmVyLCBlbmQuY29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBgUmFuZ2VgIGZyb20gYW4gYElSYW5nZWAuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGxpZnQocmFuZ2U6IHVuZGVmaW5lZCB8IG51bGwpOiBudWxsO1xuXHRwdWJsaWMgc3RhdGljIGxpZnQocmFuZ2U6IElSYW5nZSk6IFJhbmdlO1xuXHRwdWJsaWMgc3RhdGljIGxpZnQocmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCB8IG51bGwpOiBSYW5nZSB8IG51bGw7XG5cdHB1YmxpYyBzdGF0aWMgbGlmdChyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkIHwgbnVsbCk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIGBvYmpgIGlzIGFuIGBJUmFuZ2VgLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBpc0lSYW5nZShvYmo6IHVua25vd24pOiBvYmogaXMgSVJhbmdlIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0ISFvYmpcblx0XHRcdCYmICh0eXBlb2YgKG9iaiBhcyBJUmFuZ2UpLnN0YXJ0TGluZU51bWJlciA9PT0gJ251bWJlcicpXG5cdFx0XHQmJiAodHlwZW9mIChvYmogYXMgSVJhbmdlKS5zdGFydENvbHVtbiA9PT0gJ251bWJlcicpXG5cdFx0XHQmJiAodHlwZW9mIChvYmogYXMgSVJhbmdlKS5lbmRMaW5lTnVtYmVyID09PSAnbnVtYmVyJylcblx0XHRcdCYmICh0eXBlb2YgKG9iaiBhcyBJUmFuZ2UpLmVuZENvbHVtbiA9PT0gJ251bWJlcicpXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHRoZSB0d28gcmFuZ2VzIGFyZSB0b3VjaGluZyBpbiBhbnkgd2F5LlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBhcmVJbnRlcnNlY3RpbmdPclRvdWNoaW5nKGE6IElSYW5nZSwgYjogSVJhbmdlKTogYm9vbGVhbiB7XG5cdFx0Ly8gQ2hlY2sgaWYgYGFgIGlzIGJlZm9yZSBgYmBcblx0XHRpZiAoYS5lbmRMaW5lTnVtYmVyIDwgYi5zdGFydExpbmVOdW1iZXIgfHwgKGEuZW5kTGluZU51bWJlciA9PT0gYi5zdGFydExpbmVOdW1iZXIgJiYgYS5lbmRDb2x1bW4gPCBiLnN0YXJ0Q29sdW1uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGBiYCBpcyBiZWZvcmUgYGFgXG5cdFx0aWYgKGIuZW5kTGluZU51bWJlciA8IGEuc3RhcnRMaW5lTnVtYmVyIHx8IChiLmVuZExpbmVOdW1iZXIgPT09IGEuc3RhcnRMaW5lTnVtYmVyICYmIGIuZW5kQ29sdW1uIDwgYS5zdGFydENvbHVtbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBUaGVzZSByYW5nZXMgbXVzdCBpbnRlcnNlY3Rcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHRoZSB0d28gcmFuZ2VzIGFyZSBpbnRlcnNlY3RpbmcuIElmIHRoZSByYW5nZXMgYXJlIHRvdWNoaW5nIGl0IHJldHVybnMgdHJ1ZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgYXJlSW50ZXJzZWN0aW5nKGE6IElSYW5nZSwgYjogSVJhbmdlKTogYm9vbGVhbiB7XG5cdFx0Ly8gQ2hlY2sgaWYgYGFgIGlzIGJlZm9yZSBgYmBcblx0XHRpZiAoYS5lbmRMaW5lTnVtYmVyIDwgYi5zdGFydExpbmVOdW1iZXIgfHwgKGEuZW5kTGluZU51bWJlciA9PT0gYi5zdGFydExpbmVOdW1iZXIgJiYgYS5lbmRDb2x1bW4gPD0gYi5zdGFydENvbHVtbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBgYmAgaXMgYmVmb3JlIGBhYFxuXHRcdGlmIChiLmVuZExpbmVOdW1iZXIgPCBhLnN0YXJ0TGluZU51bWJlciB8fCAoYi5lbmRMaW5lTnVtYmVyID09PSBhLnN0YXJ0TGluZU51bWJlciAmJiBiLmVuZENvbHVtbiA8PSBhLnN0YXJ0Q29sdW1uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFRoZXNlIHJhbmdlcyBtdXN0IGludGVyc2VjdFxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhlIHR3byByYW5nZXMgYXJlIGludGVyc2VjdGluZywgYnV0IG5vdCB0b3VjaGluZyBhdCBhbGwuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGFyZU9ubHlJbnRlcnNlY3RpbmcoYTogSVJhbmdlLCBiOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0XHQvLyBDaGVjayBpZiBgYWAgaXMgYmVmb3JlIGBiYFxuXHRcdGlmIChhLmVuZExpbmVOdW1iZXIgPCAoYi5zdGFydExpbmVOdW1iZXIgLSAxKSB8fCAoYS5lbmRMaW5lTnVtYmVyID09PSBiLnN0YXJ0TGluZU51bWJlciAmJiBhLmVuZENvbHVtbiA8IChiLnN0YXJ0Q29sdW1uIC0gMSkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgYGJgIGlzIGJlZm9yZSBgYWBcblx0XHRpZiAoYi5lbmRMaW5lTnVtYmVyIDwgKGEuc3RhcnRMaW5lTnVtYmVyIC0gMSkgfHwgKGIuZW5kTGluZU51bWJlciA9PT0gYS5zdGFydExpbmVOdW1iZXIgJiYgYi5lbmRDb2x1bW4gPCAoYS5zdGFydENvbHVtbiAtIDEpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFRoZXNlIHJhbmdlcyBtdXN0IGludGVyc2VjdFxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZnVuY3Rpb24gdGhhdCBjb21wYXJlcyByYW5nZXMsIHVzZWZ1bCBmb3Igc29ydGluZyByYW5nZXNcblx0ICogSXQgd2lsbCBmaXJzdCBjb21wYXJlIHJhbmdlcyBvbiB0aGUgc3RhcnRQb3NpdGlvbiBhbmQgdGhlbiBvbiB0aGUgZW5kUG9zaXRpb25cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGE6IElSYW5nZSB8IG51bGwgfCB1bmRlZmluZWQsIGI6IElSYW5nZSB8IG51bGwgfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRcdGlmIChhICYmIGIpIHtcblx0XHRcdGNvbnN0IGFTdGFydExpbmVOdW1iZXIgPSBhLnN0YXJ0TGluZU51bWJlciB8IDA7XG5cdFx0XHRjb25zdCBiU3RhcnRMaW5lTnVtYmVyID0gYi5zdGFydExpbmVOdW1iZXIgfCAwO1xuXG5cdFx0XHRpZiAoYVN0YXJ0TGluZU51bWJlciA9PT0gYlN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRjb25zdCBhU3RhcnRDb2x1bW4gPSBhLnN0YXJ0Q29sdW1uIHwgMDtcblx0XHRcdFx0Y29uc3QgYlN0YXJ0Q29sdW1uID0gYi5zdGFydENvbHVtbiB8IDA7XG5cblx0XHRcdFx0aWYgKGFTdGFydENvbHVtbiA9PT0gYlN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYUVuZExpbmVOdW1iZXIgPSBhLmVuZExpbmVOdW1iZXIgfCAwO1xuXHRcdFx0XHRcdGNvbnN0IGJFbmRMaW5lTnVtYmVyID0gYi5lbmRMaW5lTnVtYmVyIHwgMDtcblxuXHRcdFx0XHRcdGlmIChhRW5kTGluZU51bWJlciA9PT0gYkVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFFbmRDb2x1bW4gPSBhLmVuZENvbHVtbiB8IDA7XG5cdFx0XHRcdFx0XHRjb25zdCBiRW5kQ29sdW1uID0gYi5lbmRDb2x1bW4gfCAwO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFFbmRDb2x1bW4gLSBiRW5kQ29sdW1uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYUVuZExpbmVOdW1iZXIgLSBiRW5kTGluZU51bWJlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYVN0YXJ0Q29sdW1uIC0gYlN0YXJ0Q29sdW1uO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGFTdGFydExpbmVOdW1iZXIgLSBiU3RhcnRMaW5lTnVtYmVyO1xuXHRcdH1cblx0XHRjb25zdCBhRXhpc3RzID0gKGEgPyAxIDogMCk7XG5cdFx0Y29uc3QgYkV4aXN0cyA9IChiID8gMSA6IDApO1xuXHRcdHJldHVybiBhRXhpc3RzIC0gYkV4aXN0cztcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGZ1bmN0aW9uIHRoYXQgY29tcGFyZXMgcmFuZ2VzLCB1c2VmdWwgZm9yIHNvcnRpbmcgcmFuZ2VzXG5cdCAqIEl0IHdpbGwgZmlyc3QgY29tcGFyZSByYW5nZXMgb24gdGhlIGVuZFBvc2l0aW9uIGFuZCB0aGVuIG9uIHRoZSBzdGFydFBvc2l0aW9uXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGNvbXBhcmVSYW5nZXNVc2luZ0VuZHMoYTogSVJhbmdlLCBiOiBJUmFuZ2UpOiBudW1iZXIge1xuXHRcdGlmIChhLmVuZExpbmVOdW1iZXIgPT09IGIuZW5kTGluZU51bWJlcikge1xuXHRcdFx0aWYgKGEuZW5kQ29sdW1uID09PSBiLmVuZENvbHVtbikge1xuXHRcdFx0XHRpZiAoYS5zdGFydExpbmVOdW1iZXIgPT09IGIuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGEuc3RhcnRDb2x1bW4gLSBiLnN0YXJ0Q29sdW1uO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhLnN0YXJ0TGluZU51bWJlciAtIGIuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGEuZW5kQ29sdW1uIC0gYi5lbmRDb2x1bW47XG5cdFx0fVxuXHRcdHJldHVybiBhLmVuZExpbmVOdW1iZXIgLSBiLmVuZExpbmVOdW1iZXI7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiB0aGUgcmFuZ2Ugc3BhbnMgbXVsdGlwbGUgbGluZXMuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHNwYW5zTXVsdGlwbGVMaW5lcyhyYW5nZTogSVJhbmdlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHJhbmdlLmVuZExpbmVOdW1iZXIgPiByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdH1cblxuXHRwdWJsaWMgdG9KU09OKCk6IElSYW5nZSB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQW9CLGdCQUFnQjtBQTJCN0IsTUFBTSxNQUFNO0FBQUEsRUFtQmxCLFlBQVksaUJBQXlCLGFBQXFCLGVBQXVCLFdBQW1CO0FBQ25HLFFBQUssa0JBQWtCLGlCQUFtQixvQkFBb0IsaUJBQWlCLGNBQWMsV0FBWTtBQUN4RyxXQUFLLGtCQUFrQjtBQUN2QixXQUFLLGNBQWM7QUFDbkIsV0FBSyxnQkFBZ0I7QUFDckIsV0FBSyxZQUFZO0FBQUEsSUFDbEIsT0FBTztBQUNOLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssY0FBYztBQUNuQixXQUFLLGdCQUFnQjtBQUNyQixXQUFLLFlBQVk7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLFVBQW1CO0FBQ3pCLFdBQU8sTUFBTSxRQUFRLElBQUk7QUFBQSxFQUMxQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBYyxRQUFRLE9BQXdCO0FBQzdDLFdBQVEsTUFBTSxvQkFBb0IsTUFBTSxpQkFBaUIsTUFBTSxnQkFBZ0IsTUFBTTtBQUFBLEVBQ3RGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxpQkFBaUIsVUFBOEI7QUFDckQsV0FBTyxN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
