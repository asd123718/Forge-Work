import { shuffle } from "./arrays.js";
import { assert } from "./assert.js";
import { CharCode } from "./charCode.js";
import { compare, compareIgnoreCase, compareSubstring, compareSubstringIgnoreCase } from "./strings.js";
class StringIterator {
  constructor() {
    this._value = "";
    this._pos = 0;
  }
  reset(key) {
    this._value = key;
    this._pos = 0;
    return this;
  }
  next() {
    this._pos += 1;
    return this;
  }
  hasNext() {
    return this._pos < this._value.length - 1;
  }
  cmp(a) {
    const aCode = a.charCodeAt(0);
    const thisCode = this._value.charCodeAt(this._pos);
    return aCode - thisCode;
  }
  value() {
    return this._value[this._pos];
  }
}
class ConfigKeysIterator {
  constructor(_caseSensitive = true) {
    this._caseSensitive = _caseSensitive;
  }
  reset(key) {
    this._value = key;
    this._from = 0;
    this._to = 0;
    return this.next();
  }
  hasNext() {
    return this._to < this._value.length;
  }
  next() {
    this._from = this._to;
    let justSeps = true;
    for (; this._to < this._value.length; this._to++) {
      const ch = this._value.charCodeAt(this._to);
      if (ch === CharCode.Period) {
        if (justSeps) {
          this._from++;
        } else {
          break;
        }
      } else {
        justSeps = false;
      }
    }
    return this;
  }
  cmp(a) {
    return this._caseSensitive ? compareSubstring(a, this._value, 0, a.length, this._from, this._to) : compareSubstringIgnoreCase(a, this._value, 0, a.length, this._from, this._to);
  }
  value() {
    return this._value.substring(this._from, this._to);
  }
}
class PathIterator {
  constructor(_splitOnBackslash = true, _caseSensitive = true) {
    this._splitOnBackslash = _splitOnBackslash;
    this._caseSensitive = _caseSensitive;
  }
  reset(key) {
    this._from = 0;
    this._to = 0;
    this._value = key;
    this._valueLen = key.length;
    for (let pos = key.length - 1; pos >= 0; pos--, this._valueLen--) {
      const ch = this._value.charCodeAt(pos);
      if (!(ch === CharCode.Slash || this._splitOnBackslash && ch === CharCode.Backslash)) {
        break;
      }
    }
    return this.next();
  }
  hasNext() {
    return this._to < this._valueLen;
  }
  next() {
    this._from = this._to;
    let justSeps = true;
    for (; this._to < this._valueLen; this._to++) {
      const ch = this._value.charCodeAt(this._to);
      if (ch === CharCode.Slash || this._splitOnBackslash && ch === CharCode.Backslash) {
        if (justSeps) {
          this._from++;
        } else {
          break;
        }
      } else {
        justSeps = false;
      }
    }
    return this;
  }
  cmp(a) {
    return this._caseSensitive ? compareSubstring(a, this._value, 0, a.length, this._from, this._to) : compareSubstringIgnoreCase(a, this._value, 0, a.length, this._from, this._to);
  }
  value() {
    return this._value.substring(this._from, this._to);
  }
}
var UriIteratorState = /* @__PURE__ */ ((UriIteratorState2) => {
  UriIteratorState2[UriIteratorState2["Scheme"] = 1] = "Scheme";
  UriIteratorState2[UriIteratorState2["Authority"] = 2] = "Authority";
  UriIteratorState2[UriIteratorState2["Path"] = 3] = "Path";
  UriIteratorState2[UriIteratorState2["Query"] = 4] = "Query";
  UriIteratorState2[UriIteratorState2["Fragment"] = 5] = "Fragment";
  return UriIteratorState2;
})(UriIteratorState || {});
class UriIterator {
  constructor(_ignorePathCasing, _ignoreQueryAndFragment) {
    this._ignorePathCasing = _ignorePathCasing;
    this._ignoreQueryAndFragment = _ignoreQueryAndFragment;
    this._states = [];
    this._stateIdx = 0;
  }
  reset(key) {
    this._value = key;
    this._states = [];
    if (this._value.scheme) {
      this._states.push(1 /* Scheme */);
    }
    if (this._value.authority) {
      this._states.push(2 /* Authority */);
    }
    if (this._value.path) {
      this._pathIterator = new PathIterator(false, !this._ignorePathCasing(key));
      this._pathIterator.reset(key.path);
      if (this._pathIterator.value()) {
        this._states.push(3 /* Path */);
      }
    }
    if (!this._ignoreQueryAndFragment(key)) {
      if (this._value.query) {
        this._states.push(4 /* Query */);
      }
      if (this._value.fragment) {
        this._states.push(5 /* Fragment */);
      }
    }
    this._stateIdx = 0;
    return this;
  }
  next() {
    if (this._states[this._stateIdx] === 3 /* Path */ && this._pathIterator.hasNext()) {
      this._pathIterator.next();
    } else {
      this._stateIdx += 1;
    }
    return this;
  }
  hasNext() {
    return this._states[this._stateIdx] === 3 /* Path */ && this._pathIterator.hasNext() || this._stateIdx < this._states.length - 1;
  }
  cmp(a) {
    if (this._states[this._stateIdx] === 1 /* Scheme */) {
      return compareIgnoreCase(a, this._value.scheme);
    } else if (this._states[this._stateIdx] === 2 /* Authority */) {
      return compareIgnoreCase(a, this._value.authority);
    } else if (this._states[this._stateIdx] === 3 /* Path */) {
      return this._pathIterator.cmp(a);
    } else if (this._states[this._stateIdx] === 4 /* Query */) {
      return compare(a, this._value.query);
    } else if (this._states[this._stateIdx] === 5 /* Fragment */) {
      return compare(a, this._value.fragment);
    }
    throw new Error();
  }
  value() {
    if (this._states[this._stateIdx] === 1 /* Scheme */) {
      return this._value.scheme;
    } else if (this._states[this._stateIdx] === 2 /* Authority */) {
      return this._value.authority;
    } else if (this._states[this._stateIdx] === 3 /* Path */) {
      return this._pathIterator.value();
    } else if (this._states[this._stateIdx] === 4 /* Query */) {
      return this._value.query;
    } else if (this._states[this._stateIdx] === 5 /* Fragment */) {
      return this._value.fragment;
    }
    throw new Error();
  }
}
const _Undef = class _Undef {
  static wrap(value) {
    return value === void 0 ? _Undef.Val : value;
  }
  static unwrap(value) {
    return value === _Undef.Val ? void 0 : value;
  }
};
_Undef.Val = /* @__PURE__ */ Symbol("undefined_placeholder");
let Undef = _Undef;
class TernarySearchTreeNode {
  constructor() {
    this.height = 1;
    this.value = void 0;
    this.key = void 0;
    this.left = void 0;
    this.mid = void 0;
    this.right = void 0;
  }
  isEmpty() {
    return !this.left && !this.mid && !this.right && this.value === void 0;
  }
  rotateLeft() {
    const tmp = this.right;
    this.right = tmp.left;
    tmp.left = this;
    this.updateHeight();
    tmp.updateHeight();
    return tmp;
  }
  rotateRight() {
    const tmp = this.left;
    this.left = tmp.right;
    tmp.right = this;
    this.updateHeight();
    tmp.updateHeight();
    return tmp;
  }
  updateHeight() {
    this.height = 1 + Math.max(this.heightLeft, this.heightRight);
  }
  balanceFactor() {
    return this.heightRight - this.heightLeft;
  }
  get heightLeft() {
    return this.left?.height ?? 0;
  }
  get heightRight() {
    return this.right?.height ?? 0;
  }
}
var Dir = /* @__PURE__ */ ((Dir2) => {
  Dir2[Dir2["Left"] = -1] = "Left";
  Dir2[Dir2["Mid"] = 0] = "Mid";
  Dir2[Dir2["Right"] = 1] = "Right";
  return Dir2;
})(Dir || {});
class TernarySearchTree {
  static forUris(ignorePathCasing = () => false, ignoreQueryAndFragment = () => false) {
    return new TernarySearchTree(new UriIterator(ignorePathCasing, ignoreQueryAndFragment));
  }
  static forPaths(ignorePathCasing = false) {
    return new TernarySearchTree(new PathIterator(void 0, !ignorePathCasing));
  }
  static forStrings() {
    return new TernarySearchTree(new StringIterator());
  }
  static forConfigKeys() {
    return new TernarySearchTree(new ConfigKeysIterator());
  }
  constructor(segments) {
    this._iter = segments;
  }
  clear() {
    this._root = void 0;
  }
  fill(values, keys) {
    if (keys) {
      const arr = keys.slice(0);
      shuffle(arr);
      for (const k of arr) {
        this.set(k, values);
      }
    } else {
      const arr = values.slice(0);
      shuffle(arr);
      for (const entry of arr) {
        this.set(entry[0], entry[1]);
      }
    }
  }
  set(key, element) {
    const iter = this._iter.reset(key);
    let node;
    if (!this._root) {
      this._root = new TernarySearchTreeNode();
      this._root.segment = iter.value();
    }
    const stack = [];
    node = this._root;
    while (true) {
      const val = iter.cmp(node.segment);
      if (val > 0) {
        if (!node.left) {
          node.left = new TernarySearchTreeNode();
          node.left.segment = iter.value();
        }
        stack.push([-1 /* Left */, node]);
        node = node.left;
      } else if (val < 0) {
        if (!node.right) {
          node.right = new TernarySearchTreeNode();
          node.right.segment = iter.value();
        }
        stack.push([1 /* Right */, node]);
        node = node.right;
      } else if (iter.hasNext()) {
        iter.next();
        if (!node.mid) {
          node.mid = new TernarySearchTreeNode();
          node.mid.segment = iter.value();
        }
        stack.push([0 /* Mid */, node]);
        node = node.mid;
      } else {
        break;
      }
    }
    const oldElement = Undef.unwrap(node.value);
    node.value = Undef.wrap(element);
    node.key = key;
    for (let i = stack.length - 1; i >= 0; i--) {
      const node2 = stack[i][1];
      node2.updateHeight();
      const bf = node2.balanceFactor();
      if (bf < -1 || bf > 1) {
        const d1 = stack[i][0];
        const d2 = stack[i + 1][0];
        if (d1 === 1 /* Right */ && d2 === 1 /* Right */) {
          stack[i][1] = node2.rotateLeft();
        } else if (d1 === -1 /* Left */ && d2 === -1 /* Left */) {
          stack[i][1] = node2.rotateRight();
        } else if (d1 === 1 /* Right */ && d2 === -1 /* Left */) {
          node2.right = stack[i + 1][1] = stack[i + 1][1].rotateRight();
          stack[i][1] = node2.rotateLeft();
        } else if (d1 === -1 /* Left */ && d2 === 1 /* Right */) {
          node2.left = stack[i + 1][1] = stack[i + 1][1].rotateLeft();
          stack[i][1] = node2.rotateRight();
        } else {
          throw new Error();
        }
        if (i > 0) {
          switch (stack[i - 1][0]) {
            case -1 /* Left */:
              stack[i - 1][1].left = stack[i][1];
              break;
            case 1 /* Right */:
              stack[i - 1][1].right = stack[i][1];
              break;
            case 0 /* Mid */:
              stack[i - 1][1].mid = stack[i][1];
              break;
          }
        } else {
          this._root = stack[0][1];
        }
      }
    }
    return oldElement;
  }
  get(key) {
    return Undef.unwrap(this._getNode(key)?.value);
  }
  _getNode(key) {
    const iter = this._iter.reset(key);
    let node = this._root;
    while (node) {
      const val = iter.cmp(node.segment);
      if (val > 0) {
        node = node.left;
      } else if (val < 0) {
        node = node.right;
      } else if (iter.hasNext()) {
        iter.next();
        node = node.mid;
      } else {
        break;
      }
    }
    return node;
  }
  has(key) {
    const node = this._getNode(key);
    return !(node?.value === void 0 && node?.mid === void 0);
  }
  delete(key) {
    return this._delete(key, false);
  }
  deleteSuperstr(key) {
    return this._delete(key, true);
  }
  _delete(key, superStr) {
    const iter = this._iter.reset(key);
    const stack = [];
    let node = this._root;
    while (node) {
      const val = iter.cmp(node.segment);
      if (val > 0) {
        stack.push([-1 /* Left */, node]);
        node = node.left;
      } else if (val < 0) {
        stack.push([1 /* Right */, node]);
        node = node.right;
      } else if (iter.hasNext()) {
        iter.next();
        stack.push([0 /* Mid */, node]);
        node = node.mid;
      } else {
        break;
      }
    }
    if (!node) {
      return;
    }
    if (superStr) {
      node.left = void 0;
      node.mid = void 0;
      node.right = void 0;
      node.height = 1;
    } else {
      node.key = void 0;
      node.value = void 0;
    }
    if (!node.mid && !node.value) {
      if (node.left && node.right) {
        const stack2 = [[1 /* Right */, node]];
        const min = this._min(node.right, stack2);
        if (min.key) {
          node.key = min.key;
          node.value = min.value;
          node.segment = min.segment;
          const newChild = min.right;
          if (stack2.length > 1) {
            const [dir, parent] = stack2[stack2.length - 1];
            switch (dir) {
              case -1 /* Left */:
                parent.left = newChild;
                break;
              case 0 /* Mid */:
                assert(false);
              case 1 /* Right */:
                assert(false);
            }
          } else {
            node.right = newChild;
          }
          const newChild2 = this._balanceByStack(stack2);
          if (stack.length > 0) {
            const [dir, parent] = stack[stack.length - 1];
            switch (dir) {
              case -1 /* Left */:
                parent.left = newChild2;
                break;
              case 0 /* Mid */:
                parent.mid = newChild2;
                break;
              case 1 /* Right */:
                parent.right = newChild2;
                break;
            }
          } else {
            this._root = newChild2;
          }
        }
      } else {
        const newChild = node.left ?? node.right;
        if (stack.length > 0) {
          const [dir, parent] = stack[stack.length - 1];
          switch (dir) {
            case -1 /* Left */:
              parent.left = newChild;
              break;
            case 0 /* Mid */:
              parent.mid = newChild;
              break;
            case 1 /* Right */:
              parent.right = newChild;
              break;
          }
        } else {
          this._root = newChild;
        }
      }
    }
    this._root = this._balanceByStack(stack) ?? this._root;
  }
  _min(node, stack) {
    while (node.left) {
      stack.push([-1 /* Left */, node]);
      node = node.left;
    }
    return node;
  }
  _balanceByStack(stack) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i][1];
      node.updateHeight();
      const bf = node.balanceFactor();
      if (bf > 1) {
        if (node.right.balanceFactor() >= 0) {
          stack[i][1] = node.rotateLeft();
        } else {
          node.right = node.right.rotateRight();
          stack[i][1] = node.rotateLeft();
        }
      } else if (bf < -1) {
        if (node.left.balanceFactor() <= 0) {
          stack[i][1] = node.rotateRight();
        } else {
          node.left = node.left.rotateLeft();
          stack[i][1] = node.rotateRight();
        }
      }
      if (i > 0) {
        switch (stack[i - 1][0]) {
          case -1 /* Left */:
            stack[i - 1][1].left = stack[i][1];
            break;
          case 1 /* Right */:
            stack[i - 1][1].right = stack[i][1];
            break;
          case 0 /* Mid */:
            stack[i - 1][1].mid = stack[i][1];
            break;
        }
      } else {
        return stack[0][1];
      }
    }
    return void 0;
  }
  findSubstr(key) {
    const iter = this._iter.reset(key);
    let node = this._root;
    let candidate = void 0;
    while (node) {
      const val = iter.cmp(node.segment);
      if (val > 0) {
        node = node.left;
      } else if (val < 0) {
        node = node.right;
      } else if (iter.hasNext()) {
        iter.next();
        candidate = Undef.unwrap(node.value) || candidate;
        node = node.mid;
      } else {
        break;
      }
    }
    return node && Undef.unwrap(node.value) || candidate;
  }
  findSuperstr(key) {
    return this._findSuperstrOrElement(key, false);
  }
  _findSuperstrOrElement(key, allowValue) {
    const iter = this._iter.reset(key);
    let node = this._root;
    while (node) {
      const val = iter.cmp(node.segment);
      if (val > 0) {
        node = node.left;
      } else if (val < 0) {
        node = node.right;
      } else if (iter.hasNext()) {
        iter.next();
        node = node.mid;
      } else {
        if (!node.mid) {
          if (allowValue) {
            return Undef.unwrap(node.value);
          } else {
            return void 0;
          }
        } else {
          return this._entries(node.mid);
        }
      }
    }
    return void 0;
  }
  hasElementOrSubtree(key) {
    return this._findSuperstrOrElement(key, true) !== void 0;
  }
  forEach(callback) {
    for (const [key, value] of this) {
      callback(value, key);
    }
  }
  *[Symbol.iterator]() {
    yield* this._entries(this._root);
  }
  _entries(node) {
    const result = [];
    this._dfsEntries(node, result);
    return result[Symbol.iterator]();
  }
  _dfsEntries(node, bucket) {
    if (!node) {
      return;
    }
    if (node.left) {
      this._dfsEntries(node.left, bucket);
    }
    if (node.value !== void 0) {
      bucket.push([node.key, Undef.unwrap(node.value)]);
    }
    if (node.mid) {
      this._dfsEntries(node.mid, bucket);
    }
    if (node.right) {
      this._dfsEntries(node.right, bucket);
    }
  }
  // for debug/testing
  _isBalanced() {
    const nodeIsBalanced = (node) => {
      if (!node) {
        return true;
      }
      const bf = node.balanceFactor();
      if (bf < -1 || bf > 1) {
        return false;
      }
      return nodeIsBalanced(node.left) && nodeIsBalanced(node.right);
    };
    return nodeIsBalanced(this._root);
  }
}
export {
  ConfigKeysIterator,
  PathIterator,
  StringIterator,
  TernarySearchTree,
  UriIterator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHRlcm5hcnlTZWFyY2hUcmVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc2h1ZmZsZSB9IGZyb20gJy4vYXJyYXlzLmpzJztcbmltcG9ydCB7IGFzc2VydCB9IGZyb20gJy4vYXNzZXJ0LmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBjb21wYXJlLCBjb21wYXJlSWdub3JlQ2FzZSwgY29tcGFyZVN1YnN0cmluZywgY29tcGFyZVN1YnN0cmluZ0lnbm9yZUNhc2UgfSBmcm9tICcuL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi91cmkuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElLZXlJdGVyYXRvcjxLPiB7XG5cdHJlc2V0KGtleTogSyk6IHRoaXM7XG5cdG5leHQoKTogdGhpcztcblxuXHRoYXNOZXh0KCk6IGJvb2xlYW47XG5cdGNtcChhOiBzdHJpbmcpOiBudW1iZXI7XG5cdHZhbHVlKCk6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFN0cmluZ0l0ZXJhdG9yIGltcGxlbWVudHMgSUtleUl0ZXJhdG9yPHN0cmluZz4ge1xuXG5cdHByaXZhdGUgX3ZhbHVlOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfcG9zOiBudW1iZXIgPSAwO1xuXG5cdHJlc2V0KGtleTogc3RyaW5nKTogdGhpcyB7XG5cdFx0dGhpcy5fdmFsdWUgPSBrZXk7XG5cdFx0dGhpcy5fcG9zID0gMDtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdG5leHQoKTogdGhpcyB7XG5cdFx0dGhpcy5fcG9zICs9IDE7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRoYXNOZXh0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wb3MgPCB0aGlzLl92YWx1ZS5sZW5ndGggLSAxO1xuXHR9XG5cblx0Y21wKGE6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0Y29uc3QgYUNvZGUgPSBhLmNoYXJDb2RlQXQoMCk7XG5cdFx0Y29uc3QgdGhpc0NvZGUgPSB0aGlzLl92YWx1ZS5jaGFyQ29kZUF0KHRoaXMuX3Bvcyk7XG5cdFx0cmV0dXJuIGFDb2RlIC0gdGhpc0NvZGU7XG5cdH1cblxuXHR2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZVt0aGlzLl9wb3NdO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWdLZXlzSXRlcmF0b3IgaW1wbGVtZW50cyBJS2V5SXRlcmF0b3I8c3RyaW5nPiB7XG5cblx0cHJpdmF0ZSBfdmFsdWUhOiBzdHJpbmc7XG5cdHByaXZhdGUgX2Zyb20hOiBudW1iZXI7XG5cdHByaXZhdGUgX3RvITogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nhc2VTZW5zaXRpdmU6IGJvb2xlYW4gPSB0cnVlXG5cdCkgeyB9XG5cblx0cmVzZXQoa2V5OiBzdHJpbmcpOiB0aGlzIHtcblx0XHR0aGlzLl92YWx1ZSA9IGtleTtcblx0XHR0aGlzLl9mcm9tID0gMDtcblx0XHR0aGlzLl90byA9IDA7XG5cdFx0cmV0dXJuIHRoaXMubmV4dCgpO1xuXHR9XG5cblx0aGFzTmV4dCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdG8gPCB0aGlzLl92YWx1ZS5sZW5ndGg7XG5cdH1cblxuXHRuZXh0KCk6IHRoaXMge1xuXHRcdC8vIHRoaXMuX2RhdGEgPSBrZXkuc3BsaXQoL1tcXFxcL10vKS5maWx0ZXIocyA9PiAhIXMpO1xuXHRcdHRoaXMuX2Zyb20gPSB0aGlzLl90bztcblx0XHRsZXQganVzdFNlcHMgPSB0cnVlO1xuXHRcdGZvciAoOyB0aGlzLl90byA8IHRoaXMuX3ZhbHVlLmxlbmd0aDsgdGhpcy5fdG8rKykge1xuXHRcdFx0Y29uc3QgY2ggPSB0aGlzLl92YWx1ZS5jaGFyQ29kZUF0KHRoaXMuX3RvKTtcblx0XHRcdGlmIChjaCA9PT0gQ2hhckNvZGUuUGVyaW9kKSB7XG5cdFx0XHRcdGlmIChqdXN0U2Vwcykge1xuXHRcdFx0XHRcdHRoaXMuX2Zyb20rKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0anVzdFNlcHMgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRjbXAoYTogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FzZVNlbnNpdGl2ZVxuXHRcdFx0PyBjb21wYXJlU3Vic3RyaW5nKGEsIHRoaXMuX3ZhbHVlLCAwLCBhLmxlbmd0aCwgdGhpcy5fZnJvbSwgdGhpcy5fdG8pXG5cdFx0XHQ6IGNvbXBhcmVTdWJzdHJpbmdJZ25vcmVDYXNlKGEsIHRoaXMuX3ZhbHVlLCAwLCBhLmxlbmd0aCwgdGhpcy5fZnJvbSwgdGhpcy5fdG8pO1xuXHR9XG5cblx0dmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWUuc3Vic3RyaW5nKHRoaXMuX2Zyb20sIHRoaXMuX3RvKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUGF0aEl0ZXJhdG9yIGltcGxlbWVudHMgSUtleUl0ZXJhdG9yPHN0cmluZz4ge1xuXG5cdHByaXZhdGUgX3ZhbHVlITogc3RyaW5nO1xuXHRwcml2YXRlIF92YWx1ZUxlbiE6IG51bWJlcjtcblx0cHJpdmF0ZSBfZnJvbSE6IG51bWJlcjtcblx0cHJpdmF0ZSBfdG8hOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3BsaXRPbkJhY2tzbGFzaDogYm9vbGVhbiA9IHRydWUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2FzZVNlbnNpdGl2ZTogYm9vbGVhbiA9IHRydWVcblx0KSB7IH1cblxuXHRyZXNldChrZXk6IHN0cmluZyk6IHRoaXMge1xuXHRcdHRoaXMuX2Zyb20gPSAwO1xuXHRcdHRoaXMuX3RvID0gMDtcblx0XHR0aGlzLl92YWx1ZSA9IGtleTtcblx0XHR0aGlzLl92YWx1ZUxlbiA9IGtleS5sZW5ndGg7XG5cdFx0Zm9yIChsZXQgcG9zID0ga2V5Lmxlbmd0aCAtIDE7IHBvcyA+PSAwOyBwb3MtLSwgdGhpcy5fdmFsdWVMZW4tLSkge1xuXHRcdFx0Y29uc3QgY2ggPSB0aGlzLl92YWx1ZS5jaGFyQ29kZUF0KHBvcyk7XG5cdFx0XHRpZiAoIShjaCA9PT0gQ2hhckNvZGUuU2xhc2ggfHwgdGhpcy5fc3BsaXRPbkJhY2tzbGFzaCAmJiBjaCA9PT0gQ2hhckNvZGUuQmFja3NsYXNoKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5uZXh0KCk7XG5cdH1cblxuXHRoYXNOZXh0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90byA8IHRoaXMuX3ZhbHVlTGVuO1xuXHR9XG5cblx0bmV4dCgpOiB0aGlzIHtcblx0XHQvLyB0aGlzLl9kYXRhID0ga2V5LnNwbGl0KC9bXFxcXC9dLykuZmlsdGVyKHMgPT4gISFzKTtcblx0XHR0aGlzLl9mcm9tID0gdGhpcy5fdG87XG5cdFx0bGV0IGp1c3RTZXBzID0gdHJ1ZTtcblx0XHRmb3IgKDsgdGhpcy5fdG8gPCB0aGlzLl92YWx1ZUxlbjsgdGhpcy5fdG8rKykge1xuXHRcdFx0Y29uc3QgY2ggPSB0aGlzLl92YWx1ZS5jaGFyQ29kZUF0KHRoaXMuX3RvKTtcblx0XHRcdGlmIChjaCA9PT0gQ2hhckNvZGUuU2xhc2ggfHwgdGhpcy5fc3BsaXRPbkJhY2tzbGFzaCAmJiBjaCA9PT0gQ2hhckNvZGUuQmFja3NsYXNoKSB7XG5cdFx0XHRcdGlmIChqdXN0U2Vwcykge1xuXHRcdFx0XHRcdHRoaXMuX2Zyb20rKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0anVzdFNlcHMgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRjbXAoYTogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FzZVNlbnNpdGl2ZVxuXHRcdFx0PyBjb21wYXJlU3Vic3RyaW5nKGEsIHRoaXMuX3ZhbHVlLCAwLCBhLmxlbmd0aCwgdGhpcy5fZnJvbSwgdGhpcy5fdG8pXG5cdFx0XHQ6IGNvbXBhcmVTdWJzdHJpbmdJZ25vcmVDYXNlKGEsIHRoaXMuX3ZhbHVlLCAwLCBhLmxlbmd0aCwgdGhpcy5fZnJvbSwgdGhpcy5fdG8pO1xuXHR9XG5cblx0dmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWUuc3Vic3RyaW5nKHRoaXMuX2Zyb20sIHRoaXMuX3RvKTtcblx0fVxufVxuXG5jb25zdCBlbnVtIFVyaUl0ZXJhdG9yU3RhdGUge1xuXHRTY2hlbWUgPSAxLCBBdXRob3JpdHkgPSAyLCBQYXRoID0gMywgUXVlcnkgPSA0LCBGcmFnbWVudCA9IDVcbn1cblxuZXhwb3J0IGNsYXNzIFVyaUl0ZXJhdG9yIGltcGxlbWVudHMgSUtleUl0ZXJhdG9yPFVSST4ge1xuXG5cdHByaXZhdGUgX3BhdGhJdGVyYXRvciE6IFBhdGhJdGVyYXRvcjtcblx0cHJpdmF0ZSBfdmFsdWUhOiBVUkk7XG5cdHByaXZhdGUgX3N0YXRlczogVXJpSXRlcmF0b3JTdGF0ZVtdID0gW107XG5cdHByaXZhdGUgX3N0YXRlSWR4OiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lnbm9yZVBhdGhDYXNpbmc6ICh1cmk6IFVSSSkgPT4gYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pZ25vcmVRdWVyeUFuZEZyYWdtZW50OiAodXJpOiBVUkkpID0+IGJvb2xlYW4pIHsgfVxuXG5cdHJlc2V0KGtleTogVVJJKTogdGhpcyB7XG5cdFx0dGhpcy5fdmFsdWUgPSBrZXk7XG5cdFx0dGhpcy5fc3RhdGVzID0gW107XG5cdFx0aWYgKHRoaXMuX3ZhbHVlLnNjaGVtZSkge1xuXHRcdFx0dGhpcy5fc3RhdGVzLnB1c2goVXJpSXRlcmF0b3JTdGF0ZS5TY2hlbWUpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdmFsdWUuYXV0aG9yaXR5KSB7XG5cdFx0XHR0aGlzLl9zdGF0ZXMucHVzaChVcmlJdGVyYXRvclN0YXRlLkF1dGhvcml0eSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl92YWx1ZS5wYXRoKSB7XG5cdFx0XHR0aGlzLl9wYXRoSXRlcmF0b3IgPSBuZXcgUGF0aEl0ZXJhdG9yKGZhbHNlLCAhdGhpcy5faWdub3JlUGF0aENhc2luZyhrZXkpKTtcblx0XHRcdHRoaXMuX3BhdGhJdGVyYXRvci5yZXNldChrZXkucGF0aCk7XG5cdFx0XHRpZiAodGhpcy5fcGF0aEl0ZXJhdG9yLnZhbHVlKCkpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGVzLnB1c2goVXJpSXRlcmF0b3JTdGF0ZS5QYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9pZ25vcmVRdWVyeUFuZEZyYWdtZW50KGtleSkpIHtcblx0XHRcdGlmICh0aGlzLl92YWx1ZS5xdWVyeSkge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZXMucHVzaChVcmlJdGVyYXRvclN0YXRlLlF1ZXJ5KTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl92YWx1ZS5mcmFnbWVudCkge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZXMucHVzaChVcmlJdGVyYXRvclN0YXRlLkZyYWdtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVJZHggPSAwO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0bmV4dCgpOiB0aGlzIHtcblx0XHRpZiAodGhpcy5fc3RhdGVzW3RoaXMuX3N0YXRlSWR4XSA9PT0gVXJpSXRlcmF0b3JTdGF0ZS5QYXRoICYmIHRoaXMuX3BhdGhJdGVyYXRvci5oYXNOZXh0KCkpIHtcblx0XHRcdHRoaXMuX3BhdGhJdGVyYXRvci5uZXh0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0YXRlSWR4ICs9IDE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0aGFzTmV4dCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX3N0YXRlc1t0aGlzLl9zdGF0ZUlkeF0gPT09IFVyaUl0ZXJhdG9yU3RhdGUuUGF0aCAmJiB0aGlzLl9wYXRoSXRlcmF0b3IuaGFzTmV4dCgpKVxuXHRcdFx0fHwgdGhpcy5fc3RhdGVJZHggPCB0aGlzLl9zdGF0ZXMubGVuZ3RoIC0gMTtcblx0fVxuXG5cdGNtcChhOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9zdGF0ZXNbdGhpcy5fc3RhdGVJZHhdID09PSBVcmlJdGVyYXRvclN0YXRlLlNjaGVtZSkge1xuXHRcdFx0cmV0dXJuIGNvbXBhcmVJZ25vcmVDYXNlKGEsIHRoaXMuX3ZhbHVlLnNjaGVtZSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9zdGF0ZXNbdGhpcy5fc3RhdGVJZHhdID09PSBVcmlJdGVyYXRvclN0YXRlLkF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIGNvbXBhcmVJZ25vcmVDYXNlKGEsIHRoaXMuX3ZhbHVlLmF1dGhvcml0eSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9zdGF0ZXNbdGhpcy5fc3RhdGVJZHhdID09PSBVcmlJdGVyYXRvclN0YXRlLlBhdGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wYXRoSXRlcmF0b3IuY21wKGEpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fc3RhdGVzW3RoaXMuX3N0YXRlSWR4XSA9PT0gVXJpSXRlcmF0b3JTdGF0ZS5RdWVyeSkge1xuXHRcdFx0cmV0dXJuIGNvbXBhcmUoYSwgdGhpcy5fdmFsdWUucXVlcnkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fc3RhdGVzW3RoaXMuX3N0YXRlSWR4XSA9PT0gVXJpSXRlcmF0b3JTdGF0ZS5GcmFnbWVudCkge1xuXHRcdFx0cmV0dXJuIGNvbXBhcmUoYSwgdGhpcy5fdmFsdWUuZnJhZ21lbnQpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoKTtcblx0fVxuXG5cdHZhbHVlKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlc1t0aGlzLl9zdGF0ZUlkeF0gPT09IFVyaUl0ZXJhdG9yU3RhdGUuU2NoZW1lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdmFsdWUuc2NoZW1lO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fc3RhdGVzW3RoaXMuX3N0YXRlSWR4XSA9PT0gVXJpSXRlcmF0b3JTdGF0ZS5BdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiB0aGlzLl92YWx1ZS5hdXRob3JpdHk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9zdGF0ZXNbdGhpcy5fc3RhdGVJZHhdID09PSBVcmlJdGVyYXRvclN0YXRlLlBhdGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wYXRoSXRlcmF0b3IudmFsdWUoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3N0YXRlc1t0aGlzLl9zdGF0ZUlkeF0gPT09IFVyaUl0ZXJhdG9yU3RhdGUuUXVlcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLl92YWx1ZS5xdWVyeTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3N0YXRlc1t0aGlzLl9zdGF0ZUlkeF0gPT09IFVyaUl0ZXJhdG9yU3RhdGUuRnJhZ21lbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLl92YWx1ZS5mcmFnbWVudDtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgVW5kZWYge1xuXG5cdHN0YXRpYyByZWFkb25seSBWYWw6IHVuaXF1ZSBzeW1ib2wgPSBTeW1ib2woJ3VuZGVmaW5lZF9wbGFjZWhvbGRlcicpO1xuXG5cdHN0YXRpYyB3cmFwPFY+KHZhbHVlOiBWIHwgdW5kZWZpbmVkKTogViB8IHR5cGVvZiBVbmRlZi5WYWwge1xuXHRcdHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkID8gVW5kZWYuVmFsIDogdmFsdWU7XG5cdH1cblxuXHRzdGF0aWMgdW53cmFwPFY+KHZhbHVlOiBWIHwgdHlwZW9mIFVuZGVmLlZhbCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB2YWx1ZSA9PT0gVW5kZWYuVmFsID8gdW5kZWZpbmVkIDogdmFsdWU7XG5cdH1cbn1cblxuY2xhc3MgVGVybmFyeVNlYXJjaFRyZWVOb2RlPEssIFY+IHtcblx0aGVpZ2h0OiBudW1iZXIgPSAxO1xuXHRzZWdtZW50ITogc3RyaW5nO1xuXHR2YWx1ZTogViB8IHR5cGVvZiBVbmRlZi5WYWwgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGtleTogSyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0bGVmdDogVGVybmFyeVNlYXJjaFRyZWVOb2RlPEssIFY+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRtaWQ6IFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cmlnaHQ6IFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5sZWZ0ICYmICF0aGlzLm1pZCAmJiAhdGhpcy5yaWdodCAmJiB0aGlzLnZhbHVlID09PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRyb3RhdGVMZWZ0KCkge1xuXHRcdGNvbnN0IHRtcCA9IHRoaXMucmlnaHQhO1xuXHRcdHRoaXMucmlnaHQgPSB0bXAubGVmdDtcblx0XHR0bXAubGVmdCA9IHRoaXM7XG5cdFx0dGhpcy51cGRhdGVIZWlnaHQoKTtcblx0XHR0bXAudXBkYXRlSGVpZ2h0KCk7XG5cdFx0cmV0dXJuIHRtcDtcblx0fVxuXG5cdHJvdGF0ZVJpZ2h0KCkge1xuXHRcdGNvbnN0IHRtcCA9IHRoaXMubGVmdCE7XG5cdFx0dGhpcy5sZWZ0ID0gdG1wLnJpZ2h0O1xuXHRcdHRtcC5yaWdodCA9IHRoaXM7XG5cdFx0dGhpcy51cGRhdGVIZWlnaHQoKTtcblx0XHR0bXAudXBkYXRlSGVpZ2h0KCk7XG5cdFx0cmV0dXJuIHRtcDtcblx0fVxuXG5cdHVwZGF0ZUhlaWdodCgpIHtcblx0XHR0aGlzLmhlaWdodCA9IDEgKyBNYXRoLm1heCh0aGlzLmhlaWdodExlZnQsIHRoaXMuaGVpZ2h0UmlnaHQpO1xuXHR9XG5cblx0YmFsYW5jZUZhY3RvcigpIHtcblx0XHRyZXR1cm4gdGhpcy5oZWlnaHRSaWdodCAtIHRoaXMuaGVpZ2h0TGVmdDtcblx0fVxuXG5cdGdldCBoZWlnaHRMZWZ0KCkge1xuXHRcdHJldHVybiB0aGlzLmxlZnQ/LmhlaWdodCA/PyAwO1xuXHR9XG5cblx0Z2V0IGhlaWdodFJpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLnJpZ2h0Py5oZWlnaHQgPz8gMDtcblx0fVxufVxuXG5jb25zdCBlbnVtIERpciB7XG5cdExlZnQgPSAtMSxcblx0TWlkID0gMCxcblx0UmlnaHQgPSAxXG59XG5cbmV4cG9ydCBjbGFzcyBUZXJuYXJ5U2VhcmNoVHJlZTxLLCBWPiB7XG5cblx0c3RhdGljIGZvclVyaXM8RT4oaWdub3JlUGF0aENhc2luZzogKGtleTogVVJJKSA9PiBib29sZWFuID0gKCkgPT4gZmFsc2UsIGlnbm9yZVF1ZXJ5QW5kRnJhZ21lbnQ6IChrZXk6IFVSSSkgPT4gYm9vbGVhbiA9ICgpID0+IGZhbHNlKTogVGVybmFyeVNlYXJjaFRyZWU8VVJJLCBFPiB7XG5cdFx0cmV0dXJuIG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIEU+KG5ldyBVcmlJdGVyYXRvcihpZ25vcmVQYXRoQ2FzaW5nLCBpZ25vcmVRdWVyeUFuZEZyYWdtZW50KSk7XG5cdH1cblxuXHRzdGF0aWMgZm9yUGF0aHM8RT4oaWdub3JlUGF0aENhc2luZyA9IGZhbHNlKTogVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBFPiB7XG5cdFx0cmV0dXJuIG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxzdHJpbmcsIEU+KG5ldyBQYXRoSXRlcmF0b3IodW5kZWZpbmVkLCAhaWdub3JlUGF0aENhc2luZykpO1xuXHR9XG5cblx0c3RhdGljIGZvclN0cmluZ3M8RT4oKTogVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBFPiB7XG5cdFx0cmV0dXJuIG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxzdHJpbmcsIEU+KG5ldyBTdHJpbmdJdGVyYXRvcigpKTtcblx0fVxuXG5cdHN0YXRpYyBmb3JDb25maWdLZXlzPEU+KCk6IFRlcm5hcnlTZWFyY2hUcmVlPHN0cmluZywgRT4ge1xuXHRcdHJldHVybiBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBFPihuZXcgQ29uZmlnS2V5c0l0ZXJhdG9yKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXRlcjogSUtleUl0ZXJhdG9yPEs+O1xuXHRwcml2YXRlIF9yb290OiBUZXJuYXJ5U2VhcmNoVHJlZU5vZGU8SywgVj4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3Ioc2VnbWVudHM6IElLZXlJdGVyYXRvcjxLPikge1xuXHRcdHRoaXMuX2l0ZXIgPSBzZWdtZW50cztcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3QgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogRmlsbCB0aGUgdHJlZSB3aXRoIHRoZSBzYW1lIHZhbHVlIG9mIHRoZSBnaXZlbiBrZXlzXG5cdCAqL1xuXHRmaWxsKGVsZW1lbnQ6IFYsIGtleXM6IHJlYWRvbmx5IEtbXSk6IHZvaWQ7XG5cdC8qKlxuXHQgKiBGaWxsIHRoZSB0cmVlIHdpdGggZ2l2ZW4gW2tleSx2YWx1ZV0tdHVwbGVzXG5cdCAqL1xuXHRmaWxsKHZhbHVlczogcmVhZG9ubHkgW0ssIFZdW10pOiB2b2lkO1xuXHRmaWxsKHZhbHVlczogcmVhZG9ubHkgW0ssIFZdW10gfCBWLCBrZXlzPzogcmVhZG9ubHkgS1tdKTogdm9pZCB7XG5cdFx0aWYgKGtleXMpIHtcblx0XHRcdGNvbnN0IGFyciA9IGtleXMuc2xpY2UoMCk7XG5cdFx0XHRzaHVmZmxlKGFycik7XG5cdFx0XHRmb3IgKGNvbnN0IGsgb2YgYXJyKSB7XG5cdFx0XHRcdHRoaXMuc2V0KGssICg8Vj52YWx1ZXMpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYXJyID0gKDxbSywgVl1bXT52YWx1ZXMpLnNsaWNlKDApO1xuXHRcdFx0c2h1ZmZsZShhcnIpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBhcnIpIHtcblx0XHRcdFx0dGhpcy5zZXQoZW50cnlbMF0sIGVudHJ5WzFdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXQoa2V5OiBLLCBlbGVtZW50OiBWKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaXRlciA9IHRoaXMuX2l0ZXIucmVzZXQoa2V5KTtcblx0XHRsZXQgbm9kZTogVGVybmFyeVNlYXJjaFRyZWVOb2RlPEssIFY+O1xuXG5cdFx0aWYgKCF0aGlzLl9yb290KSB7XG5cdFx0XHR0aGlzLl9yb290ID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPigpO1xuXHRcdFx0dGhpcy5fcm9vdC5zZWdtZW50ID0gaXRlci52YWx1ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBzdGFjazogW0RpciwgVGVybmFyeVNlYXJjaFRyZWVOb2RlPEssIFY+XVtdID0gW107XG5cblx0XHQvLyBmaW5kIGluc2VydF9ub2RlXG5cdFx0bm9kZSA9IHRoaXMuX3Jvb3Q7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IHZhbCA9IGl0ZXIuY21wKG5vZGUuc2VnbWVudCk7XG5cdFx0XHRpZiAodmFsID4gMCkge1xuXHRcdFx0XHQvLyBsZWZ0XG5cdFx0XHRcdGlmICghbm9kZS5sZWZ0KSB7XG5cdFx0XHRcdFx0bm9kZS5sZWZ0ID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPigpO1xuXHRcdFx0XHRcdG5vZGUubGVmdC5zZWdtZW50ID0gaXRlci52YWx1ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YWNrLnB1c2goW0Rpci5MZWZ0LCBub2RlXSk7XG5cdFx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cblx0XHRcdH0gZWxzZSBpZiAodmFsIDwgMCkge1xuXHRcdFx0XHQvLyByaWdodFxuXHRcdFx0XHRpZiAoIW5vZGUucmlnaHQpIHtcblx0XHRcdFx0XHRub2RlLnJpZ2h0ID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPigpO1xuXHRcdFx0XHRcdG5vZGUucmlnaHQuc2VnbWVudCA9IGl0ZXIudmFsdWUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGFjay5wdXNoKFtEaXIuUmlnaHQsIG5vZGVdKTtcblx0XHRcdFx0bm9kZSA9IG5vZGUucmlnaHQ7XG5cblx0XHRcdH0gZWxzZSBpZiAoaXRlci5oYXNOZXh0KCkpIHtcblx0XHRcdFx0Ly8gbWlkXG5cdFx0XHRcdGl0ZXIubmV4dCgpO1xuXHRcdFx0XHRpZiAoIW5vZGUubWlkKSB7XG5cdFx0XHRcdFx0bm9kZS5taWQgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWVOb2RlPEssIFY+KCk7XG5cdFx0XHRcdFx0bm9kZS5taWQuc2VnbWVudCA9IGl0ZXIudmFsdWUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGFjay5wdXNoKFtEaXIuTWlkLCBub2RlXSk7XG5cdFx0XHRcdG5vZGUgPSBub2RlLm1pZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHNldCB2YWx1ZVxuXHRcdGNvbnN0IG9sZEVsZW1lbnQgPSBVbmRlZi51bndyYXAobm9kZS52YWx1ZSk7XG5cdFx0bm9kZS52YWx1ZSA9IFVuZGVmLndyYXAoZWxlbWVudCk7XG5cdFx0bm9kZS5rZXkgPSBrZXk7XG5cblx0XHQvLyBiYWxhbmNlXG5cdFx0Zm9yIChsZXQgaSA9IHN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBub2RlID0gc3RhY2tbaV1bMV07XG5cblx0XHRcdG5vZGUudXBkYXRlSGVpZ2h0KCk7XG5cdFx0XHRjb25zdCBiZiA9IG5vZGUuYmFsYW5jZUZhY3RvcigpO1xuXG5cdFx0XHRpZiAoYmYgPCAtMSB8fCBiZiA+IDEpIHtcblx0XHRcdFx0Ly8gbmVlZHMgcm90YXRlXG5cdFx0XHRcdGNvbnN0IGQxID0gc3RhY2tbaV1bMF07XG5cdFx0XHRcdGNvbnN0IGQyID0gc3RhY2tbaSArIDFdWzBdO1xuXG5cdFx0XHRcdGlmIChkMSA9PT0gRGlyLlJpZ2h0ICYmIGQyID09PSBEaXIuUmlnaHQpIHtcblx0XHRcdFx0XHQvL3JpZ2h0LCByaWdodCAtPiByb3RhdGUgbGVmdFxuXHRcdFx0XHRcdHN0YWNrW2ldWzFdID0gbm9kZS5yb3RhdGVMZWZ0KCk7XG5cblx0XHRcdFx0fSBlbHNlIGlmIChkMSA9PT0gRGlyLkxlZnQgJiYgZDIgPT09IERpci5MZWZ0KSB7XG5cdFx0XHRcdFx0Ly8gbGVmdCwgbGVmdCAtPiByb3RhdGUgcmlnaHRcblx0XHRcdFx0XHRzdGFja1tpXVsxXSA9IG5vZGUucm90YXRlUmlnaHQoKTtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKGQxID09PSBEaXIuUmlnaHQgJiYgZDIgPT09IERpci5MZWZ0KSB7XG5cdFx0XHRcdFx0Ly8gcmlnaHQsIGxlZnQgLT4gZG91YmxlIHJvdGF0ZSByaWdodCwgbGVmdFxuXHRcdFx0XHRcdG5vZGUucmlnaHQgPSBzdGFja1tpICsgMV1bMV0gPSBzdGFja1tpICsgMV1bMV0ucm90YXRlUmlnaHQoKTtcblx0XHRcdFx0XHRzdGFja1tpXVsxXSA9IG5vZGUucm90YXRlTGVmdCgpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoZDEgPT09IERpci5MZWZ0ICYmIGQyID09PSBEaXIuUmlnaHQpIHtcblx0XHRcdFx0XHQvLyBsZWZ0LCByaWdodCAtPiBkb3VibGUgcm90YXRlIGxlZnQsIHJpZ2h0XG5cdFx0XHRcdFx0bm9kZS5sZWZ0ID0gc3RhY2tbaSArIDFdWzFdID0gc3RhY2tbaSArIDFdWzFdLnJvdGF0ZUxlZnQoKTtcblx0XHRcdFx0XHRzdGFja1tpXVsxXSA9IG5vZGUucm90YXRlUmlnaHQoKTtcblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gcGF0Y2ggcGF0aCB0byBwYXJlbnRcblx0XHRcdFx0aWYgKGkgPiAwKSB7XG5cdFx0XHRcdFx0c3dpdGNoIChzdGFja1tpIC0gMV1bMF0pIHtcblx0XHRcdFx0XHRcdGNhc2UgRGlyLkxlZnQ6XG5cdFx0XHRcdFx0XHRcdHN0YWNrW2kgLSAxXVsxXS5sZWZ0ID0gc3RhY2tbaV1bMV07XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSBEaXIuUmlnaHQ6XG5cdFx0XHRcdFx0XHRcdHN0YWNrW2kgLSAxXVsxXS5yaWdodCA9IHN0YWNrW2ldWzFdO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRGlyLk1pZDpcblx0XHRcdFx0XHRcdFx0c3RhY2tbaSAtIDFdWzFdLm1pZCA9IHN0YWNrW2ldWzFdO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fcm9vdCA9IHN0YWNrWzBdWzFdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9sZEVsZW1lbnQ7XG5cdH1cblxuXHRnZXQoa2V5OiBLKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIFVuZGVmLnVud3JhcCh0aGlzLl9nZXROb2RlKGtleSk/LnZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE5vZGUoa2V5OiBLKSB7XG5cdFx0Y29uc3QgaXRlciA9IHRoaXMuX2l0ZXIucmVzZXQoa2V5KTtcblx0XHRsZXQgbm9kZSA9IHRoaXMuX3Jvb3Q7XG5cdFx0d2hpbGUgKG5vZGUpIHtcblx0XHRcdGNvbnN0IHZhbCA9IGl0ZXIuY21wKG5vZGUuc2VnbWVudCk7XG5cdFx0XHRpZiAodmFsID4gMCkge1xuXHRcdFx0XHQvLyBsZWZ0XG5cdFx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbCA8IDApIHtcblx0XHRcdFx0Ly8gcmlnaHRcblx0XHRcdFx0bm9kZSA9IG5vZGUucmlnaHQ7XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZXIuaGFzTmV4dCgpKSB7XG5cdFx0XHRcdC8vIG1pZFxuXHRcdFx0XHRpdGVyLm5leHQoKTtcblx0XHRcdFx0bm9kZSA9IG5vZGUubWlkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBub2RlO1xuXHR9XG5cblx0aGFzKGtleTogSyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9nZXROb2RlKGtleSk7XG5cdFx0cmV0dXJuICEobm9kZT8udmFsdWUgPT09IHVuZGVmaW5lZCAmJiBub2RlPy5taWQgPT09IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRkZWxldGUoa2V5OiBLKTogdm9pZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlbGV0ZShrZXksIGZhbHNlKTtcblx0fVxuXG5cdGRlbGV0ZVN1cGVyc3RyKGtleTogSyk6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLl9kZWxldGUoa2V5LCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2RlbGV0ZShrZXk6IEssIHN1cGVyU3RyOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlciA9IHRoaXMuX2l0ZXIucmVzZXQoa2V5KTtcblx0XHRjb25zdCBzdGFjazogW0RpciwgVGVybmFyeVNlYXJjaFRyZWVOb2RlPEssIFY+XVtdID0gW107XG5cdFx0bGV0IG5vZGUgPSB0aGlzLl9yb290O1xuXG5cdFx0Ly8gZmluZCBub2RlXG5cdFx0d2hpbGUgKG5vZGUpIHtcblx0XHRcdGNvbnN0IHZhbCA9IGl0ZXIuY21wKG5vZGUuc2VnbWVudCk7XG5cdFx0XHRpZiAodmFsID4gMCkge1xuXHRcdFx0XHQvLyBsZWZ0XG5cdFx0XHRcdHN0YWNrLnB1c2goW0Rpci5MZWZ0LCBub2RlXSk7XG5cdFx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbCA8IDApIHtcblx0XHRcdFx0Ly8gcmlnaHRcblx0XHRcdFx0c3RhY2sucHVzaChbRGlyLlJpZ2h0LCBub2RlXSk7XG5cdFx0XHRcdG5vZGUgPSBub2RlLnJpZ2h0O1xuXHRcdFx0fSBlbHNlIGlmIChpdGVyLmhhc05leHQoKSkge1xuXHRcdFx0XHQvLyBtaWRcblx0XHRcdFx0aXRlci5uZXh0KCk7XG5cdFx0XHRcdHN0YWNrLnB1c2goW0Rpci5NaWQsIG5vZGVdKTtcblx0XHRcdFx0bm9kZSA9IG5vZGUubWlkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHQvLyBub2RlIG5vdCBmb3VuZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChzdXBlclN0cikge1xuXHRcdFx0Ly8gcmVtb3ZpbmcgY2hpbGRyZW4sIHJlc2V0IGhlaWdodFxuXHRcdFx0bm9kZS5sZWZ0ID0gdW5kZWZpbmVkO1xuXHRcdFx0bm9kZS5taWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRub2RlLnJpZ2h0ID0gdW5kZWZpbmVkO1xuXHRcdFx0bm9kZS5oZWlnaHQgPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyByZW1vdmluZyBlbGVtZW50XG5cdFx0XHRub2RlLmtleSA9IHVuZGVmaW5lZDtcblx0XHRcdG5vZGUudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQlNUIG5vZGUgcmVtb3ZhbFxuXHRcdGlmICghbm9kZS5taWQgJiYgIW5vZGUudmFsdWUpIHtcblx0XHRcdGlmIChub2RlLmxlZnQgJiYgbm9kZS5yaWdodCkge1xuXHRcdFx0XHQvLyBmdWxsIG5vZGVcblx0XHRcdFx0Ly8gcmVwbGFjZSBkZWxldGVkLW5vZGUgd2l0aCB0aGUgbWluLW5vZGUgb2YgdGhlIHJpZ2h0IGJyYW5jaC5cblx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgbm8gdHJ1ZSBtaW4tbm9kZSBsZWF2ZSB0aGluZ3MgYXMgdGhleSBhcmVcblx0XHRcdFx0Y29uc3Qgc3RhY2syOiB0eXBlb2Ygc3RhY2sgPSBbW0Rpci5SaWdodCwgbm9kZV1dO1xuXHRcdFx0XHRjb25zdCBtaW4gPSB0aGlzLl9taW4obm9kZS5yaWdodCwgc3RhY2syKTtcblxuXHRcdFx0XHRpZiAobWluLmtleSkge1xuXG5cdFx0XHRcdFx0bm9kZS5rZXkgPSBtaW4ua2V5O1xuXHRcdFx0XHRcdG5vZGUudmFsdWUgPSBtaW4udmFsdWU7XG5cdFx0XHRcdFx0bm9kZS5zZWdtZW50ID0gbWluLnNlZ21lbnQ7XG5cblx0XHRcdFx0XHQvLyByZW1vdmUgTk9ERSAoaW5vcmRlciBzdWNjZXNzb3IgY2FuIG9ubHkgaGF2ZSByaWdodCBjaGlsZClcblx0XHRcdFx0XHRjb25zdCBuZXdDaGlsZCA9IG1pbi5yaWdodDtcblx0XHRcdFx0XHRpZiAoc3RhY2syLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IFtkaXIsIHBhcmVudF0gPSBzdGFjazJbc3RhY2syLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdFx0c3dpdGNoIChkaXIpIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSBEaXIuTGVmdDogcGFyZW50LmxlZnQgPSBuZXdDaGlsZDsgYnJlYWs7XG5cdFx0XHRcdFx0XHRcdGNhc2UgRGlyLk1pZDogYXNzZXJ0KGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0Y2FzZSBEaXIuUmlnaHQ6IGFzc2VydChmYWxzZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG5vZGUucmlnaHQgPSBuZXdDaGlsZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBiYWxhbmNlIHJpZ2h0IGJyYW5jaCBhbmQgVVBEQVRFIHBhcmVudCBwb2ludGVyIGZvciBzdGFja1xuXHRcdFx0XHRcdGNvbnN0IG5ld0NoaWxkMiA9IHRoaXMuX2JhbGFuY2VCeVN0YWNrKHN0YWNrMikhO1xuXHRcdFx0XHRcdGlmIChzdGFjay5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBbZGlyLCBwYXJlbnRdID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XG5cdFx0XHRcdFx0XHRzd2l0Y2ggKGRpcikge1xuXHRcdFx0XHRcdFx0XHRjYXNlIERpci5MZWZ0OiBwYXJlbnQubGVmdCA9IG5ld0NoaWxkMjsgYnJlYWs7XG5cdFx0XHRcdFx0XHRcdGNhc2UgRGlyLk1pZDogcGFyZW50Lm1pZCA9IG5ld0NoaWxkMjsgYnJlYWs7XG5cdFx0XHRcdFx0XHRcdGNhc2UgRGlyLlJpZ2h0OiBwYXJlbnQucmlnaHQgPSBuZXdDaGlsZDI7IGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yb290ID0gbmV3Q2hpbGQyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBlbXB0eSBvciBoYWxmIGVtcHR5XG5cdFx0XHRcdGNvbnN0IG5ld0NoaWxkID0gbm9kZS5sZWZ0ID8/IG5vZGUucmlnaHQ7XG5cdFx0XHRcdGlmIChzdGFjay5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgW2RpciwgcGFyZW50XSA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdHN3aXRjaCAoZGlyKSB7XG5cdFx0XHRcdFx0XHRjYXNlIERpci5MZWZ0OiBwYXJlbnQubGVmdCA9IG5ld0NoaWxkOyBicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRGlyLk1pZDogcGFyZW50Lm1pZCA9IG5ld0NoaWxkOyBicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRGlyLlJpZ2h0OiBwYXJlbnQucmlnaHQgPSBuZXdDaGlsZDsgYnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3Jvb3QgPSBuZXdDaGlsZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFWTCBiYWxhbmNlXG5cdFx0dGhpcy5fcm9vdCA9IHRoaXMuX2JhbGFuY2VCeVN0YWNrKHN0YWNrKSA/PyB0aGlzLl9yb290O1xuXHR9XG5cblx0cHJpdmF0ZSBfbWluKG5vZGU6IFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPiwgc3RhY2s6IFtEaXIsIFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPl1bXSk6IFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPiB7XG5cdFx0d2hpbGUgKG5vZGUubGVmdCkge1xuXHRcdFx0c3RhY2sucHVzaChbRGlyLkxlZnQsIG5vZGVdKTtcblx0XHRcdG5vZGUgPSBub2RlLmxlZnQ7XG5cdFx0fVxuXHRcdHJldHVybiBub2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmFsYW5jZUJ5U3RhY2soc3RhY2s6IFtEaXIsIFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPl1bXSkge1xuXG5cdFx0Zm9yIChsZXQgaSA9IHN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBub2RlID0gc3RhY2tbaV1bMV07XG5cblx0XHRcdG5vZGUudXBkYXRlSGVpZ2h0KCk7XG5cdFx0XHRjb25zdCBiZiA9IG5vZGUuYmFsYW5jZUZhY3RvcigpO1xuXHRcdFx0aWYgKGJmID4gMSkge1xuXHRcdFx0XHQvLyByaWdodCBoZWF2eVxuXHRcdFx0XHRpZiAobm9kZS5yaWdodCEuYmFsYW5jZUZhY3RvcigpID49IDApIHtcblx0XHRcdFx0XHQvLyByaWdodCwgcmlnaHQgLT4gcm90YXRlIGxlZnRcblx0XHRcdFx0XHRzdGFja1tpXVsxXSA9IG5vZGUucm90YXRlTGVmdCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHJpZ2h0LCBsZWZ0IC0+IGRvdWJsZSByb3RhdGVcblx0XHRcdFx0XHRub2RlLnJpZ2h0ID0gbm9kZS5yaWdodCEucm90YXRlUmlnaHQoKTtcblx0XHRcdFx0XHRzdGFja1tpXVsxXSA9IG5vZGUucm90YXRlTGVmdCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSBpZiAoYmYgPCAtMSkge1xuXHRcdFx0XHQvLyBsZWZ0IGhlYXZ5XG5cdFx0XHRcdGlmIChub2RlLmxlZnQhLmJhbGFuY2VGYWN0b3IoKSA8PSAwKSB7XG5cdFx0XHRcdFx0Ly8gbGVmdCwgbGVmdCAtPiByb3RhdGUgcmlnaHRcblx0XHRcdFx0XHRzdGFja1tpXVsxXSA9IG5vZGUucm90YXRlUmlnaHQoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBsZWZ0LCByaWdodCAtPiBkb3VibGUgcm90YXRlXG5cdFx0XHRcdFx0bm9kZS5sZWZ0ID0gbm9kZS5sZWZ0IS5yb3RhdGVMZWZ0KCk7XG5cdFx0XHRcdFx0c3RhY2tbaV1bMV0gPSBub2RlLnJvdGF0ZVJpZ2h0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gcGF0Y2ggcGF0aCB0byBwYXJlbnRcblx0XHRcdGlmIChpID4gMCkge1xuXHRcdFx0XHRzd2l0Y2ggKHN0YWNrW2kgLSAxXVswXSkge1xuXHRcdFx0XHRcdGNhc2UgRGlyLkxlZnQ6XG5cdFx0XHRcdFx0XHRzdGFja1tpIC0gMV1bMV0ubGVmdCA9IHN0YWNrW2ldWzFdO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBEaXIuUmlnaHQ6XG5cdFx0XHRcdFx0XHRzdGFja1tpIC0gMV1bMV0ucmlnaHQgPSBzdGFja1tpXVsxXTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgRGlyLk1pZDpcblx0XHRcdFx0XHRcdHN0YWNrW2kgLSAxXVsxXS5taWQgPSBzdGFja1tpXVsxXTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gc3RhY2tbMF1bMV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGZpbmRTdWJzdHIoa2V5OiBLKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaXRlciA9IHRoaXMuX2l0ZXIucmVzZXQoa2V5KTtcblx0XHRsZXQgbm9kZSA9IHRoaXMuX3Jvb3Q7XG5cdFx0bGV0IGNhbmRpZGF0ZTogViB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR3aGlsZSAobm9kZSkge1xuXHRcdFx0Y29uc3QgdmFsID0gaXRlci5jbXAobm9kZS5zZWdtZW50KTtcblx0XHRcdGlmICh2YWwgPiAwKSB7XG5cdFx0XHRcdC8vIGxlZnRcblx0XHRcdFx0bm9kZSA9IG5vZGUubGVmdDtcblx0XHRcdH0gZWxzZSBpZiAodmFsIDwgMCkge1xuXHRcdFx0XHQvLyByaWdodFxuXHRcdFx0XHRub2RlID0gbm9kZS5yaWdodDtcblx0XHRcdH0gZWxzZSBpZiAoaXRlci5oYXNOZXh0KCkpIHtcblx0XHRcdFx0Ly8gbWlkXG5cdFx0XHRcdGl0ZXIubmV4dCgpO1xuXHRcdFx0XHRjYW5kaWRhdGUgPSBVbmRlZi51bndyYXAobm9kZS52YWx1ZSkgfHwgY2FuZGlkYXRlO1xuXHRcdFx0XHRub2RlID0gbm9kZS5taWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5vZGUgJiYgVW5kZWYudW53cmFwKG5vZGUudmFsdWUpIHx8IGNhbmRpZGF0ZTtcblx0fVxuXG5cdGZpbmRTdXBlcnN0cihrZXk6IEspOiBJdGVyYWJsZUl0ZXJhdG9yPFtLLCBWXT4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9maW5kU3VwZXJzdHJPckVsZW1lbnQoa2V5LCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kU3VwZXJzdHJPckVsZW1lbnQoa2V5OiBLLCBhbGxvd1ZhbHVlOiB0cnVlKTogSXRlcmFibGVJdGVyYXRvcjxbSywgVl0+IHwgViB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZmluZFN1cGVyc3RyT3JFbGVtZW50KGtleTogSywgYWxsb3dWYWx1ZTogZmFsc2UpOiBJdGVyYWJsZUl0ZXJhdG9yPFtLLCBWXT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZpbmRTdXBlcnN0ck9yRWxlbWVudChrZXk6IEssIGFsbG93VmFsdWU6IGJvb2xlYW4pOiBJdGVyYWJsZUl0ZXJhdG9yPFtLLCBWXT4gfCBWIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpdGVyID0gdGhpcy5faXRlci5yZXNldChrZXkpO1xuXHRcdGxldCBub2RlID0gdGhpcy5fcm9vdDtcblx0XHR3aGlsZSAobm9kZSkge1xuXHRcdFx0Y29uc3QgdmFsID0gaXRlci5jbXAobm9kZS5zZWdtZW50KTtcblx0XHRcdGlmICh2YWwgPiAwKSB7XG5cdFx0XHRcdC8vIGxlZnRcblx0XHRcdFx0bm9kZSA9IG5vZGUubGVmdDtcblx0XHRcdH0gZWxzZSBpZiAodmFsIDwgMCkge1xuXHRcdFx0XHQvLyByaWdodFxuXHRcdFx0XHRub2RlID0gbm9kZS5yaWdodDtcblx0XHRcdH0gZWxzZSBpZiAoaXRlci5oYXNOZXh0KCkpIHtcblx0XHRcdFx0Ly8gbWlkXG5cdFx0XHRcdGl0ZXIubmV4dCgpO1xuXHRcdFx0XHRub2RlID0gbm9kZS5taWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBjb2xsZWN0XG5cdFx0XHRcdGlmICghbm9kZS5taWQpIHtcblx0XHRcdFx0XHRpZiAoYWxsb3dWYWx1ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFVuZGVmLnVud3JhcChub2RlLnZhbHVlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2VudHJpZXMobm9kZS5taWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRoYXNFbGVtZW50T3JTdWJ0cmVlKGtleTogSyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9maW5kU3VwZXJzdHJPckVsZW1lbnQoa2V5LCB0cnVlKSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0Zm9yRWFjaChjYWxsYmFjazogKHZhbHVlOiBWLCBpbmRleDogSykgPT4gdW5rbm93bik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMpIHtcblx0XHRcdGNhbGxiYWNrKHZhbHVlLCBrZXkpO1xuXHRcdH1cblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFtLLCBWXT4ge1xuXHRcdHlpZWxkKiB0aGlzLl9lbnRyaWVzKHRoaXMuX3Jvb3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW50cmllcyhub2RlOiBUZXJuYXJ5U2VhcmNoVHJlZU5vZGU8SywgVj4gfCB1bmRlZmluZWQpOiBJdGVyYWJsZUl0ZXJhdG9yPFtLLCBWXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogW0ssIFZdW10gPSBbXTtcblx0XHR0aGlzLl9kZnNFbnRyaWVzKG5vZGUsIHJlc3VsdCk7XG5cdFx0cmV0dXJuIHJlc3VsdFtTeW1ib2wuaXRlcmF0b3JdKCk7XG5cdH1cblxuXHRwcml2YXRlIF9kZnNFbnRyaWVzKG5vZGU6IFRlcm5hcnlTZWFyY2hUcmVlTm9kZTxLLCBWPiB8IHVuZGVmaW5lZCwgYnVja2V0OiBbSywgVl1bXSkge1xuXHRcdC8vIERGU1xuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAobm9kZS5sZWZ0KSB7XG5cdFx0XHR0aGlzLl9kZnNFbnRyaWVzKG5vZGUubGVmdCwgYnVja2V0KTtcblx0XHR9XG5cdFx0aWYgKG5vZGUudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YnVja2V0LnB1c2goW25vZGUua2V5ISwgVW5kZWYudW53cmFwKG5vZGUudmFsdWUpIV0pO1xuXHRcdH1cblx0XHRpZiAobm9kZS5taWQpIHtcblx0XHRcdHRoaXMuX2Rmc0VudHJpZXMobm9kZS5taWQsIGJ1Y2tldCk7XG5cdFx0fVxuXHRcdGlmIChub2RlLnJpZ2h0KSB7XG5cdFx0XHR0aGlzLl9kZnNFbnRyaWVzKG5vZGUucmlnaHQsIGJ1Y2tldCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gZm9yIGRlYnVnL3Rlc3Rpbmdcblx0X2lzQmFsYW5jZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgbm9kZUlzQmFsYW5jZWQgPSAobm9kZTogVGVybmFyeVNlYXJjaFRyZWVOb2RlPHVua25vd24sIHVua25vd24+IHwgdW5kZWZpbmVkKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBiZiA9IG5vZGUuYmFsYW5jZUZhY3RvcigpO1xuXHRcdFx0aWYgKGJmIDwgLTEgfHwgYmYgPiAxKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBub2RlSXNCYWxhbmNlZChub2RlLmxlZnQpICYmIG5vZGVJc0JhbGFuY2VkKG5vZGUucmlnaHQpO1xuXHRcdH07XG5cdFx0cmV0dXJuIG5vZGVJc0JhbGFuY2VkKHRoaXMuX3Jvb3QpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxtQkFBbUIsa0JBQWtCLGtDQUFrQztBQVlsRixNQUFNLGVBQStDO0FBQUEsRUFBckQ7QUFFTixTQUFRLFNBQWlCO0FBQ3pCLFNBQVEsT0FBZTtBQUFBO0FBQUEsRUFFdkIsTUFBTSxLQUFtQjtBQUN4QixTQUFLLFNBQVM7QUFDZCxTQUFLLE9BQU87QUFDWixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBYTtBQUNaLFNBQUssUUFBUTtBQUNiLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxVQUFtQjtBQUNsQixXQUFPLEtBQUssT0FBTyxLQUFLLE9BQU8sU0FBUztBQUFBLEVBQ3pDO0FBQUEsRUFFQSxJQUFJLEdBQW1CO0FBQ3RCLFVBQU0sUUFBUSxFQUFFLFdBQVcsQ0FBQztBQUM1QixVQUFNLFdBQVcsS0FBSyxPQUFPLFdBQVcsS0FBSyxJQUFJO0FBQ2pELFdBQU8sUUFBUTtBQUFBLEVBQ2hCO0FBQUEsRUFFQSxRQUFnQjtBQUNmLFdBQU8sS0FBSyxPQUFPLEtBQUssSUFBSTtBQUFBLEVBQzdCO0FBQ0Q7QUFFTyxNQUFNLG1CQUFtRDtBQUFBLEVBTS9ELFlBQ2tCLGlCQUEwQixNQUMxQztBQURnQjtBQUFBLEVBQ2Q7QUFBQSxFQUVKLE1BQU0sS0FBbUI7QUFDeEIsU0FBSyxTQUFTO0FBQ2QsU0FBSyxRQUFRO0FBQ2IsU0FBSyxNQUFNO0FBQ1gsV0FBTyxLQUFLLEtBQUs7QUFBQSxFQUNsQjtBQUFBLEVBRUEsVUFBbUI7QUFDbEIsV0FBTyxLQUFLLE1BQU0sS0FBSyxPQUFPO0FBQUEsRUFDL0I7QUFBQSxFQUVBLE9BQWE7QUFFWixTQUFLLFFBQVEsS0FBSztBQUNsQixRQUFJLFdBQVc7QUFDZixXQUFPLEtBQUssTUFBTSxLQUFLLE9BQU8sUUFBUSxLQUFLLE9BQU87QUFDakQsWUFBTSxLQUFLLEtBQUssT0FBTyxXQUFXLEtBQUssR0FBRztBQUMxQyxVQUFJLE9BQU8sU0FBUyxRQUFRO0FBQzNCLFlBQUksVUFBVTtBQUNiLGVBQUs7QUFBQSxRQUNOLE9BQU87QUFDTjtBQUFBLFFBQ0Q7QUFBQSxNQUNELE9BQU87QUFDTixtQkFBVztBQUFBLE1BQ1o7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQUksR0FBbUI7QUFDdEIsV0FBTyxLQUFLLGlCQUNULGlCQUFpQixHQUFHLEtBQUssUUFBUSxHQUFHLEVBQUUsUUFBUSxLQUFLLE9BQU8sS0FBSyxHQUFHLElBQ2xFLDJCQUEyQixHQUFHLEtBQUssUUFBUSxHQUFHLEVBQUUsUUFBUSxLQUFLLE9BQU8sS0FBSyxHQUFHO0FBQUEsRUFDaEY7QUFBQSxFQUVBLFFBQWdCO0FBQ2YsV0FBTyxLQUFLLE9BQU8sVUFBVSxLQUFLLE9BQU8sS0FBSyxHQUFHO0FBQUEsRUFDbEQ7QUFDRDtBQUVPLE1BQU0sYUFBNkM7QUFBQSxFQU96RCxZQUNrQixvQkFBNkIsTUFDN0IsaUJBQTBCLE1BQzFDO0FBRmdCO0FBQ0E7QUFBQSxFQUNkO0FBQUEsRUFFSixNQUFNLEtBQW1CO0FBQ3hCLFNBQUssUUFBUTtBQUNiLFNBQUssTUFBTTtBQUNYLFNBQUssU0FBUztBQUNkLFNBQUssWUFBWSxJQUFJO0FBQ3JCLGFBQVMsTUFBTSxJQUFJLFNBQVMsR0FBRyxPQUFPLEdBQUcsT0FBTyxLQUFLLGFBQWE7QUFDakUsWUFBTSxLQUFLLEtBQUssT0FBTyxXQUFXLEdBQUc7QUFDckMsVUFBSSxFQUFFLE9BQU8sU0FBUyxTQUFTLEtBQUsscUJBQXFCLE9BQU8sU0FBUyxZQUFZO0FBQ3BGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLEtBQUssS0FBSztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxVQUFtQjtBQUNsQixXQUFPLEtBQUssTUFBTSxLQUFLO0FBQUEsRUFDeEI7QUFBQSxFQUVBLE9BQWE7QUFFWixTQUFLLFFBQVEsS0FBSztBQUNsQixRQUFJLFdBQVc7QUFDZixXQUFPLEtBQUssTUFBTSxLQUFLLFdBQVcsS0FBSyxPQUFPO0FBQzdDLFlBQU0sS0FBSyxLQUFLLE9BQU8sV0FBVyxLQUFLLEdBQUc7QUFDMUMsVUFBSSxPQUFPLFNBQVMsU0FBUyxLQUFLLHFCQUFxQixPQUFPLFNBQVMsV0FBVztBQUNqRixZQUFJLFVBQVU7QUFDYixlQUFLO0FBQUEsUUFDTixPQUFPO0FBQ047QUFBQSxRQUNEO0FBQUEsTUFDRCxPQUFPO0FBQ04sbUJBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxJQUFJLEdBQW1CO0FBQ3RCLFdBQU8sS0FBSyxpQkFDVCxpQkFBaUIsR0FBRyxLQUFLLFFBQVEsR0FBRyxFQUFFLFFBQVEsS0FBSyxPQUFPLEtBQUssR0FBRyxJQUNsRSwyQkFBMkIsR0FBRyxLQUFLLFFBQVEsR0FBRyxFQUFFLFFBQVEsS0FBSyxPQUFPLEtBQUssR0FBRztBQUFBLEVBQ2hGO0FBQUEsRUFFQSxRQUFnQjtBQUNmLFdBQU8sS0FBSyxPQUFPLFVBQVUsS0FBSyxPQUFPLEtBQUssR0FBRztBQUFBLEVBQ2xEO0FBQ0Q7QUFFQSxJQUFXLG1CQUFYLGtCQUFXQSxzQkFBWDtBQUNDLEVBQUFBLG9DQUFBLFlBQVMsS0FBVDtBQUFZLEVBQUFBLG9DQUFBLGVBQVksS0FBWjtBQUFlLEVBQUFBLG9DQUFBLFVBQU8sS0FBUDtBQUFVLEVBQUFBLG9DQUFBLFdBQVEsS0FBUjtBQUFXLEVBQUFBLG9DQUFBLGNBQVcsS0FBWDtBQUR0QyxTQUFBQTtBQUFBLEdBQUE7QUFJSixNQUFNLFlBQXlDO0FBQUEsRUFPckQsWUFDa0IsbUJBQ0EseUJBQWdEO0FBRGhEO0FBQ0E7QUFMbEIsU0FBUSxVQUE4QixDQUFDO0FBQ3ZDLFNBQVEsWUFBb0I7QUFBQSxFQUl3QztBQUFBLEVBRXBFLE1BQU0sS0FBZ0I7QUFDckIsU0FBSyxTQUFTO0FBQ2QsU0FBSyxVQUFVLENBQUM7QUFDaEIsUUFBSSxLQUFLLE9BQU8sUUFBUTtBQUN2QixXQUFLLFFBQVEsS0FBSyxjQUF1QjtBQUFBLElBQzFDO0FBQ0EsUUFBSSxLQUFLLE9BQU8sV0FBVztBQUMxQixXQUFLLFFBQVEsS0FBSyxpQkFBMEI7QUFBQSxJQUM3QztBQUNBLFFBQUksS0FBSyxPQUFPLE1BQU07QUFDckIsV0FBSyxnQkFBZ0IsSUFBSSxhQUFhLE9BQU8sQ0FBQyxLQUFLLGtCQUFrQixHQUFHLENBQUM7QUFDekUsV0FBSyxjQUFjLE1BQU0sSUFBSSxJQUFJO0FBQ2pDLFVBQUksS0FBSyxjQUFjLE1BQU0sR0FBRztBQUMvQixhQUFLLFFBQVEsS0FBSyxZQUFxQjtBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUNBLFFBQUksQ0FBQyxLQUFLLHdCQUF3QixHQUFHLEdBQUc7QUFDdkMsVUFBSSxLQUFLLE9BQU8sT0FBTztBQUN0QixhQUFLLFFBQVEsS0FBSyxhQUFzQjtBQUFBLE1BQ3pDO0FBQ0EsVUFBSSxLQUFLLE9BQU8sVUFBVTtBQUN6QixhQUFLLFFBQVEsS0FBSyxnQkFBeUI7QUFBQSxNQUM1QztBQUFBLElBQ0Q7QUFDQSxTQUFLLFlBQVk7QUFDakIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWE7QUFDWixRQUFJLEtBQUssUUFBUSxLQUFLLFNBQVMsTUFBTSxnQkFBeUIsS0FBSyxjQUFjLFFBQVEsR0FBRztBQUMzRixXQUFLLGNBQWMsS0FBSztBQUFBLElBQ3pCLE9BQU87QUFDTixXQUFLLGFBQWE7QUFBQSxJQUNuQjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxVQUFtQjtBQUNsQixXQUFRLEtBQUssUUFBUSxLQUFLLFNBQVMsTUFBTSxnQkFBeUIsS0FBSyxjQUFjLFFBQVEsS0FDekYsS0FBSyxZQUFZLEtBQUssUUFBUSxTQUFTO0FBQUEsRUFDNUM7QUFBQSxFQUVBLElBQUksR0FBbUI7QUFDdEIsUUFBSSxLQUFLLFFBQVEsS0FBSyxTQUFTLE1BQU0sZ0JBQXlCO0FBQzdELGFBQU8sa0JBQWtCLEdBQUcsS0FBSyxPQUFPLE1BQU07QUFBQSxJQUMvQyxXQUFXLEtBQUssUUFBUSxLQUFLLFNBQVMsTUFBTSxtQkFBNEI7QUFDdkUsYUFBTyxrQkFBa0IsR0FBRyxLQUFLLE9BQU8sU0FBUztBQUFBLElBQ2xELFdBQVcsS0FBSyxRQUFRLEtBQUssU0FBUyxNQUFNLGNBQXVCO0FBQ2xFLGFBQU8sS0FBSyxjQUFjLElBQUksQ0FBQztBQUFBLElBQ2hDLFdBQVcsS0FBSyxRQUFRLEtBQUssU0FBUyxNQUFNLGVBQXdCO0FBQ25FLGFBQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxLQUFLO0FBQUEsSUFDcEMsV0FBVyxLQUFLLFFBQVEsS0FBSyxTQUFTLE1BQU0sa0JBQTJCO0FBQ3RFLGFBQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxRQUFRO0FBQUEsSUFDdkM7QUFDQSxVQUFNLElBQUksTUFBTTtBQUFBLEVBQ2pCO0FBQUEsRUFFQSxRQUFnQjtBQUNmLFFBQUksS0FBSyxRQUFRLEtBQUssU0FBUyxNQUFNLGdCQUF5QjtBQUM3RCxhQUFPLEtBQUssT0FBTztBQUFBLElBQ3BCLFdBQVcsS0FBSyxRQUFRLEtBQUssU0FBUyxNQUFNLG1CQUE0QjtBQUN2RSxhQUFPLEtBQUssT0FBTztBQUFBLElBQ3BCLFdBQVcsS0FBSyxRQUFRLEtBQUssU0FBUyxNQUFNLGNBQXVCO0FBQ2xFLGFBQU8sS0FBSyxjQUFjLE1BQU07QUFBQSxJQUNqQyxXQUFXLEtBQUssUUFBUSxLQUFLLFNBQVMsTUFBTSxlQUF3QjtBQUNuRSxhQUFPLEtBQUssT0FBTztBQUFBLElBQ3BCLFdBQVcsS0FBSyxRQUFRLEtBQUssU0FBUyxNQUFNLGtCQUEyQjtBQUN0RSxhQUFPLEtBQUssT0FBTztBQUFBLElBQ3BCO0FBQ0EsVUFBTSxJQUFJLE1BQU07QUFBQSxFQUNqQjtBQUNEO0FBRUEsTUFBZSxTQUFmLE1BQWUsT0FBTTtBQUFBLEVBSXBCLE9BQU8sS0FBUSxPQUE0QztBQUMxRCxXQUFPLFVBQVUsU0FBWSxPQUFNLE1BQU07QUFBQSxFQUMxQztBQUFBLEVBRUEsT0FBTyxPQUFVLE9BQTRDO0FBQzVELFdBQU8sVUFBVSxPQUFNLE1BQU0sU0FBWTtBQUFBLEVBQzFDO0FBQ0Q7QUFYZSxPQUVFLE1BQXFCLHVCQUFPLHVCQUF1QjtBQUZwRSxJQUFlLFFBQWY7QUFhQSxNQUFNLHNCQUE0QjtBQUFBLEVBQWxDO0FBQ0Msa0JBQWlCO0FBRWpCLGlCQUEwQztBQUMxQyxlQUFxQjtBQUNyQixnQkFBZ0Q7QUFDaEQsZUFBK0M7QUFDL0MsaUJBQWlEO0FBQUE7QUFBQSxFQUVqRCxVQUFtQjtBQUNsQixXQUFPLENBQUMsS0FBSyxRQUFRLENBQUMsS0FBSyxPQUFPLENBQUMsS0FBSyxTQUFTLEtBQUssVUFBVTtBQUFBLEVBQ2pFO0FBQUEsRUFFQSxhQUFhO0FBQ1osVUFBTSxNQUFNLEtBQUs7QUFDakIsU0FBSyxRQUFRLElBQUk7QUFDakIsUUFBSSxPQUFPO0FBQ1gsU0FBSyxhQUFhO0FBQ2xCLFFBQUksYUFBYTtBQUNqQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYztBQUNiLFVBQU0sTUFBTSxLQUFLO0FBQ2pCLFNBQUssT0FBTyxJQUFJO0FBQ2hCLFFBQUksUUFBUTtBQUNaLFNBQUssYUFBYTtBQUNsQixRQUFJLGFBQWE7QUFDakIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGVBQWU7QUFDZCxTQUFLLFNBQVMsSUFBSSxLQUFLLElBQUksS0FBSyxZQUFZLEtBQUssV0FBVztBQUFBLEVBQzdEO0FBQUEsRUFFQSxnQkFBZ0I7QUFDZixXQUFPLEtBQUssY0FBYyxLQUFLO0FBQUEsRUFDaEM7QUFBQSxFQUVBLElBQUksYUFBYTtBQUNoQixXQUFPLEtBQUssTUFBTSxVQUFVO0FBQUEsRUFDN0I7QUFBQSxFQUVBLElBQUksY0FBYztBQUNqQixXQUFPLEtBQUssT0FBTyxVQUFVO0FBQUEsRUFDOUI7QUFDRDtBQUVBLElBQVcsTUFBWCxrQkFBV0MsU0FBWDtBQUNDLEVBQUFBLFVBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsVUFBQSxTQUFNLEtBQU47QUFDQSxFQUFBQSxVQUFBLFdBQVEsS0FBUjtBQUhVLFNBQUFBO0FBQUEsR0FBQTtBQU1KLE1BQU0sa0JBQXdCO0FBQUEsRUFFcEMsT0FBTyxRQUFXLG1CQUEwQyxNQUFNLE9BQU8seUJBQWdELE1BQU0sT0FBa0M7QUFDaEssV0FBTyxJQUFJLGtCQUEwQixJQUFJLFlBQVksa0JBQWtCLHNCQUFzQixDQUFDO0FBQUEsRUFDL0Y7QUFBQSxFQUVBLE9BQU8sU0FBWSxtQkFBbUIsT0FBcUM7QUFDMUUsV0FBTyxJQUFJLGtCQUE2QixJQUFJLGFBQWEsUUFBVyxDQUFDLGdCQUFnQixDQUFDO0FBQUEsRUFDdkY7QUFBQSxFQUVBLE9BQU8sYUFBOEM7QUFDcEQsV0FBTyxJQUFJLGtCQUE2QixJQUFJLGVBQWUsQ0FBQztBQUFBLEVBQzdEO0FBQUEsRUFFQSxPQUFPLGdCQUFpRDtBQUN2RCxXQUFPLElBQUksa0JBQTZCLElBQUksbUJBQW1CLENBQUM7QUFBQSxFQUNqRTtBQUFBLEVBS0EsWUFBWSxVQUEyQjtBQUN0QyxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBVUEsS0FBSyxRQUErQixNQUEyQjtBQUM5RCxRQUFJLE1BQU07QUFDVCxZQUFNLE1BQU0sS0FBSyxNQUFNLENBQUM7QUFDeEIsY0FBUSxHQUFHO0FBQ1gsaUJBQVcsS0FBSyxLQUFLO0FBQ3BCLGFBQUssSUFBSSxHQUFPLE1BQU87QUFBQSxNQUN4QjtBQUFBLElBQ0QsT0FBTztBQUNOLFlBQU0sTUFBaUIsT0FBUSxNQUFNLENBQUM7QUFDdEMsY0FBUSxHQUFHO0FBQ1gsaUJBQVcsU0FBUyxLQUFLO0FBQ3hCLGFBQUssSUFBSSxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQzVCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksS0FBUSxTQUEyQjtBQUN0QyxVQUFNLE9BQU8sS0FBSyxNQUFNLE1BQU0sR0FBRztBQUNqQyxRQUFJO0FBRUosUUFBSSxDQUFDLEtBQUssT0FBTztBQUNoQixXQUFLLFFBQVEsSUFBSSxzQkFBNEI7QUFDN0MsV0FBSyxNQUFNLFVBQVUsS0FBSyxNQUFNO0FBQUEsSUFDakM7QUFDQSxVQUFNLFFBQThDLENBQUM7QUFHckQsV0FBTyxLQUFLO0FBQ1osV0FBTyxNQUFNO0FBQ1osWUFBTSxNQUFNLEtBQUssSUFBSSxLQUFLLE9BQU87QUFDakMsVUFBSSxNQUFNLEdBQUc7QUFFWixZQUFJLENBQUMsS0FBSyxNQUFNO0FBQ2YsZUFBSyxPQUFPLElBQUksc0JBQTRCO0FBQzVDLGVBQUssS0FBSyxVQUFVLEtBQUssTUFBTTtBQUFBLFFBQ2hDO0FBQ0EsY0FBTSxLQUFLLENBQUMsZUFBVSxJQUFJLENBQUM7QUFDM0IsZUFBTyxLQUFLO0FBQUEsTUFFYixXQUFXLE1BQU0sR0FBRztBQUVuQixZQUFJLENBQUMsS0FBSyxPQUFPO0FBQ2hCLGVBQUssUUFBUSxJQUFJLHNCQUE0QjtBQUM3QyxlQUFLLE1BQU0sVUFBVSxLQUFLLE1BQU07QUFBQSxRQUNqQztBQUNBLGNBQU0sS0FBSyxDQUFDLGVBQVcsSUFBSSxDQUFDO0FBQzVCLGVBQU8sS0FBSztBQUFBLE1BRWIsV0FBVyxLQUFLLFFBQVEsR0FBRztBQUUxQixhQUFLLEtBQUs7QUFDVixZQUFJLENBQUMsS0FBSyxLQUFLO0FBQ2QsZUFBSyxNQUFNLElBQUksc0JBQTRCO0FBQzNDLGVBQUssSUFBSSxVQUFVLEtBQUssTUFBTTtBQUFBLFFBQy9CO0FBQ0EsY0FBTSxLQUFLLENBQUMsYUFBUyxJQUFJLENBQUM7QUFDMUIsZUFBTyxLQUFLO0FBQUEsTUFDYixPQUFPO0FBQ047QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFVBQU0sYUFBYSxNQUFNLE9BQU8sS0FBSyxLQUFLO0FBQzFDLFNBQUssUUFBUSxNQUFNLEtBQUssT0FBTztBQUMvQixTQUFLLE1BQU07QUFHWCxhQUFTLElBQUksTUFBTSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDM0MsWUFBTUMsUUFBTyxNQUFNLENBQUMsRUFBRSxDQUFDO0FBRXZCLE1BQUFBLE1BQUssYUFBYTtBQUNsQixZQUFNLEtBQUtBLE1BQUssY0FBYztBQUU5QixVQUFJLEtBQUssTUFBTSxLQUFLLEdBQUc7QUFFdEIsY0FBTSxLQUFLLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFDckIsY0FBTSxLQUFLLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUV6QixZQUFJLE9BQU8saUJBQWEsT0FBTyxlQUFXO0FBRXpDLGdCQUFNLENBQUMsRUFBRSxDQUFDLElBQUlBLE1BQUssV0FBVztBQUFBLFFBRS9CLFdBQVcsT0FBTyxpQkFBWSxPQUFPLGVBQVU7QUFFOUMsZ0JBQU0sQ0FBQyxFQUFFLENBQUMsSUFBSUEsTUFBSyxZQUFZO0FBQUEsUUFFaEMsV0FBVyxPQUFPLGlCQUFhLE9BQU8sZUFBVTtBQUUvQyxVQUFBQSxNQUFLLFFBQVEsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsWUFBWTtBQUMzRCxnQkFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJQSxNQUFLLFdBQVc7QUFBQSxRQUUvQixXQUFXLE9BQU8saUJBQVksT0FBTyxlQUFXO0FBRS9DLFVBQUFBLE1BQUssT0FBTyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxXQUFXO0FBQ3pELGdCQUFNLENBQUMsRUFBRSxDQUFDLElBQUlBLE1BQUssWUFBWTtBQUFBLFFBRWhDLE9BQU87QUFDTixnQkFBTSxJQUFJLE1BQU07QUFBQSxRQUNqQjtBQUdBLFlBQUksSUFBSSxHQUFHO0FBQ1Ysa0JBQVEsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUc7QUFBQSxZQUN4QixLQUFLO0FBQ0osb0JBQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE9BQU8sTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUNqQztBQUFBLFlBQ0QsS0FBSztBQUNKLG9CQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFDbEM7QUFBQSxZQUNELEtBQUs7QUFDSixvQkFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsTUFBTSxNQUFNLENBQUMsRUFBRSxDQUFDO0FBQ2hDO0FBQUEsVUFDRjtBQUFBLFFBQ0QsT0FBTztBQUNOLGVBQUssUUFBUSxNQUFNLENBQUMsRUFBRSxDQUFDO0FBQUEsUUFDeEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxJQUFJLEtBQXVCO0FBQzFCLFdBQU8sTUFBTSxPQUFPLEtBQUssU0FBUyxHQUFHLEdBQUcsS0FBSztBQUFBLEVBQzlDO0FBQUEsRUFFUSxTQUFTLEtBQVE7QUFDeEIsVUFBTSxPQUFPLEtBQUssTUFBTSxNQUFNLEdBQUc7QUFDakMsUUFBSSxPQUFPLEtBQUs7QUFDaEIsV0FBTyxNQUFNO0FBQ1osWUFBTSxNQUFNLEtBQUssSUFBSSxLQUFLLE9BQU87QUFDakMsVUFBSSxNQUFNLEdBQUc7QUFFWixlQUFPLEtBQUs7QUFBQSxNQUNiLFdBQVcsTUFBTSxHQUFHO0FBRW5CLGVBQU8sS0FBSztBQUFBLE1BQ2IsV0FBVyxLQUFLLFFBQVEsR0FBRztBQUUxQixhQUFLLEtBQUs7QUFDVixlQUFPLEtBQUs7QUFBQSxNQUNiLE9BQU87QUFDTjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQUksS0FBaUI7QUFDcEIsVUFBTSxPQUFPLEtBQUssU0FBUyxHQUFHO0FBQzlCLFdBQU8sRUFBRSxNQUFNLFVBQVUsVUFBYSxNQUFNLFFBQVE7QUFBQSxFQUNyRDtBQUFBLEVBRUEsT0FBTyxLQUFjO0FBQ3BCLFdBQU8sS0FBSyxRQUFRLEtBQUssS0FBSztBQUFBLEVBQy9CO0FBQUEsRUFFQSxlQUFlLEtBQWM7QUFDNUIsV0FBTyxLQUFLLFFBQVEsS0FBSyxJQUFJO0FBQUEsRUFDOUI7QUFBQSxFQUVRLFFBQVEsS0FBUSxVQUF5QjtBQUNoRCxVQUFNLE9BQU8sS0FBSyxNQUFNLE1BQU0sR0FBRztBQUNqQyxVQUFNLFFBQThDLENBQUM7QUFDckQsUUFBSSxPQUFPLEtBQUs7QUFHaEIsV0FBTyxNQUFNO0FBQ1osWUFBTSxNQUFNLEtBQUssSUFBSSxLQUFLLE9BQU87QUFDakMsVUFBSSxNQUFNLEdBQUc7QUFFWixjQUFNLEtBQUssQ0FBQyxlQUFVLElBQUksQ0FBQztBQUMzQixlQUFPLEtBQUs7QUFBQSxNQUNiLFdBQVcsTUFBTSxHQUFHO0FBRW5CLGNBQU0sS0FBSyxDQUFDLGVBQVcsSUFBSSxDQUFDO0FBQzVCLGVBQU8sS0FBSztBQUFBLE1BQ2IsV0FBVyxLQUFLLFFBQVEsR0FBRztBQUUxQixhQUFLLEtBQUs7QUFDVixjQUFNLEtBQUssQ0FBQyxhQUFTLElBQUksQ0FBQztBQUMxQixlQUFPLEtBQUs7QUFBQSxNQUNiLE9BQU87QUFDTjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLE1BQU07QUFFVjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFVBQVU7QUFFYixXQUFLLE9BQU87QUFDWixXQUFLLE1BQU07QUFDWCxXQUFLLFFBQVE7QUFDYixXQUFLLFNBQVM7QUFBQSxJQUNmLE9BQU87QUFFTixXQUFLLE1BQU07QUFDWCxXQUFLLFFBQVE7QUFBQSxJQUNkO0FBR0EsUUFBSSxDQUFDLEtBQUssT0FBTyxDQUFDLEtBQUssT0FBTztBQUM3QixVQUFJLEtBQUssUUFBUSxLQUFLLE9BQU87QUFJNUIsY0FBTSxTQUF1QixDQUFDLENBQUMsZUFBVyxJQUFJLENBQUM7QUFDL0MsY0FBTSxNQUFNLEtBQUssS0FBSyxLQUFLLE9BQU8sTUFBTTtBQUV4QyxZQUFJLElBQUksS0FBSztBQUVaLGVBQUssTUFBTSxJQUFJO0FBQ2YsZUFBSyxRQUFRLElBQUk7QUFDakIsZUFBSyxVQUFVLElBQUk7QUFHbkIsZ0JBQU0sV0FBVyxJQUFJO0FBQ3JCLGNBQUksT0FBTyxTQUFTLEdBQUc7QUFDdEIsa0JBQU0sQ0FBQyxLQUFLLE1BQU0sSUFBSSxPQUFPLE9BQU8sU0FBUyxDQUFDO0FBQzlDLG9CQUFRLEtBQUs7QUFBQSxjQUNaLEtBQUs7QUFBVSx1QkFBTyxPQUFPO0FBQVU7QUFBQSxjQUN2QyxLQUFLO0FBQVMsdUJBQU8sS0FBSztBQUFBLGNBQzFCLEtBQUs7QUFBVyx1QkFBTyxLQUFLO0FBQUEsWUFDN0I7QUFBQSxVQUNELE9BQU87QUFDTixpQkFBSyxRQUFRO0FBQUEsVUFDZDtBQUdBLGdCQUFNLFlBQVksS0FBSyxnQkFBZ0IsTUFBTTtBQUM3QyxjQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ3JCLGtCQUFNLENBQUMsS0FBSyxNQUFNLElBQUksTUFBTSxNQUFNLFNBQVMsQ0FBQztBQUM1QyxvQkFBUSxLQUFLO0FBQUEsY0FDWixLQUFLO0FBQVUsdUJBQU8sT0FBTztBQUFXO0FBQUEsY0FDeEMsS0FBSztBQUFTLHVCQUFPLE1BQU07QUFBVztBQUFBLGNBQ3RDLEtBQUs7QUFBVyx1QkFBTyxRQUFRO0FBQVc7QUFBQSxZQUMzQztBQUFBLFVBQ0QsT0FBTztBQUNOLGlCQUFLLFFBQVE7QUFBQSxVQUNkO0FBQUEsUUFDRDtBQUFBLE1BRUQsT0FBTztBQUVOLGNBQU0sV0FBVyxLQUFLLFFBQVEsS0FBSztBQUNuQyxZQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ3JCLGdCQUFNLENBQUMsS0FBSyxNQUFNLElBQUksTUFBTSxNQUFNLFNBQVMsQ0FBQztBQUM1QyxrQkFBUSxLQUFLO0FBQUEsWUFDWixLQUFLO0FBQVUscUJBQU8sT0FBTztBQUFVO0FBQUEsWUFDdkMsS0FBSztBQUFTLHFCQUFPLE1BQU07QUFBVTtBQUFBLFlBQ3JDLEtBQUs7QUFBVyxxQkFBTyxRQUFRO0FBQVU7QUFBQSxVQUMxQztBQUFBLFFBQ0QsT0FBTztBQUNOLGVBQUssUUFBUTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFNBQUssUUFBUSxLQUFLLGdCQUFnQixLQUFLLEtBQUssS0FBSztBQUFBLEVBQ2xEO0FBQUEsRUFFUSxLQUFLLE1BQW1DLE9BQTBFO0FBQ3pILFdBQU8sS0FBSyxNQUFNO0FBQ2pCLFlBQU0sS0FBSyxDQUFDLGVBQVUsSUFBSSxDQUFDO0FBQzNCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0JBQWdCLE9BQTZDO0FBRXBFLGFBQVMsSUFBSSxNQUFNLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUMzQyxZQUFNLE9BQU8sTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUV2QixXQUFLLGFBQWE7QUFDbEIsWUFBTSxLQUFLLEtBQUssY0FBYztBQUM5QixVQUFJLEtBQUssR0FBRztBQUVYLFlBQUksS0FBSyxNQUFPLGNBQWMsS0FBSyxHQUFHO0FBRXJDLGdCQUFNLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxXQUFXO0FBQUEsUUFDL0IsT0FBTztBQUVOLGVBQUssUUFBUSxLQUFLLE1BQU8sWUFBWTtBQUNyQyxnQkFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssV0FBVztBQUFBLFFBQy9CO0FBQUEsTUFFRCxXQUFXLEtBQUssSUFBSTtBQUVuQixZQUFJLEtBQUssS0FBTSxjQUFjLEtBQUssR0FBRztBQUVwQyxnQkFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssWUFBWTtBQUFBLFFBQ2hDLE9BQU87QUFFTixlQUFLLE9BQU8sS0FBSyxLQUFNLFdBQVc7QUFDbEMsZ0JBQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLFlBQVk7QUFBQSxRQUNoQztBQUFBLE1BQ0Q7QUFHQSxVQUFJLElBQUksR0FBRztBQUNWLGdCQUFRLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHO0FBQUEsVUFDeEIsS0FBSztBQUNKLGtCQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxPQUFPLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFDakM7QUFBQSxVQUNELEtBQUs7QUFDSixrQkFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsUUFBUSxNQUFNLENBQUMsRUFBRSxDQUFDO0FBQ2xDO0FBQUEsVUFDRCxLQUFLO0FBQ0osa0JBQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUNoQztBQUFBLFFBQ0Y7QUFBQSxNQUNELE9BQU87QUFDTixlQUFPLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsV0FBVyxLQUF1QjtBQUNqQyxVQUFNLE9BQU8sS0FBSyxNQUFNLE1BQU0sR0FBRztBQUNqQyxRQUFJLE9BQU8sS0FBSztBQUNoQixRQUFJLFlBQTJCO0FBQy9CLFdBQU8sTUFBTTtBQUNaLFlBQU0sTUFBTSxLQUFLLElBQUksS0FBSyxPQUFPO0FBQ2pDLFVBQUksTUFBTSxHQUFHO0FBRVosZUFBTyxLQUFLO0FBQUEsTUFDYixXQUFXLE1BQU0sR0FBRztBQUVuQixlQUFPLEtBQUs7QUFBQSxNQUNiLFdBQVcsS0FBSyxRQUFRLEdBQUc7QUFFMUIsYUFBSyxLQUFLO0FBQ1Ysb0JBQVksTUFBTSxPQUFPLEtBQUssS0FBSyxLQUFLO0FBQ3hDLGVBQU8sS0FBSztBQUFBLE1BQ2IsT0FBTztBQUNOO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLFFBQVEsTUFBTSxPQUFPLEtBQUssS0FBSyxLQUFLO0FBQUEsRUFDNUM7QUFBQSxFQUVBLGFBQWEsS0FBOEM7QUFDMUQsV0FBTyxLQUFLLHVCQUF1QixLQUFLLEtBQUs7QUFBQSxFQUM5QztBQUFBLEVBSVEsdUJBQXVCLEtBQVEsWUFBK0Q7QUFDckcsVUFBTSxPQUFPLEtBQUssTUFBTSxNQUFNLEdBQUc7QUFDakMsUUFBSSxPQUFPLEtBQUs7QUFDaEIsV0FBTyxNQUFNO0FBQ1osWUFBTSxNQUFNLEtBQUssSUFBSSxLQUFLLE9BQU87QUFDakMsVUFBSSxNQUFNLEdBQUc7QUFFWixlQUFPLEtBQUs7QUFBQSxNQUNiLFdBQVcsTUFBTSxHQUFHO0FBRW5CLGVBQU8sS0FBSztBQUFBLE1BQ2IsV0FBVyxLQUFLLFFBQVEsR0FBRztBQUUxQixhQUFLLEtBQUs7QUFDVixlQUFPLEtBQUs7QUFBQSxNQUNiLE9BQU87QUFFTixZQUFJLENBQUMsS0FBSyxLQUFLO0FBQ2QsY0FBSSxZQUFZO0FBQ2YsbUJBQU8sTUFBTSxPQUFPLEtBQUssS0FBSztBQUFBLFVBQy9CLE9BQU87QUFDTixtQkFBTztBQUFBLFVBQ1I7QUFBQSxRQUNELE9BQU87QUFDTixpQkFBTyxLQUFLLFNBQVMsS0FBSyxHQUFHO0FBQUEsUUFDOUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxvQkFBb0IsS0FBaUI7QUFDcEMsV0FBTyxLQUFLLHVCQUF1QixLQUFLLElBQUksTUFBTTtBQUFBLEVBQ25EO0FBQUEsRUFFQSxRQUFRLFVBQWlEO0FBQ3hELGVBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxNQUFNO0FBQ2hDLGVBQVMsT0FBTyxHQUFHO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxFQUFFLE9BQU8sUUFBUSxJQUE4QjtBQUM5QyxXQUFPLEtBQUssU0FBUyxLQUFLLEtBQUs7QUFBQSxFQUNoQztBQUFBLEVBRVEsU0FBUyxNQUF5RTtBQUN6RixVQUFNLFNBQW1CLENBQUM7QUFDMUIsU0FBSyxZQUFZLE1BQU0sTUFBTTtBQUM3QixXQUFPLE9BQU8sT0FBTyxRQUFRLEVBQUU7QUFBQSxFQUNoQztBQUFBLEVBRVEsWUFBWSxNQUErQyxRQUFrQjtBQUVwRixRQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxNQUFNO0FBQ2QsV0FBSyxZQUFZLEtBQUssTUFBTSxNQUFNO0FBQUEsSUFDbkM7QUFDQSxRQUFJLEtBQUssVUFBVSxRQUFXO0FBQzdCLGFBQU8sS0FBSyxDQUFDLEtBQUssS0FBTSxNQUFNLE9BQU8sS0FBSyxLQUFLLENBQUUsQ0FBQztBQUFBLElBQ25EO0FBQ0EsUUFBSSxLQUFLLEtBQUs7QUFDYixXQUFLLFlBQVksS0FBSyxLQUFLLE1BQU07QUFBQSxJQUNsQztBQUNBLFFBQUksS0FBSyxPQUFPO0FBQ2YsV0FBSyxZQUFZLEtBQUssT0FBTyxNQUFNO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdBLGNBQXVCO0FBQ3RCLFVBQU0saUJBQWlCLENBQUMsU0FBdUU7QUFDOUYsVUFBSSxDQUFDLE1BQU07QUFDVixlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sS0FBSyxLQUFLLGNBQWM7QUFDOUIsVUFBSSxLQUFLLE1BQU0sS0FBSyxHQUFHO0FBQ3RCLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTyxlQUFlLEtBQUssSUFBSSxLQUFLLGVBQWUsS0FBSyxLQUFLO0FBQUEsSUFDOUQ7QUFDQSxXQUFPLGVBQWUsS0FBSyxLQUFLO0FBQUEsRUFDakM7QUFDRDsiLAogICJuYW1lcyI6IFsiVXJpSXRlcmF0b3JTdGF0ZSIsICJEaXIiLCAibm9kZSJdCn0K
