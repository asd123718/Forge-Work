class Position {
  constructor(lineNumber, column) {
    this.lineNumber = lineNumber;
    this.column = column;
  }
  /**
   * Create a new position from this position.
   *
   * @param newLineNumber new line number
   * @param newColumn new column
   */
  with(newLineNumber = this.lineNumber, newColumn = this.column) {
    if (newLineNumber === this.lineNumber && newColumn === this.column) {
      return this;
    } else {
      return new Position(newLineNumber, newColumn);
    }
  }
  /**
   * Derive a new position from this position.
   *
   * @param deltaLineNumber line number delta
   * @param deltaColumn column delta
   */
  delta(deltaLineNumber = 0, deltaColumn = 0) {
    return this.with(Math.max(1, this.lineNumber + deltaLineNumber), Math.max(1, this.column + deltaColumn));
  }
  /**
   * Test if this position equals other position
   */
  equals(other) {
    return Position.equals(this, other);
  }
  /**
   * Test if position `a` equals position `b`
   */
  static equals(a, b) {
    if (!a && !b) {
      return true;
    }
    return !!a && !!b && a.lineNumber === b.lineNumber && a.column === b.column;
  }
  /**
   * Test if this position is before other position.
   * If the two positions are equal, the result will be false.
   */
  isBefore(other) {
    return Position.isBefore(this, other);
  }
  /**
   * Test if position `a` is before position `b`.
   * If the two positions are equal, the result will be false.
   */
  static isBefore(a, b) {
    if (a.lineNumber < b.lineNumber) {
      return true;
    }
    if (b.lineNumber < a.lineNumber) {
      return false;
    }
    return a.column < b.column;
  }
  /**
   * Test if this position is before other position.
   * If the two positions are equal, the result will be true.
   */
  isBeforeOrEqual(other) {
    return Position.isBeforeOrEqual(this, other);
  }
  /**
   * Test if position `a` is before position `b`.
   * If the two positions are equal, the result will be true.
   */
  static isBeforeOrEqual(a, b) {
    if (a.lineNumber < b.lineNumber) {
      return true;
    }
    if (b.lineNumber < a.lineNumber) {
      return false;
    }
    return a.column <= b.column;
  }
  /**
   * A function that compares positions, useful for sorting
   */
  static compare(a, b) {
    const aLineNumber = a.lineNumber | 0;
    const bLineNumber = b.lineNumber | 0;
    if (aLineNumber === bLineNumber) {
      const aColumn = a.column | 0;
      const bColumn = b.column | 0;
      return aColumn - bColumn;
    }
    return aLineNumber - bLineNumber;
  }
  /**
   * Clone this position.
   */
  clone() {
    return new Position(this.lineNumber, this.column);
  }
  /**
   * Convert to a human-readable representation.
   */
  toString() {
    return "(" + this.lineNumber + "," + this.column + ")";
  }
  // ---
  /**
   * Create a `Position` from an `IPosition`.
   */
  static lift(pos) {
    return new Position(pos.lineNumber, pos.column);
  }
  /**
   * Test if `obj` is an `IPosition`.
   */
  static isIPosition(obj) {
    return !!obj && typeof obj.lineNumber === "number" && typeof obj.column === "number";
  }
  toJSON() {
    return {
      lineNumber: this.lineNumber,
      column: this.column
    };
  }
}
export {
  Position
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29yZVxccG9zaXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIEEgcG9zaXRpb24gaW4gdGhlIGVkaXRvci4gVGhpcyBpbnRlcmZhY2UgaXMgc3VpdGFibGUgZm9yIHNlcmlhbGl6YXRpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBvc2l0aW9uIHtcblx0LyoqXG5cdCAqIGxpbmUgbnVtYmVyIChzdGFydHMgYXQgMSlcblx0ICovXG5cdHJlYWRvbmx5IGxpbmVOdW1iZXI6IG51bWJlcjtcblx0LyoqXG5cdCAqIGNvbHVtbiAodGhlIGZpcnN0IGNoYXJhY3RlciBpbiBhIGxpbmUgaXMgYmV0d2VlbiBjb2x1bW4gMSBhbmQgY29sdW1uIDIpXG5cdCAqL1xuXHRyZWFkb25seSBjb2x1bW46IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHBvc2l0aW9uIGluIHRoZSBlZGl0b3IuXG4gKi9cbmV4cG9ydCBjbGFzcyBQb3NpdGlvbiB7XG5cdC8qKlxuXHQgKiBsaW5lIG51bWJlciAoc3RhcnRzIGF0IDEpXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyO1xuXHQvKipcblx0ICogY29sdW1uICh0aGUgZmlyc3QgY2hhcmFjdGVyIGluIGEgbGluZSBpcyBiZXR3ZWVuIGNvbHVtbiAxIGFuZCBjb2x1bW4gMilcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBjb2x1bW46IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSB7XG5cdFx0dGhpcy5saW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHR0aGlzLmNvbHVtbiA9IGNvbHVtbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgcG9zaXRpb24gZnJvbSB0aGlzIHBvc2l0aW9uLlxuXHQgKlxuXHQgKiBAcGFyYW0gbmV3TGluZU51bWJlciBuZXcgbGluZSBudW1iZXJcblx0ICogQHBhcmFtIG5ld0NvbHVtbiBuZXcgY29sdW1uXG5cdCAqL1xuXHR3aXRoKG5ld0xpbmVOdW1iZXI6IG51bWJlciA9IHRoaXMubGluZU51bWJlciwgbmV3Q29sdW1uOiBudW1iZXIgPSB0aGlzLmNvbHVtbik6IFBvc2l0aW9uIHtcblx0XHRpZiAobmV3TGluZU51bWJlciA9PT0gdGhpcy5saW5lTnVtYmVyICYmIG5ld0NvbHVtbiA9PT0gdGhpcy5jb2x1bW4pIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKG5ld0xpbmVOdW1iZXIsIG5ld0NvbHVtbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERlcml2ZSBhIG5ldyBwb3NpdGlvbiBmcm9tIHRoaXMgcG9zaXRpb24uXG5cdCAqXG5cdCAqIEBwYXJhbSBkZWx0YUxpbmVOdW1iZXIgbGluZSBudW1iZXIgZGVsdGFcblx0ICogQHBhcmFtIGRlbHRhQ29sdW1uIGNvbHVtbiBkZWx0YVxuXHQgKi9cblx0ZGVsdGEoZGVsdGFMaW5lTnVtYmVyOiBudW1iZXIgPSAwLCBkZWx0YUNvbHVtbjogbnVtYmVyID0gMCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy53aXRoKE1hdGgubWF4KDEsIHRoaXMubGluZU51bWJlciArIGRlbHRhTGluZU51bWJlciksIE1hdGgubWF4KDEsIHRoaXMuY29sdW1uICsgZGVsdGFDb2x1bW4pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHRoaXMgcG9zaXRpb24gZXF1YWxzIG90aGVyIHBvc2l0aW9uXG5cdCAqL1xuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBJUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gUG9zaXRpb24uZXF1YWxzKHRoaXMsIG90aGVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHBvc2l0aW9uIGBhYCBlcXVhbHMgcG9zaXRpb24gYGJgXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGVxdWFscyhhOiBJUG9zaXRpb24gfCBudWxsLCBiOiBJUG9zaXRpb24gfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFhICYmICFiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIChcblx0XHRcdCEhYSAmJlxuXHRcdFx0ISFiICYmXG5cdFx0XHRhLmxpbmVOdW1iZXIgPT09IGIubGluZU51bWJlciAmJlxuXHRcdFx0YS5jb2x1bW4gPT09IGIuY29sdW1uXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHRoaXMgcG9zaXRpb24gaXMgYmVmb3JlIG90aGVyIHBvc2l0aW9uLlxuXHQgKiBJZiB0aGUgdHdvIHBvc2l0aW9ucyBhcmUgZXF1YWwsIHRoZSByZXN1bHQgd2lsbCBiZSBmYWxzZS5cblx0ICovXG5cdHB1YmxpYyBpc0JlZm9yZShvdGhlcjogSVBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIFBvc2l0aW9uLmlzQmVmb3JlKHRoaXMsIG90aGVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHBvc2l0aW9uIGBhYCBpcyBiZWZvcmUgcG9zaXRpb24gYGJgLlxuXHQgKiBJZiB0aGUgdHdvIHBvc2l0aW9ucyBhcmUgZXF1YWwsIHRoZSByZXN1bHQgd2lsbCBiZSBmYWxzZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgaXNCZWZvcmUoYTogSVBvc2l0aW9uLCBiOiBJUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRpZiAoYS5saW5lTnVtYmVyIDwgYi5saW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGIubGluZU51bWJlciA8IGEubGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYS5jb2x1bW4gPCBiLmNvbHVtbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHRoaXMgcG9zaXRpb24gaXMgYmVmb3JlIG90aGVyIHBvc2l0aW9uLlxuXHQgKiBJZiB0aGUgdHdvIHBvc2l0aW9ucyBhcmUgZXF1YWwsIHRoZSByZXN1bHQgd2lsbCBiZSB0cnVlLlxuXHQgKi9cblx0cHVibGljIGlzQmVmb3JlT3JFcXVhbChvdGhlcjogSVBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIFBvc2l0aW9uLmlzQmVmb3JlT3JFcXVhbCh0aGlzLCBvdGhlcik7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiBwb3NpdGlvbiBgYWAgaXMgYmVmb3JlIHBvc2l0aW9uIGBiYC5cblx0ICogSWYgdGhlIHR3byBwb3NpdGlvbnMgYXJlIGVxdWFsLCB0aGUgcmVzdWx0IHdpbGwgYmUgdHJ1ZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgaXNCZWZvcmVPckVxdWFsKGE6IElQb3NpdGlvbiwgYjogSVBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKGEubGluZU51bWJlciA8IGIubGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChiLmxpbmVOdW1iZXIgPCBhLmxpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGEuY29sdW1uIDw9IGIuY29sdW1uO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZnVuY3Rpb24gdGhhdCBjb21wYXJlcyBwb3NpdGlvbnMsIHVzZWZ1bCBmb3Igc29ydGluZ1xuXHQgKi9cblx0cHVibGljIHN0YXRpYyBjb21wYXJlKGE6IElQb3NpdGlvbiwgYjogSVBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHRjb25zdCBhTGluZU51bWJlciA9IGEubGluZU51bWJlciB8IDA7XG5cdFx0Y29uc3QgYkxpbmVOdW1iZXIgPSBiLmxpbmVOdW1iZXIgfCAwO1xuXG5cdFx0aWYgKGFMaW5lTnVtYmVyID09PSBiTGluZU51bWJlcikge1xuXHRcdFx0Y29uc3QgYUNvbHVtbiA9IGEuY29sdW1uIHwgMDtcblx0XHRcdGNvbnN0IGJDb2x1bW4gPSBiLmNvbHVtbiB8IDA7XG5cdFx0XHRyZXR1cm4gYUNvbHVtbiAtIGJDb2x1bW47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFMaW5lTnVtYmVyIC0gYkxpbmVOdW1iZXI7XG5cdH1cblxuXHQvKipcblx0ICogQ2xvbmUgdGhpcyBwb3NpdGlvbi5cblx0ICovXG5cdHB1YmxpYyBjbG9uZSgpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbih0aGlzLmxpbmVOdW1iZXIsIHRoaXMuY29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0IHRvIGEgaHVtYW4tcmVhZGFibGUgcmVwcmVzZW50YXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJygnICsgdGhpcy5saW5lTnVtYmVyICsgJywnICsgdGhpcy5jb2x1bW4gKyAnKSc7XG5cdH1cblxuXHQvLyAtLS1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgYFBvc2l0aW9uYCBmcm9tIGFuIGBJUG9zaXRpb25gLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBsaWZ0KHBvczogSVBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBuZXcgUG9zaXRpb24ocG9zLmxpbmVOdW1iZXIsIHBvcy5jb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgYG9iamAgaXMgYW4gYElQb3NpdGlvbmAuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGlzSVBvc2l0aW9uKG9iajogdW5rbm93bik6IG9iaiBpcyBJUG9zaXRpb24ge1xuXHRcdHJldHVybiAoXG5cdFx0XHQhIW9ialxuXHRcdFx0JiYgKHR5cGVvZiAob2JqIGFzIElQb3NpdGlvbikubGluZU51bWJlciA9PT0gJ251bWJlcicpXG5cdFx0XHQmJiAodHlwZW9mIChvYmogYXMgSVBvc2l0aW9uKS5jb2x1bW4gPT09ICdudW1iZXInKVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdG9KU09OKCk6IElQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxpbmVOdW1iZXI6IHRoaXMubGluZU51bWJlcixcblx0XHRcdGNvbHVtbjogdGhpcy5jb2x1bW5cblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFzQk8sTUFBTSxTQUFTO0FBQUEsRUFVckIsWUFBWSxZQUFvQixRQUFnQjtBQUMvQyxTQUFLLGFBQWE7QUFDbEIsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsS0FBSyxnQkFBd0IsS0FBSyxZQUFZLFlBQW9CLEtBQUssUUFBa0I7QUFDeEYsUUFBSSxrQkFBa0IsS0FBSyxjQUFjLGNBQWMsS0FBSyxRQUFRO0FBQ25FLGFBQU87QUFBQSxJQUNSLE9BQU87QUFDTixhQUFPLElBQUksU0FBUyxlQUFlLFNBQVM7QUFBQSxJQUM3QztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLE1BQU0sa0JBQTBCLEdBQUcsY0FBc0IsR0FBYTtBQUNyRSxXQUFPLEtBQUssS0FBSyxLQUFLLElBQUksR0FBRyxLQUFLLGFBQWEs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
