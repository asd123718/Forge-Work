import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { FoldingRegions, MAX_LINE_NUMBER } from "./foldingRanges.js";
const foldingContext = {};
const ID_SYNTAX_PROVIDER = "syntax";
class SyntaxRangeProvider {
  constructor(editorModel, providers, handleFoldingRangesChange, foldingRangesLimit, fallbackRangeProvider) {
    this.editorModel = editorModel;
    this.providers = providers;
    this.handleFoldingRangesChange = handleFoldingRangesChange;
    this.foldingRangesLimit = foldingRangesLimit;
    this.fallbackRangeProvider = fallbackRangeProvider;
    this.id = ID_SYNTAX_PROVIDER;
    this.disposables = new DisposableStore();
    if (fallbackRangeProvider) {
      this.disposables.add(fallbackRangeProvider);
    }
    for (const provider of providers) {
      if (typeof provider.onDidChange === "function") {
        this.disposables.add(provider.onDidChange(handleFoldingRangesChange));
      }
    }
  }
  compute(cancellationToken) {
    return collectSyntaxRanges(this.providers, this.editorModel, cancellationToken).then((ranges) => {
      if (this.editorModel.isDisposed()) {
        return null;
      }
      if (ranges) {
        const res = sanitizeRanges(ranges, this.foldingRangesLimit);
        return res;
      }
      return this.fallbackRangeProvider?.compute(cancellationToken) ?? null;
    });
  }
  dispose() {
    this.disposables.dispose();
  }
}
function collectSyntaxRanges(providers, model, cancellationToken) {
  let rangeData = null;
  const promises = providers.map((provider, i) => {
    return Promise.resolve(provider.provideFoldingRanges(model, foldingContext, cancellationToken)).then((ranges) => {
      if (cancellationToken.isCancellationRequested) {
        return;
      }
      if (Array.isArray(ranges)) {
        if (!Array.isArray(rangeData)) {
          rangeData = [];
        }
        const nLines = model.getLineCount();
        for (const r of ranges) {
          if (r.start > 0 && r.end > r.start && r.end <= nLines) {
            rangeData.push({ start: r.start, end: r.end, rank: i, kind: r.kind });
          }
        }
      }
    }, onUnexpectedExternalError);
  });
  return Promise.all(promises).then((_) => {
    return rangeData;
  });
}
class RangesCollector {
  constructor(foldingRangesLimit) {
    this._startIndexes = [];
    this._endIndexes = [];
    this._nestingLevels = [];
    this._nestingLevelCounts = [];
    this._types = [];
    this._length = 0;
    this._foldingRangesLimit = foldingRangesLimit;
  }
  add(startLineNumber, endLineNumber, type, nestingLevel) {
    if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
      return;
    }
    const index = this._length;
    this._startIndexes[index] = startLineNumber;
    this._endIndexes[index] = endLineNumber;
    this._nestingLevels[index] = nestingLevel;
    this._types[index] = type;
    this._length++;
    if (nestingLevel < 30) {
      this._nestingLevelCounts[nestingLevel] = (this._nestingLevelCounts[nestingLevel] || 0) + 1;
    }
  }
  toIndentRanges() {
    const limit = this._foldingRangesLimit.limit;
    if (this._length <= limit) {
      this._foldingRangesLimit.update(this._length, false);
      const startIndexes = new Uint32Array(this._length);
      const endIndexes = new Uint32Array(this._length);
      for (let i = 0; i < this._length; i++) {
        startIndexes[i] = this._startIndexes[i];
        endIndexes[i] = this._endIndexes[i];
      }
      return new FoldingRegions(startIndexes, endIndexes, this._types);
    } else {
      this._foldingRangesLimit.update(this._length, limit);
      let entries = 0;
      let maxLevel = this._nestingLevelCounts.length;
      for (let i = 0; i < this._nestingLevelCounts.length; i++) {
        const n = this._nestingLevelCounts[i];
        if (n) {
          if (n + entries > limit) {
            maxLevel = i;
            break;
          }
          entries += n;
        }
      }
      const startIndexes = new Uint32Array(limit);
      const endIndexes = new Uint32Array(limit);
      const types = [];
      for (let i = 0, k = 0; i < this._length; i++) {
        const level = this._nestingLevels[i];
        if (level < maxLevel || level === maxLevel && entries++ < limit) {
          startIndexes[k] = this._startIndexes[i];
          endIndexes[k] = this._endIndexes[i];
          types[k] = this._types[i];
          k++;
        }
      }
      return new FoldingRegions(startIndexes, endIndexes, types);
    }
  }
}
function sanitizeRanges(rangeData, foldingRangesLimit) {
  const sorted = rangeData.sort((d1, d2) => {
    let diff = d1.start - d2.start;
    if (diff === 0) {
      diff = d1.rank - d2.rank;
    }
    return diff;
  });
  const collector = new RangesCollector(foldingRangesLimit);
  let top = void 0;
  const previous = [];
  for (const entry of sorted) {
    if (!top) {
      top = entry;
      collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
    } else {
      if (entry.start > top.start) {
        if (entry.end <= top.end) {
          previous.push(top);
          top = entry;
          collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
        } else {
          if (entry.start > top.end) {
            do {
              top = previous.pop();
            } while (top && entry.start > top.end);
            if (top) {
              previous.push(top);
            }
            top = entry;
          }
          collector.add(entry.start, entry.end, entry.kind && entry.kind.value, previous.length);
        }
      }
    }
  }
  return collector.toIndentRanges();
}
export {
  SyntaxRangeProvider,
  sanitizeRanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZvbGRpbmdcXGJyb3dzZXJcXHN5bnRheFJhbmdlUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IEZvbGRpbmdDb250ZXh0LCBGb2xkaW5nUmFuZ2UsIEZvbGRpbmdSYW5nZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nTGltaXRSZXBvcnRlciwgUmFuZ2VQcm92aWRlciB9IGZyb20gJy4vZm9sZGluZy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nUmVnaW9ucywgTUFYX0xJTkVfTlVNQkVSIH0gZnJvbSAnLi9mb2xkaW5nUmFuZ2VzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRm9sZGluZ1JhbmdlRGF0YSBleHRlbmRzIEZvbGRpbmdSYW5nZSB7XG5cdHJhbms6IG51bWJlcjtcbn1cblxuY29uc3QgZm9sZGluZ0NvbnRleHQ6IEZvbGRpbmdDb250ZXh0ID0ge1xufTtcblxuY29uc3QgSURfU1lOVEFYX1BST1ZJREVSID0gJ3N5bnRheCc7XG5cbmV4cG9ydCBjbGFzcyBTeW50YXhSYW5nZVByb3ZpZGVyIGltcGxlbWVudHMgUmFuZ2VQcm92aWRlciB7XG5cblx0cmVhZG9ubHkgaWQgPSBJRF9TWU5UQVhfUFJPVklERVI7XG5cblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvck1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXJzOiBGb2xkaW5nUmFuZ2VQcm92aWRlcltdLFxuXHRcdHJlYWRvbmx5IGhhbmRsZUZvbGRpbmdSYW5nZXNDaGFuZ2U6ICgpID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmb2xkaW5nUmFuZ2VzTGltaXQ6IEZvbGRpbmdMaW1pdFJlcG9ydGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmFsbGJhY2tSYW5nZVByb3ZpZGVyOiBSYW5nZVByb3ZpZGVyIHwgdW5kZWZpbmVkIC8vIHVzZWQgd2hlbiBhbGwgcHJvdmlkZXJzIHJldHVybiBudWxsXG5cdCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aWYgKGZhbGxiYWNrUmFuZ2VQcm92aWRlcikge1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZmFsbGJhY2tSYW5nZVByb3ZpZGVyKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHByb3ZpZGVycykge1xuXHRcdFx0aWYgKHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZShoYW5kbGVGb2xkaW5nUmFuZ2VzQ2hhbmdlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y29tcHV0ZShjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEZvbGRpbmdSZWdpb25zIHwgbnVsbD4ge1xuXHRcdHJldHVybiBjb2xsZWN0U3ludGF4UmFuZ2VzKHRoaXMucHJvdmlkZXJzLCB0aGlzLmVkaXRvck1vZGVsLCBjYW5jZWxsYXRpb25Ub2tlbikudGhlbihyYW5nZXMgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZWRpdG9yTW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJhbmdlcykge1xuXHRcdFx0XHRjb25zdCByZXMgPSBzYW5pdGl6ZVJhbmdlcyhyYW5nZXMsIHRoaXMuZm9sZGluZ1Jhbmdlc0xpbWl0KTtcblx0XHRcdFx0cmV0dXJuIHJlcztcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmZhbGxiYWNrUmFuZ2VQcm92aWRlcj8uY29tcHV0ZShjYW5jZWxsYXRpb25Ub2tlbikgPz8gbnVsbDtcblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29sbGVjdFN5bnRheFJhbmdlcyhwcm92aWRlcnM6IEZvbGRpbmdSYW5nZVByb3ZpZGVyW10sIG1vZGVsOiBJVGV4dE1vZGVsLCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGb2xkaW5nUmFuZ2VEYXRhW10gfCBudWxsPiB7XG5cdGxldCByYW5nZURhdGE6IElGb2xkaW5nUmFuZ2VEYXRhW10gfCBudWxsID0gbnVsbDtcblx0Y29uc3QgcHJvbWlzZXMgPSBwcm92aWRlcnMubWFwKChwcm92aWRlciwgaSkgPT4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZUZvbGRpbmdSYW5nZXMobW9kZWwsIGZvbGRpbmdDb250ZXh0LCBjYW5jZWxsYXRpb25Ub2tlbikpLnRoZW4ocmFuZ2VzID0+IHtcblx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShyYW5nZXMpKSB7XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShyYW5nZURhdGEpKSB7XG5cdFx0XHRcdFx0cmFuZ2VEYXRhID0gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbkxpbmVzID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRcdGZvciAoY29uc3QgciBvZiByYW5nZXMpIHtcblx0XHRcdFx0XHRpZiAoci5zdGFydCA+IDAgJiYgci5lbmQgPiByLnN0YXJ0ICYmIHIuZW5kIDw9IG5MaW5lcykge1xuXHRcdFx0XHRcdFx0cmFuZ2VEYXRhLnB1c2goeyBzdGFydDogci5zdGFydCwgZW5kOiByLmVuZCwgcmFuazogaSwga2luZDogci5raW5kIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IpO1xuXHR9KTtcblx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKF8gPT4ge1xuXHRcdHJldHVybiByYW5nZURhdGE7XG5cdH0pO1xufVxuXG5jbGFzcyBSYW5nZXNDb2xsZWN0b3Ige1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydEluZGV4ZXM6IG51bWJlcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbmRJbmRleGVzOiBudW1iZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfbmVzdGluZ0xldmVsczogbnVtYmVyW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX25lc3RpbmdMZXZlbENvdW50czogbnVtYmVyW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R5cGVzOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIF9sZW5ndGg6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9sZGluZ1Jhbmdlc0xpbWl0OiBGb2xkaW5nTGltaXRSZXBvcnRlcjtcblxuXHRjb25zdHJ1Y3Rvcihmb2xkaW5nUmFuZ2VzTGltaXQ6IEZvbGRpbmdMaW1pdFJlcG9ydGVyKSB7XG5cdFx0dGhpcy5fc3RhcnRJbmRleGVzID0gW107XG5cdFx0dGhpcy5fZW5kSW5kZXhlcyA9IFtdO1xuXHRcdHRoaXMuX25lc3RpbmdMZXZlbHMgPSBbXTtcblx0XHR0aGlzLl9uZXN0aW5nTGV2ZWxDb3VudHMgPSBbXTtcblx0XHR0aGlzLl90eXBlcyA9IFtdO1xuXHRcdHRoaXMuX2xlbmd0aCA9IDA7XG5cdFx0dGhpcy5fZm9sZGluZ1Jhbmdlc0xpbWl0ID0gZm9sZGluZ1Jhbmdlc0xpbWl0O1xuXHR9XG5cblx0cHVibGljIGFkZChzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCB0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQsIG5lc3RpbmdMZXZlbDogbnVtYmVyKSB7XG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciA+IE1BWF9MSU5FX05VTUJFUiB8fCBlbmRMaW5lTnVtYmVyID4gTUFYX0xJTkVfTlVNQkVSKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fbGVuZ3RoO1xuXHRcdHRoaXMuX3N0YXJ0SW5kZXhlc1tpbmRleF0gPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5fZW5kSW5kZXhlc1tpbmRleF0gPSBlbmRMaW5lTnVtYmVyO1xuXHRcdHRoaXMuX25lc3RpbmdMZXZlbHNbaW5kZXhdID0gbmVzdGluZ0xldmVsO1xuXHRcdHRoaXMuX3R5cGVzW2luZGV4XSA9IHR5cGU7XG5cdFx0dGhpcy5fbGVuZ3RoKys7XG5cdFx0aWYgKG5lc3RpbmdMZXZlbCA8IDMwKSB7XG5cdFx0XHR0aGlzLl9uZXN0aW5nTGV2ZWxDb3VudHNbbmVzdGluZ0xldmVsXSA9ICh0aGlzLl9uZXN0aW5nTGV2ZWxDb3VudHNbbmVzdGluZ0xldmVsXSB8fCAwKSArIDE7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRvSW5kZW50UmFuZ2VzKCkge1xuXHRcdGNvbnN0IGxpbWl0ID0gdGhpcy5fZm9sZGluZ1Jhbmdlc0xpbWl0LmxpbWl0O1xuXHRcdGlmICh0aGlzLl9sZW5ndGggPD0gbGltaXQpIHtcblx0XHRcdHRoaXMuX2ZvbGRpbmdSYW5nZXNMaW1pdC51cGRhdGUodGhpcy5fbGVuZ3RoLCBmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHN0YXJ0SW5kZXhlcyA9IG5ldyBVaW50MzJBcnJheSh0aGlzLl9sZW5ndGgpO1xuXHRcdFx0Y29uc3QgZW5kSW5kZXhlcyA9IG5ldyBVaW50MzJBcnJheSh0aGlzLl9sZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRzdGFydEluZGV4ZXNbaV0gPSB0aGlzLl9zdGFydEluZGV4ZXNbaV07XG5cdFx0XHRcdGVuZEluZGV4ZXNbaV0gPSB0aGlzLl9lbmRJbmRleGVzW2ldO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBGb2xkaW5nUmVnaW9ucyhzdGFydEluZGV4ZXMsIGVuZEluZGV4ZXMsIHRoaXMuX3R5cGVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZm9sZGluZ1Jhbmdlc0xpbWl0LnVwZGF0ZSh0aGlzLl9sZW5ndGgsIGxpbWl0KTtcblxuXHRcdFx0bGV0IGVudHJpZXMgPSAwO1xuXHRcdFx0bGV0IG1heExldmVsID0gdGhpcy5fbmVzdGluZ0xldmVsQ291bnRzLmxlbmd0aDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbmVzdGluZ0xldmVsQ291bnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IG4gPSB0aGlzLl9uZXN0aW5nTGV2ZWxDb3VudHNbaV07XG5cdFx0XHRcdGlmIChuKSB7XG5cdFx0XHRcdFx0aWYgKG4gKyBlbnRyaWVzID4gbGltaXQpIHtcblx0XHRcdFx0XHRcdG1heExldmVsID0gaTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbnRyaWVzICs9IG47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhcnRJbmRleGVzID0gbmV3IFVpbnQzMkFycmF5KGxpbWl0KTtcblx0XHRcdGNvbnN0IGVuZEluZGV4ZXMgPSBuZXcgVWludDMyQXJyYXkobGltaXQpO1xuXHRcdFx0Y29uc3QgdHlwZXM6IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBrID0gMDsgaSA8IHRoaXMuX2xlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxldmVsID0gdGhpcy5fbmVzdGluZ0xldmVsc1tpXTtcblx0XHRcdFx0aWYgKGxldmVsIDwgbWF4TGV2ZWwgfHwgKGxldmVsID09PSBtYXhMZXZlbCAmJiBlbnRyaWVzKysgPCBsaW1pdCkpIHtcblx0XHRcdFx0XHRzdGFydEluZGV4ZXNba10gPSB0aGlzLl9zdGFydEluZGV4ZXNbaV07XG5cdFx0XHRcdFx0ZW5kSW5kZXhlc1trXSA9IHRoaXMuX2VuZEluZGV4ZXNbaV07XG5cdFx0XHRcdFx0dHlwZXNba10gPSB0aGlzLl90eXBlc1tpXTtcblx0XHRcdFx0XHRrKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgRm9sZGluZ1JlZ2lvbnMoc3RhcnRJbmRleGVzLCBlbmRJbmRleGVzLCB0eXBlcyk7XG5cdFx0fVxuXG5cdH1cblxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVSYW5nZXMocmFuZ2VEYXRhOiBJRm9sZGluZ1JhbmdlRGF0YVtdLCBmb2xkaW5nUmFuZ2VzTGltaXQ6IEZvbGRpbmdMaW1pdFJlcG9ydGVyKTogRm9sZGluZ1JlZ2lvbnMge1xuXHRjb25zdCBzb3J0ZWQgPSByYW5nZURhdGEuc29ydCgoZDEsIGQyKSA9PiB7XG5cdFx0bGV0IGRpZmYgPSBkMS5zdGFydCAtIGQyLnN0YXJ0O1xuXHRcdGlmIChkaWZmID09PSAwKSB7XG5cdFx0XHRkaWZmID0gZDEucmFuayAtIGQyLnJhbms7XG5cdFx0fVxuXHRcdHJldHVybiBkaWZmO1xuXHR9KTtcblx0Y29uc3QgY29sbGVjdG9yID0gbmV3IFJhbmdlc0NvbGxlY3Rvcihmb2xkaW5nUmFuZ2VzTGltaXQpO1xuXG5cdGxldCB0b3A6IElGb2xkaW5nUmFuZ2VEYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRjb25zdCBwcmV2aW91czogSUZvbGRpbmdSYW5nZURhdGFbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIHNvcnRlZCkge1xuXHRcdGlmICghdG9wKSB7XG5cdFx0XHR0b3AgPSBlbnRyeTtcblx0XHRcdGNvbGxlY3Rvci5hZGQoZW50cnkuc3RhcnQsIGVudHJ5LmVuZCwgZW50cnkua2luZCAmJiBlbnRyeS5raW5kLnZhbHVlLCBwcmV2aW91cy5sZW5ndGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoZW50cnkuc3RhcnQgPiB0b3Auc3RhcnQpIHtcblx0XHRcdFx0aWYgKGVudHJ5LmVuZCA8PSB0b3AuZW5kKSB7XG5cdFx0XHRcdFx0cHJldmlvdXMucHVzaCh0b3ApO1xuXHRcdFx0XHRcdHRvcCA9IGVudHJ5O1xuXHRcdFx0XHRcdGNvbGxlY3Rvci5hZGQoZW50cnkuc3RhcnQsIGVudHJ5LmVuZCwgZW50cnkua2luZCAmJiBlbnRyeS5raW5kLnZhbHVlLCBwcmV2aW91cy5sZW5ndGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChlbnRyeS5zdGFydCA+IHRvcC5lbmQpIHtcblx0XHRcdFx0XHRcdGRvIHtcblx0XHRcdFx0XHRcdFx0dG9wID0gcHJldmlvdXMucG9wKCk7XG5cdFx0XHRcdFx0XHR9IHdoaWxlICh0b3AgJiYgZW50cnkuc3RhcnQgPiB0b3AuZW5kKTtcblx0XHRcdFx0XHRcdGlmICh0b3ApIHtcblx0XHRcdFx0XHRcdFx0cHJldmlvdXMucHVzaCh0b3ApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dG9wID0gZW50cnk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbGxlY3Rvci5hZGQoZW50cnkuc3RhcnQsIGVudHJ5LmVuZCwgZW50cnkua2luZCAmJiBlbnRyeS5raW5kLnZhbHVlLCBwcmV2aW91cy5sZW5ndGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb2xsZWN0b3IudG9JbmRlbnRSYW5nZXMoKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCO0FBSWhDLFNBQVMsZ0JBQWdCLHVCQUF1QjtBQU1oRCxNQUFNLGlCQUFpQyxDQUN2QztBQUVBLE1BQU0scUJBQXFCO0FBRXBCLE1BQU0sb0JBQTZDO0FBQUEsRUFNekQsWUFDa0IsYUFDQSxXQUNSLDJCQUNRLG9CQUNBLHVCQUNoQjtBQUxnQjtBQUNBO0FBQ1I7QUFDUTtBQUNBO0FBVGxCLFNBQVMsS0FBSztBQVdiLFNBQUssY0FBYyxJQUFJLGdCQUFnQjtBQUN2QyxRQUFJLHVCQUF1QjtBQUMxQixXQUFLLFlBQVksSUFBSSxxQkFBcUI7QUFBQSxJQUMzQztBQUVBLGVBQVcsWUFBWSxXQUFXO0FBQ2pDLFVBQUksT0FBTyxTQUFTLGdCQUFnQixZQUFZO0FBQy9DLGFBQUssWUFBWSxJQUFJLFNBQVMsWUFBWSx5QkFBeUIsQ0FBQztBQUFBLE1BQ3JFO0FBQUEsSUFDRDtBQUFB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
