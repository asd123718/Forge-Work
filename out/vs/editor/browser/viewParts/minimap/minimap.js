import "./minimap.css";
import * as dom from "../../../../base/browser/dom.js";
import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import { GlobalPointerMoveMonitor } from "../../../../base/browser/globalPointerMoveMonitor.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import { RenderedLinesCollection } from "../../view/viewLayer.js";
import { PartFingerprint, PartFingerprints, ViewPart } from "../../view/viewPart.js";
import { RenderMinimap, EditorOption, MINIMAP_GUTTER_WIDTH, EditorLayoutInfoComputer } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { RGBA8 } from "../../../common/core/misc/rgba.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { ColorId } from "../../../common/encodedTokenAttributes.js";
import { Constants } from "./minimapCharSheet.js";
import { MinimapTokensColorTracker } from "../../../common/viewModel/minimapTokensColorTracker.js";
import * as viewEvents from "../../../common/viewEvents.js";
import { minimapSelection, minimapBackground, minimapForegroundOpacity, editorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { Selection } from "../../../common/core/selection.js";
import { EventType, Gesture } from "../../../../base/browser/touch.js";
import { MinimapCharRendererFactory } from "./minimapCharRendererFactory.js";
import { MinimapPosition, MinimapSectionHeaderStyle } from "../../../common/model.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { LRUCache } from "../../../../base/common/map.js";
import { DEFAULT_FONT_FAMILY } from "../../../../base/browser/fonts.js";
import { ViewModelDecoration } from "../../../common/viewModel/viewModelDecoration.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
const POINTER_DRAG_RESET_DISTANCE = 140;
const GUTTER_DECORATION_WIDTH = 2;
class MinimapOptions {
  constructor(configuration, theme, tokensColorTracker) {
    const options = configuration.options;
    const pixelRatio = options.get(EditorOption.pixelRatio);
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const minimapLayout = layoutInfo.minimap;
    const fontInfo = options.get(EditorOption.fontInfo);
    const minimapOpts = options.get(EditorOption.minimap);
    this.renderMinimap = minimapLayout.renderMinimap;
    this.size = minimapOpts.size;
    this.minimapHeightIsEditorHeight = minimapLayout.minimapHeightIsEditorHeight;
    this.scrollBeyondLastLine = options.get(EditorOption.scrollBeyondLastLine);
    this.paddingTop = options.get(EditorOption.padding).top;
    this.paddingBottom = options.get(EditorOption.padding).bottom;
    this.showSlider = minimapOpts.showSlider;
    this.autohide = minimapOpts.autohide;
    this.pixelRatio = pixelRatio;
    this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
    this.lineHeight = options.get(EditorOption.lineHeight);
    this.minimapLeft = minimapLayout.minimapLeft;
    this.minimapWidth = minimapLayout.minimapWidth;
    this.minimapHeight = layoutInfo.height;
    this.canvasInnerWidth = minimapLayout.minimapCanvasInnerWidth;
    this.canvasInnerHeight = minimapLayout.minimapCanvasInnerHeight;
    this.canvasOuterWidth = minimapLayout.minimapCanvasOuterWidth;
    this.canvasOuterHeight = minimapLayout.minimapCanvasOuterHeight;
    this.isSampling = minimapLayout.minimapIsSampling;
    this.editorHeight = layoutInfo.height;
    this.fontScale = minimapLayout.minimapScale;
    this.minimapLineHeight = minimapLayout.minimapLineHeight;
    this.minimapCharWidth = Constants.BASE_CHAR_WIDTH * this.fontScale;
    this.sectionHeaderFontFamily = DEFAULT_FONT_FAMILY;
    this.sectionHeaderFontSize = minimapOpts.sectionHeaderFontSize * pixelRatio;
    this.sectionHeaderLetterSpacing = minimapOpts.sectionHeaderLetterSpacing;
    this.sectionHeaderFontColor = MinimapOptions._getSectionHeaderColor(theme, tokensColorTracker.getColor(ColorId.DefaultForeground));
    this.charRenderer = createSingleCallFunction(() => MinimapCharRendererFactory.create(this.fontScale, fontInfo.fontFamily));
    this.defaultBackgroundColor = tokensColorTracker.getColor(ColorId.DefaultBackground);
    this.backgroundColor = MinimapOptions._getMinimapBackground(theme, this.defaultBackgroundColor);
    this.foregroundAlpha = MinimapOptions._getMinimapForegroundOpacity(theme);
  }
  static _getMinimapBackground(theme, defaultBackgroundColor) {
    const themeColor = theme.getColor(minimapBackground);
    if (themeColor) {
      return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, Math.round(255 * themeColor.rgba.a));
    }
    return defaultBackgroundColor;
  }
  static _getMinimapForegroundOpacity(theme) {
    const themeColor = theme.getColor(minimapForegroundOpacity);
    if (themeColor) {
      return RGBA8._clamp(Math.round(255 * themeColor.rgba.a));
    }
    return 255;
  }
  static _getSectionHeaderColor(theme, defaultForegroundColor) {
    const themeColor = theme.getColor(editorForeground);
    if (themeColor) {
      return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, Math.round(255 * themeColor.rgba.a));
    }
    return defaultForegroundColor;
  }
  equals(other) {
    return this.renderMinimap === other.renderMinimap && this.size === other.size && this.minimapHeightIsEditorHeight === other.minimapHeightIsEditorHeight && this.scrollBeyondLastLine === other.scrollBeyondLastLine && this.paddingTop === other.paddingTop && this.paddingBottom === other.paddingBottom && this.showSlider === other.showSlider && this.autohide === other.autohide && this.pixelRatio === other.pixelRatio && this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth && this.lineHeight === other.lineHeight && this.minimapLeft === other.minimapLeft && this.minimapWidth === other.minimapWidth && this.minimapHeight === other.minimapHeight && this.canvasInnerWidth === other.canvasInnerWidth && this.canvasInnerHeight === other.canvasInnerHeight && this.canvasOuterWidth === other.canvasOuterWidth && this.canvasOuterHeight === other.canvasOuterHeight && this.isSampling === other.isSampling && this.editorHeight === other.editorHeight && this.fontScale === other.fontScale && this.minimapLineHeight === other.minimapLineHeight && this.minimapCharWidth === other.minimapCharWidth && this.sectionHeaderFontSize === other.sectionHeaderFontSize && this.sectionHeaderLetterSpacing === other.sectionHeaderLetterSpacing && this.defaultBackgroundColor && this.defaultBackgroundColor.equals(other.defaultBackgroundColor) && this.backgroundColor && this.backgroundColor.equals(other.backgroundColor) && this.foregroundAlpha === other.foregroundAlpha;
  }
}
class MinimapLayout {
  constructor(scrollTop, scrollHeight, sliderNeeded, _computedSliderRatio, sliderTop, sliderHeight, topPaddingLineCount, startLineNumber, endLineNumber) {
    this.scrollTop = scrollTop;
    this.scrollHeight = scrollHeight;
    this.sliderNeeded = sliderNeeded;
    this._computedSliderRatio = _computedSliderRatio;
    this.sliderTop = sliderTop;
    this.sliderHeight = sliderHeight;
    this.topPaddingLineCount = topPaddingLineCount;
    this.startLineNumber = startLineNumber;
    this.endLineNumber = endLineNumber;
  }
  /**
   * Compute a desired `scrollPosition` such that the slider moves by `delta`.
   */
  getDesiredScrollTopFromDelta(delta) {
    return Math.round(this.scrollTop + delta / this._computedSliderRatio);
  }
  getDesiredScrollTopFromTouchLocation(pageY) {
    return Math.round((pageY - this.sliderHeight / 2) / this._computedSliderRatio);
  }
  /**
   * Intersect a line range with `this.startLineNumber` and `this.endLineNumber`.
   */
  intersectWithViewport(range) {
    const startLineNumber = Math.max(this.startLineNumber, range.startLineNumber);
    const endLineNumber = Math.min(this.endLineNumber, range.endLineNumber);
    if (startLineNumber > endLineNumber) {
      return null;
    }
    return [startLineNumber, endLineNumber];
  }
  /**
   * Get the inner minimap y coordinate for a line number.
   */
  getYForLineNumber(lineNumber, minimapLineHeight) {
    return +(lineNumber - this.startLineNumber + this.topPaddingLineCount) * minimapLineHeight;
  }
  static create(options, viewportStartLineNumber, viewportEndLineNumber, viewportStartLineNumberVerticalOffset, viewportHeight, viewportContainsWhitespaceGaps, lineCount, realLineCount, scrollTop, scrollHeight, previousLayout) {
    const pixelRatio = options.pixelRatio;
    const minimapLineHeight = options.minimapLineHeight;
    const minimapLinesFitting = Math.floor(options.canvasInnerHeight / minimapLineHeight);
    const lineHeight = options.lineHeight;
    if (options.minimapHeightIsEditorHeight) {
      let logicalScrollHeight = realLineCount * options.lineHeight + options.paddingTop + options.paddingBottom;
      if (options.scrollBeyondLastLine) {
        logicalScrollHeight += Math.max(0, viewportHeight - options.lineHeight - options.paddingBottom);
      }
      const sliderHeight2 = Math.max(1, Math.floor(viewportHeight * viewportHeight / logicalScrollHeight));
      const maxMinimapSliderTop2 = Math.max(0, options.minimapHeight - sliderHeight2);
      const computedSliderRatio2 = maxMinimapSliderTop2 / (scrollHeight - viewportHeight);
      const sliderTop2 = scrollTop * computedSliderRatio2;
      const sliderNeeded = maxMinimapSliderTop2 > 0;
      const maxLinesFitting = Math.floor(options.canvasInnerHeight / options.minimapLineHeight);
      const topPaddingLineCount = Math.floor(options.paddingTop / options.lineHeight);
      return new MinimapLayout(scrollTop, scrollHeight, sliderNeeded, computedSliderRatio2, sliderTop2, sliderHeight2, topPaddingLineCount, 1, Math.min(lineCount, maxLinesFitting));
    }
    let sliderHeight;
    if (viewportContainsWhitespaceGaps && viewportEndLineNumber !== lineCount) {
      const viewportLineCount = viewportEndLineNumber - viewportStartLineNumber + 1;
      sliderHeight = Math.floor(viewportLineCount * minimapLineHeight / pixelRatio);
    } else {
      const expectedViewportLineCount = viewportHeight / lineHeight;
      sliderHeight = Math.floor(expectedViewportLineCount * minimapLineHeight / pixelRatio);
    }
    const extraLinesAtTheTop = Math.floor(options.paddingTop / lineHeight);
    let extraLinesAtTheBottom = Math.floor(options.paddingBottom / lineHeight);
    if (options.scrollBeyondLastLine) {
      const expectedViewportLineCount = viewportHeight / lineHeight;
      extraLinesAtTheBottom = Math.max(extraLinesAtTheBottom, expectedViewportLineCount - 1);
    }
    let maxMinimapSliderTop;
    if (extraLinesAtTheBottom > 0) {
      const expectedViewportLineCount = viewportHeight / lineHeight;
      maxMinimapSliderTop = (extraLinesAtTheTop + lineCount + extraLinesAtTheBottom - expectedViewportLineCount - 1) * minimapLineHeight / pixelRatio;
    } else {
      maxMinimapSliderTop = Math.max(0, (extraLinesAtTheTop + lineCount) * minimapLineHeight / pixelRatio - sliderHeight);
    }
    maxMinimapSliderTop = Math.min(options.minimapHeight - sliderHeight, maxMinimapSliderTop);
    const computedSliderRatio = maxMinimapSliderTop / (scrollHeight - viewportHeight);
    const sliderTop = scrollTop * computedSliderRatio;
    if (minimapLinesFitting >= extraLinesAtTheTop + lineCount + extraLinesAtTheBottom) {
      const sliderNeeded = maxMinimapSliderTop > 0;
      return new MinimapLayout(scrollTop, scrollHeight, sliderNeeded, computedSliderRatio, sliderTop, sliderHeight, extraLinesAtTheTop, 1, lineCount);
    } else {
      let consideringStartLineNumber;
      if (viewportStartLineNumber > 1) {
        consideringStartLineNumber = viewportStartLineNumber + extraLinesAtTheTop;
      } else {
        consideringStartLineNumber = Math.max(1, scrollTop / lineHeight);
      }
      let topPaddingLineCount;
      let startLineNumber = Math.max(1, Math.floor(consideringStartLineNumber - sliderTop * pixelRatio / minimapLineHeight));
      if (startLineNumber < extraLinesAtTheTop) {
        topPaddingLineCount = extraLinesAtTheTop - startLineNumber + 1;
        startLineNumber = 1;
      } else {
        topPaddingLineCount = 0;
        startLineNumber = Math.max(1, startLineNumber - extraLinesAtTheTop);
      }
      if (previousLayout && previousLayout.scrollHeight === scrollHeight) {
        if (previousLayout.scrollTop > scrollTop) {
          startLineNumber = Math.min(startLineNumber, previousLayout.startLineNumber);
          topPaddingLineCount = Math.max(topPaddingLineCount, previousLayout.topPaddingLineCount);
        }
        if (previousLayout.scrollTop < scrollTop) {
          startLineNumber = Math.max(startLineNumber, previousLayout.startLineNumber);
          topPaddingLineCount = Math.min(topPaddingLineCount, previousLayout.topPaddingLineCount);
        }
      }
      const endLineNumber = Math.min(lineCount, startLineNumber - topPaddingLineCount + minimapLinesFitting - 1);
      const partialLine = (scrollTop - viewportStartLineNumberVerticalOffset) / lineHeight;
      let sliderTopAligned;
      if (scrollTop >= options.paddingTop) {
        sliderTopAligned = (viewportStartLineNumber - startLineNumber + topPaddingLineCount + partialLine) * minimapLineHeight / pixelRatio;
      } else {
        sliderTopAligned = scrollTop / options.paddingTop * (topPaddingLineCount + partialLine) * minimapLineHeight / pixelRatio;
      }
      return new MinimapLayout(scrollTop, scrollHeight, true, computedSliderRatio, sliderTopAligned, sliderHeight, topPaddingLineCount, startLineNumber, endLineNumber);
    }
  }
}
const _MinimapLine = class _MinimapLine {
  constructor(dy) {
    this.dy = dy;
  }
  onContentChanged() {
    this.dy = -1;
  }
  onTokensChanged() {
    this.dy = -1;
  }
};
_MinimapLine.INVALID = new _MinimapLine(-1);
let MinimapLine = _MinimapLine;
class RenderData {
  constructor(renderedLayout, imageData, lines) {
    this.renderedLayout = renderedLayout;
    this._imageData = imageData;
    this._renderedLines = new RenderedLinesCollection({
      createLine: () => MinimapLine.INVALID
    });
    this._renderedLines._set(renderedLayout.startLineNumber, lines);
  }
  /**
   * Check if the current RenderData matches accurately the new desired layout and no painting is needed.
   */
  linesEquals(layout) {
    if (!this.scrollEquals(layout)) {
      return false;
    }
    const tmp = this._renderedLines._get();
    const lines = tmp.lines;
    for (let i = 0, len = lines.length; i < len; i++) {
      if (lines[i].dy === -1) {
        return false;
      }
    }
    return true;
  }
  /**
   * Check if the current RenderData matches the new layout's scroll position
   */
  scrollEquals(layout) {
    return this.renderedLayout.startLineNumber === layout.startLineNumber && this.renderedLayout.endLineNumber === layout.endLineNumber;
  }
  _get() {
    const tmp = this._renderedLines._get();
    return {
      imageData: this._imageData,
      rendLineNumberStart: tmp.rendLineNumberStart,
      lines: tmp.lines
    };
  }
  onLinesChanged(changeFromLineNumber, changeCount) {
    return this._renderedLines.onLinesChanged(changeFromLineNumber, changeCount);
  }
  onLinesDeleted(deleteFromLineNumber, deleteToLineNumber) {
    this._renderedLines.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
  }
  onLinesInserted(insertFromLineNumber, insertToLineNumber) {
    this._renderedLines.onLinesInserted(insertFromLineNumber, insertToLineNumber);
  }
  onTokensChanged(ranges) {
    return this._renderedLines.onTokensChanged(ranges);
  }
}
class MinimapBuffers {
  constructor(ctx, WIDTH, HEIGHT, background) {
    this._backgroundFillData = MinimapBuffers._createBackgroundFillData(WIDTH, HEIGHT, background);
    this._buffers = [
      ctx.createImageData(WIDTH, HEIGHT),
      ctx.createImageData(WIDTH, HEIGHT)
    ];
    this._lastUsedBuffer = 0;
  }
  getBuffer() {
    this._lastUsedBuffer = 1 - this._lastUsedBuffer;
    const result = this._buffers[this._lastUsedBuffer];
    result.data.set(this._backgroundFillData);
    return result;
  }
  static _createBackgroundFillData(WIDTH, HEIGHT, background) {
    const backgroundR = background.r;
    const backgroundG = background.g;
    const backgroundB = background.b;
    const backgroundA = background.a;
    const result = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    let offset = 0;
    for (let i = 0; i < HEIGHT; i++) {
      for (let j = 0; j < WIDTH; j++) {
        result[offset] = backgroundR;
        result[offset + 1] = backgroundG;
        result[offset + 2] = backgroundB;
        result[offset + 3] = backgroundA;
        offset += 4;
      }
    }
    return result;
  }
}
class MinimapSamplingState {
  constructor(samplingRatio, minimapLines) {
    this.samplingRatio = samplingRatio;
    this.minimapLines = minimapLines;
  }
  static compute(options, viewLineCount, oldSamplingState) {
    if (options.renderMinimap === RenderMinimap.None || !options.isSampling) {
      return [null, []];
    }
    const { minimapLineCount } = EditorLayoutInfoComputer.computeContainedMinimapLineCount({
      viewLineCount,
      scrollBeyondLastLine: options.scrollBeyondLastLine,
      paddingTop: options.paddingTop,
      paddingBottom: options.paddingBottom,
      height: options.editorHeight,
      lineHeight: options.lineHeight,
      pixelRatio: options.pixelRatio
    });
    const ratio = viewLineCount / minimapLineCount;
    const halfRatio = ratio / 2;
    if (!oldSamplingState || oldSamplingState.minimapLines.length === 0) {
      const result2 = [];
      result2[0] = 1;
      if (minimapLineCount > 1) {
        for (let i = 0, lastIndex = minimapLineCount - 1; i < lastIndex; i++) {
          result2[i] = Math.round(i * ratio + halfRatio);
        }
        result2[minimapLineCount - 1] = viewLineCount;
      }
      return [new MinimapSamplingState(ratio, result2), []];
    }
    const oldMinimapLines = oldSamplingState.minimapLines;
    const oldLength = oldMinimapLines.length;
    const result = [];
    let oldIndex = 0;
    let oldDeltaLineCount = 0;
    let minViewLineNumber = 1;
    const MAX_EVENT_COUNT = 10;
    let events = [];
    let lastEvent = null;
    for (let i = 0; i < minimapLineCount; i++) {
      const fromViewLineNumber = Math.max(minViewLineNumber, Math.round(i * ratio));
      const toViewLineNumber = Math.max(fromViewLineNumber, Math.round((i + 1) * ratio));
      while (oldIndex < oldLength && oldMinimapLines[oldIndex] < fromViewLineNumber) {
        if (events.length < MAX_EVENT_COUNT) {
          const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
          if (lastEvent && lastEvent.type === "deleted" && lastEvent._oldIndex === oldIndex - 1) {
            lastEvent.deleteToLineNumber++;
          } else {
            lastEvent = { type: "deleted", _oldIndex: oldIndex, deleteFromLineNumber: oldMinimapLineNumber, deleteToLineNumber: oldMinimapLineNumber };
            events.push(lastEvent);
          }
          oldDeltaLineCount--;
        }
        oldIndex++;
      }
      let selectedViewLineNumber;
      if (oldIndex < oldLength && oldMinimapLines[oldIndex] <= toViewLineNumber) {
        selectedViewLineNumber = oldMinimapLines[oldIndex];
        oldIndex++;
      } else {
        if (i === 0) {
          selectedViewLineNumber = 1;
        } else if (i + 1 === minimapLineCount) {
          selectedViewLineNumber = viewLineCount;
        } else {
          selectedViewLineNumber = Math.round(i * ratio + halfRatio);
        }
        if (events.length < MAX_EVENT_COUNT) {
          const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
          if (lastEvent && lastEvent.type === "inserted" && lastEvent._i === i - 1) {
            lastEvent.insertToLineNumber++;
          } else {
            lastEvent = { type: "inserted", _i: i, insertFromLineNumber: oldMinimapLineNumber, insertToLineNumber: oldMinimapLineNumber };
            events.push(lastEvent);
          }
          oldDeltaLineCount++;
        }
      }
      result[i] = selectedViewLineNumber;
      minViewLineNumber = selectedViewLineNumber;
    }
    if (events.length < MAX_EVENT_COUNT) {
      while (oldIndex < oldLength) {
        const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
        if (lastEvent && lastEvent.type === "deleted" && lastEvent._oldIndex === oldIndex - 1) {
          lastEvent.deleteToLineNumber++;
        } else {
          lastEvent = { type: "deleted", _oldIndex: oldIndex, deleteFromLineNumber: oldMinimapLineNumber, deleteToLineNumber: oldMinimapLineNumber };
          events.push(lastEvent);
        }
        oldDeltaLineCount--;
        oldIndex++;
      }
    } else {
      events = [{ type: "flush" }];
    }
    return [new MinimapSamplingState(ratio, result), events];
  }
  modelLineToMinimapLine(lineNumber) {
    return Math.min(this.minimapLines.length, Math.max(1, Math.round(lineNumber / this.samplingRatio)));
  }
  /**
   * Will return null if the model line ranges are not intersecting with a sampled model line.
   */
  modelLineRangeToMinimapLineRange(fromLineNumber, toLineNumber) {
    let fromLineIndex = this.modelLineToMinimapLine(fromLineNumber) - 1;
    while (fromLineIndex > 0 && this.minimapLines[fromLineIndex - 1] >= fromLineNumber) {
      fromLineIndex--;
    }
    let toLineIndex = this.modelLineToMinimapLine(toLineNumber) - 1;
    while (toLineIndex + 1 < this.minimapLines.length && this.minimapLines[toLineIndex + 1] <= toLineNumber) {
      toLineIndex++;
    }
    if (fromLineIndex === toLineIndex) {
      const sampledLineNumber = this.minimapLines[fromLineIndex];
      if (sampledLineNumber < fromLineNumber || sampledLineNumber > toLineNumber) {
        return null;
      }
    }
    return [fromLineIndex + 1, toLineIndex + 1];
  }
  /**
   * Will always return a range, even if it is not intersecting with a sampled model line.
   */
  decorationLineRangeToMinimapLineRange(startLineNumber, endLineNumber) {
    let minimapLineStart = this.modelLineToMinimapLine(startLineNumber);
    let minimapLineEnd = this.modelLineToMinimapLine(endLineNumber);
    if (startLineNumber !== endLineNumber && minimapLineEnd === minimapLineStart) {
      if (minimapLineEnd === this.minimapLines.length) {
        if (minimapLineStart > 1) {
          minimapLineStart--;
        }
      } else {
        minimapLineEnd++;
      }
    }
    return [minimapLineStart, minimapLineEnd];
  }
  onLinesDeleted(e) {
    const deletedLineCount = e.toLineNumber - e.fromLineNumber + 1;
    let changeStartIndex = this.minimapLines.length;
    let changeEndIndex = 0;
    for (let i = this.minimapLines.length - 1; i >= 0; i--) {
      if (this.minimapLines[i] < e.fromLineNumber) {
        break;
      }
      if (this.minimapLines[i] <= e.toLineNumber) {
        this.minimapLines[i] = Math.max(1, e.fromLineNumber - 1);
        changeStartIndex = Math.min(changeStartIndex, i);
        changeEndIndex = Math.max(changeEndIndex, i);
      } else {
        this.minimapLines[i] -= deletedLineCount;
      }
    }
    return [changeStartIndex, changeEndIndex];
  }
  onLinesInserted(e) {
    const insertedLineCount = e.toLineNumber - e.fromLineNumber + 1;
    for (let i = this.minimapLines.length - 1; i >= 0; i--) {
      if (this.minimapLines[i] < e.fromLineNumber) {
        break;
      }
      this.minimapLines[i] += insertedLineCount;
    }
  }
}
class Minimap extends ViewPart {
  constructor(context) {
    super(context);
    this._sectionHeaderCache = new LRUCache(10, 1.5);
    this.tokensColorTracker = MinimapTokensColorTracker.getInstance();
    this._selections = [];
    this._minimapSelections = null;
    this.options = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker);
    const [samplingState] = MinimapSamplingState.compute(this.options, this._context.viewModel.getLineCount(), null);
    this._samplingState = samplingState;
    this._shouldCheckSampling = false;
    this._actual = new InnerMinimap(context.theme, this);
  }
  dispose() {
    this._actual.dispose();
    super.dispose();
  }
  getDomNode() {
    return this._actual.getDomNode();
  }
  _onOptionsMaybeChanged() {
    const opts = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker);
    if (this.options.equals(opts)) {
      return false;
    }
    this.options = opts;
    this._recreateLineSampling();
    this._actual.onDidChangeOptions();
    return true;
  }
  // ---- begin view event handlers
  onConfigurationChanged(e) {
    return this._onOptionsMaybeChanged();
  }
  onCursorStateChanged(e) {
    this._selections = e.selections;
    this._minimapSelections = null;
    return this._actual.onSelectionChanged();
  }
  onDecorationsChanged(e) {
    if (e.affectsMinimap) {
      return this._actual.onDecorationsChanged();
    }
    return false;
  }
  onFlushed(e) {
    if (this._samplingState) {
      this._shouldCheckSampling = true;
    }
    return this._actual.onFlushed();
  }
  onLinesChanged(e) {
    if (this._samplingState) {
      const minimapLineRange = this._samplingState.modelLineRangeToMinimapLineRange(e.fromLineNumber, e.fromLineNumber + e.count - 1);
      if (minimapLineRange) {
        return this._actual.onLinesChanged(minimapLineRange[0], minimapLineRange[1] - minimapLineRange[0] + 1);
      } else {
        return false;
      }
    } else {
      return this._actual.onLinesChanged(e.fromLineNumber, e.count);
    }
  }
  onLinesDeleted(e) {
    if (this._samplingState) {
      const [changeStartIndex, changeEndIndex] = this._samplingState.onLinesDeleted(e);
      if (changeStartIndex <= changeEndIndex) {
        this._actual.onLinesChanged(changeStartIndex + 1, changeEndIndex - changeStartIndex + 1);
      }
      this._shouldCheckSampling = true;
      return true;
    } else {
      return this._actual.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
    }
  }
  onLinesInserted(e) {
    if (this._samplingState) {
      this._samplingState.onLinesInserted(e);
      this._shouldCheckSampling = true;
      return true;
    } else {
      return this._actual.onLinesInserted(e.fromLineNumber, e.toLineNumber);
    }
  }
  onScrollChanged(e) {
    return this._actual.onScrollChanged(e);
  }
  onThemeChanged(e) {
    this._actual.onThemeChanged();
    this._onOptionsMaybeChanged();
    return true;
  }
  onTokensChanged(e) {
    if (this._samplingState) {
      const ranges = [];
      for (const range of e.ranges) {
        const minimapLineRange = this._samplingState.modelLineRangeToMinimapLineRange(range.fromLineNumber, range.toLineNumber);
        if (minimapLineRange) {
          ranges.push({ fromLineNumber: minimapLineRange[0], toLineNumber: minimapLineRange[1] });
        }
      }
      if (ranges.length) {
        return this._actual.onTokensChanged(ranges);
      } else {
        return false;
      }
    } else {
      return this._actual.onTokensChanged(e.ranges);
    }
  }
  onTokensColorsChanged(e) {
    this._onOptionsMaybeChanged();
    return this._actual.onTokensColorsChanged();
  }
  onZonesChanged(e) {
    return this._actual.onZonesChanged();
  }
  // --- end event handlers
  prepareRender(ctx) {
    if (this._shouldCheckSampling) {
      this._shouldCheckSampling = false;
      this._recreateLineSampling();
    }
  }
  render(ctx) {
    let viewportStartLineNumber = ctx.visibleRange.startLineNumber;
    let viewportEndLineNumber = ctx.visibleRange.endLineNumber;
    if (this._samplingState) {
      viewportStartLineNumber = this._samplingState.modelLineToMinimapLine(viewportStartLineNumber);
      viewportEndLineNumber = this._samplingState.modelLineToMinimapLine(viewportEndLineNumber);
    }
    const minimapCtx = {
      viewportContainsWhitespaceGaps: ctx.viewportData.whitespaceViewportData.length > 0,
      scrollWidth: ctx.scrollWidth,
      scrollHeight: ctx.scrollHeight,
      viewportStartLineNumber,
      viewportEndLineNumber,
      viewportStartLineNumberVerticalOffset: ctx.getVerticalOffsetForLineNumber(viewportStartLineNumber),
      scrollTop: ctx.scrollTop,
      scrollLeft: ctx.scrollLeft,
      viewportWidth: ctx.viewportWidth,
      viewportHeight: ctx.viewportHeight
    };
    this._actual.render(minimapCtx);
  }
  //#region IMinimapModel
  _recreateLineSampling() {
    this._minimapSelections = null;
    const wasSampling = Boolean(this._samplingState);
    const [samplingState, events] = MinimapSamplingState.compute(this.options, this._context.viewModel.getLineCount(), this._samplingState);
    this._samplingState = samplingState;
    if (wasSampling && this._samplingState) {
      for (const event of events) {
        switch (event.type) {
          case "deleted":
            this._actual.onLinesDeleted(event.deleteFromLineNumber, event.deleteToLineNumber);
            break;
          case "inserted":
            this._actual.onLinesInserted(event.insertFromLineNumber, event.insertToLineNumber);
            break;
          case "flush":
            this._actual.onFlushed();
            break;
        }
      }
    }
  }
  getLineCount() {
    if (this._samplingState) {
      return this._samplingState.minimapLines.length;
    }
    return this._context.viewModel.getLineCount();
  }
  getRealLineCount() {
    return this._context.viewModel.getLineCount();
  }
  getLineContent(lineNumber) {
    if (this._samplingState) {
      return this._context.viewModel.getLineContent(this._samplingState.minimapLines[lineNumber - 1]);
    }
    return this._context.viewModel.getLineContent(lineNumber);
  }
  getLineMaxColumn(lineNumber) {
    if (this._samplingState) {
      return this._context.viewModel.getLineMaxColumn(this._samplingState.minimapLines[lineNumber - 1]);
    }
    return this._context.viewModel.getLineMaxColumn(lineNumber);
  }
  getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed) {
    if (this._samplingState) {
      const result = [];
      for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
        if (needed[lineIndex]) {
          result[lineIndex] = this._context.viewModel.getViewLineData(this._samplingState.minimapLines[startLineNumber + lineIndex - 1]);
        } else {
          result[lineIndex] = null;
        }
      }
      return result;
    }
    return this._context.viewModel.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed).data;
  }
  getSelections() {
    if (this._minimapSelections === null) {
      if (this._samplingState) {
        this._minimapSelections = [];
        for (const selection of this._selections) {
          const [minimapLineStart, minimapLineEnd] = this._samplingState.decorationLineRangeToMinimapLineRange(selection.startLineNumber, selection.endLineNumber);
          this._minimapSelections.push(new Selection(minimapLineStart, selection.startColumn, minimapLineEnd, selection.endColumn));
        }
      } else {
        this._minimapSelections = this._selections;
      }
    }
    return this._minimapSelections;
  }
  getMinimapDecorationsInViewport(startLineNumber, endLineNumber) {
    return this._getMinimapDecorationsInViewport(startLineNumber, endLineNumber).filter((decoration) => !decoration.options.minimap?.sectionHeaderStyle);
  }
  getSectionHeaderDecorationsInViewport(startLineNumber, endLineNumber) {
    const headerHeightInMinimapLines = this.options.sectionHeaderFontSize / this.options.minimapLineHeight;
    startLineNumber = Math.floor(Math.max(1, startLineNumber - headerHeightInMinimapLines));
    return this._getMinimapDecorationsInViewport(startLineNumber, endLineNumber).filter((decoration) => !!decoration.options.minimap?.sectionHeaderStyle);
  }
  _getMinimapDecorationsInViewport(startLineNumber, endLineNumber) {
    let visibleRange;
    if (this._samplingState) {
      const modelStartLineNumber = this._samplingState.minimapLines[startLineNumber - 1];
      const modelEndLineNumber = this._samplingState.minimapLines[endLineNumber - 1];
      visibleRange = new Range(modelStartLineNumber, 1, modelEndLineNumber, this._context.viewModel.getLineMaxColumn(modelEndLineNumber));
    } else {
      visibleRange = new Range(startLineNumber, 1, endLineNumber, this._context.viewModel.getLineMaxColumn(endLineNumber));
    }
    const decorations = this._context.viewModel.getMinimapDecorationsInRange(visibleRange);
    if (this._samplingState) {
      const result = [];
      for (const decoration of decorations) {
        if (!decoration.options.minimap) {
          continue;
        }
        const range = decoration.range;
        const minimapStartLineNumber = this._samplingState.modelLineToMinimapLine(range.startLineNumber);
        const minimapEndLineNumber = this._samplingState.modelLineToMinimapLine(range.endLineNumber);
        result.push(new ViewModelDecoration(new Range(minimapStartLineNumber, range.startColumn, minimapEndLineNumber, range.endColumn), decoration.options));
      }
      return result;
    }
    return decorations;
  }
  getSectionHeaderText(decoration, fitWidth) {
    const headerText = decoration.options.minimap?.sectionHeaderText;
    if (!headerText) {
      return null;
    }
    const cachedText = this._sectionHeaderCache.get(headerText);
    if (cachedText) {
      return cachedText;
    }
    const fittedText = fitWidth(headerText);
    this._sectionHeaderCache.set(headerText, fittedText);
    return fittedText;
  }
  getOptions() {
    return this._context.viewModel.model.getOptions();
  }
  revealLineNumber(lineNumber) {
    if (this._samplingState) {
      lineNumber = this._samplingState.minimapLines[lineNumber - 1];
    }
    this._context.viewModel.revealRange(
      "mouse",
      false,
      new Range(lineNumber, 1, lineNumber, 1),
      viewEvents.VerticalRevealType.Center,
      ScrollType.Smooth
    );
  }
  setScrollTop(scrollTop) {
    this._context.viewModel.viewLayout.setScrollPosition({
      scrollTop
    }, ScrollType.Immediate);
  }
  //#endregion
}
class InnerMinimap extends Disposable {
  constructor(theme, model) {
    super();
    this._renderDecorations = false;
    this._gestureInProgress = false;
    this._isMouseOverMinimap = false;
    this._theme = theme;
    this._model = model;
    this._lastRenderData = null;
    this._buffers = null;
    this._selectionColor = this._theme.getColor(minimapSelection);
    this._domNode = createFastDomNode(document.createElement("div"));
    PartFingerprints.write(this._domNode, PartFingerprint.Minimap);
    this._domNode.setClassName(this._getMinimapDomNodeClassName());
    this._domNode.setPosition("absolute");
    this._domNode.setAttribute("role", "presentation");
    this._domNode.setAttribute("aria-hidden", "true");
    this._shadow = createFastDomNode(document.createElement("div"));
    this._shadow.setClassName("minimap-shadow-hidden");
    this._domNode.appendChild(this._shadow);
    this._canvas = createFastDomNode(document.createElement("canvas"));
    this._canvas.setPosition("absolute");
    this._canvas.setLeft(0);
    this._domNode.appendChild(this._canvas);
    this._decorationsCanvas = createFastDomNode(document.createElement("canvas"));
    this._decorationsCanvas.setPosition("absolute");
    this._decorationsCanvas.setClassName("minimap-decorations-layer");
    this._decorationsCanvas.setLeft(0);
    this._domNode.appendChild(this._decorationsCanvas);
    this._slider = createFastDomNode(document.createElement("div"));
    this._slider.setPosition("absolute");
    this._slider.setClassName("minimap-slider");
    this._slider.setLayerHinting(true);
    this._slider.setContain("strict");
    this._domNode.appendChild(this._slider);
    this._sliderHorizontal = createFastDomNode(document.createElement("div"));
    this._sliderHorizontal.setPosition("absolute");
    this._sliderHorizontal.setClassName("minimap-slider-horizontal");
    this._slider.appendChild(this._sliderHorizontal);
    this._applyLayout();
    this._hideDelayedScheduler = this._register(new RunOnceScheduler(() => this._hideImmediatelyIfMouseIsOutside(), 500));
    this._register(dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.MOUSE_OVER, () => {
      this._isMouseOverMinimap = true;
    }));
    this._register(dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.MOUSE_LEAVE, () => {
      this._isMouseOverMinimap = false;
    }));
    this._pointerDownListener = dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.POINTER_DOWN, (e) => {
      e.preventDefault();
      const isMouse = e.pointerType === "mouse";
      const isLeftClick = e.button === 0;
      const renderMinimap = this._model.options.renderMinimap;
      if (renderMinimap === RenderMinimap.None) {
        return;
      }
      if (!this._lastRenderData) {
        return;
      }
      if (this._model.options.size !== "proportional") {
        if (isLeftClick && this._lastRenderData) {
          const position = dom.getDomNodePagePosition(this._slider.domNode);
          const initialPosY = position.top + position.height / 2;
          this._startSliderDragging(e, initialPosY, this._lastRenderData.renderedLayout);
        }
        return;
      }
      if (isLeftClick || !isMouse) {
        const minimapLineHeight = this._model.options.minimapLineHeight;
        const internalOffsetY = this._model.options.canvasInnerHeight / this._model.options.canvasOuterHeight * e.offsetY;
        const lineIndex = Math.floor(internalOffsetY / minimapLineHeight);
        let lineNumber = lineIndex + this._lastRenderData.renderedLayout.startLineNumber - this._lastRenderData.renderedLayout.topPaddingLineCount;
        lineNumber = Math.min(lineNumber, this._model.getLineCount());
        this._model.revealLineNumber(lineNumber);
      }
    });
    this._sliderPointerMoveMonitor = new GlobalPointerMoveMonitor();
    this._sliderPointerDownListener = dom.addStandardDisposableListener(this._slider.domNode, dom.EventType.POINTER_DOWN, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 0 && this._lastRenderData) {
        this._startSliderDragging(e, e.pageY, this._lastRenderData.renderedLayout);
      }
    });
    this._gestureDisposable = Gesture.addTarget(this._domNode.domNode);
    this._sliderTouchStartListener = dom.addDisposableListener(this._domNode.domNode, EventType.Start, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._lastRenderData) {
        this._slider.toggleClassName("active", true);
        this._gestureInProgress = true;
        this.scrollDueToTouchEvent(e);
      }
    }, { passive: false });
    this._sliderTouchMoveListener = dom.addDisposableListener(this._domNode.domNode, EventType.Change, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._lastRenderData && this._gestureInProgress) {
        this.scrollDueToTouchEvent(e);
      }
    }, { passive: false });
    this._sliderTouchEndListener = dom.addStandardDisposableListener(this._domNode.domNode, EventType.End, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._gestureInProgress = false;
      this._slider.toggleClassName("active", false);
    });
  }
  _hideSoon() {
    this._hideDelayedScheduler.cancel();
    this._hideDelayedScheduler.schedule();
  }
  _hideImmediatelyIfMouseIsOutside() {
    if (this._isMouseOverMinimap) {
      this._hideSoon();
      return;
    }
    this._domNode.toggleClassName("active", false);
  }
  _startSliderDragging(e, initialPosY, initialSliderState) {
    if (!e.target || !(e.target instanceof Element)) {
      return;
    }
    const initialPosX = e.pageX;
    this._slider.toggleClassName("active", true);
    const handlePointerMove = (posy, posx) => {
      const minimapPosition = dom.getDomNodePagePosition(this._domNode.domNode);
      const pointerOrthogonalDelta = Math.min(
        Math.abs(posx - initialPosX),
        Math.abs(posx - minimapPosition.left),
        Math.abs(posx - minimapPosition.left - minimapPosition.width)
      );
      if (platform.isWindows && pointerOrthogonalDelta > POINTER_DRAG_RESET_DISTANCE) {
        this._model.setScrollTop(initialSliderState.scrollTop);
        return;
      }
      const pointerDelta = posy - initialPosY;
      this._model.setScrollTop(initialSliderState.getDesiredScrollTopFromDelta(pointerDelta));
    };
    if (e.pageY !== initialPosY) {
      handlePointerMove(e.pageY, initialPosX);
    }
    this._sliderPointerMoveMonitor.startMonitoring(
      e.target,
      e.pointerId,
      e.buttons,
      (pointerMoveData) => handlePointerMove(pointerMoveData.pageY, pointerMoveData.pageX),
      () => {
        this._slider.toggleClassName("active", false);
      }
    );
  }
  scrollDueToTouchEvent(touch) {
    const startY = this._domNode.domNode.getBoundingClientRect().top;
    const scrollTop = this._lastRenderData.renderedLayout.getDesiredScrollTopFromTouchLocation(touch.pageY - startY);
    this._model.setScrollTop(scrollTop);
  }
  dispose() {
    this._pointerDownListener.dispose();
    this._sliderPointerMoveMonitor.dispose();
    this._sliderPointerDownListener.dispose();
    this._gestureDisposable.dispose();
    this._sliderTouchStartListener.dispose();
    this._sliderTouchMoveListener.dispose();
    this._sliderTouchEndListener.dispose();
    super.dispose();
  }
  _getMinimapDomNodeClassName() {
    const class_ = ["minimap"];
    if (this._model.options.showSlider === "always") {
      class_.push("slider-always");
    } else {
      class_.push("slider-mouseover");
    }
    if (this._model.options.autohide === "mouseover") {
      class_.push("minimap-autohide-mouseover");
    } else if (this._model.options.autohide === "scroll") {
      class_.push("minimap-autohide-scroll");
    }
    return class_.join(" ");
  }
  getDomNode() {
    return this._domNode;
  }
  _applyLayout() {
    this._domNode.setLeft(this._model.options.minimapLeft);
    this._domNode.setWidth(this._model.options.minimapWidth);
    this._domNode.setHeight(this._model.options.minimapHeight);
    this._shadow.setHeight(this._model.options.minimapHeight);
    this._canvas.setWidth(this._model.options.canvasOuterWidth);
    this._canvas.setHeight(this._model.options.canvasOuterHeight);
    this._canvas.domNode.width = this._model.options.canvasInnerWidth;
    this._canvas.domNode.height = this._model.options.canvasInnerHeight;
    this._decorationsCanvas.setWidth(this._model.options.canvasOuterWidth);
    this._decorationsCanvas.setHeight(this._model.options.canvasOuterHeight);
    this._decorationsCanvas.domNode.width = this._model.options.canvasInnerWidth;
    this._decorationsCanvas.domNode.height = this._model.options.canvasInnerHeight;
    this._slider.setWidth(this._model.options.minimapWidth);
  }
  _getBuffer() {
    if (!this._buffers) {
      if (this._model.options.canvasInnerWidth > 0 && this._model.options.canvasInnerHeight > 0) {
        this._buffers = new MinimapBuffers(
          this._canvas.domNode.getContext("2d"),
          this._model.options.canvasInnerWidth,
          this._model.options.canvasInnerHeight,
          this._model.options.backgroundColor
        );
      }
    }
    return this._buffers ? this._buffers.getBuffer() : null;
  }
  // ---- begin view event handlers
  onDidChangeOptions() {
    this._lastRenderData = null;
    this._buffers = null;
    this._applyLayout();
    this._domNode.setClassName(this._getMinimapDomNodeClassName());
  }
  onSelectionChanged() {
    this._renderDecorations = true;
    return true;
  }
  onDecorationsChanged() {
    this._renderDecorations = true;
    return true;
  }
  onFlushed() {
    this._lastRenderData = null;
    return true;
  }
  onLinesChanged(changeFromLineNumber, changeCount) {
    if (this._lastRenderData) {
      return this._lastRenderData.onLinesChanged(changeFromLineNumber, changeCount);
    }
    return false;
  }
  onLinesDeleted(deleteFromLineNumber, deleteToLineNumber) {
    this._lastRenderData?.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
    return true;
  }
  onLinesInserted(insertFromLineNumber, insertToLineNumber) {
    this._lastRenderData?.onLinesInserted(insertFromLineNumber, insertToLineNumber);
    return true;
  }
  onScrollChanged(e) {
    if (this._model.options.autohide === "scroll" && (e.scrollTopChanged || e.scrollHeightChanged)) {
      this._domNode.toggleClassName("active", true);
      this._hideSoon();
    }
    this._renderDecorations = true;
    return true;
  }
  onThemeChanged() {
    this._selectionColor = this._theme.getColor(minimapSelection);
    this._renderDecorations = true;
    return true;
  }
  onTokensChanged(ranges) {
    if (this._lastRenderData) {
      return this._lastRenderData.onTokensChanged(ranges);
    }
    return false;
  }
  onTokensColorsChanged() {
    this._lastRenderData = null;
    this._buffers = null;
    return true;
  }
  onZonesChanged() {
    this._lastRenderData = null;
    return true;
  }
  // --- end event handlers
  render(renderingCtx) {
    const renderMinimap = this._model.options.renderMinimap;
    if (renderMinimap === RenderMinimap.None) {
      this._shadow.setClassName("minimap-shadow-hidden");
      this._sliderHorizontal.setWidth(0);
      this._sliderHorizontal.setHeight(0);
      return;
    }
    if (renderingCtx.scrollLeft + renderingCtx.viewportWidth >= renderingCtx.scrollWidth) {
      this._shadow.setClassName("minimap-shadow-hidden");
    } else {
      this._shadow.setClassName("minimap-shadow-visible");
    }
    const layout = MinimapLayout.create(
      this._model.options,
      renderingCtx.viewportStartLineNumber,
      renderingCtx.viewportEndLineNumber,
      renderingCtx.viewportStartLineNumberVerticalOffset,
      renderingCtx.viewportHeight,
      renderingCtx.viewportContainsWhitespaceGaps,
      this._model.getLineCount(),
      this._model.getRealLineCount(),
      renderingCtx.scrollTop,
      renderingCtx.scrollHeight,
      this._lastRenderData ? this._lastRenderData.renderedLayout : null
    );
    this._slider.setDisplay(layout.sliderNeeded ? "block" : "none");
    this._slider.setTop(layout.sliderTop);
    this._slider.setHeight(layout.sliderHeight);
    this._sliderHorizontal.setLeft(0);
    this._sliderHorizontal.setWidth(this._model.options.minimapWidth);
    this._sliderHorizontal.setTop(0);
    this._sliderHorizontal.setHeight(layout.sliderHeight);
    this.renderDecorations(layout);
    this._lastRenderData = this.renderLines(layout);
  }
  renderDecorations(layout) {
    if (this._renderDecorations) {
      this._renderDecorations = false;
      const selections = this._model.getSelections();
      selections.sort(Range.compareRangesUsingStarts);
      const decorations = this._model.getMinimapDecorationsInViewport(layout.startLineNumber, layout.endLineNumber);
      decorations.sort((a, b) => (a.options.zIndex || 0) - (b.options.zIndex || 0));
      const { canvasInnerWidth, canvasInnerHeight } = this._model.options;
      const minimapLineHeight = this._model.options.minimapLineHeight;
      const minimapCharWidth = this._model.options.minimapCharWidth;
      const tabSize = this._model.getOptions().tabSize;
      const canvasContext = this._decorationsCanvas.domNode.getContext("2d");
      canvasContext.clearRect(0, 0, canvasInnerWidth, canvasInnerHeight);
      const highlightedLines = new ContiguousLineMap(layout.startLineNumber, layout.endLineNumber, false);
      this._renderSelectionLineHighlights(canvasContext, selections, highlightedLines, layout, minimapLineHeight);
      this._renderDecorationsLineHighlights(canvasContext, decorations, highlightedLines, layout, minimapLineHeight);
      const lineOffsetMap = new ContiguousLineMap(layout.startLineNumber, layout.endLineNumber, null);
      this._renderSelectionsHighlights(canvasContext, selections, lineOffsetMap, layout, minimapLineHeight, tabSize, minimapCharWidth, canvasInnerWidth);
      this._renderDecorationsHighlights(canvasContext, decorations, lineOffsetMap, layout, minimapLineHeight, tabSize, minimapCharWidth, canvasInnerWidth);
      this._renderSectionHeaders(layout);
    }
  }
  _renderSelectionLineHighlights(canvasContext, selections, highlightedLines, layout, minimapLineHeight) {
    if (!this._selectionColor || this._selectionColor.isTransparent()) {
      return;
    }
    canvasContext.fillStyle = this._selectionColor.transparent(0.5).toString();
    let y1 = 0;
    let y2 = 0;
    for (const selection of selections) {
      const intersection = layout.intersectWithViewport(selection);
      if (!intersection) {
        continue;
      }
      const [startLineNumber, endLineNumber] = intersection;
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        highlightedLines.set(line, true);
      }
      const yy1 = layout.getYForLineNumber(startLineNumber, minimapLineHeight);
      const yy2 = layout.getYForLineNumber(endLineNumber, minimapLineHeight);
      if (y2 >= yy1) {
        y2 = yy2;
      } else {
        if (y2 > y1) {
          canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y1, canvasContext.canvas.width, y2 - y1);
        }
        y1 = yy1;
        y2 = yy2;
      }
    }
    if (y2 > y1) {
      canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y1, canvasContext.canvas.width, y2 - y1);
    }
  }
  _renderDecorationsLineHighlights(canvasContext, decorations, highlightedLines, layout, minimapLineHeight) {
    const highlightColors = /* @__PURE__ */ new Map();
    for (let i = decorations.length - 1; i >= 0; i--) {
      const decoration = decorations[i];
      const minimapOptions = decoration.options.minimap;
      if (!minimapOptions || minimapOptions.position !== MinimapPosition.Inline) {
        continue;
      }
      const intersection = layout.intersectWithViewport(decoration.range);
      if (!intersection) {
        continue;
      }
      const [startLineNumber, endLineNumber] = intersection;
      const decorationColor = minimapOptions.getColor(this._theme.value);
      if (!decorationColor || decorationColor.isTransparent()) {
        continue;
      }
      let highlightColor = highlightColors.get(decorationColor.toString());
      if (!highlightColor) {
        highlightColor = decorationColor.transparent(0.5).toString();
        highlightColors.set(decorationColor.toString(), highlightColor);
      }
      canvasContext.fillStyle = highlightColor;
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        if (highlightedLines.has(line)) {
          continue;
        }
        highlightedLines.set(line, true);
        const y = layout.getYForLineNumber(line, minimapLineHeight);
        canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y, canvasContext.canvas.width, minimapLineHeight);
      }
    }
  }
  _renderSelectionsHighlights(canvasContext, selections, lineOffsetMap, layout, lineHeight, tabSize, characterWidth, canvasInnerWidth) {
    if (!this._selectionColor || this._selectionColor.isTransparent()) {
      return;
    }
    for (const selection of selections) {
      const intersection = layout.intersectWithViewport(selection);
      if (!intersection) {
        continue;
      }
      const [startLineNumber, endLineNumber] = intersection;
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        this.renderDecorationOnLine(canvasContext, lineOffsetMap, selection, this._selectionColor, layout, line, lineHeight, lineHeight, tabSize, characterWidth, canvasInnerWidth);
      }
    }
  }
  _renderDecorationsHighlights(canvasContext, decorations, lineOffsetMap, layout, minimapLineHeight, tabSize, characterWidth, canvasInnerWidth) {
    for (const decoration of decorations) {
      const minimapOptions = decoration.options.minimap;
      if (!minimapOptions) {
        continue;
      }
      const intersection = layout.intersectWithViewport(decoration.range);
      if (!intersection) {
        continue;
      }
      const [startLineNumber, endLineNumber] = intersection;
      const decorationColor = minimapOptions.getColor(this._theme.value);
      if (!decorationColor || decorationColor.isTransparent()) {
        continue;
      }
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        switch (minimapOptions.position) {
          case MinimapPosition.Inline:
            this.renderDecorationOnLine(canvasContext, lineOffsetMap, decoration.range, decorationColor, layout, line, minimapLineHeight, minimapLineHeight, tabSize, characterWidth, canvasInnerWidth);
            continue;
          case MinimapPosition.Gutter: {
            const y = layout.getYForLineNumber(line, minimapLineHeight);
            const x = 2;
            this.renderDecoration(canvasContext, decorationColor, x, y, GUTTER_DECORATION_WIDTH, minimapLineHeight);
            continue;
          }
        }
      }
    }
  }
  renderDecorationOnLine(canvasContext, lineOffsetMap, decorationRange, decorationColor, layout, lineNumber, height, minimapLineHeight, tabSize, charWidth, canvasInnerWidth) {
    const y = layout.getYForLineNumber(lineNumber, minimapLineHeight);
    if (y + height < 0 || y > this._model.options.canvasInnerHeight) {
      return;
    }
    const { startLineNumber, endLineNumber } = decorationRange;
    const startColumn = startLineNumber === lineNumber ? decorationRange.startColumn : 1;
    const endColumn = endLineNumber === lineNumber ? decorationRange.endColumn : this._model.getLineMaxColumn(lineNumber);
    const x1 = this.getXOffsetForPosition(lineOffsetMap, lineNumber, startColumn, tabSize, charWidth, canvasInnerWidth);
    const x2 = this.getXOffsetForPosition(lineOffsetMap, lineNumber, endColumn, tabSize, charWidth, canvasInnerWidth);
    this.renderDecoration(canvasContext, decorationColor, x1, y, x2 - x1, height);
  }
  getXOffsetForPosition(lineOffsetMap, lineNumber, column, tabSize, charWidth, canvasInnerWidth) {
    if (column === 1) {
      return MINIMAP_GUTTER_WIDTH;
    }
    const minimumXOffset = (column - 1) * charWidth;
    if (minimumXOffset >= canvasInnerWidth) {
      return canvasInnerWidth;
    }
    let lineIndexToXOffset = lineOffsetMap.get(lineNumber);
    if (!lineIndexToXOffset) {
      const lineData = this._model.getLineContent(lineNumber);
      lineIndexToXOffset = [MINIMAP_GUTTER_WIDTH];
      let prevx = MINIMAP_GUTTER_WIDTH;
      for (let i = 1; i < lineData.length + 1; i++) {
        const charCode = lineData.charCodeAt(i - 1);
        const dx = charCode === CharCode.Tab ? tabSize * charWidth : strings.isFullWidthCharacter(charCode) ? 2 * charWidth : charWidth;
        const x = prevx + dx;
        if (x >= canvasInnerWidth) {
          lineIndexToXOffset[i] = canvasInnerWidth;
          break;
        }
        lineIndexToXOffset[i] = x;
        prevx = x;
      }
      lineOffsetMap.set(lineNumber, lineIndexToXOffset);
    }
    if (column - 1 < lineIndexToXOffset.length) {
      return lineIndexToXOffset[column - 1];
    }
    return canvasInnerWidth;
  }
  renderDecoration(canvasContext, decorationColor, x, y, width, height) {
    canvasContext.fillStyle = decorationColor && decorationColor.toString() || "";
    canvasContext.fillRect(x, y, width, height);
  }
  _renderSectionHeaders(layout) {
    const minimapLineHeight = this._model.options.minimapLineHeight;
    const sectionHeaderFontSize = this._model.options.sectionHeaderFontSize;
    const sectionHeaderLetterSpacing = this._model.options.sectionHeaderLetterSpacing;
    const backgroundFillHeight = sectionHeaderFontSize * 1.5;
    const { canvasInnerWidth } = this._model.options;
    const backgroundColor = this._model.options.backgroundColor;
    const backgroundFill = `rgb(${backgroundColor.r} ${backgroundColor.g} ${backgroundColor.b} / .7)`;
    const foregroundColor = this._model.options.sectionHeaderFontColor;
    const foregroundFill = `rgb(${foregroundColor.r} ${foregroundColor.g} ${foregroundColor.b})`;
    const separatorStroke = foregroundFill;
    const canvasContext = this._decorationsCanvas.domNode.getContext("2d");
    canvasContext.letterSpacing = sectionHeaderLetterSpacing + "px";
    canvasContext.font = "500 " + sectionHeaderFontSize + "px " + this._model.options.sectionHeaderFontFamily;
    canvasContext.strokeStyle = separatorStroke;
    canvasContext.lineWidth = 0.4;
    const decorations = this._model.getSectionHeaderDecorationsInViewport(layout.startLineNumber, layout.endLineNumber);
    decorations.sort((a, b) => a.range.startLineNumber - b.range.startLineNumber);
    const fitWidth = InnerMinimap._fitSectionHeader.bind(
      null,
      canvasContext,
      canvasInnerWidth - MINIMAP_GUTTER_WIDTH
    );
    for (const decoration of decorations) {
      const y = layout.getYForLineNumber(decoration.range.startLineNumber, minimapLineHeight) + sectionHeaderFontSize;
      const backgroundFillY = y - sectionHeaderFontSize;
      const separatorY = backgroundFillY + 2;
      const headerText = this._model.getSectionHeaderText(decoration, fitWidth);
      InnerMinimap._renderSectionLabel(
        canvasContext,
        headerText,
        decoration.options.minimap?.sectionHeaderStyle === MinimapSectionHeaderStyle.Underlined,
        backgroundFill,
        foregroundFill,
        canvasInnerWidth,
        backgroundFillY,
        backgroundFillHeight,
        y,
        separatorY
      );
    }
  }
  static _fitSectionHeader(target, maxWidth, headerText) {
    if (!headerText) {
      return headerText;
    }
    const ellipsis = "\u2026";
    const width = target.measureText(headerText).width;
    const ellipsisWidth = target.measureText(ellipsis).width;
    if (width <= maxWidth || width <= ellipsisWidth) {
      return headerText;
    }
    const len = headerText.length;
    const averageCharWidth = width / headerText.length;
    const maxCharCount = Math.floor((maxWidth - ellipsisWidth) / averageCharWidth) - 1;
    let halfCharCount = Math.ceil(maxCharCount / 2);
    while (halfCharCount > 0 && /\s/.test(headerText[halfCharCount - 1])) {
      --halfCharCount;
    }
    return headerText.substring(0, halfCharCount) + ellipsis + headerText.substring(len - (maxCharCount - halfCharCount));
  }
  static _renderSectionLabel(target, headerText, hasSeparatorLine, backgroundFill, foregroundFill, minimapWidth, backgroundFillY, backgroundFillHeight, textY, separatorY) {
    if (headerText) {
      target.fillStyle = backgroundFill;
      target.fillRect(0, backgroundFillY, minimapWidth, backgroundFillHeight);
      target.fillStyle = foregroundFill;
      target.fillText(headerText, MINIMAP_GUTTER_WIDTH, textY);
    }
    if (hasSeparatorLine) {
      target.beginPath();
      target.moveTo(0, separatorY);
      target.lineTo(minimapWidth, separatorY);
      target.closePath();
      target.stroke();
    }
  }
  renderLines(layout) {
    const startLineNumber = layout.startLineNumber;
    const endLineNumber = layout.endLineNumber;
    const minimapLineHeight = this._model.options.minimapLineHeight;
    if (this._lastRenderData && this._lastRenderData.linesEquals(layout)) {
      const _lastData = this._lastRenderData._get();
      return new RenderData(layout, _lastData.imageData, _lastData.lines);
    }
    const imageData = this._getBuffer();
    if (!imageData) {
      return null;
    }
    const [_dirtyY1, _dirtyY2, needed] = InnerMinimap._renderUntouchedLines(
      imageData,
      layout.topPaddingLineCount,
      startLineNumber,
      endLineNumber,
      minimapLineHeight,
      this._lastRenderData
    );
    const lineInfo = this._model.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed);
    const tabSize = this._model.getOptions().tabSize;
    const defaultBackground = this._model.options.defaultBackgroundColor;
    const background = this._model.options.backgroundColor;
    const foregroundAlpha = this._model.options.foregroundAlpha;
    const tokensColorTracker = this._model.tokensColorTracker;
    const useLighterFont = tokensColorTracker.backgroundIsLight();
    const renderMinimap = this._model.options.renderMinimap;
    const charRenderer = this._model.options.charRenderer();
    const fontScale = this._model.options.fontScale;
    const minimapCharWidth = this._model.options.minimapCharWidth;
    const baseCharHeight = renderMinimap === RenderMinimap.Text ? Constants.BASE_CHAR_HEIGHT : Constants.BASE_CHAR_HEIGHT + 1;
    const renderMinimapLineHeight = baseCharHeight * fontScale;
    const innerLinePadding = minimapLineHeight > renderMinimapLineHeight ? Math.floor((minimapLineHeight - renderMinimapLineHeight) / 2) : 0;
    const backgroundA = background.a / 255;
    const renderBackground = new RGBA8(
      Math.round((background.r - defaultBackground.r) * backgroundA + defaultBackground.r),
      Math.round((background.g - defaultBackground.g) * backgroundA + defaultBackground.g),
      Math.round((background.b - defaultBackground.b) * backgroundA + defaultBackground.b),
      255
    );
    let dy = layout.topPaddingLineCount * minimapLineHeight;
    const renderedLines = [];
    for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
      if (needed[lineIndex]) {
        InnerMinimap._renderLine(
          imageData,
          renderBackground,
          background.a,
          useLighterFont,
          renderMinimap,
          minimapCharWidth,
          tokensColorTracker,
          foregroundAlpha,
          charRenderer,
          dy,
          innerLinePadding,
          tabSize,
          lineInfo[lineIndex],
          fontScale,
          minimapLineHeight
        );
      }
      renderedLines[lineIndex] = new MinimapLine(dy);
      dy += minimapLineHeight;
    }
    const dirtyY1 = _dirtyY1 === -1 ? 0 : _dirtyY1;
    const dirtyY2 = _dirtyY2 === -1 ? imageData.height : _dirtyY2;
    const dirtyHeight = dirtyY2 - dirtyY1;
    const ctx = this._canvas.domNode.getContext("2d");
    ctx.putImageData(imageData, 0, 0, 0, dirtyY1, imageData.width, dirtyHeight);
    return new RenderData(
      layout,
      imageData,
      renderedLines
    );
  }
  static _renderUntouchedLines(target, topPaddingLineCount, startLineNumber, endLineNumber, minimapLineHeight, lastRenderData) {
    const needed = [];
    if (!lastRenderData) {
      for (let i = 0, len = endLineNumber - startLineNumber + 1; i < len; i++) {
        needed[i] = true;
      }
      return [-1, -1, needed];
    }
    const _lastData = lastRenderData._get();
    const lastTargetData = _lastData.imageData.data;
    const lastStartLineNumber = _lastData.rendLineNumberStart;
    const lastLines = _lastData.lines;
    const lastLinesLength = lastLines.length;
    const WIDTH = target.width;
    const targetData = target.data;
    const maxDestPixel = (endLineNumber - startLineNumber + 1) * minimapLineHeight * WIDTH * 4;
    let dirtyPixel1 = -1;
    let dirtyPixel2 = -1;
    let copySourceStart = -1;
    let copySourceEnd = -1;
    let copyDestStart = -1;
    let copyDestEnd = -1;
    let dest_dy = topPaddingLineCount * minimapLineHeight;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const lineIndex = lineNumber - startLineNumber;
      const lastLineIndex = lineNumber - lastStartLineNumber;
      const source_dy = lastLineIndex >= 0 && lastLineIndex < lastLinesLength ? lastLines[lastLineIndex].dy : -1;
      if (source_dy === -1) {
        needed[lineIndex] = true;
        dest_dy += minimapLineHeight;
        continue;
      }
      const sourceStart = source_dy * WIDTH * 4;
      const sourceEnd = (source_dy + minimapLineHeight) * WIDTH * 4;
      const destStart = dest_dy * WIDTH * 4;
      const destEnd = (dest_dy + minimapLineHeight) * WIDTH * 4;
      if (copySourceEnd === sourceStart && copyDestEnd === destStart) {
        copySourceEnd = sourceEnd;
        copyDestEnd = destEnd;
      } else {
        if (copySourceStart !== -1) {
          targetData.set(lastTargetData.subarray(copySourceStart, copySourceEnd), copyDestStart);
          if (dirtyPixel1 === -1 && copySourceStart === 0 && copySourceStart === copyDestStart) {
            dirtyPixel1 = copySourceEnd;
          }
          if (dirtyPixel2 === -1 && copySourceEnd === maxDestPixel && copySourceStart === copyDestStart) {
            dirtyPixel2 = copySourceStart;
          }
        }
        copySourceStart = sourceStart;
        copySourceEnd = sourceEnd;
        copyDestStart = destStart;
        copyDestEnd = destEnd;
      }
      needed[lineIndex] = false;
      dest_dy += minimapLineHeight;
    }
    if (copySourceStart !== -1) {
      targetData.set(lastTargetData.subarray(copySourceStart, copySourceEnd), copyDestStart);
      if (dirtyPixel1 === -1 && copySourceStart === 0 && copySourceStart === copyDestStart) {
        dirtyPixel1 = copySourceEnd;
      }
      if (dirtyPixel2 === -1 && copySourceEnd === maxDestPixel && copySourceStart === copyDestStart) {
        dirtyPixel2 = copySourceStart;
      }
    }
    const dirtyY1 = dirtyPixel1 === -1 ? -1 : dirtyPixel1 / (WIDTH * 4);
    const dirtyY2 = dirtyPixel2 === -1 ? -1 : dirtyPixel2 / (WIDTH * 4);
    return [dirtyY1, dirtyY2, needed];
  }
  static _renderLine(target, backgroundColor, backgroundAlpha, useLighterFont, renderMinimap, charWidth, colorTracker, foregroundAlpha, minimapCharRenderer, dy, innerLinePadding, tabSize, lineData, fontScale, minimapLineHeight) {
    const content = lineData.content;
    const tokens = lineData.tokens;
    const maxDx = target.width - charWidth;
    const force1pxHeight = minimapLineHeight === 1;
    let dx = MINIMAP_GUTTER_WIDTH;
    let charIndex = 0;
    let tabsCharDelta = 0;
    for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
      const tokenEndIndex = tokens.getEndOffset(tokenIndex);
      const tokenColorId = tokens.getForeground(tokenIndex);
      const tokenColor = colorTracker.getColor(tokenColorId);
      for (; charIndex < tokenEndIndex; charIndex++) {
        if (dx > maxDx) {
          return;
        }
        const charCode = content.charCodeAt(charIndex);
        if (charCode === CharCode.Tab) {
          const insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
          tabsCharDelta += insertSpacesCount - 1;
          dx += insertSpacesCount * charWidth;
        } else if (charCode === CharCode.Space) {
          dx += charWidth;
        } else {
          const count = strings.isFullWidthCharacter(charCode) ? 2 : 1;
          for (let i = 0; i < count; i++) {
            if (renderMinimap === RenderMinimap.Blocks) {
              minimapCharRenderer.blockRenderChar(target, dx, dy + innerLinePadding, tokenColor, foregroundAlpha, backgroundColor, backgroundAlpha, force1pxHeight);
            } else {
              minimapCharRenderer.renderChar(target, dx, dy + innerLinePadding, charCode, tokenColor, foregroundAlpha, backgroundColor, backgroundAlpha, fontScale, useLighterFont, force1pxHeight);
            }
            dx += charWidth;
            if (dx > maxDx) {
              return;
            }
          }
        }
      }
    }
  }
}
class ContiguousLineMap {
  constructor(startLineNumber, endLineNumber, defaultValue) {
    this._startLineNumber = startLineNumber;
    this._endLineNumber = endLineNumber;
    this._defaultValue = defaultValue;
    this._values = [];
    for (let i = 0, count = this._endLineNumber - this._startLineNumber + 1; i < count; i++) {
      this._values[i] = defaultValue;
    }
  }
  has(lineNumber) {
    return this.get(lineNumber) !== this._defaultValue;
  }
  set(lineNumber, value) {
    if (lineNumber < this._startLineNumber || lineNumber > this._endLineNumber) {
      return;
    }
    this._values[lineNumber - this._startLineNumber] = value;
  }
  get(lineNumber) {
    if (lineNumber < this._startLineNumber || lineNumber > this._endLineNumber) {
      return this._defaultValue;
    }
    return this._values[lineNumber - this._startLineNumber];
  }
}
export {
  Minimap
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdQYXJ0c1xcbWluaW1hcFxcbWluaW1hcC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9taW5pbWFwLmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBGYXN0RG9tTm9kZSwgY3JlYXRlRmFzdERvbU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZmFzdERvbU5vZGUuanMnO1xuaW1wb3J0IHsgR2xvYmFsUG9pbnRlck1vdmVNb25pdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2dsb2JhbFBvaW50ZXJNb3ZlTW9uaXRvci5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJTGluZSwgUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdMYXllci5qcyc7XG5pbXBvcnQgeyBQYXJ0RmluZ2VycHJpbnQsIFBhcnRGaW5nZXJwcmludHMsIFZpZXdQYXJ0IH0gZnJvbSAnLi4vLi4vdmlldy92aWV3UGFydC5qcyc7XG5pbXBvcnQgeyBSZW5kZXJNaW5pbWFwLCBFZGl0b3JPcHRpb24sIE1JTklNQVBfR1VUVEVSX1dJRFRILCBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBSR0JBOCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL21pc2MvcmdiYS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvcklkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgTWluaW1hcENoYXJSZW5kZXJlciB9IGZyb20gJy4vbWluaW1hcENoYXJSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuL21pbmltYXBDaGFyU2hlZXQuanMnO1xuaW1wb3J0IHsgTWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvbWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBSZW5kZXJpbmdDb250ZXh0LCBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCB9IGZyb20gJy4uLy4uL3ZpZXcvcmVuZGVyaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHsgRWRpdG9yVGhlbWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yVGhlbWUuanMnO1xuaW1wb3J0ICogYXMgdmlld0V2ZW50cyBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBWaWV3TGluZURhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IG1pbmltYXBTZWxlY3Rpb24sIG1pbmltYXBCYWNrZ3JvdW5kLCBtaW5pbWFwRm9yZWdyb3VuZE9wYWNpdHksIGVkaXRvckZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25NaW5pbWFwT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgR2VzdHVyZUV2ZW50LCBFdmVudFR5cGUsIEdlc3R1cmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgTWluaW1hcENoYXJSZW5kZXJlckZhY3RvcnkgfSBmcm9tICcuL21pbmltYXBDaGFyUmVuZGVyZXJGYWN0b3J5LmpzJztcbmltcG9ydCB7IE1pbmltYXBQb3NpdGlvbiwgTWluaW1hcFNlY3Rpb25IZWFkZXJTdHlsZSwgVGV4dE1vZGVsUmVzb2x2ZWRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9GT05UX0ZBTUlMWSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb250cy5qcyc7XG5pbXBvcnQgeyBWaWV3TW9kZWxEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxEZWNvcmF0aW9uLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbi8qKlxuICogVGhlIG9ydGhvZ29uYWwgZGlzdGFuY2UgdG8gdGhlIHNsaWRlciBhdCB3aGljaCBkcmFnZ2luZyBcInJlc2V0c1wiLiBUaGlzIGltcGxlbWVudHMgXCJzbmFwcGluZ1wiXG4gKi9cbmNvbnN0IFBPSU5URVJfRFJBR19SRVNFVF9ESVNUQU5DRSA9IDE0MDtcblxuY29uc3QgR1VUVEVSX0RFQ09SQVRJT05fV0lEVEggPSAyO1xuXG5jbGFzcyBNaW5pbWFwT3B0aW9ucyB7XG5cblx0cHVibGljIHJlYWRvbmx5IHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXA7XG5cdHB1YmxpYyByZWFkb25seSBzaXplOiAncHJvcG9ydGlvbmFsJyB8ICdmaWxsJyB8ICdmaXQnO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2Nyb2xsQmV5b25kTGFzdExpbmU6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBwYWRkaW5nVG9wOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBwYWRkaW5nQm90dG9tOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBzaG93U2xpZGVyOiAnYWx3YXlzJyB8ICdtb3VzZW92ZXInO1xuXHRwdWJsaWMgcmVhZG9ubHkgYXV0b2hpZGU6ICdub25lJyB8ICdtb3VzZW92ZXInIHwgJ3Njcm9sbCc7XG5cdHB1YmxpYyByZWFkb25seSBwaXhlbFJhdGlvOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGxpbmVIZWlnaHQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIGNvbnRhaW5lciBkb20gbm9kZSBsZWZ0IHBvc2l0aW9uIChpbiBDU1MgcHgpXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgbWluaW1hcExlZnQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIGNvbnRhaW5lciBkb20gbm9kZSB3aWR0aCAoaW4gQ1NTIHB4KVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IG1pbmltYXBXaWR0aDogbnVtYmVyO1xuXHQvKipcblx0ICogY29udGFpbmVyIGRvbSBub2RlIGhlaWdodCAoaW4gQ1NTIHB4KVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IG1pbmltYXBIZWlnaHQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIGNhbnZhcyBiYWNraW5nIHN0b3JlIHdpZHRoIChpbiBkZXZpY2UgcHgpXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgY2FudmFzSW5uZXJXaWR0aDogbnVtYmVyO1xuXHQvKipcblx0ICogY2FudmFzIGJhY2tpbmcgc3RvcmUgaGVpZ2h0IChpbiBkZXZpY2UgcHgpXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgY2FudmFzSW5uZXJIZWlnaHQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIGNhbnZhcyB3aWR0aCAoaW4gQ1NTIHB4KVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGNhbnZhc091dGVyV2lkdGg6IG51bWJlcjtcblx0LyoqXG5cdCAqIGNhbnZhcyBoZWlnaHQgKGluIENTUyBweClcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBjYW52YXNPdXRlckhlaWdodDogbnVtYmVyO1xuXG5cdHB1YmxpYyByZWFkb25seSBpc1NhbXBsaW5nOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgZWRpdG9ySGVpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBmb250U2NhbGU6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IG1pbmltYXBMaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBtaW5pbWFwQ2hhcldpZHRoOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBzZWN0aW9uSGVhZGVyRm9udEZhbWlseTogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2VjdGlvbkhlYWRlckZvbnRTaXplOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBTcGFjZSBpbiBiZXR3ZWVuIHRoZSBjaGFyYWN0ZXJzIG9mIHRoZSBzZWN0aW9uIGhlYWRlciAoaW4gQ1NTIHB4KVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBzZWN0aW9uSGVhZGVyRm9udENvbG9yOiBSR0JBODtcblxuXHRwdWJsaWMgcmVhZG9ubHkgY2hhclJlbmRlcmVyOiAoKSA9PiBNaW5pbWFwQ2hhclJlbmRlcmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgZGVmYXVsdEJhY2tncm91bmRDb2xvcjogUkdCQTg7XG5cdHB1YmxpYyByZWFkb25seSBiYWNrZ3JvdW5kQ29sb3I6IFJHQkE4O1xuXHQvKipcblx0ICogZm9yZWdyb3VuZCBhbHBoYTogaW50ZWdlciBpbiBbMC0yNTVdXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgZm9yZWdyb3VuZEFscGhhOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoY29uZmlndXJhdGlvbjogSUVkaXRvckNvbmZpZ3VyYXRpb24sIHRoZW1lOiBFZGl0b3JUaGVtZSwgdG9rZW5zQ29sb3JUcmFja2VyOiBNaW5pbWFwVG9rZW5zQ29sb3JUcmFja2VyKSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBwaXhlbFJhdGlvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnBpeGVsUmF0aW8pO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cdFx0Y29uc3QgbWluaW1hcExheW91dCA9IGxheW91dEluZm8ubWluaW1hcDtcblx0XHRjb25zdCBmb250SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0Y29uc3QgbWluaW1hcE9wdHMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubWluaW1hcCk7XG5cblx0XHR0aGlzLnJlbmRlck1pbmltYXAgPSBtaW5pbWFwTGF5b3V0LnJlbmRlck1pbmltYXA7XG5cdFx0dGhpcy5zaXplID0gbWluaW1hcE9wdHMuc2l6ZTtcblx0XHR0aGlzLm1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodCA9IG1pbmltYXBMYXlvdXQubWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0O1xuXHRcdHRoaXMuc2Nyb2xsQmV5b25kTGFzdExpbmUgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2Nyb2xsQmV5b25kTGFzdExpbmUpO1xuXHRcdHRoaXMucGFkZGluZ1RvcCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5wYWRkaW5nKS50b3A7XG5cdFx0dGhpcy5wYWRkaW5nQm90dG9tID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnBhZGRpbmcpLmJvdHRvbTtcblx0XHR0aGlzLnNob3dTbGlkZXIgPSBtaW5pbWFwT3B0cy5zaG93U2xpZGVyO1xuXHRcdHRoaXMuYXV0b2hpZGUgPSBtaW5pbWFwT3B0cy5hdXRvaGlkZTtcblx0XHR0aGlzLnBpeGVsUmF0aW8gPSBwaXhlbFJhdGlvO1xuXHRcdHRoaXMudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoID0gZm9udEluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdHRoaXMubGluZUhlaWdodCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHR0aGlzLm1pbmltYXBMZWZ0ID0gbWluaW1hcExheW91dC5taW5pbWFwTGVmdDtcblx0XHR0aGlzLm1pbmltYXBXaWR0aCA9IG1pbmltYXBMYXlvdXQubWluaW1hcFdpZHRoO1xuXHRcdHRoaXMubWluaW1hcEhlaWdodCA9IGxheW91dEluZm8uaGVpZ2h0O1xuXG5cdFx0dGhpcy5jYW52YXNJbm5lcldpZHRoID0gbWluaW1hcExheW91dC5taW5pbWFwQ2FudmFzSW5uZXJXaWR0aDtcblx0XHR0aGlzLmNhbnZhc0lubmVySGVpZ2h0ID0gbWluaW1hcExheW91dC5taW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ7XG5cdFx0dGhpcy5jYW52YXNPdXRlcldpZHRoID0gbWluaW1hcExheW91dC5taW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDtcblx0XHR0aGlzLmNhbnZhc091dGVySGVpZ2h0ID0gbWluaW1hcExheW91dC5taW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ7XG5cblx0XHR0aGlzLmlzU2FtcGxpbmcgPSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBJc1NhbXBsaW5nO1xuXHRcdHRoaXMuZWRpdG9ySGVpZ2h0ID0gbGF5b3V0SW5mby5oZWlnaHQ7XG5cdFx0dGhpcy5mb250U2NhbGUgPSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBTY2FsZTtcblx0XHR0aGlzLm1pbmltYXBMaW5lSGVpZ2h0ID0gbWluaW1hcExheW91dC5taW5pbWFwTGluZUhlaWdodDtcblx0XHR0aGlzLm1pbmltYXBDaGFyV2lkdGggPSBDb25zdGFudHMuQkFTRV9DSEFSX1dJRFRIICogdGhpcy5mb250U2NhbGU7XG5cdFx0dGhpcy5zZWN0aW9uSGVhZGVyRm9udEZhbWlseSA9IERFRkFVTFRfRk9OVF9GQU1JTFk7XG5cdFx0dGhpcy5zZWN0aW9uSGVhZGVyRm9udFNpemUgPSBtaW5pbWFwT3B0cy5zZWN0aW9uSGVhZGVyRm9udFNpemUgKiBwaXhlbFJhdGlvO1xuXHRcdHRoaXMuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcgPSBtaW5pbWFwT3B0cy5zZWN0aW9uSGVhZGVyTGV0dGVyU3BhY2luZzsgLy8gaW50ZW50aW9uYWxseSBub3QgbXVsdGlwbHlpbmcgYnkgcGl4ZWxSYXRpb1xuXHRcdHRoaXMuc2VjdGlvbkhlYWRlckZvbnRDb2xvciA9IE1pbmltYXBPcHRpb25zLl9nZXRTZWN0aW9uSGVhZGVyQ29sb3IodGhlbWUsIHRva2Vuc0NvbG9yVHJhY2tlci5nZXRDb2xvcihDb2xvcklkLkRlZmF1bHRGb3JlZ3JvdW5kKSk7XG5cblx0XHR0aGlzLmNoYXJSZW5kZXJlciA9IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbigoKSA9PiBNaW5pbWFwQ2hhclJlbmRlcmVyRmFjdG9yeS5jcmVhdGUodGhpcy5mb250U2NhbGUsIGZvbnRJbmZvLmZvbnRGYW1pbHkpKTtcblx0XHR0aGlzLmRlZmF1bHRCYWNrZ3JvdW5kQ29sb3IgPSB0b2tlbnNDb2xvclRyYWNrZXIuZ2V0Q29sb3IoQ29sb3JJZC5EZWZhdWx0QmFja2dyb3VuZCk7XG5cdFx0dGhpcy5iYWNrZ3JvdW5kQ29sb3IgPSBNaW5pbWFwT3B0aW9ucy5fZ2V0TWluaW1hcEJhY2tncm91bmQodGhlbWUsIHRoaXMuZGVmYXVsdEJhY2tncm91bmRDb2xvcik7XG5cdFx0dGhpcy5mb3JlZ3JvdW5kQWxwaGEgPSBNaW5pbWFwT3B0aW9ucy5fZ2V0TWluaW1hcEZvcmVncm91bmRPcGFjaXR5KHRoZW1lKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRNaW5pbWFwQmFja2dyb3VuZCh0aGVtZTogRWRpdG9yVGhlbWUsIGRlZmF1bHRCYWNrZ3JvdW5kQ29sb3I6IFJHQkE4KTogUkdCQTgge1xuXHRcdGNvbnN0IHRoZW1lQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihtaW5pbWFwQmFja2dyb3VuZCk7XG5cdFx0aWYgKHRoZW1lQ29sb3IpIHtcblx0XHRcdHJldHVybiBuZXcgUkdCQTgodGhlbWVDb2xvci5yZ2JhLnIsIHRoZW1lQ29sb3IucmdiYS5nLCB0aGVtZUNvbG9yLnJnYmEuYiwgTWF0aC5yb3VuZCgyNTUgKiB0aGVtZUNvbG9yLnJnYmEuYSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVmYXVsdEJhY2tncm91bmRDb2xvcjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRNaW5pbWFwRm9yZWdyb3VuZE9wYWNpdHkodGhlbWU6IEVkaXRvclRoZW1lKTogbnVtYmVyIHtcblx0XHRjb25zdCB0aGVtZUNvbG9yID0gdGhlbWUuZ2V0Q29sb3IobWluaW1hcEZvcmVncm91bmRPcGFjaXR5KTtcblx0XHRpZiAodGhlbWVDb2xvcikge1xuXHRcdFx0cmV0dXJuIFJHQkE4Ll9jbGFtcChNYXRoLnJvdW5kKDI1NSAqIHRoZW1lQ29sb3IucmdiYS5hKSk7XG5cdFx0fVxuXHRcdHJldHVybiAyNTU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0U2VjdGlvbkhlYWRlckNvbG9yKHRoZW1lOiBFZGl0b3JUaGVtZSwgZGVmYXVsdEZvcmVncm91bmRDb2xvcjogUkdCQTgpOiBSR0JBOCB7XG5cdFx0Y29uc3QgdGhlbWVDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvckZvcmVncm91bmQpO1xuXHRcdGlmICh0aGVtZUNvbG9yKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJHQkE4KHRoZW1lQ29sb3IucmdiYS5yLCB0aGVtZUNvbG9yLnJnYmEuZywgdGhlbWVDb2xvci5yZ2JhLmIsIE1hdGgucm91bmQoMjU1ICogdGhlbWVDb2xvci5yZ2JhLmEpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRlZmF1bHRGb3JlZ3JvdW5kQ29sb3I7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBNaW5pbWFwT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5yZW5kZXJNaW5pbWFwID09PSBvdGhlci5yZW5kZXJNaW5pbWFwXG5cdFx0XHQmJiB0aGlzLnNpemUgPT09IG90aGVyLnNpemVcblx0XHRcdCYmIHRoaXMubWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0ID09PSBvdGhlci5taW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHRcblx0XHRcdCYmIHRoaXMuc2Nyb2xsQmV5b25kTGFzdExpbmUgPT09IG90aGVyLnNjcm9sbEJleW9uZExhc3RMaW5lXG5cdFx0XHQmJiB0aGlzLnBhZGRpbmdUb3AgPT09IG90aGVyLnBhZGRpbmdUb3Bcblx0XHRcdCYmIHRoaXMucGFkZGluZ0JvdHRvbSA9PT0gb3RoZXIucGFkZGluZ0JvdHRvbVxuXHRcdFx0JiYgdGhpcy5zaG93U2xpZGVyID09PSBvdGhlci5zaG93U2xpZGVyXG5cdFx0XHQmJiB0aGlzLmF1dG9oaWRlID09PSBvdGhlci5hdXRvaGlkZVxuXHRcdFx0JiYgdGhpcy5waXhlbFJhdGlvID09PSBvdGhlci5waXhlbFJhdGlvXG5cdFx0XHQmJiB0aGlzLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA9PT0gb3RoZXIudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoXG5cdFx0XHQmJiB0aGlzLmxpbmVIZWlnaHQgPT09IG90aGVyLmxpbmVIZWlnaHRcblx0XHRcdCYmIHRoaXMubWluaW1hcExlZnQgPT09IG90aGVyLm1pbmltYXBMZWZ0XG5cdFx0XHQmJiB0aGlzLm1pbmltYXBXaWR0aCA9PT0gb3RoZXIubWluaW1hcFdpZHRoXG5cdFx0XHQmJiB0aGlzLm1pbmltYXBIZWlnaHQgPT09IG90aGVyLm1pbmltYXBIZWlnaHRcblx0XHRcdCYmIHRoaXMuY2FudmFzSW5uZXJXaWR0aCA9PT0gb3RoZXIuY2FudmFzSW5uZXJXaWR0aFxuXHRcdFx0JiYgdGhpcy5jYW52YXNJbm5lckhlaWdodCA9PT0gb3RoZXIuY2FudmFzSW5uZXJIZWlnaHRcblx0XHRcdCYmIHRoaXMuY2FudmFzT3V0ZXJXaWR0aCA9PT0gb3RoZXIuY2FudmFzT3V0ZXJXaWR0aFxuXHRcdFx0JiYgdGhpcy5jYW52YXNPdXRlckhlaWdodCA9PT0gb3RoZXIuY2FudmFzT3V0ZXJIZWlnaHRcblx0XHRcdCYmIHRoaXMuaXNTYW1wbGluZyA9PT0gb3RoZXIuaXNTYW1wbGluZ1xuXHRcdFx0JiYgdGhpcy5lZGl0b3JIZWlnaHQgPT09IG90aGVyLmVkaXRvckhlaWdodFxuXHRcdFx0JiYgdGhpcy5mb250U2NhbGUgPT09IG90aGVyLmZvbnRTY2FsZVxuXHRcdFx0JiYgdGhpcy5taW5pbWFwTGluZUhlaWdodCA9PT0gb3RoZXIubWluaW1hcExpbmVIZWlnaHRcblx0XHRcdCYmIHRoaXMubWluaW1hcENoYXJXaWR0aCA9PT0gb3RoZXIubWluaW1hcENoYXJXaWR0aFxuXHRcdFx0JiYgdGhpcy5zZWN0aW9uSGVhZGVyRm9udFNpemUgPT09IG90aGVyLnNlY3Rpb25IZWFkZXJGb250U2l6ZVxuXHRcdFx0JiYgdGhpcy5zZWN0aW9uSGVhZGVyTGV0dGVyU3BhY2luZyA9PT0gb3RoZXIuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmdcblx0XHRcdCYmIHRoaXMuZGVmYXVsdEJhY2tncm91bmRDb2xvciAmJiB0aGlzLmRlZmF1bHRCYWNrZ3JvdW5kQ29sb3IuZXF1YWxzKG90aGVyLmRlZmF1bHRCYWNrZ3JvdW5kQ29sb3IpXG5cdFx0XHQmJiB0aGlzLmJhY2tncm91bmRDb2xvciAmJiB0aGlzLmJhY2tncm91bmRDb2xvci5lcXVhbHMob3RoZXIuYmFja2dyb3VuZENvbG9yKVxuXHRcdFx0JiYgdGhpcy5mb3JlZ3JvdW5kQWxwaGEgPT09IG90aGVyLmZvcmVncm91bmRBbHBoYVxuXHRcdCk7XG5cdH1cbn1cblxuY2xhc3MgTWluaW1hcExheW91dCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0LyoqXG5cdFx0ICogVGhlIGdpdmVuIGVkaXRvciBzY3JvbGxUb3AgKGlucHV0KS5cblx0XHQgKi9cblx0XHRwdWJsaWMgcmVhZG9ubHkgc2Nyb2xsVG9wOiBudW1iZXIsXG5cdFx0LyoqXG5cdFx0ICogVGhlIGdpdmVuIGVkaXRvciBzY3JvbGxIZWlnaHQgKGlucHV0KS5cblx0XHQgKi9cblx0XHRwdWJsaWMgcmVhZG9ubHkgc2Nyb2xsSGVpZ2h0OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNsaWRlck5lZWRlZDogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21wdXRlZFNsaWRlclJhdGlvOiBudW1iZXIsXG5cdFx0LyoqXG5cdFx0ICogc2xpZGVyIGRvbSBub2RlIHRvcCAoaW4gQ1NTIHB4KVxuXHRcdCAqL1xuXHRcdHB1YmxpYyByZWFkb25seSBzbGlkZXJUb3A6IG51bWJlcixcblx0XHQvKipcblx0XHQgKiBzbGlkZXIgZG9tIG5vZGUgaGVpZ2h0IChpbiBDU1MgcHgpXG5cdFx0ICovXG5cdFx0cHVibGljIHJlYWRvbmx5IHNsaWRlckhlaWdodDogbnVtYmVyLFxuXHRcdC8qKlxuXHRcdCAqIGVtcHR5IGxpbmVzIHRvIHJlc2VydmUgYXQgdGhlIHRvcCBvZiB0aGUgbWluaW1hcC5cblx0XHQgKi9cblx0XHRwdWJsaWMgcmVhZG9ubHkgdG9wUGFkZGluZ0xpbmVDb3VudDogbnVtYmVyLFxuXHRcdC8qKlxuXHRcdCAqIG1pbmltYXAgcmVuZGVyIHN0YXJ0IGxpbmUgbnVtYmVyLlxuXHRcdCAqL1xuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHQvKipcblx0XHQgKiBtaW5pbWFwIHJlbmRlciBlbmQgbGluZSBudW1iZXIuXG5cdFx0ICovXG5cdFx0cHVibGljIHJlYWRvbmx5IGVuZExpbmVOdW1iZXI6IG51bWJlclxuXHQpIHsgfVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIGEgZGVzaXJlZCBgc2Nyb2xsUG9zaXRpb25gIHN1Y2ggdGhhdCB0aGUgc2xpZGVyIG1vdmVzIGJ5IGBkZWx0YWAuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0RGVzaXJlZFNjcm9sbFRvcEZyb21EZWx0YShkZWx0YTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5yb3VuZCh0aGlzLnNjcm9sbFRvcCArIGRlbHRhIC8gdGhpcy5fY29tcHV0ZWRTbGlkZXJSYXRpbyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVzaXJlZFNjcm9sbFRvcEZyb21Ub3VjaExvY2F0aW9uKHBhZ2VZOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLnJvdW5kKChwYWdlWSAtIHRoaXMuc2xpZGVySGVpZ2h0IC8gMikgLyB0aGlzLl9jb21wdXRlZFNsaWRlclJhdGlvKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnRlcnNlY3QgYSBsaW5lIHJhbmdlIHdpdGggYHRoaXMuc3RhcnRMaW5lTnVtYmVyYCBhbmQgYHRoaXMuZW5kTGluZU51bWJlcmAuXG5cdCAqL1xuXHRwdWJsaWMgaW50ZXJzZWN0V2l0aFZpZXdwb3J0KHJhbmdlOiBSYW5nZSk6IFtudW1iZXIsIG51bWJlcl0gfCBudWxsIHtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBNYXRoLm1heCh0aGlzLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gTWF0aC5taW4odGhpcy5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyID4gZW5kTGluZU51bWJlcikge1xuXHRcdFx0Ly8gZW50aXJlbHkgb3V0c2lkZSBtaW5pbWFwJ3Mgdmlld3BvcnRcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gW3N0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcl07XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBpbm5lciBtaW5pbWFwIHkgY29vcmRpbmF0ZSBmb3IgYSBsaW5lIG51bWJlci5cblx0ICovXG5cdHB1YmxpYyBnZXRZRm9yTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIsIG1pbmltYXBMaW5lSGVpZ2h0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiArIChsaW5lTnVtYmVyIC0gdGhpcy5zdGFydExpbmVOdW1iZXIgKyB0aGlzLnRvcFBhZGRpbmdMaW5lQ291bnQpICogbWluaW1hcExpbmVIZWlnaHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShcblx0XHRvcHRpb25zOiBNaW5pbWFwT3B0aW9ucyxcblx0XHR2aWV3cG9ydFN0YXJ0TGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHZpZXdwb3J0RW5kTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQ6IG51bWJlcixcblx0XHR2aWV3cG9ydEhlaWdodDogbnVtYmVyLFxuXHRcdHZpZXdwb3J0Q29udGFpbnNXaGl0ZXNwYWNlR2FwczogYm9vbGVhbixcblx0XHRsaW5lQ291bnQ6IG51bWJlcixcblx0XHRyZWFsTGluZUNvdW50OiBudW1iZXIsXG5cdFx0c2Nyb2xsVG9wOiBudW1iZXIsXG5cdFx0c2Nyb2xsSGVpZ2h0OiBudW1iZXIsXG5cdFx0cHJldmlvdXNMYXlvdXQ6IE1pbmltYXBMYXlvdXQgfCBudWxsXG5cdCk6IE1pbmltYXBMYXlvdXQge1xuXHRcdGNvbnN0IHBpeGVsUmF0aW8gPSBvcHRpb25zLnBpeGVsUmF0aW87XG5cdFx0Y29uc3QgbWluaW1hcExpbmVIZWlnaHQgPSBvcHRpb25zLm1pbmltYXBMaW5lSGVpZ2h0O1xuXHRcdGNvbnN0IG1pbmltYXBMaW5lc0ZpdHRpbmcgPSBNYXRoLmZsb29yKG9wdGlvbnMuY2FudmFzSW5uZXJIZWlnaHQgLyBtaW5pbWFwTGluZUhlaWdodCk7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IG9wdGlvbnMubGluZUhlaWdodDtcblxuXHRcdGlmIChvcHRpb25zLm1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodCkge1xuXHRcdFx0bGV0IGxvZ2ljYWxTY3JvbGxIZWlnaHQgPSAoXG5cdFx0XHRcdHJlYWxMaW5lQ291bnQgKiBvcHRpb25zLmxpbmVIZWlnaHRcblx0XHRcdFx0KyBvcHRpb25zLnBhZGRpbmdUb3Bcblx0XHRcdFx0KyBvcHRpb25zLnBhZGRpbmdCb3R0b21cblx0XHRcdCk7XG5cdFx0XHRpZiAob3B0aW9ucy5zY3JvbGxCZXlvbmRMYXN0TGluZSkge1xuXHRcdFx0XHRsb2dpY2FsU2Nyb2xsSGVpZ2h0ICs9IE1hdGgubWF4KDAsIHZpZXdwb3J0SGVpZ2h0IC0gb3B0aW9ucy5saW5lSGVpZ2h0IC0gb3B0aW9ucy5wYWRkaW5nQm90dG9tKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNsaWRlckhlaWdodCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3Iodmlld3BvcnRIZWlnaHQgKiB2aWV3cG9ydEhlaWdodCAvIGxvZ2ljYWxTY3JvbGxIZWlnaHQpKTtcblx0XHRcdGNvbnN0IG1heE1pbmltYXBTbGlkZXJUb3AgPSBNYXRoLm1heCgwLCBvcHRpb25zLm1pbmltYXBIZWlnaHQgLSBzbGlkZXJIZWlnaHQpO1xuXHRcdFx0Ly8gVGhlIHNsaWRlciBjYW4gbW92ZSBmcm9tIDAgdG8gYG1heE1pbmltYXBTbGlkZXJUb3BgXG5cdFx0XHQvLyBpbiB0aGUgc2FtZSB3YXkgYHNjcm9sbFRvcGAgY2FuIG1vdmUgZnJvbSAwIHRvIGBzY3JvbGxIZWlnaHRgIC0gYHZpZXdwb3J0SGVpZ2h0YC5cblx0XHRcdGNvbnN0IGNvbXB1dGVkU2xpZGVyUmF0aW8gPSAobWF4TWluaW1hcFNsaWRlclRvcCkgLyAoc2Nyb2xsSGVpZ2h0IC0gdmlld3BvcnRIZWlnaHQpO1xuXHRcdFx0Y29uc3Qgc2xpZGVyVG9wID0gKHNjcm9sbFRvcCAqIGNvbXB1dGVkU2xpZGVyUmF0aW8pO1xuXHRcdFx0Y29uc3Qgc2xpZGVyTmVlZGVkID0gKG1heE1pbmltYXBTbGlkZXJUb3AgPiAwKTtcblx0XHRcdGNvbnN0IG1heExpbmVzRml0dGluZyA9IE1hdGguZmxvb3Iob3B0aW9ucy5jYW52YXNJbm5lckhlaWdodCAvIG9wdGlvbnMubWluaW1hcExpbmVIZWlnaHQpO1xuXHRcdFx0Y29uc3QgdG9wUGFkZGluZ0xpbmVDb3VudCA9IE1hdGguZmxvb3Iob3B0aW9ucy5wYWRkaW5nVG9wIC8gb3B0aW9ucy5saW5lSGVpZ2h0KTtcblx0XHRcdHJldHVybiBuZXcgTWluaW1hcExheW91dChzY3JvbGxUb3AsIHNjcm9sbEhlaWdodCwgc2xpZGVyTmVlZGVkLCBjb21wdXRlZFNsaWRlclJhdGlvLCBzbGlkZXJUb3AsIHNsaWRlckhlaWdodCwgdG9wUGFkZGluZ0xpbmVDb3VudCwgMSwgTWF0aC5taW4obGluZUNvdW50LCBtYXhMaW5lc0ZpdHRpbmcpKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgdmlzaWJsZSBsaW5lIGNvdW50IGluIGEgdmlld3BvcnQgY2FuIGNoYW5nZSBkdWUgdG8gYSBudW1iZXIgb2YgcmVhc29uczpcblx0XHQvLyAgYSkgd2l0aCB0aGUgc2FtZSB2aWV3cG9ydCB3aWR0aCwgZGlmZmVyZW50IHNjcm9sbCBwb3NpdGlvbnMgY2FuIHJlc3VsdCBpbiBwYXJ0aWFsIGxpbmVzIGJlaW5nIHZpc2libGU6XG5cdFx0Ly8gICAgZS5nLiBmb3IgYSBsaW5lIGhlaWdodCBvZiAyMCwgYW5kIGEgdmlld3BvcnQgaGVpZ2h0IG9mIDYwMFxuXHRcdC8vICAgICAgICAgICogc2Nyb2xsVG9wID0gMCAgPT4gdmlzaWJsZSBsaW5lcyBhcmUgWzEsIDMwXVxuXHRcdC8vICAgICAgICAgICogc2Nyb2xsVG9wID0gMTAgPT4gdmlzaWJsZSBsaW5lcyBhcmUgWzEsIDMxXSAod2l0aCBsaW5lcyAxIGFuZCAzMSBwYXJ0aWFsbHkgdmlzaWJsZSlcblx0XHQvLyAgICAgICAgICAqIHNjcm9sbFRvcCA9IDIwID0+IHZpc2libGUgbGluZXMgYXJlIFsyLCAzMV1cblx0XHQvLyAgYikgd2hpdGVzcGFjZSBnYXBzIG1pZ2h0IG1ha2UgdGhlaXIgd2F5IGluIHRoZSB2aWV3cG9ydCAod2hpY2ggcmVzdWx0cyBpbiBhIGRlY3JlYXNlIGluIHRoZSB2aXNpYmxlIGxpbmUgY291bnQpXG5cdFx0Ly8gIGMpIHdlIGNvdWxkIGJlIGluIHRoZSBzY3JvbGwgYmV5b25kIGxhc3QgbGluZSBjYXNlICh3aGljaCBhbHNvIHJlc3VsdHMgaW4gYSBkZWNyZWFzZSBpbiB0aGUgdmlzaWJsZSBsaW5lIGNvdW50LCBkb3duIHRvIHBvc3NpYmx5IG9ubHkgb25lIGxpbmUgYmVpbmcgdmlzaWJsZSlcblxuXHRcdC8vIFdlIG11c3QgZmlyc3QgZXN0YWJsaXNoIGEgZGVzaXJhYmxlIHNsaWRlciBoZWlnaHQuXG5cdFx0bGV0IHNsaWRlckhlaWdodDogbnVtYmVyO1xuXHRcdGlmICh2aWV3cG9ydENvbnRhaW5zV2hpdGVzcGFjZUdhcHMgJiYgdmlld3BvcnRFbmRMaW5lTnVtYmVyICE9PSBsaW5lQ291bnQpIHtcblx0XHRcdC8vIGNhc2UgYikgZnJvbSBhYm92ZTogdGhlcmUgYXJlIHdoaXRlc3BhY2UgZ2FwcyBpbiB0aGUgdmlld3BvcnQuXG5cdFx0XHQvLyBJbiB0aGlzIGNhc2UsIHRoZSBoZWlnaHQgb2YgdGhlIHNsaWRlciBkaXJlY3RseSByZWZsZWN0cyB0aGUgdmlzaWJsZSBsaW5lIGNvdW50LlxuXHRcdFx0Y29uc3Qgdmlld3BvcnRMaW5lQ291bnQgPSB2aWV3cG9ydEVuZExpbmVOdW1iZXIgLSB2aWV3cG9ydFN0YXJ0TGluZU51bWJlciArIDE7XG5cdFx0XHRzbGlkZXJIZWlnaHQgPSBNYXRoLmZsb29yKHZpZXdwb3J0TGluZUNvdW50ICogbWluaW1hcExpbmVIZWlnaHQgLyBwaXhlbFJhdGlvKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVGhlIHNsaWRlciBoYXMgYSBzdGFibGUgaGVpZ2h0XG5cdFx0XHRjb25zdCBleHBlY3RlZFZpZXdwb3J0TGluZUNvdW50ID0gdmlld3BvcnRIZWlnaHQgLyBsaW5lSGVpZ2h0O1xuXHRcdFx0c2xpZGVySGVpZ2h0ID0gTWF0aC5mbG9vcihleHBlY3RlZFZpZXdwb3J0TGluZUNvdW50ICogbWluaW1hcExpbmVIZWlnaHQgLyBwaXhlbFJhdGlvKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRyYUxpbmVzQXRUaGVUb3AgPSBNYXRoLmZsb29yKG9wdGlvbnMucGFkZGluZ1RvcCAvIGxpbmVIZWlnaHQpO1xuXHRcdGxldCBleHRyYUxpbmVzQXRUaGVCb3R0b20gPSBNYXRoLmZsb29yKG9wdGlvbnMucGFkZGluZ0JvdHRvbSAvIGxpbmVIZWlnaHQpO1xuXHRcdGlmIChvcHRpb25zLnNjcm9sbEJleW9uZExhc3RMaW5lKSB7XG5cdFx0XHRjb25zdCBleHBlY3RlZFZpZXdwb3J0TGluZUNvdW50ID0gdmlld3BvcnRIZWlnaHQgLyBsaW5lSGVpZ2h0O1xuXHRcdFx0ZXh0cmFMaW5lc0F0VGhlQm90dG9tID0gTWF0aC5tYXgoZXh0cmFMaW5lc0F0VGhlQm90dG9tLCBleHBlY3RlZFZpZXdwb3J0TGluZUNvdW50IC0gMSk7XG5cdFx0fVxuXG5cdFx0bGV0IG1heE1pbmltYXBTbGlkZXJUb3A6IG51bWJlcjtcblx0XHRpZiAoZXh0cmFMaW5lc0F0VGhlQm90dG9tID4gMCkge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRWaWV3cG9ydExpbmVDb3VudCA9IHZpZXdwb3J0SGVpZ2h0IC8gbGluZUhlaWdodDtcblx0XHRcdC8vIFRoZSBtaW5pbWFwIHNsaWRlciwgd2hlbiBkcmFnZ2VkIGFsbCB0aGUgd2F5IGRvd24sIHdpbGwgY29udGFpbiB0aGUgbGFzdCBsaW5lIGF0IGl0cyB0b3Bcblx0XHRcdG1heE1pbmltYXBTbGlkZXJUb3AgPSAoZXh0cmFMaW5lc0F0VGhlVG9wICsgbGluZUNvdW50ICsgZXh0cmFMaW5lc0F0VGhlQm90dG9tIC0gZXhwZWN0ZWRWaWV3cG9ydExpbmVDb3VudCAtIDEpICogbWluaW1hcExpbmVIZWlnaHQgLyBwaXhlbFJhdGlvO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBUaGUgbWluaW1hcCBzbGlkZXIsIHdoZW4gZHJhZ2dlZCBhbGwgdGhlIHdheSBkb3duLCB3aWxsIGNvbnRhaW4gdGhlIGxhc3QgbGluZSBhdCBpdHMgYm90dG9tXG5cdFx0XHRtYXhNaW5pbWFwU2xpZGVyVG9wID0gTWF0aC5tYXgoMCwgKGV4dHJhTGluZXNBdFRoZVRvcCArIGxpbmVDb3VudCkgKiBtaW5pbWFwTGluZUhlaWdodCAvIHBpeGVsUmF0aW8gLSBzbGlkZXJIZWlnaHQpO1xuXHRcdH1cblx0XHRtYXhNaW5pbWFwU2xpZGVyVG9wID0gTWF0aC5taW4ob3B0aW9ucy5taW5pbWFwSGVpZ2h0IC0gc2xpZGVySGVpZ2h0LCBtYXhNaW5pbWFwU2xpZGVyVG9wKTtcblxuXHRcdC8vIFRoZSBzbGlkZXIgY2FuIG1vdmUgZnJvbSAwIHRvIGBtYXhNaW5pbWFwU2xpZGVyVG9wYFxuXHRcdC8vIGluIHRoZSBzYW1lIHdheSBgc2Nyb2xsVG9wYCBjYW4gbW92ZSBmcm9tIDAgdG8gYHNjcm9sbEhlaWdodGAgLSBgdmlld3BvcnRIZWlnaHRgLlxuXHRcdGNvbnN0IGNvbXB1dGVkU2xpZGVyUmF0aW8gPSAobWF4TWluaW1hcFNsaWRlclRvcCkgLyAoc2Nyb2xsSGVpZ2h0IC0gdmlld3BvcnRIZWlnaHQpO1xuXHRcdGNvbnN0IHNsaWRlclRvcCA9IChzY3JvbGxUb3AgKiBjb21wdXRlZFNsaWRlclJhdGlvKTtcblxuXHRcdGlmIChtaW5pbWFwTGluZXNGaXR0aW5nID49IGV4dHJhTGluZXNBdFRoZVRvcCArIGxpbmVDb3VudCArIGV4dHJhTGluZXNBdFRoZUJvdHRvbSkge1xuXHRcdFx0Ly8gQWxsIGxpbmVzIGZpdCBpbiB0aGUgbWluaW1hcFxuXHRcdFx0Y29uc3Qgc2xpZGVyTmVlZGVkID0gKG1heE1pbmltYXBTbGlkZXJUb3AgPiAwKTtcblx0XHRcdHJldHVybiBuZXcgTWluaW1hcExheW91dChzY3JvbGxUb3AsIHNjcm9sbEhlaWdodCwgc2xpZGVyTmVlZGVkLCBjb21wdXRlZFNsaWRlclJhdGlvLCBzbGlkZXJUb3AsIHNsaWRlckhlaWdodCwgZXh0cmFMaW5lc0F0VGhlVG9wLCAxLCBsaW5lQ291bnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgY29uc2lkZXJpbmdTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRcdGlmICh2aWV3cG9ydFN0YXJ0TGluZU51bWJlciA+IDEpIHtcblx0XHRcdFx0Y29uc2lkZXJpbmdTdGFydExpbmVOdW1iZXIgPSB2aWV3cG9ydFN0YXJ0TGluZU51bWJlciArIGV4dHJhTGluZXNBdFRoZVRvcDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnNpZGVyaW5nU3RhcnRMaW5lTnVtYmVyID0gTWF0aC5tYXgoMSwgc2Nyb2xsVG9wIC8gbGluZUhlaWdodCk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCB0b3BQYWRkaW5nTGluZUNvdW50OiBudW1iZXI7XG5cdFx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihjb25zaWRlcmluZ1N0YXJ0TGluZU51bWJlciAtIHNsaWRlclRvcCAqIHBpeGVsUmF0aW8gLyBtaW5pbWFwTGluZUhlaWdodCkpO1xuXHRcdFx0aWYgKHN0YXJ0TGluZU51bWJlciA8IGV4dHJhTGluZXNBdFRoZVRvcCkge1xuXHRcdFx0XHR0b3BQYWRkaW5nTGluZUNvdW50ID0gZXh0cmFMaW5lc0F0VGhlVG9wIC0gc3RhcnRMaW5lTnVtYmVyICsgMTtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRvcFBhZGRpbmdMaW5lQ291bnQgPSAwO1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSBNYXRoLm1heCgxLCBzdGFydExpbmVOdW1iZXIgLSBleHRyYUxpbmVzQXRUaGVUb3ApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdm9pZCBmbGlja2VyaW5nIGNhdXNlZCBieSBhIHBhcnRpYWwgdmlld3BvcnQgc3RhcnQgbGluZVxuXHRcdFx0Ly8gYnkgYmVpbmcgY29uc2lzdGVudCB3LnIudC4gdGhlIHByZXZpb3VzIGxheW91dCBkZWNpc2lvblxuXHRcdFx0aWYgKHByZXZpb3VzTGF5b3V0ICYmIHByZXZpb3VzTGF5b3V0LnNjcm9sbEhlaWdodCA9PT0gc2Nyb2xsSGVpZ2h0KSB7XG5cdFx0XHRcdGlmIChwcmV2aW91c0xheW91dC5zY3JvbGxUb3AgPiBzY3JvbGxUb3ApIHtcblx0XHRcdFx0XHQvLyBTY3JvbGxpbmcgdXAgPT4gbmV2ZXIgaW5jcmVhc2UgYHN0YXJ0TGluZU51bWJlcmBcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSBNYXRoLm1pbihzdGFydExpbmVOdW1iZXIsIHByZXZpb3VzTGF5b3V0LnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdFx0dG9wUGFkZGluZ0xpbmVDb3VudCA9IE1hdGgubWF4KHRvcFBhZGRpbmdMaW5lQ291bnQsIHByZXZpb3VzTGF5b3V0LnRvcFBhZGRpbmdMaW5lQ291bnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcmV2aW91c0xheW91dC5zY3JvbGxUb3AgPCBzY3JvbGxUb3ApIHtcblx0XHRcdFx0XHQvLyBTY3JvbGxpbmcgZG93biA9PiBuZXZlciBkZWNyZWFzZSBgc3RhcnRMaW5lTnVtYmVyYFxuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlciA9IE1hdGgubWF4KHN0YXJ0TGluZU51bWJlciwgcHJldmlvdXNMYXlvdXQuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR0b3BQYWRkaW5nTGluZUNvdW50ID0gTWF0aC5taW4odG9wUGFkZGluZ0xpbmVDb3VudCwgcHJldmlvdXNMYXlvdXQudG9wUGFkZGluZ0xpbmVDb3VudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IE1hdGgubWluKGxpbmVDb3VudCwgc3RhcnRMaW5lTnVtYmVyIC0gdG9wUGFkZGluZ0xpbmVDb3VudCArIG1pbmltYXBMaW5lc0ZpdHRpbmcgLSAxKTtcblx0XHRcdGNvbnN0IHBhcnRpYWxMaW5lID0gKHNjcm9sbFRvcCAtIHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQpIC8gbGluZUhlaWdodDtcblxuXHRcdFx0bGV0IHNsaWRlclRvcEFsaWduZWQ6IG51bWJlcjtcblx0XHRcdGlmIChzY3JvbGxUb3AgPj0gb3B0aW9ucy5wYWRkaW5nVG9wKSB7XG5cdFx0XHRcdHNsaWRlclRvcEFsaWduZWQgPSAodmlld3BvcnRTdGFydExpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXIgKyB0b3BQYWRkaW5nTGluZUNvdW50ICsgcGFydGlhbExpbmUpICogbWluaW1hcExpbmVIZWlnaHQgLyBwaXhlbFJhdGlvO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2xpZGVyVG9wQWxpZ25lZCA9IChzY3JvbGxUb3AgLyBvcHRpb25zLnBhZGRpbmdUb3ApICogKHRvcFBhZGRpbmdMaW5lQ291bnQgKyBwYXJ0aWFsTGluZSkgKiBtaW5pbWFwTGluZUhlaWdodCAvIHBpeGVsUmF0aW87XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBuZXcgTWluaW1hcExheW91dChzY3JvbGxUb3AsIHNjcm9sbEhlaWdodCwgdHJ1ZSwgY29tcHV0ZWRTbGlkZXJSYXRpbywgc2xpZGVyVG9wQWxpZ25lZCwgc2xpZGVySGVpZ2h0LCB0b3BQYWRkaW5nTGluZUNvdW50LCBzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBNaW5pbWFwTGluZSBpbXBsZW1lbnRzIElMaW5lIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElOVkFMSUQgPSBuZXcgTWluaW1hcExpbmUoLTEpO1xuXG5cdGR5OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoZHk6IG51bWJlcikge1xuXHRcdHRoaXMuZHkgPSBkeTtcblx0fVxuXG5cdHB1YmxpYyBvbkNvbnRlbnRDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuZHkgPSAtMTtcblx0fVxuXG5cdHB1YmxpYyBvblRva2Vuc0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5keSA9IC0xO1xuXHR9XG59XG5cbmNsYXNzIFJlbmRlckRhdGEge1xuXHQvKipcblx0ICogbGFzdCByZW5kZXJlZCBsYXlvdXQuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyZWRMYXlvdXQ6IE1pbmltYXBMYXlvdXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ltYWdlRGF0YTogSW1hZ2VEYXRhO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJlZExpbmVzOiBSZW5kZXJlZExpbmVzQ29sbGVjdGlvbjxNaW5pbWFwTGluZT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVuZGVyZWRMYXlvdXQ6IE1pbmltYXBMYXlvdXQsXG5cdFx0aW1hZ2VEYXRhOiBJbWFnZURhdGEsXG5cdFx0bGluZXM6IE1pbmltYXBMaW5lW11cblx0KSB7XG5cdFx0dGhpcy5yZW5kZXJlZExheW91dCA9IHJlbmRlcmVkTGF5b3V0O1xuXHRcdHRoaXMuX2ltYWdlRGF0YSA9IGltYWdlRGF0YTtcblx0XHR0aGlzLl9yZW5kZXJlZExpbmVzID0gbmV3IFJlbmRlcmVkTGluZXNDb2xsZWN0aW9uKHtcblx0XHRcdGNyZWF0ZUxpbmU6ICgpID0+IE1pbmltYXBMaW5lLklOVkFMSURcblx0XHR9KTtcblx0XHR0aGlzLl9yZW5kZXJlZExpbmVzLl9zZXQocmVuZGVyZWRMYXlvdXQuc3RhcnRMaW5lTnVtYmVyLCBsaW5lcyk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2sgaWYgdGhlIGN1cnJlbnQgUmVuZGVyRGF0YSBtYXRjaGVzIGFjY3VyYXRlbHkgdGhlIG5ldyBkZXNpcmVkIGxheW91dCBhbmQgbm8gcGFpbnRpbmcgaXMgbmVlZGVkLlxuXHQgKi9cblx0cHVibGljIGxpbmVzRXF1YWxzKGxheW91dDogTWluaW1hcExheW91dCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5zY3JvbGxFcXVhbHMobGF5b3V0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRtcCA9IHRoaXMuX3JlbmRlcmVkTGluZXMuX2dldCgpO1xuXHRcdGNvbnN0IGxpbmVzID0gdG1wLmxpbmVzO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKGxpbmVzW2ldLmR5ID09PSAtMSkge1xuXHRcdFx0XHQvLyBUaGlzIGxpbmUgaXMgaW52YWxpZFxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2sgaWYgdGhlIGN1cnJlbnQgUmVuZGVyRGF0YSBtYXRjaGVzIHRoZSBuZXcgbGF5b3V0J3Mgc2Nyb2xsIHBvc2l0aW9uXG5cdCAqL1xuXHRwdWJsaWMgc2Nyb2xsRXF1YWxzKGxheW91dDogTWluaW1hcExheW91dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlbmRlcmVkTGF5b3V0LnN0YXJ0TGluZU51bWJlciA9PT0gbGF5b3V0LnN0YXJ0TGluZU51bWJlclxuXHRcdFx0JiYgdGhpcy5yZW5kZXJlZExheW91dC5lbmRMaW5lTnVtYmVyID09PSBsYXlvdXQuZW5kTGluZU51bWJlcjtcblx0fVxuXG5cdF9nZXQoKTogeyBpbWFnZURhdGE6IEltYWdlRGF0YTsgcmVuZExpbmVOdW1iZXJTdGFydDogbnVtYmVyOyBsaW5lczogTWluaW1hcExpbmVbXSB9IHtcblx0XHRjb25zdCB0bXAgPSB0aGlzLl9yZW5kZXJlZExpbmVzLl9nZXQoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW1hZ2VEYXRhOiB0aGlzLl9pbWFnZURhdGEsXG5cdFx0XHRyZW5kTGluZU51bWJlclN0YXJ0OiB0bXAucmVuZExpbmVOdW1iZXJTdGFydCxcblx0XHRcdGxpbmVzOiB0bXAubGluZXNcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIG9uTGluZXNDaGFuZ2VkKGNoYW5nZUZyb21MaW5lTnVtYmVyOiBudW1iZXIsIGNoYW5nZUNvdW50OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRMaW5lcy5vbkxpbmVzQ2hhbmdlZChjaGFuZ2VGcm9tTGluZU51bWJlciwgY2hhbmdlQ291bnQpO1xuXHR9XG5cdHB1YmxpYyBvbkxpbmVzRGVsZXRlZChkZWxldGVGcm9tTGluZU51bWJlcjogbnVtYmVyLCBkZWxldGVUb0xpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkTGluZXMub25MaW5lc0RlbGV0ZWQoZGVsZXRlRnJvbUxpbmVOdW1iZXIsIGRlbGV0ZVRvTGluZU51bWJlcik7XG5cdH1cblx0cHVibGljIG9uTGluZXNJbnNlcnRlZChpbnNlcnRGcm9tTGluZU51bWJlcjogbnVtYmVyLCBpbnNlcnRUb0xpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkTGluZXMub25MaW5lc0luc2VydGVkKGluc2VydEZyb21MaW5lTnVtYmVyLCBpbnNlcnRUb0xpbmVOdW1iZXIpO1xuXHR9XG5cdHB1YmxpYyBvblRva2Vuc0NoYW5nZWQocmFuZ2VzOiB7IGZyb21MaW5lTnVtYmVyOiBudW1iZXI7IHRvTGluZU51bWJlcjogbnVtYmVyIH1bXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZExpbmVzLm9uVG9rZW5zQ2hhbmdlZChyYW5nZXMpO1xuXHR9XG59XG5cbi8qKlxuICogU29tZSBzb3J0IG9mIGRvdWJsZSBidWZmZXJpbmcuXG4gKlxuICogS2VlcHMgdHdvIGJ1ZmZlcnMgYXJvdW5kIHRoYXQgd2lsbCBiZSByb3RhdGVkIGZvciBwYWludGluZy5cbiAqIEFsd2F5cyBnaXZlcyBhIGJ1ZmZlciB0aGF0IGlzIGZpbGxlZCB3aXRoIHRoZSBiYWNrZ3JvdW5kIGNvbG9yLlxuICovXG5jbGFzcyBNaW5pbWFwQnVmZmVycyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYmFja2dyb3VuZEZpbGxEYXRhOiBVaW50OENsYW1wZWRBcnJheTtcblx0cHJpdmF0ZSByZWFkb25seSBfYnVmZmVyczogW0ltYWdlRGF0YSwgSW1hZ2VEYXRhXTtcblx0cHJpdmF0ZSBfbGFzdFVzZWRCdWZmZXI6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgV0lEVEg6IG51bWJlciwgSEVJR0hUOiBudW1iZXIsIGJhY2tncm91bmQ6IFJHQkE4KSB7XG5cdFx0dGhpcy5fYmFja2dyb3VuZEZpbGxEYXRhID0gTWluaW1hcEJ1ZmZlcnMuX2NyZWF0ZUJhY2tncm91bmRGaWxsRGF0YShXSURUSCwgSEVJR0hULCBiYWNrZ3JvdW5kKTtcblx0XHR0aGlzLl9idWZmZXJzID0gW1xuXHRcdFx0Y3R4LmNyZWF0ZUltYWdlRGF0YShXSURUSCwgSEVJR0hUKSxcblx0XHRcdGN0eC5jcmVhdGVJbWFnZURhdGEoV0lEVEgsIEhFSUdIVClcblx0XHRdO1xuXHRcdHRoaXMuX2xhc3RVc2VkQnVmZmVyID0gMDtcblx0fVxuXG5cdHB1YmxpYyBnZXRCdWZmZXIoKTogSW1hZ2VEYXRhIHtcblx0XHQvLyByb3RhdGUgYnVmZmVyc1xuXHRcdHRoaXMuX2xhc3RVc2VkQnVmZmVyID0gMSAtIHRoaXMuX2xhc3RVc2VkQnVmZmVyO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2J1ZmZlcnNbdGhpcy5fbGFzdFVzZWRCdWZmZXJdO1xuXG5cdFx0Ly8gZmlsbCB3aXRoIGJhY2tncm91bmQgY29sb3Jcblx0XHRyZXN1bHQuZGF0YS5zZXQodGhpcy5fYmFja2dyb3VuZEZpbGxEYXRhKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlQmFja2dyb3VuZEZpbGxEYXRhKFdJRFRIOiBudW1iZXIsIEhFSUdIVDogbnVtYmVyLCBiYWNrZ3JvdW5kOiBSR0JBOCk6IFVpbnQ4Q2xhbXBlZEFycmF5IHtcblx0XHRjb25zdCBiYWNrZ3JvdW5kUiA9IGJhY2tncm91bmQucjtcblx0XHRjb25zdCBiYWNrZ3JvdW5kRyA9IGJhY2tncm91bmQuZztcblx0XHRjb25zdCBiYWNrZ3JvdW5kQiA9IGJhY2tncm91bmQuYjtcblx0XHRjb25zdCBiYWNrZ3JvdW5kQSA9IGJhY2tncm91bmQuYTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50OENsYW1wZWRBcnJheShXSURUSCAqIEhFSUdIVCAqIDQpO1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgSEVJR0hUOyBpKyspIHtcblx0XHRcdGZvciAobGV0IGogPSAwOyBqIDwgV0lEVEg7IGorKykge1xuXHRcdFx0XHRyZXN1bHRbb2Zmc2V0XSA9IGJhY2tncm91bmRSO1xuXHRcdFx0XHRyZXN1bHRbb2Zmc2V0ICsgMV0gPSBiYWNrZ3JvdW5kRztcblx0XHRcdFx0cmVzdWx0W29mZnNldCArIDJdID0gYmFja2dyb3VuZEI7XG5cdFx0XHRcdHJlc3VsdFtvZmZzZXQgKyAzXSA9IGJhY2tncm91bmRBO1xuXHRcdFx0XHRvZmZzZXQgKz0gNDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1pbmltYXBNb2RlbCB7XG5cdHJlYWRvbmx5IHRva2Vuc0NvbG9yVHJhY2tlcjogTWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlcjtcblx0cmVhZG9ubHkgb3B0aW9uczogTWluaW1hcE9wdGlvbnM7XG5cblx0Z2V0TGluZUNvdW50KCk6IG51bWJlcjtcblx0Z2V0UmVhbExpbmVDb3VudCgpOiBudW1iZXI7XG5cdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZztcblx0Z2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXI7XG5cdGdldE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgbmVlZGVkOiBib29sZWFuW10pOiAoVmlld0xpbmVEYXRhIHwgbnVsbClbXTtcblx0Z2V0U2VsZWN0aW9ucygpOiBTZWxlY3Rpb25bXTtcblx0Z2V0TWluaW1hcERlY29yYXRpb25zSW5WaWV3cG9ydChzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyKTogVmlld01vZGVsRGVjb3JhdGlvbltdO1xuXHRnZXRTZWN0aW9uSGVhZGVyRGVjb3JhdGlvbnNJblZpZXdwb3J0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIpOiBWaWV3TW9kZWxEZWNvcmF0aW9uW107XG5cdGdldFNlY3Rpb25IZWFkZXJUZXh0KGRlY29yYXRpb246IFZpZXdNb2RlbERlY29yYXRpb24sIGZpdFdpZHRoOiAoczogc3RyaW5nKSA9PiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsO1xuXHRnZXRPcHRpb25zKCk6IFRleHRNb2RlbFJlc29sdmVkT3B0aW9ucztcblx0cmV2ZWFsTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkO1xuXHRzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSU1pbmltYXBSZW5kZXJpbmdDb250ZXh0IHtcblx0cmVhZG9ubHkgdmlld3BvcnRDb250YWluc1doaXRlc3BhY2VHYXBzOiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IHNjcm9sbFdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNjcm9sbEhlaWdodDogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IHZpZXdwb3J0RW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSB2aWV3cG9ydFN0YXJ0TGluZU51bWJlclZlcnRpY2FsT2Zmc2V0OiBudW1iZXI7XG5cblx0cmVhZG9ubHkgc2Nyb2xsVG9wOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNjcm9sbExlZnQ6IG51bWJlcjtcblxuXHRyZWFkb25seSB2aWV3cG9ydFdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IHZpZXdwb3J0SGVpZ2h0OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTYW1wbGluZ1N0YXRlTGluZXNEZWxldGVkRXZlbnQge1xuXHR0eXBlOiAnZGVsZXRlZCc7XG5cdF9vbGRJbmRleDogbnVtYmVyO1xuXHRkZWxldGVGcm9tTGluZU51bWJlcjogbnVtYmVyO1xuXHRkZWxldGVUb0xpbmVOdW1iZXI6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNhbXBsaW5nU3RhdGVMaW5lc0luc2VydGVkRXZlbnQge1xuXHR0eXBlOiAnaW5zZXJ0ZWQnO1xuXHRfaTogbnVtYmVyO1xuXHRpbnNlcnRGcm9tTGluZU51bWJlcjogbnVtYmVyO1xuXHRpbnNlcnRUb0xpbmVOdW1iZXI6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNhbXBsaW5nU3RhdGVGbHVzaEV2ZW50IHtcblx0dHlwZTogJ2ZsdXNoJztcbn1cblxudHlwZSBTYW1wbGluZ1N0YXRlRXZlbnQgPSBTYW1wbGluZ1N0YXRlTGluZXNJbnNlcnRlZEV2ZW50IHwgU2FtcGxpbmdTdGF0ZUxpbmVzRGVsZXRlZEV2ZW50IHwgU2FtcGxpbmdTdGF0ZUZsdXNoRXZlbnQ7XG5cbmNsYXNzIE1pbmltYXBTYW1wbGluZ1N0YXRlIHtcblxuXHRwdWJsaWMgc3RhdGljIGNvbXB1dGUob3B0aW9uczogTWluaW1hcE9wdGlvbnMsIHZpZXdMaW5lQ291bnQ6IG51bWJlciwgb2xkU2FtcGxpbmdTdGF0ZTogTWluaW1hcFNhbXBsaW5nU3RhdGUgfCBudWxsKTogW01pbmltYXBTYW1wbGluZ1N0YXRlIHwgbnVsbCwgU2FtcGxpbmdTdGF0ZUV2ZW50W11dIHtcblx0XHRpZiAob3B0aW9ucy5yZW5kZXJNaW5pbWFwID09PSBSZW5kZXJNaW5pbWFwLk5vbmUgfHwgIW9wdGlvbnMuaXNTYW1wbGluZykge1xuXHRcdFx0cmV0dXJuIFtudWxsLCBbXV07XG5cdFx0fVxuXG5cdFx0Ly8gcmF0aW8gaXMgaW50ZW50aW9uYWxseSBub3QgcGFydCBvZiB0aGUgbGF5b3V0IHRvIGF2b2lkIHRoZSBsYXlvdXQgY2hhbmdpbmcgYWxsIHRoZSB0aW1lXG5cdFx0Ly8gc28gd2UgbmVlZCB0byByZWNvbXB1dGUgaXQgYWdhaW4uLi5cblx0XHRjb25zdCB7IG1pbmltYXBMaW5lQ291bnQgfSA9IEVkaXRvckxheW91dEluZm9Db21wdXRlci5jb21wdXRlQ29udGFpbmVkTWluaW1hcExpbmVDb3VudCh7XG5cdFx0XHR2aWV3TGluZUNvdW50OiB2aWV3TGluZUNvdW50LFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IG9wdGlvbnMuc2Nyb2xsQmV5b25kTGFzdExpbmUsXG5cdFx0XHRwYWRkaW5nVG9wOiBvcHRpb25zLnBhZGRpbmdUb3AsXG5cdFx0XHRwYWRkaW5nQm90dG9tOiBvcHRpb25zLnBhZGRpbmdCb3R0b20sXG5cdFx0XHRoZWlnaHQ6IG9wdGlvbnMuZWRpdG9ySGVpZ2h0LFxuXHRcdFx0bGluZUhlaWdodDogb3B0aW9ucy5saW5lSGVpZ2h0LFxuXHRcdFx0cGl4ZWxSYXRpbzogb3B0aW9ucy5waXhlbFJhdGlvXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmF0aW8gPSB2aWV3TGluZUNvdW50IC8gbWluaW1hcExpbmVDb3VudDtcblx0XHRjb25zdCBoYWxmUmF0aW8gPSByYXRpbyAvIDI7XG5cblx0XHRpZiAoIW9sZFNhbXBsaW5nU3RhdGUgfHwgb2xkU2FtcGxpbmdTdGF0ZS5taW5pbWFwTGluZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRyZXN1bHRbMF0gPSAxO1xuXHRcdFx0aWYgKG1pbmltYXBMaW5lQ291bnQgPiAxKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsYXN0SW5kZXggPSBtaW5pbWFwTGluZUNvdW50IC0gMTsgaSA8IGxhc3RJbmRleDsgaSsrKSB7XG5cdFx0XHRcdFx0cmVzdWx0W2ldID0gTWF0aC5yb3VuZChpICogcmF0aW8gKyBoYWxmUmF0aW8pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdFttaW5pbWFwTGluZUNvdW50IC0gMV0gPSB2aWV3TGluZUNvdW50O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtuZXcgTWluaW1hcFNhbXBsaW5nU3RhdGUocmF0aW8sIHJlc3VsdCksIFtdXTtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRNaW5pbWFwTGluZXMgPSBvbGRTYW1wbGluZ1N0YXRlLm1pbmltYXBMaW5lcztcblx0XHRjb25zdCBvbGRMZW5ndGggPSBvbGRNaW5pbWFwTGluZXMubGVuZ3RoO1xuXHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgb2xkSW5kZXggPSAwO1xuXHRcdGxldCBvbGREZWx0YUxpbmVDb3VudCA9IDA7XG5cdFx0bGV0IG1pblZpZXdMaW5lTnVtYmVyID0gMTtcblx0XHRjb25zdCBNQVhfRVZFTlRfQ09VTlQgPSAxMDsgLy8gZ2VuZXJhdGUgYXQgbW9zdCAxMCBldmVudHMsIGlmIHRoZXJlIGFyZSBtb3JlIHRoYW4gMTAgY2hhbmdlcywganVzdCBmbHVzaCBhbGwgcHJldmlvdXMgZGF0YVxuXHRcdGxldCBldmVudHM6IFNhbXBsaW5nU3RhdGVFdmVudFtdID0gW107XG5cdFx0bGV0IGxhc3RFdmVudDogU2FtcGxpbmdTdGF0ZUV2ZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtaW5pbWFwTGluZUNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IGZyb21WaWV3TGluZU51bWJlciA9IE1hdGgubWF4KG1pblZpZXdMaW5lTnVtYmVyLCBNYXRoLnJvdW5kKGkgKiByYXRpbykpO1xuXHRcdFx0Y29uc3QgdG9WaWV3TGluZU51bWJlciA9IE1hdGgubWF4KGZyb21WaWV3TGluZU51bWJlciwgTWF0aC5yb3VuZCgoaSArIDEpICogcmF0aW8pKTtcblxuXHRcdFx0d2hpbGUgKG9sZEluZGV4IDwgb2xkTGVuZ3RoICYmIG9sZE1pbmltYXBMaW5lc1tvbGRJbmRleF0gPCBmcm9tVmlld0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0aWYgKGV2ZW50cy5sZW5ndGggPCBNQVhfRVZFTlRfQ09VTlQpIHtcblx0XHRcdFx0XHRjb25zdCBvbGRNaW5pbWFwTGluZU51bWJlciA9IG9sZEluZGV4ICsgMSArIG9sZERlbHRhTGluZUNvdW50O1xuXHRcdFx0XHRcdGlmIChsYXN0RXZlbnQgJiYgbGFzdEV2ZW50LnR5cGUgPT09ICdkZWxldGVkJyAmJiBsYXN0RXZlbnQuX29sZEluZGV4ID09PSBvbGRJbmRleCAtIDEpIHtcblx0XHRcdFx0XHRcdGxhc3RFdmVudC5kZWxldGVUb0xpbmVOdW1iZXIrKztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGFzdEV2ZW50ID0geyB0eXBlOiAnZGVsZXRlZCcsIF9vbGRJbmRleDogb2xkSW5kZXgsIGRlbGV0ZUZyb21MaW5lTnVtYmVyOiBvbGRNaW5pbWFwTGluZU51bWJlciwgZGVsZXRlVG9MaW5lTnVtYmVyOiBvbGRNaW5pbWFwTGluZU51bWJlciB9O1xuXHRcdFx0XHRcdFx0ZXZlbnRzLnB1c2gobGFzdEV2ZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b2xkRGVsdGFMaW5lQ291bnQtLTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvbGRJbmRleCsrO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2VsZWN0ZWRWaWV3TGluZU51bWJlcjogbnVtYmVyO1xuXHRcdFx0aWYgKG9sZEluZGV4IDwgb2xkTGVuZ3RoICYmIG9sZE1pbmltYXBMaW5lc1tvbGRJbmRleF0gPD0gdG9WaWV3TGluZU51bWJlcikge1xuXHRcdFx0XHQvLyByZXVzZSB0aGUgb2xkIHNhbXBsZWQgbGluZVxuXHRcdFx0XHRzZWxlY3RlZFZpZXdMaW5lTnVtYmVyID0gb2xkTWluaW1hcExpbmVzW29sZEluZGV4XTtcblx0XHRcdFx0b2xkSW5kZXgrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChpID09PSAwKSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRWaWV3TGluZU51bWJlciA9IDE7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaSArIDEgPT09IG1pbmltYXBMaW5lQ291bnQpIHtcblx0XHRcdFx0XHRzZWxlY3RlZFZpZXdMaW5lTnVtYmVyID0gdmlld0xpbmVDb3VudDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZWxlY3RlZFZpZXdMaW5lTnVtYmVyID0gTWF0aC5yb3VuZChpICogcmF0aW8gKyBoYWxmUmF0aW8pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChldmVudHMubGVuZ3RoIDwgTUFYX0VWRU5UX0NPVU5UKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2xkTWluaW1hcExpbmVOdW1iZXIgPSBvbGRJbmRleCArIDEgKyBvbGREZWx0YUxpbmVDb3VudDtcblx0XHRcdFx0XHRpZiAobGFzdEV2ZW50ICYmIGxhc3RFdmVudC50eXBlID09PSAnaW5zZXJ0ZWQnICYmIGxhc3RFdmVudC5faSA9PT0gaSAtIDEpIHtcblx0XHRcdFx0XHRcdGxhc3RFdmVudC5pbnNlcnRUb0xpbmVOdW1iZXIrKztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGFzdEV2ZW50ID0geyB0eXBlOiAnaW5zZXJ0ZWQnLCBfaTogaSwgaW5zZXJ0RnJvbUxpbmVOdW1iZXI6IG9sZE1pbmltYXBMaW5lTnVtYmVyLCBpbnNlcnRUb0xpbmVOdW1iZXI6IG9sZE1pbmltYXBMaW5lTnVtYmVyIH07XG5cdFx0XHRcdFx0XHRldmVudHMucHVzaChsYXN0RXZlbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRvbGREZWx0YUxpbmVDb3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdFtpXSA9IHNlbGVjdGVkVmlld0xpbmVOdW1iZXI7XG5cdFx0XHRtaW5WaWV3TGluZU51bWJlciA9IHNlbGVjdGVkVmlld0xpbmVOdW1iZXI7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50cy5sZW5ndGggPCBNQVhfRVZFTlRfQ09VTlQpIHtcblx0XHRcdHdoaWxlIChvbGRJbmRleCA8IG9sZExlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBvbGRNaW5pbWFwTGluZU51bWJlciA9IG9sZEluZGV4ICsgMSArIG9sZERlbHRhTGluZUNvdW50O1xuXHRcdFx0XHRpZiAobGFzdEV2ZW50ICYmIGxhc3RFdmVudC50eXBlID09PSAnZGVsZXRlZCcgJiYgbGFzdEV2ZW50Ll9vbGRJbmRleCA9PT0gb2xkSW5kZXggLSAxKSB7XG5cdFx0XHRcdFx0bGFzdEV2ZW50LmRlbGV0ZVRvTGluZU51bWJlcisrO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxhc3RFdmVudCA9IHsgdHlwZTogJ2RlbGV0ZWQnLCBfb2xkSW5kZXg6IG9sZEluZGV4LCBkZWxldGVGcm9tTGluZU51bWJlcjogb2xkTWluaW1hcExpbmVOdW1iZXIsIGRlbGV0ZVRvTGluZU51bWJlcjogb2xkTWluaW1hcExpbmVOdW1iZXIgfTtcblx0XHRcdFx0XHRldmVudHMucHVzaChsYXN0RXZlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9sZERlbHRhTGluZUNvdW50LS07XG5cdFx0XHRcdG9sZEluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHRvbyBtYW55IGV2ZW50cywganVzdCBnaXZlIHVwXG5cdFx0XHRldmVudHMgPSBbeyB0eXBlOiAnZmx1c2gnIH1dO1xuXHRcdH1cblxuXHRcdHJldHVybiBbbmV3IE1pbmltYXBTYW1wbGluZ1N0YXRlKHJhdGlvLCByZXN1bHQpLCBldmVudHNdO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNhbXBsaW5nUmF0aW86IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWluaW1hcExpbmVzOiBudW1iZXJbXVx0Ly8gYSBtYXAgb2YgMC1iYXNlZCBtaW5pbWFwIGxpbmUgaW5kZXhlcyB0byAxLWJhc2VkIHZpZXcgbGluZSBudW1iZXJzXG5cdCkge1xuXHR9XG5cblx0cHVibGljIG1vZGVsTGluZVRvTWluaW1hcExpbmUobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5taW4odGhpcy5taW5pbWFwTGluZXMubGVuZ3RoLCBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGxpbmVOdW1iZXIgLyB0aGlzLnNhbXBsaW5nUmF0aW8pKSk7XG5cdH1cblxuXHQvKipcblx0ICogV2lsbCByZXR1cm4gbnVsbCBpZiB0aGUgbW9kZWwgbGluZSByYW5nZXMgYXJlIG5vdCBpbnRlcnNlY3Rpbmcgd2l0aCBhIHNhbXBsZWQgbW9kZWwgbGluZS5cblx0ICovXG5cdHB1YmxpYyBtb2RlbExpbmVSYW5nZVRvTWluaW1hcExpbmVSYW5nZShmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlcik6IFtudW1iZXIsIG51bWJlcl0gfCBudWxsIHtcblx0XHRsZXQgZnJvbUxpbmVJbmRleCA9IHRoaXMubW9kZWxMaW5lVG9NaW5pbWFwTGluZShmcm9tTGluZU51bWJlcikgLSAxO1xuXHRcdHdoaWxlIChmcm9tTGluZUluZGV4ID4gMCAmJiB0aGlzLm1pbmltYXBMaW5lc1tmcm9tTGluZUluZGV4IC0gMV0gPj0gZnJvbUxpbmVOdW1iZXIpIHtcblx0XHRcdGZyb21MaW5lSW5kZXgtLTtcblx0XHR9XG5cdFx0bGV0IHRvTGluZUluZGV4ID0gdGhpcy5tb2RlbExpbmVUb01pbmltYXBMaW5lKHRvTGluZU51bWJlcikgLSAxO1xuXHRcdHdoaWxlICh0b0xpbmVJbmRleCArIDEgPCB0aGlzLm1pbmltYXBMaW5lcy5sZW5ndGggJiYgdGhpcy5taW5pbWFwTGluZXNbdG9MaW5lSW5kZXggKyAxXSA8PSB0b0xpbmVOdW1iZXIpIHtcblx0XHRcdHRvTGluZUluZGV4Kys7XG5cdFx0fVxuXHRcdGlmIChmcm9tTGluZUluZGV4ID09PSB0b0xpbmVJbmRleCkge1xuXHRcdFx0Y29uc3Qgc2FtcGxlZExpbmVOdW1iZXIgPSB0aGlzLm1pbmltYXBMaW5lc1tmcm9tTGluZUluZGV4XTtcblx0XHRcdGlmIChzYW1wbGVkTGluZU51bWJlciA8IGZyb21MaW5lTnVtYmVyIHx8IHNhbXBsZWRMaW5lTnVtYmVyID4gdG9MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIFRoaXMgbGluZSBpcyBub3QgcGFydCBvZiB0aGUgc2FtcGxlZCBsaW5lcyA9PT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFtmcm9tTGluZUluZGV4ICsgMSwgdG9MaW5lSW5kZXggKyAxXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaWxsIGFsd2F5cyByZXR1cm4gYSByYW5nZSwgZXZlbiBpZiBpdCBpcyBub3QgaW50ZXJzZWN0aW5nIHdpdGggYSBzYW1wbGVkIG1vZGVsIGxpbmUuXG5cdCAqL1xuXHRwdWJsaWMgZGVjb3JhdGlvbkxpbmVSYW5nZVRvTWluaW1hcExpbmVSYW5nZShzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyKTogW251bWJlciwgbnVtYmVyXSB7XG5cdFx0bGV0IG1pbmltYXBMaW5lU3RhcnQgPSB0aGlzLm1vZGVsTGluZVRvTWluaW1hcExpbmUoc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRsZXQgbWluaW1hcExpbmVFbmQgPSB0aGlzLm1vZGVsTGluZVRvTWluaW1hcExpbmUoZW5kTGluZU51bWJlcik7XG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciAhPT0gZW5kTGluZU51bWJlciAmJiBtaW5pbWFwTGluZUVuZCA9PT0gbWluaW1hcExpbmVTdGFydCkge1xuXHRcdFx0aWYgKG1pbmltYXBMaW5lRW5kID09PSB0aGlzLm1pbmltYXBMaW5lcy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKG1pbmltYXBMaW5lU3RhcnQgPiAxKSB7XG5cdFx0XHRcdFx0bWluaW1hcExpbmVTdGFydC0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtaW5pbWFwTGluZUVuZCsrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW21pbmltYXBMaW5lU3RhcnQsIG1pbmltYXBMaW5lRW5kXTtcblx0fVxuXG5cdHB1YmxpYyBvbkxpbmVzRGVsZXRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCk6IFtudW1iZXIsIG51bWJlcl0ge1xuXHRcdC8vIGhhdmUgdGhlIG1hcHBpbmcgYmUgc3RpY2t5XG5cdFx0Y29uc3QgZGVsZXRlZExpbmVDb3VudCA9IGUudG9MaW5lTnVtYmVyIC0gZS5mcm9tTGluZU51bWJlciArIDE7XG5cdFx0bGV0IGNoYW5nZVN0YXJ0SW5kZXggPSB0aGlzLm1pbmltYXBMaW5lcy5sZW5ndGg7XG5cdFx0bGV0IGNoYW5nZUVuZEluZGV4ID0gMDtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5taW5pbWFwTGluZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICh0aGlzLm1pbmltYXBMaW5lc1tpXSA8IGUuZnJvbUxpbmVOdW1iZXIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5taW5pbWFwTGluZXNbaV0gPD0gZS50b0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gdGhpcyBsaW5lIGdvdCBkZWxldGVkID0+IG1vdmUgdG8gcHJldmlvdXMgYXZhaWxhYmxlXG5cdFx0XHRcdHRoaXMubWluaW1hcExpbmVzW2ldID0gTWF0aC5tYXgoMSwgZS5mcm9tTGluZU51bWJlciAtIDEpO1xuXHRcdFx0XHRjaGFuZ2VTdGFydEluZGV4ID0gTWF0aC5taW4oY2hhbmdlU3RhcnRJbmRleCwgaSk7XG5cdFx0XHRcdGNoYW5nZUVuZEluZGV4ID0gTWF0aC5tYXgoY2hhbmdlRW5kSW5kZXgsIGkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5taW5pbWFwTGluZXNbaV0gLT0gZGVsZXRlZExpbmVDb3VudDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFtjaGFuZ2VTdGFydEluZGV4LCBjaGFuZ2VFbmRJbmRleF07XG5cdH1cblxuXHRwdWJsaWMgb25MaW5lc0luc2VydGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCk6IHZvaWQge1xuXHRcdC8vIGhhdmUgdGhlIG1hcHBpbmcgYmUgc3RpY2t5XG5cdFx0Y29uc3QgaW5zZXJ0ZWRMaW5lQ291bnQgPSBlLnRvTGluZU51bWJlciAtIGUuZnJvbUxpbmVOdW1iZXIgKyAxO1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLm1pbmltYXBMaW5lcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHRoaXMubWluaW1hcExpbmVzW2ldIDwgZS5mcm9tTGluZU51bWJlcikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHRoaXMubWluaW1hcExpbmVzW2ldICs9IGluc2VydGVkTGluZUNvdW50O1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFRoZSBtaW5pbWFwIGFwcGVhcnMgYmVzaWRlIHRoZSBlZGl0b3Igc2Nyb2xsIGJhciBhbmQgdmlzdWFsaXplcyBhIHpvb21lZCBvdXRcbiAqIHZpZXcgb2YgdGhlIGZpbGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBNaW5pbWFwIGV4dGVuZHMgVmlld1BhcnQgaW1wbGVtZW50cyBJTWluaW1hcE1vZGVsIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdG9rZW5zQ29sb3JUcmFja2VyOiBNaW5pbWFwVG9rZW5zQ29sb3JUcmFja2VyO1xuXG5cdHByaXZhdGUgX3NlbGVjdGlvbnM6IFNlbGVjdGlvbltdO1xuXHRwcml2YXRlIF9taW5pbWFwU2VsZWN0aW9uczogU2VsZWN0aW9uW10gfCBudWxsO1xuXG5cdHB1YmxpYyBvcHRpb25zOiBNaW5pbWFwT3B0aW9ucztcblxuXHRwcml2YXRlIF9zYW1wbGluZ1N0YXRlOiBNaW5pbWFwU2FtcGxpbmdTdGF0ZSB8IG51bGw7XG5cdHByaXZhdGUgX3Nob3VsZENoZWNrU2FtcGxpbmc6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfc2VjdGlvbkhlYWRlckNhY2hlID0gbmV3IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPigxMCwgMS41KTtcblxuXHRwcml2YXRlIF9hY3R1YWw6IElubmVyTWluaW1hcDtcblxuXHRjb25zdHJ1Y3Rvcihjb250ZXh0OiBWaWV3Q29udGV4dCkge1xuXHRcdHN1cGVyKGNvbnRleHQpO1xuXG5cdFx0dGhpcy50b2tlbnNDb2xvclRyYWNrZXIgPSBNaW5pbWFwVG9rZW5zQ29sb3JUcmFja2VyLmdldEluc3RhbmNlKCk7XG5cblx0XHR0aGlzLl9zZWxlY3Rpb25zID0gW107XG5cdFx0dGhpcy5fbWluaW1hcFNlbGVjdGlvbnMgPSBudWxsO1xuXG5cdFx0dGhpcy5vcHRpb25zID0gbmV3IE1pbmltYXBPcHRpb25zKHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbiwgdGhpcy5fY29udGV4dC50aGVtZSwgdGhpcy50b2tlbnNDb2xvclRyYWNrZXIpO1xuXHRcdGNvbnN0IFtzYW1wbGluZ1N0YXRlLF0gPSBNaW5pbWFwU2FtcGxpbmdTdGF0ZS5jb21wdXRlKHRoaXMub3B0aW9ucywgdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCksIG51bGwpO1xuXHRcdHRoaXMuX3NhbXBsaW5nU3RhdGUgPSBzYW1wbGluZ1N0YXRlO1xuXHRcdHRoaXMuX3Nob3VsZENoZWNrU2FtcGxpbmcgPSBmYWxzZTtcblxuXHRcdHRoaXMuX2FjdHVhbCA9IG5ldyBJbm5lck1pbmltYXAoY29udGV4dC50aGVtZSwgdGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3R1YWwuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5nZXREb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbk9wdGlvbnNNYXliZUNoYW5nZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgb3B0cyA9IG5ldyBNaW5pbWFwT3B0aW9ucyh0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24sIHRoaXMuX2NvbnRleHQudGhlbWUsIHRoaXMudG9rZW5zQ29sb3JUcmFja2VyKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLmVxdWFscyhvcHRzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRzO1xuXHRcdHRoaXMuX3JlY3JlYXRlTGluZVNhbXBsaW5nKCk7XG5cdFx0dGhpcy5fYWN0dWFsLm9uRGlkQ2hhbmdlT3B0aW9ucygpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0tLSBiZWdpbiB2aWV3IGV2ZW50IGhhbmRsZXJzXG5cblx0cHVibGljIG92ZXJyaWRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9vbk9wdGlvbnNNYXliZUNoYW5nZWQoKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25DdXJzb3JTdGF0ZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9zZWxlY3Rpb25zID0gZS5zZWxlY3Rpb25zO1xuXHRcdHRoaXMuX21pbmltYXBTZWxlY3Rpb25zID0gbnVsbDtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLm9uU2VsZWN0aW9uQ2hhbmdlZCgpO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkRlY29yYXRpb25zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlLmFmZmVjdHNNaW5pbWFwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLm9uRGVjb3JhdGlvbnNDaGFuZ2VkKCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25GbHVzaGVkKGU6IHZpZXdFdmVudHMuVmlld0ZsdXNoZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zYW1wbGluZ1N0YXRlKSB7XG5cdFx0XHR0aGlzLl9zaG91bGRDaGVja1NhbXBsaW5nID0gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5vbkZsdXNoZWQoKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0Y29uc3QgbWluaW1hcExpbmVSYW5nZSA9IHRoaXMuX3NhbXBsaW5nU3RhdGUubW9kZWxMaW5lUmFuZ2VUb01pbmltYXBMaW5lUmFuZ2UoZS5mcm9tTGluZU51bWJlciwgZS5mcm9tTGluZU51bWJlciArIGUuY291bnQgLSAxKTtcblx0XHRcdGlmIChtaW5pbWFwTGluZVJhbmdlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25MaW5lc0NoYW5nZWQobWluaW1hcExpbmVSYW5nZVswXSwgbWluaW1hcExpbmVSYW5nZVsxXSAtIG1pbmltYXBMaW5lUmFuZ2VbMF0gKyAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5vbkxpbmVzQ2hhbmdlZChlLmZyb21MaW5lTnVtYmVyLCBlLmNvdW50KTtcblx0XHR9XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNEZWxldGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdGNvbnN0IFtjaGFuZ2VTdGFydEluZGV4LCBjaGFuZ2VFbmRJbmRleF0gPSB0aGlzLl9zYW1wbGluZ1N0YXRlLm9uTGluZXNEZWxldGVkKGUpO1xuXHRcdFx0aWYgKGNoYW5nZVN0YXJ0SW5kZXggPD0gY2hhbmdlRW5kSW5kZXgpIHtcblx0XHRcdFx0dGhpcy5fYWN0dWFsLm9uTGluZXNDaGFuZ2VkKGNoYW5nZVN0YXJ0SW5kZXggKyAxLCBjaGFuZ2VFbmRJbmRleCAtIGNoYW5nZVN0YXJ0SW5kZXggKyAxKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nob3VsZENoZWNrU2FtcGxpbmcgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25MaW5lc0RlbGV0ZWQoZS5mcm9tTGluZU51bWJlciwgZS50b0xpbmVOdW1iZXIpO1xuXHRcdH1cblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0luc2VydGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zYW1wbGluZ1N0YXRlKSB7XG5cdFx0XHR0aGlzLl9zYW1wbGluZ1N0YXRlLm9uTGluZXNJbnNlcnRlZChlKTtcblx0XHRcdHRoaXMuX3Nob3VsZENoZWNrU2FtcGxpbmcgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25MaW5lc0luc2VydGVkKGUuZnJvbUxpbmVOdW1iZXIsIGUudG9MaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uU2Nyb2xsQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLm9uU2Nyb2xsQ2hhbmdlZChlKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25UaGVtZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3VGhlbWVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9hY3R1YWwub25UaGVtZUNoYW5nZWQoKTtcblx0XHR0aGlzLl9vbk9wdGlvbnNNYXliZUNoYW5nZWQoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Ub2tlbnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1Rva2Vuc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zYW1wbGluZ1N0YXRlKSB7XG5cdFx0XHRjb25zdCByYW5nZXM6IHsgZnJvbUxpbmVOdW1iZXI6IG51bWJlcjsgdG9MaW5lTnVtYmVyOiBudW1iZXIgfVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIGUucmFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IG1pbmltYXBMaW5lUmFuZ2UgPSB0aGlzLl9zYW1wbGluZ1N0YXRlLm1vZGVsTGluZVJhbmdlVG9NaW5pbWFwTGluZVJhbmdlKHJhbmdlLmZyb21MaW5lTnVtYmVyLCByYW5nZS50b0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRpZiAobWluaW1hcExpbmVSYW5nZSkge1xuXHRcdFx0XHRcdHJhbmdlcy5wdXNoKHsgZnJvbUxpbmVOdW1iZXI6IG1pbmltYXBMaW5lUmFuZ2VbMF0sIHRvTGluZU51bWJlcjogbWluaW1hcExpbmVSYW5nZVsxXSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHJhbmdlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5vblRva2Vuc0NoYW5nZWQocmFuZ2VzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5vblRva2Vuc0NoYW5nZWQoZS5yYW5nZXMpO1xuXHRcdH1cblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Ub2tlbnNDb2xvcnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1Rva2Vuc0NvbG9yc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX29uT3B0aW9uc01heWJlQ2hhbmdlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25Ub2tlbnNDb2xvcnNDaGFuZ2VkKCk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uWm9uZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5vblpvbmVzQ2hhbmdlZCgpO1xuXHR9XG5cblx0Ly8gLS0tIGVuZCBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBwcmVwYXJlUmVuZGVyKGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zaG91bGRDaGVja1NhbXBsaW5nKSB7XG5cdFx0XHR0aGlzLl9zaG91bGRDaGVja1NhbXBsaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9yZWNyZWF0ZUxpbmVTYW1wbGluZygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoY3R4OiBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGxldCB2aWV3cG9ydFN0YXJ0TGluZU51bWJlciA9IGN0eC52aXNpYmxlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGxldCB2aWV3cG9ydEVuZExpbmVOdW1iZXIgPSBjdHgudmlzaWJsZVJhbmdlLmVuZExpbmVOdW1iZXI7XG5cblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0dmlld3BvcnRTdGFydExpbmVOdW1iZXIgPSB0aGlzLl9zYW1wbGluZ1N0YXRlLm1vZGVsTGluZVRvTWluaW1hcExpbmUodmlld3BvcnRTdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0dmlld3BvcnRFbmRMaW5lTnVtYmVyID0gdGhpcy5fc2FtcGxpbmdTdGF0ZS5tb2RlbExpbmVUb01pbmltYXBMaW5lKHZpZXdwb3J0RW5kTGluZU51bWJlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWluaW1hcEN0eDogSU1pbmltYXBSZW5kZXJpbmdDb250ZXh0ID0ge1xuXHRcdFx0dmlld3BvcnRDb250YWluc1doaXRlc3BhY2VHYXBzOiAoY3R4LnZpZXdwb3J0RGF0YS53aGl0ZXNwYWNlVmlld3BvcnREYXRhLmxlbmd0aCA+IDApLFxuXG5cdFx0XHRzY3JvbGxXaWR0aDogY3R4LnNjcm9sbFdpZHRoLFxuXHRcdFx0c2Nyb2xsSGVpZ2h0OiBjdHguc2Nyb2xsSGVpZ2h0LFxuXG5cdFx0XHR2aWV3cG9ydFN0YXJ0TGluZU51bWJlcjogdmlld3BvcnRTdGFydExpbmVOdW1iZXIsXG5cdFx0XHR2aWV3cG9ydEVuZExpbmVOdW1iZXI6IHZpZXdwb3J0RW5kTGluZU51bWJlcixcblx0XHRcdHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQ6IGN0eC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIodmlld3BvcnRTdGFydExpbmVOdW1iZXIpLFxuXG5cdFx0XHRzY3JvbGxUb3A6IGN0eC5zY3JvbGxUb3AsXG5cdFx0XHRzY3JvbGxMZWZ0OiBjdHguc2Nyb2xsTGVmdCxcblxuXHRcdFx0dmlld3BvcnRXaWR0aDogY3R4LnZpZXdwb3J0V2lkdGgsXG5cdFx0XHR2aWV3cG9ydEhlaWdodDogY3R4LnZpZXdwb3J0SGVpZ2h0LFxuXHRcdH07XG5cdFx0dGhpcy5fYWN0dWFsLnJlbmRlcihtaW5pbWFwQ3R4KTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBJTWluaW1hcE1vZGVsXG5cblx0cHJpdmF0ZSBfcmVjcmVhdGVMaW5lU2FtcGxpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWluaW1hcFNlbGVjdGlvbnMgPSBudWxsO1xuXG5cdFx0Y29uc3Qgd2FzU2FtcGxpbmcgPSBCb29sZWFuKHRoaXMuX3NhbXBsaW5nU3RhdGUpO1xuXHRcdGNvbnN0IFtzYW1wbGluZ1N0YXRlLCBldmVudHNdID0gTWluaW1hcFNhbXBsaW5nU3RhdGUuY29tcHV0ZSh0aGlzLm9wdGlvbnMsIHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb3VudCgpLCB0aGlzLl9zYW1wbGluZ1N0YXRlKTtcblx0XHR0aGlzLl9zYW1wbGluZ1N0YXRlID0gc2FtcGxpbmdTdGF0ZTtcblxuXHRcdGlmICh3YXNTYW1wbGluZyAmJiB0aGlzLl9zYW1wbGluZ1N0YXRlKSB7XG5cdFx0XHQvLyB3YXMgc2FtcGxpbmcsIGlzIHNhbXBsaW5nXG5cdFx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIGV2ZW50cykge1xuXHRcdFx0XHRzd2l0Y2ggKGV2ZW50LnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdkZWxldGVkJzpcblx0XHRcdFx0XHRcdHRoaXMuX2FjdHVhbC5vbkxpbmVzRGVsZXRlZChldmVudC5kZWxldGVGcm9tTGluZU51bWJlciwgZXZlbnQuZGVsZXRlVG9MaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2luc2VydGVkJzpcblx0XHRcdFx0XHRcdHRoaXMuX2FjdHVhbC5vbkxpbmVzSW5zZXJ0ZWQoZXZlbnQuaW5zZXJ0RnJvbUxpbmVOdW1iZXIsIGV2ZW50Lmluc2VydFRvTGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdmbHVzaCc6XG5cdFx0XHRcdFx0XHR0aGlzLl9hY3R1YWwub25GbHVzaGVkKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NhbXBsaW5nU3RhdGUubWluaW1hcExpbmVzLmxlbmd0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb3VudCgpO1xuXHR9XG5cblx0cHVibGljIGdldFJlYWxMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb250ZW50KHRoaXMuX3NhbXBsaW5nU3RhdGUubWluaW1hcExpbmVzW2xpbmVOdW1iZXIgLSAxXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHRoaXMuX3NhbXBsaW5nU3RhdGUubWluaW1hcExpbmVzW2xpbmVOdW1iZXIgLSAxXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgbmVlZGVkOiBib29sZWFuW10pOiAoVmlld0xpbmVEYXRhIHwgbnVsbClbXSB7XG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogKFZpZXdMaW5lRGF0YSB8IG51bGwpW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGxpbmVJbmRleCA9IDAsIGxpbmVDb3VudCA9IGVuZExpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXIgKyAxOyBsaW5lSW5kZXggPCBsaW5lQ291bnQ7IGxpbmVJbmRleCsrKSB7XG5cdFx0XHRcdGlmIChuZWVkZWRbbGluZUluZGV4XSkge1xuXHRcdFx0XHRcdHJlc3VsdFtsaW5lSW5kZXhdID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0Vmlld0xpbmVEYXRhKHRoaXMuX3NhbXBsaW5nU3RhdGUubWluaW1hcExpbmVzW3N0YXJ0TGluZU51bWJlciArIGxpbmVJbmRleCAtIDFdKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHRbbGluZUluZGV4XSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgbmVlZGVkKS5kYXRhO1xuXHR9XG5cblx0cHVibGljIGdldFNlbGVjdGlvbnMoKTogU2VsZWN0aW9uW10ge1xuXHRcdGlmICh0aGlzLl9taW5pbWFwU2VsZWN0aW9ucyA9PT0gbnVsbCkge1xuXHRcdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdFx0dGhpcy5fbWluaW1hcFNlbGVjdGlvbnMgPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2YgdGhpcy5fc2VsZWN0aW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IFttaW5pbWFwTGluZVN0YXJ0LCBtaW5pbWFwTGluZUVuZF0gPSB0aGlzLl9zYW1wbGluZ1N0YXRlLmRlY29yYXRpb25MaW5lUmFuZ2VUb01pbmltYXBMaW5lUmFuZ2Uoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdHRoaXMuX21pbmltYXBTZWxlY3Rpb25zLnB1c2gobmV3IFNlbGVjdGlvbihtaW5pbWFwTGluZVN0YXJ0LCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4sIG1pbmltYXBMaW5lRW5kLCBzZWxlY3Rpb24uZW5kQ29sdW1uKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX21pbmltYXBTZWxlY3Rpb25zID0gdGhpcy5fc2VsZWN0aW9ucztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21pbmltYXBTZWxlY3Rpb25zO1xuXHR9XG5cblx0cHVibGljIGdldE1pbmltYXBEZWNvcmF0aW9uc0luVmlld3BvcnQoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldE1pbmltYXBEZWNvcmF0aW9uc0luVmlld3BvcnQoc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyKVxuXHRcdFx0LmZpbHRlcihkZWNvcmF0aW9uID0+ICFkZWNvcmF0aW9uLm9wdGlvbnMubWluaW1hcD8uc2VjdGlvbkhlYWRlclN0eWxlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWN0aW9uSGVhZGVyRGVjb3JhdGlvbnNJblZpZXdwb3J0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIpOiBWaWV3TW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodEluTWluaW1hcExpbmVzID0gdGhpcy5vcHRpb25zLnNlY3Rpb25IZWFkZXJGb250U2l6ZSAvIHRoaXMub3B0aW9ucy5taW5pbWFwTGluZUhlaWdodDtcblx0XHRzdGFydExpbmVOdW1iZXIgPSBNYXRoLmZsb29yKE1hdGgubWF4KDEsIHN0YXJ0TGluZU51bWJlciAtIGhlYWRlckhlaWdodEluTWluaW1hcExpbmVzKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2dldE1pbmltYXBEZWNvcmF0aW9uc0luVmlld3BvcnQoc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyKVxuXHRcdFx0LmZpbHRlcihkZWNvcmF0aW9uID0+ICEhZGVjb3JhdGlvbi5vcHRpb25zLm1pbmltYXA/LnNlY3Rpb25IZWFkZXJTdHlsZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRNaW5pbWFwRGVjb3JhdGlvbnNJblZpZXdwb3J0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIpIHtcblx0XHRsZXQgdmlzaWJsZVJhbmdlOiBSYW5nZTtcblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0Y29uc3QgbW9kZWxTdGFydExpbmVOdW1iZXIgPSB0aGlzLl9zYW1wbGluZ1N0YXRlLm1pbmltYXBMaW5lc1tzdGFydExpbmVOdW1iZXIgLSAxXTtcblx0XHRcdGNvbnN0IG1vZGVsRW5kTGluZU51bWJlciA9IHRoaXMuX3NhbXBsaW5nU3RhdGUubWluaW1hcExpbmVzW2VuZExpbmVOdW1iZXIgLSAxXTtcblx0XHRcdHZpc2libGVSYW5nZSA9IG5ldyBSYW5nZShtb2RlbFN0YXJ0TGluZU51bWJlciwgMSwgbW9kZWxFbmRMaW5lTnVtYmVyLCB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKG1vZGVsRW5kTGluZU51bWJlcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2aXNpYmxlUmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCAxLCBlbmRMaW5lTnVtYmVyLCB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpKTtcblx0XHR9XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRNaW5pbWFwRGVjb3JhdGlvbnNJblJhbmdlKHZpc2libGVSYW5nZSk7XG5cblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBWaWV3TW9kZWxEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0XHRpZiAoIWRlY29yYXRpb24ub3B0aW9ucy5taW5pbWFwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBkZWNvcmF0aW9uLnJhbmdlO1xuXHRcdFx0XHRjb25zdCBtaW5pbWFwU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fc2FtcGxpbmdTdGF0ZS5tb2RlbExpbmVUb01pbmltYXBMaW5lKHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IG1pbmltYXBFbmRMaW5lTnVtYmVyID0gdGhpcy5fc2FtcGxpbmdTdGF0ZS5tb2RlbExpbmVUb01pbmltYXBMaW5lKHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgVmlld01vZGVsRGVjb3JhdGlvbihuZXcgUmFuZ2UobWluaW1hcFN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIG1pbmltYXBFbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pLCBkZWNvcmF0aW9uLm9wdGlvbnMpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlY29yYXRpb25zO1xuXHR9XG5cblx0cHVibGljIGdldFNlY3Rpb25IZWFkZXJUZXh0KGRlY29yYXRpb246IFZpZXdNb2RlbERlY29yYXRpb24sIGZpdFdpZHRoOiAoczogc3RyaW5nKSA9PiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBoZWFkZXJUZXh0ID0gZGVjb3JhdGlvbi5vcHRpb25zLm1pbmltYXA/LnNlY3Rpb25IZWFkZXJUZXh0O1xuXHRcdGlmICghaGVhZGVyVGV4dCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGNhY2hlZFRleHQgPSB0aGlzLl9zZWN0aW9uSGVhZGVyQ2FjaGUuZ2V0KGhlYWRlclRleHQpO1xuXHRcdGlmIChjYWNoZWRUZXh0KSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkVGV4dDtcblx0XHR9XG5cdFx0Y29uc3QgZml0dGVkVGV4dCA9IGZpdFdpZHRoKGhlYWRlclRleHQpO1xuXHRcdHRoaXMuX3NlY3Rpb25IZWFkZXJDYWNoZS5zZXQoaGVhZGVyVGV4dCwgZml0dGVkVGV4dCk7XG5cdFx0cmV0dXJuIGZpdHRlZFRleHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3B0aW9ucygpOiBUZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnMge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5tb2RlbC5nZXRPcHRpb25zKCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0bGluZU51bWJlciA9IHRoaXMuX3NhbXBsaW5nU3RhdGUubWluaW1hcExpbmVzW2xpbmVOdW1iZXIgLSAxXTtcblx0XHR9XG5cdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwucmV2ZWFsUmFuZ2UoXG5cdFx0XHQnbW91c2UnLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgMSksXG5cdFx0XHR2aWV3RXZlbnRzLlZlcnRpY2FsUmV2ZWFsVHlwZS5DZW50ZXIsXG5cdFx0XHRTY3JvbGxUeXBlLlNtb290aFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwudmlld0xheW91dC5zZXRTY3JvbGxQb3NpdGlvbih7XG5cdFx0XHRzY3JvbGxUb3A6IHNjcm9sbFRvcFxuXHRcdH0sIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5jbGFzcyBJbm5lck1pbmltYXAgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90aGVtZTogRWRpdG9yVGhlbWU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJTWluaW1hcE1vZGVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hhZG93OiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbnZhczogRmFzdERvbU5vZGU8SFRNTENhbnZhc0VsZW1lbnQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uc0NhbnZhczogRmFzdERvbU5vZGU8SFRNTENhbnZhc0VsZW1lbnQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGlkZXI6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2xpZGVySG9yaXpvbnRhbDogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wb2ludGVyRG93bkxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2xpZGVyUG9pbnRlck1vdmVNb25pdG9yOiBHbG9iYWxQb2ludGVyTW92ZU1vbml0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsaWRlclBvaW50ZXJEb3duTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nZXN0dXJlRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsaWRlclRvdWNoU3RhcnRMaXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsaWRlclRvdWNoTW92ZUxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2xpZGVyVG91Y2hFbmRMaXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cblx0cHJpdmF0ZSBfbGFzdFJlbmRlckRhdGE6IFJlbmRlckRhdGEgfCBudWxsO1xuXHRwcml2YXRlIF9zZWxlY3Rpb25Db2xvcjogQ29sb3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlbmRlckRlY29yYXRpb25zOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2dlc3R1cmVJblByb2dyZXNzOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2J1ZmZlcnM6IE1pbmltYXBCdWZmZXJzIHwgbnVsbDtcblx0cHJpdmF0ZSBfaXNNb3VzZU92ZXJNaW5pbWFwOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2hpZGVEZWxheWVkU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRoZW1lOiBFZGl0b3JUaGVtZSxcblx0XHRtb2RlbDogSU1pbmltYXBNb2RlbFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdGhlbWUgPSB0aGVtZTtcblx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXG5cdFx0dGhpcy5fbGFzdFJlbmRlckRhdGEgPSBudWxsO1xuXHRcdHRoaXMuX2J1ZmZlcnMgPSBudWxsO1xuXHRcdHRoaXMuX3NlbGVjdGlvbkNvbG9yID0gdGhpcy5fdGhlbWUuZ2V0Q29sb3IobWluaW1hcFNlbGVjdGlvbik7XG5cblx0XHR0aGlzLl9kb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdFBhcnRGaW5nZXJwcmludHMud3JpdGUodGhpcy5fZG9tTm9kZSwgUGFydEZpbmdlcnByaW50Lk1pbmltYXApO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0Q2xhc3NOYW1lKHRoaXMuX2dldE1pbmltYXBEb21Ob2RlQ2xhc3NOYW1lKCkpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0UG9zaXRpb24oJ2Fic29sdXRlJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncHJlc2VudGF0aW9uJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdHRoaXMuX3NoYWRvdyA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHR0aGlzLl9zaGFkb3cuc2V0Q2xhc3NOYW1lKCdtaW5pbWFwLXNoYWRvdy1oaWRkZW4nKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3NoYWRvdyk7XG5cblx0XHR0aGlzLl9jYW52YXMgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKSk7XG5cdFx0dGhpcy5fY2FudmFzLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdHRoaXMuX2NhbnZhcy5zZXRMZWZ0KDApO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fY2FudmFzKTtcblxuXHRcdHRoaXMuX2RlY29yYXRpb25zQ2FudmFzID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJykpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLnNldENsYXNzTmFtZSgnbWluaW1hcC1kZWNvcmF0aW9ucy1sYXllcicpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLnNldExlZnQoMCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9kZWNvcmF0aW9uc0NhbnZhcyk7XG5cblx0XHR0aGlzLl9zbGlkZXIgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0dGhpcy5fc2xpZGVyLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdHRoaXMuX3NsaWRlci5zZXRDbGFzc05hbWUoJ21pbmltYXAtc2xpZGVyJyk7XG5cdFx0dGhpcy5fc2xpZGVyLnNldExheWVySGludGluZyh0cnVlKTtcblx0XHR0aGlzLl9zbGlkZXIuc2V0Q29udGFpbignc3RyaWN0Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9zbGlkZXIpO1xuXG5cdFx0dGhpcy5fc2xpZGVySG9yaXpvbnRhbCA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHR0aGlzLl9zbGlkZXJIb3Jpem9udGFsLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdHRoaXMuX3NsaWRlckhvcml6b250YWwuc2V0Q2xhc3NOYW1lKCdtaW5pbWFwLXNsaWRlci1ob3Jpem9udGFsJyk7XG5cdFx0dGhpcy5fc2xpZGVyLmFwcGVuZENoaWxkKHRoaXMuX3NsaWRlckhvcml6b250YWwpO1xuXG5cdFx0dGhpcy5fYXBwbHlMYXlvdXQoKTtcblxuXHRcdHRoaXMuX2hpZGVEZWxheWVkU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5faGlkZUltbWVkaWF0ZWx5SWZNb3VzZUlzT3V0c2lkZSgpLCA1MDApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuTU9VU0VfT1ZFUiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNNb3VzZU92ZXJNaW5pbWFwID0gdHJ1ZTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNNb3VzZU92ZXJNaW5pbWFwID0gZmFsc2U7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcG9pbnRlckRvd25MaXN0ZW5lciA9IGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuUE9JTlRFUl9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHRjb25zdCBpc01vdXNlID0gKGUucG9pbnRlclR5cGUgPT09ICdtb3VzZScpO1xuXHRcdFx0Y29uc3QgaXNMZWZ0Q2xpY2sgPSAoZS5idXR0b24gPT09IDApO1xuXG5cdFx0XHRjb25zdCByZW5kZXJNaW5pbWFwID0gdGhpcy5fbW9kZWwub3B0aW9ucy5yZW5kZXJNaW5pbWFwO1xuXHRcdFx0aWYgKHJlbmRlck1pbmltYXAgPT09IFJlbmRlck1pbmltYXAuTm9uZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2xhc3RSZW5kZXJEYXRhKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9tb2RlbC5vcHRpb25zLnNpemUgIT09ICdwcm9wb3J0aW9uYWwnKSB7XG5cdFx0XHRcdGlmIChpc0xlZnRDbGljayAmJiB0aGlzLl9sYXN0UmVuZGVyRGF0YSkge1xuXHRcdFx0XHRcdC8vIHByZXRlbmQgdGhlIGNsaWNrIG9jY3VycmVkIGluIHRoZSBjZW50ZXIgb2YgdGhlIHNsaWRlclxuXHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5fc2xpZGVyLmRvbU5vZGUpO1xuXHRcdFx0XHRcdGNvbnN0IGluaXRpYWxQb3NZID0gcG9zaXRpb24udG9wICsgcG9zaXRpb24uaGVpZ2h0IC8gMjtcblx0XHRcdFx0XHR0aGlzLl9zdGFydFNsaWRlckRyYWdnaW5nKGUsIGluaXRpYWxQb3NZLCB0aGlzLl9sYXN0UmVuZGVyRGF0YS5yZW5kZXJlZExheW91dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNMZWZ0Q2xpY2sgfHwgIWlzTW91c2UpIHtcblx0XHRcdFx0Y29uc3QgbWluaW1hcExpbmVIZWlnaHQgPSB0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBMaW5lSGVpZ2h0O1xuXHRcdFx0XHRjb25zdCBpbnRlcm5hbE9mZnNldFkgPSAodGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNJbm5lckhlaWdodCAvIHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzT3V0ZXJIZWlnaHQpICogZS5vZmZzZXRZO1xuXHRcdFx0XHRjb25zdCBsaW5lSW5kZXggPSBNYXRoLmZsb29yKGludGVybmFsT2Zmc2V0WSAvIG1pbmltYXBMaW5lSGVpZ2h0KTtcblxuXHRcdFx0XHRsZXQgbGluZU51bWJlciA9IGxpbmVJbmRleCArIHRoaXMuX2xhc3RSZW5kZXJEYXRhLnJlbmRlcmVkTGF5b3V0LnN0YXJ0TGluZU51bWJlciAtIHRoaXMuX2xhc3RSZW5kZXJEYXRhLnJlbmRlcmVkTGF5b3V0LnRvcFBhZGRpbmdMaW5lQ291bnQ7XG5cdFx0XHRcdGxpbmVOdW1iZXIgPSBNYXRoLm1pbihsaW5lTnVtYmVyLCB0aGlzLl9tb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cblx0XHRcdFx0dGhpcy5fbW9kZWwucmV2ZWFsTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3NsaWRlclBvaW50ZXJNb3ZlTW9uaXRvciA9IG5ldyBHbG9iYWxQb2ludGVyTW92ZU1vbml0b3IoKTtcblxuXHRcdHRoaXMuX3NsaWRlclBvaW50ZXJEb3duTGlzdGVuZXIgPSBkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fc2xpZGVyLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuUE9JTlRFUl9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMCAmJiB0aGlzLl9sYXN0UmVuZGVyRGF0YSkge1xuXHRcdFx0XHR0aGlzLl9zdGFydFNsaWRlckRyYWdnaW5nKGUsIGUucGFnZVksIHRoaXMuX2xhc3RSZW5kZXJEYXRhLnJlbmRlcmVkTGF5b3V0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2dlc3R1cmVEaXNwb3NhYmxlID0gR2VzdHVyZS5hZGRUYXJnZXQodGhpcy5fZG9tTm9kZS5kb21Ob2RlKTtcblx0XHR0aGlzLl9zbGlkZXJUb3VjaFN0YXJ0TGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUuZG9tTm9kZSwgRXZlbnRUeXBlLlN0YXJ0LCAoZTogR2VzdHVyZUV2ZW50KSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aWYgKHRoaXMuX2xhc3RSZW5kZXJEYXRhKSB7XG5cdFx0XHRcdHRoaXMuX3NsaWRlci50b2dnbGVDbGFzc05hbWUoJ2FjdGl2ZScsIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9nZXN0dXJlSW5Qcm9ncmVzcyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsRHVlVG9Ub3VjaEV2ZW50KGUpO1xuXHRcdFx0fVxuXHRcdH0sIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG5cblx0XHR0aGlzLl9zbGlkZXJUb3VjaE1vdmVMaXN0ZW5lciA9IGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZS5kb21Ob2RlLCBFdmVudFR5cGUuQ2hhbmdlLCAoZTogR2VzdHVyZUV2ZW50KSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aWYgKHRoaXMuX2xhc3RSZW5kZXJEYXRhICYmIHRoaXMuX2dlc3R1cmVJblByb2dyZXNzKSB7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsRHVlVG9Ub3VjaEV2ZW50KGUpO1xuXHRcdFx0fVxuXHRcdH0sIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG5cblx0XHR0aGlzLl9zbGlkZXJUb3VjaEVuZExpc3RlbmVyID0gZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUuZG9tTm9kZSwgRXZlbnRUeXBlLkVuZCwgKGU6IEdlc3R1cmVFdmVudCkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX2dlc3R1cmVJblByb2dyZXNzID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9zbGlkZXIudG9nZ2xlQ2xhc3NOYW1lKCdhY3RpdmUnLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlU29vbigpIHtcblx0XHR0aGlzLl9oaWRlRGVsYXllZFNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR0aGlzLl9oaWRlRGVsYXllZFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZUltbWVkaWF0ZWx5SWZNb3VzZUlzT3V0c2lkZSgpIHtcblx0XHRpZiAodGhpcy5faXNNb3VzZU92ZXJNaW5pbWFwKSB7XG5cdFx0XHR0aGlzLl9oaWRlU29vbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kb21Ob2RlLnRvZ2dsZUNsYXNzTmFtZSgnYWN0aXZlJywgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRTbGlkZXJEcmFnZ2luZyhlOiBQb2ludGVyRXZlbnQsIGluaXRpYWxQb3NZOiBudW1iZXIsIGluaXRpYWxTbGlkZXJTdGF0ZTogTWluaW1hcExheW91dCk6IHZvaWQge1xuXHRcdGlmICghZS50YXJnZXQgfHwgIShlLnRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluaXRpYWxQb3NYID0gZS5wYWdlWDtcblxuXHRcdHRoaXMuX3NsaWRlci50b2dnbGVDbGFzc05hbWUoJ2FjdGl2ZScsIHRydWUpO1xuXG5cdFx0Y29uc3QgaGFuZGxlUG9pbnRlck1vdmUgPSAocG9zeTogbnVtYmVyLCBwb3N4OiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IG1pbmltYXBQb3NpdGlvbiA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuX2RvbU5vZGUuZG9tTm9kZSk7XG5cdFx0XHRjb25zdCBwb2ludGVyT3J0aG9nb25hbERlbHRhID0gTWF0aC5taW4oXG5cdFx0XHRcdE1hdGguYWJzKHBvc3ggLSBpbml0aWFsUG9zWCksXG5cdFx0XHRcdE1hdGguYWJzKHBvc3ggLSBtaW5pbWFwUG9zaXRpb24ubGVmdCksXG5cdFx0XHRcdE1hdGguYWJzKHBvc3ggLSBtaW5pbWFwUG9zaXRpb24ubGVmdCAtIG1pbmltYXBQb3NpdGlvbi53aWR0aClcblx0XHRcdCk7XG5cblx0XHRcdGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MgJiYgcG9pbnRlck9ydGhvZ29uYWxEZWx0YSA+IFBPSU5URVJfRFJBR19SRVNFVF9ESVNUQU5DRSkge1xuXHRcdFx0XHQvLyBUaGUgcG9pbnRlciBoYXMgd29uZGVyZWQgYXdheSBmcm9tIHRoZSBzY3JvbGxiYXIgPT4gcmVzZXQgZHJhZ2dpbmdcblx0XHRcdFx0dGhpcy5fbW9kZWwuc2V0U2Nyb2xsVG9wKGluaXRpYWxTbGlkZXJTdGF0ZS5zY3JvbGxUb3ApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBvaW50ZXJEZWx0YSA9IHBvc3kgLSBpbml0aWFsUG9zWTtcblx0XHRcdHRoaXMuX21vZGVsLnNldFNjcm9sbFRvcChpbml0aWFsU2xpZGVyU3RhdGUuZ2V0RGVzaXJlZFNjcm9sbFRvcEZyb21EZWx0YShwb2ludGVyRGVsdGEpKTtcblx0XHR9O1xuXG5cdFx0aWYgKGUucGFnZVkgIT09IGluaXRpYWxQb3NZKSB7XG5cdFx0XHRoYW5kbGVQb2ludGVyTW92ZShlLnBhZ2VZLCBpbml0aWFsUG9zWCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2xpZGVyUG9pbnRlck1vdmVNb25pdG9yLnN0YXJ0TW9uaXRvcmluZyhcblx0XHRcdGUudGFyZ2V0LFxuXHRcdFx0ZS5wb2ludGVySWQsXG5cdFx0XHRlLmJ1dHRvbnMsXG5cdFx0XHRwb2ludGVyTW92ZURhdGEgPT4gaGFuZGxlUG9pbnRlck1vdmUocG9pbnRlck1vdmVEYXRhLnBhZ2VZLCBwb2ludGVyTW92ZURhdGEucGFnZVgpLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zbGlkZXIudG9nZ2xlQ2xhc3NOYW1lKCdhY3RpdmUnLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgc2Nyb2xsRHVlVG9Ub3VjaEV2ZW50KHRvdWNoOiBHZXN0dXJlRXZlbnQpIHtcblx0XHRjb25zdCBzdGFydFkgPSB0aGlzLl9kb21Ob2RlLmRvbU5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuX2xhc3RSZW5kZXJEYXRhIS5yZW5kZXJlZExheW91dC5nZXREZXNpcmVkU2Nyb2xsVG9wRnJvbVRvdWNoTG9jYXRpb24odG91Y2gucGFnZVkgLSBzdGFydFkpO1xuXHRcdHRoaXMuX21vZGVsLnNldFNjcm9sbFRvcChzY3JvbGxUb3ApO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcG9pbnRlckRvd25MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc2xpZGVyUG9pbnRlck1vdmVNb25pdG9yLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zbGlkZXJQb2ludGVyRG93bkxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9nZXN0dXJlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc2xpZGVyVG91Y2hTdGFydExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zbGlkZXJUb3VjaE1vdmVMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc2xpZGVyVG91Y2hFbmRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TWluaW1hcERvbU5vZGVDbGFzc05hbWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjbGFzc18gPSBbJ21pbmltYXAnXTtcblx0XHRpZiAodGhpcy5fbW9kZWwub3B0aW9ucy5zaG93U2xpZGVyID09PSAnYWx3YXlzJykge1xuXHRcdFx0Y2xhc3NfLnB1c2goJ3NsaWRlci1hbHdheXMnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2xhc3NfLnB1c2goJ3NsaWRlci1tb3VzZW92ZXInKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbW9kZWwub3B0aW9ucy5hdXRvaGlkZSA9PT0gJ21vdXNlb3ZlcicpIHtcblx0XHRcdGNsYXNzXy5wdXNoKCdtaW5pbWFwLWF1dG9oaWRlLW1vdXNlb3ZlcicpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fbW9kZWwub3B0aW9ucy5hdXRvaGlkZSA9PT0gJ3Njcm9sbCcpIHtcblx0XHRcdGNsYXNzXy5wdXNoKCdtaW5pbWFwLWF1dG9oaWRlLXNjcm9sbCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjbGFzc18uam9pbignICcpO1xuXHR9XG5cblx0cHVibGljIGdldERvbU5vZGUoKTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5TGF5b3V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0TGVmdCh0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBMZWZ0KTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldFdpZHRoKHRoaXMuX21vZGVsLm9wdGlvbnMubWluaW1hcFdpZHRoKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEhlaWdodCh0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBIZWlnaHQpO1xuXHRcdHRoaXMuX3NoYWRvdy5zZXRIZWlnaHQodGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwSGVpZ2h0KTtcblxuXHRcdHRoaXMuX2NhbnZhcy5zZXRXaWR0aCh0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc091dGVyV2lkdGgpO1xuXHRcdHRoaXMuX2NhbnZhcy5zZXRIZWlnaHQodGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNPdXRlckhlaWdodCk7XG5cdFx0dGhpcy5fY2FudmFzLmRvbU5vZGUud2lkdGggPSB0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc0lubmVyV2lkdGg7XG5cdFx0dGhpcy5fY2FudmFzLmRvbU5vZGUuaGVpZ2h0ID0gdGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNJbm5lckhlaWdodDtcblxuXHRcdHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLnNldFdpZHRoKHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzT3V0ZXJXaWR0aCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNDYW52YXMuc2V0SGVpZ2h0KHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzT3V0ZXJIZWlnaHQpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLmRvbU5vZGUud2lkdGggPSB0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc0lubmVyV2lkdGg7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNDYW52YXMuZG9tTm9kZS5oZWlnaHQgPSB0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc0lubmVySGVpZ2h0O1xuXG5cdFx0dGhpcy5fc2xpZGVyLnNldFdpZHRoKHRoaXMuX21vZGVsLm9wdGlvbnMubWluaW1hcFdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEJ1ZmZlcigpOiBJbWFnZURhdGEgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2J1ZmZlcnMpIHtcblx0XHRcdGlmICh0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc0lubmVyV2lkdGggPiAwICYmIHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzSW5uZXJIZWlnaHQgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2J1ZmZlcnMgPSBuZXcgTWluaW1hcEJ1ZmZlcnMoXG5cdFx0XHRcdFx0dGhpcy5fY2FudmFzLmRvbU5vZGUuZ2V0Q29udGV4dCgnMmQnKSEsXG5cdFx0XHRcdFx0dGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNJbm5lcldpZHRoLFxuXHRcdFx0XHRcdHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzSW5uZXJIZWlnaHQsXG5cdFx0XHRcdFx0dGhpcy5fbW9kZWwub3B0aW9ucy5iYWNrZ3JvdW5kQ29sb3Jcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlcnMgPyB0aGlzLl9idWZmZXJzLmdldEJ1ZmZlcigpIDogbnVsbDtcblx0fVxuXG5cdC8vIC0tLS0gYmVnaW4gdmlldyBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBvbkRpZENoYW5nZU9wdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdFJlbmRlckRhdGEgPSBudWxsO1xuXHRcdHRoaXMuX2J1ZmZlcnMgPSBudWxsO1xuXHRcdHRoaXMuX2FwcGx5TGF5b3V0KCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRDbGFzc05hbWUodGhpcy5fZ2V0TWluaW1hcERvbU5vZGVDbGFzc05hbWUoKSk7XG5cdH1cblx0cHVibGljIG9uU2VsZWN0aW9uQ2hhbmdlZCgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9yZW5kZXJEZWNvcmF0aW9ucyA9IHRydWU7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3JlbmRlckRlY29yYXRpb25zID0gdHJ1ZTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb25GbHVzaGVkKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJEYXRhID0gbnVsbDtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb25MaW5lc0NoYW5nZWQoY2hhbmdlRnJvbUxpbmVOdW1iZXI6IG51bWJlciwgY2hhbmdlQ291bnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9sYXN0UmVuZGVyRGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xhc3RSZW5kZXJEYXRhLm9uTGluZXNDaGFuZ2VkKGNoYW5nZUZyb21MaW5lTnVtYmVyLCBjaGFuZ2VDb3VudCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb25MaW5lc0RlbGV0ZWQoZGVsZXRlRnJvbUxpbmVOdW1iZXI6IG51bWJlciwgZGVsZXRlVG9MaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHR0aGlzLl9sYXN0UmVuZGVyRGF0YT8ub25MaW5lc0RlbGV0ZWQoZGVsZXRlRnJvbUxpbmVOdW1iZXIsIGRlbGV0ZVRvTGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG9uTGluZXNJbnNlcnRlZChpbnNlcnRGcm9tTGluZU51bWJlcjogbnVtYmVyLCBpbnNlcnRUb0xpbmVOdW1iZXI6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJEYXRhPy5vbkxpbmVzSW5zZXJ0ZWQoaW5zZXJ0RnJvbUxpbmVOdW1iZXIsIGluc2VydFRvTGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG9uU2Nyb2xsQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fbW9kZWwub3B0aW9ucy5hdXRvaGlkZSA9PT0gJ3Njcm9sbCcgJiYgKGUuc2Nyb2xsVG9wQ2hhbmdlZCB8fCBlLnNjcm9sbEhlaWdodENoYW5nZWQpKSB7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLnRvZ2dsZUNsYXNzTmFtZSgnYWN0aXZlJywgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9oaWRlU29vbigpO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJEZWNvcmF0aW9ucyA9IHRydWU7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG9uVGhlbWVDaGFuZ2VkKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3NlbGVjdGlvbkNvbG9yID0gdGhpcy5fdGhlbWUuZ2V0Q29sb3IobWluaW1hcFNlbGVjdGlvbik7XG5cdFx0dGhpcy5fcmVuZGVyRGVjb3JhdGlvbnMgPSB0cnVlO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvblRva2Vuc0NoYW5nZWQocmFuZ2VzOiB7IGZyb21MaW5lTnVtYmVyOiBudW1iZXI7IHRvTGluZU51bWJlcjogbnVtYmVyIH1bXSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9sYXN0UmVuZGVyRGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xhc3RSZW5kZXJEYXRhLm9uVG9rZW5zQ2hhbmdlZChyYW5nZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG9uVG9rZW5zQ29sb3JzQ2hhbmdlZCgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9sYXN0UmVuZGVyRGF0YSA9IG51bGw7XG5cdFx0dGhpcy5fYnVmZmVycyA9IG51bGw7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG9uWm9uZXNDaGFuZ2VkKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJEYXRhID0gbnVsbDtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIC0tLSBlbmQgZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgcmVuZGVyKHJlbmRlcmluZ0N0eDogSU1pbmltYXBSZW5kZXJpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVuZGVyTWluaW1hcCA9IHRoaXMuX21vZGVsLm9wdGlvbnMucmVuZGVyTWluaW1hcDtcblx0XHRpZiAocmVuZGVyTWluaW1hcCA9PT0gUmVuZGVyTWluaW1hcC5Ob25lKSB7XG5cdFx0XHR0aGlzLl9zaGFkb3cuc2V0Q2xhc3NOYW1lKCdtaW5pbWFwLXNoYWRvdy1oaWRkZW4nKTtcblx0XHRcdHRoaXMuX3NsaWRlckhvcml6b250YWwuc2V0V2lkdGgoMCk7XG5cdFx0XHR0aGlzLl9zbGlkZXJIb3Jpem9udGFsLnNldEhlaWdodCgwKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHJlbmRlcmluZ0N0eC5zY3JvbGxMZWZ0ICsgcmVuZGVyaW5nQ3R4LnZpZXdwb3J0V2lkdGggPj0gcmVuZGVyaW5nQ3R4LnNjcm9sbFdpZHRoKSB7XG5cdFx0XHR0aGlzLl9zaGFkb3cuc2V0Q2xhc3NOYW1lKCdtaW5pbWFwLXNoYWRvdy1oaWRkZW4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2hhZG93LnNldENsYXNzTmFtZSgnbWluaW1hcC1zaGFkb3ctdmlzaWJsZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxheW91dCA9IE1pbmltYXBMYXlvdXQuY3JlYXRlKFxuXHRcdFx0dGhpcy5fbW9kZWwub3B0aW9ucyxcblx0XHRcdHJlbmRlcmluZ0N0eC52aWV3cG9ydFN0YXJ0TGluZU51bWJlcixcblx0XHRcdHJlbmRlcmluZ0N0eC52aWV3cG9ydEVuZExpbmVOdW1iZXIsXG5cdFx0XHRyZW5kZXJpbmdDdHgudmlld3BvcnRTdGFydExpbmVOdW1iZXJWZXJ0aWNhbE9mZnNldCxcblx0XHRcdHJlbmRlcmluZ0N0eC52aWV3cG9ydEhlaWdodCxcblx0XHRcdHJlbmRlcmluZ0N0eC52aWV3cG9ydENvbnRhaW5zV2hpdGVzcGFjZUdhcHMsXG5cdFx0XHR0aGlzLl9tb2RlbC5nZXRMaW5lQ291bnQoKSxcblx0XHRcdHRoaXMuX21vZGVsLmdldFJlYWxMaW5lQ291bnQoKSxcblx0XHRcdHJlbmRlcmluZ0N0eC5zY3JvbGxUb3AsXG5cdFx0XHRyZW5kZXJpbmdDdHguc2Nyb2xsSGVpZ2h0LFxuXHRcdFx0dGhpcy5fbGFzdFJlbmRlckRhdGEgPyB0aGlzLl9sYXN0UmVuZGVyRGF0YS5yZW5kZXJlZExheW91dCA6IG51bGxcblx0XHQpO1xuXHRcdHRoaXMuX3NsaWRlci5zZXREaXNwbGF5KGxheW91dC5zbGlkZXJOZWVkZWQgPyAnYmxvY2snIDogJ25vbmUnKTtcblx0XHR0aGlzLl9zbGlkZXIuc2V0VG9wKGxheW91dC5zbGlkZXJUb3ApO1xuXHRcdHRoaXMuX3NsaWRlci5zZXRIZWlnaHQobGF5b3V0LnNsaWRlckhlaWdodCk7XG5cblx0XHQvLyBDb21wdXRlIGhvcml6b250YWwgc2xpZGVyIGNvb3JkaW5hdGVzXG5cdFx0dGhpcy5fc2xpZGVySG9yaXpvbnRhbC5zZXRMZWZ0KDApO1xuXHRcdHRoaXMuX3NsaWRlckhvcml6b250YWwuc2V0V2lkdGgodGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwV2lkdGgpO1xuXHRcdHRoaXMuX3NsaWRlckhvcml6b250YWwuc2V0VG9wKDApO1xuXHRcdHRoaXMuX3NsaWRlckhvcml6b250YWwuc2V0SGVpZ2h0KGxheW91dC5zbGlkZXJIZWlnaHQpO1xuXG5cdFx0dGhpcy5yZW5kZXJEZWNvcmF0aW9ucyhsYXlvdXQpO1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJEYXRhID0gdGhpcy5yZW5kZXJMaW5lcyhsYXlvdXQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJEZWNvcmF0aW9ucyhsYXlvdXQ6IE1pbmltYXBMYXlvdXQpIHtcblx0XHRpZiAodGhpcy5fcmVuZGVyRGVjb3JhdGlvbnMpIHtcblx0XHRcdHRoaXMuX3JlbmRlckRlY29yYXRpb25zID0gZmFsc2U7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fbW9kZWwuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0c2VsZWN0aW9ucy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cblx0XHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5fbW9kZWwuZ2V0TWluaW1hcERlY29yYXRpb25zSW5WaWV3cG9ydChsYXlvdXQuc3RhcnRMaW5lTnVtYmVyLCBsYXlvdXQuZW5kTGluZU51bWJlcik7XG5cdFx0XHRkZWNvcmF0aW9ucy5zb3J0KChhLCBiKSA9PiAoYS5vcHRpb25zLnpJbmRleCB8fCAwKSAtIChiLm9wdGlvbnMuekluZGV4IHx8IDApKTtcblxuXHRcdFx0Y29uc3QgeyBjYW52YXNJbm5lcldpZHRoLCBjYW52YXNJbm5lckhlaWdodCB9ID0gdGhpcy5fbW9kZWwub3B0aW9ucztcblx0XHRcdGNvbnN0IG1pbmltYXBMaW5lSGVpZ2h0ID0gdGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwTGluZUhlaWdodDtcblx0XHRcdGNvbnN0IG1pbmltYXBDaGFyV2lkdGggPSB0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBDaGFyV2lkdGg7XG5cdFx0XHRjb25zdCB0YWJTaXplID0gdGhpcy5fbW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemU7XG5cdFx0XHRjb25zdCBjYW52YXNDb250ZXh0ID0gdGhpcy5fZGVjb3JhdGlvbnNDYW52YXMuZG9tTm9kZS5nZXRDb250ZXh0KCcyZCcpITtcblxuXHRcdFx0Y2FudmFzQ29udGV4dC5jbGVhclJlY3QoMCwgMCwgY2FudmFzSW5uZXJXaWR0aCwgY2FudmFzSW5uZXJIZWlnaHQpO1xuXG5cdFx0XHQvLyBXZSBmaXJzdCBuZWVkIHRvIHJlbmRlciBsaW5lIGhpZ2hsaWdodHMgYW5kIHRoZW4gcmVuZGVyIGRlY29yYXRpb25zIG9uIHRvcCBvZiB0aG9zZS5cblx0XHRcdC8vIEJ1dCB3ZSBuZWVkIHRvIHBpY2sgYSBzaW5nbGUgY29sb3IgZm9yIGVhY2ggbGluZSwgYW5kIHVzZSB0aGF0IGFzIGEgbGluZSBoaWdobGlnaHQuXG5cdFx0XHQvLyBUaGlzIG5lZWRzIHRvIGJlIHRoZSBjb2xvciBvZiB0aGUgZGVjb3JhdGlvbiB3aXRoIHRoZSBoaWdoZXN0IGB6SW5kZXhgLCBidXQgcHJpb3JpdHlcblx0XHRcdC8vIGlzIGdpdmVuIHRvIHRoZSBzZWxlY3Rpb24uXG5cblx0XHRcdGNvbnN0IGhpZ2hsaWdodGVkTGluZXMgPSBuZXcgQ29udGlndW91c0xpbmVNYXA8Ym9vbGVhbj4obGF5b3V0LnN0YXJ0TGluZU51bWJlciwgbGF5b3V0LmVuZExpbmVOdW1iZXIsIGZhbHNlKTtcblx0XHRcdHRoaXMuX3JlbmRlclNlbGVjdGlvbkxpbmVIaWdobGlnaHRzKGNhbnZhc0NvbnRleHQsIHNlbGVjdGlvbnMsIGhpZ2hsaWdodGVkTGluZXMsIGxheW91dCwgbWluaW1hcExpbmVIZWlnaHQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyRGVjb3JhdGlvbnNMaW5lSGlnaGxpZ2h0cyhjYW52YXNDb250ZXh0LCBkZWNvcmF0aW9ucywgaGlnaGxpZ2h0ZWRMaW5lcywgbGF5b3V0LCBtaW5pbWFwTGluZUhlaWdodCk7XG5cblx0XHRcdGNvbnN0IGxpbmVPZmZzZXRNYXAgPSBuZXcgQ29udGlndW91c0xpbmVNYXA8bnVtYmVyW10gfCBudWxsPihsYXlvdXQuc3RhcnRMaW5lTnVtYmVyLCBsYXlvdXQuZW5kTGluZU51bWJlciwgbnVsbCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJTZWxlY3Rpb25zSGlnaGxpZ2h0cyhjYW52YXNDb250ZXh0LCBzZWxlY3Rpb25zLCBsaW5lT2Zmc2V0TWFwLCBsYXlvdXQsIG1pbmltYXBMaW5lSGVpZ2h0LCB0YWJTaXplLCBtaW5pbWFwQ2hhcldpZHRoLCBjYW52YXNJbm5lcldpZHRoKTtcblx0XHRcdHRoaXMuX3JlbmRlckRlY29yYXRpb25zSGlnaGxpZ2h0cyhjYW52YXNDb250ZXh0LCBkZWNvcmF0aW9ucywgbGluZU9mZnNldE1hcCwgbGF5b3V0LCBtaW5pbWFwTGluZUhlaWdodCwgdGFiU2l6ZSwgbWluaW1hcENoYXJXaWR0aCwgY2FudmFzSW5uZXJXaWR0aCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJTZWN0aW9uSGVhZGVycyhsYXlvdXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclNlbGVjdGlvbkxpbmVIaWdobGlnaHRzKFxuXHRcdGNhbnZhc0NvbnRleHQ6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcblx0XHRzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSxcblx0XHRoaWdobGlnaHRlZExpbmVzOiBDb250aWd1b3VzTGluZU1hcDxib29sZWFuPixcblx0XHRsYXlvdXQ6IE1pbmltYXBMYXlvdXQsXG5cdFx0bWluaW1hcExpbmVIZWlnaHQ6IG51bWJlclxuXHQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkNvbG9yIHx8IHRoaXMuX3NlbGVjdGlvbkNvbG9yLmlzVHJhbnNwYXJlbnQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNhbnZhc0NvbnRleHQuZmlsbFN0eWxlID0gdGhpcy5fc2VsZWN0aW9uQ29sb3IudHJhbnNwYXJlbnQoMC41KS50b1N0cmluZygpO1xuXG5cdFx0bGV0IHkxID0gMDtcblx0XHRsZXQgeTIgPSAwO1xuXG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgaW50ZXJzZWN0aW9uID0gbGF5b3V0LmludGVyc2VjdFdpdGhWaWV3cG9ydChzZWxlY3Rpb24pO1xuXHRcdFx0aWYgKCFpbnRlcnNlY3Rpb24pIHtcblx0XHRcdFx0Ly8gZW50aXJlbHkgb3V0c2lkZSBtaW5pbWFwJ3Mgdmlld3BvcnRcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBbc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyXSA9IGludGVyc2VjdGlvbjtcblxuXHRcdFx0Zm9yIChsZXQgbGluZSA9IHN0YXJ0TGluZU51bWJlcjsgbGluZSA8PSBlbmRMaW5lTnVtYmVyOyBsaW5lKyspIHtcblx0XHRcdFx0aGlnaGxpZ2h0ZWRMaW5lcy5zZXQobGluZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHl5MSA9IGxheW91dC5nZXRZRm9yTGluZU51bWJlcihzdGFydExpbmVOdW1iZXIsIG1pbmltYXBMaW5lSGVpZ2h0KTtcblx0XHRcdGNvbnN0IHl5MiA9IGxheW91dC5nZXRZRm9yTGluZU51bWJlcihlbmRMaW5lTnVtYmVyLCBtaW5pbWFwTGluZUhlaWdodCk7XG5cblx0XHRcdGlmICh5MiA+PSB5eTEpIHtcblx0XHRcdFx0Ly8gbWVyZ2UgaW50byBwcmV2aW91c1xuXHRcdFx0XHR5MiA9IHl5Mjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh5MiA+IHkxKSB7XG5cdFx0XHRcdFx0Ly8gZmx1c2hcblx0XHRcdFx0XHRjYW52YXNDb250ZXh0LmZpbGxSZWN0KE1JTklNQVBfR1VUVEVSX1dJRFRILCB5MSwgY2FudmFzQ29udGV4dC5jYW52YXMud2lkdGgsIHkyIC0geTEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHkxID0geXkxO1xuXHRcdFx0XHR5MiA9IHl5Mjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoeTIgPiB5MSkge1xuXHRcdFx0Ly8gZmx1c2hcblx0XHRcdGNhbnZhc0NvbnRleHQuZmlsbFJlY3QoTUlOSU1BUF9HVVRURVJfV0lEVEgsIHkxLCBjYW52YXNDb250ZXh0LmNhbnZhcy53aWR0aCwgeTIgLSB5MSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyRGVjb3JhdGlvbnNMaW5lSGlnaGxpZ2h0cyhcblx0XHRjYW52YXNDb250ZXh0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG5cdFx0ZGVjb3JhdGlvbnM6IFZpZXdNb2RlbERlY29yYXRpb25bXSxcblx0XHRoaWdobGlnaHRlZExpbmVzOiBDb250aWd1b3VzTGluZU1hcDxib29sZWFuPixcblx0XHRsYXlvdXQ6IE1pbmltYXBMYXlvdXQsXG5cdFx0bWluaW1hcExpbmVIZWlnaHQ6IG51bWJlclxuXHQpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGhpZ2hsaWdodENvbG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0XHQvLyBMb29wIGJhY2t3YXJkcyB0byBoaXQgZmlyc3QgZGVjb3JhdGlvbnMgd2l0aCBoaWdoZXIgYHpJbmRleGBcblx0XHRmb3IgKGxldCBpID0gZGVjb3JhdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGRlY29yYXRpb24gPSBkZWNvcmF0aW9uc1tpXTtcblxuXHRcdFx0Y29uc3QgbWluaW1hcE9wdGlvbnMgPSA8TW9kZWxEZWNvcmF0aW9uTWluaW1hcE9wdGlvbnMgfCBudWxsIHwgdW5kZWZpbmVkPmRlY29yYXRpb24ub3B0aW9ucy5taW5pbWFwO1xuXHRcdFx0aWYgKCFtaW5pbWFwT3B0aW9ucyB8fCBtaW5pbWFwT3B0aW9ucy5wb3NpdGlvbiAhPT0gTWluaW1hcFBvc2l0aW9uLklubGluZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW50ZXJzZWN0aW9uID0gbGF5b3V0LmludGVyc2VjdFdpdGhWaWV3cG9ydChkZWNvcmF0aW9uLnJhbmdlKTtcblx0XHRcdGlmICghaW50ZXJzZWN0aW9uKSB7XG5cdFx0XHRcdC8vIGVudGlyZWx5IG91dHNpZGUgbWluaW1hcCdzIHZpZXdwb3J0XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgW3N0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcl0gPSBpbnRlcnNlY3Rpb247XG5cblx0XHRcdGNvbnN0IGRlY29yYXRpb25Db2xvciA9IG1pbmltYXBPcHRpb25zLmdldENvbG9yKHRoaXMuX3RoZW1lLnZhbHVlKTtcblx0XHRcdGlmICghZGVjb3JhdGlvbkNvbG9yIHx8IGRlY29yYXRpb25Db2xvci5pc1RyYW5zcGFyZW50KCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBoaWdobGlnaHRDb2xvciA9IGhpZ2hsaWdodENvbG9ycy5nZXQoZGVjb3JhdGlvbkNvbG9yLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKCFoaWdobGlnaHRDb2xvcikge1xuXHRcdFx0XHRoaWdobGlnaHRDb2xvciA9IGRlY29yYXRpb25Db2xvci50cmFuc3BhcmVudCgwLjUpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGhpZ2hsaWdodENvbG9ycy5zZXQoZGVjb3JhdGlvbkNvbG9yLnRvU3RyaW5nKCksIGhpZ2hsaWdodENvbG9yKTtcblx0XHRcdH1cblxuXHRcdFx0Y2FudmFzQ29udGV4dC5maWxsU3R5bGUgPSBoaWdobGlnaHRDb2xvcjtcblx0XHRcdGZvciAobGV0IGxpbmUgPSBzdGFydExpbmVOdW1iZXI7IGxpbmUgPD0gZW5kTGluZU51bWJlcjsgbGluZSsrKSB7XG5cdFx0XHRcdGlmIChoaWdobGlnaHRlZExpbmVzLmhhcyhsaW5lKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhpZ2hsaWdodGVkTGluZXMuc2V0KGxpbmUsIHRydWUpO1xuXHRcdFx0XHRjb25zdCB5ID0gbGF5b3V0LmdldFlGb3JMaW5lTnVtYmVyKGxpbmUsIG1pbmltYXBMaW5lSGVpZ2h0KTtcblx0XHRcdFx0Y2FudmFzQ29udGV4dC5maWxsUmVjdChNSU5JTUFQX0dVVFRFUl9XSURUSCwgeSwgY2FudmFzQ29udGV4dC5jYW52YXMud2lkdGgsIG1pbmltYXBMaW5lSGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTZWxlY3Rpb25zSGlnaGxpZ2h0cyhcblx0XHRjYW52YXNDb250ZXh0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG5cdFx0c2VsZWN0aW9uczogU2VsZWN0aW9uW10sXG5cdFx0bGluZU9mZnNldE1hcDogQ29udGlndW91c0xpbmVNYXA8bnVtYmVyW10gfCBudWxsPixcblx0XHRsYXlvdXQ6IE1pbmltYXBMYXlvdXQsXG5cdFx0bGluZUhlaWdodDogbnVtYmVyLFxuXHRcdHRhYlNpemU6IG51bWJlcixcblx0XHRjaGFyYWN0ZXJXaWR0aDogbnVtYmVyLFxuXHRcdGNhbnZhc0lubmVyV2lkdGg6IG51bWJlclxuXHQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGlvbkNvbG9yIHx8IHRoaXMuX3NlbGVjdGlvbkNvbG9yLmlzVHJhbnNwYXJlbnQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRjb25zdCBpbnRlcnNlY3Rpb24gPSBsYXlvdXQuaW50ZXJzZWN0V2l0aFZpZXdwb3J0KHNlbGVjdGlvbik7XG5cdFx0XHRpZiAoIWludGVyc2VjdGlvbikge1xuXHRcdFx0XHQvLyBlbnRpcmVseSBvdXRzaWRlIG1pbmltYXAncyB2aWV3cG9ydFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IFtzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXJdID0gaW50ZXJzZWN0aW9uO1xuXG5cdFx0XHRmb3IgKGxldCBsaW5lID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lIDw9IGVuZExpbmVOdW1iZXI7IGxpbmUrKykge1xuXHRcdFx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25PbkxpbmUoY2FudmFzQ29udGV4dCwgbGluZU9mZnNldE1hcCwgc2VsZWN0aW9uLCB0aGlzLl9zZWxlY3Rpb25Db2xvciwgbGF5b3V0LCBsaW5lLCBsaW5lSGVpZ2h0LCBsaW5lSGVpZ2h0LCB0YWJTaXplLCBjaGFyYWN0ZXJXaWR0aCwgY2FudmFzSW5uZXJXaWR0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyRGVjb3JhdGlvbnNIaWdobGlnaHRzKFxuXHRcdGNhbnZhc0NvbnRleHQ6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcblx0XHRkZWNvcmF0aW9uczogVmlld01vZGVsRGVjb3JhdGlvbltdLFxuXHRcdGxpbmVPZmZzZXRNYXA6IENvbnRpZ3VvdXNMaW5lTWFwPG51bWJlcltdIHwgbnVsbD4sXG5cdFx0bGF5b3V0OiBNaW5pbWFwTGF5b3V0LFxuXHRcdG1pbmltYXBMaW5lSGVpZ2h0OiBudW1iZXIsXG5cdFx0dGFiU2l6ZTogbnVtYmVyLFxuXHRcdGNoYXJhY3RlcldpZHRoOiBudW1iZXIsXG5cdFx0Y2FudmFzSW5uZXJXaWR0aDogbnVtYmVyXG5cdCk6IHZvaWQge1xuXHRcdC8vIExvb3AgZm9yd2FyZHMgdG8gaGl0IGZpcnN0IGRlY29yYXRpb25zIHdpdGggbG93ZXIgYHpJbmRleGBcblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblxuXHRcdFx0Y29uc3QgbWluaW1hcE9wdGlvbnMgPSA8TW9kZWxEZWNvcmF0aW9uTWluaW1hcE9wdGlvbnMgfCBudWxsIHwgdW5kZWZpbmVkPmRlY29yYXRpb24ub3B0aW9ucy5taW5pbWFwO1xuXHRcdFx0aWYgKCFtaW5pbWFwT3B0aW9ucykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW50ZXJzZWN0aW9uID0gbGF5b3V0LmludGVyc2VjdFdpdGhWaWV3cG9ydChkZWNvcmF0aW9uLnJhbmdlKTtcblx0XHRcdGlmICghaW50ZXJzZWN0aW9uKSB7XG5cdFx0XHRcdC8vIGVudGlyZWx5IG91dHNpZGUgbWluaW1hcCdzIHZpZXdwb3J0XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgW3N0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcl0gPSBpbnRlcnNlY3Rpb247XG5cblx0XHRcdGNvbnN0IGRlY29yYXRpb25Db2xvciA9IG1pbmltYXBPcHRpb25zLmdldENvbG9yKHRoaXMuX3RoZW1lLnZhbHVlKTtcblx0XHRcdGlmICghZGVjb3JhdGlvbkNvbG9yIHx8IGRlY29yYXRpb25Db2xvci5pc1RyYW5zcGFyZW50KCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGxpbmUgPSBzdGFydExpbmVOdW1iZXI7IGxpbmUgPD0gZW5kTGluZU51bWJlcjsgbGluZSsrKSB7XG5cdFx0XHRcdHN3aXRjaCAobWluaW1hcE9wdGlvbnMucG9zaXRpb24pIHtcblxuXHRcdFx0XHRcdGNhc2UgTWluaW1hcFBvc2l0aW9uLklubGluZTpcblx0XHRcdFx0XHRcdHRoaXMucmVuZGVyRGVjb3JhdGlvbk9uTGluZShjYW52YXNDb250ZXh0LCBsaW5lT2Zmc2V0TWFwLCBkZWNvcmF0aW9uLnJhbmdlLCBkZWNvcmF0aW9uQ29sb3IsIGxheW91dCwgbGluZSwgbWluaW1hcExpbmVIZWlnaHQsIG1pbmltYXBMaW5lSGVpZ2h0LCB0YWJTaXplLCBjaGFyYWN0ZXJXaWR0aCwgY2FudmFzSW5uZXJXaWR0aCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblxuXHRcdFx0XHRcdGNhc2UgTWluaW1hcFBvc2l0aW9uLkd1dHRlcjoge1xuXHRcdFx0XHRcdFx0Y29uc3QgeSA9IGxheW91dC5nZXRZRm9yTGluZU51bWJlcihsaW5lLCBtaW5pbWFwTGluZUhlaWdodCk7XG5cdFx0XHRcdFx0XHRjb25zdCB4ID0gMjtcblx0XHRcdFx0XHRcdHRoaXMucmVuZGVyRGVjb3JhdGlvbihjYW52YXNDb250ZXh0LCBkZWNvcmF0aW9uQ29sb3IsIHgsIHksIEdVVFRFUl9ERUNPUkFUSU9OX1dJRFRILCBtaW5pbWFwTGluZUhlaWdodCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRlY29yYXRpb25PbkxpbmUoXG5cdFx0Y2FudmFzQ29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuXHRcdGxpbmVPZmZzZXRNYXA6IENvbnRpZ3VvdXNMaW5lTWFwPG51bWJlcltdIHwgbnVsbD4sXG5cdFx0ZGVjb3JhdGlvblJhbmdlOiBSYW5nZSxcblx0XHRkZWNvcmF0aW9uQ29sb3I6IENvbG9yIHwgdW5kZWZpbmVkLFxuXHRcdGxheW91dDogTWluaW1hcExheW91dCxcblx0XHRsaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0aGVpZ2h0OiBudW1iZXIsXG5cdFx0bWluaW1hcExpbmVIZWlnaHQ6IG51bWJlcixcblx0XHR0YWJTaXplOiBudW1iZXIsXG5cdFx0Y2hhcldpZHRoOiBudW1iZXIsXG5cdFx0Y2FudmFzSW5uZXJXaWR0aDogbnVtYmVyXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHkgPSBsYXlvdXQuZ2V0WUZvckxpbmVOdW1iZXIobGluZU51bWJlciwgbWluaW1hcExpbmVIZWlnaHQpO1xuXG5cdFx0Ly8gU2tpcCByZW5kZXJpbmcgdGhlIGxpbmUgaWYgaXQncyB2ZXJ0aWNhbGx5IG91dHNpZGUgb3VyIHZpZXdwb3J0XG5cdFx0aWYgKHkgKyBoZWlnaHQgPCAwIHx8IHkgPiB0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc0lubmVySGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIgfSA9IGRlY29yYXRpb25SYW5nZTtcblx0XHRjb25zdCBzdGFydENvbHVtbiA9IChzdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIgPyBkZWNvcmF0aW9uUmFuZ2Uuc3RhcnRDb2x1bW4gOiAxKTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSAoZW5kTGluZU51bWJlciA9PT0gbGluZU51bWJlciA/IGRlY29yYXRpb25SYW5nZS5lbmRDb2x1bW4gOiB0aGlzLl9tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblxuXHRcdGNvbnN0IHgxID0gdGhpcy5nZXRYT2Zmc2V0Rm9yUG9zaXRpb24obGluZU9mZnNldE1hcCwgbGluZU51bWJlciwgc3RhcnRDb2x1bW4sIHRhYlNpemUsIGNoYXJXaWR0aCwgY2FudmFzSW5uZXJXaWR0aCk7XG5cdFx0Y29uc3QgeDIgPSB0aGlzLmdldFhPZmZzZXRGb3JQb3NpdGlvbihsaW5lT2Zmc2V0TWFwLCBsaW5lTnVtYmVyLCBlbmRDb2x1bW4sIHRhYlNpemUsIGNoYXJXaWR0aCwgY2FudmFzSW5uZXJXaWR0aCk7XG5cblx0XHR0aGlzLnJlbmRlckRlY29yYXRpb24oY2FudmFzQ29udGV4dCwgZGVjb3JhdGlvbkNvbG9yLCB4MSwgeSwgeDIgLSB4MSwgaGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0WE9mZnNldEZvclBvc2l0aW9uKFxuXHRcdGxpbmVPZmZzZXRNYXA6IENvbnRpZ3VvdXNMaW5lTWFwPG51bWJlcltdIHwgbnVsbD4sXG5cdFx0bGluZU51bWJlcjogbnVtYmVyLFxuXHRcdGNvbHVtbjogbnVtYmVyLFxuXHRcdHRhYlNpemU6IG51bWJlcixcblx0XHRjaGFyV2lkdGg6IG51bWJlcixcblx0XHRjYW52YXNJbm5lcldpZHRoOiBudW1iZXJcblx0KTogbnVtYmVyIHtcblx0XHRpZiAoY29sdW1uID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gTUlOSU1BUF9HVVRURVJfV0lEVEg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWluaW11bVhPZmZzZXQgPSAoY29sdW1uIC0gMSkgKiBjaGFyV2lkdGg7XG5cdFx0aWYgKG1pbmltdW1YT2Zmc2V0ID49IGNhbnZhc0lubmVyV2lkdGgpIHtcblx0XHRcdC8vIHRoZXJlIGlzIG5vIG5lZWQgdG8gbG9vayBhdCBhY3R1YWwgY2hhcmFjdGVycyxcblx0XHRcdC8vIGFzIHRoaXMgY29sdW1uIGlzIGNlcnRhaW5seSBhZnRlciB0aGUgbWluaW1hcCB3aWR0aFxuXHRcdFx0cmV0dXJuIGNhbnZhc0lubmVyV2lkdGg7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FjaGUgbGluZSBvZmZzZXQgZGF0YSBzbyB0aGF0IGl0IGlzIG9ubHkgcmVhZCBvbmNlIHBlciBsaW5lXG5cdFx0bGV0IGxpbmVJbmRleFRvWE9mZnNldCA9IGxpbmVPZmZzZXRNYXAuZ2V0KGxpbmVOdW1iZXIpO1xuXHRcdGlmICghbGluZUluZGV4VG9YT2Zmc2V0KSB7XG5cdFx0XHRjb25zdCBsaW5lRGF0YSA9IHRoaXMuX21vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0bGluZUluZGV4VG9YT2Zmc2V0ID0gW01JTklNQVBfR1VUVEVSX1dJRFRIXTtcblx0XHRcdGxldCBwcmV2eCA9IE1JTklNQVBfR1VUVEVSX1dJRFRIO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBsaW5lRGF0YS5sZW5ndGggKyAxOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lRGF0YS5jaGFyQ29kZUF0KGkgLSAxKTtcblx0XHRcdFx0Y29uc3QgZHggPSBjaGFyQ29kZSA9PT0gQ2hhckNvZGUuVGFiXG5cdFx0XHRcdFx0PyB0YWJTaXplICogY2hhcldpZHRoXG5cdFx0XHRcdFx0OiBzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKGNoYXJDb2RlKVxuXHRcdFx0XHRcdFx0PyAyICogY2hhcldpZHRoXG5cdFx0XHRcdFx0XHQ6IGNoYXJXaWR0aDtcblxuXHRcdFx0XHRjb25zdCB4ID0gcHJldnggKyBkeDtcblx0XHRcdFx0aWYgKHggPj0gY2FudmFzSW5uZXJXaWR0aCkge1xuXHRcdFx0XHRcdC8vIG5vIG5lZWQgdG8ga2VlcCBvbiBnb2luZywgYXMgd2UndmUgaGl0IHRoZSBjYW52YXMgd2lkdGhcblx0XHRcdFx0XHRsaW5lSW5kZXhUb1hPZmZzZXRbaV0gPSBjYW52YXNJbm5lcldpZHRoO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGluZUluZGV4VG9YT2Zmc2V0W2ldID0geDtcblx0XHRcdFx0cHJldnggPSB4O1xuXHRcdFx0fVxuXG5cdFx0XHRsaW5lT2Zmc2V0TWFwLnNldChsaW5lTnVtYmVyLCBsaW5lSW5kZXhUb1hPZmZzZXQpO1xuXHRcdH1cblxuXHRcdGlmIChjb2x1bW4gLSAxIDwgbGluZUluZGV4VG9YT2Zmc2V0Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGxpbmVJbmRleFRvWE9mZnNldFtjb2x1bW4gLSAxXTtcblx0XHR9XG5cdFx0Ly8gZ29lcyBvdmVyIHRoZSBjYW52YXMgd2lkdGhcblx0XHRyZXR1cm4gY2FudmFzSW5uZXJXaWR0aDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGVjb3JhdGlvbihjYW52YXNDb250ZXh0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGRlY29yYXRpb25Db2xvcjogQ29sb3IgfCB1bmRlZmluZWQsIHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuXHRcdGNhbnZhc0NvbnRleHQuZmlsbFN0eWxlID0gZGVjb3JhdGlvbkNvbG9yICYmIGRlY29yYXRpb25Db2xvci50b1N0cmluZygpIHx8ICcnO1xuXHRcdGNhbnZhc0NvbnRleHQuZmlsbFJlY3QoeCwgeSwgd2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTZWN0aW9uSGVhZGVycyhsYXlvdXQ6IE1pbmltYXBMYXlvdXQpIHtcblx0XHRjb25zdCBtaW5pbWFwTGluZUhlaWdodCA9IHRoaXMuX21vZGVsLm9wdGlvbnMubWluaW1hcExpbmVIZWlnaHQ7XG5cdFx0Y29uc3Qgc2VjdGlvbkhlYWRlckZvbnRTaXplID0gdGhpcy5fbW9kZWwub3B0aW9ucy5zZWN0aW9uSGVhZGVyRm9udFNpemU7XG5cdFx0Y29uc3Qgc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcgPSB0aGlzLl9tb2RlbC5vcHRpb25zLnNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nO1xuXHRcdGNvbnN0IGJhY2tncm91bmRGaWxsSGVpZ2h0ID0gc2VjdGlvbkhlYWRlckZvbnRTaXplICogMS41O1xuXHRcdGNvbnN0IHsgY2FudmFzSW5uZXJXaWR0aCB9ID0gdGhpcy5fbW9kZWwub3B0aW9ucztcblxuXHRcdGNvbnN0IGJhY2tncm91bmRDb2xvciA9IHRoaXMuX21vZGVsLm9wdGlvbnMuYmFja2dyb3VuZENvbG9yO1xuXHRcdGNvbnN0IGJhY2tncm91bmRGaWxsID0gYHJnYigke2JhY2tncm91bmRDb2xvci5yfSAke2JhY2tncm91bmRDb2xvci5nfSAke2JhY2tncm91bmRDb2xvci5ifSAvIC43KWA7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZENvbG9yID0gdGhpcy5fbW9kZWwub3B0aW9ucy5zZWN0aW9uSGVhZGVyRm9udENvbG9yO1xuXHRcdGNvbnN0IGZvcmVncm91bmRGaWxsID0gYHJnYigke2ZvcmVncm91bmRDb2xvci5yfSAke2ZvcmVncm91bmRDb2xvci5nfSAke2ZvcmVncm91bmRDb2xvci5ifSlgO1xuXHRcdGNvbnN0IHNlcGFyYXRvclN0cm9rZSA9IGZvcmVncm91bmRGaWxsO1xuXG5cdFx0Y29uc3QgY2FudmFzQ29udGV4dCA9IHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLmRvbU5vZGUuZ2V0Q29udGV4dCgnMmQnKSE7XG5cdFx0Y2FudmFzQ29udGV4dC5sZXR0ZXJTcGFjaW5nID0gc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcgKyAncHgnO1xuXHRcdGNhbnZhc0NvbnRleHQuZm9udCA9ICc1MDAgJyArIHNlY3Rpb25IZWFkZXJGb250U2l6ZSArICdweCAnICsgdGhpcy5fbW9kZWwub3B0aW9ucy5zZWN0aW9uSGVhZGVyRm9udEZhbWlseTtcblx0XHRjYW52YXNDb250ZXh0LnN0cm9rZVN0eWxlID0gc2VwYXJhdG9yU3Ryb2tlO1xuXHRcdGNhbnZhc0NvbnRleHQubGluZVdpZHRoID0gMC40O1xuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLl9tb2RlbC5nZXRTZWN0aW9uSGVhZGVyRGVjb3JhdGlvbnNJblZpZXdwb3J0KGxheW91dC5zdGFydExpbmVOdW1iZXIsIGxheW91dC5lbmRMaW5lTnVtYmVyKTtcblx0XHRkZWNvcmF0aW9ucy5zb3J0KChhLCBiKSA9PiBhLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIGIucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblxuXHRcdGNvbnN0IGZpdFdpZHRoID0gSW5uZXJNaW5pbWFwLl9maXRTZWN0aW9uSGVhZGVyLmJpbmQobnVsbCwgY2FudmFzQ29udGV4dCxcblx0XHRcdGNhbnZhc0lubmVyV2lkdGggLSBNSU5JTUFQX0dVVFRFUl9XSURUSCk7XG5cblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IHkgPSBsYXlvdXQuZ2V0WUZvckxpbmVOdW1iZXIoZGVjb3JhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIG1pbmltYXBMaW5lSGVpZ2h0KSArIHNlY3Rpb25IZWFkZXJGb250U2l6ZTtcblx0XHRcdGNvbnN0IGJhY2tncm91bmRGaWxsWSA9IHkgLSBzZWN0aW9uSGVhZGVyRm9udFNpemU7XG5cdFx0XHRjb25zdCBzZXBhcmF0b3JZID0gYmFja2dyb3VuZEZpbGxZICsgMjtcblx0XHRcdGNvbnN0IGhlYWRlclRleHQgPSB0aGlzLl9tb2RlbC5nZXRTZWN0aW9uSGVhZGVyVGV4dChkZWNvcmF0aW9uLCBmaXRXaWR0aCk7XG5cblx0XHRcdElubmVyTWluaW1hcC5fcmVuZGVyU2VjdGlvbkxhYmVsKFxuXHRcdFx0XHRjYW52YXNDb250ZXh0LFxuXHRcdFx0XHRoZWFkZXJUZXh0LFxuXHRcdFx0XHRkZWNvcmF0aW9uLm9wdGlvbnMubWluaW1hcD8uc2VjdGlvbkhlYWRlclN0eWxlID09PSBNaW5pbWFwU2VjdGlvbkhlYWRlclN0eWxlLlVuZGVybGluZWQsXG5cdFx0XHRcdGJhY2tncm91bmRGaWxsLFxuXHRcdFx0XHRmb3JlZ3JvdW5kRmlsbCxcblx0XHRcdFx0Y2FudmFzSW5uZXJXaWR0aCxcblx0XHRcdFx0YmFja2dyb3VuZEZpbGxZLFxuXHRcdFx0XHRiYWNrZ3JvdW5kRmlsbEhlaWdodCxcblx0XHRcdFx0eSxcblx0XHRcdFx0c2VwYXJhdG9yWSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpdFNlY3Rpb25IZWFkZXIoXG5cdFx0dGFyZ2V0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG5cdFx0bWF4V2lkdGg6IG51bWJlcixcblx0XHRoZWFkZXJUZXh0OiBzdHJpbmcsXG5cdCk6IHN0cmluZyB7XG5cdFx0aWYgKCFoZWFkZXJUZXh0KSB7XG5cdFx0XHRyZXR1cm4gaGVhZGVyVGV4dDtcblx0XHR9XG5cblx0XHRjb25zdCBlbGxpcHNpcyA9ICdcdTIwMjYnO1xuXHRcdGNvbnN0IHdpZHRoID0gdGFyZ2V0Lm1lYXN1cmVUZXh0KGhlYWRlclRleHQpLndpZHRoO1xuXHRcdGNvbnN0IGVsbGlwc2lzV2lkdGggPSB0YXJnZXQubWVhc3VyZVRleHQoZWxsaXBzaXMpLndpZHRoO1xuXG5cdFx0aWYgKHdpZHRoIDw9IG1heFdpZHRoIHx8IHdpZHRoIDw9IGVsbGlwc2lzV2lkdGgpIHtcblx0XHRcdHJldHVybiBoZWFkZXJUZXh0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGxlbiA9IGhlYWRlclRleHQubGVuZ3RoO1xuXHRcdGNvbnN0IGF2ZXJhZ2VDaGFyV2lkdGggPSB3aWR0aCAvIGhlYWRlclRleHQubGVuZ3RoO1xuXHRcdGNvbnN0IG1heENoYXJDb3VudCA9IE1hdGguZmxvb3IoKG1heFdpZHRoIC0gZWxsaXBzaXNXaWR0aCkgLyBhdmVyYWdlQ2hhcldpZHRoKSAtIDE7XG5cblx0XHQvLyBGaW5kIGEgaGFsZndheSBwb2ludCB0aGF0IGlzbid0IGFmdGVyIHdoaXRlc3BhY2Vcblx0XHRsZXQgaGFsZkNoYXJDb3VudCA9IE1hdGguY2VpbChtYXhDaGFyQ291bnQgLyAyKTtcblx0XHR3aGlsZSAoaGFsZkNoYXJDb3VudCA+IDAgJiYgL1xccy8udGVzdChoZWFkZXJUZXh0W2hhbGZDaGFyQ291bnQgLSAxXSkpIHtcblx0XHRcdC0taGFsZkNoYXJDb3VudDtcblx0XHR9XG5cblx0XHQvLyBTcGxpdCB3aXRoIGVsbGlwc2lzXG5cdFx0cmV0dXJuIGhlYWRlclRleHQuc3Vic3RyaW5nKDAsIGhhbGZDaGFyQ291bnQpXG5cdFx0XHQrIGVsbGlwc2lzICsgaGVhZGVyVGV4dC5zdWJzdHJpbmcobGVuIC0gKG1heENoYXJDb3VudCAtIGhhbGZDaGFyQ291bnQpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZW5kZXJTZWN0aW9uTGFiZWwoXG5cdFx0dGFyZ2V0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG5cdFx0aGVhZGVyVGV4dDogc3RyaW5nIHwgbnVsbCxcblx0XHRoYXNTZXBhcmF0b3JMaW5lOiBib29sZWFuLFxuXHRcdGJhY2tncm91bmRGaWxsOiBzdHJpbmcsXG5cdFx0Zm9yZWdyb3VuZEZpbGw6IHN0cmluZyxcblx0XHRtaW5pbWFwV2lkdGg6IG51bWJlcixcblx0XHRiYWNrZ3JvdW5kRmlsbFk6IG51bWJlcixcblx0XHRiYWNrZ3JvdW5kRmlsbEhlaWdodDogbnVtYmVyLFxuXHRcdHRleHRZOiBudW1iZXIsXG5cdFx0c2VwYXJhdG9yWTogbnVtYmVyXG5cdCk6IHZvaWQge1xuXHRcdGlmIChoZWFkZXJUZXh0KSB7XG5cdFx0XHR0YXJnZXQuZmlsbFN0eWxlID0gYmFja2dyb3VuZEZpbGw7XG5cdFx0XHR0YXJnZXQuZmlsbFJlY3QoMCwgYmFja2dyb3VuZEZpbGxZLCBtaW5pbWFwV2lkdGgsIGJhY2tncm91bmRGaWxsSGVpZ2h0KTtcblxuXHRcdFx0dGFyZ2V0LmZpbGxTdHlsZSA9IGZvcmVncm91bmRGaWxsO1xuXHRcdFx0dGFyZ2V0LmZpbGxUZXh0KGhlYWRlclRleHQsIE1JTklNQVBfR1VUVEVSX1dJRFRILCB0ZXh0WSk7XG5cdFx0fVxuXG5cdFx0aWYgKGhhc1NlcGFyYXRvckxpbmUpIHtcblx0XHRcdHRhcmdldC5iZWdpblBhdGgoKTtcblx0XHRcdHRhcmdldC5tb3ZlVG8oMCwgc2VwYXJhdG9yWSk7XG5cdFx0XHR0YXJnZXQubGluZVRvKG1pbmltYXBXaWR0aCwgc2VwYXJhdG9yWSk7XG5cdFx0XHR0YXJnZXQuY2xvc2VQYXRoKCk7XG5cdFx0XHR0YXJnZXQuc3Ryb2tlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJMaW5lcyhsYXlvdXQ6IE1pbmltYXBMYXlvdXQpOiBSZW5kZXJEYXRhIHwgbnVsbCB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gbGF5b3V0LnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gbGF5b3V0LmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgbWluaW1hcExpbmVIZWlnaHQgPSB0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBMaW5lSGVpZ2h0O1xuXG5cdFx0Ly8gQ2hlY2sgaWYgbm90aGluZyBjaGFuZ2VkIHcuci50LiBsaW5lcyBmcm9tIGxhc3QgZnJhbWVcblx0XHRpZiAodGhpcy5fbGFzdFJlbmRlckRhdGEgJiYgdGhpcy5fbGFzdFJlbmRlckRhdGEubGluZXNFcXVhbHMobGF5b3V0KSkge1xuXHRcdFx0Y29uc3QgX2xhc3REYXRhID0gdGhpcy5fbGFzdFJlbmRlckRhdGEuX2dldCgpO1xuXHRcdFx0Ly8gTmljZSEhIE5vdGhpbmcgY2hhbmdlZCBmcm9tIGxhc3QgZnJhbWVcblx0XHRcdHJldHVybiBuZXcgUmVuZGVyRGF0YShsYXlvdXQsIF9sYXN0RGF0YS5pbWFnZURhdGEsIF9sYXN0RGF0YS5saW5lcyk7XG5cdFx0fVxuXG5cdFx0Ly8gT2ggd2VsbCEhIFdlIG5lZWQgdG8gcmVwYWludCBzb21lIGxpbmVzLi4uXG5cblx0XHRjb25zdCBpbWFnZURhdGEgPSB0aGlzLl9nZXRCdWZmZXIoKTtcblx0XHRpZiAoIWltYWdlRGF0YSkge1xuXHRcdFx0Ly8gMCB3aWR0aCBvciAwIGhlaWdodCBjYW52YXMsIG5vdGhpbmcgdG8gZG9cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciB1bnRvdWNoZWQgbGluZXMgYnkgdXNpbmcgbGFzdCByZW5kZXJlZCBkYXRhLlxuXHRcdGNvbnN0IFtfZGlydHlZMSwgX2RpcnR5WTIsIG5lZWRlZF0gPSBJbm5lck1pbmltYXAuX3JlbmRlclVudG91Y2hlZExpbmVzKFxuXHRcdFx0aW1hZ2VEYXRhLFxuXHRcdFx0bGF5b3V0LnRvcFBhZGRpbmdMaW5lQ291bnQsXG5cdFx0XHRzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRlbmRMaW5lTnVtYmVyLFxuXHRcdFx0bWluaW1hcExpbmVIZWlnaHQsXG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyRGF0YVxuXHRcdCk7XG5cblx0XHQvLyBGZXRjaCByZW5kZXJpbmcgaW5mbyBmcm9tIHZpZXcgbW9kZWwgZm9yIHJlc3Qgb2YgbGluZXMgdGhhdCBuZWVkIHJlbmRlcmluZy5cblx0XHRjb25zdCBsaW5lSW5mbyA9IHRoaXMuX21vZGVsLmdldE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyLCBuZWVkZWQpO1xuXHRcdGNvbnN0IHRhYlNpemUgPSB0aGlzLl9tb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZTtcblx0XHRjb25zdCBkZWZhdWx0QmFja2dyb3VuZCA9IHRoaXMuX21vZGVsLm9wdGlvbnMuZGVmYXVsdEJhY2tncm91bmRDb2xvcjtcblx0XHRjb25zdCBiYWNrZ3JvdW5kID0gdGhpcy5fbW9kZWwub3B0aW9ucy5iYWNrZ3JvdW5kQ29sb3I7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZEFscGhhID0gdGhpcy5fbW9kZWwub3B0aW9ucy5mb3JlZ3JvdW5kQWxwaGE7XG5cdFx0Y29uc3QgdG9rZW5zQ29sb3JUcmFja2VyID0gdGhpcy5fbW9kZWwudG9rZW5zQ29sb3JUcmFja2VyO1xuXHRcdGNvbnN0IHVzZUxpZ2h0ZXJGb250ID0gdG9rZW5zQ29sb3JUcmFja2VyLmJhY2tncm91bmRJc0xpZ2h0KCk7XG5cdFx0Y29uc3QgcmVuZGVyTWluaW1hcCA9IHRoaXMuX21vZGVsLm9wdGlvbnMucmVuZGVyTWluaW1hcDtcblx0XHRjb25zdCBjaGFyUmVuZGVyZXIgPSB0aGlzLl9tb2RlbC5vcHRpb25zLmNoYXJSZW5kZXJlcigpO1xuXHRcdGNvbnN0IGZvbnRTY2FsZSA9IHRoaXMuX21vZGVsLm9wdGlvbnMuZm9udFNjYWxlO1xuXHRcdGNvbnN0IG1pbmltYXBDaGFyV2lkdGggPSB0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBDaGFyV2lkdGg7XG5cblx0XHRjb25zdCBiYXNlQ2hhckhlaWdodCA9IChyZW5kZXJNaW5pbWFwID09PSBSZW5kZXJNaW5pbWFwLlRleHQgPyBDb25zdGFudHMuQkFTRV9DSEFSX0hFSUdIVCA6IENvbnN0YW50cy5CQVNFX0NIQVJfSEVJR0hUICsgMSk7XG5cdFx0Y29uc3QgcmVuZGVyTWluaW1hcExpbmVIZWlnaHQgPSBiYXNlQ2hhckhlaWdodCAqIGZvbnRTY2FsZTtcblx0XHRjb25zdCBpbm5lckxpbmVQYWRkaW5nID0gKG1pbmltYXBMaW5lSGVpZ2h0ID4gcmVuZGVyTWluaW1hcExpbmVIZWlnaHQgPyBNYXRoLmZsb29yKChtaW5pbWFwTGluZUhlaWdodCAtIHJlbmRlck1pbmltYXBMaW5lSGVpZ2h0KSAvIDIpIDogMCk7XG5cblx0XHQvLyBSZW5kZXIgdGhlIHJlc3Qgb2YgbGluZXNcblx0XHRjb25zdCBiYWNrZ3JvdW5kQSA9IGJhY2tncm91bmQuYSAvIDI1NTtcblx0XHRjb25zdCByZW5kZXJCYWNrZ3JvdW5kID0gbmV3IFJHQkE4KFxuXHRcdFx0TWF0aC5yb3VuZCgoYmFja2dyb3VuZC5yIC0gZGVmYXVsdEJhY2tncm91bmQucikgKiBiYWNrZ3JvdW5kQSArIGRlZmF1bHRCYWNrZ3JvdW5kLnIpLFxuXHRcdFx0TWF0aC5yb3VuZCgoYmFja2dyb3VuZC5nIC0gZGVmYXVsdEJhY2tncm91bmQuZykgKiBiYWNrZ3JvdW5kQSArIGRlZmF1bHRCYWNrZ3JvdW5kLmcpLFxuXHRcdFx0TWF0aC5yb3VuZCgoYmFja2dyb3VuZC5iIC0gZGVmYXVsdEJhY2tncm91bmQuYikgKiBiYWNrZ3JvdW5kQSArIGRlZmF1bHRCYWNrZ3JvdW5kLmIpLFxuXHRcdFx0MjU1XG5cdFx0KTtcblx0XHRsZXQgZHkgPSBsYXlvdXQudG9wUGFkZGluZ0xpbmVDb3VudCAqIG1pbmltYXBMaW5lSGVpZ2h0O1xuXHRcdGNvbnN0IHJlbmRlcmVkTGluZXM6IE1pbmltYXBMaW5lW10gPSBbXTtcblx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSAwLCBsaW5lQ291bnQgPSBlbmRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgMTsgbGluZUluZGV4IDwgbGluZUNvdW50OyBsaW5lSW5kZXgrKykge1xuXHRcdFx0aWYgKG5lZWRlZFtsaW5lSW5kZXhdKSB7XG5cdFx0XHRcdElubmVyTWluaW1hcC5fcmVuZGVyTGluZShcblx0XHRcdFx0XHRpbWFnZURhdGEsXG5cdFx0XHRcdFx0cmVuZGVyQmFja2dyb3VuZCxcblx0XHRcdFx0XHRiYWNrZ3JvdW5kLmEsXG5cdFx0XHRcdFx0dXNlTGlnaHRlckZvbnQsXG5cdFx0XHRcdFx0cmVuZGVyTWluaW1hcCxcblx0XHRcdFx0XHRtaW5pbWFwQ2hhcldpZHRoLFxuXHRcdFx0XHRcdHRva2Vuc0NvbG9yVHJhY2tlcixcblx0XHRcdFx0XHRmb3JlZ3JvdW5kQWxwaGEsXG5cdFx0XHRcdFx0Y2hhclJlbmRlcmVyLFxuXHRcdFx0XHRcdGR5LFxuXHRcdFx0XHRcdGlubmVyTGluZVBhZGRpbmcsXG5cdFx0XHRcdFx0dGFiU2l6ZSxcblx0XHRcdFx0XHRsaW5lSW5mb1tsaW5lSW5kZXhdISxcblx0XHRcdFx0XHRmb250U2NhbGUsXG5cdFx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHRcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHJlbmRlcmVkTGluZXNbbGluZUluZGV4XSA9IG5ldyBNaW5pbWFwTGluZShkeSk7XG5cdFx0XHRkeSArPSBtaW5pbWFwTGluZUhlaWdodDtcblx0XHR9XG5cblx0XHRjb25zdCBkaXJ0eVkxID0gKF9kaXJ0eVkxID09PSAtMSA/IDAgOiBfZGlydHlZMSk7XG5cdFx0Y29uc3QgZGlydHlZMiA9IChfZGlydHlZMiA9PT0gLTEgPyBpbWFnZURhdGEuaGVpZ2h0IDogX2RpcnR5WTIpO1xuXHRcdGNvbnN0IGRpcnR5SGVpZ2h0ID0gZGlydHlZMiAtIGRpcnR5WTE7XG5cblx0XHQvLyBGaW5hbGx5LCBwYWludCB0byB0aGUgY2FudmFzXG5cdFx0Y29uc3QgY3R4ID0gdGhpcy5fY2FudmFzLmRvbU5vZGUuZ2V0Q29udGV4dCgnMmQnKSE7XG5cdFx0Y3R4LnB1dEltYWdlRGF0YShpbWFnZURhdGEsIDAsIDAsIDAsIGRpcnR5WTEsIGltYWdlRGF0YS53aWR0aCwgZGlydHlIZWlnaHQpO1xuXG5cdFx0Ly8gU2F2ZSByZW5kZXJlZCBkYXRhIGZvciByZXVzZSBvbiBuZXh0IGZyYW1lIGlmIHBvc3NpYmxlXG5cdFx0cmV0dXJuIG5ldyBSZW5kZXJEYXRhKFxuXHRcdFx0bGF5b3V0LFxuXHRcdFx0aW1hZ2VEYXRhLFxuXHRcdFx0cmVuZGVyZWRMaW5lc1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVuZGVyVW50b3VjaGVkTGluZXMoXG5cdFx0dGFyZ2V0OiBJbWFnZURhdGEsXG5cdFx0dG9wUGFkZGluZ0xpbmVDb3VudDogbnVtYmVyLFxuXHRcdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLFxuXHRcdGVuZExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRtaW5pbWFwTGluZUhlaWdodDogbnVtYmVyLFxuXHRcdGxhc3RSZW5kZXJEYXRhOiBSZW5kZXJEYXRhIHwgbnVsbCxcblx0KTogW251bWJlciwgbnVtYmVyLCBib29sZWFuW11dIHtcblxuXHRcdGNvbnN0IG5lZWRlZDogYm9vbGVhbltdID0gW107XG5cdFx0aWYgKCFsYXN0UmVuZGVyRGF0YSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGVuZExpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXIgKyAxOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0bmVlZGVkW2ldID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbLTEsIC0xLCBuZWVkZWRdO1xuXHRcdH1cblxuXHRcdGNvbnN0IF9sYXN0RGF0YSA9IGxhc3RSZW5kZXJEYXRhLl9nZXQoKTtcblx0XHRjb25zdCBsYXN0VGFyZ2V0RGF0YSA9IF9sYXN0RGF0YS5pbWFnZURhdGEuZGF0YTtcblx0XHRjb25zdCBsYXN0U3RhcnRMaW5lTnVtYmVyID0gX2xhc3REYXRhLnJlbmRMaW5lTnVtYmVyU3RhcnQ7XG5cdFx0Y29uc3QgbGFzdExpbmVzID0gX2xhc3REYXRhLmxpbmVzO1xuXHRcdGNvbnN0IGxhc3RMaW5lc0xlbmd0aCA9IGxhc3RMaW5lcy5sZW5ndGg7XG5cdFx0Y29uc3QgV0lEVEggPSB0YXJnZXQud2lkdGg7XG5cdFx0Y29uc3QgdGFyZ2V0RGF0YSA9IHRhcmdldC5kYXRhO1xuXG5cdFx0Y29uc3QgbWF4RGVzdFBpeGVsID0gKGVuZExpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXIgKyAxKSAqIG1pbmltYXBMaW5lSGVpZ2h0ICogV0lEVEggKiA0O1xuXHRcdGxldCBkaXJ0eVBpeGVsMSA9IC0xOyAvLyB0aGUgcGl4ZWwgb2Zmc2V0IHVwIHRvIHdoaWNoIGFsbCB0aGUgZGF0YSBpcyBlcXVhbCB0byB0aGUgcHJldiBmcmFtZVxuXHRcdGxldCBkaXJ0eVBpeGVsMiA9IC0xOyAvLyB0aGUgcGl4ZWwgb2Zmc2V0IGFmdGVyIHdoaWNoIGFsbCB0aGUgZGF0YSBpcyBlcXVhbCB0byB0aGUgcHJldiBmcmFtZVxuXG5cdFx0bGV0IGNvcHlTb3VyY2VTdGFydCA9IC0xO1xuXHRcdGxldCBjb3B5U291cmNlRW5kID0gLTE7XG5cdFx0bGV0IGNvcHlEZXN0U3RhcnQgPSAtMTtcblx0XHRsZXQgY29weURlc3RFbmQgPSAtMTtcblxuXHRcdGxldCBkZXN0X2R5ID0gdG9wUGFkZGluZ0xpbmVDb3VudCAqIG1pbmltYXBMaW5lSGVpZ2h0O1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgbGFzdExpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSBsYXN0U3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3Qgc291cmNlX2R5ID0gKGxhc3RMaW5lSW5kZXggPj0gMCAmJiBsYXN0TGluZUluZGV4IDwgbGFzdExpbmVzTGVuZ3RoID8gbGFzdExpbmVzW2xhc3RMaW5lSW5kZXhdLmR5IDogLTEpO1xuXG5cdFx0XHRpZiAoc291cmNlX2R5ID09PSAtMSkge1xuXHRcdFx0XHRuZWVkZWRbbGluZUluZGV4XSA9IHRydWU7XG5cdFx0XHRcdGRlc3RfZHkgKz0gbWluaW1hcExpbmVIZWlnaHQ7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzb3VyY2VTdGFydCA9IHNvdXJjZV9keSAqIFdJRFRIICogNDtcblx0XHRcdGNvbnN0IHNvdXJjZUVuZCA9IChzb3VyY2VfZHkgKyBtaW5pbWFwTGluZUhlaWdodCkgKiBXSURUSCAqIDQ7XG5cdFx0XHRjb25zdCBkZXN0U3RhcnQgPSBkZXN0X2R5ICogV0lEVEggKiA0O1xuXHRcdFx0Y29uc3QgZGVzdEVuZCA9IChkZXN0X2R5ICsgbWluaW1hcExpbmVIZWlnaHQpICogV0lEVEggKiA0O1xuXG5cdFx0XHRpZiAoY29weVNvdXJjZUVuZCA9PT0gc291cmNlU3RhcnQgJiYgY29weURlc3RFbmQgPT09IGRlc3RTdGFydCkge1xuXHRcdFx0XHQvLyBjb250aWd1b3VzIHpvbmUgPT4gZXh0ZW5kIGNvcHkgcmVxdWVzdFxuXHRcdFx0XHRjb3B5U291cmNlRW5kID0gc291cmNlRW5kO1xuXHRcdFx0XHRjb3B5RGVzdEVuZCA9IGRlc3RFbmQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY29weVNvdXJjZVN0YXJ0ICE9PSAtMSkge1xuXHRcdFx0XHRcdC8vIGZsdXNoIGV4aXN0aW5nIGNvcHkgcmVxdWVzdFxuXHRcdFx0XHRcdHRhcmdldERhdGEuc2V0KGxhc3RUYXJnZXREYXRhLnN1YmFycmF5KGNvcHlTb3VyY2VTdGFydCwgY29weVNvdXJjZUVuZCksIGNvcHlEZXN0U3RhcnQpO1xuXHRcdFx0XHRcdGlmIChkaXJ0eVBpeGVsMSA9PT0gLTEgJiYgY29weVNvdXJjZVN0YXJ0ID09PSAwICYmIGNvcHlTb3VyY2VTdGFydCA9PT0gY29weURlc3RTdGFydCkge1xuXHRcdFx0XHRcdFx0ZGlydHlQaXhlbDEgPSBjb3B5U291cmNlRW5kO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGlydHlQaXhlbDIgPT09IC0xICYmIGNvcHlTb3VyY2VFbmQgPT09IG1heERlc3RQaXhlbCAmJiBjb3B5U291cmNlU3RhcnQgPT09IGNvcHlEZXN0U3RhcnQpIHtcblx0XHRcdFx0XHRcdGRpcnR5UGl4ZWwyID0gY29weVNvdXJjZVN0YXJ0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb3B5U291cmNlU3RhcnQgPSBzb3VyY2VTdGFydDtcblx0XHRcdFx0Y29weVNvdXJjZUVuZCA9IHNvdXJjZUVuZDtcblx0XHRcdFx0Y29weURlc3RTdGFydCA9IGRlc3RTdGFydDtcblx0XHRcdFx0Y29weURlc3RFbmQgPSBkZXN0RW5kO1xuXHRcdFx0fVxuXG5cdFx0XHRuZWVkZWRbbGluZUluZGV4XSA9IGZhbHNlO1xuXHRcdFx0ZGVzdF9keSArPSBtaW5pbWFwTGluZUhlaWdodDtcblx0XHR9XG5cblx0XHRpZiAoY29weVNvdXJjZVN0YXJ0ICE9PSAtMSkge1xuXHRcdFx0Ly8gZmx1c2ggZXhpc3RpbmcgY29weSByZXF1ZXN0XG5cdFx0XHR0YXJnZXREYXRhLnNldChsYXN0VGFyZ2V0RGF0YS5zdWJhcnJheShjb3B5U291cmNlU3RhcnQsIGNvcHlTb3VyY2VFbmQpLCBjb3B5RGVzdFN0YXJ0KTtcblx0XHRcdGlmIChkaXJ0eVBpeGVsMSA9PT0gLTEgJiYgY29weVNvdXJjZVN0YXJ0ID09PSAwICYmIGNvcHlTb3VyY2VTdGFydCA9PT0gY29weURlc3RTdGFydCkge1xuXHRcdFx0XHRkaXJ0eVBpeGVsMSA9IGNvcHlTb3VyY2VFbmQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGlydHlQaXhlbDIgPT09IC0xICYmIGNvcHlTb3VyY2VFbmQgPT09IG1heERlc3RQaXhlbCAmJiBjb3B5U291cmNlU3RhcnQgPT09IGNvcHlEZXN0U3RhcnQpIHtcblx0XHRcdFx0ZGlydHlQaXhlbDIgPSBjb3B5U291cmNlU3RhcnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlydHlZMSA9IChkaXJ0eVBpeGVsMSA9PT0gLTEgPyAtMSA6IGRpcnR5UGl4ZWwxIC8gKFdJRFRIICogNCkpO1xuXHRcdGNvbnN0IGRpcnR5WTIgPSAoZGlydHlQaXhlbDIgPT09IC0xID8gLTEgOiBkaXJ0eVBpeGVsMiAvIChXSURUSCAqIDQpKTtcblxuXHRcdHJldHVybiBbZGlydHlZMSwgZGlydHlZMiwgbmVlZGVkXTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZW5kZXJMaW5lKFxuXHRcdHRhcmdldDogSW1hZ2VEYXRhLFxuXHRcdGJhY2tncm91bmRDb2xvcjogUkdCQTgsXG5cdFx0YmFja2dyb3VuZEFscGhhOiBudW1iZXIsXG5cdFx0dXNlTGlnaHRlckZvbnQ6IGJvb2xlYW4sXG5cdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcCxcblx0XHRjaGFyV2lkdGg6IG51bWJlcixcblx0XHRjb2xvclRyYWNrZXI6IE1pbmltYXBUb2tlbnNDb2xvclRyYWNrZXIsXG5cdFx0Zm9yZWdyb3VuZEFscGhhOiBudW1iZXIsXG5cdFx0bWluaW1hcENoYXJSZW5kZXJlcjogTWluaW1hcENoYXJSZW5kZXJlcixcblx0XHRkeTogbnVtYmVyLFxuXHRcdGlubmVyTGluZVBhZGRpbmc6IG51bWJlcixcblx0XHR0YWJTaXplOiBudW1iZXIsXG5cdFx0bGluZURhdGE6IFZpZXdMaW5lRGF0YSxcblx0XHRmb250U2NhbGU6IG51bWJlcixcblx0XHRtaW5pbWFwTGluZUhlaWdodDogbnVtYmVyXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBsaW5lRGF0YS5jb250ZW50O1xuXHRcdGNvbnN0IHRva2VucyA9IGxpbmVEYXRhLnRva2Vucztcblx0XHRjb25zdCBtYXhEeCA9IHRhcmdldC53aWR0aCAtIGNoYXJXaWR0aDtcblx0XHRjb25zdCBmb3JjZTFweEhlaWdodCA9IChtaW5pbWFwTGluZUhlaWdodCA9PT0gMSk7XG5cblx0XHRsZXQgZHggPSBNSU5JTUFQX0dVVFRFUl9XSURUSDtcblx0XHRsZXQgY2hhckluZGV4ID0gMDtcblx0XHRsZXQgdGFic0NoYXJEZWx0YSA9IDA7XG5cblx0XHRmb3IgKGxldCB0b2tlbkluZGV4ID0gMCwgdG9rZW5zTGVuID0gdG9rZW5zLmdldENvdW50KCk7IHRva2VuSW5kZXggPCB0b2tlbnNMZW47IHRva2VuSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgdG9rZW5FbmRJbmRleCA9IHRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRjb25zdCB0b2tlbkNvbG9ySWQgPSB0b2tlbnMuZ2V0Rm9yZWdyb3VuZCh0b2tlbkluZGV4KTtcblx0XHRcdGNvbnN0IHRva2VuQ29sb3IgPSBjb2xvclRyYWNrZXIuZ2V0Q29sb3IodG9rZW5Db2xvcklkKTtcblxuXHRcdFx0Zm9yICg7IGNoYXJJbmRleCA8IHRva2VuRW5kSW5kZXg7IGNoYXJJbmRleCsrKSB7XG5cdFx0XHRcdGlmIChkeCA+IG1heER4KSB7XG5cdFx0XHRcdFx0Ly8gaGl0IGVkZ2Ugb2YgbWluaW1hcFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjaGFyQ29kZSA9IGNvbnRlbnQuY2hhckNvZGVBdChjaGFySW5kZXgpO1xuXG5cdFx0XHRcdGlmIChjaGFyQ29kZSA9PT0gQ2hhckNvZGUuVGFiKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5zZXJ0U3BhY2VzQ291bnQgPSB0YWJTaXplIC0gKGNoYXJJbmRleCArIHRhYnNDaGFyRGVsdGEpICUgdGFiU2l6ZTtcblx0XHRcdFx0XHR0YWJzQ2hhckRlbHRhICs9IGluc2VydFNwYWNlc0NvdW50IC0gMTtcblx0XHRcdFx0XHQvLyBObyBuZWVkIHRvIHJlbmRlciBhbnl0aGluZyBzaW5jZSB0YWIgaXMgaW52aXNpYmxlXG5cdFx0XHRcdFx0ZHggKz0gaW5zZXJ0U3BhY2VzQ291bnQgKiBjaGFyV2lkdGg7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY2hhckNvZGUgPT09IENoYXJDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdFx0Ly8gTm8gbmVlZCB0byByZW5kZXIgYW55dGhpbmcgc2luY2Ugc3BhY2UgaXMgaW52aXNpYmxlXG5cdFx0XHRcdFx0ZHggKz0gY2hhcldpZHRoO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFJlbmRlciB0d2ljZSBmb3IgYSBmdWxsIHdpZHRoIGNoYXJhY3RlclxuXHRcdFx0XHRcdGNvbnN0IGNvdW50ID0gc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcihjaGFyQ29kZSkgPyAyIDogMTtcblxuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0XHRcdFx0aWYgKHJlbmRlck1pbmltYXAgPT09IFJlbmRlck1pbmltYXAuQmxvY2tzKSB7XG5cdFx0XHRcdFx0XHRcdG1pbmltYXBDaGFyUmVuZGVyZXIuYmxvY2tSZW5kZXJDaGFyKHRhcmdldCwgZHgsIGR5ICsgaW5uZXJMaW5lUGFkZGluZywgdG9rZW5Db2xvciwgZm9yZWdyb3VuZEFscGhhLCBiYWNrZ3JvdW5kQ29sb3IsIGJhY2tncm91bmRBbHBoYSwgZm9yY2UxcHhIZWlnaHQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHsgLy8gUmVuZGVyTWluaW1hcC5UZXh0XG5cdFx0XHRcdFx0XHRcdG1pbmltYXBDaGFyUmVuZGVyZXIucmVuZGVyQ2hhcih0YXJnZXQsIGR4LCBkeSArIGlubmVyTGluZVBhZGRpbmcsIGNoYXJDb2RlLCB0b2tlbkNvbG9yLCBmb3JlZ3JvdW5kQWxwaGEsIGJhY2tncm91bmRDb2xvciwgYmFja2dyb3VuZEFscGhhLCBmb250U2NhbGUsIHVzZUxpZ2h0ZXJGb250LCBmb3JjZTFweEhlaWdodCk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGR4ICs9IGNoYXJXaWR0aDtcblxuXHRcdFx0XHRcdFx0aWYgKGR4ID4gbWF4RHgpIHtcblx0XHRcdFx0XHRcdFx0Ly8gaGl0IGVkZ2Ugb2YgbWluaW1hcFxuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIENvbnRpZ3VvdXNMaW5lTWFwPFQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0VmFsdWU6IFQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZhbHVlczogVFtdO1xuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGRlZmF1bHRWYWx1ZTogVCkge1xuXHRcdHRoaXMuX3N0YXJ0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblx0XHR0aGlzLl9lbmRMaW5lTnVtYmVyID0gZW5kTGluZU51bWJlcjtcblx0XHR0aGlzLl9kZWZhdWx0VmFsdWUgPSBkZWZhdWx0VmFsdWU7XG5cdFx0dGhpcy5fdmFsdWVzID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGNvdW50ID0gdGhpcy5fZW5kTGluZU51bWJlciAtIHRoaXMuX3N0YXJ0TGluZU51bWJlciArIDE7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0XHR0aGlzLl92YWx1ZXNbaV0gPSBkZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhhcyhsaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuZ2V0KGxpbmVOdW1iZXIpICE9PSB0aGlzLl9kZWZhdWx0VmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHNldChsaW5lTnVtYmVyOiBudW1iZXIsIHZhbHVlOiBUKTogdm9pZCB7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPCB0aGlzLl9zdGFydExpbmVOdW1iZXIgfHwgbGluZU51bWJlciA+IHRoaXMuX2VuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdmFsdWVzW2xpbmVOdW1iZXIgLSB0aGlzLl9zdGFydExpbmVOdW1iZXJdID0gdmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KGxpbmVOdW1iZXI6IG51bWJlcik6IFQge1xuXHRcdGlmIChsaW5lTnVtYmVyIDwgdGhpcy5fc3RhcnRMaW5lTnVtYmVyIHx8IGxpbmVOdW1iZXIgPiB0aGlzLl9lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdmFsdWVzW2xpbmVOdW1iZXIgLSB0aGlzLl9zdGFydExpbmVOdW1iZXJdO1xuXHR9XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBc0IseUJBQXlCO0FBQy9DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXNCLGtCQUFrQjtBQUN4QyxZQUFZLGNBQWM7QUFDMUIsWUFBWSxhQUFhO0FBQ3pCLFNBQWdCLCtCQUErQjtBQUMvQyxTQUFTLGlCQUFpQixrQkFBa0IsZ0JBQWdCO0FBQzVELFNBQVMsZUFBZSxjQUFjLHNCQUFzQixnQ0FBZ0M7QUFDNUYsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGVBQWU7QUFFeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQ0FBaUM7QUFJMUMsWUFBWSxnQkFBZ0I7QUFFNUIsU0FBUyxrQkFBa0IsbUJBQW1CLDBCQUEwQix3QkFBd0I7QUFFaEcsU0FBUyxpQkFBaUI7QUFFMUIsU0FBdUIsV0FBVyxlQUFlO0FBQ2pELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUJBQWlCLGlDQUEyRDtBQUNyRixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQUtqQyxNQUFNLDhCQUE4QjtBQUVwQyxNQUFNLDBCQUEwQjtBQUVoQyxNQUFNLGVBQWU7QUFBQSxFQStEcEIsWUFBWSxlQUFxQyxPQUFvQixvQkFBK0M7QUFDbkgsVUFBTSxVQUFVLGNBQWM7QUFDOUIsVUFBTSxhQUFhLFFBQVEsSUFBSSxhQUFhLFVBQVU7QUFDdEQsVUFBTSxhQUFhLFFBQVEsSUFBSSxhQUFhLFVB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Z0JBQU0sUUFBUSxRQUFRLHFCQUFxQixRQUFRLElBQUksSUFBSTtBQUUzRCxtQkFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDL0IsZ0JBQUksa0JBQWtCLGNBQWMsUUFBUTtBQUMzQyxrQ0FBb0IsZ0JBQWdCLFFBQVEsSUFBSSxLQUFLLGtCQUFrQixZQUFZLGlCQUFpQixpQkFBaUIsaUJBQWlCLGNBQWM7QUFBQSxZQUNySixPQUFPO0FBQ04sa0NBQW9CLFdBQVcsUUFBUSxJQUFJLEtBQUssa0JBQWtCLFVBQVUsWUFBWSxpQkFBaUIsaUJBQWlCLGlCQUFpQixXQUFXLGdCQUFnQixjQUFjO0FBQUEsWUFDckw7QUFFQSxrQkFBTTtBQUVOLGdCQUFJLEtBQUssT0FBTztBQUVmO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLGtCQUFxQjtBQUFBLEVBTzFCLFlBQVksaUJBQXlCLGVBQXVCLGNBQWlCO0FBQzVFLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssVUFBVSxDQUFDO0FBQ2hCLGFBQVMsSUFBSSxHQUFHLFFBQVEsS0FBSyxpQkFBaUIsS0FBSyxtQkFBbUIsR0FBRyxJQUFJLE9BQU8sS0FBSztBQUN4RixXQUFLLFFBQVEsQ0FBQyxJQUFJO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQUEsRUFFTyxJQUFJLFlBQTZCO0FBQ3ZDLFdBQVEsS0FBSyxJQUFJLFVBQVUsTUFBTSxLQUFLO0FBQUEsRUFDdkM7QUFBQSxFQUVPLElBQUksWUFBb0IsT0FBZ0I7QUFDOUMsUUFBSSxhQUFhLEtBQUssb0JBQW9CLGFBQWEsS0FBSyxnQkFBZ0I7QUFDM0U7QUFBQSxJQUNEO0FBQ0EsU0FBSyxRQUFRLGFBQWEsS0FBSyxnQkFBZ0IsSUFBSTtBQUFBLEVBQ3BEO0FBQUEsRUFFTyxJQUFJLFlBQXVCO0FBQ2pDLFFBQUksYUFBYSxLQUFLLG9CQUFvQixhQUFhLEtBQUssZ0JBQWdCO0FBQzNFLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPLEtBQUssUUFBUSxhQUFhLEtBQUssZ0JBQWdCO0FBQUEsRUFDdkQ7QUFDRDsiLAogICJuYW1lcyI6IFsic2xpZGVySGVpZ2h0IiwgIm1heE1pbmltYXBTbGlkZXJUb3AiLCAiY29tcHV0ZWRTbGlkZXJSYXRpbyIsICJzbGlkZXJUb3AiLCAicmVzdWx0Il0KfQo=
