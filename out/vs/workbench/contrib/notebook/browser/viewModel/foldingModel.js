import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { marked } from "../../../../../base/common/marked/marked.js";
import { TrackedRangeStickiness } from "../../../../../editor/common/model.js";
import { FoldingRegions } from "../../../../../editor/contrib/folding/browser/foldingRanges.js";
import { sanitizeRanges } from "../../../../../editor/contrib/folding/browser/syntaxRangeProvider.js";
import { CellKind } from "../../common/notebookCommon.js";
import { cellRangesToIndexes } from "../../common/notebookRange.js";
const foldingRangeLimit = {
  limit: 5e3,
  update: () => {
  }
};
class FoldingModel {
  constructor() {
    this._viewModel = null;
    this._viewModelStore = new DisposableStore();
    this._onDidFoldingRegionChanges = new Emitter();
    this.onDidFoldingRegionChanged = this._onDidFoldingRegionChanges.event;
    this._foldingRangeDecorationIds = [];
    this._regions = new FoldingRegions(new Uint32Array(0), new Uint32Array(0));
  }
  get regions() {
    return this._regions;
  }
  dispose() {
    this._onDidFoldingRegionChanges.dispose();
    this._viewModelStore.dispose();
  }
  detachViewModel() {
    this._viewModelStore.clear();
    this._viewModel = null;
  }
  attachViewModel(model) {
    this._viewModel = model;
    this._viewModelStore.add(this._viewModel.onDidChangeViewCells(() => {
      this.recompute();
    }));
    this._viewModelStore.add(this._viewModel.onDidChangeSelection(() => {
      if (!this._viewModel) {
        return;
      }
      const indexes = cellRangesToIndexes(this._viewModel.getSelections());
      let changed = false;
      indexes.forEach((index) => {
        let regionIndex = this.regions.findRange(index + 1);
        while (regionIndex !== -1) {
          if (this._regions.isCollapsed(regionIndex) && index > this._regions.getStartLineNumber(regionIndex) - 1) {
            this._regions.setCollapsed(regionIndex, false);
            changed = true;
          }
          regionIndex = this._regions.getParentIndex(regionIndex);
        }
      });
      if (changed) {
        this._onDidFoldingRegionChanges.fire();
      }
    }));
    this.recompute();
  }
  getRegionAtLine(lineNumber) {
    if (this._regions) {
      const index = this._regions.findRange(lineNumber);
      if (index >= 0) {
        return this._regions.toRegion(index);
      }
    }
    return null;
  }
  getRegionsInside(region, filter) {
    const result = [];
    const index = region ? region.regionIndex + 1 : 0;
    const endLineNumber = region ? region.endLineNumber : Number.MAX_VALUE;
    if (filter && filter.length === 2) {
      const levelStack = [];
      for (let i = index, len = this._regions.length; i < len; i++) {
        const current = this._regions.toRegion(i);
        if (this._regions.getStartLineNumber(i) < endLineNumber) {
          while (levelStack.length > 0 && !current.containedBy(levelStack[levelStack.length - 1])) {
            levelStack.pop();
          }
          levelStack.push(current);
          if (filter(current, levelStack.length)) {
            result.push(current);
          }
        } else {
          break;
        }
      }
    } else {
      for (let i = index, len = this._regions.length; i < len; i++) {
        const current = this._regions.toRegion(i);
        if (this._regions.getStartLineNumber(i) < endLineNumber) {
          if (!filter || filter(current)) {
            result.push(current);
          }
        } else {
          break;
        }
      }
    }
    return result;
  }
  getAllRegionsAtLine(lineNumber, filter) {
    const result = [];
    if (this._regions) {
      let index = this._regions.findRange(lineNumber);
      let level = 1;
      while (index >= 0) {
        const current = this._regions.toRegion(index);
        if (!filter || filter(current, level)) {
          result.push(current);
        }
        level++;
        index = current.parentIndex;
      }
    }
    return result;
  }
  setCollapsed(index, newState) {
    this._regions.setCollapsed(index, newState);
  }
  recompute() {
    if (!this._viewModel) {
      return;
    }
    const viewModel = this._viewModel;
    const cells = viewModel.viewCells;
    const stack = [];
    for (let i2 = 0; i2 < cells.length; i2++) {
      const cell = cells[i2];
      if (cell.cellKind !== CellKind.Markup || cell.language !== "markdown") {
        continue;
      }
      const minDepth = Math.min(7, ...Array.from(getMarkdownHeadersInCell(cell.getText()), (header) => header.depth));
      if (minDepth < 7) {
        stack.push({ index: i2, level: minDepth, endIndex: 0 });
      }
    }
    const rawFoldingRanges = stack.map((entry, startIndex) => {
      let end = void 0;
      for (let i2 = startIndex + 1; i2 < stack.length; ++i2) {
        if (stack[i2].level <= entry.level) {
          end = stack[i2].index - 1;
          break;
        }
      }
      const endIndex = end !== void 0 ? end : cells.length - 1;
      return {
        start: entry.index + 1,
        end: endIndex + 1,
        rank: 1
      };
    }).filter((range) => range.start !== range.end);
    const newRegions = sanitizeRanges(rawFoldingRanges, foldingRangeLimit);
    let i = 0;
    const nextCollapsed = () => {
      while (i < this._regions.length) {
        const isCollapsed = this._regions.isCollapsed(i);
        i++;
        if (isCollapsed) {
          return i - 1;
        }
      }
      return -1;
    };
    let k = 0;
    let collapsedIndex = nextCollapsed();
    while (collapsedIndex !== -1 && k < newRegions.length) {
      const decRange = viewModel.getTrackedRange(this._foldingRangeDecorationIds[collapsedIndex]);
      if (decRange) {
        const collasedStartIndex = decRange.start;
        while (k < newRegions.length) {
          const startIndex = newRegions.getStartLineNumber(k) - 1;
          if (collasedStartIndex >= startIndex) {
            newRegions.setCollapsed(k, collasedStartIndex === startIndex);
            k++;
          } else {
            break;
          }
        }
      }
      collapsedIndex = nextCollapsed();
    }
    while (k < newRegions.length) {
      newRegions.setCollapsed(k, false);
      k++;
    }
    const cellRanges = [];
    for (let i2 = 0; i2 < newRegions.length; i2++) {
      const region = newRegions.toRegion(i2);
      cellRanges.push({ start: region.startLineNumber - 1, end: region.endLineNumber - 1 });
    }
    this._foldingRangeDecorationIds.forEach((id) => viewModel.setTrackedRange(id, null, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter));
    this._foldingRangeDecorationIds = cellRanges.map((region) => viewModel.setTrackedRange(null, region, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter)).filter((str) => str !== null);
    this._regions = newRegions;
    this._onDidFoldingRegionChanges.fire();
  }
  getMemento() {
    const collapsedRanges = [];
    let i = 0;
    while (i < this._regions.length) {
      const isCollapsed = this._regions.isCollapsed(i);
      if (isCollapsed) {
        const region = this._regions.toRegion(i);
        collapsedRanges.push({ start: region.startLineNumber - 1, end: region.endLineNumber - 1 });
      }
      i++;
    }
    return collapsedRanges;
  }
  applyMemento(state) {
    if (!this._viewModel) {
      return false;
    }
    let i = 0;
    let k = 0;
    while (k < state.length && i < this._regions.length) {
      const decRange = this._viewModel.getTrackedRange(this._foldingRangeDecorationIds[i]);
      if (decRange) {
        const collasedStartIndex = state[k].start;
        while (i < this._regions.length) {
          const startIndex = this._regions.getStartLineNumber(i) - 1;
          if (collasedStartIndex >= startIndex) {
            this._regions.setCollapsed(i, collasedStartIndex === startIndex);
            i++;
          } else {
            break;
          }
        }
      }
      k++;
    }
    while (i < this._regions.length) {
      this._regions.setCollapsed(i, false);
      i++;
    }
    return true;
  }
}
function updateFoldingStateAtIndex(foldingModel, index, collapsed) {
  const range = foldingModel.regions.findRange(index + 1);
  foldingModel.setCollapsed(range, collapsed);
}
function* getMarkdownHeadersInCell(cellContent) {
  for (const token of marked.lexer(cellContent, { gfm: true })) {
    if (token.type === "heading") {
      yield {
        depth: token.depth,
        text: renderAsPlaintext({ value: token.raw }).trim()
      };
    }
  }
}
export {
  FoldingModel,
  getMarkdownHeadersInCell,
  updateFoldingStateAtIndex
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3TW9kZWxcXGZvbGRpbmdNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1hcmtlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcmtlZC9tYXJrZWQuanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgRm9sZGluZ0xpbWl0UmVwb3J0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9mb2xkaW5nL2Jyb3dzZXIvZm9sZGluZy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nUmVnaW9uLCBGb2xkaW5nUmVnaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nUmFuZ2VzLmpzJztcbmltcG9ydCB7IElGb2xkaW5nUmFuZ2VEYXRhLCBzYW5pdGl6ZVJhbmdlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9zeW50YXhSYW5nZVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1ZpZXdNb2RlbCB9IGZyb20gJy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBjZWxsUmFuZ2VzVG9JbmRleGVzLCBJQ2VsbFJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuXG50eXBlIFJlZ2lvbkZpbHRlciA9IChyOiBGb2xkaW5nUmVnaW9uKSA9PiBib29sZWFuO1xudHlwZSBSZWdpb25GaWx0ZXJXaXRoTGV2ZWwgPSAocjogRm9sZGluZ1JlZ2lvbiwgbGV2ZWw6IG51bWJlcikgPT4gYm9vbGVhbjtcblxuY29uc3QgZm9sZGluZ1JhbmdlTGltaXQ6IEZvbGRpbmdMaW1pdFJlcG9ydGVyID0ge1xuXHRsaW1pdDogNTAwMCxcblx0dXBkYXRlOiAoKSA9PiB7IH1cbn07XG5cbmV4cG9ydCBjbGFzcyBGb2xkaW5nTW9kZWwgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3ZpZXdNb2RlbDogSU5vdGVib29rVmlld01vZGVsIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdNb2RlbFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9yZWdpb25zOiBGb2xkaW5nUmVnaW9ucztcblx0Z2V0IHJlZ2lvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvbGRpbmdSZWdpb25DaGFuZ2VzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRGb2xkaW5nUmVnaW9uQ2hhbmdlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEZvbGRpbmdSZWdpb25DaGFuZ2VzLmV2ZW50O1xuXG5cdHByaXZhdGUgX2ZvbGRpbmdSYW5nZURlY29yYXRpb25JZHM6IHN0cmluZ1tdID0gW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fcmVnaW9ucyA9IG5ldyBGb2xkaW5nUmVnaW9ucyhuZXcgVWludDMyQXJyYXkoMCksIG5ldyBVaW50MzJBcnJheSgwKSk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX29uRGlkRm9sZGluZ1JlZ2lvbkNoYW5nZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3ZpZXdNb2RlbFN0b3JlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRldGFjaFZpZXdNb2RlbCgpIHtcblx0XHR0aGlzLl92aWV3TW9kZWxTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX3ZpZXdNb2RlbCA9IG51bGw7XG5cdH1cblxuXHRhdHRhY2hWaWV3TW9kZWwobW9kZWw6IElOb3RlYm9va1ZpZXdNb2RlbCkge1xuXHRcdHRoaXMuX3ZpZXdNb2RlbCA9IG1vZGVsO1xuXG5cdFx0dGhpcy5fdmlld01vZGVsU3RvcmUuYWRkKHRoaXMuX3ZpZXdNb2RlbC5vbkRpZENoYW5nZVZpZXdDZWxscygoKSA9PiB7XG5cdFx0XHR0aGlzLnJlY29tcHV0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3ZpZXdNb2RlbFN0b3JlLmFkZCh0aGlzLl92aWV3TW9kZWwub25EaWRDaGFuZ2VTZWxlY3Rpb24oKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl92aWV3TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbmRleGVzID0gY2VsbFJhbmdlc1RvSW5kZXhlcyh0aGlzLl92aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpKTtcblxuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblxuXHRcdFx0aW5kZXhlcy5mb3JFYWNoKGluZGV4ID0+IHtcblx0XHRcdFx0bGV0IHJlZ2lvbkluZGV4ID0gdGhpcy5yZWdpb25zLmZpbmRSYW5nZShpbmRleCArIDEpO1xuXG5cdFx0XHRcdHdoaWxlIChyZWdpb25JbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fcmVnaW9ucy5pc0NvbGxhcHNlZChyZWdpb25JbmRleCkgJiYgaW5kZXggPiB0aGlzLl9yZWdpb25zLmdldFN0YXJ0TGluZU51bWJlcihyZWdpb25JbmRleCkgLSAxKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZWdpb25zLnNldENvbGxhcHNlZChyZWdpb25JbmRleCwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlZ2lvbkluZGV4ID0gdGhpcy5fcmVnaW9ucy5nZXRQYXJlbnRJbmRleChyZWdpb25JbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEZvbGRpbmdSZWdpb25DaGFuZ2VzLmZpcmUoKTtcblx0XHRcdH1cblxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVjb21wdXRlKCk7XG5cdH1cblxuXHRnZXRSZWdpb25BdExpbmUobGluZU51bWJlcjogbnVtYmVyKTogRm9sZGluZ1JlZ2lvbiB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9yZWdpb25zKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3JlZ2lvbnMuZmluZFJhbmdlKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2lvbnMudG9SZWdpb24oaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGdldFJlZ2lvbnNJbnNpZGUocmVnaW9uOiBGb2xkaW5nUmVnaW9uIHwgbnVsbCwgZmlsdGVyPzogUmVnaW9uRmlsdGVyIHwgUmVnaW9uRmlsdGVyV2l0aExldmVsKTogRm9sZGluZ1JlZ2lvbltdIHtcblx0XHRjb25zdCByZXN1bHQ6IEZvbGRpbmdSZWdpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGluZGV4ID0gcmVnaW9uID8gcmVnaW9uLnJlZ2lvbkluZGV4ICsgMSA6IDA7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHJlZ2lvbiA/IHJlZ2lvbi5lbmRMaW5lTnVtYmVyIDogTnVtYmVyLk1BWF9WQUxVRTtcblxuXHRcdGlmIChmaWx0ZXIgJiYgZmlsdGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0Y29uc3QgbGV2ZWxTdGFjazogRm9sZGluZ1JlZ2lvbltdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gaW5kZXgsIGxlbiA9IHRoaXMuX3JlZ2lvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3JlZ2lvbnMudG9SZWdpb24oaSk7XG5cdFx0XHRcdGlmICh0aGlzLl9yZWdpb25zLmdldFN0YXJ0TGluZU51bWJlcihpKSA8IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHR3aGlsZSAobGV2ZWxTdGFjay5sZW5ndGggPiAwICYmICFjdXJyZW50LmNvbnRhaW5lZEJ5KGxldmVsU3RhY2tbbGV2ZWxTdGFjay5sZW5ndGggLSAxXSkpIHtcblx0XHRcdFx0XHRcdGxldmVsU3RhY2sucG9wKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxldmVsU3RhY2sucHVzaChjdXJyZW50KTtcblx0XHRcdFx0XHRpZiAoZmlsdGVyKGN1cnJlbnQsIGxldmVsU3RhY2subGVuZ3RoKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goY3VycmVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAobGV0IGkgPSBpbmRleCwgbGVuID0gdGhpcy5fcmVnaW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcmVnaW9ucy50b1JlZ2lvbihpKTtcblx0XHRcdFx0aWYgKHRoaXMuX3JlZ2lvbnMuZ2V0U3RhcnRMaW5lTnVtYmVyKGkpIDwgZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdGlmICghZmlsdGVyIHx8IChmaWx0ZXIgYXMgUmVnaW9uRmlsdGVyKShjdXJyZW50KSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goY3VycmVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRBbGxSZWdpb25zQXRMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgZmlsdGVyPzogKHI6IEZvbGRpbmdSZWdpb24sIGxldmVsOiBudW1iZXIpID0+IGJvb2xlYW4pOiBGb2xkaW5nUmVnaW9uW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogRm9sZGluZ1JlZ2lvbltdID0gW107XG5cdFx0aWYgKHRoaXMuX3JlZ2lvbnMpIHtcblx0XHRcdGxldCBpbmRleCA9IHRoaXMuX3JlZ2lvbnMuZmluZFJhbmdlKGxpbmVOdW1iZXIpO1xuXHRcdFx0bGV0IGxldmVsID0gMTtcblx0XHRcdHdoaWxlIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZWdpb25zLnRvUmVnaW9uKGluZGV4KTtcblx0XHRcdFx0aWYgKCFmaWx0ZXIgfHwgZmlsdGVyKGN1cnJlbnQsIGxldmVsKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGN1cnJlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldmVsKys7XG5cdFx0XHRcdGluZGV4ID0gY3VycmVudC5wYXJlbnRJbmRleDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHNldENvbGxhcHNlZChpbmRleDogbnVtYmVyLCBuZXdTdGF0ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3JlZ2lvbnMuc2V0Q29sbGFwc2VkKGluZGV4LCBuZXdTdGF0ZSk7XG5cdH1cblxuXHRyZWNvbXB1dGUoKSB7XG5cdFx0aWYgKCF0aGlzLl92aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl92aWV3TW9kZWw7XG5cdFx0Y29uc3QgY2VsbHMgPSB2aWV3TW9kZWwudmlld0NlbGxzO1xuXHRcdGNvbnN0IHN0YWNrOiB7IGluZGV4OiBudW1iZXI7IGxldmVsOiBudW1iZXI7IGVuZEluZGV4OiBudW1iZXIgfVtdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNlbGxzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjZWxsID0gY2VsbHNbaV07XG5cblx0XHRcdGlmIChjZWxsLmNlbGxLaW5kICE9PSBDZWxsS2luZC5NYXJrdXAgfHwgY2VsbC5sYW5ndWFnZSAhPT0gJ21hcmtkb3duJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWluRGVwdGggPSBNYXRoLm1pbig3LCAuLi5BcnJheS5mcm9tKGdldE1hcmtkb3duSGVhZGVyc0luQ2VsbChjZWxsLmdldFRleHQoKSksIGhlYWRlciA9PiBoZWFkZXIuZGVwdGgpKTtcblx0XHRcdGlmIChtaW5EZXB0aCA8IDcpIHtcblx0XHRcdFx0Ly8gaGVhZGVyIDEgdG8gNlxuXHRcdFx0XHRzdGFjay5wdXNoKHsgaW5kZXg6IGksIGxldmVsOiBtaW5EZXB0aCwgZW5kSW5kZXg6IDAgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY2FsY3VsYXRlIGZvbGRpbmcgcmFuZ2VzXG5cdFx0Y29uc3QgcmF3Rm9sZGluZ1JhbmdlczogSUZvbGRpbmdSYW5nZURhdGFbXSA9IHN0YWNrLm1hcCgoZW50cnksIHN0YXJ0SW5kZXgpID0+IHtcblx0XHRcdGxldCBlbmQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4ICsgMTsgaSA8IHN0YWNrLmxlbmd0aDsgKytpKSB7XG5cdFx0XHRcdGlmIChzdGFja1tpXS5sZXZlbCA8PSBlbnRyeS5sZXZlbCkge1xuXHRcdFx0XHRcdGVuZCA9IHN0YWNrW2ldLmluZGV4IC0gMTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbmRJbmRleCA9IGVuZCAhPT0gdW5kZWZpbmVkID8gZW5kIDogY2VsbHMubGVuZ3RoIC0gMTtcblxuXHRcdFx0Ly8gb25lIGJhc2VkXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGFydDogZW50cnkuaW5kZXggKyAxLFxuXHRcdFx0XHRlbmQ6IGVuZEluZGV4ICsgMSxcblx0XHRcdFx0cmFuazogMVxuXHRcdFx0fTtcblx0XHR9KS5maWx0ZXIocmFuZ2UgPT4gcmFuZ2Uuc3RhcnQgIT09IHJhbmdlLmVuZCk7XG5cblx0XHRjb25zdCBuZXdSZWdpb25zID0gc2FuaXRpemVSYW5nZXMocmF3Rm9sZGluZ1JhbmdlcywgZm9sZGluZ1JhbmdlTGltaXQpO1xuXG5cdFx0Ly8gcmVzdG9yZSBjb2xsYXNlZCBzdGF0ZVxuXHRcdGxldCBpID0gMDtcblx0XHRjb25zdCBuZXh0Q29sbGFwc2VkID0gKCkgPT4ge1xuXHRcdFx0d2hpbGUgKGkgPCB0aGlzLl9yZWdpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBpc0NvbGxhcHNlZCA9IHRoaXMuX3JlZ2lvbnMuaXNDb2xsYXBzZWQoaSk7XG5cdFx0XHRcdGkrKztcblx0XHRcdFx0aWYgKGlzQ29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGkgLSAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fTtcblxuXHRcdGxldCBrID0gMDtcblx0XHRsZXQgY29sbGFwc2VkSW5kZXggPSBuZXh0Q29sbGFwc2VkKCk7XG5cblx0XHR3aGlsZSAoY29sbGFwc2VkSW5kZXggIT09IC0xICYmIGsgPCBuZXdSZWdpb25zLmxlbmd0aCkge1xuXHRcdFx0Ly8gZ2V0IHRoZSBsYXRlc3QgcmFuZ2Vcblx0XHRcdGNvbnN0IGRlY1JhbmdlID0gdmlld01vZGVsLmdldFRyYWNrZWRSYW5nZSh0aGlzLl9mb2xkaW5nUmFuZ2VEZWNvcmF0aW9uSWRzW2NvbGxhcHNlZEluZGV4XSk7XG5cdFx0XHRpZiAoZGVjUmFuZ2UpIHtcblx0XHRcdFx0Y29uc3QgY29sbGFzZWRTdGFydEluZGV4ID0gZGVjUmFuZ2Uuc3RhcnQ7XG5cblx0XHRcdFx0d2hpbGUgKGsgPCBuZXdSZWdpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0SW5kZXggPSBuZXdSZWdpb25zLmdldFN0YXJ0TGluZU51bWJlcihrKSAtIDE7XG5cdFx0XHRcdFx0aWYgKGNvbGxhc2VkU3RhcnRJbmRleCA+PSBzdGFydEluZGV4KSB7XG5cdFx0XHRcdFx0XHRuZXdSZWdpb25zLnNldENvbGxhcHNlZChrLCBjb2xsYXNlZFN0YXJ0SW5kZXggPT09IHN0YXJ0SW5kZXgpO1xuXHRcdFx0XHRcdFx0aysrO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbGxhcHNlZEluZGV4ID0gbmV4dENvbGxhcHNlZCgpO1xuXHRcdH1cblxuXHRcdHdoaWxlIChrIDwgbmV3UmVnaW9ucy5sZW5ndGgpIHtcblx0XHRcdG5ld1JlZ2lvbnMuc2V0Q29sbGFwc2VkKGssIGZhbHNlKTtcblx0XHRcdGsrKztcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsUmFuZ2VzOiBJQ2VsbFJhbmdlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG5ld1JlZ2lvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHJlZ2lvbiA9IG5ld1JlZ2lvbnMudG9SZWdpb24oaSk7XG5cdFx0XHRjZWxsUmFuZ2VzLnB1c2goeyBzdGFydDogcmVnaW9uLnN0YXJ0TGluZU51bWJlciAtIDEsIGVuZDogcmVnaW9uLmVuZExpbmVOdW1iZXIgLSAxIH0pO1xuXHRcdH1cblxuXHRcdC8vIHJlbW92ZSBvbGQgdHJhY2tlZCByYW5nZXMgYW5kIGFkZCBuZXcgb25lc1xuXHRcdC8vIFRPRE9AcmVib3JuaXgsIGltcGxlbWVudCBkZWx0YVxuXHRcdHRoaXMuX2ZvbGRpbmdSYW5nZURlY29yYXRpb25JZHMuZm9yRWFjaChpZCA9PiB2aWV3TW9kZWwuc2V0VHJhY2tlZFJhbmdlKGlkLCBudWxsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlcikpO1xuXHRcdHRoaXMuX2ZvbGRpbmdSYW5nZURlY29yYXRpb25JZHMgPSBjZWxsUmFuZ2VzLm1hcChyZWdpb24gPT4gdmlld01vZGVsLnNldFRyYWNrZWRSYW5nZShudWxsLCByZWdpb24sIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyKSkuZmlsdGVyKHN0ciA9PiBzdHIgIT09IG51bGwpIGFzIHN0cmluZ1tdO1xuXG5cdFx0dGhpcy5fcmVnaW9ucyA9IG5ld1JlZ2lvbnM7XG5cdFx0dGhpcy5fb25EaWRGb2xkaW5nUmVnaW9uQ2hhbmdlcy5maXJlKCk7XG5cdH1cblxuXHRnZXRNZW1lbnRvKCk6IElDZWxsUmFuZ2VbXSB7XG5cdFx0Y29uc3QgY29sbGFwc2VkUmFuZ2VzOiBJQ2VsbFJhbmdlW10gPSBbXTtcblx0XHRsZXQgaSA9IDA7XG5cdFx0d2hpbGUgKGkgPCB0aGlzLl9yZWdpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgaXNDb2xsYXBzZWQgPSB0aGlzLl9yZWdpb25zLmlzQ29sbGFwc2VkKGkpO1xuXG5cdFx0XHRpZiAoaXNDb2xsYXBzZWQpIHtcblx0XHRcdFx0Y29uc3QgcmVnaW9uID0gdGhpcy5fcmVnaW9ucy50b1JlZ2lvbihpKTtcblx0XHRcdFx0Y29sbGFwc2VkUmFuZ2VzLnB1c2goeyBzdGFydDogcmVnaW9uLnN0YXJ0TGluZU51bWJlciAtIDEsIGVuZDogcmVnaW9uLmVuZExpbmVOdW1iZXIgLSAxIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbGxhcHNlZFJhbmdlcztcblx0fVxuXG5cdHB1YmxpYyBhcHBseU1lbWVudG8oc3RhdGU6IElDZWxsUmFuZ2VbXSk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fdmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IGkgPSAwO1xuXHRcdGxldCBrID0gMDtcblxuXHRcdHdoaWxlIChrIDwgc3RhdGUubGVuZ3RoICYmIGkgPCB0aGlzLl9yZWdpb25zLmxlbmd0aCkge1xuXHRcdFx0Ly8gZ2V0IHRoZSBsYXRlc3QgcmFuZ2Vcblx0XHRcdGNvbnN0IGRlY1JhbmdlID0gdGhpcy5fdmlld01vZGVsLmdldFRyYWNrZWRSYW5nZSh0aGlzLl9mb2xkaW5nUmFuZ2VEZWNvcmF0aW9uSWRzW2ldKTtcblx0XHRcdGlmIChkZWNSYW5nZSkge1xuXHRcdFx0XHRjb25zdCBjb2xsYXNlZFN0YXJ0SW5kZXggPSBzdGF0ZVtrXS5zdGFydDtcblxuXHRcdFx0XHR3aGlsZSAoaSA8IHRoaXMuX3JlZ2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRJbmRleCA9IHRoaXMuX3JlZ2lvbnMuZ2V0U3RhcnRMaW5lTnVtYmVyKGkpIC0gMTtcblx0XHRcdFx0XHRpZiAoY29sbGFzZWRTdGFydEluZGV4ID49IHN0YXJ0SW5kZXgpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlZ2lvbnMuc2V0Q29sbGFwc2VkKGksIGNvbGxhc2VkU3RhcnRJbmRleCA9PT0gc3RhcnRJbmRleCk7XG5cdFx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aysrO1xuXHRcdH1cblxuXHRcdHdoaWxlIChpIDwgdGhpcy5fcmVnaW9ucy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3JlZ2lvbnMuc2V0Q29sbGFwc2VkKGksIGZhbHNlKTtcblx0XHRcdGkrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgaW5kZXg6IG51bWJlciwgY29sbGFwc2VkOiBib29sZWFuKSB7XG5cdGNvbnN0IHJhbmdlID0gZm9sZGluZ01vZGVsLnJlZ2lvbnMuZmluZFJhbmdlKGluZGV4ICsgMSk7XG5cdGZvbGRpbmdNb2RlbC5zZXRDb2xsYXBzZWQocmFuZ2UsIGNvbGxhcHNlZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiogZ2V0TWFya2Rvd25IZWFkZXJzSW5DZWxsKGNlbGxDb250ZW50OiBzdHJpbmcpOiBJdGVyYWJsZTx7IHJlYWRvbmx5IGRlcHRoOiBudW1iZXI7IHJlYWRvbmx5IHRleHQ6IHN0cmluZyB9PiB7XG5cdGZvciAoY29uc3QgdG9rZW4gb2YgbWFya2VkLmxleGVyKGNlbGxDb250ZW50LCB7IGdmbTogdHJ1ZSB9KSkge1xuXHRcdGlmICh0b2tlbi50eXBlID09PSAnaGVhZGluZycpIHtcblx0XHRcdHlpZWxkIHtcblx0XHRcdFx0ZGVwdGg6IHRva2VuLmRlcHRoLFxuXHRcdFx0XHR0ZXh0OiByZW5kZXJBc1BsYWludGV4dCh7IHZhbHVlOiB0b2tl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
