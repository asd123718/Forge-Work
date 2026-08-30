import { Disposable } from "../../../../../base/common/lifecycle.js";
import { derived } from "../../../../../base/common/observable.js";
import { allowsTrueInlineDiffRendering } from "./diffEditorViewZones/diffEditorViewZones.js";
import { MovedBlocksLinesFeature } from "../features/movedBlocksLinesFeature.js";
import { diffAddDecoration, diffAddDecorationEmpty, diffDeleteDecoration, diffDeleteDecorationEmpty, diffLineAddDecorationBackground, diffLineAddDecorationBackgroundWithIndicator, diffLineDeleteDecorationBackground, diffLineDeleteDecorationBackgroundWithIndicator, diffWholeLineAddDecoration, diffWholeLineDeleteDecoration } from "../registrations.contribution.js";
import { applyObservableDecorations } from "../utils.js";
class DiffEditorDecorations extends Disposable {
  constructor(_editors, _diffModel, _options, widget) {
    super();
    this._editors = _editors;
    this._diffModel = _diffModel;
    this._options = _options;
    this._decorations = derived(this, (reader) => {
      const diffModel = this._diffModel.read(reader);
      const diff = diffModel?.diff.read(reader);
      if (!diff) {
        return null;
      }
      const movedTextToCompare = this._diffModel.read(reader).movedTextToCompare.read(reader);
      const renderIndicators = this._options.renderIndicators.read(reader);
      const showEmptyDecorations = this._options.showEmptyDecorations.read(reader);
      const originalDecorations = [];
      const modifiedDecorations = [];
      if (!movedTextToCompare) {
        for (const m of diff.mappings) {
          if (!m.lineRangeMapping.original.isEmpty) {
            originalDecorations.push({ range: m.lineRangeMapping.original.toInclusiveRange(), options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
          }
          if (!m.lineRangeMapping.modified.isEmpty) {
            modifiedDecorations.push({ range: m.lineRangeMapping.modified.toInclusiveRange(), options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
          }
          if (m.lineRangeMapping.modified.isEmpty || m.lineRangeMapping.original.isEmpty) {
            if (!m.lineRangeMapping.original.isEmpty) {
              originalDecorations.push({ range: m.lineRangeMapping.original.toInclusiveRange(), options: diffWholeLineDeleteDecoration });
            }
            if (!m.lineRangeMapping.modified.isEmpty) {
              modifiedDecorations.push({ range: m.lineRangeMapping.modified.toInclusiveRange(), options: diffWholeLineAddDecoration });
            }
          } else {
            const useInlineDiff = this._options.useTrueInlineDiffRendering.read(reader) && allowsTrueInlineDiffRendering(m.lineRangeMapping);
            for (const i of m.lineRangeMapping.innerChanges || []) {
              if (m.lineRangeMapping.original.contains(i.originalRange.startLineNumber)) {
                originalDecorations.push({ range: i.originalRange, options: i.originalRange.isEmpty() && showEmptyDecorations ? diffDeleteDecorationEmpty : diffDeleteDecoration });
              }
              if (m.lineRangeMapping.modified.contains(i.modifiedRange.startLineNumber)) {
                modifiedDecorations.push({ range: i.modifiedRange, options: i.modifiedRange.isEmpty() && showEmptyDecorations && !useInlineDiff ? diffAddDecorationEmpty : diffAddDecoration });
              }
              if (useInlineDiff) {
                const deletedText = diffModel.model.original.getValueInRange(i.originalRange);
                modifiedDecorations.push({
                  range: i.modifiedRange,
                  options: {
                    description: "deleted-text",
                    before: {
                      content: deletedText,
                      inlineClassName: "inline-deleted-text"
                    },
                    zIndex: 1e5,
                    showIfCollapsed: true
                  }
                });
              }
            }
          }
        }
      }
      if (movedTextToCompare) {
        for (const m of movedTextToCompare.changes) {
          const fullRangeOriginal = m.original.toInclusiveRange();
          if (fullRangeOriginal) {
            originalDecorations.push({ range: fullRangeOriginal, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
          }
          const fullRangeModified = m.modified.toInclusiveRange();
          if (fullRangeModified) {
            modifiedDecorations.push({ range: fullRangeModified, options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
          }
          for (const i of m.innerChanges || []) {
            originalDecorations.push({ range: i.originalRange, options: diffDeleteDecoration });
            modifiedDecorations.push({ range: i.modifiedRange, options: diffAddDecoration });
          }
        }
      }
      const activeMovedText = this._diffModel.read(reader).activeMovedText.read(reader);
      for (const m of diff.movedTexts) {
        originalDecorations.push({
          range: m.lineRangeMapping.original.toInclusiveRange(),
          options: {
            description: "moved",
            blockClassName: "movedOriginal" + (m === activeMovedText ? " currentMove" : ""),
            blockPadding: [MovedBlocksLinesFeature.movedCodeBlockPadding, 0, MovedBlocksLinesFeature.movedCodeBlockPadding, MovedBlocksLinesFeature.movedCodeBlockPadding]
          }
        });
        modifiedDecorations.push({
          range: m.lineRangeMapping.modified.toInclusiveRange(),
          options: {
            description: "moved",
            blockClassName: "movedModified" + (m === activeMovedText ? " currentMove" : ""),
            blockPadding: [4, 0, 4, 4]
          }
        });
      }
      return { originalDecorations, modifiedDecorations };
    });
    this._register(applyObservableDecorations(this._editors.original, this._decorations.map((d) => d?.originalDecorations || [])));
    this._register(applyObservableDecorations(this._editors.modified, this._decorations.map((d) => d?.modifiedDecorations || [])));
  }
}
export {
  DiffEditorDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcY29tcG9uZW50c1xcZGlmZkVkaXRvckRlY29yYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgZGVyaXZlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckVkaXRvcnMgfSBmcm9tICcuL2RpZmZFZGl0b3JFZGl0b3JzLmpzJztcbmltcG9ydCB7IGFsbG93c1RydWVJbmxpbmVEaWZmUmVuZGVyaW5nIH0gZnJvbSAnLi9kaWZmRWRpdG9yVmlld1pvbmVzL2RpZmZFZGl0b3JWaWV3Wm9uZXMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi9kaWZmRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi4vZGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBNb3ZlZEJsb2Nrc0xpbmVzRmVhdHVyZSB9IGZyb20gJy4uL2ZlYXR1cmVzL21vdmVkQmxvY2tzTGluZXNGZWF0dXJlLmpzJztcbmltcG9ydCB7IGRpZmZBZGREZWNvcmF0aW9uLCBkaWZmQWRkRGVjb3JhdGlvbkVtcHR5LCBkaWZmRGVsZXRlRGVjb3JhdGlvbiwgZGlmZkRlbGV0ZURlY29yYXRpb25FbXB0eSwgZGlmZkxpbmVBZGREZWNvcmF0aW9uQmFja2dyb3VuZCwgZGlmZkxpbmVBZGREZWNvcmF0aW9uQmFja2dyb3VuZFdpdGhJbmRpY2F0b3IsIGRpZmZMaW5lRGVsZXRlRGVjb3JhdGlvbkJhY2tncm91bmQsIGRpZmZMaW5lRGVsZXRlRGVjb3JhdGlvbkJhY2tncm91bmRXaXRoSW5kaWNhdG9yLCBkaWZmV2hvbGVMaW5lQWRkRGVjb3JhdGlvbiwgZGlmZldob2xlTGluZURlbGV0ZURlY29yYXRpb24gfSBmcm9tICcuLi9yZWdpc3RyYXRpb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBhcHBseU9ic2VydmFibGVEZWNvcmF0aW9ucyB9IGZyb20gJy4uL3V0aWxzLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEaWZmRWRpdG9yRGVjb3JhdGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yczogRGlmZkVkaXRvckVkaXRvcnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlmZk1vZGVsOiBJT2JzZXJ2YWJsZTxEaWZmRWRpdG9yVmlld01vZGVsIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBEaWZmRWRpdG9yT3B0aW9ucyxcblx0XHR3aWRnZXQ6IERpZmZFZGl0b3JXaWRnZXQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhcHBseU9ic2VydmFibGVEZWNvcmF0aW9ucyh0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLCB0aGlzLl9kZWNvcmF0aW9ucy5tYXAoZCA9PiBkPy5vcmlnaW5hbERlY29yYXRpb25zIHx8IFtdKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcGx5T2JzZXJ2YWJsZURlY29yYXRpb25zKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQsIHRoaXMuX2RlY29yYXRpb25zLm1hcChkID0+IGQ/Lm1vZGlmaWVkRGVjb3JhdGlvbnMgfHwgW10pKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9ucyA9IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdGNvbnN0IGRpZmZNb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZGlmZiA9IGRpZmZNb2RlbD8uZGlmZi5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFkaWZmKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBtb3ZlZFRleHRUb0NvbXBhcmUgPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpIS5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHJlbmRlckluZGljYXRvcnMgPSB0aGlzLl9vcHRpb25zLnJlbmRlckluZGljYXRvcnMucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHNob3dFbXB0eURlY29yYXRpb25zID0gdGhpcy5fb3B0aW9ucy5zaG93RW1wdHlEZWNvcmF0aW9ucy5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCBvcmlnaW5hbERlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IG1vZGlmaWVkRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0aWYgKCFtb3ZlZFRleHRUb0NvbXBhcmUpIHtcblx0XHRcdGZvciAoY29uc3QgbSBvZiBkaWZmLm1hcHBpbmdzKSB7XG5cdFx0XHRcdGlmICghbS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRvcmlnaW5hbERlY29yYXRpb25zLnB1c2goeyByYW5nZTogbS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLnRvSW5jbHVzaXZlUmFuZ2UoKSEsIG9wdGlvbnM6IHJlbmRlckluZGljYXRvcnMgPyBkaWZmTGluZURlbGV0ZURlY29yYXRpb25CYWNrZ3JvdW5kV2l0aEluZGljYXRvciA6IGRpZmZMaW5lRGVsZXRlRGVjb3JhdGlvbkJhY2tncm91bmQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFtLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaXNFbXB0eSkge1xuXHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBtLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQudG9JbmNsdXNpdmVSYW5nZSgpISwgb3B0aW9uczogcmVuZGVySW5kaWNhdG9ycyA/IGRpZmZMaW5lQWRkRGVjb3JhdGlvbkJhY2tncm91bmRXaXRoSW5kaWNhdG9yIDogZGlmZkxpbmVBZGREZWNvcmF0aW9uQmFja2dyb3VuZCB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaXNFbXB0eSB8fCBtLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWwuaXNFbXB0eSkge1xuXHRcdFx0XHRcdGlmICghbS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBtLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWwudG9JbmNsdXNpdmVSYW5nZSgpISwgb3B0aW9uczogZGlmZldob2xlTGluZURlbGV0ZURlY29yYXRpb24gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghbS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBtLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQudG9JbmNsdXNpdmVSYW5nZSgpISwgb3B0aW9uczogZGlmZldob2xlTGluZUFkZERlY29yYXRpb24gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHVzZUlubGluZURpZmYgPSB0aGlzLl9vcHRpb25zLnVzZVRydWVJbmxpbmVEaWZmUmVuZGVyaW5nLnJlYWQocmVhZGVyKSAmJiBhbGxvd3NUcnVlSW5saW5lRGlmZlJlbmRlcmluZyhtLmxpbmVSYW5nZU1hcHBpbmcpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgaSBvZiBtLmxpbmVSYW5nZU1hcHBpbmcuaW5uZXJDaGFuZ2VzIHx8IFtdKSB7XG5cdFx0XHRcdFx0XHQvLyBEb24ndCBzaG93IGVtcHR5IG1hcmtlcnMgb3V0c2lkZSB0aGUgbGluZSByYW5nZVxuXHRcdFx0XHRcdFx0aWYgKG0ubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbC5jb250YWlucyhpLm9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbERlY29yYXRpb25zLnB1c2goeyByYW5nZTogaS5vcmlnaW5hbFJhbmdlLCBvcHRpb25zOiAoaS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSAmJiBzaG93RW1wdHlEZWNvcmF0aW9ucykgPyBkaWZmRGVsZXRlRGVjb3JhdGlvbkVtcHR5IDogZGlmZkRlbGV0ZURlY29yYXRpb24gfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmNvbnRhaW5zKGkubW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBpLm1vZGlmaWVkUmFuZ2UsIG9wdGlvbnM6IChpLm1vZGlmaWVkUmFuZ2UuaXNFbXB0eSgpICYmIHNob3dFbXB0eURlY29yYXRpb25zICYmICF1c2VJbmxpbmVEaWZmKSA/IGRpZmZBZGREZWNvcmF0aW9uRW1wdHkgOiBkaWZmQWRkRGVjb3JhdGlvbiB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICh1c2VJbmxpbmVEaWZmKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGRlbGV0ZWRUZXh0ID0gZGlmZk1vZGVsIS5tb2RlbC5vcmlnaW5hbC5nZXRWYWx1ZUluUmFuZ2UoaS5vcmlnaW5hbFJhbmdlKTtcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWREZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRyYW5nZTogaS5tb2RpZmllZFJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnZGVsZXRlZC10ZXh0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdGJlZm9yZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZW50OiBkZWxldGVkVGV4dCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAnaW5saW5lLWRlbGV0ZWQtdGV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0ekluZGV4OiAxMDAwMDAsXG5cdFx0XHRcdFx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobW92ZWRUZXh0VG9Db21wYXJlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG0gb2YgbW92ZWRUZXh0VG9Db21wYXJlLmNoYW5nZXMpIHtcblx0XHRcdFx0Y29uc3QgZnVsbFJhbmdlT3JpZ2luYWwgPSBtLm9yaWdpbmFsLnRvSW5jbHVzaXZlUmFuZ2UoKTtcblx0XHRcdFx0aWYgKGZ1bGxSYW5nZU9yaWdpbmFsKSB7XG5cdFx0XHRcdFx0b3JpZ2luYWxEZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IGZ1bGxSYW5nZU9yaWdpbmFsLCBvcHRpb25zOiByZW5kZXJJbmRpY2F0b3JzID8gZGlmZkxpbmVEZWxldGVEZWNvcmF0aW9uQmFja2dyb3VuZFdpdGhJbmRpY2F0b3IgOiBkaWZmTGluZURlbGV0ZURlY29yYXRpb25CYWNrZ3JvdW5kIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZ1bGxSYW5nZU1vZGlmaWVkID0gbS5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCk7XG5cdFx0XHRcdGlmIChmdWxsUmFuZ2VNb2RpZmllZCkge1xuXHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBmdWxsUmFuZ2VNb2RpZmllZCwgb3B0aW9uczogcmVuZGVySW5kaWNhdG9ycyA/IGRpZmZMaW5lQWRkRGVjb3JhdGlvbkJhY2tncm91bmRXaXRoSW5kaWNhdG9yIDogZGlmZkxpbmVBZGREZWNvcmF0aW9uQmFja2dyb3VuZCB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgaSBvZiBtLmlubmVyQ2hhbmdlcyB8fCBbXSkge1xuXHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBpLm9yaWdpbmFsUmFuZ2UsIG9wdGlvbnM6IGRpZmZEZWxldGVEZWNvcmF0aW9uIH0pO1xuXHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBpLm1vZGlmaWVkUmFuZ2UsIG9wdGlvbnM6IGRpZmZBZGREZWNvcmF0aW9uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZU1vdmVkVGV4dCA9IHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcikhLmFjdGl2ZU1vdmVkVGV4dC5yZWFkKHJlYWRlcik7XG5cblx0XHRmb3IgKGNvbnN0IG0gb2YgZGlmZi5tb3ZlZFRleHRzKSB7XG5cdFx0XHRvcmlnaW5hbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRyYW5nZTogbS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLnRvSW5jbHVzaXZlUmFuZ2UoKSEsIG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ21vdmVkJyxcblx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZTogJ21vdmVkT3JpZ2luYWwnICsgKG0gPT09IGFjdGl2ZU1vdmVkVGV4dCA/ICcgY3VycmVudE1vdmUnIDogJycpLFxuXHRcdFx0XHRcdGJsb2NrUGFkZGluZzogW01vdmVkQmxvY2tzTGluZXNGZWF0dXJlLm1vdmVkQ29kZUJsb2NrUGFkZGluZywgMCwgTW92ZWRCbG9ja3NMaW5lc0ZlYXR1cmUubW92ZWRDb2RlQmxvY2tQYWRkaW5nLCBNb3ZlZEJsb2Nrc0xpbmVzRmVhdHVyZS5tb3ZlZENvZGVCbG9ja1BhZGRpbmddLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0bW9kaWZpZWREZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IG0ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCkhLCBvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdtb3ZlZCcsXG5cdFx0XHRcdFx0YmxvY2tDbGFzc05hbWU6ICdtb3ZlZE1vZGlmaWVkJyArIChtID09PSBhY3RpdmVNb3ZlZFRleHQgPyAnIGN1cnJlbnRNb3ZlJyA6ICcnKSxcblx0XHRcdFx0XHRibG9ja1BhZGRpbmc6IFs0LCAwLCA0LCA0XSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgb3JpZ2luYWxEZWNvcmF0aW9ucywgbW9kaWZpZWREZWNvcmF0aW9ucyB9O1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQXNCLGVBQWU7QUFFckMsU0FBUyxxQ0FBcUM7QUFJOUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUIsd0JBQXdCLHNCQUFzQiwyQkFBMkIsaUNBQWlDLDhDQUE4QyxvQ0FBb0MsaURBQWlELDRCQUE0QixxQ0FBcUM7QUFDMVUsU0FBUyxrQ0FBa0M7QUFHcEMsTUFBTSw4QkFBOEIsV0FBVztBQUFBLEVBQ3JELFlBQ2tCLFVBQ0EsWUFDQSxVQUNqQixRQUNDO0FBQ0QsVUFBTTtBQUxXO0FBQ0E7QUFDQTtBQVNsQixTQUFpQixlQUFlLFFBQVEsTUFBTSxDQUFDLFdBQVc7QUFDekQsWUFBTSxZQUFZLEtBQUssV0FBVyxLQUFLLE1BQU07QUFDN0MsWUFBTSxPQUFPLFdBQVcsS0FBSyxLQUFLLE1BQU07QUFDeEMsVUFBSSxDQUFDLE1BQU07QUFDVixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0scUJBQXFCLEtBQUssV0FBVyxLQUFLLE1BQU0sRUFBRyxtQkFBbUIsS0FBSyxNQUFNO0FBQ3ZGLFlBQU0sbUJBQW1CLEtBQUssU0FBUyxpQkFBaUIsS0FBSyxNQUFNO0FBQ25FLFlBQU0sdUJBQXVCLEtBQUssU0FBUyxxQkFBcUIsS0FBSyxNQUFNO0FBRTNFLFlBQU0sc0JBQStDLENBQUM7QUFDdEQsWUFBTSxzQkFBK0MsQ0FBQztBQUN0RCxVQUFJLENBQUMsb0JBQW9CO0FBQ3hCLG1CQUFXLEtBQUssS0FBSyxVQUFVO0FBQzlCLGNBQUksQ0FBQyxFQUFFLGlCQUFpQixTQUFTLFNBQVM7QUFDekMsZ0NBQW9CLEtBQUssRUFBRSxPQUFPLEVBQUUsaUJBQWlCLFNBQVMsaUJBQWlCLEdBQUksU0FBUyxtQkFBbUIsa0RBQWtELG1DQUFtQyxDQUFDO0FBQUEsVUFDdE07QUFDQSxjQUFJLENBQUMsRUFBRSxpQkFBaUIsU0FBUyxTQUFT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
