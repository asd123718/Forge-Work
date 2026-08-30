import { TextureAtlas } from "../atlas/textureAtlas.js";
import { TextureAtlasPage } from "../atlas/textureAtlasPage.js";
import { BindingId } from "../gpu.js";
const fullFileRenderStrategyWgsl = (
  /*wgsl*/
  `
struct GlyphInfo {
	position: vec2f,
	size: vec2f,
	origin: vec2f,
};

struct Vertex {
	@location(0) position: vec2f,
};

struct Cell {
	position: vec2f,
	unused1: vec2f,
	glyphIndex: f32,
	textureIndex: f32
};

struct LayoutInfo {
	canvasDims: vec2f,
	viewportOffset: vec2f,
	viewportDims: vec2f,
}

struct ScrollOffset {
	offset: vec2f
}

struct VSOutput {
	@builtin(position) position:   vec4f,
	@location(1)       layerIndex: f32,
	@location(0)       texcoord:   vec2f,
};

// Uniforms
@group(0) @binding(${BindingId.LayoutInfoUniform})       var<uniform>       layoutInfo:      LayoutInfo;
@group(0) @binding(${BindingId.AtlasDimensionsUniform})  var<uniform>       atlasDims:       vec2f;
@group(0) @binding(${BindingId.ScrollOffset})            var<uniform>       scrollOffset:    ScrollOffset;

// Storage buffers
@group(0) @binding(${BindingId.GlyphInfo})               var<storage, read> glyphInfo:       array<array<GlyphInfo, ${TextureAtlasPage.maximumGlyphCount}>, ${TextureAtlas.maximumPageCount}>;
@group(0) @binding(${BindingId.Cells})                   var<storage, read> cells:           array<Cell>;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let cell = cells[instanceIndex];
	var glyph = glyphInfo[u32(cell.textureIndex)][u32(cell.glyphIndex)];

	var vsOut: VSOutput;
	// Multiple vert.position by 2,-2 to get it into clipspace which ranged from -1 to 1
	vsOut.position = vec4f(
		// Make everything relative to top left instead of center
		vec2f(-1, 1) +
		((vert.position * vec2f(2, -2)) / layoutInfo.canvasDims) * glyph.size +
		((cell.position * vec2f(2, -2)) / layoutInfo.canvasDims) +
		((glyph.origin * vec2f(2, -2)) / layoutInfo.canvasDims) +
		(((layoutInfo.viewportOffset - scrollOffset.offset * vec2(1, -1)) * 2) / layoutInfo.canvasDims),
		0.0,
		1.0
	);

	vsOut.layerIndex = cell.textureIndex;
	// Textures are flipped from natural direction on the y-axis, so flip it back
	vsOut.texcoord = vert.position;
	vsOut.texcoord = (
		// Glyph offset (0-1)
		(glyph.position / atlasDims) +
		// Glyph coordinate (0-1)
		(vsOut.texcoord * (glyph.size / atlasDims))
	);

	return vsOut;
}

@group(0) @binding(${BindingId.TextureSampler}) var ourSampler: sampler;
@group(0) @binding(${BindingId.Texture})        var ourTexture: texture_2d_array<f32>;

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return textureSample(ourTexture, ourSampler, vsOut.texcoord, u32(vsOut.layerIndex));
}
`
);
export {
  fullFileRenderStrategyWgsl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGdwdVxccmVuZGVyU3RyYXRlZ3lcXGZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kud2dzbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRleHR1cmVBdGxhcyB9IGZyb20gJy4uL2F0bGFzL3RleHR1cmVBdGxhcy5qcyc7XG5pbXBvcnQgeyBUZXh0dXJlQXRsYXNQYWdlIH0gZnJvbSAnLi4vYXRsYXMvdGV4dHVyZUF0bGFzUGFnZS5qcyc7XG5pbXBvcnQgeyBCaW5kaW5nSWQgfSBmcm9tICcuLi9ncHUuanMnO1xuXG5leHBvcnQgY29uc3QgZnVsbEZpbGVSZW5kZXJTdHJhdGVneVdnc2wgPSAvKndnc2wqLyBgXG5zdHJ1Y3QgR2x5cGhJbmZvIHtcblx0cG9zaXRpb246IHZlYzJmLFxuXHRzaXplOiB2ZWMyZixcblx0b3JpZ2luOiB2ZWMyZixcbn07XG5cbnN0cnVjdCBWZXJ0ZXgge1xuXHRAbG9jYXRpb24oMCkgcG9zaXRpb246IHZlYzJmLFxufTtcblxuc3RydWN0IENlbGwge1xuXHRwb3NpdGlvbjogdmVjMmYsXG5cdHVudXNlZDE6IHZlYzJmLFxuXHRnbHlwaEluZGV4OiBmMzIsXG5cdHRleHR1cmVJbmRleDogZjMyXG59O1xuXG5zdHJ1Y3QgTGF5b3V0SW5mbyB7XG5cdGNhbnZhc0RpbXM6IHZlYzJmLFxuXHR2aWV3cG9ydE9mZnNldDogdmVjMmYsXG5cdHZpZXdwb3J0RGltczogdmVjMmYsXG59XG5cbnN0cnVjdCBTY3JvbGxPZmZzZXQge1xuXHRvZmZzZXQ6IHZlYzJmXG59XG5cbnN0cnVjdCBWU091dHB1dCB7XG5cdEBidWlsdGluKHBvc2l0aW9uKSBwb3NpdGlvbjogICB2ZWM0Zixcblx0QGxvY2F0aW9uKDEpICAgICAgIGxheWVySW5kZXg6IGYzMixcblx0QGxvY2F0aW9uKDApICAgICAgIHRleGNvb3JkOiAgIHZlYzJmLFxufTtcblxuLy8gVW5pZm9ybXNcbkBncm91cCgwKSBAYmluZGluZygke0JpbmRpbmdJZC5MYXlvdXRJbmZvVW5pZm9ybX0pICAgICAgIHZhcjx1bmlmb3JtPiAgICAgICBsYXlvdXRJbmZvOiAgICAgIExheW91dEluZm87XG5AZ3JvdXAoMCkgQGJpbmRpbmcoJHtCaW5kaW5nSWQuQXRsYXNEaW1lbnNpb25zVW5pZm9ybX0pICB2YXI8dW5pZm9ybT4gICAgICAgYXRsYXNEaW1zOiAgICAgICB2ZWMyZjtcbkBncm91cCgwKSBAYmluZGluZygke0JpbmRpbmdJZC5TY3JvbGxPZmZzZXR9KSAgICAgICAgICAgIHZhcjx1bmlmb3JtPiAgICAgICBzY3JvbGxPZmZzZXQ6ICAgIFNjcm9sbE9mZnNldDtcblxuLy8gU3RvcmFnZSBidWZmZXJzXG5AZ3JvdXAoMCkgQGJpbmRpbmcoJHtCaW5kaW5nSWQuR2x5cGhJbmZvfSkgICAgICAgICAgICAgICB2YXI8c3RvcmFnZSwgcmVhZD4gZ2x5cGhJbmZvOiAgICAgICBhcnJheTxhcnJheTxHbHlwaEluZm8sICR7VGV4dHVyZUF0bGFzUGFnZS5tYXhpbXVtR2x5cGhDb3VudH0+LCAke1RleHR1cmVBdGxhcy5tYXhpbXVtUGFnZUNvdW50fT47XG5AZ3JvdXAoMCkgQGJpbmRpbmcoJHtCaW5kaW5nSWQuQ2VsbHN9KSAgICAgICAgICAgICAgICAgICB2YXI8c3RvcmFnZSwgcmVhZD4gY2VsbHM6ICAgICAgICAgICBhcnJheTxDZWxsPjtcblxuQHZlcnRleCBmbiB2cyhcblx0dmVydDogVmVydGV4LFxuXHRAYnVpbHRpbihpbnN0YW5jZV9pbmRleCkgaW5zdGFuY2VJbmRleDogdTMyLFxuXHRAYnVpbHRpbih2ZXJ0ZXhfaW5kZXgpIHZlcnRleEluZGV4IDogdTMyXG4pIC0+IFZTT3V0cHV0IHtcblx0bGV0IGNlbGwgPSBjZWxsc1tpbnN0YW5jZUluZGV4XTtcblx0dmFyIGdseXBoID0gZ2x5cGhJbmZvW3UzMihjZWxsLnRleHR1cmVJbmRleCldW3UzMihjZWxsLmdseXBoSW5kZXgpXTtcblxuXHR2YXIgdnNPdXQ6IFZTT3V0cHV0O1xuXHQvLyBNdWx0aXBsZSB2ZXJ0LnBvc2l0aW9uIGJ5IDIsLTIgdG8gZ2V0IGl0IGludG8gY2xpcHNwYWNlIHdoaWNoIHJhbmdlZCBmcm9tIC0xIHRvIDFcblx0dnNPdXQucG9zaXRpb24gPSB2ZWM0Zihcblx0XHQvLyBNYWtlIGV2ZXJ5dGhpbmcgcmVsYXRpdmUgdG8gdG9wIGxlZnQgaW5zdGVhZCBvZiBjZW50ZXJcblx0XHR2ZWMyZigtMSwgMSkgK1xuXHRcdCgodmVydC5wb3NpdGlvbiAqIHZlYzJmKDIsIC0yKSkgLyBsYXlvdXRJbmZvLmNhbnZhc0RpbXMpICogZ2x5cGguc2l6ZSArXG5cdFx0KChjZWxsLnBvc2l0aW9uICogdmVjMmYoMiwgLTIpKSAvIGxheW91dEluZm8uY2FudmFzRGltcykgK1xuXHRcdCgoZ2x5cGgub3JpZ2luICogdmVjMmYoMiwgLTIpKSAvIGxheW91dEluZm8uY2FudmFzRGltcykgK1xuXHRcdCgoKGxheW91dEluZm8udmlld3BvcnRPZmZzZXQgLSBzY3JvbGxPZmZzZXQub2Zmc2V0ICogdmVjMigxLCAtMSkpICogMikgLyBsYXlvdXRJbmZvLmNhbnZhc0RpbXMpLFxuXHRcdDAuMCxcblx0XHQxLjBcblx0KTtcblxuXHR2c091dC5sYXllckluZGV4ID0gY2VsbC50ZXh0dXJlSW5kZXg7XG5cdC8vIFRleHR1cmVzIGFyZSBmbGlwcGVkIGZyb20gbmF0dXJhbCBkaXJlY3Rpb24gb24gdGhlIHktYXhpcywgc28gZmxpcCBpdCBiYWNrXG5cdHZzT3V0LnRleGNvb3JkID0gdmVydC5wb3NpdGlvbjtcblx0dnNPdXQudGV4Y29vcmQgPSAoXG5cdFx0Ly8gR2x5cGggb2Zmc2V0ICgwLTEpXG5cdFx0KGdseXBoLnBvc2l0aW9uIC8gYXRsYXNEaW1zKSArXG5cdFx0Ly8gR2x5cGggY29vcmRpbmF0ZSAoMC0xKVxuXHRcdCh2c091dC50ZXhjb29yZCAqIChnbHlwaC5zaXplIC8gYXRsYXNEaW1zKSlcblx0KTtcblxuXHRyZXR1cm4gdnNPdXQ7XG59XG5cbkBncm91cCgwKSBAYmluZGluZygke0JpbmRpbmdJZC5UZXh0dXJlU2FtcGxlcn0pIHZhciBvdXJTYW1wbGVyOiBzYW1wbGVyO1xuQGdyb3VwKDApIEBiaW5kaW5nKCR7QmluZGluZ0lkLlRleHR1cmV9KSAgICAgICAgdmFyIG91clRleHR1cmU6IHRleHR1cmVfMmRfYXJyYXk8ZjMyPjtcblxuQGZyYWdtZW50IGZuIGZzKHZzT3V0OiBWU091dHB1dCkgLT4gQGxvY2F0aW9uKDApIHZlYzRmIHtcblx0cmV0dXJuIHRleHR1cmVTYW1wbGUob3VyVGV4dHVyZSwgb3VyU2FtcGxlciwgdnNPdXQudGV4Y29vcmQsIHUzMih2c091dC5sYXllckluZGV4KSk7XG59XG5gO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBaUI7QUFFbkIsTUFBTTtBQUFBO0FBQUEsRUFBc0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHFCQW1DOUIsVUFBVSxpQkFBaUI7QUFBQSxxQkFDM0IsVUFBVSxzQkFBc0I7QUFBQSxxQkFDaEMsVUFBVSxZQUFZO0FBQUE7QUFBQTtBQUFBLHFCQUd0QixVQUFVLFNBQVMsOEVBQThFLGlCQUFpQixpQkFBaUIsTUFBTSxhQUFhLGdCQUFnQjtBQUFBLHFCQUN0SyxVQUFVLEtBQUs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEscUJBb0NmLFVBQVUsY0FBYztBQUFBLHFCQUN4QixVQUFVLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7IiwKICAibmFtZXMiOiBbXQp9Cg==
