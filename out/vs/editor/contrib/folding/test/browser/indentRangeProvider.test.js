import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { computeRanges } from "../../browser/indentRangeProvider.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
function assertRanges(lines, expected, offside, markers2) {
  const model = createTextModel(lines.join("\n"));
  const actual = computeRanges(model, offside, markers2);
  const actualRanges = [];
  for (let i = 0; i < actual.length; i++) {
    actualRanges[i] = r(actual.getStartLineNumber(i), actual.getEndLineNumber(i), actual.getParentIndex(i));
  }
  assert.deepStrictEqual(actualRanges, expected);
  model.dispose();
}
function r(startLineNumber, endLineNumber, parentIndex, marker = false) {
  return { startLineNumber, endLineNumber, parentIndex };
}
suite("Indentation Folding", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Fold one level", () => {
    const range = [
      "A",
      "  A",
      "  A",
      "  A"
    ];
    assertRanges(range, [r(1, 4, -1)], true);
    assertRanges(range, [r(1, 4, -1)], false);
  });
  test("Fold two levels", () => {
    const range = [
      "A",
      "  A",
      "  A",
      "    A",
      "    A"
    ];
    assertRanges(range, [r(1, 5, -1), r(3, 5, 0)], true);
    assertRanges(range, [r(1, 5, -1), r(3, 5, 0)], false);
  });
  test("Fold three levels", () => {
    const range = [
      "A",
      "  A",
      "    A",
      "      A",
      "A"
    ];
    assertRanges(range, [r(1, 4, -1), r(2, 4, 0), r(3, 4, 1)], true);
    assertRanges(range, [r(1, 4, -1), r(2, 4, 0), r(3, 4, 1)], false);
  });
  test("Fold decreasing indent", () => {
    const range = [
      "    A",
      "  A",
      "A"
    ];
    assertRanges(range, [], true);
    assertRanges(range, [], false);
  });
  test("Fold Java", () => {
    assertRanges([
      /* 1*/
      "class A {",
      /* 2*/
      "  void foo() {",
      /* 3*/
      "    console.log();",
      /* 4*/
      "    console.log();",
      /* 5*/
      "  }",
      /* 6*/
      "",
      /* 7*/
      "  void bar() {",
      /* 8*/
      "    console.log();",
      /* 9*/
      "  }",
      /*10*/
      "}",
      /*11*/
      "interface B {",
      /*12*/
      "  void bar();",
      /*13*/
      "}"
    ], [r(1, 9, -1), r(2, 4, 0), r(7, 8, 0), r(11, 12, -1)], false);
  });
  test("Fold Javadoc", () => {
    assertRanges([
      /* 1*/
      "/**",
      /* 2*/
      " * Comment",
      /* 3*/
      " */",
      /* 4*/
      "class A {",
      /* 5*/
      "  void foo() {",
      /* 6*/
      "  }",
      /* 7*/
      "}"
    ], [r(1, 3, -1), r(4, 6, -1)], false);
  });
  test("Fold Whitespace Java", () => {
    assertRanges([
      /* 1*/
      "class A {",
      /* 2*/
      "",
      /* 3*/
      "  void foo() {",
      /* 4*/
      "     ",
      /* 5*/
      "     return 0;",
      /* 6*/
      "  }",
      /* 7*/
      "      ",
      /* 8*/
      "}"
    ], [r(1, 7, -1), r(3, 5, 0)], false);
  });
  test("Fold Whitespace Python", () => {
    assertRanges([
      /* 1*/
      "def a:",
      /* 2*/
      "  pass",
      /* 3*/
      "   ",
      /* 4*/
      "  def b:",
      /* 5*/
      "    pass",
      /* 6*/
      "  ",
      /* 7*/
      "      ",
      /* 8*/
      "def c: # since there was a deintent here"
    ], [r(1, 5, -1), r(4, 5, 0)], true);
  });
  test("Fold Tabs", () => {
    assertRanges([
      /* 1*/
      "class A {",
      /* 2*/
      "		",
      /* 3*/
      "	void foo() {",
      /* 4*/
      "	 	//hello",
      /* 5*/
      "	    return 0;",
      /* 6*/
      "  	}",
      /* 7*/
      "      ",
      /* 8*/
      "}"
    ], [r(1, 7, -1), r(3, 5, 0)], false);
  });
});
const markers = {
  start: /^\s*#region\b/,
  end: /^\s*#endregion\b/
};
suite("Folding with regions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Inside region, indented", () => {
    assertRanges([
      /* 1*/
      "class A {",
      /* 2*/
      "  #region",
      /* 3*/
      "  void foo() {",
      /* 4*/
      "     ",
      /* 5*/
      "     return 0;",
      /* 6*/
      "  }",
      /* 7*/
      "  #endregion",
      /* 8*/
      "}"
    ], [r(1, 7, -1), r(2, 7, 0, true), r(3, 5, 1)], false, markers);
  });
  test("Inside region, not indented", () => {
    assertRanges([
      /* 1*/
      "var x;",
      /* 2*/
      "#region",
      /* 3*/
      "void foo() {",
      /* 4*/
      "     ",
      /* 5*/
      "     return 0;",
      /* 6*/
      "  }",
      /* 7*/
      "#endregion",
      /* 8*/
      ""
    ], [r(2, 7, -1, true), r(3, 6, 0)], false, markers);
  });
  test("Empty Regions", () => {
    assertRanges([
      /* 1*/
      "var x;",
      /* 2*/
      "#region",
      /* 3*/
      "#endregion",
      /* 4*/
      "#region",
      /* 5*/
      "",
      /* 6*/
      "#endregion",
      /* 7*/
      "var y;"
    ], [r(2, 3, -1, true), r(4, 6, -1, true)], false, markers);
  });
  test("Nested Regions", () => {
    assertRanges([
      /* 1*/
      "var x;",
      /* 2*/
      "#region",
      /* 3*/
      "#region",
      /* 4*/
      "",
      /* 5*/
      "#endregion",
      /* 6*/
      "#endregion",
      /* 7*/
      "var y;"
    ], [r(2, 6, -1, true), r(3, 5, 0, true)], false, markers);
  });
  test("Nested Regions 2", () => {
    assertRanges([
      /* 1*/
      "class A {",
      /* 2*/
      "  #region",
      /* 3*/
      "",
      /* 4*/
      "  #region",
      /* 5*/
      "",
      /* 6*/
      "  #endregion",
      /* 7*/
      "  // comment",
      /* 8*/
      "  #endregion",
      /* 9*/
      "}"
    ], [r(1, 8, -1), r(2, 8, 0, true), r(4, 6, 1, true)], false, markers);
  });
  test("Incomplete Regions", () => {
    assertRanges([
      /* 1*/
      "class A {",
      /* 2*/
      "#region",
      /* 3*/
      "  // comment",
      /* 4*/
      "}"
    ], [r(2, 3, -1)], false, markers);
  });
  test("Incomplete Regions 2", () => {
    assertRanges([
      /* 1*/
      "",
      /* 2*/
      "#region",
      /* 3*/
      "#region",
      /* 4*/
      "#region",
      /* 5*/
      "  // comment",
      /* 6*/
      "#endregion",
      /* 7*/
      "#endregion",
      /* 8*/
      " // hello"
    ], [r(3, 7, -1, true), r(4, 6, 0, true)], false, markers);
  });
  test("Indented region before", () => {
    assertRanges([
      /* 1*/
      "if (x)",
      /* 2*/
      "  return;",
      /* 3*/
      "",
      /* 4*/
      "#region",
      /* 5*/
      "  // comment",
      /* 6*/
      "#endregion"
    ], [r(1, 3, -1), r(4, 6, -1, true)], false, markers);
  });
  test("Indented region before 2", () => {
    assertRanges([
      /* 1*/
      "if (x)",
      /* 2*/
      "  log();",
      /* 3*/
      "",
      /* 4*/
      "    #region",
      /* 5*/
      "      // comment",
      /* 6*/
      "    #endregion"
    ], [r(1, 6, -1), r(2, 6, 0), r(4, 6, 1, true)], false, markers);
  });
  test("Indented region in-between", () => {
    assertRanges([
      /* 1*/
      "#region",
      /* 2*/
      "  // comment",
      /* 3*/
      "  if (x)",
      /* 4*/
      "    return;",
      /* 5*/
      "",
      /* 6*/
      "#endregion"
    ], [r(1, 6, -1, true), r(3, 5, 0)], false, markers);
  });
  test("Indented region after", () => {
    assertRanges([
      /* 1*/
      "#region",
      /* 2*/
      "  // comment",
      /* 3*/
      "",
      /* 4*/
      "#endregion",
      /* 5*/
      "  if (x)",
      /* 6*/
      "    return;"
    ], [r(1, 4, -1, true), r(5, 6, -1)], false, markers);
  });
  test("With off-side", () => {
    assertRanges([
      /* 1*/
      "#region",
      /* 2*/
      "  ",
      /* 3*/
      "",
      /* 4*/
      "#endregion",
      /* 5*/
      ""
    ], [r(1, 4, -1, true)], true, markers);
  });
  test("Nested with off-side", () => {
    assertRanges([
      /* 1*/
      "#region",
      /* 2*/
      "  ",
      /* 3*/
      "#region",
      /* 4*/
      "",
      /* 5*/
      "#endregion",
      /* 6*/
      "",
      /* 7*/
      "#endregion",
      /* 8*/
      ""
    ], [r(1, 7, -1, true), r(3, 5, 0, true)], true, markers);
  });
  test("Issue 35981", () => {
    assertRanges([
      /* 1*/
      "function thisFoldsToEndOfPage() {",
      /* 2*/
      "  const variable = []",
      /* 3*/
      "    // #region",
      /* 4*/
      "    .reduce((a, b) => a,[]);",
      /* 5*/
      "}",
      /* 6*/
      "",
      /* 7*/
      "function thisFoldsProperly() {",
      /* 8*/
      '  const foo = "bar"',
      /* 9*/
      "}"
    ], [r(1, 4, -1), r(2, 4, 0), r(7, 8, -1)], false, markers);
  });
  test("Misspelled Markers", () => {
    assertRanges([
      /* 1*/
      "#Region",
      /* 2*/
      "#endregion",
      /* 3*/
      "#regionsandmore",
      /* 4*/
      "#endregion",
      /* 5*/
      "#region",
      /* 6*/
      "#end region",
      /* 7*/
      "#region",
      /* 8*/
      "#endregionff"
    ], [], true, markers);
  });
  test("Issue 79359", () => {
    assertRanges([
      /* 1*/
      "#region",
      /* 2*/
      "",
      /* 3*/
      "class A",
      /* 4*/
      "  foo",
      /* 5*/
      "",
      /* 6*/
      "class A",
      /* 7*/
      "  foo",
      /* 8*/
      "",
      /* 9*/
      "#endregion"
    ], [r(1, 9, -1, true), r(3, 4, 0), r(6, 7, 0)], true, markers);
  });
  test("Markers with stateful flags", () => {
    assertRanges([
      /* 1*/
      "#region",
      /* 2*/
      "content",
      /* 3*/
      "#endregion"
    ], [r(1, 3, -1, true)], false, {
      start: /^\s*#region\b/g,
      end: /^\s*#endregion\b/g
    });
    assertRanges([
      /* 1*/
      "#REGION",
      /* 2*/
      "content",
      /* 3*/
      "#endregion"
    ], [r(1, 3, -1, true)], false, {
      start: /^\s*#region\b/gi,
      end: /^\s*#endregion\b/g
    });
    assertRanges([
      /* 1*/
      "#REGION",
      /* 2*/
      "content",
      /* 3*/
      "#ENDREGION"
    ], [], false, {
      start: /^\s*#region\b/gi,
      end: /^\s*#endregion\b/g
    });
    assertRanges([
      /* 1*/
      "#REGION",
      /* 2*/
      "content",
      /* 3*/
      "#ENDREGION"
    ], [], false, {
      start: /^\s*#region\b/g,
      end: /^\s*#endregion\b/gi
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZvbGRpbmdcXHRlc3RcXGJyb3dzZXJcXGluZGVudFJhbmdlUHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRm9sZGluZ01hcmtlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUmFuZ2VzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9pbmRlbnRSYW5nZVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuXG5pbnRlcmZhY2UgRXhwZWN0ZWRJbmRlbnRSYW5nZSB7XG5cdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHBhcmVudEluZGV4OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFJhbmdlcyhsaW5lczogc3RyaW5nW10sIGV4cGVjdGVkOiBFeHBlY3RlZEluZGVudFJhbmdlW10sIG9mZnNpZGU6IGJvb2xlYW4sIG1hcmtlcnM/OiBGb2xkaW5nTWFya2Vycyk6IHZvaWQge1xuXHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdGNvbnN0IGFjdHVhbCA9IGNvbXB1dGVSYW5nZXMobW9kZWwsIG9mZnNpZGUsIG1hcmtlcnMpO1xuXG5cdGNvbnN0IGFjdHVhbFJhbmdlczogRXhwZWN0ZWRJbmRlbnRSYW5nZVtdID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYWN0dWFsLmxlbmd0aDsgaSsrKSB7XG5cdFx0YWN0dWFsUmFuZ2VzW2ldID0gcihhY3R1YWwuZ2V0U3RhcnRMaW5lTnVtYmVyKGkpLCBhY3R1YWwuZ2V0RW5kTGluZU51bWJlcihpKSwgYWN0dWFsLmdldFBhcmVudEluZGV4KGkpKTtcblx0fVxuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFJhbmdlcywgZXhwZWN0ZWQpO1xuXHRtb2RlbC5kaXNwb3NlKCk7XG59XG5cbmZ1bmN0aW9uIHIoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgcGFyZW50SW5kZXg6IG51bWJlciwgbWFya2VyID0gZmFsc2UpOiBFeHBlY3RlZEluZGVudFJhbmdlIHtcblx0cmV0dXJuIHsgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyLCBwYXJlbnRJbmRleCB9O1xufVxuXG5zdWl0ZSgnSW5kZW50YXRpb24gRm9sZGluZycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlc3QoJ0ZvbGQgb25lIGxldmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlID0gW1xuXHRcdFx0J0EnLFxuXHRcdFx0JyAgQScsXG5cdFx0XHQnICBBJyxcblx0XHRcdCcgIEEnXG5cdFx0XTtcblx0XHRhc3NlcnRSYW5nZXMocmFuZ2UsIFtyKDEsIDQsIC0xKV0sIHRydWUpO1xuXHRcdGFzc2VydFJhbmdlcyhyYW5nZSwgW3IoMSwgNCwgLTEpXSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb2xkIHR3byBsZXZlbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2UgPSBbXG5cdFx0XHQnQScsXG5cdFx0XHQnICBBJyxcblx0XHRcdCcgIEEnLFxuXHRcdFx0JyAgICBBJyxcblx0XHRcdCcgICAgQSdcblx0XHRdO1xuXHRcdGFzc2VydFJhbmdlcyhyYW5nZSwgW3IoMSwgNSwgLTEpLCByKDMsIDUsIDApXSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0UmFuZ2VzKHJhbmdlLCBbcigxLCA1LCAtMSksIHIoMywgNSwgMCldLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZvbGQgdGhyZWUgbGV2ZWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlID0gW1xuXHRcdFx0J0EnLFxuXHRcdFx0JyAgQScsXG5cdFx0XHQnICAgIEEnLFxuXHRcdFx0JyAgICAgIEEnLFxuXHRcdFx0J0EnXG5cdFx0XTtcblx0XHRhc3NlcnRSYW5nZXMocmFuZ2UsIFtyKDEsIDQsIC0xKSwgcigyLCA0LCAwKSwgcigzLCA0LCAxKV0sIHRydWUpO1xuXHRcdGFzc2VydFJhbmdlcyhyYW5nZSwgW3IoMSwgNCwgLTEpLCByKDIsIDQsIDApLCByKDMsIDQsIDEpXSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb2xkIGRlY3JlYXNpbmcgaW5kZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlID0gW1xuXHRcdFx0JyAgICBBJyxcblx0XHRcdCcgIEEnLFxuXHRcdFx0J0EnXG5cdFx0XTtcblx0XHRhc3NlcnRSYW5nZXMocmFuZ2UsIFtdLCB0cnVlKTtcblx0XHRhc3NlcnRSYW5nZXMocmFuZ2UsIFtdLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZvbGQgSmF2YScsICgpID0+IHtcblx0XHRhc3NlcnRSYW5nZXMoW1xuXHRcdC8qIDEqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogMiovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDMqL1x0JyAgICBjb25zb2xlLmxvZygpOycsXG5cdFx0LyogNCovXHQnICAgIGNvbnNvbGUubG9nKCk7Jyxcblx0XHQvKiA1Ki9cdCcgIH0nLFxuXHRcdC8qIDYqL1x0JycsXG5cdFx0LyogNyovXHQnICB2b2lkIGJhcigpIHsnLFxuXHRcdC8qIDgqL1x0JyAgICBjb25zb2xlLmxvZygpOycsXG5cdFx0LyogOSovXHQnICB9Jyxcblx0XHQvKjEwKi9cdCd9Jyxcblx0XHQvKjExKi9cdCdpbnRlcmZhY2UgQiB7Jyxcblx0XHQvKjEyKi9cdCcgIHZvaWQgYmFyKCk7Jyxcblx0XHQvKjEzKi9cdCd9Jyxcblx0XHRdLCBbcigxLCA5LCAtMSksIHIoMiwgNCwgMCksIHIoNywgOCwgMCksIHIoMTEsIDEyLCAtMSldLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZvbGQgSmF2YWRvYycsICgpID0+IHtcblx0XHRhc3NlcnRSYW5nZXMoW1xuXHRcdC8qIDEqL1x0Jy8qKicsXG5cdFx0LyogMiovXHQnICogQ29tbWVudCcsXG5cdFx0LyogMyovXHQnICovJyxcblx0XHQvKiA0Ki9cdCdjbGFzcyBBIHsnLFxuXHRcdC8qIDUqL1x0JyAgdm9pZCBmb28oKSB7Jyxcblx0XHQvKiA2Ki9cdCcgIH0nLFxuXHRcdC8qIDcqL1x0J30nLFxuXHRcdF0sIFtyKDEsIDMsIC0xKSwgcig0LCA2LCAtMSldLCBmYWxzZSk7XG5cdH0pO1xuXHR0ZXN0KCdGb2xkIFdoaXRlc3BhY2UgSmF2YScsICgpID0+IHtcblx0XHRhc3NlcnRSYW5nZXMoW1xuXHRcdC8qIDEqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogMiovXHQnJyxcblx0XHQvKiAzKi9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0LyogNCovXHQnICAgICAnLFxuXHRcdC8qIDUqL1x0JyAgICAgcmV0dXJuIDA7Jyxcblx0XHQvKiA2Ki9cdCcgIH0nLFxuXHRcdC8qIDcqL1x0JyAgICAgICcsXG5cdFx0LyogOCovXHQnfScsXG5cdFx0XSwgW3IoMSwgNywgLTEpLCByKDMsIDUsIDApXSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb2xkIFdoaXRlc3BhY2UgUHl0aG9uJywgKCkgPT4ge1xuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQnZGVmIGE6Jyxcblx0XHQvKiAyKi9cdCcgIHBhc3MnLFxuXHRcdC8qIDMqL1x0JyAgICcsXG5cdFx0LyogNCovXHQnICBkZWYgYjonLFxuXHRcdC8qIDUqL1x0JyAgICBwYXNzJyxcblx0XHQvKiA2Ki9cdCcgICcsXG5cdFx0LyogNyovXHQnICAgICAgJyxcblx0XHQvKiA4Ki9cdCdkZWYgYzogIyBzaW5jZSB0aGVyZSB3YXMgYSBkZWludGVudCBoZXJlJ1xuXHRcdF0sIFtyKDEsIDUsIC0xKSwgcig0LCA1LCAwKV0sIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb2xkIFRhYnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCdjbGFzcyBBIHsnLFxuXHRcdC8qIDIqL1x0J1xcdFxcdCcsXG5cdFx0LyogMyovXHQnXFx0dm9pZCBmb28oKSB7Jyxcblx0XHQvKiA0Ki9cdCdcXHQgXFx0Ly9oZWxsbycsXG5cdFx0LyogNSovXHQnXFx0ICAgIHJldHVybiAwOycsXG5cdFx0LyogNiovXHQnICBcXHR9Jyxcblx0XHQvKiA3Ki9cdCcgICAgICAnLFxuXHRcdC8qIDgqL1x0J30nLFxuXHRcdF0sIFtyKDEsIDcsIC0xKSwgcigzLCA1LCAwKV0sIGZhbHNlKTtcblx0fSk7XG59KTtcblxuY29uc3QgbWFya2VyczogRm9sZGluZ01hcmtlcnMgPSB7XG5cdHN0YXJ0OiAvXlxccyojcmVnaW9uXFxiLyxcblx0ZW5kOiAvXlxccyojZW5kcmVnaW9uXFxiL1xufTtcblxuc3VpdGUoJ0ZvbGRpbmcgd2l0aCByZWdpb25zJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVzdCgnSW5zaWRlIHJlZ2lvbiwgaW5kZW50ZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCdjbGFzcyBBIHsnLFxuXHRcdC8qIDIqL1x0JyAgI3JlZ2lvbicsXG5cdFx0LyogMyovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDQqL1x0JyAgICAgJyxcblx0XHQvKiA1Ki9cdCcgICAgIHJldHVybiAwOycsXG5cdFx0LyogNiovXHQnICB9Jyxcblx0XHQvKiA3Ki9cdCcgICNlbmRyZWdpb24nLFxuXHRcdC8qIDgqL1x0J30nLFxuXHRcdF0sIFtyKDEsIDcsIC0xKSwgcigyLCA3LCAwLCB0cnVlKSwgcigzLCA1LCAxKV0sIGZhbHNlLCBtYXJrZXJzKTtcblx0fSk7XG5cdHRlc3QoJ0luc2lkZSByZWdpb24sIG5vdCBpbmRlbnRlZCcsICgpID0+IHtcblx0XHRhc3NlcnRSYW5nZXMoW1xuXHRcdC8qIDEqL1x0J3ZhciB4OycsXG5cdFx0LyogMiovXHQnI3JlZ2lvbicsXG5cdFx0LyogMyovXHQndm9pZCBmb28oKSB7Jyxcblx0XHQvKiA0Ki9cdCcgICAgICcsXG5cdFx0LyogNSovXHQnICAgICByZXR1cm4gMDsnLFxuXHRcdC8qIDYqL1x0JyAgfScsXG5cdFx0LyogNyovXHQnI2VuZHJlZ2lvbicsXG5cdFx0LyogOCovXHQnJyxcblx0XHRdLCBbcigyLCA3LCAtMSwgdHJ1ZSksIHIoMywgNiwgMCldLCBmYWxzZSwgbWFya2Vycyk7XG5cdH0pO1xuXHR0ZXN0KCdFbXB0eSBSZWdpb25zJywgKCkgPT4ge1xuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQndmFyIHg7Jyxcblx0XHQvKiAyKi9cdCcjcmVnaW9uJyxcblx0XHQvKiAzKi9cdCcjZW5kcmVnaW9uJyxcblx0XHQvKiA0Ki9cdCcjcmVnaW9uJyxcblx0XHQvKiA1Ki9cdCcnLFxuXHRcdC8qIDYqL1x0JyNlbmRyZWdpb24nLFxuXHRcdC8qIDcqL1x0J3ZhciB5OycsXG5cdFx0XSwgW3IoMiwgMywgLTEsIHRydWUpLCByKDQsIDYsIC0xLCB0cnVlKV0sIGZhbHNlLCBtYXJrZXJzKTtcblx0fSk7XG5cdHRlc3QoJ05lc3RlZCBSZWdpb25zJywgKCkgPT4ge1xuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQndmFyIHg7Jyxcblx0XHQvKiAyKi9cdCcjcmVnaW9uJyxcblx0XHQvKiAzKi9cdCcjcmVnaW9uJyxcblx0XHQvKiA0Ki9cdCcnLFxuXHRcdC8qIDUqL1x0JyNlbmRyZWdpb24nLFxuXHRcdC8qIDYqL1x0JyNlbmRyZWdpb24nLFxuXHRcdC8qIDcqL1x0J3ZhciB5OycsXG5cdFx0XSwgW3IoMiwgNiwgLTEsIHRydWUpLCByKDMsIDUsIDAsIHRydWUpXSwgZmFsc2UsIG1hcmtlcnMpO1xuXHR9KTtcblx0dGVzdCgnTmVzdGVkIFJlZ2lvbnMgMicsICgpID0+IHtcblx0XHRhc3NlcnRSYW5nZXMoW1xuXHRcdC8qIDEqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogMiovXHQnICAjcmVnaW9uJyxcblx0XHQvKiAzKi9cdCcnLFxuXHRcdC8qIDQqL1x0JyAgI3JlZ2lvbicsXG5cdFx0LyogNSovXHQnJyxcblx0XHQvKiA2Ki9cdCcgICNlbmRyZWdpb24nLFxuXHRcdC8qIDcqL1x0JyAgLy8gY29tbWVudCcsXG5cdFx0LyogOCovXHQnICAjZW5kcmVnaW9uJyxcblx0XHQvKiA5Ki9cdCd9Jyxcblx0XHRdLCBbcigxLCA4LCAtMSksIHIoMiwgOCwgMCwgdHJ1ZSksIHIoNCwgNiwgMSwgdHJ1ZSldLCBmYWxzZSwgbWFya2Vycyk7XG5cdH0pO1xuXHR0ZXN0KCdJbmNvbXBsZXRlIFJlZ2lvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCdjbGFzcyBBIHsnLFxuXHRcdC8qIDIqL1x0JyNyZWdpb24nLFxuXHRcdC8qIDMqL1x0JyAgLy8gY29tbWVudCcsXG5cdFx0LyogNCovXHQnfScsXG5cdFx0XSwgW3IoMiwgMywgLTEpXSwgZmFsc2UsIG1hcmtlcnMpO1xuXHR9KTtcblx0dGVzdCgnSW5jb21wbGV0ZSBSZWdpb25zIDInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCcnLFxuXHRcdC8qIDIqL1x0JyNyZWdpb24nLFxuXHRcdC8qIDMqL1x0JyNyZWdpb24nLFxuXHRcdC8qIDQqL1x0JyNyZWdpb24nLFxuXHRcdC8qIDUqL1x0JyAgLy8gY29tbWVudCcsXG5cdFx0LyogNiovXHQnI2VuZHJlZ2lvbicsXG5cdFx0LyogNyovXHQnI2VuZHJlZ2lvbicsXG5cdFx0LyogOCovXHQnIC8vIGhlbGxvJyxcblx0XHRdLCBbcigzLCA3LCAtMSwgdHJ1ZSksIHIoNCwgNiwgMCwgdHJ1ZSldLCBmYWxzZSwgbWFya2Vycyk7XG5cdH0pO1xuXHR0ZXN0KCdJbmRlbnRlZCByZWdpb24gYmVmb3JlJywgKCkgPT4ge1xuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQnaWYgKHgpJyxcblx0XHQvKiAyKi9cdCcgIHJldHVybjsnLFxuXHRcdC8qIDMqL1x0JycsXG5cdFx0LyogNCovXHQnI3JlZ2lvbicsXG5cdFx0LyogNSovXHQnICAvLyBjb21tZW50Jyxcblx0XHQvKiA2Ki9cdCcjZW5kcmVnaW9uJyxcblx0XHRdLCBbcigxLCAzLCAtMSksIHIoNCwgNiwgLTEsIHRydWUpXSwgZmFsc2UsIG1hcmtlcnMpO1xuXHR9KTtcblx0dGVzdCgnSW5kZW50ZWQgcmVnaW9uIGJlZm9yZSAyJywgKCkgPT4ge1xuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQnaWYgKHgpJyxcblx0XHQvKiAyKi9cdCcgIGxvZygpOycsXG5cdFx0LyogMyovXHQnJyxcblx0XHQvKiA0Ki9cdCcgICAgI3JlZ2lvbicsXG5cdFx0LyogNSovXHQnICAgICAgLy8gY29tbWVudCcsXG5cdFx0LyogNiovXHQnICAgICNlbmRyZWdpb24nLFxuXHRcdF0sIFtyKDEsIDYsIC0xKSwgcigyLCA2LCAwKSwgcig0LCA2LCAxLCB0cnVlKV0sIGZhbHNlLCBtYXJrZXJzKTtcblx0fSk7XG5cdHRlc3QoJ0luZGVudGVkIHJlZ2lvbiBpbi1iZXR3ZWVuJywgKCkgPT4ge1xuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQnI3JlZ2lvbicsXG5cdFx0LyogMiovXHQnICAvLyBjb21tZW50Jyxcblx0XHQvKiAzKi9cdCcgIGlmICh4KScsXG5cdFx0LyogNCovXHQnICAgIHJldHVybjsnLFxuXHRcdC8qIDUqL1x0JycsXG5cdFx0LyogNiovXHQnI2VuZHJlZ2lvbicsXG5cdFx0XSwgW3IoMSwgNiwgLTEsIHRydWUpLCByKDMsIDUsIDApXSwgZmFsc2UsIG1hcmtlcnMpO1xuXHR9KTtcblx0dGVzdCgnSW5kZW50ZWQgcmVnaW9uIGFmdGVyJywgKCkgPT4ge1xuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQnI3JlZ2lvbicsXG5cdFx0LyogMiovXHQnICAvLyBjb21tZW50Jyxcblx0XHQvKiAzKi9cdCcnLFxuXHRcdC8qIDQqL1x0JyNlbmRyZWdpb24nLFxuXHRcdC8qIDUqL1x0JyAgaWYgKHgpJyxcblx0XHQvKiA2Ki9cdCcgICAgcmV0dXJuOycsXG5cdFx0XSwgW3IoMSwgNCwgLTEsIHRydWUpLCByKDUsIDYsIC0xKV0sIGZhbHNlLCBtYXJrZXJzKTtcblx0fSk7XG5cdHRlc3QoJ1dpdGggb2ZmLXNpZGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCcjcmVnaW9uJyxcblx0XHQvKiAyKi9cdCcgICcsXG5cdFx0LyogMyovXHQnJyxcblx0XHQvKiA0Ki9cdCcjZW5kcmVnaW9uJyxcblx0XHQvKiA1Ki9cdCcnLFxuXHRcdF0sIFtyKDEsIDQsIC0xLCB0cnVlKV0sIHRydWUsIG1hcmtlcnMpO1xuXHR9KTtcblx0dGVzdCgnTmVzdGVkIHdpdGggb2ZmLXNpZGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCcjcmVnaW9uJyxcblx0XHQvKiAyKi9cdCcgICcsXG5cdFx0LyogMyovXHQnI3JlZ2lvbicsXG5cdFx0LyogNCovXHQnJyxcblx0XHQvKiA1Ki9cdCcjZW5kcmVnaW9uJyxcblx0XHQvKiA2Ki9cdCcnLFxuXHRcdC8qIDcqL1x0JyNlbmRyZWdpb24nLFxuXHRcdC8qIDgqL1x0JycsXG5cdFx0XSwgW3IoMSwgNywgLTEsIHRydWUpLCByKDMsIDUsIDAsIHRydWUpXSwgdHJ1ZSwgbWFya2Vycyk7XG5cdH0pO1xuXHR0ZXN0KCdJc3N1ZSAzNTk4MScsICgpID0+IHtcblx0XHRhc3NlcnRSYW5nZXMoW1xuXHRcdC8qIDEqL1x0J2Z1bmN0aW9uIHRoaXNGb2xkc1RvRW5kT2ZQYWdlKCkgeycsXG5cdFx0LyogMiovXHQnICBjb25zdCB2YXJpYWJsZSA9IFtdJyxcblx0XHQvKiAzKi9cdCcgICAgLy8gI3JlZ2lvbicsXG5cdFx0LyogNCovXHQnICAgIC5yZWR1Y2UoKGEsIGIpID0+IGEsW10pOycsXG5cdFx0LyogNSovXHQnfScsXG5cdFx0LyogNiovXHQnJyxcblx0XHQvKiA3Ki9cdCdmdW5jdGlvbiB0aGlzRm9sZHNQcm9wZXJseSgpIHsnLFxuXHRcdC8qIDgqL1x0JyAgY29uc3QgZm9vID0gXCJiYXJcIicsXG5cdFx0LyogOSovXHQnfScsXG5cdFx0XSwgW3IoMSwgNCwgLTEpLCByKDIsIDQsIDApLCByKDcsIDgsIC0xKV0sIGZhbHNlLCBtYXJrZXJzKTtcblx0fSk7XG5cdHRlc3QoJ01pc3NwZWxsZWQgTWFya2VycycsICgpID0+IHtcblx0XHRhc3NlcnRSYW5nZXMoW1xuXHRcdC8qIDEqL1x0JyNSZWdpb24nLFxuXHRcdC8qIDIqL1x0JyNlbmRyZWdpb24nLFxuXHRcdC8qIDMqL1x0JyNyZWdpb25zYW5kbW9yZScsXG5cdFx0LyogNCovXHQnI2VuZHJlZ2lvbicsXG5cdFx0LyogNSovXHQnI3JlZ2lvbicsXG5cdFx0LyogNiovXHQnI2VuZCByZWdpb24nLFxuXHRcdC8qIDcqL1x0JyNyZWdpb24nLFxuXHRcdC8qIDgqL1x0JyNlbmRyZWdpb25mZicsXG5cdFx0XSwgW10sIHRydWUsIG1hcmtlcnMpO1xuXHR9KTtcblx0dGVzdCgnSXNzdWUgNzkzNTknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCcjcmVnaW9uJyxcblx0XHQvKiAyKi9cdCcnLFxuXHRcdC8qIDMqL1x0J2NsYXNzIEEnLFxuXHRcdC8qIDQqL1x0JyAgZm9vJyxcblx0XHQvKiA1Ki9cdCcnLFxuXHRcdC8qIDYqL1x0J2NsYXNzIEEnLFxuXHRcdC8qIDcqL1x0JyAgZm9vJyxcblx0XHQvKiA4Ki9cdCcnLFxuXHRcdC8qIDkqL1x0JyNlbmRyZWdpb24nLFxuXHRcdF0sIFtyKDEsIDksIC0xLCB0cnVlKSwgcigzLCA0LCAwKSwgcig2LCA3LCAwKV0sIHRydWUsIG1hcmtlcnMpO1xuXHR9KTtcblx0dGVzdCgnTWFya2VycyB3aXRoIHN0YXRlZnVsIGZsYWdzJywgKCkgPT4ge1xuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQnI3JlZ2lvbicsXG5cdFx0LyogMiovXHQnY29udGVudCcsXG5cdFx0LyogMyovXHQnI2VuZHJlZ2lvbicsXG5cdFx0XSwgW3IoMSwgMywgLTEsIHRydWUpXSwgZmFsc2UsIHtcblx0XHRcdHN0YXJ0OiAvXlxccyojcmVnaW9uXFxiL2csXG5cdFx0XHRlbmQ6IC9eXFxzKiNlbmRyZWdpb25cXGIvZ1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCcjUkVHSU9OJyxcblx0XHQvKiAyKi9cdCdjb250ZW50Jyxcblx0XHQvKiAzKi9cdCcjZW5kcmVnaW9uJyxcblx0XHRdLCBbcigxLCAzLCAtMSwgdHJ1ZSldLCBmYWxzZSwge1xuXHRcdFx0c3RhcnQ6IC9eXFxzKiNyZWdpb25cXGIvZ2ksXG5cdFx0XHRlbmQ6IC9eXFxzKiNlbmRyZWdpb25cXGIvZ1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0UmFuZ2VzKFtcblx0XHQvKiAxKi9cdCcjUkVHSU9OJyxcblx0XHQvKiAyKi9cdCdjb250ZW50Jyxcblx0XHQvKiAzKi9cdCcjRU5EUkVHSU9OJyxcblx0XHRdLCBbXSwgZmFsc2UsIHtcblx0XHRcdHN0YXJ0OiAvXlxccyojcmVnaW9uXFxiL2dpLFxuXHRcdFx0ZW5kOiAvXlxccyojZW5kcmVnaW9uXFxiL2dcblx0XHR9KTtcblxuXHRcdGFzc2VydFJhbmdlcyhbXG5cdFx0LyogMSovXHQnI1JFR0lPTicsXG5cdFx0LyogMiovXHQnY29udGVudCcsXG5cdFx0LyogMyovXHQnI0VORFJFR0lPTicsXG5cdFx0XSwgW10sIGZhbHNlLCB7XG5cdFx0XHRzdGFydDogL15cXHMqI3JlZ2lvblxcYi9nLFxuXHRcdFx0ZW5kOiAvXlxccyojZW5kcmVnaW9uXFxiL2dpXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFRaEMsU0FBUyxhQUFhLE9BQWlCLFVBQWlDLFNBQWtCQSxVQUFnQztBQUN6SCxRQUFNLFFBQVEsZ0JBQWdCLE1BQU0sS0FBSyxJQUFJLENBQUM7QUFDOUMsUUFBTSxTQUFTLGNBQWMsT0FBTyxTQUFTQSxRQUFPO0FBRXBELFFBQU0sZUFBc0MsQ0FBQztBQUM3QyxXQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sUUFBUSxLQUFLO0FBQ3ZDLGlCQUFhLENBQUMsSUFBSSxFQUFFLE9BQU8sbUJBQW1CLENBQUMsR0FBRyxPQUFPLGlCQUFpQixDQUFDLEdBQUcsT0FBTyxlQUFlLENBQUMsQ0FBQztBQUFBLEVBQ3ZHO0FBQ0EsU0FBTyxnQkFBZ0IsY0FBYyxRQUFRO0FBQzdDLFFBQU0sUUFBUTtBQUNmO0FBRUEsU0FBUyxFQUFFLGlCQUF5QixlQUF1QixhQUFx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
