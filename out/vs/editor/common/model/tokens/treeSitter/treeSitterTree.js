var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { TaskQueue } from "../../../../../base/common/async.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { observableValue, transaction } from "../../../../../base/common/observable.js";
import { setTimeout0 } from "../../../../../base/common/platform.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { TextLength } from "../../../core/text/textLength.js";
import { gotoParent, getClosestPreviousNodes, nextSiblingOrParentSibling, gotoNthChild } from "./cursorUtils.js";
import { Range } from "../../../core/range.js";
let TreeSitterTree = class extends Disposable {
  constructor(languageId, _ranges, _parser, _parserClass, textModel, _logService, _telemetryService) {
    super();
    this.languageId = languageId;
    this._ranges = _ranges;
    this._parser = _parser;
    this._parserClass = _parserClass;
    this.textModel = textModel;
    this._logService = _logService;
    this._telemetryService = _telemetryService;
    this._tree = observableValue(this, void 0);
    this.tree = this._tree;
    this._treeLastParsedVersion = observableValue(this, -1);
    this.treeLastParsedVersion = this._treeLastParsedVersion;
    this._onDidChangeContentQueue = new TaskQueue();
    this._tree = observableValue(this, void 0);
    this.tree = this._tree;
    this._register(toDisposable(() => {
      this._tree.get()?.delete();
      this._lastFullyParsed?.delete();
      this._lastFullyParsedWithEdits?.delete();
      this._parser.delete();
    }));
    this.handleContentChange(void 0, this._ranges);
  }
  handleContentChange(e, ranges) {
    const version = this.textModel.getVersionId();
    let newRanges = [];
    if (ranges) {
      newRanges = this._setRanges(ranges);
    }
    if (e) {
      this._applyEdits(e.changes);
    }
    this._onDidChangeContentQueue.clearPending();
    this._onDidChangeContentQueue.schedule(async () => {
      if (this._store.isDisposed) {
        return;
      }
      const oldTree = this._lastFullyParsed;
      let changedNodes;
      if (this._lastFullyParsedWithEdits && this._lastFullyParsed) {
        changedNodes = this._findChangedNodes(this._lastFullyParsedWithEdits, this._lastFullyParsed);
      }
      const completed = await this._parseAndUpdateTree(version);
      if (completed) {
        let ranges2;
        if (!changedNodes) {
          if (this._ranges) {
            ranges2 = this._ranges.map((r) => ({ newRange: new Range(r.startPosition.row + 1, r.startPosition.column + 1, r.endPosition.row + 1, r.endPosition.column + 1), oldRangeLength: r.endIndex - r.startIndex, newRangeStartOffset: r.startIndex, newRangeEndOffset: r.endIndex }));
          }
        } else if (oldTree && changedNodes) {
          ranges2 = this._findTreeChanges(completed, changedNodes, newRanges);
        }
        if (!ranges2) {
          ranges2 = [{ newRange: this.textModel.getFullModelRange(), newRangeStartOffset: 0, newRangeEndOffset: this.textModel.getValueLength() }];
        }
        const previousTree = this._tree.get();
        transaction((tx) => {
          this._tree.set(completed, tx, { ranges: ranges2, versionId: version });
          this._treeLastParsedVersion.set(version, tx);
        });
        previousTree?.delete();
      }
    });
  }
  get ranges() {
    return this._ranges;
  }
  getInjectionTrees(startIndex, languageId) {
    return void 0;
  }
  _applyEdits(changes) {
    for (const change of changes) {
      const originalTextLength = TextLength.ofRange(Range.lift(change.range));
      const newTextLength = TextLength.ofText(change.text);
      const summedTextLengths = change.text.length === 0 ? newTextLength : originalTextLength.add(newTextLength);
      const edit = {
        startIndex: change.rangeOffset,
        oldEndIndex: change.rangeOffset + change.rangeLength,
        newEndIndex: change.rangeOffset + change.text.length,
        startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
        oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
        newEndPosition: { row: change.range.startLineNumber + summedTextLengths.lineCount - 1, column: summedTextLengths.lineCount ? summedTextLengths.columnCount : change.range.endColumn + summedTextLengths.columnCount }
      };
      this._tree.get()?.edit(edit);
      this._lastFullyParsedWithEdits?.edit(edit);
    }
  }
  _findChangedNodes(newTree, oldTree) {
    if (this._ranges && this._ranges.every((range) => range.startPosition.row !== newTree.rootNode.startPosition.row) || newTree.rootNode.startPosition.row !== 0) {
      return [];
    }
    const newCursor = newTree.walk();
    const oldCursor = oldTree.walk();
    const nodes = [];
    let next = true;
    do {
      if (newCursor.currentNode.hasChanges) {
        const newChildren = newCursor.currentNode.children;
        const indexChangedChildren = [];
        const changedChildren = newChildren.filter((c, index) => {
          if (c?.hasChanges || oldCursor.currentNode.children.length <= index) {
            indexChangedChildren.push(index);
            return true;
          }
          return false;
        });
        if (changedChildren.length === 0 || newCursor.currentNode.hasError !== oldCursor.currentNode.hasError) {
          while (newCursor.currentNode.parent && next && !newCursor.currentNode.isNamed) {
            next = gotoParent(newCursor, oldCursor);
          }
          const newNode = newCursor.currentNode;
          const closestPreviousNode = getClosestPreviousNodes(newCursor, newTree) ?? newNode;
          nodes.push({
            startIndex: closestPreviousNode.startIndex,
            endIndex: newNode.endIndex,
            startPosition: closestPreviousNode.startPosition,
            endPosition: newNode.endPosition
          });
          next = nextSiblingOrParentSibling(newCursor, oldCursor);
        } else if (changedChildren.length >= 1) {
          next = gotoNthChild(newCursor, oldCursor, indexChangedChildren[0]);
        }
      } else {
        next = nextSiblingOrParentSibling(newCursor, oldCursor);
      }
    } while (next);
    newCursor.delete();
    oldCursor.delete();
    return nodes;
  }
  _findTreeChanges(newTree, changedNodes, newRanges) {
    let newRangeIndex = 0;
    const mergedChanges = [];
    for (let nodeIndex = 0; nodeIndex < changedNodes.length; nodeIndex++) {
      const node = changedNodes[nodeIndex];
      if (mergedChanges.length > 0) {
        if (node.startIndex >= mergedChanges[mergedChanges.length - 1].newRangeStartOffset && node.endIndex <= mergedChanges[mergedChanges.length - 1].newRangeEndOffset) {
          continue;
        }
      }
      const cursor = newTree.walk();
      const cursorContainersNode = () => cursor.startIndex < node.startIndex && cursor.endIndex > node.endIndex;
      while (cursorContainersNode()) {
        let child = cursor.gotoFirstChild();
        let foundChild = false;
        while (child) {
          if (cursorContainersNode() && cursor.currentNode.isNamed) {
            foundChild = true;
            break;
          } else {
            child = cursor.gotoNextSibling();
          }
        }
        if (!foundChild) {
          cursor.gotoParent();
          break;
        }
        if (cursor.currentNode.childCount === 0) {
          break;
        }
      }
      const startPosition = cursor.currentNode.startPosition;
      const endPosition = cursor.currentNode.endPosition;
      const startIndex = cursor.currentNode.startIndex;
      const endIndex = cursor.currentNode.endIndex;
      const newChange = { newRange: new Range(startPosition.row + 1, startPosition.column + 1, endPosition.row + 1, endPosition.column + 1), newRangeStartOffset: startIndex, newRangeEndOffset: endIndex };
      if (newRangeIndex < newRanges.length && rangesIntersect(newRanges[newRangeIndex], { startIndex, endIndex, startPosition, endPosition })) {
        if (newRanges[newRangeIndex].startIndex < newChange.newRangeStartOffset) {
          newChange.newRange = newChange.newRange.setStartPosition(newRanges[newRangeIndex].startPosition.row + 1, newRanges[newRangeIndex].startPosition.column + 1);
          newChange.newRangeStartOffset = newRanges[newRangeIndex].startIndex;
        }
        if (newRanges[newRangeIndex].endIndex > newChange.newRangeEndOffset) {
          newChange.newRange = newChange.newRange.setEndPosition(newRanges[newRangeIndex].endPosition.row + 1, newRanges[newRangeIndex].endPosition.column + 1);
          newChange.newRangeEndOffset = newRanges[newRangeIndex].endIndex;
        }
        newRangeIndex++;
      } else if (newRangeIndex < newRanges.length && newRanges[newRangeIndex].endIndex < newChange.newRangeStartOffset) {
        mergedChanges.push({
          newRange: new Range(newRanges[newRangeIndex].startPosition.row + 1, newRanges[newRangeIndex].startPosition.column + 1, newRanges[newRangeIndex].endPosition.row + 1, newRanges[newRangeIndex].endPosition.column + 1),
          newRangeStartOffset: newRanges[newRangeIndex].startIndex,
          newRangeEndOffset: newRanges[newRangeIndex].endIndex
        });
      }
      if (mergedChanges.length > 0 && mergedChanges[mergedChanges.length - 1].newRangeEndOffset >= newChange.newRangeStartOffset) {
        mergedChanges[mergedChanges.length - 1].newRange = Range.fromPositions(mergedChanges[mergedChanges.length - 1].newRange.getStartPosition(), newChange.newRange.getEndPosition());
        mergedChanges[mergedChanges.length - 1].newRangeEndOffset = newChange.newRangeEndOffset;
      } else {
        mergedChanges.push(newChange);
      }
    }
    return this._constrainRanges(mergedChanges);
  }
  _constrainRanges(changes) {
    if (!this._ranges) {
      return changes;
    }
    const constrainedChanges = [];
    let changesIndex = 0;
    let rangesIndex = 0;
    while (changesIndex < changes.length && rangesIndex < this._ranges.length) {
      const change = changes[changesIndex];
      const range = this._ranges[rangesIndex];
      if (change.newRangeEndOffset < range.startIndex) {
        changesIndex++;
      } else if (change.newRangeStartOffset > range.endIndex) {
        rangesIndex++;
      } else {
        const newRangeStartOffset = Math.max(change.newRangeStartOffset, range.startIndex);
        const newRangeEndOffset = Math.min(change.newRangeEndOffset, range.endIndex);
        const newRange = change.newRange.intersectRanges(new Range(range.startPosition.row + 1, range.startPosition.column + 1, range.endPosition.row + 1, range.endPosition.column + 1));
        constrainedChanges.push({
          newRange,
          newRangeEndOffset,
          newRangeStartOffset
        });
        if (newRangeEndOffset < change.newRangeEndOffset) {
          change.newRange = Range.fromPositions(newRange.getEndPosition(), change.newRange.getEndPosition());
          change.newRangeStartOffset = newRangeEndOffset + 1;
        } else {
          changesIndex++;
        }
      }
    }
    return constrainedChanges;
  }
  async _parseAndUpdateTree(version) {
    const tree = await this._parse();
    if (tree) {
      this._lastFullyParsed?.delete();
      this._lastFullyParsed = tree.copy();
      this._lastFullyParsedWithEdits?.delete();
      this._lastFullyParsedWithEdits = tree.copy();
      return tree;
    } else if (!this._tree.get()) {
      this._parser.reset();
    }
    return void 0;
  }
  _parse() {
    let parseType = "fullParse" /* Full */;
    if (this._tree.get()) {
      parseType = "incrementalParse" /* Incremental */;
    }
    return this._parseAndYield(parseType);
  }
  async _parseAndYield(parseType) {
    let time = 0;
    let passes = 0;
    const inProgressVersion = this.textModel.getVersionId();
    let newTree;
    const progressCallback = newTimeOutProgressCallback();
    do {
      const timer = performance.now();
      newTree = this._parser.parse((index, position) => this._parseCallback(index), this._tree.get(), { progressCallback, includedRanges: this._ranges });
      time += performance.now() - timer;
      passes++;
      await new Promise((resolve) => setTimeout0(resolve));
    } while (!this._store.isDisposed && !newTree && inProgressVersion === this.textModel.getVersionId());
    this._sendParseTimeTelemetry(parseType, time, passes);
    return newTree && inProgressVersion === this.textModel.getVersionId() ? newTree : void 0;
  }
  _parseCallback(index) {
    try {
      return this.textModel.getTextBuffer().getNearestChunk(index);
    } catch (e) {
      this._logService.debug("Error getting chunk for tree-sitter parsing", e);
    }
    return void 0;
  }
  _setRanges(newRanges) {
    const unKnownRanges = [];
    if (this._ranges) {
      for (const newRange of newRanges) {
        let isFullyIncluded = false;
        for (let i = 0; i < this._ranges.length; i++) {
          const existingRange = this._ranges[i];
          if (rangesEqual(existingRange, newRange) || rangesIntersect(existingRange, newRange)) {
            isFullyIncluded = true;
            break;
          }
        }
        if (!isFullyIncluded) {
          unKnownRanges.push(newRange);
        }
      }
    } else {
      unKnownRanges.push(...newRanges);
    }
    this._ranges = newRanges;
    return unKnownRanges;
  }
  _sendParseTimeTelemetry(parseType, time, passes) {
    this._logService.debug(`Tree parsing (${parseType}) took ${time} ms and ${passes} passes.`);
    if (parseType === "fullParse" /* Full */) {
      this._telemetryService.publicLog2(`treeSitter.fullParse`, { languageId: this.languageId, time, passes });
    } else {
      this._telemetryService.publicLog2(`treeSitter.incrementalParse`, { languageId: this.languageId, time, passes });
    }
  }
  createParsedTreeSync(src) {
    const parser = new this._parserClass();
    parser.setLanguage(this._parser.language);
    const tree = parser.parse(src);
    parser.delete();
    return tree ?? void 0;
  }
};
TreeSitterTree = __decorateClass([
  __decorateParam(5, ILogService),
  __decorateParam(6, ITelemetryService)
], TreeSitterTree);
var TelemetryParseType = /* @__PURE__ */ ((TelemetryParseType2) => {
  TelemetryParseType2["Full"] = "fullParse";
  TelemetryParseType2["Incremental"] = "incrementalParse";
  return TelemetryParseType2;
})(TelemetryParseType || {});
function newTimeOutProgressCallback() {
  let lastYieldTime = performance.now();
  return function parseProgressCallback(_state) {
    const now = performance.now();
    if (now - lastYieldTime > 50) {
      lastYieldTime = now;
      return true;
    }
    return false;
  };
}
function rangesEqual(a, b) {
  return a.startPosition.row === b.startPosition.row && a.startPosition.column === b.startPosition.column && a.endPosition.row === b.endPosition.row && a.endPosition.column === b.endPosition.column && a.startIndex === b.startIndex && a.endIndex === b.endIndex;
}
function rangesIntersect(a, b) {
  return a.startIndex <= b.startIndex && a.endIndex >= b.startIndex || b.startIndex <= a.startIndex && b.endIndex >= a.startIndex;
}
export {
  TreeSitterTree,
  rangesEqual,
  rangesIntersect
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHRva2Vuc1xcdHJlZVNpdHRlclxcdHJlZVNpdHRlclRyZWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHR5cGUgKiBhcyBUcmVlU2l0dGVyIGZyb20gJ0B2c2NvZGUvdHJlZS1zaXR0ZXItd2FzbSc7XG5pbXBvcnQgeyBUYXNrUXVldWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24sIElPYnNlcnZhYmxlV2l0aENoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgc2V0VGltZW91dDAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGV4dExlbmd0aCB9IGZyb20gJy4uLy4uLy4uL2NvcmUvdGV4dC90ZXh0TGVuZ3RoLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udGVudENoYW5nZSB9IGZyb20gJy4uLy4uL21pcnJvclRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgZ290b1BhcmVudCwgZ2V0Q2xvc2VzdFByZXZpb3VzTm9kZXMsIG5leHRTaWJsaW5nT3JQYXJlbnRTaWJsaW5nLCBnb3RvTnRoQ2hpbGQgfSBmcm9tICcuL2N1cnNvclV0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9yYW5nZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUcmVlU2l0dGVyVHJlZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWUgPSBvYnNlcnZhYmxlVmFsdWU8VHJlZVNpdHRlci5UcmVlIHwgdW5kZWZpbmVkLCBUcmVlUGFyc2VVcGRhdGVFdmVudD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHVibGljIHJlYWRvbmx5IHRyZWU6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxUcmVlU2l0dGVyLlRyZWUgfCB1bmRlZmluZWQsIFRyZWVQYXJzZVVwZGF0ZUV2ZW50PiA9IHRoaXMuX3RyZWU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHJlZUxhc3RQYXJzZWRWZXJzaW9uID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIC0xKTtcblx0cHVibGljIHJlYWRvbmx5IHRyZWVMYXN0UGFyc2VkVmVyc2lvbjogSU9ic2VydmFibGU8bnVtYmVyPiA9IHRoaXMuX3RyZWVMYXN0UGFyc2VkVmVyc2lvbjtcblxuXHRwcml2YXRlIF9sYXN0RnVsbHlQYXJzZWQ6IFRyZWVTaXR0ZXIuVHJlZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEZ1bGx5UGFyc2VkV2l0aEVkaXRzOiBUcmVlU2l0dGVyLlRyZWUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VDb250ZW50UXVldWU6IFRhc2tRdWV1ZSA9IG5ldyBUYXNrUXVldWUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3JhbmdlczogVHJlZVNpdHRlci5SYW5nZVtdIHwgdW5kZWZpbmVkLFxuXHRcdC8vIHJlYWRvbmx5IHRyZWVTaXR0ZXJMYW5ndWFnZTogTGFuZ3VhZ2UsXG5cdFx0LyoqIE11c3QgaGF2ZSB0aGUgbGFuZ3VhZ2Ugc2V0ISAqL1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcnNlcjogVHJlZVNpdHRlci5QYXJzZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGFyc2VyQ2xhc3M6IHR5cGVvZiBUcmVlU2l0dGVyLlBhcnNlcixcblx0XHQvLyBwcml2YXRlIHJlYWRvbmx5IF9pbmplY3Rpb25RdWVyeTogVHJlZVNpdHRlci5RdWVyeSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdGV4dE1vZGVsOiBUZXh0TW9kZWwsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdHJlZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMudHJlZSA9IHRoaXMuX3RyZWU7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdHJlZS5nZXQoKT8uZGVsZXRlKCk7XG5cdFx0XHR0aGlzLl9sYXN0RnVsbHlQYXJzZWQ/LmRlbGV0ZSgpO1xuXHRcdFx0dGhpcy5fbGFzdEZ1bGx5UGFyc2VkV2l0aEVkaXRzPy5kZWxldGUoKTtcblx0XHRcdHRoaXMuX3BhcnNlci5kZWxldGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5oYW5kbGVDb250ZW50Q2hhbmdlKHVuZGVmaW5lZCwgdGhpcy5fcmFuZ2VzKTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVDb250ZW50Q2hhbmdlKGU6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQsIHJhbmdlcz86IFRyZWVTaXR0ZXIuUmFuZ2VbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHZlcnNpb24gPSB0aGlzLnRleHRNb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRsZXQgbmV3UmFuZ2VzOiBUcmVlU2l0dGVyLlJhbmdlW10gPSBbXTtcblx0XHRpZiAocmFuZ2VzKSB7XG5cdFx0XHRuZXdSYW5nZXMgPSB0aGlzLl9zZXRSYW5nZXMocmFuZ2VzKTtcblx0XHR9XG5cdFx0aWYgKGUpIHtcblx0XHRcdHRoaXMuX2FwcGx5RWRpdHMoZS5jaGFuZ2VzKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRRdWV1ZS5jbGVhclBlbmRpbmcoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRRdWV1ZS5zY2hlZHVsZShhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHQvLyBObyBuZWVkIHRvIGNvbnRpbnVlIHRoZSBxdWV1ZSBpZiB3ZSBhcmUgZGlzcG9zZWRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvbGRUcmVlID0gdGhpcy5fbGFzdEZ1bGx5UGFyc2VkO1xuXHRcdFx0bGV0IGNoYW5nZWROb2RlczogVHJlZVNpdHRlci5SYW5nZVtdIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX2xhc3RGdWxseVBhcnNlZFdpdGhFZGl0cyAmJiB0aGlzLl9sYXN0RnVsbHlQYXJzZWQpIHtcblx0XHRcdFx0Y2hhbmdlZE5vZGVzID0gdGhpcy5fZmluZENoYW5nZWROb2Rlcyh0aGlzLl9sYXN0RnVsbHlQYXJzZWRXaXRoRWRpdHMsIHRoaXMuX2xhc3RGdWxseVBhcnNlZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRlZCA9IGF3YWl0IHRoaXMuX3BhcnNlQW5kVXBkYXRlVHJlZSh2ZXJzaW9uKTtcblx0XHRcdGlmIChjb21wbGV0ZWQpIHtcblx0XHRcdFx0bGV0IHJhbmdlczogUmFuZ2VDaGFuZ2VbXSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFjaGFuZ2VkTm9kZXMpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fcmFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRyYW5nZXMgPSB0aGlzLl9yYW5nZXMubWFwKHIgPT4gKHsgbmV3UmFuZ2U6IG5ldyBSYW5nZShyLnN0YXJ0UG9zaXRpb24ucm93ICsgMSwgci5zdGFydFBvc2l0aW9uLmNvbHVtbiArIDEsIHIuZW5kUG9zaXRpb24ucm93ICsgMSwgci5lbmRQb3NpdGlvbi5jb2x1bW4gKyAxKSwgb2xkUmFuZ2VMZW5ndGg6IHIuZW5kSW5kZXggLSByLnN0YXJ0SW5kZXgsIG5ld1JhbmdlU3RhcnRPZmZzZXQ6IHIuc3RhcnRJbmRleCwgbmV3UmFuZ2VFbmRPZmZzZXQ6IHIuZW5kSW5kZXggfSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChvbGRUcmVlICYmIGNoYW5nZWROb2Rlcykge1xuXHRcdFx0XHRcdHJhbmdlcyA9IHRoaXMuX2ZpbmRUcmVlQ2hhbmdlcyhjb21wbGV0ZWQsIGNoYW5nZWROb2RlcywgbmV3UmFuZ2VzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXJhbmdlcykge1xuXHRcdFx0XHRcdHJhbmdlcyA9IFt7IG5ld1JhbmdlOiB0aGlzLnRleHRNb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCBuZXdSYW5nZVN0YXJ0T2Zmc2V0OiAwLCBuZXdSYW5nZUVuZE9mZnNldDogdGhpcy50ZXh0TW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSB9XTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzVHJlZSA9IHRoaXMuX3RyZWUuZ2V0KCk7XG5cdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0XHR0aGlzLl90cmVlLnNldChjb21wbGV0ZWQsIHR4LCB7IHJhbmdlcywgdmVyc2lvbklkOiB2ZXJzaW9uIH0pO1xuXHRcdFx0XHRcdHRoaXMuX3RyZWVMYXN0UGFyc2VkVmVyc2lvbi5zZXQodmVyc2lvbiwgdHgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cHJldmlvdXNUcmVlPy5kZWxldGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGdldCByYW5nZXMoKTogVHJlZVNpdHRlci5SYW5nZVtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2VzO1xuXHR9XG5cblx0cHVibGljIGdldEluamVjdGlvblRyZWVzKHN0YXJ0SW5kZXg6IG51bWJlciwgbGFuZ3VhZ2VJZDogc3RyaW5nKTogVHJlZVNpdHRlclRyZWUgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRPRE9cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlFZGl0cyhjaGFuZ2VzOiBJTW9kZWxDb250ZW50Q2hhbmdlW10pIHtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFRleHRMZW5ndGggPSBUZXh0TGVuZ3RoLm9mUmFuZ2UoUmFuZ2UubGlmdChjaGFuZ2UucmFuZ2UpKTtcblx0XHRcdGNvbnN0IG5ld1RleHRMZW5ndGggPSBUZXh0TGVuZ3RoLm9mVGV4dChjaGFuZ2UudGV4dCk7XG5cdFx0XHRjb25zdCBzdW1tZWRUZXh0TGVuZ3RocyA9IGNoYW5nZS50ZXh0Lmxlbmd0aCA9PT0gMCA/IG5ld1RleHRMZW5ndGggOiBvcmlnaW5hbFRleHRMZW5ndGguYWRkKG5ld1RleHRMZW5ndGgpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IHtcblx0XHRcdFx0c3RhcnRJbmRleDogY2hhbmdlLnJhbmdlT2Zmc2V0LFxuXHRcdFx0XHRvbGRFbmRJbmRleDogY2hhbmdlLnJhbmdlT2Zmc2V0ICsgY2hhbmdlLnJhbmdlTGVuZ3RoLFxuXHRcdFx0XHRuZXdFbmRJbmRleDogY2hhbmdlLnJhbmdlT2Zmc2V0ICsgY2hhbmdlLnRleHQubGVuZ3RoLFxuXHRcdFx0XHRzdGFydFBvc2l0aW9uOiB7IHJvdzogY2hhbmdlLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIGNvbHVtbjogY2hhbmdlLnJhbmdlLnN0YXJ0Q29sdW1uIC0gMSB9LFxuXHRcdFx0XHRvbGRFbmRQb3NpdGlvbjogeyByb3c6IGNoYW5nZS5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSwgY29sdW1uOiBjaGFuZ2UucmFuZ2UuZW5kQ29sdW1uIC0gMSB9LFxuXHRcdFx0XHRuZXdFbmRQb3NpdGlvbjogeyByb3c6IGNoYW5nZS5yYW5nZS5zdGFydExpbmVOdW1iZXIgKyBzdW1tZWRUZXh0TGVuZ3Rocy5saW5lQ291bnQgLSAxLCBjb2x1bW46IHN1bW1lZFRleHRMZW5ndGhzLmxpbmVDb3VudCA/IHN1bW1lZFRleHRMZW5ndGhzLmNvbHVtbkNvdW50IDogKGNoYW5nZS5yYW5nZS5lbmRDb2x1bW4gKyBzdW1tZWRUZXh0TGVuZ3Rocy5jb2x1bW5Db3VudCkgfVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3RyZWUuZ2V0KCk/LmVkaXQoZWRpdCk7XG5cdFx0XHR0aGlzLl9sYXN0RnVsbHlQYXJzZWRXaXRoRWRpdHM/LmVkaXQoZWRpdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmluZENoYW5nZWROb2RlcyhuZXdUcmVlOiBUcmVlU2l0dGVyLlRyZWUsIG9sZFRyZWU6IFRyZWVTaXR0ZXIuVHJlZSk6IFRyZWVTaXR0ZXIuUmFuZ2VbXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCh0aGlzLl9yYW5nZXMgJiYgdGhpcy5fcmFuZ2VzLmV2ZXJ5KHJhbmdlID0+IHJhbmdlLnN0YXJ0UG9zaXRpb24ucm93ICE9PSBuZXdUcmVlLnJvb3ROb2RlLnN0YXJ0UG9zaXRpb24ucm93KSkgfHwgbmV3VHJlZS5yb290Tm9kZS5zdGFydFBvc2l0aW9uLnJvdyAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBuZXdDdXJzb3IgPSBuZXdUcmVlLndhbGsoKTtcblx0XHRjb25zdCBvbGRDdXJzb3IgPSBvbGRUcmVlLndhbGsoKTtcblxuXHRcdGNvbnN0IG5vZGVzOiBUcmVlU2l0dGVyLlJhbmdlW10gPSBbXTtcblx0XHRsZXQgbmV4dCA9IHRydWU7XG5cblx0XHRkbyB7XG5cdFx0XHRpZiAobmV3Q3Vyc29yLmN1cnJlbnROb2RlLmhhc0NoYW5nZXMpIHtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgb25seSBvbmUgb2YgdGhlIGNoaWxkcmVuIGhhcyBjaGFuZ2VzLlxuXHRcdFx0XHQvLyBJZiBpdCdzIG9ubHkgb25lLCB0aGVuIHdlIGdvIHRvIHRoYXQgY2hpbGQuXG5cdFx0XHRcdC8vIElmIGl0J3MgbW9yZSB0aGVuLCB3ZSBuZWVkIHRvIGdvIHRvIGVhY2ggY2hpbGRcblx0XHRcdFx0Ly8gSWYgaXQncyBub25lLCB0aGVuIHdlJ3ZlIGZvdW5kIG9uZSBvZiBvdXIgcmFuZ2VzXG5cdFx0XHRcdGNvbnN0IG5ld0NoaWxkcmVuID0gbmV3Q3Vyc29yLmN1cnJlbnROb2RlLmNoaWxkcmVuO1xuXHRcdFx0XHRjb25zdCBpbmRleENoYW5nZWRDaGlsZHJlbjogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgY2hhbmdlZENoaWxkcmVuID0gbmV3Q2hpbGRyZW4uZmlsdGVyKChjLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdGlmIChjPy5oYXNDaGFuZ2VzIHx8IChvbGRDdXJzb3IuY3VycmVudE5vZGUuY2hpbGRyZW4ubGVuZ3RoIDw9IGluZGV4KSkge1xuXHRcdFx0XHRcdFx0aW5kZXhDaGFuZ2VkQ2hpbGRyZW4ucHVzaChpbmRleCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gSWYgd2UgaGF2ZSBjaGFuZ2VzIGFuZCB3ZSAqaGFkKiBhbiBlcnJvciwgdGhlIHdob2xlIG5vZGUgc2hvdWxkIGJlIHJlZnJlc2hlZC5cblx0XHRcdFx0aWYgKChjaGFuZ2VkQ2hpbGRyZW4ubGVuZ3RoID09PSAwKSB8fCAobmV3Q3Vyc29yLmN1cnJlbnROb2RlLmhhc0Vycm9yICE9PSBvbGRDdXJzb3IuY3VycmVudE5vZGUuaGFzRXJyb3IpKSB7XG5cdFx0XHRcdFx0Ly8gd2FsayB1cCBhZ2FpbiB1bnRpbCB3ZSBnZXQgdG8gdGhlIGZpcnN0IG9uZSB0aGF0J3MgbmFtZWQgYXMgdW5uYW1lZCBub2RlcyBjYW4gYmUgdG9vIGdyYW51bGFyXG5cdFx0XHRcdFx0d2hpbGUgKG5ld0N1cnNvci5jdXJyZW50Tm9kZS5wYXJlbnQgJiYgbmV4dCAmJiAhbmV3Q3Vyc29yLmN1cnJlbnROb2RlLmlzTmFtZWQpIHtcblx0XHRcdFx0XHRcdG5leHQgPSBnb3RvUGFyZW50KG5ld0N1cnNvciwgb2xkQ3Vyc29yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gVXNlIHRoZSBlbmQgcG9zaXRpb24gb2YgdGhlIHByZXZpb3VzIG5vZGUgYW5kIHRoZSBzdGFydCBwb3NpdGlvbiBvZiB0aGUgY3VycmVudCBub2RlXG5cdFx0XHRcdFx0Y29uc3QgbmV3Tm9kZSA9IG5ld0N1cnNvci5jdXJyZW50Tm9kZTtcblx0XHRcdFx0XHRjb25zdCBjbG9zZXN0UHJldmlvdXNOb2RlID0gZ2V0Q2xvc2VzdFByZXZpb3VzTm9kZXMobmV3Q3Vyc29yLCBuZXdUcmVlKSA/PyBuZXdOb2RlO1xuXHRcdFx0XHRcdG5vZGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0c3RhcnRJbmRleDogY2xvc2VzdFByZXZpb3VzTm9kZS5zdGFydEluZGV4LFxuXHRcdFx0XHRcdFx0ZW5kSW5kZXg6IG5ld05vZGUuZW5kSW5kZXgsXG5cdFx0XHRcdFx0XHRzdGFydFBvc2l0aW9uOiBjbG9zZXN0UHJldmlvdXNOb2RlLnN0YXJ0UG9zaXRpb24sXG5cdFx0XHRcdFx0XHRlbmRQb3NpdGlvbjogbmV3Tm9kZS5lbmRQb3NpdGlvblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdG5leHQgPSBuZXh0U2libGluZ09yUGFyZW50U2libGluZyhuZXdDdXJzb3IsIG9sZEN1cnNvcik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY2hhbmdlZENoaWxkcmVuLmxlbmd0aCA+PSAxKSB7XG5cdFx0XHRcdFx0bmV4dCA9IGdvdG9OdGhDaGlsZChuZXdDdXJzb3IsIG9sZEN1cnNvciwgaW5kZXhDaGFuZ2VkQ2hpbGRyZW5bMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXh0ID0gbmV4dFNpYmxpbmdPclBhcmVudFNpYmxpbmcobmV3Q3Vyc29yLCBvbGRDdXJzb3IpO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKG5leHQpO1xuXG5cdFx0bmV3Q3Vyc29yLmRlbGV0ZSgpO1xuXHRcdG9sZEN1cnNvci5kZWxldGUoKTtcblx0XHRyZXR1cm4gbm9kZXM7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kVHJlZUNoYW5nZXMobmV3VHJlZTogVHJlZVNpdHRlci5UcmVlLCBjaGFuZ2VkTm9kZXM6IFRyZWVTaXR0ZXIuUmFuZ2VbXSwgbmV3UmFuZ2VzOiBUcmVlU2l0dGVyLlJhbmdlW10pOiBSYW5nZUNoYW5nZVtdIHtcblx0XHRsZXQgbmV3UmFuZ2VJbmRleCA9IDA7XG5cdFx0Y29uc3QgbWVyZ2VkQ2hhbmdlczogUmFuZ2VDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0Ly8gRmluZCB0aGUgcGFyZW50IGluIHRoZSBuZXcgdHJlZSBvZiB0aGUgY2hhbmdlZCBub2RlXG5cdFx0Zm9yIChsZXQgbm9kZUluZGV4ID0gMDsgbm9kZUluZGV4IDwgY2hhbmdlZE5vZGVzLmxlbmd0aDsgbm9kZUluZGV4KyspIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBjaGFuZ2VkTm9kZXNbbm9kZUluZGV4XTtcblxuXHRcdFx0aWYgKG1lcmdlZENoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAoKG5vZGUuc3RhcnRJbmRleCA+PSBtZXJnZWRDaGFuZ2VzW21lcmdlZENoYW5nZXMubGVuZ3RoIC0gMV0ubmV3UmFuZ2VTdGFydE9mZnNldCkgJiYgKG5vZGUuZW5kSW5kZXggPD0gbWVyZ2VkQ2hhbmdlc1ttZXJnZWRDaGFuZ2VzLmxlbmd0aCAtIDFdLm5ld1JhbmdlRW5kT2Zmc2V0KSkge1xuXHRcdFx0XHRcdC8vIFRoaXMgbm9kZSBpcyB3aXRoaW4gdGhlIHByZXZpb3VzIHJhbmdlLCBza2lwIGl0XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3Vyc29yID0gbmV3VHJlZS53YWxrKCk7XG5cdFx0XHRjb25zdCBjdXJzb3JDb250YWluZXJzTm9kZSA9ICgpID0+IGN1cnNvci5zdGFydEluZGV4IDwgbm9kZS5zdGFydEluZGV4ICYmIGN1cnNvci5lbmRJbmRleCA+IG5vZGUuZW5kSW5kZXg7XG5cblx0XHRcdHdoaWxlIChjdXJzb3JDb250YWluZXJzTm9kZSgpKSB7XG5cdFx0XHRcdC8vIFNlZSBpZiB3ZSBjYW4gZ28gdG8gYSBjaGlsZFxuXHRcdFx0XHRsZXQgY2hpbGQgPSBjdXJzb3IuZ290b0ZpcnN0Q2hpbGQoKTtcblx0XHRcdFx0bGV0IGZvdW5kQ2hpbGQgPSBmYWxzZTtcblx0XHRcdFx0d2hpbGUgKGNoaWxkKSB7XG5cdFx0XHRcdFx0aWYgKGN1cnNvckNvbnRhaW5lcnNOb2RlKCkgJiYgY3Vyc29yLmN1cnJlbnROb2RlLmlzTmFtZWQpIHtcblx0XHRcdFx0XHRcdGZvdW5kQ2hpbGQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNoaWxkID0gY3Vyc29yLmdvdG9OZXh0U2libGluZygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWZvdW5kQ2hpbGQpIHtcblx0XHRcdFx0XHRjdXJzb3IuZ290b1BhcmVudCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjdXJzb3IuY3VycmVudE5vZGUuY2hpbGRDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBjdXJzb3IuY3VycmVudE5vZGUuc3RhcnRQb3NpdGlvbjtcblx0XHRcdGNvbnN0IGVuZFBvc2l0aW9uID0gY3Vyc29yLmN1cnJlbnROb2RlLmVuZFBvc2l0aW9uO1xuXHRcdFx0Y29uc3Qgc3RhcnRJbmRleCA9IGN1cnNvci5jdXJyZW50Tm9kZS5zdGFydEluZGV4O1xuXHRcdFx0Y29uc3QgZW5kSW5kZXggPSBjdXJzb3IuY3VycmVudE5vZGUuZW5kSW5kZXg7XG5cblx0XHRcdGNvbnN0IG5ld0NoYW5nZSA9IHsgbmV3UmFuZ2U6IG5ldyBSYW5nZShzdGFydFBvc2l0aW9uLnJvdyArIDEsIHN0YXJ0UG9zaXRpb24uY29sdW1uICsgMSwgZW5kUG9zaXRpb24ucm93ICsgMSwgZW5kUG9zaXRpb24uY29sdW1uICsgMSksIG5ld1JhbmdlU3RhcnRPZmZzZXQ6IHN0YXJ0SW5kZXgsIG5ld1JhbmdlRW5kT2Zmc2V0OiBlbmRJbmRleCB9O1xuXHRcdFx0aWYgKChuZXdSYW5nZUluZGV4IDwgbmV3UmFuZ2VzLmxlbmd0aCkgJiYgcmFuZ2VzSW50ZXJzZWN0KG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XSwgeyBzdGFydEluZGV4LCBlbmRJbmRleCwgc3RhcnRQb3NpdGlvbiwgZW5kUG9zaXRpb24gfSkpIHtcblx0XHRcdFx0Ly8gY29tYmluZSB0aGUgbmV3IGNoYW5nZSB3aXRoIHRoZSByYW5nZVxuXHRcdFx0XHRpZiAobmV3UmFuZ2VzW25ld1JhbmdlSW5kZXhdLnN0YXJ0SW5kZXggPCBuZXdDaGFuZ2UubmV3UmFuZ2VTdGFydE9mZnNldCkge1xuXHRcdFx0XHRcdG5ld0NoYW5nZS5uZXdSYW5nZSA9IG5ld0NoYW5nZS5uZXdSYW5nZS5zZXRTdGFydFBvc2l0aW9uKG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5zdGFydFBvc2l0aW9uLnJvdyArIDEsIG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5zdGFydFBvc2l0aW9uLmNvbHVtbiArIDEpO1xuXHRcdFx0XHRcdG5ld0NoYW5nZS5uZXdSYW5nZVN0YXJ0T2Zmc2V0ID0gbmV3UmFuZ2VzW25ld1JhbmdlSW5kZXhdLnN0YXJ0SW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5lbmRJbmRleCA+IG5ld0NoYW5nZS5uZXdSYW5nZUVuZE9mZnNldCkge1xuXHRcdFx0XHRcdG5ld0NoYW5nZS5uZXdSYW5nZSA9IG5ld0NoYW5nZS5uZXdSYW5nZS5zZXRFbmRQb3NpdGlvbihuZXdSYW5nZXNbbmV3UmFuZ2VJbmRleF0uZW5kUG9zaXRpb24ucm93ICsgMSwgbmV3UmFuZ2VzW25ld1JhbmdlSW5kZXhdLmVuZFBvc2l0aW9uLmNvbHVtbiArIDEpO1xuXHRcdFx0XHRcdG5ld0NoYW5nZS5uZXdSYW5nZUVuZE9mZnNldCA9IG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5lbmRJbmRleDtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXdSYW5nZUluZGV4Kys7XG5cdFx0XHR9IGVsc2UgaWYgKG5ld1JhbmdlSW5kZXggPCBuZXdSYW5nZXMubGVuZ3RoICYmIG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5lbmRJbmRleCA8IG5ld0NoYW5nZS5uZXdSYW5nZVN0YXJ0T2Zmc2V0KSB7XG5cdFx0XHRcdC8vIGFkZCB0aGUgZnVsbCByYW5nZSB0byB0aGUgbWVyZ2VkIGNoYW5nZXNcblx0XHRcdFx0bWVyZ2VkQ2hhbmdlcy5wdXNoKHtcblx0XHRcdFx0XHRuZXdSYW5nZTogbmV3IFJhbmdlKG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5zdGFydFBvc2l0aW9uLnJvdyArIDEsIG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5zdGFydFBvc2l0aW9uLmNvbHVtbiArIDEsIG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5lbmRQb3NpdGlvbi5yb3cgKyAxLCBuZXdSYW5nZXNbbmV3UmFuZ2VJbmRleF0uZW5kUG9zaXRpb24uY29sdW1uICsgMSksXG5cdFx0XHRcdFx0bmV3UmFuZ2VTdGFydE9mZnNldDogbmV3UmFuZ2VzW25ld1JhbmdlSW5kZXhdLnN0YXJ0SW5kZXgsXG5cdFx0XHRcdFx0bmV3UmFuZ2VFbmRPZmZzZXQ6IG5ld1Jhbmdlc1tuZXdSYW5nZUluZGV4XS5lbmRJbmRleFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKChtZXJnZWRDaGFuZ2VzLmxlbmd0aCA+IDApICYmIChtZXJnZWRDaGFuZ2VzW21lcmdlZENoYW5nZXMubGVuZ3RoIC0gMV0ubmV3UmFuZ2VFbmRPZmZzZXQgPj0gbmV3Q2hhbmdlLm5ld1JhbmdlU3RhcnRPZmZzZXQpKSB7XG5cdFx0XHRcdC8vIE1lcmdlIHRoZSBjaGFuZ2VzXG5cdFx0XHRcdG1lcmdlZENoYW5nZXNbbWVyZ2VkQ2hhbmdlcy5sZW5ndGggLSAxXS5uZXdSYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMobWVyZ2VkQ2hhbmdlc1ttZXJnZWRDaGFuZ2VzLmxlbmd0aCAtIDFdLm5ld1JhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSwgbmV3Q2hhbmdlLm5ld1JhbmdlLmdldEVuZFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRtZXJnZWRDaGFuZ2VzW21lcmdlZENoYW5nZXMubGVuZ3RoIC0gMV0ubmV3UmFuZ2VFbmRPZmZzZXQgPSBuZXdDaGFuZ2UubmV3UmFuZ2VFbmRPZmZzZXQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtZXJnZWRDaGFuZ2VzLnB1c2gobmV3Q2hhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnN0cmFpblJhbmdlcyhtZXJnZWRDaGFuZ2VzKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnN0cmFpblJhbmdlcyhjaGFuZ2VzOiBSYW5nZUNoYW5nZVtdKTogUmFuZ2VDaGFuZ2VbXSB7XG5cdFx0aWYgKCF0aGlzLl9yYW5nZXMpIHtcblx0XHRcdHJldHVybiBjaGFuZ2VzO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnN0cmFpbmVkQ2hhbmdlczogUmFuZ2VDaGFuZ2VbXSA9IFtdO1xuXHRcdGxldCBjaGFuZ2VzSW5kZXggPSAwO1xuXHRcdGxldCByYW5nZXNJbmRleCA9IDA7XG5cdFx0d2hpbGUgKGNoYW5nZXNJbmRleCA8IGNoYW5nZXMubGVuZ3RoICYmIHJhbmdlc0luZGV4IDwgdGhpcy5fcmFuZ2VzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgY2hhbmdlID0gY2hhbmdlc1tjaGFuZ2VzSW5kZXhdO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9yYW5nZXNbcmFuZ2VzSW5kZXhdO1xuXHRcdFx0aWYgKGNoYW5nZS5uZXdSYW5nZUVuZE9mZnNldCA8IHJhbmdlLnN0YXJ0SW5kZXgpIHtcblx0XHRcdFx0Ly8gQ2hhbmdlIGlzIGJlZm9yZSB0aGUgcmFuZ2UsIG1vdmUgdG8gdGhlIG5leHQgY2hhbmdlXG5cdFx0XHRcdGNoYW5nZXNJbmRleCsrO1xuXHRcdFx0fSBlbHNlIGlmIChjaGFuZ2UubmV3UmFuZ2VTdGFydE9mZnNldCA+IHJhbmdlLmVuZEluZGV4KSB7XG5cdFx0XHRcdC8vIENoYW5nZSBpcyBhZnRlciB0aGUgcmFuZ2UsIG1vdmUgdG8gdGhlIG5leHQgcmFuZ2Vcblx0XHRcdFx0cmFuZ2VzSW5kZXgrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIENoYW5nZSBpcyB3aXRoaW4gdGhlIHJhbmdlLCBjb25zdHJhaW4gaXRcblx0XHRcdFx0Y29uc3QgbmV3UmFuZ2VTdGFydE9mZnNldCA9IE1hdGgubWF4KGNoYW5nZS5uZXdSYW5nZVN0YXJ0T2Zmc2V0LCByYW5nZS5zdGFydEluZGV4KTtcblx0XHRcdFx0Y29uc3QgbmV3UmFuZ2VFbmRPZmZzZXQgPSBNYXRoLm1pbihjaGFuZ2UubmV3UmFuZ2VFbmRPZmZzZXQsIHJhbmdlLmVuZEluZGV4KTtcblx0XHRcdFx0Y29uc3QgbmV3UmFuZ2UgPSBjaGFuZ2UubmV3UmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKG5ldyBSYW5nZShyYW5nZS5zdGFydFBvc2l0aW9uLnJvdyArIDEsIHJhbmdlLnN0YXJ0UG9zaXRpb24uY29sdW1uICsgMSwgcmFuZ2UuZW5kUG9zaXRpb24ucm93ICsgMSwgcmFuZ2UuZW5kUG9zaXRpb24uY29sdW1uICsgMSkpITtcblx0XHRcdFx0Y29uc3RyYWluZWRDaGFuZ2VzLnB1c2goe1xuXHRcdFx0XHRcdG5ld1JhbmdlLFxuXHRcdFx0XHRcdG5ld1JhbmdlRW5kT2Zmc2V0LFxuXHRcdFx0XHRcdG5ld1JhbmdlU3RhcnRPZmZzZXRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8vIFJlbW92ZSB0aGUgaW50ZXJzZWN0ZWQgcmFuZ2UgZnJvbSB0aGUgY3VycmVudCBjaGFuZ2Vcblx0XHRcdFx0aWYgKG5ld1JhbmdlRW5kT2Zmc2V0IDwgY2hhbmdlLm5ld1JhbmdlRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdFx0Y2hhbmdlLm5ld1JhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhuZXdSYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBjaGFuZ2UubmV3UmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0Y2hhbmdlLm5ld1JhbmdlU3RhcnRPZmZzZXQgPSBuZXdSYW5nZUVuZE9mZnNldCArIDE7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gTW92ZSB0byB0aGUgbmV4dCBjaGFuZ2Vcblx0XHRcdFx0XHRjaGFuZ2VzSW5kZXgrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb25zdHJhaW5lZENoYW5nZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wYXJzZUFuZFVwZGF0ZVRyZWUodmVyc2lvbjogbnVtYmVyKTogUHJvbWlzZTxUcmVlU2l0dGVyLlRyZWUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0cmVlID0gYXdhaXQgdGhpcy5fcGFyc2UoKTtcblx0XHRpZiAodHJlZSkge1xuXHRcdFx0dGhpcy5fbGFzdEZ1bGx5UGFyc2VkPy5kZWxldGUoKTtcblx0XHRcdHRoaXMuX2xhc3RGdWxseVBhcnNlZCA9IHRyZWUuY29weSgpO1xuXHRcdFx0dGhpcy5fbGFzdEZ1bGx5UGFyc2VkV2l0aEVkaXRzPy5kZWxldGUoKTtcblx0XHRcdHRoaXMuX2xhc3RGdWxseVBhcnNlZFdpdGhFZGl0cyA9IHRyZWUuY29weSgpO1xuXG5cdFx0XHRyZXR1cm4gdHJlZTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLl90cmVlLmdldCgpKSB7XG5cdFx0XHQvLyBObyB0cmVlIG1lYW5zIHRoaXMgaXMgdGhlIGluaXRpYWwgcGFyc2UgYW5kIHRoZXJlIHdlcmUgZWRpdHNcblx0XHRcdC8vIHBhcnNlIGZ1bmN0aW9uIGRvZXNuJ3QgaGFuZGxlIHRoaXMgd2VsbCBhbmQgd2UgY2FuIGVuZCB1cCB3aXRoIGFuIGluY29ycmVjdCB0cmVlLCBzbyB3ZSByZXNldFxuXHRcdFx0dGhpcy5fcGFyc2VyLnJlc2V0KCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9wYXJzZSgpOiBQcm9taXNlPFRyZWVTaXR0ZXIuVHJlZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBwYXJzZVR5cGU6IFRlbGVtZXRyeVBhcnNlVHlwZSA9IFRlbGVtZXRyeVBhcnNlVHlwZS5GdWxsO1xuXHRcdGlmICh0aGlzLl90cmVlLmdldCgpKSB7XG5cdFx0XHRwYXJzZVR5cGUgPSBUZWxlbWV0cnlQYXJzZVR5cGUuSW5jcmVtZW50YWw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wYXJzZUFuZFlpZWxkKHBhcnNlVHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wYXJzZUFuZFlpZWxkKHBhcnNlVHlwZTogVGVsZW1ldHJ5UGFyc2VUeXBlKTogUHJvbWlzZTxUcmVlU2l0dGVyLlRyZWUgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgdGltZTogbnVtYmVyID0gMDtcblx0XHRsZXQgcGFzc2VzOiBudW1iZXIgPSAwO1xuXHRcdGNvbnN0IGluUHJvZ3Jlc3NWZXJzaW9uID0gdGhpcy50ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0bGV0IG5ld1RyZWU6IFRyZWVTaXR0ZXIuVHJlZSB8IG51bGwgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBwcm9ncmVzc0NhbGxiYWNrID0gbmV3VGltZU91dFByb2dyZXNzQ2FsbGJhY2soKTtcblxuXHRcdGRvIHtcblx0XHRcdGNvbnN0IHRpbWVyID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cblx0XHRcdG5ld1RyZWUgPSB0aGlzLl9wYXJzZXIucGFyc2UoKGluZGV4OiBudW1iZXIsIHBvc2l0aW9uPzogVHJlZVNpdHRlci5Qb2ludCkgPT4gdGhpcy5fcGFyc2VDYWxsYmFjayhpbmRleCksIHRoaXMuX3RyZWUuZ2V0KCksIHsgcHJvZ3Jlc3NDYWxsYmFjaywgaW5jbHVkZWRSYW5nZXM6IHRoaXMuX3JhbmdlcyB9KTtcblxuXHRcdFx0dGltZSArPSBwZXJmb3JtYW5jZS5ub3coKSAtIHRpbWVyO1xuXHRcdFx0cGFzc2VzKys7XG5cblx0XHRcdC8vIFNvIGxvbmcgYXMgdGhpcyBpc24ndCB0aGUgaW5pdGlhbCBwYXJzZSwgZXZlbiBpZiB0aGUgbW9kZWwgY2hhbmdlcyBhbmQgZWRpdHMgYXJlIGFwcGxpZWQsIHRoZSB0cmVlIHBhcnNpbmcgd2lsbCBjb250aW51ZSBjb3JyZWN0bHkgYWZ0ZXIgdGhlIGF3YWl0LlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0MChyZXNvbHZlKSk7XG5cblx0XHR9IHdoaWxlICghdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCAmJiAhbmV3VHJlZSAmJiBpblByb2dyZXNzVmVyc2lvbiA9PT0gdGhpcy50ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCkpO1xuXHRcdHRoaXMuX3NlbmRQYXJzZVRpbWVUZWxlbWV0cnkocGFyc2VUeXBlLCB0aW1lLCBwYXNzZXMpO1xuXHRcdHJldHVybiAobmV3VHJlZSAmJiAoaW5Qcm9ncmVzc1ZlcnNpb24gPT09IHRoaXMudGV4dE1vZGVsLmdldFZlcnNpb25JZCgpKSkgPyBuZXdUcmVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VDYWxsYmFjayhpbmRleDogbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMudGV4dE1vZGVsLmdldFRleHRCdWZmZXIoKS5nZXROZWFyZXN0Q2h1bmsoaW5kZXgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0Vycm9yIGdldHRpbmcgY2h1bmsgZm9yIHRyZWUtc2l0dGVyIHBhcnNpbmcnLCBlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3NldFJhbmdlcyhuZXdSYW5nZXM6IFRyZWVTaXR0ZXIuUmFuZ2VbXSk6IFRyZWVTaXR0ZXIuUmFuZ2VbXSB7XG5cdFx0Y29uc3QgdW5Lbm93blJhbmdlczogVHJlZVNpdHRlci5SYW5nZVtdID0gW107XG5cdFx0Ly8gSWYgd2UgaGF2ZSBleGlzdGluZyByYW5nZXMsIGZpbmQgdGhlIHBhcnRzIG9mIHRoZSBuZXcgcmFuZ2VzIHRoYXQgYXJlIG5vdCBpbmNsdWRlZCBpbiB0aGUgZXhpc3Rpbmcgb25lc1xuXHRcdGlmICh0aGlzLl9yYW5nZXMpIHtcblx0XHRcdGZvciAoY29uc3QgbmV3UmFuZ2Ugb2YgbmV3UmFuZ2VzKSB7XG5cdFx0XHRcdGxldCBpc0Z1bGx5SW5jbHVkZWQgPSBmYWxzZTtcblxuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3Jhbmdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nUmFuZ2UgPSB0aGlzLl9yYW5nZXNbaV07XG5cblx0XHRcdFx0XHRpZiAocmFuZ2VzRXF1YWwoZXhpc3RpbmdSYW5nZSwgbmV3UmFuZ2UpIHx8IHJhbmdlc0ludGVyc2VjdChleGlzdGluZ1JhbmdlLCBuZXdSYW5nZSkpIHtcblx0XHRcdFx0XHRcdGlzRnVsbHlJbmNsdWRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWlzRnVsbHlJbmNsdWRlZCkge1xuXHRcdFx0XHRcdHVuS25vd25SYW5nZXMucHVzaChuZXdSYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm8gZXhpc3RpbmcgcmFuZ2VzLCBhbGwgbmV3IHJhbmdlcyBhcmUgdW5rbm93blxuXHRcdFx0dW5Lbm93blJhbmdlcy5wdXNoKC4uLm5ld1Jhbmdlcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmFuZ2VzID0gbmV3UmFuZ2VzO1xuXHRcdHJldHVybiB1bktub3duUmFuZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZFBhcnNlVGltZVRlbGVtZXRyeShwYXJzZVR5cGU6IFRlbGVtZXRyeVBhcnNlVHlwZSwgdGltZTogbnVtYmVyLCBwYXNzZXM6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFRyZWUgcGFyc2luZyAoJHtwYXJzZVR5cGV9KSB0b29rICR7dGltZX0gbXMgYW5kICR7cGFzc2VzfSBwYXNzZXMuYCk7XG5cdFx0dHlwZSBQYXJzZVRpbWVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYWxleHIwMCc7XG5cdFx0XHRjb21tZW50OiAnVXNlZCB0byB1bmRlcnN0YW5kIGhvdyBsb25nIGl0IHRha2VzIHRvIHBhcnNlIGEgdHJlZS1zaXR0ZXIgdHJlZSc7XG5cdFx0XHRsYW5ndWFnZUlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHByb2dyYW1taW5nIGxhbmd1YWdlIElELicgfTtcblx0XHRcdHRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbXMgaXQgdG9vayB0byBwYXJzZScgfTtcblx0XHRcdHBhc3NlczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgcGFzc2VzIGl0IHRvb2sgdG8gcGFyc2UnIH07XG5cdFx0fTtcblx0XHRpZiAocGFyc2VUeXBlID09PSBUZWxlbWV0cnlQYXJzZVR5cGUuRnVsbCkge1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgbGFuZ3VhZ2VJZDogc3RyaW5nOyB0aW1lOiBudW1iZXI7IHBhc3NlczogbnVtYmVyIH0sIFBhcnNlVGltZUNsYXNzaWZpY2F0aW9uPihgdHJlZVNpdHRlci5mdWxsUGFyc2VgLCB7IGxhbmd1YWdlSWQ6IHRoaXMubGFuZ3VhZ2VJZCwgdGltZSwgcGFzc2VzIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBsYW5ndWFnZUlkOiBzdHJpbmc7IHRpbWU6IG51bWJlcjsgcGFzc2VzOiBudW1iZXIgfSwgUGFyc2VUaW1lQ2xhc3NpZmljYXRpb24+KGB0cmVlU2l0dGVyLmluY3JlbWVudGFsUGFyc2VgLCB7IGxhbmd1YWdlSWQ6IHRoaXMubGFuZ3VhZ2VJZCwgdGltZSwgcGFzc2VzIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVQYXJzZWRUcmVlU3luYyhzcmM6IHN0cmluZyk6IFRyZWVTaXR0ZXIuVHJlZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGFyc2VyID0gbmV3IHRoaXMuX3BhcnNlckNsYXNzKCk7XG5cdFx0cGFyc2VyLnNldExhbmd1YWdlKHRoaXMuX3BhcnNlci5sYW5ndWFnZSk7XG5cdFx0Y29uc3QgdHJlZSA9IHBhcnNlci5wYXJzZShzcmMpO1xuXHRcdHBhcnNlci5kZWxldGUoKTtcblx0XHRyZXR1cm4gdHJlZSA/PyB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY29uc3QgZW51bSBUZWxlbWV0cnlQYXJzZVR5cGUge1xuXHRGdWxsID0gJ2Z1bGxQYXJzZScsXG5cdEluY3JlbWVudGFsID0gJ2luY3JlbWVudGFsUGFyc2UnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJlZVBhcnNlVXBkYXRlRXZlbnQge1xuXHRyYW5nZXM6IFJhbmdlQ2hhbmdlW107XG5cdHZlcnNpb25JZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJhbmdlV2l0aE9mZnNldHMge1xuXHRyYW5nZTogUmFuZ2U7XG5cdHN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdGVuZE9mZnNldDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJhbmdlQ2hhbmdlIHtcblx0bmV3UmFuZ2U6IFJhbmdlO1xuXHRuZXdSYW5nZVN0YXJ0T2Zmc2V0OiBudW1iZXI7XG5cdG5ld1JhbmdlRW5kT2Zmc2V0OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIG5ld1RpbWVPdXRQcm9ncmVzc0NhbGxiYWNrKCk6IChzdGF0ZTogVHJlZVNpdHRlci5QYXJzZVN0YXRlKSA9PiB2b2lkIHtcblx0bGV0IGxhc3RZaWVsZFRpbWU6IG51bWJlciA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXHRyZXR1cm4gZnVuY3Rpb24gcGFyc2VQcm9ncmVzc0NhbGxiYWNrKF9zdGF0ZTogVHJlZVNpdHRlci5QYXJzZVN0YXRlKSB7XG5cdFx0Y29uc3Qgbm93ID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0aWYgKG5vdyAtIGxhc3RZaWVsZFRpbWUgPiA1MCkge1xuXHRcdFx0bGFzdFlpZWxkVGltZSA9IG5vdztcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH07XG59XG5leHBvcnQgZnVuY3Rpb24gcmFuZ2VzRXF1YWwoYTogVHJlZVNpdHRlci5SYW5nZSwgYjogVHJlZVNpdHRlci5SYW5nZSkge1xuXHRyZXR1cm4gKGEuc3RhcnRQb3NpdGlvbi5yb3cgPT09IGIuc3RhcnRQb3NpdGlvbi5yb3cpXG5cdFx0JiYgKGEuc3RhcnRQb3NpdGlvbi5jb2x1bW4gPT09IGIuc3RhcnRQb3NpdGlvbi5jb2x1bW4pXG5cdFx0JiYgKGEuZW5kUG9zaXRpb24ucm93ID09PSBiLmVuZFBvc2l0aW9uLnJvdylcblx0XHQmJiAoYS5lbmRQb3NpdGlvbi5jb2x1bW4gPT09IGIuZW5kUG9zaXRpb24uY29sdW1uKVxuXHRcdCYmIChhLnN0YXJ0SW5kZXggPT09IGIuc3RhcnRJbmRleClcblx0XHQmJiAoYS5lbmRJbmRleCA9PT0gYi5lbmRJbmRleCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByYW5nZXNJbnRlcnNlY3QoYTogVHJlZVNpdHRlci5SYW5nZSwgYjogVHJlZVNpdHRlci5SYW5nZSkge1xuXHRyZXR1cm4gKGEuc3RhcnRJbmRleCA8PSBiLnN0YXJ0SW5kZXggJiYgYS5lbmRJbmRleCA+PSBiLnN0YXJ0SW5kZXgpIHx8XG5cdFx0KGIuc3RhcnRJbmRleCA8PSBhLnN0YXJ0SW5kZXggJiYgYi5lbmRJbmRleCA+PSBhLnN0YXJ0SW5kZXgpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQXNCLGlCQUFpQixtQkFBMEM7QUFDakYsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFJM0IsU0FBUyxZQUFZLHlCQUF5Qiw0QkFBNEIsb0JBQW9CO0FBQzlGLFNBQVMsYUFBYTtBQUVmLElBQU0saUJBQU4sY0FBNkIsV0FBVztBQUFBLEVBYTlDLFlBQ2lCLFlBQ1IsU0FHUyxTQUNBLGNBRUQsV0FDYyxhQUNNLG1CQUNuQztBQUNELFVBQU07QUFYVTtBQUNSO0FBR1M7QUFDQTtBQUVEO0FBQ2M7QUFDTTtBQXJCckMsU0FBaUIsUUFBUSxnQkFBbUUsTUFBTSxNQUFTO0FBQzNHLFNBQWdCLE9BQWlGLEtBQUs7QUFFdEcsU0FBaUIseUJBQXlCLGdCQUFnQixNQUFNLEVBQUU7QUFDbEUsU0FBZ0Isd0JBQTZDLEtBQUs7QUFLbEUsU0FBUSwyQkFBc0MsSUFBSSxVQUFVO0FBZ0IzRCxTQUFLLFFBQVEsZ0JBQWdCLE1BQU0sTUFBUztBQUM1QyxTQUFLLE9BQU8sS0FBSztBQUVqQixTQUFLLFVBQVUsYUFBYSxNQUFNO0FBQ2pDLFdBQUssTUFBTSxJQUFJLEdBQUcsT0FBTztBQUN6QixXQUFLLGtCQUFrQixPQUFPO0FBQzlCLFdBQUssMkJBQTJCLE9BQU87QUFDdkMsV0FBSyxRQUFRLE9BQU87QUFBQSxJQUNyQixDQUFDLENBQUM7QUFDRixTQUFLLG9CQUFvQixRQUFXLEtBQUssT0FBTztBQUFBLEVBQ2pEO0FBQUEsRUFFTyxvQkFBb0IsR0FBMEMsUUFBbUM7QUFDdkcsVUFBTSxVQUFVLEtBQUssVUFBVSxhQUFhO0FBQzVDLFFBQUksWUFBZ0MsQ0FBQztBQUNyQyxRQUFJLFFBQVE7QUFDWCxrQkFBWSxLQUFLLFdBQVcsTUFBTTtBQUFBLElBQ25DO0FBQ0EsUUFBSSxHQUFHO0FBQ04sV0FBSyxZQUFZLEVBQUUsT0FBTztBQUFBLElBQzNCO0FBRUEsU0FBSyx5QkFBeUIsYUFBYTtBQUMzQyxTQUFLLHlCQUF5QixTQUFTLFlBQVk7QUFDbEQsVUFBSSxLQUFLLE9BQU8sWUFBWTtBQUUzQjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFVBQVUsS0FBSztBQUNyQixVQUFJO0FBQ0osVUFBSSxLQUFLLDZCQUE2QixLQUFLLGtCQUFrQjtBQUM1RCx1QkFBZSxLQUFLLGtCQUFrQixLQUFLLDJCQUEyQixLQUFLLGdCQUFnQjtBQUFBLE1BQzVGO0FBRUEsWUFBTSxZQUFZLE1BQU0sS0FBSyxvQkFBb0IsT0FBTztBQUN4RCxVQUFJLFdBQVc7QUFDZCxZQUFJQTtBQUNKLFlBQUksQ0FBQyxjQUFjO0FBQ2xCLGNBQUksS0FBSyxTQUFTO0FBQ2pCLFlBQUFBLFVBQVMsS0FBSyxRQUFRLElBQUksUUFBTSxFQUFFLFVBQVUsSUFBSSxNQUFNLEVBQUUsY0FBYyxNQUFNLEdBQUcsRUFBRSxjQUFjLFNBQVMsR0FBRyxFQUFFLFlBQVksTUFBTSxHQUFHLEVBQUUsWUFBWSxTQUFTLENBQUMsR0FBRyxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsWUFBWSxxQkFBcUIsRUFBRSxZQUFZLG1CQUFtQixFQUFFLFNBQVMsRUFBRTtBQUFBLFVBQzVRO0FBQUEsUUFDRCxXQUFXLFdBQVcsY0FBYztBQUNuQyxVQUFBQSxVQUFTLEtBQUssaUJBQWlCLFdBQVcsY0FBYyxTQUFTO0FBQUEsUUFDbEU7QUFDQSxZQUFJLENBQUNBLFNBQVE7QUFDWixVQUFBQSxVQUFTLENBQUMsRUFBRSxVQUFVLEtBQUssVUFBVSxrQkFBa0IsR0FBRyxxQkFBcUIsR0FBRyxtQkFBbUIsS0FBSyxVQUFVLGVBQWUsRUFBRSxDQUFDO0FBQUEsUUFDdkk7QUFFQSxjQUFNLGVBQWUsS0FBSyxNQUFNLElBQUk7QUFDcEMsb0JBQVksUUFBTTtBQUNqQixlQUFLLE1BQU0sSUFBSSxXQUFXLElBQUksRUFBRSxRQUFBQSxTQUFRLFdBQVcsUUFBUSxDQUFDO0FBQzVELGVBQUssdUJBQXVCLElBQUksU0FBUyxFQUFFO0FBQUEsUUFDNUMsQ0FBQztBQUNELHNCQUFjLE9BQU87QUFBQSxNQUN0QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksU0FBeUM7QUFDNUMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sa0JBQWtCLFlBQW9CLFlBQWdEO0FBRTVGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxZQUFZLFNBQWdDO0FBQ25ELGVBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQU0scUJBQXFCLFdBQVcsUUFBUSxNQUFNLEtBQUssT0FBTyxLQUFLLENBQUM7QUFDdEUsWUFBTSxnQkFBZ0IsV0FBVyxPQUFPLE9BQU8sSUFBSTtBQUNuRCxZQUFNLG9CQUFvQixPQUFPLEtBQUssV0FBVyxJQUFJLGdCQUFnQixtQkFBbUIsSUFBSSxhQUFhO0FBQ3pHLFlBQU0sT0FBTztBQUFBLFFBQ1osWUFBWSxPQUFPO0FBQUEsUUFDbkIsYUFBYSxPQUFPLGNBQWMsT0FBTztBQUFBLFFBQ3pDLGFBQWEsT0FBTyxjQUFjLE9BQU8sS0FBSztBQUFBLFFBQzlDLGVBQWUsRUFBRSxLQUFLLE9BQU8sTUFBTSxrQkFBa0IsR0FBRyxRQUFRLE9BQU8sTUFBTSxjQUFjLEVBQUU7QUFBQSxRQUM3RixnQkFBZ0IsRUFBRSxLQUFLLE9BQU8sTUFBTSxnQkFBZ0IsR0FBRyxRQUFRLE9BQU8sTUFBTSxZQUFZLEVBQUU7QUFBQSxRQUMxRixnQkFBZ0IsRUFBRSxLQUFLLE9BQU8sTUFBTSxrQkFBa0Isa0JBQWtCLFlBQVksR0FBRyxRQUFRLGtCQUFrQixZQUFZLGtCQUFrQixjQUFlLE9BQU8sTUFBTSxZQUFZLGtCQUFrQixZQUFhO0FBQUEsTUFDdk47QUFDQSxXQUFLLE1BQU0sSUFBSSxHQUFHLEtBQUssSUFBSTtBQUMzQixXQUFLLDJCQUEyQixLQUFLLElBQUk7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUFrQixTQUEwQixTQUEwRDtBQUM3RyxRQUFLLEtBQUssV0FBVyxLQUFLLFFBQVEsTUFBTSxXQUFTLE1BQU0sY0FBYyxRQUFRLFFBQVEsU0FBUyxjQUFjLEdBQUcsS0FBTSxRQUFRLFNBQVMsY0FBYyxRQUFRLEdBQUc7QUFDOUosYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFVBQU0sWUFBWSxRQUFRLEtBQUs7QUFDL0IsVUFBTSxZQUFZLFFBQVEsS0FBSztBQUUvQixVQUFNLFFBQTRCLENBQUM7QUFDbkMsUUFBSSxPQUFPO0FBRVgsT0FBRztBQUNGLFVBQUksVUFBVSxZQUFZLFlBQVk7QUFLckMsY0FBTSxjQUFjLFVBQVUsWUFBWTtBQUMxQyxjQUFNLHVCQUFpQyxDQUFDO0FBQ3hDLGNBQU0sa0JBQWtCLFlBQVksT0FBTyxDQUFDLEdBQUcsVUFBVTtBQUN4RCxjQUFJLEdBQUcsY0FBZSxVQUFVLFlBQVksU0FBUyxVQUFVLE9BQVE7QUFDdEUsaUNBQXFCLEtBQUssS0FBSztBQUMvQixtQkFBTztBQUFBLFVBQ1I7QUFDQSxpQkFBTztBQUFBLFFBQ1IsQ0FBQztBQUVELFlBQUssZ0JBQWdCLFdBQVcsS0FBTyxVQUFVLFlBQVksYUFBYSxVQUFVLFlBQVksVUFBVztBQUUxRyxpQkFBTyxVQUFVLFlBQVksVUFBVSxRQUFRLENBQUMsVUFBVSxZQUFZLFNBQVM7QUFDOUUsbUJBQU8sV0FBVyxXQUFXLFNBQVM7QUFBQSxVQUN2QztBQUVBLGdCQUFNLFVBQVUsVUFBVTtBQUMxQixnQkFBTSxzQkFBc0Isd0JBQXdCLFdBQVcsT0FBTyxLQUFLO0FBQzNFLGdCQUFNLEtBQUs7QUFBQSxZQUNWLFlBQVksb0JBQW9CO0FBQUEsWUFDaEMsVUFBVSxRQUFRO0FBQUEsWUFDbEIsZUFBZSxvQkFBb0I7QUFBQSxZQUNuQyxhQUFhLFFBQVE7QUFBQSxVQUN0QixDQUFDO0FBQ0QsaUJBQU8sMkJBQTJCLFdBQVcsU0FBUztBQUFBLFFBQ3ZELFdBQVcsZ0JBQWdCLFVBQVUsR0FBRztBQUN2QyxpQkFBTyxhQUFhLFdBQVcsV0FBVyxxQkFBcUIsQ0FBQyxDQUFDO0FBQUEsUUFDbEU7QUFBQSxNQUNELE9BQU87QUFDTixlQUFPLDJCQUEyQixXQUFXLFNBQVM7QUFBQSxNQUN2RDtBQUFBLElBQ0QsU0FBUztBQUVULGNBQVUsT0FBTztBQUNqQixjQUFVLE9BQU87QUFDakIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGlCQUFpQixTQUEwQixjQUFrQyxXQUE4QztBQUNsSSxRQUFJLGdCQUFnQjtBQUNwQixVQUFNLGdCQUErQixDQUFDO0FBR3RDLGFBQVMsWUFBWSxHQUFHLFlBQVksYUFBYSxRQUFRLGFBQWE7QUFDckUsWUFBTSxPQUFPLGFBQWEsU0FBUztBQUVuQyxVQUFJLGNBQWMsU0FBUyxHQUFHO0FBQzdCLFlBQUssS0FBSyxjQUFjLGNBQWMsY0FBYyxTQUFTLENBQUMsRUFBRSx1QkFBeUIsS0FBSyxZQUFZLGNBQWMsY0FBYyxTQUFTLENBQUMsRUFBRSxtQkFBb0I7QUFFcks7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxRQUFRLEtBQUs7QUFDNUIsWUFBTSx1QkFBdUIsTUFBTSxPQUFPLGFBQWEsS0FBSyxjQUFjLE9BQU8sV0FBVyxLQUFLO0FBRWpHLGFBQU8scUJBQXFCLEdBQUc7QUFFOUIsWUFBSSxRQUFRLE9BQU8sZUFBZTtBQUNsQyxZQUFJLGFBQWE7QUFDakIsZUFBTyxPQUFPO0FBQ2IsY0FBSSxxQkFBcUIsS0FBSyxPQUFPLFlBQVksU0FBUztBQUN6RCx5QkFBYTtBQUNiO0FBQUEsVUFDRCxPQUFPO0FBQ04sb0JBQVEsT0FBTyxnQkFBZ0I7QUFBQSxVQUNoQztBQUFBLFFBQ0Q7QUFDQSxZQUFJLENBQUMsWUFBWTtBQUNoQixpQkFBTyxXQUFXO0FBQ2xCO0FBQUEsUUFDRDtBQUNBLFlBQUksT0FBTyxZQUFZLGVBQWUsR0FBRztBQUN4QztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsWUFBTSxnQkFBZ0IsT0FBTyxZQUFZO0FBQ3pDLFlBQU0sY0FBYyxPQUFPLFlBQVk7QUFDdkMsWUFBTSxhQUFhLE9BQU8sWUFBWTtBQUN0QyxZQUFNLFdBQVcsT0FBTyxZQUFZO0FBRXBDLFlBQU0sWUFBWSxFQUFFLFVBQVUsSUFBSSxNQUFNLGNBQWMsTUFBTSxHQUFHLGNBQWMsU0FBUyxHQUFHLFlBQVksTUFBTSxHQUFHLFlBQVksU0FBUyxDQUFDLEdBQUcscUJBQXFCLFlBQVksbUJBQW1CLFNBQVM7QUFDcE0sVUFBSyxnQkFBZ0IsVUFBVSxVQUFXLGdCQUFnQixVQUFVLGFBQWEsR0FBRyxFQUFFLFlBQVksVUFBVSxlQUFlLFlBQVksQ0FBQyxHQUFHO0FBRTFJLFlBQUksVUFBVSxhQUFhLEVBQUUsYUFBYSxVQUFVLHFCQUFxQjtBQUN4RSxvQkFBVSxXQUFXLFVBQVUsU0FBUyxpQkFBaUIsVUFBVSxhQUFhLEVBQUUsY0FBYyxNQUFNLEdBQUcsVUFBVSxhQUFhLEVBQUUsY0FBYyxTQUFTLENBQUM7QUFDMUosb0JBQVUsc0JBQXNCLFVBQVUsYUFBYSxFQUFFO0FBQUEsUUFDMUQ7QUFDQSxZQUFJLFVBQVUsYUFBYSxFQUFFLFdBQVcsVUFBVSxtQkFBbUI7QUFDcEUsb0JBQVUsV0FBVyxVQUFVLFNBQVMsZUFBZSxVQUFVLGFBQWEsRUFBRSxZQUFZLE1BQU0sR0FBRyxVQUFVLGFBQWEsRUFBRSxZQUFZLFNBQVMsQ0FBQztBQUNwSixvQkFBVSxvQkFBb0IsVUFBVSxhQUFhLEVBQUU7QUFBQSxRQUN4RDtBQUNBO0FBQUEsTUFDRCxXQUFXLGdCQUFnQixVQUFVLFVBQVUsVUFBVSxhQUFhLEVBQUUsV0FBVyxVQUFVLHFCQUFxQjtBQUVqSCxzQkFBYyxLQUFLO0FBQUEsVUFDbEIsVUFBVSxJQUFJLE1BQU0sVUFBVSxhQUFhLEVBQUUsY0FBYyxNQUFNLEdBQUcsVUFBVSxhQUFhLEVBQUUsY0FBYyxTQUFTLEdBQUcsVUFBVSxhQUFhLEVBQUUsWUFBWSxNQUFNLEdBQUcsVUFBVSxhQUFhLEVBQUUsWUFBWSxTQUFTLENBQUM7QUFBQSxVQUNwTixxQkFBcUIsVUFBVSxhQUFhLEVBQUU7QUFBQSxVQUM5QyxtQkFBbUIsVUFBVSxhQUFhLEVBQUU7QUFBQSxRQUM3QyxDQUFDO0FBQUEsTUFDRjtBQUVBLFVBQUssY0FBYyxTQUFTLEtBQU8sY0FBYyxjQUFjLFNBQVMsQ0FBQyxFQUFFLHFCQUFxQixVQUFVLHFCQUFzQjtBQUUvSCxzQkFBYyxjQUFjLFNBQVMsQ0FBQyxFQUFFLFdBQVcsTUFBTSxjQUFjLGNBQWMsY0FBYyxTQUFTLENBQUMsRUFBRSxTQUFTLGlCQUFpQixHQUFHLFVBQVUsU0FBUyxlQUFlLENBQUM7QUFDL0ssc0JBQWMsY0FBYyxTQUFTLENBQUMsRUFBRSxvQkFBb0IsVUFBVTtBQUFBLE1BQ3ZFLE9BQU87QUFDTixzQkFBYyxLQUFLLFNBQVM7QUFBQSxNQUM3QjtBQUFBLElBQ0Q7QUFDQSxXQUFPLEtBQUssaUJBQWlCLGFBQWE7QUFBQSxFQUMzQztBQUFBLEVBRVEsaUJBQWlCLFNBQXVDO0FBQy9ELFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLHFCQUFvQyxDQUFDO0FBQzNDLFFBQUksZUFBZTtBQUNuQixRQUFJLGNBQWM7QUFDbEIsV0FBTyxlQUFlLFFBQVEsVUFBVSxjQUFjLEtBQUssUUFBUSxRQUFRO0FBQzFFLFlBQU0sU0FBUyxRQUFRLFlBQVk7QUFDbkMsWUFBTSxRQUFRLEtBQUssUUFBUSxXQUFXO0FBQ3RDLFVBQUksT0FBTyxvQkFBb0IsTUFBTSxZQUFZO0FBRWhEO0FBQUEsTUFDRCxXQUFXLE9BQU8sc0JBQXNCLE1BQU0sVUFBVTtBQUV2RDtBQUFBLE1BQ0QsT0FBTztBQUVOLGNBQU0sc0JBQXNCLEtBQUssSUFBSSxPQUFPLHFCQUFxQixNQUFNLFVBQVU7QUFDakYsY0FBTSxvQkFBb0IsS0FBSyxJQUFJLE9BQU8sbUJBQW1CLE1BQU0sUUFBUTtBQUMzRSxjQUFNLFdBQVcsT0FBTyxTQUFTLGdCQUFnQixJQUFJLE1BQU0sTUFBTSxjQUFjLE1BQU0sR0FBRyxNQUFNLGNBQWMsU0FBUyxHQUFHLE1BQU0sWUFBWSxNQUFNLEdBQUcsTUFBTSxZQUFZLFNBQVMsQ0FBQyxDQUFDO0FBQ2hMLDJCQUFtQixLQUFLO0FBQUEsVUFDdkI7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0QsQ0FBQztBQUVELFlBQUksb0JBQW9CLE9BQU8sbUJBQW1CO0FBQ2pELGlCQUFPLFdBQVcsTUFBTSxjQUFjLFNBQVMsZUFBZSxHQUFHLE9BQU8sU0FBUyxlQUFlLENBQUM7QUFDakcsaUJBQU8sc0JBQXNCLG9CQUFvQjtBQUFBLFFBQ2xELE9BQU87QUFFTjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixTQUF1RDtBQUN4RixVQUFNLE9BQU8sTUFBTSxLQUFLLE9BQU87QUFDL0IsUUFBSSxNQUFNO0FBQ1QsV0FBSyxrQkFBa0IsT0FBTztBQUM5QixXQUFLLG1CQUFtQixLQUFLLEtBQUs7QUFDbEMsV0FBSywyQkFBMkIsT0FBTztBQUN2QyxXQUFLLDRCQUE0QixLQUFLLEtBQUs7QUFFM0MsYUFBTztBQUFBLElBQ1IsV0FBVyxDQUFDLEtBQUssTUFBTSxJQUFJLEdBQUc7QUFHN0IsV0FBSyxRQUFRLE1BQU07QUFBQSxJQUNwQjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxTQUErQztBQUN0RCxRQUFJLFlBQWdDO0FBQ3BDLFFBQUksS0FBSyxNQUFNLElBQUksR0FBRztBQUNyQixrQkFBWTtBQUFBLElBQ2I7QUFDQSxXQUFPLEtBQUssZUFBZSxTQUFTO0FBQUEsRUFDckM7QUFBQSxFQUVBLE1BQWMsZUFBZSxXQUFxRTtBQUNqRyxRQUFJLE9BQWU7QUFDbkIsUUFBSSxTQUFpQjtBQUNyQixVQUFNLG9CQUFvQixLQUFLLFVBQVUsYUFBYTtBQUN0RCxRQUFJO0FBRUosVUFBTSxtQkFBbUIsMkJBQTJCO0FBRXBELE9BQUc7QUFDRixZQUFNLFFBQVEsWUFBWSxJQUFJO0FBRTlCLGdCQUFVLEtBQUssUUFBUSxNQUFNLENBQUMsT0FBZSxhQUFnQyxLQUFLLGVBQWUsS0FBSyxHQUFHLEtBQUssTUFBTSxJQUFJLEdBQUcsRUFBRSxrQkFBa0IsZ0JBQWdCLEtBQUssUUFBUSxDQUFDO0FBRTdLLGNBQVEsWUFBWSxJQUFJLElBQUk7QUFDNUI7QUFHQSxZQUFNLElBQUksUUFBYyxhQUFXLFlBQVksT0FBTyxDQUFDO0FBQUEsSUFFeEQsU0FBUyxDQUFDLEtBQUssT0FBTyxjQUFjLENBQUMsV0FBVyxzQkFBc0IsS0FBSyxVQUFVLGFBQWE7QUFDbEcsU0FBSyx3QkFBd0IsV0FBVyxNQUFNLE1BQU07QUFDcEQsV0FBUSxXQUFZLHNCQUFzQixLQUFLLFVBQVUsYUFBYSxJQUFNLFVBQVU7QUFBQSxFQUN2RjtBQUFBLEVBRVEsZUFBZSxPQUFtQztBQUN6RCxRQUFJO0FBQ0gsYUFBTyxLQUFLLFVBQVUsY0FBYyxFQUFFLGdCQUFnQixLQUFLO0FBQUEsSUFDNUQsU0FBUyxHQUFHO0FBQ1gsV0FBSyxZQUFZLE1BQU0sK0NBQStDLENBQUM7QUFBQSxJQUN4RTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxXQUFXLFdBQW1EO0FBQ3JFLFVBQU0sZ0JBQW9DLENBQUM7QUFFM0MsUUFBSSxLQUFLLFNBQVM7QUFDakIsaUJBQVcsWUFBWSxXQUFXO0FBQ2pDLFlBQUksa0JBQWtCO0FBRXRCLGlCQUFTLElBQUksR0FBRyxJQUFJLEtBQUssUUFBUSxRQUFRLEtBQUs7QUFDN0MsZ0JBQU0sZ0JBQWdCLEtBQUssUUFBUSxDQUFDO0FBRXBDLGNBQUksWUFBWSxlQUFlLFFBQVEsS0FBSyxnQkFBZ0IsZUFBZSxRQUFRLEdBQUc7QUFDckYsOEJBQWtCO0FBQ2xCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxZQUFJLENBQUMsaUJBQWlCO0FBQ3JCLHdCQUFjLEtBQUssUUFBUTtBQUFBLFFBQzVCO0FBQUEsTUFDRDtBQUFBLElBQ0QsT0FBTztBQUVOLG9CQUFjLEtBQUssR0FBRyxTQUFTO0FBQUEsSUFDaEM7QUFFQSxTQUFLLFVBQVU7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsd0JBQXdCLFdBQStCLE1BQWMsUUFBc0I7QUFDbEcsU0FBSyxZQUFZLE1BQU0saUJBQWlCLFNBQVMsVUFBVSxJQUFJLFdBQVcsTUFBTSxVQUFVO0FBUTFGLFFBQUksY0FBYyx3QkFBeUI7QUFDMUMsV0FBSyxrQkFBa0IsV0FBMEYsd0JBQXdCLEVBQUUsWUFBWSxLQUFLLFlBQVksTUFBTSxPQUFPLENBQUM7QUFBQSxJQUN2TCxPQUFPO0FBQ04sV0FBSyxrQkFBa0IsV0FBMEYsK0JBQStCLEVBQUUsWUFBWSxLQUFLLFlBQVksTUFBTSxPQUFPLENBQUM7QUFBQSxJQUM5TDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLHFCQUFxQixLQUEwQztBQUNyRSxVQUFNLFNBQVMsSUFBSSxLQUFLLGFBQWE7QUFDckMsV0FBTyxZQUFZLEtBQUssUUFBUSxRQUFRO0FBQ3hDLFVBQU0sT0FBTyxPQUFPLE1BQU0sR0FBRztBQUM3QixXQUFPLE9BQU87QUFDZCxXQUFPLFFBQVE7QUFBQSxFQUNoQjtBQUNEO0FBMVlhLGlCQUFOO0FBQUEsRUFzQko7QUFBQSxFQUNBO0FBQUEsR0F2QlU7QUE0WWIsSUFBVyxxQkFBWCxrQkFBV0Msd0JBQVg7QUFDQyxFQUFBQSxvQkFBQSxVQUFPO0FBQ1AsRUFBQUEsb0JBQUEsaUJBQWM7QUFGSixTQUFBQTtBQUFBLEdBQUE7QUFzQlgsU0FBUyw2QkFBcUU7QUFDN0UsTUFBSSxnQkFBd0IsWUFBWSxJQUFJO0FBQzVDLFNBQU8sU0FBUyxzQkFBc0IsUUFBK0I7QUFDcEUsVUFBTSxNQUFNLFlBQVksSUFBSTtBQUM1QixRQUFJLE1BQU0sZ0JBQWdCLElBQUk7QUFDN0Isc0JBQWdCO0FBQ2hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUNPLFNBQVMsWUFBWSxHQUFxQixHQUFxQjtBQUNyRSxTQUFRLEVBQUUsY0FBYyxRQUFRLEVBQUUsY0FBYyxPQUMzQyxFQUFFLGNBQWMsV0FBVyxFQUFFLGNBQWMsVUFDM0MsRUFBRSxZQUFZLFFBQVEsRUFBRSxZQUFZLE9BQ3BDLEVBQUUsWUFBWSxXQUFXLEVBQUUsWUFBWSxVQUN2QyxFQUFFLGVBQWUsRUFBRSxjQUNuQixFQUFFLGFBQWEsRUFBRTtBQUN2QjtBQUVPLFNBQVMsZ0JBQWdCLEdBQXFCLEdBQXFCO0FBQ3pFLFNBQVEsRUFBRSxjQUFjLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRSxjQUN0RCxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsWUFBWSxFQUFFO0FBQ25EOyIsCiAgIm5hbWVzIjogWyJyYW5nZXMiLCAiVGVsZW1ldHJ5UGFyc2VUeXBlIl0KfQo=
