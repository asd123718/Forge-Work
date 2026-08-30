import { Iterable } from "./iterator.js";
const unset = /* @__PURE__ */ Symbol("unset");
class WellDefinedPrefixTree {
  constructor() {
    this.root = new Node();
    this._size = 0;
  }
  /** Tree size, not including the root. */
  get size() {
    return this._size;
  }
  /** Gets the top-level nodes of the tree */
  get nodes() {
    return this.root.children?.values() || Iterable.empty();
  }
  /** Gets the top-level nodes of the tree */
  get entries() {
    return this.root.children?.entries() || Iterable.empty();
  }
  /**
   * Inserts a new value in the prefix tree.
   * @param onNode - called for each node as we descend to the insertion point,
   * including the insertion point itself.
   */
  insert(key, value, onNode) {
    this.opNode(key, (n) => n._value = value, onNode);
  }
  /** Mutates a value in the prefix tree. */
  mutate(key, mutate) {
    this.opNode(key, (n) => n._value = mutate(n._value === unset ? void 0 : n._value));
  }
  /** Mutates nodes along the path in the prefix tree. */
  mutatePath(key, mutate) {
    this.opNode(key, () => {
    }, (n) => mutate(n));
  }
  /** Deletes a node from the prefix tree, returning the value it contained. */
  delete(key) {
    const path = this.getPathToKey(key);
    if (!path) {
      return;
    }
    let i = path.length - 1;
    const value = path[i].node._value;
    if (value === unset) {
      return;
    }
    this._size--;
    path[i].node._value = unset;
    for (; i > 0; i--) {
      const { node, part } = path[i];
      if (node.children?.size || node._value !== unset) {
        break;
      }
      path[i - 1].node.children.delete(part);
    }
    return value;
  }
  /** Deletes a subtree from the prefix tree, returning the values they contained. */
  *deleteRecursive(key) {
    const path = this.getPathToKey(key);
    if (!path) {
      return;
    }
    const subtree = path[path.length - 1].node;
    for (let i = path.length - 1; i > 0; i--) {
      const parent = path[i - 1];
      parent.node.children.delete(path[i].part);
      if (parent.node.children.size > 0 || parent.node._value !== unset) {
        break;
      }
    }
    for (const node of bfsIterate(subtree)) {
      if (node._value !== unset) {
        this._size--;
        yield node._value;
      }
    }
    if (subtree === this.root) {
      this.root._value = unset;
      this.root.children = void 0;
    }
  }
  /** Gets a value from the tree. */
  find(key) {
    let node = this.root;
    for (const segment of key) {
      const next = node.children?.get(segment);
      if (!next) {
        return void 0;
      }
      node = next;
    }
    return node._value === unset ? void 0 : node._value;
  }
  /** Gets whether the tree has the key, or a parent of the key, already inserted. */
  hasKeyOrParent(key) {
    let node = this.root;
    for (const segment of key) {
      const next = node.children?.get(segment);
      if (!next) {
        return false;
      }
      if (next._value !== unset) {
        return true;
      }
      node = next;
    }
    return false;
  }
  /** Gets whether the tree has the given key or any children. */
  hasKeyOrChildren(key) {
    let node = this.root;
    for (const segment of key) {
      const next = node.children?.get(segment);
      if (!next) {
        return false;
      }
      node = next;
    }
    return true;
  }
  /** Gets whether the tree has the given key. */
  hasKey(key) {
    let node = this.root;
    for (const segment of key) {
      const next = node.children?.get(segment);
      if (!next) {
        return false;
      }
      node = next;
    }
    return node._value !== unset;
  }
  getPathToKey(key) {
    const path = [{ part: "", node: this.root }];
    let i = 0;
    for (const part of key) {
      const node = path[i].node.children?.get(part);
      if (!node) {
        return;
      }
      path.push({ part, node });
      i++;
    }
    return path;
  }
  opNode(key, fn, onDescend) {
    let node = this.root;
    for (const part of key) {
      if (!node.children) {
        const next = new Node();
        node.children = /* @__PURE__ */ new Map([[part, next]]);
        node = next;
      } else if (!node.children.has(part)) {
        const next = new Node();
        node.children.set(part, next);
        node = next;
      } else {
        node = node.children.get(part);
      }
      onDescend?.(node);
    }
    const sizeBefore = node._value === unset ? 0 : 1;
    fn(node);
    const sizeAfter = node._value === unset ? 0 : 1;
    this._size += sizeAfter - sizeBefore;
  }
  /** Returns an iterable of the tree values in no defined order. */
  *values() {
    for (const { _value } of bfsIterate(this.root)) {
      if (_value !== unset) {
        yield _value;
      }
    }
  }
}
function* bfsIterate(root) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    yield node;
    if (node.children) {
      for (const child of node.children.values()) {
        stack.push(child);
      }
    }
  }
}
class Node {
  constructor() {
    this._value = unset;
  }
  get value() {
    return this._value === unset ? void 0 : this._value;
  }
  set value(value) {
    this._value = value === void 0 ? unset : value;
  }
}
export {
  WellDefinedPrefixTree
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHByZWZpeFRyZWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4vaXRlcmF0b3IuanMnO1xuXG5jb25zdCB1bnNldCA9IFN5bWJvbCgndW5zZXQnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJUHJlZml4VHJlZU5vZGU8VD4ge1xuXHQvKiogUG9zc2libGUgY2hpbGRyZW4gb2YgdGhlIG5vZGUuICovXG5cdGNoaWxkcmVuPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBOb2RlPFQ+PjtcblxuXHQvKiogVGhlIHZhbHVlIGlmIGRhdGEgZXhpc3RzIGZvciB0aGlzIG5vZGUgaW4gdGhlIHRyZWUuIE11dGFibGUuICovXG5cdHZhbHVlOiBUIHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEEgc2ltcGxlIHByZWZpeCB0cmVlIGltcGxlbWVudGF0aW9uIHdoZXJlIGEgdmFsdWUgaXMgc3RvcmVkIGJhc2VkIG9uXG4gKiB3ZWxsLWRlZmluZWQgcHJlZml4IHNlZ21lbnRzLlxuICovXG5leHBvcnQgY2xhc3MgV2VsbERlZmluZWRQcmVmaXhUcmVlPFY+IHtcblx0cHVibGljIHJlYWRvbmx5IHJvb3QgPSBuZXcgTm9kZTxWPigpO1xuXHRwcml2YXRlIF9zaXplID0gMDtcblxuXHQvKiogVHJlZSBzaXplLCBub3QgaW5jbHVkaW5nIHRoZSByb290LiAqL1xuXHRwdWJsaWMgZ2V0IHNpemUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpemU7XG5cdH1cblxuXHQvKiogR2V0cyB0aGUgdG9wLWxldmVsIG5vZGVzIG9mIHRoZSB0cmVlICovXG5cdHB1YmxpYyBnZXQgbm9kZXMoKTogSXRlcmFibGU8SVByZWZpeFRyZWVOb2RlPFY+PiB7XG5cdFx0cmV0dXJuIHRoaXMucm9vdC5jaGlsZHJlbj8udmFsdWVzKCkgfHwgSXRlcmFibGUuZW1wdHkoKTtcblx0fVxuXG5cdC8qKiBHZXRzIHRoZSB0b3AtbGV2ZWwgbm9kZXMgb2YgdGhlIHRyZWUgKi9cblx0cHVibGljIGdldCBlbnRyaWVzKCk6IEl0ZXJhYmxlPFtzdHJpbmcsIElQcmVmaXhUcmVlTm9kZTxWPl0+IHtcblx0XHRyZXR1cm4gdGhpcy5yb290LmNoaWxkcmVuPy5lbnRyaWVzKCkgfHwgSXRlcmFibGUuZW1wdHkoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnNlcnRzIGEgbmV3IHZhbHVlIGluIHRoZSBwcmVmaXggdHJlZS5cblx0ICogQHBhcmFtIG9uTm9kZSAtIGNhbGxlZCBmb3IgZWFjaCBub2RlIGFzIHdlIGRlc2NlbmQgdG8gdGhlIGluc2VydGlvbiBwb2ludCxcblx0ICogaW5jbHVkaW5nIHRoZSBpbnNlcnRpb24gcG9pbnQgaXRzZWxmLlxuXHQgKi9cblx0aW5zZXJ0KGtleTogSXRlcmFibGU8c3RyaW5nPiwgdmFsdWU6IFYsIG9uTm9kZT86IChuOiBJUHJlZml4VHJlZU5vZGU8Vj4pID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLm9wTm9kZShrZXksIG4gPT4gbi5fdmFsdWUgPSB2YWx1ZSwgb25Ob2RlKTtcblx0fVxuXG5cdC8qKiBNdXRhdGVzIGEgdmFsdWUgaW4gdGhlIHByZWZpeCB0cmVlLiAqL1xuXHRtdXRhdGUoa2V5OiBJdGVyYWJsZTxzdHJpbmc+LCBtdXRhdGU6ICh2YWx1ZT86IFYpID0+IFYpOiB2b2lkIHtcblx0XHR0aGlzLm9wTm9kZShrZXksIG4gPT4gbi5fdmFsdWUgPSBtdXRhdGUobi5fdmFsdWUgPT09IHVuc2V0ID8gdW5kZWZpbmVkIDogbi5fdmFsdWUpKTtcblx0fVxuXG5cdC8qKiBNdXRhdGVzIG5vZGVzIGFsb25nIHRoZSBwYXRoIGluIHRoZSBwcmVmaXggdHJlZS4gKi9cblx0bXV0YXRlUGF0aChrZXk6IEl0ZXJhYmxlPHN0cmluZz4sIG11dGF0ZTogKG5vZGU6IElQcmVmaXhUcmVlTm9kZTxWPikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMub3BOb2RlKGtleSwgKCkgPT4geyB9LCBuID0+IG11dGF0ZShuKSk7XG5cdH1cblxuXHQvKiogRGVsZXRlcyBhIG5vZGUgZnJvbSB0aGUgcHJlZml4IHRyZWUsIHJldHVybmluZyB0aGUgdmFsdWUgaXQgY29udGFpbmVkLiAqL1xuXHRkZWxldGUoa2V5OiBJdGVyYWJsZTxzdHJpbmc+KTogViB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGF0aCA9IHRoaXMuZ2V0UGF0aFRvS2V5KGtleSk7XG5cdFx0aWYgKCFwYXRoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGkgPSBwYXRoLmxlbmd0aCAtIDE7XG5cdFx0Y29uc3QgdmFsdWUgPSBwYXRoW2ldLm5vZGUuX3ZhbHVlO1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5zZXQpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IGFjdHVhbGx5IGEgcmVhbCBub2RlXG5cdFx0fVxuXG5cdFx0dGhpcy5fc2l6ZS0tO1xuXHRcdHBhdGhbaV0ubm9kZS5fdmFsdWUgPSB1bnNldDtcblxuXHRcdGZvciAoOyBpID4gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCB7IG5vZGUsIHBhcnQgfSA9IHBhdGhbaV07XG5cdFx0XHRpZiAobm9kZS5jaGlsZHJlbj8uc2l6ZSB8fCBub2RlLl92YWx1ZSAhPT0gdW5zZXQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHBhdGhbaSAtIDFdLm5vZGUuY2hpbGRyZW4hLmRlbGV0ZShwYXJ0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHQvKiogRGVsZXRlcyBhIHN1YnRyZWUgZnJvbSB0aGUgcHJlZml4IHRyZWUsIHJldHVybmluZyB0aGUgdmFsdWVzIHRoZXkgY29udGFpbmVkLiAqL1xuXHQqZGVsZXRlUmVjdXJzaXZlKGtleTogSXRlcmFibGU8c3RyaW5nPik6IEl0ZXJhYmxlPFY+IHtcblx0XHRjb25zdCBwYXRoID0gdGhpcy5nZXRQYXRoVG9LZXkoa2V5KTtcblx0XHRpZiAoIXBhdGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdWJ0cmVlID0gcGF0aFtwYXRoLmxlbmd0aCAtIDFdLm5vZGU7XG5cblx0XHQvLyBpbXBvcnRhbnQ6IHJ1biB0aGUgZGVsZXRpb24gYmVmb3JlIHdlIHN0YXJ0IHRvIHlpZWxkIHJlc3VsdHMsIHNvIHRoYXRcblx0XHQvLyBpdCBzdGlsbCBydW5zIGV2ZW4gaWYgdGhlIGNhbGxlciBkb2Vzbid0IGNvbnN1bWVyIHRoZSBpdGVyYXRvclxuXHRcdGZvciAobGV0IGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IHBhdGhbaSAtIDFdO1xuXHRcdFx0cGFyZW50Lm5vZGUuY2hpbGRyZW4hLmRlbGV0ZShwYXRoW2ldLnBhcnQpO1xuXHRcdFx0aWYgKHBhcmVudC5ub2RlLmNoaWxkcmVuIS5zaXplID4gMCB8fCBwYXJlbnQubm9kZS5fdmFsdWUgIT09IHVuc2V0KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBiZnNJdGVyYXRlKHN1YnRyZWUpKSB7XG5cdFx0XHRpZiAobm9kZS5fdmFsdWUgIT09IHVuc2V0KSB7XG5cdFx0XHRcdHRoaXMuX3NpemUtLTtcblx0XHRcdFx0eWllbGQgbm9kZS5fdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc3BlY2lhbCBjYXNlIGZvciB0aGUgcm9vdCBub3RlXG5cdFx0aWYgKHN1YnRyZWUgPT09IHRoaXMucm9vdCkge1xuXHRcdFx0dGhpcy5yb290Ll92YWx1ZSA9IHVuc2V0O1xuXHRcdFx0dGhpcy5yb290LmNoaWxkcmVuID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBHZXRzIGEgdmFsdWUgZnJvbSB0aGUgdHJlZS4gKi9cblx0ZmluZChrZXk6IEl0ZXJhYmxlPHN0cmluZz4pOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgbm9kZSA9IHRoaXMucm9vdDtcblx0XHRmb3IgKGNvbnN0IHNlZ21lbnQgb2Yga2V5KSB7XG5cdFx0XHRjb25zdCBuZXh0ID0gbm9kZS5jaGlsZHJlbj8uZ2V0KHNlZ21lbnQpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdG5vZGUgPSBuZXh0O1xuXHRcdH1cblxuXHRcdHJldHVybiBub2RlLl92YWx1ZSA9PT0gdW5zZXQgPyB1bmRlZmluZWQgOiBub2RlLl92YWx1ZTtcblx0fVxuXG5cdC8qKiBHZXRzIHdoZXRoZXIgdGhlIHRyZWUgaGFzIHRoZSBrZXksIG9yIGEgcGFyZW50IG9mIHRoZSBrZXksIGFscmVhZHkgaW5zZXJ0ZWQuICovXG5cdGhhc0tleU9yUGFyZW50KGtleTogSXRlcmFibGU8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdGxldCBub2RlID0gdGhpcy5yb290O1xuXHRcdGZvciAoY29uc3Qgc2VnbWVudCBvZiBrZXkpIHtcblx0XHRcdGNvbnN0IG5leHQgPSBub2RlLmNoaWxkcmVuPy5nZXQoc2VnbWVudCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHQuX3ZhbHVlICE9PSB1bnNldCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0bm9kZSA9IG5leHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqIEdldHMgd2hldGhlciB0aGUgdHJlZSBoYXMgdGhlIGdpdmVuIGtleSBvciBhbnkgY2hpbGRyZW4uICovXG5cdGhhc0tleU9yQ2hpbGRyZW4oa2V5OiBJdGVyYWJsZTxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0bGV0IG5vZGUgPSB0aGlzLnJvb3Q7XG5cdFx0Zm9yIChjb25zdCBzZWdtZW50IG9mIGtleSkge1xuXHRcdFx0Y29uc3QgbmV4dCA9IG5vZGUuY2hpbGRyZW4/LmdldChzZWdtZW50KTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdG5vZGUgPSBuZXh0O1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqIEdldHMgd2hldGhlciB0aGUgdHJlZSBoYXMgdGhlIGdpdmVuIGtleS4gKi9cblx0aGFzS2V5KGtleTogSXRlcmFibGU8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdGxldCBub2RlID0gdGhpcy5yb290O1xuXHRcdGZvciAoY29uc3Qgc2VnbWVudCBvZiBrZXkpIHtcblx0XHRcdGNvbnN0IG5leHQgPSBub2RlLmNoaWxkcmVuPy5nZXQoc2VnbWVudCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRub2RlID0gbmV4dDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm9kZS5fdmFsdWUgIT09IHVuc2V0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQYXRoVG9LZXkoa2V5OiBJdGVyYWJsZTxzdHJpbmc+KSB7XG5cdFx0Y29uc3QgcGF0aCA9IFt7IHBhcnQ6ICcnLCBub2RlOiB0aGlzLnJvb3QgfV07XG5cdFx0bGV0IGkgPSAwO1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiBrZXkpIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXRoW2ldLm5vZGUuY2hpbGRyZW4/LmdldChwYXJ0KTtcblx0XHRcdGlmICghbm9kZSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vZGUgbm90IGluIHRyZWVcblx0XHRcdH1cblxuXHRcdFx0cGF0aC5wdXNoKHsgcGFydCwgbm9kZSB9KTtcblx0XHRcdGkrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gcGF0aDtcblx0fVxuXG5cdHByaXZhdGUgb3BOb2RlKGtleTogSXRlcmFibGU8c3RyaW5nPiwgZm46IChub2RlOiBOb2RlPFY+KSA9PiB2b2lkLCBvbkRlc2NlbmQ/OiAobm9kZTogTm9kZTxWPikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGxldCBub2RlID0gdGhpcy5yb290O1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiBrZXkpIHtcblx0XHRcdGlmICghbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCBuZXh0ID0gbmV3IE5vZGU8Vj4oKTtcblx0XHRcdFx0bm9kZS5jaGlsZHJlbiA9IG5ldyBNYXAoW1twYXJ0LCBuZXh0XV0pO1xuXHRcdFx0XHRub2RlID0gbmV4dDtcblx0XHRcdH0gZWxzZSBpZiAoIW5vZGUuY2hpbGRyZW4uaGFzKHBhcnQpKSB7XG5cdFx0XHRcdGNvbnN0IG5leHQgPSBuZXcgTm9kZTxWPigpO1xuXHRcdFx0XHRub2RlLmNoaWxkcmVuLnNldChwYXJ0LCBuZXh0KTtcblx0XHRcdFx0bm9kZSA9IG5leHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRub2RlID0gbm9kZS5jaGlsZHJlbi5nZXQocGFydCkhO1xuXHRcdFx0fVxuXHRcdFx0b25EZXNjZW5kPy4obm9kZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2l6ZUJlZm9yZSA9IG5vZGUuX3ZhbHVlID09PSB1bnNldCA/IDAgOiAxO1xuXHRcdGZuKG5vZGUpO1xuXHRcdGNvbnN0IHNpemVBZnRlciA9IG5vZGUuX3ZhbHVlID09PSB1bnNldCA/IDAgOiAxO1xuXHRcdHRoaXMuX3NpemUgKz0gc2l6ZUFmdGVyIC0gc2l6ZUJlZm9yZTtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIGFuIGl0ZXJhYmxlIG9mIHRoZSB0cmVlIHZhbHVlcyBpbiBubyBkZWZpbmVkIG9yZGVyLiAqL1xuXHQqdmFsdWVzKCkge1xuXHRcdGZvciAoY29uc3QgeyBfdmFsdWUgfSBvZiBiZnNJdGVyYXRlKHRoaXMucm9vdCkpIHtcblx0XHRcdGlmIChfdmFsdWUgIT09IHVuc2V0KSB7XG5cdFx0XHRcdHlpZWxkIF92YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24qIGJmc0l0ZXJhdGU8VD4ocm9vdDogTm9kZTxUPik6IEl0ZXJhYmxlPE5vZGU8VD4+IHtcblx0Y29uc3Qgc3RhY2sgPSBbcm9vdF07XG5cdHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3Qgbm9kZSA9IHN0YWNrLnBvcCgpITtcblx0XHR5aWVsZCBub2RlO1xuXG5cdFx0aWYgKG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbi52YWx1ZXMoKSkge1xuXHRcdFx0XHRzdGFjay5wdXNoKGNoaWxkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTm9kZTxUPiBpbXBsZW1lbnRzIElQcmVmaXhUcmVlTm9kZTxUPiB7XG5cdHB1YmxpYyBjaGlsZHJlbj86IE1hcDxzdHJpbmcsIE5vZGU8VD4+O1xuXG5cdHB1YmxpYyBnZXQgdmFsdWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlID09PSB1bnNldCA/IHVuZGVmaW5lZCA6IHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0cHVibGljIHNldCB2YWx1ZSh2YWx1ZTogVCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3ZhbHVlID0gdmFsdWUgPT09IHVuZGVmaW5lZCA/IHVuc2V0IDogdmFsdWU7XG5cdH1c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
