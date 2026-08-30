const emptyArr = [];
const _SmallImmutableSet = class _SmallImmutableSet {
  constructor(items, additionalItems) {
    this.items = items;
    this.additionalItems = additionalItems;
  }
  static create(items, additionalItems) {
    if (items <= 128 && additionalItems.length === 0) {
      let cached = _SmallImmutableSet.cache[items];
      if (!cached) {
        cached = new _SmallImmutableSet(items, additionalItems);
        _SmallImmutableSet.cache[items] = cached;
      }
      return cached;
    }
    return new _SmallImmutableSet(items, additionalItems);
  }
  static getEmpty() {
    return this.empty;
  }
  add(value, keyProvider) {
    const key = keyProvider.getKey(value);
    let idx = key >> 5;
    if (idx === 0) {
      const newItem = 1 << key | this.items;
      if (newItem === this.items) {
        return this;
      }
      return _SmallImmutableSet.create(newItem, this.additionalItems);
    }
    idx--;
    const newItems = this.additionalItems.slice(0);
    while (newItems.length < idx) {
      newItems.push(0);
    }
    newItems[idx] |= 1 << (key & 31);
    return _SmallImmutableSet.create(this.items, newItems);
  }
  has(value, keyProvider) {
    const key = keyProvider.getKey(value);
    let idx = key >> 5;
    if (idx === 0) {
      return (this.items & 1 << key) !== 0;
    }
    idx--;
    return ((this.additionalItems[idx] || 0) & 1 << (key & 31)) !== 0;
  }
  merge(other) {
    const merged = this.items | other.items;
    if (this.additionalItems === emptyArr && other.additionalItems === emptyArr) {
      if (merged === this.items) {
        return this;
      }
      if (merged === other.items) {
        return other;
      }
      return _SmallImmutableSet.create(merged, emptyArr);
    }
    const newItems = [];
    for (let i = 0; i < Math.max(this.additionalItems.length, other.additionalItems.length); i++) {
      const item1 = this.additionalItems[i] || 0;
      const item2 = other.additionalItems[i] || 0;
      newItems.push(item1 | item2);
    }
    return _SmallImmutableSet.create(merged, newItems);
  }
  intersects(other) {
    if ((this.items & other.items) !== 0) {
      return true;
    }
    for (let i = 0; i < Math.min(this.additionalItems.length, other.additionalItems.length); i++) {
      if ((this.additionalItems[i] & other.additionalItems[i]) !== 0) {
        return true;
      }
    }
    return false;
  }
  equals(other) {
    if (this.items !== other.items) {
      return false;
    }
    if (this.additionalItems.length !== other.additionalItems.length) {
      return false;
    }
    for (let i = 0; i < this.additionalItems.length; i++) {
      if (this.additionalItems[i] !== other.additionalItems[i]) {
        return false;
      }
    }
    return true;
  }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
_SmallImmutableSet.cache = new Array(129);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
_SmallImmutableSet.empty = _SmallImmutableSet.create(0, emptyArr);
let SmallImmutableSet = _SmallImmutableSet;
const identityKeyProvider = {
  getKey(value) {
    return value;
  }
};
class DenseKeyProvider {
  constructor() {
    this.items = /* @__PURE__ */ new Map();
  }
  getKey(value) {
    let existing = this.items.get(value);
    if (existing === void 0) {
      existing = this.items.size;
      this.items.set(value, existing);
    }
    return existing;
  }
  reverseLookup(value) {
    return [...this.items].find(([_key, v]) => v === value)?.[0];
  }
  reverseLookupSet(set) {
    const result = [];
    for (const [key] of this.items) {
      if (set.has(key, this)) {
        result.push(key);
      }
    }
    return result;
  }
  keys() {
    return this.items.keys();
  }
}
export {
  DenseKeyProvider,
  SmallImmutableSet,
  identityKeyProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXGJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnRcXGJyYWNrZXRQYWlyc1RyZWVcXHNtYWxsSW1tdXRhYmxlU2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuY29uc3QgZW1wdHlBcnI6IG51bWJlcltdID0gW107XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBpbW11dGFibGUgc2V0IHRoYXQgd29ya3MgYmVzdCBmb3IgYSBzbWFsbCBudW1iZXIgb2YgZWxlbWVudHMgKGxlc3MgdGhhbiAzMikuXG4gKiBJdCB1c2VzIGJpdHMgdG8gZW5jb2RlIGVsZW1lbnQgbWVtYmVyc2hpcCBlZmZpY2llbnRseS5cbiovXG5leHBvcnQgY2xhc3MgU21hbGxJbW11dGFibGVTZXQ8VD4ge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRwcml2YXRlIHN0YXRpYyBjYWNoZSA9IG5ldyBBcnJheTxTbWFsbEltbXV0YWJsZVNldDxhbnk+PigxMjkpO1xuXG5cdHByaXZhdGUgc3RhdGljIGNyZWF0ZTxUPihpdGVtczogbnVtYmVyLCBhZGRpdGlvbmFsSXRlbXM6IHJlYWRvbmx5IG51bWJlcltdKTogU21hbGxJbW11dGFibGVTZXQ8VD4ge1xuXHRcdGlmIChpdGVtcyA8PSAxMjggJiYgYWRkaXRpb25hbEl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gV2UgY3JlYXRlIGEgY2FjaGUgb2YgMTI4PTJeNyBlbGVtZW50cyB0byBjb3ZlciBhbGwgc2V0cyB3aXRoIHVwIHRvIDcgKGRlbnNlKSBlbGVtZW50cy5cblx0XHRcdGxldCBjYWNoZWQgPSBTbWFsbEltbXV0YWJsZVNldC5jYWNoZVtpdGVtc107XG5cdFx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0XHRjYWNoZWQgPSBuZXcgU21hbGxJbW11dGFibGVTZXQoaXRlbXMsIGFkZGl0aW9uYWxJdGVtcyk7XG5cdFx0XHRcdFNtYWxsSW1tdXRhYmxlU2V0LmNhY2hlW2l0ZW1zXSA9IGNhY2hlZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBTbWFsbEltbXV0YWJsZVNldChpdGVtcywgYWRkaXRpb25hbEl0ZW1zKTtcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHByaXZhdGUgc3RhdGljIGVtcHR5ID0gU21hbGxJbW11dGFibGVTZXQuY3JlYXRlPGFueT4oMCwgZW1wdHlBcnIpO1xuXHRwdWJsaWMgc3RhdGljIGdldEVtcHR5PFQ+KCk6IFNtYWxsSW1tdXRhYmxlU2V0PFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5lbXB0eTtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpdGVtczogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWRkaXRpb25hbEl0ZW1zOiByZWFkb25seSBudW1iZXJbXVxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBhZGQodmFsdWU6IFQsIGtleVByb3ZpZGVyOiBJRGVuc2VLZXlQcm92aWRlcjxUPik6IFNtYWxsSW1tdXRhYmxlU2V0PFQ+IHtcblx0XHRjb25zdCBrZXkgPSBrZXlQcm92aWRlci5nZXRLZXkodmFsdWUpO1xuXHRcdGxldCBpZHggPSBrZXkgPj4gNTsgLy8gZGl2aWRlZCBieSAzMlxuXHRcdGlmIChpZHggPT09IDApIHtcblx0XHRcdC8vIGZhc3QgcGF0aFxuXHRcdFx0Y29uc3QgbmV3SXRlbSA9ICgxIDw8IGtleSkgfCB0aGlzLml0ZW1zO1xuXHRcdFx0aWYgKG5ld0l0ZW0gPT09IHRoaXMuaXRlbXMpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gU21hbGxJbW11dGFibGVTZXQuY3JlYXRlKG5ld0l0ZW0sIHRoaXMuYWRkaXRpb25hbEl0ZW1zKTtcblx0XHR9XG5cdFx0aWR4LS07XG5cblx0XHRjb25zdCBuZXdJdGVtcyA9IHRoaXMuYWRkaXRpb25hbEl0ZW1zLnNsaWNlKDApO1xuXHRcdHdoaWxlIChuZXdJdGVtcy5sZW5ndGggPCBpZHgpIHtcblx0XHRcdG5ld0l0ZW1zLnB1c2goMCk7XG5cdFx0fVxuXHRcdG5ld0l0ZW1zW2lkeF0gfD0gMSA8PCAoa2V5ICYgMzEpO1xuXG5cdFx0cmV0dXJuIFNtYWxsSW1tdXRhYmxlU2V0LmNyZWF0ZSh0aGlzLml0ZW1zLCBuZXdJdGVtcyk7XG5cdH1cblxuXHRwdWJsaWMgaGFzKHZhbHVlOiBULCBrZXlQcm92aWRlcjogSURlbnNlS2V5UHJvdmlkZXI8VD4pOiBib29sZWFuIHtcblx0XHRjb25zdCBrZXkgPSBrZXlQcm92aWRlci5nZXRLZXkodmFsdWUpO1xuXHRcdGxldCBpZHggPSBrZXkgPj4gNTsgLy8gZGl2aWRlZCBieSAzMlxuXHRcdGlmIChpZHggPT09IDApIHtcblx0XHRcdC8vIGZhc3QgcGF0aFxuXHRcdFx0cmV0dXJuICh0aGlzLml0ZW1zICYgKDEgPDwga2V5KSkgIT09IDA7XG5cdFx0fVxuXHRcdGlkeC0tO1xuXG5cdFx0cmV0dXJuICgodGhpcy5hZGRpdGlvbmFsSXRlbXNbaWR4XSB8fCAwKSAmICgxIDw8IChrZXkgJiAzMSkpKSAhPT0gMDtcblx0fVxuXG5cdHB1YmxpYyBtZXJnZShvdGhlcjogU21hbGxJbW11dGFibGVTZXQ8VD4pOiBTbWFsbEltbXV0YWJsZVNldDxUPiB7XG5cdFx0Y29uc3QgbWVyZ2VkID0gdGhpcy5pdGVtcyB8IG90aGVyLml0ZW1zO1xuXG5cdFx0aWYgKHRoaXMuYWRkaXRpb25hbEl0ZW1zID09PSBlbXB0eUFyciAmJiBvdGhlci5hZGRpdGlvbmFsSXRlbXMgPT09IGVtcHR5QXJyKSB7XG5cdFx0XHQvLyBmYXN0IHBhdGhcblx0XHRcdGlmIChtZXJnZWQgPT09IHRoaXMuaXRlbXMpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9XG5cdFx0XHRpZiAobWVyZ2VkID09PSBvdGhlci5pdGVtcykge1xuXHRcdFx0XHRyZXR1cm4gb3RoZXI7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gU21hbGxJbW11dGFibGVTZXQuY3JlYXRlKG1lcmdlZCwgZW1wdHlBcnIpO1xuXHRcdH1cblxuXHRcdC8vIFRoaXMgY2FuIGJlIG9wdGltaXplZCwgYnV0IGl0J3Mgbm90IGEgY29tbW9uIGNhc2Vcblx0XHRjb25zdCBuZXdJdGVtczogbnVtYmVyW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IE1hdGgubWF4KHRoaXMuYWRkaXRpb25hbEl0ZW1zLmxlbmd0aCwgb3RoZXIuYWRkaXRpb25hbEl0ZW1zLmxlbmd0aCk7IGkrKykge1xuXHRcdFx0Y29uc3QgaXRlbTEgPSB0aGlzLmFkZGl0aW9uYWxJdGVtc1tpXSB8fCAwO1xuXHRcdFx0Y29uc3QgaXRlbTIgPSBvdGhlci5hZGRpdGlvbmFsSXRlbXNbaV0gfHwgMDtcblx0XHRcdG5ld0l0ZW1zLnB1c2goaXRlbTEgfCBpdGVtMik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFNtYWxsSW1tdXRhYmxlU2V0LmNyZWF0ZShtZXJnZWQsIG5ld0l0ZW1zKTtcblx0fVxuXG5cdHB1YmxpYyBpbnRlcnNlY3RzKG90aGVyOiBTbWFsbEltbXV0YWJsZVNldDxUPik6IGJvb2xlYW4ge1xuXHRcdGlmICgodGhpcy5pdGVtcyAmIG90aGVyLml0ZW1zKSAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbih0aGlzLmFkZGl0aW9uYWxJdGVtcy5sZW5ndGgsIG90aGVyLmFkZGl0aW9uYWxJdGVtcy5sZW5ndGgpOyBpKyspIHtcblx0XHRcdGlmICgodGhpcy5hZGRpdGlvbmFsSXRlbXNbaV0gJiBvdGhlci5hZGRpdGlvbmFsSXRlbXNbaV0pICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IFNtYWxsSW1tdXRhYmxlU2V0PFQ+KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuaXRlbXMgIT09IG90aGVyLml0ZW1zKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYWRkaXRpb25hbEl0ZW1zLmxlbmd0aCAhPT0gb3RoZXIuYWRkaXRpb25hbEl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5hZGRpdGlvbmFsSXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLmFkZGl0aW9uYWxJdGVtc1tpXSAhPT0gb3RoZXIuYWRkaXRpb25hbEl0ZW1zW2ldKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEZW5zZUtleVByb3ZpZGVyPFQ+IHtcblx0Z2V0S2V5KHZhbHVlOiBUKTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgaWRlbnRpdHlLZXlQcm92aWRlcjogSURlbnNlS2V5UHJvdmlkZXI8bnVtYmVyPiA9IHtcblx0Z2V0S2V5KHZhbHVlOiBudW1iZXIpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cbn07XG5cbi8qKlxuICogQXNzaWducyB2YWx1ZXMgYSB1bmlxdWUgaW5jcmVtZW50aW5nIGtleS5cbiovXG5leHBvcnQgY2xhc3MgRGVuc2VLZXlQcm92aWRlcjxUPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgaXRlbXMgPSBuZXcgTWFwPFQsIG51bWJlcj4oKTtcblxuXHRnZXRLZXkodmFsdWU6IFQpOiBudW1iZXIge1xuXHRcdGxldCBleGlzdGluZyA9IHRoaXMuaXRlbXMuZ2V0KHZhbHVlKTtcblx0XHRpZiAoZXhpc3RpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZXhpc3RpbmcgPSB0aGlzLml0ZW1zLnNpemU7XG5cdFx0XHR0aGlzLml0ZW1zLnNldCh2YWx1ZSwgZXhpc3RpbmcpO1xuXHRcdH1cblx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdH1cblxuXHRyZXZlcnNlTG9va3VwKHZhbHVlOiBudW1iZXIpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuaXRlbXNdLmZpbmQoKFtfa2V5LCB2XSkgPT4gdiA9PT0gdmFsdWUpPy5bMF07XG5cdH1cblxuXHRyZXZlcnNlTG9va3VwU2V0KHNldDogU21hbGxJbW11dGFibGVTZXQ8VD4pOiBUW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogVFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBba2V5XSBvZiB0aGlzLml0ZW1zKSB7XG5cdFx0XHRpZiAoc2V0LmhhcyhrZXksIHRoaXMpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRrZXlzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8VD4ge1xuXHRcdHJl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QUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sT0FBTyxPQUFzQztBQUNuRCxRQUFJLEtBQUssVUFBVSxNQUFNLE9BQU87QUFDL0IsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssZ0JBQWdCLFdBQVcsTUFBTSxnQkFBZ0IsUUFBUTtBQUNqRSxhQUFPO0FBQUEsSUFDUjtBQUVBLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxnQkFBZ0IsUUFBUSxLQUFLO0FBQ3JELFVBQUksS0FBSyxnQkFBZ0IsQ0FBQyxNQUFNLE1BQU0sZ0JBQWdCLENBQUMsR0FBRztBQUN6RCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBQUE7QUF4SGEsbUJBRUcsUUFBUSxJQUFJLE1BQThCLEdBQUc7QUFBQTtBQUZoRCxtQkFtQkcsUUFBUSxtQkFBa0IsT0FBWSxHQUFHLFFBQVE7QUFuQjFELElBQU0sb0JBQU47QUE4SEEsTUFBTSxzQkFBaUQ7QUFBQSxFQUM3RCxPQUFPLE9BQWU7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUtPLE1BQU0saUJBQW9CO0FBQUEsRUFBMUI7QUFDTixTQUFpQixRQUFRLG9CQUFJLElBQWU7QUFBQTtBQUFBLEVBRTVDLE9BQU8sT0FBa0I7QUFDeEIsUUFBSSxXQUFXLEtBQUssTUFBTSxJQUFJLEtBQUs7QUFDbkMsUUFBSSxhQUFhLFFBQVc7QUFDM0IsaUJBQVcsS0FBSyxNQUFNO0FBQ3RCLFdBQUssTUFBTSxJQUFJLE9BQU8sUUFBUTtBQUFBLElBQy9CO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsT0FBOEI7QUFDM0MsV0FBTyxDQUFDLEdBQUcsS0FBSyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sTUFBTSxLQUFLLElBQUksQ0FBQztBQUFBLEVBQzVEO0FBQUEsRUFFQSxpQkFBaUIsS0FBZ0M7QUFDaEQsVUFBTSxTQUFjLENBQUM7QUFDckIsZUFBVyxDQUFDLEdBQUcsS0FBSyxLQUFLLE9BQU87QUFDL0IsVUFBSSxJQUFJLElBQUksS0FBSyxJQUFJLEdBQUc7QUFDdkIsZUFBTyxLQUFLLEdBQUc7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBNEI7QUFDM0IsV0FBTyxLQUFLLE1BQU0sS0FBSztBQUFBLEVBQ3hCO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
