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
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { constObservable, derived, observableValue } from "../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { LineSource, renderLines, RenderOptions } from "../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { Position } from "../../../../../../common/core/position.js";
import { Range } from "../../../../../../common/core/range.js";
import { LineRange } from "../../../../../../common/core/ranges/lineRange.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { ILanguageService } from "../../../../../../common/languages/language.js";
import { LineTokens, TokenArray } from "../../../../../../common/tokens/lineTokens.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../../common/viewModel/inlineDecorations.js";
import { GhostText, GhostTextPart } from "../../../model/ghostText.js";
import { InlineCompletionEditorType } from "../../../model/provideInlineCompletions.js";
import { GhostTextView } from "../../ghostText/ghostTextView.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { getEditorBackgroundColor, getModifiedBorderColor, INLINE_EDITS_BORDER_RADIUS, modifiedBackgroundColor } from "../theme.js";
import { getPrefixTrim, mapOutFalsy } from "../utils/utils.js";
const BORDER_WIDTH = 1;
const WIDGET_SEPARATOR_WIDTH = 1;
const WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH = 3;
const BORDER_RADIUS = INLINE_EDITS_BORDER_RADIUS;
let InlineEditsInsertionView = class extends Disposable {
  constructor(_editor, _input, _tabAction, instantiationService, _languageService) {
    super();
    this._editor = _editor;
    this._input = _input;
    this._tabAction = _tabAction;
    this._languageService = _languageService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._state = derived(this, (reader) => {
      const state = this._input.read(reader);
      if (!state) {
        return void 0;
      }
      const textModel = this._editor.getModel();
      const eol = textModel.getEOL();
      if (state.startColumn === 1 && state.lineNumber > 1 && textModel.getLineLength(state.lineNumber) !== 0 && state.text.endsWith(eol) && !state.text.startsWith(eol)) {
        const endOfLineColumn = textModel.getLineLength(state.lineNumber - 1) + 1;
        return { lineNumber: state.lineNumber - 1, column: endOfLineColumn, text: eol + state.text.slice(0, -eol.length) };
      }
      return { lineNumber: state.lineNumber, column: state.startColumn, text: state.text };
    });
    this._trimVertically = derived(this, (reader) => {
      const state = this._state.read(reader);
      if (!state) {
        return { topOffset: 0, contentHeight: 0, linesTop: 0, linesBottom: 0 };
      }
      const text = state.text;
      const lineHeight = this._editor.getLineHeightForPosition(new Position(state.lineNumber, 1));
      const eol = this._editor.getModel().getEOL();
      const lineCount = text.split(eol).length;
      let linesTop = 0;
      let linesBottom = 0;
      if (text.trim() !== "") {
        let i = 0;
        for (; i < text.length && text.startsWith(eol, i); i += eol.length) {
          linesTop += 1;
        }
        for (let j = text.length; j > i && text.endsWith(eol, j); j -= eol.length) {
          linesBottom += 1;
        }
      }
      return {
        topOffset: linesTop * lineHeight,
        contentHeight: (lineCount - linesTop - linesBottom) * lineHeight,
        linesTop,
        linesBottom
      };
    });
    this._maxPrefixTrim = derived(this, (reader) => {
      const state = this._state.read(reader);
      if (!state) {
        return { prefixLeftOffset: 0, prefixTrim: 0 };
      }
      const textModel = this._editor.getModel();
      const eol = textModel.getEOL();
      const trimVertically = this._trimVertically.read(reader);
      const lines = state.text.split(eol);
      const modifiedLines = lines.slice(trimVertically.linesTop, lines.length - trimVertically.linesBottom);
      if (trimVertically.linesTop === 0) {
        modifiedLines[0] = textModel.getLineContent(state.lineNumber) + modifiedLines[0];
      }
      const originalRange = new LineRange(state.lineNumber, state.lineNumber + (trimVertically.linesTop > 0 ? 0 : 1));
      return getPrefixTrim([], originalRange, modifiedLines, this._editor);
    });
    this._ghostText = derived((reader) => {
      const state = this._state.read(reader);
      const prefixTrim = this._maxPrefixTrim.read(reader);
      if (!state) {
        return void 0;
      }
      const textModel = this._editor.getModel();
      const eol = textModel.getEOL();
      const modifiedLines = state.text.split(eol);
      const inlineDecorations = modifiedLines.map((line, i) => new InlineDecoration(
        new Range(i + 1, i === 0 ? 1 : prefixTrim.prefixTrim + 1, i + 1, line.length + 1),
        "modified-background",
        InlineDecorationType.Regular
      ));
      return new GhostText(state.lineNumber, [new GhostTextPart(state.column, state.text, false, inlineDecorations)]);
    });
    this._display = derived(this, (reader) => !!this._state.read(reader) ? "block" : "none");
    this._editorMaxContentWidthInRange = derived(this, (reader) => {
      const state = this._state.read(reader);
      if (!state) {
        return 0;
      }
      this._editorObs.versionId.read(reader);
      const textModel = this._editor.getModel();
      const eol = textModel.getEOL();
      const textBeforeInsertion = state.text.startsWith(eol) ? "" : textModel.getValueInRange(new Range(state.lineNumber, 1, state.lineNumber, state.column));
      const textAfterInsertion = textModel.getValueInRange(new Range(state.lineNumber, state.column, state.lineNumber, textModel.getLineLength(state.lineNumber) + 1));
      const text = textBeforeInsertion + state.text + textAfterInsertion;
      const lines = text.split(eol);
      const renderOptions = RenderOptions.fromEditor(this._editor).withSetWidth(false).withScrollBeyondLastColumn(0);
      const lineWidths = lines.map((line) => {
        const t = textModel.tokenization.tokenizeLinesAt(state.lineNumber, [line])?.[0];
        let tokens;
        if (t) {
          tokens = TokenArray.fromLineTokens(t).toLineTokens(line, this._languageService.languageIdCodec);
        } else {
          tokens = LineTokens.createEmpty(line, this._languageService.languageIdCodec);
        }
        return renderLines(new LineSource([tokens]), renderOptions, [], $("div"), true).minWidthInPx;
      });
      return Math.max(...lineWidths);
    });
    this.startLineOffset = this._trimVertically.map((v) => v.topOffset);
    this.originalLines = this._state.map(
      (s) => s ? new LineRange(
        s.lineNumber,
        Math.min(s.lineNumber + 2, this._editor.getModel().getLineCount() + 1)
      ) : void 0
    );
    this._overlayLayout = derived(this, (reader) => {
      this._ghostText.read(reader);
      const state = this._state.read(reader);
      if (!state) {
        return null;
      }
      this._editorObs.observePosition(observableValue(this, new Position(state.lineNumber, state.column)), reader.store).read(reader);
      const editorLayout = this._editorObs.layoutInfo.read(reader);
      const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);
      const verticalScrollbarWidth = this._editorObs.layoutInfoVerticalScrollbarWidth.read(reader);
      const right = editorLayout.contentLeft + this._editorMaxContentWidthInRange.read(reader) - horizontalScrollOffset;
      const prefixLeftOffset = this._maxPrefixTrim.read(reader).prefixLeftOffset ?? 0;
      const left = editorLayout.contentLeft + prefixLeftOffset - horizontalScrollOffset;
      if (right <= left) {
        return null;
      }
      const { topOffset: topTrim, contentHeight: height } = this._trimVertically.read(reader);
      const scrollTop = this._editorObs.scrollTop.read(reader);
      const top = this._editor.getTopForLineNumber(state.lineNumber) - scrollTop + topTrim;
      const bottom = top + height;
      const overlay = new Rect(left, top, right, bottom);
      return {
        overlay,
        startsAtContentLeft: prefixLeftOffset === 0,
        contentLeft: editorLayout.contentLeft,
        minContentWidthRequired: prefixLeftOffset + overlay.width + verticalScrollbarWidth
      };
    }).recomputeInitiallyAndOnChange(this._store);
    this._modifiedOverlay = n.div({
      style: { pointerEvents: "none" }
    }, derived(this, (reader) => {
      const overlayLayoutObs = mapOutFalsy(this._overlayLayout).read(reader);
      if (!overlayLayoutObs) {
        return void 0;
      }
      const overlayHider = overlayLayoutObs.map((layoutInfo) => Rect.fromLeftTopRightBottom(
        layoutInfo.contentLeft - BORDER_RADIUS - BORDER_WIDTH,
        layoutInfo.overlay.top,
        layoutInfo.contentLeft,
        layoutInfo.overlay.bottom
      )).read(reader);
      const separatorWidth = this._input.map((i) => i?.editorType === InlineCompletionEditorType.DiffEditor ? WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH : WIDGET_SEPARATOR_WIDTH).read(reader);
      const overlayRect = overlayLayoutObs.map((l) => l.overlay.withMargin(0, BORDER_WIDTH, BORDER_WIDTH, l.startsAtContentLeft ? 0 : BORDER_WIDTH).intersectHorizontal(new OffsetRange(overlayHider.left, Number.MAX_SAFE_INTEGER)));
      const underlayRect = overlayRect.map((rect) => rect.withMargin(separatorWidth, separatorWidth));
      const editorBackground = getEditorBackgroundColor(this._input.read(void 0)?.editorType ?? InlineCompletionEditorType.TextEditor);
      return [
        n.div({
          class: "originalUnderlayInsertion",
          style: {
            ...underlayRect.read(reader).toStyles(),
            borderRadius: BORDER_RADIUS,
            border: `${BORDER_WIDTH + separatorWidth}px solid ${editorBackground}`,
            boxSizing: "border-box"
          }
        }),
        n.div({
          class: "originalOverlayInsertion",
          style: {
            ...overlayRect.read(reader).toStyles(),
            borderRadius: BORDER_RADIUS,
            border: getModifiedBorderColor(this._tabAction).map((bc) => `${BORDER_WIDTH}px solid ${asCssVariable(bc)}`),
            boxSizing: "border-box",
            backgroundColor: asCssVariable(modifiedBackgroundColor)
          }
        }),
        n.div({
          class: "originalOverlayHiderInsertion",
          style: {
            ...overlayHider.toStyles(),
            backgroundColor: editorBackground
          }
        })
      ];
    })).keepUpdated(this._store);
    this._view = n.div({
      class: "inline-edits-view",
      style: {
        position: "absolute",
        overflow: "visible",
        top: "0px",
        left: "0px",
        display: this._display
      }
    }, [
      [this._modifiedOverlay]
    ]).keepUpdated(this._store);
    this._editorObs = observableCodeEditor(this._editor);
    this._ghostTextView = this._register(instantiationService.createInstance(
      GhostTextView,
      this._editor,
      derived((reader) => {
        const ghostText = this._ghostText.read(reader);
        if (!ghostText) {
          return void 0;
        }
        return {
          ghostText,
          handleInlineCompletionShown: (data) => {
          },
          warning: void 0
        };
      }),
      {
        extraClasses: ["inline-edit"],
        isClickable: true,
        shouldKeepCursorStable: true
      }
    ));
    this.isHovered = this._ghostTextView.isHovered;
    this._register(this._ghostTextView.onDidClick((e) => {
      this._onDidClick.fire(new InlineEditClickEvent(e));
    }));
    this._register(this._editorObs.createOverlayWidget({
      domNode: this._view.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: derived(this, (reader) => {
        const info = this._overlayLayout.read(reader);
        if (info === null) {
          return 0;
        }
        return info.minContentWidthRequired;
      })
    }));
  }
};
InlineEditsInsertionView = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILanguageService)
], InlineEditsInsertionView);
export {
  InlineEditsInsertionView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcaW5saW5lRWRpdHNJbnNlcnRpb25WaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7ICQsIG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IsIG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBMaW5lU291cmNlLCByZW5kZXJMaW5lcywgUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvY29tcG9uZW50cy9kaWZmRWRpdG9yVmlld1pvbmVzL3JlbmRlckxpbmVzLmpzJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9yZWN0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IExpbmVUb2tlbnMsIFRva2VuQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgSW5saW5lRGVjb3JhdGlvbiwgSW5saW5lRGVjb3JhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vdmlld01vZGVsL2lubGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEdob3N0VGV4dCwgR2hvc3RUZXh0UGFydCB9IGZyb20gJy4uLy4uLy4uL21vZGVsL2dob3N0VGV4dC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZSB9IGZyb20gJy4uLy4uLy4uL21vZGVsL3Byb3ZpZGVJbmxpbmVDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBHaG9zdFRleHRWaWV3LCBJR2hvc3RUZXh0V2lkZ2V0RGF0YSB9IGZyb20gJy4uLy4uL2dob3N0VGV4dC9naG9zdFRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbmxpbmVFZGl0c1ZpZXcsIElubGluZUVkaXRDbGlja0V2ZW50LCBJbmxpbmVFZGl0VGFiQWN0aW9uIH0gZnJvbSAnLi4vaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzJztcbmltcG9ydCB7IGdldEVkaXRvckJhY2tncm91bmRDb2xvciwgZ2V0TW9kaWZpZWRCb3JkZXJDb2xvciwgSU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVMsIG1vZGlmaWVkQmFja2dyb3VuZENvbG9yIH0gZnJvbSAnLi4vdGhlbWUuanMnO1xuaW1wb3J0IHsgZ2V0UHJlZml4VHJpbSwgbWFwT3V0RmFsc3kgfSBmcm9tICcuLi91dGlscy91dGlscy5qcyc7XG5cbmNvbnN0IEJPUkRFUl9XSURUSCA9IDE7XG5jb25zdCBXSURHRVRfU0VQQVJBVE9SX1dJRFRIID0gMTtcbmNvbnN0IFdJREdFVF9TRVBBUkFUT1JfRElGRl9FRElUT1JfV0lEVEggPSAzO1xuY29uc3QgQk9SREVSX1JBRElVUyA9IElOTElORV9FRElUU19CT1JERVJfUkFESVVTO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lRWRpdHNJbnNlcnRpb25WaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElJbmxpbmVFZGl0c1ZpZXcge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JPYnM6IE9ic2VydmFibGVDb2RlRWRpdG9yO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbmxpbmVFZGl0Q2xpY2tFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2sgPSB0aGlzLl9vbkRpZENsaWNrLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5faW5wdXQucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc3RhdGUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdGNvbnN0IGVvbCA9IHRleHRNb2RlbC5nZXRFT0woKTtcblxuXHRcdGlmIChzdGF0ZS5zdGFydENvbHVtbiA9PT0gMSAmJiBzdGF0ZS5saW5lTnVtYmVyID4gMSAmJiB0ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aChzdGF0ZS5saW5lTnVtYmVyKSAhPT0gMCAmJiBzdGF0ZS50ZXh0LmVuZHNXaXRoKGVvbCkgJiYgIXN0YXRlLnRleHQuc3RhcnRzV2l0aChlb2wpKSB7XG5cdFx0XHRjb25zdCBlbmRPZkxpbmVDb2x1bW4gPSB0ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aChzdGF0ZS5saW5lTnVtYmVyIC0gMSkgKyAxO1xuXHRcdFx0cmV0dXJuIHsgbGluZU51bWJlcjogc3RhdGUubGluZU51bWJlciAtIDEsIGNvbHVtbjogZW5kT2ZMaW5lQ29sdW1uLCB0ZXh0OiBlb2wgKyBzdGF0ZS50ZXh0LnNsaWNlKDAsIC1lb2wubGVuZ3RoKSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGxpbmVOdW1iZXI6IHN0YXRlLmxpbmVOdW1iZXIsIGNvbHVtbjogc3RhdGUuc3RhcnRDb2x1bW4sIHRleHQ6IHN0YXRlLnRleHQgfTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHJpbVZlcnRpY2FsbHkgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHsgdG9wT2Zmc2V0OiAwLCBjb250ZW50SGVpZ2h0OiAwLCBsaW5lc1RvcDogMCwgbGluZXNCb3R0b206IDAgfTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0ID0gc3RhdGUudGV4dDtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihuZXcgUG9zaXRpb24oc3RhdGUubGluZU51bWJlciwgMSkpO1xuXHRcdGNvbnN0IGVvbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpIS5nZXRFT0woKTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSB0ZXh0LnNwbGl0KGVvbCkubGVuZ3RoO1xuXG5cdFx0Ly8gQ291bnQgbGVhZGluZy90cmFpbGluZyBibGFuayBsaW5lcyBzbyB0aGUgb3ZlcmxheSBjYW4gYmUgdHJpbW1lZCB0byB0aGUgYWN0dWFsIGluc2VydGVkIGNvbnRlbnQuXG5cdFx0bGV0IGxpbmVzVG9wID0gMDtcblx0XHRsZXQgbGluZXNCb3R0b20gPSAwO1xuXHRcdGlmICh0ZXh0LnRyaW0oKSAhPT0gJycpIHtcblx0XHRcdGxldCBpID0gMDtcblx0XHRcdGZvciAoOyBpIDwgdGV4dC5sZW5ndGggJiYgdGV4dC5zdGFydHNXaXRoKGVvbCwgaSk7IGkgKz0gZW9sLmxlbmd0aCkge1xuXHRcdFx0XHRsaW5lc1RvcCArPSAxO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBqID0gdGV4dC5sZW5ndGg7IGogPiBpICYmIHRleHQuZW5kc1dpdGgoZW9sLCBqKTsgaiAtPSBlb2wubGVuZ3RoKSB7XG5cdFx0XHRcdGxpbmVzQm90dG9tICs9IDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvcE9mZnNldDogbGluZXNUb3AgKiBsaW5lSGVpZ2h0LFxuXHRcdFx0Y29udGVudEhlaWdodDogKGxpbmVDb3VudCAtIGxpbmVzVG9wIC0gbGluZXNCb3R0b20pICogbGluZUhlaWdodCxcblx0XHRcdGxpbmVzVG9wLFxuXHRcdFx0bGluZXNCb3R0b20sXG5cdFx0fTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWF4UHJlZml4VHJpbSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4geyBwcmVmaXhMZWZ0T2Zmc2V0OiAwLCBwcmVmaXhUcmltOiAwIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdGNvbnN0IGVvbCA9IHRleHRNb2RlbC5nZXRFT0woKTtcblxuXHRcdGNvbnN0IHRyaW1WZXJ0aWNhbGx5ID0gdGhpcy5fdHJpbVZlcnRpY2FsbHkucmVhZChyZWFkZXIpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBzdGF0ZS50ZXh0LnNwbGl0KGVvbCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRMaW5lcyA9IGxpbmVzLnNsaWNlKHRyaW1WZXJ0aWNhbGx5LmxpbmVzVG9wLCBsaW5lcy5sZW5ndGggLSB0cmltVmVydGljYWxseS5saW5lc0JvdHRvbSk7XG5cdFx0aWYgKHRyaW1WZXJ0aWNhbGx5LmxpbmVzVG9wID09PSAwKSB7XG5cdFx0XHRtb2RpZmllZExpbmVzWzBdID0gdGV4dE1vZGVsLmdldExpbmVDb250ZW50KHN0YXRlLmxpbmVOdW1iZXIpICsgbW9kaWZpZWRMaW5lc1swXTtcblx0XHR9XG5cblx0XHRjb25zdCBvcmlnaW5hbFJhbmdlID0gbmV3IExpbmVSYW5nZShzdGF0ZS5saW5lTnVtYmVyLCBzdGF0ZS5saW5lTnVtYmVyICsgKHRyaW1WZXJ0aWNhbGx5LmxpbmVzVG9wID4gMCA/IDAgOiAxKSk7XG5cblx0XHRyZXR1cm4gZ2V0UHJlZml4VHJpbShbXSwgb3JpZ2luYWxSYW5nZSwgbW9kaWZpZWRMaW5lcywgdGhpcy5fZWRpdG9yKTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZ2hvc3RUZXh0ID0gZGVyaXZlZDxHaG9zdFRleHQgfCB1bmRlZmluZWQ+KHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgcHJlZml4VHJpbSA9IHRoaXMuX21heFByZWZpeFRyaW0ucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc3RhdGUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdGNvbnN0IGVvbCA9IHRleHRNb2RlbC5nZXRFT0woKTtcblx0XHRjb25zdCBtb2RpZmllZExpbmVzID0gc3RhdGUudGV4dC5zcGxpdChlb2wpO1xuXG5cdFx0Y29uc3QgaW5saW5lRGVjb3JhdGlvbnMgPSBtb2RpZmllZExpbmVzLm1hcCgobGluZSwgaSkgPT4gbmV3IElubGluZURlY29yYXRpb24oXG5cdFx0XHRuZXcgUmFuZ2UoaSArIDEsIGkgPT09IDAgPyAxIDogcHJlZml4VHJpbS5wcmVmaXhUcmltICsgMSwgaSArIDEsIGxpbmUubGVuZ3RoICsgMSksXG5cdFx0XHQnbW9kaWZpZWQtYmFja2dyb3VuZCcsXG5cdFx0XHRJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyXG5cdFx0KSk7XG5cblx0XHRyZXR1cm4gbmV3IEdob3N0VGV4dChzdGF0ZS5saW5lTnVtYmVyLCBbbmV3IEdob3N0VGV4dFBhcnQoc3RhdGUuY29sdW1uLCBzdGF0ZS50ZXh0LCBmYWxzZSwgaW5saW5lRGVjb3JhdGlvbnMpXSk7XG5cdH0pO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfZ2hvc3RUZXh0VmlldzogR2hvc3RUZXh0Vmlldztcblx0cmVhZG9ubHkgaXNIb3ZlcmVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0OiBJT2JzZXJ2YWJsZTx7XG5cdFx0XHRsaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0XHRzdGFydENvbHVtbjogbnVtYmVyO1xuXHRcdFx0dGV4dDogc3RyaW5nO1xuXHRcdFx0ZWRpdG9yVHlwZTogSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGU7XG5cdFx0fSB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGFiQWN0aW9uOiBJT2JzZXJ2YWJsZTxJbmxpbmVFZGl0VGFiQWN0aW9uPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fZWRpdG9yKTtcblxuXHRcdHRoaXMuX2dob3N0VGV4dFZpZXcgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEdob3N0VGV4dFZpZXcsXG5cdFx0XHR0aGlzLl9lZGl0b3IsXG5cdFx0XHRkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGdob3N0VGV4dCA9IHRoaXMuX2dob3N0VGV4dC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghZ2hvc3RUZXh0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGdob3N0VGV4dDogZ2hvc3RUZXh0LFxuXHRcdFx0XHRcdGhhbmRsZUlubGluZUNvbXBsZXRpb25TaG93bjogKGRhdGEpID0+IHtcblx0XHRcdFx0XHRcdC8vIFRoaXMgaXMgYSBuby1vcCBmb3IgdGhlIGluc2VydGlvbiB2aWV3LCBhcyBpdCBpcyBoYW5kbGVkIGJ5IHRoZSBJbmxpbmVFZGl0c1ZpZXcuXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR3YXJuaW5nOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElHaG9zdFRleHRXaWRnZXREYXRhO1xuXHRcdFx0fSksXG5cdFx0XHR7XG5cdFx0XHRcdGV4dHJhQ2xhc3NlczogWydpbmxpbmUtZWRpdCddLFxuXHRcdFx0XHRpc0NsaWNrYWJsZTogdHJ1ZSxcblx0XHRcdFx0c2hvdWxkS2VlcEN1cnNvclN0YWJsZTogdHJ1ZSxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHRoaXMuaXNIb3ZlcmVkID0gdGhpcy5fZ2hvc3RUZXh0Vmlldy5pc0hvdmVyZWQ7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9naG9zdFRleHRWaWV3Lm9uRGlkQ2xpY2soKGUpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZShuZXcgSW5saW5lRWRpdENsaWNrRXZlbnQoZSkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvck9icy5jcmVhdGVPdmVybGF5V2lkZ2V0KHtcblx0XHRcdGRvbU5vZGU6IHRoaXMuX3ZpZXcuZWxlbWVudCxcblx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGUobnVsbCksXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHRcdG1pbkNvbnRlbnRXaWR0aEluUHg6IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX292ZXJsYXlMYXlvdXQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoaW5mbyA9PT0gbnVsbCkgeyByZXR1cm4gMDsgfVxuXHRcdFx0XHRyZXR1cm4gaW5mby5taW5Db250ZW50V2lkdGhSZXF1aXJlZDtcblx0XHRcdH0pLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3BsYXkgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiAhIXRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKSA/ICdibG9jaycgOiAnbm9uZScpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck1heENvbnRlbnRXaWR0aEluUmFuZ2UgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRvck9icy52ZXJzaW9uSWQucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpITtcblx0XHRjb25zdCBlb2wgPSB0ZXh0TW9kZWwuZ2V0RU9MKCk7XG5cblx0XHRjb25zdCB0ZXh0QmVmb3JlSW5zZXJ0aW9uID0gc3RhdGUudGV4dC5zdGFydHNXaXRoKGVvbCkgPyAnJyA6IHRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHN0YXRlLmxpbmVOdW1iZXIsIDEsIHN0YXRlLmxpbmVOdW1iZXIsIHN0YXRlLmNvbHVtbikpO1xuXHRcdGNvbnN0IHRleHRBZnRlckluc2VydGlvbiA9IHRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHN0YXRlLmxpbmVOdW1iZXIsIHN0YXRlLmNvbHVtbiwgc3RhdGUubGluZU51bWJlciwgdGV4dE1vZGVsLmdldExpbmVMZW5ndGgoc3RhdGUubGluZU51bWJlcikgKyAxKSk7XG5cdFx0Y29uc3QgdGV4dCA9IHRleHRCZWZvcmVJbnNlcnRpb24gKyBzdGF0ZS50ZXh0ICsgdGV4dEFmdGVySW5zZXJ0aW9uO1xuXHRcdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdChlb2wpO1xuXG5cdFx0Y29uc3QgcmVuZGVyT3B0aW9ucyA9IFJlbmRlck9wdGlvbnMuZnJvbUVkaXRvcih0aGlzLl9lZGl0b3IpLndpdGhTZXRXaWR0aChmYWxzZSkud2l0aFNjcm9sbEJleW9uZExhc3RDb2x1bW4oMCk7XG5cdFx0Y29uc3QgbGluZVdpZHRocyA9IGxpbmVzLm1hcChsaW5lID0+IHtcblx0XHRcdGNvbnN0IHQgPSB0ZXh0TW9kZWwudG9rZW5pemF0aW9uLnRva2VuaXplTGluZXNBdChzdGF0ZS5saW5lTnVtYmVyLCBbbGluZV0pPy5bMF07XG5cdFx0XHRsZXQgdG9rZW5zOiBMaW5lVG9rZW5zO1xuXHRcdFx0aWYgKHQpIHtcblx0XHRcdFx0dG9rZW5zID0gVG9rZW5BcnJheS5mcm9tTGluZVRva2Vucyh0KS50b0xpbmVUb2tlbnMobGluZSwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b2tlbnMgPSBMaW5lVG9rZW5zLmNyZWF0ZUVtcHR5KGxpbmUsIHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVuZGVyTGluZXMobmV3IExpbmVTb3VyY2UoW3Rva2Vuc10pLCByZW5kZXJPcHRpb25zLCBbXSwgJCgnZGl2JyksIHRydWUpLm1pbldpZHRoSW5QeDtcblx0XHR9KTtcblxuXHRcdC8vIFRha2UgdGhlIG1heCB2YWx1ZSB0aGF0IHdlIG9ic2VydmVkLlxuXHRcdC8vIFJlc2V0IHdoZW4gZWl0aGVyIHRoZSBlZGl0IGNoYW5nZXMgb3IgdGhlIGVkaXRvciB0ZXh0IHZlcnNpb24uXG5cdFx0cmV0dXJuIE1hdGgubWF4KC4uLmxpbmVXaWR0aHMpO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRMaW5lT2Zmc2V0ID0gdGhpcy5fdHJpbVZlcnRpY2FsbHkubWFwKHYgPT4gdi50b3BPZmZzZXQpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb3JpZ2luYWxMaW5lcyA9IHRoaXMuX3N0YXRlLm1hcChzID0+IHMgP1xuXHRcdG5ldyBMaW5lUmFuZ2UoXG5cdFx0XHRzLmxpbmVOdW1iZXIsXG5cdFx0XHRNYXRoLm1pbihzLmxpbmVOdW1iZXIgKyAyLCB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvdW50KCkgKyAxKVxuXHRcdCkgOiB1bmRlZmluZWRcblx0KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vdmVybGF5TGF5b3V0ID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0dGhpcy5fZ2hvc3RUZXh0LnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGhlIG92ZXJsYXkgd2hlbiB0aGUgcG9zaXRpb24gY2hhbmdlc1xuXHRcdHRoaXMuX2VkaXRvck9icy5vYnNlcnZlUG9zaXRpb24ob2JzZXJ2YWJsZVZhbHVlKHRoaXMsIG5ldyBQb3NpdGlvbihzdGF0ZS5saW5lTnVtYmVyLCBzdGF0ZS5jb2x1bW4pKSwgcmVhZGVyLnN0b3JlKS5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCBlZGl0b3JMYXlvdXQgPSB0aGlzLl9lZGl0b3JPYnMubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbE9mZnNldCA9IHRoaXMuX2VkaXRvck9icy5zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoID0gdGhpcy5fZWRpdG9yT2JzLmxheW91dEluZm9WZXJ0aWNhbFNjcm9sbGJhcldpZHRoLnJlYWQocmVhZGVyKTtcblxuXHRcdGNvbnN0IHJpZ2h0ID0gZWRpdG9yTGF5b3V0LmNvbnRlbnRMZWZ0ICsgdGhpcy5fZWRpdG9yTWF4Q29udGVudFdpZHRoSW5SYW5nZS5yZWFkKHJlYWRlcikgLSBob3Jpem9udGFsU2Nyb2xsT2Zmc2V0O1xuXHRcdGNvbnN0IHByZWZpeExlZnRPZmZzZXQgPSB0aGlzLl9tYXhQcmVmaXhUcmltLnJlYWQocmVhZGVyKS5wcmVmaXhMZWZ0T2Zmc2V0ID8/IDAgLyogZml4IGR1ZSB0byBvYnNlcnZhYmxlIGJ1Zz8gKi87XG5cdFx0Y29uc3QgbGVmdCA9IGVkaXRvckxheW91dC5jb250ZW50TGVmdCArIHByZWZpeExlZnRPZmZzZXQgLSBob3Jpem9udGFsU2Nyb2xsT2Zmc2V0O1xuXHRcdGlmIChyaWdodCA8PSBsZWZ0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCB7IHRvcE9mZnNldDogdG9wVHJpbSwgY29udGVudEhlaWdodDogaGVpZ2h0IH0gPSB0aGlzLl90cmltVmVydGljYWxseS5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLl9lZGl0b3JPYnMuc2Nyb2xsVG9wLnJlYWQocmVhZGVyKTtcblx0XHQvLyBEZXJpdmUgdGhlIG92ZXJsYXkgaGVpZ2h0IHN5bmNocm9ub3VzbHkgZnJvbSB0aGUgbW9kZWwgKHZpYSBfdHJpbVZlcnRpY2FsbHkpIHJhdGhlciB0aGFuIHRoZVxuXHRcdC8vIGFzeW5jaHJvbm91c2x5IG1lYXN1cmVkIGdob3N0IHRleHQgdmlldyB6b25lIGhlaWdodCwgd2hpY2ggaXMgdHJhbnNpZW50bHkganVzdCBhIHNpbmdsZSBsaW5lIHdoaWxlXG5cdFx0Ly8gdGhlIHZpZXcgem9uZSBpcyAocmUpY3JlYXRlZC4gQmVjYXVzZSBpdCB1c2VzIHRoZSBzYW1lIGxpbmUgaGVpZ2h0IGFuZCBsaW5lIGFjY291bnRpbmcgYXMgdGhlIHRyaW1zLFxuXHRcdC8vIHRvcC9oZWlnaHQvYm90dG9tIHN0YXkgY29uc2lzdGVudCBhbmQgaGVpZ2h0IGlzIGFsd2F5cyBwb3NpdGl2ZTogbGVhZGluZyBhbmQgdHJhaWxpbmcgYmxhbmsgbGluZXNcblx0XHQvLyBjYW4gbmV2ZXIgY292ZXIgZXZlcnkgaW5zZXJ0ZWQgbGluZS5cblx0XHRjb25zdCB0b3AgPSB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihzdGF0ZS5saW5lTnVtYmVyKSAtIHNjcm9sbFRvcCArIHRvcFRyaW07XG5cdFx0Y29uc3QgYm90dG9tID0gdG9wICsgaGVpZ2h0O1xuXG5cdFx0Y29uc3Qgb3ZlcmxheSA9IG5ldyBSZWN0KGxlZnQsIHRvcCwgcmlnaHQsIGJvdHRvbSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3ZlcmxheSxcblx0XHRcdHN0YXJ0c0F0Q29udGVudExlZnQ6IHByZWZpeExlZnRPZmZzZXQgPT09IDAsXG5cdFx0XHRjb250ZW50TGVmdDogZWRpdG9yTGF5b3V0LmNvbnRlbnRMZWZ0LFxuXHRcdFx0bWluQ29udGVudFdpZHRoUmVxdWlyZWQ6IHByZWZpeExlZnRPZmZzZXQgKyBvdmVybGF5LndpZHRoICsgdmVydGljYWxTY3JvbGxiYXJXaWR0aCxcblx0XHR9O1xuXHR9KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRPdmVybGF5ID0gbi5kaXYoe1xuXHRcdHN0eWxlOiB7IHBvaW50ZXJFdmVudHM6ICdub25lJywgfVxuXHR9LCBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgb3ZlcmxheUxheW91dE9icyA9IG1hcE91dEZhbHN5KHRoaXMuX292ZXJsYXlMYXlvdXQpLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIW92ZXJsYXlMYXlvdXRPYnMpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Ly8gQ3JlYXRlIGFuIG92ZXJsYXkgd2hpY2ggaGlkZXMgdGhlIGxlZnQgaGFuZCBzaWRlIG9mIHRoZSBvcmlnaW5hbCBvdmVybGF5IHdoZW4gaXQgb3ZlcmZsb3dzIHRvIHRoZSBsZWZ0XG5cdFx0Ly8gc3VjaCB0aGF0IHRoZXJlIGlzIGEgc21vb3RoIHRyYW5zaXRpb24gYXQgdGhlIGVkZ2Ugb2YgY29udGVudCBsZWZ0XG5cdFx0Y29uc3Qgb3ZlcmxheUhpZGVyID0gb3ZlcmxheUxheW91dE9icy5tYXAobGF5b3V0SW5mbyA9PiBSZWN0LmZyb21MZWZ0VG9wUmlnaHRCb3R0b20oXG5cdFx0XHRsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0IC0gQk9SREVSX1JBRElVUyAtIEJPUkRFUl9XSURUSCxcblx0XHRcdGxheW91dEluZm8ub3ZlcmxheS50b3AsXG5cdFx0XHRsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0LFxuXHRcdFx0bGF5b3V0SW5mby5vdmVybGF5LmJvdHRvbVxuXHRcdCkpLnJlYWQocmVhZGVyKTtcblxuXHRcdGNvbnN0IHNlcGFyYXRvcldpZHRoID0gdGhpcy5faW5wdXQubWFwKGkgPT4gaT8uZWRpdG9yVHlwZSA9PT0gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuRGlmZkVkaXRvciA/IFdJREdFVF9TRVBBUkFUT1JfRElGRl9FRElUT1JfV0lEVEggOiBXSURHRVRfU0VQQVJBVE9SX1dJRFRIKS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgb3ZlcmxheVJlY3QgPSBvdmVybGF5TGF5b3V0T2JzLm1hcChsID0+IGwub3ZlcmxheS53aXRoTWFyZ2luKDAsIEJPUkRFUl9XSURUSCwgQk9SREVSX1dJRFRILCBsLnN0YXJ0c0F0Q29udGVudExlZnQgPyAwIDogQk9SREVSX1dJRFRIKS5pbnRlcnNlY3RIb3Jpem9udGFsKG5ldyBPZmZzZXRSYW5nZShvdmVybGF5SGlkZXIubGVmdCwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpKSk7XG5cdFx0Y29uc3QgdW5kZXJsYXlSZWN0ID0gb3ZlcmxheVJlY3QubWFwKHJlY3QgPT4gcmVjdC53aXRoTWFyZ2luKHNlcGFyYXRvcldpZHRoLCBzZXBhcmF0b3JXaWR0aCkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yQmFja2dyb3VuZCA9IGdldEVkaXRvckJhY2tncm91bmRDb2xvcih0aGlzLl9pbnB1dC5yZWFkKHVuZGVmaW5lZCk/LmVkaXRvclR5cGUgPz8gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuVGV4dEVkaXRvcik7XG5cdFx0cmV0dXJuIFtcblx0XHRcdG4uZGl2KHtcblx0XHRcdFx0Y2xhc3M6ICdvcmlnaW5hbFVuZGVybGF5SW5zZXJ0aW9uJyxcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHQuLi51bmRlcmxheVJlY3QucmVhZChyZWFkZXIpLnRvU3R5bGVzKCksXG5cdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBCT1JERVJfUkFESVVTLFxuXHRcdFx0XHRcdGJvcmRlcjogYCR7Qk9SREVSX1dJRFRIICsgc2VwYXJhdG9yV2lkdGh9cHggc29saWQgJHtlZGl0b3JCYWNrZ3JvdW5kfWAsXG5cdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRjbGFzczogJ29yaWdpbmFsT3ZlcmxheUluc2VydGlvbicsXG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0Li4ub3ZlcmxheVJlY3QucmVhZChyZWFkZXIpLnRvU3R5bGVzKCksXG5cdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBCT1JERVJfUkFESVVTLFxuXHRcdFx0XHRcdGJvcmRlcjogZ2V0TW9kaWZpZWRCb3JkZXJDb2xvcih0aGlzLl90YWJBY3Rpb24pLm1hcChiYyA9PiBgJHtCT1JERVJfV0lEVEh9cHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKGJjKX1gKSxcblx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IGFzQ3NzVmFyaWFibGUobW9kaWZpZWRCYWNrZ3JvdW5kQ29sb3IpLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdG4uZGl2KHtcblx0XHRcdFx0Y2xhc3M6ICdvcmlnaW5hbE92ZXJsYXlIaWRlckluc2VydGlvbicsXG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0Li4ub3ZlcmxheUhpZGVyLnRvU3R5bGVzKCksXG5cdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdF07XG5cdH0pKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlldyA9IG4uZGl2KHtcblx0XHRjbGFzczogJ2lubGluZS1lZGl0cy12aWV3Jyxcblx0XHRzdHlsZToge1xuXHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRvdmVyZmxvdzogJ3Zpc2libGUnLFxuXHRcdFx0dG9wOiAnMHB4Jyxcblx0XHRcdGxlZnQ6ICcwcHgnLFxuXHRcdFx0ZGlzcGxheTogdGhpcy5fZGlzcGxheSxcblx0XHR9LFxuXHR9LCBbXG5cdFx0W3RoaXMuX21vZGlmaWVkT3ZlcmxheV0sXG5cdF0pLmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxHQUFHLFNBQVM7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCLFNBQXNCLHVCQUF1QjtBQUN2RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUU5QixTQUErQiw0QkFBNEI7QUFDM0QsU0FBUyxZQUFZLGFBQWEscUJBQXFCO0FBQ3ZELFNBQVMsWUFBWTtBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxZQUFZLGtCQUFrQjtBQUN2QyxTQUFTLGtCQUFrQiw0QkFBNEI7QUFDdkQsU0FBUyxXQUFXLHFCQUFxQjtBQUN6QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHFCQUEyQztBQUNwRCxTQUEyQiw0QkFBaUQ7QUFDNUUsU0FBUywwQkFBMEIsd0JBQXdCLDRCQUE0QiwrQkFBK0I7QUFDdEgsU0FBUyxlQUFlLG1CQUFtQjtBQUUzQyxNQUFNLGVBQWU7QUFDckIsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSxxQ0FBcUM7QUFDM0MsTUFBTSxnQkFBZ0I7QUFFZixJQUFNLDJCQUFOLGNBQXVDLFdBQXVDO0FBQUEsRUFpR3BGLFlBQ2tCLFNBQ0EsUUFNQSxZQUNNLHNCQUNZLGtCQUNsQztBQUNELFVBQU07QUFYVztBQUNBO0FBTUE7QUFFa0I7QUF4R3BDLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBOEIsQ0FBQztBQUNqRixTQUFTLGFBQWEsS0FBSyxZQUFZO0FBRXZDLFNBQWlCLFNBQVMsUUFBUSxNQUFNLFlBQVU7QUFDakQsWUFBTSxRQUFRLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDckMsVUFBSSxDQUFDLE9BQU87QUFBRSxlQUFPO0FBQUEsTUFBVztBQUVoQyxZQUFNLFlBQVksS0FBSyxRQUFRLFNBQVM7QUFDeEMsWUFBTSxNQUFNLFVBQVUsT0FBTztBQUU3QixVQUFJLE1BQU0sZ0JBQWdCLEtBQUssTUFBTSxhQUFhLEtBQUssVUFBVSxjQUFjLE1BQU0sVUFBVSxNQUFNLEtBQUssTUFBTSxLQUFLLFNBQVMsR0FBRyxLQUFLLENBQUMsTUFBTSxLQUFLLFdBQVcsR0FBRyxHQUFHO0FBQ2xLLGNBQU0sa0JBQWtCLFVBQVUsY0FBYyxNQUFNLGFBQWEsQ0FBQyxJQUFJO0FBQ3hFLGVBQU8sRUFBRSxZQUFZLE1BQU0sYUFBYSxHQUFHLFFBQVEsaUJBQWlCLE1BQU0sTUFBTSxNQUFNLEtBQUssTUFBTSxHQUFHLENBQUMsSUFBSSxNQUFNLEVBQUU7QUFBQSxNQUNsSDtBQUVBLGFBQU8sRUFBRSxZQUFZLE1BQU0sWUFBWSxRQUFRLE1BQU0sYUFBYSxNQUFNLE1BQU0sS0FBSztBQUFBLElBQ3BGLENBQUM7QUFFRCxTQUFpQixrQkFBa0IsUUFBUSxNQUFNLFlBQVU7QUFDMUQsWUFBTSxRQUFRLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDckMsVUFBSSxDQUFDLE9BQU87QUFDWCxlQUFPLEVBQUUsV0FBVyxHQUFHLGVBQWUsR0FBRyxVQUFVLEdBQUcsYUFBYSxFQUFFO0FBQUEsTUFDdEU7QUFFQSxZQUFNLE9BQU8sTUFBTTtBQUNuQixZQUFNLGFBQWEsS0FBSyxRQUFRLHlCQUF5QixJQUFJLFNBQVMsTUFBTSxZQUFZLENBQUMsQ0FBQztBQUMxRixZQUFNLE1BQU0sS0FBSyxRQUFRLFNBQVMsRUFBRyxPQUFPO0FBQzVDLFlBQU0sWUFBWSxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBR2xDLFVBQUksV0FBVztBQUNmLFVBQUksY0FBYztBQUNsQixVQUFJLEtBQUssS0FBSyxNQUFNLElBQUk7QUFDdkIsWUFBSSxJQUFJO0FBQ1IsZUFBTyxJQUFJLEtBQUssVUFBVSxLQUFLLFdBQVcsS0FBSyxDQUFDLEdBQUcsS0FBSyxJQUFJLFFBQVE7QUFDbkUsc0JBQVk7QUFBQSxRQUNiO0FBRUEsaUJBQVMsSUFBSSxLQUFLLFFBQVEsSUFBSSxLQUFLLEtBQUssU0FBUyxLQUFLLENBQUMsR0FBRyxLQUFLLElBQUksUUFBUTtBQUMxRSx5QkFBZTtBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxRQUNOLFdBQVcsV0FBVztBQUFBLFFBQ3RCLGdCQUFnQixZQUFZLFdBQVcsZUFBZTtBQUFBLFFBQ3REO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFpQixpQkFBaUIsUUFBUSxNQUFNLFlBQVU7QUFDekQsWUFBTSxRQUFRLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDckMsVUFBSSxDQUFDLE9BQU87QUFDWCxlQUFPLEVBQUUsa0JBQWtCLEdBQUcsWUFBWSxFQUFFO0FBQUEsTUFDN0M7QUFFQSxZQUFNLFlBQVksS0FBSyxRQUFRLFNBQVM7QUFDeEMsWUFBTSxNQUFNLFVBQVUsT0FBTztBQUU3QixZQUFNLGlCQUFpQixLQUFLLGdCQUFnQixLQUFLLE1BQU07QUFFdkQsWUFBTSxRQUFRLE1BQU0sS0FBSyxNQUFNLEdBQUc7QUFDbEMsWUFBTSxnQkFBZ0IsTUFBTSxNQUFNLGVBQWUsVUFBVSxNQUFNLFNBQVMsZUFBZSxXQUFXO0FBQ3BHLFVBQUksZUFBZSxhQUFhLEdBQUc7QUFDbEMsc0JBQWMsQ0FBQyxJQUFJLFVBQVUsZUFBZSxNQUFNLFVBQVUsSUFBSSxjQUFjLENBQUM7QUFBQSxNQUNoRjtBQUVBLFlBQU0sZ0JBQWdCLElBQUksVUFBVSxNQUFNLFlBQVksTUFBTSxjQUFjLGVBQWUsV0FBVyxJQUFJLElBQUksRUFBRTtBQUU5RyxhQUFPLGNBQWMsQ0FBQyxHQUFHLGVBQWUsZUFBZSxLQUFLLE9BQU87QUFBQSxJQUNwRSxDQUFDO0FBRUQsU0FBaUIsYUFBYSxRQUErQixZQUFVO0FBQ3RFLFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFlBQU0sYUFBYSxLQUFLLGVBQWUsS0FBSyxNQUFNO0FBQ2xELFVBQUksQ0FBQyxPQUFPO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFaEMsWUFBTSxZQUFZLEtBQUssUUFBUSxTQUFTO0FBQ3hDLFlBQU0sTUFBTSxVQUFVLE9BQU87QUFDN0IsWUFBTSxnQkFBZ0IsTUFBTSxLQUFLLE1BQU0sR0FBRztBQUUxQyxZQUFNLG9CQUFvQixjQUFjLElBQUksQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUFBLFFBQzVELElBQUksTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLElBQUksV0FBVyxhQUFhLEdBQUcsSUFBSSxHQUFHLEtBQUssU0FBUyxDQUFDO0FBQUEsUUFDaEY7QUFBQSxRQUNBLHFCQUFxQjtBQUFBLE1BQ3RCLENBQUM7QUFFRCxhQUFPLElBQUksVUFBVSxNQUFNLFlBQVksQ0FBQyxJQUFJLGNBQWMsTUFBTSxRQUFRLE1BQU0sTUFBTSxPQUFPLGlCQUFpQixDQUFDLENBQUM7QUFBQSxJQUMvRyxDQUFDO0FBOERELFNBQWlCLFdBQVcsUUFBUSxNQUFNLFlBQVUsQ0FBQyxDQUFDLEtBQUssT0FBTyxLQUFLLE1BQU0sSUFBSSxVQUFVLE1BQU07QUFFakcsU0FBaUIsZ0NBQWdDLFFBQVEsTUFBTSxZQUFVO0FBQ3hFLFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsZUFBTztBQUFBLE1BQ1I7QUFDQSxXQUFLLFdBQVcsVUFBVSxLQUFLLE1BQU07QUFDckMsWUFBTSxZQUFZLEtBQUssUUFBUSxTQUFTO0FBQ3hDLFlBQU0sTUFBTSxVQUFVLE9BQU87QUFFN0IsWUFBTSxzQkFBc0IsTUFBTSxLQUFLLFdBQVcsR0FBRyxJQUFJLEtBQUssVUFBVSxnQkFBZ0IsSUFBSSxNQUFNLE1BQU0sWUFBWSxHQUFHLE1BQU0sWUFBWSxNQUFNLE1BQU0sQ0FBQztBQUN0SixZQUFNLHFCQUFxQixVQUFVLGdCQUFnQixJQUFJLE1BQU0sTUFBTSxZQUFZLE1BQU0sUUFBUSxNQUFNLFlBQVksVUFBVSxjQUFjLE1BQU0sVUFBVSxJQUFJLENBQUMsQ0FBQztBQUMvSixZQUFNLE9BQU8sc0JBQXNCLE1BQU0sT0FBTztBQUNoRCxZQUFNLFFBQVEsS0FBSyxNQUFNLEdBQUc7QUFFNUIsWUFBTSxnQkFBZ0IsY0FBYyxXQUFXLEtBQUssT0FBTyxFQUFFLGFBQWEsS0FBSyxFQUFFLDJCQUEyQixDQUFDO0FBQzdHLFlBQU0sYUFBYSxNQUFNLElBQUksVUFBUTtBQUNwQyxjQUFNLElBQUksVUFBVSxhQUFhLGdCQUFnQixNQUFNLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0FBQzlFLFlBQUk7QUFDSixZQUFJLEdBQUc7QUFDTixtQkFBUyxXQUFXLGVBQWUsQ0FBQyxFQUFFLGFBQWEsTUFBTSxLQUFLLGlCQUFpQixlQUFlO0FBQUEsUUFDL0YsT0FBTztBQUNOLG1CQUFTLFdBQVcsWUFBWSxNQUFNLEtBQUssaUJBQWlCLGVBQWU7QUFBQSxRQUM1RTtBQUVBLGVBQU8sWUFBWSxJQUFJLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxlQUFlLENBQUMsR0FBRyxFQUFFLEtBQUssR0FBRyxJQUFJLEVBQUU7QUFBQSxNQUNqRixDQUFDO0FBSUQsYUFBTyxLQUFLLElBQUksR0FBRyxVQUFVO0FBQUEsSUFDOUIsQ0FBQztBQUVELFNBQWdCLGtCQUFrQixLQUFLLGdCQUFnQixJQUFJLE9BQUssRUFBRSxTQUFTO0FBQzNFLFNBQWdCLGdCQUFnQixLQUFLLE9BQU87QUFBQSxNQUFJLE9BQUssSUFDcEQsSUFBSTtBQUFBLFFBQ0gsRUFBRTtBQUFBLFFBQ0YsS0FBSyxJQUFJLEVBQUUsYUFBYSxHQUFHLEtBQUssUUFBUSxTQUFTLEVBQUcsYUFBYSxJQUFJLENBQUM7QUFBQSxNQUN2RSxJQUFJO0FBQUEsSUFDTDtBQUVBLFNBQWlCLGlCQUFpQixRQUFRLE1BQU0sQ0FBQyxXQUFXO0FBQzNELFdBQUssV0FBVyxLQUFLLE1BQU07QUFDM0IsWUFBTSxRQUFRLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDckMsVUFBSSxDQUFDLE9BQU87QUFDWCxlQUFPO0FBQUEsTUFDUjtBQUdBLFdBQUssV0FBVyxnQkFBZ0IsZ0JBQWdCLE1BQU0sSUFBSSxTQUFTLE1BQU0sWUFBWSxNQUFNLE1BQU0sQ0FBQyxHQUFHLE9BQU8sS0FBSyxFQUFFLEtBQUssTUFBTTtBQUU5SCxZQUFNLGVBQWUsS0FBSyxXQUFXLFdBQVcsS0FBSyxNQUFNO0FBQzNELFlBQU0seUJBQXlCLEtBQUssV0FBVyxXQUFXLEtBQUssTUFBTTtBQUNyRSxZQUFNLHlCQUF5QixLQUFLLFdBQVcsaUNBQWlDLEtBQUssTUFBTTtBQUUzRixZQUFNLFFBQVEsYUFBYSxjQUFjLEtBQUssOEJBQThCLEtBQUssTUFBTSxJQUFJO0FBQzNGLFlBQU0sbUJBQW1CLEtBQUssZUFBZSxLQUFLLE1BQU0sRUFBRSxvQkFBb0I7QUFDOUUsWUFBTSxPQUFPLGFBQWEsY0FBYyxtQkFBbUI7QUFDM0QsVUFBSSxTQUFTLE1BQU07QUFDbEIsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLEVBQUUsV0FBVyxTQUFTLGVBQWUsT0FBTyxJQUFJLEtBQUssZ0JBQWdCLEtBQUssTUFBTTtBQUV0RixZQUFNLFlBQVksS0FBSyxXQUFXLFVBQVUsS0FBSyxNQUFNO0FBTXZELFlBQU0sTUFBTSxLQUFLLFFBQVEsb0JBQW9CLE1BQU0sVUFBVSxJQUFJLFlBQVk7QUFDN0UsWUFBTSxTQUFTLE1BQU07QUFFckIsWUFBTSxVQUFVLElBQUksS0FBSyxNQUFNLEtBQUssT0FBTyxNQUFNO0FBRWpELGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQSxxQkFBcUIscUJBQXFCO0FBQUEsUUFDMUMsYUFBYSxhQUFhO0FBQUEsUUFDMUIseUJBQXlCLG1CQUFtQixRQUFRLFFBQVE7QUFBQSxNQUM3RDtBQUFBLElBQ0QsQ0FBQyxFQUFFLDhCQUE4QixLQUFLLE1BQU07QUFFNUMsU0FBaUIsbUJBQW1CLEVBQUUsSUFBSTtBQUFBLE1BQ3pDLE9BQU8sRUFBRSxlQUFlLE9BQVE7QUFBQSxJQUNqQyxHQUFHLFFBQVEsTUFBTSxZQUFVO0FBQzFCLFlBQU0sbUJBQW1CLFlBQVksS0FBSyxjQUFjLEVBQUUsS0FBSyxNQUFNO0FBQ3JFLFVBQUksQ0FBQyxrQkFBa0I7QUFBRSxlQUFPO0FBQUEsTUFBVztBQUkzQyxZQUFNLGVBQWUsaUJBQWlCLElBQUksZ0JBQWMsS0FBSztBQUFBLFFBQzVELFdBQVcsY0FBYyxnQkFBZ0I7QUFBQSxRQUN6QyxXQUFXLFFBQVE7QUFBQSxRQUNuQixXQUFXO0FBQUEsUUFDWCxXQUFXLFFBQVE7QUFBQSxNQUNwQixDQUFDLEVBQUUsS0FBSyxNQUFNO0FBRWQsWUFBTSxpQkFBaUIsS0FBSyxPQUFPLElBQUksT0FBSyxHQUFHLGVBQWUsMkJBQTJCLGFBQWEscUNBQXFDLHNCQUFzQixFQUFFLEtBQUssTUFBTTtBQUM5SyxZQUFNLGNBQWMsaUJBQWlCLElBQUksT0FBSyxFQUFFLFFBQVEsV0FBVyxHQUFHLGNBQWMsY0FBYyxFQUFFLHNCQUFzQixJQUFJLFlBQVksRUFBRSxvQkFBb0IsSUFBSSxZQUFZLGFBQWEsTUFBTSxPQUFPLGdCQUFnQixDQUFDLENBQUM7QUFDNU4sWUFBTSxlQUFlLFlBQVksSUFBSSxVQUFRLEtBQUssV0FBVyxnQkFBZ0IsY0FBYyxDQUFDO0FBRTVGLFlBQU0sbUJBQW1CLHlCQUF5QixLQUFLLE9BQU8sS0FBSyxNQUFTLEdBQUcsY0FBYywyQkFBMkIsVUFBVTtBQUNsSSxhQUFPO0FBQUEsUUFDTixFQUFFLElBQUk7QUFBQSxVQUNMLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxZQUNOLEdBQUcsYUFBYSxLQUFLLE1BQU0sRUFBRSxTQUFTO0FBQUEsWUFDdEMsY0FBYztBQUFBLFlBQ2QsUUFBUSxHQUFHLGVBQWUsY0FBYyxZQUFZLGdCQUFnQjtBQUFBLFlBQ3BFLFdBQVc7QUFBQSxVQUNaO0FBQUEsUUFDRCxDQUFDO0FBQUEsUUFDRCxFQUFFLElBQUk7QUFBQSxVQUNMLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxZQUNOLEdBQUcsWUFBWSxLQUFLLE1BQU0sRUFBRSxTQUFTO0FBQUEsWUFDckMsY0FBYztBQUFBLFlBQ2QsUUFBUSx1QkFBdUIsS0FBSyxVQUFVLEVBQUUsSUFBSSxRQUFNLEdBQUcsWUFBWSxZQUFZLGNBQWMsRUFBRSxDQUFDLEVBQUU7QUFBQSxZQUN4RyxXQUFXO0FBQUEsWUFDWCxpQkFBaUIsY0FBYyx1QkFBdUI7QUFBQSxVQUN2RDtBQUFBLFFBQ0QsQ0FBQztBQUFBLFFBQ0QsRUFBRSxJQUFJO0FBQUEsVUFDTCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsWUFDTixHQUFHLGFBQWEsU0FBUztBQUFBLFlBQ3pCLGlCQUFpQjtBQUFBLFVBQ2xCO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQyxDQUFDLEVBQUUsWUFBWSxLQUFLLE1BQU07QUFFM0IsU0FBaUIsUUFBUSxFQUFFLElBQUk7QUFBQSxNQUM5QixPQUFPO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTixVQUFVO0FBQUEsUUFDVixVQUFVO0FBQUEsUUFDVixLQUFLO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFDTixTQUFTLEtBQUs7QUFBQSxNQUNmO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixDQUFDLEtBQUssZ0JBQWdCO0FBQUEsSUFDdkIsQ0FBQyxFQUFFLFlBQVksS0FBSyxNQUFNO0FBNUx6QixTQUFLLGFBQWEscUJBQXFCLEtBQUssT0FBTztBQUVuRCxTQUFLLGlCQUFpQixLQUFLLFVBQVUscUJBQXFCO0FBQUEsTUFDekQ7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMLFFBQVEsWUFBVTtBQUNqQixjQUFNLFlBQVksS0FBSyxXQUFXLEtBQUssTUFBTTtBQUM3QyxZQUFJLENBQUMsV0FBVztBQUNmLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU87QUFBQSxVQUNOO0FBQUEsVUFDQSw2QkFBNkIsQ0FBQyxTQUFTO0FBQUEsVUFFdkM7QUFBQSxVQUNBLFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRDtBQUFBLFFBQ0MsY0FBYyxDQUFDLGFBQWE7QUFBQSxRQUM1QixhQUFhO0FBQUEsUUFDYix3QkFBd0I7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssWUFBWSxLQUFLLGVBQWU7QUFFckMsU0FBSyxVQUFVLEtBQUssZUFBZSxXQUFXLENBQUMsTUFBTTtBQUNwRCxXQUFLLFlBQVksS0FBSyxJQUFJLHFCQUFxQixDQUFDLENBQUM7QUFBQSxJQUNsRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxXQUFXLG9CQUFvQjtBQUFBLE1BQ2xELFNBQVMsS0FBSyxNQUFNO0FBQUEsTUFDcEIsVUFBVSxnQkFBZ0IsSUFBSTtBQUFBLE1BQzlCLHFCQUFxQjtBQUFBLE1BQ3JCLHFCQUFxQixRQUFRLE1BQU0sWUFBVTtBQUM1QyxjQUFNLE9BQU8sS0FBSyxlQUFlLEtBQUssTUFBTTtBQUM1QyxZQUFJLFNBQVMsTUFBTTtBQUFFLGlCQUFPO0FBQUEsUUFBRztBQUMvQixlQUFPLEtBQUs7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFvSkQ7QUE1U2EsMkJBQU47QUFBQSxFQTBHSjtBQUFBLEVBQ0E7QUFBQSxHQTNHVTsiLAogICJuYW1lcyI6IFtdCn0K
