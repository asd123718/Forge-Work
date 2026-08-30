import * as browser from "../../../../base/browser/browser.js";
import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import * as platform from "../../../../base/common/platform.js";
import { RangeUtil } from "./rangeUtil.js";
import { FloatHorizontalRange, VisibleRanges } from "../../view/renderingContext.js";
import { LineDecoration } from "../../../common/viewLayout/lineDecorations.js";
import { ForeignElementType, RenderLineInput, renderViewLine, DomPosition, RenderWhitespace } from "../../../common/viewLayout/viewLineRenderer.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { EditorFontLigatures } from "../../../common/config/editorOptions.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { InlineDecorationType } from "../../../common/viewModel/inlineDecorations.js";
import { TextDirection } from "../../../common/model.js";
const canUseFastRenderedViewLine = (function() {
  if (platform.isNative) {
    return true;
  }
  if (platform.isLinux || browser.isFirefox || browser.isSafari) {
    return false;
  }
  return true;
})();
let monospaceAssumptionsAreValid = true;
const _ViewLine = class _ViewLine {
  constructor(_viewGpuContext, options) {
    this._viewGpuContext = _viewGpuContext;
    this._options = options;
    this._isMaybeInvalid = true;
    this._renderedViewLine = null;
  }
  // --- begin IVisibleLineData
  getDomNode() {
    if (this._renderedViewLine && this._renderedViewLine.domNode) {
      return this._renderedViewLine.domNode.domNode;
    }
    return null;
  }
  setDomNode(domNode) {
    if (this._renderedViewLine) {
      this._renderedViewLine.domNode = createFastDomNode(domNode);
    } else {
      throw new Error("I have no rendered view line to set the dom node to...");
    }
  }
  onContentChanged() {
    this._isMaybeInvalid = true;
  }
  onTokensChanged() {
    this._isMaybeInvalid = true;
  }
  onDecorationsChanged() {
    this._isMaybeInvalid = true;
  }
  onOptionsChanged(newOptions) {
    this._isMaybeInvalid = true;
    this._options = newOptions;
  }
  onSelectionChanged() {
    if (isHighContrast(this._options.themeType) || this._renderedViewLine?.input.renderWhitespace === RenderWhitespace.Selection) {
      this._isMaybeInvalid = true;
      return true;
    }
    return false;
  }
  renderLine(lineNumber, deltaTop, lineHeight, viewportData, sb) {
    if (this._options.useGpu && this._viewGpuContext?.canRender(this._options, viewportData, lineNumber)) {
      this._renderedViewLine?.domNode?.domNode.remove();
      this._renderedViewLine = null;
      return false;
    }
    if (this._isMaybeInvalid === false) {
      return false;
    }
    this._isMaybeInvalid = false;
    const lineData = viewportData.getViewLineRenderingData(lineNumber);
    const options = this._options;
    const actualInlineDecorations = LineDecoration.filter(lineData.inlineDecorations, lineNumber, lineData.minColumn, lineData.maxColumn);
    const renderWhitespace = options.experimentalWhitespaceRendering === "off" ? options.renderWhitespace : "none";
    const allowFastRendering = !lineData.hasVariableFonts;
    let selectionsOnLine = null;
    if (isHighContrast(options.themeType) || renderWhitespace === "selection") {
      const selections = viewportData.selections;
      for (const selection of selections) {
        if (selection.endLineNumber < lineNumber || selection.startLineNumber > lineNumber) {
          continue;
        }
        const startColumn = selection.startLineNumber === lineNumber ? selection.startColumn : lineData.minColumn;
        const endColumn = selection.endLineNumber === lineNumber ? selection.endColumn : lineData.maxColumn;
        if (startColumn < endColumn) {
          if (isHighContrast(options.themeType)) {
            actualInlineDecorations.push(new LineDecoration(startColumn, endColumn, "inline-selected-text", InlineDecorationType.Regular));
          }
          if (renderWhitespace === "selection") {
            if (!selectionsOnLine) {
              selectionsOnLine = [];
            }
            selectionsOnLine.push(new OffsetRange(startColumn - 1, endColumn - 1));
          }
        }
      }
    }
    const renderLineInput = new RenderLineInput(
      options.useMonospaceOptimizations,
      options.canUseHalfwidthRightwardsArrow,
      lineData.content,
      lineData.continuesWithWrappedLine,
      lineData.isBasicASCII,
      lineData.containsRTL,
      lineData.minColumn - 1,
      lineData.tokens,
      actualInlineDecorations,
      lineData.tabSize,
      lineData.startVisibleColumn,
      options.spaceWidth,
      options.middotWidth,
      options.wsmiddotWidth,
      options.stopRenderingLineAfter,
      renderWhitespace,
      options.renderControlCharacters,
      options.fontLigatures !== EditorFontLigatures.OFF,
      selectionsOnLine,
      lineData.textDirection,
      options.verticalScrollbarSize
    );
    if (this._renderedViewLine && this._renderedViewLine.input.equals(renderLineInput)) {
      return false;
    }
    sb.appendString("<div ");
    if (lineData.textDirection === TextDirection.RTL) {
      sb.appendString('dir="rtl" ');
    } else if (lineData.containsRTL) {
      sb.appendString('dir="ltr" ');
    }
    sb.appendString('style="top:');
    sb.appendString(String(deltaTop));
    sb.appendString("px;height:");
    sb.appendString(String(lineHeight));
    sb.appendString("px;line-height:");
    sb.appendString(String(lineHeight));
    if (lineData.textDirection === TextDirection.RTL) {
      sb.appendString("px;padding-right:");
      sb.appendString(String(options.verticalScrollbarSize));
    }
    sb.appendString('px;" class="');
    sb.appendString(_ViewLine.CLASS_NAME);
    sb.appendString('">');
    const output = renderViewLine(renderLineInput, sb);
    sb.appendString("</div>");
    let renderedViewLine = null;
    if (allowFastRendering && monospaceAssumptionsAreValid && canUseFastRenderedViewLine && lineData.isBasicASCII && renderLineInput.isLTR && options.useMonospaceOptimizations && output.containsForeignElements === ForeignElementType.None) {
      renderedViewLine = new FastRenderedViewLine(
        this._renderedViewLine ? this._renderedViewLine.domNode : null,
        renderLineInput,
        output.characterMapping
      );
    }
    if (!renderedViewLine) {
      renderedViewLine = createRenderedLine(
        this._renderedViewLine ? this._renderedViewLine.domNode : null,
        renderLineInput,
        output.characterMapping,
        output.containsForeignElements
      );
    }
    this._renderedViewLine = renderedViewLine;
    return true;
  }
  layoutLine(lineNumber, deltaTop, lineHeight) {
    if (this._renderedViewLine && this._renderedViewLine.domNode) {
      this._renderedViewLine.domNode.setTop(deltaTop);
      this._renderedViewLine.domNode.setHeight(lineHeight);
      this._renderedViewLine.domNode.setLineHeight(lineHeight);
    }
  }
  // --- end IVisibleLineData
  isRenderedRTL() {
    if (!this._renderedViewLine) {
      return false;
    }
    return this._renderedViewLine.input.textDirection === TextDirection.RTL;
  }
  getWidth(context) {
    if (!this._renderedViewLine) {
      return 0;
    }
    return this._renderedViewLine.getWidth(context);
  }
  getWidthIsFast() {
    if (!this._renderedViewLine) {
      return true;
    }
    return this._renderedViewLine.getWidthIsFast();
  }
  needsMonospaceFontCheck() {
    if (!this._renderedViewLine) {
      return false;
    }
    return this._renderedViewLine instanceof FastRenderedViewLine;
  }
  monospaceAssumptionsAreValid() {
    if (!this._renderedViewLine) {
      return monospaceAssumptionsAreValid;
    }
    if (this._renderedViewLine instanceof FastRenderedViewLine) {
      return this._renderedViewLine.monospaceAssumptionsAreValid();
    }
    return monospaceAssumptionsAreValid;
  }
  onMonospaceAssumptionsInvalidated() {
    if (this._renderedViewLine && this._renderedViewLine instanceof FastRenderedViewLine) {
      this._renderedViewLine = this._renderedViewLine.toSlowRenderedLine();
    }
  }
  getVisibleRangesForRange(lineNumber, startColumn, endColumn, context) {
    if (!this._renderedViewLine) {
      return null;
    }
    startColumn = Math.min(this._renderedViewLine.input.lineContent.length + 1, Math.max(1, startColumn));
    endColumn = Math.min(this._renderedViewLine.input.lineContent.length + 1, Math.max(1, endColumn));
    const stopRenderingLineAfter = this._renderedViewLine.input.stopRenderingLineAfter;
    if (stopRenderingLineAfter !== -1 && startColumn > stopRenderingLineAfter + 1 && endColumn > stopRenderingLineAfter + 1) {
      return new VisibleRanges(true, [new FloatHorizontalRange(this.getWidth(context), 0)]);
    }
    if (stopRenderingLineAfter !== -1 && startColumn > stopRenderingLineAfter + 1) {
      startColumn = stopRenderingLineAfter + 1;
    }
    if (stopRenderingLineAfter !== -1 && endColumn > stopRenderingLineAfter + 1) {
      endColumn = stopRenderingLineAfter + 1;
    }
    const horizontalRanges = this._renderedViewLine.getVisibleRangesForRange(lineNumber, startColumn, endColumn, context);
    if (horizontalRanges && horizontalRanges.length > 0) {
      return new VisibleRanges(false, horizontalRanges);
    }
    return null;
  }
  getColumnOfNodeOffset(spanNode, offset) {
    if (!this._renderedViewLine) {
      return 1;
    }
    return this._renderedViewLine.getColumnOfNodeOffset(spanNode, offset);
  }
  resetCachedWidth() {
    this._renderedViewLine?.resetCachedWidth();
  }
};
_ViewLine.CLASS_NAME = "view-line";
let ViewLine = _ViewLine;
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxMonospaceDistance"] = 300] = "MaxMonospaceDistance";
  return Constants2;
})(Constants || {});
class FastRenderedViewLine {
  constructor(domNode, renderLineInput, characterMapping) {
    this._cachedWidth = -1;
    this.domNode = domNode;
    this.input = renderLineInput;
    const keyColumnCount = Math.floor(renderLineInput.lineContent.length / 300 /* MaxMonospaceDistance */);
    if (keyColumnCount > 0) {
      this._keyColumnPixelOffsetCache = new Float32Array(keyColumnCount);
      for (let i = 0; i < keyColumnCount; i++) {
        this._keyColumnPixelOffsetCache[i] = -1;
      }
    } else {
      this._keyColumnPixelOffsetCache = null;
    }
    this._characterMapping = characterMapping;
    this._charWidth = renderLineInput.spaceWidth;
  }
  getWidth(context) {
    if (!this.domNode || this.input.lineContent.length < 300 /* MaxMonospaceDistance */) {
      const horizontalOffset = this._characterMapping.getHorizontalOffset(this._characterMapping.length);
      return Math.round(this._charWidth * horizontalOffset);
    }
    if (this._cachedWidth === -1) {
      this._cachedWidth = this._getReadingTarget(this.domNode).offsetWidth;
      context?.markDidDomLayout();
    }
    return this._cachedWidth;
  }
  getWidthIsFast() {
    return this.input.lineContent.length < 300 /* MaxMonospaceDistance */ || this._cachedWidth !== -1;
  }
  resetCachedWidth() {
    this._cachedWidth = -1;
  }
  monospaceAssumptionsAreValid() {
    if (!this.domNode) {
      return monospaceAssumptionsAreValid;
    }
    if (this.input.lineContent.length < 300 /* MaxMonospaceDistance */) {
      const expectedWidth = this.getWidth(null);
      const actualWidth = this.domNode.domNode.firstChild.offsetWidth;
      if (Math.abs(expectedWidth - actualWidth) >= 2) {
        console.warn(`monospace assumptions have been violated, therefore disabling monospace optimizations!`);
        monospaceAssumptionsAreValid = false;
      }
    }
    return monospaceAssumptionsAreValid;
  }
  toSlowRenderedLine() {
    return createRenderedLine(this.domNode, this.input, this._characterMapping, ForeignElementType.None);
  }
  getVisibleRangesForRange(lineNumber, startColumn, endColumn, context) {
    const startPosition = this._getColumnPixelOffset(lineNumber, startColumn, context);
    const endPosition = this._getColumnPixelOffset(lineNumber, endColumn, context);
    return [new FloatHorizontalRange(startPosition, endPosition - startPosition)];
  }
  _getColumnPixelOffset(lineNumber, column, context) {
    if (column <= 300 /* MaxMonospaceDistance */) {
      const horizontalOffset2 = this._characterMapping.getHorizontalOffset(column);
      return this._charWidth * horizontalOffset2;
    }
    const keyColumnOrdinal = Math.floor((column - 1) / 300 /* MaxMonospaceDistance */) - 1;
    const keyColumn = (keyColumnOrdinal + 1) * 300 /* MaxMonospaceDistance */ + 1;
    let keyColumnPixelOffset = -1;
    if (this._keyColumnPixelOffsetCache) {
      keyColumnPixelOffset = this._keyColumnPixelOffsetCache[keyColumnOrdinal];
      if (keyColumnPixelOffset === -1) {
        keyColumnPixelOffset = this._actualReadPixelOffset(lineNumber, keyColumn, context);
        this._keyColumnPixelOffsetCache[keyColumnOrdinal] = keyColumnPixelOffset;
      }
    }
    if (keyColumnPixelOffset === -1) {
      const horizontalOffset2 = this._characterMapping.getHorizontalOffset(column);
      return this._charWidth * horizontalOffset2;
    }
    const keyColumnHorizontalOffset = this._characterMapping.getHorizontalOffset(keyColumn);
    const horizontalOffset = this._characterMapping.getHorizontalOffset(column);
    return keyColumnPixelOffset + this._charWidth * (horizontalOffset - keyColumnHorizontalOffset);
  }
  _getReadingTarget(myDomNode) {
    return myDomNode.domNode.firstChild;
  }
  _actualReadPixelOffset(lineNumber, column, context) {
    if (!this.domNode) {
      return -1;
    }
    const domPosition = this._characterMapping.getDomPosition(column);
    const r = RangeUtil.readHorizontalRanges(this._getReadingTarget(this.domNode), domPosition.partIndex, domPosition.charIndex, domPosition.partIndex, domPosition.charIndex, context);
    if (!r || r.length === 0) {
      return -1;
    }
    return r[0].left;
  }
  getColumnOfNodeOffset(spanNode, offset) {
    return getColumnOfNodeOffset(this._characterMapping, spanNode, offset);
  }
}
class RenderedViewLine {
  constructor(domNode, renderLineInput, characterMapping, containsForeignElements) {
    this.domNode = domNode;
    this.input = renderLineInput;
    this._characterMapping = characterMapping;
    this._isWhitespaceOnly = /^\s*$/.test(renderLineInput.lineContent);
    this._containsForeignElements = containsForeignElements;
    this._cachedWidth = -1;
    this._pixelOffsetCache = null;
    if (renderLineInput.isLTR) {
      this._pixelOffsetCache = new Float32Array(Math.max(2, this._characterMapping.length + 1));
      for (let column = 0, len = this._characterMapping.length; column <= len; column++) {
        this._pixelOffsetCache[column] = -1;
      }
    }
  }
  // --- Reading from the DOM methods
  _getReadingTarget(myDomNode) {
    return myDomNode.domNode.firstChild;
  }
  /**
   * Width of the line in pixels
   */
  getWidth(context) {
    if (!this.domNode) {
      return 0;
    }
    if (this._cachedWidth === -1) {
      this._cachedWidth = this._getReadingTarget(this.domNode).offsetWidth;
      context?.markDidDomLayout();
    }
    return this._cachedWidth;
  }
  getWidthIsFast() {
    if (this._cachedWidth === -1) {
      return false;
    }
    return true;
  }
  resetCachedWidth() {
    this._cachedWidth = -1;
    if (this._pixelOffsetCache !== null) {
      for (let column = 0, len = this._pixelOffsetCache.length; column < len; column++) {
        this._pixelOffsetCache[column] = -1;
      }
    }
  }
  /**
   * Visible ranges for a model range
   */
  getVisibleRangesForRange(lineNumber, startColumn, endColumn, context) {
    if (!this.domNode) {
      return null;
    }
    if (this._pixelOffsetCache !== null) {
      const startOffset = this._readPixelOffset(this.domNode, lineNumber, startColumn, context);
      if (startOffset === -1) {
        return null;
      }
      const endOffset = this._readPixelOffset(this.domNode, lineNumber, endColumn, context);
      if (endOffset === -1) {
        return null;
      }
      return [new FloatHorizontalRange(startOffset, endOffset - startOffset)];
    }
    return this._readVisibleRangesForRange(this.domNode, lineNumber, startColumn, endColumn, context);
  }
  _readVisibleRangesForRange(domNode, lineNumber, startColumn, endColumn, context) {
    if (startColumn === endColumn) {
      const pixelOffset = this._readPixelOffset(domNode, lineNumber, startColumn, context);
      if (pixelOffset === -1) {
        return null;
      } else {
        return [new FloatHorizontalRange(pixelOffset, 0)];
      }
    } else {
      return this._readRawVisibleRangesForRange(domNode, startColumn, endColumn, context);
    }
  }
  _readPixelOffset(domNode, lineNumber, column, context) {
    if (this.input.isLTR && this._characterMapping.length === 0) {
      if (this._containsForeignElements === ForeignElementType.None) {
        return 0;
      }
      if (this._containsForeignElements === ForeignElementType.After) {
        return 0;
      }
      if (this._containsForeignElements === ForeignElementType.Before) {
        return this.getWidth(context);
      }
      const readingTarget = this._getReadingTarget(domNode);
      if (readingTarget.firstChild) {
        context.markDidDomLayout();
        return readingTarget.firstChild.offsetWidth;
      } else {
        return 0;
      }
    }
    if (this._pixelOffsetCache !== null) {
      const cachedPixelOffset = this._pixelOffsetCache[column];
      if (cachedPixelOffset !== -1) {
        return cachedPixelOffset;
      }
      const result = this._actualReadPixelOffset(domNode, lineNumber, column, context);
      this._pixelOffsetCache[column] = result;
      return result;
    }
    return this._actualReadPixelOffset(domNode, lineNumber, column, context);
  }
  _actualReadPixelOffset(domNode, lineNumber, column, context) {
    if (this._characterMapping.length === 0) {
      const r2 = RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), 0, 0, 0, 0, context);
      if (!r2 || r2.length === 0) {
        return -1;
      }
      return r2[0].left;
    }
    if (this.input.isLTR && column === this._characterMapping.length && this._isWhitespaceOnly && this._containsForeignElements === ForeignElementType.None) {
      return this.getWidth(context);
    }
    const domPosition = this._characterMapping.getDomPosition(column);
    const r = RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), domPosition.partIndex, domPosition.charIndex, domPosition.partIndex, domPosition.charIndex, context);
    if (!r || r.length === 0) {
      return -1;
    }
    const result = r[0].left;
    if (this.input.isBasicASCII) {
      const horizontalOffset = this._characterMapping.getHorizontalOffset(column);
      const expectedResult = Math.round(this.input.spaceWidth * horizontalOffset);
      if (Math.abs(expectedResult - result) <= 1) {
        return expectedResult;
      }
    }
    return result;
  }
  _readRawVisibleRangesForRange(domNode, startColumn, endColumn, context) {
    if (this.input.isLTR && startColumn === 1 && endColumn === this._characterMapping.length) {
      return [new FloatHorizontalRange(0, this.getWidth(context))];
    }
    const startDomPosition = this._characterMapping.getDomPosition(startColumn);
    const endDomPosition = this._characterMapping.getDomPosition(endColumn);
    return RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), startDomPosition.partIndex, startDomPosition.charIndex, endDomPosition.partIndex, endDomPosition.charIndex, context);
  }
  /**
   * Returns the column for the text found at a specific offset inside a rendered dom node
   */
  getColumnOfNodeOffset(spanNode, offset) {
    return getColumnOfNodeOffset(this._characterMapping, spanNode, offset);
  }
}
class WebKitRenderedViewLine extends RenderedViewLine {
  _readVisibleRangesForRange(domNode, lineNumber, startColumn, endColumn, context) {
    const output = super._readVisibleRangesForRange(domNode, lineNumber, startColumn, endColumn, context);
    if (!output || output.length === 0 || startColumn === endColumn || startColumn === 1 && endColumn === this._characterMapping.length) {
      return output;
    }
    if (this.input.isLTR) {
      const endPixelOffset = this._readPixelOffset(domNode, lineNumber, endColumn, context);
      if (endPixelOffset !== -1) {
        const lastRange = output[output.length - 1];
        if (lastRange.left < endPixelOffset) {
          lastRange.width = endPixelOffset - lastRange.left;
        }
      }
    }
    return output;
  }
}
const createRenderedLine = (function() {
  if (browser.isWebKit) {
    return createWebKitRenderedLine;
  }
  return createNormalRenderedLine;
})();
function createWebKitRenderedLine(domNode, renderLineInput, characterMapping, containsForeignElements) {
  return new WebKitRenderedViewLine(domNode, renderLineInput, characterMapping, containsForeignElements);
}
function createNormalRenderedLine(domNode, renderLineInput, characterMapping, containsForeignElements) {
  return new RenderedViewLine(domNode, renderLineInput, characterMapping, containsForeignElements);
}
function getColumnOfNodeOffset(characterMapping, spanNode, offset) {
  const spanNodeTextContentLength = spanNode.textContent.length;
  let spanIndex = -1;
  while (spanNode) {
    spanNode = spanNode.previousSibling;
    spanIndex++;
  }
  return characterMapping.getColumn(new DomPosition(spanIndex, offset), spanNodeTextContentLength);
}
export {
  ViewLine,
  getColumnOfNodeOffset
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdQYXJ0c1xcdmlld0xpbmVzXFx2aWV3TGluZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGJyb3dzZXIgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgRmFzdERvbU5vZGUsIGNyZWF0ZUZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElWaXNpYmxlTGluZSB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld0xheWVyLmpzJztcbmltcG9ydCB7IFJhbmdlVXRpbCB9IGZyb20gJy4vcmFuZ2VVdGlsLmpzJztcbmltcG9ydCB7IFN0cmluZ0J1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zdHJpbmdCdWlsZGVyLmpzJztcbmltcG9ydCB7IEZsb2F0SG9yaXpvbnRhbFJhbmdlLCBWaXNpYmxlUmFuZ2VzIH0gZnJvbSAnLi4vLi4vdmlldy9yZW5kZXJpbmdDb250ZXh0LmpzJztcbmltcG9ydCB7IExpbmVEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvbGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IENoYXJhY3Rlck1hcHBpbmcsIEZvcmVpZ25FbGVtZW50VHlwZSwgUmVuZGVyTGluZUlucHV0LCByZW5kZXJWaWV3TGluZSwgRG9tUG9zaXRpb24sIFJlbmRlcldoaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFZpZXdwb3J0RGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lc1ZpZXdwb3J0RGF0YS5qcyc7XG5pbXBvcnQgeyBpc0hpZ2hDb250cmFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JGb250TGlnYXR1cmVzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IERvbVJlYWRpbmdDb250ZXh0IH0gZnJvbSAnLi9kb21SZWFkaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgdHlwZSB7IFZpZXdMaW5lT3B0aW9ucyB9IGZyb20gJy4vdmlld0xpbmVPcHRpb25zLmpzJztcbmltcG9ydCB7IFZpZXdHcHVDb250ZXh0IH0gZnJvbSAnLi4vLi4vZ3B1L3ZpZXdHcHVDb250ZXh0LmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXh0RGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcblxuY29uc3QgY2FuVXNlRmFzdFJlbmRlcmVkVmlld0xpbmUgPSAoZnVuY3Rpb24gKCkge1xuXHRpZiAocGxhdGZvcm0uaXNOYXRpdmUpIHtcblx0XHQvLyBJbiBWU0NvZGUgd2Uga25vdyB2ZXJ5IHdlbGwgd2hlbiB0aGUgem9vbSBsZXZlbCBjaGFuZ2VzXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAocGxhdGZvcm0uaXNMaW51eCB8fCBicm93c2VyLmlzRmlyZWZveCB8fCBicm93c2VyLmlzU2FmYXJpKSB7XG5cdFx0Ly8gT24gTGludXgsIGl0IGFwcGVhcnMgdGhhdCB6b29taW5nIGFmZmVjdHMgY2hhciB3aWR0aHMgKGluIHBpeGVscyksIHdoaWNoIGlzIHVuZXhwZWN0ZWQuXG5cdFx0Ly8gLS1cblx0XHQvLyBFdmVuIHRob3VnaCB3ZSByZWFkIGNoYXJhY3RlciB3aWR0aHMgY29ycmVjdGx5LCBoYXZpbmcgcmVhZCB0aGVtIGF0IGEgc3BlY2lmaWMgem9vbSBsZXZlbFxuXHRcdC8vIGRvZXMgbm90IG1lYW4gdGhleSBhcmUgdGhlIHNhbWUgYXQgdGhlIGN1cnJlbnQgem9vbSBsZXZlbC5cblx0XHQvLyAtLVxuXHRcdC8vIFRoaXMgY291bGQgYmUgaW1wcm92ZWQgaWYgd2UgZXZlciBmaWd1cmUgb3V0IGhvdyB0byBnZXQgYW4gZXZlbnQgd2hlbiBicm93c2VycyB6b29tLFxuXHRcdC8vIGJ1dCB1bnRpbCB0aGVuIHdlIGhhdmUgdG8gc3RpY2sgd2l0aCByZWFkaW5nIGNsaWVudCByZWN0cy5cblx0XHQvLyAtLVxuXHRcdC8vIFRoZSBzYW1lIGhhcyBiZWVuIG9ic2VydmVkIHdpdGggRmlyZWZveCBvbiBXaW5kb3dzN1xuXHRcdC8vIC0tXG5cdFx0Ly8gVGhlIHNhbWUgaGFzIGJlZW4gb3ZlcnN2ZWQgd2l0aCBTYWZhcmlcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn0pKCk7XG5cbmxldCBtb25vc3BhY2VBc3N1bXB0aW9uc0FyZVZhbGlkID0gdHJ1ZTtcblxuZXhwb3J0IGNsYXNzIFZpZXdMaW5lIGltcGxlbWVudHMgSVZpc2libGVMaW5lIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IENMQVNTX05BTUUgPSAndmlldy1saW5lJztcblxuXHRwcml2YXRlIF9vcHRpb25zOiBWaWV3TGluZU9wdGlvbnM7XG5cdHByaXZhdGUgX2lzTWF5YmVJbnZhbGlkOiBib29sZWFuO1xuXHRwcml2YXRlIF9yZW5kZXJlZFZpZXdMaW5lOiBJUmVuZGVyZWRWaWV3TGluZSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfdmlld0dwdUNvbnRleHQ6IFZpZXdHcHVDb250ZXh0IHwgdW5kZWZpbmVkLCBvcHRpb25zOiBWaWV3TGluZU9wdGlvbnMpIHtcblx0XHR0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLl9pc01heWJlSW52YWxpZCA9IHRydWU7XG5cdFx0dGhpcy5fcmVuZGVyZWRWaWV3TGluZSA9IG51bGw7XG5cdH1cblxuXHQvLyAtLS0gYmVnaW4gSVZpc2libGVMaW5lRGF0YVxuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgJiYgdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5kb21Ob2RlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5kb21Ob2RlLmRvbU5vZGU7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdHB1YmxpYyBzZXREb21Ob2RlKGRvbU5vZGU6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuZG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvbU5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0kgaGF2ZSBubyByZW5kZXJlZCB2aWV3IGxpbmUgdG8gc2V0IHRoZSBkb20gbm9kZSB0by4uLicpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvbkNvbnRlbnRDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzTWF5YmVJbnZhbGlkID0gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb25Ub2tlbnNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzTWF5YmVJbnZhbGlkID0gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb25EZWNvcmF0aW9uc0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNNYXliZUludmFsaWQgPSB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvbk9wdGlvbnNDaGFuZ2VkKG5ld09wdGlvbnM6IFZpZXdMaW5lT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX2lzTWF5YmVJbnZhbGlkID0gdHJ1ZTtcblx0XHR0aGlzLl9vcHRpb25zID0gbmV3T3B0aW9ucztcblx0fVxuXHRwdWJsaWMgb25TZWxlY3Rpb25DaGFuZ2VkKCk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc0hpZ2hDb250cmFzdCh0aGlzLl9vcHRpb25zLnRoZW1lVHlwZSkgfHwgdGhpcy5fcmVuZGVyZWRWaWV3TGluZT8uaW5wdXQucmVuZGVyV2hpdGVzcGFjZSA9PT0gUmVuZGVyV2hpdGVzcGFjZS5TZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMuX2lzTWF5YmVJbnZhbGlkID0gdHJ1ZTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIGRlbHRhVG9wOiBudW1iZXIsIGxpbmVIZWlnaHQ6IG51bWJlciwgdmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEsIHNiOiBTdHJpbmdCdWlsZGVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudXNlR3B1ICYmIHRoaXMuX3ZpZXdHcHVDb250ZXh0Py5jYW5SZW5kZXIodGhpcy5fb3B0aW9ucywgdmlld3BvcnREYXRhLCBsaW5lTnVtYmVyKSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRWaWV3TGluZT8uZG9tTm9kZT8uZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgPSBudWxsO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc01heWJlSW52YWxpZCA9PT0gZmFsc2UpIHtcblx0XHRcdC8vIGl0IGFwcGVhcnMgdGhhdCBub3RoaW5nIHJlbGV2YW50IGhhcyBjaGFuZ2VkXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNNYXliZUludmFsaWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGxpbmVEYXRhID0gdmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fb3B0aW9ucztcblx0XHRjb25zdCBhY3R1YWxJbmxpbmVEZWNvcmF0aW9ucyA9IExpbmVEZWNvcmF0aW9uLmZpbHRlcihsaW5lRGF0YS5pbmxpbmVEZWNvcmF0aW9ucywgbGluZU51bWJlciwgbGluZURhdGEubWluQ29sdW1uLCBsaW5lRGF0YS5tYXhDb2x1bW4pO1xuXHRcdGNvbnN0IHJlbmRlcldoaXRlc3BhY2UgPSBvcHRpb25zLmV4cGVyaW1lbnRhbFdoaXRlc3BhY2VSZW5kZXJpbmcgPT09ICdvZmYnID8gb3B0aW9ucy5yZW5kZXJXaGl0ZXNwYWNlIDogJ25vbmUnO1xuXHRcdGNvbnN0IGFsbG93RmFzdFJlbmRlcmluZyA9ICFsaW5lRGF0YS5oYXNWYXJpYWJsZUZvbnRzO1xuXG5cdFx0Ly8gT25seSBzZW5kIHNlbGVjdGlvbiBpbmZvcm1hdGlvbiB3aGVuIG5lZWRlZCBmb3IgcmVuZGVyaW5nIHdoaXRlc3BhY2Vcblx0XHRsZXQgc2VsZWN0aW9uc09uTGluZTogT2Zmc2V0UmFuZ2VbXSB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChpc0hpZ2hDb250cmFzdChvcHRpb25zLnRoZW1lVHlwZSkgfHwgcmVuZGVyV2hpdGVzcGFjZSA9PT0gJ3NlbGVjdGlvbicpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB2aWV3cG9ydERhdGEuc2VsZWN0aW9ucztcblx0XHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblxuXHRcdFx0XHRpZiAoc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgPCBsaW5lTnVtYmVyIHx8IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPiBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Ly8gU2VsZWN0aW9uIGRvZXMgbm90IGludGVyc2VjdCBsaW5lXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IChzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyID8gc2VsZWN0aW9uLnN0YXJ0Q29sdW1uIDogbGluZURhdGEubWluQ29sdW1uKTtcblx0XHRcdFx0Y29uc3QgZW5kQ29sdW1uID0gKHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyID8gc2VsZWN0aW9uLmVuZENvbHVtbiA6IGxpbmVEYXRhLm1heENvbHVtbik7XG5cblx0XHRcdFx0aWYgKHN0YXJ0Q29sdW1uIDwgZW5kQ29sdW1uKSB7XG5cdFx0XHRcdFx0aWYgKGlzSGlnaENvbnRyYXN0KG9wdGlvbnMudGhlbWVUeXBlKSkge1xuXHRcdFx0XHRcdFx0YWN0dWFsSW5saW5lRGVjb3JhdGlvbnMucHVzaChuZXcgTGluZURlY29yYXRpb24oc3RhcnRDb2x1bW4sIGVuZENvbHVtbiwgJ2lubGluZS1zZWxlY3RlZC10ZXh0JywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocmVuZGVyV2hpdGVzcGFjZSA9PT0gJ3NlbGVjdGlvbicpIHtcblx0XHRcdFx0XHRcdGlmICghc2VsZWN0aW9uc09uTGluZSkge1xuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb25zT25MaW5lID0gW107XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHNlbGVjdGlvbnNPbkxpbmUucHVzaChuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnRDb2x1bW4gLSAxLCBlbmRDb2x1bW4gLSAxKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVuZGVyTGluZUlucHV0ID0gbmV3IFJlbmRlckxpbmVJbnB1dChcblx0XHRcdG9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucyxcblx0XHRcdG9wdGlvbnMuY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93LFxuXHRcdFx0bGluZURhdGEuY29udGVudCxcblx0XHRcdGxpbmVEYXRhLmNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZSxcblx0XHRcdGxpbmVEYXRhLmlzQmFzaWNBU0NJSSxcblx0XHRcdGxpbmVEYXRhLmNvbnRhaW5zUlRMLFxuXHRcdFx0bGluZURhdGEubWluQ29sdW1uIC0gMSxcblx0XHRcdGxpbmVEYXRhLnRva2Vucyxcblx0XHRcdGFjdHVhbElubGluZURlY29yYXRpb25zLFxuXHRcdFx0bGluZURhdGEudGFiU2l6ZSxcblx0XHRcdGxpbmVEYXRhLnN0YXJ0VmlzaWJsZUNvbHVtbixcblx0XHRcdG9wdGlvbnMuc3BhY2VXaWR0aCxcblx0XHRcdG9wdGlvbnMubWlkZG90V2lkdGgsXG5cdFx0XHRvcHRpb25zLndzbWlkZG90V2lkdGgsXG5cdFx0XHRvcHRpb25zLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIsXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlLFxuXHRcdFx0b3B0aW9ucy5yZW5kZXJDb250cm9sQ2hhcmFjdGVycyxcblx0XHRcdG9wdGlvbnMuZm9udExpZ2F0dXJlcyAhPT0gRWRpdG9yRm9udExpZ2F0dXJlcy5PRkYsXG5cdFx0XHRzZWxlY3Rpb25zT25MaW5lLFxuXHRcdFx0bGluZURhdGEudGV4dERpcmVjdGlvbixcblx0XHRcdG9wdGlvbnMudmVydGljYWxTY3JvbGxiYXJTaXplXG5cdFx0KTtcblxuXHRcdGlmICh0aGlzLl9yZW5kZXJlZFZpZXdMaW5lICYmIHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuaW5wdXQuZXF1YWxzKHJlbmRlckxpbmVJbnB1dCkpIHtcblx0XHRcdC8vIG5vIG5lZWQgdG8gZG8gYW55dGhpbmcsIHdlIGhhdmUgdGhlIHNhbWUgcmVuZGVyIGlucHV0XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0c2IuYXBwZW5kU3RyaW5nKCc8ZGl2ICcpO1xuXHRcdGlmIChsaW5lRGF0YS50ZXh0RGlyZWN0aW9uID09PSBUZXh0RGlyZWN0aW9uLlJUTCkge1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKCdkaXI9XCJydGxcIiAnKTtcblx0XHR9IGVsc2UgaWYgKGxpbmVEYXRhLmNvbnRhaW5zUlRMKSB7XG5cdFx0XHRzYi5hcHBlbmRTdHJpbmcoJ2Rpcj1cImx0clwiICcpO1xuXHRcdH1cblx0XHRzYi5hcHBlbmRTdHJpbmcoJ3N0eWxlPVwidG9wOicpO1xuXHRcdHNiLmFwcGVuZFN0cmluZyhTdHJpbmcoZGVsdGFUb3ApKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoJ3B4O2hlaWdodDonKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoU3RyaW5nKGxpbmVIZWlnaHQpKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoJ3B4O2xpbmUtaGVpZ2h0OicpO1xuXHRcdHNiLmFwcGVuZFN0cmluZyhTdHJpbmcobGluZUhlaWdodCkpO1xuXHRcdGlmIChsaW5lRGF0YS50ZXh0RGlyZWN0aW9uID09PSBUZXh0RGlyZWN0aW9uLlJUTCkge1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKCdweDtwYWRkaW5nLXJpZ2h0OicpO1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKFN0cmluZyhvcHRpb25zLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSkpO1xuXHRcdH1cblx0XHRzYi5hcHBlbmRTdHJpbmcoJ3B4O1wiIGNsYXNzPVwiJyk7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKFZpZXdMaW5lLkNMQVNTX05BTUUpO1xuXHRcdHNiLmFwcGVuZFN0cmluZygnXCI+Jyk7XG5cblx0XHRjb25zdCBvdXRwdXQgPSByZW5kZXJWaWV3TGluZShyZW5kZXJMaW5lSW5wdXQsIHNiKTtcblxuXHRcdHNiLmFwcGVuZFN0cmluZygnPC9kaXY+Jyk7XG5cblx0XHRsZXQgcmVuZGVyZWRWaWV3TGluZTogSVJlbmRlcmVkVmlld0xpbmUgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoXG5cdFx0XHRhbGxvd0Zhc3RSZW5kZXJpbmdcblx0XHRcdCYmIG1vbm9zcGFjZUFzc3VtcHRpb25zQXJlVmFsaWRcblx0XHRcdCYmIGNhblVzZUZhc3RSZW5kZXJlZFZpZXdMaW5lXG5cdFx0XHQmJiBsaW5lRGF0YS5pc0Jhc2ljQVNDSUlcblx0XHRcdCYmIHJlbmRlckxpbmVJbnB1dC5pc0xUUlxuXHRcdFx0JiYgb3B0aW9ucy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zXG5cdFx0XHQmJiBvdXRwdXQuY29udGFpbnNGb3JlaWduRWxlbWVudHMgPT09IEZvcmVpZ25FbGVtZW50VHlwZS5Ob25lXG5cdFx0KSB7XG5cdFx0XHRyZW5kZXJlZFZpZXdMaW5lID0gbmV3IEZhc3RSZW5kZXJlZFZpZXdMaW5lKFxuXHRcdFx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lID8gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5kb21Ob2RlIDogbnVsbCxcblx0XHRcdFx0cmVuZGVyTGluZUlucHV0LFxuXHRcdFx0XHRvdXRwdXQuY2hhcmFjdGVyTWFwcGluZ1xuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAoIXJlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHJlbmRlcmVkVmlld0xpbmUgPSBjcmVhdGVSZW5kZXJlZExpbmUoXG5cdFx0XHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgPyB0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmRvbU5vZGUgOiBudWxsLFxuXHRcdFx0XHRyZW5kZXJMaW5lSW5wdXQsXG5cdFx0XHRcdG91dHB1dC5jaGFyYWN0ZXJNYXBwaW5nLFxuXHRcdFx0XHRvdXRwdXQuY29udGFpbnNGb3JlaWduRWxlbWVudHNcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVyZWRWaWV3TGluZSA9IHJlbmRlcmVkVmlld0xpbmU7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXRMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgZGVsdGFUb3A6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgJiYgdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5kb21Ob2RlKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmRvbU5vZGUuc2V0VG9wKGRlbHRhVG9wKTtcblx0XHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuZG9tTm9kZS5zZXRIZWlnaHQobGluZUhlaWdodCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmRvbU5vZGUuc2V0TGluZUhlaWdodChsaW5lSGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gZW5kIElWaXNpYmxlTGluZURhdGFcblxuXHRwdWJsaWMgaXNSZW5kZXJlZFJUTCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuaW5wdXQudGV4dERpcmVjdGlvbiA9PT0gVGV4dERpcmVjdGlvbi5SVEw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V2lkdGgoY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQgfCBudWxsKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5nZXRXaWR0aChjb250ZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXaWR0aElzRmFzdCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5nZXRXaWR0aElzRmFzdCgpO1xuXHR9XG5cblx0cHVibGljIG5lZWRzTW9ub3NwYWNlRm9udENoZWNrKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fcmVuZGVyZWRWaWV3TGluZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgaW5zdGFuY2VvZiBGYXN0UmVuZGVyZWRWaWV3TGluZSk7XG5cdH1cblxuXHRwdWJsaWMgbW9ub3NwYWNlQXNzdW1wdGlvbnNBcmVWYWxpZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHJldHVybiBtb25vc3BhY2VBc3N1bXB0aW9uc0FyZVZhbGlkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcmVuZGVyZWRWaWV3TGluZSBpbnN0YW5jZW9mIEZhc3RSZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5tb25vc3BhY2VBc3N1bXB0aW9uc0FyZVZhbGlkKCk7XG5cdFx0fVxuXHRcdHJldHVybiBtb25vc3BhY2VBc3N1bXB0aW9uc0FyZVZhbGlkO1xuXHR9XG5cblx0cHVibGljIG9uTW9ub3NwYWNlQXNzdW1wdGlvbnNJbnZhbGlkYXRlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVuZGVyZWRWaWV3TGluZSAmJiB0aGlzLl9yZW5kZXJlZFZpZXdMaW5lIGluc3RhbmNlb2YgRmFzdFJlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgPSB0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLnRvU2xvd1JlbmRlcmVkTGluZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UobGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQpOiBWaXNpYmxlUmFuZ2VzIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9yZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRzdGFydENvbHVtbiA9IE1hdGgubWluKHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuaW5wdXQubGluZUNvbnRlbnQubGVuZ3RoICsgMSwgTWF0aC5tYXgoMSwgc3RhcnRDb2x1bW4pKTtcblx0XHRlbmRDb2x1bW4gPSBNYXRoLm1pbih0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmlucHV0LmxpbmVDb250ZW50Lmxlbmd0aCArIDEsIE1hdGgubWF4KDEsIGVuZENvbHVtbikpO1xuXG5cdFx0Y29uc3Qgc3RvcFJlbmRlcmluZ0xpbmVBZnRlciA9IHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuaW5wdXQuc3RvcFJlbmRlcmluZ0xpbmVBZnRlcjtcblxuXHRcdGlmIChzdG9wUmVuZGVyaW5nTGluZUFmdGVyICE9PSAtMSAmJiBzdGFydENvbHVtbiA+IHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgKyAxICYmIGVuZENvbHVtbiA+IHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgKyAxKSB7XG5cdFx0XHQvLyBUaGlzIHJhbmdlIGlzIG9idmlvdXNseSBub3QgdmlzaWJsZVxuXHRcdFx0cmV0dXJuIG5ldyBWaXNpYmxlUmFuZ2VzKHRydWUsIFtuZXcgRmxvYXRIb3Jpem9udGFsUmFuZ2UodGhpcy5nZXRXaWR0aChjb250ZXh0KSwgMCldKTtcblx0XHR9XG5cblx0XHRpZiAoc3RvcFJlbmRlcmluZ0xpbmVBZnRlciAhPT0gLTEgJiYgc3RhcnRDb2x1bW4gPiBzdG9wUmVuZGVyaW5nTGluZUFmdGVyICsgMSkge1xuXHRcdFx0c3RhcnRDb2x1bW4gPSBzdG9wUmVuZGVyaW5nTGluZUFmdGVyICsgMTtcblx0XHR9XG5cblx0XHRpZiAoc3RvcFJlbmRlcmluZ0xpbmVBZnRlciAhPT0gLTEgJiYgZW5kQ29sdW1uID4gc3RvcFJlbmRlcmluZ0xpbmVBZnRlciArIDEpIHtcblx0XHRcdGVuZENvbHVtbiA9IHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgKyAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvcml6b250YWxSYW5nZXMgPSB0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmdldFZpc2libGVSYW5nZXNGb3JSYW5nZShsaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kQ29sdW1uLCBjb250ZXh0KTtcblx0XHRpZiAoaG9yaXpvbnRhbFJhbmdlcyAmJiBob3Jpem9udGFsUmFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBuZXcgVmlzaWJsZVJhbmdlcyhmYWxzZSwgaG9yaXpvbnRhbFJhbmdlcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29sdW1uT2ZOb2RlT2Zmc2V0KHNwYW5Ob2RlOiBIVE1MRWxlbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fcmVuZGVyZWRWaWV3TGluZSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmdldENvbHVtbk9mTm9kZU9mZnNldChzcGFuTm9kZSwgb2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyByZXNldENhY2hlZFdpZHRoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmU/LnJlc2V0Q2FjaGVkV2lkdGgoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVJlbmRlcmVkVmlld0xpbmUge1xuXHRkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsO1xuXHRyZWFkb25seSBpbnB1dDogUmVuZGVyTGluZUlucHV0O1xuXHRnZXRXaWR0aChjb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCB8IG51bGwpOiBudW1iZXI7XG5cdGdldFdpZHRoSXNGYXN0KCk6IGJvb2xlYW47XG5cdHJlc2V0Q2FjaGVkV2lkdGgoKTogdm9pZDtcblx0Z2V0VmlzaWJsZVJhbmdlc0ZvclJhbmdlKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogRmxvYXRIb3Jpem9udGFsUmFuZ2VbXSB8IG51bGw7XG5cdGdldENvbHVtbk9mTm9kZU9mZnNldChzcGFuTm9kZTogSFRNTEVsZW1lbnQsIG9mZnNldDogbnVtYmVyKTogbnVtYmVyO1xufVxuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdC8qKlxuXHQgKiBJdCBzZWVtcyB0aGF0IHJvdW5kaW5nIGVycm9ycyBvY2N1ciB3aXRoIGxvbmcgbGluZXMsIHNvIHRoZSBwdXJlbHkgbXVsdGlwbGljYXRpb24gYmFzZWRcblx0ICogbWV0aG9kIGlzIG9ubHkgdmlhYmxlIGZvciBzaG9ydCBsaW5lcy4gRm9yIGxvbmdlciBsaW5lcywgd2UgbG9vayB1cCB0aGUgcmVhbCBwb3NpdGlvbiBvZlxuXHQgKiBldmVyeSAzMDB0aCBjaGFyYWN0ZXIgYW5kIHVzZSBtdWx0aXBsaWNhdGlvbiBiYXNlZCBvbiB0aGF0LlxuXHQgKlxuXHQgKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMzMTc4XG5cdCAqL1xuXHRNYXhNb25vc3BhY2VEaXN0YW5jZSA9IDMwMFxufVxuXG4vKipcbiAqIEEgcmVuZGVyZWQgbGluZSB3aGljaCBpcyBndWFyYW50ZWVkIHRvIGNvbnRhaW4gb25seSByZWd1bGFyIEFTQ0lJIGFuZCBpcyByZW5kZXJlZCB3aXRoIGEgbW9ub3NwYWNlIGZvbnQuXG4gKi9cbmNsYXNzIEZhc3RSZW5kZXJlZFZpZXdMaW5lIGltcGxlbWVudHMgSVJlbmRlcmVkVmlld0xpbmUge1xuXG5cdHB1YmxpYyBkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgaW5wdXQ6IFJlbmRlckxpbmVJbnB1dDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFyYWN0ZXJNYXBwaW5nOiBDaGFyYWN0ZXJNYXBwaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFyV2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfa2V5Q29sdW1uUGl4ZWxPZmZzZXRDYWNoZTogRmxvYXQzMkFycmF5IHwgbnVsbDtcblx0cHJpdmF0ZSBfY2FjaGVkV2lkdGg6IG51bWJlciA9IC0xO1xuXG5cdGNvbnN0cnVjdG9yKGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiB8IG51bGwsIHJlbmRlckxpbmVJbnB1dDogUmVuZGVyTGluZUlucHV0LCBjaGFyYWN0ZXJNYXBwaW5nOiBDaGFyYWN0ZXJNYXBwaW5nKSB7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tTm9kZTtcblx0XHR0aGlzLmlucHV0ID0gcmVuZGVyTGluZUlucHV0O1xuXHRcdGNvbnN0IGtleUNvbHVtbkNvdW50ID0gTWF0aC5mbG9vcihyZW5kZXJMaW5lSW5wdXQubGluZUNvbnRlbnQubGVuZ3RoIC8gQ29uc3RhbnRzLk1heE1vbm9zcGFjZURpc3RhbmNlKTtcblx0XHRpZiAoa2V5Q29sdW1uQ291bnQgPiAwKSB7XG5cdFx0XHR0aGlzLl9rZXlDb2x1bW5QaXhlbE9mZnNldENhY2hlID0gbmV3IEZsb2F0MzJBcnJheShrZXlDb2x1bW5Db3VudCk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGtleUNvbHVtbkNvdW50OyBpKyspIHtcblx0XHRcdFx0dGhpcy5fa2V5Q29sdW1uUGl4ZWxPZmZzZXRDYWNoZVtpXSA9IC0xO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9rZXlDb2x1bW5QaXhlbE9mZnNldENhY2hlID0gbnVsbDtcblx0XHR9XG5cblx0XHR0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nID0gY2hhcmFjdGVyTWFwcGluZztcblx0XHR0aGlzLl9jaGFyV2lkdGggPSByZW5kZXJMaW5lSW5wdXQuc3BhY2VXaWR0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXRXaWR0aChjb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCB8IG51bGwpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5kb21Ob2RlIHx8IHRoaXMuaW5wdXQubGluZUNvbnRlbnQubGVuZ3RoIDwgQ29uc3RhbnRzLk1heE1vbm9zcGFjZURpc3RhbmNlKSB7XG5cdFx0XHRjb25zdCBob3Jpem9udGFsT2Zmc2V0ID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXRIb3Jpem9udGFsT2Zmc2V0KHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcubGVuZ3RoKTtcblx0XHRcdHJldHVybiBNYXRoLnJvdW5kKHRoaXMuX2NoYXJXaWR0aCAqIGhvcml6b250YWxPZmZzZXQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2FjaGVkV2lkdGggPT09IC0xKSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRXaWR0aCA9IHRoaXMuX2dldFJlYWRpbmdUYXJnZXQodGhpcy5kb21Ob2RlKS5vZmZzZXRXaWR0aDtcblx0XHRcdGNvbnRleHQ/Lm1hcmtEaWREb21MYXlvdXQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZFdpZHRoO1xuXHR9XG5cblx0cHVibGljIGdldFdpZHRoSXNGYXN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5pbnB1dC5saW5lQ29udGVudC5sZW5ndGggPCBDb25zdGFudHMuTWF4TW9ub3NwYWNlRGlzdGFuY2UpIHx8IHRoaXMuX2NhY2hlZFdpZHRoICE9PSAtMTtcblx0fVxuXG5cdHB1YmxpYyByZXNldENhY2hlZFdpZHRoKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhY2hlZFdpZHRoID0gLTE7XG5cdH1cblxuXHRwdWJsaWMgbW9ub3NwYWNlQXNzdW1wdGlvbnNBcmVWYWxpZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZG9tTm9kZSkge1xuXHRcdFx0cmV0dXJuIG1vbm9zcGFjZUFzc3VtcHRpb25zQXJlVmFsaWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlucHV0LmxpbmVDb250ZW50Lmxlbmd0aCA8IENvbnN0YW50cy5NYXhNb25vc3BhY2VEaXN0YW5jZSkge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRXaWR0aCA9IHRoaXMuZ2V0V2lkdGgobnVsbCk7XG5cdFx0XHRjb25zdCBhY3R1YWxXaWR0aCA9ICg8SFRNTFNwYW5FbGVtZW50PnRoaXMuZG9tTm9kZS5kb21Ob2RlLmZpcnN0Q2hpbGQpLm9mZnNldFdpZHRoO1xuXHRcdFx0aWYgKE1hdGguYWJzKGV4cGVjdGVkV2lkdGggLSBhY3R1YWxXaWR0aCkgPj0gMikge1xuXHRcdFx0XHQvLyBtb3JlIHRoYW4gMnB4IG9mZlxuXHRcdFx0XHRjb25zb2xlLndhcm4oYG1vbm9zcGFjZSBhc3N1bXB0aW9ucyBoYXZlIGJlZW4gdmlvbGF0ZWQsIHRoZXJlZm9yZSBkaXNhYmxpbmcgbW9ub3NwYWNlIG9wdGltaXphdGlvbnMhYCk7XG5cdFx0XHRcdG1vbm9zcGFjZUFzc3VtcHRpb25zQXJlVmFsaWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1vbm9zcGFjZUFzc3VtcHRpb25zQXJlVmFsaWQ7XG5cdH1cblxuXHRwdWJsaWMgdG9TbG93UmVuZGVyZWRMaW5lKCk6IFJlbmRlcmVkVmlld0xpbmUge1xuXHRcdHJldHVybiBjcmVhdGVSZW5kZXJlZExpbmUodGhpcy5kb21Ob2RlLCB0aGlzLmlucHV0LCB0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLCBGb3JlaWduRWxlbWVudFR5cGUuTm9uZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmlzaWJsZVJhbmdlc0ZvclJhbmdlKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogRmxvYXRIb3Jpem9udGFsUmFuZ2VbXSB8IG51bGwge1xuXHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSB0aGlzLl9nZXRDb2x1bW5QaXhlbE9mZnNldChsaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgY29udGV4dCk7XG5cdFx0Y29uc3QgZW5kUG9zaXRpb24gPSB0aGlzLl9nZXRDb2x1bW5QaXhlbE9mZnNldChsaW5lTnVtYmVyLCBlbmRDb2x1bW4sIGNvbnRleHQpO1xuXHRcdHJldHVybiBbbmV3IEZsb2F0SG9yaXpvbnRhbFJhbmdlKHN0YXJ0UG9zaXRpb24sIGVuZFBvc2l0aW9uIC0gc3RhcnRQb3NpdGlvbildO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29sdW1uUGl4ZWxPZmZzZXQobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQpOiBudW1iZXIge1xuXHRcdGlmIChjb2x1bW4gPD0gQ29uc3RhbnRzLk1heE1vbm9zcGFjZURpc3RhbmNlKSB7XG5cdFx0XHRjb25zdCBob3Jpem9udGFsT2Zmc2V0ID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXRIb3Jpem9udGFsT2Zmc2V0KGNvbHVtbik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2hhcldpZHRoICogaG9yaXpvbnRhbE9mZnNldDtcblx0XHR9XG5cblx0XHRjb25zdCBrZXlDb2x1bW5PcmRpbmFsID0gTWF0aC5mbG9vcigoY29sdW1uIC0gMSkgLyBDb25zdGFudHMuTWF4TW9ub3NwYWNlRGlzdGFuY2UpIC0gMTtcblx0XHRjb25zdCBrZXlDb2x1bW4gPSAoa2V5Q29sdW1uT3JkaW5hbCArIDEpICogQ29uc3RhbnRzLk1heE1vbm9zcGFjZURpc3RhbmNlICsgMTtcblx0XHRsZXQga2V5Q29sdW1uUGl4ZWxPZmZzZXQgPSAtMTtcblx0XHRpZiAodGhpcy5fa2V5Q29sdW1uUGl4ZWxPZmZzZXRDYWNoZSkge1xuXHRcdFx0a2V5Q29sdW1uUGl4ZWxPZmZzZXQgPSB0aGlzLl9rZXlDb2x1bW5QaXhlbE9mZnNldENhY2hlW2tleUNvbHVtbk9yZGluYWxdO1xuXHRcdFx0aWYgKGtleUNvbHVtblBpeGVsT2Zmc2V0ID09PSAtMSkge1xuXHRcdFx0XHRrZXlDb2x1bW5QaXhlbE9mZnNldCA9IHRoaXMuX2FjdHVhbFJlYWRQaXhlbE9mZnNldChsaW5lTnVtYmVyLCBrZXlDb2x1bW4sIGNvbnRleHQpO1xuXHRcdFx0XHR0aGlzLl9rZXlDb2x1bW5QaXhlbE9mZnNldENhY2hlW2tleUNvbHVtbk9yZGluYWxdID0ga2V5Q29sdW1uUGl4ZWxPZmZzZXQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGtleUNvbHVtblBpeGVsT2Zmc2V0ID09PSAtMSkge1xuXHRcdFx0Ly8gQ291bGQgbm90IHJlYWQgYWN0dWFsIGtleSBjb2x1bW4gcGl4ZWwgb2Zmc2V0XG5cdFx0XHRjb25zdCBob3Jpem9udGFsT2Zmc2V0ID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXRIb3Jpem9udGFsT2Zmc2V0KGNvbHVtbik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2hhcldpZHRoICogaG9yaXpvbnRhbE9mZnNldDtcblx0XHR9XG5cblx0XHRjb25zdCBrZXlDb2x1bW5Ib3Jpem9udGFsT2Zmc2V0ID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXRIb3Jpem9udGFsT2Zmc2V0KGtleUNvbHVtbik7XG5cdFx0Y29uc3QgaG9yaXpvbnRhbE9mZnNldCA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0SG9yaXpvbnRhbE9mZnNldChjb2x1bW4pO1xuXHRcdHJldHVybiBrZXlDb2x1bW5QaXhlbE9mZnNldCArIHRoaXMuX2NoYXJXaWR0aCAqIChob3Jpem9udGFsT2Zmc2V0IC0ga2V5Q29sdW1uSG9yaXpvbnRhbE9mZnNldCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZWFkaW5nVGFyZ2V0KG15RG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+KTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiA8SFRNTFNwYW5FbGVtZW50Pm15RG9tTm9kZS5kb21Ob2RlLmZpcnN0Q2hpbGQ7XG5cdH1cblxuXHRwcml2YXRlIF9hY3R1YWxSZWFkUGl4ZWxPZmZzZXQobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5kb21Ob2RlKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGNvbnN0IGRvbVBvc2l0aW9uID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXREb21Qb3NpdGlvbihjb2x1bW4pO1xuXHRcdGNvbnN0IHIgPSBSYW5nZVV0aWwucmVhZEhvcml6b250YWxSYW5nZXModGhpcy5fZ2V0UmVhZGluZ1RhcmdldCh0aGlzLmRvbU5vZGUpLCBkb21Qb3NpdGlvbi5wYXJ0SW5kZXgsIGRvbVBvc2l0aW9uLmNoYXJJbmRleCwgZG9tUG9zaXRpb24ucGFydEluZGV4LCBkb21Qb3NpdGlvbi5jaGFySW5kZXgsIGNvbnRleHQpO1xuXHRcdGlmICghciB8fCByLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gclswXS5sZWZ0O1xuXHR9XG5cblx0cHVibGljIGdldENvbHVtbk9mTm9kZU9mZnNldChzcGFuTm9kZTogSFRNTEVsZW1lbnQsIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gZ2V0Q29sdW1uT2ZOb2RlT2Zmc2V0KHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcsIHNwYW5Ob2RlLCBvZmZzZXQpO1xuXHR9XG59XG5cbi8qKlxuICogRXZlcnkgdGltZSB3ZSByZW5kZXIgYSBsaW5lLCB3ZSBzYXZlIHdoYXQgd2UgaGF2ZSByZW5kZXJlZCBpbiBhbiBpbnN0YW5jZSBvZiB0aGlzIGNsYXNzLlxuICovXG5jbGFzcyBSZW5kZXJlZFZpZXdMaW5lIGltcGxlbWVudHMgSVJlbmRlcmVkVmlld0xpbmUge1xuXG5cdHB1YmxpYyBkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgaW5wdXQ6IFJlbmRlckxpbmVJbnB1dDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NoYXJhY3Rlck1hcHBpbmc6IENoYXJhY3Rlck1hcHBpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzV2hpdGVzcGFjZU9ubHk6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5zRm9yZWlnbkVsZW1lbnRzOiBGb3JlaWduRWxlbWVudFR5cGU7XG5cdHByaXZhdGUgX2NhY2hlZFdpZHRoOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoaXMgaXMgYSBtYXAgdGhhdCBpcyB1c2VkIG9ubHkgd2hlbiB0aGUgbGluZSBpcyBndWFyYW50ZWVkIHRvIGJlIHJlbmRlcmVkIExUUiBhbmQgaGFzIG5vIFJUTCB0ZXh0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGl4ZWxPZmZzZXRDYWNoZTogRmxvYXQzMkFycmF5IHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsLCByZW5kZXJMaW5lSW5wdXQ6IFJlbmRlckxpbmVJbnB1dCwgY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZywgY29udGFpbnNGb3JlaWduRWxlbWVudHM6IEZvcmVpZ25FbGVtZW50VHlwZSkge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbU5vZGU7XG5cdFx0dGhpcy5pbnB1dCA9IHJlbmRlckxpbmVJbnB1dDtcblx0XHR0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nID0gY2hhcmFjdGVyTWFwcGluZztcblx0XHR0aGlzLl9pc1doaXRlc3BhY2VPbmx5ID0gL15cXHMqJC8udGVzdChyZW5kZXJMaW5lSW5wdXQubGluZUNvbnRlbnQpO1xuXHRcdHRoaXMuX2NvbnRhaW5zRm9yZWlnbkVsZW1lbnRzID0gY29udGFpbnNGb3JlaWduRWxlbWVudHM7XG5cdFx0dGhpcy5fY2FjaGVkV2lkdGggPSAtMTtcblxuXHRcdHRoaXMuX3BpeGVsT2Zmc2V0Q2FjaGUgPSBudWxsO1xuXHRcdGlmIChyZW5kZXJMaW5lSW5wdXQuaXNMVFIpIHtcblx0XHRcdHRoaXMuX3BpeGVsT2Zmc2V0Q2FjaGUgPSBuZXcgRmxvYXQzMkFycmF5KE1hdGgubWF4KDIsIHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcubGVuZ3RoICsgMSkpO1xuXHRcdFx0Zm9yIChsZXQgY29sdW1uID0gMCwgbGVuID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5sZW5ndGg7IGNvbHVtbiA8PSBsZW47IGNvbHVtbisrKSB7XG5cdFx0XHRcdHRoaXMuX3BpeGVsT2Zmc2V0Q2FjaGVbY29sdW1uXSA9IC0xO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBSZWFkaW5nIGZyb20gdGhlIERPTSBtZXRob2RzXG5cblx0cHJvdGVjdGVkIF9nZXRSZWFkaW5nVGFyZ2V0KG15RG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+KTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiA8SFRNTFNwYW5FbGVtZW50Pm15RG9tTm9kZS5kb21Ob2RlLmZpcnN0Q2hpbGQ7XG5cdH1cblxuXHQvKipcblx0ICogV2lkdGggb2YgdGhlIGxpbmUgaW4gcGl4ZWxzXG5cdCAqL1xuXHRwdWJsaWMgZ2V0V2lkdGgoY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQgfCBudWxsKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuZG9tTm9kZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jYWNoZWRXaWR0aCA9PT0gLTEpIHtcblx0XHRcdHRoaXMuX2NhY2hlZFdpZHRoID0gdGhpcy5fZ2V0UmVhZGluZ1RhcmdldCh0aGlzLmRvbU5vZGUpLm9mZnNldFdpZHRoO1xuXHRcdFx0Y29udGV4dD8ubWFya0RpZERvbUxheW91dCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkV2lkdGg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V2lkdGhJc0Zhc3QoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlZFdpZHRoID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyByZXNldENhY2hlZFdpZHRoKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhY2hlZFdpZHRoID0gLTE7XG5cdFx0aWYgKHRoaXMuX3BpeGVsT2Zmc2V0Q2FjaGUgIT09IG51bGwpIHtcblx0XHRcdGZvciAobGV0IGNvbHVtbiA9IDAsIGxlbiA9IHRoaXMuX3BpeGVsT2Zmc2V0Q2FjaGUubGVuZ3RoOyBjb2x1bW4gPCBsZW47IGNvbHVtbisrKSB7XG5cdFx0XHRcdHRoaXMuX3BpeGVsT2Zmc2V0Q2FjaGVbY29sdW1uXSA9IC0xO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBWaXNpYmxlIHJhbmdlcyBmb3IgYSBtb2RlbCByYW5nZVxuXHQgKi9cblx0cHVibGljIGdldFZpc2libGVSYW5nZXNGb3JSYW5nZShsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBjb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCk6IEZsb2F0SG9yaXpvbnRhbFJhbmdlW10gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuZG9tTm9kZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9waXhlbE9mZnNldENhY2hlICE9PSBudWxsKSB7XG5cdFx0XHQvLyB0aGUgdGV4dCBpcyBndWFyYW50ZWVkIHRvIGJlIGVudGlyZWx5IExUUlxuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLl9yZWFkUGl4ZWxPZmZzZXQodGhpcy5kb21Ob2RlLCBsaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgY29udGV4dCk7XG5cdFx0XHRpZiAoc3RhcnRPZmZzZXQgPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLl9yZWFkUGl4ZWxPZmZzZXQodGhpcy5kb21Ob2RlLCBsaW5lTnVtYmVyLCBlbmRDb2x1bW4sIGNvbnRleHQpO1xuXHRcdFx0aWYgKGVuZE9mZnNldCA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBbbmV3IEZsb2F0SG9yaXpvbnRhbFJhbmdlKHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQgLSBzdGFydE9mZnNldCldO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZWFkVmlzaWJsZVJhbmdlc0ZvclJhbmdlKHRoaXMuZG9tTm9kZSwgbGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZENvbHVtbiwgY29udGV4dCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JlYWRWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UoZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+LCBsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBjb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCk6IEZsb2F0SG9yaXpvbnRhbFJhbmdlW10gfCBudWxsIHtcblx0XHRpZiAoc3RhcnRDb2x1bW4gPT09IGVuZENvbHVtbikge1xuXHRcdFx0Y29uc3QgcGl4ZWxPZmZzZXQgPSB0aGlzLl9yZWFkUGl4ZWxPZmZzZXQoZG9tTm9kZSwgbGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGNvbnRleHQpO1xuXHRcdFx0aWYgKHBpeGVsT2Zmc2V0ID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IEZsb2F0SG9yaXpvbnRhbFJhbmdlKHBpeGVsT2Zmc2V0LCAwKV07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZWFkUmF3VmlzaWJsZVJhbmdlc0ZvclJhbmdlKGRvbU5vZGUsIHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4sIGNvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfcmVhZFBpeGVsT2Zmc2V0KGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLmlucHV0LmlzTFRSICYmIHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBUaGlzIGxpbmUgaGFzIG5vIGNvbnRlbnRcblx0XHRcdGlmICh0aGlzLl9jb250YWluc0ZvcmVpZ25FbGVtZW50cyA9PT0gRm9yZWlnbkVsZW1lbnRUeXBlLk5vbmUpIHtcblx0XHRcdFx0Ly8gV2UgY2FuIGFzc3VtZSB0aGUgbGluZSBpcyByZWFsbHkgZW1wdHlcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29udGFpbnNGb3JlaWduRWxlbWVudHMgPT09IEZvcmVpZ25FbGVtZW50VHlwZS5BZnRlcikge1xuXHRcdFx0XHQvLyBXZSBoYXZlIGZvcmVpZ24gZWxlbWVudHMgYWZ0ZXIgdGhlIChlbXB0eSkgbGluZVxuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jb250YWluc0ZvcmVpZ25FbGVtZW50cyA9PT0gRm9yZWlnbkVsZW1lbnRUeXBlLkJlZm9yZSkge1xuXHRcdFx0XHQvLyBXZSBoYXZlIGZvcmVpZ24gZWxlbWVudHMgYmVmb3JlIHRoZSAoZW1wdHkpIGxpbmVcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0V2lkdGgoY29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBXZSBoYXZlIGZvcmVpZ24gZWxlbWVudHMgYmVmb3JlICYgYWZ0ZXIgdGhlIChlbXB0eSkgbGluZVxuXHRcdFx0Y29uc3QgcmVhZGluZ1RhcmdldCA9IHRoaXMuX2dldFJlYWRpbmdUYXJnZXQoZG9tTm9kZSk7XG5cdFx0XHRpZiAocmVhZGluZ1RhcmdldC5maXJzdENoaWxkKSB7XG5cdFx0XHRcdGNvbnRleHQubWFya0RpZERvbUxheW91dCgpO1xuXHRcdFx0XHRyZXR1cm4gKDxIVE1MU3BhbkVsZW1lbnQ+cmVhZGluZ1RhcmdldC5maXJzdENoaWxkKS5vZmZzZXRXaWR0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9waXhlbE9mZnNldENhY2hlICE9PSBudWxsKSB7XG5cdFx0XHQvLyB0aGUgdGV4dCBpcyBndWFyYW50ZWVkIHRvIGJlIExUUlxuXG5cdFx0XHRjb25zdCBjYWNoZWRQaXhlbE9mZnNldCA9IHRoaXMuX3BpeGVsT2Zmc2V0Q2FjaGVbY29sdW1uXTtcblx0XHRcdGlmIChjYWNoZWRQaXhlbE9mZnNldCAhPT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIGNhY2hlZFBpeGVsT2Zmc2V0O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9hY3R1YWxSZWFkUGl4ZWxPZmZzZXQoZG9tTm9kZSwgbGluZU51bWJlciwgY29sdW1uLCBjb250ZXh0KTtcblx0XHRcdHRoaXMuX3BpeGVsT2Zmc2V0Q2FjaGVbY29sdW1uXSA9IHJlc3VsdDtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbFJlYWRQaXhlbE9mZnNldChkb21Ob2RlLCBsaW5lTnVtYmVyLCBjb2x1bW4sIGNvbnRleHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0dWFsUmVhZFBpeGVsT2Zmc2V0KGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gVGhpcyBsaW5lIGhhcyBubyBjb250ZW50XG5cdFx0XHRjb25zdCByID0gUmFuZ2VVdGlsLnJlYWRIb3Jpem9udGFsUmFuZ2VzKHRoaXMuX2dldFJlYWRpbmdUYXJnZXQoZG9tTm9kZSksIDAsIDAsIDAsIDAsIGNvbnRleHQpO1xuXHRcdFx0aWYgKCFyIHx8IHIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByWzBdLmxlZnQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5wdXQuaXNMVFIgJiYgY29sdW1uID09PSB0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLmxlbmd0aCAmJiB0aGlzLl9pc1doaXRlc3BhY2VPbmx5ICYmIHRoaXMuX2NvbnRhaW5zRm9yZWlnbkVsZW1lbnRzID09PSBGb3JlaWduRWxlbWVudFR5cGUuTm9uZSkge1xuXHRcdFx0Ly8gVGhpcyBicmFuY2ggaGVscHMgaW4gdGhlIGNhc2Ugb2Ygd2hpdGVzcGFjZSBvbmx5IGxpbmVzIHdoaWNoIGhhdmUgYSB3aWR0aCBzZXRcblx0XHRcdHJldHVybiB0aGlzLmdldFdpZHRoKGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRvbVBvc2l0aW9uID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXREb21Qb3NpdGlvbihjb2x1bW4pO1xuXG5cdFx0Y29uc3QgciA9IFJhbmdlVXRpbC5yZWFkSG9yaXpvbnRhbFJhbmdlcyh0aGlzLl9nZXRSZWFkaW5nVGFyZ2V0KGRvbU5vZGUpLCBkb21Qb3NpdGlvbi5wYXJ0SW5kZXgsIGRvbVBvc2l0aW9uLmNoYXJJbmRleCwgZG9tUG9zaXRpb24ucGFydEluZGV4LCBkb21Qb3NpdGlvbi5jaGFySW5kZXgsIGNvbnRleHQpO1xuXHRcdGlmICghciB8fCByLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSByWzBdLmxlZnQ7XG5cdFx0aWYgKHRoaXMuaW5wdXQuaXNCYXNpY0FTQ0lJKSB7XG5cdFx0XHRjb25zdCBob3Jpem9udGFsT2Zmc2V0ID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXRIb3Jpem9udGFsT2Zmc2V0KGNvbHVtbik7XG5cdFx0XHRjb25zdCBleHBlY3RlZFJlc3VsdCA9IE1hdGgucm91bmQodGhpcy5pbnB1dC5zcGFjZVdpZHRoICogaG9yaXpvbnRhbE9mZnNldCk7XG5cdFx0XHRpZiAoTWF0aC5hYnMoZXhwZWN0ZWRSZXN1bHQgLSByZXN1bHQpIDw9IDEpIHtcblx0XHRcdFx0cmV0dXJuIGV4cGVjdGVkUmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZFJhd1Zpc2libGVSYW5nZXNGb3JSYW5nZShkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4sIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBjb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCk6IEZsb2F0SG9yaXpvbnRhbFJhbmdlW10gfCBudWxsIHtcblxuXHRcdGlmICh0aGlzLmlucHV0LmlzTFRSICYmIHN0YXJ0Q29sdW1uID09PSAxICYmIGVuZENvbHVtbiA9PT0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5sZW5ndGgpIHtcblx0XHRcdC8vIFRoaXMgYnJhbmNoIGhlbHBzIElFIHdpdGggYmlkaSB0ZXh0ICYgZ2l2ZXMgYSBwZXJmb3JtYW5jZSBib29zdCB0byBvdGhlciBicm93c2VycyB3aGVuIHJlYWRpbmcgdmlzaWJsZSByYW5nZXMgZm9yIGFuIGVudGlyZSBsaW5lXG5cblx0XHRcdHJldHVybiBbbmV3IEZsb2F0SG9yaXpvbnRhbFJhbmdlKDAsIHRoaXMuZ2V0V2lkdGgoY29udGV4dCkpXTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydERvbVBvc2l0aW9uID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXREb21Qb3NpdGlvbihzdGFydENvbHVtbik7XG5cdFx0Y29uc3QgZW5kRG9tUG9zaXRpb24gPSB0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLmdldERvbVBvc2l0aW9uKGVuZENvbHVtbik7XG5cblx0XHRyZXR1cm4gUmFuZ2VVdGlsLnJlYWRIb3Jpem9udGFsUmFuZ2VzKHRoaXMuX2dldFJlYWRpbmdUYXJnZXQoZG9tTm9kZSksIHN0YXJ0RG9tUG9zaXRpb24ucGFydEluZGV4LCBzdGFydERvbVBvc2l0aW9uLmNoYXJJbmRleCwgZW5kRG9tUG9zaXRpb24ucGFydEluZGV4LCBlbmREb21Qb3NpdGlvbi5jaGFySW5kZXgsIGNvbnRleHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNvbHVtbiBmb3IgdGhlIHRleHQgZm91bmQgYXQgYSBzcGVjaWZpYyBvZmZzZXQgaW5zaWRlIGEgcmVuZGVyZWQgZG9tIG5vZGVcblx0ICovXG5cdHB1YmxpYyBnZXRDb2x1bW5PZk5vZGVPZmZzZXQoc3Bhbk5vZGU6IEhUTUxFbGVtZW50LCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIGdldENvbHVtbk9mTm9kZU9mZnNldCh0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLCBzcGFuTm9kZSwgb2Zmc2V0KTtcblx0fVxufVxuXG5jbGFzcyBXZWJLaXRSZW5kZXJlZFZpZXdMaW5lIGV4dGVuZHMgUmVuZGVyZWRWaWV3TGluZSB7XG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVhZFZpc2libGVSYW5nZXNGb3JSYW5nZShkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4sIGxpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogRmxvYXRIb3Jpem9udGFsUmFuZ2VbXSB8IG51bGwge1xuXHRcdGNvbnN0IG91dHB1dCA9IHN1cGVyLl9yZWFkVmlzaWJsZVJhbmdlc0ZvclJhbmdlKGRvbU5vZGUsIGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4sIGNvbnRleHQpO1xuXG5cdFx0aWYgKCFvdXRwdXQgfHwgb3V0cHV0Lmxlbmd0aCA9PT0gMCB8fCBzdGFydENvbHVtbiA9PT0gZW5kQ29sdW1uIHx8IChzdGFydENvbHVtbiA9PT0gMSAmJiBlbmRDb2x1bW4gPT09IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcubGVuZ3RoKSkge1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9XG5cblx0XHQvLyBXZWJLaXQgaXMgYnVnZ3kgYW5kIHJldHVybnMgYW4gZXhwYW5kZWQgcmFuZ2UgKHRvIGNvbnRhaW4gd29yZHMgaW4gc29tZSBjYXNlcylcblx0XHQvLyBUaGUgbGFzdCBjbGllbnQgcmVjdCBpcyBlbmxhcmdlZCAoSSB0aGluaylcblx0XHRpZiAodGhpcy5pbnB1dC5pc0xUUikge1xuXHRcdFx0Ly8gVGhpcyBpcyBhbiBhdHRlbXB0IHRvIHBhdGNoIHRoaW5ncyB1cFxuXHRcdFx0Ly8gRmluZCBwb3NpdGlvbiBvZiBsYXN0IGNvbHVtblxuXHRcdFx0Y29uc3QgZW5kUGl4ZWxPZmZzZXQgPSB0aGlzLl9yZWFkUGl4ZWxPZmZzZXQoZG9tTm9kZSwgbGluZU51bWJlciwgZW5kQ29sdW1uLCBjb250ZXh0KTtcblx0XHRcdGlmIChlbmRQaXhlbE9mZnNldCAhPT0gLTEpIHtcblx0XHRcdFx0Y29uc3QgbGFzdFJhbmdlID0gb3V0cHV0W291dHB1dC5sZW5ndGggLSAxXTtcblx0XHRcdFx0aWYgKGxhc3RSYW5nZS5sZWZ0IDwgZW5kUGl4ZWxPZmZzZXQpIHtcblx0XHRcdFx0XHQvLyBUcmltIGRvd24gdGhlIHdpZHRoIG9mIHRoZSBsYXN0IHZpc2libGUgcmFuZ2UgdG8gbm90IGdvIGFmdGVyIHRoZSBsYXN0IGNvbHVtbidzIHBvc2l0aW9uXG5cdFx0XHRcdFx0bGFzdFJhbmdlLndpZHRoID0gZW5kUGl4ZWxPZmZzZXQgLSBsYXN0UmFuZ2UubGVmdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cbn1cblxuY29uc3QgY3JlYXRlUmVuZGVyZWRMaW5lOiAoZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbCwgcmVuZGVyTGluZUlucHV0OiBSZW5kZXJMaW5lSW5wdXQsIGNoYXJhY3Rlck1hcHBpbmc6IENoYXJhY3Rlck1hcHBpbmcsIGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzOiBGb3JlaWduRWxlbWVudFR5cGUpID0+IFJlbmRlcmVkVmlld0xpbmUgPSAoZnVuY3Rpb24gKCkge1xuXHRpZiAoYnJvd3Nlci5pc1dlYktpdCkge1xuXHRcdHJldHVybiBjcmVhdGVXZWJLaXRSZW5kZXJlZExpbmU7XG5cdH1cblx0cmV0dXJuIGNyZWF0ZU5vcm1hbFJlbmRlcmVkTGluZTtcbn0pKCk7XG5cbmZ1bmN0aW9uIGNyZWF0ZVdlYktpdFJlbmRlcmVkTGluZShkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsLCByZW5kZXJMaW5lSW5wdXQ6IFJlbmRlckxpbmVJbnB1dCwgY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZywgY29udGFpbnNGb3JlaWduRWxlbWVudHM6IEZvcmVpZ25FbGVtZW50VHlwZSk6IFJlbmRlcmVkVmlld0xpbmUge1xuXHRyZXR1cm4gbmV3IFdlYktpdFJlbmRlcmVkVmlld0xpbmUoZG9tTm9kZSwgcmVuZGVyTGluZUlucHV0LCBjaGFyYWN0ZXJNYXBwaW5nLCBjb250YWluc0ZvcmVpZ25FbGVtZW50cyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU5vcm1hbFJlbmRlcmVkTGluZShkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsLCByZW5kZXJMaW5lSW5wdXQ6IFJlbmRlckxpbmVJbnB1dCwgY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZywgY29udGFpbnNGb3JlaWduRWxlbWVudHM6IEZvcmVpZ25FbGVtZW50VHlwZSk6IFJlbmRlcmVkVmlld0xpbmUge1xuXHRyZXR1cm4gbmV3IFJlbmRlcmVkVmlld0xpbmUoZG9tTm9kZSwgcmVuZGVyTGluZUlucHV0LCBjaGFyYWN0ZXJNYXBwaW5nLCBjb250YWluc0ZvcmVpZ25FbGVtZW50cyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb2x1bW5PZk5vZGVPZmZzZXQoY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZywgc3Bhbk5vZGU6IEhUTUxFbGVtZW50LCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdGNvbnN0IHNwYW5Ob2RlVGV4dENvbnRlbnRMZW5ndGggPSBzcGFuTm9kZS50ZXh0Q29udGVudC5sZW5ndGg7XG5cblx0bGV0IHNwYW5JbmRleCA9IC0xO1xuXHR3aGlsZSAoc3Bhbk5vZGUpIHtcblx0XHRzcGFuTm9kZSA9IDxIVE1MRWxlbWVudD5zcGFuTm9kZS5wcmV2aW91c1NpYmxpbmc7XG5cdFx0c3BhbkluZGV4Kys7XG5cdH1cblxuXHRyZXR1cm4gY2hhcmFjdGVyTWFwcGluZy5nZXRDb2x1bW4obmV3IERvbVBvc2l0aW9uKHNwYW5JbmRleCwgb2Zmc2V0KSwgc3Bhbk5vZGVUZXh0Q29udGVudExlbmd0aCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLGFBQWE7QUFDekIsU0FBc0IseUJBQXlCO0FBQy9DLFlBQVksY0FBYztBQUUxQixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLHNCQUFzQixxQkFBcUI7QUFDcEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBMkIsb0JBQW9CLGlCQUFpQixnQkFBZ0IsYUFBYSx3QkFBd0I7QUFFckgsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFJcEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxx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QkFBeU0sV0FBWTtBQUMxTixNQUFJLFFBQVEsVUFBVTtBQUNyQixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUixHQUFHO0FBRUgsU0FBUyx5QkFBeUIsU0FBMEMsaUJBQWtDLGtCQUFvQyx5QkFBK0Q7QUFDaE4sU0FBTyxJQUFJLHVCQUF1QixTQUFTLGlCQUFpQixrQkFBa0IsdUJBQXVCO0FBQ3RHO0FBRUEsU0FBUyx5QkFBeUIsU0FBMEMsaUJBQWtDLGtCQUFvQyx5QkFBK0Q7QUFDaE4sU0FBTyxJQUFJLGlCQUFpQixTQUFTLGlCQUFpQixrQkFBa0IsdUJBQXVCO0FBQ2hHO0FBRU8sU0FBUyxzQkFBc0Isa0JBQW9DLFVBQXVCLFFBQXdCO0FBQ3hILFFBQU0sNEJBQTRCLFNBQVMsWUFBWTtBQUV2RCxNQUFJLFlBQVk7QUFDaEIsU0FBTyxVQUFVO0FBQ2hCLGVBQXdCLFNBQVM7QUFDakM7QUFBQSxFQUNEO0FBRUEsU0FBTyxpQkFBaUIsVUFBVSxJQUFJLFlBQVksV0FBVyxNQUFNLEdBQUcseUJBQXlCO0FBQ2hHOyIsCiAgIm5hbWVzIjogWyJDb25zdGFudHMiLCAiaG9yaXpvbnRhbE9mZnNldCIsICJyIl0KfQo=
