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
import { findFirstIdxMonotonousOrArrLen } from "../../../../../../base/common/arraysFind.js";
import { createCancelablePromise, Delayer } from "../../../../../../base/common/async.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { PrefixSumComputer } from "../../../../../../editor/common/model/prefixSumComputer.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { FindMatchDecorationModel } from "./findMatchDecorationModel.js";
import { CellEditState } from "../../notebookBrowser.js";
import { CellKind, NotebookCellsChangeType } from "../../../common/notebookCommon.js";
import { hasKey } from "../../../../../../base/common/types.js";
class CellFindMatchModel {
  get length() {
    return this._contentMatches.length + this._webviewMatches.length;
  }
  get contentMatches() {
    return this._contentMatches;
  }
  get webviewMatches() {
    return this._webviewMatches;
  }
  constructor(cell, index, contentMatches, webviewMatches) {
    this.cell = cell;
    this.index = index;
    this._contentMatches = contentMatches;
    this._webviewMatches = webviewMatches;
  }
  getMatch(index) {
    if (index >= this.length) {
      throw new Error("NotebookCellFindMatch: index out of range");
    }
    if (index < this._contentMatches.length) {
      return this._contentMatches[index];
    }
    return this._webviewMatches[index - this._contentMatches.length];
  }
}
let FindModel = class extends Disposable {
  constructor(_notebookEditor, _state, _configurationService) {
    super();
    this._notebookEditor = _notebookEditor;
    this._state = _state;
    this._configurationService = _configurationService;
    this._findMatches = [];
    this._findMatchesStarts = null;
    this._currentMatch = -1;
    this._computePromise = null;
    this._modelDisposable = this._register(new DisposableStore());
    this._throttledDelayer = this._register(new Delayer(20));
    this._computePromise = null;
    this._register(_state.onFindReplaceStateChange((e) => {
      this._updateCellStates(e);
      if (e.searchString || e.isRegex || e.matchCase || e.searchScope || e.wholeWord || e.isRevealed && this._state.isRevealed || e.filters || e.isReplaceRevealed) {
        this.research();
      }
      if (e.isRevealed && !this._state.isRevealed) {
        this.clear();
      }
    }));
    this._register(this._notebookEditor.onDidChangeModel((e) => {
      this._registerModelListener(e);
    }));
    this._register(this._notebookEditor.onDidChangeCellState((e) => {
      if (e.cell.cellKind === CellKind.Markup && e.source.editStateChanged) {
        this.research();
      }
    }));
    if (this._notebookEditor.hasModel()) {
      this._registerModelListener(this._notebookEditor.textModel);
    }
    this._findMatchDecorationModel = new FindMatchDecorationModel(this._notebookEditor, this._notebookEditor.getId());
  }
  get findMatches() {
    return this._findMatches;
  }
  get currentMatch() {
    return this._currentMatch;
  }
  _updateCellStates(e) {
    if (!this._state.filters?.markupInput || !this._state.filters?.markupPreview || !this._state.filters?.findScope) {
      return;
    }
    const updateEditingState = () => {
      const viewModel = this._notebookEditor.getViewModel();
      if (!viewModel) {
        return;
      }
      const wordSeparators = this._configurationService.inspect("editor.wordSeparators").value;
      const options = {
        regex: this._state.isRegex,
        wholeWord: this._state.wholeWord,
        caseSensitive: this._state.matchCase,
        wordSeparators,
        includeMarkupInput: true,
        includeCodeInput: false,
        includeMarkupPreview: false,
        includeOutput: false,
        findScope: this._state.filters?.findScope
      };
      const contentMatches = viewModel.find(this._state.searchString, options);
      for (let i = 0; i < viewModel.length; i++) {
        const cell = viewModel.cellAt(i);
        if (cell && cell.cellKind === CellKind.Markup) {
          const foundContentMatch = contentMatches.find((m) => m.cell.handle === cell.handle && m.contentMatches.length > 0);
          const targetState = foundContentMatch ? CellEditState.Editing : CellEditState.Preview;
          const currentEditingState = cell.getEditState();
          if (currentEditingState === CellEditState.Editing && cell.editStateSource !== "find") {
            continue;
          }
          if (currentEditingState !== targetState) {
            cell.updateEditState(targetState, "find");
          }
        }
      }
    };
    if (e.isReplaceRevealed && !this._state.isReplaceRevealed) {
      const viewModel = this._notebookEditor.getViewModel();
      if (!viewModel) {
        return;
      }
      for (let i = 0; i < viewModel.length; i++) {
        const cell = viewModel.cellAt(i);
        if (cell && cell.cellKind === CellKind.Markup) {
          if (cell.getEditState() === CellEditState.Editing && cell.editStateSource === "find") {
            cell.updateEditState(CellEditState.Preview, "find");
          }
        }
      }
      return;
    }
    if (e.isReplaceRevealed) {
      updateEditingState();
    } else if ((e.filters || e.isRevealed || e.searchString || e.replaceString) && this._state.isRevealed && this._state.isReplaceRevealed) {
      updateEditingState();
    }
  }
  ensureFindMatches() {
    if (!this._findMatchesStarts) {
      this.set(this._findMatches, true);
    }
  }
  getCurrentMatch() {
    const nextIndex = this._findMatchesStarts.getIndexOf(this._currentMatch);
    const cell = this._findMatches[nextIndex.index].cell;
    const match = this._findMatches[nextIndex.index].getMatch(nextIndex.remainder);
    return {
      cell,
      match,
      isModelMatch: nextIndex.remainder < this._findMatches[nextIndex.index].contentMatches.length
    };
  }
  refreshCurrentMatch(focus) {
    const findMatchIndex = this.findMatches.findIndex((match) => match.cell === focus.cell);
    if (findMatchIndex === -1) {
      return;
    }
    const findMatch = this.findMatches[findMatchIndex];
    const index = findMatch.contentMatches.findIndex((match) => match.range.intersectRanges(focus.range) !== null);
    if (index === void 0) {
      return;
    }
    const matchesBefore = findMatchIndex === 0 ? 0 : this._findMatchesStarts?.getPrefixSum(findMatchIndex - 1) ?? 0;
    this._currentMatch = matchesBefore + index;
    this.highlightCurrentFindMatchDecoration(findMatchIndex, index).then(async (offset) => {
      await this.revealCellRange(findMatchIndex, index, offset);
      this._state.changeMatchInfo(
        this._currentMatch,
        this._findMatches.reduce((p, c) => p + c.length, 0),
        void 0
      );
    });
  }
  find(option) {
    if (!this.findMatches.length) {
      return;
    }
    if (!this._findMatchesStarts) {
      this.set(this._findMatches, true);
      if (hasKey(option, { index: true })) {
        this._currentMatch = option.index;
      }
    } else {
      const totalVal = this._findMatchesStarts.getTotalSum();
      if (hasKey(option, { index: true })) {
        this._currentMatch = option.index;
      } else if (this._currentMatch === -1) {
        this._currentMatch = option.previous ? totalVal - 1 : 0;
      } else {
        const nextVal = (this._currentMatch + (option.previous ? -1 : 1) + totalVal) % totalVal;
        this._currentMatch = nextVal;
      }
    }
    const nextIndex = this._findMatchesStarts.getIndexOf(this._currentMatch);
    this.highlightCurrentFindMatchDecoration(nextIndex.index, nextIndex.remainder).then(async (offset) => {
      await this.revealCellRange(nextIndex.index, nextIndex.remainder, offset);
      this._state.changeMatchInfo(
        this._currentMatch,
        this._findMatches.reduce((p, c) => p + c.length, 0),
        void 0
      );
    });
  }
  async revealCellRange(cellIndex, matchIndex, outputOffset) {
    const findMatch = this._findMatches[cellIndex];
    if (matchIndex >= findMatch.contentMatches.length) {
      this._notebookEditor.focusElement(findMatch.cell);
      const index = this._notebookEditor.getCellIndex(findMatch.cell);
      if (index !== void 0) {
        this._notebookEditor.revealCellOffsetInCenter(findMatch.cell, outputOffset ?? 0);
      }
    } else {
      const match = findMatch.getMatch(matchIndex);
      if (findMatch.cell.getEditState() !== CellEditState.Editing) {
        findMatch.cell.updateEditState(CellEditState.Editing, "find");
      }
      findMatch.cell.isInputCollapsed = false;
      this._notebookEditor.focusElement(findMatch.cell);
      this._notebookEditor.setCellEditorSelection(findMatch.cell, match.range);
      await this._notebookEditor.revealInView(findMatch.cell);
      this._notebookEditor.revealRangeInCenterIfOutsideViewportAsync(findMatch.cell, match.range);
    }
  }
  _registerModelListener(notebookTextModel) {
    this._modelDisposable.clear();
    if (notebookTextModel) {
      this._modelDisposable.add(notebookTextModel.onDidChangeContent((e) => {
        if (!e.rawEvents.some((event) => event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ModelChange)) {
          return;
        }
        this.research();
      }));
    }
    this.research();
  }
  async research() {
    return this._throttledDelayer.trigger(async () => {
      this._state.change({ isSearching: true }, false);
      await this._research();
      this._state.change({ isSearching: false }, false);
    });
  }
  async _research() {
    this._computePromise?.cancel();
    if (!this._state.isRevealed || !this._notebookEditor.hasModel()) {
      this.set([], false);
      return;
    }
    this._computePromise = createCancelablePromise((token) => this._compute(token));
    const findMatches = await this._computePromise;
    if (!findMatches) {
      this.set([], false);
      return;
    }
    if (findMatches.length === 0) {
      this.set([], false);
      return;
    }
    const findFirstMatchAfterCellIndex = (cellIndex) => {
      const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches.map((match) => match.index), (index) => index >= cellIndex);
      this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
    };
    if (this._currentMatch === -1) {
      if (this._notebookEditor.getLength() === 0) {
        this.set(findMatches, false);
        return;
      } else {
        const focus = this._notebookEditor.getFocus().start;
        findFirstMatchAfterCellIndex(focus);
        this.set(findMatches, false);
        return;
      }
    }
    const oldCurrIndex = this._findMatchesStarts.getIndexOf(this._currentMatch);
    const oldCurrCell = this._findMatches[oldCurrIndex.index].cell;
    const oldCurrMatchCellIndex = this._notebookEditor.getCellIndex(oldCurrCell);
    if (oldCurrMatchCellIndex < 0) {
      if (this._notebookEditor.getLength() === 0) {
        this.set(findMatches, false);
        return;
      }
      findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
      return;
    }
    const cell = this._notebookEditor.cellAt(oldCurrMatchCellIndex);
    if (cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Preview) {
      findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
      return;
    }
    if (!this._findMatchDecorationModel.currentMatchDecorations) {
      findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
      return;
    }
    if (this._findMatchDecorationModel.currentMatchDecorations.kind === "input") {
      const currentMatchDecorationId = this._findMatchDecorationModel.currentMatchDecorations.decorations.find((decoration) => decoration.ownerId === cell.handle);
      if (!currentMatchDecorationId) {
        findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
        return;
      }
      const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches, (match) => match.index >= oldCurrMatchCellIndex) % findMatches.length;
      if (findMatches[matchAfterSelection].index > oldCurrMatchCellIndex) {
        this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
        return;
      } else {
        let currMatchRangeInEditor = cell.editorAttached && currentMatchDecorationId.decorations[0] ? cell.getCellDecorationRange(currentMatchDecorationId.decorations[0]) : null;
        if (currMatchRangeInEditor === null && oldCurrIndex.remainder < this._findMatches[oldCurrIndex.index].contentMatches.length) {
          currMatchRangeInEditor = this._findMatches[oldCurrIndex.index].getMatch(oldCurrIndex.remainder).range;
        }
        if (currMatchRangeInEditor !== null) {
          const cellMatch = findMatches[matchAfterSelection];
          const matchAfterOldSelection = findFirstIdxMonotonousOrArrLen(cellMatch.contentMatches, (match) => Range.compareRangesUsingStarts(match.range, currMatchRangeInEditor) >= 0);
          this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection) + matchAfterOldSelection);
        } else {
          this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
          return;
        }
      }
    } else {
      const matchAfterSelection = findFirstIdxMonotonousOrArrLen(findMatches.map((match) => match.index), (index) => index >= oldCurrMatchCellIndex) % findMatches.length;
      this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
    }
  }
  set(cellFindMatches, autoStart) {
    if (!cellFindMatches || !cellFindMatches.length) {
      this._findMatches = [];
      this._findMatchDecorationModel.setAllFindMatchesDecorations([]);
      this.constructFindMatchesStarts();
      this._currentMatch = -1;
      this._findMatchDecorationModel.clearCurrentFindMatchDecoration();
      this._state.changeMatchInfo(
        this._currentMatch,
        this._findMatches.reduce((p, c) => p + c.length, 0),
        void 0
      );
      return;
    }
    this._findMatches = cellFindMatches;
    this._findMatchDecorationModel.setAllFindMatchesDecorations(cellFindMatches || []);
    this.constructFindMatchesStarts();
    if (autoStart) {
      this._currentMatch = 0;
      this.highlightCurrentFindMatchDecoration(0, 0);
    }
    this._state.changeMatchInfo(
      this._currentMatch,
      this._findMatches.reduce((p, c) => p + c.length, 0),
      void 0
    );
  }
  async _compute(token) {
    if (!this._notebookEditor.hasModel()) {
      return null;
    }
    let ret = null;
    const val = this._state.searchString;
    const wordSeparators = this._configurationService.inspect("editor.wordSeparators").value;
    const options = {
      regex: this._state.isRegex,
      wholeWord: this._state.wholeWord,
      caseSensitive: this._state.matchCase,
      wordSeparators,
      includeMarkupInput: this._state.filters?.markupInput ?? true,
      includeCodeInput: this._state.filters?.codeInput ?? true,
      includeMarkupPreview: !!this._state.filters?.markupPreview,
      includeOutput: !!this._state.filters?.codeOutput,
      findScope: this._state.filters?.findScope
    };
    ret = await this._notebookEditor.find(val, options, token);
    if (token.isCancellationRequested) {
      return null;
    }
    return ret;
  }
  _updateCurrentMatch(findMatches, currentMatchesPosition) {
    this._currentMatch = currentMatchesPosition % findMatches.length;
    this.set(findMatches, false);
    const nextIndex = this._findMatchesStarts.getIndexOf(this._currentMatch);
    this.highlightCurrentFindMatchDecoration(nextIndex.index, nextIndex.remainder);
    this._state.changeMatchInfo(
      this._currentMatch,
      this._findMatches.reduce((p, c) => p + c.length, 0),
      void 0
    );
  }
  _matchesCountBeforeIndex(findMatches, index) {
    let prevMatchesCount = 0;
    for (let i = 0; i < index; i++) {
      prevMatchesCount += findMatches[i].length;
    }
    return prevMatchesCount;
  }
  constructFindMatchesStarts() {
    if (this._findMatches && this._findMatches.length) {
      const values = new Uint32Array(this._findMatches.length);
      for (let i = 0; i < this._findMatches.length; i++) {
        values[i] = this._findMatches[i].length;
      }
      this._findMatchesStarts = new PrefixSumComputer(values);
    } else {
      this._findMatchesStarts = null;
    }
  }
  async highlightCurrentFindMatchDecoration(cellIndex, matchIndex) {
    const cell = this._findMatches[cellIndex].cell;
    const match = this._findMatches[cellIndex].getMatch(matchIndex);
    if (matchIndex < this._findMatches[cellIndex].contentMatches.length) {
      return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInCell(cell, match.range);
    } else {
      return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInWebview(cell, match.index);
    }
  }
  clear() {
    this._computePromise?.cancel();
    this._throttledDelayer.cancel();
    this.set([], false);
  }
  dispose() {
    this._findMatchDecorationModel.dispose();
    super.dispose();
  }
};
FindModel = __decorateClass([
  __decorateParam(2, IConfigurationService)
], FindModel);
export {
  CellFindMatchModel,
  FindModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxmaW5kXFxmaW5kTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBGaW5kTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFByZWZpeFN1bUNvbXB1dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC9wcmVmaXhTdW1Db21wdXRlci5qcyc7XG5pbXBvcnQgeyBGaW5kUmVwbGFjZVN0YXRlLCBGaW5kUmVwbGFjZVN0YXRlQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZEZpbHRlcnMgfSBmcm9tICcuL2ZpbmRGaWx0ZXJzLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaERlY29yYXRpb25Nb2RlbCB9IGZyb20gJy4vZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0U3RhdGUsIENlbGxGaW5kTWF0Y2hXaXRoSW5kZXgsIENlbGxXZWJ2aWV3RmluZE1hdGNoLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL25vdGVib29rVmlld01vZGVsSW1wbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgSU5vdGVib29rRmluZE9wdGlvbnMsIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIENlbGxGaW5kTWF0Y2hNb2RlbCBpbXBsZW1lbnRzIENlbGxGaW5kTWF0Y2hXaXRoSW5kZXgge1xuXHRyZWFkb25seSBjZWxsOiBJQ2VsbFZpZXdNb2RlbDtcblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cHJpdmF0ZSBfY29udGVudE1hdGNoZXM6IEZpbmRNYXRjaFtdO1xuXHRwcml2YXRlIF93ZWJ2aWV3TWF0Y2hlczogQ2VsbFdlYnZpZXdGaW5kTWF0Y2hbXTtcblx0Z2V0IGxlbmd0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudE1hdGNoZXMubGVuZ3RoICsgdGhpcy5fd2Vidmlld01hdGNoZXMubGVuZ3RoO1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRNYXRjaGVzKCk6IEZpbmRNYXRjaFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudE1hdGNoZXM7XG5cdH1cblxuXHRnZXQgd2Vidmlld01hdGNoZXMoKTogQ2VsbFdlYnZpZXdGaW5kTWF0Y2hbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dlYnZpZXdNYXRjaGVzO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIGNvbnRlbnRNYXRjaGVzOiBGaW5kTWF0Y2hbXSwgd2Vidmlld01hdGNoZXM6IENlbGxXZWJ2aWV3RmluZE1hdGNoW10pIHtcblx0XHR0aGlzLmNlbGwgPSBjZWxsO1xuXHRcdHRoaXMuaW5kZXggPSBpbmRleDtcblx0XHR0aGlzLl9jb250ZW50TWF0Y2hlcyA9IGNvbnRlbnRNYXRjaGVzO1xuXHRcdHRoaXMuX3dlYnZpZXdNYXRjaGVzID0gd2Vidmlld01hdGNoZXM7XG5cdH1cblxuXHRnZXRNYXRjaChpbmRleDogbnVtYmVyKSB7XG5cdFx0aWYgKGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdGVib29rQ2VsbEZpbmRNYXRjaDogaW5kZXggb3V0IG9mIHJhbmdlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKGluZGV4IDwgdGhpcy5fY29udGVudE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29udGVudE1hdGNoZXNbaW5kZXhdO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3TWF0Y2hlc1tpbmRleCAtIHRoaXMuX2NvbnRlbnRNYXRjaGVzLmxlbmd0aF07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbmRNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9maW5kTWF0Y2hlczogQ2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdID0gW107XG5cdHByb3RlY3RlZCBfZmluZE1hdGNoZXNTdGFydHM6IFByZWZpeFN1bUNvbXB1dGVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2N1cnJlbnRNYXRjaDogbnVtYmVyID0gLTE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGhyb3R0bGVkRGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBfY29tcHV0ZVByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXSB8IG51bGw+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbDogRmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsO1xuXG5cdGdldCBmaW5kTWF0Y2hlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZE1hdGNoZXM7XG5cdH1cblxuXHRnZXQgY3VycmVudE1hdGNoKCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50TWF0Y2g7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlOiBGaW5kUmVwbGFjZVN0YXRlPE5vdGVib29rRmluZEZpbHRlcnM+LFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdGhyb3R0bGVkRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyKDIwKSk7XG5cdFx0dGhpcy5fY29tcHV0ZVByb21pc2UgPSBudWxsO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3N0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUNlbGxTdGF0ZXMoZSk7XG5cblx0XHRcdGlmIChlLnNlYXJjaFN0cmluZyB8fCBlLmlzUmVnZXggfHwgZS5tYXRjaENhc2UgfHwgZS5zZWFyY2hTY29wZSB8fCBlLndob2xlV29yZCB8fCAoZS5pc1JldmVhbGVkICYmIHRoaXMuX3N0YXRlLmlzUmV2ZWFsZWQpIHx8IGUuZmlsdGVycyB8fCBlLmlzUmVwbGFjZVJldmVhbGVkKSB7XG5cdFx0XHRcdHRoaXMucmVzZWFyY2goKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuaXNSZXZlYWxlZCAmJiAhdGhpcy5fc3RhdGUuaXNSZXZlYWxlZCkge1xuXHRcdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbChlID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyTW9kZWxMaXN0ZW5lcihlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZUNlbGxTdGF0ZShlID0+IHtcblx0XHRcdGlmIChlLmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBlLnNvdXJjZS5lZGl0U3RhdGVDaGFuZ2VkKSB7XG5cdFx0XHRcdC8vIHJlc2VhcmNoIHdoZW4gbWFya2Rvd24gY2VsbCBpcyBzd2l0Y2hpbmcgYmV0d2VlbiBtYXJrZG93biBwcmV2aWV3IGFuZCBlZGl0aW5nIG1vZGUuXG5cdFx0XHRcdHRoaXMucmVzZWFyY2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJNb2RlbExpc3RlbmVyKHRoaXMuX25vdGVib29rRWRpdG9yLnRleHRNb2RlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsID0gbmV3IEZpbmRNYXRjaERlY29yYXRpb25Nb2RlbCh0aGlzLl9ub3RlYm9va0VkaXRvciwgdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0SWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDZWxsU3RhdGVzKGU6IEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQpIHtcblx0XHRpZiAoIXRoaXMuX3N0YXRlLmZpbHRlcnM/Lm1hcmt1cElucHV0IHx8ICF0aGlzLl9zdGF0ZS5maWx0ZXJzPy5tYXJrdXBQcmV2aWV3IHx8ICF0aGlzLl9zdGF0ZS5maWx0ZXJzPy5maW5kU2NvcGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyB3ZSBvbmx5IHVwZGF0ZSBjZWxsIHN0YXRlIGlmIHVzZXJzIGFyZSB1c2luZyB0aGUgaHlicmlkIG1vZGUgKGJvdGggaW5wdXQgYW5kIHByZXZpZXcgYXJlIGVuYWJsZWQpXG5cdFx0Y29uc3QgdXBkYXRlRWRpdGluZ1N0YXRlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0Vmlld01vZGVsKCkgYXMgTm90ZWJvb2tWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBzZWFyY2ggbWFya3VwIHNvdXJjZXMgZmlyc3QgdG8gZGVjaWRlIGlmIGEgbWFya3VwIGNlbGwgc2hvdWxkIGJlIGluIGVkaXRpbmcgbW9kZVxuXHRcdFx0Y29uc3Qgd29yZFNlcGFyYXRvcnMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZz4oJ2VkaXRvci53b3JkU2VwYXJhdG9ycycpLnZhbHVlO1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogSU5vdGVib29rRmluZE9wdGlvbnMgPSB7XG5cdFx0XHRcdHJlZ2V4OiB0aGlzLl9zdGF0ZS5pc1JlZ2V4LFxuXHRcdFx0XHR3aG9sZVdvcmQ6IHRoaXMuX3N0YXRlLndob2xlV29yZCxcblx0XHRcdFx0Y2FzZVNlbnNpdGl2ZTogdGhpcy5fc3RhdGUubWF0Y2hDYXNlLFxuXHRcdFx0XHR3b3JkU2VwYXJhdG9yczogd29yZFNlcGFyYXRvcnMsXG5cdFx0XHRcdGluY2x1ZGVNYXJrdXBJbnB1dDogdHJ1ZSxcblx0XHRcdFx0aW5jbHVkZUNvZGVJbnB1dDogZmFsc2UsXG5cdFx0XHRcdGluY2x1ZGVNYXJrdXBQcmV2aWV3OiBmYWxzZSxcblx0XHRcdFx0aW5jbHVkZU91dHB1dDogZmFsc2UsXG5cdFx0XHRcdGZpbmRTY29wZTogdGhpcy5fc3RhdGUuZmlsdGVycz8uZmluZFNjb3BlLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY29udGVudE1hdGNoZXMgPSB2aWV3TW9kZWwuZmluZCh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcsIG9wdGlvbnMpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2aWV3TW9kZWwubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHZpZXdNb2RlbC5jZWxsQXQoaSk7XG5cdFx0XHRcdGlmIChjZWxsICYmIGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHRcdGNvbnN0IGZvdW5kQ29udGVudE1hdGNoID0gY29udGVudE1hdGNoZXMuZmluZChtID0+IG0uY2VsbC5oYW5kbGUgPT09IGNlbGwuaGFuZGxlICYmIG0uY29udGVudE1hdGNoZXMubGVuZ3RoID4gMCk7XG5cdFx0XHRcdFx0Y29uc3QgdGFyZ2V0U3RhdGUgPSBmb3VuZENvbnRlbnRNYXRjaCA/IENlbGxFZGl0U3RhdGUuRWRpdGluZyA6IENlbGxFZGl0U3RhdGUuUHJldmlldztcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50RWRpdGluZ1N0YXRlID0gY2VsbC5nZXRFZGl0U3RhdGUoKTtcblxuXHRcdFx0XHRcdGlmIChjdXJyZW50RWRpdGluZ1N0YXRlID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcgJiYgY2VsbC5lZGl0U3RhdGVTb3VyY2UgIT09ICdmaW5kJykge1xuXHRcdFx0XHRcdFx0Ly8gaXQncyBhbHJlYWR5IGluIGVkaXRpbmcgbW9kZSwgd2Ugc2hvdWxkIG5vdCB1cGRhdGVcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY3VycmVudEVkaXRpbmdTdGF0ZSAhPT0gdGFyZ2V0U3RhdGUpIHtcblx0XHRcdFx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKHRhcmdldFN0YXRlLCAnZmluZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblxuXHRcdGlmIChlLmlzUmVwbGFjZVJldmVhbGVkICYmICF0aGlzLl9zdGF0ZS5pc1JlcGxhY2VSZXZlYWxlZCkge1xuXHRcdFx0Ly8gcmVwbGFjZSBpcyBoaWRkZW4sIHdlIG5lZWQgdG8gc3dpdGNoIGFsbCBtYXJrZG93biBjZWxscyB0byBwcmV2aWV3IG1vZGVcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpIGFzIE5vdGVib29rVmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpZXdNb2RlbC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdmlld01vZGVsLmNlbGxBdChpKTtcblx0XHRcdFx0aWYgKGNlbGwgJiYgY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0XHRcdFx0aWYgKGNlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZyAmJiBjZWxsLmVkaXRTdGF0ZVNvdXJjZSA9PT0gJ2ZpbmQnKSB7XG5cdFx0XHRcdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLlByZXZpZXcsICdmaW5kJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZS5pc1JlcGxhY2VSZXZlYWxlZCkge1xuXHRcdFx0dXBkYXRlRWRpdGluZ1N0YXRlKCk7XG5cdFx0fSBlbHNlIGlmICgoZS5maWx0ZXJzIHx8IGUuaXNSZXZlYWxlZCB8fCBlLnNlYXJjaFN0cmluZyB8fCBlLnJlcGxhY2VTdHJpbmcpICYmIHRoaXMuX3N0YXRlLmlzUmV2ZWFsZWQgJiYgdGhpcy5fc3RhdGUuaXNSZXBsYWNlUmV2ZWFsZWQpIHtcblx0XHRcdHVwZGF0ZUVkaXRpbmdTdGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdGVuc3VyZUZpbmRNYXRjaGVzKCkge1xuXHRcdGlmICghdGhpcy5fZmluZE1hdGNoZXNTdGFydHMpIHtcblx0XHRcdHRoaXMuc2V0KHRoaXMuX2ZpbmRNYXRjaGVzLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRnZXRDdXJyZW50TWF0Y2goKSB7XG5cdFx0Y29uc3QgbmV4dEluZGV4ID0gdGhpcy5fZmluZE1hdGNoZXNTdGFydHMhLmdldEluZGV4T2YodGhpcy5fY3VycmVudE1hdGNoKTtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fZmluZE1hdGNoZXNbbmV4dEluZGV4LmluZGV4XS5jZWxsO1xuXHRcdGNvbnN0IG1hdGNoID0gdGhpcy5fZmluZE1hdGNoZXNbbmV4dEluZGV4LmluZGV4XS5nZXRNYXRjaChuZXh0SW5kZXgucmVtYWluZGVyKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjZWxsLFxuXHRcdFx0bWF0Y2gsXG5cdFx0XHRpc01vZGVsTWF0Y2g6IG5leHRJbmRleC5yZW1haW5kZXIgPCB0aGlzLl9maW5kTWF0Y2hlc1tuZXh0SW5kZXguaW5kZXhdLmNvbnRlbnRNYXRjaGVzLmxlbmd0aFxuXHRcdH07XG5cdH1cblxuXHRyZWZyZXNoQ3VycmVudE1hdGNoKGZvY3VzOiB7IGNlbGw6IElDZWxsVmlld01vZGVsOyByYW5nZTogUmFuZ2UgfSkge1xuXHRcdGNvbnN0IGZpbmRNYXRjaEluZGV4ID0gdGhpcy5maW5kTWF0Y2hlcy5maW5kSW5kZXgobWF0Y2ggPT4gbWF0Y2guY2VsbCA9PT0gZm9jdXMuY2VsbCk7XG5cblx0XHRpZiAoZmluZE1hdGNoSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmluZE1hdGNoID0gdGhpcy5maW5kTWF0Y2hlc1tmaW5kTWF0Y2hJbmRleF07XG5cdFx0Y29uc3QgaW5kZXggPSBmaW5kTWF0Y2guY29udGVudE1hdGNoZXMuZmluZEluZGV4KG1hdGNoID0+IG1hdGNoLnJhbmdlLmludGVyc2VjdFJhbmdlcyhmb2N1cy5yYW5nZSkgIT09IG51bGwpO1xuXG5cdFx0aWYgKGluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaGVzQmVmb3JlID0gZmluZE1hdGNoSW5kZXggPT09IDAgPyAwIDogKHRoaXMuX2ZpbmRNYXRjaGVzU3RhcnRzPy5nZXRQcmVmaXhTdW0oZmluZE1hdGNoSW5kZXggLSAxKSA/PyAwKTtcblx0XHR0aGlzLl9jdXJyZW50TWF0Y2ggPSBtYXRjaGVzQmVmb3JlICsgaW5kZXg7XG5cblx0XHR0aGlzLmhpZ2hsaWdodEN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uKGZpbmRNYXRjaEluZGV4LCBpbmRleCkudGhlbihhc3luYyBvZmZzZXQgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxDZWxsUmFuZ2UoZmluZE1hdGNoSW5kZXgsIGluZGV4LCBvZmZzZXQpO1xuXG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2VNYXRjaEluZm8oXG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCxcblx0XHRcdFx0dGhpcy5fZmluZE1hdGNoZXMucmVkdWNlKChwLCBjKSA9PiBwICsgYy5sZW5ndGgsIDApLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRmaW5kKG9wdGlvbjogeyBwcmV2aW91czogYm9vbGVhbiB9IHwgeyBpbmRleDogbnVtYmVyIH0pIHtcblx0XHRpZiAoIXRoaXMuZmluZE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gbGV0IGN1cnJDZWxsO1xuXHRcdGlmICghdGhpcy5fZmluZE1hdGNoZXNTdGFydHMpIHtcblx0XHRcdHRoaXMuc2V0KHRoaXMuX2ZpbmRNYXRjaGVzLCB0cnVlKTtcblx0XHRcdGlmIChoYXNLZXkob3B0aW9uLCB7IGluZGV4OiB0cnVlIH0pKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCA9IG9wdGlvbi5pbmRleDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gY29uc3QgY3VyckluZGV4ID0gdGhpcy5fZmluZE1hdGNoZXNTdGFydHMhLmdldEluZGV4T2YodGhpcy5fY3VycmVudE1hdGNoKTtcblx0XHRcdC8vIGN1cnJDZWxsID0gdGhpcy5fZmluZE1hdGNoZXNbY3VyckluZGV4LmluZGV4XS5jZWxsO1xuXHRcdFx0Y29uc3QgdG90YWxWYWwgPSB0aGlzLl9maW5kTWF0Y2hlc1N0YXJ0cy5nZXRUb3RhbFN1bSgpO1xuXHRcdFx0aWYgKGhhc0tleShvcHRpb24sIHsgaW5kZXg6IHRydWUgfSkpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudE1hdGNoID0gb3B0aW9uLmluZGV4O1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAodGhpcy5fY3VycmVudE1hdGNoID09PSAtMSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50TWF0Y2ggPSBvcHRpb24ucHJldmlvdXMgPyB0b3RhbFZhbCAtIDEgOiAwO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbmV4dFZhbCA9ICh0aGlzLl9jdXJyZW50TWF0Y2ggKyAob3B0aW9uLnByZXZpb3VzID8gLTEgOiAxKSArIHRvdGFsVmFsKSAlIHRvdGFsVmFsO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50TWF0Y2ggPSBuZXh0VmFsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG5leHRJbmRleCA9IHRoaXMuX2ZpbmRNYXRjaGVzU3RhcnRzIS5nZXRJbmRleE9mKHRoaXMuX2N1cnJlbnRNYXRjaCk7XG5cdFx0Ly8gY29uc3QgbmV3Rm9jdXNlZENlbGwgPSB0aGlzLl9maW5kTWF0Y2hlc1tuZXh0SW5kZXguaW5kZXhdLmNlbGw7XG5cdFx0dGhpcy5oaWdobGlnaHRDdXJyZW50RmluZE1hdGNoRGVjb3JhdGlvbihuZXh0SW5kZXguaW5kZXgsIG5leHRJbmRleC5yZW1haW5kZXIpLnRoZW4oYXN5bmMgb2Zmc2V0ID0+IHtcblx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsQ2VsbFJhbmdlKG5leHRJbmRleC5pbmRleCwgbmV4dEluZGV4LnJlbWFpbmRlciwgb2Zmc2V0KTtcblxuXHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlTWF0Y2hJbmZvKFxuXHRcdFx0XHR0aGlzLl9jdXJyZW50TWF0Y2gsXG5cdFx0XHRcdHRoaXMuX2ZpbmRNYXRjaGVzLnJlZHVjZSgocCwgYykgPT4gcCArIGMubGVuZ3RoLCAwKSxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXZlYWxDZWxsUmFuZ2UoY2VsbEluZGV4OiBudW1iZXIsIG1hdGNoSW5kZXg6IG51bWJlciwgb3V0cHV0T2Zmc2V0OiBudW1iZXIgfCBudWxsKSB7XG5cdFx0Y29uc3QgZmluZE1hdGNoID0gdGhpcy5fZmluZE1hdGNoZXNbY2VsbEluZGV4XTtcblx0XHRpZiAobWF0Y2hJbmRleCA+PSBmaW5kTWF0Y2guY29udGVudE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHQvLyByZXZlYWwgb3V0cHV0IHJhbmdlXG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5mb2N1c0VsZW1lbnQoZmluZE1hdGNoLmNlbGwpO1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoZmluZE1hdGNoLmNlbGwpO1xuXHRcdFx0aWYgKGluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gY29uc3QgcmFuZ2U6IElDZWxsUmFuZ2UgPSB7IHN0YXJ0OiBpbmRleCwgZW5kOiBpbmRleCArIDEgfTtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IucmV2ZWFsQ2VsbE9mZnNldEluQ2VudGVyKGZpbmRNYXRjaC5jZWxsLCBvdXRwdXRPZmZzZXQgPz8gMCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1hdGNoID0gZmluZE1hdGNoLmdldE1hdGNoKG1hdGNoSW5kZXgpIGFzIEZpbmRNYXRjaDtcblx0XHRcdGlmIChmaW5kTWF0Y2guY2VsbC5nZXRFZGl0U3RhdGUoKSAhPT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nKSB7XG5cdFx0XHRcdGZpbmRNYXRjaC5jZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLkVkaXRpbmcsICdmaW5kJyk7XG5cdFx0XHR9XG5cdFx0XHRmaW5kTWF0Y2guY2VsbC5pc0lucHV0Q29sbGFwc2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5mb2N1c0VsZW1lbnQoZmluZE1hdGNoLmNlbGwpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3Iuc2V0Q2VsbEVkaXRvclNlbGVjdGlvbihmaW5kTWF0Y2guY2VsbCwgbWF0Y2gucmFuZ2UpO1xuXHRcdFx0Ly8gRmlyc3QgZW5zdXJlIHRoZSBjZWxsIGlzIHZpc2libGUgaW4gdGhlIG5vdGVib29rIHZpZXdwb3J0XG5cdFx0XHRhd2FpdCB0aGlzLl9ub3RlYm9va0VkaXRvci5yZXZlYWxJblZpZXcoZmluZE1hdGNoLmNlbGwpO1xuXHRcdFx0Ly8gVGhlbiByZXZlYWwgdGhlIHNwZWNpZmljIHJhbmdlIHdpdGhpbiB0aGUgY2VsbCBlZGl0b3Jcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydEFzeW5jKGZpbmRNYXRjaC5jZWxsLCBtYXRjaC5yYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJNb2RlbExpc3RlbmVyKG5vdGVib29rVGV4dE1vZGVsPzogTm90ZWJvb2tUZXh0TW9kZWwpIHtcblx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdGlmIChub3RlYm9va1RleHRNb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlLmFkZChub3RlYm9va1RleHRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0aWYgKCFlLnJhd0V2ZW50cy5zb21lKGV2ZW50ID0+IGV2ZW50LmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxDb250ZW50IHx8IGV2ZW50LmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucmVzZWFyY2goKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlc2VhcmNoKCk7XG5cdH1cblxuXHRhc3luYyByZXNlYXJjaCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdGhyb3R0bGVkRGVsYXllci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGlzU2VhcmNoaW5nOiB0cnVlIH0sIGZhbHNlKTtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc2VhcmNoKCk7XG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBpc1NlYXJjaGluZzogZmFsc2UgfSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgX3Jlc2VhcmNoKCkge1xuXHRcdHRoaXMuX2NvbXB1dGVQcm9taXNlPy5jYW5jZWwoKTtcblxuXHRcdGlmICghdGhpcy5fc3RhdGUuaXNSZXZlYWxlZCB8fCAhdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5zZXQoW10sIGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb21wdXRlUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRoaXMuX2NvbXB1dGUodG9rZW4pKTtcblxuXHRcdGNvbnN0IGZpbmRNYXRjaGVzID0gYXdhaXQgdGhpcy5fY29tcHV0ZVByb21pc2U7XG5cdFx0aWYgKCFmaW5kTWF0Y2hlcykge1xuXHRcdFx0dGhpcy5zZXQoW10sIGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZmluZE1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnNldChbXSwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbmRGaXJzdE1hdGNoQWZ0ZXJDZWxsSW5kZXggPSAoY2VsbEluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IG1hdGNoQWZ0ZXJTZWxlY3Rpb24gPSBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4oZmluZE1hdGNoZXMubWFwKG1hdGNoID0+IG1hdGNoLmluZGV4KSwgaW5kZXggPT4gaW5kZXggPj0gY2VsbEluZGV4KTtcblx0XHRcdHRoaXMuX3VwZGF0ZUN1cnJlbnRNYXRjaChmaW5kTWF0Y2hlcywgdGhpcy5fbWF0Y2hlc0NvdW50QmVmb3JlSW5kZXgoZmluZE1hdGNoZXMsIG1hdGNoQWZ0ZXJTZWxlY3Rpb24pKTtcblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRNYXRjaCA9PT0gLTEpIHtcblx0XHRcdC8vIG5vIGFjdGl2ZSBjdXJyZW50IG1hdGNoXG5cdFx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0TGVuZ3RoKCkgPT09IDApIHtcblx0XHRcdFx0dGhpcy5zZXQoZmluZE1hdGNoZXMsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZm9jdXMgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRGb2N1cygpLnN0YXJ0O1xuXHRcdFx0XHRmaW5kRmlyc3RNYXRjaEFmdGVyQ2VsbEluZGV4KGZvY3VzKTtcblx0XHRcdFx0dGhpcy5zZXQoZmluZE1hdGNoZXMsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG9sZEN1cnJJbmRleCA9IHRoaXMuX2ZpbmRNYXRjaGVzU3RhcnRzIS5nZXRJbmRleE9mKHRoaXMuX2N1cnJlbnRNYXRjaCk7XG5cdFx0Y29uc3Qgb2xkQ3VyckNlbGwgPSB0aGlzLl9maW5kTWF0Y2hlc1tvbGRDdXJySW5kZXguaW5kZXhdLmNlbGw7XG5cdFx0Y29uc3Qgb2xkQ3Vyck1hdGNoQ2VsbEluZGV4ID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KG9sZEN1cnJDZWxsKTtcblxuXG5cdFx0aWYgKG9sZEN1cnJNYXRjaENlbGxJbmRleCA8IDApIHtcblx0XHRcdC8vIHRoZSBjZWxsIGNvbnRhaW5pbmcgdGhlIGFjdGl2ZSBtYXRjaCBpcyBkZWxldGVkXG5cdFx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0TGVuZ3RoKCkgPT09IDApIHtcblx0XHRcdFx0dGhpcy5zZXQoZmluZE1hdGNoZXMsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmaW5kRmlyc3RNYXRjaEFmdGVyQ2VsbEluZGV4KG9sZEN1cnJNYXRjaENlbGxJbmRleCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gdGhlIGNlbGwgc3RpbGwgZXhpc3Rcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuY2VsbEF0KG9sZEN1cnJNYXRjaENlbGxJbmRleCk7XG5cdFx0Ly8gd2Ugd2lsbCB0cnkgcmVzdG9yZSB0aGUgYWN0aXZlIGZpbmQgbWF0Y2ggaW4gdGhpcyBjZWxsLCBpZiBpdCBjb250YWlucyBhbnkgZmluZCBtYXRjaFxuXG5cdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBjZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLlByZXZpZXcpIHtcblx0XHRcdC8vIGZpbmQgZmlyc3QgbWF0Y2ggaW4gdGhpcyBjZWxsIG9yIGJlbG93XG5cdFx0XHRmaW5kRmlyc3RNYXRjaEFmdGVyQ2VsbEluZGV4KG9sZEN1cnJNYXRjaENlbGxJbmRleCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gdGhlIGNlbGwgaXMgYSBtYXJrdXAgY2VsbCBpbiBlZGl0aW5nIG1vZGUgb3IgYSBjb2RlIGNlbGwsIGJvdGggc2hvdWxkIGhhdmUgbW9uYWNvIGVkaXRvciByZW5kZXJlZFxuXG5cdFx0aWYgKCF0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwuY3VycmVudE1hdGNoRGVjb3JhdGlvbnMpIHtcblx0XHRcdC8vIG5vIGN1cnJlbnQgaGlnaGxpZ2h0IGRlY29yYXRpb25cblx0XHRcdGZpbmRGaXJzdE1hdGNoQWZ0ZXJDZWxsSW5kZXgob2xkQ3Vyck1hdGNoQ2VsbEluZGV4KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBjaGVjayBpZiB0aGVyZSBpcyBtb25hY28gZWRpdG9yIHNlbGVjdGlvbiBhbmQgZmluZCB0aGUgZmlyc3QgbWF0Y2gsIG90aGVyd2lzZSBmaW5kIHRoZSBmaXJzdCBtYXRjaCBhYm92ZSBjdXJyZW50IGNlbGxcblx0XHQvLyB0aGlzLl9maW5kTWF0Y2hlc1tjZWxsSW5kZXhdLm1hdGNoZXNbbWF0Y2hJbmRleF0ucmFuZ2Vcblx0XHRpZiAodGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLmN1cnJlbnRNYXRjaERlY29yYXRpb25zLmtpbmQgPT09ICdpbnB1dCcpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRNYXRjaERlY29yYXRpb25JZCA9IHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5jdXJyZW50TWF0Y2hEZWNvcmF0aW9ucy5kZWNvcmF0aW9ucy5maW5kKGRlY29yYXRpb24gPT4gZGVjb3JhdGlvbi5vd25lcklkID09PSBjZWxsLmhhbmRsZSk7XG5cblx0XHRcdGlmICghY3VycmVudE1hdGNoRGVjb3JhdGlvbklkKSB7XG5cdFx0XHRcdC8vIGN1cnJlbnQgbWF0Y2ggZGVjb3JhdGlvbiBpcyBubyBsb25nZXIgdmFsaWRcblx0XHRcdFx0ZmluZEZpcnN0TWF0Y2hBZnRlckNlbGxJbmRleChvbGRDdXJyTWF0Y2hDZWxsSW5kZXgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hdGNoQWZ0ZXJTZWxlY3Rpb24gPSBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4oZmluZE1hdGNoZXMsIG1hdGNoID0+IG1hdGNoLmluZGV4ID49IG9sZEN1cnJNYXRjaENlbGxJbmRleCkgJSBmaW5kTWF0Y2hlcy5sZW5ndGg7XG5cdFx0XHRpZiAoZmluZE1hdGNoZXNbbWF0Y2hBZnRlclNlbGVjdGlvbl0uaW5kZXggPiBvbGRDdXJyTWF0Y2hDZWxsSW5kZXgpIHtcblx0XHRcdFx0Ly8gdGhlcmUgaXMgbm8gc2VhcmNoIHJlc3VsdCBpbiBjdXJyIGNlbGwgYW55bW9yZSwgZmluZCB0aGUgbmVhcmVzdCBvbmUgKGZyb20gdG9wIHRvIGJvdHRvbSlcblx0XHRcdFx0dGhpcy5fdXBkYXRlQ3VycmVudE1hdGNoKGZpbmRNYXRjaGVzLCB0aGlzLl9tYXRjaGVzQ291bnRCZWZvcmVJbmRleChmaW5kTWF0Y2hlcywgbWF0Y2hBZnRlclNlbGVjdGlvbikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB0aGVyZSBhcmUgc3RpbGwgc29tZSBzZWFyY2ggcmVzdWx0cyBpbiBjdXJyZW50IGNlbGxcblx0XHRcdFx0bGV0IGN1cnJNYXRjaFJhbmdlSW5FZGl0b3IgPSBjZWxsLmVkaXRvckF0dGFjaGVkICYmIGN1cnJlbnRNYXRjaERlY29yYXRpb25JZC5kZWNvcmF0aW9uc1swXSA/IGNlbGwuZ2V0Q2VsbERlY29yYXRpb25SYW5nZShjdXJyZW50TWF0Y2hEZWNvcmF0aW9uSWQuZGVjb3JhdGlvbnNbMF0pIDogbnVsbDtcblxuXHRcdFx0XHRpZiAoY3Vyck1hdGNoUmFuZ2VJbkVkaXRvciA9PT0gbnVsbCAmJiBvbGRDdXJySW5kZXgucmVtYWluZGVyIDwgdGhpcy5fZmluZE1hdGNoZXNbb2xkQ3VyckluZGV4LmluZGV4XS5jb250ZW50TWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjdXJyTWF0Y2hSYW5nZUluRWRpdG9yID0gKHRoaXMuX2ZpbmRNYXRjaGVzW29sZEN1cnJJbmRleC5pbmRleF0uZ2V0TWF0Y2gob2xkQ3VyckluZGV4LnJlbWFpbmRlcikgYXMgRmluZE1hdGNoKS5yYW5nZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyTWF0Y2hSYW5nZUluRWRpdG9yICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0Ly8gd2UgZmluZCBhIHJhbmdlIGZvciB0aGUgcHJldmlvdXMgY3VycmVudCBtYXRjaCwgbGV0J3MgZmluZCB0aGUgbmVhcmVzdCBvbmUgYWZ0ZXIgaXQgKGNhbiBvdmVybGFwKVxuXHRcdFx0XHRcdGNvbnN0IGNlbGxNYXRjaCA9IGZpbmRNYXRjaGVzW21hdGNoQWZ0ZXJTZWxlY3Rpb25dO1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoQWZ0ZXJPbGRTZWxlY3Rpb24gPSBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4oY2VsbE1hdGNoLmNvbnRlbnRNYXRjaGVzLCBtYXRjaCA9PiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoKG1hdGNoIGFzIEZpbmRNYXRjaCkucmFuZ2UsIGN1cnJNYXRjaFJhbmdlSW5FZGl0b3IpID49IDApO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUN1cnJlbnRNYXRjaChmaW5kTWF0Y2hlcywgdGhpcy5fbWF0Y2hlc0NvdW50QmVmb3JlSW5kZXgoZmluZE1hdGNoZXMsIG1hdGNoQWZ0ZXJTZWxlY3Rpb24pICsgbWF0Y2hBZnRlck9sZFNlbGVjdGlvbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbm8gcmFuZ2UgZm91bmQsIGxldCdzIGZhbGwgYmFjayB0byBmaW5kaW5nIHRoZSBuZWFyZXN0IG1hdGNoXG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlQ3VycmVudE1hdGNoKGZpbmRNYXRjaGVzLCB0aGlzLl9tYXRjaGVzQ291bnRCZWZvcmVJbmRleChmaW5kTWF0Y2hlcywgbWF0Y2hBZnRlclNlbGVjdGlvbikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBvdXRwdXQgbm93IGhhcyB0aGUgaGlnaGxpZ2h0XG5cdFx0XHRjb25zdCBtYXRjaEFmdGVyU2VsZWN0aW9uID0gZmluZEZpcnN0SWR4TW9ub3Rvbm91c09yQXJyTGVuKGZpbmRNYXRjaGVzLm1hcChtYXRjaCA9PiBtYXRjaC5pbmRleCksIGluZGV4ID0+IGluZGV4ID49IG9sZEN1cnJNYXRjaENlbGxJbmRleCkgJSBmaW5kTWF0Y2hlcy5sZW5ndGg7XG5cdFx0XHR0aGlzLl91cGRhdGVDdXJyZW50TWF0Y2goZmluZE1hdGNoZXMsIHRoaXMuX21hdGNoZXNDb3VudEJlZm9yZUluZGV4KGZpbmRNYXRjaGVzLCBtYXRjaEFmdGVyU2VsZWN0aW9uKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXQoY2VsbEZpbmRNYXRjaGVzOiBDZWxsRmluZE1hdGNoV2l0aEluZGV4W10gfCBudWxsLCBhdXRvU3RhcnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIWNlbGxGaW5kTWF0Y2hlcyB8fCAhY2VsbEZpbmRNYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fZmluZE1hdGNoZXMgPSBbXTtcblx0XHRcdHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5zZXRBbGxGaW5kTWF0Y2hlc0RlY29yYXRpb25zKFtdKTtcblxuXHRcdFx0dGhpcy5jb25zdHJ1Y3RGaW5kTWF0Y2hlc1N0YXJ0cygpO1xuXHRcdFx0dGhpcy5fY3VycmVudE1hdGNoID0gLTE7XG5cdFx0XHR0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwuY2xlYXJDdXJyZW50RmluZE1hdGNoRGVjb3JhdGlvbigpO1xuXG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2VNYXRjaEluZm8oXG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCxcblx0XHRcdFx0dGhpcy5fZmluZE1hdGNoZXMucmVkdWNlKChwLCBjKSA9PiBwICsgYy5sZW5ndGgsIDApLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gYWxsIG1hdGNoZXNcblx0XHR0aGlzLl9maW5kTWF0Y2hlcyA9IGNlbGxGaW5kTWF0Y2hlcztcblx0XHR0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwuc2V0QWxsRmluZE1hdGNoZXNEZWNvcmF0aW9ucyhjZWxsRmluZE1hdGNoZXMgfHwgW10pO1xuXG5cdFx0Ly8gY3VycmVudCBtYXRjaFxuXHRcdHRoaXMuY29uc3RydWN0RmluZE1hdGNoZXNTdGFydHMoKTtcblxuXHRcdGlmIChhdXRvU3RhcnQpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCA9IDA7XG5cdFx0XHR0aGlzLmhpZ2hsaWdodEN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uKDAsIDApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZU1hdGNoSW5mbyhcblx0XHRcdHRoaXMuX2N1cnJlbnRNYXRjaCxcblx0XHRcdHRoaXMuX2ZpbmRNYXRjaGVzLnJlZHVjZSgocCwgYykgPT4gcCArIGMubGVuZ3RoLCAwKSxcblx0XHRcdHVuZGVmaW5lZFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Q2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdIHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGxldCByZXQ6IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXSB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IHZhbCA9IHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZztcblx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nPignZWRpdG9yLndvcmRTZXBhcmF0b3JzJykudmFsdWU7XG5cblx0XHRjb25zdCBvcHRpb25zOiBJTm90ZWJvb2tGaW5kT3B0aW9ucyA9IHtcblx0XHRcdHJlZ2V4OiB0aGlzLl9zdGF0ZS5pc1JlZ2V4LFxuXHRcdFx0d2hvbGVXb3JkOiB0aGlzLl9zdGF0ZS53aG9sZVdvcmQsXG5cdFx0XHRjYXNlU2Vuc2l0aXZlOiB0aGlzLl9zdGF0ZS5tYXRjaENhc2UsXG5cdFx0XHR3b3JkU2VwYXJhdG9yczogd29yZFNlcGFyYXRvcnMsXG5cdFx0XHRpbmNsdWRlTWFya3VwSW5wdXQ6IHRoaXMuX3N0YXRlLmZpbHRlcnM/Lm1hcmt1cElucHV0ID8/IHRydWUsXG5cdFx0XHRpbmNsdWRlQ29kZUlucHV0OiB0aGlzLl9zdGF0ZS5maWx0ZXJzPy5jb2RlSW5wdXQgPz8gdHJ1ZSxcblx0XHRcdGluY2x1ZGVNYXJrdXBQcmV2aWV3OiAhIXRoaXMuX3N0YXRlLmZpbHRlcnM/Lm1hcmt1cFByZXZpZXcsXG5cdFx0XHRpbmNsdWRlT3V0cHV0OiAhIXRoaXMuX3N0YXRlLmZpbHRlcnM/LmNvZGVPdXRwdXQsXG5cdFx0XHRmaW5kU2NvcGU6IHRoaXMuX3N0YXRlLmZpbHRlcnM/LmZpbmRTY29wZSxcblx0XHR9O1xuXG5cdFx0cmV0ID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tFZGl0b3IuZmluZCh2YWwsIG9wdGlvbnMsIHRva2VuKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUN1cnJlbnRNYXRjaChmaW5kTWF0Y2hlczogQ2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdLCBjdXJyZW50TWF0Y2hlc1Bvc2l0aW9uOiBudW1iZXIpIHtcblx0XHR0aGlzLl9jdXJyZW50TWF0Y2ggPSBjdXJyZW50TWF0Y2hlc1Bvc2l0aW9uICUgZmluZE1hdGNoZXMubGVuZ3RoO1xuXHRcdHRoaXMuc2V0KGZpbmRNYXRjaGVzLCBmYWxzZSk7XG5cdFx0Y29uc3QgbmV4dEluZGV4ID0gdGhpcy5fZmluZE1hdGNoZXNTdGFydHMhLmdldEluZGV4T2YodGhpcy5fY3VycmVudE1hdGNoKTtcblx0XHR0aGlzLmhpZ2hsaWdodEN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uKG5leHRJbmRleC5pbmRleCwgbmV4dEluZGV4LnJlbWFpbmRlcik7XG5cblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2VNYXRjaEluZm8oXG5cdFx0XHR0aGlzLl9jdXJyZW50TWF0Y2gsXG5cdFx0XHR0aGlzLl9maW5kTWF0Y2hlcy5yZWR1Y2UoKHAsIGMpID0+IHAgKyBjLmxlbmd0aCwgMCksXG5cdFx0XHR1bmRlZmluZWRcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hlc0NvdW50QmVmb3JlSW5kZXgoZmluZE1hdGNoZXM6IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXSwgaW5kZXg6IG51bWJlcikge1xuXHRcdGxldCBwcmV2TWF0Y2hlc0NvdW50ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGluZGV4OyBpKyspIHtcblx0XHRcdHByZXZNYXRjaGVzQ291bnQgKz0gZmluZE1hdGNoZXNbaV0ubGVuZ3RoO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcmV2TWF0Y2hlc0NvdW50O1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RGaW5kTWF0Y2hlc1N0YXJ0cygpIHtcblx0XHRpZiAodGhpcy5fZmluZE1hdGNoZXMgJiYgdGhpcy5fZmluZE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBuZXcgVWludDMyQXJyYXkodGhpcy5fZmluZE1hdGNoZXMubGVuZ3RoKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZmluZE1hdGNoZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0dmFsdWVzW2ldID0gdGhpcy5fZmluZE1hdGNoZXNbaV0ubGVuZ3RoO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9maW5kTWF0Y2hlc1N0YXJ0cyA9IG5ldyBQcmVmaXhTdW1Db21wdXRlcih2YWx1ZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9maW5kTWF0Y2hlc1N0YXJ0cyA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIGhpZ2hsaWdodEN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uKGNlbGxJbmRleDogbnVtYmVyLCBtYXRjaEluZGV4OiBudW1iZXIpOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fZmluZE1hdGNoZXNbY2VsbEluZGV4XS5jZWxsO1xuXHRcdGNvbnN0IG1hdGNoID0gdGhpcy5fZmluZE1hdGNoZXNbY2VsbEluZGV4XS5nZXRNYXRjaChtYXRjaEluZGV4KTtcblxuXHRcdGlmIChtYXRjaEluZGV4IDwgdGhpcy5fZmluZE1hdGNoZXNbY2VsbEluZGV4XS5jb250ZW50TWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9maW5kTWF0Y2hEZWNvcmF0aW9uTW9kZWwuaGlnaGxpZ2h0Q3VycmVudEZpbmRNYXRjaERlY29yYXRpb25JbkNlbGwoY2VsbCwgKG1hdGNoIGFzIEZpbmRNYXRjaCkucmFuZ2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLmhpZ2hsaWdodEN1cnJlbnRGaW5kTWF0Y2hEZWNvcmF0aW9uSW5XZWJ2aWV3KGNlbGwsIChtYXRjaCBhcyBDZWxsV2Vidmlld0ZpbmRNYXRjaCkuaW5kZXgpO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCkge1xuXHRcdHRoaXMuX2NvbXB1dGVQcm9taXNlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl90aHJvdHRsZWREZWxheWVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuc2V0KFtdLCBmYWxzZSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2ZpbmRNYXRjaERlY29yYXRpb25Nb2RlbC5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0NBQXNDO0FBQy9DLFNBQTRCLHlCQUF5QixlQUFlO0FBRXBFLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxhQUFhO0FBRXRCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsNkJBQTZC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
