var RectangleRendererBindingId = /* @__PURE__ */ ((RectangleRendererBindingId2) => {
  RectangleRendererBindingId2[RectangleRendererBindingId2["Shapes"] = 0] = "Shapes";
  RectangleRendererBindingId2[RectangleRendererBindingId2["LayoutInfoUniform"] = 1] = "LayoutInfoUniform";
  RectangleRendererBindingId2[RectangleRendererBindingId2["ScrollOffset"] = 2] = "ScrollOffset";
  return RectangleRendererBindingId2;
})(RectangleRendererBindingId || {});
const rectangleRendererWgsl = (
  /*wgsl*/
  `

struct Vertex {
	@location(0) position: vec2f,
};

struct LayoutInfo {
	canvasDims: vec2f,
	viewportOffset: vec2f,
	viewportDims: vec2f,
}

struct ScrollOffset {
	offset: vec2f,
}

struct Shape {
	position: vec2f,
	size: vec2f,
	color: vec4f,
};

struct VSOutput {
	@builtin(position) position: vec4f,
	@location(1)       color:    vec4f,
};

// Uniforms
@group(0) @binding(${1 /* LayoutInfoUniform */}) var<uniform>       layoutInfo:      LayoutInfo;

// Storage buffers
@group(0) @binding(${0 /* Shapes */})            var<storage, read> shapes:          array<Shape>;
@group(0) @binding(${2 /* ScrollOffset */})      var<uniform>       scrollOffset:    ScrollOffset;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let shape = shapes[instanceIndex];

	var vsOut: VSOutput;
	vsOut.position = vec4f(
		(
			// Top left corner
			vec2f(-1,  1) +
			// Convert pixel position to clipspace
			vec2f( 2, -2) / layoutInfo.canvasDims *
			// Shape position and size
			(layoutInfo.viewportOffset - scrollOffset.offset + shape.position + vert.position * shape.size)
		),
		0.0,
		1.0
	);
	vsOut.color = shape.color;
	return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return vsOut.color;
}
`
);
export {
  RectangleRendererBindingId,
  rectangleRendererWgsl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGdwdVxccmVjdGFuZ2xlUmVuZGVyZXIud2dzbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmV4cG9ydCBjb25zdCBlbnVtIFJlY3RhbmdsZVJlbmRlcmVyQmluZGluZ0lkIHtcblx0U2hhcGVzLFxuXHRMYXlvdXRJbmZvVW5pZm9ybSxcblx0U2Nyb2xsT2Zmc2V0LFxufVxuXG5leHBvcnQgY29uc3QgcmVjdGFuZ2xlUmVuZGVyZXJXZ3NsID0gLyp3Z3NsKi8gYFxuXG5zdHJ1Y3QgVmVydGV4IHtcblx0QGxvY2F0aW9uKDApIHBvc2l0aW9uOiB2ZWMyZixcbn07XG5cbnN0cnVjdCBMYXlvdXRJbmZvIHtcblx0Y2FudmFzRGltczogdmVjMmYsXG5cdHZpZXdwb3J0T2Zmc2V0OiB2ZWMyZixcblx0dmlld3BvcnREaW1zOiB2ZWMyZixcbn1cblxuc3RydWN0IFNjcm9sbE9mZnNldCB7XG5cdG9mZnNldDogdmVjMmYsXG59XG5cbnN0cnVjdCBTaGFwZSB7XG5cdHBvc2l0aW9uOiB2ZWMyZixcblx0c2l6ZTogdmVjMmYsXG5cdGNvbG9yOiB2ZWM0Zixcbn07XG5cbnN0cnVjdCBWU091dHB1dCB7XG5cdEBidWlsdGluKHBvc2l0aW9uKSBwb3NpdGlvbjogdmVjNGYsXG5cdEBsb2NhdGlvbigxKSAgICAgICBjb2xvcjogICAgdmVjNGYsXG59O1xuXG4vLyBVbmlmb3Jtc1xuQGdyb3VwKDApIEBiaW5kaW5nKCR7UmVjdGFuZ2xlUmVuZGVyZXJCaW5kaW5nSWQuTGF5b3V0SW5mb1VuaWZvcm19KSB2YXI8dW5pZm9ybT4gICAgICAgbGF5b3V0SW5mbzogICAgICBMYXlvdXRJbmZvO1xuXG4vLyBTdG9yYWdlIGJ1ZmZlcnNcbkBncm91cCgwKSBAYmluZGluZygke1JlY3RhbmdsZVJlbmRlcmVyQmluZGluZ0lkLlNoYXBlc30pICAgICAgICAgICAgdmFyPHN0b3JhZ2UsIHJlYWQ+IHNoYXBlczogICAgICAgICAgYXJyYXk8U2hhcGU+O1xuQGdyb3VwKDApIEBiaW5kaW5nKCR7UmVjdGFuZ2xlUmVuZGVyZXJCaW5kaW5nSWQuU2Nyb2xsT2Zmc2V0fSkgICAgICB2YXI8dW5pZm9ybT4gICAgICAgc2Nyb2xsT2Zmc2V0OiAgICBTY3JvbGxPZmZzZXQ7XG5cbkB2ZXJ0ZXggZm4gdnMoXG5cdHZlcnQ6IFZlcnRleCxcblx0QGJ1aWx0aW4oaW5zdGFuY2VfaW5kZXgpIGluc3RhbmNlSW5kZXg6IHUzMixcblx0QGJ1aWx0aW4odmVydGV4X2luZGV4KSB2ZXJ0ZXhJbmRleCA6IHUzMlxuKSAtPiBWU091dHB1dCB7XG5cdGxldCBzaGFwZSA9IHNoYXBlc1tpbnN0YW5jZUluZGV4XTtcblxuXHR2YXIgdnNPdXQ6IFZTT3V0cHV0O1xuXHR2c091dC5wb3NpdGlvbiA9IHZlYzRmKFxuXHRcdChcblx0XHRcdC8vIFRvcCBsZWZ0IGNvcm5lclxuXHRcdFx0dmVjMmYoLTEsICAxKSArXG5cdFx0XHQvLyBDb252ZXJ0IHBpeGVsIHBvc2l0aW9uIHRvIGNsaXBzcGFjZVxuXHRcdFx0dmVjMmYoIDIsIC0yKSAvIGxheW91dEluZm8uY2FudmFzRGltcyAqXG5cdFx0XHQvLyBTaGFwZSBwb3NpdGlvbiBhbmQgc2l6ZVxuXHRcdFx0KGxheW91dEluZm8udmlld3BvcnRPZmZzZXQgLSBzY3JvbGxPZmZzZXQub2Zmc2V0ICsgc2hhcGUucG9zaXRpb24gKyB2ZXJ0LnBvc2l0aW9uICogc2hhcGUuc2l6ZSlcblx0XHQpLFxuXHRcdDAuMCxcblx0XHQxLjBcblx0KTtcblx0dnNPdXQuY29sb3IgPSBzaGFwZS5jb2xvcjtcblx0cmV0dXJuIHZzT3V0O1xufVxuXG5AZnJhZ21lbnQgZm4gZnModnNPdXQ6IFZTT3V0cHV0KSAtPiBAbG9jYXRpb24oMCkgdmVjNGYge1xuXHRyZXR1cm4gdnNPdXQuY29sb3I7XG59XG5gO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS08sSUFBVyw2QkFBWCxrQkFBV0EsZ0NBQVg7QUFDTixFQUFBQSx3REFBQTtBQUNBLEVBQUFBLHdEQUFBO0FBQ0EsRUFBQUEsd0RBQUE7QUFIaUIsU0FBQUE7QUFBQSxHQUFBO0FBTVgsTUFBTTtBQUFBO0FBQUEsRUFBaUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxxQkE0QnpCLHlCQUE0QztBQUFBO0FBQUE7QUFBQSxxQkFHNUMsY0FBaUM7QUFBQSxxQkFDakMsb0JBQXVDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBOyIsCiAgIm5hbWVzIjogWyJSZWN0YW5nbGVSZW5kZXJlckJpbmRpbmdJZCJdCn0K
