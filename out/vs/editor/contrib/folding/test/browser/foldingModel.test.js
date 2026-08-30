import assert from "assert";
import { escapeRegExpCharacters } from "../../../../../base/common/strings.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { EditOperation } from "../../../../common/core/editOperation.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { TrackedRangeStickiness } from "../../../../common/model.js";
import { ModelDecorationOptions } from "../../../../common/model/textModel.js";
import { toSelectedLines } from "../../browser/folding.js";
import { FoldingModel, getNextFoldLine, getParentFoldLine, getPreviousFoldLine, setCollapseStateAtLevel, setCollapseStateForMatchingLines, setCollapseStateForRest, setCollapseStateLevelsDown, setCollapseStateLevelsUp, setCollapseStateUp } from "../../browser/foldingModel.js";
import { FoldingRegions, FoldSource } from "../../browser/foldingRanges.js";
import { computeRanges } from "../../browser/indentRangeProvider.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
const _TestDecorationProvider = class _TestDecorationProvider {
  constructor(model) {
    this.model = model;
  }
  getDecorationOption(isCollapsed, isHidden) {
    if (isHidden) {
      return _TestDecorationProvider.hiddenDecoration;
    }
    if (isCollapsed) {
      return _TestDecorationProvider.collapsedDecoration;
    }
    return _TestDecorationProvider.expandedDecoration;
  }
  changeDecorations(callback) {
    return this.model.changeDecorations(callback);
  }
  removeDecorations(decorationIds) {
    this.model.changeDecorations((changeAccessor) => {
      changeAccessor.deltaDecorations(decorationIds, []);
    });
  }
  getDecorations() {
    const decorations = this.model.getAllDecorations();
    const res = [];
    for (const decoration of decorations) {
      if (decoration.options === _TestDecorationProvider.hiddenDecoration) {
        res.push({ line: decoration.range.startLineNumber, type: "hidden" });
      } else if (decoration.options === _TestDecorationProvider.collapsedDecoration) {
        res.push({ line: decoration.range.startLineNumber, type: "collapsed" });
      } else if (decoration.options === _TestDecorationProvider.expandedDecoration) {
        res.push({ line: decoration.range.startLineNumber, type: "expanded" });
      }
    }
    return res;
  }
};
_TestDecorationProvider.collapsedDecoration = ModelDecorationOptions.register({
  description: "test",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  linesDecorationsClassName: "folding"
});
_TestDecorationProvider.expandedDecoration = ModelDecorationOptions.register({
  description: "test",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  linesDecorationsClassName: "folding"
});
_TestDecorationProvider.hiddenDecoration = ModelDecorationOptions.register({
  description: "test",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  linesDecorationsClassName: "folding"
});
let TestDecorationProvider = _TestDecorationProvider;
suite("Folding Model", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function r(startLineNumber, endLineNumber, isCollapsed = false) {
    return { startLineNumber, endLineNumber, isCollapsed };
  }
  function d(line, type) {
    return { line, type };
  }
  function assertRegion(actual, expected, message) {
    assert.strictEqual(!!actual, !!expected, message);
    if (actual && expected) {
      assert.strictEqual(actual.startLineNumber, expected.startLineNumber, message);
      assert.strictEqual(actual.endLineNumber, expected.endLineNumber, message);
      assert.strictEqual(actual.isCollapsed, expected.isCollapsed, message);
    }
  }
  function assertFoldedRanges(foldingModel, expectedRegions, message) {
    const actualRanges = [];
    const actual = foldingModel.regions;
    for (let i = 0; i < actual.length; i++) {
      if (actual.isCollapsed(i)) {
        actualRanges.push(r(actual.getStartLineNumber(i), actual.getEndLineNumber(i)));
      }
    }
    assert.deepStrictEqual(actualRanges, expectedRegions, message);
  }
  function assertRanges(foldingModel, expectedRegions, message) {
    const actualRanges = [];
    const actual = foldingModel.regions;
    for (let i = 0; i < actual.length; i++) {
      actualRanges.push(r(actual.getStartLineNumber(i), actual.getEndLineNumber(i), actual.isCollapsed(i)));
    }
    assert.deepStrictEqual(actualRanges, expectedRegions, message);
  }
  function assertDecorations(foldingModel, expectedDecoration, message) {
    const decorationProvider = foldingModel.decorationProvider;
    assert.deepStrictEqual(decorationProvider.getDecorations(), expectedDecoration, message);
  }
  function assertRegions(actual, expectedRegions, message) {
    assert.deepStrictEqual(actual.map((r2) => ({ startLineNumber: r2.startLineNumber, endLineNumber: r2.endLineNumber, isCollapsed: r2.isCollapsed })), expectedRegions, message);
  }
  test("getRegionAtLine", () => {
    const lines = [
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
      "    // comment {",
      /* 7*/
      "  }",
      /* 8*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, void 0);
      foldingModel.update(ranges);
      const r1 = r(1, 3, false);
      const r2 = r(4, 7, false);
      const r3 = r(5, 6, false);
      assertRanges(foldingModel, [r1, r2, r3]);
      assertRegion(foldingModel.getRegionAtLine(1), r1, "1");
      assertRegion(foldingModel.getRegionAtLine(2), r1, "2");
      assertRegion(foldingModel.getRegionAtLine(3), r1, "3");
      assertRegion(foldingModel.getRegionAtLine(4), r2, "4");
      assertRegion(foldingModel.getRegionAtLine(5), r3, "5");
      assertRegion(foldingModel.getRegionAtLine(6), r3, "5");
      assertRegion(foldingModel.getRegionAtLine(7), r2, "6");
      assertRegion(foldingModel.getRegionAtLine(8), null, "7");
    } finally {
      textModel.dispose();
    }
  });
  test("collapse", () => {
    const lines = [
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
      "    // comment {",
      /* 7*/
      "  }",
      /* 8*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, void 0);
      foldingModel.update(ranges);
      const r1 = r(1, 3, false);
      const r2 = r(4, 7, false);
      const r3 = r(5, 6, false);
      assertRanges(foldingModel, [r1, r2, r3]);
      foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1)]);
      foldingModel.update(ranges);
      assertRanges(foldingModel, [r(1, 3, true), r2, r3]);
      foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(5)]);
      foldingModel.update(ranges);
      assertRanges(foldingModel, [r(1, 3, true), r2, r(5, 6, true)]);
      foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(7)]);
      foldingModel.update(ranges);
      assertRanges(foldingModel, [r(1, 3, true), r(4, 7, true), r(5, 6, true)]);
      textModel.dispose();
    } finally {
      textModel.dispose();
    }
  });
  test("update", () => {
    const lines = [
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
      "    // comment {",
      /* 7*/
      "  }",
      /* 8*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, void 0);
      foldingModel.update(ranges);
      const r1 = r(1, 3, false);
      const r2 = r(4, 7, false);
      const r3 = r(5, 6, false);
      assertRanges(foldingModel, [r1, r2, r3]);
      foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(2), foldingModel.getRegionAtLine(5)]);
      textModel.applyEdits([EditOperation.insert(new Position(4, 1), "//hello\n")]);
      foldingModel.update(computeRanges(textModel, false, void 0));
      assertRanges(foldingModel, [r(1, 3, true), r(5, 8, false), r(6, 7, true)]);
    } finally {
      textModel.dispose();
    }
  });
  test("delete", () => {
    const lines = [
      /* 1*/
      "function foo() {",
      /* 2*/
      "  switch (x) {",
      /* 3*/
      "    case 1:",
      /* 4*/
      "      //hello1",
      /* 5*/
      "      break;",
      /* 6*/
      "    case 2:",
      /* 7*/
      "      //hello2",
      /* 8*/
      "      break;",
      /* 9*/
      "    case 3:",
      /* 10*/
      "      //hello3",
      /* 11*/
      "      break;",
      /* 12*/
      "  }",
      /* 13*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, void 0);
      foldingModel.update(ranges);
      const r1 = r(1, 12, false);
      const r2 = r(2, 11, false);
      const r3 = r(3, 5, false);
      const r4 = r(6, 8, false);
      const r5 = r(9, 11, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
      foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(6)]);
      textModel.applyEdits([EditOperation.delete(new Range(6, 11, 9, 0))]);
      foldingModel.update(computeRanges(textModel, true, void 0), toSelectedLines([new Selection(7, 1, 7, 1)]));
      assertRanges(foldingModel, [r(1, 9, false), r(2, 8, false), r(3, 5, false), r(6, 8, false)]);
    } finally {
      textModel.dispose();
    }
  });
  test("getRegionsInside", () => {
    const lines = [
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
      "    // comment {",
      /* 7*/
      "  }",
      /* 8*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, void 0);
      foldingModel.update(ranges);
      const r1 = r(1, 3, false);
      const r2 = r(4, 7, false);
      const r3 = r(5, 6, false);
      assertRanges(foldingModel, [r1, r2, r3]);
      const region1 = foldingModel.getRegionAtLine(r1.startLineNumber);
      const region2 = foldingModel.getRegionAtLine(r2.startLineNumber);
      const region3 = foldingModel.getRegionAtLine(r3.startLineNumber);
      assertRegions(foldingModel.getRegionsInside(null), [r1, r2, r3], "1");
      assertRegions(foldingModel.getRegionsInside(region1), [], "2");
      assertRegions(foldingModel.getRegionsInside(region2), [r3], "3");
      assertRegions(foldingModel.getRegionsInside(region3), [], "4");
    } finally {
      textModel.dispose();
    }
  });
  test("getRegionsInsideWithLevel", () => {
    const lines = [
      /* 1*/
      "//#region",
      /* 2*/
      "//#endregion",
      /* 3*/
      "class A {",
      /* 4*/
      "  void foo() {",
      /* 5*/
      "    if (true) {",
      /* 6*/
      "        return;",
      /* 7*/
      "    }",
      /* 8*/
      "    if (true) {",
      /* 9*/
      "      return;",
      /* 10*/
      "    }",
      /* 11*/
      "  }",
      /* 12*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 2, false);
      const r2 = r(3, 11, false);
      const r3 = r(4, 10, false);
      const r4 = r(5, 6, false);
      const r5 = r(8, 9, false);
      const region1 = foldingModel.getRegionAtLine(r1.startLineNumber);
      const region2 = foldingModel.getRegionAtLine(r2.startLineNumber);
      const region3 = foldingModel.getRegionAtLine(r3.startLineNumber);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
      assertRegions(foldingModel.getRegionsInside(null, (r6, level) => level === 1), [r1, r2], "1");
      assertRegions(foldingModel.getRegionsInside(null, (r6, level) => level === 2), [r3], "2");
      assertRegions(foldingModel.getRegionsInside(null, (r6, level) => level === 3), [r4, r5], "3");
      assertRegions(foldingModel.getRegionsInside(region2, (r6, level) => level === 1), [r3], "4");
      assertRegions(foldingModel.getRegionsInside(region2, (r6, level) => level === 2), [r4, r5], "5");
      assertRegions(foldingModel.getRegionsInside(region3, (r6, level) => level === 1), [r4, r5], "6");
      assertRegions(foldingModel.getRegionsInside(region2, (r6, level) => r6.hidesLine(9)), [r3, r5], "7");
      assertRegions(foldingModel.getRegionsInside(region1, (r6, level) => level === 1), [], "8");
    } finally {
      textModel.dispose();
    }
  });
  test("getRegionAtLine2", () => {
    const lines = [
      /* 1*/
      "//#region",
      /* 2*/
      "class A {",
      /* 3*/
      "  void foo() {",
      /* 4*/
      "    if (true) {",
      /* 5*/
      "      //hello",
      /* 6*/
      "    }",
      /* 7*/
      "",
      /* 8*/
      "  }",
      /* 9*/
      "}",
      /* 10*/
      "//#endregion",
      /* 11*/
      ""
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 10, false);
      const r2 = r(2, 8, false);
      const r3 = r(3, 7, false);
      const r4 = r(4, 5, false);
      assertRanges(foldingModel, [r1, r2, r3, r4]);
      assertRegions(foldingModel.getAllRegionsAtLine(1), [r1], "1");
      assertRegions(foldingModel.getAllRegionsAtLine(2), [r1, r2].reverse(), "2");
      assertRegions(foldingModel.getAllRegionsAtLine(3), [r1, r2, r3].reverse(), "3");
      assertRegions(foldingModel.getAllRegionsAtLine(4), [r1, r2, r3, r4].reverse(), "4");
      assertRegions(foldingModel.getAllRegionsAtLine(5), [r1, r2, r3, r4].reverse(), "5");
      assertRegions(foldingModel.getAllRegionsAtLine(6), [r1, r2, r3].reverse(), "6");
      assertRegions(foldingModel.getAllRegionsAtLine(7), [r1, r2, r3].reverse(), "7");
      assertRegions(foldingModel.getAllRegionsAtLine(8), [r1, r2].reverse(), "8");
      assertRegions(foldingModel.getAllRegionsAtLine(9), [r1], "9");
      assertRegions(foldingModel.getAllRegionsAtLine(10), [r1], "10");
      assertRegions(foldingModel.getAllRegionsAtLine(11), [], "10");
    } finally {
      textModel.dispose();
    }
  });
  test("setCollapseStateRecursivly", () => {
    const lines = [
      /* 1*/
      "//#region",
      /* 2*/
      "//#endregion",
      /* 3*/
      "class A {",
      /* 4*/
      "  void foo() {",
      /* 5*/
      "    if (true) {",
      /* 6*/
      "        return;",
      /* 7*/
      "    }",
      /* 8*/
      "",
      /* 9*/
      "    if (true) {",
      /* 10*/
      "      return;",
      /* 11*/
      "    }",
      /* 12*/
      "  }",
      /* 13*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 2, false);
      const r2 = r(3, 12, false);
      const r3 = r(4, 11, false);
      const r4 = r(5, 6, false);
      const r5 = r(9, 10, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
      setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, [4]);
      assertFoldedRanges(foldingModel, [r3, r4, r5], "1");
      setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, [8]);
      assertFoldedRanges(foldingModel, [], "2");
      setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, [12]);
      assertFoldedRanges(foldingModel, [r2, r3, r4, r5], "1");
      setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, [7]);
      assertFoldedRanges(foldingModel, [r2], "1");
      setCollapseStateLevelsDown(foldingModel, false);
      assertFoldedRanges(foldingModel, [], "1");
      setCollapseStateLevelsDown(foldingModel, true);
      assertFoldedRanges(foldingModel, [r1, r2, r3, r4, r5], "1");
    } finally {
      textModel.dispose();
    }
  });
  test("setCollapseStateAtLevel", () => {
    const lines = [
      /* 1*/
      "//#region",
      /* 2*/
      "//#endregion",
      /* 3*/
      "class A {",
      /* 4*/
      "  void foo() {",
      /* 5*/
      "    if (true) {",
      /* 6*/
      "        return;",
      /* 7*/
      "    }",
      /* 8*/
      "",
      /* 9*/
      "    if (true) {",
      /* 10*/
      "      return;",
      /* 11*/
      "    }",
      /* 12*/
      "  }",
      /* 13*/
      "  //#region",
      /* 14*/
      "  const bar = 9;",
      /* 15*/
      "  //#endregion",
      /* 16*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\s*\/\/#region$/, end: /^\s*\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 2, false);
      const r2 = r(3, 15, false);
      const r3 = r(4, 11, false);
      const r4 = r(5, 6, false);
      const r5 = r(9, 10, false);
      const r6 = r(13, 15, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5, r6]);
      setCollapseStateAtLevel(foldingModel, 1, true, []);
      assertFoldedRanges(foldingModel, [r1, r2], "1");
      setCollapseStateAtLevel(foldingModel, 1, false, [5]);
      assertFoldedRanges(foldingModel, [r2], "2");
      setCollapseStateAtLevel(foldingModel, 1, false, [1]);
      assertFoldedRanges(foldingModel, [], "3");
      setCollapseStateAtLevel(foldingModel, 2, true, []);
      assertFoldedRanges(foldingModel, [r3, r6], "4");
      setCollapseStateAtLevel(foldingModel, 2, false, [5, 6]);
      assertFoldedRanges(foldingModel, [r3], "5");
      setCollapseStateAtLevel(foldingModel, 3, true, [4, 9]);
      assertFoldedRanges(foldingModel, [r3, r4], "6");
      setCollapseStateAtLevel(foldingModel, 3, false, [4, 9]);
      assertFoldedRanges(foldingModel, [r3], "7");
    } finally {
      textModel.dispose();
    }
  });
  test("setCollapseStateLevelsDown", () => {
    const lines = [
      /* 1*/
      "//#region",
      /* 2*/
      "//#endregion",
      /* 3*/
      "class A {",
      /* 4*/
      "  void foo() {",
      /* 5*/
      "    if (true) {",
      /* 6*/
      "        return;",
      /* 7*/
      "    }",
      /* 8*/
      "",
      /* 9*/
      "    if (true) {",
      /* 10*/
      "      return;",
      /* 11*/
      "    }",
      /* 12*/
      "  }",
      /* 13*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 2, false);
      const r2 = r(3, 12, false);
      const r3 = r(4, 11, false);
      const r4 = r(5, 6, false);
      const r5 = r(9, 10, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
      setCollapseStateLevelsDown(foldingModel, true, 1, [4]);
      assertFoldedRanges(foldingModel, [r3], "1");
      setCollapseStateLevelsDown(foldingModel, true, 2, [4]);
      assertFoldedRanges(foldingModel, [r3, r4, r5], "2");
      setCollapseStateLevelsDown(foldingModel, false, 2, [3]);
      assertFoldedRanges(foldingModel, [r4, r5], "3");
      setCollapseStateLevelsDown(foldingModel, false, 2, [2]);
      assertFoldedRanges(foldingModel, [r4, r5], "4");
      setCollapseStateLevelsDown(foldingModel, true, 4, [2]);
      assertFoldedRanges(foldingModel, [r1, r4, r5], "5");
      setCollapseStateLevelsDown(foldingModel, false, 4, [2, 3]);
      assertFoldedRanges(foldingModel, [], "6");
    } finally {
      textModel.dispose();
    }
  });
  test("setCollapseStateLevelsUp", () => {
    const lines = [
      /* 1*/
      "//#region",
      /* 2*/
      "//#endregion",
      /* 3*/
      "class A {",
      /* 4*/
      "  void foo() {",
      /* 5*/
      "    if (true) {",
      /* 6*/
      "        return;",
      /* 7*/
      "    }",
      /* 8*/
      "",
      /* 9*/
      "    if (true) {",
      /* 10*/
      "      return;",
      /* 11*/
      "    }",
      /* 12*/
      "  }",
      /* 13*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 2, false);
      const r2 = r(3, 12, false);
      const r3 = r(4, 11, false);
      const r4 = r(5, 6, false);
      const r5 = r(9, 10, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
      setCollapseStateLevelsUp(foldingModel, true, 1, [4]);
      assertFoldedRanges(foldingModel, [r3], "1");
      setCollapseStateLevelsUp(foldingModel, true, 2, [4]);
      assertFoldedRanges(foldingModel, [r2, r3], "2");
      setCollapseStateLevelsUp(foldingModel, false, 4, [1, 3, 4]);
      assertFoldedRanges(foldingModel, [], "3");
      setCollapseStateLevelsUp(foldingModel, true, 2, [10]);
      assertFoldedRanges(foldingModel, [r3, r5], "4");
    } finally {
      textModel.dispose();
    }
  });
  test("setCollapseStateUp", () => {
    const lines = [
      /* 1*/
      "//#region",
      /* 2*/
      "//#endregion",
      /* 3*/
      "class A {",
      /* 4*/
      "  void foo() {",
      /* 5*/
      "    if (true) {",
      /* 6*/
      "        return;",
      /* 7*/
      "    }",
      /* 8*/
      "",
      /* 9*/
      "    if (true) {",
      /* 10*/
      "      return;",
      /* 11*/
      "    }",
      /* 12*/
      "  }",
      /* 13*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 2, false);
      const r2 = r(3, 12, false);
      const r3 = r(4, 11, false);
      const r4 = r(5, 6, false);
      const r5 = r(9, 10, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
      setCollapseStateUp(foldingModel, true, [5]);
      assertFoldedRanges(foldingModel, [r4], "1");
      setCollapseStateUp(foldingModel, true, [5]);
      assertFoldedRanges(foldingModel, [r3, r4], "2");
      setCollapseStateUp(foldingModel, true, [4]);
      assertFoldedRanges(foldingModel, [r2, r3, r4], "2");
    } finally {
      textModel.dispose();
    }
  });
  test("setCollapseStateForMatchingLines", () => {
    const lines = [
      /* 1*/
      "/**",
      /* 2*/
      " * the class",
      /* 3*/
      " */",
      /* 4*/
      "class A {",
      /* 5*/
      "  /**",
      /* 6*/
      "   * the foo",
      /* 7*/
      "   */",
      /* 8*/
      "  void foo() {",
      /* 9*/
      "    /*",
      /* 10*/
      "     * the comment",
      /* 11*/
      "     */",
      /* 12*/
      "  }",
      /* 13*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 3, false);
      const r2 = r(4, 12, false);
      const r3 = r(5, 7, false);
      const r4 = r(8, 11, false);
      const r5 = r(9, 11, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
      const regExp = new RegExp("^\\s*" + escapeRegExpCharacters("/*"));
      setCollapseStateForMatchingLines(foldingModel, regExp, true);
      assertFoldedRanges(foldingModel, [r1, r3, r5], "1");
    } finally {
      textModel.dispose();
    }
  });
  test("setCollapseStateForRest", () => {
    const lines = [
      /* 1*/
      "//#region",
      /* 2*/
      "//#endregion",
      /* 3*/
      "class A {",
      /* 4*/
      "  void foo() {",
      /* 5*/
      "    if (true) {",
      /* 6*/
      "        return;",
      /* 7*/
      "    }",
      /* 8*/
      "",
      /* 9*/
      "    if (true) {",
      /* 10*/
      "      return;",
      /* 11*/
      "    }",
      /* 12*/
      "  }",
      /* 13*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, { start: /^\/\/#region$/, end: /^\/\/#endregion$/ });
      foldingModel.update(ranges);
      const r1 = r(1, 2, false);
      const r2 = r(3, 12, false);
      const r3 = r(4, 11, false);
      const r4 = r(5, 6, false);
      const r5 = r(9, 10, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5]);
      setCollapseStateForRest(foldingModel, true, [5]);
      assertFoldedRanges(foldingModel, [r1, r5], "1");
      setCollapseStateForRest(foldingModel, false, [5]);
      assertFoldedRanges(foldingModel, [], "2");
      setCollapseStateForRest(foldingModel, true, [1]);
      assertFoldedRanges(foldingModel, [r2, r3, r4, r5], "3");
      setCollapseStateForRest(foldingModel, true, [3]);
      assertFoldedRanges(foldingModel, [r1, r2, r3, r4, r5], "3");
    } finally {
      textModel.dispose();
    }
  });
  test("folding decoration", () => {
    const lines = [
      /* 1*/
      "class A {",
      /* 2*/
      "  void foo() {",
      /* 3*/
      "    if (true) {",
      /* 4*/
      "      hoo();",
      /* 5*/
      "    }",
      /* 6*/
      "  }",
      /* 7*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, void 0);
      foldingModel.update(ranges);
      const r1 = r(1, 6, false);
      const r2 = r(2, 5, false);
      const r3 = r(3, 4, false);
      assertRanges(foldingModel, [r1, r2, r3]);
      assertDecorations(foldingModel, [d(1, "expanded"), d(2, "expanded"), d(3, "expanded")]);
      foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(2)]);
      assertRanges(foldingModel, [r1, r(2, 5, true), r3]);
      assertDecorations(foldingModel, [d(1, "expanded"), d(2, "collapsed"), d(3, "hidden")]);
      foldingModel.update(ranges);
      assertRanges(foldingModel, [r1, r(2, 5, true), r3]);
      assertDecorations(foldingModel, [d(1, "expanded"), d(2, "collapsed"), d(3, "hidden")]);
      foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1)]);
      assertRanges(foldingModel, [r(1, 6, true), r(2, 5, true), r3]);
      assertDecorations(foldingModel, [d(1, "collapsed"), d(2, "hidden"), d(3, "hidden")]);
      foldingModel.update(ranges);
      assertRanges(foldingModel, [r(1, 6, true), r(2, 5, true), r3]);
      assertDecorations(foldingModel, [d(1, "collapsed"), d(2, "hidden"), d(3, "hidden")]);
      foldingModel.toggleCollapseState([foldingModel.getRegionAtLine(1), foldingModel.getRegionAtLine(3)]);
      assertRanges(foldingModel, [r1, r(2, 5, true), r(3, 4, true)]);
      assertDecorations(foldingModel, [d(1, "expanded"), d(2, "collapsed"), d(3, "hidden")]);
      foldingModel.update(ranges);
      assertRanges(foldingModel, [r1, r(2, 5, true), r(3, 4, true)]);
      assertDecorations(foldingModel, [d(1, "expanded"), d(2, "collapsed"), d(3, "hidden")]);
      textModel.dispose();
    } finally {
      textModel.dispose();
    }
  });
  test("fold jumping", () => {
    const lines = [
      /* 1*/
      "class A {",
      /* 2*/
      "  void foo() {",
      /* 3*/
      "    if (1) {",
      /* 4*/
      "      a();",
      /* 5*/
      "    } else if (2) {",
      /* 6*/
      "      if (true) {",
      /* 7*/
      "        b();",
      /* 8*/
      "      }",
      /* 9*/
      "    } else {",
      /* 10*/
      "      c();",
      /* 11*/
      "    }",
      /* 12*/
      "  }",
      /* 13*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, void 0);
      foldingModel.update(ranges);
      const r1 = r(1, 12, false);
      const r2 = r(2, 11, false);
      const r3 = r(3, 4, false);
      const r4 = r(5, 8, false);
      const r5 = r(6, 7, false);
      const r6 = r(9, 10, false);
      assertRanges(foldingModel, [r1, r2, r3, r4, r5, r6]);
      assert.strictEqual(getParentFoldLine(7, foldingModel), 6);
      assert.strictEqual(getParentFoldLine(6, foldingModel), 5);
      assert.strictEqual(getParentFoldLine(5, foldingModel), 2);
      assert.strictEqual(getParentFoldLine(2, foldingModel), 1);
      assert.strictEqual(getParentFoldLine(1, foldingModel), null);
      assert.strictEqual(getPreviousFoldLine(10, foldingModel), 9);
      assert.strictEqual(getPreviousFoldLine(9, foldingModel), 5);
      assert.strictEqual(getPreviousFoldLine(5, foldingModel), 3);
      assert.strictEqual(getPreviousFoldLine(3, foldingModel), null);
      assert.strictEqual(getPreviousFoldLine(4, foldingModel), 3);
      assert.strictEqual(getPreviousFoldLine(7, foldingModel), 6);
      assert.strictEqual(getPreviousFoldLine(8, foldingModel), 6);
      assert.strictEqual(getNextFoldLine(3, foldingModel), 5);
      assert.strictEqual(getNextFoldLine(5, foldingModel), 9);
      assert.strictEqual(getNextFoldLine(9, foldingModel), null);
      assert.strictEqual(getNextFoldLine(4, foldingModel), 5);
      assert.strictEqual(getNextFoldLine(7, foldingModel), 9);
      assert.strictEqual(getNextFoldLine(8, foldingModel), 9);
    } finally {
      textModel.dispose();
    }
  });
  test("fold jumping issue #129503", () => {
    const lines = [
      /* 1*/
      "",
      /* 2*/
      "if True:",
      /* 3*/
      "  print(1)",
      /* 4*/
      "if True:",
      /* 5*/
      "  print(1)",
      /* 6*/
      ""
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = computeRanges(textModel, false, void 0);
      foldingModel.update(ranges);
      const r1 = r(2, 3, false);
      const r2 = r(4, 6, false);
      assertRanges(foldingModel, [r1, r2]);
      assert.strictEqual(getNextFoldLine(1, foldingModel), 2);
      assert.strictEqual(getNextFoldLine(2, foldingModel), 4);
      assert.strictEqual(getNextFoldLine(3, foldingModel), 4);
      assert.strictEqual(getNextFoldLine(4, foldingModel), null);
      assert.strictEqual(getNextFoldLine(5, foldingModel), null);
      assert.strictEqual(getNextFoldLine(6, foldingModel), null);
      assert.strictEqual(getPreviousFoldLine(1, foldingModel), null);
      assert.strictEqual(getPreviousFoldLine(2, foldingModel), null);
      assert.strictEqual(getPreviousFoldLine(3, foldingModel), 2);
      assert.strictEqual(getPreviousFoldLine(4, foldingModel), 2);
      assert.strictEqual(getPreviousFoldLine(5, foldingModel), 4);
      assert.strictEqual(getPreviousFoldLine(6, foldingModel), 4);
    } finally {
      textModel.dispose();
    }
  });
  test("removeManualRanges - cursor on manual range removes innermost only", () => {
    const lines = [
      /* 1*/
      "class A {",
      /* 2*/
      "  void foo() {",
      /* 3*/
      "    if (true) {",
      /* 4*/
      "      return;",
      /* 5*/
      "    }",
      /* 6*/
      "  }",
      /* 7*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = [
        { startLineNumber: 1, endLineNumber: 6, type: void 0, isCollapsed: false, source: FoldSource.provider },
        { startLineNumber: 2, endLineNumber: 5, type: void 0, isCollapsed: false, source: FoldSource.userDefined },
        { startLineNumber: 3, endLineNumber: 4, type: void 0, isCollapsed: false, source: FoldSource.userDefined }
      ];
      foldingModel.update(FoldingRegions.fromFoldRanges(ranges));
      assertRanges(foldingModel, [r(1, 6), r(2, 5), r(3, 4)]);
      foldingModel.removeManualRanges([new Range(4, 1, 4, 1)]);
      assertRanges(foldingModel, [r(1, 6), r(2, 5)]);
      foldingModel.removeManualRanges([new Range(3, 1, 3, 1)]);
      assertRanges(foldingModel, [r(1, 6)]);
    } finally {
      textModel.dispose();
    }
  });
  test("removeManualRanges - cursor skips provider ranges to remove nearest manual range", () => {
    const lines = [
      /* 1*/
      "class A {",
      /* 2*/
      "  void foo() {",
      /* 3*/
      "    return;",
      /* 4*/
      "  }",
      /* 5*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = [
        { startLineNumber: 1, endLineNumber: 5, type: void 0, isCollapsed: false, source: FoldSource.userDefined },
        { startLineNumber: 2, endLineNumber: 4, type: void 0, isCollapsed: false, source: FoldSource.provider }
      ];
      foldingModel.update(FoldingRegions.fromFoldRanges(ranges));
      foldingModel.removeManualRanges([new Range(3, 1, 3, 1)]);
      assertRanges(foldingModel, [r(2, 4)]);
    } finally {
      textModel.dispose();
    }
  });
  test("removeManualRanges - cursor not on manual range removes all manual ranges", () => {
    const lines = [
      /* 1*/
      "// header",
      /* 2*/
      "class A {",
      /* 3*/
      "  void foo() {",
      /* 4*/
      "  }",
      /* 5*/
      "}",
      /* 6*/
      "// footer"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = [
        { startLineNumber: 2, endLineNumber: 4, type: void 0, isCollapsed: false, source: FoldSource.provider },
        { startLineNumber: 3, endLineNumber: 4, type: void 0, isCollapsed: false, source: FoldSource.userDefined }
      ];
      foldingModel.update(FoldingRegions.fromFoldRanges(ranges));
      assertRanges(foldingModel, [r(2, 4), r(3, 4)]);
      foldingModel.removeManualRanges([new Range(6, 1, 6, 2)]);
      assertRanges(foldingModel, [r(2, 4), r(3, 4)]);
      foldingModel.removeManualRanges([new Range(6, 1, 6, 1)]);
      assertRanges(foldingModel, [r(2, 4)]);
    } finally {
      textModel.dispose();
    }
  });
  test("removeManualRanges - single-line selection removes all intersecting manual ranges", () => {
    const lines = [
      /* 1*/
      "class A {",
      /* 2*/
      "  void foo() {",
      /* 3*/
      "    if (true) {",
      /* 4*/
      "      return;",
      /* 5*/
      "    }",
      /* 6*/
      "  }",
      /* 7*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = [
        { startLineNumber: 1, endLineNumber: 6, type: void 0, isCollapsed: false, source: FoldSource.provider },
        { startLineNumber: 2, endLineNumber: 5, type: void 0, isCollapsed: false, source: FoldSource.userDefined },
        { startLineNumber: 3, endLineNumber: 4, type: void 0, isCollapsed: false, source: FoldSource.userDefined }
      ];
      foldingModel.update(FoldingRegions.fromFoldRanges(ranges));
      foldingModel.removeManualRanges([new Range(4, 1, 4, 2)]);
      assertRanges(foldingModel, [r(1, 6)]);
    } finally {
      textModel.dispose();
    }
  });
  test("removeManualRanges - selection range removes intersecting manual ranges", () => {
    const lines = [
      /* 1*/
      "class A {",
      /* 2*/
      "  void foo() {",
      /* 3*/
      "  }",
      /* 4*/
      "  void bar() {",
      /* 5*/
      "  }",
      /* 6*/
      "}"
    ];
    const textModel = createTextModel(lines.join("\n"));
    try {
      const foldingModel = new FoldingModel(textModel, new TestDecorationProvider(textModel));
      const ranges = [
        { startLineNumber: 1, endLineNumber: 5, type: void 0, isCollapsed: false, source: FoldSource.provider },
        { startLineNumber: 2, endLineNumber: 3, type: void 0, isCollapsed: false, source: FoldSource.userDefined },
        { startLineNumber: 4, endLineNumber: 5, type: void 0, isCollapsed: false, source: FoldSource.userDefined }
      ];
      foldingModel.update(FoldingRegions.fromFoldRanges(ranges));
      assertRanges(foldingModel, [r(1, 5), r(2, 3), r(4, 5)]);
      foldingModel.removeManualRanges([new Range(2, 1, 3, 1)]);
      assertRanges(foldingModel, [r(1, 5), r(4, 5)]);
    } finally {
      textModel.dispose();
    }
  });
});
export {
  TestDecorationProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZvbGRpbmdcXHRlc3RcXGJyb3dzZXJcXGZvbGRpbmdNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCBJVGV4dE1vZGVsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IHRvU2VsZWN0ZWRMaW5lcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZm9sZGluZy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nTW9kZWwsIGdldE5leHRGb2xkTGluZSwgZ2V0UGFyZW50Rm9sZExpbmUsIGdldFByZXZpb3VzRm9sZExpbmUsIHNldENvbGxhcHNlU3RhdGVBdExldmVsLCBzZXRDb2xsYXBzZVN0YXRlRm9yTWF0Y2hpbmdMaW5lcywgc2V0Q29sbGFwc2VTdGF0ZUZvclJlc3QsIHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duLCBzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzVXAsIHNldENvbGxhcHNlU3RhdGVVcCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZm9sZGluZ01vZGVsLmpzJztcbmltcG9ydCB7IEZvbGRpbmdSZWdpb24sIEZvbGRpbmdSZWdpb25zLCBGb2xkUmFuZ2UsIEZvbGRTb3VyY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2ZvbGRpbmdSYW5nZXMuanMnO1xuaW1wb3J0IHsgY29tcHV0ZVJhbmdlcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaW5kZW50UmFuZ2VQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcblxuXG5pbnRlcmZhY2UgRXhwZWN0ZWRSZWdpb24ge1xuXHRzdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0ZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRpc0NvbGxhcHNlZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIEV4cGVjdGVkRGVjb3JhdGlvbiB7XG5cdGxpbmU6IG51bWJlcjtcblx0dHlwZTogJ2hpZGRlbicgfCAnY29sbGFwc2VkJyB8ICdleHBhbmRlZCc7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBjb2xsYXBzZWREZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRsaW5lc0RlY29yYXRpb25zQ2xhc3NOYW1lOiAnZm9sZGluZydcblx0fSk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgZXhwYW5kZWREZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRsaW5lc0RlY29yYXRpb25zQ2xhc3NOYW1lOiAnZm9sZGluZydcblx0fSk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgaGlkZGVuRGVjb3JhdGlvbiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0bGluZXNEZWNvcmF0aW9uc0NsYXNzTmFtZTogJ2ZvbGRpbmcnXG5cdH0pO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgbW9kZWw6IElUZXh0TW9kZWwpIHtcblx0fVxuXG5cdGdldERlY29yYXRpb25PcHRpb24oaXNDb2xsYXBzZWQ6IGJvb2xlYW4sIGlzSGlkZGVuOiBib29sZWFuKTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0aWYgKGlzSGlkZGVuKSB7XG5cdFx0XHRyZXR1cm4gVGVzdERlY29yYXRpb25Qcm92aWRlci5oaWRkZW5EZWNvcmF0aW9uO1xuXHRcdH1cblx0XHRpZiAoaXNDb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybiBUZXN0RGVjb3JhdGlvblByb3ZpZGVyLmNvbGxhcHNlZERlY29yYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiBUZXN0RGVjb3JhdGlvblByb3ZpZGVyLmV4cGFuZGVkRGVjb3JhdGlvbjtcblx0fVxuXG5cdGNoYW5nZURlY29yYXRpb25zPFQ+KGNhbGxiYWNrOiAoY2hhbmdlQWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpID0+IFQpOiAoVCB8IG51bGwpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucyhjYWxsYmFjayk7XG5cdH1cblxuXHRyZW1vdmVEZWNvcmF0aW9ucyhkZWNvcmF0aW9uSWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKGRlY29yYXRpb25JZHMsIFtdKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldERlY29yYXRpb25zKCk6IEV4cGVjdGVkRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMubW9kZWwuZ2V0QWxsRGVjb3JhdGlvbnMoKTtcblx0XHRjb25zdCByZXM6IEV4cGVjdGVkRGVjb3JhdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRlY29yYXRpb25zKSB7XG5cdFx0XHRpZiAoZGVjb3JhdGlvbi5vcHRpb25zID09PSBUZXN0RGVjb3JhdGlvblByb3ZpZGVyLmhpZGRlbkRlY29yYXRpb24pIHtcblx0XHRcdFx0cmVzLnB1c2goeyBsaW5lOiBkZWNvcmF0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgdHlwZTogJ2hpZGRlbicgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKGRlY29yYXRpb24ub3B0aW9ucyA9PT0gVGVzdERlY29yYXRpb25Qcm92aWRlci5jb2xsYXBzZWREZWNvcmF0aW9uKSB7XG5cdFx0XHRcdHJlcy5wdXNoKHsgbGluZTogZGVjb3JhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHR5cGU6ICdjb2xsYXBzZWQnIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChkZWNvcmF0aW9uLm9wdGlvbnMgPT09IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIuZXhwYW5kZWREZWNvcmF0aW9uKSB7XG5cdFx0XHRcdHJlcy5wdXNoKHsgbGluZTogZGVjb3JhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHR5cGU6ICdleHBhbmRlZCcgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXM7XG5cdH1cbn1cblxuc3VpdGUoJ0ZvbGRpbmcgTW9kZWwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRmdW5jdGlvbiByKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGlzQ29sbGFwc2VkOiBib29sZWFuID0gZmFsc2UpOiBFeHBlY3RlZFJlZ2lvbiB7XG5cdFx0cmV0dXJuIHsgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyLCBpc0NvbGxhcHNlZCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZChsaW5lOiBudW1iZXIsIHR5cGU6ICdoaWRkZW4nIHwgJ2NvbGxhcHNlZCcgfCAnZXhwYW5kZWQnKTogRXhwZWN0ZWREZWNvcmF0aW9uIHtcblx0XHRyZXR1cm4geyBsaW5lLCB0eXBlIH07XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRSZWdpb24oYWN0dWFsOiBGb2xkaW5nUmVnaW9uIHwgbnVsbCwgZXhwZWN0ZWQ6IEV4cGVjdGVkUmVnaW9uIHwgbnVsbCwgbWVzc2FnZT86IHN0cmluZykge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCghIWFjdHVhbCwgISFleHBlY3RlZCwgbWVzc2FnZSk7XG5cdFx0aWYgKGFjdHVhbCAmJiBleHBlY3RlZCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5zdGFydExpbmVOdW1iZXIsIGV4cGVjdGVkLnN0YXJ0TGluZU51bWJlciwgbWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmVuZExpbmVOdW1iZXIsIGV4cGVjdGVkLmVuZExpbmVOdW1iZXIsIG1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5pc0NvbGxhcHNlZCwgZXhwZWN0ZWQuaXNDb2xsYXBzZWQsIG1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydEZvbGRlZFJhbmdlcyhmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZXhwZWN0ZWRSZWdpb25zOiBFeHBlY3RlZFJlZ2lvbltdLCBtZXNzYWdlPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgYWN0dWFsUmFuZ2VzOiBFeHBlY3RlZFJlZ2lvbltdID0gW107XG5cdFx0Y29uc3QgYWN0dWFsID0gZm9sZGluZ01vZGVsLnJlZ2lvbnM7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3R1YWwubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChhY3R1YWwuaXNDb2xsYXBzZWQoaSkpIHtcblx0XHRcdFx0YWN0dWFsUmFuZ2VzLnB1c2gocihhY3R1YWwuZ2V0U3RhcnRMaW5lTnVtYmVyKGkpLCBhY3R1YWwuZ2V0RW5kTGluZU51bWJlcihpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFJhbmdlcywgZXhwZWN0ZWRSZWdpb25zLCBtZXNzYWdlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZXhwZWN0ZWRSZWdpb25zOiBFeHBlY3RlZFJlZ2lvbltdLCBtZXNzYWdlPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgYWN0dWFsUmFuZ2VzOiBFeHBlY3RlZFJlZ2lvbltdID0gW107XG5cdFx0Y29uc3QgYWN0dWFsID0gZm9sZGluZ01vZGVsLnJlZ2lvbnM7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3R1YWwubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFjdHVhbFJhbmdlcy5wdXNoKHIoYWN0dWFsLmdldFN0YXJ0TGluZU51bWJlcihpKSwgYWN0dWFsLmdldEVuZExpbmVOdW1iZXIoaSksIGFjdHVhbC5pc0NvbGxhcHNlZChpKSkpO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFJhbmdlcywgZXhwZWN0ZWRSZWdpb25zLCBtZXNzYWdlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydERlY29yYXRpb25zKGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBleHBlY3RlZERlY29yYXRpb246IEV4cGVjdGVkRGVjb3JhdGlvbltdLCBtZXNzYWdlPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZGVjb3JhdGlvblByb3ZpZGVyID0gZm9sZGluZ01vZGVsLmRlY29yYXRpb25Qcm92aWRlciBhcyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb3JhdGlvblByb3ZpZGVyLmdldERlY29yYXRpb25zKCksIGV4cGVjdGVkRGVjb3JhdGlvbiwgbWVzc2FnZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRSZWdpb25zKGFjdHVhbDogRm9sZGluZ1JlZ2lvbltdLCBleHBlY3RlZFJlZ2lvbnM6IEV4cGVjdGVkUmVnaW9uW10sIG1lc3NhZ2U/OiBzdHJpbmcpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5tYXAociA9PiAoeyBzdGFydExpbmVOdW1iZXI6IHIuc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyOiByLmVuZExpbmVOdW1iZXIsIGlzQ29sbGFwc2VkOiByLmlzQ29sbGFwc2VkIH0pKSwgZXhwZWN0ZWRSZWdpb25zLCBtZXNzYWdlKTtcblx0fVxuXG5cdHRlc3QoJ2dldFJlZ2lvbkF0TGluZScsICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHQvKiAxKi9cdCcvKionLFxuXHRcdC8qIDIqL1x0JyAqIENvbW1lbnQnLFxuXHRcdC8qIDMqL1x0JyAqLycsXG5cdFx0LyogNCovXHQnY2xhc3MgQSB7Jyxcblx0XHQvKiA1Ki9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0LyogNiovXHQnICAgIC8vIGNvbW1lbnQgeycsXG5cdFx0LyogNyovXHQnICB9Jyxcblx0XHQvKiA4Ki9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDMsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIyID0gcig0LCA3LCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMyA9IHIoNSwgNiwgZmFsc2UpO1xuXG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHIyLCByM10pO1xuXG5cdFx0XHRhc3NlcnRSZWdpb24oZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSgxKSwgcjEsICcxJyk7XG5cdFx0XHRhc3NlcnRSZWdpb24oZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSgyKSwgcjEsICcyJyk7XG5cdFx0XHRhc3NlcnRSZWdpb24oZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSgzKSwgcjEsICczJyk7XG5cdFx0XHRhc3NlcnRSZWdpb24oZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSg0KSwgcjIsICc0Jyk7XG5cdFx0XHRhc3NlcnRSZWdpb24oZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSg1KSwgcjMsICc1Jyk7XG5cdFx0XHRhc3NlcnRSZWdpb24oZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSg2KSwgcjMsICc1Jyk7XG5cdFx0XHRhc3NlcnRSZWdpb24oZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSg3KSwgcjIsICc2Jyk7XG5cdFx0XHRhc3NlcnRSZWdpb24oZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSg4KSwgbnVsbCwgJzcnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblxuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYXBzZScsICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHQvKiAxKi9cdCcvKionLFxuXHRcdC8qIDIqL1x0JyAqIENvbW1lbnQnLFxuXHRcdC8qIDMqL1x0JyAqLycsXG5cdFx0LyogNCovXHQnY2xhc3MgQSB7Jyxcblx0XHQvKiA1Ki9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0LyogNiovXHQnICAgIC8vIGNvbW1lbnQgeycsXG5cdFx0LyogNyovXHQnICB9Jyxcblx0XHQvKiA4Ki9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDMsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIyID0gcig0LCA3LCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMyA9IHIoNSwgNiwgZmFsc2UpO1xuXG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHIyLCByM10pO1xuXG5cdFx0XHRmb2xkaW5nTW9kZWwudG9nZ2xlQ29sbGFwc2VTdGF0ZShbZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSgxKSFdKTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IoMSwgMywgdHJ1ZSksIHIyLCByM10pO1xuXG5cdFx0XHRmb2xkaW5nTW9kZWwudG9nZ2xlQ29sbGFwc2VTdGF0ZShbZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSg1KSFdKTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IoMSwgMywgdHJ1ZSksIHIyLCByKDUsIDYsIHRydWUpXSk7XG5cblx0XHRcdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKFtmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uQXRMaW5lKDcpIV0pO1xuXHRcdFx0Zm9sZGluZ01vZGVsLnVwZGF0ZShyYW5nZXMpO1xuXG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcigxLCAzLCB0cnVlKSwgcig0LCA3LCB0cnVlKSwgcig1LCA2LCB0cnVlKV0pO1xuXG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0LyogMSovXHQnLyoqJyxcblx0XHQvKiAyKi9cdCcgKiBDb21tZW50Jyxcblx0XHQvKiAzKi9cdCcgKi8nLFxuXHRcdC8qIDQqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogNSovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDYqL1x0JyAgICAvLyBjb21tZW50IHsnLFxuXHRcdC8qIDcqL1x0JyAgfScsXG5cdFx0LyogOCovXHQnfSddO1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gbmV3IEZvbGRpbmdNb2RlbCh0ZXh0TW9kZWwsIG5ldyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyKHRleHRNb2RlbCkpO1xuXG5cdFx0XHRjb25zdCByYW5nZXMgPSBjb21wdXRlUmFuZ2VzKHRleHRNb2RlbCwgZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKHJhbmdlcyk7XG5cblx0XHRcdGNvbnN0IHIxID0gcigxLCAzLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoNCwgNywgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjMgPSByKDUsIDYsIGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMiwgcjNdKTtcblx0XHRcdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKFtmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uQXRMaW5lKDIpISwgZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSg1KSFdKTtcblxuXHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbig0LCAxKSwgJy8vaGVsbG9cXG4nKV0pO1xuXG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgdW5kZWZpbmVkKSk7XG5cblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyKDEsIDMsIHRydWUpLCByKDUsIDgsIGZhbHNlKSwgcig2LCA3LCB0cnVlKV0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdC8qIDEqL1x0J2Z1bmN0aW9uIGZvbygpIHsnLFxuXHRcdC8qIDIqL1x0JyAgc3dpdGNoICh4KSB7Jyxcblx0XHQvKiAzKi9cdCcgICAgY2FzZSAxOicsXG5cdFx0LyogNCovXHQnICAgICAgLy9oZWxsbzEnLFxuXHRcdC8qIDUqL1x0JyAgICAgIGJyZWFrOycsXG5cdFx0LyogNiovXHQnICAgIGNhc2UgMjonLFxuXHRcdC8qIDcqL1x0JyAgICAgIC8vaGVsbG8yJyxcblx0XHQvKiA4Ki9cdCcgICAgICBicmVhazsnLFxuXHRcdC8qIDkqL1x0JyAgICBjYXNlIDM6Jyxcblx0XHQvKiAxMCovXHQnICAgICAgLy9oZWxsbzMnLFxuXHRcdC8qIDExKi9cdCcgICAgICBicmVhazsnLFxuXHRcdC8qIDEyKi9cdCcgIH0nLFxuXHRcdC8qIDEzKi9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDEyLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoMiwgMTEsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIzID0gcigzLCA1LCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNCA9IHIoNiwgOCwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjUgPSByKDksIDExLCBmYWxzZSk7XG5cblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyMSwgcjIsIHIzLCByNCwgcjVdKTtcblx0XHRcdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKFtmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uQXRMaW5lKDYpIV0pO1xuXG5cdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDYsIDExLCA5LCAwKSldKTtcblxuXHRcdFx0Zm9sZGluZ01vZGVsLnVwZGF0ZShjb21wdXRlUmFuZ2VzKHRleHRNb2RlbCwgdHJ1ZSwgdW5kZWZpbmVkKSwgdG9TZWxlY3RlZExpbmVzKFtuZXcgU2VsZWN0aW9uKDcsIDEsIDcsIDEpXSkpO1xuXG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcigxLCA5LCBmYWxzZSksIHIoMiwgOCwgZmFsc2UpLCByKDMsIDUsIGZhbHNlKSwgcig2LCA4LCBmYWxzZSldKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJlZ2lvbnNJbnNpZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0LyogMSovXHQnLyoqJyxcblx0XHQvKiAyKi9cdCcgKiBDb21tZW50Jyxcblx0XHQvKiAzKi9cdCcgKi8nLFxuXHRcdC8qIDQqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogNSovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDYqL1x0JyAgICAvLyBjb21tZW50IHsnLFxuXHRcdC8qIDcqL1x0JyAgfScsXG5cdFx0LyogOCovXHQnfSddO1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gbmV3IEZvbGRpbmdNb2RlbCh0ZXh0TW9kZWwsIG5ldyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyKHRleHRNb2RlbCkpO1xuXG5cdFx0XHRjb25zdCByYW5nZXMgPSBjb21wdXRlUmFuZ2VzKHRleHRNb2RlbCwgZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKHJhbmdlcyk7XG5cblx0XHRcdGNvbnN0IHIxID0gcigxLCAzLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoNCwgNywgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjMgPSByKDUsIDYsIGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMiwgcjNdKTtcblx0XHRcdGNvbnN0IHJlZ2lvbjEgPSBmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uQXRMaW5lKHIxLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCByZWdpb24yID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZShyMi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgcmVnaW9uMyA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUocjMuc3RhcnRMaW5lTnVtYmVyKTtcblxuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShudWxsKSwgW3IxLCByMiwgcjNdLCAnMScpO1xuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShyZWdpb24xKSwgW10sICcyJyk7XG5cdFx0XHRhc3NlcnRSZWdpb25zKGZvbGRpbmdNb2RlbC5nZXRSZWdpb25zSW5zaWRlKHJlZ2lvbjIpLCBbcjNdLCAnMycpO1xuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShyZWdpb24zKSwgW10sICc0Jyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJlZ2lvbnNJbnNpZGVXaXRoTGV2ZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHQvKiAxKi9cdCcvLyNyZWdpb24nLFxuXHRcdFx0LyogMiovXHQnLy8jZW5kcmVnaW9uJyxcblx0XHRcdC8qIDMqL1x0J2NsYXNzIEEgeycsXG5cdFx0XHQvKiA0Ki9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0XHQvKiA1Ki9cdCcgICAgaWYgKHRydWUpIHsnLFxuXHRcdFx0LyogNiovXHQnICAgICAgICByZXR1cm47Jyxcblx0XHRcdC8qIDcqL1x0JyAgICB9Jyxcblx0XHRcdC8qIDgqL1x0JyAgICBpZiAodHJ1ZSkgeycsXG5cdFx0XHQvKiA5Ki9cdCcgICAgICByZXR1cm47Jyxcblx0XHRcdC8qIDEwKi9cdCcgICAgfScsXG5cdFx0XHQvKiAxMSovXHQnICB9Jyxcblx0XHRcdC8qIDEyKi9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cblx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IG5ldyBGb2xkaW5nTW9kZWwodGV4dE1vZGVsLCBuZXcgVGVzdERlY29yYXRpb25Qcm92aWRlcih0ZXh0TW9kZWwpKTtcblxuXHRcdFx0Y29uc3QgcmFuZ2VzID0gY29tcHV0ZVJhbmdlcyh0ZXh0TW9kZWwsIGZhbHNlLCB7IHN0YXJ0OiAvXlxcL1xcLyNyZWdpb24kLywgZW5kOiAvXlxcL1xcLyNlbmRyZWdpb24kLyB9KTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDIsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIyID0gcigzLCAxMSwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjMgPSByKDQsIDEwLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNCA9IHIoNSwgNiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjUgPSByKDgsIDksIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcmVnaW9uMSA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUocjEuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IHJlZ2lvbjIgPSBmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uQXRMaW5lKHIyLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCByZWdpb24zID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZShyMy5zdGFydExpbmVOdW1iZXIpO1xuXG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHIyLCByMywgcjQsIHI1XSk7XG5cblx0XHRcdGFzc2VydFJlZ2lvbnMoZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUobnVsbCwgKHIsIGxldmVsKSA9PiBsZXZlbCA9PT0gMSksIFtyMSwgcjJdLCAnMScpO1xuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShudWxsLCAociwgbGV2ZWwpID0+IGxldmVsID09PSAyKSwgW3IzXSwgJzInKTtcblx0XHRcdGFzc2VydFJlZ2lvbnMoZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUobnVsbCwgKHIsIGxldmVsKSA9PiBsZXZlbCA9PT0gMyksIFtyNCwgcjVdLCAnMycpO1xuXG5cdFx0XHRhc3NlcnRSZWdpb25zKGZvbGRpbmdNb2RlbC5nZXRSZWdpb25zSW5zaWRlKHJlZ2lvbjIsIChyLCBsZXZlbCkgPT4gbGV2ZWwgPT09IDEpLCBbcjNdLCAnNCcpO1xuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShyZWdpb24yLCAociwgbGV2ZWwpID0+IGxldmVsID09PSAyKSwgW3I0LCByNV0sICc1Jyk7XG5cdFx0XHRhc3NlcnRSZWdpb25zKGZvbGRpbmdNb2RlbC5nZXRSZWdpb25zSW5zaWRlKHJlZ2lvbjMsIChyLCBsZXZlbCkgPT4gbGV2ZWwgPT09IDEpLCBbcjQsIHI1XSwgJzYnKTtcblxuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShyZWdpb24yLCAociwgbGV2ZWwpID0+IHIuaGlkZXNMaW5lKDkpKSwgW3IzLCByNV0sICc3Jyk7XG5cblx0XHRcdGFzc2VydFJlZ2lvbnMoZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUocmVnaW9uMSwgKHIsIGxldmVsKSA9PiBsZXZlbCA9PT0gMSksIFtdLCAnOCcpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHR9KTtcblxuXHR0ZXN0KCdnZXRSZWdpb25BdExpbmUyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdC8qIDEqL1x0Jy8vI3JlZ2lvbicsXG5cdFx0LyogMiovXHQnY2xhc3MgQSB7Jyxcblx0XHQvKiAzKi9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0LyogNCovXHQnICAgIGlmICh0cnVlKSB7Jyxcblx0XHQvKiA1Ki9cdCcgICAgICAvL2hlbGxvJyxcblx0XHQvKiA2Ki9cdCcgICAgfScsXG5cdFx0LyogNyovXHQnJyxcblx0XHQvKiA4Ki9cdCcgIH0nLFxuXHRcdC8qIDkqL1x0J30nLFxuXHRcdC8qIDEwKi9cdCcvLyNlbmRyZWdpb24nLFxuXHRcdC8qIDExKi9cdCcnXTtcblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IG5ldyBGb2xkaW5nTW9kZWwodGV4dE1vZGVsLCBuZXcgVGVzdERlY29yYXRpb25Qcm92aWRlcih0ZXh0TW9kZWwpKTtcblxuXHRcdFx0Y29uc3QgcmFuZ2VzID0gY29tcHV0ZVJhbmdlcyh0ZXh0TW9kZWwsIGZhbHNlLCB7IHN0YXJ0OiAvXlxcL1xcLyNyZWdpb24kLywgZW5kOiAvXlxcL1xcLyNlbmRyZWdpb24kLyB9KTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDEwLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoMiwgOCwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjMgPSByKDMsIDcsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHI0ID0gcig0LCA1LCBmYWxzZSk7XG5cblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyMSwgcjIsIHIzLCByNF0pO1xuXG5cdFx0XHRhc3NlcnRSZWdpb25zKGZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKDEpLCBbcjFdLCAnMScpO1xuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0QWxsUmVnaW9uc0F0TGluZSgyKSwgW3IxLCByMl0ucmV2ZXJzZSgpLCAnMicpO1xuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0QWxsUmVnaW9uc0F0TGluZSgzKSwgW3IxLCByMiwgcjNdLnJldmVyc2UoKSwgJzMnKTtcblx0XHRcdGFzc2VydFJlZ2lvbnMoZm9sZGluZ01vZGVsLmdldEFsbFJlZ2lvbnNBdExpbmUoNCksIFtyMSwgcjIsIHIzLCByNF0ucmV2ZXJzZSgpLCAnNCcpO1xuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0QWxsUmVnaW9uc0F0TGluZSg1KSwgW3IxLCByMiwgcjMsIHI0XS5yZXZlcnNlKCksICc1Jyk7XG5cdFx0XHRhc3NlcnRSZWdpb25zKGZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKDYpLCBbcjEsIHIyLCByM10ucmV2ZXJzZSgpLCAnNicpO1xuXHRcdFx0YXNzZXJ0UmVnaW9ucyhmb2xkaW5nTW9kZWwuZ2V0QWxsUmVnaW9uc0F0TGluZSg3KSwgW3IxLCByMiwgcjNdLnJldmVyc2UoKSwgJzcnKTtcblx0XHRcdGFzc2VydFJlZ2lvbnMoZm9sZGluZ01vZGVsLmdldEFsbFJlZ2lvbnNBdExpbmUoOCksIFtyMSwgcjJdLnJldmVyc2UoKSwgJzgnKTtcblx0XHRcdGFzc2VydFJlZ2lvbnMoZm9sZGluZ01vZGVsLmdldEFsbFJlZ2lvbnNBdExpbmUoOSksIFtyMV0sICc5Jyk7XG5cdFx0XHRhc3NlcnRSZWdpb25zKGZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKDEwKSwgW3IxXSwgJzEwJyk7XG5cdFx0XHRhc3NlcnRSZWdpb25zKGZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKDExKSwgW10sICcxMCcpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2V0Q29sbGFwc2VTdGF0ZVJlY3Vyc2l2bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0LyogMSovXHQnLy8jcmVnaW9uJyxcblx0XHQvKiAyKi9cdCcvLyNlbmRyZWdpb24nLFxuXHRcdC8qIDMqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogNCovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDUqL1x0JyAgICBpZiAodHJ1ZSkgeycsXG5cdFx0LyogNiovXHQnICAgICAgICByZXR1cm47Jyxcblx0XHQvKiA3Ki9cdCcgICAgfScsXG5cdFx0LyogOCovXHQnJyxcblx0XHQvKiA5Ki9cdCcgICAgaWYgKHRydWUpIHsnLFxuXHRcdC8qIDEwKi9cdCcgICAgICByZXR1cm47Jyxcblx0XHQvKiAxMSovXHQnICAgIH0nLFxuXHRcdC8qIDEyKi9cdCcgIH0nLFxuXHRcdC8qIDEzKi9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgeyBzdGFydDogL15cXC9cXC8jcmVnaW9uJC8sIGVuZDogL15cXC9cXC8jZW5kcmVnaW9uJC8gfSk7XG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKHJhbmdlcyk7XG5cblx0XHRcdGNvbnN0IHIxID0gcigxLCAyLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoMywgMTIsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIzID0gcig0LCAxMSwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjQgPSByKDUsIDYsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHI1ID0gcig5LCAxMCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMiwgcjMsIHI0LCByNV0pO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIHRydWUsIE51bWJlci5NQVhfVkFMVUUsIFs0XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjMsIHI0LCByNV0sICcxJyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgZmFsc2UsIE51bWJlci5NQVhfVkFMVUUsIFs4XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbXSwgJzInKTtcblxuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUxldmVsc0Rvd24oZm9sZGluZ01vZGVsLCB0cnVlLCBOdW1iZXIuTUFYX1ZBTFVFLCBbMTJdKTtcblx0XHRcdGFzc2VydEZvbGRlZFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyMiwgcjMsIHI0LCByNV0sICcxJyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgZmFsc2UsIE51bWJlci5NQVhfVkFMVUUsIFs3XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjJdLCAnMScpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEZvbGRlZFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtdLCAnMScpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMiwgcjMsIHI0LCByNV0sICcxJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdHRlc3QoJ3NldENvbGxhcHNlU3RhdGVBdExldmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdC8qIDEqL1x0Jy8vI3JlZ2lvbicsXG5cdFx0LyogMiovXHQnLy8jZW5kcmVnaW9uJyxcblx0XHQvKiAzKi9cdCdjbGFzcyBBIHsnLFxuXHRcdC8qIDQqL1x0JyAgdm9pZCBmb28oKSB7Jyxcblx0XHQvKiA1Ki9cdCcgICAgaWYgKHRydWUpIHsnLFxuXHRcdC8qIDYqL1x0JyAgICAgICAgcmV0dXJuOycsXG5cdFx0LyogNyovXHQnICAgIH0nLFxuXHRcdC8qIDgqL1x0JycsXG5cdFx0LyogOSovXHQnICAgIGlmICh0cnVlKSB7Jyxcblx0XHQvKiAxMCovXHQnICAgICAgcmV0dXJuOycsXG5cdFx0LyogMTEqL1x0JyAgICB9Jyxcblx0XHQvKiAxMiovXHQnICB9Jyxcblx0XHQvKiAxMyovXHQnICAvLyNyZWdpb24nLFxuXHRcdC8qIDE0Ki9cdCcgIGNvbnN0IGJhciA9IDk7Jyxcblx0XHQvKiAxNSovXHQnICAvLyNlbmRyZWdpb24nLFxuXHRcdC8qIDE2Ki9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgeyBzdGFydDogL15cXHMqXFwvXFwvI3JlZ2lvbiQvLCBlbmQ6IC9eXFxzKlxcL1xcLyNlbmRyZWdpb24kLyB9KTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDIsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIyID0gcigzLCAxNSwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjMgPSByKDQsIDExLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNCA9IHIoNSwgNiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjUgPSByKDksIDEwLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNiA9IHIoMTMsIDE1LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHIyLCByMywgcjQsIHI1LCByNl0pO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlQXRMZXZlbChmb2xkaW5nTW9kZWwsIDEsIHRydWUsIFtdKTtcblx0XHRcdGFzc2VydEZvbGRlZFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyMSwgcjJdLCAnMScpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlQXRMZXZlbChmb2xkaW5nTW9kZWwsIDEsIGZhbHNlLCBbNV0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IyXSwgJzInKTtcblxuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUF0TGV2ZWwoZm9sZGluZ01vZGVsLCAxLCBmYWxzZSwgWzFdKTtcblx0XHRcdGFzc2VydEZvbGRlZFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtdLCAnMycpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlQXRMZXZlbChmb2xkaW5nTW9kZWwsIDIsIHRydWUsIFtdKTtcblx0XHRcdGFzc2VydEZvbGRlZFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyMywgcjZdLCAnNCcpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlQXRMZXZlbChmb2xkaW5nTW9kZWwsIDIsIGZhbHNlLCBbNSwgNl0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IzXSwgJzUnKTtcblxuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUF0TGV2ZWwoZm9sZGluZ01vZGVsLCAzLCB0cnVlLCBbNCwgOV0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IzLCByNF0sICc2Jyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVBdExldmVsKGZvbGRpbmdNb2RlbCwgMywgZmFsc2UsIFs0LCA5XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjNdLCAnNycpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2V0Q29sbGFwc2VTdGF0ZUxldmVsc0Rvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0LyogMSovXHQnLy8jcmVnaW9uJyxcblx0XHQvKiAyKi9cdCcvLyNlbmRyZWdpb24nLFxuXHRcdC8qIDMqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogNCovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDUqL1x0JyAgICBpZiAodHJ1ZSkgeycsXG5cdFx0LyogNiovXHQnICAgICAgICByZXR1cm47Jyxcblx0XHQvKiA3Ki9cdCcgICAgfScsXG5cdFx0LyogOCovXHQnJyxcblx0XHQvKiA5Ki9cdCcgICAgaWYgKHRydWUpIHsnLFxuXHRcdC8qIDEwKi9cdCcgICAgICByZXR1cm47Jyxcblx0XHQvKiAxMSovXHQnICAgIH0nLFxuXHRcdC8qIDEyKi9cdCcgIH0nLFxuXHRcdC8qIDEzKi9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgeyBzdGFydDogL15cXC9cXC8jcmVnaW9uJC8sIGVuZDogL15cXC9cXC8jZW5kcmVnaW9uJC8gfSk7XG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKHJhbmdlcyk7XG5cblx0XHRcdGNvbnN0IHIxID0gcigxLCAyLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoMywgMTIsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIzID0gcig0LCAxMSwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjQgPSByKDUsIDYsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHI1ID0gcig5LCAxMCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMiwgcjMsIHI0LCByNV0pO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIHRydWUsIDEsIFs0XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjNdLCAnMScpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIHRydWUsIDIsIFs0XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjMsIHI0LCByNV0sICcyJyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgZmFsc2UsIDIsIFszXSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjQsIHI1XSwgJzMnKTtcblxuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUxldmVsc0Rvd24oZm9sZGluZ01vZGVsLCBmYWxzZSwgMiwgWzJdKTtcblx0XHRcdGFzc2VydEZvbGRlZFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyNCwgcjVdLCAnNCcpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIHRydWUsIDQsIFsyXSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHI0LCByNV0sICc1Jyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgZmFsc2UsIDQsIFsyLCAzXSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbXSwgJzYnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3NldENvbGxhcHNlU3RhdGVMZXZlbHNVcCcsICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHQvKiAxKi9cdCcvLyNyZWdpb24nLFxuXHRcdC8qIDIqL1x0Jy8vI2VuZHJlZ2lvbicsXG5cdFx0LyogMyovXHQnY2xhc3MgQSB7Jyxcblx0XHQvKiA0Ki9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0LyogNSovXHQnICAgIGlmICh0cnVlKSB7Jyxcblx0XHQvKiA2Ki9cdCcgICAgICAgIHJldHVybjsnLFxuXHRcdC8qIDcqL1x0JyAgICB9Jyxcblx0XHQvKiA4Ki9cdCcnLFxuXHRcdC8qIDkqL1x0JyAgICBpZiAodHJ1ZSkgeycsXG5cdFx0LyogMTAqL1x0JyAgICAgIHJldHVybjsnLFxuXHRcdC8qIDExKi9cdCcgICAgfScsXG5cdFx0LyogMTIqL1x0JyAgfScsXG5cdFx0LyogMTMqL1x0J30nXTtcblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IG5ldyBGb2xkaW5nTW9kZWwodGV4dE1vZGVsLCBuZXcgVGVzdERlY29yYXRpb25Qcm92aWRlcih0ZXh0TW9kZWwpKTtcblxuXHRcdFx0Y29uc3QgcmFuZ2VzID0gY29tcHV0ZVJhbmdlcyh0ZXh0TW9kZWwsIGZhbHNlLCB7IHN0YXJ0OiAvXlxcL1xcLyNyZWdpb24kLywgZW5kOiAvXlxcL1xcLyNlbmRyZWdpb24kLyB9KTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDIsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIyID0gcigzLCAxMiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjMgPSByKDQsIDExLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNCA9IHIoNSwgNiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjUgPSByKDksIDEwLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHIyLCByMywgcjQsIHI1XSk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNVcChmb2xkaW5nTW9kZWwsIHRydWUsIDEsIFs0XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjNdLCAnMScpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzVXAoZm9sZGluZ01vZGVsLCB0cnVlLCAyLCBbNF0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IyLCByM10sICcyJyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNVcChmb2xkaW5nTW9kZWwsIGZhbHNlLCA0LCBbMSwgMywgNF0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW10sICczJyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNVcChmb2xkaW5nTW9kZWwsIHRydWUsIDIsIFsxMF0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IzLCByNV0sICc0Jyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdHRlc3QoJ3NldENvbGxhcHNlU3RhdGVVcCcsICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHQvKiAxKi9cdCcvLyNyZWdpb24nLFxuXHRcdC8qIDIqL1x0Jy8vI2VuZHJlZ2lvbicsXG5cdFx0LyogMyovXHQnY2xhc3MgQSB7Jyxcblx0XHQvKiA0Ki9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0LyogNSovXHQnICAgIGlmICh0cnVlKSB7Jyxcblx0XHQvKiA2Ki9cdCcgICAgICAgIHJldHVybjsnLFxuXHRcdC8qIDcqL1x0JyAgICB9Jyxcblx0XHQvKiA4Ki9cdCcnLFxuXHRcdC8qIDkqL1x0JyAgICBpZiAodHJ1ZSkgeycsXG5cdFx0LyogMTAqL1x0JyAgICAgIHJldHVybjsnLFxuXHRcdC8qIDExKi9cdCcgICAgfScsXG5cdFx0LyogMTIqL1x0JyAgfScsXG5cdFx0LyogMTMqL1x0J30nXTtcblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IG5ldyBGb2xkaW5nTW9kZWwodGV4dE1vZGVsLCBuZXcgVGVzdERlY29yYXRpb25Qcm92aWRlcih0ZXh0TW9kZWwpKTtcblxuXHRcdFx0Y29uc3QgcmFuZ2VzID0gY29tcHV0ZVJhbmdlcyh0ZXh0TW9kZWwsIGZhbHNlLCB7IHN0YXJ0OiAvXlxcL1xcLyNyZWdpb24kLywgZW5kOiAvXlxcL1xcLyNlbmRyZWdpb24kLyB9KTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDIsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIyID0gcigzLCAxMiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjMgPSByKDQsIDExLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNCA9IHIoNSwgNiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjUgPSByKDksIDEwLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHIyLCByMywgcjQsIHI1XSk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVVcChmb2xkaW5nTW9kZWwsIHRydWUsIFs1XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjRdLCAnMScpO1xuXG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlVXAoZm9sZGluZ01vZGVsLCB0cnVlLCBbNV0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IzLCByNF0sICcyJyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVVcChmb2xkaW5nTW9kZWwsIHRydWUsIFs0XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjIsIHIzLCByNF0sICcyJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cblx0dGVzdCgnc2V0Q29sbGFwc2VTdGF0ZUZvck1hdGNoaW5nTGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0LyogMSovXHQnLyoqJyxcblx0XHQvKiAyKi9cdCcgKiB0aGUgY2xhc3MnLFxuXHRcdC8qIDMqL1x0JyAqLycsXG5cdFx0LyogNCovXHQnY2xhc3MgQSB7Jyxcblx0XHQvKiA1Ki9cdCcgIC8qKicsXG5cdFx0LyogNiovXHQnICAgKiB0aGUgZm9vJyxcblx0XHQvKiA3Ki9cdCcgICAqLycsXG5cdFx0LyogOCovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDkqL1x0JyAgICAvKicsXG5cdFx0LyogMTAqL1x0JyAgICAgKiB0aGUgY29tbWVudCcsXG5cdFx0LyogMTEqL1x0JyAgICAgKi8nLFxuXHRcdC8qIDEyKi9cdCcgIH0nLFxuXHRcdC8qIDEzKi9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgeyBzdGFydDogL15cXC9cXC8jcmVnaW9uJC8sIGVuZDogL15cXC9cXC8jZW5kcmVnaW9uJC8gfSk7XG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKHJhbmdlcyk7XG5cblx0XHRcdGNvbnN0IHIxID0gcigxLCAzLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoNCwgMTIsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIzID0gcig1LCA3LCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNCA9IHIoOCwgMTEsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHI1ID0gcig5LCAxMSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMiwgcjMsIHI0LCByNV0pO1xuXG5cdFx0XHRjb25zdCByZWdFeHAgPSBuZXcgUmVnRXhwKCdeXFxcXHMqJyArIGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoJy8qJykpO1xuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUZvck1hdGNoaW5nTGluZXMoZm9sZGluZ01vZGVsLCByZWdFeHAsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMywgcjVdLCAnMScpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHR9KTtcblxuXG5cdHRlc3QoJ3NldENvbGxhcHNlU3RhdGVGb3JSZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdC8qIDEqL1x0Jy8vI3JlZ2lvbicsXG5cdFx0LyogMiovXHQnLy8jZW5kcmVnaW9uJyxcblx0XHQvKiAzKi9cdCdjbGFzcyBBIHsnLFxuXHRcdC8qIDQqL1x0JyAgdm9pZCBmb28oKSB7Jyxcblx0XHQvKiA1Ki9cdCcgICAgaWYgKHRydWUpIHsnLFxuXHRcdC8qIDYqL1x0JyAgICAgICAgcmV0dXJuOycsXG5cdFx0LyogNyovXHQnICAgIH0nLFxuXHRcdC8qIDgqL1x0JycsXG5cdFx0LyogOSovXHQnICAgIGlmICh0cnVlKSB7Jyxcblx0XHQvKiAxMCovXHQnICAgICAgcmV0dXJuOycsXG5cdFx0LyogMTEqL1x0JyAgICB9Jyxcblx0XHQvKiAxMiovXHQnICB9Jyxcblx0XHQvKiAxMyovXHQnfSddO1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gbmV3IEZvbGRpbmdNb2RlbCh0ZXh0TW9kZWwsIG5ldyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyKHRleHRNb2RlbCkpO1xuXG5cdFx0XHRjb25zdCByYW5nZXMgPSBjb21wdXRlUmFuZ2VzKHRleHRNb2RlbCwgZmFsc2UsIHsgc3RhcnQ6IC9eXFwvXFwvI3JlZ2lvbiQvLCBlbmQ6IC9eXFwvXFwvI2VuZHJlZ2lvbiQvIH0pO1xuXHRcdFx0Zm9sZGluZ01vZGVsLnVwZGF0ZShyYW5nZXMpO1xuXG5cdFx0XHRjb25zdCByMSA9IHIoMSwgMiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjIgPSByKDMsIDEyLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMyA9IHIoNCwgMTEsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHI0ID0gcig1LCA2LCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNSA9IHIoOSwgMTAsIGZhbHNlKTtcblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyMSwgcjIsIHIzLCByNCwgcjVdKTtcblxuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUZvclJlc3QoZm9sZGluZ01vZGVsLCB0cnVlLCBbNV0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByNV0sICcxJyk7XG5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVGb3JSZXN0KGZvbGRpbmdNb2RlbCwgZmFsc2UsIFs1XSk7XG5cdFx0XHRhc3NlcnRGb2xkZWRSYW5nZXMoZm9sZGluZ01vZGVsLCBbXSwgJzInKTtcblxuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUZvclJlc3QoZm9sZGluZ01vZGVsLCB0cnVlLCBbMV0pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IyLCByMywgcjQsIHI1XSwgJzMnKTtcblxuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUZvclJlc3QoZm9sZGluZ01vZGVsLCB0cnVlLCBbM10pO1xuXHRcdFx0YXNzZXJ0Rm9sZGVkUmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMiwgcjMsIHI0LCByNV0sICczJyk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0fSk7XG5cblxuXHR0ZXN0KCdmb2xkaW5nIGRlY29yYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0LyogMSovXHQnY2xhc3MgQSB7Jyxcblx0XHQvKiAyKi9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0LyogMyovXHQnICAgIGlmICh0cnVlKSB7Jyxcblx0XHQvKiA0Ki9cdCcgICAgICBob28oKTsnLFxuXHRcdC8qIDUqL1x0JyAgICB9Jyxcblx0XHQvKiA2Ki9cdCcgIH0nLFxuXHRcdC8qIDcqL1x0J30nXTtcblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IG5ldyBGb2xkaW5nTW9kZWwodGV4dE1vZGVsLCBuZXcgVGVzdERlY29yYXRpb25Qcm92aWRlcih0ZXh0TW9kZWwpKTtcblxuXHRcdFx0Y29uc3QgcmFuZ2VzID0gY29tcHV0ZVJhbmdlcyh0ZXh0TW9kZWwsIGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0Zm9sZGluZ01vZGVsLnVwZGF0ZShyYW5nZXMpO1xuXG5cdFx0XHRjb25zdCByMSA9IHIoMSwgNiwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjIgPSByKDIsIDUsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIzID0gcigzLCA0LCBmYWxzZSk7XG5cblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyMSwgcjIsIHIzXSk7XG5cdFx0XHRhc3NlcnREZWNvcmF0aW9ucyhmb2xkaW5nTW9kZWwsIFtkKDEsICdleHBhbmRlZCcpLCBkKDIsICdleHBhbmRlZCcpLCBkKDMsICdleHBhbmRlZCcpXSk7XG5cblx0XHRcdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKFtmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uQXRMaW5lKDIpIV0pO1xuXG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHIoMiwgNSwgdHJ1ZSksIHIzXSk7XG5cdFx0XHRhc3NlcnREZWNvcmF0aW9ucyhmb2xkaW5nTW9kZWwsIFtkKDEsICdleHBhbmRlZCcpLCBkKDIsICdjb2xsYXBzZWQnKSwgZCgzLCAnaGlkZGVuJyldKTtcblxuXHRcdFx0Zm9sZGluZ01vZGVsLnVwZGF0ZShyYW5nZXMpO1xuXG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcjEsIHIoMiwgNSwgdHJ1ZSksIHIzXSk7XG5cdFx0XHRhc3NlcnREZWNvcmF0aW9ucyhmb2xkaW5nTW9kZWwsIFtkKDEsICdleHBhbmRlZCcpLCBkKDIsICdjb2xsYXBzZWQnKSwgZCgzLCAnaGlkZGVuJyldKTtcblxuXHRcdFx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUoW2ZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUoMSkhXSk7XG5cblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyKDEsIDYsIHRydWUpLCByKDIsIDUsIHRydWUpLCByM10pO1xuXHRcdFx0YXNzZXJ0RGVjb3JhdGlvbnMoZm9sZGluZ01vZGVsLCBbZCgxLCAnY29sbGFwc2VkJyksIGQoMiwgJ2hpZGRlbicpLCBkKDMsICdoaWRkZW4nKV0pO1xuXG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKHJhbmdlcyk7XG5cblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyKDEsIDYsIHRydWUpLCByKDIsIDUsIHRydWUpLCByM10pO1xuXHRcdFx0YXNzZXJ0RGVjb3JhdGlvbnMoZm9sZGluZ01vZGVsLCBbZCgxLCAnY29sbGFwc2VkJyksIGQoMiwgJ2hpZGRlbicpLCBkKDMsICdoaWRkZW4nKV0pO1xuXG5cdFx0XHRmb2xkaW5nTW9kZWwudG9nZ2xlQ29sbGFwc2VTdGF0ZShbZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZSgxKSEsIGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUoMykhXSk7XG5cblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyMSwgcigyLCA1LCB0cnVlKSwgcigzLCA0LCB0cnVlKV0pO1xuXHRcdFx0YXNzZXJ0RGVjb3JhdGlvbnMoZm9sZGluZ01vZGVsLCBbZCgxLCAnZXhwYW5kZWQnKSwgZCgyLCAnY29sbGFwc2VkJyksIGQoMywgJ2hpZGRlbicpXSk7XG5cblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByKDIsIDUsIHRydWUpLCByKDMsIDQsIHRydWUpXSk7XG5cdFx0XHRhc3NlcnREZWNvcmF0aW9ucyhmb2xkaW5nTW9kZWwsIFtkKDEsICdleHBhbmRlZCcpLCBkKDIsICdjb2xsYXBzZWQnKSwgZCgzLCAnaGlkZGVuJyldKTtcblxuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0fSk7XG5cblx0dGVzdCgnZm9sZCBqdW1waW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0LyogMSovXHQnY2xhc3MgQSB7Jyxcblx0XHRcdC8qIDIqL1x0JyAgdm9pZCBmb28oKSB7Jyxcblx0XHRcdC8qIDMqL1x0JyAgICBpZiAoMSkgeycsXG5cdFx0XHQvKiA0Ki9cdCcgICAgICBhKCk7Jyxcblx0XHRcdC8qIDUqL1x0JyAgICB9IGVsc2UgaWYgKDIpIHsnLFxuXHRcdFx0LyogNiovXHQnICAgICAgaWYgKHRydWUpIHsnLFxuXHRcdFx0LyogNyovXHQnICAgICAgICBiKCk7Jyxcblx0XHRcdC8qIDgqL1x0JyAgICAgIH0nLFxuXHRcdFx0LyogOSovXHQnICAgIH0gZWxzZSB7Jyxcblx0XHRcdC8qIDEwKi9cdCcgICAgICBjKCk7Jyxcblx0XHRcdC8qIDExKi9cdCcgICAgfScsXG5cdFx0XHQvKiAxMiovXHQnICB9Jyxcblx0XHRcdC8qIDEzKi9cdCd9J1xuXHRcdF07XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IGNvbXB1dGVSYW5nZXModGV4dE1vZGVsLCBmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUocmFuZ2VzKTtcblxuXHRcdFx0Y29uc3QgcjEgPSByKDEsIDEyLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoMiwgMTEsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHIzID0gcigzLCA0LCBmYWxzZSk7XG5cdFx0XHRjb25zdCByNCA9IHIoNSwgOCwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgcjUgPSByKDYsIDcsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHI2ID0gcig5LCAxMCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMiwgcjMsIHI0LCByNSwgcjZdKTtcblxuXHRcdFx0Ly8gVGVzdCBqdW1wIHRvIHBhcmVudC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQYXJlbnRGb2xkTGluZSg3LCBmb2xkaW5nTW9kZWwpLCA2KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQYXJlbnRGb2xkTGluZSg2LCBmb2xkaW5nTW9kZWwpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQYXJlbnRGb2xkTGluZSg1LCBmb2xkaW5nTW9kZWwpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQYXJlbnRGb2xkTGluZSgyLCBmb2xkaW5nTW9kZWwpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQYXJlbnRGb2xkTGluZSgxLCBmb2xkaW5nTW9kZWwpLCBudWxsKTtcblxuXHRcdFx0Ly8gVGVzdCBqdW1wIHRvIHByZXZpb3VzLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByZXZpb3VzRm9sZExpbmUoMTAsIGZvbGRpbmdNb2RlbCksIDkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByZXZpb3VzRm9sZExpbmUoOSwgZm9sZGluZ01vZGVsKSwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJldmlvdXNGb2xkTGluZSg1LCBmb2xkaW5nTW9kZWwpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcmV2aW91c0ZvbGRMaW5lKDMsIGZvbGRpbmdNb2RlbCksIG51bGwpO1xuXHRcdFx0Ly8gVGVzdCB3aGVuIG5vdCBvbiBhIGZvbGRpbmcgcmVnaW9uIHN0YXJ0IGxpbmUuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJldmlvdXNGb2xkTGluZSg0LCBmb2xkaW5nTW9kZWwpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcmV2aW91c0ZvbGRMaW5lKDcsIGZvbGRpbmdNb2RlbCksIDYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByZXZpb3VzRm9sZExpbmUoOCwgZm9sZGluZ01vZGVsKSwgNik7XG5cblx0XHRcdC8vIFRlc3QganVtcCB0byBuZXh0LlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE5leHRGb2xkTGluZSgzLCBmb2xkaW5nTW9kZWwpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXROZXh0Rm9sZExpbmUoNSwgZm9sZGluZ01vZGVsKSwgOSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TmV4dEZvbGRMaW5lKDksIGZvbGRpbmdNb2RlbCksIG51bGwpO1xuXHRcdFx0Ly8gVGVzdCB3aGVuIG5vdCBvbiBhIGZvbGRpbmcgcmVnaW9uIHN0YXJ0IGxpbmUuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TmV4dEZvbGRMaW5lKDQsIGZvbGRpbmdNb2RlbCksIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE5leHRGb2xkTGluZSg3LCBmb2xkaW5nTW9kZWwpLCA5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXROZXh0Rm9sZExpbmUoOCwgZm9sZGluZ01vZGVsKSwgOSk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0fSk7XG5cblx0dGVzdCgnZm9sZCBqdW1waW5nIGlzc3VlICMxMjk1MDMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHQvKiAxKi9cdCcnLFxuXHRcdFx0LyogMiovXHQnaWYgVHJ1ZTonLFxuXHRcdFx0LyogMyovXHQnICBwcmludCgxKScsXG5cdFx0XHQvKiA0Ki9cdCdpZiBUcnVlOicsXG5cdFx0XHQvKiA1Ki9cdCcgIHByaW50KDEpJyxcblx0XHRcdC8qIDYqL1x0Jydcblx0XHRdO1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gbmV3IEZvbGRpbmdNb2RlbCh0ZXh0TW9kZWwsIG5ldyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyKHRleHRNb2RlbCkpO1xuXG5cdFx0XHRjb25zdCByYW5nZXMgPSBjb21wdXRlUmFuZ2VzKHRleHRNb2RlbCwgZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKHJhbmdlcyk7XG5cblx0XHRcdGNvbnN0IHIxID0gcigyLCAzLCBmYWxzZSk7XG5cdFx0XHRjb25zdCByMiA9IHIoNCwgNiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IxLCByMl0pO1xuXG5cdFx0XHQvLyBUZXN0IGp1bXAgdG8gbmV4dC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXROZXh0Rm9sZExpbmUoMSwgZm9sZGluZ01vZGVsKSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TmV4dEZvbGRMaW5lKDIsIGZvbGRpbmdNb2RlbCksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE5leHRGb2xkTGluZSgzLCBmb2xkaW5nTW9kZWwpLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXROZXh0Rm9sZExpbmUoNCwgZm9sZGluZ01vZGVsKSwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TmV4dEZvbGRMaW5lKDUsIGZvbGRpbmdNb2RlbCksIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE5leHRGb2xkTGluZSg2LCBmb2xkaW5nTW9kZWwpLCBudWxsKTtcblxuXHRcdFx0Ly8gVGVzdCBqdW1wIHRvIHByZXZpb3VzLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByZXZpb3VzRm9sZExpbmUoMSwgZm9sZGluZ01vZGVsKSwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJldmlvdXNGb2xkTGluZSgyLCBmb2xkaW5nTW9kZWwpLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcmV2aW91c0ZvbGRMaW5lKDMsIGZvbGRpbmdNb2RlbCksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByZXZpb3VzRm9sZExpbmUoNCwgZm9sZGluZ01vZGVsKSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJldmlvdXNGb2xkTGluZSg1LCBmb2xkaW5nTW9kZWwpLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcmV2aW91c0ZvbGRMaW5lKDYsIGZvbGRpbmdNb2RlbCksIDQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlTWFudWFsUmFuZ2VzIC0gY3Vyc29yIG9uIG1hbnVhbCByYW5nZSByZW1vdmVzIGlubmVybW9zdCBvbmx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdC8qIDEqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogMiovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDMqL1x0JyAgICBpZiAodHJ1ZSkgeycsXG5cdFx0LyogNCovXHQnICAgICAgcmV0dXJuOycsXG5cdFx0LyogNSovXHQnICAgIH0nLFxuXHRcdC8qIDYqL1x0JyAgfScsXG5cdFx0LyogNyovXHQnfSddO1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gbmV3IEZvbGRpbmdNb2RlbCh0ZXh0TW9kZWwsIG5ldyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyKHRleHRNb2RlbCkpO1xuXG5cdFx0XHQvLyBTZXQgdXAgcmFuZ2VzOiBvdXRlciBwcm92aWRlciByYW5nZSArIHR3byBuZXN0ZWQgbWFudWFsIHJhbmdlc1xuXHRcdFx0Y29uc3QgcmFuZ2VzOiBGb2xkUmFuZ2VbXSA9IFtcblx0XHRcdFx0eyBzdGFydExpbmVOdW1iZXI6IDEsIGVuZExpbmVOdW1iZXI6IDYsIHR5cGU6IHVuZGVmaW5lZCwgaXNDb2xsYXBzZWQ6IGZhbHNlLCBzb3VyY2U6IEZvbGRTb3VyY2UucHJvdmlkZXIgfSxcblx0XHRcdFx0eyBzdGFydExpbmVOdW1iZXI6IDIsIGVuZExpbmVOdW1iZXI6IDUsIHR5cGU6IHVuZGVmaW5lZCwgaXNDb2xsYXBzZWQ6IGZhbHNlLCBzb3VyY2U6IEZvbGRTb3VyY2UudXNlckRlZmluZWQgfSxcblx0XHRcdFx0eyBzdGFydExpbmVOdW1iZXI6IDMsIGVuZExpbmVOdW1iZXI6IDQsIHR5cGU6IHVuZGVmaW5lZCwgaXNDb2xsYXBzZWQ6IGZhbHNlLCBzb3VyY2U6IEZvbGRTb3VyY2UudXNlckRlZmluZWQgfSxcblx0XHRcdF07XG5cdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKEZvbGRpbmdSZWdpb25zLmZyb21Gb2xkUmFuZ2VzKHJhbmdlcykpO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IoMSwgNiksIHIoMiwgNSksIHIoMywgNCldKTtcblxuXHRcdFx0Ly8gQ3Vyc29yIG9uIGxpbmUgNCAoaW5zaWRlIGlubmVybW9zdCBtYW51YWwgcmFuZ2UgMy00KTogc2hvdWxkIHJlbW92ZSBvbmx5IDMtNFxuXHRcdFx0Zm9sZGluZ01vZGVsLnJlbW92ZU1hbnVhbFJhbmdlcyhbbmV3IFJhbmdlKDQsIDEsIDQsIDEpXSk7XG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcigxLCA2KSwgcigyLCA1KV0pO1xuXG5cdFx0XHQvLyBDdXJzb3Igb24gbGluZSAzIChpbnNpZGUgcmVtYWluaW5nIG1hbnVhbCByYW5nZSAyLTUpOiBzaG91bGQgcmVtb3ZlIG9ubHkgMi01XG5cdFx0XHRmb2xkaW5nTW9kZWwucmVtb3ZlTWFudWFsUmFuZ2VzKFtuZXcgUmFuZ2UoMywgMSwgMywgMSldKTtcblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyKDEsIDYpXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVNYW51YWxSYW5nZXMgLSBjdXJzb3Igc2tpcHMgcHJvdmlkZXIgcmFuZ2VzIHRvIHJlbW92ZSBuZWFyZXN0IG1hbnVhbCByYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHQvKiAxKi9cdCdjbGFzcyBBIHsnLFxuXHRcdC8qIDIqL1x0JyAgdm9pZCBmb28oKSB7Jyxcblx0XHQvKiAzKi9cdCcgICAgcmV0dXJuOycsXG5cdFx0LyogNCovXHQnICB9Jyxcblx0XHQvKiA1Ki9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cdFx0XHRjb25zdCByYW5nZXM6IEZvbGRSYW5nZVtdID0gW1xuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMSwgZW5kTGluZU51bWJlcjogNSwgdHlwZTogdW5kZWZpbmVkLCBpc0NvbGxhcHNlZDogZmFsc2UsIHNvdXJjZTogRm9sZFNvdXJjZS51c2VyRGVmaW5lZCB9LFxuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMiwgZW5kTGluZU51bWJlcjogNCwgdHlwZTogdW5kZWZpbmVkLCBpc0NvbGxhcHNlZDogZmFsc2UsIHNvdXJjZTogRm9sZFNvdXJjZS5wcm92aWRlciB9LFxuXHRcdFx0XTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUoRm9sZGluZ1JlZ2lvbnMuZnJvbUZvbGRSYW5nZXMocmFuZ2VzKSk7XG5cblx0XHRcdGZvbGRpbmdNb2RlbC5yZW1vdmVNYW51YWxSYW5nZXMoW25ldyBSYW5nZSgzLCAxLCAzLCAxKV0pO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IoMiwgNCldKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZU1hbnVhbFJhbmdlcyAtIGN1cnNvciBub3Qgb24gbWFudWFsIHJhbmdlIHJlbW92ZXMgYWxsIG1hbnVhbCByYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0LyogMSovXHQnLy8gaGVhZGVyJyxcblx0XHQvKiAyKi9cdCdjbGFzcyBBIHsnLFxuXHRcdC8qIDMqL1x0JyAgdm9pZCBmb28oKSB7Jyxcblx0XHQvKiA0Ki9cdCcgIH0nLFxuXHRcdC8qIDUqL1x0J30nLFxuXHRcdC8qIDYqL1x0Jy8vIGZvb3RlciddO1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gbmV3IEZvbGRpbmdNb2RlbCh0ZXh0TW9kZWwsIG5ldyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyKHRleHRNb2RlbCkpO1xuXG5cdFx0XHQvLyBQcm92aWRlciByYW5nZSBhdCAyLTQsIG1hbnVhbCByYW5nZSBhdCAzLTRcblx0XHRcdGNvbnN0IHJhbmdlczogRm9sZFJhbmdlW10gPSBbXG5cdFx0XHRcdHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBlbmRMaW5lTnVtYmVyOiA0LCB0eXBlOiB1bmRlZmluZWQsIGlzQ29sbGFwc2VkOiBmYWxzZSwgc291cmNlOiBGb2xkU291cmNlLnByb3ZpZGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRMaW5lTnVtYmVyOiAzLCBlbmRMaW5lTnVtYmVyOiA0LCB0eXBlOiB1bmRlZmluZWQsIGlzQ29sbGFwc2VkOiBmYWxzZSwgc291cmNlOiBGb2xkU291cmNlLnVzZXJEZWZpbmVkIH0sXG5cdFx0XHRdO1xuXHRcdFx0Zm9sZGluZ01vZGVsLnVwZGF0ZShGb2xkaW5nUmVnaW9ucy5mcm9tRm9sZFJhbmdlcyhyYW5nZXMpKTtcblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyKDIsIDQpLCByKDMsIDQpXSk7XG5cblx0XHRcdC8vIEEgc2luZ2xlLWxpbmUgc2VsZWN0aW9uIG91dHNpZGUgbWFudWFsIHJhbmdlcyBzaG91bGQgcHJlc2VydmUgdGhlbVxuXHRcdFx0Zm9sZGluZ01vZGVsLnJlbW92ZU1hbnVhbFJhbmdlcyhbbmV3IFJhbmdlKDYsIDEsIDYsIDIpXSk7XG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcigyLCA0KSwgcigzLCA0KV0pO1xuXG5cdFx0XHQvLyBDdXJzb3Igb24gbGluZSA2IChub3QgaW5zaWRlIGFueSBtYW51YWwgcmFuZ2UpOiBzaG91bGQgcmVtb3ZlIGFsbCBtYW51YWwgcmFuZ2VzXG5cdFx0XHRmb2xkaW5nTW9kZWwucmVtb3ZlTWFudWFsUmFuZ2VzKFtuZXcgUmFuZ2UoNiwgMSwgNiwgMSldKTtcblx0XHRcdGFzc2VydFJhbmdlcyhmb2xkaW5nTW9kZWwsIFtyKDIsIDQpXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVNYW51YWxSYW5nZXMgLSBzaW5nbGUtbGluZSBzZWxlY3Rpb24gcmVtb3ZlcyBhbGwgaW50ZXJzZWN0aW5nIG1hbnVhbCByYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0LyogMSovXHQnY2xhc3MgQSB7Jyxcblx0XHQvKiAyKi9cdCcgIHZvaWQgZm9vKCkgeycsXG5cdFx0LyogMyovXHQnICAgIGlmICh0cnVlKSB7Jyxcblx0XHQvKiA0Ki9cdCcgICAgICByZXR1cm47Jyxcblx0XHQvKiA1Ki9cdCcgICAgfScsXG5cdFx0LyogNiovXHQnICB9Jyxcblx0XHQvKiA3Ki9cdCd9J107XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGluZXMuam9pbignXFxuJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKHRleHRNb2RlbCwgbmV3IFRlc3REZWNvcmF0aW9uUHJvdmlkZXIodGV4dE1vZGVsKSk7XG5cdFx0XHRjb25zdCByYW5nZXM6IEZvbGRSYW5nZVtdID0gW1xuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMSwgZW5kTGluZU51bWJlcjogNiwgdHlwZTogdW5kZWZpbmVkLCBpc0NvbGxhcHNlZDogZmFsc2UsIHNvdXJjZTogRm9sZFNvdXJjZS5wcm92aWRlciB9LFxuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMiwgZW5kTGluZU51bWJlcjogNSwgdHlwZTogdW5kZWZpbmVkLCBpc0NvbGxhcHNlZDogZmFsc2UsIHNvdXJjZTogRm9sZFNvdXJjZS51c2VyRGVmaW5lZCB9LFxuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMywgZW5kTGluZU51bWJlcjogNCwgdHlwZTogdW5kZWZpbmVkLCBpc0NvbGxhcHNlZDogZmFsc2UsIHNvdXJjZTogRm9sZFNvdXJjZS51c2VyRGVmaW5lZCB9LFxuXHRcdFx0XTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUoRm9sZGluZ1JlZ2lvbnMuZnJvbUZvbGRSYW5nZXMocmFuZ2VzKSk7XG5cblx0XHRcdGZvbGRpbmdNb2RlbC5yZW1vdmVNYW51YWxSYW5nZXMoW25ldyBSYW5nZSg0LCAxLCA0LCAyKV0pO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzKGZvbGRpbmdNb2RlbCwgW3IoMSwgNildKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZU1hbnVhbFJhbmdlcyAtIHNlbGVjdGlvbiByYW5nZSByZW1vdmVzIGludGVyc2VjdGluZyBtYW51YWwgcmFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdC8qIDEqL1x0J2NsYXNzIEEgeycsXG5cdFx0LyogMiovXHQnICB2b2lkIGZvbygpIHsnLFxuXHRcdC8qIDMqL1x0JyAgfScsXG5cdFx0LyogNCovXHQnICB2b2lkIGJhcigpIHsnLFxuXHRcdC8qIDUqL1x0JyAgfScsXG5cdFx0LyogNiovXHQnfSddO1xuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gbmV3IEZvbGRpbmdNb2RlbCh0ZXh0TW9kZWwsIG5ldyBUZXN0RGVjb3JhdGlvblByb3ZpZGVyKHRleHRNb2RlbCkpO1xuXG5cdFx0XHRjb25zdCByYW5nZXM6IEZvbGRSYW5nZVtdID0gW1xuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMSwgZW5kTGluZU51bWJlcjogNSwgdHlwZTogdW5kZWZpbmVkLCBpc0NvbGxhcHNlZDogZmFsc2UsIHNvdXJjZTogRm9sZFNvdXJjZS5wcm92aWRlciB9LFxuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMiwgZW5kTGluZU51bWJlcjogMywgdHlwZTogdW5kZWZpbmVkLCBpc0NvbGxhcHNlZDogZmFsc2UsIHNvdXJjZTogRm9sZFNvdXJjZS51c2VyRGVmaW5lZCB9LFxuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogNCwgZW5kTGluZU51bWJlcjogNSwgdHlwZTogdW5kZWZpbmVkLCBpc0NvbGxhcHNlZDogZmFsc2UsIHNvdXJjZTogRm9sZFNvdXJjZS51c2VyRGVmaW5lZCB9LFxuXHRcdFx0XTtcblx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGUoRm9sZGluZ1JlZ2lvbnMuZnJvbUZvbGRSYW5nZXMocmFuZ2VzKSk7XG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcigxLCA1KSwgcigyLCAzKSwgcig0LCA1KV0pO1xuXG5cdFx0XHQvLyBTZWxlY3Rpb24gc3Bhbm5pbmcgbGluZXMgMi0zOiByZW1vdmVzIG9ubHkgdGhlIGZpcnN0IG1hbnVhbCByYW5nZVxuXHRcdFx0Zm9sZGluZ01vZGVsLnJlbW92ZU1hbnVhbFJhbmdlcyhbbmV3IFJhbmdlKDIsIDEsIDMsIDEpXSk7XG5cdFx0XHRhc3NlcnRSYW5nZXMoZm9sZGluZ01vZGVsLCBbcigxLCA1KSwgcig0LCA1KV0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBc0QsOEJBQThCO0FBQ3BGLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsY0FBYyxpQkFBaUIsbUJBQW1CLHFCQUFxQix5QkFBeUIsa0NBQWtDLHlCQUF5Qiw0QkFBNEIsMEJBQTBCLDBCQUEwQjtBQUNwUCxTQUF3QixnQkFBMkIsa0JBQWtCO0FBQ3JFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJB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
