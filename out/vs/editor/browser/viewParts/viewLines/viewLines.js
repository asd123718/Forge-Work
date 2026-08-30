import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import * as platform from "../../../../base/common/platform.js";
import { Constants } from "../../../../base/common/uint.js";
import "./viewLines.css";
import { applyFontInfo } from "../../config/domFontInfo.js";
import { HorizontalPosition, HorizontalRange, LineVisibleRanges } from "../../view/renderingContext.js";
import { VisibleLinesCollection } from "../../view/viewLayer.js";
import { PartFingerprint, PartFingerprints, ViewPart } from "../../view/viewPart.js";
import { DomReadingContext } from "./domReadingContext.js";
import { ViewLine } from "./viewLine.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import * as viewEvents from "../../../common/viewEvents.js";
import { ViewLineOptions } from "./viewLineOptions.js";
import { TextDirection } from "../../../common/model.js";
class LastRenderedData {
  constructor() {
    this._currentVisibleRange = new Range(1, 1, 1, 1);
  }
  getCurrentVisibleRange() {
    return this._currentVisibleRange;
  }
  setCurrentVisibleRange(currentVisibleRange) {
    this._currentVisibleRange = currentVisibleRange;
  }
}
class HorizontalRevealRangeRequest {
  constructor(minimalReveal, lineNumber, startColumn, endColumn, startScrollTop, stopScrollTop, scrollType) {
    this.minimalReveal = minimalReveal;
    this.lineNumber = lineNumber;
    this.startColumn = startColumn;
    this.endColumn = endColumn;
    this.startScrollTop = startScrollTop;
    this.stopScrollTop = stopScrollTop;
    this.scrollType = scrollType;
    this.type = "range";
    this.minLineNumber = lineNumber;
    this.maxLineNumber = lineNumber;
  }
}
class HorizontalRevealSelectionsRequest {
  constructor(minimalReveal, selections, startScrollTop, stopScrollTop, scrollType) {
    this.minimalReveal = minimalReveal;
    this.selections = selections;
    this.startScrollTop = startScrollTop;
    this.stopScrollTop = stopScrollTop;
    this.scrollType = scrollType;
    this.type = "selections";
    let minLineNumber = selections[0].startLineNumber;
    let maxLineNumber = selections[0].endLineNumber;
    for (let i = 1, len = selections.length; i < len; i++) {
      const selection = selections[i];
      minLineNumber = Math.min(minLineNumber, selection.startLineNumber);
      maxLineNumber = Math.max(maxLineNumber, selection.endLineNumber);
    }
    this.minLineNumber = minLineNumber;
    this.maxLineNumber = maxLineNumber;
  }
}
const _ViewLines = class _ViewLines extends ViewPart {
  constructor(context, viewGpuContext, linesContent) {
    super(context);
    const conf = this._context.configuration;
    const options = this._context.configuration.options;
    const fontInfo = options.get(EditorOption.fontInfo);
    const wrappingInfo = options.get(EditorOption.wrappingInfo);
    this._lineHeight = options.get(EditorOption.lineHeight);
    this._typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
    this._isViewportWrapping = wrappingInfo.isViewportWrapping;
    this._revealHorizontalRightPadding = options.get(EditorOption.revealHorizontalRightPadding);
    this._cursorSurroundingLines = options.get(EditorOption.cursorSurroundingLines);
    this._cursorSurroundingLinesStyle = options.get(EditorOption.cursorSurroundingLinesStyle);
    this._canUseLayerHinting = !options.get(EditorOption.disableLayerHinting);
    this._viewLineOptions = new ViewLineOptions(conf, this._context.theme.type);
    this._linesContent = linesContent;
    this._textRangeRestingSpot = document.createElement("div");
    this._visibleLines = new VisibleLinesCollection(this._context, {
      createLine: () => new ViewLine(viewGpuContext, this._viewLineOptions)
    });
    this.domNode = this._visibleLines.domNode;
    PartFingerprints.write(this.domNode, PartFingerprint.ViewLines);
    this.domNode.setClassName(`view-lines ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
    applyFontInfo(this.domNode, fontInfo);
    this._maxLineWidth = 0;
    this._asyncUpdateLineWidths = new RunOnceScheduler(() => {
      this._updateLineWidthsSlow();
    }, 200);
    this._asyncCheckMonospaceFontAssumptions = new RunOnceScheduler(() => {
      this._checkMonospaceFontAssumptions();
    }, 2e3);
    this._lastRenderedData = new LastRenderedData();
    this._horizontalRevealRequest = null;
    this._stickyScrollEnabled = options.get(EditorOption.stickyScroll).enabled;
    this._maxNumberStickyLines = options.get(EditorOption.stickyScroll).maxLineCount;
  }
  dispose() {
    this._asyncUpdateLineWidths.dispose();
    this._asyncCheckMonospaceFontAssumptions.dispose();
    super.dispose();
  }
  getDomNode() {
    return this.domNode;
  }
  // ---- begin view event handlers
  onConfigurationChanged(e) {
    this._visibleLines.onConfigurationChanged(e);
    if (e.hasChanged(EditorOption.wrappingInfo)) {
      this._maxLineWidth = 0;
    }
    const options = this._context.configuration.options;
    const fontInfo = options.get(EditorOption.fontInfo);
    const wrappingInfo = options.get(EditorOption.wrappingInfo);
    this._lineHeight = options.get(EditorOption.lineHeight);
    this._typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
    this._isViewportWrapping = wrappingInfo.isViewportWrapping;
    this._revealHorizontalRightPadding = options.get(EditorOption.revealHorizontalRightPadding);
    this._cursorSurroundingLines = options.get(EditorOption.cursorSurroundingLines);
    this._cursorSurroundingLinesStyle = options.get(EditorOption.cursorSurroundingLinesStyle);
    this._canUseLayerHinting = !options.get(EditorOption.disableLayerHinting);
    this._stickyScrollEnabled = options.get(EditorOption.stickyScroll).enabled;
    this._maxNumberStickyLines = options.get(EditorOption.stickyScroll).maxLineCount;
    applyFontInfo(this.domNode, fontInfo);
    this._onOptionsMaybeChanged();
    if (e.hasChanged(EditorOption.layoutInfo)) {
      this._maxLineWidth = 0;
    }
    return true;
  }
  _onOptionsMaybeChanged() {
    const conf = this._context.configuration;
    const newViewLineOptions = new ViewLineOptions(conf, this._context.theme.type);
    if (!this._viewLineOptions.equals(newViewLineOptions)) {
      this._viewLineOptions = newViewLineOptions;
      const startLineNumber = this._visibleLines.getStartLineNumber();
      const endLineNumber = this._visibleLines.getEndLineNumber();
      for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
        const line = this._visibleLines.getVisibleLine(lineNumber);
        line.onOptionsChanged(this._viewLineOptions);
      }
      return true;
    }
    return false;
  }
  onCursorStateChanged(e) {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    let r = false;
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      r = this._visibleLines.getVisibleLine(lineNumber).onSelectionChanged() || r;
    }
    return r;
  }
  onDecorationsChanged(e) {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      this._visibleLines.getVisibleLine(lineNumber).onDecorationsChanged();
    }
    return true;
  }
  onFlushed(e) {
    const shouldRender = this._visibleLines.onFlushed(e, this._viewLineOptions.useGpu);
    this._maxLineWidth = 0;
    return shouldRender;
  }
  onLinesChanged(e) {
    return this._visibleLines.onLinesChanged(e);
  }
  onLinesDeleted(e) {
    return this._visibleLines.onLinesDeleted(e);
  }
  onLinesInserted(e) {
    return this._visibleLines.onLinesInserted(e);
  }
  onRevealRangeRequest(e) {
    const desiredScrollTop = this._computeScrollTopToRevealRange(this._context.viewLayout.getFutureViewport(), e.source, e.minimalReveal, e.range, e.selections, e.verticalType);
    if (desiredScrollTop === -1) {
      return false;
    }
    let newScrollPosition = this._context.viewLayout.validateScrollPosition({ scrollTop: desiredScrollTop });
    if (e.revealHorizontal) {
      if (e.range && e.range.startLineNumber !== e.range.endLineNumber) {
        newScrollPosition = {
          scrollTop: newScrollPosition.scrollTop,
          scrollLeft: 0
        };
      } else if (e.range) {
        this._horizontalRevealRequest = new HorizontalRevealRangeRequest(e.minimalReveal, e.range.startLineNumber, e.range.startColumn, e.range.endColumn, this._context.viewLayout.getCurrentScrollTop(), newScrollPosition.scrollTop, e.scrollType);
      } else if (e.selections && e.selections.length > 0) {
        this._horizontalRevealRequest = new HorizontalRevealSelectionsRequest(e.minimalReveal, e.selections, this._context.viewLayout.getCurrentScrollTop(), newScrollPosition.scrollTop, e.scrollType);
      }
    } else {
      this._horizontalRevealRequest = null;
    }
    const scrollTopDelta = Math.abs(this._context.viewLayout.getCurrentScrollTop() - newScrollPosition.scrollTop);
    const scrollType = scrollTopDelta <= this._lineHeight ? ScrollType.Immediate : e.scrollType;
    this._context.viewModel.viewLayout.setScrollPosition(newScrollPosition, scrollType);
    return true;
  }
  onScrollChanged(e) {
    if (this._horizontalRevealRequest && e.scrollLeftChanged) {
      this._horizontalRevealRequest = null;
    }
    if (this._horizontalRevealRequest && e.scrollTopChanged) {
      const min = Math.min(this._horizontalRevealRequest.startScrollTop, this._horizontalRevealRequest.stopScrollTop);
      const max = Math.max(this._horizontalRevealRequest.startScrollTop, this._horizontalRevealRequest.stopScrollTop);
      if (e.scrollTop < min || e.scrollTop > max) {
        this._horizontalRevealRequest = null;
      }
    }
    this.domNode.setWidth(e.scrollWidth);
    return this._visibleLines.onScrollChanged(e) || e.scrollTopChanged || e.scrollLeftChanged;
  }
  onTokensChanged(e) {
    return this._visibleLines.onTokensChanged(e);
  }
  onZonesChanged(e) {
    this._context.viewModel.viewLayout.setMaxLineWidth(this._maxLineWidth);
    return this._visibleLines.onZonesChanged(e);
  }
  onThemeChanged(e) {
    return this._onOptionsMaybeChanged();
  }
  // ---- end view event handlers
  // ----------- HELPERS FOR OTHERS
  getPositionFromDOMInfo(spanNode, offset) {
    const viewLineDomNode = this._getViewLineDomNode(spanNode);
    if (viewLineDomNode === null) {
      return null;
    }
    const lineNumber = this._getLineNumberFor(viewLineDomNode);
    if (lineNumber === -1) {
      return null;
    }
    if (lineNumber < 1 || lineNumber > this._context.viewModel.getLineCount()) {
      return null;
    }
    if (this._context.viewModel.getLineMaxColumn(lineNumber) === 1) {
      return new Position(lineNumber, 1);
    }
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
      return null;
    }
    let column = this._visibleLines.getVisibleLine(lineNumber).getColumnOfNodeOffset(spanNode, offset);
    const minColumn = this._context.viewModel.getLineMinColumn(lineNumber);
    if (column < minColumn) {
      column = minColumn;
    }
    return new Position(lineNumber, column);
  }
  _getViewLineDomNode(node) {
    while (node && node.nodeType === 1) {
      if (node.className === ViewLine.CLASS_NAME) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  /**
   * @returns the line number of this view line dom node.
   */
  _getLineNumberFor(domNode) {
    const startLineNumber = this._visibleLines.getStartLineNumber();
    const endLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const line = this._visibleLines.getVisibleLine(lineNumber);
      if (domNode === line.getDomNode()) {
        return lineNumber;
      }
    }
    return -1;
  }
  getLineWidth(lineNumber) {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
      return -1;
    }
    const context = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);
    const result = this._visibleLines.getVisibleLine(lineNumber).getWidth(context);
    this._updateLineWidthsSlowIfDomDidLayout(context);
    return result;
  }
  resetLineWidthCaches() {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      this._visibleLines.getVisibleLine(lineNumber).resetCachedWidth();
    }
  }
  linesVisibleRangesForRange(_range, includeNewLines) {
    const originalEndLineNumber = _range.endLineNumber;
    const range = Range.intersectRanges(_range, this._lastRenderedData.getCurrentVisibleRange());
    if (!range) {
      return null;
    }
    const visibleRanges = [];
    let visibleRangesLen = 0;
    const domReadingContext = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);
    let nextLineModelLineNumber = 0;
    if (includeNewLines) {
      nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
    }
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
      if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
        continue;
      }
      const startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
      const continuesInNextLine = lineNumber !== originalEndLineNumber;
      const endColumn = continuesInNextLine ? this._context.viewModel.getLineMaxColumn(lineNumber) : range.endColumn;
      const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
      const visibleRangesForLine = visibleLine.getVisibleRangesForRange(lineNumber, startColumn, endColumn, domReadingContext);
      if (!visibleRangesForLine) {
        continue;
      }
      if (includeNewLines && lineNumber < originalEndLineNumber) {
        const currentLineModelLineNumber = nextLineModelLineNumber;
        nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber + 1, 1)).lineNumber;
        if (currentLineModelLineNumber !== nextLineModelLineNumber) {
          const floatHorizontalRange = visibleRangesForLine.ranges[visibleRangesForLine.ranges.length - 1];
          floatHorizontalRange.width += this._typicalHalfwidthCharacterWidth;
          if (this._context.viewModel.getTextDirection(currentLineModelLineNumber) === TextDirection.RTL) {
            floatHorizontalRange.left -= this._typicalHalfwidthCharacterWidth;
          }
        }
      }
      visibleRanges[visibleRangesLen++] = new LineVisibleRanges(visibleRangesForLine.outsideRenderedLine, lineNumber, HorizontalRange.from(visibleRangesForLine.ranges), continuesInNextLine);
    }
    this._updateLineWidthsSlowIfDomDidLayout(domReadingContext);
    if (visibleRangesLen === 0) {
      return null;
    }
    return visibleRanges;
  }
  _visibleRangesForLineRange(lineNumber, startColumn, endColumn) {
    if (lineNumber < this._visibleLines.getStartLineNumber() || lineNumber > this._visibleLines.getEndLineNumber()) {
      return null;
    }
    const domReadingContext = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);
    const result = this._visibleLines.getVisibleLine(lineNumber).getVisibleRangesForRange(lineNumber, startColumn, endColumn, domReadingContext);
    this._updateLineWidthsSlowIfDomDidLayout(domReadingContext);
    return result;
  }
  _lineIsRenderedRTL(lineNumber) {
    if (lineNumber < this._visibleLines.getStartLineNumber() || lineNumber > this._visibleLines.getEndLineNumber()) {
      return false;
    }
    const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
    return visibleLine.isRenderedRTL();
  }
  visibleRangeForPosition(position) {
    const visibleRanges = this._visibleRangesForLineRange(position.lineNumber, position.column, position.column);
    if (!visibleRanges) {
      return null;
    }
    return new HorizontalPosition(visibleRanges.outsideRenderedLine, visibleRanges.ranges[0].left);
  }
  // --- implementation
  updateLineWidths() {
    this._updateLineWidths(false);
  }
  /**
   * Updates the max line width if it is fast to compute.
   * Returns true if all lines were taken into account.
   * Returns false if some lines need to be reevaluated (in a slow fashion).
   */
  _updateLineWidthsFast() {
    return this._updateLineWidths(true);
  }
  _updateLineWidthsSlow() {
    this._updateLineWidths(false);
  }
  /**
   * Update the line widths using DOM layout information after someone else
   * has caused a synchronous layout.
   */
  _updateLineWidthsSlowIfDomDidLayout(domReadingContext) {
    if (!domReadingContext.didDomLayout) {
      return;
    }
    if (!this._asyncUpdateLineWidths.isScheduled()) {
      return;
    }
    this._asyncUpdateLineWidths.cancel();
    this._updateLineWidthsSlow();
  }
  _updateLineWidths(fast) {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    let localMaxLineWidth = 1;
    let allWidthsComputed = true;
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
      if (fast && !visibleLine.getWidthIsFast()) {
        allWidthsComputed = false;
        continue;
      }
      localMaxLineWidth = Math.max(localMaxLineWidth, visibleLine.getWidth(null));
    }
    if (allWidthsComputed && rendStartLineNumber === 1 && rendEndLineNumber === this._context.viewModel.getLineCount()) {
      this._maxLineWidth = 0;
    }
    this._ensureMaxLineWidth(localMaxLineWidth);
    return allWidthsComputed;
  }
  _checkMonospaceFontAssumptions() {
    let longestLineNumber = -1;
    let longestWidth = -1;
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
      if (visibleLine.needsMonospaceFontCheck()) {
        const lineWidth = visibleLine.getWidth(null);
        if (lineWidth > longestWidth) {
          longestWidth = lineWidth;
          longestLineNumber = lineNumber;
        }
      }
    }
    if (longestLineNumber === -1) {
      return;
    }
    if (!this._visibleLines.getVisibleLine(longestLineNumber).monospaceAssumptionsAreValid()) {
      for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
        const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
        visibleLine.onMonospaceAssumptionsInvalidated();
      }
    }
  }
  prepareRender() {
    throw new Error("Not supported");
  }
  render() {
    throw new Error("Not supported");
  }
  renderText(viewportData) {
    this._visibleLines.renderLines(viewportData);
    this._lastRenderedData.setCurrentVisibleRange(viewportData.visibleRange);
    this.domNode.setWidth(this._context.viewLayout.getScrollWidth());
    this.domNode.setHeight(Math.min(this._context.viewLayout.getScrollHeight(), 1e6));
    if (this._horizontalRevealRequest) {
      const horizontalRevealRequest = this._horizontalRevealRequest;
      if (viewportData.startLineNumber <= horizontalRevealRequest.minLineNumber && horizontalRevealRequest.maxLineNumber <= viewportData.endLineNumber) {
        this._horizontalRevealRequest = null;
        this.onDidRender();
        const newScrollLeft = this._computeScrollLeftToReveal(horizontalRevealRequest);
        if (newScrollLeft) {
          if (!this._isViewportWrapping && !newScrollLeft.hasRTL) {
            this._ensureMaxLineWidth(newScrollLeft.maxHorizontalOffset);
          }
          this._context.viewModel.viewLayout.setScrollPosition({
            scrollLeft: newScrollLeft.scrollLeft
          }, horizontalRevealRequest.scrollType);
        }
      }
    }
    if (!this._updateLineWidthsFast()) {
      this._asyncUpdateLineWidths.schedule();
    } else {
      this._asyncUpdateLineWidths.cancel();
    }
    if (platform.isLinux && !this._asyncCheckMonospaceFontAssumptions.isScheduled()) {
      const rendStartLineNumber = this._visibleLines.getStartLineNumber();
      const rendEndLineNumber = this._visibleLines.getEndLineNumber();
      for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
        const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
        if (visibleLine.needsMonospaceFontCheck()) {
          this._asyncCheckMonospaceFontAssumptions.schedule();
          break;
        }
      }
    }
    this._linesContent.setLayerHinting(this._canUseLayerHinting);
    this._linesContent.setContain("strict");
    const adjustedScrollTop = this._context.viewLayout.getCurrentScrollTop() - viewportData.bigNumbersDelta;
    this._linesContent.setTop(-adjustedScrollTop);
    this._linesContent.setLeft(-this._context.viewLayout.getCurrentScrollLeft());
  }
  // --- width
  _ensureMaxLineWidth(lineWidth) {
    if (this._viewLineOptions.useGpu) {
      return;
    }
    const iLineWidth = Math.ceil(lineWidth);
    if (this._maxLineWidth < iLineWidth) {
      this._maxLineWidth = iLineWidth;
      this._context.viewModel.viewLayout.setMaxLineWidth(this._maxLineWidth);
    }
  }
  _computeScrollTopToRevealRange(viewport, source, minimalReveal, range, selections, verticalType) {
    const viewportStartY = viewport.top;
    const viewportHeight = viewport.height;
    const viewportEndY = viewportStartY + viewportHeight;
    let boxIsSingleRange;
    let boxStartY;
    let boxEndY;
    if (selections && selections.length > 0) {
      let minLineNumber = selections[0].startLineNumber;
      let maxLineNumber = selections[0].endLineNumber;
      for (let i = 1, len = selections.length; i < len; i++) {
        const selection = selections[i];
        minLineNumber = Math.min(minLineNumber, selection.startLineNumber);
        maxLineNumber = Math.max(maxLineNumber, selection.endLineNumber);
      }
      boxIsSingleRange = false;
      boxStartY = this._context.viewLayout.getVerticalOffsetForLineNumber(minLineNumber);
      boxEndY = this._context.viewLayout.getVerticalOffsetForLineNumber(maxLineNumber) + this._lineHeight;
    } else if (range) {
      boxIsSingleRange = true;
      boxStartY = this._context.viewLayout.getVerticalOffsetForLineNumber(range.startLineNumber);
      boxEndY = this._context.viewLayout.getVerticalOffsetForLineNumber(range.endLineNumber) + this._lineHeight;
    } else {
      return -1;
    }
    const shouldIgnoreScrollOff = (source === "mouse" || minimalReveal) && this._cursorSurroundingLinesStyle === "default";
    let paddingTop = 0;
    let paddingBottom = 0;
    if (!shouldIgnoreScrollOff) {
      const maxLinesInViewport = viewportHeight / this._lineHeight;
      const surroundingLines = Math.max(this._cursorSurroundingLines, this._stickyScrollEnabled ? this._maxNumberStickyLines : 0);
      const context = Math.min(maxLinesInViewport / 2, surroundingLines);
      paddingTop = context * this._lineHeight;
      paddingBottom = Math.max(0, context - 1) * this._lineHeight;
    } else {
      if (!minimalReveal) {
        paddingTop = this._lineHeight;
      }
    }
    if (!minimalReveal) {
      if (verticalType === viewEvents.VerticalRevealType.Simple || verticalType === viewEvents.VerticalRevealType.Bottom) {
        paddingBottom += this._lineHeight;
      }
    }
    boxStartY -= paddingTop;
    boxEndY += paddingBottom;
    let newScrollTop;
    if (boxEndY - boxStartY > viewportHeight) {
      if (!boxIsSingleRange) {
        return -1;
      }
      newScrollTop = boxStartY;
    } else if (verticalType === viewEvents.VerticalRevealType.NearTop || verticalType === viewEvents.VerticalRevealType.NearTopIfOutsideViewport) {
      if (verticalType === viewEvents.VerticalRevealType.NearTopIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) {
        newScrollTop = viewportStartY;
      } else {
        const desiredGapAbove = Math.max(5 * this._lineHeight, viewportHeight * 0.2);
        const desiredScrollTop = boxStartY - desiredGapAbove;
        const minScrollTop = boxEndY - viewportHeight;
        newScrollTop = Math.max(minScrollTop, desiredScrollTop);
      }
    } else if (verticalType === viewEvents.VerticalRevealType.Center || verticalType === viewEvents.VerticalRevealType.CenterIfOutsideViewport) {
      if (verticalType === viewEvents.VerticalRevealType.CenterIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) {
        newScrollTop = viewportStartY;
      } else {
        const boxMiddleY = (boxStartY + boxEndY) / 2;
        newScrollTop = Math.max(0, boxMiddleY - viewportHeight / 2);
      }
    } else {
      newScrollTop = this._computeMinimumScrolling(viewportStartY, viewportEndY, boxStartY, boxEndY, verticalType === viewEvents.VerticalRevealType.Top, verticalType === viewEvents.VerticalRevealType.Bottom);
    }
    return newScrollTop;
  }
  _computeScrollLeftToReveal(horizontalRevealRequest) {
    const viewport = this._context.viewLayout.getCurrentViewport();
    const layoutInfo = this._context.configuration.options.get(EditorOption.layoutInfo);
    const viewportStartX = viewport.left;
    const viewportEndX = viewportStartX + viewport.width - layoutInfo.verticalScrollbarWidth;
    let boxStartX = Constants.MAX_SAFE_SMALL_INTEGER;
    let boxEndX = 0;
    let hasRTL = false;
    if (horizontalRevealRequest.type === "range") {
      hasRTL = this._lineIsRenderedRTL(horizontalRevealRequest.lineNumber);
      const visibleRanges = this._visibleRangesForLineRange(horizontalRevealRequest.lineNumber, horizontalRevealRequest.startColumn, horizontalRevealRequest.endColumn);
      if (!visibleRanges) {
        return null;
      }
      for (const visibleRange of visibleRanges.ranges) {
        boxStartX = Math.min(boxStartX, Math.round(visibleRange.left));
        boxEndX = Math.max(boxEndX, Math.round(visibleRange.left + visibleRange.width));
      }
    } else {
      for (const selection of horizontalRevealRequest.selections) {
        if (selection.startLineNumber !== selection.endLineNumber) {
          return null;
        }
        const visibleRanges = this._visibleRangesForLineRange(selection.startLineNumber, selection.startColumn, selection.endColumn);
        hasRTL ||= this._lineIsRenderedRTL(selection.startLineNumber);
        if (!visibleRanges) {
          return null;
        }
        for (const visibleRange of visibleRanges.ranges) {
          boxStartX = Math.min(boxStartX, Math.round(visibleRange.left));
          boxEndX = Math.max(boxEndX, Math.round(visibleRange.left + visibleRange.width));
        }
      }
    }
    if (!horizontalRevealRequest.minimalReveal) {
      boxStartX = Math.max(0, boxStartX - _ViewLines.HORIZONTAL_EXTRA_PX);
      boxEndX += this._revealHorizontalRightPadding;
    }
    if (horizontalRevealRequest.type === "selections" && boxEndX - boxStartX > viewport.width) {
      return null;
    }
    const newScrollLeft = this._computeMinimumScrolling(viewportStartX, viewportEndX, boxStartX, boxEndX);
    return {
      scrollLeft: newScrollLeft,
      maxHorizontalOffset: boxEndX,
      hasRTL
    };
  }
  _computeMinimumScrolling(viewportStart, viewportEnd, boxStart, boxEnd, revealAtStart, revealAtEnd) {
    viewportStart = viewportStart | 0;
    viewportEnd = viewportEnd | 0;
    boxStart = boxStart | 0;
    boxEnd = boxEnd | 0;
    revealAtStart = !!revealAtStart;
    revealAtEnd = !!revealAtEnd;
    const viewportLength = viewportEnd - viewportStart;
    const boxLength = boxEnd - boxStart;
    if (boxLength < viewportLength) {
      if (revealAtStart) {
        return boxStart;
      }
      if (revealAtEnd) {
        return Math.max(0, boxEnd - viewportLength);
      }
      if (boxStart < viewportStart) {
        return boxStart;
      } else if (boxEnd > viewportEnd) {
        return Math.max(0, boxEnd - viewportLength);
      }
    } else {
      return boxStart;
    }
    return viewportStart;
  }
};
/**
 * Adds this amount of pixels to the right of lines (no-one wants to type near the edge of the viewport)
 */
_ViewLines.HORIZONTAL_EXTRA_PX = 30;
let ViewLines = _ViewLines;
export {
  ViewLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdQYXJ0c1xcdmlld0xpbmVzXFx2aWV3TGluZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyBNT1VTRV9DVVJTT1JfVEVYVF9DU1NfQ0xBU1NfTkFNRSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9tb3VzZUN1cnNvci9tb3VzZUN1cnNvci5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgJy4vdmlld0xpbmVzLmNzcyc7XG5pbXBvcnQgeyBhcHBseUZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vY29uZmlnL2RvbUZvbnRJbmZvLmpzJztcbmltcG9ydCB7IEhvcml6b250YWxQb3NpdGlvbiwgSG9yaXpvbnRhbFJhbmdlLCBJVmlld0xpbmVzLCBMaW5lVmlzaWJsZVJhbmdlcywgVmlzaWJsZVJhbmdlcyB9IGZyb20gJy4uLy4uL3ZpZXcvcmVuZGVyaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaXNpYmxlTGluZXNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vdmlldy92aWV3TGF5ZXIuanMnO1xuaW1wb3J0IHsgUGFydEZpbmdlcnByaW50LCBQYXJ0RmluZ2VycHJpbnRzLCBWaWV3UGFydCB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld1BhcnQuanMnO1xuaW1wb3J0IHsgRG9tUmVhZGluZ0NvbnRleHQgfSBmcm9tICcuL2RvbVJlYWRpbmdDb250ZXh0LmpzJztcbmltcG9ydCB7IFZpZXdMaW5lIH0gZnJvbSAnLi92aWV3TGluZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgKiBhcyB2aWV3RXZlbnRzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IFZpZXdwb3J0RGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lc1ZpZXdwb3J0RGF0YS5qcyc7XG5pbXBvcnQgeyBWaWV3cG9ydCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB7IFZpZXdMaW5lT3B0aW9ucyB9IGZyb20gJy4vdmlld0xpbmVPcHRpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0dwdUNvbnRleHQgfSBmcm9tICcuLi8uLi9ncHUvdmlld0dwdUNvbnRleHQuanMnO1xuaW1wb3J0IHsgVGV4dERpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5cbmNsYXNzIExhc3RSZW5kZXJlZERhdGEge1xuXG5cdHByaXZhdGUgX2N1cnJlbnRWaXNpYmxlUmFuZ2U6IFJhbmdlO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2N1cnJlbnRWaXNpYmxlUmFuZ2UgPSBuZXcgUmFuZ2UoMSwgMSwgMSwgMSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q3VycmVudFZpc2libGVSYW5nZSgpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRWaXNpYmxlUmFuZ2U7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q3VycmVudFZpc2libGVSYW5nZShjdXJyZW50VmlzaWJsZVJhbmdlOiBSYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRWaXNpYmxlUmFuZ2UgPSBjdXJyZW50VmlzaWJsZVJhbmdlO1xuXHR9XG59XG5cbmNsYXNzIEhvcml6b250YWxSZXZlYWxSYW5nZVJlcXVlc3Qge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9ICdyYW5nZSc7XG5cdHB1YmxpYyByZWFkb25seSBtaW5MaW5lTnVtYmVyOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBtYXhMaW5lTnVtYmVyOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1pbmltYWxSZXZlYWw6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRDb2x1bW46IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZW5kQ29sdW1uOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHN0YXJ0U2Nyb2xsVG9wOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHN0b3BTY3JvbGxUb3A6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2Nyb2xsVHlwZTogU2Nyb2xsVHlwZVxuXHQpIHtcblx0XHR0aGlzLm1pbkxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdHRoaXMubWF4TGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdH1cbn1cblxuY2xhc3MgSG9yaXpvbnRhbFJldmVhbFNlbGVjdGlvbnNSZXF1ZXN0IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSAnc2VsZWN0aW9ucyc7XG5cdHB1YmxpYyByZWFkb25seSBtaW5MaW5lTnVtYmVyOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBtYXhMaW5lTnVtYmVyOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1pbmltYWxSZXZlYWw6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydFNjcm9sbFRvcDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdG9wU2Nyb2xsVG9wOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNjcm9sbFR5cGU6IFNjcm9sbFR5cGVcblx0KSB7XG5cdFx0bGV0IG1pbkxpbmVOdW1iZXIgPSBzZWxlY3Rpb25zWzBdLnN0YXJ0TGluZU51bWJlcjtcblx0XHRsZXQgbWF4TGluZU51bWJlciA9IHNlbGVjdGlvbnNbMF0uZW5kTGluZU51bWJlcjtcblx0XHRmb3IgKGxldCBpID0gMSwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblx0XHRcdG1pbkxpbmVOdW1iZXIgPSBNYXRoLm1pbihtaW5MaW5lTnVtYmVyLCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdG1heExpbmVOdW1iZXIgPSBNYXRoLm1heChtYXhMaW5lTnVtYmVyLCBzZWxlY3Rpb24uZW5kTGluZU51bWJlcik7XG5cdFx0fVxuXHRcdHRoaXMubWluTGluZU51bWJlciA9IG1pbkxpbmVOdW1iZXI7XG5cdFx0dGhpcy5tYXhMaW5lTnVtYmVyID0gbWF4TGluZU51bWJlcjtcblx0fVxufVxuXG50eXBlIEhvcml6b250YWxSZXZlYWxSZXF1ZXN0ID0gSG9yaXpvbnRhbFJldmVhbFJhbmdlUmVxdWVzdCB8IEhvcml6b250YWxSZXZlYWxTZWxlY3Rpb25zUmVxdWVzdDtcblxuLyoqXG4gKiBUaGUgdmlldyBsaW5lcyBwYXJ0IGlzIHJlc3BvbnNpYmxlIGZvciByZW5kZXJpbmcgdGhlIGFjdHVhbCBjb250ZW50IG9mIGFcbiAqIGZpbGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBWaWV3TGluZXMgZXh0ZW5kcyBWaWV3UGFydCBpbXBsZW1lbnRzIElWaWV3TGluZXMge1xuXHQvKipcblx0ICogQWRkcyB0aGlzIGFtb3VudCBvZiBwaXhlbHMgdG8gdGhlIHJpZ2h0IG9mIGxpbmVzIChuby1vbmUgd2FudHMgdG8gdHlwZSBuZWFyIHRoZSBlZGdlIG9mIHRoZSB2aWV3cG9ydClcblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhPUklaT05UQUxfRVhUUkFfUFggPSAzMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lc0NvbnRlbnQ6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dFJhbmdlUmVzdGluZ1Nwb3Q6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlTGluZXM6IFZpc2libGVMaW5lc0NvbGxlY3Rpb248Vmlld0xpbmU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PjtcblxuXHQvLyAtLS0gY29uZmlnXG5cdHByaXZhdGUgX2xpbmVIZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBudW1iZXI7XG5cdHByaXZhdGUgX2lzVmlld3BvcnRXcmFwcGluZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfcmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZzogbnVtYmVyO1xuXHRwcml2YXRlIF9jdXJzb3JTdXJyb3VuZGluZ0xpbmVzOiBudW1iZXI7XG5cdHByaXZhdGUgX2N1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZTogJ2RlZmF1bHQnIHwgJ2FsbCc7XG5cdHByaXZhdGUgX2NhblVzZUxheWVySGludGluZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdmlld0xpbmVPcHRpb25zOiBWaWV3TGluZU9wdGlvbnM7XG5cblx0Ly8gLS0tIHdpZHRoXG5cdHByaXZhdGUgX21heExpbmVXaWR0aDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hc3luY1VwZGF0ZUxpbmVXaWR0aHM6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FzeW5jQ2hlY2tNb25vc3BhY2VGb250QXNzdW1wdGlvbnM6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSBfaG9yaXpvbnRhbFJldmVhbFJlcXVlc3Q6IEhvcml6b250YWxSZXZlYWxSZXF1ZXN0IHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdFJlbmRlcmVkRGF0YTogTGFzdFJlbmRlcmVkRGF0YTtcblxuXHQvLyBTdGlja3kgU2Nyb2xsXG5cdHByaXZhdGUgX3N0aWNreVNjcm9sbEVuYWJsZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX21heE51bWJlclN0aWNreUxpbmVzOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQsIHZpZXdHcHVDb250ZXh0OiBWaWV3R3B1Q29udGV4dCB8IHVuZGVmaW5lZCwgbGluZXNDb250ZW50OiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4pIHtcblx0XHRzdXBlcihjb250ZXh0KTtcblxuXHRcdGNvbnN0IGNvbmYgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb247XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCB3cmFwcGluZ0luZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvKTtcblxuXHRcdHRoaXMuX2xpbmVIZWlnaHQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0dGhpcy5fdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoID0gZm9udEluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdHRoaXMuX2lzVmlld3BvcnRXcmFwcGluZyA9IHdyYXBwaW5nSW5mby5pc1ZpZXdwb3J0V3JhcHBpbmc7XG5cdFx0dGhpcy5fcmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yZXZlYWxIb3Jpem9udGFsUmlnaHRQYWRkaW5nKTtcblx0XHR0aGlzLl9jdXJzb3JTdXJyb3VuZGluZ0xpbmVzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmN1cnNvclN1cnJvdW5kaW5nTGluZXMpO1xuXHRcdHRoaXMuX2N1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZSA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5jdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUpO1xuXHRcdHRoaXMuX2NhblVzZUxheWVySGludGluZyA9ICFvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZGlzYWJsZUxheWVySGludGluZyk7XG5cdFx0dGhpcy5fdmlld0xpbmVPcHRpb25zID0gbmV3IFZpZXdMaW5lT3B0aW9ucyhjb25mLCB0aGlzLl9jb250ZXh0LnRoZW1lLnR5cGUpO1xuXG5cdFx0dGhpcy5fbGluZXNDb250ZW50ID0gbGluZXNDb250ZW50O1xuXHRcdHRoaXMuX3RleHRSYW5nZVJlc3RpbmdTcG90ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fdmlzaWJsZUxpbmVzID0gbmV3IFZpc2libGVMaW5lc0NvbGxlY3Rpb24odGhpcy5fY29udGV4dCwge1xuXHRcdFx0Y3JlYXRlTGluZTogKCkgPT4gbmV3IFZpZXdMaW5lKHZpZXdHcHVDb250ZXh0LCB0aGlzLl92aWV3TGluZU9wdGlvbnMpLFxuXHRcdH0pO1xuXHRcdHRoaXMuZG9tTm9kZSA9IHRoaXMuX3Zpc2libGVMaW5lcy5kb21Ob2RlO1xuXG5cdFx0UGFydEZpbmdlcnByaW50cy53cml0ZSh0aGlzLmRvbU5vZGUsIFBhcnRGaW5nZXJwcmludC5WaWV3TGluZXMpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRDbGFzc05hbWUoYHZpZXctbGluZXMgJHtNT1VTRV9DVVJTT1JfVEVYVF9DU1NfQ0xBU1NfTkFNRX1gKTtcblx0XHRhcHBseUZvbnRJbmZvKHRoaXMuZG9tTm9kZSwgZm9udEluZm8pO1xuXG5cdFx0Ly8gLS0tIHdpZHRoICYgaGVpZ2h0XG5cdFx0dGhpcy5fbWF4TGluZVdpZHRoID0gMDtcblx0XHR0aGlzLl9hc3luY1VwZGF0ZUxpbmVXaWR0aHMgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVMaW5lV2lkdGhzU2xvdygpO1xuXHRcdH0sIDIwMCk7XG5cdFx0dGhpcy5fYXN5bmNDaGVja01vbm9zcGFjZUZvbnRBc3N1bXB0aW9ucyA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMuX2NoZWNrTW9ub3NwYWNlRm9udEFzc3VtcHRpb25zKCk7XG5cdFx0fSwgMjAwMCk7XG5cblx0XHR0aGlzLl9sYXN0UmVuZGVyZWREYXRhID0gbmV3IExhc3RSZW5kZXJlZERhdGEoKTtcblxuXHRcdHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0ID0gbnVsbDtcblxuXHRcdC8vIHN0aWNreSBzY3JvbGwgd2lkZ2V0XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsRW5hYmxlZCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zdGlja3lTY3JvbGwpLmVuYWJsZWQ7XG5cdFx0dGhpcy5fbWF4TnVtYmVyU3RpY2t5TGluZXMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKS5tYXhMaW5lQ291bnQ7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hc3luY1VwZGF0ZUxpbmVXaWR0aHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2FzeW5jQ2hlY2tNb25vc3BhY2VGb250QXNzdW1wdGlvbnMuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZTtcblx0fVxuXG5cdC8vIC0tLS0gYmVnaW4gdmlldyBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl92aXNpYmxlTGluZXMub25Db25maWd1cmF0aW9uQ2hhbmdlZChlKTtcblx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pKSB7XG5cdFx0XHR0aGlzLl9tYXhMaW5lV2lkdGggPSAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBmb250SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0Y29uc3Qgd3JhcHBpbmdJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5mbyk7XG5cblx0XHR0aGlzLl9saW5lSGVpZ2h0ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdHRoaXMuX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA9IGZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHR0aGlzLl9pc1ZpZXdwb3J0V3JhcHBpbmcgPSB3cmFwcGluZ0luZm8uaXNWaWV3cG9ydFdyYXBwaW5nO1xuXHRcdHRoaXMuX3JldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmcgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZyk7XG5cdFx0dGhpcy5fY3Vyc29yU3Vycm91bmRpbmdMaW5lcyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5jdXJzb3JTdXJyb3VuZGluZ0xpbmVzKTtcblx0XHR0aGlzLl9jdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uY3Vyc29yU3Vycm91bmRpbmdMaW5lc1N0eWxlKTtcblx0XHR0aGlzLl9jYW5Vc2VMYXllckhpbnRpbmcgPSAhb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmRpc2FibGVMYXllckhpbnRpbmcpO1xuXG5cdFx0Ly8gc3RpY2t5IHNjcm9sbFxuXHRcdHRoaXMuX3N0aWNreVNjcm9sbEVuYWJsZWQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKS5lbmFibGVkO1xuXHRcdHRoaXMuX21heE51bWJlclN0aWNreUxpbmVzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCkubWF4TGluZUNvdW50O1xuXG5cdFx0YXBwbHlGb250SW5mbyh0aGlzLmRvbU5vZGUsIGZvbnRJbmZvKTtcblxuXHRcdHRoaXMuX29uT3B0aW9uc01heWJlQ2hhbmdlZCgpO1xuXG5cdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbykpIHtcblx0XHRcdHRoaXMuX21heExpbmVXaWR0aCA9IDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHJpdmF0ZSBfb25PcHRpb25zTWF5YmVDaGFuZ2VkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbmYgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb247XG5cblx0XHRjb25zdCBuZXdWaWV3TGluZU9wdGlvbnMgPSBuZXcgVmlld0xpbmVPcHRpb25zKGNvbmYsIHRoaXMuX2NvbnRleHQudGhlbWUudHlwZSk7XG5cdFx0aWYgKCF0aGlzLl92aWV3TGluZU9wdGlvbnMuZXF1YWxzKG5ld1ZpZXdMaW5lT3B0aW9ucykpIHtcblx0XHRcdHRoaXMuX3ZpZXdMaW5lT3B0aW9ucyA9IG5ld1ZpZXdMaW5lT3B0aW9ucztcblxuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRsaW5lLm9uT3B0aW9uc0NoYW5nZWQodGhpcy5fdmlld0xpbmVPcHRpb25zKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25DdXJzb3JTdGF0ZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCByZW5kU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKTtcblx0XHRsZXQgciA9IGZhbHNlO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByZW5kU3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJlbmRFbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdHIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcikub25TZWxlY3Rpb25DaGFuZ2VkKCkgfHwgcjtcblx0XHR9XG5cdFx0cmV0dXJuIHI7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcmVuZFN0YXJ0TGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRjb25zdCByZW5kRW5kTGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHJlbmRTdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gcmVuZEVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpLm9uRGVjb3JhdGlvbnNDaGFuZ2VkKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkZsdXNoZWQoZTogdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2hvdWxkUmVuZGVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLm9uRmx1c2hlZChlLCB0aGlzLl92aWV3TGluZU9wdGlvbnMudXNlR3B1KTtcblx0XHR0aGlzLl9tYXhMaW5lV2lkdGggPSAwO1xuXHRcdHJldHVybiBzaG91bGRSZW5kZXI7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGVMaW5lcy5vbkxpbmVzQ2hhbmdlZChlKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0RlbGV0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZUxpbmVzLm9uTGluZXNEZWxldGVkKGUpO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzSW5zZXJ0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGVMaW5lcy5vbkxpbmVzSW5zZXJ0ZWQoZSk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uUmV2ZWFsUmFuZ2VSZXF1ZXN0KGU6IHZpZXdFdmVudHMuVmlld1JldmVhbFJhbmdlUmVxdWVzdEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gVXNpbmcgdGhlIGZ1dHVyZSB2aWV3cG9ydCBoZXJlIGluIG9yZGVyIHRvIGhhbmRsZSBtdWx0aXBsZVxuXHRcdC8vIGluY29taW5nIHJldmVhbCByYW5nZSByZXF1ZXN0cyB0aGF0IG1pZ2h0IGFsbCBkZXNpcmUgdG8gYmUgYW5pbWF0ZWRcblx0XHRjb25zdCBkZXNpcmVkU2Nyb2xsVG9wID0gdGhpcy5fY29tcHV0ZVNjcm9sbFRvcFRvUmV2ZWFsUmFuZ2UodGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEZ1dHVyZVZpZXdwb3J0KCksIGUuc291cmNlLCBlLm1pbmltYWxSZXZlYWwsIGUucmFuZ2UsIGUuc2VsZWN0aW9ucywgZS52ZXJ0aWNhbFR5cGUpO1xuXG5cdFx0aWYgKGRlc2lyZWRTY3JvbGxUb3AgPT09IC0xKSB7XG5cdFx0XHQvLyBtYXJrZXIgdG8gYWJvcnQgdGhlIHJldmVhbCByYW5nZSByZXF1ZXN0XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gdmFsaWRhdGUgdGhlIG5ldyBkZXNpcmVkIHNjcm9sbCB0b3Bcblx0XHRsZXQgbmV3U2Nyb2xsUG9zaXRpb24gPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQudmFsaWRhdGVTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogZGVzaXJlZFNjcm9sbFRvcCB9KTtcblxuXHRcdGlmIChlLnJldmVhbEhvcml6b250YWwpIHtcblx0XHRcdGlmIChlLnJhbmdlICYmIGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBlLnJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gVHdvIG9yIG1vcmUgbGluZXM/ID0+IHNjcm9sbCB0byBiYXNlIChUaGF0J3MgaG93IHlvdSBzZWUgbW9zdCBvZiB0aGUgdHdvIGxpbmVzKVxuXHRcdFx0XHRuZXdTY3JvbGxQb3NpdGlvbiA9IHtcblx0XHRcdFx0XHRzY3JvbGxUb3A6IG5ld1Njcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCxcblx0XHRcdFx0XHRzY3JvbGxMZWZ0OiAwXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKGUucmFuZ2UpIHtcblx0XHRcdFx0Ly8gV2UgZG9uJ3QgbmVjZXNzYXJpbHkga25vdyB0aGUgaG9yaXpvbnRhbCBvZmZzZXQgb2YgdGhpcyByYW5nZSBzaW5jZSB0aGUgbGluZSBtaWdodCBub3QgYmUgaW4gdGhlIHZpZXcuLi5cblx0XHRcdFx0dGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3QgPSBuZXcgSG9yaXpvbnRhbFJldmVhbFJhbmdlUmVxdWVzdChlLm1pbmltYWxSZXZlYWwsIGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBlLnJhbmdlLnN0YXJ0Q29sdW1uLCBlLnJhbmdlLmVuZENvbHVtbiwgdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKSwgbmV3U2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wLCBlLnNjcm9sbFR5cGUpO1xuXHRcdFx0fSBlbHNlIGlmIChlLnNlbGVjdGlvbnMgJiYgZS5zZWxlY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3QgPSBuZXcgSG9yaXpvbnRhbFJldmVhbFNlbGVjdGlvbnNSZXF1ZXN0KGUubWluaW1hbFJldmVhbCwgZS5zZWxlY3Rpb25zLCB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbFRvcCgpLCBuZXdTY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3AsIGUuc2Nyb2xsVHlwZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0ID0gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxUb3BEZWx0YSA9IE1hdGguYWJzKHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCkgLSBuZXdTY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3ApO1xuXHRcdGNvbnN0IHNjcm9sbFR5cGUgPSAoc2Nyb2xsVG9wRGVsdGEgPD0gdGhpcy5fbGluZUhlaWdodCA/IFNjcm9sbFR5cGUuSW1tZWRpYXRlIDogZS5zY3JvbGxUeXBlKTtcblx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC52aWV3TGF5b3V0LnNldFNjcm9sbFBvc2l0aW9uKG5ld1Njcm9sbFBvc2l0aW9uLCBzY3JvbGxUeXBlKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblNjcm9sbENoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0ICYmIGUuc2Nyb2xsTGVmdENoYW5nZWQpIHtcblx0XHRcdC8vIGNhbmNlbCBhbnkgb3V0c3RhbmRpbmcgaG9yaXpvbnRhbCByZXZlYWwgcmVxdWVzdCBpZiBzb21lb25lIGVsc2Ugc2Nyb2xscyBob3Jpem9udGFsbHkuXG5cdFx0XHR0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdCA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdCAmJiBlLnNjcm9sbFRvcENoYW5nZWQpIHtcblx0XHRcdGNvbnN0IG1pbiA9IE1hdGgubWluKHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0LnN0YXJ0U2Nyb2xsVG9wLCB0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5zdG9wU2Nyb2xsVG9wKTtcblx0XHRcdGNvbnN0IG1heCA9IE1hdGgubWF4KHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0LnN0YXJ0U2Nyb2xsVG9wLCB0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5zdG9wU2Nyb2xsVG9wKTtcblx0XHRcdGlmIChlLnNjcm9sbFRvcCA8IG1pbiB8fCBlLnNjcm9sbFRvcCA+IG1heCkge1xuXHRcdFx0XHQvLyBjYW5jZWwgYW55IG91dHN0YW5kaW5nIGhvcml6b250YWwgcmV2ZWFsIHJlcXVlc3QgaWYgc29tZW9uZSBlbHNlIHNjcm9sbHMgdmVydGljYWxseS5cblx0XHRcdFx0dGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3QgPSBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmRvbU5vZGUuc2V0V2lkdGgoZS5zY3JvbGxXaWR0aCk7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGVMaW5lcy5vblNjcm9sbENoYW5nZWQoZSkgfHwgZS5zY3JvbGxUb3BDaGFuZ2VkIHx8IGUuc2Nyb2xsTGVmdENoYW5nZWQ7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Ub2tlbnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1Rva2Vuc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlTGluZXMub25Ub2tlbnNDaGFuZ2VkKGUpO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblpvbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdab25lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2NvbnRleHQudmlld01vZGVsLnZpZXdMYXlvdXQuc2V0TWF4TGluZVdpZHRoKHRoaXMuX21heExpbmVXaWR0aCk7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGVMaW5lcy5vblpvbmVzQ2hhbmdlZChlKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25UaGVtZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3VGhlbWVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fb25PcHRpb25zTWF5YmVDaGFuZ2VkKCk7XG5cdH1cblxuXHQvLyAtLS0tIGVuZCB2aWV3IGV2ZW50IGhhbmRsZXJzXG5cblx0Ly8gLS0tLS0tLS0tLS0gSEVMUEVSUyBGT1IgT1RIRVJTXG5cblx0cHVibGljIGdldFBvc2l0aW9uRnJvbURPTUluZm8oc3Bhbk5vZGU6IEhUTUxFbGVtZW50LCBvZmZzZXQ6IG51bWJlcik6IFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0Y29uc3Qgdmlld0xpbmVEb21Ob2RlID0gdGhpcy5fZ2V0Vmlld0xpbmVEb21Ob2RlKHNwYW5Ob2RlKTtcblx0XHRpZiAodmlld0xpbmVEb21Ob2RlID09PSBudWxsKSB7XG5cdFx0XHQvLyBDb3VsZG4ndCBmaW5kIHZpZXcgbGluZSBub2RlXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX2dldExpbmVOdW1iZXJGb3Iodmlld0xpbmVEb21Ob2RlKTtcblxuXHRcdGlmIChsaW5lTnVtYmVyID09PSAtMSkge1xuXHRcdFx0Ly8gQ291bGRuJ3QgZmluZCB2aWV3IGxpbmUgbm9kZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmVOdW1iZXIgPCAxIHx8IGxpbmVOdW1iZXIgPiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0Ly8gbGluZU51bWJlciBpcyBvdXRzaWRlIHJhbmdlXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSA9PT0gMSkge1xuXHRcdFx0Ly8gTGluZSBpcyBlbXB0eVxuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCAxKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKTtcblx0XHRpZiAobGluZU51bWJlciA8IHJlbmRTdGFydExpbmVOdW1iZXIgfHwgbGluZU51bWJlciA+IHJlbmRFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBDb3VsZG4ndCBmaW5kIGxpbmVcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCBjb2x1bW4gPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcikuZ2V0Q29sdW1uT2ZOb2RlT2Zmc2V0KHNwYW5Ob2RlLCBvZmZzZXQpO1xuXHRcdGNvbnN0IG1pbkNvbHVtbiA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVNaW5Db2x1bW4obGluZU51bWJlcik7XG5cdFx0aWYgKGNvbHVtbiA8IG1pbkNvbHVtbikge1xuXHRcdFx0Y29sdW1uID0gbWluQ29sdW1uO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWaWV3TGluZURvbU5vZGUobm9kZTogSFRNTEVsZW1lbnQgfCBudWxsKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHR3aGlsZSAobm9kZSAmJiBub2RlLm5vZGVUeXBlID09PSAxKSB7XG5cdFx0XHRpZiAobm9kZS5jbGFzc05hbWUgPT09IFZpZXdMaW5lLkNMQVNTX05BTUUpIHtcblx0XHRcdFx0cmV0dXJuIG5vZGU7XG5cdFx0XHR9XG5cdFx0XHRub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyB0aGUgbGluZSBudW1iZXIgb2YgdGhpcyB2aWV3IGxpbmUgZG9tIG5vZGUuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRMaW5lTnVtYmVyRm9yKGRvbU5vZGU6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcik7XG5cdFx0XHRpZiAoZG9tTm9kZSA9PT0gbGluZS5nZXREb21Ob2RlKCkpIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVOdW1iZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lV2lkdGgobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCByZW5kU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKTtcblx0XHRpZiAobGluZU51bWJlciA8IHJlbmRTdGFydExpbmVOdW1iZXIgfHwgbGluZU51bWJlciA+IHJlbmRFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBDb3VsZG4ndCBmaW5kIGxpbmVcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0ID0gbmV3IERvbVJlYWRpbmdDb250ZXh0KHRoaXMuZG9tTm9kZS5kb21Ob2RlLCB0aGlzLl90ZXh0UmFuZ2VSZXN0aW5nU3BvdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpLmdldFdpZHRoKGNvbnRleHQpO1xuXHRcdHRoaXMuX3VwZGF0ZUxpbmVXaWR0aHNTbG93SWZEb21EaWRMYXlvdXQoY29udGV4dCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHJlc2V0TGluZVdpZHRoQ2FjaGVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRTdGFydExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgcmVuZEVuZExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByZW5kU3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJlbmRFbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKS5yZXNldENhY2hlZFdpZHRoKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGxpbmVzVmlzaWJsZVJhbmdlc0ZvclJhbmdlKF9yYW5nZTogUmFuZ2UsIGluY2x1ZGVOZXdMaW5lczogYm9vbGVhbik6IExpbmVWaXNpYmxlUmFuZ2VzW10gfCBudWxsIHtcblx0XHRjb25zdCBvcmlnaW5hbEVuZExpbmVOdW1iZXIgPSBfcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmludGVyc2VjdFJhbmdlcyhfcmFuZ2UsIHRoaXMuX2xhc3RSZW5kZXJlZERhdGEuZ2V0Q3VycmVudFZpc2libGVSYW5nZSgpKTtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzOiBMaW5lVmlzaWJsZVJhbmdlc1tdID0gW107XG5cdFx0bGV0IHZpc2libGVSYW5nZXNMZW4gPSAwO1xuXHRcdGNvbnN0IGRvbVJlYWRpbmdDb250ZXh0ID0gbmV3IERvbVJlYWRpbmdDb250ZXh0KHRoaXMuZG9tTm9kZS5kb21Ob2RlLCB0aGlzLl90ZXh0UmFuZ2VSZXN0aW5nU3BvdCk7XG5cblx0XHRsZXQgbmV4dExpbmVNb2RlbExpbmVOdW1iZXI6IG51bWJlciA9IDA7XG5cdFx0aWYgKGluY2x1ZGVOZXdMaW5lcykge1xuXHRcdFx0bmV4dExpbmVNb2RlbExpbmVOdW1iZXIgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG5ldyBQb3NpdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpKS5saW5lTnVtYmVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRTdGFydExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgcmVuZEVuZExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cblx0XHRcdGlmIChsaW5lTnVtYmVyIDwgcmVuZFN0YXJ0TGluZU51bWJlciB8fCBsaW5lTnVtYmVyID4gcmVuZEVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gbGluZU51bWJlciA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID8gcmFuZ2Uuc3RhcnRDb2x1bW4gOiAxO1xuXHRcdFx0Y29uc3QgY29udGludWVzSW5OZXh0TGluZSA9IGxpbmVOdW1iZXIgIT09IG9yaWdpbmFsRW5kTGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IGNvbnRpbnVlc0luTmV4dExpbmUgPyB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpIDogcmFuZ2UuZW5kQ29sdW1uO1xuXHRcdFx0Y29uc3QgdmlzaWJsZUxpbmUgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzRm9yTGluZSA9IHZpc2libGVMaW5lLmdldFZpc2libGVSYW5nZXNGb3JSYW5nZShsaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kQ29sdW1uLCBkb21SZWFkaW5nQ29udGV4dCk7XG5cblx0XHRcdGlmICghdmlzaWJsZVJhbmdlc0ZvckxpbmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbmNsdWRlTmV3TGluZXMgJiYgbGluZU51bWJlciA8IG9yaWdpbmFsRW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50TGluZU1vZGVsTGluZU51bWJlciA9IG5leHRMaW5lTW9kZWxMaW5lTnVtYmVyO1xuXHRcdFx0XHRuZXh0TGluZU1vZGVsTGluZU51bWJlciA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24obmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIgKyAxLCAxKSkubGluZU51bWJlcjtcblxuXHRcdFx0XHRpZiAoY3VycmVudExpbmVNb2RlbExpbmVOdW1iZXIgIT09IG5leHRMaW5lTW9kZWxMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmxvYXRIb3Jpem9udGFsUmFuZ2UgPSB2aXNpYmxlUmFuZ2VzRm9yTGluZS5yYW5nZXNbdmlzaWJsZVJhbmdlc0ZvckxpbmUucmFuZ2VzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdGZsb2F0SG9yaXpvbnRhbFJhbmdlLndpZHRoICs9IHRoaXMuX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHRcdFx0XHRpZiAodGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0VGV4dERpcmVjdGlvbihjdXJyZW50TGluZU1vZGVsTGluZU51bWJlcikgPT09IFRleHREaXJlY3Rpb24uUlRMKSB7XG5cdFx0XHRcdFx0XHRmbG9hdEhvcml6b250YWxSYW5nZS5sZWZ0IC09IHRoaXMuX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dmlzaWJsZVJhbmdlc1t2aXNpYmxlUmFuZ2VzTGVuKytdID0gbmV3IExpbmVWaXNpYmxlUmFuZ2VzKHZpc2libGVSYW5nZXNGb3JMaW5lLm91dHNpZGVSZW5kZXJlZExpbmUsIGxpbmVOdW1iZXIsIEhvcml6b250YWxSYW5nZS5mcm9tKHZpc2libGVSYW5nZXNGb3JMaW5lLnJhbmdlcyksIGNvbnRpbnVlc0luTmV4dExpbmUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3VwZGF0ZUxpbmVXaWR0aHNTbG93SWZEb21EaWRMYXlvdXQoZG9tUmVhZGluZ0NvbnRleHQpO1xuXG5cdFx0aWYgKHZpc2libGVSYW5nZXNMZW4gPT09IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB2aXNpYmxlUmFuZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmlzaWJsZVJhbmdlc0ZvckxpbmVSYW5nZShsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyKTogVmlzaWJsZVJhbmdlcyB8IG51bGwge1xuXHRcdGlmIChsaW5lTnVtYmVyIDwgdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpIHx8IGxpbmVOdW1iZXIgPiB0aGlzLl92aXNpYmxlTGluZXMuZ2V0RW5kTGluZU51bWJlcigpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBkb21SZWFkaW5nQ29udGV4dCA9IG5ldyBEb21SZWFkaW5nQ29udGV4dCh0aGlzLmRvbU5vZGUuZG9tTm9kZSwgdGhpcy5fdGV4dFJhbmdlUmVzdGluZ1Nwb3QpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKS5nZXRWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UobGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZENvbHVtbiwgZG9tUmVhZGluZ0NvbnRleHQpO1xuXHRcdHRoaXMuX3VwZGF0ZUxpbmVXaWR0aHNTbG93SWZEb21EaWRMYXlvdXQoZG9tUmVhZGluZ0NvbnRleHQpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2xpbmVJc1JlbmRlcmVkUlRMKGxpbmVOdW1iZXI6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmIChsaW5lTnVtYmVyIDwgdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpIHx8IGxpbmVOdW1iZXIgPiB0aGlzLl92aXNpYmxlTGluZXMuZ2V0RW5kTGluZU51bWJlcigpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHZpc2libGVMaW5lID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB2aXNpYmxlTGluZS5pc1JlbmRlcmVkUlRMKCk7XG5cdH1cblxuXHRwdWJsaWMgdmlzaWJsZVJhbmdlRm9yUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogSG9yaXpvbnRhbFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuX3Zpc2libGVSYW5nZXNGb3JMaW5lUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdGlmICghdmlzaWJsZVJhbmdlcykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgSG9yaXpvbnRhbFBvc2l0aW9uKHZpc2libGVSYW5nZXMub3V0c2lkZVJlbmRlcmVkTGluZSwgdmlzaWJsZVJhbmdlcy5yYW5nZXNbMF0ubGVmdCk7XG5cdH1cblxuXHQvLyAtLS0gaW1wbGVtZW50YXRpb25cblxuXHRwdWJsaWMgdXBkYXRlTGluZVdpZHRocygpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVMaW5lV2lkdGhzKGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBtYXggbGluZSB3aWR0aCBpZiBpdCBpcyBmYXN0IHRvIGNvbXB1dGUuXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiBhbGwgbGluZXMgd2VyZSB0YWtlbiBpbnRvIGFjY291bnQuXG5cdCAqIFJldHVybnMgZmFsc2UgaWYgc29tZSBsaW5lcyBuZWVkIHRvIGJlIHJlZXZhbHVhdGVkIChpbiBhIHNsb3cgZmFzaGlvbikuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVMaW5lV2lkdGhzRmFzdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdXBkYXRlTGluZVdpZHRocyh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxpbmVXaWR0aHNTbG93KCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUxpbmVXaWR0aHMoZmFsc2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgbGluZSB3aWR0aHMgdXNpbmcgRE9NIGxheW91dCBpbmZvcm1hdGlvbiBhZnRlciBzb21lb25lIGVsc2Vcblx0ICogaGFzIGNhdXNlZCBhIHN5bmNocm9ub3VzIGxheW91dC5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUxpbmVXaWR0aHNTbG93SWZEb21EaWRMYXlvdXQoZG9tUmVhZGluZ0NvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0aWYgKCFkb21SZWFkaW5nQ29udGV4dC5kaWREb21MYXlvdXQpIHtcblx0XHRcdC8vIG9ubHkgcHJvY2VlZCBpZiB3ZSBqdXN0IGRpZCBhIGxheW91dFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2FzeW5jVXBkYXRlTGluZVdpZHRocy5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHQvLyByZWFkaW5nIHdpZHRocyBpcyBub3Qgc2NoZWR1bGVkID0+IHdpZHRocyBhcmUgdXAtdG8tZGF0ZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hc3luY1VwZGF0ZUxpbmVXaWR0aHMuY2FuY2VsKCk7XG5cdFx0dGhpcy5fdXBkYXRlTGluZVdpZHRoc1Nsb3coKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxpbmVXaWR0aHMoZmFzdDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlbmRTdGFydExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgcmVuZEVuZExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXG5cdFx0bGV0IGxvY2FsTWF4TGluZVdpZHRoID0gMTtcblx0XHRsZXQgYWxsV2lkdGhzQ29tcHV0ZWQgPSB0cnVlO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByZW5kU3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJlbmRFbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IHZpc2libGVMaW5lID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpO1xuXG5cdFx0XHRpZiAoZmFzdCAmJiAhdmlzaWJsZUxpbmUuZ2V0V2lkdGhJc0Zhc3QoKSkge1xuXHRcdFx0XHQvLyBDYW5ub3QgY29tcHV0ZSB3aWR0aCBpbiBhIGZhc3Qgd2F5IGZvciB0aGlzIGxpbmVcblx0XHRcdFx0YWxsV2lkdGhzQ29tcHV0ZWQgPSBmYWxzZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGxvY2FsTWF4TGluZVdpZHRoID0gTWF0aC5tYXgobG9jYWxNYXhMaW5lV2lkdGgsIHZpc2libGVMaW5lLmdldFdpZHRoKG51bGwpKTtcblx0XHR9XG5cblx0XHRpZiAoYWxsV2lkdGhzQ29tcHV0ZWQgJiYgcmVuZFN0YXJ0TGluZU51bWJlciA9PT0gMSAmJiByZW5kRW5kTGluZU51bWJlciA9PT0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdC8vIHdlIGtub3cgdGhlIG1heCBsaW5lIHdpZHRoIGZvciBhbGwgdGhlIGxpbmVzXG5cdFx0XHR0aGlzLl9tYXhMaW5lV2lkdGggPSAwO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Vuc3VyZU1heExpbmVXaWR0aChsb2NhbE1heExpbmVXaWR0aCk7XG5cblx0XHRyZXR1cm4gYWxsV2lkdGhzQ29tcHV0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja01vbm9zcGFjZUZvbnRBc3N1bXB0aW9ucygpOiB2b2lkIHtcblx0XHQvLyBQcm9ibGVtcyB3aXRoIG1vbm9zcGFjZSBhc3N1bXB0aW9ucyBhcmUgbW9yZSBhcHBhcmVudCBmb3IgbG9uZ2VyIGxpbmVzLFxuXHRcdC8vIGFzIHNtYWxsIHJvdW5kaW5nIGVycm9ycyBzdGFydCB0byBzdW0gdXAsIHNvIHdlIHdpbGwgc2VsZWN0IHRoZSBsb25nZXN0XG5cdFx0Ly8gbGluZSBmb3IgYSBjbG9zZXIgaW5zcGVjdGlvblxuXHRcdGxldCBsb25nZXN0TGluZU51bWJlciA9IC0xO1xuXHRcdGxldCBsb25nZXN0V2lkdGggPSAtMTtcblx0XHRjb25zdCByZW5kU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmVuZFN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSByZW5kRW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlTGluZSA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKTtcblx0XHRcdGlmICh2aXNpYmxlTGluZS5uZWVkc01vbm9zcGFjZUZvbnRDaGVjaygpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVXaWR0aCA9IHZpc2libGVMaW5lLmdldFdpZHRoKG51bGwpO1xuXHRcdFx0XHRpZiAobGluZVdpZHRoID4gbG9uZ2VzdFdpZHRoKSB7XG5cdFx0XHRcdFx0bG9uZ2VzdFdpZHRoID0gbGluZVdpZHRoO1xuXHRcdFx0XHRcdGxvbmdlc3RMaW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChsb25nZXN0TGluZU51bWJlciA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsb25nZXN0TGluZU51bWJlcikubW9ub3NwYWNlQXNzdW1wdGlvbnNBcmVWYWxpZCgpKSB7XG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmVuZFN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSByZW5kRW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVMaW5lID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHR2aXNpYmxlTGluZS5vbk1vbm9zcGFjZUFzc3VtcHRpb25zSW52YWxpZGF0ZWQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcHJlcGFyZVJlbmRlcigpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyVGV4dCh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IHZvaWQge1xuXHRcdC8vICgxKSByZW5kZXIgbGluZXMgLSBlbnN1cmVzIGxpbmVzIGFyZSBpbiB0aGUgRE9NXG5cdFx0dGhpcy5fdmlzaWJsZUxpbmVzLnJlbmRlckxpbmVzKHZpZXdwb3J0RGF0YSk7XG5cdFx0dGhpcy5fbGFzdFJlbmRlcmVkRGF0YS5zZXRDdXJyZW50VmlzaWJsZVJhbmdlKHZpZXdwb3J0RGF0YS52aXNpYmxlUmFuZ2UpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRXaWR0aCh0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0U2Nyb2xsV2lkdGgoKSk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEhlaWdodChNYXRoLm1pbih0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0U2Nyb2xsSGVpZ2h0KCksIDEwMDAwMDApKTtcblxuXHRcdC8vICgyKSBjb21wdXRlIGhvcml6b250YWwgc2Nyb2xsIHBvc2l0aW9uOlxuXHRcdC8vICAtIHRoaXMgbXVzdCBoYXBwZW4gYWZ0ZXIgdGhlIGxpbmVzIGFyZSBpbiB0aGUgRE9NIHNpbmNlIGl0IG1pZ2h0IG5lZWQgYSBsaW5lIHRoYXQgcmVuZGVyZWQganVzdCBub3dcblx0XHQvLyAgLSBpdCBtaWdodCBjaGFuZ2UgYHNjcm9sbFdpZHRoYCBhbmQgYHNjcm9sbExlZnRgXG5cdFx0aWYgKHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0KSB7XG5cblx0XHRcdGNvbnN0IGhvcml6b250YWxSZXZlYWxSZXF1ZXN0ID0gdGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3Q7XG5cblx0XHRcdC8vIENoZWNrIHRoYXQgd2UgaGF2ZSB0aGUgbGluZSB0aGF0IGNvbnRhaW5zIHRoZSBob3Jpem9udGFsIHJhbmdlIGluIHRoZSB2aWV3cG9ydFxuXHRcdFx0aWYgKHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIgPD0gaG9yaXpvbnRhbFJldmVhbFJlcXVlc3QubWluTGluZU51bWJlciAmJiBob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5tYXhMaW5lTnVtYmVyIDw9IHZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyKSB7XG5cblx0XHRcdFx0dGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3QgPSBudWxsO1xuXG5cdFx0XHRcdC8vIGFsbG93IGB2aXNpYmxlUmFuZ2VzRm9yUmFuZ2UyYCB0byB3b3JrXG5cdFx0XHRcdHRoaXMub25EaWRSZW5kZXIoKTtcblxuXHRcdFx0XHQvLyBjb21wdXRlIG5ldyBzY3JvbGwgcG9zaXRpb25cblx0XHRcdFx0Y29uc3QgbmV3U2Nyb2xsTGVmdCA9IHRoaXMuX2NvbXB1dGVTY3JvbGxMZWZ0VG9SZXZlYWwoaG9yaXpvbnRhbFJldmVhbFJlcXVlc3QpO1xuXG5cdFx0XHRcdGlmIChuZXdTY3JvbGxMZWZ0KSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9pc1ZpZXdwb3J0V3JhcHBpbmcgJiYgIW5ld1Njcm9sbExlZnQuaGFzUlRMKSB7XG5cdFx0XHRcdFx0XHQvLyBlbnN1cmUgYHNjcm9sbFdpZHRoYCBpcyBsYXJnZSBlbm91Z2hcblx0XHRcdFx0XHRcdHRoaXMuX2Vuc3VyZU1heExpbmVXaWR0aChuZXdTY3JvbGxMZWZ0Lm1heEhvcml6b250YWxPZmZzZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBzZXQgYHNjcm9sbExlZnRgXG5cdFx0XHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwudmlld0xheW91dC5zZXRTY3JvbGxQb3NpdGlvbih7XG5cdFx0XHRcdFx0XHRzY3JvbGxMZWZ0OiBuZXdTY3JvbGxMZWZ0LnNjcm9sbExlZnRcblx0XHRcdFx0XHR9LCBob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5zY3JvbGxUeXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBtYXggbGluZSB3aWR0aCAobm90IHNvIGltcG9ydGFudCwgaXQgaXMganVzdCBzbyB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgZG9lc24ndCBnZXQgdG9vIHNtYWxsKVxuXHRcdGlmICghdGhpcy5fdXBkYXRlTGluZVdpZHRoc0Zhc3QoKSkge1xuXHRcdFx0Ly8gQ29tcHV0aW5nIHRoZSB3aWR0aCBvZiBzb21lIGxpbmVzIHdvdWxkIGJlIHNsb3cgPT4gZGVsYXkgaXRcblx0XHRcdHRoaXMuX2FzeW5jVXBkYXRlTGluZVdpZHRocy5zY2hlZHVsZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hc3luY1VwZGF0ZUxpbmVXaWR0aHMuY2FuY2VsKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHBsYXRmb3JtLmlzTGludXggJiYgIXRoaXMuX2FzeW5jQ2hlY2tNb25vc3BhY2VGb250QXNzdW1wdGlvbnMuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0Y29uc3QgcmVuZFN0YXJ0TGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKTtcblx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByZW5kU3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJlbmRFbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0Y29uc3QgdmlzaWJsZUxpbmUgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcik7XG5cdFx0XHRcdGlmICh2aXNpYmxlTGluZS5uZWVkc01vbm9zcGFjZUZvbnRDaGVjaygpKSB7XG5cdFx0XHRcdFx0dGhpcy5fYXN5bmNDaGVja01vbm9zcGFjZUZvbnRBc3N1bXB0aW9ucy5zY2hlZHVsZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gKDMpIGhhbmRsZSBzY3JvbGxpbmdcblx0XHR0aGlzLl9saW5lc0NvbnRlbnQuc2V0TGF5ZXJIaW50aW5nKHRoaXMuX2NhblVzZUxheWVySGludGluZyk7XG5cdFx0dGhpcy5fbGluZXNDb250ZW50LnNldENvbnRhaW4oJ3N0cmljdCcpO1xuXHRcdGNvbnN0IGFkanVzdGVkU2Nyb2xsVG9wID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKSAtIHZpZXdwb3J0RGF0YS5iaWdOdW1iZXJzRGVsdGE7XG5cdFx0dGhpcy5fbGluZXNDb250ZW50LnNldFRvcCgtYWRqdXN0ZWRTY3JvbGxUb3ApO1xuXHRcdHRoaXMuX2xpbmVzQ29udGVudC5zZXRMZWZ0KC10aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbExlZnQoKSk7XG5cdH1cblxuXHQvLyAtLS0gd2lkdGhcblxuXHRwcml2YXRlIF9lbnN1cmVNYXhMaW5lV2lkdGgobGluZVdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBXaGVuIEdQVSByZW5kZXJpbmcgaXMgZW5hYmxlZCwgVmlld0xpbmVzR3B1IGhhbmRsZXMgbWF4IGxpbmUgd2lkdGggdHJhY2tpbmdcblx0XHRpZiAodGhpcy5fdmlld0xpbmVPcHRpb25zLnVzZUdwdSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpTGluZVdpZHRoID0gTWF0aC5jZWlsKGxpbmVXaWR0aCk7XG5cdFx0aWYgKHRoaXMuX21heExpbmVXaWR0aCA8IGlMaW5lV2lkdGgpIHtcblx0XHRcdHRoaXMuX21heExpbmVXaWR0aCA9IGlMaW5lV2lkdGg7XG5cdFx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC52aWV3TGF5b3V0LnNldE1heExpbmVXaWR0aCh0aGlzLl9tYXhMaW5lV2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVTY3JvbGxUb3BUb1JldmVhbFJhbmdlKHZpZXdwb3J0OiBWaWV3cG9ydCwgc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBtaW5pbWFsUmV2ZWFsOiBib29sZWFuLCByYW5nZTogUmFuZ2UgfCBudWxsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSB8IG51bGwsIHZlcnRpY2FsVHlwZTogdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUpOiBudW1iZXIge1xuXHRcdGNvbnN0IHZpZXdwb3J0U3RhcnRZID0gdmlld3BvcnQudG9wO1xuXHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gdmlld3BvcnQuaGVpZ2h0O1xuXHRcdGNvbnN0IHZpZXdwb3J0RW5kWSA9IHZpZXdwb3J0U3RhcnRZICsgdmlld3BvcnRIZWlnaHQ7XG5cdFx0bGV0IGJveElzU2luZ2xlUmFuZ2U6IGJvb2xlYW47XG5cdFx0bGV0IGJveFN0YXJ0WTogbnVtYmVyO1xuXHRcdGxldCBib3hFbmRZOiBudW1iZXI7XG5cblx0XHRpZiAoc2VsZWN0aW9ucyAmJiBzZWxlY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGxldCBtaW5MaW5lTnVtYmVyID0gc2VsZWN0aW9uc1swXS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRsZXQgbWF4TGluZU51bWJlciA9IHNlbGVjdGlvbnNbMF0uZW5kTGluZU51bWJlcjtcblx0XHRcdGZvciAobGV0IGkgPSAxLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cdFx0XHRcdG1pbkxpbmVOdW1iZXIgPSBNYXRoLm1pbihtaW5MaW5lTnVtYmVyLCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0bWF4TGluZU51bWJlciA9IE1hdGgubWF4KG1heExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHRcdGJveElzU2luZ2xlUmFuZ2UgPSBmYWxzZTtcblx0XHRcdGJveFN0YXJ0WSA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIobWluTGluZU51bWJlcik7XG5cdFx0XHRib3hFbmRZID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihtYXhMaW5lTnVtYmVyKSArIHRoaXMuX2xpbmVIZWlnaHQ7XG5cdFx0fSBlbHNlIGlmIChyYW5nZSkge1xuXHRcdFx0Ym94SXNTaW5nbGVSYW5nZSA9IHRydWU7XG5cdFx0XHRib3hTdGFydFkgPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRib3hFbmRZID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihyYW5nZS5lbmRMaW5lTnVtYmVyKSArIHRoaXMuX2xpbmVIZWlnaHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRjb25zdCBzaG91bGRJZ25vcmVTY3JvbGxPZmYgPSAoc291cmNlID09PSAnbW91c2UnIHx8IG1pbmltYWxSZXZlYWwpICYmIHRoaXMuX2N1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZSA9PT0gJ2RlZmF1bHQnO1xuXG5cdFx0bGV0IHBhZGRpbmdUb3A6IG51bWJlciA9IDA7XG5cdFx0bGV0IHBhZGRpbmdCb3R0b206IG51bWJlciA9IDA7XG5cblx0XHRpZiAoIXNob3VsZElnbm9yZVNjcm9sbE9mZikge1xuXHRcdFx0Y29uc3QgbWF4TGluZXNJblZpZXdwb3J0ID0gKHZpZXdwb3J0SGVpZ2h0IC8gdGhpcy5fbGluZUhlaWdodCk7XG5cdFx0XHRjb25zdCBzdXJyb3VuZGluZ0xpbmVzID0gTWF0aC5tYXgodGhpcy5fY3Vyc29yU3Vycm91bmRpbmdMaW5lcywgdGhpcy5fc3RpY2t5U2Nyb2xsRW5hYmxlZCA/IHRoaXMuX21heE51bWJlclN0aWNreUxpbmVzIDogMCk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gTWF0aC5taW4obWF4TGluZXNJblZpZXdwb3J0IC8gMiwgc3Vycm91bmRpbmdMaW5lcyk7XG5cdFx0XHRwYWRkaW5nVG9wID0gY29udGV4dCAqIHRoaXMuX2xpbmVIZWlnaHQ7XG5cdFx0XHRwYWRkaW5nQm90dG9tID0gTWF0aC5tYXgoMCwgKGNvbnRleHQgLSAxKSkgKiB0aGlzLl9saW5lSGVpZ2h0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIW1pbmltYWxSZXZlYWwpIHtcblx0XHRcdFx0Ly8gUmV2ZWFsIG9uZSBtb3JlIGxpbmUgYWJvdmUgKHRoaXMgY2FzZSBpcyBoaXQgd2hlbiBkcmFnZ2luZylcblx0XHRcdFx0cGFkZGluZ1RvcCA9IHRoaXMuX2xpbmVIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghbWluaW1hbFJldmVhbCkge1xuXHRcdFx0aWYgKHZlcnRpY2FsVHlwZSA9PT0gdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlIHx8IHZlcnRpY2FsVHlwZSA9PT0gdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuQm90dG9tKSB7XG5cdFx0XHRcdC8vIFJldmVhbCBvbmUgbGluZSBtb3JlIHdoZW4gdGhlIGxhc3QgbGluZSB3b3VsZCBiZSBjb3ZlcmVkIGJ5IHRoZSBzY3JvbGxiYXIgLSBhcnJvdyBkb3duIGNhc2Ugb3IgcmV2ZWFsaW5nIGEgbGluZSBleHBsaWNpdGx5IGF0IGJvdHRvbVxuXHRcdFx0XHRwYWRkaW5nQm90dG9tICs9IHRoaXMuX2xpbmVIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ym94U3RhcnRZIC09IHBhZGRpbmdUb3A7XG5cdFx0Ym94RW5kWSArPSBwYWRkaW5nQm90dG9tO1xuXHRcdGxldCBuZXdTY3JvbGxUb3A6IG51bWJlcjtcblxuXHRcdGlmIChib3hFbmRZIC0gYm94U3RhcnRZID4gdmlld3BvcnRIZWlnaHQpIHtcblx0XHRcdC8vIHRoZSBib3ggaXMgbGFyZ2VyIHRoYW4gdGhlIHZpZXdwb3J0IC4uLiBzY3JvbGwgdG8gaXRzIHRvcFxuXHRcdFx0aWYgKCFib3hJc1NpbmdsZVJhbmdlKSB7XG5cdFx0XHRcdC8vIGRvIG5vdCByZXZlYWwgbXVsdGlwbGUgY3Vyc29ycyBpZiB0aGVyZSBhcmUgbW9yZSB0aGFuIGZpdCB0aGUgdmlld3BvcnRcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXHRcdFx0bmV3U2Nyb2xsVG9wID0gYm94U3RhcnRZO1xuXHRcdH0gZWxzZSBpZiAodmVydGljYWxUeXBlID09PSB2aWV3RXZlbnRzLlZlcnRpY2FsUmV2ZWFsVHlwZS5OZWFyVG9wIHx8IHZlcnRpY2FsVHlwZSA9PT0gdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuTmVhclRvcElmT3V0c2lkZVZpZXdwb3J0KSB7XG5cdFx0XHRpZiAodmVydGljYWxUeXBlID09PSB2aWV3RXZlbnRzLlZlcnRpY2FsUmV2ZWFsVHlwZS5OZWFyVG9wSWZPdXRzaWRlVmlld3BvcnQgJiYgdmlld3BvcnRTdGFydFkgPD0gYm94U3RhcnRZICYmIGJveEVuZFkgPD0gdmlld3BvcnRFbmRZKSB7XG5cdFx0XHRcdC8vIEJveCBpcyBhbHJlYWR5IGluIHRoZSB2aWV3cG9ydC4uLiBkbyBub3RoaW5nXG5cdFx0XHRcdG5ld1Njcm9sbFRvcCA9IHZpZXdwb3J0U3RhcnRZO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gV2Ugd2FudCBhIGdhcCB0aGF0IGlzIDIwJSBvZiB0aGUgdmlld3BvcnQsIGJ1dCB3aXRoIGEgbWluaW11bSBvZiA1IGxpbmVzXG5cdFx0XHRcdGNvbnN0IGRlc2lyZWRHYXBBYm92ZSA9IE1hdGgubWF4KDUgKiB0aGlzLl9saW5lSGVpZ2h0LCB2aWV3cG9ydEhlaWdodCAqIDAuMik7XG5cdFx0XHRcdC8vIFRyeSB0byBzY3JvbGwganVzdCBhYm92ZSB0aGUgYm94IHdpdGggdGhlIGRlc2lyZWQgZ2FwXG5cdFx0XHRcdGNvbnN0IGRlc2lyZWRTY3JvbGxUb3AgPSBib3hTdGFydFkgLSBkZXNpcmVkR2FwQWJvdmU7XG5cdFx0XHRcdC8vIEJ1dCBlbnN1cmUgdGhhdCB0aGUgYm94IGlzIG5vdCBwdXNoZWQgb3V0IG9mIHZpZXdwb3J0XG5cdFx0XHRcdGNvbnN0IG1pblNjcm9sbFRvcCA9IGJveEVuZFkgLSB2aWV3cG9ydEhlaWdodDtcblx0XHRcdFx0bmV3U2Nyb2xsVG9wID0gTWF0aC5tYXgobWluU2Nyb2xsVG9wLCBkZXNpcmVkU2Nyb2xsVG9wKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHZlcnRpY2FsVHlwZSA9PT0gdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuQ2VudGVyIHx8IHZlcnRpY2FsVHlwZSA9PT0gdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQpIHtcblx0XHRcdGlmICh2ZXJ0aWNhbFR5cGUgPT09IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0ICYmIHZpZXdwb3J0U3RhcnRZIDw9IGJveFN0YXJ0WSAmJiBib3hFbmRZIDw9IHZpZXdwb3J0RW5kWSkge1xuXHRcdFx0XHQvLyBCb3ggaXMgYWxyZWFkeSBpbiB0aGUgdmlld3BvcnQuLi4gZG8gbm90aGluZ1xuXHRcdFx0XHRuZXdTY3JvbGxUb3AgPSB2aWV3cG9ydFN0YXJ0WTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEJveCBpcyBvdXRzaWRlIHRoZSB2aWV3cG9ydC4uLiBjZW50ZXIgaXRcblx0XHRcdFx0Y29uc3QgYm94TWlkZGxlWSA9IChib3hTdGFydFkgKyBib3hFbmRZKSAvIDI7XG5cdFx0XHRcdG5ld1Njcm9sbFRvcCA9IE1hdGgubWF4KDAsIGJveE1pZGRsZVkgLSB2aWV3cG9ydEhlaWdodCAvIDIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXdTY3JvbGxUb3AgPSB0aGlzLl9jb21wdXRlTWluaW11bVNjcm9sbGluZyh2aWV3cG9ydFN0YXJ0WSwgdmlld3BvcnRFbmRZLCBib3hTdGFydFksIGJveEVuZFksIHZlcnRpY2FsVHlwZSA9PT0gdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuVG9wLCB2ZXJ0aWNhbFR5cGUgPT09IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLkJvdHRvbSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ld1Njcm9sbFRvcDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVTY3JvbGxMZWZ0VG9SZXZlYWwoaG9yaXpvbnRhbFJldmVhbFJlcXVlc3Q6IEhvcml6b250YWxSZXZlYWxSZXF1ZXN0KTogeyBzY3JvbGxMZWZ0OiBudW1iZXI7IG1heEhvcml6b250YWxPZmZzZXQ6IG51bWJlcjsgaGFzUlRMOiBib29sZWFuIH0gfCBudWxsIHtcblxuXHRcdGNvbnN0IHZpZXdwb3J0ID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRWaWV3cG9ydCgpO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXHRcdGNvbnN0IHZpZXdwb3J0U3RhcnRYID0gdmlld3BvcnQubGVmdDtcblx0XHRjb25zdCB2aWV3cG9ydEVuZFggPSB2aWV3cG9ydFN0YXJ0WCArIHZpZXdwb3J0LndpZHRoIC0gbGF5b3V0SW5mby52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoO1xuXG5cdFx0bGV0IGJveFN0YXJ0WCA9IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSO1xuXHRcdGxldCBib3hFbmRYID0gMDtcblx0XHRsZXQgaGFzUlRMID0gZmFsc2U7XG5cdFx0aWYgKGhvcml6b250YWxSZXZlYWxSZXF1ZXN0LnR5cGUgPT09ICdyYW5nZScpIHtcblx0XHRcdGhhc1JUTCA9IHRoaXMuX2xpbmVJc1JlbmRlcmVkUlRMKGhvcml6b250YWxSZXZlYWxSZXF1ZXN0LmxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuX3Zpc2libGVSYW5nZXNGb3JMaW5lUmFuZ2UoaG9yaXpvbnRhbFJldmVhbFJlcXVlc3QubGluZU51bWJlciwgaG9yaXpvbnRhbFJldmVhbFJlcXVlc3Quc3RhcnRDb2x1bW4sIGhvcml6b250YWxSZXZlYWxSZXF1ZXN0LmVuZENvbHVtbik7XG5cdFx0XHRpZiAoIXZpc2libGVSYW5nZXMpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHZpc2libGVSYW5nZSBvZiB2aXNpYmxlUmFuZ2VzLnJhbmdlcykge1xuXHRcdFx0XHRib3hTdGFydFggPSBNYXRoLm1pbihib3hTdGFydFgsIE1hdGgucm91bmQodmlzaWJsZVJhbmdlLmxlZnQpKTtcblx0XHRcdFx0Ym94RW5kWCA9IE1hdGgubWF4KGJveEVuZFgsIE1hdGgucm91bmQodmlzaWJsZVJhbmdlLmxlZnQgKyB2aXNpYmxlUmFuZ2Uud2lkdGgpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2YgaG9yaXpvbnRhbFJldmVhbFJlcXVlc3Quc2VsZWN0aW9ucykge1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAhPT0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gdGhpcy5fdmlzaWJsZVJhbmdlc0ZvckxpbmVSYW5nZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4sIHNlbGVjdGlvbi5lbmRDb2x1bW4pO1xuXHRcdFx0XHRoYXNSVEwgfHw9IHRoaXMuX2xpbmVJc1JlbmRlcmVkUlRMKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRpZiAoIXZpc2libGVSYW5nZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IHZpc2libGVSYW5nZSBvZiB2aXNpYmxlUmFuZ2VzLnJhbmdlcykge1xuXHRcdFx0XHRcdGJveFN0YXJ0WCA9IE1hdGgubWluKGJveFN0YXJ0WCwgTWF0aC5yb3VuZCh2aXNpYmxlUmFuZ2UubGVmdCkpO1xuXHRcdFx0XHRcdGJveEVuZFggPSBNYXRoLm1heChib3hFbmRYLCBNYXRoLnJvdW5kKHZpc2libGVSYW5nZS5sZWZ0ICsgdmlzaWJsZVJhbmdlLndpZHRoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWhvcml6b250YWxSZXZlYWxSZXF1ZXN0Lm1pbmltYWxSZXZlYWwpIHtcblx0XHRcdGJveFN0YXJ0WCA9IE1hdGgubWF4KDAsIGJveFN0YXJ0WCAtIFZpZXdMaW5lcy5IT1JJWk9OVEFMX0VYVFJBX1BYKTtcblx0XHRcdGJveEVuZFggKz0gdGhpcy5fcmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZztcblx0XHR9XG5cblx0XHRpZiAoaG9yaXpvbnRhbFJldmVhbFJlcXVlc3QudHlwZSA9PT0gJ3NlbGVjdGlvbnMnICYmIGJveEVuZFggLSBib3hTdGFydFggPiB2aWV3cG9ydC53aWR0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3U2Nyb2xsTGVmdCA9IHRoaXMuX2NvbXB1dGVNaW5pbXVtU2Nyb2xsaW5nKHZpZXdwb3J0U3RhcnRYLCB2aWV3cG9ydEVuZFgsIGJveFN0YXJ0WCwgYm94RW5kWCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjcm9sbExlZnQ6IG5ld1Njcm9sbExlZnQsXG5cdFx0XHRtYXhIb3Jpem9udGFsT2Zmc2V0OiBib3hFbmRYLFxuXHRcdFx0aGFzUlRMXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVNaW5pbXVtU2Nyb2xsaW5nKHZpZXdwb3J0U3RhcnQ6IG51bWJlciwgdmlld3BvcnRFbmQ6IG51bWJlciwgYm94U3RhcnQ6IG51bWJlciwgYm94RW5kOiBudW1iZXIsIHJldmVhbEF0U3RhcnQ/OiBib29sZWFuLCByZXZlYWxBdEVuZD86IGJvb2xlYW4pOiBudW1iZXIge1xuXHRcdHZpZXdwb3J0U3RhcnQgPSB2aWV3cG9ydFN0YXJ0IHwgMDtcblx0XHR2aWV3cG9ydEVuZCA9IHZpZXdwb3J0RW5kIHwgMDtcblx0XHRib3hTdGFydCA9IGJveFN0YXJ0IHwgMDtcblx0XHRib3hFbmQgPSBib3hFbmQgfCAwO1xuXHRcdHJldmVhbEF0U3RhcnQgPSAhIXJldmVhbEF0U3RhcnQ7XG5cdFx0cmV2ZWFsQXRFbmQgPSAhIXJldmVhbEF0RW5kO1xuXG5cdFx0Y29uc3Qgdmlld3BvcnRMZW5ndGggPSB2aWV3cG9ydEVuZCAtIHZpZXdwb3J0U3RhcnQ7XG5cdFx0Y29uc3QgYm94TGVuZ3RoID0gYm94RW5kIC0gYm94U3RhcnQ7XG5cblx0XHRpZiAoYm94TGVuZ3RoIDwgdmlld3BvcnRMZW5ndGgpIHtcblx0XHRcdC8vIFRoZSBib3ggd291bGQgZml0IGluIHRoZSB2aWV3cG9ydFxuXG5cdFx0XHRpZiAocmV2ZWFsQXRTdGFydCkge1xuXHRcdFx0XHRyZXR1cm4gYm94U3RhcnQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXZlYWxBdEVuZCkge1xuXHRcdFx0XHRyZXR1cm4gTWF0aC5tYXgoMCwgYm94RW5kIC0gdmlld3BvcnRMZW5ndGgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYm94U3RhcnQgPCB2aWV3cG9ydFN0YXJ0KSB7XG5cdFx0XHRcdC8vIFRoZSBib3ggaXMgYWJvdmUgdGhlIHZpZXdwb3J0XG5cdFx0XHRcdHJldHVybiBib3hTdGFydDtcblx0XHRcdH0gZWxzZSBpZiAoYm94RW5kID4gdmlld3BvcnRFbmQpIHtcblx0XHRcdFx0Ly8gVGhlIGJveCBpcyBiZWxvdyB0aGUgdmlld3BvcnRcblx0XHRcdFx0cmV0dXJuIE1hdGgubWF4KDAsIGJveEVuZCAtIHZpZXdwb3J0TGVuZ3RoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVGhlIGJveCB3b3VsZCBub3QgZml0IGluIHRoZSB2aWV3cG9ydFxuXHRcdFx0Ly8gUmV2ZWFsIHRoZSBiZWdpbm5pbmcgb2YgdGhlIGJveFxuXHRcdFx0cmV0dXJuIGJveFN0YXJ0O1xuXHRcdH1cblxuXHRcdHJldHVybiB2aWV3cG9ydFN0YXJ0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHdCQUF3QjtBQUNqQyxZQUFZLGNBQWM7QUFDMUIsU0FBUyxpQkFBaUI7QUFDMUIsT0FBTztBQUNQLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CLGlCQUE2Qix5QkFBd0M7QUFDbEcsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxpQkFBaUIsa0JBQWtCLGdCQUFnQjtBQUM1RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFdEIsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxnQkFBZ0I7QUFJNUIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxxQkFBcUI7QUFFOUIsTUFBTSxpQkFBaUI7QUFBQSxFQUl0QixjQUFjO0FBQ2IsU0FBSyx1QkFBdUIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRU8seUJBQWdDO0FBQ3RDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLHVCQUF1QixxQkFBa0M7QUFDL0QsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUNEO0FBRUEsTUFBTSw2QkFBNkI7QUFBQSxFQUtsQyxZQUNpQixlQUNBLFlBQ0EsYUFDQSxXQUNBLGdCQUNBLGVBQ0EsWUFDZjtBQVBlO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBWGpCLFNBQWdCLE9BQU87QUFhdEIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUNEO0FBRUEsTUFBTSxrQ0FBa0M7QUFBQSxFQUt2QyxZQUNpQixlQUNBLFlBQ0EsZ0JBQ0EsZUFDQSxZQUNmO0FBTGU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQVRqQixTQUFnQixPQUFPO0FBV3RCLFFBQUksZ0JBQWdCLFdBQVcsQ0FBQyxFQUFFO0FBQ2xDLFFBQUksZ0JBQWdCLFdBQVcsQ0FBQyxFQUFFO0FBQ2xDLGFBQVMsSUFBSSxHQUFHLE1BQU0sV0FBVyxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ3RELFlBQU0sWUFBWSxXQUFXLENBQUM7QUFDOUIsc0JBQWdCLEtBQUssSUFBSSxlQUFlLFVBQVUsZUFBZTtBQUNqRSxzQkFBZ0IsS0FBSyxJQUFJLGVBQWUsVUFBVSxhQUFhO0FBQUEsSUFDaEU7QUFDQSxTQUFLLGdCQUFnQjtBQUNyQixTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQ0Q7QUFRTyxNQUFNLGFBQU4sTUFBTSxtQkFBa0IsU0FBK0I7QUFBQSxFQWlDN0QsWUFBWSxTQUFzQixnQkFBNEMsY0FBd0M7QUFDckgsVUFBTSxPQUFPO0FBRWIsVUFBTSxPQUFPLEtBQUssU0FBUztBQUMzQixVQUFNLFVBQVUsS0FBSyxTQUFTLGNBQWM7QUFDNUMsVUFBTSxXQUFXLFFBQVEsSUFBSSxhQUFhLFFBQVE7QUFDbEQsVUFBTSxlQUFlLFFBQVEsSUFBSSxhQUFhLFlBQVk7QUFFMUQsU0FBSyxjQUFjLFFBQVEsSUFBSSxhQUFhLFVBQVU7QUFDdEQsU0FBSyxrQ0FBa0MsU0FBUztBQUNoRCxTQUFLLHNCQUFzQixhQUFhO0FBQ3hDLFNBQUssZ0NBQWdDLFFBQVEsSUFBSSxhQUFhLDRCQUE0QjtBQUMxRixTQUFLLDBCQUEwQixRQUFRLElBQUksYUFBYSxzQkFBc0I7QUFDOUUsU0FBSywrQkFBK0IsUUFBUSxJQUFJLGFBQWEsMkJBQTJCO0FBQ3hGLFNBQUssc0JBQXNCLENBQUMsUUFBUSxJQUFJLGFBQWEsbUJBQW1CO0FBQ3hFLFNBQUssbUJBQW1CLElBQUksZ0JBQWdCLE1BQU0sS0FBSyxTQUFTLE1BQU0sSUFBSTtBQUUxRSxTQUFLLGdCQUFnQjtBQUNyQixTQUFLLHdCQUF3QixTQUFTLGNBQWMsS0FBSztBQUN6RCxTQUFLLGdCQUFnQixJQUFJLHVCQUF1QixLQUFLLFVBQVU7QUFBQSxNQUM5RCxZQUFZLE1BQU0sSUFBSSxTQUFTLGdCQUFnQixLQUFLLGdCQUFnQjtBQUFBLElBQ3JFLENBQUM7QUFDRCxTQUFLLFVBQVUsS0FBSyxjQUFjO0FBRWxDLHFCQUFpQixNQUFNLEtBQUssU0FBUyxnQkFBZ0IsU0FBUztBQUM5RCxTQUFLLFFBQVEsYUFBYSxjQUFjLGdDQUFnQyxFQUFFO0FBQzFFLGtCQUFjLEtBQUssU0FBUyxRQUFRO0FBR3BDLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUsseUJBQXlCLElBQUksaUJBQWlCLE1BQU07QUFDeEQsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QixHQUFHLEdBQUc7QUFDTixTQUFLLHNDQUFzQyxJQUFJLGlCQUFpQixNQUFNO0FBQ3JFLFdBQUssK0JBQStCO0FBQUEsSUFDckMsR0FBRyxHQUFJO0FBRVAsU0FBSyxvQkFBb0IsSUFBSSxpQkFBaUI7QUFFOUMsU0FBSywyQkFBMkI7QUFHaEMsU0FBSyx1QkFBdUIsUUFBUSxJQUFJLGFBQWEsWUFBWSxFQUFFO0FBQ25FLFNBQUssd0JBQXdCLFFBQVEsSUFBSSxhQUFhLFlBQVksRUFBRTtBQUFBLEVBQ3JFO0FBQUEsRUFFZ0IsVUFBZ0I7QUFDL0IsU0FBSyx1QkFBdUIsUUFBUTtBQUNwQyxTQUFLLG9DQUFvQyxRQUFRO0FBQ2pELFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVPLGFBQXVDO0FBQzdDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBLEVBSWdCLHVCQUF1QixHQUFzRDtBQUM1RixTQUFLLGNBQWMsdUJBQXVCLENBQUM7QUFDM0MsUUFBSSxFQUFFLFdBQVcsYUFBYSxZQUFZLEdBQUc7QUFDNUMsV0FBSyxnQkFBZ0I7QUFBQSxJQUN0QjtBQUVBLFVBQU0sVUFBVSxLQUFLLFNBQVMsY0FBYztBQUM1QyxVQUFNLFdBQVcsUUFBUSxJQUFJLGFBQWEsUUFBUTtBQUNsRCxVQUFNLGVBQWUsUUFBUSxJQUFJLGFBQWEsWUFBWTtBQUUxRCxTQUFLLGNBQWMsUUFBUSxJQUFJLGFBQWEsVUFBVTtBQUN0RCxTQUFLLGtDQUFrQyxTQUFTO0FBQ2hELFNBQUssc0JBQXNCLGFBQWE7QUFDeEMsU0FBSyxnQ0FBZ0MsUUFBUSxJQUFJLGFBQWEsNEJBQTRCO0FBQzFGLFNBQUssMEJBQTBCLFFBQVEsSUFBSSxhQUFhLHNCQUFzQjtBQUM5RSxTQUFLLCtCQUErQixRQUFRLElBQUksYUFBYSwyQkFBMkI7QUFDeEYsU0FBSyxzQkFBc0IsQ0FBQyxRQUFRLElBQUksYUFBYSxtQkFBbUI7QUFHeEUsU0FBSyx1QkFBdUIsUUFBUSxJQUFJLGFBQWEsWUFBWSxFQUFFO0FBQ25FLFNBQUssd0JBQXdCLFFBQVEsSUFBSSxhQUFhLFlBQVksRUFBRTtBQUVwRSxrQkFBYyxLQUFLLFNBQVMsUUFBUTtBQUVwQyxTQUFLLHVCQUF1QjtBQUU1QixRQUFJLEVBQUUsV0FBVyxhQUFhLFVBQVUsR0FBRztBQUMxQyxXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNRLHlCQUFrQztBQUN6QyxVQUFNLE9BQU8sS0FBSyxTQUFTO0FBRTNCLFVBQU0scUJBQXFCLElBQUksZ0JBQWdCLE1BQU0sS0FBSyxTQUFTLE1BQU0sSUFBSTtBQUM3RSxRQUFJLENBQUMsS0FBSyxpQkFBaUIsT0FBTyxrQkFBa0IsR0FBRztBQUN0RCxXQUFLLG1CQUFtQjtBQUV4QixZQUFNLGtCQUFrQixLQUFLLGNBQWMsbUJBQW1CO0FBQzlELFlBQU0sZ0JBQWdCLEtBQUssY0FBYyxpQkFBaUI7QUFDMUQsZUFBUyxhQUFhLGlCQUFpQixjQUFjLGVBQWUsY0FBYztBQUNqRixjQUFNLE9BQU8sS0FBSyxjQUFjLGVBQWUsVUFBVTtBQUN6RCxhQUFLLGlCQUFpQixLQUFLLGdCQUFnQjtBQUFBLE1BQzVDO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ2dCLHFCQUFxQixHQUFvRDtBQUN4RixVQUFNLHNCQUFzQixLQUFLLGNBQWMsbUJBQW1CO0FBQ2xFLFVBQU0sb0JBQW9CLEtBQUssY0FBYyxpQkFBaUI7QUFDOUQsUUFBSSxJQUFJO0FBQ1IsYUFBUyxhQUFhLHFCQUFxQixjQUFjLG1CQUFtQixjQUFjO0FBQ3pGLFVBQUksS0FBSyxjQUFjLGVBQWUsVUFBVSxFQUFFLG1CQUFtQixLQUFLO0FBQUEsSUFDM0U7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ2dCLHFCQUFxQixHQUFvRDtBQUN4RixVQUFNLHNCQUFzQixLQUFLLGNBQWMsbUJBQW1CO0FBQ2xFLFVBQU0sb0JBQW9CLEtBQUssY0FBYyxpQkFBaUI7QUFDOUQsYUFBUyxhQUFhLHFCQUFxQixjQUFjLG1CQUFtQixjQUFjO0FBQ3pGLFdBQUssY0FBYyxlQUFlLFVBQVUsRUFBRSxxQkFBcUI7QUFBQSxJQUNwRTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFDZ0IsVUFBVSxHQUF5QztBQUNsRSxVQUFNLGVBQWUsS0FBSyxjQUFjLFVBQVUsR0FBRyxLQUFLLGlCQUFpQixNQUFNO0FBQ2pGLFNBQUssZ0JBQWdCO0FBQ3JCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFDZ0IsZUFBZSxHQUE4QztBQUM1RSxXQUFPLEtBQUssY0FBYyxlQUFlLENBQUM7QUFBQSxFQUMzQztBQUFBLEVBQ2dCLGVBQWUsR0FBOEM7QUFDNUUsV0FBTyxLQUFLLGNBQWMsZUFBZSxDQUFDO0FBQUEsRUFDM0M7QUFBQSxFQUNnQixnQkFBZ0IsR0FBK0M7QUFDOUUsV0FBTyxLQUFLLGNBQWMsZ0JBQWdCLENBQUM7QUFBQSxFQUM1QztBQUFBLEVBQ2dCLHFCQUFxQixHQUFvRDtBQUd4RixVQUFNLG1CQUFtQixLQUFLLCtCQUErQixLQUFLLFNBQVMsV0FBVyxrQkFBa0IsR0FBRyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxZQUFZO0FBRTNLLFFBQUkscUJBQXFCLElBQUk7QUFFNUIsYUFBTztBQUFBLElBQ1I7QUFHQSxRQUFJLG9CQUFvQixLQUFLLFNBQVMsV0FBVyx1QkFBdUIsRUFBRSxXQUFXLGlCQUFpQixDQUFDO0FBRXZHLFFBQUksRUFBRSxrQkFBa0I7QUFDdkIsVUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixFQUFFLE1BQU0sZUFBZTtBQUVqRSw0QkFBb0I7QUFBQSxVQUNuQixXQUFXLGtCQUFrQjtBQUFBLFVBQzdCLFlBQVk7QUFBQSxRQUNiO0FBQUEsTUFDRCxXQUFXLEVBQUUsT0FBTztBQUVuQixhQUFLLDJCQUEyQixJQUFJLDZCQUE2QixFQUFFLGVBQWUsRUFBRSxNQUFNLGlCQUFpQixFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sV0FBVyxLQUFLLFNBQVMsV0FBVyxvQkFBb0IsR0FBRyxrQkFBa0IsV0FBVyxFQUFFLFVBQVU7QUFBQSxNQUM3TyxXQUFXLEVBQUUsY0FBYyxFQUFFLFdBQVcsU0FBUyxHQUFHO0FBQ25ELGFBQUssMkJBQTJCLElBQUksa0NBQWtDLEVBQUUsZUFBZSxFQUFFLFlBQVksS0FBSyxTQUFTLFdBQVcsb0JBQW9CLEdBQUcsa0JBQWtCLFdBQVcsRUFBRSxVQUFVO0FBQUEsTUFDL0w7QUFBQSxJQUNELE9BQU87QUFDTixXQUFLLDJCQUEyQjtBQUFBLElBQ2pDO0FBRUEsVUFBTSxpQkFBaUIsS0FBSyxJQUFJLEtBQUssU0FBUyxXQUFXLG9CQUFvQixJQUFJLGtCQUFrQixTQUFTO0FBQzVHLFVBQU0sYUFBYyxrQkFBa0IsS0FBSyxjQUFjLFdBQVcsWUFBWSxFQUFFO0FBQ2xGLFNBQUssU0FBUyxVQUFVLFdBQVcsa0JBQWtCLG1CQUFtQixVQUFVO0FBRWxGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFDZ0IsZ0JBQWdCLEdBQStDO0FBQzlFLFFBQUksS0FBSyw0QkFBNEIsRUFBRSxtQkFBbUI7QUFFekQsV0FBSywyQkFBMkI7QUFBQSxJQUNqQztBQUNBLFFBQUksS0FBSyw0QkFBNEIsRUFBRSxrQkFBa0I7QUFDeEQsWUFBTSxNQUFNLEtBQUssSUFBSSxLQUFLLHlCQUF5QixnQkFBZ0IsS0FBSyx5QkFBeUIsYUFBYTtBQUM5RyxZQUFNLE1BQU0sS0FBSyxJQUFJLEtBQUsseUJBQXlCLGdCQUFnQixLQUFLLHlCQUF5QixhQUFhO0FBQzlHLFVBQUksRUFBRSxZQUFZLE9BQU8sRUFBRSxZQUFZLEtBQUs7QUFFM0MsYUFBSywyQkFBMkI7QUFBQSxNQUNqQztBQUFBLElBQ0Q7QUFDQSxTQUFLLFFBQVEsU0FBUyxFQUFFLFdBQVc7QUFDbkMsV0FBTyxLQUFLLGNBQWMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLG9CQUFvQixFQUFFO0FBQUEsRUFDekU7QUFBQSxFQUVnQixnQkFBZ0IsR0FBK0M7QUFDOUUsV0FBTyxLQUFLLGNBQWMsZ0JBQWdCLENBQUM7QUFBQSxFQUM1QztBQUFBLEVBQ2dCLGVBQWUsR0FBOEM7QUFDNUUsU0FBSyxTQUFTLFVBQVUsV0FBVyxnQkFBZ0IsS0FBSyxhQUFhO0FBQ3JFLFdBQU8sS0FBSyxjQUFjLGVBQWUsQ0FBQztBQUFBLEVBQzNDO0FBQUEsRUFDZ0IsZUFBZSxHQUE4QztBQUM1RSxXQUFPLEtBQUssdUJBQXVCO0FBQUEsRUFDcEM7QUFBQTtBQUFBO0FBQUEsRUFNTyx1QkFBdUIsVUFBdUIsUUFBaUM7QUFDckYsVUFBTSxrQkFBa0IsS0FBSyxvQkFBb0IsUUFBUTtBQUN6RCxRQUFJLG9CQUFvQixNQUFNO0FBRTdCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxhQUFhLEtBQUssa0JBQWtCLGVBQWU7QUFFekQsUUFBSSxlQUFlLElBQUk7QUFFdEIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGFBQWEsS0FBSyxhQUFhLEtBQUssU0FBUyxVQUFVLGFBQWEsR0FBRztBQUUxRSxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyxTQUFTLFVBQVUsaUJBQWlCLFVBQVUsTUFBTSxHQUFHO0FBRS9ELGFBQU8sSUFBSSxTQUFTLFlBQVksQ0FBQztBQUFBLElBQ2xDO0FBRUEsVUFBTSxzQkFBc0IsS0FBSyxjQUFjLG1CQUFtQjtBQUNsRSxVQUFNLG9CQUFvQixLQUFLLGNBQWMsaUJBQWlCO0FBQzlELFFBQUksYUFBYSx1QkFBdUIsYUFBYSxtQkFBbUI7QUFFdkUsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFNBQVMsS0FBSyxjQUFjLGVBQWUsVUFBVSxFQUFFLHNCQUFzQixVQUFVLE1BQU07QUFDakcsVUFBTSxZQUFZLEtBQUssU0FBUyxVQUFVLGlCQUFpQixVQUFVO0FBQ3JFLFFBQUksU0FBUyxXQUFXO0FBQ3ZCLGVBQVM7QUFBQSxJQUNWO0FBQ0EsV0FBTyxJQUFJLFNBQVMsWUFBWSxNQUFNO0FBQUEsRUFDdkM7QUFBQSxFQUVRLG9CQUFvQixNQUE4QztBQUN6RSxXQUFPLFFBQVEsS0FBSyxhQUFhLEdBQUc7QUFDbkMsVUFBSSxLQUFLLGNBQWMsU0FBUyxZQUFZO0FBQzNDLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxrQkFBa0IsU0FBOEI7QUFDdkQsVUFBTSxrQkFBa0IsS0FBSyxjQUFjLG1CQUFtQjtBQUM5RCxVQUFNLGdCQUFnQixLQUFLLGNBQWMsaUJBQWlCO0FBQzFELGFBQVMsYUFBYSxpQkFBaUIsY0FBYyxlQUFlLGNBQWM7QUFDakYsWUFBTSxPQUFPLEtBQUssY0FBYyxlQUFlLFVBQVU7QUFDekQsVUFBSSxZQUFZLEtBQUssV0FBVyxHQUFHO0FBQ2xDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxhQUFhLFlBQTRCO0FBQy9DLFVBQU0sc0JBQXNCLEtBQUssY0FBYyxtQkFBbUI7QUFDbEUsVUFBTSxvQkFBb0IsS0FBSyxjQUFjLGlCQUFpQjtBQUM5RCxRQUFJLGFBQWEsdUJBQXVCLGFBQWEsbUJBQW1CO0FBRXZFLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxVQUFVLElBQUksa0JBQWtCLEtBQUssUUFBUSxTQUFTLEtBQUsscUJBQXFCO0FBQ3RGLFVBQU0sU0FBUyxLQUFLLGNBQWMsZUFBZSxVQUFVLEVBQUUsU0FBUyxPQUFPO0FBQzdFLFNBQUssb0NBQW9DLE9BQU87QUFFaEQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLHVCQUE2QjtBQUNuQyxVQUFNLHNCQUFzQixLQUFLLGNBQWMsbUJBQW1CO0FBQ2xFLFVBQU0sb0JBQW9CLEtBQUssY0FBYyxpQkFBaUI7QUFDOUQsYUFBUyxhQUFhLHFCQUFxQixjQUFjLG1CQUFtQixjQUFjO0FBQ3pGLFdBQUssY0FBYyxlQUFlLFVBQVUsRUFBRSxpQkFBaUI7QUFBQSxJQUNoRTtBQUFBLEVBQ0Q7QUFBQSxFQUVPLDJCQUEyQixRQUFlLGlCQUFzRDtBQUN0RyxVQUFNLHdCQUF3QixPQUFPO0FBQ3JDLFVBQU0sUUFBUSxNQUFNLGdCQUFnQixRQUFRLEtBQUssa0JBQWtCLHVCQUF1QixDQUFDO0FBQzNGLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFxQyxDQUFDO0FBQzVDLFFBQUksbUJBQW1CO0FBQ3ZCLFVBQU0sb0JBQW9CLElBQUksa0JBQWtCLEtBQUssUUFBUSxTQUFTLEtBQUsscUJBQXFCO0FBRWhHLFFBQUksMEJBQWtDO0FBQ3RDLFFBQUksaUJBQWlCO0FBQ3BCLGdDQUEwQixLQUFLLFNBQVMsVUFBVSxxQkFBcUIsbUNBQW1DLElBQUksU0FBUyxNQUFNLGlCQUFpQixDQUFDLENBQUMsRUFBRTtBQUFBLElBQ25KO0FBRUEsVUFBTSxzQkFBc0IsS0FBSyxjQUFjLG1CQUFtQjtBQUNsRSxVQUFNLG9CQUFvQixLQUFLLGNBQWMsaUJBQWlCO0FBQzlELGFBQVMsYUFBYSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sZUFBZSxjQUFjO0FBRTdGLFVBQUksYUFBYSx1QkFBdUIsYUFBYSxtQkFBbUI7QUFDdkU7QUFBQSxNQUNEO0FBRUEsWUFBTSxjQUFjLGVBQWUsTUFBTSxrQkFBa0IsTUFBTSxjQUFjO0FBQy9FLFlBQU0sc0JBQXNCLGVBQWU7QUFDM0MsWUFBTSxZQUFZLHNCQUFzQixLQUFLLFNBQVMsVUFBVSxpQkFBaUIsVUFBVSxJQUFJLE1BQU07QUFDckcsWUFBTSxjQUFjLEtBQUssY0FBYyxlQUFlLFVBQVU7QUFDaEUsWUFBTSx1QkFBdUIsWUFBWSx5QkFBeUIsWUFBWSxhQUFhLFdBQVcsaUJBQWlCO0FBRXZILFVBQUksQ0FBQyxzQkFBc0I7QUFDMUI7QUFBQSxNQUNEO0FBRUEsVUFBSSxtQkFBbUIsYUFBYSx1QkFBdUI7QUFDMUQsY0FBTSw2QkFBNkI7QUFDbkMsa0NBQTBCLEtBQUssU0FBUyxVQUFVLHFCQUFxQixtQ0FBbUMsSUFBSSxTQUFTLGFBQWEsR0FBRyxDQUFDLENBQUMsRUFBRTtBQUUzSSxZQUFJLCtCQUErQix5QkFBeUI7QUFDM0QsZ0JBQU0sdUJBQXVCLHFCQUFxQixPQUFPLHFCQUFxQixPQUFPLFNBQVMsQ0FBQztBQUMvRiwrQkFBcUIsU0FBUyxLQUFLO0FBQ25DLGNBQUksS0FBSyxTQUFTLFVBQVUsaUJBQWlCLDBCQUEwQixNQUFNLGNBQWMsS0FBSztBQUMvRixpQ0FBcUIsUUFBUSxLQUFLO0FBQUEsVUFDbkM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLG9CQUFjLGtCQUFrQixJQUFJLElBQUksa0JBQWtCLHFCQUFxQixxQkFBcUIsWUFBWSxnQkFBZ0IsS0FBSyxxQkFBcUIsTUFBTSxHQUFHLG1CQUFtQjtBQUFBLElBQ3ZMO0FBRUEsU0FBSyxvQ0FBb0MsaUJBQWlCO0FBRTFELFFBQUkscUJBQXFCLEdBQUc7QUFDM0IsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsMkJBQTJCLFlBQW9CLGFBQXFCLFdBQXlDO0FBQ3BILFFBQUksYUFBYSxLQUFLLGNBQWMsbUJBQW1CLEtBQUssYUFBYSxLQUFLLGNBQWMsaUJBQWlCLEdBQUc7QUFDL0csYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLG9CQUFvQixJQUFJLGtCQUFrQixLQUFLLFFBQVEsU0FBUyxLQUFLLHFCQUFxQjtBQUNoRyxVQUFNLFNBQVMsS0FBSyxjQUFjLGVBQWUsVUFBVSxFQUFFLHlCQUF5QixZQUFZLGFBQWEsV0FBVyxpQkFBaUI7QUFDM0ksU0FBSyxvQ0FBb0MsaUJBQWlCO0FBRTFELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUIsWUFBNkI7QUFDdkQsUUFBSSxhQUFhLEtBQUssY0FBYyxtQkFBbUIsS0FBSyxhQUFhLEtBQUssY0FBYyxpQkFBaUIsR0FBRztBQUMvRyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sY0FBYyxLQUFLLGNBQWMsZUFBZSxVQUFVO0FBQ2hFLFdBQU8sWUFBWSxjQUFjO0FBQUEsRUFDbEM7QUFBQSxFQUVPLHdCQUF3QixVQUErQztBQUM3RSxVQUFNLGdCQUFnQixLQUFLLDJCQUEyQixTQUFTLFlBQVksU0FBUyxRQUFRLFNBQVMsTUFBTTtBQUMzRyxRQUFJLENBQUMsZUFBZTtBQUNuQixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sSUFBSSxtQkFBbUIsY0FBYyxxQkFBcUIsY0FBYyxPQUFPLENBQUMsRUFBRSxJQUFJO0FBQUEsRUFDOUY7QUFBQTtBQUFBLEVBSU8sbUJBQXlCO0FBQy9CLFNBQUssa0JBQWtCLEtBQUs7QUFBQSxFQUM3QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLHdCQUFpQztBQUN4QyxXQUFPLEtBQUssa0JBQWtCLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFNBQUssa0JBQWtCLEtBQUs7QUFBQSxFQUM3QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxvQ0FBb0MsbUJBQTRDO0FBQ3ZGLFFBQUksQ0FBQyxrQkFBa0IsY0FBYztBQUVwQztBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsS0FBSyx1QkFBdUIsWUFBWSxHQUFHO0FBRS9DO0FBQUEsSUFDRDtBQUNBLFNBQUssdUJBQXVCLE9BQU87QUFDbkMsU0FBSyxzQkFBc0I7QUFBQSxFQUM1QjtBQUFBLEVBRVEsa0JBQWtCLE1BQXdCO0FBQ2pELFVBQU0sc0JBQXNCLEtBQUssY0FBYyxtQkFBbUI7QUFDbEUsVUFBTSxvQkFBb0IsS0FBSyxjQUFjLGlCQUFpQjtBQUU5RCxRQUFJLG9CQUFvQjtBQUN4QixRQUFJLG9CQUFvQjtBQUN4QixhQUFTLGFBQWEscUJBQXFCLGNBQWMsbUJBQW1CLGNBQWM7QUFDekYsWUFBTSxjQUFjLEtBQUssY0FBYyxlQUFlLFVBQVU7QUFFaEUsVUFBSSxRQUFRLENBQUMsWUFBWSxlQUFlLEdBQUc7QUFFMUMsNEJBQW9CO0FBQ3BCO0FBQUEsTUFDRDtBQUVBLDBCQUFvQixLQUFLLElBQUksbUJBQW1CLFlBQVksU0FBUyxJQUFJLENBQUM7QUFBQSxJQUMzRTtBQUVBLFFBQUkscUJBQXFCLHdCQUF3QixLQUFLLHNCQUFzQixLQUFLLFNBQVMsVUFBVSxhQUFhLEdBQUc7QUFFbkgsV0FBSyxnQkFBZ0I7QUFBQSxJQUN0QjtBQUVBLFNBQUssb0JBQW9CLGlCQUFpQjtBQUUxQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsaUNBQXVDO0FBSTlDLFFBQUksb0JBQW9CO0FBQ3hCLFFBQUksZUFBZTtBQUNuQixVQUFNLHNCQUFzQixLQUFLLGNBQWMsbUJBQW1CO0FBQ2xFLFVBQU0sb0JBQW9CLEtBQUssY0FBYyxpQkFBaUI7QUFDOUQsYUFBUyxhQUFhLHFCQUFxQixjQUFjLG1CQUFtQixjQUFjO0FBQ3pGLFlBQU0sY0FBYyxLQUFLLGNBQWMsZUFBZSxVQUFVO0FBQ2hFLFVBQUksWUFBWSx3QkFBd0IsR0FBRztBQUMxQyxjQUFNLFlBQVksWUFBWSxTQUFTLElBQUk7QUFDM0MsWUFBSSxZQUFZLGNBQWM7QUFDN0IseUJBQWU7QUFDZiw4QkFBb0I7QUFBQSxRQUNyQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxzQkFBc0IsSUFBSTtBQUM3QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsS0FBSyxjQUFjLGVBQWUsaUJBQWlCLEVBQUUsNkJBQTZCLEdBQUc7QUFDekYsZUFBUyxhQUFhLHFCQUFxQixjQUFjLG1CQUFtQixjQUFjO0FBQ3pGLGNBQU0sY0FBYyxLQUFLLGNBQWMsZUFBZSxVQUFVO0FBQ2hFLG9CQUFZLGtDQUFrQztBQUFBLE1BQy9DO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLGdCQUFzQjtBQUM1QixVQUFNLElBQUksTUFBTSxlQUFlO0FBQUEsRUFDaEM7QUFBQSxFQUVPLFNBQWU7QUFDckIsVUFBTSxJQUFJLE1BQU0sZUFBZTtBQUFBLEVBQ2hDO0FBQUEsRUFFTyxXQUFXLGNBQWtDO0FBRW5ELFNBQUssY0FBYyxZQUFZLFlBQVk7QUFDM0MsU0FBSyxrQkFBa0IsdUJBQXVCLGFBQWEsWUFBWTtBQUN2RSxTQUFLLFFBQVEsU0FBUyxLQUFLLFNBQVMsV0FBVyxlQUFlLENBQUM7QUFDL0QsU0FBSyxRQUFRLFVBQVUsS0FBSyxJQUFJLEtBQUssU0FBUyxXQUFXLGdCQUFnQixHQUFHLEdBQU8sQ0FBQztBQUtwRixRQUFJLEtBQUssMEJBQTBCO0FBRWxDLFlBQU0sMEJBQTBCLEtBQUs7QUFHckMsVUFBSSxhQUFhLG1CQUFtQix3QkFBd0IsaUJBQWlCLHdCQUF3QixpQkFBaUIsYUFBYSxlQUFlO0FBRWpKLGFBQUssMkJBQTJCO0FBR2hDLGFBQUssWUFBWTtBQUdqQixjQUFNLGdCQUFnQixLQUFLLDJCQUEyQix1QkFBdUI7QUFFN0UsWUFBSSxlQUFlO0FBQ2xCLGNBQUksQ0FBQyxLQUFLLHVCQUF1QixDQUFDLGNBQWMsUUFBUTtBQUV2RCxpQkFBSyxvQkFBb0IsY0FBYyxtQkFBbUI7QUFBQSxVQUMzRDtBQUVBLGVBQUssU0FBUyxVQUFVLFdBQVcsa0JBQWtCO0FBQUEsWUFDcEQsWUFBWSxjQUFjO0FBQUEsVUFDM0IsR0FBRyx3QkFBd0IsVUFBVTtBQUFBLFFBQ3RDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLENBQUMsS0FBSyxzQkFBc0IsR0FBRztBQUVsQyxXQUFLLHVCQUF1QixTQUFTO0FBQUEsSUFDdEMsT0FBTztBQUNOLFdBQUssdUJBQXVCLE9BQU87QUFBQSxJQUNwQztBQUVBLFFBQUksU0FBUyxXQUFXLENBQUMsS0FBSyxvQ0FBb0MsWUFBWSxHQUFHO0FBQ2hGLFlBQU0sc0JBQXNCLEtBQUssY0FBYyxtQkFBbUI7QUFDbEUsWUFBTSxvQkFBb0IsS0FBSyxjQUFjLGlCQUFpQjtBQUM5RCxlQUFTLGFBQWEscUJBQXFCLGNBQWMsbUJBQW1CLGNBQWM7QUFDekYsY0FBTSxjQUFjLEtBQUssY0FBYyxlQUFlLFVBQVU7QUFDaEUsWUFBSSxZQUFZLHdCQUF3QixHQUFHO0FBQzFDLGVBQUssb0NBQW9DLFNBQVM7QUFDbEQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxTQUFLLGNBQWMsZ0JBQWdCLEtBQUssbUJBQW1CO0FBQzNELFNBQUssY0FBYyxXQUFXLFFBQVE7QUFDdEMsVUFBTSxvQkFBb0IsS0FBSyxTQUFTLFdBQVcsb0JBQW9CLElBQUksYUFBYTtBQUN4RixTQUFLLGNBQWMsT0FBTyxDQUFDLGlCQUFpQjtBQUM1QyxTQUFLLGNBQWMsUUFBUSxDQUFDLEtBQUssU0FBUyxXQUFXLHFCQUFxQixDQUFDO0FBQUEsRUFDNUU7QUFBQTtBQUFBLEVBSVEsb0JBQW9CLFdBQXlCO0FBRXBELFFBQUksS0FBSyxpQkFBaUIsUUFBUTtBQUNqQztBQUFBLElBQ0Q7QUFDQSxVQUFNLGFBQWEsS0FBSyxLQUFLLFNBQVM7QUFDdEMsUUFBSSxLQUFLLGdCQUFnQixZQUFZO0FBQ3BDLFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssU0FBUyxVQUFVLFdBQVcsZ0JBQWdCLEtBQUssYUFBYTtBQUFBLElBQ3RFO0FBQUEsRUFDRDtBQUFBLEVBRVEsK0JBQStCLFVBQW9CLFFBQW1DLGVBQXdCLE9BQXFCLFlBQWdDLGNBQXFEO0FBQy9OLFVBQU0saUJBQWlCLFNBQVM7QUFDaEMsVUFBTSxpQkFBaUIsU0FBUztBQUNoQyxVQUFNLGVBQWUsaUJBQWlCO0FBQ3RDLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSTtBQUVKLFFBQUksY0FBYyxXQUFXLFNBQVMsR0FBRztBQUN4QyxVQUFJLGdCQUFnQixXQUFXLENBQUMsRUFBRTtBQUNsQyxVQUFJLGdCQUFnQixXQUFXLENBQUMsRUFBRTtBQUNsQyxlQUFTLElBQUksR0FBRyxNQUFNLFdBQVcsUUFBUSxJQUFJLEtBQUssS0FBSztBQUN0RCxjQUFNLFlBQVksV0FBVyxDQUFDO0FBQzlCLHdCQUFnQixLQUFLLElBQUksZUFBZSxVQUFVLGVBQWU7QUFDakUsd0JBQWdCLEtBQUssSUFBSSxlQUFlLFVBQVUsYUFBYTtBQUFBLE1BQ2hFO0FBQ0EseUJBQW1CO0FBQ25CLGtCQUFZLEtBQUssU0FBUyxXQUFXLCtCQUErQixhQUFhO0FBQ2pGLGdCQUFVLEtBQUssU0FBUyxXQUFXLCtCQUErQixhQUFhLElBQUksS0FBSztBQUFBLElBQ3pGLFdBQVcsT0FBTztBQUNqQix5QkFBbUI7QUFDbkIsa0JBQVksS0FBSyxTQUFTLFdBQVcsK0JBQStCLE1BQU0sZUFBZTtBQUN6RixnQkFBVSxLQUFLLFNBQVMsV0FBVywrQkFBK0IsTUFBTSxhQUFhLElBQUksS0FBSztBQUFBLElBQy9GLE9BQU87QUFDTixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0seUJBQXlCLFdBQVcsV0FBVyxrQkFBa0IsS0FBSyxpQ0FBaUM7QUFFN0csUUFBSSxhQUFxQjtBQUN6QixRQUFJLGdCQUF3QjtBQUU1QixRQUFJLENBQUMsdUJBQXVCO0FBQzNCLFlBQU0scUJBQXNCLGlCQUFpQixLQUFLO0FBQ2xELFlBQU0sbUJBQW1CLEtBQUssSUFBSSxLQUFLLHlCQUF5QixLQUFLLHVCQUF1QixLQUFLLHdCQUF3QixDQUFDO0FBQzFILFlBQU0sVUFBVSxLQUFLLElBQUkscUJBQXFCLEdBQUcsZ0JBQWdCO0FBQ2pFLG1CQUFhLFVBQVUsS0FBSztBQUM1QixzQkFBZ0IsS0FBSyxJQUFJLEdBQUksVUFBVSxDQUFFLElBQUksS0FBSztBQUFBLElBQ25ELE9BQU87QUFDTixVQUFJLENBQUMsZUFBZTtBQUVuQixxQkFBYSxLQUFLO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLGVBQWU7QUFDbkIsVUFBSSxpQkFBaUIsV0FBVyxtQkFBbUIsVUFBVSxpQkFBaUIsV0FBVyxtQkFBbUIsUUFBUTtBQUVuSCx5QkFBaUIsS0FBSztBQUFBLE1BQ3ZCO0FBQUEsSUFDRDtBQUVBLGlCQUFhO0FBQ2IsZUFBVztBQUNYLFFBQUk7QUFFSixRQUFJLFVBQVUsWUFBWSxnQkFBZ0I7QUFFekMsVUFBSSxDQUFDLGtCQUFrQjtBQUV0QixlQUFPO0FBQUEsTUFDUjtBQUNBLHFCQUFlO0FBQUEsSUFDaEIsV0FBVyxpQkFBaUIsV0FBVyxtQkFBbUIsV0FBVyxpQkFBaUIsV0FBVyxtQkFBbUIsMEJBQTBCO0FBQzdJLFVBQUksaUJBQWlCLFdBQVcsbUJBQW1CLDRCQUE0QixrQkFBa0IsYUFBYSxXQUFXLGNBQWM7QUFFdEksdUJBQWU7QUFBQSxNQUNoQixPQUFPO0FBRU4sY0FBTSxrQkFBa0IsS0FBSyxJQUFJLElBQUksS0FBSyxhQUFhLGlCQUFpQixHQUFHO0FBRTNFLGNBQU0sbUJBQW1CLFlBQVk7QUFFckMsY0FBTSxlQUFlLFVBQVU7QUFDL0IsdUJBQWUsS0FBSyxJQUFJLGNBQWMsZ0JBQWdCO0FBQUEsTUFDdkQ7QUFBQSxJQUNELFdBQVcsaUJBQWlCLFdBQVcsbUJBQW1CLFVBQVUsaUJBQWlCLFdBQVcsbUJBQW1CLHlCQUF5QjtBQUMzSSxVQUFJLGlCQUFpQixXQUFXLG1CQUFtQiwyQkFBMkIsa0JBQWtCLGFBQWEsV0FBVyxjQUFjO0FBRXJJLHVCQUFlO0FBQUEsTUFDaEIsT0FBTztBQUVOLGNBQU0sY0FBYyxZQUFZLFdBQVc7QUFDM0MsdUJBQWUsS0FBSyxJQUFJLEdBQUcsYUFBYSxpQkFBaUIsQ0FBQztBQUFBLE1BQzNEO0FBQUEsSUFDRCxPQUFPO0FBQ04scUJBQWUsS0FBSyx5QkFBeUIsZ0JBQWdCLGNBQWMsV0FBVyxTQUFTLGlCQUFpQixXQUFXLG1CQUFtQixLQUFLLGlCQUFpQixXQUFXLG1CQUFtQixNQUFNO0FBQUEsSUFDek07QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsMkJBQTJCLHlCQUErSDtBQUVqSyxVQUFNLFdBQVcsS0FBSyxTQUFTLFdBQVcsbUJBQW1CO0FBQzdELFVBQU0sYUFBYSxLQUFLLFNBQVMsY0FBYyxRQUFRLElBQUksYUFBYSxVQUFVO0FBQ2xGLFVBQU0saUJBQWlCLFNBQVM7QUFDaEMsVUFBTSxlQUFlLGlCQUFpQixTQUFTLFFBQVEsV0FBVztBQUVsRSxRQUFJLFlBQVksVUFBVTtBQUMxQixRQUFJLFVBQVU7QUFDZCxRQUFJLFNBQVM7QUFDYixRQUFJLHdCQUF3QixTQUFTLFNBQVM7QUFDN0MsZUFBUyxLQUFLLG1CQUFtQix3QkFBd0IsVUFBVTtBQUNuRSxZQUFNLGdCQUFnQixLQUFLLDJCQUEyQix3QkFBd0IsWUFBWSx3QkFBd0IsYUFBYSx3QkFBd0IsU0FBUztBQUNoSyxVQUFJLENBQUMsZUFBZTtBQUNuQixlQUFPO0FBQUEsTUFDUjtBQUNBLGlCQUFXLGdCQUFnQixjQUFjLFFBQVE7QUFDaEQsb0JBQVksS0FBSyxJQUFJLFdBQVcsS0FBSyxNQUFNLGFBQWEsSUFBSSxDQUFDO0FBQzdELGtCQUFVLEtBQUssSUFBSSxTQUFTLEtBQUssTUFBTSxhQUFhLE9BQU8sYUFBYSxLQUFLLENBQUM7QUFBQSxNQUMvRTtBQUFBLElBQ0QsT0FBTztBQUNOLGlCQUFXLGFBQWEsd0JBQXdCLFlBQVk7QUFDM0QsWUFBSSxVQUFVLG9CQUFvQixVQUFVLGVBQWU7QUFDMUQsaUJBQU87QUFBQSxRQUNSO0FBQ0EsY0FBTSxnQkFBZ0IsS0FBSywyQkFBMkIsVUFBVSxpQkFBaUIsVUFBVSxhQUFhLFVBQVUsU0FBUztBQUMzSCxtQkFBVyxLQUFLLG1CQUFtQixVQUFVLGVBQWU7QUFDNUQsWUFBSSxDQUFDLGVBQWU7QUFDbkIsaUJBQU87QUFBQSxRQUNSO0FBQ0EsbUJBQVcsZ0JBQWdCLGNBQWMsUUFBUTtBQUNoRCxzQkFBWSxLQUFLLElBQUksV0FBVyxLQUFLLE1BQU0sYUFBYSxJQUFJLENBQUM7QUFDN0Qsb0JBQVUsS0FBSyxJQUFJLFNBQVMsS0FBSyxNQUFNLGFBQWEsT0FBTyxhQUFhLEtBQUssQ0FBQztBQUFBLFFBQy9FO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsd0JBQXdCLGVBQWU7QUFDM0Msa0JBQVksS0FBSyxJQUFJLEdBQUcsWUFBWSxXQUFVLG1CQUFtQjtBQUNqRSxpQkFBVyxLQUFLO0FBQUEsSUFDakI7QUFFQSxRQUFJLHdCQUF3QixTQUFTLGdCQUFnQixVQUFVLFlBQVksU0FBUyxPQUFPO0FBQzFGLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxnQkFBZ0IsS0FBSyx5QkFBeUIsZ0JBQWdCLGNBQWMsV0FBVyxPQUFPO0FBQ3BHLFdBQU87QUFBQSxNQUNOLFlBQVk7QUFBQSxNQUNaLHFCQUFxQjtBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixlQUF1QixhQUFxQixVQUFrQixRQUFnQixlQUF5QixhQUErQjtBQUN0SyxvQkFBZ0IsZ0JBQWdCO0FBQ2hDLGtCQUFjLGNBQWM7QUFDNUIsZUFBVyxXQUFXO0FBQ3RCLGFBQVMsU0FBUztBQUNsQixvQkFBZ0IsQ0FBQyxDQUFDO0FBQ2xCLGtCQUFjLENBQUMsQ0FBQztBQUVoQixVQUFNLGlCQUFpQixjQUFjO0FBQ3JDLFVBQU0sWUFBWSxTQUFTO0FBRTNCLFFBQUksWUFBWSxnQkFBZ0I7QUFHL0IsVUFBSSxlQUFlO0FBQ2xCLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxhQUFhO0FBQ2hCLGVBQU8sS0FBSyxJQUFJLEdBQUcsU0FBUyxjQUFjO0FBQUEsTUFDM0M7QUFFQSxVQUFJLFdBQVcsZUFBZTtBQUU3QixlQUFPO0FBQUEsTUFDUixXQUFXLFNBQVMsYUFBYTtBQUVoQyxlQUFPLEtBQUssSUFBSSxHQUFHLFNBQVMsY0FBYztBQUFBLE1BQzNDO0FBQUEsSUFDRCxPQUFPO0FBR04sYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBQUE7QUFBQTtBQUFBO0FBMXdCYSxXQUlZLHNCQUFzQjtBQUp4QyxJQUFNLFlBQU47IiwKICAibmFtZXMiOiBbXQp9Cg==
