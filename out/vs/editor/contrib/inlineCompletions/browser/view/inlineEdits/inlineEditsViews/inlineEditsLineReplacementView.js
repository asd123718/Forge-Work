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
import { $, n } from "../../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorunDelta, constObservable, derived } from "../../../../../../../base/common/observable.js";
import { scrollbarShadow } from "../../../../../../../platform/theme/common/colorRegistry.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { EditorMouseEvent } from "../../../../../../browser/editorDom.js";
import { LineSource, renderLines, RenderOptions } from "../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { Range } from "../../../../../../common/core/range.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { ILanguageService } from "../../../../../../common/languages/language.js";
import { LineTokens, TokenArray } from "../../../../../../common/tokens/lineTokens.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../../common/viewModel/inlineDecorations.js";
import { InlineCompletionEditorType } from "../../../model/provideInlineCompletions.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { getEditorBackgroundColor, getEditorBlendedColor, getModifiedBorderColor, getOriginalBorderColor, INLINE_EDITS_BORDER_RADIUS, modifiedChangedLineBackgroundColor, originalBackgroundColor } from "../theme.js";
import { getEditorValidOverlayRect, getPrefixTrim, mapOutFalsy, rectToProps } from "../utils/utils.js";
let InlineEditsLineReplacementView = class extends Disposable {
  constructor(_editor, _edit, _editorType, _tabAction, _languageService, _themeService) {
    super();
    this._editor = _editor;
    this._edit = _edit;
    this._editorType = _editorType;
    this._tabAction = _tabAction;
    this._languageService = _languageService;
    this._themeService = _themeService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._maxPrefixTrim = this._edit.map((e, reader) => e ? getPrefixTrim(e.replacements.flatMap((r) => [r.originalRange, r.modifiedRange]), e.originalRange, e.modifiedLines, this._editor.editor, reader) : void 0);
    this._modifiedLineElements = derived(this, (reader) => {
      const lines = [];
      let requiredWidth = 0;
      const prefixTrim = this._maxPrefixTrim.read(reader);
      const edit = this._edit.read(reader);
      if (!edit || !prefixTrim) {
        return void 0;
      }
      const maxPrefixTrim = prefixTrim.prefixTrim;
      const modifiedBubbles = rangesToBubbleRanges(edit.replacements.map((r) => r.modifiedRange)).map((r) => new Range(r.startLineNumber, r.startColumn - maxPrefixTrim, r.endLineNumber, r.endColumn - maxPrefixTrim));
      const textModel = this._editor.model.get();
      const startLineNumber = edit.modifiedRange.startLineNumber;
      for (let i = 0; i < edit.modifiedRange.length; i++) {
        const line = document.createElement("div");
        const lineNumber = startLineNumber + i;
        const modLine = edit.modifiedLines[i].slice(maxPrefixTrim);
        const t = textModel.tokenization.tokenizeLinesAt(lineNumber, [modLine])?.[0];
        let tokens;
        if (t) {
          tokens = TokenArray.fromLineTokens(t).toLineTokens(modLine, this._languageService.languageIdCodec);
        } else {
          tokens = LineTokens.createEmpty(modLine, this._languageService.languageIdCodec);
        }
        const decorations = [];
        for (const modified of modifiedBubbles.filter((b) => b.startLineNumber === lineNumber)) {
          const validatedEndColumn = Math.min(modified.endColumn, modLine.length + 1);
          decorations.push(new InlineDecoration(new Range(1, modified.startColumn, 1, validatedEndColumn), "inlineCompletions-modified-bubble", InlineDecorationType.Regular));
        }
        const result = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false).withScrollBeyondLastColumn(0), decorations, line, true);
        this._editor.getOption(EditorOption.fontInfo).read(reader);
        requiredWidth = Math.max(requiredWidth, result.minWidthInPx);
        lines.push(line);
      }
      return { lines, requiredWidth };
    });
    this._layout = derived(this, (reader) => {
      const modifiedLines = this._modifiedLineElements.read(reader);
      const maxPrefixTrim = this._maxPrefixTrim.read(reader);
      const edit = this._edit.read(reader);
      if (!modifiedLines || !maxPrefixTrim || !edit) {
        return void 0;
      }
      const { prefixLeftOffset } = maxPrefixTrim;
      const { requiredWidth } = modifiedLines;
      const originalLineHeights = this._editor.observeLineHeightsForLineRange(edit.originalRange).read(reader);
      const modifiedLineHeights = (() => {
        const lineHeights = originalLineHeights.slice(0, edit.modifiedRange.length);
        while (lineHeights.length < edit.modifiedRange.length) {
          lineHeights.push(originalLineHeights[originalLineHeights.length - 1]);
        }
        return lineHeights;
      })();
      const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
      const verticalScrollbarWidth = this._editor.layoutInfoVerticalScrollbarWidth.read(reader);
      const scrollLeft = this._editor.scrollLeft.read(reader);
      const scrollTop = this._editor.scrollTop.read(reader);
      const editorLeftOffset = contentLeft - scrollLeft;
      const textModel = this._editor.editor.getModel();
      const originalLineWidths = edit.originalRange.mapToLineArray((line) => this._editor.editor.getOffsetForColumn(line, textModel.getLineMaxColumn(line)) - prefixLeftOffset);
      const maxLineWidth = Math.max(...originalLineWidths, requiredWidth);
      const startLineNumber = edit.originalRange.startLineNumber;
      const endLineNumber = edit.originalRange.endLineNumberExclusive - 1;
      const topOfOriginalLines = this._editor.editor.getTopForLineNumber(startLineNumber) - scrollTop;
      const bottomOfOriginalLines = this._editor.editor.getBottomForLineNumber(endLineNumber) - scrollTop;
      const originalLinesOverlay = Rect.fromLeftTopWidthHeight(
        editorLeftOffset + prefixLeftOffset,
        topOfOriginalLines,
        maxLineWidth,
        bottomOfOriginalLines - topOfOriginalLines
      );
      const modifiedLinesOverlay = Rect.fromLeftTopWidthHeight(
        originalLinesOverlay.left,
        originalLinesOverlay.bottom,
        originalLinesOverlay.width,
        modifiedLineHeights.reduce((sum, h) => sum + h, 0)
      );
      const background = Rect.hull([originalLinesOverlay, modifiedLinesOverlay]);
      const lowerBackground = background.intersectVertical(new OffsetRange(originalLinesOverlay.bottom, Number.MAX_SAFE_INTEGER));
      const lowerText = new Rect(lowerBackground.left, lowerBackground.top, lowerBackground.right, lowerBackground.bottom);
      return {
        originalLinesOverlay,
        modifiedLinesOverlay,
        background,
        lowerBackground,
        lowerText,
        modifiedLineHeights,
        minContentWidthRequired: prefixLeftOffset + maxLineWidth + verticalScrollbarWidth
      };
    });
    this._viewZoneInfo = derived((reader) => {
      const shouldShowViewZone = this._editor.getOption(EditorOption.inlineSuggest).map((o) => o.edits.allowCodeShifting === "always").read(reader);
      if (!shouldShowViewZone) {
        return void 0;
      }
      const layout = this._layout.read(reader);
      const edit = this._edit.read(reader);
      if (!layout || !edit) {
        return void 0;
      }
      const viewZoneHeight = layout.lowerBackground.height;
      const viewZoneLineNumber = edit.originalRange.endLineNumberExclusive;
      return { height: viewZoneHeight, lineNumber: viewZoneLineNumber };
    });
    this.minEditorScrollHeight = derived(this, (reader) => {
      const layout = mapOutFalsy(this._layout).read(reader);
      if (!layout || this._viewZoneInfo.read(reader) !== void 0) {
        return 0;
      }
      return layout.read(reader).lowerText.bottom + this._editor.editor.getScrollTop();
    });
    this._div = n.div({
      class: "line-replacement"
    }, [
      derived(this, (reader) => {
        const layout = mapOutFalsy(this._layout).read(reader);
        const modifiedLineElements = this._modifiedLineElements.read(reader);
        if (!layout || !modifiedLineElements) {
          return [];
        }
        const layoutProps = layout.read(reader);
        const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
        const separatorWidth = this._editorType.read(reader) === InlineCompletionEditorType.DiffEditor ? 3 : 1;
        modifiedLineElements.lines.forEach((l, i) => {
          l.style.width = `${layoutProps.lowerText.width}px`;
          l.style.height = `${layoutProps.modifiedLineHeights[i]}px`;
          l.style.position = "relative";
        });
        const modifiedBorderColor = getModifiedBorderColor(this._tabAction).read(reader);
        const originalBorderColor = getOriginalBorderColor(this._tabAction).read(reader);
        const editorBackground = getEditorBackgroundColor(this._editorType.read(reader));
        return [
          n.div({
            style: {
              position: "absolute",
              ...rectToProps((r) => getEditorValidOverlayRect(this._editor).read(r)),
              overflow: "hidden",
              pointerEvents: "none"
            }
          }, [
            n.div({
              class: "borderAroundLineReplacement",
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).background.translateX(-contentLeft).withMargin(separatorWidth)),
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                border: `${separatorWidth + 1}px solid ${editorBackground}`,
                boxSizing: "border-box",
                pointerEvents: "none"
              }
            }),
            n.div({
              class: "originalOverlayLineReplacement",
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).background.translateX(-contentLeft)),
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                border: getEditorBlendedColor(originalBorderColor, this._themeService).map((c) => `1px solid ${c.toString()}`),
                pointerEvents: "none",
                boxSizing: "border-box",
                background: asCssVariable(originalBackgroundColor)
              }
            }),
            n.div({
              class: "modifiedOverlayLineReplacement",
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).lowerBackground.translateX(-contentLeft)),
                borderRadius: `0 0 ${INLINE_EDITS_BORDER_RADIUS}px ${INLINE_EDITS_BORDER_RADIUS}px`,
                background: editorBackground,
                boxShadow: `${asCssVariable(scrollbarShadow)} 0 6px 6px -6px`,
                border: `1px solid ${asCssVariable(modifiedBorderColor)}`,
                boxSizing: "border-box",
                overflow: "hidden",
                cursor: "pointer",
                pointerEvents: "auto"
              },
              onmousedown: (e) => {
                e.preventDefault();
              },
              onclick: (e) => this._onDidClick.fire(InlineEditClickEvent.create(e))
            }, [
              n.div({
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  background: asCssVariable(modifiedChangedLineBackgroundColor)
                }
              })
            ]),
            n.div({
              class: "modifiedLinesLineReplacement",
              style: {
                position: "absolute",
                boxSizing: "border-box",
                ...rectToProps((reader2) => layout.read(reader2).lowerText.translateX(-contentLeft)),
                fontFamily: this._editor.getOption(EditorOption.fontFamily),
                fontSize: this._editor.getOption(EditorOption.fontSize),
                fontWeight: this._editor.getOption(EditorOption.fontWeight),
                pointerEvents: "none",
                whiteSpace: "nowrap",
                borderRadius: `0 0 ${INLINE_EDITS_BORDER_RADIUS}px ${INLINE_EDITS_BORDER_RADIUS}px`,
                overflow: "hidden"
              }
            }, [...modifiedLineElements.lines])
          ])
        ];
      })
    ]).keepUpdated(this._store);
    this.isHovered = this._editor.isTargetHovered((e) => this._isMouseOverWidget(e), this._store);
    this._previousViewZoneInfo = void 0;
    this._register(toDisposable(() => this._editor.editor.changeViewZones((accessor) => this.removePreviousViewZone(accessor))));
    this._register(autorunDelta(this._viewZoneInfo, ({ lastValue, newValue }) => {
      if (lastValue === newValue || lastValue?.height === newValue?.height && lastValue?.lineNumber === newValue?.lineNumber) {
        return;
      }
      this._editor.editor.changeViewZones((changeAccessor) => {
        this.removePreviousViewZone(changeAccessor);
        if (!newValue) {
          return;
        }
        this.addViewZone(newValue, changeAccessor);
      });
    }));
    this._register(this._editor.createOverlayWidget({
      domNode: this._div.element,
      minContentWidthInPx: derived(this, (reader) => {
        return this._layout.read(reader)?.minContentWidthRequired ?? 0;
      }),
      position: constObservable({ preference: { top: 0, left: 0 } }),
      allowEditorOverflow: false
    }));
  }
  _isMouseOverWidget(e) {
    const layout = this._layout.get();
    if (!layout || !(e.event instanceof EditorMouseEvent)) {
      return false;
    }
    return layout.lowerBackground.containsPoint(new Point(e.event.relativePos.x, e.event.relativePos.y));
  }
  removePreviousViewZone(changeAccessor) {
    if (!this._previousViewZoneInfo) {
      return;
    }
    changeAccessor.removeZone(this._previousViewZoneInfo.id);
    const cursorLineNumber = this._editor.cursorLineNumber.get();
    if (cursorLineNumber !== null && cursorLineNumber >= this._previousViewZoneInfo.lineNumber) {
      this._editor.editor.setScrollTop(this._editor.scrollTop.get() - this._previousViewZoneInfo.height);
    }
    this._previousViewZoneInfo = void 0;
  }
  addViewZone(viewZoneInfo, changeAccessor) {
    const activeViewZone = changeAccessor.addZone({
      afterLineNumber: viewZoneInfo.lineNumber - 1,
      heightInPx: viewZoneInfo.height,
      // move computation to layout?
      domNode: $("div")
    });
    this._previousViewZoneInfo = { height: viewZoneInfo.height, lineNumber: viewZoneInfo.lineNumber, id: activeViewZone };
    const cursorLineNumber = this._editor.cursorLineNumber.get();
    if (cursorLineNumber !== null && cursorLineNumber >= viewZoneInfo.lineNumber) {
      this._editor.editor.setScrollTop(this._editor.scrollTop.get() + viewZoneInfo.height);
    }
  }
};
InlineEditsLineReplacementView = __decorateClass([
  __decorateParam(4, ILanguageService),
  __decorateParam(5, IThemeService)
], InlineEditsLineReplacementView);
function rangesToBubbleRanges(ranges) {
  const result = [];
  while (ranges.length) {
    let range = ranges.shift();
    if (range.startLineNumber !== range.endLineNumber) {
      ranges.push(new Range(range.startLineNumber + 1, 1, range.endLineNumber, range.endColumn));
      range = new Range(range.startLineNumber, range.startColumn, range.startLineNumber, Number.MAX_SAFE_INTEGER);
    }
    result.push(range);
  }
  return result;
}
export {
  InlineEditsLineReplacementView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcaW5saW5lRWRpdHNMaW5lUmVwbGFjZW1lbnRWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuRGVsdGEsIGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IHNjcm9sbGJhclNoYWRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yTW91c2VFdmVudCwgSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRG9tLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBMaW5lU291cmNlLCByZW5kZXJMaW5lcywgUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvY29tcG9uZW50cy9kaWZmRWRpdG9yVmlld1pvbmVzL3JlbmRlckxpbmVzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb2ludCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3BvaW50LmpzJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9yZWN0LmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBMaW5lVG9rZW5zLCBUb2tlbkFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb24sIElubGluZURlY29yYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZSB9IGZyb20gJy4uLy4uLy4uL21vZGVsL3Byb3ZpZGVJbmxpbmVDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5saW5lRWRpdHNWaWV3LCBJbmxpbmVFZGl0Q2xpY2tFdmVudCwgSW5saW5lRWRpdFRhYkFjdGlvbiB9IGZyb20gJy4uL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IsIGdldEVkaXRvckJsZW5kZWRDb2xvciwgZ2V0TW9kaWZpZWRCb3JkZXJDb2xvciwgZ2V0T3JpZ2luYWxCb3JkZXJDb2xvciwgSU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVMsIG1vZGlmaWVkQ2hhbmdlZExpbmVCYWNrZ3JvdW5kQ29sb3IsIG9yaWdpbmFsQmFja2dyb3VuZENvbG9yIH0gZnJvbSAnLi4vdGhlbWUuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yVmFsaWRPdmVybGF5UmVjdCwgZ2V0UHJlZml4VHJpbSwgbWFwT3V0RmFsc3ksIHJlY3RUb1Byb3BzIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lRWRpdHNMaW5lUmVwbGFjZW1lbnRWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElJbmxpbmVFZGl0c1ZpZXcge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbmxpbmVFZGl0Q2xpY2tFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2sgPSB0aGlzLl9vbkRpZENsaWNrLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21heFByZWZpeFRyaW07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRMaW5lRWxlbWVudHM7XG5cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlld1pvbmVJbmZvO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpdjtcblxuXHRyZWFkb25seSBpc0hvdmVyZWQ7XG5cblx0cmVhZG9ubHkgbWluRWRpdG9yU2Nyb2xsSGVpZ2h0O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogT2JzZXJ2YWJsZUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdDogSU9ic2VydmFibGU8e1xuXHRcdFx0b3JpZ2luYWxSYW5nZTogTGluZVJhbmdlO1xuXHRcdFx0bW9kaWZpZWRSYW5nZTogTGluZVJhbmdlO1xuXHRcdFx0bW9kaWZpZWRMaW5lczogc3RyaW5nW107XG5cdFx0XHRyZXBsYWNlbWVudHM6IFJlcGxhY2VtZW50W107XG5cdFx0fSB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yVHlwZTogSU9ic2VydmFibGU8SW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGU+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhYkFjdGlvbjogSU9ic2VydmFibGU8SW5saW5lRWRpdFRhYkFjdGlvbj4sXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tYXhQcmVmaXhUcmltID0gdGhpcy5fZWRpdC5tYXAoKGUsIHJlYWRlcikgPT4gZSA/IGdldFByZWZpeFRyaW0oZS5yZXBsYWNlbWVudHMuZmxhdE1hcChyID0+IFtyLm9yaWdpbmFsUmFuZ2UsIHIubW9kaWZpZWRSYW5nZV0pLCBlLm9yaWdpbmFsUmFuZ2UsIGUubW9kaWZpZWRMaW5lcywgdGhpcy5fZWRpdG9yLmVkaXRvciwgcmVhZGVyKSA6IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbW9kaWZpZWRMaW5lRWxlbWVudHMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBsaW5lcyA9IFtdO1xuXHRcdFx0bGV0IHJlcXVpcmVkV2lkdGggPSAwO1xuXG5cdFx0XHRjb25zdCBwcmVmaXhUcmltID0gdGhpcy5fbWF4UHJlZml4VHJpbS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBlZGl0ID0gdGhpcy5fZWRpdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWVkaXQgfHwgIXByZWZpeFRyaW0pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF4UHJlZml4VHJpbSA9IHByZWZpeFRyaW0ucHJlZml4VHJpbTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkQnViYmxlcyA9IHJhbmdlc1RvQnViYmxlUmFuZ2VzKGVkaXQucmVwbGFjZW1lbnRzLm1hcChyID0+IHIubW9kaWZpZWRSYW5nZSkpLm1hcChyID0+IG5ldyBSYW5nZShyLnN0YXJ0TGluZU51bWJlciwgci5zdGFydENvbHVtbiAtIG1heFByZWZpeFRyaW0sIHIuZW5kTGluZU51bWJlciwgci5lbmRDb2x1bW4gLSBtYXhQcmVmaXhUcmltKSk7XG5cblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5tb2RlbC5nZXQoKSE7XG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBlZGl0Lm1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlZGl0Lm1vZGlmaWVkUmFuZ2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyICsgaTtcblx0XHRcdFx0Y29uc3QgbW9kTGluZSA9IGVkaXQubW9kaWZpZWRMaW5lc1tpXS5zbGljZShtYXhQcmVmaXhUcmltKTtcblxuXHRcdFx0XHRjb25zdCB0ID0gdGV4dE1vZGVsLnRva2VuaXphdGlvbi50b2tlbml6ZUxpbmVzQXQobGluZU51bWJlciwgW21vZExpbmVdKT8uWzBdO1xuXHRcdFx0XHRsZXQgdG9rZW5zOiBMaW5lVG9rZW5zO1xuXHRcdFx0XHRpZiAodCkge1xuXHRcdFx0XHRcdHRva2VucyA9IFRva2VuQXJyYXkuZnJvbUxpbmVUb2tlbnModCkudG9MaW5lVG9rZW5zKG1vZExpbmUsIHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRva2VucyA9IExpbmVUb2tlbnMuY3JlYXRlRW1wdHkobW9kTGluZSwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1vZGlmaWVkIG9mIG1vZGlmaWVkQnViYmxlcy5maWx0ZXIoYiA9PiBiLnN0YXJ0TGluZU51bWJlciA9PT0gbGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRjb25zdCB2YWxpZGF0ZWRFbmRDb2x1bW4gPSBNYXRoLm1pbihtb2RpZmllZC5lbmRDb2x1bW4sIG1vZExpbmUubGVuZ3RoICsgMSk7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvbnMucHVzaChuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgbW9kaWZpZWQuc3RhcnRDb2x1bW4sIDEsIHZhbGlkYXRlZEVuZENvbHVtbiksICdpbmxpbmVDb21wbGV0aW9ucy1tb2RpZmllZC1idWJibGUnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUT0RPOiBBbGwgbGluZXMgc2hvdWxkIGJlIHJlbmRlcmVkIGF0IG9uY2UgZm9yIG9uZSBkb20gZWxlbWVudFxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZW5kZXJMaW5lcyhuZXcgTGluZVNvdXJjZShbdG9rZW5zXSksIFJlbmRlck9wdGlvbnMuZnJvbUVkaXRvcih0aGlzLl9lZGl0b3IuZWRpdG9yKS53aXRoU2V0V2lkdGgoZmFsc2UpLndpdGhTY3JvbGxCZXlvbmRMYXN0Q29sdW1uKDApLCBkZWNvcmF0aW9ucywgbGluZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS5yZWFkKHJlYWRlcik7IC8vIHVwZGF0ZSB3aGVuIGZvbnQgaW5mbyBjaGFuZ2VzXG5cblx0XHRcdFx0cmVxdWlyZWRXaWR0aCA9IE1hdGgubWF4KHJlcXVpcmVkV2lkdGgsIHJlc3VsdC5taW5XaWR0aEluUHgpO1xuXG5cdFx0XHRcdGxpbmVzLnB1c2gobGluZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGxpbmVzLCByZXF1aXJlZFdpZHRoOiByZXF1aXJlZFdpZHRoIH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fbGF5b3V0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRMaW5lcyA9IHRoaXMuX21vZGlmaWVkTGluZUVsZW1lbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1heFByZWZpeFRyaW0gPSB0aGlzLl9tYXhQcmVmaXhUcmltLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVkaXQgPSB0aGlzLl9lZGl0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbW9kaWZpZWRMaW5lcyB8fCAhbWF4UHJlZml4VHJpbSB8fCAhZWRpdCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IHByZWZpeExlZnRPZmZzZXQgfSA9IG1heFByZWZpeFRyaW07XG5cdFx0XHRjb25zdCB7IHJlcXVpcmVkV2lkdGggfSA9IG1vZGlmaWVkTGluZXM7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsTGluZUhlaWdodHMgPSB0aGlzLl9lZGl0b3Iub2JzZXJ2ZUxpbmVIZWlnaHRzRm9yTGluZVJhbmdlKGVkaXQub3JpZ2luYWxSYW5nZSkucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRMaW5lSGVpZ2h0cyA9ICgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpbmVIZWlnaHRzID0gb3JpZ2luYWxMaW5lSGVpZ2h0cy5zbGljZSgwLCBlZGl0Lm1vZGlmaWVkUmFuZ2UubGVuZ3RoKTtcblx0XHRcdFx0d2hpbGUgKGxpbmVIZWlnaHRzLmxlbmd0aCA8IGVkaXQubW9kaWZpZWRSYW5nZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRsaW5lSGVpZ2h0cy5wdXNoKG9yaWdpbmFsTGluZUhlaWdodHNbb3JpZ2luYWxMaW5lSGVpZ2h0cy5sZW5ndGggLSAxXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGxpbmVIZWlnaHRzO1xuXHRcdFx0fSkoKTtcblxuXHRcdFx0Y29uc3QgY29udGVudExlZnQgPSB0aGlzLl9lZGl0b3IubGF5b3V0SW5mb0NvbnRlbnRMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggPSB0aGlzLl9lZGl0b3IubGF5b3V0SW5mb1ZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsTGVmdCA9IHRoaXMuX2VkaXRvci5zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuX2VkaXRvci5zY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdG9yTGVmdE9mZnNldCA9IGNvbnRlbnRMZWZ0IC0gc2Nyb2xsTGVmdDtcblxuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yLmVkaXRvci5nZXRNb2RlbCgpITtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxMaW5lV2lkdGhzID0gZWRpdC5vcmlnaW5hbFJhbmdlLm1hcFRvTGluZUFycmF5KGxpbmUgPT4gdGhpcy5fZWRpdG9yLmVkaXRvci5nZXRPZmZzZXRGb3JDb2x1bW4obGluZSwgdGV4dE1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZSkpIC0gcHJlZml4TGVmdE9mZnNldCk7XG5cdFx0XHRjb25zdCBtYXhMaW5lV2lkdGggPSBNYXRoLm1heCguLi5vcmlnaW5hbExpbmVXaWR0aHMsIHJlcXVpcmVkV2lkdGgpO1xuXG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBlZGl0Lm9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IGVkaXQub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMTtcblx0XHRcdGNvbnN0IHRvcE9mT3JpZ2luYWxMaW5lcyA9IHRoaXMuX2VkaXRvci5lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihzdGFydExpbmVOdW1iZXIpIC0gc2Nyb2xsVG9wO1xuXHRcdFx0Y29uc3QgYm90dG9tT2ZPcmlnaW5hbExpbmVzID0gdGhpcy5fZWRpdG9yLmVkaXRvci5nZXRCb3R0b21Gb3JMaW5lTnVtYmVyKGVuZExpbmVOdW1iZXIpIC0gc2Nyb2xsVG9wO1xuXG5cdFx0XHQvLyBCb3ggV2lkZ2V0IHBvc2l0aW9uaW5nXG5cdFx0XHRjb25zdCBvcmlnaW5hbExpbmVzT3ZlcmxheSA9IFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChcblx0XHRcdFx0ZWRpdG9yTGVmdE9mZnNldCArIHByZWZpeExlZnRPZmZzZXQsXG5cdFx0XHRcdHRvcE9mT3JpZ2luYWxMaW5lcyxcblx0XHRcdFx0bWF4TGluZVdpZHRoLFxuXHRcdFx0XHRib3R0b21PZk9yaWdpbmFsTGluZXMgLSB0b3BPZk9yaWdpbmFsTGluZXNcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBtb2RpZmllZExpbmVzT3ZlcmxheSA9IFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChcblx0XHRcdFx0b3JpZ2luYWxMaW5lc092ZXJsYXkubGVmdCxcblx0XHRcdFx0b3JpZ2luYWxMaW5lc092ZXJsYXkuYm90dG9tLFxuXHRcdFx0XHRvcmlnaW5hbExpbmVzT3ZlcmxheS53aWR0aCxcblx0XHRcdFx0bW9kaWZpZWRMaW5lSGVpZ2h0cy5yZWR1Y2UoKHN1bSwgaCkgPT4gc3VtICsgaCwgMClcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBiYWNrZ3JvdW5kID0gUmVjdC5odWxsKFtvcmlnaW5hbExpbmVzT3ZlcmxheSwgbW9kaWZpZWRMaW5lc092ZXJsYXldKTtcblxuXHRcdFx0Y29uc3QgbG93ZXJCYWNrZ3JvdW5kID0gYmFja2dyb3VuZC5pbnRlcnNlY3RWZXJ0aWNhbChuZXcgT2Zmc2V0UmFuZ2Uob3JpZ2luYWxMaW5lc092ZXJsYXkuYm90dG9tLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikpO1xuXHRcdFx0Y29uc3QgbG93ZXJUZXh0ID0gbmV3IFJlY3QobG93ZXJCYWNrZ3JvdW5kLmxlZnQsIGxvd2VyQmFja2dyb3VuZC50b3AsIGxvd2VyQmFja2dyb3VuZC5yaWdodCwgbG93ZXJCYWNrZ3JvdW5kLmJvdHRvbSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG9yaWdpbmFsTGluZXNPdmVybGF5LFxuXHRcdFx0XHRtb2RpZmllZExpbmVzT3ZlcmxheSxcblx0XHRcdFx0YmFja2dyb3VuZCxcblx0XHRcdFx0bG93ZXJCYWNrZ3JvdW5kLFxuXHRcdFx0XHRsb3dlclRleHQsXG5cdFx0XHRcdG1vZGlmaWVkTGluZUhlaWdodHMsXG5cdFx0XHRcdG1pbkNvbnRlbnRXaWR0aFJlcXVpcmVkOiBwcmVmaXhMZWZ0T2Zmc2V0ICsgbWF4TGluZVdpZHRoICsgdmVydGljYWxTY3JvbGxiYXJXaWR0aCxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fdmlld1pvbmVJbmZvID0gZGVyaXZlZDx7IGhlaWdodDogbnVtYmVyOyBsaW5lTnVtYmVyOiBudW1iZXIgfSB8IHVuZGVmaW5lZD4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZFNob3dWaWV3Wm9uZSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QpLm1hcChvID0+IG8uZWRpdHMuYWxsb3dDb2RlU2hpZnRpbmcgPT09ICdhbHdheXMnKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXNob3VsZFNob3dWaWV3Wm9uZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLl9sYXlvdXQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2VkaXQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFsYXlvdXQgfHwgIWVkaXQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgdmlld1pvbmVIZWlnaHQgPSBsYXlvdXQubG93ZXJCYWNrZ3JvdW5kLmhlaWdodDtcblx0XHRcdGNvbnN0IHZpZXdab25lTGluZU51bWJlciA9IGVkaXQub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXHRcdFx0cmV0dXJuIHsgaGVpZ2h0OiB2aWV3Wm9uZUhlaWdodCwgbGluZU51bWJlcjogdmlld1pvbmVMaW5lTnVtYmVyIH07XG5cdFx0fSk7XG5cdFx0dGhpcy5taW5FZGl0b3JTY3JvbGxIZWlnaHQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBsYXlvdXQgPSBtYXBPdXRGYWxzeSh0aGlzLl9sYXlvdXQpLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGF5b3V0IHx8IHRoaXMuX3ZpZXdab25lSW5mby5yZWFkKHJlYWRlcikgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsYXlvdXQucmVhZChyZWFkZXIpLmxvd2VyVGV4dC5ib3R0b20gKyB0aGlzLl9lZGl0b3IuZWRpdG9yLmdldFNjcm9sbFRvcCgpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2RpdiA9IG4uZGl2KHtcblx0XHRcdGNsYXNzOiAnbGluZS1yZXBsYWNlbWVudCcsXG5cdFx0fSwgW1xuXHRcdFx0ZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBsYXlvdXQgPSBtYXBPdXRGYWxzeSh0aGlzLl9sYXlvdXQpLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRMaW5lRWxlbWVudHMgPSB0aGlzLl9tb2RpZmllZExpbmVFbGVtZW50cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghbGF5b3V0IHx8ICFtb2RpZmllZExpbmVFbGVtZW50cykge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxheW91dFByb3BzID0gbGF5b3V0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgY29udGVudExlZnQgPSB0aGlzLl9lZGl0b3IubGF5b3V0SW5mb0NvbnRlbnRMZWZ0LnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHRjb25zdCBzZXBhcmF0b3JXaWR0aCA9IHRoaXMuX2VkaXRvclR5cGUucmVhZChyZWFkZXIpID09PSBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5EaWZmRWRpdG9yID8gMyA6IDE7XG5cblx0XHRcdFx0bW9kaWZpZWRMaW5lRWxlbWVudHMubGluZXMuZm9yRWFjaCgobCwgaSkgPT4ge1xuXHRcdFx0XHRcdGwuc3R5bGUud2lkdGggPSBgJHtsYXlvdXRQcm9wcy5sb3dlclRleHQud2lkdGh9cHhgO1xuXHRcdFx0XHRcdGwuc3R5bGUuaGVpZ2h0ID0gYCR7bGF5b3V0UHJvcHMubW9kaWZpZWRMaW5lSGVpZ2h0c1tpXX1weGA7XG5cdFx0XHRcdFx0bC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkQm9yZGVyQ29sb3IgPSBnZXRNb2RpZmllZEJvcmRlckNvbG9yKHRoaXMuX3RhYkFjdGlvbikucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbEJvcmRlckNvbG9yID0gZ2V0T3JpZ2luYWxCb3JkZXJDb2xvcih0aGlzLl90YWJBY3Rpb24pLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yQmFja2dyb3VuZCA9IGdldEVkaXRvckJhY2tncm91bmRDb2xvcih0aGlzLl9lZGl0b3JUeXBlLnJlYWQocmVhZGVyKSk7XG5cblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0Li4ucmVjdFRvUHJvcHMoKHIpID0+IGdldEVkaXRvclZhbGlkT3ZlcmxheVJlY3QodGhpcy5fZWRpdG9yKS5yZWFkKHIpKSxcblx0XHRcdFx0XHRcdFx0b3ZlcmZsb3c6ICdoaWRkZW4nLFxuXHRcdFx0XHRcdFx0XHRwb2ludGVyRXZlbnRzOiAnbm9uZScsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgW1xuXHRcdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0XHRjbGFzczogJ2JvcmRlckFyb3VuZExpbmVSZXBsYWNlbWVudCcsXG5cdFx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikuYmFja2dyb3VuZC50cmFuc2xhdGVYKC1jb250ZW50TGVmdCkud2l0aE1hcmdpbihzZXBhcmF0b3JXaWR0aCkpLFxuXHRcdFx0XHRcdFx0XHRcdGJvcmRlclJhZGl1czogYCR7SU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVN9cHhgLFxuXG5cdFx0XHRcdFx0XHRcdFx0Ym9yZGVyOiBgJHtzZXBhcmF0b3JXaWR0aCArIDF9cHggc29saWQgJHtlZGl0b3JCYWNrZ3JvdW5kfWAsXG5cdFx0XHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0Y2xhc3M6ICdvcmlnaW5hbE92ZXJsYXlMaW5lUmVwbGFjZW1lbnQnLFxuXHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHRcdC4uLnJlY3RUb1Byb3BzKHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLmJhY2tncm91bmQudHJhbnNsYXRlWCgtY29udGVudExlZnQpKSxcblx0XHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblxuXHRcdFx0XHRcdFx0XHRcdGJvcmRlcjogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKG9yaWdpbmFsQm9yZGVyQ29sb3IsIHRoaXMuX3RoZW1lU2VydmljZSkubWFwKGMgPT4gYDFweCBzb2xpZCAke2MudG9TdHJpbmcoKX1gKSxcblx0XHRcdFx0XHRcdFx0XHRwb2ludGVyRXZlbnRzOiAnbm9uZScsXG5cdFx0XHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRcdFx0YmFja2dyb3VuZDogYXNDc3NWYXJpYWJsZShvcmlnaW5hbEJhY2tncm91bmRDb2xvciksXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0XHRjbGFzczogJ21vZGlmaWVkT3ZlcmxheUxpbmVSZXBsYWNlbWVudCcsXG5cdFx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikubG93ZXJCYWNrZ3JvdW5kLnRyYW5zbGF0ZVgoLWNvbnRlbnRMZWZ0KSksXG5cdFx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgMCAwICR7SU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVN9cHggJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdFx0XHRcdFx0YmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHRcdFx0XHRib3hTaGFkb3c6IGAke2FzQ3NzVmFyaWFibGUoc2Nyb2xsYmFyU2hhZG93KX0gMCA2cHggNnB4IC02cHhgLFxuXHRcdFx0XHRcdFx0XHRcdGJvcmRlcjogYDFweCBzb2xpZCAke2FzQ3NzVmFyaWFibGUobW9kaWZpZWRCb3JkZXJDb2xvcil9YCxcblx0XHRcdFx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRcdFx0XHRvdmVyZmxvdzogJ2hpZGRlbicsXG5cdFx0XHRcdFx0XHRcdFx0Y3Vyc29yOiAncG9pbnRlcicsXG5cdFx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ2F1dG8nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvbm1vdXNlZG93bjogZSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpOyAvLyBUaGlzIHByZXZlbnRzIHRoYXQgdGhlIGVkaXRvciBsb3NlcyBmb2N1c1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvbmNsaWNrOiAoZSkgPT4gdGhpcy5fb25EaWRDbGljay5maXJlKElubGluZUVkaXRDbGlja0V2ZW50LmNyZWF0ZShlKSksXG5cdFx0XHRcdFx0XHR9LCBbXG5cdFx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogMCwgbGVmdDogMCwgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnMTAwJScsXG5cdFx0XHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKG1vZGlmaWVkQ2hhbmdlZExpbmVCYWNrZ3JvdW5kQ29sb3IpLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0Y2xhc3M6ICdtb2RpZmllZExpbmVzTGluZVJlcGxhY2VtZW50Jyxcblx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5sb3dlclRleHQudHJhbnNsYXRlWCgtY29udGVudExlZnQpKSxcblx0XHRcdFx0XHRcdFx0XHRmb250RmFtaWx5OiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250RmFtaWx5KSxcblx0XHRcdFx0XHRcdFx0XHRmb250U2l6ZTogdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udFNpemUpLFxuXHRcdFx0XHRcdFx0XHRcdGZvbnRXZWlnaHQ6IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRXZWlnaHQpLFxuXHRcdFx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0XHRcdFx0XHR3aGl0ZVNwYWNlOiAnbm93cmFwJyxcblx0XHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAwIDAgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weCAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0XHRcdFx0XHRvdmVyZmxvdzogJ2hpZGRlbicsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sIFsuLi5tb2RpZmllZExpbmVFbGVtZW50cy5saW5lc10pLFxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdF07XG5cdFx0XHR9KVxuXHRcdF0pLmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLmlzSG92ZXJlZCA9IHRoaXMuX2VkaXRvci5pc1RhcmdldEhvdmVyZWQoKGUpID0+IHRoaXMuX2lzTW91c2VPdmVyV2lkZ2V0KGUpLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fcHJldmlvdXNWaWV3Wm9uZUluZm8gPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZWRpdG9yLmVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4gdGhpcy5yZW1vdmVQcmV2aW91c1ZpZXdab25lKGFjY2Vzc29yKSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5EZWx0YSh0aGlzLl92aWV3Wm9uZUluZm8sICh7IGxhc3RWYWx1ZSwgbmV3VmFsdWUgfSkgPT4ge1xuXHRcdFx0aWYgKGxhc3RWYWx1ZSA9PT0gbmV3VmFsdWUgfHwgKGxhc3RWYWx1ZT8uaGVpZ2h0ID09PSBuZXdWYWx1ZT8uaGVpZ2h0ICYmIGxhc3RWYWx1ZT8ubGluZU51bWJlciA9PT0gbmV3VmFsdWU/LmxpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2VkaXRvci5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHR0aGlzLnJlbW92ZVByZXZpb3VzVmlld1pvbmUoY2hhbmdlQWNjZXNzb3IpO1xuXHRcdFx0XHRpZiAoIW5ld1ZhbHVlKSB7IHJldHVybjsgfVxuXHRcdFx0XHR0aGlzLmFkZFZpZXdab25lKG5ld1ZhbHVlLCBjaGFuZ2VBY2Nlc3Nvcik7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3IuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRkb21Ob2RlOiB0aGlzLl9kaXYuZWxlbWVudCxcblx0XHRcdG1pbkNvbnRlbnRXaWR0aEluUHg6IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2xheW91dC5yZWFkKHJlYWRlcik/Lm1pbkNvbnRlbnRXaWR0aFJlcXVpcmVkID8/IDA7XG5cdFx0XHR9KSxcblx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGUoeyBwcmVmZXJlbmNlOiB7IHRvcDogMCwgbGVmdDogMCB9IH0pLFxuXHRcdFx0YWxsb3dFZGl0b3JPdmVyZmxvdzogZmFsc2UsXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNNb3VzZU92ZXJXaWRnZXQoZTogSUVkaXRvck1vdXNlRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLl9sYXlvdXQuZ2V0KCk7XG5cdFx0aWYgKCFsYXlvdXQgfHwgIShlLmV2ZW50IGluc3RhbmNlb2YgRWRpdG9yTW91c2VFdmVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGF5b3V0Lmxvd2VyQmFja2dyb3VuZC5jb250YWluc1BvaW50KG5ldyBQb2ludChlLmV2ZW50LnJlbGF0aXZlUG9zLngsIGUuZXZlbnQucmVsYXRpdmVQb3MueSkpO1xuXHR9XG5cblx0Ly8gVmlldyBab25lc1xuXHRwcml2YXRlIF9wcmV2aW91c1ZpZXdab25lSW5mbzogeyBoZWlnaHQ6IG51bWJlcjsgbGluZU51bWJlcjogbnVtYmVyOyBpZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZW1vdmVQcmV2aW91c1ZpZXdab25lKGNoYW5nZUFjY2Vzc29yOiBJVmlld1pvbmVDaGFuZ2VBY2Nlc3Nvcikge1xuXHRcdGlmICghdGhpcy5fcHJldmlvdXNWaWV3Wm9uZUluZm8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjaGFuZ2VBY2Nlc3Nvci5yZW1vdmVab25lKHRoaXMuX3ByZXZpb3VzVmlld1pvbmVJbmZvLmlkKTtcblxuXHRcdGNvbnN0IGN1cnNvckxpbmVOdW1iZXIgPSB0aGlzLl9lZGl0b3IuY3Vyc29yTGluZU51bWJlci5nZXQoKTtcblx0XHRpZiAoY3Vyc29yTGluZU51bWJlciAhPT0gbnVsbCAmJiBjdXJzb3JMaW5lTnVtYmVyID49IHRoaXMuX3ByZXZpb3VzVmlld1pvbmVJbmZvLmxpbmVOdW1iZXIpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5lZGl0b3Iuc2V0U2Nyb2xsVG9wKHRoaXMuX2VkaXRvci5zY3JvbGxUb3AuZ2V0KCkgLSB0aGlzLl9wcmV2aW91c1ZpZXdab25lSW5mby5oZWlnaHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ByZXZpb3VzVmlld1pvbmVJbmZvID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRWaWV3Wm9uZSh2aWV3Wm9uZUluZm86IHsgaGVpZ2h0OiBudW1iZXI7IGxpbmVOdW1iZXI6IG51bWJlciB9LCBjaGFuZ2VBY2Nlc3NvcjogSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IpIHtcblx0XHRjb25zdCBhY3RpdmVWaWV3Wm9uZSA9IGNoYW5nZUFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiB2aWV3Wm9uZUluZm8ubGluZU51bWJlciAtIDEsXG5cdFx0XHRoZWlnaHRJblB4OiB2aWV3Wm9uZUluZm8uaGVpZ2h0LCAvLyBtb3ZlIGNvbXB1dGF0aW9uIHRvIGxheW91dD9cblx0XHRcdGRvbU5vZGU6ICQoJ2RpdicpLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcHJldmlvdXNWaWV3Wm9uZUluZm8gPSB7IGhlaWdodDogdmlld1pvbmVJbmZvLmhlaWdodCwgbGluZU51bWJlcjogdmlld1pvbmVJbmZvLmxpbmVOdW1iZXIsIGlkOiBhY3RpdmVWaWV3Wm9uZSB9O1xuXG5cdFx0Y29uc3QgY3Vyc29yTGluZU51bWJlciA9IHRoaXMuX2VkaXRvci5jdXJzb3JMaW5lTnVtYmVyLmdldCgpO1xuXHRcdGlmIChjdXJzb3JMaW5lTnVtYmVyICE9PSBudWxsICYmIGN1cnNvckxpbmVOdW1iZXIgPj0gdmlld1pvbmVJbmZvLmxpbmVOdW1iZXIpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5lZGl0b3Iuc2V0U2Nyb2xsVG9wKHRoaXMuX2VkaXRvci5zY3JvbGxUb3AuZ2V0KCkgKyB2aWV3Wm9uZUluZm8uaGVpZ2h0KTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gcmFuZ2VzVG9CdWJibGVSYW5nZXMocmFuZ2VzOiBSYW5nZVtdKTogUmFuZ2VbXSB7XG5cdGNvbnN0IHJlc3VsdDogUmFuZ2VbXSA9IFtdO1xuXHR3aGlsZSAocmFuZ2VzLmxlbmd0aCkge1xuXHRcdGxldCByYW5nZSA9IHJhbmdlcy5zaGlmdCgpITtcblx0XHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyYW5nZXMucHVzaChuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgMSwgMSwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKSk7XG5cdFx0XHRyYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKTsgLy8gVE9ETzogdGhpcyBpcyBub3QgY29ycmVjdFxuXHRcdH1cblxuXHRcdHJlc3VsdC5wdXNoKHJhbmdlKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xuXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVwbGFjZW1lbnQge1xuXHRvcmlnaW5hbFJhbmdlOiBSYW5nZTtcblx0bW9kaWZpZWRSYW5nZTogUmFuZ2U7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsY0FBYyxpQkFBaUIsZUFBNEI7QUFDcEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxZQUFZLGFBQWEscUJBQXFCO0FBQ3ZELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVk7QUFDckIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsWUFBWSxrQkFBa0I7QUFDdkMsU0FBUyxrQkFBa0IsNEJBQTRCO0FBQ3ZELFNBQVMsa0NBQWtDO0FBQzNDLFNBQTJCLDRCQUFpRDtBQUM1RSxTQUFTLDBCQUEwQix1QkFBdUIsd0JBQXdCLHdC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
