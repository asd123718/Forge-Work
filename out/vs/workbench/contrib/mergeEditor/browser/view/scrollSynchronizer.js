import { Disposable } from "../../../../../base/common/lifecycle.js";
import { derived } from "../../../../../base/common/observable.js";
import { ScrollType } from "../../../../../editor/common/editorCommon.js";
import { DocumentLineRangeMap } from "../model/mapping.js";
import { ReentrancyBarrier } from "../../../../../base/common/controlFlow.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { isDefined } from "../../../../../base/common/types.js";
class ScrollSynchronizer extends Disposable {
  constructor(viewModel, input1View, input2View, baseView, inputResultView, layout) {
    super();
    this.viewModel = viewModel;
    this.input1View = input1View;
    this.input2View = input2View;
    this.baseView = baseView;
    this.inputResultView = inputResultView;
    this.layout = layout;
    this.reentrancyBarrier = new ReentrancyBarrier();
    this._isSyncing = true;
    const s = derived((reader) => {
      const baseView2 = this.baseView.read(reader);
      const editors = [this.input1View, this.input2View, this.inputResultView, baseView2].filter(isDefined);
      const alignScrolling = (source, updateScrollLeft, updateScrollTop) => {
        this.reentrancyBarrier.runExclusivelyOrSkip(() => {
          if (updateScrollLeft) {
            const scrollLeft = source.editor.getScrollLeft();
            for (const editorView of editors) {
              if (editorView !== source) {
                editorView.editor.setScrollLeft(scrollLeft, ScrollType.Immediate);
              }
            }
          }
          if (updateScrollTop) {
            const scrollTop = source.editor.getScrollTop();
            for (const editorView of editors) {
              if (editorView !== source) {
                if (this._shouldLock(source, editorView)) {
                  editorView.editor.setScrollTop(scrollTop, ScrollType.Immediate);
                } else {
                  const m = this._getMapping(source, editorView);
                  if (m) {
                    this._synchronizeScrolling(source.editor, editorView.editor, m);
                  }
                }
              }
            }
          }
        });
      };
      for (const editorView of editors) {
        reader.store.add(editorView.editor.onDidScrollChange((e) => {
          if (!this._isSyncing) {
            return;
          }
          alignScrolling(editorView, e.scrollLeftChanged, e.scrollTopChanged);
        }));
      }
      return {
        update: () => {
          alignScrolling(this.inputResultView, true, true);
        }
      };
    }).recomputeInitiallyAndOnChange(this._store);
    this.updateScrolling = () => {
      s.get().update();
    };
  }
  get model() {
    return this.viewModel.get()?.model;
  }
  get lockResultWithInputs() {
    return this.layout.get().kind === "columns";
  }
  get lockBaseWithInputs() {
    return this.layout.get().kind === "mixed" && !this.layout.get().showBaseAtTop;
  }
  stopSync() {
    this._isSyncing = false;
  }
  startSync() {
    this._isSyncing = true;
  }
  _shouldLock(editor1, editor2) {
    const isInput = (editor) => editor === this.input1View || editor === this.input2View;
    if (isInput(editor1) && editor2 === this.inputResultView || isInput(editor2) && editor1 === this.inputResultView) {
      return this.lockResultWithInputs;
    }
    if (isInput(editor1) && editor2 === this.baseView.get() || isInput(editor2) && editor1 === this.baseView.get()) {
      return this.lockBaseWithInputs;
    }
    if (isInput(editor1) && isInput(editor2)) {
      return true;
    }
    return false;
  }
  _getMapping(editor1, editor2) {
    if (editor1 === this.input1View) {
      if (editor2 === this.input2View) {
        return void 0;
      } else if (editor2 === this.inputResultView) {
        return this.model?.input1ResultMapping.get();
      } else if (editor2 === this.baseView.get()) {
        const b = this.model?.baseInput1Diffs.get();
        if (!b) {
          return void 0;
        }
        return new DocumentLineRangeMap(b, -1).reverse();
      }
    } else if (editor1 === this.input2View) {
      if (editor2 === this.input1View) {
        return void 0;
      } else if (editor2 === this.inputResultView) {
        return this.model?.input2ResultMapping.get();
      } else if (editor2 === this.baseView.get()) {
        const b = this.model?.baseInput2Diffs.get();
        if (!b) {
          return void 0;
        }
        return new DocumentLineRangeMap(b, -1).reverse();
      }
    } else if (editor1 === this.inputResultView) {
      if (editor2 === this.input1View) {
        return this.model?.resultInput1Mapping.get();
      } else if (editor2 === this.input2View) {
        return this.model?.resultInput2Mapping.get();
      } else if (editor2 === this.baseView.get()) {
        const b = this.model?.resultBaseMapping.get();
        if (!b) {
          return void 0;
        }
        return b;
      }
    } else if (editor1 === this.baseView.get()) {
      if (editor2 === this.input1View) {
        const b = this.model?.baseInput1Diffs.get();
        if (!b) {
          return void 0;
        }
        return new DocumentLineRangeMap(b, -1);
      } else if (editor2 === this.input2View) {
        const b = this.model?.baseInput2Diffs.get();
        if (!b) {
          return void 0;
        }
        return new DocumentLineRangeMap(b, -1);
      } else if (editor2 === this.inputResultView) {
        const b = this.model?.baseResultMapping.get();
        if (!b) {
          return void 0;
        }
        return b;
      }
    }
    throw new BugIndicatingError();
  }
  _synchronizeScrolling(scrollingEditor, targetEditor, mapping) {
    if (!mapping) {
      return;
    }
    const visibleRanges = scrollingEditor.getVisibleRanges();
    if (visibleRanges.length === 0) {
      return;
    }
    const topLineNumber = visibleRanges[0].startLineNumber - 1;
    const result = mapping.project(topLineNumber);
    const sourceRange = result.inputRange;
    const targetRange = result.outputRange;
    const resultStartTopPx = targetEditor.getTopForLineNumber(targetRange.startLineNumber);
    const resultEndPx = targetEditor.getTopForLineNumber(targetRange.endLineNumberExclusive);
    const sourceStartTopPx = scrollingEditor.getTopForLineNumber(sourceRange.startLineNumber);
    const sourceEndPx = scrollingEditor.getTopForLineNumber(sourceRange.endLineNumberExclusive);
    const factor = Math.min((scrollingEditor.getScrollTop() - sourceStartTopPx) / (sourceEndPx - sourceStartTopPx), 1);
    const resultScrollPosition = resultStartTopPx + (resultEndPx - resultStartTopPx) * factor;
    targetEditor.setScrollTop(resultScrollPosition, ScrollType.Immediate);
  }
}
export {
  ScrollSynchronizer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFx2aWV3XFxzY3JvbGxTeW5jaHJvbml6ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRMaW5lUmFuZ2VNYXAgfSBmcm9tICcuLi9tb2RlbC9tYXBwaW5nLmpzJztcbmltcG9ydCB7IFJlZW50cmFuY3lCYXJyaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29udHJvbEZsb3cuanMnO1xuaW1wb3J0IHsgQmFzZUNvZGVFZGl0b3JWaWV3IH0gZnJvbSAnLi9lZGl0b3JzL2Jhc2VDb2RlRWRpdG9yVmlldy5qcyc7XG5pbXBvcnQgeyBJTWVyZ2VFZGl0b3JMYXlvdXQgfSBmcm9tICcuL21lcmdlRWRpdG9yLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSW5wdXRDb2RlRWRpdG9yVmlldyB9IGZyb20gJy4vZWRpdG9ycy9pbnB1dENvZGVFZGl0b3JWaWV3LmpzJztcbmltcG9ydCB7IFJlc3VsdENvZGVFZGl0b3JWaWV3IH0gZnJvbSAnLi9lZGl0b3JzL3Jlc3VsdENvZGVFZGl0b3JWaWV3LmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JWaWV3IH0gZnJvbSAnLi9lZGl0b3JzL2NvZGVFZGl0b3JWaWV3LmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTY3JvbGxTeW5jaHJvbml6ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBnZXQgbW9kZWwoKSB7IHJldHVybiB0aGlzLnZpZXdNb2RlbC5nZXQoKT8ubW9kZWw7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlZW50cmFuY3lCYXJyaWVyID0gbmV3IFJlZW50cmFuY3lCYXJyaWVyKCk7XG5cblx0cHVibGljIHJlYWRvbmx5IHVwZGF0ZVNjcm9sbGluZzogKCkgPT4gdm9pZDtcblxuXHRwcml2YXRlIGdldCBsb2NrUmVzdWx0V2l0aElucHV0cygpIHsgcmV0dXJuIHRoaXMubGF5b3V0LmdldCgpLmtpbmQgPT09ICdjb2x1bW5zJzsgfVxuXHRwcml2YXRlIGdldCBsb2NrQmFzZVdpdGhJbnB1dHMoKSB7IHJldHVybiB0aGlzLmxheW91dC5nZXQoKS5raW5kID09PSAnbWl4ZWQnICYmICF0aGlzLmxheW91dC5nZXQoKS5zaG93QmFzZUF0VG9wOyB9XG5cblx0cHJpdmF0ZSBfaXNTeW5jaW5nID0gdHJ1ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdNb2RlbDogSU9ic2VydmFibGU8TWVyZ2VFZGl0b3JWaWV3TW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5wdXQxVmlldzogSW5wdXRDb2RlRWRpdG9yVmlldyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlucHV0MlZpZXc6IElucHV0Q29kZUVkaXRvclZpZXcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBiYXNlVmlldzogSU9ic2VydmFibGU8QmFzZUNvZGVFZGl0b3JWaWV3IHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlucHV0UmVzdWx0VmlldzogUmVzdWx0Q29kZUVkaXRvclZpZXcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYXlvdXQ6IElPYnNlcnZhYmxlPElNZXJnZUVkaXRvckxheW91dD4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBzID0gZGVyaXZlZCgocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBiYXNlVmlldyA9IHRoaXMuYmFzZVZpZXcucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdG9ycyA9IFt0aGlzLmlucHV0MVZpZXcsIHRoaXMuaW5wdXQyVmlldywgdGhpcy5pbnB1dFJlc3VsdFZpZXcsIGJhc2VWaWV3XS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgYWxpZ25TY3JvbGxpbmcgPSAoc291cmNlOiBDb2RlRWRpdG9yVmlldywgdXBkYXRlU2Nyb2xsTGVmdDogYm9vbGVhbiwgdXBkYXRlU2Nyb2xsVG9wOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHRoaXMucmVlbnRyYW5jeUJhcnJpZXIucnVuRXhjbHVzaXZlbHlPclNraXAoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh1cGRhdGVTY3JvbGxMZWZ0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzY3JvbGxMZWZ0ID0gc291cmNlLmVkaXRvci5nZXRTY3JvbGxMZWZ0KCk7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGVkaXRvclZpZXcgb2YgZWRpdG9ycykge1xuXHRcdFx0XHRcdFx0XHRpZiAoZWRpdG9yVmlldyAhPT0gc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZWRpdG9yVmlldy5lZGl0b3Iuc2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0LCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHVwZGF0ZVNjcm9sbFRvcCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2Nyb2xsVG9wID0gc291cmNlLmVkaXRvci5nZXRTY3JvbGxUb3AoKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yVmlldyBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChlZGl0b3JWaWV3ICE9PSBzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodGhpcy5fc2hvdWxkTG9jayhzb3VyY2UsIGVkaXRvclZpZXcpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRlZGl0b3JWaWV3LmVkaXRvci5zZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IG0gPSB0aGlzLl9nZXRNYXBwaW5nKHNvdXJjZSwgZWRpdG9yVmlldyk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAobSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zeW5jaHJvbml6ZVNjcm9sbGluZyhzb3VyY2UuZWRpdG9yLCBlZGl0b3JWaWV3LmVkaXRvciwgbSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGZvciAoY29uc3QgZWRpdG9yVmlldyBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoZWRpdG9yVmlldy5lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9pc1N5bmNpbmcpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWxpZ25TY3JvbGxpbmcoZWRpdG9yVmlldywgZS5zY3JvbGxMZWZ0Q2hhbmdlZCwgZS5zY3JvbGxUb3BDaGFuZ2VkKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cGRhdGU6ICgpID0+IHtcblx0XHRcdFx0XHRhbGlnblNjcm9sbGluZyh0aGlzLmlucHV0UmVzdWx0VmlldywgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy51cGRhdGVTY3JvbGxpbmcgPSAoKSA9PiB7XG5cdFx0XHRzLmdldCgpLnVwZGF0ZSgpO1xuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc3RvcFN5bmMoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNTeW5jaW5nID0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3RhcnRTeW5jKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzU3luY2luZyA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRMb2NrKGVkaXRvcjE6IENvZGVFZGl0b3JWaWV3LCBlZGl0b3IyOiBDb2RlRWRpdG9yVmlldyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlzSW5wdXQgPSAoZWRpdG9yOiBDb2RlRWRpdG9yVmlldykgPT4gZWRpdG9yID09PSB0aGlzLmlucHV0MVZpZXcgfHwgZWRpdG9yID09PSB0aGlzLmlucHV0MlZpZXc7XG5cdFx0aWYgKGlzSW5wdXQoZWRpdG9yMSkgJiYgZWRpdG9yMiA9PT0gdGhpcy5pbnB1dFJlc3VsdFZpZXcgfHwgaXNJbnB1dChlZGl0b3IyKSAmJiBlZGl0b3IxID09PSB0aGlzLmlucHV0UmVzdWx0Vmlldykge1xuXHRcdFx0cmV0dXJuIHRoaXMubG9ja1Jlc3VsdFdpdGhJbnB1dHM7XG5cdFx0fVxuXHRcdGlmIChpc0lucHV0KGVkaXRvcjEpICYmIGVkaXRvcjIgPT09IHRoaXMuYmFzZVZpZXcuZ2V0KCkgfHwgaXNJbnB1dChlZGl0b3IyKSAmJiBlZGl0b3IxID09PSB0aGlzLmJhc2VWaWV3LmdldCgpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sb2NrQmFzZVdpdGhJbnB1dHM7XG5cdFx0fVxuXHRcdGlmIChpc0lucHV0KGVkaXRvcjEpICYmIGlzSW5wdXQoZWRpdG9yMikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRNYXBwaW5nKGVkaXRvcjE6IENvZGVFZGl0b3JWaWV3LCBlZGl0b3IyOiBDb2RlRWRpdG9yVmlldyk6IERvY3VtZW50TGluZVJhbmdlTWFwIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZWRpdG9yMSA9PT0gdGhpcy5pbnB1dDFWaWV3KSB7XG5cdFx0XHRpZiAoZWRpdG9yMiA9PT0gdGhpcy5pbnB1dDJWaWV3KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2UgaWYgKGVkaXRvcjIgPT09IHRoaXMuaW5wdXRSZXN1bHRWaWV3KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1vZGVsPy5pbnB1dDFSZXN1bHRNYXBwaW5nLmdldCgpITtcblx0XHRcdH0gZWxzZSBpZiAoZWRpdG9yMiA9PT0gdGhpcy5iYXNlVmlldy5nZXQoKSkge1xuXHRcdFx0XHRjb25zdCBiID0gdGhpcy5tb2RlbD8uYmFzZUlucHV0MURpZmZzLmdldCgpO1xuXHRcdFx0XHRpZiAoIWIpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRyZXR1cm4gbmV3IERvY3VtZW50TGluZVJhbmdlTWFwKGIsIC0xKS5yZXZlcnNlKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChlZGl0b3IxID09PSB0aGlzLmlucHV0MlZpZXcpIHtcblx0XHRcdGlmIChlZGl0b3IyID09PSB0aGlzLmlucHV0MVZpZXcpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSBpZiAoZWRpdG9yMiA9PT0gdGhpcy5pbnB1dFJlc3VsdFZpZXcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMubW9kZWw/LmlucHV0MlJlc3VsdE1hcHBpbmcuZ2V0KCkhO1xuXHRcdFx0fSBlbHNlIGlmIChlZGl0b3IyID09PSB0aGlzLmJhc2VWaWV3LmdldCgpKSB7XG5cdFx0XHRcdGNvbnN0IGIgPSB0aGlzLm1vZGVsPy5iYXNlSW5wdXQyRGlmZnMuZ2V0KCk7XG5cdFx0XHRcdGlmICghYikgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdHJldHVybiBuZXcgRG9jdW1lbnRMaW5lUmFuZ2VNYXAoYiwgLTEpLnJldmVyc2UoKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGVkaXRvcjEgPT09IHRoaXMuaW5wdXRSZXN1bHRWaWV3KSB7XG5cdFx0XHRpZiAoZWRpdG9yMiA9PT0gdGhpcy5pbnB1dDFWaWV3KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1vZGVsPy5yZXN1bHRJbnB1dDFNYXBwaW5nLmdldCgpITtcblx0XHRcdH0gZWxzZSBpZiAoZWRpdG9yMiA9PT0gdGhpcy5pbnB1dDJWaWV3KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1vZGVsPy5yZXN1bHRJbnB1dDJNYXBwaW5nLmdldCgpITtcblx0XHRcdH0gZWxzZSBpZiAoZWRpdG9yMiA9PT0gdGhpcy5iYXNlVmlldy5nZXQoKSkge1xuXHRcdFx0XHRjb25zdCBiID0gdGhpcy5tb2RlbD8ucmVzdWx0QmFzZU1hcHBpbmcuZ2V0KCk7XG5cdFx0XHRcdGlmICghYikgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdHJldHVybiBiO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZWRpdG9yMSA9PT0gdGhpcy5iYXNlVmlldy5nZXQoKSkge1xuXHRcdFx0aWYgKGVkaXRvcjIgPT09IHRoaXMuaW5wdXQxVmlldykge1xuXHRcdFx0XHRjb25zdCBiID0gdGhpcy5tb2RlbD8uYmFzZUlucHV0MURpZmZzLmdldCgpO1xuXHRcdFx0XHRpZiAoIWIpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRyZXR1cm4gbmV3IERvY3VtZW50TGluZVJhbmdlTWFwKGIsIC0xKTtcblx0XHRcdH0gZWxzZSBpZiAoZWRpdG9yMiA9PT0gdGhpcy5pbnB1dDJWaWV3KSB7XG5cdFx0XHRcdGNvbnN0IGIgPSB0aGlzLm1vZGVsPy5iYXNlSW5wdXQyRGlmZnMuZ2V0KCk7XG5cdFx0XHRcdGlmICghYikgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdHJldHVybiBuZXcgRG9jdW1lbnRMaW5lUmFuZ2VNYXAoYiwgLTEpO1xuXHRcdFx0fSBlbHNlIGlmIChlZGl0b3IyID09PSB0aGlzLmlucHV0UmVzdWx0Vmlldykge1xuXHRcdFx0XHRjb25zdCBiID0gdGhpcy5tb2RlbD8uYmFzZVJlc3VsdE1hcHBpbmcuZ2V0KCk7XG5cdFx0XHRcdGlmICghYikgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdHJldHVybiBiO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNocm9uaXplU2Nyb2xsaW5nKHNjcm9sbGluZ0VkaXRvcjogQ29kZUVkaXRvcldpZGdldCwgdGFyZ2V0RWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LCBtYXBwaW5nOiBEb2N1bWVudExpbmVSYW5nZU1hcCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICghbWFwcGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSBzY3JvbGxpbmdFZGl0b3IuZ2V0VmlzaWJsZVJhbmdlcygpO1xuXHRcdGlmICh2aXNpYmxlUmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0b3BMaW5lTnVtYmVyID0gdmlzaWJsZVJhbmdlc1swXS5zdGFydExpbmVOdW1iZXIgLSAxO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbWFwcGluZy5wcm9qZWN0KHRvcExpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHNvdXJjZVJhbmdlID0gcmVzdWx0LmlucHV0UmFuZ2U7XG5cdFx0Y29uc3QgdGFyZ2V0UmFuZ2UgPSByZXN1bHQub3V0cHV0UmFuZ2U7XG5cblx0XHRjb25zdCByZXN1bHRTdGFydFRvcFB4ID0gdGFyZ2V0RWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIodGFyZ2V0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCByZXN1bHRFbmRQeCA9IHRhcmdldEVkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHRhcmdldFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUpO1xuXG5cdFx0Y29uc3Qgc291cmNlU3RhcnRUb3BQeCA9IHNjcm9sbGluZ0VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHNvdXJjZVJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3Qgc291cmNlRW5kUHggPSBzY3JvbGxpbmdFZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihzb3VyY2VSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlKTtcblxuXHRcdGNvbnN0IGZhY3RvciA9IE1hdGgubWluKChzY3JvbGxpbmdFZGl0b3IuZ2V0U2Nyb2xsVG9wKCkgLSBzb3VyY2VTdGFydFRvcFB4KSAvIChzb3VyY2VFbmRQeCAtIHNvdXJjZVN0YXJ0VG9wUHgpLCAxKTtcblx0XHRjb25zdCByZXN1bHRTY3JvbGxQb3NpdGlvbiA9IHJlc3VsdFN0YXJ0VG9wUHggKyAocmVzdWx0RW5kUHggLSByZXN1bHRTdGFydFRvcFB4KSAqIGZhY3RvcjtcblxuXHRcdHRhcmdldEVkaXRvci5zZXRTY3JvbGxUb3AocmVzdWx0U2Nyb2xsUG9zaXRpb24sIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUE0QjtBQUVyQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQU9sQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQjtBQUVuQixNQUFNLDJCQUEyQixXQUFXO0FBQUEsRUFZbEQsWUFDa0IsV0FDQSxZQUNBLFlBQ0EsVUFDQSxpQkFDQSxRQUNoQjtBQUNELFVBQU07QUFQVztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFmbEIsU0FBaUIsb0JBQW9CLElBQUksa0JBQWtCO0FBTzNELFNBQVEsYUFBYTtBQVlwQixVQUFNLElBQUksUUFBUSxDQUFDLFdBQVc7QUFDN0IsWUFBTUEsWUFBVyxLQUFLLFNBQVMsS0FBSyxNQUFNO0FBQzFDLFlBQU0sVUFBVSxDQUFDLEtBQUssWUFBWSxLQUFLLFlBQVksS0FBSyxpQkFBaUJBLFNBQVEsRUFBRSxPQUFPLFNBQVM7QUFFbkcsWUFBTSxpQkFBaUIsQ0FBQyxRQUF3QixrQkFBMkIsb0JBQTZCO0FBQ3ZHLGFBQUssa0JBQWtCLHFCQUFxQixNQUFNO0FBQ2pELGNBQUksa0JBQWtCO0FBQ3JCLGtCQUFNLGFBQWEsT0FBTyxPQUFPLGNBQWM7QUFDL0MsdUJBQVcsY0FBYyxTQUFTO0FBQ2pDLGtCQUFJLGVBQWUsUUFBUTtBQUMxQiwyQkFBVyxP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
