import { getActiveWindow } from "../../../../base/browser/dom.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { NKeyMap } from "../../../../base/common/map.js";
import { ensureNonNullable } from "../gpuUtils.js";
import { UsagePreviewColors } from "./atlas.js";
class TextureAtlasSlabAllocator {
  constructor(_canvas, _textureIndex, options) {
    this._canvas = _canvas;
    this._textureIndex = _textureIndex;
    this._slabs = [];
    this._activeSlabsByDims = new NKeyMap();
    this._unusedRects = [];
    this._openRegionsByHeight = /* @__PURE__ */ new Map();
    this._openRegionsByWidth = /* @__PURE__ */ new Map();
    /** A set of all glyphs allocated, this is only tracked to enable debug related functionality */
    this._allocatedGlyphs = /* @__PURE__ */ new Set();
    this._nextIndex = 0;
    this._ctx = ensureNonNullable(this._canvas.getContext("2d", {
      willReadFrequently: true
    }));
    this._slabW = Math.min(
      options?.slabW ?? 64 << Math.max(Math.floor(getActiveWindow().devicePixelRatio) - 1, 0),
      this._canvas.width
    );
    this._slabH = Math.min(
      options?.slabH ?? this._slabW,
      this._canvas.height
    );
    this._slabsPerRow = Math.floor(this._canvas.width / this._slabW);
    this._slabsPerColumn = Math.floor(this._canvas.height / this._slabH);
  }
  allocate(rasterizedGlyph) {
    const glyphWidth = rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1;
    const glyphHeight = rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1;
    if (glyphWidth > this._canvas.width || glyphHeight > this._canvas.height) {
      throw new BugIndicatingError("Glyph is too large for the atlas page");
    }
    if (glyphWidth > this._slabW || glyphHeight > this._slabH) {
      if (this._allocatedGlyphs.size > 0) {
        return void 0;
      }
      let sizeCandidate = this._canvas.width;
      while (glyphWidth < sizeCandidate / 2 && glyphHeight < sizeCandidate / 2) {
        sizeCandidate /= 2;
      }
      this._slabW = sizeCandidate;
      this._slabH = sizeCandidate;
      this._slabsPerRow = Math.floor(this._canvas.width / this._slabW);
      this._slabsPerColumn = Math.floor(this._canvas.height / this._slabH);
    }
    const desiredSlabSize = {
      // Nearest square number
      // TODO: This can probably be optimized
      // w: 1 << Math.ceil(Math.sqrt(glyphWidth)),
      // h: 1 << Math.ceil(Math.sqrt(glyphHeight)),
      // Nearest x px
      // w: Math.ceil(glyphWidth / nearestXPixels) * nearestXPixels,
      // h: Math.ceil(glyphHeight / nearestXPixels) * nearestXPixels,
      // Round odd numbers up
      // w: glyphWidth % 0 === 1 ? glyphWidth + 1 : glyphWidth,
      // h: glyphHeight % 0 === 1 ? glyphHeight + 1 : glyphHeight,
      // Exact number only
      w: glyphWidth,
      h: glyphHeight
    };
    let slab = this._activeSlabsByDims.get(desiredSlabSize.w, desiredSlabSize.h);
    if (slab) {
      const glyphsPerSlab = Math.floor(this._slabW / slab.entryW) * Math.floor(this._slabH / slab.entryH);
      if (slab.count >= glyphsPerSlab) {
        slab = void 0;
      }
    }
    let dx;
    let dy;
    if (!slab) {
      if (glyphWidth < glyphHeight) {
        const openRegions = this._openRegionsByWidth.get(glyphWidth);
        if (openRegions?.length) {
          for (let i = openRegions.length - 1; i >= 0; i--) {
            const r = openRegions[i];
            if (r.w >= glyphWidth && r.h >= glyphHeight) {
              dx = r.x;
              dy = r.y;
              if (glyphWidth < r.w) {
                this._unusedRects.push({
                  x: r.x + glyphWidth,
                  y: r.y,
                  w: r.w - glyphWidth,
                  h: glyphHeight
                });
              }
              r.y += glyphHeight;
              r.h -= glyphHeight;
              if (r.h === 0) {
                if (i === openRegions.length - 1) {
                  openRegions.pop();
                } else {
                  this._unusedRects.splice(i, 1);
                }
              }
              break;
            }
          }
        }
      } else {
        const openRegions = this._openRegionsByHeight.get(glyphHeight);
        if (openRegions?.length) {
          for (let i = openRegions.length - 1; i >= 0; i--) {
            const r = openRegions[i];
            if (r.w >= glyphWidth && r.h >= glyphHeight) {
              dx = r.x;
              dy = r.y;
              if (glyphHeight < r.h) {
                this._unusedRects.push({
                  x: r.x,
                  y: r.y + glyphHeight,
                  w: glyphWidth,
                  h: r.h - glyphHeight
                });
              }
              r.x += glyphWidth;
              r.w -= glyphWidth;
              if (r.h === 0) {
                if (i === openRegions.length - 1) {
                  openRegions.pop();
                } else {
                  this._unusedRects.splice(i, 1);
                }
              }
              break;
            }
          }
        }
      }
    }
    if (dx === void 0 || dy === void 0) {
      if (!slab) {
        if (this._slabs.length >= this._slabsPerRow * this._slabsPerColumn) {
          return void 0;
        }
        slab = {
          x: Math.floor(this._slabs.length % this._slabsPerRow) * this._slabW,
          y: Math.floor(this._slabs.length / this._slabsPerRow) * this._slabH,
          entryW: desiredSlabSize.w,
          entryH: desiredSlabSize.h,
          count: 0
        };
        const unusedW = this._slabW % slab.entryW;
        const unusedH = this._slabH % slab.entryH;
        if (unusedW) {
          addEntryToMapArray(this._openRegionsByWidth, unusedW, {
            x: slab.x + this._slabW - unusedW,
            w: unusedW,
            y: slab.y,
            h: this._slabH - (unusedH ?? 0)
          });
        }
        if (unusedH) {
          addEntryToMapArray(this._openRegionsByHeight, unusedH, {
            x: slab.x,
            w: this._slabW,
            y: slab.y + this._slabH - unusedH,
            h: unusedH
          });
        }
        this._slabs.push(slab);
        this._activeSlabsByDims.set(slab, desiredSlabSize.w, desiredSlabSize.h);
      }
      const glyphsPerRow = Math.floor(this._slabW / slab.entryW);
      dx = slab.x + Math.floor(slab.count % glyphsPerRow) * slab.entryW;
      dy = slab.y + Math.floor(slab.count / glyphsPerRow) * slab.entryH;
      slab.count++;
    }
    this._ctx.drawImage(
      rasterizedGlyph.source,
      // source
      rasterizedGlyph.boundingBox.left,
      rasterizedGlyph.boundingBox.top,
      glyphWidth,
      glyphHeight,
      // destination
      dx,
      dy,
      glyphWidth,
      glyphHeight
    );
    const glyph = {
      pageIndex: this._textureIndex,
      glyphIndex: this._nextIndex++,
      x: dx,
      y: dy,
      w: glyphWidth,
      h: glyphHeight,
      originOffsetX: rasterizedGlyph.originOffset.x,
      originOffsetY: rasterizedGlyph.originOffset.y,
      fontBoundingBoxAscent: rasterizedGlyph.fontBoundingBoxAscent,
      fontBoundingBoxDescent: rasterizedGlyph.fontBoundingBoxDescent
    };
    this._allocatedGlyphs.add(glyph);
    return glyph;
  }
  getUsagePreview() {
    const w = this._canvas.width;
    const h = this._canvas.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = ensureNonNullable(canvas.getContext("2d"));
    ctx.fillStyle = UsagePreviewColors.Unused;
    ctx.fillRect(0, 0, w, h);
    let slabEntryPixels = 0;
    let usedPixels = 0;
    let slabEdgePixels = 0;
    let restrictedPixels = 0;
    const slabW = 64 << Math.floor(getActiveWindow().devicePixelRatio) - 1;
    const slabH = slabW;
    for (const slab of this._slabs) {
      let x = 0;
      let y = 0;
      for (let i = 0; i < slab.count; i++) {
        if (x + slab.entryW > slabW) {
          x = 0;
          y += slab.entryH;
        }
        ctx.fillStyle = UsagePreviewColors.Wasted;
        ctx.fillRect(slab.x + x, slab.y + y, slab.entryW, slab.entryH);
        slabEntryPixels += slab.entryW * slab.entryH;
        x += slab.entryW;
      }
      const entriesPerRow = Math.floor(slabW / slab.entryW);
      const entriesPerCol = Math.floor(slabH / slab.entryH);
      const thisSlabPixels = slab.entryW * entriesPerRow * slab.entryH * entriesPerCol;
      slabEdgePixels += slabW * slabH - thisSlabPixels;
    }
    for (const g of this._allocatedGlyphs) {
      usedPixels += g.w * g.h;
      ctx.fillStyle = UsagePreviewColors.Used;
      ctx.fillRect(g.x, g.y, g.w, g.h);
    }
    const unusedRegions = Array.from(this._openRegionsByWidth.values()).flat().concat(Array.from(this._openRegionsByHeight.values()).flat());
    for (const r of unusedRegions) {
      ctx.fillStyle = UsagePreviewColors.Restricted;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      restrictedPixels += r.w * r.h;
    }
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this._canvas, 0, 0);
    ctx.globalAlpha = 1;
    return canvas.convertToBlob();
  }
  getStats() {
    const w = this._canvas.width;
    const h = this._canvas.height;
    let slabEntryPixels = 0;
    let usedPixels = 0;
    let slabEdgePixels = 0;
    let wastedPixels = 0;
    let restrictedPixels = 0;
    const totalPixels = w * h;
    const slabW = 64 << Math.floor(getActiveWindow().devicePixelRatio) - 1;
    const slabH = slabW;
    for (const slab of this._slabs) {
      let x = 0;
      let y = 0;
      for (let i = 0; i < slab.count; i++) {
        if (x + slab.entryW > slabW) {
          x = 0;
          y += slab.entryH;
        }
        slabEntryPixels += slab.entryW * slab.entryH;
        x += slab.entryW;
      }
      const entriesPerRow = Math.floor(slabW / slab.entryW);
      const entriesPerCol = Math.floor(slabH / slab.entryH);
      const thisSlabPixels = slab.entryW * entriesPerRow * slab.entryH * entriesPerCol;
      slabEdgePixels += slabW * slabH - thisSlabPixels;
    }
    for (const g of this._allocatedGlyphs) {
      usedPixels += g.w * g.h;
    }
    const unusedRegions = Array.from(this._openRegionsByWidth.values()).flat().concat(Array.from(this._openRegionsByHeight.values()).flat());
    for (const r of unusedRegions) {
      restrictedPixels += r.w * r.h;
    }
    const edgeUsedPixels = slabEdgePixels - restrictedPixels;
    wastedPixels = slabEntryPixels - (usedPixels - edgeUsedPixels);
    const efficiency = usedPixels / (usedPixels + wastedPixels + restrictedPixels);
    return [
      `page[${this._textureIndex}]:`,
      `     Total: ${totalPixels}px (${w}x${h})`,
      `      Used: ${usedPixels}px (${(usedPixels / totalPixels * 100).toFixed(2)}%)`,
      `    Wasted: ${wastedPixels}px (${(wastedPixels / totalPixels * 100).toFixed(2)}%)`,
      `Restricted: ${restrictedPixels}px (${(restrictedPixels / totalPixels * 100).toFixed(2)}%) (hard to allocate)`,
      `Efficiency: ${efficiency === 1 ? "100" : (efficiency * 100).toFixed(2)}%`,
      `     Slabs: ${this._slabs.length} of ${Math.floor(this._canvas.width / slabW) * Math.floor(this._canvas.height / slabH)}`
    ].join("\n");
  }
}
function addEntryToMapArray(map, key, entry) {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  list.push(entry);
}
export {
  TextureAtlasSlabAllocator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGdwdVxcYXRsYXNcXHRleHR1cmVBdGxhc1NsYWJBbGxvY2F0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBOS2V5TWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vbk51bGxhYmxlIH0gZnJvbSAnLi4vZ3B1VXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJUmFzdGVyaXplZEdseXBoIH0gZnJvbSAnLi4vcmFzdGVyL3Jhc3Rlci5qcyc7XG5pbXBvcnQgeyBVc2FnZVByZXZpZXdDb2xvcnMsIHR5cGUgSVRleHR1cmVBdGxhc0FsbG9jYXRvciwgdHlwZSBJVGV4dHVyZUF0bGFzUGFnZUdseXBoIH0gZnJvbSAnLi9hdGxhcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGV4dHVyZUF0bGFzU2xhYkFsbG9jYXRvck9wdGlvbnMge1xuXHRzbGFiVz86IG51bWJlcjtcblx0c2xhYkg/OiBudW1iZXI7XG59XG5cbi8qKlxuICogVGhlIHNsYWIgYWxsb2NhdG9yIGlzIGEgbW9yZSBjb21wbGV4IGFsbG9jYXRvciB0aGF0IHBsYWNlcyBnbHlwaHMgaW4gc3F1YXJlIHNsYWJzIG9mIGEgZml4ZWRcbiAqIHNpemUuIFNsYWJzIGFyZSBkZWZpbmVkIGJ5IGEgc21hbGwgcmFuZ2Ugb2YgZ2x5cGhzIHNpemVzIHRoZXkgY2FuIGhvdXNlLCB0aGlzIHBsYWNlcyBsaWtlLXNpemVkXG4gKiBnbHlwaHMgaW4gdGhlIHNhbWUgc2xhYiB3aGljaCByZWR1Y2VzIHdhc3RlZCBzcGFjZS5cbiAqXG4gKiBTbGFicyBhbHNvIG1heSBjb250YWluIFwidW51c2VkXCIgcmVnaW9ucyBvbiB0aGUgbGVmdCBhbmQgYm90dG9tIGRlcGVuZGluZyBvbiB0aGUgc2l6ZSBvZiB0aGVcbiAqIGdseXBocyB0aGV5IGluY2x1ZGUuIFRoaXMgc3BhY2UgaXMgdXNlZCB0byBwbGFjZSB2ZXJ5IHRoaW4gb3Igc2hvcnQgZ2x5cGhzLCB3aGljaCB3b3VsZCBvdGhlcndpc2VcbiAqIHdhc3RlIGEgbG90IG9mIHNwYWNlIGluIHRoZWlyIG93biBzbGFiLlxuICovXG5leHBvcnQgY2xhc3MgVGV4dHVyZUF0bGFzU2xhYkFsbG9jYXRvciBpbXBsZW1lbnRzIElUZXh0dXJlQXRsYXNBbGxvY2F0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eDogT2Zmc2NyZWVuQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsYWJzOiBJVGV4dHVyZUF0bGFzU2xhYltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVNsYWJzQnlEaW1zOiBOS2V5TWFwPElUZXh0dXJlQXRsYXNTbGFiLCBbbnVtYmVyLCBudW1iZXJdPiA9IG5ldyBOS2V5TWFwKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdW51c2VkUmVjdHM6IElUZXh0dXJlQXRsYXNTbGFiVW51c2VkUmVjdFtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3BlblJlZ2lvbnNCeUhlaWdodDogTWFwPG51bWJlciwgSVRleHR1cmVBdGxhc1NsYWJVbnVzZWRSZWN0W10+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcGVuUmVnaW9uc0J5V2lkdGg6IE1hcDxudW1iZXIsIElUZXh0dXJlQXRsYXNTbGFiVW51c2VkUmVjdFtdPiA9IG5ldyBNYXAoKTtcblxuXHQvKiogQSBzZXQgb2YgYWxsIGdseXBocyBhbGxvY2F0ZWQsIHRoaXMgaXMgb25seSB0cmFja2VkIHRvIGVuYWJsZSBkZWJ1ZyByZWxhdGVkIGZ1bmN0aW9uYWxpdHkgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWxsb2NhdGVkR2x5cGhzOiBTZXQ8UmVhZG9ubHk8SVRleHR1cmVBdGxhc1BhZ2VHbHlwaD4+ID0gbmV3IFNldCgpO1xuXG5cdHByaXZhdGUgX3NsYWJXOiBudW1iZXI7XG5cdHByaXZhdGUgX3NsYWJIOiBudW1iZXI7XG5cdHByaXZhdGUgX3NsYWJzUGVyUm93OiBudW1iZXI7XG5cdHByaXZhdGUgX3NsYWJzUGVyQ29sdW1uOiBudW1iZXI7XG5cdHByaXZhdGUgX25leHRJbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2FudmFzOiBPZmZzY3JlZW5DYW52YXMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGV4dHVyZUluZGV4OiBudW1iZXIsXG5cdFx0b3B0aW9ucz86IFRleHR1cmVBdGxhc1NsYWJBbGxvY2F0b3JPcHRpb25zXG5cdCkge1xuXHRcdHRoaXMuX2N0eCA9IGVuc3VyZU5vbk51bGxhYmxlKHRoaXMuX2NhbnZhcy5nZXRDb250ZXh0KCcyZCcsIHtcblx0XHRcdHdpbGxSZWFkRnJlcXVlbnRseTogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3NsYWJXID0gTWF0aC5taW4oXG5cdFx0XHRvcHRpb25zPy5zbGFiVyA/PyAoNjQgPDwgTWF0aC5tYXgoTWF0aC5mbG9vcihnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvKSAtIDEsIDApKSxcblx0XHRcdHRoaXMuX2NhbnZhcy53aWR0aFxuXHRcdCk7XG5cdFx0dGhpcy5fc2xhYkggPSBNYXRoLm1pbihcblx0XHRcdG9wdGlvbnM/LnNsYWJIID8/IHRoaXMuX3NsYWJXLFxuXHRcdFx0dGhpcy5fY2FudmFzLmhlaWdodFxuXHRcdCk7XG5cdFx0dGhpcy5fc2xhYnNQZXJSb3cgPSBNYXRoLmZsb29yKHRoaXMuX2NhbnZhcy53aWR0aCAvIHRoaXMuX3NsYWJXKTtcblx0XHR0aGlzLl9zbGFic1BlckNvbHVtbiA9IE1hdGguZmxvb3IodGhpcy5fY2FudmFzLmhlaWdodCAvIHRoaXMuX3NsYWJIKTtcblx0fVxuXG5cdHB1YmxpYyBhbGxvY2F0ZShyYXN0ZXJpemVkR2x5cGg6IElSYXN0ZXJpemVkR2x5cGgpOiBJVGV4dHVyZUF0bGFzUGFnZUdseXBoIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBGaW5kIGlkZWFsIHNsYWIsIGNyZWF0aW5nIGl0IGlmIHRoZXJlIGlzIG5vbmUgc3VpdGFibGVcblx0XHRjb25zdCBnbHlwaFdpZHRoID0gcmFzdGVyaXplZEdseXBoLmJvdW5kaW5nQm94LnJpZ2h0IC0gcmFzdGVyaXplZEdseXBoLmJvdW5kaW5nQm94LmxlZnQgKyAxO1xuXHRcdGNvbnN0IGdseXBoSGVpZ2h0ID0gcmFzdGVyaXplZEdseXBoLmJvdW5kaW5nQm94LmJvdHRvbSAtIHJhc3Rlcml6ZWRHbHlwaC5ib3VuZGluZ0JveC50b3AgKyAxO1xuXG5cdFx0Ly8gVGhlIGdseXBoIGRvZXMgbm90IGZpdCBpbnRvIHRoZSBhdGxhcyBwYWdlLCBnbHlwaHMgc2hvdWxkIG5ldmVyIGJlIHRoaXMgbGFyZ2UgaW4gcHJhY3RpY2Vcblx0XHRpZiAoZ2x5cGhXaWR0aCA+IHRoaXMuX2NhbnZhcy53aWR0aCB8fCBnbHlwaEhlaWdodCA+IHRoaXMuX2NhbnZhcy5oZWlnaHQpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0dseXBoIGlzIHRvbyBsYXJnZSBmb3IgdGhlIGF0bGFzIHBhZ2UnKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgZ2x5cGggZG9lcyBub3QgZml0IGludG8gYSBzbGFiXG5cdFx0aWYgKGdseXBoV2lkdGggPiB0aGlzLl9zbGFiVyB8fCBnbHlwaEhlaWdodCA+IHRoaXMuX3NsYWJIKSB7XG5cdFx0XHQvLyBPbmx5IGlmIHRoaXMgaXMgdGhlIGFsbG9jYXRvcidzIGZpcnN0IGdseXBoLCByZXNpemUgdGhlIHNsYWIgc2l6ZSB0byBmaXQgdGhlIGdseXBoLlxuXHRcdFx0aWYgKHRoaXMuX2FsbG9jYXRlZEdseXBocy5zaXplID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRmluZCB0aGUgbGFyZ2VzdCBwb3dlciBvZiAyIGRldmlzb3IgdGhhdCB0aGUgZ2x5cGggZml0cyBpbnRvLCB0aGlzIGVuc3VyZSB0aGVyZSBpcyBub1xuXHRcdFx0Ly8gd2FzdGVkIHNwYWNlIG91dHNpZGUgdGhlIGFsbG9jYXRlZCBzbGFicy5cblx0XHRcdGxldCBzaXplQ2FuZGlkYXRlID0gdGhpcy5fY2FudmFzLndpZHRoO1xuXHRcdFx0d2hpbGUgKGdseXBoV2lkdGggPCBzaXplQ2FuZGlkYXRlIC8gMiAmJiBnbHlwaEhlaWdodCA8IHNpemVDYW5kaWRhdGUgLyAyKSB7XG5cdFx0XHRcdHNpemVDYW5kaWRhdGUgLz0gMjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NsYWJXID0gc2l6ZUNhbmRpZGF0ZTtcblx0XHRcdHRoaXMuX3NsYWJIID0gc2l6ZUNhbmRpZGF0ZTtcblx0XHRcdHRoaXMuX3NsYWJzUGVyUm93ID0gTWF0aC5mbG9vcih0aGlzLl9jYW52YXMud2lkdGggLyB0aGlzLl9zbGFiVyk7XG5cdFx0XHR0aGlzLl9zbGFic1BlckNvbHVtbiA9IE1hdGguZmxvb3IodGhpcy5fY2FudmFzLmhlaWdodCAvIHRoaXMuX3NsYWJIKTtcblx0XHR9XG5cblx0XHQvLyBjb25zdCBkcHIgPSBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvO1xuXG5cdFx0Ly8gVE9ETzogSW5jbHVkZSBmb250IHNpemUgYXMgd2VsbCBhcyBEUFIgaW4gbmVhcmVzdFhQaXhlbHMgY2FsY3VsYXRpb25cblxuXHRcdC8vIFJvdW5kIHNsYWIgZ2x5cGggZGltZW5zaW9ucyB0byB0aGUgbmVhcmVzdCB4IHBpeGVscywgd2hlcmUgeCBzY2FsZWQgd2l0aCBkZXZpY2UgcGl4ZWwgcmF0aW9cblx0XHQvLyBjb25zdCBuZWFyZXN0WFBpeGVscyA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoZHByIC8gMC41KSk7XG5cdFx0Ly8gY29uc3QgbmVhcmVzdFhQaXhlbHMgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKGRwcikpO1xuXHRcdGNvbnN0IGRlc2lyZWRTbGFiU2l6ZSA9IHtcblx0XHRcdC8vIE5lYXJlc3Qgc3F1YXJlIG51bWJlclxuXHRcdFx0Ly8gVE9ETzogVGhpcyBjYW4gcHJvYmFibHkgYmUgb3B0aW1pemVkXG5cdFx0XHQvLyB3OiAxIDw8IE1hdGguY2VpbChNYXRoLnNxcnQoZ2x5cGhXaWR0aCkpLFxuXHRcdFx0Ly8gaDogMSA8PCBNYXRoLmNlaWwoTWF0aC5zcXJ0KGdseXBoSGVpZ2h0KSksXG5cblx0XHRcdC8vIE5lYXJlc3QgeCBweFxuXHRcdFx0Ly8gdzogTWF0aC5jZWlsKGdseXBoV2lkdGggLyBuZWFyZXN0WFBpeGVscykgKiBuZWFyZXN0WFBpeGVscyxcblx0XHRcdC8vIGg6IE1hdGguY2VpbChnbHlwaEhlaWdodCAvIG5lYXJlc3RYUGl4ZWxzKSAqIG5lYXJlc3RYUGl4ZWxzLFxuXG5cdFx0XHQvLyBSb3VuZCBvZGQgbnVtYmVycyB1cFxuXHRcdFx0Ly8gdzogZ2x5cGhXaWR0aCAlIDAgPT09IDEgPyBnbHlwaFdpZHRoICsgMSA6IGdseXBoV2lkdGgsXG5cdFx0XHQvLyBoOiBnbHlwaEhlaWdodCAlIDAgPT09IDEgPyBnbHlwaEhlaWdodCArIDEgOiBnbHlwaEhlaWdodCxcblxuXHRcdFx0Ly8gRXhhY3QgbnVtYmVyIG9ubHlcblx0XHRcdHc6IGdseXBoV2lkdGgsXG5cdFx0XHRoOiBnbHlwaEhlaWdodCxcblx0XHR9O1xuXG5cdFx0Ly8gR2V0IGFueSBleGlzdGluZyBzbGFiXG5cdFx0bGV0IHNsYWIgPSB0aGlzLl9hY3RpdmVTbGFic0J5RGltcy5nZXQoZGVzaXJlZFNsYWJTaXplLncsIGRlc2lyZWRTbGFiU2l6ZS5oKTtcblxuXHRcdC8vIENoZWNrIGlmIHRoZSBzbGFiIGlzIGZ1bGxcblx0XHRpZiAoc2xhYikge1xuXHRcdFx0Y29uc3QgZ2x5cGhzUGVyU2xhYiA9IE1hdGguZmxvb3IodGhpcy5fc2xhYlcgLyBzbGFiLmVudHJ5VykgKiBNYXRoLmZsb29yKHRoaXMuX3NsYWJIIC8gc2xhYi5lbnRyeUgpO1xuXHRcdFx0aWYgKHNsYWIuY291bnQgPj0gZ2x5cGhzUGVyU2xhYikge1xuXHRcdFx0XHRzbGFiID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBkeDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkeTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gU2VhcmNoIGZvciBzdWl0YWJsZSBzcGFjZSBpbiB1bnVzZWQgcmVjdGFuZ2xlc1xuXHRcdGlmICghc2xhYikge1xuXHRcdFx0Ly8gT25seSBjaGVjayBhdmFpbGFiaWxpdHkgZm9yIHRoZSBzbWFsbGVzdCBzaWRlXG5cdFx0XHRpZiAoZ2x5cGhXaWR0aCA8IGdseXBoSGVpZ2h0KSB7XG5cdFx0XHRcdGNvbnN0IG9wZW5SZWdpb25zID0gdGhpcy5fb3BlblJlZ2lvbnNCeVdpZHRoLmdldChnbHlwaFdpZHRoKTtcblx0XHRcdFx0aWYgKG9wZW5SZWdpb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0XHQvLyBUT0RPOiBEb24ndCBzZWFyY2ggZXZlcnl0aGluZz9cblx0XHRcdFx0XHQvLyBTZWFyY2ggZnJvbSB0aGUgZW5kIHNvIHdlIGNhbiB0eXBpY2FsbHkgcG9wIGl0IG9mZiB0aGUgc3RhY2tcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gb3BlblJlZ2lvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBvcGVuUmVnaW9uc1tpXTtcblx0XHRcdFx0XHRcdGlmIChyLncgPj0gZ2x5cGhXaWR0aCAmJiByLmggPj0gZ2x5cGhIZWlnaHQpIHtcblx0XHRcdFx0XHRcdFx0ZHggPSByLng7XG5cdFx0XHRcdFx0XHRcdGR5ID0gci55O1xuXHRcdFx0XHRcdFx0XHRpZiAoZ2x5cGhXaWR0aCA8IHIudykge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3VudXNlZFJlY3RzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0eDogci54ICsgZ2x5cGhXaWR0aCxcblx0XHRcdFx0XHRcdFx0XHRcdHk6IHIueSxcblx0XHRcdFx0XHRcdFx0XHRcdHc6IHIudyAtIGdseXBoV2lkdGgsXG5cdFx0XHRcdFx0XHRcdFx0XHRoOiBnbHlwaEhlaWdodFxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHIueSArPSBnbHlwaEhlaWdodDtcblx0XHRcdFx0XHRcdFx0ci5oIC09IGdseXBoSGVpZ2h0O1xuXHRcdFx0XHRcdFx0XHRpZiAoci5oID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGkgPT09IG9wZW5SZWdpb25zLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHRcdFx0XHRcdG9wZW5SZWdpb25zLnBvcCgpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl91bnVzZWRSZWN0cy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgb3BlblJlZ2lvbnMgPSB0aGlzLl9vcGVuUmVnaW9uc0J5SGVpZ2h0LmdldChnbHlwaEhlaWdodCk7XG5cdFx0XHRcdGlmIChvcGVuUmVnaW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gVE9ETzogRG9uJ3Qgc2VhcmNoIGV2ZXJ5dGhpbmc/XG5cdFx0XHRcdFx0Ly8gU2VhcmNoIGZyb20gdGhlIGVuZCBzbyB3ZSBjYW4gdHlwaWNhbGx5IHBvcCBpdCBvZmYgdGhlIHN0YWNrXG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IG9wZW5SZWdpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByID0gb3BlblJlZ2lvbnNbaV07XG5cdFx0XHRcdFx0XHRpZiAoci53ID49IGdseXBoV2lkdGggJiYgci5oID49IGdseXBoSGVpZ2h0KSB7XG5cdFx0XHRcdFx0XHRcdGR4ID0gci54O1xuXHRcdFx0XHRcdFx0XHRkeSA9IHIueTtcblx0XHRcdFx0XHRcdFx0aWYgKGdseXBoSGVpZ2h0IDwgci5oKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fdW51c2VkUmVjdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHR4OiByLngsXG5cdFx0XHRcdFx0XHRcdFx0XHR5OiByLnkgKyBnbHlwaEhlaWdodCxcblx0XHRcdFx0XHRcdFx0XHRcdHc6IGdseXBoV2lkdGgsXG5cdFx0XHRcdFx0XHRcdFx0XHRoOiByLmggLSBnbHlwaEhlaWdodFxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHIueCArPSBnbHlwaFdpZHRoO1xuXHRcdFx0XHRcdFx0XHRyLncgLT0gZ2x5cGhXaWR0aDtcblx0XHRcdFx0XHRcdFx0aWYgKHIuaCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChpID09PSBvcGVuUmVnaW9ucy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRvcGVuUmVnaW9ucy5wb3AoKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fdW51c2VkUmVjdHMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYSBuZXcgc2xhYlxuXHRcdGlmIChkeCA9PT0gdW5kZWZpbmVkIHx8IGR5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmICghc2xhYikge1xuXHRcdFx0XHRpZiAodGhpcy5fc2xhYnMubGVuZ3RoID49IHRoaXMuX3NsYWJzUGVyUm93ICogdGhpcy5fc2xhYnNQZXJDb2x1bW4pIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2xhYiA9IHtcblx0XHRcdFx0XHR4OiBNYXRoLmZsb29yKHRoaXMuX3NsYWJzLmxlbmd0aCAlIHRoaXMuX3NsYWJzUGVyUm93KSAqIHRoaXMuX3NsYWJXLFxuXHRcdFx0XHRcdHk6IE1hdGguZmxvb3IodGhpcy5fc2xhYnMubGVuZ3RoIC8gdGhpcy5fc2xhYnNQZXJSb3cpICogdGhpcy5fc2xhYkgsXG5cdFx0XHRcdFx0ZW50cnlXOiBkZXNpcmVkU2xhYlNpemUudyxcblx0XHRcdFx0XHRlbnRyeUg6IGRlc2lyZWRTbGFiU2l6ZS5oLFxuXHRcdFx0XHRcdGNvdW50OiAwXG5cdFx0XHRcdH07XG5cdFx0XHRcdC8vIFRyYWNrIHVudXNlZCByZWdpb25zIHRvIHVzZSBmb3Igc21hbGwgZ2x5cGhzXG5cdFx0XHRcdC8vICstLS0tLS0tLS0tLS0tKy0tLS0rXG5cdFx0XHRcdC8vIHwgICAgICAgICAgICAgfCAgICB8XG5cdFx0XHRcdC8vIHwgICAgICAgICAgICAgfCAgICB8IDwtIFVudXNlZCBXIHJlZ2lvblxuXHRcdFx0XHQvLyB8ICAgICAgICAgICAgIHwgICAgfFxuXHRcdFx0XHQvLyB8LS0tLS0tLS0tLS0tLSstLS0tK1xuXHRcdFx0XHQvLyB8ICAgICAgICAgICAgICAgICAgfCA8LSBVbnVzZWQgSCByZWdpb25cblx0XHRcdFx0Ly8gKy0tLS0tLS0tLS0tLS0tLS0tLStcblx0XHRcdFx0Y29uc3QgdW51c2VkVyA9IHRoaXMuX3NsYWJXICUgc2xhYi5lbnRyeVc7XG5cdFx0XHRcdGNvbnN0IHVudXNlZEggPSB0aGlzLl9zbGFiSCAlIHNsYWIuZW50cnlIO1xuXHRcdFx0XHRpZiAodW51c2VkVykge1xuXHRcdFx0XHRcdGFkZEVudHJ5VG9NYXBBcnJheSh0aGlzLl9vcGVuUmVnaW9uc0J5V2lkdGgsIHVudXNlZFcsIHtcblx0XHRcdFx0XHRcdHg6IHNsYWIueCArIHRoaXMuX3NsYWJXIC0gdW51c2VkVyxcblx0XHRcdFx0XHRcdHc6IHVudXNlZFcsXG5cdFx0XHRcdFx0XHR5OiBzbGFiLnksXG5cdFx0XHRcdFx0XHRoOiB0aGlzLl9zbGFiSCAtICh1bnVzZWRIID8/IDApXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHVudXNlZEgpIHtcblx0XHRcdFx0XHRhZGRFbnRyeVRvTWFwQXJyYXkodGhpcy5fb3BlblJlZ2lvbnNCeUhlaWdodCwgdW51c2VkSCwge1xuXHRcdFx0XHRcdFx0eDogc2xhYi54LFxuXHRcdFx0XHRcdFx0dzogdGhpcy5fc2xhYlcsXG5cdFx0XHRcdFx0XHR5OiBzbGFiLnkgKyB0aGlzLl9zbGFiSCAtIHVudXNlZEgsXG5cdFx0XHRcdFx0XHRoOiB1bnVzZWRIXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2xhYnMucHVzaChzbGFiKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlU2xhYnNCeURpbXMuc2V0KHNsYWIsIGRlc2lyZWRTbGFiU2l6ZS53LCBkZXNpcmVkU2xhYlNpemUuaCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdseXBoc1BlclJvdyA9IE1hdGguZmxvb3IodGhpcy5fc2xhYlcgLyBzbGFiLmVudHJ5Vyk7XG5cdFx0XHRkeCA9IHNsYWIueCArIE1hdGguZmxvb3Ioc2xhYi5jb3VudCAlIGdseXBoc1BlclJvdykgKiBzbGFiLmVudHJ5Vztcblx0XHRcdGR5ID0gc2xhYi55ICsgTWF0aC5mbG9vcihzbGFiLmNvdW50IC8gZ2x5cGhzUGVyUm93KSAqIHNsYWIuZW50cnlIO1xuXG5cdFx0XHQvLyBTaGlmdCBjdXJyZW50IHJvd1xuXHRcdFx0c2xhYi5jb3VudCsrO1xuXHRcdH1cblxuXHRcdC8vIERyYXcgZ2x5cGhcblx0XHR0aGlzLl9jdHguZHJhd0ltYWdlKFxuXHRcdFx0cmFzdGVyaXplZEdseXBoLnNvdXJjZSxcblx0XHRcdC8vIHNvdXJjZVxuXHRcdFx0cmFzdGVyaXplZEdseXBoLmJvdW5kaW5nQm94LmxlZnQsXG5cdFx0XHRyYXN0ZXJpemVkR2x5cGguYm91bmRpbmdCb3gudG9wLFxuXHRcdFx0Z2x5cGhXaWR0aCxcblx0XHRcdGdseXBoSGVpZ2h0LFxuXHRcdFx0Ly8gZGVzdGluYXRpb25cblx0XHRcdGR4LFxuXHRcdFx0ZHksXG5cdFx0XHRnbHlwaFdpZHRoLFxuXHRcdFx0Z2x5cGhIZWlnaHRcblx0XHQpO1xuXG5cdFx0Ly8gQ3JlYXRlIGdseXBoIG9iamVjdFxuXHRcdGNvbnN0IGdseXBoOiBJVGV4dHVyZUF0bGFzUGFnZUdseXBoID0ge1xuXHRcdFx0cGFnZUluZGV4OiB0aGlzLl90ZXh0dXJlSW5kZXgsXG5cdFx0XHRnbHlwaEluZGV4OiB0aGlzLl9uZXh0SW5kZXgrKyxcblx0XHRcdHg6IGR4LFxuXHRcdFx0eTogZHksXG5cdFx0XHR3OiBnbHlwaFdpZHRoLFxuXHRcdFx0aDogZ2x5cGhIZWlnaHQsXG5cdFx0XHRvcmlnaW5PZmZzZXRYOiByYXN0ZXJpemVkR2x5cGgub3JpZ2luT2Zmc2V0LngsXG5cdFx0XHRvcmlnaW5PZmZzZXRZOiByYXN0ZXJpemVkR2x5cGgub3JpZ2luT2Zmc2V0LnksXG5cdFx0XHRmb250Qm91bmRpbmdCb3hBc2NlbnQ6IHJhc3Rlcml6ZWRHbHlwaC5mb250Qm91bmRpbmdCb3hBc2NlbnQsXG5cdFx0XHRmb250Qm91bmRpbmdCb3hEZXNjZW50OiByYXN0ZXJpemVkR2x5cGguZm9udEJvdW5kaW5nQm94RGVzY2VudCxcblx0XHR9O1xuXG5cdFx0Ly8gU2V0IHRoZSBnbHlwaFxuXHRcdHRoaXMuX2FsbG9jYXRlZEdseXBocy5hZGQoZ2x5cGgpO1xuXG5cdFx0cmV0dXJuIGdseXBoO1xuXHR9XG5cblx0cHVibGljIGdldFVzYWdlUHJldmlldygpOiBQcm9taXNlPEJsb2I+IHtcblx0XHRjb25zdCB3ID0gdGhpcy5fY2FudmFzLndpZHRoO1xuXHRcdGNvbnN0IGggPSB0aGlzLl9jYW52YXMuaGVpZ2h0O1xuXHRcdGNvbnN0IGNhbnZhcyA9IG5ldyBPZmZzY3JlZW5DYW52YXModywgaCk7XG5cdFx0Y29uc3QgY3R4ID0gZW5zdXJlTm9uTnVsbGFibGUoY2FudmFzLmdldENvbnRleHQoJzJkJykpO1xuXG5cdFx0Y3R4LmZpbGxTdHlsZSA9IFVzYWdlUHJldmlld0NvbG9ycy5VbnVzZWQ7XG5cdFx0Y3R4LmZpbGxSZWN0KDAsIDAsIHcsIGgpO1xuXG5cdFx0bGV0IHNsYWJFbnRyeVBpeGVscyA9IDA7XG5cdFx0bGV0IHVzZWRQaXhlbHMgPSAwO1xuXHRcdGxldCBzbGFiRWRnZVBpeGVscyA9IDA7XG5cdFx0bGV0IHJlc3RyaWN0ZWRQaXhlbHMgPSAwO1xuXHRcdGNvbnN0IHNsYWJXID0gNjQgPDwgKE1hdGguZmxvb3IoZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbykgLSAxKTtcblx0XHRjb25zdCBzbGFiSCA9IHNsYWJXO1xuXG5cdFx0Ly8gRHJhdyB3YXN0ZWQgdW5kZXJuZWF0aCBnbHlwaHMgZmlyc3Rcblx0XHRmb3IgKGNvbnN0IHNsYWIgb2YgdGhpcy5fc2xhYnMpIHtcblx0XHRcdGxldCB4ID0gMDtcblx0XHRcdGxldCB5ID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2xhYi5jb3VudDsgaSsrKSB7XG5cdFx0XHRcdGlmICh4ICsgc2xhYi5lbnRyeVcgPiBzbGFiVykge1xuXHRcdFx0XHRcdHggPSAwO1xuXHRcdFx0XHRcdHkgKz0gc2xhYi5lbnRyeUg7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3R4LmZpbGxTdHlsZSA9IFVzYWdlUHJldmlld0NvbG9ycy5XYXN0ZWQ7XG5cdFx0XHRcdGN0eC5maWxsUmVjdChzbGFiLnggKyB4LCBzbGFiLnkgKyB5LCBzbGFiLmVudHJ5Vywgc2xhYi5lbnRyeUgpO1xuXG5cdFx0XHRcdHNsYWJFbnRyeVBpeGVscyArPSBzbGFiLmVudHJ5VyAqIHNsYWIuZW50cnlIO1xuXHRcdFx0XHR4ICs9IHNsYWIuZW50cnlXO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW50cmllc1BlclJvdyA9IE1hdGguZmxvb3Ioc2xhYlcgLyBzbGFiLmVudHJ5Vyk7XG5cdFx0XHRjb25zdCBlbnRyaWVzUGVyQ29sID0gTWF0aC5mbG9vcihzbGFiSCAvIHNsYWIuZW50cnlIKTtcblx0XHRcdGNvbnN0IHRoaXNTbGFiUGl4ZWxzID0gc2xhYi5lbnRyeVcgKiBlbnRyaWVzUGVyUm93ICogc2xhYi5lbnRyeUggKiBlbnRyaWVzUGVyQ29sO1xuXHRcdFx0c2xhYkVkZ2VQaXhlbHMgKz0gKHNsYWJXICogc2xhYkgpIC0gdGhpc1NsYWJQaXhlbHM7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhdyBnbHlwaHNcblx0XHRmb3IgKGNvbnN0IGcgb2YgdGhpcy5fYWxsb2NhdGVkR2x5cGhzKSB7XG5cdFx0XHR1c2VkUGl4ZWxzICs9IGcudyAqIGcuaDtcblx0XHRcdGN0eC5maWxsU3R5bGUgPSBVc2FnZVByZXZpZXdDb2xvcnMuVXNlZDtcblx0XHRcdGN0eC5maWxsUmVjdChnLngsIGcueSwgZy53LCBnLmgpO1xuXHRcdH1cblxuXHRcdC8vIERyYXcgdW51c2VkIHNwYWNlIG9uIHNpZGVcblx0XHRjb25zdCB1bnVzZWRSZWdpb25zID0gQXJyYXkuZnJvbSh0aGlzLl9vcGVuUmVnaW9uc0J5V2lkdGgudmFsdWVzKCkpLmZsYXQoKS5jb25jYXQoQXJyYXkuZnJvbSh0aGlzLl9vcGVuUmVnaW9uc0J5SGVpZ2h0LnZhbHVlcygpKS5mbGF0KCkpO1xuXHRcdGZvciAoY29uc3QgciBvZiB1bnVzZWRSZWdpb25zKSB7XG5cdFx0XHRjdHguZmlsbFN0eWxlID0gVXNhZ2VQcmV2aWV3Q29sb3JzLlJlc3RyaWN0ZWQ7XG5cdFx0XHRjdHguZmlsbFJlY3Qoci54LCByLnksIHIudywgci5oKTtcblx0XHRcdHJlc3RyaWN0ZWRQaXhlbHMgKz0gci53ICogci5oO1xuXHRcdH1cblxuXG5cdFx0Ly8gT3ZlcmxheSBhY3R1YWwgZ2x5cGhzIG9uIHRvcFxuXHRcdGN0eC5nbG9iYWxBbHBoYSA9IDAuNTtcblx0XHRjdHguZHJhd0ltYWdlKHRoaXMuX2NhbnZhcywgMCwgMCk7XG5cdFx0Y3R4Lmdsb2JhbEFscGhhID0gMTtcblxuXHRcdHJldHVybiBjYW52YXMuY29udmVydFRvQmxvYigpO1xuXHR9XG5cblx0cHVibGljIGdldFN0YXRzKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdyA9IHRoaXMuX2NhbnZhcy53aWR0aDtcblx0XHRjb25zdCBoID0gdGhpcy5fY2FudmFzLmhlaWdodDtcblxuXHRcdGxldCBzbGFiRW50cnlQaXhlbHMgPSAwO1xuXHRcdGxldCB1c2VkUGl4ZWxzID0gMDtcblx0XHRsZXQgc2xhYkVkZ2VQaXhlbHMgPSAwO1xuXHRcdGxldCB3YXN0ZWRQaXhlbHMgPSAwO1xuXHRcdGxldCByZXN0cmljdGVkUGl4ZWxzID0gMDtcblx0XHRjb25zdCB0b3RhbFBpeGVscyA9IHcgKiBoO1xuXHRcdGNvbnN0IHNsYWJXID0gNjQgPDwgKE1hdGguZmxvb3IoZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbykgLSAxKTtcblx0XHRjb25zdCBzbGFiSCA9IHNsYWJXO1xuXG5cdFx0Ly8gRHJhdyB3YXN0ZWQgdW5kZXJuZWF0aCBnbHlwaHMgZmlyc3Rcblx0XHRmb3IgKGNvbnN0IHNsYWIgb2YgdGhpcy5fc2xhYnMpIHtcblx0XHRcdGxldCB4ID0gMDtcblx0XHRcdGxldCB5ID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2xhYi5jb3VudDsgaSsrKSB7XG5cdFx0XHRcdGlmICh4ICsgc2xhYi5lbnRyeVcgPiBzbGFiVykge1xuXHRcdFx0XHRcdHggPSAwO1xuXHRcdFx0XHRcdHkgKz0gc2xhYi5lbnRyeUg7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2xhYkVudHJ5UGl4ZWxzICs9IHNsYWIuZW50cnlXICogc2xhYi5lbnRyeUg7XG5cdFx0XHRcdHggKz0gc2xhYi5lbnRyeVc7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRyaWVzUGVyUm93ID0gTWF0aC5mbG9vcihzbGFiVyAvIHNsYWIuZW50cnlXKTtcblx0XHRcdGNvbnN0IGVudHJpZXNQZXJDb2wgPSBNYXRoLmZsb29yKHNsYWJIIC8gc2xhYi5lbnRyeUgpO1xuXHRcdFx0Y29uc3QgdGhpc1NsYWJQaXhlbHMgPSBzbGFiLmVudHJ5VyAqIGVudHJpZXNQZXJSb3cgKiBzbGFiLmVudHJ5SCAqIGVudHJpZXNQZXJDb2w7XG5cdFx0XHRzbGFiRWRnZVBpeGVscyArPSAoc2xhYlcgKiBzbGFiSCkgLSB0aGlzU2xhYlBpeGVscztcblx0XHR9XG5cblx0XHQvLyBEcmF3IGdseXBoc1xuXHRcdGZvciAoY29uc3QgZyBvZiB0aGlzLl9hbGxvY2F0ZWRHbHlwaHMpIHtcblx0XHRcdHVzZWRQaXhlbHMgKz0gZy53ICogZy5oO1xuXHRcdH1cblxuXHRcdC8vIERyYXcgdW51c2VkIHNwYWNlIG9uIHNpZGVcblx0XHRjb25zdCB1bnVzZWRSZWdpb25zID0gQXJyYXkuZnJvbSh0aGlzLl9vcGVuUmVnaW9uc0J5V2lkdGgudmFsdWVzKCkpLmZsYXQoKS5jb25jYXQoQXJyYXkuZnJvbSh0aGlzLl9vcGVuUmVnaW9uc0J5SGVpZ2h0LnZhbHVlcygpKS5mbGF0KCkpO1xuXHRcdGZvciAoY29uc3QgciBvZiB1bnVzZWRSZWdpb25zKSB7XG5cdFx0XHRyZXN0cmljdGVkUGl4ZWxzICs9IHIudyAqIHIuaDtcblx0XHR9XG5cblx0XHRjb25zdCBlZGdlVXNlZFBpeGVscyA9IHNsYWJFZGdlUGl4ZWxzIC0gcmVzdHJpY3RlZFBpeGVscztcblx0XHR3YXN0ZWRQaXhlbHMgPSBzbGFiRW50cnlQaXhlbHMgLSAodXNlZFBpeGVscyAtIGVkZ2VVc2VkUGl4ZWxzKTtcblxuXHRcdC8vIHVzZWRQaXhlbHMgKz0gc2xhYkVkZ2VQaXhlbHMgLSByZXN0cmljdGVkUGl4ZWxzO1xuXHRcdGNvbnN0IGVmZmljaWVuY3kgPSB1c2VkUGl4ZWxzIC8gKHVzZWRQaXhlbHMgKyB3YXN0ZWRQaXhlbHMgKyByZXN0cmljdGVkUGl4ZWxzKTtcblxuXHRcdHJldHVybiBbXG5cdFx0XHRgcGFnZVske3RoaXMuX3RleHR1cmVJbmRleH1dOmAsXG5cdFx0XHRgICAgICBUb3RhbDogJHt0b3RhbFBpeGVsc31weCAoJHt3fXgke2h9KWAsXG5cdFx0XHRgICAgICAgVXNlZDogJHt1c2VkUGl4ZWxzfXB4ICgkeygodXNlZFBpeGVscyAvIHRvdGFsUGl4ZWxzKSAqIDEwMCkudG9GaXhlZCgyKX0lKWAsXG5cdFx0XHRgICAgIFdhc3RlZDogJHt3YXN0ZWRQaXhlbHN9cHggKCR7KCh3YXN0ZWRQaXhlbHMgLyB0b3RhbFBpeGVscykgKiAxMDApLnRvRml4ZWQoMil9JSlgLFxuXHRcdFx0YFJlc3RyaWN0ZWQ6ICR7cmVzdHJpY3RlZFBpeGVsc31weCAoJHsoKHJlc3RyaWN0ZWRQaXhlbHMgLyB0b3RhbFBpeGVscykgKiAxMDApLnRvRml4ZWQoMil9JSkgKGhhcmQgdG8gYWxsb2NhdGUpYCxcblx0XHRcdGBFZmZpY2llbmN5OiAke2VmZmljaWVuY3kgPT09IDEgPyAnMTAwJyA6IChlZmZpY2llbmN5ICogMTAwKS50b0ZpeGVkKDIpfSVgLFxuXHRcdFx0YCAgICAgU2xhYnM6ICR7dGhpcy5fc2xhYnMubGVuZ3RofSBvZiAke01hdGguZmxvb3IodGhpcy5fY2FudmFzLndpZHRoIC8gc2xhYlcpICogTWF0aC5mbG9vcih0aGlzLl9jYW52YXMuaGVpZ2h0IC8gc2xhYkgpfWBcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJVGV4dHVyZUF0bGFzU2xhYiB7XG5cdHg6IG51bWJlcjtcblx0eTogbnVtYmVyO1xuXHRlbnRyeUg6IG51bWJlcjtcblx0ZW50cnlXOiBudW1iZXI7XG5cdGNvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJVGV4dHVyZUF0bGFzU2xhYlVudXNlZFJlY3Qge1xuXHR4OiBudW1iZXI7XG5cdHk6IG51bWJlcjtcblx0dzogbnVtYmVyO1xuXHRoOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGFkZEVudHJ5VG9NYXBBcnJheTxLLCBWPihtYXA6IE1hcDxLLCBWW10+LCBrZXk6IEssIGVudHJ5OiBWKSB7XG5cdGxldCBsaXN0ID0gbWFwLmdldChrZXkpO1xuXHRpZiAoIWxpc3QpIHtcblx0XHRsaXN0ID0gW107XG5cdFx0bWFwLnNldChrZXksIGxpc3QpO1xuXHR9XG5cdGxpc3QucHVzaChlbnRyeSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUywwQkFBb0Y7QUFnQnRGLE1BQU0sMEJBQTREO0FBQUEsRUFxQnhFLFlBQ2tCLFNBQ0EsZUFDakIsU0FDQztBQUhnQjtBQUNBO0FBbkJsQixTQUFpQixTQUE4QixDQUFDO0FBQ2hELFNBQWlCLHFCQUFtRSxJQUFJLFFBQVE7QUFFaEcsU0FBaUIsZUFBOEMsQ0FBQztBQUVoRSxTQUFpQix1QkFBbUUsb0JBQUksSUFBSTtBQUM1RixTQUFpQixzQkFBa0Usb0JBQUksSUFBSTtBQUczRjtBQUFBLFNBQWlCLG1CQUEwRCxvQkFBSSxJQUFJO0FBTW5GLFNBQVEsYUFBYTtBQU9wQixTQUFLLE9BQU8s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
