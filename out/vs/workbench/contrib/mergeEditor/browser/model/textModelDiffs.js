import { compareBy, numberComparator } from "../../../../../base/common/arrays.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { DetailedLineRangeMapping } from "./mapping.js";
import { LineRangeEdit } from "./editing.js";
import { MergeEditorLineRange } from "./lineRange.js";
import { ReentrancyBarrier } from "../../../../../base/common/controlFlow.js";
import { autorun, observableSignal, observableValue, transaction } from "../../../../../base/common/observable.js";
class TextModelDiffs extends Disposable {
  constructor(baseTextModel, textModel, diffComputer) {
    super();
    this.baseTextModel = baseTextModel;
    this.textModel = textModel;
    this.diffComputer = diffComputer;
    this._recomputeCount = 0;
    this._state = observableValue(this, 1 /* initializing */);
    this._diffs = observableValue(this, []);
    this._barrier = new ReentrancyBarrier();
    this._isDisposed = false;
    this._isInitializing = true;
    const recomputeSignal = observableSignal("recompute");
    this._register(autorun((reader) => {
      recomputeSignal.read(reader);
      this._recompute(reader);
    }));
    this._register(
      baseTextModel.onDidChangeContent(
        this._barrier.makeExclusiveOrSkip(() => {
          recomputeSignal.trigger(void 0);
        })
      )
    );
    this._register(
      textModel.onDidChangeContent(
        this._barrier.makeExclusiveOrSkip(() => {
          recomputeSignal.trigger(void 0);
        })
      )
    );
    this._register(toDisposable(() => {
      this._isDisposed = true;
    }));
  }
  get isApplyingChange() {
    return this._barrier.isOccupied;
  }
  get state() {
    return this._state;
  }
  /**
   * Diffs from base to input.
  */
  get diffs() {
    return this._diffs;
  }
  _recompute(reader) {
    this._recomputeCount++;
    const currentRecomputeIdx = this._recomputeCount;
    if (this._state.get() === 1 /* initializing */) {
      this._isInitializing = true;
    }
    transaction((tx) => {
      this._state.set(
        this._isInitializing ? 1 /* initializing */ : 3 /* updating */,
        tx,
        0 /* other */
      );
    });
    const result = this.diffComputer.computeDiff(this.baseTextModel, this.textModel, reader);
    result.then((result2) => {
      if (this._isDisposed) {
        return;
      }
      if (currentRecomputeIdx !== this._recomputeCount) {
        return;
      }
      transaction((tx) => {
        if (result2.diffs) {
          this._state.set(2 /* upToDate */, tx, 1 /* textChange */);
          this._diffs.set(result2.diffs, tx, 1 /* textChange */);
        } else {
          this._state.set(4 /* error */, tx, 1 /* textChange */);
        }
        this._isInitializing = false;
      });
    });
  }
  ensureUpToDate() {
    if (this.state.get() !== 2 /* upToDate */) {
      throw new BugIndicatingError("Cannot remove diffs when the model is not up to date");
    }
  }
  removeDiffs(diffToRemoves, transaction2, group) {
    this.ensureUpToDate();
    diffToRemoves.sort(compareBy((d) => d.inputRange.startLineNumber, numberComparator));
    diffToRemoves.reverse();
    const diffs = this._diffs.get();
    const toRemoveSet = new Set(diffToRemoves);
    if (toRemoveSet.size !== diffToRemoves.length) {
      throw new BugIndicatingError();
    }
    const diffsSet = new Set(diffs);
    for (const d of diffToRemoves) {
      if (!diffsSet.has(d)) {
        throw new BugIndicatingError();
      }
    }
    for (const diffToRemove of diffToRemoves) {
      this._barrier.runExclusivelyOrThrow(() => {
        const edits = diffToRemove.getReverseLineEdit().toEdits(this.textModel.getLineCount());
        this.textModel.pushEditOperations(null, edits, () => null, group);
      });
    }
    let cumulativeDelta = 0;
    const newDiffs = [];
    for (const d of diffs) {
      if (toRemoveSet.has(d)) {
        cumulativeDelta += d.inputRange.length - d.outputRange.length;
      } else {
        newDiffs.push(cumulativeDelta !== 0 ? d.addOutputLineDelta(cumulativeDelta) : d);
      }
    }
    this._diffs.set(newDiffs, transaction2, 0 /* other */);
  }
  /**
   * Edit must be conflict free.
   */
  applyEditRelativeToOriginal(edit, transaction2, group) {
    this.ensureUpToDate();
    const editMapping = new DetailedLineRangeMapping(
      edit.range,
      this.baseTextModel,
      MergeEditorLineRange.fromLength(edit.range.startLineNumber, edit.newLines.length),
      this.textModel
    );
    let firstAfter = false;
    let delta = 0;
    const newDiffs = new Array();
    for (const diff of this.diffs.get()) {
      if (diff.inputRange.intersectsOrTouches(edit.range)) {
        throw new BugIndicatingError("Edit must be conflict free.");
      } else if (diff.inputRange.isAfter(edit.range)) {
        if (!firstAfter) {
          firstAfter = true;
          newDiffs.push(editMapping.addOutputLineDelta(delta));
        }
        newDiffs.push(diff.addOutputLineDelta(edit.newLines.length - edit.range.length));
      } else {
        newDiffs.push(diff);
      }
      if (!firstAfter) {
        delta += diff.outputRange.length - diff.inputRange.length;
      }
    }
    if (!firstAfter) {
      firstAfter = true;
      newDiffs.push(editMapping.addOutputLineDelta(delta));
    }
    this._barrier.runExclusivelyOrThrow(() => {
      const edits = new LineRangeEdit(edit.range.delta(delta), edit.newLines).toEdits(this.textModel.getLineCount());
      this.textModel.pushEditOperations(null, edits, () => null, group);
    });
    this._diffs.set(newDiffs, transaction2, 0 /* other */);
  }
  findTouchingDiffs(baseRange) {
    return this.diffs.get().filter((d) => d.inputRange.intersectsOrTouches(baseRange));
  }
  getResultLine(lineNumber, reader) {
    let offset = 0;
    const diffs = reader ? this.diffs.read(reader) : this.diffs.get();
    for (const diff of diffs) {
      if (diff.inputRange.contains(lineNumber) || diff.inputRange.endLineNumberExclusive === lineNumber) {
        return diff;
      } else if (diff.inputRange.endLineNumberExclusive < lineNumber) {
        offset = diff.resultingDeltaFromOriginalToModified;
      } else {
        break;
      }
    }
    return lineNumber + offset;
  }
  getResultLineRange(baseRange, reader) {
    let start = this.getResultLine(baseRange.startLineNumber, reader);
    if (typeof start !== "number") {
      start = start.outputRange.startLineNumber;
    }
    let endExclusive = this.getResultLine(baseRange.endLineNumberExclusive, reader);
    if (typeof endExclusive !== "number") {
      endExclusive = endExclusive.outputRange.endLineNumberExclusive;
    }
    return MergeEditorLineRange.fromLineNumbers(start, endExclusive);
  }
}
var TextModelDiffChangeReason = /* @__PURE__ */ ((TextModelDiffChangeReason2) => {
  TextModelDiffChangeReason2[TextModelDiffChangeReason2["other"] = 0] = "other";
  TextModelDiffChangeReason2[TextModelDiffChangeReason2["textChange"] = 1] = "textChange";
  return TextModelDiffChangeReason2;
})(TextModelDiffChangeReason || {});
var TextModelDiffState = /* @__PURE__ */ ((TextModelDiffState2) => {
  TextModelDiffState2[TextModelDiffState2["initializing"] = 1] = "initializing";
  TextModelDiffState2[TextModelDiffState2["upToDate"] = 2] = "upToDate";
  TextModelDiffState2[TextModelDiffState2["updating"] = 3] = "updating";
  TextModelDiffState2[TextModelDiffState2["error"] = 4] = "error";
  return TextModelDiffState2;
})(TextModelDiffState || {});
export {
  TextModelDiffChangeReason,
  TextModelDiffState,
  TextModelDiffs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFxtb2RlbFxcdGV4dE1vZGVsRGlmZnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb21wYXJlQnksIG51bWJlckNvbXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuL21hcHBpbmcuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlRWRpdCB9IGZyb20gJy4vZWRpdGluZy5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvckxpbmVSYW5nZSB9IGZyb20gJy4vbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IFJlZW50cmFuY3lCYXJyaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29udHJvbEZsb3cuanMnO1xuaW1wb3J0IHsgSU1lcmdlRGlmZkNvbXB1dGVyIH0gZnJvbSAnLi9kaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGVXaXRoQ2hhbmdlLCBJUmVhZGVyLCBJVHJhbnNhY3Rpb24sIG9ic2VydmFibGVTaWduYWwsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVuZG9SZWRvR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuXG5leHBvcnQgY2xhc3MgVGV4dE1vZGVsRGlmZnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfcmVjb21wdXRlQ291bnQgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxUZXh0TW9kZWxEaWZmU3RhdGUsIFRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24+KHRoaXMsIFRleHRNb2RlbERpZmZTdGF0ZS5pbml0aWFsaXppbmcpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmcyA9IG9ic2VydmFibGVWYWx1ZTxEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSwgVGV4dE1vZGVsRGlmZkNoYW5nZVJlYXNvbj4odGhpcywgW10pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JhcnJpZXIgPSBuZXcgUmVlbnRyYW5jeUJhcnJpZXIoKTtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdHB1YmxpYyBnZXQgaXNBcHBseWluZ0NoYW5nZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fYmFycmllci5pc09jY3VwaWVkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBiYXNlVGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGlmZkNvbXB1dGVyOiBJTWVyZ2VEaWZmQ29tcHV0ZXIsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCByZWNvbXB1dGVTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKCdyZWNvbXB1dGUnKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIGRpZmYgc3RhdGUgKi9cblx0XHRcdHJlY29tcHV0ZVNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9yZWNvbXB1dGUocmVhZGVyKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGJhc2VUZXh0TW9kZWwub25EaWRDaGFuZ2VDb250ZW50KFxuXHRcdFx0XHR0aGlzLl9iYXJyaWVyLm1ha2VFeGNsdXNpdmVPclNraXAoKCkgPT4ge1xuXHRcdFx0XHRcdHJlY29tcHV0ZVNpZ25hbC50cmlnZ2VyKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpXG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdHRleHRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoXG5cdFx0XHRcdHRoaXMuX2JhcnJpZXIubWFrZUV4Y2x1c2l2ZU9yU2tpcCgoKSA9PiB7XG5cdFx0XHRcdFx0cmVjb21wdXRlU2lnbmFsLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHRcdFx0fSlcblx0XHRcdClcblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN0YXRlKCk6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxUZXh0TW9kZWxEaWZmU3RhdGUsIFRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24+IHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdH1cblxuXHQvKipcblx0ICogRGlmZnMgZnJvbSBiYXNlIHRvIGlucHV0LlxuXHQqL1xuXHRwdWJsaWMgZ2V0IGRpZmZzKCk6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSwgVGV4dE1vZGVsRGlmZkNoYW5nZVJlYXNvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9kaWZmcztcblx0fVxuXG5cdHByaXZhdGUgX2lzSW5pdGlhbGl6aW5nID0gdHJ1ZTtcblxuXHRwcml2YXRlIF9yZWNvbXB1dGUocmVhZGVyOiBJUmVhZGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjb21wdXRlQ291bnQrKztcblx0XHRjb25zdCBjdXJyZW50UmVjb21wdXRlSWR4ID0gdGhpcy5fcmVjb21wdXRlQ291bnQ7XG5cblx0XHRpZiAodGhpcy5fc3RhdGUuZ2V0KCkgPT09IFRleHRNb2RlbERpZmZTdGF0ZS5pbml0aWFsaXppbmcpIHtcblx0XHRcdHRoaXMuX2lzSW5pdGlhbGl6aW5nID0gdHJ1ZTtcblx0XHR9XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIFN0YXJ0aW5nIERpZmYgQ29tcHV0YXRpb24uICovXG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoXG5cdFx0XHRcdHRoaXMuX2lzSW5pdGlhbGl6aW5nID8gVGV4dE1vZGVsRGlmZlN0YXRlLmluaXRpYWxpemluZyA6IFRleHRNb2RlbERpZmZTdGF0ZS51cGRhdGluZyxcblx0XHRcdFx0dHgsXG5cdFx0XHRcdFRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24ub3RoZXJcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmRpZmZDb21wdXRlci5jb21wdXRlRGlmZih0aGlzLmJhc2VUZXh0TW9kZWwsIHRoaXMudGV4dE1vZGVsLCByZWFkZXIpO1xuXG5cdFx0cmVzdWx0LnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VycmVudFJlY29tcHV0ZUlkeCAhPT0gdGhpcy5fcmVjb21wdXRlQ291bnQpIHtcblx0XHRcdFx0Ly8gVGhlcmUgaXMgYSBuZXdlciByZWNvbXB1dGUgY2FsbFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBDb21wbGV0ZWQgRGlmZiBDb21wdXRhdGlvbiAqL1xuXHRcdFx0XHRpZiAocmVzdWx0LmRpZmZzKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUuc2V0KFRleHRNb2RlbERpZmZTdGF0ZS51cFRvRGF0ZSwgdHgsIFRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24udGV4dENoYW5nZSk7XG5cdFx0XHRcdFx0dGhpcy5fZGlmZnMuc2V0KHJlc3VsdC5kaWZmcywgdHgsIFRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24udGV4dENoYW5nZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUuc2V0KFRleHRNb2RlbERpZmZTdGF0ZS5lcnJvciwgdHgsIFRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24udGV4dENoYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faXNJbml0aWFsaXppbmcgPSBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVVcFRvRGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zdGF0ZS5nZXQoKSAhPT0gVGV4dE1vZGVsRGlmZlN0YXRlLnVwVG9EYXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdDYW5ub3QgcmVtb3ZlIGRpZmZzIHdoZW4gdGhlIG1vZGVsIGlzIG5vdCB1cCB0byBkYXRlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZURpZmZzKGRpZmZUb1JlbW92ZXM6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdLCB0cmFuc2FjdGlvbjogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkLCBncm91cD86IFVuZG9SZWRvR3JvdXApOiB2b2lkIHtcblx0XHR0aGlzLmVuc3VyZVVwVG9EYXRlKCk7XG5cblx0XHRkaWZmVG9SZW1vdmVzLnNvcnQoY29tcGFyZUJ5KChkKSA9PiBkLmlucHV0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBudW1iZXJDb21wYXJhdG9yKSk7XG5cdFx0ZGlmZlRvUmVtb3Zlcy5yZXZlcnNlKCk7IC8vIHByb2Nlc3MgZnJvbSBib3R0b20gb2YgZG9jdW1lbnQgdXB3YXJkXG5cblx0XHRjb25zdCBkaWZmcyA9IHRoaXMuX2RpZmZzLmdldCgpO1xuXG5cdFx0Ly8gVmFsaWRhdGUgYWxsIGRpZmZzLXRvLXJlbW92ZSBleGlzdCB1c2luZyBTZXQgZm9yIE8oMSkgbG9va3VwXG5cdFx0Y29uc3QgdG9SZW1vdmVTZXQgPSBuZXcgU2V0KGRpZmZUb1JlbW92ZXMpO1xuXHRcdGlmICh0b1JlbW92ZVNldC5zaXplICE9PSBkaWZmVG9SZW1vdmVzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpOyAvLyBkdXBsaWNhdGUgZW50cmllc1xuXHRcdH1cblx0XHRjb25zdCBkaWZmc1NldCA9IG5ldyBTZXQoZGlmZnMpO1xuXHRcdGZvciAoY29uc3QgZCBvZiBkaWZmVG9SZW1vdmVzKSB7XG5cdFx0XHRpZiAoIWRpZmZzU2V0LmhhcyhkKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgdGV4dCBtb2RlbCBlZGl0cyBpbiByZXZlcnNlIGRvY3VtZW50IG9yZGVyIChib3R0b20tdXAsIHNhZmUgZm9yIGxpbmUgc2hpZnRpbmcpXG5cdFx0Zm9yIChjb25zdCBkaWZmVG9SZW1vdmUgb2YgZGlmZlRvUmVtb3Zlcykge1xuXHRcdFx0dGhpcy5fYmFycmllci5ydW5FeGNsdXNpdmVseU9yVGhyb3coKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0cyA9IGRpZmZUb1JlbW92ZS5nZXRSZXZlcnNlTGluZUVkaXQoKS50b0VkaXRzKHRoaXMudGV4dE1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdFx0dGhpcy50ZXh0TW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIGVkaXRzLCAoKSA9PiBudWxsLCBncm91cCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBTaW5nbGUgZm9yd2FyZCBwYXNzOiBhY2N1bXVsYXRlIGRlbHRhIGZyb20gcmVtb3ZlZCBkaWZmcyBhYm92ZSwgYXBwbHkgdG8gcmVtYWluaW5nIGRpZmZzIGJlbG93XG5cdFx0bGV0IGN1bXVsYXRpdmVEZWx0YSA9IDA7XG5cdFx0Y29uc3QgbmV3RGlmZnM6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGQgb2YgZGlmZnMpIHtcblx0XHRcdGlmICh0b1JlbW92ZVNldC5oYXMoZCkpIHtcblx0XHRcdFx0Y3VtdWxhdGl2ZURlbHRhICs9IGQuaW5wdXRSYW5nZS5sZW5ndGggLSBkLm91dHB1dFJhbmdlLmxlbmd0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5ld0RpZmZzLnB1c2goY3VtdWxhdGl2ZURlbHRhICE9PSAwID8gZC5hZGRPdXRwdXRMaW5lRGVsdGEoY3VtdWxhdGl2ZURlbHRhKSA6IGQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2RpZmZzLnNldChuZXdEaWZmcywgdHJhbnNhY3Rpb24sIFRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24ub3RoZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVkaXQgbXVzdCBiZSBjb25mbGljdCBmcmVlLlxuXHQgKi9cblx0cHVibGljIGFwcGx5RWRpdFJlbGF0aXZlVG9PcmlnaW5hbChlZGl0OiBMaW5lUmFuZ2VFZGl0LCB0cmFuc2FjdGlvbjogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkLCBncm91cD86IFVuZG9SZWRvR3JvdXApOiB2b2lkIHtcblx0XHR0aGlzLmVuc3VyZVVwVG9EYXRlKCk7XG5cblx0XHRjb25zdCBlZGl0TWFwcGluZyA9IG5ldyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcoXG5cdFx0XHRlZGl0LnJhbmdlLFxuXHRcdFx0dGhpcy5iYXNlVGV4dE1vZGVsLFxuXHRcdFx0TWVyZ2VFZGl0b3JMaW5lUmFuZ2UuZnJvbUxlbmd0aChlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZWRpdC5uZXdMaW5lcy5sZW5ndGgpLFxuXHRcdFx0dGhpcy50ZXh0TW9kZWxcblx0XHQpO1xuXG5cdFx0bGV0IGZpcnN0QWZ0ZXIgPSBmYWxzZTtcblx0XHRsZXQgZGVsdGEgPSAwO1xuXHRcdGNvbnN0IG5ld0RpZmZzID0gbmV3IEFycmF5PERldGFpbGVkTGluZVJhbmdlTWFwcGluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGRpZmYgb2YgdGhpcy5kaWZmcy5nZXQoKSkge1xuXHRcdFx0aWYgKGRpZmYuaW5wdXRSYW5nZS5pbnRlcnNlY3RzT3JUb3VjaGVzKGVkaXQucmFuZ2UpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0VkaXQgbXVzdCBiZSBjb25mbGljdCBmcmVlLicpO1xuXHRcdFx0fSBlbHNlIGlmIChkaWZmLmlucHV0UmFuZ2UuaXNBZnRlcihlZGl0LnJhbmdlKSkge1xuXHRcdFx0XHRpZiAoIWZpcnN0QWZ0ZXIpIHtcblx0XHRcdFx0XHRmaXJzdEFmdGVyID0gdHJ1ZTtcblx0XHRcdFx0XHRuZXdEaWZmcy5wdXNoKGVkaXRNYXBwaW5nLmFkZE91dHB1dExpbmVEZWx0YShkZWx0YSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bmV3RGlmZnMucHVzaChkaWZmLmFkZE91dHB1dExpbmVEZWx0YShlZGl0Lm5ld0xpbmVzLmxlbmd0aCAtIGVkaXQucmFuZ2UubGVuZ3RoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdEaWZmcy5wdXNoKGRpZmYpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWZpcnN0QWZ0ZXIpIHtcblx0XHRcdFx0ZGVsdGEgKz0gZGlmZi5vdXRwdXRSYW5nZS5sZW5ndGggLSBkaWZmLmlucHV0UmFuZ2UubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghZmlyc3RBZnRlcikge1xuXHRcdFx0Zmlyc3RBZnRlciA9IHRydWU7XG5cdFx0XHRuZXdEaWZmcy5wdXNoKGVkaXRNYXBwaW5nLmFkZE91dHB1dExpbmVEZWx0YShkZWx0YSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2JhcnJpZXIucnVuRXhjbHVzaXZlbHlPclRocm93KCgpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRzID0gbmV3IExpbmVSYW5nZUVkaXQoZWRpdC5yYW5nZS5kZWx0YShkZWx0YSksIGVkaXQubmV3TGluZXMpLnRvRWRpdHModGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0dGhpcy50ZXh0TW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIGVkaXRzLCAoKSA9PiBudWxsLCBncm91cCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fZGlmZnMuc2V0KG5ld0RpZmZzLCB0cmFuc2FjdGlvbiwgVGV4dE1vZGVsRGlmZkNoYW5nZVJlYXNvbi5vdGhlcik7XG5cdH1cblxuXHRwdWJsaWMgZmluZFRvdWNoaW5nRGlmZnMoYmFzZVJhbmdlOiBNZXJnZUVkaXRvckxpbmVSYW5nZSk6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5kaWZmcy5nZXQoKS5maWx0ZXIoZCA9PiBkLmlucHV0UmFuZ2UuaW50ZXJzZWN0c09yVG91Y2hlcyhiYXNlUmFuZ2UpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVzdWx0TGluZShsaW5lTnVtYmVyOiBudW1iZXIsIHJlYWRlcj86IElSZWFkZXIpOiBudW1iZXIgfCBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcge1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGNvbnN0IGRpZmZzID0gcmVhZGVyID8gdGhpcy5kaWZmcy5yZWFkKHJlYWRlcikgOiB0aGlzLmRpZmZzLmdldCgpO1xuXHRcdGZvciAoY29uc3QgZGlmZiBvZiBkaWZmcykge1xuXHRcdFx0aWYgKGRpZmYuaW5wdXRSYW5nZS5jb250YWlucyhsaW5lTnVtYmVyKSB8fCBkaWZmLmlucHV0UmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA9PT0gbGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gZGlmZjtcblx0XHRcdH0gZWxzZSBpZiAoZGlmZi5pbnB1dFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPCBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdG9mZnNldCA9IGRpZmYucmVzdWx0aW5nRGVsdGFGcm9tT3JpZ2luYWxUb01vZGlmaWVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsaW5lTnVtYmVyICsgb2Zmc2V0O1xuXHR9XG5cblx0cHVibGljIGdldFJlc3VsdExpbmVSYW5nZShiYXNlUmFuZ2U6IE1lcmdlRWRpdG9yTGluZVJhbmdlLCByZWFkZXI/OiBJUmVhZGVyKTogTWVyZ2VFZGl0b3JMaW5lUmFuZ2Uge1xuXHRcdGxldCBzdGFydCA9IHRoaXMuZ2V0UmVzdWx0TGluZShiYXNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByZWFkZXIpO1xuXHRcdGlmICh0eXBlb2Ygc3RhcnQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRzdGFydCA9IHN0YXJ0Lm91dHB1dFJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHR9XG5cdFx0bGV0IGVuZEV4Y2x1c2l2ZSA9IHRoaXMuZ2V0UmVzdWx0TGluZShiYXNlUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSwgcmVhZGVyKTtcblx0XHRpZiAodHlwZW9mIGVuZEV4Y2x1c2l2ZSAhPT0gJ251bWJlcicpIHtcblx0XHRcdGVuZEV4Y2x1c2l2ZSA9IGVuZEV4Y2x1c2l2ZS5vdXRwdXRSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXHRcdH1cblxuXHRcdHJldHVybiBNZXJnZUVkaXRvckxpbmVSYW5nZS5mcm9tTGluZU51bWJlcnMoc3RhcnQsIGVuZEV4Y2x1c2l2ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGV4dE1vZGVsRGlmZkNoYW5nZVJlYXNvbiB7XG5cdG90aGVyID0gMCxcblx0dGV4dENoYW5nZSA9IDEsXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRleHRNb2RlbERpZmZTdGF0ZSB7XG5cdGluaXRpYWxpemluZyA9IDEsXG5cdHVwVG9EYXRlID0gMixcblx0dXBkYXRpbmcgPSAzLFxuXHRlcnJvciA9IDQsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRNb2RlbERpZmZzU3RhdGUge1xuXHRzdGF0ZTogVGV4dE1vZGVsRGlmZlN0YXRlO1xuXHRkaWZmczogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW107XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVcsd0JBQXdCO0FBQzVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsWUFBWSxvQkFBb0I7QUFFekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxTQUF1RCxrQkFBa0IsaUJBQWlCLG1CQUFtQjtBQUcvRyxNQUFNLHVCQUF1QixXQUFXO0FBQUEsRUFZOUMsWUFDa0IsZUFDQSxXQUNBLGNBQ2hCO0FBQ0QsVUFBTTtBQUpXO0FBQ0E7QUFDQTtBQWRsQixTQUFRLGtCQUFrQjtBQUMxQixTQUFpQixT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QUFLLFdBQVcseUJBQXlCLFlBQVk7QUFDL0QsaUJBQVMsS0FBSztBQUFBLE1BQ2YsT0FBTztBQUNOO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLGFBQWE7QUFBQSxFQUNyQjtBQUFBLEVBRU8sbUJBQW1CLFdBQWlDLFFBQXdDO0FBQ2xHLFFBQUksUUFBUSxLQUFLLGNBQWMsVUFBVSxpQkFBaUIsTUFBTTtBQUNoRSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGNBQVEsTUFBTSxZQUFZO0FBQUEsSUFDM0I7QUFDQSxRQUFJLGVBQWUsS0FBSyxjQUFjLFVBQVUsd0JBQXdCLE1BQU07QUFDOUUsUUFBSSxPQUFPLGlCQUFpQixVQUFVO0FBQ3JDLHFCQUFlLGFBQWEsWUFBWTtBQUFBLElBQ3pDO0FBRUEsV0FBTyxxQkFBcUIsZ0JBQWdCLE9BQU8sWUFBWTtBQUFBLEVBQ2hFO0FBQ0Q7QUFFTyxJQUFXLDRCQUFYLGtCQUFXQywrQkFBWDtBQUNOLEVBQUFBLHNEQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLHNEQUFBLGdCQUFhLEtBQWI7QUFGaUIsU0FBQUE7QUFBQSxHQUFBO0FBS1gsSUFBVyxxQkFBWCxrQkFBV0Msd0JBQVg7QUFDTixFQUFBQSx3Q0FBQSxrQkFBZSxLQUFmO0FBQ0EsRUFBQUEsd0NBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsd0NBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsd0NBQUEsV0FBUSxLQUFSO0FBSmlCLFNBQUFBO0FBQUEsR0FBQTsiLAogICJuYW1lcyI6IFsicmVzdWx0IiwgInRyYW5zYWN0aW9uIiwgIlRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24iLCAiVGV4dE1vZGVsRGlmZlN0YXRlIl0KfQo=
