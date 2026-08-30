import { h } from "../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Action } from "../../../../../base/common/actions.js";
import { booleanComparator, compareBy, numberComparator, tieBreakComparators } from "../../../../../base/common/arrays.js";
import { findMaxIdx } from "../../../../../base/common/arraysFind.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, autorunHandleChanges, autorunWithStore, constObservable, derived, observableFromEvent, observableSignalFromEvent, observableValue, recomputeInitiallyAndOnChange } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { PlaceholderViewZone, ViewZoneOverlayWidget, applyStyle, applyViewZones } from "../utils.js";
import { OffsetRange, OffsetRangeSet } from "../../../../common/core/ranges/offsetRange.js";
import { localize } from "../../../../../nls.js";
const _MovedBlocksLinesFeature = class _MovedBlocksLinesFeature extends Disposable {
  constructor(_rootElement, _diffModel, _originalEditorLayoutInfo, _modifiedEditorLayoutInfo, _editors) {
    super();
    this._rootElement = _rootElement;
    this._diffModel = _diffModel;
    this._originalEditorLayoutInfo = _originalEditorLayoutInfo;
    this._modifiedEditorLayoutInfo = _modifiedEditorLayoutInfo;
    this._editors = _editors;
    this._originalScrollTop = observableFromEvent(this, this._editors.original.onDidScrollChange, () => this._editors.original.getScrollTop());
    this._modifiedScrollTop = observableFromEvent(this, this._editors.modified.onDidScrollChange, () => this._editors.modified.getScrollTop());
    this._viewZonesChanged = observableSignalFromEvent("onDidChangeViewZones", this._editors.modified.onDidChangeViewZones);
    this.width = observableValue(this, 0);
    this._modifiedViewZonesChangedSignal = observableSignalFromEvent("modified.onDidChangeViewZones", this._editors.modified.onDidChangeViewZones);
    this._originalViewZonesChangedSignal = observableSignalFromEvent("original.onDidChangeViewZones", this._editors.original.onDidChangeViewZones);
    this._state = derived(this, (reader) => {
      this._element.replaceChildren();
      const model = this._diffModel.read(reader);
      const moves = model?.diff.read(reader)?.movedTexts;
      if (!moves || moves.length === 0) {
        this.width.set(0, void 0);
        return;
      }
      this._viewZonesChanged.read(reader);
      const infoOrig = this._originalEditorLayoutInfo.read(reader);
      const infoMod = this._modifiedEditorLayoutInfo.read(reader);
      if (!infoOrig || !infoMod) {
        this.width.set(0, void 0);
        return;
      }
      this._modifiedViewZonesChangedSignal.read(reader);
      this._originalViewZonesChangedSignal.read(reader);
      const lines = moves.map((move) => {
        function computeLineStart(range, editor) {
          const t1 = editor.getTopForLineNumber(range.startLineNumber, true);
          const t2 = editor.getTopForLineNumber(range.endLineNumberExclusive, true);
          return (t1 + t2) / 2;
        }
        const start = computeLineStart(move.lineRangeMapping.original, this._editors.original);
        const startOffset = this._originalScrollTop.read(reader);
        const end = computeLineStart(move.lineRangeMapping.modified, this._editors.modified);
        const endOffset = this._modifiedScrollTop.read(reader);
        const from = start - startOffset;
        const to = end - endOffset;
        const top = Math.min(start, end);
        const bottom = Math.max(start, end);
        return { range: new OffsetRange(top, bottom), from, to, fromWithoutScroll: start, toWithoutScroll: end, move };
      });
      lines.sort(tieBreakComparators(
        compareBy((l) => l.fromWithoutScroll > l.toWithoutScroll, booleanComparator),
        compareBy((l) => l.fromWithoutScroll > l.toWithoutScroll ? l.fromWithoutScroll : -l.toWithoutScroll, numberComparator)
      ));
      const layout = LinesLayout.compute(lines.map((l) => l.range));
      const padding = 10;
      const lineAreaLeft = infoOrig.verticalScrollbarWidth;
      const lineAreaWidth = (layout.getTrackCount() - 1) * 10 + padding * 2;
      const width = lineAreaLeft + lineAreaWidth + (infoMod.contentLeft - _MovedBlocksLinesFeature.movedCodeBlockPadding);
      let idx = 0;
      for (const line of lines) {
        const track = layout.getTrack(idx);
        const verticalY = lineAreaLeft + padding + track * 10;
        const arrowHeight = 15;
        const arrowWidth = 15;
        const right = width;
        const rectWidth = infoMod.glyphMarginWidth + infoMod.lineNumbersWidth;
        const rectHeight = 18;
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.classList.add("arrow-rectangle");
        rect.setAttribute("x", `${right - rectWidth}`);
        rect.setAttribute("y", `${line.to - rectHeight / 2}`);
        rect.setAttribute("width", `${rectWidth}`);
        rect.setAttribute("height", `${rectHeight}`);
        this._element.appendChild(rect);
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${0} ${line.from} L ${verticalY} ${line.from} L ${verticalY} ${line.to} L ${right - arrowWidth} ${line.to}`);
        path.setAttribute("fill", "none");
        g.appendChild(path);
        const arrowRight = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        arrowRight.classList.add("arrow");
        reader.store.add(autorun((reader2) => {
          path.classList.toggle("currentMove", line.move === model.activeMovedText.read(reader2));
          arrowRight.classList.toggle("currentMove", line.move === model.activeMovedText.read(reader2));
        }));
        arrowRight.setAttribute("points", `${right - arrowWidth},${line.to - arrowHeight / 2} ${right},${line.to} ${right - arrowWidth},${line.to + arrowHeight / 2}`);
        g.appendChild(arrowRight);
        this._element.appendChild(g);
        idx++;
      }
      this.width.set(lineAreaWidth, void 0);
    });
    this._element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this._element.setAttribute("class", "moved-blocks-lines");
    this._rootElement.appendChild(this._element);
    this._register(toDisposable(() => this._element.remove()));
    this._register(autorun((reader) => {
      const info = this._originalEditorLayoutInfo.read(reader);
      const info2 = this._modifiedEditorLayoutInfo.read(reader);
      if (!info || !info2) {
        return;
      }
      this._element.style.left = `${info.width - info.verticalScrollbarWidth}px`;
      this._element.style.height = `${info.height}px`;
      this._element.style.width = `${info.verticalScrollbarWidth + info.contentLeft - _MovedBlocksLinesFeature.movedCodeBlockPadding + this.width.read(reader)}px`;
    }));
    this._register(recomputeInitiallyAndOnChange(this._state));
    const movedBlockViewZones = derived((reader) => {
      const model = this._diffModel.read(reader);
      const d = model?.diff.read(reader);
      if (!d) {
        return [];
      }
      return d.movedTexts.map((move) => ({
        move,
        original: new PlaceholderViewZone(constObservable(move.lineRangeMapping.original.startLineNumber - 1), 18),
        modified: new PlaceholderViewZone(constObservable(move.lineRangeMapping.modified.startLineNumber - 1), 18)
      }));
    });
    this._register(applyViewZones(this._editors.original, movedBlockViewZones.map((zones) => (
      /** @description movedBlockViewZones.original */
      zones.map((z) => z.original)
    ))));
    this._register(applyViewZones(this._editors.modified, movedBlockViewZones.map((zones) => (
      /** @description movedBlockViewZones.modified */
      zones.map((z) => z.modified)
    ))));
    this._register(autorunWithStore((reader, store) => {
      const blocks = movedBlockViewZones.read(reader);
      for (const b of blocks) {
        store.add(new MovedBlockOverlayWidget(this._editors.original, b.original, b.move, "original", this._diffModel.get()));
        store.add(new MovedBlockOverlayWidget(this._editors.modified, b.modified, b.move, "modified", this._diffModel.get()));
      }
    }));
    const originalHasFocus = observableSignalFromEvent(
      "original.onDidFocusEditorWidget",
      (e) => this._editors.original.onDidFocusEditorWidget(() => setTimeout(() => e(void 0), 0))
    );
    const modifiedHasFocus = observableSignalFromEvent(
      "modified.onDidFocusEditorWidget",
      (e) => this._editors.modified.onDidFocusEditorWidget(() => setTimeout(() => e(void 0), 0))
    );
    let lastChangedEditor = "modified";
    this._register(autorunHandleChanges({
      changeTracker: {
        createChangeSummary: () => void 0,
        handleChange: (ctx, summary) => {
          if (ctx.didChange(originalHasFocus)) {
            lastChangedEditor = "original";
          }
          if (ctx.didChange(modifiedHasFocus)) {
            lastChangedEditor = "modified";
          }
          return true;
        }
      }
    }, (reader) => {
      originalHasFocus.read(reader);
      modifiedHasFocus.read(reader);
      const m = this._diffModel.read(reader);
      if (!m) {
        return;
      }
      const diff = m.diff.read(reader);
      let movedText = void 0;
      if (diff && lastChangedEditor === "original") {
        const originalPos = this._editors.originalCursor.read(reader);
        if (originalPos) {
          movedText = diff.movedTexts.find((m2) => m2.lineRangeMapping.original.contains(originalPos.lineNumber));
        }
      }
      if (diff && lastChangedEditor === "modified") {
        const modifiedPos = this._editors.modifiedCursor.read(reader);
        if (modifiedPos) {
          movedText = diff.movedTexts.find((m2) => m2.lineRangeMapping.modified.contains(modifiedPos.lineNumber));
        }
      }
      if (movedText !== m.movedTextToCompare.read(void 0)) {
        m.movedTextToCompare.set(void 0, void 0);
      }
      m.setActiveMovedText(movedText);
    }));
  }
};
_MovedBlocksLinesFeature.movedCodeBlockPadding = 4;
let MovedBlocksLinesFeature = _MovedBlocksLinesFeature;
class LinesLayout {
  constructor(_trackCount, trackPerLineIdx) {
    this._trackCount = _trackCount;
    this.trackPerLineIdx = trackPerLineIdx;
  }
  static compute(lines) {
    const setsPerTrack = [];
    const trackPerLineIdx = [];
    for (const line of lines) {
      let trackIdx = setsPerTrack.findIndex((set) => !set.intersectsStrict(line));
      if (trackIdx === -1) {
        const maxTrackCount = 6;
        if (setsPerTrack.length >= maxTrackCount) {
          trackIdx = findMaxIdx(setsPerTrack, compareBy((set) => set.intersectWithRangeLength(line), numberComparator));
        } else {
          trackIdx = setsPerTrack.length;
          setsPerTrack.push(new OffsetRangeSet());
        }
      }
      setsPerTrack[trackIdx].addRange(line);
      trackPerLineIdx.push(trackIdx);
    }
    return new LinesLayout(setsPerTrack.length, trackPerLineIdx);
  }
  getTrack(lineIdx) {
    return this.trackPerLineIdx[lineIdx];
  }
  getTrackCount() {
    return this._trackCount;
  }
}
class MovedBlockOverlayWidget extends ViewZoneOverlayWidget {
  constructor(_editor, _viewZone, _move, _kind, _diffModel) {
    const root = h("div.diff-hidden-lines-widget");
    super(_editor, _viewZone, root.root);
    this._editor = _editor;
    this._move = _move;
    this._kind = _kind;
    this._diffModel = _diffModel;
    this._nodes = h("div.diff-moved-code-block", { style: { marginRight: "4px" } }, [
      h("div.text-content@textContent"),
      h("div.action-bar@actionBar")
    ]);
    root.root.appendChild(this._nodes.root);
    const editorLayout = observableFromEvent(this._editor.onDidLayoutChange, () => this._editor.getLayoutInfo());
    this._register(applyStyle(this._nodes.root, {
      paddingRight: editorLayout.map((l) => l.verticalScrollbarWidth)
    }));
    let text;
    if (_move.changes.length > 0) {
      text = this._kind === "original" ? localize(
        "codeMovedToWithChanges",
        "Code moved with changes to line {0}-{1}",
        this._move.lineRangeMapping.modified.startLineNumber,
        this._move.lineRangeMapping.modified.endLineNumberExclusive - 1
      ) : localize(
        "codeMovedFromWithChanges",
        "Code moved with changes from line {0}-{1}",
        this._move.lineRangeMapping.original.startLineNumber,
        this._move.lineRangeMapping.original.endLineNumberExclusive - 1
      );
    } else {
      text = this._kind === "original" ? localize(
        "codeMovedTo",
        "Code moved to line {0}-{1}",
        this._move.lineRangeMapping.modified.startLineNumber,
        this._move.lineRangeMapping.modified.endLineNumberExclusive - 1
      ) : localize(
        "codeMovedFrom",
        "Code moved from line {0}-{1}",
        this._move.lineRangeMapping.original.startLineNumber,
        this._move.lineRangeMapping.original.endLineNumberExclusive - 1
      );
    }
    const actionBar = this._register(new ActionBar(this._nodes.actionBar, {
      highlightToggledItems: true
    }));
    const caption = this._register(new Action(
      "",
      text,
      "",
      false
    ));
    actionBar.push(caption, { icon: false, label: true });
    const actionCompare = this._register(new Action(
      "",
      "Compare",
      ThemeIcon.asClassName(Codicon.compareChanges),
      true,
      () => {
        this._editor.focus();
        this._diffModel.movedTextToCompare.set(this._diffModel.movedTextToCompare.get() === _move ? void 0 : this._move, void 0);
      }
    ));
    this._register(autorun((reader) => {
      const isActive = this._diffModel.movedTextToCompare.read(reader) === _move;
      actionCompare.checked = isActive;
    }));
    actionBar.push(actionCompare, { icon: false, label: true });
  }
}
export {
  MovedBlocksLinesFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcZmVhdHVyZXNcXG1vdmVkQmxvY2tzTGluZXNGZWF0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBib29sZWFuQ29tcGFyYXRvciwgY29tcGFyZUJ5LCBudW1iZXJDb21wYXJhdG9yLCB0aWVCcmVha0NvbXBhcmF0b3JzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGZpbmRNYXhJZHggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIGF1dG9ydW4sIGF1dG9ydW5IYW5kbGVDaGFuZ2VzLCBhdXRvcnVuV2l0aFN0b3JlLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgcmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckVkaXRvcnMgfSBmcm9tICcuLi9jb21wb25lbnRzL2RpZmZFZGl0b3JFZGl0b3JzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi9kaWZmRWRpdG9yVmlld01vZGVsLmpzJztcbmltcG9ydCB7IFBsYWNlaG9sZGVyVmlld1pvbmUsIFZpZXdab25lT3ZlcmxheVdpZGdldCwgYXBwbHlTdHlsZSwgYXBwbHlWaWV3Wm9uZXMgfSBmcm9tICcuLi91dGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JMYXlvdXRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UsIE9mZnNldFJhbmdlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IE1vdmVkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9kaWZmL2xpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuZXhwb3J0IGNsYXNzIE1vdmVkQmxvY2tzTGluZXNGZWF0dXJlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgbW92ZWRDb2RlQmxvY2tQYWRkaW5nID0gNDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50OiBTVkdFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFNjcm9sbFRvcDtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRTY3JvbGxUb3A7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdab25lc0NoYW5nZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IHdpZHRoO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RFbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmTW9kZWw6IElPYnNlcnZhYmxlPERpZmZFZGl0b3JWaWV3TW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsRWRpdG9yTGF5b3V0SW5mbzogSU9ic2VydmFibGU8RWRpdG9yTGF5b3V0SW5mbyB8IG51bGw+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkRWRpdG9yTGF5b3V0SW5mbzogSU9ic2VydmFibGU8RWRpdG9yTGF5b3V0SW5mbyB8IG51bGw+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcnM6IERpZmZFZGl0b3JFZGl0b3JzLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX29yaWdpbmFsU2Nyb2xsVG9wID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLm9uRGlkU2Nyb2xsQ2hhbmdlLCAoKSA9PiB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmdldFNjcm9sbFRvcCgpKTtcblx0XHR0aGlzLl9tb2RpZmllZFNjcm9sbFRvcCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5vbkRpZFNjcm9sbENoYW5nZSwgKCkgPT4gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5nZXRTY3JvbGxUb3AoKSk7XG5cdFx0dGhpcy5fdmlld1pvbmVzQ2hhbmdlZCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQoJ29uRGlkQ2hhbmdlVmlld1pvbmVzJywgdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5vbkRpZENoYW5nZVZpZXdab25lcyk7XG5cdFx0dGhpcy53aWR0aCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAwKTtcblx0XHR0aGlzLl9tb2RpZmllZFZpZXdab25lc0NoYW5nZWRTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KCdtb2RpZmllZC5vbkRpZENoYW5nZVZpZXdab25lcycsIHRoaXMuX2VkaXRvcnMubW9kaWZpZWQub25EaWRDaGFuZ2VWaWV3Wm9uZXMpO1xuXHRcdHRoaXMuX29yaWdpbmFsVmlld1pvbmVzQ2hhbmdlZFNpZ25hbCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQoJ29yaWdpbmFsLm9uRGlkQ2hhbmdlVmlld1pvbmVzJywgdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5vbkRpZENoYW5nZVZpZXdab25lcyk7XG5cdFx0dGhpcy5fc3RhdGUgPSBkZXJpdmVkKHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gc3RhdGUgKi9cblxuXHRcdFx0dGhpcy5fZWxlbWVudC5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1vdmVzID0gbW9kZWw/LmRpZmYucmVhZChyZWFkZXIpPy5tb3ZlZFRleHRzO1xuXHRcdFx0aWYgKCFtb3ZlcyB8fCBtb3Zlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy53aWR0aC5zZXQoMCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl92aWV3Wm9uZXNDaGFuZ2VkLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgaW5mb09yaWcgPSB0aGlzLl9vcmlnaW5hbEVkaXRvckxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaW5mb01vZCA9IHRoaXMuX21vZGlmaWVkRWRpdG9yTGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWluZm9PcmlnIHx8ICFpbmZvTW9kKSB7XG5cdFx0XHRcdHRoaXMud2lkdGguc2V0KDAsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbW9kaWZpZWRWaWV3Wm9uZXNDaGFuZ2VkU2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX29yaWdpbmFsVmlld1pvbmVzQ2hhbmdlZFNpZ25hbC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IGxpbmVzID0gbW92ZXMubWFwKChtb3ZlKSA9PiB7XG5cdFx0XHRcdGZ1bmN0aW9uIGNvbXB1dGVMaW5lU3RhcnQocmFuZ2U6IExpbmVSYW5nZSwgZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IHQxID0gZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB0cnVlKTtcblx0XHRcdFx0XHRjb25zdCB0MiA9IGVkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsIHRydWUpO1xuXHRcdFx0XHRcdHJldHVybiAodDEgKyB0MikgLyAyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhcnQgPSBjb21wdXRlTGluZVN0YXJ0KG1vdmUubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbCwgdGhpcy5fZWRpdG9ycy5vcmlnaW5hbCk7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5fb3JpZ2luYWxTY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBlbmQgPSBjb21wdXRlTGluZVN0YXJ0KG1vdmUubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZCwgdGhpcy5fZWRpdG9ycy5tb2RpZmllZCk7XG5cdFx0XHRcdGNvbnN0IGVuZE9mZnNldCA9IHRoaXMuX21vZGlmaWVkU2Nyb2xsVG9wLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHRjb25zdCBmcm9tID0gc3RhcnQgLSBzdGFydE9mZnNldDtcblx0XHRcdFx0Y29uc3QgdG8gPSBlbmQgLSBlbmRPZmZzZXQ7XG5cblx0XHRcdFx0Y29uc3QgdG9wID0gTWF0aC5taW4oc3RhcnQsIGVuZCk7XG5cdFx0XHRcdGNvbnN0IGJvdHRvbSA9IE1hdGgubWF4KHN0YXJ0LCBlbmQpO1xuXG5cdFx0XHRcdHJldHVybiB7IHJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2UodG9wLCBib3R0b20pLCBmcm9tLCB0bywgZnJvbVdpdGhvdXRTY3JvbGw6IHN0YXJ0LCB0b1dpdGhvdXRTY3JvbGw6IGVuZCwgbW92ZSB9O1xuXHRcdFx0fSk7XG5cblx0XHRcdGxpbmVzLnNvcnQodGllQnJlYWtDb21wYXJhdG9ycyhcblx0XHRcdFx0Y29tcGFyZUJ5KGwgPT4gbC5mcm9tV2l0aG91dFNjcm9sbCA+IGwudG9XaXRob3V0U2Nyb2xsLCBib29sZWFuQ29tcGFyYXRvciksXG5cdFx0XHRcdGNvbXBhcmVCeShsID0+IGwuZnJvbVdpdGhvdXRTY3JvbGwgPiBsLnRvV2l0aG91dFNjcm9sbCA/IGwuZnJvbVdpdGhvdXRTY3JvbGwgOiAtbC50b1dpdGhvdXRTY3JvbGwsIG51bWJlckNvbXBhcmF0b3IpXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgbGF5b3V0ID0gTGluZXNMYXlvdXQuY29tcHV0ZShsaW5lcy5tYXAobCA9PiBsLnJhbmdlKSk7XG5cblx0XHRcdGNvbnN0IHBhZGRpbmcgPSAxMDtcblx0XHRcdGNvbnN0IGxpbmVBcmVhTGVmdCA9IGluZm9PcmlnLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg7XG5cdFx0XHRjb25zdCBsaW5lQXJlYVdpZHRoID0gKGxheW91dC5nZXRUcmFja0NvdW50KCkgLSAxKSAqIDEwICsgcGFkZGluZyAqIDI7XG5cdFx0XHRjb25zdCB3aWR0aCA9IGxpbmVBcmVhTGVmdCArIGxpbmVBcmVhV2lkdGggKyAoaW5mb01vZC5jb250ZW50TGVmdCAtIE1vdmVkQmxvY2tzTGluZXNGZWF0dXJlLm1vdmVkQ29kZUJsb2NrUGFkZGluZyk7XG5cblx0XHRcdGxldCBpZHggPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRcdGNvbnN0IHRyYWNrID0gbGF5b3V0LmdldFRyYWNrKGlkeCk7XG5cdFx0XHRcdGNvbnN0IHZlcnRpY2FsWSA9IGxpbmVBcmVhTGVmdCArIHBhZGRpbmcgKyB0cmFjayAqIDEwO1xuXG5cdFx0XHRcdGNvbnN0IGFycm93SGVpZ2h0ID0gMTU7XG5cdFx0XHRcdGNvbnN0IGFycm93V2lkdGggPSAxNTtcblx0XHRcdFx0Y29uc3QgcmlnaHQgPSB3aWR0aDtcblxuXHRcdFx0XHRjb25zdCByZWN0V2lkdGggPSBpbmZvTW9kLmdseXBoTWFyZ2luV2lkdGggKyBpbmZvTW9kLmxpbmVOdW1iZXJzV2lkdGg7XG5cdFx0XHRcdGNvbnN0IHJlY3RIZWlnaHQgPSAxODtcblx0XHRcdFx0Y29uc3QgcmVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncmVjdCcpO1xuXHRcdFx0XHRyZWN0LmNsYXNzTGlzdC5hZGQoJ2Fycm93LXJlY3RhbmdsZScpO1xuXHRcdFx0XHRyZWN0LnNldEF0dHJpYnV0ZSgneCcsIGAke3JpZ2h0IC0gcmVjdFdpZHRofWApO1xuXHRcdFx0XHRyZWN0LnNldEF0dHJpYnV0ZSgneScsIGAke2xpbmUudG8gLSByZWN0SGVpZ2h0IC8gMn1gKTtcblx0XHRcdFx0cmVjdC5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgYCR7cmVjdFdpZHRofWApO1xuXHRcdFx0XHRyZWN0LnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgYCR7cmVjdEhlaWdodH1gKTtcblx0XHRcdFx0dGhpcy5fZWxlbWVudC5hcHBlbmRDaGlsZChyZWN0KTtcblxuXHRcdFx0XHRjb25zdCBnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdnJyk7XG5cblx0XHRcdFx0Y29uc3QgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncGF0aCcpO1xuXG5cdFx0XHRcdHBhdGguc2V0QXR0cmlidXRlKCdkJywgYE0gJHswfSAke2xpbmUuZnJvbX0gTCAke3ZlcnRpY2FsWX0gJHtsaW5lLmZyb219IEwgJHt2ZXJ0aWNhbFl9ICR7bGluZS50b30gTCAke3JpZ2h0IC0gYXJyb3dXaWR0aH0gJHtsaW5lLnRvfWApO1xuXHRcdFx0XHRwYXRoLnNldEF0dHJpYnV0ZSgnZmlsbCcsICdub25lJyk7XG5cdFx0XHRcdGcuYXBwZW5kQ2hpbGQocGF0aCk7XG5cblx0XHRcdFx0Y29uc3QgYXJyb3dSaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncG9seWdvbicpO1xuXHRcdFx0XHRhcnJvd1JpZ2h0LmNsYXNzTGlzdC5hZGQoJ2Fycm93Jyk7XG5cblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0cGF0aC5jbGFzc0xpc3QudG9nZ2xlKCdjdXJyZW50TW92ZScsIGxpbmUubW92ZSA9PT0gbW9kZWwuYWN0aXZlTW92ZWRUZXh0LnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdFx0YXJyb3dSaWdodC5jbGFzc0xpc3QudG9nZ2xlKCdjdXJyZW50TW92ZScsIGxpbmUubW92ZSA9PT0gbW9kZWwuYWN0aXZlTW92ZWRUZXh0LnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRhcnJvd1JpZ2h0LnNldEF0dHJpYnV0ZSgncG9pbnRzJywgYCR7cmlnaHQgLSBhcnJvd1dpZHRofSwke2xpbmUudG8gLSBhcnJvd0hlaWdodCAvIDJ9ICR7cmlnaHR9LCR7bGluZS50b30gJHtyaWdodCAtIGFycm93V2lkdGh9LCR7bGluZS50byArIGFycm93SGVpZ2h0IC8gMn1gKTtcblx0XHRcdFx0Zy5hcHBlbmRDaGlsZChhcnJvd1JpZ2h0KTtcblxuXHRcdFx0XHR0aGlzLl9lbGVtZW50LmFwcGVuZENoaWxkKGcpO1xuXG5cdFx0XHRcdC8qXG5cdFx0XHRcdFRPRE9AaGVkaWV0XG5cdFx0XHRcdHBhdGguYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcblx0XHRcdFx0XHRtb2RlbC5zZXRIb3ZlcmVkTW92ZWRUZXh0KGxpbmUubW92ZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRwYXRoLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0bW9kZWwuc2V0SG92ZXJlZE1vdmVkVGV4dCh1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTsqL1xuXG5cdFx0XHRcdGlkeCsrO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLndpZHRoLnNldChsaW5lQXJlYVdpZHRoLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3ZnJyk7XG5cdFx0dGhpcy5fZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgJ21vdmVkLWJsb2Nrcy1saW5lcycpO1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX2VsZW1lbnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9lbGVtZW50LnJlbW92ZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBtb3ZlZCBibG9ja3MgbGluZXMgcG9zaXRpb25pbmcgKi9cblx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9vcmlnaW5hbEVkaXRvckxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaW5mbzIgPSB0aGlzLl9tb2RpZmllZEVkaXRvckxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFpbmZvIHx8ICFpbmZvMikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUubGVmdCA9IGAke2luZm8ud2lkdGggLSBpbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGh9cHhgO1xuXHRcdFx0dGhpcy5fZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtpbmZvLmhlaWdodH1weGA7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnN0eWxlLndpZHRoID0gYCR7aW5mby52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoICsgaW5mby5jb250ZW50TGVmdCAtIE1vdmVkQmxvY2tzTGluZXNGZWF0dXJlLm1vdmVkQ29kZUJsb2NrUGFkZGluZyArIHRoaXMud2lkdGgucmVhZChyZWFkZXIpfXB4YDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdGF0ZSkpO1xuXG5cdFx0Y29uc3QgbW92ZWRCbG9ja1ZpZXdab25lcyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGQgPSBtb2RlbD8uZGlmZi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWQpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRyZXR1cm4gZC5tb3ZlZFRleHRzLm1hcChtb3ZlID0+ICh7XG5cdFx0XHRcdG1vdmUsXG5cdFx0XHRcdG9yaWdpbmFsOiBuZXcgUGxhY2Vob2xkZXJWaWV3Wm9uZShjb25zdE9ic2VydmFibGUobW92ZS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciAtIDEpLCAxOCksXG5cdFx0XHRcdG1vZGlmaWVkOiBuZXcgUGxhY2Vob2xkZXJWaWV3Wm9uZShjb25zdE9ic2VydmFibGUobW92ZS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciAtIDEpLCAxOCksXG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhcHBseVZpZXdab25lcyh0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLCBtb3ZlZEJsb2NrVmlld1pvbmVzLm1hcCh6b25lcyA9PiAvKiogQGRlc2NyaXB0aW9uIG1vdmVkQmxvY2tWaWV3Wm9uZXMub3JpZ2luYWwgKi8gem9uZXMubWFwKHogPT4gei5vcmlnaW5hbCkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlWaWV3Wm9uZXModGhpcy5fZWRpdG9ycy5tb2RpZmllZCwgbW92ZWRCbG9ja1ZpZXdab25lcy5tYXAoem9uZXMgPT4gLyoqIEBkZXNjcmlwdGlvbiBtb3ZlZEJsb2NrVmlld1pvbmVzLm1vZGlmaWVkICovIHpvbmVzLm1hcCh6ID0+IHoubW9kaWZpZWQpKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0Y29uc3QgYmxvY2tzID0gbW92ZWRCbG9ja1ZpZXdab25lcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRmb3IgKGNvbnN0IGIgb2YgYmxvY2tzKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgTW92ZWRCbG9ja092ZXJsYXlXaWRnZXQodGhpcy5fZWRpdG9ycy5vcmlnaW5hbCwgYi5vcmlnaW5hbCwgYi5tb3ZlLCAnb3JpZ2luYWwnLCB0aGlzLl9kaWZmTW9kZWwuZ2V0KCkhKSk7XG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgTW92ZWRCbG9ja092ZXJsYXlXaWRnZXQodGhpcy5fZWRpdG9ycy5tb2RpZmllZCwgYi5tb2RpZmllZCwgYi5tb3ZlLCAnbW9kaWZpZWQnLCB0aGlzLl9kaWZmTW9kZWwuZ2V0KCkhKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxIYXNGb2N1cyA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQoXG5cdFx0XHQnb3JpZ2luYWwub25EaWRGb2N1c0VkaXRvcldpZGdldCcsXG5cdFx0XHRlID0+IHRoaXMuX2VkaXRvcnMub3JpZ2luYWwub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiBzZXRUaW1lb3V0KCgpID0+IGUodW5kZWZpbmVkKSwgMCkpXG5cdFx0KTtcblx0XHRjb25zdCBtb2RpZmllZEhhc0ZvY3VzID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudChcblx0XHRcdCdtb2RpZmllZC5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0Jyxcblx0XHRcdGUgPT4gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHNldFRpbWVvdXQoKCkgPT4gZSh1bmRlZmluZWQpLCAwKSlcblx0XHQpO1xuXG5cdFx0bGV0IGxhc3RDaGFuZ2VkRWRpdG9yOiAnb3JpZ2luYWwnIHwgJ21vZGlmaWVkJyA9ICdtb2RpZmllZCc7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuSGFuZGxlQ2hhbmdlcyh7XG5cdFx0XHRjaGFuZ2VUcmFja2VyOiB7XG5cdFx0XHRcdGNyZWF0ZUNoYW5nZVN1bW1hcnk6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0aGFuZGxlQ2hhbmdlOiAoY3R4LCBzdW1tYXJ5KSA9PiB7XG5cdFx0XHRcdFx0aWYgKGN0eC5kaWRDaGFuZ2Uob3JpZ2luYWxIYXNGb2N1cykpIHsgbGFzdENoYW5nZWRFZGl0b3IgPSAnb3JpZ2luYWwnOyB9XG5cdFx0XHRcdFx0aWYgKGN0eC5kaWRDaGFuZ2UobW9kaWZpZWRIYXNGb2N1cykpIHsgbGFzdENoYW5nZWRFZGl0b3IgPSAnbW9kaWZpZWQnOyB9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCByZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBNb3ZlZEJsb2Nrc0xpbmVzLnNldEFjdGl2ZU1vdmVkVGV4dEZyb21DdXJzb3IgKi9cblx0XHRcdG9yaWdpbmFsSGFzRm9jdXMucmVhZChyZWFkZXIpO1xuXHRcdFx0bW9kaWZpZWRIYXNGb2N1cy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IG0gPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFtKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3QgZGlmZiA9IG0uZGlmZi5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGxldCBtb3ZlZFRleHQ6IE1vdmVkVGV4dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKGRpZmYgJiYgbGFzdENoYW5nZWRFZGl0b3IgPT09ICdvcmlnaW5hbCcpIHtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxQb3MgPSB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsQ3Vyc29yLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKG9yaWdpbmFsUG9zKSB7XG5cdFx0XHRcdFx0bW92ZWRUZXh0ID0gZGlmZi5tb3ZlZFRleHRzLmZpbmQobSA9PiBtLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWwuY29udGFpbnMob3JpZ2luYWxQb3MubGluZU51bWJlcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkaWZmICYmIGxhc3RDaGFuZ2VkRWRpdG9yID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkUG9zID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZEN1cnNvci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChtb2RpZmllZFBvcykge1xuXHRcdFx0XHRcdG1vdmVkVGV4dCA9IGRpZmYubW92ZWRUZXh0cy5maW5kKG0gPT4gbS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmNvbnRhaW5zKG1vZGlmaWVkUG9zLmxpbmVOdW1iZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW92ZWRUZXh0ICE9PSBtLm1vdmVkVGV4dFRvQ29tcGFyZS5yZWFkKHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0bS5tb3ZlZFRleHRUb0NvbXBhcmUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdG0uc2V0QWN0aXZlTW92ZWRUZXh0KG1vdmVkVGV4dCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRWaWV3Wm9uZXNDaGFuZ2VkU2lnbmFsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFZpZXdab25lc0NoYW5nZWRTaWduYWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGU7XG59XG5cbmNsYXNzIExpbmVzTGF5b3V0IHtcblx0cHVibGljIHN0YXRpYyBjb21wdXRlKGxpbmVzOiBPZmZzZXRSYW5nZVtdKTogTGluZXNMYXlvdXQge1xuXHRcdGNvbnN0IHNldHNQZXJUcmFjazogT2Zmc2V0UmFuZ2VTZXRbXSA9IFtdO1xuXHRcdGNvbnN0IHRyYWNrUGVyTGluZUlkeDogbnVtYmVyW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0bGV0IHRyYWNrSWR4ID0gc2V0c1BlclRyYWNrLmZpbmRJbmRleChzZXQgPT4gIXNldC5pbnRlcnNlY3RzU3RyaWN0KGxpbmUpKTtcblx0XHRcdGlmICh0cmFja0lkeCA9PT0gLTEpIHtcblx0XHRcdFx0Y29uc3QgbWF4VHJhY2tDb3VudCA9IDY7XG5cdFx0XHRcdGlmIChzZXRzUGVyVHJhY2subGVuZ3RoID49IG1heFRyYWNrQ291bnQpIHtcblx0XHRcdFx0XHR0cmFja0lkeCA9IGZpbmRNYXhJZHgoc2V0c1BlclRyYWNrLCBjb21wYXJlQnkoc2V0ID0+IHNldC5pbnRlcnNlY3RXaXRoUmFuZ2VMZW5ndGgobGluZSksIG51bWJlckNvbXBhcmF0b3IpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0cmFja0lkeCA9IHNldHNQZXJUcmFjay5sZW5ndGg7XG5cdFx0XHRcdFx0c2V0c1BlclRyYWNrLnB1c2gobmV3IE9mZnNldFJhbmdlU2V0KCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRzZXRzUGVyVHJhY2tbdHJhY2tJZHhdLmFkZFJhbmdlKGxpbmUpO1xuXHRcdFx0dHJhY2tQZXJMaW5lSWR4LnB1c2godHJhY2tJZHgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTGluZXNMYXlvdXQoc2V0c1BlclRyYWNrLmxlbmd0aCwgdHJhY2tQZXJMaW5lSWR4KTtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJhY2tDb3VudDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdHJhY2tQZXJMaW5lSWR4OiBudW1iZXJbXVxuXHQpIHsgfVxuXG5cdGdldFRyYWNrKGxpbmVJZHg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudHJhY2tQZXJMaW5lSWR4W2xpbmVJZHhdO1xuXHR9XG5cblx0Z2V0VHJhY2tDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90cmFja0NvdW50O1xuXHR9XG59XG5cbmNsYXNzIE1vdmVkQmxvY2tPdmVybGF5V2lkZ2V0IGV4dGVuZHMgVmlld1pvbmVPdmVybGF5V2lkZ2V0IHtcblx0cHJpdmF0ZSByZWFkb25seSBfbm9kZXMgPSBoKCdkaXYuZGlmZi1tb3ZlZC1jb2RlLWJsb2NrJywgeyBzdHlsZTogeyBtYXJnaW5SaWdodDogJzRweCcgfSB9LCBbXG5cdFx0aCgnZGl2LnRleHQtY29udGVudEB0ZXh0Q29udGVudCcpLFxuXHRcdGgoJ2Rpdi5hY3Rpb24tYmFyQGFjdGlvbkJhcicpLFxuXHRdKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdF92aWV3Wm9uZTogUGxhY2Vob2xkZXJWaWV3Wm9uZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb3ZlOiBNb3ZlZFRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfa2luZDogJ29yaWdpbmFsJyB8ICdtb2RpZmllZCcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlmZk1vZGVsOiBEaWZmRWRpdG9yVmlld01vZGVsLFxuXHQpIHtcblx0XHRjb25zdCByb290ID0gaCgnZGl2LmRpZmYtaGlkZGVuLWxpbmVzLXdpZGdldCcpO1xuXHRcdHN1cGVyKF9lZGl0b3IsIF92aWV3Wm9uZSwgcm9vdC5yb290KTtcblx0XHRyb290LnJvb3QuYXBwZW5kQ2hpbGQodGhpcy5fbm9kZXMucm9vdCk7XG5cblx0XHRjb25zdCBlZGl0b3JMYXlvdXQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMuX2VkaXRvci5vbkRpZExheW91dENoYW5nZSwgKCkgPT4gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhcHBseVN0eWxlKHRoaXMuX25vZGVzLnJvb3QsIHtcblx0XHRcdHBhZGRpbmdSaWdodDogZWRpdG9yTGF5b3V0Lm1hcChsID0+IGwudmVydGljYWxTY3JvbGxiYXJXaWR0aClcblx0XHR9KSk7XG5cblx0XHRsZXQgdGV4dDogc3RyaW5nO1xuXG5cdFx0aWYgKF9tb3ZlLmNoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGV4dCA9IHRoaXMuX2tpbmQgPT09ICdvcmlnaW5hbCcgPyBsb2NhbGl6ZShcblx0XHRcdFx0J2NvZGVNb3ZlZFRvV2l0aENoYW5nZXMnLFxuXHRcdFx0XHQnQ29kZSBtb3ZlZCB3aXRoIGNoYW5nZXMgdG8gbGluZSB7MH0tezF9Jyxcblx0XHRcdFx0dGhpcy5fbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0dGhpcy5fbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0KSA6IGxvY2FsaXplKFxuXHRcdFx0XHQnY29kZU1vdmVkRnJvbVdpdGhDaGFuZ2VzJyxcblx0XHRcdFx0J0NvZGUgbW92ZWQgd2l0aCBjaGFuZ2VzIGZyb20gbGluZSB7MH0tezF9Jyxcblx0XHRcdFx0dGhpcy5fbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0dGhpcy5fbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGV4dCA9IHRoaXMuX2tpbmQgPT09ICdvcmlnaW5hbCcgPyBsb2NhbGl6ZShcblx0XHRcdFx0J2NvZGVNb3ZlZFRvJyxcblx0XHRcdFx0J0NvZGUgbW92ZWQgdG8gbGluZSB7MH0tezF9Jyxcblx0XHRcdFx0dGhpcy5fbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0dGhpcy5fbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0KSA6IGxvY2FsaXplKFxuXHRcdFx0XHQnY29kZU1vdmVkRnJvbScsXG5cdFx0XHRcdCdDb2RlIG1vdmVkIGZyb20gbGluZSB7MH0tezF9Jyxcblx0XHRcdFx0dGhpcy5fbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0dGhpcy5fbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuX25vZGVzLmFjdGlvbkJhciwge1xuXHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNhcHRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKFxuXHRcdFx0JycsXG5cdFx0XHR0ZXh0LFxuXHRcdFx0JycsXG5cdFx0XHRmYWxzZSxcblx0XHQpKTtcblx0XHRhY3Rpb25CYXIucHVzaChjYXB0aW9uLCB7IGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGFjdGlvbkNvbXBhcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKFxuXHRcdFx0JycsXG5cdFx0XHQnQ29tcGFyZScsXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jb21wYXJlQ2hhbmdlcyksXG5cdFx0XHR0cnVlLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0dGhpcy5fZGlmZk1vZGVsLm1vdmVkVGV4dFRvQ29tcGFyZS5zZXQodGhpcy5fZGlmZk1vZGVsLm1vdmVkVGV4dFRvQ29tcGFyZS5nZXQoKSA9PT0gX21vdmUgPyB1bmRlZmluZWQgOiB0aGlzLl9tb3ZlLCB1bmRlZmluZWQpO1xuXHRcdFx0fSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IHRoaXMuX2RpZmZNb2RlbC5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZChyZWFkZXIpID09PSBfbW92ZTtcblx0XHRcdGFjdGlvbkNvbXBhcmUuY2hlY2tlZCA9IGlzQWN0aXZlO1xuXHRcdH0pKTtcblxuXHRcdGFjdGlvbkJhci5wdXNoKGFjdGlvbkNvbXBhcmUsIHsgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVM7QUFDbEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsbUJBQW1CLFdBQVcsa0JBQWtCLDJCQUEyQjtBQUNwRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFzQixTQUFTLHNCQUFzQixrQkFBa0IsaUJBQWlCLFNBQVMscUJBQXFCLDJCQUEyQixpQkFBaUIscUNBQXFDO0FBQ3ZNLFNBQVMsaUJBQWlCO0FBSTFCLFNBQVMscUJBQXFCLHVCQUF1QixZQUFZLHNCQUFzQjtBQUd2RixTQUFTLGFBQWEsc0JBQXNCO0FBRTVDLFNBQVMsZ0JBQWdCO0FBRWxCLE1BQU0sMkJBQU4sTUFBTSxpQ0FBZ0MsV0FBVztBQUFBLEVBVXZELFlBQ2tCLGNBQ0EsWUFDQSwyQkFDQSwyQkFDQSxVQUNoQjtBQUNELFVBQU07QUFOVztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBR2pCLFNBQUsscUJBQXFCLG9CQUFvQixNQUFNLEtBQUssU0FBUyxTQUFTLG1CQUFtQixNQUFNLEtBQUssU0FBUyxTQUFTLGFBQWEsQ0FBQztBQUN6SSxTQUFLLHFCQUFxQixvQkFBb0IsTUFBTSxLQUFLLFNBQVMsU0FBUyxtQkFBbUIsTUFBTSxLQUFLLFNBQVMsU0FBUyxhQUFhLENBQUM7QUFDekksU0FBSyxvQkFBb0IsMEJBQTBCLHdCQUF3QixLQUFLLFNBQVMsU0FBUyxvQkFBb0I7QUFDdEgsU0FBSyxRQUFRLGdCQUFnQixNQUFNLENBQUM7QUFDcEMsU0FBSyxrQ0FBa0MsMEJBQTBCLGlDQUFpQyxLQUFLLFNBQVMsU0FBUyxvQkFBb0I7QUFDN0ksU0FBSyxrQ0FBa0MsMEJBQTBCLGlDQUFpQyxLQUFLLFNBQVMsU0FBUyxvQkFBb0I7QUFDN0ksU0FBSyxTQUFTLFFBQVEsTUFBTSxDQUFDLFdBQVc7QUFHdkMsV0FBSyxTQUFTLGdCQUFnQjtBQUM5QixZQUFNLFFBQVEsS0FBSyxXQUFXLEtBQUssTUFBTTtBQUN6QyxZQUFNLFFBQVEsT0FBTyxLQUFLLEtBQUssTUFBTSxHQUFHO0FBQ3hDLFVBQUksQ0FBQyxTQUFTLE1BQU0sV0FBVyxHQUFHO0FBQ2pDLGFBQUssTUFBTSxJQUFJLEdBQUcsTUFBUztBQUMzQjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGtCQUFrQixLQUFLLE1BQU07QUFFbEMsWUFBTSxXQUFXLEtBQUssMEJBQTBCLEtBQUssTUFBTTtBQUMzRCxZQUFNLFVBQVUsS0FBSywwQkFBMEIsS0FBSyxNQUFNO0FBQzFELFVBQUksQ0FBQyxZQUFZLENBQUMsU0FBUztBQUMxQixhQUFLLE1BQU0sSUFBSSxHQUFHLE1BQVM7QUFDM0I7QUFBQSxNQUNEO0FBRUEsV0FBSyxnQ0FBZ0MsS0FBSyxNQUFNO0FBQ2hELFdBQUssZ0NBQWdDLEtBQUssTUFBTTtBQUVoRCxZQUFNLFFBQVEsTUFBTSxJQUFJLENBQUMsU0FBUztBQUNqQyxpQkFBUyxpQkFBaUIsT0FBa0IsUUFBcUI7QUFDaEUsZ0JBQU0sS0FBSyxPQUFPLG9CQUFvQixNQUFNLGlCQUFpQixJQUFJO0FBQ2pFLGdCQUFNLEtBQUssT0FBTyxvQkFBb0IsTUFBTSx3QkFBd0IsSUFBSTtBQUN4RSxrQkFBUSxLQUFLLE1BQU07QUFBQSxRQUNwQjtBQUVBLGNBQU0sUUFBUSxpQkFBaUIsS0FBSyxpQkFBaUIsVUFBVSxLQUFLLFNBQVMsUUFBUTtBQUNyRixjQUFNLGNBQWMsS0FBSyxtQkFBbUIsS0FBSyxNQUFNO0FBQ3ZELGNBQU0sTUFBTSxpQkFBaUIsS0FBSyxpQkFBaUIsVUFBVSxLQUFLLFNBQVMsUUFBUTtBQUNuRixjQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSyxNQUFNO0FBRXJELGNBQU0sT0FBTyxRQUFRO0FBQ3JCLGNBQU0sS0FBSyxNQUFNO0FBRWpCLGNBQU0sTUFBTSxLQUFLLElBQUksT0FBTyxHQUFHO0FBQy9CLGNBQU0sU0FBUyxLQUFLLElBQUksT0FBTyxHQUFHO0FBRWxDLGVBQU8sRUFBRSxPQUFPLElBQUksWUFBWSxLQUFLLE1BQU0sR0FBRyxNQUFNLElBQUksbUJBQW1CLE9BQU8saUJBQWlCLEtBQUssS0FBSztBQUFBLE1BQzlHLENBQUM7QUFFRCxZQUFNLEtBQUs7QUFBQSxRQUNWLFVBQVUsT0FBSyxFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixpQkFBaUI7QUFBQSxRQUN6RSxVQUFVLE9BQUssRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNwSCxDQUFDO0FBRUQsWUFBTSxTQUFTLFlBQVksUUFBUSxNQUFNLElBQUksT0FBSyxFQUFFLEtBQUssQ0FBQztBQUUxRCxZQUFNLFVBQVU7QUFDaEIsWUFBTSxlQUFlLFNBQVM7QUFDOUIsWUFBTSxpQkFBaUIsT0FBTyxjQUFjLElBQUksS0FBSyxLQUFLLFVBQVU7QUFDcEUsWUFBTSxRQUFRLGVBQWUsaUJBQWlCLFFBQVEsY0FBYyx5QkFBd0I7QUFFNUYsVUFBSSxNQUFNO0FBQ1YsaUJBQVcsUUFBUSxPQUFPO0FBQ3pCLGNBQU0sUUFBUSxPQUFPLFNBQVMsR0FBRztBQUNqQyxjQUFNLFlBQVksZUFBZSxVQUFVLFFBQVE7QUFFbkQsY0FBTSxjQUFjO0FBQ3BCLGNBQU0sYUFBYTtBQUNuQixjQUFNLFFBQVE7QUFFZCxjQUFNLFlBQVksUUFBUSxtQkFBbUIsUUFBUTtBQUNyRCxjQUFNLGFBQWE7QUFDbkIsY0FBTSxPQUFPLFNBQVMsZ0JBQWdCLDhCQUE4QixNQUFNO0FBQzFFLGFBQUssVUFBVSxJQUFJLGlCQUFpQjtBQUNwQyxhQUFLLGFBQWEsS0FBSyxHQUFHLFFBQVEsU0FBUyxFQUFFO0FBQzdDLGFBQUssYUFBYSxLQUFLLEdBQUcsS0FBSyxLQUFLLGFBQWEsQ0FBQyxFQUFFO0FBQ3BELGFBQUssYUFBYSxTQUFTLEdBQUcsU0FBUyxFQUFFO0FBQ3pDLGFBQUssYUFBYSxVQUFVLEdBQUcsVUFBVSxFQUFFO0FBQzNDLGFBQUssU0FBUyxZQUFZLElBQUk7QUFFOUIsY0FBTSxJQUFJLFNBQVMsZ0JBQWdCLDhCQUE4QixHQUFHO0FBRXBFLGNBQU0sT0FBTyxTQUFTLGdCQUFnQiw4QkFBOEIsTUFBTTtBQUUxRSxhQUFLLGFBQWEsS0FBSyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksTUFBTSxTQUFTLElBQUksS0FBSyxJQUFJLE1BQU0sU0FBUyxJQUFJLEtBQUssRUFBRSxNQUFNLFFBQVEsVUFBVSxJQUFJLEtBQUssRUFBRSxFQUFFO0FBQ3JJLGFBQUssYUFBYSxRQUFRLE1BQU07QUFDaEMsVUFBRSxZQUFZLElBQUk7QUFFbEIsY0FBTSxhQUFhLFNBQVMsZ0JBQWdCLDhCQUE4QixTQUFTO0FBQ25GLG1CQUFXLFVBQVUsSUFBSSxPQUFPO0FBRWhDLGVBQU8sTUFBTSxJQUFJLFFBQVEsQ0FBQUEsWUFBVTtBQUNsQyxlQUFLLFVBQVUsT0FBTyxlQUFlLEtBQUssU0FBUyxNQUFNLGdCQUFnQixLQUFLQSxPQUFNLENBQUM7QUFDckYscUJBQVcsVUFBVSxPQUFPLGVBQWUsS0FBSyxTQUFTLE1BQU0sZ0JBQWdCLEtBQUtBLE9BQU0sQ0FBQztBQUFBLFFBQzVGLENBQUMsQ0FBQztBQUVGLG1CQUFXLGFBQWEsVUFBVSxHQUFHLFFBQVEsVUFBVSxJQUFJLEtBQUssS0FBSyxjQUFjLENBQUMsSUFBSSxLQUFLLElBQUksS0FBSyxFQUFFLElBQUksUUFBUSxVQUFVLElBQUksS0FBSyxLQUFLLGNBQWMsQ0FBQyxFQUFFO0FBQzdKLFVBQUUsWUFBWSxVQUFVO0FBRXhCLGFBQUssU0FBUyxZQUFZLENBQUM7QUFXM0I7QUFBQSxNQUNEO0FBRUEsV0FBSyxNQUFNLElBQUksZUFBZSxNQUFTO0FBQUEsSUFDeEMsQ0FBQztBQUVELFNBQUssV0FBVyxTQUFTLGdCQUFnQiw4QkFBOEIsS0FBSztBQUM1RSxTQUFLLFNBQVMsYUFBYSxTQUFTLG9CQUFvQjtBQUN4RCxTQUFLLGFBQWEsWUFBWSxLQUFLLFFBQVE7QUFDM0MsU0FBSyxVQUFVLGFBQWEsTUFBTSxLQUFLLFNBQVMsT0FBTyxDQUFDLENBQUM7QUFFekQsU0FBSyxVQUFVLFFBQVEsWUFBVTtBQUVoQyxZQUFNLE9BQU8sS0FBSywwQkFBMEIsS0FBSyxNQUFNO0FBQ3ZELFlBQU0sUUFBUSxLQUFLLDBCQUEwQixLQUFLLE1BQU07QUFDeEQsVUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPO0FBQ3BCO0FBQUEsTUFDRDtBQUVBLFdBQUssU0FBUyxNQUFNLE9BQU8sR0FBRyxLQUFLLFFBQVEsS0FBSyxzQkFBc0I7QUFDdEUsV0FBSyxTQUFTLE1BQU0sU0FBUyxHQUFHLEtBQUssTUFBTTtBQUMzQyxXQUFLLFNBQVMsTUFBTSxRQUFRLEdBQUcsS0FBSyx5QkFBeUIsS0FBSyxjQUFjLHlCQUF3Qix3QkFBd0IsS0FBSyxNQUFNLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDeEosQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLDhCQUE4QixLQUFLLE1BQU0sQ0FBQztBQUV6RCxVQUFNLHNCQUFzQixRQUFRLFlBQVU7QUFDN0MsWUFBTSxRQUFRLEtBQUssV0FBVyxLQUFLLE1BQU07QUFDekMsWUFBTSxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU07QUFDakMsVUFBSSxDQUFDLEdBQUc7QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFHO0FBQ3JCLGFBQU8sRUFBRSxXQUFXLElBQUksV0FBUztBQUFBLFFBQ2hDO0FBQUEsUUFDQSxVQUFVLElBQUksb0JBQW9CLGdCQUFnQixLQUFLLGlCQUFpQixTQUFTLGtCQUFrQixDQUFDLEdBQUcsRUFBRTtBQUFBLFFBQ3pHLFVBQVUsSUFBSSxvQkFBb0IsZ0JBQWdCLEtBQUssaUJBQWlCLFNBQVMsa0JBQWtCLENBQUMsR0FBRyxFQUFFO0FBQUEsTUFDMUcsRUFBRTtBQUFBLElBQ0gsQ0FBQztBQUVELFNBQUssVUFBVSxlQUFlLEtBQUssU0FBUyxVQUFVLG9CQUFvQixJQUFJO0FBQUE7QUFBQSxNQUEwRCxNQUFNLElBQUksT0FBSyxFQUFFLFFBQVE7QUFBQSxLQUFDLENBQUMsQ0FBQztBQUNwSyxTQUFLLFVBQVUsZUFBZSxLQUFLLFNBQVMsVUFBVSxvQkFBb0IsSUFBSTtBQUFBO0FBQUEsTUFBMEQsTUFBTSxJQUFJLE9BQUssRUFBRSxRQUFRO0FBQUEsS0FBQyxDQUFDLENBQUM7QUFFcEssU0FBSyxVQUFVLGlCQUFpQixDQUFDLFFBQVEsVUFBVTtBQUNsRCxZQUFNLFNBQVMsb0JBQW9CLEtBQUssTUFBTTtBQUM5QyxpQkFBVyxLQUFLLFFBQVE7QUFDdkIsY0FBTSxJQUFJLElBQUksd0JBQXdCLEtBQUssU0FBUyxVQUFVLEVBQUUsVUFBVSxFQUFFLE1BQU0sWUFBWSxLQUFLLFdBQVcsSUFBSSxDQUFFLENBQUM7QUFDckgsY0FBTSxJQUFJLElBQUksd0JBQXdCLEtBQUssU0FBUyxVQUFVLEVBQUUsVUFBVSxFQUFFLE1BQU0sWUFBWSxLQUFLLFdBQVcsSUFBSSxDQUFFLENBQUM7QUFBQSxNQUN0SDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxtQkFBbUI7QUFBQSxNQUN4QjtBQUFBLE1BQ0EsT0FBSyxLQUFLLFNBQVMsU0FBUyx1QkFBdUIsTUFBTSxXQUFXLE1BQU0sRUFBRSxNQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0Y7QUFDQSxVQUFNLG1CQUFtQjtBQUFBLE1BQ3hCO0FBQUEsTUFDQSxPQUFLLEtBQUssU0FBUyxTQUFTLHVCQUF1QixNQUFNLFdBQVcsTUFBTSxFQUFFLE1BQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzRjtBQUVBLFFBQUksb0JBQTZDO0FBRWpELFNBQUssVUFBVSxxQkFBcUI7QUFBQSxNQUNuQyxlQUFlO0FBQUEsUUFDZCxxQkFBcUIsTUFBTTtBQUFBLFFBQzNCLGNBQWMsQ0FBQyxLQUFLLFlBQVk7QUFDL0IsY0FBSSxJQUFJLFVBQVUsZ0JBQWdCLEdBQUc7QUFBRSxnQ0FBb0I7QUFBQSxVQUFZO0FBQ3ZFLGNBQUksSUFBSSxVQUFVLGdCQUFnQixHQUFHO0FBQUUsZ0NBQW9CO0FBQUEsVUFBWTtBQUN2RSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLFlBQVU7QUFFWix1QkFBaUIsS0FBSyxNQUFNO0FBQzVCLHVCQUFpQixLQUFLLE1BQU07QUFFNUIsWUFBTSxJQUFJLEtBQUssV0FBVyxLQUFLLE1BQU07QUFDckMsVUFBSSxDQUFDLEdBQUc7QUFBRTtBQUFBLE1BQVE7QUFDbEIsWUFBTSxPQUFPLEVBQUUsS0FBSyxLQUFLLE1BQU07QUFFL0IsVUFBSSxZQUFtQztBQUV2QyxVQUFJLFFBQVEsc0JBQXNCLFlBQVk7QUFDN0MsY0FBTSxjQUFjLEtBQUssU0FBUyxlQUFlLEtBQUssTUFBTTtBQUM1RCxZQUFJLGFBQWE7QUFDaEIsc0JBQVksS0FBSyxXQUFXLEtBQUssQ0FBQUMsT0FBS0EsR0FBRSxpQkFBaUIsU0FBUyxTQUFTLFlBQVksVUFBVSxDQUFDO0FBQUEsUUFDbkc7QUFBQSxNQUNEO0FBRUEsVUFBSSxRQUFRLHNCQUFzQixZQUFZO0FBQzdDLGNBQU0sY0FBYyxLQUFLLFNBQVMsZUFBZSxLQUFLLE1BQU07QUFDNUQsWUFBSSxhQUFhO0FBQ2hCLHNCQUFZLEtBQUssV0FBVyxLQUFLLENBQUFBLE9BQUtBLEdBQUUsaUJBQWlCLFNBQVMsU0FBUyxZQUFZLFVBQVUsQ0FBQztBQUFBLFFBQ25HO0FBQUEsTUFDRDtBQUVBLFVBQUksY0FBYyxFQUFFLG1CQUFtQixLQUFLLE1BQVMsR0FBRztBQUN2RCxVQUFFLG1CQUFtQixJQUFJLFFBQVcsTUFBUztBQUFBLE1BQzlDO0FBQ0EsUUFBRSxtQkFBbUIsU0FBUztBQUFBLElBQy9CLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFNRDtBQXpPYSx5QkFDVyx3QkFBd0I7QUFEekMsSUFBTSwwQkFBTjtBQTJPUCxNQUFNLFlBQVk7QUFBQSxFQXVCVCxZQUNVLGFBQ0EsaUJBQ2hCO0FBRmdCO0FBQ0E7QUFBQSxFQUNkO0FBQUEsRUF6QkosT0FBYyxRQUFRLE9BQW1DO0FBQ3hELFVBQU0sZUFBaUMsQ0FBQztBQUN4QyxVQUFNLGtCQUE0QixDQUFDO0FBRW5DLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFVBQUksV0FBVyxhQUFhLFVBQVUsU0FBTyxDQUFDLElBQUksaUJBQWlCLElBQUksQ0FBQztBQUN4RSxVQUFJLGFBQWEsSUFBSTtBQUNwQixjQUFNLGdCQUFnQjtBQUN0QixZQUFJLGFBQWEsVUFBVSxlQUFlO0FBQ3pDLHFCQUFXLFdBQVcsY0FBYyxVQUFVLFNBQU8sSUFBSSx5QkFBeUIsSUFBSSxHQUFHLGdCQUFnQixDQUFDO0FBQUEsUUFDM0csT0FBTztBQUNOLHFCQUFXLGFBQWE7QUFDeEIsdUJBQWEsS0FBSyxJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQ3ZDO0FBQUEsTUFDRDtBQUNBLG1CQUFhLFFBQVEsRUFBRSxTQUFTLElBQUk7QUFDcEMsc0JBQWdCLEtBQUssUUFBUTtBQUFBLElBQzlCO0FBRUEsV0FBTyxJQUFJLFlBQVksYUFBYSxRQUFRLGVBQWU7QUFBQSxFQUM1RDtBQUFBLEVBT0EsU0FBUyxTQUF5QjtBQUNqQyxXQUFPLEtBQUssZ0JBQWdCLE9BQU87QUFBQSxFQUNwQztBQUFBLEVBRUEsZ0JBQXdCO0FBQ3ZCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQUVBLE1BQU0sZ0NBQWdDLHNCQUFzQjtBQUFBLEVBTTNELFlBQ2tCLFNBQ2pCLFdBQ2lCLE9BQ0EsT0FDQSxZQUNoQjtBQUNELFVBQU0sT0FBTyxFQUFFLDhCQUE4QjtBQUM3QyxVQUFNLFNBQVMsV0FBVyxLQUFLLElBQUk7QUFQbEI7QUFFQTtBQUNBO0FBQ0E7QUFWbEIsU0FBaUIsU0FBUyxFQUFFLDZCQUE2QixFQUFFLE9BQU8sRUFBRSxhQUFhLE1BQU0sRUFBRSxHQUFHO0FBQUEsTUFDM0YsRUFBRSw4QkFBOEI7QUFBQSxNQUNoQyxFQUFFLDBCQUEwQjtBQUFBLElBQzdCLENBQUM7QUFXQSxTQUFLLEtBQUssWUFBWSxLQUFLLE9BQU8sSUFBSTtBQUV0QyxVQUFNLGVBQWUsb0JBQW9CLEtBQUssUUFBUSxtQkFBbUIsTUFBTSxLQUFLLFFBQVEsY0FBYyxDQUFDO0FBRTNHLFNBQUssVUFBVSxXQUFXLEtBQUssT0FBTyxNQUFNO0FBQUEsTUFDM0MsY0FBYyxhQUFhLElBQUksT0FBSyxFQUFFLHNCQUFzQjtBQUFBLElBQzdELENBQUMsQ0FBQztBQUVGLFFBQUk7QUFFSixRQUFJLE1BQU0sUUFBUSxTQUFTLEdBQUc7QUFDN0IsYUFBTyxLQUFLLFVBQVUsYUFBYTtBQUFBLFFBQ2xDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxNQUFNLGlCQUFpQixTQUFTO0FBQUEsUUFDckMsS0FBSyxNQUFNLGlCQUFpQixTQUFTLHlCQUF5QjtBQUFBLE1BQy9ELElBQUk7QUFBQSxRQUNIO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxNQUFNLGlCQUFpQixTQUFTO0FBQUEsUUFDckMsS0FBSyxNQUFNLGlCQUFpQixTQUFTLHlCQUF5QjtBQUFBLE1BQy9EO0FBQUEsSUFDRCxPQUFPO0FBQ04sYUFBTyxLQUFLLFVBQVUsYUFBYTtBQUFBLFFBQ2xDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxNQUFNLGlCQUFpQixTQUFTO0FBQUEsUUFDckMsS0FBSyxNQUFNLGlCQUFpQixTQUFTLHlCQUF5QjtBQUFBLE1BQy9ELElBQUk7QUFBQSxRQUNIO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxNQUFNLGlCQUFpQixTQUFTO0FBQUEsUUFDckMsS0FBSyxNQUFNLGlCQUFpQixTQUFTLHlCQUF5QjtBQUFBLE1BQy9EO0FBQUEsSUFDRDtBQUVBLFVBQU0sWUFBWSxLQUFLLFVBQVUsSUFBSSxVQUFVLEtBQUssT0FBTyxXQUFXO0FBQUEsTUFDckUsdUJBQXVCO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBRUYsVUFBTSxVQUFVLEtBQUssVUFBVSxJQUFJO0FBQUEsTUFDbEM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFDRCxjQUFVLEtBQUssU0FBUyxFQUFFLE1BQU0sT0FBTyxPQUFPLEtBQUssQ0FBQztBQUVwRCxVQUFNLGdCQUFnQixLQUFLLFVBQVUsSUFBSTtBQUFBLE1BQ3hDO0FBQUEsTUFDQTtBQUFBLE1BQ0EsVUFBVSxZQUFZLFFBQVEsY0FBYztBQUFBLE1BQzVDO0FBQUEsTUFDQSxNQUFNO0FBQ0wsYUFBSyxRQUFRLE1BQU07QUFDbkIsYUFBSyxXQUFXLG1CQUFtQixJQUFJLEtBQUssV0FBVyxtQkFBbUIsSUFBSSxNQUFNLFFBQVEsU0FBWSxLQUFLLE9BQU8sTUFBUztBQUFBLE1BQzlIO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxVQUFVLFFBQVEsWUFBVTtBQUNoQyxZQUFNLFdBQVcsS0FBSyxXQUFXLG1CQUFtQixLQUFLLE1BQU0sTUFBTTtBQUNyRSxvQkFBYyxVQUFVO0FBQUEsSUFDekIsQ0FBQyxDQUFDO0FBRUYsY0FBVSxLQUFLLGVBQWUsRUFBRSxNQUFNLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFBQSxFQUMzRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJyZWFkZXIiLCAibSJdCn0K
