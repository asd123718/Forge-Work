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
import { getActiveWindow } from "../../../../base/browser/dom.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { autorun, runOnChange } from "../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { TextureAtlasPage } from "../../gpu/atlas/textureAtlasPage.js";
import { BindingId } from "../../gpu/gpu.js";
import { GPULifecycle } from "../../gpu/gpuDisposable.js";
import { quadVertices } from "../../gpu/gpuUtils.js";
import { ViewGpuContext } from "../../gpu/viewGpuContext.js";
import { FloatHorizontalRange, HorizontalPosition, HorizontalRange, LineVisibleRanges, VisibleRanges } from "../../view/renderingContext.js";
import { ViewPart } from "../../view/viewPart.js";
import { ViewLineOptions } from "../viewLines/viewLineOptions.js";
import { CursorColumns } from "../../../common/core/cursorColumns.js";
import { TextureAtlas } from "../../gpu/atlas/textureAtlas.js";
import { createContentSegmenter } from "../../gpu/contentSegmenter.js";
import { ViewportRenderStrategy } from "../../gpu/renderStrategy/viewportRenderStrategy.js";
import { FullFileRenderStrategy } from "../../gpu/renderStrategy/fullFileRenderStrategy.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { GlyphRasterizer } from "../../gpu/raster/glyphRasterizer.js";
var GlyphStorageBufferInfo = /* @__PURE__ */ ((GlyphStorageBufferInfo2) => {
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["FloatsPerEntry"] = 6] = "FloatsPerEntry";
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["BytesPerEntry"] = 24] = "BytesPerEntry";
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["Offset_TexturePosition"] = 0] = "Offset_TexturePosition";
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["Offset_TextureSize"] = 2] = "Offset_TextureSize";
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["Offset_OriginPosition"] = 4] = "Offset_OriginPosition";
  return GlyphStorageBufferInfo2;
})(GlyphStorageBufferInfo || {});
let ViewLinesGpu = class extends ViewPart {
  constructor(context, _viewGpuContext, _instantiationService, _logService) {
    super(context);
    this._viewGpuContext = _viewGpuContext;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    /**
     * Tracks the maximum line width seen so far for horizontal scrollbar sizing.
     * This is needed because GPU-rendered lines don't have DOM nodes to measure.
     */
    this._maxLineWidth = 0;
    this._atlasGpuTextureVersions = [];
    this._initialized = false;
    this._glyphRasterizer = this._register(new MutableDisposable());
    this._renderStrategy = this._register(new MutableDisposable());
    this.canvas = this._viewGpuContext.canvas.domNode;
    this._register(autorun((reader) => {
      this._viewGpuContext.canvasDevicePixelDimensions.read(reader);
      const lastViewportData = this._lastViewportData;
      if (lastViewportData) {
        setTimeout(() => {
          if (lastViewportData === this._lastViewportData) {
            this.renderText(lastViewportData);
          }
        });
      }
    }));
    this.initWebgpu();
  }
  async initWebgpu() {
    this._device = ViewGpuContext.deviceSync || await ViewGpuContext.device;
    if (this._store.isDisposed) {
      return;
    }
    const atlas = ViewGpuContext.atlas;
    this._register(atlas.onDidDeleteGlyphs(() => {
      this._atlasGpuTextureVersions.length = 0;
      this._atlasGpuTextureVersions[0] = 0;
      this._atlasGpuTextureVersions[1] = 0;
      this._renderStrategy.value.reset();
    }));
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this._viewGpuContext.ctx.configure({
      device: this._device,
      format: presentationFormat,
      alphaMode: "premultiplied"
    });
    this._renderPassColorAttachment = {
      view: null,
      // Will be filled at render time
      loadOp: "load",
      storeOp: "store"
    };
    this._renderPassDescriptor = {
      label: "Monaco render pass",
      colorAttachments: [this._renderPassColorAttachment]
    };
    let layoutInfoUniformBuffer;
    {
      let Info;
      ((Info2) => {
        Info2[Info2["FloatsPerEntry"] = 6] = "FloatsPerEntry";
        Info2[Info2["BytesPerEntry"] = 24] = "BytesPerEntry";
        Info2[Info2["Offset_CanvasWidth____"] = 0] = "Offset_CanvasWidth____";
        Info2[Info2["Offset_CanvasHeight___"] = 1] = "Offset_CanvasHeight___";
        Info2[Info2["Offset_ViewportOffsetX"] = 2] = "Offset_ViewportOffsetX";
        Info2[Info2["Offset_ViewportOffsetY"] = 3] = "Offset_ViewportOffsetY";
        Info2[Info2["Offset_ViewportWidth__"] = 4] = "Offset_ViewportWidth__";
        Info2[Info2["Offset_ViewportHeight_"] = 5] = "Offset_ViewportHeight_";
      })(Info || (Info = {}));
      const bufferValues = new Float32Array(6 /* FloatsPerEntry */);
      const updateBufferValues = (canvasDevicePixelWidth = this.canvas.width, canvasDevicePixelHeight = this.canvas.height) => {
        bufferValues[0 /* Offset_CanvasWidth____ */] = canvasDevicePixelWidth;
        bufferValues[1 /* Offset_CanvasHeight___ */] = canvasDevicePixelHeight;
        bufferValues[2 /* Offset_ViewportOffsetX */] = Math.ceil(this._context.configuration.options.get(EditorOption.layoutInfo).contentLeft * getActiveWindow().devicePixelRatio);
        bufferValues[3 /* Offset_ViewportOffsetY */] = 0;
        bufferValues[4 /* Offset_ViewportWidth__ */] = bufferValues[0 /* Offset_CanvasWidth____ */] - bufferValues[2 /* Offset_ViewportOffsetX */];
        bufferValues[5 /* Offset_ViewportHeight_ */] = bufferValues[1 /* Offset_CanvasHeight___ */] - bufferValues[3 /* Offset_ViewportOffsetY */];
        return bufferValues;
      };
      layoutInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
        label: "Monaco uniform buffer",
        size: 24 /* BytesPerEntry */,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }, () => updateBufferValues())).object;
      this._register(runOnChange(this._viewGpuContext.canvasDevicePixelDimensions, ({ width, height }) => {
        this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues(width, height));
      }));
      this._register(runOnChange(this._viewGpuContext.contentLeft, () => {
        this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues());
      }));
    }
    let atlasInfoUniformBuffer;
    {
      let Info;
      ((Info2) => {
        Info2[Info2["FloatsPerEntry"] = 2] = "FloatsPerEntry";
        Info2[Info2["BytesPerEntry"] = 8] = "BytesPerEntry";
        Info2[Info2["Offset_Width_"] = 0] = "Offset_Width_";
        Info2[Info2["Offset_Height"] = 1] = "Offset_Height";
      })(Info || (Info = {}));
      atlasInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
        label: "Monaco atlas info uniform buffer",
        size: 8 /* BytesPerEntry */,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }, () => {
        const values = new Float32Array(2 /* FloatsPerEntry */);
        values[0 /* Offset_Width_ */] = atlas.pageSize;
        values[1 /* Offset_Height */] = atlas.pageSize;
        return values;
      })).object;
    }
    const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
    const fontSize = this._context.configuration.options.get(EditorOption.fontSize);
    this._glyphRasterizer.value = this._register(new GlyphRasterizer(fontSize, fontFamily, this._viewGpuContext.devicePixelRatio.get(), ViewGpuContext.decorationStyleCache));
    this._register(runOnChange(this._viewGpuContext.devicePixelRatio, () => {
      this._refreshGlyphRasterizer();
    }));
    this._renderStrategy.value = this._instantiationService.createInstance(FullFileRenderStrategy, this._context, this._viewGpuContext, this._device, this._glyphRasterizer);
    this._glyphStorageBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco glyph storage buffer",
      size: TextureAtlas.maximumPageCount * (TextureAtlasPage.maximumGlyphCount * 24 /* BytesPerEntry */),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })).object;
    this._atlasGpuTextureVersions[0] = 0;
    this._atlasGpuTextureVersions[1] = 0;
    this._atlasGpuTexture = this._register(GPULifecycle.createTexture(this._device, {
      label: "Monaco atlas texture",
      format: "rgba8unorm",
      size: { width: atlas.pageSize, height: atlas.pageSize, depthOrArrayLayers: TextureAtlas.maximumPageCount },
      dimension: "2d",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    })).object;
    this._updateAtlasStorageBufferAndTexture();
    this._vertexBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco vertex buffer",
      size: quadVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    }, quadVertices)).object;
    const module = this._device.createShaderModule({
      label: "Monaco shader module",
      code: this._renderStrategy.value.wgsl
    });
    this._pipeline = this._device.createRenderPipeline({
      label: "Monaco render pipeline",
      layout: "auto",
      vertex: {
        module,
        buffers: [
          {
            arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
            // 2 floats, 4 bytes each
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }
              // position
            ]
          }
        ]
      },
      fragment: {
        module,
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha"
              },
              alpha: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha"
              }
            }
          }
        ]
      }
    });
    this._rebuildBindGroup = () => {
      this._bindGroup = this._device.createBindGroup({
        label: "Monaco bind group",
        layout: this._pipeline.getBindGroupLayout(0),
        entries: [
          // TODO: Pass in generically as array?
          { binding: BindingId.GlyphInfo, resource: { buffer: this._glyphStorageBuffer } },
          {
            binding: BindingId.TextureSampler,
            resource: this._device.createSampler({
              label: "Monaco atlas sampler",
              magFilter: "nearest",
              minFilter: "nearest"
            })
          },
          { binding: BindingId.Texture, resource: this._atlasGpuTexture.createView() },
          { binding: BindingId.LayoutInfoUniform, resource: { buffer: layoutInfoUniformBuffer } },
          { binding: BindingId.AtlasDimensionsUniform, resource: { buffer: atlasInfoUniformBuffer } },
          ...this._renderStrategy.value.bindGroupEntries
        ]
      });
    };
    this._rebuildBindGroup();
    this._initialized = true;
    if (this._initViewportData) {
      for (const viewportData of this._initViewportData) {
        this.renderText(viewportData);
      }
      this._initViewportData = void 0;
    }
  }
  _refreshRenderStrategy(viewportData) {
    if (this._renderStrategy.value?.type === "viewport") {
      return;
    }
    if (viewportData.endLineNumber < FullFileRenderStrategy.maxSupportedLines && this._viewportMaxColumn(viewportData) < FullFileRenderStrategy.maxSupportedColumns) {
      return;
    }
    this._logService.trace(`File is larger than ${FullFileRenderStrategy.maxSupportedLines} lines or ${FullFileRenderStrategy.maxSupportedColumns} columns, switching to viewport render strategy`);
    const viewportRenderStrategy = this._instantiationService.createInstance(ViewportRenderStrategy, this._context, this._viewGpuContext, this._device, this._glyphRasterizer);
    this._renderStrategy.value = viewportRenderStrategy;
    this._register(viewportRenderStrategy.onDidChangeBindGroupEntries(() => this._rebuildBindGroup?.()));
    this._rebuildBindGroup?.();
  }
  _viewportMaxColumn(viewportData) {
    let maxColumn = 0;
    let lineData;
    for (let i = viewportData.startLineNumber; i <= viewportData.endLineNumber; i++) {
      lineData = viewportData.getViewLineRenderingData(i);
      maxColumn = Math.max(maxColumn, lineData.maxColumn);
    }
    return maxColumn;
  }
  _updateAtlasStorageBufferAndTexture() {
    for (const [layerIndex, page] of ViewGpuContext.atlas.pages.entries()) {
      if (layerIndex >= TextureAtlas.maximumPageCount) {
        console.log(`Attempt to upload atlas page [${layerIndex}], only ${TextureAtlas.maximumPageCount} are supported currently`);
        continue;
      }
      if (page.version === this._atlasGpuTextureVersions[layerIndex]) {
        continue;
      }
      this._logService.trace("Updating atlas page[", layerIndex, "] from version ", this._atlasGpuTextureVersions[layerIndex], " to version ", page.version);
      const entryCount = 6 /* FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount;
      const values = new Float32Array(entryCount);
      let entryOffset = 0;
      for (const glyph of page.glyphs) {
        values[entryOffset + 0 /* Offset_TexturePosition */] = glyph.x;
        values[entryOffset + 0 /* Offset_TexturePosition */ + 1] = glyph.y;
        values[entryOffset + 2 /* Offset_TextureSize */] = glyph.w;
        values[entryOffset + 2 /* Offset_TextureSize */ + 1] = glyph.h;
        values[entryOffset + 4 /* Offset_OriginPosition */] = glyph.originOffsetX;
        values[entryOffset + 4 /* Offset_OriginPosition */ + 1] = glyph.originOffsetY;
        entryOffset += 6 /* FloatsPerEntry */;
      }
      if (entryOffset / 6 /* FloatsPerEntry */ > TextureAtlasPage.maximumGlyphCount) {
        throw new Error(`Attempting to write more glyphs (${entryOffset / 6 /* FloatsPerEntry */}) than the GPUBuffer can hold (${TextureAtlasPage.maximumGlyphCount})`);
      }
      this._device.queue.writeBuffer(
        this._glyphStorageBuffer,
        layerIndex * 6 /* FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount * Float32Array.BYTES_PER_ELEMENT,
        values,
        0,
        6 /* FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount
      );
      if (page.usedArea.right - page.usedArea.left > 0 && page.usedArea.bottom - page.usedArea.top > 0) {
        this._device.queue.copyExternalImageToTexture(
          { source: page.source },
          {
            texture: this._atlasGpuTexture,
            origin: {
              x: page.usedArea.left,
              y: page.usedArea.top,
              z: layerIndex
            }
          },
          {
            width: page.usedArea.right - page.usedArea.left + 1,
            height: page.usedArea.bottom - page.usedArea.top + 1
          }
        );
      }
      this._atlasGpuTextureVersions[layerIndex] = page.version;
    }
  }
  prepareRender(ctx) {
    throw new BugIndicatingError("Should not be called");
  }
  render(ctx) {
    throw new BugIndicatingError("Should not be called");
  }
  // #region Event handlers
  // Since ViewLinesGpu currently coordinates rendering to the canvas, it must listen to all
  // changed events that any GPU part listens to. This is because any drawing to the canvas will
  // clear it for that frame, so all parts must be rendered every time.
  //
  // Additionally, since this is intrinsically linked to ViewLines, it must also listen to events
  // from that side. Luckily rendering is cheap, it's only when uploaded data changes does it
  // start to cost.
  onConfigurationChanged(e) {
    this._refreshGlyphRasterizer();
    this._maxLineWidth = 0;
    return true;
  }
  onCursorStateChanged(e) {
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onFlushed(e) {
    this._maxLineWidth = 0;
    return true;
  }
  onLinesChanged(e) {
    return true;
  }
  onLinesDeleted(e) {
    this._maxLineWidth = 0;
    return true;
  }
  onLinesInserted(e) {
    return true;
  }
  onLineMappingChanged(e) {
    return true;
  }
  onRevealRangeRequest(e) {
    return true;
  }
  onScrollChanged(e) {
    return true;
  }
  onThemeChanged(e) {
    return true;
  }
  onZonesChanged(e) {
    return true;
  }
  // #endregion
  _refreshGlyphRasterizer() {
    const glyphRasterizer = this._glyphRasterizer.value;
    if (!glyphRasterizer) {
      return;
    }
    const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
    const fontSize = this._context.configuration.options.get(EditorOption.fontSize);
    const devicePixelRatio = this._viewGpuContext.devicePixelRatio.get();
    if (glyphRasterizer.fontFamily !== fontFamily || glyphRasterizer.fontSize !== fontSize || glyphRasterizer.devicePixelRatio !== devicePixelRatio) {
      this._glyphRasterizer.value = new GlyphRasterizer(fontSize, fontFamily, devicePixelRatio, ViewGpuContext.decorationStyleCache);
    }
  }
  renderText(viewportData) {
    if (this._initialized) {
      this._refreshRenderStrategy(viewportData);
      return this._renderText(viewportData);
    } else {
      this._initViewportData = this._initViewportData ?? [];
      this._initViewportData.push(viewportData);
    }
  }
  _renderText(viewportData) {
    this._viewGpuContext.rectangleRenderer.draw(viewportData);
    const options = new ViewLineOptions(this._context.configuration, this._context.theme.type);
    this._renderStrategy.value.update(viewportData, options);
    this._updateAtlasStorageBufferAndTexture();
    const encoder = this._device.createCommandEncoder({ label: "Monaco command encoder" });
    this._renderPassColorAttachment.view = this._viewGpuContext.ctx.getCurrentTexture().createView({ label: "Monaco canvas texture view" });
    const pass = encoder.beginRenderPass(this._renderPassDescriptor);
    pass.setPipeline(this._pipeline);
    pass.setVertexBuffer(0, this._vertexBuffer);
    const contentLeft = Math.ceil(this._viewGpuContext.contentLeft.get() * this._viewGpuContext.devicePixelRatio.get());
    pass.setScissorRect(contentLeft, 0, this.canvas.width - contentLeft, this.canvas.height);
    pass.setBindGroup(0, this._bindGroup);
    this._renderStrategy.value.draw(pass, viewportData);
    pass.end();
    const commandBuffer = encoder.finish();
    this._device.queue.submit([commandBuffer]);
    this._lastViewportData = viewportData;
    this._lastViewLineOptions = options;
    this._updateMaxLineWidth(viewportData, options);
  }
  /**
   * Update the max line width based on GPU-rendered lines.
   * This is needed because GPU-rendered lines don't have DOM nodes to measure.
   */
  _updateMaxLineWidth(viewportData, viewLineOptions) {
    const dpr = getActiveWindow().devicePixelRatio;
    let localMaxLineWidth = 0;
    for (let lineNumber = viewportData.startLineNumber; lineNumber <= viewportData.endLineNumber; lineNumber++) {
      if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, lineNumber)) {
        continue;
      }
      const lineData = viewportData.getViewLineRenderingData(lineNumber);
      const lineWidth = this._computeLineWidth(lineData, viewLineOptions, dpr);
      localMaxLineWidth = Math.max(localMaxLineWidth, lineWidth);
    }
    const iLineWidth = Math.ceil(localMaxLineWidth);
    if (iLineWidth > this._maxLineWidth) {
      this._maxLineWidth = iLineWidth;
      this._context.viewModel.viewLayout.setMaxLineWidth(this._maxLineWidth);
    }
  }
  /**
   * Compute the width of a line in CSS pixels.
   */
  _computeLineWidth(lineData, viewLineOptions, dpr) {
    const content = lineData.content;
    let contentSegmenter;
    if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
      contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
    }
    let width = 0;
    let tabXOffset = 0;
    for (let x = 0; x < content.length; x++) {
      let chars;
      if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
        chars = content.charAt(x);
      } else {
        const segment = contentSegmenter.getSegmentAtIndex(x);
        if (segment === void 0) {
          continue;
        }
        chars = segment;
      }
      if (chars === "	") {
        const offsetBefore = x + tabXOffset;
        tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
        width += viewLineOptions.spaceWidth * (tabXOffset - offsetBefore);
        tabXOffset -= x + 1;
      } else if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
        width += viewLineOptions.spaceWidth;
      } else {
        width += this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / dpr;
      }
    }
    return width;
  }
  linesVisibleRangesForRange(_range, includeNewLines) {
    if (!this._lastViewportData) {
      return null;
    }
    const originalEndLineNumber = _range.endLineNumber;
    const range = Range.intersectRanges(_range, this._lastViewportData.visibleRange);
    if (!range) {
      return null;
    }
    const rendStartLineNumber = this._lastViewportData.startLineNumber;
    const rendEndLineNumber = this._lastViewportData.endLineNumber;
    const viewportData = this._lastViewportData;
    const viewLineOptions = this._lastViewLineOptions;
    if (!viewportData || !viewLineOptions) {
      return null;
    }
    const visibleRanges = [];
    let nextLineModelLineNumber = 0;
    if (includeNewLines) {
      nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
    }
    for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
      if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
        continue;
      }
      const startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
      const continuesInNextLine = lineNumber !== originalEndLineNumber;
      const endColumn = continuesInNextLine ? this._context.viewModel.getLineMaxColumn(lineNumber) : range.endColumn;
      const visibleRangesForLine = this._visibleRangesForLineRange(lineNumber, startColumn, endColumn);
      if (!visibleRangesForLine) {
        continue;
      }
      if (includeNewLines && lineNumber < originalEndLineNumber) {
        const currentLineModelLineNumber = nextLineModelLineNumber;
        nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber + 1, 1)).lineNumber;
        if (currentLineModelLineNumber !== nextLineModelLineNumber) {
          visibleRangesForLine.ranges[visibleRangesForLine.ranges.length - 1].width += viewLineOptions.spaceWidth;
        }
      }
      visibleRanges.push(new LineVisibleRanges(visibleRangesForLine.outsideRenderedLine, lineNumber, HorizontalRange.from(visibleRangesForLine.ranges), continuesInNextLine));
    }
    if (visibleRanges.length === 0) {
      return null;
    }
    return visibleRanges;
  }
  _visibleRangesForLineRange(lineNumber, startColumn, endColumn) {
    if (this.shouldRender()) {
      return null;
    }
    const viewportData = this._lastViewportData;
    const viewLineOptions = this._lastViewLineOptions;
    if (!viewportData || !viewLineOptions || lineNumber < viewportData.startLineNumber || lineNumber > viewportData.endLineNumber) {
      return null;
    }
    const lineData = viewportData.getViewLineRenderingData(lineNumber);
    const content = lineData.content;
    let contentSegmenter;
    if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
      contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
    }
    let chars = "";
    let resolvedStartColumn = 0;
    let resolvedStartCssPixelOffset = 0;
    for (let x = 0; x < startColumn - 1; x++) {
      if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
        chars = content.charAt(x);
      } else {
        chars = contentSegmenter.getSegmentAtIndex(x);
        if (chars === void 0) {
          continue;
        }
        resolvedStartCssPixelOffset += this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / getActiveWindow().devicePixelRatio - viewLineOptions.spaceWidth;
      }
      if (chars === "	") {
        resolvedStartColumn = CursorColumns.nextRenderTabStop(resolvedStartColumn, lineData.tabSize);
      } else {
        resolvedStartColumn++;
      }
    }
    let resolvedEndColumn = resolvedStartColumn;
    let resolvedEndCssPixelOffset = 0;
    for (let x = startColumn - 1; x < endColumn - 1; x++) {
      if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
        chars = content.charAt(x);
      } else {
        chars = contentSegmenter.getSegmentAtIndex(x);
        if (chars === void 0) {
          continue;
        }
        resolvedEndCssPixelOffset += this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / getActiveWindow().devicePixelRatio - viewLineOptions.spaceWidth;
      }
      if (chars === "	") {
        resolvedEndColumn = CursorColumns.nextRenderTabStop(resolvedEndColumn, lineData.tabSize);
      } else {
        resolvedEndColumn++;
      }
    }
    const result = new VisibleRanges(false, [
      new FloatHorizontalRange(
        resolvedStartColumn * viewLineOptions.spaceWidth + resolvedStartCssPixelOffset,
        (resolvedEndColumn - resolvedStartColumn) * viewLineOptions.spaceWidth + resolvedEndCssPixelOffset
      )
    ]);
    return result;
  }
  visibleRangeForPosition(position) {
    const visibleRanges = this._visibleRangesForLineRange(position.lineNumber, position.column, position.column);
    if (!visibleRanges) {
      return null;
    }
    return new HorizontalPosition(visibleRanges.outsideRenderedLine, visibleRanges.ranges[0].left);
  }
  getLineWidth(lineNumber) {
    if (!this._lastViewportData || !this._lastViewLineOptions) {
      return void 0;
    }
    if (!this._viewGpuContext.canRender(this._lastViewLineOptions, this._lastViewportData, lineNumber)) {
      return void 0;
    }
    const lineData = this._lastViewportData.getViewLineRenderingData(lineNumber);
    const lineRange = this._visibleRangesForLineRange(lineNumber, 1, lineData.maxColumn);
    const lastRange = lineRange?.ranges.at(-1);
    if (lastRange) {
      return lastRange.left + lastRange.width;
    }
    return void 0;
  }
  getPositionAtCoordinate(lineNumber, mouseContentHorizontalOffset) {
    if (!this._lastViewportData || !this._lastViewLineOptions) {
      return void 0;
    }
    if (!this._viewGpuContext.canRender(this._lastViewLineOptions, this._lastViewportData, lineNumber)) {
      return void 0;
    }
    const lineData = this._lastViewportData.getViewLineRenderingData(lineNumber);
    const content = lineData.content;
    const dpr = getActiveWindow().devicePixelRatio;
    const mouseContentHorizontalOffsetDevicePixels = mouseContentHorizontalOffset * dpr;
    const spaceWidthDevicePixels = this._lastViewLineOptions.spaceWidth * dpr;
    const contentSegmenter = createContentSegmenter(lineData, this._lastViewLineOptions);
    let widthSoFar = 0;
    let charWidth = 0;
    let tabXOffset = 0;
    let column = 0;
    for (let x = 0; x < content.length; x++) {
      const chars = contentSegmenter.getSegmentAtIndex(x);
      if (chars === void 0) {
        column++;
        continue;
      }
      if (chars === "	") {
        const offsetBefore = x + tabXOffset;
        tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
        charWidth = spaceWidthDevicePixels * (tabXOffset - offsetBefore);
        tabXOffset -= x + 1;
      } else if (lineData.isBasicASCII && this._lastViewLineOptions.useMonospaceOptimizations) {
        charWidth = spaceWidthDevicePixels;
      } else {
        charWidth = this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width;
      }
      if (mouseContentHorizontalOffsetDevicePixels < widthSoFar + charWidth / 2) {
        break;
      }
      widthSoFar += charWidth;
      column++;
    }
    return new Position(lineNumber, column + 1);
  }
};
ViewLinesGpu = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService)
], ViewLinesGpu);
export {
  ViewLinesGpu
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdQYXJ0c1xcdmlld0xpbmVzR3B1XFx2aWV3TGluZXNHcHUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBydW5PbkNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3cG9ydERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZXNWaWV3cG9ydERhdGEuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVGV4dHVyZUF0bGFzUGFnZSB9IGZyb20gJy4uLy4uL2dwdS9hdGxhcy90ZXh0dXJlQXRsYXNQYWdlLmpzJztcbmltcG9ydCB7IEJpbmRpbmdJZCwgdHlwZSBJR3B1UmVuZGVyU3RyYXRlZ3kgfSBmcm9tICcuLi8uLi9ncHUvZ3B1LmpzJztcbmltcG9ydCB7IEdQVUxpZmVjeWNsZSB9IGZyb20gJy4uLy4uL2dwdS9ncHVEaXNwb3NhYmxlLmpzJztcbmltcG9ydCB7IHF1YWRWZXJ0aWNlcyB9IGZyb20gJy4uLy4uL2dwdS9ncHVVdGlscy5qcyc7XG5pbXBvcnQgeyBWaWV3R3B1Q29udGV4dCB9IGZyb20gJy4uLy4uL2dwdS92aWV3R3B1Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBGbG9hdEhvcml6b250YWxSYW5nZSwgSG9yaXpvbnRhbFBvc2l0aW9uLCBIb3Jpem9udGFsUmFuZ2UsIElWaWV3TGluZXMsIExpbmVWaXNpYmxlUmFuZ2VzLCBSZW5kZXJpbmdDb250ZXh0LCBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCwgVmlzaWJsZVJhbmdlcyB9IGZyb20gJy4uLy4uL3ZpZXcvcmVuZGVyaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaWV3UGFydCB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld1BhcnQuanMnO1xuaW1wb3J0IHsgVmlld0xpbmVPcHRpb25zIH0gZnJvbSAnLi4vdmlld0xpbmVzL3ZpZXdMaW5lT3B0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sdW1ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2N1cnNvckNvbHVtbnMuanMnO1xuaW1wb3J0IHsgVGV4dHVyZUF0bGFzIH0gZnJvbSAnLi4vLi4vZ3B1L2F0bGFzL3RleHR1cmVBdGxhcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb250ZW50U2VnbWVudGVyLCB0eXBlIElDb250ZW50U2VnbWVudGVyIH0gZnJvbSAnLi4vLi4vZ3B1L2NvbnRlbnRTZWdtZW50ZXIuanMnO1xuaW1wb3J0IHsgVmlld3BvcnRSZW5kZXJTdHJhdGVneSB9IGZyb20gJy4uLy4uL2dwdS9yZW5kZXJTdHJhdGVneS92aWV3cG9ydFJlbmRlclN0cmF0ZWd5LmpzJztcbmltcG9ydCB7IEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kgfSBmcm9tICcuLi8uLi9ncHUvcmVuZGVyU3RyYXRlZ3kvZnVsbEZpbGVSZW5kZXJTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFZpZXdMaW5lUmVuZGVyaW5nRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgR2x5cGhSYXN0ZXJpemVyIH0gZnJvbSAnLi4vLi4vZ3B1L3Jhc3Rlci9nbHlwaFJhc3Rlcml6ZXIuanMnO1xuXG5jb25zdCBlbnVtIEdseXBoU3RvcmFnZUJ1ZmZlckluZm8ge1xuXHRGbG9hdHNQZXJFbnRyeSA9IDIgKyAyICsgMixcblx0Qnl0ZXNQZXJFbnRyeSA9IEdseXBoU3RvcmFnZUJ1ZmZlckluZm8uRmxvYXRzUGVyRW50cnkgKiA0LFxuXHRPZmZzZXRfVGV4dHVyZVBvc2l0aW9uID0gMCxcblx0T2Zmc2V0X1RleHR1cmVTaXplID0gMixcblx0T2Zmc2V0X09yaWdpblBvc2l0aW9uID0gNCxcbn1cblxuLyoqXG4gKiBUaGUgR1BVIGltcGxlbWVudGF0aW9uIG9mIHRoZSBWaWV3TGluZXMgcGFydC5cbiAqL1xuZXhwb3J0IGNsYXNzIFZpZXdMaW5lc0dwdSBleHRlbmRzIFZpZXdQYXJ0IGltcGxlbWVudHMgSVZpZXdMaW5lcyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xuXG5cdHByaXZhdGUgX2luaXRWaWV3cG9ydERhdGE/OiBWaWV3cG9ydERhdGFbXTtcblx0cHJpdmF0ZSBfbGFzdFZpZXdwb3J0RGF0YT86IFZpZXdwb3J0RGF0YTtcblx0cHJpdmF0ZSBfbGFzdFZpZXdMaW5lT3B0aW9ucz86IFZpZXdMaW5lT3B0aW9ucztcblxuXHQvKipcblx0ICogVHJhY2tzIHRoZSBtYXhpbXVtIGxpbmUgd2lkdGggc2VlbiBzbyBmYXIgZm9yIGhvcml6b250YWwgc2Nyb2xsYmFyIHNpemluZy5cblx0ICogVGhpcyBpcyBuZWVkZWQgYmVjYXVzZSBHUFUtcmVuZGVyZWQgbGluZXMgZG9uJ3QgaGF2ZSBET00gbm9kZXMgdG8gbWVhc3VyZS5cblx0ICovXG5cdHByaXZhdGUgX21heExpbmVXaWR0aDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9kZXZpY2UhOiBHUFVEZXZpY2U7XG5cdHByaXZhdGUgX3JlbmRlclBhc3NEZXNjcmlwdG9yITogR1BVUmVuZGVyUGFzc0Rlc2NyaXB0b3I7XG5cdHByaXZhdGUgX3JlbmRlclBhc3NDb2xvckF0dGFjaG1lbnQhOiBHUFVSZW5kZXJQYXNzQ29sb3JBdHRhY2htZW50O1xuXHRwcml2YXRlIF9iaW5kR3JvdXAhOiBHUFVCaW5kR3JvdXA7XG5cdHByaXZhdGUgX3BpcGVsaW5lITogR1BVUmVuZGVyUGlwZWxpbmU7XG5cblx0cHJpdmF0ZSBfdmVydGV4QnVmZmVyITogR1BVQnVmZmVyO1xuXG5cdHByaXZhdGUgX2dseXBoU3RvcmFnZUJ1ZmZlciE6IEdQVUJ1ZmZlcjtcblx0cHJpdmF0ZSBfYXRsYXNHcHVUZXh0dXJlITogR1BVVGV4dHVyZTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXRsYXNHcHVUZXh0dXJlVmVyc2lvbnM6IG51bWJlcltdID0gW107XG5cblx0cHJpdmF0ZSBfaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9nbHlwaFJhc3Rlcml6ZXI6IE11dGFibGVEaXNwb3NhYmxlPEdseXBoUmFzdGVyaXplcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlclN0cmF0ZWd5OiBNdXRhYmxlRGlzcG9zYWJsZTxJR3B1UmVuZGVyU3RyYXRlZ3k+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9yZWJ1aWxkQmluZEdyb3VwPzogKCkgPT4gdm9pZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0OiBWaWV3Q29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3R3B1Q29udGV4dDogVmlld0dwdUNvbnRleHQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGV4dCk7XG5cblx0XHR0aGlzLmNhbnZhcyA9IHRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhbnZhcy5kb21Ob2RlO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHRoZSBmb2xsb3dpbmcgZnJhbWUgYWZ0ZXIgY2FudmFzIGRldmljZSBwaXhlbCBkaW1lbnNpb25zIGNoYW5nZSwgcHJvdmlkZWQgYVxuXHRcdC8vIG5ldyByZW5kZXIgZG9lcyBub3Qgb2NjdXIuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fdmlld0dwdUNvbnRleHQuY2FudmFzRGV2aWNlUGl4ZWxEaW1lbnNpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGxhc3RWaWV3cG9ydERhdGEgPSB0aGlzLl9sYXN0Vmlld3BvcnREYXRhO1xuXHRcdFx0aWYgKGxhc3RWaWV3cG9ydERhdGEpIHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGxhc3RWaWV3cG9ydERhdGEgPT09IHRoaXMuX2xhc3RWaWV3cG9ydERhdGEpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVuZGVyVGV4dChsYXN0Vmlld3BvcnREYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuaW5pdFdlYmdwdSgpO1xuXHR9XG5cblx0YXN5bmMgaW5pdFdlYmdwdSgpIHtcblx0XHQvLyAjcmVnaW9uIEdlbmVyYWxcblxuXHRcdHRoaXMuX2RldmljZSA9IFZpZXdHcHVDb250ZXh0LmRldmljZVN5bmMgfHwgYXdhaXQgVmlld0dwdUNvbnRleHQuZGV2aWNlO1xuXG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhdGxhcyA9IFZpZXdHcHVDb250ZXh0LmF0bGFzO1xuXG5cdFx0Ly8gUmVyZW5kZXIgd2hlbiB0aGUgdGV4dHVyZSBhdGxhcyBkZWxldGVzIGdseXBoc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF0bGFzLm9uRGlkRGVsZXRlR2x5cGhzKCgpID0+IHtcblx0XHRcdHRoaXMuX2F0bGFzR3B1VGV4dHVyZVZlcnNpb25zLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLl9hdGxhc0dwdVRleHR1cmVWZXJzaW9uc1swXSA9IDA7XG5cdFx0XHR0aGlzLl9hdGxhc0dwdVRleHR1cmVWZXJzaW9uc1sxXSA9IDA7XG5cdFx0XHR0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZSEucmVzZXQoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcmVzZW50YXRpb25Gb3JtYXQgPSBuYXZpZ2F0b3IuZ3B1LmdldFByZWZlcnJlZENhbnZhc0Zvcm1hdCgpO1xuXHRcdHRoaXMuX3ZpZXdHcHVDb250ZXh0LmN0eC5jb25maWd1cmUoe1xuXHRcdFx0ZGV2aWNlOiB0aGlzLl9kZXZpY2UsXG5cdFx0XHRmb3JtYXQ6IHByZXNlbnRhdGlvbkZvcm1hdCxcblx0XHRcdGFscGhhTW9kZTogJ3ByZW11bHRpcGxpZWQnLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVuZGVyUGFzc0NvbG9yQXR0YWNobWVudCA9IHtcblx0XHRcdHZpZXc6IG51bGwhLCAvLyBXaWxsIGJlIGZpbGxlZCBhdCByZW5kZXIgdGltZVxuXHRcdFx0bG9hZE9wOiAnbG9hZCcsXG5cdFx0XHRzdG9yZU9wOiAnc3RvcmUnLFxuXHRcdH07XG5cdFx0dGhpcy5fcmVuZGVyUGFzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyByZW5kZXIgcGFzcycsXG5cdFx0XHRjb2xvckF0dGFjaG1lbnRzOiBbdGhpcy5fcmVuZGVyUGFzc0NvbG9yQXR0YWNobWVudF0sXG5cdFx0fTtcblxuXHRcdC8vICNlbmRyZWdpb24gR2VuZXJhbFxuXG5cdFx0Ly8gI3JlZ2lvbiBVbmlmb3Jtc1xuXG5cdFx0bGV0IGxheW91dEluZm9Vbmlmb3JtQnVmZmVyOiBHUFVCdWZmZXI7XG5cdFx0e1xuXHRcdFx0Y29uc3QgZW51bSBJbmZvIHtcblx0XHRcdFx0RmxvYXRzUGVyRW50cnkgPSA2LFxuXHRcdFx0XHRCeXRlc1BlckVudHJ5ID0gSW5mby5GbG9hdHNQZXJFbnRyeSAqIDQsXG5cdFx0XHRcdE9mZnNldF9DYW52YXNXaWR0aF9fX18gPSAwLFxuXHRcdFx0XHRPZmZzZXRfQ2FudmFzSGVpZ2h0X19fID0gMSxcblx0XHRcdFx0T2Zmc2V0X1ZpZXdwb3J0T2Zmc2V0WCA9IDIsXG5cdFx0XHRcdE9mZnNldF9WaWV3cG9ydE9mZnNldFkgPSAzLFxuXHRcdFx0XHRPZmZzZXRfVmlld3BvcnRXaWR0aF9fID0gNCxcblx0XHRcdFx0T2Zmc2V0X1ZpZXdwb3J0SGVpZ2h0XyA9IDUsXG5cdFx0XHR9XG5cdFx0XHRjb25zdCBidWZmZXJWYWx1ZXMgPSBuZXcgRmxvYXQzMkFycmF5KEluZm8uRmxvYXRzUGVyRW50cnkpO1xuXHRcdFx0Y29uc3QgdXBkYXRlQnVmZmVyVmFsdWVzID0gKGNhbnZhc0RldmljZVBpeGVsV2lkdGg6IG51bWJlciA9IHRoaXMuY2FudmFzLndpZHRoLCBjYW52YXNEZXZpY2VQaXhlbEhlaWdodDogbnVtYmVyID0gdGhpcy5jYW52YXMuaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdGJ1ZmZlclZhbHVlc1tJbmZvLk9mZnNldF9DYW52YXNXaWR0aF9fX19dID0gY2FudmFzRGV2aWNlUGl4ZWxXaWR0aDtcblx0XHRcdFx0YnVmZmVyVmFsdWVzW0luZm8uT2Zmc2V0X0NhbnZhc0hlaWdodF9fX10gPSBjYW52YXNEZXZpY2VQaXhlbEhlaWdodDtcblx0XHRcdFx0YnVmZmVyVmFsdWVzW0luZm8uT2Zmc2V0X1ZpZXdwb3J0T2Zmc2V0WF0gPSBNYXRoLmNlaWwodGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKS5jb250ZW50TGVmdCAqIGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW8pO1xuXHRcdFx0XHRidWZmZXJWYWx1ZXNbSW5mby5PZmZzZXRfVmlld3BvcnRPZmZzZXRZXSA9IDA7XG5cdFx0XHRcdGJ1ZmZlclZhbHVlc1tJbmZvLk9mZnNldF9WaWV3cG9ydFdpZHRoX19dID0gYnVmZmVyVmFsdWVzW0luZm8uT2Zmc2V0X0NhbnZhc1dpZHRoX19fX10gLSBidWZmZXJWYWx1ZXNbSW5mby5PZmZzZXRfVmlld3BvcnRPZmZzZXRYXTtcblx0XHRcdFx0YnVmZmVyVmFsdWVzW0luZm8uT2Zmc2V0X1ZpZXdwb3J0SGVpZ2h0X10gPSBidWZmZXJWYWx1ZXNbSW5mby5PZmZzZXRfQ2FudmFzSGVpZ2h0X19fXSAtIGJ1ZmZlclZhbHVlc1tJbmZvLk9mZnNldF9WaWV3cG9ydE9mZnNldFldO1xuXHRcdFx0XHRyZXR1cm4gYnVmZmVyVmFsdWVzO1xuXHRcdFx0fTtcblx0XHRcdGxheW91dEluZm9Vbmlmb3JtQnVmZmVyID0gdGhpcy5fcmVnaXN0ZXIoR1BVTGlmZWN5Y2xlLmNyZWF0ZUJ1ZmZlcih0aGlzLl9kZXZpY2UsIHtcblx0XHRcdFx0bGFiZWw6ICdNb25hY28gdW5pZm9ybSBidWZmZXInLFxuXHRcdFx0XHRzaXplOiBJbmZvLkJ5dGVzUGVyRW50cnksXG5cdFx0XHRcdHVzYWdlOiBHUFVCdWZmZXJVc2FnZS5VTklGT1JNIHwgR1BVQnVmZmVyVXNhZ2UuQ09QWV9EU1QsXG5cdFx0XHR9LCAoKSA9PiB1cGRhdGVCdWZmZXJWYWx1ZXMoKSkpLm9iamVjdDtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlKHRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhbnZhc0RldmljZVBpeGVsRGltZW5zaW9ucywgKHsgd2lkdGgsIGhlaWdodCB9KSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RldmljZS5xdWV1ZS53cml0ZUJ1ZmZlcihsYXlvdXRJbmZvVW5pZm9ybUJ1ZmZlciwgMCwgdXBkYXRlQnVmZmVyVmFsdWVzKHdpZHRoLCBoZWlnaHQpKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlKHRoaXMuX3ZpZXdHcHVDb250ZXh0LmNvbnRlbnRMZWZ0LCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RldmljZS5xdWV1ZS53cml0ZUJ1ZmZlcihsYXlvdXRJbmZvVW5pZm9ybUJ1ZmZlciwgMCwgdXBkYXRlQnVmZmVyVmFsdWVzKCkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGxldCBhdGxhc0luZm9Vbmlmb3JtQnVmZmVyOiBHUFVCdWZmZXI7XG5cdFx0e1xuXHRcdFx0Y29uc3QgZW51bSBJbmZvIHtcblx0XHRcdFx0RmxvYXRzUGVyRW50cnkgPSAyLFxuXHRcdFx0XHRCeXRlc1BlckVudHJ5ID0gSW5mby5GbG9hdHNQZXJFbnRyeSAqIDQsXG5cdFx0XHRcdE9mZnNldF9XaWR0aF8gPSAwLFxuXHRcdFx0XHRPZmZzZXRfSGVpZ2h0ID0gMSxcblx0XHRcdH1cblx0XHRcdGF0bGFzSW5mb1VuaWZvcm1CdWZmZXIgPSB0aGlzLl9yZWdpc3RlcihHUFVMaWZlY3ljbGUuY3JlYXRlQnVmZmVyKHRoaXMuX2RldmljZSwge1xuXHRcdFx0XHRsYWJlbDogJ01vbmFjbyBhdGxhcyBpbmZvIHVuaWZvcm0gYnVmZmVyJyxcblx0XHRcdFx0c2l6ZTogSW5mby5CeXRlc1BlckVudHJ5LFxuXHRcdFx0XHR1c2FnZTogR1BVQnVmZmVyVXNhZ2UuVU5JRk9STSB8IEdQVUJ1ZmZlclVzYWdlLkNPUFlfRFNULFxuXHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB2YWx1ZXMgPSBuZXcgRmxvYXQzMkFycmF5KEluZm8uRmxvYXRzUGVyRW50cnkpO1xuXHRcdFx0XHR2YWx1ZXNbSW5mby5PZmZzZXRfV2lkdGhfXSA9IGF0bGFzLnBhZ2VTaXplO1xuXHRcdFx0XHR2YWx1ZXNbSW5mby5PZmZzZXRfSGVpZ2h0XSA9IGF0bGFzLnBhZ2VTaXplO1xuXHRcdFx0XHRyZXR1cm4gdmFsdWVzO1xuXHRcdFx0fSkpLm9iamVjdDtcblx0XHR9XG5cblx0XHQvLyAjZW5kcmVnaW9uIFVuaWZvcm1zXG5cblx0XHQvLyAjcmVnaW9uIFN0b3JhZ2UgYnVmZmVyc1xuXG5cdFx0Y29uc3QgZm9udEZhbWlseSA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEZhbWlseSk7XG5cdFx0Y29uc3QgZm9udFNpemUgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRTaXplKTtcblx0XHR0aGlzLl9nbHlwaFJhc3Rlcml6ZXIudmFsdWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgR2x5cGhSYXN0ZXJpemVyKGZvbnRTaXplLCBmb250RmFtaWx5LCB0aGlzLl92aWV3R3B1Q29udGV4dC5kZXZpY2VQaXhlbFJhdGlvLmdldCgpLCBWaWV3R3B1Q29udGV4dC5kZWNvcmF0aW9uU3R5bGVDYWNoZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlKHRoaXMuX3ZpZXdHcHVDb250ZXh0LmRldmljZVBpeGVsUmF0aW8sICgpID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hHbHlwaFJhc3Rlcml6ZXIoKTtcblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX3JlbmRlclN0cmF0ZWd5LnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRnVsbEZpbGVSZW5kZXJTdHJhdGVneSwgdGhpcy5fY29udGV4dCwgdGhpcy5fdmlld0dwdUNvbnRleHQsIHRoaXMuX2RldmljZSwgdGhpcy5fZ2x5cGhSYXN0ZXJpemVyIGFzIHsgdmFsdWU6IEdseXBoUmFzdGVyaXplciB9KTtcblx0XHQvLyB0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3ksIHRoaXMuX2NvbnRleHQsIHRoaXMuX3ZpZXdHcHVDb250ZXh0LCB0aGlzLl9kZXZpY2UpO1xuXG5cdFx0dGhpcy5fZ2x5cGhTdG9yYWdlQnVmZmVyID0gdGhpcy5fcmVnaXN0ZXIoR1BVTGlmZWN5Y2xlLmNyZWF0ZUJ1ZmZlcih0aGlzLl9kZXZpY2UsIHtcblx0XHRcdGxhYmVsOiAnTW9uYWNvIGdseXBoIHN0b3JhZ2UgYnVmZmVyJyxcblx0XHRcdHNpemU6IFRleHR1cmVBdGxhcy5tYXhpbXVtUGFnZUNvdW50ICogKFRleHR1cmVBdGxhc1BhZ2UubWF4aW11bUdseXBoQ291bnQgKiBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLkJ5dGVzUGVyRW50cnkpLFxuXHRcdFx0dXNhZ2U6IEdQVUJ1ZmZlclVzYWdlLlNUT1JBR0UgfCBHUFVCdWZmZXJVc2FnZS5DT1BZX0RTVCxcblx0XHR9KSkub2JqZWN0O1xuXHRcdHRoaXMuX2F0bGFzR3B1VGV4dHVyZVZlcnNpb25zWzBdID0gMDtcblx0XHR0aGlzLl9hdGxhc0dwdVRleHR1cmVWZXJzaW9uc1sxXSA9IDA7XG5cdFx0dGhpcy5fYXRsYXNHcHVUZXh0dXJlID0gdGhpcy5fcmVnaXN0ZXIoR1BVTGlmZWN5Y2xlLmNyZWF0ZVRleHR1cmUodGhpcy5fZGV2aWNlLCB7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyBhdGxhcyB0ZXh0dXJlJyxcblx0XHRcdGZvcm1hdDogJ3JnYmE4dW5vcm0nLFxuXHRcdFx0c2l6ZTogeyB3aWR0aDogYXRsYXMucGFnZVNpemUsIGhlaWdodDogYXRsYXMucGFnZVNpemUsIGRlcHRoT3JBcnJheUxheWVyczogVGV4dHVyZUF0bGFzLm1heGltdW1QYWdlQ291bnQgfSxcblx0XHRcdGRpbWVuc2lvbjogJzJkJyxcblx0XHRcdHVzYWdlOiBHUFVUZXh0dXJlVXNhZ2UuVEVYVFVSRV9CSU5ESU5HIHxcblx0XHRcdFx0R1BVVGV4dHVyZVVzYWdlLkNPUFlfRFNUIHxcblx0XHRcdFx0R1BVVGV4dHVyZVVzYWdlLlJFTkRFUl9BVFRBQ0hNRU5ULFxuXHRcdH0pKS5vYmplY3Q7XG5cblx0XHR0aGlzLl91cGRhdGVBdGxhc1N0b3JhZ2VCdWZmZXJBbmRUZXh0dXJlKCk7XG5cblx0XHQvLyAjZW5kcmVnaW9uIFN0b3JhZ2UgYnVmZmVyc1xuXG5cdFx0Ly8gI3JlZ2lvbiBWZXJ0ZXggYnVmZmVyXG5cblx0XHR0aGlzLl92ZXJ0ZXhCdWZmZXIgPSB0aGlzLl9yZWdpc3RlcihHUFVMaWZlY3ljbGUuY3JlYXRlQnVmZmVyKHRoaXMuX2RldmljZSwge1xuXHRcdFx0bGFiZWw6ICdNb25hY28gdmVydGV4IGJ1ZmZlcicsXG5cdFx0XHRzaXplOiBxdWFkVmVydGljZXMuYnl0ZUxlbmd0aCxcblx0XHRcdHVzYWdlOiBHUFVCdWZmZXJVc2FnZS5WRVJURVggfCBHUFVCdWZmZXJVc2FnZS5DT1BZX0RTVCxcblx0XHR9LCBxdWFkVmVydGljZXMpKS5vYmplY3Q7XG5cblx0XHQvLyAjZW5kcmVnaW9uIFZlcnRleCBidWZmZXJcblxuXHRcdC8vICNyZWdpb24gU2hhZGVyIG1vZHVsZVxuXG5cdFx0Y29uc3QgbW9kdWxlID0gdGhpcy5fZGV2aWNlLmNyZWF0ZVNoYWRlck1vZHVsZSh7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyBzaGFkZXIgbW9kdWxlJyxcblx0XHRcdGNvZGU6IHRoaXMuX3JlbmRlclN0cmF0ZWd5LnZhbHVlLndnc2wsXG5cdFx0fSk7XG5cblx0XHQvLyAjZW5kcmVnaW9uIFNoYWRlciBtb2R1bGVcblxuXHRcdC8vICNyZWdpb24gUGlwZWxpbmVcblxuXHRcdHRoaXMuX3BpcGVsaW5lID0gdGhpcy5fZGV2aWNlLmNyZWF0ZVJlbmRlclBpcGVsaW5lKHtcblx0XHRcdGxhYmVsOiAnTW9uYWNvIHJlbmRlciBwaXBlbGluZScsXG5cdFx0XHRsYXlvdXQ6ICdhdXRvJyxcblx0XHRcdHZlcnRleDoge1xuXHRcdFx0XHRtb2R1bGUsXG5cdFx0XHRcdGJ1ZmZlcnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRhcnJheVN0cmlkZTogMiAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCwgLy8gMiBmbG9hdHMsIDQgYnl0ZXMgZWFjaFxuXHRcdFx0XHRcdFx0YXR0cmlidXRlczogW1xuXHRcdFx0XHRcdFx0XHR7IHNoYWRlckxvY2F0aW9uOiAwLCBvZmZzZXQ6IDAsIGZvcm1hdDogJ2Zsb2F0MzJ4MicgfSwgIC8vIHBvc2l0aW9uXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdGZyYWdtZW50OiB7XG5cdFx0XHRcdG1vZHVsZSxcblx0XHRcdFx0dGFyZ2V0czogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvcm1hdDogcHJlc2VudGF0aW9uRm9ybWF0LFxuXHRcdFx0XHRcdFx0YmxlbmQ6IHtcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHtcblx0XHRcdFx0XHRcdFx0XHRzcmNGYWN0b3I6ICdzcmMtYWxwaGEnLFxuXHRcdFx0XHRcdFx0XHRcdGRzdEZhY3RvcjogJ29uZS1taW51cy1zcmMtYWxwaGEnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGFscGhhOiB7XG5cdFx0XHRcdFx0XHRcdFx0c3JjRmFjdG9yOiAnc3JjLWFscGhhJyxcblx0XHRcdFx0XHRcdFx0XHRkc3RGYWN0b3I6ICdvbmUtbWludXMtc3JjLWFscGhhJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gI2VuZHJlZ2lvbiBQaXBlbGluZVxuXG5cdFx0Ly8gI3JlZ2lvbiBCaW5kIGdyb3VwXG5cblx0XHR0aGlzLl9yZWJ1aWxkQmluZEdyb3VwID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fYmluZEdyb3VwID0gdGhpcy5fZGV2aWNlLmNyZWF0ZUJpbmRHcm91cCh7XG5cdFx0XHRcdGxhYmVsOiAnTW9uYWNvIGJpbmQgZ3JvdXAnLFxuXHRcdFx0XHRsYXlvdXQ6IHRoaXMuX3BpcGVsaW5lLmdldEJpbmRHcm91cExheW91dCgwKSxcblx0XHRcdFx0ZW50cmllczogW1xuXHRcdFx0XHRcdC8vIFRPRE86IFBhc3MgaW4gZ2VuZXJpY2FsbHkgYXMgYXJyYXk/XG5cdFx0XHRcdFx0eyBiaW5kaW5nOiBCaW5kaW5nSWQuR2x5cGhJbmZvLCByZXNvdXJjZTogeyBidWZmZXI6IHRoaXMuX2dseXBoU3RvcmFnZUJ1ZmZlciB9IH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0YmluZGluZzogQmluZGluZ0lkLlRleHR1cmVTYW1wbGVyLCByZXNvdXJjZTogdGhpcy5fZGV2aWNlLmNyZWF0ZVNhbXBsZXIoe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogJ01vbmFjbyBhdGxhcyBzYW1wbGVyJyxcblx0XHRcdFx0XHRcdFx0bWFnRmlsdGVyOiAnbmVhcmVzdCcsXG5cdFx0XHRcdFx0XHRcdG1pbkZpbHRlcjogJ25lYXJlc3QnLFxuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHsgYmluZGluZzogQmluZGluZ0lkLlRleHR1cmUsIHJlc291cmNlOiB0aGlzLl9hdGxhc0dwdVRleHR1cmUuY3JlYXRlVmlldygpIH0sXG5cdFx0XHRcdFx0eyBiaW5kaW5nOiBCaW5kaW5nSWQuTGF5b3V0SW5mb1VuaWZvcm0sIHJlc291cmNlOiB7IGJ1ZmZlcjogbGF5b3V0SW5mb1VuaWZvcm1CdWZmZXIgfSB9LFxuXHRcdFx0XHRcdHsgYmluZGluZzogQmluZGluZ0lkLkF0bGFzRGltZW5zaW9uc1VuaWZvcm0sIHJlc291cmNlOiB7IGJ1ZmZlcjogYXRsYXNJbmZvVW5pZm9ybUJ1ZmZlciB9IH0sXG5cdFx0XHRcdFx0Li4udGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWUhLmJpbmRHcm91cEVudHJpZXNcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0dGhpcy5fcmVidWlsZEJpbmRHcm91cCgpO1xuXG5cdFx0Ly8gZW5kcmVnaW9uIEJpbmQgZ3JvdXBcblxuXHRcdHRoaXMuX2luaXRpYWxpemVkID0gdHJ1ZTtcblxuXHRcdC8vIFJlbmRlciB0aGUgaW5pdGlhbCB2aWV3cG9ydCBpbW1lZGlhdGVseSBhZnRlciBpbml0aWFsaXphdGlvblxuXHRcdGlmICh0aGlzLl9pbml0Vmlld3BvcnREYXRhKSB7XG5cdFx0XHQvLyBIQUNLOiBSZW5kZXJpbmcgbXVsdGlwbGUgdGltZXMgaW4gdGhlIHNhbWUgZnJhbWUgbGlrZSB0aGlzIGlzbid0IGlkZWFsLCBidXQgdGhlcmVcblx0XHRcdC8vICAgICAgIGlzbid0IGFuIGVhc3kgd2F5IHRvIG1lcmdlIHZpZXdwb3J0IGRhdGFcblx0XHRcdGZvciAoY29uc3Qgdmlld3BvcnREYXRhIG9mIHRoaXMuX2luaXRWaWV3cG9ydERhdGEpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJUZXh0KHZpZXdwb3J0RGF0YSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pbml0Vmlld3BvcnREYXRhID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hSZW5kZXJTdHJhdGVneSh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSkge1xuXHRcdGlmICh0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZT8udHlwZSA9PT0gJ3ZpZXdwb3J0Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIgPCBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZExpbmVzICYmIHRoaXMuX3ZpZXdwb3J0TWF4Q29sdW1uKHZpZXdwb3J0RGF0YSkgPCBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgRmlsZSBpcyBsYXJnZXIgdGhhbiAke0Z1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkTGluZXN9IGxpbmVzIG9yICR7RnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zfSBjb2x1bW5zLCBzd2l0Y2hpbmcgdG8gdmlld3BvcnQgcmVuZGVyIHN0cmF0ZWd5YCk7XG5cdFx0Y29uc3Qgdmlld3BvcnRSZW5kZXJTdHJhdGVneSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3ksIHRoaXMuX2NvbnRleHQsIHRoaXMuX3ZpZXdHcHVDb250ZXh0LCB0aGlzLl9kZXZpY2UsIHRoaXMuX2dseXBoUmFzdGVyaXplciBhcyB7IHZhbHVlOiBHbHlwaFJhc3Rlcml6ZXIgfSk7XG5cdFx0dGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWUgPSB2aWV3cG9ydFJlbmRlclN0cmF0ZWd5O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kub25EaWRDaGFuZ2VCaW5kR3JvdXBFbnRyaWVzKCgpID0+IHRoaXMuX3JlYnVpbGRCaW5kR3JvdXA/LigpKSk7XG5cdFx0dGhpcy5fcmVidWlsZEJpbmRHcm91cD8uKCk7XG5cdH1cblxuXHRwcml2YXRlIF92aWV3cG9ydE1heENvbHVtbih2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IG51bWJlciB7XG5cdFx0bGV0IG1heENvbHVtbiA9IDA7XG5cdFx0bGV0IGxpbmVEYXRhOiBWaWV3TGluZVJlbmRlcmluZ0RhdGE7XG5cdFx0Zm9yIChsZXQgaSA9IHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXI7IGkgPD0gdmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXI7IGkrKykge1xuXHRcdFx0bGluZURhdGEgPSB2aWV3cG9ydERhdGEuZ2V0Vmlld0xpbmVSZW5kZXJpbmdEYXRhKGkpO1xuXHRcdFx0bWF4Q29sdW1uID0gTWF0aC5tYXgobWF4Q29sdW1uLCBsaW5lRGF0YS5tYXhDb2x1bW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF4Q29sdW1uO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQXRsYXNTdG9yYWdlQnVmZmVyQW5kVGV4dHVyZSgpIHtcblx0XHRmb3IgKGNvbnN0IFtsYXllckluZGV4LCBwYWdlXSBvZiBWaWV3R3B1Q29udGV4dC5hdGxhcy5wYWdlcy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmIChsYXllckluZGV4ID49IFRleHR1cmVBdGxhcy5tYXhpbXVtUGFnZUNvdW50KSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBBdHRlbXB0IHRvIHVwbG9hZCBhdGxhcyBwYWdlIFske2xheWVySW5kZXh9XSwgb25seSAke1RleHR1cmVBdGxhcy5tYXhpbXVtUGFnZUNvdW50fSBhcmUgc3VwcG9ydGVkIGN1cnJlbnRseWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2tpcCB0aGUgdXBkYXRlIGlmIGl0J3MgYWxyZWFkeSB0aGUgbGF0ZXN0IHZlcnNpb25cblx0XHRcdGlmIChwYWdlLnZlcnNpb24gPT09IHRoaXMuX2F0bGFzR3B1VGV4dHVyZVZlcnNpb25zW2xheWVySW5kZXhdKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdVcGRhdGluZyBhdGxhcyBwYWdlWycsIGxheWVySW5kZXgsICddIGZyb20gdmVyc2lvbiAnLCB0aGlzLl9hdGxhc0dwdVRleHR1cmVWZXJzaW9uc1tsYXllckluZGV4XSwgJyB0byB2ZXJzaW9uICcsIHBhZ2UudmVyc2lvbik7XG5cblx0XHRcdGNvbnN0IGVudHJ5Q291bnQgPSBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5ICogVGV4dHVyZUF0bGFzUGFnZS5tYXhpbXVtR2x5cGhDb3VudDtcblx0XHRcdGNvbnN0IHZhbHVlcyA9IG5ldyBGbG9hdDMyQXJyYXkoZW50cnlDb3VudCk7XG5cdFx0XHRsZXQgZW50cnlPZmZzZXQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBnbHlwaCBvZiBwYWdlLmdseXBocykge1xuXHRcdFx0XHR2YWx1ZXNbZW50cnlPZmZzZXQgKyBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLk9mZnNldF9UZXh0dXJlUG9zaXRpb25dID0gZ2x5cGgueDtcblx0XHRcdFx0dmFsdWVzW2VudHJ5T2Zmc2V0ICsgR2x5cGhTdG9yYWdlQnVmZmVySW5mby5PZmZzZXRfVGV4dHVyZVBvc2l0aW9uICsgMV0gPSBnbHlwaC55O1xuXHRcdFx0XHR2YWx1ZXNbZW50cnlPZmZzZXQgKyBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLk9mZnNldF9UZXh0dXJlU2l6ZV0gPSBnbHlwaC53O1xuXHRcdFx0XHR2YWx1ZXNbZW50cnlPZmZzZXQgKyBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLk9mZnNldF9UZXh0dXJlU2l6ZSArIDFdID0gZ2x5cGguaDtcblx0XHRcdFx0dmFsdWVzW2VudHJ5T2Zmc2V0ICsgR2x5cGhTdG9yYWdlQnVmZmVySW5mby5PZmZzZXRfT3JpZ2luUG9zaXRpb25dID0gZ2x5cGgub3JpZ2luT2Zmc2V0WDtcblx0XHRcdFx0dmFsdWVzW2VudHJ5T2Zmc2V0ICsgR2x5cGhTdG9yYWdlQnVmZmVySW5mby5PZmZzZXRfT3JpZ2luUG9zaXRpb24gKyAxXSA9IGdseXBoLm9yaWdpbk9mZnNldFk7XG5cdFx0XHRcdGVudHJ5T2Zmc2V0ICs9IEdseXBoU3RvcmFnZUJ1ZmZlckluZm8uRmxvYXRzUGVyRW50cnk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW50cnlPZmZzZXQgLyBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5ID4gVGV4dHVyZUF0bGFzUGFnZS5tYXhpbXVtR2x5cGhDb3VudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEF0dGVtcHRpbmcgdG8gd3JpdGUgbW9yZSBnbHlwaHMgKCR7ZW50cnlPZmZzZXQgLyBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5fSkgdGhhbiB0aGUgR1BVQnVmZmVyIGNhbiBob2xkICgke1RleHR1cmVBdGxhc1BhZ2UubWF4aW11bUdseXBoQ291bnR9KWApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGV2aWNlLnF1ZXVlLndyaXRlQnVmZmVyKFxuXHRcdFx0XHR0aGlzLl9nbHlwaFN0b3JhZ2VCdWZmZXIsXG5cdFx0XHRcdGxheWVySW5kZXggKiBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5ICogVGV4dHVyZUF0bGFzUGFnZS5tYXhpbXVtR2x5cGhDb3VudCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCxcblx0XHRcdFx0dmFsdWVzLFxuXHRcdFx0XHQwLFxuXHRcdFx0XHRHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5ICogVGV4dHVyZUF0bGFzUGFnZS5tYXhpbXVtR2x5cGhDb3VudFxuXHRcdFx0KTtcblx0XHRcdGlmIChwYWdlLnVzZWRBcmVhLnJpZ2h0IC0gcGFnZS51c2VkQXJlYS5sZWZ0ID4gMCAmJiBwYWdlLnVzZWRBcmVhLmJvdHRvbSAtIHBhZ2UudXNlZEFyZWEudG9wID4gMCkge1xuXHRcdFx0XHR0aGlzLl9kZXZpY2UucXVldWUuY29weUV4dGVybmFsSW1hZ2VUb1RleHR1cmUoXG5cdFx0XHRcdFx0eyBzb3VyY2U6IHBhZ2Uuc291cmNlIH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGV4dHVyZTogdGhpcy5fYXRsYXNHcHVUZXh0dXJlLFxuXHRcdFx0XHRcdFx0b3JpZ2luOiB7XG5cdFx0XHRcdFx0XHRcdHg6IHBhZ2UudXNlZEFyZWEubGVmdCxcblx0XHRcdFx0XHRcdFx0eTogcGFnZS51c2VkQXJlYS50b3AsXG5cdFx0XHRcdFx0XHRcdHo6IGxheWVySW5kZXhcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHdpZHRoOiBwYWdlLnVzZWRBcmVhLnJpZ2h0IC0gcGFnZS51c2VkQXJlYS5sZWZ0ICsgMSxcblx0XHRcdFx0XHRcdGhlaWdodDogcGFnZS51c2VkQXJlYS5ib3R0b20gLSBwYWdlLnVzZWRBcmVhLnRvcCArIDFcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYXRsYXNHcHVUZXh0dXJlVmVyc2lvbnNbbGF5ZXJJbmRleF0gPSBwYWdlLnZlcnNpb247XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHByZXBhcmVSZW5kZXIoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignU2hvdWxkIG5vdCBiZSBjYWxsZWQnKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSByZW5kZXIoY3R4OiBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1Nob3VsZCBub3QgYmUgY2FsbGVkJyk7XG5cdH1cblxuXHQvLyAjcmVnaW9uIEV2ZW50IGhhbmRsZXJzXG5cblx0Ly8gU2luY2UgVmlld0xpbmVzR3B1IGN1cnJlbnRseSBjb29yZGluYXRlcyByZW5kZXJpbmcgdG8gdGhlIGNhbnZhcywgaXQgbXVzdCBsaXN0ZW4gdG8gYWxsXG5cdC8vIGNoYW5nZWQgZXZlbnRzIHRoYXQgYW55IEdQVSBwYXJ0IGxpc3RlbnMgdG8uIFRoaXMgaXMgYmVjYXVzZSBhbnkgZHJhd2luZyB0byB0aGUgY2FudmFzIHdpbGxcblx0Ly8gY2xlYXIgaXQgZm9yIHRoYXQgZnJhbWUsIHNvIGFsbCBwYXJ0cyBtdXN0IGJlIHJlbmRlcmVkIGV2ZXJ5IHRpbWUuXG5cdC8vXG5cdC8vIEFkZGl0aW9uYWxseSwgc2luY2UgdGhpcyBpcyBpbnRyaW5zaWNhbGx5IGxpbmtlZCB0byBWaWV3TGluZXMsIGl0IG11c3QgYWxzbyBsaXN0ZW4gdG8gZXZlbnRzXG5cdC8vIGZyb20gdGhhdCBzaWRlLiBMdWNraWx5IHJlbmRlcmluZyBpcyBjaGVhcCwgaXQncyBvbmx5IHdoZW4gdXBsb2FkZWQgZGF0YSBjaGFuZ2VzIGRvZXMgaXRcblx0Ly8gc3RhcnQgdG8gY29zdC5cblxuXHRvdmVycmlkZSBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9yZWZyZXNoR2x5cGhSYXN0ZXJpemVyKCk7XG5cdFx0dGhpcy5fbWF4TGluZVdpZHRoID0gMDtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRvdmVycmlkZSBvbkN1cnNvclN0YXRlQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDdXJzb3JTdGF0ZUNoYW5nZWRFdmVudCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRvdmVycmlkZSBvbkRlY29yYXRpb25zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRvdmVycmlkZSBvbkZsdXNoZWQoZTogdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbWF4TGluZVdpZHRoID0gMDtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uTGluZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIG9uTGluZXNEZWxldGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbWF4TGluZVdpZHRoID0gMDtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRvdmVycmlkZSBvbkxpbmVzSW5zZXJ0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIG9uTGluZU1hcHBpbmdDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVNYXBwaW5nQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIG9uUmV2ZWFsUmFuZ2VSZXF1ZXN0KGU6IHZpZXdFdmVudHMuVmlld1JldmVhbFJhbmdlUmVxdWVzdEV2ZW50KTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIG9uU2Nyb2xsQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0b3ZlcnJpZGUgb25UaGVtZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3VGhlbWVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0b3ZlcnJpZGUgb25ab25lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Wm9uZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBfcmVmcmVzaEdseXBoUmFzdGVyaXplcigpIHtcblx0XHRjb25zdCBnbHlwaFJhc3Rlcml6ZXIgPSB0aGlzLl9nbHlwaFJhc3Rlcml6ZXIudmFsdWU7XG5cdFx0aWYgKCFnbHlwaFJhc3Rlcml6ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZm9udEZhbWlseSA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEZhbWlseSk7XG5cdFx0Y29uc3QgZm9udFNpemUgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRTaXplKTtcblx0XHRjb25zdCBkZXZpY2VQaXhlbFJhdGlvID0gdGhpcy5fdmlld0dwdUNvbnRleHQuZGV2aWNlUGl4ZWxSYXRpby5nZXQoKTtcblx0XHRpZiAoXG5cdFx0XHRnbHlwaFJhc3Rlcml6ZXIuZm9udEZhbWlseSAhPT0gZm9udEZhbWlseSB8fFxuXHRcdFx0Z2x5cGhSYXN0ZXJpemVyLmZvbnRTaXplICE9PSBmb250U2l6ZSB8fFxuXHRcdFx0Z2x5cGhSYXN0ZXJpemVyLmRldmljZVBpeGVsUmF0aW8gIT09IGRldmljZVBpeGVsUmF0aW9cblx0XHQpIHtcblx0XHRcdHRoaXMuX2dseXBoUmFzdGVyaXplci52YWx1ZSA9IG5ldyBHbHlwaFJhc3Rlcml6ZXIoZm9udFNpemUsIGZvbnRGYW1pbHksIGRldmljZVBpeGVsUmF0aW8sIFZpZXdHcHVDb250ZXh0LmRlY29yYXRpb25TdHlsZUNhY2hlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyVGV4dCh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pbml0aWFsaXplZCkge1xuXHRcdFx0dGhpcy5fcmVmcmVzaFJlbmRlclN0cmF0ZWd5KHZpZXdwb3J0RGF0YSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyVGV4dCh2aWV3cG9ydERhdGEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pbml0Vmlld3BvcnREYXRhID0gdGhpcy5faW5pdFZpZXdwb3J0RGF0YSA/PyBbXTtcblx0XHRcdHRoaXMuX2luaXRWaWV3cG9ydERhdGEucHVzaCh2aWV3cG9ydERhdGEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclRleHQodmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl92aWV3R3B1Q29udGV4dC5yZWN0YW5nbGVSZW5kZXJlci5kcmF3KHZpZXdwb3J0RGF0YSk7XG5cblx0XHRjb25zdCBvcHRpb25zID0gbmV3IFZpZXdMaW5lT3B0aW9ucyh0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24sIHRoaXMuX2NvbnRleHQudGhlbWUudHlwZSk7XG5cblx0XHR0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZSEudXBkYXRlKHZpZXdwb3J0RGF0YSwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLl91cGRhdGVBdGxhc1N0b3JhZ2VCdWZmZXJBbmRUZXh0dXJlKCk7XG5cblx0XHRjb25zdCBlbmNvZGVyID0gdGhpcy5fZGV2aWNlLmNyZWF0ZUNvbW1hbmRFbmNvZGVyKHsgbGFiZWw6ICdNb25hY28gY29tbWFuZCBlbmNvZGVyJyB9KTtcblxuXHRcdHRoaXMuX3JlbmRlclBhc3NDb2xvckF0dGFjaG1lbnQudmlldyA9IHRoaXMuX3ZpZXdHcHVDb250ZXh0LmN0eC5nZXRDdXJyZW50VGV4dHVyZSgpLmNyZWF0ZVZpZXcoeyBsYWJlbDogJ01vbmFjbyBjYW52YXMgdGV4dHVyZSB2aWV3JyB9KTtcblx0XHRjb25zdCBwYXNzID0gZW5jb2Rlci5iZWdpblJlbmRlclBhc3ModGhpcy5fcmVuZGVyUGFzc0Rlc2NyaXB0b3IpO1xuXHRcdHBhc3Muc2V0UGlwZWxpbmUodGhpcy5fcGlwZWxpbmUpO1xuXHRcdHBhc3Muc2V0VmVydGV4QnVmZmVyKDAsIHRoaXMuX3ZlcnRleEJ1ZmZlcik7XG5cblx0XHQvLyBPbmx5IGRyYXcgdGhlIGNvbnRlbnQgYXJlYVxuXHRcdGNvbnN0IGNvbnRlbnRMZWZ0ID0gTWF0aC5jZWlsKHRoaXMuX3ZpZXdHcHVDb250ZXh0LmNvbnRlbnRMZWZ0LmdldCgpICogdGhpcy5fdmlld0dwdUNvbnRleHQuZGV2aWNlUGl4ZWxSYXRpby5nZXQoKSk7XG5cdFx0cGFzcy5zZXRTY2lzc29yUmVjdChjb250ZW50TGVmdCwgMCwgdGhpcy5jYW52YXMud2lkdGggLSBjb250ZW50TGVmdCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcblxuXHRcdHBhc3Muc2V0QmluZEdyb3VwKDAsIHRoaXMuX2JpbmRHcm91cCk7XG5cblx0XHR0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZSEuZHJhdyhwYXNzLCB2aWV3cG9ydERhdGEpO1xuXG5cdFx0cGFzcy5lbmQoKTtcblxuXHRcdGNvbnN0IGNvbW1hbmRCdWZmZXIgPSBlbmNvZGVyLmZpbmlzaCgpO1xuXG5cdFx0dGhpcy5fZGV2aWNlLnF1ZXVlLnN1Ym1pdChbY29tbWFuZEJ1ZmZlcl0pO1xuXG5cdFx0dGhpcy5fbGFzdFZpZXdwb3J0RGF0YSA9IHZpZXdwb3J0RGF0YTtcblx0XHR0aGlzLl9sYXN0Vmlld0xpbmVPcHRpb25zID0gb3B0aW9ucztcblxuXHRcdC8vIFVwZGF0ZSBtYXggbGluZSB3aWR0aCBmb3IgaG9yaXpvbnRhbCBzY3JvbGxiYXJcblx0XHR0aGlzLl91cGRhdGVNYXhMaW5lV2lkdGgodmlld3BvcnREYXRhLCBvcHRpb25zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIG1heCBsaW5lIHdpZHRoIGJhc2VkIG9uIEdQVS1yZW5kZXJlZCBsaW5lcy5cblx0ICogVGhpcyBpcyBuZWVkZWQgYmVjYXVzZSBHUFUtcmVuZGVyZWQgbGluZXMgZG9uJ3QgaGF2ZSBET00gbm9kZXMgdG8gbWVhc3VyZS5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZU1heExpbmVXaWR0aCh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSwgdmlld0xpbmVPcHRpb25zOiBWaWV3TGluZU9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCBkcHIgPSBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvO1xuXHRcdGxldCBsb2NhbE1heExpbmVXaWR0aCA9IDA7XG5cblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSB2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhblJlbmRlcih2aWV3TGluZU9wdGlvbnMsIHZpZXdwb3J0RGF0YSwgbGluZU51bWJlcikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVEYXRhID0gdmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxpbmVXaWR0aCA9IHRoaXMuX2NvbXB1dGVMaW5lV2lkdGgobGluZURhdGEsIHZpZXdMaW5lT3B0aW9ucywgZHByKTtcblx0XHRcdGxvY2FsTWF4TGluZVdpZHRoID0gTWF0aC5tYXgobG9jYWxNYXhMaW5lV2lkdGgsIGxpbmVXaWR0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gT25seSB1cGRhdGUgaWYgd2UgZm91bmQgYSBsYXJnZXIgd2lkdGggKHVzZSBjZWlsIHRvIG1hdGNoIERPTSBiZWhhdmlvcilcblx0XHRjb25zdCBpTGluZVdpZHRoID0gTWF0aC5jZWlsKGxvY2FsTWF4TGluZVdpZHRoKTtcblx0XHRpZiAoaUxpbmVXaWR0aCA+IHRoaXMuX21heExpbmVXaWR0aCkge1xuXHRcdFx0dGhpcy5fbWF4TGluZVdpZHRoID0gaUxpbmVXaWR0aDtcblx0XHRcdHRoaXMuX2NvbnRleHQudmlld01vZGVsLnZpZXdMYXlvdXQuc2V0TWF4TGluZVdpZHRoKHRoaXMuX21heExpbmVXaWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGUgdGhlIHdpZHRoIG9mIGEgbGluZSBpbiBDU1MgcGl4ZWxzLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29tcHV0ZUxpbmVXaWR0aChsaW5lRGF0YTogVmlld0xpbmVSZW5kZXJpbmdEYXRhLCB2aWV3TGluZU9wdGlvbnM6IFZpZXdMaW5lT3B0aW9ucywgZHByOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBsaW5lRGF0YS5jb250ZW50O1xuXHRcdGxldCBjb250ZW50U2VnbWVudGVyOiBJQ29udGVudFNlZ21lbnRlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIShsaW5lRGF0YS5pc0Jhc2ljQVNDSUkgJiYgdmlld0xpbmVPcHRpb25zLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpKSB7XG5cdFx0XHRjb250ZW50U2VnbWVudGVyID0gY3JlYXRlQ29udGVudFNlZ21lbnRlcihsaW5lRGF0YSwgdmlld0xpbmVPcHRpb25zKTtcblx0XHR9XG5cblx0XHRsZXQgd2lkdGggPSAwO1xuXHRcdGxldCB0YWJYT2Zmc2V0ID0gMDtcblxuXHRcdGZvciAobGV0IHggPSAwOyB4IDwgY29udGVudC5sZW5ndGg7IHgrKykge1xuXHRcdFx0bGV0IGNoYXJzOiBzdHJpbmc7XG5cdFx0XHRpZiAobGluZURhdGEuaXNCYXNpY0FTQ0lJICYmIHZpZXdMaW5lT3B0aW9ucy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zKSB7XG5cdFx0XHRcdGNoYXJzID0gY29udGVudC5jaGFyQXQoeCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzZWdtZW50ID0gY29udGVudFNlZ21lbnRlciEuZ2V0U2VnbWVudEF0SW5kZXgoeCk7XG5cdFx0XHRcdGlmIChzZWdtZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjaGFycyA9IHNlZ21lbnQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFycyA9PT0gJ1xcdCcpIHtcblx0XHRcdFx0Y29uc3Qgb2Zmc2V0QmVmb3JlID0geCArIHRhYlhPZmZzZXQ7XG5cdFx0XHRcdHRhYlhPZmZzZXQgPSBDdXJzb3JDb2x1bW5zLm5leHRSZW5kZXJUYWJTdG9wKHggKyB0YWJYT2Zmc2V0LCBsaW5lRGF0YS50YWJTaXplKTtcblx0XHRcdFx0d2lkdGggKz0gdmlld0xpbmVPcHRpb25zLnNwYWNlV2lkdGggKiAodGFiWE9mZnNldCAtIG9mZnNldEJlZm9yZSk7XG5cdFx0XHRcdHRhYlhPZmZzZXQgLT0geCArIDE7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVEYXRhLmlzQmFzaWNBU0NJSSAmJiB2aWV3TGluZU9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucykge1xuXHRcdFx0XHR3aWR0aCArPSB2aWV3TGluZU9wdGlvbnMuc3BhY2VXaWR0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpZHRoICs9IHRoaXMuX3JlbmRlclN0cmF0ZWd5LnZhbHVlIS5nbHlwaFJhc3Rlcml6ZXIuZ2V0VGV4dE1ldHJpY3MoY2hhcnMpLndpZHRoIC8gZHByO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB3aWR0aDtcblx0fVxuXG5cdGxpbmVzVmlzaWJsZVJhbmdlc0ZvclJhbmdlKF9yYW5nZTogUmFuZ2UsIGluY2x1ZGVOZXdMaW5lczogYm9vbGVhbik6IExpbmVWaXNpYmxlUmFuZ2VzW10gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2xhc3RWaWV3cG9ydERhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBvcmlnaW5hbEVuZExpbmVOdW1iZXIgPSBfcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmludGVyc2VjdFJhbmdlcyhfcmFuZ2UsIHRoaXMuX2xhc3RWaWV3cG9ydERhdGEudmlzaWJsZVJhbmdlKTtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fbGFzdFZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgcmVuZEVuZExpbmVOdW1iZXIgPSB0aGlzLl9sYXN0Vmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXI7XG5cblx0XHRjb25zdCB2aWV3cG9ydERhdGEgPSB0aGlzLl9sYXN0Vmlld3BvcnREYXRhO1xuXHRcdGNvbnN0IHZpZXdMaW5lT3B0aW9ucyA9IHRoaXMuX2xhc3RWaWV3TGluZU9wdGlvbnM7XG5cblx0XHRpZiAoIXZpZXdwb3J0RGF0YSB8fCAhdmlld0xpbmVPcHRpb25zKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzOiBMaW5lVmlzaWJsZVJhbmdlc1tdID0gW107XG5cblx0XHRsZXQgbmV4dExpbmVNb2RlbExpbmVOdW1iZXI6IG51bWJlciA9IDA7XG5cdFx0aWYgKGluY2x1ZGVOZXdMaW5lcykge1xuXHRcdFx0bmV4dExpbmVNb2RlbExpbmVOdW1iZXIgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG5ldyBQb3NpdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpKS5saW5lTnVtYmVyO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cblx0XHRcdGlmIChsaW5lTnVtYmVyIDwgcmVuZFN0YXJ0TGluZU51bWJlciB8fCBsaW5lTnVtYmVyID4gcmVuZEVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IGxpbmVOdW1iZXIgPT09IHJhbmdlLnN0YXJ0TGluZU51bWJlciA/IHJhbmdlLnN0YXJ0Q29sdW1uIDogMTtcblx0XHRcdGNvbnN0IGNvbnRpbnVlc0luTmV4dExpbmUgPSBsaW5lTnVtYmVyICE9PSBvcmlnaW5hbEVuZExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBlbmRDb2x1bW4gPSBjb250aW51ZXNJbk5leHRMaW5lID8gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSA6IHJhbmdlLmVuZENvbHVtbjtcblxuXHRcdFx0Y29uc3QgdmlzaWJsZVJhbmdlc0ZvckxpbmUgPSB0aGlzLl92aXNpYmxlUmFuZ2VzRm9yTGluZVJhbmdlKGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4pO1xuXG5cdFx0XHRpZiAoIXZpc2libGVSYW5nZXNGb3JMaW5lKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5jbHVkZU5ld0xpbmVzICYmIGxpbmVOdW1iZXIgPCBvcmlnaW5hbEVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudExpbmVNb2RlbExpbmVOdW1iZXIgPSBuZXh0TGluZU1vZGVsTGluZU51bWJlcjtcblx0XHRcdFx0bmV4dExpbmVNb2RlbExpbmVOdW1iZXIgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyICsgMSwgMSkpLmxpbmVOdW1iZXI7XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRMaW5lTW9kZWxMaW5lTnVtYmVyICE9PSBuZXh0TGluZU1vZGVsTGluZU51bWJlcikge1xuXHRcdFx0XHRcdHZpc2libGVSYW5nZXNGb3JMaW5lLnJhbmdlc1t2aXNpYmxlUmFuZ2VzRm9yTGluZS5yYW5nZXMubGVuZ3RoIC0gMV0ud2lkdGggKz0gdmlld0xpbmVPcHRpb25zLnNwYWNlV2lkdGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dmlzaWJsZVJhbmdlcy5wdXNoKG5ldyBMaW5lVmlzaWJsZVJhbmdlcyh2aXNpYmxlUmFuZ2VzRm9yTGluZS5vdXRzaWRlUmVuZGVyZWRMaW5lLCBsaW5lTnVtYmVyLCBIb3Jpem9udGFsUmFuZ2UuZnJvbSh2aXNpYmxlUmFuZ2VzRm9yTGluZS5yYW5nZXMpLCBjb250aW51ZXNJbk5leHRMaW5lKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHZpc2libGVSYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmlzaWJsZVJhbmdlcztcblx0fVxuXG5cdHByaXZhdGUgX3Zpc2libGVSYW5nZXNGb3JMaW5lUmFuZ2UobGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlcik6IFZpc2libGVSYW5nZXMgfCBudWxsIHtcblx0XHRpZiAodGhpcy5zaG91bGRSZW5kZXIoKSkge1xuXHRcdFx0Ly8gQ2Fubm90IHJlYWQgZnJvbSB0aGUgRE9NIGJlY2F1c2UgaXQgaXMgZGlydHlcblx0XHRcdC8vIGkuZS4gdGhlIG1vZGVsICYgdGhlIGRvbSBhcmUgb3V0IG9mIHN5bmMsIHNvIEknZCBiZSByZWFkaW5nIHNvbWV0aGluZyBzdGFsZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld3BvcnREYXRhID0gdGhpcy5fbGFzdFZpZXdwb3J0RGF0YTtcblx0XHRjb25zdCB2aWV3TGluZU9wdGlvbnMgPSB0aGlzLl9sYXN0Vmlld0xpbmVPcHRpb25zO1xuXG5cdFx0aWYgKCF2aWV3cG9ydERhdGEgfHwgIXZpZXdMaW5lT3B0aW9ucyB8fCBsaW5lTnVtYmVyIDwgdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlciB8fCBsaW5lTnVtYmVyID4gdmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGFiIHdpZHRocyBmb3IgdGhpcyBsaW5lXG5cdFx0Y29uc3QgbGluZURhdGEgPSB2aWV3cG9ydERhdGEuZ2V0Vmlld0xpbmVSZW5kZXJpbmdEYXRhKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBsaW5lRGF0YS5jb250ZW50O1xuXG5cdFx0bGV0IGNvbnRlbnRTZWdtZW50ZXI6IElDb250ZW50U2VnbWVudGVyIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghKGxpbmVEYXRhLmlzQmFzaWNBU0NJSSAmJiB2aWV3TGluZU9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucykpIHtcblx0XHRcdGNvbnRlbnRTZWdtZW50ZXIgPSBjcmVhdGVDb250ZW50U2VnbWVudGVyKGxpbmVEYXRhLCB2aWV3TGluZU9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGxldCBjaGFyczogc3RyaW5nIHwgdW5kZWZpbmVkID0gJyc7XG5cblx0XHRsZXQgcmVzb2x2ZWRTdGFydENvbHVtbiA9IDA7XG5cdFx0bGV0IHJlc29sdmVkU3RhcnRDc3NQaXhlbE9mZnNldCA9IDA7XG5cdFx0Zm9yIChsZXQgeCA9IDA7IHggPCBzdGFydENvbHVtbiAtIDE7IHgrKykge1xuXHRcdFx0aWYgKGxpbmVEYXRhLmlzQmFzaWNBU0NJSSAmJiB2aWV3TGluZU9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucykge1xuXHRcdFx0XHRjaGFycyA9IGNvbnRlbnQuY2hhckF0KHgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2hhcnMgPSBjb250ZW50U2VnbWVudGVyIS5nZXRTZWdtZW50QXRJbmRleCh4KTtcblx0XHRcdFx0aWYgKGNoYXJzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlZFN0YXJ0Q3NzUGl4ZWxPZmZzZXQgKz0gKHRoaXMuX3JlbmRlclN0cmF0ZWd5LnZhbHVlIS5nbHlwaFJhc3Rlcml6ZXIuZ2V0VGV4dE1ldHJpY3MoY2hhcnMpLndpZHRoIC8gZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbykgLSB2aWV3TGluZU9wdGlvbnMuc3BhY2VXaWR0aDtcblx0XHRcdH1cblx0XHRcdGlmIChjaGFycyA9PT0gJ1xcdCcpIHtcblx0XHRcdFx0cmVzb2x2ZWRTdGFydENvbHVtbiA9IEN1cnNvckNvbHVtbnMubmV4dFJlbmRlclRhYlN0b3AocmVzb2x2ZWRTdGFydENvbHVtbiwgbGluZURhdGEudGFiU2l6ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNvbHZlZFN0YXJ0Q29sdW1uKys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCByZXNvbHZlZEVuZENvbHVtbiA9IHJlc29sdmVkU3RhcnRDb2x1bW47XG5cdFx0bGV0IHJlc29sdmVkRW5kQ3NzUGl4ZWxPZmZzZXQgPSAwO1xuXHRcdGZvciAobGV0IHggPSBzdGFydENvbHVtbiAtIDE7IHggPCBlbmRDb2x1bW4gLSAxOyB4KyspIHtcblx0XHRcdGlmIChsaW5lRGF0YS5pc0Jhc2ljQVNDSUkgJiYgdmlld0xpbmVPcHRpb25zLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpIHtcblx0XHRcdFx0Y2hhcnMgPSBjb250ZW50LmNoYXJBdCh4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNoYXJzID0gY29udGVudFNlZ21lbnRlciEuZ2V0U2VnbWVudEF0SW5kZXgoeCk7XG5cdFx0XHRcdGlmIChjaGFycyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZWRFbmRDc3NQaXhlbE9mZnNldCArPSAodGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWUhLmdseXBoUmFzdGVyaXplci5nZXRUZXh0TWV0cmljcyhjaGFycykud2lkdGggLyBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvKSAtIHZpZXdMaW5lT3B0aW9ucy5zcGFjZVdpZHRoO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoYXJzID09PSAnXFx0Jykge1xuXHRcdFx0XHRyZXNvbHZlZEVuZENvbHVtbiA9IEN1cnNvckNvbHVtbnMubmV4dFJlbmRlclRhYlN0b3AocmVzb2x2ZWRFbmRDb2x1bW4sIGxpbmVEYXRhLnRhYlNpemUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb2x2ZWRFbmRDb2x1bW4rKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBWaXNpYmxlIGhvcml6b250YWwgcmFuZ2UgaW4gX3NjYWxlZF8gcGl4ZWxzXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFZpc2libGVSYW5nZXMoZmFsc2UsIFtuZXcgRmxvYXRIb3Jpem9udGFsUmFuZ2UoXG5cdFx0XHRyZXNvbHZlZFN0YXJ0Q29sdW1uICogdmlld0xpbmVPcHRpb25zLnNwYWNlV2lkdGggKyByZXNvbHZlZFN0YXJ0Q3NzUGl4ZWxPZmZzZXQsXG5cdFx0XHQocmVzb2x2ZWRFbmRDb2x1bW4gLSByZXNvbHZlZFN0YXJ0Q29sdW1uKSAqIHZpZXdMaW5lT3B0aW9ucy5zcGFjZVdpZHRoICsgcmVzb2x2ZWRFbmRDc3NQaXhlbE9mZnNldClcblx0XHRdKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHR2aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBIb3Jpem9udGFsUG9zaXRpb24gfCBudWxsIHtcblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gdGhpcy5fdmlzaWJsZVJhbmdlc0ZvckxpbmVSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0aWYgKCF2aXNpYmxlUmFuZ2VzKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBIb3Jpem9udGFsUG9zaXRpb24odmlzaWJsZVJhbmdlcy5vdXRzaWRlUmVuZGVyZWRMaW5lLCB2aXNpYmxlUmFuZ2VzLnJhbmdlc1swXS5sZWZ0KTtcblx0fVxuXG5cdGdldExpbmVXaWR0aChsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fbGFzdFZpZXdwb3J0RGF0YSB8fCAhdGhpcy5fbGFzdFZpZXdMaW5lT3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl92aWV3R3B1Q29udGV4dC5jYW5SZW5kZXIodGhpcy5fbGFzdFZpZXdMaW5lT3B0aW9ucywgdGhpcy5fbGFzdFZpZXdwb3J0RGF0YSwgbGluZU51bWJlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZURhdGEgPSB0aGlzLl9sYXN0Vmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBsaW5lUmFuZ2UgPSB0aGlzLl92aXNpYmxlUmFuZ2VzRm9yTGluZVJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVEYXRhLm1heENvbHVtbik7XG5cdFx0Y29uc3QgbGFzdFJhbmdlID0gbGluZVJhbmdlPy5yYW5nZXMuYXQoLTEpO1xuXHRcdGlmIChsYXN0UmFuZ2UpIHtcblx0XHRcdC8vIFRvdGFsIGxpbmUgd2lkdGggaXMgdGhlIGxlZnQgb2Zmc2V0IHBsdXMgd2lkdGggb2YgdGhlIGxhc3QgcmFuZ2Vcblx0XHRcdHJldHVybiBsYXN0UmFuZ2UubGVmdCArIGxhc3RSYW5nZS53aWR0aDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0UG9zaXRpb25BdENvb3JkaW5hdGUobGluZU51bWJlcjogbnVtYmVyLCBtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0OiBudW1iZXIpOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9sYXN0Vmlld3BvcnREYXRhIHx8ICF0aGlzLl9sYXN0Vmlld0xpbmVPcHRpb25zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhblJlbmRlcih0aGlzLl9sYXN0Vmlld0xpbmVPcHRpb25zLCB0aGlzLl9sYXN0Vmlld3BvcnREYXRhLCBsaW5lTnVtYmVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbGluZURhdGEgPSB0aGlzLl9sYXN0Vmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBjb250ZW50ID0gbGluZURhdGEuY29udGVudDtcblx0XHRjb25zdCBkcHIgPSBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvO1xuXHRcdGNvbnN0IG1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXREZXZpY2VQaXhlbHMgPSBtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0ICogZHByO1xuXHRcdGNvbnN0IHNwYWNlV2lkdGhEZXZpY2VQaXhlbHMgPSB0aGlzLl9sYXN0Vmlld0xpbmVPcHRpb25zLnNwYWNlV2lkdGggKiBkcHI7XG5cdFx0Y29uc3QgY29udGVudFNlZ21lbnRlciA9IGNyZWF0ZUNvbnRlbnRTZWdtZW50ZXIobGluZURhdGEsIHRoaXMuX2xhc3RWaWV3TGluZU9wdGlvbnMpO1xuXG5cdFx0bGV0IHdpZHRoU29GYXIgPSAwO1xuXHRcdGxldCBjaGFyV2lkdGggPSAwO1xuXHRcdGxldCB0YWJYT2Zmc2V0ID0gMDtcblx0XHRsZXQgY29sdW1uID0gMDtcblx0XHRmb3IgKGxldCB4ID0gMDsgeCA8IGNvbnRlbnQubGVuZ3RoOyB4KyspIHtcblx0XHRcdGNvbnN0IGNoYXJzID0gY29udGVudFNlZ21lbnRlci5nZXRTZWdtZW50QXRJbmRleCh4KTtcblxuXHRcdFx0Ly8gUGFydCBvZiBhbiBlYXJsaWVyIHNlZ21lbnRcblx0XHRcdGlmIChjaGFycyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbHVtbisrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gR2V0IHRoZSB3aWR0aCBvZiB0aGUgY2hhcmFjdGVyXG5cdFx0XHRpZiAoY2hhcnMgPT09ICdcXHQnKSB7XG5cdFx0XHRcdC8vIEZpbmQgdGhlIHBpeGVsIG9mZnNldCBiZXR3ZWVuIHRoZSBjdXJyZW50IHBvc2l0aW9uIGFuZCB0aGUgbmV4dCB0YWIgc3RvcFxuXHRcdFx0XHRjb25zdCBvZmZzZXRCZWZvcmUgPSB4ICsgdGFiWE9mZnNldDtcblx0XHRcdFx0dGFiWE9mZnNldCA9IEN1cnNvckNvbHVtbnMubmV4dFJlbmRlclRhYlN0b3AoeCArIHRhYlhPZmZzZXQsIGxpbmVEYXRhLnRhYlNpemUpO1xuXHRcdFx0XHRjaGFyV2lkdGggPSBzcGFjZVdpZHRoRGV2aWNlUGl4ZWxzICogKHRhYlhPZmZzZXQgLSBvZmZzZXRCZWZvcmUpO1xuXHRcdFx0XHQvLyBDb252ZXJ0IGJhY2sgdG8gb2Zmc2V0IGV4Y2x1ZGluZyB4IGFuZCB0aGUgY3VycmVudCBjaGFyYWN0ZXJcblx0XHRcdFx0dGFiWE9mZnNldCAtPSB4ICsgMTtcblx0XHRcdH0gZWxzZSBpZiAobGluZURhdGEuaXNCYXNpY0FTQ0lJICYmIHRoaXMuX2xhc3RWaWV3TGluZU9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucykge1xuXHRcdFx0XHRjaGFyV2lkdGggPSBzcGFjZVdpZHRoRGV2aWNlUGl4ZWxzO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2hhcldpZHRoID0gdGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWUhLmdseXBoUmFzdGVyaXplci5nZXRUZXh0TWV0cmljcyhjaGFycykud2lkdGg7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0RGV2aWNlUGl4ZWxzIDwgd2lkdGhTb0ZhciArIGNoYXJXaWR0aCAvIDIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHdpZHRoU29GYXIgKz0gY2hhcldpZHRoO1xuXHRcdFx0Y29sdW1uKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4gKyAxKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFNBQVMsbUJBQW1CO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUd0QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUEwQztBQUNuRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQixvQkFBb0IsaUJBQTZCLG1CQUFpRSxxQkFBcUI7QUFDdEssU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw4QkFBc0Q7QUFDL0QsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyx1QkFBdUI7QUFFaEMsSUFBVyx5QkFBWCxrQkFBV0EsNEJBQVg7QUFDQyxFQUFBQSxnREFBQSxvQkFBaUIsS0FBakI7QUFDQSxFQUFBQSxnREFBQSxtQkFBZ0IsTUFBaEI7QUFDQSxFQUFBQSxnREFBQSw0QkFBeUIsS0FBekI7QUFDQSxFQUFBQSxnREFBQSx3QkFBcUIsS0FBckI7QUFDQSxFQUFBQSxnREFBQSwyQkFBd0IsS0FBeEI7QUFMVSxTQUFBQTtBQUFBLEdBQUE7QUFXSixJQUFNLGVBQU4sY0FBMkIsU0FBK0I7QUFBQSxFQWdDaEUsWUFDQyxT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
