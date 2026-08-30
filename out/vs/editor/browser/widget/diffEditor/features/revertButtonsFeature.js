import { addDisposableListener, h, EventType } from "../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorunWithStore, derived } from "../../../../../base/common/observable.js";
import { LineRange, LineRangeSet } from "../../../../common/core/ranges/lineRange.js";
import { Range } from "../../../../common/core/range.js";
import { LineRangeMapping } from "../../../../common/diff/rangeMapping.js";
import { GlyphMarginLane } from "../../../../common/model.js";
import { localize } from "../../../../../nls.js";
const emptyArr = [];
class RevertButtonsFeature extends Disposable {
  constructor(_editors, _diffModel, _options, _widget) {
    super();
    this._editors = _editors;
    this._diffModel = _diffModel;
    this._options = _options;
    this._widget = _widget;
    this._selectedDiffs = derived(this, (reader) => {
      const model = this._diffModel.read(reader);
      const diff = model?.diff.read(reader);
      if (!diff) {
        return emptyArr;
      }
      const selections = this._editors.modifiedSelections.read(reader);
      if (selections.every((s) => s.isEmpty())) {
        return emptyArr;
      }
      const selectedLineNumbers = new LineRangeSet(selections.map((s) => LineRange.fromRangeInclusive(s)));
      const selectedMappings = diff.mappings.filter(
        (m) => m.lineRangeMapping.innerChanges && selectedLineNumbers.intersects(m.lineRangeMapping.modified)
      );
      const result = selectedMappings.map((mapping) => ({
        mapping,
        rangeMappings: mapping.lineRangeMapping.innerChanges.filter(
          (c) => selections.some((s) => Range.areIntersecting(c.modifiedRange, s))
        )
      }));
      if (result.length === 0 || result.every((r) => r.rangeMappings.length === 0)) {
        return emptyArr;
      }
      return result;
    });
    this._register(autorunWithStore((reader, store) => {
      if (!this._options.shouldRenderOldRevertArrows.read(reader)) {
        return;
      }
      const model = this._diffModel.read(reader);
      const diff = model?.diff.read(reader);
      if (!model || !diff) {
        return;
      }
      if (model.movedTextToCompare.read(reader)) {
        return;
      }
      const glyphWidgetsModified = [];
      const selectedDiffs = this._selectedDiffs.read(reader);
      const selectedDiffsSet = new Set(selectedDiffs.map((d) => d.mapping));
      if (selectedDiffs.length > 0) {
        const selections = this._editors.modifiedSelections.read(reader);
        const btn = store.add(new RevertButton(
          selections[selections.length - 1].positionLineNumber,
          this._widget,
          selectedDiffs.flatMap((d) => d.rangeMappings),
          true
        ));
        this._editors.modified.addGlyphMarginWidget(btn);
        glyphWidgetsModified.push(btn);
      }
      for (const m of diff.mappings) {
        if (selectedDiffsSet.has(m)) {
          continue;
        }
        if (!m.lineRangeMapping.modified.isEmpty && m.lineRangeMapping.innerChanges) {
          const btn = store.add(new RevertButton(
            m.lineRangeMapping.modified.startLineNumber,
            this._widget,
            m.lineRangeMapping,
            false
          ));
          this._editors.modified.addGlyphMarginWidget(btn);
          glyphWidgetsModified.push(btn);
        }
      }
      store.add(toDisposable(() => {
        for (const w of glyphWidgetsModified) {
          this._editors.modified.removeGlyphMarginWidget(w);
        }
      }));
    }));
  }
}
const _RevertButton = class _RevertButton extends Disposable {
  constructor(_lineNumber, _widget, _diffs, _revertSelection) {
    super();
    this._lineNumber = _lineNumber;
    this._widget = _widget;
    this._diffs = _diffs;
    this._revertSelection = _revertSelection;
    this._id = `revertButton${_RevertButton.counter++}`;
    this._domNode = h(
      "div.revertButton",
      {
        title: this._revertSelection ? localize("revertSelectedChanges", "Revert Selected Changes") : localize("revertChange", "Revert Change")
      },
      [renderIcon(Codicon.arrowRight)]
    ).root;
    this._register(addDisposableListener(this._domNode, EventType.MOUSE_DOWN, (e) => {
      if (e.button !== 2) {
        e.stopPropagation();
        e.preventDefault();
      }
    }));
    this._register(addDisposableListener(this._domNode, EventType.MOUSE_UP, (e) => {
      e.stopPropagation();
      e.preventDefault();
    }));
    this._register(addDisposableListener(this._domNode, EventType.CLICK, (e) => {
      if (this._diffs instanceof LineRangeMapping) {
        this._widget.revert(this._diffs);
      } else {
        this._widget.revertRangeMappings(this._diffs);
      }
      e.stopPropagation();
      e.preventDefault();
    }));
  }
  getId() {
    return this._id;
  }
  /**
   * Get the dom node of the glyph widget.
   */
  getDomNode() {
    return this._domNode;
  }
  /**
   * Get the placement of the glyph widget.
   */
  getPosition() {
    return {
      lane: GlyphMarginLane.Right,
      range: {
        startColumn: 1,
        startLineNumber: this._lineNumber,
        endColumn: 1,
        endLineNumber: this._lineNumber
      },
      zIndex: 10001
    };
  }
};
_RevertButton.counter = 0;
let RevertButton = _RevertButton;
export {
  RevertButton,
  RevertButtonsFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcZmVhdHVyZXNcXHJldmVydEJ1dHRvbnNGZWF0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBoLCBFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgYXV0b3J1bldpdGhTdG9yZSwgZGVyaXZlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUdseXBoTWFyZ2luV2lkZ2V0LCBJR2x5cGhNYXJnaW5XaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckVkaXRvcnMgfSBmcm9tICcuLi9jb21wb25lbnRzL2RpZmZFZGl0b3JFZGl0b3JzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vZGlmZkVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvclZpZXdNb2RlbCB9IGZyb20gJy4uL2RpZmZFZGl0b3JWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uL2RpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlLCBMaW5lUmFuZ2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlTWFwcGluZywgUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IEdseXBoTWFyZ2luTGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmNvbnN0IGVtcHR5QXJyOiBuZXZlcltdID0gW107XG5cbmV4cG9ydCBjbGFzcyBSZXZlcnRCdXR0b25zRmVhdHVyZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JzOiBEaWZmRWRpdG9yRWRpdG9ycyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmTW9kZWw6IElPYnNlcnZhYmxlPERpZmZFZGl0b3JWaWV3TW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IERpZmZFZGl0b3JPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldDogRGlmZkVkaXRvcldpZGdldFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9vcHRpb25zLnNob3VsZFJlbmRlck9sZFJldmVydEFycm93cy5yZWFkKHJlYWRlcikpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBkaWZmID0gbW9kZWw/LmRpZmYucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFtb2RlbCB8fCAhZGlmZikgeyByZXR1cm47IH1cblx0XHRcdGlmIChtb2RlbC5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZChyZWFkZXIpKSB7IHJldHVybjsgfVxuXG5cdFx0XHRjb25zdCBnbHlwaFdpZGdldHNNb2RpZmllZDogSUdseXBoTWFyZ2luV2lkZ2V0W10gPSBbXTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWREaWZmcyA9IHRoaXMuX3NlbGVjdGVkRGlmZnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWREaWZmc1NldCA9IG5ldyBTZXQoc2VsZWN0ZWREaWZmcy5tYXAoZCA9PiBkLm1hcHBpbmcpKTtcblxuXHRcdFx0aWYgKHNlbGVjdGVkRGlmZnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQvLyBUaGUgYnV0dG9uIHRvIHJldmVydCB0aGUgc2VsZWN0aW9uXG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkU2VsZWN0aW9ucy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdFx0Y29uc3QgYnRuID0gc3RvcmUuYWRkKG5ldyBSZXZlcnRCdXR0b24oXG5cdFx0XHRcdFx0c2VsZWN0aW9uc1tzZWxlY3Rpb25zLmxlbmd0aCAtIDFdLnBvc2l0aW9uTGluZU51bWJlcixcblx0XHRcdFx0XHR0aGlzLl93aWRnZXQsXG5cdFx0XHRcdFx0c2VsZWN0ZWREaWZmcy5mbGF0TWFwKGQgPT4gZC5yYW5nZU1hcHBpbmdzKSxcblx0XHRcdFx0XHR0cnVlXG5cdFx0XHRcdCkpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmFkZEdseXBoTWFyZ2luV2lkZ2V0KGJ0bik7XG5cdFx0XHRcdGdseXBoV2lkZ2V0c01vZGlmaWVkLnB1c2goYnRuKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBtIG9mIGRpZmYubWFwcGluZ3MpIHtcblx0XHRcdFx0aWYgKHNlbGVjdGVkRGlmZnNTZXQuaGFzKG0pKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdGlmICghbS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmlzRW1wdHkgJiYgbS5saW5lUmFuZ2VNYXBwaW5nLmlubmVyQ2hhbmdlcykge1xuXHRcdFx0XHRcdGNvbnN0IGJ0biA9IHN0b3JlLmFkZChuZXcgUmV2ZXJ0QnV0dG9uKFxuXHRcdFx0XHRcdFx0bS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdHRoaXMuX3dpZGdldCxcblx0XHRcdFx0XHRcdG0ubGluZVJhbmdlTWFwcGluZyxcblx0XHRcdFx0XHRcdGZhbHNlXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5hZGRHbHlwaE1hcmdpbldpZGdldChidG4pO1xuXHRcdFx0XHRcdGdseXBoV2lkZ2V0c01vZGlmaWVkLnB1c2goYnRuKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCB3IG9mIGdseXBoV2lkZ2V0c01vZGlmaWVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5yZW1vdmVHbHlwaE1hcmdpbldpZGdldCh3KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGVkRGlmZnMgPSBkZXJpdmVkKHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHQvKiogQGRlc2NyaXB0aW9uIHNlbGVjdGVkRGlmZnMgKi9cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZGlmZiA9IG1vZGVsPy5kaWZmLnJlYWQocmVhZGVyKTtcblx0XHQvLyBSZXR1cm4gYGVtcHR5QXJyYCBiZWNhdXNlIGl0IGlzIGEgY29uc3RhbnQuIFtdIGlzIGFsd2F5cyBhIG5ldyBhcnJheSBhbmQgd291bGQgdHJpZ2dlciBhIGNoYW5nZS5cblx0XHRpZiAoIWRpZmYpIHsgcmV0dXJuIGVtcHR5QXJyOyB9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZFNlbGVjdGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdGlmIChzZWxlY3Rpb25zLmV2ZXJ5KHMgPT4gcy5pc0VtcHR5KCkpKSB7IHJldHVybiBlbXB0eUFycjsgfVxuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRMaW5lTnVtYmVycyA9IG5ldyBMaW5lUmFuZ2VTZXQoc2VsZWN0aW9ucy5tYXAocyA9PiBMaW5lUmFuZ2UuZnJvbVJhbmdlSW5jbHVzaXZlKHMpKSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZE1hcHBpbmdzID0gZGlmZi5tYXBwaW5ncy5maWx0ZXIobSA9PlxuXHRcdFx0bS5saW5lUmFuZ2VNYXBwaW5nLmlubmVyQ2hhbmdlcyAmJiBzZWxlY3RlZExpbmVOdW1iZXJzLmludGVyc2VjdHMobS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkKVxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VsZWN0ZWRNYXBwaW5ncy5tYXAobWFwcGluZyA9PiAoe1xuXHRcdFx0bWFwcGluZyxcblx0XHRcdHJhbmdlTWFwcGluZ3M6IG1hcHBpbmcubGluZVJhbmdlTWFwcGluZy5pbm5lckNoYW5nZXMhLmZpbHRlcihcblx0XHRcdFx0YyA9PiBzZWxlY3Rpb25zLnNvbWUocyA9PiBSYW5nZS5hcmVJbnRlcnNlY3RpbmcoYy5tb2RpZmllZFJhbmdlLCBzKSlcblx0XHRcdClcblx0XHR9KSk7XG5cdFx0aWYgKHJlc3VsdC5sZW5ndGggPT09IDAgfHwgcmVzdWx0LmV2ZXJ5KHIgPT4gci5yYW5nZU1hcHBpbmdzLmxlbmd0aCA9PT0gMCkpIHsgcmV0dXJuIGVtcHR5QXJyOyB9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXZlcnRCdXR0b24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUdseXBoTWFyZ2luV2lkZ2V0IHtcblx0cHVibGljIHN0YXRpYyBjb3VudGVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pZDogc3RyaW5nO1xuXG5cdGdldElkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9pZDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldDogRGlmZkVkaXRvcldpZGdldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmczogUmFuZ2VNYXBwaW5nW10gfCBMaW5lUmFuZ2VNYXBwaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JldmVydFNlbGVjdGlvbjogYm9vbGVhbixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pZCA9IGByZXZlcnRCdXR0b24ke1JldmVydEJ1dHRvbi5jb3VudGVyKyt9YDtcblx0XHR0aGlzLl9kb21Ob2RlID0gaCgnZGl2LnJldmVydEJ1dHRvbicsIHtcblx0XHRcdHRpdGxlOiB0aGlzLl9yZXZlcnRTZWxlY3Rpb25cblx0XHRcdFx0PyBsb2NhbGl6ZSgncmV2ZXJ0U2VsZWN0ZWRDaGFuZ2VzJywgJ1JldmVydCBTZWxlY3RlZCBDaGFuZ2VzJylcblx0XHRcdFx0OiBsb2NhbGl6ZSgncmV2ZXJ0Q2hhbmdlJywgJ1JldmVydCBDaGFuZ2UnKVxuXHRcdH0sXG5cdFx0XHRbcmVuZGVySWNvbihDb2RpY29uLmFycm93UmlnaHQpXVxuXHRcdCkucm9vdDtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IHtcblx0XHRcdC8vIGRvbid0IHByZXZlbnQgY29udGV4dCBtZW51IGZyb20gc2hvd2luZyB1cFxuXHRcdFx0aWYgKGUuYnV0dG9uICE9PSAyKSB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZSwgRXZlbnRUeXBlLk1PVVNFX1VQLCBlID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaWZmcyBpbnN0YW5jZW9mIExpbmVSYW5nZU1hcHBpbmcpIHtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnJldmVydCh0aGlzLl9kaWZmcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQucmV2ZXJ0UmFuZ2VNYXBwaW5ncyh0aGlzLl9kaWZmcyk7XG5cdFx0XHR9XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGRvbSBub2RlIG9mIHRoZSBnbHlwaCB3aWRnZXQuXG5cdCAqL1xuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHBsYWNlbWVudCBvZiB0aGUgZ2x5cGggd2lkZ2V0LlxuXHQgKi9cblx0Z2V0UG9zaXRpb24oKTogSUdseXBoTWFyZ2luV2lkZ2V0UG9zaXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYW5lOiBHbHlwaE1hcmdpbkxhbmUuUmlnaHQsXG5cdFx0XHRyYW5nZToge1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiB0aGlzLl9saW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IHRoaXMuX2xpbmVOdW1iZXIsXG5cdFx0XHR9LFxuXHRcdFx0ekluZGV4OiAxMDAwMSxcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QixHQUFHLGlCQUFpQjtBQUNwRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFzQixrQkFBa0IsZUFBZTtBQU12RCxTQUFTLFdBQVcsb0JBQW9CO0FBQ3hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHdCQUFzQztBQUMvQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUV6QixNQUFNLFdBQW9CLENBQUM7QUFFcEIsTUFBTSw2QkFBNkIsV0FBVztBQUFBLEVBQ3BELFlBQ2tCLFVBQ0EsWUFDQSxVQUNBLFNBQ2hCO0FB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
