import assert from "assert";
import { Position } from "../../../../common/core/position.js";
import { getSecondaryEdits } from "../../browser/model/inlineCompletionsModel.js";
import { TextEdit, TextReplacement } from "../../../../common/core/edits/textEdit.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { Range } from "../../../../common/core/range.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { isDefined } from "../../../../../base/common/types.js";
suite("getSecondaryEdits", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("basic", async function() {
    const textModel = createTextModel([
      "function fib(",
      "function fib("
    ].join("\n"));
    const positions = [
      new Position(1, 14),
      new Position(2, 14)
    ];
    const primaryEdit = new TextReplacement(new Range(1, 1, 1, 14), "function fib() {");
    const secondaryEdits = getSecondaryEdits(textModel, positions, primaryEdit);
    assert.deepStrictEqual(secondaryEdits, [new TextReplacement(
      new Range(2, 14, 2, 14),
      ") {"
    )]);
    textModel.dispose();
  });
  test("cursor not on same line as primary edit 1", async function() {
    const textModel = createTextModel([
      "function fib(",
      "",
      "function fib(",
      ""
    ].join("\n"));
    const positions = [
      new Position(2, 1),
      new Position(4, 1)
    ];
    const primaryEdit = new TextReplacement(new Range(1, 1, 2, 1), [
      "function fib() {",
      "	return 0;",
      "}"
    ].join("\n"));
    const secondaryEdits = getSecondaryEdits(textModel, positions, primaryEdit);
    assert.deepStrictEqual(TextEdit.fromParallelReplacementsUnsorted(secondaryEdits.filter(isDefined)).toString(textModel.getValue()), "...ction fib(\u2770\n\u21A6) {\n	... 0;\n}\u2771");
    textModel.dispose();
  });
  test("cursor not on same line as primary edit 2", async function() {
    const textModel = createTextModel([
      "class A {",
      "",
      "class B {",
      "",
      "function f() {}"
    ].join("\n"));
    const positions = [
      new Position(2, 1),
      new Position(4, 1)
    ];
    const primaryEdit = new TextReplacement(new Range(1, 1, 2, 1), [
      "class A {",
      "	public x: number = 0;",
      "   public y: number = 0;",
      "}"
    ].join("\n"));
    const secondaryEdits = getSecondaryEdits(textModel, positions, primaryEdit);
    assert.deepStrictEqual(secondaryEdits, [new TextReplacement(
      new Range(4, 1, 4, 1),
      [
        "	public x: number = 0;",
        "   public y: number = 0;",
        "}"
      ].join("\n")
    )]);
    textModel.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFx0ZXN0XFxicm93c2VyXFxnZXRTZWNvbmRhcnlFZGl0cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0U2Vjb25kYXJ5RWRpdHMgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVsL2lubGluZUNvbXBsZXRpb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQsIFRleHRSZXBsYWNlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuc3VpdGUoJ2dldFNlY29uZGFyeUVkaXRzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Jhc2ljJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdmdW5jdGlvbiBmaWIoJyxcblx0XHRcdCdmdW5jdGlvbiBmaWIoJ1xuXHRcdF0uam9pbignXFxuJykpO1xuXHRcdGNvbnN0IHBvc2l0aW9ucyA9IFtcblx0XHRcdG5ldyBQb3NpdGlvbigxLCAxNCksXG5cdFx0XHRuZXcgUG9zaXRpb24oMiwgMTQpXG5cdFx0XTtcblx0XHRjb25zdCBwcmltYXJ5RWRpdCA9IG5ldyBUZXh0UmVwbGFjZW1lbnQobmV3IFJhbmdlKDEsIDEsIDEsIDE0KSwgJ2Z1bmN0aW9uIGZpYigpIHsnKTtcblx0XHRjb25zdCBzZWNvbmRhcnlFZGl0cyA9IGdldFNlY29uZGFyeUVkaXRzKHRleHRNb2RlbCwgcG9zaXRpb25zLCBwcmltYXJ5RWRpdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmRhcnlFZGl0cywgW25ldyBUZXh0UmVwbGFjZW1lbnQoXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMTQsIDIsIDE0KSxcblx0XHRcdCcpIHsnXG5cdFx0KV0pO1xuXHRcdHRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvciBub3Qgb24gc2FtZSBsaW5lIGFzIHByaW1hcnkgZWRpdCAxJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdmdW5jdGlvbiBmaWIoJyxcblx0XHRcdCcnLFxuXHRcdFx0J2Z1bmN0aW9uIGZpYignLFxuXHRcdFx0Jydcblx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRjb25zdCBwb3NpdGlvbnMgPSBbXG5cdFx0XHRuZXcgUG9zaXRpb24oMiwgMSksXG5cdFx0XHRuZXcgUG9zaXRpb24oNCwgMSlcblx0XHRdO1xuXHRcdGNvbnN0IHByaW1hcnlFZGl0ID0gbmV3IFRleHRSZXBsYWNlbWVudChuZXcgUmFuZ2UoMSwgMSwgMiwgMSksIFtcblx0XHRcdCdmdW5jdGlvbiBmaWIoKSB7Jyxcblx0XHRcdCdcdHJldHVybiAwOycsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRjb25zdCBzZWNvbmRhcnlFZGl0cyA9IGdldFNlY29uZGFyeUVkaXRzKHRleHRNb2RlbCwgcG9zaXRpb25zLCBwcmltYXJ5RWRpdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChUZXh0RWRpdC5mcm9tUGFyYWxsZWxSZXBsYWNlbWVudHNVbnNvcnRlZChzZWNvbmRhcnlFZGl0cy5maWx0ZXIoaXNEZWZpbmVkKSkudG9TdHJpbmcodGV4dE1vZGVsLmdldFZhbHVlKCkpLCAnLi4uY3Rpb24gZmliKFx1Mjc3MFxcblx1MjFBNikge1xcblxcdC4uLiAwO1xcbn1cdTI3NzEnKTtcblx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3Igbm90IG9uIHNhbWUgbGluZSBhcyBwcmltYXJ5IGVkaXQgMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnY2xhc3MgQSB7Jyxcblx0XHRcdCcnLFxuXHRcdFx0J2NsYXNzIEIgeycsXG5cdFx0XHQnJyxcblx0XHRcdCdmdW5jdGlvbiBmKCkge30nXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0Y29uc3QgcG9zaXRpb25zID0gW1xuXHRcdFx0bmV3IFBvc2l0aW9uKDIsIDEpLFxuXHRcdFx0bmV3IFBvc2l0aW9uKDQsIDEpXG5cdFx0XTtcblx0XHRjb25zdCBwcmltYXJ5RWRpdCA9IG5ldyBUZXh0UmVwbGFjZW1lbnQobmV3IFJhbmdlKDEsIDEsIDIsIDEpLCBbXG5cdFx0XHQnY2xhc3MgQSB7Jyxcblx0XHRcdCdcdHB1YmxpYyB4OiBudW1iZXIgPSAwOycsXG5cdFx0XHQnICAgcHVibGljIHk6IG51bWJlciA9IDA7Jyxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJykpO1xuXHRcdGNvbnN0IHNlY29uZGFyeUVkaXRzID0gZ2V0U2Vjb25kYXJ5RWRpdHModGV4dE1vZGVsLCBwb3NpdGlvbnMsIHByaW1hcnlFZGl0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY29uZGFyeUVkaXRzLCBbbmV3IFRleHRSZXBsYWNlbWVudChcblx0XHRcdG5ldyBSYW5nZSg0LCAxLCA0LCAxKSwgW1xuXHRcdFx0XHQnXHRwdWJsaWMgeDogbnVtYmVyID0gMDsnLFxuXHRcdFx0XHQnICAgcHVibGljIHk6IG51bWJlciA9IDA7Jyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KV0pO1xuXHRcdHRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLHVCQUF1QjtBQUMxQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQkFBaUI7QUFFMUIsTUFBTSxxQkFBcUIsTUFBTTtBQUVoQywwQ0FBd0M7QUFFeEMsT0FBSyxTQUFTLGlCQUFrQjtBQUUvQixVQUFNLFlBQVksZ0JBQWdCO0FBQUEsTUFDakM7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQ1osVUFBTSxZQUFZO0FBQUEsTUFDakIsSUFBSSxTQUFTLEdBQUcsRUFBRTtBQUFBLE1BQ2xCLElBQUksU0FBUyxHQUFHLEVBQUU7QUFBQSxJQUNuQjtBQUNBLFVBQU0sY0FBYyxJQUFJLGdCQUFnQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLGtCQUFrQjtBQUNsRixVQUFNLGlCQUFpQixrQkFBa0IsV0FBVyxXQUFXLFdBQVc7QUFDMUUsV0FBTyxnQkFBZ0IsZ0JBQWdCLENBQUMsSUFBSTtBQUFBLE1BQzNDLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLGNBQVUsUUFBUTtBQUFBLEVBQ25CLENBQUM7QUFFRCxPQUFLLDZDQUE2QyxpQkFBa0I7QUFFbkUsVUFBTSxZQUFZLGdCQUFnQjtBQUFBLE1BQ2pDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQ1osVUFBTSxZQUFZO0FBQUEsTUFDakIsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUFBLE1BQ2pCLElBQUksU0FBUyxHQUFHLENBQUM7QUFBQSxJQUNsQjtBQUNBLFVBQU0sY0FBYyxJQUFJLGdCQUFnQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHO0FBQUEsTUFDOUQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUksQ0FBQztBQUNaLFVBQU0saUJBQWlCLGtCQUFrQixXQUFXLFdBQVcsV0FBVztBQUMxRSxXQUFPLGdCQUFnQixTQUFTLGlDQUFpQyxlQUFlLE9BQU8sU0FBUyxDQUFDLEVBQUUsU0FBUyxVQUFVLFNBQVMsQ0FBQyxHQUFHLGtEQUFvQztBQUN2SyxjQUFVLFFBQVE7QUFBQSxFQUNuQixDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsaUJBQWtCO0FBRW5FLFVBQU0sWUFBWSxnQkFBZ0I7QUFBQSxNQUNqQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJLENBQUM7QUFDWixVQUFNLFlBQVk7QUFBQSxNQUNqQixJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQUEsTUFDakIsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUFBLElBQ2xCO0FBQ0EsVUFBTSxjQUFjLElBQUksZ0JBQWdCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUc7QUFBQSxNQUM5RDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUksQ0FBQztBQUNaLFVBQU0saUJBQWlCLGtCQUFrQixXQUFXLFdBQVcsV0FBVztBQUMxRSxXQUFPLGdCQUFnQixnQkFBZ0IsQ0FBQyxJQUFJO0FBQUEsTUFDM0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUFHO0FBQUEsUUFDdEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxJQUNaLENBQUMsQ0FBQztBQUNGLGNBQVUsUUFBUTtBQUFBLEVBQ25CLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
