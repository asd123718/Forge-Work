class ListNode {
  constructor(height) {
    this.height = height;
    this._children = [];
    this._length = 0;
  }
  get children() {
    return this._children;
  }
  get length() {
    return this._length;
  }
  static create(node1, node2) {
    const list = new ListNode(node1.height + 1);
    list.appendChild(node1);
    list.appendChild(node2);
    return list;
  }
  canAppendChild() {
    return this._children.length < 3;
  }
  appendChild(node) {
    if (!this.canAppendChild()) {
      throw new Error("Cannot insert more than 3 children in a ListNode");
    }
    this._children.push(node);
    this._length += node.length;
    this._updateParentLength(node.length);
    if (!isLeaf(node)) {
      node.parent = this;
    }
  }
  _updateParentLength(delta) {
    let updateParent = this.parent;
    while (updateParent) {
      updateParent._length += delta;
      updateParent = updateParent.parent;
    }
  }
  unappendChild() {
    const child = this._children.pop();
    this._length -= child.length;
    this._updateParentLength(-child.length);
    return child;
  }
  prependChild(node) {
    if (this._children.length >= 3) {
      throw new Error("Cannot prepend more than 3 children in a ListNode");
    }
    this._children.unshift(node);
    this._length += node.length;
    this._updateParentLength(node.length);
    if (!isLeaf(node)) {
      node.parent = this;
    }
  }
  unprependChild() {
    const child = this._children.shift();
    this._length -= child.length;
    this._updateParentLength(-child.length);
    return child;
  }
  lastChild() {
    return this._children[this._children.length - 1];
  }
  dispose() {
    this._children.splice(0, this._children.length);
  }
}
var TokenQuality = /* @__PURE__ */ ((TokenQuality2) => {
  TokenQuality2[TokenQuality2["None"] = 0] = "None";
  TokenQuality2[TokenQuality2["ViewportGuess"] = 1] = "ViewportGuess";
  TokenQuality2[TokenQuality2["EditGuess"] = 2] = "EditGuess";
  TokenQuality2[TokenQuality2["Accurate"] = 3] = "Accurate";
  return TokenQuality2;
})(TokenQuality || {});
function isLeaf(node) {
  return node.token !== void 0;
}
function append(node, nodeToAppend) {
  let curNode = node;
  const parents = [];
  let nodeToAppendOfCorrectHeight;
  while (true) {
    if (nodeToAppend.height === curNode.height) {
      nodeToAppendOfCorrectHeight = nodeToAppend;
      break;
    }
    if (isLeaf(curNode)) {
      throw new Error("unexpected");
    }
    parents.push(curNode);
    curNode = curNode.lastChild();
  }
  for (let i = parents.length - 1; i >= 0; i--) {
    const parent = parents[i];
    if (nodeToAppendOfCorrectHeight) {
      if (parent.children.length >= 3) {
        const newList = ListNode.create(parent.unappendChild(), nodeToAppendOfCorrectHeight);
        nodeToAppendOfCorrectHeight = newList;
      } else {
        parent.appendChild(nodeToAppendOfCorrectHeight);
        nodeToAppendOfCorrectHeight = void 0;
      }
    }
  }
  if (nodeToAppendOfCorrectHeight) {
    const newList = new ListNode(nodeToAppendOfCorrectHeight.height + 1);
    newList.appendChild(node);
    newList.appendChild(nodeToAppendOfCorrectHeight);
    return newList;
  } else {
    return node;
  }
}
function prepend(list, nodeToAppend) {
  let curNode = list;
  const parents = [];
  while (nodeToAppend.height !== curNode.height) {
    if (isLeaf(curNode)) {
      throw new Error("unexpected");
    }
    parents.push(curNode);
    curNode = curNode.children[0];
  }
  let nodeToPrependOfCorrectHeight = nodeToAppend;
  for (let i = parents.length - 1; i >= 0; i--) {
    const parent = parents[i];
    if (nodeToPrependOfCorrectHeight) {
      if (parent.children.length >= 3) {
        nodeToPrependOfCorrectHeight = ListNode.create(nodeToPrependOfCorrectHeight, parent.unprependChild());
      } else {
        parent.prependChild(nodeToPrependOfCorrectHeight);
        nodeToPrependOfCorrectHeight = void 0;
      }
    }
  }
  if (nodeToPrependOfCorrectHeight) {
    return ListNode.create(nodeToPrependOfCorrectHeight, list);
  } else {
    return list;
  }
}
function concat(node1, node2) {
  if (node1.height === node2.height) {
    return ListNode.create(node1, node2);
  } else if (node1.height > node2.height) {
    return append(node1, node2);
  } else {
    return prepend(node2, node1);
  }
}
class TokenStore {
  constructor(_textModel) {
    this._textModel = _textModel;
    this._root = this.createEmptyRoot();
  }
  get root() {
    return this._root;
  }
  createEmptyRoot() {
    return {
      length: this._textModel.getValueLength(),
      token: 0,
      height: 0,
      tokenQuality: 0 /* None */
    };
  }
  /**
   *
   * @param update all the tokens for the document in sequence
   */
  buildStore(tokens, tokenQuality) {
    this._root = this.createFromUpdates(tokens, tokenQuality);
  }
  createFromUpdates(tokens, tokenQuality) {
    if (tokens.length === 0) {
      return this.createEmptyRoot();
    }
    let newRoot = {
      length: tokens[0].length,
      token: tokens[0].token,
      height: 0,
      tokenQuality
    };
    for (let j = 1; j < tokens.length; j++) {
      newRoot = append(newRoot, { length: tokens[j].length, token: tokens[j].token, height: 0, tokenQuality });
    }
    return newRoot;
  }
  /**
   *
   * @param tokens tokens are in sequence in the document.
   */
  update(length, tokens, tokenQuality) {
    if (tokens.length === 0) {
      return;
    }
    this.replace(length, tokens[0].startOffsetInclusive, tokens, tokenQuality);
  }
  delete(length, startOffset) {
    this.replace(length, startOffset, [], 2 /* EditGuess */);
  }
  /**
   *
   * @param tokens tokens are in sequence in the document.
   */
  replace(length, updateOffsetStart, tokens, tokenQuality) {
    const firstUnchangedOffsetAfterUpdate = updateOffsetStart + length;
    const precedingNodes = [];
    const postcedingNodes = [];
    const stack = [{ node: this._root, offset: 0 }];
    while (stack.length > 0) {
      const node = stack.pop();
      const currentOffset = node.offset;
      if (currentOffset < updateOffsetStart && currentOffset + node.node.length <= updateOffsetStart) {
        if (!isLeaf(node.node)) {
          node.node.parent = void 0;
        }
        precedingNodes.push(node.node);
        continue;
      } else if (isLeaf(node.node) && currentOffset < updateOffsetStart) {
        precedingNodes.push({ length: updateOffsetStart - currentOffset, token: node.node.token, height: 0, tokenQuality: node.node.tokenQuality });
      }
      if (updateOffsetStart <= currentOffset && currentOffset + node.node.length <= firstUnchangedOffsetAfterUpdate) {
        continue;
      }
      if (currentOffset >= firstUnchangedOffsetAfterUpdate) {
        if (!isLeaf(node.node)) {
          node.node.parent = void 0;
        }
        postcedingNodes.push(node.node);
        continue;
      } else if (isLeaf(node.node) && currentOffset + node.node.length > firstUnchangedOffsetAfterUpdate) {
        postcedingNodes.push({ length: currentOffset + node.node.length - firstUnchangedOffsetAfterUpdate, token: node.node.token, height: 0, tokenQuality: node.node.tokenQuality });
        continue;
      }
      if (!isLeaf(node.node)) {
        let childOffset = currentOffset + node.node.length;
        for (let i = node.node.children.length - 1; i >= 0; i--) {
          childOffset -= node.node.children[i].length;
          stack.push({ node: node.node.children[i], offset: childOffset });
        }
      }
    }
    let allNodes;
    if (tokens.length > 0) {
      allNodes = precedingNodes.concat(this.createFromUpdates(tokens, tokenQuality), postcedingNodes);
    } else {
      allNodes = precedingNodes.concat(postcedingNodes);
    }
    let newRoot = allNodes[0];
    for (let i = 1; i < allNodes.length; i++) {
      newRoot = concat(newRoot, allNodes[i]);
    }
    this._root = newRoot ?? this.createEmptyRoot();
  }
  /**
   *
   * @param startOffsetInclusive
   * @param endOffsetExclusive
   * @param visitor Return true from visitor to exit early
   * @returns
   */
  traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, visitor) {
    const stack = [{ node: this._root, offset: 0 }];
    while (stack.length > 0) {
      const { node, offset } = stack.pop();
      const nodeEnd = offset + node.length;
      if (nodeEnd <= startOffsetInclusive || offset >= endOffsetExclusive) {
        continue;
      }
      if (visitor(node, offset)) {
        return;
      }
      if (!isLeaf(node)) {
        let childOffset = offset + node.length;
        for (let i = node.children.length - 1; i >= 0; i--) {
          childOffset -= node.children[i].length;
          stack.push({ node: node.children[i], offset: childOffset });
        }
      }
    }
  }
  getTokenAt(offset) {
    let result;
    this.traverseInOrderInRange(offset, this._root.length, (node, offset2) => {
      if (isLeaf(node)) {
        result = { token: node.token, startOffsetInclusive: offset2, length: node.length };
        return true;
      }
      return false;
    });
    return result;
  }
  getTokensInRange(startOffsetInclusive, endOffsetExclusive) {
    const result = [];
    this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node, offset) => {
      if (isLeaf(node)) {
        let clippedLength = node.length;
        let clippedOffset = offset;
        if (offset < startOffsetInclusive && offset + node.length > endOffsetExclusive) {
          clippedOffset = startOffsetInclusive;
          clippedLength = endOffsetExclusive - startOffsetInclusive;
        } else if (offset < startOffsetInclusive) {
          clippedLength -= startOffsetInclusive - offset;
          clippedOffset = startOffsetInclusive;
        } else if (offset + node.length > endOffsetExclusive) {
          clippedLength -= offset + node.length - endOffsetExclusive;
        }
        result.push({ token: node.token, startOffsetInclusive: clippedOffset, length: clippedLength });
      }
      return false;
    });
    return result;
  }
  markForRefresh(startOffsetInclusive, endOffsetExclusive) {
    this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node) => {
      if (isLeaf(node)) {
        node.tokenQuality = 0 /* None */;
      }
      return false;
    });
  }
  rangeHasTokens(startOffsetInclusive, endOffsetExclusive, minimumTokenQuality) {
    let hasAny = true;
    this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node) => {
      if (isLeaf(node) && node.tokenQuality < minimumTokenQuality) {
        hasAny = false;
      }
      return false;
    });
    return hasAny;
  }
  rangeNeedsRefresh(startOffsetInclusive, endOffsetExclusive) {
    let needsRefresh = false;
    this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node) => {
      if (isLeaf(node) && node.tokenQuality !== 3 /* Accurate */) {
        needsRefresh = true;
      }
      return false;
    });
    return needsRefresh;
  }
  getNeedsRefresh() {
    const result = [];
    this.traverseInOrderInRange(0, this._textModel.getValueLength(), (node, offset) => {
      if (isLeaf(node) && node.tokenQuality !== 3 /* Accurate */) {
        if (result.length > 0 && result[result.length - 1].endOffset === offset) {
          result[result.length - 1].endOffset += node.length;
        } else {
          result.push({ startOffset: offset, endOffset: offset + node.length });
        }
      }
      return false;
    });
    return result;
  }
  deepCopy() {
    const newStore = new TokenStore(this._textModel);
    newStore._root = this._copyNodeIterative(this._root);
    return newStore;
  }
  _copyNodeIterative(root) {
    const newRoot = isLeaf(root) ? { length: root.length, token: root.token, tokenQuality: root.tokenQuality, height: root.height } : new ListNode(root.height);
    const stack = [[root, newRoot]];
    while (stack.length > 0) {
      const [oldNode, clonedNode] = stack.pop();
      if (!isLeaf(oldNode)) {
        for (const child of oldNode.children) {
          const childCopy = isLeaf(child) ? { length: child.length, token: child.token, tokenQuality: child.tokenQuality, height: child.height } : new ListNode(child.height);
          clonedNode.appendChild(childCopy);
          stack.push([child, childCopy]);
        }
      }
    }
    return newRoot;
  }
  /**
   * Returns a string representation of the token tree using an iterative approach
   */
  printTree(root = this._root) {
    const result = [];
    const stack = [[root, 0]];
    while (stack.length > 0) {
      const [node, depth] = stack.pop();
      const indent = "  ".repeat(depth);
      if (isLeaf(node)) {
        result.push(`${indent}Leaf(length: ${node.length}, token: ${node.token}, refresh: ${node.tokenQuality})
`);
      } else {
        result.push(`${indent}List(length: ${node.length})
`);
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push([node.children[i], depth + 1]);
        }
      }
    }
    return result.join("");
  }
  dispose() {
    const stack = [[this._root, false]];
    while (stack.length > 0) {
      const [node, visited] = stack.pop();
      if (isLeaf(node)) {
      } else if (!visited) {
        stack.push([node, true]);
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push([node.children[i], false]);
        }
      } else {
        node.dispose();
        node.parent = void 0;
      }
    }
    this._root = void 0;
  }
}
export {
  ListNode,
  TokenQuality,
  TokenStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHRva2Vuc1xcdHJlZVNpdHRlclxcdG9rZW5TdG9yZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9tb2RlbC5qcyc7XG5cbi8vIEV4cG9ydGVkIGZvciB0ZXN0c1xuZXhwb3J0IGNsYXNzIExpc3ROb2RlIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwYXJlbnQ/OiBMaXN0Tm9kZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hpbGRyZW46IE5vZGVbXSA9IFtdO1xuXHRnZXQgY2hpbGRyZW4oKTogUmVhZG9ubHlBcnJheTxOb2RlPiB7IHJldHVybiB0aGlzLl9jaGlsZHJlbjsgfVxuXG5cdHByaXZhdGUgX2xlbmd0aDogbnVtYmVyID0gMDtcblx0Z2V0IGxlbmd0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fbGVuZ3RoOyB9XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGhlaWdodDogbnVtYmVyKSB7IH1cblxuXHRzdGF0aWMgY3JlYXRlKG5vZGUxOiBOb2RlLCBub2RlMjogTm9kZSkge1xuXHRcdGNvbnN0IGxpc3QgPSBuZXcgTGlzdE5vZGUobm9kZTEuaGVpZ2h0ICsgMSk7XG5cdFx0bGlzdC5hcHBlbmRDaGlsZChub2RlMSk7XG5cdFx0bGlzdC5hcHBlbmRDaGlsZChub2RlMik7XG5cdFx0cmV0dXJuIGxpc3Q7XG5cdH1cblxuXHRjYW5BcHBlbmRDaGlsZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW4ubGVuZ3RoIDwgMztcblx0fVxuXG5cdGFwcGVuZENoaWxkKG5vZGU6IE5vZGUpIHtcblx0XHRpZiAoIXRoaXMuY2FuQXBwZW5kQ2hpbGQoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgaW5zZXJ0IG1vcmUgdGhhbiAzIGNoaWxkcmVuIGluIGEgTGlzdE5vZGUnKTtcblx0XHR9XG5cdFx0dGhpcy5fY2hpbGRyZW4ucHVzaChub2RlKTtcblxuXHRcdHRoaXMuX2xlbmd0aCArPSBub2RlLmxlbmd0aDtcblx0XHR0aGlzLl91cGRhdGVQYXJlbnRMZW5ndGgobm9kZS5sZW5ndGgpO1xuXHRcdGlmICghaXNMZWFmKG5vZGUpKSB7XG5cdFx0XHRub2RlLnBhcmVudCA9IHRoaXM7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUGFyZW50TGVuZ3RoKGRlbHRhOiBudW1iZXIpIHtcblx0XHRsZXQgdXBkYXRlUGFyZW50ID0gdGhpcy5wYXJlbnQ7XG5cdFx0d2hpbGUgKHVwZGF0ZVBhcmVudCkge1xuXHRcdFx0dXBkYXRlUGFyZW50Ll9sZW5ndGggKz0gZGVsdGE7XG5cdFx0XHR1cGRhdGVQYXJlbnQgPSB1cGRhdGVQYXJlbnQucGFyZW50O1xuXHRcdH1cblx0fVxuXG5cdHVuYXBwZW5kQ2hpbGQoKTogTm9kZSB7XG5cdFx0Y29uc3QgY2hpbGQgPSB0aGlzLl9jaGlsZHJlbi5wb3AoKSE7XG5cdFx0dGhpcy5fbGVuZ3RoIC09IGNoaWxkLmxlbmd0aDtcblx0XHR0aGlzLl91cGRhdGVQYXJlbnRMZW5ndGgoLWNoaWxkLmxlbmd0aCk7XG5cdFx0cmV0dXJuIGNoaWxkO1xuXHR9XG5cblx0cHJlcGVuZENoaWxkKG5vZGU6IE5vZGUpIHtcblx0XHRpZiAodGhpcy5fY2hpbGRyZW4ubGVuZ3RoID49IDMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHByZXBlbmQgbW9yZSB0aGFuIDMgY2hpbGRyZW4gaW4gYSBMaXN0Tm9kZScpO1xuXHRcdH1cblx0XHR0aGlzLl9jaGlsZHJlbi51bnNoaWZ0KG5vZGUpO1xuXG5cdFx0dGhpcy5fbGVuZ3RoICs9IG5vZGUubGVuZ3RoO1xuXHRcdHRoaXMuX3VwZGF0ZVBhcmVudExlbmd0aChub2RlLmxlbmd0aCk7XG5cdFx0aWYgKCFpc0xlYWYobm9kZSkpIHtcblx0XHRcdG5vZGUucGFyZW50ID0gdGhpcztcblx0XHR9XG5cdH1cblxuXHR1bnByZXBlbmRDaGlsZCgpOiBOb2RlIHtcblx0XHRjb25zdCBjaGlsZCA9IHRoaXMuX2NoaWxkcmVuLnNoaWZ0KCkhO1xuXHRcdHRoaXMuX2xlbmd0aCAtPSBjaGlsZC5sZW5ndGg7XG5cdFx0dGhpcy5fdXBkYXRlUGFyZW50TGVuZ3RoKC1jaGlsZC5sZW5ndGgpO1xuXHRcdHJldHVybiBjaGlsZDtcblx0fVxuXG5cdGxhc3RDaGlsZCgpOiBOb2RlIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW5bdGhpcy5fY2hpbGRyZW4ubGVuZ3RoIC0gMV07XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2NoaWxkcmVuLnNwbGljZSgwLCB0aGlzLl9jaGlsZHJlbi5sZW5ndGgpO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFRva2VuUXVhbGl0eSB7XG5cdE5vbmUgPSAwLFxuXHRWaWV3cG9ydEd1ZXNzID0gMSxcblx0RWRpdEd1ZXNzID0gMixcblx0QWNjdXJhdGUgPSAzXG59XG5cbnR5cGUgTm9kZSA9IExpc3ROb2RlIHwgTGVhZk5vZGU7XG5cbi8vIEV4cG9ydGVkIGZvciB0ZXN0c1xuZXhwb3J0IGludGVyZmFjZSBMZWFmTm9kZSB7XG5cdHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyO1xuXHR0b2tlbjogbnVtYmVyO1xuXHR0b2tlblF1YWxpdHk6IFRva2VuUXVhbGl0eTtcblx0aGVpZ2h0OiAwO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRva2VuVXBkYXRlIHtcblx0cmVhZG9ubHkgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IG51bWJlcjtcblx0cmVhZG9ubHkgbGVuZ3RoOiBudW1iZXI7XG5cdHJlYWRvbmx5IHRva2VuOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGlzTGVhZihub2RlOiBOb2RlKTogbm9kZSBpcyBMZWFmTm9kZSB7XG5cdHJldHVybiAobm9kZSBhcyBMZWFmTm9kZSkudG9rZW4gIT09IHVuZGVmaW5lZDtcbn1cblxuLy8gSGVhdmlseSBpbnNwaXJlZCBieSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iLzRlYjI2NThkNTkyY2I2MTE0YTdhMzkzNjU1NTc0MTc2Y2M3OTBjNWIvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydC9icmFja2V0UGFpcnNUcmVlL2NvbmNhdDIzVHJlZXMudHMjTDEwOC1MMTA5XG5mdW5jdGlvbiBhcHBlbmQobm9kZTogTm9kZSwgbm9kZVRvQXBwZW5kOiBOb2RlKTogTm9kZSB7XG5cdGxldCBjdXJOb2RlID0gbm9kZTtcblx0Y29uc3QgcGFyZW50czogTGlzdE5vZGVbXSA9IFtdO1xuXHRsZXQgbm9kZVRvQXBwZW5kT2ZDb3JyZWN0SGVpZ2h0OiBOb2RlIHwgdW5kZWZpbmVkO1xuXHR3aGlsZSAodHJ1ZSkge1xuXHRcdGlmIChub2RlVG9BcHBlbmQuaGVpZ2h0ID09PSBjdXJOb2RlLmhlaWdodCkge1xuXHRcdFx0bm9kZVRvQXBwZW5kT2ZDb3JyZWN0SGVpZ2h0ID0gbm9kZVRvQXBwZW5kO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTGVhZihjdXJOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd1bmV4cGVjdGVkJyk7XG5cdFx0fVxuXHRcdHBhcmVudHMucHVzaChjdXJOb2RlKTtcblx0XHRjdXJOb2RlID0gY3VyTm9kZS5sYXN0Q2hpbGQoKTtcblx0fVxuXHRmb3IgKGxldCBpID0gcGFyZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdGNvbnN0IHBhcmVudCA9IHBhcmVudHNbaV07XG5cdFx0aWYgKG5vZGVUb0FwcGVuZE9mQ29ycmVjdEhlaWdodCkge1xuXHRcdFx0Ly8gQ2FuIHdlIHRha2UgdGhlIGVsZW1lbnQ/XG5cdFx0XHRpZiAocGFyZW50LmNoaWxkcmVuLmxlbmd0aCA+PSAzKSB7XG5cdFx0XHRcdC8vIHdlIG5lZWQgdG8gc3BsaXQgdG8gbWFpbnRhaW4gKDIsMyktdHJlZSBwcm9wZXJ0eS5cblx0XHRcdFx0Ly8gU2VuZCB0aGUgdGhpcmQgZWxlbWVudCArIHRoZSBuZXcgZWxlbWVudCB0byB0aGUgcGFyZW50LlxuXHRcdFx0XHRjb25zdCBuZXdMaXN0ID0gTGlzdE5vZGUuY3JlYXRlKHBhcmVudC51bmFwcGVuZENoaWxkKCksIG5vZGVUb0FwcGVuZE9mQ29ycmVjdEhlaWdodCk7XG5cdFx0XHRcdG5vZGVUb0FwcGVuZE9mQ29ycmVjdEhlaWdodCA9IG5ld0xpc3Q7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQobm9kZVRvQXBwZW5kT2ZDb3JyZWN0SGVpZ2h0KTtcblx0XHRcdFx0bm9kZVRvQXBwZW5kT2ZDb3JyZWN0SGVpZ2h0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRpZiAobm9kZVRvQXBwZW5kT2ZDb3JyZWN0SGVpZ2h0KSB7XG5cdFx0Y29uc3QgbmV3TGlzdCA9IG5ldyBMaXN0Tm9kZShub2RlVG9BcHBlbmRPZkNvcnJlY3RIZWlnaHQuaGVpZ2h0ICsgMSk7XG5cdFx0bmV3TGlzdC5hcHBlbmRDaGlsZChub2RlKTtcblx0XHRuZXdMaXN0LmFwcGVuZENoaWxkKG5vZGVUb0FwcGVuZE9mQ29ycmVjdEhlaWdodCk7XG5cdFx0cmV0dXJuIG5ld0xpc3Q7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cbn1cblxuZnVuY3Rpb24gcHJlcGVuZChsaXN0OiBOb2RlLCBub2RlVG9BcHBlbmQ6IE5vZGUpOiBOb2RlIHtcblx0bGV0IGN1ck5vZGUgPSBsaXN0O1xuXHRjb25zdCBwYXJlbnRzOiBMaXN0Tm9kZVtdID0gW107XG5cdHdoaWxlIChub2RlVG9BcHBlbmQuaGVpZ2h0ICE9PSBjdXJOb2RlLmhlaWdodCkge1xuXHRcdGlmIChpc0xlYWYoY3VyTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigndW5leHBlY3RlZCcpO1xuXHRcdH1cblx0XHRwYXJlbnRzLnB1c2goY3VyTm9kZSk7XG5cdFx0Ly8gYXNzZXJ0IDIgPD0gY3VyTm9kZS5jaGlsZHJlbkZhc3QubGVuZ3RoIDw9IDNcblx0XHRjdXJOb2RlID0gY3VyTm9kZS5jaGlsZHJlblswXSBhcyBMaXN0Tm9kZTtcblx0fVxuXHRsZXQgbm9kZVRvUHJlcGVuZE9mQ29ycmVjdEhlaWdodDogTm9kZSB8IHVuZGVmaW5lZCA9IG5vZGVUb0FwcGVuZDtcblx0Ly8gYXNzZXJ0IG5vZGVUb0FwcGVuZE9mQ29ycmVjdEhlaWdodCEubGlzdEhlaWdodCA9PT0gY3VyTm9kZS5saXN0SGVpZ2h0XG5cdGZvciAobGV0IGkgPSBwYXJlbnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgcGFyZW50ID0gcGFyZW50c1tpXTtcblx0XHRpZiAobm9kZVRvUHJlcGVuZE9mQ29ycmVjdEhlaWdodCkge1xuXHRcdFx0Ly8gQ2FuIHdlIHRha2UgdGhlIGVsZW1lbnQ/XG5cdFx0XHRpZiAocGFyZW50LmNoaWxkcmVuLmxlbmd0aCA+PSAzKSB7XG5cdFx0XHRcdC8vIHdlIG5lZWQgdG8gc3BsaXQgdG8gbWFpbnRhaW4gKDIsMyktdHJlZSBwcm9wZXJ0eS5cblx0XHRcdFx0Ly8gU2VuZCB0aGUgdGhpcmQgZWxlbWVudCArIHRoZSBuZXcgZWxlbWVudCB0byB0aGUgcGFyZW50LlxuXHRcdFx0XHRub2RlVG9QcmVwZW5kT2ZDb3JyZWN0SGVpZ2h0ID0gTGlzdE5vZGUuY3JlYXRlKG5vZGVUb1ByZXBlbmRPZkNvcnJlY3RIZWlnaHQsIHBhcmVudC51bnByZXBlbmRDaGlsZCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBhcmVudC5wcmVwZW5kQ2hpbGQobm9kZVRvUHJlcGVuZE9mQ29ycmVjdEhlaWdodCk7XG5cdFx0XHRcdG5vZGVUb1ByZXBlbmRPZkNvcnJlY3RIZWlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGlmIChub2RlVG9QcmVwZW5kT2ZDb3JyZWN0SGVpZ2h0KSB7XG5cdFx0cmV0dXJuIExpc3ROb2RlLmNyZWF0ZShub2RlVG9QcmVwZW5kT2ZDb3JyZWN0SGVpZ2h0LCBsaXN0KTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gbGlzdDtcblx0fVxufVxuXG5mdW5jdGlvbiBjb25jYXQobm9kZTE6IE5vZGUsIG5vZGUyOiBOb2RlKTogTm9kZSB7XG5cdGlmIChub2RlMS5oZWlnaHQgPT09IG5vZGUyLmhlaWdodCkge1xuXHRcdHJldHVybiBMaXN0Tm9kZS5jcmVhdGUobm9kZTEsIG5vZGUyKTtcblx0fVxuXHRlbHNlIGlmIChub2RlMS5oZWlnaHQgPiBub2RlMi5oZWlnaHQpIHtcblx0XHQvLyBub2RlMSBpcyB0aGUgdHJlZSB3ZSB3YW50IHRvIGluc2VydCBpbnRvXG5cdFx0cmV0dXJuIGFwcGVuZChub2RlMSwgbm9kZTIpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBwcmVwZW5kKG5vZGUyLCBub2RlMSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRva2VuU3RvcmUgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3Jvb3Q6IE5vZGU7XG5cdGdldCByb290KCk6IE5vZGUge1xuXHRcdHJldHVybiB0aGlzLl9yb290O1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0dGhpcy5fcm9vdCA9IHRoaXMuY3JlYXRlRW1wdHlSb290KCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVtcHR5Um9vdCgpOiBOb2RlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGVuZ3RoOiB0aGlzLl90ZXh0TW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSxcblx0XHRcdHRva2VuOiAwLFxuXHRcdFx0aGVpZ2h0OiAwLFxuXHRcdFx0dG9rZW5RdWFsaXR5OiBUb2tlblF1YWxpdHkuTm9uZVxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICpcblx0ICogQHBhcmFtIHVwZGF0ZSBhbGwgdGhlIHRva2VucyBmb3IgdGhlIGRvY3VtZW50IGluIHNlcXVlbmNlXG5cdCAqL1xuXHRidWlsZFN0b3JlKHRva2VuczogVG9rZW5VcGRhdGVbXSwgdG9rZW5RdWFsaXR5OiBUb2tlblF1YWxpdHkpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290ID0gdGhpcy5jcmVhdGVGcm9tVXBkYXRlcyh0b2tlbnMsIHRva2VuUXVhbGl0eSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUZyb21VcGRhdGVzKHRva2VuczogVG9rZW5VcGRhdGVbXSwgdG9rZW5RdWFsaXR5OiBUb2tlblF1YWxpdHkpOiBOb2RlIHtcblx0XHRpZiAodG9rZW5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlRW1wdHlSb290KCk7XG5cdFx0fVxuXHRcdGxldCBuZXdSb290OiBOb2RlID0ge1xuXHRcdFx0bGVuZ3RoOiB0b2tlbnNbMF0ubGVuZ3RoLFxuXHRcdFx0dG9rZW46IHRva2Vuc1swXS50b2tlbixcblx0XHRcdGhlaWdodDogMCxcblx0XHRcdHRva2VuUXVhbGl0eVxuXHRcdH07XG5cdFx0Zm9yIChsZXQgaiA9IDE7IGogPCB0b2tlbnMubGVuZ3RoOyBqKyspIHtcblx0XHRcdG5ld1Jvb3QgPSBhcHBlbmQobmV3Um9vdCwgeyBsZW5ndGg6IHRva2Vuc1tqXS5sZW5ndGgsIHRva2VuOiB0b2tlbnNbal0udG9rZW4sIGhlaWdodDogMCwgdG9rZW5RdWFsaXR5IH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3Um9vdDtcblx0fVxuXG5cdC8qKlxuXHQgKlxuXHQgKiBAcGFyYW0gdG9rZW5zIHRva2VucyBhcmUgaW4gc2VxdWVuY2UgaW4gdGhlIGRvY3VtZW50LlxuXHQgKi9cblx0dXBkYXRlKGxlbmd0aDogbnVtYmVyLCB0b2tlbnM6IFRva2VuVXBkYXRlW10sIHRva2VuUXVhbGl0eTogVG9rZW5RdWFsaXR5KSB7XG5cdFx0aWYgKHRva2Vucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZXBsYWNlKGxlbmd0aCwgdG9rZW5zWzBdLnN0YXJ0T2Zmc2V0SW5jbHVzaXZlLCB0b2tlbnMsIHRva2VuUXVhbGl0eSk7XG5cdH1cblxuXHRkZWxldGUobGVuZ3RoOiBudW1iZXIsIHN0YXJ0T2Zmc2V0OiBudW1iZXIpIHtcblx0XHR0aGlzLnJlcGxhY2UobGVuZ3RoLCBzdGFydE9mZnNldCwgW10sIFRva2VuUXVhbGl0eS5FZGl0R3Vlc3MpO1xuXHR9XG5cblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSB0b2tlbnMgdG9rZW5zIGFyZSBpbiBzZXF1ZW5jZSBpbiB0aGUgZG9jdW1lbnQuXG5cdCAqL1xuXHRwcml2YXRlIHJlcGxhY2UobGVuZ3RoOiBudW1iZXIsIHVwZGF0ZU9mZnNldFN0YXJ0OiBudW1iZXIsIHRva2VuczogVG9rZW5VcGRhdGVbXSwgdG9rZW5RdWFsaXR5OiBUb2tlblF1YWxpdHkpIHtcblx0XHRjb25zdCBmaXJzdFVuY2hhbmdlZE9mZnNldEFmdGVyVXBkYXRlID0gdXBkYXRlT2Zmc2V0U3RhcnQgKyBsZW5ndGg7XG5cdFx0Ly8gRmluZCB0aGUgbGFzdCB1bmNoYW5nZWQgbm9kZSBwcmVjZWRpbmcgdGhlIHVwZGF0ZVxuXHRcdGNvbnN0IHByZWNlZGluZ05vZGVzOiBOb2RlW10gPSBbXTtcblx0XHQvLyBGaW5kIHRoZSBmaXJzdCB1bmNoYW5nZWQgbm9kZSBhZnRlciB0aGUgdXBkYXRlXG5cdFx0Y29uc3QgcG9zdGNlZGluZ05vZGVzOiBOb2RlW10gPSBbXTtcblx0XHRjb25zdCBzdGFjazogeyBub2RlOiBOb2RlOyBvZmZzZXQ6IG51bWJlciB9W10gPSBbeyBub2RlOiB0aGlzLl9yb290LCBvZmZzZXQ6IDAgfV07XG5cblx0XHR3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHN0YWNrLnBvcCgpITtcblx0XHRcdGNvbnN0IGN1cnJlbnRPZmZzZXQgPSBub2RlLm9mZnNldDtcblxuXHRcdFx0aWYgKGN1cnJlbnRPZmZzZXQgPCB1cGRhdGVPZmZzZXRTdGFydCAmJiBjdXJyZW50T2Zmc2V0ICsgbm9kZS5ub2RlLmxlbmd0aCA8PSB1cGRhdGVPZmZzZXRTdGFydCkge1xuXHRcdFx0XHRpZiAoIWlzTGVhZihub2RlLm5vZGUpKSB7XG5cdFx0XHRcdFx0bm9kZS5ub2RlLnBhcmVudCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcmVjZWRpbmdOb2Rlcy5wdXNoKG5vZGUubm9kZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChpc0xlYWYobm9kZS5ub2RlKSAmJiAoY3VycmVudE9mZnNldCA8IHVwZGF0ZU9mZnNldFN0YXJ0KSkge1xuXHRcdFx0XHQvLyBXZSBoYXZlIGEgcGFydGlhbCBwcmVjZWRpbmcgbm9kZVxuXHRcdFx0XHRwcmVjZWRpbmdOb2Rlcy5wdXNoKHsgbGVuZ3RoOiB1cGRhdGVPZmZzZXRTdGFydCAtIGN1cnJlbnRPZmZzZXQsIHRva2VuOiBub2RlLm5vZGUudG9rZW4sIGhlaWdodDogMCwgdG9rZW5RdWFsaXR5OiBub2RlLm5vZGUudG9rZW5RdWFsaXR5IH0pO1xuXHRcdFx0XHQvLyBOb2RlIGNvdWxkIGFsc28gYmUgcG9zdGNlZWRpbmcsIHNvIGRvbid0IGNvbnRpbnVlXG5cdFx0XHR9XG5cblx0XHRcdGlmICgodXBkYXRlT2Zmc2V0U3RhcnQgPD0gY3VycmVudE9mZnNldCkgJiYgKGN1cnJlbnRPZmZzZXQgKyBub2RlLm5vZGUubGVuZ3RoIDw9IGZpcnN0VW5jaGFuZ2VkT2Zmc2V0QWZ0ZXJVcGRhdGUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VycmVudE9mZnNldCA+PSBmaXJzdFVuY2hhbmdlZE9mZnNldEFmdGVyVXBkYXRlKSB7XG5cdFx0XHRcdGlmICghaXNMZWFmKG5vZGUubm9kZSkpIHtcblx0XHRcdFx0XHRub2RlLm5vZGUucGFyZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBvc3RjZWRpbmdOb2Rlcy5wdXNoKG5vZGUubm9kZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChpc0xlYWYobm9kZS5ub2RlKSAmJiAoY3VycmVudE9mZnNldCArIG5vZGUubm9kZS5sZW5ndGggPiBmaXJzdFVuY2hhbmdlZE9mZnNldEFmdGVyVXBkYXRlKSkge1xuXHRcdFx0XHQvLyB3ZSBoYXZlIGEgcGFydGlhbCBwb3N0Y2VlZGluZyBub2RlXG5cdFx0XHRcdHBvc3RjZWRpbmdOb2Rlcy5wdXNoKHsgbGVuZ3RoOiBjdXJyZW50T2Zmc2V0ICsgbm9kZS5ub2RlLmxlbmd0aCAtIGZpcnN0VW5jaGFuZ2VkT2Zmc2V0QWZ0ZXJVcGRhdGUsIHRva2VuOiBub2RlLm5vZGUudG9rZW4sIGhlaWdodDogMCwgdG9rZW5RdWFsaXR5OiBub2RlLm5vZGUudG9rZW5RdWFsaXR5IH0pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpc0xlYWYobm9kZS5ub2RlKSkge1xuXHRcdFx0XHQvLyBQdXNoIGNoaWxkcmVuIGluIHJldmVyc2Ugb3JkZXIgdG8gcHJvY2VzcyB0aGVtIGxlZnQtdG8tcmlnaHQgd2hlbiBwb3BwaW5nXG5cdFx0XHRcdGxldCBjaGlsZE9mZnNldCA9IGN1cnJlbnRPZmZzZXQgKyBub2RlLm5vZGUubGVuZ3RoO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gbm9kZS5ub2RlLmNoaWxkcmVuLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Y2hpbGRPZmZzZXQgLT0gbm9kZS5ub2RlLmNoaWxkcmVuW2ldLmxlbmd0aDtcblx0XHRcdFx0XHRzdGFjay5wdXNoKHsgbm9kZTogbm9kZS5ub2RlLmNoaWxkcmVuW2ldLCBvZmZzZXQ6IGNoaWxkT2Zmc2V0IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGFsbE5vZGVzOiBOb2RlW107XG5cdFx0aWYgKHRva2Vucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhbGxOb2RlcyA9IHByZWNlZGluZ05vZGVzLmNvbmNhdCh0aGlzLmNyZWF0ZUZyb21VcGRhdGVzKHRva2VucywgdG9rZW5RdWFsaXR5KSwgcG9zdGNlZGluZ05vZGVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWxsTm9kZXMgPSBwcmVjZWRpbmdOb2Rlcy5jb25jYXQocG9zdGNlZGluZ05vZGVzKTtcblx0XHR9XG5cdFx0bGV0IG5ld1Jvb3Q6IE5vZGUgPSBhbGxOb2Rlc1swXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGFsbE5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRuZXdSb290ID0gY29uY2F0KG5ld1Jvb3QsIGFsbE5vZGVzW2ldKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yb290ID0gbmV3Um9vdCA/PyB0aGlzLmNyZWF0ZUVtcHR5Um9vdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSBzdGFydE9mZnNldEluY2x1c2l2ZVxuXHQgKiBAcGFyYW0gZW5kT2Zmc2V0RXhjbHVzaXZlXG5cdCAqIEBwYXJhbSB2aXNpdG9yIFJldHVybiB0cnVlIGZyb20gdmlzaXRvciB0byBleGl0IGVhcmx5XG5cdCAqIEByZXR1cm5zXG5cdCAqL1xuXHRwcml2YXRlIHRyYXZlcnNlSW5PcmRlckluUmFuZ2Uoc3RhcnRPZmZzZXRJbmNsdXNpdmU6IG51bWJlciwgZW5kT2Zmc2V0RXhjbHVzaXZlOiBudW1iZXIsIHZpc2l0b3I6IChub2RlOiBOb2RlLCBvZmZzZXQ6IG51bWJlcikgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHN0YWNrOiB7IG5vZGU6IE5vZGU7IG9mZnNldDogbnVtYmVyIH1bXSA9IFt7IG5vZGU6IHRoaXMuX3Jvb3QsIG9mZnNldDogMCB9XTtcblxuXHRcdHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCB7IG5vZGUsIG9mZnNldCB9ID0gc3RhY2sucG9wKCkhO1xuXHRcdFx0Y29uc3Qgbm9kZUVuZCA9IG9mZnNldCArIG5vZGUubGVuZ3RoO1xuXG5cdFx0XHQvLyBTa2lwIG5vZGVzIHRoYXQgYXJlIGNvbXBsZXRlbHkgYmVmb3JlIG9yIGFmdGVyIHRoZSByYW5nZVxuXHRcdFx0aWYgKG5vZGVFbmQgPD0gc3RhcnRPZmZzZXRJbmNsdXNpdmUgfHwgb2Zmc2V0ID49IGVuZE9mZnNldEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHZpc2l0b3Iobm9kZSwgb2Zmc2V0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXNMZWFmKG5vZGUpKSB7XG5cdFx0XHRcdC8vIFB1c2ggY2hpbGRyZW4gaW4gcmV2ZXJzZSBvcmRlciB0byBwcm9jZXNzIHRoZW0gbGVmdC10by1yaWdodCB3aGVuIHBvcHBpbmdcblx0XHRcdFx0bGV0IGNoaWxkT2Zmc2V0ID0gb2Zmc2V0ICsgbm9kZS5sZW5ndGg7XG5cdFx0XHRcdGZvciAobGV0IGkgPSBub2RlLmNoaWxkcmVuLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Y2hpbGRPZmZzZXQgLT0gbm9kZS5jaGlsZHJlbltpXS5sZW5ndGg7XG5cdFx0XHRcdFx0c3RhY2sucHVzaCh7IG5vZGU6IG5vZGUuY2hpbGRyZW5baV0sIG9mZnNldDogY2hpbGRPZmZzZXQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRUb2tlbkF0KG9mZnNldDogbnVtYmVyKTogVG9rZW5VcGRhdGUgfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQ6IFRva2VuVXBkYXRlIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMudHJhdmVyc2VJbk9yZGVySW5SYW5nZShvZmZzZXQsIHRoaXMuX3Jvb3QubGVuZ3RoLCAobm9kZSwgb2Zmc2V0KSA9PiB7XG5cdFx0XHRpZiAoaXNMZWFmKG5vZGUpKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHsgdG9rZW46IG5vZGUudG9rZW4sIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiBvZmZzZXQsIGxlbmd0aDogbm9kZS5sZW5ndGggfTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldFRva2Vuc0luUmFuZ2Uoc3RhcnRPZmZzZXRJbmNsdXNpdmU6IG51bWJlciwgZW5kT2Zmc2V0RXhjbHVzaXZlOiBudW1iZXIpOiBUb2tlblVwZGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IHsgdG9rZW46IG51bWJlcjsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfVtdID0gW107XG5cdFx0dGhpcy50cmF2ZXJzZUluT3JkZXJJblJhbmdlKHN0YXJ0T2Zmc2V0SW5jbHVzaXZlLCBlbmRPZmZzZXRFeGNsdXNpdmUsIChub2RlLCBvZmZzZXQpID0+IHtcblx0XHRcdGlmIChpc0xlYWYobm9kZSkpIHtcblx0XHRcdFx0bGV0IGNsaXBwZWRMZW5ndGggPSBub2RlLmxlbmd0aDtcblx0XHRcdFx0bGV0IGNsaXBwZWRPZmZzZXQgPSBvZmZzZXQ7XG5cdFx0XHRcdGlmICgob2Zmc2V0IDwgc3RhcnRPZmZzZXRJbmNsdXNpdmUpICYmIChvZmZzZXQgKyBub2RlLmxlbmd0aCA+IGVuZE9mZnNldEV4Y2x1c2l2ZSkpIHtcblx0XHRcdFx0XHRjbGlwcGVkT2Zmc2V0ID0gc3RhcnRPZmZzZXRJbmNsdXNpdmU7XG5cdFx0XHRcdFx0Y2xpcHBlZExlbmd0aCA9IGVuZE9mZnNldEV4Y2x1c2l2ZSAtIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG9mZnNldCA8IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlKSB7XG5cdFx0XHRcdFx0Y2xpcHBlZExlbmd0aCAtPSAoc3RhcnRPZmZzZXRJbmNsdXNpdmUgLSBvZmZzZXQpO1xuXHRcdFx0XHRcdGNsaXBwZWRPZmZzZXQgPSBzdGFydE9mZnNldEluY2x1c2l2ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChvZmZzZXQgKyBub2RlLmxlbmd0aCA+IGVuZE9mZnNldEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRcdGNsaXBwZWRMZW5ndGggLT0gKG9mZnNldCArIG5vZGUubGVuZ3RoIC0gZW5kT2Zmc2V0RXhjbHVzaXZlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHRva2VuOiBub2RlLnRva2VuLCBzdGFydE9mZnNldEluY2x1c2l2ZTogY2xpcHBlZE9mZnNldCwgbGVuZ3RoOiBjbGlwcGVkTGVuZ3RoIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRtYXJrRm9yUmVmcmVzaChzdGFydE9mZnNldEluY2x1c2l2ZTogbnVtYmVyLCBlbmRPZmZzZXRFeGNsdXNpdmU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudHJhdmVyc2VJbk9yZGVySW5SYW5nZShzdGFydE9mZnNldEluY2x1c2l2ZSwgZW5kT2Zmc2V0RXhjbHVzaXZlLCAobm9kZSkgPT4ge1xuXHRcdFx0aWYgKGlzTGVhZihub2RlKSkge1xuXHRcdFx0XHRub2RlLnRva2VuUXVhbGl0eSA9IFRva2VuUXVhbGl0eS5Ob25lO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0cmFuZ2VIYXNUb2tlbnMoc3RhcnRPZmZzZXRJbmNsdXNpdmU6IG51bWJlciwgZW5kT2Zmc2V0RXhjbHVzaXZlOiBudW1iZXIsIG1pbmltdW1Ub2tlblF1YWxpdHk6IFRva2VuUXVhbGl0eSk6IGJvb2xlYW4ge1xuXHRcdGxldCBoYXNBbnkgPSB0cnVlO1xuXHRcdHRoaXMudHJhdmVyc2VJbk9yZGVySW5SYW5nZShzdGFydE9mZnNldEluY2x1c2l2ZSwgZW5kT2Zmc2V0RXhjbHVzaXZlLCAobm9kZSkgPT4ge1xuXHRcdFx0aWYgKGlzTGVhZihub2RlKSAmJiAobm9kZS50b2tlblF1YWxpdHkgPCBtaW5pbXVtVG9rZW5RdWFsaXR5KSkge1xuXHRcdFx0XHRoYXNBbnkgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0XHRyZXR1cm4gaGFzQW55O1xuXHR9XG5cblx0cmFuZ2VOZWVkc1JlZnJlc2goc3RhcnRPZmZzZXRJbmNsdXNpdmU6IG51bWJlciwgZW5kT2Zmc2V0RXhjbHVzaXZlOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRsZXQgbmVlZHNSZWZyZXNoID0gZmFsc2U7XG5cdFx0dGhpcy50cmF2ZXJzZUluT3JkZXJJblJhbmdlKHN0YXJ0T2Zmc2V0SW5jbHVzaXZlLCBlbmRPZmZzZXRFeGNsdXNpdmUsIChub2RlKSA9PiB7XG5cdFx0XHRpZiAoaXNMZWFmKG5vZGUpICYmIChub2RlLnRva2VuUXVhbGl0eSAhPT0gVG9rZW5RdWFsaXR5LkFjY3VyYXRlKSkge1xuXHRcdFx0XHRuZWVkc1JlZnJlc2ggPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHRcdHJldHVybiBuZWVkc1JlZnJlc2g7XG5cdH1cblxuXHRnZXROZWVkc1JlZnJlc2goKTogeyBzdGFydE9mZnNldDogbnVtYmVyOyBlbmRPZmZzZXQ6IG51bWJlciB9W10ge1xuXHRcdGNvbnN0IHJlc3VsdDogeyBzdGFydE9mZnNldDogbnVtYmVyOyBlbmRPZmZzZXQ6IG51bWJlciB9W10gPSBbXTtcblxuXHRcdHRoaXMudHJhdmVyc2VJbk9yZGVySW5SYW5nZSgwLCB0aGlzLl90ZXh0TW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSwgKG5vZGUsIG9mZnNldCkgPT4ge1xuXHRcdFx0aWYgKGlzTGVhZihub2RlKSAmJiAobm9kZS50b2tlblF1YWxpdHkgIT09IFRva2VuUXVhbGl0eS5BY2N1cmF0ZSkpIHtcblx0XHRcdFx0aWYgKChyZXN1bHQubGVuZ3RoID4gMCkgJiYgKHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0uZW5kT2Zmc2V0ID09PSBvZmZzZXQpKSB7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXS5lbmRPZmZzZXQgKz0gbm9kZS5sZW5ndGg7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyBzdGFydE9mZnNldDogb2Zmc2V0LCBlbmRPZmZzZXQ6IG9mZnNldCArIG5vZGUubGVuZ3RoIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBkZWVwQ29weSgpOiBUb2tlblN0b3JlIHtcblx0XHRjb25zdCBuZXdTdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRoaXMuX3RleHRNb2RlbCk7XG5cdFx0bmV3U3RvcmUuX3Jvb3QgPSB0aGlzLl9jb3B5Tm9kZUl0ZXJhdGl2ZSh0aGlzLl9yb290KTtcblx0XHRyZXR1cm4gbmV3U3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIF9jb3B5Tm9kZUl0ZXJhdGl2ZShyb290OiBOb2RlKTogTm9kZSB7XG5cdFx0Y29uc3QgbmV3Um9vdCA9IGlzTGVhZihyb290KVxuXHRcdFx0PyB7IGxlbmd0aDogcm9vdC5sZW5ndGgsIHRva2VuOiByb290LnRva2VuLCB0b2tlblF1YWxpdHk6IHJvb3QudG9rZW5RdWFsaXR5LCBoZWlnaHQ6IHJvb3QuaGVpZ2h0IH1cblx0XHRcdDogbmV3IExpc3ROb2RlKHJvb3QuaGVpZ2h0KTtcblxuXHRcdGNvbnN0IHN0YWNrOiBBcnJheTxbTm9kZSwgTm9kZV0+ID0gW1tyb290LCBuZXdSb290XV07XG5cblx0XHR3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgW29sZE5vZGUsIGNsb25lZE5vZGVdID0gc3RhY2sucG9wKCkhO1xuXHRcdFx0aWYgKCFpc0xlYWYob2xkTm9kZSkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBvbGROb2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRDb3B5ID0gaXNMZWFmKGNoaWxkKVxuXHRcdFx0XHRcdFx0PyB7IGxlbmd0aDogY2hpbGQubGVuZ3RoLCB0b2tlbjogY2hpbGQudG9rZW4sIHRva2VuUXVhbGl0eTogY2hpbGQudG9rZW5RdWFsaXR5LCBoZWlnaHQ6IGNoaWxkLmhlaWdodCB9XG5cdFx0XHRcdFx0XHQ6IG5ldyBMaXN0Tm9kZShjaGlsZC5oZWlnaHQpO1xuXG5cdFx0XHRcdFx0KGNsb25lZE5vZGUgYXMgTGlzdE5vZGUpLmFwcGVuZENoaWxkKGNoaWxkQ29weSk7XG5cdFx0XHRcdFx0c3RhY2sucHVzaChbY2hpbGQsIGNoaWxkQ29weV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ld1Jvb3Q7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgdG9rZW4gdHJlZSB1c2luZyBhbiBpdGVyYXRpdmUgYXBwcm9hY2hcblx0ICovXG5cdHByaW50VHJlZShyb290OiBOb2RlID0gdGhpcy5fcm9vdCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHN0YWNrOiBBcnJheTxbTm9kZSwgbnVtYmVyXT4gPSBbW3Jvb3QsIDBdXTtcblxuXHRcdHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBbbm9kZSwgZGVwdGhdID0gc3RhY2sucG9wKCkhO1xuXHRcdFx0Y29uc3QgaW5kZW50ID0gJyAgJy5yZXBlYXQoZGVwdGgpO1xuXG5cdFx0XHRpZiAoaXNMZWFmKG5vZGUpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGAke2luZGVudH1MZWFmKGxlbmd0aDogJHtub2RlLmxlbmd0aH0sIHRva2VuOiAke25vZGUudG9rZW59LCByZWZyZXNoOiAke25vZGUudG9rZW5RdWFsaXR5fSlcXG5gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGAke2luZGVudH1MaXN0KGxlbmd0aDogJHtub2RlLmxlbmd0aH0pXFxuYCk7XG5cdFx0XHRcdC8vIFB1c2ggY2hpbGRyZW4gaW4gcmV2ZXJzZSBvcmRlciBzbyB0aGV5IGdldCBwcm9jZXNzZWQgbGVmdC10by1yaWdodFxuXHRcdFx0XHRmb3IgKGxldCBpID0gbm9kZS5jaGlsZHJlbi5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdHN0YWNrLnB1c2goW25vZGUuY2hpbGRyZW5baV0sIGRlcHRoICsgMV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5qb2luKCcnKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhY2s6IEFycmF5PFtOb2RlLCBib29sZWFuXT4gPSBbW3RoaXMuX3Jvb3QsIGZhbHNlXV07XG5cdFx0d2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IFtub2RlLCB2aXNpdGVkXSA9IHN0YWNrLnBvcCgpITtcblx0XHRcdGlmIChpc0xlYWYobm9kZSkpIHtcblx0XHRcdFx0Ly8gbGVhZiBub2RlIGRvZXMgbm90IG5lZWQgdG8gYmUgZGlzcG9zZWRcblx0XHRcdH0gZWxzZSBpZiAoIXZpc2l0ZWQpIHtcblx0XHRcdFx0c3RhY2sucHVzaChbbm9kZSwgdHJ1ZV0pO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gbm9kZS5jaGlsZHJlbi5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdHN0YWNrLnB1c2goW25vZGUuY2hpbGRyZW5baV0sIGZhbHNlXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5vZGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRub2RlLnBhcmVudCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcm9vdCA9IHVuZGVmaW5lZCE7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQVNPLE1BQU0sU0FBZ0M7QUFBQSxFQVE1QyxZQUE0QixRQUFnQjtBQUFoQjtBQU41QixTQUFpQixZQUFvQixDQUFDO0FBR3RDLFNBQVEsVUFBa0I7QUFBQSxFQUdvQjtBQUFBLEVBTDlDLElBQUksV0FBZ0M7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFXO0FBQUEsRUFHN0QsSUFBSSxTQUFpQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVM7QUFBQSxFQUk1QyxPQUFPLE9BQU8sT0FBYSxPQUFhO0FBQ3ZDLFVBQU0sT0FBTyxJQUFJLFNBQVMsTUFBTSxTQUFTLENBQUM7QUFDMUMsU0FBSyxZQUFZLEtBQUs7QUFDdEIsU0FBSyxZQUFZLEtBQUs7QUFDdEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGlCQUEwQjtBQUN6QixXQUFPLEtBQUssVUFBVSxTQUFTO0FBQUEsRUFDaEM7QUFBQSxFQUVBLFlBQVksTUFBWTtBQUN2QixRQUFJLENBQUMsS0FBSyxlQUFlLEdBQUc7QUFDM0IsWUFBTSxJQUFJLE1BQU0sa0RBQWtEO0FBQUEsSUFDbkU7QUFDQSxTQUFLLFVBQVUsS0FBSyxJQUFJO0FBRXhCLFNBQUssV0FBVyxLQUFLO0FBQ3JCLFNBQUssb0JBQW9CLEtBQUssTUFBTTtBQUNwQyxRQUFJLENBQUMsT0FBTyxJ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
