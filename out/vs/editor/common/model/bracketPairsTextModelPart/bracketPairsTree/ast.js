import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { CursorColumns } from "../../../core/cursorColumns.js";
import { lengthAdd, lengthGetLineCount, lengthToObj, lengthZero } from "./length.js";
import { SmallImmutableSet } from "./smallImmutableSet.js";
var AstNodeKind = /* @__PURE__ */ ((AstNodeKind2) => {
  AstNodeKind2[AstNodeKind2["Text"] = 0] = "Text";
  AstNodeKind2[AstNodeKind2["Bracket"] = 1] = "Bracket";
  AstNodeKind2[AstNodeKind2["Pair"] = 2] = "Pair";
  AstNodeKind2[AstNodeKind2["UnexpectedClosingBracket"] = 3] = "UnexpectedClosingBracket";
  AstNodeKind2[AstNodeKind2["List"] = 4] = "List";
  return AstNodeKind2;
})(AstNodeKind || {});
class BaseAstNode {
  /**
   * The length of the entire node, which should equal the sum of lengths of all children.
  */
  get length() {
    return this._length;
  }
  constructor(length) {
    this._length = length;
  }
}
class PairAstNode extends BaseAstNode {
  constructor(length, openingBracket, child, closingBracket, missingOpeningBracketIds) {
    super(length);
    this.openingBracket = openingBracket;
    this.child = child;
    this.closingBracket = closingBracket;
    this.missingOpeningBracketIds = missingOpeningBracketIds;
  }
  static create(openingBracket, child, closingBracket) {
    let length = openingBracket.length;
    if (child) {
      length = lengthAdd(length, child.length);
    }
    if (closingBracket) {
      length = lengthAdd(length, closingBracket.length);
    }
    return new PairAstNode(length, openingBracket, child, closingBracket, child ? child.missingOpeningBracketIds : SmallImmutableSet.getEmpty());
  }
  get kind() {
    return 2 /* Pair */;
  }
  get listHeight() {
    return 0;
  }
  get childrenLength() {
    return 3;
  }
  getChild(idx) {
    switch (idx) {
      case 0:
        return this.openingBracket;
      case 1:
        return this.child;
      case 2:
        return this.closingBracket;
    }
    throw new Error("Invalid child index");
  }
  /**
   * Avoid using this property, it allocates an array!
  */
  get children() {
    const result = [];
    result.push(this.openingBracket);
    if (this.child) {
      result.push(this.child);
    }
    if (this.closingBracket) {
      result.push(this.closingBracket);
    }
    return result;
  }
  canBeReused(openBracketIds) {
    if (this.closingBracket === null) {
      return false;
    }
    if (openBracketIds.intersects(this.missingOpeningBracketIds)) {
      return false;
    }
    return true;
  }
  flattenLists() {
    return PairAstNode.create(
      this.openingBracket.flattenLists(),
      this.child && this.child.flattenLists(),
      this.closingBracket && this.closingBracket.flattenLists()
    );
  }
  deepClone() {
    return new PairAstNode(
      this.length,
      this.openingBracket.deepClone(),
      this.child && this.child.deepClone(),
      this.closingBracket && this.closingBracket.deepClone(),
      this.missingOpeningBracketIds
    );
  }
  computeMinIndentation(offset, textModel) {
    return this.child ? this.child.computeMinIndentation(lengthAdd(offset, this.openingBracket.length), textModel) : Number.MAX_SAFE_INTEGER;
  }
}
class ListAstNode extends BaseAstNode {
  /**
   * Use ListAstNode.create.
  */
  constructor(length, listHeight, _missingOpeningBracketIds) {
    super(length);
    this.listHeight = listHeight;
    this._missingOpeningBracketIds = _missingOpeningBracketIds;
    this.cachedMinIndentation = -1;
  }
  /**
   * This method uses more memory-efficient list nodes that can only store 2 or 3 children.
  */
  static create23(item1, item2, item3, immutable = false) {
    let length = item1.length;
    let missingBracketIds = item1.missingOpeningBracketIds;
    if (item1.listHeight !== item2.listHeight) {
      throw new Error("Invalid list heights");
    }
    length = lengthAdd(length, item2.length);
    missingBracketIds = missingBracketIds.merge(item2.missingOpeningBracketIds);
    if (item3) {
      if (item1.listHeight !== item3.listHeight) {
        throw new Error("Invalid list heights");
      }
      length = lengthAdd(length, item3.length);
      missingBracketIds = missingBracketIds.merge(item3.missingOpeningBracketIds);
    }
    return immutable ? new Immutable23ListAstNode(length, item1.listHeight + 1, item1, item2, item3, missingBracketIds) : new TwoThreeListAstNode(length, item1.listHeight + 1, item1, item2, item3, missingBracketIds);
  }
  static create(items, immutable = false) {
    if (items.length === 0) {
      return this.getEmpty();
    } else {
      let length = items[0].length;
      let unopenedBrackets = items[0].missingOpeningBracketIds;
      for (let i = 1; i < items.length; i++) {
        length = lengthAdd(length, items[i].length);
        unopenedBrackets = unopenedBrackets.merge(items[i].missingOpeningBracketIds);
      }
      return immutable ? new ImmutableArrayListAstNode(length, items[0].listHeight + 1, items, unopenedBrackets) : new ArrayListAstNode(length, items[0].listHeight + 1, items, unopenedBrackets);
    }
  }
  static getEmpty() {
    return new ImmutableArrayListAstNode(lengthZero, 0, [], SmallImmutableSet.getEmpty());
  }
  get kind() {
    return 4 /* List */;
  }
  get missingOpeningBracketIds() {
    return this._missingOpeningBracketIds;
  }
  throwIfImmutable() {
  }
  makeLastElementMutable() {
    this.throwIfImmutable();
    const childCount = this.childrenLength;
    if (childCount === 0) {
      return void 0;
    }
    const lastChild = this.getChild(childCount - 1);
    const mutable = lastChild.kind === 4 /* List */ ? lastChild.toMutable() : lastChild;
    if (lastChild !== mutable) {
      this.setChild(childCount - 1, mutable);
    }
    return mutable;
  }
  makeFirstElementMutable() {
    this.throwIfImmutable();
    const childCount = this.childrenLength;
    if (childCount === 0) {
      return void 0;
    }
    const firstChild = this.getChild(0);
    const mutable = firstChild.kind === 4 /* List */ ? firstChild.toMutable() : firstChild;
    if (firstChild !== mutable) {
      this.setChild(0, mutable);
    }
    return mutable;
  }
  canBeReused(openBracketIds) {
    if (openBracketIds.intersects(this.missingOpeningBracketIds)) {
      return false;
    }
    if (this.childrenLength === 0) {
      return false;
    }
    let lastChild = this;
    while (lastChild.kind === 4 /* List */) {
      const lastLength = lastChild.childrenLength;
      if (lastLength === 0) {
        throw new BugIndicatingError();
      }
      lastChild = lastChild.getChild(lastLength - 1);
    }
    return lastChild.canBeReused(openBracketIds);
  }
  handleChildrenChanged() {
    this.throwIfImmutable();
    const count = this.childrenLength;
    let length = this.getChild(0).length;
    let unopenedBrackets = this.getChild(0).missingOpeningBracketIds;
    for (let i = 1; i < count; i++) {
      const child = this.getChild(i);
      length = lengthAdd(length, child.length);
      unopenedBrackets = unopenedBrackets.merge(child.missingOpeningBracketIds);
    }
    this._length = length;
    this._missingOpeningBracketIds = unopenedBrackets;
    this.cachedMinIndentation = -1;
  }
  flattenLists() {
    const items = [];
    for (const c of this.children) {
      const normalized = c.flattenLists();
      if (normalized.kind === 4 /* List */) {
        items.push(...normalized.children);
      } else {
        items.push(normalized);
      }
    }
    return ListAstNode.create(items);
  }
  computeMinIndentation(offset, textModel) {
    if (this.cachedMinIndentation !== -1) {
      return this.cachedMinIndentation;
    }
    let minIndentation = Number.MAX_SAFE_INTEGER;
    let childOffset = offset;
    for (let i = 0; i < this.childrenLength; i++) {
      const child = this.getChild(i);
      if (child) {
        minIndentation = Math.min(minIndentation, child.computeMinIndentation(childOffset, textModel));
        childOffset = lengthAdd(childOffset, child.length);
      }
    }
    this.cachedMinIndentation = minIndentation;
    return minIndentation;
  }
}
class TwoThreeListAstNode extends ListAstNode {
  constructor(length, listHeight, _item1, _item2, _item3, missingOpeningBracketIds) {
    super(length, listHeight, missingOpeningBracketIds);
    this._item1 = _item1;
    this._item2 = _item2;
    this._item3 = _item3;
  }
  get childrenLength() {
    return this._item3 !== null ? 3 : 2;
  }
  getChild(idx) {
    switch (idx) {
      case 0:
        return this._item1;
      case 1:
        return this._item2;
      case 2:
        return this._item3;
    }
    throw new Error("Invalid child index");
  }
  setChild(idx, node) {
    switch (idx) {
      case 0:
        this._item1 = node;
        return;
      case 1:
        this._item2 = node;
        return;
      case 2:
        this._item3 = node;
        return;
    }
    throw new Error("Invalid child index");
  }
  get children() {
    return this._item3 ? [this._item1, this._item2, this._item3] : [this._item1, this._item2];
  }
  get item1() {
    return this._item1;
  }
  get item2() {
    return this._item2;
  }
  get item3() {
    return this._item3;
  }
  deepClone() {
    return new TwoThreeListAstNode(
      this.length,
      this.listHeight,
      this._item1.deepClone(),
      this._item2.deepClone(),
      this._item3 ? this._item3.deepClone() : null,
      this.missingOpeningBracketIds
    );
  }
  appendChildOfSameHeight(node) {
    if (this._item3) {
      throw new Error("Cannot append to a full (2,3) tree node");
    }
    this.throwIfImmutable();
    this._item3 = node;
    this.handleChildrenChanged();
  }
  unappendChild() {
    if (!this._item3) {
      throw new Error("Cannot remove from a non-full (2,3) tree node");
    }
    this.throwIfImmutable();
    const result = this._item3;
    this._item3 = null;
    this.handleChildrenChanged();
    return result;
  }
  prependChildOfSameHeight(node) {
    if (this._item3) {
      throw new Error("Cannot prepend to a full (2,3) tree node");
    }
    this.throwIfImmutable();
    this._item3 = this._item2;
    this._item2 = this._item1;
    this._item1 = node;
    this.handleChildrenChanged();
  }
  unprependChild() {
    if (!this._item3) {
      throw new Error("Cannot remove from a non-full (2,3) tree node");
    }
    this.throwIfImmutable();
    const result = this._item1;
    this._item1 = this._item2;
    this._item2 = this._item3;
    this._item3 = null;
    this.handleChildrenChanged();
    return result;
  }
  toMutable() {
    return this;
  }
}
class Immutable23ListAstNode extends TwoThreeListAstNode {
  toMutable() {
    return new TwoThreeListAstNode(this.length, this.listHeight, this.item1, this.item2, this.item3, this.missingOpeningBracketIds);
  }
  throwIfImmutable() {
    throw new Error("this instance is immutable");
  }
}
class ArrayListAstNode extends ListAstNode {
  constructor(length, listHeight, _children, missingOpeningBracketIds) {
    super(length, listHeight, missingOpeningBracketIds);
    this._children = _children;
  }
  get childrenLength() {
    return this._children.length;
  }
  getChild(idx) {
    return this._children[idx];
  }
  setChild(idx, child) {
    this._children[idx] = child;
  }
  get children() {
    return this._children;
  }
  deepClone() {
    const children = new Array(this._children.length);
    for (let i = 0; i < this._children.length; i++) {
      children[i] = this._children[i].deepClone();
    }
    return new ArrayListAstNode(this.length, this.listHeight, children, this.missingOpeningBracketIds);
  }
  appendChildOfSameHeight(node) {
    this.throwIfImmutable();
    this._children.push(node);
    this.handleChildrenChanged();
  }
  unappendChild() {
    this.throwIfImmutable();
    const item = this._children.pop();
    this.handleChildrenChanged();
    return item;
  }
  prependChildOfSameHeight(node) {
    this.throwIfImmutable();
    this._children.unshift(node);
    this.handleChildrenChanged();
  }
  unprependChild() {
    this.throwIfImmutable();
    const item = this._children.shift();
    this.handleChildrenChanged();
    return item;
  }
  toMutable() {
    return this;
  }
}
class ImmutableArrayListAstNode extends ArrayListAstNode {
  toMutable() {
    return new ArrayListAstNode(this.length, this.listHeight, [...this.children], this.missingOpeningBracketIds);
  }
  throwIfImmutable() {
    throw new Error("this instance is immutable");
  }
}
const emptyArray = [];
class ImmutableLeafAstNode extends BaseAstNode {
  get listHeight() {
    return 0;
  }
  get childrenLength() {
    return 0;
  }
  getChild(idx) {
    return null;
  }
  get children() {
    return emptyArray;
  }
  flattenLists() {
    return this;
  }
  deepClone() {
    return this;
  }
}
class TextAstNode extends ImmutableLeafAstNode {
  get kind() {
    return 0 /* Text */;
  }
  get missingOpeningBracketIds() {
    return SmallImmutableSet.getEmpty();
  }
  canBeReused(_openedBracketIds) {
    return true;
  }
  computeMinIndentation(offset, textModel) {
    const start = lengthToObj(offset);
    const startLineNumber = (start.columnCount === 0 ? start.lineCount : start.lineCount + 1) + 1;
    const endLineNumber = lengthGetLineCount(lengthAdd(offset, this.length)) + 1;
    let result = Number.MAX_SAFE_INTEGER;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const firstNonWsColumn = textModel.getLineFirstNonWhitespaceColumn(lineNumber);
      const lineContent = textModel.getLineContent(lineNumber);
      if (firstNonWsColumn === 0) {
        continue;
      }
      const visibleColumn = CursorColumns.visibleColumnFromColumn(lineContent, firstNonWsColumn, textModel.getOptions().tabSize);
      result = Math.min(result, visibleColumn);
    }
    return result;
  }
}
class BracketAstNode extends ImmutableLeafAstNode {
  constructor(length, bracketInfo, bracketIds) {
    super(length);
    this.bracketInfo = bracketInfo;
    this.bracketIds = bracketIds;
  }
  static create(length, bracketInfo, bracketIds) {
    const node = new BracketAstNode(length, bracketInfo, bracketIds);
    return node;
  }
  get kind() {
    return 1 /* Bracket */;
  }
  get missingOpeningBracketIds() {
    return SmallImmutableSet.getEmpty();
  }
  get text() {
    return this.bracketInfo.bracketText;
  }
  get languageId() {
    return this.bracketInfo.languageId;
  }
  canBeReused(_openedBracketIds) {
    return false;
  }
  computeMinIndentation(offset, textModel) {
    return Number.MAX_SAFE_INTEGER;
  }
}
class InvalidBracketAstNode extends ImmutableLeafAstNode {
  get kind() {
    return 3 /* UnexpectedClosingBracket */;
  }
  constructor(closingBrackets, length) {
    super(length);
    this.missingOpeningBracketIds = closingBrackets;
  }
  canBeReused(openedBracketIds) {
    return !openedBracketIds.intersects(this.missingOpeningBracketIds);
  }
  computeMinIndentation(offset, textModel) {
    return Number.MAX_SAFE_INTEGER;
  }
}
export {
  AstNodeKind,
  BracketAstNode,
  InvalidBracketAstNode,
  ListAstNode,
  PairAstNode,
  TextAstNode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXGJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnRcXGJyYWNrZXRQYWlyc1RyZWVcXGFzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb2x1bW5zIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9jdXJzb3JDb2x1bW5zLmpzJztcbmltcG9ydCB7IEJyYWNrZXRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vbGFuZ3VhZ2VzL3N1cHBvcnRzL2xhbmd1YWdlQnJhY2tldHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBMZW5ndGgsIGxlbmd0aEFkZCwgbGVuZ3RoR2V0TGluZUNvdW50LCBsZW5ndGhUb09iaiwgbGVuZ3RoWmVybyB9IGZyb20gJy4vbGVuZ3RoLmpzJztcbmltcG9ydCB7IFNtYWxsSW1tdXRhYmxlU2V0IH0gZnJvbSAnLi9zbWFsbEltbXV0YWJsZVNldC5qcyc7XG5pbXBvcnQgeyBPcGVuaW5nQnJhY2tldElkIH0gZnJvbSAnLi90b2tlbml6ZXIuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBBc3ROb2RlS2luZCB7XG5cdFRleHQgPSAwLFxuXHRCcmFja2V0ID0gMSxcblx0UGFpciA9IDIsXG5cdFVuZXhwZWN0ZWRDbG9zaW5nQnJhY2tldCA9IDMsXG5cdExpc3QgPSA0LFxufVxuXG5leHBvcnQgdHlwZSBBc3ROb2RlID0gUGFpckFzdE5vZGUgfCBMaXN0QXN0Tm9kZSB8IEJyYWNrZXRBc3ROb2RlIHwgSW52YWxpZEJyYWNrZXRBc3ROb2RlIHwgVGV4dEFzdE5vZGU7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gZm9yIGFsbCBBU1Qgbm9kZXMuXG4qL1xuYWJzdHJhY3QgY2xhc3MgQmFzZUFzdE5vZGUge1xuXHRwdWJsaWMgYWJzdHJhY3QgcmVhZG9ubHkga2luZDogQXN0Tm9kZUtpbmQ7XG5cblx0cHVibGljIGFic3RyYWN0IHJlYWRvbmx5IGNoaWxkcmVuTGVuZ3RoOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIE1pZ2h0IHJldHVybiBudWxsIGV2ZW4gaWYge0BsaW5rIGlkeH0gaXMgc21hbGxlciB0aGFuIHtAbGluayBCYXNlQXN0Tm9kZS5jaGlsZHJlbkxlbmd0aH0uXG5cdCovXG5cdHB1YmxpYyBhYnN0cmFjdCBnZXRDaGlsZChpZHg6IG51bWJlcik6IEFzdE5vZGUgfCBudWxsO1xuXG5cdC8qKlxuXHQgKiBUcnkgdG8gYXZvaWQgdXNpbmcgdGhpcyBwcm9wZXJ0eSwgYXMgaW1wbGVtZW50YXRpb25zIG1pZ2h0IG5lZWQgdG8gYWxsb2NhdGUgdGhlIHJlc3VsdGluZyBhcnJheS5cblx0Ki9cblx0cHVibGljIGFic3RyYWN0IHJlYWRvbmx5IGNoaWxkcmVuOiByZWFkb25seSBBc3ROb2RlW107XG5cblx0LyoqXG5cdCAqIFJlcHJlc2VudHMgdGhlIHNldCBvZiBhbGwgKHBvdGVudGlhbGx5KSBtaXNzaW5nIG9wZW5pbmcgYnJhY2tldCBpZHMgaW4gdGhpcyBub2RlLlxuXHQgKiBFLmcuIGluIGB7IF0gKSB9YCB0aGF0IHNldCBpcyB7YFtgLCBgKGAgfS5cblx0Ki9cblx0cHVibGljIGFic3RyYWN0IHJlYWRvbmx5IG1pc3NpbmdPcGVuaW5nQnJhY2tldElkczogU21hbGxJbW11dGFibGVTZXQ8T3BlbmluZ0JyYWNrZXRJZD47XG5cblx0LyoqXG5cdCAqIEluIGNhc2Ugb2YgYSBsaXN0LCBkZXRlcm1pbmVzIHRoZSBoZWlnaHQgb2YgdGhlICgyLDMpIHRyZWUuXG5cdCovXG5cdHB1YmxpYyBhYnN0cmFjdCByZWFkb25seSBsaXN0SGVpZ2h0OiBudW1iZXI7XG5cblx0cHJvdGVjdGVkIF9sZW5ndGg6IExlbmd0aDtcblxuXHQvKipcblx0ICogVGhlIGxlbmd0aCBvZiB0aGUgZW50aXJlIG5vZGUsIHdoaWNoIHNob3VsZCBlcXVhbCB0aGUgc3VtIG9mIGxlbmd0aHMgb2YgYWxsIGNoaWxkcmVuLlxuXHQqL1xuXHRwdWJsaWMgZ2V0IGxlbmd0aCgpOiBMZW5ndGgge1xuXHRcdHJldHVybiB0aGlzLl9sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgY29uc3RydWN0b3IobGVuZ3RoOiBMZW5ndGgpIHtcblx0XHR0aGlzLl9sZW5ndGggPSBsZW5ndGg7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIG9wZW5CcmFja2V0SWRzIFRoZSBzZXQgb2YgYWxsIG9wZW5pbmcgYnJhY2tldHMgdGhhdCBoYXZlIG5vdCB5ZXQgYmVlbiBjbG9zZWQuXG5cdCAqL1xuXHRwdWJsaWMgYWJzdHJhY3QgY2FuQmVSZXVzZWQoXG5cdFx0b3BlbkJyYWNrZXRJZHM6IFNtYWxsSW1tdXRhYmxlU2V0PE9wZW5pbmdCcmFja2V0SWQ+XG5cdCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZsYXR0ZW5zIGFsbCBsaXN0cyBpbiB0aGlzIEFTVC4gT25seSBmb3IgZGVidWdnaW5nLlxuXHQgKi9cblx0cHVibGljIGFic3RyYWN0IGZsYXR0ZW5MaXN0cygpOiBBc3ROb2RlO1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgZGVlcCBjbG9uZS5cblx0ICovXG5cdHB1YmxpYyBhYnN0cmFjdCBkZWVwQ2xvbmUoKTogQXN0Tm9kZTtcblxuXHRwdWJsaWMgYWJzdHJhY3QgY29tcHV0ZU1pbkluZGVudGF0aW9uKG9mZnNldDogTGVuZ3RoLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBudW1iZXI7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIGJyYWNrZXQgcGFpciBpbmNsdWRpbmcgaXRzIGNoaWxkIChlLmcuIGB7IC4uLiB9YCkuXG4gKiBNaWdodCBiZSB1bmNsb3NlZC5cbiAqIEltbXV0YWJsZSwgaWYgYWxsIGNoaWxkcmVuIGFyZSBpbW11dGFibGUuXG4qL1xuZXhwb3J0IGNsYXNzIFBhaXJBc3ROb2RlIGV4dGVuZHMgQmFzZUFzdE5vZGUge1xuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShcblx0XHRvcGVuaW5nQnJhY2tldDogQnJhY2tldEFzdE5vZGUsXG5cdFx0Y2hpbGQ6IEFzdE5vZGUgfCBudWxsLFxuXHRcdGNsb3NpbmdCcmFja2V0OiBCcmFja2V0QXN0Tm9kZSB8IG51bGxcblx0KSB7XG5cdFx0bGV0IGxlbmd0aCA9IG9wZW5pbmdCcmFja2V0Lmxlbmd0aDtcblx0XHRpZiAoY2hpbGQpIHtcblx0XHRcdGxlbmd0aCA9IGxlbmd0aEFkZChsZW5ndGgsIGNoaWxkLmxlbmd0aCk7XG5cdFx0fVxuXHRcdGlmIChjbG9zaW5nQnJhY2tldCkge1xuXHRcdFx0bGVuZ3RoID0gbGVuZ3RoQWRkKGxlbmd0aCwgY2xvc2luZ0JyYWNrZXQubGVuZ3RoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQYWlyQXN0Tm9kZShsZW5ndGgsIG9wZW5pbmdCcmFja2V0LCBjaGlsZCwgY2xvc2luZ0JyYWNrZXQsIGNoaWxkID8gY2hpbGQubWlzc2luZ09wZW5pbmdCcmFja2V0SWRzIDogU21hbGxJbW11dGFibGVTZXQuZ2V0RW1wdHkoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGtpbmQoKTogQXN0Tm9kZUtpbmQuUGFpciB7XG5cdFx0cmV0dXJuIEFzdE5vZGVLaW5kLlBhaXI7XG5cdH1cblx0cHVibGljIGdldCBsaXN0SGVpZ2h0KCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdHB1YmxpYyBnZXQgY2hpbGRyZW5MZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMztcblx0fVxuXHRwdWJsaWMgZ2V0Q2hpbGQoaWR4OiBudW1iZXIpOiBBc3ROb2RlIHwgbnVsbCB7XG5cdFx0c3dpdGNoIChpZHgpIHtcblx0XHRcdGNhc2UgMDogcmV0dXJuIHRoaXMub3BlbmluZ0JyYWNrZXQ7XG5cdFx0XHRjYXNlIDE6IHJldHVybiB0aGlzLmNoaWxkO1xuXHRcdFx0Y2FzZSAyOiByZXR1cm4gdGhpcy5jbG9zaW5nQnJhY2tldDtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNoaWxkIGluZGV4Jyk7XG5cdH1cblxuXHQvKipcblx0ICogQXZvaWQgdXNpbmcgdGhpcyBwcm9wZXJ0eSwgaXQgYWxsb2NhdGVzIGFuIGFycmF5IVxuXHQqL1xuXHRwdWJsaWMgZ2V0IGNoaWxkcmVuKCkge1xuXHRcdGNvbnN0IHJlc3VsdDogQXN0Tm9kZVtdID0gW107XG5cdFx0cmVzdWx0LnB1c2godGhpcy5vcGVuaW5nQnJhY2tldCk7XG5cdFx0aWYgKHRoaXMuY2hpbGQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY2hpbGQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jbG9zaW5nQnJhY2tldCkge1xuXHRcdFx0cmVzdWx0LnB1c2godGhpcy5jbG9zaW5nQnJhY2tldCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdGxlbmd0aDogTGVuZ3RoLFxuXHRcdHB1YmxpYyByZWFkb25seSBvcGVuaW5nQnJhY2tldDogQnJhY2tldEFzdE5vZGUsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNoaWxkOiBBc3ROb2RlIHwgbnVsbCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY2xvc2luZ0JyYWNrZXQ6IEJyYWNrZXRBc3ROb2RlIHwgbnVsbCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWlzc2luZ09wZW5pbmdCcmFja2V0SWRzOiBTbWFsbEltbXV0YWJsZVNldDxPcGVuaW5nQnJhY2tldElkPlxuXHQpIHtcblx0XHRzdXBlcihsZW5ndGgpO1xuXHR9XG5cblx0cHVibGljIGNhbkJlUmV1c2VkKG9wZW5CcmFja2V0SWRzOiBTbWFsbEltbXV0YWJsZVNldDxPcGVuaW5nQnJhY2tldElkPikge1xuXHRcdGlmICh0aGlzLmNsb3NpbmdCcmFja2V0ID09PSBudWxsKSB7XG5cdFx0XHQvLyBVbmNsb3NlZCBwYWlyIGFzdCBub2RlcyBvbmx5XG5cdFx0XHQvLyBlbmQgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcblx0XHRcdC8vIG9yIHdoZW4gYSBwYXJlbnQgbm9kZSBpcyBjbG9zZWQuXG5cblx0XHRcdC8vIFRoaXMgY291bGQgYmUgaW1wcm92ZWQ6XG5cdFx0XHQvLyBPbmx5IHJldHVybiBmYWxzZSBpZiBzb21lIG5leHQgdG9rZW4gaXMgbmVpdGhlciBcInVuZGVmaW5lZFwiIG5vciBhIGJyYWNrZXQgdGhhdCBjbG9zZXMgYSBwYXJlbnQuXG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAob3BlbkJyYWNrZXRJZHMuaW50ZXJzZWN0cyh0aGlzLm1pc3NpbmdPcGVuaW5nQnJhY2tldElkcykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBmbGF0dGVuTGlzdHMoKTogUGFpckFzdE5vZGUge1xuXHRcdHJldHVybiBQYWlyQXN0Tm9kZS5jcmVhdGUoXG5cdFx0XHR0aGlzLm9wZW5pbmdCcmFja2V0LmZsYXR0ZW5MaXN0cygpLFxuXHRcdFx0dGhpcy5jaGlsZCAmJiB0aGlzLmNoaWxkLmZsYXR0ZW5MaXN0cygpLFxuXHRcdFx0dGhpcy5jbG9zaW5nQnJhY2tldCAmJiB0aGlzLmNsb3NpbmdCcmFja2V0LmZsYXR0ZW5MaXN0cygpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBkZWVwQ2xvbmUoKTogUGFpckFzdE5vZGUge1xuXHRcdHJldHVybiBuZXcgUGFpckFzdE5vZGUoXG5cdFx0XHR0aGlzLmxlbmd0aCxcblx0XHRcdHRoaXMub3BlbmluZ0JyYWNrZXQuZGVlcENsb25lKCksXG5cdFx0XHR0aGlzLmNoaWxkICYmIHRoaXMuY2hpbGQuZGVlcENsb25lKCksXG5cdFx0XHR0aGlzLmNsb3NpbmdCcmFja2V0ICYmIHRoaXMuY2xvc2luZ0JyYWNrZXQuZGVlcENsb25lKCksXG5cdFx0XHR0aGlzLm1pc3NpbmdPcGVuaW5nQnJhY2tldElkc1xuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZU1pbkluZGVudGF0aW9uKG9mZnNldDogTGVuZ3RoLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkID8gdGhpcy5jaGlsZC5jb21wdXRlTWluSW5kZW50YXRpb24obGVuZ3RoQWRkKG9mZnNldCwgdGhpcy5vcGVuaW5nQnJhY2tldC5sZW5ndGgpLCB0ZXh0TW9kZWwpIDogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVI7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIExpc3RBc3ROb2RlIGV4dGVuZHMgQmFzZUFzdE5vZGUge1xuXHQvKipcblx0ICogVGhpcyBtZXRob2QgdXNlcyBtb3JlIG1lbW9yeS1lZmZpY2llbnQgbGlzdCBub2RlcyB0aGF0IGNhbiBvbmx5IHN0b3JlIDIgb3IgMyBjaGlsZHJlbi5cblx0Ki9cblx0cHVibGljIHN0YXRpYyBjcmVhdGUyMyhpdGVtMTogQXN0Tm9kZSwgaXRlbTI6IEFzdE5vZGUsIGl0ZW0zOiBBc3ROb2RlIHwgbnVsbCwgaW1tdXRhYmxlOiBib29sZWFuID0gZmFsc2UpOiBMaXN0QXN0Tm9kZSB7XG5cdFx0bGV0IGxlbmd0aCA9IGl0ZW0xLmxlbmd0aDtcblx0XHRsZXQgbWlzc2luZ0JyYWNrZXRJZHMgPSBpdGVtMS5taXNzaW5nT3BlbmluZ0JyYWNrZXRJZHM7XG5cblx0XHRpZiAoaXRlbTEubGlzdEhlaWdodCAhPT0gaXRlbTIubGlzdEhlaWdodCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxpc3QgaGVpZ2h0cycpO1xuXHRcdH1cblxuXHRcdGxlbmd0aCA9IGxlbmd0aEFkZChsZW5ndGgsIGl0ZW0yLmxlbmd0aCk7XG5cdFx0bWlzc2luZ0JyYWNrZXRJZHMgPSBtaXNzaW5nQnJhY2tldElkcy5tZXJnZShpdGVtMi5taXNzaW5nT3BlbmluZ0JyYWNrZXRJZHMpO1xuXG5cdFx0aWYgKGl0ZW0zKSB7XG5cdFx0XHRpZiAoaXRlbTEubGlzdEhlaWdodCAhPT0gaXRlbTMubGlzdEhlaWdodCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbGlzdCBoZWlnaHRzJyk7XG5cdFx0XHR9XG5cdFx0XHRsZW5ndGggPSBsZW5ndGhBZGQobGVuZ3RoLCBpdGVtMy5sZW5ndGgpO1xuXHRcdFx0bWlzc2luZ0JyYWNrZXRJZHMgPSBtaXNzaW5nQnJhY2tldElkcy5tZXJnZShpdGVtMy5taXNzaW5nT3BlbmluZ0JyYWNrZXRJZHMpO1xuXHRcdH1cblx0XHRyZXR1cm4gaW1tdXRhYmxlXG5cdFx0XHQ/IG5ldyBJbW11dGFibGUyM0xpc3RBc3ROb2RlKGxlbmd0aCwgaXRlbTEubGlzdEhlaWdodCArIDEsIGl0ZW0xLCBpdGVtMiwgaXRlbTMsIG1pc3NpbmdCcmFja2V0SWRzKVxuXHRcdFx0OiBuZXcgVHdvVGhyZWVMaXN0QXN0Tm9kZShsZW5ndGgsIGl0ZW0xLmxpc3RIZWlnaHQgKyAxLCBpdGVtMSwgaXRlbTIsIGl0ZW0zLCBtaXNzaW5nQnJhY2tldElkcyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShpdGVtczogQXN0Tm9kZVtdLCBpbW11dGFibGU6IGJvb2xlYW4gPSBmYWxzZSk6IExpc3RBc3ROb2RlIHtcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRFbXB0eSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgbGVuZ3RoID0gaXRlbXNbMF0ubGVuZ3RoO1xuXHRcdFx0bGV0IHVub3BlbmVkQnJhY2tldHMgPSBpdGVtc1swXS5taXNzaW5nT3BlbmluZ0JyYWNrZXRJZHM7XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGxlbmd0aCA9IGxlbmd0aEFkZChsZW5ndGgsIGl0ZW1zW2ldLmxlbmd0aCk7XG5cdFx0XHRcdHVub3BlbmVkQnJhY2tldHMgPSB1bm9wZW5lZEJyYWNrZXRzLm1lcmdlKGl0ZW1zW2ldLm1pc3NpbmdPcGVuaW5nQnJhY2tldElkcyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW1tdXRhYmxlXG5cdFx0XHRcdD8gbmV3IEltbXV0YWJsZUFycmF5TGlzdEFzdE5vZGUobGVuZ3RoLCBpdGVtc1swXS5saXN0SGVpZ2h0ICsgMSwgaXRlbXMsIHVub3BlbmVkQnJhY2tldHMpXG5cdFx0XHRcdDogbmV3IEFycmF5TGlzdEFzdE5vZGUobGVuZ3RoLCBpdGVtc1swXS5saXN0SGVpZ2h0ICsgMSwgaXRlbXMsIHVub3BlbmVkQnJhY2tldHMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RW1wdHkoKSB7XG5cdFx0cmV0dXJuIG5ldyBJbW11dGFibGVBcnJheUxpc3RBc3ROb2RlKGxlbmd0aFplcm8sIDAsIFtdLCBTbWFsbEltbXV0YWJsZVNldC5nZXRFbXB0eSgpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQga2luZCgpOiBBc3ROb2RlS2luZC5MaXN0IHtcblx0XHRyZXR1cm4gQXN0Tm9kZUtpbmQuTGlzdDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbWlzc2luZ09wZW5pbmdCcmFja2V0SWRzKCk6IFNtYWxsSW1tdXRhYmxlU2V0PE9wZW5pbmdCcmFja2V0SWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbWlzc2luZ09wZW5pbmdCcmFja2V0SWRzO1xuXHR9XG5cblx0cHJpdmF0ZSBjYWNoZWRNaW5JbmRlbnRhdGlvbjogbnVtYmVyID0gLTE7XG5cblx0LyoqXG5cdCAqIFVzZSBMaXN0QXN0Tm9kZS5jcmVhdGUuXG5cdCovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxlbmd0aDogTGVuZ3RoLFxuXHRcdHB1YmxpYyByZWFkb25seSBsaXN0SGVpZ2h0OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfbWlzc2luZ09wZW5pbmdCcmFja2V0SWRzOiBTbWFsbEltbXV0YWJsZVNldDxPcGVuaW5nQnJhY2tldElkPlxuXHQpIHtcblx0XHRzdXBlcihsZW5ndGgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHRocm93SWZJbW11dGFibGUoKTogdm9pZCB7XG5cdFx0Ly8gTk9PUFxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHNldENoaWxkKGlkeDogbnVtYmVyLCBjaGlsZDogQXN0Tm9kZSk6IHZvaWQ7XG5cblx0cHVibGljIG1ha2VMYXN0RWxlbWVudE11dGFibGUoKTogQXN0Tm9kZSB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy50aHJvd0lmSW1tdXRhYmxlKCk7XG5cdFx0Y29uc3QgY2hpbGRDb3VudCA9IHRoaXMuY2hpbGRyZW5MZW5ndGg7XG5cdFx0aWYgKGNoaWxkQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RDaGlsZCA9IHRoaXMuZ2V0Q2hpbGQoY2hpbGRDb3VudCAtIDEpITtcblx0XHRjb25zdCBtdXRhYmxlID0gbGFzdENoaWxkLmtpbmQgPT09IEFzdE5vZGVLaW5kLkxpc3QgPyBsYXN0Q2hpbGQudG9NdXRhYmxlKCkgOiBsYXN0Q2hpbGQ7XG5cdFx0aWYgKGxhc3RDaGlsZCAhPT0gbXV0YWJsZSkge1xuXHRcdFx0dGhpcy5zZXRDaGlsZChjaGlsZENvdW50IC0gMSwgbXV0YWJsZSk7XG5cdFx0fVxuXHRcdHJldHVybiBtdXRhYmxlO1xuXHR9XG5cblx0cHVibGljIG1ha2VGaXJzdEVsZW1lbnRNdXRhYmxlKCk6IEFzdE5vZGUgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMudGhyb3dJZkltbXV0YWJsZSgpO1xuXHRcdGNvbnN0IGNoaWxkQ291bnQgPSB0aGlzLmNoaWxkcmVuTGVuZ3RoO1xuXHRcdGlmIChjaGlsZENvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBmaXJzdENoaWxkID0gdGhpcy5nZXRDaGlsZCgwKSE7XG5cdFx0Y29uc3QgbXV0YWJsZSA9IGZpcnN0Q2hpbGQua2luZCA9PT0gQXN0Tm9kZUtpbmQuTGlzdCA/IGZpcnN0Q2hpbGQudG9NdXRhYmxlKCkgOiBmaXJzdENoaWxkO1xuXHRcdGlmIChmaXJzdENoaWxkICE9PSBtdXRhYmxlKSB7XG5cdFx0XHR0aGlzLnNldENoaWxkKDAsIG11dGFibGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbXV0YWJsZTtcblx0fVxuXG5cdHB1YmxpYyBjYW5CZVJldXNlZChvcGVuQnJhY2tldElkczogU21hbGxJbW11dGFibGVTZXQ8T3BlbmluZ0JyYWNrZXRJZD4pOiBib29sZWFuIHtcblx0XHRpZiAob3BlbkJyYWNrZXRJZHMuaW50ZXJzZWN0cyh0aGlzLm1pc3NpbmdPcGVuaW5nQnJhY2tldElkcykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGlsZHJlbkxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gRG9uJ3QgcmV1c2UgZW1wdHkgbGlzdHMuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IGxhc3RDaGlsZDogTGlzdEFzdE5vZGUgPSB0aGlzO1xuXHRcdHdoaWxlIChsYXN0Q2hpbGQua2luZCA9PT0gQXN0Tm9kZUtpbmQuTGlzdCkge1xuXHRcdFx0Y29uc3QgbGFzdExlbmd0aCA9IGxhc3RDaGlsZC5jaGlsZHJlbkxlbmd0aDtcblx0XHRcdGlmIChsYXN0TGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIEVtcHR5IGxpc3RzIHNob3VsZCBuZXZlciBiZSBjb250YWluZWQgaW4gb3RoZXIgbGlzdHMuXG5cdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdGxhc3RDaGlsZCA9IGxhc3RDaGlsZC5nZXRDaGlsZChsYXN0TGVuZ3RoIC0gMSkgYXMgTGlzdEFzdE5vZGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxhc3RDaGlsZC5jYW5CZVJldXNlZChvcGVuQnJhY2tldElkcyk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlQ2hpbGRyZW5DaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMudGhyb3dJZkltbXV0YWJsZSgpO1xuXG5cdFx0Y29uc3QgY291bnQgPSB0aGlzLmNoaWxkcmVuTGVuZ3RoO1xuXG5cdFx0bGV0IGxlbmd0aCA9IHRoaXMuZ2V0Q2hpbGQoMCkhLmxlbmd0aDtcblx0XHRsZXQgdW5vcGVuZWRCcmFja2V0cyA9IHRoaXMuZ2V0Q2hpbGQoMCkhLm1pc3NpbmdPcGVuaW5nQnJhY2tldElkcztcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgY2hpbGQgPSB0aGlzLmdldENoaWxkKGkpITtcblx0XHRcdGxlbmd0aCA9IGxlbmd0aEFkZChsZW5ndGgsIGNoaWxkLmxlbmd0aCk7XG5cdFx0XHR1bm9wZW5lZEJyYWNrZXRzID0gdW5vcGVuZWRCcmFja2V0cy5tZXJnZShjaGlsZC5taXNzaW5nT3BlbmluZ0JyYWNrZXRJZHMpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xlbmd0aCA9IGxlbmd0aDtcblx0XHR0aGlzLl9taXNzaW5nT3BlbmluZ0JyYWNrZXRJZHMgPSB1bm9wZW5lZEJyYWNrZXRzO1xuXHRcdHRoaXMuY2FjaGVkTWluSW5kZW50YXRpb24gPSAtMTtcblx0fVxuXG5cdHB1YmxpYyBmbGF0dGVuTGlzdHMoKTogTGlzdEFzdE5vZGUge1xuXHRcdGNvbnN0IGl0ZW1zOiBBc3ROb2RlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGMgb2YgdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZCA9IGMuZmxhdHRlbkxpc3RzKCk7XG5cdFx0XHRpZiAobm9ybWFsaXplZC5raW5kID09PSBBc3ROb2RlS2luZC5MaXN0KSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goLi4ubm9ybWFsaXplZC5jaGlsZHJlbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpdGVtcy5wdXNoKG5vcm1hbGl6ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gTGlzdEFzdE5vZGUuY3JlYXRlKGl0ZW1zKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlTWluSW5kZW50YXRpb24ob2Zmc2V0OiBMZW5ndGgsIHRleHRNb2RlbDogSVRleHRNb2RlbCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuY2FjaGVkTWluSW5kZW50YXRpb24gIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jYWNoZWRNaW5JbmRlbnRhdGlvbjtcblx0XHR9XG5cblx0XHRsZXQgbWluSW5kZW50YXRpb24gPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0XHRsZXQgY2hpbGRPZmZzZXQgPSBvZmZzZXQ7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuTGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGNoaWxkID0gdGhpcy5nZXRDaGlsZChpKTtcblx0XHRcdGlmIChjaGlsZCkge1xuXHRcdFx0XHRtaW5JbmRlbnRhdGlvbiA9IE1hdGgubWluKG1pbkluZGVudGF0aW9uLCBjaGlsZC5jb21wdXRlTWluSW5kZW50YXRpb24oY2hpbGRPZmZzZXQsIHRleHRNb2RlbCkpO1xuXHRcdFx0XHRjaGlsZE9mZnNldCA9IGxlbmd0aEFkZChjaGlsZE9mZnNldCwgY2hpbGQubGVuZ3RoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmNhY2hlZE1pbkluZGVudGF0aW9uID0gbWluSW5kZW50YXRpb247XG5cdFx0cmV0dXJuIG1pbkluZGVudGF0aW9uO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBzaGFsbG93IGNsb25lIHRoYXQgaXMgbXV0YWJsZSwgb3IgaXRzZWxmIGlmIGl0IGlzIGFscmVhZHkgbXV0YWJsZS5cblx0ICovXG5cdHB1YmxpYyBhYnN0cmFjdCB0b011dGFibGUoKTogTGlzdEFzdE5vZGU7XG5cblx0cHVibGljIGFic3RyYWN0IGFwcGVuZENoaWxkT2ZTYW1lSGVpZ2h0KG5vZGU6IEFzdE5vZGUpOiB2b2lkO1xuXHRwdWJsaWMgYWJzdHJhY3QgdW5hcHBlbmRDaGlsZCgpOiBBc3ROb2RlIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgYWJzdHJhY3QgcHJlcGVuZENoaWxkT2ZTYW1lSGVpZ2h0KG5vZGU6IEFzdE5vZGUpOiB2b2lkO1xuXHRwdWJsaWMgYWJzdHJhY3QgdW5wcmVwZW5kQ2hpbGQoKTogQXN0Tm9kZSB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgVHdvVGhyZWVMaXN0QXN0Tm9kZSBleHRlbmRzIExpc3RBc3ROb2RlIHtcblx0cHVibGljIGdldCBjaGlsZHJlbkxlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtMyAhPT0gbnVsbCA/IDMgOiAyO1xuXHR9XG5cdHB1YmxpYyBnZXRDaGlsZChpZHg6IG51bWJlcik6IEFzdE5vZGUgfCBudWxsIHtcblx0XHRzd2l0Y2ggKGlkeCkge1xuXHRcdFx0Y2FzZSAwOiByZXR1cm4gdGhpcy5faXRlbTE7XG5cdFx0XHRjYXNlIDE6IHJldHVybiB0aGlzLl9pdGVtMjtcblx0XHRcdGNhc2UgMjogcmV0dXJuIHRoaXMuX2l0ZW0zO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY2hpbGQgaW5kZXgnKTtcblx0fVxuXHRwcm90ZWN0ZWQgc2V0Q2hpbGQoaWR4OiBudW1iZXIsIG5vZGU6IEFzdE5vZGUpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKGlkeCkge1xuXHRcdFx0Y2FzZSAwOiB0aGlzLl9pdGVtMSA9IG5vZGU7IHJldHVybjtcblx0XHRcdGNhc2UgMTogdGhpcy5faXRlbTIgPSBub2RlOyByZXR1cm47XG5cdFx0XHRjYXNlIDI6IHRoaXMuX2l0ZW0zID0gbm9kZTsgcmV0dXJuO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY2hpbGQgaW5kZXgnKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY2hpbGRyZW4oKTogcmVhZG9ubHkgQXN0Tm9kZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5faXRlbTMgPyBbdGhpcy5faXRlbTEsIHRoaXMuX2l0ZW0yLCB0aGlzLl9pdGVtM10gOiBbdGhpcy5faXRlbTEsIHRoaXMuX2l0ZW0yXTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXRlbTEoKTogQXN0Tm9kZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW0xO1xuXHR9XG5cdHB1YmxpYyBnZXQgaXRlbTIoKTogQXN0Tm9kZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW0yO1xuXHR9XG5cdHB1YmxpYyBnZXQgaXRlbTMoKTogQXN0Tm9kZSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtMztcblx0fVxuXG5cdHB1YmxpYyBjb25zdHJ1Y3Rvcihcblx0XHRsZW5ndGg6IExlbmd0aCxcblx0XHRsaXN0SGVpZ2h0OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfaXRlbTE6IEFzdE5vZGUsXG5cdFx0cHJpdmF0ZSBfaXRlbTI6IEFzdE5vZGUsXG5cdFx0cHJpdmF0ZSBfaXRlbTM6IEFzdE5vZGUgfCBudWxsLFxuXHRcdG1pc3NpbmdPcGVuaW5nQnJhY2tldElkczogU21hbGxJbW11dGFibGVTZXQ8T3BlbmluZ0JyYWNrZXRJZD5cblx0KSB7XG5cdFx0c3VwZXIobGVuZ3RoLCBsaXN0SGVpZ2h0LCBtaXNzaW5nT3BlbmluZ0JyYWNrZXRJZHMpO1xuXHR9XG5cblx0cHVibGljIGRlZXBDbG9uZSgpOiBMaXN0QXN0Tm9kZSB7XG5cdFx0cmV0dXJuIG5ldyBUd29UaHJlZUxpc3RBc3ROb2RlKFxuXHRcdFx0dGhpcy5sZW5ndGgsXG5cdFx0XHR0aGlzLmxpc3RIZWlnaHQsXG5cdFx0XHR0aGlzLl9pdGVtMS5kZWVwQ2xvbmUoKSxcblx0XHRcdHRoaXMuX2l0ZW0yLmRlZXBDbG9uZSgpLFxuXHRcdFx0dGhpcy5faXRlbTMgPyB0aGlzLl9pdGVtMy5kZWVwQ2xvbmUoKSA6IG51bGwsXG5cdFx0XHR0aGlzLm1pc3NpbmdPcGVuaW5nQnJhY2tldElkc1xuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgYXBwZW5kQ2hpbGRPZlNhbWVIZWlnaHQobm9kZTogQXN0Tm9kZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pdGVtMykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgYXBwZW5kIHRvIGEgZnVsbCAoMiwzKSB0cmVlIG5vZGUnKTtcblx0XHR9XG5cdFx0dGhpcy50aHJvd0lmSW1tdXRhYmxlKCk7XG5cdFx0dGhpcy5faXRlbTMgPSBub2RlO1xuXHRcdHRoaXMuaGFuZGxlQ2hpbGRyZW5DaGFuZ2VkKCk7XG5cdH1cblxuXHRwdWJsaWMgdW5hcHBlbmRDaGlsZCgpOiBBc3ROb2RlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2l0ZW0zKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZW1vdmUgZnJvbSBhIG5vbi1mdWxsICgyLDMpIHRyZWUgbm9kZScpO1xuXHRcdH1cblx0XHR0aGlzLnRocm93SWZJbW11dGFibGUoKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9pdGVtMztcblx0XHR0aGlzLl9pdGVtMyA9IG51bGw7XG5cdFx0dGhpcy5oYW5kbGVDaGlsZHJlbkNoYW5nZWQoKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHByZXBlbmRDaGlsZE9mU2FtZUhlaWdodChub2RlOiBBc3ROb2RlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2l0ZW0zKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBwcmVwZW5kIHRvIGEgZnVsbCAoMiwzKSB0cmVlIG5vZGUnKTtcblx0XHR9XG5cdFx0dGhpcy50aHJvd0lmSW1tdXRhYmxlKCk7XG5cdFx0dGhpcy5faXRlbTMgPSB0aGlzLl9pdGVtMjtcblx0XHR0aGlzLl9pdGVtMiA9IHRoaXMuX2l0ZW0xO1xuXHRcdHRoaXMuX2l0ZW0xID0gbm9kZTtcblx0XHR0aGlzLmhhbmRsZUNoaWxkcmVuQ2hhbmdlZCgpO1xuXHR9XG5cblx0cHVibGljIHVucHJlcGVuZENoaWxkKCk6IEFzdE5vZGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5faXRlbTMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlbW92ZSBmcm9tIGEgbm9uLWZ1bGwgKDIsMykgdHJlZSBub2RlJyk7XG5cdFx0fVxuXHRcdHRoaXMudGhyb3dJZkltbXV0YWJsZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2l0ZW0xO1xuXHRcdHRoaXMuX2l0ZW0xID0gdGhpcy5faXRlbTI7XG5cdFx0dGhpcy5faXRlbTIgPSB0aGlzLl9pdGVtMztcblx0XHR0aGlzLl9pdGVtMyA9IG51bGw7XG5cblx0XHR0aGlzLmhhbmRsZUNoaWxkcmVuQ2hhbmdlZCgpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRvdmVycmlkZSB0b011dGFibGUoKTogTGlzdEFzdE5vZGUge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59XG5cbi8qKlxuICogSW1tdXRhYmxlLCBpZiBhbGwgY2hpbGRyZW4gYXJlIGltbXV0YWJsZS5cbiovXG5jbGFzcyBJbW11dGFibGUyM0xpc3RBc3ROb2RlIGV4dGVuZHMgVHdvVGhyZWVMaXN0QXN0Tm9kZSB7XG5cdG92ZXJyaWRlIHRvTXV0YWJsZSgpOiBMaXN0QXN0Tm9kZSB7XG5cdFx0cmV0dXJuIG5ldyBUd29UaHJlZUxpc3RBc3ROb2RlKHRoaXMubGVuZ3RoLCB0aGlzLmxpc3RIZWlnaHQsIHRoaXMuaXRlbTEsIHRoaXMuaXRlbTIsIHRoaXMuaXRlbTMsIHRoaXMubWlzc2luZ09wZW5pbmdCcmFja2V0SWRzKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB0aHJvd0lmSW1tdXRhYmxlKCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcigndGhpcyBpbnN0YW5jZSBpcyBpbW11dGFibGUnKTtcblx0fVxufVxuXG4vKipcbiAqIEZvciBkZWJ1Z2dpbmcuXG4qL1xuY2xhc3MgQXJyYXlMaXN0QXN0Tm9kZSBleHRlbmRzIExpc3RBc3ROb2RlIHtcblx0Z2V0IGNoaWxkcmVuTGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoaWxkcmVuLmxlbmd0aDtcblx0fVxuXHRnZXRDaGlsZChpZHg6IG51bWJlcik6IEFzdE5vZGUgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW5baWR4XTtcblx0fVxuXHRwcm90ZWN0ZWQgc2V0Q2hpbGQoaWR4OiBudW1iZXIsIGNoaWxkOiBBc3ROb2RlKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hpbGRyZW5baWR4XSA9IGNoaWxkO1xuXHR9XG5cdGdldCBjaGlsZHJlbigpOiByZWFkb25seSBBc3ROb2RlW10ge1xuXHRcdHJldHVybiB0aGlzLl9jaGlsZHJlbjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxlbmd0aDogTGVuZ3RoLFxuXHRcdGxpc3RIZWlnaHQ6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jaGlsZHJlbjogQXN0Tm9kZVtdLFxuXHRcdG1pc3NpbmdPcGVuaW5nQnJhY2tldElkczogU21hbGxJbW11dGFibGVTZXQ8T3BlbmluZ0JyYWNrZXRJZD5cblx0KSB7XG5cdFx0c3VwZXIobGVuZ3RoLCBsaXN0SGVpZ2h0LCBtaXNzaW5nT3BlbmluZ0JyYWNrZXRJZHMpO1xuXHR9XG5cblx0ZGVlcENsb25lKCk6IExpc3RBc3ROb2RlIHtcblx0XHRjb25zdCBjaGlsZHJlbiA9IG5ldyBBcnJheTxBc3ROb2RlPih0aGlzLl9jaGlsZHJlbi5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNoaWxkcmVuW2ldID0gdGhpcy5fY2hpbGRyZW5baV0uZGVlcENsb25lKCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgQXJyYXlMaXN0QXN0Tm9kZSh0aGlzLmxlbmd0aCwgdGhpcy5saXN0SGVpZ2h0LCBjaGlsZHJlbiwgdGhpcy5taXNzaW5nT3BlbmluZ0JyYWNrZXRJZHMpO1xuXHR9XG5cblx0cHVibGljIGFwcGVuZENoaWxkT2ZTYW1lSGVpZ2h0KG5vZGU6IEFzdE5vZGUpOiB2b2lkIHtcblx0XHR0aGlzLnRocm93SWZJbW11dGFibGUoKTtcblx0XHR0aGlzLl9jaGlsZHJlbi5wdXNoKG5vZGUpO1xuXHRcdHRoaXMuaGFuZGxlQ2hpbGRyZW5DaGFuZ2VkKCk7XG5cdH1cblxuXHRwdWJsaWMgdW5hcHBlbmRDaGlsZCgpOiBBc3ROb2RlIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLnRocm93SWZJbW11dGFibGUoKTtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2hpbGRyZW4ucG9wKCk7XG5cdFx0dGhpcy5oYW5kbGVDaGlsZHJlbkNoYW5nZWQoKTtcblx0XHRyZXR1cm4gaXRlbTtcblx0fVxuXG5cdHB1YmxpYyBwcmVwZW5kQ2hpbGRPZlNhbWVIZWlnaHQobm9kZTogQXN0Tm9kZSk6IHZvaWQge1xuXHRcdHRoaXMudGhyb3dJZkltbXV0YWJsZSgpO1xuXHRcdHRoaXMuX2NoaWxkcmVuLnVuc2hpZnQobm9kZSk7XG5cdFx0dGhpcy5oYW5kbGVDaGlsZHJlbkNoYW5nZWQoKTtcblx0fVxuXG5cdHB1YmxpYyB1bnByZXBlbmRDaGlsZCgpOiBBc3ROb2RlIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLnRocm93SWZJbW11dGFibGUoKTtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2hpbGRyZW4uc2hpZnQoKTtcblx0XHR0aGlzLmhhbmRsZUNoaWxkcmVuQ2hhbmdlZCgpO1xuXHRcdHJldHVybiBpdGVtO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHRvTXV0YWJsZSgpOiBMaXN0QXN0Tm9kZSB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cblxuLyoqXG4gKiBJbW11dGFibGUsIGlmIGFsbCBjaGlsZHJlbiBhcmUgaW1tdXRhYmxlLlxuKi9cbmNsYXNzIEltbXV0YWJsZUFycmF5TGlzdEFzdE5vZGUgZXh0ZW5kcyBBcnJheUxpc3RBc3ROb2RlIHtcblx0b3ZlcnJpZGUgdG9NdXRhYmxlKCk6IExpc3RBc3ROb2RlIHtcblx0XHRyZXR1cm4gbmV3IEFycmF5TGlzdEFzdE5vZGUodGhpcy5sZW5ndGgsIHRoaXMubGlzdEhlaWdodCwgWy4uLnRoaXMuY2hpbGRyZW5dLCB0aGlzLm1pc3NpbmdPcGVuaW5nQnJhY2tldElkcyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdGhyb3dJZkltbXV0YWJsZSgpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ3RoaXMgaW5zdGFuY2UgaXMgaW1tdXRhYmxlJyk7XG5cdH1cbn1cblxuY29uc3QgZW1wdHlBcnJheTogcmVhZG9ubHkgQXN0Tm9kZVtdID0gW107XG5cbmFic3RyYWN0IGNsYXNzIEltbXV0YWJsZUxlYWZBc3ROb2RlIGV4dGVuZHMgQmFzZUFzdE5vZGUge1xuXHRwdWJsaWMgZ2V0IGxpc3RIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblx0cHVibGljIGdldCBjaGlsZHJlbkxlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdHB1YmxpYyBnZXRDaGlsZChpZHg6IG51bWJlcik6IEFzdE5vZGUgfCBudWxsIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRwdWJsaWMgZ2V0IGNoaWxkcmVuKCk6IHJlYWRvbmx5IEFzdE5vZGVbXSB7XG5cdFx0cmV0dXJuIGVtcHR5QXJyYXk7XG5cdH1cblxuXHRwdWJsaWMgZmxhdHRlbkxpc3RzKCk6IHRoaXMgJiBBc3ROb2RlIHtcblx0XHRyZXR1cm4gdGhpcyBhcyB0aGlzICYgQXN0Tm9kZTtcblx0fVxuXHRwdWJsaWMgZGVlcENsb25lKCk6IHRoaXMgJiBBc3ROb2RlIHtcblx0XHRyZXR1cm4gdGhpcyBhcyB0aGlzICYgQXN0Tm9kZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGV4dEFzdE5vZGUgZXh0ZW5kcyBJbW11dGFibGVMZWFmQXN0Tm9kZSB7XG5cdHB1YmxpYyBnZXQga2luZCgpOiBBc3ROb2RlS2luZC5UZXh0IHtcblx0XHRyZXR1cm4gQXN0Tm9kZUtpbmQuVGV4dDtcblx0fVxuXHRwdWJsaWMgZ2V0IG1pc3NpbmdPcGVuaW5nQnJhY2tldElkcygpOiBTbWFsbEltbXV0YWJsZVNldDxPcGVuaW5nQnJhY2tldElkPiB7XG5cdFx0cmV0dXJuIFNtYWxsSW1tdXRhYmxlU2V0LmdldEVtcHR5KCk7XG5cdH1cblxuXHRwdWJsaWMgY2FuQmVSZXVzZWQoX29wZW5lZEJyYWNrZXRJZHM6IFNtYWxsSW1tdXRhYmxlU2V0PE9wZW5pbmdCcmFja2V0SWQ+KSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZU1pbkluZGVudGF0aW9uKG9mZnNldDogTGVuZ3RoLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBudW1iZXIge1xuXHRcdGNvbnN0IHN0YXJ0ID0gbGVuZ3RoVG9PYmoob2Zmc2V0KTtcblx0XHQvLyBUZXh0IGFzdCBub2RlcyBkb24ndCBoYXZlIHBhcnRpYWwgaW5kZW50YXRpb24gKGVuc3VyZWQgYnkgdGhlIHRva2VuaXplcikuXG5cdFx0Ly8gVGh1cywgaWYgdGhpcyB0ZXh0IG5vZGUgZG9lcyBub3Qgc3RhcnQgYXQgY29sdW1uIDAsIHRoZSBmaXJzdCBsaW5lIGNhbm5vdCBoYXZlIGFueSBpbmRlbnRhdGlvbiBhdCBhbGwuXG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gKHN0YXJ0LmNvbHVtbkNvdW50ID09PSAwID8gc3RhcnQubGluZUNvdW50IDogc3RhcnQubGluZUNvdW50ICsgMSkgKyAxO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBsZW5ndGhHZXRMaW5lQ291bnQobGVuZ3RoQWRkKG9mZnNldCwgdGhpcy5sZW5ndGgpKSArIDE7XG5cblx0XHRsZXQgcmVzdWx0ID0gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVI7XG5cblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgZmlyc3ROb25Xc0NvbHVtbiA9IHRleHRNb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSB0ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRpZiAoZmlyc3ROb25Xc0NvbHVtbiA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdmlzaWJsZUNvbHVtbiA9IEN1cnNvckNvbHVtbnMudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4obGluZUNvbnRlbnQsIGZpcnN0Tm9uV3NDb2x1bW4sIHRleHRNb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZSk7XG5cdFx0XHRyZXN1bHQgPSBNYXRoLm1pbihyZXN1bHQsIHZpc2libGVDb2x1bW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyYWNrZXRBc3ROb2RlIGV4dGVuZHMgSW1tdXRhYmxlTGVhZkFzdE5vZGUge1xuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShcblx0XHRsZW5ndGg6IExlbmd0aCxcblx0XHRicmFja2V0SW5mbzogQnJhY2tldEtpbmQsXG5cdFx0YnJhY2tldElkczogU21hbGxJbW11dGFibGVTZXQ8T3BlbmluZ0JyYWNrZXRJZD5cblx0KTogQnJhY2tldEFzdE5vZGUge1xuXHRcdGNvbnN0IG5vZGUgPSBuZXcgQnJhY2tldEFzdE5vZGUobGVuZ3RoLCBicmFja2V0SW5mbywgYnJhY2tldElkcyk7XG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGtpbmQoKTogQXN0Tm9kZUtpbmQuQnJhY2tldCB7XG5cdFx0cmV0dXJuIEFzdE5vZGVLaW5kLkJyYWNrZXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1pc3NpbmdPcGVuaW5nQnJhY2tldElkcygpOiBTbWFsbEltbXV0YWJsZVNldDxPcGVuaW5nQnJhY2tldElkPiB7XG5cdFx0cmV0dXJuIFNtYWxsSW1tdXRhYmxlU2V0LmdldEVtcHR5KCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdGxlbmd0aDogTGVuZ3RoLFxuXHRcdHB1YmxpYyByZWFkb25seSBicmFja2V0SW5mbzogQnJhY2tldEtpbmQsXG5cdFx0LyoqXG5cdFx0ICogSW4gY2FzZSBvZiBhIG9wZW5pbmcgYnJhY2tldCwgdGhpcyBpcyB0aGUgaWQgb2YgdGhlIG9wZW5pbmcgYnJhY2tldC5cblx0XHQgKiBJbiBjYXNlIG9mIGEgY2xvc2luZyBicmFja2V0LCB0aGlzIGNvbnRhaW5zIHRoZSBpZHMgb2YgYWxsIG9wZW5pbmcgYnJhY2tldHMgaXQgY2FuIGNsb3NlLlxuXHRcdCovXG5cdFx0cHVibGljIHJlYWRvbmx5IGJyYWNrZXRJZHM6IFNtYWxsSW1tdXRhYmxlU2V0PE9wZW5pbmdCcmFja2V0SWQ+XG5cdCkge1xuXHRcdHN1cGVyKGxlbmd0aCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRleHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYnJhY2tldEluZm8uYnJhY2tldFRleHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGxhbmd1YWdlSWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYnJhY2tldEluZm8ubGFuZ3VhZ2VJZDtcblx0fVxuXG5cdHB1YmxpYyBjYW5CZVJldXNlZChfb3BlbmVkQnJhY2tldElkczogU21hbGxJbW11dGFibGVTZXQ8T3BlbmluZ0JyYWNrZXRJZD4pIHtcblx0XHQvLyBUaGVzZSBub2RlcyBjb3VsZCBiZSByZXVzZWQsXG5cdFx0Ly8gYnV0IG5vdCBpbiBhIGdlbmVyYWwgd2F5LlxuXHRcdC8vIFRoZWlyIHBhcmVudCBtYXkgYmUgcmV1c2VkLlxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlTWluSW5kZW50YXRpb24ob2Zmc2V0OiBMZW5ndGgsIHRleHRNb2RlbDogSVRleHRNb2RlbCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnZhbGlkQnJhY2tldEFzdE5vZGUgZXh0ZW5kcyBJbW11dGFibGVMZWFmQXN0Tm9kZSB7XG5cdHB1YmxpYyBnZXQga2luZCgpOiBBc3ROb2RlS2luZC5VbmV4cGVjdGVkQ2xvc2luZ0JyYWNrZXQge1xuXHRcdHJldHVybiBBc3ROb2RlS2luZC5VbmV4cGVjdGVkQ2xvc2luZ0JyYWNrZXQ7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgbWlzc2luZ09wZW5pbmdCcmFja2V0SWRzOiBTbWFsbEltbXV0YWJsZVNldDxPcGVuaW5nQnJhY2tldElkPjtcblxuXHRwdWJsaWMgY29uc3RydWN0b3IoY2xvc2luZ0JyYWNrZXRzOiBTbWFsbEltbXV0YWJsZVNldDxPcGVuaW5nQnJhY2tldElkPiwgbGVuZ3RoOiBMZW5ndGgpIHtcblx0XHRzdXBlcihsZW5ndGgpO1xuXHRcdHRoaXMubWlzc2luZ09wZW5pbmdCcmFja2V0SWRzID0gY2xvc2luZ0JyYWNrZXRzO1xuXHR9XG5cblx0cHVibGljIGNhbkJlUmV1c2VkKG9wZW5lZEJyYWNrZXRJZHM6IFNtYWxsSW1tdXRhYmxlU2V0PE9wZW5pbmdCcmFja2V0SWQ+KSB7XG5cdFx0cmV0dXJuICFvcGVuZWRCcmFja2V0SWRzLmludGVyc2VjdHModGhpcy5taXNzaW5nT3BlbmluZ0JyYWNrZXRJZHMpO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGVNaW5JbmRlbnRhdGlvbihvZmZzZXQ6IExlbmd0aCwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVI7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBRzlCLFNBQWlCLFdBQVcsb0JBQW9CLGFBQWEsa0JBQWtCO0FBQy9FLFNBQVMseUJBQXlCO0FBRzNCLElBQVcsY0FBWCxrQkFBV0EsaUJBQVg7QUFDTixFQUFBQSwwQkFBQSxVQUFPLEtBQVA7QUFDQSxFQUFBQSwwQkFBQSxhQUFVLEtBQVY7QUFDQSxFQUFBQSwwQkFBQSxVQUFPLEtBQVA7QUFDQSxFQUFBQSwwQkFBQSw4QkFBMkIsS0FBM0I7QUFDQSxFQUFBQSwwQkFBQSxVQUFPLEtBQVA7QUFMaUIsU0FBQUE7QUFBQSxHQUFBO0FBYWxCLE1BQWUsWUFBWTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBK0IxQixJQUFXLFNBQWlCO0FBQzNCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLFlBQVksUUFBZ0I7QUFDbEMsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFvQkQ7QUFPTyxNQUFNLG9CQUFvQixZQUFZO0FBQUEsRUFpRHBDLFlBQ1AsUUFDZ0IsZ0JBQ0EsT0FDQSxnQkFDQSwwQkFDZjtBQUNELFVBQU0sTUFBTTtBQUxJO0FBQ0E7QUFDQTtBQUNBO0FBQUEsRUFHakI7QUFBQSxFQXhEQSxPQUFjLE9BQ2IsZ0JBQ0EsT0FDQSxnQkFDQztBQUNELFFBQUksU0FBUyxlQUFlO0FBQzVCLFFBQUksT0FBTztBQUNWLGVBQVMsVUFBVSxRQUFRLE1BQU0sTUFBTTtBQUFBLElBQ3hDO0FBQ0EsUUFBSSxnQkFBZ0I7QUFDbkIsZUFBUyxVQUFVLFFBQVEsZUFBZSxNQUFNO0FBQUEsSUFDakQ7QUFDQSxXQUFPLElBQUksWUFBWSxRQUFRLGdCQUFnQixPQUFPLGdCQUFnQixRQUFRLE1BQU0sMkJBQTJCLGtCQUFrQixT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QixhQUFTLGFBQWEsaUJBQWlCLGNBQWMsZUFBZSxjQUFjO0FBQ2pGLFlBQU0sbUJBQW1CLFVBQVUsZ0NBQWdDLFVBQVU7QUFDN0UsWUFBTSxjQUFjLFVBQVUsZUFBZSxVQUFVO0FBQ3ZELFVBQUkscUJBQXFCLEdBQUc7QUFDM0I7QUFBQSxNQUNEO0FBRUEsWUFBTSxnQkFBZ0IsY0FBYyx3QkFBd0IsYUFBYSxrQkFBa0IsVUFBVSxXQUFXLEVBQUUsT0FBTztBQUN6SCxlQUFTLEtBQUssSUFBSSxRQUFRLGFBQWE7QUFBQSxJQUN4QztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFTyxNQUFNLHVCQUF1QixxQkFBcUI7QUFBQSxFQWtCaEQsWUFDUCxRQUNnQixhQUtBLFlBQ2Y7QUFDRCxVQUFNLE1BQU07QUFQSTtBQUtBO0FBQUEsRUFHakI7QUFBQSxFQTNCQSxPQUFjLE9BQ2IsUUFDQSxhQUNBLFlBQ2lCO0FBQ2pCLFVBQU0sT0FBTyxJQUFJLGVBQWUsUUFBUSxhQUFhLFVBQVU7QUFDL0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQVcsT0FBNEI7QUFDdEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQVcsMkJBQWdFO0FBQzFFLFdBQU8sa0JBQWtCLFNBQVM7QUFBQSxFQUNuQztBQUFBLEVBY0EsSUFBVyxPQUFPO0FBQ2pCLFdBQU8sS0FBSyxZQUFZO0FBQUEsRUFDekI7QUFBQSxFQUVBLElBQVcsYUFBYTtBQUN2QixXQUFPLEtBQUssWUFBWTtBQUFBLEVBQ3pCO0FBQUEsRUFFTyxZQUFZLG1CQUF3RDtBQUkxRSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sc0JBQXNCLFFBQWdCLFdBQStCO0FBQzNFLFdBQU8sT0FBTztBQUFBLEVBQ2Y7QUFDRDtBQUVPLE1BQU0sOEJBQThCLHFCQUFxQjtBQUFBLEVBQy9ELElBQVcsT0FBNkM7QUFDdkQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUlPLFlBQVksaUJBQXNELFFBQWdCO0FBQ3hGLFVBQU0sTUFBTTtBQUNaLFNBQUssMkJBQTJCO0FBQUEsRUFDakM7QUFBQSxFQUVPLFlBQVksa0JBQXVEO0FBQ3pFLFdBQU8sQ0FBQyxpQkFBaUIsV0FBVyxLQUFLLHdCQUF3QjtBQUFBLEVBQ2xFO0FBQUEsRUFFTyxzQkFBc0IsUUFBZ0IsV0FBK0I7QUFDM0UsV0FBTyxPQUFPO0FBQUEsRUFDZjtBQUNEOyIsCiAgIm5hbWVzIjogWyJBc3ROb2RlS2luZCJdCn0K
