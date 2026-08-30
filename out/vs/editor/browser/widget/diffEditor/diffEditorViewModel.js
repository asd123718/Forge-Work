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
import { rejectIfNotCanceled, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableSignal, observableSignalFromEvent, observableValue, transaction, waitForState } from "../../../../base/common/observable.js";
import { IDiffProviderFactoryService } from "./diffProviderFactoryService.js";
import { filterWithPrevious } from "./utils.js";
import { readHotReloadableExport } from "../../../../base/common/hotReloadHelpers.js";
import { LineRange, LineRangeSet } from "../../../common/core/ranges/lineRange.js";
import { DefaultLinesDiffComputer } from "../../../common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js";
import { DetailedLineRangeMapping, LineRangeMapping, RangeMapping } from "../../../common/diff/rangeMapping.js";
import { TextEditInfo } from "../../../common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper.js";
import { combineTextEditInfos } from "../../../common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos.js";
import { optimizeSequenceDiffs } from "../../../common/diff/defaultLinesDiffComputer/heuristicSequenceOptimizations.js";
import { isDefined } from "../../../../base/common/types.js";
import { groupAdjacentBy } from "../../../../base/common/arrays.js";
import { softAssert } from "../../../../base/common/assert.js";
let DiffEditorViewModel = class extends Disposable {
  constructor(model, _options, _diffProviderFactoryService) {
    super();
    this.model = model;
    this._options = _options;
    this._diffProviderFactoryService = _diffProviderFactoryService;
    this._isDiffUpToDate = observableValue(this, false);
    this.isDiffUpToDate = this._isDiffUpToDate;
    this._diff = observableValue(this, void 0);
    this.diff = this._diff;
    this._unchangedRegions = observableValue(this, void 0);
    this.unchangedRegions = derived(
      this,
      (r) => {
        if (this._options.hideUnchangedRegions.read(r)) {
          return this._unchangedRegions.read(r)?.regions ?? [];
        } else {
          transaction((tx) => {
            for (const r2 of this._unchangedRegions.read(void 0)?.regions || []) {
              r2.collapseAll(tx);
            }
          });
          return [];
        }
      }
    );
    this.movedTextToCompare = observableValue(this, void 0);
    this._activeMovedText = observableValue(this, void 0);
    this._hoveredMovedText = observableValue(this, void 0);
    this.activeMovedText = derived(this, (r) => this.movedTextToCompare.read(r) ?? this._hoveredMovedText.read(r) ?? this._activeMovedText.read(r));
    this._cancellationTokenSource = new CancellationTokenSource();
    this._diffProvider = derived(this, (reader) => {
      const diffProvider = this._diffProviderFactoryService.createDiffProvider({
        diffAlgorithm: this._options.diffAlgorithm.read(reader)
      });
      const onChangeSignal = observableSignalFromEvent("onDidChange", diffProvider.onDidChange);
      return {
        diffProvider,
        onChangeSignal
      };
    });
    this._register(toDisposable(() => this._cancellationTokenSource.cancel()));
    const contentChangedSignal = observableSignal("contentChangedSignal");
    const debouncer = this._register(new RunOnceScheduler(() => contentChangedSignal.trigger(void 0), 200));
    this._register(autorun((reader) => {
      const lastUnchangedRegions = this._unchangedRegions.read(reader);
      if (!lastUnchangedRegions || lastUnchangedRegions.regions.some((r) => r.isDragged.read(reader))) {
        return;
      }
      const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds.map((id) => model.original.getDecorationRange(id)).map((r) => r ? LineRange.fromRangeInclusive(r) : void 0);
      const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds.map((id) => model.modified.getDecorationRange(id)).map((r) => r ? LineRange.fromRangeInclusive(r) : void 0);
      const updatedLastUnchangedRegions = lastUnchangedRegions.regions.map((r, idx) => !lastUnchangedRegionsOrigRanges[idx] || !lastUnchangedRegionsModRanges[idx] ? void 0 : new UnchangedRegion(
        lastUnchangedRegionsOrigRanges[idx].startLineNumber,
        lastUnchangedRegionsModRanges[idx].startLineNumber,
        lastUnchangedRegionsOrigRanges[idx].length,
        r.visibleLineCountTop.read(reader),
        r.visibleLineCountBottom.read(reader)
      )).filter(isDefined);
      const newRanges = [];
      let didChange = false;
      for (const touching of groupAdjacentBy(updatedLastUnchangedRegions, (a, b) => a.getHiddenModifiedRange(reader).endLineNumberExclusive === b.getHiddenModifiedRange(reader).startLineNumber)) {
        if (touching.length > 1) {
          didChange = true;
          const sumLineCount = touching.reduce((sum, r2) => sum + r2.lineCount, 0);
          const r = new UnchangedRegion(touching[0].originalLineNumber, touching[0].modifiedLineNumber, sumLineCount, touching[0].visibleLineCountTop.read(void 0), touching[touching.length - 1].visibleLineCountBottom.read(void 0));
          newRanges.push(r);
        } else {
          newRanges.push(touching[0]);
        }
      }
      if (didChange) {
        const originalDecorationIds = model.original.deltaDecorations(
          lastUnchangedRegions.originalDecorationIds,
          newRanges.map((r) => ({ range: r.originalUnchangedRange.toInclusiveRange(), options: { description: "unchanged" } }))
        );
        const modifiedDecorationIds = model.modified.deltaDecorations(
          lastUnchangedRegions.modifiedDecorationIds,
          newRanges.map((r) => ({ range: r.modifiedUnchangedRange.toInclusiveRange(), options: { description: "unchanged" } }))
        );
        transaction((tx) => {
          this._unchangedRegions.set(
            {
              regions: newRanges,
              originalDecorationIds,
              modifiedDecorationIds
            },
            tx
          );
        });
      }
    }));
    const updateUnchangedRegions = (result, tx, reader) => {
      const newUnchangedRegions = UnchangedRegion.fromDiffs(
        result.changes,
        model.original.getLineCount(),
        model.modified.getLineCount(),
        this._options.hideUnchangedRegionsMinimumLineCount.read(reader),
        this._options.hideUnchangedRegionsContextLineCount.read(reader)
      );
      let visibleRegions = void 0;
      const lastUnchangedRegions = this._unchangedRegions.get();
      if (lastUnchangedRegions) {
        const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds.map((id) => model.original.getDecorationRange(id)).map((r) => r ? LineRange.fromRangeInclusive(r) : void 0);
        const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds.map((id) => model.modified.getDecorationRange(id)).map((r) => r ? LineRange.fromRangeInclusive(r) : void 0);
        const updatedLastUnchangedRegions = filterWithPrevious(
          lastUnchangedRegions.regions.map(
            (r, idx) => {
              if (!lastUnchangedRegionsOrigRanges[idx] || !lastUnchangedRegionsModRanges[idx]) {
                return void 0;
              }
              const length = lastUnchangedRegionsOrigRanges[idx].length;
              return new UnchangedRegion(
                lastUnchangedRegionsOrigRanges[idx].startLineNumber,
                lastUnchangedRegionsModRanges[idx].startLineNumber,
                length,
                // The visible area can shrink by edits -> we have to account for this
                Math.min(r.visibleLineCountTop.get(), length),
                Math.min(r.visibleLineCountBottom.get(), length - r.visibleLineCountTop.get())
              );
            }
          ).filter(isDefined),
          (cur, prev) => !prev || cur.modifiedLineNumber >= prev.modifiedLineNumber + prev.lineCount && cur.originalLineNumber >= prev.originalLineNumber + prev.lineCount
        );
        let hiddenRegions = updatedLastUnchangedRegions.map((r) => new LineRangeMapping(r.getHiddenOriginalRange(reader), r.getHiddenModifiedRange(reader)));
        hiddenRegions = LineRangeMapping.clip(hiddenRegions, LineRange.ofLength(1, model.original.getLineCount()), LineRange.ofLength(1, model.modified.getLineCount()));
        visibleRegions = LineRangeMapping.inverse(hiddenRegions, model.original.getLineCount(), model.modified.getLineCount());
      }
      const newUnchangedRegions2 = [];
      if (visibleRegions) {
        for (const r of newUnchangedRegions) {
          const intersecting = visibleRegions.filter((f) => f.original.intersectsStrict(r.originalUnchangedRange) && f.modified.intersectsStrict(r.modifiedUnchangedRange));
          newUnchangedRegions2.push(...r.setVisibleRanges(intersecting, tx));
        }
      } else {
        newUnchangedRegions2.push(...newUnchangedRegions);
      }
      const originalDecorationIds = model.original.deltaDecorations(
        lastUnchangedRegions?.originalDecorationIds || [],
        newUnchangedRegions2.map((r) => ({ range: r.originalUnchangedRange.toInclusiveRange(), options: { description: "unchanged" } }))
      );
      const modifiedDecorationIds = model.modified.deltaDecorations(
        lastUnchangedRegions?.modifiedDecorationIds || [],
        newUnchangedRegions2.map((r) => ({ range: r.modifiedUnchangedRange.toInclusiveRange(), options: { description: "unchanged" } }))
      );
      this._unchangedRegions.set(
        {
          regions: newUnchangedRegions2,
          originalDecorationIds,
          modifiedDecorationIds
        },
        tx
      );
    };
    this._register(model.modified.onDidChangeContent((e) => {
      const diff = this._diff.get();
      if (diff) {
        const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
        const result = applyModifiedEdits(this._lastDiff, textEdits, model.original, model.modified);
        if (result) {
          this._lastDiff = result;
          transaction((tx) => {
            this._diff.set(DiffState.fromDiffResult(this._lastDiff), tx);
            updateUnchangedRegions(result, tx);
            const currentSyncedMovedText = this.movedTextToCompare.get();
            this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find((m) => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : void 0, tx);
          });
        }
      }
      this._isDiffUpToDate.set(false, void 0);
      debouncer.schedule();
    }));
    this._register(model.original.onDidChangeContent((e) => {
      const diff = this._diff.get();
      if (diff) {
        const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
        const result = applyOriginalEdits(this._lastDiff, textEdits, model.original, model.modified);
        if (result) {
          this._lastDiff = result;
          transaction((tx) => {
            this._diff.set(DiffState.fromDiffResult(this._lastDiff), tx);
            updateUnchangedRegions(result, tx);
            const currentSyncedMovedText = this.movedTextToCompare.get();
            this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find((m) => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : void 0, tx);
          });
        }
      }
      this._isDiffUpToDate.set(false, void 0);
      debouncer.schedule();
    }));
    this._register(autorun(async (reader) => {
      const store = reader.store;
      this._options.hideUnchangedRegionsMinimumLineCount.read(reader);
      this._options.hideUnchangedRegionsContextLineCount.read(reader);
      debouncer.cancel();
      contentChangedSignal.read(reader);
      const documentDiffProvider = this._diffProvider.read(reader);
      documentDiffProvider.onChangeSignal.read(reader);
      readHotReloadableExport(DefaultLinesDiffComputer, reader);
      readHotReloadableExport(optimizeSequenceDiffs, reader);
      this._isDiffUpToDate.set(false, void 0);
      let originalTextEditInfos = [];
      store.add(model.original.onDidChangeContent((e) => {
        const edits = TextEditInfo.fromModelContentChanges(e.changes);
        originalTextEditInfos = combineTextEditInfos(originalTextEditInfos, edits);
      }));
      let modifiedTextEditInfos = [];
      store.add(model.modified.onDidChangeContent((e) => {
        const edits = TextEditInfo.fromModelContentChanges(e.changes);
        modifiedTextEditInfos = combineTextEditInfos(modifiedTextEditInfos, edits);
      }));
      let result = await documentDiffProvider.diffProvider.computeDiff(model.original, model.modified, {
        ignoreTrimWhitespace: this._options.ignoreTrimWhitespace.read(reader),
        maxComputationTimeMs: this._options.maxComputationTimeMs.read(reader),
        computeMoves: this._options.showMoves.read(reader)
      }, this._cancellationTokenSource.token).catch(rejectIfNotCanceled);
      if (!result || this._cancellationTokenSource.token.isCancellationRequested) {
        return;
      }
      if (model.original.isDisposed() || model.modified.isDisposed()) {
        return;
      }
      result = normalizeDocumentDiff(result, model.original, model.modified);
      result = applyOriginalEdits(result, originalTextEditInfos, model.original, model.modified) ?? result;
      result = applyModifiedEdits(result, modifiedTextEditInfos, model.original, model.modified) ?? result;
      transaction((tx) => {
        updateUnchangedRegions(result, tx);
        this._lastDiff = result;
        const state = DiffState.fromDiffResult(result);
        this._diff.set(state, tx);
        this._isDiffUpToDate.set(true, tx);
        const currentSyncedMovedText = this.movedTextToCompare.read(void 0);
        this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find((m) => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : void 0, tx);
      });
    }));
  }
  setActiveMovedText(movedText) {
    this._activeMovedText.set(movedText, void 0);
  }
  setHoveredMovedText(movedText) {
    this._hoveredMovedText.set(movedText, void 0);
  }
  ensureModifiedLineIsVisible(lineNumber, preference, tx) {
    if (this.diff.get()?.mappings.length === 0) {
      return;
    }
    const unchangedRegions = this._unchangedRegions.get()?.regions || [];
    for (const r of unchangedRegions) {
      if (r.getHiddenModifiedRange(void 0).contains(lineNumber)) {
        r.showModifiedLine(lineNumber, preference, tx);
        return;
      }
    }
  }
  ensureOriginalLineIsVisible(lineNumber, preference, tx) {
    if (this.diff.get()?.mappings.length === 0) {
      return;
    }
    const unchangedRegions = this._unchangedRegions.get()?.regions || [];
    for (const r of unchangedRegions) {
      if (r.getHiddenOriginalRange(void 0).contains(lineNumber)) {
        r.showOriginalLine(lineNumber, preference, tx);
        return;
      }
    }
  }
  async waitForDiff() {
    await waitForState(this.isDiffUpToDate, (s) => s, void 0, this._cancellationTokenSource.token).catch(rejectIfNotCanceled);
  }
  serializeState() {
    const regions = this._unchangedRegions.get();
    return {
      collapsedRegions: regions?.regions.map((r) => ({ range: r.getHiddenModifiedRange(void 0).serialize() }))
    };
  }
  restoreSerializedState(state) {
    const ranges = state.collapsedRegions?.map((r) => LineRange.deserialize(r.range));
    const regions = this._unchangedRegions.get();
    if (!regions || !ranges) {
      return;
    }
    transaction((tx) => {
      for (const r of regions.regions) {
        for (const range of ranges) {
          if (r.modifiedUnchangedRange.intersect(range)) {
            r.setHiddenModifiedRange(range, tx);
            break;
          }
        }
      }
    });
  }
};
DiffEditorViewModel = __decorateClass([
  __decorateParam(2, IDiffProviderFactoryService)
], DiffEditorViewModel);
function normalizeDocumentDiff(diff, original, modified) {
  return {
    changes: diff.changes.map((c) => new DetailedLineRangeMapping(
      c.original,
      c.modified,
      c.innerChanges ? c.innerChanges.map((i) => normalizeRangeMapping(i, original, modified)) : void 0
    )),
    moves: diff.moves,
    identical: diff.identical,
    quitEarly: diff.quitEarly
  };
}
function normalizeRangeMapping(rangeMapping, original, modified) {
  let originalRange = rangeMapping.originalRange;
  let modifiedRange = rangeMapping.modifiedRange;
  if (originalRange.startColumn === 1 && modifiedRange.startColumn === 1 && (originalRange.endColumn !== 1 || modifiedRange.endColumn !== 1) && originalRange.endColumn === original.getLineMaxColumn(originalRange.endLineNumber) && modifiedRange.endColumn === modified.getLineMaxColumn(modifiedRange.endLineNumber) && originalRange.endLineNumber < original.getLineCount() && modifiedRange.endLineNumber < modified.getLineCount()) {
    originalRange = originalRange.setEndPosition(originalRange.endLineNumber + 1, 1);
    modifiedRange = modifiedRange.setEndPosition(modifiedRange.endLineNumber + 1, 1);
  }
  return new RangeMapping(originalRange, modifiedRange);
}
class DiffState {
  constructor(mappings, movedTexts, identical, quitEarly) {
    this.mappings = mappings;
    this.movedTexts = movedTexts;
    this.identical = identical;
    this.quitEarly = quitEarly;
  }
  static fromDiffResult(result) {
    return new DiffState(
      result.changes.map((c) => new DiffMapping(c)),
      result.moves || [],
      result.identical,
      result.quitEarly
    );
  }
}
class DiffMapping {
  constructor(lineRangeMapping) {
    this.lineRangeMapping = lineRangeMapping;
  }
}
class UnchangedRegion {
  constructor(originalLineNumber, modifiedLineNumber, lineCount, visibleLineCountTop, visibleLineCountBottom) {
    this.originalLineNumber = originalLineNumber;
    this.modifiedLineNumber = modifiedLineNumber;
    this.lineCount = lineCount;
    this._visibleLineCountTop = observableValue(this, 0);
    this.visibleLineCountTop = this._visibleLineCountTop;
    this._visibleLineCountBottom = observableValue(this, 0);
    this.visibleLineCountBottom = this._visibleLineCountBottom;
    this._shouldHideControls = derived(this, (reader) => (
      /** @description isVisible */
      this.visibleLineCountTop.read(reader) + this.visibleLineCountBottom.read(reader) === this.lineCount && !this.isDragged.read(reader)
    ));
    this.isDragged = observableValue(this, void 0);
    const visibleLineCountTop2 = Math.max(Math.min(visibleLineCountTop, this.lineCount), 0);
    const visibleLineCountBottom2 = Math.max(Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop), 0);
    softAssert(visibleLineCountTop === visibleLineCountTop2);
    softAssert(visibleLineCountBottom === visibleLineCountBottom2);
    this._visibleLineCountTop.set(visibleLineCountTop2, void 0);
    this._visibleLineCountBottom.set(visibleLineCountBottom2, void 0);
  }
  static fromDiffs(changes, originalLineCount, modifiedLineCount, minHiddenLineCount, minContext) {
    const inversedMappings = DetailedLineRangeMapping.inverse(changes, originalLineCount, modifiedLineCount);
    const result = [];
    for (const mapping of inversedMappings) {
      let origStart = mapping.original.startLineNumber;
      let modStart = mapping.modified.startLineNumber;
      let length = mapping.original.length;
      const atStart = origStart === 1 && modStart === 1;
      const atEnd = origStart + length === originalLineCount + 1 && modStart + length === modifiedLineCount + 1;
      if ((atStart || atEnd) && length >= minContext + minHiddenLineCount) {
        if (atStart && !atEnd) {
          length -= minContext;
        }
        if (atEnd && !atStart) {
          origStart += minContext;
          modStart += minContext;
          length -= minContext;
        }
        result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
      } else if (length >= minContext * 2 + minHiddenLineCount) {
        origStart += minContext;
        modStart += minContext;
        length -= minContext * 2;
        result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
      }
    }
    return result;
  }
  get originalUnchangedRange() {
    return LineRange.ofLength(this.originalLineNumber, this.lineCount);
  }
  get modifiedUnchangedRange() {
    return LineRange.ofLength(this.modifiedLineNumber, this.lineCount);
  }
  setVisibleRanges(visibleRanges, tx) {
    const result = [];
    const hiddenModified = new LineRangeSet(visibleRanges.map((r) => r.modified)).subtractFrom(this.modifiedUnchangedRange);
    let originalStartLineNumber = this.originalLineNumber;
    let modifiedStartLineNumber = this.modifiedLineNumber;
    const modifiedEndLineNumberEx = this.modifiedLineNumber + this.lineCount;
    if (hiddenModified.ranges.length === 0) {
      this.showAll(tx);
      result.push(this);
    } else {
      let i = 0;
      for (const r of hiddenModified.ranges) {
        const isLast = i === hiddenModified.ranges.length - 1;
        i++;
        const length = (isLast ? modifiedEndLineNumberEx : r.endLineNumberExclusive) - modifiedStartLineNumber;
        const newR = new UnchangedRegion(originalStartLineNumber, modifiedStartLineNumber, length, 0, 0);
        newR.setHiddenModifiedRange(r, tx);
        result.push(newR);
        originalStartLineNumber = newR.originalUnchangedRange.endLineNumberExclusive;
        modifiedStartLineNumber = newR.modifiedUnchangedRange.endLineNumberExclusive;
      }
    }
    return result;
  }
  shouldHideControls(reader) {
    return this._shouldHideControls.read(reader);
  }
  getHiddenOriginalRange(reader) {
    return LineRange.ofLength(
      this.originalLineNumber + this._visibleLineCountTop.read(reader),
      this.lineCount - this._visibleLineCountTop.read(reader) - this._visibleLineCountBottom.read(reader)
    );
  }
  getHiddenModifiedRange(reader) {
    return LineRange.ofLength(
      this.modifiedLineNumber + this._visibleLineCountTop.read(reader),
      this.lineCount - this._visibleLineCountTop.read(reader) - this._visibleLineCountBottom.read(reader)
    );
  }
  setHiddenModifiedRange(range, tx) {
    const visibleLineCountTop = range.startLineNumber - this.modifiedLineNumber;
    const visibleLineCountBottom = this.modifiedLineNumber + this.lineCount - range.endLineNumberExclusive;
    this.setState(visibleLineCountTop, visibleLineCountBottom, tx);
  }
  getMaxVisibleLineCountTop() {
    return this.lineCount - this._visibleLineCountBottom.get();
  }
  getMaxVisibleLineCountBottom() {
    return this.lineCount - this._visibleLineCountTop.get();
  }
  showMoreAbove(count = 10, tx) {
    const maxVisibleLineCountTop = this.getMaxVisibleLineCountTop();
    this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + count, maxVisibleLineCountTop), tx);
  }
  showMoreBelow(count = 10, tx) {
    const maxVisibleLineCountBottom = this.lineCount - this._visibleLineCountTop.get();
    this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + count, maxVisibleLineCountBottom), tx);
  }
  showAll(tx) {
    this._visibleLineCountBottom.set(this.lineCount - this._visibleLineCountTop.get(), tx);
  }
  showModifiedLine(lineNumber, preference, tx) {
    const top = lineNumber + 1 - (this.modifiedLineNumber + this._visibleLineCountTop.get());
    const bottom = this.modifiedLineNumber - this._visibleLineCountBottom.get() + this.lineCount - lineNumber;
    if (preference === 0 /* FromCloserSide */ && top < bottom || preference === 1 /* FromTop */) {
      this._visibleLineCountTop.set(this._visibleLineCountTop.get() + top, tx);
    } else {
      this._visibleLineCountBottom.set(this._visibleLineCountBottom.get() + bottom, tx);
    }
  }
  showOriginalLine(lineNumber, preference, tx) {
    const top = lineNumber - this.originalLineNumber;
    const bottom = this.originalLineNumber + this.lineCount - lineNumber;
    if (preference === 0 /* FromCloserSide */ && top < bottom || preference === 1 /* FromTop */) {
      this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + bottom - top, this.getMaxVisibleLineCountTop()), tx);
    } else {
      this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + top - bottom, this.getMaxVisibleLineCountBottom()), tx);
    }
  }
  collapseAll(tx) {
    this._visibleLineCountTop.set(0, tx);
    this._visibleLineCountBottom.set(0, tx);
  }
  setState(visibleLineCountTop, visibleLineCountBottom, tx) {
    visibleLineCountTop = Math.max(Math.min(visibleLineCountTop, this.lineCount), 0);
    visibleLineCountBottom = Math.max(Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop), 0);
    this._visibleLineCountTop.set(visibleLineCountTop, tx);
    this._visibleLineCountBottom.set(visibleLineCountBottom, tx);
  }
}
var RevealPreference = /* @__PURE__ */ ((RevealPreference2) => {
  RevealPreference2[RevealPreference2["FromCloserSide"] = 0] = "FromCloserSide";
  RevealPreference2[RevealPreference2["FromTop"] = 1] = "FromTop";
  RevealPreference2[RevealPreference2["FromBottom"] = 2] = "FromBottom";
  return RevealPreference2;
})(RevealPreference || {});
function applyOriginalEdits(diff, textEdits, originalTextModel, modifiedTextModel) {
  return void 0;
}
function applyModifiedEdits(diff, textEdits, originalTextModel, modifiedTextModel) {
  return void 0;
}
export {
  DiffEditorViewModel,
  DiffMapping,
  DiffState,
  RevealPreference,
  UnchangedRegion
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcZGlmZkVkaXRvclZpZXdNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlamVjdElmTm90Q2FuY2VsZWQsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIElSZWFkZXIsIElTZXR0YWJsZU9ic2VydmFibGUsIElUcmFuc2FjdGlvbiwgYXV0b3J1biwgZGVyaXZlZCwgb2JzZXJ2YWJsZVNpZ25hbCwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiwgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJRGlmZlByb3ZpZGVyRmFjdG9yeVNlcnZpY2UgfSBmcm9tICcuL2RpZmZQcm92aWRlckZhY3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGZpbHRlcldpdGhQcmV2aW91cyB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgcmVhZEhvdFJlbG9hZGFibGVFeHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ob3RSZWxvYWRIZWxwZXJzLmpzJztcbmltcG9ydCB7IElTZXJpYWxpemVkTGluZVJhbmdlLCBMaW5lUmFuZ2UsIExpbmVSYW5nZVNldCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgRGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyL2RlZmF1bHRMaW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvZG9jdW1lbnREaWZmUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTW92ZWRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvbGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLCBMaW5lUmFuZ2VNYXBwaW5nLCBSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JNb2RlbCwgSURpZmZFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvYnJhY2tldFBhaXJzVHJlZS9iZWZvcmVFZGl0UG9zaXRpb25NYXBwZXIuanMnO1xuaW1wb3J0IHsgY29tYmluZVRleHRFZGl0SW5mb3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydC9icmFja2V0UGFpcnNUcmVlL2NvbWJpbmVUZXh0RWRpdEluZm9zLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi9kaWZmRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBvcHRpbWl6ZVNlcXVlbmNlRGlmZnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZGlmZi9kZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXIvaGV1cmlzdGljU2VxdWVuY2VPcHRpbWl6YXRpb25zLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGdyb3VwQWRqYWNlbnRCeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBzb2Z0QXNzZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcblxuZXhwb3J0IGNsYXNzIERpZmZFZGl0b3JWaWV3TW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURpZmZFZGl0b3JWaWV3TW9kZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0RpZmZVcFRvRGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cdHB1YmxpYyByZWFkb25seSBpc0RpZmZVcFRvRGF0ZTogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9pc0RpZmZVcFRvRGF0ZTtcblxuXHRwcml2YXRlIF9sYXN0RGlmZjogSURvY3VtZW50RGlmZiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlmZiA9IG9ic2VydmFibGVWYWx1ZTxEaWZmU3RhdGUgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHB1YmxpYyByZWFkb25seSBkaWZmOiBJT2JzZXJ2YWJsZTxEaWZmU3RhdGUgfCB1bmRlZmluZWQ+ID0gdGhpcy5fZGlmZjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91bmNoYW5nZWRSZWdpb25zID0gb2JzZXJ2YWJsZVZhbHVlPHsgcmVnaW9uczogVW5jaGFuZ2VkUmVnaW9uW107IG9yaWdpbmFsRGVjb3JhdGlvbklkczogc3RyaW5nW107IG1vZGlmaWVkRGVjb3JhdGlvbklkczogc3RyaW5nW10gfSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHVibGljIHJlYWRvbmx5IHVuY2hhbmdlZFJlZ2lvbnM6IElPYnNlcnZhYmxlPFVuY2hhbmdlZFJlZ2lvbltdPiA9IGRlcml2ZWQodGhpcywgciA9PiB7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMuaGlkZVVuY2hhbmdlZFJlZ2lvbnMucmVhZChyKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3VuY2hhbmdlZFJlZ2lvbnMucmVhZChyKT8ucmVnaW9ucyA/PyBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUmVzZXQgc3RhdGVcblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX3VuY2hhbmdlZFJlZ2lvbnMucmVhZCh1bmRlZmluZWQpPy5yZWdpb25zIHx8IFtdKSB7XG5cdFx0XHRcdFx0ci5jb2xsYXBzZUFsbCh0eCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXHQpO1xuXG5cdHB1YmxpYyByZWFkb25seSBtb3ZlZFRleHRUb0NvbXBhcmUgPSBvYnNlcnZhYmxlVmFsdWU8TW92ZWRUZXh0IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZU1vdmVkVGV4dCA9IG9ic2VydmFibGVWYWx1ZTxNb3ZlZFRleHQgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyZWRNb3ZlZFRleHQgPSBvYnNlcnZhYmxlVmFsdWU8TW92ZWRUZXh0IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cblx0cHVibGljIHJlYWRvbmx5IGFjdGl2ZU1vdmVkVGV4dCA9IGRlcml2ZWQodGhpcywgciA9PiB0aGlzLm1vdmVkVGV4dFRvQ29tcGFyZS5yZWFkKHIpID8/IHRoaXMuX2hvdmVyZWRNb3ZlZFRleHQucmVhZChyKSA/PyB0aGlzLl9hY3RpdmVNb3ZlZFRleHQucmVhZChyKSk7XG5cblx0cHVibGljIHNldEFjdGl2ZU1vdmVkVGV4dChtb3ZlZFRleHQ6IE1vdmVkVGV4dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZU1vdmVkVGV4dC5zZXQobW92ZWRUZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIHNldEhvdmVyZWRNb3ZlZFRleHQobW92ZWRUZXh0OiBNb3ZlZFRleHQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9ob3ZlcmVkTW92ZWRUZXh0LnNldChtb3ZlZFRleHQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZQcm92aWRlciA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBkaWZmUHJvdmlkZXIgPSB0aGlzLl9kaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZS5jcmVhdGVEaWZmUHJvdmlkZXIoe1xuXHRcdFx0ZGlmZkFsZ29yaXRobTogdGhpcy5fb3B0aW9ucy5kaWZmQWxnb3JpdGhtLnJlYWQocmVhZGVyKVxuXHRcdH0pO1xuXHRcdGNvbnN0IG9uQ2hhbmdlU2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCgnb25EaWRDaGFuZ2UnLCBkaWZmUHJvdmlkZXIub25EaWRDaGFuZ2UpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaWZmUHJvdmlkZXIsXG5cdFx0XHRvbkNoYW5nZVNpZ25hbCxcblx0XHR9O1xuXHR9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kZWw6IElEaWZmRWRpdG9yTW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogRGlmZkVkaXRvck9wdGlvbnMsXG5cdFx0QElEaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWZmUHJvdmlkZXJGYWN0b3J5U2VydmljZTogSURpZmZQcm92aWRlckZhY3RvcnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpKSk7XG5cblx0XHRjb25zdCBjb250ZW50Q2hhbmdlZFNpZ25hbCA9IG9ic2VydmFibGVTaWduYWwoJ2NvbnRlbnRDaGFuZ2VkU2lnbmFsJyk7XG5cdFx0Y29uc3QgZGVib3VuY2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gY29udGVudENoYW5nZWRTaWduYWwudHJpZ2dlcih1bmRlZmluZWQpLCAyMDApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gY29sbGFwc2UgdG91Y2hpbmcgdW5jaGFuZ2VkIHJhbmdlcyAqL1xuXG5cdFx0XHRjb25zdCBsYXN0VW5jaGFuZ2VkUmVnaW9ucyA9IHRoaXMuX3VuY2hhbmdlZFJlZ2lvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFsYXN0VW5jaGFuZ2VkUmVnaW9ucyB8fCBsYXN0VW5jaGFuZ2VkUmVnaW9ucy5yZWdpb25zLnNvbWUociA9PiByLmlzRHJhZ2dlZC5yZWFkKHJlYWRlcikpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGFzdFVuY2hhbmdlZFJlZ2lvbnNPcmlnUmFuZ2VzID0gbGFzdFVuY2hhbmdlZFJlZ2lvbnMub3JpZ2luYWxEZWNvcmF0aW9uSWRzXG5cdFx0XHRcdC5tYXAoaWQgPT4gbW9kZWwub3JpZ2luYWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkKSlcblx0XHRcdFx0Lm1hcChyID0+IHIgPyBMaW5lUmFuZ2UuZnJvbVJhbmdlSW5jbHVzaXZlKHIpIDogdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGxhc3RVbmNoYW5nZWRSZWdpb25zTW9kUmFuZ2VzID0gbGFzdFVuY2hhbmdlZFJlZ2lvbnMubW9kaWZpZWREZWNvcmF0aW9uSWRzXG5cdFx0XHRcdC5tYXAoaWQgPT4gbW9kZWwubW9kaWZpZWQuZ2V0RGVjb3JhdGlvblJhbmdlKGlkKSlcblx0XHRcdFx0Lm1hcChyID0+IHIgPyBMaW5lUmFuZ2UuZnJvbVJhbmdlSW5jbHVzaXZlKHIpIDogdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHVwZGF0ZWRMYXN0VW5jaGFuZ2VkUmVnaW9ucyA9IGxhc3RVbmNoYW5nZWRSZWdpb25zLnJlZ2lvbnMubWFwKChyLCBpZHgpID0+XG5cdFx0XHRcdCghbGFzdFVuY2hhbmdlZFJlZ2lvbnNPcmlnUmFuZ2VzW2lkeF0gfHwgIWxhc3RVbmNoYW5nZWRSZWdpb25zTW9kUmFuZ2VzW2lkeF0pID8gdW5kZWZpbmVkIDpcblx0XHRcdFx0XHRuZXcgVW5jaGFuZ2VkUmVnaW9uKFxuXHRcdFx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnNPcmlnUmFuZ2VzW2lkeF0uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnNNb2RSYW5nZXNbaWR4XS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRsYXN0VW5jaGFuZ2VkUmVnaW9uc09yaWdSYW5nZXNbaWR4XS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRyLnZpc2libGVMaW5lQ291bnRUb3AucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdFx0ci52aXNpYmxlTGluZUNvdW50Qm90dG9tLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHQpKS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgbmV3UmFuZ2VzOiBVbmNoYW5nZWRSZWdpb25bXSA9IFtdO1xuXG5cdFx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IHRvdWNoaW5nIG9mIGdyb3VwQWRqYWNlbnRCeSh1cGRhdGVkTGFzdFVuY2hhbmdlZFJlZ2lvbnMsIChhLCBiKSA9PiBhLmdldEhpZGRlbk1vZGlmaWVkUmFuZ2UocmVhZGVyKS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlID09PSBiLmdldEhpZGRlbk1vZGlmaWVkUmFuZ2UocmVhZGVyKS5zdGFydExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdGlmICh0b3VjaGluZy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHRjb25zdCBzdW1MaW5lQ291bnQgPSB0b3VjaGluZy5yZWR1Y2UoKHN1bSwgcikgPT4gc3VtICsgci5saW5lQ291bnQsIDApO1xuXHRcdFx0XHRcdGNvbnN0IHIgPSBuZXcgVW5jaGFuZ2VkUmVnaW9uKHRvdWNoaW5nWzBdLm9yaWdpbmFsTGluZU51bWJlciwgdG91Y2hpbmdbMF0ubW9kaWZpZWRMaW5lTnVtYmVyLCBzdW1MaW5lQ291bnQsIHRvdWNoaW5nWzBdLnZpc2libGVMaW5lQ291bnRUb3AucmVhZCh1bmRlZmluZWQpLCB0b3VjaGluZ1t0b3VjaGluZy5sZW5ndGggLSAxXS52aXNpYmxlTGluZUNvdW50Qm90dG9tLnJlYWQodW5kZWZpbmVkKSk7XG5cdFx0XHRcdFx0bmV3UmFuZ2VzLnB1c2gocik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3UmFuZ2VzLnB1c2godG91Y2hpbmdbMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGlkQ2hhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsRGVjb3JhdGlvbklkcyA9IG1vZGVsLm9yaWdpbmFsLmRlbHRhRGVjb3JhdGlvbnMoXG5cdFx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnMub3JpZ2luYWxEZWNvcmF0aW9uSWRzLFxuXHRcdFx0XHRcdG5ld1Jhbmdlcy5tYXAociA9PiAoeyByYW5nZTogci5vcmlnaW5hbFVuY2hhbmdlZFJhbmdlLnRvSW5jbHVzaXZlUmFuZ2UoKSEsIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd1bmNoYW5nZWQnIH0gfSkpXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkRGVjb3JhdGlvbklkcyA9IG1vZGVsLm1vZGlmaWVkLmRlbHRhRGVjb3JhdGlvbnMoXG5cdFx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnMubW9kaWZpZWREZWNvcmF0aW9uSWRzLFxuXHRcdFx0XHRcdG5ld1Jhbmdlcy5tYXAociA9PiAoeyByYW5nZTogci5tb2RpZmllZFVuY2hhbmdlZFJhbmdlLnRvSW5jbHVzaXZlUmFuZ2UoKSEsIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd1bmNoYW5nZWQnIH0gfSkpXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3VuY2hhbmdlZFJlZ2lvbnMuc2V0KFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRyZWdpb25zOiBuZXdSYW5nZXMsXG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbklkcyxcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWREZWNvcmF0aW9uSWRzXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dHhcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVVbmNoYW5nZWRSZWdpb25zID0gKHJlc3VsdDogSURvY3VtZW50RGlmZiwgdHg6IElUcmFuc2FjdGlvbiwgcmVhZGVyPzogSVJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgbmV3VW5jaGFuZ2VkUmVnaW9ucyA9IFVuY2hhbmdlZFJlZ2lvbi5mcm9tRGlmZnMoXG5cdFx0XHRcdHJlc3VsdC5jaGFuZ2VzLFxuXHRcdFx0XHRtb2RlbC5vcmlnaW5hbC5nZXRMaW5lQ291bnQoKSxcblx0XHRcdFx0bW9kZWwubW9kaWZpZWQuZ2V0TGluZUNvdW50KCksXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMuaGlkZVVuY2hhbmdlZFJlZ2lvbnNNaW5pbXVtTGluZUNvdW50LnJlYWQocmVhZGVyKSxcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5oaWRlVW5jaGFuZ2VkUmVnaW9uc0NvbnRleHRMaW5lQ291bnQucmVhZChyZWFkZXIpLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVHJhbnNmZXIgc3RhdGUgZnJvbSBjdXIgc3RhdGVcblx0XHRcdGxldCB2aXNpYmxlUmVnaW9uczogTGluZVJhbmdlTWFwcGluZ1tdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBsYXN0VW5jaGFuZ2VkUmVnaW9ucyA9IHRoaXMuX3VuY2hhbmdlZFJlZ2lvbnMuZ2V0KCk7XG5cdFx0XHRpZiAobGFzdFVuY2hhbmdlZFJlZ2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgbGFzdFVuY2hhbmdlZFJlZ2lvbnNPcmlnUmFuZ2VzID0gbGFzdFVuY2hhbmdlZFJlZ2lvbnMub3JpZ2luYWxEZWNvcmF0aW9uSWRzXG5cdFx0XHRcdFx0Lm1hcChpZCA9PiBtb2RlbC5vcmlnaW5hbC5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpKVxuXHRcdFx0XHRcdC5tYXAociA9PiByID8gTGluZVJhbmdlLmZyb21SYW5nZUluY2x1c2l2ZShyKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IGxhc3RVbmNoYW5nZWRSZWdpb25zTW9kUmFuZ2VzID0gbGFzdFVuY2hhbmdlZFJlZ2lvbnMubW9kaWZpZWREZWNvcmF0aW9uSWRzXG5cdFx0XHRcdFx0Lm1hcChpZCA9PiBtb2RlbC5tb2RpZmllZC5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpKVxuXHRcdFx0XHRcdC5tYXAociA9PiByID8gTGluZVJhbmdlLmZyb21SYW5nZUluY2x1c2l2ZShyKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWRMYXN0VW5jaGFuZ2VkUmVnaW9ucyA9IGZpbHRlcldpdGhQcmV2aW91cyhcblx0XHRcdFx0XHRsYXN0VW5jaGFuZ2VkUmVnaW9ucy5yZWdpb25zXG5cdFx0XHRcdFx0XHQubWFwKChyLCBpZHgpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKCFsYXN0VW5jaGFuZ2VkUmVnaW9uc09yaWdSYW5nZXNbaWR4XSB8fCAhbGFzdFVuY2hhbmdlZFJlZ2lvbnNNb2RSYW5nZXNbaWR4XSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxlbmd0aCA9IGxhc3RVbmNoYW5nZWRSZWdpb25zT3JpZ1Jhbmdlc1tpZHhdLmxlbmd0aDtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBVbmNoYW5nZWRSZWdpb24oXG5cdFx0XHRcdFx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnNPcmlnUmFuZ2VzW2lkeF0uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRcdGxhc3RVbmNoYW5nZWRSZWdpb25zTW9kUmFuZ2VzW2lkeF0uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRcdGxlbmd0aCxcblx0XHRcdFx0XHRcdFx0XHQvLyBUaGUgdmlzaWJsZSBhcmVhIGNhbiBzaHJpbmsgYnkgZWRpdHMgLT4gd2UgaGF2ZSB0byBhY2NvdW50IGZvciB0aGlzXG5cdFx0XHRcdFx0XHRcdFx0TWF0aC5taW4oci52aXNpYmxlTGluZUNvdW50VG9wLmdldCgpLCBsZW5ndGgpLFxuXHRcdFx0XHRcdFx0XHRcdE1hdGgubWluKHIudmlzaWJsZUxpbmVDb3VudEJvdHRvbS5nZXQoKSwgbGVuZ3RoIC0gci52aXNpYmxlTGluZUNvdW50VG9wLmdldCgpKSxcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdCkuZmlsdGVyKGlzRGVmaW5lZCksXG5cdFx0XHRcdFx0KGN1ciwgcHJldikgPT4gIXByZXYgfHwgKGN1ci5tb2RpZmllZExpbmVOdW1iZXIgPj0gcHJldi5tb2RpZmllZExpbmVOdW1iZXIgKyBwcmV2LmxpbmVDb3VudCAmJiBjdXIub3JpZ2luYWxMaW5lTnVtYmVyID49IHByZXYub3JpZ2luYWxMaW5lTnVtYmVyICsgcHJldi5saW5lQ291bnQpXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0bGV0IGhpZGRlblJlZ2lvbnMgPSB1cGRhdGVkTGFzdFVuY2hhbmdlZFJlZ2lvbnMubWFwKHIgPT4gbmV3IExpbmVSYW5nZU1hcHBpbmcoci5nZXRIaWRkZW5PcmlnaW5hbFJhbmdlKHJlYWRlciksIHIuZ2V0SGlkZGVuTW9kaWZpZWRSYW5nZShyZWFkZXIpKSk7XG5cdFx0XHRcdGhpZGRlblJlZ2lvbnMgPSBMaW5lUmFuZ2VNYXBwaW5nLmNsaXAoaGlkZGVuUmVnaW9ucywgTGluZVJhbmdlLm9mTGVuZ3RoKDEsIG1vZGVsLm9yaWdpbmFsLmdldExpbmVDb3VudCgpKSwgTGluZVJhbmdlLm9mTGVuZ3RoKDEsIG1vZGVsLm1vZGlmaWVkLmdldExpbmVDb3VudCgpKSk7XG5cdFx0XHRcdHZpc2libGVSZWdpb25zID0gTGluZVJhbmdlTWFwcGluZy5pbnZlcnNlKGhpZGRlblJlZ2lvbnMsIG1vZGVsLm9yaWdpbmFsLmdldExpbmVDb3VudCgpLCBtb2RlbC5tb2RpZmllZC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld1VuY2hhbmdlZFJlZ2lvbnMyID0gW107XG5cdFx0XHRpZiAodmlzaWJsZVJlZ2lvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIG5ld1VuY2hhbmdlZFJlZ2lvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBpbnRlcnNlY3RpbmcgPSB2aXNpYmxlUmVnaW9ucy5maWx0ZXIoZiA9PiBmLm9yaWdpbmFsLmludGVyc2VjdHNTdHJpY3Qoci5vcmlnaW5hbFVuY2hhbmdlZFJhbmdlKSAmJiBmLm1vZGlmaWVkLmludGVyc2VjdHNTdHJpY3Qoci5tb2RpZmllZFVuY2hhbmdlZFJhbmdlKSk7XG5cdFx0XHRcdFx0bmV3VW5jaGFuZ2VkUmVnaW9uczIucHVzaCguLi5yLnNldFZpc2libGVSYW5nZXMoaW50ZXJzZWN0aW5nLCB0eCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdVbmNoYW5nZWRSZWdpb25zMi5wdXNoKC4uLm5ld1VuY2hhbmdlZFJlZ2lvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcmlnaW5hbERlY29yYXRpb25JZHMgPSBtb2RlbC5vcmlnaW5hbC5kZWx0YURlY29yYXRpb25zKFxuXHRcdFx0XHRsYXN0VW5jaGFuZ2VkUmVnaW9ucz8ub3JpZ2luYWxEZWNvcmF0aW9uSWRzIHx8IFtdLFxuXHRcdFx0XHRuZXdVbmNoYW5nZWRSZWdpb25zMi5tYXAociA9PiAoeyByYW5nZTogci5vcmlnaW5hbFVuY2hhbmdlZFJhbmdlLnRvSW5jbHVzaXZlUmFuZ2UoKSEsIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd1bmNoYW5nZWQnIH0gfSkpXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWREZWNvcmF0aW9uSWRzID0gbW9kZWwubW9kaWZpZWQuZGVsdGFEZWNvcmF0aW9ucyhcblx0XHRcdFx0bGFzdFVuY2hhbmdlZFJlZ2lvbnM/Lm1vZGlmaWVkRGVjb3JhdGlvbklkcyB8fCBbXSxcblx0XHRcdFx0bmV3VW5jaGFuZ2VkUmVnaW9uczIubWFwKHIgPT4gKHsgcmFuZ2U6IHIubW9kaWZpZWRVbmNoYW5nZWRSYW5nZS50b0luY2x1c2l2ZVJhbmdlKCkhLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndW5jaGFuZ2VkJyB9IH0pKVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5fdW5jaGFuZ2VkUmVnaW9ucy5zZXQoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZWdpb25zOiBuZXdVbmNoYW5nZWRSZWdpb25zMixcblx0XHRcdFx0XHRvcmlnaW5hbERlY29yYXRpb25JZHMsXG5cdFx0XHRcdFx0bW9kaWZpZWREZWNvcmF0aW9uSWRzXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR4XG5cdFx0XHQpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5tb2RpZmllZC5vbkRpZENoYW5nZUNvbnRlbnQoKGUpID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSB0aGlzLl9kaWZmLmdldCgpO1xuXHRcdFx0aWYgKGRpZmYpIHtcblx0XHRcdFx0Y29uc3QgdGV4dEVkaXRzID0gVGV4dEVkaXRJbmZvLmZyb21Nb2RlbENvbnRlbnRDaGFuZ2VzKGUuY2hhbmdlcyk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGFwcGx5TW9kaWZpZWRFZGl0cyh0aGlzLl9sYXN0RGlmZiEsIHRleHRFZGl0cywgbW9kZWwub3JpZ2luYWwsIG1vZGVsLm1vZGlmaWVkKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHRoaXMuX2xhc3REaWZmID0gcmVzdWx0O1xuXHRcdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2RpZmYuc2V0KERpZmZTdGF0ZS5mcm9tRGlmZlJlc3VsdCh0aGlzLl9sYXN0RGlmZiEpLCB0eCk7XG5cdFx0XHRcdFx0XHR1cGRhdGVVbmNoYW5nZWRSZWdpb25zKHJlc3VsdCwgdHgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudFN5bmNlZE1vdmVkVGV4dCA9IHRoaXMubW92ZWRUZXh0VG9Db21wYXJlLmdldCgpO1xuXHRcdFx0XHRcdFx0dGhpcy5tb3ZlZFRleHRUb0NvbXBhcmUuc2V0KGN1cnJlbnRTeW5jZWRNb3ZlZFRleHQgPyB0aGlzLl9sYXN0RGlmZiEubW92ZXMuZmluZChtID0+IG0ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5pbnRlcnNlY3QoY3VycmVudFN5bmNlZE1vdmVkVGV4dC5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkKSkgOiB1bmRlZmluZWQsIHR4KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9pc0RpZmZVcFRvRGF0ZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRkZWJvdW5jZXIuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWwub3JpZ2luYWwub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gdGhpcy5fZGlmZi5nZXQoKTtcblx0XHRcdGlmIChkaWZmKSB7XG5cdFx0XHRcdGNvbnN0IHRleHRFZGl0cyA9IFRleHRFZGl0SW5mby5mcm9tTW9kZWxDb250ZW50Q2hhbmdlcyhlLmNoYW5nZXMpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhcHBseU9yaWdpbmFsRWRpdHModGhpcy5fbGFzdERpZmYhLCB0ZXh0RWRpdHMsIG1vZGVsLm9yaWdpbmFsLCBtb2RlbC5tb2RpZmllZCk7XG5cdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0RGlmZiA9IHJlc3VsdDtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kaWZmLnNldChEaWZmU3RhdGUuZnJvbURpZmZSZXN1bHQodGhpcy5fbGFzdERpZmYhKSwgdHgpO1xuXHRcdFx0XHRcdFx0dXBkYXRlVW5jaGFuZ2VkUmVnaW9ucyhyZXN1bHQsIHR4KTtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRTeW5jZWRNb3ZlZFRleHQgPSB0aGlzLm1vdmVkVGV4dFRvQ29tcGFyZS5nZXQoKTtcblx0XHRcdFx0XHRcdHRoaXMubW92ZWRUZXh0VG9Db21wYXJlLnNldChjdXJyZW50U3luY2VkTW92ZWRUZXh0ID8gdGhpcy5fbGFzdERpZmYhLm1vdmVzLmZpbmQobSA9PiBtLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaW50ZXJzZWN0KGN1cnJlbnRTeW5jZWRNb3ZlZFRleHQubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZCkpIDogdW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5faXNEaWZmVXBUb0RhdGUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0ZGVib3VuY2VyLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihhc3luYyAocmVhZGVyKSA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIGNvbXB1dGUgZGlmZiAqL1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSByZWFkZXIuc3RvcmU7XG5cblx0XHRcdC8vIFNvIHRoYXQgdGhleSBnZXQgcmVjb21wdXRlZCB3aGVuIHRoZXNlIHNldHRpbmdzIGNoYW5nZVxuXHRcdFx0dGhpcy5fb3B0aW9ucy5oaWRlVW5jaGFuZ2VkUmVnaW9uc01pbmltdW1MaW5lQ291bnQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5oaWRlVW5jaGFuZ2VkUmVnaW9uc0NvbnRleHRMaW5lQ291bnQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRkZWJvdW5jZXIuY2FuY2VsKCk7XG5cdFx0XHRjb250ZW50Q2hhbmdlZFNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBkb2N1bWVudERpZmZQcm92aWRlciA9IHRoaXMuX2RpZmZQcm92aWRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRkb2N1bWVudERpZmZQcm92aWRlci5vbkNoYW5nZVNpZ25hbC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KERlZmF1bHRMaW5lc0RpZmZDb21wdXRlciwgcmVhZGVyKTtcblx0XHRcdHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KG9wdGltaXplU2VxdWVuY2VEaWZmcywgcmVhZGVyKTtcblxuXHRcdFx0dGhpcy5faXNEaWZmVXBUb0RhdGUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRsZXQgb3JpZ2luYWxUZXh0RWRpdEluZm9zOiBUZXh0RWRpdEluZm9bXSA9IFtdO1xuXHRcdFx0c3RvcmUuYWRkKG1vZGVsLm9yaWdpbmFsLm9uRGlkQ2hhbmdlQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0cyA9IFRleHRFZGl0SW5mby5mcm9tTW9kZWxDb250ZW50Q2hhbmdlcyhlLmNoYW5nZXMpO1xuXHRcdFx0XHRvcmlnaW5hbFRleHRFZGl0SW5mb3MgPSBjb21iaW5lVGV4dEVkaXRJbmZvcyhvcmlnaW5hbFRleHRFZGl0SW5mb3MsIGVkaXRzKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0bGV0IG1vZGlmaWVkVGV4dEVkaXRJbmZvczogVGV4dEVkaXRJbmZvW10gPSBbXTtcblx0XHRcdHN0b3JlLmFkZChtb2RlbC5tb2RpZmllZC5vbkRpZENoYW5nZUNvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdHMgPSBUZXh0RWRpdEluZm8uZnJvbU1vZGVsQ29udGVudENoYW5nZXMoZS5jaGFuZ2VzKTtcblx0XHRcdFx0bW9kaWZpZWRUZXh0RWRpdEluZm9zID0gY29tYmluZVRleHRFZGl0SW5mb3MobW9kaWZpZWRUZXh0RWRpdEluZm9zLCBlZGl0cyk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGxldCByZXN1bHQgPSBhd2FpdCBkb2N1bWVudERpZmZQcm92aWRlci5kaWZmUHJvdmlkZXIuY29tcHV0ZURpZmYobW9kZWwub3JpZ2luYWwsIG1vZGVsLm1vZGlmaWVkLCB7XG5cdFx0XHRcdGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiB0aGlzLl9vcHRpb25zLmlnbm9yZVRyaW1XaGl0ZXNwYWNlLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0bWF4Q29tcHV0YXRpb25UaW1lTXM6IHRoaXMuX29wdGlvbnMubWF4Q29tcHV0YXRpb25UaW1lTXMucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRjb21wdXRlTW92ZXM6IHRoaXMuX29wdGlvbnMuc2hvd01vdmVzLnJlYWQocmVhZGVyKSxcblx0XHRcdH0sIHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKS5jYXRjaChyZWplY3RJZk5vdENhbmNlbGVkKTtcblxuXHRcdFx0aWYgKCFyZXN1bHQgfHwgdGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGVsLm9yaWdpbmFsLmlzRGlzcG9zZWQoKSB8fCBtb2RlbC5tb2RpZmllZC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0Ly8gVE9ET0BoZWRpZXQgZmlzaHk/XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJlc3VsdCA9IG5vcm1hbGl6ZURvY3VtZW50RGlmZihyZXN1bHQsIG1vZGVsLm9yaWdpbmFsLCBtb2RlbC5tb2RpZmllZCk7XG5cdFx0XHRyZXN1bHQgPSBhcHBseU9yaWdpbmFsRWRpdHMocmVzdWx0LCBvcmlnaW5hbFRleHRFZGl0SW5mb3MsIG1vZGVsLm9yaWdpbmFsLCBtb2RlbC5tb2RpZmllZCkgPz8gcmVzdWx0O1xuXHRcdFx0cmVzdWx0ID0gYXBwbHlNb2RpZmllZEVkaXRzKHJlc3VsdCwgbW9kaWZpZWRUZXh0RWRpdEluZm9zLCBtb2RlbC5vcmlnaW5hbCwgbW9kZWwubW9kaWZpZWQpID8/IHJlc3VsdDtcblxuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIHdyaXRlIGRpZmYgcmVzdWx0ICovXG5cdFx0XHRcdHVwZGF0ZVVuY2hhbmdlZFJlZ2lvbnMocmVzdWx0LCB0eCk7XG5cblx0XHRcdFx0dGhpcy5fbGFzdERpZmYgPSByZXN1bHQ7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gRGlmZlN0YXRlLmZyb21EaWZmUmVzdWx0KHJlc3VsdCk7XG5cdFx0XHRcdHRoaXMuX2RpZmYuc2V0KHN0YXRlLCB0eCk7XG5cdFx0XHRcdHRoaXMuX2lzRGlmZlVwVG9EYXRlLnNldCh0cnVlLCB0eCk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRTeW5jZWRNb3ZlZFRleHQgPSB0aGlzLm1vdmVkVGV4dFRvQ29tcGFyZS5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMubW92ZWRUZXh0VG9Db21wYXJlLnNldChjdXJyZW50U3luY2VkTW92ZWRUZXh0ID8gdGhpcy5fbGFzdERpZmYubW92ZXMuZmluZChtID0+IG0ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5pbnRlcnNlY3QoY3VycmVudFN5bmNlZE1vdmVkVGV4dC5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkKSkgOiB1bmRlZmluZWQsIHR4KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBlbnN1cmVNb2RpZmllZExpbmVJc1Zpc2libGUobGluZU51bWJlcjogbnVtYmVyLCBwcmVmZXJlbmNlOiBSZXZlYWxQcmVmZXJlbmNlLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZGlmZi5nZXQoKT8ubWFwcGluZ3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVuY2hhbmdlZFJlZ2lvbnMgPSB0aGlzLl91bmNoYW5nZWRSZWdpb25zLmdldCgpPy5yZWdpb25zIHx8IFtdO1xuXHRcdGZvciAoY29uc3QgciBvZiB1bmNoYW5nZWRSZWdpb25zKSB7XG5cdFx0XHRpZiAoci5nZXRIaWRkZW5Nb2RpZmllZFJhbmdlKHVuZGVmaW5lZCkuY29udGFpbnMobGluZU51bWJlcikpIHtcblx0XHRcdFx0ci5zaG93TW9kaWZpZWRMaW5lKGxpbmVOdW1iZXIsIHByZWZlcmVuY2UsIHR4KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBlbnN1cmVPcmlnaW5hbExpbmVJc1Zpc2libGUobGluZU51bWJlcjogbnVtYmVyLCBwcmVmZXJlbmNlOiBSZXZlYWxQcmVmZXJlbmNlLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZGlmZi5nZXQoKT8ubWFwcGluZ3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVuY2hhbmdlZFJlZ2lvbnMgPSB0aGlzLl91bmNoYW5nZWRSZWdpb25zLmdldCgpPy5yZWdpb25zIHx8IFtdO1xuXHRcdGZvciAoY29uc3QgciBvZiB1bmNoYW5nZWRSZWdpb25zKSB7XG5cdFx0XHRpZiAoci5nZXRIaWRkZW5PcmlnaW5hbFJhbmdlKHVuZGVmaW5lZCkuY29udGFpbnMobGluZU51bWJlcikpIHtcblx0XHRcdFx0ci5zaG93T3JpZ2luYWxMaW5lKGxpbmVOdW1iZXIsIHByZWZlcmVuY2UsIHR4KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyB3YWl0Rm9yRGlmZigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUodGhpcy5pc0RpZmZVcFRvRGF0ZSwgcyA9PiBzLCB1bmRlZmluZWQsIHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKS5jYXRjaChyZWplY3RJZk5vdENhbmNlbGVkKTtcblx0fVxuXG5cdHB1YmxpYyBzZXJpYWxpemVTdGF0ZSgpOiBTZXJpYWxpemVkU3RhdGUge1xuXHRcdGNvbnN0IHJlZ2lvbnMgPSB0aGlzLl91bmNoYW5nZWRSZWdpb25zLmdldCgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb2xsYXBzZWRSZWdpb25zOiByZWdpb25zPy5yZWdpb25zLm1hcChyID0+ICh7IHJhbmdlOiByLmdldEhpZGRlbk1vZGlmaWVkUmFuZ2UodW5kZWZpbmVkKS5zZXJpYWxpemUoKSB9KSlcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHJlc3RvcmVTZXJpYWxpemVkU3RhdGUoc3RhdGU6IFNlcmlhbGl6ZWRTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJhbmdlcyA9IHN0YXRlLmNvbGxhcHNlZFJlZ2lvbnM/Lm1hcChyID0+IExpbmVSYW5nZS5kZXNlcmlhbGl6ZShyLnJhbmdlKSk7XG5cdFx0Y29uc3QgcmVnaW9ucyA9IHRoaXMuX3VuY2hhbmdlZFJlZ2lvbnMuZ2V0KCk7XG5cdFx0aWYgKCFyZWdpb25zIHx8ICFyYW5nZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIHJlZ2lvbnMucmVnaW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlcykge1xuXHRcdFx0XHRcdGlmIChyLm1vZGlmaWVkVW5jaGFuZ2VkUmFuZ2UuaW50ZXJzZWN0KHJhbmdlKSkge1xuXHRcdFx0XHRcdFx0ci5zZXRIaWRkZW5Nb2RpZmllZFJhbmdlKHJhbmdlLCB0eCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBub3JtYWxpemVEb2N1bWVudERpZmYoZGlmZjogSURvY3VtZW50RGlmZiwgb3JpZ2luYWw6IElUZXh0TW9kZWwsIG1vZGlmaWVkOiBJVGV4dE1vZGVsKTogSURvY3VtZW50RGlmZiB7XG5cdHJldHVybiB7XG5cdFx0Y2hhbmdlczogZGlmZi5jaGFuZ2VzLm1hcChjID0+IG5ldyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcoXG5cdFx0XHRjLm9yaWdpbmFsLFxuXHRcdFx0Yy5tb2RpZmllZCxcblx0XHRcdGMuaW5uZXJDaGFuZ2VzID8gYy5pbm5lckNoYW5nZXMubWFwKGkgPT4gbm9ybWFsaXplUmFuZ2VNYXBwaW5nKGksIG9yaWdpbmFsLCBtb2RpZmllZCkpIDogdW5kZWZpbmVkXG5cdFx0KSksXG5cdFx0bW92ZXM6IGRpZmYubW92ZXMsXG5cdFx0aWRlbnRpY2FsOiBkaWZmLmlkZW50aWNhbCxcblx0XHRxdWl0RWFybHk6IGRpZmYucXVpdEVhcmx5LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVSYW5nZU1hcHBpbmcocmFuZ2VNYXBwaW5nOiBSYW5nZU1hcHBpbmcsIG9yaWdpbmFsOiBJVGV4dE1vZGVsLCBtb2RpZmllZDogSVRleHRNb2RlbCk6IFJhbmdlTWFwcGluZyB7XG5cdGxldCBvcmlnaW5hbFJhbmdlID0gcmFuZ2VNYXBwaW5nLm9yaWdpbmFsUmFuZ2U7XG5cdGxldCBtb2RpZmllZFJhbmdlID0gcmFuZ2VNYXBwaW5nLm1vZGlmaWVkUmFuZ2U7XG5cdGlmIChcblx0XHRvcmlnaW5hbFJhbmdlLnN0YXJ0Q29sdW1uID09PSAxICYmIG1vZGlmaWVkUmFuZ2Uuc3RhcnRDb2x1bW4gPT09IDEgJiZcblx0XHQob3JpZ2luYWxSYW5nZS5lbmRDb2x1bW4gIT09IDEgfHwgbW9kaWZpZWRSYW5nZS5lbmRDb2x1bW4gIT09IDEpICYmXG5cdFx0b3JpZ2luYWxSYW5nZS5lbmRDb2x1bW4gPT09IG9yaWdpbmFsLmdldExpbmVNYXhDb2x1bW4ob3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyKVxuXHRcdCYmIG1vZGlmaWVkUmFuZ2UuZW5kQ29sdW1uID09PSBtb2RpZmllZC5nZXRMaW5lTWF4Q29sdW1uKG1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlcilcblx0XHQmJiBvcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXIgPCBvcmlnaW5hbC5nZXRMaW5lQ291bnQoKVxuXHRcdCYmIG1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlciA8IG1vZGlmaWVkLmdldExpbmVDb3VudCgpXG5cdCkge1xuXHRcdG9yaWdpbmFsUmFuZ2UgPSBvcmlnaW5hbFJhbmdlLnNldEVuZFBvc2l0aW9uKG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlciArIDEsIDEpO1xuXHRcdG1vZGlmaWVkUmFuZ2UgPSBtb2RpZmllZFJhbmdlLnNldEVuZFBvc2l0aW9uKG1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlciArIDEsIDEpO1xuXHR9XG5cdHJldHVybiBuZXcgUmFuZ2VNYXBwaW5nKG9yaWdpbmFsUmFuZ2UsIG1vZGlmaWVkUmFuZ2UpO1xufVxuXG5pbnRlcmZhY2UgU2VyaWFsaXplZFN0YXRlIHtcblx0Y29sbGFwc2VkUmVnaW9uczogeyByYW5nZTogSVNlcmlhbGl6ZWRMaW5lUmFuZ2UgfVtdIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgRGlmZlN0YXRlIHtcblx0cHVibGljIHN0YXRpYyBmcm9tRGlmZlJlc3VsdChyZXN1bHQ6IElEb2N1bWVudERpZmYpOiBEaWZmU3RhdGUge1xuXHRcdHJldHVybiBuZXcgRGlmZlN0YXRlKFxuXHRcdFx0cmVzdWx0LmNoYW5nZXMubWFwKGMgPT4gbmV3IERpZmZNYXBwaW5nKGMpKSxcblx0XHRcdHJlc3VsdC5tb3ZlcyB8fCBbXSxcblx0XHRcdHJlc3VsdC5pZGVudGljYWwsXG5cdFx0XHRyZXN1bHQucXVpdEVhcmx5LFxuXHRcdCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWFwcGluZ3M6IHJlYWRvbmx5IERpZmZNYXBwaW5nW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vdmVkVGV4dHM6IHJlYWRvbmx5IE1vdmVkVGV4dFtdLFxuXHRcdHB1YmxpYyByZWFkb25seSBpZGVudGljYWw6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHF1aXRFYXJseTogYm9vbGVhbixcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIERpZmZNYXBwaW5nIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbGluZVJhbmdlTWFwcGluZzogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLFxuXHQpIHtcblx0XHQvKlxuXHRcdHJlYWRvbmx5IG1vdmVkVG86IE1vdmVkVGV4dCB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBtb3ZlZEZyb206IE1vdmVkVGV4dCB8IHVuZGVmaW5lZCxcblxuXHRcdGlmIChtb3ZlZFRvKSB7XG5cdFx0XHRhc3NlcnRGbigoKSA9PlxuXHRcdFx0XHRtb3ZlZFRvLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWRSYW5nZS5lcXVhbHMobGluZVJhbmdlTWFwcGluZy5tb2RpZmllZFJhbmdlKVxuXHRcdFx0XHQmJiBsaW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsUmFuZ2UuaXNFbXB0eVxuXHRcdFx0XHQmJiAhbW92ZWRGcm9tXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSBpZiAobW92ZWRGcm9tKSB7XG5cdFx0XHRhc3NlcnRGbigoKSA9PlxuXHRcdFx0XHRtb3ZlZEZyb20ubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbFJhbmdlLmVxdWFscyhsaW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsUmFuZ2UpXG5cdFx0XHRcdCYmIGxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWRSYW5nZS5pc0VtcHR5XG5cdFx0XHRcdCYmICFtb3ZlZFRvXG5cdFx0XHQpO1xuXHRcdH1cblx0XHQqL1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmNoYW5nZWRSZWdpb24ge1xuXHRwdWJsaWMgc3RhdGljIGZyb21EaWZmcyhcblx0XHRjaGFuZ2VzOiByZWFkb25seSBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSxcblx0XHRvcmlnaW5hbExpbmVDb3VudDogbnVtYmVyLFxuXHRcdG1vZGlmaWVkTGluZUNvdW50OiBudW1iZXIsXG5cdFx0bWluSGlkZGVuTGluZUNvdW50OiBudW1iZXIsXG5cdFx0bWluQ29udGV4dDogbnVtYmVyLFxuXHQpOiBVbmNoYW5nZWRSZWdpb25bXSB7XG5cdFx0Y29uc3QgaW52ZXJzZWRNYXBwaW5ncyA9IERldGFpbGVkTGluZVJhbmdlTWFwcGluZy5pbnZlcnNlKGNoYW5nZXMsIG9yaWdpbmFsTGluZUNvdW50LCBtb2RpZmllZExpbmVDb3VudCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBVbmNoYW5nZWRSZWdpb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBtYXBwaW5nIG9mIGludmVyc2VkTWFwcGluZ3MpIHtcblx0XHRcdGxldCBvcmlnU3RhcnQgPSBtYXBwaW5nLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGxldCBtb2RTdGFydCA9IG1hcHBpbmcubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0bGV0IGxlbmd0aCA9IG1hcHBpbmcub3JpZ2luYWwubGVuZ3RoO1xuXG5cdFx0XHRjb25zdCBhdFN0YXJ0ID0gb3JpZ1N0YXJ0ID09PSAxICYmIG1vZFN0YXJ0ID09PSAxO1xuXHRcdFx0Y29uc3QgYXRFbmQgPSBvcmlnU3RhcnQgKyBsZW5ndGggPT09IG9yaWdpbmFsTGluZUNvdW50ICsgMSAmJiBtb2RTdGFydCArIGxlbmd0aCA9PT0gbW9kaWZpZWRMaW5lQ291bnQgKyAxO1xuXG5cdFx0XHRpZiAoKGF0U3RhcnQgfHwgYXRFbmQpICYmIGxlbmd0aCA+PSBtaW5Db250ZXh0ICsgbWluSGlkZGVuTGluZUNvdW50KSB7XG5cdFx0XHRcdGlmIChhdFN0YXJ0ICYmICFhdEVuZCkge1xuXHRcdFx0XHRcdGxlbmd0aCAtPSBtaW5Db250ZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhdEVuZCAmJiAhYXRTdGFydCkge1xuXHRcdFx0XHRcdG9yaWdTdGFydCArPSBtaW5Db250ZXh0O1xuXHRcdFx0XHRcdG1vZFN0YXJ0ICs9IG1pbkNvbnRleHQ7XG5cdFx0XHRcdFx0bGVuZ3RoIC09IG1pbkNvbnRleHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IFVuY2hhbmdlZFJlZ2lvbihvcmlnU3RhcnQsIG1vZFN0YXJ0LCBsZW5ndGgsIDAsIDApKTtcblx0XHRcdH0gZWxzZSBpZiAobGVuZ3RoID49IG1pbkNvbnRleHQgKiAyICsgbWluSGlkZGVuTGluZUNvdW50KSB7XG5cdFx0XHRcdG9yaWdTdGFydCArPSBtaW5Db250ZXh0O1xuXHRcdFx0XHRtb2RTdGFydCArPSBtaW5Db250ZXh0O1xuXHRcdFx0XHRsZW5ndGggLT0gbWluQ29udGV4dCAqIDI7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5ldyBVbmNoYW5nZWRSZWdpb24ob3JpZ1N0YXJ0LCBtb2RTdGFydCwgbGVuZ3RoLCAwLCAwKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb3JpZ2luYWxVbmNoYW5nZWRSYW5nZSgpOiBMaW5lUmFuZ2Uge1xuXHRcdHJldHVybiBMaW5lUmFuZ2Uub2ZMZW5ndGgodGhpcy5vcmlnaW5hbExpbmVOdW1iZXIsIHRoaXMubGluZUNvdW50KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbW9kaWZpZWRVbmNoYW5nZWRSYW5nZSgpOiBMaW5lUmFuZ2Uge1xuXHRcdHJldHVybiBMaW5lUmFuZ2Uub2ZMZW5ndGgodGhpcy5tb2RpZmllZExpbmVOdW1iZXIsIHRoaXMubGluZUNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVMaW5lQ291bnRUb3AgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAwKTtcblx0cHVibGljIHJlYWRvbmx5IHZpc2libGVMaW5lQ291bnRUb3A6IElTZXR0YWJsZU9ic2VydmFibGU8bnVtYmVyPiA9IHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3A7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZUxpbmVDb3VudEJvdHRvbSA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXI+KHRoaXMsIDApO1xuXHRwdWJsaWMgcmVhZG9ubHkgdmlzaWJsZUxpbmVDb3VudEJvdHRvbTogSVNldHRhYmxlT2JzZXJ2YWJsZTxudW1iZXI+ID0gdGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRIaWRlQ29udHJvbHMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIGlzVmlzaWJsZSAqL1xuXHRcdHRoaXMudmlzaWJsZUxpbmVDb3VudFRvcC5yZWFkKHJlYWRlcikgKyB0aGlzLnZpc2libGVMaW5lQ291bnRCb3R0b20ucmVhZChyZWFkZXIpID09PSB0aGlzLmxpbmVDb3VudCAmJiAhdGhpcy5pc0RyYWdnZWQucmVhZChyZWFkZXIpKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNEcmFnZ2VkID0gb2JzZXJ2YWJsZVZhbHVlPHVuZGVmaW5lZCB8ICdib3R0b20nIHwgJ3RvcCc+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG9yaWdpbmFsTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RpZmllZExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGluZUNvdW50OiBudW1iZXIsXG5cdFx0dmlzaWJsZUxpbmVDb3VudFRvcDogbnVtYmVyLFxuXHRcdHZpc2libGVMaW5lQ291bnRCb3R0b206IG51bWJlcixcblx0KSB7XG5cdFx0Y29uc3QgdmlzaWJsZUxpbmVDb3VudFRvcDIgPSBNYXRoLm1heChNYXRoLm1pbih2aXNpYmxlTGluZUNvdW50VG9wLCB0aGlzLmxpbmVDb3VudCksIDApO1xuXHRcdGNvbnN0IHZpc2libGVMaW5lQ291bnRCb3R0b20yID0gTWF0aC5tYXgoTWF0aC5taW4odmlzaWJsZUxpbmVDb3VudEJvdHRvbSwgdGhpcy5saW5lQ291bnQgLSB2aXNpYmxlTGluZUNvdW50VG9wKSwgMCk7XG5cblx0XHRzb2Z0QXNzZXJ0KHZpc2libGVMaW5lQ291bnRUb3AgPT09IHZpc2libGVMaW5lQ291bnRUb3AyKTtcblx0XHRzb2Z0QXNzZXJ0KHZpc2libGVMaW5lQ291bnRCb3R0b20gPT09IHZpc2libGVMaW5lQ291bnRCb3R0b20yKTtcblxuXHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3Auc2V0KHZpc2libGVMaW5lQ291bnRUb3AyLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uc2V0KHZpc2libGVMaW5lQ291bnRCb3R0b20yLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIHNldFZpc2libGVSYW5nZXModmlzaWJsZVJhbmdlczogTGluZVJhbmdlTWFwcGluZ1tdLCB0eDogSVRyYW5zYWN0aW9uKTogVW5jaGFuZ2VkUmVnaW9uW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogVW5jaGFuZ2VkUmVnaW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IGhpZGRlbk1vZGlmaWVkID0gbmV3IExpbmVSYW5nZVNldCh2aXNpYmxlUmFuZ2VzLm1hcChyID0+IHIubW9kaWZpZWQpKS5zdWJ0cmFjdEZyb20odGhpcy5tb2RpZmllZFVuY2hhbmdlZFJhbmdlKTtcblxuXHRcdGxldCBvcmlnaW5hbFN0YXJ0TGluZU51bWJlciA9IHRoaXMub3JpZ2luYWxMaW5lTnVtYmVyO1xuXHRcdGxldCBtb2RpZmllZFN0YXJ0TGluZU51bWJlciA9IHRoaXMubW9kaWZpZWRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IG1vZGlmaWVkRW5kTGluZU51bWJlckV4ID0gdGhpcy5tb2RpZmllZExpbmVOdW1iZXIgKyB0aGlzLmxpbmVDb3VudDtcblx0XHRpZiAoaGlkZGVuTW9kaWZpZWQucmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5zaG93QWxsKHR4KTtcblx0XHRcdHJlc3VsdC5wdXNoKHRoaXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgaSA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2YgaGlkZGVuTW9kaWZpZWQucmFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IGlzTGFzdCA9IGkgPT09IGhpZGRlbk1vZGlmaWVkLnJhbmdlcy5sZW5ndGggLSAxO1xuXHRcdFx0XHRpKys7XG5cblx0XHRcdFx0Y29uc3QgbGVuZ3RoID0gKGlzTGFzdCA/IG1vZGlmaWVkRW5kTGluZU51bWJlckV4IDogci5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlKSAtIG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1IgPSBuZXcgVW5jaGFuZ2VkUmVnaW9uKG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLCBtb2RpZmllZFN0YXJ0TGluZU51bWJlciwgbGVuZ3RoLCAwLCAwKTtcblx0XHRcdFx0bmV3Ui5zZXRIaWRkZW5Nb2RpZmllZFJhbmdlKHIsIHR4KTtcblx0XHRcdFx0cmVzdWx0LnB1c2gobmV3Uik7XG5cblx0XHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXIgPSBuZXdSLm9yaWdpbmFsVW5jaGFuZ2VkUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTtcblx0XHRcdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXIgPSBuZXdSLm1vZGlmaWVkVW5jaGFuZ2VkUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHNob3VsZEhpZGVDb250cm9scyhyZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc2hvdWxkSGlkZUNvbnRyb2xzLnJlYWQocmVhZGVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRIaWRkZW5PcmlnaW5hbFJhbmdlKHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCk6IExpbmVSYW5nZSB7XG5cdFx0cmV0dXJuIExpbmVSYW5nZS5vZkxlbmd0aChcblx0XHRcdHRoaXMub3JpZ2luYWxMaW5lTnVtYmVyICsgdGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5yZWFkKHJlYWRlciksXG5cdFx0XHR0aGlzLmxpbmVDb3VudCAtIHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3AucmVhZChyZWFkZXIpIC0gdGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5yZWFkKHJlYWRlciksXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRIaWRkZW5Nb2RpZmllZFJhbmdlKHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCk6IExpbmVSYW5nZSB7XG5cdFx0cmV0dXJuIExpbmVSYW5nZS5vZkxlbmd0aChcblx0XHRcdHRoaXMubW9kaWZpZWRMaW5lTnVtYmVyICsgdGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5yZWFkKHJlYWRlciksXG5cdFx0XHR0aGlzLmxpbmVDb3VudCAtIHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3AucmVhZChyZWFkZXIpIC0gdGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5yZWFkKHJlYWRlciksXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzZXRIaWRkZW5Nb2RpZmllZFJhbmdlKHJhbmdlOiBMaW5lUmFuZ2UsIHR4OiBJVHJhbnNhY3Rpb24pIHtcblx0XHRjb25zdCB2aXNpYmxlTGluZUNvdW50VG9wID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gdGhpcy5tb2RpZmllZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgdmlzaWJsZUxpbmVDb3VudEJvdHRvbSA9ICh0aGlzLm1vZGlmaWVkTGluZU51bWJlciArIHRoaXMubGluZUNvdW50KSAtIHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cdFx0dGhpcy5zZXRTdGF0ZSh2aXNpYmxlTGluZUNvdW50VG9wLCB2aXNpYmxlTGluZUNvdW50Qm90dG9tLCB0eCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWF4VmlzaWJsZUxpbmVDb3VudFRvcCgpIHtcblx0XHRyZXR1cm4gdGhpcy5saW5lQ291bnQgLSB0aGlzLl92aXNpYmxlTGluZUNvdW50Qm90dG9tLmdldCgpO1xuXHR9XG5cblx0cHVibGljIGdldE1heFZpc2libGVMaW5lQ291bnRCb3R0b20oKSB7XG5cdFx0cmV0dXJuIHRoaXMubGluZUNvdW50IC0gdGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93TW9yZUFib3ZlKGNvdW50ID0gMTAsIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBtYXhWaXNpYmxlTGluZUNvdW50VG9wID0gdGhpcy5nZXRNYXhWaXNpYmxlTGluZUNvdW50VG9wKCk7XG5cdFx0dGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5zZXQoTWF0aC5taW4odGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5nZXQoKSArIGNvdW50LCBtYXhWaXNpYmxlTGluZUNvdW50VG9wKSwgdHgpO1xuXHR9XG5cblx0cHVibGljIHNob3dNb3JlQmVsb3coY291bnQgPSAxMCwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG1heFZpc2libGVMaW5lQ291bnRCb3R0b20gPSB0aGlzLmxpbmVDb3VudCAtIHRoaXMuX3Zpc2libGVMaW5lQ291bnRUb3AuZ2V0KCk7XG5cdFx0dGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5zZXQoTWF0aC5taW4odGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5nZXQoKSArIGNvdW50LCBtYXhWaXNpYmxlTGluZUNvdW50Qm90dG9tKSwgdHgpO1xuXHR9XG5cblx0cHVibGljIHNob3dBbGwodHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uc2V0KHRoaXMubGluZUNvdW50IC0gdGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5nZXQoKSwgdHgpO1xuXHR9XG5cblx0cHVibGljIHNob3dNb2RpZmllZExpbmUobGluZU51bWJlcjogbnVtYmVyLCBwcmVmZXJlbmNlOiBSZXZlYWxQcmVmZXJlbmNlLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9wID0gbGluZU51bWJlciArIDEgLSAodGhpcy5tb2RpZmllZExpbmVOdW1iZXIgKyB0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLmdldCgpKTtcblx0XHRjb25zdCBib3R0b20gPSAodGhpcy5tb2RpZmllZExpbmVOdW1iZXIgLSB0aGlzLl92aXNpYmxlTGluZUNvdW50Qm90dG9tLmdldCgpICsgdGhpcy5saW5lQ291bnQpIC0gbGluZU51bWJlcjtcblx0XHRpZiAocHJlZmVyZW5jZSA9PT0gUmV2ZWFsUHJlZmVyZW5jZS5Gcm9tQ2xvc2VyU2lkZSAmJiB0b3AgPCBib3R0b20gfHwgcHJlZmVyZW5jZSA9PT0gUmV2ZWFsUHJlZmVyZW5jZS5Gcm9tVG9wKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLnNldCh0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLmdldCgpICsgdG9wLCB0eCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uc2V0KHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uZ2V0KCkgKyBib3R0b20sIHR4KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2hvd09yaWdpbmFsTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIHByZWZlcmVuY2U6IFJldmVhbFByZWZlcmVuY2UsIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB0b3AgPSBsaW5lTnVtYmVyIC0gdGhpcy5vcmlnaW5hbExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgYm90dG9tID0gKHRoaXMub3JpZ2luYWxMaW5lTnVtYmVyICsgdGhpcy5saW5lQ291bnQpIC0gbGluZU51bWJlcjtcblx0XHRpZiAocHJlZmVyZW5jZSA9PT0gUmV2ZWFsUHJlZmVyZW5jZS5Gcm9tQ2xvc2VyU2lkZSAmJiB0b3AgPCBib3R0b20gfHwgcHJlZmVyZW5jZSA9PT0gUmV2ZWFsUHJlZmVyZW5jZS5Gcm9tVG9wKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLnNldChNYXRoLm1pbih0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLmdldCgpICsgYm90dG9tIC0gdG9wLCB0aGlzLmdldE1heFZpc2libGVMaW5lQ291bnRUb3AoKSksIHR4KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5zZXQoTWF0aC5taW4odGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5nZXQoKSArIHRvcCAtIGJvdHRvbSwgdGhpcy5nZXRNYXhWaXNpYmxlTGluZUNvdW50Qm90dG9tKCkpLCB0eCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNvbGxhcHNlQWxsKHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlTGluZUNvdW50VG9wLnNldCgwLCB0eCk7XG5cdFx0dGhpcy5fdmlzaWJsZUxpbmVDb3VudEJvdHRvbS5zZXQoMCwgdHgpO1xuXHR9XG5cblx0cHVibGljIHNldFN0YXRlKHZpc2libGVMaW5lQ291bnRUb3A6IG51bWJlciwgdmlzaWJsZUxpbmVDb3VudEJvdHRvbTogbnVtYmVyLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dmlzaWJsZUxpbmVDb3VudFRvcCA9IE1hdGgubWF4KE1hdGgubWluKHZpc2libGVMaW5lQ291bnRUb3AsIHRoaXMubGluZUNvdW50KSwgMCk7XG5cdFx0dmlzaWJsZUxpbmVDb3VudEJvdHRvbSA9IE1hdGgubWF4KE1hdGgubWluKHZpc2libGVMaW5lQ291bnRCb3R0b20sIHRoaXMubGluZUNvdW50IC0gdmlzaWJsZUxpbmVDb3VudFRvcCksIDApO1xuXG5cdFx0dGhpcy5fdmlzaWJsZUxpbmVDb3VudFRvcC5zZXQodmlzaWJsZUxpbmVDb3VudFRvcCwgdHgpO1xuXHRcdHRoaXMuX3Zpc2libGVMaW5lQ291bnRCb3R0b20uc2V0KHZpc2libGVMaW5lQ291bnRCb3R0b20sIHR4KTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBSZXZlYWxQcmVmZXJlbmNlIHtcblx0RnJvbUNsb3NlclNpZGUsXG5cdEZyb21Ub3AsXG5cdEZyb21Cb3R0b20sXG59XG5cbmZ1bmN0aW9uIGFwcGx5T3JpZ2luYWxFZGl0cyhkaWZmOiBJRG9jdW1lbnREaWZmLCB0ZXh0RWRpdHM6IFRleHRFZGl0SW5mb1tdLCBvcmlnaW5hbFRleHRNb2RlbDogSVRleHRNb2RlbCwgbW9kaWZpZWRUZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBJRG9jdW1lbnREaWZmIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHVuZGVmaW5lZDtcblx0Lypcblx0VE9ET0BoZWRpZXRcblx0aWYgKHRleHRFZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZGlmZjtcblx0fVxuXG5cdGNvbnN0IGRpZmYyID0gZmxpcChkaWZmKTtcblx0Y29uc3QgZGlmZjMgPSBhcHBseU1vZGlmaWVkRWRpdHMoZGlmZjIsIHRleHRFZGl0cywgbW9kaWZpZWRUZXh0TW9kZWwsIG9yaWdpbmFsVGV4dE1vZGVsKTtcblx0aWYgKCFkaWZmMykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIGZsaXAoZGlmZjMpOyovXG59XG4vKlxuZnVuY3Rpb24gZmxpcChkaWZmOiBJRG9jdW1lbnREaWZmKTogSURvY3VtZW50RGlmZiB7XG5cdHJldHVybiB7XG5cdFx0Y2hhbmdlczogZGlmZi5jaGFuZ2VzLm1hcChjID0+IGMuZmxpcCgpKSxcblx0XHRtb3ZlczogZGlmZi5tb3Zlcy5tYXAobSA9PiBtLmZsaXAoKSksXG5cdFx0aWRlbnRpY2FsOiBkaWZmLmlkZW50aWNhbCxcblx0XHRxdWl0RWFybHk6IGRpZmYucXVpdEVhcmx5LFxuXHR9O1xufVxuKi9cbmZ1bmN0aW9uIGFwcGx5TW9kaWZpZWRFZGl0cyhkaWZmOiBJRG9jdW1lbnREaWZmLCB0ZXh0RWRpdHM6IFRleHRFZGl0SW5mb1tdLCBvcmlnaW5hbFRleHRNb2RlbDogSVRleHRNb2RlbCwgbW9kaWZpZWRUZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBJRG9jdW1lbnREaWZmIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHVuZGVmaW5lZDtcblx0Lypcblx0VE9ET0BoZWRpZXRcblx0aWYgKHRleHRFZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZGlmZjtcblx0fVxuXHRpZiAoZGlmZi5jaGFuZ2VzLnNvbWUoYyA9PiAhYy5pbm5lckNoYW5nZXMpIHx8IGRpZmYubW92ZXMubGVuZ3RoID4gMCkge1xuXHRcdC8vIFRPRE8gc3VwcG9ydCB0aGVzZSBjYXNlc1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBjaGFuZ2VzID0gYXBwbHlNb2RpZmllZEVkaXRzVG9MaW5lUmFuZ2VNYXBwaW5ncyhkaWZmLmNoYW5nZXMsIHRleHRFZGl0cywgb3JpZ2luYWxUZXh0TW9kZWwsIG1vZGlmaWVkVGV4dE1vZGVsKTtcblxuXHRjb25zdCBtb3ZlcyA9IGRpZmYubW92ZXMubWFwKG0gPT4ge1xuXHRcdGNvbnN0IG5ld01vZGlmaWVkUmFuZ2UgPSBhcHBseUVkaXRUb0xpbmVSYW5nZShtLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQsIHRleHRFZGl0cyk7XG5cdFx0cmV0dXJuIG5ld01vZGlmaWVkUmFuZ2UgPyBuZXcgTW92ZWRUZXh0KFxuXHRcdFx0bmV3IFNpbXBsZUxpbmVSYW5nZU1hcHBpbmcobS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLCBuZXdNb2RpZmllZFJhbmdlKSxcblx0XHRcdGFwcGx5TW9kaWZpZWRFZGl0c1RvTGluZVJhbmdlTWFwcGluZ3MobS5jaGFuZ2VzLCB0ZXh0RWRpdHMsIG9yaWdpbmFsVGV4dE1vZGVsLCBtb2RpZmllZFRleHRNb2RlbCksXG5cdFx0KSA6IHVuZGVmaW5lZDtcblx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0cmV0dXJuIHtcblx0XHRpZGVudGljYWw6IGZhbHNlLFxuXHRcdHF1aXRFYXJseTogZmFsc2UsXG5cdFx0Y2hhbmdlcyxcblx0XHRtb3Zlcyxcblx0fTsqL1xufVxuLypcbmZ1bmN0aW9uIGFwcGx5RWRpdFRvTGluZVJhbmdlKHJhbmdlOiBMaW5lUmFuZ2UsIHRleHRFZGl0czogVGV4dEVkaXRJbmZvW10pOiBMaW5lUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRsZXQgcmFuZ2VTdGFydExpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdGxldCByYW5nZUVuZExpbmVOdW1iZXJFeCA9IHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cblx0Zm9yIChsZXQgaSA9IHRleHRFZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdGNvbnN0IHRleHRFZGl0ID0gdGV4dEVkaXRzW2ldO1xuXHRcdGNvbnN0IHRleHRFZGl0U3RhcnRMaW5lTnVtYmVyID0gbGVuZ3RoR2V0TGluZUNvdW50KHRleHRFZGl0LnN0YXJ0T2Zmc2V0KSArIDE7XG5cdFx0Y29uc3QgdGV4dEVkaXRFbmRMaW5lTnVtYmVyID0gbGVuZ3RoR2V0TGluZUNvdW50KHRleHRFZGl0LmVuZE9mZnNldCkgKyAxO1xuXHRcdGNvbnN0IG5ld0xlbmd0aExpbmVDb3VudCA9IGxlbmd0aEdldExpbmVDb3VudCh0ZXh0RWRpdC5uZXdMZW5ndGgpO1xuXHRcdGNvbnN0IGRlbHRhID0gbmV3TGVuZ3RoTGluZUNvdW50IC0gKHRleHRFZGl0RW5kTGluZU51bWJlciAtIHRleHRFZGl0U3RhcnRMaW5lTnVtYmVyKTtcblxuXHRcdGlmICh0ZXh0RWRpdEVuZExpbmVOdW1iZXIgPCByYW5nZVN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Ly8gdGhlIHRleHQgZWRpdCBpcyBiZWZvcmUgdXNcblx0XHRcdHJhbmdlU3RhcnRMaW5lTnVtYmVyICs9IGRlbHRhO1xuXHRcdFx0cmFuZ2VFbmRMaW5lTnVtYmVyRXggKz0gZGVsdGE7XG5cdFx0fSBlbHNlIGlmICh0ZXh0RWRpdFN0YXJ0TGluZU51bWJlciA+IHJhbmdlRW5kTGluZU51bWJlckV4KSB7XG5cdFx0XHQvLyB0aGUgdGV4dCBlZGl0IGlzIGFmdGVyIHVzXG5cdFx0XHQvLyBOT09QXG5cdFx0fSBlbHNlIGlmICh0ZXh0RWRpdFN0YXJ0TGluZU51bWJlciA8IHJhbmdlU3RhcnRMaW5lTnVtYmVyICYmIHJhbmdlRW5kTGluZU51bWJlckV4IDwgdGV4dEVkaXRFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyB0aGUgcmFuZ2UgaXMgZnVsbHkgY29udGFpbmVkIGluIHRoZSB0ZXh0IGVkaXRcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmICh0ZXh0RWRpdFN0YXJ0TGluZU51bWJlciA8IHJhbmdlU3RhcnRMaW5lTnVtYmVyICYmIHRleHRFZGl0RW5kTGluZU51bWJlciA8PSByYW5nZUVuZExpbmVOdW1iZXJFeCkge1xuXHRcdFx0Ly8gdGhlIHRleHQgZWRpdCBlbmRzIGluc2lkZSBvdXIgcmFuZ2Vcblx0XHRcdHJhbmdlU3RhcnRMaW5lTnVtYmVyID0gdGV4dEVkaXRFbmRMaW5lTnVtYmVyICsgMTtcblx0XHRcdHJhbmdlU3RhcnRMaW5lTnVtYmVyICs9IGRlbHRhO1xuXHRcdFx0cmFuZ2VFbmRMaW5lTnVtYmVyRXggKz0gZGVsdGE7XG5cdFx0fSBlbHNlIGlmIChyYW5nZVN0YXJ0TGluZU51bWJlciA8PSB0ZXh0RWRpdFN0YXJ0TGluZU51bWJlciAmJiB0ZXh0RWRpdEVuZExpbmVOdW1iZXIgPCByYW5nZVN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Ly8gdGhlIHRleHQgZWRpdCBzdGFydHMgaW5zaWRlIG91ciByYW5nZVxuXHRcdFx0cmFuZ2VFbmRMaW5lTnVtYmVyRXggPSB0ZXh0RWRpdFN0YXJ0TGluZU51bWJlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmFuZ2VFbmRMaW5lTnVtYmVyRXggKz0gZGVsdGE7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG5ldyBMaW5lUmFuZ2UocmFuZ2VTdGFydExpbmVOdW1iZXIsIHJhbmdlRW5kTGluZU51bWJlckV4KTtcbn1cblxuZnVuY3Rpb24gYXBwbHlNb2RpZmllZEVkaXRzVG9MaW5lUmFuZ2VNYXBwaW5ncyhjaGFuZ2VzOiByZWFkb25seSBMaW5lUmFuZ2VNYXBwaW5nW10sIHRleHRFZGl0czogVGV4dEVkaXRJbmZvW10sIG9yaWdpbmFsVGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBtb2RpZmllZFRleHRNb2RlbDogSVRleHRNb2RlbCk6IExpbmVSYW5nZU1hcHBpbmdbXSB7XG5cdGNvbnN0IGRpZmZUZXh0RWRpdHMgPSBjaGFuZ2VzLmZsYXRNYXAoYyA9PiBjLmlubmVyQ2hhbmdlcyEubWFwKGMgPT4gbmV3IFRleHRFZGl0SW5mbyhcblx0XHRwb3NpdGlvblRvTGVuZ3RoKGMub3JpZ2luYWxSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpLFxuXHRcdHBvc2l0aW9uVG9MZW5ndGgoYy5vcmlnaW5hbFJhbmdlLmdldEVuZFBvc2l0aW9uKCkpLFxuXHRcdGxlbmd0aE9mUmFuZ2UoYy5tb2RpZmllZFJhbmdlKS50b0xlbmd0aCgpLFxuXHQpKSk7XG5cblx0Y29uc3QgY29tYmluZWQgPSBjb21iaW5lVGV4dEVkaXRJbmZvcyhkaWZmVGV4dEVkaXRzLCB0ZXh0RWRpdHMpO1xuXG5cdGxldCBsYXN0T3JpZ2luYWxFbmRPZmZzZXQgPSBsZW5ndGhaZXJvO1xuXHRsZXQgbGFzdE1vZGlmaWVkRW5kT2Zmc2V0ID0gbGVuZ3RoWmVybztcblx0Y29uc3QgcmFuZ2VNYXBwaW5ncyA9IGNvbWJpbmVkLm1hcChjID0+IHtcblx0XHRjb25zdCBtb2RpZmllZFN0YXJ0T2Zmc2V0ID0gbGVuZ3RoQWRkKGxhc3RNb2RpZmllZEVuZE9mZnNldCwgbGVuZ3RoRGlmZk5vbk5lZ2F0aXZlKGxhc3RPcmlnaW5hbEVuZE9mZnNldCwgYy5zdGFydE9mZnNldCkpO1xuXHRcdGxhc3RPcmlnaW5hbEVuZE9mZnNldCA9IGMuZW5kT2Zmc2V0O1xuXHRcdGxhc3RNb2RpZmllZEVuZE9mZnNldCA9IGxlbmd0aEFkZChtb2RpZmllZFN0YXJ0T2Zmc2V0LCBjLm5ld0xlbmd0aCk7XG5cblx0XHRyZXR1cm4gbmV3IFJhbmdlTWFwcGluZyhcblx0XHRcdFJhbmdlLmZyb21Qb3NpdGlvbnMobGVuZ3RoVG9Qb3NpdGlvbihjLnN0YXJ0T2Zmc2V0KSwgbGVuZ3RoVG9Qb3NpdGlvbihjLmVuZE9mZnNldCkpLFxuXHRcdFx0UmFuZ2UuZnJvbVBvc2l0aW9ucyhsZW5ndGhUb1Bvc2l0aW9uKG1vZGlmaWVkU3RhcnRPZmZzZXQpLCBsZW5ndGhUb1Bvc2l0aW9uKGxhc3RNb2RpZmllZEVuZE9mZnNldCkpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdGNvbnN0IG5ld0NoYW5nZXMgPSBsaW5lUmFuZ2VNYXBwaW5nRnJvbVJhbmdlTWFwcGluZ3MoXG5cdFx0cmFuZ2VNYXBwaW5ncyxcblx0XHRvcmlnaW5hbFRleHRNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSxcblx0XHRtb2RpZmllZFRleHRNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSxcblx0KTtcblx0cmV0dXJuIG5ld0NoYW5nZXM7XG59XG4qL1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFrRSxTQUFTLFNBQVMsa0JBQWtCLDJCQUEyQixpQkFBaUIsYUFBYSxvQkFBb0I7QUFDbkwsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBK0IsV0FBVyxvQkFBb0I7QUFDOUQsU0FBUyxnQ0FBZ0M7QUFHekMsU0FBUywwQkFBMEIsa0JBQWtCLG9CQUFvQjtBQUd6RSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtCQUFrQjtBQUVwQixJQUFNLHNCQUFOLGNBQWtDLFdBQTJDO0FBQUEsRUFxRG5GLFlBQ2lCLE9BQ0MsVUFDNkIsNkJBQzdDO0FBQ0QsVUFBTTtBQUpVO0FBQ0M7QUFDNkI7QUF2RC9DLFNBQWlCLGtCQUFrQixnQkFBeUIsTUFBTSxLQUFLO0FBQ3ZFLFNBQWdCLGlCQUF1QyxLQUFLO0FBRzVELFNBQWlCLFFBQVEsZ0JBQXVDLE1BQU0s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
