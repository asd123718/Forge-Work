import { getActiveWindow } from "../../../../base/browser/dom.js";
import { Color } from "../../../../base/common/color.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { CursorColumns } from "../../../common/core/cursorColumns.js";
import { ViewEventType } from "../../../common/viewEvents.js";
import { createContentSegmenter } from "../contentSegmenter.js";
import { fullFileRenderStrategyWgsl } from "./fullFileRenderStrategy.wgsl.js";
import { BindingId } from "../gpu.js";
import { GPULifecycle } from "../gpuDisposable.js";
import { quadVertices } from "../gpuUtils.js";
import { ViewGpuContext } from "../viewGpuContext.js";
import { BaseRenderStrategy } from "./baseRenderStrategy.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["IndicesPerCell"] = 6] = "IndicesPerCell";
  return Constants2;
})(Constants || {});
var CellBufferInfo = /* @__PURE__ */ ((CellBufferInfo2) => {
  CellBufferInfo2[CellBufferInfo2["FloatsPerEntry"] = 6] = "FloatsPerEntry";
  CellBufferInfo2[CellBufferInfo2["BytesPerEntry"] = 24] = "BytesPerEntry";
  CellBufferInfo2[CellBufferInfo2["Offset_X"] = 0] = "Offset_X";
  CellBufferInfo2[CellBufferInfo2["Offset_Y"] = 1] = "Offset_Y";
  CellBufferInfo2[CellBufferInfo2["Offset_Unused1"] = 2] = "Offset_Unused1";
  CellBufferInfo2[CellBufferInfo2["Offset_Unused2"] = 3] = "Offset_Unused2";
  CellBufferInfo2[CellBufferInfo2["GlyphIndex"] = 4] = "GlyphIndex";
  CellBufferInfo2[CellBufferInfo2["TextureIndex"] = 5] = "TextureIndex";
  return CellBufferInfo2;
})(CellBufferInfo || {});
const _FullFileRenderStrategy = class _FullFileRenderStrategy extends BaseRenderStrategy {
  constructor(context, viewGpuContext, device, glyphRasterizer) {
    super(context, viewGpuContext, device, glyphRasterizer);
    this.type = "fullfile";
    this.wgsl = fullFileRenderStrategyWgsl;
    this._activeDoubleBufferIndex = 0;
    this._upToDateLines = [/* @__PURE__ */ new Set(), /* @__PURE__ */ new Set()];
    this._visibleObjectCount = 0;
    this._finalRenderedLine = 0;
    this._scrollInitialized = false;
    this._queuedBufferUpdates = [[], []];
    const bufferSize = _FullFileRenderStrategy.maxSupportedLines * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */ * Float32Array.BYTES_PER_ELEMENT;
    this._cellBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco full file cell buffer",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })).object;
    this._cellValueBuffers = [
      new ArrayBuffer(bufferSize),
      new ArrayBuffer(bufferSize)
    ];
    const scrollOffsetBufferSize = 2;
    this._scrollOffsetBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco scroll offset buffer",
      size: scrollOffsetBufferSize * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })).object;
    this._scrollOffsetValueBuffer = new Float32Array(scrollOffsetBufferSize);
  }
  get bindGroupEntries() {
    return [
      { binding: BindingId.Cells, resource: { buffer: this._cellBindBuffer } },
      { binding: BindingId.ScrollOffset, resource: { buffer: this._scrollOffsetBindBuffer } }
    ];
  }
  // #region Event handlers
  // The primary job of these handlers is to:
  // 1. Invalidate the up to date line cache, which will cause the line to be re-rendered when
  //    it's _within the viewport_.
  // 2. Pass relevant events on to the render function so it can force certain line ranges to be
  //    re-rendered even if they're not in the viewport. For example when a view zone is added,
  //    there are lines that used to be visible but are no longer, so those ranges must be
  //    cleared and uploaded to the GPU.
  onConfigurationChanged(e) {
    this._invalidateAllLines();
    this._queueBufferUpdate(e);
    return true;
  }
  onDecorationsChanged(e) {
    this._invalidateAllLines();
    return true;
  }
  onTokensChanged(e) {
    for (const range of e.ranges) {
      this._invalidateLineRange(range.fromLineNumber, range.toLineNumber);
    }
    return true;
  }
  onLinesDeleted(e) {
    this._invalidateLinesFrom(e.fromLineNumber);
    this._queueBufferUpdate(e);
    return true;
  }
  onLinesInserted(e) {
    this._invalidateLinesFrom(e.fromLineNumber);
    return true;
  }
  onLinesChanged(e) {
    this._invalidateLineRange(e.fromLineNumber, e.fromLineNumber + e.count);
    return true;
  }
  onScrollChanged(e) {
    if (this._store.isDisposed) {
      return false;
    }
    const dpr = getActiveWindow().devicePixelRatio;
    this._scrollOffsetValueBuffer[0] = (e?.scrollLeft ?? this._context.viewLayout.getCurrentScrollLeft()) * dpr;
    this._scrollOffsetValueBuffer[1] = (e?.scrollTop ?? this._context.viewLayout.getCurrentScrollTop()) * dpr;
    this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, this._scrollOffsetValueBuffer);
    return true;
  }
  onThemeChanged(e) {
    this._invalidateAllLines();
    return true;
  }
  onLineMappingChanged(e) {
    this._invalidateAllLines();
    this._queueBufferUpdate(e);
    return true;
  }
  onZonesChanged(e) {
    this._invalidateAllLines();
    this._queueBufferUpdate(e);
    return true;
  }
  // #endregion
  _invalidateAllLines() {
    this._upToDateLines[0].clear();
    this._upToDateLines[1].clear();
  }
  _invalidateLinesFrom(lineNumber) {
    for (const i of [0, 1]) {
      const upToDateLines = this._upToDateLines[i];
      for (const upToDateLine of upToDateLines) {
        if (upToDateLine >= lineNumber) {
          upToDateLines.delete(upToDateLine);
        }
      }
    }
  }
  _invalidateLineRange(fromLineNumber, toLineNumber) {
    for (let i = fromLineNumber; i <= toLineNumber; i++) {
      this._upToDateLines[0].delete(i);
      this._upToDateLines[1].delete(i);
    }
  }
  reset() {
    this._invalidateAllLines();
    for (const bufferIndex of [0, 1]) {
      const buffer = new Float32Array(this._cellValueBuffers[bufferIndex]);
      buffer.fill(0, 0, buffer.length);
      this._device.queue.writeBuffer(this._cellBindBuffer, 0, buffer.buffer, 0, buffer.byteLength);
    }
    this._finalRenderedLine = 0;
  }
  update(viewportData, viewLineOptions) {
    let chars = "";
    let segment;
    let charWidth = 0;
    let y = 0;
    let x = 0;
    let absoluteOffsetX = 0;
    let absoluteOffsetY = 0;
    let tabXOffset = 0;
    let glyph;
    let cellIndex = 0;
    let tokenStartIndex = 0;
    let tokenEndIndex = 0;
    let tokenMetadata = 0;
    let decorationStyleSetBold;
    let decorationStyleSetColor;
    let decorationStyleSetOpacity;
    let decorationStyleSetStrikethrough;
    let decorationStyleSetStrikethroughThickness;
    let decorationStyleSetStrikethroughColor;
    let lineData;
    let decoration;
    let fillStartIndex = 0;
    let fillEndIndex = 0;
    let tokens;
    const dpr = getActiveWindow().devicePixelRatio;
    let contentSegmenter;
    if (!this._scrollInitialized) {
      this.onScrollChanged();
      this._scrollInitialized = true;
    }
    const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
    const lineIndexCount = _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
    const upToDateLines = this._upToDateLines[this._activeDoubleBufferIndex];
    let dirtyLineStart = 3e3;
    let dirtyLineEnd = 0;
    const queuedBufferUpdates = this._queuedBufferUpdates[this._activeDoubleBufferIndex];
    while (queuedBufferUpdates.length) {
      const e = queuedBufferUpdates.shift();
      switch (e.type) {
        // TODO: Refine these cases so we're not throwing away everything
        case ViewEventType.ViewConfigurationChanged:
        case ViewEventType.ViewLineMappingChanged:
        case ViewEventType.ViewZonesChanged: {
          cellBuffer.fill(0);
          dirtyLineStart = 1;
          dirtyLineEnd = Math.max(dirtyLineEnd, this._finalRenderedLine);
          this._finalRenderedLine = 0;
          break;
        }
        case ViewEventType.ViewLinesDeleted: {
          const deletedLineContentStartIndex = (e.fromLineNumber - 1) * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
          const deletedLineContentEndIndex = e.toLineNumber * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
          const nullContentStartIndex = (this._finalRenderedLine - (e.toLineNumber - e.fromLineNumber + 1)) * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
          cellBuffer.set(cellBuffer.subarray(deletedLineContentEndIndex), deletedLineContentStartIndex);
          cellBuffer.fill(0, nullContentStartIndex);
          dirtyLineStart = Math.min(dirtyLineStart, e.fromLineNumber);
          dirtyLineEnd = Math.max(dirtyLineEnd, this._finalRenderedLine);
          this._finalRenderedLine -= e.toLineNumber - e.fromLineNumber + 1;
          break;
        }
      }
    }
    for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {
      if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, y)) {
        fillStartIndex = (y - 1) * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
        fillEndIndex = y * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
        cellBuffer.fill(0, fillStartIndex, fillEndIndex);
        dirtyLineStart = Math.min(dirtyLineStart, y);
        dirtyLineEnd = Math.max(dirtyLineEnd, y);
        continue;
      }
      if (upToDateLines.has(y)) {
        continue;
      }
      dirtyLineStart = Math.min(dirtyLineStart, y);
      dirtyLineEnd = Math.max(dirtyLineEnd, y);
      lineData = viewportData.getViewLineRenderingData(y);
      tabXOffset = 0;
      contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
      charWidth = viewLineOptions.spaceWidth * dpr;
      absoluteOffsetX = (lineData.minColumn - 1) * charWidth;
      tokens = lineData.tokens;
      tokenStartIndex = lineData.minColumn - 1;
      tokenEndIndex = 0;
      for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
        tokenEndIndex = tokens.getEndOffset(tokenIndex);
        if (tokenEndIndex <= tokenStartIndex) {
          continue;
        }
        tokenMetadata = tokens.getMetadata(tokenIndex);
        for (x = tokenStartIndex; x < tokenEndIndex; x++) {
          if (x > _FullFileRenderStrategy.maxSupportedColumns) {
            break;
          }
          segment = contentSegmenter.getSegmentAtIndex(x);
          if (segment === void 0) {
            continue;
          }
          chars = segment;
          if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
            charWidth = this.glyphRasterizer.getTextMetrics(chars).width;
          }
          decorationStyleSetColor = void 0;
          decorationStyleSetBold = void 0;
          decorationStyleSetOpacity = void 0;
          decorationStyleSetStrikethrough = void 0;
          decorationStyleSetStrikethroughThickness = void 0;
          decorationStyleSetStrikethroughColor = void 0;
          for (decoration of lineData.inlineDecorations) {
            if (y < decoration.range.startLineNumber || y > decoration.range.endLineNumber || y === decoration.range.startLineNumber && x < decoration.range.startColumn - 1 || y === decoration.range.endLineNumber && x >= decoration.range.endColumn - 1) {
              continue;
            }
            const rules = ViewGpuContext.decorationCssRuleExtractor.getStyleRules(this._viewGpuContext.canvas.domNode, decoration.inlineClassName);
            for (const rule of rules) {
              for (const r of rule.style) {
                const value = rule.styleMap.get(r)?.toString() ?? "";
                switch (r) {
                  case "color": {
                    const parsedColor = Color.Format.CSS.parse(value);
                    if (!parsedColor) {
                      throw new BugIndicatingError("Invalid color format " + value);
                    }
                    decorationStyleSetColor = parsedColor.toNumber32Bit();
                    break;
                  }
                  case "font-weight": {
                    const parsedValue = parseCssFontWeight(value);
                    if (parsedValue >= 400) {
                      decorationStyleSetBold = true;
                    } else {
                      decorationStyleSetBold = false;
                    }
                    break;
                  }
                  case "opacity": {
                    const parsedValue = parseCssOpacity(value);
                    decorationStyleSetOpacity = parsedValue;
                    break;
                  }
                  case "text-decoration":
                  case "text-decoration-line": {
                    if (value === "line-through") {
                      decorationStyleSetStrikethrough = true;
                    }
                    break;
                  }
                  case "text-decoration-thickness": {
                    const match = value.match(/^(\d+(?:\.\d+)?)px$/);
                    if (match) {
                      decorationStyleSetStrikethroughThickness = parseFloat(match[1]);
                    }
                    break;
                  }
                  case "text-decoration-color": {
                    let colorValue = value;
                    const varMatch = value.match(/^var\((--[^,]+),\s*(?:initial|inherit)\)$/);
                    if (varMatch) {
                      colorValue = ViewGpuContext.decorationCssRuleExtractor.resolveCssVariable(this._viewGpuContext.canvas.domNode, varMatch[1]);
                    }
                    const parsedColor = Color.Format.CSS.parse(colorValue);
                    if (parsedColor) {
                      decorationStyleSetStrikethroughColor = parsedColor.toNumber32Bit();
                    }
                    break;
                  }
                  case "text-decoration-style": {
                    break;
                  }
                  default:
                    throw new BugIndicatingError("Unexpected inline decoration style");
                }
              }
            }
          }
          if (chars === " " || chars === "	") {
            cellIndex = ((y - 1) * _FullFileRenderStrategy.maxSupportedColumns + x) * 6 /* IndicesPerCell */;
            cellBuffer.fill(0, cellIndex, cellIndex + 6 /* FloatsPerEntry */);
            if (chars === "	") {
              const offsetBefore = x + tabXOffset;
              tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
              absoluteOffsetX += charWidth * (tabXOffset - offsetBefore);
              tabXOffset -= x + 1;
            } else {
              absoluteOffsetX += charWidth;
            }
            continue;
          }
          const decorationStyleSetId = ViewGpuContext.decorationStyleCache.getOrCreateEntry(decorationStyleSetColor, decorationStyleSetBold, decorationStyleSetOpacity, decorationStyleSetStrikethrough, decorationStyleSetStrikethroughThickness, decorationStyleSetStrikethroughColor);
          glyph = this._viewGpuContext.atlas.getGlyph(this.glyphRasterizer, chars, tokenMetadata, decorationStyleSetId, absoluteOffsetX);
          absoluteOffsetY = Math.round(
            // Top of layout box (includes line height)
            viewportData.relativeVerticalOffset[y - viewportData.startLineNumber] * dpr + // Delta from top of layout box (includes line height) to top of the inline box (no line height)
            Math.floor((viewportData.lineHeight * dpr - (glyph.fontBoundingBoxAscent + glyph.fontBoundingBoxDescent)) / 2) + // Delta from top of inline box (no line height) to top of glyph origin. If the glyph was drawn
            // with a top baseline for example, this ends up drawing the glyph correctly using the alphabetical
            // baseline.
            glyph.fontBoundingBoxAscent
          );
          cellIndex = ((y - 1) * _FullFileRenderStrategy.maxSupportedColumns + x) * 6 /* IndicesPerCell */;
          cellBuffer[cellIndex + 0 /* Offset_X */] = Math.floor(absoluteOffsetX);
          cellBuffer[cellIndex + 1 /* Offset_Y */] = absoluteOffsetY;
          cellBuffer[cellIndex + 4 /* GlyphIndex */] = glyph.glyphIndex;
          cellBuffer[cellIndex + 5 /* TextureIndex */] = glyph.pageIndex;
          absoluteOffsetX += charWidth;
        }
        tokenStartIndex = tokenEndIndex;
      }
      fillStartIndex = ((y - 1) * _FullFileRenderStrategy.maxSupportedColumns + tokenEndIndex) * 6 /* IndicesPerCell */;
      fillEndIndex = y * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
      cellBuffer.fill(0, fillStartIndex, fillEndIndex);
      upToDateLines.add(y);
    }
    const visibleObjectCount = (viewportData.endLineNumber - viewportData.startLineNumber + 1) * lineIndexCount;
    dirtyLineStart = Math.min(dirtyLineStart, _FullFileRenderStrategy.maxSupportedLines);
    dirtyLineEnd = Math.min(dirtyLineEnd, _FullFileRenderStrategy.maxSupportedLines);
    if (dirtyLineStart <= dirtyLineEnd) {
      this._device.queue.writeBuffer(
        this._cellBindBuffer,
        (dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT,
        cellBuffer.buffer,
        (dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT,
        (dirtyLineEnd - dirtyLineStart + 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT
      );
    }
    this._finalRenderedLine = Math.max(this._finalRenderedLine, dirtyLineEnd);
    this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;
    this._visibleObjectCount = visibleObjectCount;
    return visibleObjectCount;
  }
  draw(pass, viewportData) {
    if (this._visibleObjectCount <= 0) {
      throw new BugIndicatingError("Attempt to draw 0 objects");
    }
    pass.draw(
      quadVertices.length / 2,
      this._visibleObjectCount,
      void 0,
      (viewportData.startLineNumber - 1) * _FullFileRenderStrategy.maxSupportedColumns
    );
  }
  /**
   * Queue updates that need to happen on the active buffer, not just the cache. This will be
   * deferred to when the actual cell buffer is changed since the active buffer could be locked by
   * the GPU which would block the main thread.
   */
  _queueBufferUpdate(e) {
    this._queuedBufferUpdates[0].push(e);
    this._queuedBufferUpdates[1].push(e);
  }
};
/**
 * The hard cap for line count that can be rendered by the GPU renderer.
 */
_FullFileRenderStrategy.maxSupportedLines = 3e3;
/**
 * The hard cap for line columns that can be rendered by the GPU renderer.
 */
_FullFileRenderStrategy.maxSupportedColumns = 200;
let FullFileRenderStrategy = _FullFileRenderStrategy;
function parseCssFontWeight(value) {
  switch (value) {
    case "lighter":
    case "normal":
      return 400;
    case "bolder":
    case "bold":
      return 700;
  }
  return parseInt(value);
}
function parseCssOpacity(value) {
  if (value.endsWith("%")) {
    return parseFloat(value.substring(0, value.length - 1)) / 100;
  }
  if (value.match(/^\d+(?:\.\d*)/)) {
    return parseFloat(value);
  }
  return 1;
}
export {
  FullFileRenderStrategy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGdwdVxccmVuZGVyU3RyYXRlZ3lcXGZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbHVtbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9jdXJzb3JDb2x1bW5zLmpzJztcbmltcG9ydCB0eXBlIHsgSVZpZXdMaW5lVG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IFZpZXdFdmVudFR5cGUsIHR5cGUgVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIHR5cGUgVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdMaW5lTWFwcGluZ0NoYW5nZWRFdmVudCwgdHlwZSBWaWV3TGluZXNDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld0xpbmVzRGVsZXRlZEV2ZW50LCB0eXBlIFZpZXdMaW5lc0luc2VydGVkRXZlbnQsIHR5cGUgVmlld1Njcm9sbENoYW5nZWRFdmVudCwgdHlwZSBWaWV3VGhlbWVDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld1Rva2Vuc0NoYW5nZWRFdmVudCwgdHlwZSBWaWV3Wm9uZXNDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgdHlwZSB7IFZpZXdwb3J0RGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lc1ZpZXdwb3J0RGF0YS5qcyc7XG5pbXBvcnQgdHlwZSB7IFZpZXdMaW5lUmVuZGVyaW5nRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3TGluZU9wdGlvbnMgfSBmcm9tICcuLi8uLi92aWV3UGFydHMvdmlld0xpbmVzL3ZpZXdMaW5lT3B0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXh0dXJlQXRsYXNQYWdlR2x5cGggfSBmcm9tICcuLi9hdGxhcy9hdGxhcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb250ZW50U2VnbWVudGVyLCB0eXBlIElDb250ZW50U2VnbWVudGVyIH0gZnJvbSAnLi4vY29udGVudFNlZ21lbnRlci5qcyc7XG5pbXBvcnQgeyBmdWxsRmlsZVJlbmRlclN0cmF0ZWd5V2dzbCB9IGZyb20gJy4vZnVsbEZpbGVSZW5kZXJTdHJhdGVneS53Z3NsLmpzJztcbmltcG9ydCB7IEJpbmRpbmdJZCB9IGZyb20gJy4uL2dwdS5qcyc7XG5pbXBvcnQgeyBHUFVMaWZlY3ljbGUgfSBmcm9tICcuLi9ncHVEaXNwb3NhYmxlLmpzJztcbmltcG9ydCB7IHF1YWRWZXJ0aWNlcyB9IGZyb20gJy4uL2dwdVV0aWxzLmpzJztcbmltcG9ydCB7IEdseXBoUmFzdGVyaXplciB9IGZyb20gJy4uL3Jhc3Rlci9nbHlwaFJhc3Rlcml6ZXIuanMnO1xuaW1wb3J0IHsgVmlld0dwdUNvbnRleHQgfSBmcm9tICcuLi92aWV3R3B1Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBCYXNlUmVuZGVyU3RyYXRlZ3kgfSBmcm9tICcuL2Jhc2VSZW5kZXJTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0SW5kaWNlc1BlckNlbGwgPSA2LFxufVxuXG5jb25zdCBlbnVtIENlbGxCdWZmZXJJbmZvIHtcblx0RmxvYXRzUGVyRW50cnkgPSA2LFxuXHRCeXRlc1BlckVudHJ5ID0gQ2VsbEJ1ZmZlckluZm8uRmxvYXRzUGVyRW50cnkgKiA0LFxuXHRPZmZzZXRfWCA9IDAsXG5cdE9mZnNldF9ZID0gMSxcblx0T2Zmc2V0X1VudXNlZDEgPSAyLFxuXHRPZmZzZXRfVW51c2VkMiA9IDMsXG5cdEdseXBoSW5kZXggPSA0LFxuXHRUZXh0dXJlSW5kZXggPSA1LFxufVxuXG50eXBlIFF1ZXVlZEJ1ZmZlckV2ZW50ID0gKFxuXHRWaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCB8XG5cdFZpZXdMaW5lTWFwcGluZ0NoYW5nZWRFdmVudCB8XG5cdFZpZXdMaW5lc0RlbGV0ZWRFdmVudCB8XG5cdFZpZXdab25lc0NoYW5nZWRFdmVudFxuKTtcblxuLyoqXG4gKiBBIHJlbmRlciBzdHJhdGVneSB0aGF0IHRyYWNrcyBhIGxhcmdlIGJ1ZmZlciwgdXBsb2FkaW5nIG9ubHkgZGlydHkgbGluZXMgYXMgdGhleSBjaGFuZ2UgYW5kXG4gKiBsZXZlcmFnaW5nIGhlYXZ5IGNhY2hpbmcuIFRoaXMgaXMgdGhlIG1vc3QgcGVyZm9ybWFudCBzdHJhdGVneSBidXQgaGFzIGxpbWl0YXRpb25zIGFyb3VuZCBsb25nXG4gKiBsaW5lcyBhbmQgdG9vIG1hbnkgbGluZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5IGV4dGVuZHMgQmFzZVJlbmRlclN0cmF0ZWd5IHtcblxuXHQvKipcblx0ICogVGhlIGhhcmQgY2FwIGZvciBsaW5lIGNvdW50IHRoYXQgY2FuIGJlIHJlbmRlcmVkIGJ5IHRoZSBHUFUgcmVuZGVyZXIuXG5cdCAqL1xuXHRzdGF0aWMgcmVhZG9ubHkgbWF4U3VwcG9ydGVkTGluZXMgPSAzMDAwO1xuXG5cdC8qKlxuXHQgKiBUaGUgaGFyZCBjYXAgZm9yIGxpbmUgY29sdW1ucyB0aGF0IGNhbiBiZSByZW5kZXJlZCBieSB0aGUgR1BVIHJlbmRlcmVyLlxuXHQgKi9cblx0c3RhdGljIHJlYWRvbmx5IG1heFN1cHBvcnRlZENvbHVtbnMgPSAyMDA7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdmdWxsZmlsZSc7XG5cdHJlYWRvbmx5IHdnc2w6IHN0cmluZyA9IGZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3lXZ3NsO1xuXG5cdHByaXZhdGUgX2NlbGxCaW5kQnVmZmVyITogR1BVQnVmZmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgY2VsbCB2YWx1ZSBidWZmZXJzLCB0aGVzZSBob2xkIHRoZSBjZWxscyBhbmQgdGhlaXIgZ2x5cGhzLiBJdCdzIGRvdWJsZSBidWZmZXJzIHN1Y2ggdGhhdFxuXHQgKiB0aGUgdGhyZWFkIGRvZXNuJ3QgYmxvY2sgd2hlbiBvbmUgaXMgYmVpbmcgdXBsb2FkZWQgdG8gdGhlIEdQVS5cblx0ICovXG5cdHByaXZhdGUgX2NlbGxWYWx1ZUJ1ZmZlcnMhOiBbQXJyYXlCdWZmZXIsIEFycmF5QnVmZmVyXTtcblx0cHJpdmF0ZSBfYWN0aXZlRG91YmxlQnVmZmVySW5kZXg6IDAgfCAxID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91cFRvRGF0ZUxpbmVzOiBbU2V0PG51bWJlcj4sIFNldDxudW1iZXI+XSA9IFtuZXcgU2V0KCksIG5ldyBTZXQoKV07XG5cdHByaXZhdGUgX3Zpc2libGVPYmplY3RDb3VudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfZmluYWxSZW5kZXJlZExpbmU6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfc2Nyb2xsT2Zmc2V0QmluZEJ1ZmZlcjogR1BVQnVmZmVyO1xuXHRwcml2YXRlIF9zY3JvbGxPZmZzZXRWYWx1ZUJ1ZmZlcjogRmxvYXQzMkFycmF5O1xuXHRwcml2YXRlIF9zY3JvbGxJbml0aWFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXVlZEJ1ZmZlclVwZGF0ZXM6IFtRdWV1ZWRCdWZmZXJFdmVudFtdLCBRdWV1ZWRCdWZmZXJFdmVudFtdXSA9IFtbXSwgW11dO1xuXG5cdGdldCBiaW5kR3JvdXBFbnRyaWVzKCk6IEdQVUJpbmRHcm91cEVudHJ5W10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHR7IGJpbmRpbmc6IEJpbmRpbmdJZC5DZWxscywgcmVzb3VyY2U6IHsgYnVmZmVyOiB0aGlzLl9jZWxsQmluZEJ1ZmZlciB9IH0sXG5cdFx0XHR7IGJpbmRpbmc6IEJpbmRpbmdJZC5TY3JvbGxPZmZzZXQsIHJlc291cmNlOiB7IGJ1ZmZlcjogdGhpcy5fc2Nyb2xsT2Zmc2V0QmluZEJ1ZmZlciB9IH1cblx0XHRdO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dDogVmlld0NvbnRleHQsXG5cdFx0dmlld0dwdUNvbnRleHQ6IFZpZXdHcHVDb250ZXh0LFxuXHRcdGRldmljZTogR1BVRGV2aWNlLFxuXHRcdGdseXBoUmFzdGVyaXplcjogeyB2YWx1ZTogR2x5cGhSYXN0ZXJpemVyIH0sXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHQsIHZpZXdHcHVDb250ZXh0LCBkZXZpY2UsIGdseXBoUmFzdGVyaXplcik7XG5cblx0XHRjb25zdCBidWZmZXJTaXplID0gRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRMaW5lcyAqIEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucyAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVDtcblx0XHR0aGlzLl9jZWxsQmluZEJ1ZmZlciA9IHRoaXMuX3JlZ2lzdGVyKEdQVUxpZmVjeWNsZS5jcmVhdGVCdWZmZXIodGhpcy5fZGV2aWNlLCB7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyBmdWxsIGZpbGUgY2VsbCBidWZmZXInLFxuXHRcdFx0c2l6ZTogYnVmZmVyU2l6ZSxcblx0XHRcdHVzYWdlOiBHUFVCdWZmZXJVc2FnZS5TVE9SQUdFIHwgR1BVQnVmZmVyVXNhZ2UuQ09QWV9EU1QsXG5cdFx0fSkpLm9iamVjdDtcblx0XHR0aGlzLl9jZWxsVmFsdWVCdWZmZXJzID0gW1xuXHRcdFx0bmV3IEFycmF5QnVmZmVyKGJ1ZmZlclNpemUpLFxuXHRcdFx0bmV3IEFycmF5QnVmZmVyKGJ1ZmZlclNpemUpLFxuXHRcdF07XG5cblx0XHRjb25zdCBzY3JvbGxPZmZzZXRCdWZmZXJTaXplID0gMjtcblx0XHR0aGlzLl9zY3JvbGxPZmZzZXRCaW5kQnVmZmVyID0gdGhpcy5fcmVnaXN0ZXIoR1BVTGlmZWN5Y2xlLmNyZWF0ZUJ1ZmZlcih0aGlzLl9kZXZpY2UsIHtcblx0XHRcdGxhYmVsOiAnTW9uYWNvIHNjcm9sbCBvZmZzZXQgYnVmZmVyJyxcblx0XHRcdHNpemU6IHNjcm9sbE9mZnNldEJ1ZmZlclNpemUgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQsXG5cdFx0XHR1c2FnZTogR1BVQnVmZmVyVXNhZ2UuVU5JRk9STSB8IEdQVUJ1ZmZlclVzYWdlLkNPUFlfRFNULFxuXHRcdH0pKS5vYmplY3Q7XG5cdFx0dGhpcy5fc2Nyb2xsT2Zmc2V0VmFsdWVCdWZmZXIgPSBuZXcgRmxvYXQzMkFycmF5KHNjcm9sbE9mZnNldEJ1ZmZlclNpemUpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBFdmVudCBoYW5kbGVyc1xuXG5cdC8vIFRoZSBwcmltYXJ5IGpvYiBvZiB0aGVzZSBoYW5kbGVycyBpcyB0bzpcblx0Ly8gMS4gSW52YWxpZGF0ZSB0aGUgdXAgdG8gZGF0ZSBsaW5lIGNhY2hlLCB3aGljaCB3aWxsIGNhdXNlIHRoZSBsaW5lIHRvIGJlIHJlLXJlbmRlcmVkIHdoZW5cblx0Ly8gICAgaXQncyBfd2l0aGluIHRoZSB2aWV3cG9ydF8uXG5cdC8vIDIuIFBhc3MgcmVsZXZhbnQgZXZlbnRzIG9uIHRvIHRoZSByZW5kZXIgZnVuY3Rpb24gc28gaXQgY2FuIGZvcmNlIGNlcnRhaW4gbGluZSByYW5nZXMgdG8gYmVcblx0Ly8gICAgcmUtcmVuZGVyZWQgZXZlbiBpZiB0aGV5J3JlIG5vdCBpbiB0aGUgdmlld3BvcnQuIEZvciBleGFtcGxlIHdoZW4gYSB2aWV3IHpvbmUgaXMgYWRkZWQsXG5cdC8vICAgIHRoZXJlIGFyZSBsaW5lcyB0aGF0IHVzZWQgdG8gYmUgdmlzaWJsZSBidXQgYXJlIG5vIGxvbmdlciwgc28gdGhvc2UgcmFuZ2VzIG11c3QgYmVcblx0Ly8gICAgY2xlYXJlZCBhbmQgdXBsb2FkZWQgdG8gdGhlIEdQVS5cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiBWaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2ludmFsaWRhdGVBbGxMaW5lcygpO1xuXHRcdHRoaXMuX3F1ZXVlQnVmZmVyVXBkYXRlKGUpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKGU6IFZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2ludmFsaWRhdGVBbGxMaW5lcygpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uVG9rZW5zQ2hhbmdlZChlOiBWaWV3VG9rZW5zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gVE9ETzogVGhpcyBjdXJyZW50bHkgZmlyZXMgZm9yIHRoZSBlbnRpcmUgdmlld3BvcnQgd2hlbmV2ZXIgc2Nyb2xsaW5nIHN0b3BzXG5cdFx0Ly8gICAgICAgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzMzk0MlxuXHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgZS5yYW5nZXMpIHtcblx0XHRcdHRoaXMuX2ludmFsaWRhdGVMaW5lUmFuZ2UocmFuZ2UuZnJvbUxpbmVOdW1iZXIsIHJhbmdlLnRvTGluZU51bWJlcik7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNEZWxldGVkKGU6IFZpZXdMaW5lc0RlbGV0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIFRPRE86IFRoaXMgY3VycmVudGx5IGludmFsaWRhdGVzIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIGRlbGV0ZWQgbGluZSwgaXQgY291bGQgc2hpZnQgdGhlXG5cdFx0Ly8gICAgICAgbGluZSBkYXRhIHVwIHRvIHJldGFpbiBzb21lIHVwIHRvIGRhdGUgbGluZXNcblx0XHQvLyBUT0RPOiBUaGlzIGRvZXMgbm90IGludmFsaWRhdGUgbGluZXMgdGhhdCBhcmUgbm8gbG9uZ2VyIGluIHRoZSBmaWxlXG5cdFx0dGhpcy5faW52YWxpZGF0ZUxpbmVzRnJvbShlLmZyb21MaW5lTnVtYmVyKTtcblx0XHR0aGlzLl9xdWV1ZUJ1ZmZlclVwZGF0ZShlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzSW5zZXJ0ZWQoZTogVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIFRPRE86IFRoaXMgY3VycmVudGx5IGludmFsaWRhdGVzIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIGRlbGV0ZWQgbGluZSwgaXQgY291bGQgc2hpZnQgdGhlXG5cdFx0Ly8gICAgICAgbGluZSBkYXRhIHVwIHRvIHJldGFpbiBzb21lIHVwIHRvIGRhdGUgbGluZXNcblx0XHR0aGlzLl9pbnZhbGlkYXRlTGluZXNGcm9tKGUuZnJvbUxpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNDaGFuZ2VkKGU6IFZpZXdMaW5lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2ludmFsaWRhdGVMaW5lUmFuZ2UoZS5mcm9tTGluZU51bWJlciwgZS5mcm9tTGluZU51bWJlciArIGUuY291bnQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uU2Nyb2xsQ2hhbmdlZChlPzogVmlld1Njcm9sbENoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGRwciA9IGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW87XG5cdFx0dGhpcy5fc2Nyb2xsT2Zmc2V0VmFsdWVCdWZmZXJbMF0gPSAoZT8uc2Nyb2xsTGVmdCA/PyB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbExlZnQoKSkgKiBkcHI7XG5cdFx0dGhpcy5fc2Nyb2xsT2Zmc2V0VmFsdWVCdWZmZXJbMV0gPSAoZT8uc2Nyb2xsVG9wID8/IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCkpICogZHByO1xuXHRcdHRoaXMuX2RldmljZS5xdWV1ZS53cml0ZUJ1ZmZlcih0aGlzLl9zY3JvbGxPZmZzZXRCaW5kQnVmZmVyLCAwLCB0aGlzLl9zY3JvbGxPZmZzZXRWYWx1ZUJ1ZmZlciBhcyBGbG9hdDMyQXJyYXk8QXJyYXlCdWZmZXI+KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvblRoZW1lQ2hhbmdlZChlOiBWaWV3VGhlbWVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9pbnZhbGlkYXRlQWxsTGluZXMoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVNYXBwaW5nQ2hhbmdlZChlOiBWaWV3TGluZU1hcHBpbmdDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9pbnZhbGlkYXRlQWxsTGluZXMoKTtcblx0XHR0aGlzLl9xdWV1ZUJ1ZmZlclVwZGF0ZShlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvblpvbmVzQ2hhbmdlZChlOiBWaWV3Wm9uZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9pbnZhbGlkYXRlQWxsTGluZXMoKTtcblx0XHR0aGlzLl9xdWV1ZUJ1ZmZlclVwZGF0ZShlKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgX2ludmFsaWRhdGVBbGxMaW5lcygpOiB2b2lkIHtcblx0XHR0aGlzLl91cFRvRGF0ZUxpbmVzWzBdLmNsZWFyKCk7XG5cdFx0dGhpcy5fdXBUb0RhdGVMaW5lc1sxXS5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZUxpbmVzRnJvbShsaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGkgb2YgWzAsIDFdKSB7XG5cdFx0XHRjb25zdCB1cFRvRGF0ZUxpbmVzID0gdGhpcy5fdXBUb0RhdGVMaW5lc1tpXTtcblx0XHRcdGZvciAoY29uc3QgdXBUb0RhdGVMaW5lIG9mIHVwVG9EYXRlTGluZXMpIHtcblx0XHRcdFx0aWYgKHVwVG9EYXRlTGluZSA+PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0dXBUb0RhdGVMaW5lcy5kZWxldGUodXBUb0RhdGVMaW5lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ludmFsaWRhdGVMaW5lUmFuZ2UoZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gZnJvbUxpbmVOdW1iZXI7IGkgPD0gdG9MaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdHRoaXMuX3VwVG9EYXRlTGluZXNbMF0uZGVsZXRlKGkpO1xuXHRcdFx0dGhpcy5fdXBUb0RhdGVMaW5lc1sxXS5kZWxldGUoaSk7XG5cdFx0fVxuXHR9XG5cblx0cmVzZXQoKSB7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUFsbExpbmVzKCk7XG5cdFx0Zm9yIChjb25zdCBidWZmZXJJbmRleCBvZiBbMCwgMV0pIHtcblx0XHRcdC8vIFplcm8gb3V0IGJ1ZmZlciBhbmQgdXBsb2FkIHRvIEdQVSB0byBwcmV2ZW50IHN0YWxlIHJvd3MgZnJvbSByZW5kZXJpbmdcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5fY2VsbFZhbHVlQnVmZmVyc1tidWZmZXJJbmRleF0pO1xuXHRcdFx0YnVmZmVyLmZpbGwoMCwgMCwgYnVmZmVyLmxlbmd0aCk7XG5cdFx0XHR0aGlzLl9kZXZpY2UucXVldWUud3JpdGVCdWZmZXIodGhpcy5fY2VsbEJpbmRCdWZmZXIsIDAsIGJ1ZmZlci5idWZmZXIsIDAsIGJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0XHR9XG5cdFx0dGhpcy5fZmluYWxSZW5kZXJlZExpbmUgPSAwO1xuXHR9XG5cblx0dXBkYXRlKHZpZXdwb3J0RGF0YTogVmlld3BvcnREYXRhLCB2aWV3TGluZU9wdGlvbnM6IFZpZXdMaW5lT3B0aW9ucyk6IG51bWJlciB7XG5cdFx0Ly8gSU1QT1JUQU5UOiBUaGlzIGlzIGEgaG90IGZ1bmN0aW9uLiBWYXJpYWJsZXMgYXJlIHByZS1hbGxvY2F0ZWQgYW5kIHNoYXJlZCB3aXRoaW4gdGhlXG5cdFx0Ly8gbG9vcC4gVGhpcyBpcyBkb25lIHNvIHdlIGRvbid0IG5lZWQgdG8gdHJ1c3QgdGhlIEpJVCBjb21waWxlciB0byBkbyB0aGlzIG9wdGltaXphdGlvbiB0b1xuXHRcdC8vIGF2b2lkIHBvdGVudGlhbCBhZGRpdGlvbmFsIGJsb2NraW5nIHRpbWUgaW4gZ2FyYmFnZSBjb2xsZWN0b3Igd2hpY2ggaXMgYSBjb21tb24gY2F1c2Ugb2Zcblx0XHQvLyBkcm9wcGVkIGZyYW1lcy5cblxuXHRcdGxldCBjaGFycyA9ICcnO1xuXHRcdGxldCBzZWdtZW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoYXJXaWR0aCA9IDA7XG5cdFx0bGV0IHkgPSAwO1xuXHRcdGxldCB4ID0gMDtcblx0XHRsZXQgYWJzb2x1dGVPZmZzZXRYID0gMDtcblx0XHRsZXQgYWJzb2x1dGVPZmZzZXRZID0gMDtcblx0XHRsZXQgdGFiWE9mZnNldCA9IDA7XG5cdFx0bGV0IGdseXBoOiBSZWFkb25seTxJVGV4dHVyZUF0bGFzUGFnZUdseXBoPjtcblx0XHRsZXQgY2VsbEluZGV4ID0gMDtcblxuXHRcdGxldCB0b2tlblN0YXJ0SW5kZXggPSAwO1xuXHRcdGxldCB0b2tlbkVuZEluZGV4ID0gMDtcblx0XHRsZXQgdG9rZW5NZXRhZGF0YSA9IDA7XG5cblx0XHRsZXQgZGVjb3JhdGlvblN0eWxlU2V0Qm9sZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVjb3JhdGlvblN0eWxlU2V0Q29sb3I6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVjb3JhdGlvblN0eWxlU2V0T3BhY2l0eTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoVGhpY2tuZXNzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hDb2xvcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGxpbmVEYXRhOiBWaWV3TGluZVJlbmRlcmluZ0RhdGE7XG5cdFx0bGV0IGRlY29yYXRpb246IElubGluZURlY29yYXRpb247XG5cdFx0bGV0IGZpbGxTdGFydEluZGV4ID0gMDtcblx0XHRsZXQgZmlsbEVuZEluZGV4ID0gMDtcblxuXHRcdGxldCB0b2tlbnM6IElWaWV3TGluZVRva2VucztcblxuXHRcdGNvbnN0IGRwciA9IGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW87XG5cdFx0bGV0IGNvbnRlbnRTZWdtZW50ZXI6IElDb250ZW50U2VnbWVudGVyO1xuXG5cdFx0aWYgKCF0aGlzLl9zY3JvbGxJbml0aWFsaXplZCkge1xuXHRcdFx0dGhpcy5vblNjcm9sbENoYW5nZWQoKTtcblx0XHRcdHRoaXMuX3Njcm9sbEluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY2VsbCBkYXRhXG5cdFx0Y29uc3QgY2VsbEJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5fY2VsbFZhbHVlQnVmZmVyc1t0aGlzLl9hY3RpdmVEb3VibGVCdWZmZXJJbmRleF0pO1xuXHRcdGNvbnN0IGxpbmVJbmRleENvdW50ID0gRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXG5cdFx0Y29uc3QgdXBUb0RhdGVMaW5lcyA9IHRoaXMuX3VwVG9EYXRlTGluZXNbdGhpcy5fYWN0aXZlRG91YmxlQnVmZmVySW5kZXhdO1xuXHRcdGxldCBkaXJ0eUxpbmVTdGFydCA9IDMwMDA7XG5cdFx0bGV0IGRpcnR5TGluZUVuZCA9IDA7XG5cblx0XHQvLyBIYW5kbGUgYW55IHF1ZXVlZCBidWZmZXIgdXBkYXRlc1xuXHRcdGNvbnN0IHF1ZXVlZEJ1ZmZlclVwZGF0ZXMgPSB0aGlzLl9xdWV1ZWRCdWZmZXJVcGRhdGVzW3RoaXMuX2FjdGl2ZURvdWJsZUJ1ZmZlckluZGV4XTtcblx0XHR3aGlsZSAocXVldWVkQnVmZmVyVXBkYXRlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGUgPSBxdWV1ZWRCdWZmZXJVcGRhdGVzLnNoaWZ0KCkhO1xuXHRcdFx0c3dpdGNoIChlLnR5cGUpIHtcblx0XHRcdFx0Ly8gVE9ETzogUmVmaW5lIHRoZXNlIGNhc2VzIHNvIHdlJ3JlIG5vdCB0aHJvd2luZyBhd2F5IGV2ZXJ5dGhpbmdcblx0XHRcdFx0Y2FzZSBWaWV3RXZlbnRUeXBlLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZDpcblx0XHRcdFx0Y2FzZSBWaWV3RXZlbnRUeXBlLlZpZXdMaW5lTWFwcGluZ0NoYW5nZWQ6XG5cdFx0XHRcdGNhc2UgVmlld0V2ZW50VHlwZS5WaWV3Wm9uZXNDaGFuZ2VkOiB7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlci5maWxsKDApO1xuXG5cdFx0XHRcdFx0ZGlydHlMaW5lU3RhcnQgPSAxO1xuXHRcdFx0XHRcdGRpcnR5TGluZUVuZCA9IE1hdGgubWF4KGRpcnR5TGluZUVuZCwgdGhpcy5fZmluYWxSZW5kZXJlZExpbmUpO1xuXHRcdFx0XHRcdHRoaXMuX2ZpbmFsUmVuZGVyZWRMaW5lID0gMDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFZpZXdFdmVudFR5cGUuVmlld0xpbmVzRGVsZXRlZDoge1xuXHRcdFx0XHRcdC8vIFNoaWZ0IGNvbnRlbnQgYmVsb3cgZGVsZXRlZCBsaW5lIHVwXG5cdFx0XHRcdFx0Y29uc3QgZGVsZXRlZExpbmVDb250ZW50U3RhcnRJbmRleCA9IChlLmZyb21MaW5lTnVtYmVyIC0gMSkgKiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRcdFx0Y29uc3QgZGVsZXRlZExpbmVDb250ZW50RW5kSW5kZXggPSAoZS50b0xpbmVOdW1iZXIpICogRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0XHRcdGNvbnN0IG51bGxDb250ZW50U3RhcnRJbmRleCA9ICh0aGlzLl9maW5hbFJlbmRlcmVkTGluZSAtIChlLnRvTGluZU51bWJlciAtIGUuZnJvbUxpbmVOdW1iZXIgKyAxKSkgKiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlci5zZXQoY2VsbEJ1ZmZlci5zdWJhcnJheShkZWxldGVkTGluZUNvbnRlbnRFbmRJbmRleCksIGRlbGV0ZWRMaW5lQ29udGVudFN0YXJ0SW5kZXgpO1xuXG5cdFx0XHRcdFx0Ly8gWmVybyBvdXQgY29udGVudCBvbiBsaW5lcyB0aGF0IGFyZSBubyBsb25nZXIgdmFsaWRcblx0XHRcdFx0XHRjZWxsQnVmZmVyLmZpbGwoMCwgbnVsbENvbnRlbnRTdGFydEluZGV4KTtcblxuXHRcdFx0XHRcdC8vIFVwZGF0ZSBkaXJ0eSBsaW5lcyBhbmQgZmluYWwgcmVuZGVyZWQgbGluZVxuXHRcdFx0XHRcdGRpcnR5TGluZVN0YXJ0ID0gTWF0aC5taW4oZGlydHlMaW5lU3RhcnQsIGUuZnJvbUxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGRpcnR5TGluZUVuZCA9IE1hdGgubWF4KGRpcnR5TGluZUVuZCwgdGhpcy5fZmluYWxSZW5kZXJlZExpbmUpO1xuXHRcdFx0XHRcdHRoaXMuX2ZpbmFsUmVuZGVyZWRMaW5lIC09IGUudG9MaW5lTnVtYmVyIC0gZS5mcm9tTGluZU51bWJlciArIDE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKHkgPSB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyOyB5IDw9IHZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyOyB5KyspIHtcblxuXHRcdFx0Ly8gT25seSBhdHRlbXB0IHRvIHJlbmRlciBsaW5lcyB0aGF0IHRoZSBHUFUgcmVuZGVyZXIgY2FuIGhhbmRsZVxuXHRcdFx0aWYgKCF0aGlzLl92aWV3R3B1Q29udGV4dC5jYW5SZW5kZXIodmlld0xpbmVPcHRpb25zLCB2aWV3cG9ydERhdGEsIHkpKSB7XG5cdFx0XHRcdGZpbGxTdGFydEluZGV4ID0gKCh5IC0gMSkgKiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMpICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0XHRmaWxsRW5kSW5kZXggPSAoeSAqIEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucykgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRcdGNlbGxCdWZmZXIuZmlsbCgwLCBmaWxsU3RhcnRJbmRleCwgZmlsbEVuZEluZGV4KTtcblxuXHRcdFx0XHRkaXJ0eUxpbmVTdGFydCA9IE1hdGgubWluKGRpcnR5TGluZVN0YXJ0LCB5KTtcblx0XHRcdFx0ZGlydHlMaW5lRW5kID0gTWF0aC5tYXgoZGlydHlMaW5lRW5kLCB5KTtcblxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2tpcCB1cGRhdGluZyB0aGUgbGluZSBpZiBpdCdzIGFscmVhZHkgdXAgdG8gZGF0ZVxuXHRcdFx0aWYgKHVwVG9EYXRlTGluZXMuaGFzKHkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRkaXJ0eUxpbmVTdGFydCA9IE1hdGgubWluKGRpcnR5TGluZVN0YXJ0LCB5KTtcblx0XHRcdGRpcnR5TGluZUVuZCA9IE1hdGgubWF4KGRpcnR5TGluZUVuZCwgeSk7XG5cblx0XHRcdGxpbmVEYXRhID0gdmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YSh5KTtcblx0XHRcdHRhYlhPZmZzZXQgPSAwO1xuXG5cdFx0XHRjb250ZW50U2VnbWVudGVyID0gY3JlYXRlQ29udGVudFNlZ21lbnRlcihsaW5lRGF0YSwgdmlld0xpbmVPcHRpb25zKTtcblx0XHRcdGNoYXJXaWR0aCA9IHZpZXdMaW5lT3B0aW9ucy5zcGFjZVdpZHRoICogZHByO1xuXHRcdFx0YWJzb2x1dGVPZmZzZXRYID0gKGxpbmVEYXRhLm1pbkNvbHVtbiAtIDEpICogY2hhcldpZHRoO1xuXG5cdFx0XHR0b2tlbnMgPSBsaW5lRGF0YS50b2tlbnM7XG5cdFx0XHR0b2tlblN0YXJ0SW5kZXggPSBsaW5lRGF0YS5taW5Db2x1bW4gLSAxO1xuXHRcdFx0dG9rZW5FbmRJbmRleCA9IDA7XG5cdFx0XHRmb3IgKGxldCB0b2tlbkluZGV4ID0gMCwgdG9rZW5zTGVuID0gdG9rZW5zLmdldENvdW50KCk7IHRva2VuSW5kZXggPCB0b2tlbnNMZW47IHRva2VuSW5kZXgrKykge1xuXHRcdFx0XHR0b2tlbkVuZEluZGV4ID0gdG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0aWYgKHRva2VuRW5kSW5kZXggPD0gdG9rZW5TdGFydEluZGV4KSB7XG5cdFx0XHRcdFx0Ly8gVGhlIGZhdXggaW5kZW50IHBhcnQgb2YgdGhlIGxpbmUgc2hvdWxkIGhhdmUgbm8gdG9rZW4gdHlwZVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dG9rZW5NZXRhZGF0YSA9IHRva2Vucy5nZXRNZXRhZGF0YSh0b2tlbkluZGV4KTtcblxuXHRcdFx0XHRmb3IgKHggPSB0b2tlblN0YXJ0SW5kZXg7IHggPCB0b2tlbkVuZEluZGV4OyB4KyspIHtcblx0XHRcdFx0XHQvLyBPbmx5IHJlbmRlciBsaW5lcyB0aGF0IGRvIG5vdCBleGNlZWQgbWF4aW11bSBjb2x1bW5zXG5cdFx0XHRcdFx0aWYgKHggPiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzZWdtZW50ID0gY29udGVudFNlZ21lbnRlci5nZXRTZWdtZW50QXRJbmRleCh4KTtcblx0XHRcdFx0XHRpZiAoc2VnbWVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hhcnMgPSBzZWdtZW50O1xuXG5cdFx0XHRcdFx0aWYgKCEobGluZURhdGEuaXNCYXNpY0FTQ0lJICYmIHZpZXdMaW5lT3B0aW9ucy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zKSkge1xuXHRcdFx0XHRcdFx0Y2hhcldpZHRoID0gdGhpcy5nbHlwaFJhc3Rlcml6ZXIuZ2V0VGV4dE1ldHJpY3MoY2hhcnMpLndpZHRoO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldENvbG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldEJvbGQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0T3BhY2l0eSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hUaGlja25lc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaENvbG9yID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0Ly8gQXBwbHkgc3VwcG9ydGVkIGlubGluZSBkZWNvcmF0aW9uIHN0eWxlcyB0byB0aGUgY2VsbCBtZXRhZGF0YVxuXHRcdFx0XHRcdGZvciAoZGVjb3JhdGlvbiBvZiBsaW5lRGF0YS5pbmxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBpcyBSYW5nZS5zdHJpY3RDb250YWluc1Bvc2l0aW9uIGV4Y2VwdCBpdCB3b3JrcyBhdCB0aGUgY2VsbCBsZXZlbCxcblx0XHRcdFx0XHRcdC8vIGl0J3MgYWxzbyBpbmxpbmVkIHRvIGF2b2lkIG92ZXJoZWFkLlxuXHRcdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0XHQoeSA8IGRlY29yYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIHx8IHkgPiBkZWNvcmF0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXIpIHx8XG5cdFx0XHRcdFx0XHRcdCh5ID09PSBkZWNvcmF0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiB4IDwgZGVjb3JhdGlvbi5yYW5nZS5zdGFydENvbHVtbiAtIDEpIHx8XG5cdFx0XHRcdFx0XHRcdCh5ID09PSBkZWNvcmF0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXIgJiYgeCA+PSBkZWNvcmF0aW9uLnJhbmdlLmVuZENvbHVtbiAtIDEpXG5cdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IHJ1bGVzID0gVmlld0dwdUNvbnRleHQuZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IuZ2V0U3R5bGVSdWxlcyh0aGlzLl92aWV3R3B1Q29udGV4dC5jYW52YXMuZG9tTm9kZSwgZGVjb3JhdGlvbi5pbmxpbmVDbGFzc05hbWUpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBydWxlIG9mIHJ1bGVzKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgciBvZiBydWxlLnN0eWxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBydWxlLnN0eWxlTWFwLmdldChyKT8udG9TdHJpbmcoKSA/PyAnJztcblx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggKHIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ2NvbG9yJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBUT0RPOiBUaGlzIHBhcnNpbmcgYW5kIGVycm9yIGhhbmRsaW5nIHNob3VsZCBtb3ZlIGludG8gY2FuUmVuZGVyIHNvIGZhbGxiYWNrXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC8vICAgICAgIHRvIERPTSB3b3Jrc1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBwYXJzZWRDb2xvciA9IENvbG9yLkZvcm1hdC5DU1MucGFyc2UodmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoIXBhcnNlZENvbG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignSW52YWxpZCBjb2xvciBmb3JtYXQgJyArIHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRDb2xvciA9IHBhcnNlZENvbG9yLnRvTnVtYmVyMzJCaXQoKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICdmb250LXdlaWdodCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFyc2VkVmFsdWUgPSBwYXJzZUNzc0ZvbnRXZWlnaHQodmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAocGFyc2VkVmFsdWUgPj0gNDAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0Qm9sZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gVE9ETzogU2V0IGJvbGQgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzc1ODQpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0Qm9sZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIFRPRE86IFNldCBub3JtYWwgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzc1ODQpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICdvcGFjaXR5Jzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBwYXJzZWRWYWx1ZSA9IHBhcnNlQ3NzT3BhY2l0eSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldE9wYWNpdHkgPSBwYXJzZWRWYWx1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24nOlxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uLWxpbmUnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gJ2xpbmUtdGhyb3VnaCcpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL14oXFxkKyg/OlxcLlxcZCspPylweCQvKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaFRoaWNrbmVzcyA9IHBhcnNlRmxvYXQobWF0Y2hbMV0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uLWNvbG9yJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRsZXQgY29sb3JWYWx1ZSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB2YXJNYXRjaCA9IHZhbHVlLm1hdGNoKC9edmFyXFwoKC0tW14sXSspLFxccyooPzppbml0aWFsfGluaGVyaXQpXFwpJC8pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAodmFyTWF0Y2gpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb2xvclZhbHVlID0gVmlld0dwdUNvbnRleHQuZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IucmVzb2x2ZUNzc1ZhcmlhYmxlKHRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhbnZhcy5kb21Ob2RlLCB2YXJNYXRjaFsxXSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFyc2VkQ29sb3IgPSBDb2xvci5Gb3JtYXQuQ1NTLnBhcnNlKGNvbG9yVmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAocGFyc2VkQ29sb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoQ29sb3IgPSBwYXJzZWRDb2xvci50b051bWJlcjMyQml0KCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24tc3R5bGUnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdC8vIFRoZXNlIGFyZSB2YWxpZGF0ZWQgaW4gY2FuUmVuZGVyIGFuZCB1c2UgZGVmYXVsdCBiZWhhdmlvclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1VuZXhwZWN0ZWQgaW5saW5lIGRlY29yYXRpb24gc3R5bGUnKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoY2hhcnMgPT09ICcgJyB8fCBjaGFycyA9PT0gJ1xcdCcpIHtcblx0XHRcdFx0XHRcdC8vIFplcm8gb3V0IGdseXBoIHRvIGVuc3VyZSBpdCBkb2Vzbid0IGdldCByZW5kZXJlZFxuXHRcdFx0XHRcdFx0Y2VsbEluZGV4ID0gKCh5IC0gMSkgKiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMgKyB4KSAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblx0XHRcdFx0XHRcdGNlbGxCdWZmZXIuZmlsbCgwLCBjZWxsSW5kZXgsIGNlbGxJbmRleCArIENlbGxCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5KTtcblx0XHRcdFx0XHRcdC8vIEFkanVzdCB4T2Zmc2V0IGZvciB0YWIgc3RvcHNcblx0XHRcdFx0XHRcdGlmIChjaGFycyA9PT0gJ1xcdCcpIHtcblx0XHRcdFx0XHRcdFx0Ly8gRmluZCB0aGUgcGl4ZWwgb2Zmc2V0IGJldHdlZW4gdGhlIGN1cnJlbnQgcG9zaXRpb24gYW5kIHRoZSBuZXh0IHRhYiBzdG9wXG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9mZnNldEJlZm9yZSA9IHggKyB0YWJYT2Zmc2V0O1xuXHRcdFx0XHRcdFx0XHR0YWJYT2Zmc2V0ID0gQ3Vyc29yQ29sdW1ucy5uZXh0UmVuZGVyVGFiU3RvcCh4ICsgdGFiWE9mZnNldCwgbGluZURhdGEudGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRcdGFic29sdXRlT2Zmc2V0WCArPSBjaGFyV2lkdGggKiAodGFiWE9mZnNldCAtIG9mZnNldEJlZm9yZSk7XG5cdFx0XHRcdFx0XHRcdC8vIENvbnZlcnQgYmFjayB0byBvZmZzZXQgZXhjbHVkaW5nIHggYW5kIHRoZSBjdXJyZW50IGNoYXJhY3RlclxuXHRcdFx0XHRcdFx0XHR0YWJYT2Zmc2V0IC09IHggKyAxO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YWJzb2x1dGVPZmZzZXRYICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25TdHlsZVNldElkID0gVmlld0dwdUNvbnRleHQuZGVjb3JhdGlvblN0eWxlQ2FjaGUuZ2V0T3JDcmVhdGVFbnRyeShkZWNvcmF0aW9uU3R5bGVTZXRDb2xvciwgZGVjb3JhdGlvblN0eWxlU2V0Qm9sZCwgZGVjb3JhdGlvblN0eWxlU2V0T3BhY2l0eSwgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaCwgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaFRoaWNrbmVzcywgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaENvbG9yKTtcblx0XHRcdFx0XHRnbHlwaCA9IHRoaXMuX3ZpZXdHcHVDb250ZXh0LmF0bGFzLmdldEdseXBoKHRoaXMuZ2x5cGhSYXN0ZXJpemVyLCBjaGFycywgdG9rZW5NZXRhZGF0YSwgZGVjb3JhdGlvblN0eWxlU2V0SWQsIGFic29sdXRlT2Zmc2V0WCk7XG5cblx0XHRcdFx0XHRhYnNvbHV0ZU9mZnNldFkgPSBNYXRoLnJvdW5kKFxuXHRcdFx0XHRcdFx0Ly8gVG9wIG9mIGxheW91dCBib3ggKGluY2x1ZGVzIGxpbmUgaGVpZ2h0KVxuXHRcdFx0XHRcdFx0dmlld3BvcnREYXRhLnJlbGF0aXZlVmVydGljYWxPZmZzZXRbeSAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXJdICogZHByICtcblxuXHRcdFx0XHRcdFx0Ly8gRGVsdGEgZnJvbSB0b3Agb2YgbGF5b3V0IGJveCAoaW5jbHVkZXMgbGluZSBoZWlnaHQpIHRvIHRvcCBvZiB0aGUgaW5saW5lIGJveCAobm8gbGluZSBoZWlnaHQpXG5cdFx0XHRcdFx0XHRNYXRoLmZsb29yKCh2aWV3cG9ydERhdGEubGluZUhlaWdodCAqIGRwciAtIChnbHlwaC5mb250Qm91bmRpbmdCb3hBc2NlbnQgKyBnbHlwaC5mb250Qm91bmRpbmdCb3hEZXNjZW50KSkgLyAyKSArXG5cblx0XHRcdFx0XHRcdC8vIERlbHRhIGZyb20gdG9wIG9mIGlubGluZSBib3ggKG5vIGxpbmUgaGVpZ2h0KSB0byB0b3Agb2YgZ2x5cGggb3JpZ2luLiBJZiB0aGUgZ2x5cGggd2FzIGRyYXduXG5cdFx0XHRcdFx0XHQvLyB3aXRoIGEgdG9wIGJhc2VsaW5lIGZvciBleGFtcGxlLCB0aGlzIGVuZHMgdXAgZHJhd2luZyB0aGUgZ2x5cGggY29ycmVjdGx5IHVzaW5nIHRoZSBhbHBoYWJldGljYWxcblx0XHRcdFx0XHRcdC8vIGJhc2VsaW5lLlxuXHRcdFx0XHRcdFx0Z2x5cGguZm9udEJvdW5kaW5nQm94QXNjZW50XG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGNlbGxJbmRleCA9ICgoeSAtIDEpICogRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICsgeCkgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlcltjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5PZmZzZXRfWF0gPSBNYXRoLmZsb29yKGFic29sdXRlT2Zmc2V0WCk7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlcltjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5PZmZzZXRfWV0gPSBhYnNvbHV0ZU9mZnNldFk7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlcltjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5HbHlwaEluZGV4XSA9IGdseXBoLmdseXBoSW5kZXg7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlcltjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5UZXh0dXJlSW5kZXhdID0gZ2x5cGgucGFnZUluZGV4O1xuXG5cdFx0XHRcdFx0Ly8gQWRqdXN0IHRoZSB4IHBpeGVsIG9mZnNldCBmb3IgdGhlIG5leHQgY2hhcmFjdGVyXG5cdFx0XHRcdFx0YWJzb2x1dGVPZmZzZXRYICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRva2VuU3RhcnRJbmRleCA9IHRva2VuRW5kSW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENsZWFyIHRvIGVuZCBvZiBsaW5lXG5cdFx0XHRmaWxsU3RhcnRJbmRleCA9ICgoeSAtIDEpICogRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICsgdG9rZW5FbmRJbmRleCkgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRmaWxsRW5kSW5kZXggPSAoeSAqIEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucykgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRjZWxsQnVmZmVyLmZpbGwoMCwgZmlsbFN0YXJ0SW5kZXgsIGZpbGxFbmRJbmRleCk7XG5cblx0XHRcdHVwVG9EYXRlTGluZXMuYWRkKHkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpc2libGVPYmplY3RDb3VudCA9ICh2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlciAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIgKyAxKSAqIGxpbmVJbmRleENvdW50O1xuXG5cdFx0Ly8gT25seSB3cml0ZSB3aGVuIHRoZXJlIGlzIGNoYW5nZWQgZGF0YVxuXHRcdGRpcnR5TGluZVN0YXJ0ID0gTWF0aC5taW4oZGlydHlMaW5lU3RhcnQsIEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkTGluZXMpO1xuXHRcdGRpcnR5TGluZUVuZCA9IE1hdGgubWluKGRpcnR5TGluZUVuZCwgRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRMaW5lcyk7XG5cdFx0aWYgKGRpcnR5TGluZVN0YXJ0IDw9IGRpcnR5TGluZUVuZCkge1xuXHRcdFx0Ly8gV3JpdGUgYnVmZmVyIGFuZCBzd2FwIGl0IG91dCB0byB1bmJsb2NrIHdyaXRlc1xuXHRcdFx0dGhpcy5fZGV2aWNlLnF1ZXVlLndyaXRlQnVmZmVyKFxuXHRcdFx0XHR0aGlzLl9jZWxsQmluZEJ1ZmZlcixcblx0XHRcdFx0KGRpcnR5TGluZVN0YXJ0IC0gMSkgKiBsaW5lSW5kZXhDb3VudCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCxcblx0XHRcdFx0Y2VsbEJ1ZmZlci5idWZmZXIsXG5cdFx0XHRcdChkaXJ0eUxpbmVTdGFydCAtIDEpICogbGluZUluZGV4Q291bnQgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQsXG5cdFx0XHRcdChkaXJ0eUxpbmVFbmQgLSBkaXJ0eUxpbmVTdGFydCArIDEpICogbGluZUluZGV4Q291bnQgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlRcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZmluYWxSZW5kZXJlZExpbmUgPSBNYXRoLm1heCh0aGlzLl9maW5hbFJlbmRlcmVkTGluZSwgZGlydHlMaW5lRW5kKTtcblxuXHRcdHRoaXMuX2FjdGl2ZURvdWJsZUJ1ZmZlckluZGV4ID0gdGhpcy5fYWN0aXZlRG91YmxlQnVmZmVySW5kZXggPyAwIDogMTtcblxuXHRcdHRoaXMuX3Zpc2libGVPYmplY3RDb3VudCA9IHZpc2libGVPYmplY3RDb3VudDtcblxuXHRcdHJldHVybiB2aXNpYmxlT2JqZWN0Q291bnQ7XG5cdH1cblxuXHRkcmF3KHBhc3M6IEdQVVJlbmRlclBhc3NFbmNvZGVyLCB2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aXNpYmxlT2JqZWN0Q291bnQgPD0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQXR0ZW1wdCB0byBkcmF3IDAgb2JqZWN0cycpO1xuXHRcdH1cblx0XHRwYXNzLmRyYXcoXG5cdFx0XHRxdWFkVmVydGljZXMubGVuZ3RoIC8gMixcblx0XHRcdHRoaXMuX3Zpc2libGVPYmplY3RDb3VudCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCh2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyIC0gMSkgKiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnNcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFF1ZXVlIHVwZGF0ZXMgdGhhdCBuZWVkIHRvIGhhcHBlbiBvbiB0aGUgYWN0aXZlIGJ1ZmZlciwgbm90IGp1c3QgdGhlIGNhY2hlLiBUaGlzIHdpbGwgYmVcblx0ICogZGVmZXJyZWQgdG8gd2hlbiB0aGUgYWN0dWFsIGNlbGwgYnVmZmVyIGlzIGNoYW5nZWQgc2luY2UgdGhlIGFjdGl2ZSBidWZmZXIgY291bGQgYmUgbG9ja2VkIGJ5XG5cdCAqIHRoZSBHUFUgd2hpY2ggd291bGQgYmxvY2sgdGhlIG1haW4gdGhyZWFkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcXVldWVCdWZmZXJVcGRhdGUoZTogUXVldWVkQnVmZmVyRXZlbnQpIHtcblx0XHR0aGlzLl9xdWV1ZWRCdWZmZXJVcGRhdGVzWzBdLnB1c2goZSk7XG5cdFx0dGhpcy5fcXVldWVkQnVmZmVyVXBkYXRlc1sxXS5wdXNoKGUpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHBhcnNlQ3NzRm9udFdlaWdodCh2YWx1ZTogc3RyaW5nKSB7XG5cdHN3aXRjaCAodmFsdWUpIHtcblx0XHRjYXNlICdsaWdodGVyJzpcblx0XHRjYXNlICdub3JtYWwnOiByZXR1cm4gNDAwO1xuXHRcdGNhc2UgJ2JvbGRlcic6XG5cdFx0Y2FzZSAnYm9sZCc6IHJldHVybiA3MDA7XG5cdH1cblx0cmV0dXJuIHBhcnNlSW50KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VDc3NPcGFjaXR5KHZhbHVlOiBzdHJpbmcpOiBudW1iZXIge1xuXHRpZiAodmFsdWUuZW5kc1dpdGgoJyUnKSkge1xuXHRcdHJldHVybiBwYXJzZUZsb2F0KHZhbHVlLnN1YnN0cmluZygwLCB2YWx1ZS5sZW5ndGggLSAxKSkgLyAxMDA7XG5cdH1cblx0aWYgKHZhbHVlLm1hdGNoKC9eXFxkKyg/OlxcLlxcZCopLykpIHtcblx0XHRyZXR1cm4gcGFyc2VGbG9hdCh2YWx1ZSk7XG5cdH1cblx0cmV0dXJuIDE7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxxQkFBb1U7QUFNN1UsU0FBUyw4QkFBc0Q7QUFDL0QsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFHbkMsSUFBVyxZQUFYLGtCQUFXQSxlQUFYO0FBQ0MsRUFBQUEsc0JBQUEsb0JBQWlCLEtBQWpCO0FBRFUsU0FBQUE7QUFBQSxHQUFBO0FBSVgsSUFBVyxpQkFBWCxrQkFBV0Msb0JBQVg7QUFDQyxFQUFBQSxnQ0FBQSxvQkFBaUIsS0FBakI7QUFDQSxFQUFBQSxnQ0FBQSxtQkFBZ0IsTUFBaEI7QUFDQSxFQUFBQSxnQ0FBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSxnQ0FBQSxjQUFXLEtBQVg7QUFDQSxFQUFBQSxnQ0FBQSxvQkFBaUIsS0FBakI7QUFDQSxFQUFBQSxnQ0FBQSxvQkFBaUIsS0FBakI7QUFDQSxFQUFBQSxnQ0FBQSxnQkFBYSxLQUFiO0FBQ0EsRUFBQUEsZ0NBQUEsa0JBQWUsS0FBZjtBQVJVLFNBQUFBO0FBQUEsR0FBQTtBQXVCSixNQUFNLDBCQUFOLE1BQU0sZ0NBQStCLG1CQUFtQjtBQUFBLEVBeUM5RCxZQUNDLFNBQ0EsZ0JBQ0EsUUFDQSxpQkFDQztBQUNELFVBQU0sU0FBUyxnQkFBZ0IsUUFBUSxlQUFlO0FBbkN2RCxTQUFTLE9BQU87QUFDaEIsU0FBUyxPQUFlO0FBU3hCLFNBQVEsMkJBQWtDO0FBRTFDLFNBQWlCLGlCQUE2QyxDQUFDLG9CQUFJLElBQUksR0FBRyxvQkFBSSxJQUFJLENBQUM7QUFDbkYs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
