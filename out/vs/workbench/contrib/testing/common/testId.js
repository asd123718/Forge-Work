var TestIdPathParts = /* @__PURE__ */ ((TestIdPathParts2) => {
  TestIdPathParts2["Delimiter"] = "\0";
  return TestIdPathParts2;
})(TestIdPathParts || {});
var TestPosition = /* @__PURE__ */ ((TestPosition2) => {
  TestPosition2[TestPosition2["IsSame"] = 0] = "IsSame";
  TestPosition2[TestPosition2["Disconnected"] = 1] = "Disconnected";
  TestPosition2[TestPosition2["IsChild"] = 2] = "IsChild";
  TestPosition2[TestPosition2["IsParent"] = 3] = "IsParent";
  return TestPosition2;
})(TestPosition || {});
class TestId {
  constructor(path, viewEnd = path.length) {
    this.path = path;
    this.viewEnd = viewEnd;
    if (path.length === 0 || viewEnd < 1) {
      throw new Error("cannot create test with empty path");
    }
  }
  /**
   * Creates a test ID from an ext host test item.
   */
  static fromExtHostTestItem(item, rootId, parent = item.parent) {
    if (item._isRoot) {
      return new TestId([rootId]);
    }
    const path = [item.id];
    for (let i = parent; i && i.id !== rootId; i = i.parent) {
      path.push(i.id);
    }
    path.push(rootId);
    return new TestId(path.reverse());
  }
  /**
   * Cheaply ets whether the ID refers to the root .
   */
  static isRoot(idString) {
    return !idString.includes("\0" /* Delimiter */);
  }
  /**
   * Cheaply gets whether the ID refers to the root .
   */
  static root(idString) {
    const idx = idString.indexOf("\0" /* Delimiter */);
    return idx === -1 ? idString : idString.slice(0, idx);
  }
  /**
   * Creates a test ID from a serialized TestId instance.
   */
  static fromString(idString) {
    return new TestId(idString.split("\0" /* Delimiter */));
  }
  /**
   * Gets the ID resulting from adding b to the base ID.
   */
  static join(base, b) {
    return new TestId([...base.path, b]);
  }
  /**
   * Splits a test ID into its parts.
   */
  static split(idString) {
    return idString.split("\0" /* Delimiter */);
  }
  /**
   * Gets the string ID resulting from adding b to the base ID.
   */
  static joinToString(base, b) {
    return base.toString() + "\0" /* Delimiter */ + b;
  }
  /**
   * Cheaply gets the parent ID of a test identified with the string.
   */
  static parentId(idString) {
    const idx = idString.lastIndexOf("\0" /* Delimiter */);
    return idx === -1 ? void 0 : idString.slice(0, idx);
  }
  /**
   * Cheaply gets the local ID of a test identified with the string.
   */
  static localId(idString) {
    const idx = idString.lastIndexOf("\0" /* Delimiter */);
    return idx === -1 ? idString : idString.slice(idx + "\0" /* Delimiter */.length);
  }
  /**
   * Gets whether maybeChild is a child of maybeParent.
   * todo@connor4312: review usages of this to see if using the WellDefinedPrefixTree is better
   */
  static isChild(maybeParent, maybeChild) {
    return maybeChild[maybeParent.length] === "\0" /* Delimiter */ && maybeChild.startsWith(maybeParent);
  }
  /**
   * Compares the position of the two ID strings.
   * todo@connor4312: review usages of this to see if using the WellDefinedPrefixTree is better
   */
  static compare(a, b) {
    if (a === b) {
      return 0 /* IsSame */;
    }
    if (TestId.isChild(a, b)) {
      return 2 /* IsChild */;
    }
    if (TestId.isChild(b, a)) {
      return 3 /* IsParent */;
    }
    return 1 /* Disconnected */;
  }
  static getLengthOfCommonPrefix(length, getId) {
    if (length === 0) {
      return 0;
    }
    let commonPrefix = 0;
    while (commonPrefix < length - 1) {
      for (let i = 1; i < length; i++) {
        const a = getId(i - 1);
        const b = getId(i);
        if (a.path[commonPrefix] !== b.path[commonPrefix]) {
          return commonPrefix;
        }
      }
      commonPrefix++;
    }
    return commonPrefix;
  }
  /**
   * Gets the ID of the parent test.
   */
  get rootId() {
    return new TestId(this.path, 1);
  }
  /**
   * Gets the ID of the parent test.
   */
  get parentId() {
    return this.viewEnd > 1 ? new TestId(this.path, this.viewEnd - 1) : void 0;
  }
  /**
   * Gets the local ID of the current full test ID.
   */
  get localId() {
    return this.path[this.viewEnd - 1];
  }
  /**
   * Gets whether this ID refers to the root.
   */
  get controllerId() {
    return this.path[0];
  }
  /**
   * Gets whether this ID refers to the root.
   */
  get isRoot() {
    return this.viewEnd === 1;
  }
  /**
   * Returns an iterable that yields IDs of all parent items down to and
   * including the current item.
   */
  *idsFromRoot() {
    for (let i = 1; i <= this.viewEnd; i++) {
      yield new TestId(this.path, i);
    }
  }
  /**
   * Returns an iterable that yields IDs of the current item up to the root
   * item.
   */
  *idsToRoot() {
    for (let i = this.viewEnd; i > 0; i--) {
      yield new TestId(this.path, i);
    }
  }
  /**
   * Compares the other test ID with this one.
   */
  compare(other) {
    if (typeof other === "string") {
      return TestId.compare(this.toString(), other);
    }
    for (let i = 0; i < other.viewEnd && i < this.viewEnd; i++) {
      if (other.path[i] !== this.path[i]) {
        return 1 /* Disconnected */;
      }
    }
    if (other.viewEnd > this.viewEnd) {
      return 2 /* IsChild */;
    }
    if (other.viewEnd < this.viewEnd) {
      return 3 /* IsParent */;
    }
    return 0 /* IsSame */;
  }
  /**
   * Serializes the ID.
   */
  toJSON() {
    return this.toString();
  }
  /**
   * Serializes the ID to a string.
   */
  toString() {
    if (!this.stringifed) {
      this.stringifed = this.path[0];
      for (let i = 1; i < this.viewEnd; i++) {
        this.stringifed += "\0" /* Delimiter */;
        this.stringifed += this.path[i];
      }
    }
    return this.stringifed;
  }
}
export {
  TestId,
  TestIdPathParts,
  TestPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdElkLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdElkUGF0aFBhcnRzIHtcblx0LyoqIERlbGltaXRlciBmb3IgcGF0aCBwYXJ0cyBpbiB0ZXN0IElEcyAqL1xuXHREZWxpbWl0ZXIgPSAnXFwwJyxcbn1cblxuLyoqXG4gKiBFbnVtIGZvciBkZXNjcmliaW5nIHJlbGF0aXZlIHBvc2l0aW9ucyBvZiB0ZXN0cy4gU2ltaWxhciB0b1xuICogYG5vZGUuY29tcGFyZURvY3VtZW50UG9zaXRpb25gIGluIHRoZSBET00uXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RQb3NpdGlvbiB7XG5cdC8qKiBhID09PSBiICovXG5cdElzU2FtZSxcblx0LyoqIE5laXRoZXIgYSBub3IgYiBhcmUgYSBjaGlsZCBvZiBvbmUgYW5vdGhlci4gVGhleSBtYXkgc2hhcmUgYSBjb21tb24gcGFyZW50LCB0aG91Z2guICovXG5cdERpc2Nvbm5lY3RlZCxcblx0LyoqIGIgaXMgYSBjaGlsZCBvZiBhICovXG5cdElzQ2hpbGQsXG5cdC8qKiBiIGlzIGEgcGFyZW50IG9mIGEgKi9cblx0SXNQYXJlbnQsXG59XG5cbnR5cGUgVGVzdEl0ZW1MaWtlID0geyBpZDogc3RyaW5nOyBwYXJlbnQ/OiBUZXN0SXRlbUxpa2U7IF9pc1Jvb3Q/OiBib29sZWFuIH07XG5cbi8qKlxuICogVGhlIHRlc3QgSUQgaXMgYSBzdHJpbmdpZmlhYmxlIGNsaWVudCB0aGF0XG4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0SWQge1xuXHRwcml2YXRlIHN0cmluZ2lmZWQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSB0ZXN0IElEIGZyb20gYW4gZXh0IGhvc3QgdGVzdCBpdGVtLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBmcm9tRXh0SG9zdFRlc3RJdGVtKGl0ZW06IFRlc3RJdGVtTGlrZSwgcm9vdElkOiBzdHJpbmcsIHBhcmVudCA9IGl0ZW0ucGFyZW50KSB7XG5cdFx0aWYgKGl0ZW0uX2lzUm9vdCkge1xuXHRcdFx0cmV0dXJuIG5ldyBUZXN0SWQoW3Jvb3RJZF0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdGggPSBbaXRlbS5pZF07XG5cdFx0Zm9yIChsZXQgaSA9IHBhcmVudDsgaSAmJiBpLmlkICE9PSByb290SWQ7IGkgPSBpLnBhcmVudCkge1xuXHRcdFx0cGF0aC5wdXNoKGkuaWQpO1xuXHRcdH1cblx0XHRwYXRoLnB1c2gocm9vdElkKTtcblxuXHRcdHJldHVybiBuZXcgVGVzdElkKHBhdGgucmV2ZXJzZSgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVhcGx5IGV0cyB3aGV0aGVyIHRoZSBJRCByZWZlcnMgdG8gdGhlIHJvb3QgLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBpc1Jvb3QoaWRTdHJpbmc6IHN0cmluZykge1xuXHRcdHJldHVybiAhaWRTdHJpbmcuaW5jbHVkZXMoVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlcik7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlYXBseSBnZXRzIHdoZXRoZXIgdGhlIElEIHJlZmVycyB0byB0aGUgcm9vdCAuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHJvb3QoaWRTdHJpbmc6IHN0cmluZykge1xuXHRcdGNvbnN0IGlkeCA9IGlkU3RyaW5nLmluZGV4T2YoVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlcik7XG5cdFx0cmV0dXJuIGlkeCA9PT0gLTEgPyBpZFN0cmluZyA6IGlkU3RyaW5nLnNsaWNlKDAsIGlkeCk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHRlc3QgSUQgZnJvbSBhIHNlcmlhbGl6ZWQgVGVzdElkIGluc3RhbmNlLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBmcm9tU3RyaW5nKGlkU3RyaW5nOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gbmV3IFRlc3RJZChpZFN0cmluZy5zcGxpdChUZXN0SWRQYXRoUGFydHMuRGVsaW1pdGVyKSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgSUQgcmVzdWx0aW5nIGZyb20gYWRkaW5nIGIgdG8gdGhlIGJhc2UgSUQuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGpvaW4oYmFzZTogVGVzdElkLCBiOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gbmV3IFRlc3RJZChbLi4uYmFzZS5wYXRoLCBiXSk7XG5cdH1cblxuXHQvKipcblx0ICogU3BsaXRzIGEgdGVzdCBJRCBpbnRvIGl0cyBwYXJ0cy5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgc3BsaXQoaWRTdHJpbmc6IHN0cmluZykge1xuXHRcdHJldHVybiBpZFN0cmluZy5zcGxpdChUZXN0SWRQYXRoUGFydHMuRGVsaW1pdGVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBzdHJpbmcgSUQgcmVzdWx0aW5nIGZyb20gYWRkaW5nIGIgdG8gdGhlIGJhc2UgSUQuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGpvaW5Ub1N0cmluZyhiYXNlOiBzdHJpbmcgfCBUZXN0SWQsIGI6IHN0cmluZykge1xuXHRcdHJldHVybiBiYXNlLnRvU3RyaW5nKCkgKyBUZXN0SWRQYXRoUGFydHMuRGVsaW1pdGVyICsgYjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVhcGx5IGdldHMgdGhlIHBhcmVudCBJRCBvZiBhIHRlc3QgaWRlbnRpZmllZCB3aXRoIHRoZSBzdHJpbmcuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHBhcmVudElkKGlkU3RyaW5nOiBzdHJpbmcpIHtcblx0XHRjb25zdCBpZHggPSBpZFN0cmluZy5sYXN0SW5kZXhPZihUZXN0SWRQYXRoUGFydHMuRGVsaW1pdGVyKTtcblx0XHRyZXR1cm4gaWR4ID09PSAtMSA/IHVuZGVmaW5lZCA6IGlkU3RyaW5nLnNsaWNlKDAsIGlkeCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlYXBseSBnZXRzIHRoZSBsb2NhbCBJRCBvZiBhIHRlc3QgaWRlbnRpZmllZCB3aXRoIHRoZSBzdHJpbmcuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGxvY2FsSWQoaWRTdHJpbmc6IHN0cmluZykge1xuXHRcdGNvbnN0IGlkeCA9IGlkU3RyaW5nLmxhc3RJbmRleE9mKFRlc3RJZFBhdGhQYXJ0cy5EZWxpbWl0ZXIpO1xuXHRcdHJldHVybiBpZHggPT09IC0xID8gaWRTdHJpbmcgOiBpZFN0cmluZy5zbGljZShpZHggKyBUZXN0SWRQYXRoUGFydHMuRGVsaW1pdGVyLmxlbmd0aCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB3aGV0aGVyIG1heWJlQ2hpbGQgaXMgYSBjaGlsZCBvZiBtYXliZVBhcmVudC5cblx0ICogdG9kb0Bjb25ub3I0MzEyOiByZXZpZXcgdXNhZ2VzIG9mIHRoaXMgdG8gc2VlIGlmIHVzaW5nIHRoZSBXZWxsRGVmaW5lZFByZWZpeFRyZWUgaXMgYmV0dGVyXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGlzQ2hpbGQobWF5YmVQYXJlbnQ6IHN0cmluZywgbWF5YmVDaGlsZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIG1heWJlQ2hpbGRbbWF5YmVQYXJlbnQubGVuZ3RoXSA9PT0gVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlciAmJiBtYXliZUNoaWxkLnN0YXJ0c1dpdGgobWF5YmVQYXJlbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXBhcmVzIHRoZSBwb3NpdGlvbiBvZiB0aGUgdHdvIElEIHN0cmluZ3MuXG5cdCAqIHRvZG9AY29ubm9yNDMxMjogcmV2aWV3IHVzYWdlcyBvZiB0aGlzIHRvIHNlZSBpZiB1c2luZyB0aGUgV2VsbERlZmluZWRQcmVmaXhUcmVlIGlzIGJldHRlclxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBjb21wYXJlKGE6IHN0cmluZywgYjogc3RyaW5nKSB7XG5cdFx0aWYgKGEgPT09IGIpIHtcblx0XHRcdHJldHVybiBUZXN0UG9zaXRpb24uSXNTYW1lO1xuXHRcdH1cblxuXHRcdGlmIChUZXN0SWQuaXNDaGlsZChhLCBiKSkge1xuXHRcdFx0cmV0dXJuIFRlc3RQb3NpdGlvbi5Jc0NoaWxkO1xuXHRcdH1cblxuXHRcdGlmIChUZXN0SWQuaXNDaGlsZChiLCBhKSkge1xuXHRcdFx0cmV0dXJuIFRlc3RQb3NpdGlvbi5Jc1BhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gVGVzdFBvc2l0aW9uLkRpc2Nvbm5lY3RlZDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0TGVuZ3RoT2ZDb21tb25QcmVmaXgobGVuZ3RoOiBudW1iZXIsIGdldElkOiAoaTogbnVtYmVyKSA9PiBUZXN0SWQpOiBudW1iZXIge1xuXHRcdGlmIChsZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGxldCBjb21tb25QcmVmaXggPSAwO1xuXHRcdHdoaWxlIChjb21tb25QcmVmaXggPCBsZW5ndGggLSAxKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBnZXRJZChpIC0gMSk7XG5cdFx0XHRcdGNvbnN0IGIgPSBnZXRJZChpKTtcblx0XHRcdFx0aWYgKGEucGF0aFtjb21tb25QcmVmaXhdICE9PSBiLnBhdGhbY29tbW9uUHJlZml4XSkge1xuXHRcdFx0XHRcdHJldHVybiBjb21tb25QcmVmaXg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29tbW9uUHJlZml4Kys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbW1vblByZWZpeDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBwYXRoOiByZWFkb25seSBzdHJpbmdbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdFbmQgPSBwYXRoLmxlbmd0aCxcblx0KSB7XG5cdFx0aWYgKHBhdGgubGVuZ3RoID09PSAwIHx8IHZpZXdFbmQgPCAxKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Nhbm5vdCBjcmVhdGUgdGVzdCB3aXRoIGVtcHR5IHBhdGgnKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgSUQgb2YgdGhlIHBhcmVudCB0ZXN0LlxuXHQgKi9cblx0cHVibGljIGdldCByb290SWQoKTogVGVzdElkIHtcblx0XHRyZXR1cm4gbmV3IFRlc3RJZCh0aGlzLnBhdGgsIDEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIElEIG9mIHRoZSBwYXJlbnQgdGVzdC5cblx0ICovXG5cdHB1YmxpYyBnZXQgcGFyZW50SWQoKTogVGVzdElkIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3RW5kID4gMSA/IG5ldyBUZXN0SWQodGhpcy5wYXRoLCB0aGlzLnZpZXdFbmQgLSAxKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBsb2NhbCBJRCBvZiB0aGUgY3VycmVudCBmdWxsIHRlc3QgSUQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGxvY2FsSWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMucGF0aFt0aGlzLnZpZXdFbmQgLSAxXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHdoZXRoZXIgdGhpcyBJRCByZWZlcnMgdG8gdGhlIHJvb3QuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGNvbnRyb2xsZXJJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5wYXRoWzBdO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgd2hldGhlciB0aGlzIElEIHJlZmVycyB0byB0aGUgcm9vdC5cblx0ICovXG5cdHB1YmxpYyBnZXQgaXNSb290KCkge1xuXHRcdHJldHVybiB0aGlzLnZpZXdFbmQgPT09IDE7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBpdGVyYWJsZSB0aGF0IHlpZWxkcyBJRHMgb2YgYWxsIHBhcmVudCBpdGVtcyBkb3duIHRvIGFuZFxuXHQgKiBpbmNsdWRpbmcgdGhlIGN1cnJlbnQgaXRlbS5cblx0ICovXG5cdHB1YmxpYyAqaWRzRnJvbVJvb3QoKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gdGhpcy52aWV3RW5kOyBpKyspIHtcblx0XHRcdHlpZWxkIG5ldyBUZXN0SWQodGhpcy5wYXRoLCBpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBpdGVyYWJsZSB0aGF0IHlpZWxkcyBJRHMgb2YgdGhlIGN1cnJlbnQgaXRlbSB1cCB0byB0aGUgcm9vdFxuXHQgKiBpdGVtLlxuXHQgKi9cblx0cHVibGljICppZHNUb1Jvb3QoKSB7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMudmlld0VuZDsgaSA+IDA7IGktLSkge1xuXHRcdFx0eWllbGQgbmV3IFRlc3RJZCh0aGlzLnBhdGgsIGkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wYXJlcyB0aGUgb3RoZXIgdGVzdCBJRCB3aXRoIHRoaXMgb25lLlxuXHQgKi9cblx0cHVibGljIGNvbXBhcmUob3RoZXI6IFRlc3RJZCB8IHN0cmluZykge1xuXHRcdGlmICh0eXBlb2Ygb3RoZXIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gVGVzdElkLmNvbXBhcmUodGhpcy50b1N0cmluZygpLCBvdGhlcik7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvdGhlci52aWV3RW5kICYmIGkgPCB0aGlzLnZpZXdFbmQ7IGkrKykge1xuXHRcdFx0aWYgKG90aGVyLnBhdGhbaV0gIT09IHRoaXMucGF0aFtpXSkge1xuXHRcdFx0XHRyZXR1cm4gVGVzdFBvc2l0aW9uLkRpc2Nvbm5lY3RlZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAob3RoZXIudmlld0VuZCA+IHRoaXMudmlld0VuZCkge1xuXHRcdFx0cmV0dXJuIFRlc3RQb3NpdGlvbi5Jc0NoaWxkO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlci52aWV3RW5kIDwgdGhpcy52aWV3RW5kKSB7XG5cdFx0XHRyZXR1cm4gVGVzdFBvc2l0aW9uLklzUGFyZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBUZXN0UG9zaXRpb24uSXNTYW1lO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlcmlhbGl6ZXMgdGhlIElELlxuXHQgKi9cblx0cHVibGljIHRvSlNPTigpIHtcblx0XHRyZXR1cm4gdGhpcy50b1N0cmluZygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlcmlhbGl6ZXMgdGhlIElEIHRvIGEgc3RyaW5nLlxuXHQgKi9cblx0cHVibGljIHRvU3RyaW5nKCkge1xuXHRcdGlmICghdGhpcy5zdHJpbmdpZmVkKSB7XG5cdFx0XHR0aGlzLnN0cmluZ2lmZWQgPSB0aGlzLnBhdGhbMF07XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHRoaXMudmlld0VuZDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuc3RyaW5naWZlZCArPSBUZXN0SWRQYXRoUGFydHMuRGVsaW1pdGVyO1xuXHRcdFx0XHR0aGlzLnN0cmluZ2lmZWQgKz0gdGhpcy5wYXRoW2ldO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnN0cmluZ2lmZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtPLElBQVcsa0JBQVgsa0JBQVdBLHFCQUFYO0FBRU4sRUFBQUEsaUJBQUEsZUFBWTtBQUZLLFNBQUFBO0FBQUEsR0FBQTtBQVNYLElBQVcsZUFBWCxrQkFBV0Msa0JBQVg7QUFFTixFQUFBQSw0QkFBQTtBQUVBLEVBQUFBLDRCQUFBO0FBRUEsRUFBQUEsNEJBQUE7QUFFQSxFQUFBQSw0QkFBQTtBQVJpQixTQUFBQTtBQUFBLEdBQUE7QUFnQlgsTUFBTSxPQUFPO0FBQUEsRUFnSW5CLFlBQ2lCLE1BQ0MsVUFBVSxLQUFLLFFBQy9CO0FBRmU7QUFDQztBQUVqQixRQUFJLEtBQUssV0FBVyxLQUFLLFVBQVUsR0FBRztBQUNyQyxZQUFNLElBQUksTUFBTSxvQ0FBb0M7QUFBQSxJQUNyRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWpJQSxPQUFjLG9CQUFvQixNQUFvQixRQUFnQixTQUFTLEtBQUssUUFBUTtBQUMzRixRQUFJLEtBQUssU0FBUztBQUNqQixhQUFPLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUFBLElBQzNCO0FBRUEsVUFBTSxPQUFPLENBQUMsS0FBSyxFQUFFO0FBQ3JCLGFBQVMsSUFBSSxRQUFRLEtBQUssRUFBRSxPQUFPLFFBQVEsSUFBSSxFQUFFLFFBQVE7QUFDeEQsV0FBSyxLQUFLLEVBQUUsRUFBRTtBQUFBLElBQ2Y7QUFDQSxTQUFLLEtBQUssTUFBTTtBQUVoQixXQUFPLElBQUksT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUFBLEVBQ2pDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxPQUFjLE9BQU8sVUFBa0I7QUFDdEMsV0FBTyxDQUFDLFNBQVMsU0FBUyxvQkFBeUI7QUFBQSxFQUNwRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBYyxLQUFLLFVBQWtCO0FBQ3BDLFVBQU0sTUFBTSxTQUFTLFFBQVEsb0JBQXlCO0FBQ3RELFdBQU8sUUFBUSxLQUFLLFdBQVcsU0FBUyxNQUFNLEdBQUcsR0FBRztBQUFBLEVBQ3JEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxPQUFjLFdBQVcsVUFBa0I7QUFDMUMsV0FBTyxJQUFJLE9BQU8sU0FBUyxNQUFNLG9CQUF5QixDQUFDO0FBQUEsRUFDNUQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE9BQWMsS0FBSyxNQUFjLEdBQVc7QUFDM0MsV0FBTyxJQUFJLE9BQU8sQ0FBQyxHQUFHLEtBQUssTUFBTSxDQUFDLENBQUM7QUFBQSxFQUNwQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBYyxNQUFNLFVBQWtCO0FBQ3JDLFdBQU8sU0FBUyxNQUFNLG9CQUF5QjtBQUFBLEVBQ2hEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxPQUFjLGFBQWEsTUFBdUIsR0FBVztBQUM1RCxXQUFPLEtBQUssU0FBUyxJQUFJLHVCQUE0QjtBQUFBLEVBQ3REO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxPQUFjLFNBQVMsVUFBa0I7QUFDeEMsVUFBTSxNQUFNLFNBQVMsWUFBWSxvQkFBeUI7QUFDMUQsV0FBTyxRQUFRLEtBQUssU0FBWSxTQUFTLE1BQU0sR0FBRyxHQUFHO0FBQUEsRUFDdEQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE9BQWMsUUFBUSxVQUFrQjtBQUN2QyxVQUFNLE1BQU0sU0FBUyxZQUFZLG9CQUF5QjtBQUMxRCxXQUFPLFFBQVEsS0FBSyxXQUFXLFNBQVMsTUFBTSxNQUFNLHFCQUEwQixNQUFNO0FBQUEsRUFDckY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsT0FBYyxRQUFRLGFBQXFCLFlBQW9CO0FBQzlELFdBQU8sV0FBVyxZQUFZLE1BQU0sTUFBTSx3QkFBNkIsV0FBVyxXQUFXLFdBQVc7QUFBQSxFQUN6RztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxPQUFjLFFBQVEsR0FBVyxHQUFXO0FBQzNDLFFBQUksTUFBTSxHQUFHO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLE9BQU8sUUFBUSxHQUFHLENBQUMsR0FBRztBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksT0FBTyxRQUFRLEdBQUcsQ0FBQyxHQUFHO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWMsd0JBQXdCLFFBQWdCLE9BQXNDO0FBQzNGLFFBQUksV0FBVyxHQUFHO0FBQ2pCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxlQUFlO0FBQ25CLFdBQU8sZUFBZSxTQUFTLEdBQUc7QUFDakMsZUFBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLEtBQUs7QUFDaEMsY0FBTSxJQUFJLE1BQU0sSUFBSSxDQUFDO0FBQ3JCLGNBQU0sSUFBSSxNQUFNLENBQUM7QUFDakIsWUFBSSxFQUFFLEtBQUssWUFBWSxNQUFNLEVBQUUsS0FBSyxZQUFZLEdBQUc7QUFDbEQsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUVBO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFjQSxJQUFXLFNBQWlCO0FBQzNCLFdBQU8sSUFBSSxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQUEsRUFDL0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLElBQVcsV0FBK0I7QUFDekMsV0FBTyxLQUFLLFVBQVUsSUFBSSxJQUFJLE9BQU8sS0FBSyxNQUFNLEtBQUssVUFBVSxDQUFDLElBQUk7QUFBQSxFQUNyRTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsSUFBVyxVQUFVO0FBQ3BCLFdBQU8sS0FBSyxLQUFLLEtBQUssVUFBVSxDQUFDO0FBQUEsRUFDbEM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLElBQVcsZUFBZTtBQUN6QixXQUFPLEtBQUssS0FBSyxDQUFDO0FBQUEsRUFDbkI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLElBQVcsU0FBUztBQUNuQixXQUFPLEtBQUssWUFBWTtBQUFBLEVBQ3pCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLENBQVEsY0FBYztBQUNyQixhQUFTLElBQUksR0FBRyxLQUFLLEtBQUssU0FBUyxLQUFLO0FBQ3ZDLFlBQU0sSUFBSSxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLENBQVEsWUFBWTtBQUNuQixhQUFTLElBQUksS0FBSyxTQUFTLElBQUksR0FBRyxLQUFLO0FBQ3RDLFlBQU0sSUFBSSxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxRQUFRLE9BQXdCO0FBQ3RDLFFBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsYUFBTyxPQUFPLFFBQVEsS0FBSyxTQUFTLEdBQUcsS0FBSztBQUFBLElBQzdDO0FBRUEsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFdBQVcsSUFBSSxLQUFLLFNBQVMsS0FBSztBQUMzRCxVQUFJLE1BQU0sS0FBSyxDQUFDLE1BQU0sS0FBSyxLQUFLLENBQUMsR0FBRztBQUNuQyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sVUFBVSxLQUFLLFNBQVM7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLE1BQU0sVUFBVSxLQUFLLFNBQVM7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sU0FBUztBQUNmLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFDdEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLFdBQVc7QUFDakIsUUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQixXQUFLLGFBQWEsS0FBSyxLQUFLLENBQUM7QUFDN0IsZUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFNBQVMsS0FBSztBQUN0QyxhQUFLLGNBQWM7QUFDbkIsYUFBSyxjQUFjLEtBQUssS0FBSyxDQUFDO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEOyIsCiAgIm5hbWVzIjogWyJUZXN0SWRQYXRoUGFydHMiLCAiVGVzdFBvc2l0aW9uIl0KfQo=
