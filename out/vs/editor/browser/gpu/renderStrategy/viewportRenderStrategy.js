import { getActiveWindow } from "../../../../base/browser/dom.js";
import { Color } from "../../../../base/common/color.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { CursorColumns } from "../../../common/core/cursorColumns.js";
import { createContentSegmenter } from "../contentSegmenter.js";
import { BindingId } from "../gpu.js";
import { GPULifecycle } from "../gpuDisposable.js";
import { quadVertices } from "../gpuUtils.js";
import { ViewGpuContext } from "../viewGpuContext.js";
import { BaseRenderStrategy } from "./baseRenderStrategy.js";
import { fullFileRenderStrategyWgsl } from "./fullFileRenderStrategy.wgsl.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["IndicesPerCell"] = 6] = "IndicesPerCell";
  Constants2[Constants2["CellBindBufferCapacityIncrement"] = 32] = "CellBindBufferCapacityIncrement";
  Constants2[Constants2["CellBindBufferInitialCapacity"] = 63] = "CellBindBufferInitialCapacity";
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
const _ViewportRenderStrategy = class _ViewportRenderStrategy extends BaseRenderStrategy {
  constructor(context, viewGpuContext, device, glyphRasterizer) {
    super(context, viewGpuContext, device, glyphRasterizer);
    this.type = "viewport";
    this.wgsl = fullFileRenderStrategyWgsl;
    this._cellBindBufferLineCapacity = 63 /* CellBindBufferInitialCapacity */;
    this._activeDoubleBufferIndex = 0;
    this._visibleObjectCount = 0;
    this._lastViewportLineCount = 0;
    this._scrollInitialized = false;
    this._onDidChangeBindGroupEntries = this._register(new Emitter());
    this.onDidChangeBindGroupEntries = this._onDidChangeBindGroupEntries.event;
    this._rebuildCellBuffer(this._cellBindBufferLineCapacity);
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
  _rebuildCellBuffer(lineCount) {
    this._cellBindBuffer?.destroy();
    const lineCountWithIncrement = (Math.floor(lineCount / 32 /* CellBindBufferCapacityIncrement */) + 1) * 32 /* CellBindBufferCapacityIncrement */;
    const bufferSize = lineCountWithIncrement * _ViewportRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */ * Float32Array.BYTES_PER_ELEMENT;
    this._cellBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco full file cell buffer",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })).object;
    this._cellValueBuffers = [
      new ArrayBuffer(bufferSize),
      new ArrayBuffer(bufferSize)
    ];
    this._cellBindBufferLineCapacity = lineCountWithIncrement;
    this._lastViewportLineCount = 0;
    this._onDidChangeBindGroupEntries.fire();
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
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onTokensChanged(e) {
    return true;
  }
  onLinesDeleted(e) {
    return true;
  }
  onLinesInserted(e) {
    return true;
  }
  onLinesChanged(e) {
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
    return true;
  }
  onLineMappingChanged(e) {
    return true;
  }
  onZonesChanged(e) {
    return true;
  }
  // #endregion
  reset() {
    for (const bufferIndex of [0, 1]) {
      const buffer = new Float32Array(this._cellValueBuffers[bufferIndex]);
      buffer.fill(0, 0, buffer.length);
      this._device.queue.writeBuffer(this._cellBindBuffer, 0, buffer.buffer, 0, buffer.byteLength);
    }
    this._lastViewportLineCount = 0;
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
    if (this._cellBindBufferLineCapacity < viewportData.endLineNumber - viewportData.startLineNumber + 1) {
      this._rebuildCellBuffer(viewportData.endLineNumber - viewportData.startLineNumber + 1);
    }
    const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
    cellBuffer.fill(0);
    const lineIndexCount = _ViewportRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
    for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {
      if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, y)) {
        continue;
      }
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
          if (x > _ViewportRenderStrategy.maxSupportedColumns) {
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
            cellIndex = ((y - 1) * _ViewportRenderStrategy.maxSupportedColumns + x) * 6 /* IndicesPerCell */;
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
          cellIndex = ((y - viewportData.startLineNumber) * _ViewportRenderStrategy.maxSupportedColumns + x) * 6 /* IndicesPerCell */;
          cellBuffer[cellIndex + 0 /* Offset_X */] = Math.floor(absoluteOffsetX);
          cellBuffer[cellIndex + 1 /* Offset_Y */] = absoluteOffsetY;
          cellBuffer[cellIndex + 4 /* GlyphIndex */] = glyph.glyphIndex;
          cellBuffer[cellIndex + 5 /* TextureIndex */] = glyph.pageIndex;
          absoluteOffsetX += charWidth;
        }
        tokenStartIndex = tokenEndIndex;
      }
      fillStartIndex = ((y - viewportData.startLineNumber) * _ViewportRenderStrategy.maxSupportedColumns + tokenEndIndex) * 6 /* IndicesPerCell */;
      fillEndIndex = (y - viewportData.startLineNumber) * _ViewportRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
      cellBuffer.fill(0, fillStartIndex, fillEndIndex);
    }
    const visibleObjectCount = (viewportData.endLineNumber - viewportData.startLineNumber + 1) * lineIndexCount;
    const viewportLineCount = viewportData.endLineNumber - viewportData.startLineNumber + 1;
    this._device.queue.writeBuffer(
      this._cellBindBuffer,
      0,
      cellBuffer.buffer,
      0,
      visibleObjectCount * Float32Array.BYTES_PER_ELEMENT
    );
    if (viewportLineCount < this._lastViewportLineCount) {
      const staleLineCount = this._lastViewportLineCount - viewportLineCount;
      const staleStartOffset = visibleObjectCount * Float32Array.BYTES_PER_ELEMENT;
      const staleByteCount = staleLineCount * lineIndexCount * Float32Array.BYTES_PER_ELEMENT;
      this._device.queue.writeBuffer(
        this._cellBindBuffer,
        staleStartOffset,
        cellBuffer.buffer,
        visibleObjectCount * Float32Array.BYTES_PER_ELEMENT,
        staleByteCount
      );
    }
    this._lastViewportLineCount = viewportLineCount;
    this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;
    this._visibleObjectCount = visibleObjectCount;
    return visibleObjectCount;
  }
  draw(pass, viewportData) {
    if (this._visibleObjectCount <= 0) {
      throw new BugIndicatingError("Attempt to draw 0 objects");
    }
    pass.draw(quadVertices.length / 2, this._visibleObjectCount);
  }
};
/**
 * The hard cap for line columns that can be rendered by the GPU renderer.
 */
_ViewportRenderStrategy.maxSupportedColumns = 2e3;
let ViewportRenderStrategy = _ViewportRenderStrategy;
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
  ViewportRenderStrategy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGdwdVxccmVuZGVyU3RyYXRlZ3lcXHZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb2x1bW5zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvY3Vyc29yQ29sdW1ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElWaWV3TGluZVRva2VucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyB0eXBlIFZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCwgdHlwZSBWaWV3TGluZU1hcHBpbmdDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld0xpbmVzQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdMaW5lc0RlbGV0ZWRFdmVudCwgdHlwZSBWaWV3TGluZXNJbnNlcnRlZEV2ZW50LCB0eXBlIFZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld1RoZW1lQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdUb2tlbnNDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld1pvbmVzQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3cG9ydERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZXNWaWV3cG9ydERhdGEuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3TGluZVJlbmRlcmluZ0RhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL2lubGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0xpbmVPcHRpb25zIH0gZnJvbSAnLi4vLi4vdmlld1BhcnRzL3ZpZXdMaW5lcy92aWV3TGluZU9wdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGV4dHVyZUF0bGFzUGFnZUdseXBoIH0gZnJvbSAnLi4vYXRsYXMvYXRsYXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29udGVudFNlZ21lbnRlciwgdHlwZSBJQ29udGVudFNlZ21lbnRlciB9IGZyb20gJy4uL2NvbnRlbnRTZWdtZW50ZXIuanMnO1xuaW1wb3J0IHsgQmluZGluZ0lkIH0gZnJvbSAnLi4vZ3B1LmpzJztcbmltcG9ydCB7IEdQVUxpZmVjeWNsZSB9IGZyb20gJy4uL2dwdURpc3Bvc2FibGUuanMnO1xuaW1wb3J0IHsgcXVhZFZlcnRpY2VzIH0gZnJvbSAnLi4vZ3B1VXRpbHMuanMnO1xuaW1wb3J0IHsgR2x5cGhSYXN0ZXJpemVyIH0gZnJvbSAnLi4vcmFzdGVyL2dseXBoUmFzdGVyaXplci5qcyc7XG5pbXBvcnQgeyBWaWV3R3B1Q29udGV4dCB9IGZyb20gJy4uL3ZpZXdHcHVDb250ZXh0LmpzJztcbmltcG9ydCB7IEJhc2VSZW5kZXJTdHJhdGVneSB9IGZyb20gJy4vYmFzZVJlbmRlclN0cmF0ZWd5LmpzJztcbmltcG9ydCB7IGZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3lXZ3NsIH0gZnJvbSAnLi9mdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lndnc2wuanMnO1xuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdEluZGljZXNQZXJDZWxsID0gNixcblx0Q2VsbEJpbmRCdWZmZXJDYXBhY2l0eUluY3JlbWVudCA9IDMyLFxuXHRDZWxsQmluZEJ1ZmZlckluaXRpYWxDYXBhY2l0eSA9IDYzLCAvLyBXaWxsIGJlIHJvdW5kZWQgdXAgdG8gbmVhcmVzdCBpbmNyZW1lbnRcbn1cblxuY29uc3QgZW51bSBDZWxsQnVmZmVySW5mbyB7XG5cdEZsb2F0c1BlckVudHJ5ID0gNixcblx0Qnl0ZXNQZXJFbnRyeSA9IENlbGxCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5ICogNCxcblx0T2Zmc2V0X1ggPSAwLFxuXHRPZmZzZXRfWSA9IDEsXG5cdE9mZnNldF9VbnVzZWQxID0gMixcblx0T2Zmc2V0X1VudXNlZDIgPSAzLFxuXHRHbHlwaEluZGV4ID0gNCxcblx0VGV4dHVyZUluZGV4ID0gNSxcbn1cblxuLyoqXG4gKiBBIHJlbmRlciBzdHJhdGVneSB0aGF0IHVwbG9hZHMgdGhlIGNvbnRlbnQgb2YgdGhlIGVudGlyZSB2aWV3cG9ydCBldmVyeSBmcmFtZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kgZXh0ZW5kcyBCYXNlUmVuZGVyU3RyYXRlZ3kge1xuXHQvKipcblx0ICogVGhlIGhhcmQgY2FwIGZvciBsaW5lIGNvbHVtbnMgdGhhdCBjYW4gYmUgcmVuZGVyZWQgYnkgdGhlIEdQVSByZW5kZXJlci5cblx0ICovXG5cdHN0YXRpYyByZWFkb25seSBtYXhTdXBwb3J0ZWRDb2x1bW5zID0gMjAwMDtcblxuXHRyZWFkb25seSB0eXBlID0gJ3ZpZXdwb3J0Jztcblx0cmVhZG9ubHkgd2dzbDogc3RyaW5nID0gZnVsbEZpbGVSZW5kZXJTdHJhdGVneVdnc2w7XG5cblx0cHJpdmF0ZSBfY2VsbEJpbmRCdWZmZXJMaW5lQ2FwYWNpdHkgPSBDb25zdGFudHMuQ2VsbEJpbmRCdWZmZXJJbml0aWFsQ2FwYWNpdHk7XG5cdHByaXZhdGUgX2NlbGxCaW5kQnVmZmVyITogR1BVQnVmZmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgY2VsbCB2YWx1ZSBidWZmZXJzLCB0aGVzZSBob2xkIHRoZSBjZWxscyBhbmQgdGhlaXIgZ2x5cGhzLiBJdCdzIGRvdWJsZSBidWZmZXJzIHN1Y2ggdGhhdFxuXHQgKiB0aGUgdGhyZWFkIGRvZXNuJ3QgYmxvY2sgd2hlbiBvbmUgaXMgYmVpbmcgdXBsb2FkZWQgdG8gdGhlIEdQVS5cblx0ICovXG5cdHByaXZhdGUgX2NlbGxWYWx1ZUJ1ZmZlcnMhOiBbQXJyYXlCdWZmZXIsIEFycmF5QnVmZmVyXTtcblx0cHJpdmF0ZSBfYWN0aXZlRG91YmxlQnVmZmVySW5kZXg6IDAgfCAxID0gMDtcblxuXHRwcml2YXRlIF92aXNpYmxlT2JqZWN0Q291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2xhc3RWaWV3cG9ydExpbmVDb3VudDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9zY3JvbGxPZmZzZXRCaW5kQnVmZmVyOiBHUFVCdWZmZXI7XG5cdHByaXZhdGUgX3Njcm9sbE9mZnNldFZhbHVlQnVmZmVyOiBGbG9hdDMyQXJyYXk7XG5cdHByaXZhdGUgX3Njcm9sbEluaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Z2V0IGJpbmRHcm91cEVudHJpZXMoKTogR1BVQmluZEdyb3VwRW50cnlbXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHsgYmluZGluZzogQmluZGluZ0lkLkNlbGxzLCByZXNvdXJjZTogeyBidWZmZXI6IHRoaXMuX2NlbGxCaW5kQnVmZmVyIH0gfSxcblx0XHRcdHsgYmluZGluZzogQmluZGluZ0lkLlNjcm9sbE9mZnNldCwgcmVzb3VyY2U6IHsgYnVmZmVyOiB0aGlzLl9zY3JvbGxPZmZzZXRCaW5kQnVmZmVyIH0gfVxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUJpbmRHcm91cEVudHJpZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VCaW5kR3JvdXBFbnRyaWVzID0gdGhpcy5fb25EaWRDaGFuZ2VCaW5kR3JvdXBFbnRyaWVzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IFZpZXdDb250ZXh0LFxuXHRcdHZpZXdHcHVDb250ZXh0OiBWaWV3R3B1Q29udGV4dCxcblx0XHRkZXZpY2U6IEdQVURldmljZSxcblx0XHRnbHlwaFJhc3Rlcml6ZXI6IHsgdmFsdWU6IEdseXBoUmFzdGVyaXplciB9LFxuXHQpIHtcblx0XHRzdXBlcihjb250ZXh0LCB2aWV3R3B1Q29udGV4dCwgZGV2aWNlLCBnbHlwaFJhc3Rlcml6ZXIpO1xuXG5cdFx0dGhpcy5fcmVidWlsZENlbGxCdWZmZXIodGhpcy5fY2VsbEJpbmRCdWZmZXJMaW5lQ2FwYWNpdHkpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsT2Zmc2V0QnVmZmVyU2l6ZSA9IDI7XG5cdFx0dGhpcy5fc2Nyb2xsT2Zmc2V0QmluZEJ1ZmZlciA9IHRoaXMuX3JlZ2lzdGVyKEdQVUxpZmVjeWNsZS5jcmVhdGVCdWZmZXIodGhpcy5fZGV2aWNlLCB7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyBzY3JvbGwgb2Zmc2V0IGJ1ZmZlcicsXG5cdFx0XHRzaXplOiBzY3JvbGxPZmZzZXRCdWZmZXJTaXplICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxuXHRcdFx0dXNhZ2U6IEdQVUJ1ZmZlclVzYWdlLlVOSUZPUk0gfCBHUFVCdWZmZXJVc2FnZS5DT1BZX0RTVCxcblx0XHR9KSkub2JqZWN0O1xuXHRcdHRoaXMuX3Njcm9sbE9mZnNldFZhbHVlQnVmZmVyID0gbmV3IEZsb2F0MzJBcnJheShzY3JvbGxPZmZzZXRCdWZmZXJTaXplKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYnVpbGRDZWxsQnVmZmVyKGxpbmVDb3VudDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fY2VsbEJpbmRCdWZmZXI/LmRlc3Ryb3koKTtcblxuXHRcdC8vIEluY3JlYXNlIGluIGNodW5rcyBzbyByZXNpemluZyBhIHdpbmRvdyBieSBoYW5kIGRvZXNuJ3Qga2VlcCBhbGxvY2F0aW5nIGFuZCB0aHJvd2luZyBhd2F5XG5cdFx0Y29uc3QgbGluZUNvdW50V2l0aEluY3JlbWVudCA9IChNYXRoLmZsb29yKGxpbmVDb3VudCAvIENvbnN0YW50cy5DZWxsQmluZEJ1ZmZlckNhcGFjaXR5SW5jcmVtZW50KSArIDEpICogQ29uc3RhbnRzLkNlbGxCaW5kQnVmZmVyQ2FwYWNpdHlJbmNyZW1lbnQ7XG5cblx0XHRjb25zdCBidWZmZXJTaXplID0gbGluZUNvdW50V2l0aEluY3JlbWVudCAqIFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucyAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVDtcblx0XHR0aGlzLl9jZWxsQmluZEJ1ZmZlciA9IHRoaXMuX3JlZ2lzdGVyKEdQVUxpZmVjeWNsZS5jcmVhdGVCdWZmZXIodGhpcy5fZGV2aWNlLCB7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyBmdWxsIGZpbGUgY2VsbCBidWZmZXInLFxuXHRcdFx0c2l6ZTogYnVmZmVyU2l6ZSxcblx0XHRcdHVzYWdlOiBHUFVCdWZmZXJVc2FnZS5TVE9SQUdFIHwgR1BVQnVmZmVyVXNhZ2UuQ09QWV9EU1QsXG5cdFx0fSkpLm9iamVjdDtcblx0XHR0aGlzLl9jZWxsVmFsdWVCdWZmZXJzID0gW1xuXHRcdFx0bmV3IEFycmF5QnVmZmVyKGJ1ZmZlclNpemUpLFxuXHRcdFx0bmV3IEFycmF5QnVmZmVyKGJ1ZmZlclNpemUpLFxuXHRcdF07XG5cdFx0dGhpcy5fY2VsbEJpbmRCdWZmZXJMaW5lQ2FwYWNpdHkgPSBsaW5lQ291bnRXaXRoSW5jcmVtZW50O1xuXHRcdHRoaXMuX2xhc3RWaWV3cG9ydExpbmVDb3VudCA9IDA7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUJpbmRHcm91cEVudHJpZXMuZmlyZSgpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBFdmVudCBoYW5kbGVyc1xuXG5cdC8vIFRoZSBwcmltYXJ5IGpvYiBvZiB0aGVzZSBoYW5kbGVycyBpcyB0bzpcblx0Ly8gMS4gSW52YWxpZGF0ZSB0aGUgdXAgdG8gZGF0ZSBsaW5lIGNhY2hlLCB3aGljaCB3aWxsIGNhdXNlIHRoZSBsaW5lIHRvIGJlIHJlLXJlbmRlcmVkIHdoZW5cblx0Ly8gICAgaXQncyBfd2l0aGluIHRoZSB2aWV3cG9ydF8uXG5cdC8vIDIuIFBhc3MgcmVsZXZhbnQgZXZlbnRzIG9uIHRvIHRoZSByZW5kZXIgZnVuY3Rpb24gc28gaXQgY2FuIGZvcmNlIGNlcnRhaW4gbGluZSByYW5nZXMgdG8gYmVcblx0Ly8gICAgcmUtcmVuZGVyZWQgZXZlbiBpZiB0aGV5J3JlIG5vdCBpbiB0aGUgdmlld3BvcnQuIEZvciBleGFtcGxlIHdoZW4gYSB2aWV3IHpvbmUgaXMgYWRkZWQsXG5cdC8vICAgIHRoZXJlIGFyZSBsaW5lcyB0aGF0IHVzZWQgdG8gYmUgdmlzaWJsZSBidXQgYXJlIG5vIGxvbmdlciwgc28gdGhvc2UgcmFuZ2VzIG11c3QgYmVcblx0Ly8gICAgY2xlYXJlZCBhbmQgdXBsb2FkZWQgdG8gdGhlIEdQVS5cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiBWaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKGU6IFZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uVG9rZW5zQ2hhbmdlZChlOiBWaWV3VG9rZW5zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0RlbGV0ZWQoZTogVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0luc2VydGVkKGU6IFZpZXdMaW5lc0luc2VydGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzQ2hhbmdlZChlOiBWaWV3TGluZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvblNjcm9sbENoYW5nZWQoZT86IFZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBkcHIgPSBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvO1xuXHRcdHRoaXMuX3Njcm9sbE9mZnNldFZhbHVlQnVmZmVyWzBdID0gKGU/LnNjcm9sbExlZnQgPz8gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxMZWZ0KCkpICogZHByO1xuXHRcdHRoaXMuX3Njcm9sbE9mZnNldFZhbHVlQnVmZmVyWzFdID0gKGU/LnNjcm9sbFRvcCA/PyB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbFRvcCgpKSAqIGRwcjtcblx0XHR0aGlzLl9kZXZpY2UucXVldWUud3JpdGVCdWZmZXIodGhpcy5fc2Nyb2xsT2Zmc2V0QmluZEJ1ZmZlciwgMCwgdGhpcy5fc2Nyb2xsT2Zmc2V0VmFsdWVCdWZmZXIgYXMgRmxvYXQzMkFycmF5PEFycmF5QnVmZmVyPik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25UaGVtZUNoYW5nZWQoZTogVmlld1RoZW1lQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lTWFwcGluZ0NoYW5nZWQoZTogVmlld0xpbmVNYXBwaW5nQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25ab25lc0NoYW5nZWQoZTogVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0cmVzZXQoKSB7XG5cdFx0Zm9yIChjb25zdCBidWZmZXJJbmRleCBvZiBbMCwgMV0pIHtcblx0XHRcdC8vIFplcm8gb3V0IGJ1ZmZlciBhbmQgdXBsb2FkIHRvIEdQVSB0byBwcmV2ZW50IHN0YWxlIHJvd3MgZnJvbSByZW5kZXJpbmdcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5fY2VsbFZhbHVlQnVmZmVyc1tidWZmZXJJbmRleF0pO1xuXHRcdFx0YnVmZmVyLmZpbGwoMCwgMCwgYnVmZmVyLmxlbmd0aCk7XG5cdFx0XHR0aGlzLl9kZXZpY2UucXVldWUud3JpdGVCdWZmZXIodGhpcy5fY2VsbEJpbmRCdWZmZXIsIDAsIGJ1ZmZlci5idWZmZXIsIDAsIGJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdFZpZXdwb3J0TGluZUNvdW50ID0gMDtcblx0fVxuXG5cdHVwZGF0ZSh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSwgdmlld0xpbmVPcHRpb25zOiBWaWV3TGluZU9wdGlvbnMpOiBudW1iZXIge1xuXHRcdC8vIElNUE9SVEFOVDogVGhpcyBpcyBhIGhvdCBmdW5jdGlvbi4gVmFyaWFibGVzIGFyZSBwcmUtYWxsb2NhdGVkIGFuZCBzaGFyZWQgd2l0aGluIHRoZVxuXHRcdC8vIGxvb3AuIFRoaXMgaXMgZG9uZSBzbyB3ZSBkb24ndCBuZWVkIHRvIHRydXN0IHRoZSBKSVQgY29tcGlsZXIgdG8gZG8gdGhpcyBvcHRpbWl6YXRpb24gdG9cblx0XHQvLyBhdm9pZCBwb3RlbnRpYWwgYWRkaXRpb25hbCBibG9ja2luZyB0aW1lIGluIGdhcmJhZ2UgY29sbGVjdG9yIHdoaWNoIGlzIGEgY29tbW9uIGNhdXNlIG9mXG5cdFx0Ly8gZHJvcHBlZCBmcmFtZXMuXG5cblx0XHRsZXQgY2hhcnMgPSAnJztcblx0XHRsZXQgc2VnbWVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGFyV2lkdGggPSAwO1xuXHRcdGxldCB5ID0gMDtcblx0XHRsZXQgeCA9IDA7XG5cdFx0bGV0IGFic29sdXRlT2Zmc2V0WCA9IDA7XG5cdFx0bGV0IGFic29sdXRlT2Zmc2V0WSA9IDA7XG5cdFx0bGV0IHRhYlhPZmZzZXQgPSAwO1xuXHRcdGxldCBnbHlwaDogUmVhZG9ubHk8SVRleHR1cmVBdGxhc1BhZ2VHbHlwaD47XG5cdFx0bGV0IGNlbGxJbmRleCA9IDA7XG5cblx0XHRsZXQgdG9rZW5TdGFydEluZGV4ID0gMDtcblx0XHRsZXQgdG9rZW5FbmRJbmRleCA9IDA7XG5cdFx0bGV0IHRva2VuTWV0YWRhdGEgPSAwO1xuXG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldEJvbGQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldENvbG9yOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldE9wYWNpdHk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaFRoaWNrbmVzczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoQ29sb3I6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGxldCBsaW5lRGF0YTogVmlld0xpbmVSZW5kZXJpbmdEYXRhO1xuXHRcdGxldCBkZWNvcmF0aW9uOiBJbmxpbmVEZWNvcmF0aW9uO1xuXHRcdGxldCBmaWxsU3RhcnRJbmRleCA9IDA7XG5cdFx0bGV0IGZpbGxFbmRJbmRleCA9IDA7XG5cblx0XHRsZXQgdG9rZW5zOiBJVmlld0xpbmVUb2tlbnM7XG5cblx0XHRjb25zdCBkcHIgPSBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvO1xuXHRcdGxldCBjb250ZW50U2VnbWVudGVyOiBJQ29udGVudFNlZ21lbnRlcjtcblxuXHRcdGlmICghdGhpcy5fc2Nyb2xsSW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRoaXMub25TY3JvbGxDaGFuZ2VkKCk7XG5cdFx0XHR0aGlzLl9zY3JvbGxJbml0aWFsaXplZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gWmVybyBvdXQgY2VsbCBidWZmZXIgb3IgcmVidWlsZCBpZiBuZWVkZWRcblx0XHRpZiAodGhpcy5fY2VsbEJpbmRCdWZmZXJMaW5lQ2FwYWNpdHkgPCB2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlciAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIgKyAxKSB7XG5cdFx0XHR0aGlzLl9yZWJ1aWxkQ2VsbEJ1ZmZlcih2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlciAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIgKyAxKTtcblx0XHR9XG5cdFx0Y29uc3QgY2VsbEJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5fY2VsbFZhbHVlQnVmZmVyc1t0aGlzLl9hY3RpdmVEb3VibGVCdWZmZXJJbmRleF0pO1xuXHRcdGNlbGxCdWZmZXIuZmlsbCgwKTtcblxuXHRcdGNvbnN0IGxpbmVJbmRleENvdW50ID0gVmlld3BvcnRSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXG5cdFx0Zm9yICh5ID0gdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlcjsgeSA8PSB2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlcjsgeSsrKSB7XG5cblx0XHRcdC8vIE9ubHkgYXR0ZW1wdCB0byByZW5kZXIgbGluZXMgdGhhdCB0aGUgR1BVIHJlbmRlcmVyIGNhbiBoYW5kbGVcblx0XHRcdGlmICghdGhpcy5fdmlld0dwdUNvbnRleHQuY2FuUmVuZGVyKHZpZXdMaW5lT3B0aW9ucywgdmlld3BvcnREYXRhLCB5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGluZURhdGEgPSB2aWV3cG9ydERhdGEuZ2V0Vmlld0xpbmVSZW5kZXJpbmdEYXRhKHkpO1xuXHRcdFx0dGFiWE9mZnNldCA9IDA7XG5cblx0XHRcdGNvbnRlbnRTZWdtZW50ZXIgPSBjcmVhdGVDb250ZW50U2VnbWVudGVyKGxpbmVEYXRhLCB2aWV3TGluZU9wdGlvbnMpO1xuXHRcdFx0Y2hhcldpZHRoID0gdmlld0xpbmVPcHRpb25zLnNwYWNlV2lkdGggKiBkcHI7XG5cdFx0XHRhYnNvbHV0ZU9mZnNldFggPSAobGluZURhdGEubWluQ29sdW1uIC0gMSkgKiBjaGFyV2lkdGg7XG5cblx0XHRcdHRva2VucyA9IGxpbmVEYXRhLnRva2Vucztcblx0XHRcdHRva2VuU3RhcnRJbmRleCA9IGxpbmVEYXRhLm1pbkNvbHVtbiAtIDE7XG5cdFx0XHR0b2tlbkVuZEluZGV4ID0gMDtcblx0XHRcdGZvciAobGV0IHRva2VuSW5kZXggPSAwLCB0b2tlbnNMZW4gPSB0b2tlbnMuZ2V0Q291bnQoKTsgdG9rZW5JbmRleCA8IHRva2Vuc0xlbjsgdG9rZW5JbmRleCsrKSB7XG5cdFx0XHRcdHRva2VuRW5kSW5kZXggPSB0b2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRpZiAodG9rZW5FbmRJbmRleCA8PSB0b2tlblN0YXJ0SW5kZXgpIHtcblx0XHRcdFx0XHQvLyBUaGUgZmF1eCBpbmRlbnQgcGFydCBvZiB0aGUgbGluZSBzaG91bGQgaGF2ZSBubyB0b2tlbiB0eXBlXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0b2tlbk1ldGFkYXRhID0gdG9rZW5zLmdldE1ldGFkYXRhKHRva2VuSW5kZXgpO1xuXG5cdFx0XHRcdGZvciAoeCA9IHRva2VuU3RhcnRJbmRleDsgeCA8IHRva2VuRW5kSW5kZXg7IHgrKykge1xuXHRcdFx0XHRcdC8vIE9ubHkgcmVuZGVyIGxpbmVzIHRoYXQgZG8gbm90IGV4Y2VlZCBtYXhpbXVtIGNvbHVtbnNcblx0XHRcdFx0XHRpZiAoeCA+IFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucykge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNlZ21lbnQgPSBjb250ZW50U2VnbWVudGVyLmdldFNlZ21lbnRBdEluZGV4KHgpO1xuXHRcdFx0XHRcdGlmIChzZWdtZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGFycyA9IHNlZ21lbnQ7XG5cblx0XHRcdFx0XHRpZiAoIShsaW5lRGF0YS5pc0Jhc2ljQVNDSUkgJiYgdmlld0xpbmVPcHRpb25zLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpKSB7XG5cdFx0XHRcdFx0XHRjaGFyV2lkdGggPSB0aGlzLmdseXBoUmFzdGVyaXplci5nZXRUZXh0TWV0cmljcyhjaGFycykud2lkdGg7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0Q29sb3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0Qm9sZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRPcGFjaXR5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2ggPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaFRoaWNrbmVzcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoQ29sb3IgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHQvLyBBcHBseSBzdXBwb3J0ZWQgaW5saW5lIGRlY29yYXRpb24gc3R5bGVzIHRvIHRoZSBjZWxsIG1ldGFkYXRhXG5cdFx0XHRcdFx0Zm9yIChkZWNvcmF0aW9uIG9mIGxpbmVEYXRhLmlubGluZURlY29yYXRpb25zKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGlzIGlzIFJhbmdlLnN0cmljdENvbnRhaW5zUG9zaXRpb24gZXhjZXB0IGl0IHdvcmtzIGF0IHRoZSBjZWxsIGxldmVsLFxuXHRcdFx0XHRcdFx0Ly8gaXQncyBhbHNvIGlubGluZWQgdG8gYXZvaWQgb3ZlcmhlYWQuXG5cdFx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHRcdCh5IDwgZGVjb3JhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIgfHwgeSA+IGRlY29yYXRpb24ucmFuZ2UuZW5kTGluZU51bWJlcikgfHxcblx0XHRcdFx0XHRcdFx0KHkgPT09IGRlY29yYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIHggPCBkZWNvcmF0aW9uLnJhbmdlLnN0YXJ0Q29sdW1uIC0gMSkgfHxcblx0XHRcdFx0XHRcdFx0KHkgPT09IGRlY29yYXRpb24ucmFuZ2UuZW5kTGluZU51bWJlciAmJiB4ID49IGRlY29yYXRpb24ucmFuZ2UuZW5kQ29sdW1uIC0gMSlcblx0XHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcnVsZXMgPSBWaWV3R3B1Q29udGV4dC5kZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3Rvci5nZXRTdHlsZVJ1bGVzKHRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhbnZhcy5kb21Ob2RlLCBkZWNvcmF0aW9uLmlubGluZUNsYXNzTmFtZSk7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgcnVsZXMpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHJ1bGUuc3R5bGUpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IHJ1bGUuc3R5bGVNYXAuZ2V0KHIpPy50b1N0cmluZygpID8/ICcnO1xuXHRcdFx0XHRcdFx0XHRcdHN3aXRjaCAocikge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAnY29sb3InOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdC8vIFRPRE86IFRoaXMgcGFyc2luZyBhbmQgZXJyb3IgaGFuZGxpbmcgc2hvdWxkIG1vdmUgaW50byBjYW5SZW5kZXIgc28gZmFsbGJhY2tcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gICAgICAgdG8gRE9NIHdvcmtzXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlZENvbG9yID0gQ29sb3IuRm9ybWF0LkNTUy5wYXJzZSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmICghcGFyc2VkQ29sb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdJbnZhbGlkIGNvbG9yIGZvcm1hdCAnICsgdmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldENvbG9yID0gcGFyc2VkQ29sb3IudG9OdW1iZXIzMkJpdCgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ2ZvbnQtd2VpZ2h0Jzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBwYXJzZWRWYWx1ZSA9IHBhcnNlQ3NzRm9udFdlaWdodCh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChwYXJzZWRWYWx1ZSA+PSA0MDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRCb2xkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBUT0RPOiBTZXQgYm9sZCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzNzU4NClcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRCb2xkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gVE9ETzogU2V0IG5vcm1hbCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzNzU4NClcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ29wYWNpdHknOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlZFZhbHVlID0gcGFyc2VDc3NPcGFjaXR5KHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0T3BhY2l0eSA9IHBhcnNlZFZhbHVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbic6XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24tbGluZSc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHZhbHVlID09PSAnbGluZS10aHJvdWdoJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2ggPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uLXRoaWNrbmVzcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXihcXGQrKD86XFwuXFxkKyk/KXB4JC8pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoVGhpY2tuZXNzID0gcGFyc2VGbG9hdChtYXRjaFsxXSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24tY29sb3InOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGxldCBjb2xvclZhbHVlID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHZhck1hdGNoID0gdmFsdWUubWF0Y2goL152YXJcXCgoLS1bXixdKyksXFxzKig/OmluaXRpYWx8aW5oZXJpdClcXCkkLyk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmICh2YXJNYXRjaCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbG9yVmFsdWUgPSBWaWV3R3B1Q29udGV4dC5kZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3Rvci5yZXNvbHZlQ3NzVmFyaWFibGUodGhpcy5fdmlld0dwdUNvbnRleHQuY2FudmFzLmRvbU5vZGUsIHZhck1hdGNoWzFdKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBwYXJzZWRDb2xvciA9IENvbG9yLkZvcm1hdC5DU1MucGFyc2UoY29sb3JWYWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChwYXJzZWRDb2xvcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hDb2xvciA9IHBhcnNlZENvbG9yLnRvTnVtYmVyMzJCaXQoKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbi1zdHlsZSc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gVGhlc2UgYXJlIHZhbGlkYXRlZCBpbiBjYW5SZW5kZXIgYW5kIHVzZSBkZWZhdWx0IGJlaGF2aW9yXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVW5leHBlY3RlZCBpbmxpbmUgZGVjb3JhdGlvbiBzdHlsZScpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChjaGFycyA9PT0gJyAnIHx8IGNoYXJzID09PSAnXFx0Jykge1xuXHRcdFx0XHRcdFx0Ly8gWmVybyBvdXQgZ2x5cGggdG8gZW5zdXJlIGl0IGRvZXNuJ3QgZ2V0IHJlbmRlcmVkXG5cdFx0XHRcdFx0XHRjZWxsSW5kZXggPSAoKHkgLSAxKSAqIFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucyArIHgpICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0XHRcdFx0Y2VsbEJ1ZmZlci5maWxsKDAsIGNlbGxJbmRleCwgY2VsbEluZGV4ICsgQ2VsbEJ1ZmZlckluZm8uRmxvYXRzUGVyRW50cnkpO1xuXHRcdFx0XHRcdFx0Ly8gQWRqdXN0IHhPZmZzZXQgZm9yIHRhYiBzdG9wc1xuXHRcdFx0XHRcdFx0aWYgKGNoYXJzID09PSAnXFx0Jykge1xuXHRcdFx0XHRcdFx0XHQvLyBGaW5kIHRoZSBwaXhlbCBvZmZzZXQgYmV0d2VlbiB0aGUgY3VycmVudCBwb3NpdGlvbiBhbmQgdGhlIG5leHQgdGFiIHN0b3Bcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2Zmc2V0QmVmb3JlID0geCArIHRhYlhPZmZzZXQ7XG5cdFx0XHRcdFx0XHRcdHRhYlhPZmZzZXQgPSBDdXJzb3JDb2x1bW5zLm5leHRSZW5kZXJUYWJTdG9wKHggKyB0YWJYT2Zmc2V0LCBsaW5lRGF0YS50YWJTaXplKTtcblx0XHRcdFx0XHRcdFx0YWJzb2x1dGVPZmZzZXRYICs9IGNoYXJXaWR0aCAqICh0YWJYT2Zmc2V0IC0gb2Zmc2V0QmVmb3JlKTtcblx0XHRcdFx0XHRcdFx0Ly8gQ29udmVydCBiYWNrIHRvIG9mZnNldCBleGNsdWRpbmcgeCBhbmQgdGhlIGN1cnJlbnQgY2hhcmFjdGVyXG5cdFx0XHRcdFx0XHRcdHRhYlhPZmZzZXQgLT0geCArIDE7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhYnNvbHV0ZU9mZnNldFggKz0gY2hhcldpZHRoO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvblN0eWxlU2V0SWQgPSBWaWV3R3B1Q29udGV4dC5kZWNvcmF0aW9uU3R5bGVDYWNoZS5nZXRPckNyZWF0ZUVudHJ5KGRlY29yYXRpb25TdHlsZVNldENvbG9yLCBkZWNvcmF0aW9uU3R5bGVTZXRCb2xkLCBkZWNvcmF0aW9uU3R5bGVTZXRPcGFjaXR5LCBkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoLCBkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoVGhpY2tuZXNzLCBkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoQ29sb3IpO1xuXHRcdFx0XHRcdGdseXBoID0gdGhpcy5fdmlld0dwdUNvbnRleHQuYXRsYXMuZ2V0R2x5cGgodGhpcy5nbHlwaFJhc3Rlcml6ZXIsIGNoYXJzLCB0b2tlbk1ldGFkYXRhLCBkZWNvcmF0aW9uU3R5bGVTZXRJZCwgYWJzb2x1dGVPZmZzZXRYKTtcblxuXHRcdFx0XHRcdGFic29sdXRlT2Zmc2V0WSA9IE1hdGgucm91bmQoXG5cdFx0XHRcdFx0XHQvLyBUb3Agb2YgbGF5b3V0IGJveCAoaW5jbHVkZXMgbGluZSBoZWlnaHQpXG5cdFx0XHRcdFx0XHR2aWV3cG9ydERhdGEucmVsYXRpdmVWZXJ0aWNhbE9mZnNldFt5IC0gdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlcl0gKiBkcHIgK1xuXG5cdFx0XHRcdFx0XHQvLyBEZWx0YSBmcm9tIHRvcCBvZiBsYXlvdXQgYm94IChpbmNsdWRlcyBsaW5lIGhlaWdodCkgdG8gdG9wIG9mIHRoZSBpbmxpbmUgYm94IChubyBsaW5lIGhlaWdodClcblx0XHRcdFx0XHRcdE1hdGguZmxvb3IoKHZpZXdwb3J0RGF0YS5saW5lSGVpZ2h0ICogZHByIC0gKGdseXBoLmZvbnRCb3VuZGluZ0JveEFzY2VudCArIGdseXBoLmZvbnRCb3VuZGluZ0JveERlc2NlbnQpKSAvIDIpICtcblxuXHRcdFx0XHRcdFx0Ly8gRGVsdGEgZnJvbSB0b3Agb2YgaW5saW5lIGJveCAobm8gbGluZSBoZWlnaHQpIHRvIHRvcCBvZiBnbHlwaCBvcmlnaW4uIElmIHRoZSBnbHlwaCB3YXMgZHJhd25cblx0XHRcdFx0XHRcdC8vIHdpdGggYSB0b3AgYmFzZWxpbmUgZm9yIGV4YW1wbGUsIHRoaXMgZW5kcyB1cCBkcmF3aW5nIHRoZSBnbHlwaCBjb3JyZWN0bHkgdXNpbmcgdGhlIGFscGhhYmV0aWNhbFxuXHRcdFx0XHRcdFx0Ly8gYmFzZWxpbmUuXG5cdFx0XHRcdFx0XHRnbHlwaC5mb250Qm91bmRpbmdCb3hBc2NlbnRcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0Y2VsbEluZGV4ID0gKCh5IC0gdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlcikgKiBWaWV3cG9ydFJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMgKyB4KSAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblx0XHRcdFx0XHRjZWxsQnVmZmVyW2NlbGxJbmRleCArIENlbGxCdWZmZXJJbmZvLk9mZnNldF9YXSA9IE1hdGguZmxvb3IoYWJzb2x1dGVPZmZzZXRYKTtcblx0XHRcdFx0XHRjZWxsQnVmZmVyW2NlbGxJbmRleCArIENlbGxCdWZmZXJJbmZvLk9mZnNldF9ZXSA9IGFic29sdXRlT2Zmc2V0WTtcblx0XHRcdFx0XHRjZWxsQnVmZmVyW2NlbGxJbmRleCArIENlbGxCdWZmZXJJbmZvLkdseXBoSW5kZXhdID0gZ2x5cGguZ2x5cGhJbmRleDtcblx0XHRcdFx0XHRjZWxsQnVmZmVyW2NlbGxJbmRleCArIENlbGxCdWZmZXJJbmZvLlRleHR1cmVJbmRleF0gPSBnbHlwaC5wYWdlSW5kZXg7XG5cblx0XHRcdFx0XHQvLyBBZGp1c3QgdGhlIHggcGl4ZWwgb2Zmc2V0IGZvciB0aGUgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0XHRhYnNvbHV0ZU9mZnNldFggKz0gY2hhcldpZHRoO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dG9rZW5TdGFydEluZGV4ID0gdG9rZW5FbmRJbmRleDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2xlYXIgdG8gZW5kIG9mIGxpbmVcblx0XHRcdGZpbGxTdGFydEluZGV4ID0gKCh5IC0gdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlcikgKiBWaWV3cG9ydFJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMgKyB0b2tlbkVuZEluZGV4KSAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblx0XHRcdGZpbGxFbmRJbmRleCA9ICgoeSAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIpICogVmlld3BvcnRSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zKSAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblx0XHRcdGNlbGxCdWZmZXIuZmlsbCgwLCBmaWxsU3RhcnRJbmRleCwgZmlsbEVuZEluZGV4KTtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlT2JqZWN0Q291bnQgPSAodmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIgLSB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyICsgMSkgKiBsaW5lSW5kZXhDb3VudDtcblx0XHRjb25zdCB2aWV3cG9ydExpbmVDb3VudCA9IHZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyIC0gdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlciArIDE7XG5cblx0XHQvLyBUaGlzIHJlbmRlciBzdHJhdGVneSBhbHdheXMgdXBsb2FkcyB0aGUgd2hvbGUgdmlld3BvcnRcblx0XHR0aGlzLl9kZXZpY2UucXVldWUud3JpdGVCdWZmZXIoXG5cdFx0XHR0aGlzLl9jZWxsQmluZEJ1ZmZlcixcblx0XHRcdDAsXG5cdFx0XHRjZWxsQnVmZmVyLmJ1ZmZlcixcblx0XHRcdDAsXG5cdFx0XHR2aXNpYmxlT2JqZWN0Q291bnQgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlRcblx0XHQpO1xuXG5cdFx0Ly8gQ2xlYXIgc3RhbGUgbGluZXMgaW4gR1BVIGJ1ZmZlciBpZiB2aWV3cG9ydCBzaHJ1bmtcblx0XHRpZiAodmlld3BvcnRMaW5lQ291bnQgPCB0aGlzLl9sYXN0Vmlld3BvcnRMaW5lQ291bnQpIHtcblx0XHRcdGNvbnN0IHN0YWxlTGluZUNvdW50ID0gdGhpcy5fbGFzdFZpZXdwb3J0TGluZUNvdW50IC0gdmlld3BvcnRMaW5lQ291bnQ7XG5cdFx0XHRjb25zdCBzdGFsZVN0YXJ0T2Zmc2V0ID0gdmlzaWJsZU9iamVjdENvdW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UO1xuXHRcdFx0Y29uc3Qgc3RhbGVCeXRlQ291bnQgPSBzdGFsZUxpbmVDb3VudCAqIGxpbmVJbmRleENvdW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UO1xuXHRcdFx0Ly8gV3JpdGUgemVyb3MgZnJvbSB0aGUgemVyb2VkIGNlbGxCdWZmZXIgZm9yIHRoZSBzdGFsZSByZWdpb25cblx0XHRcdHRoaXMuX2RldmljZS5xdWV1ZS53cml0ZUJ1ZmZlcihcblx0XHRcdFx0dGhpcy5fY2VsbEJpbmRCdWZmZXIsXG5cdFx0XHRcdHN0YWxlU3RhcnRPZmZzZXQsXG5cdFx0XHRcdGNlbGxCdWZmZXIuYnVmZmVyLFxuXHRcdFx0XHR2aXNpYmxlT2JqZWN0Q291bnQgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQsXG5cdFx0XHRcdHN0YWxlQnl0ZUNvdW50XG5cdFx0XHQpO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0Vmlld3BvcnRMaW5lQ291bnQgPSB2aWV3cG9ydExpbmVDb3VudDtcblxuXHRcdHRoaXMuX2FjdGl2ZURvdWJsZUJ1ZmZlckluZGV4ID0gdGhpcy5fYWN0aXZlRG91YmxlQnVmZmVySW5kZXggPyAwIDogMTtcblxuXHRcdHRoaXMuX3Zpc2libGVPYmplY3RDb3VudCA9IHZpc2libGVPYmplY3RDb3VudDtcblxuXHRcdHJldHVybiB2aXNpYmxlT2JqZWN0Q291bnQ7XG5cdH1cblxuXHRkcmF3KHBhc3M6IEdQVVJlbmRlclBhc3NFbmNvZGVyLCB2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aXNpYmxlT2JqZWN0Q291bnQgPD0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQXR0ZW1wdCB0byBkcmF3IDAgb2JqZWN0cycpO1xuXHRcdH1cblx0XHRwYXNzLmRyYXcocXVhZFZlcnRpY2VzLmxlbmd0aCAvIDIsIHRoaXMuX3Zpc2libGVPYmplY3RDb3VudCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcGFyc2VDc3NGb250V2VpZ2h0KHZhbHVlOiBzdHJpbmcpIHtcblx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdGNhc2UgJ2xpZ2h0ZXInOlxuXHRcdGNhc2UgJ25vcm1hbCc6IHJldHVybiA0MDA7XG5cdFx0Y2FzZSAnYm9sZGVyJzpcblx0XHRjYXNlICdib2xkJzogcmV0dXJuIDcwMDtcblx0fVxuXHRyZXR1cm4gcGFyc2VJbnQodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBwYXJzZUNzc09wYWNpdHkodmFsdWU6IHN0cmluZyk6IG51bWJlciB7XG5cdGlmICh2YWx1ZS5lbmRzV2l0aCgnJScpKSB7XG5cdFx0cmV0dXJuIHBhcnNlRmxvYXQodmFsdWUuc3Vic3RyaW5nKDAsIHZhbHVlLmxlbmd0aCAtIDEpKSAvIDEwMDtcblx0fVxuXHRpZiAodmFsdWUubWF0Y2goL15cXGQrKD86XFwuXFxkKikvKSkge1xuXHRcdHJldHVybiBwYXJzZUZsb2F0KHZhbHVlKTtcblx0fVxuXHRyZXR1cm4gMTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBcUI7QUFTOUIsU0FBUyw4QkFBc0Q7QUFDL0QsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQ0FBa0M7QUFFM0MsSUFBVyxZQUFYLGtCQUFXQSxlQUFYO0FBQ0MsRUFB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LGFBQWEsbUJBQW1CLHdCQUF1QixzQkFBdUI7QUFDbkcsaUJBQVcsS0FBSyxHQUFHLGdCQUFnQixZQUFZO0FBQUEsSUFDaEQ7QUFFQSxVQUFNLHNCQUFzQixhQUFhLGdCQUFnQixhQUFhLGtCQUFrQixLQUFLO0FBQzdGLFVBQU0sb0JBQW9CLGFBQWEsZ0JBQWdCLGFBQWEsa0JBQWtCO0FBR3RGLFNBQUssUUFBUSxNQUFNO0FBQUEsTUFDbEIsS0FBSztBQUFBLE1BQ0w7QUFBQSxNQUNBLFdBQVc7QUFBQSxNQUNYO0FBQUEsTUFDQSxxQkFBcUIsYUFBYTtBQUFBLElBQ25DO0FBR0EsUUFBSSxvQkFBb0IsS0FBSyx3QkFBd0I7QUFDcEQsWUFBTSxpQkFBaUIsS0FBSyx5QkFBeUI7QUFDckQsWUFBTSxtQkFBbUIscUJBQXFCLGFBQWE7QUFDM0QsWUFBTSxpQkFBaUIsaUJBQWlCLGlCQUFpQixhQUFhO0FBRXRFLFdBQUssUUFBUSxNQUFNO0FBQUEsUUFDbEIsS0FBSztBQUFBLFFBQ0w7QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYLHFCQUFxQixhQUFhO0FBQUEsUUFDbEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFNBQUsseUJBQXlCO0FBRTlCLFNBQUssMkJBQTJCLEtBQUssMkJBQTJCLElBQUk7QUFFcEUsU0FBSyxzQkFBc0I7QUFFM0IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLEtBQUssTUFBNEIsY0FBa0M7QUFDbEUsUUFBSSxLQUFLLHVCQUF1QixHQUFHO0FBQ2xDLFlBQU0sSUFBSSxtQkFBbUIsMkJBQTJCO0FBQUEsSUFDekQ7QUFDQSxTQUFLLEtBQUssYUFBYSxTQUFTLEdBQUcsS0FBSyxtQkFBbUI7QUFBQSxFQUM1RDtBQUNEO0FBQUE7QUFBQTtBQUFBO0FBbmFhLHdCQUlJLHNCQUFzQjtBQUpoQyxJQUFNLHlCQUFOO0FBcWFQLFNBQVMsbUJBQW1CLE9BQWU7QUFDMUMsVUFBUSxPQUFPO0FBQUEsSUFDZCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQVUsYUFBTztBQUFBLElBQ3RCLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBUSxhQUFPO0FBQUEsRUFDckI7QUFDQSxTQUFPLFNBQVMsS0FBSztBQUN0QjtBQUVBLFNBQVMsZ0JBQWdCLE9BQXVCO0FBQy9DLE1BQUksTUFBTSxTQUFTLEdBQUcsR0FBRztBQUN4QixXQUFPLFdBQVcsTUFBTSxVQUFVLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQyxJQUFJO0FBQUEsRUFDM0Q7QUFDQSxNQUFJLE1BQU0sTUFBTSxlQUFlLEdBQUc7QUFDakMsV0FBTyxXQUFXLEtBQUs7QUFBQSxFQUN4QjtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiQ29uc3RhbnRzIiwgIkNlbGxCdWZmZXJJbmZvIl0KfQo=
