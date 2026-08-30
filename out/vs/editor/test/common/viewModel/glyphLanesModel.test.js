import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { GlyphMarginLanesModel } from "../../../common/viewModel/glyphLanesModel.js";
import { Range } from "../../../common/core/range.js";
import { GlyphMarginLane } from "../../../common/model.js";
suite("GlyphLanesModel", () => {
  let model;
  ensureNoDisposablesAreLeakedInTestSuite();
  const lineRange = (startLineNumber, endLineNumber) => new Range(startLineNumber, 1, endLineNumber, 1);
  const assertLines = (fromLine, n, expected) => {
    const result = [];
    for (let i = 0; i < n; i++) {
      result.push(model.getLanesAtLine(fromLine + i));
    }
    assert.deepStrictEqual(result, expected, `fromLine: ${fromLine}, n: ${n}`);
  };
  setup(() => {
    model = new GlyphMarginLanesModel(10);
  });
  test("handles empty", () => {
    assert.equal(model.requiredLanes, 1);
    assertLines(1, 1, [
      [GlyphMarginLane.Center]
    ]);
  });
  test("works with a single line range", () => {
    model.push(GlyphMarginLane.Left, lineRange(2, 3));
    assert.equal(model.requiredLanes, 1);
    assertLines(1, 5, [
      [GlyphMarginLane.Center],
      // 1
      [GlyphMarginLane.Left],
      // 2
      [GlyphMarginLane.Left],
      // 3
      [GlyphMarginLane.Center],
      // 4
      [GlyphMarginLane.Center]
      // 5
    ]);
  });
  test("persists ranges", () => {
    model.push(GlyphMarginLane.Left, lineRange(2, 3), true);
    assert.equal(model.requiredLanes, 1);
    assertLines(1, 5, [
      [GlyphMarginLane.Left],
      // 1
      [GlyphMarginLane.Left],
      // 2
      [GlyphMarginLane.Left],
      // 3
      [GlyphMarginLane.Left],
      // 4
      [GlyphMarginLane.Left]
      // 5
    ]);
  });
  test("handles overlaps", () => {
    model.push(GlyphMarginLane.Left, lineRange(6, 9));
    model.push(GlyphMarginLane.Right, lineRange(5, 7));
    model.push(GlyphMarginLane.Center, lineRange(7, 8));
    assert.equal(model.requiredLanes, 3);
    assertLines(5, 6, [
      [GlyphMarginLane.Right],
      // 5
      [GlyphMarginLane.Left, GlyphMarginLane.Right],
      // 6
      [GlyphMarginLane.Left, GlyphMarginLane.Center, GlyphMarginLane.Right],
      // 7
      [GlyphMarginLane.Left, GlyphMarginLane.Center],
      // 8
      [GlyphMarginLane.Left],
      // 9
      [GlyphMarginLane.Center]
      // 10
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcdmlld01vZGVsXFxnbHlwaExhbmVzTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgR2x5cGhNYXJnaW5MYW5lc01vZGVsLCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvZ2x5cGhMYW5lc01vZGVsLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgR2x5cGhNYXJnaW5MYW5lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcblxuc3VpdGUoJ0dseXBoTGFuZXNNb2RlbCcsICgpID0+IHtcblx0bGV0IG1vZGVsOiBHbHlwaE1hcmdpbkxhbmVzTW9kZWw7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgbGluZVJhbmdlID0gKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIpID0+IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIDEsIGVuZExpbmVOdW1iZXIsIDEpO1xuXHRjb25zdCBhc3NlcnRMaW5lcyA9IChmcm9tTGluZTogbnVtYmVyLCBuOiBudW1iZXIsIGV4cGVjdGVkOiBHbHlwaE1hcmdpbkxhbmVbXVtdKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBHbHlwaE1hcmdpbkxhbmVbXVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcblx0XHRcdHJlc3VsdC5wdXNoKG1vZGVsLmdldExhbmVzQXRMaW5lKGZyb21MaW5lICsgaSkpO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWQsIGBmcm9tTGluZTogJHtmcm9tTGluZX0sIG46ICR7bn1gKTtcblx0fTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9kZWwgPSBuZXcgR2x5cGhNYXJnaW5MYW5lc01vZGVsKDEwKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBlbXB0eScsICgpID0+IHtcblx0XHRhc3NlcnQuZXF1YWwobW9kZWwucmVxdWlyZWRMYW5lcywgMSk7XG5cdFx0YXNzZXJ0TGluZXMoMSwgMSwgW1xuXHRcdFx0W0dseXBoTWFyZ2luTGFuZS5DZW50ZXJdLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JrcyB3aXRoIGEgc2luZ2xlIGxpbmUgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0bW9kZWwucHVzaChHbHlwaE1hcmdpbkxhbmUuTGVmdCwgbGluZVJhbmdlKDIsIDMpKTtcblx0XHRhc3NlcnQuZXF1YWwobW9kZWwucmVxdWlyZWRMYW5lcywgMSk7XG5cdFx0YXNzZXJ0TGluZXMoMSwgNSwgW1xuXHRcdFx0W0dseXBoTWFyZ2luTGFuZS5DZW50ZXJdLCAvLyAxXG5cdFx0XHRbR2x5cGhNYXJnaW5MYW5lLkxlZnRdLCAvLyAyXG5cdFx0XHRbR2x5cGhNYXJnaW5MYW5lLkxlZnRdLCAvLyAzXG5cdFx0XHRbR2x5cGhNYXJnaW5MYW5lLkNlbnRlcl0sIC8vIDRcblx0XHRcdFtHbHlwaE1hcmdpbkxhbmUuQ2VudGVyXSwgLy8gNVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyByYW5nZXMnLCAoKSA9PiB7XG5cdFx0bW9kZWwucHVzaChHbHlwaE1hcmdpbkxhbmUuTGVmdCwgbGluZVJhbmdlKDIsIDMpLCB0cnVlKTtcblx0XHRhc3NlcnQuZXF1YWwobW9kZWwucmVxdWlyZWRMYW5lcywgMSk7XG5cdFx0YXNzZXJ0TGluZXMoMSwgNSwgW1xuXHRcdFx0W0dseXBoTWFyZ2luTGFuZS5MZWZ0XSwgLy8gMVxuXHRcdFx0W0dseXBoTWFyZ2luTGFuZS5MZWZ0XSwgLy8gMlxuXHRcdFx0W0dseXBoTWFyZ2luTGFuZS5MZWZ0XSwgLy8gM1xuXHRcdFx0W0dseXBoTWFyZ2luTGFuZS5MZWZ0XSwgLy8gNFxuXHRcdFx0W0dseXBoTWFyZ2luTGFuZS5MZWZ0XSwgLy8gNVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG92ZXJsYXBzJywgKCkgPT4ge1xuXHRcdG1vZGVsLnB1c2goR2x5cGhNYXJnaW5MYW5lLkxlZnQsIGxpbmVSYW5nZSg2LCA5KSk7XG5cdFx0bW9kZWwucHVzaChHbHlwaE1hcmdpbkxhbmUuUmlnaHQsIGxpbmVSYW5nZSg1LCA3KSk7XG5cdFx0bW9kZWwucHVzaChHbHlwaE1hcmdpbkxhbmUuQ2VudGVyLCBsaW5lUmFuZ2UoNywgOCkpO1xuXHRcdGFzc2VydC5lcXVhbChtb2RlbC5yZXF1aXJlZExhbmVzLCAzKTtcblx0XHRhc3NlcnRMaW5lcyg1LCA2LCBbXG5cdFx0XHRbR2x5cGhNYXJnaW5MYW5lLlJpZ2h0XSwgLy8gNVxuXHRcdFx0W0dseXBoTWFyZ2luTGFuZS5MZWZ0LCBHbHlwaE1hcmdpbkxhbmUuUmlnaHRdLCAvLyA2XG5cdFx0XHRbR2x5cGhNYXJnaW5MYW5lLkxlZnQsIEdseXBoTWFyZ2luTGFuZS5DZW50ZXIsIEdseXBoTWFyZ2luTGFuZS5SaWdodF0sIC8vIDdcblx0XHRcdFtHbHlwaE1hcmdpbkxhbmUuTGVmdCwgR2x5cGhNYXJnaW5MYW5lLkNlbnRlcl0sIC8vIDhcblx0XHRcdFtHbHlwaE1hcmdpbkxhbmUuTGVmdF0sIC8vIDlcblx0XHRcdFtHbHlwaE1hcmdpbkxhbmUuQ2VudGVyXSwgLy8gMTBcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE4QjtBQUN2QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QixNQUFJO0FBRUosMENBQXdDO0FBRXhDLFFBQU0sWUFBWSxDQUFDLGlCQUF5QixrQkFBMEIsSUFBSSxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBQztBQUNwSCxRQUFNLGNBQWMsQ0FBQyxVQUFrQixHQUFXLGFBQWtDO0FBQ25GLFVBQU0sU0FBOEIsQ0FBQztBQUNyQyxhQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMzQixhQUFPLEtBQUssTUFBTSxlQUFlLFdBQVcsQ0FBQyxDQUFDO0FBQUEsSUFDL0M7QUFDQSxXQUFPLGdCQUFnQixRQUFRLFVBQVUsYUFBYSxRQUFRLFFBQVEsQ0FBQyxFQUFFO0FBQUEsRUFDMUU7QUFFQSxRQUFNLE1BQU07QUFDWCxZQUFRLElBQUksc0JBQXNCLEVBQUU7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSyxpQkFBaUIsTUFBTTtBQUMzQixXQUFPLE1BQU0sTUFBTSxlQUFlLENBQUM7QUFDbkMsZ0JBQVksR0FBRyxHQUFHO0FBQUEsTUFDakIsQ0FBQyxnQkFBZ0IsTUFBTTtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDLFVBQU0sS0FBSyxnQkFBZ0IsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQ2hELFdBQU8sTUFBTSxNQUFNLGVBQWUsQ0FBQztBQUNuQyxnQkFBWSxHQUFHLEdBQUc7QUFBQSxNQUNqQixDQUFDLGdCQUFnQixNQUFNO0FBQUE7QUFBQSxNQUN2QixDQUFDLGdCQUFnQixJQUFJO0FBQUE7QUFBQSxNQUNyQixDQUFDLGdCQUFnQixJQUFJO0FBQUE7QUFBQSxNQUNyQixDQUFDLGdCQUFnQixNQUFNO0FBQUE7QUFBQSxNQUN2QixDQUFDLGdCQUFnQixNQUFNO0FBQUE7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtQkFBbUIsTUFBTTtBQUM3QixVQUFNLEtBQUssZ0JBQWdCLE1BQU0sVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJO0FBQ3RELFdBQU8sTUFBTSxNQUFNLGVBQWUsQ0FBQztBQUNuQyxnQkFBWSxHQUFHLEdBQUc7QUFBQSxNQUNqQixDQUFDLGdCQUFnQixJQUFJO0FBQUE7QUFBQSxNQUNyQixDQUFDLGdCQUFnQixJQUFJO0FBQUE7QUFBQSxNQUNyQixDQUFDLGdCQUFnQixJQUFJO0FBQUE7QUFBQSxNQUNyQixDQUFDLGdCQUFnQixJQUFJO0FBQUE7QUFBQSxNQUNyQixDQUFDLGdCQUFnQixJQUFJO0FBQUE7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvQkFBb0IsTUFBTTtBQUM5QixVQUFNLEtBQUssZ0JBQWdCLE1BQU0sVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNoRCxVQUFNLEtBQUssZ0JBQWdCLE9BQU8sVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNqRCxVQUFNLEtBQUssZ0JBQWdCLFFBQVEsVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNsRCxXQUFPLE1BQU0sTUFBTSxlQUFlLENBQUM7QUFDbkMsZ0JBQVksR0FBRyxHQUFHO0FBQUEsTUFDakIsQ0FBQyxnQkFBZ0IsS0FBSztBQUFBO0FBQUEsTUFDdEIsQ0FBQyxnQkFBZ0IsTUFBTSxnQkFBZ0IsS0FBSztBQUFBO0FBQUEsTUFDNUMsQ0FBQyxnQkFBZ0IsTUFBTSxnQkFBZ0IsUUFBUSxnQkFBZ0IsS0FBSztBQUFBO0FBQUEsTUFDcEUsQ0FBQyxnQkFBZ0IsTUFBTSxnQkFBZ0IsTUFBTTtBQUFBO0FBQUEsTUFDN0MsQ0FBQyxnQkFBZ0IsSUFBSTtBQUFBO0FBQUEsTUFDckIsQ0FBQyxnQkFBZ0IsTUFBTTtBQUFBO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
