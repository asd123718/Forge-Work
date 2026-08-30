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
import { $, addDisposableListener } from "../../../../../../base/browser/dom.js";
import { ArrayQueue } from "../../../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableValue } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { assertReturnsDefined } from "../../../../../../base/common/types.js";
import { applyFontInfo } from "../../../../config/domFontInfo.js";
import { diffDeleteDecoration, diffRemoveIcon } from "../../registrations.contribution.js";
import { DiffMapping } from "../../diffEditorViewModel.js";
import { InlineDiffDeletedCodeMargin } from "./inlineDiffDeletedCodeMargin.js";
import { LineSource, RenderOptions, renderLines } from "./renderLines.js";
import { animatedObservable, joinCombine } from "../../utils.js";
import { EditorOption } from "../../../../../common/config/editorOptions.js";
import { LineRange } from "../../../../../common/core/ranges/lineRange.js";
import { Position } from "../../../../../common/core/position.js";
import { ScrollType } from "../../../../../common/editorCommon.js";
import { BackgroundTokenizationState } from "../../../../../common/tokenizationTextModelPart.js";
import { IClipboardService } from "../../../../../../platform/clipboard/common/clipboardService.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { Range } from "../../../../../common/core/range.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../common/viewModel/inlineDecorations.js";
let DiffEditorViewZones = class extends Disposable {
  constructor(_targetWindow, _editors, _diffModel, _options, _diffEditorWidget, _canIgnoreViewZoneUpdateEvent, _origViewZonesToIgnore, _modViewZonesToIgnore, _clipboardService, _contextMenuService) {
    super();
    this._targetWindow = _targetWindow;
    this._editors = _editors;
    this._diffModel = _diffModel;
    this._options = _options;
    this._diffEditorWidget = _diffEditorWidget;
    this._canIgnoreViewZoneUpdateEvent = _canIgnoreViewZoneUpdateEvent;
    this._origViewZonesToIgnore = _origViewZonesToIgnore;
    this._modViewZonesToIgnore = _modViewZonesToIgnore;
    this._clipboardService = _clipboardService;
    this._contextMenuService = _contextMenuService;
    this._originalTopPadding = observableValue(this, 0);
    this._originalScrollOffset = observableValue(this, 0);
    this._originalScrollOffsetAnimated = animatedObservable(this._targetWindow, this._originalScrollOffset, this._store);
    this._modifiedTopPadding = observableValue(this, 0);
    this._modifiedScrollOffset = observableValue(this, 0);
    this._modifiedScrollOffsetAnimated = animatedObservable(this._targetWindow, this._modifiedScrollOffset, this._store);
    const state = observableValue("invalidateAlignmentsState", 0);
    const updateImmediately = this._register(new RunOnceScheduler(() => {
      state.set(state.get() + 1, void 0);
    }, 0));
    this._register(this._editors.original.onDidChangeViewZones((_args) => {
      if (!this._canIgnoreViewZoneUpdateEvent()) {
        updateImmediately.schedule();
      }
    }));
    this._register(this._editors.modified.onDidChangeViewZones((_args) => {
      if (!this._canIgnoreViewZoneUpdateEvent()) {
        updateImmediately.schedule();
      }
    }));
    this._register(this._editors.original.onDidChangeConfiguration((args) => {
      if (args.hasChanged(EditorOption.wrappingInfo) || args.hasChanged(EditorOption.lineHeight)) {
        updateImmediately.schedule();
      }
    }));
    this._register(this._editors.modified.onDidChangeConfiguration((args) => {
      if (args.hasChanged(EditorOption.wrappingInfo) || args.hasChanged(EditorOption.lineHeight)) {
        updateImmediately.schedule();
      }
    }));
    const originalModelTokenizationCompleted = this._diffModel.map(
      (m) => m ? observableFromEvent(this, m.model.original.onDidChangeTokens, () => m.model.original.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) : void 0
    ).map((m, reader) => m?.read(reader));
    const alignments = derived((reader) => {
      const diffModel = this._diffModel.read(reader);
      const diff = diffModel?.diff.read(reader);
      if (!diffModel || !diff) {
        return null;
      }
      state.read(reader);
      const renderSideBySide = this._options.renderSideBySide.read(reader);
      const innerHunkAlignment = renderSideBySide;
      return computeRangeAlignment(
        this._editors.original,
        this._editors.modified,
        diff.mappings,
        this._origViewZonesToIgnore,
        this._modViewZonesToIgnore,
        innerHunkAlignment
      );
    });
    const alignmentsSyncedMovedText = derived((reader) => {
      const syncedMovedText = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
      if (!syncedMovedText) {
        return null;
      }
      state.read(reader);
      const mappings = syncedMovedText.changes.map((c) => new DiffMapping(c));
      return computeRangeAlignment(
        this._editors.original,
        this._editors.modified,
        mappings,
        this._origViewZonesToIgnore,
        this._modViewZonesToIgnore,
        true
      );
    });
    function createFakeLinesDiv() {
      const r = document.createElement("div");
      r.className = "diagonal-fill";
      return r;
    }
    const alignmentViewZonesDisposables = this._register(new DisposableStore());
    this.viewZones = derived(this, (reader) => {
      alignmentViewZonesDisposables.clear();
      const alignmentsVal = alignments.read(reader) || [];
      const origViewZones = [];
      const modViewZones = [];
      const modifiedTopPaddingVal = this._modifiedTopPadding.read(reader);
      if (modifiedTopPaddingVal > 0) {
        modViewZones.push({
          afterLineNumber: 0,
          domNode: document.createElement("div"),
          heightInPx: modifiedTopPaddingVal,
          showInHiddenAreas: true,
          suppressMouseDown: true
        });
      }
      const originalTopPaddingVal = this._originalTopPadding.read(reader);
      if (originalTopPaddingVal > 0) {
        origViewZones.push({
          afterLineNumber: 0,
          domNode: document.createElement("div"),
          heightInPx: originalTopPaddingVal,
          showInHiddenAreas: true,
          suppressMouseDown: true
        });
      }
      const renderSideBySide = this._options.renderSideBySide.read(reader);
      const context = {
        getLineContent: (lineNumber) => {
          return this._editors.original.getModel().getLineContent(lineNumber);
        },
        getLineInjectedText: (lineNumber) => {
          return null;
        }
      };
      const deletedCodeLineBreaksComputer = !renderSideBySide ? this._editors.modified._getViewModel()?.createLineBreaksComputer(context) : void 0;
      if (deletedCodeLineBreaksComputer) {
        const originalModel = this._editors.original.getModel();
        for (const a of alignmentsVal) {
          if (a.diff) {
            for (let i = a.originalRange.startLineNumber; i < a.originalRange.endLineNumberExclusive; i++) {
              if (i > originalModel.getLineCount()) {
                return { orig: origViewZones, mod: modViewZones };
              }
              deletedCodeLineBreaksComputer?.addRequest(i, null);
            }
          }
        }
      }
      const lineBreakData = deletedCodeLineBreaksComputer?.finalize() ?? [];
      let lineBreakDataIdx = 0;
      const modLineHeight = this._editors.modified.getOption(EditorOption.lineHeight);
      const syncedMovedText = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
      const mightContainNonBasicASCII = this._editors.original.getModel()?.mightContainNonBasicASCII() ?? false;
      const mightContainRTL = this._editors.original.getModel()?.mightContainRTL() ?? false;
      const renderOptions = RenderOptions.fromEditor(this._editors.modified);
      for (const a of alignmentsVal) {
        if (a.diff && !renderSideBySide && (!this._options.useTrueInlineDiffRendering.read(reader) || !allowsTrueInlineDiffRendering(a.diff))) {
          if (!a.originalRange.isEmpty) {
            originalModelTokenizationCompleted.read(reader);
            const deletedCodeDomNode = document.createElement("div");
            deletedCodeDomNode.classList.add("view-lines", "line-delete", "line-delete-selectable", "monaco-mouse-cursor-text");
            const originalModel = this._editors.original.getModel();
            if (a.originalRange.endLineNumberExclusive - 1 > originalModel.getLineCount()) {
              return { orig: origViewZones, mod: modViewZones };
            }
            const source = new LineSource(
              a.originalRange.mapToLineArray((l) => originalModel.tokenization.getLineTokens(l)),
              a.originalRange.mapToLineArray((_) => lineBreakData[lineBreakDataIdx++]),
              mightContainNonBasicASCII,
              mightContainRTL
            );
            const decorations = [];
            for (const i of a.diff.innerChanges || []) {
              decorations.push(new InlineDecoration(
                i.originalRange.delta(-(a.diff.original.startLineNumber - 1)),
                diffDeleteDecoration.className,
                InlineDecorationType.Regular
              ));
            }
            const result = renderLines(source, renderOptions, decorations, deletedCodeDomNode);
            const marginDomNode2 = document.createElement("div");
            marginDomNode2.className = "inline-deleted-margin-view-zone";
            applyFontInfo(marginDomNode2, renderOptions.fontInfo);
            if (this._options.renderIndicators.read(reader)) {
              for (let i = 0; i < result.heightInLines; i++) {
                const marginElement = document.createElement("div");
                marginElement.className = `delete-sign ${ThemeIcon.asClassName(diffRemoveIcon)}`;
                marginElement.setAttribute("style", `position:absolute;top:${i * modLineHeight}px;width:${renderOptions.lineDecorationsWidth}px;height:${modLineHeight}px;right:0;`);
                marginDomNode2.appendChild(marginElement);
              }
            }
            let zoneId = void 0;
            alignmentViewZonesDisposables.add(
              new InlineDiffDeletedCodeMargin(
                () => assertReturnsDefined(zoneId),
                marginDomNode2,
                deletedCodeDomNode,
                this._editors.modified,
                a.diff,
                this._diffEditorWidget,
                result,
                this._editors.original.getModel(),
                this._contextMenuService,
                this._clipboardService
              )
            );
            for (let i = 0; i < result.viewLineCounts.length; i++) {
              const count = result.viewLineCounts[i];
              if (count > 1) {
                origViewZones.push({
                  afterLineNumber: a.originalRange.startLineNumber + i,
                  domNode: createFakeLinesDiv(),
                  heightInPx: (count - 1) * modLineHeight,
                  showInHiddenAreas: true,
                  suppressMouseDown: true
                });
              }
            }
            modViewZones.push({
              afterLineNumber: a.modifiedRange.startLineNumber - 1,
              domNode: deletedCodeDomNode,
              heightInPx: result.heightInLines * modLineHeight,
              minWidthInPx: result.minWidthInPx,
              marginDomNode: marginDomNode2,
              setZoneId(id) {
                zoneId = id;
              },
              showInHiddenAreas: true,
              suppressMouseDown: false
            });
          }
          const marginDomNode = document.createElement("div");
          marginDomNode.className = "gutter-delete";
          origViewZones.push({
            afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
            domNode: createFakeLinesDiv(),
            heightInPx: a.modifiedHeightInPx,
            marginDomNode,
            showInHiddenAreas: true,
            suppressMouseDown: true
          });
        } else {
          const delta = a.modifiedHeightInPx - a.originalHeightInPx;
          if (delta > 0) {
            if (syncedMovedText?.lineRangeMapping.original.delta(-1).deltaLength(2).contains(a.originalRange.endLineNumberExclusive - 1)) {
              continue;
            }
            origViewZones.push({
              afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
              domNode: createFakeLinesDiv(),
              heightInPx: delta,
              showInHiddenAreas: true,
              suppressMouseDown: true
            });
          } else {
            let createViewZoneMarginArrow2 = function() {
              const arrow = document.createElement("div");
              arrow.className = "arrow-revert-change " + ThemeIcon.asClassName(Codicon.arrowRight);
              reader.store.add(addDisposableListener(arrow, "mousedown", (e) => e.stopPropagation()));
              reader.store.add(addDisposableListener(arrow, "click", (e) => {
                e.stopPropagation();
                _diffEditorWidget.revert(a.diff);
              }));
              return $("div", {}, arrow);
            };
            var createViewZoneMarginArrow = createViewZoneMarginArrow2;
            if (syncedMovedText?.lineRangeMapping.modified.delta(-1).deltaLength(2).contains(a.modifiedRange.endLineNumberExclusive - 1)) {
              continue;
            }
            let marginDomNode = void 0;
            if (a.diff && a.diff.modified.isEmpty && this._options.shouldRenderOldRevertArrows.read(reader)) {
              marginDomNode = createViewZoneMarginArrow2();
            }
            modViewZones.push({
              afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
              domNode: createFakeLinesDiv(),
              heightInPx: -delta,
              marginDomNode,
              showInHiddenAreas: true,
              suppressMouseDown: true
            });
          }
        }
      }
      for (const a of alignmentsSyncedMovedText.read(reader) ?? []) {
        if (!syncedMovedText?.lineRangeMapping.original.intersect(a.originalRange) || !syncedMovedText?.lineRangeMapping.modified.intersect(a.modifiedRange)) {
          continue;
        }
        const delta = a.modifiedHeightInPx - a.originalHeightInPx;
        if (delta > 0) {
          origViewZones.push({
            afterLineNumber: a.originalRange.endLineNumberExclusive - 1,
            domNode: createFakeLinesDiv(),
            heightInPx: delta,
            showInHiddenAreas: true,
            suppressMouseDown: true
          });
        } else {
          modViewZones.push({
            afterLineNumber: a.modifiedRange.endLineNumberExclusive - 1,
            domNode: createFakeLinesDiv(),
            heightInPx: -delta,
            showInHiddenAreas: true,
            suppressMouseDown: true
          });
        }
      }
      return { orig: origViewZones, mod: modViewZones };
    });
    let ignoreChange = false;
    this._register(this._editors.original.onDidScrollChange((e) => {
      if (e.scrollLeftChanged && !ignoreChange) {
        ignoreChange = true;
        this._editors.modified.setScrollLeft(e.scrollLeft);
        ignoreChange = false;
      }
    }));
    this._register(this._editors.modified.onDidScrollChange((e) => {
      if (e.scrollLeftChanged && !ignoreChange) {
        ignoreChange = true;
        this._editors.original.setScrollLeft(e.scrollLeft);
        ignoreChange = false;
      }
    }));
    this._originalScrollTop = observableFromEvent(this._editors.original.onDidScrollChange, () => (
      /** @description original.getScrollTop */
      this._editors.original.getScrollTop()
    ));
    this._modifiedScrollTop = observableFromEvent(this._editors.modified.onDidScrollChange, () => (
      /** @description modified.getScrollTop */
      this._editors.modified.getScrollTop()
    ));
    this._register(autorun((reader) => {
      const newScrollTopModified = this._originalScrollTop.read(reader) - (this._originalScrollOffsetAnimated.read(void 0) - this._modifiedScrollOffsetAnimated.read(reader)) - (this._originalTopPadding.read(void 0) - this._modifiedTopPadding.read(reader));
      if (newScrollTopModified !== this._editors.modified.getScrollTop()) {
        this._editors.modified.setScrollTop(newScrollTopModified, ScrollType.Immediate);
      }
    }));
    this._register(autorun((reader) => {
      const newScrollTopOriginal = this._modifiedScrollTop.read(reader) - (this._modifiedScrollOffsetAnimated.read(void 0) - this._originalScrollOffsetAnimated.read(reader)) - (this._modifiedTopPadding.read(void 0) - this._originalTopPadding.read(reader));
      if (newScrollTopOriginal !== this._editors.original.getScrollTop()) {
        this._editors.original.setScrollTop(newScrollTopOriginal, ScrollType.Immediate);
      }
    }));
    this._register(autorun((reader) => {
      const m = this._diffModel.read(reader)?.movedTextToCompare.read(reader);
      let deltaOrigToMod = 0;
      if (m) {
        const trueTopOriginal = this._editors.original.getTopForLineNumber(m.lineRangeMapping.original.startLineNumber, true) - this._originalTopPadding.read(void 0);
        const trueTopModified = this._editors.modified.getTopForLineNumber(m.lineRangeMapping.modified.startLineNumber, true) - this._modifiedTopPadding.read(void 0);
        deltaOrigToMod = trueTopModified - trueTopOriginal;
      }
      if (deltaOrigToMod > 0) {
        this._modifiedTopPadding.set(0, void 0);
        this._originalTopPadding.set(deltaOrigToMod, void 0);
      } else if (deltaOrigToMod < 0) {
        this._modifiedTopPadding.set(-deltaOrigToMod, void 0);
        this._originalTopPadding.set(0, void 0);
      } else {
        setTimeout(() => {
          this._modifiedTopPadding.set(0, void 0);
          this._originalTopPadding.set(0, void 0);
        }, 400);
      }
      if (this._editors.modified.hasTextFocus()) {
        this._originalScrollOffset.set(this._modifiedScrollOffset.read(void 0) - deltaOrigToMod, void 0, true);
      } else {
        this._modifiedScrollOffset.set(this._originalScrollOffset.read(void 0) + deltaOrigToMod, void 0, true);
      }
    }));
  }
};
DiffEditorViewZones = __decorateClass([
  __decorateParam(8, IClipboardService),
  __decorateParam(9, IContextMenuService)
], DiffEditorViewZones);
function computeRangeAlignment(originalEditor, modifiedEditor, diffs, originalEditorAlignmentViewZones, modifiedEditorAlignmentViewZones, innerHunkAlignment) {
  const originalLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(originalEditor, originalEditorAlignmentViewZones));
  const modifiedLineHeightOverrides = new ArrayQueue(getAdditionalLineHeights(modifiedEditor, modifiedEditorAlignmentViewZones));
  const origLineHeight = originalEditor.getOption(EditorOption.lineHeight);
  const modLineHeight = modifiedEditor.getOption(EditorOption.lineHeight);
  const result = [];
  let lastOriginalLineNumber = 0;
  let lastModifiedLineNumber = 0;
  function handleAlignmentsOutsideOfDiffs(untilOriginalLineNumberExclusive, untilModifiedLineNumberExclusive) {
    while (true) {
      let origNext = originalLineHeightOverrides.peek();
      let modNext = modifiedLineHeightOverrides.peek();
      if (origNext && origNext.lineNumber >= untilOriginalLineNumberExclusive) {
        origNext = void 0;
      }
      if (modNext && modNext.lineNumber >= untilModifiedLineNumberExclusive) {
        modNext = void 0;
      }
      if (!origNext && !modNext) {
        break;
      }
      const distOrig = origNext ? origNext.lineNumber - lastOriginalLineNumber : Number.MAX_VALUE;
      const distNext = modNext ? modNext.lineNumber - lastModifiedLineNumber : Number.MAX_VALUE;
      if (distOrig < distNext) {
        originalLineHeightOverrides.dequeue();
        modNext = {
          lineNumber: origNext.lineNumber - lastOriginalLineNumber + lastModifiedLineNumber,
          heightInPx: 0
        };
      } else if (distOrig > distNext) {
        modifiedLineHeightOverrides.dequeue();
        origNext = {
          lineNumber: modNext.lineNumber - lastModifiedLineNumber + lastOriginalLineNumber,
          heightInPx: 0
        };
      } else {
        originalLineHeightOverrides.dequeue();
        modifiedLineHeightOverrides.dequeue();
      }
      result.push({
        originalRange: LineRange.ofLength(origNext.lineNumber, 1),
        modifiedRange: LineRange.ofLength(modNext.lineNumber, 1),
        originalHeightInPx: origLineHeight + origNext.heightInPx,
        modifiedHeightInPx: modLineHeight + modNext.heightInPx,
        diff: void 0
      });
    }
  }
  for (const m of diffs) {
    let emitAlignment2 = function(origLineNumberExclusive, modLineNumberExclusive, forceAlignment = false) {
      if (origLineNumberExclusive < lastOrigLineNumber || modLineNumberExclusive < lastModLineNumber) {
        return;
      }
      if (first) {
        first = false;
      } else if (!forceAlignment && (origLineNumberExclusive === lastOrigLineNumber || modLineNumberExclusive === lastModLineNumber)) {
        return;
      }
      const originalRange = new LineRange(lastOrigLineNumber, origLineNumberExclusive);
      const modifiedRange = new LineRange(lastModLineNumber, modLineNumberExclusive);
      if (originalRange.isEmpty && modifiedRange.isEmpty) {
        return;
      }
      const originalAdditionalHeight = originalLineHeightOverrides.takeWhile((v) => v.lineNumber < origLineNumberExclusive)?.reduce((p, c2) => p + c2.heightInPx, 0) ?? 0;
      const modifiedAdditionalHeight = modifiedLineHeightOverrides.takeWhile((v) => v.lineNumber < modLineNumberExclusive)?.reduce((p, c2) => p + c2.heightInPx, 0) ?? 0;
      result.push({
        originalRange,
        modifiedRange,
        originalHeightInPx: originalRange.length * origLineHeight + originalAdditionalHeight,
        modifiedHeightInPx: modifiedRange.length * modLineHeight + modifiedAdditionalHeight,
        diff: m.lineRangeMapping
      });
      lastOrigLineNumber = origLineNumberExclusive;
      lastModLineNumber = modLineNumberExclusive;
    };
    var emitAlignment = emitAlignment2;
    const c = m.lineRangeMapping;
    handleAlignmentsOutsideOfDiffs(c.original.startLineNumber, c.modified.startLineNumber);
    let first = true;
    let lastModLineNumber = c.modified.startLineNumber;
    let lastOrigLineNumber = c.original.startLineNumber;
    if (innerHunkAlignment) {
      for (const i of c.innerChanges || []) {
        if (i.originalRange.startColumn > 1 && i.modifiedRange.startColumn > 1) {
          emitAlignment2(i.originalRange.startLineNumber, i.modifiedRange.startLineNumber);
        }
        const originalModel = originalEditor.getModel();
        const maxColumn = i.originalRange.endLineNumber <= originalModel.getLineCount() ? originalModel.getLineMaxColumn(i.originalRange.endLineNumber) : Number.MAX_SAFE_INTEGER;
        if (i.originalRange.endColumn < maxColumn) {
          emitAlignment2(i.originalRange.endLineNumber, i.modifiedRange.endLineNumber);
        }
      }
    }
    emitAlignment2(c.original.endLineNumberExclusive, c.modified.endLineNumberExclusive, true);
    lastOriginalLineNumber = c.original.endLineNumberExclusive;
    lastModifiedLineNumber = c.modified.endLineNumberExclusive;
  }
  handleAlignmentsOutsideOfDiffs(Number.MAX_VALUE, Number.MAX_VALUE);
  return result;
}
function getAdditionalLineHeights(editor, viewZonesToIgnore) {
  const viewZoneHeights = [];
  const wrappingZoneHeights = [];
  const hasWrapping = editor.getOption(EditorOption.wrappingInfo).wrappingColumn !== -1;
  const coordinatesConverter = editor._getViewModel().coordinatesConverter;
  const editorLineHeight = editor.getOption(EditorOption.lineHeight);
  if (hasWrapping) {
    for (let i = 1; i <= editor.getModel().getLineCount(); i++) {
      const lineCount = coordinatesConverter.getModelLineViewLineCount(i);
      if (lineCount > 1) {
        wrappingZoneHeights.push({ lineNumber: i, heightInPx: editorLineHeight * (lineCount - 1) });
      }
    }
  }
  for (const w of editor.getWhitespaces()) {
    if (viewZonesToIgnore.has(w.id)) {
      continue;
    }
    const modelLineNumber = w.afterLineNumber === 0 ? 0 : coordinatesConverter.convertViewPositionToModelPosition(
      new Position(w.afterLineNumber, 1)
    ).lineNumber;
    viewZoneHeights.push({ lineNumber: modelLineNumber, heightInPx: w.height });
  }
  const result = joinCombine(
    viewZoneHeights,
    wrappingZoneHeights,
    (v) => v.lineNumber,
    (v1, v2) => ({ lineNumber: v1.lineNumber, heightInPx: v1.heightInPx + v2.heightInPx })
  );
  return result;
}
function allowsTrueInlineDiffRendering(mapping) {
  if (!mapping.innerChanges) {
    return false;
  }
  return mapping.innerChanges.every(
    (c) => rangeIsSingleLine(c.modifiedRange) && rangeIsSingleLine(c.originalRange) || c.originalRange.equalsRange(new Range(1, 1, 1, 1))
  );
}
function rangeIsSingleLine(range) {
  return range.startLineNumber === range.endLineNumber;
}
export {
  DiffEditorViewZones,
  allowsTrueInlineDiffRendering,
  rangeIsSingleLine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcY29tcG9uZW50c1xcZGlmZkVkaXRvclZpZXdab25lc1xcZGlmZkVkaXRvclZpZXdab25lcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQXJyYXlRdWV1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgYXV0b3J1biwgZGVyaXZlZCwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBhcHBseUZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29uZmlnL2RvbUZvbnRJbmZvLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgZGlmZkRlbGV0ZURlY29yYXRpb24sIGRpZmZSZW1vdmVJY29uIH0gZnJvbSAnLi4vLi4vcmVnaXN0cmF0aW9ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckVkaXRvcnMgfSBmcm9tICcuLi9kaWZmRWRpdG9yRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yVmlld01vZGVsLCBEaWZmTWFwcGluZyB9IGZyb20gJy4uLy4uL2RpZmZFZGl0b3JWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uL2RpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSW5saW5lRGlmZkRlbGV0ZWRDb2RlTWFyZ2luIH0gZnJvbSAnLi9pbmxpbmVEaWZmRGVsZXRlZENvZGVNYXJnaW4uanMnO1xuaW1wb3J0IHsgTGluZVNvdXJjZSwgUmVuZGVyT3B0aW9ucywgcmVuZGVyTGluZXMgfSBmcm9tICcuL3JlbmRlckxpbmVzLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlVmlld1pvbmUsIGFuaW1hdGVkT2JzZXJ2YWJsZSwgam9pbkNvbWJpbmUgfSBmcm9tICcuLi8uLi91dGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBCYWNrZ3JvdW5kVG9rZW5pemF0aW9uU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2RpZmZFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSW5saW5lRGVjb3JhdGlvbiwgSW5saW5lRGVjb3JhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdmlld01vZGVsL2lubGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElMaW5lQnJlYWtzQ29tcHV0ZXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsTGluZVByb2plY3Rpb25EYXRhLmpzJztcblxuLyoqXG4gKiBFbnN1cmVzIGJvdGggZWRpdG9ycyBoYXZlIHRoZSBzYW1lIGhlaWdodCBieSBhbGlnbmluZyB1bmNoYW5nZWQgbGluZXMuXG4gKiBJbiBpbmxpbmUgdmlldyBtb2RlLCBpbnNlcnRzIHZpZXd6b25lcyB0byBzaG93IGRlbGV0ZWQgY29kZSBmcm9tIHRoZSBvcmlnaW5hbCB0ZXh0IG1vZGVsIGluIHRoZSBtb2RpZmllZCBjb2RlIGVkaXRvci5cbiAqIFN5bmNocm9uaXplcyBzY3JvbGxpbmcuXG4gKlxuICogTWFrZSBzdXJlIHRvIGFkZCB0aGUgdmlldyB6b25lcyFcbiAqL1xuZXhwb3J0IGNsYXNzIERpZmZFZGl0b3JWaWV3Wm9uZXMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxUb3BQYWRkaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFNjcm9sbFRvcDogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxTY3JvbGxPZmZzZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsU2Nyb2xsT2Zmc2V0QW5pbWF0ZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRUb3BQYWRkaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZFNjcm9sbFRvcDogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRTY3JvbGxPZmZzZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkU2Nyb2xsT2Zmc2V0QW5pbWF0ZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IHZpZXdab25lczogSU9ic2VydmFibGU8eyBvcmlnOiBJT2JzZXJ2YWJsZVZpZXdab25lW107IG1vZDogSU9ic2VydmFibGVWaWV3Wm9uZVtdIH0+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhcmdldFdpbmRvdzogV2luZG93LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcnM6IERpZmZFZGl0b3JFZGl0b3JzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZNb2RlbDogSU9ic2VydmFibGU8RGlmZkVkaXRvclZpZXdNb2RlbCB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogRGlmZkVkaXRvck9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlmZkVkaXRvcldpZGdldDogRGlmZkVkaXRvcldpZGdldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYW5JZ25vcmVWaWV3Wm9uZVVwZGF0ZUV2ZW50OiAoKSA9PiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29yaWdWaWV3Wm9uZXNUb0lnbm9yZTogU2V0PHN0cmluZz4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kVmlld1pvbmVzVG9JZ25vcmU6IFNldDxzdHJpbmc+LFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fb3JpZ2luYWxUb3BQYWRkaW5nID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIDApO1xuXHRcdHRoaXMuX29yaWdpbmFsU2Nyb2xsT2Zmc2V0ID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlciwgYm9vbGVhbj4odGhpcywgMCk7XG5cdFx0dGhpcy5fb3JpZ2luYWxTY3JvbGxPZmZzZXRBbmltYXRlZCA9IGFuaW1hdGVkT2JzZXJ2YWJsZSh0aGlzLl90YXJnZXRXaW5kb3csIHRoaXMuX29yaWdpbmFsU2Nyb2xsT2Zmc2V0LCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fbW9kaWZpZWRUb3BQYWRkaW5nID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIDApO1xuXHRcdHRoaXMuX21vZGlmaWVkU2Nyb2xsT2Zmc2V0ID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlciwgYm9vbGVhbj4odGhpcywgMCk7XG5cdFx0dGhpcy5fbW9kaWZpZWRTY3JvbGxPZmZzZXRBbmltYXRlZCA9IGFuaW1hdGVkT2JzZXJ2YWJsZSh0aGlzLl90YXJnZXRXaW5kb3csIHRoaXMuX21vZGlmaWVkU2Nyb2xsT2Zmc2V0LCB0aGlzLl9zdG9yZSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSgnaW52YWxpZGF0ZUFsaWdubWVudHNTdGF0ZScsIDApO1xuXG5cdFx0Y29uc3QgdXBkYXRlSW1tZWRpYXRlbHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRzdGF0ZS5zZXQoc3RhdGUuZ2V0KCkgKyAxLCB1bmRlZmluZWQpO1xuXHRcdH0sIDApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvcnMub3JpZ2luYWwub25EaWRDaGFuZ2VWaWV3Wm9uZXMoKF9hcmdzKSA9PiB7IGlmICghdGhpcy5fY2FuSWdub3JlVmlld1pvbmVVcGRhdGVFdmVudCgpKSB7IHVwZGF0ZUltbWVkaWF0ZWx5LnNjaGVkdWxlKCk7IH0gfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQub25EaWRDaGFuZ2VWaWV3Wm9uZXMoKF9hcmdzKSA9PiB7IGlmICghdGhpcy5fY2FuSWdub3JlVmlld1pvbmVVcGRhdGVFdmVudCgpKSB7IHVwZGF0ZUltbWVkaWF0ZWx5LnNjaGVkdWxlKCk7IH0gfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvcnMub3JpZ2luYWwub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChhcmdzKSA9PiB7XG5cdFx0XHRpZiAoYXJncy5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pIHx8IGFyZ3MuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGluZUhlaWdodCkpIHsgdXBkYXRlSW1tZWRpYXRlbHkuc2NoZWR1bGUoKTsgfVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoYXJncykgPT4ge1xuXHRcdFx0aWYgKGFyZ3MuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvKSB8fCBhcmdzLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpKSB7IHVwZGF0ZUltbWVkaWF0ZWx5LnNjaGVkdWxlKCk7IH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBvcmlnaW5hbE1vZGVsVG9rZW5pemF0aW9uQ29tcGxldGVkID0gdGhpcy5fZGlmZk1vZGVsLm1hcChtID0+XG5cdFx0XHRtID8gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBtLm1vZGVsLm9yaWdpbmFsLm9uRGlkQ2hhbmdlVG9rZW5zLCAoKSA9PiBtLm1vZGVsLm9yaWdpbmFsLnRva2VuaXphdGlvbi5iYWNrZ3JvdW5kVG9rZW5pemF0aW9uU3RhdGUgPT09IEJhY2tncm91bmRUb2tlbml6YXRpb25TdGF0ZS5Db21wbGV0ZWQpIDogdW5kZWZpbmVkXG5cdFx0KS5tYXAoKG0sIHJlYWRlcikgPT4gbT8ucmVhZChyZWFkZXIpKTtcblxuXHRcdGNvbnN0IGFsaWdubWVudHMgPSBkZXJpdmVkPElMaW5lUmFuZ2VBbGlnbm1lbnRbXSB8IG51bGw+KChyZWFkZXIpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gYWxpZ25tZW50cyAqL1xuXHRcdFx0Y29uc3QgZGlmZk1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRpZmYgPSBkaWZmTW9kZWw/LmRpZmYucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFkaWZmTW9kZWwgfHwgIWRpZmYpIHsgcmV0dXJuIG51bGw7IH1cblx0XHRcdHN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHJlbmRlclNpZGVCeVNpZGUgPSB0aGlzLl9vcHRpb25zLnJlbmRlclNpZGVCeVNpZGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaW5uZXJIdW5rQWxpZ25tZW50ID0gcmVuZGVyU2lkZUJ5U2lkZTtcblx0XHRcdHJldHVybiBjb21wdXRlUmFuZ2VBbGlnbm1lbnQoXG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMub3JpZ2luYWwsXG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQsXG5cdFx0XHRcdGRpZmYubWFwcGluZ3MsXG5cdFx0XHRcdHRoaXMuX29yaWdWaWV3Wm9uZXNUb0lnbm9yZSxcblx0XHRcdFx0dGhpcy5fbW9kVmlld1pvbmVzVG9JZ25vcmUsXG5cdFx0XHRcdGlubmVySHVua0FsaWdubWVudFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFsaWdubWVudHNTeW5jZWRNb3ZlZFRleHQgPSBkZXJpdmVkPElMaW5lUmFuZ2VBbGlnbm1lbnRbXSB8IG51bGw+KChyZWFkZXIpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gYWxpZ25tZW50c1N5bmNlZE1vdmVkVGV4dCAqL1xuXHRcdFx0Y29uc3Qgc3luY2VkTW92ZWRUZXh0ID0gdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKT8ubW92ZWRUZXh0VG9Db21wYXJlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghc3luY2VkTW92ZWRUZXh0KSB7IHJldHVybiBudWxsOyB9XG5cdFx0XHRzdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBtYXBwaW5ncyA9IHN5bmNlZE1vdmVkVGV4dC5jaGFuZ2VzLm1hcChjID0+IG5ldyBEaWZmTWFwcGluZyhjKSk7XG5cdFx0XHQvLyBUT0RPIGRvbnQgaW5jbHVkZSBhbGlnbm1lbnRzIG91dHNpZGUgc3luY2VkTW92ZWRUZXh0XG5cdFx0XHRyZXR1cm4gY29tcHV0ZVJhbmdlQWxpZ25tZW50KFxuXHRcdFx0XHR0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLFxuXHRcdFx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLFxuXHRcdFx0XHRtYXBwaW5ncyxcblx0XHRcdFx0dGhpcy5fb3JpZ1ZpZXdab25lc1RvSWdub3JlLFxuXHRcdFx0XHR0aGlzLl9tb2RWaWV3Wm9uZXNUb0lnbm9yZSxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUZha2VMaW5lc0RpdigpOiBIVE1MRWxlbWVudCB7XG5cdFx0XHRjb25zdCByID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRyLmNsYXNzTmFtZSA9ICdkaWFnb25hbC1maWxsJztcblx0XHRcdHJldHVybiByO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsaWdubWVudFZpZXdab25lc0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLnZpZXdab25lcyA9IGRlcml2ZWQ8eyBvcmlnOiBJT2JzZXJ2YWJsZVZpZXdab25lW107IG1vZDogSU9ic2VydmFibGVWaWV3Wm9uZVtdIH0+KHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRcdGFsaWdubWVudFZpZXdab25lc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IGFsaWdubWVudHNWYWwgPSBhbGlnbm1lbnRzLnJlYWQocmVhZGVyKSB8fCBbXTtcblxuXHRcdFx0Y29uc3Qgb3JpZ1ZpZXdab25lczogSU9ic2VydmFibGVWaWV3Wm9uZVtdID0gW107XG5cdFx0XHRjb25zdCBtb2RWaWV3Wm9uZXM6IElPYnNlcnZhYmxlVmlld1pvbmVbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBtb2RpZmllZFRvcFBhZGRpbmdWYWwgPSB0aGlzLl9tb2RpZmllZFRvcFBhZGRpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKG1vZGlmaWVkVG9wUGFkZGluZ1ZhbCA+IDApIHtcblx0XHRcdFx0bW9kVmlld1pvbmVzLnB1c2goe1xuXHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogMCxcblx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHRcdFx0XHRoZWlnaHRJblB4OiBtb2RpZmllZFRvcFBhZGRpbmdWYWwsXG5cdFx0XHRcdFx0c2hvd0luSGlkZGVuQXJlYXM6IHRydWUsXG5cdFx0XHRcdFx0c3VwcHJlc3NNb3VzZURvd246IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxUb3BQYWRkaW5nVmFsID0gdGhpcy5fb3JpZ2luYWxUb3BQYWRkaW5nLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChvcmlnaW5hbFRvcFBhZGRpbmdWYWwgPiAwKSB7XG5cdFx0XHRcdG9yaWdWaWV3Wm9uZXMucHVzaCh7XG5cdFx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiAwLFxuXHRcdFx0XHRcdGRvbU5vZGU6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0XHRcdGhlaWdodEluUHg6IG9yaWdpbmFsVG9wUGFkZGluZ1ZhbCxcblx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRzdXBwcmVzc01vdXNlRG93bjogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlbmRlclNpZGVCeVNpZGUgPSB0aGlzLl9vcHRpb25zLnJlbmRlclNpZGVCeVNpZGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY29udGV4dDogSUxpbmVCcmVha3NDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRcdGdldExpbmVDb250ZW50OiAobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5nZXRNb2RlbCgpIS5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0TGluZUluamVjdGVkVGV4dDogKGxpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGVsZXRlZENvZGVMaW5lQnJlYWtzQ29tcHV0ZXIgPSAhcmVuZGVyU2lkZUJ5U2lkZSA/IHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuX2dldFZpZXdNb2RlbCgpPy5jcmVhdGVMaW5lQnJlYWtzQ29tcHV0ZXIoY29udGV4dCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZGVsZXRlZENvZGVMaW5lQnJlYWtzQ29tcHV0ZXIpIHtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxNb2RlbCA9IHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdGZvciAoY29uc3QgYSBvZiBhbGlnbm1lbnRzVmFsKSB7XG5cdFx0XHRcdFx0aWYgKGEuZGlmZikge1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IGEub3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXI7IGkgPCBhLm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGBpYCBjYW4gYmUgb3V0IG9mIGJvdW5kIHdoZW4gdGhlIGRpZmYgaGFzIG5vdCBiZWVuIHVwZGF0ZWQgeWV0LlxuXHRcdFx0XHRcdFx0XHQvLyBJbiB0aGlzIGNhc2UsIHdlIGRvIGFuIGVhcmx5IHJldHVybi5cblx0XHRcdFx0XHRcdFx0Ly8gVE9ET0BoZWRpZXQ6IEZpeCB0aGlzIGJ5IGFwcGx5aW5nIHRoZSBlZGl0IGRpcmVjdGx5IHRvIHRoZSBkaWZmIG1vZGVsLCBzbyB0aGF0IHRoZSBkaWZmIGlzIGFsd2F5cyB2YWxpZC5cblx0XHRcdFx0XHRcdFx0aWYgKGkgPiBvcmlnaW5hbE1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgb3JpZzogb3JpZ1ZpZXdab25lcywgbW9kOiBtb2RWaWV3Wm9uZXMgfTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRkZWxldGVkQ29kZUxpbmVCcmVha3NDb21wdXRlcj8uYWRkUmVxdWVzdChpLCBudWxsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZUJyZWFrRGF0YSA9IGRlbGV0ZWRDb2RlTGluZUJyZWFrc0NvbXB1dGVyPy5maW5hbGl6ZSgpID8/IFtdO1xuXHRcdFx0bGV0IGxpbmVCcmVha0RhdGFJZHggPSAwO1xuXG5cdFx0XHRjb25zdCBtb2RMaW5lSGVpZ2h0ID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXG5cdFx0XHRjb25zdCBzeW5jZWRNb3ZlZFRleHQgPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpPy5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBtaWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJID0gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5nZXRNb2RlbCgpPy5taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJKCkgPz8gZmFsc2U7XG5cdFx0XHRjb25zdCBtaWdodENvbnRhaW5SVEwgPSB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmdldE1vZGVsKCk/Lm1pZ2h0Q29udGFpblJUTCgpID8/IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVuZGVyT3B0aW9ucyA9IFJlbmRlck9wdGlvbnMuZnJvbUVkaXRvcih0aGlzLl9lZGl0b3JzLm1vZGlmaWVkKTtcblxuXHRcdFx0Zm9yIChjb25zdCBhIG9mIGFsaWdubWVudHNWYWwpIHtcblx0XHRcdFx0aWYgKGEuZGlmZiAmJiAhcmVuZGVyU2lkZUJ5U2lkZSAmJiAoIXRoaXMuX29wdGlvbnMudXNlVHJ1ZUlubGluZURpZmZSZW5kZXJpbmcucmVhZChyZWFkZXIpIHx8ICFhbGxvd3NUcnVlSW5saW5lRGlmZlJlbmRlcmluZyhhLmRpZmYpKSkge1xuXHRcdFx0XHRcdGlmICghYS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsTW9kZWxUb2tlbml6YXRpb25Db21wbGV0ZWQucmVhZChyZWFkZXIpOyAvLyBVcGRhdGUgdmlldy16b25lcyBvbmNlIHRva2VuaXphdGlvbiBjb21wbGV0ZXNcblxuXHRcdFx0XHRcdFx0Y29uc3QgZGVsZXRlZENvZGVEb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0XHRkZWxldGVkQ29kZURvbU5vZGUuY2xhc3NMaXN0LmFkZCgndmlldy1saW5lcycsICdsaW5lLWRlbGV0ZScsICdsaW5lLWRlbGV0ZS1zZWxlY3RhYmxlJywgJ21vbmFjby1tb3VzZS1jdXJzb3ItdGV4dCcpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxNb2RlbCA9IHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0XHQvLyBgYS5vcmlnaW5hbFJhbmdlYCBjYW4gYmUgb3V0IG9mIGJvdW5kIHdoZW4gdGhlIGRpZmYgaGFzIG5vdCBiZWVuIHVwZGF0ZWQgeWV0LlxuXHRcdFx0XHRcdFx0Ly8gSW4gdGhpcyBjYXNlLCB3ZSBkbyBhbiBlYXJseSByZXR1cm4uXG5cdFx0XHRcdFx0XHQvLyBUT0RPQGhlZGlldDogRml4IHRoaXMgYnkgYXBwbHlpbmcgdGhlIGVkaXQgZGlyZWN0bHkgdG8gdGhlIGRpZmYgbW9kZWwsIHNvIHRoYXQgdGhlIGRpZmYgaXMgYWx3YXlzIHZhbGlkLlxuXHRcdFx0XHRcdFx0aWYgKGEub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSA+IG9yaWdpbmFsTW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgb3JpZzogb3JpZ1ZpZXdab25lcywgbW9kOiBtb2RWaWV3Wm9uZXMgfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBMaW5lU291cmNlKFxuXHRcdFx0XHRcdFx0XHRhLm9yaWdpbmFsUmFuZ2UubWFwVG9MaW5lQXJyYXkobCA9PiBvcmlnaW5hbE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGwpKSxcblx0XHRcdFx0XHRcdFx0YS5vcmlnaW5hbFJhbmdlLm1hcFRvTGluZUFycmF5KF8gPT4gbGluZUJyZWFrRGF0YVtsaW5lQnJlYWtEYXRhSWR4KytdKSxcblx0XHRcdFx0XHRcdFx0bWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSxcblx0XHRcdFx0XHRcdFx0bWlnaHRDb250YWluUlRMLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25zOiBJbmxpbmVEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgaSBvZiBhLmRpZmYuaW5uZXJDaGFuZ2VzIHx8IFtdKSB7XG5cdFx0XHRcdFx0XHRcdGRlY29yYXRpb25zLnB1c2gobmV3IElubGluZURlY29yYXRpb24oXG5cdFx0XHRcdFx0XHRcdFx0aS5vcmlnaW5hbFJhbmdlLmRlbHRhKC0oYS5kaWZmLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciAtIDEpKSxcblx0XHRcdFx0XHRcdFx0XHRkaWZmRGVsZXRlRGVjb3JhdGlvbi5jbGFzc05hbWUhLFxuXHRcdFx0XHRcdFx0XHRcdElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXJcblx0XHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSByZW5kZXJMaW5lcyhzb3VyY2UsIHJlbmRlck9wdGlvbnMsIGRlY29yYXRpb25zLCBkZWxldGVkQ29kZURvbU5vZGUpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBtYXJnaW5Eb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0XHRtYXJnaW5Eb21Ob2RlLmNsYXNzTmFtZSA9ICdpbmxpbmUtZGVsZXRlZC1tYXJnaW4tdmlldy16b25lJztcblx0XHRcdFx0XHRcdGFwcGx5Rm9udEluZm8obWFyZ2luRG9tTm9kZSwgcmVuZGVyT3B0aW9ucy5mb250SW5mbyk7XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9vcHRpb25zLnJlbmRlckluZGljYXRvcnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0LmhlaWdodEluTGluZXM7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG1hcmdpbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0XHRcdFx0XHRtYXJnaW5FbGVtZW50LmNsYXNzTmFtZSA9IGBkZWxldGUtc2lnbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShkaWZmUmVtb3ZlSWNvbil9YDtcblx0XHRcdFx0XHRcdFx0XHRtYXJnaW5FbGVtZW50LnNldEF0dHJpYnV0ZSgnc3R5bGUnLCBgcG9zaXRpb246YWJzb2x1dGU7dG9wOiR7aSAqIG1vZExpbmVIZWlnaHR9cHg7d2lkdGg6JHtyZW5kZXJPcHRpb25zLmxpbmVEZWNvcmF0aW9uc1dpZHRofXB4O2hlaWdodDoke21vZExpbmVIZWlnaHR9cHg7cmlnaHQ6MDtgKTtcblx0XHRcdFx0XHRcdFx0XHRtYXJnaW5Eb21Ob2RlLmFwcGVuZENoaWxkKG1hcmdpbkVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGxldCB6b25lSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGFsaWdubWVudFZpZXdab25lc0Rpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0XHRcdFx0bmV3IElubGluZURpZmZEZWxldGVkQ29kZU1hcmdpbihcblx0XHRcdFx0XHRcdFx0XHQoKSA9PiBhc3NlcnRSZXR1cm5zRGVmaW5lZCh6b25lSWQpLFxuXHRcdFx0XHRcdFx0XHRcdG1hcmdpbkRvbU5vZGUsXG5cdFx0XHRcdFx0XHRcdFx0ZGVsZXRlZENvZGVEb21Ob2RlLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQsXG5cdFx0XHRcdFx0XHRcdFx0YS5kaWZmLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2RpZmZFZGl0b3JXaWRnZXQsXG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuZ2V0TW9kZWwoKSEsXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2NsaXBib2FyZFNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0LnZpZXdMaW5lQ291bnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvdW50ID0gcmVzdWx0LnZpZXdMaW5lQ291bnRzW2ldO1xuXHRcdFx0XHRcdFx0XHQvLyBBY2NvdW50IGZvciB3cmFwcGVkIGxpbmVzIGluIHRoZSAoY29sbGFwc2VkKSBvcmlnaW5hbCBlZGl0b3IgKHdoaWNoIGRvZXNuJ3Qgd3JhcCBsaW5lcykuXG5cdFx0XHRcdFx0XHRcdGlmIChjb3VudCA+IDEpIHtcblx0XHRcdFx0XHRcdFx0XHRvcmlnVmlld1pvbmVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiBhLm9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgaSxcblx0XHRcdFx0XHRcdFx0XHRcdGRvbU5vZGU6IGNyZWF0ZUZha2VMaW5lc0RpdigpLFxuXHRcdFx0XHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogKGNvdW50IC0gMSkgKiBtb2RMaW5lSGVpZ2h0LFxuXHRcdFx0XHRcdFx0XHRcdFx0c2hvd0luSGlkZGVuQXJlYXM6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRzdXBwcmVzc01vdXNlRG93bjogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRtb2RWaWV3Wm9uZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogYS5tb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsXG5cdFx0XHRcdFx0XHRcdGRvbU5vZGU6IGRlbGV0ZWRDb2RlRG9tTm9kZSxcblx0XHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogcmVzdWx0LmhlaWdodEluTGluZXMgKiBtb2RMaW5lSGVpZ2h0LFxuXHRcdFx0XHRcdFx0XHRtaW5XaWR0aEluUHg6IHJlc3VsdC5taW5XaWR0aEluUHgsXG5cdFx0XHRcdFx0XHRcdG1hcmdpbkRvbU5vZGUsXG5cdFx0XHRcdFx0XHRcdHNldFpvbmVJZChpZCkgeyB6b25lSWQgPSBpZDsgfSxcblx0XHRcdFx0XHRcdFx0c2hvd0luSGlkZGVuQXJlYXM6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHN1cHByZXNzTW91c2VEb3duOiBmYWxzZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IG1hcmdpbkRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0XHRtYXJnaW5Eb21Ob2RlLmNsYXNzTmFtZSA9ICdndXR0ZXItZGVsZXRlJztcblxuXHRcdFx0XHRcdG9yaWdWaWV3Wm9uZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IGEub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdFx0XHRcdGRvbU5vZGU6IGNyZWF0ZUZha2VMaW5lc0RpdigpLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogYS5tb2RpZmllZEhlaWdodEluUHgsXG5cdFx0XHRcdFx0XHRtYXJnaW5Eb21Ob2RlLFxuXHRcdFx0XHRcdFx0c2hvd0luSGlkZGVuQXJlYXM6IHRydWUsXG5cdFx0XHRcdFx0XHRzdXBwcmVzc01vdXNlRG93bjogdHJ1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBkZWx0YSA9IGEubW9kaWZpZWRIZWlnaHRJblB4IC0gYS5vcmlnaW5hbEhlaWdodEluUHg7XG5cdFx0XHRcdFx0aWYgKGRlbHRhID4gMCkge1xuXHRcdFx0XHRcdFx0aWYgKHN5bmNlZE1vdmVkVGV4dD8ubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbC5kZWx0YSgtMSkuZGVsdGFMZW5ndGgoMikuY29udGFpbnMoYS5vcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0b3JpZ1ZpZXdab25lcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiBhLm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEsXG5cdFx0XHRcdFx0XHRcdGRvbU5vZGU6IGNyZWF0ZUZha2VMaW5lc0RpdigpLFxuXHRcdFx0XHRcdFx0XHRoZWlnaHRJblB4OiBkZWx0YSxcblx0XHRcdFx0XHRcdFx0c2hvd0luSGlkZGVuQXJlYXM6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHN1cHByZXNzTW91c2VEb3duOiB0cnVlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChzeW5jZWRNb3ZlZFRleHQ/LmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuZGVsdGEoLTEpLmRlbHRhTGVuZ3RoKDIpLmNvbnRhaW5zKGEubW9kaWZpZWRSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGZ1bmN0aW9uIGNyZWF0ZVZpZXdab25lTWFyZ2luQXJyb3coKTogSFRNTEVsZW1lbnQge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhcnJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRcdFx0XHRhcnJvdy5jbGFzc05hbWUgPSAnYXJyb3ctcmV2ZXJ0LWNoYW5nZSAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYXJyb3dSaWdodCk7XG5cdFx0XHRcdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGFycm93LCAnbW91c2Vkb3duJywgZSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKSk7XG5cdFx0XHRcdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGFycm93LCAnY2xpY2snLCBlID0+IHtcblx0XHRcdFx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdFx0XHRcdF9kaWZmRWRpdG9yV2lkZ2V0LnJldmVydChhLmRpZmYhKTtcblx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gJCgnZGl2Jywge30sIGFycm93KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0bGV0IG1hcmdpbkRvbU5vZGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0aWYgKGEuZGlmZiAmJiBhLmRpZmYubW9kaWZpZWQuaXNFbXB0eSAmJiB0aGlzLl9vcHRpb25zLnNob3VsZFJlbmRlck9sZFJldmVydEFycm93cy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdFx0bWFyZ2luRG9tTm9kZSA9IGNyZWF0ZVZpZXdab25lTWFyZ2luQXJyb3coKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0bW9kVmlld1pvbmVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IGEubW9kaWZpZWRSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdFx0XHRcdFx0ZG9tTm9kZTogY3JlYXRlRmFrZUxpbmVzRGl2KCksXG5cdFx0XHRcdFx0XHRcdGhlaWdodEluUHg6IC1kZWx0YSxcblx0XHRcdFx0XHRcdFx0bWFyZ2luRG9tTm9kZSxcblx0XHRcdFx0XHRcdFx0c2hvd0luSGlkZGVuQXJlYXM6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHN1cHByZXNzTW91c2VEb3duOiB0cnVlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgYSBvZiBhbGlnbm1lbnRzU3luY2VkTW92ZWRUZXh0LnJlYWQocmVhZGVyKSA/PyBbXSkge1xuXHRcdFx0XHRpZiAoIXN5bmNlZE1vdmVkVGV4dD8ubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbC5pbnRlcnNlY3QoYS5vcmlnaW5hbFJhbmdlKVxuXHRcdFx0XHRcdHx8ICFzeW5jZWRNb3ZlZFRleHQ/LmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaW50ZXJzZWN0KGEubW9kaWZpZWRSYW5nZSkpIHtcblx0XHRcdFx0XHQvLyBpZ25vcmUgdW5yZWxhdGVkIGFsaWdubWVudHMgb3V0c2lkZSB0aGUgc3luY2VkIG1vdmVkIHRleHRcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRlbHRhID0gYS5tb2RpZmllZEhlaWdodEluUHggLSBhLm9yaWdpbmFsSGVpZ2h0SW5QeDtcblx0XHRcdFx0aWYgKGRlbHRhID4gMCkge1xuXHRcdFx0XHRcdG9yaWdWaWV3Wm9uZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IGEub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdFx0XHRcdGRvbU5vZGU6IGNyZWF0ZUZha2VMaW5lc0RpdigpLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogZGVsdGEsXG5cdFx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRcdHN1cHByZXNzTW91c2VEb3duOiB0cnVlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1vZFZpZXdab25lcy5wdXNoKHtcblx0XHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogYS5tb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0XHRcdFx0ZG9tTm9kZTogY3JlYXRlRmFrZUxpbmVzRGl2KCksXG5cdFx0XHRcdFx0XHRoZWlnaHRJblB4OiAtZGVsdGEsXG5cdFx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRcdHN1cHByZXNzTW91c2VEb3duOiB0cnVlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IG9yaWc6IG9yaWdWaWV3Wm9uZXMsIG1vZDogbW9kVmlld1pvbmVzIH07XG5cdFx0fSk7XG5cblx0XHRsZXQgaWdub3JlQ2hhbmdlID0gZmFsc2U7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5vbkRpZFNjcm9sbENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbExlZnRDaGFuZ2VkICYmICFpZ25vcmVDaGFuZ2UpIHtcblx0XHRcdFx0aWdub3JlQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5zZXRTY3JvbGxMZWZ0KGUuc2Nyb2xsTGVmdCk7XG5cdFx0XHRcdGlnbm9yZUNoYW5nZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLm9uRGlkU2Nyb2xsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2Nyb2xsTGVmdENoYW5nZWQgJiYgIWlnbm9yZUNoYW5nZSkge1xuXHRcdFx0XHRpZ25vcmVDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLnNldFNjcm9sbExlZnQoZS5zY3JvbGxMZWZ0KTtcblx0XHRcdFx0aWdub3JlQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fb3JpZ2luYWxTY3JvbGxUb3AgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMuX2VkaXRvcnMub3JpZ2luYWwub25EaWRTY3JvbGxDaGFuZ2UsICgpID0+IC8qKiBAZGVzY3JpcHRpb24gb3JpZ2luYWwuZ2V0U2Nyb2xsVG9wICovIHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuZ2V0U2Nyb2xsVG9wKCkpO1xuXHRcdHRoaXMuX21vZGlmaWVkU2Nyb2xsVG9wID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLm9uRGlkU2Nyb2xsQ2hhbmdlLCAoKSA9PiAvKiogQGRlc2NyaXB0aW9uIG1vZGlmaWVkLmdldFNjcm9sbFRvcCAqLyB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmdldFNjcm9sbFRvcCgpKTtcblxuXHRcdC8vIG9yaWdFeHRyYUhlaWdodCArIG9yaWdPZmZzZXQgLSBvcmlnU2Nyb2xsVG9wID0gbW9kRXh0cmFIZWlnaHQgKyBtb2RPZmZzZXQgLSBtb2RTY3JvbGxUb3BcblxuXHRcdC8vIG9yaWdTY3JvbGxUb3AgPSBvcmlnRXh0cmFIZWlnaHQgKyBvcmlnT2Zmc2V0IC0gbW9kRXh0cmFIZWlnaHQgLSBtb2RPZmZzZXQgKyBtb2RTY3JvbGxUb3Bcblx0XHQvLyBtb2RTY3JvbGxUb3AgPSBtb2RFeHRyYUhlaWdodCArIG1vZE9mZnNldCAtIG9yaWdFeHRyYUhlaWdodCAtIG9yaWdPZmZzZXQgKyBvcmlnU2Nyb2xsVG9wXG5cblx0XHQvLyBvcmlnT2Zmc2V0IC0gbW9kT2Zmc2V0ID0gaGVpZ2h0T2ZMaW5lcygxLi5ZKSAtIGhlaWdodE9mTGluZXMoMS4uWClcblx0XHQvLyBvcmlnU2Nyb2xsVG9wID49IDAsIG1vZFNjcm9sbFRvcCA+PSAwXG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBzY3JvbGwgbW9kaWZpZWQgKi9cblx0XHRcdGNvbnN0IG5ld1Njcm9sbFRvcE1vZGlmaWVkID0gdGhpcy5fb3JpZ2luYWxTY3JvbGxUb3AucmVhZChyZWFkZXIpXG5cdFx0XHRcdC0gKHRoaXMuX29yaWdpbmFsU2Nyb2xsT2Zmc2V0QW5pbWF0ZWQucmVhZCh1bmRlZmluZWQpIC0gdGhpcy5fbW9kaWZpZWRTY3JvbGxPZmZzZXRBbmltYXRlZC5yZWFkKHJlYWRlcikpXG5cdFx0XHRcdC0gKHRoaXMuX29yaWdpbmFsVG9wUGFkZGluZy5yZWFkKHVuZGVmaW5lZCkgLSB0aGlzLl9tb2RpZmllZFRvcFBhZGRpbmcucmVhZChyZWFkZXIpKTtcblx0XHRcdGlmIChuZXdTY3JvbGxUb3BNb2RpZmllZCAhPT0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5nZXRTY3JvbGxUb3AoKSkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnNldFNjcm9sbFRvcChuZXdTY3JvbGxUb3BNb2RpZmllZCwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIHNjcm9sbCBvcmlnaW5hbCAqL1xuXHRcdFx0Y29uc3QgbmV3U2Nyb2xsVG9wT3JpZ2luYWwgPSB0aGlzLl9tb2RpZmllZFNjcm9sbFRvcC5yZWFkKHJlYWRlcilcblx0XHRcdFx0LSAodGhpcy5fbW9kaWZpZWRTY3JvbGxPZmZzZXRBbmltYXRlZC5yZWFkKHVuZGVmaW5lZCkgLSB0aGlzLl9vcmlnaW5hbFNjcm9sbE9mZnNldEFuaW1hdGVkLnJlYWQocmVhZGVyKSlcblx0XHRcdFx0LSAodGhpcy5fbW9kaWZpZWRUb3BQYWRkaW5nLnJlYWQodW5kZWZpbmVkKSAtIHRoaXMuX29yaWdpbmFsVG9wUGFkZGluZy5yZWFkKHJlYWRlcikpO1xuXHRcdFx0aWYgKG5ld1Njcm9sbFRvcE9yaWdpbmFsICE9PSB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmdldFNjcm9sbFRvcCgpKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuc2V0U2Nyb2xsVG9wKG5ld1Njcm9sbFRvcE9yaWdpbmFsLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBlZGl0b3IgdG9wIG9mZnNldHMgKi9cblx0XHRcdGNvbnN0IG0gPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpPy5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRsZXQgZGVsdGFPcmlnVG9Nb2QgPSAwO1xuXHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0Y29uc3QgdHJ1ZVRvcE9yaWdpbmFsID0gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5nZXRUb3BGb3JMaW5lTnVtYmVyKG0ubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIsIHRydWUpIC0gdGhpcy5fb3JpZ2luYWxUb3BQYWRkaW5nLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3QgdHJ1ZVRvcE1vZGlmaWVkID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5nZXRUb3BGb3JMaW5lTnVtYmVyKG0ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsIHRydWUpIC0gdGhpcy5fbW9kaWZpZWRUb3BQYWRkaW5nLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0ZGVsdGFPcmlnVG9Nb2QgPSB0cnVlVG9wTW9kaWZpZWQgLSB0cnVlVG9wT3JpZ2luYWw7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkZWx0YU9yaWdUb01vZCA+IDApIHtcblx0XHRcdFx0dGhpcy5fbW9kaWZpZWRUb3BQYWRkaW5nLnNldCgwLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLl9vcmlnaW5hbFRvcFBhZGRpbmcuc2V0KGRlbHRhT3JpZ1RvTW9kLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChkZWx0YU9yaWdUb01vZCA8IDApIHtcblx0XHRcdFx0dGhpcy5fbW9kaWZpZWRUb3BQYWRkaW5nLnNldCgtZGVsdGFPcmlnVG9Nb2QsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuX29yaWdpbmFsVG9wUGFkZGluZy5zZXQoMCwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX21vZGlmaWVkVG9wUGFkZGluZy5zZXQoMCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLl9vcmlnaW5hbFRvcFBhZGRpbmcuc2V0KDAsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0sIDQwMCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRcdHRoaXMuX29yaWdpbmFsU2Nyb2xsT2Zmc2V0LnNldCh0aGlzLl9tb2RpZmllZFNjcm9sbE9mZnNldC5yZWFkKHVuZGVmaW5lZCkgLSBkZWx0YU9yaWdUb01vZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX21vZGlmaWVkU2Nyb2xsT2Zmc2V0LnNldCh0aGlzLl9vcmlnaW5hbFNjcm9sbE9mZnNldC5yZWFkKHVuZGVmaW5lZCkgKyBkZWx0YU9yaWdUb01vZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElMaW5lUmFuZ2VBbGlnbm1lbnQge1xuXHRvcmlnaW5hbFJhbmdlOiBMaW5lUmFuZ2U7XG5cdG1vZGlmaWVkUmFuZ2U6IExpbmVSYW5nZTtcblxuXHQvLyBhY2NvdW50cyBmb3IgZm9yZWlnbiB2aWV3em9uZXMgYW5kIGxpbmUgd3JhcHBpbmdcblx0b3JpZ2luYWxIZWlnaHRJblB4OiBudW1iZXI7XG5cdG1vZGlmaWVkSGVpZ2h0SW5QeDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBJZiB0aGlzIHJhbmdlIGFsaWdubWVudCBpcyBhIGRpcmVjdCByZXN1bHQgb2YgYSBkaWZmLCB0aGVuIHRoaXMgaXMgdGhlIGRpZmYncyBsaW5lIG1hcHBpbmcuXG5cdCAqIE9ubHkgdXNlZCBmb3IgaW5saW5lLXZpZXcuXG5cdCAqL1xuXHRkaWZmPzogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlUmFuZ2VBbGlnbm1lbnQoXG5cdG9yaWdpbmFsRWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LFxuXHRtb2RpZmllZEVkaXRvcjogQ29kZUVkaXRvcldpZGdldCxcblx0ZGlmZnM6IHJlYWRvbmx5IERpZmZNYXBwaW5nW10sXG5cdG9yaWdpbmFsRWRpdG9yQWxpZ25tZW50Vmlld1pvbmVzOiBSZWFkb25seVNldDxzdHJpbmc+LFxuXHRtb2RpZmllZEVkaXRvckFsaWdubWVudFZpZXdab25lczogUmVhZG9ubHlTZXQ8c3RyaW5nPixcblx0aW5uZXJIdW5rQWxpZ25tZW50OiBib29sZWFuLFxuKTogSUxpbmVSYW5nZUFsaWdubWVudFtdIHtcblx0Y29uc3Qgb3JpZ2luYWxMaW5lSGVpZ2h0T3ZlcnJpZGVzID0gbmV3IEFycmF5UXVldWUoZ2V0QWRkaXRpb25hbExpbmVIZWlnaHRzKG9yaWdpbmFsRWRpdG9yLCBvcmlnaW5hbEVkaXRvckFsaWdubWVudFZpZXdab25lcykpO1xuXHRjb25zdCBtb2RpZmllZExpbmVIZWlnaHRPdmVycmlkZXMgPSBuZXcgQXJyYXlRdWV1ZShnZXRBZGRpdGlvbmFsTGluZUhlaWdodHMobW9kaWZpZWRFZGl0b3IsIG1vZGlmaWVkRWRpdG9yQWxpZ25tZW50Vmlld1pvbmVzKSk7XG5cblx0Y29uc3Qgb3JpZ0xpbmVIZWlnaHQgPSBvcmlnaW5hbEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRjb25zdCBtb2RMaW5lSGVpZ2h0ID0gbW9kaWZpZWRFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblxuXHRjb25zdCByZXN1bHQ6IElMaW5lUmFuZ2VBbGlnbm1lbnRbXSA9IFtdO1xuXG5cdGxldCBsYXN0T3JpZ2luYWxMaW5lTnVtYmVyID0gMDtcblx0bGV0IGxhc3RNb2RpZmllZExpbmVOdW1iZXIgPSAwO1xuXG5cdGZ1bmN0aW9uIGhhbmRsZUFsaWdubWVudHNPdXRzaWRlT2ZEaWZmcyh1bnRpbE9yaWdpbmFsTGluZU51bWJlckV4Y2x1c2l2ZTogbnVtYmVyLCB1bnRpbE1vZGlmaWVkTGluZU51bWJlckV4Y2x1c2l2ZTogbnVtYmVyKSB7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBvcmlnTmV4dCA9IG9yaWdpbmFsTGluZUhlaWdodE92ZXJyaWRlcy5wZWVrKCk7XG5cdFx0XHRsZXQgbW9kTmV4dCA9IG1vZGlmaWVkTGluZUhlaWdodE92ZXJyaWRlcy5wZWVrKCk7XG5cdFx0XHRpZiAob3JpZ05leHQgJiYgb3JpZ05leHQubGluZU51bWJlciA+PSB1bnRpbE9yaWdpbmFsTGluZU51bWJlckV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRvcmlnTmV4dCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChtb2ROZXh0ICYmIG1vZE5leHQubGluZU51bWJlciA+PSB1bnRpbE1vZGlmaWVkTGluZU51bWJlckV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRtb2ROZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFvcmlnTmV4dCAmJiAhbW9kTmV4dCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGlzdE9yaWcgPSBvcmlnTmV4dCA/IG9yaWdOZXh0LmxpbmVOdW1iZXIgLSBsYXN0T3JpZ2luYWxMaW5lTnVtYmVyIDogTnVtYmVyLk1BWF9WQUxVRTtcblx0XHRcdGNvbnN0IGRpc3ROZXh0ID0gbW9kTmV4dCA/IG1vZE5leHQubGluZU51bWJlciAtIGxhc3RNb2RpZmllZExpbmVOdW1iZXIgOiBOdW1iZXIuTUFYX1ZBTFVFO1xuXG5cdFx0XHRpZiAoZGlzdE9yaWcgPCBkaXN0TmV4dCkge1xuXHRcdFx0XHRvcmlnaW5hbExpbmVIZWlnaHRPdmVycmlkZXMuZGVxdWV1ZSgpO1xuXHRcdFx0XHRtb2ROZXh0ID0ge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXI6IG9yaWdOZXh0IS5saW5lTnVtYmVyIC0gbGFzdE9yaWdpbmFsTGluZU51bWJlciArIGxhc3RNb2RpZmllZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0aGVpZ2h0SW5QeDogMCxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoZGlzdE9yaWcgPiBkaXN0TmV4dCkge1xuXHRcdFx0XHRtb2RpZmllZExpbmVIZWlnaHRPdmVycmlkZXMuZGVxdWV1ZSgpO1xuXHRcdFx0XHRvcmlnTmV4dCA9IHtcblx0XHRcdFx0XHRsaW5lTnVtYmVyOiBtb2ROZXh0IS5saW5lTnVtYmVyIC0gbGFzdE1vZGlmaWVkTGluZU51bWJlciArIGxhc3RPcmlnaW5hbExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0aGVpZ2h0SW5QeDogMCxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9yaWdpbmFsTGluZUhlaWdodE92ZXJyaWRlcy5kZXF1ZXVlKCk7XG5cdFx0XHRcdG1vZGlmaWVkTGluZUhlaWdodE92ZXJyaWRlcy5kZXF1ZXVlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0b3JpZ2luYWxSYW5nZTogTGluZVJhbmdlLm9mTGVuZ3RoKG9yaWdOZXh0IS5saW5lTnVtYmVyLCAxKSxcblx0XHRcdFx0bW9kaWZpZWRSYW5nZTogTGluZVJhbmdlLm9mTGVuZ3RoKG1vZE5leHQhLmxpbmVOdW1iZXIsIDEpLFxuXHRcdFx0XHRvcmlnaW5hbEhlaWdodEluUHg6IG9yaWdMaW5lSGVpZ2h0ICsgb3JpZ05leHQhLmhlaWdodEluUHgsXG5cdFx0XHRcdG1vZGlmaWVkSGVpZ2h0SW5QeDogbW9kTGluZUhlaWdodCArIG1vZE5leHQhLmhlaWdodEluUHgsXG5cdFx0XHRcdGRpZmY6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGZvciAoY29uc3QgbSBvZiBkaWZmcykge1xuXHRcdGNvbnN0IGMgPSBtLmxpbmVSYW5nZU1hcHBpbmc7XG5cdFx0aGFuZGxlQWxpZ25tZW50c091dHNpZGVPZkRpZmZzKGMub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyLCBjLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcik7XG5cblx0XHRsZXQgZmlyc3QgPSB0cnVlO1xuXHRcdGxldCBsYXN0TW9kTGluZU51bWJlciA9IGMubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGxldCBsYXN0T3JpZ0xpbmVOdW1iZXIgPSBjLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcjtcblxuXHRcdGZ1bmN0aW9uIGVtaXRBbGlnbm1lbnQob3JpZ0xpbmVOdW1iZXJFeGNsdXNpdmU6IG51bWJlciwgbW9kTGluZU51bWJlckV4Y2x1c2l2ZTogbnVtYmVyLCBmb3JjZUFsaWdubWVudCA9IGZhbHNlKSB7XG5cdFx0XHRpZiAob3JpZ0xpbmVOdW1iZXJFeGNsdXNpdmUgPCBsYXN0T3JpZ0xpbmVOdW1iZXIgfHwgbW9kTGluZU51bWJlckV4Y2x1c2l2ZSA8IGxhc3RNb2RMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChmaXJzdCkge1xuXHRcdFx0XHRmaXJzdCA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICghZm9yY2VBbGlnbm1lbnQgJiYgKG9yaWdMaW5lTnVtYmVyRXhjbHVzaXZlID09PSBsYXN0T3JpZ0xpbmVOdW1iZXIgfHwgbW9kTGluZU51bWJlckV4Y2x1c2l2ZSA9PT0gbGFzdE1vZExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdC8vIFRoaXMgY2F1c2VzIGEgcmUtYWxpZ25tZW50IG9mIGFuIGFscmVhZHkgYWxpZ25lZCBsaW5lLlxuXHRcdFx0XHQvLyBIb3dldmVyLCB3ZSBkb24ndCBjYXJlIGZvciB0aGUgZmluYWwgYWxpZ25tZW50LlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvcmlnaW5hbFJhbmdlID0gbmV3IExpbmVSYW5nZShsYXN0T3JpZ0xpbmVOdW1iZXIsIG9yaWdMaW5lTnVtYmVyRXhjbHVzaXZlKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkUmFuZ2UgPSBuZXcgTGluZVJhbmdlKGxhc3RNb2RMaW5lTnVtYmVyLCBtb2RMaW5lTnVtYmVyRXhjbHVzaXZlKTtcblx0XHRcdGlmIChvcmlnaW5hbFJhbmdlLmlzRW1wdHkgJiYgbW9kaWZpZWRSYW5nZS5pc0VtcHR5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxBZGRpdGlvbmFsSGVpZ2h0ID0gb3JpZ2luYWxMaW5lSGVpZ2h0T3ZlcnJpZGVzXG5cdFx0XHRcdC50YWtlV2hpbGUodiA9PiB2LmxpbmVOdW1iZXIgPCBvcmlnTGluZU51bWJlckV4Y2x1c2l2ZSlcblx0XHRcdFx0Py5yZWR1Y2UoKHAsIGMpID0+IHAgKyBjLmhlaWdodEluUHgsIDApID8/IDA7XG5cdFx0XHRjb25zdCBtb2RpZmllZEFkZGl0aW9uYWxIZWlnaHQgPSBtb2RpZmllZExpbmVIZWlnaHRPdmVycmlkZXNcblx0XHRcdFx0LnRha2VXaGlsZSh2ID0+IHYubGluZU51bWJlciA8IG1vZExpbmVOdW1iZXJFeGNsdXNpdmUpXG5cdFx0XHRcdD8ucmVkdWNlKChwLCBjKSA9PiBwICsgYy5oZWlnaHRJblB4LCAwKSA/PyAwO1xuXG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdG9yaWdpbmFsUmFuZ2UsXG5cdFx0XHRcdG1vZGlmaWVkUmFuZ2UsXG5cdFx0XHRcdG9yaWdpbmFsSGVpZ2h0SW5QeDogb3JpZ2luYWxSYW5nZS5sZW5ndGggKiBvcmlnTGluZUhlaWdodCArIG9yaWdpbmFsQWRkaXRpb25hbEhlaWdodCxcblx0XHRcdFx0bW9kaWZpZWRIZWlnaHRJblB4OiBtb2RpZmllZFJhbmdlLmxlbmd0aCAqIG1vZExpbmVIZWlnaHQgKyBtb2RpZmllZEFkZGl0aW9uYWxIZWlnaHQsXG5cdFx0XHRcdGRpZmY6IG0ubGluZVJhbmdlTWFwcGluZyxcblx0XHRcdH0pO1xuXG5cdFx0XHRsYXN0T3JpZ0xpbmVOdW1iZXIgPSBvcmlnTGluZU51bWJlckV4Y2x1c2l2ZTtcblx0XHRcdGxhc3RNb2RMaW5lTnVtYmVyID0gbW9kTGluZU51bWJlckV4Y2x1c2l2ZTtcblx0XHR9XG5cblx0XHRpZiAoaW5uZXJIdW5rQWxpZ25tZW50KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGkgb2YgYy5pbm5lckNoYW5nZXMgfHwgW10pIHtcblx0XHRcdFx0aWYgKGkub3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbiA+IDEgJiYgaS5tb2RpZmllZFJhbmdlLnN0YXJ0Q29sdW1uID4gMSkge1xuXHRcdFx0XHRcdC8vIFRoZXJlIGlzIHNvbWUgdW5tb2RpZmllZCB0ZXh0IG9uIHRoaXMgbGluZSBiZWZvcmUgdGhlIGRpZmZcblx0XHRcdFx0XHRlbWl0QWxpZ25tZW50KGkub3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsIGkubW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSBvcmlnaW5hbEVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0Ly8gV2hlbiB0aGUgZGlmZiBpcyBpbnZhbGlkLCB0aGUgcmFuZ2VzIG1pZ2h0IGJlIG91dCBvZiBib3VuZHMgKHRoaXMgc2hvdWxkIGJlIGZpeGVkIGluIHRoZSBkaWZmIG1vZGVsIGJ5IGFwcGx5aW5nIGVkaXRzIGRpcmVjdGx5KS5cblx0XHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gaS5vcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXIgPD0gb3JpZ2luYWxNb2RlbC5nZXRMaW5lQ291bnQoKSA/IG9yaWdpbmFsTW9kZWwuZ2V0TGluZU1heENvbHVtbihpLm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlcikgOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0XHRcdFx0aWYgKGkub3JpZ2luYWxSYW5nZS5lbmRDb2x1bW4gPCBtYXhDb2x1bW4pIHtcblx0XHRcdFx0XHQvLyAvLyBUaGVyZSBpcyBzb21lIHVubW9kaWZpZWQgdGV4dCBvbiB0aGlzIGxpbmUgYWZ0ZXIgdGhlIGRpZmZcblx0XHRcdFx0XHRlbWl0QWxpZ25tZW50KGkub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyLCBpLm1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRlbWl0QWxpZ25tZW50KGMub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSwgYy5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLCB0cnVlKTtcblxuXHRcdGxhc3RPcmlnaW5hbExpbmVOdW1iZXIgPSBjLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cdFx0bGFzdE1vZGlmaWVkTGluZU51bWJlciA9IGMubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTtcblx0fVxuXHRoYW5kbGVBbGlnbm1lbnRzT3V0c2lkZU9mRGlmZnMoTnVtYmVyLk1BWF9WQUxVRSwgTnVtYmVyLk1BWF9WQUxVRSk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuaW50ZXJmYWNlIEFkZGl0aW9uYWxMaW5lSGVpZ2h0SW5mbyB7XG5cdGxpbmVOdW1iZXI6IG51bWJlcjtcblx0aGVpZ2h0SW5QeDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBnZXRBZGRpdGlvbmFsTGluZUhlaWdodHMoZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LCB2aWV3Wm9uZXNUb0lnbm9yZTogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IHJlYWRvbmx5IEFkZGl0aW9uYWxMaW5lSGVpZ2h0SW5mb1tdIHtcblx0Y29uc3Qgdmlld1pvbmVIZWlnaHRzOiB7IGxpbmVOdW1iZXI6IG51bWJlcjsgaGVpZ2h0SW5QeDogbnVtYmVyIH1bXSA9IFtdO1xuXHRjb25zdCB3cmFwcGluZ1pvbmVIZWlnaHRzOiB7IGxpbmVOdW1iZXI6IG51bWJlcjsgaGVpZ2h0SW5QeDogbnVtYmVyIH1bXSA9IFtdO1xuXG5cdGNvbnN0IGhhc1dyYXBwaW5nID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvKS53cmFwcGluZ0NvbHVtbiAhPT0gLTE7XG5cdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKSEuY29vcmRpbmF0ZXNDb252ZXJ0ZXI7XG5cdGNvbnN0IGVkaXRvckxpbmVIZWlnaHQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0aWYgKGhhc1dyYXBwaW5nKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb3VudCgpOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IGNvb3JkaW5hdGVzQ29udmVydGVyLmdldE1vZGVsTGluZVZpZXdMaW5lQ291bnQoaSk7XG5cdFx0XHRpZiAobGluZUNvdW50ID4gMSkge1xuXHRcdFx0XHR3cmFwcGluZ1pvbmVIZWlnaHRzLnB1c2goeyBsaW5lTnVtYmVyOiBpLCBoZWlnaHRJblB4OiBlZGl0b3JMaW5lSGVpZ2h0ICogKGxpbmVDb3VudCAtIDEpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZvciAoY29uc3QgdyBvZiBlZGl0b3IuZ2V0V2hpdGVzcGFjZXMoKSkge1xuXHRcdGlmICh2aWV3Wm9uZXNUb0lnbm9yZS5oYXMody5pZCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbExpbmVOdW1iZXIgPSB3LmFmdGVyTGluZU51bWJlciA9PT0gMCA/IDAgOiBjb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKFxuXHRcdFx0bmV3IFBvc2l0aW9uKHcuYWZ0ZXJMaW5lTnVtYmVyLCAxKVxuXHRcdCkubGluZU51bWJlcjtcblx0XHR2aWV3Wm9uZUhlaWdodHMucHVzaCh7IGxpbmVOdW1iZXI6IG1vZGVsTGluZU51bWJlciwgaGVpZ2h0SW5QeDogdy5oZWlnaHQgfSk7XG5cdH1cblxuXHRjb25zdCByZXN1bHQgPSBqb2luQ29tYmluZShcblx0XHR2aWV3Wm9uZUhlaWdodHMsXG5cdFx0d3JhcHBpbmdab25lSGVpZ2h0cyxcblx0XHR2ID0+IHYubGluZU51bWJlcixcblx0XHQodjEsIHYyKSA9PiAoeyBsaW5lTnVtYmVyOiB2MS5saW5lTnVtYmVyLCBoZWlnaHRJblB4OiB2MS5oZWlnaHRJblB4ICsgdjIuaGVpZ2h0SW5QeCB9KVxuXHQpO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd3NUcnVlSW5saW5lRGlmZlJlbmRlcmluZyhtYXBwaW5nOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcpOiBib29sZWFuIHtcblx0aWYgKCFtYXBwaW5nLmlubmVyQ2hhbmdlcykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gbWFwcGluZy5pbm5lckNoYW5nZXMuZXZlcnkoYyA9PlxuXHRcdChyYW5nZUlzU2luZ2xlTGluZShjLm1vZGlmaWVkUmFuZ2UpICYmIHJhbmdlSXNTaW5nbGVMaW5lKGMub3JpZ2luYWxSYW5nZSkpXG5cdFx0fHwgYy5vcmlnaW5hbFJhbmdlLmVxdWFsc1JhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAxKSlcblx0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJhbmdlSXNTaW5nbGVMaW5lKHJhbmdlOiBSYW5nZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSByYW5nZS5lbmRMaW5lTnVtYmVyO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsNkJBQTZCO0FBQ3pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQXNCLFNBQVMsU0FBUyxxQkFBcUIsdUJBQXVCO0FBQ3BGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsc0JBQXNCLHNCQUFzQjtBQUVyRCxTQUE4QixtQkFBbUI7QUFFakQsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxZQUFZLGVBQWUsbUJBQW1CO0FBQ3ZELFNBQThCLG9CQUFvQixtQkFBbUI7QUFDckUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCLDRCQUE0QjtBQVVoRCxJQUFNLHNCQUFOLGNBQWtDLFdBQVc7QUFBQSxFQWFuRCxZQUNrQixlQUNBLFVBQ0EsWUFDQSxVQUNBLG1CQUNBLCtCQUNBLHdCQUNBLHVCQUNtQixtQkFDRSxxQkFDckM7QUFDRCxVQUFNO0FBWFc7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNtQjtBQUNFO0FBR3RDLFNBQUssc0JBQXNCLGdCQUFnQixNQUFNLENBQUM7QUFDbEQsU0FBSyx3QkFB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QUFFLFNBQVMsd0JBQXdCLElBQUk7QUFFeEYsNkJBQXlCLEVBQUUsU0FBUztBQUNwQyw2QkFBeUIsRUFBRSxTQUFTO0FBQUEsRUFDckM7QUFDQSxpQ0FBK0IsT0FBTyxXQUFXLE9BQU8sU0FBUztBQUVqRSxTQUFPO0FBQ1I7QUFPQSxTQUFTLHlCQUF5QixRQUEwQixtQkFBNkU7QUFDeEksUUFBTSxrQkFBZ0UsQ0FBQztBQUN2RSxRQUFNLHNCQUFvRSxDQUFDO0FBRTNFLFFBQU0sY0FBYyxPQUFPLFVBQVUsYUFBYSxZQUFZLEVBQUUsbUJBQW1CO0FBQ25GLFFBQU0sdUJBQXVCLE9BQU8sY0FBYyxFQUFHO0FBQ3JELFFBQU0sbUJBQW1CLE9BQU8sVUFBVSxhQUFhLFVBQVU7QUFDakUsTUFBSSxhQUFhO0FBQ2hCLGFBQVMsSUFBSSxHQUFHLEtBQUssT0FBTyxTQUFTLEVBQUcsYUFBYSxHQUFHLEtBQUs7QUFDNUQsWUFBTSxZQUFZLHFCQUFxQiwwQkFBMEIsQ0FBQztBQUNsRSxVQUFJLFlBQVksR0FBRztBQUNsQiw0QkFBb0IsS0FBSyxFQUFFLFlBQVksR0FBRyxZQUFZLG9CQUFvQixZQUFZLEdBQUcsQ0FBQztBQUFBLE1BQzNGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxhQUFXLEtBQUssT0FBTyxlQUFlLEdBQUc7QUFDeEMsUUFBSSxrQkFBa0IsSUFBSSxFQUFFLEVBQUUsR0FBRztBQUNoQztBQUFBLElBQ0Q7QUFDQSxVQUFNLGtCQUFrQixFQUFFLG9CQUFvQixJQUFJLElBQUkscUJBQXFCO0FBQUEsTUFDMUUsSUFBSSxTQUFTLEVBQUUsaUJBQWlCLENBQUM7QUFBQSxJQUNsQyxFQUFFO0FBQ0Ysb0JBQWdCLEtBQUssRUFBRSxZQUFZLGlCQUFpQixZQUFZLEVBQUUsT0FBTyxDQUFDO0FBQUEsRUFDM0U7QUFFQSxRQUFNLFNBQVM7QUFBQSxJQUNkO0FBQUEsSUFDQTtBQUFBLElBQ0EsT0FBSyxFQUFFO0FBQUEsSUFDUCxDQUFDLElBQUksUUFBUSxFQUFFLFlBQVksR0FBRyxZQUFZLFlBQVksR0FBRyxhQUFhLEdBQUcsV0FBVztBQUFBLEVBQ3JGO0FBRUEsU0FBTztBQUNSO0FBRU8sU0FBUyw4QkFBOEIsU0FBNEM7QUFDekYsTUFBSSxDQUFDLFFBQVEsY0FBYztBQUMxQixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sUUFBUSxhQUFhO0FBQUEsSUFBTSxPQUNoQyxrQkFBa0IsRUFBRSxhQUFhLEtBQUssa0JBQWtCLEVBQUUsYUFBYSxLQUNyRSxFQUFFLGNBQWMsWUFBWSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDckQ7QUFDRDtBQUVPLFNBQVMsa0JBQWtCLE9BQXVCO0FBQ3hELFNBQU8sTUFBTSxvQkFBb0IsTUFBTTtBQUN4QzsiLAogICJuYW1lcyI6IFsibWFyZ2luRG9tTm9kZSIsICJjcmVhdGVWaWV3Wm9uZU1hcmdpbkFycm93IiwgImVtaXRBbGlnbm1lbnQiLCAiYyJdCn0K
