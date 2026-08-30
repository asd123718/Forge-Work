import * as assert from "assert";
import { computeDefaultDocumentColors } from "../../../common/languages/defaultDocumentColorsComputer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("Default Document Colors Computer", () => {
  class TestDocumentModel {
    constructor(content) {
      this.content = content;
    }
    getValue() {
      return this.content;
    }
    positionAt(offset) {
      const lines = this.content.substring(0, offset).split("\n");
      return {
        lineNumber: lines.length,
        column: lines[lines.length - 1].length + 1
      };
    }
    findMatches(regex) {
      return [...this.content.matchAll(regex)];
    }
  }
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Hex colors in strings should be detected", () => {
    const model = new TestDocumentModel(`const color = '#ff0000';`);
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hex color");
    assert.strictEqual(colors[0].color.red, 1, "Red component should be 1 (255/255)");
    assert.strictEqual(colors[0].color.green, 0, "Green component should be 0");
    assert.strictEqual(colors[0].color.blue, 0, "Blue component should be 0");
    assert.strictEqual(colors[0].color.alpha, 1, "Alpha should be 1");
  });
  test("Hex colors in double quotes should be detected", () => {
    const model = new TestDocumentModel('const color = "#00ff00";');
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hex color");
    assert.strictEqual(colors[0].color.red, 0, "Red component should be 0");
    assert.strictEqual(colors[0].color.green, 1, "Green component should be 1 (255/255)");
    assert.strictEqual(colors[0].color.blue, 0, "Blue component should be 0");
  });
  test("Multiple hex colors in array should be detected", () => {
    const model = new TestDocumentModel(`const colors = ['#ff0000', '#00ff00', '#0000ff'];`);
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 3, "Should detect three hex colors");
    assert.strictEqual(colors[0].color.red, 1, "First color red component should be 1");
    assert.strictEqual(colors[0].color.green, 0, "First color green component should be 0");
    assert.strictEqual(colors[0].color.blue, 0, "First color blue component should be 0");
    assert.strictEqual(colors[1].color.red, 0, "Second color red component should be 0");
    assert.strictEqual(colors[1].color.green, 1, "Second color green component should be 1");
    assert.strictEqual(colors[1].color.blue, 0, "Second color blue component should be 0");
    assert.strictEqual(colors[2].color.red, 0, "Third color red component should be 0");
    assert.strictEqual(colors[2].color.green, 0, "Third color green component should be 0");
    assert.strictEqual(colors[2].color.blue, 1, "Third color blue component should be 1");
  });
  test("Existing functionality should still work", () => {
    const testCases = [
      { content: `const color = ' #ff0000';`, name: "hex with space before" },
      { content: "#ff0000", name: "hex at start of line" },
      { content: "  #ff0000", name: "hex with whitespace before" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(testCase.content);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should still detect ${testCase.name}`);
    });
  });
  test("8-digit hex colors should also work", () => {
    const model = new TestDocumentModel(`const color = '#ff0000ff';`);
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one 8-digit hex color");
    assert.strictEqual(colors[0].color.red, 1, "Red component should be 1");
    assert.strictEqual(colors[0].color.green, 0, "Green component should be 0");
    assert.strictEqual(colors[0].color.blue, 0, "Blue component should be 0");
    assert.strictEqual(colors[0].color.alpha, 1, "Alpha should be 1 (ff/255)");
  });
  test("hsl 100 percent saturation works with decimals", () => {
    const model = new TestDocumentModel("const color = hsl(253, 100.00%, 47.10%);");
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hsl color");
  });
  test("hsl 100 percent saturation works without decimals", () => {
    const model = new TestDocumentModel("const color = hsl(253, 100%, 47.10%);");
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hsl color");
  });
  test("hsl not 100 percent saturation should also work", () => {
    const model = new TestDocumentModel("const color = hsl(0, 83.60%, 47.80%);");
    const colors = computeDefaultDocumentColors(model);
    assert.strictEqual(colors.length, 1, "Should detect one hsl color");
  });
  test("hsl with decimal hue values should work", () => {
    const testCases = [
      { content: "hsl(253.5, 100%, 50%)", name: "decimal hue" },
      { content: "hsl(360.0, 50%, 50%)", name: "360.0 hue" },
      { content: "hsl(100.5, 50.5%, 50.5%)", name: "all decimals" },
      { content: "hsl(0.5, 50%, 50%)", name: "small decimal hue" },
      { content: "hsl(359.9, 100%, 50%)", name: "near-max decimal hue" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(`const color = ${testCase.content};`);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should detect hsl color with ${testCase.name}: ${testCase.content}`);
    });
  });
  test("hsla with decimal values should work", () => {
    const testCases = [
      { content: "hsla(253.5, 100%, 50%, 0.5)", name: "decimal hue with alpha" },
      { content: "hsla(360.0, 50.5%, 50.5%, 1)", name: "all decimals with alpha 1" },
      { content: "hsla(0.5, 50%, 50%, 0.25)", name: "small decimal hue with alpha" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(`const color = ${testCase.content};`);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should detect hsla color with ${testCase.name}: ${testCase.content}`);
    });
  });
  test("hsl with space separator (CSS Level 4 syntax) should work", () => {
    const testCases = [
      { content: "hsl(253 100% 50%)", name: "space-separated" },
      { content: "hsl(253.5 100% 50%)", name: "space-separated with decimal hue" },
      { content: "hsla(253 100% 50% / 0.5)", name: "hsla with slash separator for alpha" },
      { content: "hsla(253.5 100% 50% / 0.5)", name: "hsla with decimal hue and slash separator" },
      { content: "hsla(253 100% 50% / 1)", name: "hsla with slash and alpha 1" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(`const color = ${testCase.content};`);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should detect hsl color with ${testCase.name}: ${testCase.content}`);
    });
  });
  test("rgb and rgba with CSS Level 4 space-separated syntax should work", () => {
    const testCases = [
      { content: "rgb(255 0 0)", name: "rgb space-separated" },
      { content: "rgb(128 128 128)", name: "rgb space-separated gray" },
      { content: "rgba(255 0 0 / 0.5)", name: "rgba with slash separator for alpha" },
      { content: "rgba(128 128 128 / 0.8)", name: "rgba gray with slash separator" },
      { content: "rgba(255 0 0 / 1)", name: "rgba with slash and alpha 1" },
      // Traditional comma syntax should still work
      { content: "rgb(255, 0, 0)", name: "rgb comma-separated (traditional)" },
      { content: "rgba(255, 0, 0, 0.5)", name: "rgba comma-separated (traditional)" }
    ];
    testCases.forEach((testCase) => {
      const model = new TestDocumentModel(`const color = ${testCase.content};`);
      const colors = computeDefaultDocumentColors(model);
      assert.strictEqual(colors.length, 1, `Should detect rgb/rgba color with ${testCase.name}: ${testCase.content}`);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbGFuZ3VhZ2VzXFxkZWZhdWx0RG9jdW1lbnRDb2xvcnNDb21wdXRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvZGVmYXVsdERvY3VtZW50Q29sb3JzQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdEZWZhdWx0IERvY3VtZW50IENvbG9ycyBDb21wdXRlcicsICgpID0+IHtcblxuXHRjbGFzcyBUZXN0RG9jdW1lbnRNb2RlbCB7XG5cdFx0Y29uc3RydWN0b3IocHJpdmF0ZSBjb250ZW50OiBzdHJpbmcpIHsgfVxuXG5cdFx0Z2V0VmFsdWUoKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbnRlbnQ7XG5cdFx0fVxuXG5cdFx0cG9zaXRpb25BdChvZmZzZXQ6IG51bWJlcikge1xuXHRcdFx0Y29uc3QgbGluZXMgPSB0aGlzLmNvbnRlbnQuc3Vic3RyaW5nKDAsIG9mZnNldCkuc3BsaXQoJ1xcbicpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGluZU51bWJlcjogbGluZXMubGVuZ3RoLFxuXHRcdFx0XHRjb2x1bW46IGxpbmVzW2xpbmVzLmxlbmd0aCAtIDFdLmxlbmd0aCArIDFcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZmluZE1hdGNoZXMocmVnZXg6IFJlZ0V4cCk6IFJlZ0V4cE1hdGNoQXJyYXlbXSB7XG5cdFx0XHRyZXR1cm4gWy4uLnRoaXMuY29udGVudC5tYXRjaEFsbChyZWdleCldO1xuXHRcdH1cblx0fVxuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0hleCBjb2xvcnMgaW4gc3RyaW5ncyBzaG91bGQgYmUgZGV0ZWN0ZWQnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlIGZyb20gaXNzdWU6IGhleCBjb2xvciBpbnNpZGUgc3RyaW5nIGlzIG5vdCBkZXRlY3RlZFxuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKGBjb25zdCBjb2xvciA9ICcjZmYwMDAwJztgKTtcblx0XHRjb25zdCBjb2xvcnMgPSBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnMubGVuZ3RoLCAxLCAnU2hvdWxkIGRldGVjdCBvbmUgaGV4IGNvbG9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1swXS5jb2xvci5yZWQsIDEsICdSZWQgY29tcG9uZW50IHNob3VsZCBiZSAxICgyNTUvMjU1KScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IuZ3JlZW4sIDAsICdHcmVlbiBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmJsdWUsIDAsICdCbHVlIGNvbXBvbmVudCBzaG91bGQgYmUgMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IuYWxwaGEsIDEsICdBbHBoYSBzaG91bGQgYmUgMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdIZXggY29sb3JzIGluIGRvdWJsZSBxdW90ZXMgc2hvdWxkIGJlIGRldGVjdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKCdjb25zdCBjb2xvciA9IFwiIzAwZmYwMFwiOycpO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5sZW5ndGgsIDEsICdTaG91bGQgZGV0ZWN0IG9uZSBoZXggY29sb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLnJlZCwgMCwgJ1JlZCBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmdyZWVuLCAxLCAnR3JlZW4gY29tcG9uZW50IHNob3VsZCBiZSAxICgyNTUvMjU1KScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IuYmx1ZSwgMCwgJ0JsdWUgY29tcG9uZW50IHNob3VsZCBiZSAwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcGxlIGhleCBjb2xvcnMgaW4gYXJyYXkgc2hvdWxkIGJlIGRldGVjdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKGBjb25zdCBjb2xvcnMgPSBbJyNmZjAwMDAnLCAnIzAwZmYwMCcsICcjMDAwMGZmJ107YCk7XG5cdFx0Y29uc3QgY29sb3JzID0gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLmxlbmd0aCwgMywgJ1Nob3VsZCBkZXRlY3QgdGhyZWUgaGV4IGNvbG9ycycpO1xuXG5cdFx0Ly8gRmlyc3QgY29sb3I6IHJlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IucmVkLCAxLCAnRmlyc3QgY29sb3IgcmVkIGNvbXBvbmVudCBzaG91bGQgYmUgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IuZ3JlZW4sIDAsICdGaXJzdCBjb2xvciBncmVlbiBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmJsdWUsIDAsICdGaXJzdCBjb2xvciBibHVlIGNvbXBvbmVudCBzaG91bGQgYmUgMCcpO1xuXG5cdFx0Ly8gU2Vjb25kIGNvbG9yOiBncmVlblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMV0uY29sb3IucmVkLCAwLCAnU2Vjb25kIGNvbG9yIHJlZCBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzFdLmNvbG9yLmdyZWVuLCAxLCAnU2Vjb25kIGNvbG9yIGdyZWVuIGNvbXBvbmVudCBzaG91bGQgYmUgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMV0uY29sb3IuYmx1ZSwgMCwgJ1NlY29uZCBjb2xvciBibHVlIGNvbXBvbmVudCBzaG91bGQgYmUgMCcpO1xuXG5cdFx0Ly8gVGhpcmQgY29sb3I6IGJsdWVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzJdLmNvbG9yLnJlZCwgMCwgJ1RoaXJkIGNvbG9yIHJlZCBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzJdLmNvbG9yLmdyZWVuLCAwLCAnVGhpcmQgY29sb3IgZ3JlZW4gY29tcG9uZW50IHNob3VsZCBiZSAwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9yc1syXS5jb2xvci5ibHVlLCAxLCAnVGhpcmQgY29sb3IgYmx1ZSBjb21wb25lbnQgc2hvdWxkIGJlIDEnKTtcblx0fSk7XG5cblx0dGVzdCgnRXhpc3RpbmcgZnVuY3Rpb25hbGl0eSBzaG91bGQgc3RpbGwgd29yaycsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIHRoYXQgd2VyZSBhbHJlYWR5IHdvcmtpbmdcblx0XHRjb25zdCB0ZXN0Q2FzZXMgPSBbXG5cdFx0XHR7IGNvbnRlbnQ6IGBjb25zdCBjb2xvciA9ICcgI2ZmMDAwMCc7YCwgbmFtZTogJ2hleCB3aXRoIHNwYWNlIGJlZm9yZScgfSxcblx0XHRcdHsgY29udGVudDogJyNmZjAwMDAnLCBuYW1lOiAnaGV4IGF0IHN0YXJ0IG9mIGxpbmUnIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICcgICNmZjAwMDAnLCBuYW1lOiAnaGV4IHdpdGggd2hpdGVzcGFjZSBiZWZvcmUnIH1cblx0XHRdO1xuXG5cdFx0dGVzdENhc2VzLmZvckVhY2godGVzdENhc2UgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdERvY3VtZW50TW9kZWwodGVzdENhc2UuY29udGVudCk7XG5cdFx0XHRjb25zdCBjb2xvcnMgPSBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnMubGVuZ3RoLCAxLCBgU2hvdWxkIHN0aWxsIGRldGVjdCAke3Rlc3RDYXNlLm5hbWV9YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJzgtZGlnaXQgaGV4IGNvbG9ycyBzaG91bGQgYWxzbyB3b3JrJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKGBjb25zdCBjb2xvciA9ICcjZmYwMDAwZmYnO2ApO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5sZW5ndGgsIDEsICdTaG91bGQgZGV0ZWN0IG9uZSA4LWRpZ2l0IGhleCBjb2xvcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IucmVkLCAxLCAnUmVkIGNvbXBvbmVudCBzaG91bGQgYmUgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IuZ3JlZW4sIDAsICdHcmVlbiBjb21wb25lbnQgc2hvdWxkIGJlIDAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzWzBdLmNvbG9yLmJsdWUsIDAsICdCbHVlIGNvbXBvbmVudCBzaG91bGQgYmUgMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnNbMF0uY29sb3IuYWxwaGEsIDEsICdBbHBoYSBzaG91bGQgYmUgMSAoZmYvMjU1KScpO1xuXHR9KTtcblxuXHR0ZXN0KCdoc2wgMTAwIHBlcmNlbnQgc2F0dXJhdGlvbiB3b3JrcyB3aXRoIGRlY2ltYWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKCdjb25zdCBjb2xvciA9IGhzbCgyNTMsIDEwMC4wMCUsIDQ3LjEwJSk7Jyk7XG5cdFx0Y29uc3QgY29sb3JzID0gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLmxlbmd0aCwgMSwgJ1Nob3VsZCBkZXRlY3Qgb25lIGhzbCBjb2xvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdoc2wgMTAwIHBlcmNlbnQgc2F0dXJhdGlvbiB3b3JrcyB3aXRob3V0IGRlY2ltYWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKCdjb25zdCBjb2xvciA9IGhzbCgyNTMsIDEwMCUsIDQ3LjEwJSk7Jyk7XG5cdFx0Y29uc3QgY29sb3JzID0gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLmxlbmd0aCwgMSwgJ1Nob3VsZCBkZXRlY3Qgb25lIGhzbCBjb2xvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdoc2wgbm90IDEwMCBwZXJjZW50IHNhdHVyYXRpb24gc2hvdWxkIGFsc28gd29yaycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbCgnY29uc3QgY29sb3IgPSBoc2woMCwgODMuNjAlLCA0Ny44MCUpOycpO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5sZW5ndGgsIDEsICdTaG91bGQgZGV0ZWN0IG9uZSBoc2wgY29sb3InKTtcblx0fSk7XG5cblx0dGVzdCgnaHNsIHdpdGggZGVjaW1hbCBodWUgdmFsdWVzIHNob3VsZCB3b3JrJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZSBmcm9tIGlzc3VlICMxODA0MzYgY29tbWVudFxuXHRcdGNvbnN0IHRlc3RDYXNlcyA9IFtcblx0XHRcdHsgY29udGVudDogJ2hzbCgyNTMuNSwgMTAwJSwgNTAlKScsIG5hbWU6ICdkZWNpbWFsIGh1ZScgfSxcblx0XHRcdHsgY29udGVudDogJ2hzbCgzNjAuMCwgNTAlLCA1MCUpJywgbmFtZTogJzM2MC4wIGh1ZScgfSxcblx0XHRcdHsgY29udGVudDogJ2hzbCgxMDAuNSwgNTAuNSUsIDUwLjUlKScsIG5hbWU6ICdhbGwgZGVjaW1hbHMnIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2woMC41LCA1MCUsIDUwJSknLCBuYW1lOiAnc21hbGwgZGVjaW1hbCBodWUnIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2woMzU5LjksIDEwMCUsIDUwJSknLCBuYW1lOiAnbmVhci1tYXggZGVjaW1hbCBodWUnIH1cblx0XHRdO1xuXG5cdFx0dGVzdENhc2VzLmZvckVhY2godGVzdENhc2UgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdERvY3VtZW50TW9kZWwoYGNvbnN0IGNvbG9yID0gJHt0ZXN0Q2FzZS5jb250ZW50fTtgKTtcblx0XHRcdGNvbnN0IGNvbG9ycyA9IGNvbXB1dGVEZWZhdWx0RG9jdW1lbnRDb2xvcnMobW9kZWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbG9ycy5sZW5ndGgsIDEsIGBTaG91bGQgZGV0ZWN0IGhzbCBjb2xvciB3aXRoICR7dGVzdENhc2UubmFtZX06ICR7dGVzdENhc2UuY29udGVudH1gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaHNsYSB3aXRoIGRlY2ltYWwgdmFsdWVzIHNob3VsZCB3b3JrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RDYXNlcyA9IFtcblx0XHRcdHsgY29udGVudDogJ2hzbGEoMjUzLjUsIDEwMCUsIDUwJSwgMC41KScsIG5hbWU6ICdkZWNpbWFsIGh1ZSB3aXRoIGFscGhhJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnaHNsYSgzNjAuMCwgNTAuNSUsIDUwLjUlLCAxKScsIG5hbWU6ICdhbGwgZGVjaW1hbHMgd2l0aCBhbHBoYSAxJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnaHNsYSgwLjUsIDUwJSwgNTAlLCAwLjI1KScsIG5hbWU6ICdzbWFsbCBkZWNpbWFsIGh1ZSB3aXRoIGFscGhhJyB9XG5cdFx0XTtcblxuXHRcdHRlc3RDYXNlcy5mb3JFYWNoKHRlc3RDYXNlID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKGBjb25zdCBjb2xvciA9ICR7dGVzdENhc2UuY29udGVudH07YCk7XG5cdFx0XHRjb25zdCBjb2xvcnMgPSBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnMubGVuZ3RoLCAxLCBgU2hvdWxkIGRldGVjdCBoc2xhIGNvbG9yIHdpdGggJHt0ZXN0Q2FzZS5uYW1lfTogJHt0ZXN0Q2FzZS5jb250ZW50fWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoc2wgd2l0aCBzcGFjZSBzZXBhcmF0b3IgKENTUyBMZXZlbCA0IHN5bnRheCkgc2hvdWxkIHdvcmsnLCAoKSA9PiB7XG5cdFx0Ly8gQ1NTIExldmVsIDQgYWxsb3dzIHNwYWNlLXNlcGFyYXRlZCB2YWx1ZXMgaW5zdGVhZCBvZiBjb21tYS1zZXBhcmF0ZWRcblx0XHRjb25zdCB0ZXN0Q2FzZXMgPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2woMjUzIDEwMCUgNTAlKScsIG5hbWU6ICdzcGFjZS1zZXBhcmF0ZWQnIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2woMjUzLjUgMTAwJSA1MCUpJywgbmFtZTogJ3NwYWNlLXNlcGFyYXRlZCB3aXRoIGRlY2ltYWwgaHVlJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnaHNsYSgyNTMgMTAwJSA1MCUgLyAwLjUpJywgbmFtZTogJ2hzbGEgd2l0aCBzbGFzaCBzZXBhcmF0b3IgZm9yIGFscGhhJyB9LFxuXHRcdFx0eyBjb250ZW50OiAnaHNsYSgyNTMuNSAxMDAlIDUwJSAvIDAuNSknLCBuYW1lOiAnaHNsYSB3aXRoIGRlY2ltYWwgaHVlIGFuZCBzbGFzaCBzZXBhcmF0b3InIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdoc2xhKDI1MyAxMDAlIDUwJSAvIDEpJywgbmFtZTogJ2hzbGEgd2l0aCBzbGFzaCBhbmQgYWxwaGEgMScgfVxuXHRcdF07XG5cblx0XHR0ZXN0Q2FzZXMuZm9yRWFjaCh0ZXN0Q2FzZSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0RG9jdW1lbnRNb2RlbChgY29uc3QgY29sb3IgPSAke3Rlc3RDYXNlLmNvbnRlbnR9O2ApO1xuXHRcdFx0Y29uc3QgY29sb3JzID0gY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyhtb2RlbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sb3JzLmxlbmd0aCwgMSwgYFNob3VsZCBkZXRlY3QgaHNsIGNvbG9yIHdpdGggJHt0ZXN0Q2FzZS5uYW1lfTogJHt0ZXN0Q2FzZS5jb250ZW50fWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZ2IgYW5kIHJnYmEgd2l0aCBDU1MgTGV2ZWwgNCBzcGFjZS1zZXBhcmF0ZWQgc3ludGF4IHNob3VsZCB3b3JrJywgKCkgPT4ge1xuXHRcdC8vIENTUyBMZXZlbCA0IGFsbG93cyBzcGFjZS1zZXBhcmF0ZWQgdmFsdWVzIGZvciBSR0IvUkdCQVxuXHRcdGNvbnN0IHRlc3RDYXNlcyA9IFtcblx0XHRcdHsgY29udGVudDogJ3JnYigyNTUgMCAwKScsIG5hbWU6ICdyZ2Igc3BhY2Utc2VwYXJhdGVkJyB9LFxuXHRcdFx0eyBjb250ZW50OiAncmdiKDEyOCAxMjggMTI4KScsIG5hbWU6ICdyZ2Igc3BhY2Utc2VwYXJhdGVkIGdyYXknIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdyZ2JhKDI1NSAwIDAgLyAwLjUpJywgbmFtZTogJ3JnYmEgd2l0aCBzbGFzaCBzZXBhcmF0b3IgZm9yIGFscGhhJyB9LFxuXHRcdFx0eyBjb250ZW50OiAncmdiYSgxMjggMTI4IDEyOCAvIDAuOCknLCBuYW1lOiAncmdiYSBncmF5IHdpdGggc2xhc2ggc2VwYXJhdG9yJyB9LFxuXHRcdFx0eyBjb250ZW50OiAncmdiYSgyNTUgMCAwIC8gMSknLCBuYW1lOiAncmdiYSB3aXRoIHNsYXNoIGFuZCBhbHBoYSAxJyB9LFxuXHRcdFx0Ly8gVHJhZGl0aW9uYWwgY29tbWEgc3ludGF4IHNob3VsZCBzdGlsbCB3b3JrXG5cdFx0XHR7IGNvbnRlbnQ6ICdyZ2IoMjU1LCAwLCAwKScsIG5hbWU6ICdyZ2IgY29tbWEtc2VwYXJhdGVkICh0cmFkaXRpb25hbCknIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdyZ2JhKDI1NSwgMCwgMCwgMC41KScsIG5hbWU6ICdyZ2JhIGNvbW1hLXNlcGFyYXRlZCAodHJhZGl0aW9uYWwpJyB9XG5cdFx0XTtcblxuXHRcdHRlc3RDYXNlcy5mb3JFYWNoKHRlc3RDYXNlID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3REb2N1bWVudE1vZGVsKGBjb25zdCBjb2xvciA9ICR7dGVzdENhc2UuY29udGVudH07YCk7XG5cdFx0XHRjb25zdCBjb2xvcnMgPSBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xvcnMubGVuZ3RoLCAxLCBgU2hvdWxkIGRldGVjdCByZ2IvcmdiYSBjb2xvciB3aXRoICR7dGVzdENhc2UubmFtZX06ICR7dGVzdENhc2UuY29udGVudH1gKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFlBQVksWUFBWTtBQUN4QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLG9DQUFvQyxNQUFNO0FBQUEsRUFFL0MsTUFBTSxrQkFBa0I7QUFBQSxJQUN2QixZQUFvQixTQUFpQjtBQUFqQjtBQUFBLElBQW1CO0FBQUEsSUFFdkMsV0FBbUI7QUFDbEIsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLElBRUEsV0FBVyxRQUFnQjtBQUMxQixZQUFNLFFBQVEsS0FBSyxRQUFRLFVBQVUsR0FBRyxNQUFNLEVBQUUsTUFBTSxJQUFJO0FBQzFELGFBQU87QUFBQSxRQUNOLFlBQVksTUFBTTtBQUFBLFFBQ2xCLFFBQVEsTUFBTSxNQUFNLFNBQVMsQ0FBQyxFQUFFLFNBQVM7QUFBQSxNQUMxQztBQUFBLElBQ0Q7QUFBQSxJQUVBLFlBQVksT0FBbUM7QUFDOUMsYUFBTyxDQUFDLEdBQUcsS0FBSyxRQUFRLFNBQVMsS0FBSyxDQUFDO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBRUEsMENBQXdDO0FBRXhDLE9BQUssNENBQTRDLE1BQU07QUFFdEQsVUFBTSxRQUFRLElBQUksa0JBQWtCLDBCQUEwQjtBQUM5RCxVQUFNLFNB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
