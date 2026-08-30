import "./selections.css";
import { DynamicViewOverlay } from "../../view/dynamicViewOverlay.js";
import { editorSelectionForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
var CornerStyle = /* @__PURE__ */ ((CornerStyle2) => {
  CornerStyle2[CornerStyle2["EXTERN"] = 0] = "EXTERN";
  CornerStyle2[CornerStyle2["INTERN"] = 1] = "INTERN";
  CornerStyle2[CornerStyle2["FLAT"] = 2] = "FLAT";
  return CornerStyle2;
})(CornerStyle || {});
class HorizontalRangeWithStyle {
  constructor(other) {
    this.left = other.left;
    this.width = other.width;
    this.startStyle = null;
    this.endStyle = null;
  }
}
class LineVisibleRangesWithStyle {
  constructor(lineNumber, ranges) {
    this.lineNumber = lineNumber;
    this.ranges = ranges;
  }
}
function toStyledRange(item) {
  return new HorizontalRangeWithStyle(item);
}
function toStyled(item) {
  return new LineVisibleRangesWithStyle(item.lineNumber, item.ranges.map(toStyledRange));
}
const _SelectionsOverlay = class _SelectionsOverlay extends DynamicViewOverlay {
  constructor(context) {
    super();
    this._previousFrameVisibleRangesWithStyle = [];
    this._context = context;
    const options = this._context.configuration.options;
    this._roundedSelection = options.get(EditorOption.roundedSelection);
    this._typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
    this._selections = [];
    this._renderResult = null;
    this._context.addEventHandler(this);
  }
  dispose() {
    this._context.removeEventHandler(this);
    this._renderResult = null;
    super.dispose();
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    const options = this._context.configuration.options;
    this._roundedSelection = options.get(EditorOption.roundedSelection);
    this._typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
    return true;
  }
  onCursorStateChanged(e) {
    this._selections = e.selections.slice(0);
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onFlushed(e) {
    return true;
  }
  onLinesChanged(e) {
    return true;
  }
  onLinesDeleted(e) {
    return true;
  }
  onLinesInserted(e) {
    return true;
  }
  onScrollChanged(e) {
    return e.scrollTopChanged;
  }
  onZonesChanged(e) {
    return true;
  }
  // --- end event handlers
  _visibleRangesHaveGaps(linesVisibleRanges) {
    for (let i = 0, len = linesVisibleRanges.length; i < len; i++) {
      const lineVisibleRanges = linesVisibleRanges[i];
      if (lineVisibleRanges.ranges.length > 1) {
        return true;
      }
    }
    return false;
  }
  _enrichVisibleRangesWithStyle(viewport, linesVisibleRanges, previousFrame) {
    const epsilon = this._typicalHalfwidthCharacterWidth / 4;
    let previousFrameTop = null;
    let previousFrameBottom = null;
    if (previousFrame && previousFrame.length > 0 && linesVisibleRanges.length > 0) {
      const topLineNumber = linesVisibleRanges[0].lineNumber;
      if (topLineNumber === viewport.startLineNumber) {
        for (let i = 0; !previousFrameTop && i < previousFrame.length; i++) {
          if (previousFrame[i].lineNumber === topLineNumber) {
            previousFrameTop = previousFrame[i].ranges[0];
          }
        }
      }
      const bottomLineNumber = linesVisibleRanges[linesVisibleRanges.length - 1].lineNumber;
      if (bottomLineNumber === viewport.endLineNumber) {
        for (let i = previousFrame.length - 1; !previousFrameBottom && i >= 0; i--) {
          if (previousFrame[i].lineNumber === bottomLineNumber) {
            previousFrameBottom = previousFrame[i].ranges[0];
          }
        }
      }
      if (previousFrameTop && !previousFrameTop.startStyle) {
        previousFrameTop = null;
      }
      if (previousFrameBottom && !previousFrameBottom.startStyle) {
        previousFrameBottom = null;
      }
    }
    for (let i = 0, len = linesVisibleRanges.length; i < len; i++) {
      const curLineRange = linesVisibleRanges[i].ranges[0];
      const curLeft = curLineRange.left;
      const curRight = curLineRange.left + curLineRange.width;
      const startStyle = {
        top: 0 /* EXTERN */,
        bottom: 0 /* EXTERN */
      };
      const endStyle = {
        top: 0 /* EXTERN */,
        bottom: 0 /* EXTERN */
      };
      if (i > 0) {
        const prevLeft = linesVisibleRanges[i - 1].ranges[0].left;
        const prevRight = linesVisibleRanges[i - 1].ranges[0].left + linesVisibleRanges[i - 1].ranges[0].width;
        if (abs(curLeft - prevLeft) < epsilon) {
          startStyle.top = 2 /* FLAT */;
        } else if (curLeft > prevLeft) {
          startStyle.top = 1 /* INTERN */;
        }
        if (abs(curRight - prevRight) < epsilon) {
          endStyle.top = 2 /* FLAT */;
        } else if (prevLeft < curRight && curRight < prevRight) {
          endStyle.top = 1 /* INTERN */;
        }
      } else if (previousFrameTop) {
        startStyle.top = previousFrameTop.startStyle.top;
        endStyle.top = previousFrameTop.endStyle.top;
      }
      if (i + 1 < len) {
        const nextLeft = linesVisibleRanges[i + 1].ranges[0].left;
        const nextRight = linesVisibleRanges[i + 1].ranges[0].left + linesVisibleRanges[i + 1].ranges[0].width;
        if (abs(curLeft - nextLeft) < epsilon) {
          startStyle.bottom = 2 /* FLAT */;
        } else if (nextLeft < curLeft && curLeft < nextRight) {
          startStyle.bottom = 1 /* INTERN */;
        }
        if (abs(curRight - nextRight) < epsilon) {
          endStyle.bottom = 2 /* FLAT */;
        } else if (curRight < nextRight) {
          endStyle.bottom = 1 /* INTERN */;
        }
      } else if (previousFrameBottom) {
        startStyle.bottom = previousFrameBottom.startStyle.bottom;
        endStyle.bottom = previousFrameBottom.endStyle.bottom;
      }
      curLineRange.startStyle = startStyle;
      curLineRange.endStyle = endStyle;
    }
  }
  _getVisibleRangesWithStyle(selection, ctx, previousFrame) {
    const _linesVisibleRanges = ctx.linesVisibleRangesForRange(selection, true) || [];
    const linesVisibleRanges = _linesVisibleRanges.map(toStyled);
    const visibleRangesHaveGaps = this._visibleRangesHaveGaps(linesVisibleRanges);
    if (!visibleRangesHaveGaps && this._roundedSelection) {
      this._enrichVisibleRangesWithStyle(ctx.visibleRange, linesVisibleRanges, previousFrame);
    }
    return linesVisibleRanges;
  }
  _createSelectionPiece(top, bottom, className, left, width) {
    return '<div class="cslr ' + className + '" style="top:' + top.toString() + "px;bottom:" + bottom.toString() + "px;left:" + left.toString() + "px;width:" + width.toString() + 'px;"></div>';
  }
  _actualRenderOneSelection(output2, visibleStartLineNumber, hasMultipleSelections, visibleRanges) {
    if (visibleRanges.length === 0) {
      return;
    }
    const visibleRangesHaveStyle = !!visibleRanges[0].ranges[0].startStyle;
    const firstLineNumber = visibleRanges[0].lineNumber;
    const lastLineNumber = visibleRanges[visibleRanges.length - 1].lineNumber;
    for (let i = 0, len = visibleRanges.length; i < len; i++) {
      const lineVisibleRanges = visibleRanges[i];
      const lineNumber = lineVisibleRanges.lineNumber;
      const lineIndex = lineNumber - visibleStartLineNumber;
      const top = hasMultipleSelections ? lineNumber === firstLineNumber ? 1 : 0 : 0;
      const bottom = hasMultipleSelections ? lineNumber !== firstLineNumber && lineNumber === lastLineNumber ? 1 : 0 : 0;
      let innerCornerOutput = "";
      let restOfSelectionOutput = "";
      for (let j = 0, lenJ = lineVisibleRanges.ranges.length; j < lenJ; j++) {
        const visibleRange = lineVisibleRanges.ranges[j];
        if (visibleRangesHaveStyle) {
          const startStyle = visibleRange.startStyle;
          const endStyle = visibleRange.endStyle;
          if (startStyle.top === 1 /* INTERN */ || startStyle.bottom === 1 /* INTERN */) {
            innerCornerOutput += this._createSelectionPiece(top, bottom, _SelectionsOverlay.SELECTION_CLASS_NAME, visibleRange.left - _SelectionsOverlay.ROUNDED_PIECE_WIDTH, _SelectionsOverlay.ROUNDED_PIECE_WIDTH);
            let className2 = _SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME;
            if (startStyle.top === 1 /* INTERN */) {
              className2 += " " + _SelectionsOverlay.SELECTION_TOP_RIGHT;
            }
            if (startStyle.bottom === 1 /* INTERN */) {
              className2 += " " + _SelectionsOverlay.SELECTION_BOTTOM_RIGHT;
            }
            innerCornerOutput += this._createSelectionPiece(top, bottom, className2, visibleRange.left - _SelectionsOverlay.ROUNDED_PIECE_WIDTH, _SelectionsOverlay.ROUNDED_PIECE_WIDTH);
          }
          if (endStyle.top === 1 /* INTERN */ || endStyle.bottom === 1 /* INTERN */) {
            innerCornerOutput += this._createSelectionPiece(top, bottom, _SelectionsOverlay.SELECTION_CLASS_NAME, visibleRange.left + visibleRange.width, _SelectionsOverlay.ROUNDED_PIECE_WIDTH);
            let className2 = _SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME;
            if (endStyle.top === 1 /* INTERN */) {
              className2 += " " + _SelectionsOverlay.SELECTION_TOP_LEFT;
            }
            if (endStyle.bottom === 1 /* INTERN */) {
              className2 += " " + _SelectionsOverlay.SELECTION_BOTTOM_LEFT;
            }
            innerCornerOutput += this._createSelectionPiece(top, bottom, className2, visibleRange.left + visibleRange.width, _SelectionsOverlay.ROUNDED_PIECE_WIDTH);
          }
        }
        let className = _SelectionsOverlay.SELECTION_CLASS_NAME;
        if (visibleRangesHaveStyle) {
          const startStyle = visibleRange.startStyle;
          const endStyle = visibleRange.endStyle;
          if (startStyle.top === 0 /* EXTERN */) {
            className += " " + _SelectionsOverlay.SELECTION_TOP_LEFT;
          }
          if (startStyle.bottom === 0 /* EXTERN */) {
            className += " " + _SelectionsOverlay.SELECTION_BOTTOM_LEFT;
          }
          if (endStyle.top === 0 /* EXTERN */) {
            className += " " + _SelectionsOverlay.SELECTION_TOP_RIGHT;
          }
          if (endStyle.bottom === 0 /* EXTERN */) {
            className += " " + _SelectionsOverlay.SELECTION_BOTTOM_RIGHT;
          }
        }
        restOfSelectionOutput += this._createSelectionPiece(top, bottom, className, visibleRange.left, visibleRange.width);
      }
      output2[lineIndex][0] += innerCornerOutput;
      output2[lineIndex][1] += restOfSelectionOutput;
    }
  }
  prepareRender(ctx) {
    const output = [];
    const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
    const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
    for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
      const lineIndex = lineNumber - visibleStartLineNumber;
      output[lineIndex] = ["", ""];
    }
    const thisFrameVisibleRangesWithStyle = [];
    for (let i = 0, len = this._selections.length; i < len; i++) {
      const selection = this._selections[i];
      if (selection.isEmpty()) {
        thisFrameVisibleRangesWithStyle[i] = null;
        continue;
      }
      const visibleRangesWithStyle = this._getVisibleRangesWithStyle(selection, ctx, this._previousFrameVisibleRangesWithStyle[i]);
      thisFrameVisibleRangesWithStyle[i] = visibleRangesWithStyle;
      this._actualRenderOneSelection(output, visibleStartLineNumber, this._selections.length > 1, visibleRangesWithStyle);
    }
    this._previousFrameVisibleRangesWithStyle = thisFrameVisibleRangesWithStyle;
    this._renderResult = output.map(([internalCorners, restOfSelection]) => internalCorners + restOfSelection);
  }
  render(startLineNumber, lineNumber) {
    if (!this._renderResult) {
      return "";
    }
    const lineIndex = lineNumber - startLineNumber;
    if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
      return "";
    }
    return this._renderResult[lineIndex];
  }
};
_SelectionsOverlay.SELECTION_CLASS_NAME = "selected-text";
_SelectionsOverlay.SELECTION_TOP_LEFT = "top-left-radius";
_SelectionsOverlay.SELECTION_BOTTOM_LEFT = "bottom-left-radius";
_SelectionsOverlay.SELECTION_TOP_RIGHT = "top-right-radius";
_SelectionsOverlay.SELECTION_BOTTOM_RIGHT = "bottom-right-radius";
_SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME = "monaco-editor-background";
_SelectionsOverlay.ROUNDED_PIECE_WIDTH = 10;
let SelectionsOverlay = _SelectionsOverlay;
registerThemingParticipant((theme, collector) => {
  const editorSelectionForegroundColor = theme.getColor(editorSelectionForeground);
  if (editorSelectionForegroundColor && !editorSelectionForegroundColor.isTransparent()) {
    collector.addRule(`.monaco-editor .view-line span.inline-selected-text { color: ${editorSelectionForegroundColor}; }`);
  }
});
function abs(n) {
  return n < 0 ? -n : n;
}
export {
  SelectionsOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdQYXJ0c1xcc2VsZWN0aW9uc1xcc2VsZWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9zZWxlY3Rpb25zLmNzcyc7XG5pbXBvcnQgeyBEeW5hbWljVmlld092ZXJsYXkgfSBmcm9tICcuLi8uLi92aWV3L2R5bmFtaWNWaWV3T3ZlcmxheS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEhvcml6b250YWxSYW5nZSwgTGluZVZpc2libGVSYW5nZXMsIFJlbmRlcmluZ0NvbnRleHQgfSBmcm9tICcuLi8uLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgZWRpdG9yU2VsZWN0aW9uRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuXG5jb25zdCBlbnVtIENvcm5lclN0eWxlIHtcblx0RVhURVJOLFxuXHRJTlRFUk4sXG5cdEZMQVRcbn1cblxuaW50ZXJmYWNlIElWaXNpYmxlUmFuZ2VFbmRQb2ludFN0eWxlIHtcblx0dG9wOiBDb3JuZXJTdHlsZTtcblx0Ym90dG9tOiBDb3JuZXJTdHlsZTtcbn1cblxuY2xhc3MgSG9yaXpvbnRhbFJhbmdlV2l0aFN0eWxlIHtcblx0cHVibGljIGxlZnQ6IG51bWJlcjtcblx0cHVibGljIHdpZHRoOiBudW1iZXI7XG5cdHB1YmxpYyBzdGFydFN0eWxlOiBJVmlzaWJsZVJhbmdlRW5kUG9pbnRTdHlsZSB8IG51bGw7XG5cdHB1YmxpYyBlbmRTdHlsZTogSVZpc2libGVSYW5nZUVuZFBvaW50U3R5bGUgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKG90aGVyOiBIb3Jpem9udGFsUmFuZ2UpIHtcblx0XHR0aGlzLmxlZnQgPSBvdGhlci5sZWZ0O1xuXHRcdHRoaXMud2lkdGggPSBvdGhlci53aWR0aDtcblx0XHR0aGlzLnN0YXJ0U3R5bGUgPSBudWxsO1xuXHRcdHRoaXMuZW5kU3R5bGUgPSBudWxsO1xuXHR9XG59XG5cbmNsYXNzIExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlIHtcblx0cHVibGljIGxpbmVOdW1iZXI6IG51bWJlcjtcblx0cHVibGljIHJhbmdlczogSG9yaXpvbnRhbFJhbmdlV2l0aFN0eWxlW107XG5cblx0Y29uc3RydWN0b3IobGluZU51bWJlcjogbnVtYmVyLCByYW5nZXM6IEhvcml6b250YWxSYW5nZVdpdGhTdHlsZVtdKSB7XG5cdFx0dGhpcy5saW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHR0aGlzLnJhbmdlcyA9IHJhbmdlcztcblx0fVxufVxuXG5mdW5jdGlvbiB0b1N0eWxlZFJhbmdlKGl0ZW06IEhvcml6b250YWxSYW5nZSk6IEhvcml6b250YWxSYW5nZVdpdGhTdHlsZSB7XG5cdHJldHVybiBuZXcgSG9yaXpvbnRhbFJhbmdlV2l0aFN0eWxlKGl0ZW0pO1xufVxuXG5mdW5jdGlvbiB0b1N0eWxlZChpdGVtOiBMaW5lVmlzaWJsZVJhbmdlcyk6IExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlIHtcblx0cmV0dXJuIG5ldyBMaW5lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZShpdGVtLmxpbmVOdW1iZXIsIGl0ZW0ucmFuZ2VzLm1hcCh0b1N0eWxlZFJhbmdlKSk7XG59XG5cbi8qKlxuICogVGhpcyB2aWV3IHBhcnQgZGlzcGxheXMgc2VsZWN0ZWQgdGV4dCB0byB0aGUgdXNlci4gRXZlcnkgbGluZSBoYXMgaXRzIG93biBzZWxlY3Rpb24gb3ZlcmxheS5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlbGVjdGlvbnNPdmVybGF5IGV4dGVuZHMgRHluYW1pY1ZpZXdPdmVybGF5IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRUxFQ1RJT05fQ0xBU1NfTkFNRSA9ICdzZWxlY3RlZC10ZXh0Jztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VMRUNUSU9OX1RPUF9MRUZUID0gJ3RvcC1sZWZ0LXJhZGl1cyc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFTEVDVElPTl9CT1RUT01fTEVGVCA9ICdib3R0b20tbGVmdC1yYWRpdXMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRUxFQ1RJT05fVE9QX1JJR0hUID0gJ3RvcC1yaWdodC1yYWRpdXMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRUxFQ1RJT05fQk9UVE9NX1JJR0hUID0gJ2JvdHRvbS1yaWdodC1yYWRpdXMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFRElUT1JfQkFDS0dST1VORF9DTEFTU19OQU1FID0gJ21vbmFjby1lZGl0b3ItYmFja2dyb3VuZCc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUk9VTkRFRF9QSUVDRV9XSURUSCA9IDEwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHQ6IFZpZXdDb250ZXh0O1xuXHRwcml2YXRlIF9yb3VuZGVkU2VsZWN0aW9uOiBib29sZWFuO1xuXHRwcml2YXRlIF90eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uczogUmFuZ2VbXTtcblx0cHJpdmF0ZSBfcmVuZGVyUmVzdWx0OiBzdHJpbmdbXSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbnRleHQgPSBjb250ZXh0O1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHR0aGlzLl9yb3VuZGVkU2VsZWN0aW9uID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJvdW5kZWRTZWxlY3Rpb24pO1xuXHRcdHRoaXMuX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbykudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdHRoaXMuX3NlbGVjdGlvbnMgPSBbXTtcblx0XHR0aGlzLl9yZW5kZXJSZXN1bHQgPSBudWxsO1xuXHRcdHRoaXMuX2NvbnRleHQuYWRkRXZlbnRIYW5kbGVyKHRoaXMpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dC5yZW1vdmVFdmVudEhhbmRsZXIodGhpcyk7XG5cdFx0dGhpcy5fcmVuZGVyUmVzdWx0ID0gbnVsbDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvLyAtLS0gYmVnaW4gZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdHRoaXMuX3JvdW5kZWRTZWxlY3Rpb24gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucm91bmRlZFNlbGVjdGlvbik7XG5cdFx0dGhpcy5fdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0N1cnNvclN0YXRlQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fc2VsZWN0aW9ucyA9IGUuc2VsZWN0aW9ucy5zbGljZSgwKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25EZWNvcmF0aW9uc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHQvLyB0cnVlIGZvciBpbmxpbmUgZGVjb3JhdGlvbnMgdGhhdCBjYW4gZW5kIHVwIHJlbGF5b3V0aW5nIHRleHRcblx0XHRyZXR1cm4gdHJ1ZTsvL2UuaW5saW5lRGVjb3JhdGlvbnNDaGFuZ2VkO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkZsdXNoZWQoZTogdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNEZWxldGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNJbnNlcnRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25TY3JvbGxDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1Njcm9sbENoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlLnNjcm9sbFRvcENoYW5nZWQ7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uWm9uZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLS0gZW5kIGV2ZW50IGhhbmRsZXJzXG5cblx0cHJpdmF0ZSBfdmlzaWJsZVJhbmdlc0hhdmVHYXBzKGxpbmVzVmlzaWJsZVJhbmdlczogTGluZVZpc2libGVSYW5nZXNXaXRoU3R5bGVbXSk6IGJvb2xlYW4ge1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzVmlzaWJsZVJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZVZpc2libGVSYW5nZXMgPSBsaW5lc1Zpc2libGVSYW5nZXNbaV07XG5cblx0XHRcdGlmIChsaW5lVmlzaWJsZVJhbmdlcy5yYW5nZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHQvLyBUaGVyZSBhcmUgdHdvIHJhbmdlcyBvbiB0aGUgc2FtZSBsaW5lXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2VucmljaFZpc2libGVSYW5nZXNXaXRoU3R5bGUodmlld3BvcnQ6IFJhbmdlLCBsaW5lc1Zpc2libGVSYW5nZXM6IExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW10sIHByZXZpb3VzRnJhbWU6IExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW10gfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgZXBzaWxvbiA9IHRoaXMuX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCAvIDQ7XG5cdFx0bGV0IHByZXZpb3VzRnJhbWVUb3A6IEhvcml6b250YWxSYW5nZVdpdGhTdHlsZSB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBwcmV2aW91c0ZyYW1lQm90dG9tOiBIb3Jpem9udGFsUmFuZ2VXaXRoU3R5bGUgfCBudWxsID0gbnVsbDtcblxuXHRcdGlmIChwcmV2aW91c0ZyYW1lICYmIHByZXZpb3VzRnJhbWUubGVuZ3RoID4gMCAmJiBsaW5lc1Zpc2libGVSYW5nZXMubGVuZ3RoID4gMCkge1xuXG5cdFx0XHRjb25zdCB0b3BMaW5lTnVtYmVyID0gbGluZXNWaXNpYmxlUmFuZ2VzWzBdLmxpbmVOdW1iZXI7XG5cdFx0XHRpZiAodG9wTGluZU51bWJlciA9PT0gdmlld3BvcnQuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyAhcHJldmlvdXNGcmFtZVRvcCAmJiBpIDwgcHJldmlvdXNGcmFtZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmIChwcmV2aW91c0ZyYW1lW2ldLmxpbmVOdW1iZXIgPT09IHRvcExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHByZXZpb3VzRnJhbWVUb3AgPSBwcmV2aW91c0ZyYW1lW2ldLnJhbmdlc1swXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYm90dG9tTGluZU51bWJlciA9IGxpbmVzVmlzaWJsZVJhbmdlc1tsaW5lc1Zpc2libGVSYW5nZXMubGVuZ3RoIC0gMV0ubGluZU51bWJlcjtcblx0XHRcdGlmIChib3R0b21MaW5lTnVtYmVyID09PSB2aWV3cG9ydC5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSBwcmV2aW91c0ZyYW1lLmxlbmd0aCAtIDE7ICFwcmV2aW91c0ZyYW1lQm90dG9tICYmIGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0aWYgKHByZXZpb3VzRnJhbWVbaV0ubGluZU51bWJlciA9PT0gYm90dG9tTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0cHJldmlvdXNGcmFtZUJvdHRvbSA9IHByZXZpb3VzRnJhbWVbaV0ucmFuZ2VzWzBdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldmlvdXNGcmFtZVRvcCAmJiAhcHJldmlvdXNGcmFtZVRvcC5zdGFydFN0eWxlKSB7XG5cdFx0XHRcdHByZXZpb3VzRnJhbWVUb3AgPSBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByZXZpb3VzRnJhbWVCb3R0b20gJiYgIXByZXZpb3VzRnJhbWVCb3R0b20uc3RhcnRTdHlsZSkge1xuXHRcdFx0XHRwcmV2aW91c0ZyYW1lQm90dG9tID0gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZXNWaXNpYmxlUmFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHQvLyBXZSBrbm93IGZvciBhIGZhY3QgdGhhdCB0aGVyZSBpcyBwcmVjaXNlbHkgb25lIHJhbmdlIG9uIGVhY2ggbGluZVxuXHRcdFx0Y29uc3QgY3VyTGluZVJhbmdlID0gbGluZXNWaXNpYmxlUmFuZ2VzW2ldLnJhbmdlc1swXTtcblx0XHRcdGNvbnN0IGN1ckxlZnQgPSBjdXJMaW5lUmFuZ2UubGVmdDtcblx0XHRcdGNvbnN0IGN1clJpZ2h0ID0gY3VyTGluZVJhbmdlLmxlZnQgKyBjdXJMaW5lUmFuZ2Uud2lkdGg7XG5cblx0XHRcdGNvbnN0IHN0YXJ0U3R5bGUgPSB7XG5cdFx0XHRcdHRvcDogQ29ybmVyU3R5bGUuRVhURVJOLFxuXHRcdFx0XHRib3R0b206IENvcm5lclN0eWxlLkVYVEVSTlxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZW5kU3R5bGUgPSB7XG5cdFx0XHRcdHRvcDogQ29ybmVyU3R5bGUuRVhURVJOLFxuXHRcdFx0XHRib3R0b206IENvcm5lclN0eWxlLkVYVEVSTlxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGkgPiAwKSB7XG5cdFx0XHRcdC8vIExvb2sgYWJvdmVcblx0XHRcdFx0Y29uc3QgcHJldkxlZnQgPSBsaW5lc1Zpc2libGVSYW5nZXNbaSAtIDFdLnJhbmdlc1swXS5sZWZ0O1xuXHRcdFx0XHRjb25zdCBwcmV2UmlnaHQgPSBsaW5lc1Zpc2libGVSYW5nZXNbaSAtIDFdLnJhbmdlc1swXS5sZWZ0ICsgbGluZXNWaXNpYmxlUmFuZ2VzW2kgLSAxXS5yYW5nZXNbMF0ud2lkdGg7XG5cblx0XHRcdFx0aWYgKGFicyhjdXJMZWZ0IC0gcHJldkxlZnQpIDwgZXBzaWxvbikge1xuXHRcdFx0XHRcdHN0YXJ0U3R5bGUudG9wID0gQ29ybmVyU3R5bGUuRkxBVDtcblx0XHRcdFx0fSBlbHNlIGlmIChjdXJMZWZ0ID4gcHJldkxlZnQpIHtcblx0XHRcdFx0XHRzdGFydFN0eWxlLnRvcCA9IENvcm5lclN0eWxlLklOVEVSTjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhYnMoY3VyUmlnaHQgLSBwcmV2UmlnaHQpIDwgZXBzaWxvbikge1xuXHRcdFx0XHRcdGVuZFN0eWxlLnRvcCA9IENvcm5lclN0eWxlLkZMQVQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJldkxlZnQgPCBjdXJSaWdodCAmJiBjdXJSaWdodCA8IHByZXZSaWdodCkge1xuXHRcdFx0XHRcdGVuZFN0eWxlLnRvcCA9IENvcm5lclN0eWxlLklOVEVSTjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChwcmV2aW91c0ZyYW1lVG9wKSB7XG5cdFx0XHRcdC8vIEFjY2VwdCBzb21lIGhpY2N1cHMgbmVhciB0aGUgdmlld3BvcnQgZWRnZXMgdG8gc2F2ZSBvbiByZXBhaW50c1xuXHRcdFx0XHRzdGFydFN0eWxlLnRvcCA9IHByZXZpb3VzRnJhbWVUb3Auc3RhcnRTdHlsZSEudG9wO1xuXHRcdFx0XHRlbmRTdHlsZS50b3AgPSBwcmV2aW91c0ZyYW1lVG9wLmVuZFN0eWxlIS50b3A7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpICsgMSA8IGxlbikge1xuXHRcdFx0XHQvLyBMb29rIGJlbG93XG5cdFx0XHRcdGNvbnN0IG5leHRMZWZ0ID0gbGluZXNWaXNpYmxlUmFuZ2VzW2kgKyAxXS5yYW5nZXNbMF0ubGVmdDtcblx0XHRcdFx0Y29uc3QgbmV4dFJpZ2h0ID0gbGluZXNWaXNpYmxlUmFuZ2VzW2kgKyAxXS5yYW5nZXNbMF0ubGVmdCArIGxpbmVzVmlzaWJsZVJhbmdlc1tpICsgMV0ucmFuZ2VzWzBdLndpZHRoO1xuXG5cdFx0XHRcdGlmIChhYnMoY3VyTGVmdCAtIG5leHRMZWZ0KSA8IGVwc2lsb24pIHtcblx0XHRcdFx0XHRzdGFydFN0eWxlLmJvdHRvbSA9IENvcm5lclN0eWxlLkZMQVQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dExlZnQgPCBjdXJMZWZ0ICYmIGN1ckxlZnQgPCBuZXh0UmlnaHQpIHtcblx0XHRcdFx0XHRzdGFydFN0eWxlLmJvdHRvbSA9IENvcm5lclN0eWxlLklOVEVSTjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhYnMoY3VyUmlnaHQgLSBuZXh0UmlnaHQpIDwgZXBzaWxvbikge1xuXHRcdFx0XHRcdGVuZFN0eWxlLmJvdHRvbSA9IENvcm5lclN0eWxlLkZMQVQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY3VyUmlnaHQgPCBuZXh0UmlnaHQpIHtcblx0XHRcdFx0XHRlbmRTdHlsZS5ib3R0b20gPSBDb3JuZXJTdHlsZS5JTlRFUk47XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocHJldmlvdXNGcmFtZUJvdHRvbSkge1xuXHRcdFx0XHQvLyBBY2NlcHQgc29tZSBoaWNjdXBzIG5lYXIgdGhlIHZpZXdwb3J0IGVkZ2VzIHRvIHNhdmUgb24gcmVwYWludHNcblx0XHRcdFx0c3RhcnRTdHlsZS5ib3R0b20gPSBwcmV2aW91c0ZyYW1lQm90dG9tLnN0YXJ0U3R5bGUhLmJvdHRvbTtcblx0XHRcdFx0ZW5kU3R5bGUuYm90dG9tID0gcHJldmlvdXNGcmFtZUJvdHRvbS5lbmRTdHlsZSEuYm90dG9tO1xuXHRcdFx0fVxuXG5cdFx0XHRjdXJMaW5lUmFuZ2Uuc3RhcnRTdHlsZSA9IHN0YXJ0U3R5bGU7XG5cdFx0XHRjdXJMaW5lUmFuZ2UuZW5kU3R5bGUgPSBlbmRTdHlsZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlKHNlbGVjdGlvbjogUmFuZ2UsIGN0eDogUmVuZGVyaW5nQ29udGV4dCwgcHJldmlvdXNGcmFtZTogTGluZVZpc2libGVSYW5nZXNXaXRoU3R5bGVbXSB8IG51bGwpOiBMaW5lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZVtdIHtcblx0XHRjb25zdCBfbGluZXNWaXNpYmxlUmFuZ2VzID0gY3R4LmxpbmVzVmlzaWJsZVJhbmdlc0ZvclJhbmdlKHNlbGVjdGlvbiwgdHJ1ZSkgfHwgW107XG5cdFx0Y29uc3QgbGluZXNWaXNpYmxlUmFuZ2VzID0gX2xpbmVzVmlzaWJsZVJhbmdlcy5tYXAodG9TdHlsZWQpO1xuXHRcdGNvbnN0IHZpc2libGVSYW5nZXNIYXZlR2FwcyA9IHRoaXMuX3Zpc2libGVSYW5nZXNIYXZlR2FwcyhsaW5lc1Zpc2libGVSYW5nZXMpO1xuXG5cdFx0aWYgKCF2aXNpYmxlUmFuZ2VzSGF2ZUdhcHMgJiYgdGhpcy5fcm91bmRlZFNlbGVjdGlvbikge1xuXHRcdFx0dGhpcy5fZW5yaWNoVmlzaWJsZVJhbmdlc1dpdGhTdHlsZShjdHgudmlzaWJsZVJhbmdlLCBsaW5lc1Zpc2libGVSYW5nZXMsIHByZXZpb3VzRnJhbWUpO1xuXHRcdH1cblxuXHRcdC8vIFRoZSB2aXNpYmxlIHJhbmdlcyBhcmUgc29ydGVkIFRPUC1CT1RUT00gYW5kIExFRlQtUklHSFRcblx0XHRyZXR1cm4gbGluZXNWaXNpYmxlUmFuZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlU2VsZWN0aW9uUGllY2UodG9wOiBudW1iZXIsIGJvdHRvbTogbnVtYmVyLCBjbGFzc05hbWU6IHN0cmluZywgbGVmdDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0JzxkaXYgY2xhc3M9XCJjc2xyICdcblx0XHRcdCsgY2xhc3NOYW1lXG5cdFx0XHQrICdcIiBzdHlsZT1cIidcblx0XHRcdCsgJ3RvcDonICsgdG9wLnRvU3RyaW5nKCkgKyAncHg7J1xuXHRcdFx0KyAnYm90dG9tOicgKyBib3R0b20udG9TdHJpbmcoKSArICdweDsnXG5cdFx0XHQrICdsZWZ0OicgKyBsZWZ0LnRvU3RyaW5nKCkgKyAncHg7J1xuXHRcdFx0KyAnd2lkdGg6JyArIHdpZHRoLnRvU3RyaW5nKCkgKyAncHg7J1xuXHRcdFx0KyAnXCI+PC9kaXY+J1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9hY3R1YWxSZW5kZXJPbmVTZWxlY3Rpb24ob3V0cHV0MjogW3N0cmluZywgc3RyaW5nXVtdLCB2aXNpYmxlU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGhhc011bHRpcGxlU2VsZWN0aW9uczogYm9vbGVhbiwgdmlzaWJsZVJhbmdlczogTGluZVZpc2libGVSYW5nZXNXaXRoU3R5bGVbXSk6IHZvaWQge1xuXHRcdGlmICh2aXNpYmxlUmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpc2libGVSYW5nZXNIYXZlU3R5bGUgPSAhIXZpc2libGVSYW5nZXNbMF0ucmFuZ2VzWzBdLnN0YXJ0U3R5bGU7XG5cblx0XHRjb25zdCBmaXJzdExpbmVOdW1iZXIgPSB2aXNpYmxlUmFuZ2VzWzBdLmxpbmVOdW1iZXI7XG5cdFx0Y29uc3QgbGFzdExpbmVOdW1iZXIgPSB2aXNpYmxlUmFuZ2VzW3Zpc2libGVSYW5nZXMubGVuZ3RoIC0gMV0ubGluZU51bWJlcjtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB2aXNpYmxlUmFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lVmlzaWJsZVJhbmdlcyA9IHZpc2libGVSYW5nZXNbaV07XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gbGluZVZpc2libGVSYW5nZXMubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSB2aXNpYmxlU3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0XHRjb25zdCB0b3AgPSBoYXNNdWx0aXBsZVNlbGVjdGlvbnMgPyAobGluZU51bWJlciA9PT0gZmlyc3RMaW5lTnVtYmVyID8gMSA6IDApIDogMDtcblx0XHRcdGNvbnN0IGJvdHRvbSA9IGhhc011bHRpcGxlU2VsZWN0aW9ucyA/IChsaW5lTnVtYmVyICE9PSBmaXJzdExpbmVOdW1iZXIgJiYgbGluZU51bWJlciA9PT0gbGFzdExpbmVOdW1iZXIgPyAxIDogMCkgOiAwO1xuXG5cdFx0XHRsZXQgaW5uZXJDb3JuZXJPdXRwdXQgPSAnJztcblx0XHRcdGxldCByZXN0T2ZTZWxlY3Rpb25PdXRwdXQgPSAnJztcblxuXHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSBsaW5lVmlzaWJsZVJhbmdlcy5yYW5nZXMubGVuZ3RoOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVSYW5nZSA9IGxpbmVWaXNpYmxlUmFuZ2VzLnJhbmdlc1tqXTtcblxuXHRcdFx0XHRpZiAodmlzaWJsZVJhbmdlc0hhdmVTdHlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0U3R5bGUgPSB2aXNpYmxlUmFuZ2Uuc3RhcnRTdHlsZSE7XG5cdFx0XHRcdFx0Y29uc3QgZW5kU3R5bGUgPSB2aXNpYmxlUmFuZ2UuZW5kU3R5bGUhO1xuXHRcdFx0XHRcdGlmIChzdGFydFN0eWxlLnRvcCA9PT0gQ29ybmVyU3R5bGUuSU5URVJOIHx8IHN0YXJ0U3R5bGUuYm90dG9tID09PSBDb3JuZXJTdHlsZS5JTlRFUk4pIHtcblx0XHRcdFx0XHRcdC8vIFJldmVyc2Ugcm91bmRlZCBjb3JuZXIgdG8gdGhlIGxlZnRcblxuXHRcdFx0XHRcdFx0Ly8gRmlyc3QgY29tZXMgdGhlIHNlbGVjdGlvbiAoYmx1ZSBsYXllcilcblx0XHRcdFx0XHRcdGlubmVyQ29ybmVyT3V0cHV0ICs9IHRoaXMuX2NyZWF0ZVNlbGVjdGlvblBpZWNlKHRvcCwgYm90dG9tLCBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fQ0xBU1NfTkFNRSwgdmlzaWJsZVJhbmdlLmxlZnQgLSBTZWxlY3Rpb25zT3ZlcmxheS5ST1VOREVEX1BJRUNFX1dJRFRILCBTZWxlY3Rpb25zT3ZlcmxheS5ST1VOREVEX1BJRUNFX1dJRFRIKTtcblxuXHRcdFx0XHRcdFx0Ly8gU2Vjb25kIGNvbWVzIHRoZSBiYWNrZ3JvdW5kICh3aGl0ZSBsYXllcikgd2l0aCBpbnZlcnNlIGJvcmRlciByYWRpdXNcblx0XHRcdFx0XHRcdGxldCBjbGFzc05hbWUgPSBTZWxlY3Rpb25zT3ZlcmxheS5FRElUT1JfQkFDS0dST1VORF9DTEFTU19OQU1FO1xuXHRcdFx0XHRcdFx0aWYgKHN0YXJ0U3R5bGUudG9wID09PSBDb3JuZXJTdHlsZS5JTlRFUk4pIHtcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lICs9ICcgJyArIFNlbGVjdGlvbnNPdmVybGF5LlNFTEVDVElPTl9UT1BfUklHSFQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoc3RhcnRTdHlsZS5ib3R0b20gPT09IENvcm5lclN0eWxlLklOVEVSTikge1xuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWUgKz0gJyAnICsgU2VsZWN0aW9uc092ZXJsYXkuU0VMRUNUSU9OX0JPVFRPTV9SSUdIVDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlubmVyQ29ybmVyT3V0cHV0ICs9IHRoaXMuX2NyZWF0ZVNlbGVjdGlvblBpZWNlKHRvcCwgYm90dG9tLCBjbGFzc05hbWUsIHZpc2libGVSYW5nZS5sZWZ0IC0gU2VsZWN0aW9uc092ZXJsYXkuUk9VTkRFRF9QSUVDRV9XSURUSCwgU2VsZWN0aW9uc092ZXJsYXkuUk9VTkRFRF9QSUVDRV9XSURUSCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbmRTdHlsZS50b3AgPT09IENvcm5lclN0eWxlLklOVEVSTiB8fCBlbmRTdHlsZS5ib3R0b20gPT09IENvcm5lclN0eWxlLklOVEVSTikge1xuXHRcdFx0XHRcdFx0Ly8gUmV2ZXJzZSByb3VuZGVkIGNvcm5lciB0byB0aGUgcmlnaHRcblxuXHRcdFx0XHRcdFx0Ly8gRmlyc3QgY29tZXMgdGhlIHNlbGVjdGlvbiAoYmx1ZSBsYXllcilcblx0XHRcdFx0XHRcdGlubmVyQ29ybmVyT3V0cHV0ICs9IHRoaXMuX2NyZWF0ZVNlbGVjdGlvblBpZWNlKHRvcCwgYm90dG9tLCBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fQ0xBU1NfTkFNRSwgdmlzaWJsZVJhbmdlLmxlZnQgKyB2aXNpYmxlUmFuZ2Uud2lkdGgsIFNlbGVjdGlvbnNPdmVybGF5LlJPVU5ERURfUElFQ0VfV0lEVEgpO1xuXG5cdFx0XHRcdFx0XHQvLyBTZWNvbmQgY29tZXMgdGhlIGJhY2tncm91bmQgKHdoaXRlIGxheWVyKSB3aXRoIGludmVyc2UgYm9yZGVyIHJhZGl1c1xuXHRcdFx0XHRcdFx0bGV0IGNsYXNzTmFtZSA9IFNlbGVjdGlvbnNPdmVybGF5LkVESVRPUl9CQUNLR1JPVU5EX0NMQVNTX05BTUU7XG5cdFx0XHRcdFx0XHRpZiAoZW5kU3R5bGUudG9wID09PSBDb3JuZXJTdHlsZS5JTlRFUk4pIHtcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lICs9ICcgJyArIFNlbGVjdGlvbnNPdmVybGF5LlNFTEVDVElPTl9UT1BfTEVGVDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbmRTdHlsZS5ib3R0b20gPT09IENvcm5lclN0eWxlLklOVEVSTikge1xuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWUgKz0gJyAnICsgU2VsZWN0aW9uc092ZXJsYXkuU0VMRUNUSU9OX0JPVFRPTV9MRUZUO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aW5uZXJDb3JuZXJPdXRwdXQgKz0gdGhpcy5fY3JlYXRlU2VsZWN0aW9uUGllY2UodG9wLCBib3R0b20sIGNsYXNzTmFtZSwgdmlzaWJsZVJhbmdlLmxlZnQgKyB2aXNpYmxlUmFuZ2Uud2lkdGgsIFNlbGVjdGlvbnNPdmVybGF5LlJPVU5ERURfUElFQ0VfV0lEVEgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBjbGFzc05hbWUgPSBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fQ0xBU1NfTkFNRTtcblx0XHRcdFx0aWYgKHZpc2libGVSYW5nZXNIYXZlU3R5bGUpIHtcblx0XHRcdFx0XHRjb25zdCBzdGFydFN0eWxlID0gdmlzaWJsZVJhbmdlLnN0YXJ0U3R5bGUhO1xuXHRcdFx0XHRcdGNvbnN0IGVuZFN0eWxlID0gdmlzaWJsZVJhbmdlLmVuZFN0eWxlITtcblx0XHRcdFx0XHRpZiAoc3RhcnRTdHlsZS50b3AgPT09IENvcm5lclN0eWxlLkVYVEVSTikge1xuXHRcdFx0XHRcdFx0Y2xhc3NOYW1lICs9ICcgJyArIFNlbGVjdGlvbnNPdmVybGF5LlNFTEVDVElPTl9UT1BfTEVGVDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHN0YXJ0U3R5bGUuYm90dG9tID09PSBDb3JuZXJTdHlsZS5FWFRFUk4pIHtcblx0XHRcdFx0XHRcdGNsYXNzTmFtZSArPSAnICcgKyBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fQk9UVE9NX0xFRlQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbmRTdHlsZS50b3AgPT09IENvcm5lclN0eWxlLkVYVEVSTikge1xuXHRcdFx0XHRcdFx0Y2xhc3NOYW1lICs9ICcgJyArIFNlbGVjdGlvbnNPdmVybGF5LlNFTEVDVElPTl9UT1BfUklHSFQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbmRTdHlsZS5ib3R0b20gPT09IENvcm5lclN0eWxlLkVYVEVSTikge1xuXHRcdFx0XHRcdFx0Y2xhc3NOYW1lICs9ICcgJyArIFNlbGVjdGlvbnNPdmVybGF5LlNFTEVDVElPTl9CT1RUT01fUklHSFQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3RPZlNlbGVjdGlvbk91dHB1dCArPSB0aGlzLl9jcmVhdGVTZWxlY3Rpb25QaWVjZSh0b3AsIGJvdHRvbSwgY2xhc3NOYW1lLCB2aXNpYmxlUmFuZ2UubGVmdCwgdmlzaWJsZVJhbmdlLndpZHRoKTtcblx0XHRcdH1cblxuXHRcdFx0b3V0cHV0MltsaW5lSW5kZXhdWzBdICs9IGlubmVyQ29ybmVyT3V0cHV0O1xuXHRcdFx0b3V0cHV0MltsaW5lSW5kZXhdWzFdICs9IHJlc3RPZlNlbGVjdGlvbk91dHB1dDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wcmV2aW91c0ZyYW1lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZTogKExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW10gfCBudWxsKVtdID0gW107XG5cdHB1YmxpYyBwcmVwYXJlUmVuZGVyKGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXG5cdFx0Ly8gQnVpbGQgSFRNTCBmb3IgaW5uZXIgY29ybmVycyBzZXBhcmF0ZSBmcm9tIEhUTUwgZm9yIHRoZSByZXN0IG9mIHNlbGVjdGlvbnMsXG5cdFx0Ly8gYXMgdGhlIGlubmVyIGNvcm5lciBIVE1MIGNhbiBpbnRlcmZlcmUgd2l0aCB0aGF0IG9mIG90aGVyIHNlbGVjdGlvbnMuXG5cdFx0Ly8gSW4gZmluYWwgcmVuZGVyLCBtYWtlIHN1cmUgdG8gcGxhY2UgdGhlIGlubmVyIGNvcm5lciBIVE1MIGJlZm9yZSB0aGUgcmVzdCBvZiBzZWxlY3Rpb24gSFRNTC4gU2VlIGlzc3VlICM3Nzc3Ny5cblx0XHRjb25zdCBvdXRwdXQ6IFtzdHJpbmcsIHN0cmluZ11bXSA9IFtdO1xuXHRcdGNvbnN0IHZpc2libGVTdGFydExpbmVOdW1iZXIgPSBjdHgudmlzaWJsZVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCB2aXNpYmxlRW5kTGluZU51bWJlciA9IGN0eC52aXNpYmxlUmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gdmlzaWJsZVN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSB2aXNpYmxlRW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gdmlzaWJsZVN0YXJ0TGluZU51bWJlcjtcblx0XHRcdG91dHB1dFtsaW5lSW5kZXhdID0gWycnLCAnJ107XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGhpc0ZyYW1lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZTogKExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW10gfCBudWxsKVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3NlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX3NlbGVjdGlvbnNbaV07XG5cdFx0XHRpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHR0aGlzRnJhbWVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW2ldID0gbnVsbDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpc2libGVSYW5nZXNXaXRoU3R5bGUgPSB0aGlzLl9nZXRWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlKHNlbGVjdGlvbiwgY3R4LCB0aGlzLl9wcmV2aW91c0ZyYW1lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZVtpXSk7XG5cdFx0XHR0aGlzRnJhbWVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW2ldID0gdmlzaWJsZVJhbmdlc1dpdGhTdHlsZTtcblx0XHRcdHRoaXMuX2FjdHVhbFJlbmRlck9uZVNlbGVjdGlvbihvdXRwdXQsIHZpc2libGVTdGFydExpbmVOdW1iZXIsIHRoaXMuX3NlbGVjdGlvbnMubGVuZ3RoID4gMSwgdmlzaWJsZVJhbmdlc1dpdGhTdHlsZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJldmlvdXNGcmFtZVZpc2libGVSYW5nZXNXaXRoU3R5bGUgPSB0aGlzRnJhbWVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlO1xuXHRcdHRoaXMuX3JlbmRlclJlc3VsdCA9IG91dHB1dC5tYXAoKFtpbnRlcm5hbENvcm5lcnMsIHJlc3RPZlNlbGVjdGlvbl0pID0+IGludGVybmFsQ29ybmVycyArIHJlc3RPZlNlbGVjdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fcmVuZGVyUmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXI7XG5cdFx0aWYgKGxpbmVJbmRleCA8IDAgfHwgbGluZUluZGV4ID49IHRoaXMuX3JlbmRlclJlc3VsdC5sZW5ndGgpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlclJlc3VsdFtsaW5lSW5kZXhdO1xuXHR9XG59XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IGVkaXRvclNlbGVjdGlvbkZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvclNlbGVjdGlvbkZvcmVncm91bmQpO1xuXHRpZiAoZWRpdG9yU2VsZWN0aW9uRm9yZWdyb3VuZENvbG9yICYmICFlZGl0b3JTZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3IuaXNUcmFuc3BhcmVudCgpKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC52aWV3LWxpbmUgc3Bhbi5pbmxpbmUtc2VsZWN0ZWQtdGV4dCB7IGNvbG9yOiAke2VkaXRvclNlbGVjdGlvbkZvcmVncm91bmRDb2xvcn07IH1gKTtcblx0fVxufSk7XG5cbmZ1bmN0aW9uIGFicyhuOiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gbiA8IDAgPyAtbiA6IG47XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPO0FBQ1AsU0FBUywwQkFBMEI7QUFLbkMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxvQkFBb0I7QUFFN0IsSUFBVyxjQUFYLGtCQUFXQSxpQkFBWDtBQUNDLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQUhVLFNBQUFBO0FBQUEsR0FBQTtBQVdYLE1BQU0seUJBQXlCO0FBQUEsRUFNOUIsWUFBWSxPQUF3QjtBQUNuQyxTQUFLLE9BQU8sTUFBTTtBQUNsQixTQUFLLFFBQVEsTUFBTTtBQUNuQixTQUFLLGFBQWE7QUFDbEIsU0FBSyxXQUFXO0FBQUEsRUFDakI7QUFDRDtBQUVBLE1BQU0sMkJBQTJCO0FBQUEsRUFJaEMsWUFBWSxZQUFvQixRQUFvQztBQUNuRSxTQUFLLGFBQWE7QUFDbEIsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUNEO0FBRUEsU0FBUyxjQUFjLE1BQWlEO0FBQ3ZFLFNBQU8sSUFBSSx5QkFBeUIsSUFBSTtBQUN6QztBQUVBLFNBQVMsU0FBUyxNQUFxRDtBQUN0RSxTQUFPLElBQUksMkJBQTJCLEtBQUssWUFBWSxLQUFLLE9BQU8sSUFBSSxhQUFhLENBQUM7QUFDdEY7QUFLTyxNQUFNLHFCQUFOLE1BQU0s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Q0FBQyxLQUFLO0FBQ3pCLGNBQVEsU0FBUyxFQUFFLENBQUMsS0FBSztBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUFBLEVBR08sY0FBYyxLQUE2QjtBQUtqRCxVQUFNLFNBQTZCLENBQUM7QUFDcEMsVUFBTSx5QkFBeUIsSUFBSSxhQUFhO0FBQ2hELFVBQU0sdUJBQXVCLElBQUksYUFBYTtBQUM5QyxhQUFTLGFBQWEsd0JBQXdCLGNBQWMsc0JBQXNCLGNBQWM7QUFDL0YsWUFBTSxZQUFZLGFBQWE7QUFDL0IsYUFBTyxTQUFTLElBQUksQ0FBQyxJQUFJLEVBQUU7QUFBQSxJQUM1QjtBQUVBLFVBQU0sa0NBQTJFLENBQUM7QUFDbEYsYUFBUyxJQUFJLEdBQUcsTUFBTSxLQUFLLFlBQVksUUFBUSxJQUFJLEtBQUssS0FBSztBQUM1RCxZQUFNLFlBQVksS0FBSyxZQUFZLENBQUM7QUFDcEMsVUFBSSxVQUFVLFFBQVEsR0FBRztBQUN4Qix3Q0FBZ0MsQ0FBQyxJQUFJO0FBQ3JDO0FBQUEsTUFDRDtBQUVBLFlBQU0seUJBQXlCLEtBQUssMkJBQTJCLFdBQVcsS0FBSyxLQUFLLHFDQUFxQyxDQUFDLENBQUM7QUFDM0gsc0NBQWdDLENBQUMsSUFBSTtBQUNyQyxXQUFLLDBCQUEwQixRQUFRLHdCQUF3QixLQUFLLFlBQVksU0FBUyxHQUFHLHNCQUFzQjtBQUFBLElBQ25IO0FBRUEsU0FBSyx1Q0FBdUM7QUFDNUMsU0FBSyxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsQ0FBQyxpQkFBaUIsZUFBZSxNQUFNLGtCQUFrQixlQUFlO0FBQUEsRUFDMUc7QUFBQSxFQUVPLE9BQU8saUJBQXlCLFlBQTRCO0FBQ2xFLFFBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFlBQVksYUFBYTtBQUMvQixRQUFJLFlBQVksS0FBSyxhQUFhLEtBQUssY0FBYyxRQUFRO0FBQzVELGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLGNBQWMsU0FBUztBQUFBLEVBQ3BDO0FBQ0Q7QUFoVmEsbUJBRVksdUJBQXVCO0FBRm5DLG1CQUdZLHFCQUFxQjtBQUhqQyxtQkFJWSx3QkFBd0I7QUFKcEMsbUJBS1ksc0JBQXNCO0FBTGxDLG1CQU1ZLHlCQUF5QjtBQU5yQyxtQkFPWSwrQkFBK0I7QUFQM0MsbUJBU1ksc0JBQXNCO0FBVHhDLElBQU0sb0JBQU47QUFrVlAsMkJBQTJCLENBQUMsT0FBTyxjQUFjO0FBQ2hELFFBQU0saUNBQWlDLE1BQU0sU0FBUyx5QkFBeUI7QUFDL0UsTUFBSSxrQ0FBa0MsQ0FBQywrQkFBK0IsY0FBYyxHQUFHO0FBQ3RGLGNBQVUsUUFBUSxnRUFBZ0UsOEJBQThCLEtBQUs7QUFBQSxFQUN0SDtBQUNELENBQUM7QUFFRCxTQUFTLElBQUksR0FBbUI7QUFDL0IsU0FBTyxJQUFJLElBQUksQ0FBQyxJQUFJO0FBQ3JCOyIsCiAgIm5hbWVzIjogWyJDb3JuZXJTdHlsZSIsICJjbGFzc05hbWUiXQp9Cg==
